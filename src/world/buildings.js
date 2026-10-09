import * as THREE from 'three';
import { RNG, clamp } from '../core/rng.js';
import { PAT } from '../core/builder.js';
import { terrainH } from './layout.js';
import {
  Kit, boxFaces, fp, faceBox, signOnFace, windowUnit, door, koshiDoor, gableRoof, hipRoof, leanTo,
  acUnit, potPlant, mailbox, bicycle, parkedCar, blockWall, hedge, metalFence, laundry, FRAME,
} from './kit.js';
import { FONTS, drawBoard, drawVertical, fitText } from '../render/atlas.js';
import { shrub, GARDEN_FLOWERS } from './greenery.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

export const WALLS = ['#efe4cf', '#f3efe4', '#e3d4b9', '#d4d3cd', '#c7d6df', '#b9cbd8', '#d6dec8', '#ecd8cf', '#cbb698', '#e8d7a5', '#f1f1ec', '#c3bbb0', '#dcc8b0', '#a9b7c6'];
export const ROOFS = ['#4a4f59', '#3e4862', '#6b5446', '#4c5e55', '#3b3b40', '#7a4b3d', '#5b6879', '#5a4a52', '#2f3a4c'];
const KAWARA = ['#5f6a78', '#707a86', '#56606e', '#6d6e72'];
const TRIM = ['#ecebe6', '#4c4f55', '#8b7a66', '#ffffff', '#5d5550'];

// Local frame helper for a lot. Local +z points from the street into the lot.
export function lotFrame(lot) {
  let ox, oz, ry, W, D;
  if (lot.front === 'N') { ox = (lot.x0 + lot.x1) / 2; oz = lot.z0; ry = 0; W = lot.x1 - lot.x0; D = lot.z1 - lot.z0; }
  else if (lot.front === 'S') { ox = (lot.x0 + lot.x1) / 2; oz = lot.z1; ry = Math.PI; W = lot.x1 - lot.x0; D = lot.z1 - lot.z0; }
  else if (lot.front === 'W') { ox = lot.x0; oz = (lot.z0 + lot.z1) / 2; ry = Math.PI / 2; W = lot.z1 - lot.z0; D = lot.x1 - lot.x0; }
  else { ox = lot.x1; oz = (lot.z0 + lot.z1) / 2; ry = -Math.PI / 2; W = lot.z1 - lot.z0; D = lot.x1 - lot.x0; }
  const c = Math.cos(ry), s = Math.sin(ry);
  const toW = (lx, lz) => [ox + lx * c + lz * s, oz - lx * s + lz * c];
  const yAt = (lx, lz) => {
    const [x, z] = toW(lx, lz);
    return terrainH(x, z);
  };
  const rectW = (lx0, lz0, lx1, lz1) => {
    const [ax, az] = toW(lx0, lz0);
    const [bx, bz] = toW(lx1, lz1);
    return [Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz)];
  };
  return { ox, oz, ry, W, D, toW, yAt, rectW };
}

// paint a local rect on the ground map
export function paint(ctx, L, lx0, lz0, lx1, lz1, color, pattern) {
  const [x0, z0, x1, z1] = L.rectW(lx0, lz0, lx1, lz1);
  ctx.ground.rect(x0, z0, x1, z1, color, pattern);
}

// register a local-space box as a collider
export function collide(ctx, L, lcx, lcz, w, d, yTop = 99) {
  const [x, z] = L.toW(lcx, lcz);
  ctx.colliders.addBox(x, z, w / 2, d / 2, L.ry, yTop);
}

export function padHeight(L, cx, cz, w, d) {
  let mx = -Infinity, mn = Infinity;
  for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 0]]) {
    const y = L.yAt(cx + (a * w) / 2, cz + (b * d) / 2);
    mx = Math.max(mx, y);
    mn = Math.min(mn, y);
  }
  return { top: mx, bottom: mn };
}

// windows for one floor along a face, skipping [skipA, skipB]
function windowRow(kit, face, y, rng, o = {}) {
  const len = face.len;
  const n = clamp(Math.round(len / (o.spacing ?? 3.2)), 1, 4);
  const margin = 0.9;
  const usable = len - margin * 2;
  for (let i = 0; i < n; i++) {
    const s = margin + ((i + 0.5) * usable) / n;
    if (o.skip && s > o.skip[0] - 0.9 && s < o.skip[1] + 0.9) continue;
    const kind = o.kind || rng.weighted([['big', 4], ['mid', 4], ['small', 2], ['tall', o.allowTall ? 2 : 0]]);
    let w, h, sill;
    if (kind === 'big') { w = rng.range(1.5, 1.75); h = 1.15; sill = 0.95; }
    else if (kind === 'mid') { w = rng.range(1.1, 1.3); h = 1.05; sill = 1.0; }
    else if (kind === 'small') { w = 0.65; h = 0.85; sill = 1.25; }
    else { w = 1.65; h = 1.85; sill = 0.15; }
    w = Math.min(w, usable / n - 0.4);
    if (w < 0.4) continue;
    windowUnit(kit, face, s, y + sill, w, h, {
      rng,
      frame: o.frame,
      grille: kind === 'small' && rng.chance(0.7) && o.ground,
      shutterBox: (kind === 'big' || kind === 'tall') && rng.chance(o.shutterChance ?? 0.45),
      planter: o.planters && kind === 'mid' && rng.chance(0.25),
    });
  }
}

