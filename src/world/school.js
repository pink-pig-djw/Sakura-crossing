import * as THREE from 'three';
import { RNG } from '../core/rng.js';
import { PAT } from '../core/builder.js';
import { SCHOOL, groundH } from './layout.js';
import { Kit, signOnFace, metalFence, bicycle } from './kit.js';
import { FONTS, drawVertical, fitText, roundRect } from '../render/atlas.js';
import { buildRoom, openWall, wallRects, hrect, vrect, vsign, productTex } from './interiors.js';
import { roadSurfaceY } from './roads.js';
import { shrub, flowers, GARDEN_FLOWERS, AZALEA } from './greenery.js';

// 桜ヶ浜高校 (Sakuragahama High School), up the slope east of 東町通り.
//
// The campus is cut into two terraces (layout.js SCHOOL): the school buildings stand on
// the lower one behind the gate and a row of sakura; the sports ground with its 200 m
// track is up a flight of steps behind a retaining wall. The four-storey main building
// (本館) is walkable on every floor: shoe lockers at the entrance (昇降口), a corridor
// along the north side with the classrooms facing the sun, the staff room, the nurse's
// office, special rooms on the east end, switchback stairs at the west end and a door
// out onto the fenced rooftop. The gym (体育館) next door has a court and a stage.

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const S = SCHOOL;

// main building: inner faces of the outer walls
export const MAIN = { x0: 342, x1: 411, z0: -50, z1: -38 };
const T = 0.25; // outer wall thickness (outside the inner rect)
const FH = 3.6; // floor to floor
const CH = 3.2; // ceiling height (the slab fills the rest)
const FLOORS = 4;
const Y1 = S.yLow + 0.3; // ground floor, a step up from the terrace
const lvl = (k) => Y1 + (k - 1) * FH; // floor k = 1..4; lvl(5) is the roof
const CORR = -47; // corridor / classroom partition (corridor on the north side)
const PT = 0.15; // partition thickness
const BAY = 9;
const BAY0 = 348; // first bay (the stair core is MAIN.x0 .. BAY0)
const bayX = (i) => BAY0 + i * BAY;
// stairs in the core: two flights side by side, the landing at the south end
const ST = { xA0: MAIN.x0, xA1: 344.9, xB0: 345.1, xB1: BAY0, z0: -45.4, z1: -42.04, zL: MAIN.z1, rise: FH / 2, n: 12 };
// gym
export const GYM = { x0: 424, x1: 466, z0: -56, z1: -28 };

const WALL_IN = 0xf3eee2, FLOOR_WOOD = 0xc89b67, FLOOR_CORR = 0xcdd3c8, CEIL = 0xf4f2ec;
const FACADE = 0xf1eee6, BAND = 0xd9d6ce;

const IB = (ctx, x, z) => ctx.builders.get('interior', x, z);
const TB = (ctx, x, z) => ctx.builders.get('toon', x, z);
const EB = (ctx, x, z) => ctx.builders.get('emissive', x, z);

// an axis aligned solid box for walkers, between two feet heights
function solid(ctx, x0, z0, x1, z1, yBottom, yTop) {
  return ctx.colliders.addBox((x0 + x1) / 2, (z0 + z1) / 2, Math.abs(x1 - x0) / 2, Math.abs(z1 - z0) / 2, 0, yTop, yBottom);
}

// a walkable floor (feet band around its height so the floors above and below stay apart)
function floorAt(ctx, x0, z0, x1, z1, y, prio = 3) {
  ctx.colliders.addSurface(x0, z0, x1, z1, () => y, prio, { min: y - 1.2, max: y + 1.7, under: y > groundH((x0 + x1) / 2, (z0 + z1) / 2) + 2.5 });
}

// interior wall (lit from inside on both faces) with door openings [{ a0, a1, h }]
function partition(ctx, axis, c, a0, a1, y, h, doors = [], o = {}) {
  const t = o.t ?? PT;
  const color = o.color ?? WALL_IN;
  const ops = doors.map((d) => ({ a0: d.a0, a1: d.a1, yb: y, yt: y + (d.h ?? 2.05) }));
  for (const [ra0, ra1, yb, yt] of wallRects(a0, a1, y, y + h, ops)) {
    const b = IB(ctx, axis === 'x' ? (ra0 + ra1) / 2 : c, axis === 'x' ? c : (ra0 + ra1) / 2);
    if (axis === 'x') b.boxMM(ra0, yb, c - t / 2, ra1, yt, c + t / 2, { color });
    else b.boxMM(c - t / 2, yb, ra0, c + t / 2, yt, ra1, { color });
    if (yb <= y + 0.01) {
      if (axis === 'x') solid(ctx, ra0, c - t / 2, ra1, c + t / 2, y - 0.5, yt);
      else solid(ctx, c - t / 2, ra0, c + t / 2, ra1, y - 0.5, yt);
    }
  }
  // door frames (dark wood) and a skirting strip
  for (const d of doors) {
    const fb = IB(ctx, axis === 'x' ? (d.a0 + d.a1) / 2 : c, axis === 'x' ? c : (d.a0 + d.a1) / 2);
    const top = y + (d.h ?? 2.05);
    const fr = (p0, p1, yb, yt) => (axis === 'x' ? fb.boxMM(p0, yb, c - t / 2 - 0.02, p1, yt, c + t / 2 + 0.02, { color: 0x7a5a3e }) : fb.boxMM(c - t / 2 - 0.02, yb, p0, c + t / 2 + 0.02, yt, p1, { color: 0x7a5a3e }));
    fr(d.a0 - 0.05, d.a1 + 0.05, top, top + 0.06);
    fr(d.a0 - 0.05, d.a0, y, top);
    fr(d.a1, d.a1 + 0.05, y, top);
  }
}

// floor top (wood, tiles ...) and the ceiling of the floor below, over a rect
function slabPair(ctx, x0, z0, x1, z1, yFloor, floorColor, floorPat, ceilY = null) {
  for (let x = x0; x < x1 - 0.01; x += 8) {
    for (let z = z0; z < z1 - 0.01; z += 8) {
      const xa = x, xb = Math.min(x1, x + 8), za = z, zb = Math.min(z1, z + 8);
      hrect(IB(ctx, xa, za), xa, za, xb, zb, yFloor, 1, floorColor, floorPat);
      if (ceilY !== null) hrect(IB(ctx, xa, za), xa, za, xb, zb, ceilY, -1, CEIL, 0);
    }
  }
}

// small text plate on the atlas (class names, room names)
function plate(ctx, key, text, o = {}) {
  return ctx.atlas2.draw('sch:' + key, o.w ?? 192, o.h ?? 56, (c, w, h) => {
    c.fillStyle = o.bg ?? '#f6f3ea';
    c.fillRect(0, 0, w, h);
    c.strokeStyle = o.border ?? '#3a3a3a';
    c.lineWidth = 3;
    c.strokeRect(1.5, 1.5, w - 3, h - 3);
    c.fillStyle = o.fg ?? '#222';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    fitText(c, text, w * 0.88, h * 0.66, o.font ?? FONTS.gothic, '700');
    c.fillText(text, w / 2, h * 0.54);
  });
}

// ---------------------------------------------------------------------------
// textures (atlas page 2)
// ---------------------------------------------------------------------------
function chalkboard(ctx, key, lines) {
  return ctx.atlas2.draw('sch:board:' + key, 384, 96, (c, w, h) => {
    c.fillStyle = '#2f4a3c';
    c.fillRect(0, 0, w, h);
    // smudges of old chalk
    const rng = new RNG(key.length * 131 + 7);
    for (let i = 0; i < 18; i++) {
      c.fillStyle = `rgba(255,255,255,${rng.range(0.02, 0.06)})`;
      c.fillRect(rng.range(0, w), rng.range(0, h), rng.range(20, 70), rng.range(6, 18));
    }
    c.fillStyle = '#f4f1e6';
    c.textBaseline = 'middle';
    for (const [text, x, y, size, align] of lines) {
      c.font = `500 ${size}px ${FONTS.maru}`;
      c.textAlign = align ?? 'left';
      c.fillText(text, x * w, y * h);
    }
  });
}

function cubbyTex(ctx) {
  return ctx.atlas2.draw('sch:cubby', 256, 64, (c, w, h) => {
    c.fillStyle = '#d8c4a0';
    c.fillRect(0, 0, w, h);
    const cols = 10, rows = 2;
    const rng = new RNG(4242);
    const bags = ['#2a3a5a', '#3a3a3a', '#7a2a3a', '#2f5a3a', '#c98a3a', '#f2efe6'];
    for (let r = 0; r < rows; r++) {
      for (let k = 0; k < cols; k++) {
        const x = (k * w) / cols + 2, y = (r * h) / rows + 2, cw = w / cols - 4, ch = h / rows - 4;
        c.fillStyle = '#5a4632';
        c.fillRect(x, y, cw, ch);
        if (rng.next() < 0.75) {
          c.fillStyle = bags[Math.floor(rng.next() * bags.length)];
          roundRect(c, x + 2, y + ch * 0.25, cw - 4, ch * 0.75, 3);
          c.fill();
        }
      }
    }
  });
}

function shoeTex(ctx) {
  return ctx.atlas2.draw('sch:shoes', 256, 128, (c, w, h) => {
    c.fillStyle = '#c9c6bc';
    c.fillRect(0, 0, w, h);
    const cols = 8, rows = 6;
    for (let r = 0; r < rows; r++) {
      for (let k = 0; k < cols; k++) {
        const x = (k * w) / cols + 2, y = (r * h) / rows + 2, cw = w / cols - 4, ch = h / rows - 4;
        c.fillStyle = '#e4e1d8';
        c.fillRect(x, y, cw, ch);
        c.fillStyle = '#ffffff';
        c.fillRect(x + cw * 0.2, y + 3, cw * 0.6, ch * 0.22); // name tag
        c.fillStyle = '#8a8880';
        c.fillRect(x + cw * 0.42, y + ch * 0.6, cw * 0.16, 3); // handle
      }
    }
  });
}

function noticeTex(ctx) {
  return ctx.atlas2.draw('sch:notice', 256, 96, (c, w, h) => {
    c.fillStyle = '#c8a46a';
    c.fillRect(0, 0, w, h);
    const rng = new RNG(919);
    const cols = ['#ffffff', '#fff3b0', '#d8f0ff', '#ffd8e4', '#e0f4d8'];
    for (let i = 0; i < 9; i++) {
      const pw = rng.range(26, 46), ph = rng.range(30, 50);
      const x = rng.range(4, w - pw - 4), y = rng.range(4, h - ph - 4);
      c.fillStyle = cols[i % cols.length];
      c.fillRect(x, y, pw, ph);
      c.fillStyle = 'rgba(40,40,40,0.55)';
      for (let l = 0; l < 4; l++) c.fillRect(x + 4, y + 8 + l * 8, pw - 8, 2);
      c.fillStyle = '#d84a3a';
      c.beginPath();
      c.arc(x + pw / 2, y + 3, 2.5, 0, Math.PI * 2);
      c.fill();
    }
  });
}

function clockTex(ctx) {
  return ctx.atlas2.draw('sch:clock', 96, 96, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.arc(w / 2, h / 2, w * 0.46, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = '#3a3a3a';
    c.lineWidth = 4;
    c.stroke();
    c.fillStyle = '#2a2a2a';
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      c.fillRect(w / 2 + Math.sin(a) * w * 0.38 - 1.5, h / 2 - Math.cos(a) * h * 0.38 - 1.5, 3, 3);
    }
    // hands at twenty-five to nine
    c.strokeStyle = '#1a1a1a';
    c.lineWidth = 4;
    c.beginPath();
    c.moveTo(w / 2, h / 2);
    c.lineTo(w / 2 + Math.sin((8.6 / 12) * Math.PI * 2) * w * 0.22, h / 2 - Math.cos((8.6 / 12) * Math.PI * 2) * h * 0.22);
    c.stroke();
    c.lineWidth = 2.5;
    c.beginPath();
    c.moveTo(w / 2, h / 2);
    c.lineTo(w / 2 + Math.sin((35 / 60) * Math.PI * 2) * w * 0.34, h / 2 - Math.cos((35 / 60) * Math.PI * 2) * h * 0.34);
    c.stroke();
  });
}

// ---------------------------------------------------------------------------
// the main building (本館): shell, floors, stairs, roof
// ---------------------------------------------------------------------------
const ROOMS = {
  // per floor: bay index -> room ([name, kind, span in bays])
  1: [['保健室', 'nurse', 1], ['職員室', 'staff', 2], null, ['昇降口', 'entrance', 1], ['図書室', 'library', 1], ['生徒会室', 'council', 1], ['放送室', 'broadcast', 1]],
  2: [['3年A組', 'class', 1], ['3年B組', 'class', 1], ['3年C組', 'class', 1], ['3年D組', 'class', 1], ['3年E組', 'class', 1], ['3年F組', 'class', 1], ['音楽室', 'music', 1]],
  3: [['2年A組', 'class', 1], ['2年B組', 'class', 1], ['2年C組', 'class', 1], ['2年D組', 'class', 1], ['2年E組', 'class', 1], ['2年F組', 'class', 1], ['美術室', 'art', 1]],
  4: [['1年A組', 'class', 1], ['1年B組', 'class', 1], ['1年C組', 'class', 1], ['1年D組', 'class', 1], ['1年E組', 'class', 1], ['1年F組', 'class', 1], ['理科室', 'lab', 1]],
};

