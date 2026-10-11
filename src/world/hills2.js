import * as THREE from 'three';
import { PAT, MeshBuilder } from '../core/builder.js';
import { RNG, fbm2, noise2, smoothstep, clamp } from '../core/rng.js';
import { groundH, terrainH } from './layout.js';
import { route, roadDist, TEA, RICE, PAMPAS, PADS, riceMask, riceTerrace } from './routeplan.js';
import { createPaddyMaterial, createGrassMaterial } from '../render/materials.js';
import { activeFoliage, pampasTexture, canvasTexture } from './greenery.js';
import { stoneLantern } from './buildings.js';
import { benchAt } from './coast.js';

// The hills along the cycling loop, part two: the tea fields, the thousand torii behind the
// shrine, the rice terraces, the pampas plateau with its wind turbines, and the rest stops.

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const legById = (id) => route().legs.find((l) => l.id === id);
const leftOf = (o) => [o.tz, -o.tx];

// ---------------------------------------------------------------------------
// tea fields (茶畑): rows of clipped bushes along the slope above the road, the bright new
// flush on top; frost fans on poles; dark soil between the rows
// ---------------------------------------------------------------------------
const TEA_DARK = new THREE.Color('#3f6a35'), TEA_TOP = new THREE.Color('#9cc454');

function teaRow(ctx, pts, rng) {
  // a rounded hedge swept along the row: half-ellipse 1.3 m wide, 0.9 m tall
  const prof = [];
  for (let k = 0; k <= 6; k++) {
    const a = Math.PI * (k / 6);
    prof.push([Math.cos(a) * 0.66, Math.sin(a) * 0.92, Math.cos(a), Math.sin(a) * 0.85]);
  }
  const c = new THREE.Color();
  for (let i0 = 0; i0 < pts.length - 1; i0 += 16) {
    const i1 = Math.min(pts.length - 1, i0 + 16);
    const b = ctx.builders.get('toon', pts[i0].x, pts[i0].z);
    const base = b.count;
    for (let i = i0; i <= i1; i++) {
      const p = pts[i];
      const q = pts[Math.min(pts.length - 1, i + 1)], r = pts[Math.max(0, i - 1)];
      const tl = Math.hypot(q.x - r.x, q.z - r.z) || 1;
      const nx = -(q.z - r.z) / tl, nz = (q.x - r.x) / tl;
      for (const [u, h, cn, cy] of prof) {
        const top = h / 0.92;
        c.copy(TEA_DARK).lerp(TEA_TOP, top * top * (0.75 + 0.25 * noise2(p.x * 0.3, p.z * 0.3)));
        b.vtx(p.x + nx * u, p.y + h - 0.05, p.z + nz * u, nx * cn, cy + 0.3, nz * cn, c, p.x + p.z, h, PAT.LEAVES);
      }
    }
    const P = prof.length;
    for (let i = 0; i < i1 - i0; i++) {
      for (let k = 0; k < P - 1; k++) {
        const a = base + i * P + k, d = a + P;
        b.idx.push(a, d, a + 1, a + 1, d, d + 1);
      }
    }
  }
  // a few leafy cards along the top so the rows do not read as tubes
  const fb = activeFoliage();
  if (!fb) return;
  for (let i = 0; i < pts.length; i += 2) {
    const p = pts[i];
    const cc = V(p.x, p.y + 0.85, p.z);
    fb.get('tea', p.x, p.z).card4(V(p.x + rng.range(-0.3, 0.3), p.y + 0.82, p.z + rng.range(-0.3, 0.3)), V(0, 1, 0), c.copy(TEA_TOP).multiplyScalar(rng.range(0.85, 1.0)), cc, rng.range(0.38, 0.5), rng.range(0, 6.28));
  }
}

function frostFan(ctx, x, y, z, ry) {
  const b = ctx.builders.get('toon', x, z);
  b.cyl(x, y - 0.3, z, 0.06, 0.05, 6.4, 6, 0x9aa0a4, PAT.METAL);
  b.pushTRS(x, y + 6.1, z, ry);
  b.box(0, 0, 0.15, 0.32, 0.3, 0.5, { color: 0xd8dcd8, pattern: PAT.METAL });
  // three blades, the fan tipped down toward the bushes
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    b.box(Math.cos(a) * 0.45, Math.sin(a) * 0.45 - 0.05, -0.18, 0.12, 0.9, 0.03, { color: 0xc8ccc8, ry: 0 });
  }
  b.pop();
}

