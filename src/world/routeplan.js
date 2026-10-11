// さくら一周ライン: the cycling loop round the town and its hills. Route geometry and the
// shaping of the hills it runs through (no three.js here: the terrain asks this module
// about the ground before anything is built).
//
// The loop runs counterclockwise from the cycle station at the river mouth: east along the
// promenade, past the fishing harbour, up through the mikan terraces on the east headland,
// west over the pampas plateau behind the school, across the gorge below the waterfall,
// through the tea fields, the thousand torii behind the shrine and the rice terraces, down
// through the bamboo grove and a hand-dug tunnel to the lighthouse on the west cape, and
// back along the sea front. The 桜川 path and a forest road (the spine) link the station
// with the hills in the middle, so a shorter western or eastern loop can be ridden too.
//
// Each leg is a list of control points [x, z, y] (y: the road surface; null = in between,
// by distance). New legs are carved into the hills (see sculpt below); `existing` legs run
// on paving that is already there (the promenade, the river path) and only mark the way.

import { smoothstep, clamp, lerp, fbm2, noise2 } from '../core/rng.js';

export const ROAD_W = 3.6; // carriageway of the new roads
export const VERGE = 2.6; // flat verge each side (the carved shelf is ROAD_W / 2 + VERGE)

// styles of the road surface (road material ids)
export const RS = { MOUNTAIN: 14, RINGS: 15, STONE: 16, CONCRETE: 17, SKYLINE: 18, TUNNEL: 19, GRAVEL: 20, BLUE: 21 };

export const LEGS = [
  // ---- outer loop (counterclockwise) ----
  { id: 'coastE', name: '松原の浜道', existing: true, pts: [[214, 70.75, 3.32], [489, 70.75, 3.32]] },
  {
    // down a ramp through the sea wall (the gap in coast.js: HARBOR.ramp) onto the quay
    id: 'harbor', name: '漁港', style: RS.CONCRETE, w: 4.2, rail: null,
    pts: [[489, 70.75, 3.32], [491.6, 72.9, 3.3], [495, 76, null], [499, 78.5, null], [506, 80.5, 2.3], [514, 81, null], [538, 83, null], [552, 86, 2.4]],
  },
  {
    id: 'mikan', name: 'みかんの段々畑', style: RS.RINGS, w: 3.2, rail: 'pipe',
    pts: [
      [552, 86, 2.4], [575, 90, null], [605, 91, null], [626, 88, null], [641, 80, null], [638, 69, null],
      [612, 66, null], [585, 63, null], [565, 59, null], [552, 51, null], [559, 42, null],
      [585, 39, null], [612, 35, null], [632, 30, null], [643, 20, null], [634, 10, null],
      [608, 6, null], [580, 1, null], [558, -7, null], [543, -21, null], [533, -45, 31.6],
    ],
  },
  {
    id: 'kaze', name: '風車の丘', style: RS.SKYLINE, rail: 'white',
    pts: [
      [533, -45, 31.6], [527, -80, null], [522, -115, null], [513, -145, null], [496, -164, 38],
      [470, -177, null], [430, -186, 40.4], [390, -191, 41], [350, -191, 40.2], [318, -187, null],
      [290, -181, null], [266, -176, null], [244, -172, null], [222, -169, 31], [210, -169, 30.6],
    ],
  },
  { id: 'sawa', name: '沢の橋', style: RS.MOUNTAIN, rail: 'wood', pts: [[210, -169, 30.6], [196, -170, 30.3], [168, -170, 30.3], [154, -171, 30.5]] },
  {
    id: 'cha', name: '尾根の茶畑', style: RS.MOUNTAIN, rail: 'rope',
    pts: [[154, -171, 30.5], [134, -165, null], [110, -160, 31.2], [88, -159, null], [73, -166, null], [66, -178, 29.4]],
  },
  { id: 'torii', name: '千本鳥居', style: RS.STONE, w: 3.0, rail: 'stone', pts: [[66, -178, 29.4], [54, -179.5, null], [38, -180, 28.4], [22, -180, 28.4], [6, -179, 28.6]] },
  {
    id: 'tanada', name: '棚田', style: RS.GRAVEL, w: 3.2, rail: 'rope',
    pts: [[6, -179, 28.6], [-14, -174, null], [-36, -168, null], [-62, -165, 31], [-90, -165, 31.2], [-120, -165, 31.2], [-150, -164, null], [-178, -165, 30.4]],
  },
  {
    id: 'take', name: '竹林', style: RS.MOUNTAIN, rail: 'bamboo',
    pts: [[-178, -165, 30.4], [-204, -156, null], [-228, -142, null], [-246, -120, null], [-257, -92, null], [-262, -62, null], [-268, -38, null], [-281, -16, null], [-294, -3, 16.7]],
  },
  { id: 'zuido', name: '素掘りトンネル', style: RS.TUNNEL, w: 3.0, lin: [2, 4], rail: 'bamboo', pts: [[-294, -3, 16.7], [-306, 1, null], [-316, 8, null], [-316, 25, null], [-316, 43, null], [-318, 52, 16]] },
  {
    id: 'misaki', name: '岬の灯台', style: RS.MOUNTAIN, rail: 'white',
    pts: [
      [-318, 52, 16], [-319, 62, null], [-329, 76, null], [-342, 91, null], [-350, 106, null], [-347, 120, null],
      [-334, 128, null], [-318, 125, null], [-307, 114, null], [-301, 100, null], [-297, 87, null], [-293, 75, null], [-291, 70.75, 3.32],
    ],
  },
  { id: 'coastW', name: '海沿いブルーライン', existing: true, pts: [[-291, 70.75, 3.32], [214, 70.75, 3.32]] },
  // ---- the spine: the river path and the forest road up to the gorge ----
  { id: 'kawa', name: '桜川の道', existing: true, spine: true, pts: [[218, 70.75, 3.32], [218, 47.5, null], [194, 47.5, null], [194, -126, null]] },
  {
    id: 'mori', name: '源流の森', style: RS.MOUNTAIN, spine: true, rail: 'wood',
    pts: [
      [194, -126, 12.55], [214, -130, null], [250, -134, null], [290, -139, null], [328, -144, null], [350, -147, null],
      [364, -154, null], [350, -161, null], [320, -162, null], [290, -163, null], [262, -165, null], [240, -167, null], [222, -169, 31],
    ],
  },
];

