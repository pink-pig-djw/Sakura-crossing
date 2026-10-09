import * as THREE from 'three';
import { PAT, MeshBuilder } from '../core/builder.js';
import { RAIL_Z, CROSSINGS, STATION, TUNNEL_X, ROADS, terrainH } from './layout.js';
import { Kit, signOnFace } from './kit.js';
import { FONTS, fitText } from '../render/atlas.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
export const RAIL_TOP = 3.26;
const GAUGE = 1.067;
const X_END = 262;

function crossingHalf(x) {
  const r = ROADS.find((q) => q.axis === 'z' && Math.abs(q.c - x) < 0.1 && q.crossing);
  return r ? r.w / 2 + (r.sidewalk || 0) : 2.5;
}

// ---------------------------------------------------------------------------
// static: ballast, sleepers, rails, fences, catenary, tunnel portals
// ---------------------------------------------------------------------------
export function buildTrack(ctx) {
  const zc = RAIL_Z;
  for (let x = -X_END; x < X_END; x += 10) {
    const x1 = x + 10;
    const b = ctx.builders.get('toon', x + 5, zc);
    // ballast prism
    b.quad(V(x, 2.86, zc + 1.9), V(x1, 2.86, zc + 1.9), V(x1, 3.02, zc + 1.25), V(x, 3.02, zc + 1.25), 0x9d9790, PAT.GRAVEL);
    b.quad(V(x1, 2.86, zc - 1.9), V(x, 2.86, zc - 1.9), V(x, 3.02, zc - 1.25), V(x1, 3.02, zc - 1.25), 0x9d9790, PAT.GRAVEL);
    b.quad(V(x, 3.02, zc + 1.25), V(x1, 3.02, zc + 1.25), V(x1, 3.02, zc - 1.25), V(x, 3.02, zc - 1.25), 0x8f8a84, PAT.GRAVEL);
    // sleepers
    for (let sx = x + 0.31; sx < x1; sx += 0.62) {
      if (CROSSINGS.some((c) => Math.abs(sx - c) < crossingHalf(c) + 0.3)) continue;
      b.box(sx, 3.08, zc, 0.22, 0.12, 2.1, { color: 0xb0aca4, pattern: PAT.CONCRETE, skip: 'y' });
    }
    // rails (with a darker web)
    for (const e of [-1, 1]) {
      const rz = zc + (e * GAUGE) / 2;
      b.box(x + 5, RAIL_TOP - 0.06, rz, 10.02, 0.1, 0.07, { color: 0x6f665e, skip: 'y' });
      b.box(x + 5, RAIL_TOP - 0.01, rz, 10.02, 0.03, 0.065, { color: 0xbfc3c6 });
    }
  }
  // fences along the corridor (green mesh), open at crossings and the platform
  const fenceUV = ctx.atlas.draw('fence-mesh', 256, 128, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    c.strokeStyle = '#ffffff';
    c.lineWidth = 2;
    const step = 11;
    for (let i = -h; i < w + h; i += step) {
      c.beginPath();
      c.moveTo(i, 0);
      c.lineTo(i + h, h);
      c.stroke();
      c.beginPath();
      c.moveTo(i + h, 0);
      c.lineTo(i, h);
      c.stroke();
    }
    c.lineWidth = 4;
    c.strokeRect(0, 0, w, h);
  });
  void fenceUV;
  for (const fz of [51.55, 60.0]) {
    let x = -TUNNEL_X + 2;
    while (x < TUNNEL_X - 2) {
      const x1 = Math.min(x + 2.5, TUNNEL_X - 2);
      const mid = (x + x1) / 2;
      const blocked = CROSSINGS.some((c) => Math.abs(mid - c) < crossingHalf(c) + 1.2) || (fz < 55 && mid > STATION.platX0 - 1 && mid < STATION.platX1 + 1);
      if (!blocked) {
        const y = terrainH(mid, fz);
        const b = ctx.builders.get('toon', mid, fz);
        b.box(x, y + 0.7, fz, 0.06, 1.4, 0.06, { color: 0x3f7a55 });
        b.box(mid, y + 1.38, fz, x1 - x, 0.05, 0.05, { color: 0x3f7a55 });
        b.box(mid, y + 0.12, fz, x1 - x, 0.05, 0.05, { color: 0x3f7a55 });
        // chain-link mesh panel (alpha-tested texture, both sides)
        const sb = ctx.builders.get('sign', mid, fz);
        const A = V(x, y + 0.15, fz), Bq = V(x1, y + 0.15, fz), C = V(x1, y + 1.37, fz), D = V(x, y + 1.37, fz);
        const uvs = [[fenceUV.u0, fenceUV.v0], [fenceUV.u1, fenceUV.v0], [fenceUV.u1, fenceUV.v1], [fenceUV.u0, fenceUV.v1]];
        sb.quad(A, Bq, C, D, 0x4f8a62, 0, { uvs, double: true });
        ctx.colliders.addBox(mid, fz, (x1 - x) / 2, 0.1, 0, y + 1.4);
      }
      x = x1;
    }
  }
  // catenary poles + wires
  const poles = [];
  for (let x = -TUNNEL_X + 8; x < TUNNEL_X - 4; x += 42) {
    if (CROSSINGS.some((c) => Math.abs(x - c) < 8)) continue;
    const pz = 52.3;
    const y = terrainH(x, pz);
    const b = ctx.builders.get('toon', x, pz);
    b.box(x, y + 4.4, pz, 0.32, 8.8, 0.32, { color: 0x9da2a6, pattern: PAT.CONCRETE });
    b.box(x, y + 8.25, pz + 2.1, 0.12, 0.14, 4.4, { color: 0x7d8286 });
    b.rod(V(x, y + 7.2, pz), V(x, y + 8.2, zc), 0.035, 0.035, 4, 0x7d8286);
    b.cyl(x, y + 7.75, zc, 0.04, 0.04, 0.4, 4, 0x6d7276);
    poles.push({ x, top: V(x, y + 8.15, zc), contact: V(x, RAIL_TOP + 5.0, zc) });
    if (!(x > STATION.platX0 - 2 && x < STATION.platX1 + 2)) ctx.colliders.addBox(x, pz, 0.2, 0.2, 0);
  }
  const W = ctx.wires;
  for (let i = 0; i < poles.length - 1; i++) {
    W.cable(poles[i].top, poles[i + 1].top, 0.55, 12);
    W.cable(poles[i].contact, poles[i + 1].contact, 0.02, 4);
    // droppers
    for (let k = 1; k < 6; k++) {
      const t = k / 6;
      const a = poles[i].top.clone().lerp(poles[i + 1].top, t);
      a.y -= 0.55 * 4 * t * (1 - t);
      const c = poles[i].contact.clone().lerp(poles[i + 1].contact, t);
      W.pos.push(a.x, a.y, a.z, c.x, c.y, c.z);
    }
  }
  // tunnel portals
  for (const side of [-1, 1]) portal(ctx, side);
  ctx.railPoles = poles;
}

