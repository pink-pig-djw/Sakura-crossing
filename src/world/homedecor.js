import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { PAT, SOLIDS } from '../core/builder.js';
import { RNG } from '../core/rng.js';
import { FONTS, fitText } from '../render/atlas.js';
import { books, shelving } from './furnish.js';
import { shrub, GARDEN_FLOWERS } from './greenery.js';

// The inside of 桜井家 (world/home.js): every room furnished, piece by piece. Furniture is
// built on the 'propsHome' batches (the house's own light, see systems/home.js), pictures and
// labels on 'homeSign'. Pieces are authored in a local frame (x along the piece, y up from the
// floor, its front looking down +z) and set in place with `put`.
//
// Also the spots she uses (ctx.interactables, kind 'home'): the bed, the desk, the wardrobe,
// the sofa, the tea things in the kitchen, the cushion in the 和室, the balcony rail, the
// front door from either side. systems/home.js plays out what she does at each.

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const PB = (ctx, x, z) => ctx.builders.get('propsHome', x, z);
const SB = (ctx, x, z) => ctx.builders.get('homeSign', x, z);

// set a piece at (x, y, z), its front turned to face `face` ('N' -z, 'S' +z, 'E' +x, 'W' -x)
const FACE = { S: 0, E: Math.PI / 2, N: Math.PI, W: -Math.PI / 2 };
function put(ctx, x, y, z, face, fn) {
  const b = PB(ctx, x, z), sb = SB(ctx, x, z);
  const ry = typeof face === 'number' ? face : FACE[face];
  b.pushTRS(x, y, z, ry);
  sb.pushTRS(x, y, z, ry);
  const was = SOLIDS.on;
  SOLIDS.on = false;
  try {
    fn(b, sb);
  } finally {
    SOLIDS.on = was;
    b.pop();
    sb.pop();
  }
}

// soft shapes: a rounded box (cushions, the mattress, the sofa) between two corners
const _rb = new Map();
function soft(b, x0, y0, z0, x1, y1, z1, color, r = 0.03, o = {}) {
  const w = Math.abs(x1 - x0), h = Math.abs(y1 - y0), d = Math.abs(z1 - z0);
  const rr = Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001);
  const key = `${w.toFixed(3)}|${h.toFixed(3)}|${d.toFixed(3)}|${rr.toFixed(3)}`;
  let g = _rb.get(key);
  if (!g) {
    g = new RoundedBoxGeometry(w, h, d, 2, Math.max(0.002, rr));
    _rb.set(key, g);
  }
  const m = new THREE.Matrix4().makeTranslation((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  if (o.rx || o.rz) m.multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(o.rx || 0, 0, o.rz || 0)));
  b.geom(g, m, color, o.pattern ?? 0);
}
// a turned shape (vases, cups, pots, lamp shades): profile [[r, y]...] round the y axis
function lathe(b, x, y, z, prof, color, segs = 14, o = {}) {
  const g = new THREE.LatheGeometry(prof.map(([r, h]) => new THREE.Vector2(r, h)), segs);
  const m = new THREE.Matrix4().makeTranslation(x, y, z);
  if (o.s) m.multiply(new THREE.Matrix4().makeScale(o.s[0], o.s[1], o.s[2]));
  b.geom(g, m, color, 0);
}
const box = (b, x0, y0, z0, x1, y1, z1, color, o = {}) => b.boxMM(x0, y0, z0, x1, y1, z1, { color, ...o });
// a picture (atlas rect) on a quad facing +z
function pic(sb, x0, x1, y0, y1, z, uv, em = 0) {
  sb.quad(V(x0, y0, z), V(x1, y0, z), V(x1, y1, z), V(x0, y1, z), 0xffffff, em, { uvs: [[uv.u0, uv.v0], [uv.u1, uv.v0], [uv.u1, uv.v1], [uv.u0, uv.v1]] });
}
// keep walkers out (low furniture blocks too: its collider stands taller than it is)
function block(ctx, x0, z0, x1, z1, y, h = 0.7) {
  return ctx.colliders.addBox((x0 + x1) / 2, (z0 + z1) / 2, Math.abs(x1 - x0) / 2, Math.abs(z1 - z0) / 2, 0, y + Math.max(h, 0.62), y - 0.4);
}
// a spot she can use
function spot(ctx, what, label, x, z, y, r, o = {}) {
  const it = { kind: 'home', what, label, x, z, y, r, ...o };
  ctx.interactables.push(it);
  return it;
}

// ---------------------------------------------------------------------------- pictures
function art(ctx) {
  const A = ctx.atlas2;
  const P = {};
  // the hanging scroll in the 和室: a branch of cherry in ink and pink over a pale moon
  P.scroll = A.draw('home:scroll', 96, 256, (c, w, h) => {
    c.fillStyle = '#efe6d2';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#c9b48a';
    c.fillRect(0, 0, w, 26);
    c.fillRect(0, h - 30, w, 30);
    c.fillStyle = '#f6efe0';
    c.beginPath();
    c.arc(w * 0.62, h * 0.32, 22, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = '#3b332c';
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(w * 0.15, h * 0.2);
    c.quadraticCurveTo(w * 0.45, h * 0.4, w * 0.4, h * 0.75);
    c.stroke();
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(w * 0.32, h * 0.36);
    c.quadraticCurveTo(w * 0.55, h * 0.45, w * 0.78, h * 0.5);
    c.stroke();
    for (const [x, y] of [[0.22, 0.24], [0.36, 0.34], [0.5, 0.42], [0.66, 0.47], [0.75, 0.52], [0.42, 0.55], [0.4, 0.66]]) {
      c.fillStyle = '#f2a8b8';
      c.beginPath();
      c.arc(w * x, h * y, 5, 0, Math.PI * 2);
      c.fill();
    }
    c.fillStyle = '#b8342c';
    c.fillRect(w * 0.7, h * 0.72, 12, 12);
  });
  // a small framed print by the door (a train crossing under cherry trees)
  P.print = A.draw('home:print', 128, 96, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#9fd2ee');
    g.addColorStop(1, '#f4ead8');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#7bb3d6';
    c.fillRect(0, h * 0.62, w, h * 0.1);
    c.fillStyle = '#f3b4c4';
    for (let i = 0; i < 9; i++) {
      c.beginPath();
      c.arc(10 + i * 14, h * 0.32 + (i % 2) * 6, 12, 0, Math.PI * 2);
      c.fill();
    }
    c.fillStyle = '#e9e6dc';
    c.fillRect(w * 0.12, h * 0.48, w * 0.6, h * 0.14);
    c.fillStyle = '#4f7fbf';
    c.fillRect(w * 0.12, h * 0.56, w * 0.6, h * 0.03);
    c.strokeStyle = '#ffffff';
    c.lineWidth = 6;
    c.strokeRect(0, 0, w, h);
  });
  // photos on her cork board and in frames (sea, shrine, friends' silhouettes, a cat)
  P.photos = A.draw('home:photos', 256, 64, (c, w, h) => {
    const cols = [['#8cc8e8', '#f0e2c0'], ['#e9a0b0', '#f8e8ea'], ['#a0c890', '#f4f0d0'], ['#c8a0d8', '#f3eaf6']];
    for (let i = 0; i < 4; i++) {
      const x = i * 64;
      c.fillStyle = '#fbfaf6';
      c.fillRect(x, 0, 64, 64);
      const g = c.createLinearGradient(0, 4, 0, 52);
      g.addColorStop(0, cols[i][0]);
      g.addColorStop(1, cols[i][1]);
      c.fillStyle = g;
      c.fillRect(x + 5, 5, 54, 46);
      c.fillStyle = 'rgba(60,50,60,0.75)';
      if (i === 0) {
        c.fillRect(x + 5, 36, 54, 15);
      } else if (i === 1) {
        c.beginPath();
        c.arc(x + 24, 30, 8, 0, Math.PI * 2);
        c.arc(x + 42, 32, 7, 0, Math.PI * 2);
        c.fill();
      } else if (i === 2) {
        c.beginPath();
        c.ellipse(x + 32, 40, 12, 7, 0, 0, Math.PI * 2);
        c.fill();
        c.beginPath();
        c.moveTo(x + 22, 36);
        c.lineTo(x + 24, 28);
        c.lineTo(x + 28, 34);
        c.fill();
      } else {
        c.fillRect(x + 28, 14, 6, 37);
        c.fillRect(x + 20, 14, 22, 4);
      }
    }
  });
  // her room's poster: a star map in pastel
  P.poster = A.draw('home:poster', 96, 128, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#2c3a6e');
    g.addColorStop(1, '#8a6aa8');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#fff6d8';
    const r = new RNG(77);
    for (let i = 0; i < 40; i++) c.fillRect(r.range(4, w - 4), r.range(4, h * 0.75), r.chance(0.2) ? 2 : 1, r.chance(0.2) ? 2 : 1);
    c.strokeStyle = 'rgba(255,240,200,0.6)';
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(20, 30);
    c.lineTo(40, 22);
    c.lineTo(58, 38);
    c.lineTo(74, 30);
    c.stroke();
    c.fillStyle = '#fbe7f0';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    fitText(c, 'ほしぞら', w * 0.8, 14, FONTS.maru, '700');
    c.fillText('ほしぞら', w / 2, h * 0.88);
  });
  // a calendar (this month) and a clock face
  P.calendar = A.draw('home:calendar', 96, 128, (c, w, h) => {
    c.fillStyle = '#fbfaf6';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#f2b6c2';
    c.fillRect(0, 0, w, h * 0.42);
    c.fillStyle = '#fff';
    c.beginPath();
    c.arc(w * 0.5, h * 0.2, 12, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#6a6a72';
    for (let r = 0; r < 5; r++) for (let k = 0; k < 7; k++) c.fillRect(8 + k * 12, h * 0.5 + r * 12, 7, 6);
    c.fillStyle = '#e05a6a';
    c.fillRect(8 + 3 * 12, h * 0.5 + 2 * 12, 7, 6);
  });
  P.clock = A.draw('home:clock', 64, 64, (c, w, h) => {
    c.fillStyle = '#fbfaf6';
    c.beginPath();
    c.arc(w / 2, h / 2, w / 2 - 1, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#4a4440';
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      c.fillRect(w / 2 + Math.sin(a) * 25 - 1, h / 2 - Math.cos(a) * 25 - 1, 2.5, 2.5);
    }
    c.strokeStyle = '#4a4440';
    c.lineWidth = 2.5;
    c.beginPath();
    c.moveTo(w / 2, h / 2);
    c.lineTo(w / 2 + 10, h / 2 - 9);
    c.moveTo(w / 2, h / 2);
    c.lineTo(w / 2 - 3, h / 2 - 20);
    c.stroke();
  });
  // fusuma paper (pale waves) and the wallpaper of her room's accent wall (small flowers)
  P.fusuma = A.draw('home:fusuma', 64, 128, (c, w, h) => {
    c.fillStyle = '#f2ead6';
    c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(160,180,170,0.55)';
    c.lineWidth = 1.5;
    for (let y = 12; y < h; y += 16) {
      c.beginPath();
      for (let x = 0; x <= w; x += 4) c.lineTo(x, y + Math.sin(x / 7 + y) * 3);
      c.stroke();
    }
  });
  P.notes = A.draw('home:notes', 64, 64, (c, w, h) => {
    c.fillStyle = '#c69c6d';
    c.fillRect(0, 0, w, h);
    const r = new RNG(5);
    for (let i = 0; i < 140; i++) {
      c.fillStyle = r.chance(0.5) ? '#b88c5d' : '#d4ab7c';
      c.fillRect(r.range(0, w), r.range(0, h), 2, 2);
    }
    for (const [x, y, col] of [[6, 8, '#fff6a8'], [34, 30, '#bfe8f0'], [10, 38, '#f8c8d8']]) {
      c.fillStyle = col;
      c.fillRect(x, y, 20, 18);
      c.fillStyle = '#9a8a80';
      c.fillRect(x + 3, y + 6, 13, 1.5);
      c.fillRect(x + 3, y + 10, 10, 1.5);
    }
  });
  return P;
}

