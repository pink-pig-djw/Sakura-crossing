import * as THREE from 'three';
import { RNG } from '../core/rng.js';
import { SOLIDS } from '../core/builder.js';
import { FONTS } from '../render/atlas.js';

// Modelled shelf and locker contents. Bookcases hold real books (sets of a height and
// colour, the odd gap, a stack lying flat, bookends, library call-number labels), shop
// shelves hold bottles, cans, cup noodles, snack bags, onigiri and so on, and lockers are
// banks of separate doors with handles, vents, name holders and number plates — instead
// of a flat picture of stripes on a box.
//
// Everything is built in a local frame on a wall line (see `onWall`): local x runs along
// the unit from 0 to len, y up from the floor, and the front plane is z = 0 with the unit
// standing behind it (z < 0) and its face looking down +z.

const V = (x, y, z) => new THREE.Vector3(x, y, z);
export const hex = (s) => parseInt(s.slice(1), 16);
export const shade = (c, k) => {
  const r = Math.min(255, Math.round(((c >> 16) & 255) * k)), g = Math.min(255, Math.round(((c >> 8) & 255) * k)), b = Math.min(255, Math.round((c & 255) * k));
  return (r << 16) | (g << 8) | b;
};

// a unit on a wall line: axis 'x' = the line runs along x at z = c, 'z' = along z at x = c;
// dir = the way its face looks (+1 / -1 along the other axis); fn(b, sb, len) builds it
export function onWall(ctx, axis, c, a0, a1, dir, y, fn) {
  const mx = axis === 'x' ? (a0 + a1) / 2 : c, mz = axis === 'x' ? c : (a0 + a1) / 2;
  const b = ctx.builders.get('props', mx, mz);
  const sb = ctx.builders.get('propsSign', mx, mz);
  let x, z, ry;
  if (axis === 'x') [x, z, ry] = dir > 0 ? [a0, c, 0] : [a1, c, Math.PI];
  else [x, z, ry] = dir > 0 ? [c, a1, Math.PI / 2] : [c, a0, -Math.PI / 2];
  b.pushTRS(x, y, z, ry);
  sb.pushTRS(x, y, z, ry);
  // small contents are not walls: keep them out of the foliage-fit solids list
  const was = SOLIDS.on;
  SOLIDS.on = false;
  try {
    fn(b, sb, a1 - a0);
  } finally {
    SOLIDS.on = was;
    b.pop();
    sb.pop();
  }
}

// a quad facing +z (local) on builder b; uv = atlas rect for the sign builder
export function face(b, x0, x1, y0, y1, z, color, uv = null, em = 0) {
  if (uv) b.quad(V(x0, y0, z), V(x1, y0, z), V(x1, y1, z), V(x0, y1, z), 0xffffff, em, { uvs: [[uv.u0, uv.v0], [uv.u1, uv.v0], [uv.u1, uv.v1], [uv.u0, uv.v1]] });
  else b.quad(V(x0, y0, z), V(x1, y0, z), V(x1, y1, z), V(x0, y1, z), color, 0);
}

// cell i of a grid drawn on an atlas rect (cols x rows, row 0 at the top)
function cellUV(uv, i, cols, rows) {
  const cx = i % cols, cy = Math.floor(i / cols) % rows;
  const du = (uv.u1 - uv.u0) / cols, dv = (uv.v1 - uv.v0) / rows;
  return { u0: uv.u0 + cx * du, u1: uv.u0 + (cx + 1) * du, v1: uv.v1 - cy * dv, v0: uv.v1 - (cy + 1) * dv };
}

// ---------------------------------------------------------------------------
// books
// ---------------------------------------------------------------------------
const BOOKS = ['#7a2e2a', '#2f3f5e', '#3d5a40', '#b8902e', '#d9d0bc', '#5a5f66', '#6b4a32', '#2f6670', '#5e3d5c', '#a8452f', '#ece6d6', '#1f2a3a', '#8a8f5a', '#c96f4a', '#e6c76a', '#40567a'].map(hex);
const PAPERBACK = ['#e8e2d2', '#f2d24a', '#e86a4a', '#4a8ad0', '#f4f0e6', '#7ac0a0', '#e88aa8', '#2a2a2a'].map(hex);

