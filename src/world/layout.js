// Town plan for 桜ヶ浜 (Sakuragahama): a seaside town on a gentle slope, cut by a small
// river (桜川) with a newer commercial district (桜ヶ浜中央) on its east bank.
// Coordinates: x = east, z = south (toward the sea), y = up. Units are meters.
//
//  z = -175 .. -125  shrine terrace on the hill (汐見神社)
//  z = -125 .. 47    residential slope (西町 / 一〜三丁目), commercial district east of the river
//  z =  28 .. 50     station plaza, shotengai runs north from it
//  z =  51.5 .. 60   single track railway (桜ヶ浜線) with level crossings
//  z =  61.5 .. 68.5 coastal road (海岸通り), promenade on the sea wall
//  z =  73 ..        sand beach, breakwater + lighthouse to the west, river mouth
//  x ≈ 182           桜川 from a culvert under the hills down to the sea, sakura paths on both banks
//  x = 198 .. 318    桜ヶ浜中央: avenue, mall, plaza and the underground subway station
//  x = 324 .. 478    東町: 桜ヶ浜高校 on two terraces up the slope, the general hospital, post
//                    office, police box and houses toward the railway

import { RNG, fbm2, noise2, smoothstep, clamp, softPlus, lerp } from '../core/rng.js';

export const RAIL_Z = 56;
export const RAIL_Y = 3.0;
export const COAST = { z0: 61.5, z1: 68.5, y: 3.0 };
export const SIDEWALK_S = { z0: 60.0, z1: 61.5 };
export const PROM = { z0: 68.5, z1: 73.0, y: 3.32 };
export const SEAWALL_Z = 73.0;

// flat valley north of the railway / flat coastal strip south of it / tunnel portals in the headlands
export const TOWN = { x0: -236, x1: 478, zN: -127 };
export const SHORE = { x0: -296, x1: 536 };
export const TUNNEL = { w: -298, e: 538 };
export const BOUNDS = { x0: -292, x1: 532, z0: -182, z1: 190 };

// 桜川: channel between x = 174 and 190, 2 m revetment walls, 8 m sakura paths on both banks
export const RIVER = { x: 182, inner: 8, wall: 2, zHead: -126, pathW: [166, 174], pathE: [190, 198] };

export const STATION = { x0: -46, x1: -24, z0: 41.5, z1: 51.5, platX0: -64, platX1: -6, platZ0: 51.6, platZ1: 54.35, platY: 3.95 };
export const PLAZA = { x0: -67.5, x1: -8, z0: 22.5, z1: 50 };
export const SHRINE = { x: 30, z0: -128.5, z1: -146, y: 20.6, terraceZ0: -146, terraceZ1: -172, terraceX0: 6, terraceX1: 54 };
export const PARK = { x0: -67.5, x1: -37.5, z0: -47.5, z1: -17.5 };
export const CROSSINGS = [-195, -70, 30, 115, 218, 324];
export const BEACH_STAIRS = [-252, -195, -70, 30, 115, 218, 300, 330, 430, 505];
export const BREAKWATER = { x: -150, z0: 84, z1: 178, w: 5.2 };

// Underground station 桜ヶ浜中央 under the avenue: B1 concourse at the north end, B2 island platform.
export const SUBWAY = {
  x0: 240, x1: 264, z0: -48, z1: 22, // B2 hall (outer walls)
  yP: -4.4, // platform floor
  yC: 0.8, // concourse floor
  concZ1: -18, // concourse slab covers z0 .. concZ1
  hall: { x0: 243.2, x1: 260.8 }, // B2 track walls (inner faces)
  plat: { x0: 248, x1: 256, z0: -44, z1: 16 },
  tracks: [246.45, 257.55], // west: northbound, east: southbound (trains keep left)
  stop: -14, // train centre when stopped
  stair: { x0: 250.2, x1: 254.2, z0: -30, z1: -20.5 }, // B1 -> B2 (stairs + escalator)
  // street stairwells (holes in the ground mesh, aligned to its 2 m grid)
  exits: [
    { id: 1, x0: 236, x1: 240, z0: -38, z1: -24 },
    { id: 2, x0: 264, x1: 268, z0: -38, z1: -24 },
  ],
};
// openings cut out of the ground mesh: subway stairwells and the tunnel mouths behind the portals
export const HOLES = [
  ...SUBWAY.exits,
  { x0: TUNNEL.w - 2, x1: TUNNEL.w, z0: 52, z1: 70 },
  { x0: TUNNEL.e, x1: TUNNEL.e + 2, z0: 52, z1: 70 },
];