// ---------------------------------------------------------------------------
// Modern two story house (the most common type)
// ---------------------------------------------------------------------------
export function buildHouse(ctx, lot) {
  const rng = new RNG(lot.seed);
  const L = lotFrame(lot);
  const kit = new Kit(ctx, L.ox, L.oz);
  const t = kit.t;
  kit.begin(L.ox, 0, L.oz, L.ry);

  const hw = Math.min(L.W - 1.8, rng.range(7.2, 9.6));
  const hd = Math.min(L.D - 4.5, rng.range(6.6, 8.8));
  const front = clamp(L.D - hd - rng.range(0.9, 2.2), 3.4, 6.5);
  const side = Math.max(0, (L.W - hw) / 2 - 0.9);
  const cx = rng.range(-side, side);
  const cz = front + hd / 2;
  const pad = padHeight(L, cx, cz, hw, hd);
  const y0 = pad.top + 0.42;
  const f1 = 2.75, f2 = 2.6;
  const yTop = y0 + f1 + f2;
  const wall = rng.pick(WALLS);
  const wall2 = rng.chance(0.3) ? rng.pick(WALLS) : wall;
  const roof = rng.pick(ROOFS);
  const trim = rng.pick(TRIM);
  const wallPat = rng.weighted([[PAT.SIDING, 7], [PAT.NONE, 2], [PAT.BRICK, 0.6]]);

  // foundation + body
  t.box(cx, (pad.bottom - 0.6 + y0) / 2, cz, hw + 0.08, y0 - pad.bottom + 0.6, hd + 0.08, { color: 0xb3afa6, pattern: PAT.CONCRETE });
  t.box(cx, y0 + f1 / 2, cz, hw, f1, hd, { color: wall, pattern: wallPat, ao: 0.1 });
  t.box(cx, y0 + f1 + f2 / 2, cz, hw, f2, hd, { color: wall2, pattern: wallPat === PAT.BRICK ? PAT.SIDING : wallPat });
  t.box(cx, y0 + f1, cz, hw + 0.08, 0.12, hd + 0.08, { color: trim });
  collide(ctx, L, cx, cz, hw + 0.1, hd + 0.1);

  // roof
  const roofType = rng.weighted([['gable', 5], ['hip', 4], ['shed', 1.2]]);
  // solar panels need a long roof face looking along local z, and its real pitch
  let roofSlope = 0, zFaces = false;
  if (roofType === 'gable') {
    const alongX = rng.chance(0.6);
    roofSlope = rng.range(0.38, 0.52);
    zFaces = alongX;
    if (alongX) gableRoof(t, cx, cz, hw, hd, yTop, { color: roof, wallColor: wall2, wallPattern: wallPat, slope: roofSlope, fascia: trim });
    else {
      t.push(new THREE.Matrix4().makeTranslation(cx, 0, cz).multiply(new THREE.Matrix4().makeRotationY(Math.PI / 2)));
      gableRoof(t, 0, 0, hd, hw, yTop, { color: roof, wallColor: wall2, wallPattern: wallPat, slope: roofSlope, fascia: trim });
      t.pop();
    }
  } else if (roofType === 'hip') {
    roofSlope = rng.range(0.38, 0.5);
    zFaces = hw >= hd;
    hipRoof(t, cx, cz, hw, hd, yTop, { color: roof, slope: roofSlope, fascia: trim });
  } else {
    // shed roof sloping toward the back, parapet front
    leanTo(t, cx - hw / 2 - 0.35, cx + hw / 2 + 0.35, cz - hd / 2 - 0.35, cz + hd / 2 + 0.45, yTop + 1.3, 0.13, { color: roof, pattern: PAT.SEAM });
    t.box(cx, yTop + 0.65, cz - hd / 2 + 0.02, hw, 1.3, 0.04, { color: wall2, pattern: wallPat });
    t.box(cx - hw / 2 + 0.02, yTop + 0.65, cz, 0.04, 1.3, hd, { color: wall2, pattern: wallPat });
    t.box(cx + hw / 2 - 0.02, yTop + 0.65, cz, 0.04, 1.3, hd, { color: wall2, pattern: wallPat });
  }

  const F = boxFaces(cx, y0, cz, hw, hd);
  // entrance on the front face
  const doorS = rng.pick([1.4, hw - 1.4, hw / 2]);
  const doorColor = rng.pick([0x8a6a4a, 0x5a4a40, 0xe6e2da, 0x7b8a7a, 0x9a6a50, 0x3e4a5a]);
  door(kit, F.front, doorS, 0, 0.95, 2.1, doorColor, { canopy: rng.chance(0.75) ? trim : null, lamp: true, glass: rng.chance(0.5), seed: rng.int(0, 255) });
  // windows
  const frame = rng.pick([FRAME.alu, FRAME.alu, FRAME.silver, FRAME.white]);
  windowRow(kit, F.front, 0, rng, { skip: [doorS - 0.6, doorS + 0.6], frame, ground: true, shutterChance: 0.5 });
  windowRow(kit, F.front, f1, rng, { frame });
  windowRow(kit, F.left, 0, rng, { frame, ground: true, spacing: 3.6 });
  windowRow(kit, F.left, f1, rng, { frame, spacing: 3.6 });
  windowRow(kit, F.right, 0, rng, { frame, ground: true, spacing: 3.6 });
  windowRow(kit, F.right, f1, rng, { frame, spacing: 3.6 });
  windowRow(kit, F.back, 0, rng, { frame, allowTall: true });

  // balcony (sunny side). Lots facing south get it on the street side.
  const balconyFace = lot.front === 'S' || rng.chance(0.35) ? F.front : F.back;
  const bw = Math.min(hw * rng.range(0.55, 0.85), hw - 0.6);
  const bs = rng.range(bw / 2 + 0.3, hw - bw / 2 - 0.3);
  const by = f1 + 0.05;
  const bf = balconyFace;
  faceBox(t, bf, bs, by - 0.18, bw, 0.18, 0.95, 0.95, 0xd9d6cf, PAT.CONCRETE);
  const solid = rng.chance(0.5);
  if (solid) {
    faceBox(t, bf, bs, by, bw, 1.05, 0.08, 0.95, rng.chance(0.5) ? wall : 0xf2f2ee, wallPat);
    faceBox(t, bf, bs - bw / 2 + 0.04, by, 0.08, 1.05, 0.9, 0.95, wall, wallPat);
    faceBox(t, bf, bs + bw / 2 - 0.04, by, 0.08, 1.05, 0.9, 0.95, wall, wallPat);
  } else {
    const rc = rng.pick([0x5a5e64, 0xd9dcdc, 0x8a7f72]);
    faceBox(t, bf, bs, by + 1.0, bw, 0.06, 0.06, 0.95, rc);
    const n = Math.round(bw / 0.12);
    for (let i = 0; i <= n; i++) faceBox(t, bf, bs - bw / 2 + (bw * i) / n, by, 0.025, 1.0, 0.025, 0.93, rc);
    for (const e of [-1, 1]) faceBox(t, bf, bs + e * (bw / 2 - 0.02), by, 0.04, 1.0, 0.95, 0.95, rc);
  }
  windowUnit(kit, bf, bs, by + 0.12, Math.min(1.7, bw - 0.6), 1.85, { rng, frame, shutterBox: rng.chance(0.4) });
  // laundry or futon
  if (rng.chance(0.65)) {
    const a = fp(bf, bs - bw / 2 + 0.2, by + 1.85, 0.55);
    const b2 = fp(bf, bs + bw / 2 - 0.2, by + 1.85, 0.55);
    const isX = Math.abs(bf.r.x) > 0.5;
    if (isX) laundry(t, Math.min(a.x, b2.x), Math.max(a.x, b2.x), a.y, a.z, rng);
    else {
      t.push(new THREE.Matrix4().makeTranslation(a.x, 0, 0).multiply(new THREE.Matrix4().makeRotationY(Math.PI / 2)));
      laundry(t, -Math.max(a.z, b2.z), -Math.min(a.z, b2.z), a.y, 0, rng);
      t.pop();
    }
  }
  if (rng.chance(0.35)) {
    // futon airing over the railing
    const fc = rng.pick([0xf4f1e8, 0xe9c7c7, 0xc9d8ef, 0xf2e2b0]);
    faceBox(t, bf, bs + rng.range(-0.3, 0.3), by + 0.55, Math.min(1.9, bw - 0.4), 0.6, 0.18, 1.05, fc);
  }

  // AC units, downpipe, antenna, solar panels
  acUnit(t, ...localPt(F.left, rng.range(1, hd - 1), 0, 0.5), -Math.PI / 2);
  if (rng.chance(0.5)) acUnit(t, ...localPt(F.right, rng.range(1, hd - 1), 0, 0.5), Math.PI / 2);
  const dp = fp(F.front, 0.12, 0, 0.12);
  t.cyl(dp.x, y0 - 0.4, dp.z, 0.045, 0.045, yTop - y0 + 0.3, 6, 0x8f8f8a);
  if (rng.chance(0.55)) {
    // TV antenna
    const ax = cx + rng.range(-hw / 4, hw / 4);
    const az = cz;
    const ay = yTop + hd * 0.2;
    t.cyl(ax, ay, az, 0.03, 0.025, 2.4, 5, 0x8c8f94);
    for (let k = 0; k < 2; k++) {
      const yy = ay + 1.6 + k * 0.55;
      t.box(ax, yy, az, 0.04, 0.04, 1.3 - k * 0.3, { color: 0x9a9da2 });
      for (let e = 0; e < 6; e++) t.box(ax, yy, az - 0.5 + e * 0.2, 0.7 - e * 0.07, 0.025, 0.025, { color: 0x9a9da2 });
    }
  }
  // (a hip face narrows toward the ridge: keep the array inside it)
  const span = Math.min(hw * 0.395, roofType === 'hip' ? (hw - hd) / 2 + hd * 0.09 - 0.15 : hw / 2 - 0.4);
  if (rng.chance(0.18) && zFaces && span > 0.9) {
    // solar panels on the sunny slope, lying on the tiles
    const sgn = lot.front === 'N' ? 1 : -1;
    const slope = roofSlope;
    const pz = cz + sgn * hd * 0.25;
    const py = yTop + (hd / 2 - hd * 0.25) * slope + 0.12;
    const m = new THREE.Matrix4().makeTranslation(cx, py, pz).multiply(new THREE.Matrix4().makeRotationX(sgn * Math.atan(slope)));
    t.push(m);
    for (let i = 0; i < 4; i++) t.box(-span + (i + 0.5) * (span / 2), 0, 0, span / 2 - 0.05, 0.05, hd * 0.32, { color: 0x2c3a5a, top: 0x3a4f7c });
    t.pop();
  }

  // service drop point for overhead wires
  const drop = fp(F.front, hw - 0.25, f1 + 2.1, 0.08);
  const [dwx, dwz] = L.toW(drop.x, drop.z);
  ctx.dropPoints.push({ x: dwx, y: drop.y, z: dwz });
  // ---- yard ----
  yard(ctx, kit, L, rng, { cx, cz, hw, hd, front, doorS: cx + hw / 2 - doorS, wall, yPad: pad.top });
  kit.end();
}

