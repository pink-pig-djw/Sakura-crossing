import * as THREE from 'three';
import { PAT, col } from '../core/builder.js';

// Building kit: reusable pieces built in a local frame. A `Kit` owns the
// builders of one chunk (toon / window / sign) and keeps their transform
// stacks in sync so every piece can be authored in house-local coordinates.

const V = (x, y, z) => new THREE.Vector3(x, y, z);

export class Kit {
  constructor(ctx, x, z) {
    this.ctx = ctx;
    this.t = ctx.builders.get('toon', x, z);
    this.w = ctx.builders.get('window', x, z);
    this.s = ctx.builders.get('sign', x, z);
    this.s2 = ctx.builders.get('sign2', x, z); // second atlas page (newer district, interiors)
    this.e = ctx.builders.get('emissive', x, z);
    this.d = this.t.detail;
    this.all = [this.t, this.w, this.s, this.s2, this.e, this.d];
    this.depth = 0;
  }
  begin(ox, oy, oz, ry = 0) {
    for (const b of this.all) b.pushTRS(ox, oy, oz, ry);
    this.depth++;
  }
  end() {
    for (const b of this.all) b.pop();
    this.depth--;
  }
}

// A vertical wall face: origin = bottom-left seen from outside, r = right, n = outward normal.
export function boxFaces(cx, y0, cz, w, d) {
  return {
    front: { o: V(cx + w / 2, y0, cz - d / 2), r: V(-1, 0, 0), n: V(0, 0, -1), len: w },
    back: { o: V(cx - w / 2, y0, cz + d / 2), r: V(1, 0, 0), n: V(0, 0, 1), len: w },
    left: { o: V(cx - w / 2, y0, cz - d / 2), r: V(0, 0, 1), n: V(-1, 0, 0), len: d },
    right: { o: V(cx + w / 2, y0, cz + d / 2), r: V(0, 0, -1), n: V(1, 0, 0), len: d },
  };
}

// point on a face: s along, y up, out along normal
export function fp(face, s, y, out = 0) {
  return V(face.o.x + face.r.x * s + face.n.x * out, face.o.y + y, face.o.z + face.r.z * s + face.n.z * out);
}

// Box attached to a face: centered at s, bottom y, size along face w, height h, depth (along normal) dd, offset out (front surface position)
export function faceBox(b, face, s, y, w, h, dd, out, color, pattern = 0, o = {}) {
  const c = fp(face, s, y + h / 2, out - dd / 2);
  const alongX = Math.abs(face.r.x) > 0.5;
  b.box(c.x, c.y, c.z, alongX ? w : dd, h, alongX ? dd : w, { color, pattern, ...o });
}

// Quad on a face (flat), with optional explicit uvs
export function faceQuad(b, face, s, y, w, h, out, color, pattern = 0, uvs = null) {
  const bl = fp(face, s - w / 2, y, out);
  const br = fp(face, s + w / 2, y, out);
  const tr = fp(face, s + w / 2, y + h, out);
  const tl = fp(face, s - w / 2, y + h, out);
  b.quad(bl, br, tr, tl, color, pattern, uvs ? { uvs } : {});
}

export function signOnFace(kit, face, s, y, w, h, out, uv, emissive = 0, back = null) {
  const uvs = [[uv.u0, uv.v0], [uv.u1, uv.v0], [uv.u1, uv.v1], [uv.u0, uv.v1]];
  faceQuad(uv.page === 1 ? kit.s2 : kit.s, face, s, y, w, h, out, 0xffffff, emissive, uvs);
  if (back) faceBox(kit.t, face, s, y - 0.03, w + 0.06, h + 0.06, 0.06, out - 0.005, back);
}

// ---------------------------------------------------------------------------
// windows & doors
// ---------------------------------------------------------------------------
export const FRAME = { alu: 0x4d5157, silver: 0xa9adb2, white: 0xe9e8e3, wood: 0x5f4636, dark: 0x34363a };