// 桜ヶ浜高校: the campus fills the block east of 東町通り between the 中央三丁目 and 中央一丁目
// streets. The town slope is cut into two flat terraces, the school buildings (low, south)
// and the sports ground (high, north), with a retaining wall between them at z = -62..-60;
// grass banks two metres wide take up the difference to the streets around.
export const SCHOOL = {
  x0: 330, x1: 476, z0: -114, z1: -22,
  wall: [-62, -60], // retaining wall between the terraces (its top is the ground's edge)
  yLow: 6.5, // building terrace (z -60 .. -22)
  yHigh: 9.9, // sports ground (z -114 .. -62)
};
// the other blocks of 東町 (south of the school)
export const EAST2 = {
  hospital: { x0: 329, x1: 395, z0: -9.6, z1: 14.6 },
  post: { x0: 405, x1: 476, z0: -9.6, z1: 14.6 },
  southW: { x0: 329, x1: 395, z0: 25.4, z1: 44.6 },
  southE: { x0: 405, x1: 476, z0: 25.4, z1: 44.6 },
};

export const WORLD_SEED = 20260409;

// ---------------------------------------------------------------------------
// Heights
// ---------------------------------------------------------------------------

export function townH(z) {
  const d = softPlus(30 - z, 6);
  return 3.0 + 0.046 * d + 0.024 * softPlus(d - 60, 15);
}

export function shoreZ(x) {
  return 98 + 3.5 * Math.sin(0.011 * x + 0.6) + 1.8 * Math.sin(0.027 * x + 2.1);
}

export function beachH(x, z) {
  const s = shoreZ(x);
  const d = s - z; // > 0 on land
  let h;
  if (d >= 0) {
    h = d * 0.052;
    // soft dunes near the sea wall
    const dune = (1 - smoothstep(SEAWALL_Z, SEAWALL_Z + 12, z)) * (noise2(x * 0.08, z * 0.15) - 0.4) * 0.35;
    h += dune;
  } else {
    const u = -d;
    h = -u * 0.052;
    if (u > 45) h = -45 * 0.052 - (u - 45) * 0.02;
    h += (noise2(x * 0.03, z * 0.03) - 0.5) * 0.4 * smoothstep(10, 40, u);
  }
  return h;
}

// signed distance to an axis aligned rect (negative inside)
function rectDist(x, z, x0, x1, z0, z1) {
  const dx = Math.max(x0 - x, x - x1);
  const dz = Math.max(z0 - z, z - z1);
  if (dx > 0 && dz > 0) return Math.hypot(dx, dz);
  return Math.max(dx, dz);
}

// how far (m) a point lies outside the flat valley (negative = inside): the town basin
// north of the railway plus the wider coastal strip, so the hills slope down to the line
export function outsideDist(x, z) {
  return Math.min(rectDist(x, z, TOWN.x0, TOWN.x1, TOWN.zN, 51), rectDist(x, z, SHORE.x0, SHORE.x1, 51, 1e6));
}

function hillHeight(x, z, d) {
  if (d <= 0) return 0;
  const n = fbm2(x * 0.008 + 3.1, z * 0.008 - 1.7, 4);
  const n2 = fbm2(x * 0.03, z * 0.03, 3);
  let h = smoothstep(0, 22, d) * (5 + d * 0.42) * (0.7 + 0.6 * n) + (n2 - 0.5) * 3 * smoothstep(0, 30, d);
  h = Math.min(h, 46 + 40 * n);
  // headlands sink into the sea further south
  if (z > 60) h *= 1 - smoothstep(118, 190, z + n * 25);
  return h;
}

