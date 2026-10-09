#!/usr/bin/env python3
"""Carry a body-shape tweak made in VRoid over to the character's other outfits.

  python3 tools/chars/transfer_shape.py before.vrm after.vrm outfit.vrm out.vrm

before / after: the same outfit exported before and after the change (e.g. a different bust
size). The difference between them is applied to another outfit of the same character:

- bone positions that moved (and the skins' inverse bind matrices of those bones),
- spring bone settings that changed (matched by joint name),
- the shape itself: every vertex of `before` that moved defines a displacement at its rest
  position; a vertex of the outfit takes the Gaussian-weighted average of the displacements
  around it (unmoved vertices count as zero, so the change fades out where it fades out in
  `after`). The clothes differ between outfits, but over the same spot of the body they
  move alike.

Only the meshes that changed between before and after (matched by name; VRoid merges the
body and clothes into one) are changed in the outfit: the face and the hair are left alone.
"""
import json
import struct
import sys

import numpy as np

SIGMA = 0.012  # m: how far a source vertex's displacement reaches
CUTOFF = 3 * SIGMA

CT = {5126: np.float32, 5123: np.uint16, 5125: np.uint32, 5121: np.uint8}
NC = {'SCALAR': 1, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}


def read_glb(path):
    b = open(path, 'rb').read()
    n = struct.unpack('<I', b[12:16])[0]
    j = json.loads(b[20:20 + n])
    m = struct.unpack('<I', b[20 + n:24 + n])[0]
    return j, bytearray(b[28 + n:28 + n + m])


def write_glb(path, j, bin_):
    js = json.dumps(j, separators=(',', ':'), ensure_ascii=False).encode()
    js += b' ' * ((4 - len(js) % 4) % 4)
    bin_ = bytes(bin_) + b'\0' * ((4 - len(bin_) % 4) % 4)
    with open(path, 'wb') as f:
        f.write(struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(bin_)))
        f.write(struct.pack('<II', len(js), 0x4E4F534A) + js)
        f.write(struct.pack('<II', len(bin_), 0x004E4942) + bin_)


def _span(j, i):
    a = j['accessors'][i]
    v = j['bufferViews'][a['bufferView']]
    dt = CT[a['componentType']]
    nc = NC[a['type']]
    isz = np.dtype(dt).itemsize * nc
    return a, v.get('byteOffset', 0) + a.get('byteOffset', 0), v.get('byteStride', 0) or isz, isz, dt, nc


def get(j, bin_, i):
    a, off, stride, isz, dt, nc = _span(j, i)
    assert 'sparse' not in a
    raw = np.frombuffer(bytes(bin_[off:off + stride * (a['count'] - 1) + isz]), dtype=np.uint8)
    rows = np.lib.stride_tricks.as_strided(raw, shape=(a['count'], isz), strides=(stride, 1))
    return np.frombuffer(rows.tobytes(), dtype=dt).reshape(a['count'], nc).astype(np.float64)


def put(j, bin_, i, values):
    a, off, stride, isz, dt, nc = _span(j, i)
    data = values.astype(dt)
    for k in range(a['count']):
        bin_[off + k * stride:off + k * stride + isz] = data[k].tobytes()
    if 'min' in a:
        a['min'] = values.min(0).tolist()
        a['max'] = values.max(0).tolist()


def quat_mat(q):
    x, y, z, w = q
    return np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                     [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                     [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])


def world_matrices(j):
    parent = {c: i for i, n in enumerate(j['nodes']) for c in n.get('children', [])}
    out = {}

    def w(i):
        if i not in out:
            n = j['nodes'][i]
            m = np.eye(4)
            m[:3, :3] = quat_mat(n.get('rotation', [0, 0, 0, 1])) * np.array(n.get('scale', [1, 1, 1]))
            m[:3, 3] = n.get('translation', [0, 0, 0])
            out[i] = w(parent[i]) @ m if i in parent else m
        return out[i]

    for i in range(len(j['nodes'])):
        w(i)
    return out


