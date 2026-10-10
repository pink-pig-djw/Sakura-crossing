import * as THREE from 'three';
import { RNG } from '../core/rng.js';
import { PAT, SOLIDS } from '../core/builder.js';
import { FONTS } from '../render/atlas.js';
import { books, goods, shelving, hex, shade, face } from './furnish.js';

// Shop interiors, modelled: every kind of shop gets its own fittings and goods (a bakery's
// trays of bread under tongs, a fishmonger's ice bed, a barber's chairs, a crane game...),
// so no two shops look like one template recoloured.
//
// A shop is built in a local frame on its front wall (see `shopFrame`): x runs from 0 to W
// across the shop as seen from the street, z from 0 at the front wall back to -D at the back
// wall, y up from the floor. The door is at x = door; an aisle in from it is kept clear.

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const PI = Math.PI;
let _sph = null, _sphLo = null, _hemi = null;
const sphGeo = () => (_sph ??= new THREE.IcosahedronGeometry(1, 1));
const sphGeoLo = () => (_sphLo ??= new THREE.IcosahedronGeometry(1, 0)); // small things: a few pixels each
const hemiGeo = () => (_hemi ??= new THREE.SphereGeometry(1, 10, 5, 0, PI * 2, 0, PI / 2));
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _e = new THREE.Euler();

// ---------------------------------------------------------------------------
// frame
// ---------------------------------------------------------------------------
export function shopFrame(ctx, axis, c, a0, a1, dir, y, seed, fn) {
  const mx = axis === 'x' ? (a0 + a1) / 2 : c, mz = axis === 'x' ? c : (a0 + a1) / 2;
  const B = ['props', 'propsSign', 'glass', 'emissive'].map((n) => ctx.builders.get(n, mx, mz));
  let x, z, ry;
  if (axis === 'x') [x, z, ry] = dir > 0 ? [a0, c, 0] : [a1, c, PI];
  else [x, z, ry] = dir > 0 ? [c, a1, PI / 2] : [c, a0, -PI / 2];
  for (const b of B) b.pushTRS(x, y, z, ry);
  const cs = Math.cos(ry), sn = Math.sin(ry);
  const toW = (lx, lz) => [x + lx * cs + lz * sn, z - lx * sn + lz * cs];
  const F = {
    b: B[0], sb: B[1], gb: B[2], eb: B[3], W: a1 - a0, y, rng: new RNG(seed), toW, ctx,
    // a collider over a local rect, h high
    solid(lx0, lz0, lx1, lz1, h) {
      const [ax, az] = toW(lx0, lz0), [bx, bz] = toW(lx1, lz1);
      ctx.colliders.addBox((ax + bx) / 2, (az + bz) / 2, Math.abs(bx - ax) / 2, Math.abs(bz - az) / 2, 0, y + h, y - 0.5);
    },
    // a seat at (lx, lz), sy high, facing local direction (fx, fz)
    seat(lx, lz, sy, fx, fz, label) {
      const [wx, wz] = toW(lx, lz);
      const dx = fx * cs + fz * sn, dz = -fx * sn + fz * cs;
      ctx.interactables.push({ kind: 'bench', x: wx + dx * 0.45, z: wz + dz * 0.45, y, r: 0.8, label, sit: { x: wx, y: y + sy, z: wz, yaw: Math.atan2(-dx, -dz) } });
    },
    // something to look at or buy; inside a fitted-out shop it speaks for that kind of shop
    item(lx, lz, o) {
      const [wx, wz] = toW(lx, lz);
      const it = { x: wx, z: wz, y, r: 1.4, ...o };
      if (F.kind) Object.assign(it, { kind: 'shop', shopKind: F.kind, inside: true });
      ctx.interactables.push(it);
    },
  };
  const was = SOLIDS.on;
  SOLIDS.on = false;
  try {
    fn(F);
  } finally {
    SOLIDS.on = was;
    for (const b of B) b.pop();
  }
}

// ---------------------------------------------------------------------------
// primitives (local frame)
// ---------------------------------------------------------------------------
const box = (b, x0, y0, z0, x1, y1, z1, color, o = {}) =>
  b.boxMM(Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1), Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1), { color, ...o });
function ball(b, x, y, z, r, color, sy = 1) {
  _m.compose(V(x, y, z), _q.identity(), _s.set(r, r * sy, r));
  b.geom(r < 0.05 ? sphGeoLo() : sphGeo(), _m, color);
}
function dome(b, x, y, z, rx, ry, rz, color, rot = 0) {
  _m.compose(V(x, y, z), _q.setFromEuler(_e.set(0, rot, 0)), _s.set(rx, ry, rz));
  b.geom(hemiGeo(), _m, color);
}
// a run of something in a sub-frame (rotated about y)
function sub(F, x, z, ry, fn, y = 0) {
  for (const b of [F.b, F.sb, F.gb, F.eb]) b.pushTRS(x, y, z, ry);
  try {
    fn();
  } finally {
    for (const b of [F.b, F.sb, F.gb, F.eb]) b.pop();
  }
}
// clear glass rect facing +z (both sides render with the glass material)
function glassZ(F, x0, x1, y0, y1, z) {
  F.gb.quad(V(x0, y0, z), V(x1, y0, z), V(x1, y1, z), V(x0, y1, z), 0xffffff, 0, { uvs: [[0, 0], [1, 0], [1, 1], [0, 1]] });
}
function glassX(F, x, z0, z1, y0, y1) {
  F.gb.quad(V(x, y0, z1), V(x, y0, z0), V(x, y1, z0), V(x, y1, z1), 0xffffff, 0, { uvs: [[0, 0], [1, 0], [1, 1], [0, 1]] });
}
function glassTop(F, x0, x1, z0, z1, y) {
  F.gb.quad(V(x0, y, z1), V(x1, y, z1), V(x1, y, z0), V(x0, y, z0), 0xffffff, 0, { uvs: [[0, 0], [1, 0], [1, 1], [0, 1]] });
}

function counter(F, x0, x1, z0, z1, h = 0.95, body = 0x8a6a4c, top = 0xf2efe6, pat = PAT.PLANKS) {
  box(F.b, x0, 0, z0, x1, h - 0.04, z1, body, { pattern: pat });
  box(F.b, x0 - 0.03, h - 0.04, z0 - 0.03, x1 + 0.03, h, z1 + 0.03, top);
  F.solid(x0, z0, x1, z1, h);
}
function register(F, x, z, h = 0.95, rot = 0) {
  sub(F, x, z, rot, () => {
    box(F.b, -0.18, h, -0.15, 0.18, h + 0.1, 0.15, 0x2a2c30);
    box(F.b, -0.14, h + 0.1, -0.06, 0.14, h + 0.3, -0.03, 0x2a2c30);
    box(F.eb, -0.12, h + 0.12, -0.03, 0.12, h + 0.28, -0.025, 0x9fd0f0);
  });
}
function table(F, cx, cz, w, d, h = 0.72, top = 0x8a6a4c, leg = 0x3a2a1e, round = false) {
  if (round) {
    F.b.cyl(cx, h - 0.04, cz, w / 2, w / 2, 0.04, 16, top);
    F.b.cyl(cx, 0, cz, 0.04, 0.04, h - 0.04, 6, leg);
    F.b.cyl(cx, 0, cz, 0.22, 0.18, 0.03, 10, leg);
  } else {
    box(F.b, cx - w / 2, h - 0.04, cz - d / 2, cx + w / 2, h, cz + d / 2, top);
    for (const [a, c] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) box(F.b, cx + a * (w / 2 - 0.05) - 0.025, 0, cz + c * (d / 2 - 0.05) - 0.025, cx + a * (w / 2 - 0.05) + 0.025, h - 0.04, cz + c * (d / 2 - 0.05) + 0.025, leg);
  }
  F.solid(cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2, h);
}
// a chair facing local direction ang (0 = facing +z)
function chair(F, cx, cz, ang, seat = 0x6a4a3a, frame = 0x3a2a1e, sit = null) {
  sub(F, cx, cz, ang, () => {
    box(F.b, -0.2, 0.42, -0.2, 0.2, 0.46, 0.2, seat);
    box(F.b, -0.2, 0.46, -0.22, 0.2, 0.86, -0.18, seat);
    for (const [a, c] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) box(F.b, a * 0.17 - 0.02, 0, c * 0.17 - 0.02, a * 0.17 + 0.02, 0.42, c * 0.17 + 0.02, frame);
  });
  if (sit) F.seat(cx, cz, 0.45, Math.sin(ang), Math.cos(ang), sit);
}
function stool(F, cx, cz, h = 0.72, seat = 0xb8342a, sit = null, fx = 0, fz = -1) {
  F.b.cyl(cx, h - 0.06, cz, 0.18, 0.18, 0.08, 12, seat);
  F.b.cyl(cx, 0, cz, 0.03, 0.03, h - 0.06, 6, 0x8c9196);
  F.b.cyl(cx, 0, cz, 0.18, 0.16, 0.03, 10, 0x8c9196);
  if (sit) F.seat(cx, cz, h, fx, fz, sit);
}
function plant(F, x, z, s = 1) {
  F.b.cyl(x, 0, z, 0.16 * s, 0.2 * s, 0.32 * s, 10, 0xb6643f);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * PI * 2;
    ball(F.b, x + Math.cos(a) * 0.12 * s, 0.42 * s + (i % 2) * 0.12 * s, z + Math.sin(a) * 0.12 * s, 0.13 * s, i % 2 ? 0x4f8a48 : 0x5f9a4c);
  }
  ball(F.b, x, 0.62 * s, z, 0.14 * s, 0x6aa850);
}
function lights(F, D, H, n = 2, color = 0xffffff) {
  for (let i = 0; i < n; i++) {
    const z = -D * ((i + 0.5) / n);
    box(F.eb, F.W * 0.2, H - 0.03, z - 0.15, F.W * 0.8, H - 0.01, z + 0.15, color);
  }
}
// pendant lamps
function pendants(F, pts, H, shadeC = 0xd8a060) {
  for (const [x, z] of pts) {
    F.b.cyl(x, H - 0.7, z, 0.006, 0.006, 0.7, 4, 0x2a2a2a);
    dome(F.b, x, H - 0.78, z, 0.2, 0.14, 0.2, shadeC);
    ball(F.eb, x, H - 0.78, z, 0.06, 0xfff1d6);
  }
}
// a wall unit of shelves in a sub-frame on the back wall (front plane at z = zf)
function wallShelves(F, x0, x1, zf, h, depth, fill, o = {}) {
  sub(F, x0, zf, 0, () => shelving(F.b, F.rng, x1 - x0, h, depth, { fill, ...o }));
}
// shelves along a side wall (left: x = 0 facing +x; right: x = W facing -x)
function sideShelves(F, side, z0, z1, h, depth, fill, o = {}) {
  if (side < 0) sub(F, depth, z1, PI / 2, () => shelving(F.b, F.rng, z1 - z0, h, depth, { fill, ...o }));
  else sub(F, F.W - depth, z0, -PI / 2, () => shelving(F.b, F.rng, z1 - z0, h, depth, { fill, ...o }));
  F.solid(side < 0 ? 0 : F.W - depth, z0, side < 0 ? depth : F.W, z1, h);
}
const bookFill = (o = {}) => (b, rng, x0, x1, yb, yt, zb, zf) => books(b, rng, x0, x1, yb, yt, zb, zf, o);
const goodsFill = (kinds) => (b, rng, x0, x1, yb, yt, zb, zf, k) => goods(b, rng, kinds[Math.min(k, kinds.length - 1)], x0, x1, yb, yt, zb, zf);

// a hanging rail with garments, along x at z
function rack(F, x0, x1, z, cols, h = 1.5, long = 0.85) {
  for (const x of [x0, x1]) {
    F.b.cyl(x, 0, z, 0.02, 0.02, h, 6, 0xb8bcc0);
    F.b.cyl(x, 0, z, 0.16, 0.16, 0.02, 10, 0xb8bcc0);
  }
  box(F.b, x0, h - 0.02, z - 0.012, x1, h, z + 0.012, 0xb8bcc0);
  for (let x = x0 + 0.08; x < x1 - 0.05; x += F.rng.range(0.055, 0.085)) {
    const c = hex(F.rng.pick(cols)), gl = long * F.rng.range(0.7, 1.15);
    box(F.b, x - 0.015, h - 0.06 - gl, z - 0.21, x + 0.015, h - 0.06, z + 0.21, c);
    box(F.b, x - 0.005, h - 0.06, z - 0.002, x + 0.005, h + 0.03, z + 0.002, 0x8c9196);
  }
  F.solid(x0 - 0.05, z - 0.25, x1 + 0.05, z + 0.25, h);
}
function mannequin(F, x, z, dress, top = null, ang = 0) {
  sub(F, x, z, ang, () => {
    F.b.cyl(0, 0, 0, 0.18, 0.18, 0.03, 12, 0x8c9196);
    F.b.cyl(0, 0.03, 0, 0.015, 0.015, 0.75, 6, 0x8c9196);
    F.b.cyl(0, 0.62, 0, 0.32, 0.16, 0.55, 12, hex(dress));
    F.b.cyl(0, 1.17, 0, 0.15, 0.13, 0.28, 10, top ? hex(top) : hex(dress));
    F.b.cyl(0, 1.45, 0, 0.13, 0.05, 0.08, 10, 0xf2ede4);
    ball(F.b, 0, 1.62, 0, 0.09, 0xf2ede4, 1.2);
  });
  F.solid(x - 0.2, z - 0.2, x + 0.2, z + 0.2, 1.7);
}
// a lit glass showcase counter; fill(b, x0, x1, y, z0, z1) puts things on its shelf
function showcase(F, x0, x1, z0, z1, h = 0.95, fill = null, body = 0xe8e4da) {
  box(F.b, x0, 0, z0, x1, 0.5, z1, body);
  box(F.b, x0 + 0.03, 0.5, z0 + 0.03, x1 - 0.03, 0.52, z1 - 0.03, 0xf6f4ee);
  box(F.eb, x0 + 0.05, h - 0.06, z0 + 0.08, x1 - 0.05, h - 0.05, z0 + 0.12, 0xffffff);
  for (const [a, b2, c] of [[x0, x1, z1], [x0, x1, z0]]) glassZ(F, a, b2, 0.52, h, c);
  for (const x of [x0, x1]) glassX(F, x, z0, z1, 0.52, h);
  glassTop(F, x0, x1, z0, z1, h);
  for (const x of [x0, x1]) box(F.b, x - 0.01, 0.5, z0, x + 0.01, h, z0 + 0.02, 0xb8bcc0);
  if (fill) fill(F.b, x0 + 0.06, x1 - 0.06, 0.52, z0 + 0.06, z1 - 0.06);
  F.solid(x0, z0, x1, z1, h);
}
// a small framed picture / poster on the back or side wall
function poster(F, x0, x1, y0, y1, z, color, frame = 0x3a3a3a) {
  box(F.b, x0 - 0.03, y0 - 0.03, z, x1 + 0.03, y1 + 0.03, z + 0.015, frame);
  face(F.b, x0, x1, y0, y1, z + 0.016, color);
}
// a text board drawn on the sign atlas, on a wall plane facing +z
function board(F, key, w, h, draw, x0, x1, y0, y1, z, em = 0.4) {
  const uv = F.ctx.atlas2.draw('shopin:' + key, w, h, draw);
  face(F.sb, x0, x1, y0, y1, z, 0, uv, em);
}
function textBoard(F, key, lines, bg, fg, x0, x1, y0, y1, z, font = FONTS.gothic) {
  board(F, key, 256, Math.round(256 * ((y1 - y0) / (x1 - x0))), (c, w, h) => {
    c.fillStyle = bg;
    c.fillRect(0, 0, w, h);
    c.fillStyle = fg;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    const n = lines.length;
    c.font = `700 ${Math.min(h / (n + 0.6), (w * 0.9) / Math.max(...lines.map((l) => l.length)))}px ${font}`;
    lines.forEach((l, i) => c.fillText(l, w / 2, ((i + 0.8) * h) / (n + 0.6)));
  }, x0, x1, y0, y1, z);
}
// menu strips (短冊) hung along a wall
function menuStrips(F, key, items, x0, x1, y1, z, bg = '#f6efe0', fg = '#2a2a2a') {
  const n = items.length, w = (x1 - x0) / n;
  items.forEach((t, i) => {
    board(F, key + i, 64, 256, (c, ww, hh) => {
      c.fillStyle = bg;
      c.fillRect(0, 0, ww, hh);
      c.fillStyle = fg;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      const ch = [...t];
      c.font = `700 ${Math.min(ww * 0.7, (hh * 0.9) / ch.length)}px ${FONTS.brush}`;
      ch.forEach((k, j) => c.fillText(k, ww / 2, (hh * (j + 0.6)) / (ch.length + 0.2)));
    }, x0 + i * w + w * 0.1, x0 + (i + 1) * w - w * 0.1, y1 - 0.62, y1, z, 0.2);
  });
}
// a plastic crate / basket of round produce
function crate(F, x, z, w, d, y, colors, r = 0.04, tilt = 0) {
  sub(F, x, z, 0, () => {
    box(F.b, -w / 2, 0, -d / 2, w / 2, 0.12, d / 2, 0x9a7a54, { pattern: PAT.BOARDS });
    const n = Math.max(2, Math.floor(w / (r * 2.1))), m = Math.max(2, Math.floor(d / (r * 2.1)));
    for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) ball(F.b, -w / 2 + r * 1.05 + i * ((w - r * 2.1) / Math.max(1, n - 1)), 0.12 + r * 0.9 + ((i + j) % 2) * r * 0.25, -d / 2 + r * 1.05 + j * ((d - r * 2.1) / Math.max(1, m - 1)), r, hex(F.rng.pick(colors)));
  }, y);
  void tilt;
}
// tiered display stand (ひな壇) facing +z, levels from front to back
function tiers(F, x0, x1, z0, n, step, depth, color) {
  for (let i = 0; i < n; i++) box(F.b, x0, 0, z0 - (i + 1) * depth, x1, (i + 1) * step, z0 - i * depth, color);
  F.solid(x0, z0 - n * depth, x1, z0, n * step);
  return (i) => ({ y: (i + 1) * step, z: z0 - (i + 0.5) * depth });
}

