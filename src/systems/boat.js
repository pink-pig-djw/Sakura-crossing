import * as THREE from 'three';
import { MeshBuilder, PAT } from '../core/builder.js';
import { terrainH, seaEdge } from '../world/layout.js';
import { G } from '../render/materials.js';
import { NOISE } from '../render/glsl.js';
import { FONTS } from '../render/atlas.js';
import { LANDING_Y } from '../world/pier.js';

// Her boat (さくら丸): a little clinker-built wooden dinghy with an outboard on the transom and a
// lantern on a pole at the stern, moored at the landing under さくら桟橋 (or the harbour's). E
// at the landing: she steps down into it and sits on the stern thwart, a hand on the tiller.
// W / S throttle ahead and astern, A / D the tiller, Shift (RT) full ahead. It slides a little
// in the turns, lifts its bow with speed, bobs and rolls on the swell, leaves a wake and throws
// spray from its bow, and at dusk the lantern comes on. Brought alongside a landing, E ties it
// up and she steps out.

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const clamp = THREE.MathUtils.clamp;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const smooth = (t) => t * t * (3 - 2 * t);
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion(), _e = new THREE.Euler();
const _hx = new THREE.Vector3(), _hy = new THREE.Vector3(), _hz = new THREE.Vector3(), _hm = new THREE.Matrix4();

// ---------------------------------------------------------------------------- the hull
// local frame: +z the bow, +x port (her left), y = 0 the waterline
export const HULL = { L: 4.3, beam: 1.56, draft: 0.3 };
const ZS = -HULL.L / 2, ZB = HULL.L / 2;
const FLOOR = -0.1;
// where she sits (the stern thwart, a little to port of the tiller) and its top
const SEAT = { x: 0.28, y: 0.2, z: ZS + 0.58 };
const THWARTS = [
  { z: ZS + 0.58, y: 0.2 },
  { z: -0.12, y: 0.22 },
  { z: 0.98, y: 0.25 },
];
// the outboard's swivel on the transom; its tiller reaches forward to her right hand
const MOTOR = { y: 0.47, z: ZS - 0.04, tiller: 0.64 };

// the section at t (0 the transom .. 1 the stem): half beam, keel and sheer heights
function section(t) {
  const hb = 0.78 * (t < 0.45 ? 0.8 + 0.2 * Math.sin((t / 0.45) * (Math.PI / 2)) : Math.pow(Math.max(0, Math.cos(((t - 0.45) / 0.55) * (Math.PI / 2))), 0.82));
  const keel = -0.28 + (t > 0.62 ? Math.pow((t - 0.62) / 0.38, 2) * 0.62 : 0) + (t < 0.06 ? (0.06 - t) * 0.9 : 0);
  const sheer = 0.45 + 0.19 * t * t * t + (t < 0.12 ? (0.12 - t) * 0.22 : 0);
  return { t, z: ZS + t * HULL.L, hb, keel, sheer };
}
// half breadth at height y of a section (round bilge, flaring topsides)
function halfAt(s, y) {
  const u = clamp((y - s.keel) / Math.max(1e-3, s.sheer - s.keel), 0, 1);
  return s.hb * Math.pow(Math.sin((u * Math.PI) / 2), 0.55);
}

const C = {
  bottom: 0x8a3b30, boot: 0xc9442f, white: 0xf3efe6, teal: 0x2f8a8c, rail: 0x5b3c27, strake: 0x6b4a32,
  varnish: 0xb7713f, transom: 0x9a5a2c, rib: 0x8a5230, floor: 0xc28b55, thwart: 0xc8925a,
  cowl: 0xe9e7e2, pan: 0x3c4048, grey: 0x4a4f57, dark: 0x2a2c30, red: 0xd23f2c, brass: 0xc29a4e, iron: 0x2b3530,
  cushion: 0x3f6f9a, rope: 0xd9c9a0, bucket: 0x4fa3c7,
};
// (the cushion on the stern thwart she sits on, and where she stands in the boat before she
// sits down and after she gets up: on the floorboards in front of the thwart)
const CUSHION = 0.05;
const STAND = { x: SEAT.x, y: FLOOR, z: SEAT.z + 0.36 };

// the hull's point at section t, height fraction u up its side (0 keel .. 1 sheer), side +-1
function hullAt(t, u, side, out = new THREE.Vector3()) {
  const s = section(clamp(t, 0, 1));
  const y = s.keel + clamp(u, 0, 1) * (s.sheer - s.keel);
  return out.set(halfAt(s, y) * side, y, s.z);
}
// the outward normal there, from the surface's two slopes (along the hull and up the section)
function hullNormal(t, y, side) {
  const s = section(t), e = 0.01;
  const u = clamp((y - s.keel) / Math.max(1e-3, s.sheer - s.keel), 0, 1);
  const along = hullAt(t + e, u, side, _v).sub(hullAt(t - e, u, side, _v2));
  const up = hullAt(t, u + e, side, _v2).sub(hullAt(t, u - e, side, _v3));
  const n = V(0, 0, 0).crossVectors(along, up).normalize();
  // (away from a point inside the hull)
  const p = hullAt(t, u, side, _v3);
  if (n.x * p.x + n.y * (p.y - (s.keel + 0.6 * (s.sheer - s.keel))) < 0) n.negate();
  return n;
}
// how far in from the hull's inside a thing at (y, z) must keep (x, positive)
const inside = (z, y, margin) => Math.max(0, halfAt(section((z - ZS) / HULL.L), y) - margin);

