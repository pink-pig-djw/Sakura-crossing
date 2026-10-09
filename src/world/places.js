import * as THREE from 'three';
import { RNG, clamp } from '../core/rng.js';
import { PAT } from '../core/builder.js';
import { terrainH, STATION, PLAZA, PARK, SHRINE, townH } from './layout.js';
import { Kit, boxFaces, fp, faceBox, signOnFace, windowUnit, door, koshiDoor, gableRoof, hipRoof, leanTo, bicycle, potPlant, acUnit, FRAME, metalFence } from './kit.js';
import { lotFrame, WALLS, ROOFS, stoneLantern } from './buildings.js';
import { buildVending } from './props.js';
import { benchAt } from './coast.js';
import { FONTS, drawBoard, drawVertical, fitText, weather } from '../render/atlas.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ---------------------------------------------------------------------------
// Station
// ---------------------------------------------------------------------------
function stationBoard(ctx) {
  return ctx.atlas.draw('ekimeihyo', 512, 300, (c, w, h) => {
    c.fillStyle = '#fbfaf6';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#e7779a';
    c.fillRect(0, h * 0.62, w, h * 0.1);
    c.fillStyle = '#1a1a1a';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    fitText(c, 'さくらがはま', w * 0.8, h * 0.22, FONTS.gothic, '700');
    c.fillText('さくらがはま', w / 2, h * 0.2);
    fitText(c, '桜ヶ浜', w * 0.4, h * 0.14, FONTS.gothic, '700');
    c.fillText('桜ヶ浜', w / 2, h * 0.41);
    c.font = `500 ${h * 0.08}px ${FONTS.latin}`;
    c.fillText('Sakuragahama', w / 2, h * 0.53);
    c.fillStyle = '#fff';
    c.font = `700 ${h * 0.065}px ${FONTS.gothic}`;
    c.fillText('SH 07', w * 0.08, h * 0.67);
    c.fillStyle = '#1a1a1a';
    c.textAlign = 'left';
    c.font = `700 ${h * 0.09}px ${FONTS.gothic}`;
    c.fillText('はなみだい', w * 0.04, h * 0.84);
    c.font = `500 ${h * 0.055}px ${FONTS.latin}`;
    c.fillText('Hanamidai', w * 0.04, h * 0.94);
    c.textAlign = 'right';
    c.font = `700 ${h * 0.09}px ${FONTS.gothic}`;
    c.fillText('しおかぜ', w * 0.96, h * 0.84);
    c.font = `500 ${h * 0.055}px ${FONTS.latin}`;
    c.fillText('Shiokaze', w * 0.96, h * 0.94);
    c.fillStyle = '#e7779a';
    c.beginPath();
    c.moveTo(w * 0.36, h * 0.84);
    c.lineTo(w * 0.42, h * 0.8);
    c.lineTo(w * 0.42, h * 0.88);
    c.fill();
    c.beginPath();
    c.moveTo(w * 0.64, h * 0.84);
    c.lineTo(w * 0.58, h * 0.8);
    c.lineTo(w * 0.58, h * 0.88);
    c.fill();
  });
}

function stationNameSign(ctx) {
  return ctx.atlas.draw('station-facade', 640, 128, (c, w, h) => {
    c.fillStyle = '#f3efe4';
    c.fillRect(0, 0, w, h);
    c.strokeStyle = '#7a6a58';
    c.lineWidth = 6;
    c.strokeRect(3, 3, w - 6, h - 6);
    // sakura mark
    c.fillStyle = '#e7779a';
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
      c.beginPath();
      c.ellipse(h * 0.55 + Math.cos(a) * h * 0.16, h * 0.5 + Math.sin(a) * h * 0.16, h * 0.13, h * 0.09, a, 0, Math.PI * 2);
      c.fill();
    }
    c.fillStyle = '#2b2b2b';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    fitText(c, '桜ヶ浜駅', w * 0.62, h * 0.62, FONTS.mincho, '900');
    c.fillText('桜ヶ浜駅', w * 0.55, h * 0.52);
    c.font = `500 ${h * 0.14}px ${FONTS.latin}`;
    c.textAlign = 'right';
    c.fillText('SAKURAGAHAMA STA.', w * 0.96, h * 0.86);
    weather(c, w, h, 0.05, 3);
  });
}

function timetable(ctx) {
  return ctx.atlas.draw('timetable', 256, 320, (c, w, h) => {
    c.fillStyle = '#fdfcf7';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#2a4a8a';
    c.fillRect(0, 0, w, h * 0.12);
    c.fillStyle = '#fff';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    fitText(c, '時刻表  花見台・汐風方面', w * 0.92, h * 0.07, FONTS.gothic, '700');
    c.fillText('時刻表  花見台・汐風方面', w / 2, h * 0.06);
    c.fillStyle = '#222';
    c.font = `500 ${h * 0.04}px ${FONTS.gothic}`;
    c.textAlign = 'left';
    for (let hr = 6; hr <= 22; hr++) {
      const y = h * 0.16 + (hr - 6) * h * 0.049;
      c.fillStyle = hr % 2 ? '#eef2f8' : '#fff';
      c.fillRect(4, y - h * 0.022, w - 8, h * 0.046);
      c.fillStyle = '#222';
      c.fillText(String(hr).padStart(2, ' '), 10, y);
      const mins = hr >= 7 && hr <= 9 ? '05 18 31 44 57' : '12 32 52';
      c.fillText(mins, 46, y);
    }
  });
}

function poster(ctx, key, title, sub, bg, fg) {
  return ctx.atlas.draw(key, 160, 224, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, bg[0]);
    g.addColorStop(1, bg[1]);
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(255,255,255,0.5)';
    for (let i = 0; i < 14; i++) {
      c.beginPath();
      c.arc(((i * 53) % w), ((i * 97) % (h * 0.6)) + 10, 6 + (i % 4) * 3, 0, Math.PI * 2);
      c.fill();
    }
    c.fillStyle = fg;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    fitText(c, title, w * 0.9, h * 0.13, FONTS.maru, '700');
    c.fillText(title, w / 2, h * 0.7);
    fitText(c, sub, w * 0.9, h * 0.06, FONTS.gothic, '500');
    c.fillText(sub, w / 2, h * 0.84);
  });
}

