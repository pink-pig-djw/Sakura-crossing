import * as THREE from 'three';
import { PAT } from '../core/builder.js';
import { RNG, noise2, fbm2, smoothstep, clamp } from '../core/rng.js';
import { ISLAND, islandH, islandWalk, pathNear, pathPoints, PATH_W } from './islandplan.js';
import { GroundMap } from './terrain.js';
import { createGroundMaterial, G } from '../render/materials.js';
import { benchAt, boat, tetrapod } from './coast.js';
import { lighthouseBeam } from './shores.js';
import { buildHouse, buildOldHouse } from './buildings.js';
import { FONTS, drawBoard } from '../render/atlas.js';
import { LANDING_Y } from './pier.js';

// ---------------------------------------------------------------------------
// 凪ノ島 (see islandplan.js): its ground (a mesh of its own, finer than the town's terrain far
// out here), the harbour (quay, steps down to a floating landing where the boat ties up, the
// breakwater arm with its red beacon, a couple of boats, the fishermen's things), the village
// (a few old houses up the slope, the island's shop), the path up the hill (a gravel bench
// with a wooden handrail and lamps), the lighthouse and a viewing deck looking back at the
// town across the bay, and the island's pines and woods
// ---------------------------------------------------------------------------
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const I = ISLAND;
const X = (u) => I.x + u, Z = (w) => I.z + w;
const CONC = 0xc4c0b6, CONC_LT = 0xd4d0c6, WOOD = 0x8a6a4e, WOOD_DK = 0x5c4636, IRON = 0x2b2d31, WHITE = 0xf3f1ea;

const C_GRASS = new THREE.Color('#8fb866'), C_GRASS_DK = new THREE.Color('#6c9a55'), C_FOREST = new THREE.Color('#5f8f4c');
const C_ROCK = new THREE.Color('#948a7e'), C_ROCK_DK = new THREE.Color('#7a7268'), C_SAND = new THREE.Color('#dccaa2'), C_PEBBLE = new THREE.Color('#b9b2a4');
const C_BED = new THREE.Color('#bfae8a'), C_BED_DK = new THREE.Color('#8f8a78');

// ---------------------------------------------------------------------------- the ground
function groundMesh(map) {
  const S = 1.25;
  const nx = Math.round((I.x1 - I.x0) / S), nz = Math.round((I.z1 - I.z0) / S);
  const H = new Float32Array((nx + 1) * (nz + 1));
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) H[j * (nx + 1) + i] = islandH(I.x0 + i * S, I.z0 + j * S);
  const h = (i, j) => H[clamp(j, 0, nz) * (nx + 1) + clamp(i, 0, nx)];
  const pos = [], nor = [], col = [], uv = [], pat = [], patw = [], idx = [];
  const at = new Int32Array((nx + 1) * (nz + 1)).fill(-1);
  const c = new THREE.Color();
  const vertex = (i, j) => {
    const k = j * (nx + 1) + i;
    if (at[k] >= 0) return at[k];
    const x = I.x0 + i * S, z = I.z0 + j * S, y = h(i, j);
    const dx = h(i + 1, j) - h(i - 1, j), dz = h(i, j + 1) - h(i, j - 1);
    const n = V(-dx, 4 * S, -dz).normalize();
    const slope = 1 - n.y;
    // the ground's colour and kind: the sea floor, sand and pebbles at the water's edge, rock
    // on the cliffs, grass and the woods' floor above
    let p = PAT.GRASS;
    if (y < -0.4) {
      c.copy(C_BED).lerp(C_BED_DK, smoothstep(-0.4, -6, y) * 0.8 + noise2(x * 0.1, z * 0.1) * 0.2);
      p = slope > 0.3 ? PAT.ROCK : PAT.SAND;
    } else if (slope > 0.42) {
      c.copy(C_ROCK).lerp(C_ROCK_DK, noise2(x * 0.15, z * 0.2));
      p = PAT.ROCK;
    } else if (y < 1.3) {
      const pebbly = noise2(x * 0.04 + 3.1, z * 0.04) > 0.5;
      c.copy(pebbly ? C_PEBBLE : C_SAND).lerp(C_ROCK, smoothstep(0.2, 0.42, slope));
      p = pebbly ? PAT.GRAVEL : PAT.SAND;
    } else {
      c.copy(C_GRASS).lerp(C_GRASS_DK, fbm2(x * 0.03, z * 0.03, 3)).lerp(C_FOREST, smoothstep(4, 14, y) * 0.6);
      if (slope > 0.28) c.lerp(C_ROCK, smoothstep(0.28, 0.42, slope) * 0.7);
    }
    const base = pos.length / 3;
    pos.push(x, y, z);
    nor.push(n.x, n.y, n.z);
    col.push(c.r, c.g, c.b);
    uv.push(x, z);
    pat.push(p);
    patw.push(p === PAT.GRASS ? 1 : 0, p === PAT.ROCK ? 1 : 0, p === PAT.SAND ? 1 : 0, p === PAT.GRAVEL ? 1 : 0);
    at[k] = base;
    return base;
  };
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      // (the deep sea floor is never seen through the water)
      if (Math.max(h(i, j), h(i + 1, j), h(i, j + 1), h(i + 1, j + 1)) < -4.5) continue;
      const a = vertex(i, j), b = vertex(i + 1, j), cc = vertex(i, j + 1), d = vertex(i + 1, j + 1);
      idx.push(a, cc, b, b, cc, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('pattern', new THREE.Float32BufferAttribute(pat, 1));
  g.setAttribute('patw', new THREE.Float32BufferAttribute(patw, 4));
  g.setIndex(new THREE.BufferAttribute(new Uint32Array(idx), 1));
  g.computeBoundingSphere();
  const mat = createGroundMaterial(map.toTexture(), new THREE.Vector4(map.x0, map.z0, map.w / map.ppm, map.h / map.ppm));
  const mesh = new THREE.Mesh(g, mat);
  mesh.name = 'island';
  mesh.receiveShadow = true;
  mesh.matrixAutoUpdate = false;
  // (the sea mirrors the island)
  mesh.layers.enable(1);
  return { mesh, H, nx, nz, S };
}

