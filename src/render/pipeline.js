import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { G } from './materials.js';

// Post-processing for the anime-background look (the "satsuei" compositing stage):
//  1. scene -> HDR target (MSAA) whose alpha channel carries per-material outline weight
//  2. dual-filter bloom chain (thresholded: lamps, the sun, glints)
//  3. a soft chain of the whole picture (quarter resolution and below) for the diffusion glow
//  4. light shafts toward the sun (quarter resolution, only while facing it)
//  5. final pass: painted shading in corners (depth-only crease occlusion), depth-laplacian
//     ink lines (heavier near the camera), bloom, lens flare, tone, diffusion, light shafts,
//     light leak, grading, sky / ground gradients, vignette, grain

const SOFT_LEVELS = 4;

const QUAD_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

function pass(fragmentShader, uniforms, opts = {}) {
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: QUAD_VERT,
    fragmentShader,
    depthTest: false,
    depthWrite: false,
    ...opts,
  });
}

const PREFILTER = /* glsl */ `
  uniform sampler2D tColor;
  uniform vec2 uTexel;
  uniform float uThreshold;
  uniform float uKnee;
  varying vec2 vUv;
  void main() {
    vec3 c = texture2D(tColor, vUv + vec2(-1.0, -1.0) * uTexel).rgb;
    c += texture2D(tColor, vUv + vec2(1.0, -1.0) * uTexel).rgb;
    c += texture2D(tColor, vUv + vec2(-1.0, 1.0) * uTexel).rgb;
    c += texture2D(tColor, vUv + vec2(1.0, 1.0) * uTexel).rgb;
    c *= 0.25;
    c = min(c, vec3(40.0));
    float br = max(c.r, max(c.g, c.b));
    float soft = clamp(br - uThreshold + uKnee, 0.0, 2.0 * uKnee);
    soft = soft * soft / (4.0 * uKnee + 1e-4);
    float contrib = max(soft, br - uThreshold) / max(br, 1e-4);
    gl_FragColor = vec4(c * contrib, 1.0);
  }
`;

// Soft chain, full -> quarter resolution: the picture box-filtered over 4x4 pixels
const SOFTPRE = /* glsl */ `
  uniform sampler2D tColor;
  uniform vec2 uTexel;
  varying vec2 vUv;
  void main() {
    vec3 c = texture2D(tColor, vUv + vec2(-1.0, -1.0) * uTexel).rgb;
    c += texture2D(tColor, vUv + vec2(1.0, -1.0) * uTexel).rgb;
    c += texture2D(tColor, vUv + vec2(-1.0, 1.0) * uTexel).rgb;
    c += texture2D(tColor, vUv + vec2(1.0, 1.0) * uTexel).rgb;
    gl_FragColor = vec4(min(c * 0.25, vec3(16.0)), 1.0);
  }
`;

// Light shafts (quarter resolution): from each pixel toward the sun's place on the screen
// (also just off screen), how much open sky the line crosses; the gaps between roofs, poles
// and leaves become beams in the final pass
const RAYS = /* glsl */ `
  uniform sampler2D tDepth;
  uniform vec2 uSun;
  uniform float uReversed;
  varying vec2 vUv;
  void main() {
    vec2 d = (uSun - vUv) * (0.85 / 28.0);
    float j = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    vec2 p = vUv + d * j;
    float acc = 0.0, w = 1.0, wsum = 0.0;
    for (int i = 0; i < 28; i++) {
      vec2 q = clamp(p, vec2(0.0), vec2(1.0));
      float z = texture2D(tDepth, q).r;
      z = uReversed > 0.5 ? 1.0 - z : z;
      float inside = step(0.0, p.x) * step(p.x, 1.0) * step(0.0, p.y) * step(p.y, 1.0);
      // past the frame edge the sky is assumed open, a little less than seen
      acc += mix(0.6, step(0.99999, z), inside) * w;
      wsum += w;
      w *= 0.94;
      p += d;
    }
    gl_FragColor = vec4(vec3(acc / wsum), 1.0);
  }
`;