export function buildStation(ctx) {
  const S = STATION;
  const kit = new Kit(ctx, (S.x0 + S.x1) / 2, 48);
  const t = kit.t;
  const py = S.platY;
  // platform slab
  t.boxMM(S.platX0, 2.6, S.platZ0, S.platX1, py, S.platZ1, { color: 0xc8c4ba, pattern: PAT.CONCRETE, ao: 0.15 });
  t.boxMM(S.platX0, py - 0.002, S.platZ1 - 0.25, S.platX1, py + 0.012, S.platZ1, { color: 0xeceae4 });
  t.boxMM(S.platX0, py - 0.002, S.platZ1 - 0.95, S.platX1, py + 0.008, S.platZ1 - 0.65, { color: 0xf0c23a, pattern: PAT.TILE });
  // ramps at both ends
  for (const [x0, x1, dir] of [[S.platX0 - 5, S.platX0, 1], [S.platX1, S.platX1 + 5, -1]]) {
    const ya = dir > 0 ? 3.0 : py, yb = dir > 0 ? py : 3.0;
    t.slab(V(x0, ya, S.platZ0 + 0.4), V(x0, ya, S.platZ1 - 1.0), V(x1, yb, S.platZ1 - 1.0), V(x1, yb, S.platZ0 + 0.4), 1.0, 0xc8c4ba, PAT.CONCRETE);
    ctx.colliders.addSurface(x0, S.platZ0 + 0.4, x1, S.platZ1 - 1.0, (px) => ya + ((px - x0) / (x1 - x0)) * (yb - ya), 2);
  }
  ctx.colliders.addSurface(S.platX0, S.platZ0, S.platX1, S.platZ1, () => py, 2);
  // platform fence on the north side (except the building)
  for (let x = S.platX0; x < S.platX1; x += 2) {
    if (x > S.x0 - 0.5 && x < S.x1 + 0.5) continue;
    metalFence(t, x, S.platZ0 + 0.1, Math.min(x + 2, S.platX1), S.platZ0 + 0.1, () => py, 1.2, 0xe2e2dc);
    ctx.colliders.addSegment(x, S.platZ0 + 0.1, Math.min(x + 2, S.platX1), S.platZ0 + 0.1, 0.2);
  }
  // shelter roof over the middle part
  const r0 = S.x0 - 10, r1 = S.x1 + 6;
  for (let x = r0 + 1; x < r1; x += 5) {
    t.cyl(x, py, S.platZ0 + 1.2, 0.1, 0.1, 3.2, 8, 0xd9dcde);
    ctx.colliders.addCircle(x, S.platZ0 + 1.2, 0.15);
  }
  leanTo(t, r0, r1, S.platZ0 + 0.2, S.platZ1 - 0.3, py + 3.45, 0.08, { color: 0xb8bec4, pattern: PAT.CORRUGATED, fascia: 0xd9dcde });
  // lights under the roof
  for (let x = r0 + 3; x < r1; x += 6) {
    ctx.builders.get('emissive', x, 53).box(x, py + 3.1, S.platZ0 + 1.6, 1.2, 0.06, 0.12, { color: 0xffffff });
    ctx.lamps.push({ x, y: py + 3.0, z: S.platZ0 + 1.6, r: 4, color: 0xeef4ff, ground: true });
  }
  // benches + station board + vending
  benchAt(ctx, t, r0 + 6, py, S.platZ0 + 0.7, Math.PI, 0x6a8fb8, 'ホームのベンチに座る');
  benchAt(ctx, t, r1 - 6, py, S.platZ0 + 0.7, Math.PI, 0x6a8fb8, 'ホームのベンチに座る');
  const sb = stationBoard(ctx);
  for (const bx of [S.platX0 + 8, S.platX1 - 8]) {
    t.cyl(bx - 0.9, py, S.platZ1 - 1.6, 0.05, 0.05, 2.6, 6, 0x5a6066);
    t.cyl(bx + 0.9, py, S.platZ1 - 1.6, 0.05, 0.05, 2.6, 6, 0x5a6066);
    for (const e of [-1, 1]) {
      const face = e > 0
        ? { o: V(bx - 1, py, S.platZ1 - 1.55), r: V(1, 0, 0), n: V(0, 0, 1), len: 2 }
        : { o: V(bx + 1, py, S.platZ1 - 1.65), r: V(-1, 0, 0), n: V(0, 0, -1), len: 2 };
      signOnFace(kit, face, 1.0, 1.35, 2.0, 1.17, 0.0, sb, 0.6, 0xe9e9e4);
    }
    ctx.colliders.addBox(bx, S.platZ1 - 1.6, 1.0, 0.15, 0);
    ctx.interactables.push({ kind: 'sign', x: bx, z: S.platZ1 - 1.0, r: 1.6, label: '駅名標を見る', text: '桜ヶ浜（さくらがはま）— 次は はなみだい / しおかぜ' });
  }
  buildVending(ctx, S.x1 + 9, S.platZ0 + 0.55, 0, 99, 2);
  // clock
  t.cyl(S.x1 + 3, py, S.platZ0 + 1.0, 0.05, 0.05, 2.8, 6, 0x4a4e52);
  const clock = ctx.atlas.draw('clock', 128, 128, (c, w, h) => {
    c.fillStyle = '#fff';
    c.beginPath();
    c.arc(w / 2, h / 2, w / 2 - 3, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = '#333';
    c.lineWidth = 5;
    c.stroke();
    c.lineWidth = 3;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      c.beginPath();
      c.moveTo(w / 2 + Math.cos(a) * w * 0.38, h / 2 + Math.sin(a) * h * 0.38);
      c.lineTo(w / 2 + Math.cos(a) * w * 0.44, h / 2 + Math.sin(a) * h * 0.44);
      c.stroke();
    }
  });
  for (const e of [-1, 1]) {
    const face = { o: V(S.x1 + 3 - 0.3 * e, py, S.platZ0 + 1.0 + e * 0.08), r: V(e, 0, 0), n: V(0, 0, e), len: 0.6 };
    signOnFace(kit, face, 0.3, 2.65, 0.6, 0.6, 0.0, clock, 0.5);
  }
  ctx.clocks = ctx.clocks || [];
  ctx.clocks.push({ x: S.x1 + 3, y: py + 2.95, z: S.platZ0 + 1.0, off: 0.09 });

  // ---- station building (faces the plaza to the north) ----
  const bx0 = S.x0, bx1 = S.x1, bz0 = S.z0, bz1 = S.z1;
  const cx = (bx0 + bx1) / 2, cz = (bz0 + bz1) / 2;
  const w = bx1 - bx0, d = bz1 - bz0;
  const fy = py; // building floor = platform level
  t.boxMM(bx0 - 0.2, 2.6, bz0 + 2.0, bx1 + 0.2, fy, bz1, { color: 0xb8b4aa, pattern: PAT.STONE });
  // front steps from the plaza
  const steps = 5;
  for (let i = 0; i < steps; i++) {
    const z = bz0 + 2.0 - (i + 1) * 0.36;
    t.boxMM(cx - 5, 2.6, z, cx + 5, fy - (i + 1) * ((fy - 3.0) / (steps + 1)) + 0.001, z + 0.36, { color: 0xc6c1b6, pattern: PAT.STONE });
  }
  ctx.colliders.addSurface(cx - 5, bz0 + 2.0 - steps * 0.36, cx + 5, bz0 + 2.0, (px, pz) => 3.0 + clamp((pz - (bz0 + 2.0 - steps * 0.36)) / (steps * 0.36), 0, 1) * (fy - 3.0), 2);
  ctx.colliders.addSurface(bx0, bz0 + 2.0, bx1, bz1 + 0.2, () => fy, 2);
  const wallC = 0xe9e1cf;
  const H = 3.6;
  // walls: back half closed, front open hall with columns
  t.boxMM(bx0, fy, bz0 + 2.0, bx0 + 0.25, fy + H, bz1 - 0.2, { color: wallC, pattern: PAT.SIDING });
  t.boxMM(bx1 - 0.25, fy, bz0 + 2.0, bx1, fy + H, bz1 - 0.2, { color: wallC, pattern: PAT.SIDING });
  ctx.colliders.addBox(bx0 + 0.12, (bz0 + bz1) / 2 + 1, 0.15, d / 2 - 1);
  ctx.colliders.addBox(bx1 - 0.12, (bz0 + bz1) / 2 + 1, 0.15, d / 2 - 1);
  // office block on the west side with a ticket window
  t.boxMM(bx0 + 0.25, fy, bz0 + 2.0, bx0 + 6.5, fy + H, bz1 - 3.5, { color: wallC, pattern: PAT.SIDING });
  ctx.colliders.addBox(bx0 + 3.4, (bz0 + 2 + bz1 - 3.5) / 2, 3.2, (bz1 - 3.5 - bz0 - 2) / 2);
  const off = { o: V(bx0 + 6.52, fy, bz0 + 2.0), r: V(0, 0, 1), n: V(1, 0, 0), len: d - 5.5 };
  windowUnit(kit, off, 2.2, 0.9, 2.0, 1.1, { frame: FRAME.silver, seed: 200, fixed: true });
  faceBox(t, off, 2.2, 0.8, 2.2, 0.1, 0.35, 0.35, 0x8a7a66);
  const signWin = ctx.atlas.draw('yujin', 256, 64, (c, w2, h2) => drawBoard(c, w2, h2, { text: '有人改札', bg: '#e8f2ea', fg: '#1f5a3a', border: '#1f5a3a' }));
  signOnFace(kit, off, 2.2, 2.25, 1.4, 0.35, 0.02, signWin, 0.7);
  // ticket gates
  for (let i = 0; i < 4; i++) {
    const gx = bx0 + 8 + i * 1.6;
    t.boxMM(gx - 0.12, fy, bz1 - 4.2, gx + 0.12, fy + 1.0, bz1 - 2.4, { color: 0xdedfe2 });
    t.boxMM(gx - 0.13, fy + 0.95, bz1 - 4.2, gx + 0.13, fy + 1.02, bz1 - 3.7, { color: 0x2a6ad0 });
    ctx.colliders.addBox(gx, bz1 - 3.3, 0.14, 0.9);
  }
  // ticket machines on the east wall
  for (let i = 0; i < 2; i++) {
    const mz = bz0 + 3.5 + i * 1.2;
    t.boxMM(bx1 - 1.0, fy, mz - 0.5, bx1 - 0.25, fy + 1.8, mz + 0.5, { color: 0xd8dade });
    const ticket = ctx.atlas.draw('ticketmachine', 128, 160, (c, w2, h2) => {
      c.fillStyle = '#d8dade';
      c.fillRect(0, 0, w2, h2);
      c.fillStyle = '#2a3a5a';
      c.fillRect(w2 * 0.1, h2 * 0.08, w2 * 0.8, h2 * 0.45);
      c.fillStyle = '#7ab0f0';
      for (let k = 0; k < 6; k++) c.fillRect(w2 * 0.15 + (k % 3) * w2 * 0.24, h2 * 0.14 + Math.floor(k / 3) * h2 * 0.18, w2 * 0.2, h2 * 0.13);
      c.fillStyle = '#e44';
      c.fillRect(w2 * 0.15, h2 * 0.62, w2 * 0.3, h2 * 0.05);
      c.fillStyle = '#333';
      c.fillRect(w2 * 0.55, h2 * 0.6, w2 * 0.3, h2 * 0.08);
    });
    const face = { o: V(bx1 - 1.02, fy, mz + 0.5), r: V(0, 0, -1), n: V(-1, 0, 0), len: 1 };
    signOnFace(kit, face, 0.5, 0.3, 0.9, 1.2, 0.0, ticket, 0.8);
    ctx.colliders.addBox(bx1 - 0.6, mz, 0.4, 0.5);
  }
  // roof
  hipRoof(t, cx, cz + 1.0, w + 0.4, d - 1.6, fy + H, { color: 0x5b6879, pattern: PAT.SLATE, slope: 0.42, ov: 0.9, fascia: 0xe9e6de });
  // front columns + big name sign
  for (const xx of [bx0 + 0.3, cx - 3.2, cx + 3.2, bx1 - 0.3]) {
    t.boxMM(xx - 0.15, fy, bz0 + 2.0, xx + 0.15, fy + H, bz0 + 2.3, { color: 0xd9d2c0 });
    ctx.colliders.addBox(xx, bz0 + 2.15, 0.16, 0.16);
  }
  t.boxMM(bx0, fy + H - 0.7, bz0 + 1.95, bx1, fy + H, bz0 + 2.3, { color: wallC, pattern: PAT.SIDING });
  // the name board stands on the edge of the eave, in front of the roof slope
  // (mounted on the wall it disappeared behind the overhang)
  const eaveZ = cz + 1.0 - (d - 1.6) / 2 - 0.9;
  const eaveY = H - 0.9 * 0.42;
  const fsign = { o: V(cx + 4.2, fy, eaveZ + 0.02), r: V(-1, 0, 0), n: V(0, 0, -1), len: 8.4 };
  signOnFace(kit, fsign, 4.2, eaveY + 0.06, 6.2, 1.24, 0.02, stationNameSign(ctx), 0.8, 0x6a5a48);
  // brackets tying it back to the roof
  for (const sx of [cx - 2.4, cx + 2.4]) t.boxMM(sx - 0.05, fy + eaveY - 0.05, eaveZ + 0.06, sx + 0.05, fy + eaveY + 1.0, eaveZ + 0.95, { color: 0x6a5a48 });
  // timetable + posters inside
  const back = { o: V(bx0 + 6.6, fy, bz1 - 4.6), r: V(1, 0, 0), n: V(0, 0, -1), len: w - 7 };
  signOnFace(kit, back, w - 9.5, 1.3, 1.0, 1.25, 0.0, timetable(ctx), 0.6, 0x555555);
  const posters = [
    poster(ctx, 'poster-sakura', '桜ヶ浜 さくらまつり', '4月5日〜4月14日', ['#ffd7e5', '#f6a9c4'], '#7a2a4a'),
    poster(ctx, 'poster-sea', '夏の海へ', '桜ヶ浜線で行こう', ['#9fd8f0', '#3b8fd0'], '#ffffff'),
    poster(ctx, 'poster-tea', '汐見茶房', '駅前 徒歩3分', ['#f6efd8', '#e0c890'], '#5a3a1a'),
  ];
  posters.forEach((p, i) => signOnFace(kit, back, 1.0 + i * 1.2, 1.35, 0.8, 1.12, 0.0, p, 0.5));
  // ceiling lights
  for (let i = 0; i < 3; i++) ctx.builders.get('emissive', cx, cz).box(bx0 + 8 + i * 4, fy + H - 0.12, cz, 1.4, 0.06, 0.2, { color: 0xffffff });
  ctx.lamps.push({ x: cx, y: fy + 0.1, z: bz0 + 3.5, r: 5, color: 0xeef4ff, ground: true });
  // trash bins near the gates
  t.boxMM(bx1 - 2.2, fy, bz1 - 1.1, bx1 - 1.6, fy + 1.0, bz1 - 0.6, { color: 0x2a6ad0 });
  t.boxMM(bx1 - 1.55, fy, bz1 - 1.1, bx1 - 0.95, fy + 1.0, bz1 - 0.6, { color: 0x2e8a4a });
  ctx.landmarks.push({ id: 'station', name: '桜ヶ浜駅', x: cx, z: bz0 });
  ctx.catSpots.push({ x: r1 - 3, z: S.platZ0 + 0.9, y: py, kind: 'platform', ry: 0.5 });
}

