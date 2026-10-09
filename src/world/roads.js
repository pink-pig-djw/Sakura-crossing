import * as THREE from 'three';
import { ROADS, groundH, townH, PLAZA, COAST, CROSSINGS, TUNNEL, RIVER } from './layout.js';
import { PAT } from '../core/builder.js';

// Road ribbons with procedural markings (see createRoadMaterial). Roads are
// axis aligned; intersections are drawn once as plain asphalt patches.

const _c = new THREE.Color();

// Roads follow the uncarved ground (they cross the river on bridges at bank height).
export function roadSurfaceY(x, z) {
  // flat through the headland tunnels
  if (x < TUNNEL.w + 0.5 || x > TUNNEL.e - 0.5) return townH(Math.min(z, 61)) + 0.03;
  let y = groundH(x, z);
  // level crossings are a little raised (rails flush with the road)
  if (z > 51.2 && z < 60.3) {
    const k = THREE.MathUtils.smoothstep(z, 51.2, 53.2) * (1 - THREE.MathUtils.smoothstep(z, 58.8, 60.3));
    y += 0.2 * k;
  }
  return y + 0.03;
}

function halfFull(r) {
  return r.w / 2 + (r.sidewalk || 0);
}

// Emit a ribbon quad strip. along: [a, b] on the road axis; across: [s0, s1]
function ribbon(b, r, a0, a1, s0, s1, style, uBase, vBase, width) {
  const len = a1 - a0;
  if (len <= 0.01) return;
  const n = Math.max(1, Math.ceil(len / 2));
  const cols = 2;
  const base = b.count;
  _c.setRGB(width / 20, 0, 0);
  for (let i = 0; i <= n; i++) {
    const t = a0 + (len * i) / n;
    for (let j = 0; j < cols; j++) {
      const s = j === 0 ? s0 : s1;
      const x = r.axis === 'x' ? t : s;
      const z = r.axis === 'x' ? s : t;
      const y = roadSurfaceY(x, z);
      // normal from finite differences
      const e = 0.5;
      const dx = roadSurfaceY(x + e, z) - roadSurfaceY(x - e, z);
      const dz = roadSurfaceY(x, z + e) - roadSurfaceY(x, z - e);
      const nl = Math.hypot(dx, 2 * e, dz);
      const u = uBase + (s - s0);
      const v = vBase + (t - a0);
      b.vtx(x, y, z, -dx / nl, (2 * e) / nl, -dz / nl, _c, r.axis === 'x' ? u : u, v, style);
    }
  }
  for (let i = 0; i < n; i++) {
    const p = base + i * 2;
    if (r.axis === 'x') b.idx.push(p, p + 1, p + 3, p, p + 3, p + 2);
    else b.idx.push(p, p + 2, p + 3, p, p + 3, p + 1);
  }
}

