import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin } from '@pixiv/three-vrm';
import { MeshBuilder, PAT } from '../core/builder.js';
import { RNG } from '../core/rng.js';
import { ROADS, inRiver, groundH } from './layout.js';
import { Character, loadAsset, loadMotions } from '../systems/character.js';
import { makePhone, holdPhone } from './residents.js';

// Passers-by: people out and about in town for company. Nine base models (high school girls
// and boys in the two uniforms, women and a man in everyday clothes), each one dressed
// differently: hair repainted in blacks and browns, the everyday clothes in other colours
// (the uniforms stay as they are), no two alike. They wander the sidewalks (a network built
// from the town's roads: along them, round the corners, across), jog by the river, ride to
// school on their mamachari, chat by the school gate, wait at bus stops and sit on benches.
// Every step is checked: never into the river or a wall, round each other, round you.

const MODELS = {
  girl1: { file: 'chars/ped_student1.vrm', uniform: true }, // sailor uniform
  girl2: { file: 'chars/ped_student2.vrm', uniform: true }, // blazer
  boy1: { file: 'chars/ped_boy1.vrm', uniform: true, male: true }, // summer shirt (the sailor uniform's school)
  boy2: { file: 'chars/ped_boy2.vrm', uniform: true, male: true }, // blazer
  woman1: { file: 'chars/ped_woman1.vrm' },
  woman2: { file: 'chars/ped_woman2.vrm' },
  woman3: { file: 'chars/ped_woman3.vrm' },
  woman4: { file: 'chars/ped_woman4.vrm', dress: true }, // a pink dress with white lace: the lace stays
  man1: { file: 'chars/ped_man1.vrm', male: true },
};

// blacks and browns (null: the models' own brown)
const HAIR = ['#1f1b1e', '#3a2a22', null, '#2b2326', '#55341f', '#6e4a30'];
const TOPS = ['#f2c4cc', '#bcd6ea', '#c6d6b4', '#f4eee2', '#e2cce2', '#d8a8a0', '#f6e7b8', '#a8c4e0', '#8a8f96', '#c87a5a', '#2f3f5e', '#e8d8c8'];
const BOTTOMS = ['#2e3a58', '#d6c6a6', '#46587a', '#2a2a30', '#6a5a4a', '#3a3a44', '#c8b89a', '#6a6e74', '#f0ece2'];
const MAN_TOPS = ['#2f3f5e', '#f2f2ee', '#6b7a4a', '#8a8f96', '#a8c4e0', '#5a3a3a', '#3a4a3a', '#c8b89a'];
const MAN_BOTTOMS = ['#c8b89a', '#3a4e6e', '#2a2a2e', '#6a6e74', '#4a4038'];
const DRESS = ['#bcd6ea', '#c6d6b4', '#e2cce2', '#f6e7b8', '#f2c4cc', '#d8e8f0'];

const SCHOOL = [7, 18.5], DAY = [6.5, 20.5];
const RUN = [[6, 9], [16, 19.5]]; // a run before work, or in the evening

// who, doing what, where: walkers wander the sidewalks within r of `near`; riders loop a
// road (keeping left); the others stand or sit at a spot
const PEOPLE = [
  // wandering the streets
  { model: 'girl1', act: 'walk', near: [-35, -15], r: 40, hours: [7, 19] },
  { model: 'woman1', act: 'walk', near: [-35, -15], r: 40, hours: [9, 19.5], phone: true },
  { model: 'woman3', act: 'walk', near: [-35, -15], r: 40, hours: DAY },
  { model: 'man1', act: 'walk', near: [-35, -15], r: 40, hours: DAY },
  { model: 'boy2', act: 'walk', near: [28, -45], r: 45, hours: SCHOOL, phone: true },
  { model: 'woman2', act: 'walk', near: [28, -45], r: 45, hours: DAY },
  { model: 'woman4', act: 'walk', near: [-95, -40], r: 50, hours: [9, 19] },
  { model: 'man1', act: 'walk', near: [-95, -40], r: 50, hours: DAY, phone: true },
  { model: 'girl2', act: 'walk', near: [182, -15], r: 40, hours: [7.5, 19] },
  { model: 'woman3', act: 'walk', near: [182, -15], r: 40, hours: [8, 20], phone: true },
  { model: 'girl2', act: 'walk', near: [250, -25], r: 45, hours: SCHOOL, phone: true },
  { model: 'woman1', act: 'walk', near: [250, -25], r: 45, hours: DAY },
  { model: 'man1', act: 'walk', near: [250, -25], r: 45, hours: DAY },
  { model: 'girl1', act: 'walk', near: [330, -60], r: 55, hours: SCHOOL, phone: true },
  { model: 'boy1', act: 'walk', near: [330, -60], r: 55, hours: SCHOOL },
  { model: 'woman4', act: 'walk', near: [380, 10], r: 40, hours: DAY },
  // out for a run along the river paths
  { model: 'man1', act: 'jog', near: [182, -40], r: 80, hours: RUN },
  { model: 'woman2', act: 'jog', near: [182, -40], r: 80, hours: RUN },
  // on their bicycles
  { model: 'boy1', act: 'cycle', route: { axis: 'z', c: 324, a: -110, b: 30 }, hours: SCHOOL, bike: 0x9fb8c8 },
  { model: 'girl1', act: 'cycle', route: { axis: 'z', c: 30, a: -105, b: 34 }, hours: SCHOOL, bike: 0xf2f2ee },
  { model: 'girl2', act: 'cycle', route: { axis: 'x', c: 20, a: 200, b: 318 }, hours: SCHOOL, bike: 0xe8a0a8 },
  { model: 'boy2', act: 'cycle', route: { axis: 'z', c: -70, a: -110, b: 30 }, hours: SCHOOL, bike: 0x4a5a6a, lane: 1.1 },
  { model: 'man1', act: 'cycle', route: { axis: 'x', c: -85, a: 200, b: 325 }, hours: DAY, bike: 0x2f4a3a },
  // chatting: by the school gate, in front of the station, by the fountain in the plaza
  { act: 'chat', at: [379.5, -25], hours: [7.5, 18.5], members: ['boy1', 'boy1', 'girl1'] },
  { act: 'chat', at: [-38, 32], hours: [8, 18.5], members: ['girl2', 'girl2'] },
  { act: 'chat', at: [234.5, -30], hours: [9, 19], members: ['woman1', 'woman3'] },
  // waiting for the bus
  { model: 'man1', act: 'wait', at: [259.4, -1], hours: [7, 20], phone: true },
  { model: 'woman2', act: 'wait', at: [349, 16.4], hours: [8, 19] },
  // sitting on a bench
  { model: 'woman1', act: 'sit', at: [167.8, -29.9], hours: [9, 18] },
  { model: 'girl1', act: 'sit', at: [-45.3, 33], hours: [8, 18] },
];