const DOWN = /* glsl */ `
  uniform sampler2D tSrc;
  uniform vec2 uTexel;
  varying vec2 vUv;
  void main() {
    vec4 s = texture2D(tSrc, vUv) * 4.0;
    s += texture2D(tSrc, vUv - uTexel);
    s += texture2D(tSrc, vUv + uTexel);
    s += texture2D(tSrc, vUv + vec2(uTexel.x, -uTexel.y));
    s += texture2D(tSrc, vUv - vec2(uTexel.x, -uTexel.y));
    gl_FragColor = s / 8.0;
  }
`;

const UP = /* glsl */ `
  uniform sampler2D tSrc;
  uniform vec2 uTexel;
  uniform float uWeight;
  varying vec2 vUv;
  void main() {
    vec2 h = uTexel;
    vec4 s = texture2D(tSrc, vUv + vec2(-h.x * 2.0, 0.0));
    s += texture2D(tSrc, vUv + vec2(-h.x, h.y)) * 2.0;
    s += texture2D(tSrc, vUv + vec2(0.0, h.y * 2.0));
    s += texture2D(tSrc, vUv + vec2(h.x, h.y)) * 2.0;
    s += texture2D(tSrc, vUv + vec2(h.x * 2.0, 0.0));
    s += texture2D(tSrc, vUv + vec2(h.x, -h.y)) * 2.0;
    s += texture2D(tSrc, vUv + vec2(0.0, -h.y * 2.0));
    s += texture2D(tSrc, vUv + vec2(-h.x, -h.y)) * 2.0;
    gl_FragColor = s / 12.0 * uWeight;
  }
`;