// ---------------------------------------------------------------------------
// Station plaza: bus stop, koban, bike parking, clock, post box, sakura
// ---------------------------------------------------------------------------
export function buildPlaza(ctx) {
  const P = PLAZA;
  const kit = new Kit(ctx, (P.x0 + P.x1) / 2, (P.z0 + P.z1) / 2);
  const t = kit.t;
  const y = (x, z) => terrainH(x, z);
  // central planter with a big sakura
  const pcx = -50, pcz = 33;
  t.boxMM(pcx - 3.2, y(pcx, pcz) - 0.2, pcz - 3.2, pcx + 3.2, y(pcx, pcz) + 0.45, pcz + 3.2, { color: 0xb9b2a4, pattern: PAT.STONE });
  ctx.ground.rect(pcx - 3, pcz - 3, pcx + 3, pcz + 3, 0x8a6a4c, PAT.DIRT);
  ctx.trees.push({ kind: 'sakura', x: pcx, z: pcz, seed: 4401, scale: 1.15, y: y(pcx, pcz) + 0.45 });
  ctx.colliders.addBox(pcx, pcz, 3.2, 3.2, 0, y(pcx, pcz) + 0.45);
  ctx.colliders.addSurface(pcx - 3.2, pcz - 3.2, pcx + 3.2, pcz + 3.2, () => y(pcx, pcz) + 0.45, 1);
  // benches around the planter, backs to the tree
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const bx = pcx + Math.cos(a) * 4.0, bz = pcz + Math.sin(a) * 4.0;
    benchAt(ctx, t, bx, y(bx, bz), bz, -a - Math.PI / 2, 0xa07a54, '桜の下のベンチに座る');
  }
  // clock pole
  const clx = -20, clz = 36;
  t.cyl(clx, y(clx, clz), clz, 0.09, 0.09, 4.2, 8, 0x3f4a44);
  t.box(clx, y(clx, clz) + 4.4, clz, 0.9, 0.9, 0.25, { color: 0x3f4a44 });
  const clock = ctx.atlas.cache.get('clock');
  if (clock) for (const e of [-1, 1]) signOnFace(kit, { o: V(clx - 0.4 * e, y(clx, clz), clz + e * 0.13), r: V(e, 0, 0), n: V(0, 0, e), len: 0.8 }, 0.4, 4.0, 0.8, 0.8, 0.0, clock, 0.6);
  ctx.clocks.push({ x: clx, y: y(clx, clz) + 4.4, z: clz, off: 0.14 });
  ctx.colliders.addCircle(clx, clz, 0.15);
  // bus stop
  const bsx = -24, bsz = 26;
  t.cyl(bsx, y(bsx, bsz), bsz, 0.05, 0.05, 2.4, 6, 0xc9ccd0);
  const busSign = ctx.atlas.draw('busstop', 128, 128, (c, w, h) => {
    c.fillStyle = '#1f6fd0';
    c.beginPath();
    c.arc(w / 2, h / 2, w / 2 - 2, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#fff';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = `700 ${h * 0.2}px ${FONTS.gothic}`;
    c.fillText('バス', w / 2, h * 0.36);
    c.font = `700 ${h * 0.13}px ${FONTS.gothic}`;
    c.fillText('桜ヶ浜駅', w / 2, h * 0.6);
  });
  for (const e of [-1, 1]) signOnFace(kit, { o: V(bsx - 0.3 * e, y(bsx, bsz), bsz + e * 0.06), r: V(e, 0, 0), n: V(0, 0, e), len: 0.6 }, 0.3, 2.0, 0.6, 0.6, 0.0, busSign, 0.4);
  // shelter
  const shx = -30;
  for (const xx of [shx - 2, shx + 2]) t.cyl(xx, y(xx, bsz), bsz + 1.2, 0.06, 0.06, 2.5, 6, 0xb9bec3);
  t.boxMM(shx - 2.4, y(shx, bsz) + 2.5, bsz + 0.4, shx + 2.4, y(shx, bsz) + 2.6, bsz + 1.8, { color: 0x8fa3b5 });
  benchAt(ctx, t, shx, y(shx, bsz), bsz + 1.3, 0, 0x5a7a9a, 'バス停のベンチに座る');
  // koban (police box)
  const kx = -14, kz = 30;
  const ky = y(kx, kz);
  t.boxMM(kx - 2.5, ky - 0.2, kz - 2, kx + 2.5, ky + 3.0, kz + 2, { color: 0xe8e4da, pattern: PAT.TILE });
  gableRoof(t, kx, kz, 5, 4, ky + 3.0, { color: 0x4a4f59, wallColor: 0xe8e4da, slope: 0.5 });
  const kf = boxFaces(kx, ky, kz, 5, 4);
  door(kit, kf.left, 2.0, 0.02, 1.0, 2.1, 0xe6e2da, { glass: true, seed: 210 });
  windowUnit(kit, kf.front, 2.5, 1.0, 1.8, 1.1, { frame: FRAME.silver, seed: 33 });
  const kob = ctx.atlas.draw('koban', 256, 64, (c, w, h) => drawBoard(c, w, h, { text: '交番  KOBAN', bg: '#f6f6f2', fg: '#1d3a7a', weather: false }));
  signOnFace(kit, kf.left, 2.0, 2.4, 1.6, 0.4, 0.03, kob, 0.7);
  kit.e.cyl(kx - 2.6, ky + 2.55, kz - 1.3, 0.11, 0.11, 0.26, 10, 0xff3a2a);
  ctx.colliders.addBox(kx, kz, 2.5, 2.0);
  // red post box
  const pbx = -21, pbz = 44;
  t.cyl(pbx, y(pbx, pbz), pbz, 0.28, 0.28, 1.1, 14, 0xd2252b, PAT.METAL, { top: 0xd2252b });
  t.cyl(pbx, y(pbx, pbz) + 1.1, pbz, 0.3, 0.25, 0.1, 14, 0xb81f24);
  t.box(pbx, y(pbx, pbz) + 0.85, pbz - 0.27, 0.3, 0.05, 0.04, { color: 0x222 });
  ctx.colliders.addCircle(pbx, pbz, 0.32);
  // bicycle parking racks
  for (let i = 0; i < 14; i++) {
    const bx = -64 + i * 0.75;
    bicycle(t, bx, 0, 45, Math.PI / 2 + (i % 2 ? 0.08 : -0.08), [0xd8d8d0, 0x5a8fc4, 0xc44a4a, 0x2f2f2f, 0xe8c84a, 0x9fd0a0, 0xf0a0b0][i % 7], y);
  }
  t.boxMM(-64.5, y(-60, 45) + 2.2, 43.6, -53.5, y(-60, 45) + 2.3, 46.4, { color: 0x9db0a4 });
  for (const xx of [-64, -54]) t.cyl(xx, y(xx, 46), 46.2, 0.05, 0.05, 2.25, 6, 0x9db0a4);
  ctx.colliders.addBox(-59, 45, 5.5, 1.2);
  // tourist map board
  const map = ctx.atlas.draw('mapboard', 320, 220, (c, w, h) => {
    c.fillStyle = '#f7f3e6';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#9fd0e8';
    c.fillRect(0, h * 0.72, w, h * 0.28);
    c.fillStyle = '#e8d8b8';
    c.fillRect(0, h * 0.66, w, h * 0.07);
    c.strokeStyle = '#c9b89a';
    c.lineWidth = 4;
    for (let i = 1; i < 6; i++) {
      c.beginPath();
      c.moveTo((w * i) / 6, 0);
      c.lineTo((w * i) / 6, h * 0.62);
      c.stroke();
    }
    c.strokeStyle = '#555';
    c.setLineDash([8, 6]);
    c.beginPath();
    c.moveTo(0, h * 0.62);
    c.lineTo(w, h * 0.62);
    c.stroke();
    c.setLineDash([]);
    c.fillStyle = '#e7779a';
    for (let i = 0; i < 9; i++) {
      c.beginPath();
      c.arc(w * 0.58, h * 0.08 + i * h * 0.06, 6, 0, Math.PI * 2);
      c.fill();
    }
    c.fillStyle = '#c0392b';
    c.beginPath();
    c.arc(w * 0.38, h * 0.55, 8, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#222';
    c.font = `700 ${h * 0.08}px ${FONTS.gothic}`;
    c.fillText('桜ヶ浜 案内図', 10, h * 0.1);
    c.font = `500 ${h * 0.055}px ${FONTS.gothic}`;
    c.fillText('現在地', w * 0.38 - 18, h * 0.5);
    c.fillText('汐見神社', w * 0.6, h * 0.05);
    c.fillText('桜ヶ浜海岸', w * 0.4, h * 0.88);
  });
  const mbx = -40, mbz = 40;
  t.box(mbx - 1.0, y(mbx, mbz) + 0.8, mbz, 0.1, 1.6, 0.1, { color: 0x5d4636 });
  t.box(mbx + 1.0, y(mbx, mbz) + 0.8, mbz, 0.1, 1.6, 0.1, { color: 0x5d4636 });
  t.box(mbx, y(mbx, mbz) + 1.6, mbz, 2.2, 1.4, 0.1, { color: 0x5d4636 });
  signOnFace(kit, { o: V(mbx + 1.0, y(mbx, mbz), mbz - 0.06), r: V(-1, 0, 0), n: V(0, 0, -1), len: 2 }, 1.0, 1.0, 2.0, 1.36, 0.0, map, 0.5);
  ctx.colliders.addBox(mbx, mbz, 1.1, 0.1);
  ctx.interactables.push({ kind: 'map', x: mbx, z: mbz - 0.9, r: 1.6, label: '案内図を見る' });
  // phone booth
  const phx = -60, phz = 38;
  t.boxMM(phx - 0.5, y(phx, phz), phz - 0.5, phx + 0.5, y(phx, phz) + 0.1, phz + 0.5, { color: 0x888888 });
  for (const [a, b] of [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]]) t.box(phx + a, y(phx, phz) + 1.1, phz + b, 0.06, 2.2, 0.06, { color: 0x5aa06a });
  t.boxMM(phx - 0.55, y(phx, phz) + 2.2, phz - 0.55, phx + 0.55, y(phx, phz) + 2.35, phz + 0.55, { color: 0x5aa06a });
  ctx.builders.get('window', phx, phz).cyl(phx, y(phx, phz) + 0.15, phz, 0.5, 0.5, 2.0, 4, 0xffffff, 140, { caps: false, phase: Math.PI / 4 });
  t.box(phx, y(phx, phz) + 1.2, phz + 0.3, 0.3, 0.45, 0.2, { color: 0x6aa86a });
  ctx.colliders.addBox(phx, phz, 0.55, 0.55);
  // lamp posts
  for (const [lx, lz] of [[-60, 28], [-36, 30], [-12, 40], [-49.5, 43.5]]) {
    const ly = y(lx, lz);
    t.cyl(lx, ly, lz, 0.08, 0.06, 3.6, 8, 0x3f4a44);
    t.cyl(lx, ly + 3.6, lz, 0.22, 0.12, 0.12, 10, 0x3f4a44);
    ctx.builders.get('emissive', lx, lz).geom(new THREE.SphereGeometry(0.24, 12, 8), new THREE.Matrix4().makeTranslation(lx, ly + 3.92, lz), 0xfff4dc);
    ctx.lamps.push({ x: lx, y: ly + 3.9, z: lz, r: 5 });
    ctx.colliders.addCircle(lx, lz, 0.12);
  }
  // planters with flowers along the edge
  for (let i = 0; i < 6; i++) {
    const fx = -60 + i * 8;
    const fz = 24.2;
    t.boxMM(fx - 1.2, y(fx, fz), fz - 0.4, fx + 1.2, y(fx, fz) + 0.5, fz + 0.4, { color: 0xb9b2a4, pattern: PAT.STONE });
    const rng = new RNG(900 + i);
    for (let k = 0; k < 7; k++) potPlant(t, fx - 1.0 + k * 0.33, y(fx, fz) + 0.3, fz + rng.range(-0.2, 0.2), rng, 0.8);
    ctx.colliders.addBox(fx, fz, 1.2, 0.4, 0, y(fx, fz) + 0.5);
  }
  // taxi waiting
  ctx.trees.push({ kind: 'sakura', x: -12, z: 47.5, seed: 4402, scale: 0.9 });
  ctx.vending.push({ x: -63, z: 40, ry: Math.PI / 2, seed: 11, n: 3 });
}