function buildMain(ctx) {
  const M = MAIN;
  const xm = (M.x0 + M.x1) / 2, zm = (M.z0 + M.z1) / 2;
  const R = { out: FACADE, outPat: PAT.TILE, inC: WALL_IN, sill: 0xd8d2c4 };
  // foundation from the terrace up to the ground floor
  TB(ctx, xm, zm).boxMM(M.x0 - T, S.yLow - 0.6, M.z0 - T, M.x1 + T, Y1, M.z1 + T, { color: 0xa9a59c, pattern: PAT.CONCRETE, skip: 'Y' });
  for (let k = 1; k <= FLOORS; k++) {
    const y = lvl(k);
    const sides = {
      N: { axis: 'x', c: M.z0, dir: 1, A0: M.x0 - T, A1: M.x1 + T, body: (a0, a1, yb, yt) => [a0, yb, M.z0 - T, a1, yt, M.z0], skip: 'Z' },
      S: { axis: 'x', c: M.z1, dir: -1, A0: M.x0 - T, A1: M.x1 + T, body: (a0, a1, yb, yt) => [a0, yb, M.z1, a1, yt, M.z1 + T], skip: 'z' },
      W: { axis: 'z', c: M.x0, dir: 1, A0: M.z0, A1: M.z1, body: (a0, a1, yb, yt) => [M.x0 - T, yb, a0, M.x0, yt, a1], skip: 'X' },
      E: { axis: 'z', c: M.x1, dir: -1, A0: M.z0, A1: M.z1, body: (a0, a1, yb, yt) => [M.x1, yb, a0, M.x1 + T, yt, a1], skip: 'x' },
    };
    const ops = { N: [], S: [], W: [], E: [] };
    for (let i = 0; i < 7; i++) {
      const a = bayX(i), b = a + BAY;
      // corridor windows on the north side
      ops.N.push({ a0: a + 0.5, a1: b - 0.5, yb: y + 1.0, yt: y + 2.75, kind: 'glass', pitch: 1.6 });
      // classroom windows facing south (the entrance on the ground floor)
      if (k === 1 && i === 3) {
        ops.S.push({ a0: a + 0.4, a1: a + 2.3, yb: y + 0.05, yt: y + 2.7, kind: 'glass', pitch: 1.0, transom: 2.15 });
        ops.S.push({ a0: a + 2.5, a1: b - 2.5, yb: y, yt: y + 2.7, kind: 'door' });
        ops.S.push({ a0: b - 2.3, a1: b - 0.4, yb: y + 0.05, yt: y + 2.7, kind: 'glass', pitch: 1.0, transom: 2.15 });
      } else ops.S.push({ a0: a + 0.35, a1: b - 0.35, yb: y + 0.85, yt: y + 2.95, kind: 'glass', pitch: 1.66 });
    }
    // the stair core: corridor window, a tall window lighting the landing
    ops.N.push({ a0: M.x0 + 0.6, a1: BAY0 - 0.6, yb: y + 1.0, yt: y + 2.75, kind: 'glass', pitch: 1.6 });
    ops.S.push({ a0: M.x0 + 0.7, a1: BAY0 - 0.7, yb: y + ST.rise + 0.25, yt: y + ST.rise + 1.65, kind: 'glass', pitch: 1.6 });
    ops.W.push({ a0: M.z0 + 0.5, a1: CORR - 0.4, yb: y + 1.0, yt: y + 2.75, kind: 'glass', pitch: 1.2 });
    // east end: a door out to the gym walkway on the ground floor, windows above
    if (k === 1) ops.E.push({ a0: M.z0 + 0.4, a1: CORR - 0.5, yb: y, yt: y + 2.4, kind: 'door' });
    else ops.E.push({ a0: M.z0 + 0.5, a1: CORR - 0.4, yb: y + 1.0, yt: y + 2.75, kind: 'glass', pitch: 1.2 });
    ops.E.push({ a0: CORR + 0.6, a1: M.z1 - 0.5, yb: y + 0.85, yt: y + 2.95, kind: 'glass', pitch: 1.6 });
    for (const [key, side] of Object.entries(sides)) openWall(ctx, side, ops[key], { ...R, inner: side.axis === 'x' ? [M.x0, M.x1] : [M.z0, M.z1] }, y, y + FH, T);
    // facade: floor bands and pilasters between the bays (south), cornice
    const fb = TB(ctx, xm, M.z1);
    fb.boxMM(M.x0 - T - 0.08, y - 0.12, M.z1 + T - 0.02, M.x1 + T + 0.08, y + 0.1, M.z1 + T + 0.14, { color: BAND, pattern: PAT.CONCRETE });
    fb.boxMM(M.x0 - T - 0.08, y - 0.12, M.z0 - T - 0.14, M.x1 + T + 0.08, y + 0.1, M.z0 - T + 0.02, { color: BAND, pattern: PAT.CONCRETE });
    for (let i = 0; i <= 7; i++) {
      const x = bayX(i);
      fb.boxMM(x - 0.22, y, M.z1 + T - 0.02, x + 0.22, y + FH, M.z1 + T + 0.16, { color: FACADE, pattern: PAT.TILE });
    }
    // floor slab + the ceiling below it (the stair shaft stays open)
    if (k === 1) {
      slabPair(ctx, M.x0, M.z0, M.x1, CORR, y, FLOOR_CORR, PAT.TILE);
      slabPair(ctx, BAY0, CORR, M.x1, M.z1, y, FLOOR_WOOD, PAT.PLANKS);
      slabPair(ctx, M.x0, CORR, BAY0, M.z1, y, FLOOR_CORR, PAT.TILE);
    } else {
      slabPair(ctx, M.x0, M.z0, M.x1, CORR, y, FLOOR_CORR, PAT.TILE, y - (FH - CH));
      slabPair(ctx, BAY0, CORR, M.x1, M.z1, y, FLOOR_WOOD, PAT.PLANKS, y - (FH - CH));
      slabPair(ctx, M.x0, CORR, BAY0, ST.z0, y, FLOOR_CORR, PAT.TILE, y - (FH - CH));
      vrect(IB(ctx, (M.x0 + BAY0) / 2, ST.z0), 'x', ST.z0, M.x0, BAY0, y - (FH - CH), y, 1, 0xe6e2d8, 0);
    }
    floorAt(ctx, M.x0, M.z0, M.x1, CORR + PT / 2, y);
    floorAt(ctx, BAY0, CORR, M.x1, M.z1, y);
    floorAt(ctx, M.x0, CORR, BAY0, ST.z0, y);
    // walls between the corridor and the rooms, and between the rooms
    const row = ROOMS[k];
    for (let i = 0; i < 7; i++) {
      const r = row[i];
      if (!r) continue;
      const a = bayX(i), b = bayX(i + r[2]);
      if (r[1] !== 'entrance') partition(ctx, 'x', CORR, a, b, y, CH, [{ a0: a + 0.5, a1: a + 1.5 }, { a0: b - 1.5, a1: b - 0.5 }]);
      partition(ctx, 'z', a, CORR, M.z1, y, CH);
      if (r[1] !== 'entrance') roomPlate(ctx, r[0], a + 1.0, y);
    }
    // ceiling lights along the corridor
    for (let x = M.x0 + 4; x < M.x1 - 1; x += 6) EB(ctx, x, -48.5).box(x, y + CH - 0.03, -48.5, 1.2, 0.04, 0.22, { color: 0xffffff });
    (ctx.indoorRects = ctx.indoorRects || []).push({ x0: M.x0, x1: M.x1, z0: M.z0, z1: CORR, y0: y - 0.5, y1: y + CH, name: 'school' });
    (ctx.indoorRects = ctx.indoorRects || []).push({ x0: BAY0, x1: M.x1, z0: CORR, z1: M.z1, y0: y - 0.5, y1: y + CH, name: 'school' });
  }
  // the stair shaft is open from the ground floor up to the rooftop stair house
  ctx.indoorRects.push({ x0: M.x0, x1: BAY0, z0: CORR, z1: M.z1, y0: Y1 - 0.5, y1: lvl(5) + 2.9, name: 'school-stairs' });
  buildStairs(ctx);
  buildRoof(ctx);
  for (let k = 1; k <= FLOORS; k++) {
    const row = ROOMS[k];
    for (let i = 0; i < 7; i++) if (row[i]) furnish(ctx, row[i], bayX(i), bayX(i + row[i][2]), lvl(k));
  }
  // entrance: canopy, steps, name plate by the door
  const ex = bayX(3) + BAY / 2;
  const kit = new Kit(ctx, ex, M.z1);
  kit.t.boxMM(bayX(3) - 0.3, Y1 + 2.95, M.z1 + T, bayX(4) + 0.3, Y1 + 3.15, M.z1 + 3.0, { color: 0xe2ded4, pattern: PAT.CONCRETE });
  for (const sx of [bayX(3) + 0.1, bayX(4) - 0.1]) kit.t.boxMM(sx - 0.15, S.yLow, M.z1 + 2.6, sx + 0.15, Y1 + 2.95, M.z1 + 2.9, { color: 0xd9d6ce });
  kit.t.boxMM(bayX(3) - 0.3, S.yLow - 0.2, M.z1 + T, bayX(4) + 0.3, Y1 - 0.02, M.z1 + 1.6, { color: 0xbab6ac, pattern: PAT.PAVING });
  ctx.colliders.addSurface(bayX(3) - 0.3, M.z1, bayX(4) + 0.3, M.z1 + 1.6, () => Y1 - 0.02, 2);
}

// name plate sticking out over a classroom's front door (both faces)
function roomPlate(ctx, name, x, y) {
  const uv = plate(ctx, 'room:' + name, name);
  const z0 = CORR - PT / 2 - 0.36, z1 = CORR - PT / 2 - 0.02;
  IB(ctx, x, CORR).boxMM(x - 0.012, y + 2.25, z0, x + 0.012, y + 2.47, z1, { color: 0xf6f3ea });
  vsign(ctx, 'z', x - 0.013, z0, z1, y + 2.26, y + 2.46, -1, uv, 0.2);
  vsign(ctx, 'z', x + 0.013, z0, z1, y + 2.26, y + 2.46, 1, uv, 0.2);
}

// switchback stairs at the west end: flight A rises south along the west wall to a landing
// at the south end, flight B rises north back to the next floor; a wall runs between them
function buildStairs(ctx) {
  const { xA0, xA1, xB0, xB1, z0, z1, zL, rise, n } = ST;
  const run = (z1 - z0) / n, step = rise / n;
  const b = IB(ctx, (xA0 + xB1) / 2, (z0 + zL) / 2);
  const TREAD = { color: 0xd8d4ca, pattern: PAT.TILE }, NOSE = { color: 0x5f6368 };
  for (let k = 1; k <= FLOORS; k++) {
    const y = lvl(k), under = k > 1;
    for (let i = 0; i < n; i++) {
      // flight A (up toward +z)
      const ta = y + (i + 1) * step, za = z0 + i * run;
      b.boxMM(xA0, ta - 0.32, za, xA1, ta, za + run, TREAD);
      b.boxMM(xA0, ta - 0.005, za, xA1, ta + 0.008, za + 0.05, NOSE);
      // flight B (up toward -z)
      const tb = y + rise + (i + 1) * step, zb = z1 - i * run;
      b.boxMM(xB0, tb - 0.32, zb - run, xB1, tb, zb, TREAD);
      b.boxMM(xB0, tb - 0.005, zb - 0.05, xB1, tb + 0.008, zb, NOSE);
    }
    // landing (and its underside)
    b.boxMM(xA0, y + rise - 0.3, z1, xB1, y + rise, zL, TREAD);
    // handrails on the walls
    for (const [x, za, zb, ya, yb] of [[xA0 + 0.06, z0, z1, y, y + rise], [xB1 - 0.06, z1, z0, y + rise, y + 2 * rise]]) b.rod(V(x, ya + 0.85, za), V(x, yb + 0.85, zb), 0.025, 0.025, 6, 0x8a6a4a);
    const lv = (lo, hi) => ({ min: lo - 0.7, max: hi + 0.7, under });
    ctx.colliders.addSurface(xA0, z0, xA1, z1, (x, z) => y + Math.min(n, Math.max(1, Math.floor((z - z0) / run) + 1)) * step, 4, lv(y, y + rise));
    ctx.colliders.addSurface(xA0, z1, xB1, zL, () => y + rise, 4, lv(y + rise, y + rise));
    ctx.colliders.addSurface(xB0, z0, xB1, z1, (x, z) => y + rise + Math.min(n, Math.max(1, Math.floor((z1 - z) / run) + 1)) * step, 4, lv(y + rise, y + 2 * rise));
  }
  // the wall between the flights, all the way up
  b.boxMM(xA1, Y1, z0, xB0, lvl(5) + 0.9, z1, { color: WALL_IN });
  solid(ctx, xA1 - 0.02, z0, xB0 + 0.02, z1, Y1 - 1, lvl(5) + 3);
  // a store under the first landing and flight B (nobody walks in under the steps);
  // flight A's own first steps stay open
  b.boxMM(xB0, Y1, z0, xB1, Y1 + ST.rise - 0.32, z1, { color: 0xe4e0d6 });
  b.boxMM(xA0, Y1, z1, xB1, Y1 + ST.rise - 0.32, zL, { color: 0xe4e0d6 });
  solid(ctx, xB0, z0, xB1, zL, Y1 - 1, Y1 + ST.rise - 0.34);
  solid(ctx, xA0, z1, xA1, zL, Y1 - 1, Y1 + ST.rise - 0.34);
  // the topmost floor landing (roof level, inside the stair house)
  const yr = lvl(5);
  slabPair(ctx, MAIN.x0, MAIN.z0, BAY0, ST.z0, yr, FLOOR_CORR, PAT.TILE, yr - (FH - CH));
  vrect(IB(ctx, (MAIN.x0 + BAY0) / 2, ST.z0), 'x', ST.z0, MAIN.x0, BAY0, yr - (FH - CH), yr, 1, 0xe6e2d8, 0);
  floorAt(ctx, MAIN.x0, MAIN.z0, BAY0, ST.z0, yr, 4);
}