const FINAL = /* glsl */ `
  uniform sampler2D tColor;
  uniform sampler2D tDepth;
  uniform sampler2D tBloom;
  uniform sampler2D tSoft;
  uniform vec2 uRes;
  uniform float uNear;
  uniform float uFar;
  uniform float uReversed;
  uniform float uLineScale;
  uniform float uLineStrength;
  uniform float uLineFar;
  uniform vec3 uLineTint;
  uniform float uBloom;
  uniform float uExposure;
  uniform float uSat;
  uniform float uVibrance;
  uniform float uContrast;
  uniform float uVignette;
  uniform vec3 uSunScreen;
  uniform vec3 uFlareCol;
  uniform float uFlare;
  uniform float uTime;
  uniform float uGrain;
  uniform float uNight;
  uniform float uFade;
  uniform vec3 uFadeColor;
  uniform float uSoftLevels;
  uniform float uCorner;
  uniform vec3 uCornerTint;
  uniform float uCornerRadius;
  uniform float uFocal;
  uniform float uDiffuse;
  uniform float uDiffuseLo;
  uniform vec3 uLeakPos;
  uniform vec3 uLeakCol;
  uniform float uLeak;
  uniform vec3 uTopTint;
  uniform float uTop;
  uniform float uBottom;
  uniform sampler2D tRays;
  uniform float uRays;
  uniform vec3 uShadowTone;
  uniform vec3 uLightTone;
  uniform float uDebug;
  varying vec2 vUv;

  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  float lin(float d) { return uNear * uFar / (uFar - d * (uFar - uNear)); }
  // scene depth in the usual 0 (near) .. 1 (far) sense, also with a reversed depth buffer
  float depthAt(vec2 p) {
    float d = texture2D(tDepth, p).r;
    return uReversed > 0.5 ? 1.0 - d : d;
  }
  vec3 toSRGB(vec3 c) {
    c = max(c, vec3(0.0));
    vec3 lo = c * 12.92;
    vec3 hi = 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055;
    return mix(lo, hi, step(vec3(0.0031308), c));
  }
  vec3 shoulder(vec3 x) {
    // linear up to 0.75, then a soft roll-off toward 1.0
    vec3 k = vec3(0.75);
    vec3 over = max(x - k, 0.0);
    return min(x, k) + (1.0 - k) * (1.0 - exp(-over / (1.0 - k)));
  }
  vec3 screen(vec3 a, vec3 b) { return 1.0 - (1.0 - a) * (1.0 - clamp(b, 0.0, 1.0)); }
  float ghost(vec2 uv, vec2 c, float r, vec2 asp) {
    float d = length((uv - c) * asp);
    return smoothstep(r, r * 0.55, d);
  }
  float invZ(vec2 p) { return (uFar - depthAt(p) * (uFar - uNear)) / (uNear * uFar); }
  // Crease occlusion from depth alone. Pairs of taps above and below, out to about a fixed
  // distance in the world: 1/z is linear across any plane, so a pair on a flat wall or road
  // sums to zero, while a pixel in a concave corner (wall meets ground, under eaves and
  // benches, at the foot of a post) lies behind its taps' average. Near-vertical pairs only,
  // at six radii (a smooth gradient, no blocky halos beside things standing in front of a
  // wall); a pair touching something far in front (an outline, not a corner) is left out.
  float creaseOcclusion(vec2 uv, float zc) {
    float rpx = clamp(uCornerRadius * uFocal / zc, 1.5, 44.0);
    float jit = 0.92 + 0.16 * fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    float occ = 0.0, n = 0.0;
    for (int i = 0; i < 6; i++) {
      float fi = float(i);
      float a = 1.5708 + (fract(fi * 0.618) - 0.5) * 0.6;
      vec2 o = vec2(cos(a), sin(a)) * rpx * jit * (1.0 - fi * 0.15) / uRes;
      float da = invZ(uv + o) * zc - 1.0;
      float db = invZ(uv - o) * zc - 1.0;
      float ok = step(max(da, db), 0.4);
      occ += (da + db) * ok;
      n += ok;
    }
    return occ / max(n, 1.0);
  }
  // relative depth laplacian at a radius of r pixels: > 0 on the near side of an outline
  float laplace(vec2 uv, vec2 r, float dc, float zc) {
    float s = depthAt(uv - vec2(r.x, 0.0)) + depthAt(uv + vec2(r.x, 0.0));
    s += depthAt(uv + vec2(0.0, r.y)) + depthAt(uv - vec2(0.0, r.y));
    return (s - 4.0 * dc) * (uFar - uNear) / (uNear * uFar) * zc;
  }

  void main() {
    vec2 uv = vUv;
    vec2 asp = vec2(uRes.x / uRes.y, 1.0);
    vec4 c0 = texture2D(tColor, uv);
    vec3 col = c0.rgb;
    float dc = depthAt(uv);
    float zc = lin(dc);
    float solid = step(dc, 0.99999);

    // ---- painted shading in corners and recesses: a cool shade gathers where surfaces meet ----
    float rel = 0.0;
    float corner = 0.0;
    if (uCorner > 0.001 && solid > 0.5 && zc < 140.0) {
      rel = creaseOcclusion(uv, zc);
      // (by the outline weight: none on grass, little inside tree crowns)
      corner = smoothstep(0.0, 0.3, rel) * (1.0 - smoothstep(80.0, 140.0, zc)) * smoothstep(0.25, 0.5, c0.a) * uCorner;
      col *= mix(vec3(1.0), uCornerTint, corner);
    }

    // ---- ink lines from the depth laplacian (near side only) ----
    // one pixel out everywhere, two pixels out close to the camera: the strokes thicken
    // toward the viewer like a drawn line, and thin away into the distance
    vec2 px = uLineScale / uRes;
    float rel1 = laplace(uv, px, dc, zc);
    float near = 1.0 - smoothstep(5.0, 16.0, zc);
    float rel2 = near > 0.0 ? laplace(uv, px * 2.0, dc, zc) * 0.5 : 0.0;
    float conv = max(smoothstep(0.018, 0.07, rel1), smoothstep(0.018, 0.07, rel2) * near);
    float conc = smoothstep(0.03, 0.09, -rel1) * (1.0 - smoothstep(0.22, 0.4, -rel1)) * 0.45;
    float fade = 1.0 - smoothstep(uLineFar * 0.35, uLineFar, zc);
    float line = max(conv, conc) * fade * c0.a * uLineStrength;
    col = mix(col, col * uLineTint, clamp(line, 0.0, 1.0));

    // ---- bloom ----
    col += texture2D(tBloom, uv).rgb * uBloom;

    // ---- lens flare & veiling glare ----
    if (uFlare > 0.001) {
      vec2 sp = uSunScreen.xy;
      float vis = 0.0;
      for (int i = 0; i < 6; i++) {
        float a = float(i) * 1.0472;
        vec2 o = i == 0 ? vec2(0.0) : vec2(cos(a), sin(a)) * 0.008;
        vis += step(0.99999, depthAt(clamp(sp + o, 0.0, 1.0)));
      }
      vis /= 6.0;
      vec2 dir = vec2(0.5) - sp;
      float dsun = length((uv - sp) * asp);
      vec3 fl = vec3(0.0);
      fl += uFlareCol * exp(-dsun * 5.0) * 0.22;
      fl += uFlareCol * smoothstep(0.012, 0.0, abs(dsun - 0.24)) * 0.05;
      fl += vec3(0.55, 0.75, 1.0) * ghost(uv, sp + dir * 0.55, 0.035, asp) * 0.07;
      fl += vec3(1.0, 0.75, 0.55) * ghost(uv, sp + dir * 0.85, 0.06, asp) * 0.05;
      fl += vec3(0.7, 1.0, 0.75) * ghost(uv, sp + dir * 1.25, 0.022, asp) * 0.08;
      fl += vec3(0.75, 0.6, 1.0) * ghost(uv, sp + dir * 1.6, 0.09, asp) * 0.035;
      fl += vec3(1.0, 0.9, 0.7) * ghost(uv, sp + dir * 2.0, 0.045, asp) * 0.05;
      float streak = exp(-abs(uv.y - sp.y) * 140.0) * exp(-abs((uv.x - sp.x) * asp.x) * 2.2);
      fl += uFlareCol * streak * 0.3;
      col += fl * vis * uFlare;
      col += uFlareCol * 0.05 * vis * uFlare * (1.0 - smoothstep(0.0, 1.2, dsun));
    }

    // ---- tone ----
    col *= uExposure;
    col = shoulder(col);
    vec3 s = toSRGB(col);

    // ---- diffusion: the soft copy of the picture's bright parts screened back over it.
    // Mostly where it is brighter than the sharp picture (the glow sky and sunlit walls spill
    // over the edges of trees, roofs and poles), only a touch over flat areas, so walls and
    // rooms keep their colour instead of going milky ----
    vec3 dif = toSRGB(shoulder(texture2D(tSoft, uv).rgb / uSoftLevels * uExposure));
    dif = smoothstep(vec3(uDiffuseLo), vec3(1.0), dif);
    vec3 spill = max(dif - smoothstep(vec3(uDiffuseLo), vec3(1.0), s), 0.0);
    s = screen(s, (spill * 1.8 + dif * 0.2) * uDiffuse);

    // ---- light shafts: beams fanning from the sun through the gaps, fading with distance
    // from it; lifted least on the sky itself (it already glows) ----
    if (uRays > 0.001) {
      float r = texture2D(tRays, uv).r;
      float fall = exp(-length((uv - uSunScreen.xy) * asp) * 1.3);
      s = screen(s, uFlareCol * (r * r * fall * uRays * mix(1.0, 0.4, 1.0 - solid)));
    }

    // ---- light leak from the sun's side of the frame, even with the sun just off screen ----
    if (uLeak > 0.001) {
      float dl = length((uv - uLeakPos.xy) * asp);
      s = screen(s, uLeakCol * uLeak * exp(-dl * 1.7));
    }

    // ---- grade ----
    float l = dot(s, vec3(0.299, 0.587, 0.114));
    // vibrance: greyish colours gain more than already vivid ones
    float chroma = max(s.r, max(s.g, s.b)) - min(s.r, min(s.g, s.b));
    s = mix(vec3(l), s, uSat + uVibrance * (1.0 - smoothstep(0.05, 0.45, chroma)));
    // split toning: cool shadows, warm light (per time of day)
    s += uShadowTone * (1.0 - smoothstep(0.0, 0.55, l));
    s += uLightTone * smoothstep(0.5, 1.0, l);
    // gentle S-curve
    s = clamp(s, 0.0, 1.0);
    s = mix(s, s * s * (3.0 - 2.0 * s), uContrast);
    // the top of the frame deepens (the painted sky darkens toward the zenith), and the
    // ground at the viewer's feet settles a little, framing the lit middle distance
    s *= mix(vec3(1.0), uTopTint, smoothstep(0.5, 1.08, uv.y) * uTop * mix(0.3, 1.0, 1.0 - solid));
    s *= mix(vec3(1.0), mix(vec3(1.0), uTopTint, 0.6) * 0.95, smoothstep(0.32, -0.05, uv.y) * uBottom * solid);
    // vignette
    vec2 q = (uv - 0.5) * vec2(1.0, 0.85);
    float vig = smoothstep(0.95, 0.2, length(q));
    s *= mix(1.0, vig, uVignette);
    // paper grain + dither
    float gr = hash12(uv * uRes + fract(uTime * 7.0) * 113.0) - 0.5;
    s += gr * uGrain;
    s = mix(s, uFadeColor, uFade);
    if (uDebug > 0.5) s = uDebug < 1.5 ? vec3(corner / max(uCorner, 1e-3)) : (uDebug < 2.5 ? vec3(max(rel, 0.0), max(-rel, 0.0), 0.0) * 8.0 : (uDebug < 3.5 ? dif : texture2D(tRays, uv).rgb));
    gl_FragColor = vec4(s, 1.0);
  }
`;