// ---------------------------------------------------------------------------
// Shotengai shops
// ---------------------------------------------------------------------------
const SHOPS = [
  { name: '和菓子 さくら堂', sub: '桜もち・草だんご', kind: 'wagashi', bg: '#2c3f6b', fg: '#f6efe0', font: 'brush', noren: '#2c3f6b', norenText: '和菓子' },
  { name: '喫茶 はるいろ', sub: 'COFFEE & SWEETS  since 1987', kind: 'cafe', bg: '#f3ead6', fg: '#6a3a2a', font: 'maru', awning: ['#b8483e', '#f4efe4'] },
  { name: 'よろず屋 浜田商店', sub: 'たばこ・食料品・日用雑貨', kind: 'yorozuya', bg: '#2f7a55', fg: '#ffffff', font: 'gothic', logo: '浜' },
  { name: 'パン工房 こむぎ', sub: '焼きたてパン', kind: 'bakery', bg: '#f6e7c8', fg: '#7a4a1f', font: 'maru', awning: ['#d98a3a', '#f8f0dc'] },
  { name: '花のアトリエ フローラ', sub: 'FLOWER SHOP', kind: 'florist', bg: '#ffffff', fg: '#3a7a4a', font: 'maru', awning: ['#5aa06a', '#ffffff'] },
  { name: '鮮魚 魚よし', sub: '朝どれ 地魚', kind: 'fish', bg: '#1f5fa8', fg: '#ffffff', font: 'bold' },
  { name: '汐見書店', sub: '本・雑誌・文具', kind: 'books', bg: '#f4efe2', fg: '#3a3a3a', font: 'mincho' },
  { name: '八百屋 みどり', sub: '新鮮野菜・果物', kind: 'grocer', bg: '#f6d84a', fg: '#2a5a2a', font: 'bold', awning: ['#3f8a4a', '#f6f0d8'] },
  { name: '中華そば 浜っ子', sub: 'ラーメン・餃子', kind: 'ramen', bg: '#c0392b', fg: '#fff6dc', font: 'bold', noren: '#c0392b', norenText: '中華そば' },
  { name: '駄菓子 ひなた', sub: 'おもちゃ・駄菓子', kind: 'dagashi', bg: '#f6c0d0', fg: '#8a2a4a', font: 'maru' },
  { name: '理容 カトウ', sub: 'BARBER', kind: 'barber', bg: '#ffffff', fg: '#2a4a8a', font: 'gothic' },
  { name: 'クリーニング 白波', sub: '受付 9:00〜19:00', kind: 'cleaning', bg: '#e8f4fb', fg: '#1f5fa8', font: 'gothic' },
  { name: '酒・米 まるや', sub: '地酒あります', kind: 'liquor', bg: '#3a2a1f', fg: '#f6e7c0', font: 'brush' },
  { name: 'まちの薬局', sub: 'くすり・化粧品', kind: 'pharmacy', bg: '#ffffff', fg: '#2e8a4a', font: 'gothic', logo: '薬' },
  { name: '時計・メガネ 柏木', sub: 'TOKEI & MEGANE', kind: 'watch', bg: '#f0ece0', fg: '#4a3a2a', font: 'mincho' },
  { name: 'とうふ 豆屋', sub: '手づくり豆腐', kind: 'tofu', bg: '#f6f2e6', fg: '#2a2a2a', font: 'brush', noren: '#e8e2d0', norenText: 'とうふ', norenFg: '#2a2a2a' },
  { name: '文房具 えんぴつ', sub: 'ノート・画材', kind: 'stationery', bg: '#fff6d8', fg: '#c0392b', font: 'maru' },
  { name: '貸店舗', sub: '桜ヶ浜不動産 0467-00-1234', kind: 'closed', bg: '#ffffff', fg: '#c0392b', font: 'gothic' },
];

function shopSign(ctx, shop) {
  return ctx.atlas.draw('shop:' + shop.name, 512, 100, (c, w, h) =>
    drawBoard(c, w, h, {
      text: shop.name,
      sub: shop.sub,
      bg: shop.bg,
      fg: shop.fg,
      font: FONTS[shop.font] || FONTS.gothic,
      logo: shop.logo,
      logoBg: shop.fg,
      logoFg: shop.bg,
      border: shop.kind === 'books' || shop.kind === 'watch' ? '#4a3a2a' : null,
    })
  );
}

function awningTex(ctx, colors) {
  return ctx.atlas.draw('awning:' + colors.join(), 256, 64, (c, w, h) => {
    const n = 8;
    for (let i = 0; i < n; i++) {
      c.fillStyle = colors[i % 2];
      c.fillRect((w * i) / n, 0, w / n + 1, h);
    }
    c.fillStyle = 'rgba(0,0,0,0.08)';
    c.fillRect(0, h * 0.8, w, h * 0.2);
  });
}

function norenTex(ctx, color, text, fg = '#ffffff') {
  return ctx.atlas.draw('noren:' + color + text, 256, 140, (c, w, h) => {
    c.fillStyle = color;
    c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(255,255,255,0.18)';
    for (let i = 1; i < 3; i++) c.fillRect((w * i) / 3 - 2, h * 0.3, 4, h);
    c.fillStyle = fg;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    const chars = [...text];
    c.font = `700 ${Math.min(h * 0.5, (w * 0.9) / chars.length)}px ${FONTS.brush}`;
    c.fillText(text, w / 2, h * 0.5);
  });
}

