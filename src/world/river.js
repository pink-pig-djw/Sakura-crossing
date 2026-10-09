import * as THREE from 'three';
import { RNG } from '../core/rng.js';
import { PAT } from '../core/builder.js';
import {
  RIVER, BRIDGES, WEIRS, STEPPING_Z, SEAWALL_Z, PROM, RAIL_Z, groundH, riverLevel, riverBed, riverHalfWidth, shoreZ,
} from './layout.js';
import { Kit, signOnFace } from './kit.js';
import { createRiverWaterMaterial } from '../render/materials.js';
import { FONTS, drawVertical, drawBoard } from '../render/atlas.js';
import { benchAt } from './coast.js';
import { RAIL_TOP } from './railway.js';

// 桜川: stone revetments with sakura paths on both banks, sloped weirs, a culvert
// where the river leaves the hills, bridges, stepping stones and the mouth on the beach.

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const RX = RIVER.x;
const XW = RX - RIVER.inner, XE = RX + RIVER.inner; // channel faces (174 / 190)
const WW = XW - RIVER.wall, WE = XE + RIVER.wall; // path-side edges of the wall tops (172 / 192)
const Z_END = SEAWALL_Z + 1.4; // walls run out to the beach face of the sea wall
const ZH = RIVER.zHead;
const bank = (z) => groundH(WW - 1, z);
// top of the revetment: the bank, or the promenade along the sea wall
const wallTop = (z) => (z < PROM.z0 ? bank(z) : PROM.y);
export const STAIRS = { top: STEPPING_Z - 7.6, bottom: STEPPING_Z - 1.0, w: 1.6 };

function deckTop(br, z) {
  if (br.kind === 'prom') return PROM.y;
  if (br.kind === 'rail') return RAIL_TOP - 0.12;
  return bank(z) + 0.03;
}

export function buildRiver(ctx) {
  buildWalls(ctx);
  buildHeadwall(ctx);
  buildWeirs(ctx);
  buildStepping(ctx);
  for (const br of BRIDGES) if (br.kind !== 'prom') buildBridge(ctx, br);
  buildRailings(ctx);
  buildPaths(ctx);
  buildMouth(ctx);
  ctx.scene.add(buildWater());
}

// ---------------------------------------------------------------------------
// revetments (谷積み stone faces with a concrete coping)
// ---------------------------------------------------------------------------
function buildWalls(ctx) {
  for (const side of [-1, 1]) {
    const xf = side < 0 ? XW : XE;
    const xo = side < 0 ? WW : WE;
    const xc = xf - side * 0.06; // coping lip
    for (let z = ZH; z < Z_END - 0.01; z += 2) {
      const za = z, zb = Math.min(Z_END, z + 2);
      const b = ctx.builders.get('toon', xf, (za + zb) / 2);
      const ta = wallTop(za), tb = wallTop(zb);
      const bot = Math.min(riverBed(xf, za), riverBed(xf, zb)) - 0.5;
      const ca = ta - 0.34, cb = tb - 0.34;
      const C = V(xf + side * 3, (ta + bot) / 2, (za + zb) / 2);
      b.quadOut(V(xf, bot, za), V(xf, bot, zb), V(xf, cb, zb), V(xf, ca, za), C, 0x9d978b, PAT.STONE);
      // coping band, its underside and the sliver of top outside the path ribbon
      b.quadOut(V(xc, ca, za), V(xc, cb, zb), V(xc, tb + 0.04, zb), V(xc, ta + 0.04, za), C, 0xc9c5bb, PAT.CONCRETE);
      b.quadOut(V(xf, ca, za), V(xf, cb, zb), V(xc, cb, zb), V(xc, ca, za), V(xc, ca + 1, (za + zb) / 2), 0xb9b5ab, 0);
      b.quadOut(V(xf, ta + 0.04, za), V(xf, tb + 0.04, zb), V(xc, tb + 0.04, zb), V(xc, ta + 0.04, za), V(xc, ta - 1, (za + zb) / 2), 0xd3cfc5, PAT.CONCRETE);
      // drain pipe outlets and moss streaks every so often
      if (Math.round(z) % 14 === 0) {
        const py = (ca + bot) / 2 + 0.6;
        b.cyl(xf - side * 0.0, py, (za + zb) / 2, 0.16, 0.16, 0.12, 10, 0x6a6e70, 0, { phase: 0 });
        ctx.builders.get('toon', xf, za).box(xf - side * 0.02, py - 0.55, (za + zb) / 2, 0.03, 1.0, 0.3, { color: 0x5d6b4c });
      }
    }
    // end faces at the beach
    const b = ctx.builders.get('toon', xf, Z_END);
    const top = wallTop(Z_END), bot = riverBed(xf, Z_END) - 0.8;
    b.quadOut(V(xo, bot, Z_END), V(xf, bot, Z_END), V(xf, top + 0.04, Z_END), V(xo, top + 0.04, Z_END), V((xo + xf) / 2, top, Z_END - 2), 0x9d978b, PAT.STONE);
    // colliders: walkers in the channel cannot climb into the wall
    for (let z = ZH; z < Z_END - 0.01; z += 4) {
      const z1 = Math.min(Z_END, z + 4);
      const yTop = Math.min(wallTop(z), wallTop(z1)) - 0.3;
      ctx.colliders.addBox((xo + xf) / 2, (z + z1) / 2, RIVER.wall / 2, (z1 - z) / 2, 0, yTop);
    }
  }
}