// Uncarved ground: town slope, beach, hills, shrine terrace, tunnel cuttings.
// Roads and bridges follow this surface; the river channel is carved by terrainH.
export function groundH(x, z) {
  let h;
  if (z <= SEAWALL_Z) h = townH(Math.min(z, 61));
  else h = beachH(x, z);

  const d = outsideDist(x, z);
  let hill = hillHeight(x, z, d);
  if (z > 46 && z < 74) {
    // portals for rail and road: the hill rises right behind the concrete face walls
    const c = Math.max(TUNNEL.w - x, x - TUNNEL.e);
    if (c > 0) hill = Math.max(hill, clamp(c / 2, 0, 1) * 10 + c * 0.35);
    else if (z > 49 && z < 71) hill = 0;
  }
  h += hill;

  // shrine terrace
  const sx = SHRINE;
  if (z < sx.z0 + 2 && x > sx.terraceX0 - 14 && x < sx.terraceX1 + 14) {
    const inX = smoothstep(sx.terraceX0 - 14, sx.terraceX0, x) * (1 - smoothstep(sx.terraceX1, sx.terraceX1 + 14, x));
    if (z <= sx.terraceZ0) {
      const inZ = smoothstep(sx.terraceZ1 - 16, sx.terraceZ1, z);
      const k = inX * inZ;
      h = h * (1 - k) + sx.y * k;
    } else {
      // stair slope corridor (x within +-5 of the stairs)
      const t = clamp((sx.z0 - z) / (sx.z0 - sx.terraceZ0), 0, 1);
      const ys = townH(sx.z0) + (sx.y - townH(sx.z0)) * t;
      const cor = 1 - smoothstep(4, 9, Math.abs(x - sx.x));
      const k = cor * inX;
      h = h * (1 - k) + ys * k;
      // the slope outside the corridor rises at least as fast as the stairs
      h = Math.max(h, ys * inX * smoothstep(sx.z0, sx.z0 - 4, z) - 0.2);
    }
  }

  // 桜ヶ浜高校: flat terraces (the step between them hides inside the retaining wall)
  const sc = SCHOOL;
  if (x >= sc.x0 && x <= sc.x1 && z >= sc.z0 && z <= sc.z1) {
    if (z <= sc.wall[0]) return sc.yHigh;
    if (z >= sc.wall[1]) return sc.yLow;
    return lerp(sc.yHigh, sc.yLow, (z - sc.wall[0]) / (sc.wall[1] - sc.wall[0]));
  }
  return h;
}

// ---------------------------------------------------------------------------
// River 桜川: pools stepping down toward the sea over short sloped weirs (床止め)
// ---------------------------------------------------------------------------
export const BRIDGES = [
  { id: 'e-50e', z0: -55, z1: -45, kind: 'road', name: '汐見橋' },
  { id: 'e20e', z0: 15, z1: 25, kind: 'road', name: '桜橋' },
  { id: 'rail-e', z0: 45, z1: 50, kind: 'lane', name: '線路沿いの小橋' },
  { id: 'rail', z0: 53.2, z1: 58.8, kind: 'rail', name: '桜川橋梁' },
  { id: 'coast', z0: 60, z1: 68.5, kind: 'road', name: '河口橋' },
  { id: 'prom', z0: 68.5, z1: 73, kind: 'prom', name: '遊歩道橋' },
];
export const STEPPING_Z = -15; // stepping stones where the e-15 lanes end at the river

function bankH(z) {
  return townH(Math.min(z, 61));
}

export const WEIRS = [];
const RIVER_L0 = bankH(RIVER.zHead) - 2.6;
let RIVER_LEND = RIVER_L0;
(function computeWeirs() {
  // Greedy: drop when enough fall has built up, or earlier when the next chance to drop
  // (past a bridge or the stepping stones) would leave too little headroom under a deck.
  let level = RIVER_L0;
  const allowed = (z) => !BRIDGES.some((b) => z + 2 > b.z0 - 3 && z < b.z1 + 3) && Math.abs(z + 1 - STEPPING_Z) >= 9;
  for (let z = RIVER.zHead + 6; z < 42; z += 2) {
    if (!allowed(z)) continue;
    let zn = z + 2;
    while (zn < 44 && !allowed(zn)) zn += 2;
    const forced = bankH(zn) - level < 2.25;
    const natural = level - (bankH(z + 2) - 2.75) >= 0.8;
    if (!forced && !natural) continue;
    let to = Math.min(bankH(z + 2) - 2.75, bankH(zn) - 2.3);
    to = Math.max(to, level - 1.2);
    if (level - to < 0.25) continue;
    WEIRS.push({ z, from: level, to });
    level = to;
  }
  RIVER_LEND = level;
})();

// water surface height of the river at z
export function riverLevel(z) {
  if (z > SEAWALL_Z) {
    const s = shoreZ(RIVER.x);
    return lerp(RIVER_LEND, 0.04, clamp((z - SEAWALL_Z) / (s - SEAWALL_Z), 0, 1));
  }
  let L = RIVER_L0;
  for (const w of WEIRS) {
    if (z < w.z) break;
    if (z < w.z + 2) return w.from + ((w.to - w.from) * (z - w.z)) / 2;
    L = w.to;
  }
  return L;
}

