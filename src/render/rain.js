import * as THREE from 'three';
import { G } from './materials.js';
import { RAINTOP } from './glsl.js';

// Falling rain and its splashes, all on the GPU.
//
// The drops: streaks in a box that travels with the camera; each falls at its own speed,
// slanted by the wind, wrapping round the box in world space (so they stay put as you walk
// through them, rather than sliding along with the view). One that has come down below the
// highest surface under it (rain map) is not drawn: no rain indoors, under the eaves, under
// the station canopy, under bridges or in the tunnels; none under her umbrella either.
// Far off they widen to a pixel and fade in proportion, so the distance does not shimmer;
// beyond the box the haze carries the rain.
//
// The splashes: rings spreading where drops land, on the ground, on roofs, on the water,
// each at a new spot every time it comes round.

const MAX_DROPS = 16000;
const MAX_SPLASH = 3200;
const BOX = new THREE.Vector3(44, 20, 44);

function quadGeometry(count, attrs) {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, 0, 1, 0, 0, 1, 1, 0, -1, 1, 0], 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  for (const [name, size, fill] of attrs) {
    const a = new Float32Array(count * size);
    for (let i = 0; i < count; i++) fill(a, i * size);
    g.setAttribute(name, new THREE.InstancedBufferAttribute(a, size));
  }
  g.instanceCount = 0;
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e9);
  return g;
}

const BLEND = {
  transparent: true,
  depthWrite: false,
  blending: THREE.CustomBlending,
  blendEquation: THREE.AddEquation,
  blendSrc: THREE.OneFactor,
  blendDst: THREE.OneFactor,
  // the alpha channel carries the ink-line weight: leave it alone
  blendSrcAlpha: THREE.ZeroFactor,
  blendDstAlpha: THREE.OneFactor,
};