export function buildRoads(ctx) {
  const { builders } = ctx;
  const ew = ROADS.filter((r) => r.axis === 'x');
  const ns = ROADS.filter((r) => r.axis === 'z');
  const cuts = new Map(); // road id -> [[a,b], ...] intervals to skip
  const patches = [];
  const addCut = (r, a, b) => {
    if (!cuts.has(r.id)) cuts.set(r.id, []);
    cuts.get(r.id).push([a, b]);
  };
  for (const R of ew) {
    const rz0 = R.c - R.w / 2, rz1 = R.c + R.w / 2;
    for (const S of ns) {
      const sx0 = S.c - halfFull(S), sx1 = S.c + halfFull(S);
      if (sx1 <= R.a || sx0 >= R.b) continue;
      const oz0 = Math.max(rz0, S.a), oz1 = Math.min(rz1, S.b);
      if (oz1 - oz0 < 0.2) continue;
      const full = oz0 <= rz0 + 0.05 && oz1 >= rz1 - 0.05;
      addCut(S, oz0, oz1);
      if (full) {
        addCut(R, sx0, sx1);
        patches.push({ x0: sx0, x1: sx1, z0: rz0, z1: rz1 });
      }
    }
  }

  // crosswalk segments: [roadId, center along axis]
  const crosswalks = [
    ...CROSSINGS.map((x) => ['coast', x]),
    ['e20', -35],
    ['sakura', 13.2], ['sakura', -21.8], ['sakura', -91.8], ['sakura', 41.8],
  ];
  // city crossings around the avenue intersections
  for (const zc of [-120, -85, -50, -15, 20]) {
    crosswalks.push(['avenue', zc - 7], ['avenue', zc + 7]);
    const id = { '-120': 'e-120e', '-85': 'e-85e', '-50': 'e-50e', '-15': 'e-15e', '20': 'e20e' }[zc];
    crosswalks.push([id, 252 - 11], [id, 252 + 11]);
  }
  crosswalks.push(['rail-e', 252 - 11], ['rail-e', 252 + 11]);

  for (const r of ROADS) {
    const hf = halfFull(r);
    const segs = subtract([[r.a, r.b]], cuts.get(r.id) || []);
    const specials = [];
    for (const [id, c] of crosswalks) if (id === r.id) specials.push({ a: c - 2, b: c + 2, style: 5 });
    if (r.crossing) specials.push({ a: 53.5, b: 58.5, style: 8 });
    for (const [a, b] of segs) {
      // split at specials
      let pts = [a, b];
      for (const sp of specials) {
        if (sp.b > a && sp.a < b) pts.push(Math.max(a, sp.a), Math.min(b, sp.b));
      }
      pts = [...new Set(pts)].sort((p, q) => p - q);
      for (let k = 0; k < pts.length - 1; k++) {
        const s0 = pts[k], s1 = pts[k + 1];
        const mid = (s0 + s1) / 2;
        const sp = specials.find((q) => mid > q.a && mid < q.b);
        const style = sp ? sp.style : r.style;
        const bx = r.axis === 'x' ? mid : r.c;
        const bz = r.axis === 'x' ? r.c : mid;
        const bld = builders.get('road', bx, bz);
        const fullWidth = style === 8;
        const half = fullWidth ? hf : r.w / 2;
        const vBase = sp ? 0 : s0;
        ribbon(bld, r, s0, s1, r.c - half, r.c + half, style, 0, vBase, half * 2);
        if (!fullWidth && r.sidewalk) {
          // flush paver sidewalks with a low curb line
          ribbon(bld, r, s0, s1, r.c - hf, r.c - r.w / 2, r.swStyle || 7, 0, s0, r.sidewalk);
          ribbon(bld, r, s0, s1, r.c + r.w / 2, r.c + hf, r.swStyle || 7, 0, s0, r.sidewalk);
          const tb = builders.get('toon', bx, bz);
          for (const side of [-1, 1]) {
            const sc = r.c + side * (r.w / 2 + 0.06);
            let t = s0 + 0.5;
            while (t < s1 - 0.5) {
              const t1 = Math.min(t + 2, s1 - 0.5);
              const x0 = r.axis === 'x' ? t : sc, z0 = r.axis === 'x' ? sc : t;
              const x1 = r.axis === 'x' ? t1 : sc, z1 = r.axis === 'x' ? sc : t1;
              const y0 = roadSurfaceY(x0, z0), y1 = roadSurfaceY(x1, z1);
              tb.wall(x0, z0, x1, z1, Math.min(y0, y1) - 0.05, Math.max(y0, y1) + 0.1, 0.14, { color: 0xc9c6bd, pattern: PAT.CONCRETE });
              t = t1;
            }
          }
        }
      }
    }
  }

  // intersection patches
  for (const p of patches) {
    const r = { axis: 'x', c: (p.z0 + p.z1) / 2 };
    const bld = builders.get('road', (p.x0 + p.x1) / 2, r.c);
    ribbon(bld, r, p.x0, p.x1, p.z0, p.z1, 4, 0, 0, p.z1 - p.z0);
  }
  return { patches };
}

// subtract intervals
function subtract(base, cuts) {
  let res = base.slice();
  for (const [c0, c1] of cuts) {
    const next = [];
    for (const [a, b] of res) {
      if (c1 <= a || c0 >= b) next.push([a, b]);
      else {
        if (c0 > a) next.push([a, c0]);
        if (c1 < b) next.push([c1, b]);
      }
    }
    res = next;
  }
  return res.filter(([a, b]) => b - a > 0.05);
}

// Painted ground for plaza, verges and corridor areas.
export function paintRoadsides(ctx) {
  const g = ctx.ground;
  // station plaza: stone pavers
  g.rect(PLAZA.x0, PLAZA.z0, PLAZA.x1, PLAZA.z1, 0xcfc6b8, PAT.PAVING, { jitter: 0.05 });
  // railway corridor gravel strip edges + sidewalk south of the railway (not over the river)
  const rw = RIVER.x - RIVER.inner - RIVER.wall, re = RIVER.x + RIVER.inner + RIVER.wall;
  for (const [x0, x1] of [[TUNNEL.w, rw], [re, TUNNEL.e]]) {
    g.rect(x0, 50, x1, 51.6, 0xa9a49a, PAT.GRAVEL);
    g.rect(x0, 60, x1, 60.5, 0xa9a49a, PAT.GRAVEL);
    g.rect(x0, 60.0, x1, COAST.z0, 0xc9c4ba, PAT.PAVING);
  }
}
