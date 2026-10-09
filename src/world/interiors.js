import * as THREE from 'three';
import { RNG } from '../core/rng.js';
import { PAT, MeshBuilder } from '../core/builder.js';
import { groundH, SUBWAY } from './layout.js';
import { Kit, signOnFace, gableRoof, bicycle } from './kit.js';
import { FONTS, drawBoard, drawVertical, fitText, roundRect } from '../render/atlas.js';
import { benchAt, bench } from './coast.js';
import { midrise, bladeSign, GROUND_SHOPS } from './commercial.js';
import { parkedCar } from './kit.js';
import { createRiverWaterMaterial } from '../render/materials.js';
import { shrub, AZALEA, GARDEN_FLOWERS } from './greenery.js';
import { roadSurfaceY } from './roads.js';

// Public places you can walk into: コンビニ, 喫茶, さくらモール, 市立図書館 — plus the
// Chuo Plaza around subway exit 1 and the karaoke building by exit 2. Interiors use
// the ceiling-lit interior material and clear glass, so they glow at night.

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ---------------------------------------------------------------------------
// primitives
// ---------------------------------------------------------------------------
// vertical rect on the plane z = c (axis 'x', spanning x) or x = c (axis 'z', spanning z), facing ±dir
function vrect(b, axis, c, a0, a1, y0, y1, dir, color, pattern = 0) {
  let p0, p1, p2, p3;
  if (axis === 'x') [p0, p1, p2, p3] = [V(a0, y0, c), V(a1, y0, c), V(a1, y1, c), V(a0, y1, c)];
  else [p0, p1, p2, p3] = [V(c, y0, a0), V(c, y0, a1), V(c, y1, a1), V(c, y1, a0)];
  const natural = axis === 'x' ? 1 : -1;
  if (natural === dir) b.quad(p0, p1, p2, p3, color, pattern);
  else b.quad(p1, p0, p3, p2, color, pattern);
}
// horizontal rect facing up (+1) or down (-1)
function hrect(b, x0, z0, x1, z1, y, up, color, pattern = 0) {
  const p0 = V(x0, y, z0), p1 = V(x1, y, z0), p2 = V(x1, y, z1), p3 = V(x0, y, z1);
  if (up > 0) b.quad(p0, p3, p2, p1, color, pattern);
  else b.quad(p0, p1, p2, p3, color, pattern);
}
// textured vertical rect on the interior sign material; `tile` repeats the texture every n meters
function vsign(ctx, axis, c, a0, a1, y0, y1, dir, uv, emissive = 0, tile = 0) {
  if (tile > 0 && a1 - a0 > tile * 1.4) {
    const n = Math.round((a1 - a0) / tile);
    for (let i = 0; i < n; i++) vsign(ctx, axis, c, a0 + ((a1 - a0) * i) / n, a0 + ((a1 - a0) * (i + 1)) / n, y0, y1, dir, uv, emissive, 0);
    return;
  }
  const b = ctx.builders.get('interiorSign', axis === 'x' ? (a0 + a1) / 2 : c, axis === 'x' ? c : (a0 + a1) / 2);
  let p0, p1, p2, p3;
  // u runs left->right as seen from the front
  if (axis === 'x') {
    if (dir > 0) [p0, p1, p2, p3] = [V(a0, y0, c), V(a1, y0, c), V(a1, y1, c), V(a0, y1, c)];
    else [p0, p1, p2, p3] = [V(a1, y0, c), V(a0, y0, c), V(a0, y1, c), V(a1, y1, c)];
  } else if (dir > 0) [p0, p1, p2, p3] = [V(c, y0, a1), V(c, y0, a0), V(c, y1, a0), V(c, y1, a1)];
  else [p0, p1, p2, p3] = [V(c, y0, a0), V(c, y0, a1), V(c, y1, a1), V(c, y1, a0)];
  b.quad(p0, p1, p2, p3, 0xffffff, emissive, { uvs: [[uv.u0, uv.v0], [uv.u1, uv.v0], [uv.u1, uv.v1], [uv.u0, uv.v1]] });
}
function glassRect(ctx, axis, c, a0, a1, y0, y1) {
  const b = ctx.builders.get('glass', axis === 'x' ? (a0 + a1) / 2 : c, axis === 'x' ? c : (a0 + a1) / 2);
  const uvs = { uvs: [[0, 0], [1, 0], [1, 1], [0, 1]] };
  if (axis === 'x') b.quad(V(a0, y0, c), V(a1, y0, c), V(a1, y1, c), V(a0, y1, c), 0xffffff, 0, uvs);
  else b.quad(V(c, y0, a0), V(c, y0, a1), V(c, y1, a1), V(c, y1, a0), 0xffffff, 0, uvs);
}

// subtract openings [a0,a1,yb,yt] from a wall [A0,A1]x[Y0,Y1] -> solid rects
function wallRects(A0, A1, Y0, Y1, openings) {
  const out = [];
  const ops = openings.slice().sort((p, q) => p.a0 - q.a0);
  let a = A0;
  for (const o of ops) {
    if (o.a0 > a) out.push([a, o.a0, Y0, Y1]);
    if (o.yb > Y0) out.push([o.a0, o.a1, Y0, o.yb]);
    if (o.yt < Y1) out.push([o.a0, o.a1, o.yt, Y1]);
    a = Math.max(a, o.a1);
  }
  if (A1 > a) out.push([a, A1, Y0, Y1]);
  return out;
}

// A box room with two-skinned walls: exterior (sunlit toon) and interior (ceiling lit).
// R: { x0,x1,z0,z1, y, h, t, out, outPat, inC, inPat, floor, floorPat, ceil, base, open: {N,S,W,E: [{a0,a1,yb,yt,kind}]} , roof }
export function buildRoom(ctx, R) {
  const t = R.t ?? 0.25;
  const { x0, x1, z0, z1, y, h } = R;
  const xm = (x0 + x1) / 2, zm = (z0 + z1) / 2;
  const IB = (x, z) => ctx.builders.get('interior', x, z);
  const TB = (x, z) => ctx.builders.get('toon', x, z);
  const DB = (x, z) => ctx.builders.get('detail', x, z);
  // floor + ceiling
  for (let x = x0; x < x1 - 0.01; x += 8) {
    for (let z = z0; z < z1 - 0.01; z += 8) {
      const xa = x, xb = Math.min(x1, x + 8), za = z, zb = Math.min(z1, z + 8);
      hrect(IB(xa, za), xa, za, xb, zb, y, 1, R.floor ?? 0xe4e2dc, R.floorPat ?? PAT.TILE);
      if (R.ceil !== false) hrect(IB(xa, za), xa, za, xb, zb, y + h, -1, R.ceil ?? 0xf3f1ec, 0);
    }
  }
  ctx.colliders.addSurface(x0 - t, z0 - t, x1 + t, z1 + t, () => y, 1);
  (ctx.indoorRects = ctx.indoorRects || []).push({ x0, x1, z0, z1, y0: y - 0.5, y1: y + h });
  // foundation
  let gmin = Infinity;
  for (const [x, z] of [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]) gmin = Math.min(gmin, groundH(x, z));
  TB(xm, zm).boxMM(x0 - t, gmin - 0.5, z0 - t, x1 + t, y, z1 + t, { color: R.base ?? 0x9e9a92, pattern: PAT.CONCRETE, skip: 'Y' });
  // walls
  const sides = {
    N: { axis: 'x', c: z0, dir: 1, A0: x0 - t, A1: x1 + t, body: (a0, a1, yb, yt) => [a0, yb, z0 - t, a1, yt, z0], skip: 'Z' },
    S: { axis: 'x', c: z1, dir: -1, A0: x0 - t, A1: x1 + t, body: (a0, a1, yb, yt) => [a0, yb, z1, a1, yt, z1 + t], skip: 'z' },
    W: { axis: 'z', c: x0, dir: 1, A0: z0, A1: z1, body: (a0, a1, yb, yt) => [x0 - t, yb, a0, x0, yt, a1], skip: 'X' },
    E: { axis: 'z', c: x1, dir: -1, A0: z0, A1: z1, body: (a0, a1, yb, yt) => [x1, yb, a0, x1 + t, yt, a1], skip: 'x' },
  };
  for (const [key, S] of Object.entries(sides)) {
    const ops = (R.open?.[key] || []).map((o) => ({ ...o, yb: y + (o.yb ?? 0), yt: y + (o.yt ?? h) }));
    for (const [a0, a1, yb, yt] of wallRects(S.A0, S.A1, y, y + h, ops)) {
      const bb = S.body(a0, a1, yb, yt);
      TB((bb[0] + bb[3]) / 2, (bb[2] + bb[5]) / 2).boxMM(...bb, { color: R.out ?? 0xe9e6de, pattern: R.outPat ?? PAT.TILE, skip: S.skip });
      // inner skin (inside the room only)
      const ia0 = Math.max(a0, S.axis === 'x' ? x0 : z0), ia1 = Math.min(a1, S.axis === 'x' ? x1 : z1);
      if (ia1 > ia0) vrect(IB(S.axis === 'x' ? (ia0 + ia1) / 2 : S.c, S.axis === 'x' ? S.c : (ia0 + ia1) / 2), S.axis, S.c, ia0, ia1, yb, yt, S.dir, R.inC ?? 0xf4f1ea, R.inPat ?? 0);
      if (yb <= y + 0.01 && yt > y + 0.6) {
        const c = S.axis === 'x' ? ctx.colliders.addSegment(a0, S.c - S.dir * t / 2, a1, S.c - S.dir * t / 2, t + 0.05) : ctx.colliders.addSegment(S.c - S.dir * t / 2, a0, S.c - S.dir * t / 2, a1, t + 0.05);
        if (c) {
          c.yTop = yt + 0.1;
          c.yBottom = y - 1;
        }
      }
    }
    // openings: frames, glass, reveals
    for (const o of ops) {
      const fc = o.frame ?? 0x6c7076;
      const d = DB(S.axis === 'x' ? (o.a0 + o.a1) / 2 : S.c, S.axis === 'x' ? S.c : (o.a0 + o.a1) / 2);
      const mid = S.c - S.dir * t / 2;
      const fb = (a0, a1, yb, yt) => (S.axis === 'x' ? d.boxMM(a0, yb, mid - t / 2 - 0.02, a1, yt, mid + t / 2 + 0.02, { color: fc }) : d.boxMM(mid - t / 2 - 0.02, yb, a0, mid + t / 2 + 0.02, yt, a1, { color: fc }));
      fb(o.a0, o.a1, o.yt - 0.06, o.yt);
      fb(o.a0, o.a0 + 0.06, o.yb, o.yt);
      fb(o.a1 - 0.06, o.a1, o.yb, o.yt);
      if (o.kind === 'glass') {
        fb(o.a0, o.a1, o.yb, o.yb + 0.06);
        const n = Math.max(1, Math.round((o.a1 - o.a0) / (o.pitch ?? 1.8)));
        for (let k = 1; k < n; k++) {
          const a = o.a0 + ((o.a1 - o.a0) * k) / n;
          fb(a - 0.03, a + 0.03, o.yb, o.yt);
        }
        if (o.transom) fb(o.a0, o.a1, o.yb + o.transom - 0.03, o.yb + o.transom + 0.03);
        glassRect(ctx, S.axis, mid, o.a0, o.a1, o.yb, o.yt);
        const c = S.axis === 'x' ? ctx.colliders.addSegment(o.a0, mid, o.a1, mid, t) : ctx.colliders.addSegment(mid, o.a0, mid, o.a1, t);
        if (c) {
          c.yTop = o.yt;
          c.yBottom = y - 1;
        }
        // inner sill
        if (o.yb > y + 0.3) {
          const sb = IB(S.axis === 'x' ? (o.a0 + o.a1) / 2 : S.c, S.axis === 'x' ? S.c : (o.a0 + o.a1) / 2);
          if (S.axis === 'x') sb.boxMM(o.a0, o.yb - 0.05, Math.min(S.c, S.c + S.dir * 0.22), o.a1, o.yb, Math.max(S.c, S.c + S.dir * 0.22), { color: R.sill ?? 0xd8d2c4 });
          else sb.boxMM(Math.min(S.c, S.c + S.dir * 0.22), o.yb - 0.05, o.a0, Math.max(S.c, S.c + S.dir * 0.22), o.yb, o.a1, { color: R.sill ?? 0xd8d2c4 });
        }
      }
    }
  }
  // roof slab (+ parapet); interiors keep their own ceiling
  if (R.roof !== false) {
    const rb = TB(xm, zm);
    rb.boxMM(x0 - t - 0.1, y + h, z0 - t - 0.1, x1 + t + 0.1, y + h + 0.4, z1 + t + 0.1, { color: R.roofC ?? 0xa9a59c, pattern: PAT.CONCRETE, skip: 'y' });
    if (R.parapet) {
      const ph = R.parapet;
      for (const [a, b2, c, d] of [[x0 - t - 0.1, z0 - t - 0.1, x1 + t + 0.1, z0 - t + 0.15], [x0 - t - 0.1, z1 + t - 0.15, x1 + t + 0.1, z1 + t + 0.1], [x0 - t - 0.1, z0 - t - 0.1, x0 - t + 0.15, z1 + t + 0.1], [x1 + t - 0.15, z0 - t - 0.1, x1 + t + 0.1, z1 + t + 0.1]]) rb.boxMM(a, y + h + 0.4, b2, c, y + h + 0.4 + ph, d, { color: R.out ?? 0xe9e6de, pattern: R.outPat ?? PAT.TILE });
    }
  }
  return R;
}