function goods(ctx, t, face, s0, s1, kind, rng) {
  const cols = {
    grocer: [0xe8432e, 0xf6c341, 0x6aa84f, 0xf08a2a, 0x9a3a8a],
    florist: [0xf06a8a, 0xffd94a, 0xffffff, 0xb07ae0, 0xff8a4a, 0x7ad0f0],
    fish: [0xc9d8e8, 0xe8a8a0, 0xb0c4d8],
    dagashi: [0xf6c341, 0xf06a8a, 0x5ab0e8, 0x7ad07a, 0xff8a4a],
    yorozuya: [0xe8432e, 0x2f6fd0, 0xf6c341, 0x48a860],
    bakery: [0xd9a05a, 0xc8803a, 0xe8c080],
  }[kind];
  if (!cols) return;
  // crates / buckets / table in front of the shop
  for (let s = s0; s < s1; s += 0.75) {
    const p = fp(face, s, 0, 0.55);
    if (kind === 'florist') {
      t.cyl(p.x, p.y, p.z, 0.16, 0.13, 0.35, 8, 0x8a95a0, PAT.METAL);
      for (let k = 0; k < 5; k++) t.box(p.x + rng.range(-0.12, 0.12), p.y + 0.42 + rng.range(0, 0.1), p.z + rng.range(-0.12, 0.12), 0.1, 0.1, 0.1, { color: rng.pick(cols) });
    } else {
      t.box(p.x, p.y + 0.35, p.z, 0.6, 0.7, 0.45, { color: 0x9a7a54, pattern: PAT.BOARDS });
      for (let k = 0; k < 6; k++) t.box(p.x + rng.range(-0.22, 0.22), p.y + 0.76, p.z + rng.range(-0.15, 0.15), 0.12, 0.1, 0.12, { color: rng.pick(cols) });
    }
  }
}

export function buildShop(ctx, lot, index) {
  const rng = new RNG(lot.seed);
  const shop = SHOPS[index % SHOPS.length];
  const L = lotFrame(lot);
  const kit = new Kit(ctx, L.ox, L.oz);
  const t = kit.t;
  kit.begin(L.ox, 0, L.oz, L.ry);
  const hw = L.W - 0.2, hd = Math.min(L.D - 1.0, 10);
  const cz = 0.35 + hd / 2;
  let ymax = -Infinity, ymin = Infinity;
  for (const [a, b] of [[-hw / 2, 0.3], [hw / 2, 0.3], [-hw / 2, hd], [hw / 2, hd]]) {
    ymax = Math.max(ymax, L.yAt(a, b));
    ymin = Math.min(ymin, L.yAt(a, b));
  }
  const y0 = ymax + 0.12;
  const f1 = 3.1, f2 = 2.6;
  const old = shop.kind === 'wagashi' || shop.kind === 'tofu' || shop.kind === 'liquor' || rng.chance(0.2);
  const wall = old ? '#e9e1cf' : rng.pick(WALLS);
  t.box(0, (ymin - 0.4 + y0) / 2, cz, hw, y0 - ymin + 0.4, hd, { color: 0xa9a59c, pattern: PAT.CONCRETE });
  t.box(0, y0 + f1 + f2 / 2, cz, hw, f2, hd, { color: wall, pattern: old ? PAT.NONE : PAT.SIDING });
  t.box(0, y0 + f1 / 2, cz + 0.6, hw, f1, hd - 1.2, { color: old ? 0x5d4636 : 0xd9d6cf, pattern: old ? PAT.BOARDS : PAT.TILE });
  ctx.colliders.addBox(...L.toW(0, cz + 0.6), hw / 2, (hd - 1.2) / 2, L.ry);
  // roof
  if (old) gableRoof(t, 0, cz, hw, hd, y0 + f1 + f2, { color: '#5f6a78', pattern: PAT.KAWARA, wallColor: wall, slope: 0.5, ox: 0.15, oz: 0.6, fascia: 0x5d4636, th: 0.2 });
  else {
    t.box(0, y0 + f1 + f2 + 0.5, cz, hw, 1.0, hd, { color: wall, pattern: PAT.SIDING });
    leanTo(t, -hw / 2, hw / 2, cz - hd / 2 + 0.6, cz + hd / 2 + 0.3, y0 + f1 + f2 + 1.0, 0.1, { color: rng.pick(ROOFS), pattern: PAT.SEAM });
  }
  const F = boxFaces(0, y0, cz + 0.6, hw, hd - 1.2);
  const F2 = boxFaces(0, y0, cz, hw, hd);
  // shop front: glass sliding doors / open front
  if (shop.kind === 'closed') {
    faceBox(t, F.front, hw / 2, 0, hw - 0.6, f1 - 0.5, 0.05, 0.03, 0xb8bcc0, PAT.CORRUGATED);
  } else if (shop.kind === 'wagashi' || shop.kind === 'tofu' || shop.kind === 'liquor') {
    koshiDoor(kit, F.front, hw / 2, 0, Math.min(3.2, hw - 1.2), 2.3, 0x5d4636);
  } else {
    windowUnit(kit, F.front, hw / 2, 0.05, hw - 1.0, 2.35, { seed: 150 + (index % 50), frame: FRAME.silver, fixed: true });
  }
  // second floor windows
  windowUnit(kit, F2.front, hw / 2, f1 + 0.7, Math.min(2.2, hw - 1.6), 1.15, { rng, frame: old ? FRAME.wood : FRAME.alu, shutterCase: old && rng.chance(0.5) });
  // overhang/eave over the shop front
  faceBox(t, F.front, hw / 2, f1 - 0.15, hw, 0.18, 0.6, 0.6, old ? 0x5d4636 : 0xe9e6de);
  // main sign board above the ground floor
  const sign = shopSign(ctx, shop);
  signOnFace(kit, F2.front, hw / 2, f1 + 0.05, hw - 0.3, Math.min(0.9, (hw - 0.3) / 5), 0.04, sign, 0.65, 0x3a3a3a);
  // awning
  if (shop.awning) {
    const aw = awningTex(ctx, shop.awning);
    const a0 = fp(F.front, 0.25, f1 - 0.35, 0.0);
    const a1 = fp(F.front, hw - 0.25, f1 - 0.35, 0.0);
    const b0 = fp(F.front, 0.25, f1 - 1.05, 1.3);
    const b1 = fp(F.front, hw - 0.25, f1 - 1.05, 1.3);
    kit.s.quad(b0, b1, a1, a0, 0xffffff, 0.3, { uvs: [[aw.u0, aw.v0], [aw.u1, aw.v0], [aw.u1, aw.v1], [aw.u0, aw.v1]] });
    kit.s.quad(a0, a1, b1, b0, 0xdddddd, 0, { uvs: [[aw.u0, aw.v1], [aw.u1, aw.v1], [aw.u1, aw.v0], [aw.u0, aw.v0]] });
    // valance
    const c0 = fp(F.front, 0.25, f1 - 1.3, 1.3);
    const c1 = fp(F.front, hw - 0.25, f1 - 1.3, 1.3);
    kit.s.quad(c0, c1, b1, b0, 0xffffff, 0.3, { uvs: [[aw.u0, aw.v0], [aw.u1, aw.v0], [aw.u1, aw.v0 + (aw.v1 - aw.v0) * 0.3], [aw.u0, aw.v0 + (aw.v1 - aw.v0) * 0.3]] });
  }
  if (shop.noren) {
    const nt = norenTex(ctx, shop.noren, shop.norenText, shop.norenFg);
    signOnFace(kit, F.front, hw / 2, 1.7, Math.min(2.4, hw - 1.4), 0.75, 0.25, nt, 0.2);
    t.push(new THREE.Matrix4());
    const r0 = fp(F.front, hw / 2 - 1.3, 2.47, 0.25), r1 = fp(F.front, hw / 2 + 1.3, 2.47, 0.25);
    t.rod(r0, r1, 0.025, 0.025, 5, 0x6a4b35);
    t.pop();
  }
  // vertical side sign (袖看板)
  if (rng.chance(0.55) && shop.kind !== 'closed') {
    const vs = ctx.atlas.draw('vert:' + shop.name, 72, 300, (c, w, h) => drawVertical(c, w, h, { text: shop.name.replace(/\s.*/, '').slice(0, 5), bg: shop.bg, fg: shop.fg, font: FONTS[shop.font] || FONTS.gothic, border: shop.fg }));
    const p = fp(F2.front, hw - 0.3, f1 + 0.6, 0.55);
    const side = { o: V(p.x - 0.0, 0, p.z - 0.25), r: V(0, 0, 1), n: V(1, 0, 0), len: 0.5 };
    // board perpendicular to the facade: place quads both sides
    const nrm = F2.front.r.clone();
    const tangent = F2.front.n.clone();
    const mk = (sgn) => ({ o: V(p.x + nrm.x * 0.04 * sgn - tangent.x * 0.25 * sgn, 0, p.z + nrm.z * 0.04 * sgn - tangent.z * 0.25 * sgn), r: tangent.clone().multiplyScalar(sgn), n: nrm.clone().multiplyScalar(sgn), len: 0.5 });
    void side;
    signOnFace(kit, mk(1), 0.25, f1 + 0.4, 0.42, 1.75, 0.0, vs, 0.7);
    signOnFace(kit, mk(-1), 0.25, f1 + 0.4, 0.42, 1.75, 0.0, vs, 0.7);
    t.box(p.x, f1 + y0 + 1.27, p.z, 0.06, 1.85, 0.06, { color: 0x555555 });
  }
  // shop interiors: lit at night through the windows (window shader handles), goods outside
  goods(ctx, t, F.front, 0.6, hw - 0.6, shop.kind, rng);
  if (shop.kind === 'cafe') {
    // terrace tables
    for (let i = 0; i < 2; i++) {
      const p = fp(F.front, 1.2 + i * 2.2, 0, 0.9);
      t.cyl(p.x, p.y, p.z, 0.04, 0.04, 0.72, 6, 0x333);
      t.cyl(p.x, p.y + 0.72, p.z, 0.36, 0.36, 0.04, 12, 0xf0ece4);
      for (const e of [-1, 1]) {
        const q = fp(F.front, 1.2 + i * 2.2 + e * 0.55, 0, 0.9);
        t.box(q.x, q.y + 0.44, q.z, 0.38, 0.05, 0.38, { color: 0x4a3a2a });
        t.box(q.x, q.y + 0.22, q.z, 0.05, 0.44, 0.05, { color: 0x333 });
      }
    }
    // standing sign board
    const sb = ctx.atlas.draw('cafe-board', 128, 200, (c, w, h) => {
      c.fillStyle = '#2a3a30';
      c.fillRect(0, 0, w, h);
      c.strokeStyle = '#8a6a4a';
      c.lineWidth = 8;
      c.strokeRect(4, 4, w - 8, h - 8);
      c.fillStyle = '#f6efe0';
      c.textAlign = 'center';
      c.font = `700 ${h * 0.1}px ${FONTS.maru}`;
      c.fillText('本日の', w / 2, h * 0.22);
      c.fillText('おすすめ', w / 2, h * 0.34);
      c.fillStyle = '#f6b0c8';
      c.font = `700 ${h * 0.09}px ${FONTS.maru}`;
      c.fillText('桜ラテ', w / 2, h * 0.55);
      c.fillStyle = '#f6efe0';
      c.fillText('桜もち', w / 2, h * 0.7);
      c.font = `500 ${h * 0.07}px ${FONTS.maru}`;
      c.fillText('¥480', w / 2, h * 0.85);
    });
    const p = fp(F.front, hw - 0.5, 0, 1.2);
    const fb = { o: V(p.x + F.front.r.x * -0.3, 0, p.z + F.front.r.z * -0.3 + F.front.n.z * 0.0), r: F.front.r.clone(), n: F.front.n.clone(), len: 0.6 };
    fb.o.y = 0;
    signOnFace(kit, fb, 0.3, p.y + 0.1, 0.55, 0.9, 0.04, sb, 0.2, 0x8a6a4a);
  }
  if (shop.kind === 'barber') ctx.barberPoles = (ctx.barberPoles || []).concat([{ p: fp(F.front, 0.4, 0.8, 0.3), ry: L.ry, frame: L }]);
  if (shop.kind === 'yorozuya' || shop.kind === 'liquor') {
    const [vx, vz] = L.toW(-hw / 2 + 0.7, 0.75);
    ctx.vending.push({ x: vx, z: vz, ry: L.ry + Math.PI, seed: lot.seed, n: 1 });
  }
  // AC + plants on the second floor
  acUnit(t, ...(() => { const p = fp(F2.front, 0.6, f1 + 0.1, 0.35); return [p.x, p.y, p.z]; })(), 0);
  // chochin lantern anchor points for the street decoration
  const top = fp(F2.front, hw / 2, f1 + 1.95, 0.1);
  ctx.lanternAnchors = ctx.lanternAnchors || [];
  ctx.lanternAnchors.push({ x: L.toW(top.x, top.z)[0], y: top.y, z: L.toW(top.x, top.z)[1], street: lot.street });
  if (shop.kind === 'cafe') ctx.landmarks.push({ id: 'cafe', name: shop.name, x: L.ox, z: L.oz });
  ctx.interactables.push({ kind: 'shop', x: L.toW(0, -0.6)[0], z: L.toW(0, -0.6)[1], r: 1.6, label: shop.kind === 'closed' ? '貸店舗の貼り紙を見る' : `${shop.name}をのぞく`, shop: shop.name, shopKind: shop.kind });
  kit.end();
}

