import * as THREE from 'three';
import { NOISE, LINES, PATTERNS, LIGHTING } from './glsl.js';

// Global uniforms shared by reference across every material; the time-of-day
// system writes into these once per frame.
export const G = {
  uTime: { value: 0 },
  uSunDir: { value: new THREE.Vector3(0.2, 0.8, 0.5).normalize() },
  uSunColor: { value: new THREE.Color(0.66, 0.6, 0.42) },
  uSkyAmb: { value: new THREE.Color(0.46, 0.52, 0.78) },
  uGroundAmb: { value: new THREE.Color(0.42, 0.4, 0.42) },
  uHazeColor: { value: new THREE.Color(0.7, 0.82, 0.93) },
  uSunGlow: { value: new THREE.Color(0.3, 0.25, 0.15) },
  uHazeDensity: { value: 0.0016 },
  uNight: { value: 0 },
  uZenith: { value: new THREE.Color(0.1, 0.25, 0.75) },
  uHorizon: { value: new THREE.Color(0.65, 0.8, 0.95) },
  uCloudLit: { value: new THREE.Color(1, 1, 1) },
  uCloudShade: { value: new THREE.Color(0.6, 0.65, 0.85) },
  uStars: { value: 0 },
  uMoonDir: { value: new THREE.Vector3(-0.3, 0.5, 0.4).normalize() },
  uSunDisk: { value: 1 },
  uWaterDeep: { value: new THREE.Color(0.02, 0.18, 0.4) },
  uWaterShallow: { value: new THREE.Color(0.1, 0.55, 0.6) },
  uTide: { value: 0 },
  uWind: { value: new THREE.Vector2(0.8, 0.3) },
};

const VERT_COMMON = /* glsl */ `
#include <common>
#include <shadowmap_pars_vertex>
attribute float pattern;
varying vec3 vColor;
varying vec2 vUv;
varying float vPattern;
varying vec3 vWorldPos;
varying vec3 vNormalW;
`;

const VERT_MAIN = /* glsl */ `
  #include <beginnormal_vertex>
  #include <defaultnormal_vertex>
  #include <begin_vertex>
  #include <project_vertex>
  #include <worldpos_vertex>
  #include <shadowmap_vertex>
  vec4 wpos = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    wpos = instanceMatrix * wpos;
  #endif
  wpos = modelMatrix * wpos;
  vWorldPos = wpos.xyz;
  vNormalW = normalize((vec4(transformedNormal, 0.0) * viewMatrix).xyz);
  #ifdef USE_COLOR
    vColor = color;
  #else
    vColor = vec3(1.0);
  #endif
  #ifdef USE_INSTANCING_COLOR
    vColor *= instanceColor;
  #endif
  vUv = uv;
  vPattern = pattern;
`;

const FRAG_HEAD = /* glsl */ `
#include <common>
#include <packing>
#include <lights_pars_begin>
#include <shadowmap_pars_fragment>
#include <shadowmask_pars_fragment>
${NOISE}
${LINES}
${LIGHTING}
uniform float uOutline;
uniform float uSoft;
uniform float uWrap;
varying vec3 vColor;
varying vec2 vUv;
varying float vPattern;
varying vec3 vWorldPos;
varying vec3 vNormalW;
`;

function lightsUniforms() {
  return THREE.UniformsUtils.clone(THREE.UniformsLib.lights);
}

function makeUniforms(extra = {}) {
  const u = lightsUniforms();
  Object.assign(u, G);
  u.uOutline = { value: 1 };
  u.uSoft = { value: 0.03 };
  u.uWrap = { value: 0.0 };
  Object.assign(u, extra);
  return u;
}

// ---------------------------------------------------------------------------
// Main toon material (vertex colored, procedural patterns)
// ---------------------------------------------------------------------------
export function createToonMaterial(opts = {}) {
  const defines = {};
  if (opts.map) defines.USE_TEXMAP = '';
  if (opts.alphaTest) defines.ALPHA_TEST = opts.alphaTest.toFixed(3);
  if (opts.emissiveFlag || opts.emissiveAll) defines.EMISSIVE_FLAG = '';
  if (opts.emissiveAll) defines.EMISSIVE_ALL = '';
  if (opts.noPattern) defines.NO_PATTERN = '';
  const uniforms = makeUniforms({
    map: { value: opts.map || null },
  });
  uniforms.uOutline.value = opts.outline ?? 1;
  uniforms.uSoft.value = opts.soft ?? 0.03;
  uniforms.uWrap.value = opts.wrap ?? 0.0;

  const mat = new THREE.ShaderMaterial({
    name: opts.name || 'toon',
    lights: true,
    vertexColors: true,
    defines,
    uniforms,
    side: opts.side ?? THREE.FrontSide,
    vertexShader: /* glsl */ `
      ${VERT_COMMON}
      void main() {
        ${VERT_MAIN}
      }
    `,
    fragmentShader: /* glsl */ `
      ${FRAG_HEAD}
      ${PATTERNS}
      #ifdef USE_TEXMAP
        uniform sampler2D map;
      #endif
      void main() {
        vec3 albedo = vColor;
        float emis = 0.0;
        #ifdef EMISSIVE_FLAG
          #ifdef EMISSIVE_ALL
            emis = 1.0;
          #else
            emis = vPattern;
          #endif
        #endif
        #ifdef USE_TEXMAP
          vec4 tx = texture2D(map, vUv);
          #ifdef ALPHA_TEST
            if (tx.a < ALPHA_TEST) discard;
          #endif
          albedo *= tx.rgb;
        #else
          #ifndef NO_PATTERN
            albedo = applyPattern(albedo, vPattern, vUv, vWorldPos, vNormalW);
          #endif
        #endif
        vec3 N = normalize(vNormalW);
        if (!gl_FrontFacing) N = -N;
        float sh = getShadowMask();
        vec3 col = toonShade(albedo, N, sh, uSoft, uWrap);
        #ifdef EMISSIVE_FLAG
          // emis: 0 = none, 0..1 = glows at night (signs), >1 = always glowing (vending machines)
          float glow = emis > 1.5 ? (0.55 + 0.9 * uNight) : emis * uNight * 1.2;
          col = mix(col, albedo * (1.0 + 0.6 * uNight), clamp(glow, 0.0, 1.0));
          col += albedo * max(glow - 1.0, 0.0) * 0.8;
        #endif
        col = applyHaze(col, vWorldPos);
        gl_FragColor = vec4(col, uOutline);
      }
    `,
  });
  return mat;
}

