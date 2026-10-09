import * as THREE from 'three';
import { RNG } from '../core/rng.js';
import { PAT, MeshBuilder } from '../core/builder.js';
import { SUBWAY, groundH } from './layout.js';
import { Kit, signOnFace } from './kit.js';
import { createInteriorMaterial } from '../render/materials.js';
import { FONTS, drawBoard, fitText, roundRect } from '../render/atlas.js';
import { benchAt } from './coast.js';

// 地下鉄 汐風線 桜ヶ浜中央駅: street stairwells -> B1 concourse with ticket machines
// and gates -> stairs + escalator -> B2 island platform with half-height platform
// doors. Trains run north-south in both directions through dark tunnels.

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const S = SUBWAY;
const yP = S.yP, yC = S.yC;
const yT = yP - 1.1; // track bed
const yCeil2 = yC - 0.5; // B2 ceiling = underside of the concourse slab
const yCeil1 = yC + 3.0; // B1 ceiling
const HX0 = S.hall.x0, HX1 = S.hall.x1; // B2 walls
const CX0 = S.x0, CX1 = S.x1; // B1 walls
const CZ0 = S.z0, CZ1 = S.concZ1; // B1 extent
const GATE_Z = -32;
const DOOR_Z = [-37.6, -34.4]; // exit doorways into the concourse
const LINE = '#1fa89a'; // 汐風線 line colour
const LINE_HEX = 0x1fa89a;
const CAR_L = 18, CAR_GAP = 0.5, CAR_W = 2.8;
const DOOR_OFFS = [-6.45, -2.15, 2.15, 6.45];
const CAR_CENTERS = [-(CAR_L + CAR_GAP), 0, CAR_L + CAR_GAP];
export const SUBWAY_DOORS = CAR_CENTERS.flatMap((c) => DOOR_OFFS.map((o) => S.stop + c + o));

const UNDER = { under: true };
const lvl = (y) => ({ min: y - 1.5, max: y + 2.5, under: true });

function ib(ctx, x, z) {
  return ctx.builders.get('interior', x, z);
}

// textured quad on the interior sign material (atlas page 2)
function isign(ctx, a, b, c, d, uv, emissive = 0) {
  ctx.builders.get('interiorSign', (a.x + c.x) / 2, (a.z + c.z) / 2).quad(a, b, c, d, 0xffffff, emissive, { uvs: [[uv.u0, uv.v0], [uv.u1, uv.v0], [uv.u1, uv.v1], [uv.u0, uv.v1]] });
}
// sign on a vertical plane facing +x/-x/+z/-z, centred at (x,y,z)
function isignAt(ctx, x, y, z, w, h, facing, uv, emissive = 0) {
  const [fx, fz] = facing;
  // corners counter-clockwise as seen from the front (front normal = (fx, 0, fz))
  const r = V(fz, 0, -fx); // the viewer's right
  const p0 = V(x - r.x * (w / 2) + fx * 0.01, y - h / 2, z - r.z * (w / 2) + fz * 0.01);
  const p1 = V(x + r.x * (w / 2) + fx * 0.01, y - h / 2, z + r.z * (w / 2) + fz * 0.01);
  const p2 = V(p1.x, y + h / 2, p1.z);
  const p3 = V(p0.x, y + h / 2, p0.z);
  isign(ctx, p0, p1, p2, p3, uv, emissive);
}

// ---------------------------------------------------------------------------
// textures
// ---------------------------------------------------------------------------
function stationBoard(ctx) {
  return ctx.atlas2.draw('sw-ekimei', 512, 200, (c, w, h) => {
    c.fillStyle = '#fbfbf7';
    c.fillRect(0, 0, w, h);
    c.fillStyle = LINE;
    c.fillRect(0, h * 0.66, w, h * 0.12);
    // line badge
    c.beginPath();
    c.arc(h * 0.3, h * 0.33, h * 0.21, 0, Math.PI * 2);
    c.fillStyle = '#fff';
    c.fill();
    c.lineWidth = h * 0.05;
    c.strokeStyle = LINE;
    c.stroke();
    c.fillStyle = '#222';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = `700 ${h * 0.11}px ${FONTS.latin}`;
    c.fillText('S', h * 0.3, h * 0.27);
    c.font = `700 ${h * 0.12}px ${FONTS.latin}`;
    c.fillText('05', h * 0.3, h * 0.4);
    fitText(c, '桜ヶ浜中央', w * 0.62, h * 0.3, FONTS.gothic, '700');
    c.fillText('桜ヶ浜中央', w * 0.56, h * 0.3);
    c.font = `500 ${h * 0.09}px ${FONTS.latin}`;
    c.fillText('Sakuragahama-Chūō', w * 0.56, h * 0.53);
    c.fillStyle = '#fff';
    c.font = `700 ${h * 0.07}px ${FONTS.gothic}`;
    c.textAlign = 'left';
    c.fillText('S04 はなみだい', w * 0.03, h * 0.72);
    c.textAlign = 'right';
    c.fillText('S06 しおみ', w * 0.97, h * 0.72);
    c.fillStyle = '#333';
    c.textAlign = 'center';
    c.font = `500 ${h * 0.075}px ${FONTS.gothic}`;
    c.fillText('さくらがはまちゅうおう', w * 0.5, h * 0.9);
  });
}

function hangingSign(ctx, key, lines) {
  return ctx.atlas2.draw('sw-hang:' + key, 512, 96, (c, w, h) => {
    c.fillStyle = '#1b1d22';
    c.fillRect(0, 0, w, h);
    lines.forEach((ln, i) => {
      const x0 = (w / lines.length) * i;
      const ww = w / lines.length;
      if (ln.badge) {
        c.fillStyle = ln.badgeBg || '#f6c341';
        roundRect(c, x0 + 8, h * 0.18, h * 0.64, h * 0.64, 6);
        c.fill();
        c.fillStyle = ln.badgeFg || '#1b1d22';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.font = `700 ${h * 0.42}px ${FONTS.gothic}`;
        c.fillText(ln.badge, x0 + 8 + h * 0.32, h * 0.52);
      }
      c.fillStyle = ln.color || '#ffffff';
      c.textAlign = 'left';
      c.textBaseline = 'middle';
      const tx = x0 + (ln.badge ? h * 0.85 : 12);
      fitText(c, ln.text, ww - (tx - x0) - 10, h * 0.34, FONTS.gothic, '700');
      c.fillText(ln.text, tx, h * 0.38);
      if (ln.sub) {
        c.fillStyle = '#c9ccd2';
        fitText(c, ln.sub, ww - (tx - x0) - 10, h * 0.2, FONTS.latin, '500');
        c.fillText(ln.sub, tx, h * 0.76);
      }
    });
  });
}

function adPoster(ctx, key, title, sub, bg, fg) {
  return ctx.atlas2.draw('sw-ad:' + key, 256, 160, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, bg[0]);
    g.addColorStop(1, bg[1]);
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(255,255,255,0.35)';
    for (let i = 0; i < 9; i++) {
      c.beginPath();
      c.arc((i * 61) % w, (i * 37) % h, 10 + (i % 3) * 8, 0, Math.PI * 2);
      c.fill();
    }
    c.fillStyle = fg;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    fitText(c, title, w * 0.9, h * 0.22, FONTS.maru, '700');
    c.fillText(title, w / 2, h * 0.42);
    fitText(c, sub, w * 0.88, h * 0.11, FONTS.gothic, '500');
    c.fillText(sub, w / 2, h * 0.7);
    c.strokeStyle = 'rgba(0,0,0,0.25)';
    c.lineWidth = 6;
    c.strokeRect(3, 3, w - 6, h - 6);
  });
}