// ---------------------------------------------------------------------------
// centerline: centripetal Catmull-Rom through each leg's points, sampled every metre
// ---------------------------------------------------------------------------
function catmull(p0, p1, p2, p3, t) {
  // centripetal parameterisation (no loops or cusps at hairpins)
  const d = (a, b) => Math.max(1e-4, Math.pow(Math.hypot(b[0] - a[0], b[1] - a[1]), 0.5));
  const t0 = 0, t1 = d(p0, p1), t2 = t1 + d(p1, p2), t3 = t2 + d(p2, p3);
  const u = t1 + (t2 - t1) * t;
  const L = (a, b, ta, tb) => [((tb - u) * a[0] + (u - ta) * b[0]) / (tb - ta), ((tb - u) * a[1] + (u - ta) * b[1]) / (tb - ta)];
  const A1 = L(p0, p1, t0, t1), A2 = L(p1, p2, t1, t2), A3 = L(p2, p3, t2, t3);
  const B1 = L(A1, A2, t0, t2), B2 = L(A2, A3, t1, t3);
  return L(B1, B2, t1, t2);
}

function sampleLeg(leg, prev, next) {
  const P = leg.pts;
  const n = P.length;
  // the neighbouring legs' points continue the curve smoothly across the joins
  const before = prev && !prev.existing && !leg.existing ? prev.pts[prev.pts.length - 2] : [2 * P[0][0] - P[1][0], 2 * P[0][1] - P[1][1]];
  const after = next && !next.existing && !leg.existing ? next.pts[1] : [2 * P[n - 1][0] - P[n - 2][0], 2 * P[n - 1][1] - P[n - 2][1]];
  const fine = [];
  for (let i = 0; i < n - 1; i++) {
    const p0 = i > 0 ? P[i - 1] : before;
    const p3 = i + 2 < n ? P[i + 2] : after;
    const steps = Math.max(4, Math.ceil(Math.hypot(P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1]) * 4));
    for (let k = 0; k < steps; k++) {
      const straight = leg.existing || (leg.lin && i >= leg.lin[0] && i < leg.lin[1]);
      const q = straight ? [P[i][0] + ((P[i + 1][0] - P[i][0]) * k) / steps, P[i][1] + ((P[i + 1][1] - P[i][1]) * k) / steps] : catmull(p0, P[i], P[i + 1], p3, k / steps);
      fine.push([q[0], q[1], i + k / steps]);
    }
  }
  fine.push([P[n - 1][0], P[n - 1][1], n - 1]);
  // resample at 1 m along the curve
  const out = [{ x: fine[0][0], z: fine[0][1], k: 0, s: 0 }];
  let acc = 0, nextS = 1;
  for (let i = 1; i < fine.length; i++) {
    const a = fine[i - 1], b = fine[i];
    const seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
    while (seg > 0 && nextS <= acc + seg) {
      const f = (nextS - acc) / seg;
      out.push({ x: a[0] + (b[0] - a[0]) * f, z: a[1] + (b[1] - a[1]) * f, k: a[2] + (b[2] - a[2]) * f, s: nextS });
      nextS += 1;
    }
    acc += seg;
  }
  const last = fine[fine.length - 1];
  if (acc - out[out.length - 1].s > 0.3) out.push({ x: last[0], z: last[1], k: n - 1, s: acc });
  else Object.assign(out[out.length - 1], { x: last[0], z: last[1], k: n - 1 });
  // heights: linear in distance between the control points that give one, then eased
  const known = [];
  for (let i = 0; i < n; i++) {
    if (P[i][2] === null || P[i][2] === undefined) continue;
    const o = out.find((q) => q.k >= i - 1e-6) || out[out.length - 1];
    known.push([o.s, P[i][2]]);
  }
  for (const o of out) {
    if (!known.length) o.y = null;
    else if (o.s <= known[0][0]) o.y = known[0][1];
    else if (o.s >= known[known.length - 1][0]) o.y = known[known.length - 1][1];
    else {
      let j = 0;
      while (known[j + 1][0] < o.s) j++;
      const [s0, y0] = known[j], [s1, y1] = known[j + 1];
      o.y = y0 + ((y1 - y0) * (o.s - s0)) / (s1 - s0);
    }
  }
  if (!leg.existing) {
    // vertical curves: a moving average over ±6 m keeps the grade from changing abruptly
    // (the ends stay put so the legs meet)
    const ys = out.map((o) => o.y);
    for (let i = 1; i < out.length - 1; i++) {
      const r = Math.min(6, i, out.length - 1 - i);
      let s = 0;
      for (let j = -r; j <= r; j++) s += ys[i + j];
      out[i].y = s / (2 * r + 1);
    }
  }
  for (let i = 0; i < out.length; i++) {
    const a = out[Math.max(0, i - 1)], b = out[Math.min(out.length - 1, i + 1)];
    const l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    out[i].tx = (b.x - a.x) / l;
    out[i].tz = (b.z - a.z) / l;
  }
  return out;
}