// helper: point (x,y,z) on face in local coordinates (for props placed against walls)
function localPt(face, s, y, out) {
  const p = fp(face, s, y, out);
  return [p.x, p.y, p.z];
}

// front yard: parking pad with car / bicycle, plants, mailbox, block wall with gate
function yard(ctx, kit, L, rng, h) {
  const t = kit.t;
  const W = L.W, D = L.D;
  const yAt = L.yAt;
  // ground paint: whole lot gravel/grass, then concrete parking pad
  const groundKind = rng.weighted([['gravel', 3], ['grass', 2], ['dirt', 1]]);
  const gcol = groundKind === 'gravel' ? 0xb9b4aa : groundKind === 'grass' ? 0x93b565 : 0xb79e7e;
  const gpat = groundKind === 'gravel' ? PAT.GRAVEL : groundKind === 'grass' ? PAT.GRASS : PAT.DIRT;
  paint(ctx, L, -W / 2, 0, W / 2, D, gcol, gpat);
  // driveway / parking pad on the side of the front yard away from the door
  const doorX = h.doorS; // local x of door
  const padW = 2.9;
  const padX = doorX > 0 ? -W / 2 + padW / 2 + 0.3 : W / 2 - padW / 2 - 0.3;
  const hasCar = rng.chance(0.55) && h.front > 3.8;
  paint(ctx, L, padX - padW / 2, 0, padX + padW / 2, Math.min(h.front, 5.6), 0xc6c2b9, PAT.CONCRETE);
  // path to the door
  paint(ctx, L, doorX - 0.7, 0, doorX + 0.7, h.front, 0xcfc7b6, PAT.PAVING);
  if (hasCar) {
    parkedCar(kit, padX, Math.min(h.front, 5.6) / 2 + 0.2, Math.PI / 2, rng, yAt);
    collide(ctx, L, padX, Math.min(h.front, 5.6) / 2 + 0.2, 1.7, 3.6, 1.6);
  } else if (rng.chance(0.6)) {
    bicycle(t, padX, yAt(padX, 2) + 0.02, 2.4, Math.PI / 2 + rng.range(-0.2, 0.2), rng.pick([0xd8d8d0, 0x5a8fc4, 0xc44a4a, 0x2f2f2f, 0xe8c84a]));
  }
  if (rng.chance(0.5)) bicycle(t, doorX + (doorX > 0 ? -1.2 : 1.2), yAt(doorX, h.front - 0.8) + 0.02, h.front - 0.8, rng.range(-0.3, 0.3), rng.pick([0xd8d8d0, 0x5a8fc4, 0xf0a0b0]));
  // plants
  const nPlants = rng.int(2, 6);
  for (let i = 0; i < nPlants; i++) {
    const px = doorX + rng.range(-1.6, 1.6);
    const pz = rng.range(0.6, h.front - 0.5);
    if (Math.abs(px - padX) < padW / 2 + 0.3) continue;
    potPlant(t, px, yAt(px, pz), pz, rng);
  }
  // garden tree / shrubs in the corner
  if (rng.chance(0.55)) {
    const gx = padX > 0 ? -W / 2 + 1.2 : W / 2 - 1.2;
    const [wx, wz] = L.toW(gx, rng.range(1.0, Math.max(1.2, h.front - 1)));
    ctx.trees.push({ kind: rng.chance(0.2) ? 'sakuraSmall' : rng.chance(0.25) ? 'pine' : 'shrubTree', x: wx, z: wz, seed: rng.int(1, 1e9) });
  }
  if (rng.chance(0.6)) {
    const [wx, wz] = L.toW(rng.range(-W / 2 + 1, W / 2 - 1), D - 1.0);
    ctx.trees.push({ kind: 'shrubTree', x: wx, z: wz, seed: rng.int(1, 1e9), scale: rng.range(0.8, 1.3) });
  }

  // front wall with gate opening
  const wallH = rng.range(0.9, 1.35);
  const fenceKind = rng.weighted([['block', 6], ['hedge', 2], ['metal', 2], ['none', 1.2]]);
  const wallSeg = (a, b) => {
    if (b - a < 0.3) return;
    const yFn = (lx, lz) => yAt(lx, lz);
    if (fenceKind === 'block') blockWall(t, a, 0.15, b, 0.15, yFn, wallH, { color: rng.chance(0.3) ? 0xd6d0c2 : 0xbab6ad });
    else if (fenceKind === 'hedge') hedge(t, a, 0.4, b, 0.4, yFn, wallH + 0.1);
    else if (fenceKind === 'metal') {
      blockWall(t, a, 0.15, b, 0.15, yFn, 0.35, {});
      metalFence(t, a, 0.15, b, 0.15, (lx, lz) => yFn(lx, lz) + 0.4, 0.8, rng.pick([0xd8dcd8, 0x4a4e52, 0x8a7a66]));
    }
    collideSeg(ctx, L, a, 0.15, b, 0.15);
  };
  if (fenceKind !== 'none') {
    // split by the gate (door path + parking)
    const gA = doorX > padX ? padX - padW / 2 - 0.1 : doorX - 0.75;
    const gB = doorX > padX ? doorX + 0.75 : padX + padW / 2 + 0.1;
    wallSeg(-W / 2, gA);
    if (Math.abs(doorX - padX) > 2.6) {
      // a short wall piece between pad and door path
      const m0 = Math.min(doorX, padX) + (doorX < padX ? 0.75 : padW / 2 + 0.1);
      const m1 = Math.max(doorX, padX) - (doorX < padX ? padW / 2 + 0.1 : 0.75);
      if (m1 - m0 > 0.6) wallSeg(m0, m1);
    }
    wallSeg(gB, W / 2);
    // gate posts with mailbox / nameplate
    const postX = doorX + (doorX > padX ? 0.85 : -0.85);
    const py = yAt(postX, 0.2);
    t.box(postX, py + 0.7, 0.2, 0.35, 1.4, 0.35, { color: rng.pick([0xc9bba5, 0xb0aca4, 0x8a7a6a]), pattern: PAT.STONE });
    t.box(postX, py + 1.05, 0.02, 0.26, 0.12, 0.01, { color: 0xf2efe8 });
  } else {
    mailbox(t, doorX + 1.0, yAt(doorX + 1, 0.3), 0.4, 0, rng.pick([0xd6d2c8, 0xb8483e, 0x5a6c7a]));
  }
  // side + back boundaries (each lot draws its east/right side + back)
  const sideKind = rng.weighted([['block', 5], ['metal', 2], ['hedge', 1]]);
  const yFn = (lx, lz) => yAt(lx, lz);
  if (sideKind === 'hedge') hedge(t, W / 2 - 0.05, 1.5, W / 2 - 0.05, D - 0.2, yFn, 1.1);
  else if (sideKind === 'metal') metalFence(t, W / 2 - 0.05, 0.4, W / 2 - 0.05, D - 0.2, yFn, 1.1, 0xc9ccc8);
  else blockWall(t, W / 2 - 0.08, 0.4, W / 2 - 0.08, D - 0.2, yFn, rng.range(1.0, 1.4));
  collideSeg(ctx, L, W / 2 - 0.08, 0.4, W / 2 - 0.08, D - 0.2);
  blockWall(t, -W / 2, D - 0.12, W / 2, D - 0.12, yFn, rng.range(1.1, 1.5));
  collideSeg(ctx, L, -W / 2, D - 0.12, W / 2, D - 0.12);
  if (L.W > 0 && rng.chance(0.5)) {
    blockWall(t, -W / 2 + 0.08, 0.4, -W / 2 + 0.08, D - 0.2, yFn, rng.range(1.0, 1.3));
    collideSeg(ctx, L, -W / 2 + 0.08, 0.4, -W / 2 + 0.08, D - 0.2);
  }
  // wind chime spot for audio
  if (rng.chance(0.12)) {
    const [wx, wz] = L.toW(h.cx, h.front - 0.2);
    ctx.soundSpots.push({ kind: 'furin', x: wx, y: h.yPad + 2.5, z: wz });
  }
}