function ticketMachineFace(ctx) {
  return ctx.atlas2.draw('sw-ticket', 128, 192, (c, w, h) => {
    c.fillStyle = '#e4e7ea';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#20324a';
    c.fillRect(w * 0.1, h * 0.08, w * 0.8, h * 0.42);
    c.fillStyle = '#8ad0f0';
    for (let k = 0; k < 8; k++) c.fillRect(w * 0.15 + (k % 4) * w * 0.18, h * 0.13 + Math.floor(k / 4) * h * 0.16, w * 0.15, h * 0.12);
    c.fillStyle = LINE;
    c.fillRect(w * 0.1, h * 0.55, w * 0.8, h * 0.04);
    c.fillStyle = '#333';
    c.fillRect(w * 0.15, h * 0.64, w * 0.3, h * 0.05);
    c.fillRect(w * 0.55, h * 0.64, w * 0.3, h * 0.08);
    c.fillStyle = '#c0392b';
    c.fillRect(w * 0.2, h * 0.8, w * 0.6, h * 0.06);
    c.fillStyle = '#222';
    c.textAlign = 'center';
    c.font = `700 ${h * 0.06}px ${FONTS.gothic}`;
    c.fillText('きっぷ・ICチャージ', w / 2, h * 0.95);
  });
}

function fareMap(ctx) {
  return ctx.atlas2.draw('sw-faremap', 512, 200, (c, w, h) => {
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#20324a';
    c.fillRect(0, 0, w, h * 0.18);
    c.fillStyle = '#fff';
    c.textAlign = 'left';
    c.textBaseline = 'middle';
    c.font = `700 ${h * 0.1}px ${FONTS.gothic}`;
    c.fillText('運賃表  Fares — 汐風線 Shiokaze Line', 10, h * 0.09);
    const stations = ['港町', '浜野', '桜台', 'はなみだい', '桜ヶ浜中央', 'しおみ', '汐見', '岬'];
    const fares = [210, 210, 180, 170, 0, 170, 180, 210];
    c.strokeStyle = LINE;
    c.lineWidth = 8;
    c.beginPath();
    c.moveTo(w * 0.06, h * 0.55);
    c.lineTo(w * 0.94, h * 0.55);
    c.stroke();
    stations.forEach((st, i) => {
      const x = w * 0.06 + (i * (w * 0.88)) / (stations.length - 1);
      c.beginPath();
      c.arc(x, h * 0.55, i === 4 ? 11 : 8, 0, Math.PI * 2);
      c.fillStyle = i === 4 ? '#e2708f' : '#fff';
      c.fill();
      c.lineWidth = 3;
      c.strokeStyle = '#20324a';
      c.stroke();
      c.fillStyle = '#20324a';
      c.textAlign = 'center';
      c.font = `700 ${h * 0.075}px ${FONTS.gothic}`;
      c.fillText(st, x, h * 0.36);
      c.font = `700 ${h * 0.08}px ${FONTS.latin}`;
      c.fillText(i === 4 ? '現在地' : String(fares[i]), x, h * 0.76);
    });
  });
}

function destBoard(ctx, text) {
  return ctx.atlas2.draw('sw-dest:' + text, 256, 48, (c, w, h) => {
    c.fillStyle = '#0b0b0b';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#ffa02a';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    fitText(c, text, w * 0.92, h * 0.68, FONTS.gothic, '700');
    c.fillText(text, w / 2, h * 0.54);
  });
}

// ---------------------------------------------------------------------------
// station shell
// ---------------------------------------------------------------------------
function inQuad(b, a, bb, c, d, toward, color, pattern = 0) {
  const n = new THREE.Vector3().subVectors(bb, a).cross(new THREE.Vector3().subVectors(d, a));
  const f = a.clone().add(bb).add(c).add(d).multiplyScalar(0.25);
  if (n.dot(new THREE.Vector3().subVectors(toward, f)) < 0) b.quad(bb, a, d, c, color, pattern);
  else b.quad(a, bb, c, d, color, pattern);
}