// river half width at z (walled channel in town, widening across the beach)
export function riverHalfWidth(z) {
  return z <= SEAWALL_Z ? RIVER.inner : RIVER.inner + (z - SEAWALL_Z) * 0.3;
}

export function riverBed(x, z) {
  const hw = riverHalfWidth(z);
  const a = Math.min(1, Math.abs(x - RIVER.x) / hw);
  const depth = z > SEAWALL_Z ? 0.12 + 0.3 * (1 - a * a) : 0.16 + 0.36 * (1 - a * a);
  // pebbly unevenness on the bed
  return riverLevel(z) - depth + (noise2(x * 0.7, z * 0.7) - 0.5) * 0.08;
}

// is (x,z) over river water (inside the channel)?
export function inRiver(x, z) {
  if (z < RIVER.zHead || z > shoreZ(RIVER.x) + 2) return false;
  return Math.abs(x - RIVER.x) < riverHalfWidth(z);
}

// Terrain height (ground mesh): groundH with the river channel carved in.
// Walkable overrides (stairs, platforms, bridges) live in collision.js.
export function terrainH(x, z) {
  const g = groundH(x, z);
  const dx = Math.abs(x - RIVER.x);
  if (z < RIVER.zHead - 2) return g;
  if (z <= SEAWALL_Z + 1.4) {
    // walled channel: the transition is hidden inside the 2 m revetment walls (and the headwall)
    if (dx >= RIVER.inner + RIVER.wall) return g;
    const bed = riverBed(x, z);
    let k = dx <= RIVER.inner ? 1 : 1 - (dx - RIVER.inner) / RIVER.wall;
    if (z < RIVER.zHead) k *= (z - (RIVER.zHead - 2)) / 2;
    return lerp(g, bed, k);
  }
  // across the beach: a shallow channel with sloping sand banks
  const s = shoreZ(RIVER.x);
  if (z > s + 14) return g;
  const hw = riverHalfWidth(z);
  if (dx > hw + 12) return g;
  const bed = riverBed(x, z);
  const edge = riverBed(RIVER.x + hw, z);
  const h = dx <= hw ? bed : edge + (dx - hw) * 0.32;
  const fade = 1 - smoothstep(s + 4, s + 14, z);
  return lerp(g, Math.min(g, h), fade);
}