// flat roof: parapet with a chain-link fence, the stair house with its door, a water tank,
// benches, and the school clock over the entrance
function buildRoof(ctx) {
  const M = MAIN, yr = lvl(5);
  const t = TB(ctx, (M.x0 + M.x1) / 2, (M.z0 + M.z1) / 2);
  const ROOFC = { color: 0xbcb8ae, pattern: PAT.CONCRETE };
  // roof slab over the rooms (the stair house stands over the core)
  t.boxMM(BAY0, yr - (FH - CH), M.z0 - T, M.x1 + T, yr, M.z1 + T, { ...ROOFC, skip: 'y' });
  for (let x = BAY0; x < M.x1 - 0.01; x += 8) {
    for (const [za, zb] of [[M.z0, CORR], [CORR, M.z1]]) hrect(IB(ctx, x, za), x, za, Math.min(M.x1, x + 8), zb, yr - (FH - CH), -1, CEIL, 0);
  }
  floorAt(ctx, BAY0, M.z0 - T, M.x1 + T, M.z1 + T, yr, 3);
  // parapet + fence
  const P = 1.0;
  const edges = [[BAY0 + T, M.z0 - T, M.x1 + T, M.z0 - T + 0.2], [BAY0 + T, M.z1 + T - 0.2, M.x1 + T, M.z1 + T], [M.x1 + T - 0.2, M.z0 - T, M.x1 + T, M.z1 + T]];
  for (const [a, b2, c, d] of edges) {
    t.boxMM(a, yr, b2, c, yr + P, d, { color: FACADE, pattern: PAT.TILE });
    t.boxMM(a - 0.03, yr + P, b2 - 0.03, c + 0.03, yr + P + 0.08, d + 0.03, { color: BAND, pattern: PAT.CONCRETE });
    solid(ctx, a, b2, c, d, yr - 1, yr + 4);
  }
  const mesh = ctx.atlas.cache.get('fence-mesh');
  const fenceRun = (x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0), nn = Math.max(1, Math.round(len / 2.4));
    const fy = yr + P + 0.08, fh = 1.6;
    for (let i = 0; i <= nn; i++) {
      const x = x0 + ((x1 - x0) * i) / nn, z = z0 + ((z1 - z0) * i) / nn;
      t.box(x, fy + fh / 2, z, 0.06, fh, 0.06, { color: 0x5d7a68 });
      if (i < nn && mesh) {
        const xb = x0 + ((x1 - x0) * (i + 1)) / nn, zb = z0 + ((z1 - z0) * (i + 1)) / nn;
        const sb = ctx.builders.get('sign', (x + xb) / 2, (z + zb) / 2);
        const uvs = [[mesh.u0, mesh.v0], [mesh.u1, mesh.v0], [mesh.u1, mesh.v1], [mesh.u0, mesh.v1]];
        sb.quad(V(x, fy + 0.05, z), V(xb, fy + 0.05, zb), V(xb, fy + fh - 0.05, zb), V(x, fy + fh - 0.05, z), 0x5d7a68, 0, { uvs, double: true });
        t.wall(x, z, xb, zb, fy + fh - 0.05, fy + fh, 0.05, { color: 0x5d7a68 });
      }
    }
  };
  fenceRun(BAY0 + T, M.z0 - T + 0.1, M.x1 + T - 0.1, M.z0 - T + 0.1);
  fenceRun(BAY0 + T, M.z1 + T - 0.1, M.x1 + T - 0.1, M.z1 + T - 0.1);
  fenceRun(M.x1 + T - 0.1, M.z0 - T + 0.1, M.x1 + T - 0.1, M.z1 + T - 0.1);
  // stair house over the core, a door onto the roof at its north-east corner
  const hs = 3.0;
  const R = { out: FACADE, outPat: PAT.TILE, inC: WALL_IN, inner: [0, 0] };
  const side = (axis, c, dir, A0, A1, body, skip, ops, inner) => openWall(ctx, { axis, c, dir, A0, A1, body, skip }, ops, { ...R, inner }, yr, yr + hs, T);
  side('x', M.z0, 1, M.x0 - T, BAY0 + T, (a0, a1, yb, yt) => [a0, yb, M.z0 - T, a1, yt, M.z0], 'Z', [], [M.x0, BAY0]);
  side('x', M.z1, -1, M.x0 - T, BAY0 + T, (a0, a1, yb, yt) => [a0, yb, M.z1, a1, yt, M.z1 + T], 'z', [{ a0: M.x0 + 0.7, a1: BAY0 - 0.7, yb: yr + 0.9, yt: yr + 2.2, kind: 'glass', pitch: 1.6 }], [M.x0, BAY0]);
  side('z', M.x0, 1, M.z0, M.z1, (a0, a1, yb, yt) => [M.x0 - T, yb, a0, M.x0, yt, a1], 'X', [], [M.z0, M.z1]);
  side('z', BAY0, -1, M.z0, M.z1, (a0, a1, yb, yt) => [BAY0, yb, a0, BAY0 + T, yt, a1], 'x', [{ a0: M.z0 + 0.4, a1: M.z0 + 1.5, yb: yr, yt: yr + 2.1, kind: 'door' }], [M.z0, M.z1]);
  t.boxMM(M.x0 - T - 0.1, yr + hs, M.z0 - T - 0.1, BAY0 + T + 0.1, yr + hs + 0.35, M.z1 + T + 0.1, { ...ROOFC, skip: 'y' });
  for (let z = M.z0; z < M.z1 - 0.01; z += 6) hrect(IB(ctx, M.x0, z), M.x0, z, BAY0, Math.min(M.z1, z + 6), yr + hs, -1, CEIL, 0);
  // a steel door leaf standing open, and a step
  IB(ctx, BAY0, M.z0).boxMM(BAY0 + T, yr, M.z0 + 1.5, BAY0 + T + 0.9, yr + 2.05, M.z0 + 1.55, { color: 0x8a9196 });
  EB(ctx, BAY0, M.z0).box(BAY0 + T + 0.04, yr + 2.3, M.z0 + 0.95, 0.06, 0.12, 0.3, { color: 0x6ad08a }); // exit light
  // water tank on a frame, outdoor units, benches
  const wx = 403, wz = -44;
  for (const [dx, dz] of [[-1.2, -1], [1.2, -1], [1.2, 1], [-1.2, 1]]) t.box(wx + dx, yr + 0.9, wz + dz, 0.15, 1.8, 0.15, { color: 0x8a8f94 });
  t.boxMM(wx - 1.5, yr + 1.8, wz - 1.3, wx + 1.5, yr + 3.6, wz + 1.3, { color: 0xd9dcd8, pattern: PAT.SEAM });
  solid(ctx, wx - 1.5, wz - 1.3, wx + 1.5, wz + 1.3, yr - 1, yr + 4);
  for (let i = 0; i < 4; i++) {
    const ux = 392 + i * 1.3;
    t.boxMM(ux - 0.45, yr, -49.4, ux + 0.45, yr + 0.7, -48.8, { color: 0xe4e4de });
    t.cyl(ux, yr + 0.35, -48.79, 0.24, 0.24, 0.01, 12, 0x6a6e72);
  }
  solid(ctx, 391.4, -49.5, 396.8, -48.7, yr - 1, yr + 1);
  const rng = new RNG(3101);
  for (const [bx, bz] of [[366, -39.2], [384, -39.2]]) {
    t.boxMM(bx - 0.9, yr + 0.4, bz - 0.22, bx + 0.9, yr + 0.46, bz + 0.22, { color: 0x9a7a5a, pattern: PAT.PLANKS });
    for (const lx of [-0.75, 0.75]) t.boxMM(bx + lx - 0.04, yr, bz - 0.2, bx + lx + 0.04, yr + 0.4, bz + 0.2, { color: 0x6a6e72 });
    ctx.interactables.push({ kind: 'bench', x: bx, z: bz - 0.6, y: yr, r: 1.4, label: '屋上のベンチに座る', sit: { x: bx, y: yr + 0.46, z: bz, yaw: Math.PI } });
    solid(ctx, bx - 0.9, bz - 0.24, bx + 0.9, bz + 0.24, yr - 1, yr + 0.46);
  }
  void rng;
  // the school clock on a panel above the entrance
  const cx = bayX(3) + BAY / 2, cz = M.z1 + T;
  t.boxMM(cx - 1.25, yr - 0.6, cz - 0.3, cx + 1.25, yr + 2.9, cz + 0.12, { color: FACADE, pattern: PAT.TILE });
  t.boxMM(cx - 1.32, yr + 2.9, cz - 0.36, cx + 1.32, yr + 3.05, cz + 0.18, { color: BAND, pattern: PAT.CONCRETE });
  const clock = ctx.atlas.cache.get('clock');
  if (clock) {
    const kit = new Kit(ctx, cx, cz);
    signOnFace(kit, { o: V(cx - 0.95, 0, cz + 0.13), r: V(1, 0, 0), n: V(0, 0, 1), len: 1.9 }, 0.95, yr + 0.35, 1.9, 1.9, 0.0, clock, 0.3);
    ctx.clocks.push({ x: cx, y: yr + 1.3, z: cz + 0.13, off: 0.02, scale: 3.6 });
  }
  // the school's name under the clock
  const nameUV = ctx.atlas2.draw('sch:facade-name', 384, 64, (c, w, h) => {
    c.fillStyle = '#f1eee6';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#2f3a4a';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    fitText(c, '桜ヶ浜高等学校', w * 0.94, h * 0.8, FONTS.mincho, '700');
    c.fillText('桜ヶ浜高等学校', w / 2, h * 0.55);
  });
  const kit2 = new Kit(ctx, cx, cz);
  signOnFace(kit2, { o: V(cx - 1.15, 0, cz + 0.13), r: V(1, 0, 0), n: V(0, 0, 1), len: 2.3 }, 1.15, yr - 0.45, 2.3, 0.38, 0.0, nameUV, 0);
}

// ---------------------------------------------------------------------------
// rooms
// ---------------------------------------------------------------------------
const RZ0 = CORR + PT / 2, RZ1 = MAIN.z1; // room depth (z)
const RZC = (RZ0 + RZ1) / 2;
const DESK = { color: 0xdcc093 }, STEEL = { color: 0x8c9196 }, CHAIR = { color: 0xc9a06c };

function deskAndChair(b, dx, dz, y, rng) {
  b.boxMM(dx - 0.23, y + 0.68, dz - 0.31, dx + 0.23, y + 0.71, dz + 0.31, DESK);
  b.boxMM(dx - 0.2, y + 0.55, dz - 0.28, dx + 0.2, y + 0.58, dz + 0.28, STEEL);
  for (const e of [-1, 1]) b.boxMM(dx - 0.2, y, dz + e * 0.28 - 0.012, dx + 0.2, y + 0.68, dz + e * 0.28 + 0.012, STEEL);
  // the chair behind it (students face -x), pulled out a little or pushed in
  const cx = dx + 0.5 + rng.range(-0.06, 0.1), cz = dz + rng.range(-0.04, 0.04);
  b.boxMM(cx - 0.19, y + 0.42, cz - 0.19, cx + 0.19, y + 0.45, cz + 0.19, CHAIR);
  b.boxMM(cx + 0.17, y + 0.47, cz - 0.18, cx + 0.2, y + 0.82, cz + 0.18, CHAIR);
  for (const e of [-1, 1]) b.boxMM(cx - 0.18, y, cz + e * 0.17 - 0.01, cx + 0.18, y + 0.42, cz + e * 0.17 + 0.01, STEEL);
  // a school bag hanging on the desk hook now and then
  if (rng.next() < 0.35) b.boxMM(dx - 0.1, y + 0.3, dz + 0.31, dx + 0.12, y + 0.62, dz + 0.4, { color: rng.pick([0x2a3550, 0x34302c, 0x5a2a34]) });
}

function lights(ctx, xa, xb, y, rows = [-2.4, 2.4]) {
  for (let x = xa + 1.8; x < xb - 0.8; x += 2.6) for (const dz of rows) EB(ctx, x, RZC).box(x, y + CH - 0.03, RZC + dz, 1.2, 0.04, 0.22, { color: 0xffffff });
}

function curtains(ctx, xa, xb, y) {
  const b = IB(ctx, (xa + xb) / 2, RZ1);
  for (const x of [xa + 0.45, (xa + xb) / 2, xb - 0.45]) b.boxMM(x - 0.16, y + 0.82, RZ1 - 0.14, x + 0.16, y + 2.98, RZ1 - 0.02, { color: 0xefe6cc });
  b.boxMM(xa + 0.2, y + 3.0, RZ1 - 0.1, xb - 0.2, y + 3.04, RZ1 - 0.06, { color: 0xb0b4b8 });
}