// ---------------------------------------------------------------------------- pieces
// a ceiling light: a flush round shade, glowing at night
function ceilingLight(ctx, x, y, z, r = 0.24) {
  const b = PB(ctx, x, z);
  b.cyl(x, y - 0.035, z, r, r * 0.96, 0.035, 18, 0xf6f4ee);
  ctx.builders.get('emissive', x, z).cyl(x, y - 0.04, z, r * 0.82, r * 0.82, 0.004, 18, 0xfff6e4, 0, { caps: true });
}

// a wall clock / switch / art on a wall: quads facing +z in the local frame of `put`
function frame(b, sb, x0, x1, y0, y1, uv, color = 0x8a6a4a, depth = 0.025) {
  box(b, x0 - 0.02, y0 - 0.02, 0, x1 + 0.02, y1 + 0.02, depth, color);
  pic(sb, x0, x1, y0, y1, depth + 0.001, uv);
}

// slippers (a pair), toes pointing down +z
function slippers(b, x, z, color) {
  for (const s of [-1, 1]) {
    soft(b, x + s * 0.06 - 0.045, 0, z - 0.13, x + s * 0.06 + 0.045, 0.025, z + 0.13, 0xf3efe6, 0.012);
    soft(b, x + s * 0.06 - 0.047, 0.015, z + 0.0, x + s * 0.06 + 0.047, 0.055, z + 0.12, color, 0.02);
  }
}
// sneakers (a pair), toes down +z
function sneakers(b, x, z, color) {
  for (const s of [-1, 1]) {
    soft(b, x + s * 0.065 - 0.045, 0, z - 0.12, x + s * 0.065 + 0.045, 0.03, z + 0.13, 0xf2f2ee, 0.012);
    soft(b, x + s * 0.065 - 0.043, 0.02, z - 0.11, x + s * 0.065 + 0.043, 0.085, z + 0.08, color, 0.03);
    box(b, x + s * 0.065 - 0.02, 0.07, z - 0.02, x + s * 0.065 + 0.02, 0.09, z + 0.05, 0xf8f8f4);
  }
}

// the shoes she has on with each outfit, as a pair left in the entrance (local: toes down +z,
// on the floor at 0): canvas high-tops, penny loafers, basketball shoes, ankle boots
export const SHOE_KIND = ['canvas', 'canvas', 'loafer', 'basket', 'boots'];
export function shoePair(b, kind) {
  for (const s of [-1, 1]) {
    const x = s * 0.06;
    if (kind === 'loafer') {
      box(b, x - 0.034, 0, -0.118, x + 0.034, 0.028, -0.07, 0x3e2b20);
      soft(b, x - 0.041, 0.0, -0.115, x + 0.041, 0.022, 0.12, 0x4a3426, 0.01);
      soft(b, x - 0.04, 0.016, -0.11, x + 0.04, 0.066, 0.116, 0xa97a52, 0.03);
      box(b, x - 0.027, 0.061, -0.098, x + 0.027, 0.0675, 0.005, 0x3a2a20);
      box(b, x - 0.0405, 0.052, 0.02, x + 0.0405, 0.066, 0.05, 0x8f6440);
      box(b, x - 0.012, 0.064, 0.03, x + 0.012, 0.0675, 0.04, 0x2e2018);
    } else if (kind === 'boots') {
      box(b, x - 0.03, 0, -0.118, x + 0.03, 0.045, -0.068, 0xc89a62);
      soft(b, x - 0.04, 0.0, -0.06, x + 0.04, 0.02, 0.122, 0x1c1a1c, 0.008);
      soft(b, x - 0.04, 0.018, -0.112, x + 0.04, 0.072, 0.12, 0x232025, 0.03);
      soft(b, x - 0.039, 0.03, -0.116, x + 0.039, 0.2, -0.018, 0x232025, 0.03);
      box(b, x - 0.0395, 0.188, -0.117, x + 0.0395, 0.198, -0.017, 0xd8b45a);
      box(b, x - 0.026, 0.195, -0.1, x + 0.026, 0.201, -0.035, 0x141214);
    } else {
      const basket = kind === 'basket';
      const upper = basket ? 0xf4f2ee : 0x1f1f24, accent = basket ? 0xc8282e : 0xf6f4ee, lace = basket ? 0x1f1f24 : 0xf6f4ee;
      soft(b, x - 0.044, 0.0, -0.12, x + 0.044, 0.026, 0.126, 0xf6f4ee, 0.01);
      soft(b, x - 0.042, 0.02, -0.114, x + 0.042, 0.078, 0.104, upper, 0.032);
      soft(b, x - 0.041, 0.022, -0.116, x + 0.041, 0.13, -0.022, upper, 0.032);
      if (basket) {
        soft(b, x - 0.0435, 0.03, -0.1, x + 0.0435, 0.085, -0.005, accent, 0.03);
        box(b, x - 0.0412, 0.122, -0.116, x + 0.0412, 0.132, -0.024, 0x1f1f24);
      } else soft(b, x - 0.042, 0.012, 0.066, x + 0.042, 0.052, 0.127, accent, 0.02);
      box(b, x - 0.026, 0.126, -0.098, x + 0.026, 0.132, -0.04, 0x141418);
      for (let k = 0; k < 4; k++) box(b, x - 0.024, 0.078 + k * 0.012, 0.045 - k * 0.028, x + 0.024, 0.084 + k * 0.012, 0.051 - k * 0.028, lace);
    }
  }
}

// a pot plant: pot, soil, leaves (cards when the foliage pass is on, else a blob)
function plant(ctx, b, x, y, z, rng, r = 0.12, potC = 0xe8e2d6, leafC = 0x5f9a4c) {
  lathe(b, x, y, z, [[0, 0], [r * 0.75, 0], [r, r * 1.4], [r * 1.05, r * 1.5], [0, r * 1.5]], potC, 14);
  b.cyl(x, y + r * 1.32, z, r * 0.92, r * 0.92, 0.01, 12, 0x5a4632);
  const world = new THREE.Vector3(x, y, z).applyMatrix4(b.matrix);
  if (!shrub(world.x, world.y + r * 2.1, world.z, r * 1.25, r * 1.0, rng, { cards: 6, size: r * 1.8, cols: [new THREE.Color(leafC), new THREE.Color(leafC).multiplyScalar(0.85), new THREE.Color(leafC).multiplyScalar(1.12)] })) {
    b.geom(new THREE.IcosahedronGeometry(r * 1.15, 0), new THREE.Matrix4().makeTranslation(x, y + r * 2.2, z), leafC);
  }
}

// a teapot (急須): a squat body, a side handle, a spout, a lid with a knob (local, base at 0)
export function kyusu(b, x, y, z, color = 0x5d6b5a, s = 1) {
  lathe(b, x, y, z, [[0, 0], [0.045 * s, 0], [0.06 * s, 0.03 * s], [0.058 * s, 0.06 * s], [0.04 * s, 0.075 * s], [0, 0.075 * s]], color, 14);
  b.cyl(x, y + 0.075 * s, z, 0.032 * s, 0.03 * s, 0.008 * s, 12, color);
  b.cyl(x, y + 0.083 * s, z, 0.008 * s, 0.006 * s, 0.012 * s, 8, color);
  b.rod(V(x + 0.05 * s, y + 0.03 * s, z), V(x + 0.1 * s, y + 0.065 * s, z), 0.009 * s, 0.005 * s, 6, color);
  b.rod(V(x, y + 0.04 * s, z - 0.05 * s), V(x, y + 0.045 * s, z - 0.12 * s), 0.012 * s, 0.01 * s, 8, color);
}
// a teacup (湯呑み), base at 0
export function yunomi(b, x, y, z, color = 0xe9e3d6, s = 1) {
  lathe(b, x, y, z, [[0, 0.002], [0.026 * s, 0], [0.03 * s, 0.01 * s], [0.034 * s, 0.075 * s], [0.03 * s, 0.075 * s], [0.026 * s, 0.012 * s], [0, 0.012 * s]], color, 14);
}

// ---------------------------------------------------------------------------- the rooms
function entrance(ctx, H, P) {
  const y = H.doma, F1 = H.f1;
  // the shoe cabinet (下駄箱) along the north wall, standing on the 土間
  put(ctx, 39.94, y, H.zi0 + 0.18, 'S', (b, sb) => {
    const w = 1.04, d = 0.36, h = 0.9;
    box(b, -w / 2, 0, -d / 2, w / 2, 0.07, d / 2 - 0.02, 0x8a7a68);
    box(b, -w / 2, 0.07, -d / 2, w / 2, h - 0.03, d / 2, 0xf1ece2);
    for (const s of [-1, 1]) {
      box(b, s > 0 ? 0.004 : -w / 2 + 0.01, 0.09, d / 2, s > 0 ? w / 2 - 0.01 : -0.004, h - 0.05, d / 2 + 0.012, 0xf6f2ea);
      box(b, s * 0.05 - 0.008, 0.36, d / 2 + 0.012, s * 0.05 + 0.008, 0.6, d / 2 + 0.03, 0xb39672);
      for (let k = 1; k < 4; k++) box(b, s > 0 ? 0.004 + k * 0.12 : -0.004 - k * 0.12, 0.09, d / 2 + 0.012, (s > 0 ? 0.004 + k * 0.12 : -0.004 - k * 0.12) + 0.004, h - 0.05, d / 2 + 0.014, 0xe2dcd0);
    }
    box(b, -w / 2 - 0.01, h - 0.03, -d / 2, w / 2 + 0.01, h, d / 2 + 0.02, 0xa07a54, { pattern: PAT.PLANKS });
    // on top: a vase of flowers, a tray for keys, a little frog (お守り: "come home safe")
    lathe(b, -0.33, h, 0.0, [[0, 0], [0.04, 0], [0.05, 0.06], [0.03, 0.14], [0.035, 0.17], [0, 0.17]], 0x5f7fa0, 12);
    for (const [dx, dz, c] of [[0.0, 0.0, 0xf6c3cf], [0.03, 0.02, 0xffffff], [-0.03, 0.01, 0xf9e07a]]) {
      b.rod(V(-0.33 + dx * 0.3, h + 0.16, dz * 0.3), V(-0.33 + dx, h + 0.3, dz), 0.003, 0.003, 4, 0x5f8a48);
      b.box(-0.33 + dx, h + 0.31, dz, 0.035, 0.03, 0.035, { color: c });
    }
    box(b, 0.12, h, -0.06, 0.34, h + 0.015, 0.08, 0x9b7a58);
    box(b, 0.18, h + 0.015, -0.02, 0.24, h + 0.022, 0.03, 0xc8b070);
    soft(b, 0.38, h, -0.03, 0.46, h + 0.05, 0.04, 0x7fae5a, 0.02);
    // a print on the wall above it
    frame(b, sb, -0.2, 0.2, h + 0.35, h + 0.65, P.print, 0xf8f6f0, 0.02);
  });
  block(ctx, 39.4, H.zi0, 40.48, H.zi0 + 0.38, y, 0.9);
  // the umbrella stand by the door: a glazed pot with two umbrellas
  put(ctx, 39.6, y, H.zh - 0.32, 'E', (b) => {
    lathe(b, 0, 0, 0, [[0, 0], [0.1, 0], [0.11, 0.05], [0.1, 0.42], [0.105, 0.44], [0, 0.44]], 0x3f5f78, 16);
    b.rod(V(-0.03, 0.05, 0.01), V(-0.06, 0.88, 0.04), 0.022, 0.016, 8, 0xe58ea4);
    b.rod(V(-0.06, 0.88, 0.04), V(-0.04, 0.95, 0.07), 0.008, 0.008, 6, 0x4a3a32);
    b.rod(V(0.03, 0.05, -0.01), V(0.05, 0.92, -0.03), 0.02, 0.014, 8, 0x2e3f63);
    b.rod(V(0.05, 0.92, -0.03), V(0.06, 1.0, 0.0), 0.009, 0.009, 6, 0x6a5040);
  });
  block(ctx, 39.45, H.zh - 0.5, 39.75, H.zh - 0.15, y, 0.6);
  // her other shoes, neatly together on the 土間, and slippers waiting on the step up
  put(ctx, 40.18, y, -24.98, 'W', (b) => sneakers(b, 0, 0, 0xe8b7c0));
  put(ctx, H.xk + 0.18, F1, -25.6, 'W', (b) => slippers(b, 0, 0, 0xf2a7b5));
  // the entrance mat on the step
  put(ctx, H.xk + 0.4, F1, -25.85, 'E', (b) => soft(b, -0.45, 0, -0.28, 0.45, 0.012, 0.28, 0xb8c6a8, 0.006));
  ceilingLight(ctx, 40.1, F1 + H.ch, -25.7);
  ceilingLight(ctx, 42.9, F1 + H.ch, -25.1, 0.2);
  // the light switches by the door
  put(ctx, H.xi0 + 0.002, DOMA_SW(H), -24.85, 'E', (b) => box(b, -0.04, 0, 0, 0.04, 0.12, 0.012, 0xf6f4ee));
}
const DOMA_SW = (H) => H.f1 + 1.1;

