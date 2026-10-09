import * as THREE from 'three';
import { RNG, noise2 } from '../core/rng.js';
import { PAT, MeshBuilder } from '../core/builder.js';
import { terrainH, shoreZ, beachH, SEAWALL_Z, PROM, COAST, BEACH_STAIRS, BREAKWATER, SHORE, RIVER } from './layout.js';
import { G } from '../render/materials.js';
import { NOISE } from '../render/glsl.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ---------------------------------------------------------------------------
// Sea
// ---------------------------------------------------------------------------
export function createWater() {
  const geo = new THREE.PlaneGeometry(9000, 6000, 1, 1);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, 0, 3000 + 70);
  const mat = new THREE.ShaderMaterial({
    name: 'water',
    transparent: true,
    depthWrite: true,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.SrcAlphaFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.ZeroFactor,
    blendDstAlpha: THREE.ZeroFactor,
    uniforms: {
      uTime: G.uTime,
      uTide: G.uTide,
      uSunDir: G.uSunDir,
      uSunColor: G.uSunColor,
      uHorizon: G.uHorizon,
      uZenith: G.uZenith,
      uHazeColor: G.uHazeColor,
      uSunGlow: G.uSunGlow,
      uHazeDensity: G.uHazeDensity,
      uWaterDeep: G.uWaterDeep,
      uWaterShallow: G.uWaterShallow,
      uNight: G.uNight,
      uMoonDir: G.uMoonDir,
      uSkyAmb: G.uSkyAmb,
    },
    vertexShader: /* glsl */ `
      uniform float uTide;
      varying vec3 vWorldPos;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        wp.y += uTide;
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uTide;
      uniform vec3 uSunDir;
      uniform vec3 uSunColor;
      uniform vec3 uHorizon;
      uniform vec3 uZenith;
      uniform vec3 uHazeColor;
      uniform vec3 uSunGlow;
      uniform float uHazeDensity;
      uniform vec3 uWaterDeep;
      uniform vec3 uWaterShallow;
      uniform float uNight;
      uniform vec3 uMoonDir;
      uniform vec3 uSkyAmb;
      varying vec3 vWorldPos;
      ${NOISE}

      float shoreZ(float x) { return 98.0 + 3.5 * sin(0.011 * x + 0.6) + 1.8 * sin(0.027 * x + 2.1); }
      float seabed(vec2 p) {
        float u = p.y - shoreZ(p.x);
        if (u < 45.0) return -u * 0.052;
        return -45.0 * 0.052 - (u - 45.0) * 0.02;
      }
      float waveH(vec2 p, float t) {
        float h = sin(dot(p, vec2(0.02, 0.23)) - t * 1.1) * 0.5;
        h += sin(dot(p, vec2(-0.13, 0.31)) - t * 1.7) * 0.25;
        h += sin(dot(p, vec2(0.37, 0.41)) - t * 2.3) * 0.12;
        h += (vnoise(p * 0.6 + vec2(t * 0.3, -t * 0.5)) - 0.5) * 0.4;
        return h;
      }
      void main() {
        vec2 p = vWorldPos.xz;
        vec3 toCam = cameraPosition - vWorldPos;
        float dist = length(toCam);
        vec3 V = toCam / dist;
        float depth = uTide - seabed(p);
        float t = uTime;
        float off = p.y - shoreZ(p.x); // meters seaward from the shoreline
        // normals from analytic-ish waves, damped with distance
        float e = 0.35;
        float amp = 0.06 * (1.0 - smoothstep(60.0, 900.0, dist));
        float hx = waveH(p + vec2(e, 0.0), t) - waveH(p - vec2(e, 0.0), t);
        float hz = waveH(p + vec2(0.0, e), t) - waveH(p - vec2(0.0, e), t);
        vec3 N = normalize(vec3(-hx * amp / e, 1.0, -hz * amp / e));
        float fres = pow(1.0 - max(dot(N, V), 0.0), 4.0);
        vec3 R = reflect(-V, N);
        vec3 sky = mix(uHorizon, uZenith, pow(clamp(R.y, 0.0, 1.0), 0.45));
        // water body color: turquoise shallows -> cobalt -> paler toward the horizon
        float dk = smoothstep(0.3, 7.0, depth);
        vec3 base = mix(uWaterShallow, uWaterDeep, dk);
        base = mix(base, mix(uWaterDeep, uHorizon, 0.35), smoothstep(250.0, 2200.0, dist));
        vec3 skyMid = mix(uZenith, uHorizon, 0.45);
        vec3 col = mix(base, mix(sky, skyMid, 0.5), 0.06 + 0.32 * fres);
        // shading by sky ambient / sun
        col *= 0.72 + 0.4 * clamp(dot(N, uSunDir), 0.0, 1.0) * (1.0 - uNight);
        // drawn ripple strokes
        float rip = vnoise(vec2(p.x * 0.05, p.y * 0.16) + vec2(t * 0.02, -t * 0.05));
        float stroke = smoothstep(0.035, 0.0, abs(fract(rip * 7.0) - 0.5) - 0.465);
        stroke *= smoothstep(450.0, 40.0, dist) * (0.35 + 0.65 * vnoise(p * 0.11 + t * 0.05));
        col = mix(col, mix(col, vec3(1.0), 0.55), stroke * 0.6 * (1.0 - uNight * 0.7));
        // sun / moon glitter
        vec3 L = uNight > 0.6 ? uMoonDir : uSunDir;
        float sd = max(dot(R, L), 0.0);
        float spark = step(0.72, vnoise(p * 3.1 + vec2(t * 1.3, -t * 0.7))) * step(0.5, vnoise(p * 1.7 - t * 0.9));
        float glit = pow(sd, 90.0) * 1.2 + pow(sd, 900.0) * 6.0 * spark + pow(sd, 18.0) * spark * 1.6;
        vec3 glitCol = uNight > 0.6 ? vec3(0.8, 0.85, 1.0) * 0.6 : (uSunColor * 1.6 + uSunGlow);
        col += glitCol * glit;
        // breaking waves: foam bands rolling in toward the shore
        float distSea = max(off, 0.0);
        float phase = distSea / 13.0 + t / 6.5 + vnoise(vec2(p.x * 0.015, 3.0)) * 0.8;
        float f = fract(phase);
        float crest = smoothstep(0.0, 0.03, f) * (1.0 - smoothstep(0.05, 0.16, f));
        crest *= smoothstep(38.0, 6.0, distSea) * smoothstep(-0.5, 2.0, distSea);
        crest *= smoothstep(0.3, 0.6, vnoise(vec2(p.x * 0.09 - t * 0.1, phase * 3.0)));
        // swash foam at the waterline
        float swash = 1.0 - smoothstep(0.0, 0.07 + 0.06 * vnoise(p * 0.7 + t * 0.4), depth);
        float lace = smoothstep(0.45, 0.6, vnoise(p * 1.8 + vec2(t * 0.6, 0.0))) * (1.0 - smoothstep(0.05, 0.3, depth));
        float foam = clamp(max(crest, max(swash, lace * 0.8)), 0.0, 1.0);
        vec3 foamCol = mix(vec3(1.0), uHorizon, 0.15) * (0.75 + 0.35 * (1.0 - uNight));
        col = mix(col, foamCol, foam);
        // haze
        float h = (1.0 - exp(-dist * uHazeDensity * 0.6)) * 0.85;
        float sglow = pow(max(dot(-V, uSunDir), 0.0), 6.0);
        col = mix(col, uHazeColor + uSunGlow * sglow * 0.6, h);
        float alpha = mix(0.25, 1.0, smoothstep(0.0, 1.6, depth));
        alpha = max(alpha, foam);
        alpha = max(alpha, smoothstep(80.0, 300.0, dist));
        gl_FragColor = vec4(col, alpha);
      }
    `,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 2;
  mesh.name = 'sea';
  mesh.frustumCulled = false;
  return mesh;
}

// ---------------------------------------------------------------------------
// Sea wall, promenade, stairs, beach props, breakwater + lighthouse, island
// ---------------------------------------------------------------------------
export function buildCoast(ctx) {
  const rng = new RNG(919);
  const B = (x, z) => ctx.builders.get('toon', x, z);
  const X0 = SHORE.x0 + 6, X1 = SHORE.x1 - 6;
  const RW0 = RIVER.x - RIVER.inner - RIVER.wall, RW1 = RIVER.x + RIVER.inner + RIVER.wall; // river mouth gap
  const nearRiver = (x, m = 0) => x > RW0 - m && x < RW1 + m;
  const wallTop = PROM.y;
  // promenade surface (road material style 9); the river is crossed by a footbridge (river.js)
  for (const [a, bnd] of [[X0, RW0], [RW1, X1]]) for (let x = a; x < bnd; x += 24) {
    const x1 = Math.min(bnd, x + 24);
    const b = ctx.builders.get('road', (x + x1) / 2, 70);
    const base = b.count;
    const c = new THREE.Color(0.2, 0, 0);
    const zs = [PROM.z0, SEAWALL_Z - 0.3];
    for (const xx of [x, x1]) for (const z of zs) b.vtx(xx, wallTop, z, 0, 1, 0, c, z - PROM.z0, xx, 9);
    b.idx.push(base, base + 1, base + 3, base, base + 3, base + 2);
  }
  // curb along the road edge, parapet with gaps for the stairs
  for (let x = X0; x < X1; x += 6) {
    const x1 = Math.min(X1, x + 6);
    if (nearRiver((x + x1) / 2, 3)) continue;
    B(x, 70).boxMM(x, COAST.y - 0.2, PROM.z0 - 0.12, x1, wallTop + 0.01, PROM.z0 + 0.02, { color: 0xc9c5bb, pattern: PAT.CONCRETE });
  }
  const gaps = BEACH_STAIRS.map((sx) => [sx - 1.8, sx + 1.8]).concat([[RW0, RW1]]);
  const inGap = (x) => gaps.some(([a, b]) => x > a && x < b);
  let x = X0;
  while (x < X1) {
    let x1 = Math.min(X1, x + 5);
    for (const [a] of gaps) if (x < a && x1 > a) x1 = a;
    if (!inGap((x + x1) / 2)) {
      B(x, 73).boxMM(x, wallTop, SEAWALL_Z - 0.32, x1, wallTop + 0.78, SEAWALL_Z, { color: 0xd3cfc4, pattern: PAT.CONCRETE, ao: 0.08 });
      B(x, 73).boxMM(x - 0.02, wallTop + 0.78, SEAWALL_Z - 0.36, x1 + 0.02, wallTop + 0.86, SEAWALL_Z + 0.04, { color: 0xdcd8ce, pattern: PAT.CONCRETE });
      ctx.colliders.addBox((x + x1) / 2, SEAWALL_Z - 0.16, (x1 - x) / 2, 0.2, 0, wallTop + 0.86);
    }
    x = x1;
    for (const [a, b] of gaps) if (Math.abs(x - a) < 0.01) x = b;
  }
  // sea wall face down to the beach (stepped concrete)
  for (let x = X0; x < X1; x += 4) {
    const x1 = Math.min(X1, x + 4);
    if (x1 > RW0 && x < RW1) continue;
    const by = Math.min(beachH(x, SEAWALL_Z + 0.5), beachH(x1, SEAWALL_Z + 0.5));
    B(x, 74).boxMM(x, by - 1.0, SEAWALL_Z, x1, wallTop + 0.01, SEAWALL_Z + 0.6, { color: 0xc4c0b5, pattern: PAT.CONCRETE, ao: 0.15 });
    B(x, 74).boxMM(x, by - 0.6, SEAWALL_Z + 0.6, x1, by + 0.35, SEAWALL_Z + 1.4, { color: 0xbdb9ae, pattern: PAT.CONCRETE, ao: 0.2 });
  }
  ctx.colliders.addSurface(X0, PROM.z0, RW0, SEAWALL_Z + 0.6, () => wallTop, 1);
  ctx.colliders.addSurface(RW1, PROM.z0, X1, SEAWALL_Z + 0.6, () => wallTop, 1);
  // stairs down to the beach
  for (const sx of BEACH_STAIRS) {
    const steps = 12;
    const by = beachH(sx, SEAWALL_Z + 4.2);
    const rise = (wallTop - by) / steps;
    const run = 0.32;
    for (let i = 0; i < steps; i++) {
      const z0 = SEAWALL_Z + i * run;
      const top = wallTop - (i + 1) * rise;
      B(sx, 75).boxMM(sx - 1.6, by - 0.6, z0, sx + 1.6, top + 0.001, z0 + run, { color: 0xcdc9be, pattern: PAT.CONCRETE });
    }
    for (const e of [-1, 1]) {
      const wx = sx + e * 1.75;
      B(sx, 75).boxMM(wx - 0.15, by - 0.6, SEAWALL_Z, wx + 0.15, wallTop + 0.86, SEAWALL_Z + 0.5, { color: 0xd3cfc4, pattern: PAT.CONCRETE });
      for (let i = 0; i < steps; i += 2) {
        const z0 = SEAWALL_Z + i * run;
        const top = wallTop - i * rise + 0.6;
        B(sx, 75).boxMM(wx - 0.15, by - 0.6, z0, wx + 0.15, top, z0 + run * 2, { color: 0xd3cfc4, pattern: PAT.CONCRETE });
      }
      ctx.colliders.addBox(wx, SEAWALL_Z + (steps * run) / 2, 0.15, (steps * run) / 2, 0, 99);
    }
    ctx.colliders.addSurface(sx - 1.6, SEAWALL_Z - 0.05, sx + 1.6, SEAWALL_Z + steps * run, (px, pz) => {
      const k = Math.min(1, Math.max(0, (pz - SEAWALL_Z) / (steps * run)));
      return wallTop - k * (wallTop - by);
    }, 2);
  }
  // benches facing the sea on the promenade
  for (const bx of [-270, -225, -125, -40, 5, 60, 90, 150, 236, 280, 340]) {
    benchAt(ctx, B(bx, 71), bx, wallTop, 71.4, Math.PI, 0x9a7454, '海を眺めるベンチに座る');
  }
  // palms along the promenade
  for (let px = X0 + 8; px < X1 - 4; px += rng.range(17, 23)) {
    if (BEACH_STAIRS.some((s) => Math.abs(s - px) < 4) || nearRiver(px, 4)) continue;
    palm(ctx, px, wallTop, 69.6, rng);
  }
  // street lamps on the promenade
  for (let lx = X0 + 10; lx < X1 - 4; lx += 30) {
    if (nearRiver(lx, 2)) continue;
    const b = B(lx, 69);
    b.cyl(lx, wallTop, 69.0, 0.07, 0.06, 4.6, 8, 0x5a6670);
    b.rod(V(lx, wallTop + 4.5, 69.0), V(lx, wallTop + 4.6, 69.9), 0.04, 0.04, 5, 0x5a6670);
    b.box(lx, wallTop + 4.55, 70.1, 0.3, 0.12, 0.5, { color: 0x4a5560 });
    ctx.builders.get('emissive', lx, 70).box(lx, wallTop + 4.47, 70.1, 0.24, 0.04, 0.42, { color: 0xfff1cf });
    ctx.lamps.push({ x: lx, y: wallTop + 4.4, z: 70.1, r: 5.5 });
    ctx.colliders.addCircle(lx, 69.0, 0.12);
  }

  // ---- beach props ----
  for (let i = 0; i < 14; i++) {
    const dx = rng.range(X0 + 10, X1 - 10);
    if (nearRiver(dx, 14)) continue;
    const dz = rng.range(SEAWALL_Z + 4, shoreZ(dx) - 6);
    const y = terrainH(dx, dz);
    const L = rng.range(1.8, 3.6);
    const a = rng.range(0, Math.PI);
    B(dx, dz).rod(V(dx - Math.cos(a) * L / 2, y + 0.12, dz - Math.sin(a) * L / 2), V(dx + Math.cos(a) * L / 2, y + 0.15, dz + Math.sin(a) * L / 2), 0.16, 0.1, 6, 0x9a8a78, PAT.BOARDS);
  }
  // sand fences (bamboo)
  for (let fx = X0 + 20; fx < X1 - 20; fx += rng.range(28, 40)) {
    if (nearRiver(fx, 16) || nearRiver(fx + 10, 16)) continue;
    const fz = SEAWALL_Z + rng.range(4, 7);
    const len = rng.range(6, 10);
    for (let k = 0; k < len / 0.12; k++) {
      const xx = fx + k * 0.12;
      const yy = terrainH(xx, fz);
      B(xx, fz).box(xx, yy + 0.4 + (k % 3) * 0.04, fz, 0.035, 0.85 + (k % 3) * 0.08, 0.035, { color: 0xc2a874 });
    }
    B(fx, fz).box(fx + len / 2, terrainH(fx, fz) + 0.6, fz, len, 0.04, 0.05, { color: 0x9a8058 });
  }
  // boats near the breakwater
  for (let i = 0; i < 4; i++) {
    const bx = BREAKWATER.x + 10 + i * 6.5;
    const bz = SEAWALL_Z + 8 + rng.range(-1, 3);
    boat(ctx, bx, terrainH(bx, bz) + 0.25, bz, rng.range(-0.3, 0.3) + Math.PI / 2, rng);
  }
  // breakwater + tetrapods + lighthouse
  breakwater(ctx, rng);
  // shells to collect
  ctx.shells = [];
  for (let i = 0; i < 10; i++) {
    let sxp = rng.range(X0 + 20, X1 - 20);
    if (nearRiver(sxp, 16)) sxp += 40;
    const szp = shoreZ(sxp) - rng.range(1.5, 7);
    ctx.shells.push({ x: sxp, z: szp, y: terrainH(sxp, szp), color: rng.pick([0xffe6dc, 0xf6d2e0, 0xfff4e0, 0xe8d8f0]) });
  }
  // a couple of cats at the beach / promenade
  ctx.catSpots.push({ x: 8, z: 72.6, y: wallTop + 0.86, kind: 'wall', ry: Math.PI });
  ctx.catSpots.push({ x: BREAKWATER.x + 17, z: SEAWALL_Z + 8.5, y: terrainH(BREAKWATER.x + 17, SEAWALL_Z + 8.5) + 0.85, kind: 'boat', ry: 1.2 });
}

// A bench whose seat faces (-sin ry, -cos ry): the same direction a player with yaw = ry looks.
// Adds its collider and a sit interaction in front of it.
export function benchAt(ctx, b, x, y, z, ry, wood = 0x9a7454, label = 'ベンチに座る', interact = true) {
  bench(b, x, y, z, ry, wood);
  ctx.colliders.addBox(x, z, 0.9, 0.3, ry, y + 0.5);
  if (!interact) return;
  const fx = -Math.sin(ry), fz = -Math.cos(ry);
  ctx.interactables.push({ kind: 'bench', x: x + fx * 0.75, z: z + fz * 0.75, r: 1.3, label, sit: { x: x - fx * 0.02, y: y + 0.45, z: z - fz * 0.02, yaw: ry } });
}

export function bench(b, x, y, z, ry, wood = 0x9a7454) {
  b.pushTRS(x, y, z, ry);
  for (const e of [-0.75, 0.75]) {
    b.box(e, 0.22, 0, 0.06, 0.44, 0.4, { color: 0x4a4e52 });
    b.box(e, 0.62, 0.17, 0.06, 0.4, 0.06, { color: 0x4a4e52 });
  }
  for (let i = 0; i < 3; i++) b.box(0, 0.45, -0.12 + i * 0.12, 1.8, 0.04, 0.1, { color: wood, pattern: PAT.PLANKS });
  for (let i = 0; i < 2; i++) b.box(0, 0.62 + i * 0.14, 0.2, 1.8, 0.1, 0.03, { color: wood, pattern: PAT.PLANKS });
  b.pop();
}

function palm(ctx, x, y, z, rng) {
  const b = ctx.builders.get('toon', x, z);
  const H = rng.range(6.5, 9);
  const lean = V(rng.range(-0.15, 0.15), 1, rng.range(-0.05, 0.2)).normalize();
  const pts = [];
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    pts.push(V(x + lean.x * H * t + Math.sin(t * 3) * 0.15, y + H * t, z + lean.z * H * t));
  }
  b.tube(pts, pts.map((_, i) => 0.26 - i * 0.025), 7, 0x8a7560, PAT.BARK);
  const top = pts[6];
  const fronds = 11;
  for (let f = 0; f < fronds; f++) {
    const a = (f / fronds) * Math.PI * 2 + rng.range(-0.2, 0.2);
    const dir = V(Math.cos(a), 0, Math.sin(a));
    const len = rng.range(2.6, 3.4);
    const segs = 5;
    let prev = top.clone();
    for (let s = 1; s <= segs; s++) {
      const t = s / segs;
      const p = top.clone().addScaledVector(dir, len * t);
      p.y += Math.sin(t * Math.PI * 0.55) * 1.0 - t * t * 1.8;
      const side = V(-dir.z, 0, dir.x).multiplyScalar(0.42 * Math.sin(t * Math.PI) + 0.05);
      const c = s < 2 ? 0x5f8f43 : 0x6fa04c;
      b.quad(prev.clone().sub(side), p.clone().sub(side), p.clone().add(side), prev.clone().add(side), c, PAT.NONE, { double: true });
      prev = p;
    }
  }
  ctx.colliders.addCircle(x, z, 0.3);
}

