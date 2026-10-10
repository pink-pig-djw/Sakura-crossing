import { RNG } from '../core/rng.js';
import { PAT } from '../core/builder.js';
import { FONTS } from '../render/atlas.js';
import { buildRoom, vsign, hrect, vrect, glassRect, ceilingLights } from './interiors.js';
import { lockers, shopShelf, numberPlates } from './furnish.js';
import { potPlant } from './kit.js';

// 汐の湯, inside. The bath house on 桜坂's east side (buildings.js builds the outside and
// leaves ctx.sento) is walk-in: shoe lockers by the door, the front desk between the 男湯
// and 女湯 curtains, a lounge with a massage chair and a fridge of coffee milk; behind the
// 女湯 curtain a changing room with wooden lockers and, through the glass, the bath: taps
// with stools and yellow buckets, the tubs, and Mt. Fuji painted across the back wall over
// both halves. The 男湯 side is being cleaned (she isn't going in there anyway).

const T = 0.25;
const H = 4.8;

function muralTex(ctx) {
  return ctx.atlas2.draw('sento:fuji', 1024, 320, (c, w, h) => {
    const sky = c.createLinearGradient(0, 0, 0, h * 0.7);
    sky.addColorStop(0, '#6fb3e6');
    sky.addColorStop(1, '#e6f3fb');
    c.fillStyle = sky;
    c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(255,255,255,0.9)';
    for (const [x, y, r] of [[120, 70, 28], [160, 62, 34], [205, 74, 24], [760, 52, 30], [805, 46, 38], [855, 60, 26], [930, 90, 20]]) {
      c.beginPath();
      c.arc(x, y, r, 0, Math.PI * 2);
      c.fill();
    }
    // Mt. Fuji with its snow cap
    const fx = w * 0.5, base = h * 0.66;
    c.fillStyle = '#4f6f9a';
    c.beginPath();
    c.moveTo(fx - 380, base);
    c.quadraticCurveTo(fx - 120, base - 120, fx - 52, h * 0.12);
    c.lineTo(fx + 52, h * 0.12);
    c.quadraticCurveTo(fx + 120, base - 120, fx + 380, base);
    c.closePath();
    c.fill();
    c.fillStyle = '#f7fbff';
    c.beginPath();
    c.moveTo(fx - 52, h * 0.12);
    c.lineTo(fx + 52, h * 0.12);
    c.lineTo(fx + 96, h * 0.3);
    for (let i = 0; i <= 8; i++) c.lineTo(fx + 96 - i * 24, h * 0.3 + (i % 2 ? 18 : 2));
    c.closePath();
    c.fill();
    // the sea with white wave lines and a sail
    c.fillStyle = '#2f6fb0';
    c.fillRect(0, base, w, h - base);
    c.strokeStyle = 'rgba(255,255,255,0.75)';
    c.lineWidth = 3;
    for (let k = 0; k < 7; k++) {
      c.beginPath();
      for (let x = 0; x <= w; x += 24) c.lineTo(x, base + 14 + k * 15 + Math.sin(x * 0.05 + k) * 3);
      c.stroke();
    }
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.moveTo(700, base + 30);
    c.lineTo(730, base - 20);
    c.lineTo(736, base + 30);
    c.fill();
    // pines on the shore at both ends
    for (const sx of [70, 950]) {
      c.fillStyle = '#6a4a32';
      c.fillRect(sx - 6, base - 60, 12, 120);
      c.fillStyle = '#2f5a3a';
      for (const [dx, dy, r] of [[-30, -60, 30], [20, -80, 34], [-10, -110, 26], [36, -40, 24]]) {
        c.beginPath();
        c.ellipse(sx + dx, base + dy, r * 1.6, r * 0.6, 0, 0, Math.PI * 2);
        c.fill();
      }
    }
  });
}

