import { fbm2, smoothstep, clamp, lerp } from '../core/rng.js';

// 凪ノ島 (Nagi Island): the island out in the bay, a long sail from さくら桟橋. Its plan, as
// plain functions of x and z (no three.js: the layout's terrain asks it for heights). A green
// hump with cliffs to the south and east; on its north side, facing the town, a little fishing
// harbour (a quay, a breakwater arm round the basin, a floating landing where the boat can tie
// up), the island's few houses on the slope behind it, and a path winding up from them to the
// lighthouse and a viewing deck on the top. Built in world/island.js.
//
// Local coordinates: u = x - X (east), w = z - Z (south, out to sea; the town lies to the north)

export const ISLAND = {
  x: 700, z: 935,
  rx: 128, rz: 92,
  // the box it all lies in (the shallows round it too), world coordinates
  x0: 700 - 175, x1: 700 + 175, z0: 935 - 140, z1: 935 + 125,
  // the harbour: the quay's face (w), its ends (u), the apron's height and depth back from it
  quay: { w: -86, u0: -44, u1: 14, y: 1.9, back: 13 },
  // the breakwater arm: out from the quay's east end, then west across the basin's mouth
  mole: [[14, -86], [17, -104], [10, -114], [-16, -117]],
  // the village on the slope behind the apron: from the apron's back up to the path's foot
  village: { u0: -48, u1: 20, w0: -73, w1: -50, y1: 4.9 },
  // the path from the village up to the top, and the top (lighthouse, viewing deck)
  path: [[-12, -50], [20, -36], [-28, -14], [30, -18], [-6, 4], [11, 7]],
  top: { u: 22, w: 8, r: 13, y: 26 },
};
const I = ISLAND;

// ---------------------------------------------------------------------------- the shape
// the outline's radius factor in a direction (the island is not a plain ellipse)
function rim(th) {
  return 1 + 0.085 * Math.sin(2 * th + 0.7) + 0.055 * Math.sin(3 * th + 2.1) + 0.035 * Math.sin(5 * th + 0.3) + 0.02 * Math.sin(9 * th + 1.7);
}
// how cliffy the coast is that way: the harbour side (north) and a pebbly cove to the west low
function cliffy(th) {
  const north = Math.abs(Math.atan2(Math.sin(th + Math.PI / 2), Math.cos(th + Math.PI / 2)));
  const west = Math.abs(Math.atan2(Math.sin(th - Math.PI), Math.cos(th - Math.PI)));
  return smoothstep(0.55, 1.25, north) * smoothstep(0.18, 0.55, west);
}

// the island's own ground, before the harbour, the village and the path are cut into it
export function natural(u, w) {
  const th = Math.atan2(w / I.rz, u / I.rx);
  const R = rim(th);
  const rho = Math.hypot(u / I.rx, w / I.rz) / R;
  // metres from the shoreline (+ inland), along this direction
  const reach = R * Math.hypot(I.rx * Math.cos(th), I.rz * Math.sin(th));
  const d = (1 - rho) * reach;
  const c = cliffy(th);
  if (d <= 0) {
    // the sea floor shelving away: quickly off the cliffs, gently off the beaches
    return Math.max(-16, -0.3 + d * lerp(0.16, 0.55, c));
  }
  // the shore rising: a low bank of rock and pebbles, or a cliff
  const bank = lerp(0.32 * Math.min(d, 7), 9.5 * smoothstep(0, 6.5, d), c);
  // the hump, highest a little south-east of the middle, its slopes a little uneven
  const dome = 15.5 * Math.exp(-(((u - 21) / 64) ** 2) - (((w - 7) / 48) ** 2));
  const n = (fbm2(u * 0.035 + 11.3, w * 0.035 - 4.1, 3) - 0.5) * 3.2;
  return -0.3 + bank + (dome + n) * smoothstep(0, 14, d);
}

