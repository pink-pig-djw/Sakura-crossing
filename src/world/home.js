import * as THREE from 'three';
import { PAT } from '../core/builder.js';
import { RNG } from '../core/rng.js';
import { groundH } from './layout.js';
import { wallRects } from './interiors.js';
import { gableRoof, blockWall, hedge, potPlant, acUnit } from './kit.js';
import { FONTS, fitText } from '../render/atlas.js';
import { shrub, GARDEN_FLOWERS } from './greenery.js';
import { furnish } from './homedecor.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// 桜井家: Nanami's own house, on the east side of 桜坂 (the lot just across from where she
// starts). A two-storey wooden house of the modern kind, warm white siding and a dark roof,
// the front door looking onto the street, the living room and her balcony facing south.
//
//   1F  entrance (土間 and a step up), the hall and the stairs up along the north wall, the
//       bath (closed), a six-mat 和室 on the street side, the LDK (kitchen, dining table,
//       sofa and TV) on the garden side
//   2F  the stairwell and landing, her bedroom (bed, desk, wardrobe, mirror, bookshelf) with a
//       balcony over the garden; a store room and a spare room (closed)
//
// World coordinates throughout (the house sits square to the axes). Built during the lot loop
// (world.js: the lot's type is set to 'home'); the furniture in world/homedecor.js, the parts
// that move (doors, the TV, the lamps, the duvet ...) in systems/home.js.

// ---------------------------------------------------------------------------- the plan
export const LOT = { x0: 35.5, x1: 48.5, z0: -27.6241807899183, z1: -18.05 };
const X0 = 39.2, X1 = 47.6, Z0 = -26.95, Z1 = -19.95; // the outer walls' outer faces
const T = 0.16; // outer walls
const XI0 = X0 + T, XI1 = X1 - T, ZI0 = Z0 + T, ZI1 = Z1 - T; // their inner faces
const PT = 0.1; // partitions
const F1 = 6.1, F2 = 8.8, CH = 2.4; // floor levels, ceiling height
const TOP = 11.42; // the walls' top
const DOMA = 5.84; // the entrance's tiled floor, a step down from the house
const PORCH = 5.82;
// partition lines (centres)
const ZH = -24.55; // the north strip (entrance, hall, stairs, bath) | the rooms
const ZS = -25.6; // the stairs' open side, the hall south of it
const XW = 42.15; // 和室 | LDK
const XB = 44.6; // hall | bath (1F); bedroom | spare room (2F)
const XL = 45.45; // landing | store room (2F)
const XK = 40.55; // the step up out of the 土間 (上がり框)
const XC = 41.3; // 2F: the store room over the entrance | the stairwell
// the stairs: up eastward along the north wall, 13 risers
const ST = { x0: 41.42, n: 13, run: 0.24, z0: ZI0, z1: ZS - PT / 2 };
const RISE = (F2 - F1) / ST.n;
const STAIR_TOP = ST.x0 + (ST.n - 1) * ST.run; // the last riser, up onto the landing
// openings
const DOOR = { z0: -26.32, z1: -25.38, h: 2.15 }; // the front door (west wall)
const BALC = { x0: 39.9, x1: 43.9, z1: Z1 + 1.1, y: F2 - 0.05 }; // the balcony
const BDOOR = { x0: 40.55, x1: 42.35 }; // the glass door out onto it

export const HOME = {
  lot: LOT,
  x0: X0, x1: X1, z0: Z0, z1: Z1, xi0: XI0, xi1: XI1, zi0: ZI0, zi1: ZI1,
  f1: F1, f2: F2, ch: CH, doma: DOMA, porch: PORCH, zh: ZH, zs: ZS, xw: XW, xb: XB, xl: XL, xk: XK, xc: XC,
  stairs: { ...ST, rise: RISE, top: STAIR_TOP },
  door: { x: X0, ...DOOR, hinge: DOOR.z1, y: DOMA }, // hinged on its south side, opening outward
  balcony: BALC, balcDoor: BDOOR,
  gate: { x: 35.65, z0: -26.35, z1: -25.35 },
  // where she arrives on the map's 家に帰る: on the path inside the gate, facing the door
  arrive: { x: 36.6, z: -25.85, yaw: -Math.PI / 2 },
};

// the rooms (indoorRects; the camera keeps inside the one she stands in)
const ROOMS = [
  { name: 'home-genkan', x0: XI0, x1: XC, z0: ZI0, z1: ZH - PT / 2, y0: DOMA - 0.5, y1: F1 + CH },
  { name: 'home-hall', x0: XC, x1: XB - PT / 2, z0: ZS, z1: ZH - PT / 2, y0: F1 - 0.5, y1: F1 + CH },
  { name: 'home-stairs', x0: XC, x1: XL - PT / 2, z0: ZI0, z1: ZS, y0: F1 - 0.5, y1: F2 + CH },
  { name: 'home-washitsu', x0: XI0, x1: XW - PT / 2, z0: ZH + PT / 2, z1: ZI1, y0: F1 - 0.5, y1: F1 + CH },
  { name: 'home-ldk', x0: XW + PT / 2, x1: XI1, z0: ZH + PT / 2, z1: ZI1, y0: F1 - 0.5, y1: F1 + CH },
  { name: 'home-hall2', x0: XC, x1: XL - PT / 2, z0: ZS, z1: ZH - PT / 2, y0: F2 - 0.5, y1: F2 + CH },
  { name: 'home-landing', x0: STAIR_TOP, x1: XL - PT / 2, z0: ZI0, z1: ZS, y0: F2 - 0.5, y1: F2 + CH },
  { name: 'home-bedroom', x0: XI0, x1: XB - PT / 2, z0: ZH + PT / 2, z1: ZI1, y0: F2 - 0.5, y1: F2 + CH },
];
HOME.rooms = ROOMS;
// in the house (or on the balcony): (x, y, z) feet
HOME.inside = (x, y, z) => ROOMS.some((r) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1 && y > r.y0 && y < r.y1);
HOME.onBalcony = (x, y, z) => x > BALC.x0 && x < BALC.x1 && z > Z1 && z < BALC.z1 && Math.abs(y - BALC.y) < 1;

// colours
const SIDING = 0xf1e9dc, SIDING2 = 0xe6dccb, TRIM = 0x4a4038, ROOF = 0x4b505a, BASE = 0xb9b4aa;
const WALL_IN = 0xf7f3ec, CEIL = new THREE.Color(0xfbf9f4).multiplyScalar(1.22), SKIRT = 0xc9a77e, OAK = 0xd9b88f, OAK_DARK = 0xb58a5c;
const FRAME_C = 0x3f3833; // window and door frames (dark bronze)
const SEAM = 0.002; // how far a wall's piece reaches into its neighbours

// builders
const HB = (ctx, x, z) => ctx.builders.get('home', x, z); // walls, floors, ceilings inside
const TB = (ctx, x, z) => ctx.builders.get('toon', x, z); // outside (casts shadows)
const DB = (ctx, x, z) => ctx.builders.get('detail', x, z); // small outside parts
const EB = (ctx, x, z) => ctx.builders.get('emissive', x, z);
const GB = (ctx, x, z) => ctx.builders.get('glass', x, z);

// a vertical rect on the plane z = c (axis 'x') or x = c (axis 'z'), facing ±dir
function vq(b, axis, c, a0, a1, y0, y1, dir, color, pattern = 0) {
  let p;
  if (axis === 'x') p = [V(a0, y0, c), V(a1, y0, c), V(a1, y1, c), V(a0, y1, c)];
  else p = [V(c, y0, a0), V(c, y0, a1), V(c, y1, a1), V(c, y1, a0)];
  const natural = axis === 'x' ? 1 : -1;
  if (natural === dir) b.quad(p[0], p[1], p[2], p[3], color, pattern);
  else b.quad(p[1], p[0], p[3], p[2], color, pattern);
}
// a horizontal rect facing up (+1) or down (-1)
function hq(b, x0, z0, x1, z1, y, up, color, pattern = 0) {
  const p0 = V(x0, y, z0), p1 = V(x1, y, z0), p2 = V(x1, y, z1), p3 = V(x0, y, z1);
  if (up > 0) b.quad(p0, p3, p2, p1, color, pattern);
  else b.quad(p0, p1, p2, p3, color, pattern);
}
// a solid for walkers between two feet heights
function solid(ctx, x0, z0, x1, z1, yBottom, yTop) {
  return ctx.colliders.addBox((x0 + x1) / 2, (z0 + z1) / 2, Math.abs(x1 - x0) / 2, Math.abs(z1 - z0) / 2, 0, yTop, yBottom);
}
// a floor (feet band round its height, so the floors above and below stay apart)
function floor(ctx, x0, z0, x1, z1, y, prio = 3) {
  ctx.colliders.addSurface(x0, z0, x1, z1, () => y, prio, { min: y - 1.2, max: y + 1.7, under: y > F1 + 1 });
}

// ---------------------------------------------------------------------------- the outer walls
// One outer wall between heights y0 and y1 with openings cut out: the siding outside (toon),
// the room's wall inside ('home', only over the given spans), colliders down to the floor,
// frames, sills and glass. S: { axis, c (outer face), dir (+1: the house on the +side) };
// spans: [[a0, a1, color, pattern]] inside; ops: [{ a0, a1, yb, yt, kind: 'glass' | 'door' |
// 'pane' (opaque, painted) | 'gap' (nothing: the door leaf is built elsewhere), sill, mull }]
function outerWall(ctx, S, A0, A1, y0, y1, ops, spans) {
  const inner = S.c + S.dir * T, mid = S.c + (S.dir * T) / 2;
  const box = (b, a0, a1, yb, yt, o) => (S.axis === 'x' ? b.boxMM(a0, yb, Math.min(S.c, inner), a1, yt, Math.max(S.c, inner), o) : b.boxMM(Math.min(S.c, inner), yb, a0, Math.max(S.c, inner), yt, a1, o));
  const at = (a) => (S.axis === 'x' ? [a, S.c] : [S.c, a]);
  for (const [a0, a1, yb, yt] of wallRects(A0, A1, y0, y1, ops)) {
    const [x, z] = at((a0 + a1) / 2);
    // (the outside skin only: the inside is drawn per room below. Each piece reaches a hair
    // into its neighbours: where three meet in a T the seam would leave pin-holes)
    const ga0 = Math.max(A0, a0 - SEAM), ga1 = Math.min(A1, a1 + SEAM), gyb = Math.max(y0, yb - SEAM), gyt = Math.min(y1, yt + SEAM);
    box(TB(ctx, x, z), ga0, ga1, gyb, gyt, { color: yb < F2 - 0.4 ? SIDING : SIDING2, pattern: PAT.SIDING, skip: S.axis === 'x' ? (S.dir > 0 ? 'Z' : 'z') : S.dir > 0 ? 'X' : 'x' });
    if (yb <= F1 + 0.6 && yt > yb + 0.5) {
      const c = S.axis === 'x' ? ctx.colliders.addSegment(a0, mid, a1, mid, T + 0.04) : ctx.colliders.addSegment(mid, a0, mid, a1, T + 0.04);
      if (c) {
        c.yTop = yt + 0.1;
        c.yBottom = yb - 1.2;
      }
    }
    if (yb >= F2 - 0.6 && yb <= F2 + 0.6 && yt > yb + 0.5) {
      const c = S.axis === 'x' ? ctx.colliders.addSegment(a0, mid, a1, mid, T + 0.04) : ctx.colliders.addSegment(mid, a0, mid, a1, T + 0.04);
      if (c) {
        c.yTop = yt + 0.1;
        c.yBottom = yb - 0.4;
      }
    }
    // the inside face, over the rooms that have it
    for (const [s0, s1, color, pattern] of spans) {
      const ia0 = Math.max(a0, s0), ia1 = Math.min(a1, s1);
      if (ia1 - ia0 < 0.005) continue;
      const [ix, iz] = at((ia0 + ia1) / 2);
      vq(HB(ctx, ix, iz), S.axis, inner, Math.max(s0, ga0), Math.min(s1, ga1), gyb, gyt, S.dir, color, pattern ?? 0);
    }
  }
  // openings: reveals (the wall's thickness inside the hole), frames, sills, glass
  for (const o of ops) {
    const [x, z] = at((o.a0 + o.a1) / 2);
    const d = DB(ctx, x, z), h = HB(ctx, x, z);
    const fr = (a0, a1, yb, yt, dd = 0.07, c = FRAME_C) => (S.axis === 'x' ? d.boxMM(a0, yb, mid - dd / 2, a1, yt, mid + dd / 2, { color: c }) : d.boxMM(mid - dd / 2, yb, a0, mid + dd / 2, yt, a1, { color: c }));
    // reveals: the hole's sides and head across the wall's thickness, painted like the room
    const lo = Math.min(S.c, inner), hi = Math.max(S.c, inner);
    if (S.axis === 'x') {
      h.quad(V(o.a0, o.yb, lo), V(o.a0, o.yb, hi), V(o.a0, o.yt, hi), V(o.a0, o.yt, lo), WALL_IN, 0, { double: true });
      h.quad(V(o.a1, o.yb, hi), V(o.a1, o.yb, lo), V(o.a1, o.yt, lo), V(o.a1, o.yt, hi), WALL_IN, 0, { double: true });
      hq(h, o.a0, lo, o.a1, hi, o.yt, -1, WALL_IN);
    } else {
      h.quad(V(lo, o.yb, o.a0), V(hi, o.yb, o.a0), V(hi, o.yt, o.a0), V(lo, o.yt, o.a0), WALL_IN, 0, { double: true });
      h.quad(V(hi, o.yb, o.a1), V(lo, o.yb, o.a1), V(lo, o.yt, o.a1), V(hi, o.yt, o.a1), WALL_IN, 0, { double: true });
      hq(h, lo, o.a0, hi, o.a1, o.yt, -1, WALL_IN);
    }
    if (o.kind === 'gap') continue;
    // the frame round the hole
    fr(o.a0, o.a1, o.yt - 0.05, o.yt);
    fr(o.a0, o.a0 + 0.05, o.yb, o.yt);
    fr(o.a1 - 0.05, o.a1, o.yb, o.yt);
    if (o.kind === 'door') continue;
    fr(o.a0, o.a1, o.yb, o.yb + 0.05);
    // sashes: two (or more) panes that slide, their meeting stiles
    const n = o.panes ?? Math.max(1, Math.round((o.a1 - o.a0) / 0.9));
    for (let k = 1; k < n; k++) {
      const a = o.a0 + ((o.a1 - o.a0) * k) / n;
      fr(a - 0.025, a + 0.025, o.yb, o.yt, 0.09);
    }
    if (o.kind === 'open') {
      // the open half of a sliding door: its sash slid behind the fixed half (a second pane a
      // few cm inside it)
      const gb = GB(ctx, x, z);
      const uvs = { uvs: [[0, 0], [1, 0], [1, 1], [0, 1]] };
      const m2 = mid + S.dir * 0.05;
      const [s0, s1] = o.behind;
      if (S.axis === 'x') gb.quad(V(s0, o.yb, m2), V(s1, o.yb, m2), V(s1, o.yt, m2), V(s0, o.yt, m2), 0xffffff, 0, uvs);
      else gb.quad(V(m2, o.yb, s0), V(m2, o.yb, s1), V(m2, o.yt, s1), V(m2, o.yt, s0), 0xffffff, 0, uvs);
      for (const a of [s0, s1]) {
        if (S.axis === 'x') d.boxMM(a - 0.025, o.yb, m2 - 0.03, a + 0.025, o.yt, m2 + 0.03, { color: FRAME_C });
        else d.boxMM(m2 - 0.03, o.yb, a - 0.025, m2 + 0.03, o.yt, a + 0.025, { color: FRAME_C });
      }
      continue;
    }
    if (o.kind === 'glass') {
      const gb = GB(ctx, x, z);
      const uvs = { uvs: [[0, 0], [1, 0], [1, 1], [0, 1]] };
      if (S.axis === 'x') gb.quad(V(o.a0, o.yb, mid), V(o.a1, o.yb, mid), V(o.a1, o.yt, mid), V(o.a0, o.yt, mid), 0xffffff, 0, uvs);
      else gb.quad(V(mid, o.yb, o.a0), V(mid, o.yb, o.a1), V(mid, o.yt, o.a1), V(mid, o.yt, o.a0), 0xffffff, 0, uvs);
      // (a pane she can walk through: an open half of a sliding door)
      if (!o.open) {
        const c = S.axis === 'x' ? ctx.colliders.addSegment(o.a0, mid, o.a1, mid, T) : ctx.colliders.addSegment(mid, o.a0, mid, o.a1, T);
        if (c) {
          c.yTop = o.yt;
          c.yBottom = o.yb - 1.2;
        }
      }
    } else if (o.kind === 'pane') {
      // an opaque painted pane (frosted bath and store room windows), glowing some nights
      const wb = ctx.builders.get('window', x, z);
      const uvs = { uvs: [[0, 0], [1, 0], [1, 1], [0, 1]] };
      const out = S.c - S.dir * 0.012;
      if (S.axis === 'x') {
        if (S.dir > 0) wb.quad(V(o.a1, o.yb, out), V(o.a0, o.yb, out), V(o.a0, o.yt, out), V(o.a1, o.yt, out), 0xffffff, o.seed ?? 200, uvs);
        else wb.quad(V(o.a0, o.yb, out), V(o.a1, o.yb, out), V(o.a1, o.yt, out), V(o.a0, o.yt, out), 0xffffff, o.seed ?? 200, uvs);
      } else if (S.dir > 0) wb.quad(V(out, o.yb, o.a0), V(out, o.yb, o.a1), V(out, o.yt, o.a1), V(out, o.yt, o.a0), 0xffffff, o.seed ?? 200, uvs);
      else wb.quad(V(out, o.yb, o.a1), V(out, o.yb, o.a0), V(out, o.yt, o.a0), V(out, o.yt, o.a1), 0xffffff, o.seed ?? 200, uvs);
      // the inside: a frosted pane in the room's light
      const inn = inner - S.dir * 0.03;
      vq(h, S.axis, inn, o.a0, o.a1, o.yb, o.yt, S.dir, 0xe8edf0);
      const c = S.axis === 'x' ? ctx.colliders.addSegment(o.a0, mid, o.a1, mid, T) : ctx.colliders.addSegment(mid, o.a0, mid, o.a1, T);
      if (c) {
        c.yTop = o.yt;
        c.yBottom = o.yb - 1.2;
      }
    }
    // the sill outside (a drip ledge) and inside (a ledge for a vase)
    if (o.yb > F1 + 0.3 && o.yb !== F2) {
      const outer = S.c - S.dir * 0.07;
      if (S.axis === 'x') d.boxMM(o.a0 - 0.05, o.yb - 0.04, Math.min(S.c, outer), o.a1 + 0.05, o.yb, Math.max(S.c, outer), { color: FRAME_C });
      else d.boxMM(Math.min(S.c, outer), o.yb - 0.04, o.a0 - 0.05, Math.max(S.c, outer), o.yb, o.a1 + 0.05, { color: FRAME_C });
      const ledge = inner + S.dir * 0.05;
      if (S.axis === 'x') h.boxMM(o.a0 - 0.04, o.yb - 0.03, Math.min(inner, ledge), o.a1 + 0.04, o.yb, Math.max(inner, ledge), { color: 0xf3eee6 });
      else h.boxMM(Math.min(inner, ledge), o.yb - 0.03, o.a0 - 0.04, Math.max(inner, ledge), o.yb, o.a1 + 0.04, { color: 0xf3eee6 });
    }
  }
}

// an inside wall, painted on both faces (or one colour a side: o.colorA on the -side, o.colorB
// on the +side), with door holes [{ a0, a1, h }]
function partition(ctx, axis, c, a0, a1, y, h, doors = [], o = {}) {
  const t = o.t ?? PT;
  const ops = doors.map((d) => ({ a0: d.a0, a1: d.a1, yb: y, yt: y + (d.h ?? 2.0) }));
  for (const [ra0, ra1, yb, yt] of wallRects(a0, a1, y, y + h, ops)) {
    const b = HB(ctx, axis === 'x' ? (ra0 + ra1) / 2 : c, axis === 'x' ? c : (ra0 + ra1) / 2);
    const cA = o.colorA ?? WALL_IN, cB = o.colorB ?? WALL_IN;
    // (each face a hair bigger than its rect: no pin-holes where the rects meet in a T)
    const qa0 = Math.max(a0, ra0 - SEAM), qa1 = Math.min(a1, ra1 + SEAM), qyb = Math.max(y, yb - SEAM), qyt = Math.min(y + h, yt + SEAM);
    if (axis === 'x') {
      vq(b, 'x', c - t / 2, qa0, qa1, qyb, qyt, -1, cA);
      vq(b, 'x', c + t / 2, qa0, qa1, qyb, qyt, 1, cB);
    } else {
      vq(b, 'z', c - t / 2, qa0, qa1, qyb, qyt, -1, cA);
      vq(b, 'z', c + t / 2, qa0, qa1, qyb, qyt, 1, cB);
    }
    if (yb <= y + 0.01) {
      if (axis === 'x') solid(ctx, ra0, c - t / 2, ra1, c + t / 2, y - 0.5, yt);
      else solid(ctx, c - t / 2, ra0, c + t / 2, ra1, y - 0.5, yt);
    } else {
      const it = axis === 'x' ? solid(ctx, ra0, c - t / 2, ra1, c + t / 2, yb, yt) : solid(ctx, c - t / 2, ra0, c + t / 2, ra1, yb, yt);
      it.ceil = true;
    }
  }
  // door frames (casings both sides), the hole's reveals
  for (const d of doors) {
    const fb = HB(ctx, axis === 'x' ? (d.a0 + d.a1) / 2 : c, axis === 'x' ? c : (d.a0 + d.a1) / 2);
    const top = y + (d.h ?? 2.0);
    const fc = o.frame ?? 0xe9e1d3;
    const fr = (p0, p1, yb, yt, dd) => (axis === 'x' ? fb.boxMM(p0, yb, c - dd / 2, p1, yt, c + dd / 2, { color: fc }) : fb.boxMM(c - dd / 2, yb, p0, c + dd / 2, yt, p1, { color: fc }));
    fr(d.a0 - 0.06, d.a1 + 0.06, top, top + 0.06, t + 0.03);
    fr(d.a0 - 0.06, d.a0, y, top, t + 0.03);
    fr(d.a1, d.a1 + 0.06, y, top, t + 0.03);
    // the head's underside
    if (axis === 'x') hq(fb, d.a0, c - t / 2, d.a1, c + t / 2, top, -1, fc);
    else hq(fb, c - t / 2, d.a0, c + t / 2, d.a1, top, -1, fc);
  }
}

// a skirting board along a wall face (axis, the face's coordinate, from a0 to a1, facing dir)
function skirting(ctx, axis, c, a0, a1, y, dir, color = SKIRT) {
  if (a1 - a0 < 0.02) return;
  const b = HB(ctx, axis === 'x' ? (a0 + a1) / 2 : c, axis === 'x' ? c : (a0 + a1) / 2);
  if (axis === 'x') b.boxMM(a0, y, Math.min(c, c + dir * 0.012), a1, y + 0.07, Math.max(c, c + dir * 0.012), { color, skip: dir > 0 ? 'z' : 'Z' });
  else b.boxMM(Math.min(c, c + dir * 0.012), y, a0, Math.max(c, c + dir * 0.012), y + 0.07, a1, { color, skip: dir > 0 ? 'x' : 'X' });
}

// ---------------------------------------------------------------------------- floors, ceilings
function slabs(ctx) {
  const P = (x0, z0, x1, z1, y, color, pat) => hq(HB(ctx, (x0 + x1) / 2, (z0 + z1) / 2), x0, z0, x1, z1, y, 1, color, pat);
  const C = (x0, z0, x1, z1, y, color = CEIL) => hq(HB(ctx, (x0 + x1) / 2, (z0 + z1) / 2), x0, z0, x1, z1, y, -1, color);
  // 1F: the 土間 (tiles), the hall and LDK (oak), the 和室 (tatami: homedecor.js lays the mats)
  P(XI0, ZI0, XK, ZH - PT / 2, DOMA, 0xcfc8bb, PAT.TILE);
  P(XK, ZI0, XB - PT / 2, ZH - PT / 2, F1, OAK, PAT.PLANKS);
  P(XW + PT / 2, ZH + PT / 2, XI1, ZI1, F1, OAK, PAT.PLANKS);
  P(XB + PT / 2, ZI0, XI1, ZH - PT / 2, F1, 0xd8d8d2, PAT.TILE); // (the bath block, behind its closed door)
  // the 上がり框: the step's face and its edge beam
  const kb = HB(ctx, XK, (ZI0 + ZH) / 2);
  kb.boxMM(XK - 0.02, DOMA, ZI0, XK + 0.06, F1, ZH - PT / 2, { color: OAK_DARK, pattern: PAT.PLANKS, skip: 'Xy' });
  // 1F ceilings (the stairwell rises through both floors)
  C(XI0, ZI0, XC, ZH - PT / 2, F1 + CH);
  C(XC, ZS, XB - PT / 2, ZH - PT / 2, F1 + CH);
  C(XI0, ZH + PT / 2, XW - PT / 2, ZI1, F1 + CH, new THREE.Color(0xd9c4a0).multiplyScalar(1.22)); // (the 和室's board ceiling: homedecor.js adds the battens)
  C(XW + PT / 2, ZH + PT / 2, XI1, ZI1, F1 + CH);
  C(XB + PT / 2, ZI0, XI1, ZH - PT / 2, F1 + CH);
  // 2F floors: hall and landing, bedroom (oak), store and spare rooms (closed)
  P(XC, ZS, XL - PT / 2, ZH - PT / 2, F2, OAK, PAT.PLANKS);
  P(STAIR_TOP, ZI0, XL - PT / 2, ZS, F2, OAK, PAT.PLANKS);
  P(XI0, ZH + PT / 2, XB - PT / 2, ZI1, F2, 0xcfa77a, PAT.PLANKS);
  // 2F ceilings
  C(XC, ZI0, XL - PT / 2, ZH - PT / 2, F2 + CH);
  C(XI0, ZH + PT / 2, XB - PT / 2, ZI1, F2 + CH);
  // the edge of the 2F floor round the stairwell (seen from the stairs)
  const eb = HB(ctx, (XC + STAIR_TOP) / 2, ZS);
  eb.boxMM(XC, F1 + CH, ZS - 0.002, STAIR_TOP, F2, ZS + 0.05, { color: WALL_IN, skip: 'Zy' });
  eb.boxMM(STAIR_TOP - 0.002, F1 + CH + 0.25, ZI0, STAIR_TOP + 0.05, F2, ZS, { color: WALL_IN, skip: 'X' });

  // walkable floors
  floor(ctx, XI0 - 0.02, ZI0, XK, ZH - PT / 2, DOMA);
  floor(ctx, XK, ZI0, XI1, ZI1, F1);
  floor(ctx, XI0, ZH - PT / 2, XK, ZI1, F1);
  floor(ctx, XI0, ZI0, XI1, ZI1, F2);
  // the balcony
  floor(ctx, BALC.x0, Z1 - T, BALC.x1, BALC.z1, BALC.y);
}

// ---------------------------------------------------------------------------- the stairs
// Oak treads on white risers, open on the hall's side above a panelled cupboard (階段下収納),
// a wall rail on the north wall, balusters and a rail on the open side and along the
// stairwell's edge upstairs
function stairs(ctx) {
  const { x0, n, run, z0, z1 } = ST;
  const b = HB(ctx, (x0 + STAIR_TOP) / 2, (z0 + z1) / 2);
  for (let i = 0; i < n; i++) {
    const xa = x0 + i * run, top = F1 + (i + 1) * RISE;
    const last = i === n - 1;
    // the riser (white) and the tread (oak, with a nosing)
    b.boxMM(xa, top - RISE, z0, xa + 0.02, top - 0.03, z1, { color: 0xf4f0e8, skip: 'X' });
    if (!last) b.boxMM(xa - 0.02, top - 0.035, z0, xa + run, top, z1 + 0.015, { color: OAK, pattern: PAT.PLANKS });
  }
  // the stringer on the open side and its underside up to the landing
  const yAt = (x) => F1 + ((x - x0) / (STAIR_TOP - x0)) * (F2 - F1 - RISE) + RISE;
  // the stringer on the open side: a sloped board, its top edge
  const xs0 = x0 - 0.02, xs1 = STAIR_TOP;
  const ys0 = yAt(xs0), ys1 = yAt(xs1);
  b.quad(V(xs0, ys0 - 0.32, z1 + 0.03), V(xs1, ys1 - 0.32, z1 + 0.03), V(xs1, ys1 + 0.03, z1 + 0.03), V(xs0, ys0 + 0.03, z1 + 0.03), 0xf4f0e8);
  b.quad(V(xs0, ys0 + 0.03, z1 + 0.03), V(xs1, ys1 + 0.03, z1 + 0.03), V(xs1, ys1 + 0.03, z1), V(xs0, ys0 + 0.03, z1), 0xf4f0e8);
  // under the flight on the hall side: a panelled wall closing the cupboard, from where the
  // steps are higher than a knee
  const cx0 = x0 + 3 * run;
  b.quad(V(cx0, F1, z1 + 0.035), V(STAIR_TOP, F1, z1 + 0.035), V(STAIR_TOP, yAt(STAIR_TOP) - 0.32, z1 + 0.035), V(cx0, yAt(cx0) - 0.32, z1 + 0.035), WALL_IN);
  b.boxMM(cx0 - 0.03, F1, z1, cx0, yAt(cx0) - 0.32, z1 + 0.04, { color: WALL_IN });
  // its little door (a hinged panel, a knob)
  const dx0 = x0 + 7 * run, dx1 = dx0 + 0.62;
  b.boxMM(dx0, F1 + 0.08, z1 + 0.035, dx1, F1 + 1.05, z1 + 0.05, { color: 0xf0ebe2 });
  b.boxMM(dx1 - 0.1, F1 + 0.55, z1 + 0.05, dx1 - 0.06, F1 + 0.59, z1 + 0.075, { color: 0xb9a27c });
  skirting(ctx, 'x', z1 + 0.035, cx0, STAIR_TOP + 0.3, F1, 1);
  // the cupboard keeps walkers out from under the steps
  solid(ctx, cx0, z0, XB, z1 + 0.05, F1 - 0.5, F1 + 0.6);
  // walls of the stairwell: the north wall (outer), the store room's wall at the bottom (2F)
  // the treads underfoot
  ctx.colliders.addSurface(x0, z0, STAIR_TOP, z1, (x) => F1 + Math.min(n - 1, Math.max(1, Math.floor((x - x0) / run) + 1)) * RISE, 4, { min: F1 - 0.7, max: F2 + 0.7, under: false });
  // handrails: on the north wall (brackets), and over balusters on the open side
  const RAIL = 0x8b6a48;
  const railY = 0.86;
  b.rod(V(x0 - 0.1, F1 + railY + 0.05, z0 + 0.06), V(STAIR_TOP + 0.2, F2 + railY, z0 + 0.06), 0.022, 0.022, 8, RAIL);
  for (let k = 1; k < 4; k++) {
    const x = x0 + (k / 4) * (STAIR_TOP - x0);
    const y = yAt(x) + railY - 0.02;
    b.box(x, y - 0.02, z0 + 0.03, 0.02, 0.05, 0.06, { color: 0x9a9a96 });
  }
  const zr = z1 + 0.02;
  const r0 = V(x0 + 0.1, yAt(x0 + 0.1) + railY, zr), r1 = V(STAIR_TOP, yAt(STAIR_TOP) + railY, zr);
  b.rod(r0, r1, 0.026, 0.026, 8, RAIL);
  // the newel post at the foot
  b.box(x0 + 0.08, F1 + 0.55, zr, 0.09, 1.1, 0.09, { color: RAIL });
  b.box(x0 + 0.08, F1 + 1.12, zr, 0.11, 0.04, 0.11, { color: 0x7a5a3c });
  for (let i = 1; i < n - 1; i++) {
    const x = x0 + i * run + run / 2;
    const yb = F1 + (i + 1) * RISE;
    b.box(x, (yb + yAt(x) + railY) / 2, zr, 0.03, yAt(x) + railY - yb, 0.03, { color: 0xf2eee6 });
  }
  // nobody falls off the open side (a rail as high as a hip)
  for (let i = 0; i < n - 1; i++) {
    const xa = x0 + i * run, top = F1 + (i + 1) * RISE;
    const it = solid(ctx, xa, z1, xa + run, z1 + 0.06, top - 0.6, top + 1.0);
    it.yBottom = top - 0.5;
  }
  // upstairs: the stairwell's edge along the hall, balusters and a rail
  const ez = ZS + 0.03;
  b.box((XC + STAIR_TOP) / 2, F2 + 0.9, ez, STAIR_TOP - XC, 0.05, 0.07, { color: RAIL });
  b.box((XC + STAIR_TOP) / 2, F2 + 0.03, ez, STAIR_TOP - XC, 0.06, 0.07, { color: OAK_DARK });
  for (let x = XC + 0.12; x < STAIR_TOP - 0.05; x += 0.12) b.box(x, F2 + 0.47, ez, 0.03, 0.82, 0.03, { color: 0xf2eee6 });
  const it2 = solid(ctx, XC, ZS - 0.02, STAIR_TOP, ZS + 0.08, F2 - 0.3, F2 + 1.0);
  it2.yBottom = F2 - 0.3;
}

// ---------------------------------------------------------------------------- the walls
function walls(ctx) {
  const yLow = Math.min(groundH(X0, Z1), groundH(X1, Z1)) - 0.25;
  // the foundation (concrete, showing more on the downhill side): a ring of footing walls (the
  // doorway left open down to the 土間), a slab under the house
  const fb = TB(ctx, (X0 + X1) / 2, (Z0 + Z1) / 2);
  const FND = { color: BASE, pattern: PAT.CONCRETE };
  const yTopF = F1 - 0.05;
  fb.boxMM(X0 - 0.04, yLow, Z0 - 0.04, X1 + 0.04, yTopF, Z0 + 0.16, FND);
  fb.boxMM(X0 - 0.04, yLow, Z1 - 0.16, X1 + 0.04, yTopF, Z1 + 0.04, FND);
  fb.boxMM(X1 - 0.16, yLow, Z0 + 0.16, X1 + 0.04, yTopF, Z1 - 0.16, FND);
  fb.boxMM(X0 - 0.04, yLow, Z0 + 0.16, X0 + 0.16, yTopF, DOOR.z0, FND);
  fb.boxMM(X0 - 0.04, yLow, DOOR.z1, X0 + 0.16, yTopF, Z1 - 0.16, FND);
  fb.boxMM(X0 - 0.04, yLow, DOOR.z0, X0 + 0.16, DOMA - 0.02, DOOR.z1, FND);
  fb.boxMM(X0 + 0.16, yLow, Z0 + 0.16, X1 - 0.16, DOMA - 0.12, Z1 - 0.16, { color: BASE, skip: 'xXzZy' });
  // the 土間's walls run down to its floor (the house's walls start a step higher)
  const gb2 = HB(ctx, X0 + 0.6, -25.6);
  vq(gb2, 'z', XI0, ZI0, DOOR.z0, DOMA, F1, 1, WALL_IN);
  vq(gb2, 'z', XI0, DOOR.z1, ZH - PT / 2, DOMA, F1, 1, WALL_IN);
  vq(gb2, 'x', ZI0, XI0, XK, DOMA, F1, 1, WALL_IN);
  vq(gb2, 'x', ZH - PT / 2, XI0, XK, DOMA, F1, -1, WALL_IN);
  skirting(ctx, 'z', XI0, ZI0, DOOR.z0, DOMA, 1, 0x8d8780);
  skirting(ctx, 'z', XI0, DOOR.z1, ZH - PT / 2, DOMA, 1, 0x8d8780);
  skirting(ctx, 'x', ZH - PT / 2, XI0, XK, DOMA, -1, 0x8d8780);
  // the band between the floors (outside: a trim round the walls, set into their thickness
  // and no further, so it never shows inside)
  const tb = TB(ctx, (X0 + X1) / 2, (Z0 + Z1) / 2);
  const BAND = { color: 0xd8cfc0 }, by0 = F2 - 0.36, by1 = F2 - 0.28, e = 0.03, inW = 0.06;
  tb.boxMM(X0 - e, by0, Z0 - e, X1 + e, by1, Z0 + inW, BAND);
  tb.boxMM(X0 - e, by0, Z1 - inW, X1 + e, by1, Z1 + e, BAND);
  tb.boxMM(X0 - e, by0, Z0 + inW, X0 + inW, by1, Z1 - inW, BAND);
  tb.boxMM(X1 - inW, by0, Z0 + inW, X1 + e, by1, Z1 - inW, BAND);
  // the doorway's frame and threshold (the leaf itself turns: systems/home.js)
  const W = { axis: 'z', c: X0, dir: 1 };
  const E = { axis: 'z', c: X1, dir: -1 };
  const N = { axis: 'x', c: Z0, dir: 1 };
  const S = { axis: 'x', c: Z1, dir: -1 };
  const glass = (a0, a1, yb, yt, o = {}) => ({ a0, a1, yb, yt, kind: 'glass', ...o });
  const pane = (a0, a1, yb, yt, o = {}) => ({ a0, a1, yb, yt, kind: 'pane', ...o });
  // west (the street side): front door, the 和室's window; upstairs the store room's and her
  // bedroom's windows
  outerWall(ctx, W, Z0, Z1, F1 - 0.05, F2, [
    { a0: DOOR.z0, a1: DOOR.z1, yb: DOMA, yt: DOMA + DOOR.h, kind: 'gap' },
    pane(-25.22, -25.06, DOMA + 0.35, DOMA + 1.95, { panes: 1, seed: 40 }),
    glass(-23.25, -21.55, F1 + 0.85, F1 + 1.95),
  ], [[ZI0, ZH - PT / 2, WALL_IN], [ZH + PT / 2, ZI1, 0xe9dcc4]]);
  outerWall(ctx, W, Z0, Z1, F2, TOP, [
    pane(-26.25, -25.65, F2 + 1.0, F2 + 1.6, { panes: 1 }),
    glass(-23.45, -21.65, F2 + 0.85, F2 + 2.0),
  ], [[ZH + PT / 2, ZI1, 0xf6ece6]]);
  // south (the garden): the 和室's window, the LDK's windows; her balcony door and window
  outerWall(ctx, S, X0, X1, F1 - 0.05, F2, [
    glass(39.85, 41.55, F1 + 0.85, F1 + 1.95),
    glass(42.55, 43.95, F1 + 0.85, F1 + 2.05),
    glass(44.45, 46.35, F1, F1 + 2.05),
  ], [[XI0, XW - PT / 2, 0xe9dcc4], [XW + PT / 2, XI1, WALL_IN]]);
  outerWall(ctx, S, X0, X1, F2, TOP, [
    glass(BDOOR.x0, (BDOOR.x0 + BDOOR.x1) / 2, F2, F2 + 2.05, { panes: 1 }),
    { a0: (BDOOR.x0 + BDOOR.x1) / 2, a1: BDOOR.x1, yb: F2, yt: F2 + 2.05, kind: 'open', behind: [BDOOR.x0 + 0.03, (BDOOR.x0 + BDOOR.x1) / 2 + 0.03] },
    glass(43.0, 44.25, F2 + 0.9, F2 + 1.95),
    pane(45.6, 46.8, F2 + 0.9, F2 + 1.9),
  ], [[XI0, XB - PT / 2, 0xf6ece6]]);
  // east (the neighbour's side): the dining window; the bath's and the spare room's
  outerWall(ctx, E, Z0, Z1, F1 - 0.05, F2, [
    pane(-26.3, -25.55, F1 + 1.2, F1 + 1.8, { panes: 1 }),
    glass(-23.3, -21.9, F1 + 0.9, F1 + 1.9),
  ], [[ZH + PT / 2, ZI1, WALL_IN]]);
  outerWall(ctx, E, Z0, Z1, F2, TOP, [pane(-23.6, -22.4, F2 + 0.9, F2 + 1.9), pane(-26.2, -25.6, F2 + 1.1, F2 + 1.7, { panes: 1 })], []);
  // north (the neighbour's side): the toilet's window, a window lighting the stairwell
  outerWall(ctx, N, X0, X1, F1 - 0.05, F2, [pane(45.9, 46.5, F1 + 1.3, F1 + 1.9, { panes: 1 })], [[XI0, XC, WALL_IN], [XC, XB - PT / 2, WALL_IN]]);
  outerWall(ctx, N, X0, X1, F2, TOP, [glass(42.45, 43.55, F2 + 0.7, F2 + 1.6)], [[XC, XL - PT / 2, WALL_IN]]);
  // the stairwell's north wall between the floors (inside, behind the treads)
  vq(HB(ctx, (XC + XL) / 2, ZI0), 'x', ZI0, XC, XL - PT / 2, F1 + CH, F2, 1, WALL_IN);

  // the partitions, 1F: entrance and hall | 和室 and LDK (the LDK's door), 和室 | LDK (fusuma
  // open), the bath block (its door shut), the entrance | stairs (open)
  partition(ctx, 'x', ZH, XI0, XW, F1, CH, [], { colorB: 0xe9dcc4 });
  partition(ctx, 'x', ZH, XW, XI1, F1, CH, [{ a0: 43.82, a1: 44.55, h: 2.0 }], { colorB: WALL_IN });
  partition(ctx, 'z', XW, ZH + PT / 2, ZI1, F1, CH, [{ a0: -24.0, a1: -22.25, h: 1.8 }], { colorA: 0xe9dcc4, frame: 0x7a5a3e });
  partition(ctx, 'z', XB, ZI0, ZH - PT / 2, F1, CH, [], {});
  // the 土間 side of the entrance | 和室: nothing more (the ZH wall); the doma's south wall
  // 2F: hall | bedroom (her door), hall | spare room (shut), bedroom | spare room, the landing
  // | store room, the store room over the entrance
  partition(ctx, 'x', ZH, XC, XI1, F2, CH, [{ a0: 42.6, a1: 43.35, h: 2.0 }], { colorB: 0xf6ece6 });
  partition(ctx, 'x', ZH, XI0, XC, F2, CH, [], { colorB: 0xf6ece6 });
  partition(ctx, 'z', XB, ZH + PT / 2, ZI1, F2, CH, [], { colorA: 0xf6ece6 });
  partition(ctx, 'z', XL, ZI0, ZH - PT / 2, F2, CH, [], {});
  partition(ctx, 'z', XC, ZI0, ZH - PT / 2, F2, CH, [], {});

  // skirting boards round the rooms
  const sk = (axis, c, a0, a1, y, dir, color) => skirting(ctx, axis, c, a0, a1, y, dir, color);
  // LDK
  sk('x', ZH + PT / 2, XW + PT / 2, 43.76, F1, 1);
  sk('x', ZH + PT / 2, 44.61, XI1, F1, 1);
  sk('x', ZI1, XW + PT / 2, 44.45, F1, -1);
  sk('x', ZI1, 46.35, XI1, F1, -1);
  sk('z', XI1, ZH + PT / 2, ZI1, F1, -1);
  sk('z', XW + PT / 2, ZH + PT / 2, -24.06, F1, 1);
  sk('z', XW + PT / 2, -22.19, ZI1, F1, 1);
  // hall and entrance
  sk('x', ZH - PT / 2, XK + 0.06, 43.76, F1, -1);
  sk('z', XB - PT / 2, ZS, ZH - PT / 2, F1, -1);
  // bedroom
  sk('x', ZH + PT / 2, XI0, 42.54, F2, 1, 0xd8b98f);
  sk('x', ZH + PT / 2, 43.41, XB - PT / 2, F2, 1, 0xd8b98f);
  sk('z', XI0, ZH + PT / 2, ZI1, F2, 1, 0xd8b98f);
  sk('z', XB - PT / 2, ZH + PT / 2, ZI1, F2, -1, 0xd8b98f);
  sk('x', ZI1, XI0, BDOOR.x0, F2, -1, 0xd8b98f);
  sk('x', ZI1, BDOOR.x1, XB - PT / 2, F2, -1, 0xd8b98f);
  // 2F hall
  sk('x', ZH - PT / 2, XC, 42.54, F2, -1);
  sk('x', ZH - PT / 2, 43.41, XL - PT / 2, F2, -1);
}

// ---------------------------------------------------------------------------- outside
function roofAndTrim(ctx) {
  const b = TB(ctx, (X0 + X1) / 2, (Z0 + Z1) / 2);
  gableRoof(b, (X0 + X1) / 2, (Z0 + Z1) / 2, X1 - X0, Z1 - Z0, TOP, { color: ROOF, slope: 0.42, ox: 0.5, oz: 0.55, fascia: 0xe9e5dc, wallColor: SIDING2, wallPattern: PAT.SIDING, pattern: PAT.SEAM, soffit: 0xe6e0d4 });
  // gutters along both eaves, downpipes at the corners
  const d = DB(ctx, (X0 + X1) / 2, (Z0 + Z1) / 2);
  const yE = TOP - 0.55 * 0.42;
  for (const z of [Z0 - 0.62, Z1 + 0.62]) d.boxMM(X0 - 0.5, yE - 0.12, z - 0.06, X1 + 0.5, yE - 0.02, z + 0.06, { color: 0x6b6863 });
  for (const [x, z] of [[X0 + 0.15, Z1 + 0.06], [X1 - 0.15, Z1 + 0.06], [X1 - 0.15, Z0 - 0.06]]) {
    d.box(x, (groundH(x, z) + yE) / 2, z, 0.07, yE - groundH(x, z), 0.07, { color: 0x6b6863 });
    d.box(x, yE - 0.15, (z + (z > -23 ? Z1 + 0.62 : Z0 - 0.62)) / 2, 0.07, 0.07, 0.6, { color: 0x6b6863 });
  }
  // the AC's outdoor units on the east side, a meter box and the gas meter on the north
  acUnit(b, X1 + 0.32, groundH(X1 + 0.32, -23.0), -23.0, -Math.PI / 2);
  acUnit(b, X1 + 0.32, groundH(X1 + 0.32, -21.6), -21.6, -Math.PI / 2);
  d.boxMM(X1, F1 + 0.6, -25.0, X1 + 0.12, F1 + 1.05, -24.6, { color: 0xd9d6cf });
  d.boxMM(44.0, F1 + 0.3, Z0 - 0.14, 44.35, F1 + 0.75, Z0, { color: 0xcfcbc2 });
  // the balcony: a floor slab out over the garden, a solid wall round it with a rail on top
  const bb = TB(ctx, (BALC.x0 + BALC.x1) / 2, Z1 + 0.5);
  bb.boxMM(BALC.x0 - 0.1, BALC.y - 0.2, Z1, BALC.x1 + 0.1, BALC.y, BALC.z1 + 0.1, { color: 0xb9b6ae, pattern: PAT.CONCRETE });
  const pH = 1.0, pT = 0.12;
  const wallRun = (x0, z0, x1, z1) => {
    bb.boxMM(x0, BALC.y - 0.2, z0, x1, BALC.y + pH, z1, { color: SIDING, pattern: PAT.SIDING });
    bb.boxMM(x0 - 0.02, BALC.y + pH, z0 - 0.02, x1 + 0.02, BALC.y + pH + 0.04, z1 + 0.02, { color: 0x8c8a85 });
    solid(ctx, x0, z0, x1, z1, BALC.y - 1, BALC.y + 1.6);
  };
  wallRun(BALC.x0 - 0.1, BALC.z1 - pT + 0.1, BALC.x1 + 0.1, BALC.z1 + 0.1);
  wallRun(BALC.x0 - 0.1, Z1, BALC.x0 - 0.1 + pT, BALC.z1);
  wallRun(BALC.x1 + 0.1 - pT, Z1, BALC.x1 + 0.1, BALC.z1);
  // its floor (FRP grey) inside the walls
  hq(bb, BALC.x0 - 0.1 + pT, Z1, BALC.x1 + 0.1 - pT, BALC.z1 + 0.1 - pT, BALC.y + 0.001, 1, 0x9fa2a3, PAT.CONCRETE);
  // the inner faces of its walls (painted)
  vq(bb, 'x', BALC.z1 + 0.1 - pT - 0.001, BALC.x0 - 0.1 + pT, BALC.x1 + 0.1 - pT, BALC.y, BALC.y + pH, -1, 0xe9e4da);
  vq(bb, 'z', BALC.x0 - 0.1 + pT + 0.001, Z1, BALC.z1 + 0.1 - pT, BALC.y, BALC.y + pH, 1, 0xe9e4da);
  vq(bb, 'z', BALC.x1 + 0.1 - pT - 0.001, Z1, BALC.z1 + 0.1 - pT, BALC.y, BALC.y + pH, -1, 0xe9e4da);
  // the laundry pole on brackets under the eaves (two towels on it)
  const pole = DB(ctx, (BALC.x0 + BALC.x1) / 2, BALC.z1);
  for (const x of [BALC.x0 + 0.25, BALC.x1 - 0.25]) pole.box(x, F2 + 1.95, Z1 + 0.33, 0.04, 0.3, 0.04, { color: 0xb5b5b0 });
  pole.rod(V(BALC.x0 + 0.1, F2 + 1.82, Z1 + 0.42), V(BALC.x1 - 0.1, F2 + 1.82, Z1 + 0.42), 0.017, 0.017, 6, 0xd9d9d4);
  pole.box(BALC.x0 + 0.95, F2 + 1.55, Z1 + 0.42, 0.42, 0.55, 0.012, { color: 0xf2c6c8 });
  pole.box(BALC.x0 + 1.5, F2 + 1.5, Z1 + 0.42, 0.36, 0.62, 0.012, { color: 0xbfe0e8 });
  // the front door's porch: a canopy, a downlight, the porch tiles and a step down
  const pb = TB(ctx, X0 - 0.6, -25.85);
  pb.boxMM(X0 - 1.25, DOMA + 2.42, DOOR.z0 - 0.55, X0, DOMA + 2.52, DOOR.z1 + 0.55, { color: TRIM });
  EB(ctx, X0 - 0.6, -25.85).box(X0 - 0.62, DOMA + 2.405, (DOOR.z0 + DOOR.z1) / 2, 0.14, 0.02, 0.14, { color: 0xffe8c0 });
  // (the downlight in the canopy, its pool on the porch tiles)
  ctx.lamps.push({ x: X0 - 0.62, y: DOMA + 2.38, z: (DOOR.z0 + DOOR.z1) / 2, r: 2.2, color: 0xffd9a0, floor: PORCH });
  // a wooden accent wall round the entrance (a nod to the street)
  const ab = TB(ctx, X0, -25.85);
  ab.boxMM(X0 - 0.03, DOMA + 0.05, DOOR.z0 - 0.62, X0, DOMA + 2.42, DOOR.z0 - 0.02, { color: 0x9a6f4c, pattern: PAT.BOARDS });
  ab.boxMM(X0 - 0.03, DOMA + 0.05, DOOR.z1 + 0.02, X0, DOMA + 2.42, DOOR.z1 + 0.42, { color: 0x9a6f4c, pattern: PAT.BOARDS });
  // the house number by the door
  ab.boxMM(X0 - 0.045, DOMA + 1.62, DOOR.z1 + 0.14, X0 - 0.03, DOMA + 1.78, DOOR.z1 + 0.32, { color: 0xf5f1e8 });
  const pz0 = DOOR.z0 - 0.55, pz1 = DOOR.z1 + 0.55;
  pb.boxMM(X0 - 1.3, groundH(X0 - 1, -25.85) - 0.2, pz0, X0, PORCH, pz1, { color: 0x8e8a83, pattern: PAT.TILE });
  // the step down onto the path
  const gy = groundH(X0 - 1.6, -25.85) + 0.03;
  pb.boxMM(X0 - 1.62, gy - 0.1, pz0 + 0.1, X0 - 1.3, (gy + PORCH) / 2, pz1 - 0.1, { color: 0x9a968f, pattern: PAT.TILE });
  ctx.colliders.addSurface(X0 - 1.3, pz0, X0, pz1, () => PORCH, 2);
  ctx.colliders.addSurface(X0 - 1.62, pz0 + 0.1, X0 - 1.3, pz1 - 0.1, () => (gy + PORCH) / 2, 2);
  // the doorway: tiles under the leaf, the sill
  pb.boxMM(X0, DOMA - 0.1, DOOR.z0, XI0, DOMA + 0.015, DOOR.z1, { color: 0x6f6a64 });
  ctx.colliders.addSurface(X0 - 0.02, DOOR.z0, XI0 + 0.02, DOOR.z1, () => DOMA, 3, { min: DOMA - 1.2, max: DOMA + 1.7 });
}

// ---------------------------------------------------------------------------- the yard
function yardAndWalls(ctx) {
  const t = TB(ctx, (LOT.x0 + LOT.x1) / 2, (LOT.z0 + LOT.z1) / 2);
  const yFn = (x, z) => groundH(x, z);
  // the ground: gravel round the house, a lawn in the front garden and the south strip, the
  // approach in paving, a concrete pad under the bicycle port
  ctx.ground.rect(LOT.x0, LOT.z0, LOT.x1, LOT.z1, 0xbdb7ab, PAT.GRAVEL);
  ctx.ground.rect(35.8, -23.4, X0 - 0.05, -18.3, 0x8fb365, PAT.GRASS);
  ctx.ground.rect(X0 - 0.05, Z1 + 0.05, LOT.x1 - 0.3, -18.3, 0x8fb365, PAT.GRASS);
  ctx.ground.rect(35.6, -26.45, X0 - 1.25, -25.25, 0xd3cbbb, PAT.PAVING);
  ctx.ground.rect(35.6, -25.15, X0 - 0.4, -23.55, 0xc8c4bb, PAT.CONCRETE);
  // the front wall (block, a low hedge behind it on the garden side), with the gate and the
  // bicycle port's opening; the other three sides
  const W = { color: 0xd3cdbf };
  const wallZ = [[LOT.z0, -26.4], [-25.27, -25.2], [-23.5, LOT.z1]];
  for (const [za, zb] of wallZ) {
    blockWall(t, 35.65, za, 35.65, zb, yFn, 0.95, W);
    const c = ctx.colliders.addSegment(35.65, za, 35.65, zb, 0.25);
    if (c) c.yTop = 99;
  }
  hedge(t, 35.95, -23.3, 35.95, -18.4, yFn, 0.75);
  // gate posts (tile-clad), the nameplate 「桜井」, the intercom and the post box
  const post = (z) => {
    const y = groundH(35.65, z);
    t.box(35.65, y + 0.65, z, 0.32, 1.3, 0.32, { color: 0xa69d90, pattern: PAT.TILE });
    t.box(35.65, y + 1.32, z, 0.36, 0.04, 0.36, { color: 0x6c655d });
    ctx.colliders.addBox(35.65, z, 0.17, 0.17, 0, 99);
  };
  post(-26.52);
  post(-25.18);
  const uv = ctx.atlas2.draw('home:nameplate', 128, 192, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#fbf8f1');
    g.addColorStop(1, '#ece6da');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    c.strokeStyle = '#7a6a58';
    c.lineWidth = 6;
    c.strokeRect(3, 3, w - 6, h - 6);
    c.fillStyle = '#2b2622';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    fitText(c, '桜', w * 0.8, h * 0.4, FONTS.mincho ?? FONTS.gothic, '700');
    c.fillText('桜', w / 2, h * 0.3);
    c.fillText('井', w / 2, h * 0.7);
  });
  // (the plate faces the street, on a dark wooden board on the post's face)
  const ny = groundH(35.65, -25.18) + 0.82;
  t.boxMM(35.478, ny - 0.01, -25.29, 35.49, ny + 0.31, -25.07, { color: 0x6c5a48 });
  const sb = ctx.builders.get('sign2', 35.5, -25.18);
  sb.quad(V(35.4765, ny, -25.28), V(35.4765, ny, -25.08), V(35.4765, ny + 0.3, -25.08), V(35.4765, ny + 0.3, -25.28), 0xffffff, 0, { uvs: [[uv.u0, uv.v0], [uv.u1, uv.v0], [uv.u1, uv.v1], [uv.u0, uv.v1]] });
  // the intercom (a camera behind dark glass, the speaker's slots, the bell button) and the
  // post box set into the left post
  const iy = groundH(35.65, -26.52);
  const ib = DB(ctx, 35.47, -26.52);
  t.boxMM(35.465, iy + 0.9, -26.57, 35.49, iy + 1.06, -26.47, { color: 0xd9d6cf });
  ib.boxMM(35.4635, iy + 0.995, -26.555, 35.465, iy + 1.048, -26.485, { color: 0x1d1e22 });
  ib.boxMM(35.4628, iy + 1.014, -26.527, 35.4635, iy + 1.026, -26.513, { color: 0x34405c });
  for (let k = 0; k < 3; k++) ib.boxMM(35.4642, iy + 0.958 + k * 0.009, -26.545, 35.465, iy + 0.962 + k * 0.009, -26.495, { color: 0x8f8c86 });
  ib.boxMM(35.4625, iy + 0.912, -26.535, 35.465, iy + 0.938, -26.505, { color: 0xbfbcb5 });
  t.box(35.48, iy + 0.62, -26.52, 0.03, 0.18, 0.26, { color: 0xbfb8aa });
  t.box(35.47, iy + 0.67, -26.52, 0.012, 0.025, 0.2, { color: 0x3d3a36 });
  // a light on the gate post (a small lantern)
  t.box(35.65, iy + 1.42, -26.52, 0.14, 0.18, 0.14, { color: 0x3b3a38 });
  EB(ctx, 35.65, -26.52).box(35.65, iy + 1.42, -26.52, 0.1, 0.12, 0.155, { color: 0xffe2b0 });
  ctx.lamps.push({ x: 36.1, y: iy, z: -25.85, r: 1.8, color: 0xffd9a0 });
  // the side and back walls
  const side = (x0, z0, x1, z1, h) => {
    blockWall(t, x0, z0, x1, z1, yFn, h, { color: 0xc9c3b6 });
    const c = ctx.colliders.addSegment(x0, z0, x1, z1, 0.25);
    if (c) c.yTop = 99;
  };
  side(35.9, -27.55, 48.3, -27.55, 1.35);
  side(48.38, -27.55, 48.38, -18.13, 1.22);
  side(35.9, -18.13, 48.3, -18.13, 1.08);
  // the bicycle port: two posts and a clear roof sloping back
  const bp = { x0: 35.95, x1: X0 - 0.5, z0: -25.1, z1: -23.55 };
  const by = groundH(37, -24.3);
  const d = DB(ctx, 37, -24.3);
  for (const x of [bp.x0 + 0.08, bp.x1 - 0.08]) {
    d.box(x, by + 1.1, bp.z1 - 0.05, 0.08, 2.2, 0.08, { color: 0x6f6b66 });
    ctx.colliders.addBox(x, bp.z1 - 0.05, 0.06, 0.06, 0, 99);
  }
  d.boxMM(bp.x0, by + 2.16, bp.z1 - 0.1, bp.x1, by + 2.24, bp.z1, { color: 0x6f6b66 });
  d.boxMM(bp.x0, by + 2.3, bp.z0 - 0.1, bp.x1, by + 2.36, bp.z0, { color: 0x6f6b66 });
  const g = GB(ctx, 37, -24.3);
  g.quad(V(bp.x0, by + 2.24, bp.z1), V(bp.x1, by + 2.24, bp.z1), V(bp.x1, by + 2.36, bp.z0), V(bp.x0, by + 2.36, bp.z0), 0xffffff, 0, { uvs: [[0, 0], [1, 0], [1, 1], [0, 1]], double: true });
  // the front garden: a small cherry tree, flowers along the hedge, stepping stones, pots
  ctx.trees.push({ kind: 'sakuraSmall', x: 37.35, z: -20.55, seed: 41421, scale: 0.95 });
  ctx.trees.push({ kind: 'shrubTree', x: 47.7, z: -18.9, seed: 7121, scale: 0.85 });
  const fr = new RNG(9001);
  for (let i = 0; i < 7; i++) {
    const z = -22.9 + i * 0.66, x = 36.35 + (i % 2) * 0.14;
    shrub(x, groundH(x, z) + 0.2, z, 0.3, 0.22, fr, { flowers: GARDEN_FLOWERS, flowerCards: 3 });
  }
  for (const [x, z] of [[38.3, -22.9], [38.0, -22.25], [38.35, -21.6]]) t.cyl(x, groundH(x, z) + 0.015, z, 0.2, 0.2, 0.04, 10, 0xb5aea2, PAT.STONE);
  potPlant(t, X0 - 1.1, PORCH, DOOR.z1 + 0.32, new RNG(3101), 1.1);
  potPlant(t, X0 - 1.1, PORCH, DOOR.z0 - 0.32, new RNG(3307), 0.9);
  // the garden on the south side: a garden light at night
  ctx.lamps.push({ x: 41.5, y: groundH(41.5, -19.2), z: -19.2, r: 1.4, color: 0xffe1b0 });
  // the overhead line from the pole at the corner lands on the eaves here
  ctx.dropPoints.push({ x: 39.6, y: TOP - 0.4, z: Z1 + 0.2 });
}

// ---------------------------------------------------------------------------- the lot builder
export function buildHome(ctx) {
  slabs(ctx);
  walls(ctx);
  stairs(ctx);
  roofAndTrim(ctx);
  yardAndWalls(ctx);
  (ctx.indoorRects = ctx.indoorRects || []).push(...ROOMS.map((r) => ({ ...r })));
  ctx.home = HOME;
  // the interiors' contents (and the interactable spots)
  furnish(ctx, HOME);
}