function teaFields(ctx) {
  const rng = new RNG(808);
  const leg = legById('cha');
  const S = leg.samples;
  // the bushes stand on the uphill (north) side of the road, in rows that follow it
  const sideUp = (() => {
    const o = S[S.length >> 1];
    return leftOf(o)[1] < 0 ? 1 : -1;
  })();
  const inField = (x, z) => x > TEA.x0 + 2 && x < TEA.x1 - 2 && z > TEA.z0 + 3 && z < TEA.z1 + 1;
  let rows = 0;
  for (let k = 0; k < 30; k++) {
    const d = 7.2 + k * 1.95;
    let run = [];
    const flush = () => {
      if (run.length > 5) {
        teaRow(ctx, run, rng);
        rows++;
        if (k % 4 === 2) {
          for (let i = 6; i < run.length - 1; i += 17) frostFan(ctx, run[i].x, run[i].y, run[i].z, Math.atan2(run[i + 1].x - run[i].x, run[i + 1].z - run[i].z));
        }
      }
      run = [];
    };
    for (let i = 0; i < S.length; i++) {
      const o = S[i];
      const [lx, lz] = leftOf(o);
      const x = o.x + lx * d * sideUp, z = o.z + lz * d * sideUp;
      // gaps: paths up through the field, the tea house's yard
      const path = Math.abs(((o.s + 9) % 31) - 15.5) < 0.8;
      const yard = Math.hypot(x - 112, z + 168.8) < 9.5;
      if (!inField(x, z) || path || yard || roadDist(x, z) < 5.6) {
        flush();
        continue;
      }
      run.push({ x, z, y: groundH(x, z) });
    }
    flush();
  }
  // dark soil between the rows
  ctx.ground.paint(TEA.x0, TEA.z0, TEA.x1, TEA.z1 + 2, (x, z) => (roadDist(x, z) > 5.4 && inField(x, z) ? [noise2(x * 0.5, z * 0.5) > 0.55 ? 0x6e5a42 : 0x645038, PAT.DIRT, 0.12] : null));
  return rows;
}

// ---------------------------------------------------------------------------
// 千本鳥居: a tunnel of vermilion gates along the stone path behind the shrine
// ---------------------------------------------------------------------------
const VERMILION = 0xe24a2a, TORII_BLACK = 0x2a2626;

function smallTorii(b, x, y, z, ry, w, h) {
  b.pushTRS(x, y, z, ry);
  for (const e of [-1, 1]) {
    b.cyl(e * w, -0.3, 0, 0.13, 0.115, h + 0.3, 8, VERMILION);
    b.cyl(e * w, -0.05, 0, 0.165, 0.165, 0.42, 8, TORII_BLACK);
  }
  b.box(0, h - 0.62, 0, w * 2 + 0.36, 0.15, 0.13, { color: VERMILION });
  b.box(0, h - 0.12, 0, w * 2 + 0.7, 0.2, 0.26, { color: VERMILION });
  b.box(0, h + 0.03, 0, w * 2 + 0.95, 0.1, 0.32, { color: TORII_BLACK });
  b.pop();
}