// ceiling light panels in a grid (+ night light pools inside)
function ceilingLights(ctx, x0, z0, x1, z1, y, step = 3, size = [1.2, 0.3]) {
  for (let x = x0 + step / 2; x < x1; x += step) {
    for (let z = z0 + step / 2; z < z1; z += step) ctx.builders.get('emissive', x, z).box(x, y - 0.02, z, size[0], 0.03, size[1], { color: 0xffffff });
  }
}

// ---------------------------------------------------------------------------
// automatic sliding doors (instanced leaves, chime, colliders that switch off)
// ---------------------------------------------------------------------------
export class AutoDoors {
  constructor() {
    this.doors = [];
  }
  // opening centre (x,z) on a wall along `axis` ('x' = wall runs along x), floor y
  add(ctx, x, z, axis, y, o = {}) {
    const w = o.w ?? 2.0, h = o.h ?? 2.3;
    const door = { x, z, axis, y, w, h, open: 0, chime: o.chime ?? false, name: o.name, items: [] };
    // colliders over the closed leaves
    const c = axis === 'x' ? ctx.colliders.addSegment(x - w / 2, z, x + w / 2, z, 0.2, y + h) : ctx.colliders.addSegment(x, z - w / 2, x, z + w / 2, 0.2, y + h);
    if (c) {
      c.yBottom = y - 0.5;
      door.items.push(c);
    }
    // header + sensor
    const d = ctx.builders.get('detail', x, z);
    if (axis === 'x') d.boxMM(x - w / 2 - 0.1, y + h, z - 0.12, x + w / 2 + 0.1, y + h + 0.25, z + 0.12, { color: 0x8a9096 });
    else d.boxMM(x - 0.12, y + h, z - w / 2 - 0.1, x + 0.12, y + h + 0.25, z + w / 2 + 0.1, { color: 0x8a9096 });
    this.doors.push(door);
    return door;
  }
  finalize(ctx, scene) {
    const n = this.doors.length * 2;
    if (!n) return;
    const fr = new MeshBuilder();
    // leaf: 1.0 wide (x), 2.3 tall, frame bars + kick plate; glass pane separately
    fr.box(0, 2.27, 0, 1.0, 0.06, 0.05, { color: 0xa9afb5 });
    fr.box(0, 0.08, 0, 1.0, 0.16, 0.05, { color: 0xa9afb5 });
    fr.box(-0.47, 1.15, 0, 0.06, 2.3, 0.05, { color: 0xa9afb5 });
    fr.box(0.47, 1.15, 0, 0.06, 2.3, 0.05, { color: 0xa9afb5 });
    fr.box(0, 1.05, 0.03, 0.3, 0.06, 0.01, { color: 0x6c7076 });
    const gl = new MeshBuilder();
    gl.quad(V(-0.44, 0.16, 0), V(0.44, 0.16, 0), V(0.44, 2.24, 0), V(-0.44, 2.24, 0), 0xffffff, 0, { uvs: [[0, 0], [1, 0], [1, 1], [0, 1]] });
    this.frames = new THREE.InstancedMesh(fr.toGeometry(), ctx.materials.toon.material, n);
    this.glass = new THREE.InstancedMesh(gl.toGeometry(), ctx.materials.glass.material, n);
    this.glass.renderOrder = 3;
    for (const m of [this.frames, this.glass]) {
      m.frustumCulled = false;
      scene.add(m);
    }
    this.m4 = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.place();
  }
  place() {
    let i = 0;
    for (const d of this.doors) {
      for (const e of [-1, 1]) {
        const s = d.w / 2;
        const off = e * (s / 2 + d.open * s * 0.92);
        const sx = s / 1.0, sy = d.h / 2.3;
        if (d.axis === 'x') this.m4.compose(V(d.x + off, d.y, d.z), this.q.identity(), V(sx, sy, 1));
        else this.m4.compose(V(d.x, d.y, d.z + off), this.q.setFromAxisAngle(V(0, 1, 0), Math.PI / 2), V(sx, sy, 1));
        this.frames.setMatrixAt(i, this.m4);
        this.glass.setMatrixAt(i, this.m4);
        i++;
      }
    }
    this.frames.instanceMatrix.needsUpdate = true;
    this.glass.instanceMatrix.needsUpdate = true;
  }
  update(dt, p, audio) {
    if (!this.frames) return;
    let moved = false;
    for (const d of this.doors) {
      const near = p && Math.abs(p.y - d.y) < 1.6 && Math.hypot(p.x - d.x, p.z - d.z) < 2.4;
      const target = near ? 1 : 0;
      if (target === 1 && d.open === 0 && d.chime && audio) audio.sfx('chime');
      const v = d.open + Math.sign(target - d.open) * dt * 1.7;
      const nv = Math.min(1, Math.max(0, target > d.open ? Math.min(v, 1) : Math.max(v, 0)));
      if (nv !== d.open) {
        d.open = nv;
        moved = true;
        for (const c of d.items) c.off = d.open > 0.55;
      }
    }
    if (moved) this.place();
  }
}

// ---------------------------------------------------------------------------
// product textures (atlas page 2)
// ---------------------------------------------------------------------------
function productTex(ctx, kind) {
  return ctx.atlas2.draw('prod:' + kind, 256, 128, (c, w, h) => {
    const rng = new RNG(kind.length * 977 + kind.charCodeAt(0));
    c.fillStyle = kind === 'drinks' ? '#e8eef2' : '#f4f2ee';
    c.fillRect(0, 0, w, h);
    const rows = kind === 'magazines' ? 2 : kind === 'drinks' ? 4 : 3;
    const rh = h / rows;
    const pal = {
      drinks: ['#3a8a4a', '#e8432e', '#f6c341', '#2f6fd0', '#ffffff', '#8a4a2a', '#f08ab0', '#b8d870'],
      chilled: ['#f2efe6', '#2a2a2a', '#d84a3a', '#f6c341', '#7ab04a', '#e8a070'],
      snacks: ['#e8432e', '#f6c341', '#2f6fd0', '#48a860', '#f08a24', '#9a4ac0', '#f08ab0'],
      noodles: ['#f6c341', '#e8432e', '#ffffff', '#2f6fd0', '#f08a24'],
      daily: ['#9fd0f0', '#ffffff', '#f6e7c8', '#48a860', '#f08ab0', '#2f6fd0'],
      sweets: ['#fff1d8', '#f6c0d0', '#d8a060', '#ffffff', '#c86a8a'],
      bread: ['#d9a05a', '#e8c080', '#c8803a', '#f6e7c8'],
      magazines: ['#e8432e', '#2f6fd0', '#f6c341', '#f08ab0', '#48a860', '#2a2a2a', '#ffffff'],
      cards: ['#2f6fd0', '#e8432e', '#f6c341', '#48a860', '#9a4ac0', '#ffffff'],
      books: ['#5a3a2a', '#2a4a6a', '#8a2a2a', '#2f5a3a', '#c9a24a', '#e8e0d0', '#6a4a8a', '#3a6a8a'],
    }[kind] || ['#cccccc'];
    for (let r = 0; r < rows; r++) {
      const y0 = r * rh;
      // shelf lip with price tags
      c.fillStyle = '#d9dcdf';
      c.fillRect(0, y0 + rh - 7, w, 7);
      let x = 3;
      while (x < w - 4) {
        const iw = kind === 'books' ? rng.range(5, 10) : kind === 'drinks' ? rng.range(12, 16) : kind === 'magazines' ? rng.range(26, 34) : rng.range(14, 24);
        const ih = kind === 'books' ? rh * rng.range(0.7, 0.92) : kind === 'drinks' ? rh * rng.range(0.72, 0.88) : kind === 'magazines' ? rh * 0.85 : rh * rng.range(0.45, 0.8);
        const col = pal[Math.floor(rng.next() * pal.length)];
        c.fillStyle = col;
        if (kind === 'drinks') {
          roundRect(c, x, y0 + rh - 7 - ih, iw, ih, 3);
          c.fill();
          c.fillStyle = 'rgba(255,255,255,0.75)';
          c.fillRect(x + 1, y0 + rh - 7 - ih * 0.62, iw - 2, ih * 0.22);
        } else if (kind === 'chilled' && rng.next() < 0.5) {
          // onigiri triangles
          c.beginPath();
          c.moveTo(x, y0 + rh - 8);
          c.lineTo(x + iw, y0 + rh - 8);
          c.lineTo(x + iw / 2, y0 + rh - 8 - ih);
          c.closePath();
          c.fillStyle = '#f2efe6';
          c.fill();
          c.fillStyle = '#1f2a22';
          c.fillRect(x + iw * 0.25, y0 + rh - 8 - ih * 0.35, iw * 0.5, ih * 0.35);
        } else {
          c.fillRect(x, y0 + rh - 7 - ih, iw, ih);
          c.fillStyle = 'rgba(255,255,255,0.45)';
          if (kind !== 'books') c.fillRect(x + 2, y0 + rh - 7 - ih * 0.7, iw - 4, ih * 0.18);
          else c.fillRect(x + 1, y0 + rh - 7 - ih * 0.85, iw - 2, 2);
        }
        if (kind !== 'books' && rng.next() < 0.3) {
          c.fillStyle = '#ffe14a';
          c.fillRect(x, y0 + rh - 6, 9, 5);
        }
        x += iw + (kind === 'books' ? 0.5 : 2);
      }
    }
  });
}

function brandSign(ctx) {
  return ctx.atlas2.draw('sakuramart', 512, 96, (c, w, h) => {
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#e2708f';
    c.fillRect(0, h * 0.72, w, h * 0.14);
    c.fillStyle = '#3fa36a';
    c.fillRect(0, h * 0.86, w, h * 0.14);
    // sakura mark
    c.fillStyle = '#e2708f';
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
      c.beginPath();
      c.ellipse(h * 0.42 + Math.cos(a) * h * 0.13, h * 0.36 + Math.sin(a) * h * 0.13, h * 0.11, h * 0.075, a, 0, Math.PI * 2);
      c.fill();
    }
    c.fillStyle = '#3fa36a';
    c.textAlign = 'left';
    c.textBaseline = 'middle';
    fitText(c, 'さくらマート', w * 0.62, h * 0.48, FONTS.maru, '700');
    c.fillText('さくらマート', h * 0.8, h * 0.38);
    c.fillStyle = '#e2708f';
    c.font = `700 ${h * 0.2}px ${FONTS.latin}`;
    c.textAlign = 'right';
    c.fillText('SAKURA MART', w - 12, h * 0.38);
  });
}