function board(ctx, xa, y, uv, w = 5.4) {
  const b = IB(ctx, xa, RZC);
  b.boxMM(xa + PT / 2, y + 0.85, RZC - w / 2 - 0.08, xa + PT / 2 + 0.06, y + 2.17, RZC + w / 2 + 0.08, { color: 0x7a6248 });
  vsign(ctx, 'z', xa + PT / 2 + 0.061, RZC - w / 2, RZC + w / 2, y + 0.9, y + 2.12, 1, uv, 0.15);
  b.boxMM(xa + PT / 2, y + 0.84, RZC - w / 2, xa + PT / 2 + 0.14, y + 0.88, RZC + w / 2, { color: 0x9a8a72 }); // chalk tray
}

function classroom(ctx, name, xa, xb, y) {
  const rng = new RNG(name.charCodeAt(0) * 31 + name.charCodeAt(2) * 7 + Math.round(y));
  const b = IB(ctx, (xa + xb) / 2, RZC);
  const special = name === '2年B組';
  const lines = special
    ? [['4月10日（金）', 0.04, 0.15, 13], ['日直　桜井・春野', 0.04, 0.85, 13], ['ようこそ　2年B組へ！', 0.5, 0.48, 22, 'center']]
    : [['4月10日（金）', 0.04, 0.15, 13], ['日直', 0.04, 0.85, 13], [rng.pick(['数学Ⅱ　p.24〜', '現代文　「こころ」', '英語　Lesson 3', '日本史　鎌倉時代', '物理　等加速度運動', '化学　モル濃度']), 0.5, 0.48, 18, 'center']];
  board(ctx, xa, y, chalkboard(ctx, special ? '2B' : lines[2][0], lines));
  // teacher's platform and lectern
  b.boxMM(xa + PT / 2, y, RZC - 3.1, xa + 1.3, y + 0.18, RZC + 3.1, { color: 0xb08a5a, pattern: PAT.PLANKS });
  floorAt(ctx, xa + PT / 2, RZC - 3.1, xa + 1.3, RZC + 3.1, y + 0.18, 5);
  b.boxMM(xa + 1.55, y + 0.18, RZC - 0.48, xa + 2.1, y + 1.05, RZC + 0.48, { color: 0xa47c52 });
  solid(ctx, xa + 1.55, RZC - 0.48, xa + 2.1, RZC + 0.48, y - 0.5, y + 1.05);
  // 5 rows x 6 columns of desks, facing the board (west)
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 6; c++) {
      const dx = xa + 3.0 + r * 1.15, dz = RZC + (c - 2.5) * 1.3;
      deskAndChair(b, dx, dz, y, rng);
      solid(ctx, dx - 0.25, dz - 0.32, dx + 0.72, dz + 0.32, y - 0.5, y + 0.9);
    }
  }
  // the window seat at the back
  const sx = xa + 3.0 + 4 * 1.15 + 0.5, sz = RZC + 2.5 * 1.3;
  ctx.interactables.push({ kind: 'bench', x: sx + 0.1, z: sz - 0.7, y, r: 0.9, label: special ? '窓際のいちばん後ろの席に座る' : '窓際の席に座る', sit: { x: sx, y: y + 0.45, z: sz, yaw: Math.PI / 2 } });
  ctx.interactables.push({ kind: 'school', what: 'board', x: xa + 1.6, z: RZC - 1.6, y, r: 1.5, label: '黒板を見る', text: special ? '黒板に「日直　桜井・春野」と書いてある。' : '黒板には今日の時間割と、消し忘れの板書。' });
  // lockers at the back, notice board, clock, speaker
  b.boxMM(xb - PT / 2 - 0.42, y, RZ0 + 0.3, xb - PT / 2, y + 1.05, RZ1 - 0.3, { color: 0xb89a70 });
  vsign(ctx, 'z', xb - PT / 2 - 0.421, RZ0 + 0.35, RZ1 - 0.35, y + 0.05, y + 1.0, -1, cubbyTex(ctx), 0.1, 2.2);
  solid(ctx, xb - PT / 2 - 0.42, RZ0 + 0.3, xb - PT / 2, RZ1 - 0.3, y - 0.5, y + 1.05);
  vsign(ctx, 'z', xb - PT / 2 - 0.01, RZC - 2.6, RZC + 2.6, y + 1.35, y + 2.45, -1, noticeTex(ctx), 0.1, 2.6);
  vsign(ctx, 'z', xa + PT / 2 + 0.02, RZC - 0.25, RZC + 0.25, y + 2.42, y + 2.92, 1, clockTex(ctx), 0.1);
  b.boxMM(xa + PT / 2, y + 2.55, RZC + 1.6, xa + PT / 2 + 0.18, y + 2.85, RZC + 2.0, { color: 0xe8e4da });
  curtains(ctx, xa, xb, y);
  lights(ctx, xa, xb, y);
}

function staffRoom(ctx, xa, xb, y) {
  const b = IB(ctx, (xa + xb) / 2, RZC);
  const rng = new RNG(5151);
  board(ctx, xa, y, ctx.atlas2.draw('sch:white', 64, 32, (c, w, h) => {
    c.fillStyle = '#f6f7f4';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#2a5ab0';
    for (let i = 0; i < 6; i++) c.fillRect(4, 4 + i * 4.5, rng.range(20, 54), 1.5);
  }), 4.0);
  // islands of steel desks facing each other
  for (const ix of [xa + 3.2, xa + 8.0, xa + 12.8]) {
    for (let k = 0; k < 3; k++) {
      for (const e of [-1, 1]) {
        const dx = ix + k * 1.15, dz = RZC + e * 0.4;
        b.boxMM(dx - 0.55, y + 0.7, dz - 0.38, dx + 0.55, y + 0.74, dz + 0.38, { color: 0xd7d9d4 });
        b.boxMM(dx - 0.52, y, dz - 0.35, dx - 0.1, y + 0.7, dz + 0.35, { color: 0xb9bcb8 });
        b.boxMM(dx - 0.2, y + 0.74, dz - e * 0.25 - 0.05, dx + 0.2, y + 1.02, dz - e * 0.25 + 0.05, { color: 0x2a2c30 }); // monitor
        if (rng.next() < 0.7) b.boxMM(dx + 0.12, y + 0.74, dz - 0.15, dx + 0.42, y + 0.74 + rng.range(0.03, 0.25), dz + 0.15, { color: 0xf2f0ea }); // paper stacks
        const cz = dz + e * 0.75;
        b.boxMM(dx - 0.24, y + 0.45, cz - 0.24, dx + 0.24, y + 0.52, cz + 0.24, { color: 0x3a4a6a });
        b.boxMM(dx - 0.22, y + 0.52, cz + e * 0.2 - 0.03, dx + 0.22, y + 1.0, cz + e * 0.2 + 0.03, { color: 0x3a4a6a });
        b.box(dx, y + 0.22, cz, 0.06, 0.45, 0.06, STEEL);
      }
    }
    solid(ctx, ix - 0.6, RZC - 0.8, ix + 2.9, RZC + 0.8, y - 0.5, y + 0.8);
  }
  // cabinets along the back wall
  b.boxMM(xb - PT / 2 - 0.45, y, RZ0 + 0.3, xb - PT / 2, y + 1.8, RZ1 - 0.3, { color: 0xc9ccc8 });
  solid(ctx, xb - PT / 2 - 0.45, RZ0 + 0.3, xb - PT / 2, RZ1 - 0.3, y - 0.5, y + 1.8);
  ctx.interactables.push({ kind: 'school', what: 'staff', x: xa + 2.0, z: RZ0 + 0.9, y, r: 1.8, label: '職員室をのぞく', text: '「失礼します…」先生たちは授業中みたい。' });
  lights(ctx, xa, xb, y);
  curtains(ctx, xa, xa + 9, y);
  curtains(ctx, xa + 9, xb, y);
}

function nurseRoom(ctx, xa, xb, y) {
  const b = IB(ctx, (xa + xb) / 2, RZC);
  // two beds along the east wall behind curtains
  for (const bz of [RZC - 2.0, RZC + 1.6]) {
    const bx0 = xb - PT / 2 - 2.1, bx1 = xb - PT / 2 - 0.1;
    b.boxMM(bx0, y, bz - 0.5, bx1, y + 0.45, bz + 0.5, { color: 0xb8bcc0 });
    b.boxMM(bx0 + 0.02, y + 0.45, bz - 0.48, bx1 - 0.02, y + 0.58, bz + 0.48, { color: 0xffffff });
    b.boxMM(bx1 - 0.5, y + 0.58, bz - 0.35, bx1 - 0.1, y + 0.68, bz + 0.35, { color: 0xf2f0ea }); // pillow
    b.boxMM(bx0 + 0.05, y + 0.58, bz - 0.46, bx0 + 1.3, y + 0.62, bz + 0.46, { color: 0xd9ecf0 }); // blanket
    // curtain on its rail (half drawn)
    b.boxMM(bx0 - 0.25, y + 0.25, bz - 0.62, bx0 - 0.21, y + 2.3, bz + 0.15, { color: 0xd4ead2 });
    b.boxMM(bx0 - 0.3, y + 2.3, bz - 0.7, bx1, y + 2.33, bz - 0.66, { color: 0xb0b4b8 });
    solid(ctx, bx0, bz - 0.5, bx1, bz + 0.5, y - 0.5, y + 0.6);
    ctx.interactables.push({ kind: 'bench', x: bx0 - 0.35, z: bz, y, r: 0.9, label: 'ベッドで休む', sit: { x: bx0 + 0.25, y: y + 0.58, z: bz, yaw: -Math.PI / 2 } });
  }
  // desk, medicine cabinet, scale, a sofa
  b.boxMM(xa + 0.5, y, RZ0 + 0.4, xa + 1.9, y + 0.72, RZ0 + 1.1, { color: 0xd7d9d4 });
  solid(ctx, xa + 0.5, RZ0 + 0.4, xa + 1.9, RZ0 + 1.1, y - 0.5, y + 0.8);
  b.boxMM(xa + PT / 2, y, RZC - 0.2, xa + PT / 2 + 0.45, y + 1.9, RZC + 1.4, { color: 0xeef0ec });
  ctx.builders.get('glass', xa + 0.6, RZC).quad(V(xa + PT / 2 + 0.46, y + 1.0, RZC + 1.35), V(xa + PT / 2 + 0.46, y + 1.0, RZC - 0.15), V(xa + PT / 2 + 0.46, y + 1.85, RZC - 0.15), V(xa + PT / 2 + 0.46, y + 1.85, RZC + 1.35), 0xffffff, 0, { uvs: [[0, 0], [1, 0], [1, 1], [0, 1]] });
  solid(ctx, xa + PT / 2, RZC - 0.2, xa + PT / 2 + 0.45, RZC + 1.4, y - 0.5, y + 1.9);
  b.boxMM(xa + 2.6, y, RZ1 - 1.0, xa + 4.4, y + 0.42, RZ1 - 0.3, { color: 0x6a8aa8 });
  b.boxMM(xa + 2.6, y + 0.42, RZ1 - 0.42, xa + 4.4, y + 0.8, RZ1 - 0.3, { color: 0x6a8aa8 });
  solid(ctx, xa + 2.6, RZ1 - 1.0, xa + 4.4, RZ1 - 0.3, y - 0.5, y + 0.6);
  b.boxMM(xa + 2.2, y, RZ0 + 0.5, xa + 2.6, y + 0.08, RZ0 + 0.9, { color: 0xf2f0ea }); // scale
  curtains(ctx, xa, xb, y);
  lights(ctx, xa, xb, y);
}

function libraryRoom(ctx, xa, xb, y) {
  const b = IB(ctx, (xa + xb) / 2, RZC);
  const books = productTex(ctx, 'books');
  for (let i = 0; i < 3; i++) {
    const x = xa + 1.6 + i * 1.6;
    b.boxMM(x - 0.25, y, RZ0 + 0.8, x + 0.25, y + 1.8, RZC + 1.0, { color: 0x9a7a5a, pattern: PAT.PLANKS });
    vsign(ctx, 'z', x - 0.26, RZ0 + 0.85, RZC + 0.95, y + 0.06, y + 1.74, -1, books, 0.2, 1.2);
    vsign(ctx, 'z', x + 0.26, RZ0 + 0.85, RZC + 0.95, y + 0.06, y + 1.74, 1, books, 0.2, 1.2);
    solid(ctx, x - 0.26, RZ0 + 0.8, x + 0.26, RZC + 1.0, y - 0.5, y + 1.8);
    ctx.interactables.push({ kind: 'book', x, z: RZC + 1.6, y, r: 1.4, label: '本棚を眺める' });
  }
  for (const tx of [xa + 2.4, xa + 5.6]) {
    const tz = RZ1 - 1.5;
    b.boxMM(tx - 1.0, y + 0.7, tz - 0.55, tx + 1.0, y + 0.74, tz + 0.55, { color: 0xc49a6a });
    for (const lx of [-0.9, 0.9]) b.boxMM(tx + lx - 0.04, y, tz - 0.5, tx + lx + 0.04, y + 0.7, tz + 0.5, { color: 0x8a6a4a });
    solid(ctx, tx - 1.0, tz - 0.55, tx + 1.0, tz + 0.55, y - 0.5, y + 0.8);
  }
  curtains(ctx, xa, xb, y);
  lights(ctx, xa, xb, y);
}