function senbonTorii(ctx) {
  const leg = legById('torii');
  const S = leg.samples;
  const w = leg.w / 2 + 0.42, h = 3.75;
  let n = 0;
  for (let s = 2.2; s < leg.length - 2.2; s += 1.08) {
    const o = S[Math.round(s)];
    const ry = Math.atan2(o.tx, o.tz);
    smallTorii(ctx.builders.get('toon', o.x, o.z), o.x, o.y, o.z, ry, w, h);
    const [lx, lz] = leftOf(o);
    for (const e of [-1, 1]) ctx.colliders.addCircle(o.x + lx * w * e, o.z + lz * w * e, 0.16);
    n++;
  }
  // stone lanterns at both mouths, a pair of foxes (お狐さま) at the east one
  for (const [i, dir] of [[3, 1], [S.length - 4, -1]]) {
    const o = S[i];
    const [lx, lz] = leftOf(o);
    for (const e of [-1, 1]) {
      const x = o.x + lx * (w + 1.1) * e - o.tx * dir * 2, z = o.z + lz * (w + 1.1) * e - o.tz * dir * 2;
      const y = groundH(x, z);
      const b = ctx.builders.get('toon', x, z);
      stoneLantern(b, x, y, z, 1.15);
      ctx.builders.get('emissive', x, z).box(x, y + 1.2, z, 0.2, 0.22, 0.2, { color: 0xffc46a });
      ctx.lamps.push({ x, y: y + 1.2, z, r: 3.4, color: 0xffb860 });
      ctx.colliders.addCircle(x, z, 0.32);
    }
  }
  const o = S[6];
  const [lx, lz] = leftOf(o);
  for (const e of [-1, 1]) {
    const x = o.x + lx * (w + 0.9) * e, z = o.z + lz * (w + 0.9) * e;
    const y = groundH(x, z);
    const b = ctx.builders.get('toon', x, z);
    b.box(x, y + 0.45, z, 0.7, 0.9, 0.7, { color: 0xa9a397, pattern: PAT.STONE, ao: 0.2 });
    // a sitting fox: body, chest bib, head and ears, tail curled up
    const ry = Math.atan2(-lx * e, -lz * e);
    b.pushTRS(x, y + 0.9, z, ry);
    b.geom(new THREE.SphereGeometry(0.25, 8, 6), new THREE.Matrix4().compose(V(0, 0.32, 0), new THREE.Quaternion(), V(0.8, 1.3, 0.9)), 0xeae4d6);
    b.box(0, 0.42, 0.17, 0.26, 0.2, 0.05, { color: 0xd8402e });
    b.geom(new THREE.ConeGeometry(0.15, 0.36, 6), new THREE.Matrix4().compose(V(0, 0.78, 0.07), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2.6, 0, 0)), V(1, 1, 1)), 0xeae4d6);
    for (const k of [-1, 1]) b.geom(new THREE.ConeGeometry(0.05, 0.16, 4), new THREE.Matrix4().makeTranslation(k * 0.08, 0.95, -0.02), 0xeae4d6);
    b.geom(new THREE.SphereGeometry(0.11, 6, 5), new THREE.Matrix4().compose(V(0, 0.55, -0.24), new THREE.Quaternion(), V(1, 2.2, 1)), 0xeae4d6);
    b.pop();
    ctx.colliders.addBox(x, z, 0.36, 0.36);
  }
  // the ground under the gates: moss and gravel
  ctx.ground.paint(-4, -196, 76, -168, (x, z) => {
    const d = roadDist(x, z);
    return d < 5 && d > 1.4 ? [noise2(x, z) > 0.5 ? 0x6f8a52 : 0x7e8a6a, PAT.GRAVEL, 0.1] : null;
  });
  return n;
}

