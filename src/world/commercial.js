import * as THREE from 'three';
import { RNG, clamp } from '../core/rng.js';
import { PAT } from '../core/builder.js';
import { eastBlocks, ROADS, groundH, terrainH, SUBWAY } from './layout.js';
import { Kit, boxFaces, fp, faceBox, faceQuad, signOnFace, door, acUnit, FRAME } from './kit.js';
import { lotFrame, padHeight, collide } from './buildings.js';
import { G } from '../render/materials.js';
import { FONTS, drawBoard, fitText } from '../render/atlas.js';
import { benchAt } from './coast.js';
import { roadSurfaceY } from './roads.js';
import { shrub, AZALEA } from './greenery.js';
import { buildRoom } from './interiors.js';
import { fitOut, SHOP_STYLE, entrySteps } from './shopinteriors.js';

// 桜ヶ浜中央: the newer commercial district on the east bank. Mid-rise mixed-use
// buildings (雑居ビル) with shops on the ground floor, office glazing above, blade
// signs listing the tenants, rooftop tanks and billboards; a tree-lined avenue
// with traffic signals. Special buildings (mall, konbini, café, library, plaza,
// subway exits) come from interiors.js / subway.js and fill their own blocks.

const V = (x, y, z) => new THREE.Vector3(x, y, z);

const FACADES = {
  tile: { colors: [0xd8c7aa, 0xcfc2ae, 0xe2d6c2, 0xbfae98, 0xd6cfc4, 0xc9b9a3], pat: PAT.TILE },
  panel: { colors: [0xc9ccd0, 0xb8bec4, 0xdedfe0, 0xa9b2ba, 0xcfd6d4], pat: PAT.SEAM },
  brick: { colors: [0xa86a52, 0x9a5e4a, 0xb87a5e, 0x8f5a48], pat: PAT.BRICK },
  glass: { colors: [0x6c7884, 0x5e6b78, 0x77838d], pat: PAT.METAL },
  white: { colors: [0xf0eee8, 0xe8e6e0, 0xf3efe6], pat: PAT.NONE },
};

export const GROUND_SHOPS = [
  { kind: 'bakery', name: 'ベーカリー ひだまり', sub: 'BAKERY', bg: '#f6e7c8', fg: '#7a4a1f', font: 'maru', awning: ['#d98a3a', '#f8f0dc'] },
  { kind: 'drug', name: 'ドラッグ ハマ', sub: 'くすり・日用品', bg: '#ffffff', fg: '#1f6fd0', font: 'bold' },
  { kind: 'books', name: '書店 汐風堂', sub: '本・文具・CD', bg: '#2f4a3a', fg: '#f6efe0', font: 'mincho' },
  { kind: 'eyewear', name: 'メガネのミナト', sub: 'EYEWEAR', bg: '#ffffff', fg: '#2a2a2a', font: 'gothic' },
  { kind: 'florist', name: 'フラワー ブーケ', sub: 'FLOWER', bg: '#ffffff', fg: '#3a7a4a', font: 'maru', awning: ['#5aa06a', '#ffffff'] },
  { kind: 'ramen', name: 'らーめん 桜川', sub: '醤油・塩・味噌', bg: '#c0392b', fg: '#fff6dc', font: 'bold' },
  { kind: 'gyudon', name: '牛丼 はま屋', sub: 'うまい・はやい', bg: '#f08a24', fg: '#ffffff', font: 'bold' },
  { kind: 'crepe', name: 'クレープ 春風', sub: 'CREPE & ICE', bg: '#ffd6e4', fg: '#a8325a', font: 'maru', awning: ['#f39ab8', '#ffffff'] },
  { kind: 'zakka100', name: '生活雑貨 くらしや', sub: '100円〜', bg: '#ffe14a', fg: '#c0392b', font: 'bold' },
  { kind: 'cake', name: 'ケーキ工房 ペタル', sub: 'PÂTISSERIE', bg: '#fbf4ee', fg: '#8a5a6a', font: 'mincho', awning: ['#c98aa0', '#fbf4ee'] },
  { kind: 'washoku', name: '和食 さくら亭', sub: 'お食事処', bg: '#3a2a1f', fg: '#f6e7c0', font: 'brush' },
  { kind: 'yakiniku', name: '焼肉 ほむら', sub: '炭火焼肉', bg: '#1f1f1f', fg: '#ff8a3a', font: 'bold' },
  { kind: 'shoes', name: '靴のサカエ', sub: 'SHOES', bg: '#ffffff', fg: '#2a4a8a', font: 'gothic' },
  { kind: 'fashion', name: 'セレクト MODE', sub: 'FASHION', bg: '#2a2a2a', fg: '#ffffff', font: 'latin' },
  { kind: 'realestate', name: 'さくら不動産', sub: '賃貸・売買', bg: '#ffffff', fg: '#2e8a4a', font: 'gothic' },
  { kind: 'laundry', name: 'コインランドリー', sub: '24h', bg: '#e8f4fb', fg: '#1f5fa8', font: 'gothic' },
  { kind: 'tea', name: 'お茶の千代園', sub: '日本茶・茶器', bg: '#2f5a3a', fg: '#f2e6c8', font: 'mincho' },
  { kind: 'izakaya', name: '居酒屋 海まる', sub: '地魚と地酒', bg: '#1d3a6a', fg: '#ffffff', font: 'brush' },
  { kind: 'cafe', name: 'カフェ ブロッサム', sub: 'COFFEE', bg: '#f3ead6', fg: '#6a3a2a', font: 'maru', awning: ['#6a8a5a', '#f3ead6'] },
  { kind: 'phone', name: 'スマホ修理', sub: '即日対応', bg: '#ffffff', fg: '#e8432e', font: 'gothic' },
];