// ---------------------------------------------------------------------------
// the shops
// ---------------------------------------------------------------------------
// each takes (F, D, H, door, v): depth, ceiling height, door x, variant 0/1

const K = {};

// 和菓子: a glass case of sweets on trays, gift boxes on shelves, a tea bench
K.wagashi = (F, D, H, door) => {
  const W = F.W, b = F.b;
  showcase(F, 0.6, W - 1.6, -D * 0.45 - 0.55, -D * 0.45, 0.95, (bb, x0, x1, y, z0, z1) => {
    for (let x = x0 + 0.1; x < x1 - 0.1; x += 0.36) {
      box(bb, x - 0.15, y, z0 + 0.02, x + 0.15, y + 0.02, z1 - 0.02, 0x2a2a2a);
      const t = Math.floor(x * 7) % 4;
      for (let k = 0; k < 3; k++) {
        const zz = z0 + 0.08 + k * ((z1 - z0 - 0.16) / 2), xx = x - 0.08;
        if (t === 0) for (let j = 0; j < 3; j++) { ball(bb, xx + j * 0.08, y + 0.04, zz, 0.035, 0xf4b6c8, 0.8); box(bb, xx + j * 0.08 - 0.03, y + 0.02, zz - 0.04, xx + j * 0.08 + 0.03, y + 0.025, zz + 0.04, 0x5a8a3a); }
        else if (t === 1) for (let j = 0; j < 3; j++) ball(bb, xx + j * 0.08, y + 0.035, zz, 0.035, 0xf6f2ea, 0.8);
        else if (t === 2) { for (let j = 0; j < 3; j++) ball(bb, xx + 0.02 + j * 0.06, y + 0.035, zz, 0.025, [0xf4b6c8, 0xf6f2ea, 0x8ab06a][j]); box(bb, xx - 0.01, y + 0.033, zz - 0.003, xx + 0.17, y + 0.037, zz + 0.003, 0xd8c098); }
        else box(bb, xx - 0.02, y + 0.02, zz - 0.04, xx + 0.18, y + 0.07, zz + 0.04, 0x5a2a2a);
      }
    }
  });
  F.item(W / 2 - 0.5, -D * 0.45 + 0.6, { kind: 'shop', label: '和菓子を選ぶ', shop: '和菓子', shopKind: 'wagashi' });
  // gift boxes wrapped in paper with noshi on the back shelves
  wallShelves(F, 0.3, W - 0.3, -D + 0.35, 1.9, 0.32, (bb, rng, x0, x1, yb) => {
    for (let x = x0 + 0.05; x < x1 - 0.3; x += 0.34) {
      const c = hex(rng.pick(['#f2ece0', '#c84a5a', '#2f4f8a', '#e8d8a8']));
      box(bb, x, yb, -0.25, x + 0.28, yb + 0.1, -0.05, c);
      face(bb, x + 0.11, x + 0.17, yb + 0.005, yb + 0.095, -0.049, 0xf6f4ee);
      if (rng.next() < 0.5) box(bb, x + 0.02, yb + 0.1, -0.23, x + 0.26, yb + 0.18, -0.07, shade(c, 0.9));
    }
  }, { color: 0x6a4a32, shelves: 4 });
  F.solid(0.3, -D + 0.03, W - 0.3, -D + 0.35, 1.9);
  // a bench with red felt and a parasol for a cup of tea
  box(F.b, W - 1.4, 0.4, -1.4, W - 0.25, 0.46, -0.9, 0xc8342a);
  for (const x of [W - 1.35, W - 0.3]) box(F.b, x - 0.03, 0, -1.35, x + 0.03, 0.4, -0.95, 0x4a3a2a);
  F.solid(W - 1.4, -1.4, W - 0.25, -0.9, 0.46);
  F.seat(W - 0.82, -1.15, 0.46, 0, 1, '縁台でひと休み');
  F.b.cyl(W - 0.82, 0, -1.65, 0.02, 0.02, 2.0, 6, 0x6a4a32);
  dome(F.b, W - 0.82, 1.95, -1.65, 0.9, 0.3, 0.9, 0xc8342a);
  textBoard(F, 'wagashi-menu', ['桜もち 180円', '草だんご 150円', '豆大福 200円'], '#f6efe0', '#2a2a2a', 0.5, 1.7, 1.6, 2.3, -D + 0.02, FONTS.brush);
  void door;
  void b;
};

// 喫茶: a counter with stools and a siphon, tables by the window, pendant lamps, a record player
K.cafe = (F, D, H, door, v) => {
  const W = F.W;
  const cz0 = -D + 0.9, cz1 = -D + 1.45;
  counter(F, 0.4, W - 0.4, cz0, cz1, 1.0, 0x5a3a2a, 0x8a6a4c);
  box(F.b, 0.4, 0, -D + 0.02, W - 0.4, 0.9, -D + 0.5, 0x6a4a3a);
  for (let x = 0.8; x < W - 0.7; x += 0.7) stool(F, x, cz1 + 0.45, 0.72, 0x7a2a2a, 'カウンター席に座る', 0, -1);
  // siphons and a coffee grinder on the counter
  for (const x of [1.0, 1.4]) {
    F.b.cyl(x, 1.0, cz0 + 0.25, 0.08, 0.06, 0.03, 10, 0x3a3a3a);
    F.b.cyl(x, 1.03, cz0 + 0.25, 0.008, 0.008, 0.25, 4, 0x3a3a3a);
    ball(F.gb, x, 1.12, cz0 + 0.25, 0.07, 0xffffff);
    ball(F.b, x, 1.1, cz0 + 0.25, 0.05, 0x3a2418);
    F.b.cyl(x, 1.2, cz0 + 0.25, 0.04, 0.05, 0.2, 10, 0xd8e8ec);
  }
  F.b.cyl(W - 1.0, 1.0, cz0 + 0.2, 0.07, 0.06, 0.25, 8, 0x8a6a4c);
  ball(F.b, W - 1.0, 1.32, cz0 + 0.2, 0.08, 0x9aa0a6);
  // cups on shelves on the back wall
  for (const yy of [1.3, 1.65]) {
    box(F.b, 0.6, yy, -D + 0.02, W - 0.6, yy + 0.03, -D + 0.25, 0x5a3a2a);
    for (let x = 0.75; x < W - 0.7; x += 0.18) F.b.cyl(x, yy + 0.03, -D + 0.14, 0.04, 0.035, 0.07, 8, F.rng.pick([0xf6f4ee, 0x2f4f8a, 0xc8a46a]));
  }
  // tables by the window
  const tz = v ? -1.3 : -1.5;
  for (const tx of [door > W / 2 ? 1.1 : W - 1.1, door > W / 2 ? 2.7 : W - 2.7]) {
    if (Math.abs(tx - door) < 0.9) continue;
    table(F, tx, tz, 0.7, 0.7, 0.72, 0x6a4a32, 0x2a2a2a, true);
    chair(F, tx, tz - 0.55, 0, 0x7a2a2a, 0x2a2a2a, '窓際の席に座る');
    chair(F, tx, tz + 0.55, PI, 0x7a2a2a, 0x2a2a2a);
    F.b.cyl(tx, 0.72, tz, 0.04, 0.03, 0.08, 8, 0xf6f4ee);
  }
  pendants(F, [[W * 0.3, tz], [W * 0.7, tz], [W * 0.5, cz1 + 0.2]], H, 0xc89a5a);
  // record player and a menu board
  box(F.b, W - 0.9, 1.0, cz0 + 0.05, W - 0.5, 1.12, cz0 + 0.4, 0x6a4a32);
  F.b.cyl(W - 0.7, 1.12, cz0 + 0.22, 0.13, 0.13, 0.01, 16, 0x1a1a1a);
  textBoard(F, 'cafe-in', ['ブレンド ¥450', '桜ラテ ¥520', 'ナポリタン ¥850', 'プリン ¥380'], '#2a3a30', '#f6efe0', W / 2 - 0.7, W / 2 + 0.7, 1.95, 2.65, -D + 0.02, FONTS.maru);
  F.item(W / 2, cz1 + 0.9, { kind: 'shop', label: 'マスターに注文する', shop: '喫茶', shopKind: 'cafe' });
};

// よろず屋: everything at once — crowded shelves, a cigarette case, an ice-cream chest
K.yorozuya = (F, D, H, door) => {
  const W = F.W;
  wallShelves(F, 0.2, W - 0.2, -D + 0.42, 1.9, 0.4, goodsFill(['noodles', 'daily', 'snacks', 'drinks', 'daily']), { color: 0xe8e4da, shelves: 5, bay: 1.0 });
  F.solid(0.2, -D, W - 0.2, -D + 0.42, 1.9);
  sideShelves(F, -1, -D + 0.6, -1.0, 1.6, 0.4, goodsFill(['daily', 'sweets', 'snacks', 'snacks']), { color: 0xe8e4da, shelves: 4 });
  // a low island of baskets
  const ix = door > W / 2 ? W * 0.35 : W * 0.65;
  table(F, ix, -D * 0.5, 1.2, 0.7, 0.75, 0xc8b48a, 0x6a5a40);
  for (let i = 0; i < 4; i++) crate(F, ix - 0.42 + (i % 2) * 0.84 - (i % 2 ? 0.2 : -0.2) * 0, -D * 0.5 - 0.17 + Math.floor(i / 2) * 0.34, 0.36, 0.3, 0.75, ['#f6c341', '#e8432e', '#f6f2ea', '#8a5a3a'], 0.04);
  // counter: cigarette case, the old register, an ice cream chest freezer
  const cx0 = door > W / 2 ? 0.3 : W - 1.7;
  counter(F, cx0, cx0 + 1.4, -1.9, -1.35, 0.9, 0x7a5a3e, 0xe8e0d0);
  register(F, cx0 + 0.4, -1.62, 0.9);
  showcase(F, cx0 + 0.75, cx0 + 1.35, -1.85, -1.4, 1.2, (bb, x0, x1, y, z0) => {
    for (let x = x0; x < x1 - 0.03; x += 0.035) for (let r = 0; r < 3; r++) box(bb, x, y + r * 0.12, z0 + 0.02, x + 0.03, y + r * 0.12 + 0.09, z0 + 0.06, F.rng.pick([0xf4f4f0, 0x2f4f8a, 0xc8342a, 0x2a2a2a, 0xd8b84a]));
  });
  const fx = door > W / 2 ? W - 1.3 : 0.3;
  box(F.b, fx, 0, -1.5, fx + 1.0, 0.82, -0.9, 0xf2f2ee);
  glassTop(F, fx + 0.05, fx + 0.95, -1.45, -0.95, 0.83);
  for (let k = 0; k < 8; k++) box(F.b, fx + 0.1 + (k % 4) * 0.21, 0.66, -1.42 + Math.floor(k / 4) * 0.22, fx + 0.27 + (k % 4) * 0.21, 0.74, -1.25 + Math.floor(k / 4) * 0.22, F.rng.pick([0xf6c0d0, 0x9fd0f0, 0xf6e7c8, 0x6a4a3a]));
  F.solid(fx, -1.5, fx + 1.0, -0.9, 0.85);
  F.item(cx0 + 0.7, -1.0, { kind: 'shop', label: 'おばあさんに声をかける', shop: 'よろず屋', shopKind: 'yorozuya' });
};

// パン屋: wooden tables of bread on trays, tongs and a tray stack, a sandwich fridge
const BREAD = ['#d9a05a', '#c8803a', '#e8c080', '#b0602a', '#f0d098'];
function breadTray(bb, rng, x0, x1, y, z0, z1) {
  box(bb, x0, y, z0, x1, y + 0.015, z1, 0x9a7a54);
  for (let x = x0 + 0.08; x < x1 - 0.06; x += 0.15) {
    for (let z = z0 + 0.08; z < z1 - 0.06; z += 0.15) {
      const t = rng.next();
      if (t < 0.35) dome(bb, x, y + 0.015, z, 0.06, 0.045, 0.06, hex(rng.pick(BREAD))); // round buns / melon pan
      else if (t < 0.6) dome(bb, x, y + 0.015, z, 0.09, 0.04, 0.035, hex(rng.pick(BREAD)), rng.range(-0.4, 0.4)); // rolls
      else if (t < 0.8) { dome(bb, x, y + 0.015, z, 0.07, 0.035, 0.035, 0xc8803a, 0.6); dome(bb, x, y + 0.03, z, 0.04, 0.03, 0.03, 0xd9a05a, 0.6); } // croissant
      else box(bb, x - 0.06, y + 0.015, z - 0.04, x + 0.06, y + 0.07, z + 0.04, 0xe8c080); // a loaf
    }
  }
}
K.bakery = (F, D, H, door, v) => {
  const W = F.W;
  // island tables with baskets
  const tx = [W * 0.3, W * 0.7].filter((x) => Math.abs(x - door) > 0.8);
  for (const x of tx) {
    table(F, x, -D * 0.4, 1.1, 0.75, 0.82, 0xb08a5a, 0x6a4a32);
    breadTray(F.b, F.rng, x - 0.5, x - 0.02, 0.82, -D * 0.4 - 0.33, -D * 0.4 + 0.33);
    breadTray(F.b, F.rng, x + 0.02, x + 0.5, 0.82, -D * 0.4 - 0.33, -D * 0.4 + 0.33);
  }
  // wall racks of trays on the side
  sideShelves(F, v ? 1 : -1, -D + 0.6, -1.2, 1.6, 0.5, (bb, rng, x0, x1, yb, yt, zb, zf) => breadTray(bb, rng, x0, x1, yb, zb + 0.05, zf - 0.02), { color: 0xb08a5a, shelves: 3 });
  // counter with register, tongs and trays, a sandwich fridge behind
  counter(F, W * 0.25, W * 0.75, -D + 1.0, -D + 1.5, 0.95, 0xe8dcc0, 0xb08a5a);
  register(F, W * 0.38, -D + 1.25);
  for (let i = 0; i < 6; i++) box(F.b, W * 0.62 - 0.17, 0.95 + i * 0.012, -D + 1.08, W * 0.62 + 0.17, 0.958 + i * 0.012, -D + 1.42, 0xc8b08a);
  for (const dx of [0, 0.05]) box(F.b, W * 0.68 + dx, 0.96, -D + 1.15, W * 0.68 + dx + 0.015, 0.97, -D + 1.38, 0xc0c4c8);
  box(F.b, W * 0.3, 0, -D + 0.02, W * 0.7, 1.9, -D + 0.6, 0xe8e8e2);
  sub(F, W * 0.3 + 0.03, -D + 0.6, 0, () => {
    shelving(F.b, F.rng, W * 0.4 - 0.06, 1.75, 0.5, { color: 0xe8e8e2, back: 0x7a8088, shelves: 4, plinth: 0.2, fill: goodsFill(['chilled', 'sweets', 'chilled', 'drinks']) });
  });
  glassZ(F, W * 0.3 + 0.03, W * 0.7 - 0.03, 0.2, 1.8, -D + 0.62);
  textBoard(F, 'bakery-in', ['焼きたて', '11:00 / 15:00'], '#f6e7c8', '#7a4a1f', 0.4, 1.4, 1.9, 2.4, -D + 0.02, FONTS.maru);
  F.item(W / 2, -D + 2.1, { kind: 'shop', label: 'パンをトレーにのせる', shop: 'パン屋', shopKind: 'bakery' });
};