let ROUTE = null;
// { legs: [{ ...leg, w, samples, length }], loopLength, spineLength }
export function route() {
  if (ROUTE) return ROUTE;
  const legs = LEGS.map((leg, i) => {
    const prev = LEGS.find((l) => l !== leg && l.pts[l.pts.length - 1][0] === leg.pts[0][0] && l.pts[l.pts.length - 1][1] === leg.pts[0][1]);
    const next = LEGS.find((l) => l !== leg && l.pts[0][0] === leg.pts[leg.pts.length - 1][0] && l.pts[0][1] === leg.pts[leg.pts.length - 1][1]);
    return { ...leg, index: i, w: leg.w ?? ROAD_W, samples: sampleLeg(leg, prev, next) };
  });
  let loop = 0, spine = 0;
  for (const l of legs) {
    l.length = l.samples[l.samples.length - 1].s;
    if (l.spine) spine += l.length;
    else loop += l.length;
  }
  ROUTE = { legs, loopLength: loop, spineLength: spine };
  return ROUTE;
}

// ---------------------------------------------------------------------------
// the shapes the hills are given
// ---------------------------------------------------------------------------
// 桜川's upper course: a gorge with the waterfall (滝) under the bridge, down to the river's
// headwall where it drops into the town's channel. floor: [z, bed height]
export const STREAM = {
  pts: [[182, -125], [182, -139], [183, -150], [181, -172], [184, -196], [182, -222], [179, -252], [175, -292]],
  inlet: -137.5, // the culvert's inlet: the gorge starts here (the culvert runs under the bank to the river)
  floor: [[-125, 10.1], [-139, 10.3], [-150, 12.0], [-172, 14.1], [-188, 15.6], [-195.4, 16], [-196.6, 24.4], [-222, 28.4], [-252, 35], [-292, 45]],
  half: 2.4, // bed half width
  wall: 0.9, // side slope (rise per metre)
  fall: -196, // the waterfall's lip (z)
};
// the rice terrace valley (谷戸) west of the shrine: axis x, mouth/head z and heights
export const RICE = { x: -104, z0: -138, z1: -232, y0: 20.5, y1: 44, side: 0.21, step: 1.6, riser: 0.22, half: 44 };
// tea fields on the slope above the road between the gorge and the shrine
export const TEA = { x0: 70, x1: 168, z0: -226, z1: -160 };
// the pampas plateau and the wind turbines behind the school
export const PAMPAS = { x0: 262, x1: 548, z0: -262, z1: -160, mills: [[352, -238], [428, -246], [500, -236]] };
// the west cape: lighthouse knoll and the headland round it
// the lighthouse on the cape's tip, beside the road where it rounds the point
export const CAPE = { x: -342.5, z: 140.8 };
// the rock spur the hand-dug tunnel goes through (a straight bore along z)
export const SPUR = { x0: -346, x1: -300, z0: 0, z1: 52 };
export const BORE = { x: -316, z0: 9, z1: 41, w: 3.4, h: 4.3 };
// the red arch bridge over the gorge (the road leg 'sawa' between x0 and x1 is a deck)
export const BRIDGE = { x0: 161, x1: 203, z: -170 };
// rest stops beside the road: a level pad (r m round, at the road's height) reached through
// an opening in the railing. leg: the road it sits beside; at: [x, z] of the pad's centre
export const PADS = [
  { id: 'kaze', leg: 'kaze', at: [392, -182], r: 5.2, name: '風車の丘 展望所' },
  { id: 'chaya', leg: 'cha', at: [112, -168.8], r: 6.2, name: '峠の茶屋' },
  { id: 'tanada', leg: 'tanada', at: [-104, -156.5], r: 4.4, name: '棚田の見晴らし' },
  { id: 'mikan', leg: 'mikan', at: [548, 64], r: 4.6, name: 'みかんの無人販売所' },
  { id: 'misaki', leg: 'misaki', at: [-338, 138.5], r: 7.5, name: '岬の灯台' },
];
// ground off the roads that may be walked: [x, z, r]
export const WALK_ZONES = [];
// openings in the railings: [x, z, r] (beyond those the rest stops make)
export const RAIL_GAPS = [];
// the mikan terraces on the east headland's sea face
export const MIKAN = { x0: 536, x1: 650, z0: -30, z1: 104, step: 2.0 };
// the fishing harbour at the east end of the beach (apron, quay and basin)
export const HARBOR = { x0: 488, x1: 566, z0: 73, quay: 103, z1: 142, y: 2.15, basin: -4.6, ramp: [488.5, 499.5] };

export const SCULPT = { x0: -440, x1: 700, z0: -292, z1: 170 };

// position along a polyline: nearest point -> { d, t (0..1 over the whole line), x, z }
function nearestOnLine(pts, x, z) {
  let best = { d: Infinity, t: 0, x: 0, z: 0 };
  let total = 0;
  const lens = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const l = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
    lens.push(l);
    total += l;
  }
  let acc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
    const u = clamp(((x - ax) * dx + (z - az) * dz) / l2, 0, 1);
    const px = ax + dx * u, pz = az + dz * u;
    const d = Math.hypot(x - px, z - pz);
    if (d < best.d) best = { d, t: (acc + u * lens[i]) / total, x: px, z: pz };
    acc += lens[i];
  }
  return best;
}

// piecewise linear table lookup ([[k, v], ...] sorted by k, ascending or descending)
function table(tab, k) {
  const asc = tab[tab.length - 1][0] > tab[0][0];
  for (let i = 0; i < tab.length - 1; i++) {
    const [k0, v0] = tab[i], [k1, v1] = tab[i + 1];
    if (asc ? k <= k1 : k >= k1) return v0 + ((v1 - v0) * clamp((k - k0) / (k1 - k0), 0, 1));
  }
  return tab[tab.length - 1][1];
}

export function streamBed(z) {
  return table(STREAM.floor, z);
}