// ---------------------------------------------------------------------------
// 棚田: the flooded rice terraces. The water of each step is cut out of the valley's
// smooth shape between two contour heights (marching triangles), so it follows the
// curving terraces; a low bund (畦) holds it at the lower edge.
// ---------------------------------------------------------------------------
function riceTerraces(ctx, scene) {
  const R = RICE;
  const rng = new RNG(1212);
  const step = R.step;
  const x0 = R.x - R.half - 6, x1 = R.x + R.half + 6, z0 = R.z1 - 4, z1 = R.z0 + 4;
  const h = 0.6;
  const nx = Math.ceil((x1 - x0) / h), nz = Math.ceil((z1 - z0) / h);
  // the smooth shape (in steps) and the cultivation mask at the grid nodes
  const Y = new Float32Array((nx + 1) * (nz + 1)), M = new Float32Array((nx + 1) * (nz + 1));
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
    const x = x0 + i * h, z = z0 + j * h;
    const t = riceTerrace(x, z);
    Y[j * (nx + 1) + i] = t.cont;
    // (continuous, so the edge of the water follows a smooth line: the cut is at 0.5); and
    // only where the ground really is the terrace (the road's cuttings and embankments
    // reach further out than the road itself: no paddy hangs in the air over them)
    const fit = Math.abs(terrainH(x, z) - t.y);
    M[j * (nx + 1) + i] = Math.min(0.5 + (riceMask(x, z) - 0.97) / 0.06, 0.5 + (roadDist(x, z) - 5.6) / 4, 0.5 + (0.3 - fit) / 0.3);
  }
  const planted = new Map();
  const isPlanted = (k) => {
    if (!planted.has(k)) planted.set(k, rng.next() < 0.45 ? 1 : 0);
    return planted.get(k);
  };
  const pos = [], col = [], nor = [], uv = [], pat = [], idx = [];
  const bund = new MeshBuilder();
  const grass = new THREE.Color('#5e8a3c');
  // clip a convex polygon of {x, z, y(steps), m} by the value of key >= thr (sign 1) or <= thr (-1)
  const clip = (poly, key, thr, sign) => {
    const out = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const da = (a[key] - thr) * sign, db = (b[key] - thr) * sign;
      if (da >= 0) out.push(a);
      if (da >= 0 !== db >= 0) {
        const t = da / (da - db);
        out.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, y: a.y + (b.y - a.y) * t, m: a.m + (b.m - a.m) * t });
      }
    }
    return out;
  };
  const top = 1 - R.riser - 0.05;
  const bundSegs = [];
  const tri = (A, B, C) => {
    const lo = Math.floor(Math.min(A.y, B.y, C.y)), hi = Math.floor(Math.max(A.y, B.y, C.y));
    if (Math.max(A.m, B.m, C.m) < 0.5) return;
    for (let k = lo; k <= hi; k++) {
      let poly = clip([A, B, C], 'm', 0.5, 1);
      if (poly.length < 3) return;
      poly = clip(poly, 'y', k + 0.04, 1);
      poly = clip(poly, 'y', k + top, -1);
      if (poly.length < 3) continue;
      const wy = k * step + 0.07;
      const base = pos.length / 3;
      const g = isPlanted(k);
      for (const p of poly) {
        pos.push(p.x, wy, p.z);
        nor.push(0, 1, 0);
        col.push(0, g, 0);
        uv.push(p.x, p.z);
        pat.push(0);
      }
      for (let i = 1; i < poly.length - 1; i++) idx.push(base, base + i + 1, base + i);
      // the bund along the lower edge: the iso-line y = k + 0.04 through this triangle
      const pts = [];
      for (const [a, b] of [[A, B], [B, C], [C, A]]) {
        const da = a.y - (k + 0.04), db = b.y - (k + 0.04);
        if (da >= 0 !== db >= 0) {
          const t = da / (da - db);
          const m = a.m + (b.m - a.m) * t;
          if (m > 0.5) pts.push([a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t]);
        }
      }
      if (pts.length === 2) bundSegs.push([pts[0], pts[1], k * step]);
    }
    // where the paddies stop (by the road, at the edge of the fields): a bund along that
    // edge too, so no sheet of water ends in the air
    const ms = [];
    for (const [a, b] of [[A, B], [B, C], [C, A]]) {
      const da = a.m - 0.5, db = b.m - 0.5;
      if (da >= 0 !== db >= 0) {
        const t = da / (da - db);
        ms.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, y: a.y + (b.y - a.y) * t });
      }
    }
    if (ms.length === 2) {
      const ym = (ms[0].y + ms[1].y) / 2, k = Math.floor(ym), f = ym - k;
      if (f > 0.04 && f < top) bundSegs.push([[ms[0].x, ms[0].z], [ms[1].x, ms[1].z], k * step]);
    }
  };
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const node = (ii, jj) => {
      const k = jj * (nx + 1) + ii;
      return { x: x0 + ii * h, z: z0 + jj * h, y: Y[k], m: M[k] };
    };
    const a = node(i, j), b = node(i + 1, j), c = node(i + 1, j + 1), d = node(i, j + 1);
    tri(a, b, c);
    tri(a, c, d);
  }
  // bunds: low grassy ridges
  for (const [[ax, az], [bx, bz], y] of bundSegs) {
    const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz);
    if (l < 1e-3) continue;
    const px = (-dz / l) * 0.2, pz = (dx / l) * 0.2;
    const top = V((ax + bx) / 2, y + 0.24, (az + bz) / 2);
    // (from below the paddy floor, which lies 0.3 under the water line, to just over the water;
    // on the outer side, where the ground drops away down the riser, a whole step on down into
    // the ground, so it never stands in the air)
    const mx = (ax + bx) / 2, mz = (az + bz) / 2;
    const out = terrainH(mx + px * 2.5, mz + pz * 2.5) < terrainH(mx - px * 2.5, mz - pz * 2.5) ? 1 : -1;
    const yp = out > 0 ? y - step - 0.25 : y - 0.42, ym = out < 0 ? y - step - 0.25 : y - 0.42;
    const A = V(ax - dx * 0.08 + px * 1.3, yp, az - dz * 0.08 + pz * 1.3), B = V(bx + dx * 0.08 + px * 1.3, yp, bz + dz * 0.08 + pz * 1.3);
    const C = V(bx + dx * 0.08 - px * 1.3, ym, bz + dz * 0.08 - pz * 1.3), D = V(ax - dx * 0.08 - px * 1.3, ym, az - dz * 0.08 - pz * 1.3);
    const T1 = V(ax - dx * 0.08, y + 0.2, az - dz * 0.08), T2 = V(bx + dx * 0.08, y + 0.2, bz + dz * 0.08);
    bund.quadOut(A, B, T2, T1, V(top.x, y - 1, top.z), grass, PAT.GRASS);
    bund.quadOut(C, D, T1, T2, V(top.x, y - 1, top.z), grass, PAT.GRASS);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('pattern', new THREE.Float32BufferAttribute(pat, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  const water = new THREE.Mesh(g, createPaddyMaterial());
  water.receiveShadow = true;
  water.name = 'paddies';
  scene.add(water);
  const bm = new THREE.Mesh(bund.toGeometry(), ctx.materials.toon.material);
  bm.receiveShadow = true;
  bm.name = 'bunds';
  scene.add(bm);
  // the ground: mud under the water, grass on the banks
  ctx.ground.paint(x0, z0, x1, z1, (x, z) => {
    if (riceMask(x, z) < 0.6 || roadDist(x, z) < 5) return null;
    const t = riceTerrace(x, z);
    // (mud only under the water: where no paddy is, grass)
    if (riceMask(x, z) < 0.97 || roadDist(x, z) < 5.6 || Math.abs(terrainH(x, z) - t.y) > 0.3) return [noise2(x * 0.6, z * 0.6) > 0.5 ? 0x6e9a48 : 0x5f8c40, PAT.GRASS, 0.12];
    return t.flat ? [0x6b5a44, PAT.DIRT, 0.1] : [noise2(x * 0.6, z * 0.6) > 0.5 ? 0x6e9a48 : 0x5f8c40, PAT.GRASS, 0.12];
  });
  // scarecrows and a farm hut with a thatched roof
  for (const [sx, sz] of [[-96, -150], [-122, -205], [-88, -214]]) scarecrow(ctx, sx, sz, rng);
  hut(ctx, -138, -196, 0.4);
  return { tris: idx.length / 3, bunds: bundSegs.length };
}

function scarecrow(ctx, x, z, rng) {
  const y = terrainH(x, z) + 0.05;
  const b = ctx.builders.get('toon', x, z);
  b.cyl(x, y - 0.3, z, 0.04, 0.035, 1.9, 5, 0x8a6a48, PAT.BARK);
  b.rod(V(x - 0.7, y + 1.15, z), V(x + 0.7, y + 1.15, z), 0.03, 0.03, 4, 0x8a6a48);
  b.box(x, y + 1.05, z, 0.5, 0.55, 0.22, { color: rng.pick([0x4a6aa8, 0xb84a3a, 0x6a8a4a]) });
  b.geom(new THREE.SphereGeometry(0.17, 8, 6), new THREE.Matrix4().makeTranslation(x, y + 1.52, z), 0xe8dcc0);
  b.cyl(x, y + 1.6, z, 0.36, 0.0, 0.2, 10, 0xc8a85a);
}

function hut(ctx, x, z, ry) {
  const y = terrainH(x, z);
  const b = ctx.builders.get('toon', x, z);
  b.pushTRS(x, y, z, ry);
  b.box(0, 0.9, 0, 3.0, 2.0, 2.4, { color: 0x7a5a3e, pattern: PAT.BOARDS, ao: 0.2 });
  // thatch: a steep hipped roof of straw
  const geo = new THREE.ConeGeometry(2.6, 2.1, 4, 1);
  b.geom(geo, new THREE.Matrix4().compose(V(0, 2.95, 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 4, 0)), V(1.15, 1, 0.95)), 0xb89a5a, PAT.SHINGLE, { gradient: [-1, 1, 0x8a7448] });
  b.box(0, 0.75, 1.21, 0.9, 1.5, 0.05, { color: 0x3a2e24 });
  b.pop();
  ctx.colliders.addBox(x, z, 1.6, 1.3, ry);
}