export function buildShotengai(ctx) {
  const shops = ctx.lots.filter((l) => l.type === 'shop');
  // sort along the street so neighbouring shops differ
  shops.sort((a, b) => a.z0 - b.z0 || a.x0 - b.x0);
  shops.forEach((lot, i) => buildShop(ctx, lot, i));
  // lanterns strung across the street + arch gate at the south entrance
  const rng = new RNG(808);
  const lanterns = [];
  const wires = ctx.wires;
  const west = (ctx.lanternAnchors || []).filter((a) => a.x < -35).sort((a, b) => a.z - b.z);
  const east = (ctx.lanternAnchors || []).filter((a) => a.x > -35).sort((a, b) => a.z - b.z);
  for (const a of west) {
    let best = null, bd = 1e9;
    for (const b of east) {
      const d = Math.abs(a.z - b.z);
      if (d < bd) {
        bd = d;
        best = b;
      }
    }
    if (!best || bd > 6) continue;
    const pa = V(a.x, a.y, a.z), pb = V(best.x, best.y, best.z);
    wires.cable(pa, pb, 0.6, 10);
    const n = 6;
    for (let k = 1; k < n; k++) {
      const t = k / n;
      const p = pa.clone().lerp(pb, t);
      p.y -= 0.6 * 4 * t * (1 - t) + 0.35;
      lanterns.push({ x: p.x, y: p.y, z: p.z, red: (k + rng.int(0, 1)) % 2 === 0 });
    }
  }
  ctx.lanterns = lanterns;
  // arch gate
  const gz = 16.0;
  const b = ctx.builders.get('toon', -35, gz);
  for (const e of [-1, 1]) {
    const gx = -35 + e * 3.9;
    const gy = terrainH(gx, gz);
    b.cyl(gx, gy, gz, 0.18, 0.18, 5.6, 10, 0xc0392b);
    ctx.colliders.addCircle(gx, gz, 0.22);
  }
  const gy = terrainH(-35, gz);
  b.box(-35, gy + 5.4, gz, 8.6, 1.2, 0.35, { color: 0xc0392b });
  const arch = ctx.atlas.draw('arch', 768, 112, (c, w, h) => drawBoard(c, w, h, { text: '浜通り商店街', sub: 'HAMADORI SHOPPING STREET', bg: '#fbf6ea', fg: '#a8251c', font: FONTS.mincho, weather: false }));
  const kit = new Kit(ctx, -35, gz);
  for (const e of [-1, 1]) {
    const face = e < 0 ? { o: V(-35 + 4.0, gy, gz - 0.19), r: V(-1, 0, 0), n: V(0, 0, -1), len: 8 } : { o: V(-35 - 4.0, gy, gz + 0.19), r: V(1, 0, 0), n: V(0, 0, 1), len: 8 };
    signOnFace(kit, face, 4.0, 4.9, 7.6, 1.0, 0.0, arch, 0.9);
  }
  // sakura festival banners on lamp posts
  for (let z = 10; z > -48; z -= 13) {
    for (const e of [-1, 1]) {
      const lx = -35 + e * 3.25, lz = z;
      const ly = terrainH(lx, lz);
      b.cyl(lx, ly, lz, 0.06, 0.05, 4.2, 8, 0x5a5048);
      ctx.builders.get('emissive', lx, lz).geom(new THREE.SphereGeometry(0.2, 10, 8), new THREE.Matrix4().makeTranslation(lx, ly + 4.35, lz), 0xfff0d0);
      ctx.lamps.push({ x: lx, y: ly + 4.3, z: lz, r: 4.5 });
      const ban = ctx.atlas.draw('banner', 96, 320, (c, w, h) => drawVertical(c, w, h, { text: 'さくらまつり', bg: '#f8d2df', fg: '#a8325a', font: FONTS.maru }));
      const face = { o: V(lx - e * 0.06, ly, lz - 0.25), r: V(0, 0, 1), n: V(-e, 0, 0), len: 0.5 };
      if (e > 0) {
        face.o = V(lx - e * 0.06, ly, lz + 0.25);
        face.r = V(0, 0, -1);
      }
      signOnFace(kit, face, 0.25, 2.4, 0.42, 1.4, 0.0, ban, 0.1);
      ctx.colliders.addCircle(lx, lz, 0.1);
    }
  }
}

// paper lanterns (dynamic: a single mesh, glowing at night)
export function lanternMesh(ctx) {
  const g = new THREE.SphereGeometry(0.22, 10, 8);
  g.scale(1, 1.35, 1);
  const lanterns = ctx.lanterns || [];
  const red = new THREE.Color('#e8483c'), white = new THREE.Color('#fbf3e2');
  const pos = [], col = [], nor = [], uv = [], pat = [], idx = [];
  let base = 0;
  for (const l of lanterns) {
    const c = l.red ? red : white;
    const p = g.attributes.position, n = g.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i) + l.x, p.getY(i) + l.y, p.getZ(i) + l.z);
      nor.push(n.getX(i), n.getY(i), n.getZ(i));
      col.push(c.r, c.g, c.b);
      uv.push(0, 0);
      pat.push(1);
    }
    for (const k of g.index.array) idx.push(k + base);
    base += p.count;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('pattern', new THREE.Float32BufferAttribute(pat, 1));
  geo.setIndex(idx);
  const m = new THREE.Mesh(geo, ctx.materials.emissive.material);
  m.name = 'lanterns';
  return m;
}

