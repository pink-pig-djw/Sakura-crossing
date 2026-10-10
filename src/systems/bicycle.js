import * as THREE from 'three';
import { MeshBuilder } from '../core/builder.js';
import { createBikeMaterial, G } from '../render/materials.js';
import { groundH } from '../world/layout.js';

// ななみの自転車: a Japanese city bike (ママチャリ) she rides about town.
//
// The model: a step-through U frame in glossy paint, swept-back chrome bars with leather
// grips, brake levers and a bell, a wire basket over the front wheel with a lamp under it,
// mudguards, a chain case, a rear rack and wheel lock, a sprung saddle, 32-spoke wheels on
// a dynamo hub and a three-speed hub, block pedals with reflectors and a two-legged stand.
// Saddle and bars are set for her (from her skeleton). Surfaces carry their kind for the
// bike shader (glossy paint, chrome, rubber, leather, lamp lens, reflectors).
//
// Riding: three gears (each a cruising pace), standing on the pedals for a burst, coasting
// (the freewheel ticks), brakes; the bike leans into turns, pitches with the road, slows
// uphill and runs on downhill, rides over kerbs but not steps or stairs, glances off walls
// it grazes (and stops at ones it meets head on, and at doorways), and slows for people
// ahead. She sits on the saddle with her feet on the pedals
// and her hands on the grips (IK over the idle clip), stands up to pedal hard, puts a foot
// down when stopped, and her hair streams back with the speed. Parked, it stands on its
// stand where she left it.

// surface kinds (see createBikeMaterial)
const MATTE = 0, GLOSS = 1, CHROME = 2, RUBBER = 3, LAMP = 4, REFL = 5, LEATHER = 6;

export const BIKE_COLORS = [
  { name: 'ミント', frame: '#8ccfb8', fender: '#f4efe2', guard: '#f4efe2', saddle: '#7b4f35', grip: '#7b4f35', basket: '#dfe3e8', basketKind: CHROME, bell: '#8ccfb8', wall: '#303036' },
  { name: 'さくら', frame: '#f1b2c3', fender: '#fbf6ef', guard: '#fbf6ef', saddle: '#6c4538', grip: '#f7ede2', basket: '#fbf6ef', basketKind: GLOSS, bell: '#fbf6ef', wall: '#303036' },
  { name: 'クリーム', frame: '#efe0bd', fender: '#efe0bd', guard: '#7c5337', saddle: '#7c5337', grip: '#7c5337', basket: '#b8884f', basketKind: MATTE, bell: '#efe0bd', wall: '#c99862' },
  { name: 'ネイビー', frame: '#2f4b74', fender: '#e8ecf1', guard: '#e8ecf1', saddle: '#3d2c25', grip: '#3d2c25', basket: '#dfe3e8', basketKind: CHROME, bell: '#e8ecf1', wall: '#2c2c31' },
];

// geometry (bike space: +z forward, +x the rider's left, the ground at y = 0 under the
// bottom bracket)
const TYRE = 0.334; // outer radius of a 26 x 1 3/8 tyre
const RA = new THREE.Vector3(0, TYRE, -0.52); // rear axle
const FA = new THREE.Vector3(0, TYRE, 0.56); // front axle
const WB = 1.08; // wheelbase
const BB = new THREE.Vector3(0, 0.27, 0); // bottom bracket
const CRANK = 0.165;
const H_BOT = new THREE.Vector3(0, 0.55, 0.455), H_TOP = new THREE.Vector3(0, 0.8, 0.37); // head tube
const AXIS = H_TOP.clone().sub(H_BOT).normalize(); // steering axis
const PEDAL_X = 0.1;

// the three-speed hub: a cruising pace each (m/s), how briskly she gets there, and the
// distance one turn of the cranks takes the bike (m)
const GEARS = [
  { v: 3.3, acc: 1.7, dev: 3.3 },
  { v: 4.7, acc: 1.35, dev: 4.4 },
  { v: 6.3, acc: 1.05, dev: 5.8 },
];
export const GEAR_COUNT = GEARS.length;

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = THREE.MathUtils.clamp;
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler();

// ---------------------------------------------------------------------------- the fit
// Where the saddle, the bars and her eyes go for a rider, from her rest skeleton: hip
// joints behind and above the bottom bracket, the leg 93 % straight at the far point of the
// pedal circle (ankle above and behind the pedal: the ball of the foot on it); the torso
// leaning forward a little, the arms slightly bent to grips 52 cm apart.
const LEAN = 0.26;
export function bikeFit(rest) {
  const R = rest || {
    hips: V(0, 0.89, 0.004), leftUpperLeg: V(0.075, 0.85, 0), leftLowerLeg: V(0.075, 0.5, -0.007), leftFoot: V(0.075, 0.097, -0.032),
    leftUpperArm: V(0.101, 1.237, -0.025), leftLowerArm: V(0.314, 1.237, -0.025), leftHand: V(0.521, 1.237, -0.025), head: V(0, 1.346, -0.025),
  };
  const L = R.leftUpperLeg.distanceTo(R.leftLowerLeg) + R.leftLowerLeg.distanceTo(R.leftFoot);
  const A = R.leftUpperArm.distanceTo(R.leftLowerArm) + R.leftLowerArm.distanceTo(R.leftHand);
  const ankleUp = 0.1, ankleBack = 0.1, hz = -0.27;
  let hy = 0.85;
  for (let k = 0; k < 24; k++) {
    const dy = hy - BB.y, dz = hz - BB.z, d = Math.hypot(dy, dz);
    const ay = BB.y - (CRANK * dy) / d + ankleUp, az = BB.z - (CRANK * dz) / d - ankleBack;
    hy += (0.93 * L - Math.hypot(hy - ay, hz - az)) * 0.8;
  }
  const hipsY = hy + (R.hips.y - R.leftUpperLeg.y), hipsZ = hz + (R.hips.z - R.leftUpperLeg.z);
  // a point of the upper body, leaning forward with the torso about the hips
  const lean = (p) => {
    const dy = p.y - R.hips.y, dz = p.z - R.hips.z;
    return [hipsY + dy * Math.cos(LEAN) - dz * Math.sin(LEAN), hipsZ + dy * Math.sin(LEAN) + dz * Math.cos(LEAN)];
  };
  const [shY, shZ] = lean(R.leftUpperArm);
  const gripX = 0.26, gripZ = 0.09, reach = 0.88 * A;
  const gripY = clamp(shY - Math.sqrt(Math.max(0.01, reach * reach - (gripX - R.leftUpperArm.x) ** 2 - (gripZ - shZ) ** 2)), 0.94, 1.12);
  const [eyeY, eyeZ] = lean(V(0, R.head.y + 0.075, R.head.z + 0.085));
  return { L, A, hipJY: hy, hipJZ: hz, hipsY, hipsZ, saddleY: hy - 0.075, saddleZ: hz + 0.015, gripX, gripY, gripZ, eyeY, eyeZ, ankleUp, ankleBack };
}

// ---------------------------------------------------------------------------- the model
function curve(points, n, closed = false) {
  return new THREE.CatmullRomCurve3(points, closed, 'centripetal').getPoints(n);
}

// a tyre: a torus about the x axis, its tread darker than the side walls (tan walls on
// the cream bike)
function tyre(b, R, r, tread, wall) {
  const cT = new THREE.Color(tread), cW = new THREE.Color(wall);
  const segU = 64, segV = 12;
  const base = b.count;
  for (let i = 0; i <= segU; i++) {
    const u = (i / segU) * Math.PI * 2;
    for (let j = 0; j <= segV; j++) {
      const v = (j / segV) * Math.PI * 2;
      // (cos v): out along the radius (the tread), (sin v): sideways (the walls)
      const rr = R + r * Math.cos(v);
      const n = V(Math.sin(v), Math.cos(v) * Math.cos(u), Math.cos(v) * Math.sin(u));
      const c = Math.cos(v) > 0.55 ? cT : cW;
      b.vtx(r * Math.sin(v) * 1.05, rr * Math.cos(u), rr * Math.sin(u), n.x, n.y, n.z, c, 0, 0, RUBBER);
    }
  }
  for (let i = 0; i < segU; i++) {
    for (let j = 0; j < segV; j++) {
      const a = base + i * (segV + 1) + j, c = a + segV + 1;
      b.idx.push(a, c, a + 1, a + 1, c, c + 1);
    }
  }
}

// a ring about the x axis (rims, the chain ring)
function ring(b, x, R, r, color, kind, segU = 56, segV = 6) {
  const g = new THREE.TorusGeometry(R, r, segV, segU).rotateY(Math.PI / 2).translate(x, 0, 0);
  b.geom(g, null, color, kind);
}

// a mudguard: a shallow U section swept round the axle `c`, from angle a0 to a1 (0: straight
// up, positive: toward the back), `rad` out, `w` wide; both faces
function fender(b, c, rad, a0, a1, w, color, kind) {
  const n = 28;
  const sec = [[-w, -0.016], [-w * 0.82, 0.002], [-w * 0.4, 0.008], [0, 0.009], [w * 0.4, 0.008], [w * 0.82, 0.002], [w, -0.016]];
  const P = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    const up = V(0, Math.cos(a), -Math.sin(a));
    P.push(sec.map(([x, dr]) => V(x, c.y + up.y * (rad + dr), c.z + up.z * (rad + dr))));
  }
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < sec.length - 1; k++) {
      b.quad(P[i][k], P[i][k + 1], P[i + 1][k + 1], P[i + 1][k], color, kind, { double: true, uvs: [[0, 0], [0, 0], [0, 0], [0, 0]] });
    }
  }
}

