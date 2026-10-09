import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { RNG } from '../core/rng.js';
import { PAT } from '../core/builder.js';
import { ROADS, terrainH, roadAt, PLAZA, CROSSINGS } from './layout.js';
import { roadSurfaceY } from './roads.js';
import { Kit, signOnFace } from './kit.js';
import { FONTS, fitText, roundRect } from '../render/atlas.js';
import { G } from '../render/materials.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ---------------------------------------------------------------------------
// Wires: screen-space lines (constant pixel width like inked anime lines)
// ---------------------------------------------------------------------------
export function createWireMaterial(width = 1.35) {
  const m = new LineMaterial({ color: 0x2a2c34, linewidth: width, worldUnits: false, transparent: true, depthWrite: false });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uHaze = G.uHazeColor;
    shader.vertexShader = 'varying float vDist;\n' + shader.vertexShader.replace('#include <fog_vertex>', '#include <fog_vertex>\n vDist = -mvPosition.z;');
    shader.fragmentShader = 'uniform vec3 uHaze;\nvarying float vDist;\n' + shader.fragmentShader.replace(
      '#include <fog_fragment>',
      `#include <fog_fragment>
       float hz = clamp(vDist / 420.0, 0.0, 0.75);
       gl_FragColor.rgb = mix(gl_FragColor.rgb, uHaze, hz);
       gl_FragColor.a *= 1.0 - smoothstep(180.0, 420.0, vDist);`
    );
  };
  return m;
}

export class WireSet {
  constructor() {
    this.pos = [];
  }
  // sagging cable between a and b
  cable(a, b, sag = null, segs = 10) {
    const len = a.distanceTo(b);
    const s = sag ?? 0.12 + len * 0.018;
    let prev = a;
    for (let i = 1; i <= segs; i++) {
      const t = i / segs;
      const p = V(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t - s * 4 * t * (1 - t), a.z + (b.z - a.z) * t);
      this.pos.push(prev.x, prev.y, prev.z, p.x, p.y, p.z);
      prev = p;
    }
  }
  build(material) {
    const g = new LineSegmentsGeometry();
    g.setPositions(this.pos);
    const line = new LineSegments2(g, material);
    line.computeLineDistances();
    line.renderOrder = 5;
    line.frustumCulled = false;
    return line;
  }
}

// ---------------------------------------------------------------------------
// Utility poles (電柱) along streets, joined by cables
// ---------------------------------------------------------------------------
function polePlate(ctx, num) {
  const n = (num % 36) + 1;
  return ctx.atlas.draw('poleplate:' + n, 40, 104, (c, w, h) => {
    c.fillStyle = '#f2f2ee';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#2350a0';
    c.fillRect(0, 0, w, h * 0.22);
    c.fillStyle = '#fff';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    fitText(c, '桜浜', w * 0.9, w * 0.42, FONTS.gothic, '700');
    c.fillText('桜浜', w / 2, h * 0.11);
    c.fillStyle = '#222';
    c.font = `700 ${w * 0.5}px ${FONTS.gothic}`;
    const chars = [...String(n)];
    chars.forEach((ch, i) => c.fillText(ch, w / 2, h * 0.36 + i * h * 0.2));
  });
}

const POLE_ADS = [
  ['桜ヶ浜歯科', 'この先50m', '#ffffff', '#1f6a3a'],
  ['はまかぜ整骨院', '右折すぐ', '#fff8e6', '#b03a2e'],
  ['さくら幼稚園', '園児募集中', '#ffeef4', '#c0457a'],
  ['汐見不動産', '駅前', '#eef6ff', '#2a5aa0'],
  ['あおば内科', '休診 木・日', '#f4fff4', '#2f7a4a'],
  ['浜風そろばん教室', '生徒募集', '#fffbe8', '#7a5a1a'],
];