// the island's sea floor for the water (its depth, foam at the waterline, the shallows' colour):
// a texture of heights over the box
function depthMap(grid) {
  const { H, nx, nz } = grid;
  const W = Math.ceil(nx / 2) + 1, D = Math.ceil(nz / 2) + 1;
  const data = new Uint16Array(W * D);
  for (let j = 0; j < D; j++) for (let i = 0; i < W; i++) data[j * W + i] = THREE.DataUtils.toHalfFloat(H[Math.min(nz, j * 2) * (nx + 1) + Math.min(nx, i * 2)]);
  const tex = new THREE.DataTexture(data, W, D, THREE.RedFormat, THREE.HalfFloatType);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return { tex, W, D };
}

// ---------------------------------------------------------------------------- the harbour
function harbour(ctx, map, rng) {
  const Q = I.quay, C = ctx.colliders;
  const B = (x, z) => ctx.builders.get('toon', x, z);
  const qz = Z(Q.w), x0 = X(Q.u0), x1 = X(Q.u1), y = Q.y;
  // where the steps go down to the landing (the quay's coping opens there)
  const SX0 = X(-30.8), SX1 = X(-29.2);
  // the quay wall, its coping, a low curb along the edge (open at the steps)
  for (let x = x0; x < x1; x += 8) {
    const xe = Math.min(x1, x + 8);
    const b = B(x, qz);
    b.boxMM(x, -3.6, qz - 0.55, xe, y - 0.02, qz + 0.1, { color: CONC, pattern: PAT.CONCRETE, ao: 0.3 });
    for (const [a, c] of [[x, Math.min(xe, SX0)], [Math.max(x, SX1), xe]]) if (c - a > 0.05) b.boxMM(a, y - 0.02, qz - 0.6, c, y + 0.16, qz - 0.05, { color: CONC_LT, pattern: PAT.CONCRETE });
  }
  // the quay's ends: down to the rocks
  for (const xe of [x0, x1]) B(xe, qz).boxMM(xe - 0.3, -3.6, qz - 0.55, xe + 0.3, y, qz + Q.back, { color: CONC, pattern: PAT.CONCRETE, ao: 0.3 });
  // (her feet stay on the apron: the edge, apart from the steps, is a low curb)
  for (const [a, c] of [[x0, SX0], [SX1, x1]]) C.addBox((a + c) / 2, qz - 0.3, (c - a) / 2, 0.3, 0, y + 0.45);
  // the boat cannot come in over the quay
  C.addBox((x0 + x1) / 2, qz + 2, (x1 - x0) / 2 + 0.3, 2.3, 0, y + 0.3, -4);
  // bollards and tyre fenders
  const bollards = [];
  for (let x = x0 + 4; x < x1 - 2; x += 8) {
    if (x > SX0 - 1.5 && x < SX1 + 1.5) continue;
    const b = B(x, qz);
    b.cyl(x, y, qz - 0.3, 0.19, 0.16, 0.48, 10, 0x2f3438, PAT.METAL);
    b.cyl(x, y + 0.48, qz - 0.3, 0.25, 0.25, 0.08, 10, 0x2f3438, PAT.METAL);
    b.pushTRS(x + 2.4, y - 0.9, qz - 0.62, 0);
    b.geom(new THREE.TorusGeometry(0.4, 0.13, 6, 12), new THREE.Matrix4().makeRotationX(-0.12), 0x262628);
    b.pop();
    C.addCircle(x, qz - 0.3, 0.24, y + 0.6);
    bollards.push(x);
  }
  // an iron ladder down the face
  {
    const lx = X(-6), b = B(lx, qz);
    for (const e of [-0.22, 0.22]) b.rod(V(lx + e, -1.5, qz - 0.62), V(lx + e, y + 0.7, qz - 0.62), 0.025, 0.025, 5, 0x6a7076);
    for (let yy = -1.2; yy < y; yy += 0.3) b.rod(V(lx - 0.22, yy, qz - 0.62), V(lx + 0.22, yy, qz - 0.62), 0.016, 0.016, 4, 0x6a7076);
  }
  // the steps down to the floating landing, handrails either side
  const LY = LANDING_Y, n = 10, run = 0.3, rise = (y - LY) / n;
  const sz0 = qz - 0.55, sz1 = sz0 - n * run;
  {
    const b = B(SX0, sz0);
    for (let i = 0; i < n; i++) {
      const za = sz0 - i * run, top = y - (i + 1) * rise;
      b.boxMM(SX0, top - 0.5, za - run, SX1, top, za, { color: CONC, pattern: PAT.CONCRETE });
    }
    for (const x of [SX0 + 0.05, SX1 - 0.05]) {
      const yt = y - rise, yb = LY;
      b.box(x, yt + 0.45, sz0 - 0.15, 0.06, 0.9, 0.06, { color: 0xd8d6cc });
      b.box(x, yb + 0.45, sz1 + 0.15, 0.06, 0.9, 0.06, { color: 0xd8d6cc });
      b.rod(V(x, yt + 0.9, sz0 - 0.15), V(x, yb + 0.9, sz1 + 0.15), 0.035, 0.035, 5, 0xd8d6cc);
      C.addSegment(x, sz1, x, sz0, 0.1, y + 1.7, LY - 0.3);
    }
    C.addSurface(SX0, sz1, SX1, qz + 0.2, (px, pz) => (pz > sz0 ? y : y - (Math.min(n - 1, Math.floor((sz0 - pz) / run)) + 1) * rise), 2);
  }
  // the floating landing: on white floats, a fender strip on the sea side, cleats
  const lx0 = X(-36), lx1 = X(-24), lz1 = sz1, lz0 = lz1 - 2.4;
  {
    const b = B(lx0, lz0);
    b.boxMM(lx0 + 0.1, LY - 0.5, lz0 + 0.1, lx1 - 0.1, LY - 0.1, lz1 - 0.1, { color: 0xe6e6e0, pattern: PAT.METAL, ao: 0.3 });
    b.boxMM(lx0, LY - 0.12, lz0, lx1, LY, lz1, { color: 0xa58462, pattern: PAT.PLANKS });
    b.boxMM(lx0, LY - 0.32, lz0 - 0.06, lx1, LY - 0.06, lz0 + 0.06, { color: 0x26282c });
    for (const t of [0.15, 0.85]) {
      const cx = lx0 + (lx1 - lx0) * t;
      b.box(cx, LY + 0.06, lz0 + 0.18, 0.3, 0.12, 0.08, { color: IRON });
      b.box(cx, LY + 0.13, lz0 + 0.18, 0.36, 0.04, 0.12, { color: IRON });
    }
    // guide piles through hoops on the quay side
    for (const x of [lx0 + 0.6, lx1 - 0.6]) {
      b.cyl(x, -3.4, lz1 - 0.3, 0.16, 0.15, LY + 1.5 + 3.4, 8, WOOD_DK, PAT.BARK, { ao: 0.35 });
      b.cyl(x, LY - 0.02, lz1 - 0.3, 0.24, 0.24, 0.1, 10, IRON);
      C.addCircle(x, lz1 - 0.3, 0.22);
    }
    C.addSurface(lx0, lz0, lx1, lz1, () => LY, 1);
    C.addBox((lx0 + lx1) / 2, (lz0 + lz1) / 2, (lx1 - lx0) / 2, (lz1 - lz0) / 2, 0, LY);
  }
  // the boat's place: alongside the landing's sea side, bow to the east (out round the basin)
  ctx.berths.push({
    id: 'island', name: '凪ノ島',
    x: (lx0 + lx1) / 2, z: lz0 - 0.92, h: Math.PI / 2,
    stand: { x: (lx0 + lx1) / 2, z: lz0 + 0.75, y: LY },
  });
  // the breakwater arm round the basin: a rubble mound capped in concrete, a parapet on the
  // sea side, tetrapods outside, the red beacon at its head
  const M = I.mole.map(([u, w]) => [X(u), Z(w)]);
  const top = 2.5;
  for (let i = 0; i < M.length - 1; i++) {
    const [ax, az] = M[i], [bx, bz] = M[i + 1];
    const len = Math.hypot(bx - ax, bz - az), ry = Math.atan2(-(bz - az), bx - ax);
    const cx = (ax + bx) / 2, cz = (az + bz) / 2;
    const b = B(cx, cz);
    b.box(cx, (top - 3.8) / 2, cz, len + 4.2, top + 3.8, 4.4, { color: CONC, pattern: PAT.CONCRETE, ry, ao: 0.25 });
    // the parapet, on the outer side
    const ox = Math.sin(ry) * 1.9, oz = Math.cos(ry) * 1.9;
    const side = i === 0 ? 1 : 1;
    b.box(cx + ox * side, top + 0.5, cz + oz * side, len + 4.2, 1.0, 0.6, { color: CONC_LT, pattern: PAT.CONCRETE, ry });
    C.addBox(cx, cz, (len + 4.2) / 2, 2.2, ry, top + 1);
    // tetrapods against the outer face
    const steps = Math.max(1, Math.round(len / 3));
    for (let k = 0; k < steps; k++) {
      const t = (k + rng.next()) / steps, off = rng.range(2.8, 5.2);
      const tx = ax + (bx - ax) * t + Math.sin(ry) * off, tz = az + (bz - az) * t + Math.cos(ry) * off;
      tetrapod(b, tx, Math.max(islandH(tx, tz) ?? -6, 0.6 - (off - 2.8) * 0.6), tz, rng.range(1.0, 1.4), rng, C);
    }
  }
  {
    const [hx, hz] = M[M.length - 1];
    const b = B(hx, hz);
    b.cyl(hx, top, hz, 1.2, 1.2, 0.4, 14, CONC_LT, PAT.CONCRETE);
    b.cyl(hx, top + 0.4, hz, 0.75, 0.55, 5.2, 12, 0xd23a2a);
    b.cyl(hx, top + 5.6, hz, 0.8, 0.8, 0.1, 12, 0xe8e6e0);
    ctx.builders.get('emissive', hx, hz).cyl(hx, top + 5.7, hz, 0.3, 0.26, 0.45, 8, 0xff5a3a);
    b.cyl(hx, top + 6.15, hz, 0.4, 0.05, 0.3, 8, 0x2f3438);
    C.addCircle(hx, hz, 1.3, top + 6.5);
  }
  // a couple of island boats moored along the quay, their lines to the bollards
  for (const [u, ry] of [[-2, Math.PI / 2 + 0.05], [6.5, Math.PI / 2 - 0.06]]) {
    const bx = X(u), bz = qz - 4.0;
    boat(ctx, bx, bz, ry, rng, { float: 0.05 });
    const bo = bollards.reduce((p, c) => (Math.abs(c - bx) < Math.abs(p - bx) ? c : p), bollards[0]);
    B(bx, bz).detail.tube([V(bo, y + 0.45, qz - 0.3), V((bo + bx) / 2, y - 0.4, qz - 1.6), V(bx, 1.0, bz + 1.4)], 0.025, 4, 0xd8cfa8);
  }
  // the apron: fish boxes, nets and floats, a fishermen's shed (番屋), a vending machine, a
  // notice board welcoming you to the island, a lamp
  const b = B(X(-14), Z(-80));
  {
    const sx0 = X(-43), sx1 = X(-35), sz0 = Z(-84.8), sz1 = Z(-79);
    b.boxMM(sx0, y - 0.2, sz0, sx1, y + 2.8, sz1, { color: 0x8a7a68, pattern: PAT.BOARDS, ao: 0.2 });
    b.boxMM(sx0 - 0.4, y + 2.8, sz0 - 0.4, sx1 + 0.4, y + 3.0, sz1 + 0.4, { color: 0x6f7a80, pattern: PAT.CORRUGATED });
    b.box((sx0 + sx1) / 2 + 1.5, y + 1.15, sz0 - 0.03, 2.4, 2.3, 0.05, { color: 0x3a3632 });
    C.addBox((sx0 + sx1) / 2, (sz0 + sz1) / 2, (sx1 - sx0) / 2, (sz1 - sz0) / 2);
  }
  for (let i = 0; i < 6; i++) {
    const x = X(rng.range(-22, -9)), z = Z(rng.range(-84, -77));
    const k = rng.int(1, 3);
    for (let j = 0; j < k; j++) b.box(x, y + 0.18 + j * 0.34, z, 0.7, 0.32, 0.5, { color: rng.pick([0x2f6fb0, 0xe0782a, 0x3a9a6a, 0xe8e2d0]), ry: rng.range(-0.2, 0.2) });
    C.addBox(x, z, 0.4, 0.3, 0, y + 0.4 + k * 0.34);
  }
  for (let i = 0; i < 2; i++) {
    const x = X(2 + i * 3.6), z = Z(-79.5);
    b.geom(new THREE.SphereGeometry(1, 8, 5), new THREE.Matrix4().compose(V(x, y + 0.15, z), new THREE.Quaternion(), V(1.2, 0.45, 0.9)), rng.pick([0x3f6a4a, 0x2f5a6a]), PAT.LATTICE);
    for (let k = 0; k < 4; k++) b.geom(new THREE.SphereGeometry(0.16, 8, 6), new THREE.Matrix4().makeTranslation(x + rng.range(-0.8, 0.8), y + 0.45, z + rng.range(-0.4, 0.4)), 0xf07a2a);
    C.addBox(x, z, 1.2, 0.9, 0, y + 0.6);
  }
  ctx.vending.push({ x: X(-33.6), z: Z(-82.2), ry: Math.PI / 2, seed: 4242, n: 1 });
  {
    const nx = X(-18), nz = Z(-74.6);
    for (const e of [-0.9, 0.9]) b.box(nx + e, y + 0.9, nz, 0.1, 1.8, 0.1, { color: WOOD_DK });
    b.box(nx, y + 1.45, nz, 2.0, 0.9, 0.08, { color: WOOD });
    const uv = ctx.atlas2.draw('isle-welcome', 512, 230, (c, w, h) => drawBoard(c, w, h, { text: 'ようこそ 凪ノ島へ', sub: 'NAGI ISLAND · 灯台まで徒歩10分', bg: '#fbf6ea', fg: '#2f5878', subColor: '#c0546e', font: FONTS.mincho || FONTS.bold, weather: false }));
    ctx.builders.get('sign2', nx, nz).quad(V(nx - 0.92, y + 1.04, nz - 0.05), V(nx + 0.92, y + 1.04, nz - 0.05), V(nx + 0.92, y + 1.86, nz - 0.05), V(nx - 0.92, y + 1.86, nz - 0.05), 0xffffff, 0.5, { uvs: [[uv.u1, uv.v0], [uv.u0, uv.v0], [uv.u0, uv.v1], [uv.u1, uv.v1]] });
    C.addBox(nx, nz, 1.0, 0.1);
    ctx.interactables.push({ kind: 'sign', x: nx, z: nz - 0.8, y, r: 1.4, label: '案内板を読む', text: '凪ノ島。人口三十人ほどの小さな島。坂の上に白い灯台がある。', secs: 4 });
  }
  islandLamp(ctx, X(-24), Z(-76), y, 6.0);
  // the apron's worn concrete, the steps' landing edge
  map.paint(x0, qz - 0.6, x1, qz + Q.back, (px, pz) => [noise2(px * 0.2, pz * 0.2) > 0.5 ? 0xb4b0a6 : 0xa8a49a, PAT.CONCRETE, 0.08]);
}