// ---------------------------------------------------------------------------
// Roads (all axis aligned). axis 'x' = runs east-west (constant z = c).
// style: 1 lane, 2 two-lane (Sakura-zaka), 3 coastal, 6 shotengai paving,
//        10 riverside path, 11 avenue (four lanes), 12 urban two-lane; swStyle = sidewalk style
// ---------------------------------------------------------------------------
export const ROADS = [
  { id: 'coast', axis: 'x', c: 65, a: TUNNEL.w - 1, b: TUNNEL.e + 1, w: 7, style: 3, name: '海岸通り' },
  { id: 'rail-w', axis: 'x', c: 47.5, a: TOWN.x0, b: -62, w: 5, style: 1, name: '線路沿いの道' },
  { id: 'rail-e', axis: 'x', c: 47.5, a: -8, b: TOWN.x1, w: 5, style: 1, name: '線路沿いの道' },
  { id: 'e20', axis: 'x', c: 20, a: TOWN.x0, b: 166, w: 5, style: 1, name: '桜ヶ浜一丁目' },
  { id: 'e-15', axis: 'x', c: -15, a: TOWN.x0, b: 166, w: 5, style: 1, name: '桜ヶ浜二丁目' },
  { id: 'e-50', axis: 'x', c: -50, a: TOWN.x0, b: 166, w: 5, style: 1, name: '桜ヶ浜二丁目' },
  { id: 'e-85', axis: 'x', c: -85, a: TOWN.x0, b: 166, w: 5, style: 1, name: '桜ヶ浜三丁目' },
  { id: 'e-120', axis: 'x', c: -120, a: TOWN.x0, b: 166, w: 5, style: 1, name: '桜ヶ浜三丁目' },
  // east of the river (two lanes with sidewalks); two of them cross it on bridges
  { id: 'e20e', axis: 'x', c: 20, a: 166, b: TOWN.x1, w: 6, sidewalk: 2, style: 12, swStyle: 13, name: '桜橋通り' },
  { id: 'e-15e', axis: 'x', c: -15, a: 198, b: TOWN.x1, w: 6, sidewalk: 2, style: 12, swStyle: 13, name: '中央一丁目' },
  // these two end at 東町通り (the school is beyond)
  { id: 'e-50e', axis: 'x', c: -50, a: 166, b: 328.5, w: 6, sidewalk: 2, style: 12, swStyle: 13, name: '汐見橋通り' },
  { id: 'e-85e', axis: 'x', c: -85, a: 198, b: 328.5, w: 6, sidewalk: 2, style: 12, swStyle: 13, name: '中央二丁目' },
  { id: 'e-120e', axis: 'x', c: -120, a: 198, b: TOWN.x1, w: 6, sidewalk: 2, style: 12, swStyle: 13, name: '中央三丁目' },
  { id: 'n-195', axis: 'z', c: -195, a: -122.5, b: 61.5, w: 5, style: 1, crossing: true },
  { id: 'n-146', axis: 'z', c: -146, a: -122.5, b: 50, w: 4.6, style: 1 },
  { id: 'n-115', axis: 'z', c: -115, a: -122.5, b: 50, w: 4.6, style: 1 },
  { id: 'n-70', axis: 'z', c: -70, a: -122.5, b: 61.5, w: 5, style: 1, crossing: true },
  { id: 'shotengai', axis: 'z', c: -35, a: -52.5, b: 17.5, w: 7, style: 6, name: '浜通り商店街' },
  { id: 'n-35', axis: 'z', c: -35, a: -122.5, b: -52.5, w: 5, style: 1 },
  { id: 'sakura', axis: 'z', c: 30, a: -122.5, b: 61.5, w: 6.4, style: 2, sidewalk: 1.9, crossing: true, name: '桜坂' },
  { id: 'n75', axis: 'z', c: 75, a: -122.5, b: 50, w: 5, style: 1 },
  { id: 'n115', axis: 'z', c: 115, a: -122.5, b: 61.5, w: 5, style: 1, crossing: true },
  { id: 'n146', axis: 'z', c: 146, a: -122.5, b: 50, w: 4.6, style: 1 },
  { id: 'riverW', axis: 'z', c: 170, a: RIVER.zHead, b: 50, w: 8, style: 10, path: true, name: '桜川の遊歩道' },
  { id: 'riverE', axis: 'z', c: 194, a: RIVER.zHead, b: 50, w: 8, style: 10, path: true, name: '桜川の遊歩道' },
  { id: 'n218', axis: 'z', c: 218, a: -125, b: 61.5, w: 6, sidewalk: 1.5, style: 12, swStyle: 13, crossing: true },
  { id: 'avenue', axis: 'z', c: 252, a: -125, b: 50, w: 10, sidewalk: 4, style: 11, swStyle: 13, name: '中央通り' },
  { id: 'n292', axis: 'z', c: 292, a: -125, b: 50, w: 6, sidewalk: 1.5, style: 12, swStyle: 13 },
  // 東町: down from the school to the sea, across the railway; and past the hospital
  { id: 'n324', axis: 'z', c: 324, a: -125, b: 61.5, w: 6, sidewalk: 1.5, style: 12, swStyle: 13, crossing: true, name: '東町通り' },
  { id: 'n400', axis: 'z', c: 400, a: -20, b: 50, w: 6, sidewalk: 1.5, style: 12, swStyle: 13, name: '病院通り' },
];

export function roadRect(r) {
  const half = r.w / 2 + (r.sidewalk || 0);
  if (r.axis === 'x') return { x0: r.a, x1: r.b, z0: r.c - half, z1: r.c + half };
  return { x0: r.c - half, x1: r.c + half, z0: r.a, z1: r.b };
}

export function roadAt(x, z, margin = 0, exclude = null) {
  for (const r of ROADS) {
    if (r === exclude) continue;
    const q = roadRect(r);
    if (x > q.x0 - margin && x < q.x1 + margin && z > q.z0 - margin && z < q.z1 + margin) return r;
  }
  return null;
}

// over the river channel (bridge spans included)?
export function overRiver(x, z, margin = 0) {
  return Math.abs(x - RIVER.x) < RIVER.inner + RIVER.wall + margin && z > RIVER.zHead - 2 && z < SEAWALL_Z + 2;
}

// ---------------------------------------------------------------------------
// Blocks and lots (residential: west + centre)
// ---------------------------------------------------------------------------
const XS = [TOWN.x0, -195, -146, -115, -70, -35, 30, 75, 115, 146, RIVER.pathW[0]];
const ZS = [-120, -85, -50, -15, 20, 47.5];

