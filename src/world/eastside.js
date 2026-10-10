import * as THREE from 'three';
import { RNG } from '../core/rng.js';
import { PAT } from '../core/builder.js';
import { EAST2, ROADS, groundH } from './layout.js';
import { Kit, boxFaces, signOnFace, faceBox, car, parkedCar, bicycle, hedge } from './kit.js';
import { FONTS, drawBoard, fitText } from '../render/atlas.js';
import { buildRoom, vsign, hrect, ceilingLights } from './interiors.js';
import { shopShelf, lockers, numberPlates } from './furnish.js';
import { midrise, officeGlass, cityLamp } from './commercial.js';
import { buildHouse, buildOldHouse, buildApartment } from './buildings.js';
import { roadSurfaceY } from './roads.js';
import { benchAt } from './coast.js';
import { shrub, AZALEA } from './greenery.js';
import { buildSchool } from './school.js';

// 東町 (Higashimachi), east of 東町通り: the school up the slope (school.js), and toward the
// sea the general hospital with its walk-in lobby, the post office and the police box on
// the corner, a pharmacy and flats, houses by the railway, the hospital car park.

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const IB = (ctx, x, z) => ctx.builders.get('interior', x, z);
const EB = (ctx, x, z) => ctx.builders.get('emissive', x, z);

function solid(ctx, x0, z0, x1, z1, yBottom, yTop) {
  return ctx.colliders.addBox((x0 + x1) / 2, (z0 + z1) / 2, Math.abs(x1 - x0) / 2, Math.abs(z1 - z0) / 2, 0, yTop, yBottom);
}

// a board hanging from the ceiling, readable from both sides (axis: the board runs along x)
function hangingSign(ctx, x, z, y, w, h, uv) {
  IB(ctx, x, z).boxMM(x - w / 2 - 0.03, y - 0.03, z - 0.025, x + w / 2 + 0.03, y + h + 0.03, z + 0.025, { color: 0x3a5a4a });
  vsign(ctx, 'x', z - 0.026, x - w / 2, x + w / 2, y, y + h, -1, uv, 0.5);
  vsign(ctx, 'x', z + 0.026, x - w / 2, x + w / 2, y, y + h, 1, uv, 0.5);
  for (const dx of [-w / 2 + 0.1, w / 2 - 0.1]) IB(ctx, x, z).boxMM(x + dx - 0.01, y + h, z - 0.01, x + dx + 0.01, y + h + 0.6, z + 0.01, { color: 0x9aa2a8 });
}

function label(ctx, key, text, o = {}) {
  return ctx.atlas2.draw('east:' + key, o.w ?? 256, o.h ?? 64, (c, w, h) => drawBoard(c, w, h, { text, sub: o.sub, bg: o.bg ?? '#f4f6f2', fg: o.fg ?? '#2a5a46', font: o.font ?? FONTS.gothic, weather: false, border: o.border }));
}

// ---------------------------------------------------------------------------
// 桜ヶ浜総合病院
// ---------------------------------------------------------------------------
export const HOSP = { x0: 334, x1: 390, z0: -8, z1: 5 };
export const POST = { x0: 414, x1: 432, z0: -6.5, z1: 4.5 };
export const KOBAN = { x0: 405.8, x1: 411.0, z0: 8.8, z1: 13.6 };