// tenants are dealt from a shuffled deck so the district's ground floors rarely repeat;
// a repeat gets the other layout variant
let deck = null, dealt = 0;
const kindCount = new Map();
function dealShop() {
  if (!deck) {
    const r = new RNG(4242);
    deck = GROUND_SHOPS.slice();
    for (let i = deck.length - 1; i > 0; i--) {
      const j = r.int(0, i);
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
  }
  return deck[dealt++ % deck.length];
}

const UPPER = [
  ['歯科', '#ffffff', '#1f6fd0'], ['学習塾', '#ffe14a', '#c0392b'], ['英会話', '#e8f4fb', '#1f5fa8'], ['整骨院', '#ffffff', '#2e8a4a'],
  ['美容室', '#f6e0e8', '#8a2a4a'], ['ネイル', '#fbe8f0', '#a8325a'], ['税理士', '#ffffff', '#333333'], ['ヨガ', '#e8f6ee', '#2e7a5a'],
  ['内科', '#ffffff', '#2e8a4a'], ['眼科', '#ffffff', '#1f5fa8'], ['囲碁', '#f6efe0', '#3a2a1f'], ['ピアノ', '#ffffff', '#6a3a8a'],
  ['カラオケ', '#2a2a6a', '#ffe14a'], ['居酒屋', '#c0392b', '#ffffff'], ['バー', '#1f1f1f', '#e8c060'], ['法律', '#ffffff', '#2a2a2a'],
  ['旅行', '#e8f4fb', '#1f6fd0'], ['写真館', '#f6efe0', '#5a3a2a'], ['保険', '#ffffff', '#c0392b'], ['ダンス', '#2a2a2a', '#f39ab8'],
];

const BUILDING_NAMES = ['中央ビル', 'ハマビル', '汐見ビル', 'さくらビル', '第二桜川ビル', 'リバーサイドビル', '浜風ビル', 'サンライズビル', '春日ビル', '港ビル'];

// ---------------------------------------------------------------------------
// facade pieces
// ---------------------------------------------------------------------------
// One office pane per floor and face; the window shader draws mullions from its size.
export function officeGlass(kit, face, s0, s1, y, h, seed) {
  const w = s1 - s0;
  const c = new THREE.Color(w / 64, h / 8, 1);
  faceQuad(kit.w, face, (s0 + s1) / 2, y, w, h, 0.012, c, 100 + (seed % 50), [[0, 0], [1, 0], [1, 1], [0, 1]]);
}

// Blade sign (袖看板) standing out from a facade, readable from both sides.
export function bladeSign(kit, face, s, y, w, h, out, uv, emissive = 0.8, frame = 0x3d3f44) {
  const p = fp(face, s, 0, out);
  const n = face.n, r = face.r;
  const A = { o: V(p.x + n.x * (w / 2) + r.x * 0.035, face.o.y, p.z + n.z * (w / 2) + r.z * 0.035), r: V(-n.x, 0, -n.z), n: V(r.x, 0, r.z), len: w };
  const B = { o: V(p.x - n.x * (w / 2) - r.x * 0.035, face.o.y, p.z - n.z * (w / 2) - r.z * 0.035), r: V(n.x, 0, n.z), n: V(-r.x, 0, -r.z), len: w };
  signOnFace(kit, A, w / 2, y, w, h, 0, uv, emissive);
  signOnFace(kit, B, w / 2, y, w, h, 0, uv, emissive);
  faceBox(kit.t, face, s, y - 0.04, 0.06, h + 0.08, w + 0.08, out + w / 2 + 0.04, frame);
}

function shopBoard(ctx, shop, w = 512, h = 100) {
  return ctx.atlas2.draw('cshop:' + shop.name, w, h, (c, ww, hh) =>
    drawBoard(c, ww, hh, { text: shop.name, sub: shop.sub, bg: shop.bg, fg: shop.fg, font: FONTS[shop.font] || FONTS.gothic, weather: false })
  );
}

function awningUV(ctx, colors) {
  return ctx.atlas2.draw('cawning:' + colors.join(), 256, 64, (c, w, h) => {
    const n = 8;
    for (let i = 0; i < n; i++) {
      c.fillStyle = colors[i % 2];
      c.fillRect((w * i) / n, 0, w / n + 1, h);
    }
    c.fillStyle = 'rgba(0,0,0,0.08)';
    c.fillRect(0, h * 0.8, w, h * 0.2);
  });
}

function tenantSign(ctx, key, tenants) {
  const n = tenants.length;
  return ctx.atlas2.draw('tenants:' + key, 64, Math.min(400, 80 * n), (c, w, h) => {
    const ph = h / n;
    tenants.forEach(([name, bg, fg], i) => {
      const y = i * ph;
      c.fillStyle = bg;
      c.fillRect(2, y + 2, w - 4, ph - 4);
      c.fillStyle = fg;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      const chars = [...name];
      if (chars.length <= 2) {
        c.font = `700 ${Math.min(ph * 0.34, w * 0.6)}px ${FONTS.gothic}`;
        chars.forEach((ch, k) => c.fillText(ch, w / 2, y + ph * (0.3 + k * 0.4)));
      } else {
        const per = Math.ceil(chars.length / 2);
        const lines = [chars.slice(0, per).join(''), chars.slice(per).join('')];
        lines.forEach((ln, k) => {
          fitText(c, ln, w * 0.86, ph * 0.3, FONTS.gothic, '700');
          c.fillText(ln, w / 2, y + ph * (0.3 + k * 0.4));
        });
      }
      c.fillStyle = 'rgba(0,0,0,0.25)';
      c.fillRect(2, y + ph - 6, w - 4, 2);
    });
  });
}

function billboardUV(ctx, text, sub, bg, fg) {
  return ctx.atlas2.draw('billboard:' + text, 512, 160, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, bg[0]);
    g.addColorStop(1, bg[1]);
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    c.fillStyle = fg;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    fitText(c, text, w * 0.9, h * 0.42, FONTS.bold, '400');
    c.fillText(text, w / 2, h * 0.42);
    fitText(c, sub, w * 0.86, h * 0.16, FONTS.gothic, '700');
    c.fillText(sub, w / 2, h * 0.78);
  });
}

