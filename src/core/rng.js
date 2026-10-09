// Deterministic randomness and lightweight noise used by the world generator.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class RNG {
  constructor(seed = 1) {
    this.rand = mulberry32(seed);
  }
  next() {
    return this.rand();
  }
  range(a, b) {
    return a + (b - a) * this.rand();
  }
  int(a, b) {
    return Math.floor(a + (b - a + 1) * this.rand());
  }
  pick(arr) {
    return arr[Math.floor(this.rand() * arr.length) % arr.length];
  }
  chance(p) {
    return this.rand() < p;
  }
  // weighted pick: [[value, weight], ...]
  weighted(list) {
    let total = 0;
    for (const [, w] of list) total += w;
    let r = this.rand() * total;
    for (const [v, w] of list) {
      r -= w;
      if (r <= 0) return v;
    }
    return list[list.length - 1][0];
  }
  sign() {
    return this.rand() < 0.5 ? -1 : 1;
  }
}

export function hashStr(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function hash2i(x, y) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const fade = (t) => t * t * (3 - 2 * t);

// Smooth value noise in [0, 1].
export function noise2(x, y) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const a = hash2i(ix, iy);
  const b = hash2i(ix + 1, iy);
  const c = hash2i(ix, iy + 1);
  const d = hash2i(ix + 1, iy + 1);
  const u = fade(fx);
  const v = fade(fy);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function fbm2(x, y, octaves = 4) {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += noise2(x, y) * amp;
    norm += amp;
    x = x * 2.03 + 17.1;
    y = y * 2.03 - 9.7;
    amp *= 0.5;
  }
  return sum / norm;
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
// Smooth maximum of (0, x) with a soft knee of width k.
export const softPlus = (x, k) => {
  if (x > k) return x;
  if (x < -k) return 0;
  return ((x + k) * (x + k)) / (4 * k);
};
