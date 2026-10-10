import * as THREE from 'three';
import { RNG } from '../core/rng.js';
import { createFoliageMaterial } from '../render/materials.js';

// Foliage cards shared by trees, hedges, shrubs and flower beds: camera-facing,
// alpha-tested painted clumps shaded with clump-level normals (see FOLIAGE_VERT).
// Any builder can add cards while the active set is installed (useFoliage).

const V = (x, y, z) => new THREE.Vector3(x, y, z);

export class FoliageBuilder {
  constructor() {
    this.pos = [];
    this.nor = [];
    this.col = [];
    this.center = [];
    this.card = [];
    this.idx = [];
    this.count = 0;
  }
  card4(p, n, c, center, size, rot) {
    const base = this.count;
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    for (const [cx, cy] of corners) {
      this.pos.push(p.x, p.y, p.z);
      this.nor.push(n.x, n.y, n.z);
      this.col.push(c.r, c.g, c.b);
      this.center.push(center.x, center.y, center.z);
      this.card.push(cx, cy, size, rot);
    }
    this.count += 4;
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  toGeometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('center', new THREE.Float32BufferAttribute(this.center, 3));
    g.setAttribute('card', new THREE.Float32BufferAttribute(this.card, 4));
    g.setIndex(this.count > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    g.boundingSphere.radius += 4;
    return g;
  }
}

export class FoliageSet {
  constructor(chunk = 64) {
    this.chunk = chunk;
    this.map = new Map();
  }
  get(kind, x, z) {
    const key = kind + '|' + Math.floor(x / this.chunk) + '|' + Math.floor(z / this.chunk);
    let b = this.map.get(key);
    if (!b) {
      b = new FoliageBuilder();
      b.kind = kind;
      this.map.set(key, b);
    }
    return b;
  }
}

let active = null;
export function useFoliage(fs) {
  active = fs;
}
export function activeFoliage() {
  return active;
}

// ---------------------------------------------------------------------------
// painted card textures (grayscale value = painted shading; the vertex color tints)
// ---------------------------------------------------------------------------
function leafPath(g, x, y, a, len, wid) {
  const ca = Math.cos(a), sa = Math.sin(a);
  const tx = x + ca * len, ty = y + sa * len;
  const mx = x + ca * len * 0.42, my = y + sa * len * 0.42;
  const nx = -sa * wid, ny = ca * wid;
  g.beginPath();
  g.moveTo(x, y);
  g.quadraticCurveTo(mx + nx, my + ny, tx, ty);
  g.quadraticCurveTo(mx - nx, my - ny, x, y);
  g.closePath();
}

const gray = (v) => {
  const k = Math.max(0, Math.min(255, Math.round(v)));
  return `rgb(${k},${k},${k})`;
};

// clumps of leaves or blossoms: a solid painted core so the card reads full at a
// distance, then individual leaves / five-petal flowers that break the outline
function clumpTexture(kind) {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const g = c.getContext('2d');
  const seed = { blossom: 11, leaf: 37, hedge: 53, shrub: 71 }[kind] ?? 5;
  const rnd = new RNG(seed);
  const cfg = {
    leaf: { n: 12, rad: [0.12, 0.19], spread: 0.3, len: [10, 16], wid: [0.32, 0.42], per: 2.3 },
    shrub: { n: 8, rad: [0.14, 0.21], spread: 0.25, len: [9, 13], wid: [0.42, 0.52], per: 2.6 },
    hedge: { n: 6, rad: [0.2, 0.27], spread: 0.18, len: [6, 9], wid: [0.4, 0.5], per: 6.5 },
    blossom: { n: 13, rad: [0.13, 0.2], spread: 0.3, len: [0, 0], wid: [0, 0], per: 3.4 },
  }[kind];
  const cx = S / 2, cy = S / 2;
  const clumps = [];
  for (let i = 0; i < cfg.n; i++) {
    const a = rnd.next() * Math.PI * 2;
    const r = Math.sqrt(rnd.next()) * S * cfg.spread;
    clumps.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r * 0.9, r: rnd.range(S * cfg.rad[0], S * cfg.rad[1]) });
  }
  clumps.sort((p, q) => p.y - q.y);
  // light comes from the upper left of each clump
  const lightAt = (cl, x, y) => Math.max(0, Math.min(1, 0.55 + ((cl.x - x) * 0.45 + (cl.y - y) * 0.75) / cl.r * 0.5));
  for (const cl of clumps) {
    const core = g.createRadialGradient(cl.x - cl.r * 0.25, cl.y - cl.r * 0.3, cl.r * 0.1, cl.x, cl.y, cl.r * 0.8);
    const hi = kind === 'blossom' ? 205 : 150, lo = kind === 'blossom' ? 160 : 98;
    core.addColorStop(0, gray(hi));
    core.addColorStop(1, gray(lo));
    g.fillStyle = core;
    g.beginPath();
    g.arc(cl.x, cl.y, cl.r * 0.8, 0, Math.PI * 2);
    g.fill();
    const n = Math.round(cl.r * cfg.per);
    for (let k = 0; k < n; k++) {
      const a = rnd.next() * Math.PI * 2;
      const d = cl.r * (0.2 + 0.82 * Math.sqrt(rnd.next()));
      const x = cl.x + Math.cos(a) * d, y = cl.y + Math.sin(a) * d * 0.92;
      const L = lightAt(cl, x, y);
      if (kind === 'blossom') {
        // five-petal flower
        const fr = rnd.range(3.2, 5.2);
        const v = 175 + L * 80 + rnd.range(-12, 10);
        g.fillStyle = gray(v);
        const pa0 = rnd.next() * Math.PI;
        for (let p = 0; p < 5; p++) {
          const pa = pa0 + (p / 5) * Math.PI * 2;
          g.beginPath();
          g.ellipse(x + Math.cos(pa) * fr * 0.62, y + Math.sin(pa) * fr * 0.62, fr * 0.58, fr * 0.44, pa, 0, Math.PI * 2);
          g.fill();
        }
        g.fillStyle = gray(v - 55);
        g.beginPath();
        g.arc(x, y, fr * 0.22, 0, Math.PI * 2);
        g.fill();
      } else {
        const len = rnd.range(cfg.len[0], cfg.len[1]);
        const wid = len * rnd.range(cfg.wid[0], cfg.wid[1]);
        const ang = a + rnd.range(-0.75, 0.75);
        const v = 92 + L * 150 + rnd.range(-16, 16);
        g.fillStyle = gray(v);
        leafPath(g, x - Math.cos(ang) * len * 0.35, y - Math.sin(ang) * len * 0.35, ang, len, wid);
        g.fill();
        if (len > 9 && rnd.next() < 0.35) {
          g.strokeStyle = gray(v - 28);
          g.lineWidth = 0.8;
          g.beginPath();
          g.moveTo(x - Math.cos(ang) * len * 0.3, y - Math.sin(ang) * len * 0.3);
          g.lineTo(x + Math.cos(ang) * len * 0.5, y + Math.sin(ang) * len * 0.5);
          g.stroke();
        }
      }
    }
  }
  // a few gaps so the canopy breathes
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < (kind === 'hedge' ? 4 : 9); i++) {
    const a = rnd.next() * Math.PI * 2;
    const r = rnd.range(0.12, 0.33) * S;
    g.beginPath();
    g.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, rnd.range(2.5, 5.5), 0, Math.PI * 2);
    g.fill();
  }
  g.globalCompositeOperation = 'source-over';
  return c;
}