function islandLamp(ctx, x, z, y, h = 4.6) {
  const b = ctx.builders.get('toon', x, z);
  b.cyl(x, y, z, 0.08, 0.06, h, 8, 0x8a9094);
  b.rod(V(x, y + h - 0.1, z), V(x, y + h, z + 0.8), 0.045, 0.045, 5, 0x8a9094);
  ctx.builders.get('emissive', x, z).box(x, y + h - 0.12, z + 0.9, 0.26, 0.07, 0.42, { color: 0xffcf80 });
  ctx.lamps.push({ x, y: y + h - 0.2, z: z + 0.9, r: 6, color: 0xffc070 });
  ctx.colliders.addCircle(x, z, 0.14);
}

// ---------------------------------------------------------------------------- the village
function village(ctx, map, rng) {
  const Vg = I.village, B = (x, z) => ctx.builders.get('toon', x, z);
  // the lanes: up from the apron to the path's foot, and across
  const laneU = -12, laneW = -61;
  map.paint(X(laneU - 1.6), Z(Vg.w0 - 0.5), X(laneU + 1.6), Z(Vg.w1 + 1), (x, z) => [noise2(x * 0.3, z * 0.3) > 0.5 ? 0xb9b3a6 : 0xaea89a, PAT.PAVING, 0.06]);
  map.paint(X(Vg.u0 + 2), Z(laneW - 1.4), X(Vg.u1 - 2), Z(laneW + 1.4), (x, z) => [noise2(x * 0.3, z * 0.3) > 0.5 ? 0xb9b3a6 : 0xaea89a, PAT.PAVING, 0.06]);
  // the houses (old houses mostly, tiled roofs), on lots either side of the lanes
  const lots = [
    { x0: X(-30), x1: X(-15), z0: Z(-72.6), z1: Z(-63), front: 'E', type: 'oldhouse' },
    { x0: X(-30), x1: X(-15), z0: Z(-59.2), z1: Z(-50.2), front: 'E', type: 'oldhouse' },
    { x0: X(-9), x1: X(5), z0: Z(-72.6), z1: Z(-63), front: 'W', type: 'house' },
    { x0: X(-9), x1: X(6), z0: Z(-59.2), z1: Z(-50.2), front: 'W', type: 'oldhouse' },
    { x0: X(-46), x1: X(-33), z0: Z(-59.2), z1: Z(-50.2), front: 'N', type: 'oldhouse' },
  ];
  // (their yards painted on the island's own ground map)
  const town = ctx.ground;
  ctx.ground = map;
  for (const lot of lots) {
    lot.seed = rng.int(1, 1e9);
    (lot.type === 'house' ? buildHouse : buildOldHouse)(ctx, lot);
  }
  ctx.ground = town;
  // the island's shop: a little store facing the harbour, its awning, a bench and a red post
  {
    const x0 = X(8.5), x1 = X(18), z0 = Z(-72.4), z1 = Z(-64.5);
    const y0 = islandH((x0 + x1) / 2, z0) + 0.1;
    const b = B(x0, z0);
    b.boxMM(x0, y0 - 0.6, z0, x1, y0 + 0.25, z1, { color: 0xa7a197, pattern: PAT.STONE });
    b.boxMM(x0 + 0.1, y0 + 0.25, z0 + 0.1, x1 - 0.1, y0 + 3.1, z1 - 0.1, { color: 0xe9e1d0, pattern: PAT.SIDING, ao: 0.12 });
    b.boxMM(x0 - 0.35, y0 + 3.1, z0 - 0.4, x1 + 0.35, y0 + 3.3, z1 + 0.35, { color: 0x5c5048 });
    // the shop front: glass doors, the awning in red and white stripes
    ctx.builders.get('window', x0, z0).quad(V(x0 + 1.0, y0 + 0.3, z0 + 0.08), V(x1 - 1.0, y0 + 0.3, z0 + 0.08), V(x1 - 1.0, y0 + 2.3, z0 + 0.08), V(x0 + 1.0, y0 + 2.3, z0 + 0.08), 0xffffff, 33, { uvs: [[0, 0], [1, 0], [1, 1], [0, 1]], flip: true });
    for (let i = 0; i < 8; i++) {
      const xa = x0 + 0.2 + ((x1 - x0 - 0.4) * i) / 8, xb = x0 + 0.2 + ((x1 - x0 - 0.4) * (i + 1)) / 8;
      b.quad(V(xa, y0 + 2.75, z0 + 0.05), V(xb, y0 + 2.75, z0 + 0.05), V(xb, y0 + 2.45, z0 - 1.2), V(xa, y0 + 2.45, z0 - 1.2), i % 2 ? 0xd8402e : 0xf4f0e6, 0, { double: true });
    }
    const uv = ctx.atlas2.draw('isle-shop', 512, 128, (c, w, h) => drawBoard(c, w, h, { text: 'なぎの商店', sub: 'たばこ・食料品・氷', bg: '#2f5878', fg: '#fdf8ee', subColor: '#f3c3cf', font: FONTS.mincho || FONTS.bold, weather: false }));
    const sy = y0 + 2.85;
    ctx.builders.get('sign2', x0, z0).quad(V(x1 - 0.6, sy, z0 + 0.02), V(x0 + 0.6, sy, z0 + 0.02), V(x0 + 0.6, sy + 0.55, z0 + 0.02), V(x1 - 0.6, sy + 0.55, z0 + 0.02), 0xffffff, 0.5, { uvs: [[uv.u0, uv.v0], [uv.u1, uv.v0], [uv.u1, uv.v1], [uv.u0, uv.v1]] });
    ctx.colliders.addBox((x0 + x1) / 2, (z0 + z1) / 2, (x1 - x0) / 2, (z1 - z0) / 2);
    benchAt(ctx, b, x0 + 1.4, y0 - 0.05, z0 - 1.6, Math.PI, 0x8a6a4a, '店先のベンチに座る');
    b.box(x1 - 0.5, y0 + 0.65, z0 - 0.6, 0.4, 1.3, 0.4, { color: 0xc8302a });
    b.box(x1 - 0.5, y0 + 1.33, z0 - 0.6, 0.46, 0.06, 0.46, { color: 0xb02a24 });
    ctx.colliders.addCircle(x1 - 0.5, z0 - 0.6, 0.3);
    ctx.vending.push({ x: x0 - 0.6, z: z0 + 1.6, ry: -Math.PI / 2, seed: 5151, n: 1 });
    ctx.interactables.push({ kind: 'sign', x: (x0 + x1) / 2, z: z0 - 1.0, y: y0, r: 1.6, label: 'なぎの商店をのぞく', text: 'なぎの商店。おばあちゃんが「よう来たね」とラムネを一本おまけしてくれた。', secs: 4 });
    map.rect(x0 - 1, z0 - 3, x1 + 1, z0, 0xb6b0a2, PAT.PAVING);
  }
  // potted plants and a few flowers by the doors, stone walls along the lane
  for (let i = 0; i < 10; i++) {
    const side = i % 2 ? 1 : -1, w = Vg.w0 + 2 + (i >> 1) * 4.5;
    if (Math.abs(w - laneW) < 2.5) continue;
    const x = X(laneU + side * 2.0), z = Z(w);
    const y = islandH(x, z);
    const b = B(x, z);
    b.cyl(x, y, z, 0.18, 0.22, 0.32, 10, rng.pick([0x9a5a3a, 0x6a6a72, 0x3f5a7a]));
    b.geom(new THREE.SphereGeometry(0.28, 8, 6), new THREE.Matrix4().compose(V(x, y + 0.48, z), new THREE.Quaternion(), V(1, 0.8, 1)), rng.pick([0x5f8f4c, 0x6c9a55]), PAT.LEAVES);
    ctx.colliders.addCircle(x, z, 0.22, y + 0.7);
  }
  islandLamp(ctx, X(laneU + 2.2), Z(laneW + 2.5), islandH(X(laneU + 2.2), Z(laneW + 2.5)), 4.6);
}