function roadHalf(axis, c, along) {
  // half width of road (incl. sidewalks) at a grid line, for the part of the road covering `along`
  for (const r of ROADS) {
    if (r.axis === axis && Math.abs(r.c - c) < 0.01 && along >= r.a - 3 && along <= r.b + 3) return r.w / 2 + (r.sidewalk || 0);
  }
  return 0;
}

export const LOT_TYPES = ['house', 'oldhouse', 'apartment', 'mansion', 'shop', 'parking', 'garden', 'field', 'sento'];

export function generateLots() {
  const rng = new RNG(WORLD_SEED);
  const lots = [];
  for (let i = 0; i < XS.length - 1; i++) {
    for (let j = 0; j < ZS.length - 1; j++) {
      const x0 = XS[i], x1 = XS[i + 1], z0 = ZS[j], z1 = ZS[j + 1];
      const midZ = (z0 + z1) / 2, midX = (x0 + x1) / 2;
      const hwW = i === 0 ? 0 : roadHalf('z', x0, midZ) || 2.5;
      const hwE = i === XS.length - 2 ? 0 : roadHalf('z', x1, midZ) || 2.5;
      const hwN = roadHalf('x', z0, midX) || 2.5;
      const hwS = roadHalf('x', z1, midX) || 2.5;
      const bx0 = x0 + hwW + 0.4, bx1 = x1 - hwE - 0.4, bz0 = z0 + hwN + 0.4, bz1 = z1 - hwS - 0.4;
      const block = { x0: bx0, x1: bx1, z0: bz0, z1: bz1, i, j };

      // special blocks
      if (rectOverlap(block, PARK)) continue;
      if (rectOverlap(block, PLAZA)) {
        if (block.x1 > PLAZA.x1 + 8) block.x0 = PLAZA.x1 + 0.5;
        else continue;
      }

      const frontage = [];
      // which sides get dedicated frontage lots
      const shotengaiW = x0 === -35 && z1 <= 21 && z0 >= -52.5; // block east of shotengai
      const shotengaiE = x1 === -35 && z1 <= 21 && z0 >= -52.5; // block west of shotengai
      const sakuraW = x0 === 30;
      const sakuraE = x1 === 30;
      let ix0 = block.x0, ix1 = block.x1;
      const depthS = shotengaiW || shotengaiE ? 12 : 13;
      if (shotengaiW) {
        frontage.push(...stripLots(rng, block.x0, block.x0 + depthS, block.z0, block.z1, 'W', 'shop', 6.5, 8.5, 'shotengai'));
        ix0 = block.x0 + depthS + 0.3;
      }
      if (shotengaiE) {
        frontage.push(...stripLots(rng, block.x1 - depthS, block.x1, block.z0, block.z1, 'E', 'shop', 6.5, 8.5, 'shotengai'));
        ix1 = block.x1 - depthS - 0.3;
      }
      if (sakuraW && !shotengaiW) {
        frontage.push(...stripLots(rng, block.x0, block.x0 + depthS, block.z0, block.z1, 'W', null, 10, 13, 'sakura'));
        ix0 = block.x0 + depthS + 0.3;
      }
      if (sakuraE && !shotengaiE) {
        frontage.push(...stripLots(rng, block.x1 - depthS, block.x1, block.z0, block.z1, 'E', null, 10, 13, 'sakura'));
        ix1 = block.x1 - depthS - 0.3;
      }
      lots.push(...frontage);
      if (ix1 - ix0 < 8) continue;
      const depth = block.z1 - block.z0;
      if (depth > 22.5) {
        const mid = (block.z0 + block.z1) / 2;
        lots.push(...rowLots(rng, ix0, ix1, block.z0, mid - 0.15, 'N'));
        lots.push(...rowLots(rng, ix0, ix1, mid + 0.15, block.z1, 'S'));
      } else {
        lots.push(...rowLots(rng, ix0, ix1, block.z0, block.z1, 'N'));
      }
    }
  }
  assignTypes(rng, lots);
  return lots;
}

export function rectOverlap(a, b) {
  return a.x0 < b.x1 && a.x1 > b.x0 && a.z0 < b.z1 && a.z1 > b.z0;
}