// 花屋: buckets of cut flowers on tiers, potted plants, a flower fridge, the wrapping table
const FLOWERS = ['#f06a8a', '#ffd94a', '#ffffff', '#b07ae0', '#ff8a4a', '#f6b0c8', '#e8432e', '#7ad0f0'];
function bucket(bb, rng, x, y, z) {
  bb.cyl(x, y, z, 0.13, 0.11, 0.3, 10, 0x8a95a0);
  const c = hex(rng.pick(FLOWERS));
  for (let k = 0; k < 7; k++) {
    const a = rng.range(0, PI * 2), r = rng.range(0, 0.09), hh = rng.range(0.45, 0.65);
    bb.cyl(x + Math.cos(a) * r * 0.6, y + 0.25, z + Math.sin(a) * r * 0.6, 0.004, 0.004, hh - 0.2, 4, 0x4a7a3a);
    ball(bb, x + Math.cos(a) * r, y + hh, z + Math.sin(a) * r, rng.range(0.035, 0.05), c);
  }
}
K.florist = (F, D, H, door) => {
  const W = F.W;
  // stepped stands of buckets either side of the aisle in from the door
  for (const [x0, x1] of [[0.3, door - 0.75], [door + 0.75, W - 0.3]]) {
    if (x1 - x0 < 0.7) continue;
    const row = tiers(F, x0, x1, -1.3, 3, 0.25, 0.42, 0x6a5a48);
    for (let i = 0; i < 3; i++) for (let x = x0 + 0.2; x < x1 - 0.1; x += 0.33) bucket(F.b, F.rng, x, row(i).y, row(i).z);
  }
  // potted plants on the floor by the windows
  for (const x of [0.5, W - 0.5]) if (Math.abs(x - door) > 0.9) plant(F, x, -0.55, F.rng.range(0.9, 1.3));
  // the flower fridge on the back wall
  box(F.b, 0.3, 0, -D + 0.02, W * 0.5, 2.0, -D + 0.6, 0xe8e8e2);
  box(F.b, 0.35, 0.05, -D + 0.04, W * 0.5 - 0.05, 1.95, -D + 0.05, 0xc8d8d0);
  for (const yy of [0.3, 1.0]) {
    box(F.b, 0.35, yy, -D + 0.1, W * 0.5 - 0.05, yy + 0.02, -D + 0.55, 0xd8dcd8);
    for (let x = 0.5; x < W * 0.5 - 0.15; x += 0.3) bucket(F.b, F.rng, x, yy + 0.02, -D + 0.33);
  }
  glassZ(F, 0.33, W * 0.5 - 0.03, 0.05, 1.95, -D + 0.62);
  box(F.eb, 0.35, 1.93, -D + 0.1, W * 0.5 - 0.05, 1.95, -D + 0.5, 0xffffff);
  F.solid(0.3, -D, W * 0.5, -D + 0.62, 2.0);
  // wrapping table: paper rolls, ribbons, a vase of greenery
  counter(F, W * 0.55, W - 0.3, -D + 0.3, -D + 1.0, 0.9, 0xb08a5a, 0xe8dcc0);
  for (let i = 0; i < 3; i++) sub(F, W * 0.6 + i * 0.25, -D + 0.45, 0, () => F.b.rod(V(0, 0.96, 0), V(0.0, 0.96, 0.45), 0.04, 0.04, 8, [0xf6e7c8, 0xf6c0d0, 0xa8c8e8][i]));
  bucket(F.b, F.rng, W - 0.6, 0.9, -D + 0.6);
  F.item(W * 0.7, -D + 1.6, { kind: 'shop', label: '花束を作ってもらう', shop: '花屋', shopKind: 'florist' });
};

// 魚屋: an inclined ice bed of fish in styrofoam boxes, a chopping counter, scales
K.fish = (F, D, H, door) => {
  const W = F.W;
  for (const [x0, x1] of [[0.3, door - 0.8], [door + 0.8, W - 0.3]]) {
    if (x1 - x0 < 0.8) continue;
    box(F.b, x0, 0, -1.6, x1, 0.75, -0.5, 0xd8dcd8);
    sub(F, 0, -1.05, 0, () => {
      F.b.push(new THREE.Matrix4().makeRotationX(0.25));
      box(F.b, x0, 0.75, -0.55, x1, 0.8, 0.55, 0xeef6f8);
      for (let x = x0 + 0.05; x < x1 - 0.45; x += 0.45) {
        box(F.b, x, 0.8, -0.45, x + 0.42, 0.88, 0.45, 0xf4f6f4);
        const silver = F.rng.next() < 0.6;
        for (let k = 0; k < 4; k++) {
          const zz = -0.35 + k * 0.23;
          _m.compose(V(x + 0.21, 0.9, zz), _q.setFromEuler(_e.set(0, 0, 0)), _s.set(0.17, 0.035, 0.05));
          F.b.geom(sphGeo(), _m, silver ? 0xc8d4e0 : 0xe8a090);
          box(F.b, x + 0.36, 0.88, zz - 0.04, x + 0.4, 0.92, zz + 0.04, silver ? 0x8a9aa8 : 0xc87060);
        }
        face(F.b, x + 0.05, x + 0.2, 0.86, 0.93, 0.46, 0xffe14a);
      }
      F.b.pop();
    });
    F.solid(x0, -1.6, x1, -0.5, 0.95);
  }
  counter(F, 0.4, W - 0.4, -D + 0.5, -D + 1.2, 0.9, 0xc8ccd0, 0xe8f0f2, PAT.METAL);
  box(F.b, W * 0.4, 0.9, -D + 0.6, W * 0.4 + 0.6, 0.95, -D + 1.0, 0xf2e6c8);
  box(F.b, W * 0.65, 0.9, -D + 0.65, W * 0.65 + 0.25, 1.05, -D + 0.9, 0xf6f4ee);
  textBoard(F, 'fish-in', ['本日の地魚', 'アジ・サバ・シラス'], '#1f5fa8', '#ffffff', W / 2 - 0.9, W / 2 + 0.9, 1.7, 2.3, -D + 0.02);
  F.item(door, -2.0, { kind: 'shop', label: '今日のおすすめを聞く', shop: '魚屋', shopKind: 'fish' });
};

// 本屋 (street): tall narrow cases on the walls, a low island of new books, a register
K.books = (F, D, H, door, v) => {
  const W = F.W;
  wallShelves(F, 0.15, W - 0.15, -D + 0.35, 2.3, 0.33, bookFill({ paperbacks: !v }), { color: 0x6a4a32, bay: 0.8 });
  F.solid(0.15, -D, W - 0.15, -D + 0.35, 2.3);
  sideShelves(F, -1, -D + 0.5, -0.8, 2.1, 0.33, bookFill({}), { color: 0x6a4a32, bay: 0.8 });
  sideShelves(F, 1, -D + 0.5, -2.2, 2.1, 0.33, bookFill({ paperbacks: true }), { color: 0x6a4a32, bay: 0.8 });
  // the new-releases island: books lying flat in stacks, covers up
  const ix = W * 0.48;
  table(F, ix, -D * 0.5, 1.4, 0.8, 0.8, 0x6a4a32, 0x4a3a2a);
  for (let i = 0; i < 10; i++) {
    const x = ix - 0.6 + (i % 5) * 0.3, z = -D * 0.5 - 0.2 + Math.floor(i / 5) * 0.4, n = F.rng.int(3, 7), c = hex(F.rng.pick(['#e86a4a', '#4a8ad0', '#f2d24a', '#f4f0e6', '#7ac0a0', '#2a2a2a']));
    for (let k = 0; k < n; k++) box(F.b, x - 0.1, 0.8 + k * 0.025, z - 0.14, x + 0.1, 0.823 + k * 0.025, z + 0.14, k === n - 1 ? c : 0xf2efe6);
  }
  counter(F, W - 1.6, W - 0.3, -1.4, -0.9, 0.95, 0x6a4a32, 0xe8e0d0);
  register(F, W - 1.0, -1.15);
  F.item(ix, -D * 0.5 + 0.8, { kind: 'shop', label: '平台の新刊を見る', shop: '本屋', shopKind: 'books' });
};

// 八百屋: tiered crates of vegetables and fruit, hanging price cards, baskets of daikon
const VEG = { tomato: ['#e8432e'], orange: ['#f08a2a', '#f6a03a'], apple: ['#c8342a', '#e85a3a'], green: ['#6aa84f', '#4a8a3a'], potato: ['#c8a06a', '#b8905a'], onion: ['#e8d0a0'], eggplant: ['#4a2a5a'] };
K.grocer = (F, D, H, door) => {
  const W = F.W, keys = Object.keys(VEG);
  for (const [x0, x1] of [[0.25, door - 0.7], [door + 0.7, W - 0.25]]) {
    if (x1 - x0 < 0.6) continue;
    const row = tiers(F, x0, x1, -0.4, 3, 0.3, 0.45, 0x8a6a48);
    for (let i = 0; i < 3; i++) for (let x = x0 + 0.25; x < x1 - 0.2; x += 0.48) crate(F, x, row(i).z, 0.42, 0.36, row(i).y, VEG[F.rng.pick(keys)], 0.04);
  }
  // cabbages and daikon in baskets along the side wall, bananas on a hook
  for (let z = -D + 1.0; z < -2.2; z += 0.75) {
    box(F.b, 0.25, 0, z - 0.3, 0.85, 0.35, z + 0.3, 0x9a7a54, { pattern: PAT.BOARDS });
    if (F.rng.next() < 0.5) for (let k = 0; k < 4; k++) ball(F.b, 0.4 + (k % 2) * 0.3, 0.45, z - 0.12 + Math.floor(k / 2) * 0.24, 0.12, 0x8ac06a);
    else for (let k = 0; k < 5; k++) sub(F, 0.35 + k * 0.1, z, 0, () => F.b.rod(V(0, 0.38, -0.25), V(0, 0.42, 0.25), 0.035, 0.02, 6, 0xf2f2ea));
  }
  F.solid(0.25, -D + 0.7, 0.85, -2.2, 0.45);
  counter(F, W - 1.6, W - 0.3, -D + 0.5, -D + 1.0, 0.9, 0x8a6a48, 0xe8dcc0);
  register(F, W - 1.0, -D + 0.75, 0.9);
  F.item(door, -1.6, { kind: 'shop', label: '旬の野菜を選ぶ', shop: '八百屋', shopKind: 'grocer' });
};

// ラーメン: an L counter with stools, the kitchen behind with steaming pots, a ticket machine
K.ramen = (F, D, H, door) => {
  const W = F.W;
  const kz = -D + 1.6;
  counter(F, 0.3, W - 0.3, kz, kz + 0.45, 1.05, 0x6a3a2a, 0xc8a46a);
  box(F.b, 0.3, 0, kz + 0.45, W - 0.3, 0.75, kz + 0.5, 0x3a2a1f);
  for (let x = 0.7; x < W - 0.5; x += 0.6) stool(F, x, kz + 0.9, 0.7, 0xc8342a, 'カウンターに座る', 0, -1);
  // kitchen: stoves, stock pots, the noodle boiler, ladles
  box(F.b, 0.3, 0, -D + 0.02, W - 0.3, 0.85, -D + 0.75, 0xa8acb0, { pattern: PAT.METAL });
  for (let i = 0; i < 3; i++) {
    const x = 0.8 + i * ((W - 1.6) / 2);
    F.b.cyl(x, 0.85, -D + 0.4, 0.22, 0.22, 0.4, 14, 0xb8bcc0, PAT.METAL, { top: 0x6a4a2a });
    for (let s = 0; s < 3; s++) ball(F.b, x + F.rng.range(-0.1, 0.1), 1.35 + s * 0.18, -D + 0.4, 0.09 + s * 0.04, 0xf4f4f4, 0.7);
  }
  box(F.b, 0.3, 1.5, -D + 0.02, W - 0.3, 1.55, -D + 0.3, 0x5a5a5a);
  for (let x = 0.5; x < W - 0.5; x += 0.3) F.b.cyl(x, 1.55, -D + 0.16, 0.08, 0.07, 0.06, 10, 0xf6f4ee, 0, { top: 0xc8342a });
  menuStrips(F, 'ramen-menu', ['醤油ラーメン', '塩ラーメン', '味噌ラーメン', '餃子', 'チャーハン', 'ビール'], 0.4, W - 0.4, H - 0.15, -D + 0.02);
  // ticket machine by the door
  const tx = door > W / 2 ? door - 1.2 : door + 1.2;
  box(F.b, tx - 0.3, 0, -0.65, tx + 0.3, 1.7, -0.15, 0xe8e8e2);
  for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) box(F.eb, tx - 0.24 + k * 0.12, 1.0 + r * 0.12, -0.15, tx - 0.15 + k * 0.12, 1.08 + r * 0.12, -0.14, r === 3 ? 0xff9a8a : 0xfff1d6);
  F.solid(tx - 0.3, -0.65, tx + 0.3, -0.15, 1.7);
  F.item(tx, -1.1, { kind: 'shop', label: '券売機で食券を買う', shop: 'ラーメン', shopKind: 'ramen' });
};

// 駄菓子屋: low tables crowded with jars and boxes, strings of lottery, a gacha machine
K.dagashi = (F, D, H, door) => {
  const W = F.W;
  for (const [x0, x1] of [[0.3, door - 0.7], [door + 0.7, W - 0.3]]) {
    if (x1 - x0 < 0.6) continue;
    const row = tiers(F, x0, x1, -D * 0.35, 2, 0.4, 0.5, 0xb08a5a);
    for (let i = 0; i < 2; i++) {
      for (let x = x0 + 0.12; x < x1 - 0.1; x += 0.2) {
        const t = F.rng.next(), y = row(i).y, z = row(i).z;
        if (t < 0.4) {
          F.gb.cyl(x, y, z, 0.07, 0.07, 0.18, 10, 0xffffff);
          for (let k = 0; k < 5; k++) ball(F.b, x + F.rng.range(-0.035, 0.035), y + 0.03 + k * 0.025, z + F.rng.range(-0.035, 0.035), 0.025, hex(F.rng.pick(['#f6c341', '#f06a8a', '#5ab0e8', '#7ad07a', '#ff8a4a'])));
          F.b.cyl(x, y + 0.18, z, 0.074, 0.074, 0.03, 10, 0xd84a3a);
        } else box(F.b, x - 0.08, y, z - 0.12, x + 0.08, y + F.rng.range(0.04, 0.1), z + 0.12, hex(F.rng.pick(['#f6c341', '#f06a8a', '#5ab0e8', '#7ad07a', '#ff8a4a', '#9a4ac0'])));
      }
    }
  }
  // strings of くじ hanging along the back
  for (let x = 0.5; x < W - 0.4; x += 0.25) for (let k = 0; k < 5; k++) box(F.b, x - 0.04, 1.6 - k * 0.11, -D + 0.04, x + 0.04, 1.69 - k * 0.11, -D + 0.05, hex(['#f6c341', '#f06a8a', '#5ab0e8'][k % 3]));
  // the capsule toy machine and a bench
  const gx = door > W / 2 ? 0.6 : W - 0.6;
  box(F.b, gx - 0.25, 0, -D + 0.2, gx + 0.25, 0.6, -D + 0.7, 0xc8342a);
  ball(F.gb, gx, 0.85, -D + 0.45, 0.24, 0xffffff);
  for (let k = 0; k < 8; k++) ball(F.b, gx + F.rng.range(-0.12, 0.12), 0.68 + F.rng.range(0, 0.12), -D + 0.45 + F.rng.range(-0.12, 0.12), 0.05, hex(F.rng.pick(['#f6c341', '#f06a8a', '#5ab0e8', '#ffffff'])));
  F.solid(gx - 0.25, -D + 0.2, gx + 0.25, -D + 0.7, 1.1);
  box(F.b, W * 0.3, 0.4, -D + 0.25, W * 0.7, 0.45, -D + 0.6, 0x5a8ab0);
  F.solid(W * 0.3, -D + 0.25, W * 0.7, -D + 0.6, 0.45);
  F.seat(W * 0.5, -D + 0.42, 0.45, 0, 1, '店先のベンチに座る');
  F.item(door, -D * 0.35 + 0.6, { kind: 'shop', label: '駄菓子を選ぶ', shop: '駄菓子', shopKind: 'dagashi' });
};

// 理容: barber chairs before a long mirror, a sink, a waiting bench and magazines
K.barber = (F, D, H, door) => {
  const W = F.W, mz = -D + 0.02;
  box(F.b, 0.3, 0, mz, W - 0.3, 0.8, mz + 0.45, 0xe8e4da);
  box(F.b, 0.3, 1.0, mz, W - 0.3, 1.9, mz + 0.03, 0xdfeef3);
  for (let i = 0; i < 2; i++) {
    const x = W * (0.3 + i * 0.4);
    sub(F, x, mz + 1.2, PI, () => {
      F.b.cyl(0, 0, 0, 0.3, 0.3, 0.06, 14, 0xb8bcc0);
      F.b.cyl(0, 0.06, 0, 0.08, 0.08, 0.3, 8, 0xb8bcc0);
      box(F.b, -0.28, 0.36, -0.3, 0.28, 0.5, 0.25, 0x7a2a2a);
      box(F.b, -0.28, 0.5, 0.2, 0.28, 1.25, 0.3, 0x7a2a2a);
      box(F.b, -0.12, 1.25, 0.22, 0.12, 1.4, 0.32, 0x7a2a2a);
      for (const e of [-1, 1]) box(F.b, e * 0.3 - 0.04, 0.5, -0.25, e * 0.3 + 0.04, 0.7, 0.2, 0x5a1a1a);
      box(F.b, -0.15, 0.1, -0.55, 0.15, 0.14, -0.35, 0xb8bcc0);
    });
    F.solid(x - 0.32, mz + 0.9, x + 0.32, mz + 1.55, 1.3);
    F.seat(x, mz + 1.2, 0.5, 0, -1, '理容椅子に座る');
    F.b.cyl(x, 0.8, mz + 0.25, 0.1, 0.08, 0.05, 10, 0xf6f4ee);
  }
  // waiting bench, magazine rack, the hot-towel steamer
  box(F.b, 0.3, 0.42, -1.4, 1.6, 0.47, -0.95, 0x3a3a3a);
  for (const x of [0.4, 1.5]) box(F.b, x - 0.03, 0, -1.35, x + 0.03, 0.42, -1.0, 0x8c9196);
  F.solid(0.3, -1.4, 1.6, -0.95, 0.47);
  F.seat(0.95, -1.17, 0.47, 0, 1, '待合のベンチに座る');
  box(F.b, W - 0.9, 0, -1.6, W - 0.3, 1.2, -1.3, 0x8a6a4c);
  for (let k = 0; k < 6; k++) sub(F, W - 0.85 + (k % 3) * 0.18, -1.29, 0, () => { F.b.push(new THREE.Matrix4().makeRotationX(-0.3)); box(F.b, 0, 0.2 + Math.floor(k / 3) * 0.45, 0, 0.16, 0.42 + Math.floor(k / 3) * 0.45, 0.01, hex(F.rng.pick(['#e8432e', '#2f6fd0', '#f6c341', '#2a2a2a']))); F.b.pop(); });
  box(F.b, W - 0.8, 0.8, mz + 0.1, W - 0.45, 1.1, mz + 0.42, 0xf2f2ee);
  F.item(W / 2, -2.0, { kind: 'shop', label: '散髪を頼む', shop: '理容', shopKind: 'barber' });
};