// a flat shape drawn in the y-z plane (x: its thickness), extruded with rounded edges
function plate(b, shape, x, depth, color, kind, bevel = 0.004) {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 18 });
  // shape (u, v) -> (z = u, y = v), extruded along -x
  g.rotateY(-Math.PI / 2);
  g.translate(x + depth / 2, 0, 0);
  b.geom(g, null, color, kind);
}

// the saddle: wide behind, a narrow nose, a soft rounded cushion
function saddleShape() {
  const s = new THREE.Shape();
  const pts = [[0, 0.135], [0.03, 0.125], [0.042, 0.06], [0.06, -0.005], [0.095, -0.055], [0.112, -0.092], [0.1, -0.118], [0.06, -0.13], [0, -0.132]];
  s.moveTo(pts[0][0], pts[0][1]);
  const right = pts.slice(1).map(([x, z]) => new THREE.Vector2(x, z));
  const left = pts.slice(0, -1).reverse().map(([x, z]) => new THREE.Vector2(-x, z));
  s.splineThru([...right, ...left]);
  return s;
}

// convex hull of 2D points (counter-clockwise)
function hull(pts) {
  const p = pts.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lo = [], up = [];
  for (const q of p) {
    while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop();
    lo.push(q);
  }
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop();
    up.push(q);
  }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}