function buildHall(ctx) {
  const P = S.plat;
  const midZ = (S.z0 + S.z1) / 2;
  const inside = V((HX0 + HX1) / 2, (yT + yCeil2) / 2, midZ);
  const tile = 0xe9e6de, dark = 0x2a2c30;
  // track walls with a line colour band, ads and big station names
  for (const x of [HX0, HX1]) {
    for (let z = S.z0; z < S.z1; z += 10) {
      const z1 = Math.min(S.z1, z + 10);
      const b = ib(ctx, x, z);
      inQuad(b, V(x, yT, z), V(x, yT, z1), V(x, yCeil2, z1), V(x, yCeil2, z), inside, tile, PAT.TILE);
      const xo = x + (x < 252 ? 0.02 : -0.02);
      inQuad(b, V(xo, yP + 2.1, z), V(xo, yP + 2.1, z1), V(xo, yP + 2.35, z1), V(xo, yP + 2.35, z), inside, LINE_HEX, 0);
      inQuad(b, V(xo, yT, z), V(xo, yT, z1), V(xo, yP - 0.2, z1), V(xo, yP - 0.2, z), inside, 0x45484e, PAT.CONCRETE);
    }
  }
  const ads = [
    ['mall', 'さくらモール', '春のさくらフェア開催中', ['#ffe0ea', '#f6a9c4'], '#7a2a4a'],
    ['river', '桜川 花まつり', '夜桜ライトアップ 18:00〜21:00', ['#2a3a6a', '#6a4a9a'], '#ffe6f0'],
    ['eikaiwa', '英会話 HELLO', '駅前すぐ・無料体験', ['#e8f4fb', '#9fd0f0'], '#1f5fa8'],
    ['onsen', '汐の湯', 'ひろびろ銭湯でひとやすみ', ['#f6efe0', '#e0c890'], '#5a3a1a'],
    ['aquarium', '汐見水族館', 'クラゲの海がひらきました', ['#bfe8f6', '#3b8fd0'], '#ffffff'],
    ['library', '市立図書館', '春の読書週間', ['#f3f0e2', '#cfe3c0'], '#2f4a3a'],
  ];
  const board = stationBoard(ctx);
  for (const [x, f] of [[HX0, 1], [HX1, -1]]) {
    let k = 0;
    for (let z = P.z0 + 5; z < P.z1 - 3; z += 9.5) {
      const xo = x + f * 0.03;
      if (k % 2 === 0) isignAt(ctx, xo, yP + 1.55, z, 2.6, 1.0, [f, 0], board, 0.4);
      else {
        const ad = ads[(k + (f > 0 ? 0 : 3)) % ads.length];
        isignAt(ctx, xo, yP + 1.4, z, 2.2, 1.38, [f, 0], adPoster(ctx, ad[0], ad[1], ad[2], ad[3], ad[4]), 0.5);
        ib(ctx, x, z).box(x + f * 0.015, yP + 1.4, z, 0.03, 1.5, 2.32, { color: 0xc9ccd0 });
      }
      k++;
    }
  }
  // end walls with tunnel mouths over each track
  for (const z of [S.z0, S.z1]) {
    const f = z < midZ ? 1 : -1;
    const b = ib(ctx, HX0, z);
    const P2 = S.plat;
    inQuad(b, V(P2.x0, yT, z), V(P2.x1, yT, z), V(P2.x1, yCeil2, z), V(P2.x0, yCeil2, z), inside, tile, PAT.TILE);
    for (const [x0, x1] of [[HX0, P2.x0], [P2.x1, HX1]]) inQuad(b, V(x0, yP + 3.4, z), V(x1, yP + 3.4, z), V(x1, yCeil2, z), V(x0, yCeil2, z), inside, tile, PAT.TILE);
    void f;
  }
  // ceiling (split around the stair opening) + floor of the track beds
  const st = S.stair;
  const ceil = (x0, z0, x1, z1) => inQuad(ib(ctx, (x0 + x1) / 2, (z0 + z1) / 2), V(x0, yCeil2, z0), V(x1, yCeil2, z0), V(x1, yCeil2, z1), V(x0, yCeil2, z1), V((x0 + x1) / 2, yP, (z0 + z1) / 2), 0xdedcd6, 0);
  for (let z = S.z0; z < S.z1; z += 10) {
    const z1 = Math.min(S.z1, z + 10);
    if (z1 <= st.z0 || z >= st.z1) ceil(HX0, z, HX1, z1);
    else {
      ceil(HX0, z, st.x0 - 0.1, z1);
      ceil(st.x1 + 0.1, z, HX1, z1);
      if (z < st.z0) ceil(st.x0 - 0.1, z, st.x1 + 0.1, st.z0);
      if (z1 > st.z1) ceil(st.x0 - 0.1, st.z1 + 0.1, st.x1 + 0.1, z1);
    }
    for (const [x0, x1] of [[HX0, P.x0], [P.x1, HX1]]) inQuad(ib(ctx, x0, z), V(x0, yT, z), V(x1, yT, z), V(x1, yT, z1), V(x0, yT, z1), V(x0, yT + 3, z), dark, PAT.CONCRETE);
  }
  // rails, slab track and the rigid overhead conductor
  for (const tx of S.tracks) {
    for (let z = S.z0 - 80; z < S.z1 + 70; z += 10) {
      const b = ib(ctx, tx, z + 5);
      for (const e of [-0.535, 0.535]) b.box(tx + e, yT + 0.22, z + 5, 0.07, 0.14, 10.02, { color: 0x8a8d90, skip: 'y' });
      b.box(tx, yT + 0.08, z + 5, 2.0, 0.16, 10.0, { color: 0x55585c, pattern: PAT.CONCRETE, skip: 'y' });
      b.box(tx, yCeil2 - 0.55, z + 5, 0.14, 0.2, 10.02, { color: 0x6a6e72 });
    }
  }
  // platform: concrete body, tiled top, tactile strips, white edge
  const pb = ib(ctx, 252, P.z0);
  for (let z = P.z0; z < P.z1; z += 10) {
    const z1 = Math.min(P.z1, z + 10);
    const b = ib(ctx, 252, z);
    b.boxMM(P.x0, yT, z, P.x1, yP, z1, { color: 0xd8d6d0, pattern: PAT.TILE, top: 0xd8d6d0 });
    b.boxMM(P.x0 - 0.02, yT, z, P.x0 + 0.25, yP - 0.25, z1, { color: 0x2a2c30, skip: 'Y' });
    b.boxMM(P.x1 - 0.25, yT, z, P.x1 + 0.02, yP - 0.25, z1, { color: 0x2a2c30, skip: 'Y' });
    for (const [x0, x1] of [[P.x0, P.x0 + 0.2], [P.x1 - 0.2, P.x1]]) b.boxMM(x0, yP - 0.004, z, x1, yP + 0.006, z1, { color: 0xf2f2ee });
    for (const xc of [P.x0 + 0.95, P.x1 - 0.95]) b.boxMM(xc - 0.15, yP - 0.004, z, xc + 0.15, yP + 0.012, z1, { color: 0xf0c23a, pattern: PAT.TILE });
  }
  for (const z of [P.z0, P.z1]) {
    for (let x = P.x0 + 0.3; x <= P.x1 - 0.3; x += 1.2) pb.box(x, yP + 0.55, z + (z < 0 ? 0.08 : -0.08), 0.06, 1.1, 0.06, { color: 0xb9bdc2 });
    pb.box(252, yP + 1.1, z + (z < 0 ? 0.08 : -0.08), P.x1 - P.x0 - 0.6, 0.06, 0.06, { color: 0xb9bdc2 });
    ctx.colliders.addSegment(P.x0, z + (z < 0 ? 0.08 : -0.08), P.x1, z + (z < 0 ? 0.08 : -0.08), 0.2, yP + 1.2).under = true;
  }
  // columns with station name boards
  for (const z of [-40, -10, -2, 6, 13]) {
    const b = ib(ctx, 252, z);
    b.box(252, (yP + yCeil2) / 2, z, 0.8, yCeil2 - yP, 0.8, { color: 0xe8e4dc, pattern: PAT.TILE });
    b.box(252, yP + 2.25, z, 0.84, 0.25, 0.84, { color: LINE_HEX });
    for (const f of [-1, 1]) isignAt(ctx, 252 + f * 0.425, yP + 1.55, z, 0.78, 0.31, [f, 0], board, 0.35);
    const c = ctx.colliders.addBox(252, z, 0.42, 0.42, 0, yCeil2, yP - 1);
    c.under = true;
  }
  // benches back to back between the columns
  for (const z of [-6, 2, 9.5]) {
    const b = ib(ctx, 252, z);
    benchAt(ctx, b, 251.55, yP, z, Math.PI / 2, 0x6a8fb8, 'ホームのベンチに座る');
    benchAt(ctx, b, 252.45, yP, z, -Math.PI / 2, 0x6a8fb8, 'ホームのベンチに座る');
  }
  // light strips
  for (let z = S.z0 + 2; z < S.z1 - 1; z += 5) {
    for (const x of [249.6, 254.4]) ctx.builders.get('emissive', x, z).box(x, yCeil2 - 0.05, z, 0.25, 0.06, 2.4, { color: 0xffffff });
    ctx.lamps.push({ x: 252, y: yCeil2, z, r: 4.2, color: 0xdfe8ff, floor: yP, clip: { x0: P.x0, x1: P.x1, z0: P.z0, z1: P.z1 } });
  }
  // hanging direction signs
  const toExit = hangingSign(ctx, 'up', [{ text: '改札・出口', sub: 'Gates / Exits', badge: '↑' }, { text: '1 中央広場', sub: 'Exit 1  Chuo Plaza', badge: '1' }, { text: '2 さくらモール', sub: 'Exit 2  Sakura Mall', badge: '2' }]);
  for (const z of [-17.2, -38]) {
    for (const f of [-1, 1]) isignAt(ctx, 252, yCeil2 - 0.55, z + f * 0.03, 4.4, 0.82, [0, f], toExit, 1.2);
    ib(ctx, 252, z).box(252, yCeil2 - 0.55, z, 4.5, 0.9, 0.04, { color: 0x1b1d22 });
  }
  const plat = hangingSign(ctx, 'plat', [{ text: '1番線 はなみだい・港町 方面', sub: 'Line 1 for Hanamidai', badge: '1', badgeBg: LINE, badgeFg: '#fff' }, { text: '2番線 しおみ・岬 方面', sub: 'Line 2 for Shiomi', badge: '2', badgeBg: LINE, badgeFg: '#fff' }]);
  for (const z of [-26, 0]) {
    for (const f of [-1, 1]) isignAt(ctx, 252, yCeil2 - 1.3, z + f * 0.03, 5.6, 1.05, [0, f], plat, 1.2);
  }
  // walk surfaces and walls (underground only)
  ctx.colliders.addSurface(P.x0, P.z0, P.x1, P.z1, () => yP, 3, lvl(yP));
  for (const x of [P.x0 + 0.25, P.x1 - 0.25]) {
    // platform doors line (panels + door leaves) keeps everyone off the tracks
    ctx.colliders.addSegment(x, P.z0, x, P.z1, 0.22, yP + 1.4).yBottom = yP - 1;
  }
}