function hall(ctx, H, P) {
  const F1 = H.f1;
  // a photo frame and a small shelf with a plant at the hall's end, by the bath's door
  put(ctx, 43.2, F1, H.zh - 0.05, 'N', (b, sb) => {
    frame(b, sb, -0.22, 0.22, 1.35, 1.6, P.photos, 0xf8f6f0, 0.02);
  });
  // the bath's door (shut): a panel on the wall at the hall's east end
  put(ctx, H.xb - 0.05, F1, -25.08, 'W', (b) => door(b, 0.72, 2.0, 0xf3eee4, 0xb39672));
  // upstairs: the store room doors (shut), a little bookcase on the landing
  put(ctx, H.xc + 0.05, H.f2, -25.08, 'E', (b) => door(b, 0.72, 2.0, 0xf3eee4, 0xb39672));
  put(ctx, H.xl - 0.05, H.f2, -26.15, 'W', (b) => door(b, 0.72, 2.0, 0xf3eee4, 0xb39672));
  put(ctx, 45.05, H.f2, H.zh - 0.05, 'N', (b) => door(b, 0.72, 2.0, 0xf3eee4, 0xb39672));
  ceilingLight(ctx, 43.3, H.f2 + H.ch, -25.1, 0.2);
  ceilingLight(ctx, 44.9, H.f2 + H.ch, -26.0, 0.2);
  ceilingLight(ctx, 42.9, H.f2 + H.ch, -26.2, 0.22);
}

// a closed door panel on a wall (local: the wall at z = 0, the door's face toward +z)
function door(b, w, h, color, knob) {
  box(b, -w / 2 - 0.06, 0, 0, w / 2 + 0.06, h + 0.06, 0.012, 0xe9e1d3);
  box(b, -w / 2, 0, 0.012, w / 2, h, 0.04, color);
  box(b, -w / 2 + 0.08, 0.2, 0.04, w / 2 - 0.08, 0.9, 0.044, 0xece6da);
  box(b, -w / 2 + 0.08, 1.05, 0.04, w / 2 - 0.08, h - 0.2, 0.044, 0xece6da);
  b.rod(V(w / 2 - 0.1, 0.98, 0.045), V(w / 2 - 0.1, 0.98, 0.09), 0.012, 0.012, 6, knob);
  b.rod(V(w / 2 - 0.1, 0.98, 0.09), V(w / 2 - 0.22, 0.98, 0.09), 0.01, 0.01, 6, knob);
}