// fill one compartment (x0..x1 on a board at yb, headroom to yt, back zb, front zf)
export function books(b, rng, x0, x1, yb, yt, zb, zf, o = {}) {
  const maxH = yt - yb - 0.012, maxD = zf - zb - 0.004;
  if (maxH < 0.08 || maxD < 0.06) return;
  let x = x0 + rng.range(0.003, 0.02);
  const pal = o.palette ? o.palette.map(hex) : o.paperbacks ? PAPERBACK : BOOKS;
  if (o.binders || o.cds) {
    // a run of identical-height files: lever-arch binders or CD cases
    while (x < x1 - 0.02) {
      if (rng.next() < 0.05) {
        x += rng.range(0.03, 0.08);
        continue;
      }
      const col = rng.pick(pal), w = o.cds ? 0.0105 : rng.range(0.05, 0.075), h = Math.min(maxH, o.cds ? 0.125 : 0.3), d = Math.min(maxD, o.cds ? 0.142 : 0.26);
      const n = rng.int(o.cds ? 6 : 2, o.cds ? 20 : 6);
      for (let i = 0; i < n && x + w < x1 - 0.004; i++) {
        b.box(x + w / 2, yb + h / 2, zf - d / 2 - 0.003, w, h, d, { color: col, skip: 'yz' });
        if (o.binders) {
          face(b, x + w * 0.15, x + w * 0.85, yb + h * 0.6, yb + h * 0.85, zf - 0.002, 0xf6f4ee);
          face(b, x + w * 0.35, x + w * 0.65, yb + h * 0.18, yb + h * 0.3, zf - 0.002, shade(col, 0.45));
        } else face(b, x + 0.001, x + w - 0.001, yb + 0.004, yb + h - 0.004, zf - 0.002, rng.next() < 0.5 ? 0xf4f4f0 : shade(col, 1.4));
        x += w + 0.001;
      }
    }
    return;
  }
  while (x < x1 - 0.03) {
    const r = rng.next();
    if (r < 0.035 && x1 - x > 0.3) {
      x += rng.range(0.03, 0.09); // a gap where a book is out
      continue;
    }
    if (r < 0.07 && x1 - x > 0.32) {
      // a few books lying flat in a stack
      const n = rng.int(2, 4), w = rng.range(0.15, 0.23), d = Math.min(maxD, rng.range(0.14, 0.2));
      let yy = yb;
      for (let i = 0; i < n && yy < yb + maxH - 0.05; i++) {
        const t = rng.range(0.018, 0.04);
        b.box(x + w / 2 + rng.range(-0.008, 0.008), yy + t / 2, zf - d / 2 - 0.006, w, t, d, { color: rng.pick(pal), skip: 'yz' });
        yy += t;
      }
      x += w + 0.008;
      continue;
    }
    // a set: same colour and height, widths a little apart
    const n = Math.max(1, Math.round(rng.range(1, o.paperbacks ? 3 : 7)));
    const col = rng.pick(pal);
    const h = Math.min(maxH, o.paperbacks ? rng.range(0.15, 0.18) : rng.next() < 0.15 ? rng.range(0.27, 0.32) : rng.range(0.17, 0.26));
    const w0 = rng.range(0.016, o.paperbacks ? 0.03 : 0.045);
    const d = Math.min(maxD, h * rng.range(0.62, 0.75));
    const band = rng.next() < 0.5 ? shade(col, col > 0xa00000 ? 0.7 : 1.6) : -1;
    for (let i = 0; i < n && x < x1 - 0.02; i++) {
      const w = Math.min(x1 - x - 0.004, w0 * rng.range(0.85, 1.15));
      const c = shade(col, rng.range(0.92, 1.06));
      const zfront = zf - rng.range(0.002, 0.014);
      b.box(x + w / 2, yb + h / 2, zfront - d / 2, w, h, d, { color: c, skip: 'yz' });
      if (band >= 0) face(b, x + w * 0.12, x + w * 0.88, yb + h * 0.78, yb + h * 0.86, zfront + 0.001, band);
      if (o.label) {
        face(b, x + w * 0.15, x + w * 0.85, yb + 0.018, yb + 0.05, zfront + 0.001, 0xf6f4ee);
        face(b, x + w * 0.15, x + w * 0.85, yb + 0.036, yb + 0.04, zfront + 0.0012, rng.pick([0xd84a3a, 0x3a6ad8, 0x48a860, 0xf2c94a]));
      }
      x += w + 0.0015;
    }
  }
  // a bookend holding the end of the row up
  if (o.bookends !== false && x1 - x > 0.05) {
    b.boxMM(x + 0.005, yb, zf - 0.13, x + 0.008, yb + 0.15, zf - 0.02, { color: 0x8c9196 });
    b.boxMM(x + 0.008, yb, zf - 0.13, x + 0.1, yb + 0.004, zf - 0.02, { color: 0x8c9196 });
  }
}