// ---------------------------------------------------------------------------
// platform doors (instanced leaves) + fixed panels
// ---------------------------------------------------------------------------
function buildPlatformDoors(ctx, scene) {
  const P = S.plat;
  const leafGeo = new MeshBuilder();
  leafGeo.box(0, 0.62, 0, 0.06, 1.24, 0.98, { color: 0xe9ebee });
  leafGeo.box(0.035, 0.85, 0, 0.01, 0.5, 0.7, { color: 0x6f8696 });
  leafGeo.box(0.035, 1.12, 0, 0.012, 0.06, 0.98, { color: LINE_HEX });
  leafGeo.box(-0.035, 0.85, 0, 0.01, 0.5, 0.7, { color: 0x6f8696 });
  leafGeo.box(-0.035, 1.12, 0, 0.012, 0.06, 0.98, { color: LINE_HEX });
  const mat = ctx.materials.interior.material;
  const sides = [];
  for (const [x, side] of [[P.x0 + 0.25, -1], [P.x1 - 0.25, 1]]) {
    const mesh = new THREE.InstancedMesh(leafGeo.toGeometry(), mat, SUBWAY_DOORS.length * 2);
    mesh.name = 'platformDoors';
    mesh.frustumCulled = false;
    scene.add(mesh);
    sides.push({ mesh, x: x + side * 0.08, side, open: 0 });
    // fixed panels between the openings
    const b = ib(ctx, x, -14);
    let z = P.z0 + 0.3;
    const stops = SUBWAY_DOORS.map((d) => [d - 1.05, d + 1.05]);
    for (const [a, c] of stops) {
      if (a > z + 0.05) {
        b.boxMM(x - 0.06, yP, z, x + 0.06, yP + 1.3, a, { color: 0xf2f2ee });
        b.boxMM(x - 0.07, yP + 1.0, z, x + 0.07, yP + 1.08, a, { color: LINE_HEX });
      }
      b.boxMM(x - 0.09, yP, a - 0.06, x + 0.09, yP + 1.36, a + 0.06, { color: 0x9aa1a8 });
      b.boxMM(x - 0.09, yP, c - 0.06, x + 0.09, yP + 1.36, c + 0.06, { color: 0x9aa1a8 });
      z = c;
    }
    if (P.z1 - 0.3 > z) b.boxMM(x - 0.06, yP, z, x + 0.06, yP + 1.3, P.z1 - 0.3, { color: 0xf2f2ee });
  }
  const m4 = new THREE.Matrix4();
  const update = () => {
    for (const s of sides) {
      let i = 0;
      for (const dz of SUBWAY_DOORS) {
        for (const e of [-1, 1]) {
          const off = 0.5 + s.open * 0.92;
          m4.makeTranslation(s.x, yP, dz + e * off);
          s.mesh.setMatrixAt(i++, m4);
        }
      }
      s.mesh.instanceMatrix.needsUpdate = true;
    }
  };
  update();
  return { sides, update };
}