// ---------------------------------------------------------------------------
// コンビニ さくらマート (block B0, faces the 桜橋通り with a small car park)
// ---------------------------------------------------------------------------
function buildKonbini(ctx, block, doors) {
  const K = { x0: 225.2, x1: 239.0, z0: 33.8, z1: 43.4 };
  const y = 3.32, h = 3.0;
  buildRoom(ctx, {
    ...K, y, h, out: 0xf6f4ef, outPat: PAT.NONE, inC: 0xf7f6f2, floor: 0xe6e6e2, floorPat: PAT.TILE, ceil: 0xf6f6f4, parapet: 0.7,
    open: {
      N: [{ a0: 225.6, a1: 234.4, yb: 0.12, yt: 2.5, kind: 'glass', pitch: 2.2 }, { a0: 234.6, a1: 236.6, yb: 0, yt: 2.3, kind: 'door' }, { a0: 236.8, a1: 238.6, yb: 0.12, yt: 2.5, kind: 'glass' }],
      E: [{ a0: 34.4, a1: 38.4, yb: 0.9, yt: 2.5, kind: 'glass' }],
    },
  });
  doors.add(ctx, 235.6, K.z0 - 0.125, 'x', y, { chime: true, name: 'konbini' });
  const kit = new Kit(ctx, (K.x0 + K.x1) / 2, K.z0);
  // sign band with the brand stripes over the shop front
  const t = kit.t;
  t.boxMM(K.x0 - 0.3, y + 2.55, K.z0 - 0.45, K.x1 + 0.3, y + 3.45, K.z0 - 0.25, { color: 0xffffff });
  t.boxMM(K.x0 - 0.3, y + 2.5, K.z0 - 0.5, K.x1 + 0.3, y + 2.6, K.z0 - 0.25, { color: 0x3fa36a });
  const brand = brandSign(ctx);
  signOnFace(kit, { o: V(K.x1, y, K.z0 - 0.46), r: V(-1, 0, 0), n: V(0, 0, -1), len: K.x1 - K.x0 }, (K.x1 - K.x0) / 2 + 1.5, 2.62, 4.6, 0.8, 0.0, brand, 0.55);
  // canopy over the door
  t.boxMM(233.9, y + 2.38, K.z0 - 1.4, 237.3, y + 2.48, K.z0 - 0.25, { color: 0xe9e9e4 });
  // posters on the glass
  const poster = ctx.atlas2.draw('km-poster', 128, 160, (c, w, h) => {
    c.fillStyle = '#ffe14a';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#e8432e';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = `900 ${h * 0.16}px ${FONTS.bold}`;
    c.fillText('春の', w / 2, h * 0.22);
    c.fillText('おにぎり', w / 2, h * 0.42);
    c.fillText('フェア', w / 2, h * 0.62);
    c.fillStyle = '#2a2a2a';
    c.font = `700 ${h * 0.09}px ${FONTS.gothic}`;
    c.fillText('2個で¥250', w / 2, h * 0.84);
  });
  vsign(ctx, 'x', K.z0 - 0.14, 227.0, 227.9, y + 1.2, y + 2.3, -1, poster, 0.3);
  // car park, wheel stops, pole sign, bins
  ctx.ground.rect(block.x0, block.z0, block.x1, K.z0 - 0.4, 0x6f7074, PAT.ASPHALT);
  for (let i = 0; i < 6; i++) {
    const x = block.x0 + 1.0 + i * 2.7;
    const yy = roadSurfaceY(x, 30);
    ctx.builders.get('detail', x, 30).box(x, yy + 0.01, 29.4, 0.1, 0.02, 5.0, { color: 0xf2f2ee });
    if (i < 5) ctx.builders.get('detail', x, 32).box(x + 1.35, roadSurfaceY(x, 32.4) + 0.06, 32.4, 1.2, 0.12, 0.15, { color: 0xd0ccc4 });
  }
  const rng = new RNG(1234);
  for (const i of [1, 3]) {
    const x = block.x0 + 1.0 + i * 2.7 + 1.35;
    parkedCar(kit, x, 29.6, -Math.PI / 2, rng, roadSurfaceY);
    ctx.colliders.addBox(x, 29.6, 0.85, 1.9, 0, roadSurfaceY(x, 29.6) + 1.6);
  }
  const px = block.x1 - 0.8, pz = block.z0 + 0.8;
  const py = roadSurfaceY(px, pz);
  t.box(px, py + 3.2, pz, 0.22, 6.4, 0.22, { color: 0xb8bcc0 });
  t.box(px, py + 6.5, pz, 0.4, 1.4, 2.4, { color: 0xffffff });
  for (const f of [-1, 1]) signOnFace(kit, { o: V(px + f * 0.21, py, pz + f * 1.15), r: V(0, 0, -f), n: V(f, 0, 0), len: 2.3 }, 1.15, 5.9, 2.3, 0.44, 0.0, brand, 0.55);
  ctx.colliders.addCircle(px, pz, 0.2);
  for (let i = 0; i < 3; i++) {
    const bx = 238.0 + i * 0.0, bz = K.z0 - 0.75;
    void bz;
    t.box(bx - 0.75 + i * 0.55 + 0.2, y - 0.02 + 0.45, K.z0 - 0.6, 0.48, 0.9, 0.45, { color: [0x2f7ad0, 0x48a860, 0xe8a030][i] });
  }
  ctx.colliders.addBox(238.0, K.z0 - 0.6, 0.85, 0.25, 0, y + 1);
  // ---- interior ----
  const IB = (x, z) => ctx.builders.get('interior', x, z);
  ceilingLights(ctx, K.x0, K.z0, K.x1, K.z1, y + h, 2.6, [1.6, 0.25]);
  // walk-in fridges along the back wall (glowing, glass doors)
  const drinks = productTex(ctx, 'drinks');
  const fz = K.z1 - 0.85;
  IB(230, fz).boxMM(K.x0 + 0.6, y, fz, 234.2, y + 2.3, K.z1, { color: 0xdfe3e6 });
  vsign(ctx, 'x', fz - 0.01, K.x0 + 0.75, 234.05, y + 0.2, y + 2.05, -1, drinks, 1.6, 1.7);
  glassRect(ctx, 'x', fz - 0.06, K.x0 + 0.7, 234.1, y + 0.15, y + 2.1);
  for (let x = K.x0 + 0.7; x <= 234.2; x += 0.86) IB(x, fz).boxMM(x - 0.03, y + 0.1, fz - 0.1, x + 0.03, y + 2.15, fz - 0.02, { color: 0x9aa0a6 });
  ctx.colliders.addBox((K.x0 + 0.6 + 234.2) / 2, fz + 0.42, (234.2 - K.x0 - 0.6) / 2, 0.45, 0, y + 2.3, y - 1);
  ctx.interactables.push({ kind: 'konbini', what: 'drink', x: 229.5, z: fz - 1.0, y, r: 2.6, label: '飲み物を選ぶ' });
  // open chiller on the west wall: onigiri, bento, sweets
  const chilled = productTex(ctx, 'chilled');
  const sweets = productTex(ctx, 'sweets');
  const cx = K.x0 + 0.85;
  IB(cx, 38).boxMM(K.x0, y, 36.2, cx, y + 1.9, 42.4, { color: 0xdfe3e6 });
  vsign(ctx, 'z', cx + 0.01, 36.4, 39.4, y + 0.3, y + 1.7, 1, chilled, 1.2, 1.5);
  vsign(ctx, 'z', cx + 0.01, 39.4, 42.2, y + 0.3, y + 1.7, 1, sweets, 1.2, 1.4);
  ctx.builders.get('emissive', cx, 39).box(cx - 0.1, y + 1.82, 39.3, 0.08, 0.04, 5.9, { color: 0xffffff });
  ctx.colliders.addBox(K.x0 + 0.45, 39.3, 0.5, 3.1, 0, y + 1.9, y - 1);
  ctx.interactables.push({ kind: 'konbini', what: 'onigiri', x: cx + 1.0, z: 38, y, r: 1.8, label: 'おにぎりを選ぶ' });
  ctx.interactables.push({ kind: 'konbini', what: 'sweets', x: cx + 1.0, z: 41, y, r: 1.6, label: 'スイーツを選ぶ' });
  // gondola shelves
  const kinds = [['snacks', 'noodles'], ['daily', 'bread'], ['snacks', 'cards']];
  [228.4, 231.0].forEach((gx, i) => {
    const z0 = 36.0, z1 = 41.6;
    IB(gx, 38.8).boxMM(gx - 0.45, y, z0, gx + 0.45, y + 1.45, z1, { color: 0xeeeeea });
    IB(gx, 38.8).boxMM(gx - 0.5, y, z0 - 0.05, gx + 0.5, y + 0.12, z1 + 0.05, { color: 0x9aa0a6 });
    const [a, b] = kinds[i];
    vsign(ctx, 'z', gx - 0.46, z0 + 0.1, z1 - 0.1, y + 0.16, y + 1.38, -1, productTex(ctx, a), 0.4, 1.8);
    vsign(ctx, 'z', gx + 0.46, z0 + 0.1, z1 - 0.1, y + 0.16, y + 1.38, 1, productTex(ctx, b), 0.4, 1.8);
    ctx.colliders.addBox(gx, (z0 + z1) / 2, 0.5, (z1 - z0) / 2, 0, y + 1.45, y - 1);
    ctx.interactables.push({ kind: 'konbini', what: a, x: gx - 1.0, z: 38.8, y, r: 1.4, label: '棚を眺める' });
  });
  // magazine rack under the front window
  const mags = productTex(ctx, 'magazines');
  IB(228, K.z0 + 0.3).boxMM(225.6, y, K.z0 + 0.05, 232.6, y + 0.95, K.z0 + 0.55, { color: 0xe6e6e2 });
  vsign(ctx, 'x', K.z0 + 0.56, 225.7, 232.5, y + 0.15, y + 0.9, 1, mags, 0.4, 1.7);
  ctx.colliders.addBox(229.1, K.z0 + 0.3, 3.5, 0.28, 0, y + 1, y - 1);
  ctx.interactables.push({ kind: 'konbini', what: 'magazine', x: 229, z: K.z0 + 1.3, y, r: 1.6, label: '雑誌を立ち読みする' });
  // counter with registers, hot snack case and the coffee machine
  const cx0 = 235.6, cx1 = 236.6, cz0 = 36.4, cz1 = 41.8;
  IB(236, 39).boxMM(cx0, y, cz0, cx1, y + 1.0, cz1, { color: 0x8a6a4c, pattern: PAT.PLANKS });
  IB(236, 39).boxMM(cx0 - 0.05, y + 1.0, cz0 - 0.05, cx1 + 0.05, y + 1.05, cz1 + 0.05, { color: 0xf2f0ea });
  for (const rz of [37.4, 40.2]) {
    IB(236, rz).boxMM(cx0 + 0.25, y + 1.05, rz - 0.25, cx0 + 0.65, y + 1.25, rz + 0.25, { color: 0x2a2c30 });
    IB(236, rz).boxMM(cx0 + 0.3, y + 1.25, rz - 0.18, cx0 + 0.36, y + 1.55, rz + 0.18, { color: 0x2a2c30 });
    ctx.builders.get('emissive', 236, rz).box(cx0 + 0.29, y + 1.42, rz, 0.01, 0.22, 0.3, { color: 0x9fd0f0 });
  }
  const hot = ctx.atlas2.draw('km-hot', 128, 64, (c, w, h) => {
    c.fillStyle = '#f6e7c8';
    c.fillRect(0, 0, w, h);
    for (let i = 0; i < 12; i++) {
      c.fillStyle = ['#c8803a', '#d9a05a', '#b0602a'][i % 3];
      c.beginPath();
      c.arc(10 + (i % 6) * 21, 18 + Math.floor(i / 6) * 26, 9, 0, Math.PI * 2);
      c.fill();
    }
  });
  IB(236, 38.8).boxMM(cx0 + 0.05, y + 1.05, 38.3, cx1 - 0.05, y + 1.55, 39.5, { color: 0xd8d4cc });
  vsign(ctx, 'z', cx0 + 0.04, 38.35, 39.45, y + 1.08, y + 1.5, -1, hot, 1.5);
  ctx.colliders.addBox((cx0 + cx1) / 2, (cz0 + cz1) / 2, 0.55, (cz1 - cz0) / 2, 0, y + 1.05, y - 1);
  ctx.interactables.push({ kind: 'konbini', what: 'register', x: cx0 - 0.9, z: 38.8, y, r: 1.6, label: 'レジで会計する' });
  // shelves behind the counter (gift cards / tickets) and the staff door
  vsign(ctx, 'z', K.x1 - 0.02, 36.6, 41.6, y + 0.9, y + 2.2, -1, productTex(ctx, 'cards'), 0.5, 1.7);
  IB(K.x1, 42.5).boxMM(K.x1 - 0.05, y, 42.0, K.x1, y + 2.1, 43.1, { color: 0xc9ced3 });
  // coffee machine near the entrance
  IB(K.x1 - 0.5, 35.3).boxMM(K.x1 - 1.0, y, 34.6, K.x1 - 0.05, y + 1.0, 36.0, { color: 0x8a6a4c, pattern: PAT.PLANKS });
  IB(K.x1 - 0.5, 35.3).boxMM(K.x1 - 0.8, y + 1.0, 34.9, K.x1 - 0.2, y + 1.75, 35.7, { color: 0x2a2c30 });
  ctx.builders.get('emissive', K.x1 - 0.8, 35.3).box(K.x1 - 0.81, y + 1.45, 35.3, 0.01, 0.2, 0.3, { color: 0xffe0a0 });
  ctx.colliders.addBox(K.x1 - 0.5, 35.3, 0.5, 0.7, 0, y + 1.8, y - 1);
  ctx.interactables.push({ kind: 'konbini', what: 'coffee', x: K.x1 - 1.6, z: 35.3, y, r: 1.4, label: 'コーヒーをいれる' });
  // ATM + copy machine on the west front corner
  IB(K.x0 + 0.5, 35).boxMM(K.x0 + 0.05, y, 34.3, K.x0 + 0.85, y + 1.6, 35.4, { color: 0xd8dade });
  ctx.builders.get('emissive', K.x0 + 0.85, 34.8).box(K.x0 + 0.86, y + 1.15, 34.85, 0.01, 0.3, 0.45, { color: 0x9fd0f0 });
  ctx.colliders.addBox(K.x0 + 0.45, 34.85, 0.45, 0.6, 0, y + 1.6, y - 1);
  ctx.interactables.push({ kind: 'konbini', what: 'atm', x: K.x0 + 1.6, z: 34.85, y, r: 1.2, label: 'ATMをのぞく' });
  ctx.landmarks.push({ id: 'konbini', name: 'さくらマート', x: 232, z: K.z0 });
}