function portal(ctx, side) {
  const x = side * TUNNEL_X;
  const b = ctx.builders.get('toon', x, 60);
  const face = x - side * 0.4;
  // concrete face wall covering the cut
  b.boxMM(Math.min(face, face + side * 1.2), 2.4, 46, Math.max(face, face + side * 1.2), 12.5, 74, { color: 0xb9b5ab, pattern: PAT.CONCRETE, ao: 0.1 });
  // dark openings (rail + road)
  for (const [zc, w, h] of [[RAIL_Z, 5.2, 6.4], [65, 9.0, 6.0]]) {
    const ins = ctx.builders.get('emissive', x, zc);
    void ins;
    const d = ctx.builders.get('toon', x, zc);
    d.boxMM(Math.min(face, face - side * 0.05) - (side > 0 ? 0 : 0), 2.95, zc - w / 2, Math.max(face, face - side * 0.05), 2.95 + h, zc + w / 2, { color: 0x15161a });
    // arch ring
    for (let k = 0; k <= 10; k++) {
      const a = (k / 10) * Math.PI;
      const zz = zc + Math.cos(a) * (w / 2 + 0.3);
      const yy = 2.95 + h - w / 2 + Math.sin(a) * (w / 2 + 0.3);
      d.box(face - side * 0.12, yy, zz, 0.3, 0.45, 0.45, { color: 0xa8a49a, pattern: PAT.CONCRETE });
    }
    // interior tube (dark box, open toward the town)
    d.boxMM(x + (side > 0 ? 0 : -40), 2.9, zc - w / 2 - 0.1, x + (side > 0 ? 40 : 0), 3.0 + h + 0.5, zc + w / 2 + 0.1, { color: 0x101114, skip: side > 0 ? 'x' : 'X' });
  }
  const sign = ctx.atlas.draw('tunnel:' + side, 256, 64, (c, w, h) => {
    c.fillStyle = '#e9e5da';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#2b2b2b';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    fitText(c, side > 0 ? '汐見トンネル' : '稲荷山トンネル', w * 0.9, h * 0.6, FONTS.mincho, '700');
    c.fillText(side > 0 ? '汐見トンネル' : '稲荷山トンネル', w / 2, h * 0.55);
  });
  const kit = new Kit(ctx, x, 65);
  const f = { o: V(face - side * 0.31, 0, 65 + side * 2.0), r: V(0, 0, -side), n: V(-side, 0, 0), len: 4 };
  signOnFace(kit, f, 0, 9.4, 3.2, 0.8, 0.0, sign, 0);
  ctx.colliders.addBox(x, 60, 1.0, 14, 0);
}