function rowLots(rng, x0, x1, z0, z1, front) {
  const lots = [];
  const total = x1 - x0;
  const n = Math.max(1, Math.round(total / rng.range(10.5, 12.5)));
  const widths = [];
  let sum = 0;
  for (let k = 0; k < n; k++) {
    const w = rng.range(0.8, 1.2);
    widths.push(w);
    sum += w;
  }
  let x = x0;
  for (let k = 0; k < n; k++) {
    const w = (widths[k] / sum) * total;
    lots.push({ x0: x + 0.15, x1: x + w - 0.15, z0, z1, front, street: null, type: null });
    x += w;
  }
  return lots;
}

// lots along a N-S street (front = 'W' means the street is on the west side)
function stripLots(rng, x0, x1, z0, z1, front, type, wMin, wMax, street) {
  const lots = [];
  const total = z1 - z0;
  const n = Math.max(1, Math.round(total / ((wMin + wMax) / 2)));
  const ws = [];
  let sum = 0;
  for (let k = 0; k < n; k++) {
    const w = rng.range(0.85, 1.15);
    ws.push(w);
    sum += w;
  }
  let z = z0;
  for (let k = 0; k < n; k++) {
    const w = (ws[k] / sum) * total;
    lots.push({ x0, x1, z0: z + 0.15, z1: z + w - 0.15, front, street, type });
    z += w;
  }
  return lots;
}

function assignTypes(rng, lots) {
  for (const lot of lots) {
    lot.seed = rng.int(1, 1e9);
    if (lot.type) continue;
    const w = lot.front === 'N' || lot.front === 'S' ? lot.x1 - lot.x0 : lot.z1 - lot.z0;
    const cz = (lot.z0 + lot.z1) / 2;
    const upper = cz < -60;
    lot.type = rng.weighted([
      ['house', 62],
      ['oldhouse', 13],
      ['apartment', w > 11 ? 9 : 2],
      ['parking', 4],
      ['garden', 3],
      ['field', upper ? 4 : 1.5],
      ['mansion', upper && w > 12 ? 2.5 : 0],
    ]);
  }
  // a few guaranteed specials
  const pick = (filter) => {
    const c = lots.filter(filter);
    return c.length ? c[Math.floor(rng.next() * c.length)] : null;
  };
  const sento = pick((l) => l.type === 'house' && l.z0 > -90 && l.z1 < -55 && l.x0 > 35 && l.x1 < 75);
  if (sento) sento.type = 'sento';
  // corner stores with vending machines
  for (let k = 0; k < 4; k++) {
    const s = pick((l) => l.type === 'house' && (l.front === 'N' || l.front === 'S') && l.x1 - l.x0 > 9);
    if (s) s.type = 'cornershop';
  }
}

// ---------------------------------------------------------------------------
// Commercial district blocks (east of the river): columns A..D, rows 0 (south) .. 4 (north)
// ---------------------------------------------------------------------------
const EAST_XS = [RIVER.pathE[1], 218, 252, 292, 324];
export function eastBlocks() {
  const blocks = [];
  for (let i = 0; i < EAST_XS.length - 1; i++) {
    for (let j = 0; j < ZS.length - 1; j++) {
      const x0 = EAST_XS[i], x1 = EAST_XS[i + 1], z0 = ZS[j], z1 = ZS[j + 1];
      const midZ = (z0 + z1) / 2, midX = (x0 + x1) / 2;
      const hwW = i === 0 ? 0 : roadHalf('z', x0, midZ);
      const hwE = roadHalf('z', x1, midZ);
      const hwN = roadHalf('x', z0, midX);
      const hwS = roadHalf('x', z1, midX);
      blocks.push({
        id: 'ABCD'[i] + (ZS.length - 2 - j),
        col: i,
        row: ZS.length - 2 - j,
        x0: x0 + hwW + 0.4,
        x1: x1 - hwE - 0.4,
        z0: z0 + hwN + 0.4,
        z1: z1 - hwS - 0.4,
      });
    }
  }
  return blocks;
}

