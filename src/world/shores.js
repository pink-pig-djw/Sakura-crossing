import * as THREE from 'three';
import { PAT, MeshBuilder } from '../core/builder.js';
import { RNG, fbm2, noise2, smoothstep, clamp } from '../core/rng.js';
import { groundH, terrainH, HOLES, PROM, SEAWALL_Z } from './layout.js';
import { route, roadDist, cutSlopeAt, BORE, CAPE, MIKAN, HARBOR, PADS, mikanTerrace, mikanMask } from './routeplan.js';
import { activeFoliage } from './greenery.js';
import { boat, tetrapod, benchAt } from './coast.js';
import { FONTS } from '../render/atlas.js';

// The ends of the cycling loop: the bamboo grove and the hand-dug tunnel down the west
// headland, the lighthouse on the cape, the mikan terraces and the fishing harbour under the
// east headland, the pines along the east beach, and the cycle station at the river mouth.

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const legById = (id) => route().legs.find((l) => l.id === id);
const leftOf = (o) => [o.tz, -o.tx];
const padById = (id) => PADS.find((p) => p.id === id);

// ---------------------------------------------------------------------------
// 竹林: tall culms leaning in over the road from both sides, light falling through
// ---------------------------------------------------------------------------
function culmGeometry(variant) {
  const rng = new RNG(900 + variant);
  const b = new MeshBuilder();
  const H = 12, r0 = 0.065;
  const pts = [], radii = [], colors = [];
  const bend = 1.4 + variant * 0.5;
  const green = new THREE.Color('#7f9a4a'), node = new THREE.Color('#5f7a38'), pale = new THREE.Color('#a4b06a');
  for (let i = 0; i <= 14; i++) {
    const t = i / 14;
    // bowing out toward +x, more and more toward the top
    pts.push(V(bend * t * t * t + rng.range(-0.02, 0.02), H * t, 0));
    radii.push(r0 * (1 - t * 0.55));
    colors.push(i % 2 === 0 ? node : t < 0.25 ? pale : green);
  }
  b.tube(pts, radii, 5, 0x7f9a4a, PAT.NONE, { colors });
  return { geo: b.toGeometry(), top: pts[pts.length - 1], mid: pts[10] };
}

function bambooGrove(ctx, scene) {
  const rng = new RNG(4545);
  const variants = [0, 1, 2].map(culmGeometry);
  const legs = [legById('take'), legById('zuido')];
  const items = [[], [], []];
  const fb = activeFoliage();
  const leafCols = ['#8fae5a', '#7c9e4c', '#9fbc66', '#6f9446'].map((h) => new THREE.Color(h));
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
  let n = 0;
  for (const leg of legs) {
    for (const o of leg.samples) {
      if (leg.id === 'zuido' && o.z > BORE.z0 - 3) break;
      for (const side of [1, -1]) {
        const [lx, lz] = leftOf(o);
        const k = rng.int(1, 3);
        for (let c = 0; c < k; c++) {
          const d = 5.0 + Math.pow(rng.next(), 1.6) * 18;
          if (rng.next() > 1.25 - d / 22) continue;
          const x = o.x + lx * d * side + rng.range(-0.5, 0.5), z = o.z + lz * d * side + rng.range(-0.5, 0.5);
          if (roadDist(x, z) < 4.7) continue;
          const y = groundH(x, z);
          const v = rng.int(0, 2);
          // lean in over the road (local +x toward it), the nearer the more
          const toward = Math.atan2(-lz * side, -lx * side);
          const ry = -toward + rng.range(-0.35, 0.35);
          const s = rng.range(0.75, 1.12) * (d < 9 ? 1 : 0.92);
          q.setFromAxisAngle(V(0, 1, 0), ry);
          sc.set(s, s, s);
          p.set(x, y - 0.2, z);
          m4.compose(p, q, sc);
          items[v].push(m4.clone());
          // a crown of leaf sprays near the top, out over the bowed tip
          if (fb) {
            const tip = variants[v].top.clone().multiplyScalar(s).applyQuaternion(q).add(p);
            const mid = variants[v].mid.clone().multiplyScalar(s).applyQuaternion(q).add(p);
            for (let i = 0; i < 5; i++) {
              const t = rng.range(0, 1);
              const cpos = mid.clone().lerp(tip, t).add(V(rng.range(-0.9, 0.9), rng.range(-0.6, 0.4), rng.range(-0.9, 0.9)));
              fb.get('bamboo', cpos.x, cpos.z).card4(cpos, V(0, 0.4, 0).add(cpos.clone().sub(mid).normalize()).normalize(), leafCols[i % 4], mid, rng.range(0.9, 1.3), rng.range(-0.5, 0.5));
            }
          }
          ctx.colliders.addCircle(x, z, 0.12);
          n++;
        }
      }
    }
  }
  // instanced in pieces along the road, so the ones out of view are skipped
  for (let v = 0; v < 3; v++) {
    const list = items[v];
    for (let i0 = 0; i0 < list.length; i0 += 120) {
      const part = list.slice(i0, i0 + 120);
      const im = new THREE.InstancedMesh(variants[v].geo, ctx.materials.toon.material, part.length);
      part.forEach((m, i) => im.setMatrixAt(i, m));
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
      im.castShadow = true;
      im.receiveShadow = true;
      im.name = 'bamboo';
      scene.add(im);
    }
  }
  // leaf litter on the ground, the first shoots (筍) poking up
  ctx.ground.paint(-305, -175, -170, 4, (x, z) => {
    const d = roadDist(x, z);
    if (d < 4.6 || d > 24 || x > -176) return null;
    // dry leaves in drifts, moss and low green between
    const n = noise2(x * 0.45, z * 0.45) + (noise2(x * 1.7, z * 1.7) - 0.5) * 0.25;
    return [n > 0.6 ? 0x9a8f60 : n > 0.42 ? 0x8a8652 : 0x6e7c46, PAT.DIRT, 0.12];
  });
  const b0 = ctx.builders.get('toon', -240, -100);
  for (let i = 0; i < 40; i++) {
    const o = legById('take').samples[rng.int(5, legById('take').samples.length - 5)];
    const [lx, lz] = leftOf(o);
    const side = rng.sign(), d = rng.range(5.2, 10);
    const x = o.x + lx * d * side, z = o.z + lz * d * side;
    const y = groundH(x, z);
    ctx.builders.get('toon', x, z).cyl(x, y - 0.05, z, 0.09, 0.0, rng.range(0.25, 0.45), 6, 0x8a6a3a, PAT.BARK);
  }
  void b0;
  return n;
}