function buildHull(b) {
  const N = 28;
  // the bands up the side, as heights: bottom paint up to the waterline, a red boot stripe,
  // white topsides (lapped planks), a teal stripe under the gunwale
  const rowsAt = (s) => {
    const w0 = Math.max(s.keel, -0.03), w1 = Math.max(s.keel, 0.045);
    const t0 = Math.max(w1, s.sheer - 0.15), t1 = Math.max(t0, s.sheer - 0.05);
    return [
      [s.keel, s.keel + (w0 - s.keel) * 0.4, s.keel + (w0 - s.keel) * 0.75, w0, C.bottom, PAT.METAL],
      [w0, w1, null, null, C.boot, 0],
      [w1, w1 + (t0 - w1) * 0.33, w1 + (t0 - w1) * 0.66, t0, C.white, PAT.SIDING],
      [t0, t1, null, null, C.teal, 0],
      [t1, s.sheer, null, null, C.white, 0],
    ];
  };
  const pts = (ys) => ys.filter((y) => y !== null);
  const bilge = new THREE.Color(C.rib);
  for (let i = 0; i < N; i++) {
    const ta = i / N, tb = (i + 1) / N;
    const sa = section(ta), sb = section(tb);
    const ra = rowsAt(sa), rb = rowsAt(sb);
    for (let band = 0; band < ra.length; band++) {
      const ya = pts(ra[band].slice(0, 4)), yb = pts(rb[band].slice(0, 4));
      // (the same number of rows each side of the strip)
      const n = Math.max(ya.length, yb.length);
      while (ya.length < n) ya.splice(ya.length - 1, 0, (ya[ya.length - 2] + ya[ya.length - 1]) / 2);
      while (yb.length < n) yb.splice(yb.length - 1, 0, (yb[yb.length - 2] + yb[yb.length - 1]) / 2);
      const cc = new THREE.Color(ra[band][4]), pat = ra[band][5];
      for (const side of [1, -1]) {
        const base = b.count;
        for (let r = 0; r < n; r++) {
          for (const [s, y, t] of [[sa, ya[r], ta], [sb, yb[r], tb]]) {
            const nn = hullNormal(t, y, side);
            b.vtx(halfAt(s, y) * side, y, s.z, nn.x, nn.y, nn.z, cc, s.z, y, pat);
          }
        }
        // (wound to face out of the hull: port, x > 0, the other way round to starboard)
        for (let r = 0; r < n - 1; r++) {
          const a = base + r * 2, c = a + 2;
          if (side > 0) b.idx.push(a, c + 1, a + 1, a, c, c + 1);
          else b.idx.push(a, a + 1, c + 1, a, c + 1, c);
        }
        // and the skin's inside face, bare wood: wherever the planking inside her leaves a seam
        // (along the floorboards, round the stem) it shows, not the sea under her
        const base2 = b.count;
        for (let r = 0; r < n; r++) {
          for (const [s, y, t] of [[sa, ya[r], ta], [sb, yb[r], tb]]) {
            const nn = hullNormal(t, y, side);
            b.vtx(halfAt(s, y) * side, y, s.z, -nn.x, -nn.y, -nn.z, bilge, s.z, y, PAT.SIDING);
          }
        }
        for (let r = 0; r < n - 1; r++) {
          const a = base2 + r * 2, c = a + 2;
          if (side > 0) b.idx.push(a, a + 1, c + 1, a, c + 1, c);
          else b.idx.push(a, c + 1, a + 1, a, c, c + 1);
        }
      }
    }
  }
  // the inside: varnished planks from the floorboards to the gunwale, ribs over them
  const varnish = new THREE.Color(C.varnish);
  for (let i = 0; i < N; i++) {
    const ta = i / N, tb = (i + 1) / N;
    if (ta > 0.9) break;
    const sa = section(ta), sb = section(tb);
    const lo = (s) => Math.max(FLOOR - 0.02, s.keel + 0.04);
    const M = 5;
    for (const side of [1, -1]) {
      const base = b.count;
      for (let r = 0; r <= M; r++) {
        for (const s of [sa, sb]) {
          const y = lo(s) + ((s.sheer - 0.025 - lo(s)) * r) / M;
          const n = _v.set(-side, 0.25, 0).normalize();
          b.vtx((halfAt(s, y) - 0.03) * side, y, s.z, n.x, n.y, n.z, varnish, s.z, y, PAT.SIDING);
        }
      }
      // (facing into the boat)
      for (let r = 0; r < M; r++) {
        const a = base + r * 2, c = a + 2;
        if (side > 0) b.idx.push(a, a + 1, c + 1, a, c + 1, c);
        else b.idx.push(a, c + 1, a + 1, a, c, c + 1);
      }
    }
  }
  // the gunwale (inwale and outwale in one, capping the planks), a rubbing strake just under
  // it, the stem post with a brass band down its face
  for (const side of [1, -1]) {
    const line = [], strake = [];
    for (let i = 0; i <= N; i++) {
      const s = section(i / N);
      line.push(V((s.hb - 0.012) * side, s.sheer + 0.012, s.z));
      const ys = s.sheer - 0.075;
      if (i < N) strake.push(V((halfAt(s, ys) + 0.008) * side, ys, s.z));
    }
    b.tube(line, 0.034, 6, C.rail, PAT.BOARDS);
    b.tube(strake, 0.017, 5, C.strake, PAT.BOARDS);
  }
  {
    const s = section(1);
    b.tube([V(0, s.keel - 0.02, ZB + 0.01), V(0, (s.keel + s.sheer) / 2, ZB + 0.02), V(0, s.sheer + 0.04, ZB + 0.03)], 0.035, 6, C.rail, PAT.BOARDS);
    b.tube([V(0, s.keel + 0.02, ZB + 0.04), V(0, (s.keel + s.sheer) / 2, ZB + 0.052), V(0, s.sheer + 0.03, ZB + 0.06)], 0.011, 5, C.brass);
  }
  // ribs (frames) inside, port and starboard
  for (let z = ZS + 0.34; z < ZB - 0.75; z += 0.3) {
    const t = (z - ZS) / HULL.L, s = section(t);
    for (const side of [1, -1]) {
      const line = [];
      for (let r = 0; r <= 5; r++) {
        const y = Math.max(FLOOR, s.keel + 0.04) + ((s.sheer - 0.04 - Math.max(FLOOR, s.keel + 0.04)) * r) / 5;
        line.push(V((halfAt(s, y) - 0.045) * side, y, z));
      }
      b.tube(line, 0.016, 4, C.rib, PAT.BOARDS);
    }
  }
  // floorboards, slatted
  {
    const t0 = 0.04, t1 = 0.8, n = 12;
    for (let i = 0; i < n; i++) {
      const ta = t0 + ((t1 - t0) * i) / n, tb = t0 + ((t1 - t0) * (i + 1)) / n;
      const sa = section(ta), sb = section(tb);
      const wa = halfAt(sa, FLOOR) - 0.035, wb = halfAt(sb, FLOOR) - 0.035;
      if (wa < 0.05 || wb < 0.05) continue;
      b.quad(V(-wa, FLOOR, sa.z), V(-wb, FLOOR, sb.z), V(wb, FLOOR, sb.z), V(wa, FLOOR, sa.z), C.floor, PAT.PLANKS);
    }
    // the slats' bearers along the middle and the sides
    for (const x of [-0.22, 0, 0.22]) b.box(x, FLOOR + 0.008, (section(t0).z + section(t1).z) / 2, 0.05, 0.016, (t1 - t0) * HULL.L, { color: C.rib });
  }
  // the transom: varnished mahogany above the waterline, bottom paint below; inside varnished;
  // a pad on top where the outboard clamps
  {
    const s = section(0), z = ZS;
    const w0 = Math.max(s.keel, -0.03);
    for (const [y0, y1, c, pat] of [[s.keel, w0, C.bottom, PAT.METAL], [w0, s.sheer, C.transom, PAT.BOARDS]]) {
      const K = 4;
      for (let r = 0; r < K; r++) {
        const ya = y0 + ((y1 - y0) * r) / K, yb = y0 + ((y1 - y0) * (r + 1)) / K;
        const xa = halfAt(s, ya), xb = halfAt(s, yb);
        b.quadOut(V(-xa, ya, z), V(xa, ya, z), V(xb, yb, z), V(-xb, yb, z), V(0, 0.2, z + 3), c, pat);
      }
    }
    const yi = FLOOR, xi = halfAt(s, yi) - 0.03, xt = s.hb - 0.03;
    b.quadOut(V(-xi, yi, z + 0.04), V(xi, yi, z + 0.04), V(xt, s.sheer, z + 0.04), V(-xt, s.sheer, z + 0.04), V(0, 0.2, z - 3), C.varnish, PAT.SIDING);
    b.box(0, s.sheer + 0.01, z + 0.02, s.hb * 2, 0.04, 0.07, { color: C.rail, pattern: PAT.BOARDS });
    b.box(0, s.sheer + 0.035, z + 0.02, 0.24, 0.03, 0.11, { color: C.transom, pattern: PAT.BOARDS });
    // the transom knee
    b.box(0, (FLOOR + s.sheer) / 2, z + 0.1, 0.06, s.sheer - FLOOR - 0.05, 0.12, { color: C.rib });
  }
  // thwarts on knees; a cushion on the stern one
  for (const th of THWARTS) {
    const s = section((th.z - ZS) / HULL.L);
    const w = (halfAt(s, th.y) - 0.04) * 2;
    b.box(0, th.y - 0.02, th.z, w, 0.04, 0.24, { color: C.thwart, pattern: PAT.PLANKS });
    // (the knees under its ends, inside the planking where the hull narrows below)
    const kx = halfAt(s, th.y - 0.13) - 0.07;
    for (const e of [-1, 1]) b.box(e * kx, th.y - 0.08, th.z, 0.06, 0.1, 0.18, { color: C.rib });
  }
  b.geom(new THREE.CapsuleGeometry(0.11, 0.25, 3, 12), new THREE.Matrix4().compose(V(SEAT.x - 0.04, SEAT.y + CUSHION / 2, SEAT.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI / 2)), V(CUSHION / 0.22, 1, 1)), C.cushion);
  // a little foredeck at the bow, a cleat and a coil of rope on it
  {
    const n = 6;
    for (let i = 0; i < n; i++) {
      const ta = 0.86 + (0.14 * i) / n, tb = 0.86 + (0.14 * (i + 1)) / n;
      const sa = section(ta), sb = section(tb);
      const ya = sa.sheer - 0.03, yb = sb.sheer - 0.03;
      const xa = halfAt(sa, ya) - 0.02, xb = Math.max(0.005, halfAt(sb, yb) - 0.02);
      b.quad(V(-xa, ya, sa.z), V(-xb, yb, sb.z), V(xb, yb, sb.z), V(xa, ya, sa.z), C.varnish, PAT.PLANKS);
    }
    const s = section(0.93);
    b.box(0, s.sheer + 0.0, s.z, 0.05, 0.035, 0.07, { color: C.dark });
    b.box(0, s.sheer + 0.028, s.z, 0.04, 0.02, 0.2, { color: C.dark });
    b.pushTRS(0.11, section(0.885).sheer - 0.012, section(0.885).z, 0);
    b.geom(new THREE.TorusGeometry(0.1, 0.02, 5, 16), new THREE.Matrix4().makeRotationX(Math.PI / 2), C.rope);
    b.geom(new THREE.TorusGeometry(0.075, 0.02, 5, 14), new THREE.Matrix4().compose(V(0.01, 0.028, 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)), V(1, 1, 1)), C.rope);
    b.pop();
    b.tube([V(0.03, s.sheer + 0.03, s.z + 0.03), V(0.08, s.sheer + 0.01, s.z - 0.06), V(0.1, section(0.885).sheer + 0.03, section(0.885).z)], 0.018, 4, C.rope);
  }
  // oarlocks on both gunwales, a little aft of the bow thwart's oars' stroke
  for (const side of [1, -1]) {
    const z = 0.22, s = section((z - ZS) / HULL.L), x = (s.hb - 0.012) * side, y = s.sheer + 0.045;
    b.box(x, y - 0.005, z, 0.05, 0.02, 0.07, { color: C.brass });
    b.rod(V(x, y, z - 0.04), V(x, y + 0.06, z - 0.045), 0.008, 0.008, 4, C.brass);
    b.rod(V(x, y, z + 0.04), V(x, y + 0.06, z + 0.045), 0.008, 0.008, 4, C.brass);
  }
  // the oars, lying along the starboard side on the middle and bow thwarts, blades forward
  for (const e of [0, 1]) {
    const zh = -0.6 + e * 0.06, zb = 1.08 - e * 0.05, zr = 0.62;
    const yh = THWARTS[1].y + 0.035 + e * 0.04, yb = THWARTS[2].y + 0.035 + e * 0.04;
    const xh = -(inside(zh, yh, 0.12 + e * 0.08)), xb = -(inside(zb, yb, 0.1 + e * 0.07));
    const yr = yh + ((yb - yh) * (zr - zh)) / (zb - zh), xr = xh + ((xb - xh) * (zr - zh)) / (zb - zh);
    b.rod(V(xh, yh, zh), V(xr, yr, zr), 0.02, 0.022, 6, 0xc79a62, PAT.BOARDS);
    b.rod(V(xh, yh, zh), V(xh + (xh - xr) * 0.07, yh - (yr - yh) * 0.07, zh - (zr - zh) * 0.07), 0.016, 0.016, 6, 0x9a6a3a);
    // the blade, flat and widening to its rounded tip
    const dx = (xb - xr) / (zb - zr);
    b.push(new THREE.Matrix4().makeTranslation(xr, yr, zr).multiply(new THREE.Matrix4().makeRotationY(Math.atan2(dx, 1))));
    b.prism([[-0.025, 0], [0.025, 0], [0.055, 0.12], [0.055, zb - zr - 0.04], [0, zb - zr], [-0.055, zb - zr - 0.04], [-0.055, 0.12]], -0.006, 0.006, 0xd2a46c, PAT.BOARDS, { bottom: true });
    b.pop();
  }
  // a bailer bucket under the bow thwart, the fuel tank under the stern thwart's starboard end
  // with its hose to the outboard
  {
    const bz = THWARTS[2].z - 0.36, bx = 0.12;
    b.cyl(bx, FLOOR, bz, 0.085, 0.1, 0.15, 12, C.bucket, 0, { caps: false });
    b.cyl(bx, FLOOR + 0.002, bz, 0.084, 0.084, 0.004, 12, 0x3d86a8);
    b.pushTRS(bx, FLOOR + 0.15, bz, 0.4);
    b.geom(new THREE.TorusGeometry(0.098, 0.006, 4, 12, Math.PI), new THREE.Matrix4().makeRotationY(0), 0x2a2c30);
    b.pop();
    const tx = -0.19, tz = SEAT.z - 0.03, ty = FLOOR + 0.11;
    b.box(tx, ty, tz, 0.26, 0.21, 0.19, { color: C.red, ao: 0.15 });
    b.box(tx, ty + 0.11, tz, 0.24, 0.012, 0.17, { color: 0xb8362a });
    b.rod(V(tx - 0.07, ty + 0.11, tz), V(tx - 0.07, ty + 0.14, tz), 0.018, 0.018, 8, C.dark);
    b.rod(V(tx + 0.02, ty + 0.11, tz - 0.05), V(tx + 0.02, ty + 0.15, tz - 0.05), 0.012, 0.012, 6, C.dark);
    b.tube([V(tx + 0.02, ty + 0.15, tz - 0.05), V(tx + 0.03, ty + 0.2, tz - 0.16), V(-0.08, 0.3, ZS + 0.16), V(-0.03, MOTOR.y - 0.08, ZS + 0.05), V(0, MOTOR.y - 0.06, ZS + 0.0)], 0.011, 5, C.dark);
  }
}