export function poleAd(ctx, i) {
  const [name, sub, bg, fg] = POLE_ADS[i % POLE_ADS.length];
  return ctx.atlas.draw('polead:' + i % POLE_ADS.length, 72, 300, (c, w, h) => {
    c.fillStyle = bg;
    c.fillRect(0, 0, w, h);
    c.fillStyle = fg;
    c.fillRect(0, 0, w, 6);
    c.fillRect(0, h - 6, w, 6);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    const chars = [...name];
    const step = (h * 0.62) / chars.length;
    c.font = `700 ${Math.min(w * 0.62, step * 0.9)}px ${FONTS.gothic}`;
    chars.forEach((ch, k) => c.fillText(ch, w / 2, h * 0.06 + step * (k + 0.5)));
    c.fillStyle = '#333';
    const sc = [...sub];
    const st = (h * 0.28) / sc.length;
    c.font = `500 ${Math.min(w * 0.4, st * 0.9)}px ${FONTS.gothic}`;
    sc.forEach((ch, k) => c.fillText(ch, w / 2, h * 0.7 + st * (k + 0.5)));
  });
}

export function buildPole(ctx, x, z, o = {}) {
  const kit = new Kit(ctx, x, z);
  const t = kit.t;
  const y = terrainH(x, z) - 0.2;
  const H = o.height ?? 11.5;
  const dir = o.dir ?? 0; // rotation of crossarms (radians)
  // tapered concrete pole
  t.cyl(x, y, z, 0.2, 0.14, H, 10, 0xb9b8b2, PAT.CONCRETE);
  // yellow / black guard sleeve
  t.cyl(x, y + 0.2, z, 0.215, 0.205, 1.8, 10, 0xf2c230, PAT.STRIPES, { caps: false });
  // crossarms + insulators
  const arms = [H - 0.35, H - 1.15];
  const c = Math.cos(dir), s = Math.sin(dir);
  const pts = [];
  for (let k = 0; k < arms.length; k++) {
    const ay = y + arms[k];
    const L = k === 0 ? 1.7 : 1.2;
    t.pushTRS(x, ay, z, dir);
    t.box(0, 0, 0, L, 0.1, 0.1, { color: 0x8a8d90 });
    t.box(0, -0.25, 0, 0.06, 0.5, 0.06, { color: 0x8a8d90 });
    for (const off of k === 0 ? [-0.75, 0, 0.75] : [-0.5, 0.5]) {
      t.cyl(off, 0.05, 0, 0.05, 0.04, 0.16, 6, 0xf0efe8);
      const wx = x + off * c, wz = z - off * s;
      pts.push(V(wx, ay + 0.2, wz));
    }
    t.pop();
  }
  // telecom cable attach point (lower)
  const tel = V(x, y + H - 4.2, z);
  t.box(x, y + H - 4.2, z, 0.5, 0.08, 0.08, { color: 0x6a6d70 });
  // transformer on some poles
  if (o.transformer) {
    t.cyl(x + 0.42 * s, y + H - 2.6, z + 0.42 * c, 0.3, 0.3, 1.0, 10, 0x9ea4a8, PAT.METAL);
    t.cyl(x + 0.42 * s, y + H - 1.6, z + 0.42 * c, 0.32, 0.25, 0.12, 10, 0x8a9094);
  }
  // street lamp arm
  if (o.lamp) {
    const lx = x + o.lampDir[0] * 1.4, lz = z + o.lampDir[1] * 1.4;
    t.rod(V(x, y + 6.6, z), V(lx, y + 7.0, lz), 0.04, 0.04, 5, 0x9a9da0);
    t.box(lx, y + 6.92, lz, 0.5, 0.12, 0.26, { color: 0x8a8d90 });
    kit.e.box(lx, y + 6.84, lz, 0.42, 0.04, 0.2, { color: 0xfff1cf });
    ctx.lamps.push({ x: lx, y: y + 6.8, z: lz, r: 6.5 });
  }
  // number plate + ad
  const face = { o: V(x - 0.21 * c, y, z + 0.21 * s), r: V(c, 0, -s), n: V(s, 0, c), len: 0.4 };
  if (o.number) signOnFace(kit, faceToward(x, z, o.facing, 0.205), 0, 2.4, 0.16, 0.4, 0.0, polePlate(ctx, o.number), 0);
  if (o.ad !== undefined) signOnFace(kit, faceToward(x, z, o.facing, 0.205), 0, 2.95, 0.3, 1.2, 0.0, poleAd(ctx, o.ad), 0);
  void face;
  ctx.colliders.addCircle(x, z, 0.28);
  return { top: pts, tel, x, z, y };
}