// ---------------------------------------------------------------------------
// 喫茶 さくらテラス (block A0) by the river, with a terrace deck
// ---------------------------------------------------------------------------
function buildCafe(ctx, block, doors) {
  const C = { x0: 201.6, x1: 212.4, z0: 28.6, z1: 42.6 };
  const y = 3.36, h = 3.1;
  const wood = 0x8a6448;
  buildRoom(ctx, {
    ...C, y, h, out: 0xe9dcc4, outPat: PAT.SIDING, inC: 0xf3ead8, floor: 0x9a6e4a, floorPat: PAT.PLANKS, ceil: 0xe8dcc6, roof: false, sill: 0x7a5a40,
    open: {
      W: [{ a0: 29.2, a1: 34.4, yb: 0.55, yt: 2.5, kind: 'glass', frame: wood, pitch: 1.3, transom: 1.5 }, { a0: 34.6, a1: 36.6, yb: 0, yt: 2.3, kind: 'door', frame: wood }, { a0: 36.8, a1: 42.0, yb: 0.55, yt: 2.5, kind: 'glass', frame: wood, pitch: 1.3, transom: 1.5 }],
      N: [{ a0: 203.0, a1: 210.8, yb: 0.7, yt: 2.5, kind: 'glass', frame: wood, pitch: 1.3 }],
    },
  });
  doors.add(ctx, C.x0 - 0.125, 35.6, 'z', y, { chime: true, name: 'cafe' });
  // gable roof (ridge along z) with warm tiles
  const tb = ctx.builders.get('toon', (C.x0 + C.x1) / 2, (C.z0 + C.z1) / 2);
  tb.push(new THREE.Matrix4().makeTranslation((C.x0 + C.x1) / 2, 0, (C.z0 + C.z1) / 2).multiply(new THREE.Matrix4().makeRotationY(Math.PI / 2)));
  gableRoof(tb, 0, 0, C.z1 - C.z0 + 0.5, C.x1 - C.x0 + 0.5, y + h, { color: 0x7a4b3d, wallColor: 0xe9dcc4, wallPattern: PAT.SIDING, slope: 0.5, ox: 0.5, oz: 0.6, fascia: 0x6a4a36 });
  tb.pop();
  // terrace deck facing the river
  const dx0 = block.x0 + 0.1, dx1 = C.x0 - 0.25;
  ctx.builders.get('toon', dx0, 35).boxMM(dx0, y - 0.6, C.z0, dx1, y - 0.02, C.z1, { color: 0x9a7454, pattern: PAT.PLANKS });
  ctx.colliders.addSurface(dx0, C.z0, dx1, C.z1, () => y - 0.02, 1);
  const d = ctx.builders.get('detail', dx0, 35);
  for (let z = C.z0 + 0.1; z < C.z1; z += 1.2) {
    if (z > 34.2 && z < 36.8) continue;
    d.box(dx0 + 0.06, y + 0.45, z, 0.07, 0.95, 0.07, { color: 0x6a4a36 });
  }
  for (const [za, zb] of [[C.z0 + 0.1, 34.2], [36.8, C.z1 - 0.1]]) {
    d.box(dx0 + 0.06, y + 0.92, (za + zb) / 2, 0.09, 0.07, zb - za, { color: 0x6a4a36 });
    const c = ctx.colliders.addSegment(dx0 + 0.06, za, dx0 + 0.06, zb, 0.15, y + 1);
    if (c) c.yBottom = y - 1.5;
  }
  // steps down to the path at the deck opening
  ctx.builders.get('toon', dx0, 35.5).boxMM(dx0 - 0.4, groundH(dx0, 35.5) - 0.2, 34.3, dx0, y - 0.2, 36.7, { color: 0x9a7454, pattern: PAT.PLANKS });
  ctx.colliders.addSurface(dx0 - 0.6, 34.3, dx0 + 0.1, 36.7, (x) => groundH(dx0, 35.5) + Math.min(1, Math.max(0, (x - (dx0 - 0.6)) / 0.7)) * (y - groundH(dx0, 35.5)), 2);
  // parasol tables on the deck
  for (const tz of [30.6, 40.6]) {
    const tx = (dx0 + dx1) / 2;
    const b = ctx.builders.get('toon', tx, tz);
    b.cyl(tx, y, tz, 0.04, 0.04, 0.72, 6, 0x333333);
    b.cyl(tx, y + 0.72, tz, 0.42, 0.42, 0.04, 12, 0xf0ece4);
    b.cyl(tx, y + 0.72, tz, 0.03, 0.03, 1.6, 6, 0xdddddd);
    b.cyl(tx, y + 2.15, tz, 1.25, 0.05, 0.35, 10, tz < 35 ? 0xe2708f : 0x6aa07a);
    ctx.colliders.addCircle(tx, tz, 0.45, y + 0.8);
    for (const e of [-1, 1]) {
      const sz = tz + e * 0.85;
      b.box(tx, y + 0.44, sz, 0.42, 0.05, 0.42, { color: 0x4a3a2a });
      b.box(tx, y + 0.22, sz, 0.05, 0.44, 0.05, { color: 0x333333 });
      b.box(tx, y + 0.7, sz + e * 0.19, 0.42, 0.45, 0.04, { color: 0x4a3a2a });
      ctx.interactables.push({ kind: 'bench', x: tx, z: sz - e * 0.35, y, r: 0.9, label: 'テラス席に座る', sit: { x: tx, y: y + 0.45, z: sz, yaw: e > 0 ? 0 : Math.PI } });
    }
  }
  // signboards
  const kit = new Kit(ctx, C.x0, 35);
  const sign = ctx.atlas2.draw('cafe-sign', 384, 96, (c, w, h) => drawBoard(c, w, h, { text: '喫茶 さくらテラス', sub: 'COFFEE & SWEETS', bg: '#3a2a1f', fg: '#f6e7c0', font: FONTS.mincho, weather: false }));
  signOnFace(kit, { o: V(C.x0 - 0.27, 0, C.z1 - 1.0), r: V(0, 0, -1), n: V(-1, 0, 0), len: 12 }, 6.6, y + 2.62, 3.6, 0.9, 0.0, sign, 0.8, 0x2a1e16);
  signOnFace(kit, { o: V(C.x0 + 2.5, 0, C.z0 - 0.27), r: V(-1, 0, 0), n: V(0, 0, -1), len: 6 }, -2.9, y + 2.62, 3.4, 0.85, 0.0, sign, 0.8, 0x2a1e16);
  // chalk A-board on the path
  const ab = ctx.atlas.cache.get('cafe-board');
  if (ab) {
    const bx = dx0 - 1.3, bz = 37.4;
    const by = groundH(bx, bz);
    const b = ctx.builders.get('toon', bx, bz);
    b.box(bx, by + 0.45, bz, 0.06, 0.9, 0.55, { color: 0x8a6a4a });
    signOnFace(kit, { o: V(bx - 0.04, by, bz + 0.26), r: V(0, 0, -1), n: V(-1, 0, 0), len: 0.5 }, 0.25, 0.08, 0.48, 0.78, 0.0, ab, 0.2);
    ctx.colliders.addBox(bx, bz, 0.1, 0.3, 0, by + 0.9);
  }
  // ---- interior ----
  const IB = (x, z) => ctx.builders.get('interior', x, z);
  // exposed beams + pendant lamps
  for (let z = C.z0 + 1.6; z < C.z1; z += 2.8) {
    IB(207, z).boxMM(C.x0, y + h - 0.25, z - 0.1, C.x1, y + h, z + 0.1, { color: 0x7a5a40 });
  }
  for (const [lx, lz] of [[203.4, 30.4], [203.4, 33.2], [203.4, 38.0], [203.4, 40.8], [207.0, 35.6], [207.0, 39.8]]) {
    IB(lx, lz).cyl(lx, y + 2.2, lz, 0.008, 0.008, h - 2.2, 4, 0x2a2a2a);
    IB(lx, lz).cyl(lx, y + 2.05, lz, 0.28, 0.08, 0.2, 10, 0x3a5a4a);
    ctx.builders.get('emissive', lx, lz).geom(new THREE.SphereGeometry(0.09, 8, 6), new THREE.Matrix4().makeTranslation(lx, y + 2.0, lz), 0xffe2b0);
  }
  // counter along the east wall with the espresso machine and cake case
  const kx0 = 209.6, kx1 = 210.6;
  IB(210, 35).boxMM(kx0, y, 30.4, kx1, y + 1.05, 39.6, { color: 0x6a4a36, pattern: PAT.PLANKS });
  IB(210, 35).boxMM(kx0 - 0.08, y + 1.05, 30.35, kx1 + 0.05, y + 1.1, 39.65, { color: 0xe8e0d0 });
  IB(210, 31.6).boxMM(kx0 + 0.2, y + 1.1, 31.0, kx1 - 0.1, y + 1.55, 32.0, { color: 0xb9bdc2, pattern: PAT.METAL });
  const cakes = ctx.atlas2.draw('cafe-cakes', 128, 64, (c, w, h) => {
    c.fillStyle = '#fbf4ee';
    c.fillRect(0, 0, w, h);
    const cols = ['#f6c0d0', '#fff1d8', '#d8a060', '#f2f2ea', '#c86a8a', '#7a4a2a'];
    for (let i = 0; i < 8; i++) {
      const x = 6 + (i % 4) * 30, yy = 8 + Math.floor(i / 4) * 30;
      c.fillStyle = cols[i % cols.length];
      c.fillRect(x, yy + 6, 22, 16);
      c.fillStyle = '#e2408f';
      c.beginPath();
      c.arc(x + 11, yy + 5, 3, 0, Math.PI * 2);
      c.fill();
    }
  });
  IB(210, 36).boxMM(kx0 - 0.05, y + 1.1, 35.0, kx1, y + 1.6, 37.6, { color: 0xe8e0d0 });
  vsign(ctx, 'z', kx0 - 0.06, 35.05, 37.55, y + 1.12, y + 1.58, -1, cakes, 1.3);
  ctx.colliders.addBox(210.1, 35, 0.55, 4.7, 0, y + 1.1, y - 1);
  ctx.interactables.push({ kind: 'cafe', what: 'order', x: kx0 - 1.0, z: 33.4, y, r: 1.6, label: '注文する' });
  // menu board + shelves of cups on the east wall
  const menu = ctx.atlas2.draw('cafe-menu', 256, 160, (c, w, h) => {
    c.fillStyle = '#2a3a30';
    c.fillRect(0, 0, w, h);
    c.strokeStyle = '#8a6a4a';
    c.lineWidth = 8;
    c.strokeRect(4, 4, w - 8, h - 8);
    c.fillStyle = '#f6efe0';
    c.textAlign = 'left';
    c.textBaseline = 'middle';
    c.font = `700 ${h * 0.11}px ${FONTS.maru}`;
    c.fillText('MENU', 16, h * 0.14);
    const items = [['ブレンド', '¥450'], ['桜ラテ', '¥520'], ['ナポリタン', '¥850'], ['桜のロールケーキ', '¥480'], ['クリームソーダ', '¥550']];
    c.font = `500 ${h * 0.085}px ${FONTS.maru}`;
    items.forEach(([n, p], i) => {
      c.fillText(n, 18, h * (0.3 + i * 0.14));
      c.textAlign = 'right';
      c.fillText(p, w - 18, h * (0.3 + i * 0.14));
      c.textAlign = 'left';
    });
  });
  vsign(ctx, 'z', C.x1 - 0.02, 32.5, 36.5, y + 1.5, y + 2.75, -1, menu, 0.3);
  // tables by the windows with chairs you can sit on
  const seats = [];
  for (const [tx, tz] of [[203.2, 30.6], [203.2, 33.4], [203.2, 38.2], [203.2, 41.0], [206.6, 30.8], [206.6, 41.0]]) {
    const b = IB(tx, tz);
    b.cyl(tx, y, tz, 0.05, 0.05, 0.72, 6, 0x2a2a2a);
    b.cyl(tx, y + 0.72, tz, 0.45, 0.45, 0.04, 12, 0x7a5a40);
    ctx.colliders.addCircle(tx, tz, 0.5, y + 0.8);
    for (const e of [-1, 1]) seats.push([tx, tz + e * 0.82, e]);
  }
  for (const [sx, sz, e] of seats) {
    const b = IB(sx, sz);
    b.box(sx, y + 0.44, sz, 0.42, 0.06, 0.42, { color: 0x5a3e2a });
    for (const [a, c] of [[-0.17, -0.17], [0.17, -0.17], [0.17, 0.17], [-0.17, 0.17]]) b.box(sx + a, y + 0.21, sz + c, 0.04, 0.42, 0.04, { color: 0x3a2a1e });
    b.box(sx, y + 0.72, sz + e * 0.19, 0.42, 0.5, 0.04, { color: 0x5a3e2a });
    ctx.interactables.push({ kind: 'bench', x: sx, z: sz - e * 0.45, y, r: 0.8, label: '席に座る', sit: { x: sx, y: y + 0.45, z: sz, yaw: e > 0 ? 0 : Math.PI } });
  }
  // bookshelf on the south wall + plants
  const books = productTex(ctx, 'books');
  IB(206, C.z1 - 0.2).boxMM(204.6, y, C.z1 - 0.35, 208.4, y + 2.0, C.z1, { color: 0x6a4a36 });
  vsign(ctx, 'x', C.z1 - 0.36, 204.7, 208.3, y + 0.1, y + 1.9, -1, books, 0.3, 1.2);
  ctx.colliders.addBox(206.5, C.z1 - 0.2, 1.9, 0.2, 0, y + 2, y - 1);
  ctx.interactables.push({ kind: 'book', x: 206.5, z: C.z1 - 1.1, y, r: 1.4, label: '本を手にとる' });
  for (const [px, pz] of [[C.x1 - 0.5, C.z1 - 0.5], [C.x0 + 0.5, C.z0 + 0.5]]) {
    const b = IB(px, pz);
    b.cyl(px, y, pz, 0.22, 0.28, 0.5, 10, 0xd8d2c4);
    b.geom(new THREE.IcosahedronGeometry(0.55, 1), new THREE.Matrix4().compose(V(px, y + 1.1, pz), new THREE.Quaternion(), V(1, 1.3, 1)), 0x4f8a48);
    ctx.colliders.addCircle(px, pz, 0.3, y + 1.6);
  }
  ctx.landmarks.push({ id: 'cafe2', name: '喫茶 さくらテラス', x: C.x0, z: 35.6 });
}