// ---------------------------------------------------------------------------
// the pampas plateau (すすき野) and the wind turbines on its skyline
// ---------------------------------------------------------------------------
function pampas(ctx, scene) {
  const rng = new RNG(3131);
  const P = PAMPAS;
  const CH = 40;
  const chunks = new Map();
  const tint = new THREE.Color();
  const gold = new THREE.Color('#d9c48a'), silver = new THREE.Color('#e8e2cc'), green = new THREE.Color('#9aa86a');
  let count = 0;
  for (let i = 0; i < 60000 && count < 11000; i++) {
    const x = rng.range(P.x0, P.x1), z = rng.range(P.z0, P.z1);
    const d = roadDist(x, z);
    if (d < 4.6) continue;
    const dens = smoothstep(0.32, 0.62, fbm2(x * 0.03, z * 0.03, 3)) * (1 - smoothstep(P.x1 - 30, P.x1, x)) * smoothstep(P.x0, P.x0 + 30, x);
    if (rng.next() > 0.15 + 0.85 * dens) continue;
    if (P.mills.some(([mx, mz]) => Math.hypot(x - mx, z - mz) < 7)) continue;
    const e = 0.6;
    const sl = Math.hypot(groundH(x + e, z) - groundH(x - e, z), groundH(x, z + e) - groundH(x, z - e)) / (2 * e);
    if (sl > 0.9) continue;
    const y = groundH(x, z);
    tint.copy(gold).lerp(silver, rng.next() * 0.6).lerp(green, rng.next() * 0.25);
    const key = Math.floor(x / CH) + ',' + Math.floor(z / CH);
    let ch = chunks.get(key);
    if (!ch) chunks.set(key, (ch = { inst: [], tint: [], x: (Math.floor(x / CH) + 0.5) * CH, z: (Math.floor(z / CH) + 0.5) * CH, y0: Infinity, y1: -Infinity }));
    ch.inst.push(x, y - 0.05, z, rng.range(0, Math.PI));
    ch.tint.push(tint.r, tint.g, tint.b, rng.range(0.85, 1.25));
    ch.y0 = Math.min(ch.y0, y);
    ch.y1 = Math.max(ch.y1, y);
    count++;
  }
  // a tuft: three crossed cards 1.1 m wide, 1.6 m tall
  const pos = [], nor = [], uv = [], idx = [];
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI;
    const dx = (Math.cos(a) * 1.1) / 2, dz = (Math.sin(a) * 1.1) / 2;
    const b = pos.length / 3;
    pos.push(-dx, 0, -dz, dx, 0, dz, dx, 1.6, dz, -dx, 1.6, -dz);
    for (let i = 0; i < 4; i++) nor.push(-Math.sin(a), 0, Math.cos(a));
    uv.push(0, 0, 1, 0, 1, 1, 0, 1);
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  const material = createGrassMaterial(canvasTexture(pampasTexture()), { far: 190 });
  const group = new THREE.Group();
  group.name = 'pampas';
  for (const ch of chunks.values()) {
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.setAttribute('inst', new THREE.InstancedBufferAttribute(new Float32Array(ch.inst), 4));
    g.setAttribute('tint', new THREE.InstancedBufferAttribute(new Float32Array(ch.tint), 4));
    g.instanceCount = ch.inst.length / 4;
    g.boundingSphere = new THREE.Sphere(V(ch.x, (ch.y0 + ch.y1) / 2, ch.z), CH * 0.75 + (ch.y1 - ch.y0) / 2 + 2);
    const m = new THREE.Mesh(g, material);
    m.matrixAutoUpdate = false;
    m.receiveShadow = true;
    group.add(m);
  }
  scene.add(group);
  // the meadow's ground: pale gold grass
  ctx.ground.paint(P.x0 - 20, P.z0, P.x1 + 20, P.z1 + 10, (x, z) => {
    if (roadDist(x, z) < 4.3) return null;
    const m = smoothstep(P.x0 - 20, P.x0 + 10, x) * (1 - smoothstep(P.x1 - 10, P.x1 + 20, x)) * (1 - smoothstep(P.z1 - 4, P.z1 + 10, z));
    if (m < 0.35) return null;
    return [noise2(x * 0.08, z * 0.08) > 0.5 ? 0xb8b070 : 0xa9a868, PAT.GRASS, 0.14];
  });
  return count;
}