// ---------------------------------------------------------------------------
// headwall + box culvert where the river comes out from under the hill
// ---------------------------------------------------------------------------
function buildHeadwall(ctx) {
  const b = ctx.builders.get('toon', RX, ZH);
  const d = ctx.builders.get('detail', RX, ZH);
  const lvl = riverLevel(ZH);
  const bot = riverBed(RX, ZH) - 0.8;
  const top = bank(ZH) + 0.9;
  const o0 = XW + 1.5, o1 = XE - 1.5, oTop = lvl + 1.9;
  const z0 = ZH - 2, z1 = ZH;
  const conc = { color: 0xc4c0b6, pattern: PAT.CONCRETE, ao: 0.12 };
  b.boxMM(WW - 2, bot, z0, o0, top, z1, conc);
  b.boxMM(o1, bot, z0, WE + 2, top, z1, conc);
  b.boxMM(o0, oTop, z0, o1, top, z1, conc);
  // frame around the opening
  b.boxMM(o0 - 0.3, bot, z1, o0, oTop + 0.3, z1 + 0.2, { color: 0xd6d2c8, pattern: PAT.CONCRETE });
  b.boxMM(o1, bot, z1, o1 + 0.3, oTop + 0.3, z1 + 0.2, { color: 0xd6d2c8, pattern: PAT.CONCRETE });
  b.boxMM(o0 - 0.3, oTop, z1, o1 + 0.3, oTop + 0.3, z1 + 0.2, { color: 0xd6d2c8, pattern: PAT.CONCRETE });
  // dark culvert interior (faces point inward)
  const zi = z0 - 9;
  const dark = 0x17181c;
  const ctr = V(RX, (bot + oTop) / 2, (z0 + zi) / 2);
  const inQuad = (a, bb, c, dd) => {
    // quadOut faces away from the given point: pick a point outside so the face points inward
    const n = new THREE.Vector3().subVectors(bb, a).cross(new THREE.Vector3().subVectors(dd, a));
    const f = a.clone().add(bb).add(c).add(dd).multiplyScalar(0.25);
    if (n.dot(new THREE.Vector3().subVectors(ctr, f)) < 0) b.quad(bb, a, dd, c, dark, 0);
    else b.quad(a, bb, c, dd, dark, 0);
  };
  inQuad(V(o0, bot, zi), V(o1, bot, zi), V(o1, oTop, zi), V(o0, oTop, zi)); // back
  inQuad(V(o0, bot, zi), V(o0, bot, z0), V(o0, oTop, z0), V(o0, oTop, zi)); // west side
  inQuad(V(o1, bot, z0), V(o1, bot, zi), V(o1, oTop, zi), V(o1, oTop, z0)); // east side
  inQuad(V(o0, oTop, zi), V(o1, oTop, zi), V(o1, oTop, z0), V(o0, oTop, z0)); // ceiling
  // railing on top
  for (let x = WW - 1.8; x <= WE + 1.8; x += 2) d.box(x, top + 0.5, z0 + 0.4, 0.07, 1.0, 0.07, { color: 0x4f5a55 });
  d.box(RX, top + 1.0, z0 + 0.4, WE - WW + 3.7, 0.07, 0.07, { color: 0x4f5a55 });
  d.box(RX, top + 0.55, z0 + 0.4, WE - WW + 3.7, 0.05, 0.05, { color: 0x4f5a55 });
  // grate keeps walkers out of the culvert
  for (let x = o0 + 0.4; x < o1; x += 0.45) d.box(x, (bot + oTop) / 2 + 0.3, z0 + 0.6, 0.05, oTop - bot, 0.05, { color: 0x3a3d40 });
  d.box(RX, oTop - 0.1, z0 + 0.6, o1 - o0, 0.08, 0.08, { color: 0x3a3d40 });
  ctx.colliders.addBox(RX, (z0 + z1) / 2, (WE - WW) / 2 + 2, 1.0, 0, top + 1.1);
  // name plate on the wall face
  const uv = ctx.atlas.draw('river-plate', 256, 72, (c, w, h) => drawBoard(c, w, h, { text: '一級河川 桜川', bg: '#f6f4ee', fg: '#1d3a7a', border: '#1d3a7a', weather: false }));
  const kit = new Kit(ctx, RX, ZH);
  signOnFace(kit, { o: V(WE - 0.6, 0, z1 + 0.02), r: V(1, 0, 0), n: V(0, 0, 1), len: 3 }, 1.4, top - 0.75, 1.8, 0.5, 0.0, uv, 0);
}

