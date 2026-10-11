import * as THREE from 'three';
import { RNG } from '../core/rng.js';
import { G } from '../render/materials.js';
import { STREAM, streamBed, RICE, riceMask, riceTerrace } from './routeplan.js';
import { RIVER } from './layout.js';

// 蛍: fireflies over the water on spring nights, along the gorge's stream, round the paddies
// of the rice terraces and down the river. Each drifts round its own spot and glows in slow
// pulses; all of it is worked out on the GPU from the time, nothing per frame on the CPU.

function homes(rng) {
  const out = [];
  // the gorge, low over the stream between the culvert and the head of the valley
  for (let i = 0; i < 220; i++) {
    const z = rng.range(-142, -262);
    let x = 182;
    for (let k = 0; k < STREAM.pts.length - 1; k++) {
      const [ax, az] = STREAM.pts[k], [bx, bz] = STREAM.pts[k + 1];
      if (z <= az && z >= bz) x = ax + ((bx - ax) * (z - az)) / (bz - az);
    }
    out.push([x + rng.range(-3.5, 3.5), streamBed(z) + rng.range(0.4, 2.6), z, rng.range(0.6, 1.6)]);
  }
  // the paddies: over the water near the banks
  for (let n = 0, tries = 0; n < 320 && tries < 6000; tries++) {
    const x = rng.range(RICE.x - RICE.half, RICE.x + RICE.half), z = rng.range(RICE.z1, RICE.z0);
    if (riceMask(x, z) < 0.9) continue;
    const t = riceTerrace(x, z);
    out.push([x, t.top + rng.range(0.3, 1.8), z, rng.range(0.8, 2.2)]);
    n++;
  }
  // a few down the river above the town
  for (let i = 0; i < 40; i++) {
    const z = rng.range(RIVER.zHead + 4, -60);
    out.push([RIVER.x + rng.range(-RIVER.inner, RIVER.inner), rng.range(1.2, 3.2), z, rng.range(0.6, 1.4)]);
  }
  return out;
}

export function buildFireflies(scene) {
  const rng = new RNG(5151);
  const H = homes(rng);
  const n = H.length;
  const base = new THREE.PlaneGeometry(1, 1);
  const g = new THREE.InstancedBufferGeometry();
  g.index = base.index;
  g.setAttribute('position', base.attributes.position);
  g.setAttribute('uv', base.attributes.uv);
  const home = new Float32Array(n * 4), par = new Float32Array(n * 4);
  H.forEach(([x, y, z, r], i) => {
    // (fireflies near one another pulse nearly together, as Genji fireflies do)
    home.set([x, y, z, rng.next()], i * 4);
    par.set([r, rng.range(0.18, 0.34), rng.range(1.8, 2.6), rng.range(0.5, 0.72)], i * 4);
  });
  g.setAttribute('aHome', new THREE.InstancedBufferAttribute(home, 4));
  g.setAttribute('aParam', new THREE.InstancedBufferAttribute(par, 4));
  g.instanceCount = n;
  const uNight = G.uNight, uTime = G.uTime;
  const mat = new THREE.ShaderMaterial({
    name: 'fireflies',
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uNight, uTime },
    vertexShader: /* glsl */ `
      attribute vec4 aHome;
      attribute vec4 aParam;
      uniform float uTime;
      uniform float uNight;
      varying vec2 vUv;
      varying float vGlow;
      void main() {
        float t = uTime * aParam.y + aHome.w * 40.0;
        vec3 p = aHome.xyz + vec3(sin(t * 0.71) * aParam.x, sin(t * 0.53 + 1.3) * 0.4, cos(t * 0.62 + 0.4) * aParam.x);
        // a slow swell and fade, then dark for a while
        float ph = fract(uTime / aParam.z + aHome.w * 0.35 + floor(aHome.x * 0.05) * 0.21);
        float pulse = smoothstep(0.0, 0.18, ph) * (1.0 - smoothstep(0.22, 0.6, ph));
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vGlow = (0.12 + 0.88 * pulse) * smoothstep(0.55, 0.85, uNight) * (1.0 - smoothstep(55.0, 95.0, -mv.z));
        mv.xy += position.xy * aParam.w * (0.7 + 0.5 * pulse);
        vUv = uv;
        gl_Position = projectionMatrix * mv;
        if (vGlow < 0.004) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec2 vUv;
      varying float vGlow;
      void main() {
        float d = length(vUv - 0.5) * 2.0;
        float core = 1.0 - smoothstep(0.0, 0.1, d);
        float halo = pow(1.0 - smoothstep(0.0, 1.0, d), 3.0) * 0.8;
        gl_FragColor = vec4(vec3(0.78, 1.0, 0.4) * (core * 2.0 + halo) * vGlow, 1.0);
      }
    `,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 6;
  mesh.name = 'fireflies';
  // (by day the vertex shader puts every one of them off screen)
  scene.add(mesh);
  return n;
}
