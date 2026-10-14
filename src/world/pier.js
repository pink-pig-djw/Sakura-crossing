import * as THREE from 'three';
import { PAT } from '../core/builder.js';
import { RNG } from '../core/rng.js';
import { terrainH, PIER, BREAKWATER } from './layout.js';
import { HARBOR } from './routeplan.js';
import { benchAt } from './coast.js';
import { FONTS, drawBoard } from '../render/atlas.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ---------------------------------------------------------------------------
// さくら桟橋: a wooden pier on piles out from the promenade over the beach into the sea, white
// railings and lantern lamps along it, a T-head with benches and the boat hire hut at its end,
// and stairs down to a floating landing (浮き桟橋) where the boat ties up. A second landing in
// the fishing harbour (stairs down the quay to a pontoon) is the other place to come ashore.
// Built in its own batches ('pier', 'pierGlow') so the sea can mirror it (render/reflection.js)
// ---------------------------------------------------------------------------
const WOOD = 0x8a6a4e, WOOD_DK = 0x5c4636, DECK = 0xa58462, WHITE = 0xf2efe6, IRON = 0x2b2d31;
// the floating landings' deck height over the (mean) sea
export const LANDING_Y = 0.42;

// the deck height along the pier (the ramp down from the promenade, then level)
export function pierDeckAt(z) {
  const P = PIER;
  if (z >= P.rampEnd) return P.deck;
  const t = Math.max(0, (z - P.z0) / (P.rampEnd - P.z0));
  return 3.32 + (P.deck - 3.32) * t;
}