// ---------------------------------------------------------------------------
// 素掘りトンネル: rough rock mouths, a damp bore lit by a few caged lamps
// ---------------------------------------------------------------------------
function tunnel(ctx) {
  const leg = legById('zuido');
  const yAt = (z) => {
    let best = leg.samples[0];
    for (const o of leg.samples) if (Math.abs(o.z - z) < Math.abs(best.z - z)) best = o;
    return best.y;
  };
  const x0 = BORE.x - BORE.w / 2, x1 = BORE.x + BORE.w / 2;
  const rng = new RNG(3030);
  // holes in the ground mesh at both mouths (on its 2 m grid)
  HOLES.push({ x0: BORE.x - 2, x1: BORE.x + 2, z0: BORE.z0 - 1, z1: BORE.z0 + 1 });
  HOLES.push({ x0: BORE.x - 2, x1: BORE.x + 2, z0: BORE.z1 - 1, z1: BORE.z1 + 1 });
  const rock = 0x4c4640, rockDk = 0x3a3531, floor = 0x403e3a;
  // the bore: walls, an arched roof of a few facets, the floor (all facing in)
  for (let z = BORE.z0; z < BORE.z1; z += 2) {
    const za = z, zb = Math.min(BORE.z1, z + 2);
    const ya = yAt(za), yb = yAt(zb);
    const b = ctx.builders.get('interior', BORE.x, z);
    const ring = (y, zz) => {
      const pts = [];
      for (let i = 0; i <= 8; i++) {
        const a = Math.PI * (i / 8);
        const wob = (noise2(i * 1.7, zz * 0.9) - 0.5) * 0.35;
        const rx = BORE.w / 2 + wob, ry = 1.6 + wob * 0.5;
        pts.push(V(BORE.x + Math.cos(a) * rx, y + (BORE.h - 1.6) + Math.sin(a) * ry, zz));
      }
      // straight walls under the arch down to the floor
      return [V(BORE.x + BORE.w / 2, y - 0.05, zz), ...pts, V(BORE.x - BORE.w / 2, y - 0.05, zz)];
    };
    const A = ring(ya, za), B = ring(yb, zb);
    const ctr = V(BORE.x, (ya + yb) / 2 + 2, (za + zb) / 2);
    for (let i = 0; i < A.length - 1; i++) {
      // facing the bore's centre line
      const a = A[i], c = A[i + 1], d = B[i + 1], e = B[i];
      const nrm = new THREE.Vector3().subVectors(c, a).cross(new THREE.Vector3().subVectors(e, a));
      const mid = a.clone().add(c).add(d).add(e).multiplyScalar(0.25);
      const col = i > 2 && i < A.length - 3 ? rockDk : rock;
      if (nrm.dot(new THREE.Vector3().subVectors(ctr, mid)) > 0) b.quad(a, c, d, e, col, PAT.ROCK);
      else b.quad(a, e, d, c, col, PAT.ROCK);
    }
    b.quad(V(x1, ya + 0.003, za), V(x0, ya + 0.003, za), V(x0, yb + 0.003, zb), V(x1, yb + 0.003, zb), floor, PAT.CONCRETE);
  }
  // caged lamps on the west wall, their light pooled on the floor
  for (let z = BORE.z0 + 6; z < BORE.z1 - 3; z += 9) {
    const y = yAt(z);
    const b = ctx.builders.get('interior', BORE.x, z);
    b.box(x0 + 0.12, y + 2.9, z, 0.16, 0.26, 0.2, { color: 0x3a3632 });
    ctx.builders.get('emissive', BORE.x, z).box(x0 + 0.2, y + 2.85, z, 0.1, 0.16, 0.14, { color: 0xffc070 });
    ctx.lamps.push({ x: BORE.x - 0.4, y: y + 2.8, z, r: 3.6, color: 0xffb860, floor: y, clip: { x0: x0 + 0.05, x1: x1 - 0.05, z0: BORE.z0, z1: BORE.z1 } });
  }
  // the mouths: the hill's rock round the hole, the arch picked out by its stones, a pile of
  // weathered boulders and moss filling the face above
  for (const [zm, dir] of [[BORE.z0, -1], [BORE.z1, 1]]) {
    const y = yAt(zm);
    const b = ctx.builders.get('toon', BORE.x, zm);
    // the rock face the cutting ends against: over the arch, and on up its sides as far as the
    // hill behind stands above the slope in front (it hides the ground mesh's steep row there)
    const fz = zm + dir * 0.3, back = zm - dir * 0.6;
    const outY = (x) => groundH(x, zm + dir * 1.0) - 0.35, inY = (x) => groundH(x, zm - dir * 1.0) + 0.3;
    let top = -Infinity;
    for (let dx = -2.2; dx <= 2.2; dx += 0.55) top = Math.max(top, inY(BORE.x + dx));
    const face = { color: 0x625c52, pattern: PAT.ROCK };
    b.boxMM(BORE.x - 2.2, y - 0.4, zm - 0.3, x0, top, zm + 0.3, face);
    b.boxMM(x1, y - 0.4, zm - 0.3, BORE.x + 2.2, top, zm + 0.3, face);
    b.boxMM(x0, y + BORE.h - 0.2, zm - 0.3, x1, top, zm + 0.3, face);
    for (const side of [-1, 1]) {
      let prev = null;
      for (let lx = 2.1; lx <= 27; lx += 0.75) {
        const x = BORE.x + side * lx;
        const lo = outY(x), hi = Math.max(inY(x), lo + 0.05);
        // (only across the cutting: beyond its top edge the ground in front is the hillside's own)
        if (lo + 0.35 < cutSlopeAt(y, lx, leg.w) - 0.6) break;
        const cur = { x, lo, hi };
        if (prev) {
          // front (facing out of the hill) and the top lip back into it
          const [l, r] = (side > 0) === (dir > 0) ? [prev, cur] : [cur, prev];
          b.quad(V(l.x, l.lo, fz), V(r.x, r.lo, fz), V(r.x, r.hi, fz), V(l.x, l.hi, fz), 0x625c52, PAT.ROCK);
          b.quad(V(l.x, l.hi, fz), V(r.x, r.hi, fz), V(r.x, r.hi - 0.1, back), V(l.x, l.hi - 0.1, back), 0x5f7046, PAT.ROCK);
          // fallen stones at its foot, moss and the odd stone along its top
          if (rng.chance(0.5)) boulder(b, x, lo + 0.35, zm + dir * rng.range(0.5, 1.1), rng.range(0.3, 0.6), rng, rng.pick([0x6f675c, 0x7a7266, 0x655e55]));
          if (hi - lo > 1.2 && rng.chance(0.35)) boulder(b, x, hi - 0.15, zm + dir * rng.range(-0.1, 0.3), rng.range(0.35, 0.7), rng, rng.pick([0x5f7046, 0x56683f]));
        }
        prev = cur;
        if (hi - lo < 0.25) break;
      }
    }
    for (let i = 0; i < 14; i++) {
      const a = Math.PI * (i / 13);
      const bx = BORE.x + Math.cos(a) * (BORE.w / 2 + 0.3), by = y + (BORE.h - 1.6) + Math.sin(a) * 1.9;
      boulder(b, bx, by, zm + dir * 0.4, rng.range(0.34, 0.5), rng, 0x6f675c);
    }
    // the tunnel's name cut in a stone tablet over the arch
    const py = y + BORE.h + 1.0, pz = zm + dir * 0.36;
    b.box(BORE.x, py, pz, 1.5, 0.62, 0.12, { color: 0x8c877c, pattern: PAT.CONCRETE });
    const plaque = ctx.atlas2.draw('tunnel-plaque', 192, 72, (c, w, h) => {
      c.fillStyle = '#9a958a';
      c.fillRect(0, 0, w, h);
      c.strokeStyle = '#6f6a60';
      c.lineWidth = 4;
      c.strokeRect(5, 5, w - 10, h - 10);
      c.fillStyle = '#2e2b27';
      c.font = `700 40px ${FONTS.mincho}`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('竹浦隧道', w / 2, h / 2 + 2);
    });
    const qz = zm + dir * 0.435, e = dir > 0 ? 1 : -1;
    ctx.builders.get('sign2', BORE.x, zm).quad(V(BORE.x - 0.68 * e, py - 0.26, qz), V(BORE.x + 0.68 * e, py - 0.26, qz), V(BORE.x + 0.68 * e, py + 0.26, qz), V(BORE.x - 0.68 * e, py + 0.26, qz), 0xffffff, 0.15, { uvs: [[plaque.u0, plaque.v0], [plaque.u1, plaque.v0], [plaque.u1, plaque.v1], [plaque.u0, plaque.v1]] });
    // stones of all sizes over the face and down its edges, mossy towards the top
    for (let i = 0; i < 30; i++) {
      const edge = i < 10;
      const bx = edge ? BORE.x + (i % 2 ? 1 : -1) * rng.range(1.9, 2.6) : BORE.x + rng.range(-2.4, 2.4);
      const by = rng.range(y - 0.2, top - 0.1);
      const inArch = Math.abs(bx - BORE.x) < BORE.w / 2 + 0.2 && by < y + BORE.h + 0.3;
      if (inArch || (Math.abs(bx - BORE.x) < 1.3 && Math.abs(by - py) < 0.75)) continue;
      const mossy = by > top - 1.8 || (edge && by > y + 2);
      boulder(b, bx, by, zm + dir * rng.range(0.2, 0.7), rng.range(0.4, 0.85), rng, mossy ? rng.pick([0x5f7046, 0x56683f]) : rng.pick([0x6f675c, 0x7a7266, 0x655e55]));
    }
  }
  // bare rock round both mouths
  ctx.ground.paint(BORE.x - 12, BORE.z0 - 6, BORE.x + 12, BORE.z1 + 6, (x, z) => {
    const near = Math.min(Math.abs(z - BORE.z0), Math.abs(z - BORE.z1));
    return near < 5 && roadDist(x, z) > 2.2 ? [noise2(x * 0.5, z * 0.5) > 0.5 ? 0x6f675c : 0x5f6a4a, PAT.ROCK, 0.12] : null;
  });
  ctx.landmarks.push({ id: 'tunnel', x: BORE.x, z: (BORE.z0 + BORE.z1) / 2 });
}