// ---------------------------------------------------------------------------
// Windows: sky reflections, curtains, highlight streaks, lit interiors at night
// uv = 0..1 inside the pane, pattern = seed (0..255)
// ---------------------------------------------------------------------------
export function createWindowMaterial() {
  const uniforms = makeUniforms();
  uniforms.uOutline.value = 0.8;
  return new THREE.ShaderMaterial({
    name: 'window',
    lights: true,
    vertexColors: true,
    uniforms,
    vertexShader: /* glsl */ `
      ${VERT_COMMON}
      void main() {
        ${VERT_MAIN}
      }
    `,
    fragmentShader: /* glsl */ `
      ${FRAG_HEAD}
      uniform vec3 uZenith;
      uniform vec3 uHorizon;
      uniform vec3 uCloudLit;
      void main() {
        float seed = vPattern / 255.0;
        vec2 uv = vUv;
        vec3 N = normalize(vNormalW);
        vec3 V = normalize(cameraPosition - vWorldPos);
        float sh = getShadowMask();
        // reflected sky gradient (darker toward the bottom like a painted window)
        vec3 refl = mix(uHorizon * 0.55 + vec3(0.03, 0.04, 0.06), uZenith * 0.75 + uHorizon * 0.25, smoothstep(0.0, 1.0, uv.y));
        refl = mix(refl * 0.55, refl, 0.35 + 0.65 * sh);
        // interior color: dark blue-grey
        vec3 inside = vec3(0.08, 0.1, 0.14);
        float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 2.0);
        vec3 glass = mix(inside, refl, 0.55 + 0.4 * fres);
        // curtains by seed
        float kind = fract(seed * 7.13);
        vec3 curtainCol = mix(vec3(0.92, 0.88, 0.8), vec3(0.75, 0.82, 0.9), fract(seed * 3.7));
        if (fract(seed * 11.0) > 0.7) curtainCol = vec3(0.95, 0.8, 0.78);
        float curtain = 0.0;
        if (kind < 0.35) {
          // two drawn curtains at the sides
          float w = 0.18 + 0.2 * fract(seed * 5.3);
          curtain = 1.0 - smoothstep(w - 0.01, w + 0.01, min(uv.x, 1.0 - uv.x));
        } else if (kind < 0.55) {
          // lace curtain: soft and translucent
          curtain = 0.55;
        } else if (kind < 0.68) {
          // blinds
          curtain = 0.75 * (0.6 + 0.4 * step(0.5, fract(uv.y * 14.0)));
          curtainCol = vec3(0.86, 0.86, 0.82);
        } else if (kind < 0.76) {
          // frosted glass (bathroom)
          curtain = 0.85;
          curtainCol = vec3(0.78, 0.82, 0.86);
        }
        if (vPattern > 99.5 && vPattern < 149.5) {
          // office ribbon glazing: one pane per floor and face; pane size (m) comes in the vertex color
          float Wm = max(vColor.r * 64.0, 0.5), Hm = max(vColor.g * 8.0, 0.5);
          float nb = max(1.0, floor(Wm / 1.3 + 0.5));
          float bx = uv.x * nb;
          float bay = floor(bx);
          float fx = fract(bx);
          float my = uv.y * Hm;
          float aw = fwidth(bx) + 1e-4;
          float mw = 0.035 / (Wm / nb);
          float mull = 1.0 - smoothstep(mw, mw + aw, min(fx, 1.0 - fx));
          float tr = 1.0 - smoothstep(0.03, 0.03 + fwidth(my) + 1e-4, abs(my - (Hm - 0.5)));
          float rnd = hash12(vec2(bay, floor(vWorldPos.y / 3.0)) + seed * 17.0);
          vec3 inside2 = vec3(0.12, 0.15, 0.19);
          // ceiling light rows seen through the glass
          float ceil = smoothstep(Hm - 0.35, Hm - 0.25, my) * (1.0 - smoothstep(Hm - 0.12, Hm - 0.05, my));
          inside2 += vec3(0.5, 0.55, 0.6) * ceil * step(0.5, fract(fx * 2.0 + rnd));
          // blinds pulled down to random heights
          float blind = step(my, Hm) * step(Hm * (1.0 - rnd * 0.8) - 0.2, my);
          vec3 blindCol = vec3(0.82, 0.8, 0.74) * (0.85 + 0.15 * step(0.5, fract(my * 12.0)));
          vec3 refl2 = mix(uHorizon * 0.6 + vec3(0.04, 0.05, 0.07), uZenith * 0.7 + uHorizon * 0.3, clamp((vWorldPos.y - 3.0) / 30.0, 0.0, 1.0));
          refl2 = mix(refl2 * 0.6, refl2, 0.3 + 0.7 * sh);
          vec3 c3 = mix(inside2, blindCol * mix(uSkyAmb, uSkyAmb + uSunColor, 0.5 * sh + 0.2), blind * 0.85);
          c3 = mix(c3, refl2, 0.35 + 0.45 * fres);
          // night: about half of the bays lit
          float litO = step(0.45, fract(rnd * 7.31)) * uNight;
          c3 = mix(c3, mix(vec3(0.95, 0.97, 1.0), vec3(1.0, 0.9, 0.72), step(0.7, rnd)) * (1.2 - blind * 0.4), litO * 0.85);
          float st2 = smoothstep(0.06, 0.0, abs(fract((vWorldPos.x + vWorldPos.z) * 0.08 + vWorldPos.y * 0.05 + seed) - 0.3) - 0.03);
          c3 += st2 * uHorizon * 0.18 * (1.0 - uNight);
          c3 = mix(c3, vec3(0.32, 0.34, 0.37) * (0.6 + 0.4 * sh), max(mull, tr));
          c3 = applyHaze(c3, vWorldPos);
          gl_FragColor = vec4(c3, uOutline);
          return;
        }
        if (vPattern > 149.5 && vPattern < 199.5) {
          // shop front: lit interior with shelves of goods behind the glass
          vec2 q = uv * vec2(6.0, 4.0);
          float shelf = step(0.82, fract(q.y));
          float item = hash12(floor(q * vec2(3.0, 1.0)) + seed * 37.0);
          vec3 goods = mix(vec3(0.95, 0.85, 0.6), vec3(0.6, 0.75, 0.95), item);
          goods = mix(goods, vec3(0.95, 0.55, 0.5), step(0.7, item));
          vec3 interior = mix(vec3(0.42, 0.38, 0.34), goods * 0.75, step(0.25, fract(q.x + item)) * (1.0 - shelf) * step(0.2, uv.y) * step(uv.y, 0.85));
          interior *= 0.9 + 0.5 * uNight;
          vec3 c2 = mix(interior, refl, 0.18 + 0.4 * fres);
          float st = smoothstep(0.06, 0.0, abs(fract((uv.x + uv.y * 0.5) * 1.4 + seed) - 0.3) - 0.03);
          c2 += st * uHorizon * 0.25;
          c2 = applyHaze(c2, vWorldPos);
          gl_FragColor = vec4(c2, uOutline);
          return;
        }
        if (vPattern > 235.5) {
          // vehicle glass: clear, with seat backs and a bright far window
          curtain = 0.0;
          float seats = step(uv.y, 0.42) * (0.6 + 0.4 * step(0.5, fract(uv.x * 5.0)));
          glass = mix(glass, vec3(0.32, 0.42, 0.52), 0.25);
          glass = mix(glass, vec3(0.28, 0.45, 0.62), seats * 0.7);
          glass = mix(glass, uHorizon * 0.8, smoothstep(0.55, 0.95, uv.y) * 0.35);
        }
        float shade = 0.6 + 0.4 * sh;
        vec3 col = mix(glass, curtainCol * mix(uSkyAmb * 1.2, uSkyAmb + uSunColor, 0.5 * shade), curtain * (1.0 - fres * 0.5));
        // diagonal highlight streaks
        float sx = uv.x + uv.y * 0.55 + seed * 3.0;
        float streak = smoothstep(0.08, 0.0, abs(fract(sx * 0.9) - 0.35) - 0.04) * 0.6;
        streak += smoothstep(0.03, 0.0, abs(fract(sx * 0.9) - 0.5) - 0.01) * 0.4;
        col += streak * uHorizon * 0.35 * (1.0 - curtain * 0.7) * (0.4 + 0.6 * sh) * (1.0 - uNight * 0.8);
        // night: some windows glow warm (never vehicle glass)
        float lit = step(fract(seed * 13.7), 0.55) * uNight * step(vPattern, 235.5);
        vec3 warm = mix(vec3(1.0, 0.72, 0.4), vec3(1.0, 0.86, 0.66), fract(seed * 2.9));
        vec3 litCol = warm * (curtain > 0.0 ? mix(1.3, 0.9, curtain) : 1.1);
        // silhouettes of furniture / curtain folds
        litCol *= 0.8 + 0.2 * sin(uv.x * 18.0 + seed * 20.0);
        col = mix(col, litCol * 1.6, lit);
        col = applyHaze(col, vWorldPos);
        #ifdef BLEND
          gl_FragColor = vec4(col, tx.a);
        #else
          gl_FragColor = vec4(col, uOutline);
        #endif
      }
    `,
  });
}