// ---------------------------------------------------------------------------
// shelving: sides, dividers, back, boards and a kick plinth; fill(b, rng, x0, x1, yb, yt, zb, zf)
// ---------------------------------------------------------------------------
export function shelving(b, rng, len, h, depth, o = {}) {
  const col = o.color ?? 0x8a6a4c, T = o.board ?? 0.022, base = o.plinth ?? 0.08;
  const bays = Math.max(1, Math.round(len / (o.bay ?? 0.9)));
  const bw = len / bays;
  const n = o.shelves ?? Math.max(2, Math.floor((h - base - T) / 0.33));
  const backC = o.back ?? shade(col, 0.82), pat = o.pattern ?? 0;
  b.boxMM(0, 0, -depth, len, h, -depth + 0.012, { color: backC, skip: 'z' });
  b.boxMM(0, 0, -depth + 0.012, len, base, -0.02, { color: shade(col, 0.7), skip: 'z' });
  b.boxMM(0, h - T, -depth, len, h, 0, { color: col, pattern: pat });
  for (let i = 0; i <= bays; i++) {
    const xa = Math.max(0, i * bw - T / 2), xb = Math.min(len, i * bw + T / 2);
    b.boxMM(i === 0 ? 0 : xa, 0, -depth + 0.012, i === bays ? len : xb, h - T, 0, { color: col, pattern: pat, skip: 'z' });
  }
  const gap = (h - base - T) / n;
  for (let k = 0; k < n; k++) {
    const yb = base + k * gap;
    b.boxMM(0, yb - T, -depth + 0.012, len, yb, 0, { color: col, pattern: pat, skip: 'z' });
    if (o.lip) b.boxMM(0, yb - T, -0.004, len, yb + o.lip, 0.004, { color: o.lipColor ?? 0xd9dcdf });
    for (let i = 0; i < bays; i++) {
      if (o.fill) o.fill(b, rng, i * bw + T / 2 + 0.004, (i + 1) * bw - T / 2 - 0.004, yb, yb + gap - T, -depth + 0.014, -0.006, k);
    }
  }
}

// a bookcase standing on a wall line (single faced) or a free-standing double-faced row
export function bookcase(ctx, axis, c, a0, a1, dir, y, h, depth, o = {}) {
  const rng = new RNG(o.seed ?? Math.round(a0 * 97 + c * 13 + y * 7));
  const fill = (b, r, x0, x1, yb, yt, zb, zf) => books(b, r, x0, x1, yb, yt, zb, zf, o);
  onWall(ctx, axis, c, a0, a1, dir, y, (b) => shelving(b, rng, a1 - a0, h, depth, { ...o, fill }));
}

// ---------------------------------------------------------------------------
// shop goods
// ---------------------------------------------------------------------------
const GOODS = {
  drinks: ['#3a8a4a', '#e8432e', '#f6c341', '#2f6fd0', '#f4f4f0', '#8a4a2a', '#f08ab0', '#b8d870', '#2a2a2a'],
  cans: ['#c9ced3', '#e8432e', '#2f6fd0', '#f6c341', '#2a2a2a', '#48a860'],
  snacks: ['#e8432e', '#f6c341', '#2f6fd0', '#48a860', '#f08a24', '#9a4ac0', '#f08ab0', '#d8b070'],
  noodles: ['#f6c341', '#e8432e', '#f4f4f0', '#2f6fd0', '#f08a24', '#2a2a2a'],
  daily: ['#9fd0f0', '#f4f4f0', '#f6e7c8', '#48a860', '#f08ab0', '#2f6fd0', '#b8d8e8'],
  sweets: ['#fff1d8', '#f6c0d0', '#d8a060', '#f4f4f0', '#c86a8a', '#a8d8a0'],
  bread: ['#d9a05a', '#e8c080', '#c8803a', '#f6e7c8'],
  bento: ['#e8432e', '#48a860', '#f6c341', '#2a2a2a'],
  cards: ['#2f6fd0', '#e8432e', '#f6c341', '#48a860', '#9a4ac0', '#f4f4f0', '#2a2a2a'],
};
const pickC = (rng, k) => hex(rng.pick(GOODS[k]));
let _onigiri = null;
function onigiriGeo() {
  // a rounded triangle standing on edge, its face to the front
  if (!_onigiri) _onigiri = new THREE.CylinderGeometry(0.045, 0.045, 0.035, 3, 1).rotateX(Math.PI / 2).rotateZ(Math.PI);
  return _onigiri;
}