function windTurbines(ctx, scene) {
  const P = PAMPAS;
  const white = 0xeef0ee;
  const rotors = [];
  for (const [i, [x, z]] of P.mills.entries()) {
    const y = groundH(x, z);
    const H = 30 + i * 2;
    const b = ctx.builders.get('toon', x, z);
    b.cyl(x, y - 0.5, z, 1.25, 0.8, H + 0.5, 14, white, PAT.METAL);
    b.cyl(x, y - 0.3, z, 2.2, 2.2, 0.5, 14, 0xb8b4aa, PAT.CONCRETE);
    // nacelle and rotor facing the sea wind (south-west)
    const yaw = -0.5;
    b.pushTRS(x, y + H, z, yaw);
    b.box(0, 0.9, 1.2, 1.9, 1.8, 4.6, { color: white, pattern: PAT.METAL });
    b.pop();
    ctx.colliders.addCircle(x, z, 1.3);
    // the rotor: hub and three blades, turning slowly
    const rb = new MeshBuilder();
    rb.geom(new THREE.SphereGeometry(0.75, 10, 8), new THREE.Matrix4().makeScale(1, 1, 1.4), white);
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      rb.pushTRS(0, 0, 0, 0);
      const m = new THREE.Matrix4().makeRotationZ(a);
      rb.push(m);
      // a blade: wide at the root, tapering to the tip, a little twisted
      const pts = [];
      for (let s = 0; s <= 6; s++) {
        const t = s / 6;
        pts.push([0.15 + t * 15.5, (1 - t) * 0.75 + 0.18]);
      }
      for (let s = 0; s < pts.length - 1; s++) {
        const [r0, w0] = pts[s], [r1, w1] = pts[s + 1];
        rb.quad(V(-w0 / 2, r0, 0), V(w0 / 2, r0, 0.05), V(w1 / 2, r1, 0.03), V(-w1 / 2, r1, 0), white, PAT.METAL, { double: true });
      }
      rb.pop();
      rb.pop();
    }
    const rotor = new THREE.Mesh(rb.toGeometry(), ctx.materials.toon.material);
    rotor.castShadow = true;
    rotor.receiveShadow = true;
    rotor.position.set(x + Math.sin(yaw) * 3.7, y + H + 0.9, z + Math.cos(yaw) * 3.7);
    rotor.rotation.order = 'YXZ';
    rotor.rotation.y = yaw;
    rotor.name = 'windmill';
    scene.add(rotor);
    rotors.push({ m: rotor, w: 0.9 + i * 0.12, a: i * 1.3 });
    // a red warning light on top, lit at night
    ctx.builders.get('emissive', x, z).box(x, y + H + 1.95, z, 0.3, 0.2, 0.3, { color: 0xff3a2a });
  }
  ctx.updaters.push((t, dt) => {
    for (const r of rotors) r.m.rotation.z = (r.a += dt * r.w);
  });
  return rotors.length;
}