function buildHospital(ctx, doors) {
  const H = HOSP;
  let gmax = -Infinity;
  for (const [x, z] of [[H.x0, H.z0], [H.x1, H.z0], [H.x1, H.z1], [H.x0, H.z1]]) gmax = Math.max(gmax, groundH(x, z));
  const y = gmax + 0.2, h = 4.4, ent = 362;
  buildRoom(ctx, {
    name: 'hospital', ...H, y, h, out: 0xf2f3ef, outPat: PAT.TILE, inC: 0xf5f6f2, floor: 0xd8ded6, floorPat: PAT.TILE, ceil: 0xf7f7f3, roof: false, base: 0xa9a59c,
    open: {
      S: [
        { a0: 336, a1: 348, yb: 0.9, yt: 3.0, kind: 'glass', pitch: 1.5 },
        { a0: 350.5, a1: ent - 1.3, yb: 0.25, yt: 3.9, kind: 'glass', pitch: 1.66, transom: 2.6 },
        { a0: ent - 1.2, a1: ent + 1.2, yb: 0, yt: 2.5, kind: 'door' },
        { a0: ent + 1.3, a1: 373.5, yb: 0.25, yt: 3.9, kind: 'glass', pitch: 1.66, transom: 2.6 },
        { a0: 376, a1: 379.6, yb: 0.9, yt: 3.0, kind: 'glass', pitch: 1.5 },
      ],
      W: [{ a0: -3.2, a1: -1.0, yb: 0, yt: 2.5, kind: 'door' }, { a0: 1.0, a1: 4.0, yb: 0.9, yt: 3.0, kind: 'glass', pitch: 1.5 }],
      E: [{ a0: -6.2, a1: -1.0, yb: 0.9, yt: 3.0, kind: 'glass', pitch: 1.5 }],
    },
  });
  doors.add(ctx, ent, H.z1 + 0.125, 'x', y, { chime: false, name: 'hospital', w: 2.4, h: 2.5 });
  doors.add(ctx, H.x0 - 0.125, -2.1, 'z', y, { chime: false, name: 'hospital', w: 2.2, h: 2.5 });
  const b = IB(ctx, (H.x0 + H.x1) / 2, (H.z0 + H.z1) / 2);
  ceilingLights(ctx, H.x0, H.z0, H.x1, H.z1, y + h, 3.0, [1.2, 0.3]);
  // ---- inside: consultation rooms (west), reception and waiting (middle), lifts, pharmacy, shop (east)
  const doorC = 0xd9d2c0;
  b.boxMM(H.x0, y, -4.1, 348, y + h, -3.95, { color: 0xeaf0ea });
  solid(ctx, H.x0, H.z0, 348, -3.95, y - 0.5, y + h);
  const rooms = [['内科 1', 336.0], ['内科 2', 339.4], ['外科', 342.8], ['小児科', 346.2]];
  for (const [nm, dx] of rooms) {
    b.boxMM(dx - 0.55, y, -3.95, dx + 0.55, y + 2.1, -3.9, { color: doorC });
    b.boxMM(dx + 0.3, y + 1.0, -3.9, dx + 0.36, y + 1.1, -3.86, { color: 0x8a8f94 });
    vsign(ctx, 'x', -3.89, dx - 0.5, dx + 0.5, y + 2.25, y + 2.5, 1, label(ctx, 'room:' + nm, nm, { w: 192, h: 48 }), 0.4);
  }
  for (const [x0, x1] of [[335.0, 339.6], [341.2, 346.8]]) {
    b.boxMM(x0, y + 0.4, -1.95, x1, y + 0.46, -1.45, { color: 0x6a9a8a });
    b.boxMM(x0, y + 0.46, -1.5, x1, y + 0.9, -1.45, { color: 0x6a9a8a });
    for (const lx of [x0 + 0.2, x1 - 0.2]) b.boxMM(lx - 0.04, y, -1.9, lx + 0.04, y + 0.4, -1.5, { color: 0x8a8f94 });
    solid(ctx, x0, -1.95, x1, -1.45, y - 0.5, y + 0.5);
  }
  // reception counter + staff behind, signs over it
  b.boxMM(354.5, y, -6.6, 369.5, y + 1.05, -5.9, { color: 0xc9b493 });
  b.boxMM(354.4, y + 1.05, -6.7, 369.6, y + 1.1, -5.8, { color: 0xf2efe6 });
  for (let i = 0; i < 6; i++) b.boxMM(355.6 + i * 2.4, y + 0.75, -7.6, 356.2 + i * 2.4, y + 1.15, -7.55, { color: 0x2a2c30 });
  solid(ctx, 354.5, -6.7, 369.5, -5.8, y - 0.5, y + 1.1);
  solid(ctx, 354.5, H.z0, 369.5, -6.7, y - 0.5, y + 2.5);
  hangingSign(ctx, 359, -5.4, y + 2.75, 2.6, 0.55, label(ctx, 'uketsuke', '総合受付', { sub: 'RECEPTION' }));
  hangingSign(ctx, 366, -5.4, y + 2.75, 2.0, 0.55, label(ctx, 'kaikei', '会計', { sub: 'PAYMENT' }));
  ctx.interactables.push({ kind: 'hospital', what: 'reception', x: 361, z: -5.0, y, r: 1.8, label: '受付でたずねる', text: '「外来の受付は11時30分までです。お大事に」' });
  // waiting chairs in rows facing the counter
  for (const z of [-3.6, -2.2, -0.8, 0.6]) {
    for (const [x0, x1] of [[350.6, 360.6], [363.4, 373.4]]) {
      b.boxMM(x0, y + 0.4, z - 0.25, x1, y + 0.46, z + 0.25, { color: 0x7aa6c4 });
      b.boxMM(x0, y + 0.46, z + 0.2, x1, y + 0.9, z + 0.26, { color: 0x7aa6c4 });
      for (let lx = x0 + 0.3; lx < x1; lx += 2.4) b.boxMM(lx - 0.03, y, z - 0.2, lx + 0.03, y + 0.4, z + 0.2, { color: 0x8a8f94 });
      solid(ctx, x0, z - 0.26, x1, z + 0.27, y - 0.5, y + 0.6);
    }
  }
  ctx.interactables.push({ kind: 'bench', x: 355.6, z: 1.3, y, r: 1.0, label: '待合の椅子に座る', sit: { x: 355.6, y: y + 0.46, z: 0.6, yaw: 0 } });
  // lifts
  for (const lx of [375.4, 378.4]) {
    b.boxMM(lx - 0.75, y, H.z0, lx + 0.75, y + 2.3, H.z0 + 0.06, { color: 0xb9bec2, pattern: PAT.SEAM });
    b.boxMM(lx - 0.01, y, H.z0 + 0.06, lx + 0.01, y + 2.3, H.z0 + 0.07, { color: 0x6a6e72 });
    EB(ctx, lx, H.z0).box(lx, y + 2.55, H.z0 + 0.04, 0.5, 0.14, 0.02, { color: 0xff9a4a });
    EB(ctx, lx, H.z0).box(lx + 1.0, y + 1.1, H.z0 + 0.04, 0.08, 0.16, 0.02, { color: 0xfff1d6 });
  }
  ctx.interactables.push({ kind: 'hospital', what: 'lift', x: 376.9, z: H.z0 + 1.2, y, r: 1.6, label: 'エレベーターを呼ぶ', text: '病棟へのエレベーター。お見舞いの時間はまだみたい。' });
  // pharmacy window
  b.boxMM(381, y, -6.8, 389.4, y + 1.0, -6.2, { color: 0xc9b493 });
  b.boxMM(380.9, y + 1.0, -6.9, 389.5, y + 1.05, -6.1, { color: 0xf2efe6 });
  solid(ctx, 381, H.z0, 389.4, -6.1, y - 0.5, y + 2.5);
  // medicine shelves on the wall behind the window
  shopShelf(ctx, 'x', H.z0 + 0.35, 381.5, 389.0, 1, y + 1.1, 1.5, 0.35, ['daily', 'daily', 'daily', 'daily'], { color: 0xf2f2ee, back: 0xe6eaec, plinth: 0.04, bay: 1.25, seed: 101 });
  hangingSign(ctx, 385.2, -5.6, y + 2.75, 2.6, 0.55, label(ctx, 'kusuri', 'お薬お渡し', { sub: 'PHARMACY' }));
  ctx.interactables.push({ kind: 'hospital', what: 'pharmacy', x: 385.2, z: -5.4, y, r: 1.8, label: '薬の窓口をのぞく', text: '電光掲示板に番号が並んでいる。「12番の方、どうぞ」' });
  // shop (売店) in the south-east corner
  for (const sz of [1.2, 3.2]) {
    const k = sz < 2 ? ['snacks', 'snacks', 'sweets', 'bread'] : ['drinks', 'drinks', 'noodles', 'daily'];
    shopShelf(ctx, 'x', sz - 0.3, 381.0, 389.2, -1, y, 1.5, 0.3, k, { bay: 1.03, seed: 110 + sz * 10 });
    shopShelf(ctx, 'x', sz + 0.3, 381.0, 389.2, 1, y, 1.5, 0.3, sz < 2 ? ['sweets', 'snacks', 'snacks', 'daily'] : ['drinks', 'sweets', 'daily', 'daily'], { bay: 1.03, seed: 111 + sz * 10 });
    solid(ctx, 381.0, sz - 0.3, 389.2, sz + 0.3, y - 0.5, y + 1.5);
  }
  hangingSign(ctx, 385.2, -0.4, y + 2.75, 1.8, 0.5, label(ctx, 'baiten', '売店', { sub: 'SHOP' }));
  ctx.interactables.push({ kind: 'hospital', what: 'shop', x: 385.2, z: 0.0, y, r: 1.6, label: '売店で買い物をする', text: 'あたたかいお茶を買った。' });
  // floor guide by the door, potted plants
  b.boxMM(ent + 2.4, y, H.z1 - 1.0, ent + 3.6, y + 2.1, H.z1 - 0.9, { color: 0x3a5a4a });
  vsign(ctx, 'x', H.z1 - 1.01, ent + 2.45, ent + 3.55, y + 0.5, y + 2.0, -1, ctx.atlas2.draw('east:guide', 96, 128, (c, w, hh) => {
    c.fillStyle = '#f4f6f2';
    c.fillRect(0, 0, w, hh);
    c.fillStyle = '#2a5a46';
    c.fillRect(0, 0, w, hh * 0.14);
    c.fillStyle = '#fff';
    c.font = `700 ${hh * 0.08}px ${FONTS.gothic}`;
    c.textAlign = 'center';
    c.fillText('フロア案内', w / 2, hh * 0.1);
    c.fillStyle = '#333';
    c.textAlign = 'left';
    c.font = `500 ${hh * 0.07}px ${FONTS.gothic}`;
    ['6F 病棟', '5F 病棟', '4F 病棟', '3F 手術室', '2F 検査', '1F 外来・受付'].forEach((s, i) => c.fillText(s, w * 0.1, hh * (0.27 + i * 0.12)));
  }), 0.3);
  ctx.interactables.push({ kind: 'hospital', what: 'guide', x: ent + 3.0, z: H.z1 - 1.8, y, r: 1.4, label: 'フロア案内を見る', text: '1F 外来・受付／2F 検査／3F 手術室／4〜6F 病棟' });
  for (const [px, pz] of [[349.6, H.z1 - 0.8], [374.4, H.z1 - 0.8], [349.6, -6.8]]) {
    b.cyl(px, y, pz, 0.25, 0.2, 0.45, 10, 0xb8a080);
    shrub(px, y + 0.85, pz, 0.38, 0.45, new RNG(Math.round(px * 10)), { cards: 6, size: 0.32, kind: 'shrub' });
    ctx.colliders.addCircle(px, pz, 0.3);
  }
  // ---- the ward floors above (not walkable): white bands of windows
  const kit = new Kit(ctx, (H.x0 + H.x1) / 2, (H.z0 + H.z1) / 2);
  const t = kit.t;
  const W = H.x1 - H.x0 + 0.5, D = H.z1 - H.z0 + 0.5, cx = (H.x0 + H.x1) / 2, cz = (H.z0 + H.z1) / 2;
  const fh = 3.4, nf = 5, y2 = y + h, top = y2 + nf * fh;
  t.box(cx, (y2 + top) / 2, cz, W, top - y2, D, { color: 0xf3f4f0, pattern: PAT.TILE });
  t.box(cx, y2 + 0.2, cz, W + 0.3, 0.4, D + 0.3, { color: 0xdfe4dc, pattern: PAT.CONCRETE });
  const F = boxFaces(cx, y2, cz, W, D);
  for (const key of ['front', 'back', 'left', 'right']) {
    const face = F[key];
    for (let f = 0; f < nf; f++) {
      officeGlass(kit, face, 0.6, face.len - 0.6, f * fh + 0.85, fh - 1.4, 40 + f);
      faceBox(kit.d, face, face.len / 2, f * fh + 0.6, face.len + 0.1, 0.14, 0.22, 0.2, 0xdfe4dc);
    }
  }
  // stair tower with a green stripe, roof parapet, the name on a frame over the roof
  t.boxMM(H.x1 - 4.5, groundH(H.x1, H.z0) - 0.4, H.z0 - 1.4, H.x1 + 0.25, top + 3.2, H.z0 - 0.25, { color: 0xeef0ec, pattern: PAT.TILE });
  solid(ctx, H.x1 - 4.5, H.z0 - 1.4, H.x1 + 0.25, H.z0 - 0.25, y - 2, top);
  t.boxMM(H.x1 - 3.0, y + 1.0, H.z0 - 1.45, H.x1 - 2.2, top + 3.0, H.z0 - 1.38, { color: 0x4f9a7a });
  for (const [a, c, d, e] of [[H.x0 - 0.25, H.z0 - 0.25, H.x1 + 0.25, H.z0], [H.x0 - 0.25, H.z1, H.x1 + 0.25, H.z1 + 0.25], [H.x0 - 0.25, H.z0 - 0.25, H.x0, H.z1 + 0.25], [H.x1, H.z0 - 0.25, H.x1 + 0.25, H.z1 + 0.25]]) t.boxMM(a, top, c, d, top + 1.0, e, { color: 0xf3f4f0, pattern: PAT.TILE });
  const name = ctx.atlas2.draw('east:hospital-name', 1024, 128, (c, w, hh) => {
    c.clearRect(0, 0, w, hh);
    c.fillStyle = '#2f8a66';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    fitText(c, '桜ヶ浜総合病院', w * 0.98, hh * 0.9, FONTS.gothic, '900');
    c.fillText('桜ヶ浜総合病院', w / 2, hh * 0.54);
  });
  const sw = 22, sh = sw / 8;
  for (const dx of [-sw / 2 + 0.6, 0, sw / 2 - 0.6]) t.box(cx + dx, top + 1.0 + (sh + 0.6) / 2, H.z1 - 0.6, 0.15, sh + 0.6, 0.15, { color: 0x6a6e72 });
  signOnFace(kit, { o: V(cx - sw / 2, top, H.z1 - 0.5), r: V(1, 0, 0), n: V(0, 0, 1), len: sw }, sw / 2, 1.4, sw, sh, 0.0, name, 0.9);
  // ---- outside: the canopy over the drop-off, the forecourt, the emergency entrance
  const cz0 = H.z1 + 0.25, cz1 = H.z1 + 6.5, cxa = ent - 9, cxb = ent + 9;
  const gy = (x, z) => roadSurfaceY(x, z);
  t.boxMM(cxa, y + 3.7, cz0, cxb, y + 4.05, cz1, { color: 0xe6e8e4, pattern: PAT.CONCRETE });
  for (const x of [cxa + 0.4, cxb - 0.4]) {
    t.box(x, (gy(x, cz1 - 0.4) + y + 3.7) / 2, cz1 - 0.4, 0.4, y + 3.7 - gy(x, cz1 - 0.4), 0.4, { color: 0xd9dcd8 });
    ctx.colliders.addBox(x, cz1 - 0.4, 0.22, 0.22, 0);
  }
  for (let x = cxa + 1; x < cxb - 0.5; x += 3) EB(ctx, x, cz0 + 3).box(x, y + 3.68, cz0 + 3, 0.6, 0.03, 0.6, { color: 0xfff6e0 });
  const fascia = label(ctx, 'hosp-fascia', '桜ヶ浜総合病院', { w: 512, h: 64, fg: '#2f8a66', bg: '#e6e8e4' });
  signOnFace(kit, { o: V(cxa, y + 3.7, cz1 + 0.01), r: V(1, 0, 0), n: V(0, 0, 1), len: cxb - cxa }, (cxb - cxa) / 2, 0.02, 7.0, 0.32, 0.0, fascia, 0.2);
  // raised walk under the canopy, steps down to the drive
  t.boxMM(cxa, gy(ent, cz0) - 0.4, cz0, cxb, y - 0.02, cz0 + 2.4, { color: 0xcfcac0, pattern: PAT.PAVING });
  ctx.colliders.addSurface(cxa, cz0 - 0.3, cxb, cz0 + 2.4, () => y - 0.02, 3);
  const g0 = gy(ent, cz0 + 3.6), nS = Math.max(1, Math.round((y - g0) / 0.16));
  for (let i = 0; i < nS; i++) t.boxMM(cxa + 3, g0 - 0.3, cz0 + 2.4 + i * 0.3, cxb - 3, y - (i + 1) * ((y - g0) / nS), cz0 + 2.7 + i * 0.3, { color: 0xcfcac0, pattern: PAT.PAVING });
  ctx.colliders.addSurface(cxa + 3, cz0 + 2.4, cxb - 3, cz0 + 2.4 + nS * 0.3, (x, z) => y - Math.min(nS, Math.ceil((z - cz0 - 2.4) / 0.3)) * ((y - g0) / nS), 3);
  for (const [x0, x1] of [[cxa, cxa + 3], [cxb - 3, cxb]]) {
    t.boxMM(x0, g0 - 0.3, cz0 + 2.4, x1, y - 0.02, cz0 + 2.6, { color: 0xb9b5ab, pattern: PAT.CONCRETE });
    solid(ctx, x0, cz0 + 2.4, x1, cz0 + 2.6, g0 - 1, y);
  }
  ctx.ground.rect(H.x0 - 4, H.z1 + 0.3, H.x1 + 4, EAST2.hospital.z1, 0x8a8b8f, PAT.ASPHALT, { jitter: 0.03 });
  ctx.ground.rect(cxa, H.z1 + 0.3, cxb, cz0 + 2.4, 0xc9c3b8, PAT.PAVING, { jitter: 0.03 });
  const rng = new RNG(4471);
  // a taxi waiting under the canopy, benches, trees in planters
  const taxi = new Kit(ctx, ent + 5, cz1 + 1.6);
  parkedCar(taxi, ent + 5, cz1 + 1.6, 0, rng, gy, 'sedan', { color: 0xf2c94a });
  taxi.t.box(ent + 5.1, gy(ent + 5, cz1 + 1.6) + 1.55, cz1 + 1.6, 0.4, 0.16, 0.12, { color: 0xf6f4ee });
  ctx.colliders.addBox(ent + 5, cz1 + 1.6, 2.3, 0.9, 0, gy(ent + 5, cz1 + 1.6) + 1.6);
  benchAt(ctx, t, H.x0 + 4, gy(H.x0 + 4, H.z1 + 2.2), H.z1 + 2.2, Math.PI, 0x8a9aa6, '病院前のベンチに座る');
  benchAt(ctx, t, H.x1 - 4, gy(H.x1 - 4, H.z1 + 2.2), H.z1 + 2.2, Math.PI, 0x8a9aa6, '病院前のベンチに座る');
  for (const x of [H.x0 + 9, H.x1 - 9]) ctx.trees.push({ kind: 'broadleaf', x, z: H.z1 + 3.4, seed: rng.int(1, 1e9), scale: 0.75 });
  // emergency entrance: canopy, red sign, an ambulance
  const ew = H.x0 - 0.25;
  t.boxMM(ew - 3.6, y + 2.9, -4.2, ew, y + 3.15, 0.0, { color: 0xe6e8e4, pattern: PAT.CONCRETE });
  for (const z of [-3.9, -0.3]) {
    t.box(ew - 3.3, (gy(ew - 3.3, z) + y + 2.9) / 2, z, 0.25, y + 2.9 - gy(ew - 3.3, z), 0.25, { color: 0xd9dcd8 });
    ctx.colliders.addCircle(ew - 3.3, z, 0.18);
  }
  const er = ctx.atlas2.draw('east:er', 384, 96, (c, w, hh) => {
    c.fillStyle = '#c0392b';
    c.fillRect(0, 0, w, hh);
    c.fillStyle = '#fff';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    fitText(c, '救急外来', w * 0.9, hh * 0.56, FONTS.gothic, '900');
    c.fillText('救急外来', w / 2, hh * 0.4);
    c.font = `700 ${hh * 0.2}px ${FONTS.latin}`;
    c.fillText('EMERGENCY', w / 2, hh * 0.82);
  });
  signOnFace(kit, { o: V(ew - 0.02, 0, 0.0), r: V(0, 0, -1), n: V(-1, 0, 0), len: 4 }, 2.1, y + 3.3, 2.4, 0.6, 0.0, er, 1.2);
  const ax = ew - 2.2, az = 3.4;
  const amb = new Kit(ctx, ax, az);
  const ay = gy(ax, az) + 0.02;
  car(amb, ax, ay, az, -Math.PI / 2, rng, 'wagon', { color: 0xf6f6f2 });
  amb.begin(ax, ay, az, -Math.PI / 2);
  amb.t.box(0, 0.78, 0, 4.32, 0.14, 1.72, { color: 0xd84a3a });
  amb.e.box(0.55, 1.68, 0, 0.28, 0.1, 1.1, { color: 0xff4a3a });
  amb.end();
  ctx.colliders.addBox(ax, az, 0.9, 2.2, 0, ay + 1.7);
  ctx.landmarks.push({ id: 'hospital', name: '総合病院', x: ent, z: H.z1 + 3 });
}