// ---------------------------------------------------------------------------
// sloped weirs (床止め): concrete aprons following the bed, with a sill on top
// ---------------------------------------------------------------------------
function weirTop(x, z) {
  const a = Math.min(1, Math.abs(x - RX) / RIVER.inner);
  return riverLevel(z) - (0.16 + 0.36 * (1 - a * a)) + 0.07;
}

function buildWeirs(ctx) {
  for (const w of WEIRS) {
    const b = ctx.builders.get('toon', RX, w.z);
    const N = 8;
    const zs = [w.z - 0.4, w.z, w.z + 1, w.z + 2];
    for (let j = 0; j < zs.length - 1; j++) {
      for (let i = 0; i < N; i++) {
        const xa = XW + ((XE - XW) * i) / N, xb = XW + ((XE - XW) * (i + 1)) / N;
        const za = zs[j], zb = zs[j + 1];
        const y = (x, z) => (z <= w.z ? weirTop(x, w.z) + 0.18 : weirTop(x, z));
        b.quad(V(xa, y(xa, zb), zb), V(xb, y(xb, zb), zb), V(xb, y(xb, za), za), V(xa, y(xa, za), za), j === 0 ? 0xd2cec4 : 0xbcb8ad, PAT.CONCRETE);
      }
    }
    // sill face (upstream) and the downstream edge
    for (let i = 0; i < N; i++) {
      const xa = XW + ((XE - XW) * i) / N, xb = XW + ((XE - XW) * (i + 1)) / N;
      const z0 = w.z - 0.4;
      const y0a = weirTop(xa, w.z) + 0.18, y0b = weirTop(xb, w.z) + 0.18;
      b.quad(V(xb, y0b - 0.5, z0), V(xa, y0a - 0.5, z0), V(xa, y0a, z0), V(xb, y0b, z0), 0xc9c5bb, PAT.CONCRETE);
    }
    ctx.colliders.addSurface(XW, w.z - 0.4, XE, w.z + 2, (x, z) => (z <= w.z ? weirTop(x, w.z) + 0.18 : weirTop(x, z)), 1);
  }
}