// ---------------------------------------------------------------------------- the path
function hillPath(ctx, map, rng) {
  const B = (x, z) => ctx.builders.get('toon', x, z);
  // the gravel bench (painted on the island's ground)
  const pp = pathPoints(), xs = pp.map((p) => p.x), zs = pp.map((p) => p.z);
  map.paint(Math.min(...xs) - 2, Math.min(...zs) - 2, Math.max(...xs) + 2, Math.max(...zs) + 2, (x, z) => {
    const p = pathNear(x - I.x, z - I.z);
    if (p.d > PATH_W / 2) return null;
    return [noise2(x * 0.4, z * 0.4) > 0.5 ? 0xc2b49a : 0xb6a88e, PAT.GRAVEL, 0.08];
  });
  // a wooden handrail on the downhill side, a lamp every so often, signposts at the turns
  const pts = pathPoints();
  // (nothing of one stretch on another: at the hairpins the arms run close)
  const clear = (x, z, i, m) => {
    for (let j = 0; j < pts.length - 1; j++) {
      if (j === i) continue;
      const a = pts[j], c = pts[j + 1], dx = c.x - a.x, dz = c.z - a.z;
      const t = clamp(((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz), 0, 1);
      if (Math.hypot(x - a.x - dx * t, z - a.z - dz * t) < PATH_W / 2 + m) return false;
    }
    return true;
  };
  let lamp = 10;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], c = pts[i + 1];
    const len = Math.hypot(c.x - a.x, c.z - a.z), dx = (c.x - a.x) / len, dz = (c.z - a.z) / len;
    // which side falls away: the lower of the two sides a little way off (and round the outside
    // of a hairpin's landing, away from its arms)
    const nxl = -dz, nzl = dx;
    const mx = (a.x + c.x) / 2, mz = (a.z + c.z) / 2;
    let down = (islandH(mx + nxl * 4, mz + nzl * 4) ?? 0) < (islandH(mx - nxl * 4, mz - nzl * 4) ?? 0) ? 1 : -1;
    if (a.turn === 1 && c.turn === 2) {
      const p = pts[i - 1];
      down = nxl * (p.x - a.x) + nzl * (p.z - a.z) > 0 ? -1 : 1;
    }
    const off = (PATH_W / 2 + 0.15) * down;
    // (posts in runs, broken where they would stand on another stretch)
    const runs = [[]];
    for (let t = 1.2; t < len - 1.1; t += 2.4) {
      const x = a.x + dx * t + nxl * off, z = a.z + dz * t + nzl * off;
      if (!clear(x, z, i, 0.45)) {
        if (runs[runs.length - 1].length) runs.push([]);
        continue;
      }
      const p = pathNear(x - I.x, z - I.z);
      runs[runs.length - 1].push(V(x, p.y, z));
    }
    const b = B(mx, mz);
    for (const posts of runs) {
      for (const p of posts) b.box(p.x, p.y + 0.45, p.z, 0.1, 0.9, 0.1, { color: WOOD_DK, pattern: PAT.BOARDS });
      for (let k = 0; k < posts.length - 1; k++) {
        const p = posts[k], q = posts[k + 1];
        for (const hgt of [0.85, 0.45]) b.rod(V(p.x, p.y + hgt, p.z), V(q.x, q.y + hgt, q.z), 0.035, 0.035, 5, WOOD, PAT.BOARDS);
        ctx.colliders.addSegment(p.x, p.z, q.x, q.z, 0.12, Math.max(p.y, q.y) + 1.6, Math.min(p.y, q.y) - 0.6);
      }
    }
    // lamps along it, on the uphill side
    for (let t = 0; t < len; t += 1) {
      lamp -= 1;
      if (lamp > 0) continue;
      const x = a.x + dx * t - nxl * (PATH_W / 2 + 0.5) * down, z = a.z + dz * t - nzl * (PATH_W / 2 + 0.5) * down;
      if (!clear(x, z, i, 0.6)) continue;
      lamp = 34;
      islandLamp(ctx, x, z, islandH(x, z) ?? 0, 3.6);
    }
  }
  // the signpost at the foot of the path
  {
    const p = pts[0], x = p.x + 2.2, z = p.z + 0.6, y = islandH(x, z);
    const b = B(x, z);
    b.box(x, y + 0.8, z, 0.1, 1.6, 0.1, { color: WOOD_DK });
    b.box(x + 0.35, y + 1.35, z, 0.75, 0.22, 0.05, { color: WOOD, ry: 0.2 });
    ctx.colliders.addCircle(x, z, 0.1);
    ctx.interactables.push({ kind: 'sign', x, z: z + 0.6, y, r: 1.2, label: '道しるべを読む', text: '↑ 凪ノ島灯台・展望台 300m', secs: 2.6 });
  }
  void rng;
}