export function collideSeg(ctx, L, ax, az, bx, bz, thick = 0.25) {
  const [x0, z0] = L.toW(ax, az);
  const [x1, z1] = L.toW(bx, bz);
  ctx.colliders.addSegment(x0, z0, x1, z1, thick);
}

// ---------------------------------------------------------------------------
// Traditional wooden house with kawara roof, koshi door and a pine garden
// ---------------------------------------------------------------------------
export function buildOldHouse(ctx, lot) {
  const rng = new RNG(lot.seed);
  const L = lotFrame(lot);
  const kit = new Kit(ctx, L.ox, L.oz);
  const t = kit.t;
  kit.begin(L.ox, 0, L.oz, L.ry);
  const hw = Math.min(L.W - 1.6, rng.range(8.5, 10.5));
  const hd = Math.min(L.D - 4.0, rng.range(7.5, 9.0));
  const front = clamp(L.D - hd - 1.0, 3.0, 6.0);
  const cx = 0, cz = front + hd / 2;
  const pad = padHeight(L, cx, cz, hw, hd);
  const y0 = pad.top + 0.5;
  const f1 = 2.85, f2 = 2.5;
  const plaster = rng.pick(['#ebe4d3', '#e5dccb', '#f0ebe0']);
  const wood = rng.pick(['#5e4535', '#6b5040', '#4e3b30']);
  const kc = rng.pick(KAWARA);
  t.box(cx, (pad.bottom - 0.6 + y0) / 2, cz, hw + 0.1, y0 - pad.bottom + 0.6, hd + 0.1, { color: 0xa7a197, pattern: PAT.STONE });
  // ground floor: plaster with wooden wainscot
  t.box(cx, y0 + f1 / 2, cz, hw, f1, hd, { color: plaster, pattern: PAT.NONE });
  t.box(cx, y0 + 0.5, cz, hw + 0.04, 1.0, hd + 0.04, { color: wood, pattern: PAT.BOARDS });
  // wooden posts at corners
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) t.box(cx + (sx * hw) / 2, y0 + f1 / 2, cz + (sz * hd) / 2, 0.16, f1, 0.16, { color: wood });
  // second floor, set back
  const w2 = hw * 0.78, d2 = hd * 0.75;
  const c2z = cz + 0.3;
  t.box(cx, y0 + f1 + f2 / 2, c2z, w2, f2, d2, { color: plaster });
  t.box(cx, y0 + f1 + 0.25, c2z, w2 + 0.04, 0.5, d2 + 0.04, { color: wood, pattern: PAT.BOARDS });
  collide(ctx, L, cx, cz, hw + 0.1, hd + 0.1);
  // first floor eave roof (hip) and main roof
  hipRoof(t, cx, cz, hw, hd, y0 + f1, { color: kc, pattern: PAT.KAWARA, slope: 0.4, ov: 0.75, fascia: wood, soffit: 0x8a7462, th: 0.18 });
  hipRoof(t, cx, c2z, w2, d2, y0 + f1 + f2, { color: kc, pattern: PAT.KAWARA, slope: 0.5, ov: 0.7, fascia: wood, soffit: 0x8a7462, th: 0.2 });
  const F = boxFaces(cx, y0, cz, hw, hd);
  const F2 = boxFaces(cx, y0 + f1, c2z, w2, d2);
  const ds = hw / 2 + rng.range(-1.5, 1.5);
  koshiDoor(kit, F.front, ds, 0, 1.7, 2.1, 0x6a4b35);
  // entrance canopy
  faceBox(t, F.front, ds, 2.35, 2.4, 0.1, 1.0, 1.0, kc, PAT.KAWARA);
  for (const face of [F.front, F.left, F.right, F.back]) {
    windowRow(kit, face, 0, rng, { frame: FRAME.wood, kind: 'big', skip: face === F.front ? [ds - 1.0, ds + 1.0] : null, shutterChance: 0.1, planters: false });
  }
  for (const face of [F2.front, F2.back, F2.left, F2.right]) windowRow(kit, face, 0.1, rng, { frame: FRAME.wood, kind: 'mid' });
  acUnit(t, ...localPt(F.right, hd / 2, 0, 0.5), Math.PI / 2);
  // garden: stone wall or hedge, pine, lantern
  const yFn = (lx, lz) => L.yAt(lx, lz);
  paint(ctx, L, -L.W / 2, 0, L.W / 2, L.D, 0xa9a596, PAT.GRAVEL);
  const gx = hw / 2 - ds; // local x of the door (front face runs toward -x)
  paint(ctx, L, gx - 0.6, 0, gx + 0.6, front, 0xc7c0b2, PAT.STONE);
  const wallKind = rng.weighted([['stone', 3], ['hedge', 3], ['block', 2]]);
  const segs = [[-L.W / 2, gx - 0.9], [gx + 0.9, L.W / 2]];
  for (const [a, b] of segs) {
    if (b - a < 0.4) continue;
    if (wallKind === 'hedge') hedge(t, a, 0.45, b, 0.45, yFn, 1.3, 0x4f8a4a);
    else blockWall(t, a, 0.2, b, 0.2, yFn, wallKind === 'stone' ? 1.1 : 1.3, { color: wallKind === 'stone' ? 0xa59c8e : 0xbab6ad, pattern: wallKind === 'stone' ? PAT.STONE : PAT.BLOCK, thick: wallKind === 'stone' ? 0.35 : 0.15 });
    collideSeg(ctx, L, a, 0.2, b, 0.2, 0.4);
  }
  // wooden gate posts
  for (const e of [-1, 1]) t.box(gx + e * 0.95, L.yAt(gx, 0.2) + 1.1, 0.2, 0.18, 2.2, 0.18, { color: wood });
  t.box(gx, L.yAt(gx, 0.2) + 2.25, 0.2, 2.3, 0.12, 0.35, { color: kc, pattern: PAT.KAWARA });
  blockWall(t, L.W / 2 - 0.1, 0.4, L.W / 2 - 0.1, L.D - 0.2, yFn, 1.2, { color: 0xa59c8e, pattern: PAT.STONE, thick: 0.3 });
  collideSeg(ctx, L, L.W / 2 - 0.1, 0.4, L.W / 2 - 0.1, L.D - 0.2, 0.35);
  blockWall(t, -L.W / 2, L.D - 0.15, L.W / 2, L.D - 0.15, yFn, 1.3, {});
  collideSeg(ctx, L, -L.W / 2, L.D - 0.15, L.W / 2, L.D - 0.15);
  const pineX = gx > 0 ? -L.W / 2 + 2.0 : L.W / 2 - 2.0;
  const [px, pz] = L.toW(pineX, front * 0.55);
  ctx.trees.push({ kind: 'pine', x: px, z: pz, seed: rng.int(1, 1e9), scale: rng.range(0.9, 1.25) });
  // stone lantern
  const lx = pineX + (gx > 0 ? 1.4 : -1.4);
  const ly = L.yAt(lx, front * 0.4);
  stoneLantern(t, lx, ly, front * 0.4, 0.75);
  if (rng.chance(0.5)) {
    const [wx, wz] = L.toW(-pineX * 0.6, L.D - 1.2);
    ctx.trees.push({ kind: rng.chance(0.4) ? 'sakuraSmall' : 'shrubTree', x: wx, z: wz, seed: rng.int(1, 1e9) });
  }
  if (rng.chance(0.3)) ctx.catSpots.push({ x: L.toW(gx + 1.3, 0.2)[0], z: L.toW(gx + 1.3, 0.2)[1], y: L.yAt(gx + 1.3, 0.2) + 1.2, kind: 'wall', ry: L.ry });
  kit.end();
}