// sparse flower heads (tsutsuji / garden flowers) on a transparent card
function flowerTexture() {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const g = c.getContext('2d');
  const rnd = new RNG(91);
  for (let i = 0; i < 16; i++) {
    const a = rnd.next() * Math.PI * 2;
    const r = Math.sqrt(rnd.next()) * S * 0.36;
    const x0 = S / 2 + Math.cos(a) * r, y0 = S / 2 + Math.sin(a) * r * 0.8;
    const m = rnd.int(3, 6);
    for (let k = 0; k < m; k++) {
      const x = x0 + rnd.range(-14, 14), y = y0 + rnd.range(-10, 10);
      const fr = rnd.range(7, 11);
      const v = rnd.range(205, 255);
      const pa0 = rnd.next() * Math.PI;
      g.fillStyle = gray(v);
      for (let p = 0; p < 5; p++) {
        const pa = pa0 + (p / 5) * Math.PI * 2;
        g.beginPath();
        g.ellipse(x + Math.cos(pa) * fr * 0.55, y + Math.sin(pa) * fr * 0.55, fr * 0.55, fr * 0.4, pa, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = gray(v - 70);
      g.beginPath();
      g.arc(x, y, fr * 0.2, 0, Math.PI * 2);
      g.fill();
    }
  }
  return c;
}

function pineTexture() {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const g = c.getContext('2d');
  const rnd = new RNG(23);
  const cx = S / 2, cy = S / 2;
  for (let i = 0; i < 260; i++) {
    const a = rnd.next() * Math.PI * 2;
    const r = Math.sqrt(rnd.next()) * S * 0.45;
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r * 0.55;
    const shade = Math.round(255 * rnd.range(0.75, 1.0));
    g.strokeStyle = `rgb(${shade},${shade},${shade})`;
    g.lineWidth = 2.2;
    for (let k = 0; k < 7; k++) {
      const na = -Math.PI / 2 + (k - 3) * 0.32 + rnd.range(-0.1, 0.1);
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + Math.cos(na) * 14, y + Math.sin(na) * 10);
      g.stroke();
    }
  }
  return c;
}

// blades fanning up from the bottom edge, dark at the root
export function grassTexture() {
  const W = 128, H = 128;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  const rnd = new RNG(131);
  for (let i = 0; i < 46; i++) {
    const bx = rnd.range(10, W - 10);
    const h = H * rnd.range(0.4, 0.98);
    const lean = rnd.range(-0.35, 0.35) * h;
    const w = rnd.range(2.6, 4.6);
    const tip = Math.round(rnd.range(200, 250));
    const gr = g.createLinearGradient(0, H, 0, H - h);
    gr.addColorStop(0, gray(70));
    gr.addColorStop(0.55, gray(tip * 0.82));
    gr.addColorStop(1, gray(tip));
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(bx - w / 2, H);
    g.quadraticCurveTo(bx - w * 0.3 + lean * 0.35, H - h * 0.55, bx + lean, H - h);
    g.quadraticCurveTo(bx + w * 0.3 + lean * 0.35, H - h * 0.55, bx + w / 2, H);
    g.closePath();
    g.fill();
  }
  return c;
}

export function canvasTexture(canvas) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.anisotropy = 4;
  return t;
}

