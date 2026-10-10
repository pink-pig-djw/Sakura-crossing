import * as THREE from 'three';
import { PAT } from '../core/builder.js';
import { RNG, noise2, smoothstep, clamp, lerp } from '../core/rng.js';
import { terrainH, groundH, outsideDist, RIVER } from './layout.js';
import { route, roadDist, STREAM, streamBed, BRIDGE, TEA, PAMPAS, MIKAN, CAPE, HARBOR, riceMask } from './routeplan.js';
import { createRiverWaterMaterial, createFallsMaterial } from '../render/materials.js';

// The hills along the cycling loop, part one: the woods, and the gorge of the 桜川's upper
// course with its waterfall and the red arch bridge. (The tea fields, the torii, the rice
// terraces and the plateau are in hills2.js; the coast end of the loop in shores.js.)

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// distance to the stream's centre line, and the stream's z there
function nearStream(x, z) {
  const P = STREAM.pts;
  let best = { d: Infinity, z: 0, x: 0 };
  for (let i = 0; i < P.length - 1; i++) {
    const [ax, az] = P[i], [bx, bz] = P[i + 1];
    const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
    const u = clamp(((x - ax) * dx + (z - az) * dz) / l2, 0, 1);
    const px = ax + dx * u, pz = az + dz * u;
    const d = Math.hypot(x - px, z - pz);
    if (d < best.d) best = { d, x: px, z: pz };
  }
  return best;
}

// places kept clear of the woods (their own planting is done with them)
export function openGround(x, z) {
  if (x > TEA.x0 - 4 && x < TEA.x1 + 4 && z > TEA.z0 - 6 && z < TEA.z1 + 2) return true;
  if (riceMask(x, z) > 0.05) return true;
  if (x > PAMPAS.x0 && x < PAMPAS.x1 && z > PAMPAS.z0 && z < PAMPAS.z1 - 4) return true;
  if (x > MIKAN.x0 - 2 && x < MIKAN.x1 - 6 && z > MIKAN.z0 + 4 && z < MIKAN.z1 + 4) return true;
  if (x > HARBOR.x0 - 4 && x < HARBOR.x1 + 4 && z > HARBOR.z0 - 2) return true;
  if (Math.hypot(x - CAPE.x, z - CAPE.z) < 30) return true;
  // the bamboo grove down the west headland
  if (x < -176 && z > -172 && z < 2 && roadDist(x, z) < 26) return true;
  return false;
}

// ---------------------------------------------------------------------------
// the woods along the roads: cedar (杉) round the gorge and the forest road, a mixed wood of
// broadleaves and wild cherries elsewhere
// ---------------------------------------------------------------------------
function plantWoods(ctx) {
  const rng = new RNG(5151);
  const near = (x, z) => roadDist(x, z);
  const put = (kind, x, z, scale) => ctx.trees.push({ kind, x, z, seed: rng.int(1, 1e9), scale });
  // cedar stands: the forest road's hillside and both sides of the gorge
  let n = 0;
  for (let i = 0; i < 9000 && n < 760; i++) {
    const x = rng.range(130, 380), z = rng.range(-262, -126);
    const d = near(x, z);
    if (d < 6.2) continue;
    if (outsideDist(x, z) < 4) continue;
    const s = nearStream(x, z);
    if (s.d < 5.5) continue;
    // the wood thins out away from the roads and the gorge (the plateau takes over to the east)
    const p = Math.max(1 - smoothstep(8, 46, d), 1 - smoothstep(10, 60, s.d)) * (1 - smoothstep(330, 380, x)) * (x > 262 && z < -175 ? 0.15 : 1);
    if (rng.next() > p) continue;
    if (openGround(x, z)) continue;
    put('cedar', x, z, rng.range(0.85, 1.15));
    n++;
  }
  // a mixed wood along the rest of the hill roads, wild cherries scattered through it
  let m = 0;
  for (let i = 0; i < 16000 && m < 900; i++) {
    const x = rng.range(-400, 660), z = rng.range(-262, 150);
    if (outsideDist(x, z) < 6) continue;
    const d = near(x, z);
    // (broad crowns keep off the road; a cherry may lean out over it)
    if (d < 8 || d > 44) continue;
    if (x > 125 && x < 385 && z < -120) continue; // (the cedars)
    if (openGround(x, z)) continue;
    if (terrainH(x, z) < 2.2) continue;
    if (rng.next() > 1 - smoothstep(10, 44, d) * 0.85) continue;
    const kind = rng.next() < 0.14 ? 'sakura' : 'forest';
    if (kind === 'forest' && d < 10.5) continue;
    put(kind, x, z, kind === 'sakura' ? rng.range(0.9, 1.15) : rng.range(0.8, 1.2));
    m++;
  }
  return { cedars: n, mixed: m };
}