// ---------------------------------------------------------------------------- the top
function summit(ctx, scene, map) {
  const T = I.top, B = (x, z) => ctx.builders.get('toon', x, z), C = ctx.colliders;
  const cx = X(T.u), cz = Z(T.w), y = T.y;
  map.circle(cx, cz, T.r - 0.5, 0xbdb3a0, PAT.GRAVEL);
  // the lighthouse: a white round tower, its gallery and lantern room, on the south side of
  // the top (the deck looks back over the north side to the town)
  const lx = cx + 2.5, lz = cz + 5.5;
  const b = B(lx, lz);
  b.cyl(lx, y - 0.4, lz, 2.4, 2.4, 0.8, 16, 0xd8d4ca, PAT.CONCRETE);
  b.cyl(lx, y + 0.4, lz, 1.85, 1.4, 10.5, 16, WHITE, PAT.NONE, { ao: 0.08 });
  const gy = y + 10.9;
  b.cyl(lx, gy, lz, 2.05, 2.05, 0.2, 16, 0xe8e6e0, 0, { bottomCap: true });
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    b.detail.box(lx + Math.cos(a) * 1.95, gy + 0.55, lz + Math.sin(a) * 1.95, 0.05, 0.9, 0.05, { color: 0x3a4248 });
  }
  b.detail.cyl(lx, gy + 1.0, lz, 1.97, 1.97, 0.06, 18, 0x3a4248, 0, { caps: false });
  b.cyl(lx, gy + 0.2, lz, 1.15, 1.15, 0.45, 12, 0x3a4248);
  ctx.builders.get('window', lx, lz).cyl(lx, gy + 0.65, lz, 1.0, 1.0, 1.45, 12, 0xffffff, 200, { caps: false });
  b.cyl(lx, gy + 2.1, lz, 1.2, 0.22, 1.0, 12, 0xc23a2c, 0, { bottomCap: true });
  b.cyl(lx, gy + 3.1, lz, 0.07, 0.02, 0.6, 5, 0x2f3a42);
  ctx.builders.get('emissive', lx, lz).cyl(lx, gy + 1.0, lz, 0.4, 0.4, 0.7, 10, 0xfff4d8);
  b.box(lx, y + 1.05, lz - 1.7, 0.85, 1.9, 0.12, { color: 0x3f6a8a, ry: 0 });
  C.addCircle(lx, lz, 2.0);
  ctx.isleLight = { x: lx, y: gy + 1.35, z: lz };
  lighthouseBeam(ctx, scene, lx, gy + 1.35, lz);
  // the viewing deck at the north edge: boards over the slope, a railing round it, benches and
  // a pair of coin binoculars looking at the town
  const d0 = cz - T.r + 0.5, dx0 = cx - 6, dx1 = cx + 6;
  const dz0 = d0 - 3.2, dz1 = d0 + 1.2;
  const db = B(cx, dz0);
  db.boxMM(dx0, y - 0.12, dz0, dx1, y + 0.08, dz1, { color: 0xa58462, pattern: PAT.PLANKS });
  for (const x of [dx0 + 0.3, cx, dx1 - 0.3]) for (const z of [dz0 + 0.3]) db.cyl(x, (islandH(x, z) ?? y) - 0.3, z, 0.12, 0.12, y - (islandH(x, z) ?? y) + 0.2, 8, WOOD_DK, PAT.BARK);
  C.addSurface(dx0, dz0, dx1, dz1, () => y + 0.08, 1);
  const rail = (ax, az, bx, bz) => {
    const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(len / 1.8));
    for (let i = 0; i <= n; i++) db.box(ax + ((bx - ax) * i) / n, y + 0.6, az + ((bz - az) * i) / n, 0.09, 1.0, 0.09, { color: WHITE });
    for (const h of [1.05, 0.6]) db.rod(V(ax, y + h, az), V(bx, y + h, bz), 0.035, 0.035, 5, WHITE);
    C.addSegment(ax, az, bx, bz, 0.14, y + 1.8, y - 1);
  };
  rail(dx0, dz0, dx1, dz0);
  rail(dx0, dz0, dx0, dz1);
  rail(dx1, dz0, dx1, dz1);
  for (const bx of [cx - 3.2, cx + 3.2]) benchAt(ctx, db, bx, y + 0.08, dz0 + 1.3, 0, 0x8a6a4a, '海を眺めるベンチに座る');
  {
    const bx = cx, bz = dz0 + 0.6;
    db.cyl(bx, y + 0.08, bz, 0.09, 0.09, 1.1, 8, 0x2f6a5a);
    db.box(bx, y + 1.3, bz, 0.42, 0.22, 0.26, { color: 0x2f6a5a });
    for (const e of [-0.1, 0.1]) db.rod(V(bx + e, y + 1.3, bz - 0.1), V(bx + e, y + 1.3, bz - 0.24), 0.05, 0.06, 8, 0x2a2c30);
    C.addCircle(bx, bz, 0.2);
    ctx.interactables.push({ kind: 'sign', x: bx, z: bz + 0.7, y: y + 0.08, r: 1.2, label: '望遠鏡をのぞく', text: '望遠鏡の向こうに桜ヶ浜の町。さくら桟橋の先で、誰かが手を振っている気がした。', secs: 4.2 });
  }
  // a little stone monument by the path's top
  {
    const sx = cx - 7.5, sz = cz - 1.5;
    B(sx, sz).box(sx, y + 0.55, sz, 0.55, 1.1, 0.3, { color: 0x9a948a, pattern: PAT.STONE });
    C.addBox(sx, sz, 0.3, 0.2);
  }
}