// Ground floor shop front: a lit shop window (fake interior in the window shader), a sign
// band and an awning; the upper floors get a lobby door at one end.
// A walk-in shop (o.walkIn) has real glazing in its room's front wall instead.
function storefront(ctx, kit, face, y0rel, g, shop, rng, o = {}) {
  const len = face.len;
  const lobby = o.lobby ?? true;
  const s0 = o.s0 ?? 0.35, s1 = o.s1 ?? (lobby ? len - 1.9 : len - 0.35);
  const w = s1 - s0;
  const d = kit.d;
  if (!o.walkIn) {
    // shop glazing with aluminium frame and mullions
    faceQuad(kit.w, face, (s0 + s1) / 2, y0rel + 0.08, w, g - 1.45, 0.012, 0xffffff, 150 + rng.int(0, 49), [[0, 0], [1, 0], [1, 1], [0, 1]]);
    faceBox(d, face, (s0 + s1) / 2, y0rel, w + 0.1, 0.1, 0.12, 0.06, 0x9ba1a7);
    faceBox(d, face, (s0 + s1) / 2, y0rel + g - 1.38, w + 0.1, 0.08, 0.12, 0.06, 0x9ba1a7);
    const n = Math.max(1, Math.round(w / 2.2));
    for (let k = 0; k <= n; k++) faceBox(d, face, s0 + (w * k) / n, y0rel, 0.07, g - 1.3, 0.1, 0.06, 0x9ba1a7);
  }
  // sign band: fascia across the front with the shop board centred on it
  const uv = shopBoard(ctx, shop);
  faceBox(kit.t, face, (s0 + s1) / 2, y0rel + g - 1.28, w + 0.2, 1.08, 0.14, 0.14, 0x3a3c40);
  const bw = Math.min(w - 0.2, 5.4), bh = Math.min(0.92, bw / 5.12);
  signOnFace(kit, face, (s0 + s1) / 2, y0rel + g - 1.28 + (1.08 - bh) / 2, bw, bh, 0.15, uv, 0.75);
  // awning
  if (shop.awning && rng.chance(0.8)) {
    const aw = awningUV(ctx, shop.awning);
    const a0 = fp(face, s0 + 0.1, y0rel + g - 1.5, 0.05), a1 = fp(face, s1 - 0.1, y0rel + g - 1.5, 0.05);
    const b0 = fp(face, s0 + 0.1, y0rel + g - 2.15, 1.2), b1 = fp(face, s1 - 0.1, y0rel + g - 2.15, 1.2);
    kit.s2.quad(b0, b1, a1, a0, 0xffffff, 0.3, { uvs: [[aw.u0, aw.v0], [aw.u1, aw.v0], [aw.u1, aw.v1], [aw.u0, aw.v1]] });
    kit.s2.quad(a0, a1, b1, b0, 0xdddddd, 0, { uvs: [[aw.u0, aw.v1], [aw.u1, aw.v1], [aw.u1, aw.v0], [aw.u0, aw.v0]] });
  } else {
    // flat canopy
    faceBox(kit.t, face, (s0 + s1) / 2, y0rel + g - 1.62, w + 0.3, 0.12, 0.9, 0.9, 0xe2e0da);
  }
  if (lobby) {
    door(kit, face, len - 1.05, y0rel, 1.1, 2.3, 0x8a939b, { glass: true, frame: FRAME.silver, seed: 236, canopy: 0xd8d6d0 });
  }
}