// the rice valley before terracing: floor along the axis, sides rising gently
function riceShape(x, z) {
  const R = RICE;
  const t = clamp((R.z0 - z) / (R.z0 - R.z1), 0, 1.3);
  const ax = R.x + 6 * Math.sin(t * 3.2);
  const dx = Math.abs(x - ax);
  return R.y0 + (R.y1 - R.y0) * t + Math.max(0, dx - 5) * R.side + (fbm2(x * 0.03, z * 0.03, 2) - 0.5) * 2.2;
}
// terraced: flats one step apart, a riser at the top of each step
export function riceTerrace(x, z) {
  const y = riceShape(x, z) / RICE.step;
  const k = Math.floor(y), f = y - k;
  // (the paddies' floors lie a little under the water line drawn at step * k, so the coarse
  // ground mesh never shows through the water near the foot of a bank)
  return { level: k, cont: y, flat: f < 1 - RICE.riser - 0.04, y: RICE.step * (k + smoothstep(1 - RICE.riser, 1, f)) - 0.3, top: RICE.step * k };
}
// how much of (x, z) is cultivated terrace (1) rather than wooded valley side (0)
export function riceMask(x, z) {
  const R = RICE;
  const t = (R.z0 - z) / (R.z0 - R.z1);
  const ax = R.x + 6 * Math.sin(clamp(t, 0, 1.3) * 3.2);
  return smoothstep(-0.02, 0.06, t) * (1 - smoothstep(0.92, 1.0, t)) * (1 - smoothstep(R.half - 10, R.half, Math.abs(x - ax)));
}
function riceBlend(x, z) {
  const R = RICE;
  const t = (R.z0 - z) / (R.z0 - R.z1);
  const ax = R.x + 6 * Math.sin(clamp(t, 0, 1.3) * 3.2);
  return smoothstep(-0.12, 0.0, t) * (1 - smoothstep(1.0, 1.15, t)) * (1 - smoothstep(R.half, R.half + 26, Math.abs(x - ax)));
}

// mikan terraces: a sunny face rising from the harbour to the headland top, stepped
function mikanShape(x, z) {
  // (rising eastward along the shore too, where the face meets the headland's cliffs)
  return 2.3 + Math.max(0, 99 - z) * 0.27 + Math.max(0, x - 550) * 0.05 + Math.max(0, x - 572) * 0.22 * smoothstep(78, 102, z) + (fbm2(x * 0.04, z * 0.04, 2) - 0.5) * 2.2;
}
export function mikanTerrace(x, z) {
  const y = mikanShape(x, z) / MIKAN.step;
  const k = Math.floor(y), f = y - k;
  return { level: k, cont: y, flat: f < 0.8, y: MIKAN.step * (k + smoothstep(0.86, 1, f)) };
}
// 1 on the terraced face, falling to 0 at its edges
export function mikanMask(x, z) {
  const M = MIKAN;
  return smoothstep(M.x0, M.x0 + 6, x) * (1 - smoothstep(M.x1 - 12, M.x1, x)) * smoothstep(M.z0, M.z0 + 12, z) * (1 - smoothstep(M.z1 - 6, M.z1, z));
}
// how far the face's shape reaches into the natural headland round it
function mikanBlend(x, z) {
  return (1 - smoothstep(MIKAN.x1, MIKAN.x1 + 50, x)) * smoothstep(MIKAN.z0 - 40, MIKAN.z0, z) * smoothstep(MIKAN.x0 - 4, MIKAN.x0 + 2, x) * (1 - smoothstep(MIKAN.z1, MIKAN.z1 + 26, z));
}

// ---------------------------------------------------------------------------
// the sculpt: a raster (1 m) of changes to the natural ground, built once
// ---------------------------------------------------------------------------
let SC = null;

export function sculptReady() {
  return !!SC;
}