// クリーニング: a counter, a conveyor of shirts in plastic bags, shelves of folded linen
K.cleaning = (F, D, H, door) => {
  const W = F.W;
  counter(F, 0.3, W - 0.3, -1.9, -1.3, 1.0, 0xe8f4fb, 0xffffff, PAT.NONE);
  register(F, W * 0.7, -1.6, 1.0);
  box(F.b, W * 0.3, 1.0, -1.85, W * 0.3 + 0.45, 1.25, -1.35, 0x9fd0f0);
  // the hanging conveyor
  const cz = -D + 0.6;
  box(F.b, 0.3, 2.0, cz - 0.02, W - 0.3, 2.04, cz + 0.02, 0x8c9196);
  for (let x = 0.4; x < W - 0.4; x += 0.09) {
    box(F.b, x - 0.012, 1.1, cz - 0.24, x + 0.012, 1.95, cz + 0.24, hex(F.rng.pick(['#f6f8fa', '#e8f0f8', '#2f3f5e', '#f2f2f2', '#c8d4e0'])));
    F.gb.quad(V(x - 0.02, 1.08, cz + 0.26), V(x + 0.02, 1.08, cz + 0.26), V(x + 0.02, 1.97, cz + 0.26), V(x - 0.02, 1.97, cz + 0.26), 0xffffff, 0, { uvs: [[0, 0], [1, 0], [1, 1], [0, 1]] });
  }
  F.solid(0.3, cz - 0.3, W - 0.3, cz + 0.3, 2.0);
  // shelves of folded shirts on the side wall
  sideShelves(F, -1, -D + 1.2, -2.2, 1.8, 0.45, (bb, rng, x0, x1, yb) => {
    for (let x = x0 + 0.05; x < x1 - 0.3; x += 0.34) for (let k = 0; k < rng.int(2, 5); k++) box(bb, x, yb + k * 0.05, -0.38, x + 0.3, yb + k * 0.05 + 0.045, -0.06, hex(rng.pick(['#f6f8fa', '#e8f0f8', '#c8d4e0', '#f2e6d8'])));
  }, { color: 0xe8e8e2, shelves: 4 });
  F.item(W / 2, -0.9, { kind: 'shop', label: '仕上がりを受け取る', shop: 'クリーニング', shopKind: 'cleaning' });
};

// 酒・米: walls of sake bottles, rice sacks stacked by the counter, a beer fridge
K.liquor = (F, D, H, door) => {
  const W = F.W;
  wallShelves(F, 0.2, W - 0.2, -D + 0.35, 2.0, 0.33, (bb, rng, x0, x1, yb, yt, zb) => {
    for (let x = x0 + 0.06; x < x1 - 0.05; x += 0.115) {
      const tall = yt - yb > 0.42 && rng.next() < 0.6, c = hex(rng.pick(['#2f4a2a', '#4a2a1a', '#1f2f3f', '#d8d8d0']));
      const hh = tall ? 0.36 : 0.26;
      bb.cyl(x + 0.05, yb, zb + 0.16, 0.048, 0.048, hh * 0.7, 10, c);
      bb.cyl(x + 0.05, yb + hh * 0.7, zb + 0.16, 0.048, 0.018, hh * 0.2, 10, c);
      bb.cyl(x + 0.05, yb + hh * 0.9, zb + 0.16, 0.018, 0.018, hh * 0.1, 6, 0xc8a46a);
      bb.cyl(x + 0.05, yb + hh * 0.25, zb + 0.16, 0.0485, 0.0485, hh * 0.3, 10, 0xf2ece0, 0, { caps: false });
    }
  }, { color: 0x5a3a2a, shelves: 4 });
  F.solid(0.2, -D, W - 0.2, -D + 0.35, 2.0);
  for (let i = 0; i < 6; i++) {
    const x = 0.5 + (i % 3) * 0.5, y = Math.floor(i / 3) * 0.2;
    _m.compose(V(x, y + 0.1, -2.0), _q.identity(), _s.set(0.22, 0.1, 0.32));
    F.b.geom(sphGeo(), _m, 0xf2ece0);
    face(F.b, x - 0.1, x + 0.1, y + 0.05, y + 0.15, -1.68, 0xc8342a);
  }
  F.solid(0.25, -2.35, 1.75, -1.65, 0.4);
  counter(F, W - 1.8, W - 0.3, -2.0, -1.45, 0.95, 0x5a3a2a, 0xc8a46a);
  register(F, W - 1.0, -1.72);
  F.item(W / 2, -1.2, { kind: 'shop', label: '地酒を見る', shop: '酒屋', shopKind: 'liquor' });
};

// 薬局: gondolas of medicine and cosmetics, a counter with the pharmacist's window
K.pharmacy = (F, D, H, door) => {
  const W = F.W;
  for (const x of [W * 0.3, W * 0.7]) {
    if (Math.abs(x - door) < 0.5) continue;
    sub(F, x - 0.3, -1.4, PI / 2, () => shelving(F.b, F.rng, D - 3.0, 1.4, 0.3, { color: 0xf2f2ee, shelves: 4, plinth: 0.1, lip: 0.02, fill: goodsFill(['daily', 'daily', 'sweets', 'daily']) }));
    sub(F, x + 0.3, -D + 1.6, -PI / 2, () => shelving(F.b, F.rng, D - 3.0, 1.4, 0.3, { color: 0xf2f2ee, shelves: 4, plinth: 0.1, lip: 0.02, fill: goodsFill(['daily', 'sweets', 'daily', 'daily']) }));
    F.solid(x - 0.32, -D + 1.6, x + 0.32, -1.4, 1.4);
  }
  counter(F, 0.4, W - 0.4, -D + 0.6, -D + 1.1, 1.0, 0xffffff, 0xe8f4ea, PAT.NONE);
  textBoard(F, 'pharm-in', ['処方せん受付', 'おくすり相談'], '#2e8a4a', '#ffffff', W / 2 - 0.9, W / 2 + 0.9, 1.6, 2.1, -D + 0.02);
  F.item(W / 2, -D + 1.6, { kind: 'shop', label: '薬剤師さんに相談する', shop: '薬局', shopKind: 'pharmacy' });
};

// 時計・メガネ: a wall of clocks (and a pendulum clock), glass cases of watches, frames on the wall
K.watch = (F, D, H, door) => {
  const W = F.W;
  for (let i = 0; i < 9; i++) {
    const x = 0.6 + (i % 5) * ((W - 1.2) / 4), y = 1.5 + Math.floor(i / 5) * 0.5, r = F.rng.range(0.11, 0.17);
    sub(F, x, -D + 0.02, 0, () => {
      F.b.push(new THREE.Matrix4().makeRotationX(PI / 2));
      F.b.cyl(0, 0, -y, r, r, 0.04, 16, hex(F.rng.pick(['#6a4a32', '#c8a46a', '#2a2a2a'])), 0, { top: 0xfbf7ec });
      F.b.pop();
      // hands at ten past ten, a dot at twelve
      const t = F.rng.range(0, PI * 2);
      for (const [a, l, w] of [[t, r * 0.75, 0.008], [t * 12, r * 0.5, 0.012]]) {
        _m.compose(V(Math.sin(a) * l * 0.5, y + Math.cos(a) * l * 0.5, 0.045), _q.setFromEuler(_e.set(0, 0, -a)), _s.set(1, 1, 1));
        F.b.push(_m.clone());
        box(F.b, -w / 2, -l / 2, 0, w / 2, l / 2, 0.004, 0x2a2a2a);
        F.b.pop();
      }
      box(F.b, -0.01, y + r * 0.8, 0.045, 0.01, y + r * 0.9, 0.048, 0x2a2a2a);
    });
  }
  box(F.b, W - 0.9, 0, -D + 0.02, W - 0.4, 1.9, -D + 0.32, 0x5a3a2a);
  face(F.b, W - 0.82, W - 0.48, 1.35, 1.75, -D + 0.33, 0xfbf7ec);
  box(F.b, W - 0.66, 0.6, -D + 0.33, W - 0.64, 1.3, -D + 0.34, 0xc8a46a);
  ball(F.b, W - 0.65, 0.6, -D + 0.34, 0.06, 0xc8a46a, 0.3);
  F.solid(W - 0.9, -D, W - 0.4, -D + 0.32, 1.9);
  showcase(F, 0.4, W - 1.2, -D * 0.5 - 0.5, -D * 0.5, 1.0, (bb, x0, x1, y, z0, z1) => {
    for (let x = x0 + 0.06; x < x1 - 0.06; x += 0.16) {
      box(bb, x - 0.05, y, z0 + 0.1, x + 0.05, y + 0.06, z1 - 0.1, 0x2a2a2a);
      bb.cyl(x, y + 0.06, (z0 + z1) / 2, 0.025, 0.025, 0.012, 10, rng01(x) < 0.5 ? 0xc8a46a : 0xc0c4c8, 0, { top: 0xfbf7ec });
    }
  });
  F.item(W / 2, -D * 0.5 + 0.6, { kind: 'shop', label: '腕時計を見せてもらう', shop: '時計店', shopKind: 'watch' });
};
const rng01 = (x) => Math.abs(Math.sin(x * 91.7) * 43758.5453) % 1;

// とうふ屋: the water tank of tofu blocks, trays of fried tofu, wooden boxes
K.tofu = (F, D, H) => {
  const W = F.W;
  box(F.b, 0.4, 0, -D * 0.4 - 0.7, W - 0.4, 0.8, -D * 0.4, 0xb8bcc0, { pattern: PAT.METAL });
  F.b.quad(V(0.45, 0.72, -D * 0.4 - 0.05), V(W - 0.45, 0.72, -D * 0.4 - 0.05), V(W - 0.45, 0.72, -D * 0.4 - 0.65), V(0.45, 0.72, -D * 0.4 - 0.65), 0x9fd0e8, 0);
  for (let x = 0.6; x < W - 0.6; x += 0.2) box(F.b, x - 0.07, 0.62, -D * 0.4 - 0.45, x + 0.07, 0.71, -D * 0.4 - 0.25, 0xfbf8f0);
  F.solid(0.4, -D * 0.4 - 0.7, W - 0.4, -D * 0.4, 0.8);
  table(F, W / 2, -D + 0.9, W - 1.2, 0.7, 0.85, 0xc8ccd0, 0x8c9196);
  for (let x = 0.9; x < W - 0.8; x += 0.35) box(F.b, x - 0.13, 0.85, -D + 0.7, x + 0.13, 0.87, -D + 1.1, 0xc89a5a);
  F.item(W / 2, -D * 0.4 + 0.5, { kind: 'shop', label: '豆腐を一丁買う', shop: 'とうふ屋', shopKind: 'tofu' });
};

// 文房具: pens in cups, notebooks fanned on tables, paper and paints on the wall
K.stationery = (F, D, H, door) => {
  const W = F.W;
  wallShelves(F, 0.2, W - 0.2, -D + 0.35, 1.9, 0.33, bookFill({ paperbacks: true }), { color: 0xf2efe6, shelves: 5 });
  F.solid(0.2, -D, W - 0.2, -D + 0.35, 1.9);
  table(F, W * 0.4, -D * 0.5, 1.2, 0.7, 0.85, 0xf2efe6, 0x8c9196);
  for (let i = 0; i < 6; i++) {
    const x = W * 0.4 - 0.45 + (i % 3) * 0.45, z = -D * 0.5 - 0.15 + Math.floor(i / 3) * 0.3;
    F.b.cyl(x, 0.85, z, 0.05, 0.05, 0.1, 10, 0x2a2a2a);
    for (let k = 0; k < 8; k++) F.b.rod(V(x + F.rng.range(-0.03, 0.03), 0.87, z + F.rng.range(-0.03, 0.03)), V(x + F.rng.range(-0.05, 0.05), 1.02, z + F.rng.range(-0.05, 0.05)), 0.005, 0.005, 4, hex(F.rng.pick(['#e8432e', '#2f6fd0', '#2a2a2a', '#48a860', '#f6c341'])));
  }
  F.item(W * 0.4, -D * 0.5 + 0.6, { kind: 'shop', label: 'ペンを試し書きする', shop: '文房具', shopKind: 'stationery' });
};


// ---------------------------------------------------------------------------
// mall and high-street shops
// ---------------------------------------------------------------------------
const CLOTHES = ['#f4f0e6', '#e8a0b0', '#2f3f5e', '#c8d8e8', '#7a2e2a', '#e8d8a8', '#3d5a40', '#2a2a2a', '#f6c0d0'];

// ファッション: rails of clothes, mannequins in the window, folded knits on a table, a fitting room
K.fashion = (F, D, H, door, v) => {
  const W = F.W;
  rack(F, 0.4, W * 0.45, -D * 0.45, CLOTHES, 1.45, 0.8);
  rack(F, W * 0.55, W - 0.4, -D * 0.62, CLOTHES, 1.45, 0.95);
  for (const [x, c, t] of [[0.6, '#f6c0d0', '#f4f0e6'], [W - 0.6, '#2f3f5e', '#e8d8a8']]) if (Math.abs(x - door) > 0.7) mannequin(F, x, -0.55, c, t, PI * 0);
  table(F, W * 0.5, -D * 0.25, 1.0, 0.6, 0.75, 0xe8e0d0, 0xb8bcc0);
  for (let i = 0; i < 6; i++) for (let k = 0; k < 4; k++) box(F.b, W * 0.5 - 0.42 + (i % 3) * 0.29, 0.75 + k * 0.035, -D * 0.25 - 0.22 + Math.floor(i / 3) * 0.24, W * 0.5 - 0.18 + (i % 3) * 0.29, 0.782 + k * 0.035, -D * 0.25 - 0.02 + Math.floor(i / 3) * 0.24, hex(CLOTHES[(i * 3 + k) % CLOTHES.length]));
  // fitting room with a curtain, a long mirror
  const fx = v ? 0.3 : W - 1.2;
  box(F.b, fx, 0, -D + 0.05, fx + 0.9, 2.2, -D + 0.08, 0xe8e0d0);
  for (const x of [fx, fx + 0.9]) box(F.b, x - 0.02, 0, -D + 0.05, x + 0.02, 2.2, -D + 1.0, 0xe8e0d0);
  box(F.b, fx + 0.05, 0.25, -D + 0.98, fx + 0.85, 2.05, -D + 1.0, 0x8a4a5a);
  F.solid(fx - 0.02, -D, fx + 0.92, -D + 1.0, 2.2);
  box(F.b, v ? W - 0.9 : 0.4, 0.1, -D + 0.04, v ? W - 0.4 : 0.9, 1.9, -D + 0.06, 0xdfeef3);
  F.item(W / 2, -D * 0.25 + 0.6, { kind: 'mallshop', label: '服を見てまわる', shop: 'ファッション', sub: '春の新作' });
};