// ---------------------------------------------------------------------------
// mid-rise mixed-use building on a lot (front = street side)
// ---------------------------------------------------------------------------
export function midrise(ctx, lot, o = {}) {
  const rng = new RNG(lot.seed || 7);
  const L = lotFrame(lot);
  const kit = new Kit(ctx, L.ox, L.oz);
  const t = kit.t;
  kit.begin(L.ox, 0, L.oz, L.ry);
  const hw = L.W - (o.gap ?? 0.3);
  const front = o.setback ?? 0.25;
  const hd = Math.min(L.D - front - 0.3, o.depth ?? 15);
  const cx = 0, cz = front + hd / 2;
  const pad = padHeight(L, cx, cz, hw, hd);
  const y0 = pad.top + 0.12;
  const floors = o.floors ?? rng.int(3, 7);
  const g = 4.2, fh = 3.3;
  const H = g + (floors - 1) * fh;
  const style = o.style ?? rng.weighted([['tile', 4], ['panel', 2], ['glass', 1.4], ['brick', 1], ['white', 1.5]]);
  const fac = FACADES[style];
  const wall = o.color ?? rng.pick(fac.colors);
  const shop = o.shop ?? dealShop();
  const lobby = floors > 1;
  // the ground floor is a shop you can walk into: a room behind the front (the lobby strip
  // and the back of the floor stay solid), the floors above sit on top of it
  const walkIn = !!shop.kind && hd > 4;
  const yF = walkIn ? y0 - 0.02 : y0;
  t.box(cx, (pad.bottom - 0.6 + yF) / 2, cz, hw + 0.1, yF - pad.bottom + 0.6, hd + 0.1, { color: 0x9e9a92, pattern: PAT.CONCRETE });
  const T = 0.35, ix0 = -hw / 2 + (lobby ? 1.9 : T), ix1 = hw / 2 - T, iz0 = front + T, iz1 = front + Math.min(hd - 0.8, 7.0), iw = ix1 - ix0;
  const dl = (ix0 + ix1) / 2 + rng.pick([-0.25, 0, 0.25]) * Math.max(0, iw - 2.4);
  if (walkIn) {
    if (H > g) t.box(cx, y0 + g + (H - g) / 2, cz, hw, H - g, hd, { color: wall, pattern: fac.pat, ao: 0.05 });
    const solid = (x0, z0, x1, z1) => {
      if (x1 - x0 < 0.05 || z1 - z0 < 0.05) return;
      t.box((x0 + x1) / 2, y0 + g / 2, (z0 + z1) / 2, x1 - x0, g, z1 - z0, { color: wall, pattern: fac.pat, ao: 0.05 });
      collide(ctx, L, (x0 + x1) / 2, (z0 + z1) / 2, x1 - x0 + 0.1, z1 - z0 + 0.1, y0 + H);
    };
    solid(-hw / 2, front, ix0 - T, iz1 + T); // the lobby strip
    solid(-hw / 2, iz1 + T, hw / 2, front + hd); // the back of the floor
    if (H > g) ctx.colliders.addBox(...L.toW(cx, cz), (hw + 0.1) / 2, (hd + 0.1) / 2, L.ry, y0 + H, y0 + g - 0.3);
  } else {
    t.box(cx, y0 + H / 2, cz, hw, H, hd, { color: wall, pattern: fac.pat, ao: 0.05 });
    collide(ctx, L, cx, cz, hw + 0.1, hd + 0.1);
  }
  const F = boxFaces(cx, y0, cz, hw, hd);
  const exposed = { front: true, left: true, right: true, back: true, ...(o.exposed || {}) };
  // ground floor
  storefront(ctx, kit, F.front, 0, g, shop, rng, { lobby, walkIn });
  // a corner shop round the side, behind the walk-in room
  const cs0 = walkIn ? iz1 + T + 0.35 - front : 0.35;
  if (o.corner && hd - 0.35 - cs0 > 2.5) storefront(ctx, kit, o.corner === 'left' ? F.left : F.right, 0, g, rng.pick(GROUND_SHOPS), rng, { lobby: false, s0: o.corner === 'left' ? cs0 : 0.35, s1: o.corner === 'left' ? hd - 0.35 : hd - cs0 });
  const room = () => {
    const W = (lx, lz) => L.toW(lx, lz);
    const wallQ = (a, b, n) => {
      const p = W(a[0], a[1]), q = W(b[0], b[1]), oo = W(0, 0), m = W(n[0], n[1]);
      const vx = m[0] - oo[0], vz = m[1] - oo[1];
      if (Math.abs(p[1] - q[1]) < 1e-3) return { axis: 'x', c: p[1], a0: Math.min(p[0], q[0]), a1: Math.max(p[0], q[0]), dir: Math.sign(vz) };
      return { axis: 'z', c: p[0], a0: Math.min(p[1], q[1]), a1: Math.max(p[1], q[1]), dir: Math.sign(vx) };
    };
    const Q = wallQ([ix0, iz0], [ix1, iz0], [0, -1]);
    const side = Q.axis === 'x' ? (Q.dir < 0 ? 'N' : 'S') : Q.dir < 0 ? 'W' : 'E';
    const along = (lx) => W(lx, iz0)[Q.axis === 'x' ? 0 : 1];
    const op = (la, lb, yb, yt, kind, extra) => ({ a0: Math.min(along(la), along(lb)), a1: Math.max(along(la), along(lb)), yb, yt, kind, ...extra });
    const open = { N: [], S: [], W: [], E: [] };
    open[side].push(op(dl - 0.8, dl + 0.8, 0, 2.3, 'door', { frame: 0x9ba1a7 }));
    for (const [a, b] of [[ix0 + 0.05, dl - 0.85], [dl + 0.85, ix1 - 0.05]]) if (b - a > 0.5) open[side].push(op(a, b, 0.08, 2.83, 'glass', { frame: 0x9ba1a7, pitch: 2.2 }));
    const [rx0, rz0, rx1, rz1] = L.rectW(ix0, iz0, ix1, iz1);
    const [floor, floorPat, inC] = SHOP_STYLE[shop.kind];
    buildRoom(ctx, { name: 'shop', x0: rx0, x1: rx1, z0: rz0, z1: rz1, y: y0, h: g, t: T, out: wall, outPat: fac.pat, inC, floor, floorPat, ceil: false, roof: false, base: 0x9e9a92, open });
    entrySteps(ctx, L, dl, front, 2.2, y0);
    (ctx.shopDoors ||= []).push({ kind: shop.kind, at: W(dl, iz0 - T / 2), out: [W(dl, -1)[0] - W(dl, 0)[0], W(dl, -1)[1] - W(dl, 0)[1]], y: y0 });
    // automatic sliding doors in the entrance
    const [dx, dz] = W(dl, iz0 - T / 2);
    ctx.autoDoors?.add(ctx, dx, dz, Q.axis, y0, { chime: false, name: 'shop', w: 1.6, h: 2.3 });
    const a = along(dl);
    const nth = kindCount.get(shop.kind) ?? 0;
    kindCount.set(shop.kind, nth + 1);
    fitOut(ctx, shop.kind, Q.axis, Q.c, Q.a0, Q.a1, Q.dir, y0, { D: iz1 - iz0, H: 3.0, door: (Q.axis === 'x') === Q.dir > 0 ? a - Q.a0 : Q.a1 - a, v: nth % 2, seed: lot.seed || 7, floor: false, walls: 'none' });
  };
  // upper floors: one glazing pane per floor and face, piers in front for a punched-window look
  const seed = rng.int(0, 255);
  for (const key of ['front', 'left', 'right', 'back']) {
    if (!exposed[key] || floors < 2) continue;
    const face = F[key];
    const len = face.len;
    for (let f = 1; f < floors; f++) {
      const y = g + (f - 1) * fh;
      officeGlass(kit, face, 0.45, len - 0.45, y + 0.8, fh - 1.3, seed + f);
    }
    if (style === 'glass') {
      const n = Math.max(2, Math.round(len / 2.6));
      for (let k = 0; k <= n; k++) faceBox(kit.d, face, 0.45 + (k * (len - 0.9)) / n, g, 0.1, H - g, 0.22, 0.22, 0x9aa3ab);
      for (let f = 1; f < floors; f++) faceBox(kit.d, face, len / 2, g + (f - 1) * fh + 0.6, len, 0.1, 0.18, 0.18, 0x8d969e);
    } else {
      const n = Math.max(2, Math.round(len / (style === 'brick' ? 2.6 : 3.3)));
      for (let k = 0; k <= n; k++) {
        const s = 0.45 + (k * (len - 0.9)) / n;
        faceBox(t, face, s, g, k === 0 || k === n ? 0.9 : 0.75, H - g, 0.12, 0.1, wall, fac.pat);
      }
      if (style === 'tile' || style === 'white') for (let f = 1; f < floors; f++) faceBox(kit.d, face, len / 2, g + (f - 1) * fh + 0.7, len + 0.06, 0.12, 0.2, 0.18, 0xe6e2da);
    }
  }
  // cornice + roof
  const top = y0 + H;
  t.box(cx, top + 0.45, cz - hd / 2 + 0.1, hw + 0.06, 0.9, 0.22, { color: wall, pattern: fac.pat });
  t.box(cx, top + 0.45, cz + hd / 2 - 0.1, hw + 0.06, 0.9, 0.22, { color: wall, pattern: fac.pat });
  t.box(cx - hw / 2 + 0.1, top + 0.45, cz, 0.22, 0.9, hd, { color: wall, pattern: fac.pat });
  t.box(cx + hw / 2 - 0.1, top + 0.45, cz, 0.22, 0.9, hd, { color: wall, pattern: fac.pat });
  t.box(cx, top + 0.02, cz, hw - 0.3, 0.04, hd - 0.3, { color: 0x8f9296, pattern: PAT.CONCRETE });
  // stair / elevator house, water tank, condensers
  const px = rng.range(-hw / 4, hw / 4), pz = cz + rng.range(-hd / 5, hd / 5);
  t.box(px, top + 1.4, pz, 2.8, 2.8, 3.2, { color: 0xd8d4cc, pattern: PAT.CONCRETE });
  if (rng.chance(0.7)) {
    const tx = px + (px > 0 ? -2.6 : 2.6);
    for (const [a, b] of [[-0.8, -0.8], [0.8, -0.8], [0.8, 0.8], [-0.8, 0.8]]) t.box(tx + a, top + 0.5, pz + b, 0.08, 1.0, 0.08, { color: 0x6a6e72 });
    t.box(tx, top + 1.75, pz, 2.0, 1.5, 2.0, { color: 0xb8c4c8, pattern: PAT.SEAM });
  }
  for (let k = 0; k < rng.int(2, 5); k++) acUnit(t, cx + rng.range(-hw / 2 + 1, hw / 2 - 1), top, cz + hd / 2 - 1.0 - rng.range(0, 2), rng.pick([0, Math.PI]));
  // blade sign listing the tenants (a handful of shared variants keeps the atlas small)
  if (floors >= 3 && o.blade !== false && rng.chance(0.8)) {
    const n = Math.min(floors, 6) - 1;
    const variant = rng.int(0, 3);
    const vr = new RNG(9000 + n * 10 + variant);
    const pool = UPPER.slice();
    const list = [];
    for (let f = 0; f < n; f++) list.push(pool.splice(vr.int(0, pool.length - 1), 1)[0]);
    const uv = tenantSign(ctx, n + ':' + variant, list);
    const hh = Math.min(5.2, n * 0.95);
    bladeSign(kit, F.front, rng.chance(0.5) ? 0.55 : hw - 0.55, g + 0.3, 0.72, hh, 0.12, uv, 0.85);
  }
  // rooftop billboard facing the street
  if (o.billboard) {
    const [text, sub, bg, fg] = o.billboard;
    const uv = billboardUV(ctx, text, sub, bg, fg);
    const bw = Math.min(hw - 1, 9), bh = bw / 3.2;
    const face = { o: V(cx + bw / 2, top, cz - hd / 2 + 0.6), r: V(-1, 0, 0), n: V(0, 0, -1), len: bw };
    for (const e of [-1, 1]) t.box(cx + e * bw * 0.35, top + 0.9 + bh / 2, cz - hd / 2 + 0.75, 0.14, bh + 1.6, 0.14, { color: 0x5a5e62 });
    signOnFace(kit, face, bw / 2, 1.4, bw, bh, 0.0, uv, 0.9, 0x4a4e52);
  }
  // building name plate by the lobby
  if (floors > 1) {
    const nm = o.name ?? rng.pick(BUILDING_NAMES);
    const uv = ctx.atlas2.draw('bname:' + nm, 256, 56, (c, w, h) => drawBoard(c, w, h, { text: nm, bg: '#3b3f46', fg: '#e9e2cf', font: FONTS.mincho, weather: false }));
    signOnFace(kit, F.front, hw - 1.05, 2.75, 1.4, 0.32, 0.03, uv, 0.5);
  }
  if (!walkIn) ctx.interactables.push({ kind: 'shop', x: L.toW(cx, -0.7)[0], z: L.toW(cx, -0.7)[1], r: 1.6, label: `${shop.name}をのぞく`, shop: shop.name, shopKind: 'city', text: shop.sub });
  kit.end();
  if (walkIn) room();
  return { L, y0, H, top, hw, hd, cz };
}