// ---------------------------------------------------------------------------
// Ground (terrain) material: reads a painted ground map (rgb color + alpha type)
// ---------------------------------------------------------------------------
export function createGroundMaterial(groundMap, mapRect) {
  const uniforms = makeUniforms({
    groundMap: { value: groundMap },
    uMapRect: { value: mapRect }, // x0, z0, width, depth
    uMapSize: { value: new THREE.Vector2(groundMap.image.width, groundMap.image.height) },
  });
  uniforms.uOutline.value = 0.55;
  return new THREE.ShaderMaterial({
    name: 'ground',
    lights: true,
    vertexColors: true,
    uniforms,
    vertexShader: /* glsl */ `
      ${VERT_COMMON}
      void main() {
        ${VERT_MAIN}
      }
    `,
    fragmentShader: /* glsl */ `
      ${FRAG_HEAD}
      ${PATTERNS}
      uniform sampler2D groundMap;
      uniform vec4 uMapRect;
      uniform vec2 uMapSize;
      uniform float uTide;
      void main() {
        vec2 muv = (vWorldPos.xz - uMapRect.xy) / uMapRect.zw;
        vec3 albedo = vColor;
        float pat = vPattern;
        if (muv.x > 0.0 && muv.x < 1.0 && muv.y > 0.0 && muv.y < 1.0) {
          float typ = texelFetch(groundMap, ivec2(muv * uMapSize), 0).a * 255.0;
          if (typ > 0.5) {
            albedo = texture2D(groundMap, muv).rgb;
            pat = floor(typ + 0.5) - 1.0;
          }
        }
        albedo = applyPattern(albedo, pat, vWorldPos.xz, vWorldPos, vNormalW);
        // wet sand near the waterline
        float wet = 1.0 - smoothstep(uTide + 0.05, uTide + 0.45, vWorldPos.y);
        wet *= step(vWorldPos.y, 2.0);
        albedo *= mix(1.0, 0.72, wet);
        vec3 N = normalize(vNormalW);
        float sh = getShadowMask();
        vec3 col = toonShade(albedo, N, sh, uSoft, uWrap);
        col = applyHaze(col, vWorldPos);
        #ifdef BLEND
          gl_FragColor = vec4(col, tx.a);
        #else
          gl_FragColor = vec4(col, uOutline);
        #endif
      }
    `,
  });
}