// Looks: each instance of a model gets the next combination of a shuffled list, so no two
// people in town are dressed alike (students: their own hair colour each).
function wardrobe() {
  const used = {};
  const lists = {};
  const shuffle = (a, seed) => {
    const r = new RNG(seed);
    for (let i = a.length - 1; i > 0; i--) {
      const j = r.int(0, i);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  return (model) => {
    const M = MODELS[model];
    if (!lists[model]) {
      const combos = [];
      if (M.uniform) for (const h of HAIR) combos.push({ hair: h });
      else if (M.dress) for (const h of HAIR) for (const d of DRESS) combos.push({ hair: h, dress: d });
      else {
        const T = M.male ? MAN_TOPS : TOPS, B = M.male ? MAN_BOTTOMS : BOTTOMS;
        for (const h of HAIR) for (const t of T) for (const b of B) combos.push({ hair: h, tops: t, bottoms: b });
      }
      lists[model] = shuffle(combos, model.length * 7919 + model.charCodeAt(0));
      used[model] = 0;
    }
    return lists[model][used[model]++ % lists[model].length];
  };
}

// which materials a look repaints
function painter(look) {
  const rules = [];
  if (look.hair) rules.push(['HAIR', look.hair]);
  if (look.tops) rules.push(['Tops', look.tops]);
  if (look.bottoms) rules.push(['Bottoms', look.bottoms]);
  if (look.dress) rules.push(['CLOTH_01', look.dress], ['CLOTH_03', look.dress]);
  return (name) => {
    for (const [k, c] of rules) if (name.includes(k)) return new THREE.Color(c);
    return null;
  };
}

const CLIPS = {
  f: { walk: 'walk', idle: 'idle', idles: ['idle', 'lookFar', 'sway', 'idle'], talk: ['talk', 'talkB', 'agree'] },
  m: { walk: 'walkM', idle: 'idleM', idles: ['idleM', 'shiftM', 'lookAround', 'idleM'], talk: ['talk', 'think', 'acknowledge'] },
};
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const inHours = (h, hours) => (Array.isArray(hours[0]) ? hours : [hours]).some(([a, b]) => h >= a && h < b);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler();

// ------------------------------------------------------------------------------- safe ground
// Somewhere a person may stand: not in a wall or over the river's water (a bridge is fine),
// and no sudden drop from the ground at `prev` (a retaining wall, the river bank).
function makeSafe(C) {
  const water = (x, z) => inRiver(x, z) && C.groundAt(x, z) < groundH(x, z) - 0.8;
  const solid = (x, z) => C.solidAt(x, z, C.groundAt(x, z));
  return {
    water,
    point: (x, z) => !water(x, z) && !solid(x, z),
    // a body (r around the point) and the step from the previous point
    body(x, z, r = 0.3, prev = null) {
      if (water(x, z) || solid(x, z)) return false;
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2;
        if (solid(x + Math.cos(a) * r, z + Math.sin(a) * r)) return false;
      }
      return !prev || Math.abs(C.groundAt(x, z) - C.groundAt(prev[0], prev[1])) < 0.35;
    },
  };
}

// ------------------------------------------------------------------------------- the walk network
// Pedestrian lanes along every road (the sidewalks; on lanes without one, its edges; two lines
// down the river paths), broken where a crossing road passes; then joined round each corner
// and across each crossing road. Every lane is sampled: a blocked stretch is passed by
// stepping aside, or the lane ends there. Away from the railway and the coast road.
function buildWalkGraph(C) {
  const safe = makeSafe(C);
  const ZMAX = 40; // the station and the railway beyond
  const SKIP = new Set(['coast', 'rail-w', 'rail-e']);
  const roads = ROADS.filter((r) => !SKIP.has(r.id) && !(r.axis === 'x' && r.c > ZMAX));
  const half = (r) => r.w / 2 + (r.sidewalk || 0);
  const lanes = (r) => (r.path ? [-2.2, 2.2] : r.sidewalk ? [-(r.w / 2 + r.sidewalk / 2), r.w / 2 + r.sidewalk / 2] : [-(r.w / 2 - 0.7), r.w / 2 - 0.7]);
  const span = (r) => [Math.max(r.a, -125), r.axis === 'z' ? Math.min(r.b, ZMAX) : r.b];
  const nodes = [], edges = [];
  const node = (x, z) => {
    for (const n of nodes) if (Math.abs(n.x - x) < 0.45 && Math.abs(n.z - z) < 0.45) return n;
    const n = { x, z, edges: [] };
    nodes.push(n);
    return n;
  };
  const findNode = (x, z) => nodes.find((n) => Math.abs(n.x - x) < 0.5 && Math.abs(n.z - z) < 0.5);
  const addEdge = (pts, kind) => {
    if (pts.length < 2) return;
    let len = 0;
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push((len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])));
    if (len < 1.5) return;
    const a = node(...pts[0]), b = node(...pts[pts.length - 1]);
    if (a === b) return;
    const e = { a, b, pts, cum, len, kind };
    a.edges.push(e);
    b.edges.push(e);
    edges.push(e);
  };
  // a straight lane piece from u0 to u1: walkable points every 0.25 m, stepping aside
  // round obstacles; where there is no way past, the piece is cut in two
  const piece = (r, off, u0, u1, kind) => {
    const P = (u, o) => (r.axis === 'z' ? [r.c + off + o, u] : [u, r.c + off + o]);
    let pts = [];
    let from = null, prev = null;
    const flush = () => {
      if (pts.length > 1) addEdge(pts, kind);
      pts = [];
    };
    for (let u = u0; u <= u1 + 1e-6; u += 0.25) {
      const p = P(u, 0);
      const ok = safe.body(p[0], p[1], 0.32, prev);
      if (ok && from === null) {
        pts.push(p);
        prev = p;
        continue;
      }
      if (!ok && from === null) from = u;
      if (ok && from !== null) {
        // past the obstacle: the narrowest step aside that is clear all the way
        const aside = [0.7, -0.7, 1.1, -1.1, 1.5, -1.5].find((o) => {
          let q = prev;
          for (let w = from - 0.75; w <= u + 0.75; w += 0.25) {
            const s = P(w, o);
            if (!safe.body(s[0], s[1], 0.32, q)) return false;
            q = s;
          }
          return true;
        });
        if (aside !== undefined) {
          pts.push(P(from - 1.0, 0), P(from - 0.5, aside), P(u + 0.5, aside), P(u + 1.0, 0));
          u += 1.0;
          prev = P(u, 0);
        } else {
          flush();
          pts.push(p);
          prev = p;
        }
        from = null;
      }
    }
    if (from === null) flush();
    else flush();
  };
  const crossing = (q, r) => q.axis !== r.axis && q !== r;
  const m = 0.35;
  for (const r of roads) {
    const [A, B] = span(r);
    for (const off of lanes(r)) {
      const lc = r.c + off;
      const gaps = roads.filter((q) => crossing(q, r) && lc >= q.a && lc <= q.b).map((q) => [q.c - half(q) - m, q.c + half(q) + m]).filter(([g0, g1]) => g1 > A && g0 < B).sort((x, y) => x[0] - y[0]);
      let u = A;
      for (const [g0, g1] of gaps) {
        if (g0 > u) piece(r, off, u, g0, r.path ? 'path' : 'lane');
        u = Math.max(u, g1);
      }
      if (B > u) piece(r, off, u, B, r.path ? 'path' : 'lane');
    }
  }
  // joints: a straight join between two nodes if it is clear all the way
  const join = (p, q, kind) => {
    if (!p || !q || p === q) return;
    const d = Math.hypot(q.x - p.x, q.z - p.z), n = Math.max(2, Math.ceil(d / 0.25));
    const pts = [];
    let prev = null;
    for (let i = 0; i <= n; i++) {
      const s = [p.x + ((q.x - p.x) * i) / n, p.z + ((q.z - p.z) * i) / n];
      if (!safe.body(s[0], s[1], 0.28, prev)) return;
      pts.push(s);
      prev = s;
    }
    addEdge(pts, kind);
  };
  for (const r of roads) {
    for (const q of roads) {
      if (!crossing(q, r) || r.axis !== 'z') continue; // each pair once: r runs along z, q along x
      for (const o of lanes(r)) {
        const lx = r.c + o;
        if (lx < q.a || lx > q.b) continue;
        for (const p of lanes(q)) {
          const lz = q.c + p;
          if (lz < r.a || lz > Math.min(r.b, ZMAX)) continue;
          // round the corner: r's lane end on q's p side, q's lane end on r's o side
          const ra = findNode(lx, q.c + Math.sign(p) * (half(q) + m)), qa = findNode(r.c + Math.sign(o) * (half(r) + m), lz);
          join(ra, qa, 'corner');
        }
        // across q along r's lane
        join(findNode(lx, q.c - half(q) - m), findNode(lx, q.c + half(q) + m), r.path ? 'path' : 'cross');
      }
      for (const p of lanes(q)) {
        const lz = q.c + p;
        if (lz < r.a || lz > Math.min(r.b, ZMAX)) continue;
        if (r.c + lanes(r)[0] < q.a && r.c + lanes(r)[1] > q.b) continue;
        // across r along q's lane
        join(findNode(r.c - half(r) - m, lz), findNode(r.c + half(r) + m, lz), q.path ? 'path' : 'cross');
      }
    }
  }
  // a last look along every edge (the joins of a step aside run diagonally): anything that
  // touches a wall or water is dropped
  for (const e of edges.slice()) {
    let ok = true;
    for (let s = 0; s <= e.len && ok; s += 0.25) {
      const p = along(e, s);
      ok = safe.point(p.x, p.z);
    }
    if (!ok) {
      edges.splice(edges.indexOf(e), 1);
      e.a.edges.splice(e.a.edges.indexOf(e), 1);
      e.b.edges.splice(e.b.edges.indexOf(e), 1);
    }
  }
  return { nodes, edges, safe };
}