// ---------------------------------------------------------------------------
// 桜ヶ浜郵便局 and the 交番 on the corner
// ---------------------------------------------------------------------------
function buildPostOffice(ctx, doors) {
  const P = POST;
  let gmax = -Infinity;
  for (const [x, z] of [[P.x0, P.z0], [P.x1, P.z0], [P.x1, P.z1], [P.x0, P.z1]]) gmax = Math.max(gmax, groundH(x, z));
  const y = gmax + 0.2, h = 4.2, dx = 423;
  buildRoom(ctx, {
    name: 'post', ...P, y, h, out: 0xf3efe6, outPat: PAT.TILE, inC: 0xf6f4ee, floor: 0xd2cdc2, floorPat: PAT.TILE, ceil: 0xf6f4ee, parapet: 0.5, roofC: 0xc9c5bb,
    open: {
      S: [{ a0: P.x0 + 0.8, a1: dx - 1.3, yb: 0.3, yt: 3.4, kind: 'glass', pitch: 1.6, transom: 2.5 }, { a0: dx - 1.0, a1: dx + 1.0, yb: 0, yt: 2.4, kind: 'door' }, { a0: dx + 1.3, a1: P.x1 - 0.8, yb: 0.3, yt: 3.4, kind: 'glass', pitch: 1.6, transom: 2.5 }],
      W: [{ a0: P.z0 + 1.0, a1: P.z1 - 1.0, yb: 0.9, yt: 3.0, kind: 'glass', pitch: 1.5 }],
    },
  });
  doors.add(ctx, dx, P.z1 + 0.125, 'x', y, { chime: true, name: 'post' });
  const b = IB(ctx, (P.x0 + P.x1) / 2, (P.z0 + P.z1) / 2);
  ceilingLights(ctx, P.x0, P.z0, P.x1, P.z1, y + h, 2.8, [1.2, 0.3]);
  // counter with windows (窓口), ATMs, a writing desk
  b.boxMM(P.x0 + 1.0, y, -3.6, P.x1 - 4.0, y + 1.05, -2.9, { color: 0xd8d2c4 });
  b.boxMM(P.x0 + 1.0, y + 1.05, -3.7, P.x1 - 4.0, y + 1.1, -2.8, { color: 0xf4f2ea });
  for (let x = P.x0 + 1.2; x < P.x1 - 4.2; x += 2.5) {
    ctx.builders.get('glass', x, -3.3).quad(V(x, y + 1.1, -3.3), V(x + 2.2, y + 1.1, -3.3), V(x + 2.2, y + 1.9, -3.3), V(x, y + 1.9, -3.3), 0xffffff, 0, { uvs: [[0, 0], [1, 0], [1, 1], [0, 1]] });
    b.boxMM(x - 0.03, y + 1.1, -3.33, x + 0.03, y + 1.9, -3.27, { color: 0x9aa2a8 });
  }
  solid(ctx, P.x0 + 1.0, P.z0, P.x1 - 4.0, -2.8, y - 0.5, y + 2.0);
  hangingSign(ctx, 419.5, -2.2, y + 2.6, 3.2, 0.5, label(ctx, 'post-counter', 'ゆうびん・ちょきん', { fg: '#c0392b' }));
  for (const ax of [P.x1 - 3.2, P.x1 - 1.8]) {
    b.boxMM(ax - 0.5, y, P.z0 + 0.1, ax + 0.5, y + 1.6, P.z0 + 0.8, { color: 0x6a8aa8 });
    EB(ctx, ax, P.z0).box(ax, y + 1.25, P.z0 + 0.82, 0.5, 0.35, 0.02, { color: 0x9fd0f0 });
  }
  solid(ctx, P.x1 - 3.8, P.z0, P.x1 - 1.2, P.z0 + 0.85, y - 0.5, y + 1.6);
  b.boxMM(P.x0 + 4, y + 0.85, 0.6, P.x0 + 7.5, y + 0.9, 1.4, { color: 0xc9b493 });
  for (const lx of [P.x0 + 4.2, P.x0 + 7.3]) b.boxMM(lx - 0.04, y, 0.7, lx + 0.04, y + 0.85, 1.3, { color: 0x8a8f94 });
  solid(ctx, P.x0 + 4, 0.6, P.x0 + 7.5, 1.4, y - 0.5, y + 0.9);
  ctx.interactables.push({ kind: 'post', what: 'counter', x: 419.5, z: -2.2, y, r: 1.8, label: '窓口で切手を買う', text: '桜の記念切手を一枚買った。' });
  // parcel lockers (宅配ロッカー) on the east wall, the touch panel in the middle column
  {
    const fx = P.x1 - 0.55, za = -2.2, zb = 3.6;
    lockers(ctx, 'z', fx, za, zb, -1, y, 1.9, 0.55, { style: 'parcel', cols: 7, rows: 6, frame: 0xd9dcdf, colors: ['#e8eaec', '#e4e6e8'], numbers: numberPlates(ctx, 'white'), plinth: 0.08, seed: 131 });
    const pz = (za + zb) / 2, pb = IB(ctx, fx, pz);
    pb.boxMM(fx - 0.03, y + 0.95, pz - 0.3, fx + 0.01, y + 1.55, pz + 0.3, { color: 0x3a3c40 });
    EB(ctx, fx, pz).box(fx - 0.035, y + 1.3, pz, 0.01, 0.3, 0.42, { color: 0x9fd0f0 });
    pb.boxMM(fx - 0.06, y + 1.0, pz - 0.12, fx - 0.03, y + 1.08, pz + 0.12, { color: 0x2a2a2a });
    pb.boxMM(fx - 0.05, y + 1.9, za, P.x1, y + 2.2, zb, { color: 0xc0392b });
    vsign(ctx, 'z', fx - 0.051, za + 0.3, zb - 0.3, y + 1.93, y + 2.17, -1, label(ctx, 'post-locker', '宅配ロッカー', { w: 384, h: 48, fg: '#ffffff', bg: '#c0392b' }), 0.4);
    solid(ctx, fx, za, P.x1, zb, y - 0.5, y + 2.2);
    ctx.interactables.push({ kind: 'post', what: 'locker', x: fx - 0.9, z: pz, y, r: 1.6, label: '宅配ロッカーを見る', text: '宅配ロッカー。届いた荷物を、好きな時間に暗証番号で受け取れる。' });
  }
  // the name over the door, the red post box out front
  const kit = new Kit(ctx, dx, P.z1);
  const nm = ctx.atlas2.draw('east:post-name', 512, 96, (c, w, hh) => {
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, w, hh);
    c.fillStyle = '#d23b2f';
    c.font = `900 ${hh * 0.7}px ${FONTS.gothic}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('〒', hh * 0.55, hh * 0.54);
    c.fillStyle = '#2a2a2a';
    fitText(c, '桜ヶ浜郵便局', w - hh * 1.3, hh * 0.6, FONTS.gothic, '700');
    c.textAlign = 'left';
    c.fillText('桜ヶ浜郵便局', hh * 1.1, hh * 0.56);
  });
  signOnFace(kit, { o: V(P.x0 + 1, 0, P.z1 + 0.27), r: V(1, 0, 0), n: V(0, 0, 1), len: P.x1 - P.x0 - 2 }, (P.x1 - P.x0 - 2) / 2, y + 3.55, 5.4, 1.0, 0.0, nm, 0.7);
  // the street falls away in front: a landing at the door and steps down to the pavement
  {
    const z0 = P.z1 + 0.25, x0 = dx - 2.2, x1 = dx + 2.2;
    const g0 = roadSurfaceY(dx, z0 + 2.8), nS = Math.max(1, Math.round((y - g0) / 0.16)), rise = (y - g0) / nS;
    kit.t.boxMM(x0, g0 - 0.3, z0, x1, y - 0.02, z0 + 1.0, { color: 0xcfcac0, pattern: PAT.PAVING });
    ctx.colliders.addSurface(x0, z0 - 0.3, x1, z0 + 1.0, () => y - 0.02, 3);
    for (let i = 0; i < nS - 1; i++) kit.t.boxMM(x0, g0 - 0.3, z0 + 1.0 + i * 0.3, x1, y - (i + 1) * rise, z0 + 1.3 + i * 0.3, { color: 0xcfcac0, pattern: PAT.PAVING });
    ctx.colliders.addSurface(x0, z0 + 1.0, x1, z0 + 1.0 + (nS - 1) * 0.3, (x, z) => y - Math.min(nS, Math.ceil((z - z0 - 1.0) / 0.3)) * rise, 3);
  }
  const px = dx + 4.2, pz = P.z1 + 2.6, py = roadSurfaceY(px, pz);
  kit.t.cyl(px, py, pz, 0.26, 0.26, 1.15, 14, 0xd23b2f);
  kit.t.cyl(px, py + 1.15, pz, 0.3, 0.27, 0.12, 14, 0xc0352a);
  kit.t.box(px, py + 0.95, pz + 0.25, 0.3, 0.05, 0.04, { color: 0x2a2a2a });
  ctx.colliders.addCircle(px, pz, 0.3);
  ctx.interactables.push({ kind: 'post', what: 'box', x: px, z: pz + 0.8, y: py, r: 1.3, label: 'ポストに手紙を出す', text: '手紙をポストに入れた。誰かに届きますように。' });
  ctx.ground.rect(P.x0 - 1, P.z1 + 0.3, P.x1 + 1, EAST2.post.z1, 0xc9c3b8, PAT.PAVING, { jitter: 0.04 });
  ctx.landmarks.push({ id: 'post', name: '郵便局', x: dx, z: P.z1 + 2 });
}

function buildKoban(ctx, doors) {
  const K = KOBAN;
  let gmax = -Infinity;
  for (const [x, z] of [[K.x0, K.z0], [K.x1, K.z0], [K.x1, K.z1], [K.x0, K.z1]]) gmax = Math.max(gmax, groundH(x, z));
  const y = gmax + 0.15, h = 3.2;
  buildRoom(ctx, {
    name: 'koban', ...K, y, h, out: 0xe9e4d6, outPat: PAT.TILE, inC: 0xf2efe6, floor: 0xc9c5bb, floorPat: PAT.TILE, ceil: 0xf4f2ec, parapet: 0.35, roofC: 0x8a8f94,
    open: {
      W: [{ a0: K.z0 + 0.5, a1: K.z0 + 2.0, yb: 0, yt: 2.3, kind: 'door' }, { a0: K.z0 + 2.4, a1: K.z1 - 0.4, yb: 0.9, yt: 2.5, kind: 'glass', pitch: 1.0 }],
      S: [{ a0: K.x0 + 0.5, a1: K.x1 - 0.5, yb: 0.9, yt: 2.5, kind: 'glass', pitch: 1.4 }],
    },
  });
  const b = IB(ctx, (K.x0 + K.x1) / 2, (K.z0 + K.z1) / 2);
  ceilingLights(ctx, K.x0, K.z0, K.x1, K.z1, y + h, 2.4, [1.0, 0.25]);
  b.boxMM(K.x0 + 1.6, y, K.z0 + 1.6, K.x0 + 3.2, y + 0.75, K.z0 + 2.4, { color: 0x8a9196 });
  b.boxMM(K.x0 + 1.55, y + 0.75, K.z0 + 1.55, K.x0 + 3.25, y + 0.79, K.z0 + 2.45, { color: 0x6a5a4a });
  solid(ctx, K.x0 + 1.55, K.z0 + 1.55, K.x0 + 3.25, K.z0 + 2.45, y - 0.5, y + 0.8);
  vsign(ctx, 'x', K.z1 - 0.01, K.x0 + 0.6, K.x1 - 0.6, y + 1.0, y + 2.4, -1, ctx.atlas2.draw('east:koban-map', 128, 96, (c, w, hh) => {
    c.fillStyle = '#f4efe2';
    c.fillRect(0, 0, w, hh);
    c.strokeStyle = '#ffffff';
    c.lineWidth = 6;
    for (const yy of [20, 52, 82]) { c.beginPath(); c.moveTo(0, yy); c.lineTo(w, yy); c.stroke(); }
    for (const xx of [30, 70, 104]) { c.beginPath(); c.moveTo(xx, 0); c.lineTo(xx, hh); c.stroke(); }
    c.fillStyle = '#e2708f';
    c.beginPath();
    c.arc(70, 52, 5, 0, Math.PI * 2);
    c.fill();
  }), 0.2);
  ctx.interactables.push({ kind: 'koban', x: K.x0 + 1.6, z: (K.z0 + K.z1) / 2, y, r: 1.8, label: '道をたずねる', text: '「桜ヶ浜高校なら、この先の坂を上った左手ですよ」' });
  doors.add(ctx, K.x0 - 0.125, K.z0 + 1.25, 'z', y, { chime: false, name: 'koban', w: 1.5, h: 2.3 });
  // red lamp over the door, the sign
  const kit = new Kit(ctx, K.x0, K.z0);
  kit.t.box(K.x0 - 0.3, y + 2.75, K.z0 + 1.25, 0.18, 0.1, 0.18, { color: 0x6a6e72 });
  kit.e.cyl(K.x0 - 0.3, y + 2.8, K.z0 + 1.25, 0.13, 0.13, 0.26, 12, 0xff3a2a);
  ctx.lamps.push({ x: K.x0 - 0.5, y: y + 2.8, z: K.z0 + 1.25, r: 3.5, color: 0xff6a5a });
  const kb = ctx.atlas2.draw('east:koban', 256, 96, (c, w, hh) => {
    c.fillStyle = '#f2efe6';
    c.fillRect(0, 0, w, hh);
    c.fillStyle = '#1f3a6a';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    fitText(c, '交番', w * 0.8, hh * 0.55, FONTS.gothic, '900');
    c.fillText('交番', w / 2, hh * 0.38);
    c.font = `700 ${hh * 0.24}px ${FONTS.latin}`;
    c.fillText('KOBAN', w / 2, hh * 0.8);
  });
  signOnFace(kit, { o: V(K.x0 - 0.27, 0, K.z1 - 0.2), r: V(0, 0, -1), n: V(-1, 0, 0), len: 3 }, 1.6, y + 2.45, 1.8, 0.68, 0.0, kb, 0.6);
  bicycle(kit.t, K.x0 - 0.9, roadSurfaceY(K.x0 - 0.9, K.z1 - 1.0), K.z1 - 1.0, 0, 0xf2f2ee);
  ctx.landmarks.push({ id: 'koban', name: '交番', x: K.x0, z: K.z0 });
}

// ---------------------------------------------------------------------------
// shops, flats and houses; the hospital car park
// ---------------------------------------------------------------------------
function buildLots(ctx) {
  const rng = new RNG(60601);
  const post = EAST2.post;
  midrise(ctx, { x0: 435, x1: 451, z0: post.z0 + 2, z1: post.z1, front: 'S', seed: 8811 }, { floors: 2, style: 'white', shop: { name: 'さくら薬局', sub: '処方せん受付', bg: '#ffffff', fg: '#2e8a4a', font: 'bold' }, blade: false });
  midrise(ctx, { x0: 454, x1: 475, z0: post.z0 + 1, z1: post.z1, front: 'S', seed: 8812 }, { floors: 4, style: 'tile', shop: { name: 'ベーカリー 東町', sub: 'BAKERY', bg: '#f6e7c8', fg: '#7a4a1f', font: 'maru' }, name: 'コーポ東町' });
  // houses by the railway: a row facing the bridge street, a row facing the lane
  const S2 = EAST2.southE;
  const mid = (S2.z0 + S2.z1) / 2;
  const types = ['house', 'house', 'oldhouse', 'house', 'apartment', 'house'];
  for (const [z0, z1, front] of [[S2.z0, mid - 0.15, 'N'], [mid + 0.15, S2.z1, 'S']]) {
    const n = 6, w = (S2.x1 - S2.x0) / n;
    for (let i = 0; i < n; i++) {
      const lot = { x0: S2.x0 + i * w + 0.15, x1: S2.x0 + (i + 1) * w - 0.15, z0, z1, front, street: null, seed: rng.int(1, 1e9) };
      lot.type = front === 'N' ? types[i] : types[(i + 3) % n];
      if (lot.type === 'oldhouse') buildOldHouse(ctx, lot);
      else if (lot.type === 'apartment') buildApartment(ctx, lot);
      else buildHouse(ctx, lot);
      ctx.lots.push(lot);
    }
  }
  // hospital car park
  const C = EAST2.southW;
  ctx.ground.rect(C.x0, C.z0, C.x1, C.z1, 0x7d7e82, PAT.ASPHALT, { jitter: 0.03 });
  const kit = new Kit(ctx, (C.x0 + C.x1) / 2, (C.z0 + C.z1) / 2);
  const gy = (x, z) => groundH(x, z);
  for (const [z0, dir] of [[C.z0 + 0.6, 1], [C.z1 - 0.6, -1]]) {
    for (let x = C.x0 + 2; x < C.x1 - 2.5; x += 2.6) {
      kit.t.box(x, gy(x, z0 + dir * 2.5) + 0.012, z0 + dir * 2.5, 0.1, 0.02, 5.0, { color: 0xf0efe8 });
      if (x + 2.6 < C.x1 - 2 && rng.chance(0.55)) {
        parkedCar(kit, x + 1.3, z0 + dir * 2.5, dir > 0 ? Math.PI / 2 : -Math.PI / 2, rng, gy);
        ctx.colliders.addBox(x + 1.3, z0 + dir * 2.5, 0.9, 2.0, 0, gy(x + 1.3, z0 + dir * 2.5) + 1.6);
      }
    }
  }
  const pk = label(ctx, 'hosp-parking', '総合病院 駐車場', { sub: 'P  外来の方 2時間無料', fg: '#1f5fa8', w: 320, h: 96 });
  const sx = C.x0 + 1.2, sz = C.z0 + 0.6, sy = gy(sx, sz);
  kit.t.cyl(sx, sy, sz, 0.05, 0.05, 2.6, 6, 0x9aa2a8);
  signOnFace(kit, { o: V(sx - 0.8, 0, sz - 0.06), r: V(1, 0, 0), n: V(0, 0, -1), len: 1.6 }, 0.8, sy + 1.7, 1.6, 0.5, 0.0, pk, 0.3);
  ctx.colliders.addCircle(sx, sz, 0.1);
  // a low hedge along the street side of the car park
  hedge(kit.t, C.x0 + 4, C.z0 + 0.3, C.x1 - 4, C.z0 + 0.3, gy, 0.8);
  ctx.colliders.addSegment(C.x0 + 4, C.z0 + 0.3, C.x1 - 4, C.z0 + 0.3, 0.5, 99);
}

// ---------------------------------------------------------------------------
// streets: lamps, sakura on the bridge street, a bus stop by the hospital
// ---------------------------------------------------------------------------
function buildStreets(ctx) {
  const rng = new RNG(7171);
  for (const r of ROADS) {
    if (r.id !== 'n324' && r.id !== 'n400') continue;
    const hw = r.w / 2 + 0.45;
    for (let z = r.a + 10; z < Math.min(r.b, 50) - 4; z += 21) {
      if ([-120, -85, -50, -15, 20, 47.5].some((c) => Math.abs(z - c) < 6)) continue;
      for (const e of [-1, 1]) cityLamp(ctx, r.c + e * hw, z + (e > 0 ? 10 : 0), -e, 0);
    }
  }
  const e20 = ROADS.find((q) => q.id === 'e20e');
  for (const side of [-1, 1]) {
    for (let x = 331; x < 474; x += 10.5) {
      if (Math.abs(x - 324) < 7 || Math.abs(x - 400) < 7 || (side < 0 && x > 350 && x < 374)) continue;
      ctx.trees.push({ kind: 'sakura', x, z: e20.c + side * (e20.w / 2 + 1.0), seed: rng.int(1, 1e9), scale: rng.range(0.78, 0.9) });
    }
  }
  // bus stop on the hospital side of the bridge street
  const bx = 349, bz = e20.c - e20.w / 2 - 1.1, by = roadSurfaceY(bx, bz);
  const kit = new Kit(ctx, bx, bz);
  kit.t.cyl(bx + 2.2, by, bz + 0.6, 0.05, 0.05, 2.6, 6, 0xc9ccd0);
  const uv = ctx.atlas2.draw('east:bus', 128, 160, (c, w, h) => {
    c.fillStyle = '#1f6fd0';
    c.beginPath();
    c.arc(w / 2, w / 2, w / 2 - 3, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#fff';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = `700 ${w * 0.2}px ${FONTS.gothic}`;
    c.fillText('バス', w / 2, w * 0.36);
    fitText(c, '総合病院前', w * 0.8, w * 0.13, FONTS.gothic, '700');
    c.fillText('総合病院前', w / 2, w * 0.62);
    c.fillStyle = '#f6f4ee';
    c.fillRect(8, w + 4, w - 16, h - w - 8);
    c.fillStyle = '#333';
    c.font = `500 ${h * 0.06}px ${FONTS.gothic}`;
    c.fillText('桜ヶ浜駅・中央方面', w / 2, w + (h - w) / 2);
  });
  for (const e of [-1, 1]) signOnFace(kit, { o: V(bx + 2.2 + e * 0.06, by, bz + 0.6 + e * 0.32), r: V(0, 0, -e), n: V(e, 0, 0), len: 0.64 }, 0.32, 1.65, 0.64, 0.8, 0.0, uv, 0.4);
  for (const dx of [-1.6, 1.6]) kit.t.box(bx + dx, by + 1.2, bz - 0.6, 0.08, 2.4, 0.08, { color: 0xa9b0b6 });
  kit.t.box(bx, by + 2.45, bz - 0.15, 3.6, 0.08, 1.4, { color: 0x8fa3b5 });
  ctx.builders.get('glass', bx, bz).quad(V(bx - 1.55, by + 0.25, bz - 0.62), V(bx + 1.55, by + 0.25, bz - 0.62), V(bx + 1.55, by + 2.3, bz - 0.62), V(bx - 1.55, by + 2.3, bz - 0.62), 0xffffff, 0, { uvs: [[0, 0], [1, 0], [1, 1], [0, 1]] });
  benchAt(ctx, kit.t, bx, by, bz - 0.3, Math.PI, 0x5a7a9a, 'バス停のベンチに座る');
  ctx.colliders.addSegment(bx - 1.6, bz - 0.62, bx + 1.6, bz - 0.62, 0.12);
  ctx.colliders.addCircle(bx + 2.2, bz + 0.6, 0.08);
  // a pocket of azaleas at the corner of the bridge street and 東町通り
  for (let i = 0; i < 5; i++) shrub(330.2 + i * 0.8, roadSurfaceY(330 + i, 15.6) + 0.35, 15.6, 0.36, 0.3, rng, { cards: 4, size: 0.3, flowers: [rng.pick(AZALEA)], flowerCards: 3 });
}

// ---------------------------------------------------------------------------
export function buildEastside(ctx, doors) {
  buildSchool(ctx);
  buildHospital(ctx, doors);
  buildPostOffice(ctx, doors);
  buildKoban(ctx, doors);
  buildLots(ctx);
  buildStreets(ctx);
}

void hrect;