// nat(x, z): the natural ground; outside(x, z): distance outside the town's valley;
// rules.keep(x, z): ground left exactly as it is, rules.shape(x, z): shaped though in town,
// rules.floor(x, z): the least it may be, rules.fix(x, z): a height it must have (or null)
export function initSculpt(nat, outside, rules = {}) {
  if (SC) return SC;
  const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
  const { x0, z0 } = SCULPT;
  const W = SCULPT.x1 - SCULPT.x0 + 1, H = SCULPT.z1 - SCULPT.z0 + 1;
  const N = W * H;
  const active = new Uint8Array(N);
  const base = new Float32Array(N);
  const town = new Uint8Array(N);
  const inBox = (x, z, b, m = 0) => x >= b.x0 - m && x <= b.x1 + m && z >= b.z0 - m && z <= b.z1 + m;
  for (let j = 0; j < H; j++) {
    const z = z0 + j;
    for (let i = 0; i < W; i++) {
      const x = x0 + i;
      const k = j * W + i;
      if (rules.keep?.(x, z)) continue;
      if (outside(x, z) > -4 || inBox(x, z, HARBOR, 6) || rules.shape?.(x, z)) {
        active[k] = 1;
        base[k] = nat(x, z);
      } else if (z < 44) town[k] = 1; // (the valley; the shore keeps its own edges)
    }
  }
  const F = base.slice();
  const at = (x, z) => (Math.round(z) - z0) * W + (Math.round(x) - x0);
  const each = (b, fn) => {
    for (let z = Math.max(z0, Math.ceil(b.z0)); z <= Math.min(SCULPT.z1, Math.floor(b.z1)); z++) {
      for (let x = Math.max(x0, Math.ceil(b.x0)); x <= Math.min(SCULPT.x1, Math.floor(b.x1)); x++) {
        const k = (z - z0) * W + (x - x0);
        if (active[k]) fn(x, z, k);
      }
    }
  };
  // box-filtered natural ground (r m) over a box
  const smooth = (b, r) => {
    const bx0 = Math.ceil(b.x0) - r, bx1 = Math.floor(b.x1) + r, bz0 = Math.ceil(b.z0) - r, bz1 = Math.floor(b.z1) + r;
    const w = bx1 - bx0 + 1, h = bz1 - bz0 + 1;
    const g = new Float32Array(w * h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) g[j * w + i] = nat(bx0 + i, bz0 + j);
    const tmp = new Float32Array(w * h);
    for (let j = 0; j < h; j++) for (let i = r; i < w - r; i++) {
      let s = 0;
      for (let q = -r; q <= r; q++) s += g[j * w + i + q];
      tmp[j * w + i] = s / (2 * r + 1);
    }
    return (x, z) => {
      const i = x - bx0, j = z - bz0;
      let s = 0;
      for (let q = -r; q <= r; q++) s += tmp[(j + q) * w + i];
      return s / (2 * r + 1);
    };
  };

  // --- tea fields: the slope smoothed into an even hillside for the rows
  {
    const box = { x0: TEA.x0 - 16, x1: TEA.x1 + 16, z0: TEA.z0 - 16, z1: TEA.z1 + 6 };
    const sm = smooth(box, 7);
    each(box, (x, z, k) => {
      const m = smoothstep(TEA.x0 - 16, TEA.x0 + 4, x) * (1 - smoothstep(TEA.x1 - 4, TEA.x1 + 16, x)) * smoothstep(TEA.z0 - 16, TEA.z0 + 4, z) * (1 - smoothstep(TEA.z1 - 2, TEA.z1 + 6, z));
      F[k] = lerp(F[k], sm(x, z) - 1.5, m);
    });
  }
  // --- pampas plateau: a broad slope rising gently to the skyline, a little rolling
  each({ x0: PAMPAS.x0 - 30, x1: PAMPAS.x1 + 24, z0: PAMPAS.z0, z1: PAMPAS.z1 + 14 }, (x, z, k) => {
    const P = PAMPAS;
    const m = smoothstep(P.x0 - 30, P.x0 + 10, x) * (1 - smoothstep(P.x1 - 10, P.x1 + 24, x)) * (1 - smoothstep(P.z1 - 2, P.z1 + 14, z)) * smoothstep(P.z0, P.z0 + 12, z);
    const y = 37 + Math.max(0, -170 - z) * 0.36 + (fbm2(x * 0.012, z * 0.012, 3) - 0.5) * 7 + Math.max(0, x - 480) * 0.06;
    F[k] = lerp(F[k], Math.min(F[k], y + 4) * 0.25 + y * 0.75, m);
  });
  // --- rice terraces
  each({ x0: RICE.x - RICE.half - 40, x1: RICE.x + RICE.half + 40, z0: RICE.z1 - 20, z1: RICE.z0 + 16 }, (x, z, k) => {
    const b = riceBlend(x, z);
    if (b <= 0) return;
    const m = riceMask(x, z);
    const plain = riceShape(x, z);
    const y = m > 0 ? lerp(plain, riceTerrace(x, z).y, m) : plain;
    F[k] = lerp(F[k], y, b);
  });
  // --- the gorge: the stream bed with walls rising to the hillside (only ever cut down)
  each({ x0: 120, x1: 250, z0: SCULPT.z0, z1: -122 }, (x, z, k) => {
    const n = nearestOnLine(STREAM.pts, x, z);
    const bed = streamBed(n.z);
    // (an apron as wide as the culvert in front of its inlet)
    const half = lerp(STREAM.half, 7, smoothstep(-146, -139, n.z));
    const d = Math.max(0, n.d - half);
    const wob = (noise2(x * 0.15, z * 0.15) - 0.5) * 1.6 * smoothstep(1, 6, d);
    let y = bed + d * STREAM.wall + Math.max(0, d - 14) * 0.25 + wob;
    // the waterfall's rock face: steeper walls round the plunge pool
    // (below the lip only: above it the stream runs on at the top of the fall)
    const pool = Math.hypot(n.x - 183, n.z - (STREAM.fall + 6));
    if (pool < 11 && n.z > STREAM.fall - 0.6) y = Math.min(y, 15.6 + Math.max(0, n.d - 5.5) * 1.6);
    // (no carving into the town: the channel takes over at the headwall; upstream the gorge
    // closes into the hills before the shaped ground ends)
    const keep = smoothstep(STREAM.inlet + 0.5, STREAM.inlet - 1.5, z) * (1 - smoothstep(-246, -288, z));
    F[k] = Math.min(F[k], lerp(F[k], y, keep));
  });
  // --- the west cape: the natural headland smoothed into rolling grass, the lighthouse knoll
  {
    const box = { x0: -436, x1: -288, z0: 22, z1: 162 };
    const sm = smooth(box, 6);
    each(box, (x, z, k) => {
      const m = smoothstep(-288, -302, x) * smoothstep(22, 36, z) * smoothstep(-436, -420, x) * (1 - smoothstep(150, 162, z));
      F[k] = lerp(F[k], sm(x, z), m);
    });
  }
  // --- the tunnel's rock spur: high enough over the bore, rocky
  each({ x0: SPUR.x0 - 12, x1: SPUR.x1 + 6, z0: SPUR.z0 - 8, z1: SPUR.z1 + 4 }, (x, z, k) => {
    const cx = BORE.x - 1, top = 33 - Math.max(0, x - cx) * 0.32 + (fbm2(x * 0.06, z * 0.06, 2) - 0.5) * 4;
    // (gone before the town's edge above the coast portal, x = -298)
    const along = smoothstep(SPUR.z0 - 8, SPUR.z0 + 6, z) * (1 - smoothstep(SPUR.z1 - 6, SPUR.z1 + 4, z));
    const across = smoothstep(SPUR.x0 - 12, SPUR.x0, x) * (1 - smoothstep(SPUR.x1 - 10, SPUR.x1 + 4, x));
    F[k] = Math.max(F[k], lerp(F[k], top, along * across));
  });
  // --- mikan terraces: a sunny stepped face from the harbour up to the headland's top,
  // blending into the wooded headland behind; never so low over the coast tunnels' mouths
  // that their portals show their backs
  // (the box as wide as the blend: cut short, the shaped ground ended in a cliff)
  each({ x0: MIKAN.x0 - 4, x1: MIKAN.x1 + 50, z0: MIKAN.z0 - 40, z1: MIKAN.z1 + 26 }, (x, z, k) => {
    const b = mikanBlend(x, z);
    if (b <= 0) return;
    const m = mikanMask(x, z);
    const y = lerp(mikanShape(x, z), mikanTerrace(x, z).y, m);
    F[k] = lerp(F[k], y, b);
    if (x < 550 && z > 46 && z < 75) F[k] = Math.max(F[k], 11.5);
  });
  // --- the harbour: a concrete apron at the foot of the headland, the basin dredged
  each({ x0: HARBOR.x0 - 6, x1: HARBOR.x1 + 6, z0: HARBOR.z0 - 2, z1: HARBOR.z1 + 6 }, (x, z, k) => {
    const H = HARBOR;
    const mx = smoothstep(H.x0 - 6, H.x0 + 2, x) * (1 - smoothstep(H.x1, H.x1 + 6, x));
    if (z < H.quay) {
      const mz = smoothstep(H.z0 - 2, H.z0 + 1, z);
      F[k] = lerp(F[k], H.y, mx * mz);
    } else {
      const mz = (1 - smoothstep(H.z1 - 4, H.z1 + 10, z)) * smoothstep(H.quay - 1, H.quay + 3, z);
      F[k] = lerp(F[k], Math.min(F[k], H.basin), mx * mz);
    }
  });

  // --- the roads: a level shelf (road and verges) at the height of the nearest point of the
  // centre line, and cut / fill slopes beyond it that every road nearby agrees with
  const lo = new Float32Array(N).fill(-1e4), hi = new Float32Array(N).fill(1e4);
  // which leg set each cell's fill limit (where it can't be met, that road gets a retaining wall)
  const loSrc = new Int16Array(N).fill(-1);
  const dist = new Float32Array(N).fill(99), near = new Float32Array(N), shelf = new Float32Array(N);
  const S_CUT = 1.1, S_FILL = 0.85, ROUND = 3;
  const rt = route();
  for (const [li, leg] of rt.legs.entries()) {
    if (leg.existing) continue;
    const half = leg.w / 2 + VERGE;
    const S = leg.samples;
    for (let i = 0; i < S.length - 1; i++) {
      const a = S[i], b = S[i + 1];
      // inside the tunnel the hill stays over the road; the gorge stays open under the bridge
      const bored = (leg.id === 'zuido' && a.z > BORE.z0 + 0.5 && b.z < BORE.z1 - 0.5) || (leg.id === 'sawa' && a.x > BRIDGE.x0 && b.x > BRIDGE.x0 && a.x < BRIDGE.x1 && b.x < BRIDGE.x1);
      // (how far its slopes reach: out to wherever the ground across it still stands outside
      // them, not just as far as the ground at the road itself would need: a hillside rising
      // on beyond a shorter reach would end in a cliff where the slope stopped)
      const fa = F[at(a.x, a.z)] ?? a.y;
      let reach = half + Math.min(46, (Math.abs(fa - a.y) + 6) / S_FILL);
      const nx = -(b.z - a.z), nz = b.x - a.x, nl = Math.hypot(nx, nz) || 1;
      for (let o = 8; o <= 46; o += 4) {
        for (const sg of [-1, 1]) {
          const f = F[at(clamp(a.x + (nx / nl) * o * sg, x0, SCULPT.x1), clamp(a.z + (nz / nl) * o * sg, z0, SCULPT.z1))];
          if (f === undefined) continue;
          const e = Math.max(0, o - half);
          if (f > a.y + e * S_CUT - 1 || f < a.y - e * S_FILL + 1) reach = Math.max(reach, Math.min(half + 46, o + 6));
        }
      }
      const bx0 = Math.floor(Math.min(a.x, b.x) - reach), bx1 = Math.ceil(Math.max(a.x, b.x) + reach);
      const bz0 = Math.floor(Math.min(a.z, b.z) - reach), bz1 = Math.ceil(Math.max(a.z, b.z) + reach);
      const dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz || 1;
      for (let z = Math.max(z0, bz0); z <= Math.min(SCULPT.z1, bz1); z++) {
        for (let x = Math.max(x0, bx0); x <= Math.min(SCULPT.x1, bx1); x++) {
          const k = (z - z0) * W + (x - x0);
          if (!active[k]) continue;
          const u = clamp(((x - a.x) * dx + (z - a.z) * dz) / l2, 0, 1);
          const px = a.x + dx * u, pz = a.z + dz * u;
          const d = Math.hypot(x - px, z - pz);
          if (d > reach) continue;
          const y = a.y + (b.y - a.y) * u;
          if (d < dist[k]) {
            dist[k] = d;
            near[k] = y;
            shelf[k] = bored ? 0 : half;
          }
          if (bored) {
            // under the bridge deck the ground keeps clear of it
            if (leg.id === 'sawa' && d < half + 2) hi[k] = Math.min(hi[k], y - 1.8);
            continue;
          }
          const e = d - half;
          if (e <= 0) continue;
          // the slopes start gently from the verge (no hard crease)
          const f = e < ROUND ? (e * e) / (2 * ROUND) : e - ROUND / 2;
          const l = y - f * S_FILL, h = y + f * S_CUT;
          if (l > lo[k]) {
            lo[k] = l;
            loSrc[k] = li;
          }
          if (h < hi[k]) hi[k] = h;
        }
      }
    }
  }
  // rest-stop pads: round level shelves at the height of the road beside them
  for (const pad of PADS) {
    const leg = rt.legs.find((l) => l.id === pad.leg);
    let best = leg.samples[0], bd = Infinity;
    for (const o of leg.samples) {
      const d = Math.hypot(o.x - pad.at[0], o.z - pad.at[1]);
      if (d < bd) {
        bd = d;
        best = o;
      }
    }
    pad.y = best.y;
    const [cx, cz] = pad.at;
    const fa = F[at(cx, cz)] ?? pad.y;
    const reach = pad.r + Math.min(30, (Math.abs(fa - pad.y) + 5) / S_FILL);
    for (let z = Math.max(z0, Math.floor(cz - reach)); z <= Math.min(SCULPT.z1, Math.ceil(cz + reach)); z++) {
      for (let x = Math.max(x0, Math.floor(cx - reach)); x <= Math.min(SCULPT.x1, Math.ceil(cx + reach)); x++) {
        const k = (z - z0) * W + (x - x0);
        if (!active[k]) continue;
        const d = Math.hypot(x - cx, z - cz);
        if (d > reach) continue;
        if (d - pad.r < dist[k] - shelf[k]) {
          // (inside the pad: level with it)
          if (d < pad.r) {
            dist[k] = 0;
            near[k] = pad.y;
            shelf[k] = 1;
          }
        }
        const e = d - pad.r;
        if (e <= 0) continue;
        const f = e < ROUND ? (e * e) / (2 * ROUND) : e - ROUND / 2;
        if (pad.y - f * S_FILL > lo[k]) {
          lo[k] = pad.y - f * S_FILL;
          loSrc[k] = -2;
        }
        hi[k] = Math.min(hi[k], pad.y + f * S_CUT);
      }
    }
  }
  // the town's edge: the town's ground is left as it is, so shaped ground beside it may rise
  // above it no more steeply than a cutting (a road's embankment up against it otherwise ended
  // in a cliff; held up here, the road gets a retaining wall instead)
  {
    const R = 30;
    const td = new Float32Array(N).fill(1e9), th = new Float32Array(N);
    for (let k = 0; k < N; k++) {
      if (!town[k]) continue;
      const i = k % W, j = (k - i) / W;
      if ((i > 0 && active[k - 1]) || (i < W - 1 && active[k + 1]) || (j > 0 && active[k - W]) || (j < H - 1 && active[k + W])) {
        td[k] = 0;
        th[k] = nat(x0 + i, z0 + j);
      }
    }
    // (two-pass chamfer distance, carrying the height of the nearest edge cell)
    const D = Math.SQRT2;
    const relax = (k, q, c) => {
      if (td[q] + c < td[k]) {
        td[k] = td[q] + c;
        th[k] = th[q];
      }
    };
    for (let j = 0; j < H; j++) {
      for (let i = 0; i < W; i++) {
        const k = j * W + i;
        if (i > 0) relax(k, k - 1, 1);
        if (j > 0) {
          relax(k, k - W, 1);
          if (i > 0) relax(k, k - W - 1, D);
          if (i < W - 1) relax(k, k - W + 1, D);
        }
      }
    }
    for (let j = H - 1; j >= 0; j--) {
      for (let i = W - 1; i >= 0; i--) {
        const k = j * W + i;
        if (i < W - 1) relax(k, k + 1, 1);
        if (j < H - 1) {
          relax(k, k + W, 1);
          if (i < W - 1) relax(k, k + W + 1, D);
          if (i > 0) relax(k, k + W - 1, D);
        }
      }
    }
    for (let k = 0; k < N; k++) {
      if (!active[k] || td[k] > R) continue;
      hi[k] = Math.min(hi[k], th[k] + 0.4 + td[k] * S_CUT);
    }
  }
  let walls = 0;
  const conflict = new Uint8Array(N);
  const zuido = rt.legs.find((l) => l.id === 'zuido');
  const boreY = zuido.samples.find((o) => o.z > (BORE.z0 + BORE.z1) / 2).y;
  const mouthY = (zm) => zuido.samples.reduce((b, o) => (Math.abs(o.z - zm) < Math.abs(b.z - zm) ? o : b)).y;
  const mouths = [[BORE.z0, 1, mouthY(BORE.z0)], [BORE.z1, -1, mouthY(BORE.z1)]];
  const zHalf = zuido.w / 2 + VERGE;
  const cutAt = (y, lat) => {
    const e = lat - zHalf;
    return e <= 0 ? y : y + (e < ROUND ? (e * e) / (2 * ROUND) : e - ROUND / 2) * S_CUT;
  };
  // behind each mouth: a rock face over the arch (the approach's cutting ends against it, the
  // face shrinking away up its sides), and the hillside climbing back from the face's top
  const mouthCap = (bx, bz) => {
    let cap = null;
    const lat = Math.abs(bx - BORE.x);
    for (const [zm, dir, y] of mouths) {
      const inside = (bz - zm) * dir;
      if (inside <= 0 || inside > 24 || lat > 26) continue;
      const c = cutAt(y, lat) + Math.max(0, 6.8 - 0.4 * Math.max(0, lat - 2)) + Math.max(0, inside - 0.5) * 0.9 + Math.max(0, inside - 8) ** 2 * 0.5;
      cap = cap === null ? c : Math.min(cap, c);
    }
    return cap;
  };
  for (let k = 0; k < N; k++) {
    if (!active[k]) continue;
    const bx = SCULPT.x0 + (k % W), bz = SCULPT.z0 + Math.floor(k / W);
    const cap = mouthCap(bx, bz);
    if (cap !== null) {
      // (the approach's cut slopes stop at the mouths; the rock over the bore stays whole)
      F[k] = Math.min(F[k], cap);
      if (bz > BORE.z0 + 0.6 && bz < BORE.z1 - 0.6) F[k] = Math.max(F[k], boreY + BORE.h + 1.6 - Math.max(0, Math.abs(bx - BORE.x) - BORE.w / 2 - 0.8) * 0.9);
      continue;
    }
    if (dist[k] < shelf[k]) {
      F[k] = near[k];
      continue;
    }
    if (lo[k] < -1e3 && hi[k] > 1e3) continue;
    if (lo[k] <= hi[k]) F[k] = clamp(F[k], lo[k], hi[k]);
    else if (lo[k] - hi[k] > 0.6 && loSrc[k] >= 0 && rt.legs[loSrc[k]].id !== 'sawa') {
      // too steep for both slopes: the lower road's cut wins, the upper road is held by a wall
      F[k] = hi[k];
      conflict[k] = 1;
      walls++;
    } else F[k] = (lo[k] + hi[k]) / 2;
  }
  if (rules.floor) {
    for (let k = 0; k < N; k++) if (active[k]) F[k] = Math.max(F[k], rules.floor(x0 + (k % W), z0 + Math.floor(k / W)));
  }
  if (rules.fix) {
    for (let k = 0; k < N; k++) {
      if (!active[k]) continue;
      const y = rules.fix(x0 + (k % W), z0 + Math.floor(k / W));
      if (y !== null) F[k] = y;
    }
  }
  const delta = new Float32Array(N);
  for (let k = 0; k < N; k++) if (active[k]) delta[k] = F[k] - base[k];
  const wallBy = new Int16Array(N).fill(-1);
  for (let k = 0; k < N; k++) if (conflict[k]) wallBy[k] = loSrc[k];
  SC = { W, H, delta, F, active, dist, walls, conflict, wallBy, ms: (typeof performance !== 'undefined' ? performance.now() : 0) - t0 };
  return SC;
}