export function stoneLantern(b, x, y, z, s = 1) {
  const c = 0xa8a397;
  b.box(x, y + 0.08 * s, z, 0.5 * s, 0.16 * s, 0.5 * s, { color: c, pattern: PAT.STONE });
  b.cyl(x, y + 0.16 * s, z, 0.1 * s, 0.09 * s, 0.6 * s, 6, c, PAT.STONE);
  b.box(x, y + 0.82 * s, z, 0.42 * s, 0.1 * s, 0.42 * s, { color: c });
  b.box(x, y + 1.04 * s, z, 0.3 * s, 0.34 * s, 0.3 * s, { color: c });
  b.box(x, y + 1.04 * s, z, 0.32 * s, 0.14 * s, 0.14 * s, { color: 0x3a3632 });
  b.cyl(x, y + 1.21 * s, z, 0.42 * s, 0.05 * s, 0.24 * s, 6, c, PAT.STONE);
  b.box(x, y + 1.5 * s, z, 0.1 * s, 0.12 * s, 0.1 * s, { color: c });
}

// ---------------------------------------------------------------------------
// Two-story apartment (アパート) with outer corridor and steel stairs
// ---------------------------------------------------------------------------
const APT_NAMES = ['コーポ汐見', 'ハイツ桜ヶ浜', 'メゾン浜風', 'さくら荘', 'グリーンハイツ', 'コーポ海音', 'ひだまり荘', 'サンハイツ'];
export function buildApartment(ctx, lot) {
  const rng = new RNG(lot.seed);
  const L = lotFrame(lot);
  const kit = new Kit(ctx, L.ox, L.oz);
  const t = kit.t;
  kit.begin(L.ox, 0, L.oz, L.ry);
  const hw = Math.min(L.W - 2.4, 15.5);
  const hd = Math.min(L.D - 5.5, 7.6);
  const front = clamp(L.D - hd - 1.3, 3.6, 7.0);
  const cx = -0.6, cz = front + hd / 2;
  const pad = padHeight(L, cx, cz, hw, hd);
  const y0 = pad.top + 0.35;
  const fh = 2.75;
  const wall = rng.pick(['#e9e2d2', '#d9d6cc', '#c9d3d8', '#e6d9c2', '#f0ece2']);
  const roof = rng.pick(ROOFS);
  t.box(cx, (pad.bottom - 0.5 + y0) / 2, cz, hw + 0.08, y0 - pad.bottom + 0.5, hd + 0.08, { color: 0xb3afa6, pattern: PAT.CONCRETE });
  t.box(cx, y0 + fh, cz, hw, fh * 2, hd, { color: wall, pattern: PAT.SIDING, ao: 0.1 });
  collide(ctx, L, cx, cz, hw + 0.1, hd + 0.1);
  gableRoof(t, cx, cz, hw, hd, y0 + fh * 2, { color: roof, wallColor: wall, wallPattern: PAT.SIDING, slope: 0.3, ox: 0.4, oz: 0.45 });
  const F = boxFaces(cx, y0, cz, hw, hd);
  const units = Math.max(2, Math.floor(hw / 3.6));
  const uw = hw / units;
  const doorC = rng.pick([0x5c6a7a, 0x8a6a4a, 0xd9d4ca, 0x6b7f6a]);
  // second floor corridor slab + railing on the front face
  faceBox(t, F.front, hw / 2, fh - 0.2, hw, 0.22, 1.3, 1.3, 0xcfccc4, PAT.CONCRETE);
  faceBox(t, F.front, hw / 2, fh + 0.02, hw, 1.05, 0.08, 1.3, rng.pick([0xe9e6dc, wall]), PAT.SIDING);
  for (let i = 0; i <= units; i++) faceBox(t, F.front, i * uw, 0, 0.14, fh - 0.2, 0.14, 1.25, 0xbcb8b0);
  for (let f = 0; f < 2; f++) {
    for (let u = 0; u < units; u++) {
      const s = u * uw + uw * 0.32;
      door(kit, F.front, s, f * fh + 0.02, 0.85, 2.0, doorC, { lamp: true });
      windowUnit(kit, F.front, s + 1.2, f * fh + 1.05, 0.7, 0.75, { rng, frame: FRAME.silver, grille: true });
      // gas meter box
      faceBox(t, F.front, s - 0.75, f * fh + 1.0, 0.35, 0.5, 0.2, 0.2, 0xd9d9d4);
    }
    // back: windows + small balconies
    for (let u = 0; u < units; u++) {
      const s = u * uw + uw / 2;
      windowUnit(kit, F.back, s, f * fh + 0.12, 1.6, 1.8, { rng, frame: FRAME.silver });
      if (f === 1) {
        faceBox(t, F.back, s, fh - 0.1, uw - 0.15, 0.15, 0.85, 0.85, 0xd0cdc5, PAT.CONCRETE);
        faceBox(t, F.back, s, fh + 0.05, uw - 0.15, 0.95, 0.06, 0.85, 0xd8dbd8);
        if (rng.chance(0.6)) {
          const a = fp(F.back, s - uw / 2 + 0.3, fh + 1.9, 0.5);
          const b2 = fp(F.back, s + uw / 2 - 0.3, fh + 1.9, 0.5);
          laundry(t, Math.min(a.x, b2.x), Math.max(a.x, b2.x), a.y, a.z, rng);
        }
      }
    }
  }
  // steel stairs along the right side, rising toward the corridor
  const steel = 0x7c7f84;
  const steps = 14, run = 0.27, rise = fh / steps;
  const sEnd = hd - 0.2;
  const s0 = sEnd - steps * run;
  for (let i = 0; i < steps; i++) faceBox(t, F.right, s0 + i * run + run / 2, (i + 1) * rise - 0.05, run, 0.05, 0.95, 1.05, steel);
  faceBox(t, F.right, hd + 0.55, fh - 0.2, 1.5, 0.2, 0.95, 1.05, steel);
  for (const out of [0.1, 1.05]) {
    const a = fp(F.right, s0, 0, out), b2 = fp(F.right, sEnd, fh, out);
    t.rod(a, b2, 0.06, 0.06, 4, 0x6c6f74);
    const ha = fp(F.right, s0, 1.0, out), hb = fp(F.right, sEnd, fh + 1.0, out);
    if (out > 1) t.rod(ha, hb, 0.03, 0.03, 4, 0x6c6f74);
  }
  for (const s2 of [hd - 0.15, hd + 1.25]) {
    const a = fp(F.right, s2, 0, 1.0);
    t.box(a.x, a.y + fh / 2, a.z, 0.1, fh, 0.1, { color: steel });
  }
  // name plate
  const name = rng.pick(APT_NAMES);
  const uv = ctx.atlas.draw('apt:' + name, 256, 64, (c, w, h) => drawBoard(c, w, h, { text: name, bg: '#f7f3ea', fg: '#3d4a5c', font: FONTS.mincho, border: '#8b8f96' }));
  signOnFace(kit, F.right, hd * 0.25, 2.0, 1.2, 0.3, 0.02, uv, 0);
  // yard
  paint(ctx, L, -L.W / 2, 0, L.W / 2, L.D, 0xb4afa5, PAT.GRAVEL);
  for (let i = 0; i < units; i++) bicycle(t, cx - hw / 2 + 1 + i * 1.0, L.yAt(0, front - 1.5), front - 1.6, Math.PI / 2 + rng.range(-0.15, 0.15), rng.pick([0xd8d8d0, 0x5a8fc4, 0xc44a4a, 0x2f2f2f, 0xe8c84a, 0x9fd0a0]));
  if (rng.chance(0.6)) {
    parkedCar(kit, cx + hw / 4, front / 2, Math.PI / 2 + Math.PI, rng, L.yAt);
    collide(ctx, L, cx + hw / 4, front / 2, 1.7, 3.6, 1.6);
  }
  const yFn = (lx, lz) => L.yAt(lx, lz);
  blockWall(t, -L.W / 2, 0.15, -L.W / 2 + 2.5, 0.15, yFn, 1.0);
  blockWall(t, L.W / 2 - 4.5, 0.15, L.W / 2, 0.15, yFn, 1.0);
  collideSeg(ctx, L, -L.W / 2, 0.15, -L.W / 2 + 2.5, 0.15);
  collideSeg(ctx, L, L.W / 2 - 4.5, 0.15, L.W / 2, 0.15);
  blockWall(t, L.W / 2 - 0.08, 0.4, L.W / 2 - 0.08, L.D - 0.2, yFn, 1.2);
  blockWall(t, -L.W / 2, L.D - 0.12, L.W / 2, L.D - 0.12, yFn, 1.3);
  collideSeg(ctx, L, L.W / 2 - 0.08, 0.4, L.W / 2 - 0.08, L.D - 0.2);
  collideSeg(ctx, L, -L.W / 2, L.D - 0.12, L.W / 2, L.D - 0.12);
  // vending machine at the corner of some apartments
  if (rng.chance(0.35)) {
    const [vx, vz] = L.toW(L.W / 2 - 1.2, 0.9);
    ctx.vending.push({ x: vx, z: vz, ry: L.ry + Math.PI, seed: rng.int(1, 1e9) });
  }
  kit.end();
}