export function windowUnit(kit, face, s, y, w, h, o = {}) {
  const rng = o.rng;
  const frame = o.frame ?? FRAME.alu;
  const seed = o.seed ?? (rng ? rng.int(0, 255) : 77);
  const uvs = [[0, 0], [1, 0], [1, 1], [0, 1]];
  faceQuad(kit.w, face, s, y, w, h, 0.012, 0xffffff, seed, uvs);
  const f = 0.055;
  const t = kit.d;
  faceBox(t, face, s, y + h, w + f * 2, f, 0.09, 0.05, frame); // head
  faceBox(t, face, s, y - f * 1.2, w + f * 2 + 0.06, f * 1.2, 0.14, 0.09, frame); // sill
  faceBox(t, face, s - w / 2 - f / 2, y, f, h, 0.09, 0.05, frame);
  faceBox(t, face, s + w / 2 + f / 2, y, f, h, 0.09, 0.05, frame);
  if (w > 1.1 && !o.fixed) faceBox(t, face, s + 0.03, y, f * 0.8, h, 0.05, 0.035, frame); // sliding sashes meet
  if (o.grille) {
    const n = Math.max(3, Math.round(w / 0.11));
    for (let i = 1; i < n; i++) faceBox(t, face, s - w / 2 + (w * i) / n, y, 0.022, h, 0.03, 0.09, o.grilleColor ?? 0xb7babd);
    faceBox(t, face, s, y + h * 0.5, w, 0.03, 0.03, 0.09, o.grilleColor ?? 0xb7babd);
  }
  if (o.shutterBox) {
    faceBox(t, face, s, y + h + f, w + 0.22, 0.24, 0.2, 0.2, o.shutterColor ?? frame, PAT.METAL);
  }
  if (o.shutterCase) {
    // 戸袋: case beside the window holding rain shutters
    faceBox(t, face, s + w / 2 + 0.38, y - 0.02, 0.62, h + 0.08, 0.16, 0.16, o.shutterColor ?? 0x8b8e92, PAT.CORRUGATED);
  }
  if (o.awning) {
    faceBox(t, face, s, y + h + 0.12, w + 0.3, 0.05, 0.45, 0.45, o.awning);
  }
  if (o.planter) {
    faceBox(t, face, s, y - 0.32, w * 0.8, 0.22, 0.22, 0.32, 0x8a6e52, PAT.PLANKS);
    for (let i = 0; i < 4; i++) {
      const p = fp(face, s - w * 0.32 + (w * 0.64 * i) / 3, y - 0.05, 0.22);
      t.box(p.x, p.y, p.z, 0.16, 0.12, 0.16, { color: i % 2 ? 0xe86a7a : 0xf2d14e });
    }
  }
}

export function door(kit, face, s, y, w, h, color, o = {}) {
  faceBox(kit.t, face, s, y, w, h, 0.06, 0.02, color, o.pattern ?? PAT.NONE);
  const t = kit.d;
  // frame
  faceBox(t, face, s, y + h, w + 0.14, 0.07, 0.1, 0.06, o.frame ?? FRAME.alu);
  faceBox(t, face, s - w / 2 - 0.035, y, 0.07, h, 0.1, 0.06, o.frame ?? FRAME.alu);
  faceBox(t, face, s + w / 2 + 0.035, y, 0.07, h, 0.1, 0.06, o.frame ?? FRAME.alu);
  // handle
  faceBox(t, face, s + w * 0.36, y + h * 0.45, 0.04, 0.22, 0.05, 0.07, 0xc9c2b0);
  if (o.glass) faceQuad(kit.w, face, s - w * 0.15, y + h * 0.55, w * 0.2, h * 0.35, 0.055, 0xffffff, (o.seed ?? 30) | 0, [[0, 0], [1, 0], [1, 1], [0, 1]]);
  // step
  faceBox(t, face, s, y - 0.18, w + 0.6, 0.18, 0.6, 0.6, 0xbdb9b0, PAT.CONCRETE);
  if (o.canopy) {
    faceBox(t, face, s, y + h + 0.25, w + 0.9, 0.07, 0.95, 0.95, o.canopy);
    faceBox(t, face, s, y + h + 0.32, w + 0.9, 0.04, 0.95, 0.95, 0xdcdcd8);
  }
  if (o.lamp) {
    const p = fp(face, s - w / 2 - 0.3, y + h - 0.15, 0.08);
    t.box(p.x, p.y, p.z, 0.14, 0.22, 0.14, { color: 0x3b3b3b });
    const q = fp(face, s - w / 2 - 0.3, y + h - 0.16, 0.16);
    kit.e.box(q.x, q.y, q.z, 0.1, 0.14, 0.02, { color: 0xffe2a8 });
  }
}

// Sliding lattice (koshi) door for old houses / wagashi shops
export function koshiDoor(kit, face, s, y, w, h, wood = 0x6a4b35) {
  const t = kit.d;
  faceQuad(kit.w, face, s, y, w, h, 0.012, 0xffffff, 230, [[0, 0], [1, 0], [1, 1], [0, 1]]);
  const n = Math.round(w / 0.06);
  for (let i = 0; i <= n; i++) faceBox(t, face, s - w / 2 + (w * i) / n, y, 0.022, h, 0.035, 0.05, wood);
  faceBox(t, face, s, y + h, w + 0.1, 0.08, 0.1, 0.07, wood);
  faceBox(t, face, s, y, w + 0.1, 0.06, 0.1, 0.07, wood);
  faceBox(t, face, s, y + h * 0.33, w, 0.04, 0.05, 0.06, wood);
}