// ---------------------------------------------------------------------------
// stepping stones (飛び石) with stairs down from both paths
// ---------------------------------------------------------------------------
function buildStepping(ctx) {
  const rng = new RNG(5151);
  const lvl = riverLevel(STEPPING_Z);
  const zS = STEPPING_Z - 0.3;
  const stones = [];
  const n = 9;
  for (let i = 0; i < n; i++) {
    const x = XW + 2.0 + i * ((XE - XW - 4.0) / (n - 1));
    const r = rng.range(0.64, 0.72);
    const top = lvl + rng.range(0.22, 0.28);
    const z = zS + rng.range(-0.12, 0.12);
    stones.push({ x, z, r, top });
    const b = ctx.builders.get('toon', x, z);
    b.cyl(x, riverBed(x, z) - 0.3, z, r * 1.06, r, top - riverBed(x, z) + 0.3, 9, 0x8f8a80, PAT.ROCK, { top: 0xcac4b6, phase: rng.range(0, 1) });
  }
  ctx.colliders.addSurface(XW, zS - 1, XE, zS + 1, (x, z) => {
    for (const s of stones) if ((x - s.x) ** 2 + (z - s.z) ** 2 < (s.r + 0.05) ** 2) return s.top;
    return -99;
  }, 0);
  ctx.landmarks.push({ id: 'stepping', name: '飛び石', x: RX, z: zS });

  // stairs along the walls: top landing at the path, steps down toward the stones
  for (const side of [-1, 1]) {
    const x0 = side < 0 ? XW : XE - STAIRS.w, x1 = x0 + STAIRS.w;
    const zt = STAIRS.top, zb = STAIRS.bottom;
    const yTop = bank(zt);
    const yBot = lvl + 0.1;
    const steps = Math.round((yTop - yBot) / 0.17);
    const run = (zb - zt) / steps;
    const b = ctx.builders.get('toon', (x0 + x1) / 2, (zt + zb) / 2);
    const base = Math.min(riverBed(x0, zb), riverBed(x1, zb)) - 0.4;
    b.boxMM(x0, base, zt - 1.0, x1, yTop + 0.02, zt, { color: 0xc6c2b8, pattern: PAT.CONCRETE });
    for (let i = 0; i < steps; i++) {
      const top = yTop - (i + 1) * ((yTop - yBot) / steps);
      b.boxMM(x0, base, zt + i * run, x1, top + 0.001, zt + (i + 1) * run, { color: 0xc6c2b8, pattern: PAT.CONCRETE });
    }
    b.boxMM(x0, base, zb, x1, yBot, zb + 1.4, { color: 0xbcb8ad, pattern: PAT.CONCRETE });
    // low curb + steel handrail on the water side (the collider keeps walkers on the stairs)
    const xp = side < 0 ? x1 - 0.06 : x0 + 0.06;
    const stepTop = (z) => (z <= zt ? yTop : z >= zb ? yBot : yTop - (Math.min(steps - 1, Math.floor((z - zt) / run)) + 1) * ((yTop - yBot) / steps));
    const d = ctx.builders.get('detail', xp, zt);
    for (let z = zt - 0.9; z <= zb + 0.01; z += 1.25) d.box(xp, stepTop(z) + 0.5, z, 0.06, 1.0, 0.06, { color: 0x7d858c });
    d.box(xp, stepTop(zb) + 0.5, zb, 0.06, 1.0, 0.06, { color: 0x7d858c });
    d.rod(V(xp, yTop + 1.0, zt - 0.9), V(xp, yTop + 1.0, zt), 0.035, 0.035, 6, 0x7d858c);
    d.rod(V(xp, yTop + 1.0, zt), V(xp, yBot + 1.0, zb), 0.035, 0.035, 6, 0x7d858c);
    d.rod(V(xp, yTop + 0.55, zt), V(xp, yBot + 0.55, zb), 0.025, 0.025, 5, 0x7d858c);
    ctx.colliders.addSegment(xp, zt - 1.0, xp, zb, 0.25, 99);
    ctx.colliders.addSurface(x0, zt - 1.0, x1, zb + 1.4, (x, z) => {
      if (z <= zt) return yTop;
      if (z >= zb) return yBot;
      const i = Math.min(steps - 1, Math.floor((z - zt) / run));
      return yTop - (i + 1) * ((yTop - yBot) / steps);
    }, 2);
    // sign at the top
    const sx = side < 0 ? WW - 0.6 : WE + 0.6;
    const uv = ctx.atlas.draw('stepping-sign', 128, 160, (c, w, h) => {
      c.fillStyle = '#f7f3e8';
      c.fillRect(0, 0, w, h);
      c.strokeStyle = '#3b6a8a';
      c.lineWidth = 6;
      c.strokeRect(3, 3, w - 6, h - 6);
      c.fillStyle = '#2a4a6a';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.font = `700 ${h * 0.17}px ${FONTS.maru}`;
      c.fillText('飛び石', w / 2, h * 0.22);
      c.font = `500 ${h * 0.1}px ${FONTS.maru}`;
      c.fillText('足もとに', w / 2, h * 0.5);
      c.fillText('ご注意ください', w / 2, h * 0.64);
      c.fillStyle = '#e2708f';
      c.beginPath();
      c.arc(w / 2, h * 0.84, h * 0.06, 0, Math.PI * 2);
      c.fill();
    });
    const kit = new Kit(ctx, sx, zt);
    kit.t.cyl(sx, yTop, zt - 1.6, 0.04, 0.04, 1.3, 6, 0x8a8f94);
    signOnFace(kit, { o: V(sx + 0.3, yTop, zt - 1.67), r: V(-1, 0, 0), n: V(0, 0, -1), len: 0.6 }, 0.3, 0.95, 0.48, 0.6, 0.0, uv, 0, 0xdedad0);
    ctx.colliders.addCircle(sx, zt - 1.6, 0.08);
    ctx.interactables.push({ kind: 'sign', x: side < 0 ? WW + 1 : WE - 1, z: zt - 0.5, r: 1.6, label: '飛び石の案内を見る', text: '飛び石で向こう岸へ渡れる。水はすこし冷たそう。' });
  }
  ctx.catSpots.push({ x: stones[4].x, z: stones[4].z, y: stones[4].top, kind: 'stone', ry: 0.8 });
}

// ---------------------------------------------------------------------------
// bridges
// ---------------------------------------------------------------------------
const BRIDGE_LOOK = {
  'e20e': { rail: 'vermilion', deck: 0xe2dccd, kana: 'さくらばし', lamps: true, arch: true },
  'e-50e': { rail: 'steel', deck: 0xc9c7c0, kana: 'しおみばし', lamps: true },
  'rail-e': { rail: 'simple', deck: 0xc4c1b9 },
  'coast': { rail: 'steel', deck: 0xd2cfc6, lamps: false, prom: true },
};

function nameplate(ctx, key, text, w = 64, h = 200) {
  return ctx.atlas.draw('bridge:' + key + text, w, h, (c, ww, hh) => drawVertical(c, ww, hh, { text, bg: '#7d6e55', fg: '#f2e6c8', font: FONTS.mincho, border: '#5a4e3a' }));
}

