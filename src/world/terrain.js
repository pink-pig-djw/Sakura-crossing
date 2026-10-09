import * as THREE from 'three';
import { terrainH, SEAWALL_Z, outsideDist, shoreZ } from './layout.js';
import { fbm2, noise2, smoothstep, clamp } from '../core/rng.js';
import { PAT } from '../core/builder.js';
import { createGroundMaterial } from '../render/materials.js';

// Painted ground map: RGB color + pattern id, rasterized by the generators
// (yards, plazas, park ...) and uploaded once as a texture.
export class GroundMap {
  constructor(x0, z0, x1, z1, ppm) {
    this.x0 = x0;
    this.z0 = z0;
    this.w = Math.round((x1 - x0) * ppm);
    this.h = Math.round((z1 - z0) * ppm);
    this.ppm = ppm;
    this.data = new Uint8Array(this.w * this.h * 4);
    this._c = new THREE.Color();
    // unpainted texels carry the default grass tint (type 0 = keep vertex color)
    const [r, g, b] = this._rgb(0x9fbf6a);
    for (let i = 0; i < this.data.length; i += 4) {
      this.data[i] = r;
      this.data[i + 1] = g;
      this.data[i + 2] = b;
      this.data[i + 3] = 0;
    }
  }

  _rgb(hex) {
    // paint in sRGB bytes (texture is tagged sRGB)
    this._c.setHex(typeof hex === 'number' ? hex : parseInt(String(hex).replace('#', ''), 16), THREE.SRGBColorSpace);
    const c = this._c.getHex(THREE.SRGBColorSpace);
    return [(c >> 16) & 255, (c >> 8) & 255, c & 255];
  }

  // Fill a rectangle (world coords). jitter adds painterly value noise.
  rect(x0, z0, x1, z1, color, pattern, opts = {}) {
    const [r, g, b] = this._rgb(color);
    const ppm = this.ppm;
    const px0 = Math.max(0, Math.floor((Math.min(x0, x1) - this.x0) * ppm));
    const px1 = Math.min(this.w, Math.ceil((Math.max(x0, x1) - this.x0) * ppm));
    const pz0 = Math.max(0, Math.floor((Math.min(z0, z1) - this.z0) * ppm));
    const pz1 = Math.min(this.h, Math.ceil((Math.max(z0, z1) - this.z0) * ppm));
    const jit = opts.jitter ?? 0.06;
    const d = this.data;
    for (let pz = pz0; pz < pz1; pz++) {
      for (let px = px0; px < px1; px++) {
        const wx = this.x0 + (px + 0.5) / ppm;
        const wz = this.z0 + (pz + 0.5) / ppm;
        if (opts.round) {
          const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
          const rx = Math.abs(x1 - x0) / 2, rz = Math.abs(z1 - z0) / 2;
          const q = ((wx - cx) / rx) ** 2 + ((wz - cz) / rz) ** 2;
          if (q > 1) continue;
        }
        const n = 1 + (noise2(wx * 0.35, wz * 0.35) - 0.5) * jit * 2;
        const i = (pz * this.w + px) * 4;
        d[i] = clamp(r * n, 0, 255);
        d[i + 1] = clamp(g * n, 0, 255);
        d[i + 2] = clamp(b * n, 0, 255);
        d[i + 3] = pattern + 1;
      }
    }
  }

  circle(x, z, r, color, pattern, opts = {}) {
    this.rect(x - r, z - r, x + r, z + r, color, pattern, { ...opts, round: true });
  }

  // sprinkle petals (pink speckles) under a sakura tree
  petals(x, z, r, density = 0.25) {
    const ppm = this.ppm;
    const px0 = Math.max(0, Math.floor((x - r - this.x0) * ppm));
    const px1 = Math.min(this.w, Math.ceil((x + r - this.x0) * ppm));
    const pz0 = Math.max(0, Math.floor((z - r - this.z0) * ppm));
    const pz1 = Math.min(this.h, Math.ceil((z + r - this.z0) * ppm));
    const d = this.data;
    for (let pz = pz0; pz < pz1; pz++) {
      for (let px = px0; px < px1; px++) {
        const wx = this.x0 + (px + 0.5) / ppm;
        const wz = this.z0 + (pz + 0.5) / ppm;
        const q = Math.hypot(wx - x, wz - z) / r;
        if (q > 1) continue;
        const i = (pz * this.w + px) * 4;
        if (d[i + 3] === 0) continue;
        const k = (1 - q * q) * density * (0.4 + noise2(wx * 1.7, wz * 1.7));
        const mixk = clamp(k, 0, 0.75);
        d[i] = d[i] * (1 - mixk) + 246 * mixk;
        d[i + 1] = d[i + 1] * (1 - mixk) + 196 * mixk;
        d[i + 2] = d[i + 2] * (1 - mixk) + 212 * mixk;
      }
    }
  }

  toTexture() {
    const tex = new THREE.DataTexture(this.data, this.w, this.h, THREE.RGBAFormat, THREE.UnsignedByteType);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.generateMipmaps = true;
    tex.anisotropy = 4;
    tex.needsUpdate = true;
    return tex;
  }
}