export function createRain() {
  const umb = new THREE.Vector4(0, -1e4, 0, 0); // her umbrella: canopy centre x, top y, z, radius
  const umbLow = { value: -1e4 }; // the canopy's rim
  const wind = new THREE.Vector2(0.9, 0.35);
  // how far the rain has fallen so far (integrated here, so a change in the wind or the
  // rain's force bends it from now on instead of jolting every drop): x, z the wind's drift
  // (m), y the seconds of fall
  const fall = new THREE.Vector3();
  const common = {
    uTime: G.uTime,
    uRain: G.uRain,
    uNight: G.uNight,
    uSkyAmb: G.uSkyAmb,
    uHazeColor: G.uHazeColor,
    uRainMap: G.uRainMap,
    uRainRect: G.uRainRect,
    uRainRange: G.uRainRange,
    uBox: { value: BOX },
    uUmb: { value: umb },
    uUmbLow: umbLow,
    uWindV: { value: wind },
    uFall: { value: fall },
  };
  const HEAD = /* glsl */ `
    uniform float uTime;
    uniform float uRain;
    uniform vec3 uBox;
    uniform vec4 uUmb;
    uniform float uUmbLow;
    uniform vec2 uWindV;
    uniform vec3 uFall;
    ${RAINTOP}
    // under her umbrella (the canopy and the space below it)
    float underUmbrella(vec3 p) {
      if (uUmb.w <= 0.0) return 0.0;
      vec2 d = p.xz - uUmb.xz;
      float r = uUmb.w * (0.75 + 0.25 * clamp((uUmb.y - p.y) / max(uUmb.y - uUmbLow, 0.05), 0.0, 1.0));
      return step(dot(d, d), r * r) * step(p.y, uUmb.y);
    }
  `;
  const FRAG_HEAD = /* glsl */ `
    uniform vec3 uSkyAmb;
    uniform vec3 uHazeColor;
    uniform float uNight;
    // the colour of the rain against this sky (a little brighter at night: lit by the town)
    vec3 rainColor() {
      return mix(uHazeColor * 0.9, uSkyAmb * 1.4, 0.45) + vec3(0.05, 0.055, 0.06) * uNight;
    }
  `;

  // ---- the drops ----
  const dropGeo = quadGeometry(MAX_DROPS, [['seed', 4, (a, o) => {
    a[o] = Math.random();
    a[o + 1] = Math.random();
    a[o + 2] = Math.random();
    a[o + 3] = Math.random();
  }]]);
  const dropMat = new THREE.ShaderMaterial({
    ...BLEND,
    uniforms: common,
    vertexShader: /* glsl */ `
      attribute vec4 seed;
      varying float vA;
      varying vec2 vQ;
      ${HEAD}
      void main() {
        float speed = 8.0 + seed.w * 3.0;
        vec3 vel = vec3(uWindV.x, -speed * (1.0 + 0.15 * uRain), uWindV.y);
        vec3 c = cameraPosition - uBox * vec3(0.5, 0.32, 0.5);
        vec3 p = mod(seed.xyz * uBox + vec3(uFall.x, -uFall.y * speed, uFall.z) - c, uBox) + c;
        float hide = step(p.y, rainTop(p.xz) + 0.03) + underUmbrella(p);
        vec3 dir = normalize(vel);
        vec3 toCam = cameraPosition - p;
        float dist = length(toCam);
        vec3 side = normalize(cross(dir, toCam / max(dist, 1e-3)));
        // a pixel wide at least (and dimmer for it), longer when it falls harder
        float w = max(0.0045, dist * 0.0011);
        float len = (0.32 + 0.3 * seed.w) * (0.8 + 0.4 * uRain);
        vec3 pos = p + side * position.x * w + dir * (position.y - 0.5) * len;
        vA = (1.0 - min(hide, 1.0)) * smoothstep(0.35, 1.4, dist) * (1.0 - smoothstep(uBox.x * 0.3, uBox.x * 0.48, dist)) * (0.0045 / w);
        vA *= 0.55 + 0.45 * seed.z;
        vQ = position.xy;
        gl_Position = projectionMatrix * viewMatrix * vec4(pos, 1.0);
        if (vA < 0.002) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vA;
      varying vec2 vQ;
      ${FRAG_HEAD}
      void main() {
        float a = vA * (1.0 - abs(vQ.x)) * smoothstep(0.0, 0.35, vQ.y) * smoothstep(1.0, 0.6, vQ.y);
        gl_FragColor = vec4(rainColor() * a * 0.55, 0.0);
      }
    `,
  });
  const drops = new THREE.Mesh(dropGeo, dropMat);
  drops.frustumCulled = false;
  drops.renderOrder = 20;
  drops.name = 'rain';

  // ---- the splashes ----
  const splashGeo = quadGeometry(MAX_SPLASH, [['seed', 4, (a, o) => {
    a[o] = Math.random();
    a[o + 1] = Math.random();
    a[o + 2] = Math.random();
    a[o + 3] = Math.random();
  }]]);
  const splashMat = new THREE.ShaderMaterial({
    ...BLEND,
    uniforms: { ...common, uArea: { value: 34 } },
    vertexShader: /* glsl */ `
      attribute vec4 seed;
      uniform float uArea;
      varying float vA;
      varying float vAge;
      varying vec2 vQ;
      ${HEAD}
      vec2 hash22(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.xx + p3.yz) * p3.zy);
      }
      void main() {
        float T = 0.5 + 0.4 * seed.w;
        float tt = uTime / T + seed.z * 17.0;
        float cycle = floor(tt);
        vAge = fract(tt);
        vec2 c = cameraPosition.xz - uArea * 0.5;
        vec2 xz = mod((seed.xy + hash22(vec2(cycle, seed.w * 91.7))) * uArea - c, vec2(uArea)) + c;
        float top = rainTop(xz);
        vec3 p = vec3(xz, top + 0.015);
        float dist = distance(p, cameraPosition);
        float s = (0.05 + 0.1 * seed.w) * (0.6 + 0.4 * uRain);
        vA = step(-1e3, top) * (1.0 - underUmbrella(p + vec3(0.0, 0.05, 0.0))) * (1.0 - smoothstep(uArea * 0.3, uArea * 0.48, dist));
        vA *= step(abs(top - cameraPosition.y), 12.0);
        vQ = position.xy * 2.0 - vec2(0.0, 1.0);
        vec3 pos = p + vec3(position.x * s, 0.0, (position.y * 2.0 - 1.0) * s);
        gl_Position = projectionMatrix * viewMatrix * vec4(pos, 1.0);
        if (vA < 0.01) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vA;
      varying float vAge;
      varying vec2 vQ;
      ${FRAG_HEAD}
      void main() {
        float d = length(vQ);
        float r = 0.15 + 0.8 * sqrt(vAge);
        float ring = smoothstep(0.16, 0.0, abs(d - r)) * (1.0 - vAge);
        float hit = smoothstep(0.35, 0.0, d) * smoothstep(0.25, 0.0, vAge) * 1.5;
        float a = (ring + hit) * vA;
        if (a < 0.003) discard;
        gl_FragColor = vec4(rainColor() * a * 0.5, 0.0);
      }
    `,
  });
  const splashes = new THREE.Mesh(splashGeo, splashMat);
  splashes.frustumCulled = false;
  splashes.renderOrder = 19;
  splashes.name = 'rainSplash';

  let density = 1; // (fewer drops on the light quality setting)
  const group = new THREE.Group();
  group.name = 'rainfall';
  group.add(drops, splashes);
  group.userData = {
    setDensity(k) {
      density = k;
    },
    // umbrella: { x, top, low, z, r } of the canopy over her, or null; wind: (x, z) m/s
    update(dt, umbrella, windX = 0.9, windZ = 0.35) {
      const r = G.uRain.value;
      fall.x += windX * dt;
      fall.y += (1 + 0.15 * r) * dt;
      fall.z += windZ * dt;
      dropGeo.instanceCount = Math.round(MAX_DROPS * Math.min(1, r * 1.1) * density);
      splashGeo.instanceCount = Math.round(MAX_SPLASH * Math.min(1, r * 1.1) * density);
      group.visible = r > 0.003;
      if (umbrella) {
        umb.set(umbrella.x, umbrella.top, umbrella.z, umbrella.r);
        umbLow.value = umbrella.low;
      } else umb.w = 0;
      wind.set(windX, windZ);
    },
  };
  group.visible = false;
  return group;
}

