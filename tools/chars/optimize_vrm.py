#!/usr/bin/env python3
"""Slim a VRoid-made VRM 1.0 model for the web.

The town renders characters with its own toon shader from the colour texture alone, so
every other image (normal, emissive, matcap, outline-width maps, the thumbnail) is
blanked; the face keeps only the morph targets that the VRM expressions use (and only
their positions). Colour textures are capped at 1024 px, opaque ones stored as JPEG.

  python3 tools/chars/optimize_vrm.py in.vrm out.vrm
"""
import io
import json
import struct
import sys

from PIL import Image

MAX_TEX = 1024


def read_glb(path):
    b = open(path, 'rb').read()
    n = struct.unpack('<I', b[12:16])[0]
    j = json.loads(b[20:20 + n])
    m = struct.unpack('<I', b[20 + n:24 + n])[0]
    return j, b[28 + n:28 + n + m]


def write_glb(path, j, bin_):
    js = json.dumps(j, separators=(',', ':'), ensure_ascii=False).encode()
    js += b' ' * ((4 - len(js) % 4) % 4)
    bin_ += b'\0' * ((4 - len(bin_) % 4) % 4)
    total = 12 + 8 + len(js) + 8 + len(bin_)
    with open(path, 'wb') as f:
        f.write(struct.pack('<III', 0x46546C67, 2, total))
        f.write(struct.pack('<II', len(js), 0x4E4F534A) + js)
        f.write(struct.pack('<II', len(bin_), 0x004E4942) + bin_)


def view_bytes(j, bin_, i):
    v = j['bufferViews'][i]
    o = v.get('byteOffset', 0)
    return bin_[o:o + v['byteLength']]


def encode_image(img):
    out = io.BytesIO()
    if img.mode == 'RGBA' and img.getextrema()[3][0] == 255:
        img = img.convert('RGB')  # alpha channel unused
    if img.mode == 'RGB' and max(img.size) > 64:
        img.save(out, 'JPEG', quality=92, subsampling=0, optimize=True)
        return out.getvalue(), 'image/jpeg'
    img.save(out, 'PNG', optimize=True)
    return out.getvalue(), 'image/png'


def main(src, dst):
    j, bin_ = read_glb(src)
    vrm = j['extensions']['VRMC_vrm']

    # --- morph targets: keep the ones the expressions bind, positions only -----------------
    binds = [b for e in vrm['expressions'].get('preset', {}).values() for b in e.get('morphTargetBinds', [])]
    binds += [b for e in vrm['expressions'].get('custom', {}).values() for b in e.get('morphTargetBinds', [])]
    keep_by_mesh = {}
    for b in binds:
        mesh = j['nodes'][b['node']]['mesh']
        keep_by_mesh.setdefault(mesh, set()).add(b['index'])
    remap_by_mesh = {}
    for mi, mesh in enumerate(j['meshes']):
        prims = mesh['primitives']
        if not prims[0].get('targets'):
            continue
        keep = sorted(keep_by_mesh.get(mi, set()))
        remap = {old: new for new, old in enumerate(keep)}
        remap_by_mesh[mi] = remap
        for p in prims:
            p['targets'] = [{'POSITION': p['targets'][k]['POSITION']} for k in keep]
            if not p['targets']:
                del p['targets']
        if 'weights' in mesh:
            mesh['weights'] = [mesh['weights'][k] for k in keep]
        names = (mesh.get('extras') or {}).get('targetNames')
        if names:
            mesh['extras']['targetNames'] = [names[k] for k in keep]
        for p in prims:
            names = (p.get('extras') or {}).get('targetNames')
            if names:
                p['extras']['targetNames'] = [names[k] for k in keep]
    for b in binds:
        b['index'] = remap_by_mesh[j['nodes'][b['node']]['mesh']][b['index']]

    # --- images ---------------------------------------------------------------------------
    colour = set()
    for m in j['materials']:
        t = m.get('pbrMetallicRoughness', {}).get('baseColorTexture')
        if t:
            colour.add(j['textures'][t['index']]['source'])
    new_images = []
    for i, im in enumerate(j['images']):
        data = view_bytes(j, bin_, im['bufferView'])
        img = Image.open(io.BytesIO(data))
        if i not in colour:
            img = Image.new('RGB', (4, 4), (0, 0, 0))
        else:
            img = img.convert('RGBA' if 'A' in img.getbands() else 'RGB')
            s = MAX_TEX / max(img.size)
            if s < 1:
                img = img.resize((max(1, round(img.size[0] * s)), max(1, round(img.size[1] * s))), Image.LANCZOS)
        new_images.append(encode_image(img))

    # --- rebuild accessors / buffer views ---------------------------------------------------
    used_acc = set()
    for mesh in j['meshes']:
        for p in mesh['primitives']:
            used_acc.update(p['attributes'].values())
            if 'indices' in p:
                used_acc.add(p['indices'])
            for t in p.get('targets', []):
                used_acc.update(t.values())
    for s in j.get('skins', []):
        if 'inverseBindMatrices' in s:
            used_acc.add(s['inverseBindMatrices'])
    for a in j.get('animations', []):
        for smp in a['samplers']:
            used_acc.update((smp['input'], smp['output']))
    acc_map = {}
    accessors = []
    for i, a in enumerate(j['accessors']):
        if i in used_acc:
            acc_map[i] = len(accessors)
            accessors.append(a)
    out = bytearray()
    views = []

    def add_view(data, src_view=None):
        while len(out) % 4:
            out.append(0)
        v = {'buffer': 0, 'byteOffset': len(out), 'byteLength': len(data)}
        if src_view is not None:
            for k in ('byteStride', 'target'):
                if k in src_view:
                    v[k] = src_view[k]
        out.extend(data)
        views.append(v)
        return len(views) - 1

    view_map = {}

    def remap_view(old):
        if old not in view_map:
            view_map[old] = add_view(view_bytes(j, bin_, old), j['bufferViews'][old])
        return view_map[old]

    for a in accessors:
        if 'bufferView' in a:
            a['bufferView'] = remap_view(a['bufferView'])
        sp = a.get('sparse')
        if sp:  # sparse morph targets keep their index / value views
            sp['indices']['bufferView'] = remap_view(sp['indices']['bufferView'])
            sp['values']['bufferView'] = remap_view(sp['values']['bufferView'])
    for im, (data, mime) in zip(j['images'], new_images):
        im['bufferView'] = add_view(data)
        im['mimeType'] = mime
    j['accessors'] = accessors
    j['bufferViews'] = views
    j['buffers'] = [{'byteLength': len(out)}]
    for mesh in j['meshes']:
        for p in mesh['primitives']:
            p['attributes'] = {k: acc_map[v] for k, v in p['attributes'].items()}
            if 'indices' in p:
                p['indices'] = acc_map[p['indices']]
            for t in p.get('targets', []):
                for k in t:
                    t[k] = acc_map[t[k]]
    for s in j.get('skins', []):
        if 'inverseBindMatrices' in s:
            s['inverseBindMatrices'] = acc_map[s['inverseBindMatrices']]
    for a in j.get('animations', []):
        for smp in a['samplers']:
            smp['input'], smp['output'] = acc_map[smp['input']], acc_map[smp['output']]
    write_glb(dst, j, bytes(out))
    print(f'{src} -> {dst}: {len(out) / 1e6:.2f} MB of data')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
