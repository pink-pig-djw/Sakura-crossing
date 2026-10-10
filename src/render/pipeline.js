import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { G } from './materials.js';

// Post-processing for the anime-background look:
//  1. scene -> HDR target (MSAA) whose alpha channel carries per-material outline weight
//  2. dual-filter bloom chain
//  3. final pass: depth-laplacian ink lines, bloom, lens flare, grading, vignette, grain

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

const DOWN = /* glsl */ `
  uniform sampler2D tSrc;
  uniform vec2 uTexel;
  varying vec2 vUv;
  void main() {
    vec3 s = texture2D(tSrc, vUv).rgb * 4.0;
    s += texture2D(tSrc, vUv - uTexel).rgb;
    s += texture2D(tSrc, vUv + uTexel).rgb;
    s += texture2D(tSrc, vUv + vec2(uTexel.x, -uTexel.y)).rgb;
    s += texture2D(tSrc, vUv - vec2(uTexel.x, -uTexel.y)).rgb;
    gl_FragColor = vec4(s / 8.0, 1.0);
  }
`;

const UP = /* glsl */ `
  uniform sampler2D tSrc;
  uniform vec2 uTexel;
  uniform float uWeight;
  varying vec2 vUv;
  void main() {
    vec2 h = uTexel;
    vec3 s = texture2D(tSrc, vUv + vec2(-h.x * 2.0, 0.0)).rgb;
    s += texture2D(tSrc, vUv + vec2(-h.x, h.y)).rgb * 2.0;
    s += texture2D(tSrc, vUv + vec2(0.0, h.y * 2.0)).rgb;
    s += texture2D(tSrc, vUv + vec2(h.x, h.y)).rgb * 2.0;
    s += texture2D(tSrc, vUv + vec2(h.x * 2.0, 0.0)).rgb;
    s += texture2D(tSrc, vUv + vec2(h.x, -h.y)).rgb * 2.0;
    s += texture2D(tSrc, vUv + vec2(0.0, -h.y * 2.0)).rgb;
    s += texture2D(tSrc, vUv + vec2(-h.x, -h.y)).rgb * 2.0;
    gl_FragColor = vec4(s / 12.0 * uWeight, 1.0);
  }
`;

const FINAL = /* glsl */ `
  uniform sampler2D tColor;
  uniform sampler2D tDepth;
  uniform sampler2D tBloom;
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
  uniform float uVignette;
  uniform vec3 uSunScreen;
  uniform vec3 uFlareCol;
  uniform float uFlare;
  uniform float uTime;
  uniform float uGrain;
  uniform float uNight;
  uniform float uFade;
  uniform vec3 uFadeColor;
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
  float ghost(vec2 uv, vec2 c, float r, vec2 asp) {
    float d = length((uv - c) * asp);
    return smoothstep(r, r * 0.55, d);
  }

  void main() {
    vec2 uv = vUv;
    vec4 c0 = texture2D(tColor, uv);
    vec3 col = c0.rgb;

    // ---- ink lines from the depth laplacian (near side only) ----
    vec2 px = uLineScale / uRes;
    float dc = depthAt(uv);
    float dl = depthAt(uv - vec2(px.x, 0.0));
    float dr = depthAt(uv + vec2(px.x, 0.0));
    float du = depthAt(uv + vec2(0.0, px.y));
    float dd = depthAt(uv - vec2(0.0, px.y));
    float zc = lin(dc);
    float K = (uFar - uNear) / (uNear * uFar);
    float rel = (dl + dr + du + dd - 4.0 * dc) * K * zc;
    float conv = smoothstep(0.018, 0.07, rel);
    float conc = smoothstep(0.03, 0.09, -rel) * (1.0 - smoothstep(0.22, 0.4, -rel)) * 0.45;
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
      vec2 asp = vec2(uRes.x / uRes.y, 1.0);
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

    // ---- tone & grade ----
    col *= uExposure;
    col = shoulder(col);
    vec3 s = toSRGB(col);
    float l = dot(s, vec3(0.299, 0.587, 0.114));
    s = mix(vec3(l), s, uSat);
    // split toning: lavender shadows, warm highlights
    s += vec3(0.02, 0.0, 0.05) * (1.0 - smoothstep(0.0, 0.55, l));
    s += vec3(0.025, 0.012, -0.02) * smoothstep(0.55, 1.0, l) * (1.0 - uNight);
    // gentle S-curve
    s = mix(s, s * s * (3.0 - 2.0 * s), 0.18);
    // vignette
    vec2 q = (uv - 0.5) * vec2(1.0, 0.85);
    float vig = smoothstep(0.95, 0.2, length(q));
    s *= mix(1.0, vig, uVignette);
    // paper grain + dither
    float gr = hash12(uv * uRes + fract(uTime * 7.0) * 113.0) - 0.5;
    s += gr * uGrain;
    s = mix(s, uFadeColor, uFade);
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
    this.final = pass(FINAL, {
      tColor: { value: null },
      tDepth: { value: null },
      tBloom: { value: null },
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
      uVignette: { value: 0.35 },
      uSunScreen: { value: new THREE.Vector3() },
      uFlareCol: { value: new THREE.Color(1, 0.85, 0.6) },
      uFlare: { value: 0 },
      uTime: G.uTime,
      uGrain: { value: 0.022 },
      uNight: G.uNight,
      uFade: { value: 0 },
      uFadeColor: { value: new THREE.Color(1, 1, 1) },
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
    this.mips = [];
  }

  updateFlare(camera, sunDir, strength) {
    const u = this.final.uniforms;
    camera.getWorldDirection(this._d);
    const facing = this._d.dot(sunDir);
    if (facing <= 0.1 || strength <= 0) {
      u.uFlare.value = 0;
      return;
    }
    this._v.copy(camera.position).addScaledVector(sunDir, 1000).project(camera);
    const sx = this._v.x * 0.5 + 0.5;
    const sy = this._v.y * 0.5 + 0.5;
    u.uSunScreen.value.set(sx, sy, 1);
    const edge = Math.min(sx, sy, 1 - sx, 1 - sy);
    const onScreen = THREE.MathUtils.smoothstep(edge, -0.05, 0.08);
    u.uFlare.value = strength * onScreen;
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

    u.tColor.value = this.rtScene.texture;
    u.tDepth.value = this.rtScene.depthTexture;
    u.tBloom.value = this.mips[0].texture;
    u.uNear.value = camera.near;
    u.uFar.value = camera.far;
    u.uReversed.value = r.state.buffers.depth.getReversed() ? 1 : 0;
    u.uLineStrength.value = this.outlines ? params.lineStrength ?? 0.75 : 0;
    if (params.exposure !== undefined) u.uExposure.value = params.exposure;
    if (params.bloom !== undefined) u.uBloom.value = params.bloom;
    this.quad.material = this.final;
    r.setRenderTarget(null);
    this.quad.render(r);
  }
}