function norenTex(ctx, kind) {
  return ctx.atlas2.draw('sento:noren:' + kind, 192, 160, (c, w, h) => {
    c.fillStyle = kind === 'm' ? '#2f4f8a' : '#b8344a';
    c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(255,255,255,0.18)';
    c.fillRect(w / 2 - 2, h * 0.3, 4, h);
    c.fillStyle = '#fff';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = `700 ${h * 0.42}px ${FONTS.brush}`;
    c.fillText(kind === 'm' ? '男' : '女', w / 2, h * 0.42);
    c.font = `700 ${h * 0.2}px ${FONTS.brush}`;
    c.fillText('ゆ', w / 2, h * 0.8);
  });
}

function milkSign(ctx) {
  return ctx.atlas2.draw('sento:milk', 256, 56, (c, w, h) => {
    c.fillStyle = '#fbf6e8';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#7a4a2a';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = `700 ${h * 0.5}px ${FONTS.brush}`;
    c.fillText('牛乳・コーヒー牛乳', w / 2, h * 0.52);
  });
}

function priceTex(ctx) {
  return ctx.atlas2.draw('sento:price', 320, 128, (c, w, h) => {
    c.fillStyle = '#f6efdc';
    c.fillRect(0, 0, w, h);
    c.strokeStyle = '#5d4636';
    c.lineWidth = 6;
    c.strokeRect(3, 3, w - 6, h - 6);
    c.fillStyle = '#2a2a2a';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = `700 ${h * 0.2}px ${FONTS.brush}`;
    c.fillText('入浴料', w / 2, h * 0.2);
    c.font = `700 ${h * 0.12}px ${FONTS.gothic}`;
    c.fillText('大人 520円　中人 200円　小人 100円', w / 2, h * 0.47);
    c.fillText('せっけん 50円　タオル 100円', w / 2, h * 0.66);
    c.fillStyle = '#b8344a';
    c.fillText('営業 15:00〜23:00　水曜定休', w / 2, h * 0.85);
  });
}

function cleaningTex(ctx) {
  return ctx.atlas2.draw('sento:cleaning', 96, 160, (c, w, h) => {
    c.fillStyle = '#f2d24a';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#2a2a2a';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = `700 ${w * 0.3}px ${FONTS.gothic}`;
    for (const [i, ch] of ['清', '掃', '中'].entries()) c.fillText(ch, w / 2, h * (0.25 + i * 0.25));
  });
}

function fanTex(ctx) {
  return ctx.atlas2.draw('sento:fan', 96, 96, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    const cx = w / 2, cy = h / 2;
    c.fillStyle = 'rgba(159,208,232,0.95)';
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.3;
      c.beginPath();
      c.ellipse(cx + Math.cos(a) * w * 0.2, cy + Math.sin(a) * h * 0.2, w * 0.17, h * 0.1, a, 0, Math.PI * 2);
      c.fill();
    }
    c.strokeStyle = '#e8ece8';
    c.lineWidth = 4;
    c.beginPath();
    c.arc(cx, cy, w * 0.44, 0, Math.PI * 2);
    c.stroke();
    c.lineWidth = 1.5;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      c.beginPath();
      c.moveTo(cx + Math.cos(a) * w * 0.08, cy + Math.sin(a) * h * 0.08);
      c.lineTo(cx + Math.cos(a) * w * 0.44, cy + Math.sin(a) * h * 0.44);
      c.stroke();
    }
    c.fillStyle = '#7ab0d0';
    c.beginPath();
    c.arc(cx, cy, w * 0.08, 0, Math.PI * 2);
    c.fill();
  });
}

function clockFaceTex(ctx) {
  return ctx.atlas2.draw('sento:clock', 96, 96, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    c.fillStyle = '#5d4636';
    c.beginPath();
    c.arc(w / 2, h / 2, w * 0.48, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#fbf7ec';
    c.beginPath();
    c.arc(w / 2, h / 2, w * 0.42, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#2a2a2a';
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      c.fillRect(w / 2 + Math.sin(a) * w * 0.35 - 2, h / 2 - Math.cos(a) * h * 0.35 - 2, 4, 4);
    }
  });
}