// ---------------------------------------------------------------------------
// Roads: procedural markings from uv (u across in meters, v along in meters)
// pattern encodes the road style.
// ---------------------------------------------------------------------------
export function createRoadMaterial() {
  const uniforms = makeUniforms();
  uniforms.uOutline.value = 0.5;
  return new THREE.ShaderMaterial({
    name: 'road',
    lights: true,
    vertexColors: true,
    uniforms,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    vertexShader: /* glsl */ `
      ${VERT_COMMON}
      void main() {
        ${VERT_MAIN}
      }
    `,
    fragmentShader: /* glsl */ `
      ${FRAG_HEAD}
      ${PATTERNS}
      // band helper: 1 inside [a,b] across u, anti-aliased
      float band(float u, float a, float b) {
        float fw = max(fwidth(u), 1e-4);
        return smoothstep(a - fw, a + fw, u) * (1.0 - smoothstep(b - fw, b + fw, u));
      }
      void main() {
        int style = int(vPattern + 0.5);
        float u = vUv.x;      // meters from the left edge
        float v = vUv.y;      // meters along
        float W = vColor.r;   // road width encoded in color.r * 20
        W *= 20.0;
        vec3 asphalt = vec3(0.36, 0.37, 0.4);
        vec3 albedo = applyPattern(asphalt, 6.0, vUv, vWorldPos, vNormalW);
        vec3 white = vec3(0.93, 0.93, 0.9);
        vec3 yellow = vec3(0.98, 0.72, 0.12);
        vec3 green = vec3(0.32, 0.62, 0.42);
        float wear = 0.75 + 0.25 * vnoise(vWorldPos.xz * 1.7);
        if (style == 1) {
          // narrow residential lane: white edge lines + concrete gutters
          float gut = 1.0 - band(u, 0.32, W - 0.32);
          albedo = mix(albedo, vec3(0.62, 0.62, 0.6) * (0.92 + 0.1 * vnoise(vWorldPos.xz * 3.0)), gut);
          albedo *= 1.0 - 0.25 * gut * aaLines(v, 0.6, 0.02);
          float e = band(u, 0.45, 0.6) + band(u, W - 0.6, W - 0.45);
          albedo = mix(albedo, white, e * wear);
        } else if (style == 2) {
          // two lane road with dashed white center + green pedestrian strips
          float gut = 1.0 - band(u, 0.3, W - 0.3);
          albedo = mix(albedo, vec3(0.62, 0.62, 0.6), gut);
          float gs = band(u, 0.3, 1.25) + band(u, W - 1.25, W - 0.3);
          albedo = mix(albedo, green * (0.9 + 0.1 * vnoise(vWorldPos.xz * 2.0)), gs * 0.92);
          float e = band(u, 1.25, 1.4) + band(u, W - 1.4, W - 1.25);
          albedo = mix(albedo, white, e * wear);
          float dash = step(fract(v / 9.0), 0.55);
          float c = band(u, W * 0.5 - 0.07, W * 0.5 + 0.07) * dash;
          albedo = mix(albedo, white, c * wear);
        } else if (style == 3) {
          // coastal main road: yellow center line, white edges
          float e = band(u, 0.25, 0.4) + band(u, W - 0.4, W - 0.25);
          albedo = mix(albedo, white, e * wear);
          float c = band(u, W * 0.5 - 0.2, W * 0.5 - 0.06) + band(u, W * 0.5 + 0.06, W * 0.5 + 0.2);
          albedo = mix(albedo, yellow, c * wear);
        } else if (style == 4) {
          // plain intersection asphalt
        } else if (style == 5) {
          // zebra crosswalk (stripes across u)
          float s = step(0.5, fract(u / 0.9 + 0.25));
          float inb = band(v, 0.0, 3.6);
          albedo = mix(albedo, white, s * inb * wear);
        } else if (style == 6) {
          // shotengai colored paving
          vec3 a = vec3(0.6, 0.53, 0.46);
          vec3 b = vec3(0.44, 0.37, 0.36);
          float row = floor(v / 0.3);
          float ux = u + mod(row, 2.0) * 0.3;
          float cell = hash12(vec2(floor(ux / 0.6), row));
          vec3 pv = mix(a, b, step(0.7, cell));
          float stripe = band(u, W * 0.5 - 0.9, W * 0.5 + 0.9);
          pv = mix(pv, vec3(0.66, 0.6, 0.52), stripe * 0.6);
          float l = max(aaLines(v, 0.3, 0.012), aaLines(ux, 0.6, 0.012));
          pv *= 1.0 - 0.16 * l;
          pv *= 0.95 + 0.08 * vnoise(vWorldPos.xz * 0.8);
          albedo = pv;
          // tactile strip
          float ts = band(u, 0.6, 0.9);
          albedo = mix(albedo, yellow * 0.95, ts);
        } else if (style == 7) {
          // sidewalk pavers
          albedo = applyPattern(vec3(0.74, 0.72, 0.7), 22.0, vUv, vWorldPos, vNormalW);
        } else if (style == 8) {
          // rail level crossing: dark rubber panels with white edge
          albedo = vec3(0.24, 0.24, 0.26) * (0.9 + 0.1 * vnoise(vWorldPos.xz * 4.0));
          float l = aaLines(u, 1.0, 0.03);
          albedo *= 1.0 - 0.35 * l;
        } else if (style == 9) {
          // promenade: warm stone tiles
          albedo = applyPattern(vec3(0.6, 0.55, 0.49), 16.0, vUv * 2.0, vWorldPos, vNormalW);
        } else if (style == 10) {
          // riverside path: warm permeable paving with granite edge bands
          vec3 earth = vec3(0.72, 0.64, 0.52) * (0.93 + 0.1 * vnoise(vWorldPos.xz * 0.9));
          float speck = step(0.82, hash12(floor(vWorldPos.xz * 22.0)));
          earth *= 1.0 - 0.12 * speck;
          vec3 granite = applyPattern(vec3(0.66, 0.65, 0.62), 22.0, vUv * 1.5, vWorldPos, vNormalW);
          float edge = 1.0 - band(u, 0.55, W - 0.55);
          albedo = mix(earth, granite, edge);
          // tree pit grates every few meters are drawn as geometry; faint wheel ruts here
          albedo *= 1.0 - 0.05 * band(u, W * 0.5 - 0.9, W * 0.5 - 0.6) - 0.05 * band(u, W * 0.5 + 0.6, W * 0.5 + 0.9);
        } else if (style == 11) {
          // four-lane avenue: white edges, dashed lane lines, yellow center
          float e = band(u, 0.3, 0.45) + band(u, W - 0.45, W - 0.3);
          albedo = mix(albedo, white, e * wear);
          float dash = step(fract(v / 10.0), 0.5);
          float l = band(u, W * 0.25 - 0.07, W * 0.25 + 0.07) + band(u, W * 0.75 - 0.07, W * 0.75 + 0.07);
          albedo = mix(albedo, white, l * dash * wear);
          float c = band(u, W * 0.5 - 0.2, W * 0.5 - 0.07) + band(u, W * 0.5 + 0.07, W * 0.5 + 0.2);
          albedo = mix(albedo, yellow, c * wear);
        } else if (style == 12) {
          // urban two-lane street: white edges + dashed center
          float e = band(u, 0.25, 0.4) + band(u, W - 0.4, W - 0.25);
          albedo = mix(albedo, white, e * wear);
          float dash = step(fract(v / 8.0), 0.5);
          albedo = mix(albedo, white, band(u, W * 0.5 - 0.07, W * 0.5 + 0.07) * dash * wear);
        } else if (style == 13) {
          // city sidewalk: two-tone interlocking blocks with a tactile strip
          float row = floor(v / 0.2);
          float ux = u + mod(row, 2.0) * 0.1;
          float cell = hash12(vec2(floor(ux / 0.2), row));
          vec3 pv = mix(vec3(0.7, 0.68, 0.64), vec3(0.62, 0.5, 0.44), step(0.72, cell));
          pv *= 1.0 - 0.14 * max(aaLines(v, 0.2, 0.012), aaLines(ux, 0.2, 0.012));
          pv *= 0.95 + 0.08 * vnoise(vWorldPos.xz * 0.7);
          albedo = pv;
          float ts = band(u, W * 0.5 - 0.15, W * 0.5 + 0.15);
          albedo = mix(albedo, yellow * 0.92, ts * 0.9);
        }
        vec3 N = normalize(vNormalW);
        float sh = getShadowMask();
        vec3 col = toonShade(albedo, N, sh, uSoft, uWrap);
        col = applyHaze(col, vWorldPos);
        #ifdef BLEND
          gl_FragColor = vec4(col, tx.a);
        #else
          gl_FragColor = vec4(col, uOutline);
        #endif
      }
    `,
  });
}