function washitsu(ctx, H, P, rng) {
  const F1 = H.f1, x0 = H.xi0, x1 = H.xw - 0.05, z0 = H.zh + 0.05, z1 = H.zi1;
  const zt = -23.75; // the tatami start here; a strip of board floor north of them
  const b0 = PB(ctx, 40.7, -22.2);
  // the board floor strip (板の間) and the six mats (祝儀敷き: no four corners meet)
  b0.boxMM(x0, F1 - 0.03, z0, x1, F1 + 0.012, zt, { color: 0xb08a5e, pattern: PAT.PLANKS });
  const mats = [
    [39.37, -23.75, 41.19, -22.84], [41.19, -23.75, 42.1, -21.93], [39.37, -22.84, 40.28, -21.02],
    [40.28, -22.84, 41.19, -21.02], [41.19, -21.93, 42.1, -20.11], [39.37, -21.02, 41.19, -20.11],
  ];
  for (const [a0, c0, a1, c1] of mats) {
    const alongX = a1 - a0 > c1 - c0;
    const ax0 = a0 + 0.002, ax1 = Math.min(a1, x1) - 0.002, cz0 = c0 + 0.002, cz1 = Math.min(c1, z1) - 0.002;
    // the mat: woven rush (u along its length)
    const yT = F1 + 0.022;
    // (u runs along the mat: the rush is woven across it)
    const uvs = alongX ? [[ax0, cz0], [ax0, cz1], [ax1, cz1], [ax1, cz0]] : [[cz0, ax0], [cz1, ax0], [cz1, ax1], [cz0, ax1]];
    b0.quad(V(ax0, yT, cz0), V(ax0, yT, cz1), V(ax1, yT, cz1), V(ax1, yT, cz0), 0xc9c08a, PAT.TATAMI, { uvs });
    b0.boxMM(ax0, F1 - 0.02, cz0, ax1, yT - 0.001, cz1, { color: 0xb5ab78, skip: 'Y' });
    // the cloth edges (縁) along the long sides
    const HERI = 0x2f3b33;
    if (alongX) {
      b0.boxMM(ax0, yT - 0.004, cz0, ax1, yT + 0.002, cz0 + 0.03, { color: HERI });
      b0.boxMM(ax0, yT - 0.004, cz1 - 0.03, ax1, yT + 0.002, cz1, { color: HERI });
    } else {
      b0.boxMM(ax0, yT - 0.004, cz0, ax0 + 0.03, yT + 0.002, cz1, { color: HERI });
      b0.boxMM(ax1 - 0.03, yT - 0.004, cz0, ax1, yT + 0.002, cz1, { color: HERI });
    }
  }
  // posts in the corners and either side of the fusuma, the 長押 rail round the room at
  // head height, the ceiling's battens
  const W = 0x9c7a55;
  for (const [x, z] of [[x0 + 0.05, z0 + 0.05], [x1 - 0.05, z0 + 0.05], [x0 + 0.05, z1 - 0.05], [x1 - 0.05, z1 - 0.05], [x1 - 0.05, -24.03], [x1 - 0.05, -22.22]]) {
    b0.box(x, F1 + H.ch / 2, z, 0.1, H.ch, 0.1, { color: W });
  }
  const yN = F1 + 1.86;
  b0.boxMM(x0, yN, z0, x1, yN + 0.08, z0 + 0.04, { color: W });
  b0.boxMM(x0, yN, z1 - 0.04, x1, yN + 0.08, z1, { color: W });
  b0.boxMM(x0, yN, z0, x0 + 0.04, yN + 0.08, z1, { color: W });
  b0.boxMM(x1 - 0.04, yN, z0, x1, yN + 0.08, -24.0, { color: W });
  b0.boxMM(x1 - 0.04, yN - 0.06, -24.0, x1, yN + 0.08, -22.25, { color: W });
  b0.boxMM(x1 - 0.04, yN, -22.25, x1, yN + 0.08, z1, { color: W });
  for (let x = x0 + 0.45; x < x1 - 0.1; x += 0.45) b0.boxMM(x - 0.015, F1 + H.ch - 0.03, z0, x + 0.015, F1 + H.ch, z1, { color: 0xa98a62 });
  b0.boxMM(x0, F1 + H.ch - 0.05, z0, x1, F1 + H.ch, z0 + 0.04, { color: W });
  b0.boxMM(x0, F1 + H.ch - 0.05, z1 - 0.04, x1, F1 + H.ch, z1, { color: W });
  // the threshold (敷居) under the opening, and in its two grooves the two fusuma, both slid to
  // the south half (the north half is the way through): lacquered frames round papered faces,
  // a pull set into each side you can see
  b0.boxMM(x1 - 0.06, F1, -24.0, H.xw + 0.05, F1 + 0.02, -22.25, { color: W });
  const FZ = { z0: -23.16, z1: -22.25, y0: F1 + 0.021, y1: F1 + 1.797 };
  const LAC = 0x2a2421, PAPER = 0xf3ecdc;
  for (const [xa, xb] of [[H.xw - 0.04, H.xw - 0.01], [H.xw + 0.01, H.xw + 0.04]]) {
    b0.boxMM(xa, FZ.y0, FZ.z0, xb, FZ.y1, FZ.z0 + 0.02, { color: LAC });
    b0.boxMM(xa, FZ.y0, FZ.z1 - 0.02, xb, FZ.y1, FZ.z1, { color: LAC });
    b0.boxMM(xa, FZ.y1 - 0.025, FZ.z0 + 0.02, xb, FZ.y1, FZ.z1 - 0.02, { color: LAC });
    b0.boxMM(xa, FZ.y0, FZ.z0 + 0.02, xb, FZ.y0 + 0.03, FZ.z1 - 0.02, { color: LAC });
    b0.boxMM(xa + 0.002, FZ.y0 + 0.03, FZ.z0 + 0.02, xb - 0.002, FZ.y1 - 0.025, FZ.z1 - 0.02, { color: PAPER });
  }
  // the faces: the 和室 side of the west one, the LDK side of the east one ('W' / 'E' turn
  // the piece's +z out of either side of the wall)
  const hw = (FZ.z1 - FZ.z0) / 2 - 0.02, zc = (FZ.z0 + FZ.z1) / 2;
  for (const face of ['W', 'E']) {
    put(ctx, H.xw, F1, zc, face, (b, sb) => {
      const d = 0.038; // the paper's face, out from the middle of the wall
      pic(sb, -hw, hw, FZ.y0 - F1 + 0.03, FZ.y1 - F1 - 0.025, d + 0.0005, P.fusuma);
      // the pull, by the panel's north edge (on the left seen from the 和室, the right from the LDK)
      const px = face === 'W' ? -hw + 0.09 : hw - 0.09;
      b.rod(V(px, 0.86, d - 0.001), V(px, 0.86, d + 0.0025), 0.026, 0.026, 16, 0x9a8258);
      b.rod(V(px, 0.86, d + 0.0025), V(px, 0.86, d + 0.003), 0.017, 0.017, 16, 0x2a2421);
    });
  }
  block(ctx, H.xw - 0.05, FZ.z0, H.xw + 0.05, FZ.z1, F1, 1.8);
  // the alcove in the corner: a raised board, an ikebana of a cherry branch, the scroll
  put(ctx, 40.18, F1, z0 + 0.23, 'S', (b, sb) => {
    box(b, -0.7, 0, -0.22, 0.7, 0.1, 0.22, 0x7a5236, { pattern: PAT.PLANKS });
    lathe(b, 0.35, 0.1, -0.02, [[0, 0], [0.06, 0], [0.07, 0.03], [0.05, 0.08], [0.055, 0.1], [0, 0.1]], 0x3d4a5a, 14);
    const pts = [V(0.35, 0.18, -0.02), V(0.3, 0.4, 0.0), V(0.18, 0.62, 0.02), V(0.05, 0.72, 0.04)];
    b.tube(pts, [0.008, 0.007, 0.005, 0.003], 5, 0x4a3628);
    for (const p of [[0.3, 0.42, 0.0], [0.24, 0.52, 0.02], [0.16, 0.62, 0.02], [0.1, 0.69, 0.04], [0.33, 0.33, 0.02], [0.06, 0.73, 0.03]]) b.box(p[0], p[1], p[2], 0.03, 0.028, 0.03, { color: 0xf5bcc8 });
    // the scroll on the wall: rods top and bottom, the paper
    const zW = -0.22;
    box(b, -0.26, 0.42, zW, 0.26, 0.44, zW + 0.03, 0x3a2e26);
    box(b, -0.24, 1.82, zW, 0.24, 1.84, zW + 0.02, 0x3a2e26);
    pic(sb, -0.22, 0.22, 0.44, 1.82, zW + 0.012, P.scroll);
    b.rod(V(0, 1.84, zW + 0.01), V(0, 1.92, zW + 0.005), 0.003, 0.003, 4, 0x3a2e26);
  });
  block(ctx, 39.46, z0, 40.9, z0 + 0.45, F1, 0.6);
  // a chest of drawers (箪笥) in dark wood with iron pulls
  put(ctx, 41.5, F1, z0 + 0.22, 'S', (b) => {
    const w = 0.9, d = 0.42, h = 0.95;
    box(b, -w / 2, 0, -d / 2, w / 2, h, d / 2, 0x6b4a33, { pattern: PAT.PLANKS });
    for (let k = 0; k < 4; k++) {
      const ya = 0.06 + k * 0.215, yb = ya + 0.2;
      box(b, -w / 2 + 0.03, ya, d / 2, w / 2 - 0.03, yb, d / 2 + 0.012, 0x7d5940);
      for (const s of [-1, 1]) {
        box(b, s * 0.22 - 0.05, ya + 0.08, d / 2 + 0.012, s * 0.22 + 0.05, ya + 0.12, d / 2 + 0.02, 0x2b2622);
        b.rod(V(s * 0.22 - 0.035, ya + 0.1, d / 2 + 0.03), V(s * 0.22 + 0.035, ya + 0.1, d / 2 + 0.03), 0.005, 0.005, 6, 0x1f1c1a);
      }
    }
    // on it: a small red daruma and a dish of potpourri
    soft(b, -0.25, h, -0.06, -0.13, h + 0.12, 0.06, 0xc8342c, 0.05);
    lathe(b, 0.2, h, 0, [[0, 0], [0.08, 0], [0.1, 0.03], [0, 0.03]], 0xd8d2c4, 12);
  });
  block(ctx, 41.03, z0, 41.97, z0 + 0.45, F1, 0.95);
  // the low table (ちゃぶ台), the tea things on a tray, a plate of sweets; two cushions
  const tx = 40.74, tz = -21.93;
  put(ctx, tx, F1 + 0.022, tz, 'S', (b) => {
    b.cyl(0, 0.3, 0, 0.42, 0.42, 0.035, 28, 0x7a5236, PAT.PLANKS);
    b.cyl(0, 0.27, 0, 0.36, 0.36, 0.03, 24, 0x6a4630);
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      box(b, Math.cos(a) * 0.27 - 0.025, 0, Math.sin(a) * 0.27 - 0.025, Math.cos(a) * 0.27 + 0.025, 0.27, Math.sin(a) * 0.27 + 0.025, 0x6a4630);
    }
    const yT = 0.335;
    box(b, -0.2, yT, -0.16, 0.08, yT + 0.012, 0.0, 0x2e2826);
    kyusu(b, -0.12, yT + 0.012, -0.08, 0x6d7d68);
    yunomi(b, -0.02, yT + 0.012, -0.11, 0xefe8d8);
    yunomi(b, 0.03, yT + 0.012, -0.04, 0xd8c6a8);
    // sweets: a small plate of three-colour dango
    b.cyl(0.16, yT, 0.12, 0.08, 0.08, 0.008, 16, 0xf3eee4);
    for (const [i, c] of [[0, 0xf3a8b8], [1, 0xf8f4ea], [2, 0x9cc488]]) b.box(0.1 + i * 0.045, yT + 0.03, 0.12, 0.04, 0.04, 0.04, { color: c });
    b.rod(V(0.08, yT + 0.03, 0.12), V(0.24, yT + 0.03, 0.12), 0.003, 0.003, 4, 0xd8c08a);
  });
  block(ctx, tx - 0.42, tz - 0.42, tx + 0.42, tz + 0.42, F1, 0.62);
  for (const [z, face] of [[tz + 0.72, 'N'], [tz - 0.72, 'S']]) {
    put(ctx, tx, F1 + 0.022, z, face, (b) => {
      soft(b, -0.28, 0, -0.3, 0.28, 0.075, 0.3, 0x8a2f3a, 0.03);
      soft(b, -0.27, 0.06, -0.29, 0.27, 0.08, 0.29, 0x9a3a44, 0.012);
      for (const [x, zz] of [[-0.26, -0.28], [0.26, -0.28], [-0.26, 0.28], [0.26, 0.28]]) b.box(x, 0.06, zz, 0.025, 0.02, 0.025, { color: 0xe8c66a });
    });
  }
  // a paper lantern (行灯) in the corner, glowing at night
  put(ctx, 39.62, F1 + 0.022, -20.4, 'N', (b) => {
    box(b, -0.14, 0, -0.14, 0.14, 0.04, 0.14, 0x4a3628);
    for (const [x, z] of [[-0.13, -0.13], [0.13, -0.13], [-0.13, 0.13], [0.13, 0.13]]) box(b, x - 0.012, 0.04, z - 0.012, x + 0.012, 0.62, z + 0.012, 0x4a3628);
    box(b, -0.14, 0.6, -0.14, 0.14, 0.63, 0.14, 0x4a3628);
  });
  ctx.builders.get('emissive', 39.62, -20.4).box(39.62, F1 + 0.36, -20.4, 0.25, 0.5, 0.25, { color: 0xffe6b8 });
  block(ctx, 39.45, -20.55, 39.8, -20.2, F1, 0.65);
  ceilingLight(ctx, 40.74, F1 + H.ch, -22.0, 0.26);
  // shoji screens inside the two windows (one slid aside on each, the glass and the garden
  // beyond)
  shoji(ctx, 'z', H.xi0 + 0.04, -23.25, -21.55, F1 + 0.85, F1 + 1.95, 1);
  shoji(ctx, 'x', H.zi1 - 0.04, 39.85, 41.55, F1 + 0.85, F1 + 1.95, -1);
  // the cushion she kneels on (facing the table)
  spot(ctx, 'zabuton', '座布団に座る', tx, tz + 0.95, F1, 0.75, { seat: { x: tx, z: tz + 0.72, face: Math.PI, y: F1 + 0.022 } });
}

// a shoji screen (lattice and paper) in a window: the near half closed, the far one slid
// behind it; axis/c/dir as for the wall (dir: the way into the room)
function shoji(ctx, axis, c, a0, a1, y0, y1, dir) {
  const b = PB(ctx, axis === 'x' ? (a0 + a1) / 2 : c, axis === 'x' ? c : (a0 + a1) / 2);
  const W = 0x8a6a48;
  const half = (a1 - a0) / 2;
  const panel = (p0, p1, off) => {
    const at = (a, y, d) => (axis === 'x' ? V(a, y, c + dir * (off + d)) : V(c + dir * (off + d), y, a));
    // frame
    const fr = (pa, pb, ya, yb, d0, d1) => {
      const A = at(pa, ya, d0), B = at(pb, yb, d1);
      b.boxMM(Math.min(A.x, B.x), Math.min(A.y, B.y), Math.min(A.z, B.z), Math.max(A.x, B.x), Math.max(A.y, B.y), Math.max(A.z, B.z), { color: W });
    };
    fr(p0, p1, y0, y0 + 0.035, 0, 0.03);
    fr(p0, p1, y1 - 0.035, y1, 0, 0.03);
    fr(p0, p0 + 0.03, y0, y1, 0, 0.03);
    fr(p1 - 0.03, p1, y0, y1, 0, 0.03);
    // the lattice (kumiko): 3 across, 5 up
    for (let k = 1; k < 3; k++) {
      const a = p0 + ((p1 - p0) * k) / 3;
      fr(a - 0.007, a + 0.007, y0, y1, 0.005, 0.025);
    }
    for (let k = 1; k < 6; k++) {
      const y = y0 + ((y1 - y0) * k) / 6;
      fr(p0, p1, y - 0.007, y + 0.007, 0.005, 0.025);
    }
    // paper (on the room's side of the lattice is the frame; the paper on the window's)
    const P0 = at(p0, y0, 0.004), P1 = at(p1, y0, 0.004), P2 = at(p1, y1, 0.004), P3 = at(p0, y1, 0.004);
    b.quad(P0, P1, P2, P3, 0xfbf7ee, 0, { double: true });
  };
  panel(a0, a0 + half + 0.02, 0.0);
  panel(a0 + 0.02, a0 + half + 0.04, 0.035);
}

