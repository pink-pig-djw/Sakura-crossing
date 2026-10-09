import * as THREE from 'three';

// Geometry accumulator. Every primitive is written straight into flat arrays
// (position / normal / color / uv / pattern) so the whole town can be merged
// into a handful of chunked meshes. UVs are in meters and world aligned, so
// procedural patterns (siding, tiles, blocks ...) line up across pieces.

const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _t = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Color();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

const colorCache = new Map();
export function col(hex) {
  if (hex && hex.isColor) return hex;
  let c = colorCache.get(hex);
  if (!c) {
    c = new THREE.Color(hex);
    colorCache.set(hex, c);
  }
  return c;
}

// Pattern ids understood by the toon shader (see shaders/toon.js).
export const PAT = {
  NONE: 0,
  SIDING: 1,
  BOARDS: 2,
  KAWARA: 3,
  BLOCK: 4,
  BRICK: 5,
  ASPHALT: 6,
  CONCRETE: 7,
  SAND: 8,
  GRASS: 9,
  CORRUGATED: 10,
  LATTICE: 11,
  SEAM: 12,
  STONE: 13,
  GRAVEL: 14,
  PLANKS: 15,
  TILE: 16,
  BARK: 17,
  SLATE: 18,
  STRIPES: 19, // yellow/black safety stripes
  DIRT: 20,
  METAL: 21,
  PAVING: 22,
  TATAMI: 23,
  ROCK: 24,
  SHINGLE: 25,
  LEAVES: 26, // clipped hedge / shrub leaves
};

export class MeshBuilder {
  constructor() {
    this.pos = [];
    this.nor = [];
    this.col = [];
    this.uv = [];
    this.pat = [];
    this.idx = [];
    this.count = 0;
    this.matrix = new THREE.Matrix4();
    this.nmat = new THREE.Matrix3();
    this.identity = true;
    this.stack = [];
  }

  get empty() {
    return this.idx.length === 0;
  }

  push(m) {
    this.stack.push(this.matrix.clone());
    this.matrix.multiply(m);
    this.nmat.getNormalMatrix(this.matrix);
    this.identity = false;
  }

  pushTRS(x, y, z, ry = 0, s = 1) {
    _q.setFromAxisAngle(UP, ry);
    _s.set(s, s, s);
    _p.set(x, y, z);
    _m.compose(_p, _q, _s);
    this.push(_m);
  }

  pop() {
    this.matrix.copy(this.stack.pop());
    this.nmat.getNormalMatrix(this.matrix);
    this.identity = this.stack.length === 0;
  }

  // Low level: add a vertex given in local space; returns its index.
  vtx(x, y, z, nx, ny, nz, c, u, v, p) {
    if (this.identity) {
      this.pos.push(x, y, z);
      this.nor.push(nx, ny, nz);
    } else {
      _v.set(x, y, z).applyMatrix4(this.matrix);
      _n.set(nx, ny, nz).applyMatrix3(this.nmat).normalize();
      this.pos.push(_v.x, _v.y, _v.z);
      this.nor.push(_n.x, _n.y, _n.z);
    }
    this.col.push(c.r, c.g, c.b);
    this.uv.push(u, v);
    this.pat.push(p);
    return this.count++;
  }

  // world-space position of last pushed vertex (helper for uv mapping)
  lastWorld(target) {
    const i = (this.count - 1) * 3;
    return target.set(this.pos[i], this.pos[i + 1], this.pos[i + 2]);
  }

  // Quad from 4 local points (counter-clockwise when seen from the front).
  // UVs are computed in world meters from the face orientation.
  quad(a, b, c, d, color, pattern = 0, opts = {}) {
    const cc = col(color);
    _t.subVectors(b, a);
    _b.subVectors(d, a);
    _n.crossVectors(_t, _b).normalize();
    if (opts.flip) _n.negate();
    const nx = _n.x, ny = _n.y, nz = _n.z;
    const pts = [a, b, c, d];
    const base = this.count;
    const shadeTop = opts.top !== undefined ? col(opts.top) : null;
    for (let i = 0; i < 4; i++) {
      const p = pts[i];
      let cl = cc;
      if (opts.vc) cl = col(opts.vc[i]);
      else if (shadeTop && i >= 2) cl = shadeTop;
      const uvp = opts.uvs ? opts.uvs[i] : null;
      const idx = this.vtx(p.x, p.y, p.z, nx, ny, nz, cl, 0, 0, pattern);
      if (uvp) {
        this.uv[idx * 2] = uvp[0];
        this.uv[idx * 2 + 1] = uvp[1];
      }
    }
    if (!opts.uvs) this._autoUV(base, 4);
    if (opts.flip) this.idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
    else this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    if (opts.double) this.idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
    return this;
  }