// one shelf of goods of a kind (local frame, faces +z)
export function goods(b, rng, kind, x0, x1, yb, yt, zb, zf) {
  const room = yt - yb - 0.01, deep = zf - zb;
  let x = x0 + 0.01;
  // only the front facing of round things is modelled (the shelf behind them is dark)
  const round = kind === 'drinks' || kind === 'noodles' || kind === 'sweets' || kind === 'milk';
  const rows = round ? 1 : Math.max(1, Math.min(2, Math.floor(deep / 0.11)));
  const facing = (w, fn) => {
    // a facing of identical items, a few deep (the front one pulled forward)
    for (let r = 0; r < rows; r++) fn(zf - 0.01 - (r + 0.5) * (deep / rows) + (r === 0 ? 0.01 : 0), r);
    x += w;
  };
  while (x < x1 - 0.05) {
    if (rng.next() < 0.05) {
      x += rng.range(0.04, 0.1); // sold out
      continue;
    }
    if (kind === 'drinks') {
      const can = rng.next() < 0.3;
      const col = can ? pickC(rng, 'cans') : pickC(rng, 'drinks');
      const n = rng.int(2, 3);
      for (let i = 0; i < n && x < x1 - 0.07; i++) {
        if (can) {
          const hh = Math.min(room, 0.123);
          facing(0.07, (z) => {
            b.cyl(x + 0.034, yb, z, 0.033, 0.033, hh, 10, col, 0, { top: 0xc9ced3 });
          });
        } else {
          const hh = Math.min(room - 0.03, 0.2);
          facing(0.072, (z) => {
            b.cyl(x + 0.035, yb, z, 0.033, 0.033, hh * 0.72, 10, 0xe4eef2);
            b.cyl(x + 0.035, yb + hh * 0.3, z, 0.0335, 0.0335, hh * 0.32, 10, col, 0, { caps: false });
            b.cyl(x + 0.035, yb + hh * 0.72, z, 0.033, 0.013, hh * 0.22, 10, 0xe4eef2);
            b.cyl(x + 0.035, yb + hh * 0.94, z, 0.014, 0.014, 0.024, 8, rng.next() < 0.5 ? 0xf4f4f0 : col);
          });
        }
      }
    } else if (kind === 'milk') {
      // glass bottles of coffee, plain and fruit milk with paper caps
      const col = hex(rng.pick(['#8a5a3a', '#f4f2ea', '#f2d27a']));
      for (let i = 0; i < 3 && x < x1 - 0.06; i++) {
        facing(0.062, (z) => {
          b.cyl(x + 0.03, yb, z, 0.027, 0.027, 0.09, 10, col);
          b.cyl(x + 0.03, yb + 0.09, z, 0.027, 0.02, 0.03, 10, col, 0, { top: 0xf4f0e6 });
        });
      }
    } else if (kind === 'noodles') {
      const col = pickC(rng, 'noodles'), lid = rng.next() < 0.5 ? 0xf4f4f0 : 0xd8d0c0;
      const stack = room > 0.25 ? 2 : 1;
      facing(0.12, (z) => {
        for (let s = 0; s < stack; s++) b.cyl(x + 0.058, yb + s * 0.115, z, 0.045, 0.056, 0.11, 12, col, 0, { top: lid });
      });
    } else if (kind === 'snacks' || kind === 'bread') {
      // pillow bags: puffy in the middle, crimped flat at the top
      const col = pickC(rng, kind), w = rng.range(0.12, 0.16), hh = Math.min(room - 0.03, rng.range(0.15, 0.21));
      const win = kind === 'bread' ? 0xf6efe0 : shade(col, 1.4), logo = kind === 'bread' ? pickC(rng, 'snacks') : rng.pick([0xffffff, 0xffe14a, 0x2a2a2a]);
      for (let i = 0; i < rng.int(1, 2) && x < x1 - 0.14; i++) {
        facing(w + 0.01, (z, r) => {
          b.box(x + w / 2, yb + hh * 0.45, z, w, hh * 0.9, 0.05, { color: col, skip: 'y' });
          b.box(x + w / 2, yb + hh * 0.45, z, w * 0.9, hh * 0.7, 0.07, { color: col, skip: 'y' });
          b.box(x + w / 2, yb + hh * 0.95, z, w, hh * 0.1, 0.012, { color: shade(col, 0.85) });
          if (r === 0) {
            face(b, x + w * 0.22, x + w * 0.78, yb + hh * 0.22, yb + hh * 0.5, z + 0.0355, win);
            face(b, x + w * 0.15, x + w * 0.85, yb + hh * 0.6, yb + hh * 0.72, z + 0.0355, logo);
          }
        });
      }
    } else if (kind === 'daily') {
      const t = rng.next();
      if (t < 0.4) {
        const col = pickC(rng, 'daily'), hh = Math.min(room - 0.01, rng.range(0.16, 0.24));
        facing(0.085, (z) => {
          b.box(x + 0.04, yb + hh / 2, z, 0.07, hh, 0.045, { color: col, skip: 'y' });
          b.cyl(x + 0.04, yb + hh, z, 0.012, 0.012, 0.03, 6, 0xf4f4f0);
        });
      } else if (t < 0.7) {
        const hh = Math.min(room - 0.01, 0.2);
        facing(0.26, (z) => b.box(x + 0.125, yb + hh / 2, z, 0.25, hh, 0.1, { color: 0xf4f4f0, skip: 'y' }));
        face(b, x - 0.2, x - 0.07, yb + 0.06, yb + 0.12, zf - 0.005 + 0.002, pickC(rng, 'daily'));
      } else {
        const col = pickC(rng, 'daily');
        facing(0.13, (z) => b.box(x + 0.06, yb + 0.05, z, 0.12, 0.1, 0.09, { color: col, skip: 'y' }));
      }
    } else if (kind === 'sweets') {
      const t = rng.next(), col = pickC(rng, 'sweets');
      if (t < 0.5) facing(0.085, (z) => b.cyl(x + 0.04, yb, z, 0.03, 0.038, 0.07, 10, col, 0, { top: 0xf4f4f0 }));
      else facing(0.13, (z) => b.box(x + 0.06, yb + 0.045, z, 0.12, 0.09, 0.1, { color: col, top: 0xf4f0e6, skip: 'y' }));
    } else if (kind === 'chilled') {
      const t = rng.next();
      if (t < 0.55) {
        // onigiri: white rice, a band of nori, a coloured label
        const lab = pickC(rng, 'bento');
        for (let i = 0; i < 3 && x < x1 - 0.1; i++) {
          facing(0.1, (z, r) => {
            const m = new THREE.Matrix4().makeTranslation(x + 0.048, yb + 0.0225, z);
            b.geom(onigiriGeo(), m, 0xf2efe6);
            if (r === 0) {
              face(b, x + 0.035, x + 0.061, yb + 0.004, yb + 0.05, z + 0.019, 0x1f2a22);
              face(b, x + 0.022, x + 0.074, yb + 0.006, yb + 0.018, z + 0.0195, lab);
            }
          });
        }
      } else {
        // bento: a black tray, a clear lid over coloured food
        const w = 0.2;
        facing(w + 0.015, (z) => {
          b.box(x + w / 2, yb + 0.02, z, w, 0.04, 0.15, { color: 0x2a2a2a, skip: 'y' });
          b.box(x + w * 0.3, yb + 0.045, z, w * 0.45, 0.015, 0.12, { color: pickC(rng, 'bento') });
          b.box(x + w * 0.72, yb + 0.045, z, w * 0.4, 0.015, 0.12, { color: 0xf2efe6 });
        });
      }
    } else if (kind === 'cards') {
      // cards and small packs hanging from pegs on a board
      const col = pickC(rng, 'cards');
      for (let row = 0; row < 3; row++) {
        const yy = yb + 0.06 + row * Math.max(0.12, (room - 0.12) / 3);
        if (yy + 0.11 > yt) break;
        b.box(x + 0.05, yy + 0.06, zf - 0.04, 0.006, 0.006, 0.08, { color: 0x8c9196 });
        for (let k = 0; k < 3; k++) b.box(x + 0.05, yy + 0.045 - k * 0.002, zf - 0.015 - k * 0.012, 0.085, 0.11, 0.004, { color: k === 0 ? col : shade(col, 0.9) });
      }
      x += 0.11;
    } else {
      x += 0.1;
    }
  }
  // price tags along the shelf edge
  for (let tx = x0 + 0.05; tx < x1 - 0.06; tx += rng.range(0.2, 0.34)) face(b, tx, tx + 0.045, yb - 0.022, yb - 0.004, zf + 0.0105, rng.next() < 0.25 ? 0xffe14a : 0xf4f4f0);
}