const _ico = new THREE.IcosahedronGeometry(1, 0);
function boulder(b, x, y, z, r, rng, color = 0x857e72) {
  const m = new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rng.range(-0.3, 0.3), rng.range(0, 6.28), rng.range(-0.3, 0.3))), V(r * rng.range(0.9, 1.3), r * rng.range(0.6, 0.9), r * rng.range(0.8, 1.2)));
  b.geom(_ico, m, color, PAT.ROCK, { gradient: [-1, 1, 0x5a544c] });
}

// ---------------------------------------------------------------------------
// 岬の灯台: a white tower on the cape's point beside the road, its yard and benches
// facing the open sea; the light turns at night (see lighthouseBeam)
// ---------------------------------------------------------------------------
function lighthouse(ctx, scene) {
  const pad = padById('misaki');
  const [cx, cz] = pad.at;
  const y = pad.y;
  const lx = CAPE.x, lz = CAPE.z;
  const b = ctx.builders.get('toon', lx, lz);
  const white = 0xf7f6f0;
  // octagonal tower, tapering, a gallery near the top, the lantern room and its dome
  b.cyl(lx, y - 0.4, lz, 2.6, 2.6, 0.9, 8, 0xd8d4ca, PAT.CONCRETE);
  b.cyl(lx, y + 0.5, lz, 2.1, 1.55, 11.5, 8, white, PAT.NONE, { ao: 0.08 });
  const gy = y + 12;
  // (the gallery and the lantern's roof overhang: closed underneath, seen from below)
  b.cyl(lx, gy, lz, 2.3, 2.3, 0.22, 16, 0xe8e6e0, 0, { bottomCap: true });
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    b.detail.box(lx + Math.cos(a) * 2.2, gy + 0.55, lz + Math.sin(a) * 2.2, 0.05, 0.9, 0.05, { color: 0x3a4248 });
  }
  b.detail.cyl(lx, gy + 1.0, lz, 2.22, 2.22, 0.06, 20, 0x3a4248, 0, { caps: false });
  b.cyl(lx, gy + 0.22, lz, 1.3, 1.3, 0.5, 12, 0x3a4248);
  ctx.builders.get('window', lx, lz).cyl(lx, gy + 0.7, lz, 1.15, 1.15, 1.6, 12, 0xffffff, 200, { caps: false });
  b.cyl(lx, gy + 2.3, lz, 1.35, 0.25, 1.1, 12, 0x2f3a42, 0, { bottomCap: true });
  b.cyl(lx, gy + 3.35, lz, 0.08, 0.02, 0.7, 5, 0x2f3a42);
  // the lamp itself, warm white, glowing at night
  ctx.builders.get('emissive', lx, lz).cyl(lx, gy + 1.1, lz, 0.45, 0.45, 0.8, 10, 0xfff4d8);
  // a small door and windows up the tower
  b.box(lx, y + 1.1, lz + 1.95, 0.9, 1.9, 0.12, { color: 0x3f6a8a });
  for (const yy of [y + 4.5, y + 8]) ctx.builders.get('window', lx, lz).quad(V(lx - 0.2, yy, lz + 1.83), V(lx + 0.2, yy, lz + 1.83), V(lx + 0.2, yy + 0.6, lz + 1.75), V(lx - 0.2, yy + 0.6, lz + 1.75), 0xffffff, 222, { uvs: [[0, 0], [1, 0], [1, 1], [0, 1]] });
  ctx.colliders.addCircle(lx, lz, 2.2);
  // the keeper's store with a red roof, benches looking out to sea
  const hx = cx - 4.4, hz = cz - 2.6;
  b.box(hx, y + 1.2, hz, 3.4, 2.4, 2.6, { color: 0xf0eee6, ao: 0.15 });
  b.box(hx, y + 2.55, hz, 3.9, 0.3, 3.1, { color: 0xc0392b });
  ctx.colliders.addBox(hx, hz, 1.7, 1.3);
  for (const [bx, bz] of [[cx + 2.6, cz + 4.6], [cx + 5.4, cz + 2.4]]) benchAt(ctx, b, bx, y, bz, Math.PI, 0x8a6a4a, '海を眺めるベンチに座る');
  ctx.ground.circle(cx, cz, pad.r - 0.2, 0xb8b0a0, PAT.GRAVEL);
  ctx.lighthouseCape = { x: lx, y: gy + 1.5, z: lz };
  lighthouseBeam(ctx, scene, lx, gy + 1.5, lz);
}