export function buildPier(ctx) {
  const P = PIER, X = P.x, H = P.half, D = P.deck;
  const C = ctx.colliders;
  const rng = new RNG(4646);
  const B = (x, z) => ctx.builders.get('pier', x, z);
  const glow = (x, z) => ctx.builders.get('pierGlow', x, z);
  const berths = [];

  // ---- piles, bents and stringers under the deck (pairs every 4 m)
  const pileAt = (b, x, z, top) => {
    const g = terrainH(x, z) - 0.6;
    b.cyl(x, g, z, 0.17, 0.16, top - g, 8, WOOD_DK, PAT.BARK, { ao: 0.35 });
    C.addCircle(x, z, 0.2, top);
  };
  for (let z = P.z0 + 3; z < P.z2; z += 4) {
    const top = pierDeckAt(z) - 0.3;
    const b = B(X, z);
    for (const e of [-1, 1]) pileAt(b, X + e * (H - 0.25), z, top);
    // the bent across the pile heads
    b.box(X, top + 0.09, z, H * 2 + 0.1, 0.18, 0.2, { color: WOOD_DK, pattern: PAT.BOARDS });
    // cross bracing in every other bay (where it stands clear of the sand)
    const zb = z + 4;
    if (zb < P.z1 && ((z - P.z0) / 4) % 2 < 1 && top - terrainH(X, z) > 1.6) {
      const y0 = Math.max(terrainH(X, z) + 0.3, top - 2.2);
      b.rod(V(X - H + 0.25, y0, z), V(X + H - 0.25, top - 0.05, z), 0.05, 0.05, 5, WOOD_DK, PAT.BOARDS);
      b.rod(V(X + H - 0.25, y0, z), V(X - H + 0.25, top - 0.05, z), 0.05, 0.05, 5, WOOD_DK, PAT.BOARDS);
    }
  }
  // stringers along the deck: segments following the ramp
  const deckEdge = [];
  for (let z = P.z0; z <= P.z1 + 1e-6; z += z < P.rampEnd ? (P.rampEnd - P.z0) / 4 : 8) deckEdge.push(Math.min(z, P.z1));
  if (deckEdge[deckEdge.length - 1] < P.z1) deckEdge.push(P.z1);
  for (let i = 0; i < deckEdge.length - 1; i++) {
    const z0 = deckEdge[i], z1 = deckEdge[i + 1], y0 = pierDeckAt(z0), y1 = pierDeckAt(z1);
    const b = B(X, z0);
    for (const x of [X - H + 0.25, X, X + H - 0.25]) b.rod(V(x, y0 - 0.2, z0), V(x, y1 - 0.2, z1), 0.09, 0.09, 4, WOOD, PAT.BOARDS);
    // the deck boards (laid across), their edge fascia painted white
    b.slab(V(X - H, y0, z0), V(X - H, y1, z1), V(X + H, y1, z1), V(X + H, y0, z0), 0.08, DECK, PAT.PLANKS);
    for (const e of [-1, 1]) b.quadOut(V(X + e * H, y0 - 0.08, z0), V(X + e * H, y1 - 0.08, z1), V(X + e * H, y1 - 0.24, z1), V(X + e * H, y0 - 0.24, z0), V(X, y0, (z0 + z1) / 2), WHITE, 0);
  }

  // ---- the T-head
  const T0 = P.z1, T1 = P.z2, TX0 = X - P.head, TX1 = X + P.headE;
  {
    const b = B(X, T0 + 4);
    b.slab(V(TX0, D, T0), V(TX0, D, T1), V(TX1, D, T1), V(TX1, D, T0), 0.08, DECK, PAT.PLANKS);
    for (const [ax, az, bx, bz] of [[TX0, T0, TX1, T0], [TX0, T1, TX1, T1], [TX0, T0, TX0, T1], [TX1, T0, TX1, T1]]) {
      b.quadOut(V(ax, D - 0.08, az), V(bx, D - 0.08, bz), V(bx, D - 0.24, bz), V(ax, D - 0.24, az), V(X, D, (T0 + T1) / 2), WHITE, 0);
    }
    for (const x of [TX0 + 0.4, X - 2.8, TX1 - 0.4]) {
      for (const z of [T0 + 0.6, (T0 + T1) / 2, T1 - 0.4]) {
        if (Math.abs(x - X) < H) continue;
        pileAt(b, x, z, D - 0.3);
      }
    }
    for (const z of [T0 + 0.6, (T0 + T1) / 2, T1 - 0.4]) b.boxMM(TX0, D - 0.3, z - 0.1, TX1, D - 0.12, z + 0.1, { color: WOOD_DK, pattern: PAT.BOARDS });
  }
  // walkable: the ramp and deck (only for feet up on it: under the far part people walk the
  // sand between the piles), the T-head
  C.addSurface(X - H, P.z0 - 0.05, X + H, T0, (x, z) => pierDeckAt(z), 1, { min: D - 0.8 });
  C.addSurface(TX0, T0, TX1, T1, () => D, 1, { min: D - 0.8 });
  // near the sea wall the deck is too low over the sand to walk under
  C.addBox(X, (P.z0 + 88) / 2, H, (88 - P.z0) / 2, 0, D - 0.05);

  // ---- railings (white posts and rails), with a gap at the head of the stairs
  const SX0 = X + H + 0.2, SX1 = SX0 + 1.4; // the stairs down to the landing, east of the pier
  const rail = (ax, az, bx, bz, ya, yb) => {
    const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(len / 2));
    const b = B(ax, az);
    for (let i = 0; i <= n; i++) {
      const t = i / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t, y = ya + (yb - ya) * t;
      b.box(x, y + 0.53, z, 0.09, 1.06, 0.09, { color: WHITE });
    }
    for (const h of [1.04, 0.62, 0.22]) b.rod(V(ax, ya + h, az), V(bx, yb + h, bz), h > 1 ? 0.045 : 0.03, h > 1 ? 0.045 : 0.03, 5, WHITE);
    // (high enough that a jump does not clear it; not down into the water, where the boat
    // passes under the deck's edge)
    C.addSegment(ax, az, bx, bz, 0.14, Math.max(ya, yb) + 1.7, Math.min(ya, yb) - 0.4);
  };
  for (let i = 0; i < deckEdge.length - 1; i++) {
    const z0 = deckEdge[i] + (i === 0 ? 0.5 : 0), z1 = deckEdge[i + 1];
    for (const e of [-1, 1]) rail(X + e * (H - 0.06), z0, X + e * (H - 0.06), z1, pierDeckAt(z0), pierDeckAt(z1));
  }
  rail(TX0, T1 - 0.06, TX1, T1 - 0.06, D, D);
  rail(TX0 + 0.06, T0, TX0 + 0.06, T1, D, D);
  rail(TX1 - 0.06, T0, TX1 - 0.06, T1, D, D);
  rail(TX0, T0 + 0.06, X - H, T0 + 0.06, D, D);
  rail(X + H, T0 + 0.06, SX0 - 0.05, T0 + 0.06, D, D);
  rail(SX1 + 0.05, T0 + 0.06, TX1, T0 + 0.06, D, D);

  // ---- lantern lamps on black posts along the railings (lit at night)
  const lamp = (x, z, y, out) => {
    const b = B(x, z);
    b.box(x, y + 1.35, z, 0.1, 2.7, 0.1, { color: IRON, pattern: PAT.METAL });
    b.rod(V(x, y + 2.62, z), V(x + out * 0.42, y + 2.62, z), 0.03, 0.03, 5, IRON);
    const lx = x + out * 0.42;
    b.box(lx, y + 2.55, z, 0.26, 0.04, 0.26, { color: IRON });
    b.box(lx, y + 2.86, z, 0.3, 0.05, 0.3, { color: IRON });
    b.cyl(lx, y + 2.88, z, 0.17, 0.02, 0.12, 4, IRON, 0, { phase: Math.PI / 4 });
    for (const [dx, dz] of [[-0.12, -0.12], [0.12, -0.12], [0.12, 0.12], [-0.12, 0.12]]) b.box(lx + dx, y + 2.71, z + dz, 0.025, 0.28, 0.025, { color: IRON });
    glow(x, z).box(lx, y + 2.71, z, 0.21, 0.27, 0.21, { color: 0xffe2a8 });
    ctx.lamps.push({ x: lx, y: y + 2.6, z, r: 6, color: 0xffd08a });
  };
  for (let z = 80; z < P.z1 - 2; z += 16) {
    const e = Math.round((z - 80) / 16) % 2 ? 1 : -1;
    lamp(X + e * (H + 0.08), z, pierDeckAt(z), e);
  }
  lamp(TX0 + 0.12, T1 - 0.12, D, -1);
  lamp(TX1 - 0.12, T1 - 0.12, D, 1);

  // ---- the gateway at the promenade: two white posts and a board across, both ways
  {
    const z = P.z0 + 0.7, y = pierDeckAt(z);
    const b = B(X, z);
    for (const e of [-1, 1]) {
      b.box(X + e * (H + 0.02), y + 1.45, z, 0.16, 2.9, 0.16, { color: WHITE });
      b.cyl(X + e * (H + 0.02), y + 2.9, z, 0.11, 0.02, 0.14, 4, WHITE, 0, { phase: Math.PI / 4 });
    }
    b.box(X, y + 2.55, z, H * 2 + 0.3, 0.6, 0.08, { color: 0x34506e });
    C.addCircle(X - H - 0.02, z, 0.12);
    C.addCircle(X + H + 0.02, z, 0.12);
    const uv = ctx.atlas2.draw('pier-gate', 512, 112, (c, w, h) =>
      drawBoard(c, w, h, { text: 'さくら桟橋', sub: 'SAKURA PIER', bg: '#34506e', fg: '#fff6e4', subColor: '#f3c3cf', font: FONTS.mincho || FONTS.bold, weather: false }),
    );
    const sb = ctx.builders.get('sign2', X, z);
    const w = H * 2 + 0.2, y0 = y + 2.29, y1 = y + 2.81;
    const uvs = [[uv.u0, uv.v0], [uv.u1, uv.v0], [uv.u1, uv.v1], [uv.u0, uv.v1]];
    sb.quad(V(X + w / 2, y0, z - 0.045), V(X - w / 2, y0, z - 0.045), V(X - w / 2, y1, z - 0.045), V(X + w / 2, y1, z - 0.045), 0xffffff, 0.5, { uvs });
    sb.quad(V(X - w / 2, y0, z + 0.045), V(X + w / 2, y0, z + 0.045), V(X + w / 2, y1, z + 0.045), V(X - w / 2, y1, z + 0.045), 0xffffff, 0.5, { uvs });
  }

  // ---- on the T-head: benches facing the sea, the boat hire hut, a life ring, rod holders
  for (const bx of [X - 2.6, X + 1.4]) benchAt(ctx, B(bx, T1), bx, D, T1 - 0.75, Math.PI, 0x8a6a4a, '海を眺めるベンチに座る');
  {
    // ボート乗り場: a little hut with a window and a sign, on the west arm
    const hx0 = TX0 + 0.5, hx1 = TX0 + 2.9, hz0 = T0 + 0.5, hz1 = T0 + 2.7;
    const b = B(hx0, hz0);
    b.boxMM(hx0, D, hz0, hx1, D + 2.25, hz1, { color: 0xe9e2d2, pattern: PAT.BOARDS });
    b.boxMM(hx0 - 0.25, D + 2.25, hz0 - 0.3, hx1 + 0.25, D + 2.38, hz1 + 0.3, { color: 0x3f6f8a });
    b.boxMM(hx0 - 0.02, D + 2.0, hz0 - 0.02, hx1 + 0.02, D + 2.25, hz1 + 0.02, { color: 0x3f6f8a });
    // the window on the deck side, its shutter half up, a counter under it
    ctx.builders.get('window', hx0, hz1).quad(V(hx0 + 0.45, D + 1.0, hz1 + 0.01), V(hx1 - 0.45, D + 1.0, hz1 + 0.01), V(hx1 - 0.45, D + 1.75, hz1 + 0.01), V(hx0 + 0.45, D + 1.75, hz1 + 0.01), 0xffffff, 33, { uvs: [[0, 0], [1, 0], [1, 1], [0, 1]] });
    b.box((hx0 + hx1) / 2, D + 0.97, hz1 + 0.18, hx1 - hx0 - 0.7, 0.05, 0.36, { color: 0x8a6a4a });
    C.addBox((hx0 + hx1) / 2, (hz0 + hz1) / 2 + 0.1, (hx1 - hx0) / 2 + 0.05, (hz1 - hz0) / 2 + 0.25, 0, D + 2.4);
    const uv = ctx.atlas2.draw('pier-boat', 384, 96, (c, w, h) =>
      drawBoard(c, w, h, { text: 'ボート乗り場', sub: '貸しボート・遊覧', bg: '#fdf8ee', fg: '#2f5878', subColor: '#c0546e', weather: false }),
    );
    const sb = ctx.builders.get('sign2', hx0, hz1);
    const y0 = D + 1.84, y1 = D + 2.22, cx = (hx0 + hx1) / 2, w = hx1 - hx0 - 0.3;
    sb.quad(V(cx - w / 2, y0, hz1 + 0.035), V(cx + w / 2, y0, hz1 + 0.035), V(cx + w / 2, y1, hz1 + 0.035), V(cx - w / 2, y1, hz1 + 0.035), 0xffffff, 0.5, { uvs: [[uv.u0, uv.v0], [uv.u1, uv.v0], [uv.u1, uv.v1], [uv.u0, uv.v1]] });
    // a little sign at the head of the stairs: ↓ ボート
    const ab = ctx.atlas2.draw('pier-arrow', 192, 96, (c, w, h) => drawBoard(c, w, h, { text: '↓ ボート', bg: '#2f5878', fg: '#fdf8ee', weather: false }));
    const px = SX1 + 0.35, pz = T0 + 0.35;
    b.box(px, D + 0.6, pz, 0.07, 1.2, 0.07, { color: IRON });
    ctx.builders.get('sign2', px, pz).quad(V(px - 0.32, D + 1.05, pz - 0.04), V(px + 0.32, D + 1.05, pz - 0.04), V(px + 0.32, D + 1.37, pz - 0.04), V(px - 0.32, D + 1.37, pz - 0.04), 0xffffff, 0.5, { uvs: [[ab.u1, ab.v0], [ab.u0, ab.v0], [ab.u0, ab.v1], [ab.u1, ab.v1]] });
    C.addCircle(px, pz, 0.08);
  }
  {
    // the life ring on its post, a tub of rods, a bucket
    const b = B(TX1, T1);
    const lx = TX1 - 0.5, lz = T1 - 2.3;
    b.box(lx, D + 0.75, lz, 0.1, 1.5, 0.1, { color: WHITE });
    b.pushTRS(lx - 0.12, D + 1.12, lz, Math.PI / 2);
    for (let i = 0; i < 8; i++) {
      const a0 = (i / 8) * Math.PI * 2, a1 = ((i + 1) / 8) * Math.PI * 2;
      b.geom(new THREE.TorusGeometry(0.3, 0.075, 6, 4, a1 - a0), new THREE.Matrix4().makeRotationZ(a0), i % 2 ? 0xf2f2ec : 0xe8562e);
    }
    b.pop();
    C.addCircle(lx, lz, 0.15);
    for (let i = 0; i < 3; i++) b.rod(V(TX0 + 0.35 + i * 0.12, D + 0.4, T1 - 1.6), V(TX0 + 0.1 + i * 0.2, D + 2.6, T1 - 1.6 + (i - 1) * 0.2), 0.012, 0.006, 4, i === 1 ? 0x2a4f8a : 0x3a3a3a);
    b.cyl(TX0 + 0.42, D, T1 - 1.6, 0.17, 0.2, 0.42, 10, 0x3f7a9a);
    C.addCircle(TX0 + 0.42, T1 - 1.6, 0.22);
  }
  void rng;

  // ---- the stairs down to the floating landing, beside the pier on the east
  const LY = LANDING_Y, steps = 12, run = 0.3, rise = (D - LY) / steps;
  const SZ1 = T0, SZ0 = T0 - steps * run;
  {
    const b = B(SX0, SZ0);
    for (let i = 0; i < steps; i++) {
      const z1 = SZ1 - i * run, top = D - (i + 1) * rise;
      b.boxMM(SX0, top - 0.06, z1 - run, SX1, top, z1, { color: DECK, pattern: PAT.PLANKS });
    }
    // stringers either side, piles at the foot, a handrail on the open side
    for (const x of [SX0 + 0.04, SX1 - 0.04]) b.rod(V(x, LY - 0.15, SZ0), V(x, D - 0.12, SZ1), 0.06, 0.06, 4, WOOD_DK, PAT.BOARDS);
    pileAt(b, SX1 - 0.05, SZ0 + 0.3, LY + 1.2);
    for (let i = 0; i <= 3; i++) {
      const z = SZ0 + 0.2 + (i / 3) * (steps * run - 0.4), y = LY + ((z - SZ0) / (SZ1 - SZ0)) * (D - LY);
      b.box(SX1 + 0.05, y + 0.48, z, 0.07, 0.96, 0.07, { color: WHITE });
    }
    b.rod(V(SX1 + 0.05, LY + 0.95, SZ0 + 0.2), V(SX1 + 0.05, D + 0.95, SZ1 - 0.2), 0.04, 0.04, 5, WHITE);
    C.addSegment(SX1 + 0.08, SZ0, SX1 + 0.08, SZ1, 0.12, D + 1.7, LY - 0.3);
    C.addSurface(SX0, SZ0 - 0.02, SX1, SZ1, (x, z) => D - (Math.min(steps - 1, Math.floor((SZ1 - z) / run)) + 1) * rise, 2);
  }

  // ---- the floating landing: a deck on white floats, a fender strip and cleats, guide piles
  const landing = (x0, z0, x1, z1, side) => {
    const b = B(x0, z0);
    const y = LY;
    b.boxMM(x0 + 0.1, y - 0.5, z0 + 0.1, x1 - 0.1, y - 0.1, z1 - 0.1, { color: 0xe6e6e0, pattern: PAT.METAL, ao: 0.3 });
    b.boxMM(x0, y - 0.12, z0, x1, y, z1, { color: DECK, pattern: PAT.PLANKS });
    // the fender strip along the boat's side, the cleats on it
    const [fx, fz, fl, along] = side;
    if (along === 'z') b.boxMM(fx - 0.06, y - 0.32, z0, fx + 0.06, y - 0.06, z1, { color: 0x26282c });
    else b.boxMM(x0, y - 0.32, fz - 0.06, x1, y - 0.06, fz + 0.06, { color: 0x26282c });
    for (const t of [0.18, 0.82]) {
      const cx = along === 'z' ? fx - 0.18 * Math.sign(fx - (x0 + x1) / 2) : x0 + (x1 - x0) * t;
      const cz = along === 'z' ? z0 + (z1 - z0) * t : fz - 0.18 * Math.sign(fz - (z0 + z1) / 2);
      b.box(cx, y + 0.06, cz, along === 'z' ? 0.08 : 0.3, 0.12, along === 'z' ? 0.3 : 0.08, { color: IRON });
      b.box(cx, y + 0.13, cz, along === 'z' ? 0.12 : 0.36, 0.04, along === 'z' ? 0.36 : 0.12, { color: IRON });
    }
    void fl;
    // walk on it; in the way of the boat (not of feet on it)
    C.addSurface(x0, z0, x1, z1, () => y, 1);
    C.addBox((x0 + x1) / 2, (z0 + z1) / 2, (x1 - x0) / 2, (z1 - z0) / 2, 0, y);
  };
  const LX0 = SX0 - 0.0, LX1 = SX0 + 2.4, LZ0 = SZ0 - 14.4, LZ1 = SZ0;
  landing(LX0, LZ0, LX1, LZ1, [LX1, 0, 0, 'z']);
  {
    // guide piles through hoops on the pier side, clear of the boat coming and going
    const b = B(LX0, LZ0);
    for (const z of [LZ0 + 0.5, (LZ0 + LZ1) / 2 - 2.5, LZ1 - 1.4]) {
      const x = LX0 + 0.3;
      const g = terrainH(x, z) - 0.6;
      b.cyl(x, g, z, 0.16, 0.15, LY + 1.5 - g, 8, WOOD_DK, PAT.BARK, { ao: 0.35 });
      b.cyl(x, LY - 0.02, z, 0.24, 0.24, 0.1, 10, IRON);
      C.addCircle(x, z, 0.22);
    }
  }
  // the boat's place: alongside the landing's sea side, bow out to sea; she steps on and off
  // in the middle of the landing
  berths.push({
    id: 'pier', name: 'さくら桟橋',
    x: LX1 + 0.92, z: (LZ0 + LZ1) / 2 + 0.6, h: 0,
    stand: { x: LX1 - 0.75, z: (LZ0 + LZ1) / 2 + 0.6, y: LY },
  });

  // ---- the fishing harbour: stairs down the quay to a pontoon (the westmost mooring)
  {
    const qz = HARBOR.quay, Y = HARBOR.y;
    const hx0 = 495.2, hx1 = 496.8, n = 10, hrun = 0.3, hrise = (Y - LY) / n;
    const z0 = qz + 0.75, z1 = z0 + n * hrun;
    const b = B(hx0, z0);
    for (let i = 0; i < n; i++) {
      const za = z0 + i * hrun, top = Y - (i + 1) * hrise;
      b.boxMM(hx0, top - 0.5, za, hx1, top, za + hrun, { color: 0xc4c0b6, pattern: PAT.CONCRETE });
    }
    // handrails either side: a post on the top and the bottom step, a rail between
    for (const x of [hx0 + 0.06, hx1 - 0.06]) {
      const yt = Y - hrise, yb = LY;
      b.box(x, yt + 0.45, z0 + 0.15, 0.06, 0.9, 0.06, { color: 0xd8d6cc });
      b.box(x, yb + 0.45, z1 - 0.15, 0.06, 0.9, 0.06, { color: 0xd8d6cc });
      b.rod(V(x, yt + 0.9, z0 + 0.15), V(x, yb + 0.9, z1 - 0.15), 0.035, 0.035, 5, 0xd8d6cc);
      C.addSegment(x, z0, x, z1, 0.1, Y + 1.7);
    }
    C.addSurface(hx0, qz + 0.2, hx1, z1, (x, z) => (z < z0 ? Y : Y - (Math.min(n - 1, Math.floor((z - z0) / hrun)) + 1) * hrise), 2);
    const px0 = 492.5, px1 = 499.5, pz0 = z1, pz1 = z1 + 2.4;
    landing(px0, pz0, px1, pz1, [0, pz1, 0, 'x']);
    berths.push({
      id: 'harbor', name: '漁港',
      x: (px0 + px1) / 2, z: pz1 + 0.92, h: -Math.PI / 2,
      stand: { x: (px0 + px1) / 2, z: pz1 - 0.75, y: LY },
    });
    ctx.harborStairs = { x0: hx0 - 0.3, x1: hx1 + 0.3 };
  }

  // ---- the breakwater (防波堤): from a little platform level with its top, a flight of
  // concrete stairs down its east face (cast against it, solid to the sea bed) to a pontoon
  // along the face; the boat lies outside it, bow out to sea
  {
    const bw = BREAKWATER, top = bw.top, ex = bw.x + bw.w / 2;
    const n = 12, srun = 0.3, srise = (top - LY) / n;
    const sx0 = ex, sx1 = ex + 1.3, hz0 = bw.stairs - 1.4, z0 = bw.stairs, z1 = z0 + n * srun;
    const CON = 0xc6c2b8, RAIL = 0xd8d6cc;
    const b = B(sx0, z0);
    const g = Math.min(terrainH(sx1, hz0), terrainH(sx1, z1)) - 0.6;
    b.boxMM(sx0, g, hz0, sx1, top, z0, { color: CON, pattern: PAT.CONCRETE, ao: 0.2 });
    const tread = (z) => (z < z0 ? top : top - (Math.min(n - 1, Math.floor((z - z0) / srun)) + 1) * srise);
    for (let i = 0; i < n; i++) {
      const za = z0 + i * srun;
      b.boxMM(sx0, g, za, sx1, tread(za + 0.01), za + srun, { color: i % 2 ? CON : 0xbdb9af, pattern: PAT.CONCRETE, ao: 0.2 });
    }
    // a pipe handrail down the open side, and across the platform's end
    const rx = sx1 - 0.06, line = (z) => (z <= z0 ? top : top - ((Math.min(z, z1) - z0) / (z1 - z0)) * (top - LY));
    const posts = [hz0 + 0.06, z0 + 0.15, (z0 + z1) / 2, z1 - 0.15];
    for (const z of posts) b.boxMM(rx - 0.03, tread(z), z - 0.03, rx + 0.03, line(z) + 0.9, z + 0.03, { color: RAIL });
    for (let i = 0; i < posts.length - 1; i++) b.rod(V(rx, line(posts[i]) + 0.9, posts[i]), V(rx, line(posts[i + 1]) + 0.9, posts[i + 1]), 0.03, 0.03, 5, RAIL);
    b.boxMM(sx0 + 0.03, top, hz0 + 0.03, sx0 + 0.09, top + 0.9, hz0 + 0.09, { color: RAIL });
    b.rod(V(sx0 + 0.06, top + 0.9, hz0 + 0.06), V(rx, top + 0.9, hz0 + 0.06), 0.03, 0.03, 5, RAIL);
    C.addSegment(rx + 0.04, hz0, rx + 0.04, z1, 0.1, top + 1.7, LY - 0.3);
    C.addSegment(sx0, hz0 - 0.02, sx1, hz0 - 0.02, 0.1, top + 1.7, top - 0.6);
    // walk on them; in the way of the boat
    C.addSurface(sx0, hz0, sx1, z1, (x, z) => tread(z), 2);
    C.addBox((sx0 + sx1) / 2, (hz0 + z1) / 2, (sx1 - sx0) / 2, (z1 - hz0) / 2, 0, LY - 0.1);
    // the pontoon, and its guide piles along the face
    const px0 = ex, px1 = ex + 2.8, pz0 = z1, pz1 = z1 + 12;
    landing(px0, pz0, px1, pz1, [px1, 0, 0, 'z']);
    for (const z of [pz0 + 0.6, pz1 - 0.6]) {
      const x = px0 + 0.3, gz = terrainH(x, z) - 0.6;
      b.cyl(x, gz, z, 0.16, 0.15, LY + 1.5 - gz, 8, WOOD_DK, PAT.BARK, { ao: 0.35 });
      b.cyl(x, LY - 0.02, z, 0.24, 0.24, 0.1, 10, IRON);
      C.addCircle(x, z, 0.22);
    }
    berths.push({
      id: 'breakwater', name: '防波堤',
      x: px1 + 0.92, z: (pz0 + pz1) / 2 + 0.6, h: 0,
      stand: { x: px1 - 0.75, z: (pz0 + pz1) / 2 + 0.6, y: LY },
    });
  }
  ctx.berths = berths;
  return { berths };
}