// a shop gondola or wall shelf of goods; kinds per shelf from the bottom
export function shopShelf(ctx, axis, c, a0, a1, dir, y, h, depth, kinds, o = {}) {
  const rng = new RNG(o.seed ?? Math.round(a0 * 31 + c * 17 + y));
  const fill = (b, r, x0, x1, yb, yt, zb, zf, k) => goods(b, r, kinds[Math.min(k, kinds.length - 1)], x0, x1, yb, yt, zb, zf);
  onWall(ctx, axis, c, a0, a1, dir, y, (b) => shelving(b, rng, a1 - a0, h, depth, { color: o.color ?? 0xeeeeea, back: o.back ?? 0xe2e4e6, bay: o.bay ?? 0.9, shelves: o.shelves ?? kinds.length, plinth: o.plinth ?? 0.12, board: 0.025, lip: 0.02, lipColor: 0xd9dcdf, fill }));
}

// ---------------------------------------------------------------------------
// lockers
// ---------------------------------------------------------------------------
// numbers 1..80 on little plates: style 'brass' (sento) or 'white' (steel lockers)
export function numberPlates(ctx, style) {
  return ctx.atlas2.draw('lk-num:' + style, 640, 128, (c, w, h) => {
    const cw = w / 20, ch = h / 4;
    for (let i = 0; i < 80; i++) {
      const x = (i % 20) * cw, y = Math.floor(i / 20) * ch;
      c.fillStyle = style === 'brass' ? '#c9a24a' : '#f6f4ee';
      c.fillRect(x + 1, y + 1, cw - 2, ch - 2);
      c.strokeStyle = style === 'brass' ? '#8a6a2a' : '#9aa0a6';
      c.lineWidth = 2;
      c.strokeRect(x + 2, y + 2, cw - 4, ch - 4);
      c.fillStyle = style === 'brass' ? '#3a2a10' : '#2a2a2a';
      c.font = `700 ${ch * 0.62}px ${FONTS.gothic}`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(String(i + 1), x + cw / 2, y + ch * 0.55);
    }
  });
}