// ---------------------------------------------------------------------------
// Five story condominium (マンション)
// ---------------------------------------------------------------------------
export function buildMansion(ctx, lot) {
  const rng = new RNG(lot.seed);
  const L = lotFrame(lot);
  const kit = new Kit(ctx, L.ox, L.oz);
  const t = kit.t;
  kit.begin(L.ox, 0, L.oz, L.ry);
  const hw = Math.min(L.W - 3, 17);
  const hd = Math.min(L.D - 6, 10.5);
  const front = clamp(L.D - hd - 1.5, 4.5, 8);
  const cx = 0, cz = front + hd / 2;
  const pad = padHeight(L, cx, cz, hw, hd);
  const y0 = pad.top + 0.3;
  const floors = rng.int(4, 6);
  const fh = 2.95;
  const H = floors * fh;
  const tile = rng.pick(['#d8c7aa', '#e8e0d0', '#b9a58c', '#cfd2d0', '#e3d3c0']);
  t.box(cx, (pad.bottom - 0.5 + y0) / 2, cz, hw + 0.1, y0 - pad.bottom + 0.5, hd + 0.1, { color: 0xb3afa6, pattern: PAT.CONCRETE });
  t.box(cx, y0 + H / 2, cz, hw, H, hd, { color: tile, pattern: PAT.TILE, ao: 0.08 });
  t.box(cx, y0 + H + 0.45, cz, hw + 0.1, 0.9, hd + 0.1, { color: tile, pattern: PAT.TILE });
  t.box(cx - hw / 4, y0 + H + 1.6, cz + hd / 4, 3, 2.4, 3, { color: 0xd8d4cc, pattern: PAT.CONCRETE });
  t.cyl(cx + hw / 4, y0 + H + 0.9, cz, 1.0, 1.0, 1.8, 12, 0xe0ded8, PAT.METAL);
  collide(ctx, L, cx, cz, hw + 0.1, hd + 0.1);
  const F = boxFaces(cx, y0, cz, hw, hd);
  const units = Math.max(2, Math.round(hw / 5.5));
  const uw = hw / units;
  for (let f = 0; f < floors; f++) {
    const y = f * fh;
    for (let u = 0; u < units; u++) {
      const s = u * uw + uw / 2;
      // balcony on the front (street) face for floors >= 1
      if (f >= 1) {
        faceBox(t, F.front, s, y - 0.16, uw - 0.05, 0.2, 1.4, 1.4, 0xe2ded6, PAT.CONCRETE);
        faceBox(t, F.front, s, y + 0.04, uw - 0.05, 1.05, 0.1, 1.4, rng.chance(0.5) ? 0xf0eee8 : tile, PAT.NONE);
        faceBox(t, F.front, s - uw / 2 + 0.03, y, 0.08, fh - 0.2, 1.38, 1.4, 0xe9e6de);
        if (rng.chance(0.4)) {
          const a = fp(F.front, s - uw / 2 + 0.4, y + 1.95, 0.7);
          const b2 = fp(F.front, s + uw / 2 - 0.4, y + 1.95, 0.7);
          laundry(t, Math.min(a.x, b2.x), Math.max(a.x, b2.x), a.y, a.z, rng);
        }
        if (rng.chance(0.5)) acUnit(t, ...localPt(F.front, s + uw / 2 - 0.7, y, 1.0), Math.PI);
      }
      windowUnit(kit, F.front, s - 0.3, y + 0.15, Math.min(2.2, uw - 1.6), 2.0, { rng, frame: FRAME.silver });
      windowUnit(kit, F.back, s, y + 1.0, 1.2, 1.0, { rng, frame: FRAME.silver });
    }
    windowRow(kit, F.left, y, rng, { frame: FRAME.silver, kind: 'mid' });
    windowRow(kit, F.right, y, rng, { frame: FRAME.silver, kind: 'mid' });
  }
  // entrance
  const es = hw - 2.0;
  faceBox(t, F.front, es, 2.6, 3.2, 0.2, 2.2, 2.2, 0xe8e6e0);
  windowUnit(kit, F.front, es, 0.05, 2.0, 2.3, { rng, frame: FRAME.silver, fixed: true });
  const names = ['グランシエル桜ヶ浜', 'パークハイム汐見', 'ライオンズ桜坂', 'シーサイド桜ヶ浜'];
  const nm = rng.pick(names);
  const uv = ctx.atlas.draw('mansion:' + nm, 512, 72, (c, w, h) => drawBoard(c, w, h, { text: nm, bg: '#3b3f46', fg: '#e9e2cf', font: FONTS.mincho, weather: false }));
  signOnFace(kit, F.front, es, 2.85, 2.6, 0.36, 2.21, uv, 0.8);
  paint(ctx, L, -L.W / 2, 0, L.W / 2, L.D, 0xc3bfb6, PAT.CONCRETE);
  // parking in front
  for (let i = 0; i < 3; i++) {
    const x = -L.W / 2 + 2 + i * 2.8;
    if (x > es - hw / 2 - 2.5) break;
    if (rng.chance(0.7)) {
      parkedCar(kit, x, front / 2, Math.PI / 2, rng, L.yAt);
      collide(ctx, L, x, front / 2, 1.7, 3.8, 1.6);
    }
  }
  const yFn = (lx, lz) => L.yAt(lx, lz);
  hedge(t, -L.W / 2, L.D - 0.4, L.W / 2, L.D - 0.4, yFn, 1.2);
  collideSeg(ctx, L, -L.W / 2, L.D - 0.4, L.W / 2, L.D - 0.4, 0.6);
  for (let i = 0; i < 3; i++) {
    const [wx, wz] = L.toW(-L.W / 2 + 1.5 + i * (L.W - 3) / 2, L.D - 1.5);
    ctx.trees.push({ kind: 'shrubTree', x: wx, z: wz, seed: rng.int(1, 1e9), scale: 1.3 });
  }
  kit.end();
}