// ---------------------------------------------------------------------------
// B1 concourse: ticket machines, gates, stairs + escalator down
// ---------------------------------------------------------------------------
function buildConcourse(ctx) {
  const st = S.stair;
  const inside = V(252, yC + 1.5, (CZ0 + CZ1) / 2);
  const wallC = 0xf0ede6;
  // floor slab (with the stair opening) and ceiling
  const slab = [[CX0, CZ0, st.x0 - 0.1, CZ1], [st.x1 + 0.1, CZ0, CX1, CZ1], [st.x0 - 0.1, CZ0, st.x1 + 0.1, st.z0], [st.x0 - 0.1, st.z1 + 0.1, st.x1 + 0.1, CZ1]];
  for (const [x0, z0, x1, z1] of slab) {
    ib(ctx, (x0 + x1) / 2, (z0 + z1) / 2).boxMM(x0, yC - 0.5, z0, x1, yC, z1, { color: 0xd9d6cf, pattern: PAT.TILE, skip: 'y' });
    ctx.colliders.addSurface(x0, z0, x1, z1, () => yC, 3, lvl(yC));
  }
  for (let z = CZ0; z < CZ1; z += 10) {
    const z1 = Math.min(CZ1, z + 10);
    inQuad(ib(ctx, 252, z), V(CX0, yCeil1, z), V(CX1, yCeil1, z), V(CX1, yCeil1, z1), V(CX0, yCeil1, z1), inside, 0xe6e4de, 0);
    for (const x of [244, 252, 260]) ctx.builders.get('emissive', x, z).box(x, yCeil1 - 0.04, z + 5, 1.6, 0.05, 0.6, { color: 0xffffff });
    ctx.lamps.push({ x: 252, y: yCeil1, z: z + 5, r: 5, color: 0xe8eeff, floor: yC, clip: { x0: CX0, x1: CX1, z0: CZ0, z1: CZ1 } });
  }
  // tactile guide paths from the exits to the gates
  const gp = ib(ctx, 252, -36);
  gp.boxMM(CX0, yC - 0.004, -36.15, CX1, yC + 0.012, -35.85, { color: 0xf0c23a, pattern: PAT.TILE });
  gp.boxMM(251.85, yC - 0.004, -36, 252.15, yC + 0.012, GATE_Z - 0.5, { color: 0xf0c23a, pattern: PAT.TILE });
  // walls (exit doorways in the side walls)
  const wall = (x0, z0, x1, z1) => {
    const b = ib(ctx, (x0 + x1) / 2, (z0 + z1) / 2);
    inQuad(b, V(x0, yC, z0), V(x1, yC, z1), V(x1, yCeil1, z1), V(x0, yCeil1, z0), inside, wallC, PAT.TILE);
    inQuad(b, V(x0, yC, z0), V(x1, yC, z1), V(x1, yC + 0.12, z1), V(x0, yC + 0.12, z0), V(inside.x, yC, inside.z), 0x9aa0a6, 0);
    const c = ctx.colliders.addSegment(x0, z0, x1, z1, 0.3, yCeil1);
    if (c) {
      c.yBottom = yC - 1;
      c.under = true;
    }
  };
  for (const x of [CX0, CX1]) {
    wall(x, CZ0, x, DOOR_Z[0]);
    wall(x, DOOR_Z[1], x, CZ1);
    // lintel over the doorway
    const b = ib(ctx, x, -36);
    inQuad(b, V(x, yC + 2.6, DOOR_Z[0]), V(x, yC + 2.6, DOOR_Z[1]), V(x, yCeil1, DOOR_Z[1]), V(x, yCeil1, DOOR_Z[0]), inside, wallC, PAT.TILE);
    const exitNo = x < 252 ? 1 : 2;
    const uv = hangingSign(ctx, 'exit' + exitNo, [{ text: exitNo === 1 ? '中央広場・中央通り西側' : 'さくらモール・中央通り東側', sub: exitNo === 1 ? 'Chuo Plaza' : 'Sakura Mall', badge: String(exitNo) }]);
    isignAt(ctx, x + (x < 252 ? 0.03 : -0.03), yC + 2.85, -36, 2.4, 0.45, [x < 252 ? 1 : -1, 0], uv, 1.2);
  }
  wall(CX0, CZ0, CX1, CZ0);
  wall(CX0, CZ1, CX1, CZ1);
  // ticket machines + fare map on the north wall
  const tm = ticketMachineFace(ctx);
  for (let i = 0; i < 4; i++) {
    const x = 244.5 + i * 1.3;
    const b = ib(ctx, x, CZ0);
    b.boxMM(x - 0.55, yC, CZ0 + 0.05, x + 0.55, yC + 1.75, CZ0 + 0.75, { color: 0xd4d8dc });
    isignAt(ctx, x, yC + 0.95, CZ0 + 0.76, 0.98, 1.45, [0, 1], tm, 0.6);
    ctx.interactables.push({ kind: 'ticket', x, z: CZ0 + 1.6, r: 1.1, y: yC, label: 'きっぷを買う' });
  }
  ctx.colliders.addBox(246.45, CZ0 + 0.4, 2.7, 0.4, 0, yC + 1.8, yC - 1).under = true;
  isignAt(ctx, 246.4, yC + 2.4, CZ0 + 0.04, 5.2, 1.0, [0, 1], fareMap(ctx), 0.6);
  ctx.interactables.push({ kind: 'sign', x: 246.4, z: CZ0 + 2.2, r: 1.8, y: yC, label: '運賃表を見る', text: '汐風線 運賃表：はなみだい 170円・しおみ 170円・汐見 180円・岬 210円' });
  // station office window
  const ob = ib(ctx, 258, CZ0);
  ob.boxMM(254.5, yC, CZ0, CX1, yCeil1, CZ0 + 3.0, { color: 0xeae7e0, pattern: PAT.TILE });
  ctx.builders.get('glass', 258, CZ0).quad(V(255.0, yC + 1.0, CZ0 + 3.02), V(258.4, yC + 1.0, CZ0 + 3.02), V(258.4, yC + 2.2, CZ0 + 3.02), V(255.0, yC + 2.2, CZ0 + 3.02), 0xffffff, 0, { uvs: [[0, 0], [1, 0], [1, 1], [0, 1]] });
  ob.boxMM(255.0, yC + 0.95, CZ0 + 3.0, 258.4, yC + 1.0, CZ0 + 3.3, { color: 0x9aa0a6 });
  const office = ctx.atlas2.draw('sw-office', 256, 56, (c, w, h) => drawBoard(c, w, h, { text: '駅事務室  Station Office', bg: '#20324a', fg: '#ffffff', weather: false }));
  isignAt(ctx, 256.7, yC + 2.55, CZ0 + 3.03, 2.6, 0.5, [0, 1], office, 0.8);
  ctx.colliders.addBox((254.5 + CX1) / 2, CZ0 + 1.5, (CX1 - 254.5) / 2, 1.5, 0, yCeil1, yC - 1).under = true;
  ctx.interactables.push({ kind: 'sign', x: 256.7, z: CZ0 + 4.0, r: 1.5, y: yC, label: '駅員さんにたずねる', text: '「出口1は中央広場、出口2はさくらモールの前に出ますよ。いってらっしゃい」' });
  // ticket gates (改札) with fences to the walls
  const gateX = [];
  for (let x = 244.2; x <= 259.9; x += 1.25) gateX.push(x);
  for (const gx of gateX) {
    const b = ib(ctx, gx, GATE_Z);
    b.boxMM(gx - 0.12, yC, GATE_Z - 0.9, gx + 0.12, yC + 1.0, GATE_Z + 0.9, { color: 0xe3e5e8 });
    b.boxMM(gx - 0.13, yC + 0.98, GATE_Z - 0.9, gx + 0.13, yC + 1.03, GATE_Z - 0.3, { color: 0x2a6ad0 });
    b.boxMM(gx - 0.13, yC + 0.98, GATE_Z + 0.3, gx + 0.13, yC + 1.03, GATE_Z + 0.9, { color: 0x2a6ad0 });
    ctx.builders.get('emissive', gx, GATE_Z).box(gx, yC + 0.85, GATE_Z - 0.91, 0.16, 0.12, 0.02, { color: 0x2ad07a });
    ctx.colliders.addBox(gx, GATE_Z, 0.13, 0.9, 0, yC + 1.05, yC - 1).under = true;
  }
  for (const [x0, x1] of [[CX0, gateX[0] - 0.12], [gateX[gateX.length - 1] + 0.12, CX1]]) {
    const b = ib(ctx, (x0 + x1) / 2, GATE_Z);
    b.boxMM(x0, yC, GATE_Z - 0.04, x1, yC + 1.1, GATE_Z + 0.04, { color: 0xc9ced3 });
    const c = ctx.colliders.addSegment(x0, GATE_Z, x1, GATE_Z, 0.2, yC + 1.15);
    c.yBottom = yC - 1;
    c.under = true;
  }
  const gateSign = hangingSign(ctx, 'gate', [{ text: 'のりば 1・2番線', sub: 'To Platforms 1 & 2', badge: '↓', badgeBg: LINE, badgeFg: '#fff' }]);
  for (const f of [-1, 1]) isignAt(ctx, 252, yCeil1 - 0.45, GATE_Z + f * 0.03, 3.2, 0.6, [0, f], gateSign, 1.2);
  ctx.interactables.push({ kind: 'gate', x: 252, z: GATE_Z - 1.4, r: 3.0, y: yC, label: '改札を通る' });

  // stairs + escalator down to the platform
  const steps = Math.round((yC - yP) / 0.17);
  const run = (st.z1 - st.z0) / steps;
  const sx0 = st.x0, sx1 = st.x1 - 1.3; // stairs | escalator
  for (let i = 0; i < steps; i++) {
    const top = yC - (i + 1) * ((yC - yP) / steps);
    ib(ctx, (sx0 + sx1) / 2, st.z0 + i * run).boxMM(sx0, yP, st.z0 + i * run, sx1, top + 0.001, st.z0 + (i + 1) * run, { color: 0xcfcbc2, pattern: PAT.TILE, top: 0xd9d5cc });
    ib(ctx, (sx0 + sx1) / 2, st.z0 + i * run).boxMM(sx0, top - 0.004, st.z0 + i * run, sx1, top + 0.012, st.z0 + i * run + 0.05, { color: 0xf0c23a });
  }
  // escalator: sloped steps strip between glass balustrades
  const eb = ib(ctx, sx1 + 0.65, (st.z0 + st.z1) / 2);
  eb.quadOut(V(sx1 + 0.05, yC, st.z0), V(st.x1 - 0.05, yC, st.z0), V(st.x1 - 0.05, yP, st.z1), V(sx1 + 0.05, yP, st.z1), V(sx1 + 0.6, yP - 5, (st.z0 + st.z1) / 2), 0x6a6e74, PAT.LATTICE);
  eb.boxMM(sx1 + 0.05, yP, st.z0, st.x1 - 0.05, yP + 0.2, st.z1, { color: 0x5a5e64, skip: 'Y' });
  for (const x of [sx1, st.x1]) {
    eb.quadOut(V(x, yC + 0.05, st.z0), V(x, yP + 0.05, st.z1), V(x, yP + 1.0, st.z1), V(x, yC + 1.0, st.z0), V(x - 3, 0, 0), 0x2a2c30, 0);
    ctx.builders.get('glass', x, st.z0).quad(V(x, yC + 0.05, st.z0), V(x, yP + 0.05, st.z1), V(x, yP + 1.0, st.z1), V(x, yC + 1.0, st.z0), 0xffffff, 0, { uvs: [[0, 0], [1, 0], [1, 1], [0, 1]] });
    eb.rod(V(x, yC + 1.02, st.z0 - 0.5), V(x, yP + 1.02, st.z1 + 0.5), 0.05, 0.05, 6, 0x1b1d22);
  }
  // solid block under the stairs on the platform level, side walls
  const blk = ib(ctx, (st.x0 + st.x1) / 2, (st.z0 + st.z1) / 2);
  for (const x of [st.x0, st.x1]) inQuad(blk, V(x, yP, st.z0), V(x, yP, st.z1), V(x, yC, st.z0), V(x, yC, st.z0), V(252.2, yP, -25), 0xe8e4dc, PAT.TILE);
  // the mass under the stairs blocks the platform, in slices that stay below the walking line
  const stairY = (z) => yC - Math.min(1, Math.max(0, (z - st.z0) / (st.z1 - st.z0))) * (yC - yP);
  for (let k = 0; k < 6; k++) {
    const za = st.z0 + ((st.z1 - st.z0) * k) / 6, zb = st.z0 + ((st.z1 - st.z0) * (k + 1)) / 6;
    ctx.colliders.addBox((st.x0 + st.x1) / 2, (za + zb) / 2, (st.x1 - st.x0) / 2 + 0.1, (zb - za) / 2, 0, stairY(zb) - 0.55, yP - 1);
  }
  // glass railings around the opening on B1
  const rails = [[st.x0 - 0.05, st.z0, st.x0 - 0.05, st.z1 + 0.1], [st.x1 + 0.05, st.z0, st.x1 + 0.05, st.z1 + 0.1], [st.x0 - 0.05, st.z1 + 0.1, st.x1 + 0.05, st.z1 + 0.1]];
  for (const [x0, z0, x1, z1] of rails) {
    ctx.builders.get('glass', (x0 + x1) / 2, (z0 + z1) / 2).quad(V(x0, yC, z0), V(x1, yC, z1), V(x1, yC + 1.05, z1), V(x0, yC + 1.05, z0), 0xffffff, 0, { uvs: [[0, 0], [1, 0], [1, 1], [0, 1]] });
    ib(ctx, x0, z0).rod(V(x0, yC + 1.08, z0), V(x1, yC + 1.08, z1), 0.035, 0.035, 6, 0xb9bdc2);
    const c = ctx.colliders.addSegment(x0, z0, x1, z1, 0.15, yC + 1.1);
    if (c) {
      c.yBottom = yC - 0.6;
      c.under = true;
    }
  }
  // the stair + escalator surface
  ctx.colliders.addSurface(st.x0, st.z0 - 0.2, st.x1, st.z1, (x, z) => {
    if (z <= st.z0) return yC;
    const k = Math.min(1, (z - st.z0) / (st.z1 - st.z0));
    if (x > sx1) return yC - k * (yC - yP);
    const i = Math.min(steps - 1, Math.floor((z - st.z0) / run));
    return yC - (i + 1) * ((yC - yP) / steps);
  }, 4, { min: yP - 1.5, max: yC + 2.5, under: true });
  // benches, lift, posters in the paid area
  const pb = ib(ctx, 246, -24);
  benchAt(ctx, pb, 244.0, yC, -24, -Math.PI / 2, 0x6a8fb8, 'ベンチでひと休み');
  pb.boxMM(258.2, yC, -27, 261.0, yCeil1, -24, { color: 0xc9ced3, pattern: PAT.SEAM });
  ctx.builders.get('glass', 258, -25).quad(V(258.18, yC + 0.1, -26.6), V(258.18, yC + 0.1, -24.4), V(258.18, yC + 2.3, -24.4), V(258.18, yC + 2.3, -26.6), 0xffffff, 0, { uvs: [[0, 0], [1, 0], [1, 1], [0, 1]] });
  ctx.colliders.addBox(259.6, -25.5, 1.4, 1.5, 0, yCeil1, yC - 1).under = true;
  const liftSign = ctx.atlas2.draw('sw-lift', 128, 64, (c, w, h) => drawBoard(c, w, h, { text: 'エレベーター', bg: '#ffffff', fg: '#20324a', weather: false }));
  isignAt(ctx, 258.17, yC + 2.6, -25.5, 1.2, 0.36, [-1, 0], liftSign, 0.6);
}