// a bank of cols x rows doors (local frame); style: 'steel' | 'shoe' | 'wood' | 'parcel' | 'cubby'
export function lockerBank(b, sb, rng, len, h, depth, o) {
  const cols = o.cols, rows = o.rows, base = o.plinth ?? 0.06;
  const frame = o.frame ?? 0xc9ccd0, door = o.door ?? 0xe6e4dc;
  const top = o.top ?? h;
  const cw = len / cols, chh = (top - base) / rows, g = o.gap ?? 0.006;
  if (o.style === 'cubby' || o.style === 'shoecubby') {
    // open pigeonholes: a back, the grid of boards, a top
    const T = 0.018;
    b.boxMM(0, 0, -depth, len, h, -depth + 0.01, { color: shade(frame, 0.6), skip: 'z' });
    for (let i = 0; i <= cols; i++) b.boxMM(Math.max(0, i * cw - T / 2), 0, -depth + 0.01, Math.min(len, i * cw + T / 2), h, 0, { color: frame, skip: 'z' });
    for (let r = 0; r <= rows; r++) b.boxMM(0, base + r * chh - T / 2, -depth + 0.01, len, base + r * chh + T / 2, 0, { color: frame, skip: 'z' });
    b.boxMM(0, 0, -depth + 0.01, len, base, 0, { color: shade(frame, 0.75), skip: 'z' });
    if (h > top + 0.02) b.boxMM(0, top, -depth + 0.01, len, h, 0, { color: frame, skip: 'z' });
  } else {
    b.boxMM(0, 0, -depth, len, h, -0.004, { color: frame, skip: 'z' });
    b.boxMM(0.01, 0, -0.03, len - 0.01, base, 0.002, { color: shade(frame, 0.65) });
  }
  let n = o.start ?? 0;
  for (let cI = 0; cI < cols; cI++) {
    for (let r = rows - 1; r >= 0; r--) {
      const x0 = cI * cw + g, x1 = (cI + 1) * cw - g, y0 = base + r * chh + g, y1 = base + (r + 1) * chh - g;
      const w = x1 - x0, hh = y1 - y0;
      if (o.style === 'shoecubby') {
        // a pair of shoes heels out: indoor shoes (white, toe in the year colour) or sneakers
        if (rng.next() < 0.12) continue;
        const indoor = rng.next() < 0.6;
        const up = indoor ? 0xf4f2ec : hex(rng.pick(['#2a2a2a', '#f4f2ec', '#2f3f5e', '#c9ced3', '#7a2e2a', '#e8e2d2']));
        const sole = indoor ? hex(rng.pick(['#d84a3a', '#3a6ad8', '#48a860'])) : rng.next() < 0.5 ? 0xf4f2ec : 0x3a3a3a;
        const sw = Math.min(0.085, w * 0.42), sl = Math.min(depth * 0.85, 0.24), sh = Math.min(hh * 0.45, indoor ? 0.06 : 0.08);
        for (const e of [-1, 1]) {
          const cx = (x0 + x1) / 2 + e * (sw / 2 + 0.006), cz = -0.012 - sl / 2;
          b.box(cx, y0 + 0.012, cz, sw, 0.024, sl, { color: sole, skip: 'y' });
          b.box(cx, y0 + 0.024 + sh / 2, cz - sl * 0.12, sw * 0.94, sh, sl * 0.76, { color: up, skip: 'y' });
          if (!indoor) face(b, cx - sw * 0.25, cx + sw * 0.25, y0 + 0.03, y0 + 0.024 + sh * 0.8, cz + sl * 0.26 + 0.001, shade(up, up > 0x808080 ? 0.75 : 1.8));
        }
        continue;
      }
      if (o.style === 'cubby') {
        // a bag or folders in most of them
        const t = rng.next();
        if (t < 0.45) b.box((x0 + x1) / 2, y0 + hh * 0.38, -depth * 0.45, w * 0.8, hh * 0.72, depth * 0.6, { color: hex(rng.pick(['#2f3f5e', '#7a2e2a', '#3a3a3a', '#5a4a3a', '#2f6670', '#e8e2d2'])) });
        else if (t < 0.75) for (let k = 0; k < rng.int(2, 4); k++) b.box(x0 + 0.03 + k * 0.025, y0 + hh * 0.42, -depth * 0.5, 0.018, hh * 0.8, depth * 0.7, { color: hex(rng.pick(['#4a8ad0', '#e86a4a', '#f2d24a', '#7ac0a0', '#f4f0e6'])) });
        continue;
      }
      const dc = o.colors ? hex(rng.pick(o.colors)) : door;
      b.boxMM(x0, y0, -0.004, x1, y1, 0.012, { color: dc, skip: 'z' });
      if (o.style === 'steel' || o.style === 'parcel') {
        // vents, a name / number holder, a latch handle
        for (const k of [0.82, 0.88]) b.boxMM(x0 + w * 0.25, y0 + hh * k, 0.012, x1 - w * 0.25, y0 + hh * k + 0.006, 0.0135, { color: shade(dc, 0.6) });
        if (o.numbers) face(sb, x0 + w * 0.3, x1 - w * 0.3, y0 + hh * 0.62, y0 + hh * 0.62 + Math.min(0.05, w * 0.22), 0.0135, 0, cellUV(o.numbers, n, 20, 4));
        b.boxMM(x1 - w * 0.2, y0 + hh * 0.38, 0.012, x1 - w * 0.1, y0 + hh * 0.5, 0.03, { color: 0x6a6e74 });
        if (o.style === 'parcel') b.boxMM(x1 - w * 0.16, y0 + hh * 0.52, 0.012, x1 - w * 0.12, y0 + hh * 0.56, 0.016, { color: rng.next() < 0.3 ? 0xd84a3a : 0x48a860 });
      } else if (o.style === 'shoe') {
        // school shoe locker: a little flap door with a name card and a pull at the bottom
        face(b, x0 + w * 0.2, x1 - w * 0.2, y0 + hh * 0.62, y0 + hh * 0.84, 0.0125, 0xf8f6f0);
        b.boxMM(x0 + w * 0.35, y0 + hh * 0.08, 0.012, x1 - w * 0.35, y0 + hh * 0.14, 0.028, { color: shade(dc, 0.7) });
        b.boxMM(x0 + w * 0.18, y0 + hh * 0.86, 0.012, x1 - w * 0.18, y0 + hh * 0.9, 0.016, { color: shade(dc, 0.8) });
      } else if (o.style === 'wood') {
        // sento locker: a brass number plate, the wooden key (松竹錠) in its slot
        if (o.numbers) face(sb, x0 + w * 0.28, x1 - w * 0.28, y0 + hh * 0.7, y0 + hh * 0.7 + w * 0.3, 0.0135, 0, cellUV(o.numbers, n, 20, 4));
        b.boxMM(x0 + w * 0.42, y0 + hh * 0.36, 0.012, x1 - w * 0.42, y0 + hh * 0.58, 0.022, { color: 0x3a2a1c });
        if (rng.next() < 0.7) b.boxMM(x0 + w * 0.44, y0 + hh * 0.38, 0.022, x1 - w * 0.44, y0 + hh * 0.62, 0.03, { color: 0xd8b880 });
      }
      n++;
    }
  }
}