// ---------------------------------------------------------------------------
// River water: clear, shallow and flowing toward the sea, with drifting sakura
// petals (花筏), foam on the weirs and shadows from banks, bridges and trees.
// color.r = foam, color.g = flow speed scale, color.b = 0 at the walls .. 1 mid-channel
// ---------------------------------------------------------------------------
export function createRiverWaterMaterial() {
  const uniforms = makeUniforms();
  return new THREE.ShaderMaterial({
    name: 'river',
    lights: true,
    vertexColors: true,
    transparent: true,
    depthWrite: true,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.SrcAlphaFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.ZeroFactor,
    blendDstAlpha: THREE.ZeroFactor,
    uniforms,
    vertexShader: /* glsl */ `
      ${VERT_COMMON}
      void main() {
        ${VERT_MAIN}
      }
    `,
    fragmentShader: /* glsl */ `
      ${FRAG_HEAD}
      uniform vec3 uZenith;
      uniform vec3 uHorizon;
      void main() {
        vec2 p = vWorldPos.xz;
        float t = uTime;
        float speed = 0.45 + 0.9 * vColor.g;
        float along = p.y - t * speed;
        vec3 V = normalize(cameraPosition - vWorldPos);
        // flowing ripples (stretched across the current)
        vec2 q = vec2(p.x * 0.8, along * 0.45);
        float nx = vnoise(q * 1.3) - 0.5 + (vnoise(q * 3.3 + 7.1) - 0.5) * 0.5;
        float nz = vnoise(q * 1.6 + 3.3) - 0.5 + (vnoise(q * 3.9 + 1.7) - 0.5) * 0.5;
        vec3 N = normalize(vec3(nx * 0.22, 1.0, nz * 0.22));
        float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
        vec3 R = reflect(-V, N);
        vec3 sky = mix(uHorizon, uZenith, pow(clamp(R.y, 0.0, 1.0), 0.5));
        float sh = getShadowMask();
        float mid = vColor.b;
        // clear green water: the pebbly bed shows through the shallows
        vec3 shallow = vec3(0.3, 0.44, 0.38);
        vec3 deep = vec3(0.1, 0.24, 0.27);
        vec3 body = mix(shallow, deep, smoothstep(0.0, 1.0, mid));
        body *= mix(uSkyAmb * 1.05, uSkyAmb + uSunColor, 0.3 + 0.7 * sh);
        vec3 col = mix(body, sky * (0.55 + 0.45 * sh), 0.08 + 0.42 * fres);
        // painted ripple strokes drifting downstream
        vec3 lift = vec3(0.2, 0.22, 0.22) * (0.4 + 0.6 * sh) * (1.0 - uNight * 0.6);
        col += lift * 0.5;
        // thin light strokes on noise iso-lines, broken into short dashes
        // (whole iso-lines over the wide mouth would read as a contour map)
        float rip = vnoise(vec2(p.x * 0.32, along * 0.85));
        float stroke = smoothstep(0.45, 0.49, abs(fract(rip * 5.0) - 0.5));
        stroke *= smoothstep(0.45, 0.7, vnoise(vec2(p.x * 1.3, along * 2.2) + 4.7));
        col += lift * stroke * 0.6;
        // 花筏: petals drifting with the current, gathering into rafts near the banks
        vec2 pc = vec2(p.x * 3.4, along * 3.4);
        vec2 cell = floor(pc);
        float h = hash12(cell);
        float raft = smoothstep(0.52, 0.8, vnoise(vec2(p.x * 0.2, along * 0.1)) + (1.0 - mid) * 0.2);
        float dens = mix(0.965, 0.55, raft);
        vec2 off = vec2(hash12(cell + 3.1), hash12(cell + 7.7)) - 0.5;
        float ang = hash12(cell + 11.3) * 6.2832;
        vec2 lp = fract(pc) - 0.5 - off * 0.45;
        lp = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * lp;
        float petal = step(dens, h) * smoothstep(0.17, 0.12, length(lp * vec2(1.0, 1.55)));
        vec3 petalCol = mix(vec3(1.0, 0.72, 0.82), vec3(1.0, 0.88, 0.92), hash12(cell + 5.5));
        petalCol *= mix(uSkyAmb * 1.15, uSkyAmb + uSunColor, 0.35 + 0.65 * sh);
        col = mix(col, petalCol, petal * 0.95);
        // white water on the weirs: streaks running with the flow
        float streaks = vnoise(vec2(p.x * 2.4, p.y * 0.35 - t * 1.6)) * 0.65 + vnoise(vec2(p.x * 6.0, p.y * 1.1 - t * 3.0)) * 0.35;
        float foam = clamp(vColor.r * smoothstep(0.42, 0.82, streaks), 0.0, 0.88);
        col = mix(col, col * 1.25 + vec3(0.06), vColor.r * 0.5); // aerated water on the slope
        foam = max(foam, smoothstep(0.08, 0.0, mid) * smoothstep(0.6, 0.85, vnoise(p * 2.2 - vec2(0.0, t))) * 0.45);
        col = mix(col, vec3(0.94, 0.97, 1.0) * mix(uSkyAmb * 1.25, uSkyAmb + uSunColor, 0.4 + 0.6 * sh), foam);
        // sun glitter
        float sd = max(dot(R, uSunDir), 0.0);
        col += (uSunColor * 1.5 + uSunGlow) * pow(sd, 140.0) * 1.6 * sh * (1.0 - uNight);
        col = applyHaze(col, vWorldPos);
        float alpha = mix(0.5, 0.82, mid) + 0.15 * fres;
        alpha = max(alpha, max(foam, petal * 0.95));
        gl_FragColor = vec4(col, alpha);
      }
    `,
  });
}