export function buildBike(fit, P, mats) {
  const group = new THREE.Group();
  group.name = 'bicycle';
  const frame = new MeshBuilder(), fine = new MeshBuilder();
  const tubeC = (b, pts, r, color, kind, segs = 10) => b.tube(curve(pts, Math.max(8, pts.length * 5)), r, segs, color, kind);
  const rod = (b, a, c, r, color, kind, segs = 8) => b.rod(a, c, r, r, segs, color, kind);
  const fc = P.frame;

  // ---- frame: the U tube, seat tube, stays, head tube
  tubeC(frame, [V(0, 0.585, 0.445), V(0, 0.5, 0.39), V(0, 0.37, 0.27), V(0, 0.29, 0.12), V(0, 0.275, 0.03)], 0.026, fc, GLOSS, 14);
  const ST = V(0, fit.saddleY - 0.2, fit.saddleZ + 0.075); // top of the seat tube
  rod(frame, V(0, BB.y - 0.01, BB.z + 0.005), ST, 0.02, fc, GLOSS, 12);
  // seat-tube collar
  rod(frame, ST.clone().addScaledVector(ST.clone().sub(BB).normalize(), -0.03), ST.clone().addScaledVector(ST.clone().sub(BB).normalize(), 0.012), 0.024, 0xc8ccd2, CHROME, 12);
  rod(frame, H_BOT.clone().addScaledVector(AXIS, -0.03), H_TOP, 0.027, fc, GLOSS, 14);
  // headset cups
  for (const p of [H_BOT.clone().addScaledVector(AXIS, -0.035), H_TOP]) rod(frame, p, p.clone().addScaledVector(AXIS, 0.016), 0.03, 0xc8ccd2, CHROME, 14);
  // bottom bracket shell
  rod(frame, V(-0.045, BB.y, BB.z), V(0.045, BB.y, BB.z), 0.024, fc, GLOSS, 12);
  const seatStay = V(0, ST.y - 0.06, ST.z + 0.02);
  for (const s of [1, -1]) {
    // chain stays and seat stays, flaring to the rear dropouts
    tubeC(frame, [V(s * 0.035, BB.y, BB.z - 0.02), V(s * 0.055, (BB.y + RA.y) / 2 - 0.01, -0.26), V(s * 0.062, RA.y, RA.z + 0.02)], 0.011, fc, GLOSS);
    tubeC(frame, [V(s * 0.022, seatStay.y, seatStay.z), V(s * 0.05, (seatStay.y + RA.y) / 2 + 0.01, (seatStay.z + RA.z) / 2), V(s * 0.062, RA.y + 0.01, RA.z + 0.01)], 0.0095, fc, GLOSS);
    frame.box(s * 0.064, RA.y, RA.z, 0.008, 0.04, 0.05, { color: fc, pattern: GLOSS });
  }
  // chain case: the chain ring (r 0.115) and the rear sprocket (r 0.06) wrapped in one
  // rounded plate on the right (-x)
  {
    const pts = [];
    for (const [cz, cy, r] of [[BB.z, BB.y, 0.118], [RA.z, RA.y, 0.064]]) for (let i = 0; i < 32; i++) pts.push(new THREE.Vector2(cz + Math.cos((i / 32) * Math.PI * 2) * r, cy + Math.sin((i / 32) * Math.PI * 2) * r));
    plate(frame, new THREE.Shape(hull(pts)), -0.088, 0.01, P.guard, GLOSS, 0.005);
  }
  // rear rack (荷台) over the rear wheel, its stays to the axle
  const rackY = 0.715, rk0 = -0.24, rk1 = -0.665;
  for (const s of [1, -1]) {
    rod(frame, V(s * 0.075, rackY, rk0), V(s * 0.075, rackY, rk1), 0.007, 0x9aa0a8, CHROME, 6);
    rod(frame, V(s * 0.075, rackY, rk1), V(s * 0.068, RA.y + 0.02, RA.z - 0.012), 0.0075, 0x9aa0a8, CHROME, 6);
    rod(frame, V(s * 0.075, rackY, -0.45), V(s * 0.066, RA.y + 0.03, RA.z + 0.02), 0.0065, 0x9aa0a8, CHROME, 6);
  }
  for (const z of [rk0, -0.38, -0.52, rk1]) rod(frame, V(-0.075, rackY, z), V(0.075, rackY, z), 0.006, 0x9aa0a8, CHROME, 6);
  for (const x of [-0.025, 0.025]) rod(frame, V(x, rackY + 0.002, rk0), V(x, rackY + 0.002, rk1), 0.006, 0x9aa0a8, CHROME, 6);
  rod(frame, V(0, rackY - 0.005, rk0), V(0, ST.y - 0.08, ST.z - 0.03), 0.007, 0x9aa0a8, CHROME, 6);
  // the rear reflector and the school's permit sticker on the mudguard
  frame.box(0, rackY - 0.035, rk1 - 0.008, 0.07, 0.035, 0.012, { color: 0xd23a3a, pattern: REFL });
  // rear mudguard, a mud flap
  fender(frame, RA, TYRE + 0.03, -0.25, 2.25, 0.03, P.fender, GLOSS);
  {
    const a = 2.25, up = V(0, Math.cos(a), -Math.sin(a));
    const p = V(0, RA.y + up.y * (TYRE + 0.035), RA.z + up.z * (TYRE + 0.035));
    frame.box(0, p.y - 0.03, p.z - 0.008, 0.055, 0.07, 0.006, { color: 0x2a2a2e, pattern: RUBBER });
    // 通学許可 sticker: a white label with the school's pink mark
    const a2 = 1.5, u2 = V(0, Math.cos(a2), -Math.sin(a2));
    const q = V(0, RA.y + u2.y * (TYRE + 0.04), RA.z + u2.z * (TYRE + 0.04));
    frame.box(0, q.y, q.z, 0.05, 0.035, 0.004, { color: 0xfafafa, pattern: GLOSS });
    frame.box(0, q.y, q.z - 0.0025, 0.016, 0.016, 0.002, { color: 0xe2708f, pattern: GLOSS });
  }
  // the wheel lock (後輪錠) on the seat stays, its key
  {
    const ly = RA.y + TYRE + 0.075, lz = RA.z + 0.2;
    frame.box(0, ly, lz, 0.11, 0.05, 0.03, { color: 0x34363c, pattern: GLOSS });
    frame.box(0.045, ly + 0.012, lz + 0.016, 0.012, 0.025, 0.006, { color: 0xc8ccd2, pattern: CHROME });
  }
  // saddle post, springs and the saddle itself
  const postTop = V(0, fit.saddleY - 0.055, fit.saddleZ - 0.005);
  rod(frame, ST.clone().addScaledVector(ST.clone().sub(BB).normalize(), -0.02), postTop, 0.0135, 0xd2d6dc, CHROME, 10);
  frame.box(postTop.x, postTop.y, postTop.z, 0.05, 0.02, 0.06, { color: 0x3a3c42, pattern: MATTE });
  for (const s of [1, -1]) {
    // coil springs under the back of the saddle
    const pts = [];
    const cx = s * 0.058, cz = fit.saddleZ - 0.085, y0 = fit.saddleY - 0.075, y1 = fit.saddleY - 0.02;
    for (let i = 0; i <= 60; i++) {
      const a = (i / 60) * Math.PI * 2 * 5;
      pts.push(V(cx + Math.cos(a) * 0.017, y0 + ((y1 - y0) * i) / 60, cz + Math.sin(a) * 0.017));
    }
    fine.tube(pts, 0.0028, 5, 0x2c2e33, CHROME);
    // rails
    rod(frame, V(s * 0.025, fit.saddleY - 0.04, fit.saddleZ + 0.1), V(cx, fit.saddleY - 0.075, cz), 0.004, 0x2c2e33, CHROME, 5);
    rod(frame, V(s * 0.025, fit.saddleY - 0.04, fit.saddleZ + 0.1), V(0, postTop.y, postTop.z + 0.02), 0.004, 0x2c2e33, CHROME, 5);
    rod(frame, V(cx, fit.saddleY - 0.075, cz), V(0, postTop.y, postTop.z - 0.02), 0.004, 0x2c2e33, CHROME, 5);
  }
  {
    const g = new THREE.ExtrudeGeometry(saddleShape(), { depth: 0.03, bevelEnabled: true, bevelThickness: 0.016, bevelSize: 0.014, bevelSegments: 3, curveSegments: 14 });
    // shape (x, z-forward as y) -> lying flat: rotate so the shape's y runs along +z
    g.rotateX(Math.PI / 2);
    g.computeVertexNormals();
    g.translate(0, fit.saddleY - 0.016, fit.saddleZ);
    frame.geom(g, null, P.saddle, LEATHER);
    // a stitched rim and a little chrome badge at the back
    frame.box(0, fit.saddleY - 0.04, fit.saddleZ - 0.13, 0.05, 0.012, 0.01, { color: 0xc8ccd2, pattern: CHROME });
  }
  // rear brake cable along the frame
  fine.tube(curve([V(0.03, 0.83, 0.33), V(0.032, 0.62, 0.4), V(0.03, 0.42, 0.3), V(0.032, 0.3, 0.1), V(0.04, 0.29, -0.2), V(0.06, RA.y + 0.04, RA.z + 0.08)], 40), 0.0028, 5, 0x1e1f23, RUBBER);

  // ---- the stand (両立スタンド), pivoting on the rear axle: down when parked
  const stand = new THREE.Group();
  stand.position.copy(RA);
  {
    const b = new MeshBuilder();
    const len = RA.y + 0.012;
    for (const s of [1, -1]) {
      b.rod(V(s * 0.078, 0, 0), V(s * 0.085, -len + 0.03, -0.02), 0.0085, 0.0085, 8, 0xa8adb4, CHROME);
      b.rod(V(s * 0.085, -len + 0.03, -0.02), V(s * 0.07, -len + 0.004, -0.045), 0.0085, 0.0085, 8, 0xa8adb4, CHROME);
    }
    b.rod(V(0.07, -len + 0.004, -0.045), V(-0.07, -len + 0.004, -0.045), 0.0085, 0.0085, 8, 0xa8adb4, CHROME);
    b.box(0, -len + 0.012, -0.075, 0.07, 0.012, 0.05, { color: 0x2a2a2e, pattern: RUBBER });
    stand.add(new THREE.Mesh(b.toGeometry(), mats.main));
  }

  // ---- wheels: tyre, chrome rim, hub (dynamo in front, the gear hub behind), 32 spokes
  const wheel = (front) => {
    const w = new THREE.Group();
    const b = new MeshBuilder(), f = new MeshBuilder();
    tyre(b, TYRE - 0.021, 0.021, 0x2e2f34, P.wall);
    ring(b, 0, TYRE - 0.043, 0.0085, 0xdfe3e8, CHROME, 64, 6);
    ring(b, 0.012, TYRE - 0.047, 0.004, 0xc6cad0, CHROME, 64, 4);
    ring(b, -0.012, TYRE - 0.047, 0.004, 0xc6cad0, CHROME, 64, 4);
    const hubR = front ? 0.034 : 0.044, hubW = front ? 0.05 : 0.064;
    b.rod(V(-hubW, 0, 0), V(hubW, 0, 0), hubR, hubR, 16, 0xcfd3d9, CHROME, { bottomCap: true });
    for (const s of [1, -1]) b.rod(V(s * hubW * 0.75, 0, 0), V(s * hubW * 0.95, 0, 0), hubR + 0.01, hubR + 0.01, 16, 0xbfc4ca, CHROME, { bottomCap: true });
    if (!front) {
      // the roller brake drum and the sprocket on the right
      b.rod(V(0.07, 0, 0), V(0.085, 0, 0), 0.06, 0.06, 18, 0x4a4d54, MATTE, { bottomCap: true });
      b.rod(V(-0.07, 0, 0), V(-0.078, 0, 0), 0.05, 0.05, 18, 0x9aa0a8, CHROME, { bottomCap: true });
    }
    // spokes: tangentially laced, alternate sides
    for (let i = 0; i < 32; i++) {
      const s = i % 2 ? 1 : -1;
      const a = (i / 32) * Math.PI * 2;
      const lead = Math.floor(i / 2) % 2 ? 1 : -1;
      const ha = a + lead * 0.95;
      const hub = V(s * hubW * 0.85, Math.cos(ha) * (hubR + 0.006), Math.sin(ha) * (hubR + 0.006));
      const rim = V(s * 0.004, Math.cos(a) * (TYRE - 0.047), Math.sin(a) * (TYRE - 0.047));
      f.rod(hub, rim, 0.0012, 0.0012, 3, 0xd8dce2, CHROME);
    }
    // the valve
    b.rod(V(0, TYRE - 0.05, 0), V(0, TYRE - 0.085, 0), 0.004, 0.004, 6, 0xc8ccd2, CHROME);
    const m1 = new THREE.Mesh(b.toGeometry(), mats.main), m2 = new THREE.Mesh(f.toGeometry(), mats.fine);
    w.add(m1, m2);
    return w;
  };
  const rear = wheel(false);
  rear.position.copy(RA);
  // the rim brake hub's axle nuts and the stand's pivot bolt stay put with the frame
  for (const s of [1, -1]) frame.rod(V(s * 0.072, RA.y, RA.z), V(s * 0.09, RA.y, RA.z), 0.011, 0.011, 6, 0xc8ccd2, CHROME, { bottomCap: true });

  // ---- crank: arms (left down at rest), the chain ring behind the case; pedals each frame
  const crank = new THREE.Group();
  crank.position.copy(BB);
  {
    const b = new MeshBuilder();
    b.rod(V(-0.1, 0, 0), V(0.1, 0, 0), 0.01, 0.01, 8, 0xb8bdc4, CHROME, { bottomCap: true });
    // arms: tapered, rounded
    b.rod(V(0.1, 0, 0), V(0.1, -CRANK, 0), 0.013, 0.01, 8, 0xd2d6dc, CHROME, { bottomCap: true });
    b.rod(V(-0.1, 0, 0), V(-0.1, CRANK, 0), 0.013, 0.01, 8, 0xd2d6dc, CHROME, { bottomCap: true });
    // chain ring (mostly behind the case), its spider
    ring(b, -0.078, 0.1, 0.006, 0x9aa0a8, CHROME, 40, 4);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.3;
      b.rod(V(-0.078, 0, 0), V(-0.078, Math.cos(a) * 0.095, Math.sin(a) * 0.095), 0.006, 0.006, 5, 0x9aa0a8, CHROME);
    }
    crank.add(new THREE.Mesh(b.toGeometry(), mats.main));
  }
  const pedals = [0, 1].map((i) => {
    const s = i ? -1 : 1;
    const b = new MeshBuilder();
    b.rod(V(0, 0, 0), V(s * 0.012, 0, 0), 0.006, 0.006, 6, 0xb8bdc4, CHROME);
    b.box(s * 0.055, 0, 0, 0.085, 0.022, 0.062, { color: 0x2b2c31, pattern: RUBBER });
    for (const z of [0.033, -0.033]) b.box(s * 0.055, 0, z, 0.055, 0.012, 0.004, { color: 0xf0a020, pattern: REFL });
    const m = new THREE.Mesh(b.toGeometry(), mats.main);
    const g = new THREE.Group();
    g.add(m);
    return g;
  });

  // ---- steering: fork, front wheel, mudguard, basket and lamp, stem, bars, grips, levers,
  // bell, the gear shifter; turns about the head tube's axis
  const steer = new THREE.Group();
  const gripL = new THREE.Object3D(), gripR = new THREE.Object3D();
  steer.position.copy(H_BOT);
  const front = wheel(true);
  front.position.copy(FA).sub(H_BOT);
  {
    const s0 = new MeshBuilder(), sf = new MeshBuilder();
    s0.push(new THREE.Matrix4().makeTranslation(-H_BOT.x, -H_BOT.y, -H_BOT.z));
    sf.push(new THREE.Matrix4().makeTranslation(-H_BOT.x, -H_BOT.y, -H_BOT.z));
    // fork crown and blades curving forward to the axle
    const crown = H_BOT.clone().addScaledVector(AXIS, -0.05);
    s0.box(crown.x, crown.y, crown.z, 0.12, 0.025, 0.04, { color: fc, pattern: GLOSS });
    for (const s of [1, -1]) {
      const p1 = crown.clone().add(V(s * 0.05, -0.01, 0));
      const p2 = p1.clone().addScaledVector(AXIS, -0.16);
      tubeC(s0, [p1, p2, V(s * 0.052, FA.y + 0.07, FA.z - 0.01), V(s * 0.05, FA.y, FA.z)], 0.0115, fc, GLOSS);
      s0.box(s * 0.05, FA.y, FA.z, 0.008, 0.035, 0.04, { color: fc, pattern: GLOSS });
      s0.rod(V(s * 0.05, FA.y, FA.z), V(s * 0.065, FA.y, FA.z), 0.01, 0.01, 6, 0xc8ccd2, CHROME, { bottomCap: true });
    }
    // front mudguard and its stays
    fender(s0, FA, TYRE + 0.028, -0.75, 1.65, 0.028, P.fender, GLOSS);
    for (const s of [1, -1]) {
      for (const a of [-0.7, 1.4]) {
        const up = V(0, Math.cos(a), -Math.sin(a));
        sf.rod(V(s * 0.05, FA.y, FA.z), V(s * 0.03, FA.y + up.y * (TYRE + 0.026), FA.z + up.z * (TYRE + 0.026)), 0.0025, 0.0025, 4, 0xc8ccd2, CHROME);
      }
    }
    // stem rising from the head tube, the bar clamp
    const stemTop = H_TOP.clone().addScaledVector(AXIS, fit.gripY - 0.035 - H_TOP.y);
    s0.rod(H_TOP, stemTop, 0.0125, 0.0125, 10, 0xd2d6dc, CHROME);
    const clamp0 = stemTop.clone().add(V(0, 0.01, 0.035));
    s0.rod(stemTop, clamp0, 0.013, 0.013, 10, 0xd2d6dc, CHROME, { bottomCap: true });
    // swept-back bars to the grips (fit.gripX, fit.gripY, fit.gripZ)
    const gy = fit.gripY, gz = fit.gripZ, gx = fit.gripX;
    const gripAt = {};
    const barPts = (s) => [V(0, clamp0.y, clamp0.z), V(s * 0.1, clamp0.y + 0.008, clamp0.z - 0.005), V(s * 0.2, gy + 0.012, clamp0.z - 0.075), V(s * 0.245, gy + 0.004, gz + 0.075), V(s * (gx + 0.035), gy - 0.004, gz - 0.035)];
    for (const s of [1, -1]) {
      const pts = curve(barPts(s), 40);
      s0.tube(pts, 0.011, 10, 0xdfe3e8, CHROME);
      // the grip over the last 11 cm, a rounded end
      const end = pts[pts.length - 1], dir = end.clone().sub(pts[pts.length - 6]).normalize();
      const g0 = end.clone().addScaledVector(dir, -0.11);
      s0.rod(g0, end.clone().addScaledVector(dir, 0.008), 0.0175, 0.0175, 14, P.grip, LEATHER, { bottomCap: true });
      gripAt[s] = { c: end.clone().addScaledVector(dir, -0.05), dir: dir.clone() };
      s0.rod(g0.clone().addScaledVector(dir, -0.006), g0.clone().addScaledVector(dir, 0.004), 0.021, 0.021, 14, P.grip, LEATHER, { bottomCap: true });
      // brake lever in front of the grip, its bracket
      const lv0 = g0.clone().add(V(0, 0.012, 0.03));
      s0.box(g0.x - s * 0.005, g0.y, g0.z + 0.012, 0.026, 0.03, 0.03, { color: 0x3a3c42, pattern: GLOSS });
      s0.tube(curve([lv0, lv0.clone().addScaledVector(dir, 0.05).add(V(0, -0.005, 0.03)), lv0.clone().addScaledVector(dir, 0.1).add(V(0, -0.012, 0.022))], 10), 0.0045, 6, 0xd2d6dc, CHROME);
      // brake cables curving down to the head
      sf.tube(curve([g0.clone().add(V(-s * 0.01, 0.01, 0.03)), g0.clone().add(V(-s * 0.08, 0.06, 0.12)), V(s * 0.04, H_TOP.y + 0.02, H_TOP.z - 0.02)], 16), 0.0028, 5, 0x1e1f23, RUBBER);
      if (s < 0) {
        // the twist shifter by the right grip: 1・2・3
        s0.rod(g0.clone().addScaledVector(dir, -0.035), g0.clone().addScaledVector(dir, -0.008), 0.02, 0.02, 14, 0x3a3c42, GLOSS, { bottomCap: true });
        const w = g0.clone().addScaledVector(dir, -0.022).add(V(0, 0.021, 0));
        s0.box(w.x, w.y, w.z, 0.014, 0.004, 0.012, { color: 0xf3f3f3, pattern: GLOSS });
      } else {
        // the bell on the left, inboard of the grip
        const bp = g0.clone().addScaledVector(dir, -0.04).add(V(0, 0.026, 0));
        const dome = new THREE.SphereGeometry(0.027, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2).translate(bp.x, bp.y, bp.z);
        s0.geom(dome, null, P.bell, GLOSS);
        s0.rod(bp.clone().add(V(0, -0.016, 0)), bp.clone().add(V(0, 0.0, 0)), 0.008, 0.008, 8, 0xc8ccd2, CHROME);
        s0.rod(bp.clone().add(V(0, 0.026, 0)), bp.clone().add(V(0, 0.032, 0)), 0.006, 0.006, 8, 0xc8ccd2, CHROME, { bottomCap: true });
        s0.box(bp.x - 0.012, bp.y - 0.008, bp.z - 0.028, 0.008, 0.008, 0.026, { color: 0xc8ccd2, pattern: CHROME });
      }
    }
    // the basket over the front wheel, on a bracket from the stem and stays to the axle
    const bx0 = -0.185, bx1 = 0.185, bz0 = FA.z - 0.08, bz1 = FA.z + 0.215, by0 = FA.y + TYRE + 0.075, by1 = by0 + 0.225;
    const bc = P.basket, bk = P.basketKind;
    const rr = 0.035; // rounded corners
    const loop = (y, inset = 0) => {
      const pts = [];
      const x0 = bx0 + inset, x1 = bx1 - inset, z0 = bz0 + inset, z1 = bz1 - inset;
      const corners = [[x1 - rr, z1 - rr, 0], [x0 + rr, z1 - rr, Math.PI / 2], [x0 + rr, z0 + rr, Math.PI], [x1 - rr, z0 + rr, Math.PI * 1.5]];
      for (const [cx, cz, a0] of corners) for (let k = 0; k <= 4; k++) pts.push(V(cx + Math.cos(a0 + (k / 4) * (Math.PI / 2)) * rr, y, cz + Math.sin(a0 + (k / 4) * (Math.PI / 2)) * rr));
      pts.push(pts[0].clone());
      return pts;
    };
    s0.tube(loop(by1), 0.0055, 8, bc, bk);
    s0.tube(loop(by0, 0.012), 0.004, 6, bc, bk);
    for (const f of [0.33, 0.66]) sf.tube(loop(by0 + (by1 - by0) * f, 0.012 * (1 - f)), 0.0022, 5, bc, bk);
    // uprights round the sides (woven denser on the cream bike's rattan-like basket)
    const step = bk === MATTE ? 0.026 : 0.042;
    const per = loop(by1);
    let acc = 0;
    for (let i = 1; i < per.length; i++) {
      const a = per[i - 1], b2 = per[i];
      const d = a.distanceTo(b2);
      let t = (step - acc) / d;
      while (t <= 1) {
        const top = a.clone().lerp(b2, t);
        const k = 0.012 / Math.max(1e-3, Math.hypot(top.x, top.z - (bz0 + bz1) / 2));
        const bot = V(top.x * (1 - k), by0, (bz0 + bz1) / 2 + (top.z - (bz0 + bz1) / 2) * (1 - k));
        sf.rod(bot, top, bk === MATTE ? 0.0028 : 0.0021, bk === MATTE ? 0.0028 : 0.0021, 4, bc, bk);
        t += step / d;
      }
      acc = (acc + d) % step;
    }
    // the floor: a grid
    for (let x = bx0 + 0.04; x < bx1 - 0.02; x += 0.05) sf.rod(V(x, by0, bz0 + 0.02), V(x, by0, bz1 - 0.02), 0.002, 0.002, 4, bc, bk);
    for (let z = bz0 + 0.04; z < bz1 - 0.02; z += 0.05) sf.rod(V(bx0 + 0.02, by0, z), V(bx1 - 0.02, by0, z), 0.002, 0.002, 4, bc, bk);
    // bracket to the stem, stays to the axle
    s0.rod(V(0, by0 + 0.06, bz0), stemTop.clone().add(V(0, -0.04, 0.01)), 0.006, 0.006, 6, 0x9aa0a8, CHROME);
    for (const s of [1, -1]) s0.rod(V(s * 0.06, by0, bz0 + 0.08), V(s * 0.062, FA.y, FA.z), 0.0055, 0.0055, 6, 0x9aa0a8, CHROME);
    // the lamp under the basket's front, a chrome bezel and its lens
    const L0 = V(0, by0 - 0.04, bz1 - 0.02);
    s0.rod(L0.clone().add(V(0, 0, -0.06)), L0, 0.028, 0.03, 16, P.frame === '#2f4b74' ? '#e8ecf1' : '#f6f6f2', GLOSS, { bottomCap: true });
    s0.rod(L0, L0.clone().add(V(0, 0, 0.01)), 0.032, 0.032, 18, 0xd2d6dc, CHROME);
    const lens = new THREE.CircleGeometry(0.026, 18).translate(L0.x, L0.y, L0.z + 0.0105);
    s0.geom(lens, null, 0xfff6dd, LAMP);
    s0.rod(L0.clone().add(V(0, 0.02, -0.03)), V(0, by0, bz1 - 0.06), 0.004, 0.004, 5, 0x9aa0a8, CHROME);
    // front reflector on the basket
    s0.box(0, by0 + 0.06, bz1 + 0.004, 0.05, 0.03, 0.006, { color: 0xf2f2f2, pattern: REFL });
    s0.pop();
    sf.pop();
    steer.add(new THREE.Mesh(s0.toGeometry(), mats.main), new THREE.Mesh(sf.toGeometry(), mats.fine), front);
    // where her hands hold the grips (in the steering group, so they turn with the bars):
    // the grip's middle, and its direction (index finger to little finger)
    for (const [s, o] of [[1, gripL], [-1, gripR]]) {
      o.position.copy(gripAt[s].c).sub(H_BOT);
      o.userData.dir = gripAt[s].dir;
      steer.add(o);
    }
  }

  const frameMesh = new THREE.Mesh(frame.toGeometry(), mats.main), fineMesh = new THREE.Mesh(fine.toGeometry(), mats.fine);
  group.add(frameMesh, fineMesh, stand, rear, crank, steer, ...pedals);
  // (the thin parts, spokes, cables and the basket's weave, cast no shadow: too fine for the
  // shadow map to show, and each caster is drawn again for every shadow cascade)
  group.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = o.material !== mats.fine;
      o.receiveShadow = true;
    }
  });
  return { group, rear, front, crank, pedals, steer, stand, grips: [gripL, gripR] };
}