function ldk(ctx, H, P, rng) {
  const F1 = H.f1;
  const zN = H.zh + 0.05;
  // the kitchen along the north wall: tea corner, sink, IH hob under a hood, the fridge
  const k0 = 44.78, k1 = 46.75, kd = 0.64, kh = 0.86;
  const kb = PB(ctx, 45.7, zN + 0.3);
  kb.boxMM(k0, F1, zN, k1, F1 + 0.08, zN + kd - 0.06, { color: 0x6b6863 });
  kb.boxMM(k0, F1 + 0.08, zN, k1, F1 + kh - 0.04, zN + kd - 0.02, { color: 0xf4f1ea });
  // cabinet doors and drawers with slim wood pulls
  const units = [k0, 45.45, 46.05, k1];
  for (let i = 0; i < 3; i++) {
    const a = units[i] + 0.008, c = units[i + 1] - 0.008;
    kb.boxMM(a, F1 + 0.1, zN + kd - 0.02, c, F1 + kh - 0.25, zN + kd - 0.005, { color: 0xf8f6f0 });
    kb.boxMM(a, F1 + kh - 0.23, zN + kd - 0.02, c, F1 + kh - 0.06, zN + kd - 0.005, { color: 0xf8f6f0 });
    kb.boxMM(a + 0.06, F1 + kh - 0.17, zN + kd - 0.005, c - 0.06, F1 + kh - 0.15, zN + kd + 0.012, { color: 0xb39672 });
    kb.boxMM((a + c) / 2 - 0.12, F1 + kh - 0.3, zN + kd - 0.005, (a + c) / 2 + 0.12, F1 + kh - 0.28, zN + kd + 0.012, { color: 0xb39672 });
  }
  // the counter top (wood), the sink (a steel basin), the faucet
  kb.boxMM(k0 - 0.01, F1 + kh - 0.04, zN, k1 + 0.01, F1 + kh, zN + kd + 0.01, { color: 0xc9a274, pattern: PAT.PLANKS });
  kb.boxMM(45.52, F1 + kh - 0.002, zN + 0.12, 46.0, F1 + kh + 0.002, zN + kd - 0.1, { color: 0x9aa0a6 });
  kb.boxMM(45.55, F1 + kh - 0.16, zN + 0.15, 45.97, F1 + kh - 0.004, zN + kd - 0.13, { color: 0x80868c, skip: 'Y' });
  kb.rod(V(45.76, F1 + kh, zN + 0.08), V(45.76, F1 + kh + 0.3, zN + 0.08), 0.014, 0.014, 8, 0xc7ccd1);
  kb.tube([V(45.76, F1 + kh + 0.3, zN + 0.08), V(45.76, F1 + kh + 0.34, zN + 0.14), V(45.76, F1 + kh + 0.3, zN + 0.22)], 0.012, 6, 0xc7ccd1);
  // the IH hob: black glass with two rings
  kb.boxMM(46.08, F1 + kh, zN + 0.08, 46.66, F1 + kh + 0.008, zN + kd - 0.06, { color: 0x1f2124 });
  for (const x of [46.22, 46.52]) kb.cyl(x, F1 + kh + 0.008, zN + 0.33, 0.09, 0.09, 0.002, 20, 0x55585c, 0, { caps: false });
  // a small pan on the hob, the dish rack by the sink, a cutting board
  kb.cyl(46.52, F1 + kh + 0.01, zN + 0.33, 0.1, 0.1, 0.06, 16, 0x9aa0a6);
  kb.rod(V(46.62, F1 + kh + 0.06, zN + 0.33), V(46.8, F1 + kh + 0.07, zN + 0.42), 0.012, 0.012, 6, 0x2a2a2a);
  kb.boxMM(45.08, F1 + kh, zN + 0.12, 45.4, F1 + kh + 0.015, zN + 0.38, { color: 0xe8d6b8 });
  // backsplash tiles, the wall cupboards, the range hood
  vtile(kb, 'x', zN + 0.001, k0, k1, F1 + kh, F1 + 1.45);
  kb.boxMM(k0, F1 + 1.45, zN, 46.02, F1 + 2.12, zN + 0.34, { color: 0xf4f1ea });
  for (const [a, c] of [[k0, 45.4], [45.4, 46.02]]) {
    kb.boxMM(a + 0.008, F1 + 1.47, zN + 0.34, c - 0.008, F1 + 2.1, zN + 0.352, { color: 0xf8f6f0 });
    kb.boxMM((a + c) / 2 - 0.1, F1 + 1.5, zN + 0.352, (a + c) / 2 + 0.1, F1 + 1.52, zN + 0.366, { color: 0xb39672 });
  }
  kb.boxMM(46.04, F1 + 1.72, zN, 46.7, F1 + 2.12, zN + 0.5, { color: 0xeeebe4 });
  kb.boxMM(46.06, F1 + 1.7, zN + 0.02, 46.68, F1 + 1.72, zN + 0.48, { color: 0x7c8086 });
  block(ctx, k0, zN, k1, zN + kd, F1, kh);
  // the fridge (pale mint), magnets and a note on it
  put(ctx, 47.1, F1, zN + 0.33, 'S', (b, sb) => {
    soft(b, -0.32, 0, -0.33, 0.32, 1.76, 0.33, 0xd3e8de, 0.025);
    box(b, -0.31, 1.06, 0.33, 0.31, 1.07, 0.335, 0xb9d0c6);
    for (const [ya, yb] of [[1.1, 1.55], [0.35, 0.95]]) b.rod(V(-0.25, ya, 0.35), V(-0.25, yb, 0.35), 0.012, 0.012, 6, 0xc9ccd0);
    box(b, 0.06, 1.3, 0.334, 0.18, 1.45, 0.338, 0xfff6a8);
    for (const [x, y, r, c] of [[0.12, 1.43, 0.018, 0xe8606e], [-0.08, 1.62, 0.02, 0x6ab0e0], [0.2, 0.75, 0.02, 0xf6c341]]) b.rod(V(x, y, 0.333), V(x, y, 0.345), r, r, 10, c);
  });
  block(ctx, 46.78, zN, 47.44, zN + 0.66, F1, 1.76);
  // the tea corner: an electric kettle, the teapot and her cup on a tray, a tea caddy
  const tea = { x: 45.12, z: zN + 0.44 };
  put(ctx, tea.x, F1 + kh, tea.z, 'S', (b) => {
    lathe(b, -0.2, 0, -0.08, [[0, 0], [0.075, 0], [0.08, 0.02], [0.07, 0.17], [0.05, 0.2], [0, 0.2]], 0xf6f4ef, 14);
    b.tube([V(-0.2, 0.06, -0.15), V(-0.2, 0.16, -0.18), V(-0.2, 0.2, -0.13)], 0.012, 6, 0x3a3a3c);
    box(b, -0.28, 0, -0.16, -0.12, 0.012, 0.0, 0x3a3a3c);
    box(b, -0.07, 0, -0.05, 0.17, 0.012, 0.12, 0x6a4a34);
    lathe(b, 0.22, 0, -0.1, [[0, 0], [0.04, 0], [0.04, 0.12], [0, 0.12]], 0x5d7a5a, 12);
  });
  // (the teapot and cup she uses are her own objects: systems/home.js)
  H.teaSpot = { x: tea.x, y: F1 + kh + 0.012, z: tea.z };
  // (she stands close to the counter, a forearm's length from the pot: no stiff stretched arm)
  spot(ctx, 'tea', 'お茶をいれる', tea.x, zN + 1.0, F1, 0.6, { stand: { x: tea.x - 0.08, z: zN + kd + 0.2, face: Math.PI } });

  // the dining table, two chairs, a pendant lamp over it
  const dx = 45.9, dz = -22.8;
  put(ctx, dx, F1, dz, 'S', (b) => {
    soft(b, -0.55, 0.69, -0.36, 0.55, 0.725, 0.36, 0xcfa577, 0.012, { pattern: PAT.PLANKS });
    for (const [x, z] of [[-0.48, -0.29], [0.48, -0.29], [-0.48, 0.29], [0.48, 0.29]]) box(b, x - 0.025, 0, z - 0.025, x + 0.025, 0.69, z + 0.025, 0xb58a5c);
    box(b, -0.46, 0.62, -0.3, 0.46, 0.69, -0.28, 0xb58a5c);
    box(b, -0.46, 0.62, 0.28, 0.46, 0.69, 0.3, 0xb58a5c);
    // a runner, a vase of flowers, a bowl of mikan
    box(b, -0.55, 0.725, -0.12, 0.55, 0.728, 0.12, 0xe8dcc8);
    lathe(b, -0.18, 0.728, 0, [[0, 0], [0.035, 0], [0.04, 0.05], [0.025, 0.12], [0, 0.12]], 0xf4f1ea, 12);
    for (const [ox, oz, c] of [[0, 0, 0xf6c3cf], [0.02, 0.02, 0xfff3a0], [-0.02, 0.015, 0xffffff]]) {
      b.rod(V(-0.18, 0.84, 0), V(-0.18 + ox, 0.95, oz), 0.003, 0.003, 4, 0x5f8a48);
      b.box(-0.18 + ox, 0.96, oz, 0.03, 0.025, 0.03, { color: c });
    }
    lathe(b, 0.2, 0.728, 0, [[0, 0], [0.06, 0], [0.11, 0.05], [0.12, 0.06], [0, 0.06]], 0xe9e3d6, 16);
    for (const [ox, oz] of [[0, 0], [0.05, 0.03], [-0.04, 0.04], [0.02, -0.05], [-0.03, -0.03]]) b.geom(new THREE.SphereGeometry(0.032, 10, 8), new THREE.Matrix4().makeTranslation(0.2 + ox, 0.79 + (ox === 0 && oz === 0 ? 0.03 : 0), oz), 0xf39a2c);
  });
  block(ctx, dx - 0.55, dz - 0.36, dx + 0.55, dz + 0.36, F1, 0.73);
  for (const [cx, face] of [[dx - 0.86, 'E'], [dx + 0.86, 'W']]) {
    put(ctx, cx, F1, dz, face, (b) => chairPiece(b, 0xb58a5c, 0xe6d9c2));
    block(ctx, cx - 0.21, dz - 0.21, cx + 0.21, dz + 0.21, F1, 0.6);
  }
  const pb = PB(ctx, dx, dz);
  pb.rod(V(dx, F1 + H.ch, dz), V(dx, F1 + 1.72, dz), 0.004, 0.004, 4, 0x2a2a2a);
  lathe(pb, dx, F1 + 1.5, dz, [[0.03, 0.22], [0.08, 0.2], [0.2, 0.04], [0.22, 0.0], [0.205, 0.0], [0.19, 0.035], [0.07, 0.19], [0.02, 0.21]], 0xe9e0cf, 20);
  ctx.builders.get('emissive', dx, dz).geom(new THREE.SphereGeometry(0.05, 10, 8), new THREE.Matrix4().makeTranslation(dx, F1 + 1.53, dz), 0xfff0d0);

  // the living corner: the TV on its board against the north wall, the sofa facing it with
  // its back to the garden window, a low table on a round rug, a floor lamp, a plant
  put(ctx, 42.95, F1, zN + 0.2, 'S', (b, sb) => {
    const w = 1.2, d = 0.4, h = 0.42;
    box(b, -w / 2, 0.05, -d / 2, w / 2, h, d / 2, 0xb58a5c, { pattern: PAT.PLANKS });
    box(b, -w / 2 + 0.02, 0, -d / 2 + 0.02, w / 2 - 0.02, 0.05, d / 2 - 0.04, 0x5a4636);
    box(b, -w / 2 + 0.03, 0.08, d / 2, -0.02, h - 0.04, d / 2 + 0.01, 0x9c7450);
    box(b, 0.02, 0.08, d / 2, w / 2 - 0.03, h - 0.04, d / 2 + 0.01, 0x9c7450);
    box(b, -0.33, 0.24, d / 2 + 0.01, -0.25, 0.26, d / 2 + 0.02, 0xd8c8a8);
    box(b, 0.25, 0.24, d / 2 + 0.01, 0.33, 0.26, d / 2 + 0.02, 0xd8c8a8);
    // the TV (its screen is drawn by systems/home.js)
    box(b, -0.12, h, -0.08, 0.12, h + 0.02, 0.06, 0x2a2a2c);
    box(b, -0.03, h + 0.02, -0.04, 0.03, h + 0.12, 0.0, 0x2a2a2c);
    box(b, -0.46, h + 0.08, -0.05, 0.46, h + 0.62, -0.01, 0x1c1c1e);
    // a small plant and a photo frame on the board
    plant(ctx, b, 0.48, h, 0.05, new RNG(31), 0.06, 0xf4f1ea, 0x6aa85a);
    box(b, -0.56, h, 0.0, -0.44, h + 0.15, 0.015, 0xf2efe8);
  });
  block(ctx, 42.35, zN, 43.55, zN + 0.42, F1, 0.6);
  H.tv = { x: 42.95, y: F1 + 0.42 + 0.08, z: zN + 0.2 - 0.01, w: 0.88, h: 0.5 };
  // the rug, the low table
  const rb = PB(ctx, 43.3, -22.7);
  rb.cyl(43.3, F1, -22.75, 1.05, 1.05, 0.012, 40, 0xe9dfcc);
  rb.cyl(43.3, F1 + 0.012, -22.75, 0.86, 0.86, 0.002, 40, 0xd8c3a4, 0, { caps: false });
  rb.cyl(43.3, F1 + 0.0125, -22.75, 0.84, 0.84, 0.002, 40, 0xe9dfcc);
  put(ctx, 43.3, F1 + 0.012, -22.85, 'S', (b) => {
    soft(b, -0.42, 0.34, -0.26, 0.42, 0.38, 0.26, 0xcfa577, 0.015, { pattern: PAT.PLANKS });
    for (const [x, z] of [[-0.36, -0.2], [0.36, -0.2], [-0.36, 0.2], [0.36, 0.2]]) b.cyl(x, 0, z, 0.022, 0.016, 0.34, 8, 0xb58a5c);
    box(b, -0.25, 0.38, -0.05, -0.08, 0.392, 0.12, 0xf1f1ec);
    box(b, -0.22, 0.392, -0.03, -0.1, 0.396, 0.09, 0x7fb6d6);
    box(b, 0.1, 0.38, 0.0, 0.16, 0.395, 0.14, 0x2a2a2c);
    lathe(b, 0.28, 0.38, -0.08, [[0, 0], [0.035, 0], [0.04, 0.08], [0, 0.08]], 0xf2c6c8, 12);
  });
  block(ctx, 42.88, -23.11, 43.72, -22.59, F1, 0.62);
  // the sofa (two seats, cream), cushions, a throw over an arm
  const sx = 43.42, sz = -21.42;
  put(ctx, sx, F1, sz, 'N', (b) => {
    const w = 1.62, d = 0.86;
    for (const x of [-w / 2 + 0.06, w / 2 - 0.06]) for (const z of [-d / 2 + 0.06, d / 2 - 0.06]) b.cyl(x, 0, z, 0.022, 0.018, 0.1, 8, 0x6a4a34);
    soft(b, -w / 2, 0.1, -d / 2, w / 2, 0.3, d / 2, 0xe6dccb, 0.03);
    soft(b, -w / 2, 0.1, -d / 2, -w / 2 + 0.17, 0.6, d / 2, 0xe6dccb, 0.05);
    soft(b, w / 2 - 0.17, 0.1, -d / 2, w / 2, 0.6, d / 2, 0xe6dccb, 0.05);
    soft(b, -w / 2 + 0.15, 0.3, -d / 2, w / 2 - 0.15, 0.82, -d / 2 + 0.2, 0xe6dccb, 0.05);
    for (const s of [-1, 1]) {
      soft(b, s > 0 ? 0.005 : -w / 2 + 0.17, 0.28, -d / 2 + 0.18, s > 0 ? w / 2 - 0.17 : -0.005, 0.42, d / 2 - 0.02, 0xefe6d6, 0.05);
      soft(b, s > 0 ? 0.01 : -w / 2 + 0.18, 0.42, -d / 2 + 0.16, s > 0 ? w / 2 - 0.18 : -0.01, 0.76, -d / 2 + 0.36, 0xefe6d6, 0.07, { rx: -0.22 });
    }
    // throw pillows: coral and mint; a folded yellow throw on the left arm
    soft(b, -0.58, 0.4, -0.2, -0.24, 0.68, -0.06, 0xf2a08c, 0.06, { rx: -0.3, rz: 0.15 });
    soft(b, 0.26, 0.4, -0.2, 0.6, 0.68, -0.06, 0xa8d8c8, 0.06, { rx: -0.3, rz: -0.12 });
    soft(b, -w / 2 - 0.01, 0.58, -0.3, -w / 2 + 0.18, 0.65, 0.18, 0xf6dc8a, 0.02);
  });
  block(ctx, sx - 0.81, sz - 0.43, sx + 0.81, sz + 0.43, F1, 0.82);
  spot(ctx, 'sofa', 'ソファに座る', sx, sz - 0.75, F1, 0.75, {
    seat: { x: sx, z: sz - 0.08, face: Math.PI, h: 0.42 },
  });
  // a floor lamp (glowing at night) and a low shelf of photos against the 和室's wall
  put(ctx, 44.45, F1, -21.0, 'S', (b) => {
    b.cyl(0, 0, 0, 0.14, 0.14, 0.02, 16, 0x3a3a3c);
    b.cyl(0, 0.02, 0, 0.012, 0.012, 1.3, 6, 0x3a3a3c);
    lathe(b, 0, 1.25, 0, [[0.13, 0], [0.16, 0], [0.11, 0.28], [0.08, 0.28]], 0xf3ecdc, 18);
  });
  ctx.builders.get('emissive', 44.45, -21.0).cyl(44.45, F1 + 1.27, -21.0, 0.12, 0.09, 0.22, 14, 0xffe8c0);
  block(ctx, 44.3, -21.15, 44.6, -20.85, F1, 1.4);
  put(ctx, 42.36, F1, -21.25, 'E', (b, sb) => {
    box(b, -0.6, 0, -0.15, 0.6, 0.62, 0.15, 0xc9a274, { pattern: PAT.PLANKS });
    box(b, -0.58, 0.3, -0.13, 0.58, 0.32, 0.15, 0xb58a5c);
    books(b, new RNG(12), -0.56, -0.05, 0.02, 0.3, -0.13, 0.13, {});
    box(b, 0.15, 0.62, -0.04, 0.33, 0.76, -0.025, 0xf2efe8);
    pic(sb, 0.17, 0.31, 0.64, 0.74, -0.024, sub(P.photos, 2));
    box(b, -0.2, 0.62, -0.05, -0.04, 0.82, -0.035, 0xa07a54);
    pic(sb, -0.18, -0.06, 0.64, 0.8, -0.034, sub(P.photos, 0));
    plant(ctx, b, 0.45, 0.62, 0.0, new RNG(44), 0.07, 0xd88a6a, 0x5f9a4c);
  });
  block(ctx, 42.2, -21.85, 42.52, -20.65, F1, 0.62);
  // a big plant in the corner by the window, the clock on the east wall, an air conditioner
  plant(ctx, PB(ctx, 47.0, -20.6), 47.0, F1, -20.6, new RNG(808), 0.2, 0xf1ece2, 0x4f8a48);
  block(ctx, 46.75, -20.85, 47.25, -20.35, F1, 1.0);
  put(ctx, H.xi1 - 0.002, F1 + 1.95, -22.6, 'W', (b, sb) => {
    b.rod(V(0, 0, 0), V(0, 0, 0.035), 0.17, 0.17, 24, 0xb58a5c);
    pic(sb, -0.15, 0.15, -0.15, 0.15, 0.036, P.clock);
  });
  aircon(ctx, 45.4, F1 + 2.05, H.zi1, 'N');
  // curtains at the south windows: a sheer, a drape at each side
  curtains(ctx, 'x', H.zi1 - 0.05, 42.55, 43.95, F1 + 0.8, F1 + 2.3, -1, 0xd9e8de, { sheer: 'a0' });
  curtains(ctx, 'x', H.zi1 - 0.05, 44.45, 46.35, F1 + 0.0, F1 + 2.3, -1, 0xd9e8de, { sheer: 'a1' });
  curtains(ctx, 'z', H.xi1 - 0.05, -23.3, -21.9, F1 + 0.85, F1 + 2.0, -1, 0xf2e2d4, { cafe: true });
  ceilingLight(ctx, 43.3, F1 + H.ch, -22.7, 0.28);
  ceilingLight(ctx, 46.2, F1 + H.ch, -23.4, 0.24);
}

