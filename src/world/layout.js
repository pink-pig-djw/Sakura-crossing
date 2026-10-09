// Town plan for 桜ヶ浜 (Sakuragahama): a small seaside town on a gentle slope.
// Coordinates: x = east, z = south (toward the sea), y = up. Units are meters.
//
//  z = -150 .. -125  shrine terrace on the hill (汐見神社)
//  z = -120 .. 47    residential slope with a grid of narrow lanes
//  z =  28 .. 50     station plaza, shotengai runs north from it
//  z =  51.5 .. 60   single track railway (桜ヶ浜線) with three level crossings
//  z =  61.5 .. 68.5 coastal road (海岸通り), promenade on the sea wall
//  z =  73 ..        sand beach, breakwater + lighthouse to the west

import { RNG, fbm2, noise2, smoothstep, clamp, softPlus } from '../core/rng.js';

export const RAIL_Z = 56;
export const RAIL_Y = 3.0;
export const COAST = { z0: 61.5, z1: 68.5, y: 3.0 };
export const SIDEWALK_S = { z0: 60.0, z1: 61.5 };
export const PROM = { z0: 68.5, z1: 73.0, y: 3.32 };
export const SEAWALL_Z = 73.0;
export const STATION = { x0: -46, x1: -24, z0: 41.5, z1: 51.5, platX0: -64, platX1: -6, platZ0: 51.6, platZ1: 54.35, platY: 3.95 };
export const PLAZA = { x0: -67.5, x1: -8, z0: 22.5, z1: 50 };
export const SHRINE = { x: 30, z0: -128.5, z1: -146, y: 20.6, terraceZ0: -146, terraceZ1: -172, terraceX0: 6, terraceX1: 54 };
export const PARK = { x0: -67.5, x1: -37.5, z0: -47.5, z1: -17.5 };
export const BEACH_STAIRS = [-70, 30, 115];
export const CROSSINGS = [-70, 30, 115];
export const BREAKWATER = { x: -150, z0: 84, z1: 178, w: 5.2 };
export const TUNNEL_X = 205;

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

// half width of the flat valley at a given z
function valleyHalfWidth(z) {
  if (z < 51) return 146;
  return 203;
}