// ---------------------------------------------------------------------------
// rest stops: a level pad off the road behind an opening in the railing, benches facing the
// view, a railing round the outer edge; the tea house has its red bench and parasol
// ---------------------------------------------------------------------------
function padRailing(ctx, pad, from, to) {
  const [cx, cz] = pad.at;
  const pts = [];
  for (let a = from; a <= to + 1e-6; a += 0.12) pts.push({ x: cx + Math.cos(a) * (pad.r - 0.3), z: cz + Math.sin(a) * (pad.r - 0.3), y: pad.y });
  for (let i = 0; i < pts.length; i += 1) {
    const p = pts[i];
    if (i % 2 === 0) ctx.builders.get('toon', p.x, p.z).cyl(p.x, p.y - 0.2, p.z, 0.06, 0.06, 1.2, 6, 0x6e5238, PAT.BOARDS);
    if (i < pts.length - 1) {
      const q = pts[i + 1];
      const d = ctx.builders.get('toon', p.x, p.z).detail;
      d.wall(p.x, p.z, q.x, q.z, p.y + 0.88, p.y + 0.98, 0.09, { color: 0x7a5c40, pattern: PAT.BOARDS });
      d.wall(p.x, p.z, q.x, q.z, p.y + 0.45, p.y + 0.53, 0.07, { color: 0x7a5c40, pattern: PAT.BOARDS });
      ctx.colliders.addSegment(p.x, p.z, q.x, q.z, 0.2, p.y + 1);
    }
  }
}