// face of a round pole looking toward an angle
function faceToward(x, z, ang = 0, r = 0.2) {
  const nx = Math.sin(ang), nz = Math.cos(ang);
  return { o: V(x + nx * r - nz * 0, terrainH(x, z) - 0.2, z + nz * r), r: V(nz, 0, -nx), n: V(nx, 0, nz), len: 0 };
}

export function buildPolesAndWires(ctx) {
  const rng = new RNG(4242);
  const wires = ctx.wires || (ctx.wires = new WireSet());
  const chains = [];
  let num = 1;
  let ad = 0;
  for (const r of ROADS) {
    if (r.id === 'coast' || r.id === 'shotengai') continue;
    const half = r.w / 2 + (r.sidewalk || 0) + 0.35;
    const side = r.axis === 'x' ? -1 : 1; // north side for E-W, east side for N-S
    const spacing = rng.range(26, 31);
    const chain = [];
    for (let t = r.a + 4; t < r.b - 3; t += spacing) {
      const x = r.axis === 'x' ? t : r.c + side * half;
      const z = r.axis === 'x' ? r.c + side * half : t;
      // keep clear of crossing streets and the plaza
      if (roadAt(x, z, 0.6, r)) continue;
      if (x > PLAZA.x0 - 1 && x < PLAZA.x1 + 1 && z > PLAZA.z0 - 1 && z < PLAZA.z1 + 1) continue;
      const lampDir = r.axis === 'x' ? [0, -side] : [-side, 0];
      const p = buildPole(ctx, x, z, {
        rng,
        dir: r.axis === 'x' ? 0 : Math.PI / 2,
        transformer: rng.chance(0.3),
        lamp: rng.chance(0.55),
        lampDir,
        number: num++,
        ad: rng.chance(0.35) ? ad++ : undefined,
        facing: r.axis === 'x' ? Math.PI * (side > 0 ? 1 : 0) : (side > 0 ? -Math.PI / 2 : Math.PI / 2),
      });
      chain.push(p);
    }
    for (let i = 0; i < chain.length - 1; i++) {
      const a = chain[i], b = chain[i + 1];
      for (let k = 0; k < Math.min(a.top.length, b.top.length); k++) wires.cable(a.top[k], b.top[k], null, 10);
      wires.cable(a.tel, b.tel, 0.5 + a.tel.distanceTo(b.tel) * 0.02, 10);
      wires.cable(a.tel.clone().add(V(0, 0.35, 0)), b.tel.clone().add(V(0, 0.35, 0)), 0.4 + a.tel.distanceTo(b.tel) * 0.018, 10);
    }
    chains.push(chain);
  }
  // cross links between nearby poles of different chains (wires crossing over streets)
  const all = chains.flat();
  for (const a of all) {
    let best = null, bd = 1e9;
    for (const b of all) {
      if (a === b) continue;
      const d = Math.hypot(a.x - b.x, a.z - b.z);
      if (d < bd && d > 6 && d < 24 && Math.abs(a.x - b.x) > 2 && Math.abs(a.z - b.z) > 2) {
        bd = d;
        best = b;
      }
    }
    if (best && rng.chance(0.6)) {
      wires.cable(a.top[0], best.top[0], null, 10);
      wires.cable(a.tel, best.tel, 0.6, 10);
    }
  }
  // service drops to houses
  for (const d of ctx.dropPoints || []) {
    let best = null, bd = 1e9;
    for (const p of all) {
      const dd = Math.hypot(p.x - d.x, p.z - d.z);
      if (dd < bd) {
        bd = dd;
        best = p;
      }
    }
    if (best && bd < 26) wires.cable(best.top[best.top.length - 1], V(d.x, d.y, d.z), 0.3 + bd * 0.02, 8);
  }
  ctx.poles = all;
  return wires;
}