// ---------------------------------------------------------------------------
// street stairwells
// ---------------------------------------------------------------------------
function buildExits(ctx) {
  for (const e of S.exits) {
    const inner = e.x0 >= 252 ? e.x0 : e.x1; // wall shared with the concourse
    const outer = inner === e.x0 ? e.x1 : e.x0;
    const xm = (e.x0 + e.x1) / 2;
    const street = (z) => groundH(outer, z);
    const zTop = e.z1, zBot = e.z1 - 10; // stairs from the street (south end) down northward
    const yTop = street(zTop);
    const steps = Math.round((yTop - yC) / 0.165);
    const run = (zTop - zBot) / steps;
    const sw0 = Math.min(e.x0, e.x1) + 0.25, sw1 = Math.max(e.x0, e.x1) - 0.25;
    const kit = new Kit(ctx, xm, (e.z0 + e.z1) / 2);
    const t = kit.t;
    // stair steps (open to the sky: toon material, sunlit)
    for (let i = 0; i < steps; i++) {
      const top = yTop - (i + 1) * ((yTop - yC) / steps);
      const z1 = zTop - i * run, z0 = zTop - (i + 1) * run;
      t.boxMM(sw0, yC - 0.4, z0, sw1, top + 0.001, z1, { color: 0xc9c5bc, pattern: PAT.TILE, skip: 'y' });
      ctx.builders.get('detail', xm, z0).boxMM(sw0, top - 0.004, z1 - 0.05, sw1, top + 0.012, z1, { color: 0xf0c23a });
    }
    t.boxMM(sw0, yC - 0.4, e.z0, sw1, yC + 0.001, zBot, { color: 0xc9c5bc, pattern: PAT.TILE, skip: 'y' });
    // lining walls: outer side, north end, inner side with the doorway into the concourse
    const dark = 0xd8d4cc;
    const wallSeg = (x0, z0, x1, z1, yb, ytFn) => {
      const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 2));
      for (let k = 0; k < n; k++) {
        const ax = x0 + ((x1 - x0) * k) / n, az = z0 + ((z1 - z0) * k) / n;
        const bx = x0 + ((x1 - x0) * (k + 1)) / n, bz = z0 + ((z1 - z0) * (k + 1)) / n;
        t.wall(ax, az, bx, bz, yb, Math.max(ytFn(ax, az), ytFn(bx, bz)), 0.25, { color: dark, pattern: PAT.TILE });
      }
    };
    const parapet = (x, z) => street(z) + 1.05;
    const ox = outer + (outer < inner ? 0.125 : -0.125), ix = inner + (inner < outer ? 0.18 : -0.18);
    wallSeg(ox, e.z0, ox, zTop, yC - 0.4, parapet);
    wallSeg(e.x0, e.z0 + 0.125, e.x1, e.z0 + 0.125, yC - 0.4, parapet);
    wallSeg(ix, e.z0, ix, DOOR_Z[0], yC - 0.4, parapet);
    wallSeg(ix, DOOR_Z[1], ix, zTop, yC - 0.4, parapet);
    t.boxMM(Math.min(ix - 0.125, ix + 0.125), yC + 2.6, DOOR_Z[0], Math.max(ix - 0.125, ix + 0.125), parapet(ix, DOOR_Z[0]), DOOR_Z[1], { color: dark, pattern: PAT.TILE });
    // handrails
    for (const hx of [sw0 + 0.06, sw1 - 0.06]) ctx.builders.get('detail', hx, zTop).rod(V(hx, yTop + 0.85, zTop), V(hx, yC + 0.85, zBot), 0.03, 0.03, 5, 0xb9bdc2);
    // coping on the parapets
    for (const [x0, z0, x1, z1] of [[ox, e.z0, ox, zTop], [e.x0, e.z0 + 0.125, e.x1, e.z0 + 0.125], [ix, e.z0, ix, zTop]]) {
      const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 2));
      for (let k = 0; k < n; k++) {
        const ax = x0 + ((x1 - x0) * k) / n, az = z0 + ((z1 - z0) * k) / n;
        const bx = x0 + ((x1 - x0) * (k + 1)) / n, bz = z0 + ((z1 - z0) * (k + 1)) / n;
        const y = Math.max(parapet(ax, az), parapet(bx, bz));
        t.wall(ax, az, bx, bz, y, y + 0.06, 0.32, { color: 0x9aa0a6 });
      }
    }
    // canopy over the stair head: steel frame, glass roof, line colour fascia with the sign
    const cz0 = zTop - 6.5, cz1 = zTop + 0.3;
    const roofY = yTop + 2.75;
    for (const [px, pz] of [[e.x0 + 0.15, cz1 - 0.1], [e.x1 - 0.15, cz1 - 0.1], [e.x0 + 0.15, cz0], [e.x1 - 0.15, cz0]]) t.box(px, (street(pz) + roofY) / 2 + 0.5, pz, 0.12, roofY - street(pz) + 0.2, 0.12, { color: 0x5d636a });
    t.boxMM(e.x0 - 0.1, roofY, cz0 - 0.1, e.x1 + 0.1, roofY + 0.12, cz1 + 0.1, { color: 0x5d636a });
    ctx.builders.get('glass', xm, cz0).quad(V(e.x0, roofY + 0.13, cz1), V(e.x1, roofY + 0.13, cz1), V(e.x1, roofY + 0.13, cz0), V(e.x0, roofY + 0.13, cz0), 0xffffff, 0, { uvs: [[0, 0], [1, 0], [1, 1], [0, 1]] });
    t.boxMM(e.x0 - 0.1, roofY + 0.12, cz1, e.x1 + 0.1, roofY + 0.62, cz1 + 0.12, { color: LINE_HEX });
    const sign = ctx.atlas2.draw('sw-exit-sign' + e.id, 256, 64, (c, w, h) => {
      c.fillStyle = LINE;
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#fff';
      c.beginPath();
      c.arc(h * 0.5, h * 0.5, h * 0.36, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = LINE;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.font = `700 ${h * 0.5}px ${FONTS.latin}`;
      c.fillText('S', h * 0.5, h * 0.53);
      c.fillStyle = '#fff';
      fitText(c, `桜ヶ浜中央駅  ${e.id}`, w * 0.72, h * 0.46, FONTS.gothic, '700');
      c.textAlign = 'left';
      c.fillText(`桜ヶ浜中央駅  ${e.id}`, h * 1.0, h * 0.53);
    });
    signOnFace(kit, { o: V(e.x1 + 0.1, 0, cz1 + 0.13), r: V(-1, 0, 0), n: V(0, 0, 1), len: e.x1 - e.x0 + 0.2 }, (e.x1 - e.x0 + 0.2) / 2, roofY + 0.13, e.x1 - e.x0 + 0.1, 0.46, 0.0, sign, 0.9);
    // light in the stairwell
    ctx.builders.get('emissive', xm, zTop - 3).box(xm, roofY - 0.04, zTop - 3, 1.2, 0.04, 0.3, { color: 0xffffff });
    ctx.lamps.push({ x: xm, y: roofY, z: zTop - 3, r: 3, color: 0xe8eeff, floor: street(zTop), clip: { x0: e.x0 - 3, x1: e.x1 + 3, z0: zTop, z1: zTop + 3 } });
    // colliders: parapets (street level) + stairwell walls (all levels); the doorway stays open below
    const seg = (x0, z0, x1, z1, yb) => {
      const c = ctx.colliders.addSegment(x0, z0, x1, z1, 0.3, street(z1) + 1.1);
      if (c) c.yBottom = yb;
      return c;
    };
    seg(ox, e.z0, ox, zTop, -20);
    seg(e.x0, e.z0 + 0.125, e.x1, e.z0 + 0.125, -20);
    seg(ix, e.z0, ix, DOOR_Z[0], -20);
    seg(ix, DOOR_Z[1], ix, zTop, -20);
    seg(ix, DOOR_Z[0], ix, DOOR_Z[1], yC + 2.4);
    // walk surface: steps, then the landing that leads through the doorway
    ctx.colliders.addSurface(Math.min(e.x0, e.x1), e.z0, Math.max(e.x0, e.x1), zTop, (x, z) => {
      if (z <= zBot) return yC;
      const i = Math.min(steps - 1, Math.floor((zTop - z) / run));
      return yTop - (i + 1) * ((yTop - yC) / steps);
    }, 4);
    // the doorway strip (between the stairwell and the concourse wall)
    ctx.colliders.addSurface(Math.min(inner, inner + (inner > xm ? 0.3 : -0.3)), DOOR_Z[0], Math.max(inner, inner + (inner > xm ? 0.3 : -0.3)), DOOR_Z[1], () => yC, 4, lvl(yC));
    // street sign pole with the line mark
    const px = outer + (outer < inner ? -0.5 : 0.5), pz = zTop + 0.6;
    const py = street(pz);
    t.cyl(px, py, pz, 0.06, 0.06, 3.2, 8, 0x5d636a);
    const mark = ctx.atlas2.draw('sw-mark', 128, 128, (c, w, h) => {
      c.fillStyle = '#fff';
      c.fillRect(0, 0, w, h);
      c.beginPath();
      c.arc(w / 2, h / 2, w * 0.42, 0, Math.PI * 2);
      c.fillStyle = LINE;
      c.fill();
      c.fillStyle = '#fff';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.font = `700 ${h * 0.5}px ${FONTS.latin}`;
      c.fillText('S', w / 2, h * 0.54);
    });
    for (const f of [-1, 1]) signOnFace(kit, { o: V(px - f * 0.3, py, pz + f * 0.07), r: V(f, 0, 0), n: V(0, 0, f), len: 0.6 }, 0.3, 2.7, 0.6, 0.6, 0.0, mark, 0.9);
    ctx.colliders.addCircle(px, pz, 0.1);
    ctx.landmarks.push({ id: 'subway' + e.id, name: `桜ヶ浜中央駅 ${e.id}`, x: xm, z: zTop });
  }
}