// ---------------------------------------------------------------------------
// Interiors: lit by ceiling lights instead of the sun (shops, stations, the
// subway). Same vertex colors / patterns as the toon material.
// ---------------------------------------------------------------------------
export function createInteriorMaterial(opts = {}) {
  const defines = {};
  if (opts.map) defines.USE_TEXMAP = '';
  if (opts.alphaTest) defines.ALPHA_TEST = opts.alphaTest.toFixed(3);
  if (opts.emissiveFlag) defines.EMISSIVE_FLAG = '';
  const uniforms = makeUniforms({ map: { value: opts.map || null }, uLight: { value: new THREE.Color(opts.light ?? 0xfff8ee) } });
  uniforms.uOutline.value = opts.outline ?? 0.85;
  return new THREE.ShaderMaterial({
    name: opts.name || 'interior',
    lights: true,
    vertexColors: true,
    defines,
    uniforms,
    side: opts.side ?? THREE.FrontSide,
    vertexShader: /* glsl */ `
      ${VERT_COMMON}
      void main() {
        ${VERT_MAIN}
      }
    `,
    fragmentShader: /* glsl */ `
      ${FRAG_HEAD}
      ${PATTERNS}
      uniform vec3 uLight;
      #ifdef USE_TEXMAP
        uniform sampler2D map;
      #endif
      void main() {
        vec3 albedo = vColor;
        float emis = 0.0;
        #ifdef USE_TEXMAP
          vec4 tx = texture2D(map, vUv);
          #ifdef ALPHA_TEST
            if (tx.a < ALPHA_TEST) discard;
          #endif
          albedo *= tx.rgb;
          #ifdef EMISSIVE_FLAG
            emis = vPattern;
          #endif
        #else
          albedo = applyPattern(albedo, vPattern, vUv, vWorldPos, vNormalW);
        #endif
        vec3 N = normalize(vNormalW);
        if (!gl_FrontFacing) N = -N;
        // soft top light with a painted two-tone step on faces turned away from it
        vec3 Ld = normalize(vec3(0.35, 0.85, 0.4));
        float ndl = dot(N, Ld);
        float lit = mix(0.74, 1.0, smoothstep(-0.12, 0.12, ndl));
        float up = N.y * 0.5 + 0.5;
        vec3 col = albedo * uLight * lit * (0.82 + 0.22 * up);
        // ceilings slightly cooler / darker, like light bouncing from the floor
        col *= mix(vec3(1.0), vec3(0.86, 0.88, 0.95), smoothstep(-0.6, -0.95, N.y));
        col = mix(col, albedo * 1.25, clamp(emis, 0.0, 1.0));
        col = applyHaze(col, vWorldPos);
        #ifdef BLEND
          gl_FragColor = vec4(col, tx.a);
        #else
          gl_FragColor = vec4(col, uOutline);
        #endif
      }
    `,
  });
}

// ---------------------------------------------------------------------------
// Clear glass (shop fronts, doors): sky reflection over a see-through pane.
// Keeps the outline mask of whatever is behind it.
// ---------------------------------------------------------------------------
export function createGlassMaterial() {
  const uniforms = makeUniforms();
  return new THREE.ShaderMaterial({
    name: 'glass',
    lights: true,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.SrcAlphaFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.ZeroFactor,
    blendDstAlpha: THREE.OneFactor,
    uniforms,
    vertexShader: /* glsl */ `
      ${VERT_COMMON}
      void main() {
        ${VERT_MAIN}
      }
    `,
    fragmentShader: /* glsl */ `
      ${FRAG_HEAD}
      uniform vec3 uZenith;
      uniform vec3 uHorizon;
      void main() {
        vec3 N = normalize(vNormalW);
        vec3 V = normalize(cameraPosition - vWorldPos);
        if (dot(N, V) < 0.0) N = -N;
        float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.0);
        vec3 refl = mix(uHorizon, uZenith, 0.35 + 0.4 * clamp(vUv.y, 0.0, 1.0));
        // diagonal highlight streaks across the pane
        float sx = vWorldPos.x * 0.37 + vWorldPos.z * 0.37 + vWorldPos.y * 0.55;
        float streak = smoothstep(0.07, 0.0, abs(fract(sx * 0.5) - 0.3) - 0.05) * 0.5 + smoothstep(0.025, 0.0, abs(fract(sx * 0.5) - 0.45) - 0.008) * 0.35;
        vec3 col = mix(vec3(0.82, 0.9, 0.92), refl, 0.6) + streak * 0.35 * (1.0 - uNight * 0.85);
        float a = 0.1 + 0.42 * fres + streak * 0.22;
        a *= 1.0 - 0.55 * uNight;
        col = applyHaze(col, vWorldPos);
        gl_FragColor = vec4(col, a);
      }
    `,
  });
}

// ---------------------------------------------------------------------------
// Foliage: camera-facing cards around canopy blobs. Attributes:
//   position = card center (world), normal = card normal hint (from canopy center),
//   uv = corner (-1..1), color, pattern = size, `rot` packed in uv2? (we use pattern fraction)
// ---------------------------------------------------------------------------
const FOLIAGE_VERT = /* glsl */ `
  attribute vec3 center;    // canopy (tree) center
  attribute vec4 card;      // x,y = corner offset (-1..1), z = size, w = rotation
  #ifndef DEPTH_ONLY
    varying vec3 vColor;
    varying vec2 vUv;
    varying vec3 vWorldPos;
    varying vec3 vNormalW;
    varying float vSeed;
  #endif
  uniform float uTime;
  uniform vec2 uWind;
  vec3 foliagePosition(out vec3 nrm) {
    vec3 wp = (modelMatrix * vec4(position, 1.0)).xyz;
    vec3 cw = (modelMatrix * vec4(center, 1.0)).xyz;
    // gentle sway
    float sway = sin(uTime * 1.3 + wp.x * 0.3 + wp.z * 0.2) * 0.06 + sin(uTime * 2.7 + wp.y) * 0.03;
    wp.xz += uWind * sway * clamp((wp.y - cw.y + 3.0) * 0.25, 0.0, 1.0);
    float c = cos(card.w), s = sin(card.w);
    vec2 off = vec2(card.x * c - card.y * s, card.x * s + card.y * c) * card.z;
    vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    vec3 p = wp + right * off.x + up * off.y;
    // blend clump-level roundness with the canopy-level direction: reads as painted clumps
    nrm = normalize(mix(normalize(p - cw), normal, 0.55));
    return p;
  }
`;