// ---------------------------------------------------------------------------
// Monthly parking lot (月極駐車場)
// ---------------------------------------------------------------------------
export function buildParking(ctx, lot) {
  const rng = new RNG(lot.seed);
  const L = lotFrame(lot);
  const kit = new Kit(ctx, L.ox, L.oz);
  const t = kit.t;
  kit.begin(L.ox, 0, L.oz, L.ry);
  const asphalt = rng.chance(0.5);
  paint(ctx, L, -L.W / 2, 0, L.W / 2, L.D, asphalt ? 0x7a7b7f : 0xb2ada3, asphalt ? PAT.ASPHALT : PAT.GRAVEL);
  const n = Math.floor((L.W - 1) / 2.6);
  for (let i = 0; i <= n; i++) {
    const x = -L.W / 2 + 0.5 + i * 2.6;
    const y = L.yAt(x, L.D - 3);
    t.box(x, y + 0.01, L.D - 3, 0.1, 0.02, 5, { color: 0xeeeeea });
    if (i < n) {
      // wheel stops
      t.box(x + 1.3, L.yAt(x + 1.3, L.D - 1.0) + 0.06, L.D - 1.0, 1.2, 0.12, 0.15, { color: 0xd0ccc4 });
      if (rng.chance(0.55)) {
        parkedCar(kit, x + 1.3, L.D - 3, rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2, rng, L.yAt);
        collide(ctx, L, x + 1.3, L.D - 3, 1.7, 3.8, 1.6);
      }
    }
  }
  const uv = ctx.atlas.draw('parking-sign', 256, 192, (c, w, h) => {
    c.fillStyle = '#f5f3ec';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#1f5fa8';
    c.fillRect(0, 0, w, h * 0.34);
    c.fillStyle = '#fff';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    fitText(c, '月極駐車場', w * 0.9, h * 0.24, FONTS.gothic, '900');
    c.fillText('月極駐車場', w / 2, h * 0.18);
    c.fillStyle = '#d23b2f';
    fitText(c, '空車あり', w * 0.8, h * 0.2, FONTS.gothic, '900');
    c.fillText('空車あり', w / 2, h * 0.52);
    c.fillStyle = '#333';
    fitText(c, 'お問い合わせ 桜ヶ浜不動産', w * 0.9, h * 0.1, FONTS.gothic, '500');
    c.fillText('お問い合わせ 桜ヶ浜不動産', w / 2, h * 0.75);
    c.fillText('TEL 0467-00-1234', w / 2, h * 0.88);
  });
  const sy = L.yAt(L.W / 2 - 1, 0.3);
  t.box(L.W / 2 - 1.5, sy + 0.9, 0.3, 0.06, 1.8, 0.06, { color: 0x888888 });
  t.box(L.W / 2 - 0.6, sy + 0.9, 0.3, 0.06, 1.8, 0.06, { color: 0x888888 });
  const face = { o: V(L.W / 2 - 0.4, sy, 0.25), r: V(-1, 0, 0), n: V(0, 0, -1), len: 1 };
  signOnFace(kit, face, 0.65, 1.3, 1.2, 0.9, 0.0, uv, 0, 0xe8e8e8);
  // low chain fence posts
  for (let i = 0; i < 5; i++) {
    const x = -L.W / 2 + 0.3 + i * 0.8;
    t.box(x, L.yAt(x, 0.3) + 0.35, 0.3, 0.08, 0.7, 0.08, { color: 0xd8d4c8 });
  }
  const yFn = (lx, lz) => L.yAt(lx, lz);
  blockWall(t, -L.W / 2, L.D - 0.12, L.W / 2, L.D - 0.12, yFn, 1.0);
  collideSeg(ctx, L, -L.W / 2, L.D - 0.12, L.W / 2, L.D - 0.12);
  kit.end();
}

// Vegetable garden (家庭菜園) / vacant grassy lot
export function buildField(ctx, lot) {
  const rng = new RNG(lot.seed);
  const L = lotFrame(lot);
  const kit = new Kit(ctx, L.ox, L.oz);
  const t = kit.t;
  kit.begin(L.ox, 0, L.oz, L.ry);
  paint(ctx, L, -L.W / 2, 0, L.W / 2, L.D, 0x8a6a4c, PAT.DIRT);
  const rows = Math.floor((L.W - 2) / 1.1);
  for (let i = 0; i < rows; i++) {
    const x = -L.W / 2 + 1.2 + i * 1.1;
    paint(ctx, L, x - 0.3, 1.5, x + 0.3, L.D - 1.5, 0x6e4f36, PAT.DIRT);
    const crop = rng.pick(['cabbage', 'leek', 'flower', 'bean']);
    for (let z = 1.8; z < L.D - 1.6; z += crop === 'leek' ? 0.35 : 0.7) {
      const y = L.yAt(x, z);
      if (crop === 'cabbage') {
        const g = new THREE.IcosahedronGeometry(0.22, 0);
        t.geom(g, new THREE.Matrix4().compose(V(x, y + 0.15, z), new THREE.Quaternion(), V(1, 0.75, 1)), 0x8ab86a);
      } else if (crop === 'leek') {
        t.box(x, y + 0.25, z, 0.05, 0.5, 0.05, { color: 0x6aa85a });
      } else if (crop === 'flower') {
        const m = t.identity ? null : t.matrix;
        if (!shrub(x, y + 0.3, z, 0.26, 0.2, rng, { cards: 2, size: 0.24, m, flowers: [rng.pick(GARDEN_FLOWERS)], flowerCards: 2 })) {
          t.box(x, y + 0.2, z, 0.08, 0.4, 0.08, { color: 0x5f9a4c });
          t.box(x, y + 0.45, z, 0.22, 0.12, 0.22, { color: rng.pick([0xffd84a, 0xff9ab0, 0xffffff]) });
        }
      } else {
        // runner beans climbing a pole
        t.box(x, y + 0.6, z, 0.03, 1.2, 0.03, { color: 0x9a8a6a });
        if (!shrub(x, y + 0.75, z, 0.22, 0.42, rng, { cards: 3, size: 0.26, m: t.identity ? null : t.matrix })) {
          const g = new THREE.IcosahedronGeometry(0.25, 0);
          t.geom(g, new THREE.Matrix4().compose(V(x, y + 0.8, z), new THREE.Quaternion(), V(0.8, 1.6, 0.8)), 0x6aa85a);
        }
      }
    }
  }
  // shed
  const sx = L.W / 2 - 1.4, sz = L.D - 1.6;
  const sy = L.yAt(sx, sz);
  t.box(sx, sy + 1.0, sz, 2.0, 2.0, 1.6, { color: 0xc9c6bc, pattern: PAT.CORRUGATED });
  t.box(sx, sy + 2.05, sz, 2.3, 0.08, 1.9, { color: 0x6a7f8a, pattern: PAT.CORRUGATED });
  collide(ctx, L, sx, sz, 2.0, 1.6);
  // scarecrow-free: just a watering can and a hose reel
  t.cyl(-L.W / 2 + 0.8, L.yAt(-L.W / 2 + 0.8, 0.8), 0.8, 0.15, 0.15, 0.3, 8, 0x4f8fd0);
  metalFence(t, -L.W / 2, 0.2, L.W / 2, 0.2, (lx, lz) => L.yAt(lx, lz), 0.9, 0x9aa09a);
  collideSeg(ctx, L, -L.W / 2, 0.2, L.W / 2, 0.2);
  kit.end();
}