// ---------------------------------------------------------------------------
// tunnels beyond both ends
// ---------------------------------------------------------------------------
function buildTunnels(ctx) {
  for (const [z0, z1] of [[S.z0 - 90, S.z0], [S.z1, S.z1 + 66]]) {
    const inside = V(252, yT + 2, (z0 + z1) / 2);
    for (let z = z0; z < z1; z += 10) {
      const za = z, zb = Math.min(z1, z + 10);
      const b = ib(ctx, 252, za);
      const c = 0x1a1c20;
      inQuad(b, V(HX0, yT, za), V(HX0, yT, zb), V(HX0, yP + 3.4, zb), V(HX0, yP + 3.4, za), inside, c, 0);
      inQuad(b, V(HX1, yT, za), V(HX1, yT, zb), V(HX1, yP + 3.4, zb), V(HX1, yP + 3.4, za), inside, c, 0);
      inQuad(b, V(HX0, yP + 3.4, za), V(HX1, yP + 3.4, za), V(HX1, yP + 3.4, zb), V(HX0, yP + 3.4, zb), inside, c, 0);
      inQuad(b, V(HX0, yT, za), V(HX1, yT, za), V(HX1, yT, zb), V(HX0, yT, zb), inside, 0x121316, 0);
      // centre wall between the two tubes
      b.boxMM(251.2, yT, za, 252.8, yP + 3.4, zb, { color: c });
      for (const x of [HX0 + 0.1, HX1 - 0.1]) ctx.builders.get('emissive', x, za).box(x, yP + 1.6, za + 5, 0.05, 0.12, 0.12, { color: 0xffe0a0 });
    }
    // end caps far inside
    const zc = z0 === S.z0 - 90 ? z0 : z1;
    inQuad(ib(ctx, 252, zc), V(HX0, yT, zc), V(HX1, yT, zc), V(HX1, yP + 3.4, zc), V(HX0, yP + 3.4, zc), inside, 0x0c0d10, 0);
  }
}