// ---------------------------------------------------------------------------
// traffic signals: one mesh whose lamps switch in the shader (shared 44 s cycle)
// ---------------------------------------------------------------------------
export const SIGNAL_CYCLE = 44;
// phase for the avenue (axis 0) or the cross streets (axis 1): 'green' | 'yellow' | 'red'
export function signalState(t, axis) {
  const u = ((t % SIGNAL_CYCLE) + SIGNAL_CYCLE) % SIGNAL_CYCLE;
  if (axis === 0) return u < 20 ? 'green' : u < 23 ? 'yellow' : 'red';
  return u >= 25 && u < 39 ? 'green' : u >= 39 && u < 42 ? 'yellow' : 'red';
}
// pedestrians walking along `axis` (0: N-S, 1: E-W): 'walk' | 'blink' | 'stop'
export function walkState(t, axis) {
  const u = ((t % SIGNAL_CYCLE) + SIGNAL_CYCLE) % SIGNAL_CYCLE;
  const [a, b] = axis === 0 ? [0, 20] : [25, 39];
  if (u < a || u >= b) return 'stop';
  return u >= b - 5 ? 'blink' : 'walk';
}

function signalMaterial() {
  return new THREE.ShaderMaterial({
    name: 'signals',
    vertexColors: true,
    uniforms: { uTime: G.uTime, uNight: G.uNight },
    vertexShader: /* glsl */ `
      attribute vec2 aSig;
      varying vec2 vSig;
      varying vec3 vCol;
      void main() {
        vSig = aSig;
        vCol = color;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uNight;
      varying vec2 vSig;
      varying vec3 vCol;
      void main() {
        float u = mod(uTime, ${SIGNAL_CYCLE.toFixed(1)});
        float kind = vSig.x, axis = vSig.y;
        float g, y;
        if (axis < 0.5) { g = step(u, 20.0); y = step(20.0, u) * step(u, 23.0); }
        else { g = step(25.0, u) * step(u, 39.0); y = step(39.0, u) * step(u, 42.0); }
        float r = 1.0 - g - y;
        float a = axis < 0.5 ? 0.0 : 25.0, b = axis < 0.5 ? 20.0 : 39.0;
        float walk = step(a, u) * step(u, b);
        float blink = step(b - 5.0, u) * step(0.5, fract(u * 2.0));
        float on = kind < 0.5 ? g : kind < 1.5 ? y : kind < 2.5 ? r : kind < 3.5 ? walk * (1.0 - blink) : 1.0 - walk;
        vec3 c = vCol * mix(0.1, 1.8 + uNight * 1.2, on);
        gl_FragColor = vec4(c, 0.0);
      }
    `,
  });
}

class SignalBuilder {
  constructor() {
    this.pos = [];
    this.col = [];
    this.sig = [];
    this.idx = [];
    this.n = 0;
  }
  // lamp disc facing direction (fx, fz) at p
  lamp(p, fx, fz, r, color, kind, axis) {
    const g = new THREE.CylinderGeometry(r, r, 0.03, 12);
    g.rotateX(Math.PI / 2);
    g.rotateY(Math.atan2(fx, fz));
    g.translate(p.x + fx * 0.02, p.y, p.z + fz * 0.02);
    const c = new THREE.Color(color);
    const P = g.attributes.position;
    for (let i = 0; i < P.count; i++) {
      this.pos.push(P.getX(i), P.getY(i), P.getZ(i));
      this.col.push(c.r, c.g, c.b);
      this.sig.push(kind, axis);
    }
    for (const k of g.index.array) this.idx.push(k + this.n);
    this.n += P.count;
  }
  mesh() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aSig', new THREE.Float32BufferAttribute(this.sig, 2));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, signalMaterial());
    m.name = 'signals';
    return m;
  }
}