// along an edge's polyline: point and direction at distance s from its start
function along(e, s) {
  const { pts, cum } = e;
  s = Math.max(0, Math.min(e.len, s));
  let lo = 0, hi = pts.length - 2;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (cum[mid] <= s) lo = mid;
    else hi = mid - 1;
  }
  const p = pts[lo], q = pts[lo + 1], seg = cum[lo + 1] - cum[lo] || 1;
  const t = (s - cum[lo]) / seg;
  return { x: p[0] + (q[0] - p[0]) * t, z: p[1] + (q[1] - p[1]) * t, dx: (q[0] - p[0]) / seg, dz: (q[1] - p[1]) / seg };
}

// A cyclist's loop: up one side of the road keeping left, round at the end, back down the
// other side; any point that is not clear is moved toward the middle of the road.
function bikeLoop(r, safe, lane = 1.35) {
  const pts = [];
  const lo = Math.min(r.a, r.b), hi = Math.max(r.a, r.b);
  const side = r.axis === 'z' ? 1 : -1; // travelling +u, the left is +x on a z road, -z on an x road
  const P = (u, off) => (r.axis === 'z' ? [r.c + off, u] : [u, r.c + off]);
  const clear = (u, off) => {
    for (let k = 0; k < 6; k++) {
      const o = off * (1 - k * 0.15), p = P(u, o);
      if (safe.body(p[0], p[1], 0.4)) return p;
    }
    return P(u, 0);
  };
  for (let u = lo; u < hi; u += 1) pts.push(clear(u, side * lane));
  for (let k = 0; k <= 10; k++) {
    const a = (k / 10) * Math.PI;
    pts.push(P(hi + Math.sin(a) * lane, side * lane * Math.cos(a)));
  }
  for (let u = hi; u > lo; u -= 1) pts.push(clear(u, -side * lane));
  for (let k = 0; k <= 10; k++) {
    const a = (k / 10) * Math.PI;
    pts.push(P(lo - Math.sin(a) * lane, -side * lane * Math.cos(a)));
  }
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const len = cum[cum.length - 1] + Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]);
  const at = (s) => {
    s = ((s % len) + len) % len;
    let i = 0, a = 0, b = pts.length - 1;
    while (a <= b) {
      const mid = (a + b) >> 1;
      if (cum[mid] <= s) {
        i = mid;
        a = mid + 1;
      } else b = mid - 1;
    }
    const p = pts[i], q = pts[(i + 1) % pts.length];
    const seg = (i + 1 < pts.length ? cum[i + 1] : len) - cum[i];
    const t = seg > 0 ? (s - cum[i]) / seg : 0;
    return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
  };
  return { len, at };
}

// a clear, level place of radius r near (x, z)
function spotNear(C, safe, x, z, r) {
  const ok = (px, pz) => {
    if (!safe.body(px, pz, 0.3)) return false;
    const g = C.groundAt(px, pz);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2, qx = px + Math.cos(a) * r, qz = pz + Math.sin(a) * r;
      if (!safe.body(qx, qz, 0.3) || Math.abs(C.groundAt(qx, qz) - g) > 0.15) return false;
    }
    return true;
  };
  for (let d = 0; d < 8; d += 0.5) {
    const n = Math.max(1, Math.round(d * 8));
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      if (ok(x + Math.cos(a) * d, z + Math.sin(a) * d)) return [x + Math.cos(a) * d, z + Math.sin(a) * d];
    }
  }
  return null;
}