// a cell of a strip of 4 pictures (the photos)
function sub(uv, i, n = 4) {
  const du = (uv.u1 - uv.u0) / n;
  return { u0: uv.u0 + du * i, u1: uv.u0 + du * (i + 1), v0: uv.v0, v1: uv.v1 };
}

// white wall tiles (a backsplash) on a wall face: axis/c as vq, from a0..a1, y0..y1, facing +
function vtile(b, axis, c, a0, a1, y0, y1) {
  if (axis === 'x') b.quad(V(a0, y0, c), V(a1, y0, c), V(a1, y1, c), V(a0, y1, c), 0xf2f0ea, PAT.TILE);
  else b.quad(V(c, y0, a1), V(c, y0, a0), V(c, y1, a0), V(c, y1, a1), 0xf2f0ea, PAT.TILE);
}

// a dining / desk chair (local: seat at 0.44, its back toward -z, facing +z)
export function chairPiece(b, wood, cushion) {
  for (const [x, z] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) box(b, x - 0.018, 0, z - 0.018, x + 0.018, 0.42, z + 0.018, wood);
  soft(b, -0.21, 0.4, -0.21, 0.21, 0.44, 0.21, wood, 0.01);
  soft(b, -0.19, 0.44, -0.19, 0.19, 0.47, 0.19, cushion, 0.015);
  for (const x of [-0.18, 0.18]) box(b, x - 0.018, 0.44, -0.2, x + 0.018, 0.86, -0.165, wood);
  box(b, -0.2, 0.7, -0.2, 0.2, 0.84, -0.17, wood);
  for (const x of [-0.08, 0, 0.08]) box(b, x - 0.012, 0.47, -0.195, x + 0.012, 0.7, -0.175, wood);
}

// an air conditioner high on a wall (local: the wall at z = 0)
function aircon(ctx, x, y, z, face) {
  put(ctx, x, y, z, face, (b) => {
    soft(b, -0.4, 0, 0, 0.4, 0.28, 0.22, 0xf8f8f4, 0.03);
    box(b, -0.36, 0.03, 0.2, 0.36, 0.05, 0.222, 0xd8dad8);
    box(b, 0.28, 0.2, 0.222, 0.33, 0.21, 0.226, 0x7fd8a0);
  });
}

// curtains: a sheer across the window, a gathered drape either side, a rail over it
// (axis/c: the window's plane; dir: into the room); cafe: a short sheer only
function curtains(ctx, axis, c, a0, a1, y0, y1, dir, color, o = {}) {
  // Curtains at a window on the plane `c` (the room on the `dir` side): the rod, the sheer drawn
  // to one side (o.sheer 'a0' or 'a1', over o.cover of the width) so the garden or the street
  // shows through the rest, the drapes gathered just outside the opening; o.cafe: a short sheer
  // on a tension rod over the lower half instead
  const b = PB(ctx, axis === 'x' ? (a0 + a1) / 2 : c, axis === 'x' ? c : (a0 + a1) / 2);
  const at = (a, y, d) => (axis === 'x' ? V(a, y, c + dir * d) : V(c + dir * d, y, a));
  const pleats = (s0, s1, yb, yt, dA, dB, col, w) => {
    const n = Math.max(3, Math.round((s1 - s0) / w));
    for (let i = 0; i < n; i++) {
      const u0 = s0 + ((s1 - s0) * i) / n, u1 = s0 + ((s1 - s0) * (i + 1)) / n;
      const d0 = i % 2 ? dB : dA, d1 = i % 2 ? dA : dB;
      b.quad(at(u0, yb, d0), at(u1, yb, d1), at(u1, yt, d1), at(u0, yt, d0), col, 0, { double: true });
    }
  };
  if (o.cafe) {
    const yr = y0 + (y1 - y0) * 0.48;
    b.rod(at(a0 - 0.01, yr + 0.02, 0.03), at(a1 + 0.01, yr + 0.02, 0.03), 0.007, 0.007, 6, 0xd9d4ca);
    pleats(a0, a1, y0 + 0.03, yr + 0.02, 0.025, 0.045, 0xfbfaf6, 0.05);
    return;
  }
  b.rod(at(a0 - 0.25, y1 + 0.04, 0.02), at(a1 + 0.25, y1 + 0.04, 0.02), 0.012, 0.012, 6, 0xb39672);
  // the sheer, gathered (narrow pleats) toward one side
  const w = (a1 - a0) * (o.cover ?? 0.34);
  if (o.sheer !== 'none') {
    const [s0, s1] = o.sheer === 'a1' ? [a1 - w, a1] : [a0, a0 + w];
    pleats(s0, s1, y0 + 0.02, y1, 0.03, 0.055, 0xfbfaf6, 0.045);
  }
  // the drapes, gathered either side (deeper folds), just about clear of the glass
  for (const [sa, sb2] of [[a0 - 0.2, a0 + 0.04], [a1 - 0.04, a1 + 0.2]]) pleats(sa, sb2, y0 + 0.02, y1, 0.07, 0.11, color, 0.05);
}