function buildBridge(ctx, br) {
  const look = BRIDGE_LOOK[br.id];
  const zc = (br.z0 + br.z1) / 2;
  const kit = new Kit(ctx, RX, zc);
  const t = kit.t, d = kit.d;
  if (br.kind === 'rail') return railBridge(ctx, br);
  const z0 = br.z0, z1 = br.id === 'coast' ? SEAWALL_Z : br.z1;
  const top = (z) => (br.id === 'coast' && z > PROM.z0 ? PROM.y : deckTop(br, z));
  // deck slab (sloped along z with the street) with an arched soffit on Sakura bridge
  const N = 8;
  for (let i = 0; i < N; i++) {
    const xa = WW + ((WE - WW) * i) / N, xb = WW + ((WE - WW) * (i + 1)) / N;
    const depth = (x) => {
      if (!look.arch) return 0.55;
      const u = (x - WW) / (WE - WW);
      return 0.5 + 0.75 * (1 - Math.sin(Math.PI * u));
    };
    const ya0 = top(z0) - 0.05 - depth(xa), yb0 = top(z0) - 0.05 - depth(xb);
    const ya1 = top(z1) - 0.05 - depth(xa), yb1 = top(z1) - 0.05 - depth(xb);
    // soffit
    t.quad(V(xa, ya0, z0), V(xb, yb0, z0), V(xb, yb1, z1), V(xa, ya1, z1), 0xb8b4aa, PAT.CONCRETE);
    // side fascias
    t.quad(V(xb, yb0, z0), V(xa, ya0, z0), V(xa, top(z0) - 0.02, z0), V(xb, top(z0) - 0.02, z0), look.deck, PAT.CONCRETE);
    t.quad(V(xa, ya1, z1), V(xb, yb1, z1), V(xb, top(z1) - 0.02, z1), V(xa, top(z1) - 0.02, z1), look.deck, PAT.CONCRETE);
  }
  // fascia trim line
  for (const [z, s] of [[z0, -1], [z1, 1]]) d.box(RX, top(z) - 0.2, z + s * 0.03, WE - WW, 0.08, 0.06, { color: 0xf0ece2 });

  // walking surfaces that are not drawn by the road network
  const rb = ctx.builders.get('road', RX, zc);
  const flat = (xa, xb, za, zb, y, style, w) => {
    const base = rb.count;
    const c = new THREE.Color(w / 20, 0, 0);
    for (const [x, z] of [[xa, za], [xb, za], [xa, zb], [xb, zb]]) rb.vtx(x, y, z, 0, 1, 0, c, z - za, x, style);
    rb.idx.push(base, base + 2, base + 3, base, base + 3, base + 1);
  };
  if (br.id === 'coast') {
    flat(WW, WE, 60.0, 61.5, bank(61) + 0.03, 7, 1.5); // sidewalk
    flat(WW, WE, PROM.z0, SEAWALL_Z, PROM.y, 9, 4.5); // promenade
    t.boxMM(WW, bank(61) - 0.2, PROM.z0 - 0.12, WE, PROM.y + 0.01, PROM.z0 + 0.02, { color: 0xc9c5bb, pattern: PAT.CONCRETE });
    ctx.colliders.addSurface(XW, 60.0, XE, PROM.z0, (x, z) => bank(z) + 0.03, 2, { min: bank(61) - 1.4 });
    ctx.colliders.addSurface(WW, PROM.z0, WE, SEAWALL_Z, () => PROM.y, 2, { min: PROM.y - 1.4 });
  } else {
    ctx.colliders.addSurface(XW, z0, XE, z1, (x, z) => top(z), 2, { min: top(zc) - 1.4 });
  }

  // railings along both edges over the channel
  const edges = br.id === 'coast' ? [[60.0 + 0.12, 1], [SEAWALL_Z - 0.12, -1]] : [[z0 + 0.12, 1], [z1 - 0.12, -1]];
  for (const [ze, inward] of edges) {
    const y = top(ze);
    if (look.rail === 'vermilion') {
      const red = 0xc8432e;
      for (let x = XW + 2; x < XE - 1; x += 2) t.box(x, y + 0.5, ze, 0.13, 1.0, 0.13, { color: red });
      t.box(RX, y + 1.0, ze, XE - XW, 0.12, 0.16, { color: red });
      t.box(RX, y + 0.56, ze, XE - XW, 0.08, 0.1, { color: red });
      d.box(RX, y + 0.12, ze, XE - XW, 0.12, 0.12, { color: 0x6a5a48 });
      // main posts with giboshi caps
      for (const x of [XW, XE]) {
        t.box(x, y + 0.65, ze, 0.3, 1.3, 0.3, { color: red });
        t.cyl(x, y + 1.3, ze, 0.17, 0.17, 0.08, 10, 0xb08a3a);
        t.geom(new THREE.SphereGeometry(0.15, 10, 8), new THREE.Matrix4().makeTranslation(x, y + 1.48, ze), 0xc9a24a);
        t.cyl(x, y + 1.58, ze, 0.07, 0.0, 0.2, 8, 0xc9a24a);
      }
    } else if (look.rail === 'steel') {
      const c = 0x55616d;
      for (let x = XW; x <= XE + 0.01; x += 2) t.box(x, y + 0.55, ze, 0.1, 1.1, 0.1, { color: c });
      t.cyl(XW, y + 1.1, ze, 0.05, 0.05, 0.01, 4, c);
      d.rod(V(XW, y + 1.1, ze), V(XE, y + 1.1, ze), 0.055, 0.055, 8, c);
      d.box(RX, y + 0.15, ze, XE - XW, 0.06, 0.06, { color: c });
      for (let x = XW + 0.15; x < XE; x += 0.15) d.box(x, y + 0.62, ze, 0.025, 0.95, 0.025, { color: c });
    } else {
      const c = 0xa9adb0;
      for (let x = XW; x <= XE + 0.01; x += 2) d.box(x, y + 0.5, ze, 0.08, 1.0, 0.08, { color: c });
      d.box(RX, y + 1.0, ze, XE - XW, 0.07, 0.07, { color: c });
      d.box(RX, y + 0.55, ze, XE - XW, 0.05, 0.05, { color: c });
    }
    ctx.colliders.addSegment(XW, ze, XE, ze, 0.3, y + 1.1).yBottom = y - 0.7;
    void inward;
  }
  // name plates on the main posts
  if (look.kana) {
    const kanji = nameplate(ctx, br.id, br.name);
    const kana = nameplate(ctx, br.id, look.kana);
    const river = nameplate(ctx, 'river', '桜川');
    const kawa = nameplate(ctx, 'river', 'さくらがわ');
    const plates = [[XW, z0 + 0.12, kanji, 1], [XE, z0 + 0.12, kana, -1], [XW, z1 - 0.12, river, 1], [XE, z1 - 0.12, kawa, -1]];
    for (const [x, z, uv, s] of plates) {
      const y = top(z);
      // plate on the face looking along the road (toward approaching walkers)
      const fx = x - s * 0.17;
      signOnFace(kit, { o: V(fx, y, z - s * 0.11), r: V(0, 0, s), n: V(-s, 0, 0), len: 0.22 }, 0.11, 0.45, 0.18, 0.56, 0.0, uv, 0);
    }
    ctx.interactables.push({ kind: 'sign', x: XW - 0.8, z: z0 - 0.4, r: 1.6, label: '橋の名前を見る', text: `${br.name}（${look.kana}）— 一級河川 桜川` });
  }
  if (look.lamps) {
    for (const [ze, s] of [[z0 + 0.12, 1], [z1 - 0.12, -1]]) {
      for (const x of [XW + 4, XE - 4]) {
        const y = top(ze);
        const lz = ze + s * 0.35;
        t.cyl(x, y, lz, 0.08, 0.06, 3.9, 8, 0x3f4a44);
        t.box(x, y + 4.0, lz, 0.42, 0.06, 0.42, { color: 0x3f4a44 });
        ctx.builders.get('emissive', x, lz).box(x, y + 3.75, lz, 0.32, 0.42, 0.32, { color: 0xfff1d6 });
        t.box(x, y + 3.52, lz, 0.4, 0.05, 0.4, { color: 0x3f4a44 });
        ctx.lamps.push({ x, y: y + 3.7, z: lz, r: 4.5, floor: y, clip: { x0: XW, x1: XE, z0, z1 } });
        ctx.colliders.addCircle(x, lz, 0.12, y + 4, y - 0.5);
      }
    }
  }
}