// the outboard (its swivel at the origin, +z forward): the clamp bracket over the transom, the
// powerhead under its rounded cowl astern of it, the leg down into the water to the gearcase
// with its plate and skeg, the propeller (apart, it turns); the tiller forward to her hand
function buildMotor(b) {
  // clamp bracket and swivel
  b.box(0, -0.07, 0.035, 0.17, 0.2, 0.08, { color: C.grey, pattern: PAT.METAL });
  b.box(0, 0.025, 0.06, 0.19, 0.03, 0.12, { color: C.grey, pattern: PAT.METAL });
  for (const e of [-1, 1]) {
    b.rod(V(e * 0.06, -0.12, 0.08), V(e * 0.06, -0.12, 0.14), 0.01, 0.01, 6, C.grey);
    b.rod(V(e * 0.06 - 0.04, -0.12, 0.14), V(e * 0.06 + 0.04, -0.12, 0.14), 0.009, 0.009, 6, C.dark);
  }
  b.rod(V(0, -0.2, -0.05), V(0, 0.06, -0.05), 0.036, 0.036, 10, C.grey, PAT.METAL);
  // the lower cowl (pan), the hood with a red stripe and the starter's handle on its front
  b.box(0, 0.075, -0.2, 0.27, 0.1, 0.4, { color: C.pan });
  b.geom(new THREE.CapsuleGeometry(0.135, 0.17, 6, 14), new THREE.Matrix4().compose(V(0, 0.236, -0.215), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)), V(1, 1, 0.82)), C.cowl);
  for (const e of [-1, 1]) b.box(e * 0.136, 0.225, -0.215, 0.006, 0.03, 0.16, { color: C.red });
  b.box(0, 0.19, 0.0, 0.09, 0.025, 0.04, { color: C.dark });
  // the leg (a faired strut), the plate over the propeller, the gearcase and the skeg
  b.push(new THREE.Matrix4().makeTranslation(0, 0, -0.17).multiply(new THREE.Matrix4().makeScale(0.5, 1, 1)));
  b.cyl(0, -0.56, 0, 0.075, 0.09, 0.6, 10, C.grey, PAT.METAL);
  b.pop();
  b.box(0, -0.53, -0.21, 0.24, 0.016, 0.3, { color: C.grey });
  b.geom(new THREE.CapsuleGeometry(0.045, 0.26, 4, 10), new THREE.Matrix4().compose(V(0, -0.64, -0.2), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)), V(1, 1, 1)), C.grey);
  b.push(new THREE.Matrix4().makeTranslation(0, -0.68, -0.2));
  b.prism([[-0.006, -0.08], [0.006, -0.08], [0.006, 0.06], [-0.006, 0.06]], -0.1, 0, C.grey);
  b.pop();
  // the tiller arm, its twist grip and a red stop button
  b.rod(V(0, 0.12, -0.02), V(0, 0.14, MOTOR.tiller - 0.13), 0.028, 0.022, 8, C.pan);
  b.rod(V(0, 0.14, MOTOR.tiller - 0.15), V(0, 0.145, MOTOR.tiller + 0.07), 0.03, 0.029, 10, C.dark);
  for (let i = 0; i < 5; i++) {
    const z = MOTOR.tiller - 0.12 + i * 0.04;
    b.rod(V(0, 0.1445, z), V(0, 0.1445, z + 0.01), 0.032, 0.032, 10, C.pan);
  }
  b.box(0, 0.165, 0.06, 0.05, 0.02, 0.05, { color: C.pan });
  b.rod(V(0, 0.175, 0.06), V(0, 0.19, 0.06), 0.012, 0.012, 8, C.red);
}

function buildProp(b) {
  b.rod(V(0, 0, 0.04), V(0, 0, -0.07), 0.028, 0.02, 8, C.grey);
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    // a broad blade, pitched
    b.push(new THREE.Matrix4().makeRotationZ(a).multiply(new THREE.Matrix4().makeTranslation(0, 0.065, -0.01)).multiply(new THREE.Matrix4().makeRotationY(0.6)));
    b.geom(new THREE.SphereGeometry(1, 10, 6), new THREE.Matrix4().makeScale(0.042, 0.06, 0.006), 0x9aa0a6);
    b.pop();
  }
}

// a hurricane lantern on its post (the globe apart, to glow): the fount, the globe in its
// guard wires, the cap and chimney, the bail; the post's foot in a socket on the gunwale
function buildLantern(b) {
  const top = 0.5;
  b.box(0, 0.01, 0, 0.06, 0.03, 0.08, { color: C.iron });
  b.rod(V(0, 0, 0), V(0, top, 0), 0.015, 0.013, 6, C.iron);
  b.cyl(0, top, 0, 0.05, 0.055, 0.012, 12, C.iron);
  b.cyl(0, top + 0.012, 0, 0.062, 0.056, 0.035, 14, 0x2e4a3c);
  b.cyl(0, top + 0.047, 0, 0.05, 0.05, 0.008, 14, C.brass);
  // guard wires round the globe
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    const cx = Math.cos(a), cz = Math.sin(a);
    b.tube([V(cx * 0.05, top + 0.05, cz * 0.05), V(cx * 0.068, top + 0.11, cz * 0.068), V(cx * 0.048, top + 0.175, cz * 0.048)], 0.003, 3, C.iron);
  }
  b.cyl(0, top + 0.175, 0, 0.05, 0.062, 0.012, 14, 0x2e4a3c);
  b.cyl(0, top + 0.187, 0, 0.062, 0.022, 0.05, 14, 0x2e4a3c);
  b.cyl(0, top + 0.237, 0, 0.018, 0.016, 0.03, 8, C.iron);
  b.cyl(0, top + 0.267, 0, 0.026, 0.0, 0.015, 8, C.iron);
  b.pushTRS(0, top + 0.2, 0, 0);
  b.geom(new THREE.TorusGeometry(0.06, 0.003, 3, 14, Math.PI), new THREE.Matrix4().makeRotationY(Math.PI / 2), C.iron);
  b.pop();
}

function lanternGlass(b) {
  const prof = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    prof.push(new THREE.Vector2(0.036 + 0.02 * Math.sin(t * Math.PI) - 0.004 * t, 0.055 + t * 0.12));
  }
  b.geom(new THREE.LatheGeometry(prof, 14), null, 0xffd38a);
  // the flame
  b.geom(new THREE.SphereGeometry(1, 8, 6), new THREE.Matrix4().compose(V(0, 0.1, 0), new THREE.Quaternion(), V(0.011, 0.024, 0.011)), 0xfff1c4);
}
// the middle of the lantern's globe over its post's foot
const LANTERN_GLOW_Y = 0.5 + 0.11;

function nameTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#2b4f6e';
  g.font = `700 46px ${FONTS.mincho}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('さくら丸', 128, 34);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function buildBoatModel(mats) {
  const group = new THREE.Group();
  group.name = 'boat';
  group.rotation.order = 'YXZ';
  const hb = new MeshBuilder();
  buildHull(hb);
  const hull = new THREE.Mesh(hb.toGeometry(), mats.toon);
  hull.castShadow = true;
  hull.receiveShadow = true;
  group.add(hull);
  // the outboard swivels on the transom (steering); its propeller turns
  const motor = new THREE.Group();
  motor.position.set(0, MOTOR.y, MOTOR.z);
  const mb = new MeshBuilder();
  buildMotor(mb);
  const motorMesh = new THREE.Mesh(mb.toGeometry(), mats.toon);
  motorMesh.castShadow = true;
  motor.add(motorMesh);
  const prop = new THREE.Group();
  prop.position.set(0, -0.64, -0.37);
  const pb = new MeshBuilder();
  buildProp(pb);
  prop.add(new THREE.Mesh(pb.toGeometry(), mats.toon));
  motor.add(prop);
  const grip = new THREE.Object3D();
  grip.position.set(0, 0.145, MOTOR.tiller - 0.04);
  motor.add(grip);
  group.add(motor);
  // the lantern on its post at the starboard quarter
  const lantern = new THREE.Group();
  const s0 = section(0.08);
  lantern.position.set(-(s0.hb - 0.07), s0.sheer + 0.03, ZS + 0.34);
  const lb = new MeshBuilder();
  buildLantern(lb);
  lantern.add(new THREE.Mesh(lb.toGeometry(), mats.toon));
  const gb = new MeshBuilder();
  gb.pushTRS(0, 0.5, 0, 0);
  lanternGlass(gb);
  gb.pop();
  const glass = new THREE.Mesh(gb.toGeometry(), mats.glow);
  lantern.add(glass);
  group.add(lantern);
  // fenders over the starboard side, out while moored
  const fenders = new THREE.Group();
  const fb = new MeshBuilder();
  for (const t of [0.32, 0.62]) {
    const s = section(t);
    const x = -(s.hb + 0.085);
    fb.tube([V(-(s.hb - 0.02), s.sheer + 0.035, s.z), V(-(s.hb + 0.05), s.sheer + 0.02, s.z), V(x, s.sheer - 0.13, s.z)], 0.007, 4, C.rope);
    fb.cyl(x, s.sheer - 0.53, s.z, 0.07, 0.075, 0.4, 12, 0xf4f4f0, 0, { bottomCap: true });
    fb.cyl(x, s.sheer - 0.135, s.z, 0.03, 0.02, 0.02, 8, 0xf4f4f0);
  }
  fenders.add(new THREE.Mesh(fb.toGeometry(), mats.toon));
  group.add(fenders);
  // her name on both bows, on the white under the stripe: a strip laid on the hull's curve
  // just off its surface, reading bow to stern on the port side, stern to bow on the starboard
  const nb = new MeshBuilder();
  const onHull = (t, y, side) => V(halfAt(section(t), y) * side, y, section(t).z).addScaledVector(hullNormal(t, y, side), 0.006);
  for (const side of [1, -1]) {
    const K = 6, t0 = 0.72, t1 = 0.84;
    for (let i = 0; i < K; i++) {
      const ta = t0 + ((t1 - t0) * i) / K, tb = t0 + ((t1 - t0) * (i + 1)) / K;
      const ya = section(ta).sheer, yb = section(tb).sheer;
      const a0 = onHull(ta, ya - 0.31, side), a1 = onHull(ta, ya - 0.18, side);
      const b0 = onHull(tb, yb - 0.31, side), b1 = onHull(tb, yb - 0.18, side);
      // (u runs with the reading: toward the stern to port, toward the bow to starboard)
      const ua = side > 0 ? 1 - i / K : i / K, ub = side > 0 ? 1 - (i + 1) / K : (i + 1) / K;
      if (side > 0) nb.quad(b0, a0, a1, b1, 0xffffff, 0, { uvs: [[ub, 0], [ua, 0], [ua, 1], [ub, 1]] });
      else nb.quad(a0, b0, b1, a1, 0xffffff, 0, { uvs: [[ua, 0], [ub, 0], [ub, 1], [ua, 1]] });
    }
  }
  group.add(new THREE.Mesh(nb.toGeometry(), mats.name(nameTexture())));
  // where a closed umbrella lies in the rain: on the floor along the port side, ahead of her
  const stow = new THREE.Object3D();
  stow.position.set(0.2, FLOOR + 0.02, THWARTS[1].z + 0.25);
  stow.rotation.set(-1.32, 0.0, 0);
  group.add(stow);
  group.traverse((o) => {
    if (o.isMesh) o.layers.enable(1);
  });
  return { group, hull, motor, prop, grip, lantern, glass, fenders, stow };
}

// ---------------------------------------------------------------------------- the wake
// (a point of the sea inside her hull: shaders drawn on the water leave the boat's inside alone)
const HULL_HOLE = /* glsl */ `
  uniform vec4 uBoat;
  uniform float uBoatHull[17];
  bool inHull(vec2 p) {
    vec2 bd = p - uBoat.xy;
    float blz = bd.x * uBoat.z + bd.y * uBoat.w;
    if (abs(blz) >= 2.15) return false;
    float bt = (blz + 2.15) / 4.3 * 16.0;
    int bi = min(int(bt), 15);
    return abs(bd.x * uBoat.w - bd.y * uBoat.z) < mix(uBoatHull[bi], uBoatHull[bi + 1], bt - float(bi)) + 0.03;
  }