// 雑貨: wooden shelves of mugs, candles, plants and little boxes; a round table display
function zakkaFill(bb, rng, x0, x1, yb, yt, zb, zf) {
  for (let x = x0 + 0.06; x < x1 - 0.06; x += rng.range(0.12, 0.2)) {
    const t = rng.next(), z = (zb + zf) / 2;
    if (t < 0.3) bb.cyl(x, yb, z, 0.04, 0.035, 0.09, 10, hex(rng.pick(['#f6f4ee', '#9fc0d8', '#e8b8a8', '#c8d8a8'])));
    else if (t < 0.5) bb.cyl(x, yb, z, 0.035, 0.035, rng.range(0.08, 0.16), 10, hex(rng.pick(['#f6efe0', '#f6c0d0', '#c8e0f0'])));
    else if (t < 0.7) { bb.cyl(x, yb, z, 0.05, 0.06, 0.08, 8, 0xd8c8a8); ball(bb, x, yb + 0.13, z, 0.065, 0x6aa850); }
    else box(bb, x - 0.05, yb, z - 0.05, x + 0.05, yb + rng.range(0.05, 0.12), z + 0.05, hex(rng.pick(['#f6e7c8', '#e8a0b0', '#a8c8e8', '#d8c8a8'])));
  }
}
K.zakka = (F, D, H, door) => {
  const W = F.W;
  wallShelves(F, 0.3, W - 0.3, -D + 0.35, 2.0, 0.32, zakkaFill, { color: 0xb08a5a, shelves: 5 });
  F.solid(0.3, -D, W - 0.3, -D + 0.35, 2.0);
  const rx = door > W / 2 ? W * 0.3 : W * 0.7;
  table(F, rx, -D * 0.5, 1.0, 1.0, 0.75, 0xc8a46a, 0x6a4a32, true);
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * PI * 2;
    zakkaFill(F.b, F.rng, rx + Math.cos(a) * 0.32 - 0.08, rx + Math.cos(a) * 0.32 + 0.08, 0.75, 1, -D * 0.5 + Math.sin(a) * 0.32 - 0.05, -D * 0.5 + Math.sin(a) * 0.32 + 0.05);
  }
  plant(F, door > W / 2 ? 0.5 : W - 0.5, -0.6, 1.3);
  F.item(rx, -D * 0.5 + 0.8, { kind: 'mallshop', label: '雑貨を手にとる', shop: '雑貨', sub: 'マグカップ' });
};

// スポーツ: a slatwall of shoes, a basket of balls, rackets on hooks, jerseys on a rail
K.sports = (F, D, H, door) => {
  const W = F.W;
  box(F.b, 0.2, 0, -D + 0.02, W - 0.2, 2.4, -D + 0.05, 0xd8dcd8, { pattern: PAT.SEAM });
  for (let r = 0; r < 4; r++) for (let x = 0.4; x < W - 0.4; x += 0.38) {
    const y = 0.5 + r * 0.45, c = hex(F.rng.pick(['#f4f4f0', '#e8432e', '#2f6fd0', '#2a2a2a', '#f6c341', '#48a860']));
    box(F.b, x - 0.12, y - 0.01, -D + 0.05, x + 0.12, y, -D + 0.33, 0x8c9196);
    box(F.b, x - 0.045, y, -D + 0.07, x + 0.045, y + 0.03, -D + 0.32, 0xf4f4f0);
    box(F.b, x - 0.042, y + 0.03, -D + 0.09, x + 0.042, y + 0.1, -D + 0.29, c);
  }
  F.solid(0.2, -D, W - 0.2, -D + 0.35, 2.4);
  // ball basket: footballs, basketballs, volleyballs
  const bx = door > W / 2 ? 0.9 : W - 0.9;
  F.b.cyl(bx, 0, -1.6, 0.42, 0.42, 0.55, 14, 0x3a3a3a, PAT.LATTICE);
  for (let k = 0; k < 9; k++) ball(F.b, bx + F.rng.range(-0.25, 0.25), 0.6 + F.rng.range(0, 0.12), -1.6 + F.rng.range(-0.25, 0.25), 0.11, hex(F.rng.pick(['#f4f4f0', '#e87a2a', '#f6d84a', '#2f6fd0'])));
  F.solid(bx - 0.45, -2.05, bx + 0.45, -1.15, 0.7);
  rack(F, W * 0.35, W * 0.7, -D * 0.5, ['#1f5fa8', '#e8432e', '#f4f4f0', '#2a2a2a', '#48a860'], 1.4, 0.65);
  // rackets on the side wall
  for (let k = 0; k < 5; k++) {
    const z = -D + 1.2 + k * 0.35;
    // hung flat against the wall: an oval head with strings, the grip below
    sub(F, 0.04, z, PI / 2, () => {
      _m.compose(V(0, 1.6, 0.03), _q.identity(), _s.set(0.13, 0.17, 0.014));
      F.b.geom(sphGeo(), _m, hex(F.rng.pick(['#e8432e', '#2f6fd0', '#f6c341'])));
      _m.compose(V(0, 1.6, 0.03), _q.identity(), _s.set(0.11, 0.15, 0.016));
      F.b.geom(sphGeo(), _m, 0xf4f4f0);
      F.b.rod(V(0, 1.15, 0.03), V(0, 1.44, 0.03), 0.016, 0.014, 6, 0x2a2a2a);
    });
  }
  F.item(W / 2, -D * 0.5 + 0.7, { kind: 'mallshop', label: 'ランニングシューズを見る', shop: 'スポーツ', sub: 'シューズ' });
};

// 靴: low angled shelves of single shoes, a bench and a floor mirror
function shoeModel(bb, x, y, z, c, ang = 0, heel = false) {
  _m.compose(V(x, y, z), _q.setFromEuler(_e.set(0, ang, 0)), _s.set(1, 1, 1));
  bb.push(_m.clone());
  box(bb, -0.045, 0, -0.13, 0.045, 0.025, 0.13, heel ? 0x2a2a2a : 0xf4f4f0);
  box(bb, -0.042, 0.025, -0.12, 0.042, heel ? 0.07 : 0.09, 0.06, c);
  dome(bb, 0, 0.025, 0.06, 0.042, heel ? 0.04 : 0.055, 0.07, c);
  if (heel) box(bb, -0.015, -0.06, -0.13, 0.015, 0.0, -0.1, 0x2a2a2a);
  bb.pop();
}
K.shoes = (F, D, H, door, v) => {
  const W = F.W;
  for (let r = 0; r < 4; r++) {
    const y = 0.35 + r * 0.42;
    box(F.b, 0.3, y - 0.02, -D + 0.05, W - 0.3, y, -D + 0.4, 0xf2f2ee);
    for (let x = 0.45; x < W - 0.4; x += 0.3) shoeModel(F.b, x, y + (v && r % 2 ? 0.06 : 0), -D + 0.22, hex(F.rng.pick(['#f4f4f0', '#2a2a2a', '#8a5a3a', '#e8a0b0', '#2f3f5e', '#c8342a'])), PI / 2 - 0.4, v && r % 2 === 1);
  }
  F.solid(0.3, -D, W - 0.3, -D + 0.42, 1.9);
  // two padded ottomans and a floor mirror
  for (const x of [W * 0.35, W * 0.65]) {
    if (Math.abs(x - door) < 0.5) continue;
    box(F.b, x - 0.35, 0, -D * 0.5 - 0.25, x + 0.35, 0.42, -D * 0.5 + 0.25, 0x5a4a6a);
    F.solid(x - 0.35, -D * 0.5 - 0.25, x + 0.35, -D * 0.5 + 0.25, 0.42);
    F.seat(x, -D * 0.5, 0.42, 0, 1, '靴を試し履きする');
  }
  box(F.b, W - 0.4, 0, -D * 0.5 - 0.3, W - 0.36, 1.7, -D * 0.5 + 0.3, 0xdfeef3);
  F.item(W / 2, -D * 0.5 + 0.6, { kind: 'mallshop', label: '新しい靴を見る', shop: '靴', sub: 'スニーカー' });
};

// メガネ: rows of frames on a white wall, a glass counter, a mirror and an eye-test chair
function frames(bb, rng, x0, x1, y, z) {
  for (let x = x0; x < x1 - 0.14; x += 0.17) {
    const c = hex(rng.pick(['#2a2a2a', '#8a5a3a', '#c8a46a', '#4a6a8a', '#c84a5a']));
    for (const e of [-1, 1]) {
      box(bb, x + 0.07 + e * 0.035 - 0.028, y - 0.018, z, x + 0.07 + e * 0.035 + 0.028, y + 0.018, z + 0.006, c);
    }
    box(bb, x + 0.065, y + 0.005, z, x + 0.075, y + 0.012, z + 0.006, c);
  }
}
K.eyewear = (F, D, H, door) => {
  const W = F.W;
  box(F.b, 0.3, 0, -D + 0.02, W - 0.3, 2.2, -D + 0.12, 0xf6f6f2);
  for (let r = 0; r < 6; r++) {
    box(F.b, 0.4, 0.9 + r * 0.2 - 0.04, -D + 0.12, W - 0.4, 0.9 + r * 0.2 - 0.03, -D + 0.2, 0xdfe2e4);
    frames(F.b, F.rng, 0.45, W - 0.45, 0.9 + r * 0.2, -D + 0.13);
  }
  F.solid(0.3, -D, W - 0.3, -D + 0.2, 2.2);
  showcase(F, W * 0.25, W * 0.75, -D * 0.5 - 0.3, -D * 0.5 + 0.2, 1.0, (bb, x0, x1, y, z0, z1) => frames(bb, F.rng, x0, x1, y + 0.03, (z0 + z1) / 2));
  box(F.b, W * 0.5 - 0.15, 1.0, -D * 0.5 - 0.25, W * 0.5 + 0.15, 1.35, -D * 0.5 - 0.22, 0xdfeef3);
  chair(F, door > W / 2 ? 0.7 : W - 0.7, -1.3, door > W / 2 ? PI / 2 : -PI / 2, 0x2a2a2a, 0x8c9196);
  F.item(W / 2, -D * 0.5 + 0.7, { kind: 'mallshop', label: 'メガネをかけてみる', shop: 'メガネ', sub: '新作フレーム' });
};

// おもちゃ: shelves of boxed toys, plush animals, a big bear in the window, a train set
K.toys = (F, D, H, door) => {
  const W = F.W;
  wallShelves(F, 0.25, W - 0.25, -D + 0.42, 2.1, 0.4, (bb, rng, x0, x1, yb, yt, zb, zf) => {
    for (let x = x0 + 0.05; x < x1 - 0.2; x += rng.range(0.22, 0.32)) {
      if (rng.next() < 0.3) {
        // a plush: body, head, ears
        const c = hex(rng.pick(['#c89a6a', '#f4f0e6', '#f6c0d0', '#9fc0d8']));
        ball(bb, x + 0.1, yb + 0.08, (zb + zf) / 2, 0.08, c);
        ball(bb, x + 0.1, yb + 0.2, (zb + zf) / 2, 0.065, c);
        for (const e of [-1, 1]) ball(bb, x + 0.1 + e * 0.045, yb + 0.26, (zb + zf) / 2, 0.025, c);
      } else {
        const hh = Math.min(yt - yb - 0.02, rng.range(0.15, 0.3)), c = hex(rng.pick(['#e8432e', '#2f6fd0', '#f6c341', '#48a860', '#9a4ac0', '#f08a24']));
        box(bb, x, yb, zf - 0.22, x + 0.2, yb + hh, zf - 0.02, c);
        face(bb, x + 0.03, x + 0.17, yb + hh * 0.25, yb + hh * 0.75, zf - 0.019, 0xdfeef3);
      }
    }
  }, { color: 0xf2f2ee, shelves: 5 });
  F.solid(0.25, -D, W - 0.25, -D + 0.42, 2.1);
  // the big bear
  const bx = door > W / 2 ? 0.8 : W - 0.8;
  ball(F.b, bx, 0.35, -0.8, 0.35, 0xb07a4a);
  ball(F.b, bx, 0.9, -0.8, 0.26, 0xb07a4a);
  for (const e of [-1, 1]) { ball(F.b, bx + e * 0.18, 1.12, -0.8, 0.08, 0xb07a4a); ball(F.b, bx + e * 0.3, 0.45, -0.65, 0.11, 0xb07a4a); }
  ball(F.b, bx, 0.86, -0.56, 0.09, 0xe8c8a0);
  F.solid(bx - 0.4, -1.2, bx + 0.4, -0.4, 1.2);
  // the train set on a table
  const tx = W * 0.5;
  table(F, tx, -D * 0.5, 1.4, 0.9, 0.7, 0x7ac07a, 0x6a4a32);
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * PI * 2;
    box(F.b, tx + Math.cos(a) * 0.5 - 0.03, 0.7, -D * 0.5 + Math.sin(a) * 0.3 - 0.03, tx + Math.cos(a) * 0.5 + 0.03, 0.71, -D * 0.5 + Math.sin(a) * 0.3 + 0.03, 0x8c9196);
  }
  for (let k = 0; k < 3; k++) box(F.b, tx - 0.15 + k * 0.11, 0.71, -D * 0.5 - 0.33, tx - 0.06 + k * 0.11, 0.77, -D * 0.5 - 0.27, k ? 0xf6efe0 : 0x2f6fd0);
  F.item(tx, -D * 0.5 + 0.8, { kind: 'mallshop', label: 'おもちゃの電車を眺める', shop: 'おもちゃ', sub: '鉄道模型' });
};

// 家電: a wall of televisions showing the sea, laptops open on tables, boxed appliances
function screenTex(F) {
  return F.ctx.atlas2.draw('shopin:tv', 160, 90, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#6fb3e6');
    g.addColorStop(0.55, '#e6f3fb');
    g.addColorStop(0.56, '#2f6fb0');
    g.addColorStop(1, '#1f4f8a');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#f2b6c8';
    c.beginPath();
    c.arc(w * 0.25, h * 0.4, h * 0.22, 0, PI * 2);
    c.fill();
    c.fillStyle = '#f7fbff';
    c.beginPath();
    c.moveTo(w * 0.55, h * 0.55);
    c.lineTo(w * 0.7, h * 0.2);
    c.lineTo(w * 0.85, h * 0.55);
    c.fill();
  });
}
K.electronics = (F, D, H, door) => {
  const W = F.W, uv = screenTex(F);
  box(F.b, 0.2, 0, -D + 0.02, W - 0.2, 0.6, -D + 0.5, 0x3a3c40);
  F.solid(0.2, -D, W - 0.2, -D + 0.5, 0.6);
  const sizes = [[1.3, 0.75], [1.0, 0.58], [0.8, 0.46], [1.0, 0.58], [1.3, 0.75]];
  let x = 0.35;
  for (const [w, h] of sizes) {
    if (x + w > W - 0.3) break;
    for (const yy of [0.62, 1.55]) {
      box(F.b, x, yy, -D + 0.12, x + w, yy + h, -D + 0.17, 0x1a1a1a);
      face(F.sb, x + 0.03, x + w - 0.03, yy + 0.03, yy + h - 0.03, -D + 0.171, 0, uv, 1.6);
    }
    x += w + 0.12;
  }
  for (const tx of [W * 0.3, W * 0.7]) {
    if (Math.abs(tx - door) < 0.6) continue;
    table(F, tx, -D * 0.45, 1.0, 0.6, 0.8, 0xf2f2ee, 0xb8bcc0);
    for (const dx of [-0.25, 0.25]) {
      box(F.b, tx + dx - 0.16, 0.8, -D * 0.45 - 0.05, tx + dx + 0.16, 0.815, -D * 0.45 + 0.17, 0xc0c4c8);
      sub(F, tx + dx, -D * 0.45 - 0.05, 0, () => {
        F.b.push(new THREE.Matrix4().makeRotationX(-0.25));
        box(F.b, -0.16, 0.8, -0.01, 0.16, 1.0, 0.0, 0xc0c4c8);
        face(F.sb, -0.14, 0.14, 0.82, 0.98, 0.002, 0, uv, 1.4);
        F.b.pop();
      });
    }
  }
  sideShelves(F, door > W / 2 ? -1 : 1, -D + 0.8, -1.0, 1.6, 0.45, (bb, rng, x0, x1, yb, yt, zb, zf) => {
    for (let xx = x0 + 0.03; xx < x1 - 0.3; xx += 0.36) box(bb, xx, yb, zb + 0.05, xx + 0.32, yb + Math.min(yt - yb - 0.02, 0.32), zf - 0.02, hex(rng.pick(['#f4f4f0', '#e8eef2', '#2a2a2a', '#c8d4e0'])));
  }, { color: 0xe8e8e2, shelves: 4 });
  F.item(W / 2, -D * 0.45 + 0.7, { kind: 'mallshop', label: '新しいテレビを眺める', shop: '家電', sub: '4Kテレビ' });
};

// アクセサリー: glass counters of rings and earrings, velvet busts with necklaces, hats
K.accessory = (F, D, H, door) => {
  const W = F.W;
  for (const [x0, x1] of [[0.4, W * 0.45], [W * 0.55, W - 0.4]]) {
    showcase(F, x0, x1, -D * 0.5 - 0.25, -D * 0.5 + 0.25, 1.0, (bb, a0, a1, y, z0, z1) => {
      box(bb, a0, y, z0, a1, y + 0.02, z1, 0x2a2a3a);
      for (let x = a0 + 0.05; x < a1 - 0.03; x += 0.07) for (let k = 0; k < 3; k++) ball(bb, x, y + 0.03, z0 + 0.06 + k * 0.12, 0.012, F.rng.pick([0xe8c860, 0xe8e8f0, 0xf6b0c8, 0x9fd0f0]));
    });
  }
  for (let i = 0; i < 3; i++) {
    const x = 0.6 + i * ((W - 1.2) / 2);
    box(F.b, x - 0.1, 0, -D + 0.3, x + 0.1, 1.1, -D + 0.5, 0xe8e0d0);
    F.b.cyl(x, 1.1, -D + 0.4, 0.12, 0.09, 0.3, 10, 0x2a2a3a);
    for (let k = 0; k < 7; k++) {
      const a = PI * (0.2 + (k / 6) * 0.6);
      ball(F.b, x + Math.cos(a) * 0.12, 1.32 - Math.sin(a) * 0.1, -D + 0.4 + 0.08, 0.012, 0xe8c860);
    }
  }
  F.solid(0.4, -D + 0.25, W - 0.4, -D + 0.55, 1.4);
  for (const x of [0.4, W - 0.4]) {
    if (Math.abs(x - door) < 0.6) continue;
    F.b.cyl(x, 0, -1.0, 0.02, 0.02, 1.5, 6, 0x8c9196);
    for (const [h, c] of [[1.5, 0xe8d8a8], [1.2, 0x2a2a2a]]) { F.b.cyl(x, h, -1.0, 0.18, 0.18, 0.012, 14, c); F.b.cyl(x, h, -1.0, 0.1, 0.09, 0.09, 12, c); }
  }
  F.item(W / 2, -D * 0.5 + 0.6, { kind: 'mallshop', label: 'ピアスを見せてもらう', shop: 'アクセサリー', sub: '桜モチーフ' });
};