function bilinear(arr, x, z, outside = 0) {
  const fx = x - SCULPT.x0, fz = z - SCULPT.z0;
  if (fx < 0 || fz < 0 || fx >= SC.W - 1 || fz >= SC.H - 1) return outside;
  const i = Math.floor(fx), j = Math.floor(fz);
  const u = fx - i, v = fz - j;
  const k = j * SC.W + i;
  const a = arr[k], b = arr[k + 1], c = arr[k + SC.W], d = arr[k + SC.W + 1];
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

// change (m) the hills' shaping makes to the natural ground at (x, z)
export function sculptDelta(x, z) {
  return SC ? bilinear(SC.delta, x, z, 0) : 0;
}

// the shaped ground itself at (x, z) where all four raster points round it were shaped
// (null elsewhere): the natural ground has hard edges here and there (the portals' hills
// begin at a line) that a change added to it would carry onto the shaped slopes and roads
export function sculptHeight(x, z) {
  if (!SC) return null;
  const fx = x - SCULPT.x0, fz = z - SCULPT.z0;
  if (fx < 0 || fz < 0 || fx >= SC.W - 1 || fz >= SC.H - 1) return null;
  const k = Math.floor(fz) * SC.W + Math.floor(fx);
  const A = SC.active;
  if (!A[k] || !A[k + 1] || !A[k + SC.W] || !A[k + SC.W + 1]) return null;
  return bilinear(SC.F, x, z, 0);
}

// height of a road's cut slope `lat` metres from the centre of a road `w` wide at height y
export function cutSlopeAt(y, lat, w) {
  const e = lat - (w / 2 + VERGE);
  return e <= 0 ? y : y + (e < 3 ? (e * e) / 6 : e - 1.5) * 1.1;
}

// index (in route().legs) of the road a retaining wall must hold up at (x, z), or -1
export function wallBy(x, z) {
  if (!SC) return -1;
  const i = Math.round(x - SCULPT.x0), j = Math.round(z - SCULPT.z0);
  if (i < 0 || j < 0 || i >= SC.W || j >= SC.H) return -1;
  return SC.wallBy[j * SC.W + i];
}

// what the loop's places sound like from (x, z): the nearest point of the gorge's stream and
// the waterfall, how deep in the bamboo grove, how far from the paddies, the open fields, the
// plateau and its nearest turbine, the harbour; whether in the tunnel
export function ambienceAt(x, z) {
  let sx = 0, sz = 0, sd = Infinity;
  const P = STREAM.pts;
  for (let i = 0; i < P.length - 1; i++) {
    const [ax, az] = P[i], [bx, bz] = P[i + 1];
    const dx = bx - ax, dz = bz - az;
    const u = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz), 0, 1);
    const d = Math.hypot(x - ax - dx * u, z - az - dz * u);
    if (d < sd) {
      sd = d;
      sx = ax + dx * u;
      sz = az + dz * u;
    }
  }
  const box = (b) => Math.hypot(Math.max(b.x0 - x, 0, x - b.x1), Math.max(b.z0 - z, 0, z - b.z1));
  const paddy = box({ x0: RICE.x - RICE.half, x1: RICE.x + RICE.half, z0: RICE.z1, z1: RICE.z0 });
  let mill = null;
  for (const [mx, mz] of PAMPAS.mills) {
    const d = Math.hypot(x - mx, z - mz);
    if (!mill || d < mill.d) mill = { x: mx, z: mz, d };
  }
  return {
    stream: { x: sx, z: sz, y: streamBed(sz) + 0.4, d: sd, fall: Math.hypot(x - 184, z - STREAM.fall) },
    bamboo: x < -176 && z > -176 && z < 8 ? clamp(1.4 - roadDist(x, z) / 22, 0, 1) : 0,
    paddy,
    fields: Math.min(paddy, box(TEA), box(PAMPAS), box(MIKAN)),
    plateau: box(PAMPAS),
    mill,
    harbor: box({ x0: HARBOR.x0, x1: HARBOR.x1, z0: HARBOR.z0, z1: HARBOR.quay + 4 }),
    tunnel: Math.abs(x - BORE.x) < BORE.w / 2 + 0.5 && z > BORE.z0 && z < BORE.z1,
  };
}

// distance (m) from (x, z) to the nearest new road's centre line (99: far)
export function roadDist(x, z) {
  return SC ? bilinear(SC.dist, x, z, 99) : 99;
}

// on a new road's level shelf (road and verges), a rest stop or the lighthouse's knoll: where
// walking and riding the hills is allowed
export function onRoute(x, z) {
  if (roadDist(x, z) < ROAD_W / 2 + VERGE - 0.3) return true;
  for (const [wx, wz, r] of WALK_ZONES) if ((x - wx) ** 2 + (z - wz) ** 2 < r * r) return true;
  return false;
}