// ---------------------------------------------------------------------------- the woods
function woods(ctx, rng) {
  let n = 0;
  for (let i = 0; i < 2600 && n < 260; i++) {
    const u = rng.range(-150, 150), w = rng.range(-110, 100);
    const x = X(u), z = Z(w);
    const y = islandH(x, z);
    if (y === null || y < 1.4) continue;
    // not on the paths, the apron, the village's lots, the top, nor too near them
    if (pathNear(u, w).d < PATH_W / 2 + 2.2) continue;
    if (Math.hypot(u - I.top.u, w - I.top.w) < I.top.r + 2) continue;
    if (u > I.village.u0 - 3 && u < I.village.u1 + 3 && w > I.quay.w - 2 && w < I.village.w1 + 3) continue;
    if (islandWalk(x, z)) continue;
    // (on the steepest rock, nothing)
    const sl = Math.abs((islandH(x + 1, z) ?? y) - (islandH(x - 1, z) ?? y)) + Math.abs((islandH(x, z + 1) ?? y) - (islandH(x, z - 1) ?? y));
    if (sl > 2.6) continue;
    const coast = y < 6;
    const kind = coast ? (rng.chance(0.8) ? 'blackpine' : 'shrubTree') : rng.weighted([['forest', 6], ['broadleaf', 2], ['blackpine', 1.5], ['sakura', 0.5]]);
    const t = { kind, x, z, seed: rng.int(1, 1e9), scale: rng.range(0.8, 1.15) };
    if (kind === 'blackpine') t.lean = [rng.range(-0.3, 0.3), rng.range(0.05, 0.4)];
    ctx.trees.push(t);
    n++;
  }
  // a few sakura by the village and the top
  for (const [u, w] of [[-34, -66], [12, -56], [-40, -52], [I.top.u - 9, I.top.w + 6], [I.top.u + 9, I.top.w - 4]]) {
    ctx.trees.push({ kind: 'sakura', x: X(u), z: Z(w), seed: rng.int(1, 1e9), scale: rng.range(0.85, 1.0) });
  }
  return n;
}