// ---------------------------------------------------------------------------
// Named areas for the location banner (first match wins; `under` = underground only)
// ---------------------------------------------------------------------------
export const AREAS = [
  { name: '地下鉄 桜ヶ浜中央駅', sub: 'Sakuragahama-Chuo Station', x0: 232, x1: 272, z0: -50, z1: 24, under: true },
  { name: '汐見神社', sub: 'Shiomi Shrine', x0: 0, x1: 60, z0: -178, z1: -127 },
  { name: '桜ヶ浜駅', sub: 'Sakuragahama Station', x0: -66, x1: -4, z0: 38, z1: 56 },
  { name: '駅前広場', sub: 'Station Plaza', x0: -62, x1: -8, z0: 27.5, z1: 41 },
  { name: '浜通り商店街', sub: 'Hamadori Shopping Street', x0: -50, x1: -20, z0: -52, z1: 27.5 },
  { name: 'ひだまり公園', sub: 'Hidamari Park', x0: PARK.x0, x1: PARK.x1, z0: PARK.z0, z1: PARK.z1 },
  { name: '桜坂', sub: 'Sakura-zaka', x0: 25, x1: 35, z0: -124, z1: 50 },
  { name: '桜坂踏切', sub: 'Sakura-zaka Crossing', x0: 22, x1: 38, z0: 50, z1: 61.5 },
  { name: '踏切', sub: 'Railway Crossing', x0: -78, x1: -62, z0: 50, z1: 61.5 },
  { name: '踏切', sub: 'Railway Crossing', x0: 107, x1: 123, z0: 50, z1: 61.5 },
  { name: '踏切', sub: 'Railway Crossing', x0: -203, x1: -187, z0: 50, z1: 61.5 },
  { name: '踏切', sub: 'Railway Crossing', x0: 210, x1: 226, z0: 50, z1: 61.5 },
  { name: '桜橋', sub: 'Sakura Bridge', x0: 172, x1: 192, z0: 15, z1: 25 },
  { name: '汐見橋', sub: 'Shiomi Bridge', x0: 172, x1: 192, z0: -55, z1: -45 },
  { name: '桜川の飛び石', sub: 'Stepping Stones', x0: 172, x1: 192, z0: STEPPING_Z - 8, z1: STEPPING_Z + 4 },
  { name: '桜川', sub: 'Sakura River', x0: 164, x1: 200, z0: -130, z1: 60 },
  { name: '桜川 河口', sub: 'River Mouth', x0: 164, x1: 200, z0: 60, z1: 112 },
  { name: '桜ヶ浜高校', sub: 'Sakuragahama High School', x0: SCHOOL.x0 - 2, x1: SCHOOL.x1, z0: SCHOOL.z0 - 2, z1: SCHOOL.z1 + 2 },
  { name: '桜ヶ浜総合病院', sub: 'Sakuragahama General Hospital', x0: EAST2.hospital.x0, x1: EAST2.hospital.x1, z0: EAST2.hospital.z0, z1: EAST2.hospital.z1 },
  { name: '踏切', sub: 'Railway Crossing', x0: 316, x1: 332, z0: 50, z1: 61.5 },
  { name: 'さくらモール', sub: 'Sakura Mall', x0: 261, x1: 288, z0: -10, z1: 15 },
  { name: '中央広場', sub: 'Chuo Plaza', x0: 222, x1: 243, z0: -10, z1: 15 },
  { name: '中央通り', sub: 'Chuo-dori Avenue', x0: 243, x1: 261, z0: -125, z1: 50 },
  { name: '海岸通り', sub: 'Coastal Road', x0: TUNNEL.w - 10, x1: TUNNEL.e + 10, z0: 60, z1: 73 },
  { name: '防波堤', sub: 'Breakwater', x0: BREAKWATER.x - 8, x1: BREAKWATER.x + 8, z0: 95, z1: 190 },
  { name: '桜ヶ浜海岸', sub: 'Sakuragahama Beach', x0: TUNNEL.w - 10, x1: TUNNEL.e + 10, z0: 73, z1: 220 },
  { name: '桜ヶ浜中央', sub: 'Chuo Commercial District', x0: 198, x1: 320, z0: -130, z1: 50 },
  { name: '東町', sub: 'Higashimachi', x0: 320, x1: 482, z0: -130, z1: 50 },
  { name: '西町', sub: 'Nishimachi', x0: -240, x1: -150, z0: -130, z1: 50 },
  { name: '桜ヶ浜 三丁目', sub: 'Residential Area', x0: -150, x1: 166, z0: -130, z1: -67 },
  { name: '桜ヶ浜 二丁目', sub: 'Residential Area', x0: -150, x1: 166, z0: -67, z1: 2 },
  { name: '桜ヶ浜 一丁目', sub: 'Residential Area', x0: -150, x1: 166, z0: 2, z1: 50 },
];

// y (feet height) selects underground areas when the player is well below the street
export function areaAt(x, z, y = null) {
  const under = y !== null && y < groundH(x, z) - 2.5;
  for (const a of AREAS) {
    if (!!a.under !== under) continue;
    if (x > a.x0 && x < a.x1 && z > a.z0 && z < a.z1) return a;
  }
  return null;
}
