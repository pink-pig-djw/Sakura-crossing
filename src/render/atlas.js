import * as THREE from 'three';

// One big canvas holding every painted sign, poster, vending machine front,
// station board ... Signs are drawn once at startup and shared by a single
// textured toon material.

export const FONTS = {
  gothic: '"Zen Kaku Gothic New", "Hiragino Kaku Gothic ProN", "Yu Gothic", "Noto Sans JP", "IPAGothic", sans-serif',
  maru: '"Zen Maru Gothic", "Hiragino Maru Gothic ProN", "Yu Gothic", "Noto Sans JP", "IPAGothic", sans-serif',
  mincho: '"Zen Old Mincho", "Hiragino Mincho ProN", "Yu Mincho", "Noto Serif JP", "IPAMincho", serif',
  brush: '"Yuji Syuku", "Zen Old Mincho", "Hiragino Mincho ProN", "Yu Mincho", serif',
  bold: '"Dela Gothic One", "Zen Kaku Gothic New", "Hiragino Kaku Gothic ProN", "Yu Gothic", "IPAGothic", sans-serif',
  latin: '"Zen Maru Gothic", "Avenir Next", "Segoe UI", sans-serif',
};

export class Atlas {
  // page: index stored in every uv so geometry can pick the matching material
  constructor(size = 2048, page = 0, height = size) {
    this.size = size;
    this.height = height;
    this.page = page;
    this.canvas = document.createElement('canvas');
    this.canvas.width = size;
    this.canvas.height = height;
    this.ctx = this.canvas.getContext('2d');
    this.skyline = [{ x: 0, y: 0, w: size }];
    this.pad = 3;
    this.cache = new Map();
    this.full = false;
    this.used = 0;
    this.top = 0;
  }

  // skyline bottom-left packing
  alloc(w, h) {
    const pw = Math.ceil(w) + this.pad, ph = Math.ceil(h) + this.pad;
    const S = this.size, SH = this.height;
    const sky = this.skyline;
    let best = null;
    for (let i = 0; i < sky.length; i++) {
      const x = sky[i].x;
      if (x + pw > S) break;
      let y = 0, j = i, covered = 0;
      while (covered < pw && j < sky.length) {
        y = Math.max(y, sky[j].y);
        covered += sky[j].w - (j === i ? 0 : 0);
        j++;
      }
      if (covered < pw || y + ph > SH) continue;
      if (!best || y + ph < best.y + best.h || (y + ph === best.y + best.h && x < best.x)) best = { x, y, w: pw, h: ph, i };
    }
    if (!best) {
      this.full = true;
      return null;
    }
    // update skyline
    const seg = { x: best.x, y: best.y + best.h, w: best.w };
    const out = [];
    for (const s of sky) {
      const s0 = s.x, s1 = s.x + s.w;
      const b0 = seg.x, b1 = seg.x + seg.w;
      if (s1 <= b0 || s0 >= b1) out.push(s);
      else {
        if (s0 < b0) out.push({ x: s0, y: s.y, w: b0 - s0 });
        if (s1 > b1) out.push({ x: b1, y: s.y, w: s1 - b1 });
      }
    }
    out.push(seg);
    out.sort((a, b) => a.x - b.x);
    // merge equal heights
    const merged = [];
    for (const s of out) {
      const last = merged[merged.length - 1];
      if (last && last.y === s.y && last.x + last.w === s.x) last.w += s.w;
      else merged.push({ ...s });
    }
    this.skyline = merged;
    this.used += w * h;
    this.top = Math.max(this.top, best.y + best.h);
    return { x: best.x + this.pad / 2, y: best.y + this.pad / 2, w: Math.ceil(w), h: Math.ceil(h) };
  }

  // draw(fn) -> uv rect {u0,v0,u1,v1}; fn(ctx, w, h) draws in local pixel space
  draw(key, w, h, fn) {
    if (key && this.cache.has(key)) return this.cache.get(key);
    const r = this.alloc(w, h);
    if (!r) {
      if (!this._warned) console.warn('sign atlas full at', key);
      this._warned = true;
      const blank = { u0: 0, u1: 0.0001, v0: 0, v1: 0.0001, aspect: 1, page: this.page };
      if (key) this.cache.set(key, blank);
      return blank;
    }
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(r.x, r.y);
    ctx.beginPath();
    ctx.rect(0, 0, r.w, r.h);
    ctx.clip();
    fn(ctx, r.w, r.h);
    ctx.restore();
    // shrink half a texel to avoid bleeding
    const s = this.size, sh = this.height;
    const uv = {
      u0: (r.x + 0.5) / s,
      u1: (r.x + r.w - 0.5) / s,
      v0: 1 - (r.y + r.h - 0.5) / sh,
      v1: 1 - (r.y + 0.5) / sh,
      aspect: r.w / r.h,
      page: this.page,
    };
    if (key) this.cache.set(key, uv);
    return uv;
  }