// two broad shafts of light sweeping round from the lantern at night
export function lighthouseBeam(ctx, scene, x, y, z) {
  const L = 130;
  const geo = new THREE.BufferGeometry();
  const pos = [], uv = [];
  for (const dir of [1, -1]) {
    // a flattened cone: a fan of thin triangles fading out along the shaft
    const n = 10;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n - 0.5) * 0.09, a1 = ((i + 1) / n - 0.5) * 0.09;
      pos.push(0, 0, 0, dir * L * Math.cos(a0), L * Math.sin(a0) * 0.35 - 2, dir * L * Math.sin(a0), dir * L * Math.cos(a1), L * Math.sin(a1) * 0.35 - 2, dir * L * Math.sin(a1));
      uv.push(0, 0.5, 1, i / n, 1, (i + 1) / n);
    }
  }
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: { uNight: ctx.materials.toon.material.uniforms.uNight },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      uniform float uNight;
      varying vec2 vUv;
      void main() {
        float along = vUv.x;
        float across = 1.0 - abs(vUv.y - 0.5) * 2.0;
        float a = (1.0 - along) * (1.0 - along) * smoothstep(0.0, 0.6, across) * smoothstep(0.0, 0.04, along);
        gl_FragColor = vec4(vec3(1.0, 0.95, 0.82) * a * 0.32 * smoothstep(0.35, 0.8, uNight), 1.0);
      }
    `,
  });
  const beam = new THREE.Mesh(geo, mat);
  beam.position.set(x, y, z);
  beam.frustumCulled = false;
  beam.renderOrder = 6;
  beam.name = 'lighthouse-beam';
  scene.add(beam);
  ctx.updaters.push((t) => {
    beam.rotation.y = t * 0.55;
    beam.visible = mat.uniforms.uNight.value > 0.3;
  });
}

// ---------------------------------------------------------------------------
// みかんの段々畑: stone-walled terraces, the orange trees on them, a monorail up the slope
// and an honesty stand at the rest stop
// ---------------------------------------------------------------------------
function mikanTerraces(ctx) {
  const rng = new RNG(6161);
  const M = MIKAN;
  const step = M.step;
  const h = 0.8;
  const nx = Math.ceil((M.x1 - M.x0) / h), nz = Math.ceil((M.z1 - M.z0) / h);
  const val = (x, z) => {
    const t = mikanTerrace(x, z);
    return { y: t.level + (t.cont - t.level), m: mikanMask(x, z) > 0.92 && roadDist(x, z) > 4.8 ? 1 : 0 };
  };
  // stone walls along each riser (marching triangles on the face's smooth shape)
  const grid = [];
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) grid.push(val(M.x0 + i * h, M.z0 + j * h));
  const at = (i, j) => ({ x: M.x0 + i * h, z: M.z0 + j * h, ...grid[j * (nx + 1) + i] });
  let walls = 0;
  const seg = (A, B, C) => {
    const lo = Math.floor(Math.min(A.y, B.y, C.y) - 0.93), hi = Math.floor(Math.max(A.y, B.y, C.y));
    if (A.m + B.m + C.m < 3) return;
    for (let k = lo; k <= hi; k++) {
      const thr = k + 0.93;
      const pts = [];
      for (const [a, b] of [[A, B], [B, C], [C, A]]) {
        const da = a.y - thr, db = b.y - thr;
        if (da >= 0 !== db >= 0) {
          const t = da / (da - db);
          pts.push([a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t]);
        }
      }
      if (pts.length !== 2) continue;
      const [[ax, az], [bx, bz]] = pts;
      if (Math.hypot(bx - ax, bz - az) < 0.05) continue;
      // only where the ground stands against it (by the road its cutting or embankment has
      // reshaped the slope: a wall there would hang in the air or be buried)
      const lo = step * k - 0.45, hi = step * (k + 1) + 0.05;
      if ([[ax, az], [bx, bz], [(ax + bx) / 2, (az + bz) / 2]].some(([x, z]) => {
        const g = groundH(x, z);
        return g < lo || g > hi;
      })) continue;
      // (as high as the ground it holds: where the terraces give way to the natural slope the
      // bench above is lower, and a full-height wall stood up out of it like a pillar)
      const sl = Math.hypot(bx - ax, bz - az), qx = -(bz - az) / sl, qz = (bx - ax) / sl;
      const held = Math.max(...[0, 0.5, 1].flatMap((t) => [1, -1].map((e) => groundH(ax + (bx - ax) * t + qx * e * 0.8, az + (bz - az) * t + qz * e * 0.8))));
      const wTop = Math.min(step * (k + 1) + 0.12, held + 0.12);
      if (wTop - step * k < 0.35) continue;
      const bb = ctx.builders.get('toon', ax, az);
      bb.wall(ax, az, bx, bz, step * k - 0.5, wTop, 0.55, { color: noise2(ax * 0.3, az * 0.3) > 0.5 ? 0x9a9284 : 0x8c8478, pattern: PAT.STONE });
      walls++;
    }
  };
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const a = at(i, j), b = at(i + 1, j), c = at(i + 1, j + 1), d = at(i, j + 1);
    seg(a, b, c);
    seg(a, c, d);
  }
  // orange trees in rows along the benches
  let trees = 0;
  for (let z = M.z0 + 6; z < M.z1 - 4; z += 2.9) {
    for (let x = M.x0 + 6; x < M.x1 - 8; x += 3.3) {
      const px = x + rng.range(-0.5, 0.5), pz = z + rng.range(-0.5, 0.5);
      if (mikanMask(px, pz) < 0.9 || roadDist(px, pz) < 5.6) continue;
      const t = mikanTerrace(px, pz);
      const f = t.cont - t.level;
      if (f < 0.18 || f > 0.66) continue;
      if (Math.abs(px - 600) < 2.2) continue; // (the monorail)
      ctx.trees.push({ kind: 'mikan', x: px, z: pz, seed: rng.int(1, 1e9), scale: rng.range(0.9, 1.1), y: groundH(px, pz) });
      trees++;
    }
  }
  // the monorail (モノラック) straight up the slope, a little cart on it
  const mx = 600;
  const rail = [];
  for (let z = M.z1 - 6; z > M.z0 + 8; z -= 1) {
    if (roadDist(mx, z) < 4.6) {
      rail.push(null);
      continue;
    }
    let y = -1e9;
    for (const dz of [-1, 0, 1]) y = Math.max(y, groundH(mx, z + dz));
    rail.push({ z, y: y + 0.5 });
  }
  let cart = false;
  for (let i = 0; i < rail.length - 1; i++) {
    const a = rail[i], c = rail[i + 1];
    if (!a || !c) continue;
    const b = ctx.builders.get('toon', mx, a.z);
    b.rod(V(mx, a.y, a.z), V(mx, c.y, c.z), 0.045, 0.045, 4, 0x9aa0a4);
    if (i % 2 === 0) b.cyl(mx, a.y - 0.8, a.z, 0.03, 0.03, 0.8, 4, 0x8a9094);
    if (!cart && i > 22) {
      b.box(mx, a.y + 0.35, a.z, 0.8, 0.5, 1.2, { color: 0xe8b830 });
      b.box(mx, a.y + 0.72, a.z + 0.2, 0.75, 0.3, 0.7, { color: 0xf08a2a });
      cart = true;
    }
  }
  // the honesty stand (無人販売所) at the rest stop
  const pad = padById('mikan');
  if (pad && pad.y !== undefined) {
    const [cx, cz] = pad.at;
    const away = pad.away ?? 0;
    const sx = cx + Math.cos(away) * 1.6, sz = cz + Math.sin(away) * 1.6;
    const ry = Math.atan2(Math.cos(away), Math.sin(away));
    const b = ctx.builders.get('toon', sx, sz);
    b.pushTRS(sx, pad.y, sz, ry);
    b.box(0, 0.45, 0, 2.2, 0.9, 0.9, { color: 0x8a6a48, pattern: PAT.BOARDS });
    for (const e of [-1, 1]) b.box(e * 1.05, 1.15, 0.3, 0.08, 2.3, 0.08, { color: 0x6a4e36 });
    b.box(0, 2.3, 0.1, 2.5, 0.08, 1.4, { color: 0x5a6a4a, pattern: PAT.CORRUGATED });
    for (let i = 0; i < 4; i++) {
      b.box(-0.75 + i * 0.5, 1.02, -0.1, 0.36, 0.22, 0.3, { color: 0xffffff });
      b.geom(new THREE.SphereGeometry(0.14, 8, 6), new THREE.Matrix4().makeTranslation(-0.75 + i * 0.5, 1.2, -0.1), 0xf39424);
    }
    b.box(0.8, 1.6, 0.36, 0.6, 0.4, 0.04, { color: 0xf6efe0 });
    b.pop();
    ctx.colliders.addBox(sx, sz, 1.15, 0.5, ry, pad.y + 1);
  }
  return { walls, trees };
}

// ---------------------------------------------------------------------------
// 漁港: quay walls with bollards, a breakwater with tetrapods and a red beacon, boats
// afloat, the fishermen's shed with nets and fish boxes
// ---------------------------------------------------------------------------
function harbor(ctx) {
  const H = HARBOR;
  const rng = new RNG(7272);
  const qz = H.quay;
  const conc = { color: 0xc4c0b6, pattern: PAT.CONCRETE, ao: 0.2 };
  // the quay wall along the basin, coping on top, bollards and tyre fenders
  // (the coping and the low wall on it open where the stairs go down to the boat landing:
  // world/pier.js)
  const SG = [495.0, 497.0];
  for (let x = H.x0 + 2; x < H.x1 - 2; x += 6) {
    const x1 = Math.min(H.x1 - 2, x + 6);
    const b = ctx.builders.get('toon', x, qz);
    b.boxMM(x, H.basin - 0.6, qz - 0.2, x1, H.y + 0.02, qz + 0.6, conc);
    for (const [a, c] of [[x, Math.min(x1, SG[0])], [Math.max(x, SG[1]), x1]]) if (c - a > 0.01) b.boxMM(a, H.y, qz + 0.2, c, H.y + 0.18, qz + 0.75, { color: 0xd4d0c6, pattern: PAT.CONCRETE });
  }
  for (const [a, c] of [[H.x0 + 2, SG[0]], [SG[1], H.x1 - 2]]) ctx.colliders.addBox((a + c) / 2, qz + 0.5, (c - a) / 2, 0.28, 0, H.y + 0.35);
  const bollards = [];
  for (let x = H.x0 + 6; x < H.x1 - 4; x += 8) {
    const b = ctx.builders.get('toon', x, qz);
    b.cyl(x, H.y, qz + 0.2, 0.2, 0.17, 0.5, 10, 0x2f3438, PAT.METAL);
    b.cyl(x, H.y + 0.5, qz + 0.2, 0.26, 0.26, 0.08, 10, 0x2f3438, PAT.METAL);
    b.pushTRS(x + 1.8, H.y - 0.6, qz + 0.85, 0);
    b.geom(new THREE.TorusGeometry(0.42, 0.14, 6, 12), new THREE.Matrix4().makeRotationX(0.15), 0x262628);
    b.pop();
    ctx.colliders.addCircle(x, qz + 0.2, 0.25, H.y + 0.6);
    bollards.push(x);
  }
  // breakwater across the mouth, tetrapods on the sea side, a red beacon at its end
  const bz = H.z1 + 2, bx0 = 516, bx1 = H.x1 + 4, top = 2.8;
  for (let x = bx0; x < bx1; x += 8) {
    const x1 = Math.min(bx1, x + 8);
    const b = ctx.builders.get('toon', x, bz);
    b.boxMM(x, -3.2, bz - 2.2, x1, top, bz + 2.2, conc);
    b.boxMM(x, top, bz + 1.6, x1, top + 1.0, bz + 2.2, { color: 0xd0ccc2, pattern: PAT.CONCRETE });
    for (let k = 0; k < 3; k++) {
      const tx = x + rng.range(0, 8), off = rng.range(0.8, 3.2);
      tetrapod(b, tx, Math.max(terrainH(tx, bz + 2.2 + off), 1.0 - off * 0.5), bz + 2.2 + off, rng.range(1.1, 1.5), rng, ctx.colliders);
    }
  }
  const tb = ctx.builders.get('toon', bx0, bz);
  tb.cyl(bx0 + 1.5, top, bz, 0.9, 0.7, 5.5, 10, 0xd23a2a);
  tb.cyl(bx0 + 1.5, top + 5.5, bz, 0.95, 0.95, 0.12, 10, 0xe8e6e0);
  ctx.builders.get('emissive', bx0, bz).cyl(bx0 + 1.5, top + 5.62, bz, 0.35, 0.3, 0.5, 8, 0xff5a3a);
  ctx.colliders.addBox((bx0 + bx1) / 2, bz, (bx1 - bx0) / 2, 2.2, 0, top + 1);
  // boats afloat in the basin, moored to the bollards
  for (let i = 0; i < 6; i++) {
    const x = H.x0 + 10 + i * 10.5 + rng.range(-1, 1);
    const z = qz + 4.2 + rng.range(-0.3, 0.6);
    if (i === 0) continue; // (the boat landing: world/pier.js)
    boat(ctx, x, z, Math.PI / 2 + rng.range(-0.1, 0.1), rng, { float: 0.05 });
    const bo = bollards.reduce((p, c) => (Math.abs(c - x) < Math.abs(p - x) ? c : p), bollards[0]);
    ctx.builders.get('toon', x, z).detail.tube([V(bo, H.y + 0.45, qz + 0.2), V((bo + x) / 2, H.y - 0.3, qz + 1.8), V(x, 1.0, z - 1.6)], 0.025, 4, 0xd8cfa8);
  }
  // the fishermen's shed (番屋), nets and fish boxes on the quay
  const sx = 548, sz = 77;
  const b = ctx.builders.get('toon', sx, sz);
  b.boxMM(sx - 6, H.y - 0.3, sz - 3, sx + 6, H.y + 3.0, sz + 3, { color: 0x8a7a68, pattern: PAT.BOARDS, ao: 0.2 });
  b.boxMM(sx - 6.4, H.y + 3.0, sz - 3.6, sx + 6.4, H.y + 3.2, sz + 3.6, { color: 0x6f7a80, pattern: PAT.CORRUGATED });
  b.box(sx - 2, H.y + 1.2, sz + 3.02, 2.6, 2.4, 0.05, { color: 0x3a3632 });
  ctx.colliders.addBox(sx, sz, 6, 3);
  for (let i = 0; i < 9; i++) {
    const x = 520 + rng.range(0, 20), z = 92 + rng.range(-3, 6);
    if (roadDist(x, z) < 3) continue;
    const k = rng.int(1, 4);
    for (let j = 0; j < k; j++) b.box(x, H.y + 0.18 + j * 0.34, z, 0.7, 0.32, 0.5, { color: rng.pick([0x2f6fb0, 0xe0782a, 0x3a9a6a, 0xe8e2d0]), ry: rng.range(-0.2, 0.2) });
    ctx.colliders.addBox(x, z, 0.4, 0.3, 0, H.y + 0.4 + k * 0.34);
  }
  for (let i = 0; i < 3; i++) {
    const x = 532 + i * 3.4, z = 97;
    b.geom(new THREE.SphereGeometry(1, 8, 5), new THREE.Matrix4().compose(V(x, H.y + 0.15, z), new THREE.Quaternion(), V(1.2, 0.45, 0.9)), rng.pick([0x3f6a4a, 0x2f5a6a]), PAT.LATTICE);
    for (let k = 0; k < 4; k++) b.geom(new THREE.SphereGeometry(0.16, 8, 6), new THREE.Matrix4().makeTranslation(x + rng.range(-0.8, 0.8), H.y + 0.45, z + rng.range(-0.4, 0.4)), 0xf07a2a);
  }
  // a sodium lamp over the quay
  const lx = 524, lz = 99;
  b.cyl(lx, H.y, lz, 0.09, 0.07, 6.4, 8, 0x8a9094);
  b.rod(V(lx, H.y + 6.3, lz), V(lx, H.y + 6.4, lz + 1.0), 0.05, 0.05, 5, 0x8a9094);
  ctx.builders.get('emissive', lx, lz).box(lx, H.y + 6.28, lz + 1.1, 0.3, 0.08, 0.5, { color: 0xffcf80 });
  ctx.lamps.push({ x: lx, y: H.y + 6.2, z: lz + 1.1, r: 7, color: 0xffc070 });
  ctx.colliders.addCircle(lx, lz, 0.15);
  // the apron: worn concrete
  ctx.ground.paint(H.x0, H.z0, H.x1, H.quay + 0.5, (x, z) => (x > H.x0 + 1 ? [noise2(x * 0.2, z * 0.2) > 0.5 ? 0xb4b0a6 : 0xa8a49a, PAT.CONCRETE, 0.08] : null));
}

// ---------------------------------------------------------------------------
// the black pines (松原) along the east beach, the cycle station and the start gate
// ---------------------------------------------------------------------------
function pineGrove(ctx) {
  const rng = new RNG(8383);
  let n = 0;
  for (let x = 232; x < 484; x += rng.range(5, 9)) {
    if ([300, 330, 430].some((s) => Math.abs(s - x) < 4)) continue;
    const z = SEAWALL_Z + rng.range(3.5, 9.5);
    ctx.trees.push({ kind: 'blackpine', x, z, seed: rng.int(1, 1e9), scale: rng.range(0.85, 1.15), lean: [rng.range(-0.25, 0.25), rng.range(-0.35, -0.05)] });
    n++;
  }
  return n;
}

function station(ctx) {
  const x0 = 205, x1 = 223;
  const y = PROM.y;
  const b = ctx.builders.get('toon', 214, 70);
  // a light canopy over bike racks along the road-side edge of the promenade (the loop runs
  // along the middle of it, so everything keeps to the edges)
  const z0 = PROM.z0 + 0.15, z1 = PROM.z0 + 1.55;
  for (const x of [x0 + 1, (x0 + x1) / 2, x1 - 1]) {
    b.cyl(x, y, z1, 0.06, 0.06, 2.7, 8, 0xe8e8e2, PAT.METAL);
    ctx.colliders.addCircle(x, z1, 0.1);
  }
  b.boxMM(x0 + 0.6, y + 2.7, z0 - 0.5, x1 - 0.6, y + 2.84, z1 + 0.6, { color: 0x3f7fbf, top: 0x5a9ad8 });
  b.boxMM(x0 + 0.4, y + 2.62, z0 - 0.6, x1 - 0.4, y + 2.72, z0 - 0.45, { color: 0xe8e8e2 });
  b.boxMM(x0 + 0.4, y + 2.62, z1 + 0.5, x1 - 0.4, y + 2.72, z1 + 0.65, { color: 0xe8e8e2 });
  // (the racks stop short of the crossing at x = 218, where 桜川の道 leaves the promenade)
  const rx1 = 218 - 2.8;
  for (let x = x0 + 2; x < rx1; x += 1.1) {
    const d = b.detail;
    d.rod(V(x, y, z0 + 0.25), V(x, y + 0.75, z0 + 0.25), 0.025, 0.025, 5, 0xbfc4c8);
    d.rod(V(x, y + 0.75, z0 + 0.25), V(x, y + 0.75, z0 + 1.15), 0.025, 0.025, 5, 0xbfc4c8);
    d.rod(V(x, y + 0.75, z0 + 1.15), V(x, y, z0 + 1.15), 0.025, 0.025, 5, 0xbfc4c8);
  }
  ctx.colliders.addBox((x0 + 1.5 + rx1) / 2, z0 + 0.7, (rx1 - x0 - 1.5) / 2, 0.5, 0, y + 0.8);
  // an air pump on a post and a vending machine by the sea wall
  const zs = SEAWALL_Z - 0.75;
  b.cyl(x0 + 0.8, y, zs + 0.2, 0.07, 0.07, 1.0, 8, 0x3f7fbf);
  b.box(x0 + 0.8, y + 1.05, zs + 0.2, 0.25, 0.25, 0.18, { color: 0xe8e8e2 });
  ctx.colliders.addCircle(x0 + 0.8, zs + 0.2, 0.15);
  ctx.vending.push({ x: x1 - 1.0, z: SEAWALL_Z - 0.95, ry: Math.PI, seed: 4242, n: 1 });
  // the START / GOAL arch over the promenade
  const gx = 214;
  for (const z of [PROM.z0 + 0.25, SEAWALL_Z - 0.55]) {
    b.cyl(gx, y, z, 0.12, 0.12, 3.6, 10, 0x3f7fbf, PAT.METAL);
    ctx.colliders.addCircle(gx, z, 0.15);
  }
  b.box(gx, y + 3.55, (PROM.z0 + SEAWALL_Z) / 2 - 0.15, 0.2, 0.2, SEAWALL_Z - PROM.z0 - 0.4, { color: 0x3f7fbf });
  const uv = ctx.atlas2.draw('cycle-gate', 512, 96, (c, w, hh) => {
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, w, hh);
    c.fillStyle = '#3f7fbf';
    c.fillRect(0, 0, w, 14);
    c.fillRect(0, hh - 14, w, 14);
    c.fillStyle = '#e2708f';
    const text = 'さくら一周ライン  START / GOAL';
    c.font = '700 40px "Zen Maru Gothic", sans-serif';
    const fit = Math.min(40, Math.floor(40 * (w - 36) / c.measureText(text).width));
    c.font = `700 ${fit}px "Zen Maru Gothic", sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(text, w / 2, hh / 2 + 2);
  });
  const sb = ctx.builders.get('sign2', gx, 70);
  const zc = (PROM.z0 + SEAWALL_Z) / 2 - 0.15, half = (SEAWALL_Z - PROM.z0 - 1.0) / 2;
  for (const e of [-1, 1]) {
    const xx = gx + e * 0.12;
    const pts = e > 0 ? [V(xx, y + 2.85, zc + half), V(xx, y + 2.85, zc - half), V(xx, y + 3.45, zc - half), V(xx, y + 3.45, zc + half)] : [V(xx, y + 2.85, zc - half), V(xx, y + 2.85, zc + half), V(xx, y + 3.45, zc + half), V(xx, y + 3.45, zc - half)];
    sb.quad(pts[0], pts[1], pts[2], pts[3], 0xffffff, 0.6, { uvs: e > 0 ? [[uv.u0, uv.v0], [uv.u1, uv.v0], [uv.u1, uv.v1], [uv.u0, uv.v1]] : [[uv.u0, uv.v0], [uv.u1, uv.v0], [uv.u1, uv.v1], [uv.u0, uv.v1]] });
  }
  ctx.cycleGate = { x: gx, z0: PROM.z0, z1: SEAWALL_Z };
  ctx.lamps.push({ x: 214, y: y + 2.6, z: z0 + 1.0, r: 5, color: 0xfff0d0 });
  ctx.landmarks.push({ id: 'cycle-station', x: 214, z: 70.75 });
}

export function buildShores(ctx, scene) {
  const out = {};
  out.bamboo = bambooGrove(ctx, scene);
  tunnel(ctx);
  lighthouse(ctx, scene);
  out.mikan = mikanTerraces(ctx);
  harbor(ctx);
  out.pines = pineGrove(ctx);
  station(ctx);
  return out;
}

void fbm2;
void smoothstep;
void clamp;