export function buildGarden(ctx, lot) {
  const rng = new RNG(lot.seed);
  const L = lotFrame(lot);
  paint(ctx, L, -L.W / 2, 0, L.W / 2, L.D, 0x8fb062, PAT.GRASS);
  const n = rng.int(2, 4);
  for (let i = 0; i < n; i++) {
    const [x, z] = L.toW(rng.range(-L.W / 2 + 2, L.W / 2 - 2), rng.range(2, L.D - 2));
    ctx.trees.push({ kind: rng.chance(0.35) ? 'sakura' : 'broadleaf', x, z, seed: rng.int(1, 1e9), scale: rng.range(0.8, 1.1) });
  }
  const kit = new Kit(ctx, L.ox, L.oz);
  kit.begin(L.ox, 0, L.oz, L.ry);
  metalFence(kit.t, -L.W / 2, 0.2, L.W / 2, 0.2, (lx, lz) => L.yAt(lx, lz), 1.0, 0xc8ccc8);
  collideSeg(ctx, L, -L.W / 2, 0.2, L.W / 2, 0.2);
  kit.end();
  if (rng.chance(0.5)) {
    const [x, z] = L.toW(0, L.D / 2);
    ctx.catSpots.push({ x, z, y: terrainH(x, z), kind: 'grass', ry: rng.range(0, 6.28) });
  }
}

// ---------------------------------------------------------------------------
// Public bath (銭湯) with its tall chimney
// ---------------------------------------------------------------------------
export function buildSento(ctx, lot) {
  const rng = new RNG(lot.seed);
  const L = lotFrame(lot);
  const kit = new Kit(ctx, L.ox, L.oz);
  const t = kit.t;
  kit.begin(L.ox, 0, L.oz, L.ry);
  const hw = Math.min(L.W - 1.5, 11), hd = Math.min(L.D - 3, 12);
  const front = 2.2;
  const cz = front + hd / 2;
  const pad = padHeight(L, 0, cz, hw, hd);
  const y0 = pad.top + 0.3;
  t.box(0, (pad.bottom - 0.5 + y0) / 2, cz, hw + 0.1, y0 - pad.bottom + 0.5, hd + 0.1, { color: 0xa9a49a, pattern: PAT.STONE });
  t.box(0, y0 + 2.4, cz, hw, 4.8, hd, { color: '#efe7d6', ao: 0.1 });
  t.box(0, y0 + 0.6, cz, hw + 0.04, 1.2, hd + 0.04, { color: 0x5d4636, pattern: PAT.BOARDS });
  collide(ctx, L, 0, cz, hw + 0.1, hd + 0.1);
  const kc = 0x5c6674;
  t.push(new THREE.Matrix4().makeTranslation(0, 0, cz).multiply(new THREE.Matrix4().makeRotationY(Math.PI / 2)));
  gableRoof(t, 0, 0, hd, hw, y0 + 4.8, { color: kc, pattern: PAT.KAWARA, wallColor: '#efe7d6', slope: 0.55, ox: 0.8, oz: 0.8, fascia: 0x5d4636, th: 0.22 });
  t.pop();
  const F = boxFaces(0, y0, cz, hw, hd);
  // curved entrance canopy (karahafu approximated by a gable)
  t.push(new THREE.Matrix4().makeTranslation(0, 0, front - 0.5));
  gableRoof(t, 0, 0, 3.4, 1.8, y0 + 3.0, { color: kc, pattern: PAT.KAWARA, wallColor: '#5d4636', slope: 0.6, ox: 0.3, oz: 0.35, fascia: 0x5d4636 });
  t.pop();
  for (const e of [-1, 1]) t.box(e * 1.6, y0 + 1.5, front - 0.5, 0.18, 3.0, 0.18, { color: 0x5d4636 });
  koshiDoor(kit, F.front, hw / 2, 0, 2.6, 2.3, 0x5d4636);
  // noren with ゆ
  const nuv = ctx.atlas.draw('noren-yu', 256, 160, (c, w, h) => {
    c.fillStyle = '#2f4f8a';
    c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(255,255,255,0.15)';
    for (let i = 1; i < 4; i++) c.fillRect((w * i) / 4 - 2, h * 0.25, 4, h);
    c.fillStyle = '#fff';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = `700 ${h * 0.62}px ${FONTS.brush}`;
    c.fillText('ゆ', w / 2, h * 0.52);
  });
  signOnFace(kit, F.front, hw / 2, 1.6, 2.4, 1.0, 0.12, nuv, 0.6);
  const suv = ctx.atlas.draw('sento-sign', 128, 400, (c, w, h) => drawVertical(c, w, h, { text: '汐の湯', bg: '#f3ead8', fg: '#2a2a2a', font: FONTS.brush, border: '#5d4636' }));
  signOnFace(kit, F.front, hw / 2 + 2.3, 1.6, 0.42, 1.4, 0.06, suv, 0.6, 0x5d4636);
  // chimney
  const chx = hw / 2 - 1.2, chz = cz + hd / 2 - 1.5;
  t.cyl(chx, y0, chz, 0.75, 0.48, 20, 10, 0xb7b3ab, PAT.CONCRETE);
  t.cyl(chx, y0 + 15, chz, 0.56, 0.56, 1.0, 10, 0xc23a2e);
  const cuv = ctx.atlas.draw('chimney', 128, 512, (c, w, h) => {
    c.fillStyle = '#b7b3ab';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#2a2a2a';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    const chars = ['汐', 'の', '湯'];
    c.font = `700 ${w * 0.62}px ${FONTS.gothic}`;
    chars.forEach((ch, i) => c.fillText(ch, w / 2, h * 0.2 + i * h * 0.28));
  });
  const face = { o: V(chx + 0.32, y0, chz - 0.62), r: V(-1, 0, 0), n: V(0, 0, -1), len: 1 };
  signOnFace(kit, face, 0.32, 8, 0.55, 4.5, 0.0, cuv, 0);
  collide(ctx, L, chx, chz, 1.5, 1.5);
  paint(ctx, L, -L.W / 2, 0, L.W / 2, front, 0xc9c1b2, PAT.STONE);
  for (let i = 0; i < 3; i++) bicycle(t, -L.W / 2 + 1.2 + i * 0.9, L.yAt(-L.W / 2 + 1.2, 1), 1.0, Math.PI / 2, rng.pick([0xd8d8d0, 0x5a8fc4, 0xc44a4a]));
  ctx.landmarks.push({ id: 'sento', name: '汐の湯', x: L.toW(0, front)[0], z: L.toW(0, front)[1] });
  kit.end();
}