// ---------------------------------------------------------------------------
// trains: three stainless cars with a line colour band and sliding doors
// ---------------------------------------------------------------------------
const TRAIN_Y = yT + 0.04; // bogies on the rails, car floor level with the platform
function buildTrainMeshes(ctx, mat, windowMat, signMat) {
  const body = new MeshBuilder(), win = new MeshBuilder(), sgn = new MeshBuilder(), emi = new MeshBuilder();
  const H = 3.5, y0 = yP - TRAIN_Y;
  const steel = 0xd2d6da;
  for (let ci = 0; ci < 3; ci++) {
    const cz = CAR_CENTERS[ci];
    body.box(0, y0 + H / 2, cz, CAR_W, H, CAR_L, { color: steel, pattern: PAT.SEAM, ao: 0.06 });
    body.box(0, y0 + H + 0.1, cz, CAR_W - 0.4, 0.2, CAR_L - 0.6, { color: 0xb9bdc2 });
    body.box(0, y0 - 0.3, cz, CAR_W - 0.5, 0.6, CAR_L - 1.6, { color: 0x34363a });
    for (const bz of [cz - CAR_L / 2 + 2.4, cz + CAR_L / 2 - 2.4]) body.box(0, 0.5, bz, CAR_W - 0.7, 0.5, 2.4, { color: 0x2a2b2f });
    for (const xs of [-1, 1]) {
      const x = xs * (CAR_W / 2 + 0.006);
      // line colour bands above and below the windows
      body.box(x, y0 + 1.0, cz, 0.012, 0.16, CAR_L - 0.1, { color: LINE_HEX });
      body.box(x, y0 + 2.62, cz, 0.012, 0.08, CAR_L - 0.1, { color: LINE_HEX });
      // windows between doors
      const edges = [cz - CAR_L / 2 + 0.6, ...DOOR_OFFS.map((o) => cz + o), cz + CAR_L / 2 - 0.6];
      for (let k = 0; k < edges.length - 1; k++) {
        const za = edges[k] + (k === 0 ? 0 : 0.9), zb = edges[k + 1] - (k === edges.length - 2 ? 0 : 0.9);
        if (zb - za < 0.6) continue;
        const pts = xs > 0 ? [V(x + 0.006, y0 + 1.2, zb), V(x + 0.006, y0 + 1.2, za), V(x + 0.006, y0 + 2.45, za), V(x + 0.006, y0 + 2.45, zb)] : [V(x - 0.006, y0 + 1.2, za), V(x - 0.006, y0 + 1.2, zb), V(x - 0.006, y0 + 2.45, zb), V(x - 0.006, y0 + 2.45, za)];
        win.quad(pts[0], pts[1], pts[2], pts[3], 0xffffff, 244 + (k % 3), { uvs: [[0, 0], [1, 0], [1, 1], [0, 1]] });
      }
      // dark door openings behind the sliding leaves
      for (const o of DOOR_OFFS) body.box(x, y0 + 1.05, cz + o, 0.014, 2.1, 1.3, { color: 0x3c4046 });
    }
  }
  // cab ends
  const ends = [CAR_CENTERS[0] - CAR_L / 2, CAR_CENTERS[2] + CAR_L / 2];
  ends.forEach((ez, i) => {
    const f = i === 0 ? -1 : 1;
    const z = ez + f * 0.012;
    body.box(0, y0 + 1.1, ez + f * 0.05, CAR_W - 0.05, 1.4, 0.1, { color: LINE_HEX });
    const pts = f > 0 ? [V(-1.15, y0 + 1.9, z), V(1.15, y0 + 1.9, z), V(1.15, y0 + 3.1, z), V(-1.15, y0 + 3.1, z)] : [V(1.15, y0 + 1.9, z), V(-1.15, y0 + 1.9, z), V(-1.15, y0 + 3.1, z), V(1.15, y0 + 3.1, z)];
    win.quad(pts[0], pts[1], pts[2], pts[3], 0xffffff, 250, { uvs: [[0, 0], [1, 0], [1, 1], [0, 1]] });
    const uv = destBoard(ctx, i === 0 ? '各停 はなみだい' : '各停 しおみ');
    const d = f > 0 ? [V(-0.8, y0 + 3.17, z), V(0.8, y0 + 3.17, z), V(0.8, y0 + 3.45, z), V(-0.8, y0 + 3.45, z)] : [V(0.8, y0 + 3.17, z), V(-0.8, y0 + 3.17, z), V(-0.8, y0 + 3.45, z), V(0.8, y0 + 3.45, z)];
    sgn.quad(d[0], d[1], d[2], d[3], 0xffffff, 1.2, { uvs: [[uv.u0, uv.v0], [uv.u1, uv.v0], [uv.u1, uv.v1], [uv.u0, uv.v1]] });
    for (const xs of [-1, 1]) emi.box(xs * 0.95, y0 + 0.75, ez + f * 0.03, 0.34, 0.14, 0.03, { color: 0xfff4dc });
  });
  const group = new THREE.Group();
  const add = (b, m) => {
    const mesh = new THREE.Mesh(b.toGeometry(), m);
    mesh.frustumCulled = false;
    group.add(mesh);
  };
  add(body, mat);
  add(win, windowMat);
  add(sgn, signMat);
  add(emi, ctx.materials.emissive.material);
  // sliding door leaves
  const leaf = new MeshBuilder();
  leaf.box(0, 1.05, 0, 0.03, 2.1, 0.64, { color: 0xc7cbcf, pattern: PAT.SEAM });
  leaf.box(0.018, 1.45, 0, 0.006, 0.9, 0.4, { color: 0x4a5866 });
  leaf.box(-0.018, 1.45, 0, 0.006, 0.9, 0.4, { color: 0x4a5866 });
  const leaves = new THREE.InstancedMesh(leaf.toGeometry(), mat, 3 * DOOR_OFFS.length * 2 * 2);
  leaves.frustumCulled = false;
  group.add(leaves);
  return { group, leaves, y0 };
}

class SubwayTrain {
  constructor(ctx, scene, track, dir, phase) {
    this.x = S.tracks[track];
    this.dir = dir; // +1 southbound (+z), -1 northbound
    this.mat = createInteriorMaterial({ name: 'subwayTrain' });
    const { group, leaves, y0 } = buildTrainMeshes(ctx, this.mat, ctx.materials.window.material, ctx.materials.interiorSign.material);
    this.group = group;
    this.leaves = leaves;
    this.y0 = y0;
    group.position.set(this.x, TRAIN_Y, 0);
    group.rotation.y = dir > 0 ? 0 : Math.PI;
    scene.add(group);
    this.state = 'wait';
    this.timer = phase;
    this.z = 0;
    this.v = 0;
    this.open = 0;
    this.events = [];
    this.m4 = new THREE.Matrix4();
    this.place();
  }
  get startZ() {
    return this.dir > 0 ? S.z0 - 110 : S.z1 + 82;
  }
  get endZ() {
    return this.dir > 0 ? S.z1 + 92 : S.z0 - 120;
  }
  update(dt) {
    switch (this.state) {
      case 'wait':
        this.timer -= dt;
        if (this.timer <= 0) {
          this.state = 'arrive';
          this.z = this.startZ;
          this.v = 14;
          this.events.push('approach');
        }
        break;
      case 'arrive': {
        const remain = (S.stop - this.z) * this.dir;
        const vT = Math.min(14, Math.sqrt(Math.max(0, 2 * 0.9 * remain)) + 0.2);
        this.v = Math.min(vT, this.v + dt);
        if (remain <= 0.03) {
          this.z = S.stop;
          this.v = 0;
          this.state = 'dwell';
          this.timer = 24;
          this.events.push('arrived');
        }
        break;
      }
      case 'dwell':
        this.timer -= dt;
        if (this.timer < 22 && this.timer > 7) this.open = Math.min(1, this.open + dt / 1.6);
        else this.open = Math.max(0, this.open - dt / 1.6);
        if (Math.abs(this.timer - 21.5) < dt) this.events.push('doorsOpen');
        if (Math.abs(this.timer - 9.5) < dt) this.events.push('melody');
        if (Math.abs(this.timer - 7) < dt) this.events.push('doorsClose');
        if (this.timer <= 0) {
          this.state = 'depart';
          this.events.push('depart');
        }
        break;
      case 'depart':
        this.v = Math.min(16, this.v + dt * 0.9);
        if ((this.z - this.endZ) * this.dir > 0) {
          this.state = 'wait';
          this.timer = 70 + Math.random() * 30;
        }
        break;
    }
    this.z += this.dir * this.v * dt;
    this.place();
  }
  place() {
    const visible = this.state !== 'wait';
    this.group.visible = visible;
    this.group.position.z = this.z;
    // darker inside the tunnels
    const d = Math.max(0, Math.abs(this.z - S.stop) - 32);
    this.mat.uniforms.uLight.value.setScalar(Math.max(0.28, 1 - d / 45));
    let i = 0;
    for (const cz of CAR_CENTERS) {
      for (const o of DOOR_OFFS) {
        for (const xs of [-1, 1]) {
          // only the platform side opens: local -x faces the island platform on both tracks
          const platformSide = -1;
          const op = xs === platformSide ? this.open : 0;
          for (const e of [-1, 1]) {
            this.m4.makeTranslation(xs * (CAR_W / 2 + 0.02), this.y0, cz + o + e * (0.32 + op * 0.62));
            this.leaves.setMatrixAt(i++, this.m4);
          }
        }
      }
    }
    this.leaves.instanceMatrix.needsUpdate = true;
  }
}

// ---------------------------------------------------------------------------
export function buildSubway(ctx, scene) {
  const n0 = ctx.colliders.items.length;
  buildHall(ctx);
  buildConcourse(ctx);
  buildExits(ctx);
  buildTunnels(ctx);
  const doors = buildPlatformDoors(ctx, scene);
  // everything built here keeps its own height range; street-level colliders above the
  // station are lifted at the end of the world build (see world.js)
  for (let i = n0; i < ctx.colliders.items.length; i++) ctx.colliders.items[i].under = true;
  const trains = [new SubwayTrain(ctx, scene, 1, 1, 12), new SubwayTrain(ctx, scene, 0, -1, 55)];
  const sub = {
    trains,
    doors,
    events: [],
    update(dt) {
      for (const tr of trains) {
        tr.update(dt);
        for (const e of tr.events) sub.events.push({ e, train: tr });
        tr.events.length = 0;
      }
      // platform doors follow the train at their edge
      doors.sides[0].open = trains[1].state === 'dwell' ? trains[1].open : 0;
      doors.sides[1].open = trains[0].state === 'dwell' ? trains[0].open : 0;
      doors.update();
    },
  };
  ctx.subway = sub;
  ctx.landmarks.push({ id: 'subway', name: '桜ヶ浜中央駅', x: 252, z: -30 });
  ctx.soundSpots.push({ kind: 'station', x: 252, y: yP, z: -14 });
  void UNDER;
  void RNG;
  return sub;
}