// ------------------------------------------------------------------------------- the bicycle
// A mamachari facing +z: step-through frame, a front basket, a rear rack, mudguards and a
// chain guard; the wheels and the crank turn. Saddle and bars are set for its rider. The
// tyres stand on the ground (axles one tyre radius up).
const TYRE = 0.334;
function makeBike(material, color, fit) {
  const g = new THREE.Group();
  const f = new MeshBuilder();
  const rod = (a, b, r, c = color) => f.rod(a, b, r, r, 6, c);
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const BB = V(0, 0.28, -0.02), RA = V(0, TYRE, -0.52), FA = V(0, TYRE, 0.56);
  const HB = V(0, 0.52, 0.47), HT = V(0, 0.8, 0.43);
  const ST = V(0, fit.saddleY - 0.14, fit.saddleZ + 0.05), SM = V(0, 0.6, -0.17);
  for (const x of [-0.045, 0.045]) {
    rod(V(x, BB.y, BB.z), V(x, RA.y, RA.z), 0.012); // chain stays
    rod(V(x, SM.y, SM.z), V(x, RA.y, RA.z), 0.011); // seat stays
    rod(V(x * 1.1, HB.y, HB.z), V(x * 1.1, FA.y, FA.z), 0.013); // fork
  }
  rod(BB, ST, 0.02);
  const D1 = V(0, 0.36, 0.2); // the low step-through tube
  rod(HB, D1, 0.024);
  rod(D1, BB, 0.024);
  rod(HB, HT, 0.026);
  // stem, swept-back bars, grips
  const SB = V(0, fit.gripY + 0.03, 0.4);
  rod(HT, SB, 0.016, 0x9a9da0);
  for (const s of [1, -1]) {
    const mid = V(s * 0.17, fit.gripY + 0.02, (0.4 + fit.gripZ) / 2 + 0.05);
    const end = V(s * 0.25, fit.gripY, fit.gripZ + 0.03);
    rod(SB, mid, 0.011, 0xc0c4c8);
    rod(mid, end, 0.011, 0xc0c4c8);
    rod(end, V(s * 0.31, fit.gripY - 0.01, fit.gripZ - 0.04), 0.018, 0x2a2a2a);
  }
  // the saddle on its post
  rod(ST, V(0, fit.saddleY - 0.04, fit.saddleZ), 0.012, 0x9a9da0);
  f.box(0, fit.saddleY - 0.03, fit.saddleZ, 0.17, 0.06, 0.26, { color: 0x3b2f2a });
  // basket, rack, mudguards, chain guard
  f.box(0, 0.8, 0.71, 0.36, 0.24, 0.3, { color: 0xb8bcc0, pattern: PAT.LATTICE });
  rod(V(0, 0.69, 0.6), HB, 0.01, 0x9a9da0);
  f.box(0, 0.67, -0.56, 0.16, 0.02, 0.34, { color: 0x6a6e72 });
  for (const x of [-0.06, 0.06]) rod(V(x, 0.66, -0.68), V(x, RA.y, RA.z), 0.008, 0x6a6e72);
  for (const [c, a0, a1] of [[RA, -0.35, 2.2], [FA, 0.9, 3.6]]) {
    let prev = null;
    for (let k = 0; k <= 8; k++) {
      const a = a0 + ((a1 - a0) * k) / 8, p = V(0, c.y + Math.sin(a) * 0.38, c.z - Math.cos(a) * 0.38);
      if (prev) rod(prev, p, 0.024, color);
      prev = p;
    }
  }
  f.box(-0.08, 0.3, -0.27, 0.02, 0.13, 0.56, { color });
  const frame = new THREE.Mesh(f.toGeometry(), material);
  // a wheel: tyre, rim, hub and spokes, turning about the axle (x)
  const wheel = (at) => {
    const w = new MeshBuilder();
    const I = new THREE.Matrix4();
    w.geom(new THREE.TorusGeometry(TYRE - 0.024, 0.024, 5, 18).rotateY(Math.PI / 2), I, 0x2b2b2b);
    w.geom(new THREE.TorusGeometry(TYRE - 0.05, 0.008, 3, 18).rotateY(Math.PI / 2), I, 0xc8ccd0);
    w.rod(V(-0.045, 0, 0), V(0.045, 0, 0), 0.025, 0.025, 8, 0x9a9a9a);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      w.rod(V(0, 0, 0), V(0, Math.sin(a) * (TYRE - 0.055), Math.cos(a) * (TYRE - 0.055)), 0.004, 0.004, 3, 0xd8dce0);
    }
    const mm = new THREE.Mesh(w.toGeometry(), material);
    mm.position.copy(at);
    return mm;
  };
  const rear = wheel(RA), front = wheel(FA);
  // crank: chainring on the right (-x), arms; the pedals stay level, placed each frame
  const cr = new MeshBuilder();
  cr.geom(new THREE.CylinderGeometry(0.095, 0.095, 0.01, 16).rotateZ(Math.PI / 2).translate(-0.075, 0, 0), new THREE.Matrix4(), 0x9a9da0);
  cr.rod(V(-0.09, 0, 0), V(0.09, 0, 0), 0.012, 0.012, 6, 0x6a6e72);
  // at rest the left arm (+x) points down, the right one up (see the pedals in Rider.update)
  cr.box(0.09, -0.0825, 0, 0.018, 0.165, 0.025, { color: 0x9a9da0 });
  cr.box(-0.09, 0.0825, 0, 0.018, 0.165, 0.025, { color: 0x9a9da0 });
  const crank = new THREE.Mesh(cr.toGeometry(), material);
  crank.position.copy(BB);
  const pd = new MeshBuilder();
  pd.box(0, 0, 0, 0.1, 0.025, 0.065, { color: 0x2a2a2a });
  const pg = pd.toGeometry();
  const pedals = [new THREE.Mesh(pg, material), new THREE.Mesh(pg, material)];
  g.add(frame, rear, front, crank, ...pedals);
  g.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
      o.userData.bike = true;
    }
  });
  return { group: g, rear, front, crank, pedals, BB, R: 0.165 };
}

// where the saddle and the bars go for this rider (character space, from the rest pose)
function fitBike(ch) {
  const R = ch.rest;
  const hipJ = R.leftUpperLeg, knee = R.leftLowerLeg, ankle = R.leftFoot;
  const L = hipJ.distanceTo(knee) + knee.distanceTo(ankle);
  const hipOff = R.hips.y - hipJ.y;
  const hipJZ = -0.25, dz = -0.02 - 0.09 - hipJZ;
  const hipJY = 0.28 - 0.165 + 0.075 + Math.sqrt(Math.max(0.1, (0.93 * L) ** 2 - dz * dz));
  const hipsY = hipJY + hipOff, hipsZ = hipJZ + (R.hips.z - hipJ.z);
  const sh = R.leftUpperArm, el = R.leftLowerArm, wr = R.leftHand;
  const A = sh.distanceTo(el) + el.distanceTo(wr);
  const shY = hipsY + (sh.y - R.hips.y) * 0.97, shZ = hipsZ + 0.12;
  const gripZ = 0.14, dx = 0.28 - Math.abs(sh.x), reach = 0.9 * A;
  const gripY = THREE.MathUtils.clamp(shY - Math.sqrt(Math.max(0.01, reach * reach - (gripZ - shZ) ** 2 - dx * dx)), 0.92, 1.14);
  return { hipsY, hipsZ, saddleY: hipJY - 0.07, saddleZ: hipJZ - 0.03, gripY, gripZ, ankleUp: 0.075, ankleBack: 0.09 };
}