export function lockers(ctx, axis, c, a0, a1, dir, y, h, depth, o) {
  const rng = new RNG(o.seed ?? Math.round(a0 * 53 + c * 11 + y));
  onWall(ctx, axis, c, a0, a1, dir, y, (b, sb, len) => lockerBank(b, sb, rng, len, h, depth, o));
}


// ---------------------------------------------------------------------------
// magazine rack: two sloped tiers of magazines leaning back, covers out
// ---------------------------------------------------------------------------
const MAGS = [
  ['#e86a8a', '旬', 'SPRING'], ['#2f6fd0', 'たび', 'TRAVEL'], ['#f2c94a', 'ゲーム', 'GAME'], ['#2a2a2a', 'CAR', 'DRIVE'],
  ['#48a860', '料理', 'COOK'], ['#f4f0e6', 'non', 'STYLE'], ['#e8432e', '週刊', 'NEWS'], ['#9a4ac0', 'まんが', 'COMIC'],
];
function magCovers(ctx) {
  return ctx.atlas2.draw('mag-covers', 512, 96, (c, w, h) => {
    const cw = w / MAGS.length;
    MAGS.forEach(([bg, title, sub], i) => {
      const x = i * cw;
      c.fillStyle = bg;
      c.fillRect(x, 0, cw, h);
      // a cover photo: sky, a figure, a horizon
      c.fillStyle = 'rgba(255,255,255,0.35)';
      c.fillRect(x + cw * 0.12, h * 0.3, cw * 0.76, h * 0.52);
      c.fillStyle = bg === '#2a2a2a' ? '#c9ced3' : '#f6dcc8';
      c.beginPath();
      c.ellipse(x + cw * 0.55, h * 0.52, cw * 0.14, h * 0.12, 0, 0, Math.PI * 2);
      c.fill();
      c.fillRect(x + cw * 0.4, h * 0.62, cw * 0.3, h * 0.2);
      c.fillStyle = bg === '#f4f0e6' ? '#e8432e' : '#ffffff';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.font = `900 ${h * 0.2}px ${FONTS.bold}`;
      c.fillText(title, x + cw / 2, h * 0.15);
      c.font = `700 ${h * 0.08}px ${FONTS.gothic}`;
      c.fillText(sub, x + cw / 2, h * 0.9);
    });
  });
}