function boat(ctx, x, y, z, ry, rng) {
  const b = ctx.builders.get('toon', x, z);
  b.pushTRS(x, y, z, ry);
  const hull = rng.pick([0xf4f4f0, 0xeae6da, 0xdfe8ef]);
  const stripe = rng.pick([0x2f6fb0, 0xc0392b, 0x2e8a5a]);
  // hull from a scaled, tapered box stack
  b.box(0, 0.35, 0, 1.9, 0.7, 6.0, { color: hull, ao: 0.2 });
  b.box(0, 0.75, -3.2, 1.2, 0.5, 0.8, { color: hull });
  b.box(0, 0.66, 0, 1.94, 0.12, 6.0, { color: stripe });
  b.box(0, 0.95, 0.8, 1.4, 0.7, 1.4, { color: 0xf0f0ea });
  ctx.builders.get('window', x, z).pushTRS(x, y, z, ry);
  ctx.builders.get('window', x, z).quad(V(-0.6, 1.0, 0.09), V(0.6, 1.0, 0.09), V(0.6, 1.25, 0.09), V(-0.6, 1.25, 0.09), 0xffffff, 60, { uvs: [[0, 0], [1, 0], [1, 1], [0, 1]] });
  ctx.builders.get('window', x, z).pop();
  b.cyl(0, 1.3, -1.0, 0.04, 0.04, 2.4, 5, 0xdedede);
  b.pop();
  ctx.colliders.addBox(x, z, 1.0, 3.2, ry, y + 1.2);
}