// ---------------------------------------------------------------------------
// roofs
// ---------------------------------------------------------------------------
// Gable roof over a box; ridge along local x. Returns ridge height.
export function gableRoof(b, cx, cz, w, d, yTop, o) {
  const slope = o.slope ?? 0.45;
  const ox = o.ox ?? 0.45, oz = o.oz ?? 0.5;
  const th = o.th ?? 0.14;
  const yR = yTop + (d / 2) * slope;
  const yE = yTop - oz * slope;
  const x0 = cx - w / 2 - ox, x1 = cx + w / 2 + ox;
  const zE0 = cz - d / 2 - oz, zE1 = cz + d / 2 + oz;
  const L = Math.hypot(d / 2 + oz, yR - yE);
  const pat = o.pattern ?? PAT.SLATE;
  const edge = o.fascia ?? 0xe8e6e0;
  b.slab(V(x0, yE, zE0), V(x0, yR, cz), V(x1, yR, cz), V(x1, yE, zE0), th, o.color, pat, {
    edge,
    under: o.soffit ?? 0xd8d4cc,
    uvs: [[x0, 0], [x0, L], [x1, L], [x1, 0]],
  });
  b.slab(V(x1, yE, zE1), V(x1, yR, cz), V(x0, yR, cz), V(x0, yE, zE1), th, o.color, pat, {
    edge,
    under: o.soffit ?? 0xd8d4cc,
    uvs: [[x1, 0], [x1, L], [x0, L], [x0, 0]],
  });
  // gable walls
  const wc = o.wallColor, wp = o.wallPattern ?? 0;
  b.tri(V(cx - w / 2, yTop, cz - d / 2), V(cx - w / 2, yTop, cz + d / 2), V(cx - w / 2, yR, cz), wc, wp);
  b.tri(V(cx + w / 2, yTop, cz + d / 2), V(cx + w / 2, yTop, cz - d / 2), V(cx + w / 2, yR, cz), wc, wp);
  // ridge cap
  b.box(cx, yR + 0.02, cz, w + ox * 2 + 0.05, 0.12, 0.26, { color: o.ridge ?? new THREE.Color(o.color).multiplyScalar(0.8) });
  return yR;
}

// Hip roof (寄棟). If w < d the ridge runs along z.
export function hipRoof(b, cx, cz, w, d, yTop, o) {
  if (w < d) {
    const m = new THREE.Matrix4().makeTranslation(cx, 0, cz).multiply(new THREE.Matrix4().makeRotationY(Math.PI / 2));
    b.push(m);
    const r = hipRoof(b, 0, 0, d, w, yTop, o);
    b.pop();
    return r;
  }
  const slope = o.slope ?? 0.45;
  const ov = o.ov ?? 0.5;
  const th = o.th ?? 0.14;
  const yR = yTop + (d / 2) * slope;
  const yE = yTop - ov * slope;
  const x0 = cx - w / 2 - ov, x1 = cx + w / 2 + ov, z0 = cz - d / 2 - ov, z1 = cz + d / 2 + ov;
  const r0 = cx - (w - d) / 2, r1 = cx + (w - d) / 2;
  const E1 = V(x0, yE, z0), E2 = V(x1, yE, z0), E3 = V(x1, yE, z1), E4 = V(x0, yE, z1);
  const R1 = V(r0, yR, cz), R2 = V(r1, yR, cz);
  const L = Math.hypot(d / 2 + ov, yR - yE);
  const pat = o.pattern ?? PAT.SLATE;
  const edge = o.fascia ?? 0xe8e6e0;
  const sof = o.soffit ?? 0xd8d4cc;
  b.slab(E1, R1, R2, E2, th, o.color, pat, { edge, under: sof, uvs: [[x0, 0], [r0, L], [r1, L], [x1, 0]] });
  b.slab(E3, R2, R1, E4, th, o.color, pat, { edge, under: sof, uvs: [[x1, 0], [r1, L], [r0, L], [x0, 0]] });
  b.slab(E4, R1, R1.clone(), E1, th, o.color, pat, { edge, under: sof, uvs: [[z1, 0], [cz, L], [cz, L], [z0, 0]] });
  b.slab(E2, R2, R2.clone(), E3, th, o.color, pat, { edge, under: sof, uvs: [[z0, 0], [cz, L], [cz, L], [z1, 0]] });
  const rc = o.ridge ?? new THREE.Color(o.color).multiplyScalar(0.8);
  if (r1 - r0 > 0.05) b.box(cx, yR + 0.02, cz, r1 - r0 + 0.2, 0.12, 0.24, { color: rc });
  // hip ridges
  for (const [A, B] of [[E1, R1], [E4, R1], [E2, R2], [E3, R2]]) {
    b.rod(A.clone().add(V(0, 0.03, 0)), B.clone().add(V(0, 0.03, 0)), 0.07, 0.07, 4, rc);
  }
  return yR;
}