// ---------------------------------------------------------------------------
// さくらモール (block C1): two floors around a skylit atrium with a sakura tree
// ---------------------------------------------------------------------------
const MALL_SHOPS = [
  ['ブックス 汐風', 'BOOKS', '#2f4a3a', '#f6efe0'], ['ファッション Hana', 'FASHION', '#f6e0e8', '#8a2a4a'], ['雑貨 こもれび', 'ZAKKA', '#f3ead6', '#6a4a2a'],
  ['スポーツ ウミカゼ', 'SPORTS', '#1f5fa8', '#ffffff'], ['靴 ステップ', 'SHOES', '#ffffff', '#2a2a2a'], ['めがね ミナト', 'EYEWEAR', '#e8f4fb', '#1f5fa8'],
  ['おもちゃ ポップ', 'TOYS', '#ffe14a', '#c0392b'], ['家電 デンキヤ', 'ELECTRONICS', '#2a2a2a', '#ffe14a'], ['アクセサリー Luna', 'ACCESSORY', '#fbe8f0', '#a8325a'],
  ['ドラッグ ハマ', 'DRUG', '#ffffff', '#2e8a4a'], ['キッチン雑貨 ハル', 'KITCHEN', '#fff6e0', '#c0392b'], ['CD & DVD 音の葉', 'MUSIC', '#20324a', '#9fd0f0'],
];

function mallShopSign(ctx, s) {
  return ctx.atlas2.draw('mall:' + s[0], 384, 72, (c, w, h) => drawBoard(c, w, h, { text: s[0], sub: s[1], bg: s[2], fg: s[3], font: FONTS.maru, weather: false }));
}