export function buildSentoInterior(ctx) {
  const info = ctx.sento;
  if (!info) return;
  const { L, hw, hd, front, y0 } = info;
  const rng = new RNG(2626);
  // local frame: x across the front (door at 0), z from the door to the back wall
  const ix0 = -hw / 2 + T, ix1 = hw / 2 - T, iz0 = front + T, iz1 = front + hd - T;
  const zA = iz0 + 3.6; // lobby | changing rooms
  const zB = zA + 3.2; // changing rooms | baths
  const dm = -hw / 4, df = hw / 4; // the 男 and 女 doorways
  const tubZ0 = iz1 - 2.0;
  const W = (lx, lz) => L.toW(lx, lz);
  const rectW = (lx0, lz0, lx1, lz1) => L.rectW(lx0, lz0, lx1, lz1);
  // a vertical rect between local points a and b facing local direction n, in world terms
  const wallQ = (a, b, n) => {
    const p = W(a[0], a[1]), q = W(b[0], b[1]), o = W(0, 0), m = W(n[0], n[1]);
    const vx = m[0] - o[0], vz = m[1] - o[1];
    if (Math.abs(p[1] - q[1]) < 1e-3) return { axis: 'x', c: p[1], a0: Math.min(p[0], q[0]), a1: Math.max(p[0], q[0]), dir: Math.sign(vz) };
    return { axis: 'z', c: p[0], a0: Math.min(p[1], q[1]), a1: Math.max(p[1], q[1]), dir: Math.sign(vx) };
  };
  const sideOf = (n) => {
    const Q = wallQ([0, 0], [n[1], -n[0]], n);
    return Q.axis === 'x' ? (Q.dir < 0 ? 'N' : 'S') : Q.dir < 0 ? 'W' : 'E';
  };
  const along = (side, lx, lz) => W(lx, lz)[side === 'N' || side === 'S' ? 0 : 1];
  const op = (side, a, b, yb, yt, kind, extra = {}) => {
    const u = along(side, ...a), v = along(side, ...b);
    return { a0: Math.min(u, v), a1: Math.max(u, v), yb, yt, kind, ...extra };
  };
  const open = { N: [], S: [], W: [], E: [] };
  const sFront = sideOf([0, -1]);
  open[sFront].push(op(sFront, [-1.3, iz0], [1.3, iz0], 0, 2.3, 'door'));
  // high windows let daylight into the baths
  for (const n of [[-1, 0], [1, 0]]) {
    const s = sideOf(n);
    open[s].push(op(s, [0, zB + 0.5], [0, iz1 - 0.5], 3.0, 4.2, 'glass', { pitch: 1.2 }));
  }
  const [rx0, rz0, rx1, rz1] = rectW(ix0, iz0, ix1, iz1);
  buildRoom(ctx, { name: 'sento', x0: rx0, x1: rx1, z0: rz0, z1: rz1, y: y0, h: H, out: 0xefe7d6, outPat: PAT.NONE, inC: 0xf1eadc, floor: 0xb5895a, floorPat: PAT.PLANKS, ceil: 0xf4efe4, roof: false, base: 0xa9a49a, open });
  ceilingLights(ctx, rx0, rz0, rx1, rz1, y0 + H, 2.6, [1.0, 0.25]);
  const b = ctx.builders.get('interior', (rx0 + rx1) / 2, (rz0 + rz1) / 2);
  const box = (lx0, ya, lz0, lx1, yb, lz1, o) => {
    const [x0, z0, x1, z1] = rectW(lx0, lz0, lx1, lz1);
    b.boxMM(x0, ya, z0, x1, yb, z1, o);
  };
  const solid = (lx0, lz0, lx1, lz1, ya, yb) => {
    const [x0, z0, x1, z1] = rectW(lx0, lz0, lx1, lz1);
    ctx.colliders.addBox((x0 + x1) / 2, (z0 + z1) / 2, (x1 - x0) / 2, (z1 - z0) / 2, 0, yb, ya);
  };
  const panel = (a, c, n, ya, yb, uv, em = 0.2, tile = 0) => {
    const Q = wallQ(a, c, n);
    vsign(ctx, Q.axis, Q.c, Q.a0, Q.a1, ya, yb, Q.dir, uv, em, tile);
  };
  const tiles = (a, c, n, ya, yb, color) => {
    const Q = wallQ(a, c, n);
    vrect(b, Q.axis, Q.c, Q.a0, Q.a1, ya, yb, Q.dir, color, PAT.TILE);
  };
  const floorPatch = (lx0, lz0, lx1, lz1, dy, color, pat) => {
    const [x0, z0, x1, z1] = rectW(lx0, lz0, lx1, lz1);
    hrect(b, x0, z0, x1, z1, y0 + dy, 1, color, pat);
  };
  const facing = (lx, lz) => {
    const [ax, az] = W(0, 0), [cx, cz] = W(lx, lz);
    return Math.atan2(-(cx - ax), -(cz - az));
  };
  const IT = (what, lx, lz, label, text, r = 1.2) => {
    const [x, z] = W(lx, lz);
    ctx.interactables.push({ kind: 'sento', what, x, z, y: y0, r, label, text });
  };
  const seat = (lx, lz, sy, face, label, r = 1.0) => {
    const [x, z] = W(lx, lz);
    ctx.interactables.push({ kind: 'bench', x, z, y: y0, r, label, sit: { x, y: y0 + sy, z, yaw: facing(...face) } });
  };
  const wall = { color: 0xe9e0cc };
  const wood = { color: 0x8a6a4a, pattern: PAT.PLANKS };

  // ---- partitions: lobby | changing rooms, glass to the baths, the middle wall
  for (const [a, c] of [[ix0, dm - 0.65], [dm + 0.65, df - 0.65], [df + 0.65, ix1]]) {
    box(a, y0, zA - 0.075, c, y0 + H, zA + 0.075, wall);
    solid(a, zA - 0.08, c, zA + 0.08, y0 - 0.5, y0 + H);
  }
  for (const x of [dm, df]) box(x - 0.65, y0 + 2.2, zA - 0.075, x + 0.65, y0 + H, zA + 0.075, wall);
  // noren in both doorways, readable from the lobby (and mirrored from behind)
  for (const [x, k] of [[dm, 'm'], [df, 'f']]) {
    const uv = norenTex(ctx, k);
    panel([x - 0.62, zA - 0.09], [x + 0.62, zA - 0.09], [0, -1], y0 + 1.3, y0 + 2.18, uv, 0.15);
    panel([x - 0.62, zA - 0.09], [x + 0.62, zA - 0.09], [0, 1], y0 + 1.3, y0 + 2.18, { ...uv, u0: uv.u1, u1: uv.u0 }, 0.15);
  }
  // 男湯: a stand and a rope across the doorway
  box(dm - 0.18, y0, zA - 0.5, dm + 0.18, y0 + 0.04, zA - 0.3, { color: 0x3a3a3a });
  box(dm - 0.02, y0 + 0.04, zA - 0.42, dm + 0.02, y0 + 0.75, zA - 0.38, { color: 0x3a3a3a });
  panel([dm - 0.16, zA - 0.43], [dm + 0.16, zA - 0.43], [0, -1], y0 + 0.75, y0 + 1.27, cleaningTex(ctx), 0.25);
  box(dm - 0.62, y0 + 0.85, zA - 0.13, dm + 0.62, y0 + 0.88, zA - 0.1, { color: 0xc23a2e });
  solid(dm - 0.65, zA - 0.5, dm + 0.65, zA + 0.08, y0 - 0.5, y0 + H);
  IT('closed', dm, zA - 1.1, '男湯の札を見る', '「男湯 ただいま清掃中」……それに、こっちは男湯だ。', 1.0);
  // the middle wall: full height between the changing rooms, 2.2 m of tiles between the baths
  box(-0.075, y0, zA, 0.075, y0 + H, zB, wall);
  box(-0.075, y0, zB, 0.075, y0 + 2.2, iz1, { color: 0xbfd8e0, pattern: PAT.TILE });
  box(-0.1, y0 + 2.2, zB, 0.1, y0 + 2.26, iz1, { color: 0x9fb8c0 });
  solid(-0.08, zA, 0.08, iz1, y0 - 0.5, y0 + H);
  // glass between the changing rooms and the baths, a doorway in each half
  for (const [a, c] of [[ix0, dm - 0.55], [dm + 0.55, -0.075], [0.075, df - 0.55], [df + 0.55, ix1]]) {
    const Q = wallQ([a, zB], [c, zB], [0, 1]);
    glassRect(ctx, Q.axis, Q.c, Q.a0, Q.a1, y0 + 0.1, y0 + 2.2);
    box(a, y0, zB - 0.05, c, y0 + 0.1, zB + 0.05, { color: 0x8a8f94 });
    for (const e of [a, c]) box(e - 0.03, y0, zB - 0.05, e + 0.03, y0 + 2.2, zB + 0.05, { color: 0x8a8f94 });
    solid(a, zB - 0.06, c, zB + 0.06, y0 - 0.5, y0 + H);
  }
  box(ix0, y0 + 2.2, zB - 0.06, ix1, y0 + H, zB + 0.06, wall);

  // ---- lobby
  // the entry: a stone floor where shoes come off, a wooden step up, shoe lockers both sides
  floorPatch(-1.5, iz0, 1.5, iz0 + 0.9, 0.006, 0x8f8a80, PAT.STONE);
  box(-1.5, y0, iz0 + 0.88, 1.5, y0 + 0.03, iz0 + 0.98, { color: 0x6a4a32 });
  const brass = numberPlates(ctx, 'brass');
  let shoeNo = 0;
  for (const [a, c] of [[ix0 + 0.1, -1.6], [1.6, ix1 - 0.1]]) {
    const Q = wallQ([a, iz0 + 0.42], [c, iz0 + 0.42], [0, 1]), cols = Math.round((c - a) / 0.32);
    lockers(ctx, Q.axis, Q.c, Q.a0, Q.a1, Q.dir, y0, 1.5, 0.42, { style: 'wood', cols, rows: 4, frame: 0x6a4a32, colors: ['#b8925e', '#b08a58', '#bf9a66'], numbers: brass, start: shoeNo, gap: 0.008, seed: 3 + shoeNo });
    shoeNo += cols * 4;
    solid(a, iz0, c, iz0 + 0.42, y0 - 0.5, y0 + 1.5);
  }
  IT('shoes', 2.6, iz0 + 0.95, '下足札を取る', '靴を入れて、木の札を抜いた。カチリといい音がした。');
  // the front desk against the wall between the curtains, the price board and a clock above
  box(-1.0, y0, zA - 0.75, 1.0, y0 + 1.0, zA - 0.075, { color: 0x7a5a3e, pattern: PAT.PLANKS });
  box(-1.05, y0 + 1.0, zA - 0.8, 1.05, y0 + 1.05, zA - 0.075, { color: 0xe8dcc0 });
  box(0.35, y0 + 1.05, zA - 0.55, 0.75, y0 + 1.28, zA - 0.3, { color: 0x3a3c40 });
  box(-0.7, y0 + 1.05, zA - 0.6, -0.4, y0 + 1.12, zA - 0.4, { color: 0xc23a2e });
  solid(-1.05, zA - 0.8, 1.05, zA - 0.075, y0 - 0.5, y0 + 1.1);
  panel([-1.2, zA - 0.085], [1.2, zA - 0.085], [0, -1], y0 + 2.2, y0 + 3.16, priceTex(ctx), 0.25);
  if (Math.abs(Math.sin(L.ry)) < 1e-3) {
    // wall clock (the shared clock hands only turn on faces along z)
    panel([-0.32, zA - 0.085], [0.32, zA - 0.085], [0, -1], y0 + 3.36, y0 + 4.0, clockFaceTex(ctx), 0.2);
    const [cx, cz] = W(0, zA - 0.04);
    ctx.clocks.push({ x: cx, y: y0 + 3.68, z: cz, off: Math.cos(L.ry) > 0 ? 0.055 : -0.055 });
  }
  IT('desk', 0, zA - 1.4, 'フロントであいさつする', '「いらっしゃい。ゆっくりあったまっていってね」');
  // lounge: a long bench down the west wall, a massage chair and the milk fridge on the east
  box(ix0 + 0.1, y0 + 0.42, iz0 + 0.9, ix0 + 0.55, y0 + 0.48, zA - 0.3, { color: 0x6a4a3a });
  box(ix0, y0 + 0.48, iz0 + 0.9, ix0 + 0.12, y0 + 0.95, zA - 0.3, { color: 0x6a4a3a });
  for (const z of [iz0 + 1.0, zA - 0.4]) box(ix0 + 0.12, y0, z - 0.05, ix0 + 0.5, y0 + 0.42, z + 0.05, { color: 0x4a3a2a });
  solid(ix0, iz0 + 0.9, ix0 + 0.56, zA - 0.3, y0 - 0.5, y0 + 0.5);
  seat(ix0 + 0.33, (iz0 + 0.9 + zA - 0.3) / 2, 0.48, [1, 0], '長椅子で休む');
  const mc = [ix1 - 0.5, iz0 + 1.15];
  box(mc[0] - 0.4, y0, mc[1] - 0.45, mc[0] + 0.4, y0 + 0.5, mc[1] + 0.45, { color: 0x5a3a3a });
  box(mc[0] + 0.22, y0 + 0.5, mc[1] - 0.42, mc[0] + 0.4, y0 + 1.3, mc[1] + 0.42, { color: 0x5a3a3a });
  for (const e of [-1, 1]) box(mc[0] - 0.4, y0 + 0.5, mc[1] + e * 0.36 - 0.08, mc[0] + 0.22, y0 + 0.78, mc[1] + e * 0.36 + 0.08, { color: 0x4a2e2e });
  solid(mc[0] - 0.42, mc[1] - 0.47, mc[0] + 0.42, mc[1] + 0.47, y0 - 0.5, y0 + 0.6);
  seat(mc[0] - 0.05, mc[1], 0.5, [-1, 0], 'マッサージチェアに座る');
  const fr = [ix1 - 0.38, zA - 0.7];
  {
    // the milk fridge: glass door, bottles of coffee milk, fruit milk and plain milk
    const Q = wallQ([fr[0] - 0.36, fr[1] - 0.48], [fr[0] - 0.36, fr[1] + 0.48], [-1, 0]);
    shopShelf(ctx, Q.axis, Q.c, Q.a0, Q.a1, Q.dir, y0, 1.6, 0.7, ['milk', 'milk', 'milk', 'drinks'], { color: 0xe8e8e2, back: 0x7a8088, plinth: 0.25, bay: 1.0, seed: 77 });
    box(fr[0] - 0.36, y0 + 1.6, fr[1] - 0.48, fr[0] + 0.36, y0 + 1.85, fr[1] + 0.48, { color: 0xe8e8e2 });
    glassRect(ctx, Q.axis, Q.c + Q.dir * 0.02, Q.a0 + 0.04, Q.a1 - 0.04, y0 + 0.22, y0 + 1.58);
    panel([fr[0] - 0.37, fr[1] - 0.4], [fr[0] - 0.37, fr[1] + 0.4], [-1, 0], y0 + 1.64, y0 + 1.82, milkSign(ctx), 0.6);
  }
  solid(fr[0] - 0.38, fr[1] - 0.5, fr[0] + 0.38, fr[1] + 0.5, y0 - 0.5, y0 + 1.85);
  IT('milk', fr[0] - 1.0, fr[1], 'コーヒー牛乳を飲む', '湯上がりのコーヒー牛乳。腰に手を当てて、一気に飲んだ。');
  // a potted plant on each side of the step
  for (const lx of [-1.9, 1.9]) potPlant(b, ...flat(W(lx, iz0 + 0.75), y0), rng, 1.1);

  // ---- the changing rooms (built the same on both sides)
  const mirror = { color: 0xdfeef3 };
  for (const s of [-1, 1]) {
    const outer = s < 0 ? ix0 : ix1;
    // lockers along the outer wall
    const la = Math.min(outer, outer - s * 0.45), lc = Math.max(outer, outer - s * 0.45);
    {
      const Q = wallQ([outer - s * 0.45, zA + 0.3], [outer - s * 0.45, zB - 1.0], [-s, 0]), cols = Math.max(2, Math.round((zB - 1.3 - zA) / 0.38));
      lockers(ctx, Q.axis, Q.c, Q.a0, Q.a1, Q.dir, y0, 1.8, 0.45, { style: 'wood', cols, rows: 3, frame: 0x6a4a32, colors: ['#c49a62', '#bb925c', '#c8a26c'], numbers: brass, start: s < 0 ? 0 : 20, gap: 0.01, seed: 90 + s });
    }
    solid(la, zA + 0.3, lc, zB - 1.0, y0 - 0.5, y0 + 1.8);
    // a vanity on the lobby wall: counter, mirror, a hair dryer
    const va = Math.min(s * 0.25, s * 1.5), vc = Math.max(s * 0.25, s * 1.5);
    box(va, y0 + 0.72, zA + 0.075, vc, y0 + 0.78, zA + 0.5, { color: 0xe8dcc0 });
    box(va, y0, zA + 0.075, vc, y0 + 0.72, zA + 0.45, { color: 0x7a5a3e });
    box(va + 0.05, y0 + 0.95, zA + 0.075, vc - 0.05, y0 + 1.8, zA + 0.095, mirror);
    box(s * 0.9 - 0.08, y0 + 0.78, zA + 0.2, s * 0.9 + 0.08, y0 + 0.98, zA + 0.32, { color: 0xf2f0ea });
    solid(va, zA + 0.075, vc, zA + 0.5, y0 - 0.5, y0 + 0.8);
    // a bench down the middle wall, scales in the corner, a big round fan
    const ba = Math.min(s * 0.45, s * 0.85), bc = Math.max(s * 0.45, s * 0.85);
    box(ba, y0 + 0.4, zA + 1.1, bc, y0 + 0.46, zB - 0.9, wood);
    for (const z of [zA + 1.2, zB - 1.0]) box(ba + 0.05, y0, z - 0.04, bc - 0.05, y0 + 0.4, z + 0.04, { color: 0x5a4a3a });
    solid(ba, zA + 1.1, bc, zB - 0.9, y0 - 0.5, y0 + 0.46);
    const sx = s * 3.6, sz = zB - 0.55;
    box(sx - 0.25, y0, sz - 0.25, sx + 0.25, y0 + 0.08, sz + 0.25, { color: 0xf2f0ea });
    box(sx - 0.03, y0 + 0.08, sz + 0.18, sx + 0.03, y0 + 1.0, sz + 0.24, { color: 0xb8bcc0 });
    box(sx - 0.18, y0 + 1.0, sz + 0.1, sx + 0.18, y0 + 1.36, sz + 0.26, { color: 0xf2f0ea });
    solid(sx - 0.26, sz - 0.26, sx + 0.26, sz + 0.27, y0 - 0.5, y0 + 1.36);
    // a standing fan turned towards the room
    const fx = s * 0.55, fz = zB - 0.45;
    b.cyl(...flat(W(fx, fz), y0), 0.18, 0.18, 0.03, 12, 0xd8dcd8);
    box(fx - 0.025, y0, fz - 0.025, fx + 0.025, y0 + 1.25, fz + 0.025, { color: 0xd8dcd8 });
    box(fx - 0.07, y0 + 1.2, fz - 0.02, fx + 0.07, y0 + 1.36, fz + 0.14, { color: 0xeef0ee });
    const fan = fanTex(ctx);
    panel([fx - 0.24, fz - 0.03], [fx + 0.24, fz - 0.03], [0, -1], y0 + 1.04, y0 + 1.52, fan, 0.05);
    panel([fx - 0.24, fz - 0.03], [fx + 0.24, fz - 0.03], [0, 1], y0 + 1.04, y0 + 1.52, fan, 0.05);
  }
  IT('locker', ix1 - 0.9, (zA + zB) / 2 - 0.3, 'ロッカーに荷物を入れる', '木の札の鍵を回して、荷物をしまった。');
  IT('dryer', 0.9, zA + 0.95, 'ドライヤーを使う', 'ドライヤーは3分20円。髪がふわっと乾いた。', 1.0);
  IT('scale', 3.0, zB - 0.6, '体重計に乗る', '体重計の針が揺れる。……見なかったことにした。', 1.0);
  seat((0.45 + 0.85) / 2, (zA + zB) / 2, 0.46, [1, 0], '脱衣所のベンチに座る');

  // ---- the baths: tiled floor and walls, taps (カラン), the tubs, Mt. Fuji
  for (const [a, c] of [[ix0, -0.075], [0.075, ix1]]) floorPatch(a, zB + 0.06, c, iz1, 0.006, 0xcfdcde, PAT.TILE);
  for (const s of [-1, 1]) {
    const outer = s < 0 ? ix0 : ix1;
    tiles([outer - s * 0.002, zB + 0.06], [outer - s * 0.002, iz1], [-s, 0], y0, y0 + 2.6, 0xbcd4dc);
  }
  tiles([ix0, iz1 - 0.002], [ix1, iz1 - 0.002], [0, -1], y0, y0 + 1.2, 0xbcd4dc);
  for (const s of [-1, 1]) {
    // taps along the outer wall and back to back along the middle wall
    for (const [wx, d] of [[s < 0 ? ix0 : ix1, -s], [s * 0.075, s]]) {
      for (let z = zB + 0.65; z < tubZ0 - 0.45; z += 0.85) {
        const span = (u, v) => [Math.min(wx + d * u, wx + d * v), Math.max(wx + d * u, wx + d * v)];
        const [m0, m1] = span(0.002, 0.03);
        box(m0, y0 + 1.1, z - 0.28, m1, y0 + 1.6, z + 0.28, mirror);
        const [h0, h1] = span(0, 0.2);
        box(h0, y0 + 0.75, z - 0.25, h1, y0 + 0.81, z + 0.25, { color: 0xd8dcd8 });
        const [k0, k1] = span(0.06, 0.15);
        for (const dz of [-0.12, 0.12]) box(k0, y0 + 0.86, z + dz - 0.035, k1, y0 + 0.94, z + dz + 0.035, { color: dz < 0 ? 0xd84a3a : 0x3a6ad8 });
        b.cyl(...flat(W(wx + d * 0.7, z), y0), 0.17, 0.15, 0.3, 10, 0xf2f0ea);
        b.cyl(...flat(W(wx + d * 0.42, z + 0.24), y0), 0.14, 0.12, 0.13, 12, 0xf6d23a);
      }
      const [c0, c1] = [Math.min(wx, wx + d * 0.95), Math.max(wx, wx + d * 0.95)];
      solid(c0, zB + 0.35, c1, tubZ0 - 0.4, y0 - 0.5, y0 + 0.9);
    }
    // the tub: tiled walls, water inside
    const ta = s < 0 ? ix0 : 0.075, tc = s < 0 ? -0.075 : ix1;
    box(ta, y0, tubZ0, tc, y0 + 0.55, tubZ0 + 0.18, { color: 0x9ec4cc, pattern: PAT.TILE });
    box(ta, y0 + 0.55, tubZ0 - 0.02, tc, y0 + 0.6, tubZ0 + 0.2, { color: 0xe8eef0 });
    const [wx0, wz0, wx1, wz1] = rectW(ta, tubZ0 + 0.18, tc, iz1);
    hrect(b, wx0, wz0, wx1, wz1, y0 + 0.46, 1, 0x7ac4d8, 0);
    solid(ta, tubZ0, tc, iz1, y0 - 0.5, y0 + 0.6);
  }
  panel([ix0 + 0.05, iz1 - 0.01], [ix1 - 0.05, iz1 - 0.01], [0, -1], y0 + 1.3, y0 + 4.5, muralTex(ctx), 0.25);
  IT('mural', df - 0.8, tubZ0 - 1.0, '富士山の絵を眺める', '壁いっぱいの富士山と青い海。湯気の向こうでも、やっぱり見事だ。', 1.0);
  IT('tap', ix1 - 1.2, zB + 0.65, 'カランを押す', 'カランを押すと、お湯がジャーッと出た。', 0.8);
  IT('bath', df + 0.7, tubZ0 - 0.35, '湯船につかる', '肩までつかって、ふう……。今日の疲れがお湯に溶けていく。', 0.9);
}

// [x, z] + y -> x, y, z
const flat = ([x, z], y) => [x, y, z];