function restStops(ctx) {
  for (const pad of PADS) {
    if (pad.y === undefined) continue;
    const [cx, cz] = pad.at;
    // which way the view lies: away from the road
    const leg = legById(pad.leg);
    let best = leg.samples[0];
    for (const o of leg.samples) if (Math.hypot(o.x - cx, o.z - cz) < Math.hypot(best.x - cx, best.z - cz)) best = o;
    const ox = cx - best.x, oz = cz - best.z, ol = Math.hypot(ox, oz) || 1;
    const away = Math.atan2(oz / ol, ox / ol);
    // the railing round the far side of the pad
    padRailing(ctx, pad, away - 1.75, away + 1.75);
    // wooden deck boards over the pad
    ctx.ground.circle(cx, cz, pad.r - 0.1, 0x9a8a72, PAT.GRAVEL);
    const b = ctx.builders.get('toon', cx, cz);
    if (pad.id === 'chaya') teaHouse(ctx, pad, away);
    else if (pad.id === 'kaze' || pad.id === 'tanada') {
      // two benches looking out
      const ry = Math.atan2(-Math.cos(away), -Math.sin(away)) + Math.PI;
      for (const e of [-1, 1]) {
        const bx = cx + Math.cos(away) * (pad.r - 1.8) + Math.cos(away + Math.PI / 2) * e * 1.3;
        const bz = cz + Math.sin(away) * (pad.r - 1.8) + Math.sin(away + Math.PI / 2) * e * 1.3;
        benchAt(ctx, b, bx, pad.y, bz, Math.atan2(-Math.cos(away), -Math.sin(away)), 0x8a6a4a, '景色を眺める');
      }
      void ry;
    }
    pad.away = away;
    ctx.landmarks.push({ id: 'pad-' + pad.id, x: cx, z: cz, name: pad.name });
  }
}

function teaHouse(ctx, pad, away) {
  const [cx, cz] = pad.at;
  const y = pad.y;
  const b = ctx.builders.get('toon', cx, cz);
  // a small timber house at the back of the yard, its open front to the road
  const bx = cx + Math.cos(away) * 2.6, bz = cz + Math.sin(away) * 2.6;
  const ry = Math.atan2(Math.cos(away), Math.sin(away));
  b.pushTRS(bx, y, bz, ry);
  b.box(0, 1.3, 0, 5.2, 2.6, 2.6, { color: 0x8a6446, pattern: PAT.BOARDS, ao: 0.2 });
  b.box(0, 1.15, -1.31, 3.6, 1.7, 0.05, { color: 0xe8dcc0 });
  b.box(0, 2.45, -1.36, 5.4, 0.28, 0.1, { color: 0x3a2e24 });
  b.box(0, 2.85, -0.3, 6.0, 0.14, 3.9, { color: 0x4a4038, pattern: PAT.KAWARA });
  b.pop();
  ctx.colliders.addBox(bx, bz, 2.7, 1.4, ry);
  // red benches (縁台) with a red parasol (野点傘)
  const fx = cx - Math.cos(away) * 1.2, fz = cz - Math.sin(away) * 1.2;
  for (const e of [-1, 1]) {
    const x = fx + Math.cos(away + Math.PI / 2) * e * 2.0, z = fz + Math.sin(away + Math.PI / 2) * e * 2.0;
    b.box(x, y + 0.42, z, 1.8, 0.08, 0.7, { color: 0xc8402e, ry, top: 0xd24a36 });
    for (const [a, c] of [[-0.8, -0.28], [0.8, -0.28], [0.8, 0.28], [-0.8, 0.28]]) b.box(x + Math.cos(ry) * a + Math.sin(ry) * c, y + 0.2, z - Math.sin(ry) * a + Math.cos(ry) * c, 0.07, 0.42, 0.07, { color: 0x5a4030 });
    ctx.colliders.addBox(x, z, 0.9, 0.35, ry, y + 0.5);
    ctx.interactables.push({ kind: 'bench', x: x - Math.sin(ry) * 0.8, z: z - Math.cos(ry) * 0.8, r: 1.3, label: '縁台に腰かける', sit: { x, y: y + 0.47, z, yaw: ry } });
  }
  b.cyl(fx, y - 0.2, fz, 0.04, 0.04, 2.7, 6, 0x6a4a32);
  b.cyl(fx, y + 2.35, fz, 1.9, 0.05, 0.75, 16, 0xd23a2a, 0, { top: 0xd23a2a });
  b.cyl(fx, y + 2.33, fz, 1.88, 1.88, 0.03, 16, 0xe8dcc0, 0, { bottomCap: true });
}

export function buildHills2(ctx, scene) {
  const out = {};
  out.teaRows = teaFields(ctx);
  out.torii = senbonTorii(ctx);
  out.rice = riceTerraces(ctx, scene);
  out.pampas = pampas(ctx, scene);
  out.mills = windTurbines(ctx, scene);
  restStops(ctx);
  return out;
}

void clamp;