// ---------------------------------------------------------------------------
// Vending machines (自動販売機)
// ---------------------------------------------------------------------------
const DRINKS = [
  ['#e8432e', '#fff'], ['#2f6fd0', '#fff'], ['#f6c341', '#333'], ['#48a860', '#fff'], ['#ffffff', '#2f6fd0'],
  ['#8a4a2a', '#fff'], ['#f08ab0', '#fff'], ['#1f2f5a', '#f6c341'], ['#c0d8f0', '#2f4f8a'], ['#f4f0e0', '#c0392b'],
];
export function vendingFront(ctx, variant) {
  return ctx.atlas.draw('vending:' + variant, 200, 360, (c, w, h) => {
    const body = ['#d8382e', '#2a6ad0', '#f3f3ef', '#2e8a4a'][variant % 4];
    c.fillStyle = body;
    c.fillRect(0, 0, w, h);
    // illuminated display window
    c.fillStyle = '#f6f8fb';
    roundRect(c, 10, 14, w - 20, h * 0.55, 8);
    c.fill();
    // rows of drinks
    let s = variant * 31 + 7;
    const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    for (let row = 0; row < 3; row++) {
      const y = 24 + row * (h * 0.55 - 20) / 3;
      for (let k = 0; k < 6; k++) {
        const x = 18 + k * ((w - 36) / 6);
        const [a, b] = DRINKS[Math.floor(rnd() * DRINKS.length)];
        const bw = (w - 36) / 6 - 5;
        const bh = (h * 0.55 - 20) / 3 - 22;
        c.fillStyle = a;
        roundRect(c, x, y, bw, bh, 4);
        c.fill();
        c.fillStyle = b;
        c.fillRect(x + 2, y + bh * 0.38, bw - 4, bh * 0.22);
        // price buttons
        c.fillStyle = '#e8e8e8';
        c.fillRect(x, y + bh + 4, bw, 9);
        c.fillStyle = rnd() < 0.2 ? '#e33' : '#2a2';
        c.fillRect(x + bw * 0.3, y + bh + 6, bw * 0.4, 5);
      }
    }
    // coin slot area + pickup bay
    c.fillStyle = 'rgba(0,0,0,0.25)';
    c.fillRect(w * 0.62, h * 0.66, w * 0.28, h * 0.12);
    c.fillStyle = '#222';
    c.fillRect(w * 0.12, h * 0.84, w * 0.76, h * 0.1);
    c.fillStyle = 'rgba(255,255,255,0.85)';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    fitText(c, 'つめた〜い', w * 0.45, 16, FONTS.maru, '700');
    c.fillStyle = '#2a6ad0';
    c.fillText('つめた〜い', w * 0.32, h * 0.72);
    c.fillStyle = '#d8382e';
    c.fillText('あったか〜い', w * 0.32, h * 0.78);
  });
}

export function buildVending(ctx, x, z, ry, seed, n = 1) {
  const rng = new RNG(seed);
  const kit = new Kit(ctx, x, z);
  const y = terrainH(x, z);
  kit.begin(x, y, z, ry);
  const t = kit.t;
  for (let i = 0; i < n; i++) {
    const ox = (i - (n - 1) / 2) * 1.05;
    const variant = rng.int(0, 7);
    const bodyCol = [0xd8382e, 0x2a6ad0, 0xf3f3ef, 0x2e8a4a][variant % 4];
    t.box(ox, 0.92, 0, 1.0, 1.84, 0.72, { color: bodyCol, ao: 0.1 });
    t.box(ox, 1.86, -0.02, 1.02, 0.06, 0.78, { color: 0x555 });
    const face = { o: V(ox - 0.47, 0, 0.37), r: V(1, 0, 0), n: V(0, 0, 1), len: 0.94 };
    signOnFace(kit, face, 0.47, 0.12, 0.92, 1.62, 0.005, vendingFront(ctx, variant), 2);
    ctx.interactables.push({ kind: 'vending', x: x + Math.cos(ry) * ox + Math.sin(ry) * 0.9, z: z - Math.sin(ry) * ox + Math.cos(ry) * 0.9, r: 1.5, label: '自販機で飲み物を買う' });
  }
  // recycle bin
  const bx = (n / 2) * 1.05 + 0.25;
  t.box(bx, 0.45, 0.1, 0.42, 0.9, 0.42, { color: 0x2f7ad0 });
  t.box(bx, 0.92, 0.1, 0.44, 0.05, 0.44, { color: 0xe8e8e8 });
  kit.end();
  const c = Math.cos(ry), s = Math.sin(ry);
  ctx.colliders.addBox(x, z, (n * 1.05) / 2 + 0.5, 0.4, ry, 2);
  // light pool at night
  ctx.lamps.push({ x: x + s * 0.9, y: y + 0.1, z: z + c * 0.9, r: 2.6, color: 0xdfefff, ground: true });
}