def main(before_path, after_path, target_path, out_path):
    jb, bb = read_glb(before_path)
    ja, ba = read_glb(after_path)
    jt, bt = read_glb(target_path)
    by_name = lambda j: {n.get('name'): i for i, n in enumerate(j['nodes'])}
    nb, na, nt = by_name(jb), by_name(ja), by_name(jt)

    # --- bones -----------------------------------------------------------------------------
    rest = {'translation': [0, 0, 0], 'rotation': [0, 0, 0, 1], 'scale': [1, 1, 1]}
    moved = []
    for name, i in nb.items():
        x, y = jb['nodes'][i], ja['nodes'][na[name]]
        for k, r in rest.items():
            u, v = np.array(x.get(k, r)), np.array(y.get(k, r))
            if np.abs(u - v).max() > 1e-7 and name in nt:
                jt['nodes'][nt[name]][k] = y.get(k, r)
                moved.append(name)
    moved = sorted(set(moved))
    print('bones moved:', moved)
    W = world_matrices(jt)
    for s in jt.get('skins', []):
        if 'inverseBindMatrices' not in s:
            continue
        ibm = get(jt, bt, s['inverseBindMatrices'])
        for k, node in enumerate(s['joints']):
            if jt['nodes'][node].get('name') in moved:
                ibm[k] = np.linalg.inv(W[node]).T.reshape(16)  # column-major
        put(jt, bt, s['inverseBindMatrices'], ibm)

    # --- spring bones ----------------------------------------------------------------------
    def joint_settings(j):
        out = {}
        for s in j['extensions'].get('VRMC_springBone', {}).get('springs', []):
            for jt_ in s['joints']:
                out[j['nodes'][jt_['node']]['name']] = jt_
        return out
    sb, sa, st = joint_settings(jb), joint_settings(ja), joint_settings(jt)
    for name, x in sb.items():
        y = sa.get(name)
        if not y or name not in st:
            continue
        for k, v in y.items():
            if k != 'node' and x.get(k) != v:
                st[name][k] = v
                print(f'spring {name}.{k} -> {v}')

    # --- shape -----------------------------------------------------------------------------
    src_p, src_d = [], []
    changed = set()  # meshes whose vertices moved (only those move in the outfit too)
    for mb, ma in zip(jb['meshes'], ja['meshes']):
        seen = set()
        for pb, pa in zip(mb['primitives'], ma['primitives']):
            ib, ia = pb['attributes']['POSITION'], pa['attributes']['POSITION']
            if ib in seen:
                continue
            seen.add(ib)
            p, q = get(jb, bb, ib), get(ja, ba, ia)
            d = q - p
            if np.abs(d).max() < 1e-6:
                continue
            changed.add(mb.get('name'))
            # the moved vertices and the still ones around them
            near = np.linalg.norm(d, axis=1) > 1e-6
            lo, hi = p[near].min(0) - CUTOFF, p[near].max(0) + CUTOFF
            box = np.all((p > lo) & (p < hi), axis=1)
            src_p.append(p[box])
            src_d.append(d[box])
    if src_p:
        src_p, src_d = np.concatenate(src_p), np.concatenate(src_d)
        lo, hi = src_p.min(0), src_p.max(0)
        print(f'shape change: {len(src_p)} source vertices, max {np.linalg.norm(src_d, axis=1).max() * 1000:.1f} mm')
        for mesh in jt['meshes']:
            if mesh.get('name') not in changed:
                continue
            done = set()
            for prim in mesh['primitives']:
                i = prim['attributes']['POSITION']
                if i in done:
                    continue
                done.add(i)
                p = get(jt, bt, i)
                inside = np.where(np.all((p > lo - CUTOFF) & (p < hi + CUTOFF), axis=1))[0]
                if not len(inside):
                    continue
                out = p.copy()
                for k0 in range(0, len(inside), 512):
                    idx = inside[k0:k0 + 512]
                    r2 = ((p[idx, None, :] - src_p[None, :, :]) ** 2).sum(-1)
                    w = np.exp(-r2 / (2 * SIGMA * SIGMA)) * (r2 < CUTOFF * CUTOFF)
                    ws = w.sum(1)
                    ok = ws > 1e-6
                    out[idx[ok]] += (w[ok] @ src_d) / ws[ok, None]
                n = int((np.linalg.norm(out - p, axis=1) > 1e-5).sum())
                if n:
                    put(jt, bt, i, out)
                    print(f'  {mesh.get("name")}: {n} vertices moved, max {np.linalg.norm(out - p, axis=1).max() * 1000:.1f} mm')
    write_glb(out_path, jt, bt)
    print('wrote', out_path)


if __name__ == '__main__':
    main(*sys.argv[1:5])