// ---------------------------------------------------------------------------
// Park: playground, sakura ring, toilet, benches
// ---------------------------------------------------------------------------
export function buildPark(ctx) {
  const P = PARK;
  const rng = new RNG(6060);
  const cx = (P.x0 + P.x1) / 2, cz = (P.z0 + P.z1) / 2;
  const kit = new Kit(ctx, cx, cz);
  const t = kit.t;
  const y = (x, z) => terrainH(x, z);
  ctx.ground.rect(P.x0, P.z0, P.x1, P.z1, 0xc9b28c, PAT.DIRT);
  ctx.ground.rect(P.x0 + 1, P.z0 + 1, P.x1 - 1, P.z0 + 7, 0x8fb062, PAT.GRASS);
  ctx.ground.rect(P.x0 + 1, P.z1 - 6, P.x1 - 1, P.z1 - 1, 0x8fb062, PAT.GRASS);
  // fence with entrances
  const yFn = (x, z) => y(x, z);
  for (const [a, b, c, d] of [[P.x0, P.z0, P.x1, P.z0], [P.x0, P.z1, P.x1, P.z1], [P.x0, P.z0, P.x0, P.z1], [P.x1, P.z0, P.x1, P.z1]]) {
    const len = Math.hypot(c - a, d - b);
    const mid = 0.5;
    const gap = 3;
    const ux = (c - a) / len, uz = (d - b) / len;
    const m0 = len * mid - gap / 2, m1 = len * mid + gap / 2;
    for (const [s0, s1] of [[0, m0], [m1, len]]) {
      const ax = a + ux * s0, az = b + uz * s0, bx = a + ux * s1, bz = b + uz * s1;
      metalFence(t, ax, az, bx, bz, yFn, 1.0, 0x6aa07a);
      ctx.colliders.addSegment(ax, az, bx, bz, 0.2);
    }
  }
  // sakura ring
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const x = cx + Math.cos(a) * 12.5, z = cz + Math.sin(a) * 12.5;
    ctx.trees.push({ kind: 'sakura', x, z, seed: 7000 + i, scale: rng.range(0.85, 1.05) });
  }
  // swings
  const sx = cx - 6, sz = cz - 4;
  const sy = y(sx, sz);
  for (const e of [-1, 1]) {
    t.rod(V(sx + e * 1.6, sy, sz - 0.9), V(sx + e * 1.6, sy + 2.4, sz), 0.05, 0.05, 6, 0x3a7ac0);
    t.rod(V(sx + e * 1.6, sy, sz + 0.9), V(sx + e * 1.6, sy + 2.4, sz), 0.05, 0.05, 6, 0x3a7ac0);
  }
  t.rod(V(sx - 1.7, sy + 2.4, sz), V(sx + 1.7, sy + 2.4, sz), 0.06, 0.06, 6, 0x3a7ac0);
  for (const e of [-0.7, 0.7]) {
    t.box(sx + e, sy + 0.45, sz, 0.5, 0.05, 0.22, { color: 0xe8b83a });
    t.rod(V(sx + e - 0.22, sy + 0.45, sz), V(sx + e - 0.22, sy + 2.4, sz), 0.01, 0.01, 3, 0x888888);
    t.rod(V(sx + e + 0.22, sy + 0.45, sz), V(sx + e + 0.22, sy + 2.4, sz), 0.01, 0.01, 3, 0x888888);
  }
  ctx.colliders.addBox(sx, sz, 1.7, 1.0);
  // slide
  const lx = cx + 5, lz = cz - 3;
  const ly = y(lx, lz);
  t.box(lx, ly + 1.0, lz, 1.0, 0.08, 1.0, { color: 0xe8b83a });
  for (const [a, b] of [[-0.45, -0.45], [0.45, -0.45], [0.45, 0.45], [-0.45, 0.45]]) t.box(lx + a, ly + 0.5, lz + b, 0.06, 1.0, 0.06, { color: 0x3a7ac0 });
  t.slab(V(lx + 0.5, ly + 1.04, lz - 0.35), V(lx + 0.5, ly + 1.04, lz + 0.35), V(lx + 3.0, ly + 0.15, lz + 0.35), V(lx + 3.0, ly + 0.15, lz - 0.35), 0.05, 0xd8402e, 0);
  for (let i = 0; i < 5; i++) t.box(lx - 0.5 - i * 0.18, ly + 0.2 + i * 0.2, lz, 0.05, 0.05, 0.7, { color: 0x3a7ac0 });
  ctx.colliders.addBox(lx + 1.2, lz, 1.9, 0.6);
  // sandbox
  const bx = cx + 4, bz = cz + 5;
  t.boxMM(bx - 2, y(bx, bz) - 0.2, bz - 1.5, bx + 2, y(bx, bz) + 0.25, bz - 1.35, { color: 0xc9c5bb });
  t.boxMM(bx - 2, y(bx, bz) - 0.2, bz + 1.35, bx + 2, y(bx, bz) + 0.25, bz + 1.5, { color: 0xc9c5bb });
  t.boxMM(bx - 2, y(bx, bz) - 0.2, bz - 1.5, bx - 1.85, y(bx, bz) + 0.25, bz + 1.5, { color: 0xc9c5bb });
  t.boxMM(bx + 1.85, y(bx, bz) - 0.2, bz - 1.5, bx + 2, y(bx, bz) + 0.25, bz + 1.5, { color: 0xc9c5bb });
  ctx.ground.rect(bx - 1.85, bz - 1.35, bx + 1.85, bz + 1.35, 0xe8d8b0, PAT.SAND);
  // spring riders (panda / elephant shapes)
  for (const [px, pz, c] of [[cx - 2, cz + 6, 0xffffff], [cx - 5, cz + 7, 0x8fb8e8]]) {
    const py = y(px, pz);
    t.cyl(px, py, pz, 0.08, 0.08, 0.35, 6, 0x888888);
    t.geom(new THREE.SphereGeometry(0.35, 10, 8), new THREE.Matrix4().compose(V(px, py + 0.6, pz), new THREE.Quaternion(), V(1.4, 1, 0.9)), c);
    t.geom(new THREE.SphereGeometry(0.25, 10, 8), new THREE.Matrix4().makeTranslation(px + 0.5, py + 0.85, pz), c);
    t.box(px + 0.62, py + 0.95, pz - 0.1, 0.05, 0.08, 0.05, { color: 0x222 });
    ctx.colliders.addCircle(px, pz, 0.45);
  }
  // benches
  // benches facing the playground
  for (const [px, pz, ry] of [[cx - 9, cz + 9.5, 0], [cx + 9, cz + 9.5, 0], [cx, cz - 9.5, Math.PI]]) {
    benchAt(ctx, t, px, y(px, pz), pz, ry, 0x9a7454, '公園のベンチに座る');
  }
  // toilet hut + clock
  const tx = P.x1 - 3.5, tz = P.z0 + 3.5;
  const ty = y(tx, tz);
  t.boxMM(tx - 2, ty - 0.2, tz - 1.6, tx + 2, ty + 2.6, tz + 1.6, { color: 0xd9d0bd, pattern: PAT.BRICK });
  gableRoof(t, tx, tz, 4, 3.2, ty + 2.6, { color: 0x6b5446, wallColor: 0xd9d0bd, slope: 0.5 });
  ctx.colliders.addBox(tx, tz, 2.0, 1.6);
  const cpx = cx + 10, cpz = cz - 9;
  t.cyl(cpx, y(cpx, cpz), cpz, 0.08, 0.08, 3.4, 8, 0x3f6a4a);
  t.box(cpx, y(cpx, cpz) + 3.6, cpz, 0.7, 0.7, 0.2, { color: 0x3f6a4a });
  const clock = ctx.atlas.cache.get('clock');
  if (clock) for (const e of [-1, 1]) signOnFace(kit, { o: V(cpx - 0.3 * e, y(cpx, cpz), cpz + e * 0.105), r: V(e, 0, 0), n: V(0, 0, e), len: 0.6 }, 0.3, 3.3, 0.6, 0.6, 0.0, clock, 0.6);
  ctx.clocks.push({ x: cpx, y: y(cpx, cpz) + 3.6, z: cpz, off: 0.115 });
  ctx.colliders.addCircle(cpx, cpz, 0.12);
  // lamps
  for (const [px, pz] of [[P.x0 + 3, P.z1 - 3], [P.x1 - 3, P.z1 - 3], [P.x0 + 3, P.z0 + 3]]) {
    const py = y(px, pz);
    t.cyl(px, py, pz, 0.07, 0.05, 3.6, 8, 0x3f6a4a);
    ctx.builders.get('emissive', px, pz).geom(new THREE.SphereGeometry(0.22, 10, 8), new THREE.Matrix4().makeTranslation(px, py + 3.8, pz), 0xfff4dc);
    ctx.lamps.push({ x: px, y: py + 3.8, z: pz, r: 5 });
    ctx.colliders.addCircle(px, pz, 0.1);
  }
  ctx.catSpots.push({ x: cx + 9, z: cz + 9.5, y: y(cx + 9, cz + 9.5) + 0.48, kind: 'bench', ry: 0.3 });
  ctx.catSpots.push({ x: bx, z: bz, y: y(bx, bz) + 0.05, kind: 'sand', ry: 2.0 });
  ctx.landmarks.push({ id: 'park', name: 'ひだまり公園', x: cx, z: cz });
}

// ---------------------------------------------------------------------------
// Shrine on the hill: stone steps, torii, haiden, lanterns, ema, lookout bench
// ---------------------------------------------------------------------------
function torii(b, x, y, z, s, ry = 0) {
  b.pushTRS(x, y, z, ry);
  const red = 0xd8452e, black = 0x26262a;
  for (const e of [-1, 1]) {
    b.cyl(e * 1.7 * s, 0, 0, 0.2 * s, 0.17 * s, 4.4 * s, 12, red);
    b.cyl(e * 1.7 * s, 0, 0, 0.26 * s, 0.26 * s, 0.35 * s, 12, black);
  }
  b.box(0, 3.75 * s, 0, 4.4 * s, 0.24 * s, 0.24 * s, { color: red });
  b.box(0, 4.4 * s, 0, 5.2 * s, 0.26 * s, 0.38 * s, { color: red });
  b.box(0, 4.6 * s, 0, 5.6 * s, 0.16 * s, 0.44 * s, { color: black });
  b.box(0, 4.05 * s, 0, 0.22 * s, 0.6 * s, 0.2 * s, { color: red });
  b.pop();
}