// vehicle head (green / yellow / red left to right as seen by the driver) facing (fx, fz)
function vehicleHead(b, sb, p, fx, fz, axis) {
  const rx = -fz, rz = fx; // driver's right when looking at the head
  b.box(p.x, p.y, p.z, Math.abs(rx) * 1.25 + Math.abs(fx) * 0.28 + 0.02, 0.42, Math.abs(rz) * 1.25 + Math.abs(fz) * 0.28 + 0.02, { color: 0x4a4e52 });
  const cols = [[0x18d9a0, 0], [0xffb020, 1], [0xff3a2a, 2]];
  cols.forEach(([c, kind], i) => {
    const o = (i - 1) * 0.4;
    const q = V(p.x - rx * o + fx * 0.15, p.y, p.z - rz * o + fz * 0.15);
    // visor
    b.box(q.x + fx * 0.08, q.y + 0.16, q.z + fz * 0.08, Math.abs(rx) * 0.32 + Math.abs(fx) * 0.16, 0.03, Math.abs(rz) * 0.32 + Math.abs(fz) * 0.16, { color: 0x3a3d40 });
    sb.lamp(q, fx, fz, 0.13, c, kind, axis);
  });
}

// pedestrian head (red standing figure above, green walking figure below)
function pedHead(b, sb, p, fx, fz, axis) {
  b.box(p.x, p.y, p.z, Math.abs(fz) * 0.34 + Math.abs(fx) * 0.22 + 0.02, 0.66, Math.abs(fx) * 0.34 + Math.abs(fz) * 0.22 + 0.02, { color: 0x4a4e52 });
  sb.lamp(V(p.x + fx * 0.12, p.y + 0.15, p.z + fz * 0.12), fx, fz, 0.12, 0xff4a3a, 4, axis);
  sb.lamp(V(p.x + fx * 0.12, p.y - 0.15, p.z + fz * 0.12), fx, fz, 0.12, 0x2ae0b0, 3, axis);
}

// ---------------------------------------------------------------------------
// street furniture for the district
// ---------------------------------------------------------------------------
export function cityLamp(ctx, x, z, ax, az) {
  const y = roadSurfaceY(x, z);
  const b = ctx.builders.get('toon', x, z);
  b.cyl(x, y, z, 0.11, 0.08, 7.6, 8, 0x8a9096);
  b.rod(V(x, y + 7.5, z), V(x + ax * 1.6, y + 7.75, z + az * 1.6), 0.05, 0.05, 6, 0x8a9096);
  b.box(x + ax * 1.8, y + 7.72, z + az * 1.8, 0.7 * Math.abs(ax) + 0.32 * Math.abs(az), 0.12, 0.7 * Math.abs(az) + 0.32 * Math.abs(ax), { color: 0x6a7076 });
  ctx.builders.get('emissive', x, z).box(x + ax * 1.8, y + 7.64, z + az * 1.8, 0.6 * Math.abs(ax) + 0.24 * Math.abs(az), 0.03, 0.6 * Math.abs(az) + 0.24 * Math.abs(ax), { color: 0xf4f8ff });
  ctx.lamps.push({ x: x + ax * 1.8, y: y + 7.6, z: z + az * 1.8, r: 6.5, color: 0xe6eeff });
  ctx.colliders.addCircle(x, z, 0.14);
}

function guardPipe(ctx, x0, z0, x1, z1) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  if (len < 0.8) return;
  const n = Math.max(1, Math.round(len / 2));
  const d = ctx.builders.get('detail', (x0 + x1) / 2, (z0 + z1) / 2);
  for (let i = 0; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n, z = z0 + ((z1 - z0) * i) / n;
    const y = roadSurfaceY(x, z);
    d.box(x, y + 0.4, z, 0.07, 0.8, 0.07, { color: 0xeeeeea });
    if (i < n) {
      const xb = x0 + ((x1 - x0) * (i + 1)) / n, zb = z0 + ((z1 - z0) * (i + 1)) / n;
      const yb = roadSurfaceY(xb, zb);
      d.rod(V(x, y + 0.78, z), V(xb, yb + 0.78, zb), 0.035, 0.035, 5, 0xf2f2ee);
      d.rod(V(x, y + 0.42, z), V(xb, yb + 0.42, zb), 0.025, 0.025, 4, 0xf2f2ee);
    }
  }
  ctx.colliders.addSegment(x0, z0, x1, z1, 0.15, roadSurfaceY(x0, z0) + 0.85);
}