// キッチン雑貨: pots and pans on wall shelves, stacks of plates, kettles on a table
K.kitchen = (F, D, H, door) => {
  const W = F.W;
  wallShelves(F, 0.3, W - 0.3, -D + 0.42, 2.0, 0.4, (bb, rng, x0, x1, yb, yt, zb, zf) => {
    const z = (zb + zf) / 2;
    for (let x = x0 + 0.15; x < x1 - 0.15; x += 0.34) {
      const t = rng.next(), c = hex(rng.pick(['#c8342a', '#2a2a2a', '#f6f4ee', '#2f6fb0', '#e8b84a', '#8a9aa0']));
      if (t < 0.4) { bb.cyl(x, yb, z, 0.13, 0.13, 0.12, 14, c, 0, { top: shade(c, 0.8) }); bb.cyl(x, yb + 0.12, z, 0.02, 0.02, 0.03, 6, 0x2a2a2a); }
      else if (t < 0.7) for (let k = 0; k < 8; k++) bb.cyl(x, yb + k * 0.012, z, 0.12, 0.1, 0.012, 14, 0xf6f4ee);
      else for (let k = 0; k < 3; k++) bb.cyl(x - 0.1 + k * 0.1, yb, z, 0.04, 0.035, 0.09, 10, c);
    }
  }, { color: 0xe8e0d0, shelves: 4 });
  F.solid(0.3, -D, W - 0.3, -D + 0.42, 2.0);
  table(F, W * 0.5, -D * 0.45, 1.3, 0.7, 0.8, 0xc8a46a, 0x6a4a32);
  for (let k = 0; k < 4; k++) {
    const x = W * 0.5 - 0.45 + k * 0.3;
    F.b.cyl(x, 0.8, -D * 0.45, 0.09, 0.07, 0.16, 12, hex(['#c8342a', '#2f6fb0', '#f6f4ee', '#e8b84a'][k]), 0, { top: 0x2a2a2a });
    F.b.rod(V(x + 0.07, 0.9, -D * 0.45), V(x + 0.14, 0.97, -D * 0.45), 0.012, 0.008, 5, 0x2a2a2a);
  }
  F.item(W / 2, -D * 0.45 + 0.6, { kind: 'mallshop', label: 'ホーロー鍋を見る', shop: 'キッチン雑貨', sub: 'ホーロー' });
};

// CD & レコード: bins of CDs and records, wall racks, a listening corner with headphones
K.music = (F, D, H, door) => {
  const W = F.W;
  wallShelves(F, 0.2, W - 0.2, -D + 0.3, 2.1, 0.28, bookFill({ cds: true, palette: ['#2a2a2a', '#e8432e', '#2f6fd0', '#f6c341', '#f4f4f0', '#9a4ac0', '#48a860'] }), { color: 0x3a3c40, shelves: 7 });
  F.solid(0.2, -D, W - 0.2, -D + 0.3, 2.1);
  for (const x of [W * 0.3, W * 0.7]) {
    if (Math.abs(x - door) < 0.5) continue;
    box(F.b, x - 0.45, 0, -D * 0.5 - 0.3, x + 0.45, 0.85, -D * 0.5 + 0.3, 0x3a3c40);
    for (let k = 0; k < 20; k++) sub(F, x - 0.42 + (k % 10) * 0.085, -D * 0.5 - 0.25 + Math.floor(k / 10) * 0.3, 0, () => {
      F.b.push(new THREE.Matrix4().makeRotationX(-0.35));
      box(F.b, 0, 0.75, 0, 0.3, 0.98, 0.004, hex(F.rng.pick(['#2a2a2a', '#e8432e', '#2f6fd0', '#f6c341', '#f4f4f0', '#c86a8a'])));
      F.b.pop();
    });
    F.solid(x - 0.45, -D * 0.5 - 0.3, x + 0.45, -D * 0.5 + 0.3, 0.9);
  }
  const hx = door > W / 2 ? 0.5 : W - 0.5;
  box(F.b, hx - 0.3, 0, -1.5, hx + 0.3, 1.1, -1.2, 0x2a2a2a);
  for (const dz of [-0.1, 0.1]) { F.b.cyl(hx + dz, 1.25, -1.35, 0.06, 0.06, 0.03, 10, 0x2a2a2a); box(F.b, hx + dz - 0.005, 1.28, -1.36, hx + dz + 0.005, 1.4, -1.34, 0x2a2a2a); }
  F.solid(hx - 0.3, -1.5, hx + 0.3, -1.2, 1.1);
  F.item(hx, -0.9, { kind: 'mallshop', label: '試聴してみる', shop: 'CD', sub: '新譜' });
};

// ペット: kennel windows with puppies and kittens, a wall of pet food, a cat tower
K.pet = (F, D, H, door) => {
  const W = F.W;
  for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) {
    const x0 = 0.3 + c * ((W - 0.6) / 4), x1 = x0 + (W - 0.6) / 4 - 0.05, y0 = 0.5 + r * 0.7;
    // an open kennel: floor, roof, back and side panels, bedding, glass in front
    box(F.b, x0, y0, -D + 0.02, x1, y0 + 0.03, -D + 0.6, 0xf2efe6);
    box(F.b, x0, y0 + 0.59, -D + 0.02, x1, y0 + 0.62, -D + 0.6, 0xf2efe6);
    box(F.b, x0, y0, -D + 0.02, x1, y0 + 0.62, -D + 0.05, 0xfff8e8);
    for (const x of [x0, x1 - 0.025]) box(F.b, x, y0, -D + 0.02, x + 0.025, y0 + 0.62, -D + 0.6, 0xf2efe6);
    box(F.b, x0 + 0.03, y0 + 0.03, -D + 0.06, x1 - 0.03, y0 + 0.05, -D + 0.58, 0xe8d8a8);
    box(F.eb, x0 + 0.05, y0 + 0.57, -D + 0.2, x1 - 0.05, y0 + 0.59, -D + 0.4, 0xfff4e0);
    glassZ(F, x0, x1, y0, y0 + 0.62, -D + 0.61);
    const col = hex(F.rng.pick(['#f4f0e6', '#c89a6a', '#2a2a2a', '#e8b880']));
    ball(F.b, (x0 + x1) / 2, y0 + 0.12, -D + 0.3, 0.1, col, 0.8);
    ball(F.b, (x0 + x1) / 2 + 0.1, y0 + 0.17, -D + 0.38, 0.07, col);
    for (const e of [-1, 1]) ball(F.b, (x0 + x1) / 2 + 0.1 + e * 0.04, y0 + 0.24, -D + 0.38, 0.025, col);
  }
  box(F.b, 0.3, 0, -D + 0.02, W - 0.3, 0.5, -D + 0.6, 0xe8e0d0);
  F.solid(0.3, -D, W - 0.3, -D + 0.62, 1.9);
  sideShelves(F, door > W / 2 ? -1 : 1, -D + 1.0, -1.0, 1.4, 0.4, (bb, rng, x0, x1, yb, yt, zb, zf) => {
    for (let x = x0 + 0.03; x < x1 - 0.25; x += 0.27) box(bb, x, yb, zb + 0.05, x + 0.24, yb + Math.min(yt - yb - 0.03, 0.3), zf - 0.04, hex(rng.pick(['#e8432e', '#f6c341', '#2f6fd0', '#48a860'])));
  }, { color: 0xf2f2ee, shelves: 3 });
  const cx = door > W / 2 ? W - 0.7 : 0.7;
  for (const [y, r] of [[0.0, 0.3], [0.6, 0.25], [1.2, 0.22]]) { F.b.cyl(cx, y + 0.05, -1.4, r, r, 0.06, 12, 0xd8c8a8); F.b.cyl(cx, y, -1.4, 0.05, 0.05, 0.6, 8, 0xc8b08a, PAT.LATTICE); }
  ball(F.b, cx, 1.36, -1.4, 0.1, 0xf08a2a, 0.7);
  F.solid(cx - 0.3, -1.7, cx + 0.3, -1.1, 1.4);
  F.item(W / 2, -D + 1.2, { kind: 'mallshop', label: '子犬に手を振る', shop: 'ペット', sub: 'こいぬ' });
};

// バッグ: bags on cubes and wall hooks, a totes rail, a central plinth
K.bags = (F, D, H, door) => {
  const W = F.W;
  const bag = (x, y, z, c, w = 0.3, h = 0.24) => {
    box(F.b, x - w / 2, y, z - 0.07, x + w / 2, y + h, z + 0.07, c);
    F.b.rod(V(x - w * 0.3, y + h, z), V(x, y + h + 0.12, z), 0.01, 0.01, 4, shade(c, 0.7));
    F.b.rod(V(x, y + h + 0.12, z), V(x + w * 0.3, y + h, z), 0.01, 0.01, 4, shade(c, 0.7));
  };
  for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) {
    const x0 = 0.3 + c * ((W - 0.6) / 4), y = 0.45 + r * 0.55;
    box(F.b, x0, y - 0.04, -D + 0.02, x0 + (W - 0.6) / 4 - 0.05, y, -D + 0.42, 0xe8e0d0);
    bag(x0 + (W - 0.6) / 8, y, -D + 0.22, hex(F.rng.pick(['#8a5a3a', '#2a2a2a', '#e8d8a8', '#c84a5a', '#2f3f5e'])));
  }
  F.solid(0.3, -D, W - 0.3, -D + 0.42, 1.9);
  for (const [x, h] of [[W * 0.35, 0.6], [W * 0.5, 0.9], [W * 0.65, 0.4]]) {
    if (Math.abs(x - door) < 0.4) continue;
    box(F.b, x - 0.25, 0, -D * 0.5 - 0.25, x + 0.25, h, -D * 0.5 + 0.25, 0xf6f4ee);
    bag(x, h, -D * 0.5, hex(F.rng.pick(['#8a5a3a', '#c84a5a', '#e8d8a8'])), 0.36, 0.28);
    F.solid(x - 0.25, -D * 0.5 - 0.25, x + 0.25, -D * 0.5 + 0.25, h);
  }
  F.item(W / 2, -D * 0.5 + 0.6, { kind: 'mallshop', label: 'トートバッグを見る', shop: 'バッグ', sub: '帆布' });
};

// コスメ: brightly lit testers in tiers, a mirror counter with stools, posters
K.cosmetics = (F, D, H, door) => {
  const W = F.W;
  for (const [x0, x1] of [[0.3, W * 0.47], [W * 0.53, W - 0.3]]) {
    const row = tiers(F, x0, x1, -D + 0.9, 3, 0.35, 0.28, 0xf6f4ee);
    for (let i = 0; i < 3; i++) for (let x = x0 + 0.05; x < x1 - 0.04; x += 0.05) F.b.cyl(x, row(i).y, row(i).z, 0.015, 0.015, F.rng.range(0.05, 0.11), 6, hex(F.rng.pick(['#c8342a', '#f6b0c8', '#e8a080', '#f4f0e6', '#2a2a2a', '#c86a8a'])));
    box(F.eb, x0, 1.3, -D + 0.05, x1, 1.32, -D + 0.12, 0xffffff);
  }
  box(F.b, 0.3, 0, -D + 0.02, W - 0.3, 1.0, -D + 0.08, 0xf6f4ee);
  for (const x of [W * 0.3, W * 0.7]) poster(F, x - 0.35, x + 0.35, 1.5, 2.3, -D + 0.02, hex(F.rng.pick(['#f6c0d0', '#e8d8f0'])), 0xf6f4ee);
  counter(F, W * 0.3, W * 0.7, -2.2, -1.7, 0.9, 0xf6f4ee, 0xffffff, PAT.NONE);
  for (const x of [W * 0.38, W * 0.62]) { box(F.b, x - 0.12, 0.9, -2.15, x + 0.12, 1.25, -2.12, 0xdfeef3); stool(F, x, -1.35, 0.65, 0xf6c0d0, '鏡の前に座る', 0, -1); }
  F.item(W / 2, -1.0, { kind: 'mallshop', label: 'リップを試してみる', shop: 'コスメ', sub: '春の新色' });
};

// ゲームコーナー: crane games (UFOキャッチャー) with plush inside, a medal pusher, a prize counter
K.games = (F, D, H, door) => {
  const W = F.W;
  const crane = (x, z, c) => {
    box(F.b, x - 0.4, 0, z - 0.4, x + 0.4, 0.75, z + 0.4, c);
    box(F.b, x - 0.4, 1.85, z - 0.4, x + 0.4, 2.05, z + 0.4, c);
    for (const [a, b2] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) box(F.b, x + a * 0.4 - 0.02, 0.75, z + b2 * 0.4 - 0.02, x + a * 0.4 + 0.02, 1.85, z + b2 * 0.4 + 0.02, 0xc0c4c8);
    glassZ(F, x - 0.38, x + 0.38, 0.75, 1.85, z + 0.4);
    glassX(F, x - 0.4, z - 0.38, z + 0.38, 0.75, 1.85);
    glassX(F, x + 0.4, z - 0.38, z + 0.38, 0.75, 1.85);
    for (let k = 0; k < 10; k++) {
      const pc = hex(F.rng.pick(['#f6c0d0', '#f6e7c8', '#9fc0d8', '#f4f0e6', '#c89a6a']));
      const px = x + F.rng.range(-0.28, 0.28), pz = z + F.rng.range(-0.28, 0.2);
      ball(F.b, px, 0.82, pz, 0.08, pc);
      ball(F.b, px, 0.95, pz, 0.06, pc);
    }
    F.b.cyl(x + 0.1, 1.4, z, 0.006, 0.006, 0.45, 4, 0xc0c4c8);
    for (let k = 0; k < 3; k++) { const a = (k / 3) * PI * 2; F.b.rod(V(x + 0.1, 1.4, z), V(x + 0.1 + Math.cos(a) * 0.07, 1.28, z + Math.sin(a) * 0.07), 0.006, 0.006, 4, 0xc0c4c8); }
    box(F.eb, x - 0.38, 1.88, z + 0.405, x + 0.38, 2.0, z + 0.41, 0xffd0e0);
    F.solid(x - 0.42, z - 0.42, x + 0.42, z + 0.42, 2.05);
  };
  let k = 0;
  for (let x = 0.7; x < W - 0.5; x += 1.05) {
    if (Math.abs(x - door) < 0.7) continue;
    crane(x, -D * 0.4, [0xf06a8a, 0x5ab0e8, 0xf6c341, 0x7ad07a][k++ % 4]);
  }
  // a prize counter at the back
  counter(F, W * 0.25, W * 0.75, -D + 0.4, -D + 0.9, 1.0, 0xf6c341, 0xffffff);
  for (let x = W * 0.3; x < W * 0.7; x += 0.25) ball(F.b, x, 1.08, -D + 0.6, 0.08, hex(F.rng.pick(['#f6c0d0', '#9fc0d8', '#f6e7c8'])));
  F.item(W / 2, -D * 0.4 + 0.8, { kind: 'mallshop', label: 'UFOキャッチャーをやってみる', shop: 'ゲームコーナー', sub: 'ぬいぐるみ' });
};

// 手芸: cubbies of yarn balls, bolts of fabric on a table, a sewing machine
K.craft = (F, D, H, door) => {
  const W = F.W;
  wallShelves(F, 0.3, W - 0.3, -D + 0.35, 2.0, 0.32, (bb, rng, x0, x1, yb, yt, zb, zf) => {
    for (let x = x0 + 0.07; x < x1 - 0.06; x += 0.13) for (let k = 0; k < 2; k++) ball(bb, x, yb + 0.06 + k * 0.1, (zb + zf) / 2, 0.06, hex(rng.pick(['#e86a8a', '#f6c341', '#7ac0a0', '#9fc0d8', '#f4f0e6', '#c89a6a', '#b07ae0'])));
  }, { color: 0xc8a46a, shelves: 5 });
  F.solid(0.3, -D, W - 0.3, -D + 0.35, 2.0);
  table(F, W * 0.45, -D * 0.5, 1.4, 0.8, 0.8, 0xc8a46a, 0x6a4a32);
  for (let k = 0; k < 8; k++) box(F.b, W * 0.45 - 0.62 + k * 0.155, 0.8, -D * 0.5 - 0.3, W * 0.45 - 0.5 + k * 0.155, 0.84 + (k % 3) * 0.01, -D * 0.5 + 0.3, hex(F.rng.pick(['#f6c0d0', '#e8d8a8', '#9fc0d8', '#c8e0c0', '#f4f0e6', '#e8a080'])));
  const sx = door > W / 2 ? 0.8 : W - 0.8;
  table(F, sx, -1.4, 0.7, 0.5, 0.72, 0x6a4a32, 0x3a2a1e);
  box(F.b, sx - 0.2, 0.72, -1.5, sx + 0.2, 0.82, -1.3, 0xf2f2ee);
  box(F.b, sx + 0.12, 0.82, -1.5, sx + 0.2, 1.0, -1.3, 0xf2f2ee);
  box(F.b, sx - 0.2, 0.95, -1.5, sx + 0.2, 1.02, -1.3, 0xf2f2ee);
  F.item(W * 0.45, -D * 0.5 + 0.6, { kind: 'mallshop', label: '毛糸を選ぶ', shop: '手芸', sub: '春色の毛糸' });
};