// ---------------------------------------------------------------------------
// the gorge: the stream, its waterfall, boulders, the culvert's inlet and the bridge
// ---------------------------------------------------------------------------
// the stream's water as a ribbon over the bed: color.r foam, color.g flow speed, color.b
// 0 at the banks .. 1 mid-channel (see createRiverWaterMaterial)
function streamWater(scene) {
  const P = STREAM.pts;
  // walk the centre line from the inlet up to where the stream is born in the hills
  const line = [];
  for (let i = 0; i < P.length - 1; i++) {
    const [ax, az] = P[i], [bx, bz] = P[i + 1];
    const L = Math.hypot(bx - ax, bz - az);
    for (let s = 0; s < L; s += 0.8) line.push([ax + ((bx - ax) * s) / L, az + ((bz - az) * s) / L]);
  }
  const zTop = -262;
  const pos = [], nor = [], col = [], uv = [], pat = [], idx = [];
  const rows = line.filter(([, z]) => z <= STREAM.inlet + 0.6 && z >= zTop);
  const cols = 6;
  let rowsOut = 0;
  for (let r = 0; r < rows.length; r++) {
    const [x, z] = rows[r];
    // skip the falls themselves (a sheet of their own)
    if (z < STREAM.fall + 0.2 && z > STREAM.fall - 1.0) continue;
    const below = z > STREAM.fall;
    const lvl = streamBed(z) + (below && z > STREAM.fall - 10 && z < STREAM.fall + 9 ? 0.45 : 0.22);
    const [px, pz] = r + 1 < rows.length ? rows[r + 1] : rows[r - 1];
    const tl = Math.hypot(px - x, pz - z) || 1;
    const tx = (px - x) / tl, tz = (pz - z) / tl;
    const half = (z > STREAM.inlet - 7 ? lerp(1.9, 6.4, smoothstep(-146, -139, z)) : 1.9) * (below && z < STREAM.fall + 9 ? 1.7 : 1);
    // white water: at the foot of the falls, over the riffles, at the apron's lip
    const riffle = smoothstep(0.62, 0.8, noise2(z * 0.18, 3.1));
    let foam = riffle * 0.6;
    if (below && z < STREAM.fall + 7) foam = Math.max(foam, 1 - (z - STREAM.fall) / 7);
    if (z > STREAM.inlet - 2) foam = Math.max(foam, 0.5);
    for (let i = 0; i <= cols; i++) {
      const u = i / cols;
      const o = (u * 2 - 1) * half;
      pos.push(x - tz * o, lvl, z + tx * o);
      nor.push(0, 1, 0);
      col.push(foam, 0.6 + riffle * 0.4, 1 - Math.abs(2 * u - 1));
      uv.push(u, z);
      pat.push(0);
    }
    if (rowsOut > 0 && !(rows[r - 1] && rows[r - 1][1] < STREAM.fall + 0.2 && rows[r - 1][1] > STREAM.fall - 1.0)) {
      const a = (rowsOut - 1) * (cols + 1), b = rowsOut * (cols + 1);
      for (let i = 0; i < cols; i++) idx.push(a + i, a + i + 1, b + i, a + i + 1, b + i + 1, b + i);
    }
    rowsOut++;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('pattern', new THREE.Float32BufferAttribute(pat, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  const mesh = new THREE.Mesh(g, createRiverWaterMaterial());
  mesh.receiveShadow = true;
  mesh.renderOrder = 2;
  mesh.name = 'stream';
  scene.add(mesh);
}

// the falls: a curved sheet from the lip to the plunge pool
function waterfall(ctx, scene) {
  const zL = STREAM.fall;
  const top = streamBed(zL - 0.8) + 0.25, foot = streamBed(zL + 2) + 0.45;
  const H = top - foot;
  const n = nearStream(184, zL);
  const cx = n.x;
  const w = 3.4, cols = 10, rows = 12;
  const pos = [], nor = [], col = [], uv = [], pat = [], idx = [];
  for (let j = 0; j <= rows; j++) {
    const t = j / rows;
    const y = top - H * t;
    // the water leaves the lip, then falls nearly straight
    const zz = zL - 0.4 + 0.9 * Math.sqrt(t) + 0.2 * t;
    for (let i = 0; i <= cols; i++) {
      const u = i / cols;
      const x = cx + (u - 0.5) * w * (1 + 0.15 * t);
      pos.push(x, y, zz + Math.sin(u * Math.PI) * 0.25);
      nor.push(0, 0, 1);
      col.push(H, 0, 0);
      uv.push(u, H * t);
      pat.push(0);
    }
  }
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const a = j * (cols + 1) + i, b = a + cols + 1;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('pattern', new THREE.Float32BufferAttribute(pat, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  const mesh = new THREE.Mesh(g, createFallsMaterial());
  mesh.renderOrder = 3;
  mesh.name = 'falls';
  scene.add(mesh);
  // the rock lip and the cliff either side of the falls
  const b = ctx.builders.get('toon', cx, zL);
  const rng = new RNG(777);
  for (let i = 0; i < 9; i++) {
    const x = cx + (i - 4) * 1.1 + rng.range(-0.2, 0.2);
    if (Math.abs(x - cx) < w / 2 - 0.3) continue;
    boulder(b, x, top - rng.range(0.4, 1.6), zL - 0.4, rng.range(0.7, 1.3), rng, 0x6f6a60);
  }
  ctx.falls = { x: cx, z: zL, top, foot };
}

// a low-poly boulder (a squashed icosahedron), moss on top
const _ico = new THREE.IcosahedronGeometry(1, 0);
function boulder(b, x, y, z, r, rng, color = 0x857e72) {
  const m = new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rng.range(-0.3, 0.3), rng.range(0, 6.28), rng.range(-0.3, 0.3))), V(r * rng.range(0.9, 1.3), r * rng.range(0.55, 0.85), r * rng.range(0.8, 1.2)));
  b.geom(_ico, m, color, PAT.ROCK, { gradient: [-1, 1, 0x5f5a50] });
}

function gorgeRocks(ctx) {
  const rng = new RNG(4401);
  for (let i = 0; i < 150; i++) {
    const z = rng.range(-258, STREAM.inlet - 2);
    const n = nearStream(182, z);
    const side = rng.sign();
    const d = rng.range(1.2, 4.5) * (Math.abs(z - (STREAM.fall + 6)) < 8 ? 1.6 : 1);
    const pts = STREAM.pts;
    // perpendicular to the line near this z
    let tx = 0, tz = -1;
    for (let k = 0; k < pts.length - 1; k++) if (z <= pts[k][1] && z >= pts[k + 1][1]) {
      const l = Math.hypot(pts[k + 1][0] - pts[k][0], pts[k + 1][1] - pts[k][1]);
      tx = (pts[k + 1][0] - pts[k][0]) / l;
      tz = (pts[k + 1][1] - pts[k][1]) / l;
    }
    const x = n.x - tz * d * side, zz = z + tx * d * side;
    const y = terrainH(x, zz);
    const r = rng.range(0.4, 1.3);
    boulder(ctx.builders.get('toon', x, zz), x, y + r * 0.2, zz, r, rng);
    if (r > 0.8) ctx.colliders.addCircle(x, zz, r * 0.8, y + r);
  }
}

// the culvert's inlet: a concrete headwall facing up the gorge, wing walls, a trash rack
function inlet(ctx) {
  const z = STREAM.inlet;
  const b = ctx.builders.get('toon', RIVER.x, z);
  const d = b.detail;
  const lvl = streamBed(z);
  const o0 = RIVER.x - RIVER.inner + 1.5, o1 = RIVER.x + RIVER.inner - 1.5;
  const bot = lvl - 1.2, oTop = 11.85, top = 15.2;
  const conc = { color: 0xbdb9ae, pattern: PAT.CONCRETE, ao: 0.15 };
  b.boxMM(o0 - 3, bot, z - 0.6, o0, top, z + 0.4, conc);
  b.boxMM(o1, bot, z - 0.6, o1 + 3, top, z + 0.4, conc);
  b.boxMM(o0, oTop, z - 0.6, o1, top, z + 0.4, conc);
  // wing walls splaying up the gorge
  for (const e of [-1, 1]) {
    const x0 = e < 0 ? o0 - 3 : o1 + 3;
    b.wall(x0, z - 0.4, x0 + e * 3.2, z - 7, bot, top - 0.4, 0.6, conc);
    ctx.colliders.addSegment(x0, z - 0.4, x0 + e * 3.2, z - 7, 0.6, top);
  }
  // the apron and a trash rack across the mouth
  for (let x = o0 + 0.3; x < o1; x += 0.5) d.box(x, (lvl + oTop) / 2, z - 0.75, 0.06, oTop - lvl, 0.06, { color: 0x45484a });
  d.box((o0 + o1) / 2, oTop - 0.15, z - 0.75, o1 - o0, 0.1, 0.1, { color: 0x45484a });
  ctx.colliders.addBox((o0 + o1) / 2, z - 0.1, (o1 - o0) / 2 + 3, 0.6, 0, top);
}

// 沢の橋: a red deck arch over the gorge (the deck is the road; railings in cycleroute.js)
function arch(ctx) {
  const leg = route().legs.find((l) => l.id === 'sawa');
  const S = leg.samples;
  const yAt = (x) => {
    let best = S[0];
    for (const o of S) if (Math.abs(o.x - x) < Math.abs(best.x - x)) best = o;
    return best.y;
  };
  const zc = BRIDGE.z, half = leg.w / 2 + 0.95;
  const red = 0xc8402e, redDk = 0xa8362a, conc = 0xb9b5ab;
  const x0 = BRIDGE.x0, x1 = BRIDGE.x1;
  const tb = (x) => ctx.builders.get('toon', x, zc);
  // the deck: a slab under the road with red fascia girders
  for (let x = x0 - 1; x < x1 + 1; x += 4) {
    const xa = x, xb = Math.min(x1 + 1, x + 4);
    const ya = yAt(xa), yb = yAt(xb);
    const y = Math.min(ya, yb);
    tb(xa).boxMM(xa, y - 0.7, zc - half, xb, y - 0.02, zc + half, { color: conc, pattern: PAT.CONCRETE });
    for (const e of [-1, 1]) tb(xa).boxMM(xa, y - 1.15, zc + e * half - 0.18, xb, y + 0.12, zc + e * half + 0.18, { color: red, pattern: PAT.METAL });
  }
  // the arch ribs springing from the gorge walls
  const sx0 = 171.5, sx1 = 192.5;
  const spring = Math.min(terrainH(sx0, zc), terrainH(sx1, zc)) + 0.4;
  const crown = yAt(182) - 1.3;
  const archY = (x) => {
    const t = (x - sx0) / (sx1 - sx0);
    return spring + (crown - spring) * (1 - (2 * t - 1) ** 2);
  };
  for (const e of [-1, 1]) {
    const z = zc + e * (half - 0.45);
    const pts = [];
    for (let i = 0; i <= 18; i++) {
      const x = sx0 + ((sx1 - sx0) * i) / 18;
      pts.push(V(x, archY(x), z));
    }
    tb(182).tube(pts, 0.36, 6, red, PAT.METAL);
    // abutment pads where it springs
    for (const x of [sx0, sx1]) tb(x).box(x, spring - 0.8, z, 1.6, 2.0, 1.4, { color: conc, pattern: PAT.CONCRETE, ao: 0.2 });
  }
  // spandrel columns from the ribs (and from the gorge walls beyond them) up to the deck
  for (let x = x0 + 1.5; x <= x1 - 1.5; x += 2.6) {
    const yTop = yAt(x) - 1.1;
    const yBot = x > sx0 && x < sx1 ? archY(x) : terrainH(x, zc) - 0.3;
    if (yTop - yBot < 0.4) continue;
    for (const e of [-1, 1]) {
      const z = zc + e * (half - 0.45);
      tb(x).box(x, (yTop + yBot) / 2, z, 0.34, yTop - yBot, 0.34, { color: x > sx0 && x < sx1 ? red : redDk, pattern: PAT.METAL });
    }
    tb(x).detail.box(x, yTop - 0.2, zc, 0.18, 0.22, half * 2 - 0.9, { color: redDk, pattern: PAT.METAL });
  }
  // abutments at both ends
  for (const x of [x0 - 1.2, x1 + 1.2]) {
    const y = yAt(x);
    tb(x).box(x, y - 3.5, zc, 2.6, 6.8, half * 2 + 0.8, { color: conc, pattern: PAT.CONCRETE, ao: 0.25 });
  }
  // name plates on the end posts: 沢の橋 / さわのはし
  ctx.landmarks.push({ id: 'sawa-bridge', x: 182, z: zc });
}

export function buildHills(ctx, scene) {
  const woods = plantWoods(ctx);
  streamWater(scene);
  waterfall(ctx, scene);
  gorgeRocks(ctx);
  inlet(ctx);
  arch(ctx);
  // the bed of the gorge: pebbles along the water, bare rock where the walls are steep
  const g = ctx.ground;
  g.paint(120, -265, 250, STREAM.inlet + 1, (x, z) => {
    const n = nearStream(x, z);
    if (n.d > 30) return null;
    const half = z > -146 ? lerp(2.4, 7, smoothstep(-146, -139, z)) : 2.4;
    if (n.d < half + 0.6) return [noise2(x * 0.4, z * 0.4) > 0.5 ? 0x8f8a7a : 0x7c7d70, PAT.GRAVEL, 0.12];
    const e = 0.7;
    const sl = Math.hypot(groundH(x + e, z) - groundH(x - e, z), groundH(x, z + e) - groundH(x, z - e)) / (2 * e);
    if (sl > 1.15) return [noise2(x * 0.2, z * 0.2) > 0.4 ? 0x8a8378 : 0x77726a, PAT.ROCK, 0.1];
    if (n.d < half + 3) return [0x6f8a55, PAT.GRASS, 0.12];
    return null;
  });
  return { woods };
}