  // Quad guaranteed to face away from `center` (local space): avoids winding mistakes
  // on closed shapes such as car cabins.
  quadOut(a, b, c, d, center, color, pattern = 0, opts = {}) {
    _t.subVectors(b, a);
    _b.subVectors(d, a);
    _n.crossVectors(_t, _b);
    const fx = (a.x + b.x + c.x + d.x) / 4 - center.x;
    const fy = (a.y + b.y + c.y + d.y) / 4 - center.y;
    const fz = (a.z + b.z + c.z + d.z) / 4 - center.z;
    if (_n.x * fx + _n.y * fy + _n.z * fz < 0) {
      const uv = opts.uvs ? [opts.uvs[1], opts.uvs[0], opts.uvs[3], opts.uvs[2]] : undefined;
      return this.quad(b, a, d, c, color, pattern, { ...opts, uvs: uv });
    }
    return this.quad(a, b, c, d, color, pattern, opts);
  }

  tri(a, b, c, color, pattern = 0, opts = {}) {
    const cc = col(color);
    _t.subVectors(b, a);
    _b.subVectors(c, a);
    _n.crossVectors(_t, _b).normalize();
    const base = this.count;
    for (const p of [a, b, c]) this.vtx(p.x, p.y, p.z, _n.x, _n.y, _n.z, cc, 0, 0, pattern);
    this._autoUV(base, 3);
    this.idx.push(base, base + 1, base + 2);
    if (opts.double) this.idx.push(base, base + 2, base + 1);
    return this;
  }

  // Assign world-meter UVs to the last `n` vertices based on their normal.
  _autoUV(base, n) {
    for (let i = base; i < base + n; i++) {
      const px = this.pos[i * 3], py = this.pos[i * 3 + 1], pz = this.pos[i * 3 + 2];
      const nx = this.nor[i * 3], ny = this.nor[i * 3 + 1], nz = this.nor[i * 3 + 2];
      let u, v;
      if (Math.abs(ny) > 0.7) {
        u = px;
        v = pz;
      } else {
        // horizontal tangent = up x n
        const tx = nz, tz = -nx;
        const tl = Math.hypot(tx, tz) || 1;
        u = (px * tx + pz * tz) / tl;
        v = py;
      }
      this.uv[i * 2] = u;
      this.uv[i * 2 + 1] = v;
    }
  }