// ------------------------------------------------------------------------------- people
class Person {
  constructor(ch, world, spec) {
    this.ch = ch;
    this.spec = spec;
    const C = (this.C = world.colliders);
    ch.ground = (x, z) => C.groundAt(x, z);
    this.male = !!MODELS[spec.model].male;
    this.set = CLIPS[this.male ? 'm' : 'f'];
    this.solid = C.addDynamicBox(0.24, 0.24, 0, 99, -99);
    this.phone = spec.phone ? makePhone(this.male ? 0x3a3c40 : spec.model.startsWith('girl') ? 0xa8d0f0 : 0xf3e0b0) : null;
    this.lod = Math.floor(Math.random() * 4);
    this.acc = 0;
    this.away = false;
    this.x = this.z = this.heading = 0;
    this.speed = 0;
  }

  setAway(away) {
    this.away = away;
    this.ch.root.visible = !away;
    this.solid.off = away;
    if (this.phone) this.phone.visible = false;
  }

  // out and about? They come and go out of sight (respawn: back somewhere on their way)
  presence(cam, hour) {
    const out = inHours(hour, this.spec.hours ?? DAY);
    this.dc = Math.hypot(cam.x - this.x, cam.z - this.z);
    if (!out && !this.away && this.dc > 45) this.setAway(true);
    if (out && this.away && this.dc > 45) {
      this.setAway(false);
      this.respawn?.();
    }
    return !this.away;
  }

  place(y = this.C.groundAt(this.x, this.z)) {
    const r = this.ch.root;
    r.position.set(this.x, y, this.z);
    r.rotation.set(0, this.heading, 0);
    this.solid.cx = this.x;
    this.solid.cz = this.z;
    this.solid.yTop = y + 1.5;
    this.solid.yBottom = y - 0.5;
  }

  // drawn and animated near the camera only; further off, every few frames, without hair
  // physics or a shadow
  animate(dt, player, look = null) {
    const ch = this.ch, dc = this.dc;
    const shown = dc < (this.far ?? 75);
    ch.root.visible = shown;
    if (!shown) {
      if (this.phone) this.phone.visible = false;
      return;
    }
    const near = dc < 30;
    if (near !== this.shadowed) {
      this.shadowed = near;
      ch.root.traverse((o) => {
        if (o.isMesh && !o.material.transparent) o.castShadow = near;
      });
    }
    const lite = dc > 25;
    if (lite !== ch.lite) {
      ch.lite = lite;
      if (!lite) ch.resetPhysics();
    }
    if (look) ch.lookAt(look, 0.8);
    else if (player && Math.hypot(player.pos.x - this.x, player.pos.z - this.z) < 3.5) ch.lookAt(_v.set(player.head.x, player.head.y, player.head.z), 0.7);
    else ch.lookAt(null);
    const every = dc < 25 ? 1 : dc < 45 ? 2 : 4;
    this.acc += dt;
    if (++this.lod % every === 0) {
      ch.update(this.acc);
      this.acc = 0;
      if (this.phone) holdPhone(ch, this.phone);
    }
  }
}

// Wandering the walk network within reach of home: on along a lane, round a corner or across
// at each junction (never straight back unless it is a dead end), now and then a stop or a
// change of mind; stepping aside for anyone in the way, waiting when there is no room.
class Walker extends Person {
  constructor(ch, world, spec, G) {
    super(ch, world, spec);
    this.G = G;
    this.jog = spec.act === 'jog';
    this.home = spec.near;
    this.R = spec.r;
    const inside = (n) => Math.hypot(n.x - this.home[0], n.z - this.home[1]) < this.R;
    this.edges = G.edges.filter((e) => inside(e.a) && inside(e.b) && (!this.jog || e.kind === 'path'));
    this.rate = this.jog ? 1.05 + Math.random() * 0.15 : (this.male ? 0.8 : 0.86) + Math.random() * 0.14;
    this.off = 0;
    this.respawn();
  }

  respawn() {
    const e = this.edges.length ? pick(this.edges) : this.G.edges[0];
    this.e = e;
    this.dir = Math.random() < 0.5 ? 1 : -1;
    this.s = Math.random() * e.len;
    this.off = 0;
    const p = along(e, this.s);
    this.x = p.x;
    this.z = p.z;
    this.heading = Math.atan2(p.dx * this.dir, p.dz * this.dir);
    this.nextPause = 15 + Math.random() * 40;
    this.walk();
  }

  walk() {
    this.state = 'walk';
    this.clip = this.jog ? 'jog' : this.phone && !this.male && Math.random() < 0.4 ? 'walkText' : this.set.walk;
    this.pace = this.rate * (0.94 + Math.random() * 0.12);
    this.speed = this.ch.info[this.clip].speed * this.pace;
    this.ch.play(this.clip, 0.4, this.pace);
  }

  pause(secs, clip = pick(this.set.idles)) {
    this.state = 'pause';
    this.timer = secs;
    this.speed = 0;
    this.ch.play(this.phone && !this.jog && Math.random() < 0.4 ? 'phone' : clip, 0.5);
  }

  // at a junction node: where next (n: the node arrived at)
  next(n) {
    const from = this.e;
    const ok = n.edges.filter((e) => e !== from && this.edges.includes(e));
    if (!ok.length) {
      this.dir = -this.dir; // a dead end (or the edge of home): back the way they came
      return;
    }
    // straight on is likelier than turning, turning likelier than crossing the road
    const here = along(from, this.dir > 0 ? from.len : 0);
    const w = ok.map((e) => {
      const out = e.a === n ? along(e, 0) : along(e, e.len);
      const d = e.a === n ? [out.dx, out.dz] : [-out.dx, -out.dz];
      const straight = here.dx * this.dir * d[0] + here.dz * this.dir * d[1];
      return (e.kind === 'cross' ? 0.6 : 1) * (1 + Math.max(0, straight) * 1.5);
    });
    let r = Math.random() * w.reduce((a, b) => a + b, 0);
    let k = 0;
    while ((r -= w[k]) > 0 && k < ok.length - 1) k++;
    const e = ok[k];
    this.e = e;
    this.dir = e.a === n ? 1 : -1;
    this.s = this.dir > 0 ? 0 : e.len;
  }