export function buildShrine(ctx) {
  const S = SHRINE;
  const kit = new Kit(ctx, S.x, -150);
  const t = kit.t;
  const yBottom = townH(S.z0);
  const steps = 26;
  const run = (S.z0 - S.terraceZ0) / steps;
  const rise = (S.y - yBottom) / steps;
  for (let i = 0; i < steps; i++) {
    const z1 = S.z0 - i * run;
    const top = yBottom + (i + 1) * rise;
    t.boxMM(S.x - 1.8, top - 1.2, z1 - run, S.x + 1.8, top, z1, { color: 0xa9a397, pattern: PAT.STONE });
  }
  for (const e of [-1, 1]) {
    for (let i = 0; i < steps; i += 2) {
      const z1 = S.z0 - i * run;
      t.boxMM(S.x + e * 2.0 - 0.2, yBottom + i * rise - 0.5, z1 - run * 2, S.x + e * 2.0 + 0.2, yBottom + (i + 2) * rise + 0.3, z1, { color: 0x9a9488, pattern: PAT.STONE });
    }
    ctx.colliders.addBox(S.x + e * 2.0, (S.z0 + S.terraceZ0) / 2, 0.2, (S.z0 - S.terraceZ0) / 2);
  }
  ctx.colliders.addSurface(S.x - 1.8, S.terraceZ0, S.x + 1.8, S.z0 + 0.6, (px, pz) => yBottom + clamp((S.z0 - pz) / (S.z0 - S.terraceZ0), 0, 1) * (S.y - yBottom), 2);
  torii(t, S.x, yBottom, S.z0 + 1.5, 1.0);
  torii(t, S.x, S.y, S.terraceZ0 - 2.5, 0.85);
  for (const e of [-1, 1]) {
    ctx.colliders.addCircle(S.x + e * 1.7, S.z0 + 1.5, 0.25);
    ctx.colliders.addCircle(S.x + e * 1.45, S.terraceZ0 - 2.5, 0.22);
  }
  // terrace
  ctx.ground.rect(S.terraceX0, S.terraceZ1, S.terraceX1, S.terraceZ0, 0xc9c2b2, PAT.GRAVEL);
  ctx.ground.rect(S.x - 1.4, S.terraceZ1 + 6, S.x + 1.4, S.terraceZ0, 0xb9b2a4, PAT.STONE);
  ctx.colliders.addSurface(S.terraceX0, S.terraceZ1, S.terraceX1, S.terraceZ0, () => S.y, 1);
  // haiden (worship hall)
  const hx = S.x, hz = S.terraceZ1 + 6.5;
  const hy = S.y;
  t.boxMM(hx - 4.5, hy - 0.5, hz - 3.5, hx + 4.5, hy + 0.7, hz + 3.5, { color: 0xb4ada0, pattern: PAT.STONE });
  t.boxMM(hx - 3.8, hy + 0.7, hz - 2.6, hx + 3.8, hy + 3.4, hz + 2.6, { color: 0x8a5a3c, pattern: PAT.BOARDS });
  for (const [a, b] of [[-3.8, -2.6], [3.8, -2.6], [3.8, 2.6], [-3.8, 2.6], [-1.3, 2.6], [1.3, 2.6]]) t.box(hx + a, hy + 2.05, hz + b, 0.22, 2.7, 0.22, { color: 0xc8452e });
  t.boxMM(hx - 3.0, hy + 0.7, hz + 2.6, hx + 3.0, hy + 0.8, hz + 3.6, { color: 0x8a6a4a, pattern: PAT.PLANKS });
  hipRoof(t, hx, hz, 7.6, 5.2, hy + 3.4, { color: 0x4f7a6a, pattern: PAT.SEAM, slope: 0.6, ov: 1.3, fascia: 0x8a5a3c, th: 0.25 });
  // offering box + bell
  t.boxMM(hx - 0.8, hy + 0.7, hz + 3.3, hx + 0.8, hy + 1.5, hz + 3.9, { color: 0x6a4a32, pattern: PAT.BOARDS });
  t.geom(new THREE.SphereGeometry(0.22, 10, 8), new THREE.Matrix4().makeTranslation(hx, hy + 3.0, hz + 2.95), 0xd8b84a);
  t.box(hx, hy + 2.0, hz + 2.95, 0.06, 1.8, 0.06, { color: 0xe8e0d0 });
  t.box(hx, hy + 2.0, hz + 2.97, 0.05, 1.8, 0.05, { color: 0xd8452e });
  // shimenawa rope
  t.rod(V(hx - 1.6, hy + 3.0, hz + 2.85), V(hx + 1.6, hy + 3.0, hz + 2.85), 0.11, 0.11, 8, 0xd8c890);
  for (let i = 0; i < 4; i++) t.box(hx - 1.2 + i * 0.8, hy + 2.7, hz + 2.9, 0.12, 0.45, 0.02, { color: 0xffffff });
  ctx.colliders.addBox(hx, hz, 4.5, 3.5);
  ctx.interactables.push({ kind: 'shrine', x: hx, z: hz + 4.6, r: 1.8, label: 'お参りする', hall: { x: hx, z: hz } });
  // komainu
  for (const e of [-1, 1]) {
    const kx = hx + e * 3.2, kz = hz + 7.5;
    t.boxMM(kx - 0.45, hy, kz - 0.45, kx + 0.45, hy + 0.9, kz + 0.45, { color: 0x9a9488, pattern: PAT.STONE });
    t.geom(new THREE.SphereGeometry(0.42, 8, 6), new THREE.Matrix4().compose(V(kx, hy + 1.3, kz), new THREE.Quaternion(), V(0.8, 1.0, 1.1)), 0xa8a296, PAT.STONE);
    t.geom(new THREE.SphereGeometry(0.3, 8, 6), new THREE.Matrix4().makeTranslation(kx, hy + 1.85, kz + 0.25), 0xa8a296, PAT.STONE);
    ctx.colliders.addBox(kx, kz, 0.45, 0.45);
  }
  // lanterns along the approach
  for (let i = 0; i < 3; i++) {
    for (const e of [-1, 1]) {
      const lx = hx + e * 2.4, lz = S.terraceZ0 - 6 - i * 4.5;
      stoneLantern(t, lx, hy, lz, 1.1);
      ctx.colliders.addCircle(lx, lz, 0.3);
    }
  }
  // chozuya (purification pavilion)
  const cx2 = hx - 8, cz2 = hz + 8;
  t.boxMM(cx2 - 0.9, hy, cz2 - 0.5, cx2 + 0.9, hy + 0.75, cz2 + 0.5, { color: 0x9a9488, pattern: PAT.STONE });
  t.boxMM(cx2 - 0.75, hy + 0.7, cz2 - 0.35, cx2 + 0.75, hy + 0.76, cz2 + 0.35, { color: 0x6aa0c0 });
  for (const [a, b] of [[-1.2, -0.9], [1.2, -0.9], [1.2, 0.9], [-1.2, 0.9]]) t.box(cx2 + a, hy + 1.3, cz2 + b, 0.14, 2.6, 0.14, { color: 0x8a5a3c });
  gableRoof(t, cx2, cz2, 2.4, 1.8, hy + 2.6, { color: 0x4f7a6a, pattern: PAT.SEAM, wallColor: 0x8a5a3c, slope: 0.55, ox: 0.4, oz: 0.5, fascia: 0x8a5a3c });
  ctx.colliders.addBox(cx2, cz2, 1.3, 1.0);
  // ema rack
  const ex = hx + 7.5, ez = hz + 6;
  t.box(ex, hy + 0.9, ez, 2.6, 0.08, 0.1, { color: 0x6a4a32 });
  t.box(ex, hy + 1.5, ez, 2.6, 0.08, 0.1, { color: 0x6a4a32 });
  for (const e of [-1.3, 1.3]) t.box(ex + e, hy + 0.9, ez, 0.1, 1.8, 0.1, { color: 0x6a4a32 });
  for (let i = 0; i < 18; i++) t.box(ex - 1.1 + (i % 9) * 0.27, hy + 0.72 + Math.floor(i / 9) * 0.6, ez + 0.07, 0.22, 0.15, 0.02, { color: 0xe8c890 });
  t.boxMM(ex - 1.4, hy + 1.8, ez - 0.4, ex + 1.4, hy + 1.9, ez + 0.4, { color: 0x4f7a6a });
  ctx.colliders.addBox(ex, ez, 1.35, 0.2);
  // big trees
  ctx.trees.push({ kind: 'sakura', x: hx + 12, z: hz + 4, seed: 1414, scale: 1.25, y: hy });
  ctx.trees.push({ kind: 'sakura', x: hx - 13, z: hz + 12, seed: 1415, scale: 1.1, y: hy });
  ctx.trees.push({ kind: 'broadleaf', x: hx - 14, z: hz - 1, seed: 1416, scale: 1.6, y: hy });
  ctx.trees.push({ kind: 'broadleaf', x: hx + 15, z: hz - 3, seed: 1417, scale: 1.4, y: hy });
  // lookout bench at the terrace edge
  const lbx = S.x + 12, lbz = S.terraceZ0 - 1.2;
  benchAt(ctx, t, lbx, hy, lbz, Math.PI, 0x8a6a4a, '町を見下ろすベンチに座る');
  // fence along the terrace edge
  for (const [a, b] of [[S.terraceX0, S.x - 3], [S.x + 3, S.terraceX1]]) {
    metalFence(t, a, S.terraceZ0 + 0.2, b, S.terraceZ0 + 0.2, () => hy, 1.0, 0x8a5a3c);
    ctx.colliders.addSegment(a, S.terraceZ0 + 0.2, b, S.terraceZ0 + 0.2, 0.2);
  }
  // shrine name stone at the bottom
  const stone = ctx.atlas.draw('shrine-stone', 96, 360, (c, w, h) => drawVertical(c, w, h, { text: '汐見神社', bg: '#b8b2a6', fg: '#2a2a2a', font: FONTS.brush }));
  const sx = S.x - 3.6, sz = S.z0 + 2.4;
  t.boxMM(sx - 0.35, yBottom, sz - 0.25, sx + 0.35, yBottom + 2.0, sz + 0.25, { color: 0xb8b2a6, pattern: PAT.STONE });
  signOnFace(kit, { o: V(sx - 0.3, yBottom, sz + 0.26), r: V(1, 0, 0), n: V(0, 0, 1), len: 0.6 }, 0.3, 0.3, 0.42, 1.55, 0.0, stone, 0);
  ctx.colliders.addBox(sx, sz, 0.35, 0.25);
  ctx.catSpots.push({ x: S.x + 0.9, z: S.z0 - 4, y: yBottom + 7 * rise, kind: 'steps', ry: 0 });
  ctx.landmarks.push({ id: 'shrine', name: '汐見神社', x: hx, z: hz });
  ctx.lamps.push({ x: hx, y: hy + 0.1, z: hz + 5, r: 4, ground: true });
}