`;

const WAKE_N = 160, WAKE_LIFE = 8.0;
class Wake {
  constructor() {
    this.pts = [];
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(WAKE_N * 2 * 3);
    this.uv = new Float32Array(WAKE_N * 2 * 2);
    this.str = new Float32Array(WAKE_N * 2);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('uv', new THREE.BufferAttribute(this.uv, 2).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('strength', new THREE.BufferAttribute(this.str, 1).setUsage(THREE.DynamicDrawUsage));
    const idx = [];
    for (let i = 0; i < WAKE_N - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
    g.setIndex(idx);
    g.setDrawRange(0, 0);
    this.mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: { uTime: G.uTime, uNight: G.uNight, uHorizon: G.uHorizon, uSunColor: G.uSunColor, uSkyAmb: G.uSkyAmb, uBoat: G.uBoat, uBoatHull: G.uBoatHull },
      vertexShader: /* glsl */ `
        attribute float strength;
        varying vec2 vUv;
        varying float vStr;
        varying vec3 vWorld;
        void main() {
          vUv = uv;
          vStr = strength;
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorld = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform float uNight;
        uniform vec3 uHorizon;
        uniform vec3 uSunColor;
        uniform vec3 uSkyAmb;
        varying vec2 vUv;
        varying float vStr;
        varying vec3 vWorld;
        ${NOISE}
        ${HULL_HOLE}
        void main() {
          if (inHull(vWorld.xz)) discard;
          float a = abs(vUv.x);
          float age = vUv.y;
          vec2 p = vWorld.xz;
          // foam in three sizes, slowly churning
          float n1 = vnoise(p * 1.3 + vec2(uTime * 0.12, -uTime * 0.08));
          float n2 = vnoise(p * 3.4 - vec2(uTime * 0.3, uTime * 0.2));
          float n3 = vnoise(p * 8.5 + uTime * 0.5);
          float lace = n1 * 0.5 + n2 * 0.32 + n3 * 0.18;
          // the two arms spreading from the stern: bright and narrow young, thinning as they go
          float aw = mix(0.1, 0.24, clamp(age / 5.0, 0.0, 1.0));
          float arm = smoothstep(1.0 - aw * 1.7, 1.0 - aw * 0.55, a) * (1.0 - smoothstep(0.96, 1.0, a));
          // the churned water from the propeller down the middle, dying away in a few seconds
          float ww = mix(0.55, 0.22, clamp(age / 3.5, 0.0, 1.0));
          float wash = (1.0 - smoothstep(ww * 0.45, ww, a)) * exp(-age * 0.62);
          float f = max(arm * (0.75 - 0.35 * clamp(age / 6.0, 0.0, 1.0)), wash);
          // breaking up into lace, the holes opening as it ages
          float thr = mix(0.36, 0.6, clamp(age / 5.5, 0.0, 1.0));
          f *= smoothstep(thr, thr + 0.1, lace + f * 0.15);
          // a smoother, paler slick where the wake has flattened the water
          float slick = (1.0 - smoothstep(0.3, 0.9, a)) * exp(-age * 0.25) * 0.12;
          float fade = pow(clamp(1.0 - age / ${WAKE_LIFE.toFixed(1)}, 0.0, 1.0), 1.3);
          float alpha = clamp((f * 0.95 + slick) * vStr * fade, 0.0, 0.88);
          vec3 lit = mix(vec3(1.0), uHorizon, 0.22) * (0.6 + 0.45 * uSunColor.g);
          vec3 col = mix(lit, uSkyAmb * 0.75, uNight * 0.75);
          gl_FragColor = vec4(col, alpha);
        }
      `,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    this.mesh.name = 'boatWake';
    this.last = null;
    this.t = 0;
  }

  // the stern at (x, z) heading h, speed v (m/s), the water at y
  update(dt, x, z, h, v, y) {
    this.t += dt;
    for (const p of this.pts) p.age += dt;
    while (this.pts.length && this.pts[0].age > WAKE_LIFE) this.pts.shift();
    const moved = this.last ? Math.hypot(x - this.last.x, z - this.last.z) : Infinity;
    if (Math.abs(v) > 0.35 && (moved > 0.4 || this.t > 0.2)) {
      this.pts.push({ x, z, h, v: Math.abs(v), age: 0 });
      if (this.pts.length > WAKE_N) this.pts.shift();
      this.last = { x, z };
      this.t = 0;
    }
    const n = this.pts.length;
    const P = this.pos, U = this.uv, S = this.str;
    // the newest point rides along with the stern; the wake opens at the angle a boat's wake
    // keeps (about 19 degrees each side), a little wider at a crawl
    for (let i = 0; i < n; i++) {
      const p = this.pts[n - 1 - i];
      const px = i === 0 ? x : p.x, pz = i === 0 ? z : p.z;
      const w = 0.45 + p.age * (0.25 + 0.33 * Math.min(p.v, 7));
      const rx = Math.cos(p.h), rz = -Math.sin(p.h);
      const k = i * 2;
      P[k * 3] = px + rx * w;
      P[k * 3 + 1] = y + 0.02;
      P[k * 3 + 2] = pz + rz * w;
      P[k * 3 + 3] = px - rx * w;
      P[k * 3 + 4] = y + 0.02;
      P[k * 3 + 5] = pz - rz * w;
      U[k * 2] = 1;
      U[k * 2 + 1] = p.age;
      U[k * 2 + 2] = -1;
      U[k * 2 + 3] = p.age;
      const s = clamp((p.v - 0.3) / 4.0, 0, 1) * (i === 0 ? 0 : 1);
      S[k] = s;
      S[k + 1] = s;
    }
    const g = this.mesh.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.uv.needsUpdate = true;
    g.attributes.strength.needsUpdate = true;
    g.setDrawRange(0, Math.max(0, n - 1) * 6);
  }
}

// ---------------------------------------------------------------------------- spray, foam
// white water thrown off the bow at speed: soft drops that spread and fade as they fall back
const SPRAY_N = 140;
class Spray {
  constructor() {
    this.p = [];
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(SPRAY_N * 3);
    this.life = new Float32Array(SPRAY_N);
    this.size = new Float32Array(SPRAY_N);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('life', new THREE.BufferAttribute(this.life, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    for (let i = 0; i < SPRAY_N; i++) this.p.push({ x: 0, y: -100, z: 0, vx: 0, vy: 0, vz: 0, t: 0, T: 1, s: 1 });
    this.mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uNight: G.uNight, uSkyAmb: G.uSkyAmb, uHorizon: G.uHorizon, uScale: { value: 600 } },
      vertexShader: /* glsl */ `
        attribute float life;
        attribute float size;
        uniform float uScale;
        varying float vLife;
        void main() {
          vLife = life;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = uScale * size * (0.07 + 0.2 * life) / max(0.5, -mv.z);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uNight;
        uniform vec3 uSkyAmb;
        uniform vec3 uHorizon;
        varying float vLife;
        void main() {
          vec2 d = gl_PointCoord - 0.5;
          float r = length(d);
          if (r > 0.5) discard;
          float a = smoothstep(0.5, 0.1, r) * (1.0 - vLife) * (1.0 - vLife) * 0.85;
          vec3 col = mix(mix(vec3(1.0), uHorizon, 0.15), uSkyAmb * 0.8, uNight * 0.7);
          gl_FragColor = vec4(col, a);
        }
      `,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 4;
    this.points.name = 'boatSpray';
    this.i = 0;
    this.acc = 0;
  }

  // emit from the bow's two sides at (x, y, z) (heading h, speed v), and step the drops
  update(dt, x, y, z, h, v, water, turn = 0) {
    const sx = Math.sin(h), sz = Math.cos(h), rx = Math.cos(h), rz = -Math.sin(h);
    this.acc += dt * Math.max(0, v - 2.0) * 13;
    while (this.acc > 1) {
      this.acc -= 1;
      const q = this.p[this.i];
      this.i = (this.i + 1) % SPRAY_N;
      // (more off the outer side in a turn)
      const side = Math.random() < 0.5 + clamp(turn, -0.4, 0.4) ? 1 : -1;
      const out = 0.8 + Math.random() * 1.7;
      const back = Math.random();
      q.x = x + rx * side * (0.22 + back * 0.35) - sx * back * 1.1;
      q.z = z + rz * side * (0.22 + back * 0.35) - sz * back * 1.1;
      q.y = water + 0.06;
      q.vx = rx * side * out + sx * v * 0.2;
      q.vz = rz * side * out + sz * v * 0.2;
      q.vy = 0.9 + Math.random() * 1.3 + v * 0.07;
      q.t = 0;
      q.T = 0.4 + Math.random() * 0.45;
      q.s = 0.6 + Math.random() * 0.9;
    }
    for (let i = 0; i < SPRAY_N; i++) {
      const q = this.p[i];
      if (q.t < q.T) {
        q.t += dt;
        q.vy -= 9.8 * dt;
        q.x += q.vx * dt;
        q.y += q.vy * dt;
        q.z += q.vz * dt;
        if (q.y < water) q.t = q.T;
      }
      const alive = q.t < q.T;
      this.pos[i * 3] = q.x;
      this.pos[i * 3 + 1] = alive ? q.y : -100;
      this.pos[i * 3 + 2] = q.z;
      this.life[i] = alive ? q.t / q.T : 1;
      this.size[i] = q.s;
    }
    const a = this.points.geometry.attributes;
    a.position.needsUpdate = true;
    a.life.needsUpdate = true;
    a.size.needsUpdate = true;
  }
}

// white water round the hull at the waterline: a lace of foam at rest, a bow wave and a churn
// along the sides at speed (follows the boat round, flat on the sea)
function hullFoam() {
  const N = 28;
  const pos = [], uv = [];
  const idx = [];
  // a ring round the waterline: inner edge on the hull, outer edge out from it
  const ring = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const s = section(t);
    ring.push([halfAt(s, 0.0), s.z, t]);
  }
  const outline = [];
  for (const [x, z, t] of ring) outline.push([x, z, t, 1]);
  for (let i = ring.length - 1; i >= 0; i--) outline.push([-ring[i][0], ring[i][1], ring[i][2], -1]);
  for (const [x, z, t] of outline) {
    pos.push(x, 0, z, x, 0, z);
    uv.push(t, 0, t, 1);
  }
  for (let i = 0; i < outline.length - 1; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  // the outward direction at each vertex
  const out = [];
  for (let i = 0; i < outline.length; i++) {
    const p = outline[Math.max(0, i - 1)], q = outline[Math.min(outline.length - 1, i + 1)];
    let dx = q[0] - p[0], dz = q[1] - p[1];
    const l = Math.hypot(dx, dz) || 1;
    dx /= l;
    dz /= l;
    // (perpendicular, away from the centre line)
    let nx = dz, nz = -dx;
    const c = outline[i];
    if (nx * c[0] + nz * (c[1] - 0.2) < 0) {
      nx = -nx;
      nz = -nz;
    }
    out.push(nx, nz, nx, nz);
  }
  g.setAttribute('outdir', new THREE.Float32BufferAttribute(out, 2));
  g.setIndex(idx);
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: { uTime: G.uTime, uNight: G.uNight, uSkyAmb: G.uSkyAmb, uHorizon: G.uHorizon, uSpeed: { value: 0 }, uBoat: G.uBoat, uBoatHull: G.uBoatHull },
    vertexShader: /* glsl */ `
      attribute vec2 outdir;
      uniform float uSpeed;
      varying vec2 vUv;
      varying vec3 vWorld;
      void main() {
        vUv = uv;
        float t = uv.x;
        // wider at the bow (the bow wave) and toward the stern at speed
        float w = 0.1 + uSpeed * (0.16 + 0.55 * smoothstep(0.55, 0.95, t) + 0.3 * smoothstep(0.35, 0.0, t));
        vec3 p = position + vec3(outdir.x, 0.0, outdir.y) * w * uv.y;
        vec4 wp = modelMatrix * vec4(p, 1.0);
        vWorld = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uNight;
      uniform vec3 uSkyAmb;
      uniform vec3 uHorizon;
      uniform float uSpeed;
      varying vec2 vUv;
      varying vec3 vWorld;
      ${NOISE}
      ${HULL_HOLE}
      void main() {
        if (inHull(vWorld.xz)) discard;
        float n = vnoise(vWorld.xz * 3.2 + vec2(uTime * 0.6, -uTime * 0.4)) * 0.65 + vnoise(vWorld.xz * 7.5 - uTime * 0.7) * 0.35;
        float edge = 1.0 - smoothstep(0.3, 1.0, vUv.y);
        float f = edge * smoothstep(0.34, 0.58, n + 0.28 * (1.0 - vUv.y));
        float a = f * (0.3 + 0.7 * clamp(uSpeed, 0.0, 1.0));
        vec3 col = mix(mix(vec3(1.0), uHorizon, 0.18), uSkyAmb * 0.7, uNight * 0.75);
        gl_FragColor = vec4(col, a * 0.82);
      }
    `,
  });
  const m = new THREE.Mesh(g, mat);
  m.renderOrder = 3;
  m.frustumCulled = false;
  m.name = 'boatFoam';
  return m;
}

// the lantern's light: a warm halo round the globe, a pool of light on the water round the boat
function lanternGlow() {
  const halo = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uOn: { value: 0 } },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          // a billboard: the quad turned to face the camera
          vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          mv.xy += position.xy * 0.9;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uOn;
        varying vec2 vUv;
        void main() {
          float r = length(vUv - 0.5) * 2.0;
          float a = (pow(max(0.0, 1.0 - r), 2.6) * 0.8 + pow(max(0.0, 1.0 - r * 2.2), 2.0) * 0.6) * uOn;
          gl_FragColor = vec4(vec3(1.0, 0.72, 0.4) * a, 1.0);
        }
      `,
    }),
  );
  halo.frustumCulled = false;
  halo.renderOrder = 6;
  const pool = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uOn: { value: 0 }, uTime: G.uTime, uBoat: G.uBoat, uBoatHull: G.uBoatHull },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        varying vec3 vWorld;
        void main() {
          vUv = uv;
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorld = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uOn;
        uniform float uTime;
        varying vec2 vUv;
        varying vec3 vWorld;
        ${NOISE}
        ${HULL_HOLE}
        void main() {
          if (inHull(vWorld.xz)) discard;
          float r = length(vUv - 0.5) * 2.0;
          // broken into glints on the ripples
          float rip = smoothstep(0.35, 0.75, vnoise(vWorld.xz * vec2(1.4, 4.0) + vec2(uTime * 0.4, uTime * 0.25)));
          float a = pow(max(0.0, 1.0 - r), 1.6) * uOn * (0.35 + 0.65 * rip);
          gl_FragColor = vec4(vec3(1.0, 0.64, 0.32) * a * 0.38, 1.0);
        }
      `,
    }),
  );
  pool.scale.set(5, 1, 5);
  pool.frustumCulled = false;
  pool.renderOrder = 3;
  return { halo, pool };
}

// ---------------------------------------------------------------------------- the boat
// hull footprint for collisions: circles along the keel (distance forward, radius)
const HULL_CIRCLES = [[1.55, 0.36], [0.8, 0.62], [-0.1, 0.74], [-1.15, 0.7]];
// the last stretch before the edge of the open water, over which she slows
const EDGE_BAND = 70;
// getting in and out: how long each part takes (s)
const T_STEP = 1.35, T_SIT = 1.15, T_STAND = 1.35, WALK = 1.25;
// (getting up, the clip leans forward from the seat before it rises: the seated pose lets go
// over that, and the clip is all hers before she comes up off the thwart)
const T_UNSIT = 0.75;

export class Boat {
  constructor(world, scene, opts = {}) {
    this.world = world;
    this.scene = scene;
    this.C = world.colliders;
    this.audio = opts.audio || null;
    this.berths = world.berths || [];
    this.berth = this.berths[0] || { x: 0, z: 140, h: 0, stand: { x: -2, z: 140, y: 0.4 } };
    // where she steps in and out from: on the landing abeam the place she stands in the boat
    // (two short steps across, not a stride along it), a little in from its edge
    for (const b of this.berths) {
      const s = b.stand, fx = Math.sin(b.h), fz = Math.cos(b.h);
      let ax = b.x - s.x, az = b.z - s.z;
      const along = ax * fx + az * fz;
      ax -= fx * along;
      az -= fz * along;
      const d = Math.hypot(ax, az) || 1;
      b.step = { x: s.x + fx * STAND.z + (ax / d) * 0.2, y: s.y, z: s.z + fz * STAND.z + (az / d) * 0.2 };
    }
    this.parts = buildBoatModel(opts.mats);
    scene.add(this.parts.group);
    this.wake = new Wake();
    scene.add(this.wake.mesh);
    this.spray = new Spray();
    scene.add(this.spray.points);
    this.foam = hullFoam();
    scene.add(this.foam);
    const glow = lanternGlow();
    this.halo = glow.halo;
    this.pool = glow.pool;
    scene.add(this.halo, this.pool);
    // moored lines from the boat's cleats to the landing's (shown while moored)
    this.lines = new THREE.Group();
    scene.add(this.lines);
    this.state = 'moored'; // moored, boarding, sailing, docking, leaving
    this.phase = null; // getting in: walk, step, sit; getting out: stand, step
    this.pt = 0; // time into the phase
    this.k = 0; // how far she is sat in the boat's pose (0 standing .. 1 seated)
    this.x = this.berth.x;
    this.z = this.berth.z;
    this.h = this.berth.h;
    this.v = 0; // ahead (m/s)
    this.u = 0; // sideways (m/s, + to port)
    this.w = 0; // turning (rad/s)
    this.y = 0;
    this.pitch = 0;
    this.roll = 0;
    this.throttle = 0;
    this.steer = 0;
    this.rpm = 0;
    this.lamp = 0;
    this.water = 0;
    this.rock = 0; // the rock of her stepping in or out
    this.lastBlock = null;
    this.onBlocked = null;
    this.onLeave = null;
    this.edgeT = 0;
    this._edge = {};
    this._push = { x: 0, z: 0 };
    this._rider = { inBoat: false, x: 0, y: 0, z: 0, h: 0, clip: 'idle', rate: 1, fade: 0.3, fit: false };
    this.it = { kind: 'boat', x: 0, z: 0, y: 0, r: 1.3, label: 'ボートに乗る' };
    world.interactables.push(this.it);
    // the hull's half-breadths at the waterline (the sea is not drawn inside them)
    G.uBoatHull.value = Array.from({ length: 17 }, (_, i) => Math.max(0, halfAt(section(i / 16), 0) - 0.02));
    this._moor(this.berth, true);
  }

  get on() {
    return this.state !== 'moored';
  }
  get sailing() {
    return this.state === 'sailing';
  }
  // (the player's ride: no lean to give the first-person camera beyond the boat's roll)
  get stand() {
    return 0;
  }
  // the third-person camera's pivot over her feet (seated low in the boat)
  get pivot() {
    return this.k > 0.5 || this.state === 'sailing' ? 1.15 : 1.32;
  }

  // ------------------------------------------------------------------ getting in and out
  board(player) {
    if (this.state !== 'moored') return 'no';
    const s = this.berth.step;
    if (Math.hypot(player.pos.x - s.x, player.pos.z - s.z) > 3.2 || Math.abs(player.pos.y - s.y) > 1.0) return 'far';
    this.from = { x: player.pos.x, y: player.pos.y, z: player.pos.z };
    this.state = 'boarding';
    this.k = 0;
    this.it.off = true;
    this.P = player;
    player.ride = this;
    player.vel.set(0, 0, 0);
    player.sitting = null;
    this.boomWalk = player.boom;
    player.boom = Math.max(player.boom, 4.6);
    // (a few steps along the landing first, if she is not at the boat's side)
    const d = Math.hypot(s.x - this.from.x, s.z - this.from.z);
    this.walkT = d > 0.2 ? d / WALK + 0.2 : 0;
    this.phase = this.walkT > 0 ? 'walk' : 'step';
    this.pt = 0;
    this._place(player);
    return 'ok';
  }

  // the landing near enough to come alongside (at a walking pace), or null
  dockTarget() {
    if (this.state !== 'sailing' || Math.abs(this.v) > 2.4) return null;
    let best = null, bd = 9;
    for (const b of this.berths) {
      const d = Math.hypot(b.x - this.x, b.z - this.z);
      if (d < bd) {
        bd = d;
        best = b;
      }
    }
    return best;
  }

  // E on the water: alongside a landing (it ties up and she steps out), or why not
  leave() {
    if (this.state !== 'sailing') return 'no';
    const b = this.dockTarget();
    if (!b) return Math.abs(this.v) > 2.4 ? 'fast' : 'nowhere';
    this.state = 'docking';
    this.dock = { b, x: this.x, z: this.z, h: this.h, t: 0, T: clamp(Math.hypot(b.x - this.x, b.z - this.z) / 2.2, 0.8, 3.2) };
    this.throttle = 0;
    return 'ok';
  }

  _moor(b, now = false) {
    this.berth = b;
    this.state = 'moored';
    this.phase = null;
    this.k = 0;
    this.v = this.u = this.w = 0;
    this.throttle = 0;
    this.steer = 0;
    this.x = b.x;
    this.z = b.z;
    this.h = b.h;
    const s = b.step;
    this.it.x = (s.x + b.x) / 2;
    this.it.z = (s.z + b.z) / 2;
    this.it.y = s.y;
    this.it.off = false;
    this.parts.fenders.visible = true;
    this._lines(true);
    if (!now) this.audio?.sfx('boatRope');
  }

  // mooring lines from her bow and stern cleats to the landing's
  _lines(on) {
    this.lines.clear();
    if (!on) return;
    const b = this.berth, sx = Math.sin(b.h), sz = Math.cos(b.h), lx = Math.cos(b.h), lz = -Math.sin(b.h);
    const mb = new MeshBuilder();
    for (const d of [1.55, -1.75]) {
      const a = V(b.x + sx * d - lx * 0.55, 0.55, b.z + sz * d - lz * 0.55);
      const c = V(b.x + sx * (d * 0.82) - lx * 1.1, LANDING_Y + 0.14, b.z + sz * (d * 0.82) - lz * 1.1);
      const mid = a.clone().lerp(c, 0.5);
      mid.y -= 0.1;
      mb.tube([a, mid, c], 0.012, 4, C.rope);
    }
    const m = new THREE.Mesh(mb.toGeometry(), this.parts.hull.material);
    m.layers.enable(1);
    this.lines.add(m);
  }

  // where she stands in the boat (on the floorboards before the thwart), in the world
  standSpot(out) {
    return out.set(STAND.x, STAND.y, STAND.z).applyMatrix4(this.parts.group.matrixWorld);
  }

  // Where she is and what she does while getting in or out, and in the boat: { inBoat (her
  // root takes the boat's frame, see pose), x, y, z, h (her feet and heading when not), clip,
  // rate, fade, fit (her feet fitted to the ground under them) }. Updated every frame
  rider() {
    return this._rider;
  }

  _updateRider() {
    const R = this._rider, st = this.state, ph = this.phase;
    const s = this.berth.step;
    R.fit = false;
    R.fade = 0.3;
    if (st === 'boarding' && ph === 'walk') {
      // along the landing to the boat's side, then turning to it
      const f = this.from, d = Math.hypot(s.x - f.x, s.z - f.z);
      const k = clamp(this.pt / Math.max(0.01, this.walkT - 0.2), 0, 1);
      R.inBoat = false;
      R.x = f.x + (s.x - f.x) * k;
      R.z = f.z + (s.z - f.z) * k;
      R.y = s.y;
      const toBoat = Math.atan2(this.x - s.x, this.z - s.z);
      const walkH = d > 0.05 ? Math.atan2(s.x - f.x, s.z - f.z) : toBoat;
      R.h = k < 1 ? walkH : walkH + wrap(toBoat - walkH) * smooth(clamp((this.pt - (this.walkT - 0.2)) / 0.2, 0, 1));
      R.clip = k < 1 ? 'walk' : 'idle';
      R.rate = 1;
      R.fit = true;
      return R;
    }
    if (ph === 'step') {
      // two steps across, over the gunwale: from the landing down onto the floorboards (in) or
      // up from them onto the landing (out); turning to face the bow, or the landing
      const k = smooth(clamp(this.pt / T_STEP, 0, 1));
      const inside = this.standSpot(_v3);
      const a = st === 'boarding' ? s : inside, b = st === 'boarding' ? inside : s;
      R.inBoat = false;
      R.x = a.x + (b.x - a.x) * k;
      R.z = a.z + (b.z - a.z) * k;
      // (the feet lifted clear of the gunwale on the way)
      const gun = this.water + 0.72;
      const line = a.y + (b.y - a.y) * k;
      R.y = line + Math.max(0, gun - Math.max(a.y, b.y)) * Math.sin(Math.PI * k) + 0.1 * Math.sin(Math.PI * k);
      const toBoat = Math.atan2(this.x - s.x, this.z - s.z);
      const ha = st === 'boarding' ? toBoat : this.h, hb = st === 'boarding' ? this.h : toBoat + Math.PI;
      R.h = ha + wrap(hb - ha) * smooth(clamp(this.pt / (T_STEP * 0.85), 0, 1));
      // (one cycle of the clip, two careful steps, across)
      R.clip = st === 'boarding' ? 'stairsDown' : 'stairsUp';
      R.rate = st === 'boarding' ? 0.7 : 1.0;
      R.fade = 0.2;
      return R;
    }
    R.inBoat = true;
    if (ph === 'sit') {
      R.clip = 'sitDown';
      R.rate = 1.45;
    } else if (ph === 'stand') {
      R.clip = 'standUp';
      R.rate = 1.3;
    } else {
      R.clip = 'idle';
      R.rate = 1;
    }
    return R;
  }

  // ------------------------------------------------------------------ under way
  // inp: { ix, iz (-1..1), boost } from the player (see Player.update); moves her with the boat
  drive(dt, inp, P) {
    this.P = P;
    const st = this.state;
    if (st === 'boarding' || st === 'leaving') {
      // as she sits down the camera comes round behind her, looking out over the bow
      if (st === 'boarding' && this.phase !== 'walk') {
        P.yaw += wrap(this.h + Math.PI - P.yaw) * Math.min(1, dt * 2.5);
        P.pitch += (-0.12 - P.pitch) * Math.min(1, dt * 2.5);
      }
      this._place(P);
      return;
    }
    if (st === 'docking') {
      // coming alongside: eased into the berth, then she gets up and steps out
      const d = this.dock;
      d.t += dt;
      const k = smooth(clamp(d.t / d.T, 0, 1));
      this.x = d.x + (d.b.x - d.x) * k;
      this.z = d.z + (d.b.z - d.z) * k;
      this.h = d.h + wrap(d.b.h - d.h) * k;
      this.v = 0;
      this.w = 0;
      this.steer *= Math.max(0, 1 - dt * 3);
      this._camFollow(P, dt, 0);
      this._place(P);
      if (d.t >= d.T) {
        this.berth = d.b;
        this.state = 'leaving';
        this.phase = 'stand';
        this.pt = 0;
        this.k = 1;
        this.parts.fenders.visible = true;
        this._lines(true);
        this.audio?.sfx('boatStop');
        this.audio?.sfx('boatRope');
      }
      return;
    }
    if (st !== 'sailing') return;
    // the throttle (ahead / astern), the tiller
    const boost = !!inp.boost && inp.iz > 0.3;
    const want = clamp(inp.iz, -1, 1) * (boost ? 1 : inp.iz > 0 ? 0.78 : 1);
    this.throttle += clamp(want - this.throttle, -dt * 1.6, dt * 1.2);
    this.boosting = boost;
    const sWant = -clamp(inp.ix, -1, 1) * 0.62;
    this.steer += clamp(sWant - this.steer, -dt * 2.6, dt * 2.6);
    // ahead: thrust against the water's drag; astern weaker
    const thrust = this.throttle >= 0 ? this.throttle * 3.3 : this.throttle * 0.95;
    const shallow = this._depth(this.x, this.z) < 0.7 ? 2.2 : 1;
    let v = this.v + (thrust - (0.2 * this.v + 0.05 * this.v * Math.abs(this.v)) * shallow) * dt;
    if (Math.abs(this.throttle) < 0.02 && Math.abs(v) < 0.05) v = 0;
    // turning: the outboard swings the stern (with the throttle even at rest), the run of the
    // water past the hull does the rest; the boat answers a moment late
    const run = Math.min(1, Math.abs(v) / 2.4);
    const turn = this.steer * 1.2 * (0.3 * Math.abs(this.throttle) + 0.75 * run) * (v < -0.15 ? -1 : 1);
    this.w += (turn - this.w) * Math.min(1, dt * 2.0);
    // sliding in a turn: the way she carries sideways, damped by the keel
    this.u += (-this.w * v * 0.18 - this.u) * Math.min(1, dt * 2.4);
    // the edge of the open water (an invisible boundary): heading out toward it she slows
    // over the last stretch and comes to rest against it; along it she slides
    const e = seaEdge(this.x, this.z, this._edge);
    this.edgeT -= dt;
    if (e.d > -EDGE_BAND) {
      const out = Math.sin(this.h) * e.nx + Math.cos(this.h) * e.nz;
      const room = clamp(-e.d / EDGE_BAND, 0, 1);
      const allow = 0.15 + 6.5 * Math.pow(room, 0.75);
      if (v * out > allow && Math.abs(out) > 0.12) v = allow / out;
      if (e.d > -3 && v * out > 0.05 && this.edgeT <= 0) {
        this.edgeT = 14;
        this.onBlocked?.('edge');
      }
    }
    const h1 = this.h + this.w * dt;
    const sx = Math.sin(h1), sz = Math.cos(h1), lx = Math.cos(h1), lz = -Math.sin(h1);
    let nx = this.x + (sx * v + lx * this.u) * dt, nz = this.z + (sz * v + lz * this.u) * dt;
    const e2 = seaEdge(nx, nz, this._edge);
    if (e2.d > 0) {
      nx -= e2.nx * e2.d;
      nz -= e2.nz * e2.d;
    }
    const hit = this._hits(nx, nz, h1);
    this.lastBlock = hit;
    if (!hit) {
      this.x = nx;
      this.z = nz;
      this.h = h1;
    } else {
      let ok = false;
      // along a landing or a quay at an angle: she scrapes along it, pushed back off it and
      // losing a little way (head on, it stops her)
      if (hit === 'wall') {
        const push = this._push;
        push.x = push.z = 0;
        this._hits(nx, nz, h1, push);
        const mx = nx - this.x, mz = nz - this.z, pl = Math.hypot(push.x, push.z), ml = Math.hypot(mx, mz);
        if (pl > 1e-4 && ml > 1e-5 && (push.x * mx + push.z * mz) / (pl * ml) > -0.75) {
          const x2 = nx + push.x * 1.1, z2 = nz + push.z * 1.1;
          if (!this._hits(x2, z2, h1)) {
            this.x = x2;
            this.z = z2;
            this.h = h1;
            v *= 1 - Math.min(1, dt * 1.5);
            ok = true;
          }
        }
      }
      // glancing off a pile or the shallows: the smallest turn away that is free
      if (!ok && Math.abs(v) > 0.4) {
        for (const dh of [0.06, -0.06, 0.12, -0.12, 0.2, -0.2]) {
          const h2 = h1 + dh, v2 = v * 0.8;
          const x2 = this.x + Math.sin(h2) * v2 * dt, z2 = this.z + Math.cos(h2) * v2 * dt;
          if (!this._hits(x2, z2, h2)) {
            this.x = x2;
            this.z = z2;
            this.h = h2;
            v = v2;
            ok = true;
            break;
          }
        }
      }
      if (!ok) {
        if (Math.abs(v) > 1.2) {
          this.audio?.sfx('boatBump');
          this.onBlocked?.(hit);
        }
        if (!this._hits(this.x, this.z, h1)) this.h = h1;
        else this.w = 0;
        v = -v * 0.15;
        this.u = 0;
      }
    }
    this.v = v;
    this._camFollow(P, dt, v);
    this._place(P);
  }

  // the camera turns with the boat and settles behind it while you do not look about
  _camFollow(P, dt, v) {
    P.yaw += wrap(this.h - (this.hCam ?? this.h));
    this.hCam = this.h;
    if (P.lookIdle > 1.2 && Math.abs(v) > 0.5) {
      const off = wrap(P.yaw - (this.h + Math.PI));
      P.yaw -= off * Math.min(1, dt * (0.5 + 0.18 * Math.abs(v)));
      P.pitch += (-0.13 - P.pitch) * Math.min(1, dt * 0.8);
    }
  }

  // the walker follows her: her feet on the landing or in the boat, seated or not
  _place(P) {
    const R = this._rider;
    if (this.state === 'sailing' || this.state === 'docking') this.seatFeet(P.pos);
    else if (R.inBoat) this.standSpot(P.pos);
    else P.pos.set(R.x, R.y, R.z);
    P.vel.set(Math.sin(this.h) * this.v, 0, Math.cos(this.h) * this.v);
    P.speed = Math.abs(this.v);
    P.onGround = true;
    P.vy = 0;
    P.stairs = null;
    P.eyeY = P.pos.y + (this.state === 'sailing' ? 1.12 : 1.5);
  }

  // her feet's place in the boat (world): under her knees on the floorboards
  seatFeet(out) {
    return out.set(SEAT.x, FLOOR, SEAT.z + 0.35).applyMatrix4(this.parts.group.matrixWorld);
  }

  // the sea's depth (m) under a point
  _depth(x, z) {
    return this.water - terrainH(x, z);
  }

  // why the boat cannot lie at (x, z) heading h: 'wall' (a pile, the breakwater, a quay),
  // 'shore' (the shallows), or null. With push: the way (and how far) the walls it is in would
  // push it out, the most of any part of the hull
  _hits(x, z, h, push = null) {
    const sx = Math.sin(h), sz = Math.cos(h), lx = Math.cos(h), lz = -Math.sin(h);
    const feet = this.water - 0.45;
    let hit = null;
    for (const [d, r] of HULL_CIRCLES) {
      const cx = x + sx * d, cz = z + sz * d;
      const p = { x: cx, z: cz };
      this.C.resolve(p, r, feet);
      const px = p.x - cx, pz = p.z - cz;
      if (Math.hypot(px, pz) > 0.02) {
        if (!push) return 'wall';
        hit = 'wall';
        if (Math.hypot(px, pz) > Math.hypot(push.x, push.z)) {
          push.x = px;
          push.z = pz;
        }
        continue;
      }
      for (const e of [0, 0.85, -0.85]) if (this._depth(cx + lx * r * e, cz + lz * r * e) < HULL.draft + 0.06) return 'shore';
    }
    return hit;
  }

  // ------------------------------------------------------------------ every frame
  update(dt, P, t = G.uTime.value) {
    const st = this.state;
    this.water = G.uTide.value;
    this.pt += dt;
    if (st === 'boarding') {
      if (this.phase === 'walk' && this.pt >= this.walkT) {
        this.phase = 'step';
        this.pt = 0;
        this.audio?.sfx('boatStep');
      } else if (this.phase === 'step' && this.pt >= T_STEP) {
        this.phase = 'sit';
        this.pt = 0;
        this.rock = 1;
      } else if (this.phase === 'sit') {
        this.k = smooth(clamp(this.pt / T_SIT, 0, 1));
        if (this.pt >= T_SIT) {
          this.k = 1;
          this.state = 'sailing';
          this.phase = null;
          this.hCam = this.h;
          this.parts.fenders.visible = false;
          this._lines(false);
          this.audio?.sfx('boatStart');
        }
      }
    } else if (st === 'leaving') {
      if (this.phase === 'stand') {
        this.k = 1 - smooth(clamp(this.pt / T_UNSIT, 0, 1));
        if (this.pt >= T_STAND) {
          this.k = 0;
          this.phase = 'step';
          this.pt = 0;
          this.audio?.sfx('boatStep');
        }
      } else if (this.phase === 'step' && this.pt >= T_STEP) {
        const b = this.berth;
        this.rock = 1;
        this._moor(b);
        if (P) {
          P.ride = null;
          P.pos.set(b.step.x, b.step.y, b.step.z);
          P.vel.set(0, 0, 0);
          if (this.boomWalk !== undefined) P.boom = this.boomWalk;
        }
        this.onLeave?.(b);
      }
    }
    // the engine: idling while she is aboard, revving with the throttle
    const aboard = this.state === 'sailing' || this.state === 'docking';
    const rpmWant = aboard ? 0.12 + 0.88 * Math.abs(this.throttle) : 0;
    this.rpm += (rpmWant - this.rpm) * Math.min(1, dt * 3);
    // riding the sea: a little heave and roll on the swell, the bow lifting with speed and
    // squatting as she opens the throttle, heeling into the turns; rocked as she steps in or out
    const v = this.v;
    const swell = 1 - 0.5 * Math.min(1, Math.abs(v) / 5);
    this.rock = Math.max(0, this.rock - dt * 0.9);
    const stepping = this.phase === 'step' ? Math.sin(Math.PI * clamp(this.pt / T_STEP, 0, 1)) : 0;
    const yWant = this.water + 0.035 * Math.sin(t * 1.3 + this.x * 0.05) * swell + 0.02 * Math.sin(t * 2.3 + 1.7) - Math.min(0.05, Math.abs(v) * 0.008) - 0.03 * stepping;
    this.y += (yWant - this.y) * Math.min(1, dt * 4);
    const pitchWant = -(clamp(v / 6, -0.3, 1) * 0.07 + this.throttle * 0.025) + 0.014 * Math.sin(t * 1.1 + 0.4) * swell;
    this.pitch += (pitchWant - this.pitch) * Math.min(1, dt * 2.5);
    const rollWant = clamp(-this.w * Math.abs(v) * 0.05, -0.13, 0.13) + 0.022 * Math.sin(t * 0.9 + 1.0) * swell - 0.06 * stepping + 0.035 * this.rock * Math.sin(this.rock * 14);
    this.roll += (rollWant - this.roll) * Math.min(1, dt * 3);
    this._pose(dt);
    this._updateRider();
    // the wake from the stern, spray from the bow, foam along the sides
    const sx = Math.sin(this.h), sz = Math.cos(this.h);
    this.wake.update(dt, this.x - sx * (HULL.L / 2 + 0.2), this.z - sz * (HULL.L / 2 + 0.2), this.h, v, this.water);
    this.spray.update(dt, this.x + sx * (HULL.L / 2 - 0.45), this.water, this.z + sz * (HULL.L / 2 - 0.45), this.h, v, this.water, this.w);
    this.foam.position.set(this.x, this.water + 0.012, this.z);
    this.foam.rotation.set(0, this.h, 0);
    this.foam.material.uniforms.uSpeed.value = clamp(Math.abs(v) / 5.5, 0, 1);
    // the lantern at dusk and through the night
    const night = G.uNight.value;
    this.lamp += ((night > 0.3 ? 1 : 0) - this.lamp) * Math.min(1, dt * 2);
    const on = this.lamp * THREE.MathUtils.smoothstep(night, 0.3, 0.8);
    const lp = _v.set(0, LANTERN_GLOW_Y, 0).applyMatrix4(this.parts.lantern.matrixWorld);
    this.halo.position.copy(lp);
    this.halo.material.uniforms.uOn.value = on;
    this.halo.visible = on > 0.01;
    this.pool.position.set(lp.x, this.water + 0.03, lp.z);
    this.pool.material.uniforms.uOn.value = on;
    this.pool.visible = on > 0.01;
    this.light = on;
    this._sound(dt);
  }

  _pose(dt) {
    const g = this.parts.group;
    g.position.set(this.x, this.y, this.z);
    g.rotation.set(this.pitch, this.h, this.roll);
    G.uBoat.value.set(this.x, this.z, Math.sin(this.h), Math.cos(this.h));
    g.updateMatrixWorld(true);
    // the sea is left out of her hull as broad as the hull is where the sea's surface meets it
    // now (she rides up and down, the tide comes and goes, she pitches): narrower, the water
    // showed in slivers along her planking inside and round her stem; broader, a gap round her
    const H = G.uBoatHull.value, sea = G.uTide.value, heel = Math.abs(this.roll) * 0.5;
    for (let i = 0; i < H.length; i++) {
      const s = section(i / (H.length - 1));
      const wy = _v.set(0, 0, s.z).applyMatrix4(g.matrixWorld).y;
      H[i] = Math.max(0, halfAt(s, sea - wy + heel) - 0.012);
    }
    // the tiller over to the side she steers (the motor swivels; less toward her, she sits
    // there), the propeller turning
    this.parts.motor.rotation.y = clamp(-this.steer * 0.58, -0.36, 0.16);
    this.parts.prop.rotation.z += dt * (this.rpm > 0.05 ? (this.throttle >= 0 ? 1 : -1) * (6 + 40 * this.rpm) : 0);
    g.updateMatrixWorld(true);
  }

  _sound(dt) {
    const A = this.audio;
    if (!A?.boat) return;
    A.boat(dt, { on: this.state === 'sailing' || this.state === 'docking', rpm: this.rpm, v: Math.abs(this.v), throttle: this.throttle });
  }

  // ------------------------------------------------------------------ her in the boat
  // the character's root takes the boat's frame
  // (on the floorboards where she stands: the same place her steps in and out start and end, so
  // her root does not jump as she sits or gets up, nor her hair's springs, which live in it)
  placeRider(root) {
    root.rotation.order = 'YXZ';
    this.standSpot(root.position);
    root.rotation.copy(this.parts.group.rotation);
  }

  // world position of her eyes (first person)
  eye(out) {
    if (this.state !== 'sailing' && this.state !== 'docking') return out.copy(this.P?.pos ?? this.parts.group.position).add(_v2.set(0, 1.5 - 0.4 * this.k, 0));
    return out.set(SEAT.x, SEAT.y + CUSHION + 0.86, SEAT.z + 0.12).applyMatrix4(this.parts.group.matrixWorld);
  }

  // Over the clip, in the boat: standing on the floorboards in front of the stern thwart (the
  // clip as it is, moved there), or seated on its cushion with her feet on the floorboards, her
  // right hand on the tiller's grip (it moves as she steers), her left on her knee, looking
  // ahead; between the two as she sits down or gets up (k)
  pose(ch) {
    if (!this._rider.inBoat) return;
    const n = ch.node, k = this.k;
    const hips = n('hips');
    // (the clip stands at the root, which is where she stands: placeRider)
    if (k <= 0) {
      if (ch.sitHips) ch._hipsY = ch.hipsHeight;
      return;
    }
    const bones = this._bones || (this._bones = ['hips', 'spine', 'chest', 'neck', 'head', 'leftUpperLeg', 'leftLowerLeg', 'leftFoot', 'rightUpperLeg', 'rightLowerLeg', 'rightFoot', 'leftUpperArm', 'leftLowerArm', 'leftHand', 'rightUpperArm', 'rightLowerArm', 'rightHand'].filter((b) => n(b)));
    const blend = k < 0.999;
    let saved = null;
    if (blend) {
      saved = bones.map((b) => n(b).quaternion.clone());
      this._hipsSaved = (this._hipsSaved || new THREE.Vector3()).copy(hips.position);
    }
    const R = ch.rest;
    const hipJ = R ? R.hips.y - R.leftUpperLeg.y : 0.04;
    // the hip joints a little over the cushion, the hips leaning back a touch (from where she
    // stands, her root)
    hips.position.set(SEAT.x - STAND.x, SEAT.y + CUSHION + 0.085 + hipJ - STAND.y, SEAT.z - 0.02 - STAND.z);
    hips.quaternion.setFromEuler(_e.set(-0.04, 0, 0, 'YXZ'));
    n('spine').quaternion.setFromEuler(_e.set(0.1, 0.05, 0, 'YXZ'));
    n('chest')?.quaternion.setFromEuler(_e.set(0.04, 0.06, 0, 'YXZ'));
    n('neck')?.quaternion.identity();
    n('head')?.quaternion.identity();
    for (const s of ['left', 'right']) for (const b of ['UpperLeg', 'LowerLeg', 'Foot', 'UpperArm', 'LowerArm', 'Hand']) n(s + b)?.quaternion.identity();
    const root = ch.root;
    root.updateMatrixWorld(true);
    const M = this.parts.group.matrixWorld;
    const rq = root.getWorldQuaternion(_q2);
    // the feet on the floorboards in front of the thwart, a little apart, the knees together
    for (const [s, sx] of [['left', 1], ['right', -1]]) {
      const ankle = _v2.set(SEAT.x + sx * 0.1, FLOOR + (ch.ankleHeight || 0.08), SEAT.z + 0.4 + (s === 'left' ? 0.03 : 0)).applyMatrix4(M);
      ch.ik(s + 'UpperLeg', s + 'LowerLeg', s + 'Foot', ankle.clone(), _v.set(sx * 0.08, 0.4, 1).applyQuaternion(rq));
      ch.setWorldQuaternion(s + 'Foot', _q.copy(rq).multiply(_q3.setFromEuler(_e.set(0.04, sx * 0.06, 0))));
    }
    // her right hand over the tiller's grip: palm down, the thumb forward along it, the
    // fingers round it (hand bones: x along the fingers (left) / back to the wrist (right), y
    // the back of the hand, z the thumb side)
    {
      const grip = this.parts.grip;
      grip.updateMatrixWorld(true);
      const mq = this.parts.motor.getWorldQuaternion(_q);
      const Z = _hz.set(0, 0, 1).applyQuaternion(mq).normalize();
      const up = _hy.set(0, 1, 0).applyQuaternion(rq);
      const Y = up.clone().addScaledVector(Z, -up.dot(Z)).normalize();
      const X = _hx.crossVectors(Y, Z).normalize();
      // (right hand: x back to the wrist; the fingers the other way)
      const fingers = _v.copy(X).negate();
      const wrist = grip.getWorldPosition(_v2).addScaledVector(fingers, -0.07).addScaledVector(Y, 0.03);
      ch.ik('rightUpperArm', 'rightLowerArm', 'rightHand', wrist.clone(), _v3.set(-0.75, -0.45, -0.4).applyQuaternion(rq));
      ch.setWorldQuaternion('rightHand', _q.setFromRotationMatrix(_hm.makeBasis(X, Y, Z)));
      for (const fg of ['Index', 'Middle', 'Ring', 'Little']) {
        for (const [j, ang] of [['Proximal', 1.1], ['Intermediate', 1.15], ['Distal', 0.7]]) n('right' + fg + j)?.quaternion.setFromAxisAngle(_v.set(0, 0, 1), ang);
      }
      n('rightThumbMetacarpal')?.quaternion.setFromEuler(_e.set(0, 0.35, 0.25));
      n('rightThumbProximal')?.quaternion.setFromAxisAngle(_v.set(0, 1, 0), 0.5);
    }
    // her left hand resting on her left knee, the fingers over it
    {
      const knee = n('leftLowerLeg').getWorldPosition(_v2);
      const fwd = _hx.set(0, 0, 1).applyQuaternion(rq);
      const up = _hy.set(0, 1, 0).applyQuaternion(rq);
      const wrist = knee.clone().addScaledVector(up, 0.085).addScaledVector(fwd, -0.12);
      ch.ik('leftUpperArm', 'leftLowerArm', 'leftHand', wrist, _v3.set(0.7, -0.3, -0.4).applyQuaternion(rq));
      const X = fwd.clone().addScaledVector(up, -0.4).normalize();
      const Y = up.clone().addScaledVector(X, -up.dot(X)).normalize();
      const Z = _hz.crossVectors(X, Y).normalize();
      ch.setWorldQuaternion('leftHand', _q.setFromRotationMatrix(_hm.makeBasis(X, Y, Z)));
      for (const fg of ['Index', 'Middle', 'Ring', 'Little']) {
        for (const [j, ang] of [['Proximal', 0.4], ['Intermediate', 0.45], ['Distal', 0.25]]) n('left' + fg + j)?.quaternion.setFromAxisAngle(_v.set(0, 0, 1), -ang);
      }
    }
    if (blend) {
      const t = smooth(k);
      bones.forEach((b, j) => n(b).quaternion.copy(saved[j].slerp(n(b).quaternion, t)));
      hips.position.lerpVectors(this._hipsSaved, hips.position, t);
    }
    // a skirt drapes forward over her lap as on a seat (character.js _drapeSkirt)
    if (ch.sitHips) ch._hipsY = THREE.MathUtils.lerp(ch.hipsHeight, ch.sitHips, k);
  }
}