  update(dt, player, cam, hour, agents) {
    if (!this.presence(cam, hour)) return;
    this.nextPause -= dt;
    const prev = [this.e, this.s, this.dir];
    const e = this.e;
    const p = along(e, this.s);
    const fx = p.dx * this.dir, fz = p.dz * this.dir; // the way along
    // anyone ahead in the way: step aside (if there is room) or wait
    let blocked = false, aside = 0;
    for (const o of agents) {
      if (o.self === this) continue;
      // where they are now and where they will be in a moment (someone crossing in front)
      for (const t of [0, 0.7]) {
        const dx = o.x + (o.vx || 0) * t - this.x, dz = o.z + (o.vz || 0) * t - this.z;
        const fwd = dx * fx + dz * fz, lat = dx * fz - dz * fx;
        if (fwd < -0.3 || fwd > (this.jog ? 3.5 : 2.2)) continue;
        if (Math.abs(lat) > 0.85) continue;
        if (fwd < 0.8 && Math.abs(lat) < 0.65) blocked = true;
        if (!t) aside = lat > 0 ? 0.8 : -0.8; // (lat > 0: they are on the left: step right)
      }
    }
    switch (this.state) {
      case 'walk': {
        if (!this.jog && this.nextPause <= 0) {
          this.nextPause = 20 + Math.random() * 50;
          if (Math.random() < 0.15) this.dir = -this.dir; // a change of mind
          this.pause(2.5 + Math.random() * 4);
          break;
        }
        // the side step, only onto clear ground
        let want = aside;
        if (want) {
          const sx = p.x + fz * want * -1, sz = p.z - fx * want * -1;
          if (!this.G.safe.body(sx, sz, 0.3)) {
            want = -want;
            const tx = p.x + fz * want * -1, tz = p.z - fx * want * -1;
            if (!this.G.safe.body(tx, tz, 0.3)) want = 0;
          }
        }
        if (blocked && (!want || Math.abs(want - this.off) > 0.35)) {
          this.state = 'yield';
          this.timer = 0.7;
          this.waited = 0;
          this.speed = 0;
          this.ch.play(this.set.idle, 0.3);
          break;
        }
        this.off += THREE.MathUtils.clamp(want - this.off, -1.2 * dt, 1.2 * dt);
        this.s += this.speed * dt * this.dir;
        if (this.s > e.len || this.s < 0) {
          const n = this.dir > 0 ? e.b : e.a;
          const over = this.dir > 0 ? this.s - e.len : -this.s;
          this.next(n);
          if (this.e === e) this.s = this.dir > 0 ? over : e.len - over;
          else this.s = this.dir > 0 ? over : this.e.len - over;
        }
        break;
      }
      case 'yield':
        this.timer = blocked ? 0.7 : this.timer - dt;
        this.waited += dt;
        // still in the way after a while: turn back
        if (this.waited > 3.5 && blocked) {
          this.dir = -this.dir;
          this.pause(1.2, this.set.idle);
          break;
        }
        if (this.timer <= 0) this.walk();
        break;
      case 'pause':
        this.timer -= dt;
        if (this.timer <= 0) this.walk();
        break;
    }
    // where they are: on the lane, stepped aside by `off` (to the right of the way along)
    const q = along(this.e, this.s);
    const gx = q.dx * this.dir, gz = q.dz * this.dir;
    const nx = q.x - gz * this.off, nz = q.z + gx * this.off;
    // never a step closer to anyone already within arm's length
    const crowd = agents.some((o) => o.self !== this && Math.hypot(o.x - nx, o.z - nz) < 0.55 && Math.hypot(o.x - nx, o.z - nz) < Math.hypot(o.x - this.x, o.z - this.z));
    if (crowd) {
      [this.e, this.s, this.dir] = prev;
    } else if (this.G.safe.body(nx, nz, 0.25, [this.x, this.z])) {
      this.x = nx;
      this.z = nz;
    } else {
      // (never off the lane into something)
      this.off *= 0.5;
      this.x = q.x;
      this.z = q.z;
    }
    const want = Math.atan2(gx, gz);
    const turn = wrap(want - this.heading);
    this.heading = wrap(this.heading + Math.sign(turn) * Math.min(Math.abs(turn), (this.state === 'walk' ? 3.5 : 2.5) * dt));
    this.place();
    this.animate(dt, player);
  }
}

// riding a bicycle round a loop of road: pedalling (the feet on the pedals, the hands on the
// bars by IK), leaning into the turns, braking for anyone ahead (and putting a foot down)
class Rider extends Person {
  constructor(ch, world, spec, material, safe) {
    super(ch, world, spec);
    this.loop = bikeLoop(spec.route, safe, spec.lane ?? 1.35);
    this.safe = safe;
    this.shift = 0;
    this.fit = fitBike(ch);
    this.bike = makeBike(material, spec.bike ?? 0xd8d8d0, this.fit);
    ch.root.add(this.bike.group);
    ch.root.rotation.order = 'YXZ';
    ch.noFit = true;
    ch.pose = (c) => this.pose(c);
    this.solid.hx = 0.3;
    this.solid.hz = 0.95;
    this.cruise = 3.4 + Math.random() * 1.2;
    this.v = this.cruise;
    this.phi = Math.random() * Math.PI * 2;
    this.wheel = 0;
    this.roll = 0;
    this.far = 90;
    ch.play(this.set.idle, 0);
    this.respawn();
  }

  respawn() {
    this.s = Math.random() * this.loop.len;
    const [x, z] = this.loop.at(this.s), [x2, z2] = this.loop.at(this.s + 0.8);
    this.x = x;
    this.z = z;
    this.heading = Math.atan2(x2 - x, z2 - z);
  }

  update(dt, player, cam, hour, agents) {
    if (!this.presence(cam, hour)) return;
    const L = this.loop;
    // how sharp the way ahead turns: slow down for the ends of the loop
    const [ax, az] = L.at(this.s + 3), [bx, bz] = L.at(this.s + 3.8);
    const bend = Math.abs(wrap(Math.atan2(bx - ax, bz - az) - this.heading));
    let want = bend > 0.5 ? 2.3 : this.cruise;
    // anyone ahead in the lane (someone walking at the roadside): swing out toward the middle
    // of the road to pass them if it is clear, else brake (and for you, always brake)
    const sh = Math.sin(this.heading), chd = Math.cos(this.heading);
    let pass = false;
    for (const o of agents) {
      if (o.self === this) continue;
      const dx = o.x - this.x, dz = o.z - this.z;
      const fwd = dx * sh + dz * chd, side = dx * chd - dz * sh;
      if (fwd < -1 || fwd > 9) continue;
      const lat = side - this.shift; // from the lane (the bike may be out to its right)
      if (Math.abs(lat) < 1.0 && o.self) pass = true;
      if (fwd > 0 && fwd < 6 && Math.abs(side) < 0.9) want = Math.min(want, Math.max(0, (fwd - 1.6) * 0.8));
    }
    this.v += THREE.MathUtils.clamp(want - this.v, -3.5 * dt, 1.2 * dt);
    this.s += this.v * dt;
    this.speed = this.v;
    const [x0, z0] = L.at(this.s), [x2, z2] = L.at(this.s + 0.9);
    const h = Math.atan2(x2 - x0, z2 - z0);
    // the swing out (to the right of the way along: keeping left, that is the road's middle)
    const rx = -Math.cos(h), rz = Math.sin(h);
    const target = pass && bend < 0.5 && this.safe.body(x0 + rx * 0.95, z0 + rz * 0.95, 0.4) ? 0.95 : 0;
    this.shift += THREE.MathUtils.clamp(target - this.shift, -0.8 * dt, 0.8 * dt);
    const x = x0 + rx * this.shift, z = z0 + rz * this.shift;
    const w = wrap(h - this.heading) / Math.max(dt, 1e-3);
    this.heading = h;
    this.x = x;
    this.z = z;
    // lean into the turn; stopped, a little over onto the foot put down
    this.stopped = this.v < 0.25;
    const lean = this.stopped ? -0.1 : THREE.MathUtils.clamp((-this.v * w) / 9.8, -0.3, 0.3);
    this.roll += (lean - this.roll) * Math.min(1, dt * 4);
    // the tyres on the ground front and back: the bike pitches with the road
    const sx = Math.sin(h), sz = Math.cos(h);
    const yF = this.C.groundAt(x + sx * 0.56, z + sz * 0.56), yR = this.C.groundAt(x - sx * 0.52, z - sz * 0.52);
    const pitch = Math.atan2(yF - yR, 1.08);
    const r = this.ch.root;
    r.position.set(x, yR + (yF - yR) * (0.52 / 1.08), z);
    r.rotation.set(-pitch, h, this.roll);
    const sd = this.solid;
    sd.cx = x;
    sd.cz = z;
    sd.c = Math.cos(h);
    sd.s = Math.sin(h);
    sd.yTop = r.position.y + 1.4;
    sd.yBottom = r.position.y - 0.5;
    // pedals (about 3.6 m a turn of the crank) and wheels
    this.phi += (this.v / 3.6) * Math.PI * 2 * dt;
    this.wheel += (this.v / TYRE) * dt;
    const B = this.bike;
    B.rear.rotation.x = B.front.rotation.x = this.wheel;
    B.crank.rotation.x = this.phi;
    // the left pedal (0, +x) and the right one opposite
    B.pedals.forEach((p, i) => {
      const a = this.phi + (i ? Math.PI : 0);
      p.position.set(i ? -0.12 : 0.12, B.BB.y - B.R * Math.cos(a), B.BB.z - B.R * Math.sin(a));
    });
    this.animate(dt, player);
  }