function buildMall(ctx, block, doors) {
  const M = { x0: 264.4, x1: 286.6, z0: -9.2, z1: 14.2 };
  const y1 = 5.0, f1 = 4.6, y2 = y1 + f1, f2 = 4.2, H = f1 + f2;
  const A = { x0: 270.5, x1: 280.5, z0: -3.0, z1: 8.0 }; // atrium void
  const D = 3.2; // depth of the shop units along the walls (galleries stay ~3 m wide)
  const entZ = [-5.4, -2.8];
  buildRoom(ctx, {
    ...M, y: y1, h: H, out: 0xf2eee6, outPat: PAT.SEAM, inC: 0xf6f3ec, floor: 0xe9e4da, floorPat: PAT.TILE, ceil: false, roof: false,
    open: {
      W: [{ a0: -6.4, a1: -4.4, yb: 0, yt: 2.6, kind: 'door' }, { a0: -3.8, a1: -1.8, yb: 0, yt: 2.6, kind: 'door' }, { a0: -1.6, a1: 9.6, yb: 0.1, yt: H - 0.6, kind: 'glass', pitch: 2.0, transom: 4.6 }],
      S: [{ a0: 268.0, a1: 283.0, yb: f1 + 0.9, yt: H - 0.8, kind: 'glass', pitch: 2.5 }],
      N: [{ a0: 268.0, a1: 283.0, yb: f1 + 0.9, yt: H - 0.8, kind: 'glass', pitch: 2.5 }],
    },
  });
  doors.add(ctx, M.x0 - 0.125, entZ[0], 'z', y1, { chime: false, name: 'mall', w: 2.0, h: 2.5 });
  doors.add(ctx, M.x0 - 0.125, entZ[1], 'z', y1, { chime: false, name: 'mall', w: 2.0, h: 2.5 });
  const IB = (x, z) => ctx.builders.get('interior', x, z);
  const TB = (x, z) => ctx.builders.get('toon', x, z);
  // roof with a skylight over the atrium
  const top = y1 + H;
  const roofC = { color: 0xb9b5ab, pattern: PAT.CONCRETE };
  const t = 0.25;
  for (const [a, b, c, d] of [[M.x0 - t, M.z0 - t, M.x1 + t, A.z0], [M.x0 - t, A.z1, M.x1 + t, M.z1 + t], [M.x0 - t, A.z0, A.x0, A.z1], [A.x1, A.z0, M.x1 + t, A.z1]]) {
    TB((a + c) / 2, (b + d) / 2).boxMM(a, top, b, c, top + 0.5, d, { ...roofC, skip: 'y' });
    hrect(IB((a + c) / 2, (b + d) / 2), Math.max(a, M.x0), Math.max(b, M.z0), Math.min(c, M.x1), Math.min(d, M.z1), top, -1, 0xf3f1ec, 0);
  }
  for (const [a, b, c, d] of [[M.x0 - t, M.z0 - t, M.x1 + t, M.z0], [M.x0 - t, M.z1, M.x1 + t, M.z1 + t], [M.x0 - t, M.z0, M.x0, M.z1], [M.x1, M.z0, M.x1 + t, M.z1]]) TB(a, b).boxMM(a, top + 0.5, b, c, top + 1.3, d, { color: 0xf2eee6, pattern: PAT.SEAM });
  // skylight: glass + steel grid, a little raised
  ctx.builders.get('glass', 275.5, 2.5).quad(V(A.x0, top + 0.9, A.z1), V(A.x1, top + 0.9, A.z1), V(A.x1, top + 0.9, A.z0), V(A.x0, top + 0.9, A.z0), 0xffffff, 0, { uvs: [[0, 0], [1, 0], [1, 1], [0, 1]] });
  const sk = TB(275.5, 2.5);
  for (let x = A.x0; x <= A.x1 + 0.01; x += A.x1 - A.x0 > 0 ? (A.x1 - A.x0) / 5 : 1) sk.boxMM(x - 0.05, top + 0.5, A.z0, x + 0.05, top + 0.95, A.z1, { color: 0x6a7076 });
  for (let z = A.z0; z <= A.z1 + 0.01; z += (A.z1 - A.z0) / 6) sk.boxMM(A.x0, top + 0.85, z - 0.05, A.x1, top + 0.95, z + 0.05, { color: 0x6a7076 });
  for (const [a, b, c, d] of [[A.x0, A.z0, A.x1, A.z0 + 0.1], [A.x0, A.z1 - 0.1, A.x1, A.z1], [A.x0, A.z0, A.x0 + 0.1, A.z1], [A.x1 - 0.1, A.z0, A.x1, A.z1]]) sk.boxMM(a, top, b, c, top + 0.9, d, { color: 0xf2eee6 });
  // 2F slab around the void (floor up, ceiling of 1F down) + glass railings on the gallery
  const slabs = [[M.x0, M.z0, M.x1, A.z0], [M.x0, A.z1, M.x1, M.z1], [M.x0, A.z0, A.x0, A.z1], [A.x1, A.z0, M.x1, A.z1]];
  for (const [a, b, c, d] of slabs) {
    for (let x = a; x < c - 0.01; x += 8) {
      const xb = Math.min(c, x + 8);
      hrect(IB(x, b), x, b, xb, d, y2, 1, 0xe9e4da, PAT.TILE);
      hrect(IB(x, b), x, b, xb, d, y2 - 0.5, -1, 0xf3f1ec, 0);
    }
    ctx.colliders.addSurface(a, b, c, d, () => y2, 3, { min: y2 - 1.5, max: y2 + 2.5, under: true });
  }
  // slab edges around the void
  const eb = IB(275.5, 2.5);
  for (const [a, b, c, d] of [[A.x0, A.z0 - 0.02, A.x1, A.z0], [A.x0, A.z1, A.x1, A.z1 + 0.02]]) eb.boxMM(a, y2 - 0.5, b, c, y2, d, { color: 0xe2ddd2 });
  for (const [a, b, c, d] of [[A.x0 - 0.02, A.z0, A.x0, A.z1], [A.x1, A.z0, A.x1 + 0.02, A.z1]]) eb.boxMM(a, y2 - 0.5, b, c, y2, d, { color: 0xe2ddd2 });
  const ST = { x0: 277.3, x1: 280.5, z0: -3.0, z1: 7.0 }; // stairs+escalator from 1F (south) up to the gallery (north)
  const rails = [[A.x0, A.z0, A.x0, A.z1], [A.x0, A.z1, A.x1, A.z1], [A.x1, A.z1, A.x1, A.z0], [A.x0, A.z0, ST.x0, A.z0]];
  for (const [a, b, c, d] of rails) {
    ctx.builders.get('glass', (a + c) / 2, (b + d) / 2).quad(V(a, y2, b), V(c, y2, d), V(c, y2 + 1.05, d), V(a, y2 + 1.05, b), 0xffffff, 0, { uvs: [[0, 0], [1, 0], [1, 1], [0, 1]] });
    IB(a, b).rod(V(a, y2 + 1.08, b), V(c, y2 + 1.08, d), 0.04, 0.04, 6, 0xb9bdc2);
    const col = ctx.colliders.addSegment(a, b, c, d, 0.15, y2 + 1.1);
    if (col) col.yBottom = y2 - 0.6;
  }
  // stairs + escalator into the void (rising toward -z)
  const steps = Math.round(f1 / 0.17);
  const run = (ST.z1 - ST.z0) / steps;
  const sx1 = ST.x1 - 1.3;
  for (let i = 0; i < steps; i++) {
    const topY = y1 + (i + 1) * (f1 / steps);
    const za = ST.z1 - (i + 1) * run, zb = ST.z1 - i * run;
    IB(ST.x0, za).boxMM(ST.x0, topY - 0.25, za, sx1, topY + 0.001, zb, { color: 0xd9d5cc, pattern: PAT.TILE });
    IB(ST.x0, za).boxMM(ST.x0, topY - 0.004, za, sx1, topY + 0.012, za + 0.05, { color: 0xb08a5a });
  }
  // stringers + soffit
  for (const x of [ST.x0, sx1]) IB(x, 1).quadOut(V(x, y1, ST.z1), V(x, y2, ST.z0), V(x, y2 - 0.35, ST.z0), V(x, y1 - 0.01, ST.z1 - 0.3), V(x + (x === ST.x0 ? 3 : -3), y1 + 2, 1), 0xe2ddd2, 0);
  const es = IB(sx1 + 0.65, 1.5);
  es.quadOut(V(sx1 + 0.05, y1, ST.z1), V(ST.x1 - 0.05, y1, ST.z1), V(ST.x1 - 0.05, y2, ST.z0), V(sx1 + 0.05, y2, ST.z0), V(sx1 + 0.6, y1 - 6, 1.5), 0x6a6e74, PAT.LATTICE);
  for (const x of [ST.x0, sx1, ST.x1]) {
    ctx.builders.get('glass', x, 1.5).quad(V(x, y1 + 0.05, ST.z1), V(x, y2 + 0.05, ST.z0), V(x, y2 + 1.0, ST.z0), V(x, y1 + 1.0, ST.z1), 0xffffff, 0, { uvs: [[0, 0], [1, 0], [1, 1], [0, 1]] });
    IB(x, 1.5).rod(V(x, y1 + 1.02, ST.z1 + 0.4), V(x, y2 + 1.02, ST.z0 - 0.4), 0.04, 0.04, 6, 0x2a2c30);
  }
  ctx.colliders.addSurface(ST.x0, ST.z0, ST.x1, ST.z1 + 0.2, (x, z) => {
    if (z >= ST.z1) return y1;
    const k = Math.min(1, Math.max(0, (ST.z1 - z) / (ST.z1 - ST.z0)));
    if (x > sx1) return y1 + k * f1;
    const i = Math.min(steps - 1, Math.floor((ST.z1 - z) / run));
    return y1 + (i + 1) * (f1 / steps);
  }, 4, { min: y1 - 1.5, max: y2 + 2.5, under: true });
  // block under the stairs (1F walkers walk around it), side rails on the gallery level
  for (let k = 0; k < 6; k++) {
    const za = ST.z0 + ((ST.z1 - ST.z0) * k) / 6, zb = ST.z0 + ((ST.z1 - ST.z0) * (k + 1)) / 6;
    const yAt = y1 + ((ST.z1 - za) / (ST.z1 - ST.z0)) * f1;
    const c = ctx.colliders.addBox((ST.x0 + ST.x1) / 2, (za + zb) / 2, (ST.x1 - ST.x0) / 2, (zb - za) / 2, 0, yAt - (zb - za) * (f1 / (ST.z1 - ST.z0)) - 0.55, y1 - 1);
    void c;
  }
  for (const x of [ST.x0 - 0.05, ST.x1 + 0.05]) {
    const c = ctx.colliders.addSegment(x, ST.z0, x, ST.z1, 0.15, y2 + 1.1);
    if (c) c.yBottom = y1 - 1;
  }
  // shop fronts on both floors (fake interiors behind lit glass) with signs
  const fronts = [];
  // the north/south rows start east of the entrance hall so both doors open onto a clear floor
  const RX0 = 268.4;
  const rowN = (yy) => [[RX0, 273.0], [273.4, 278.0], [278.4, M.x1 - D]].map(([a, b]) => ({ axis: 'x', c: M.z0 + D, a0: a, a1: b, dir: 1, y: yy }));
  const rowS = (yy) => [[RX0, 273.0], [273.4, 278.0], [278.4, M.x1 - D]].map(([a, b]) => ({ axis: 'x', c: M.z1 - D, a0: a, a1: b, dir: -1, y: yy }));
  const rowE = (yy) => [[M.z0 + D + 0.2, -0.6], [-0.2, 5.0], [5.4, M.z1 - D - 0.2]].map(([a, b]) => ({ axis: 'z', c: M.x1 - D, a0: a, a1: b, dir: -1, y: yy }));
  fronts.push(...rowN(y1), ...rowS(y1), ...rowE(y1), ...rowN(y2), ...rowS(y2), ...rowE(y2));
  let si = 0;
  for (const f of fronts) {
    const s = MALL_SHOPS[si++ % MALL_SHOPS.length];
    const fh = f.y === y1 ? f1 : f2;
    const b = IB(f.axis === 'x' ? (f.a0 + f.a1) / 2 : f.c, f.axis === 'x' ? f.c : (f.a0 + f.a1) / 2);
    // shop box behind the front (dark interior block keeps the gallery tidy)
    if (f.axis === 'x') {
      const zIn = f.c - f.dir * (D - 0.05);
      b.boxMM(f.a0 - 0.2, f.y, Math.min(f.c, zIn), f.a1 + 0.2, f.y + fh - (f.y === y1 ? 0.5 : 0), Math.max(f.c, zIn), { color: 0xeae6dc, skip: f.dir > 0 ? 'Z' : 'z' });
    } else {
      const xIn = f.c - f.dir * (D - 0.05);
      b.boxMM(Math.min(f.c, xIn), f.y, f.a0 - 0.2, Math.max(f.c, xIn), f.y + fh - (f.y === y1 ? 0.5 : 0), f.a1 + 0.2, { color: 0xeae6dc, skip: f.dir > 0 ? 'X' : 'x' });
    }
    // glazing with a lit fake interior
    const w = ctx.builders.get('window', f.axis === 'x' ? (f.a0 + f.a1) / 2 : f.c, f.axis === 'x' ? f.c : (f.a0 + f.a1) / 2);
    const gy0 = f.y + 0.05, gy1 = f.y + 2.85;
    if (f.axis === 'x') {
      const zc = f.c + f.dir * 0.012;
      const P = f.dir > 0 ? [V(f.a0, gy0, zc), V(f.a1, gy0, zc), V(f.a1, gy1, zc), V(f.a0, gy1, zc)] : [V(f.a1, gy0, zc), V(f.a0, gy0, zc), V(f.a0, gy1, zc), V(f.a1, gy1, zc)];
      w.quad(P[0], P[1], P[2], P[3], 0xffffff, 150 + (si % 50), { uvs: [[0, 0], [1, 0], [1, 1], [0, 1]] });
    } else {
      const xc = f.c + f.dir * 0.012;
      const P = f.dir > 0 ? [V(xc, gy0, f.a1), V(xc, gy0, f.a0), V(xc, gy1, f.a0), V(xc, gy1, f.a1)] : [V(xc, gy0, f.a0), V(xc, gy0, f.a1), V(xc, gy1, f.a1), V(xc, gy1, f.a0)];
      w.quad(P[0], P[1], P[2], P[3], 0xffffff, 150 + (si % 50), { uvs: [[0, 0], [1, 0], [1, 1], [0, 1]] });
    }
    vsign(ctx, f.axis, f.c + f.dir * 0.02, f.a0 + 0.4, f.a1 - 0.4, f.y + 3.0, f.y + 3.0 + (f.a1 - f.a0 - 0.8) / 5.3, f.dir, mallShopSign(ctx, s), 0.9);
    const col = f.axis === 'x' ? ctx.colliders.addSegment(f.a0 - 0.2, f.c, f.a1 + 0.2, f.c, 0.2, f.y + fh) : ctx.colliders.addSegment(f.c, f.a0 - 0.2, f.c, f.a1 + 0.2, 0.2, f.y + fh);
    if (col) col.yBottom = f.y - 0.5;
    const ix = f.axis === 'x' ? (f.a0 + f.a1) / 2 : f.c + f.dir * 1.0, iz = f.axis === 'x' ? f.c + f.dir * 1.0 : (f.a0 + f.a1) / 2;
    ctx.interactables.push({ kind: 'mallshop', x: ix, z: iz, y: f.y, r: 1.8, label: `${s[0]}をのぞく`, shop: s[0], sub: s[1] });
  }
  // the exposed west ends of the north/south shop rows
  for (const [za, zb] of [[M.z0, M.z0 + D], [M.z1 - D, M.z1]]) {
    const col = ctx.colliders.addSegment(RX0 - 0.2, za, RX0 - 0.2, zb, 0.12, y2 + f2);
    if (col) col.yBottom = y1 - 0.5;
  }
  // sakura tree in a round planter under the skylight, with benches
  const tx = 273.9, tz = 2.5;
  const pb = IB(tx, tz);
  pb.cyl(tx, y1, tz, 2.3, 2.3, 0.55, 20, 0xc9c1b2, PAT.STONE);
  pb.cyl(tx, y1 + 0.55, tz, 2.1, 2.1, 0.02, 20, 0x6a5038);
  ctx.trees.push({ kind: 'sakura', x: tx, z: tz, y: y1 + 0.55, seed: 2626, scale: 0.52, compact: true });
  ctx.colliders.addCircle(tx, tz, 2.35, y1 + 0.6, y1 - 1);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const bx = tx + Math.cos(a) * 3.2, bz = tz + Math.sin(a) * 3.2;
    benchAt(ctx, pb, bx, y1, bz, -a - Math.PI / 2, 0xb08a5a, 'モールのベンチに座る');
  }
  // crepe stand (1F) and a gachapon corner + food court tables (2F)
  const cb = IB(266.5, 9.5);
  cb.boxMM(265.4, y1, 7.6, 268.0, y1 + 1.05, 9.0, { color: 0xf6c0d0 });
  cb.boxMM(265.3, y1 + 1.05, 7.5, 268.1, y1 + 1.1, 9.1, { color: 0xffffff });
  cb.boxMM(265.4, y1 + 2.4, 7.4, 268.0, y1 + 2.5, 9.2, { color: 0xf39ab8 });
  for (const [a, b] of [[265.45, 7.45], [267.95, 7.45], [265.45, 9.15], [267.95, 9.15]]) cb.box(a, y1 + 1.75, b, 0.06, 1.3, 0.06, { color: 0xf2f2ee });
  const crepe = ctx.atlas2.draw('mall-crepe', 192, 64, (c, w, h) => drawBoard(c, w, h, { text: 'クレープ 春風', sub: 'CREPE', bg: '#ffffff', fg: '#c86a8a', font: FONTS.maru, weather: false }));
  vsign(ctx, 'z', 268.12, 7.6, 9.0, y1 + 2.0, y1 + 2.4, 1, crepe, 0.8);
  ctx.colliders.addBox(266.7, 8.3, 1.4, 0.8, 0, y1 + 1.1, y1 - 1);
  ctx.interactables.push({ kind: 'crepe', x: 268.9, z: 8.3, y: y1, r: 1.4, label: 'クレープを買う' });
  const gacha = ctx.atlas2.draw('mall-gacha', 128, 128, (c, w, h) => {
    c.fillStyle = '#e8432e';
    c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(255,255,255,0.85)';
    c.fillRect(w * 0.1, h * 0.08, w * 0.8, h * 0.5);
    const cols = ['#f6c341', '#2f6fd0', '#48a860', '#f08ab0', '#ffffff', '#9a4ac0'];
    for (let i = 0; i < 14; i++) {
      c.fillStyle = cols[i % cols.length];
      c.beginPath();
      c.arc(w * 0.18 + (i % 5) * w * 0.16, h * 0.16 + Math.floor(i / 5) * h * 0.15, w * 0.07, 0, Math.PI * 2);
      c.fill();
    }
    c.fillStyle = '#333';
    c.beginPath();
    c.arc(w / 2, h * 0.75, w * 0.12, 0, Math.PI * 2);
    c.fill();
  });
  for (let i = 0; i < 4; i++) {
    const gx = 266.0 + i * 0.75, gz = M.z1 - 5.2;
    const b = IB(gx, gz);
    b.boxMM(gx - 0.33, y2, gz - 0.3, gx + 0.33, y2 + 1.5, gz + 0.3, { color: 0xe8432e });
    vsign(ctx, 'x', gz - 0.31, gx - 0.3, gx + 0.3, y2 + 0.2, y2 + 1.45, -1, gacha, 0.6);
  }
  ctx.colliders.addBox(267.1, M.z1 - 5.2, 1.5, 0.35, 0, y2 + 1.5, y2 - 1);
  ctx.interactables.push({ kind: 'gacha', x: 267.1, z: M.z1 - 6.3, y: y2, r: 1.6, label: 'ガチャを回す' });
  for (const [fx, fz] of [[266.5, -1.5], [266.5, 2.5], [266.5, 6.0]]) {
    const b = IB(fx, fz);
    b.cyl(fx, y2, fz, 0.05, 0.05, 0.72, 6, 0x333333);
    b.cyl(fx, y2 + 0.72, fz, 0.55, 0.55, 0.04, 14, 0xf2f0ea);
    ctx.colliders.addCircle(fx, fz, 0.6, y2 + 0.8, y2 - 1);
    for (const e of [-1, 1]) {
      const sz = fz + e * 0.9;
      b.box(fx, y2 + 0.44, sz, 0.44, 0.06, 0.44, { color: 0xe2708f });
      b.box(fx, y2 + 0.22, sz, 0.05, 0.44, 0.05, { color: 0x333333 });
      ctx.interactables.push({ kind: 'bench', x: fx, z: sz - e * 0.45, y: y2, r: 0.8, label: 'フードコートの席に座る', sit: { x: fx, y: y2 + 0.45, z: sz, yaw: e > 0 ? 0 : Math.PI } });
    }
  }
  // floor guide board
  const guide = ctx.atlas2.draw('mall-guide', 192, 256, (c, w, h) => {
    c.fillStyle = '#fbf8f2';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#e2708f';
    c.fillRect(0, 0, w, h * 0.14);
    c.fillStyle = '#fff';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = `700 ${h * 0.07}px ${FONTS.maru}`;
    c.fillText('フロアガイド', w / 2, h * 0.07);
    c.fillStyle = '#273049';
    c.textAlign = 'left';
    c.font = `700 ${h * 0.055}px ${FONTS.maru}`;
    c.fillText('2F  フードコート・本・音楽', 10, h * 0.26);
    c.fillText('     おもちゃ・ガチャ', 10, h * 0.34);
    c.fillText('1F  ファッション・雑貨', 10, h * 0.5);
    c.fillText('     クレープ・くすり', 10, h * 0.58);
    c.fillStyle = '#6a7076';
    c.font = `500 ${h * 0.045}px ${FONTS.gothic}`;
    c.fillText('営業時間 10:00〜21:00', 10, h * 0.8);
  });
  // in the pocket beside the entrance, facing the doors
  const gb = IB(266.0, -7.4);
  gb.boxMM(265.3, y1, -7.5, 266.7, y1 + 1.9, -7.3, { color: 0xd8d4cc });
  vsign(ctx, 'x', -7.29, 265.35, 266.65, y1 + 0.2, y1 + 1.85, 1, guide, 0.6);
  ctx.colliders.addBox(266.0, -7.4, 0.7, 0.15, 0, y1 + 1.9, y1 - 1);
  ctx.interactables.push({ kind: 'sign', x: 266.0, z: -6.3, y: y1, r: 1.4, label: 'フロアガイドを見る', text: '1F ファッション・雑貨・クレープ / 2F フードコート・本・おもちゃ。屋上はないけれど、天窓から空が見える。' });
  // lights: 1F under the gallery, 2F ceiling
  ceilingLights(ctx, M.x0 + 0.5, M.z0 + 0.5, M.x1 - 0.5, A.z0 - 0.3, y2 - 0.5, 3.2);
  ceilingLights(ctx, M.x0 + 0.5, A.z1 + 0.3, M.x1 - 0.5, M.z1 - 0.5, y2 - 0.5, 3.2);
  ceilingLights(ctx, M.x0 + 0.5, M.z0 + 0.5, M.x1 - 0.5, M.z1 - 0.5, top, 3.6);
  // ---- exterior: entrance forecourt with steps, logo, banners ----
  const kit = new Kit(ctx, M.x0, 2.5);
  const tbb = kit.t;
  const fy = (z) => roadSurfaceY(block.x0, z);
  for (let z = -7.0; z < -1.2; z += 0.6) {
    // steps up from the sidewalk (front at block.x0) to the floor level
    const g = fy(z);
    const n = Math.max(1, Math.round((y1 - g) / 0.16));
    for (let i = 0; i < n; i++) tbb.boxMM(block.x0 + i * 0.32, g - 0.2, z, M.x0 - 0.25, g + ((i + 1) * (y1 - g)) / n + 0.001, z + 0.6, { color: 0xd2cdc2, pattern: PAT.PAVING });
  }
  ctx.colliders.addSurface(block.x0, -7.0, M.x0 - 0.2, -1.2, (x, z) => {
    const g = fy(z);
    const n = Math.max(1, Math.round((y1 - g) / 0.16));
    const i = Math.min(n - 1, Math.max(0, Math.floor((x - block.x0) / 0.32)));
    return g + ((i + 1) * (y1 - g)) / n;
  }, 2);
  // plinth along the rest of the facade
  tbb.boxMM(block.x0, roadSurfaceY(block.x0, M.z1) - 0.3, -1.2, M.x0 - 0.25, y1 - 0.3, M.z1 + 0.25, { color: 0xc9c3b8, pattern: PAT.PAVING });
  tbb.boxMM(block.x0, roadSurfaceY(block.x0, M.z0) - 0.3, M.z0 - 0.25, M.x0 - 0.25, y1 - 0.3, -7.0, { color: 0xc9c3b8, pattern: PAT.PAVING });
  ctx.colliders.addBox((block.x0 + M.x0 - 0.25) / 2, (M.z1 + 0.25 - 1.2) / 2, (M.x0 - 0.25 - block.x0) / 2, (M.z1 + 1.45) / 2, 0, y1 - 0.3);
  ctx.colliders.addBox((block.x0 + M.x0 - 0.25) / 2, (M.z0 - 0.25 - 7.0) / 2, (M.x0 - 0.25 - block.x0) / 2, Math.abs(M.z0 - 0.25 + 7.0) / 2, 0, y1 - 0.3);
  // canopy + logo over the entrance
  tbb.boxMM(M.x0 - 2.2, y1 + 2.75, -7.2, M.x0 - 0.25, y1 + 2.95, -1.0, { color: 0xe2708f });
  const logo = ctx.atlas2.draw('mall-logo', 512, 128, (c, w, h) => {
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#e2708f';
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
      c.beginPath();
      c.ellipse(h * 0.5 + Math.cos(a) * h * 0.17, h * 0.5 + Math.sin(a) * h * 0.17, h * 0.14, h * 0.095, a, 0, Math.PI * 2);
      c.fill();
    }
    c.textAlign = 'left';
    c.textBaseline = 'middle';
    fitText(c, 'さくらモール', w * 0.66, h * 0.52, FONTS.maru, '700');
    c.fillText('さくらモール', h * 0.95, h * 0.44);
    c.fillStyle = '#3fa36a';
    c.font = `700 ${h * 0.17}px ${FONTS.latin}`;
    c.fillText('SAKURA MALL', h * 0.98, h * 0.8);
  });
  signOnFace(kit, { o: V(M.x0 - 0.27, 0, 9.6), r: V(0, 0, -1), n: V(-1, 0, 0), len: 12 }, 6.0, y1 + H - 2.4, 7.2, 1.8, 0.0, logo, 0.9);
  // spring banners on the side walls
  const ban = ctx.atlas2.draw('mall-banner', 96, 320, (c, w, h) => drawVertical(c, w, h, { text: 'さくらフェア', bg: '#ffd6e4', fg: '#a8325a', font: FONTS.maru }));
  for (const z of [M.z0 - 0.27, M.z1 + 0.27]) {
    const f = z < 0 ? -1 : 1;
    for (const x of [268.0, 283.0]) signOnFace(kit, { o: V(x - f * 0.6, 0, z), r: V(f, 0, 0), n: V(0, 0, f), len: 1.2 }, 0.6, y1 + 1.2, 1.0, 3.4, 0.0, ban, 0.6);
  }
  ctx.landmarks.push({ id: 'mall', name: 'さくらモール', x: M.x0, z: -4 });
  return { y1, y2 };
}