  // Axis aligned (in local space) box, optionally rotated around Y.
  // o.color, o.pattern, o.ry, o.ao (bottom darkening 0..1), o.top (top face color),
  // o.skip: string of faces to skip among 'xXyYzZ' (lower = negative side)
  box(cx, cy, cz, sx, sy, sz, o = {}) {
    const color = col(o.color ?? 0xcccccc);
    const pattern = o.pattern ?? 0;
    const hx = sx / 2, hy = sy / 2, hz = sz / 2;
    const ry = o.ry || 0;
    const cs = Math.cos(ry), sn = Math.sin(ry);
    const skip = o.skip || '';
    const ao = o.ao ?? 0;
    const topColor = o.top !== undefined ? col(o.top) : color;
    const sideBottom = ao > 0 ? _c.copy(color).multiplyScalar(1 - ao).clone() : color;
    const L = (x, y, z, out) => out.set(cx + x * cs + z * sn, cy + y, cz - x * sn + z * cs);
    const faces = [
      // key, normal(local), corners (local) ccw from outside
      ['X', [1, 0, 0], [[hx, -hy, hz], [hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz]]],
      ['x', [-1, 0, 0], [[-hx, -hy, -hz], [-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz]]],
      ['Y', [0, 1, 0], [[-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz], [-hx, hy, -hz]]],
      ['y', [0, -1, 0], [[-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz], [-hx, -hy, hz]]],
      ['Z', [0, 0, 1], [[-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]]],
      ['z', [0, 0, -1], [[hx, -hy, -hz], [-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz]]],
    ];
    const tmp = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    for (const [key, nrm, corners] of faces) {
      if (skip.includes(key)) continue;
      const nx = nrm[0] * cs + nrm[2] * sn;
      const nz = -nrm[0] * sn + nrm[2] * cs;
      const ny = nrm[1];
      const base = this.count;
      for (let i = 0; i < 4; i++) {
        const c = corners[i];
        L(c[0], c[1], c[2], tmp[i]);
        let cl = color;
        if (key === 'Y') cl = topColor;
        else if (key !== 'y' && c[1] < 0) cl = sideBottom;
        this.vtx(tmp[i].x, tmp[i].y, tmp[i].z, nx, ny, nz, cl, 0, 0, pattern);
      }
      this._autoUV(base, 4);
      this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    return this;
  }

  // Box defined by min/max corners (local axis aligned).
  boxMM(x0, y0, z0, x1, y1, z1, o = {}) {
    return this.box((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0), o);
  }

  // Box spanning between two points in XZ (a beam / wall segment), y from y0 to y1.
  wall(x0, z0, x1, z1, y0, y1, thick, o = {}) {
    const dx = x1 - x0, dz = z1 - z0;
    const len = Math.hypot(dx, dz);
    const ry = Math.atan2(-dz, dx);
    return this.box((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, len, y1 - y0, thick, { ...o, ry });
  }

  // Thick slab from a top quad (a,b,c,d ccw from above) extruded down by t.
  slab(a, b, c, d, t, color, pattern = 0, o = {}) {
    const down = new THREE.Vector3(0, -t, 0);
    if (o.along) down.copy(o.along).multiplyScalar(-t);
    const a2 = a.clone().add(down), b2 = b.clone().add(down), c2 = c.clone().add(down), d2 = d.clone().add(down);
    const edge = o.edge !== undefined ? o.edge : color;
    const under = o.under !== undefined ? o.under : color;
    this.quad(a, b, c, d, color, pattern, { uvs: o.uvs });
    this.quad(d2, c2, b2, a2, under, o.underPattern ?? 0);
    this.quad(a2, b2, b, a, edge, 0);
    this.quad(b2, c2, c, b, edge, 0);
    this.quad(c2, d2, d, c, edge, 0);
    this.quad(d2, a2, a, d, edge, 0);
    return this;
  }

  // Vertical cylinder / cone frustum.
  cyl(x, y, z, r0, r1, h, segs, color, pattern = 0, o = {}) {
    const c0 = col(color);
    const cTop = o.top !== undefined ? col(o.top) : c0;
    const cBot = o.ao ? _c.copy(c0).multiplyScalar(1 - o.ao).clone() : c0;
    const base = this.count;
    const slope = (r0 - r1) / h;
    const nl = Math.hypot(1, slope);
    const a0 = o.phase || 0;
    for (let i = 0; i <= segs; i++) {
      const a = a0 + (i / segs) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      const nx = ca / nl, nz = sa / nl, ny = slope / nl;
      this.vtx(x + ca * r0, y, z + sa * r0, nx, ny, nz, cBot, (i / segs) * Math.PI * 2 * r0, y, pattern);
      this.vtx(x + ca * r1, y + h, z + sa * r1, nx, ny, nz, c0, (i / segs) * Math.PI * 2 * r1, y + h, pattern);
    }
    for (let i = 0; i < segs; i++) {
      const a = base + i * 2;
      this.idx.push(a, a + 1, a + 3, a, a + 3, a + 2);
    }
    if (o.caps !== false) {
      if (r1 > 0.001) {
        const ct = this.vtx(x, y + h, z, 0, 1, 0, cTop, x, z, pattern);
        const s0 = this.count;
        for (let i = 0; i <= segs; i++) {
          const a = a0 + (i / segs) * Math.PI * 2;
          this.vtx(x + Math.cos(a) * r1, y + h, z + Math.sin(a) * r1, 0, 1, 0, cTop, x + Math.cos(a) * r1, z + Math.sin(a) * r1, pattern);
        }
        for (let i = 0; i < segs; i++) this.idx.push(ct, s0 + i + 1, s0 + i);
      }
      if (o.bottomCap && r0 > 0.001) {
        const cb = this.vtx(x, y, z, 0, -1, 0, c0, x, z, pattern);
        const s0 = this.count;
        for (let i = 0; i <= segs; i++) {
          const a = a0 + (i / segs) * Math.PI * 2;
          this.vtx(x + Math.cos(a) * r0, y, z + Math.sin(a) * r0, 0, -1, 0, c0, 0, 0, pattern);
        }
        for (let i = 0; i < segs; i++) this.idx.push(cb, s0 + i, s0 + i + 1);
      }
    }
    return this;
  }

  // Cylinder between two arbitrary points.
  rod(p0, p1, r0, r1, segs, color, pattern = 0, o = {}) {
    const dir = new THREE.Vector3().subVectors(p1, p0);
    const len = dir.length();
    if (len < 1e-5) return this;
    dir.divideScalar(len);
    const q = new THREE.Quaternion().setFromUnitVectors(UP, dir);
    const m = new THREE.Matrix4().compose(p0, q, new THREE.Vector3(1, 1, 1));
    this.push(m);
    this.cyl(0, 0, 0, r0, r1, len, segs, color, pattern, o);
    this.pop();
    return this;
  }

  // Generalized tube through points with per-point radius (branches, wires, rails ...).
  tube(points, radii, segs, color, pattern = 0, o = {}) {
    const c0 = col(color);
    const n = points.length;
    if (n < 2) return this;
    const base = this.count;
    const T = new THREE.Vector3();
    let N = new THREE.Vector3();
    const B = new THREE.Vector3();
    // initial normal
    T.subVectors(points[1], points[0]).normalize();
    N.set(0, 1, 0);
    if (Math.abs(T.dot(N)) > 0.9) N.set(1, 0, 0);
    B.crossVectors(T, N).normalize();
    N.crossVectors(B, T).normalize();
    let vacc = 0;
    for (let i = 0; i < n; i++) {
      const p = points[i];
      const Tn = new THREE.Vector3();
      if (i === 0) Tn.subVectors(points[1], points[0]);
      else if (i === n - 1) Tn.subVectors(points[n - 1], points[n - 2]);
      else Tn.subVectors(points[i + 1], points[i - 1]);
      Tn.normalize();
      // parallel transport
      const axis = new THREE.Vector3().crossVectors(T, Tn);
      const al = axis.length();
      if (al > 1e-6) {
        axis.divideScalar(al);
        const ang = Math.acos(THREE.MathUtils.clamp(T.dot(Tn), -1, 1));
        const rq = new THREE.Quaternion().setFromAxisAngle(axis, ang);
        N.applyQuaternion(rq);
        B.applyQuaternion(rq);
      }
      T.copy(Tn);
      if (i > 0) vacc += p.distanceTo(points[i - 1]);
      const r = Array.isArray(radii) ? radii[i] : radii;
      const cl = o.colors ? col(o.colors[i]) : c0;
      for (let j = 0; j <= segs; j++) {
        const a = (j / segs) * Math.PI * 2;
        const ca = Math.cos(a), sa = Math.sin(a);
        const nx = N.x * ca + B.x * sa, ny = N.y * ca + B.y * sa, nz = N.z * ca + B.z * sa;
        this.vtx(p.x + nx * r, p.y + ny * r, p.z + nz * r, nx, ny, nz, cl, (j / segs) * 6.2832 * Math.max(r, 0.05), vacc, pattern);
      }
    }
    const ring = segs + 1;
    for (let i = 0; i < n - 1; i++) {
      for (let j = 0; j < segs; j++) {
        const a = base + i * ring + j;
        const b = a + ring;
        this.idx.push(a, b + 1, b, a, a + 1, b + 1);
      }
    }
    return this;
  }

  // Add an existing three.js geometry, transformed by matrix m (or the current matrix).
  geom(g, m, color, pattern = 0, o = {}) {
    const pos = g.attributes.position;
    const nor = g.attributes.normal;
    const gcol = g.attributes.color;
    const c0 = col(color);
    if (m) this.push(m);
    const base = this.count;
    const tmpC = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      let cl = c0;
      if (gcol && o.useVertexColor) cl = tmpC.setRGB(gcol.getX(i), gcol.getY(i), gcol.getZ(i));
      else if (o.gradient) {
        // vertical gradient in local y: [yMin,yMax,colorBottom]
        const y = pos.getY(i);
        const t = THREE.MathUtils.clamp((y - o.gradient[0]) / (o.gradient[1] - o.gradient[0]), 0, 1);
        cl = tmpC.copy(col(o.gradient[2])).lerp(c0, t);
      }
      this.vtx(pos.getX(i), pos.getY(i), pos.getZ(i), nor ? nor.getX(i) : 0, nor ? nor.getY(i) : 1, nor ? nor.getZ(i) : 0, cl, 0, 0, pattern);
    }
    this._autoUV(base, pos.count);
    if (g.index) {
      const ia = g.index.array;
      for (let i = 0; i < ia.length; i++) this.idx.push(base + ia[i]);
    } else {
      for (let i = 0; i < pos.count; i++) this.idx.push(base + i);
    }
    if (m) this.pop();
    return this;
  }

  // Extruded polygon (points as [x,z] pairs in local space, ccw from above), from y0 to y1.
  prism(points, y0, y1, color, pattern = 0, o = {}) {
    const contour = points.map((p) => new THREE.Vector2(p[0], p[1]));
    let pts = contour;
    if (THREE.ShapeUtils.isClockWise(pts)) pts = pts.slice().reverse();
    const tris = THREE.ShapeUtils.triangulateShape(pts, []);
    const topC = o.top !== undefined ? o.top : color;
    // top
    if (!o.noTop) {
      const base = this.count;
      for (const p of pts) this.vtx(p.x, y1, p.y, 0, 1, 0, col(topC), 0, 0, o.topPattern ?? pattern);
      this._autoUV(base, pts.length);
      for (const t of tris) this.idx.push(base + t[0], base + t[2], base + t[1]);
    }
    if (o.bottom) {
      const base = this.count;
      for (const p of pts) this.vtx(p.x, y0, p.y, 0, -1, 0, col(color), 0, 0, pattern);
      this._autoUV(base, pts.length);
      for (const t of tris) this.idx.push(base + t[0], base + t[1], base + t[2]);
    }
    if (!o.noSides) {
      const n = pts.length;
      const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(), D = new THREE.Vector3();
      for (let i = 0; i < n; i++) {
        const p = pts[i], q = pts[(i + 1) % n];
        A.set(q.x, y0, q.y);
        B.set(p.x, y0, p.y);
        C.set(p.x, y1, p.y);
        D.set(q.x, y1, q.y);
        this.quad(A, B, C, D, color, pattern);
      }
    }
    return this;
  }

  toGeometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('pattern', new THREE.Float32BufferAttribute(this.pat, 1));
    const IndexArray = this.count > 65535 ? Uint32Array : Uint16Array;
    g.setIndex(new THREE.BufferAttribute(new IndexArray(this.idx), 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

// Spatially chunked collection of builders keyed by material.
export class ChunkedBuilders {
  constructor(chunkSize = 48) {
    this.size = chunkSize;
    this.map = new Map();
  }
  get(material, x, z) {
    const cx = Math.floor(x / this.size);
    const cz = Math.floor(z / this.size);
    const key = material + '|' + cx + '|' + cz;
    let b = this.map.get(key);
    if (!b) {
      b = new MeshBuilder();
      b.material = material;
      this.map.set(key, b);
      // non-shadow-casting companion batch for small details in the same chunk
      if (material === 'toon') b.detail = this.get('detail', x, z);
    }
    return b;
  }
  // Build meshes; materials: { key: { material, castShadow, receiveShadow, renderOrder } }
  build(materials, parent) {
    const meshes = [];
    for (const [key, b] of this.map) {
      if (b.empty) continue;
      const spec = materials[b.material];
      if (!spec) {
        console.warn('No material for', b.material);
        continue;
      }
      const mesh = new THREE.Mesh(b.toGeometry(), spec.material);
      mesh.castShadow = spec.castShadow ?? true;
      mesh.receiveShadow = spec.receiveShadow ?? true;
      if (spec.renderOrder) mesh.renderOrder = spec.renderOrder;
      if (spec.customDepthMaterial) mesh.customDepthMaterial = spec.customDepthMaterial;
      mesh.matrixAutoUpdate = false;
      mesh.name = key;
      parent.add(mesh);
      meshes.push(mesh);
    }
    this.map.clear();
    return meshes;
  }
}