  // over the standing clip: seated on the saddle, leaning forward a touch, the feet on the
  // pedals and the hands on the grips
  pose(ch) {
    const n = ch.node, F = this.fit, B = this.bike;
    const hips = n('hips');
    hips.position.set(0, F.hipsY, F.hipsZ);
    hips.quaternion.setFromAxisAngle(_v.set(1, 0, 0), 0.1);
    n('spine').quaternion.setFromAxisAngle(_v.set(1, 0, 0), 0.08);
    for (const s of ['left', 'right']) for (const b of ['UpperLeg', 'LowerLeg', 'Foot', 'UpperArm', 'LowerArm', 'Hand']) n(s + b).quaternion.identity();
    const root = ch.root;
    root.updateMatrixWorld(true);
    const rq = root.getWorldQuaternion(new THREE.Quaternion());
    for (const [s, i, sx] of [['left', 0, 1], ['right', 1, -1]]) {
      // the foot: on its pedal (the ankle above and behind the ball of the foot), or down
      // on the ground beside the bike when stopped
      let target;
      if (this.stopped && s === 'left') {
        target = _v2.set(0.34, 0, 0.02).applyMatrix4(root.matrixWorld);
        target.y = this.C.groundAt(target.x, target.z) + ch.ankleHeight;
      } else {
        const p = B.pedals[i].position;
        target = _v2.set(p.x - sx * 0.01, p.y + F.ankleUp, p.z - F.ankleBack).applyMatrix4(root.matrixWorld);
      }
      ch.ik(s + 'UpperLeg', s + 'LowerLeg', s + 'Foot', target.clone(), _v.set(sx * 0.12, 0.25, 1).applyQuaternion(rq));
      ch.setWorldQuaternion(s + 'Foot', _q.copy(rq).multiply(new THREE.Quaternion().setFromEuler(_e.set(this.stopped && s === 'left' ? 0 : 0.12 + 0.12 * Math.sin(this.phi + i * Math.PI), 0, 0))));
      // the hand on its grip, elbows out and a little bent
      const grip = _v2.set(sx * 0.29, F.gripY + 0.02, F.gripZ - 0.06).applyMatrix4(root.matrixWorld);
      ch.ik(s + 'UpperArm', s + 'LowerArm', s + 'Hand', grip.clone(), _v.set(sx * 0.5, -0.6, -0.5).applyQuaternion(rq));
      ch.setWorldQuaternion(s + 'Hand', _q.copy(rq).multiply(new THREE.Quaternion().setFromEuler(_e.set(0, -sx * (Math.PI / 2 - 0.25), -sx * 0.5, 'YXZ'))));
      // fingers round the grip
      for (const fg of ['Index', 'Middle', 'Ring', 'Little']) {
        for (const [j, a] of [['Proximal', 0.95], ['Intermediate', 1.0], ['Distal', 0.6]]) n(s + fg + j)?.quaternion.setFromAxisAngle(_v.set(0, 0, 1), -sx * a);
      }
    }
    // a skirt drapes forward over the saddle as it does on a seat
    ch._hipsY = ch.sitHips || ch._hipsY;
  }
}

// standing about: waiting for the bus, or one of a group chatting
class Stander extends Person {
  constructor(ch, world, spec, at, heading) {
    super(ch, world, spec);
    [this.x, this.z] = at;
    this.heading = heading;
    this.timer = Math.random() * 3;
    this.clip = null;
    this.ch.play(this.set.idle, 0);
  }

  play(clip, fade = 0.5) {
    if (clip === this.clip) return;
    this.clip = clip;
    this.ch.play(clip, fade);
  }

  update(dt, player, cam, hour) {
    if (!this.presence(cam, hour)) return;
    if (!this.group) {
      // waiting: shifting about, looking up the road, a look at the phone
      this.timer -= dt;
      if (this.timer <= 0) {
        this.timer = 5 + Math.random() * 6;
        this.play(this.phone && Math.random() < 0.45 ? 'phone' : pick(this.set.idles));
      }
    }
    this.place();
    this.animate(dt, player, this.lookAt);
  }
}

// a few people chatting, facing each other: one talks (with her hands), the others listen (a
// nod now and then), sometimes they all laugh together
class Chat {
  constructor(members) {
    this.m = members;
    this.speaker = 0;
    this.timer = 0;
    this.heads = members.map(() => new THREE.Vector3());
    for (const p of members) p.group = this;
  }

  tick(dt) {
    const m = this.m;
    if (m[0].away) return;
    this.timer -= dt;
    if (this.timer <= 0) {
      const laugh = Math.random() < 0.15;
      this.speaker = (this.speaker + 1 + Math.floor(Math.random() * (m.length - 1))) % m.length;
      this.timer = laugh ? 4 : 4.5 + Math.random() * 2.5;
      m.forEach((p, i) => {
        if (laugh) p.play('happy', 0.4); // a shared laugh: a cheerful sway
        else if (i === this.speaker) p.play(pick(p.set.talk), 0.4);
        else p.play(Math.random() < 0.35 ? 'nod' : p.set.idle, 0.5);
      });
    }
    // everyone looks at the one talking; the speaker at the others in turn
    m.forEach((p, i) => p.ch.node('head').getWorldPosition(this.heads[i]));
    m.forEach((p, i) => {
      const j = i === this.speaker ? (i + 1 + (Math.floor(this.timer) % (m.length - 1))) % m.length : this.speaker;
      p.lookAt = this.heads[j];
    });
  }
}