// ---------------------------------------------------------------------------
// 桜ヶ浜市立図書館 (block B3)
// ---------------------------------------------------------------------------
function buildLibrary(ctx, block, doors) {
  const L = { x0: 225.6, x1: 241.0, z0: -77.4, z1: -58.2 };
  let gmax = -Infinity;
  for (const [x, z] of [[L.x0, L.z0], [L.x1, L.z0], [L.x1, L.z1], [L.x0, L.z1]]) gmax = Math.max(gmax, groundH(x, z));
  const y = gmax + 0.2, h = 5.2;
  const doorZ = -74.6;
  buildRoom(ctx, {
    ...L, y, h, out: 0xf2f0ea, outPat: PAT.NONE, inC: 0xf7f4ec, floor: 0xb08a5a, floorPat: PAT.PLANKS, ceil: 0xf3efe6, parapet: 0.6, roofC: 0xc9c5bb,
    open: {
      E: [{ a0: doorZ - 1.0, a1: doorZ + 1.0, yb: 0, yt: 2.4, kind: 'door' }, { a0: -73.2, a1: -59.0, yb: 0.3, yt: h - 0.6, kind: 'glass', pitch: 1.6, transom: 2.6 }],
      S: [{ a0: 226.4, a1: 240.2, yb: 0.3, yt: h - 0.6, kind: 'glass', pitch: 1.6, transom: 2.6 }],
      W: [{ a0: -76.0, a1: -60.0, yb: 3.2, yt: h - 0.4, kind: 'glass', pitch: 2.0 }],
    },
  });
  doors.add(ctx, L.x1 + 0.125, doorZ, 'z', y, { chime: false, name: 'library' });
  const IB = (x, z) => ctx.builders.get('interior', x, z);
  // entrance steps from the avenue sidewalk + canopy + name
  const kit = new Kit(ctx, L.x1, doorZ);
  const t = kit.t;
  const sx0 = L.x1 + 0.25, sx1 = block.x1;
  const g = roadSurfaceY(sx1, doorZ);
  const n = Math.max(1, Math.round((y - g) / 0.16));
  for (let i = 0; i < n; i++) t.boxMM(sx1 - (i + 1) * ((sx1 - sx0) / n), g - 0.3, doorZ - 1.6, sx1 - i * ((sx1 - sx0) / n), g + ((i + 1) * (y - g)) / n, doorZ + 1.6, { color: 0xd2cdc2, pattern: PAT.PAVING });
  ctx.colliders.addSurface(sx0, doorZ - 1.6, sx1, doorZ + 1.6, (x) => g + Math.min(n, Math.max(1, Math.ceil((sx1 - x) / ((sx1 - sx0) / n)))) * ((y - g) / n), 2);
  for (const zz of [doorZ - 1.6, doorZ + 1.6]) {
    const c = ctx.colliders.addSegment(sx0, zz, sx1, zz, 0.15, y + 1);
    void c;
  }
  t.boxMM(L.x1 + 0.25, y + 2.7, doorZ - 2.0, L.x1 + 2.2, y + 2.9, doorZ + 2.0, { color: 0x9aa0a6 });
  const name = ctx.atlas2.draw('library-name', 512, 96, (c, w, h) => drawBoard(c, w, h, { text: '桜ヶ浜市立図書館', sub: 'SAKURAGAHAMA CITY LIBRARY', bg: '#f2f0ea', fg: '#2f4a3a', font: FONTS.mincho, weather: false }));
  signOnFace(kit, { o: V(L.x1 + 0.27, 0, -62.0), r: V(0, 0, 1), n: V(1, 0, 0), len: 10 }, -12.6, y + h - 1.0, 5.0, 0.94, 0.0, name, 0.6);
  // ---- interior ----
  ceilingLights(ctx, L.x0, L.z0, L.x1, L.z1, y + h, 3.0, [1.8, 0.2]);
  const books = productTex(ctx, 'books');
  // shelf rows (E-W), both faces filled with spines
  for (let i = 0; i < 5; i++) {
    const z = -75.2 + i * 2.4;
    const xa = 226.6, xb = 233.6;
    IB(230, z).boxMM(xa, y, z - 0.28, xb, y + 1.95, z + 0.28, { color: 0x8a6a4c, pattern: PAT.PLANKS });
    vsign(ctx, 'x', z - 0.29, xa + 0.05, xb - 0.05, y + 0.08, y + 1.88, -1, books, 0.25, 1.2);
    vsign(ctx, 'x', z + 0.29, xa + 0.05, xb - 0.05, y + 0.08, y + 1.88, 1, books, 0.25, 1.2);
    ctx.colliders.addBox((xa + xb) / 2, z, (xb - xa) / 2, 0.3, 0, y + 1.95, y - 1);
    ctx.interactables.push({ kind: 'book', x: (xa + xb) / 2, z: z + 1.2, y, r: 2.2, label: '本棚を眺める' });
  }
  // wall shelves along the west wall under the high windows
  IB(L.x0 + 0.3, -68).boxMM(L.x0, y, -76.8, L.x0 + 0.45, y + 2.6, -59.0, { color: 0x8a6a4c });
  vsign(ctx, 'z', L.x0 + 0.46, -76.6, -59.2, y + 0.1, y + 2.5, 1, books, 0.25, 1.5);
  ctx.colliders.addBox(L.x0 + 0.25, -67.9, 0.3, 8.9, 0, y + 2.6, y - 1);
  // circulation counter by the entrance
  IB(238, -71).boxMM(236.6, y, -72.6, 239.6, y + 1.05, -71.6, { color: 0x6a4a36, pattern: PAT.PLANKS });
  IB(238, -71).boxMM(236.55, y + 1.05, -72.65, 239.65, y + 1.1, -71.55, { color: 0xe8e0d0 });
  ctx.builders.get('emissive', 238, -72).box(238.2, y + 1.3, -72.1, 0.4, 0.28, 0.02, { color: 0x9fd0f0 });
  ctx.colliders.addBox(238.1, -72.1, 1.6, 0.6, 0, y + 1.1, y - 1);
  ctx.interactables.push({ kind: 'library', what: 'counter', x: 238.1, z: -70.6, y, r: 1.6, label: '本を借りる' });
  // reading tables by the south windows
  for (const tx of [228.6, 232.6, 236.6]) {
    const tz = -60.6;
    const b = IB(tx, tz);
    b.boxMM(tx - 1.2, y + 0.7, tz - 0.6, tx + 1.2, y + 0.75, tz + 0.6, { color: 0xb08a5a });
    for (const [a, c] of [[-1.1, -0.5], [1.1, -0.5], [1.1, 0.5], [-1.1, 0.5]]) b.box(tx + a, y + 0.35, tz + c, 0.06, 0.7, 0.06, { color: 0x6a4a36 });
    ctx.builders.get('emissive', tx, tz).box(tx, y + 0.95, tz, 0.16, 0.12, 0.16, { color: 0xfff1d6 });
    ctx.colliders.addBox(tx, tz, 1.25, 0.62, 0, y + 0.8, y - 1);
    for (const e of [-1, 1]) {
      for (const ox of [-0.6, 0.6]) {
        const sx = tx + ox, sz = tz + e * 1.0;
        b.box(sx, y + 0.44, sz, 0.42, 0.06, 0.42, { color: 0x6a8a5a });
        b.box(sx, y + 0.22, sz, 0.05, 0.44, 0.05, { color: 0x3a3a3a });
        b.box(sx, y + 0.72, sz + e * 0.19, 0.42, 0.5, 0.04, { color: 0x6a8a5a });
        ctx.interactables.push({ kind: 'bench', x: sx, z: sz + e * 0.45, y, r: 0.7, label: '閲覧席に座る', sit: { x: sx, y: y + 0.45, z: sz, yaw: e > 0 ? 0 : Math.PI } });
      }
    }
  }
  // children's corner: low shelves, a round rug, cushions
  const ck = IB(229, -76);
  ck.cyl(236.0, y + 0.002, -66.0, 2.2, 2.2, 0.02, 20, 0xf2b6c8);
  for (const [cx, cz, cc] of [[235.0, -65.4, 0x9fd0f0], [236.8, -66.8, 0xf6c341], [236.6, -64.9, 0x7ac07a]]) ck.cyl(cx, y, cz, 0.38, 0.32, 0.32, 12, cc);
  ck.boxMM(234.2, y, -68.8, 238.6, y + 0.9, -68.4, { color: 0xe8d8b8 });
  vsign(ctx, 'x', -68.39, 234.3, 238.5, y + 0.05, y + 0.85, 1, books, 0.25, 0.7);
  ctx.colliders.addBox(236.4, -68.6, 2.2, 0.25, 0, y + 0.9, y - 1);
  ctx.landmarks.push({ id: 'library', name: '市立図書館', x: L.x1, z: doorZ });
}