// ---------------------------------------------------------------------------
// card helpers
// ---------------------------------------------------------------------------
export const HEDGE_COLS = ['#5d8f4c', '#4f8445', '#679a52', '#577f45'].map((h) => new THREE.Color(h));
export const SHRUB_COLS = ['#5a8d4a', '#4c7f44', '#6a9b55', '#557c48', '#71a05a'].map((h) => new THREE.Color(h));
export const AZALEA = ['#f06ea0', '#f48fb6', '#ffffff', '#e8577d', '#f7a8c8'].map((h) => new THREE.Color(h));
export const GARDEN_FLOWERS = ['#ffd54a', '#ff8a5a', '#ffffff', '#f27aa6', '#b48ae6', '#ff5a5a'].map((h) => new THREE.Color(h));

const _c = new THREE.Color();

// (positions may be given in a builder's local frame: pass its matrix as o.m)
const toWorld = (v, m) => (m ? v.applyMatrix4(m) : v);
const dirWorld = (v, m) => (m ? v.transformDirection(m) : v);

// a round leafy bush: cards on an ellipsoid shell around (x, y, z)
export function shrub(x, y, z, r, ry, rng, o = {}) {
  if (!active) return false;
  const center = toWorld(V(x, y, z), o.m);
  const fb = active.get(o.kind ?? 'shrub', center.x, center.z);
  const cols = o.cols ?? SHRUB_COLS;
  const n = o.cards ?? Math.max(3, Math.round(3 + r * r * 9));
  const size = o.size ?? Math.max(0.28, Math.min(r, ry) * 1.25);
  for (let i = 0; i < n; i++) {
    const u = rng.next() * Math.PI * 2;
    const v = Math.acos(rng.range(-0.25, 1));
    const s = rng.range(0.25, 0.62);
    const ox = Math.sin(v) * Math.cos(u) * r * s, oy = Math.cos(v) * ry * s, oz = Math.sin(v) * Math.sin(u) * r * s;
    const p = toWorld(V(x + ox, y + oy, z + oz), o.m);
    const nrm = dirWorld(V(ox / r, oy / ry + 0.25, oz / r), o.m).normalize();
    _c.copy(cols[Math.floor(rng.next() * cols.length)]).multiplyScalar(0.92 + (oy / ry) * 0.1);
    fb.card4(p, nrm, _c, center, size * rng.range(0.85, 1.15), rng.range(0, Math.PI * 2));
  }
  if (o.flowers) flowers(x, y + ry * 0.25, z, r * 0.9, ry * 0.7, rng, { cols: o.flowers, n: o.flowerCards, size: size * 0.9, m: o.m, mixed: o.mixed });
  return true;
}