export function createFoliageMaterial(tex, opts = {}) {
  const uniforms = makeUniforms({ map: { value: tex }, uAmbTint: { value: new THREE.Color(opts.ambTint ?? 0xffffff) } });
  uniforms.uOutline.value = opts.outline ?? 0.3;
  uniforms.uSoft.value = opts.soft ?? 0.35;
  uniforms.uWrap.value = opts.wrap ?? 0.1;
  const mat = new THREE.ShaderMaterial({
    name: 'foliage',
    lights: true,
    vertexColors: true,
    uniforms,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      #include <common>
      #include <shadowmap_pars_vertex>
      ${FOLIAGE_VERT}
      void main() {
        vec3 nrm;
        vec3 p = foliagePosition(nrm);
        vec3 objectNormal = nrm;
        vec3 transformedNormal = (viewMatrix * vec4(nrm, 0.0)).xyz;
        vec4 worldPosition = vec4(p, 1.0);
        vec4 mvPosition = viewMatrix * worldPosition;
        gl_Position = projectionMatrix * mvPosition;
        #include <shadowmap_vertex>
        vWorldPos = p;
        vNormalW = nrm;
        vColor = color;
        vUv = card.xy * 0.5 + 0.5;
        vSeed = fract(card.w * 3.17);
      }
    `,
    fragmentShader: /* glsl */ `
      ${FRAG_HEAD.replace('varying float vPattern;', '')}
      uniform sampler2D map;
      uniform vec3 uAmbTint;
      varying float vSeed;
      void main() {
        vec4 t = texture2D(map, vUv);
        if (t.a < 0.5) discard;
        vec3 N = normalize(vNormalW);
        float sh = getShadowMask();
        sh = mix(1.0, sh, 0.8);
        // texture value carries the painted clump shading
        float tv = t.r;
        vec3 albedo = vColor * mix(0.78, 1.06, tv);
        float ndl = dot(N, uSunDir) + (tv - 0.8) * 0.5;
        float lam = smoothstep(-uSoft + uWrap, uSoft + uWrap, ndl);
        float L = lam * sh;
        vec3 amb = mix(uGroundAmb, uSkyAmb, N.y * 0.5 + 0.5) * uAmbTint;
        vec3 col = albedo * (amb + uSunColor * L * 1.04);
        col += albedo * uSunColor * 0.12 * smoothstep(0.5, 0.7, ndl) * sh;
        float band = L * (1.0 - L) * 4.0;
        col += albedo * band * uSunColor * vec3(0.12, 0.04, 0.05);
        // back-lit translucency
        vec3 V = normalize(cameraPosition - vWorldPos);
        float back = pow(max(dot(-V, uSunDir), 0.0), 4.0);
        col += albedo * uSunColor * back * 0.45 * sh;
        col = applyHaze(col, vWorldPos);
        gl_FragColor = vec4(col, uOutline);
      }
    `,
  });
  const depth = new THREE.ShaderMaterial({
    name: 'foliageDepth',
    defines: { DEPTH_ONLY: '' },
    uniforms: { map: { value: tex }, uTime: G.uTime, uWind: G.uWind },
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      ${FOLIAGE_VERT}
      varying vec2 vUv2;
      void main() {
        vec3 nrm;
        vec3 p = foliagePosition(nrm);
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        vUv2 = card.xy * 0.5 + 0.5;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D map;
      varying vec2 vUv2;
      void main() {
        if (texture2D(map, vUv2).a < 0.5) discard;
        gl_FragColor = vec4(1.0);
      }
    `,
  });
  return { material: mat, depth };
}