// Single-slope lean-to (片流れ / 下屋), high side at z0 (wall), sloping toward +z
export function leanTo(b, x0, x1, z0, z1, yHigh, slope, o) {
  const yLow = yHigh - (z1 - z0) * slope;
  const L = Math.hypot(z1 - z0, yHigh - yLow);
  b.slab(V(x1, yLow, z1), V(x1, yHigh, z0), V(x0, yHigh, z0), V(x0, yLow, z1), o.th ?? 0.1, o.color, o.pattern ?? PAT.SLATE, {
    edge: o.fascia ?? 0xe0ded8,
    uvs: [[x1, 0], [x1, L], [x0, L], [x0, 0]],
  });
}

// ---------------------------------------------------------------------------
// exterior props
// ---------------------------------------------------------------------------
export function acUnit(b0, x, y, z, ry = 0) {
  const b = b0.detail || b0;
  b.pushTRS(x, y, z, ry);
  b.box(0, 0.3, 0, 0.8, 0.58, 0.3, { color: 0xe9e8e2 });
  b.box(-0.1, 0.32, 0.155, 0.46, 0.46, 0.02, { color: 0x6c7076 });
  b.cyl(-0.1, 0.32, 0.165, 0.2, 0.2, 0.01, 10, 0x9ea2a6, 0, { caps: false });
  b.box(0, 0.02, 0, 0.7, 0.06, 0.32, { color: 0x77787a });
  b.pop();
}

export function potPlant(b0, x, y, z, rng, scale = 1) {
  const b = b0.detail || b0;
  const pc = rng.pick([0xb6643f, 0x8f7a68, 0xd8d2c4, 0x6f8a95]);
  const r = rng.range(0.14, 0.24) * scale;
  b.cyl(x, y, z, r * 0.8, r, r * 1.6, 8, pc, 0, { top: 0x5a4632 });
  const g = rng.pick([0x5f9a4c, 0x4f8a48, 0x76a957]);
  const s = new THREE.IcosahedronGeometry(r * 1.4, 0);
  const m = new THREE.Matrix4().compose(V(x, y + r * 1.6 + r * 0.9, z), new THREE.Quaternion(), V(1, 0.85, 1));
  b.geom(s, m, g);
  if (rng.chance(0.4)) {
    const fl = rng.pick([0xf06a8a, 0xffd94a, 0xffffff, 0xb07ae0, 0xff8a4a]);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + rng.next();
      b.box(x + Math.cos(a) * r * 0.9, y + r * 3.0, z + Math.sin(a) * r * 0.9, 0.08 * scale, 0.07 * scale, 0.08 * scale, { color: fl });
    }
  }
}

export function mailbox(b0, x, y, z, ry, color = 0xd6d2c8) {
  const b = b0.detail || b0;
  b.pushTRS(x, y, z, ry);
  b.box(0, 0.5, 0, 0.06, 1.0, 0.06, { color: 0x555555 });
  b.box(0, 1.05, 0, 0.36, 0.28, 0.2, { color });
  b.box(0, 1.15, -0.105, 0.22, 0.02, 0.01, { color: 0x333333 });
  b.pop();
}