function axisSamples(segments) {
  // segments: [[from, to, step], ...] contiguous
  const out = [];
  for (const [a, b, s] of segments) {
    const n = Math.max(1, Math.round((b - a) / s));
    for (let i = 0; i < n; i++) out.push(a + ((b - a) * i) / n);
  }
  out.push(segments[segments.length - 1][1]);
  return out;
}

const C_GRASS = new THREE.Color('#9fbf6a');
const C_GRASS_DRY = new THREE.Color('#b9b47a');
const C_FOREST = new THREE.Color('#6f9a55');
const C_FOREST_DK = new THREE.Color('#5a8550');
const C_SAND = new THREE.Color('#e2d0aa');
const C_SAND_WET = new THREE.Color('#cdb994');
const C_SEABED = new THREE.Color('#c9b48e');
const C_ROCK = new THREE.Color('#9a9086');

export function buildTerrain(groundMap) {
  const xs = axisSamples([
    [-900, -260, 20],
    [-260, -212, 4],
    [-212, 212, 2],
    [212, 260, 4],
    [260, 900, 20],
  ]);
  const zs = axisSamples([
    [-900, -260, 20],
    [-260, -182, 4],
    [-182, 140, 2],
    [140, 260, 5],
    [260, 700, 25],
  ]);
  const nx = xs.length, nz = zs.length;
  const pos = new Float32Array(nx * nz * 3);
  const nor = new Float32Array(nx * nz * 3);
  const col = new Float32Array(nx * nz * 3);
  const uv = new Float32Array(nx * nz * 2);
  const pat = new Float32Array(nx * nz);
  const tmp = new THREE.Color();
  let k = 0;
  for (let j = 0; j < nz; j++) {
    const z = zs[j];
    for (let i = 0; i < nx; i++) {
      const x = xs[i];
      const y = terrainH(x, z);
      pos[k * 3] = x;
      pos[k * 3 + 1] = y;
      pos[k * 3 + 2] = z;
      const e = 0.6;
      const dx = terrainH(x + e, z) - terrainH(x - e, z);
      const dz = terrainH(x, z + e) - terrainH(x, z - e);
      const n = new THREE.Vector3(-dx, 2 * e, -dz).normalize();
      nor[k * 3] = n.x;
      nor[k * 3 + 1] = n.y;
      nor[k * 3 + 2] = n.z;
      // base color / pattern
      const out = outsideDist(x, z);
      let p = PAT.GRASS;
      if (z > SEAWALL_Z) {
        const s = shoreZ(x);
        const t = smoothstep(s - 3, s + 6, z);
        tmp.copy(C_SAND).lerp(C_SAND_WET, smoothstep(s - 6, s, z) * 0.6).lerp(C_SEABED, t);
        p = PAT.SAND;
        if (out > 0) {
          const hk = smoothstep(0, 10, out);
          const slope = 1 - n.y;
          if (slope > 0.35 || y < 2.5) {
            tmp.lerp(C_ROCK, hk);
            if (hk > 0.5) p = PAT.ROCK;
          } else {
            tmp.lerp(C_FOREST, hk);
            if (hk > 0.5) p = PAT.GRASS;
          }
        }
      } else if (out > 0) {
        const f = fbm2(x * 0.02, z * 0.02, 3);
        tmp.copy(C_FOREST).lerp(C_FOREST_DK, f);
        const slope = 1 - n.y;
        if (slope > 0.5) {
          tmp.lerp(C_ROCK, 0.6);
          p = PAT.ROCK;
        }
        tmp.lerp(C_GRASS, 1 - smoothstep(0, 12, out));
      } else {
        const f = noise2(x * 0.05, z * 0.05);
        tmp.copy(C_GRASS).lerp(C_GRASS_DRY, f * 0.6);
      }
      col[k * 3] = tmp.r;
      col[k * 3 + 1] = tmp.g;
      col[k * 3 + 2] = tmp.b;
      uv[k * 2] = x;
      uv[k * 2 + 1] = z;
      pat[k] = p;
      k++;
    }
  }
  const idx = new Uint32Array((nx - 1) * (nz - 1) * 6);
  let t = 0;
  for (let j = 0; j < nz - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i;
      const b = a + 1;
      const c = a + nx;
      const d = c + 1;
      idx[t++] = a;
      idx[t++] = c;
      idx[t++] = b;
      idx[t++] = b;
      idx[t++] = c;
      idx[t++] = d;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('pattern', new THREE.BufferAttribute(pat, 1));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingSphere();

  const tex = groundMap.toTexture();
  const mat = createGroundMaterial(tex, new THREE.Vector4(groundMap.x0, groundMap.z0, groundMap.w / groundMap.ppm, groundMap.h / groundMap.ppm));
  const mesh = new THREE.Mesh(g, mat);
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.name = 'terrain';
  mesh.matrixAutoUpdate = false;
  return mesh;
}