// The woods cut back over the path up the hill (world.js, once the trees are grown): no clump
// of leaves hangs into the way, over it at head height or across its edges. A clump a little
// low goes up over the way; one further down (a crown on the slope above, low over the path)
// goes out to the side, a little smaller.
export function clearIslandPath(fs) {
  const half = PATH_W / 2 + 0.4, head = 2.5;
  let moved = 0;
  for (const fb of fs.map.values()) {
    const P = fb.pos, Cd = fb.card;
    for (let v = 0; v < fb.count; v += 4) {
      let px = P[v * 3], py = P[v * 3 + 1], pz = P[v * 3 + 2];
      if (px < I.x0 || px > I.x1 || pz < I.z0 || pz > I.z1) continue;
      let size = Cd[v * 4 + 2];
      const R = size * 0.95;
      const pn = pathNear(px - I.x, pz - I.z);
      if (pn.d > half + R) continue;
      const top = pn.y + head;
      const low = top - (py - R * 0.8);
      if (low <= 0) continue;
      if (low < 1.2) py += low;
      else {
        const k = pn.d > 1e-3 ? 1 / pn.d : 0;
        const nx = pn.d > 1e-3 ? (px - I.x - pn.u) * k : 1, nz = pn.d > 1e-3 ? (pz - I.z - pn.w) * k : 0;
        size *= 0.85;
        const out = half + size * 0.95;
        px = I.x + pn.u + nx * out;
        pz = I.z + pn.w + nz * out;
      }
      for (let k = v; k < v + 4; k++) {
        P[k * 3] = px;
        P[k * 3 + 1] = py;
        P[k * 3 + 2] = pz;
        Cd[k * 4 + 2] = size;
      }
      moved++;
    }
  }
  return moved;
}

export function buildIsland(ctx, scene) {
  const rng = new RNG(9191);
  const map = new GroundMap(I.x0, I.z0, I.x1, I.z1, 3);
  harbour(ctx, map, rng);
  village(ctx, map, rng);
  hillPath(ctx, map, rng);
  summit(ctx, scene, map);
  woods(ctx, rng);
  const grid = groundMesh(map);
  scene.add(grid.mesh);
  // the water's view of the island's sea floor (each texel's centre on its sample)
  const dm = depthMap(grid), step = grid.S * 2;
  G.uIsleMap.value = dm.tex;
  G.uIsleRect.value.set(I.x0 - step / 2, I.z0 - step / 2, 1 / (step * dm.W), 1 / (step * dm.D));
  ctx.island = grid.mesh;
  return grid.mesh;
}