export function bicycle(b0, x, y, z, ry, color = 0xd8d8d0) {
  const b = b0.detail || b0;
  b.pushTRS(x, y, z, ry);
  const wheel = (wx) => {
    const g = new THREE.TorusGeometry(0.31, 0.022, 4, 14);
    const m = new THREE.Matrix4().compose(V(wx, 0.33, 0), new THREE.Quaternion(), V(1, 1, 1));
    b.geom(g, m, 0x2b2b2b);
    b.rod(V(wx, 0.33, -0.02), V(wx, 0.33, 0.02), 0.04, 0.04, 6, 0x9a9a9a);
  };
  wheel(-0.52);
  wheel(0.52);
  const c = col(color);
  b.rod(V(-0.52, 0.33, 0), V(-0.05, 0.36, 0), 0.02, 0.02, 4, c);
  b.rod(V(-0.05, 0.36, 0), V(0.42, 0.72, 0), 0.022, 0.022, 4, c);
  b.rod(V(-0.12, 0.8, 0), V(-0.05, 0.36, 0), 0.022, 0.022, 4, c);
  b.rod(V(0.52, 0.33, 0), V(0.42, 0.88, 0), 0.02, 0.02, 4, c);
  b.box(-0.14, 0.84, 0, 0.24, 0.06, 0.12, { color: 0x3b2f2a }); // saddle
  b.rod(V(0.42, 0.9, -0.28), V(0.42, 0.9, 0.28), 0.016, 0.016, 4, 0x8a8a8a);
  b.box(0.62, 0.86, 0, 0.3, 0.2, 0.34, { color: 0xb8bcc0 }); // basket
  b.box(-0.6, 0.62, 0, 0.32, 0.03, 0.18, { color: 0x666666 }); // rear rack
  b.pop();
}

const CAR_COLORS = [0xf2f2ee, 0xd9dbdc, 0xbfc5ca, 0x9bc4c0, 0xe8d6a8, 0xf0c4c4, 0x8fb0d8, 0xc6a5a0, 0x5d6f7e, 0xe9ecef, 0x2f3f5a, 0xb8463e];
const CAR_SPECS = {
  // L, W, belt, roof, hood (front of cabin from the nose), windshield run, rear run, rear overhang
  kei: { L: 3.4, W: 1.48, belt: 0.98, roof: 1.7, hood: 0.62, ws: 0.48, rear: 0.1, rov: 0.06, nose: 0.82 },
  wagon: { L: 4.3, W: 1.7, belt: 0.98, roof: 1.62, hood: 0.95, ws: 0.62, rear: 0.22, rov: 0.08, nose: 0.86 },
  sedan: { L: 4.55, W: 1.76, belt: 0.92, roof: 1.42, hood: 1.15, ws: 0.62, rear: 0.5, rov: 0.95, nose: 0.82 },
};