function railBridge(ctx, br) {
  const b = ctx.builders.get('toon', RX, RAIL_Z);
  const d = ctx.builders.get('detail', RX, RAIL_Z);
  const girder = 0x9a4a3a;
  const yTop = RAIL_TOP - 0.24; // under the sleepers
  for (const zg of [RAIL_Z - 0.95, RAIL_Z + 0.95]) {
    b.boxMM(WW, yTop - 1.35, zg - 0.04, WE, yTop - 0.05, zg + 0.04, { color: girder, pattern: PAT.METAL });
    b.boxMM(WW, yTop - 0.08, zg - 0.22, WE, yTop, zg + 0.22, { color: girder });
    b.boxMM(WW, yTop - 1.42, zg - 0.22, WE, yTop - 1.35, zg + 0.22, { color: girder });
    for (let x = WW + 1; x < WE; x += 1.6) d.box(x, yTop - 0.7, zg, 0.06, 1.25, 0.34, { color: 0x86402f });
  }
  for (let x = WW + 1; x < WE; x += 3.2) b.boxMM(x - 0.08, yTop - 1.1, RAIL_Z - 0.95, x + 0.08, yTop - 0.2, RAIL_Z + 0.95, { color: girder });
  // walkways + handrails on both sides
  for (const s of [-1, 1]) {
    const zw = RAIL_Z + s * 1.9;
    b.boxMM(WW, yTop - 0.06, Math.min(zw, zw - s * 0.8), WE, yTop + 0.06, Math.max(zw, zw - s * 0.8) + 0.001, { color: 0x6f6a64, pattern: PAT.LATTICE });
    const zr = RAIL_Z + s * 2.6;
    for (let x = XW; x <= XE + 0.01; x += 2) d.box(x, yTop + 0.6, zr, 0.06, 1.1, 0.06, { color: 0xcfd2d4 });
    d.box(RX, yTop + 1.15, zr, XE - XW, 0.05, 0.05, { color: 0xcfd2d4 });
    d.box(RX, yTop + 0.65, zr, XE - XW, 0.04, 0.04, { color: 0xcfd2d4 });
    ctx.colliders.addSegment(XW, zr, XE, zr, 0.25, yTop + 1.2).yBottom = yTop - 0.7;
  }
  ctx.colliders.addSurface(XW, RAIL_Z - 2.6, XE, RAIL_Z + 2.6, () => yTop + 0.12, 2, { min: yTop - 1.4 });
  void br;
}