// ---------------------------------------------------------------------------- the path
// Where it doubles back (a hairpin), a short landing across the turn instead of a point, so
// that the two arms are a few metres apart where they meet (and one's handrail is not on the
// other): the turn's point split in two, HAIRPIN either side of it
const HAIRPIN = 2.6;
function course(raw) {
  const out = [{ u: raw[0][0], w: raw[0][1] }];
  for (let i = 1; i < raw.length - 1; i++) {
    const [vu, vw] = raw[i];
    // the arms' directions out of the turn (nearly the same where it doubles back)
    let au = raw[i - 1][0] - vu, aw = raw[i - 1][1] - vw, bu = raw[i + 1][0] - vu, bw = raw[i + 1][1] - vw;
    const la = Math.hypot(au, aw), lb = Math.hypot(bu, bw);
    au /= la;
    aw /= la;
    bu /= lb;
    bw /= lb;
    if (au * bu + aw * bw < Math.cos(1.0)) {
      out.push({ u: vu, w: vw });
      continue;
    }
    // across the turn, toward the arm it comes in by
    const eu = au - bu, ew = aw - bw, le = Math.hypot(eu, ew);
    out.push({ u: vu + (eu / le) * HAIRPIN, w: vw + (ew / le) * HAIRPIN, turn: 1 }, { u: vu - (eu / le) * HAIRPIN, w: vw - (ew / le) * HAIRPIN, turn: 2 });
  }
  const [lu, lw] = raw[raw.length - 1];
  out.push({ u: lu, w: lw });
  return out;
}
const PATH = (() => {
  const pts = course(I.path);
  let len = 0;
  for (let i = 0; i < pts.length; i++) {
    if (i) len += Math.hypot(pts[i].u - pts[i - 1].u, pts[i].w - pts[i - 1].w);
    pts[i].s = len;
  }
  // its height every metre: the ground's along it, evened out and never going down, from the
  // village's top to the top's level
  const at = (s) => {
    let i = 0;
    while (i < pts.length - 2 && pts[i + 1].s < s) i++;
    const a = pts[i], b = pts[i + 1], t = clamp((s - a.s) / (b.s - a.s), 0, 1);
    return [lerp(a.u, b.u, t), lerp(a.w, b.w, t)];
  };
  const n = Math.ceil(len), raw = [];
  for (let k = 0; k <= n; k++) raw.push(natural(...at((k / n) * len)));
  const ys = raw.map((_, k) => {
    let sum = 0, c = 0;
    for (let j = Math.max(0, k - 10); j <= Math.min(n, k + 10); j++) {
      sum += raw[j];
      c++;
    }
    return sum / c;
  });
  ys[0] = I.village.y1;
  ys[n] = I.top.y;
  // never down, and never steeper than 1 in 6 (raising the way below a steep pitch instead)
  const step = len / n, g = 0.16 * step;
  for (let k = 1; k <= n; k++) ys[k] = Math.max(ys[k - 1], ys[k]);
  for (let k = n - 1; k >= 0; k--) ys[k] = Math.max(ys[k], ys[k + 1] - g);
  for (let k = 1; k <= n; k++) ys[k] = Math.min(Math.max(ys[k - 1], ys[k]), ys[k - 1] + g);
  for (const p of pts) p.y = ys[Math.round((p.s / len) * n)];
  return { pts, len, ys, n };
})();
const pathY = (s) => {
  const f = clamp(s / PATH.len, 0, 1) * PATH.n, k = Math.min(PATH.n - 1, Math.floor(f));
  return lerp(PATH.ys[k], PATH.ys[k + 1], f - k);
};
export const PATH_W = 2.4;

// the nearest point of the path: { d (m), y (its height there), s (m along it) }
export function pathNear(u, w) {
  let best = { d: Infinity, y: 0, s: 0 };
  const P = PATH.pts;
  for (let i = 0; i < P.length - 1; i++) {
    const a = P[i], b = P[i + 1];
    const dx = b.u - a.u, dw = b.w - a.w, l2 = dx * dx + dw * dw;
    const t = clamp(((u - a.u) * dx + (w - a.w) * dw) / l2, 0, 1);
    const d = Math.hypot(u - (a.u + dx * t), w - (a.w + dw * t));
    if (d < best.d) best = { d, y: 0, s: lerp(a.s, b.s, t) };
  }
  best.y = pathY(best.s);
  return best;
}
// its corners, world coordinates (turn: 1 and 2 at the two ends of a hairpin's landing)
export function pathPoints() {
  return PATH.pts.map((p) => ({ x: I.x + p.u, z: I.z + p.w, y: p.y, s: p.s, turn: p.turn || 0 }));
}
// the path's height s metres along it, and its length
export { pathY };
export const PATH_LEN = PATH.len;