// Small Japanese cars: kei car, compact wagon, sedan and the kei truck (軽トラ).
// Local frame: +x = forward, y = up, z = across. o.pitch / o.roll tilt the car on slopes.
export function car(kit, x, y, z, ry, rng, kind = null, o = {}) {
  const type = kind || rng.weighted([['kei', 5], ['wagon', 3], ['sedan', 1.5], ['truck', 2]]);
  const c = o.color ?? rng.pick(CAR_COLORS);
  const twoTone = type === 'kei' && rng.chance(0.35);
  kit.begin(x, y, z, ry);
  if (o.pitch || o.roll) {
    const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(o.roll || 0, 0, o.pitch || 0, 'XYZ'));
    for (const bb of kit.all) bb.push(m);
  }
  const b = kit.t;
  const d = kit.d;
  const spec = CAR_SPECS[type === 'truck' ? 'kei' : type];
  const L = spec.L, W = spec.W;
  const glass = (pts, center, seed = 236) => kit.w.quadOut(pts[0], pts[1], pts[2], pts[3], center, 0xffffff, seed, { uvs: [[0, 0], [1, 0], [1, 1], [0, 1]] });
  // wheels with hubcaps and dark arches
  const wx = L / 2 - (type === 'sedan' ? 0.85 : 0.62);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const g = new THREE.CylinderGeometry(0.28, 0.28, 0.19, 14);
      const m = new THREE.Matrix4().compose(V(sx * wx, 0.28, sz * (W / 2 - 0.1)), new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), Math.PI / 2), V(1, 1, 1));
      b.geom(g, m, 0x232327);
      const hub = new THREE.CylinderGeometry(0.15, 0.15, 0.02, 12);
      d.geom(hub, new THREE.Matrix4().compose(V(sx * wx, 0.28, sz * (W / 2 - 0.0)), new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), Math.PI / 2), V(1, 1, 1)), 0xb9bdc2);
      d.box(sx * wx, 0.5, sz * (W / 2 + 0.004), 0.74, 0.1, 0.012, { color: 0x2a2a2e });
    }
  }
  const lights = (frontX, rearX, yl) => {
    for (const s of [-1, 1]) {
      kit.e.box(frontX + 0.005, yl, s * (W / 2 - 0.2), 0.03, 0.13, 0.28, { color: 0xfff6e0 });
      d.box(rearX - 0.005, yl, s * (W / 2 - 0.16), 0.03, 0.17, 0.2, { color: 0xc8302c });
      d.box(frontX + 0.004, yl - 0.13, s * (W / 2 - 0.12), 0.02, 0.06, 0.12, { color: 0xf0a030 });
    }
    // grille, bumpers, plates
    d.box(frontX + 0.01, yl - 0.08, 0, 0.03, 0.16, W * 0.45, { color: 0x30323a });
    d.box(frontX + 0.03, 0.42, 0, 0.07, 0.14, W + 0.02, { color: 0x4a4b50 });
    d.box(rearX - 0.03, 0.42, 0, 0.07, 0.14, W + 0.02, { color: 0x4a4b50 });
    const plate = type === 'kei' || type === 'truck' ? 0xf2d043 : 0xf2f2ea;
    d.box(frontX + 0.07, 0.52, 0, 0.01, 0.13, 0.33, { color: plate });
    d.box(rearX - 0.07, 0.58, 0, 0.01, 0.13, 0.33, { color: plate });
  };

  if (type === 'truck') {
    // kei truck: tall cab over the front axle + flat bed with low sides
    const cab0 = L / 2 - 1.3, cab1 = L / 2;
    b.box((cab0 + cab1) / 2, 0.66, 0, cab1 - cab0, 0.68, W, { color: c, ao: 0.1 });
    const yb = 1.0, yr = 1.82;
    const center = V((cab0 + cab1) / 2, (yb + yr) / 2, 0);
    const B = [V(cab1 - 0.04, yb, -W / 2 + 0.02), V(cab1 - 0.04, yb, W / 2 - 0.02), V(cab0, yb, W / 2 - 0.02), V(cab0, yb, -W / 2 + 0.02)];
    const T = [V(cab1 - 0.22, yr, -W / 2 + 0.08), V(cab1 - 0.22, yr, W / 2 - 0.08), V(cab0 + 0.02, yr, W / 2 - 0.08), V(cab0 + 0.02, yr, -W / 2 + 0.08)];
    b.quadOut(B[0], B[1], T[1], T[0], center, c); // front
    b.quadOut(B[2], B[3], T[3], T[2], center, c); // back
    b.quadOut(B[1], B[2], T[2], T[1], center, c); // right
    b.quadOut(B[3], B[0], T[0], T[3], center, c); // left
    b.quadOut(T[0], T[1], T[2], T[3], center, c); // roof
    // windshield, side and back windows
    const lerp = (p, q, t) => p.clone().lerp(q, t);
    glass([lerp(B[0], T[0], 0.08).add(V(0.012, 0, 0.1)), lerp(B[1], T[1], 0.08).add(V(0.012, 0, -0.1)), lerp(B[1], T[1], 0.9).add(V(0.012, 0, -0.1)), lerp(B[0], T[0], 0.9).add(V(0.012, 0, 0.1))], center);
    for (const sz of [-1, 1]) {
      const zz = sz * (W / 2 - 0.02 + 0.012);
      glass([V(cab0 + 0.12, yb + 0.08, zz), V(cab1 - 0.3, yb + 0.08, zz), V(cab1 - 0.4, yr - 0.1, zz * 0.97), V(cab0 + 0.14, yr - 0.1, zz * 0.97)], center);
    }
    glass([V(cab0 - 0.012, yb + 0.25, -0.45), V(cab0 - 0.012, yb + 0.25, 0.45), V(cab0 - 0.012, yr - 0.15, 0.45), V(cab0 - 0.012, yr - 0.15, -0.45)], center);
    for (const sz of [-1, 1]) d.box(cab1 - 0.32, yb + 0.12, sz * (W / 2 + 0.08), 0.12, 0.14, 0.1, { color: 0x2a2a2e });
    // bed
    const bed0 = -L / 2, bed1 = cab0 - 0.06;
    b.box((bed0 + bed1) / 2, 0.6, 0, bed1 - bed0, 0.12, W, { color: 0x77797c });
    for (const sz of [-1, 1]) b.box((bed0 + bed1) / 2, 0.86, sz * (W / 2 - 0.03), bed1 - bed0, 0.4, 0.05, { color: c });
    b.box(bed0 + 0.03, 0.86, 0, 0.05, 0.4, W, { color: c });
    d.box(bed1 - 0.02, 1.25, 0, 0.05, 0.8, W - 0.1, { color: 0x6a6c70 });
    if (rng.chance(0.6)) d.box(bed0 + 0.8, 0.86, 0, 1.0, 0.4, 0.9, { color: rng.pick([0x6d8b4a, 0x2f5f9a, 0xc9b892]) });
    lights(cab1, bed0, 0.82);
  } else {
    const yb = spec.belt, yr = spec.roof;
    // lower body
    b.box(0, (0.3 + yb) / 2, 0, L, yb - 0.3, W, { color: c, ao: 0.14 });
    // hood slope (slightly lower at the nose)
    const xb1 = L / 2 - spec.hood, xb0 = -L / 2 + spec.rov;
    b.quadOut(V(L / 2, spec.nose, -W / 2 + 0.03), V(L / 2, spec.nose, W / 2 - 0.03), V(xb1, yb + 0.01, W / 2 - 0.03), V(xb1, yb + 0.01, -W / 2 + 0.03), V(0, 0, 0), c);
    if (type === 'sedan') b.quadOut(V(-L / 2, spec.nose + 0.05, -W / 2 + 0.03), V(-L / 2, spec.nose + 0.05, W / 2 - 0.03), V(xb0, yb + 0.01, W / 2 - 0.03), V(xb0, yb + 0.01, -W / 2 + 0.03), V(0, 0, 0), c);
    // cabin (greenhouse) as a closed tapered prism
    const xr1 = xb1 - spec.ws, xr0 = xb0 + spec.rear;
    const zb = W / 2 - 0.03, zr = W / 2 - 0.13;
    const B = [V(xb1, yb, -zb), V(xb1, yb, zb), V(xb0, yb, zb), V(xb0, yb, -zb)];
    const T = [V(xr1, yr, -zr), V(xr1, yr, zr), V(xr0, yr, zr), V(xr0, yr, -zr)];
    const center = V((xb0 + xb1) / 2, (yb + yr) / 2, 0);
    const roofC = twoTone ? 0x2c2d33 : c;
    b.quadOut(B[0], B[1], T[1], T[0], center, c);
    b.quadOut(B[2], B[3], T[3], T[2], center, c);
    b.quadOut(B[1], B[2], T[2], T[1], center, c);
    b.quadOut(B[3], B[0], T[0], T[3], center, c);
    b.quadOut(T[0], T[1], T[2], T[3], center, roofC);
    // glass on every face, leaving pillars around the edges
    const inset = (q, u0, u1, v0, v1, n) => {
      // q = [b0, b1, t1, t0] (bottom edge b0->b1, top edge t0->t1)
      const P = (u, v) => {
        const bot = q[0].clone().lerp(q[1], u);
        const top = q[3].clone().lerp(q[2], u);
        return bot.lerp(top, v).addScaledVector(n, 0.012);
      };
      return [P(u0, v0), P(u1, v0), P(u1, v1), P(u0, v1)];
    };
    const nrm = (q) => {
      const e1 = q[1].clone().sub(q[0]);
      const e2 = q[3].clone().sub(q[0]);
      const n = e1.cross(e2).normalize();
      const fc = q[0].clone().add(q[1]).add(q[2]).add(q[3]).multiplyScalar(0.25).sub(center);
      return n.dot(fc) < 0 ? n.negate() : n;
    };
    const front = [B[0], B[1], T[1], T[0]];
    const back = [B[3], B[2], T[2], T[3]];
    glass(inset(front, 0.07, 0.93, 0.06, 0.93, nrm(front)), center, 237);
    glass(inset(back, 0.12, 0.88, 0.12, 0.9, nrm(back)), center, 238);
    for (const side of [[B[3], B[0], T[0], T[3]], [B[1], B[2], T[2], T[1]]]) {
      const n = nrm(side);
      // two door windows with a B pillar between them
      glass(inset(side, 0.05, 0.47, 0.08, 0.9, n), center, 239);
      glass(inset(side, 0.53, 0.94, 0.08, 0.9, n), center, 239);
    }
    // door lines, handles and mirrors on both sides
    const doorX = [xb1 - 0.05, (xb0 + xb1) / 2 + 0.05, xb0 + 0.25];
    for (const sz of [-1, 1]) {
      const zz = sz * (W / 2 + 0.003);
      for (const dx of doorX) d.box(dx, (0.36 + yb) / 2, zz, 0.012, yb - 0.4, 0.008, { color: 0x3a3c42 });
      d.box(xb1 - 0.35, yb - 0.15, zz * 1.004, 0.14, 0.03, 0.012, { color: 0x9a9da2 });
      d.box((xb0 + xb1) / 2 - 0.2, yb - 0.15, zz * 1.004, 0.14, 0.03, 0.012, { color: 0x9a9da2 });
      d.box(xb1 - 0.05, yb + 0.12, sz * (W / 2 + 0.1), 0.12, 0.12, 0.16, { color: twoTone ? 0x2c2d33 : c });
    }
    lights(L / 2, -L / 2, spec.nose - 0.08);
  }
  if (o.pitch || o.roll) for (const bb of kit.all) bb.pop();
  kit.end();
  const sp = CAR_SPECS[type === 'truck' ? 'kei' : type];
  return { L: sp.L, W: sp.W, type };
}