// ---------------------------------------------------------------------------
// level crossings (踏切) with animated gates and blinking lamps
// ---------------------------------------------------------------------------
function crossbuck(ctx) {
  return ctx.atlas.draw('crossbuck', 256, 256, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    const bar = (ang) => {
      c.save();
      c.translate(w / 2, h / 2);
      c.rotate(ang);
      c.fillStyle = '#111';
      c.fillRect(-w * 0.5, -h * 0.085, w, h * 0.17);
      c.fillStyle = '#f5c518';
      for (let i = -5; i < 5; i++) {
        c.save();
        c.beginPath();
        c.rect(-w * 0.47, -h * 0.065, w * 0.94, h * 0.13);
        c.clip();
        c.translate(i * h * 0.12, 0);
        c.beginPath();
        c.moveTo(0, -h * 0.1);
        c.lineTo(h * 0.06, -h * 0.1);
        c.lineTo(h * 0.0, h * 0.1);
        c.lineTo(-h * 0.06, h * 0.1);
        c.fill();
        c.restore();
      }
      c.restore();
    };
    bar(Math.PI / 4);
    bar(-Math.PI / 4);
  });
}

function arrowBox(ctx) {
  return ctx.atlas.draw('crossing-arrows', 128, 48, (c, w, h) => {
    c.fillStyle = '#151515';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#3a0d0d';
    c.font = `700 ${h * 0.8}px ${FONTS.gothic}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('◀', w * 0.28, h * 0.55);
    c.fillText('▶', w * 0.72, h * 0.55);
  });
}

export function buildCrossings(ctx, scene) {
  const crossings = [];
  const cross = crossbuck(ctx);
  const arrows = arrowBox(ctx);
  const lampOff = new THREE.Color(0.18, 0.03, 0.03);
  for (const x of CROSSINGS) {
    const half = crossingHalf(x);
    const state = { x, active: false, armT: 0, timer: 0, lampsA: [], lampsB: [], arms: [], blink: 0 };
    // two sides: north (z=51) gate on the west side of the road; south (z=61) on the east
    for (const side of [-1, 1]) {
      const z = side < 0 ? 51.2 : 60.4;
      const px = x + side * -(half + 0.7); // north side: west of road, south side: east of road
      const y = terrainH(px, z);
      const kit = new Kit(ctx, px, z);
      const t = kit.t;
      // signal pole
      t.cyl(px, y, z, 0.07, 0.07, 4.0, 8, 0xf0f0ea, PAT.NONE);
      t.cyl(px, y, z, 0.075, 0.075, 1.2, 8, 0xf2c230, PAT.STRIPES, { caps: false });
      // crossbuck
      const faceOut = side < 0 ? -1 : 1; // faces approaching traffic (away from the track)
      const f = { o: V(px - 0.55 * faceOut, y, z + faceOut * 0.09), r: V(faceOut, 0, 0), n: V(0, 0, faceOut), len: 1.1 };
      signOnFace(kit, f, 0.55, 3.0, 1.1, 1.1, 0.0, cross, 0);
      const fb = { o: V(px + 0.55 * faceOut, y, z - faceOut * 0.09), r: V(-faceOut, 0, 0), n: V(0, 0, -faceOut), len: 1.1 };
      signOnFace(kit, fb, 0.55, 3.0, 1.1, 1.1, 0.0, cross, 0);
      // lamp bar
      t.box(px, y + 2.45, z, 1.1, 0.08, 0.08, { color: 0x222222 });
      for (const k of [-1, 1]) {
        for (const dirz of [-1, 1]) {
          const lx = px + k * 0.45;
          t.cyl(lx, y + 2.2, z + dirz * 0.14, 0.24, 0.24, 0.06, 14, 0x111111, 0, { phase: 0 });
          const g = new THREE.CylinderGeometry(0.13, 0.13, 0.05, 14);
          g.rotateX(Math.PI / 2);
          const mat = new THREE.MeshBasicMaterial({ color: lampOff.clone() });
          const lamp = new THREE.Mesh(g, mat);
          lamp.position.set(lx, y + 2.33, z + dirz * 0.2);
          scene.add(lamp);
          (k < 0 ? state.lampsA : state.lampsB).push(mat);
          // hood
          t.box(lx, y + 2.52, z + dirz * 0.25, 0.32, 0.03, 0.18, { color: 0x111111 });
        }
      }
      // arrows box + speaker
      const fa = { o: V(px - 0.3 * faceOut, y, z + faceOut * 0.1), r: V(faceOut, 0, 0), n: V(0, 0, faceOut), len: 0.6 };
      signOnFace(kit, fa, 0.3, 1.7, 0.6, 0.22, 0.0, arrows, 0);
      t.box(px, y + 1.81, z, 0.62, 0.26, 0.16, { color: 0x151515 });
      t.cyl(px, y + 4.0, z, 0.16, 0.12, 0.3, 8, 0x2a2a2a);
      // gate box + arm (arm is dynamic)
      const gx = px + side * -0.0;
      t.box(gx + side * -0.45, y + 0.55, z - side * 0.45, 0.45, 1.1, 0.4, { color: 0xf2f2ea, ao: 0.1 });
      t.box(gx + side * -0.45, y + 1.12, z - side * 0.45, 0.5, 0.06, 0.45, { color: 0x333333 });
      const armLen = 2 * half + 0.6;
      const ab = new MeshBuilder();
      ab.box(armLen / 2, 0, 0, armLen, 0.09, 0.07, { color: 0xf5c518, pattern: PAT.STRIPES });
      ab.box(0.15, 0, 0, 0.5, 0.16, 0.14, { color: 0x333333 });
      // counterweight
      ab.box(-0.4, 0, 0, 0.5, 0.25, 0.2, { color: 0x333333 });
      const arm = new THREE.Mesh(ab.toGeometry(), ctx.materials ? ctx.materials.toon.material : null);
      arm.castShadow = true;
      arm.receiveShadow = true;
      const pivot = new THREE.Group();
      pivot.position.set(gx + side * -0.45, y + 1.0, z - side * 0.45);
      // arm points across the road: north gate (west side) points +x, south gate (east side) points -x
      pivot.rotation.y = side < 0 ? 0 : Math.PI;
      pivot.add(arm);
      scene.add(pivot);
      state.arms.push({ arm, pivot });
      ctx.colliders.addCircle(px, z, 0.2);
      ctx.colliders.addBox(gx + side * -0.45, z - side * 0.45, 0.25, 0.22, 0);
    }
    crossings.push(state);
  }
  ctx.crossings = crossings;
  return crossings;
}

// ---------------------------------------------------------------------------
// The train (桜ヶ浜線 2-car EMU)
// ---------------------------------------------------------------------------
function destBoard(ctx) {
  return ctx.atlas.draw('train-dest', 256, 64, (c, w, h) => {
    c.fillStyle = '#101010';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#ff9a2a';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    fitText(c, '普通 花見台', w * 0.9, h * 0.62, FONTS.gothic, '700');
    c.fillText('普通 花見台', w / 2, h * 0.55);
  });
}

function buildCar(ctx, cab) {
  const b = new MeshBuilder(); // body (toon)
  const wb = new MeshBuilder(); // windows
  const sb = new MeshBuilder(); // signs (atlas)
  const eb = new MeshBuilder(); // lights
  const L = 17.6, Wd = 2.76, y0 = 1.05, H = 2.75;
  const cream = 0xf4eedd, pink = 0xe7779a;
  // body
  b.box(0, y0 + H / 2, 0, L, H, Wd, { color: cream, ao: 0.08 });
  b.box(0, y0 + H + 0.12, 0, L - 0.4, 0.24, Wd - 0.3, { color: 0xc9cbcc, pattern: PAT.METAL });
  // stripes
  for (const zs of [-1, 1]) {
    b.box(0, y0 + 1.02, zs * (Wd / 2 + 0.005), L - 0.02, 0.22, 0.01, { color: pink });
    b.box(0, y0 + 0.82, zs * (Wd / 2 + 0.005), L - 0.02, 0.05, 0.01, { color: pink });
    b.box(0, y0 + H - 0.18, zs * (Wd / 2 + 0.005), L - 0.02, 0.06, 0.01, { color: 0xa9a6a0 });
  }
  // underframe + bogies
  b.box(0, y0 - 0.25, 0, L - 1.2, 0.5, Wd - 0.5, { color: 0x3b3d42 });
  for (const bx of [-L / 2 + 2.6, L / 2 - 2.6]) {
    b.box(bx, 0.55, 0, 2.6, 0.45, Wd - 0.6, { color: 0x2a2b2f });
    for (const wx of [-0.95, 0.95]) {
      for (const wz of [-GAUGE / 2, GAUGE / 2]) {
        const g = new THREE.CylinderGeometry(0.43, 0.43, 0.1, 14);
        g.rotateX(Math.PI / 2);
        b.geom(g, new THREE.Matrix4().makeTranslation(bx + wx, 0.43, wz), 0x4a4b50);
      }
    }
  }
  // side windows + doors
  const doorXs = [-L / 2 + 3.0, 0, L / 2 - 3.0];
  for (const zs of [-1, 1]) {
    const zz = zs * (Wd / 2 + 0.012);
    const quadW = (x0, x1, ya, yb, seed) => {
      const pts = zs > 0 ? [V(x0, ya, zz), V(x1, ya, zz), V(x1, yb, zz), V(x0, yb, zz)] : [V(x1, ya, zz), V(x0, ya, zz), V(x0, yb, zz), V(x1, yb, zz)];
      wb.quad(pts[0], pts[1], pts[2], pts[3], 0xffffff, seed, { uvs: [[0, 0], [1, 0], [1, 1], [0, 1]] });
    };
    for (const dx of doorXs) {
      b.box(dx, y0 + 1.0, zs * (Wd / 2 + 0.008), 1.3, 2.0, 0.02, { color: 0xe9e3d2 });
      b.box(dx, y0 + 1.0, zs * (Wd / 2 + 0.014), 0.03, 2.0, 0.02, { color: 0x8a8a8a });
      quadW(dx - 0.6, dx - 0.08, y0 + 1.15, y0 + 1.95, 90);
      quadW(dx + 0.08, dx + 0.6, y0 + 1.15, y0 + 1.95, 91);
    }
    for (let i = 0; i < doorXs.length - 1; i++) {
      const a = doorXs[i] + 0.9, c = doorXs[i + 1] - 0.9;
      const n = 2;
      const seg = (c - a) / n;
      for (let k = 0; k < n; k++) quadW(a + k * seg + 0.08, a + (k + 1) * seg - 0.08, y0 + 1.18, y0 + 2.1, 92 + k);
    }
  }
  // ends
  for (const e of [-1, 1]) {
    const ex = e * (L / 2 + 0.005);
    const isCab = cab === e;
    const ptsW = (za, zb, ya, yb, seed) => {
      const P = e > 0 ? [V(ex, ya, za), V(ex, ya, zb), V(ex, yb, zb), V(ex, yb, za)] : [V(ex, ya, zb), V(ex, ya, za), V(ex, yb, za), V(ex, yb, zb)];
      wb.quad(P[0], P[1], P[2], P[3], 0xffffff, seed, { uvs: [[0, 0], [1, 0], [1, 1], [0, 1]] });
    };
    if (isCab) {
      b.box(ex - e * 0.05, y0 + 0.62, 0, 0.12, 0.9, Wd - 0.02, { color: pink });
      ptsW(-Wd / 2 + 0.25, -0.15, y0 + 1.15, y0 + 2.15, 100);
      ptsW(0.15, Wd / 2 - 0.25, y0 + 1.15, y0 + 2.15, 101);
      const P = destBoard(ctx);
      const sz = [V(ex + e * 0.01, y0 + 2.28, e > 0 ? -0.6 : 0.6), V(ex + e * 0.01, y0 + 2.28, e > 0 ? 0.6 : -0.6), V(ex + e * 0.01, y0 + 2.55, e > 0 ? 0.6 : -0.6), V(ex + e * 0.01, y0 + 2.55, e > 0 ? -0.6 : 0.6)];
      sb.quad(sz[0], sz[1], sz[2], sz[3], 0xffffff, 1.2, { uvs: [[P.u0, P.v0], [P.u1, P.v0], [P.u1, P.v1], [P.u0, P.v1]] });
      for (const zs of [-1, 1]) eb.box(ex + e * 0.02, y0 + 0.62, zs * 0.95, 0.04, 0.16, 0.3, { color: 0xfff6dc });
      b.box(ex + e * 0.06, y0 - 0.15, 0, 0.12, 0.3, Wd - 0.2, { color: 0x2a2b2f });
    } else {
      b.box(ex, y0 + 1.2, 0, 0.1, 2.2, 1.0, { color: 0x6a6e74 });
      ptsW(-0.35, 0.35, y0 + 1.25, y0 + 2.0, 102);
    }
  }
  return { b, wb, sb, eb };
}

export function buildTrain(ctx, scene) {
  const group = new THREE.Group();
  group.name = 'train';
  const cars = [];
  for (let i = 0; i < 2; i++) {
    const { b, wb, sb, eb } = buildCar(ctx, i === 0 ? 1 : -1);
    if (i === 0) {
      // pantograph
      const L = 17.6;
      const py = 1.05 + 2.75 + 0.25;
      b.box(-L / 4, py, 0, 1.6, 0.12, 1.2, { color: 0x4a4d52 });
      b.rod(V(-L / 4 - 0.6, py + 0.05, 0), V(-L / 4, py + 1.0, 0), 0.03, 0.03, 4, 0x3a3d42);
      b.rod(V(-L / 4, py + 1.0, 0), V(-L / 4 + 0.5, py + 1.6, 0), 0.03, 0.03, 4, 0x3a3d42);
      b.box(-L / 4 + 0.5, py + 1.62, 0, 0.12, 0.05, 1.6, { color: 0x3a3d42 });
    }
    const car = new THREE.Group();
    const add = (bld, mat, cast = true) => {
      if (bld.empty) return;
      const m = new THREE.Mesh(bld.toGeometry(), mat);
      m.castShadow = cast;
      m.receiveShadow = true;
      car.add(m);
    };
    add(b, ctx.materials.toon.material);
    add(wb, ctx.materials.window.material, false);
    add(sb, ctx.materials.sign.material, false);
    add(eb, ctx.materials.emissive.material, false);
    group.add(car);
    cars.push(car);
  }
  scene.add(group);
  const train = new TrainController(cars, group);
  ctx.train = train;
  return train;
}

const CAR_L = 17.6;
const GAP = 0.6;
const STOP_CENTER = (STATION.platX0 + STATION.platX1) / 2;

export class TrainController {
  constructor(cars, group) {
    this.cars = cars;
    this.group = group;
    this.length = CAR_L * 2 + GAP;
    this.state = 'wait';
    this.dir = -1; // -1 westbound, +1 eastbound
    this.head = X_END + 30; // x of the front coupler
    this.v = 0;
    this.timer = 12;
    this.vMax = 12;
    this.events = [];
    this.blocked = false;
    this.horn = 0;
    this.place();
  }

  get tail() {
    return this.head - this.dir * this.length;
  }

  // x range occupied by the train
  span() {
    return [Math.min(this.head, this.tail), Math.max(this.head, this.tail)];
  }

  stopHead() {
    return STOP_CENTER + this.dir * (this.length / 2);
  }

  update(dt, player) {
    const prevState = this.state;
    switch (this.state) {
      case 'wait':
        this.timer -= dt;
        if (this.timer <= 0) {
          this.state = 'arrive';
          this.head = -this.dir * (X_END + 30) + 0; // start inside the far tunnel
          this.head = this.dir < 0 ? X_END + 20 : -(X_END + 20);
          this.v = this.vMax;
          this.events.push('enter');
        }
        break;
      case 'arrive': {
        const remain = (this.stopHead() - this.head) * this.dir;
        const vTarget = Math.min(this.vMax, Math.sqrt(Math.max(0, 2 * 0.55 * remain)) + 0.15);
        this.v = Math.min(vTarget, this.v + dt * 0.8);
        if (remain <= 0.05) {
          this.v = 0;
          this.head = this.stopHead();
          this.state = 'dwell';
          this.timer = 18;
          this.events.push('arrived');
        }
        break;
      }
      case 'dwell':
        this.timer -= dt;
        if (this.timer < 5 && !this._melody) {
          this._melody = true;
          this.events.push('melody');
        }
        if (this.timer <= 0) {
          this._melody = false;
          this.state = 'depart';
          this.events.push('depart');
        }
        break;
      case 'depart':
        this.v = Math.min(this.vMax, this.v + dt * 0.75);
        if (this.head * this.dir > X_END + 40) {
          this.state = 'wait';
          this.timer = 26;
          this.dir = -this.dir;
          this.v = 0;
          this.events.push('left');
        }
        break;
    }
    // stop for a player standing on the track
    this.blocked = false;
    if (player && this.v > 0 && Math.abs(player.z - RAIL_Z) < 2.0) {
      const ahead = (player.x - this.head) * this.dir;
      if (ahead > 0 && ahead < 45) {
        this.blocked = true;
        const brake = Math.max(0, ahead - 6);
        this.v = Math.min(this.v, Math.sqrt(2 * 2.5 * brake));
        if (this.horn <= 0) {
          this.events.push('horn');
          this.horn = 4;
        }
      }
    }
    this.horn -= dt;
    this.head += this.dir * this.v * dt;
    if (prevState !== this.state) this.stateTime = 0;
    this.place();
  }

  place() {
    for (let i = 0; i < 2; i++) {
      const c = this.head - this.dir * (CAR_L / 2 + i * (CAR_L + GAP));
      const car = this.cars[i];
      car.position.set(c, RAIL_TOP - 0.02, RAIL_Z);
      car.rotation.y = this.dir > 0 ? 0 : Math.PI;
      car.visible = Math.abs(c) < X_END + 25;
    }
  }

  // is the crossing at x needed (train near or approaching)?
  crossingNeeded(x) {
    if (this.state === 'wait') return false;
    const [a, b] = this.span();
    if (x > a - 6 && x < b + 6) return true;
    const ahead = (x - this.head) * this.dir;
    if (this.state === 'dwell') return ahead > 0 && ahead < 30 && this.timer < 7;
    return ahead > 0 && ahead < 150;
  }
}

export function updateCrossings(crossings, train, dt, t) {
  for (const c of crossings) {
    const need = train.crossingNeeded(c.x);
    if (need) c.timer = 3.0;
    else c.timer -= dt;
    c.active = c.timer > 0;
    // arm lowers after a short warning, rises when clear
    const target = c.active && (c.armDelay = (c.armDelay ?? 0) + dt) > 3.5 ? 1 : 0;
    if (!c.active) c.armDelay = 0;
    c.armT += (target - c.armT) * Math.min(1, dt * (target > c.armT ? 1.1 : 1.6));
    const ang = (1 - c.armT) * (Math.PI / 2 - 0.08);
    for (const a of c.arms) a.arm.rotation.z = ang;
    const blink = c.active ? Math.floor(t * 1.7) % 2 : -1;
    for (const m of c.lampsA) m.color.setRGB(blink === 0 ? 4 : 0.18, blink === 0 ? 0.25 : 0.03, blink === 0 ? 0.12 : 0.03);
    for (const m of c.lampsB) m.color.setRGB(blink === 1 ? 4 : 0.18, blink === 1 ? 0.25 : 0.03, blink === 1 ? 0.12 : 0.03);
  }
}