// ---------------------------------------------------------------------------
// railings along the channel (gaps at bridges and at the stair heads)
// ---------------------------------------------------------------------------
function buildRailings(ctx) {
  const gaps = BRIDGES.map((b) => [b.z0 - 0.02, b.id === 'coast' ? SEAWALL_Z + 2 : b.z1 + 0.02]);
  gaps.push([STAIRS.top - 1.0, STAIRS.top]);
  const blocked = (z) => gaps.some(([a, b]) => z > a && z < b);
  for (const side of [-1, 1]) {
    const xr = side < 0 ? XW - 0.15 : XE + 0.15;
    let run = null;
    const flush = (zEnd) => {
      if (run && zEnd - run > 0.3) {
        const ya = wallTop(run), yb = wallTop(zEnd);
        ctx.colliders.addSegment(xr, run, xr, zEnd, 0.22, Math.max(ya, yb) + 1.1).yBottom = Math.min(ya, yb) - 0.8;
      }
      run = null;
    };
    for (let z = ZH + 0.2; z < SEAWALL_Z; z += 0.5) {
      if (blocked(z)) {
        flush(z);
        continue;
      }
      if (run === null) run = z;
      const y = wallTop(z);
      const d = ctx.builders.get('detail', xr, z);
      const zi = Math.round(z * 2);
      if (zi % 4 === 0) d.box(xr, y + 0.55, z, 0.08, 1.1, 0.08, { color: 0x4f4a44 });
      const z1 = Math.min(z + 0.5, SEAWALL_Z);
      if (!blocked(z1 - 0.01)) {
        d.rod(V(xr, y + 1.08, z), V(xr, wallTop(z1) + 1.08, z1), 0.045, 0.045, 5, 0x5a534b);
        d.rod(V(xr, y + 0.6, z), V(xr, wallTop(z1) + 0.6, z1), 0.03, 0.03, 4, 0x5a534b);
      }
    }
    flush(SEAWALL_Z);
  }
}

// ---------------------------------------------------------------------------
// sakura paths: trees leaning over the water, bonbori lanterns, benches
// ---------------------------------------------------------------------------
function buildPaths(ctx) {
  const rng = new RNG(8888);
  const nearBridge = (z, m) => BRIDGES.some((b) => z > b.z0 - m && z < b.z1 + m);
  const lanterns = [];
  for (const side of [-1, 1]) {
    const xt = side < 0 ? WW + 0.45 : WE - 0.45; // trees on the wall tops
    const xl = side < 0 ? XW - 0.55 : XE + 0.55; // lanterns by the railing
    const xb = side < 0 ? RIVER.pathW[0] + 1.0 : RIVER.pathE[1] - 1.0; // benches on the land side
    let k = 0;
    for (let z = ZH + 5; z < 44; z += rng.range(8.2, 9.4)) {
      if (nearBridge(z, 3.2)) continue;
      if (z > STAIRS.top - 2.5 && z < STAIRS.top + 0.8) continue;
      ctx.trees.push({ kind: 'sakura', x: xt, z, y: bank(z), seed: rng.int(1, 1e9), scale: rng.range(0.92, 1.1), lean: -side * 0.32 });
      // lantern between this tree and the next
      const zl = z + 4.4;
      if (!nearBridge(zl, 1.5) && !(zl > STAIRS.top - 1.5 && zl < STAIRS.top + 0.5) && zl < 46) lanterns.push({ x: xl, z: zl, y: bank(zl), pink: (k++ + (side > 0 ? 1 : 0)) % 2 === 0 });
    }
    // benches facing the river
    for (let z = ZH + 14; z < 40; z += rng.range(22, 30)) {
      if (nearBridge(z, 3)) continue;
      const y = bank(z);
      // seat facing the river
      benchAt(ctx, ctx.builders.get('toon', xb, z), xb, y, z, side < 0 ? -Math.PI / 2 : Math.PI / 2, 0x8a6a4a, '川を眺めるベンチに座る');
    }
  }
  // bonbori: wooden posts with paper lanterns, glowing pink and white at night
  for (const l of lanterns) {
    const b = ctx.builders.get('toon', l.x, l.z);
    b.box(l.x, l.y + 0.85, l.z, 0.09, 1.7, 0.09, { color: 0x6a4f3a });
    b.box(l.x, l.y + 1.73, l.z, 0.34, 0.05, 0.34, { color: 0x3a2e26 });
    b.box(l.x, l.y + 1.22, l.z, 0.3, 0.04, 0.3, { color: 0x3a2e26 });
    ctx.builders.get('emissive', l.x, l.z).box(l.x, l.y + 1.48, l.z, 0.26, 0.46, 0.26, { color: l.pink ? 0xffc6d8 : 0xfff3e2 });
    const px = l.x < RX ? l.x - 1.0 : l.x + 1.0;
    ctx.lamps.push({ x: l.x, y: l.y + 1.4, z: l.z, color: l.pink ? 0xffb0c8 : 0xffe6c0, floor: l.y, pool: { x: px, z: l.z, r: 2.2 }, clip: { x0: l.x < RX ? RIVER.pathW[0] : XE, x1: l.x < RX ? XW : RIVER.pathE[1], z0: l.z - 3, z1: l.z + 3 } });
    ctx.colliders.addCircle(l.x, l.z, 0.1);
  }
  ctx.soundSpots.push({ kind: 'river', x: RX, y: bank(0), z: 0 });
  ctx.landmarks.push({ id: 'river', name: '桜川', x: RX, z: -40 });
}