function councilRoom(ctx, xa, xb, y) {
  const b = IB(ctx, (xa + xb) / 2, RZC);
  board(ctx, xa, y, chalkboard(ctx, 'council', [['文化祭まで　あと', 0.5, 0.35, 20, 'center'], ['48日！', 0.5, 0.7, 30, 'center']]), 3.6);
  const tx = (xa + xb) / 2 + 0.4;
  b.boxMM(tx - 2.2, y + 0.7, RZC - 0.6, tx + 2.2, y + 0.74, RZC + 0.6, { color: 0xc49a6a });
  for (const [lx, lz] of [[-2.1, -0.5], [2.1, -0.5], [2.1, 0.5], [-2.1, 0.5]]) b.box(tx + lx, y + 0.35, RZC + lz, 0.06, 0.7, 0.06, { color: 0x6a5a4a });
  solid(ctx, tx - 2.2, RZC - 0.6, tx + 2.2, RZC + 0.6, y - 0.5, y + 0.8);
  for (let k = 0; k < 4; k++) {
    for (const e of [-1, 1]) {
      const cx = tx - 1.5 + k, cz = RZC + e * 0.95;
      b.boxMM(cx - 0.2, y + 0.42, cz - 0.2, cx + 0.2, y + 0.45, cz + 0.2, CHAIR);
      b.boxMM(cx - 0.19, y + 0.45, cz + e * 0.18 - 0.02, cx + 0.19, y + 0.82, cz + e * 0.18 + 0.02, CHAIR);
      for (const s of [-1, 1]) b.boxMM(cx - 0.18, y, cz + s * 0.17 - 0.01, cx + 0.18, y + 0.42, cz + s * 0.17 + 0.01, STEEL);
    }
  }
  b.boxMM(xb - PT / 2 - 0.4, y, RZ0 + 0.4, xb - PT / 2, y + 1.8, RZ1 - 0.6, { color: 0xb9bcb8 });
  vsign(ctx, 'z', xb - PT / 2 - 0.41, RZ0 + 0.5, RZ1 - 0.7, y + 0.1, y + 1.7, -1, productTex(ctx, 'books'), 0.2, 1.4);
  solid(ctx, xb - PT / 2 - 0.4, RZ0 + 0.4, xb - PT / 2, RZ1 - 0.6, y - 0.5, y + 1.8);
  ctx.interactables.push({ kind: 'school', what: 'council', x: xa + 1.5, z: RZC, y, r: 1.6, label: 'ホワイトボードを見る', text: '「文化祭まで あと48日！」生徒会はもう準備を始めているらしい。' });
  curtains(ctx, xa, xb, y);
  lights(ctx, xa, xb, y);
}

function broadcastRoom(ctx, xa, xb, y) {
  const b = IB(ctx, (xa + xb) / 2, RZC);
  b.boxMM(xa + 0.5, y, RZ1 - 1.4, xb - 0.6, y + 0.75, RZ1 - 0.5, { color: 0x6a6e74 });
  b.boxMM(xa + 1.5, y + 0.75, RZ1 - 1.3, xb - 1.6, y + 0.85, RZ1 - 0.7, { color: 0x2a2c30 }); // mixing desk
  for (let i = 0; i < 24; i++) EB(ctx, xa + 1.7, RZ1 - 1).box(xa + 1.7 + i * 0.22, y + 0.86, RZ1 - 1.0 + (i % 2) * 0.12, 0.05, 0.01, 0.05, { color: i % 5 === 0 ? 0xff5a4a : 0x9fe0ff });
  for (const mx of [xa + 2.5, xa + 5.5]) {
    b.cyl(mx, y + 0.85, RZ1 - 1.6, 0.012, 0.012, 0.45, 6, 0x2a2c30);
    b.box(mx, y + 1.32, RZ1 - 1.6, 0.06, 0.12, 0.06, { color: 0x3a3c40 });
  }
  solid(ctx, xa + 0.5, RZ1 - 1.4, xb - 0.6, RZ1 - 0.5, y - 0.5, y + 0.9);
  b.boxMM(xb - PT / 2 - 0.35, y, RZ0 + 0.4, xb - PT / 2, y + 2.0, RZC + 1.0, { color: 0x8a8f94 });
  vsign(ctx, 'z', xb - PT / 2 - 0.36, RZ0 + 0.5, RZC + 0.9, y + 0.1, y + 1.9, -1, productTex(ctx, 'magazines'), 0.2, 1.2);
  solid(ctx, xb - PT / 2 - 0.35, RZ0 + 0.4, xb - PT / 2, RZC + 1.0, y - 0.5, y + 2.0);
  ctx.interactables.push({ kind: 'school', what: 'broadcast', x: xa + 4, z: RZ1 - 2.2, y, r: 1.6, label: 'マイクのスイッチを見る', text: '「ピンポンパンポーン♪」…スイッチは切ってある。' });
  lights(ctx, xa, xb, y);
}

function musicRoom(ctx, xa, xb, y) {
  const b = IB(ctx, (xa + xb) / 2, RZC);
  board(ctx, xa, y, chalkboard(ctx, 'music', [['𝄞', 0.06, 0.4, 34], ['合唱コンクール　課題曲', 0.55, 0.3, 16, 'center'], ['「さくら」', 0.55, 0.65, 22, 'center']]));
  // a grand piano near the board
  const px = xa + 2.2, pz = RZC + 2.4;
  b.boxMM(px - 0.75, y + 0.65, pz - 0.75, px + 0.75, y + 0.98, pz + 0.75, { color: 0x111214 });
  b.boxMM(px - 0.75, y + 0.65, pz + 0.75, px + 0.1, y + 0.98, pz + 1.3, { color: 0x111214 });
  b.boxMM(px + 0.7, y + 0.92, pz - 0.75, px + 0.95, y + 0.96, pz + 0.75, { color: 0xf4f2ec }); // keys
  for (const [lx, lz] of [[-0.6, -0.6], [0.6, -0.6], [-0.4, 1.1]]) b.box(px + lx, y + 0.33, pz + lz, 0.1, 0.65, 0.1, { color: 0x111214 });
  solid(ctx, px - 0.8, pz - 0.8, px + 1.0, pz + 1.35, y - 0.5, y + 1.0);
  ctx.interactables.push({ kind: 'school', what: 'piano', x: px + 1.3, z: pz, y, r: 1.4, label: 'ピアノを弾く', text: '♪ ポロン…（ドレミファソ…）' });
  // rows of chairs
  const rng = new RNG(707);
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 6; c++) {
      const cx = xa + 4.0 + r * 1.2, cz = RZC + (c - 2.5) * 1.15;
      b.boxMM(cx - 0.2, y + 0.42, cz - 0.2, cx + 0.2, y + 0.45, cz + 0.2, { color: 0x3a3a3a });
      b.boxMM(cx + 0.17, y + 0.45, cz - 0.19, cx + 0.2, y + 0.82, cz + 0.19, { color: 0x3a3a3a });
      for (const s of [-1, 1]) b.boxMM(cx - 0.18, y, cz + s * 0.17 - 0.01, cx + 0.18, y + 0.42, cz + s * 0.17 + 0.01, STEEL);
      void rng;
    }
  }
  solid(ctx, xa + 3.75, RZC - 3.1, xa + 7.95, RZC + 3.1, y - 0.5, y + 0.5);
  // composers on the back wall
  for (let i = 0; i < 4; i++) {
    const zc = RZC - 2.4 + i * 1.6;
    b.boxMM(xb - PT / 2 - 0.04, y + 1.8, zc - 0.3, xb - PT / 2, y + 2.55, zc + 0.3, { color: 0x7a6248 });
    b.boxMM(xb - PT / 2 - 0.05, y + 1.86, zc - 0.24, xb - PT / 2 - 0.04, y + 2.49, zc + 0.24, { color: 0xd8cdb4 });
  }
  curtains(ctx, xa, xb, y);
  lights(ctx, xa, xb, y);
}

function artRoom(ctx, xa, xb, y) {
  const b = IB(ctx, (xa + xb) / 2, RZC);
  const rng = new RNG(808);
  for (const tx of [xa + 2.6, xa + 6.0]) {
    for (const tz of [RZC - 2.0, RZC + 2.0]) {
      b.boxMM(tx - 1.0, y + 0.72, tz - 0.8, tx + 1.0, y + 0.78, tz + 0.8, { color: 0xb08a5a, pattern: PAT.PLANKS });
      for (const [lx, lz] of [[-0.9, -0.7], [0.9, -0.7], [0.9, 0.7], [-0.9, 0.7]]) b.box(tx + lx, y + 0.36, tz + lz, 0.08, 0.72, 0.08, { color: 0x8a6a4a });
      for (let k = 0; k < 4; k++) b.cyl(tx - 0.75 + k * 0.5, y, tz + (k % 2 ? 1.05 : -1.05), 0.16, 0.16, 0.48, 8, 0xa47c52);
      if (rng.next() < 0.8) b.boxMM(tx - 0.3, y + 0.78, tz - 0.2, tx + 0.1, y + 0.8, tz + 0.25, { color: 0xf4f2ea });
      solid(ctx, tx - 1.0, tz - 0.8, tx + 1.0, tz + 0.8, y - 0.5, y + 0.8);
    }
  }
  // easels with canvases by the windows, a plaster bust on a stand
  for (let i = 0; i < 3; i++) {
    const ex = xa + 2.0 + i * 2.4, ez = RZ1 - 0.9;
    b.rod(V(ex - 0.3, y, ez + 0.2), V(ex, y + 1.6, ez), 0.02, 0.02, 4, 0x8a6a4a);
    b.rod(V(ex + 0.3, y, ez + 0.2), V(ex, y + 1.6, ez), 0.02, 0.02, 4, 0x8a6a4a);
    b.boxMM(ex - 0.35, y + 0.8, ez - 0.05, ex + 0.35, y + 1.45, ez - 0.02, { color: rng.pick([0xf2e6c8, 0xdcecf4, 0xf4dce4]) });
  }
  b.boxMM(xa + 0.6, y, RZ0 + 0.6, xa + 1.1, y + 1.0, RZ0 + 1.1, { color: 0xd9d6ce });
  b.cyl(xa + 0.85, y + 1.0, RZ0 + 0.85, 0.12, 0.1, 0.18, 10, 0xf4f2ee);
  b.box(xa + 0.85, y + 1.32, RZ0 + 0.85, 0.24, 0.3, 0.22, { color: 0xf4f2ee });
  solid(ctx, xa + 0.6, RZ0 + 0.6, xa + 1.1, RZ0 + 1.1, y - 0.5, y + 1.4);
  curtains(ctx, xa, xb, y);
  lights(ctx, xa, xb, y);
}

function labRoom(ctx, xa, xb, y) {
  const b = IB(ctx, (xa + xb) / 2, RZC);
  board(ctx, xa, y, chalkboard(ctx, 'lab', [['実験：中和滴定', 0.5, 0.3, 20, 'center'], ['ゴーグル着用！', 0.5, 0.7, 18, 'center']]));
  for (const tx of [xa + 3.2, xa + 6.4]) {
    for (const tz of [RZC - 2.2, RZC, RZC + 2.2]) {
      b.boxMM(tx - 0.9, y, tz - 0.6, tx + 0.9, y + 0.8, tz + 0.6, { color: 0xd9d4c8 });
      b.boxMM(tx - 0.95, y + 0.8, tz - 0.65, tx + 0.95, y + 0.85, tz + 0.65, { color: 0x1e2022 });
      b.boxMM(tx - 0.2, y + 0.82, tz - 0.15, tx + 0.2, y + 0.86, tz + 0.15, { color: 0x8a9196 }); // sink
      b.rod(V(tx, y + 0.85, tz - 0.2), V(tx, y + 1.15, tz - 0.12), 0.015, 0.015, 4, 0xb8bcc0);
      for (const s of [-1, 1]) b.cyl(tx + s * 0.6, y, tz + s * 0.9, 0.16, 0.16, 0.55, 8, 0x9a7a5a);
      solid(ctx, tx - 0.95, tz - 0.65, tx + 0.95, tz + 0.65, y - 0.5, y + 0.9);
    }
  }
  // glass cabinet with flasks along the back wall
  b.boxMM(xb - PT / 2 - 0.4, y, RZ0 + 0.4, xb - PT / 2, y + 1.9, RZ1 - 0.6, { color: 0xc9b89a });
  ctx.builders.get('glass', xb - 0.6, RZC).quad(V(xb - PT / 2 - 0.41, y + 0.9, RZ0 + 0.5), V(xb - PT / 2 - 0.41, y + 0.9, RZ1 - 0.7), V(xb - PT / 2 - 0.41, y + 1.85, RZ1 - 0.7), V(xb - PT / 2 - 0.41, y + 1.85, RZ0 + 0.5), 0xffffff, 0, { uvs: [[0, 0], [1, 0], [1, 1], [0, 1]] });
  for (let i = 0; i < 10; i++) b.cyl(xb - PT / 2 - 0.2, y + 1.3, RZ0 + 0.8 + i * 0.65, 0.06, 0.03, 0.18, 6, 0xd8eef0);
  solid(ctx, xb - PT / 2 - 0.4, RZ0 + 0.4, xb - PT / 2, RZ1 - 0.6, y - 0.5, y + 1.9);
  ctx.interactables.push({ kind: 'school', what: 'lab', x: xa + 4.8, z: RZC + 1.1, y, r: 1.4, label: '実験台を見る', text: 'ビーカーとフラスコがきちんと並んでいる。' });
  curtains(ctx, xa, xb, y);
  lights(ctx, xa, xb, y);
}

