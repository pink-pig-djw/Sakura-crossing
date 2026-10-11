import * as THREE from 'three';
import { terrainH, SEAWALL_Z, outsideDist, shoreZ, RIVER, HOLES, inRiver } from './layout.js';
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

  // paint texel by texel over a box: fn(x, z) -> null (leave it) or [color, pattern, jitter?]
  paint(x0, z0, x1, z1, fn) {
    const ppm = this.ppm;
    const px0 = Math.max(0, Math.floor((Math.min(x0, x1) - this.x0) * ppm));
    const px1 = Math.min(this.w, Math.ceil((Math.max(x0, x1) - this.x0) * ppm));
    const pz0 = Math.max(0, Math.floor((Math.min(z0, z1) - this.z0) * ppm));
    const pz1 = Math.min(this.h, Math.ceil((Math.max(z0, z1) - this.z0) * ppm));
    const d = this.data;
    let lastHex = null, rgb = null;
    for (let pz = pz0; pz < pz1; pz++) {
      for (let px = px0; px < px1; px++) {
        const wx = this.x0 + (px + 0.5) / ppm;
        const wz = this.z0 + (pz + 0.5) / ppm;
        const r = fn(wx, wz);
        if (!r) continue;
        if (r[0] !== lastHex) {
          lastHex = r[0];
          rgb = this._rgb(r[0]);
        }
        const n = 1 + (noise2(wx * 0.35, wz * 0.35) - 0.5) * (r[2] ?? 0.06) * 2;
        const i = (pz * this.w + px) * 4;
        d[i] = clamp(rgb[0] * n, 0, 255);
        d[i + 1] = clamp(rgb[1] * n, 0, 255);
        d[i + 2] = clamp(rgb[2] * n, 0, 255);
        d[i + 3] = r[1] + 1;
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

// vertex tint of grassy (unpainted) terrain at (x, z) with outside distance `out`
export function grassTint(x, z, out, target) {
  if (out > 0) {
    target.copy(C_FOREST).lerp(C_FOREST_DK, fbm2(x * 0.02, z * 0.02, 3));
    return target.lerp(C_GRASS, 1 - smoothstep(0, 12, out));
  }
  return target.copy(C_GRASS).lerp(C_GRASS_DRY, noise2(x * 0.05, z * 0.05) * 0.6);
}
const C_SAND = new THREE.Color('#e2d0aa');
const C_SAND_WET = new THREE.Color('#cdb994');
const C_SEABED = new THREE.Color('#c9b48e');
const C_ROCK = new THREE.Color('#9a9086');
const C_RIVERBED = new THREE.Color('#8f8a7a');
const C_RIVERBED_DK = new THREE.Color('#6f7466');

export function buildTerrain(groundMap) {
  // 2 m grid over the town (aligned to even coordinates: stairwell holes and the river
  // walls sit on grid lines), coarser over the hills and the sea
  const xs = axisSamples([
    [-1000, -480, 20],
    [-480, -440, 4],
    [-440, 700, 2],
    [700, 740, 4],
    [740, 1300, 20],
  ]);
  const zs = axisSamples([
    [-900, -332, 20],
    [-332, -292, 4],
    [-292, 150, 2],
    [150, 260, 5],
    [260, 700, 25],
  ]);
  const pos = [], nor = [], col = [], uv = [], pat = [], idx = [];
  const tmp = new THREE.Color();
  const vertex = (x, z, yAt = null) => {
      const y = yAt ?? terrainH(x, z);
      pos.push(x, y, z);
      const e = 0.6;
      const dx = terrainH(x + e, z) - terrainH(x - e, z);
      const dz = terrainH(x, z + e) - terrainH(x, z - e);
      const n = new THREE.Vector3(-dx, 2 * e, -dz).normalize();
      nor.push(n.x, n.y, n.z);
      // base color / pattern
      const out = outsideDist(x, z);
      let p = PAT.GRASS;
      if (inRiver(x, z) || (Math.abs(x - RIVER.x) <= RIVER.inner + 0.01 && z >= RIVER.zHead && z <= SEAWALL_Z + 1.4)) {
        // pebbly river bed, mossier toward the walls
        const f = noise2(x * 0.3, z * 0.3);
        tmp.copy(C_RIVERBED).lerp(C_RIVERBED_DK, 0.25 + f * 0.5);
        if (z > SEAWALL_Z + 2) tmp.lerp(C_SAND_WET, smoothstep(SEAWALL_Z, shoreZ(x), z) * 0.8);
        p = PAT.GRAVEL;
      } else if (z > SEAWALL_Z) {
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
      col.push(tmp.r, tmp.g, tmp.b);
      uv.push(x, z);
      pat.push(p);
  };
  const nx = xs.length, nz = zs.length;
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) vertex(xs[i], zs[j]);
  // finer tiles where the 2 m grid can't follow the ground (rice terrace risers, mikan
  // walls, road cuttings and embankments on steep slopes, the shrine's retaining walls):
  // there the 2 m triangles would show the ground metres away from where you stand on it.
  // Each 8 m tile whose 2 m triangles miss the ground by more than ERR is cut out of the
  // grid and remade at 1 m, or 0.5 m where even that misses
  const T = 8, ERR = 0.18, TX0 = -440, TX1 = 700, TZ0 = -292, TZ1 = 150;
  const TW = Math.floor((TX1 - TX0) / T), TH = Math.floor((TZ1 - TZ0) / T);
  const tileStep = new Float32Array(TW * TH).fill(2);
  // (the triangles of a grid of step s over the tile at (tx, tz), whose corners are cs)
  const missBy = (tx, tz, s, q) => {
    const n = T / s, cs = [];
    for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) cs.push(terrainH(tx + i * s, tz + j * s));
    let m = 0;
    for (let z = 0; z <= T + 1e-6; z += q) {
      for (let x = 0; x <= T + 1e-6; x += q) {
        const i = Math.min(n - 1, Math.floor(x / s)), j = Math.min(n - 1, Math.floor(z / s)), u = x / s - i, v = z / s - j;
        if ((u === 0 || u === 1) && (v === 0 || v === 1)) continue;
        const a = cs[j * (n + 1) + i], b = cs[j * (n + 1) + i + 1], c = cs[(j + 1) * (n + 1) + i], d = cs[(j + 1) * (n + 1) + i + 1];
        const y = u + v <= 1 ? a + (b - a) * u + (c - a) * v : d + (c - d) * (1 - u) + (b - d) * (1 - v);
        m = Math.max(m, Math.abs(terrainH(tx + x, tz + z) - y));
        if (m > ERR) return m;
      }
    }
    return m;
  };
  for (let tj = 0; tj < TH; tj++) {
    for (let ti = 0; ti < TW; ti++) {
      const tx = TX0 + ti * T, tz = TZ0 + tj * T;
      if (HOLES.some((h) => tx < h.x1 && tx + T > h.x0 && tz < h.z1 && tz + T > h.z0)) continue;
      if (missBy(tx, tz, 2, 1) <= ERR) continue;
      tileStep[tj * TW + ti] = missBy(tx, tz, 1, 0.5) <= ERR ? 1 : 0.5;
    }
  }
  const tileAt = (x, z) => {
    const ti = Math.floor((x - TX0) / T), tj = Math.floor((z - TZ0) / T);
    return ti < 0 || tj < 0 || ti >= TW || tj >= TH ? 2 : tileStep[tj * TW + ti];
  };
  // stairwell openings (subway exits) and the finer tiles are cut out of the mesh
  const inHole = (x, z) => HOLES.some((h) => x > h.x0 && x < h.x1 && z > h.z0 && z < h.z1) || tileAt(x, z) < 2;
  for (let j = 0; j < nz - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      if (inHole((xs[i] + xs[i + 1]) / 2, (zs[j] + zs[j + 1]) / 2)) continue;
      const a = j * nx + i;
      const b = a + 1;
      const c = a + nx;
      const d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  let fine = 0;
  for (let tj = 0; tj < TH; tj++) {
    for (let ti = 0; ti < TW; ti++) {
      const s = tileStep[tj * TW + ti];
      if (s >= 2) continue;
      fine++;
      const tx = TX0 + ti * T, tz = TZ0 + tj * T, m = T / s;
      // (on an edge shared with a coarser neighbour: on the straight line between its points,
      // so the two meet without a crack)
      const sw = Math.max(s, tileAt(tx - 1, tz + 1)), se = Math.max(s, tileAt(tx + T + 1, tz + 1));
      const sn = Math.max(s, tileAt(tx + 1, tz - 1)), ss = Math.max(s, tileAt(tx + 1, tz + T + 1));
      const along = (x, z, alongX, st) => {
        const c = alongX ? x : z;
        const a = Math.floor(c / st + 1e-6) * st, t = (c - a) / st;
        if (t < 1e-6) return alongX ? terrainH(a, z) : terrainH(x, a);
        const ya = alongX ? terrainH(a, z) : terrainH(x, a), yb = alongX ? terrainH(a + st, z) : terrainH(x, a + st);
        return ya + (yb - ya) * t;
      };
      const base = pos.length / 3;
      for (let j = 0; j <= m; j++) {
        for (let i = 0; i <= m; i++) {
          const x = tx + i * s, z = tz + j * s;
          let y = null;
          if (j === 0) y = along(x, z, true, sn);
          else if (j === m) y = along(x, z, true, ss);
          else if (i === 0) y = along(x, z, false, sw);
          else if (i === m) y = along(x, z, false, se);
          vertex(x, z, y);
        }
      }
      for (let j = 0; j < m; j++) {
        for (let i = 0; i < m; i++) {
          const a = base + j * (m + 1) + i, b = a + 1, c = a + m + 1, d = c + 1;
          idx.push(a, c, b, b, c, d);
        }
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('pattern', new THREE.Float32BufferAttribute(pat, 1));
  g.setIndex(new THREE.BufferAttribute(new Uint32Array(idx), 1));
  g.computeBoundingSphere();

  const tex = groundMap.toTexture();
  const mat = createGroundMaterial(tex, new THREE.Vector4(groundMap.x0, groundMap.z0, groundMap.w / groundMap.ppm, groundMap.h / groundMap.ppm));
  const mesh = new THREE.Mesh(g, mat);
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.name = 'terrain';
  mesh.userData.fineTiles = fine;
  mesh.matrixAutoUpdate = false;
  return mesh;
}