// ---------------------------------------------------------------------------- the lamp's beam
// A pool of warm light on the road ahead at night (an additive decal that follows the ground)
function lampBeam() {
  const NX = 6, NZ = 9;
  const pos = new Float32Array((NX + 1) * (NZ + 1) * 3), uv = [];
  const idx = [];
  for (let j = 0; j <= NZ; j++) for (let i = 0; i <= NX; i++) uv.push(i / NX, j / NZ);
  for (let j = 0; j < NZ; j++) {
    for (let i = 0; i < NX; i++) {
      const a = j * (NX + 1) + i;
      idx.push(a, a + NX + 1, a + 1, a + 1, a + NX + 1, a + NX + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  const m = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
    blendSrcAlpha: THREE.ZeroFactor,
    blendDstAlpha: THREE.OneFactor,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
    uniforms: { uOn: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uOn;
      varying vec2 vUv;
      void main() {
        // brightest a couple of metres ahead, soft at the sides and far end
        float along = vUv.y;
        float across = abs(vUv.x - 0.5) * 2.0;
        float k = smoothstep(0.0, 0.18, along) * (1.0 - smoothstep(0.45, 1.0, along));
        k *= 1.0 - smoothstep(0.35, 1.0, across);
        k += smoothstep(0.5, 0.0, length(vec2(across * 0.8, along - 0.22) * vec2(1.0, 2.2))) * 0.35;
        gl_FragColor = vec4(vec3(1.0, 0.9, 0.72) * k * 0.4 * uOn, 0.0);
      }
    `,
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.frustumCulled = false;
  mesh.renderOrder = 4;
  mesh.userData = { NX, NZ };
  return mesh;
}

// ---------------------------------------------------------------------------- the bicycle
export class Bicycle {
  constructor(world, scene, opts = {}) {
    this.world = world;
    this.scene = scene;
    this.C = world.colliders;
    this.audio = opts.audio || null;
    this.mats = { main: createBikeMaterial({ name: 'bike' }), fine: createBikeMaterial({ name: 'bikeFine', outline: 0.25 }) };
    this.colorIndex = 0;
    this.fit = bikeFit(null);
    this.parts = null;
    this.state = 'off'; // off (parked or not out), mounting, riding, dismounting
    this.k = 0; // 0 standing beside it .. 1 riding
    this.parked = null; // { x, y, z, h } where it stands, or null (not out yet)
    this.x = 0;
    this.y = 0;
    this.z = 0;
    this.h = 0;
    this.v = 0;
    this.gear = 1;
    this.steer = 0; // handlebar angle (rad, + left)
    this.steerVis = 0;
    this.roll = 0;
    this.pitch = 0;
    this.phi = 0; // crank angle (0: left pedal at the bottom)
    this.wheel = 0;
    this.standK = 1;
    this.stand = 0; // out of the saddle (0..1)
    this.footDown = 1; // left foot on the ground (0..1)
    this.stopT = 0;
    this.backT = 0;
    this.pedalling = false;
    this.throttle = 0;
    this.brake = 0;
    this.yF = 0;
    this.yR = 0;
    this.surface = 'hard';
    this.blockedT = 0;
    this.lamp = 0;
    this.ringT = 0;
    this.agents = null; // () => [{ x, z }]: people to slow for
    this.onBlocked = null; // (reason) => void
    this.onRing = null; // (x, z) => void
    this.group = new THREE.Group();
    this.group.name = 'bicycleRoot';
    this.group.rotation.order = 'YXZ';
    this.group.visible = false;
    scene.add(this.group);
    this.beam = lampBeam();
    this.beam.visible = false;
    scene.add(this.beam);
    // E near the parked bike: get on
    this.it = { kind: 'bike', x: 0, z: 0, y: 0, r: 0.9, label: '自転車に乗る', off: true };
    world.interactables.push(this.it);
    // parked, it is in the way of walkers (her too)
    this.solid = this.C.addDynamicBox(0.24, 0.88, 0, 99, -99);
    this.solid.off = true;
    this._build();
  }

  get on() {
    return this.state !== 'off';
  }
  get riding() {
    return this.state === 'riding';
  }

  setColor(i) {
    this.colorIndex = clamp(i | 0, 0, BIKE_COLORS.length - 1);
    this._build();
  }

  // the rider (her skeleton sets the saddle and bar heights)
  setRider(ch) {
    const f = bikeFit(ch?.rest);
    const same = Math.abs(f.saddleY - this.fit.saddleY) < 0.005 && Math.abs(f.gripY - this.fit.gripY) < 0.005;
    this.fit = f;
    if (!same) this._build();
  }

  _build() {
    if (this.parts) {
      this.parts.group.removeFromParent();
      this.parts.group.traverse((o) => o.geometry?.dispose());
    }
    this.parts = buildBike(this.fit, BIKE_COLORS[this.colorIndex], this.mats);
    this.group.add(this.parts.group);
    this._pose();
  }

  // ------------------------------------------------------------------ getting on and off
  // can the bike stand here (heading h) at feet height y? (the wheels clear of walls, not
  // inside a building, not across steps)
  fits(x, z, h, y) {
    const sx = Math.sin(h), sz = Math.cos(h);
    for (const [d, r] of [[0.62, 0.2], [0.05, 0.26], [-0.6, 0.2]]) {
      const p = { x: x + sx * d, z: z + sz * d };
      this.C.resolve(p, r, y - 0.25);
      if (Math.hypot(p.x - x - sx * d, p.z - z - sz * d) > 0.02) return false;
    }
    const yF = this.C.groundAt(x + sx * FA.z, z + sz * FA.z, y + 0.3), yR = this.C.groundAt(x + sx * RA.z, z + sz * RA.z, y + 0.3);
    if (Math.abs(yF - yR) > 0.45) return false;
    if (this._indoors(x, z, y)) return false;
    return true;
  }

  _indoors(x, z, y) {
    return (this.world.indoorRects || []).some((r) => x > r.x0 - 0.3 && x < r.x1 + 0.3 && z > r.z0 - 0.3 && z < r.z1 + 0.3 && y > r.y0 - 0.2 && y < r.y1);
  }

  // get on: the parked bike if it is close by, else brought to where she stands (facing h)
  mount(player, h) {
    if (this.state !== 'off') return null;
    const p = player.pos;
    let x = p.x, z = p.z, hh = h, y = p.y;
    const near = this.parked && Math.hypot(this.parked.x - p.x, this.parked.z - p.z) < 2.6 && Math.abs(this.parked.y - p.y) < 0.8;
    if (near) {
      x = this.parked.x;
      z = this.parked.z;
      hh = this.parked.h;
      y = this.C.groundAt(x, z, this.parked.y + 0.3);
    } else {
      if (player.sitting || player.stairs || !player.onGround) return 'here';
      if (y < groundH(x, z) - 2.5) return 'here'; // underground
      // wheeled up beside her (on her right, else her left, else where she stands)
      const rx = -Math.cos(hh), rz = Math.sin(hh);
      let spot = null;
      for (const d of [0.5, -0.5, 0]) {
        const bx = x + rx * d, bz = z + rz * d;
        const by = this.C.groundAt(bx, bz, y + 0.3);
        if (Math.abs(by - y) < 0.2 && this.fits(bx, bz, hh, by)) {
          spot = [bx, bz, by];
          break;
        }
      }
      if (!spot) return 'here';
      [x, z, y] = spot;
    }
    this.mountFrom = { x: p.x, y: p.y, z: p.z };
    this.x = x;
    this.z = z;
    this.h = hh;
    this._ground(y);
    this.v = 0;
    this.steer = 0;
    this.stopT = 1;
    this.footDown = 1;
    this.state = 'mounting';
    this.solid.off = true;
    this.k = 0;
    this.it.off = true;
    this.parked = null;
    this.group.visible = true;
    player.ride = this;
    player.vel.set(0, 0, 0);
    // the camera settles behind her, a little further out than on foot
    this.boomWalk = player.boom;
    player.boom = Math.max(player.boom, 3.3);
    this.audio?.sfx('bikeStand');
    return 'ok';
  }

  // get off (when stopped; moving, she brakes first)
  dismount() {
    if (this.state === 'riding') this.wantOff = true;
  }

  // ------------------------------------------------------------------ riding
  // inp: { ix, iz (-1..1), boost, brake (0..1, a trigger) }; moves the player with the bike
  drive(dt, inp, P) {
    this.P = P;
    const st = this.state;
    if (st === 'mounting' || st === 'dismounting') {
      // (the camera follows her from where she stood to the saddle, or back down)
      const f = st === 'mounting' ? this.mountFrom : this.offSpot;
      const k = this.k * this.k * (3 - 2 * this.k);
      if (f) P.pos.set(f.x + (this.x - f.x) * k, f.y + (this.y - f.y) * k, f.z + (this.z - f.z) * k);
      else P.pos.set(this.x, this.y, this.z);
      P.vel.set(0, 0, 0);
      P.speed = 0;
      return;
    }
    if (st !== 'riding') return;
    const gear = GEARS[this.gear];
    let throttle = Math.max(0, inp.iz);
    let brake = Math.max(0, -inp.iz, inp.brake || 0);
    if (this.wantOff) {
      throttle = 0;
      brake = 1;
      if (Math.abs(this.v) < 0.35) {
        this.wantOff = false;
        this.v = 0;
        this.state = 'dismounting';
        this.offSpot = this._offSpot();
        P.vel.set(0, 0, 0);
        return;
      }
    }
    const boost = !!inp.boost && throttle > 0.3;
    this.throttle = throttle;
    this.brake = brake;
    this.boosting = boost;
    // people just ahead: ease off (never into anyone)
    let limit = Infinity;
    const sx = Math.sin(this.h), sz = Math.cos(this.h);
    if (this.agents && this.v > 0.3) {
      for (const o of this.agents()) {
        if (o.away || o.home) continue; // (gone home: not about)
        const dx = o.x - this.x, dz = o.z - this.z;
        const fwd = dx * sx + dz * sz, lat = Math.abs(dx * sz - dz * sx);
        if (fwd < 0.3 || fwd > 2.5 + this.v * 0.9 || lat > 0.75) continue;
        limit = Math.min(limit, Math.max(0, (fwd - 1.05) * 1.4));
      }
    }
    // forces along the way: pedals, the slope, rolling and air, brakes
    const slope = (this.yF - this.yR) / WB;
    let a = 0;
    if (throttle > 0.05) {
      // up on the pedals (a burst, or on her own on a climb or pushing off) she pushes harder
      const vt = gear.v * (boost ? 1.22 : 1) * (0.4 + 0.6 * throttle);
      const force = boost ? 1.55 : 1 + 0.4 * this.stand;
      a += gear.acc * force * clamp((vt - this.v) / 0.9, 0, 1) * (this.surface === 'sand' ? 0.4 : 1);
    }
    a -= 9.8 * (slope / Math.sqrt(1 + slope * slope));
    if (Math.abs(this.v) > 0.02) a -= Math.sign(this.v) * ((this.surface === 'sand' ? 1.3 : 0.11) + 0.013 * this.v * this.v);
    let v = this.v;
    if (brake > 0.02 && v > 0) a -= brake * 4.8;
    v += a * dt;
    if (brake > 0.02 && this.v > 0 && v < 0) v = 0;
    // stopped: a foot holds the bike (no rolling back down a slope), a few steps back with
    // the feet when holding the brake
    if (Math.abs(this.v) < 0.12 && throttle < 0.05) {
      this.backT = brake > 0.5 ? this.backT + dt : 0;
      v = this.backT > 0.8 ? -0.65 : 0;
    } else this.backT = 0;
    if (v > limit) v = Math.max(limit, this.v - 6 * dt);
    v = clamp(v, -0.7, 9.5);
    // steering: the bars turn less the faster she goes; turning on the spot at a standstill
    // (shuffling the bike round with her feet)
    const sMax = Math.max(0.12, 0.55 / (1 + 0.32 * Math.abs(v)));
    const want = -clamp(inp.ix, -1, 1) * sMax;
    this.steer += clamp(want - this.steer, -3.2 * dt, 3.2 * dt);
    let w = (v * Math.tan(this.steer)) / WB;
    if (Math.abs(v) < 0.45 && Math.abs(inp.ix) > 0.1) w += -inp.ix * 0.9 * (1 - Math.abs(v) / 0.45);
    const h1 = this.h + w * dt;
    const nx = this.x + Math.sin(h1) * v * dt, nz = this.z + Math.cos(h1) * v * dt;
    const ok = this._try(nx, nz, h1, v);
    this.lastBlock = ok === true ? null : ok;
    let glance = false;
    if (ok !== true && Math.abs(v) > 0.3) {
      // grazing a wall or a kerb: glance off it (the smallest turn away that is free), a
      // little slower, instead of stopping dead
      for (const dh of [0.05, -0.05, 0.1, -0.1, 0.17, -0.17, 0.26, -0.26]) {
        const h2 = h1 + dh, v2 = v * 0.82;
        const x2 = this.x + Math.sin(h2) * v2 * dt, z2 = this.z + Math.cos(h2) * v2 * dt;
        if (this._try(x2, z2, h2, v2) === true) {
          this.x = x2;
          this.z = z2;
          this.h = h2;
          v = v2;
          glance = true;
          break;
        }
      }
    }
    if (ok === true) {
      this.x = nx;
      this.z = nz;
      this.h = h1;
    } else if (glance) {
      this.lastBlock = 'glance';
    } else {
      // blocked: stop (a bump if she was going), still free to turn the bars and the bike
      if (Math.abs(v) > 1.6) this.audio?.sfx('bikeBump');
      if (Math.abs(v) > 1.2) this.onBlocked?.(ok);
      if (this._try(this.x, this.z, h1, 0) === true) this.h = h1;
      v = 0;
    }
    this.v = v;
    this.w = w;
    this._ground(this.y);
    // the camera turns with the bike, and settles behind it while you do not look about
    P.yaw += wrap(this.h - (this.hCam ?? this.h));
    this.hCam = this.h;
    if (P.lookIdle > 1.2 && Math.abs(v) > 0.6) {
      const off = wrap(P.yaw - (this.h + Math.PI));
      P.yaw -= off * Math.min(1, dt * (0.6 + 0.25 * Math.abs(v)));
      P.pitch += (-0.12 - P.pitch) * Math.min(1, dt * 0.8);
    }
    P.pos.set(this.x, this.y, this.z);
    P.vel.set(Math.sin(this.h) * v, 0, Math.cos(this.h) * v);
    P.speed = Math.abs(v);
    P.onGround = true;
    P.vy = 0;
    P.stairs = null;
    P.eyeY = this.y + this.fit.eyeY;
    this.surface = P.surface();
  }

  // the move to (x, z, h) at speed v: true, or why not ('wall', 'step', 'door', 'water')
  _try(x, z, h, v) {
    const C = this.C, y = this.y;
    const sx = Math.sin(h), sz = Math.cos(h);
    for (const [d, r] of [[0.6, 0.2], [0.02, 0.27], [-0.58, 0.2]]) {
      const p = { x: x + sx * d, z: z + sz * d };
      C.resolve(p, r, y - 0.25);
      if (Math.hypot(p.x - x - sx * d, p.z - z - sz * d) > 0.015) return 'wall';
    }
    const yF = C.groundAt(x + sx * FA.z, z + sz * FA.z, y + 0.3), yR = C.groundAt(x + sx * RA.z, z + sz * RA.z, y + 0.3);
    // a kerb is fine (up 21 cm, down 26); a step, a flight of stairs or a drop is not
    const lead = v >= 0 ? yF - this.yF : yR - this.yR;
    if (lead > 0.21 || lead < -0.26 || Math.abs(yF - yR) > 0.3) return 'step';
    if (Math.abs(v) > 0.01 && this._stairsAhead(x, z, h, v >= 0 ? 1 : -1, y)) return 'step';
    const g = yR + (yF - yR) * (-RA.z / WB);
    if (this._indoors(x, z, g)) return 'door';
    if (this.P && !this.P.allowed(x, z, g)) return 'water';
    return true;
  }

  // two or more risers within a metre ahead of the leading wheel: a flight of steps
  _stairsAhead(x, z, h, dir, y) {
    const sx = Math.sin(h) * dir, sz = Math.cos(h) * dir;
    const w0 = dir > 0 ? FA.z : -RA.z;
    let prev = null, edges = 0;
    for (let i = 0; i <= 14; i++) {
      const d = w0 - 0.1 + i * 0.075;
      const g = this.C.groundAt(x + sx * d, z + sz * d, y + 0.3 + Math.max(0, i * 0.075));
      if (prev !== null) {
        const dh = Math.abs(g - prev);
        if (dh > 0.05 && dh < 0.45) edges++;
      }
      prev = g;
    }
    return edges >= 2;
  }

  // the bike on the ground at its position: wheel heights, height, pitch
  _ground(feetY) {
    const sx = Math.sin(this.h), sz = Math.cos(this.h);
    this.yF = this.C.groundAt(this.x + sx * FA.z, this.z + sz * FA.z, feetY + 0.3);
    this.yR = this.C.groundAt(this.x + sx * RA.z, this.z + sz * RA.z, feetY + 0.3);
    this.y = this.yR + (this.yF - this.yR) * (-RA.z / WB);
    this.pitch = Math.atan2(this.yF - this.yR, WB);
  }

  shift(d) {
    const g = clamp(this.gear + d, 0, GEARS.length - 1);
    if (g === this.gear) return false;
    this.gear = g;
    this.audio?.sfx('bikeShift');
    return true;
  }
  setGear(g) {
    if (g === this.gear || g < 0 || g >= GEARS.length) return false;
    this.gear = g;
    this.audio?.sfx('bikeShift');
    return true;
  }

  ring() {
    if (!this.on || this.ringT > 0) return;
    this.ringT = 0.45;
    this.audio?.sfx('bell');
    this.onRing?.(this.x, this.z, this.h);
  }

  // ------------------------------------------------------------------ every frame
  update(dt, P) {
    const st = this.state;
    this.ringT = Math.max(0, this.ringT - dt);
    if (st === 'mounting') {
      this.k = Math.min(1, this.k + dt / 0.5);
      if (this.k >= 1) {
        this.state = 'riding';
        this.hCam = this.h;
      }
    } else if (st === 'dismounting') {
      this.k = Math.max(0, this.k - dt / 0.45);
      if (this.k <= 0) this._park(P);
    }
    if (!this.on && !this.parked) {
      this.group.visible = false;
      this.beam.visible = false;
      this._sound(dt, false);
      return;
    }
    this.group.visible = true;
    const riding = this.state === 'riding';
    // stopped (a foot down) or under way
    const moving = Math.abs(this.v) > 0.25 || (riding && this.throttle > 0.05);
    this.stopT = moving ? 0 : this.stopT + dt;
    const fdWant = !this.on ? 0 : this.state !== 'riding' || (this.stopT > 0.25 && this.v >= -0.05) ? 1 : this.v < 0 ? 1 : 0;
    this.footDown += clamp(fdWant - this.footDown, -dt / 0.3, dt / 0.35);
    // out of the saddle: a burst, a stiff climb, pushing off from a stop
    const climb = (this.yF - this.yR) / WB > 0.06 && this.throttle > 0.5;
    const pushOff = this.throttle > 0.5 && this.v < 1.2 && this.v >= 0;
    const standWant = riding && (this.boosting || climb || pushOff) ? 1 : 0;
    this.stand += clamp(standWant - this.stand, -dt / 0.45, dt / 0.3);
    // the cranks: turning with the wheel while she pedals; coasting, the pedals level off;
    // stopped, the right pedal up and forward, ready to push off
    const gear = GEARS[this.gear];
    this.pedalling = riding && this.throttle > 0.05 && this.v > 0.05;
    if (this.pedalling) this.phi += (this.v / gear.dev) * Math.PI * 2 * dt;
    else {
      const target = this.footDown > 0.5 ? Math.PI * 0.27 : this._nearestLevel();
      const d = wrap(target - this.phi);
      this.phi += clamp(d, -2.5 * dt, 2.5 * dt);
    }
    this.wheel += (this.v / TYRE) * dt;
    // lean into the turn; over onto the foot put down; rocking when out of the saddle
    let lean = clamp((-this.v * (this.w || 0)) / 9.8, -0.4, 0.4);
    lean = lean * (1 - this.footDown) - 0.08 * this.footDown * (this.on ? 1 : 0);
    lean += 0.07 * Math.sin(this.phi) * this.stand * (this.pedalling ? 1 : 0);
    this.roll += (lean - this.roll) * Math.min(1, dt * 5);
    // the bars: following the steering, a slight wobble at a crawl; parked, turned aside
    const barsWant = this.on ? this.steer : 0.32;
    this.steerVis += (barsWant - this.steerVis) * Math.min(1, dt * 10);
    // the stand: down when parked
    const sWant = this.on ? (this.state === 'riding' ? 0 : this.k < 0.6 ? 1 - this.k / 0.6 : 0) : 1;
    this.standK += clamp(sWant - this.standK, -dt / 0.25, dt / 0.25);
    if (!this.on && this.parked) {
      this.x = this.parked.x;
      this.z = this.parked.z;
      this.h = this.parked.h;
    }
    this._pose();
    // the lamp at night (the dynamo hub turns it on while she rides)
    const night = G.uNight.value;
    const lampWant = this.on && night > 0.42 ? 1 : 0;
    this.lamp += (lampWant - this.lamp) * Math.min(1, dt * 4);
    this.mats.main.uniforms.uLamp.value = this.mats.fine.uniforms.uLamp.value = this.lamp;
    this._beam();
    this._sound(dt, this.on);
  }

  _nearestLevel() {
    // pedals level: left back (pi/2) or left forward (3pi/2), whichever is nearer
    const a = wrap(Math.PI / 2 - this.phi), b = wrap(Math.PI * 1.5 - this.phi);
    return this.phi + (Math.abs(a) < Math.abs(b) ? a : b);
  }

  _pose() {
    const g = this.group, B = this.parts;
    if (!B) return;
    const parkedLift = 0.012 * this.standK; // the stand lifts the back wheel a touch
    g.position.set(this.x, this.y + parkedLift * 0.5, this.z);
    g.rotation.set(-this.pitch + parkedLift * 0.4, this.h, this.roll);
    g.updateMatrixWorld(true);
    B.rear.rotation.x = this.wheel;
    B.front.rotation.x = this.wheel;
    B.crank.rotation.x = this.phi;
    B.stand.rotation.x = (1 - this.standK) * 1.9;
    B.steer.quaternion.setFromAxisAngle(AXIS, this.steerVis);
    // pedals on the crank ends, kept level (a little ankle in the stroke)
    B.pedals.forEach((p, i) => {
      const a = this.phi + (i ? Math.PI : 0);
      p.position.set(i ? -PEDAL_X : PEDAL_X, BB.y - CRANK * Math.cos(a), BB.z - CRANK * Math.sin(a));
      p.rotation.x = this.pedalling ? 0.12 * Math.sin(a + 0.6) : 0;
    });
    g.updateMatrixWorld(true);
  }

  _park(P) {
    this.state = 'off';
    this.k = 0;
    this.v = 0;
    this.parked = { x: this.x, y: this.y, z: this.z, h: this.h };
    this.it.x = this.x;
    this.it.z = this.z;
    this.it.y = this.y;
    this.it.off = false;
    this.audio?.sfx('bikeStand');
    if (P) {
      P.ride = null;
      const o = this.offSpot || this._offSpot();
      P.pos.set(o.x, o.y, o.z);
      P.vel.set(0, 0, 0);
      if (this.boomWalk !== undefined) P.boom = this.boomWalk;
    }
    this.offSpot = null;
    const sd = this.solid;
    sd.cx = this.x;
    sd.cz = this.z;
    sd.c = Math.cos(this.h);
    sd.s = Math.sin(this.h);
    sd.yTop = this.y + 1.1;
    sd.yBottom = this.y - 0.3;
    sd.off = false;
  }

  // the parked bike's wheels, for passers-by to walk round (or [])
  obstacles(out) {
    if (this.on || !this.parked) return out;
    const sx = Math.sin(this.h) * 0.5, sz = Math.cos(this.h) * 0.5;
    out.push({ x: this.x + sx, z: this.z + sz }, { x: this.x - sx, z: this.z - sz });
    return out;
  }

  // where she stands after getting off: beside the bike on the left (or the right, or where
  // it stands if both sides are blocked)
  _offSpot() {
    const lx = Math.cos(this.h), lz = -Math.sin(this.h);
    for (const s of [1, -1]) {
      const x = this.x + lx * 0.58 * s - Math.sin(this.h) * 0.05, z = this.z + lz * 0.58 * s - Math.cos(this.h) * 0.05;
      const p = { x, z };
      this.C.resolve(p, 0.3, this.y);
      const g = this.C.groundAt(x, z, this.y + 0.3);
      if (Math.hypot(p.x - x, p.z - z) < 0.02 && Math.abs(g - this.y) < 0.4) return { x, y: g, z, h: this.h };
    }
    return { x: this.x, y: this.y, z: this.z, h: this.h };
  }

  // her lamp's pool of light on the road ahead
  _beam() {
    const m = this.beam, on = this.lamp * smoothstep01(G.uNight.value, 0.35, 0.9);
    m.visible = on > 0.01;
    if (!m.visible) return;
    m.material.uniforms.uOn.value = on;
    const { NX, NZ } = m.userData;
    const pos = m.geometry.attributes.position.array;
    const sx = Math.sin(this.h + this.steerVis * 0.7), sz = Math.cos(this.h + this.steerVis * 0.7);
    const rx = Math.cos(this.h), rz = -Math.sin(this.h);
    let k = 0;
    for (let j = 0; j <= NZ; j++) {
      const t = j / NZ, d = 0.9 + t * 6.5, half = 0.35 + t * 1.6;
      for (let i = 0; i <= NX; i++) {
        const u = (i / NX) * 2 - 1;
        const x = this.x + sx * d + rx * u * half, z = this.z + sz * d + rz * u * half;
        pos[k++] = x;
        pos[k++] = this.C.groundAt(x, z, this.y + 0.4) + 0.05;
        pos[k++] = z;
      }
    }
    m.geometry.attributes.position.needsUpdate = true;
  }

  _sound(dt, on) {
    const A = this.audio;
    if (!A?.bike) return;
    A.bike(dt, {
      on: on && this.state === 'riding',
      v: this.v,
      coast: !this.pedalling,
      pedal: this.pedalling ? this.v / GEARS[this.gear].dev : 0,
      brake: this.brake,
      surface: this.surface,
    });
    // a soft chain sound on each pedal stroke
    if (this.pedalling) {
      const half = Math.floor(this.phi / Math.PI);
      if (half !== this._half) {
        this._half = half;
        A.sfx('bikeStroke');
      }
    }
  }

  // ------------------------------------------------------------------ her on the bike
  // the character's root takes the bike's frame
  placeRider(root) {
    root.rotation.order = 'YXZ';
    root.position.copy(this.group.position);
    root.rotation.copy(this.group.rotation);
  }

  // world position of her eyes (first person)
  eye(out) {
    const lean = 0.05 * this.stand;
    return out.set(0, this.fit.eyeY + 0.06 * this.stand, this.fit.eyeZ + lean).applyMatrix4(this.group.matrixWorld);
  }

  // Over the idle clip: seated on the saddle (or up on the pedals), leaning forward, the feet
  // on the pedals (the left one down on the ground when stopped), the hands on the grips. While
  // getting on or off (k < 1) the pose blends with the clip's.
  pose(ch) {
    const n = ch.node, F = this.fit, B = this.parts;
    const k = this.k;
    if (k <= 0) return;
    const bones = this._bones || (this._bones = ['hips', 'spine', 'chest', 'neck', 'head', 'leftUpperLeg', 'leftLowerLeg', 'leftFoot', 'rightUpperLeg', 'rightLowerLeg', 'rightFoot', 'leftUpperArm', 'leftLowerArm', 'leftHand', 'rightUpperArm', 'rightLowerArm', 'rightHand'].filter((b) => n(b)));
    const blend = k < 0.999;
    let saved = null;
    if (blend) {
      saved = bones.map((b) => n(b).quaternion.clone());
      this._hipsSaved = (this._hipsSaved || new THREE.Vector3()).copy(n('hips').position);
    }
    const S = this.stand, fd = this.footDown;
    const rock = Math.sin(this.phi) * (this.pedalling ? 1 : 0);
    // hips on the saddle; up and forward out of it; slid left a little with a foot down
    const hips = n('hips');
    hips.position.set(0.03 * fd, F.hipsY + 0.11 * S - 0.01 * fd, F.hipsZ + 0.13 * S);
    hips.quaternion.setFromEuler(_e.set(0.14 + 0.2 * S, 0.05 * rock * S, -0.05 * rock * S + 0.04 * fd, 'YXZ'));
    n('spine').quaternion.setFromEuler(_e.set(0.07 + 0.08 * S, -0.03 * rock, 0, 'YXZ'));
    n('chest')?.quaternion.multiply(_q.setFromEuler(_e.set(0.05, 0, 0.03 * rock * S, 'YXZ')));
    // looking ahead, not down at the front wheel
    n('neck')?.quaternion.multiply(_q.setFromAxisAngle(_v.set(1, 0, 0), -0.12 - 0.1 * S));
    n('head')?.quaternion.multiply(_q.setFromAxisAngle(_v.set(1, 0, 0), -0.08 - 0.08 * S));
    for (const s of ['left', 'right']) for (const b of ['UpperLeg', 'LowerLeg', 'Foot', 'UpperArm', 'LowerArm', 'Hand']) n(s + b)?.quaternion.identity();
    const root = ch.root;
    root.updateMatrixWorld(true);
    const rq = root.getWorldQuaternion(_q2);
    for (const [s, i, sx] of [['left', 0, 1], ['right', 1, -1]]) {
      // the foot on its pedal (the ankle above and behind the ball of the foot), or for the
      // left one, on the ground beside the bike when stopped
      const p = B.pedals[i].position;
      const onPedal = _v2.set(p.x - sx * 0.02, p.y + F.ankleUp, p.z - F.ankleBack).applyMatrix4(this.group.matrixWorld);
      let target = onPedal;
      if (s === 'left' && fd > 0) {
        const gx = _v3.set(0.36, 0, 0.04).applyMatrix4(this.group.matrixWorld);
        gx.y = this.C.groundAt(gx.x, gx.z, this.y + 0.3) + ch.ankleHeight;
        target = onPedal.lerp(gx, smooth(fd));
      }
      ch.ik(s + 'UpperLeg', s + 'LowerLeg', s + 'Foot', target.clone(), _v.set(sx * 0.18, 0.2, 1).applyQuaternion(rq));
      // the sole flat on the pedal, a little toe-down at the bottom of the stroke
      const a = this.phi + i * Math.PI;
      const ankle = s === 'left' ? 0.08 * (1 - fd) : 0;
      const pitch = this.pedalling ? 0.1 + 0.14 * Math.sin(a + 0.5) : 0.08;
      ch.setWorldQuaternion(s + 'Foot', _q.copy(rq).multiply(_q3.setFromEuler(_e.set(s === 'left' ? pitch * (1 - fd) + ankle : pitch, sx * 0.05, 0))));
      // the hand over its grip (an overhand grip): the knuckles along the grip, the palm on
      // top of it, the fingers curled round; the wrist behind and above the grip's middle.
      // Hand bones (normalized rig): x along the fingers (left) or back to the wrist (right),
      // y the back of the hand, z the thumb side
      const sq = B.steer.getWorldQuaternion(_q4);
      const out = _v3.copy(B.grips[i].userData.dir).applyQuaternion(sq).normalize();
      const Z = _hz.copy(out).negate();
      const up = _hy.set(0, 1, 0).applyQuaternion(rq);
      const fw = _hx.set(0, 0, 1).applyQuaternion(rq);
      const Y = up.multiplyScalar(Math.cos(0.42)).addScaledVector(fw, Math.sin(0.42));
      Y.addScaledVector(Z, -Y.dot(Z)).normalize();
      const X = _hx.crossVectors(Y, Z).normalize();
      const fingers = _v.copy(X).multiplyScalar(sx);
      const wrist = B.grips[i].getWorldPosition(_v2).addScaledVector(fingers, -0.07).addScaledVector(Y, 0.028);
      ch.ik(s + 'UpperArm', s + 'LowerArm', s + 'Hand', wrist.clone(), _v.set(sx * 0.6, -0.55, -0.45).applyQuaternion(rq));
      ch.setWorldQuaternion(s + 'Hand', _q.setFromRotationMatrix(_hm.makeBasis(X, Y, Z)));
      for (const fg of ['Index', 'Middle', 'Ring', 'Little']) {
        for (const [j, ang] of [['Proximal', 1.15], ['Intermediate', 1.2], ['Distal', 0.7]]) n(s + fg + j)?.quaternion.setFromAxisAngle(_v.set(0, 0, 1), -sx * ang);
      }
      // the thumb round underneath
      n(s + 'ThumbMetacarpal')?.quaternion.setFromEuler(_e.set(0, -sx * 0.35, -sx * 0.25));
      n(s + 'ThumbProximal')?.quaternion.setFromAxisAngle(_v.set(0, 1, 0), -sx * 0.55);
      n(s + 'ThumbDistal')?.quaternion.setFromAxisAngle(_v.set(0, 1, 0), -sx * 0.45);
    }
    if (blend) {
      const t = smooth(k);
      bones.forEach((b, j) => n(b).quaternion.copy(saved[j].slerp(n(b).quaternion, t)));
      hips.position.lerpVectors(this._hipsSaved, hips.position, t);
    }
    // a skirt drapes forward over the saddle as on a seat
    if (ch.sitHips) ch._hipsY = THREE.MathUtils.lerp(ch.hipsHeight, ch.sitHips, k * (1 - 0.6 * S));
  }
}

const _q3 = new THREE.Quaternion(), _q4 = new THREE.Quaternion();
const _hx = new THREE.Vector3(), _hy = new THREE.Vector3(), _hz = new THREE.Vector3(), _hm = new THREE.Matrix4();
const smooth = (t) => t * t * (3 - 2 * t);
const smoothstep01 = (x, a, b) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