// sitting on a bench (on one half: you can still sit on the other)
class Sitter extends Person {
  constructor(ch, world, spec, bench) {
    super(ch, world, spec);
    this.bench = bench;
    this.orig = bench.sit;
    const s = bench.sit;
    const fx = -Math.sin(s.yaw), fz = -Math.cos(s.yaw); // the way the seat faces
    const h = Math.atan2(fx, fz), lx = Math.cos(h), lz = -Math.sin(h); // her left
    this.heading = h;
    const back = ch.sitBack || 0;
    this.x = s.x + lx * 0.28 + fx * (0.06 + back);
    this.z = s.z + lz * 0.28 + fz * (0.06 + back);
    this.mine = { ...s, x: s.x - lx * 0.3, z: s.z - lz * 0.3 };
    this.timer = 4 + Math.random() * 6;
    ch.play('sit', 0);
    this.take(true);
  }

  take(on) {
    this.bench.sit = on ? this.mine : this.orig;
  }

  setAway(away) {
    super.setAway(away);
    this.take(!away);
  }

  update(dt, player, cam, hour) {
    if (!this.presence(cam, hour)) return;
    const ch = this.ch;
    const g = this.C.groundAt(this.x, this.z);
    ch.seat = { lift: Math.max(0, this.orig.y + 0.1 - g - ch.sitHips) };
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = 6 + Math.random() * 8;
      ch.play(!this.male && Math.random() < 0.35 ? 'sitFidget' : 'sit', 0.6);
    }
    this.place(g);
    this.solid.cx = this.x - Math.sin(this.heading) * (ch.sitBack || 0);
    this.solid.cz = this.z - Math.cos(this.heading) * (ch.sitBack || 0);
    this.animate(dt, player);
  }
}

// ------------------------------------------------------------------------------- loading
// Instances of one model share its geometry and textures (each has its own skeleton, hair
// physics and materials): the meshes come out of the loader in the same order every time.
function share(ch, proto) {
  const a = [], b = [];
  ch.root.traverse((o) => o.isMesh && a.push(o));
  proto.root.traverse((o) => o.isMesh && !o.userData.bike && b.push(o));
  if (a.length !== b.length) return;
  a.forEach((m, i) => {
    const p = b[i];
    if (m.geometry.attributes.position.count !== p.geometry.attributes.position.count) return;
    m.geometry.dispose();
    m.geometry = p.geometry;
    const ma = [m.material].flat(), pa = [p.material].flat();
    ma.forEach((mat, k) => {
      const t = mat.uniforms?.map?.value, pt = pa[k]?.uniforms?.map?.value;
      if (t && pt && t !== pt) {
        t.dispose();
        t.image?.close?.();
        mat.uniforms.map.value = pt;
      }
    });
  });
}

export async function createPedestrians(world, scene, near = null) {
  const loader = new GLTFLoader();
  loader.register((parser) => new VRMLoaderPlugin(parser));
  const motions = await loadMotions('chars/motions.json');
  const material = world.materials.toon.material;
  const C = world.colliders;
  const G = buildWalkGraph(C);
  const bufs = new Map(), protos = new Map();
  const look = wardrobe();
  const list = [], groups = [];
  const agents = [];
  const api = {
    list,
    graph: G,
    // others: { x, z } of anyone else about (you, Mei) for them to keep clear of
    update(dt, player, cam, hour, others = []) {
      agents.length = 0;
      for (const p of list) if (!p.away) agents.push({ x: p.x, z: p.z, vx: Math.sin(p.heading) * p.speed, vz: Math.cos(p.heading) * p.speed, self: p });
      for (const o of others) agents.push({ x: o.x, z: o.z, self: null });
      for (const g of groups) g.tick(dt);
      for (const p of list) p.update(dt, player, cam, hour, agents);
    },
  };
  const make = async (model) => {
    const file = MODELS[model].file;
    if (!bufs.has(file)) bufs.set(file, loadAsset(file));
    const gltf = await loader.parseAsync(await bufs.get(file), '');
    const ch = new Character(gltf, motions, { name: 'passerby', recolor: painter(look(model)) });
    if (protos.has(model)) share(ch, protos.get(model));
    else protos.set(model, ch);
    return ch;
  };
  const add = (p) => {
    scene.add(p.ch.root);
    if (p.phone) scene.add(p.phone);
    list.push(p);
  };
  // nearest first, one at a time, so the walk does not stutter while they arrive
  const where = (s) => s.at || s.near || (s.route.axis === 'z' ? [s.route.c, (s.route.a + s.route.b) / 2] : [(s.route.a + s.route.b) / 2, s.route.c]);
  const order = PEOPLE.slice();
  const from = near?.();
  if (from) order.sort((a, b) => Math.hypot(where(a)[0] - from.x, where(a)[1] - from.z) - Math.hypot(where(b)[0] - from.x, where(b)[1] - from.z));
  (async () => {
    for (const spec of order) {
      if (spec.act === 'chat') {
        const c = spotNear(C, G.safe, spec.at[0], spec.at[1], 1.1);
        if (!c) continue;
        const n = spec.members.length, r = n > 2 ? 0.62 : 0.5, a0 = Math.random() * Math.PI * 2;
        const members = [];
        for (let i = 0; i < n; i++) {
          const ms = { model: spec.members[i], hours: spec.hours };
          const a = a0 + (i / n) * Math.PI * 2;
          const p = new Stander(await make(ms.model), world, ms, [c[0] + Math.sin(a) * r, c[1] + Math.cos(a) * r], a + Math.PI);
          members.push(p);
          add(p);
        }
        groups.push(new Chat(members));
      } else if (spec.act === 'wait') {
        // beside the bus stop's bench, facing the road
        const it = world.interactables.find((i) => i.sit && Math.hypot(i.x - spec.at[0], i.z - spec.at[1]) < 1.5);
        const yaw = it?.sit.yaw ?? 0, h = Math.atan2(-Math.sin(yaw), -Math.cos(yaw));
        const at = spotNear(C, G.safe, spec.at[0] + Math.cos(h) * 1.3, spec.at[1] - Math.sin(h) * 1.3, 0.35);
        if (at) add(new Stander(await make(spec.model), world, spec, at, h));
      } else if (spec.act === 'sit') {
        const it = world.interactables.find((i) => i.kind === 'bench' && i.sit && Math.hypot(i.x - spec.at[0], i.z - spec.at[1]) < 1.5);
        if (it) add(new Sitter(await make(spec.model), world, spec, it));
      } else if (spec.act === 'cycle') add(new Rider(await make(spec.model), world, spec, material, G.safe));
      else add(new Walker(await make(spec.model), world, spec, G));
      await new Promise((r) => setTimeout(r, 250));
    }
  })().catch((e) => console.warn('passers-by not loaded:', e));
  return api;
}