// Instanced grass tufts (see world/grass.js): crossed blade cards rooted on the
// ground, swaying at the tips, shrinking into the ground with distance.
export function createGrassMaterial(tex, opts = {}) {
  const uniforms = makeUniforms({ map: { value: tex }, uFar: { value: opts.far ?? 42 } });
  uniforms.uOutline.value = opts.outline ?? 0.0;
  uniforms.uSoft.value = opts.soft ?? 0.25;
  uniforms.uWrap.value = opts.wrap ?? 0.1;
  return new THREE.ShaderMaterial({
    name: 'grass',
    lights: true,
    uniforms,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      #include <common>
      #include <shadowmap_pars_vertex>
      attribute vec4 inst;   // world x, y, z, rotation
      attribute vec4 tint;   // color, scale
      uniform float uTime;
      uniform vec2 uWind;
      uniform float uFar;
      varying vec3 vColor;
      varying vec2 vUv;
      varying vec3 vWorldPos;
      varying vec3 vNormalW;
      varying float vFade;
      void main() {
        float c = cos(inst.w), s = sin(inst.w);
        vec3 lp = position * tint.w;
        vec3 wp = inst.xyz + vec3(lp.x * c - lp.z * s, lp.y, lp.x * s + lp.z * c);
        float h = uv.y;
        float ph = uTime * 1.7 + inst.x * 0.37 + inst.z * 0.29;
        float sway = sin(ph) * 0.65 + sin(ph * 2.3 + inst.x) * 0.25;
        wp.xz += (uWind * 0.06 + vec2(0.012, 0.008)) * sway * h * h * tint.w;
        float d = distance(cameraPosition.xz, wp.xz);
        vFade = 1.0 - smoothstep(uFar * 0.6, uFar, d);
        wp.y -= (1.0 - vFade) * h * 0.4 * tint.w;
        vec3 qn = vec3(normal.x * c - normal.z * s, normal.y, normal.x * s + normal.z * c);
        vec3 nrm = normalize(mix(vec3(0.0, 1.0, 0.0), qn, 0.3));
        vec3 transformedNormal = (viewMatrix * vec4(nrm, 0.0)).xyz;
        vec4 worldPosition = vec4(wp, 1.0);
        vec4 mvPosition = viewMatrix * worldPosition;
        gl_Position = projectionMatrix * mvPosition;
        #include <shadowmap_vertex>
        vWorldPos = wp;
        vNormalW = nrm;
        vColor = tint.rgb;
        vUv = uv;
      }
    `,
    fragmentShader: /* glsl */ `
      ${FRAG_HEAD.replace('varying float vPattern;', '')}
      uniform sampler2D map;
      varying float vFade;
      void main() {
        vec4 t = texture2D(map, vUv);
        if (t.a < 0.5) discard;
        if (hash12(floor(gl_FragCoord.xy)) > vFade + 0.02) discard;
        vec3 N = normalize(vNormalW);
        float sh = mix(1.0, getShadowMask(), 0.85);
        // blades darken toward the roots (painted value in the texture)
        vec3 albedo = vColor * mix(0.62, 1.12, t.r);
        vec3 col = toonShade(albedo, N, sh, uSoft, uWrap);
        col = applyHaze(col, vWorldPos);
        #ifdef BLEND
          gl_FragColor = vec4(col, tx.a);
        #else
          gl_FragColor = vec4(col, uOutline);
        #endif
      }
    `,
  });
}

// Simple unlit material (for emissive bulbs, distant silhouettes ...)
export function createUnlitMaterial(opts = {}) {
  return new THREE.ShaderMaterial({
    name: 'unlit',
    vertexColors: true,
    transparent: !!opts.transparent,
    depthWrite: opts.depthWrite ?? true,
    blending: opts.blending ?? THREE.NormalBlending,
    uniforms: { uNight: G.uNight, uOutline: { value: opts.outline ?? 0 }, uNightOnly: { value: opts.nightOnly ? 1 : 0 }, uBoost: { value: opts.boost ?? 1 } },
    vertexShader: /* glsl */ `
      varying vec3 vColor;
      void main() {
        vColor = color;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uNight;
      uniform float uOutline;
      uniform float uNightOnly;
      uniform float uBoost;
      varying vec3 vColor;
      void main() {
        float k = mix(1.0, uNight, uNightOnly);
        gl_FragColor = vec4(vColor * uBoost * k, uOutline);
      }
    `,
  });
}

// ---------------------------------------------------------------------------
// Characters (skinned VRM meshes): the town's toon shading with the model's own colour
// texture, a per-material shade colour (warm for skin, cool for cloth, as in the model),
// a soft terminator on the face, a thin rim light, haze and outline weight like the rest
// of the scene. Supports skinning and morph targets (expressions, blinking).
// ---------------------------------------------------------------------------
export function createCharacterMaterial(opts = {}) {
  const uniforms = makeUniforms({
    map: { value: opts.map || null },
    uBase: { value: new THREE.Color(opts.color ?? 0xffffff) },
    uShade: { value: new THREE.Color(opts.shade ?? 0xb9b4d8) },
    uShadeMix: { value: opts.shadeMix ?? 0.6 },
    uRim: { value: opts.rim ?? 0.22 },
    uUnlit: { value: opts.unlit ?? 0 },
    uSelfShadow: { value: opts.selfShadow ?? 1 },
    uTint: { value: opts.tint || new THREE.Color(1, 1, 1) },
  });
  uniforms.uOutline.value = opts.outline ?? 1;
  uniforms.uSoft.value = opts.soft ?? 0.04;
  uniforms.uWrap.value = opts.wrap ?? 0.0;
  const defines = {};
  if (opts.map) defines.USE_TEXMAP = '';
  // transparent parts (lashes, brows, irises): blended over what is behind, keeping its
  // outline weight in the alpha channel
  const blend = opts.transparent
    ? {
        transparent: true,
        depthWrite: false,
        blending: THREE.CustomBlending,
        blendEquation: THREE.AddEquation,
        blendSrc: THREE.SrcAlphaFactor,
        blendDst: THREE.OneMinusSrcAlphaFactor,
        blendSrcAlpha: THREE.ZeroFactor,
        blendDstAlpha: THREE.OneFactor,
      }
    : {};
  if (opts.transparent) defines.BLEND = '';
  if (opts.tint) defines.TINT = '';
  const cut = opts.alphaTest || (opts.transparent ? 0.02 : 0);
  if (cut) defines.ALPHA_TEST = cut.toFixed(3);
  return new THREE.ShaderMaterial({
    name: opts.name || 'character',
    lights: true,
    defines,
    uniforms,
    ...blend,
    side: opts.side ?? THREE.FrontSide,
    vertexShader: /* glsl */ `
      #include <common>
      #include <morphtarget_pars_vertex>
      #include <skinning_pars_vertex>
      #include <shadowmap_pars_vertex>
      varying vec2 vUv;
      varying vec3 vWorldPos;
      varying vec3 vNormalW;
      void main() {
        #include <beginnormal_vertex>
        #include <morphinstance_vertex>
        #include <morphnormal_vertex>
        #include <skinbase_vertex>
        #include <skinnormal_vertex>
        #include <defaultnormal_vertex>
        #include <begin_vertex>
        #include <morphtarget_vertex>
        #include <skinning_vertex>
        #include <project_vertex>
        #include <worldpos_vertex>
        #include <shadowmap_vertex>
        vec4 wpos = modelMatrix * vec4(transformed, 1.0);
        vWorldPos = wpos.xyz;
        vNormalW = normalize((vec4(transformedNormal, 0.0) * viewMatrix).xyz);
        vUv = uv;
      }
    `,
    fragmentShader: /* glsl */ `
      ${FRAG_HEAD.replace('varying vec3 vColor;', '').replace('varying float vPattern;', '')}
      uniform vec3 uBase;
      uniform vec3 uShade;
      uniform float uShadeMix;
      uniform float uRim;
      uniform float uUnlit;
      uniform float uSelfShadow;
      uniform vec3 uTint;
      #ifdef USE_TEXMAP
        uniform sampler2D map;
      #endif
      void main() {
        vec3 albedo = uBase;
        vec4 tx = vec4(1.0);
        #ifdef USE_TEXMAP
          tx = texture2D(map, vUv);
          #ifdef ALPHA_TEST
            if (tx.a < ALPHA_TEST) discard;
          #endif
          albedo *= tx.rgb;
        #endif
        #ifdef TINT
          // greyscale paint: tint all but the near-white parts
          float lum = dot(albedo, vec3(0.299, 0.587, 0.114));
          albedo = mix(albedo * uTint, albedo, smoothstep(0.72, 0.92, lum));
        #endif
        vec3 N = normalize(vNormalW);
        if (!gl_FrontFacing) N = -N;
        vec3 V = normalize(cameraPosition - vWorldPos);
        float sh = mix(1.0, getShadowMask(), uSelfShadow);
        float ndl = dot(N, uSunDir);
        float L = smoothstep(-uSoft + uWrap, uSoft + uWrap, ndl) * sh;
        vec3 amb = mix(uGroundAmb, uSkyAmb, N.y * 0.5 + 0.5);
        // shadow side: the scene's sky ambient tinted toward the model's shade colour
        float ambLum = dot(amb, vec3(0.299, 0.587, 0.114));
        vec3 shadeCol = mix(amb, uShade * ambLum * 1.25, uShadeMix) * 0.85;
        // model textures are painted at full brightness: keep the lit side below white
        vec3 col = albedo * mix(shadeCol, (amb + uSunColor) * 0.8, L);
        float band = L * (1.0 - L) * 4.0;
        col += albedo * band * uSunColor * vec3(0.16, 0.06, 0.02);
        // thin rim of sky light on the silhouette, stronger on the lit side
        float rim = smoothstep(0.62, 0.95, 1.0 - max(dot(N, V), 0.0));
        col += albedo * rim * uRim * (uSkyAmb * 0.6 + uSunColor * L);
        // eyes / highlights read clearly in any light
        col = mix(col, albedo * (0.75 + 0.35 * (1.0 - uNight)), uUnlit);
        col = applyHaze(col, vWorldPos);
        #ifdef BLEND
          gl_FragColor = vec4(col, tx.a);
        #else
          gl_FragColor = vec4(col, uOutline);
        #endif
      }
    `,
  });
}
