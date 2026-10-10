import * as THREE from 'three';
import { G } from './materials.js';
import { NOISE } from './glsl.js';

// Painted anime sky: deep zenith blue, bright horizon band, cumulus towers on
// the horizon, streaky cirrus, layered far mountains (with Mt. Fuji to the
// west-south-west), sun glow, moon and stars.

export function createSky() {
  const geo = new THREE.SphereGeometry(4000, 48, 24);
  const mat = new THREE.ShaderMaterial({
    name: 'sky',
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uZenith: G.uZenith,
      uHorizon: G.uHorizon,
      uSunDir: G.uSunDir,
      uSunGlow: G.uSunGlow,
      uSunColor: G.uSunColor,
      uCloudLit: G.uCloudLit,
      uCloudShade: G.uCloudShade,
      uHazeColor: G.uHazeColor,
      uTime: G.uTime,
      uStars: G.uStars,
      uNight: G.uNight,
      uMoonDir: G.uMoonDir,
      uSunDisk: G.uSunDisk,
      uSkyAmb: G.uSkyAmb,
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        // on the far plane (z = 0 with a reversed depth buffer)
        #ifdef USE_REVERSED_DEPTH_BUFFER
          gl_Position = vec4(p.xy, 0.0, p.w);
        #else
          gl_Position = p.xyww;
        #endif
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uZenith;
      uniform vec3 uHorizon;
      uniform vec3 uSunDir;
      uniform vec3 uSunGlow;
      uniform vec3 uSunColor;
      uniform vec3 uCloudLit;
      uniform vec3 uCloudShade;
      uniform vec3 uHazeColor;
      uniform vec3 uSkyAmb;
      uniform vec3 uMoonDir;
      uniform float uTime;
      uniform float uStars;
      uniform float uNight;
      uniform float uSunDisk;
      varying vec3 vDir;
      ${NOISE}

      float ridge(float x) { return 1.0 - abs(2.0 * x - 1.0); }

      // Cumulus layer on a plane overhead. Returns (coverage, lighting).
      vec2 cumulus(vec3 d, float t) {
        vec2 p = d.xz / max(d.y, 0.035) * 1.1 + vec2(t * 0.006, t * 0.0025);
        float base = fbm5(p * 0.55);
        float detail = fbm3(p * 2.2 + 3.0);
        float n = base + 0.22 * (detail - 0.5);
        float cov = smoothstep(0.6, 0.66, n) * 0.85;
        // light from the sun side: sample toward the sun
        vec2 sp = p + normalize(uSunDir.xz + 1e-4) * 0.09;
        float ns = fbm5(sp * 0.55) + 0.22 * (fbm3(sp * 2.2 + 3.0) - 0.5);
        float lit = clamp(0.62 + (n - ns) * 7.0, 0.0, 1.0);
        lit = mix(lit, 0.35, smoothstep(0.66, 0.85, n) * 0.6);
        return vec2(cov, lit);
      }

      // Brushed cirrus streaks.
      float cirrus(vec3 d, float t) {
        vec2 p = d.xz / max(d.y, 0.05) * 0.5;
        float a = 0.6;
        mat2 r = mat2(cos(a), -sin(a), sin(a), cos(a));
        p = r * p;
        p += vec2(t * 0.004, 0.0);
        vec2 q = vec2(p.x * 0.6, p.y * 5.0);
        float w = fbm3(vec2(q.x * 1.5, q.y * 0.4));
        float n = fbm5(q + w * 1.5);
        float c = smoothstep(0.58, 0.75, n) * smoothstep(0.35, 0.65, fbm3(p * 0.7 + 5.0));
        return c;
      }

      // Towering cumulus band rising from the horizon.
      vec3 towers(vec3 d, vec3 col, float az, float e, float t) {
        float a = az + t * 0.0008;
        float h = 0.025 + 0.11 * pow(fbm3(vec2(a * 1.6, 1.3)), 2.2);
        h *= 0.6 + 0.8 * smoothstep(0.2, 0.7, fbm3(vec2(a * 0.7 + 4.0, 7.0)));
        float puff = fbm5(vec2(a * 14.0, e * 34.0 - t * 0.002)) - 0.5;
        float edge = h + puff * 0.035 - e;
        float m = smoothstep(0.0, 0.004, edge) * smoothstep(-0.02, 0.012, e);
        if (m <= 0.0) return col;
        // vertical shading: bright top, lavender base
        float vt = clamp(e / max(h, 0.01), 0.0, 1.0);
        float sunSide = 0.5 + 0.5 * dot(normalize(vec2(sin(az), cos(az))), normalize(uSunDir.xz + 1e-4));
        float puffLight = smoothstep(-0.1, 0.25, fbm3(vec2(a * 22.0 + 1.0, e * 50.0 + 2.0)) - 0.5 + vt * 0.4);
        float lit = clamp(0.25 + vt * 0.6 + puffLight * 0.35, 0.0, 1.0) * (0.55 + 0.45 * sunSide);
        vec3 cc = mix(uCloudShade, uCloudLit, lit);
        // far towers fade into the horizon haze
        cc = mix(cc, uHorizon, 0.18 + 0.25 * (1.0 - vt));
        return mix(col, cc, m);
      }

      // Distant mountain silhouettes, including Fuji.
      vec3 mountains(vec3 col, float az, float e) {
        // Fuji
        float fz = -1.03;
        float x = (az - fz) / 0.19;
        float s = clamp(1.0 - abs(x), 0.0, 1.0);
        float prof = pow(s, 1.75) * 0.092;
        prof = min(prof, 0.087 + 0.0015 * sin(x * 40.0));
        float fuji = smoothstep(0.0, 0.0012, prof - e) * step(-0.002, e);
        // Hakone / Izu ranges
        float r1 = 0.012 + 0.012 * fbm3(vec2(az * 9.0, 1.0)) + 0.01 * smoothstep(-0.55, -1.2, az);
        r1 *= smoothstep(-0.25, -0.6, az) * smoothstep(-1.65, -1.3, az);
        float range1 = smoothstep(0.0, 0.0012, r1 - e) * step(-0.002, e);
        // low hazy peninsula to the east
        float r2 = (0.006 + 0.008 * fbm3(vec2(az * 7.0, 4.0))) * smoothstep(0.6, 0.85, az) * smoothstep(1.6, 1.25, az);
        float range2 = smoothstep(0.0, 0.0012, r2 - e) * step(-0.002, e);

        vec3 far = mix(uHorizon, uSkyAmb * 0.9 + uZenith * 0.25, 0.42);
        float sunSide = clamp(dot(normalize(vec2(sin(az), cos(az))), normalize(uSunDir.xz + 1e-4)), -1.0, 1.0);
        vec3 fujiCol = mix(far, far * 0.82, 0.5 + 0.5 * x);
        // snow cap
        float snowLine = 0.054 + 0.007 * vnoise(vec2(az * 260.0, 1.0)) + 0.005 * sin(az * 180.0);
        float snow = smoothstep(snowLine, snowLine + 0.002, e);
        vec3 snowCol = mix(uHorizon * 1.05 + 0.08, uCloudShade, 0.25 + 0.25 * x);
        fujiCol = mix(fujiCol, snowCol, snow);
        // against a low sun the mountain becomes a silhouette
        float sil = smoothstep(0.25, 0.0, uSunDir.y) * smoothstep(0.2, 0.95, sunSide);
        fujiCol = mix(fujiCol, uSkyAmb * 0.55 + uZenith * 0.12, sil * 0.75);
        vec3 r1Col = mix(far, uHorizon, 0.35);
        r1Col = mix(r1Col, uSkyAmb * 0.6 + uZenith * 0.1, sil * 0.6);
        col = mix(col, mix(r1Col, uHorizon, 0.2), range2 * 0.8);
        col = mix(col, r1Col, range1);
        col = mix(col, fujiCol, fuji);
        return col;
      }

      void main() {
        vec3 d = normalize(vDir);
        float e = d.y;
        float az = atan(d.x, d.z);
        float t = uTime;

        // base gradient
        float g = pow(clamp(e, 0.0, 1.0), 0.42);
        vec3 col = mix(uHorizon, uZenith, g);
        col = mix(col, uHorizon * 1.06, exp(-max(e, 0.0) * 22.0) * 0.55);

        // sun glow
        float sd = max(dot(d, uSunDir), 0.0);
        col += uSunGlow * (pow(sd, 5.0) * 0.35 + pow(sd, 48.0) * 0.6);

        // stars
        if (uStars > 0.01) {
          vec3 sp = d * 220.0;
          vec3 cell = floor(sp);
          float h = hash13(cell);
          if (h > 0.985) {
            vec3 f = fract(sp) - 0.5;
            float tw = 0.6 + 0.4 * sin(t * (2.0 + h * 5.0) + h * 40.0);
            float star = smoothstep(0.12, 0.0, length(f)) * tw * smoothstep(0.02, 0.2, e);
            col += vec3(0.9, 0.92, 1.0) * star * uStars * 1.4;
          }
          // milky haze band
          float mw = smoothstep(0.25, 0.0, abs(dot(d, normalize(vec3(0.4, 0.5, -0.75))))) * fbm3(d.xz * 6.0 + d.y * 3.0);
          col += vec3(0.25, 0.28, 0.4) * mw * uStars * 0.25;
        }

        // moon
        float md = max(dot(d, uMoonDir), 0.0);
        float moon = smoothstep(0.99955, 0.9997, md);
        col += vec3(0.6, 0.65, 0.8) * pow(md, 60.0) * 0.4 * uNight;
        col = mix(col, vec3(1.25, 1.22, 1.1), moon * uNight);

        // sun disk (HDR so it blooms)
        float disk = smoothstep(0.99935, 0.99965, sd) * uSunDisk;

        if (e > -0.02) {
          col = mountains(col, az, e);
        }
        col = mix(col, uSunColor * 6.0 + vec3(3.0), disk * step(-0.01, e));

        if (e > 0.0) {
          // cirrus
          float ci = cirrus(d, t) * smoothstep(0.03, 0.25, e);
          vec3 ciCol = mix(uCloudLit, uHorizon, 0.25) * 1.02;
          col = mix(col, ciCol, ci * 0.65);
          // cumulus
          vec2 cu = cumulus(d, t);
          float fadeH = smoothstep(0.06, 0.22, e);
          vec3 cuCol = mix(uCloudShade, uCloudLit, cu.y);
          // rim glow when near the sun
          cuCol += uSunGlow * pow(sd, 10.0) * 0.8 * (1.0 - cu.y * 0.5);
          col = mix(col, cuCol, cu.x * fadeH);
        } else {
          // below horizon (normally covered by the sea)
          col = mix(uHorizon * 0.85, uSkyAmb * 0.6, clamp(-e * 6.0, 0.0, 1.0));
        }
        gl_FragColor = vec4(col, 0.0);
      }
    `,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 900;
  mesh.name = 'sky';
  return mesh;
}
