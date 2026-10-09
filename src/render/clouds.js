import * as THREE from 'three';
import { RNG } from '../core/rng.js';
import { G } from './materials.js';

// Painted anime cumulus: procedurally drawn cloud sprites (union of shaded
// circles with flat bases) placed on the sky dome and lit by the time of day.

function paintCloud(rng, w, h, kind) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  // channels: R = lit amount (top/sun side), G = shade, A = coverage
  const base = h * (kind === 'tower' ? 0.9 : 0.8);
  const blobs = [];
  if (kind === 'tower') {
    // towering cumulus: stacked domes narrowing upward
    const levels = 6;
    for (let l = 0; l < levels; l++) {
      const t = l / (levels - 1);
      const cy = base - t * h * 0.72;
      const half = w * (0.42 - t * 0.26);
      const n = 5 + Math.round((1 - t) * 6);
      for (let i = 0; i < n; i++) {
        const x = w / 2 + (i / (n - 1) - 0.5) * 2 * half * rng.range(0.85, 1.0) + rng.range(-w * 0.03, w * 0.03);
        const r = h * rng.range(0.09, 0.15) * (1.15 - t * 0.35);
        blobs.push({ x, y: cy - rng.range(0, r * 0.4), r });
      }
    }
  } else {
    const n = kind === 'small' ? 9 : 16;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const x = w * (0.1 + t * 0.8) + rng.range(-w * 0.03, w * 0.03);
      const center = 1 - Math.abs(t - 0.5) * 2;
      const r = h * rng.range(0.16, 0.26) * (0.55 + center * 0.6);
      blobs.push({ x, y: base - r * rng.range(0.55, 0.95) - center * h * 0.12, r });
    }
    for (let i = 0; i < n * 0.6; i++) {
      const x = w * rng.range(0.25, 0.75);
      const r = h * rng.range(0.12, 0.2);
      blobs.push({ x, y: base - h * rng.range(0.3, 0.55), r });
    }
  }
  // 1) silhouette in the shade tone
  g.fillStyle = 'rgb(150,150,150)';
  for (const b of blobs) {
    g.beginPath();
    g.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    g.fill();
  }
  // 2) lit caps: circles nudged toward the light, kept inside the silhouette
  g.globalCompositeOperation = 'source-atop';
  for (const b of blobs) {
    const lx = b.x - b.r * 0.16, ly = b.y - b.r * 0.26, lr = b.r * 0.86;
    const gr = g.createRadialGradient(lx - lr * 0.2, ly - lr * 0.3, lr * 0.1, lx, ly, lr);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.7, 'rgba(246,246,246,1)');
    gr.addColorStop(0.92, 'rgba(225,225,225,0.85)');
    gr.addColorStop(1, 'rgba(210,210,210,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.arc(lx, ly, lr, 0, Math.PI * 2);
    g.fill();
  }
  g.globalCompositeOperation = 'source-over';
  // flat base: cut below the base line, darken the lower band
  g.globalCompositeOperation = 'destination-out';
  g.fillStyle = 'rgba(0,0,0,1)';
  g.fillRect(0, base, w, h - base);
  g.globalCompositeOperation = 'source-atop';
  const lg = g.createLinearGradient(0, base - h * 0.35, 0, base);
  lg.addColorStop(0, 'rgba(120,120,120,0)');
  lg.addColorStop(1, 'rgba(120,120,120,0.75)');
  g.fillStyle = lg;
  g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = 'source-over';
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.NoColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}

export function createClouds() {
  const rng = new RNG(4321);
  const textures = [];
  for (let i = 0; i < 3; i++) textures.push({ tex: paintCloud(rng, 512, 384, 'tower'), kind: 'tower' });
  for (let i = 0; i < 4; i++) textures.push({ tex: paintCloud(rng, 512, 192, 'wide'), kind: 'wide' });
  for (let i = 0; i < 3; i++) textures.push({ tex: paintCloud(rng, 256, 128, 'small'), kind: 'small' });

  const group = new THREE.Group();
  group.name = 'clouds';
  const sprites = [];
  const geo = new THREE.PlaneGeometry(1, 1);
  geo.translate(0, 0.5, 0);
  const R = 3200;
  const add = (texIdx, az, el, size, aspect) => {
    const t = textures[texIdx];
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.SrcAlphaFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.ZeroFactor,
      blendDstAlpha: THREE.OneFactor,
      uniforms: {
        map: { value: t.tex },
        uCloudLit: G.uCloudLit,
        uCloudShade: G.uCloudShade,
        uSunDir: G.uSunDir,
        uSunGlow: G.uSunGlow,
        uHorizon: G.uHorizon,
        uNight: G.uNight,
        uDir: { value: new THREE.Vector3() },
        uFade: { value: 1 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position.z = gl_Position.w * 0.99999;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D map;
        uniform vec3 uCloudLit;
        uniform vec3 uCloudShade;
        uniform vec3 uSunDir;
        uniform vec3 uSunGlow;
        uniform vec3 uHorizon;
        uniform float uNight;
        uniform vec3 uDir;
        uniform float uFade;
        varying vec2 vUv;
        void main() {
          vec4 t = texture2D(map, vUv);
          if (t.a < 0.01) discard;
          float lit = t.r;
          // two-tone anime shading with a soft step
          float k = smoothstep(0.62, 0.8, lit);
          vec3 col = mix(uCloudShade, uCloudLit, mix(k, lit, 0.35));
          // sun side warm rim / silver lining when the sun sits behind
          float sd = max(dot(normalize(uDir), uSunDir), 0.0);
          col += uSunGlow * (pow(sd, 6.0) * 0.9) * (0.4 + 0.6 * (1.0 - k));
          // low parts melt into the horizon haze
          col = mix(col, uHorizon, (1.0 - vUv.y) * 0.25 + 0.08);
          gl_FragColor = vec4(col, t.a * uFade);
        }
      `,
    });
    mat.uniforms.uDir.value.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
    const m = new THREE.Mesh(geo, mat);
    m.frustumCulled = false;
    m.renderOrder = -10;
    m.userData = { az, el, size, aspect, speed: rng.range(0.0006, 0.0014) };
    group.add(m);
    sprites.push(m);
  };
  // towering clouds mostly over the sea (south, az ~ 0) and the western sky
  const towers = [[0.15, 0.012, 1250], [-0.55, 0.01, 1050], [0.75, 0.008, 900], [-1.2, 0.01, 800], [2.6, 0.02, 700], [-2.4, 0.015, 750]];
  towers.forEach(([az, el, s], i) => add(i % 3, az, el, s, 384 / 512));
  for (let i = 0; i < 14; i++) {
    const az = rng.range(-Math.PI, Math.PI);
    const el = rng.range(0.03, 0.22);
    const wide = rng.chance(0.6);
    add(wide ? 3 + (i % 4) : 7 + (i % 3), az, el, wide ? rng.range(600, 1000) : rng.range(300, 520), wide ? 192 / 512 : 0.5);
  }
  group.userData.update = (camera, t) => {
    for (const m of sprites) {
      const u = m.userData;
      const az = u.az + t * u.speed;
      const d = new THREE.Vector3(Math.sin(az) * Math.cos(u.el), Math.sin(u.el), Math.cos(az) * Math.cos(u.el));
      m.position.copy(camera.position).addScaledVector(d, R);
      m.position.y -= u.size * u.aspect * 0.12;
      m.scale.set(u.size, u.size * u.aspect, 1);
      m.lookAt(camera.position.x, m.position.y, camera.position.z);
      m.material.uniforms.uDir.value.copy(d);
    }
  };
  return group;
}