// ---------------------------------------------------------------------------
// 中央広場 around subway exit 1 (block B2)
// ---------------------------------------------------------------------------
function buildPlaza(ctx, block) {
  const rng = new RNG(4646);
  const fx = 229.4, fz = -33.0;
  const fy = groundH(fx, fz);
  const b = ctx.builders.get('toon', fx, fz);
  // fountain: low stone basin, water, a tiered centre piece with a spout and splash crown
  // basin: outer wall, inner wall, rim ring and a tiled floor under the water
  const N = 32, R0 = 3.15, R1 = 3.45, top = fy + 0.36, floorY = fy + 0.02;
  for (let i = 0; i < N; i++) {
    const a0 = (i / N) * Math.PI * 2, a1 = ((i + 1) / N) * Math.PI * 2;
    const P = (r, a, yy) => V(fx + Math.cos(a) * r, yy, fz + Math.sin(a) * r);
    b.quadOut(P(R1, a0, fy - 0.3), P(R1, a1, fy - 0.3), P(R1, a1, top), P(R1, a0, top), V(fx, top, fz), 0xc9c1b2, PAT.STONE);
    b.quadOut(P(R0, a1, floorY), P(R0, a0, floorY), P(R0, a0, top), P(R0, a1, top), V(fx + Math.cos((a0 + a1) / 2) * 9, top, fz + Math.sin((a0 + a1) / 2) * 9), 0xb9b1a2, PAT.STONE);
    b.quadOut(P(R0, a0, top), P(R1, a0, top), P(R1, a1, top), P(R0, a1, top), V(fx, top - 3, fz), 0xd8d0c0, 0);
    b.quadOut(V(fx, floorY, fz), P(R0, a0, floorY), P(R0, a1, floorY), V(fx, floorY, fz), V(fx, floorY - 3, fz), 0x6f8f98, PAT.TILE);
  }
  b.cyl(fx, fy - 0.1, fz, 0.7, 0.55, 1.3, 14, 0xc9c1b2, PAT.STONE);
  b.cyl(fx, fy + 1.2, fz, 1.3, 1.05, 0.2, 16, 0xd8d0c0);
  b.cyl(fx, fy + 1.4, fz, 0.22, 0.18, 0.55, 10, 0xc9c1b2, PAT.STONE);
  const wg = new THREE.CircleGeometry(3.25, 32);
  wg.rotateX(-Math.PI / 2);
  const wpos = wg.attributes.position;
  const cols = [], pat = [];
  for (let i = 0; i < wpos.count; i++) {
    const r = Math.hypot(wpos.getX(i), wpos.getZ(i)) / 3.25;
    cols.push(r < 0.45 ? 0.85 : 0.1, 0.3, 1 - Math.min(1, r));
    pat.push(0);
  }
  wg.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  wg.setAttribute('pattern', new THREE.Float32BufferAttribute(pat, 1));
  const wmat = createRiverWaterMaterial();
  const water = new THREE.Mesh(wg, wmat);
  water.position.set(fx, fy + 0.3, fz);
  water.renderOrder = 2;
  water.name = 'fountain';
  ctx.scene.add(water);
  // upper bowl water + spout column, splash crown and the fall from the bowl rim
  const bowl = new THREE.Mesh(new THREE.CircleGeometry(1.0, 20).rotateX(-Math.PI / 2), wmat);
  bowl.geometry.setAttribute('color', new THREE.Float32BufferAttribute(new Array(bowl.geometry.attributes.position.count).fill([0.6, 0.5, 0.6]).flat(), 3));
  bowl.geometry.setAttribute('pattern', new THREE.Float32BufferAttribute(new Array(bowl.geometry.attributes.position.count).fill(0), 1));
  bowl.position.set(fx, fy + 1.36, fz);
  bowl.renderOrder = 2;
  ctx.scene.add(bowl);
  // water: a glassy curtain falling from the bowl, a jet with a white crown
  const gl = ctx.builders.get('glass', fx, fz);
  gl.cyl(fx, fy + 0.3, fz, 1.2, 1.08, 1.02, 24, 0xffffff, 0, { caps: false });
  gl.cyl(fx, fy + 1.62, fz, 0.16, 0.05, 1.2, 10, 0xffffff, 0, { caps: false });
  const spray = ctx.builders.get('emissive', fx, fz);
  spray.geom(new THREE.SphereGeometry(0.3, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.Matrix4().compose(V(fx, fy + 2.78, fz), new THREE.Quaternion(), V(1, 0.4, 1)), 0xf4fbff);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    spray.box(fx + Math.cos(a) * 1.16, fy + 0.34, fz + Math.sin(a) * 1.16, 0.18, 0.05, 0.18, { color: 0xf4fbff });
  }
  // benches facing the fountain
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const bx = fx + Math.cos(a) * 5.2, bz = fz + Math.sin(a) * 5.2;
    // face the fountain: seat direction (-sin ry, -cos ry) = (-cos a, -sin a)
    benchAt(ctx, b, bx, groundH(bx, bz), bz, Math.atan2(Math.cos(a), Math.sin(a)), 0x9a7454, '噴水のそばのベンチに座る');
  }
  // trees + flower beds
  for (const [tx, tz] of [[224.6, -42.4], [234.2, -42.4], [224.6, -23.0], [233.0, -23.0]]) {
    ctx.trees.push({ kind: 'sakura', x: tx, z: tz, seed: rng.int(1, 1e9), scale: 0.86 });
  }
  for (const [x0, z0, x1, z1] of [[223.4, -39.0, 225.0, -27.0], [233.6, -44.2, 235.4, -39.6]]) {
    const yy = groundH((x0 + x1) / 2, (z0 + z1) / 2);
    b.boxMM(x0, yy - 0.1, z0, x1, yy + 0.4, z1, { color: 0xb9b2a4, pattern: PAT.STONE });
    ctx.ground.rect(x0 + 0.1, z0 + 0.1, x1 - 0.1, z1 - 0.1, 0x6a5038, PAT.DIRT);
    // spring bedding: low leafy clumps full of tulips and pansies
    for (let z = z0 + 0.45; z < z1 - 0.3; z += 0.6) {
      for (let x = x0 + 0.45; x < x1 - 0.3; x += 0.6) {
        shrub(x, yy + 0.58, z, 0.38, 0.2, rng, { cards: 3, size: 0.3, flowers: GARDEN_FLOWERS, flowerCards: 3, mixed: true });
      }
    }
    ctx.colliders.addBox((x0 + x1) / 2, (z0 + z1) / 2, (x1 - x0) / 2, (z1 - z0) / 2, 0, yy + 0.4);
  }
  // clock post
  const cx = 228.0, cz = -24.0;
  const cy = groundH(cx, cz);
  b.cyl(cx, cy, cz, 0.12, 0.1, 4.6, 8, 0x3f4a44);
  b.box(cx, cy + 4.8, cz, 1.0, 1.0, 0.3, { color: 0x3f4a44 });
  const clock = ctx.atlas.cache.get('clock');
  const kit = new Kit(ctx, cx, cz);
  if (clock) for (const e of [-1, 1]) signOnFace(kit, { o: V(cx - 0.44 * e, cy, cz + e * 0.16), r: V(e, 0, 0), n: V(0, 0, e), len: 0.88 }, 0.44, 4.36, 0.88, 0.88, 0.0, clock, 0.6);
  ctx.clocks.push({ x: cx, y: cy + 4.8, z: cz, off: 0.17 });
  ctx.colliders.addCircle(cx, cz, 0.15);
  // plaza name stone
  const st = ctx.atlas2.draw('plaza-stone', 256, 72, (c, w, h) => drawBoard(c, w, h, { text: '中央広場', sub: 'CHUO PLAZA', bg: '#b8b2a6', fg: '#2a2a2a', font: FONTS.mincho, weather: false }));
  const sx = 241.4, sz = -43.0;
  const sy = groundH(sx, sz);
  b.boxMM(sx - 0.9, sy - 0.1, sz - 0.3, sx + 0.9, sy + 0.8, sz + 0.3, { color: 0xb8b2a6, pattern: PAT.STONE });
  signOnFace(kit, { o: V(sx - 0.9, sy, sz + 0.31), r: V(1, 0, 0), n: V(0, 0, 1), len: 1.8 }, 0.9, 0.15, 1.6, 0.45, 0.0, st, 0);
  ctx.colliders.addBox(sx, sz, 0.9, 0.3, 0, sy + 0.8);
  // bicycle racks with a few bikes along the west edge
  const rack = ctx.builders.get('detail', block.x0 + 0.7, -40);
  rack.boxMM(block.x0 + 0.2, groundH(block.x0, -40) + 0.25, -43.9, block.x0 + 0.3, groundH(block.x0, -40) + 0.32, -38.2, { color: 0x8a9096 });
  for (let i = 0; i < 8; i++) {
    const bz = -43.5 + i * 0.72;
    const bx = block.x0 + 0.9;
    if (rng.chance(0.7)) bicycle(ctx.builders.get('toon', bx, bz), bx, groundH(bx, bz) + 0.02, bz, rng.range(-0.1, 0.1), rng.pick([0xd8d8d0, 0x5a8fc4, 0xc44a4a, 0x2f2f2f, 0xe8c84a, 0x9fd0a0]));
  }
  ctx.colliders.addBox(block.x0 + 0.8, -41.0, 0.7, 2.9, 0, groundH(block.x0, -41) + 1.0);
  // classic lamps
  for (const [lx, lz] of [[226.0, -29.0], [233.0, -37.5], [236.0, -26.0]]) {
    const ly = groundH(lx, lz);
    b.cyl(lx, ly, lz, 0.08, 0.06, 3.8, 8, 0x3f4a44);
    ctx.builders.get('emissive', lx, lz).geom(new THREE.SphereGeometry(0.24, 12, 8), new THREE.Matrix4().makeTranslation(lx, ly + 4.05, lz), 0xfff4dc);
    ctx.lamps.push({ x: lx, y: ly + 4.0, z: lz, r: 5 });
    ctx.colliders.addCircle(lx, lz, 0.12);
  }
  ctx.landmarks.push({ id: 'plaza', name: '中央広場', x: fx, z: fz });
}

// ---------------------------------------------------------------------------
// block C2: forecourt around exit 2 + the karaoke / game centre building
// ---------------------------------------------------------------------------
function buildC2(ctx, block) {
  const lot = { x0: 270.6, x1: block.x1, z0: block.z0, z1: block.z1, front: 'W', seed: 77123 };
  const res = midrise(ctx, lot, { floors: 6, style: 'panel', color: 0x3c3f58, shop: { name: 'GAME 汐風', sub: 'ゲームセンター・プリクラ', bg: '#2a2a6a', fg: '#ffe14a', font: 'bold' }, blade: false, exposed: { back: false } });
  // a big vertical sign for the karaoke upstairs
  const uv = ctx.atlas2.draw('karaoke-blade', 96, 480, (c, w, h) => drawVertical(c, w, h, { text: 'カラオケハルカ', bg: '#c0392b', fg: '#ffe14a', font: FONTS.bold, border: '#ffe14a' }));
  const kit = new Kit(ctx, lot.x0, (lot.z0 + lot.z1) / 2);
  const face = { o: V(lot.x0 + 0.3, 0, lot.z0 + 1.2), r: V(0, 0, 1), n: V(-1, 0, 0), len: lot.z1 - lot.z0 };
  face.o.y = res.y0;
  bladeSign(kit, face, 0.4, 4.8, 1.1, 10.5, 0.2, uv, 1.2);
  // forecourt planters and vending machines by exit 2
  const b = ctx.builders.get('toon', 266, -42);
  for (const [x0, z0, x1, z1] of [[262.0, -44.2, 269.6, -43.2], [262.0, -21.4, 263.4, -20.8]]) {
    const yy = groundH((x0 + x1) / 2, (z0 + z1) / 2);
    b.boxMM(x0, yy - 0.1, z0, x1, yy + 0.45, z1, { color: 0xb9b2a4, pattern: PAT.STONE });
    // clipped azaleas (tsutsuji) in bloom
    const prng = new RNG(Math.round(x0 * 10 + z0));
    for (let x = x0 + 0.35; x < x1 - 0.2; x += 0.55) shrub(x, yy + 0.72, (z0 + z1) / 2, 0.36, 0.26, prng, { cards: 4, size: 0.32, flowers: AZALEA, flowerCards: 3 });
    ctx.colliders.addBox((x0 + x1) / 2, (z0 + z1) / 2, (x1 - x0) / 2, (z1 - z0) / 2, 0, yy + 0.5);
  }
  ctx.vending.push({ x: 269.6, z: -22.0, ry: Math.PI / 2, seed: 3131, n: 2 });
}

// ---------------------------------------------------------------------------
export function buildInteriors(ctx, scene) {
  const doors = new AutoDoors();
  const specials = {
    A0: (c, b) => buildCafe(c, b, doors),
    B0: (c, b) => buildKonbini(c, b, doors),
    B2: (c, b) => buildPlaza(c, b),
    B3: (c, b) => buildLibrary(c, b, doors),
    C1: (c, b) => buildMall(c, b, doors),
    C2: (c, b) => buildC2(c, b),
  };
  return { doors, specials, finalize: () => doors.finalize(ctx, scene) };
}

void SUBWAY;
void bench;
void GROUND_SHOPS;