// 牛丼: a horseshoe counter with stools round it, rice cookers and the beef pot inside
K.gyudon = (F, D, H, door) => {
  const W = F.W, cx = W / 2, cz = -D * 0.5;
  const w = Math.min(W - 2.0, 3.0), d = Math.min(D - 3.0, 2.6);
  counter(F, cx - w / 2, cx + w / 2, cz - d / 2, cz - d / 2 + 0.45, 1.0, 0xf08a24, 0xe8dcc0);
  counter(F, cx - w / 2, cx - w / 2 + 0.45, cz - d / 2 + 0.45, cz + d / 2, 1.0, 0xf08a24, 0xe8dcc0);
  counter(F, cx + w / 2 - 0.45, cx + w / 2, cz - d / 2 + 0.45, cz + d / 2, 1.0, 0xf08a24, 0xe8dcc0);
  for (let x = cx - w / 2 + 0.3; x < cx + w / 2 - 0.2; x += 0.55) stool(F, x, cz - d / 2 - 0.4, 0.7, 0xf08a24, 'カウンターに座る', 0, 1);
  for (let z = cz - d / 2 + 0.7; z < cz + d / 2 - 0.1; z += 0.6) {
    stool(F, cx - w / 2 - 0.4, z, 0.7, 0xf08a24, 'カウンターに座る', 1, 0);
    stool(F, cx + w / 2 + 0.4, z, 0.7, 0xf08a24, 'カウンターに座る', -1, 0);
  }
  F.b.cyl(cx, 1.0, cz - d / 2 + 0.22, 0.2, 0.2, 0.12, 14, 0xb8bcc0, PAT.METAL, { top: 0x7a4a2a });
  for (let x = cx - w / 2 + 0.6; x < cx + w / 2 - 0.5; x += 0.5) { F.b.cyl(x, 1.0, cz - d / 2 + 0.22, 0.06, 0.05, 0.06, 10, 0xf6f4ee); F.b.cyl(x, 1.06, cz - d / 2 + 0.22, 0.03, 0.03, 0.02, 6, 0xc8342a); }
  box(F.b, cx - 0.5, 0, cz + d / 2 - 0.9, cx + 0.5, 1.0, cz + d / 2 - 0.4, 0xb8bcc0, { pattern: PAT.METAL });
  for (const dx of [-0.25, 0.25]) F.b.cyl(cx + dx, 1.0, cz + d / 2 - 0.65, 0.18, 0.18, 0.25, 12, 0xd8dcd8);
  F.item(cx, cz - d / 2 - 0.9, { kind: 'shop', label: '牛丼並を注文する', shop: '牛丼', shopKind: 'gyudon' });
};

// クレープ: a stand counter with two crêpe griddles, a sample case of plastic crêpes, a menu
K.crepe = (F, D, H, door) => {
  const W = F.W;
  counter(F, 0.4, W - 0.4, -D + 0.9, -D + 1.5, 1.0, 0xf6c0d0, 0xffffff);
  for (const x of [W * 0.35, W * 0.65]) F.b.cyl(x, 1.0, -D + 1.2, 0.2, 0.2, 0.04, 16, 0x2a2a2a, 0, { top: 0xe8c890 });
  showcase(F, door > W / 2 ? 0.3 : W - 1.5, door > W / 2 ? 1.5 : W - 0.3, -0.9, -0.4, 1.2, (bb, x0, x1, y, z0, z1) => {
    for (let x = x0 + 0.1; x < x1 - 0.05; x += 0.18) {
      _m.compose(V(x, y + 0.12, (z0 + z1) / 2), _q.setFromEuler(_e.set(PI, 0, 0)), _s.set(0.05, 0.14, 0.05));
      bb.geom(new THREE.ConeGeometry(1, 1, 10), _m, 0xe8c890);
      ball(bb, x, y + 0.2, (z0 + z1) / 2, 0.045, rng01(x) < 0.5 ? 0xf6f2ea : 0xf6c0d0);
      ball(bb, x + 0.02, y + 0.24, (z0 + z1) / 2, 0.02, 0xe8432e);
    }
  });
  textBoard(F, 'crepe-in', ['いちごカスタード ¥480', 'チョコバナナ ¥450', 'ツナサラダ ¥520'], '#ffd6e4', '#a8325a', W / 2 - 1.0, W / 2 + 1.0, 1.7, 2.35, -D + 0.02, FONTS.maru);
  // eat-in: round standing tables, a pink bench along the side wall, balloons by the menu
  for (let k = 0; k < 2; k++) {
    const x = W * (0.3 + k * 0.4), z = -D * 0.5 + 0.3;
    if (Math.abs(x - door) < 0.7) continue;
    table(F, x, z, 0.6, 0.6, 1.05, 0xffffff, 0xc8a0b0, true);
  }
  const bx = door > W / 2 ? 0.25 : W - 0.75;
  box(F.b, bx, 0.42, -D + 1.8, bx + 0.5, 0.48, -1.2, 0xf6c0d0);
  box(F.b, bx + (door > W / 2 ? 0 : 0.44), 0.48, -D + 1.8, bx + (door > W / 2 ? 0.06 : 0.5), 0.95, -1.2, 0xf6c0d0);
  F.solid(bx, -D + 1.8, bx + 0.5, -1.2, 0.48);
  F.seat(bx + 0.25, (-D + 0.6) / 2, 0.48, door > W / 2 ? 1 : -1, 0, 'ベンチに座る');
  for (const [dx, c] of [[-1.25, 0xffd6e4], [-1.1, 0xfff1a8], [1.15, 0xc8e8ff]]) { F.b.cyl(W / 2 + dx, 1.3, -D + 0.1, 0.004, 0.004, 0.8, 3, 0xe8e8e8); ball(F.b, W / 2 + dx, 2.2, -D + 0.12, 0.13, c, 1.15); }
  F.item(W / 2, -D + 2.0, { kind: 'shop', label: 'クレープを注文する', shop: 'クレープ', shopKind: 'crepe' });
};

// 100円ショップ: long gondolas of everything with yellow price strips, baskets by the door
K.zakka100 = (F, D, H, door) => {
  const W = F.W;
  for (const x of [W * 0.28, W * 0.72]) {
    if (Math.abs(x - door) < 0.5) continue;
    for (const e of [-1, 1]) sub(F, x + e * 0.3, e > 0 ? -D + 1.4 : -1.2, e > 0 ? -PI / 2 : PI / 2, () => shelving(F.b, F.rng, D - 2.6, 1.6, 0.3, { color: 0xf6f4ee, shelves: 5, plinth: 0.1, lip: 0.025, lipColor: 0xffe14a, fill: goodsFill(['daily', 'sweets', 'daily', 'snacks', 'daily']) }));
    F.solid(x - 0.32, -D + 1.4, x + 0.32, -1.2, 1.6);
  }
  wallShelves(F, 0.2, W - 0.2, -D + 0.35, 1.9, 0.33, zakkaFill, { color: 0xf6f4ee, shelves: 5, lip: 0.025, lipColor: 0xffe14a });
  F.solid(0.2, -D, W - 0.2, -D + 0.35, 1.9);
  for (let k = 0; k < 4; k++) box(F.b, door - 0.6 + (k % 2) * 1.0, Math.floor(k / 2) * 0.15, -0.6, door - 0.3 + (k % 2) * 1.0, Math.floor(k / 2) * 0.15 + 0.15, -0.35, 0xe8432e);
  F.item(W / 2, -D * 0.5, { kind: 'shop', label: '便利グッズを探す', shop: '100円ショップ', shopKind: 'zakka100' });
};

// ケーキ: a long refrigerated case of cakes on doilies, macarons in a glass jar, a tea table
K.cake = (F, D, H, door) => {
  const W = F.W;
  showcase(F, 0.5, W - 0.5, -D * 0.45 - 0.6, -D * 0.45, 1.05, (bb, x0, x1, y, z0, z1) => {
    for (const yy of [y, y + 0.25]) {
      box(bb, x0, yy, z0, x1, yy + 0.01, z1, 0xf6f4ee);
      for (let x = x0 + 0.08; x < x1 - 0.06; x += 0.15) {
        const t = Math.floor(rng01(x + yy) * 4), z = (z0 + z1) / 2;
        if (t === 0) { box(bb, x - 0.05, yy + 0.01, z - 0.05, x + 0.05, yy + 0.08, z + 0.05, 0xfbf6ee); ball(bb, x, yy + 0.1, z, 0.02, 0xe8432e); }
        else if (t === 1) bb.cyl(x, yy + 0.01, z, 0.05, 0.05, 0.06, 12, 0x5a3a2a, 0, { top: 0x3a2418 });
        else if (t === 2) { bb.cyl(x, yy + 0.01, z, 0.05, 0.045, 0.07, 12, 0xf6c0d0); ball(bb, x, yy + 0.09, z, 0.02, 0xffffff); }
        else dome(bb, x, yy + 0.01, z, 0.05, 0.06, 0.05, 0xe8c890);
      }
    }
  });
  ball(F.gb, W - 0.6, 1.2, -D + 0.5, 0.12, 0xffffff);
  table(F, door > W / 2 ? 0.9 : W - 0.9, -1.2, 0.6, 0.6, 0.72, 0xf6f4ee, 0xc8a46a, true);
  chair(F, door > W / 2 ? 0.9 : W - 0.9, -1.65, 0, 0xc98aa0, 0xc8a46a, 'テーブル席に座る');
  F.item(W / 2, -D * 0.45 + 0.6, { kind: 'shop', label: 'ケーキを選ぶ', shop: 'ケーキ', shopKind: 'cake' });
};

// 和食: low tables on a raised tatami floor, a counter of dishes, menu strips
K.washoku = (F, D, H, door) => {
  const W = F.W;
  const zt = -D * 0.45;
  box(F.b, 0.2, 0, -D + 0.2, W - 0.2, 0.35, zt, 0xc8b878, { pattern: PAT.TATAMI });
  F.ctx.colliders.addSurface(...(() => { const [a, b2] = F.toW(0.2, -D + 0.2), [c, d] = F.toW(W - 0.2, zt); return [Math.min(a, c), Math.min(b2, d), Math.max(a, c), Math.max(b2, d)]; })(), () => F.y + 0.35, 3);
  for (let x = 1.0; x < W - 0.6; x += 1.6) {
    box(F.b, x - 0.5, 0.35, zt - 1.3, x + 0.5, 0.65, zt - 0.6, 0x5a3a2a);
    for (const dz of [-1.55, -0.35]) { box(F.b, x - 0.25, 0.35, zt + dz - 0.2, x + 0.25, 0.42, zt + dz + 0.2, 0x7a2a3a); }
    F.seat(x, zt - 0.35, 0.42, 0, -1, '座敷に座る');
    F.b.cyl(x - 0.2, 0.65, zt - 0.95, 0.05, 0.04, 0.04, 10, 0x3a3a3a);
  }
  counter(F, 0.4, W - 0.4, -1.8, -1.35, 1.0, 0x6a4a32, 0xc8a46a);
  menuStrips(F, 'washoku-menu', ['刺身定食', '焼き魚定食', '天ぷら', 'しらす丼', '茶碗蒸し'], 0.4, W - 0.4, H - 0.1, -D + 0.02, '#f6efe0', '#3a2a1f');
  F.item(W / 2, -1.0, { kind: 'shop', label: '定食を注文する', shop: '和食', shopKind: 'washoku' });
};

// 焼肉: booths with gas grills and extractor hoods, plates of meat
K.yakiniku = (F, D, H, door) => {
  const W = F.W;
  for (let z = -1.6; z > -D + 1.0; z -= 1.9) {
    for (const x of [W * 0.3, W * 0.7]) {
      if (Math.abs(x - door) < 0.6 && z > -2) continue;
      table(F, x, z, 0.9, 0.8, 0.72, 0x2a2a2a, 0x1a1a1a);
      F.b.cyl(x, 0.72, z, 0.2, 0.2, 0.03, 16, 0x5a5a5a, 0, { top: 0x2a2a2a });
      for (let k = 0; k < 5; k++) box(F.b, x - 0.15 + k * 0.07, 0.75, z - 0.08, x - 0.1 + k * 0.07, 0.755, z + 0.08, 0xc8606a);
      F.b.cyl(x, 1.2, z, 0.15, 0.08, 0.5, 10, 0xb8bcc0, PAT.METAL);
      F.b.cyl(x, 1.7, z, 0.05, 0.05, H - 1.7, 6, 0xb8bcc0);
      for (const e of [-1, 1]) {
        box(F.b, x - 0.5, 0.42, z + e * 0.65 - 0.2, x + 0.5, 0.47, z + e * 0.65 + 0.2, 0x5a1a1a);
        box(F.b, x - 0.5, 0.47, z + e * 0.85 - 0.04, x + 0.5, 1.0, z + e * 0.85 + 0.04, 0x5a1a1a);
      }
      F.solid(x - 0.5, z - 0.9, x + 0.5, z + 0.9, 1.0);
      F.seat(x, z + 0.65, 0.47, 0, -1, '焼肉の席に座る');
    }
  }
  F.item(W / 2, -1.0, { kind: 'shop', label: 'カルビを注文する', shop: '焼肉', shopKind: 'yakiniku' });
};

// 不動産: desks with chairs and monitors, listings pinned all over the window walls
K.realestate = (F, D, H, door) => {
  const W = F.W;
  for (let i = 0; i < 2; i++) {
    const x = W * (0.3 + i * 0.4);
    table(F, x, -D * 0.55, 1.2, 0.7, 0.72, 0xf2f2ee, 0x8c9196);
    box(F.b, x - 0.25, 0.72, -D * 0.55 - 0.3, x + 0.25, 1.05, -D * 0.55 - 0.27, 0x2a2a2a);
    chair(F, x, -D * 0.55 + 0.6, PI, 0x2f4f8a, 0x8c9196, '相談の席に座る');
    chair(F, x, -D * 0.55 - 0.65, 0, 0x2a2a2a, 0x8c9196);
  }
  for (let r = 0; r < 3; r++) for (let x = 0.3; x < W - 0.4; x += 0.3) face(F.b, x, x + 0.24, 1.0 + r * 0.38, 1.32 + r * 0.38, -D + 0.02, F.rng.pick([0xf6f4ee, 0xf2f6ea, 0xfaf0e6]));
  F.item(W / 2, -D * 0.55 + 1.0, { kind: 'shop', label: '物件の貼り紙を見る', shop: '不動産', shopKind: 'realestate' });
};

// コインランドリー: rows of front-loading washers and stacked dryers, a folding table, a bench
K.laundry = (F, D, H, door) => {
  const W = F.W;
  for (let x = 0.3; x < W - 0.8; x += 0.75) {
    for (const [y0, dr] of [[0, false], [0.95, true]]) {
      box(F.b, x, y0, -D + 0.02, x + 0.7, y0 + 0.9, -D + 0.72, dr ? 0xe8eef2 : 0xf6f6f4);
      F.b.push(new THREE.Matrix4().makeTranslation(x + 0.35, y0 + 0.45, -D + 0.73).multiply(new THREE.Matrix4().makeRotationX(PI / 2)));
      F.b.cyl(0, 0, 0, 0.24, 0.24, 0.02, 18, 0x9aa0a6, 0, { top: 0x3a4a5a });
      F.b.pop();
      box(F.eb, x + 0.5, y0 + 0.78, -D + 0.72, x + 0.62, y0 + 0.84, -D + 0.73, 0x9fe0a0);
    }
  }
  F.solid(0.3, -D, W - 0.3, -D + 0.72, 1.85);
  table(F, W / 2, -D * 0.45, 1.6, 0.6, 0.85, 0xf2f2ee, 0x8c9196);
  box(F.b, 0.3, 0.42, -1.2, 1.8, 0.47, -0.8, 0x3a6ab0);
  F.solid(0.3, -1.2, 1.8, -0.8, 0.47);
  F.seat(1.05, -1.0, 0.47, 0, 1, '乾燥機を待つ');
  F.item(W / 2, -D + 1.3, { kind: 'shop', label: '洗濯機を回す', shop: 'コインランドリー', shopKind: 'laundry' });
};