function bedroom(ctx, H, P, rng) {
  const F2 = H.f2, x0 = H.xi0, x1 = H.xb - 0.05, z0 = H.zh + 0.05, z1 = H.zi1;
  // the bed against the south wall under the window, its head to the east
  const bed = { x0: 42.47, x1: 44.47, z0: -21.27, z1: -20.15, top: F2 + 0.47 };
  H.bed = { ...bed, mattress: F2 + 0.42 };
  put(ctx, (bed.x0 + bed.x1) / 2, F2, (bed.z0 + bed.z1) / 2, 'S', (b, sb) => {
    const L = bed.x1 - bed.x0, Wd = bed.z1 - bed.z0;
    const hx = L / 2, hz = Wd / 2;
    // the frame (natural oak), legs, the headboard with a shelf, a low footboard
    for (const x of [-hx + 0.05, hx - 0.05]) for (const z of [-hz + 0.05, hz - 0.05]) box(b, x - 0.035, 0, z - 0.035, x + 0.035, 0.22, z + 0.035, 0xc9a274);
    box(b, -hx, 0.18, -hz, hx, 0.3, hz, 0xd4b083, { pattern: PAT.PLANKS });
    box(b, hx - 0.06, 0.18, -hz, hx, 0.95, hz, 0xd4b083, { pattern: PAT.PLANKS });
    box(b, hx - 0.2, 0.95, -hz, hx, 0.98, hz, 0xc9a274);
    box(b, -hx, 0.18, -hz, -hx + 0.05, 0.5, hz, 0xd4b083, { pattern: PAT.PLANKS });
    // the mattress, the duvet (peach) laid smooth, its turned-down top, two pillows
    soft(b, -hx + 0.06, 0.3, -hz + 0.03, hx - 0.07, 0.42, hz - 0.03, 0xfbfaf6, 0.04);
    soft(b, -hx + 0.04, 0.38, -hz + 0.005, hx - 0.48, 0.465, hz - 0.005, 0xf6c6b4, 0.04);
    soft(b, hx - 0.52, 0.415, -hz + 0.01, hx - 0.42, 0.47, hz - 0.01, 0xfbf2ea, 0.025);
    for (let i = 0; i < 9; i++) {
      const x = -hx + 0.16 + i * 0.16;
      box(b, x - 0.004, 0.462, -hz + 0.02, x + 0.004, 0.466, hz - 0.02, 0xfadbd0);
    }
    soft(b, hx - 0.43, 0.42, -hz + 0.12, hx - 0.09, 0.53, hz - 0.12, 0xfdfbf6, 0.05);
    // her rabbit, sitting against the headboard by the wall
    const rx = hx - 0.16, rz = hz - 0.12;
    soft(b, rx - 0.07, 0.53, rz - 0.06, rx + 0.07, 0.66, rz + 0.06, 0xfaf3ee, 0.06);
    soft(b, rx - 0.055, 0.64, rz - 0.05, rx + 0.055, 0.74, rz + 0.05, 0xfaf3ee, 0.05);
    for (const s of [-1, 1]) soft(b, rx - 0.015, 0.72, rz + s * 0.03 - 0.012, rx + 0.015, 0.84, rz + s * 0.03 + 0.012, 0xfaf3ee, 0.012, { rz: s * 0.15 });
    box(b, rx - 0.06, 0.69, rz - 0.012, rx - 0.055, 0.7, rz - 0.004, 0x2a2a2a);
    box(b, rx - 0.06, 0.69, rz + 0.004, rx - 0.055, 0.7, rz + 0.012, 0x2a2a2a);
    soft(b, rx - 0.075, 0.6, rz - 0.04, rx - 0.065, 0.62, rz + 0.04, 0xf3a7b8, 0.005);
    void sb;
  });
  block(ctx, bed.x0, bed.z0, bed.x1, bed.z1, F2, 0.6);
  // the bedside table: a lamp (glowing at night), an alarm clock, a book
  put(ctx, 44.25, F2, -21.6, 'W', (b) => {
    box(b, -0.22, 0, -0.2, 0.22, 0.5, 0.2, 0xd4b083, { pattern: PAT.PLANKS });
    box(b, -0.2, 0.25, 0.2, 0.2, 0.46, 0.21, 0xc9a274);
    b.rod(V(-0.04, 0.36, 0.21), V(0.04, 0.36, 0.21), 0.008, 0.008, 6, 0x9a7a58);
    lathe(b, 0.08, 0.5, -0.06, [[0, 0], [0.05, 0], [0.04, 0.02], [0.012, 0.03], [0.012, 0.2], [0, 0.2]], 0xf2efe8, 12);
    lathe(b, 0.08, 0.66, -0.06, [[0.07, 0], [0.09, 0], [0.06, 0.14], [0.045, 0.14]], 0xf9e9dc, 16);
    soft(b, -0.14, 0.5, -0.02, -0.04, 0.58, 0.04, 0xe86a7a, 0.02);
    b.cyl(-0.09, 0.53, 0.04, 0.028, 0.028, 0.003, 12, 0xf8f6ee, 0, { caps: false });
    box(b, -0.1, 0.5, 0.06, 0.06, 0.53, 0.16, 0x4f7fbf);
  });
  ctx.builders.get('emissive', 44.31, -21.52).cyl(44.31, F2 + 0.68, -21.52, 0.075, 0.05, 0.11, 12, 0xffe6c4);
  block(ctx, 44.03, -21.82, 44.47, -21.38, F2, 0.6);
  H.bedLampAt = { x: 44.31, y: F2 + 0.74, z: -21.52 };
  // fairy lights along the wall over the bed (they glow at night)
  const fb = PB(ctx, 43.4, z1);
  const eb = ctx.builders.get('emissive', 43.4, z1);
  const pts = [];
  for (let i = 0; i <= 24; i++) {
    const x = 42.55 + (i / 24) * 1.85;
    pts.push(V(x, F2 + 1.98 - Math.sin((i / 24) * Math.PI * 3) ** 2 * 0.08 - 0.02, z1 - 0.02));
  }
  fb.tube(pts, 0.003, 4, 0x6a5a4a);
  const bulbs = [0xffe2a8, 0xffc8d4, 0xfff4c8, 0xd8f0ff];
  for (let i = 1; i < 24; i += 2) eb.geom(new THREE.SphereGeometry(0.013, 8, 6), new THREE.Matrix4().makeTranslation(pts[i].x, pts[i].y - 0.018, pts[i].z), bulbs[(i >> 1) % 4]);

  // the desk under the west window: drawers, a lamp, books, a pen pot, a cactus, the cork
  // board above; her chair
  const desk = { x0: x0, x1: x0 + 0.62, z0: -23.25, z1: -21.95, top: F2 + 0.72 };
  H.desk = desk;
  put(ctx, (desk.x0 + desk.x1) / 2, F2, (desk.z0 + desk.z1) / 2, 'E', (b, sb) => {
    const w = desk.z1 - desk.z0, d = desk.x1 - desk.x0;
    const hw = w / 2, hd = d / 2;
    soft(b, -hw, 0.69, -hd, hw, 0.72, hd, 0xd4b083, 0.008, { pattern: PAT.PLANKS });
    // a drawer unit on the right (north... her left as she sits), legs on the other side
    box(b, hw - 0.42, 0, -hd + 0.02, hw - 0.02, 0.69, hd - 0.02, 0xf4f0e8);
    for (let k = 0; k < 3; k++) {
      const ya = 0.04 + k * 0.215;
      box(b, hw - 0.41, ya, hd - 0.02, hw - 0.03, ya + 0.2, hd - 0.008, 0xfaf8f2);
      box(b, hw - 0.27, ya + 0.15, hd - 0.008, hw - 0.17, ya + 0.165, hd + 0.006, 0xb39672);
    }
    for (const z of [-hd + 0.04, hd - 0.04]) box(b, -hw + 0.02, 0, z - 0.02, -hw + 0.06, 0.69, z + 0.02, 0xc9a274);
    box(b, -hw + 0.02, 0.1, -hd + 0.02, -hw + 0.06, 0.13, hd - 0.02, 0xc9a274);
    // a desk lamp (arm, shade), its bulb glows at night
    b.cyl(hw - 0.12, 0.72, -hd + 0.12, 0.07, 0.075, 0.025, 14, 0xf2efe8);
    b.rod(V(hw - 0.12, 0.745, -hd + 0.12), V(hw - 0.2, 1.05, -hd + 0.2), 0.009, 0.009, 6, 0xf2efe8);
    b.rod(V(hw - 0.2, 1.05, -hd + 0.2), V(hw - 0.34, 1.08, -hd + 0.33), 0.009, 0.009, 6, 0xf2efe8);
    lathe(b, hw - 0.34, 0.99, -hd + 0.33, [[0.02, 0.1], [0.04, 0.1], [0.075, 0.0], [0.07, 0.0]], 0xf2efe8, 14);
    // books (a row against the window), a pen pot, a cactus, a photo stand, a closed laptop
    for (let i = 0; i < 9; i++) {
      const col = [0x7fb6d6, 0xf2c6c8, 0xf6e7a8, 0xa8d8c8, 0xd8c8f0, 0xf0a08c, 0xe8e2d2, 0x9ab0e0, 0xf6c3cf][i];
      const h = 0.18 + ((i * 37) % 5) * 0.012;
      box(b, -hw + 0.05 + i * 0.034, 0.72, -hd + 0.03, -hw + 0.08 + i * 0.034, 0.72 + h, -hd + 0.2, col);
    }
    box(b, -hw + 0.36, 0.72, -hd + 0.03, -hw + 0.39, 0.86, -hd + 0.2, 0x9a7a58);
    lathe(b, hw - 0.36, 0.72, -hd + 0.14, [[0, 0], [0.032, 0], [0.032, 0.1], [0, 0.1]], 0xf6c3cf, 12);
    for (const [ox, c] of [[-0.01, 0x2a5aa8], [0.008, 0xe05a6a], [0.0, 0x3a3a3a]]) b.rod(V(hw - 0.36 + ox, 0.75, -hd + 0.14), V(hw - 0.36 + ox * 2, 0.88, -hd + 0.14 + ox), 0.004, 0.004, 4, c);
    lathe(b, -hw + 0.52, 0.72, -hd + 0.12, [[0, 0], [0.035, 0], [0.04, 0.05], [0, 0.05]], 0xc86a4a, 10);
    b.geom(new THREE.CapsuleGeometry(0.022, 0.05, 4, 8), new THREE.Matrix4().makeTranslation(-hw + 0.52, 0.8, -hd + 0.12), 0x5f9a54);
    // the cork board on the wall above, a calendar, the poster beside the window
    const zW = -hd;
    box(b, -hw + 0.02, 1.18, zW - 0.02, hw - 0.02, 1.2, zW, 0xa07a54);
    void sb;
  });
  block(ctx, desk.x0, desk.z0, desk.x1, desk.z1, F2, 0.75);
  // (the cork board and calendar sit on the north wall beside the window)
  put(ctx, x0 + 0.002, F2, -20.82, 'E', (b, sb) => {
    box(b, -0.32, 1.1, 0, 0.32, 1.55, 0.02, 0xa07a54);
    pic(sb, -0.3, 0.3, 1.12, 1.53, 0.021, P.notes);
    pic(sb, -0.27, -0.11, 1.32, 1.5, 0.023, sub(P.photos, 1));
    pic(sb, 0.08, 0.24, 1.15, 1.31, 0.023, sub(P.photos, 3));
  });
  put(ctx, x1 - 0.002, F2, -21.6, 'W', (b, sb) => {
    box(b, -0.16, 1.18, 0, 0.16, 1.6, 0.008, 0xf8f6f0);
    pic(sb, -0.15, 0.15, 1.19, 1.59, 0.009, P.calendar);
  });
  // (her chair stands pulled out a little; it moves with her: systems/home.js)
  const chair = { x: desk.x1 + 0.62, z: (desk.z0 + desk.z1) / 2, near: desk.x1 + 0.34 };
  H.chair = chair;
  spot(ctx, 'desk', '日記を書く', chair.x + 0.3, chair.z, F2, 0.8, {});

  // the wardrobe on the north wall (its doors open: systems/home.js), the mirror beside it
  const wd = { x0: 39.45, x1: 40.85, z0: z0, z1: z0 + 0.6, h: 1.95 };
  H.wardrobe = wd;
  put(ctx, (wd.x0 + wd.x1) / 2, F2, (wd.z0 + wd.z1) / 2, 'S', (b) => {
    const w = wd.x1 - wd.x0, d = wd.z1 - wd.z0, hw = w / 2, hd = d / 2, h = wd.h;
    box(b, -hw, 0, -hd, hw, 0.08, hd - 0.03, 0xc9a274);
    box(b, -hw, 0.08, -hd, -hw + 0.02, h, hd, 0xf8f6f0);
    box(b, hw - 0.02, 0.08, -hd, hw, h, hd, 0xf8f6f0);
    box(b, -hw, h - 0.03, -hd, hw, h, hd, 0xf8f6f0);
    box(b, -hw, 0.08, -hd, hw, 0.11, hd, 0xf8f6f0);
    box(b, -hw + 0.02, 0.11, -hd, hw - 0.02, h - 0.03, -hd + 0.012, 0xefe9de);
    box(b, -hw, h, -hd, hw, h + 0.04, hd + 0.01, 0xc9a274);
    // inside: a shelf, the rail, her clothes on hangers (the five outfits' colours), a box
    box(b, -hw + 0.02, h - 0.3, -hd + 0.012, hw - 0.02, h - 0.28, hd - 0.04, 0xf4f0e8);
    b.rod(V(-hw + 0.02, h - 0.42, 0), V(hw - 0.02, h - 0.42, 0), 0.012, 0.012, 6, 0xc9ccd0);
    const clothes = [0xfbf8f2, 0xf2b8c6, 0x2e3a5e, 0x6a8ab8, 0x2a2228, 0xe9d8b8, 0xa8c8a8];
    for (let i = 0; i < clothes.length; i++) {
      const x = -hw + 0.12 + i * ((w - 0.24) / (clothes.length - 1));
      b.rod(V(x, h - 0.42, 0), V(x, h - 0.47, 0), 0.004, 0.004, 4, 0xa0a0a0);
      b.tube([V(x, h - 0.47, -0.2), V(x, h - 0.5, 0), V(x, h - 0.47, 0.2)], 0.005, 4, 0xb39672);
      const len = 0.55 + ((i * 41) % 4) * 0.12;
      soft(b, x - 0.045, h - 0.5 - len, -0.21, x + 0.045, h - 0.48, 0.21, clothes[i], 0.03);
    }
    soft(b, -hw + 0.08, 0.11, -0.15, -hw + 0.5, 0.36, 0.2, 0xe8dcc8, 0.02);
    soft(b, hw - 0.48, 0.11, -0.15, hw - 0.08, 0.3, 0.2, 0xd4e4ec, 0.02);
    soft(b, -hw + 0.1, h - 0.28, -0.18, -hw + 0.55, h - 0.12, 0.18, 0xf3eee4, 0.02);
  });
  block(ctx, wd.x0, wd.z0, wd.x1, wd.z1, F2, 2.0);
  spot(ctx, 'wardrobe', '着替える', (wd.x0 + wd.x1) / 2, wd.z1 + 0.55, F2, 0.7, { stand: { x: (wd.x0 + wd.x1) / 2 + 0.08, z: wd.z1 + 0.62, face: Math.PI } });
  // the full-length mirror, leaning on the wall (a pale sheen in a wooden frame)
  put(ctx, 41.25, F2, z0 + 0.08, 'S', (b) => {
    box(b, -0.26, 0, -0.04, 0.26, 1.62, 0.0, 0xd4b083, { rx: 0 });
    box(b, -0.22, 0.06, 0.0, 0.22, 1.56, 0.006, 0xcfdbe2);
    box(b, -0.18, 0.9, 0.006, -0.05, 1.45, 0.008, 0xe9f1f4);
    box(b, -0.04, 1.2, 0.006, 0.02, 1.5, 0.008, 0xe9f1f4);
  });
  block(ctx, 40.97, z0, 41.53, z0 + 0.12, F2, 1.6);
  H.mirror = { x: 41.25, y: F2 + 0.8, z: z0 + 0.09 };
  // the bookshelf on the east wall: books, manga, a few figures and a plant
  put(ctx, x1 - 0.002, F2, -23.85, 'W', (b) => {
    b.push(new THREE.Matrix4().makeTranslation(-0.6, 0, 0));
    shelving(b, new RNG(77), 1.2, 1.8, 0.32, {
      color: 0xf4f0e8, back: 0xe9e3d8, bay: 0.6, shelves: 5,
      fill: (bb, r, xa, xb, yb, yt, zb, zf, k) => {
        if (k === 4) {
          soft(bb, xa + 0.05, yb, zb + 0.08, xa + 0.14, yb + 0.12, zb + 0.17, 0xf6c3cf, 0.04);
          soft(bb, xb - 0.16, yb, zb + 0.08, xb - 0.06, yb + 0.1, zb + 0.16, 0x9fd0e8, 0.04);
          return;
        }
        books(bb, r, xa, xb, yb, yt, zb, zf, { paperbacks: k < 2 });
      },
    });
    b.pop();
  });
  block(ctx, x1 - 0.34, -24.45, x1, -23.25, F2, 1.8);
  // a round rug, a floor cushion and a low table on it
  const rb = PB(ctx, 41.6, -22.6);
  rb.cyl(41.65, F2, -22.55, 1.1, 1.1, 0.012, 40, 0xf3e3e6);
  rb.cyl(41.65, F2 + 0.0125, -22.55, 0.9, 0.9, 0.002, 40, 0xe9c8d0, 0, { caps: false });
  put(ctx, 41.9, F2 + 0.012, -22.3, 'S', (b) => {
    b.cyl(0, 0.3, 0, 0.32, 0.32, 0.025, 24, 0xf8f6f0);
    b.cyl(0, 0, 0, 0.05, 0.03, 0.3, 10, 0xd4b083);
    b.cyl(0, 0, 0, 0.16, 0.16, 0.012, 16, 0xd4b083);
    yunomi(b, 0.1, 0.325, 0.05, 0xa8d8c8, 1.1);
    box(b, -0.18, 0.325, -0.12, 0.02, 0.34, 0.05, 0xfadbd0);
  });
  block(ctx, 41.58, -22.62, 42.22, -21.98, F2, 0.62);
  put(ctx, 41.2, F2 + 0.012, -22.05, 'S', (b) => soft(b, -0.24, 0, -0.24, 0.24, 0.09, 0.24, 0xa8d8c8, 0.04));
  // the poster, a wall clock over the door, the air conditioner, her school bag on the chair
  put(ctx, x1 - 0.002, F2, -22.4, 'W', (b, sb) => {
    box(b, -0.24, 1.3, 0, 0.24, 1.94, 0.006, 0xf8f6f0);
    pic(sb, -0.22, 0.22, 1.32, 1.92, 0.007, P.poster);
  });
  put(ctx, 42.97, F2 + 2.2, z0 + 0.002, 'S', (b, sb) => {
    b.rod(V(0, 0, 0), V(0, 0, 0.03), 0.11, 0.11, 20, 0xf6c3cf);
    pic(sb, -0.095, 0.095, -0.095, 0.095, 0.031, P.clock);
  });
  aircon(ctx, 40.9, F2 + 2.05, z0, 'S');
  curtains(ctx, 'z', x0 + 0.06, -23.45, -21.65, F2 + 0.8, F2 + 2.25, 1, 0xf6d6dc, { sheer: 'a1' });
  // (the balcony door: the sheer over part of the fixed pane, the half she walks through clear)
  curtains(ctx, 'x', z1 - 0.06, H.balcDoor.x0, H.balcDoor.x1, F2 + 0.02, F2 + 2.25, -1, 0xf6d6dc, { sheer: 'a0', cover: 0.3 });
  curtains(ctx, 'x', z1 - 0.06, 43.0, 44.25, F2 + 0.85, F2 + 2.05, -1, 0xf6d6dc, { sheer: 'a1', cover: 0.4 });
  ceilingLight(ctx, 41.9, F2 + H.ch, -22.3, 0.28);
  // the bed: lie down (or sleep)
  spot(ctx, 'bed', 'ベッドに横になる', 43.3, bed.z0 - 0.5, F2, 0.8, { sit: { x: 43.25, z: bed.z0 + 0.22 } });
  // the balcony rail
  spot(ctx, 'balcony', '景色をながめる', (H.balcony.x0 + H.balcony.x1) / 2, H.balcony.z1 - 0.5, H.balcony.y, 1.2, { rail: { z: H.balcony.z1 + 0.01, y: H.balcony.y + 1.04 } });
}