// 昇降口: rows of shoe lockers between the doors and the corridor
function entranceHall(ctx, xa, xb, y) {
  const b = IB(ctx, (xa + xb) / 2, RZC);
  const tex = shoeTex(ctx);
  for (const x of [xa + 1.4, xa + 3.4, xb - 3.4, xb - 1.4]) {
    const z0 = RZ0 + 1.6, z1 = RZ1 - 2.6;
    b.boxMM(x - 0.35, y, z0, x + 0.35, y + 1.75, z1, { color: 0xbab7ae });
    vsign(ctx, 'z', x - 0.36, z0 + 0.05, z1 - 0.05, y + 0.08, y + 1.7, -1, tex, 0.1, 1.5);
    vsign(ctx, 'z', x + 0.36, z0 + 0.05, z1 - 0.05, y + 0.08, y + 1.7, 1, tex, 0.1, 1.5);
    solid(ctx, x - 0.36, z0, x + 0.36, z1, y - 0.5, y + 1.75);
  }
  // duckboards by the doors, a notice board, an umbrella stand
  for (let i = 0; i < 6; i++) b.boxMM(xa + 0.6 + i * 1.3, y + 0.002, RZ1 - 2.2, xa + 1.8 + i * 1.3, y + 0.05, RZ1 - 1.2, { color: 0xb08a5a, pattern: PAT.PLANKS });
  vsign(ctx, 'z', xa + PT / 2 + 0.01, RZ0 + 0.6, RZ0 + 3.6, y + 1.2, y + 2.2, 1, noticeTex(ctx), 0.1);
  b.boxMM(xb - 0.9, y, RZ1 - 1.0, xb - 0.3, y + 0.6, RZ1 - 0.5, { color: 0x8a9196 });
  ctx.interactables.push({ kind: 'school', what: 'shoes', x: xa + 2.4, z: RZC, y, r: 1.6, label: '上履きに履き替える', text: '下駄箱で上履きに履き替えた。' });
  lights(ctx, xa, xb, y, [-2.0, 2.0]);
}

function furnish(ctx, room, xa, xb, y) {
  const [name, kind] = room;
  if (kind === 'class') classroom(ctx, name, xa, xb, y);
  else if (kind === 'staff') staffRoom(ctx, xa, xb, y);
  else if (kind === 'nurse') nurseRoom(ctx, xa, xb, y);
  else if (kind === 'library') libraryRoom(ctx, xa, xb, y);
  else if (kind === 'council') councilRoom(ctx, xa, xb, y);
  else if (kind === 'broadcast') broadcastRoom(ctx, xa, xb, y);
  else if (kind === 'music') musicRoom(ctx, xa, xb, y);
  else if (kind === 'art') artRoom(ctx, xa, xb, y);
  else if (kind === 'lab') labRoom(ctx, xa, xb, y);
  else if (kind === 'entrance') entranceHall(ctx, xa, xb, y);
}