// ---------------------------------------------------------------------------
// Street signs & curve mirrors
// ---------------------------------------------------------------------------
export function tomareSign(ctx) {
  return ctx.atlas.draw('tomare', 128, 128, (c, w, h) => {
    c.fillStyle = '#fff';
    c.beginPath();
    c.moveTo(4, 8);
    c.lineTo(w - 4, 8);
    c.lineTo(w / 2, h - 4);
    c.closePath();
    c.fill();
    c.fillStyle = '#d2252b';
    c.beginPath();
    c.moveTo(12, 13);
    c.lineTo(w - 12, 13);
    c.lineTo(w / 2, h - 14);
    c.closePath();
    c.fill();
    c.fillStyle = '#fff';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = `700 ${w * 0.2}px ${FONTS.gothic}`;
    c.fillText('止まれ', w / 2, h * 0.36);
  });
}

function roundSign(ctx, key, draw) {
  return ctx.atlas.draw(key, 128, 128, draw);
}

export function speedSign(ctx) {
  return roundSign(ctx, 'speed30', (c, w, h) => {
    c.fillStyle = '#fff';
    c.beginPath();
    c.arc(w / 2, h / 2, w / 2 - 2, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = '#d2252b';
    c.lineWidth = w * 0.11;
    c.beginPath();
    c.arc(w / 2, h / 2, w / 2 - w * 0.08, 0, Math.PI * 2);
    c.stroke();
    c.fillStyle = '#1f3fa0';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = `700 ${w * 0.42}px ${FONTS.latin}`;
    c.fillText('30', w / 2, h * 0.53);
  });
}

export function pedSign(ctx) {
  return roundSign(ctx, 'pedx', (c, w, h) => {
    c.fillStyle = '#1f5fbf';
    c.fillRect(2, 2, w - 4, h - 4);
    c.fillStyle = '#fff';
    c.beginPath();
    c.moveTo(w / 2, 12);
    c.lineTo(w - 12, h - 14);
    c.lineTo(12, h - 14);
    c.closePath();
    c.fill();
    c.fillStyle = '#111';
    c.beginPath();
    c.arc(w / 2, h * 0.38, 6, 0, Math.PI * 2);
    c.fill();
    c.lineWidth = 5;
    c.strokeStyle = '#111';
    c.beginPath();
    c.moveTo(w / 2, h * 0.45);
    c.lineTo(w / 2 - 4, h * 0.65);
    c.lineTo(w / 2 - 12, h * 0.8);
    c.moveTo(w / 2 - 4, h * 0.65);
    c.lineTo(w / 2 + 8, h * 0.8);
    c.stroke();
    c.fillRect(w * 0.25, h * 0.82, w * 0.5, 4);
  });
}

export function signPost(ctx, x, z, ry, uv, w = 0.6, h = 0.6, height = 2.6) {
  const kit = new Kit(ctx, x, z);
  const y = terrainH(x, z);
  kit.begin(x, y, z, ry);
  kit.t.cyl(0, 0, 0, 0.035, 0.035, height, 6, 0xcfd2d4);
  const face = { o: V(-w / 2, 0, 0.045), r: V(1, 0, 0), n: V(0, 0, 1), len: w };
  signOnFace(kit, face, w / 2, height - h + 0.05, w, h, 0.0, uv, 0);
  kit.t.box(0, height - h / 2 + 0.05, 0.02, w * 0.9, h * 0.9, 0.03, { color: 0xb8bcc0 });
  kit.end();
  ctx.colliders.addCircle(x, z, 0.12);
}

export function curveMirror(ctx, x, z, ry) {
  const kit = new Kit(ctx, x, z);
  const y = terrainH(x, z);
  kit.begin(x, y, z, ry);
  const t = kit.t;
  t.cyl(0, 0, 0, 0.05, 0.05, 3.0, 6, 0xe8792a);
  t.box(0, 2.95, 0.12, 0.08, 0.08, 0.3, { color: 0xe8792a });
  t.push(new THREE.Matrix4().makeTranslation(0, 3.0, 0.32).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2 + 0.15)));
  t.cyl(0, -0.04, 0, 0.42, 0.42, 0.08, 16, 0xe8792a);
  t.pop();
  // mirror surface: a window quad (reflective look)
  const face = { o: V(-0.36, 0, 0.42), r: V(1, 0, 0), n: V(0, 0, 1), len: 0.72 };
  const p = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    p.push(a);
  }
  kit.w.quad(V(-0.33, 2.67, 0.38), V(0.33, 2.67, 0.38), V(0.33, 3.33, 0.42), V(-0.33, 3.33, 0.42), 0xffffff, 120, { uvs: [[0, 0], [1, 0], [1, 1], [0, 1]] });
  void face;
  kit.end();
  ctx.colliders.addCircle(x, z, 0.1);
}