function tetrapod(b, x, y, z, s, rng) {
  const c = rng.pick([0xbab6ad, 0xc4c0b6, 0xafaba2]);
  const legs = [V(0, 1, 0), V(0.943, -0.333, 0), V(-0.471, -0.333, 0.816), V(-0.471, -0.333, -0.816)];
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rng.range(0, 6.28), rng.range(0, 6.28), rng.range(0, 6.28)));
  for (const l of legs) {
    const d = l.clone().applyQuaternion(q);
    b.rod(V(x, y, z), V(x + d.x * s, y + d.y * s, z + d.z * s), 0.42 * s, 0.24 * s, 6, c, PAT.CONCRETE);
  }
}

function breakwater(ctx, rng) {
  const bw = BREAKWATER;
  const top = 2.6;
  for (let z = bw.z0; z < bw.z1; z += 8) {
    const z1 = Math.min(bw.z1, z + 8);
    const b = ctx.builders.get('toon', bw.x, z);
    const by = Math.min(terrainH(bw.x, z), terrainH(bw.x, z1)) - 1.5;
    b.boxMM(bw.x - bw.w / 2, by, z, bw.x + bw.w / 2, top, z1, { color: 0xc9c5bb, pattern: PAT.CONCRETE, ao: 0.25 });
    // parapet on the west side
    b.boxMM(bw.x - bw.w / 2, top, z, bw.x - bw.w / 2 + 0.6, top + 1.0, z1, { color: 0xd0ccc2, pattern: PAT.CONCRETE });
    // tetrapods along the east (sea) side and at the head
    for (let k = 0; k < 3; k++) {
      const tz = z + rng.range(0, 8);
      const tx = bw.x + bw.w / 2 + rng.range(0.8, 3.5);
      const ty = Math.max(terrainH(tx, tz), -2.5) + rng.range(0.4, 1.2);
      tetrapod(b, tx, ty, tz, rng.range(1.1, 1.5), rng);
    }
    for (let k = 0; k < 2; k++) {
      const tz = z + rng.range(0, 8);
      const tx = bw.x - bw.w / 2 - rng.range(0.8, 2.5);
      const ty = Math.max(terrainH(tx, tz), -2.5) + rng.range(0.2, 0.8);
      tetrapod(b, tx, ty, tz, rng.range(1.0, 1.3), rng);
    }
  }
  for (let k = 0; k < 14; k++) {
    const a = rng.range(-Math.PI * 0.6, Math.PI * 0.6);
    const r = rng.range(3.5, 6);
    const tx = bw.x + Math.sin(a) * r, tz = bw.z1 + Math.cos(a) * r * 0.8;
    tetrapod(ctx.builders.get('toon', tx, tz), tx, Math.max(terrainH(tx, tz), -3) + rng.range(0.3, 1.3), tz, rng.range(1.2, 1.6), rng);
  }
  // walkable top + ramp from the beach
  ctx.colliders.addSurface(bw.x - bw.w / 2 + 0.6, bw.z0, bw.x + bw.w / 2, bw.z1, () => top, 1);
  ctx.colliders.addBox(bw.x - bw.w / 2 + 0.3, (bw.z0 + bw.z1) / 2, 0.3, (bw.z1 - bw.z0) / 2, 0, top + 1.0);
  for (const e of [-1, 1]) ctx.colliders.addBox(bw.x + e * (bw.w / 2 + 0.2), (bw.z0 + bw.z1) / 2 + 8, 0.2, (bw.z1 - bw.z0) / 2 - 8, 0, top + 0.5);
  // ramp up from the sand at the root
  const rb = ctx.builders.get('toon', bw.x, bw.z0);
  const ry0 = terrainH(bw.x, bw.z0 - 6);
  rb.slab(V(bw.x - bw.w / 2 + 0.6, ry0, bw.z0 - 7), V(bw.x - bw.w / 2 + 0.6, top, bw.z0), V(bw.x + bw.w / 2, top, bw.z0), V(bw.x + bw.w / 2, ry0, bw.z0 - 7), 1.2, 0xc9c5bb, PAT.CONCRETE);
  ctx.colliders.addSurface(bw.x - bw.w / 2 + 0.6, bw.z0 - 7, bw.x + bw.w / 2, bw.z0, (px, pz) => ry0 + ((pz - (bw.z0 - 7)) / 7) * (top - ry0), 2);
  // lighthouse at the head
  const lx = bw.x + 0.4, lz = bw.z1 - 2.6;
  const b = ctx.builders.get('toon', lx, lz);
  b.cyl(lx, top, lz, 1.5, 1.5, 0.6, 16, 0xdedad0, PAT.CONCRETE);
  b.cyl(lx, top + 0.6, lz, 1.15, 0.85, 8.5, 16, 0xf6f4ee, PAT.NONE, { ao: 0.1 });
  b.cyl(lx, top + 9.1, lz, 1.25, 1.25, 0.18, 16, 0x3f4a54);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    b.box(lx + Math.cos(a) * 1.2, top + 9.6, lz + Math.sin(a) * 1.2, 0.04, 0.8, 0.04, { color: 0x3f4a54 });
  }
  b.cyl(lx, top + 9.98, lz, 1.22, 1.22, 0.06, 16, 0x3f4a54, 0, { caps: false });
  ctx.builders.get('window', lx, lz).cyl(lx, top + 9.3, lz, 0.62, 0.62, 1.1, 12, 0xffffff, 200, { caps: false });
  b.cyl(lx, top + 10.4, lz, 0.75, 0.15, 0.7, 12, 0xd8402e);
  b.cyl(lx, top + 11.1, lz, 0.06, 0.02, 0.6, 5, 0x3f4a54);
  for (const yy of [top + 3.0, top + 6.0]) ctx.builders.get('window', lx, lz).quad(V(lx - 0.18, yy, lz - 1.06), V(lx + 0.18, yy, lz - 1.06), V(lx + 0.18, yy + 0.5, lz - 1.0), V(lx - 0.18, yy + 0.5, lz - 1.0), 0xffffff, 222, { uvs: [[0, 0], [1, 0], [1, 1], [0, 1]] });
  ctx.colliders.addCircle(lx, lz, 1.55);
  ctx.lighthouse = { x: lx, y: top + 9.6, z: lz };
}