function balcony(ctx, H) {
  const B = H.balcony;
  // a planter of flowers along the wall, sandals by the door
  const b = PB(ctx, (B.x0 + B.x1) / 2, B.z1);
  b.boxMM(B.x1 - 1.25, B.y, B.z1 - 0.42, B.x1 - 0.1, B.y + 0.22, B.z1 - 0.12, { color: 0xe8e2d6 });
  const r = new RNG(611);
  for (let i = 0; i < 5; i++) shrub(B.x1 - 1.12 + i * 0.24, B.y + 0.32, B.z1 - 0.27, 0.15, 0.12, r, { flowers: GARDEN_FLOWERS, flowerCards: 3 });
  block(ctx, B.x1 - 1.25, B.z1 - 0.45, B.x1 - 0.1, B.z1 - 0.1, B.y, 0.6);
  put(ctx, 42.6, B.y, H.z1 + 0.25, 'S', (bb) => slippers(bb, 0, 0, 0x8ab0d0));
}

// ---------------------------------------------------------------------------- all of it
export function furnish(ctx, H) {
  const P = art(ctx);
  const rng = new RNG(4141);
  entrance(ctx, H, P);
  hall(ctx, H, P);
  washitsu(ctx, H, P, rng);
  ldk(ctx, H, P, rng);
  bedroom(ctx, H, P, rng);
  balcony(ctx, H);
  // the front door, from outside and from inside
  spot(ctx, 'door', '家に入る', H.x0 - 0.75, (H.door.z0 + H.door.z1) / 2, H.porch, 0.9, { side: 'out' });
  spot(ctx, 'door', '出かける', H.xi0 + 0.62, (H.door.z0 + H.door.z1) / 2, H.doma, 0.75, { side: 'in' });
}