  texture() {
    if (!this._tex) {
      const t = new THREE.CanvasTexture(this.canvas);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 8;
      t.generateMipmaps = true;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      t.flipY = true;
      this._tex = t;
    }
    return this._tex;
  }
}

// ---------------------------------------------------------------------------
// drawing helpers
// ---------------------------------------------------------------------------
export function fitText(ctx, text, maxW, size, font, weight = '700') {
  let s = size;
  ctx.font = `${weight} ${s}px ${font}`;
  let w = ctx.measureText(text).width;
  if (w > maxW) {
    s = Math.max(6, (s * maxW) / w);
    ctx.font = `${weight} ${s}px ${font}`;
  }
  return s;
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// paint subtle grime/age so signs look hand painted
export function weather(ctx, w, h, amount = 0.08, seed = 1) {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  ctx.save();
  for (let i = 0; i < 18; i++) {
    const x = rnd() * w, y = rnd() * h, r = (0.1 + rnd() * 0.4) * Math.min(w, h);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(80,70,60,${amount * rnd()})`);
    g.addColorStop(1, 'rgba(80,70,60,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.restore();
}

// Horizontal shop sign board
export function drawBoard(ctx, w, h, o) {
  ctx.fillStyle = o.bg || '#f4efe4';
  ctx.fillRect(0, 0, w, h);
  if (o.stripe) {
    ctx.fillStyle = o.stripe;
    ctx.fillRect(0, h * 0.82, w, h * 0.18);
  }
  if (o.border) {
    ctx.strokeStyle = o.border;
    ctx.lineWidth = Math.max(2, h * 0.05);
    ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, w - ctx.lineWidth, h - ctx.lineWidth);
  }
  ctx.fillStyle = o.fg || '#222';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const font = o.font || FONTS.gothic;
  const main = o.text || '';
  let x = w / 2;
  if (o.logo) {
    // round logo with a kanji on the left
    const r = h * 0.3;
    ctx.beginPath();
    ctx.arc(h * 0.45, h * 0.45, r, 0, Math.PI * 2);
    ctx.fillStyle = o.logoBg || o.fg || '#c33';
    ctx.fill();
    ctx.fillStyle = o.logoFg || '#fff';
    fitText(ctx, o.logo, r * 1.5, r * 1.3, FONTS.bold, '400');
    ctx.fillText(o.logo, h * 0.45, h * 0.47);
    x = w / 2 + h * 0.3;
    ctx.fillStyle = o.fg || '#222';
  }
  const maxW = w * 0.9 - (o.logo ? h * 0.7 : 0);
  if (o.sub) {
    fitText(ctx, main, maxW, h * 0.48, font, o.weight || '700');
    ctx.fillText(main, x, h * 0.4);
    ctx.fillStyle = o.subColor || o.fg || '#222';
    fitText(ctx, o.sub, maxW, h * 0.2, o.subFont || FONTS.gothic, '500');
    ctx.fillText(o.sub, x, h * (o.stripe ? 0.91 : 0.8));
  } else {
    fitText(ctx, main, maxW, h * 0.62, font, o.weight || '700');
    ctx.fillText(main, x, h * 0.53);
  }
  if (o.weather !== false) weather(ctx, w, h, 0.07, (main.length + 3) * 977);
}

// Vertical sign (tategaki)
export function drawVertical(ctx, w, h, o) {
  ctx.fillStyle = o.bg || '#fff';
  ctx.fillRect(0, 0, w, h);
  if (o.border) {
    ctx.strokeStyle = o.border;
    ctx.lineWidth = w * 0.06;
    ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, w - ctx.lineWidth, h - ctx.lineWidth);
  }
  const chars = [...o.text];
  const step = (h * 0.9) / chars.length;
  const size = Math.min(w * 0.72, step * 0.92);
  ctx.fillStyle = o.fg || '#222';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${o.weight || '700'} ${size}px ${o.font || FONTS.gothic}`;
  chars.forEach((c, i) => ctx.fillText(c, w / 2, h * 0.05 + step * (i + 0.5)));
  weather(ctx, w, h, 0.06, chars.length * 131);
}