export function magazineRack(ctx, axis, c, a0, a1, dir, y, h, depth) {
  const rng = new RNG(Math.round(a0 * 7 + c * 3));
  const covers = magCovers(ctx);
  onWall(ctx, axis, c, a0, a1, dir, y, (b, sb, len) => {
    b.boxMM(0, 0, -depth, len, h * 0.45, 0, { color: 0xe6e6e2, skip: 'z' });
    b.boxMM(0, 0, -depth, len, h, -depth + 0.06, { color: 0xe6e6e2, skip: 'z' });
    const tiers = [[h * 0.45, -0.16], [h * 0.45 + 0.2, -depth + 0.2]];
    for (const [ty, tz] of tiers) {
      b.boxMM(0, ty - 0.02, tz - 0.12, len, ty, tz + 0.08, { color: 0xd9dcdf });
      let x = 0.04;
      while (x < len - 0.24) {
        const w = rng.range(0.2, 0.23), mh = w * 1.32, lean = -0.32;
        const i = rng.int(0, MAGS.length - 1);
        const m = new THREE.Matrix4().makeTranslation(x + w / 2, ty, tz + 0.02).multiply(new THREE.Matrix4().makeRotationX(lean));
        b.push(m);
        sb.push(m);
        b.box(0, mh / 2, -0.004, w, mh, 0.008, { color: hex(MAGS[i][0]), skip: 'yz' });
        face(sb, -w / 2, w / 2, 0, mh, 0.0005, 0, cellUV(covers, i, MAGS.length, 1), 0.15);
        b.pop();
        sb.pop();
        x += w + rng.range(0.01, 0.03);
      }
    }
  });
}
