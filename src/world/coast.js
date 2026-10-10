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
  // the parapet runs on over the river's wall tops up to the bridge railings
  const gaps = BEACH_STAIRS.map((sx) => [sx - 1.8, sx + 1.8]).concat([[RW0 + RIVER.wall, RW1 - RIVER.wall]]);
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
    // the walk surface follows the treads (a stepped surface, not a ramp)
    ctx.colliders.addSurface(sx - 1.6, SEAWALL_Z - 0.05, sx + 1.6, SEAWALL_Z + steps * run, (px, pz) => {
      if (pz < SEAWALL_Z) return wallTop;
      return wallTop - (Math.min(steps - 1, Math.floor((pz - SEAWALL_Z) / run)) + 1) * rise;
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
    const L = rng.range(1.8, 3.6);
    const a = rng.range(0, Math.PI);
    // half sunk in the sand at both ends
    const ya = terrainH(dx - Math.cos(a) * L / 2, dz - Math.sin(a) * L / 2), yb = terrainH(dx + Math.cos(a) * L / 2, dz + Math.sin(a) * L / 2);
    B(dx, dz).rod(V(dx - Math.cos(a) * L / 2, ya + 0.1, dz - Math.sin(a) * L / 2), V(dx + Math.cos(a) * L / 2, yb + 0.06, dz + Math.sin(a) * L / 2), 0.16, 0.1, 6, 0x9a8a78, PAT.BOARDS);
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
  // fishing boats hauled up the beach by the breakwater, bows to the sea
  const seats = [];
  for (let i = 0; i < 4; i++) {
    const bx = BREAKWATER.x + 10 + i * 6.5;
    const bz = SEAWALL_Z + 9.5 + rng.range(-0.6, 1.4);
    seats.push(boat(ctx, bx, bz, rng.range(-0.18, 0.18), rng));
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
  ctx.catSpots.push({ x: seats[1].x, z: seats[1].z, y: seats[1].y, kind: 'boat', ry: 1.2 });
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

// Small FRP fishing boat hauled up the beach bow-first to the sea, resting on two
// wooden blocks (盤木) with its outboard tilted up. Returns a seat point for a cat.
function boat(ctx, x, z, ry, rng) {
  const L = rng.range(5.4, 6.3), Bm = rng.range(1.7, 1.92);
  const hullC = rng.pick([0xf4f4f0, 0xeceae2, 0xe3ebf1]);
  const band = rng.pick([0x2f6fb0, 0xc0392b, 0x2e8a5a, 0x1f4f8a]);
  const bottomC = rng.pick([0xb04a3c, 0x3d6f9a, 0x557a4c]);
  const blockH = 0.24;
  // keel line through the two block tops, following the beach
  const fx = Math.sin(ry), fz = Math.cos(ry);
  const sA = -0.3 * L, sB = 0.24 * L;
  const gA = terrainH(x + fx * sA, z + fz * sA), gB = terrainH(x + fx * sB, z + fz * sB);
  const pitch = Math.atan2(gB - gA, sB - sA);
  const y0 = gA + blockH - sA * Math.tan(pitch);
  const m = new THREE.Matrix4().compose(V(x, y0, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(-pitch, ry, 0, 'YXZ')), V(1, 1, 1));
  const b = ctx.builders.get('toon', x, z);
  const d = b.detail || b;
  b.push(m);
  if (d !== b) d.push(m);
  // hull sections from the transom (t = 0) to the stem (t = 1)
  const N = 12;
  const S = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const lz = -L / 2 + t * L;
    const hb = (Bm / 2) * (t < 0.55 ? 0.86 + 0.14 * Math.sin((t / 0.55) * (Math.PI / 2)) : Math.pow(Math.max(0, Math.cos(((t - 0.55) / 0.45) * (Math.PI / 2))), 0.7));
    const keel = t > 0.66 ? Math.pow((t - 0.66) / 0.34, 2) * 0.66 : 0;
    const sheer = 0.84 + 0.36 * t * t;
    const chY = keel + 0.22 + 0.1 * Math.max(0, t - 0.66);
    S.push({ t, lz, hb, keel, sheer, chY, chX: hb * 0.8, wY: sheer - 0.17 });
  }
  for (let i = 0; i < N; i++) {
    const a = S[i], c = S[i + 1];
    const cm = V(0, (a.sheer + c.sheer) * 0.3, (a.lz + c.lz) / 2);
    for (const e of [-1, 1]) {
      const K0 = V(0, a.keel, a.lz), K1 = V(0, c.keel, c.lz);
      const C0 = V(e * a.chX, a.chY, a.lz), C1 = V(e * c.chX, c.chY, c.lz);
      const W0 = V(e * a.hb * 0.985, a.wY, a.lz), W1 = V(e * c.hb * 0.985, c.wY, c.lz);
      const T0 = V(e * a.hb, a.sheer, a.lz), T1 = V(e * c.hb, c.sheer, c.lz);
      b.quadOut(K0, K1, C1, C0, cm, bottomC, PAT.METAL);
      b.quadOut(C0, C1, W1, W0, cm, hullC, 0);
      b.quadOut(W0, W1, T1, T0, cm, band, 0);
      // inside of the topsides down to the floor (open part of the boat only)
      if (c.t <= 0.78) {
        const F0 = V(e * a.hb * 0.8, 0.3, a.lz), F1 = V(e * c.hb * 0.8, 0.3, c.lz);
        b.quadOut(T0, T1, F1, F0, V(e * 9, 0.6, cm.z), 0xe6e4dd, 0);
      }
    }
    if (c.t <= 0.78) {
      // floor boards
      b.quadOut(V(-a.hb * 0.8, 0.3, a.lz), V(a.hb * 0.8, 0.3, a.lz), V(c.hb * 0.8, 0.3, c.lz), V(-c.hb * 0.8, 0.3, c.lz), V(0, -5, cm.z), 0xc9c0aa, PAT.PLANKS);
    } else {
      // foredeck over the bow
      b.quadOut(V(-a.hb, a.sheer, a.lz), V(a.hb, a.sheer, a.lz), V(c.hb, c.sheer, c.lz), V(-c.hb, c.sheer, c.lz), V(0, -5, cm.z), 0xe9e7e0, 0);
    }
    // gunwale caps and rub rails
    for (const e of [-1, 1]) {
      d.rod(V(e * a.hb, a.sheer + 0.02, a.lz), V(e * c.hb, c.sheer + 0.02, c.lz), 0.04, 0.04, 4, 0xd8d4c8);
      d.rod(V(e * a.hb * 0.99, a.wY, a.lz), V(e * c.hb * 0.99, c.wY, c.lz), 0.035, 0.035, 4, 0x4a4e54);
    }
  }
  // bulkhead in front of the open part
  const fb = S.find((q) => q.t > 0.78 - 1e-6) || S[N];
  b.quadOut(V(-fb.hb * 0.8, 0.3, fb.lz), V(fb.hb * 0.8, 0.3, fb.lz), V(fb.hb, fb.sheer, fb.lz), V(-fb.hb, fb.sheer, fb.lz), V(0, 0.6, fb.lz + 3), 0xe6e4dd, 0);
  // transom (outside, with the painted band) and its inside face
  const s0 = S[0];
  const tz = s0.lz;
  const away = V(0, 0.5, tz + 4);
  for (const e of [-1, 1]) {
    b.quadOut(V(0, s0.keel, tz), V(e * s0.chX, s0.chY, tz), V(e * s0.hb * 0.985, s0.wY, tz), V(0, s0.wY, tz), away, hullC, 0);
    b.quadOut(V(0, s0.wY, tz), V(e * s0.hb * 0.985, s0.wY, tz), V(e * s0.hb, s0.sheer, tz), V(0, s0.sheer, tz), away, band, 0);
  }
  b.quadOut(V(-s0.hb * 0.8, 0.3, tz + 0.02), V(s0.hb * 0.8, 0.3, tz + 0.02), V(s0.hb, s0.sheer, tz + 0.02), V(-s0.hb, s0.sheer, tz + 0.02), V(0, 0.5, tz - 4), 0xe6e4dd, 0);
  // thwarts
  for (const tt of [0.3, 0.56]) {
    const q = S[Math.round(tt * N)];
    b.box(0, q.sheer - 0.2, q.lz, q.hb * 1.6, 0.05, 0.26, { color: 0xb69a74, pattern: PAT.PLANKS });
  }
  // outboard motor tilted up on the transom
  const motor = rng.pick([0xd8dadc, 0x3a3e44, 0xe8e6e0]);
  b.box(0, s0.sheer + 0.18, tz - 0.3, 0.4, 0.46, 0.55, { color: motor });
  b.box(0, s0.sheer + 0.02, tz - 0.3, 0.42, 0.08, 0.57, { color: 0x2a2c30 });
  d.rod(V(0, s0.sheer - 0.02, tz - 0.5), V(0, s0.sheer + 0.12, tz - 1.15), 0.06, 0.05, 6, 0x2f3236);
  d.box(0, s0.sheer + 0.13, tz - 1.2, 0.36, 0.08, 0.05, { color: 0x2a2c30 });
  // marker pole with a small flag, orange buoys, a net and a rope coil
  const px = s0.hb * 0.55;
  d.cyl(px, s0.sheer, tz + 0.45, 0.025, 0.02, 2.2, 5, 0xc9c6bd);
  b.quadOut(V(px, s0.sheer + 1.75, tz + 0.45), V(px, s0.sheer + 2.15, tz + 0.45), V(px, s0.sheer + 2.15, tz + 0.95), V(px, s0.sheer + 1.75, tz + 0.95), V(px + 3, s0.sheer + 2, tz + 0.7), rng.pick([0xd8382e, 0xf2c230, 0x2f6fb0]), 0);
  b.quadOut(V(px, s0.sheer + 1.75, tz + 0.45), V(px, s0.sheer + 2.15, tz + 0.45), V(px, s0.sheer + 2.15, tz + 0.95), V(px, s0.sheer + 1.75, tz + 0.95), V(px - 3, s0.sheer + 2, tz + 0.7), rng.pick([0xd8382e, 0xf2c230, 0x2f6fb0]), 0);
  const sb = S[3];
  for (let k = 0; k < 3; k++) b.geom(new THREE.SphereGeometry(0.17, 10, 7), new THREE.Matrix4().makeTranslation(-sb.hb * 0.45 + k * 0.32, 0.47, sb.lz + (k % 2) * 0.25), 0xf07a2a);
  const nb = S[7];
  b.box(nb.hb * 0.15, 0.42, nb.lz, nb.hb * 0.9, 0.24, 0.8, { color: 0x4f6258, pattern: PAT.LATTICE });
  d.cyl(-nb.hb * 0.4, 0.3, nb.lz + 0.2, 0.22, 0.22, 0.1, 10, 0xc8b48a);
  b.pop();
  if (d !== b) d.pop();
  // wooden blocks under the keel, bedded in the sand
  const wb = ctx.builders.get('toon', x, z);
  for (const sl of [sA, sB]) {
    const top = V(0, 0, sl).applyMatrix4(m);
    const g = terrainH(top.x, top.z);
    const h = top.y - g + 0.12;
    wb.pushTRS(top.x, g - 0.12, top.z, ry);
    wb.box(0, h / 2, 0, 1.15, h, 0.26, { color: 0x8a6a4c, pattern: PAT.BOARDS });
    wb.pop();
  }
  ctx.colliders.addBox(x, z, Bm / 2 + 0.1, L / 2 + 0.35, ry, y0 + 1.25);
  const seat = S[Math.round(0.3 * N)];
  return V(seat.hb * 0.35, seat.sheer - 0.17, seat.lz).applyMatrix4(m);
}

// a tetrapod resting on the ground: its lowest leg tip bites a little into the sand
function tetrapod(b, x, ground, z, s, rng) {
  const c = rng.pick([0xbab6ad, 0xc4c0b6, 0xafaba2]);
  const legs = [V(0, 1, 0), V(0.943, -0.333, 0), V(-0.471, -0.333, 0.816), V(-0.471, -0.333, -0.816)];
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rng.range(0, 6.28), rng.range(0, 6.28), rng.range(0, 6.28)));
  const dirs = legs.map((l) => l.clone().applyQuaternion(q));
  const low = Math.min(...dirs.map((d) => d.y * s)) - 0.2 * s;
  const y = ground - low - 0.12;
  for (const d of dirs) b.rod(V(x, y, z), V(x + d.x * s, y + d.y * s, z + d.z * s), 0.42 * s, 0.24 * s, 6, c, PAT.CONCRETE);
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
      const off = rng.range(0.8, 3.5);
      const tx = bw.x + bw.w / 2 + off;
      rng.next();
      // the armour pile climbs the wall above the waterline
      tetrapod(b, tx, Math.max(terrainH(tx, tz), 1.1 - off * 0.55), tz, rng.range(1.1, 1.5), rng);
    }
    for (let k = 0; k < 2; k++) {
      const tz = z + rng.range(0, 8);
      const off = rng.range(0.8, 2.5);
      const tx = bw.x - bw.w / 2 - off;
      rng.next();
      tetrapod(b, tx, Math.max(terrainH(tx, tz), 0.7 - off * 0.45), tz, rng.range(1.0, 1.3), rng);
    }
  }
  for (let k = 0; k < 14; k++) {
    const a = rng.range(-Math.PI * 0.6, Math.PI * 0.6);
    const r = rng.range(3.5, 6);
    const tx = bw.x + Math.sin(a) * r, tz = bw.z1 + Math.cos(a) * r * 0.8;
    rng.next();
    tetrapod(ctx.builders.get('toon', tx, tz), tx, Math.max(terrainH(tx, tz), 1.0 - (r - 3.5) * 0.5), tz, rng.range(1.2, 1.6), rng);
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