// ---------------------------------------------------------------------------
// Distant island with an observation tower, and sailboats
// ---------------------------------------------------------------------------
export function buildIsland(scene, materials) {
  const b = new MeshBuilder();
  const cx = 720, cz = 980;
  const g = new THREE.SphereGeometry(1, 40, 18, 0, Math.PI * 2, 0, Math.PI / 2);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const n = noise2(x * 3 + 5, z * 3 - 2);
    const r = 1 + (n - 0.5) * 0.35;
    pos.setXYZ(i, x * r, y * (0.9 + n * 0.3), z * r);
  }
  g.computeVertexNormals();
  b.geom(g, new THREE.Matrix4().compose(V(cx, -6, cz), new THREE.Quaternion(), V(210, 62, 150)), 0x5e8a5a, PAT.GRASS);
  b.geom(new THREE.CylinderGeometry(1, 1, 1, 24), new THREE.Matrix4().compose(V(cx, -2, cz), new THREE.Quaternion(), V(225, 6, 165)), 0x9a8e7e, PAT.ROCK);
  // tower
  b.cyl(cx + 10, 50, cz - 6, 3, 2.2, 38, 12, 0xe8e6e0);
  b.cyl(cx + 10, 88, cz - 6, 6, 6, 3, 12, 0xdcdad4);
  b.cyl(cx + 10, 91, cz - 6, 2, 0.6, 6, 8, 0xe8e6e0);
  // a few houses at the island foot
  for (let i = 0; i < 9; i++) {
    const a = -1.2 + i * 0.12;
    b.box(cx + Math.sin(a) * 205, 6, cz - Math.cos(a) * 140, 9, 7, 8, { color: [0xeeeeee, 0xd8c8b0, 0xc8d4dc][i % 3] });
  }
  const mesh = new THREE.Mesh(b.toGeometry(), materials.toon.material);
  mesh.name = 'island';
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  scene.add(mesh);
  return mesh;
}