// ---------------------------------------------------------------------------
// river mouth: rip-rap at the wall ends
// ---------------------------------------------------------------------------
function buildMouth(ctx) {
  const rng = new RNG(4321);
  for (const side of [-1, 1]) {
    const xf = side < 0 ? XW : XE;
    for (let i = 0; i < 9; i++) {
      const x = xf - side * rng.range(-2.2, 1.5);
      const z = Z_END + rng.range(-0.3, 2.6);
      const y = Math.max(groundH(x, z), riverBed(x, z));
      const g = new THREE.IcosahedronGeometry(1, 0);
      const s = rng.range(0.5, 0.95);
      const m = new THREE.Matrix4().compose(V(x, y + s * 0.2, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rng.range(0, 3), rng.range(0, 3), rng.range(0, 3))), V(s, s * 0.7, s));
      ctx.builders.get('toon', x, z).geom(g, m, rng.pick([0x9a958b, 0xa8a398, 0x8d897f]), PAT.ROCK);
    }
  }
}

// ---------------------------------------------------------------------------
// water surface
// ---------------------------------------------------------------------------
function buildWater() {
  const zEnd = shoreZ(RX) + 6;
  const zs = new Set();
  for (let z = ZH - 7; z <= zEnd; z += 1) zs.add(Math.round(z * 100) / 100);
  for (const w of WEIRS) for (const k of [0, 0.5, 1, 1.5, 2]) zs.add(w.z + k);
  const rows = [...zs].sort((a, b) => a - b);
  const cols = 10;
  const pos = [], nor = [], colr = [], uv = [], pat = [], idx = [];
  const foamAt = (z) => {
    let f = 0;
    for (const w of WEIRS) {
      if (z >= w.z - 0.2 && z <= w.z + 2) f = Math.max(f, 0.95);
      else if (z > w.z + 2) f = Math.max(f, 0.8 * Math.exp(-(z - w.z - 2) * 0.7));
    }
    if (z < ZH + 4) f = Math.max(f, 0.55 * (1 - Math.max(0, z - ZH) / 4));
    return f;
  };
  const speedAt = (z) => (WEIRS.some((w) => z >= w.z - 0.2 && z <= w.z + 2.2) ? 1 : 0.25);
  for (const z of rows) {
    const lvl = riverLevel(Math.max(z, ZH));
    const hw = z <= Z_END ? RIVER.inner + 0.05 : riverHalfWidth(z) + 0.45;
    const f = foamAt(z), sp = speedAt(z);
    for (let i = 0; i <= cols; i++) {
      const u = i / cols;
      const x = RX - hw + 2 * hw * u;
      pos.push(x, lvl, z);
      nor.push(0, 1, 0);
      colr.push(f, sp, 1 - Math.abs(2 * u - 1));
      uv.push(u, z);
      pat.push(0);
    }
  }
  for (let j = 0; j < rows.length - 1; j++) {
    for (let i = 0; i < cols; i++) {
      const a = j * (cols + 1) + i;
      idx.push(a, a + cols + 1, a + 1, a + 1, a + cols + 1, a + cols + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('pattern', new THREE.Float32BufferAttribute(pat, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  const mesh = new THREE.Mesh(g, createRiverWaterMaterial());
  mesh.receiveShadow = true;
  mesh.renderOrder = 2;
  mesh.name = 'river';
  return mesh;
}