// Concrete block wall segment between two points along the ground.
export function blockWall(b, x0, z0, x1, z1, yFn, h, o = {}) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const segs = Math.max(1, Math.ceil(len / 3));
  const color = o.color ?? 0xbab6ad;
  const pattern = o.pattern ?? PAT.BLOCK;
  for (let i = 0; i < segs; i++) {
    const t0 = i / segs, t1 = (i + 1) / segs;
    const ax = x0 + (x1 - x0) * t0, az = z0 + (z1 - z0) * t0;
    const bx = x0 + (x1 - x0) * t1, bz = z0 + (z1 - z0) * t1;
    const ya = yFn(ax, az), yb = yFn(bx, bz);
    const base = Math.min(ya, yb) - 0.25;
    const top = Math.max(ya, yb) + h;
    b.wall(ax, az, bx, bz, base, top, o.thick ?? 0.15, { color, pattern, ao: 0.18 });
    if (o.cap !== false) b.wall(ax, az, bx, bz, top, top + 0.06, (o.thick ?? 0.15) + 0.05, { color: o.capColor ?? 0xc9c6bd, pattern: PAT.CONCRETE });
  }
}

export function hedge(b, x0, z0, x1, z1, yFn, h, color = 0x5e9150) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const segs = Math.max(1, Math.ceil(len / 2.5));
  for (let i = 0; i < segs; i++) {
    const t0 = i / segs, t1 = (i + 1) / segs;
    const ax = x0 + (x1 - x0) * t0, az = z0 + (z1 - z0) * t0;
    const bx = x0 + (x1 - x0) * t1, bz = z0 + (z1 - z0) * t1;
    const y = Math.min(yFn(ax, az), yFn(bx, bz));
    b.wall(ax, az, bx, bz, y - 0.1, y + h, 0.6, { color, pattern: PAT.GRASS, ao: 0.25 });
  }
}