// how far (m) a point lies outside the flat valley (negative = inside)
export function outsideDist(x, z) {
  const hw = valleyHalfWidth(z);
  const dx = Math.abs(x) - hw;
  const dzN = -127 - z;
  if (dx > 0 && dzN > 0) return Math.hypot(dx, dzN);
  return Math.max(dx, dzN);
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

// Terrain height (ground mesh). Walkable overrides (stairs, platforms) live in collision.js.
export function terrainH(x, z) {
  let h;
  if (z <= SEAWALL_Z) h = townH(Math.min(z, 61));
  else h = beachH(x, z);

  // shrine terrace and its stair corridor carved into the hill
  const d = outsideDist(x, z);
  let hill = hillHeight(x, z, d);
  if (d > 0) {
    // portals for rail and road: steep cutting face
    if (z > 49 && z < 71 && Math.abs(x) > TUNNEL_X - 3) {
      const k = clamp((Math.abs(x) - (TUNNEL_X - 3)) / 3, 0, 1);
      hill = Math.max(hill, k * 10 + (Math.abs(x) - TUNNEL_X) * 0.35);
    }
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
  return h;
}

// ---------------------------------------------------------------------------
// Roads (all axis aligned). axis 'x' = runs east-west (constant z = c).
// style: 1 lane, 2 two-lane (Sakura-zaka), 3 coastal, 6 shotengai paving
// ---------------------------------------------------------------------------
export const ROADS = [
  { id: 'coast', axis: 'x', c: 65, a: -235, b: 235, w: 7, style: 3, name: '海岸通り' },
  { id: 'rail-w', axis: 'x', c: 47.5, a: -146, b: -62, w: 5, style: 1, name: '線路沿いの道' },
  { id: 'rail-e', axis: 'x', c: 47.5, a: -8, b: 146, w: 5, style: 1, name: '線路沿いの道' },
  { id: 'e20', axis: 'x', c: 20, a: -146, b: 146, w: 5, style: 1, name: '桜ヶ浜一丁目' },
  { id: 'e-15', axis: 'x', c: -15, a: -146, b: 146, w: 5, style: 1, name: '桜ヶ浜二丁目' },
  { id: 'e-50', axis: 'x', c: -50, a: -146, b: 146, w: 5, style: 1, name: '桜ヶ浜二丁目' },
  { id: 'e-85', axis: 'x', c: -85, a: -146, b: 146, w: 5, style: 1, name: '桜ヶ浜三丁目' },
  { id: 'e-120', axis: 'x', c: -120, a: -146, b: 146, w: 5, style: 1, name: '桜ヶ浜三丁目' },
  { id: 'n-115', axis: 'z', c: -115, a: -122.5, b: 50, w: 4.6, style: 1 },
  { id: 'n-70', axis: 'z', c: -70, a: -122.5, b: 61.5, w: 5, style: 1, crossing: true },
  { id: 'shotengai', axis: 'z', c: -35, a: -52.5, b: 17.5, w: 7, style: 6, name: '浜通り商店街' },
  { id: 'n-35', axis: 'z', c: -35, a: -122.5, b: -52.5, w: 5, style: 1 },
  { id: 'sakura', axis: 'z', c: 30, a: -122.5, b: 61.5, w: 6.4, style: 2, sidewalk: 1.9, crossing: true, name: '桜坂' },
  { id: 'n75', axis: 'z', c: 75, a: -122.5, b: 50, w: 5, style: 1 },
  { id: 'n115', axis: 'z', c: 115, a: -122.5, b: 61.5, w: 5, style: 1, crossing: true },
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

// ---------------------------------------------------------------------------
// Blocks and lots
// ---------------------------------------------------------------------------
const XS = [-146, -115, -70, -35, 30, 75, 115, 146];
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
      let x0 = XS[i], x1 = XS[i + 1], z0 = ZS[j], z1 = ZS[j + 1];
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

function rectOverlap(a, b) {
  return a.x0 < b.x1 && a.x1 > b.x0 && a.z0 < b.z1 && a.z1 > b.z0;
}

function rowLots(rng, x0, x1, z0, z1, front) {
  const lots = [];
  const total = x1 - x0;
  let n = Math.max(1, Math.round(total / rng.range(10.5, 12.5)));
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
  for (let k = 0; k < 3; k++) {
    const s = pick((l) => l.type === 'house' && (l.front === 'N' || l.front === 'S') && l.x1 - l.x0 > 9);
    if (s) s.type = 'cornershop';
  }
}

// ---------------------------------------------------------------------------
// Named areas for the location banner
// ---------------------------------------------------------------------------
export const AREAS = [
  { name: '汐見神社', sub: 'Shiomi Shrine', x0: 0, x1: 60, z0: -178, z1: -127 },
  { name: '桜ヶ浜駅', sub: 'Sakuragahama Station', x0: -66, x1: -4, z0: 38, z1: 56 },
  { name: '駅前広場', sub: 'Station Plaza', x0: -62, x1: -8, z0: 27.5, z1: 41 },
  { name: '浜通り商店街', sub: 'Hamadori Shopping Street', x0: -50, x1: -20, z0: -52, z1: 27.5 },
  { name: 'ひだまり公園', sub: 'Hidamari Park', x0: PARK.x0, x1: PARK.x1, z0: PARK.z0, z1: PARK.z1 },
  { name: '桜坂', sub: 'Sakura-zaka', x0: 25, x1: 35, z0: -124, z1: 50 },
  { name: '桜坂踏切', sub: 'Sakura-zaka Crossing', x0: 22, x1: 38, z0: 50, z1: 61.5 },
  { name: '踏切', sub: 'Railway Crossing', x0: -78, x1: -62, z0: 50, z1: 61.5 },
  { name: '踏切', sub: 'Railway Crossing', x0: 107, x1: 123, z0: 50, z1: 61.5 },
  { name: '海岸通り', sub: 'Coastal Road', x0: -240, x1: 240, z0: 60, z1: 73 },
  { name: '防波堤', sub: 'Breakwater', x0: BREAKWATER.x - 8, x1: BREAKWATER.x + 8, z0: 95, z1: 190 },
  { name: '桜ヶ浜海岸', sub: 'Sakuragahama Beach', x0: -240, x1: 240, z0: 73, z1: 220 },
  { name: '桜ヶ浜 三丁目', sub: 'Residential Area', x0: -150, x1: 150, z0: -130, z1: -67 },
  { name: '桜ヶ浜 二丁目', sub: 'Residential Area', x0: -150, x1: 150, z0: -67, z1: 2 },
  { name: '桜ヶ浜 一丁目', sub: 'Residential Area', x0: -150, x1: 150, z0: 2, z1: 50 },
];

export function areaAt(x, z) {
  for (const a of AREAS) if (x > a.x0 && x < a.x1 && z > a.z0 && z < a.z1) return a;
  return null;
}