export function createSailboats(materials) {
  const group = new THREE.Group();
  const rng = new RNG(31337);
  const boats = [];
  for (let i = 0; i < 6; i++) {
    const b = new MeshBuilder();
    b.box(0, 0.3, 0, 1.2, 0.6, 4.2, { color: 0xf6f6f2 });
    b.cyl(0, 0.6, 0.3, 0.05, 0.04, 6.5, 5, 0xdddddd);
    const sail = rng.pick([0xffffff, 0xffffff, 0xf8e8b0, 0xf0c8c8, 0xc8e0f8]);
    b.tri(V(0, 1.2, 0.35), V(0, 7.0, 0.35), V(0, 1.1, 2.4), sail, 0, { double: true });
    b.tri(V(0, 1.4, 0.2), V(0, 6.0, 0.25), V(0, 1.2, -1.6), sail, 0, { double: true });
    const m = new THREE.Mesh(b.toGeometry(), materials.toon.material);
    const x = rng.range(-500, 500), z = rng.range(180, 700);
    m.position.set(x, 0, z);
    m.rotation.y = rng.range(0, Math.PI * 2);
    m.userData = { x, z, speed: rng.range(0.4, 1.1), dir: rng.range(0, Math.PI * 2), phase: rng.range(0, 10) };
    group.add(m);
    boats.push(m);
  }
  group.userData.update = (t, dt) => {
    for (const m of boats) {
      const u = m.userData;
      u.x += Math.cos(u.dir) * u.speed * dt;
      u.z += Math.sin(u.dir) * u.speed * dt;
      if (u.x > 700) u.x = -700;
      if (u.x < -700) u.x = 700;
      if (u.z < 160 || u.z > 800) u.dir = -u.dir;
      m.position.set(u.x, Math.sin(t * 0.9 + u.phase) * 0.12, u.z);
      m.rotation.set(Math.sin(t * 0.7 + u.phase) * 0.05, -u.dir + Math.PI / 2, Math.sin(t * 0.8 + u.phase) * 0.06);
    }
  };
  return group;
}