// ---------------------------------------------------------------------------- the ground
const VQ = I.quay, VV = I.village;
// the village's ground: a gentle slope from the apron up to the path's foot
function villageY(w) {
  return lerp(VQ.y + 0.15, VV.y1, clamp((w - VV.w0) / (VV.w1 - VV.w0), 0, 1));
}
// how far (m) outside a rectangle (negative inside)
function boxOut(u, w, u0, u1, w0, w1) {
  const du = Math.max(u0 - u, u - u1), dw = Math.max(w0 - w, w - w1);
  return du > 0 && dw > 0 ? Math.hypot(du, dw) : Math.max(du, dw);
}

// the island's ground height at world (x, z), or null away from it
export function islandH(x, z) {
  if (x < I.x0 || x > I.x1 || z < I.z0 || z > I.z1) return null;
  const u = x - I.x, w = z - I.z;
  let y = natural(u, w);
  // the top: levelled round the lighthouse
  const dt = Math.hypot(u - I.top.u, w - I.top.w);
  if (dt < I.top.r + 7) y = lerp(I.top.y, y, smoothstep(I.top.r, I.top.r + 7, dt));
  // the path: a level bench cut into the slope (or built up over a hollow), 2.4 m wide
  const p = pathNear(u, w);
  if (p.d < PATH_W / 2 + 4.5) y = lerp(p.y, y, smoothstep(PATH_W / 2, PATH_W / 2 + 4.5, p.d));
  // the village's slope and the apron behind the quay, level
  const vo = boxOut(u, w, VV.u0, VV.u1, VV.w0, VV.w1);
  if (vo < 6) y = lerp(villageY(w), y, smoothstep(0, 6, vo));
  const ao = boxOut(u, w, VQ.u0, VQ.u1, VQ.w, VQ.w + VQ.back);
  if (w >= VQ.w && ao < 4) y = lerp(VQ.y, y, smoothstep(0, 4, ao));
  // the basin in front of the quay, dredged
  if (w < VQ.w) {
    const bo = boxOut(u, w, VQ.u0 - 4, VQ.u1 + 4, VQ.w - 26, VQ.w);
    if (bo < 14) y = Math.min(y, lerp(-3.2, y, smoothstep(0, 14, bo)));
  }
  return y;
}

// may she walk here (the apron, the village's lanes, the path and the top)? The rest of the
// island is steep wood and cliff
export function islandWalk(x, z) {
  if (x < I.x0 || x > I.x1 || z < I.z0 || z > I.z1) return false;
  const u = x - I.x, w = z - I.z;
  if (u > VQ.u0 && u < VQ.u1 && w > VQ.w && w < VQ.w + VQ.back) return true;
  // the steps down the quay's face, the floating landing at their foot
  if (u > -30.8 && u < -29.2 && w > -89.6 && w <= VQ.w) return true;
  if (u > -36 && u < -24 && w > -92 && w <= -89.5) return true;
  // the viewing deck over the top's north edge
  if (u > I.top.u - 6 && u < I.top.u + 6 && w > I.top.w - I.top.r - 2.7 && w < I.top.w - I.top.r + 1.7) return true;
  if (u > VV.u0 && u < VV.u1 && w > VV.w0 - 0.5 && w < VV.w1 + 1) return true;
  if (pathNear(u, w).d < PATH_W / 2 + 0.25) return true;
  if (Math.hypot(u - I.top.u, w - I.top.w) < I.top.r - 0.6) return true;
  return false;
}