// ---------------------------------------------------------------------------
// gym (体育館): a court under steel trusses, a stage with curtains at the east end
// ---------------------------------------------------------------------------
function buildGym(ctx) {
  const G = GYM, y = S.yLow + 0.9, h = 8.6;
  const zDoor = [-49.5, -46.5];
  buildRoom(ctx, {
    name: 'gym', ...G, y, h, out: 0xe9e4d8, outPat: PAT.SEAM, inC: 0xe6dccb, floor: 0xd9b07c, floorPat: PAT.PLANKS, ceil: false, roof: false, base: 0xa9a59c,
    open: {
      W: [{ a0: zDoor[0], a1: zDoor[1], yb: 0, yt: 2.6, kind: 'door' }, { a0: -40, a1: -32, yb: 5.6, yt: 7.8, kind: 'glass', pitch: 2.0 }],
      S: [{ a0: 426, a1: 458, yb: 5.6, yt: 7.8, kind: 'glass', pitch: 2.0 }, { a0: 427, a1: 457, yb: 0.3, yt: 0.9, kind: 'glass', pitch: 1.5 }],
      N: [{ a0: 426, a1: 458, yb: 5.6, yt: 7.8, kind: 'glass', pitch: 2.0 }, { a0: 427, a1: 457, yb: 0.3, yt: 0.9, kind: 'glass', pitch: 1.5 }],
    },
  });
  const b = IB(ctx, (G.x0 + G.x1) / 2, (G.z0 + G.z1) / 2);
  const t = TB(ctx, (G.x0 + G.x1) / 2, (G.z0 + G.z1) / 2);
  const top = y + h, ridge = top + 2.4, zc = (G.z0 + G.z1) / 2;
  // gable roof (ridge along x), sloped ceiling inside, trusses
  const ov = 0.6;
  for (const e of [-1, 1]) {
    const zEave = e < 0 ? G.z0 - T - ov : G.z1 + T + ov;
    const yEave = top - (ov + T) * (2.4 / ((G.z1 - G.z0) / 2));
    const a = V(G.x0 - T - ov, yEave, zEave), bq = V(G.x1 + T + ov, yEave, zEave), c = V(G.x1 + T + ov, ridge, zc), d = V(G.x0 - T - ov, ridge, zc);
    if (e < 0) t.quad(a, bq, c, d, 0x5a7a8a, PAT.CORRUGATED);
    else t.quad(bq, a, d, c, 0x5a7a8a, PAT.CORRUGATED);
    if (e < 0) t.quad(d, c, bq, a, 0x4a5a64, 0);
    else t.quad(c, d, a, bq, 0x4a5a64, 0);
    // inside: sloped ceiling boards
    const ia = V(G.x0, top, e < 0 ? G.z0 : G.z1), ib = V(G.x1, top, e < 0 ? G.z0 : G.z1), ic = V(G.x1, ridge - 0.3, zc), id = V(G.x0, ridge - 0.3, zc);
    if (e < 0) b.quad(ia, ib, ic, id, 0xd8cdb4, PAT.PLANKS);
    else b.quad(ib, ia, id, ic, 0xd8cdb4, PAT.PLANKS);
  }
  // gable ends (outside + inside)
  for (const x of [G.x0 - T, G.x1 + T]) {
    const ins = x < G.x0 ? G.x0 : G.x1;
    const out = x < G.x0 ? -1 : 1;
    const p0 = V(x, top, G.z0 - T), p1 = V(x, top, G.z1 + T), p2 = V(x, ridge, zc);
    if (out < 0) t.tri(p1, p0, p2, 0xe9e4d8, PAT.SEAM);
    else t.tri(p0, p1, p2, 0xe9e4d8, PAT.SEAM);
    const q0 = V(ins, top, G.z0), q1 = V(ins, top, G.z1), q2 = V(ins, ridge - 0.3, zc);
    if (out < 0) b.tri(q0, q1, q2, 0xe6dccb, 0);
    else b.tri(q1, q0, q2, 0xe6dccb, 0);
  }
  for (let x = G.x0 + 3.5; x < G.x1 - 1; x += 7) {
    b.boxMM(x - 0.12, top - 0.15, G.z0, x + 0.12, top + 0.05, G.z1, { color: 0x6a7480 });
    for (const e of [-1, 1]) b.rod(V(x, top, zc + e * 13.5), V(x, ridge - 0.45, zc), 0.08, 0.08, 4, 0x6a7480);
    for (let k = -3; k <= 3; k++) if (k) b.rod(V(x, top, zc + k * 3.9), V(x, top + (2.1 * (4 - Math.abs(k))) / 4, zc + k * 3.9 * 0.5), 0.04, 0.04, 4, 0x6a7480);
    for (const dz of [-6, 0, 6]) EB(ctx, x, zc + dz).cyl(x, top - 1.2, zc + dz, 0.32, 0.22, 0.25, 10, 0xfffbe8);
  }
  // court lines
  const L = (x0, z0, x1, z1, col = 0xf4f2ea) => hrect(b, Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1), y + 0.004, 1, col, 0);
  const cx0 = 428, cx1 = 456, cz0 = zc - 7.5, cz1 = zc + 7.5, lw = 0.05;
  L(cx0, cz0, cx1, cz0 + lw);
  L(cx0, cz1 - lw, cx1, cz1);
  L(cx0, cz0, cx0 + lw, cz1);
  L(cx1 - lw, cz0, cx1, cz1);
  L(442 - lw / 2, cz0, 442 + lw / 2, cz1);
  for (const [xa, dir] of [[cx0, 1], [cx1, -1]]) {
    const xk = xa + dir * 5.8;
    L(Math.min(xa, xk), zc - 2.45, Math.max(xa, xk), zc - 2.45 + lw, 0xf2c94a);
    L(Math.min(xa, xk), zc + 2.45 - lw, Math.max(xa, xk), zc + 2.45, 0xf2c94a);
    L(xk - lw / 2, zc - 2.45, xk + lw / 2, zc + 2.45, 0xf2c94a);
    // three point arc (polyline)
    let prev = null;
    for (let i = 0; i <= 16; i++) {
      const a = -Math.PI / 2 + (i / 16) * Math.PI;
      const p = [xa + dir * (1.575 + Math.cos(a) * 6.75), zc + Math.sin(a) * 6.75];
      if (Math.abs(p[1] - zc) > 7.4) {
        prev = null;
        continue;
      }
      if (prev) {
        const len = Math.hypot(p[0] - prev[0], p[1] - prev[1]);
        b.box((prev[0] + p[0]) / 2, y + 0.006, (prev[1] + p[1]) / 2, len + 0.02, 0.004, lw, { color: 0xf4f2ea, ry: -Math.atan2(p[1] - prev[1], p[0] - prev[0]) });
      }
      prev = p;
    }
  }
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    b.box(442 + Math.cos(a) * 1.8, y + 0.006, zc + Math.sin(a) * 1.8, lw, 0.004, 0.48, { color: 0xf4f2ea, ry: -a });
  }
  // baskets hanging from the trusses at both ends of the court
  const hoops = [];
  for (const [bx, dir] of [[cx0 - 1.0, 1], [cx1 + 1.0, -1]]) {
    b.boxMM(bx - 0.03, y + 2.9, zc - 0.9, bx + 0.03, y + 3.95, zc + 0.9, { color: 0xf4f6f6 });
    b.boxMM(bx - 0.035, y + 3.05, zc - 0.3, bx + 0.035, y + 3.5, zc - 0.27, { color: 0xd84a3a });
    b.boxMM(bx - 0.035, y + 3.05, zc + 0.27, bx + 0.035, y + 3.5, zc + 0.3, { color: 0xd84a3a });
    b.boxMM(bx - 0.035, y + 3.47, zc - 0.3, bx + 0.035, y + 3.5, zc + 0.3, { color: 0xd84a3a });
    const rx = bx + dir * 0.4;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      b.box(rx + Math.cos(a) * 0.23, y + 3.05, zc + Math.sin(a) * 0.23, 0.04, 0.03, 0.13, { color: 0xe8603a, ry: -a });
    }
    b.rod(V(bx, y + 3.95, zc), V(bx - dir * 1.5, top - 0.1, zc), 0.05, 0.05, 4, 0x6a7480);
    hoops.push(V(rx, y + 3.05, zc));
  }
  // stage at the east end
  const sx0 = 459.5, sh = 1.0;
  b.boxMM(sx0, y, G.z0 + 3, G.x1, y + sh, G.z1 - 3, { color: 0xb88a58, pattern: PAT.PLANKS });
  floorAt(ctx, sx0, G.z0 + 3, G.x1, G.z1 - 3, y + sh, 4);
  solid(ctx, sx0 - 0.05, G.z0 + 3, sx0 + 0.2, G.z1 - 3, y - 0.5, y + sh);
  // steps up to the stage at its north end
  for (let i = 0; i < 3; i++) b.boxMM(sx0 - 0.9 + i * 0.3, y, G.z0 + 1.1, sx0 + 0.6, y + (i + 1) * (sh / 3), G.z0 + 3, { color: 0xb88a58, pattern: PAT.PLANKS });
  ctx.colliders.addSurface(sx0 - 0.9, G.z0 + 1.1, sx0 + 0.6, G.z0 + 3, (x) => y + Math.min(3, Math.max(1, Math.ceil((x - (sx0 - 0.9)) / 0.3))) * (sh / 3), 5);
  // curtains: valance and the side curtains drawn back
  b.boxMM(sx0 - 0.3, y + 5.6, G.z0 + 2.6, sx0 - 0.1, y + 6.4, G.z1 - 2.6, { color: 0x8a1f2a });
  for (const [za, zb] of [[G.z0 + 3, G.z0 + 5], [G.z1 - 5, G.z1 - 3]]) b.boxMM(sx0 - 0.25, y + sh, za, sx0 - 0.05, y + 6.2, zb, { color: 0x9a2a34 });
  b.boxMM(G.x1 - 0.05, y + 3.2, zc - 0.9, G.x1, y + 5.0, zc + 0.9, { color: 0x7a2a34 });
  const emblem = ctx.atlas2.draw('sch:emblem', 128, 128, (c, w, hh) => {
    c.clearRect(0, 0, w, hh);
    c.fillStyle = '#f6d6e0';
    c.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
      c.ellipse(w / 2 + Math.cos(a) * w * 0.2, hh / 2 + Math.sin(a) * hh * 0.2, w * 0.17, hh * 0.12, a + Math.PI / 2, 0, Math.PI * 2);
    }
    c.fill();
    c.fillStyle = '#c84a6a';
    c.font = `700 ${w * 0.26}px ${FONTS.mincho}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('高', w / 2, hh / 2 + 2);
  });
  vsign(ctx, 'z', G.x1 - 0.06, zc - 0.8, zc + 0.8, y + 3.3, y + 4.9, -1, emblem, 0.2);
  ctx.interactables.push({ kind: 'school', what: 'stage', x: sx0 + 2, z: zc, y: y + sh, r: 2.2, label: '舞台に立つ', text: '体育館の舞台から見ると、思ったより広い。' });
  // a ball cart by the west door; throwing a ball at the basket
  b.boxMM(G.x0 + 0.6, y, zc + 3, G.x0 + 1.4, y + 0.7, zc + 4, { color: 0x6a7480 });
  for (let i = 0; i < 6; i++) b.cyl(G.x0 + 0.8 + (i % 3) * 0.25, y + 0.6, zc + 3.25 + Math.floor(i / 3) * 0.4, 0.12, 0.12, 0.24, 10, 0xd8762a);
  solid(ctx, G.x0 + 0.6, zc + 3, G.x0 + 1.4, zc + 4, y - 0.5, y + 0.8);
  ctx.interactables.push({ kind: 'school', what: 'ball', x: cx0 + 5.8, z: zc, y, r: 1.6, label: 'シュートする', hoop: hoops[0] });
  ctx.gymHoops = hoops;
  // the covered walkway from the main building's east door (it rises gently)
  const wx0 = MAIN.x1 + T, wx1 = G.x0 - T, wz0 = zDoor[0] - 0.4, wz1 = zDoor[1] + 0.4;
  const yA = Y1, yB = y;
  t.quad(V(wx0, yA - 0.02, wz1), V(wx1, yB - 0.02, wz1), V(wx1, yB - 0.02, wz0), V(wx0, yA - 0.02, wz0), 0xc9c4b8, PAT.PAVING);
  t.boxMM(wx0, S.yLow - 0.3, wz0 - 0.02, wx1, Math.min(yA, yB) - 0.05, wz1 + 0.02, { color: 0xa9a59c, pattern: PAT.CONCRETE });
  ctx.colliders.addSurface(wx0 - 0.3, wz0, wx1 + 0.3, wz1, (x) => yA + ((yB - yA) * Math.min(1, Math.max(0, (x - wx0) / (wx1 - wx0)))), 3);
  for (let x = wx0 + 0.4; x < wx1; x += 3.1) {
    for (const z of [wz0 - 0.15, wz1 + 0.15]) t.box(x, (yA + yB) / 2 + 1.35, z, 0.12, 2.9, 0.12, { color: 0x9aa2a8 });
    ctx.colliders.addCircle(x, wz0 - 0.15, 0.1);
    ctx.colliders.addCircle(x, wz1 + 0.15, 0.1);
  }
  t.boxMM(wx0, Math.max(yA, yB) + 2.8, wz0 - 0.5, wx1, Math.max(yA, yB) + 3.0, wz1 + 0.5, { color: 0xd9dcd8, pattern: PAT.METAL });
  (ctx.indoorRects = ctx.indoorRects || []).push({ x0: G.x0, x1: G.x1, z0: G.z0, z1: G.z1, y0: y - 0.5, y1: top, name: 'gym' });
  // basketball: a ball flies from wherever you stand to the nearer basket
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), new THREE.MeshBasicMaterial({ color: 0xd8762a }));
  ball.visible = false;
  ctx.scene.add(ball);
  let shot = null;
  ctx.gym = {
    shoot(from) {
      const hoop = hoops.reduce((a, q) => (a.distanceTo(from) < q.distanceTo(from) ? a : q));
      const p0 = from.clone().add(V(0, 1.7, 0));
      const dist = Math.hypot(hoop.x - p0.x, hoop.z - p0.z);
      shot = { p0, p1: hoop.clone().add(V(0, 0.05, 0)), t: 0, dur: 0.7 + dist * 0.06, peak: Math.max(hoop.y, p0.y) + 1.2 + dist * 0.12, make: dist < 7.5 && Math.random() < 0.8 - dist * 0.06 };
      if (!shot.make) shot.p1.add(V((Math.random() - 0.5) * 0.9, 0, (Math.random() - 0.5) * 0.9));
      ball.visible = true;
      return shot.make;
    },
  };
  ctx.updaters.push((tt, dt) => {
    if (!shot) return;
    shot.t += dt / shot.dur;
    const k = Math.min(1, shot.t);
    const x = shot.p0.x + (shot.p1.x - shot.p0.x) * k, z = shot.p0.z + (shot.p1.z - shot.p0.z) * k;
    const yy = (1 - k) * (1 - k) * shot.p0.y + 2 * (1 - k) * k * (2 * shot.peak - (shot.p0.y + shot.p1.y) / 2) + k * k * shot.p1.y;
    ball.position.set(x, yy, z);
    ball.rotation.x += dt * 8;
    if (shot.t >= 1) {
      // drop through the net (or bounce off the rim) to the floor
      shot.fall = (shot.fall ?? 0) + dt;
      ball.position.y = Math.max(y + 0.12, shot.p1.y - 4.9 * shot.fall * shot.fall);
      if (shot.fall > 1.4) {
        shot = null;
        ball.visible = false;
      }
    }
  });
}

// ---------------------------------------------------------------------------
// the campus: retaining wall and steps up to the ground, the ground, gate, fences, trees
// ---------------------------------------------------------------------------
function buildGrounds(ctx) {
  const g = ctx.ground, yL = S.yLow, yH = S.yHigh;
  const [w0, w1] = S.wall;
  const t = TB(ctx, (S.x0 + S.x1) / 2, w0);
  const rng = new RNG(1104);
  // ground paint: the sports ground, paths and the forecourt
  g.rect(S.x0 + 2, S.z0 + 2, S.x1 - 2, w0 - 0.4, 0xcdb88e, PAT.SAND, { jitter: 0.05 });
  g.rect(372, MAIN.z1 + 0.3, 387, S.z1, 0xc9c3b8, PAT.PAVING, { jitter: 0.04 });
  g.rect(S.x0 + 1, MAIN.z1 + 2.5, S.x1 - 1, MAIN.z1 + 5.5, 0xc9c3b8, PAT.PAVING, { jitter: 0.04 });
  g.rect(S.x0 + 1, MAIN.z0 - 9.6, S.x1 - 1, MAIN.z0 - 0.3, 0xc4bdb0, PAT.PAVING, { jitter: 0.04 });
  g.rect(S.x0 + 1, MAIN.z0 - 0.3, MAIN.x0 - 0.4, MAIN.z1 + 2.5, 0xc4bdb0, PAT.PAVING, { jitter: 0.04 });
  g.rect(MAIN.x1 + 0.4, MAIN.z0 - 9.6, S.x1 - 1, MAIN.z1 + 5.5, 0xc4bdb0, PAT.PAVING, { jitter: 0.04 });

  // retaining wall between the terraces, steps up in the middle
  const SX = [376, 380];
  for (const [a, b2] of [[S.x0, SX[0]], [SX[1], S.x1]]) {
    t.boxMM(a, yL - 0.6, w0, b2, yH, w1, { color: 0xb9b5ab, pattern: PAT.CONCRETE, ao: 0.15 });
    solid(ctx, a, w1 - 0.3, b2, w1, yL - 1, yH - 0.2);
  }
  ctx.colliders.addSurface(S.x0, w0 - 0.2, S.x1, w1, () => yH, 2);
  const nSt = 20, run = 5.6 / nSt, rise = (yH - yL) / nSt, sz0 = w1 + 5.6;
  for (let i = 0; i < nSt; i++) {
    const top = yL + (i + 1) * rise, za = sz0 - (i + 1) * run;
    t.boxMM(SX[0], yL - 0.3, za, SX[1], top, za + run, { color: 0xc9c5bb, pattern: PAT.CONCRETE });
  }
  ctx.colliders.addSurface(SX[0], w1, SX[1], sz0, (x, z) => yL + Math.min(nSt, Math.max(1, Math.ceil((sz0 - z) / run))) * rise, 3);
  ctx.colliders.addSurface(SX[0], w0 - 0.2, SX[1], w1, () => yH, 3);
  for (const x of [SX[0] - 0.15, SX[1] + 0.15]) {
    t.boxMM(x - 0.15, yL - 0.3, w1, x + 0.15, yH + 0.9, sz0, { color: 0xb9b5ab, pattern: PAT.CONCRETE });
    t.rod(V(x, yL + 0.95, sz0), V(x, yH + 0.95, w1), 0.03, 0.03, 6, 0x9aa2a8);
    solid(ctx, x - 0.15, w1, x + 0.15, sz0, yL - 1, yH + 0.9);
  }
  // fence along the top of the wall (open at the steps)
  for (const [a, b2] of [[S.x0, SX[0] - 0.3], [SX[1] + 0.3, S.x1]]) {
    metalFence(t, a, w1 - 0.15, b2, w1 - 0.15, () => yH, 1.1, 0x4f7a5a, { base: false });
    solid(ctx, a, w1 - 0.25, b2, w1 - 0.05, yH - 0.5, yH + 1.2);
  }
  // drinking fountain by the steps
  t.boxMM(381.5, yL, w1 + 2.0, 385.5, yL + 0.8, w1 + 2.7, { color: 0xc9c5bb, pattern: PAT.CONCRETE });
  for (let i = 0; i < 4; i++) t.rod(V(382 + i, yL + 0.8, w1 + 2.35), V(382 + i, yL + 1.0, w1 + 2.4), 0.02, 0.02, 4, 0xb8bcc0);
  solid(ctx, 381.5, w1 + 2.0, 385.5, w1 + 2.7, yL - 1, yL + 0.8);

  // the 200 m track: four lanes around an oval, white lines on the dirt
  const tc = [403, (S.z0 + w0) / 2], half = 26, r0 = 15;
  const ln = ctx.builders.get('detail', tc[0], tc[1]);
  const seg = (x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    ln.box((x0 + x1) / 2, yH + 0.012, (z0 + z1) / 2, len + 0.03, 0.01, 0.07, { color: 0xf6f4ee, ry: -Math.atan2(z1 - z0, x1 - x0) });
  };
  for (let k = 0; k < 5; k++) {
    const r = r0 + k * 1.2;
    seg(tc[0] - half, tc[1] - r, tc[0] + half, tc[1] - r);
    seg(tc[0] - half, tc[1] + r, tc[0] + half, tc[1] + r);
    for (const e of [-1, 1]) {
      let prev = null;
      for (let i = 0; i <= 20; i++) {
        const a = -Math.PI / 2 + (i / 20) * Math.PI;
        const p = [tc[0] + e * (half + Math.cos(a) * r), tc[1] + Math.sin(a) * r];
        if (prev) seg(prev[0], prev[1], p[0], p[1]);
        prev = p;
      }
    }
  }
  seg(tc[0] + 4, tc[1] + r0, tc[0] + 4, tc[1] + r0 + 4.8); // start / finish
  // goals at the ends of the infield, a backstop in the corner
  const net = ctx.atlas.cache.get('fence-mesh');
  const netQuad = (a, bq, c, d) => {
    if (!net) return;
    const sb = ctx.builders.get('sign', (a.x + c.x) / 2, (a.z + c.z) / 2);
    sb.quad(a, bq, c, d, 0xe8ece8, 0, { uvs: [[net.u0, net.v0], [net.u1, net.v0], [net.u1, net.v1], [net.u0, net.v1]], double: true });
  };
  for (const [gx, dir] of [[tc[0] - half + 1.5, -1], [tc[0] + half - 1.5, 1]]) {
    const z0 = tc[1] - 2.5, z1 = tc[1] + 2.5, back = gx + dir * 1.5;
    for (const z of [z0, z1]) {
      t.box(gx, yH + 1.0, z, 0.1, 2.0, 0.1, { color: 0xf6f6f2 });
      t.rod(V(gx, yH + 2.0, z), V(back, yH, z), 0.03, 0.03, 4, 0xf6f6f2);
      ctx.colliders.addCircle(gx, z, 0.1);
    }
    t.box(gx, yH + 2.0, tc[1], 0.1, 0.1, 5.0, { color: 0xf6f6f2 });
    netQuad(V(back, yH, z0), V(back, yH, z1), V(gx, yH + 2.0, z1), V(gx, yH + 2.0, z0));
  }
  const bs = [S.x0 + 4, S.z0 + 4];
  for (const [x0, z0, x1, z1] of [[bs[0], bs[1], bs[0] + 12, bs[1]], [bs[0], bs[1], bs[0], bs[1] + 12]]) {
    const n = 4;
    for (let i = 0; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n, z = z0 + ((z1 - z0) * i) / n;
      t.cyl(x, yH, z, 0.08, 0.08, 7.0, 6, 0x6a7a70);
      ctx.colliders.addCircle(x, z, 0.12);
      if (i < n) {
        const xb = x0 + ((x1 - x0) * (i + 1)) / n, zb = z0 + ((z1 - z0) * (i + 1)) / n;
        netQuad(V(x, yH + 0.3, z), V(xb, yH + 0.3, zb), V(xb, yH + 7.0, zb), V(x, yH + 7.0, z));
      }
    }
  }
  g.circle(bs[0] + 7, bs[1] + 7, 5.5, 0xbfa070, PAT.SAND, { jitter: 0.05 });
  // assembly stand, horizontal bars, a sandpit, the sports store
  const as = [tc[0], w0 - 2.4];
  t.boxMM(as[0] - 1.4, yH, as[1] - 1.0, as[0] + 1.4, yH + 1.2, as[1] + 1.0, { color: 0x8a9aa6, pattern: PAT.METAL });
  for (let i = 0; i < 4; i++) t.boxMM(as[0] - 0.5, yH, as[1] + 1.0 + i * 0.3, as[0] + 0.5, yH + 1.2 - i * 0.3, as[1] + 1.3 + i * 0.3, { color: 0x8a9aa6, pattern: PAT.METAL });
  ctx.colliders.addSurface(as[0] - 1.4, as[1] - 1.0, as[0] + 1.4, as[1] + 1.0, () => yH + 1.2, 4);
  ctx.colliders.addSurface(as[0] - 0.5, as[1] + 1.0, as[0] + 0.5, as[1] + 2.2, (x, z) => yH + 1.2 - Math.min(3, Math.floor((z - as[1] - 1.0) / 0.3)) * 0.3, 4);
  ctx.interactables.push({ kind: 'school', what: 'stand', x: as[0], z: as[1] + 2.4, y: yH, r: 1.8, label: '朝礼台に上がる', text: '朝礼台からは校庭がぜんぶ見渡せる。' });
  for (let i = 0; i < 3; i++) {
    const bx = S.x0 + 8 + i * 2.6, bz = w0 - 4, hh = 1.2 + i * 0.25;
    for (const dx of [-1.1, 1.1]) t.box(bx + dx, yH + hh / 2, bz, 0.08, hh, 0.08, { color: 0x6a7480 });
    t.rod(V(bx - 1.1, yH + hh, bz), V(bx + 1.1, yH + hh, bz), 0.025, 0.025, 6, 0xb8bcc0);
    for (const dx of [-1.1, 1.1]) ctx.colliders.addCircle(bx + dx, bz, 0.08);
  }
  g.rect(S.x1 - 16, w0 - 6, S.x1 - 6, w0 - 1.5, 0xd9c79c, PAT.SAND, { jitter: 0.06 });
  t.boxMM(S.x1 - 12, yH, S.z0 + 2, S.x1 - 3, yH + 3.2, S.z0 + 8, { color: 0xc9c5bb, pattern: PAT.SEAM });
  t.boxMM(S.x1 - 12.3, yH + 3.2, S.z0 + 1.7, S.x1 - 2.7, yH + 3.4, S.z0 + 8.3, { color: 0x6a7480, pattern: PAT.METAL });
  t.boxMM(S.x1 - 10, yH, S.z0 + 8, S.x1 - 5, yH + 2.4, S.z0 + 8.04, { color: 0x9aa2a8, pattern: PAT.CORRUGATED });
  solid(ctx, S.x1 - 12, S.z0 + 2, S.x1 - 3, S.z0 + 8, yH - 1, yH + 3.4);
  for (let i = 0; i < 4; i++) {
    const bx = 350 + i * 13;
    t.boxMM(bx - 0.9, yH + 0.4, w0 - 1.2, bx + 0.9, yH + 0.46, w0 - 0.8, { color: 0x9a7a5a, pattern: PAT.PLANKS });
    for (const lx of [-0.75, 0.75]) t.boxMM(bx + lx - 0.04, yH, w0 - 1.18, bx + lx + 0.04, yH + 0.4, w0 - 0.82, { color: 0x6a6e72 });
    ctx.interactables.push({ kind: 'bench', x: bx, z: w0 - 1.6, y: yH, r: 1.2, label: 'ベンチに座る', sit: { x: bx, y: yH + 0.46, z: w0 - 1.0, yaw: 0 } });
    solid(ctx, bx - 0.9, w0 - 1.22, bx + 0.9, w0 - 0.78, yH - 1, yH + 0.46);
  }

  // campus fence along the streets; tall ball nets behind the ground
  const sideY = (x, z) => roadSurfaceY(x, z);
  const fence = (x0, z0, x1, z1) => {
    metalFence(t, x0, z0, x1, z1, sideY, 1.5, 0x2f3a34);
    ctx.colliders.addSegment(x0, z0, x1, z1, 0.2);
  };
  const GATE = [376.2, 382.8];
  fence(S.x0 - 1.4, S.z1 + 1.9, GATE[0] - 0.4, S.z1 + 1.9);
  fence(GATE[1] + 0.4, S.z1 + 1.9, S.x1 + 0.4, S.z1 + 1.9);
  fence(S.x0 - 1.4, S.z0 - 0.9, S.x0 - 1.4, S.z1 + 1.9);
  fence(S.x1 + 0.4, S.z0 - 0.9, S.x1 + 0.4, S.z1 + 1.9);
  for (const [x0, z0, x1, z1] of [[S.x0 - 1.2, S.z0 - 0.8, S.x1 + 0.3, S.z0 - 0.8], [S.x1 + 0.3, S.z0 - 0.8, S.x1 + 0.3, w0]]) {
    const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / 6));
    for (let i = 0; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n, z = z0 + ((z1 - z0) * i) / n;
      const y0 = Math.max(groundH(x, z), sideY(x, z));
      t.cyl(x, y0 - 0.3, z, 0.07, 0.07, 9.3, 6, 0x5d7a68);
      if (i < n) {
        const xb = x0 + ((x1 - x0) * (i + 1)) / n, zb = z0 + ((z1 - z0) * (i + 1)) / n;
        const yb = Math.max(groundH(xb, zb), sideY(xb, zb));
        netQuad(V(x, y0 + 1.8, z), V(xb, yb + 1.8, zb), V(xb, yb + 9.0, zb), V(x, y0 + 9.0, z));
      }
    }
  }

  // the gate: steps up from the sidewalk, posts with the school's name
  const sy0 = roadSurfaceY(379.5, S.z1 + 2.05), nG = 7, rG = (yL - sy0) / nG, runG = 2.0 / nG;
  for (let i = 0; i < nG; i++) {
    const top = sy0 + (i + 1) * rG, zb = S.z1 + 2.0 - i * runG;
    t.boxMM(GATE[0], sy0 - 0.4, zb - runG, GATE[1], top, zb, { color: 0xc9c5bb, pattern: PAT.CONCRETE });
  }
  ctx.colliders.addSurface(GATE[0], S.z1, GATE[1], S.z1 + 2.05, (x, z) => sy0 + Math.min(nG, Math.max(1, Math.ceil((S.z1 + 2.05 - z) / runG))) * rG, 4);
  for (const x of [GATE[0], GATE[1]]) {
    t.boxMM(x - 0.3, sy0 - 0.4, S.z1 - 0.6, x + 0.3, yL + 2.0, S.z1, { color: 0xb8b2a6, pattern: PAT.STONE });
    t.boxMM(x - 0.36, yL + 2.0, S.z1 - 0.66, x + 0.36, yL + 2.12, S.z1 + 0.06, { color: 0x8a867e });
    solid(ctx, x - 0.3, S.z1 - 0.6, x + 0.3, S.z1 + 2.05, sy0 - 1, yL + 2.1);
  }
  const nameV = ctx.atlas2.draw('sch:gate-name', 64, 320, (c, w, hh) => drawVertical(c, w, hh, { text: '桜ヶ浜高等学校', bg: '#efe6d2', fg: '#2a2a2a', font: FONTS.mincho, border: '#6a5a44' }));
  const gk = new Kit(ctx, GATE[0], S.z1);
  signOnFace(gk, { o: V(GATE[0] - 0.2, 0, S.z1 + 0.01), r: V(1, 0, 0), n: V(0, 0, 1), len: 0.4 }, 0.2, yL + 0.3, 0.32, 1.55, 0.0, nameV, 0);
  ctx.interactables.push({ kind: 'school', what: 'gate', x: 379.5, z: S.z1 + 2.6, y: sy0, r: 2.2, label: '校門を見上げる', text: '桜ヶ浜高等学校。校門の桜がちょうど満開だ。' });
  // a sliding gate pushed back behind the east post
  t.boxMM(GATE[1] + 0.3, yL, S.z1 - 0.5, GATE[1] + 4.6, yL + 1.4, S.z1 - 0.4, { color: 0x6a6e72, pattern: PAT.LATTICE });

  // sakura along the front, flower beds by the entrance, a flagpole, bicycle shed
  for (let x = S.x0 + 4; x < S.x1 - 3; x += 9.5) {
    if (x > 370 && x < 389) continue;
    ctx.trees.push({ kind: 'sakura', x: x + rng.range(-0.6, 0.6), z: S.z1 - 2.6, y: yL, seed: rng.int(1, 1e9), scale: rng.range(0.92, 1.05) });
  }
  for (const z of [S.z0 + 14, S.z0 + 32]) ctx.trees.push({ kind: 'sakura', x: S.x0 + 3.2, z, y: yH, seed: rng.int(1, 1e9), scale: 0.9 });
  for (const x of [S.x0 + 20, S.x0 + 36, S.x1 - 30]) ctx.trees.push({ kind: 'broadleaf', x, z: w1 + 3.2, y: yL, seed: rng.int(1, 1e9), scale: 0.85 });
  for (const [x0, x1] of [[365.5, 375.6], [383.4, 394]]) {
    const zb = MAIN.z1 + T + 1.0;
    t.boxMM(x0, yL, zb, x1, yL + 0.3, zb + 1.1, { color: 0xb4b0a8, pattern: PAT.STONE });
    g.rect(x0, zb, x1, zb + 1.1, 0x6e5440, PAT.DIRT);
    for (let x = x0 + 0.5; x < x1 - 0.3; x += 0.9) shrub(x, yL + 0.55, zb + 0.55, 0.36, 0.3, rng, { cards: 4, size: 0.3, flowers: [rng.pick(AZALEA)], flowerCards: 3 });
    solid(ctx, x0, zb, x1, zb + 1.1, yL - 1, yL + 0.6);
  }
  for (const x of [369, 390]) for (const z of [S.z1 - 7.5]) flowers(x, yL + 0.15, z, 1.2, 0.2, rng, { cols: GARDEN_FLOWERS, n: 8, mixed: true });
  const fp = [368, MAIN.z1 + 6.5];
  t.boxMM(fp[0] - 0.7, yL, fp[1] - 0.7, fp[0] + 0.7, yL + 0.4, fp[1] + 0.7, { color: 0xb8b2a6, pattern: PAT.STONE });
  t.cyl(fp[0], yL + 0.4, fp[1], 0.07, 0.05, 9.5, 8, 0xd8dcdc);
  ctx.builders.get('detail', fp[0], fp[1]).boxMM(fp[0] + 0.07, yL + 8.2, fp[1] - 0.02, fp[0] + 1.6, yL + 9.2, fp[1] + 0.02, { color: 0xf6f4ee });
  ctx.colliders.addBox(fp[0], fp[1], 0.7, 0.7, 0, yL + 0.4);
  // bicycle shed (駐輪場) with rows of bikes
  const bx0 = S.x0 + 2, bx1 = S.x0 + 20, bz0 = MAIN.z1 + 4, bz1 = MAIN.z1 + 10;
  for (let x = bx0; x <= bx1 + 0.01; x += 3) for (const z of [bz0, bz1]) t.box(x, yL + 1.25, z, 0.1, 2.5, 0.1, { color: 0x8a9196 });
  t.quad(V(bx0 - 0.3, yL + 2.4, bz1 + 0.3), V(bx1 + 0.3, yL + 2.4, bz1 + 0.3), V(bx1 + 0.3, yL + 2.6, bz0 - 0.3), V(bx0 - 0.3, yL + 2.6, bz0 - 0.3), 0xb9c2c6, PAT.CORRUGATED);
  t.quad(V(bx0 - 0.3, yL + 2.6, bz0 - 0.3), V(bx1 + 0.3, yL + 2.6, bz0 - 0.3), V(bx1 + 0.3, yL + 2.4, bz1 + 0.3), V(bx0 - 0.3, yL + 2.4, bz1 + 0.3), 0x8a9196, 0);
  const kb = TB(ctx, (bx0 + bx1) / 2, (bz0 + bz1) / 2);
  for (let x = bx0 + 0.6; x < bx1 - 0.4; x += 0.75) {
    if (rng.next() < 0.18) continue;
    bicycle(kb, x, yL, (bz0 + bz1) / 2 - 1.2 + rng.range(-0.1, 0.1), Math.PI / 2 + rng.range(-0.08, 0.08), rng.pick([0xd8d8d0, 0x2a3550, 0xc0392b, 0x3a6a4a, 0xe8e0d0]));
  }
  for (const x of [bx0, bx1]) for (const z of [bz0, bz1]) ctx.colliders.addCircle(x, z, 0.1);
  solid(ctx, bx0, (bz0 + bz1) / 2 - 2.2, bx1, (bz0 + bz1) / 2 - 0.2, yL - 1, yL + 1.0);
  void rng;
}

// ---------------------------------------------------------------------------
export function buildSchool(ctx) {
  buildMain(ctx);
  buildGym(ctx);
  buildGrounds(ctx);
  ctx.landmarks.push({ id: 'school', name: '桜ヶ浜高校', x: 379.5, z: S.z1 });
}