function busStop(ctx, x, z, facing, name) {
  // facing: +1 = the road is to +x, -1 = to -x
  const y = roadSurfaceY(x, z);
  const kit = new Kit(ctx, x, z);
  const t = kit.t;
  t.cyl(x + facing * 0.8, y, z - 2.2, 0.05, 0.05, 2.6, 6, 0xc9ccd0);
  const uv = ctx.atlas2.draw('bus:' + name, 128, 160, (c, w, h) => {
    c.fillStyle = '#1f6fd0';
    c.beginPath();
    c.arc(w / 2, w / 2, w / 2 - 3, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#fff';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = `700 ${w * 0.2}px ${FONTS.gothic}`;
    c.fillText('バス', w / 2, w * 0.36);
    fitText(c, name, w * 0.8, w * 0.13, FONTS.gothic, '700');
    c.fillText(name, w / 2, w * 0.62);
    c.fillStyle = '#f6f4ee';
    c.fillRect(8, w + 4, w - 16, h - w - 8);
    c.fillStyle = '#333';
    c.font = `500 ${h * 0.06}px ${FONTS.gothic}`;
    c.fillText('桜ヶ浜駅・海岸方面', w / 2, w + (h - w) / 2);
  });
  for (const e of [-1, 1]) signOnFace(kit, { o: V(x + facing * 0.8 - e * 0.32, y, z - 2.2 + e * 0.06), r: V(e, 0, 0), n: V(0, 0, e), len: 0.64 }, 0.32, 1.65, 0.64, 0.8, 0.0, uv, 0.4);
  // shelter: back panel, roof, bench
  for (const dz of [-1.6, 1.6]) t.box(x - facing * 0.6, y + 1.2, z + dz, 0.08, 2.4, 0.08, { color: 0xa9b0b6 });
  t.box(x - facing * 0.15, y + 2.45, z, 1.4, 0.08, 3.6, { color: 0x8fa3b5 });
  ctx.builders.get('glass', x, z).quad(V(x - facing * 0.62, y + 0.25, z - 1.55), V(x - facing * 0.62, y + 0.25, z + 1.55), V(x - facing * 0.62, y + 2.3, z + 1.55), V(x - facing * 0.62, y + 2.3, z - 1.55), 0xffffff, 0, { uvs: [[0, 0], [1, 0], [1, 1], [0, 1]] });
  benchAt(ctx, t, x - facing * 0.3, y, z, facing > 0 ? -Math.PI / 2 : Math.PI / 2, 0x5a7a9a, 'バス停のベンチに座る');
  ctx.colliders.addSegment(x - facing * 0.62, z - 1.6, x - facing * 0.62, z + 1.6, 0.12);
}

function buildStreets(ctx) {
  const rng = new RNG(2468);
  const av = ROADS.find((r) => r.id === 'avenue');
  const half = av.w / 2 + av.sidewalk;
  const crossZ = [-120, -85, -50, -15, 20, 47.5];
  const nearCross = (z, m) => crossZ.some((c) => Math.abs(z - c) < m);
  const exitZ = [SUBWAY.exits[0].z0 - 1, SUBWAY.exits[0].z1 + 1];
  // zelkova trees and lamps along the avenue sidewalks
  for (const side of [-1, 1]) {
    const xt = av.c + side * (av.w / 2 + 2.2);
    for (let z = av.a + 8; z < av.b - 4; z += 9) {
      if (nearCross(z, 8.5)) continue;
      if (Math.abs(z + 1) < 3 && side > 0) continue; // bus stop in front of the mall
      if (Math.abs(z + 32) < 3 && side < 0) continue; // bus stop by the plaza
      ctx.trees.push({ kind: 'zelkova', x: xt, z, seed: rng.int(1, 1e9), scale: rng.range(0.95, 1.1) });
      // planted tree pit: granite curb, clipped azaleas (tsutsuji) in bloom around the trunk
      const y = roadSurfaceY(xt, z);
      const pb = ctx.builders.get('toon', xt, z);
      for (const [x0, z0, x1, z1] of [[xt - 0.6, z - 1.5, xt + 0.6, z - 1.38], [xt - 0.6, z + 1.38, xt + 0.6, z + 1.5], [xt - 0.6, z - 1.38, xt - 0.48, z + 1.38], [xt + 0.48, z - 1.38, xt + 0.6, z + 1.38]]) {
        pb.boxMM(x0, y - 0.05, z0, x1, y + 0.16, z1, { color: 0xb4b0a8, pattern: PAT.STONE });
      }
      pb.boxMM(xt - 0.48, y - 0.02, z - 1.38, xt + 0.48, y + 0.1, z + 1.38, { color: 0x5e4836, pattern: PAT.DIRT });
      const blooms = [AZALEA[rng.int(0, AZALEA.length - 1)]];
      for (const dz of [-0.85, 0.85]) shrub(xt, y + 0.42, z + dz, 0.42, 0.3, rng, { cards: 5, size: 0.34, flowers: blooms, flowerCards: 4 });
      for (const dx of [-0.3, 0.3]) shrub(xt + dx, y + 0.3, z, 0.18, 0.2, rng, { cards: 2, size: 0.24 });
      ctx.colliders.addBox(xt, z, 0.6, 1.5, 0, y + 0.9);
    }
    for (let z = av.a + 12.5; z < av.b - 4; z += 18) {
      if (nearCross(z, 6)) continue;
      cityLamp(ctx, av.c + side * (av.w / 2 + 0.45), z, -side, 0);
    }
    // guard pipes along the curb, open at crossings, bus stops and the subway exits
    const xg = av.c + side * (av.w / 2 + 0.3);
    let run = av.a + 2;
    const stops = [];
    for (const c of crossZ) stops.push([c - 10, c + 10]);
    stops.push(side > 0 ? [-4, 2] : [-35, -29]);
    stops.push(exitZ);
    stops.sort((a, b) => a[0] - b[0]);
    for (const [a, b] of stops) {
      if (a > run) guardPipe(ctx, xg, run, xg, Math.min(a, av.b - 2));
      run = Math.max(run, b);
    }
    if (run < av.b - 2) guardPipe(ctx, xg, run, xg, av.b - 2);
  }
  busStop(ctx, av.c + half - 1.2, -1, -1, '桜ヶ浜中央');
  busStop(ctx, av.c - half + 1.2, -32, 1, '中央広場前');
  // the bridge street is lined with sakura
  const e20 = ROADS.find((r) => r.id === 'e20e');
  for (const side of [-1, 1]) {
    for (let x = 202; x < 316; x += 10.5) {
      if (Math.abs(x - 218) < 7 || Math.abs(x - av.c) < 13 || Math.abs(x - 292) < 7) continue;
      ctx.trees.push({ kind: 'sakura', x, z: e20.c + side * (e20.w / 2 + 1.0), seed: rng.int(1, 1e9), scale: rng.range(0.78, 0.9) });
    }
  }
  // lamps on the other district streets
  for (const r of ROADS) {
    if (!['e-120e', 'e-85e', 'e-50e', 'e-15e', 'e20e', 'n218', 'n292'].includes(r.id)) continue;
    const h = r.w / 2 + 0.45;
    for (let tt = r.a + 9; tt < r.b - 6; tt += 21) {
      const x = r.axis === 'x' ? tt : r.c - h;
      const z = r.axis === 'x' ? r.c - h : tt;
      if (Math.abs(x - av.c) < half + 3 || roadAtCross(x, z, r)) continue;
      cityLamp(ctx, x, z, r.axis === 'x' ? 0 : 1, r.axis === 'x' ? 1 : 0);
    }
  }
  // traffic signals at the avenue intersections
  const sb = new SignalBuilder();
  for (const c of [-85, -50, -15, 20]) {
    const xw = av.c - av.w / 2 - 0.6, xe = av.c + av.w / 2 + 0.6;
    const zn = c - 3.6, zs = c + 3.6;
    const corners = [
      // [x, z, arm direction, vehicle head facing, axis, ped heads [[fx,fz,axis],...]]
      [xw, zn, [1, 0], [0, 1], 0, [[1, 0, 1], [0, -1, 0]]], // NW: over northbound lanes, faces +z
      [xe, zs, [-1, 0], [0, -1], 0, [[-1, 0, 1], [0, 1, 0]]], // SE: over southbound lanes, faces -z
      [xe, zn, [0, 1], [-1, 0], 1, [[-1, 0, 1], [0, -1, 0]]], // NE: over eastbound lanes, faces -x
      [xw, zs, [0, -1], [1, 0], 1, [[1, 0, 1], [0, 1, 0]]], // SW: over westbound lanes, faces +x
    ];
    for (const [x, z, arm, f, axis, peds] of corners) {
      const y = roadSurfaceY(x, z);
      const b = ctx.builders.get('toon', x, z);
      b.cyl(x, y, z, 0.12, 0.1, 6.0, 8, 0x8a9096);
      const L = 4.2;
      const ex = x + arm[0] * L, ez = z + arm[1] * L;
      b.rod(V(x, y + 5.6, z), V(ex, y + 5.6, ez), 0.07, 0.06, 6, 0x8a9096);
      vehicleHead(b, sb, V(ex, y + 5.25, ez), f[0], f[1], axis);
      peds.forEach(([fx, fz, ax], i) => {
        const p = V(x + fx * 0.32, y + 2.6 + i * 0.05, z + fz * 0.32);
        pedHead(b, sb, p, fx, fz, ax);
      });
      ctx.colliders.addCircle(x, z, 0.16);
      ctx.signalPoles = ctx.signalPoles || [];
      ctx.signalPoles.push({ x, z });
    }
  }
  ctx.scene.add(sb.mesh());
  ctx.crosswalkSounds = [-85, -50, -15, 20].flatMap((c) => [{ x: av.c, z: c - 7, axis: 1 }, { x: av.c, z: c + 7, axis: 1 }, { x: av.c - 11, z: c, axis: 0 }, { x: av.c + 11, z: c, axis: 0 }]);
}

function roadAtCross(x, z, self) {
  for (const r of ROADS) {
    if (r === self) continue;
    const half = r.w / 2 + (r.sidewalk || 0) + 1.5;
    if (r.axis === 'x' ? Math.abs(z - r.c) < half && x > r.a && x < r.b : Math.abs(x - r.c) < half && z > r.a && z < r.b) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// district layout: blocks -> lots -> buildings
// ---------------------------------------------------------------------------
function lotsAlong(block, front, n, rng) {
  // split a block into n lots along its frontage
  const out = [];
  const alongX = front === 'N' || front === 'S';
  const a0 = alongX ? block.x0 : block.z0, a1 = alongX ? block.x1 : block.z1;
  const ws = [];
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const w = rng.range(0.85, 1.15);
    ws.push(w);
    sum += w;
  }
  let a = a0;
  for (let i = 0; i < n; i++) {
    const w = (ws[i] / sum) * (a1 - a0);
    const lot = alongX ? { x0: a + 0.1, x1: a + w - 0.1, z0: block.z0, z1: block.z1 } : { x0: block.x0, x1: block.x1, z0: a + 0.1, z1: a + w - 0.1 };
    lot.front = front;
    lot.seed = rng.int(1, 1e9);
    out.push(lot);
    a += w;
  }
  return out;
}

function half(block, which) {
  const mz = (block.z0 + block.z1) / 2, mx = (block.x0 + block.x1) / 2;
  if (which === 'N') return { ...block, z1: mz - 0.15 };
  if (which === 'S') return { ...block, z0: mz + 0.15 };
  if (which === 'W') return { ...block, x1: mx - 0.15 };
  return { ...block, x0: mx + 0.15 };
}

export function buildCommercial(ctx, specials = {}) {
  const rng = new RNG(97531);
  const blocks = Object.fromEntries(eastBlocks().map((b) => [b.id, b]));
  ctx.eastBlocks = blocks;
  // paved forecourts everywhere in the district
  for (const b of Object.values(blocks)) ctx.ground.rect(b.x0 - 0.4, b.z0 - 0.4, b.x1 + 0.4, b.z1 + 0.4, 0xc9c3b8, PAT.PAVING, { jitter: 0.04 });
  const used = new Set(Object.keys(specials));
  for (const [id, fn] of Object.entries(specials)) fn(ctx, blocks[id]);

  const gen = (lots, opts) => lots.forEach((lot, i) => midrise(ctx, lot, typeof opts === 'function' ? opts(lot, i) : opts));
  // riverside column A: low-rise shops and flats facing the river path
  for (const id of ['A1', 'A2', 'A3', 'A4']) {
    if (used.has(id)) continue;
    gen(lotsAlong(blocks[id], 'W', 2, rng), (lot, i) => ({ floors: rng.int(2, 4), style: rng.pick(['white', 'tile', 'brick']), exposed: { right: i === 0, left: i === 1 }, blade: rng.chance(0.4) }));
  }
  // column B (between n218 and the avenue)
  for (const id of ['B1', 'B4']) {
    if (used.has(id)) continue;
    const b = blocks[id];
    gen(lotsAlong(half(b, 'E'), 'E', 2, rng), (lot, i) => ({ floors: rng.int(4, 7), exposed: { left: i === 0, right: i === 1, back: false }, corner: i === 0 ? 'left' : 'right' }));
    gen(lotsAlong(half(b, 'W'), 'W', 2, rng), (lot, i) => ({ floors: rng.int(3, 5), exposed: { right: i === 0, left: i === 1, back: false } }));
  }
  // column C (avenue to n292)
  for (const id of ['C0', 'C3', 'C4']) {
    if (used.has(id)) continue;
    const b = blocks[id];
    gen(lotsAlong(half(b, 'W'), 'W', 2, rng), (lot, i) => ({ floors: rng.int(5, 9), exposed: { right: i === 0, left: i === 1, back: false }, billboard: i === 0 && rng.chance(0.6) ? rng.pick(BILLBOARDS) : null }));
    gen(lotsAlong(half(b, 'E'), 'E', 2, rng), (lot, i) => ({ floors: rng.int(3, 6), exposed: { left: i === 0, right: i === 1, back: false } }));
  }
  // column D (east edge): fronts on the cross streets
  for (const id of ['D0', 'D1', 'D2', 'D3', 'D4']) {
    if (used.has(id)) continue;
    const b = blocks[id];
    gen(lotsAlong(half(b, 'N'), 'N', 2, rng), (lot, i) => ({ floors: rng.int(3, 7), exposed: { left: i === 0, right: i === 1, back: false } }));
    gen(lotsAlong(half(b, 'S'), 'S', 2, rng), (lot, i) => ({ floors: rng.int(3, 6), exposed: { right: i === 0, left: i === 1, back: false } }));
  }
  buildStreets(ctx);
}

const BILLBOARDS = [
  ['さくらモール', '中央通り沿い 10:00〜21:00', ['#ffd6e4', '#f39ab8'], '#7a2a4a'],
  ['ホテル汐見', '海の見えるホテル', ['#1d3a6a', '#2f5a9a'], '#ffffff'],
  ['汐見信用金庫', '地域とともに', ['#2e8a4a', '#1f6a3a'], '#ffffff'],
  ['桜ヶ浜 花まつり', '4月5日〜14日 桜川沿い', ['#fff0f5', '#ffd6e4'], '#a8325a'],
  ['カラオケ ハルカ', '朝まで歌える', ['#2a2a6a', '#4a2a8a'], '#ffe14a'],
];

void clamp;
void terrainH;
void groundH;