// flower heads scattered over the upper half of a bush or bed
export function flowers(x, y, z, r, ry, rng, o = {}) {
  if (!active) return false;
  const center = toWorld(V(x, y, z), o.m);
  const fb = active.get('flower', center.x, center.z);
  const cols = o.cols ?? AZALEA;
  const n = o.n ?? Math.max(2, Math.round(2 + r * r * 6));
  const base = cols[Math.floor(rng.next() * cols.length)];
  for (let i = 0; i < n; i++) {
    const u = rng.next() * Math.PI * 2;
    const v = Math.acos(rng.range(0.1, 1));
    const s = rng.range(0.55, 0.85);
    const ox = Math.sin(v) * Math.cos(u) * r * s, oy = Math.cos(v) * ry * s, oz = Math.sin(v) * Math.sin(u) * r * s;
    const p = toWorld(V(x + ox, y + oy, z + oz), o.m);
    const nrm = dirWorld(V(ox / r, oy / ry + 0.4, oz / r), o.m).normalize();
    _c.copy(o.mixed ? cols[Math.floor(rng.next() * cols.length)] : base);
    fb.card4(p, nrm, _c, center, (o.size ?? 0.45) * rng.range(0.8, 1.1), rng.range(0, Math.PI * 2));
  }
  return true;
}