// お茶屋: tea canisters in rows on wooden shelves, a tea-tasting counter with a kettle
K.tea = (F, D, H, door) => {
  const W = F.W;
  wallShelves(F, 0.3, W - 0.3, -D + 0.35, 1.9, 0.3, (bb, rng, x0, x1, yb, yt, zb, zf) => {
    for (let x = x0 + 0.08; x < x1 - 0.06; x += 0.15) bb.cyl(x, yb, (zb + zf) / 2, 0.055, 0.055, Math.min(yt - yb - 0.03, 0.17), 12, hex(rng.pick(['#2f5a3a', '#c8a46a', '#8a2a2a', '#2a2a2a', '#d8c8a0'])), 0, { top: 0xc8ccd0 });
  }, { color: 0x6a4a32, shelves: 5 });
  F.solid(0.3, -D, W - 0.3, -D + 0.35, 1.9);
  counter(F, W * 0.2, W * 0.8, -D * 0.5 - 0.3, -D * 0.5 + 0.25, 0.95, 0x5a3a2a, 0xc8a46a);
  F.b.cyl(W * 0.4, 0.95, -D * 0.5, 0.11, 0.1, 0.13, 12, 0x2a2a2a, 0, { top: 0x3a3a3a });
  for (let k = 0; k < 4; k++) F.b.cyl(W * 0.5 + k * 0.12, 0.95, -D * 0.5, 0.035, 0.03, 0.06, 10, 0xf2efe6);
  for (const x of [W * 0.35, W * 0.65]) stool(F, x, -D * 0.5 + 0.7, 0.66, 0x6a4a32, '試飲の席に座る', 0, -1);
  F.item(W / 2, -D * 0.5 + 1.0, { kind: 'shop', label: '新茶を試飲する', shop: 'お茶屋', shopKind: 'tea' });
};

// 居酒屋: a wooden counter with stools, sake bottles behind, paper lanterns, a table seat
K.izakaya = (F, D, H, door) => {
  const W = F.W;
  const kz = -D + 1.3;
  counter(F, 0.3, W - 0.3, kz, kz + 0.5, 1.0, 0x5a3a2a, 0x8a6a4c);
  for (let x = 0.7; x < W - 0.5; x += 0.65) stool(F, x, kz + 0.95, 0.7, 0x3a2a1f, 'カウンターに座る', 0, -1);
  for (let x = 0.5; x < W - 0.4; x += 0.12) {
    F.b.cyl(x, 1.4, -D + 0.18, 0.045, 0.045, 0.28, 10, hex(F.rng.pick(['#2f4a2a', '#4a2a1a', '#d8d8d0'])));
    F.b.cyl(x, 1.68, -D + 0.18, 0.045, 0.016, 0.08, 10, 0x2f4a2a);
  }
  box(F.b, 0.3, 1.38, -D + 0.02, W - 0.3, 1.4, -D + 0.32, 0x5a3a2a);
  for (const x of [W * 0.25, W * 0.5, W * 0.75]) { F.b.cyl(x, H - 0.6, -D * 0.4, 0.002, 0.002, 0.6, 3, 0x2a2a2a); ball(F.eb, x, H - 0.75, -D * 0.4, 0.15, 0xff9a6a, 1.3); }
  menuStrips(F, 'izakaya-menu', ['刺身盛り', '焼き鳥', 'だし巻き', '枝豆', '地酒'], 0.4, W - 0.4, H - 0.05, -D + 0.02, '#f6e7c0', '#3a2a1f');
  F.item(W / 2, kz + 1.4, { kind: 'shop', label: 'おすすめを聞く', shop: '居酒屋', shopKind: 'izakaya' });
};

// スマホ修理: a counter with repair mats and screens, phone cases on a pegboard
K.phone = (F, D, H, door) => {
  const W = F.W;
  box(F.b, 0.3, 0.5, -D + 0.02, W - 0.3, 2.0, -D + 0.05, 0xe8e8e2, { pattern: PAT.LATTICE });
  for (let r = 0; r < 4; r++) for (let x = 0.45; x < W - 0.45; x += 0.2) {
    box(F.b, x - 0.005, 0.7 + r * 0.35, -D + 0.05, x + 0.005, 0.71 + r * 0.35, -D + 0.12, 0x8c9196);
    box(F.b, x - 0.04, 0.55 + r * 0.35, -D + 0.1, x + 0.04, 0.7 + r * 0.35, -D + 0.12, hex(F.rng.pick(['#f6c0d0', '#2a2a2a', '#9fc0d8', '#f4f0e6', '#e8432e', '#c8a46a'])));
  }
  counter(F, 0.5, W - 0.5, -D * 0.5 - 0.3, -D * 0.5 + 0.25, 0.95, 0xf2f2ee, 0x3a6a4a, PAT.NONE);
  for (let k = 0; k < 3; k++) box(F.b, 0.9 + k * 0.6, 0.95, -D * 0.5 - 0.1, 0.98 + k * 0.6, 0.957, -D * 0.5 + 0.05, 0x1a1a1a);
  for (const x of [W * 0.35, W * 0.65]) stool(F, x, -D * 0.5 + 0.7, 0.66, 0x2a2a2a, '受付で待つ', 0, -1);
  F.item(W / 2, -D * 0.5 + 1.0, { kind: 'shop', label: '画面割れを相談する', shop: 'スマホ修理', shopKind: 'phone' });
};

// the mall's big bookstore: bookcases in aisles as well as on the walls
K.bigbooks = (F, D, H, door) => {
  const W = F.W;
  wallShelves(F, 0.15, W - 0.15, -D + 0.35, 2.2, 0.33, bookFill({ label: false }), { color: 0x8a6a4c, bay: 0.9 });
  F.solid(0.15, -D, W - 0.15, -D + 0.35, 2.2);
  for (const x of [W * 0.3, W * 0.7]) {
    if (Math.abs(x - door) < 0.45) continue;
    sub(F, x - 0.25, -1.3, PI / 2, () => shelving(F.b, F.rng, D - 2.4, 1.5, 0.25, { color: 0x8a6a4c, bay: 0.8, fill: bookFill({ paperbacks: true }) }));
    sub(F, x + 0.25, -D + 1.1, -PI / 2, () => shelving(F.b, F.rng, D - 2.4, 1.5, 0.25, { color: 0x8a6a4c, bay: 0.8, fill: bookFill({}) }));
    F.solid(x - 0.27, -D + 1.1, x + 0.27, -1.3, 1.5);
  }
  F.item(W / 2, -D * 0.5, { kind: 'mallshop', label: '本棚の間を歩く', shop: '書店', sub: '文庫・新書' });
};

// a drugstore (brighter than the street's pharmacy, and shallow): a wall of medicine and
// toiletries, a low gondola across the floor, baskets by the door, a register with a pharmacist
K.drug = (F, D, H, door) => {
  const W = F.W;
  wallShelves(F, 0.2, W - 0.2, -D + 0.38, 2.0, 0.36, goodsFill(['daily', 'daily', 'sweets', 'daily', 'drinks']), { color: 0xffffff, shelves: 5, lip: 0.03, lipColor: 0x2e8a4a });
  F.solid(0.2, -D, W - 0.2, -D + 0.38, 2.0);
  // a low two-sided gondola parallel to the front, leaving the door aisle clear
  const g0 = door > W / 2 ? 0.5 : door + 1.0, g1 = door > W / 2 ? door - 1.0 : W - 0.5;
  if (g1 - g0 > 0.8) {
    sub(F, g0, -D * 0.5 - 0.02, 0, () => shelving(F.b, F.rng, g1 - g0, 1.2, 0.28, { color: 0xffffff, shelves: 3, plinth: 0.1, lip: 0.025, lipColor: 0xffe14a, fill: goodsFill(['daily', 'sweets', 'daily']) }));
    sub(F, g1, -D * 0.5 + 0.02, PI, () => shelving(F.b, F.rng, g1 - g0, 1.2, 0.28, { color: 0xffffff, shelves: 3, plinth: 0.1, lip: 0.025, lipColor: 0xffe14a, fill: goodsFill(['daily', 'daily', 'sweets']) }));
    F.solid(g0, -D * 0.5 - 0.3, g1, -D * 0.5 + 0.3, 1.2);
  }
  // red baskets stacked by the door, a register with a green cross sign
  for (let k = 0; k < 5; k++) box(F.b, door + 0.95 * (door > W / 2 ? -1 : 1) - 0.18, k * 0.06, -0.75, door + 0.95 * (door > W / 2 ? -1 : 1) + 0.18, k * 0.06 + 0.2, -0.45, 0xd8342a);
  const cx = door > W / 2 ? 0.3 : W - 1.5;
  counter(F, cx, cx + 1.2, -1.3, -0.85, 0.95, 0xffffff, 0xe8f4ea, PAT.NONE);
  register(F, cx + 0.6, -1.07, 0.95, PI);
  box(F.b, cx + 0.45, 2.1, -D + 0.39, cx + 0.75, 2.4, -D + 0.42, 0x2e8a4a);
  F.item(W / 2, -D * 0.5 + 0.7, { kind: 'shop', label: 'のど飴を探す', shop: 'ドラッグストア', shopKind: 'drug' });
};

// floor, wall and light finishes per kind: [floor colour, floor pattern, wall colour, light colour]
const P = PAT;
export const SHOP_STYLE = {
  wagashi: [0xb89a74, P.PLANKS, 0xf2e8d4, 0xfff1d6], cafe: [0x6a4a32, P.PLANKS, 0xe8dcc4, 0xffe2b0], yorozuya: [0xa8a49a, P.CONCRETE, 0xe8e2d4, 0xffffff],
  bakery: [0xc8a070, P.PLANKS, 0xf6ead0, 0xffe8c0], florist: [0x9a9890, P.CONCRETE, 0xeef2e8, 0xffffff], fish: [0x8a9aa0, P.TILE, 0xe8f0f2, 0xf0f8ff],
  books: [0x8a6a4c, P.PLANKS, 0xeee4d0, 0xfff1d6], grocer: [0x9a968c, P.CONCRETE, 0xf0ead8, 0xffffff], ramen: [0x5a4a3e, P.TILE, 0xe8d8b8, 0xffe2b0],
  dagashi: [0x9a8a6a, P.PLANKS, 0xe8dcc0, 0xfff1d6], barber: [0xe0dcd4, P.TILE, 0xf2f4f6, 0xffffff], cleaning: [0xd8dcdc, P.TILE, 0xf4f8fa, 0xf0f8ff],
  liquor: [0x7a6a5a, P.PLANKS, 0xe8dcc8, 0xffe8c0], pharmacy: [0xe6e8e4, P.TILE, 0xf6f8f4, 0xf0f8ff], watch: [0x5a4a3a, P.PLANKS, 0xe8e0d0, 0xfff1d6],
  tofu: [0xa8aca8, P.CONCRETE, 0xf2f2ee, 0xffffff], stationery: [0xd8c8a8, P.PLANKS, 0xf6f2ea, 0xffffff],
  fashion: [0xe8e0d8, P.PLANKS, 0xf8f0f2, 0xfff4ea], zakka: [0xb08a5a, P.PLANKS, 0xf3ead6, 0xffe8c0], sports: [0x5a6068, P.CONCRETE, 0xe4ecf2, 0xffffff],
  shoes: [0x8a7a6a, P.PLANKS, 0xf2f2ee, 0xffffff], eyewear: [0xeceeee, P.TILE, 0xffffff, 0xf0f8ff], toys: [0x9fc8e8, P.TILE, 0xfff6d8, 0xffffff],
  electronics: [0xc8ccd0, P.TILE, 0xeef0f2, 0xf0f8ff], accessory: [0xe8d8d8, P.TILE, 0xfbeef2, 0xfff1e6], kitchen: [0xc8b090, P.PLANKS, 0xfff6e0, 0xffe8c0],
  music: [0x2a2c30, P.TILE, 0x3a4250, 0xd8e8ff], pet: [0xd8e0c0, P.TILE, 0xfff8e8, 0xffffff], bags: [0x9a7a5a, P.PLANKS, 0xe8dcc8, 0xffe8c0],
  cosmetics: [0xf6f0f2, P.TILE, 0xffffff, 0xfff4f8], games: [0x2a1f4a, P.TILE, 0x3a2a5a, 0xffd0f0], craft: [0xc8a46a, P.PLANKS, 0xf6efe0, 0xfff1d6],
  bigbooks: [0x8a6a4c, P.PLANKS, 0xf2ead8, 0xfff1d6], drug: [0xeceeea, P.TILE, 0xffffff, 0xf0fff4],
  gyudon: [0x8a7a6a, P.TILE, 0xf6ead8, 0xffffff], crepe: [0xf6e0e8, P.TILE, 0xfff4f8, 0xfff1e6], zakka100: [0xe0e0dc, P.TILE, 0xfffbe8, 0xffffff],
  cake: [0xf2e8e0, P.TILE, 0xfff6f0, 0xfff1e6], washoku: [0x6a5a4a, P.STONE, 0xe8dcc0, 0xffe2b0], yakiniku: [0x3a3030, P.TILE, 0x5a4038, 0xffd8a8],
  realestate: [0xc8ccd0, P.TILE, 0xf6f8fa, 0xffffff], laundry: [0xdfe6ea, P.TILE, 0xeef6fb, 0xf0f8ff], tea: [0x7a6a52, P.PLANKS, 0xe8dcc0, 0xfff1d6],
  izakaya: [0x4a3a2e, P.PLANKS, 0xd8c8a8, 0xffc890], phone: [0xd8dce0, P.TILE, 0xf4f6f8, 0xffffff],
};

// A walk-in shop's contents: floor finish, painted walls and a lit ceiling inside the unit's
// shell (the caller builds the shell, glass and colliders), then the kind's own fittings.
// D is the depth from the front wall to the back wall, H the ceiling height.
export function fitOut(ctx, kind, axis, c, a0, a1, dir, y, { D, H = 3.0, door, v = 0, seed = 1, ceiling = true, walls = 'all', floor: floorOn = true }) {
  const [floor, floorPat, wall, light] = SHOP_STYLE[kind];
  const solids = SOLIDS.on;
  shopFrame(ctx, axis, c, a0, a1, dir, y, seed, (F) => {
    F.kind = kind;
    const W = F.W;
    // the room counts as a solid body for the leaf fitter, so a street tree's crown poking
    // through the outside wall never shows up among the shelves
    if (solids) {
      const [cx, cz] = F.toW(W / 2, -D / 2), [ox, oz] = F.toW(0, 0), [ex, ez] = F.toW(W >= D ? 1 : 0, W >= D ? 0 : 1);
      SOLIDS.list.push({ cx, cz, ux: ex - ox, uz: ez - oz, L: Math.max(W, D) / 2, T: Math.min(W, D) / 2, y0: y, y1: y + H });
    }
    if (floorOn) F.b.quad(V(0, 0.012, 0), V(W, 0.012, 0), V(W, 0.012, -D), V(0, 0.012, -D), floor, floorPat);
    if (walls !== 'none') {
      face(F.b, 0, W, 0, H, -D + 0.006, wall);
      sub(F, 0.006, 0, PI / 2, () => face(F.b, 0, D, 0, H, 0, wall));
      sub(F, W - 0.006, -D, -PI / 2, () => face(F.b, 0, D, 0, H, 0, wall));
    }
    if (ceiling) F.b.quad(V(0, H, -D), V(W, H, -D), V(W, H, 0), V(0, H, 0), 0xf6f4ee, 0);
    lights(F, D, H, D > 4.5 ? 3 : 2, light);
    K[kind](F, D, H, door, v);
  });
}

// Steps up to a shop door from the pavement when the floor sits well above it (sloping lots).
// L: lotFrame; the door is centred at local x lx, the floor starts at local z lzF (the street
// is toward -z), floor height yTop, w wide. World space: call outside any kit transform.
export function entrySteps(ctx, L, lx, lzF, w, yTop, color = 0xb9b2a4) {
  const g = ctx.colliders.groundAt(...L.toW(lx, lzF - 0.6));
  const rise = yTop - g;
  if (rise < 0.3) return;
  const n = Math.ceil(rise / 0.17), h = rise / n, run = 0.3;
  const [mx, mz] = L.toW(lx, lzF);
  const b = ctx.builders.get('toon', mx, mz);
  for (let k = 1; k < n; k++) {
    const [x0, z0, x1, z1] = L.rectW(lx - w / 2, lzF - k * run, lx + w / 2, lzF - (k - 1) * run);
    b.boxMM(x0, g - 0.3, z0, x1, yTop - k * h, z1, { color, pattern: PAT.STONE });
  }
  const c = Math.cos(L.ry), sn = Math.sin(L.ry);
  const [x0, z0, x1, z1] = L.rectW(lx - w / 2, lzF - (n - 1) * run, lx + w / 2, lzF);
  ctx.colliders.addSurface(x0, z0, x1, z1, (x, z) => {
    const lz = (x - L.ox) * sn + (z - L.oz) * c;
    const k = Math.min(n - 1, Math.max(1, Math.ceil((lzF - lz) / run)));
    return yTop - k * h;
  }, 2);
}

export const SHOP_KINDS = K;
export { box, ball, dome, sub, counter, register, table, chair, stool, plant, lights, pendants, wallShelves, sideShelves, bookFill, goodsFill, rack, mannequin, showcase, poster, textBoard, menuStrips, crate, tiers, glassZ, glassX, glassTop, board, bucket, breadTray };