// Pole-mounted and roadside props across town
export function buildStreetProps(ctx) {
  // stop signs + curve mirrors where lanes meet Sakura-zaka
  const sakura = ROADS.find((r) => r.id === 'sakura');
  const half = sakura.w / 2 + sakura.sidewalk;
  for (const r of ROADS) {
    if (r.axis !== 'x' || r.id === 'coast') continue;
    if (r.a > sakura.c || r.b < sakura.c) continue;
    for (const side of [-1, 1]) {
      const x = sakura.c + side * (half + 1.6);
      const z = r.c + (side < 0 ? -1 : 1) * (r.w / 2 + 0.45);
      signPost(ctx, x, z, side < 0 ? -Math.PI / 2 : Math.PI / 2, tomareSign(ctx), 0.7, 0.62);
      curveMirror(ctx, sakura.c + side * (half + 0.4), r.c - side * (r.w / 2 + 0.5), side < 0 ? Math.PI * 0.75 : -Math.PI * 0.25);
    }
  }
  // speed limit signs on Sakura-zaka
  for (const z of [-60, 0, 35]) signPost(ctx, sakura.c - half - 0.3, z, Math.PI, speedSign(ctx), 0.6, 0.6, 2.7);
  // pedestrian crossing signs near crosswalks
  for (const z of [13.2, -21.8]) signPost(ctx, sakura.c + half + 0.3, z - 2.5, 0, pedSign(ctx), 0.6, 0.6, 2.9);
}

// Night light pools on the ground (additive decals) + lamp registry
export function buildLightPools(ctx) {
  const pos = [];
  const colr = [];
  const uv = [];
  const idx = [];
  let n = 0;
  const c = new THREE.Color();
  for (const l of ctx.lamps) {
    const r = l.r ?? 6;
    const gy = (l.ground ? l.y - 0.1 : terrainH(l.x, l.z)) + 0.06;
    c.set(l.color ?? 0xffd9a0);
    const segs = 4;
    // a small grid that follows the terrain
    for (let j = 0; j <= segs; j++) {
      for (let i = 0; i <= segs; i++) {
        const x = l.x - r + (2 * r * i) / segs;
        const z = l.z - r + (2 * r * j) / segs;
        const y = Math.max(roadSurfaceY(x, z), terrainH(x, z)) + 0.05;
        pos.push(x, y, z);
        colr.push(c.r, c.g, c.b);
        uv.push(i / segs, j / segs);
      }
    }
    for (let j = 0; j < segs; j++) {
      for (let i = 0; i < segs; i++) {
        const a = n + j * (segs + 1) + i;
        idx.push(a, a + segs + 1, a + 1, a + 1, a + segs + 1, a + segs + 2);
      }
    }
    n += (segs + 1) * (segs + 1);
    void gy;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
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
    vertexColors: true,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
    uniforms: { uNight: G.uNight },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vColor;
      void main() {
        vUv = uv;
        vColor = color;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uNight;
      varying vec2 vUv;
      varying vec3 vColor;
      void main() {
        float d = length(vUv - 0.5) * 2.0;
        float k = pow(max(1.0 - d, 0.0), 1.25);
        k += smoothstep(0.55, 0.0, d) * 0.35;
        gl_FragColor = vec4(vColor * k * 0.95 * smoothstep(0.35, 0.9, uNight), 0.0);
      }
    `,
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.renderOrder = 4;
  mesh.frustumCulled = false;
  mesh.name = 'lightpools';
  return mesh;
}

export function crossingPositions() {
  return CROSSINGS;
}