// clipped hedge: leafy cards along the top edges and down the faces of a hedge
// whose core box runs from (x0,z0) to (x1,z1), `w` wide and `h` tall
export function hedgeLeaves(x0, z0, x1, z1, yFn, h, w, rng, o = {}) {
  if (!active) return false;
  const len = Math.hypot(x1 - x0, z1 - z0);
  if (len < 0.05) return false;
  const dx = (x1 - x0) / len, dz = (z1 - z0) / len;
  const nx = -dz, nz = dx; // side normal
  const cols = o.cols ?? HEDGE_COLS;
  const step = 0.36;
  const n = Math.max(1, Math.round(len / step));
  const hw = w / 2;
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * len;
    const px = x0 + dx * t, pz = z0 + dz * t;
    const y = yFn(px, pz);
    const center = toWorld(V(px, y + h * 0.5, pz), o.m);
    const fb = active.get('hedge', center.x, center.z);
    const put = (ox, oy, oz, nrm, size) => {
      _c.copy(cols[Math.floor(rng.next() * cols.length)]).multiplyScalar(0.9 + (oy / h) * 0.14);
      const p = toWorld(V(px + ox + rng.range(-0.06, 0.06), y + oy + rng.range(-0.05, 0.05), pz + oz + rng.range(-0.06, 0.06)), o.m);
      fb.card4(p, dirWorld(nrm, o.m).normalize(), _c, center, size * rng.range(0.85, 1.15), rng.range(0, Math.PI * 2));
    };
    const up = V(0, 1, 0);
    // rounded top: a card over each upper edge and one on the crown
    for (const e of [-1, 1]) put(nx * e * (hw - 0.05), h - 0.1, nz * e * (hw - 0.05), V(nx * e * 0.7, 0.7, nz * e * 0.7).normalize(), 0.36);
    put(0, h - 0.02, 0, up, 0.34);
    // faces: staggered rows down to the ground
    for (let yy = h - 0.36 - (i % 2) * 0.15; yy > 0.16; yy -= 0.3) {
      for (const e of [-1, 1]) put(nx * e * (hw + 0.03), yy, nz * e * (hw + 0.03), V(nx * e, 0.15, nz * e).normalize(), 0.3);
    }
    // dark inner leaves fill the gaps (no hard core edges show through)
    for (let yy = h - 0.3; yy > 0.2; yy -= 0.38) {
      _c.copy(cols[0]).multiplyScalar(0.55);
      fb.card4(toWorld(V(px + rng.range(-0.05, 0.05), y + yy, pz + rng.range(-0.05, 0.05)), o.m), V(0, 1, 0), _c, center, 0.3, rng.range(0, Math.PI * 2));
    }
    // ends
    if (i === 0 || i === n) {
      const e = i === 0 ? -1 : 1;
      for (let yy = h - 0.25; yy > 0.18; yy -= 0.4) put(dx * e * 0.06, yy, dz * e * 0.06, V(dx * e, 0.2, dz * e).normalize(), 0.36);
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// keeping leaves out of walls
// ---------------------------------------------------------------------------
// Leaf cards turn to face the camera, so a card nearer to a wall than its own size swings
// through it when seen at a slant: leaves show on the far side of a garden wall, out of a
// gate post or inside a shop. Once the town is built (solids: the boxes noted while
// building, see SOLIDS), cards near thin walls, posts and slabs are pulled back to their own
// side and made a little smaller, and cards inside a building's body are dropped.
const FIT = { reach: 0.85, minScale: 0.6, cell: 2 };

export function fitFoliage(fs, solids) {
  const cell = FIT.cell, key = (i, j) => i * 100003 + j, grid = new Map();
  const walls = [];
  for (const w of solids) {
    const h = w.y1 - w.y0;
    const slab = h < 0.6 && w.T >= 0.6;
    // walls and posts at least waist high, floor and roof slabs; not curbs or thin poles
    if (!slab && (h < 0.5 || w.L < 0.06)) continue;
    w.slab = slab;
    const idx = walls.push(w) - 1;
    const ex = Math.abs(w.ux) * w.L + Math.abs(w.uz) * w.T, ez = Math.abs(w.uz) * w.L + Math.abs(w.ux) * w.T;
    for (let i = Math.floor((w.cx - ex) / cell); i <= Math.floor((w.cx + ex) / cell); i++) {
      for (let j = Math.floor((w.cz - ez) / cell); j <= Math.floor((w.cz + ez) / cell); j++) {
        const k = key(i, j);
        let arr = grid.get(k);
        if (!arr) grid.set(k, (arr = []));
        arr.push(idx);
      }
    }
  }
  const stats = { cards: 0, moved: 0, dropped: 0 };
  const seen = new Set();
  for (const fb of fs.map.values()) {
    const P = fb.pos, C = fb.card, Ctr = fb.center;
    for (let v = 0; v < fb.count; v += 4) {
      stats.cards++;
      let px = P[v * 3], py = P[v * 3 + 1], pz = P[v * 3 + 2];
      const size0 = C[v * 4 + 2];
      let size = size0, drop = false;
      const ccx = Ctr[v * 3], ccy = Ctr[v * 3 + 1], ccz = Ctr[v * 3 + 2];
      for (let pass = 0; pass < 3 && !drop; pass++) {
        const R = size * 0.95; // the painted clump fills most of the card
        seen.clear();
        for (let i = Math.floor((px - R) / cell); i <= Math.floor((px + R) / cell) && !drop; i++) {
          for (let j = Math.floor((pz - R) / cell); j <= Math.floor((pz + R) / cell) && !drop; j++) {
            const arr = grid.get(key(i, j));
            if (!arr) continue;
            for (const wi of arr) {
              if (seen.has(wi)) continue;
              seen.add(wi);
              const w = walls[wi];
              const dx = px - w.cx, dz = pz - w.cz;
              const u = dx * w.ux + dz * w.uz, n = -dx * w.uz + dz * w.ux;
              const eu = Math.abs(u) - w.L, en = Math.abs(n) - w.T;
              const Rn = size * 0.95;
              if (w.slab) {
                // a floor or roof: keep the card above or below it, on its clump's side
                if (eu > -0.05 || en > -0.05) continue;
                const up = ccy >= (w.y0 + w.y1) / 2;
                const d = up ? py - w.y1 : w.y0 - py;
                if (d >= FIT.reach * Rn) continue;
                const r = Math.max(FIT.minScale * size0, Math.min(size, d / (FIT.reach * 0.95)));
                const shift = Math.max(0, FIT.reach * r * 0.95 - d);
                py += up ? shift : -shift;
                size = r;
                continue;
              }
              // leaves over the top of a low wall are fine; it has to reach down past it
              if (py - 0.6 * Rn > w.y1 || py + Rn < w.y0 || w.y1 - (py - Rn) < 0.25) continue;
              const inside = eu < 0 && en < 0;
              if (inside && w.T > 0.3 && py < w.y1 + 0.05 && py > w.y0 - 0.2) {
                drop = true; // inside a building's body
                break;
              }
              if (w.T > 0.3) continue; // reaching into a solid body is hidden by it
              const d = inside ? -Math.min(-eu, -en) : Math.hypot(Math.max(eu, 0), Math.max(en, 0));
              if (d >= FIT.reach * Rn) continue;
              // push out through the nearest face (inside: the face on the clump's side)
              let nu = 0, nn = 0;
              if (inside) {
                const cu = (ccx - w.cx) * w.ux + (ccz - w.cz) * w.uz, cn = -(ccx - w.cx) * w.uz + (ccz - w.cz) * w.ux;
                if (-en <= -eu) nn = Math.sign(Math.abs(cn) > w.T ? cn : n) || 1;
                else nu = Math.sign(Math.abs(cu) > w.L ? cu : u) || 1;
              } else if (eu > 0 && en > 0) {
                const k = Math.hypot(eu, en);
                nu = (Math.sign(u) * eu) / k;
                nn = (Math.sign(n) * en) / k;
              } else if (eu > en) nu = Math.sign(u);
              else nn = Math.sign(n);
              const r = Math.max(FIT.minScale * size0, Math.min(size, Math.max(0, d) / (FIT.reach * 0.95)));
              const shift = Math.max(0, FIT.reach * r * 0.95 - d);
              px += (nu * w.ux - nn * w.uz) * shift;
              pz += (nu * w.uz + nn * w.ux) * shift;
              size = r;
            }
          }
        }
      }
      if (drop) {
        size = 0;
        stats.dropped++;
      } else if (size !== size0 || px !== P[v * 3] || pz !== P[v * 3 + 2] || py !== P[v * 3 + 1]) stats.moved++;
      else continue;
      for (let k = v; k < v + 4; k++) {
        P[k * 3] = px;
        P[k * 3 + 1] = py;
        P[k * 3 + 2] = pz;
        C[k * 4 + 2] = size;
      }
    }
  }
  return stats;
}

// ---------------------------------------------------------------------------
// meshes
// ---------------------------------------------------------------------------
export function buildFoliageMeshes(fs, scene) {
  const tex = {
    blossom: canvasTexture(clumpTexture('blossom')),
    leaf: canvasTexture(clumpTexture('leaf')),
    pine: canvasTexture(pineTexture()),
    hedge: canvasTexture(clumpTexture('hedge')),
    shrub: canvasTexture(clumpTexture('shrub')),
    flower: canvasTexture(flowerTexture()),
  };
  tex.forest = tex.leaf;
  const opts = {
    blossom: { outline: 0.3, soft: 0.22, wrap: 0.12, ambTint: 0xffd2e4 },
    leaf: { outline: 0.3, soft: 0.2, wrap: 0.05, ambTint: 0xd8ecd8 },
    forest: { outline: 0.15, soft: 0.2, wrap: 0.05, ambTint: 0xd8ecd8 },
    pine: { outline: 0.3, soft: 0.2, wrap: 0.05, ambTint: 0xc8dcd0 },
    hedge: { outline: 0.22, soft: 0.24, wrap: 0.06, ambTint: 0xd4e8d2 },
    shrub: { outline: 0.25, soft: 0.22, wrap: 0.06, ambTint: 0xd4e8d2 },
    flower: { outline: 0.2, soft: 0.3, wrap: 0.15, ambTint: 0xffe8f0 },
  };
  const mats = {};
  for (const k of Object.keys(opts)) mats[k] = createFoliageMaterial(tex[k], opts[k]);
  const group = new THREE.Group();
  group.name = 'foliage';
  for (const fb of fs.map.values()) {
    if (fb.count === 0) continue;
    const m = mats[fb.kind];
    const mesh = new THREE.Mesh(fb.toGeometry(), m.material);
    mesh.customDepthMaterial = m.depth;
    // low planting is shadowed through its own core boxes; only tree crowns cast
    mesh.castShadow = !['flower', 'hedge', 'shrub'].includes(fb.kind);
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
  }
  scene.add(group);
  return group;
}