export class Pipeline {
  constructor(renderer, opts = {}) {
    this.renderer = renderer;
    this.msaa = opts.msaa ?? 4;
    this.renderScale = opts.renderScale ?? 1;
    this.levels = 5;
    this.outlines = true;
    this.width = 1;
    this.height = 1;
    this.rtScene = null;
    this.mips = [];
    this.soft = [];
    this.indoor = 0;
    // lite: no corner shading or light shafts (the low quality setting, phones)
    this.lite = false;
    this.corner = 0.6;
    this.quad = new FullScreenQuad(null);

    this.prefilter = pass(PREFILTER, {
      tColor: { value: null },
      uTexel: { value: new THREE.Vector2() },
      uThreshold: { value: 1.05 },
      uKnee: { value: 0.45 },
    });
    this.down = pass(DOWN, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } });
    this.up = pass(UP, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uWeight: { value: 1 } }, {
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
      transparent: true,
    });
    this.rays = pass(RAYS, {
      tDepth: { value: null },
      uSun: { value: new THREE.Vector2() },
      uReversed: { value: 0 },
    });
    this.softPre = pass(SOFTPRE, {
      tColor: { value: null },
      uTexel: { value: new THREE.Vector2() },
    });
    this.final = pass(FINAL, {
      tColor: { value: null },
      tDepth: { value: null },
      tBloom: { value: null },
      tSoft: { value: null },
      uRes: { value: new THREE.Vector2() },
      uNear: { value: 0.1 },
      uFar: { value: 5000 },
      uReversed: { value: 0 },
      uLineScale: { value: 1 },
      uLineStrength: { value: 0.75 },
      uLineFar: { value: 200 }, // 1-pixel lines on far-off buildings only shimmer
      uLineTint: { value: new THREE.Color(0.22, 0.2, 0.3) },
      uBloom: { value: 0.7 },
      uExposure: { value: 1 },
      uSat: { value: 1.12 },
      uVibrance: { value: 0.1 },
      uContrast: { value: 0.24 },
      uVignette: { value: 0.3 },
      uSunScreen: { value: new THREE.Vector3() },
      uFlareCol: { value: new THREE.Color(1, 0.85, 0.6) },
      uFlare: { value: 0 },
      uTime: G.uTime,
      uGrain: { value: 0.014 },
      uNight: G.uNight,
      uFade: { value: 0 },
      uFadeColor: { value: new THREE.Color(1, 1, 1) },
      uSoftLevels: { value: SOFT_LEVELS - 1 },
      uCorner: { value: 0.6 },
      uCornerTint: G.uCornerTint,
      uCornerRadius: { value: 0.55 }, // metres: how far the shade reaches from a corner
      uFocal: { value: 600 },
      uDiffuse: G.uDiffuse,
      uDiffuseLo: { value: 0.6 },
      uLeakPos: { value: new THREE.Vector3() },
      uLeakCol: { value: new THREE.Color(1, 0.8, 0.55) },
      uLeak: { value: 0 },
      uTopTint: G.uTopTint,
      uTop: { value: 1 },
      uBottom: { value: 0.7 },
      tRays: { value: null },
      uRays: { value: 0 },
      uShadowTone: G.uShadowTone,
      uLightTone: G.uLightTone,
      uDebug: { value: 0 }, // 1: corner shading, 2: crease measure, 3: diffusion, 4: light shafts
    });
    this._v = new THREE.Vector3();
    this._d = new THREE.Vector3();
  }

  setSize(cssW, cssH, pixelRatio) {
    const w = Math.max(1, Math.round(cssW * pixelRatio * this.renderScale));
    const h = Math.max(1, Math.round(cssH * pixelRatio * this.renderScale));
    if (w === this.width && h === this.height && this.rtScene) return;
    this.width = w;
    this.height = h;
    this.dispose();
    const depthTexture = new THREE.DepthTexture(w, h, THREE.FloatType);
    this.rtScene = new THREE.WebGLRenderTarget(w, h, {
      type: THREE.HalfFloatType,
      samples: this.msaa,
      depthTexture,
      depthBuffer: true,
    });
    this.rtScene.texture.minFilter = THREE.LinearFilter;
    this.rtScene.texture.generateMipmaps = false;
    let mw = w, mh = h;
    this.mips = [];
    for (let i = 0; i < this.levels; i++) {
      mw = Math.max(1, Math.round(mw / 2));
      mh = Math.max(1, Math.round(mh / 2));
      const rt = new THREE.WebGLRenderTarget(mw, mh, { type: THREE.HalfFloatType, depthBuffer: false });
      rt.texture.minFilter = THREE.LinearFilter;
      rt.texture.generateMipmaps = false;
      this.mips.push(rt);
    }
    // soft chain: quarter resolution and three halvings below it
    mw = Math.max(1, Math.round(w / 4));
    mh = Math.max(1, Math.round(h / 4));
    this.soft = [];
    for (let i = 0; i < SOFT_LEVELS; i++) {
      const rt = new THREE.WebGLRenderTarget(mw, mh, { type: THREE.HalfFloatType, depthBuffer: false });
      rt.texture.minFilter = THREE.LinearFilter;
      rt.texture.generateMipmaps = false;
      this.soft.push(rt);
      mw = Math.max(1, Math.round(mw / 2));
      mh = Math.max(1, Math.round(mh / 2));
    }
    this.final.uniforms.uRes.value.set(w, h);
    this.final.uniforms.uLineScale.value = Math.max(1, Math.round(h / 1100));
  }

  setMSAA(samples) {
    if (samples === this.msaa) return;
    this.msaa = samples;
    const w = this.width, h = this.height;
    this.width = 0;
    this.setSize(w, h, 1 / this.renderScale);
  }

  dispose() {
    if (this.rtScene) {
      this.rtScene.depthTexture?.dispose();
      this.rtScene.dispose();
    }
    for (const m of this.mips) m.dispose();
    for (const m of this.soft) m.dispose();
    this.mips = [];
    this.soft = [];
  }

  // indoors (eased over a moment; dt 0 jumps): no sky deepening or ground framing, no leak
  setIndoor(inside, dt) {
    const k = dt > 0 ? Math.min(1, dt * 3) : 1;
    this.indoor += ((inside ? 1 : 0) - this.indoor) * k;
    const u = this.final.uniforms;
    u.uTop.value = 1 - 0.85 * this.indoor;
    u.uBottom.value = 0.7 * (1 - this.indoor);
  }

  updateFlare(camera, sunDir, strength, leak = strength, rays = 0) {
    const u = this.final.uniforms;
    camera.getWorldDirection(this._d);
    const facing = this._d.dot(sunDir);
    if (facing <= 0.1 || (strength <= 0 && leak <= 0 && rays <= 0)) {
      u.uFlare.value = 0;
      u.uLeak.value = 0;
      u.uRays.value = 0;
      return;
    }
    this._v.copy(camera.position).addScaledVector(sunDir, 1000).project(camera);
    const sx = this._v.x * 0.5 + 0.5;
    const sy = this._v.y * 0.5 + 0.5;
    u.uSunScreen.value.set(sx, sy, 1);
    const edge = Math.min(sx, sy, 1 - sx, 1 - sy);
    const onScreen = THREE.MathUtils.smoothstep(edge, -0.05, 0.08);
    u.uFlare.value = Math.max(strength, 0) * onScreen;
    // the warm leak keeps glowing in from the frame edge while the sun is just outside it,
    // in the colour of the sun's glow (pale gold by day, orange at sunset)
    u.uLeakPos.value.set(sx, sy, 0);
    const g = G.uSunGlow.value;
    const m = Math.max(g.r, g.g, g.b, 1e-3);
    u.uLeakCol.value.setRGB(g.r / m, (g.g / m) * 0.95, (g.b / m) * 0.9);
    u.uLeak.value = Math.max(leak, 0) * THREE.MathUtils.smoothstep(facing, 0.1, 0.7) * THREE.MathUtils.smoothstep(edge, -0.6, 0.0);
    u.uRays.value = this.lite ? 0 : Math.max(rays, 0) * THREE.MathUtils.smoothstep(facing, 0.25, 0.8) * THREE.MathUtils.smoothstep(edge, -0.45, 0.05);
    u.uLeak.value *= 1 - this.indoor;
  }

  render(scene, camera, params = {}) {
    const r = this.renderer;
    const u = this.final.uniforms;
    r.autoClear = false;

    r.setRenderTarget(this.rtScene);
    r.setClearColor(0x000000, 0);
    r.clear(true, true, true);
    r.render(scene, camera);

    // bloom chain
    const p = this.prefilter.uniforms;
    p.tColor.value = this.rtScene.texture;
    p.uTexel.value.set(1 / this.width, 1 / this.height);
    if (params.bloomThreshold !== undefined) p.uThreshold.value = params.bloomThreshold;
    this.quad.material = this.prefilter;
    r.setRenderTarget(this.mips[0]);
    this.quad.render(r);

    this.quad.material = this.down;
    for (let i = 1; i < this.levels; i++) {
      const src = this.mips[i - 1];
      this.down.uniforms.tSrc.value = src.texture;
      this.down.uniforms.uTexel.value.set(1 / src.width, 1 / src.height);
      r.setRenderTarget(this.mips[i]);
      this.quad.render(r);
    }
    this.quad.material = this.up;
    for (let i = this.levels - 1; i > 0; i--) {
      const src = this.mips[i];
      this.up.uniforms.tSrc.value = src.texture;
      this.up.uniforms.uTexel.value.set(0.5 / src.width, 0.5 / src.height);
      this.up.uniforms.uWeight.value = 1.0;
      r.setRenderTarget(this.mips[i - 1]);
      this.quad.render(r);
    }

    // soft chain (diffusion): read back one level below the top, the wider blurs only
    const reversed = r.state.buffers.depth.getReversed() ? 1 : 0;
    const sp = this.softPre.uniforms;
    sp.tColor.value = this.rtScene.texture;
    sp.uTexel.value.set(1 / this.width, 1 / this.height);
    this.quad.material = this.softPre;
    r.setRenderTarget(this.soft[0]);
    this.quad.render(r);
    this.quad.material = this.down;
    for (let i = 1; i < this.soft.length; i++) {
      const src = this.soft[i - 1];
      this.down.uniforms.tSrc.value = src.texture;
      this.down.uniforms.uTexel.value.set(1 / src.width, 1 / src.height);
      r.setRenderTarget(this.soft[i]);
      this.quad.render(r);
    }
    this.quad.material = this.up;
    for (let i = this.soft.length - 1; i > 1; i--) {
      const src = this.soft[i];
      this.up.uniforms.tSrc.value = src.texture;
      this.up.uniforms.uTexel.value.set(0.5 / src.width, 0.5 / src.height);
      this.up.uniforms.uWeight.value = 1.0;
      r.setRenderTarget(this.soft[i - 1]);
      this.quad.render(r);
    }

    // light shafts, into the quarter-resolution target the soft chain no longer needs
    if (u.uRays.value > 0.001) {
      const ry = this.rays.uniforms;
      ry.tDepth.value = this.rtScene.depthTexture;
      ry.uSun.value.set(u.uSunScreen.value.x, u.uSunScreen.value.y);
      ry.uReversed.value = reversed;
      this.quad.material = this.rays;
      r.setRenderTarget(this.soft[0]);
      this.quad.render(r);
    }

    u.tColor.value = this.rtScene.texture;
    u.tDepth.value = this.rtScene.depthTexture;
    u.tBloom.value = this.mips[0].texture;
    u.tSoft.value = this.soft[1].texture;
    u.tRays.value = this.soft[0].texture;
    u.uFocal.value = this.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    u.uNear.value = camera.near;
    u.uFar.value = camera.far;
    u.uReversed.value = reversed;
    u.uLineStrength.value = this.outlines ? params.lineStrength ?? 0.75 : 0;
    u.uCorner.value = this.lite ? 0 : this.corner;
    if (params.exposure !== undefined) u.uExposure.value = params.exposure;
    if (params.bloom !== undefined) u.uBloom.value = params.bloom;
    this.quad.material = this.final;
    r.setRenderTarget(null);
    this.quad.render(r);
  }
}