export function metalFence(b, x0, z0, x1, z1, yFn, h, color = 0xd8dcd8) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const n = Math.max(1, Math.ceil(len / 2));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
    const y = yFn(x, z);
    b.box(x, y + h / 2, z, 0.05, h, 0.05, { color });
    if (i < n) {
      const t2 = (i + 1) / n;
      const xb = x0 + (x1 - x0) * t2, zb = z0 + (z1 - z0) * t2;
      const yb = yFn(xb, zb);
      b.wall(x, z, xb, zb, Math.min(y, yb) + h - 0.06, Math.max(y, yb) + h, 0.04, { color });
      b.wall(x, z, xb, zb, Math.min(y, yb) + 0.1, Math.max(y, yb) + 0.14, 0.04, { color });
      // vertical bars (non shadow casting detail)
      const db = b.detail || b;
      const bars = Math.round(Math.hypot(xb - x, zb - z) / 0.16);
      for (let k = 1; k < bars; k++) {
        const tt = k / bars;
        const px = x + (xb - x) * tt, pz = z + (zb - z) * tt;
        const py = y + (yb - y) * tt;
        db.box(px, py + 0.1 + (h - 0.16) / 2, pz, 0.02, h - 0.16, 0.02, { color, skip: 'yY' });
      }
    }
  }
}

// Laundry pole with hanging clothes / futon on a balcony
export function laundry(b, x0, x1, y, z, rng) {
  b.rod(V(x0, y, z), V(x1, y, z), 0.015, 0.015, 4, 0xa0a4a8);
  const colors = [0xffffff, 0xf2d6d6, 0xbcd4ee, 0xf6e7a8, 0x9fc6a2, 0xe6e6ea, 0xf0b8a8, 0x7f9fcf];
  let x = x0 + 0.2;
  while (x < x1 - 0.3) {
    const w = rng.range(0.3, 0.6);
    const h = rng.range(0.35, 0.75);
    if (rng.chance(0.8)) b.box(x + w / 2, y - h / 2 - 0.02, z, w, h, 0.02, { color: rng.pick(colors), pattern: 0 });
    x += w + rng.range(0.05, 0.25);
  }
}

// Utility: kawara-tile ridge ornament (simple)
export function onigawara(b, x, y, z) {
  b.box(x, y + 0.15, z, 0.18, 0.4, 0.4, { color: 0x50555e });
}
