import * as THREE from 'three';
import { RNG } from '../core/rng.js';
import { PAT } from '../core/builder.js';
import { terrainH, roadAt } from './layout.js';
import { FoliageSet, shrub } from './greenery.js';

// Trees: tube trunks/branches in the toon builder + camera-facing foliage
// cards (alpha-tested painted clumps, see greenery.js) shaded with spherical normals.

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ---------------------------------------------------------------------------
// tree generators
// ---------------------------------------------------------------------------
const SAKURA_COLS = ['#ffd6e4', '#fbc3d6', '#f6b3ca', '#ffe2ec', '#f3b9d2', '#fcd0dd'].map((h) => new THREE.Color(h));
const GREEN_COLS = ['#7fb26a', '#6ea35d', '#8cbd72', '#5f9656', '#94c27a'].map((h) => new THREE.Color(h));
const DARK_GREENS = ['#4f7f52', '#5b8c56', '#467548', '#5f8f5a'].map((h) => new THREE.Color(h));
const PINE_COLS = ['#3f6b48', '#4a7a50', '#38623f'].map((h) => new THREE.Color(h));
// fresh spring leaves of the avenue zelkovas (けやき)
const ZELKOVA_COLS = ['#a9c97a', '#9cc070', '#b5d189', '#8fb867', '#a3c574'].map((h) => new THREE.Color(h));
// cedar spires: deep blue-greens; mikan: dark glossy leaves and the fruit
const CEDAR_COLS = ['#3d5f4c', '#46684f', '#355747', '#4c6e55'].map((h) => new THREE.Color(h));
const MIKAN_COLS = ['#3f6e3c', '#4a7a42', '#386537', '#52823f'].map((h) => new THREE.Color(h));
const FRUIT_COLS = ['#f7a02a', '#f39424', '#fbb03a', '#f08a1e'].map((h) => new THREE.Color(h));

function branchPath(start, dir, len, bend, rng, segs = 5) {
  const pts = [start.clone()];
  const d = dir.clone().normalize();
  let p = start.clone();
  for (let i = 1; i <= segs; i++) {
    d.x += rng.range(-bend, bend);
    d.z += rng.range(-bend, bend);
    d.y += rng.range(-bend * 0.5, bend * 0.6);
    d.normalize();
    p = p.clone().addScaledVector(d, len / segs);
    pts.push(p);
  }
  return pts;
}

function canopy(fb, center, R, Ry, cols, rng, o = {}) {
  const puffs = o.puffs ?? Math.round(8 + R * 2.4);
  const cardsPer = o.cardsPer ?? 7;
  const cardSize = o.cardSize ?? [1.0, 1.6];
  const flatBottom = o.flatBottom ?? -0.35;
  const tmp = new THREE.Color();
  const placePuff = (pc, pr, n, scaleCol) => {
    // canopy-level direction of this clump (stored in `normal`), clump center in `center`
    const cn = pc.clone().sub(center);
    cn.y *= R / Ry;
    cn.normalize();
    // one colour per clump, its cards only a shade apart: a crown of distinct masses of
    // blossom or leaves rather than a patchwork of cards
    const h = Math.sin(pc.x * 12.9898 + pc.y * 4.1414 + pc.z * 78.233) * 43758.5453;
    const base = cols[Math.floor((h - Math.floor(h)) * cols.length)];
    for (let k = 0; k < n; k++) {
      const p = V(pc.x + rng.range(-pr, pr), pc.y + rng.range(-pr * 0.6, pr * 0.7), pc.z + rng.range(-pr, pr));
      const up = (p.y - center.y) / Ry;
      tmp.copy(base).lerp(cols[Math.floor(rng.next() * cols.length)], 0.25);
      tmp.multiplyScalar(scaleCol * (0.94 + up * 0.08));
      // turned only a little: the painted light in the texture stays on the upper side
      fb.card4(p, cn, tmp, pc, rng.range(cardSize[0], cardSize[1]), rng.range(-0.6, 0.6));
    }
  };
  for (let i = 0; i < puffs; i++) {
    // clump centers on an umbrella-shaped shell, biased upward and outward
    const u = rng.next() * Math.PI * 2;
    const v = Math.acos(rng.range(flatBottom, 1.0));
    const shell = rng.range(0.62, 0.98);
    const pc = V(center.x + Math.sin(v) * Math.cos(u) * R * shell, center.y + Math.cos(v) * Ry * shell, center.z + Math.sin(v) * Math.sin(u) * R * shell);
    const pr = rng.range(0.8, 1.3) * (o.puffScale ?? 1);
    placePuff(pc, pr, cardsPer, 1);
  }
  // inner filler so the canopy reads solid
  const inner = Math.round(puffs * 0.45);
  for (let i = 0; i < inner; i++) {
    const pc = V(center.x + rng.range(-R, R) * 0.45, center.y + rng.range(-0.1, 0.6) * Ry * 0.6, center.z + rng.range(-R, R) * 0.45);
    placePuff(pc, 0.9 * (o.puffScale ?? 1), Math.max(2, Math.round(cardsPer * 0.5)), 0.9);
  }
}

// Approximate crown of each kind at scale 1: horizontal reach and crown-center height.
const CROWN = {
  sakura: { r: 4.9, cy: 5.8 },
  sakuraSmall: { r: 2.4, cy: 3.0 },
  broadleaf: { r: 3.6, cy: 5.0 },
  shrubTree: { r: 1.4, cy: 1.75 },
  zelkova: { r: 4.1, cy: 7.5 },
  pine: { r: 1.6, cy: 3.5 },
  cedar: { r: 2.4, cy: 11 },
  blackpine: { r: 2.6, cy: 8.5 },
  mikan: { r: 1.5, cy: 1.6 },
};

// Keep crowns out of buildings: shrink a tree until its crown clears every solid
// standing at crown height, or drop it when even a small one would not fit.
export function fitTrees(ctx) {
  const C = ctx.colliders;
  const hits = (x, z, R, y) => {
    if (C.solidAt(x, z, y)) return true;
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      for (const f of [0.5, 0.92]) if (C.solidAt(x + Math.cos(a) * R * f, z + Math.sin(a) * R * f, y)) return true;
    }
    return false;
  };
  const kept = [];
  let shrunk = 0, dropped = 0;
  for (const t of ctx.trees) {
    const cr = CROWN[t.kind];
    if (!cr || t.compact) {
      kept.push(t);
      continue;
    }
    const s0 = t.scale ?? 1;
    // small garden trees may also shift a little within the yard
    const movable = t.y === undefined && (t.kind === 'shrubTree' || t.kind === 'sakuraSmall' || t.kind === 'pine');
    const spots = [[0, 0]];
    if (movable) for (const d of [0.8, 1.5]) for (let k = 0; k < 8; k++) spots.push([Math.cos((k / 8) * Math.PI * 2) * d, Math.sin((k / 8) * Math.PI * 2) * d]);
    let s = s0, ok = false;
    for (let k = 0; k < 5 && !ok; k++) {
      for (const [dx, dz] of spots) {
        const x = t.x + dx, z = t.z + dz;
        if ((dx || dz) && roadAt(x, z, 0.6)) continue;
        const y0 = t.y ?? terrainH(x, z);
        if ((dx || dz) && C.solidAt(x, z, y0 + 0.2)) continue;
        if (!hits(x, z, cr.r * s, y0 + cr.cy * s)) {
          t.x = x;
          t.z = z;
          ok = true;
          break;
        }
      }
      if (!ok) s *= 0.84;
    }
    if (!ok) {
      // no room for a tree: a clipped bush keeps the corner green
      const y0 = t.y ?? terrainH(t.x, t.z);
      if (movable && !hits(t.x, t.z, 0.65, y0 + 0.5)) shrub(t.x, y0 + 0.5, t.z, 0.62, 0.5, new RNG(t.seed || 7), { cards: 6, size: 0.42 });
      dropped++;
      continue;
    }
    if (s !== s0) {
      t.scale = s;
      shrunk++;
    }
    kept.push(t);
  }
  ctx.trees = kept;
  return { shrunk, dropped };
}

export function buildTrees(ctx, specs) {
  const fol = ctx.foliage ?? new FoliageSet(64);
  const emitters = [];
  for (const sp of specs) {
    const rng = new RNG(sp.seed || 1);
    const s = sp.scale ?? 1;
    const y0 = sp.y ?? terrainH(sp.x, sp.z);
    const tb = ctx.builders.get('toon', sp.x, sp.z);
    const base = V(sp.x, y0 - 0.2, sp.z);
    if (sp.kind === 'sakura' || sp.kind === 'sakuraSmall') {
      const big = sp.kind === 'sakura';
      const H = (big ? rng.range(7.5, 9.5) : rng.range(3.8, 4.8)) * s;
      const R = (big ? rng.range(3.8, 4.8) : rng.range(1.8, 2.4)) * s;
      const trunkH = (big ? rng.range(2.4, 3.0) : 1.3) * s;
      const lean = V(rng.range(-0.15, 0.15) + (sp.lean ?? 0), 1, rng.range(-0.15, 0.15));
      const trunk = branchPath(base, lean, trunkH, 0.08, rng, 4);
      const r0 = (big ? 0.34 : 0.16) * s;
      tb.tube(trunk, trunk.map((_, i) => r0 * (1 - i * 0.08)), 7, 0x7a6660, PAT.BARK);
      const top = trunk[trunk.length - 1];
      const cc = V(top.x, y0 + H - R * 0.62, top.z);
      const nb = big ? rng.int(4, 6) : 3;
      for (let i = 0; i < nb; i++) {
        const a = (i / nb) * Math.PI * 2 + rng.range(-0.3, 0.3);
        const dir = V(Math.cos(a), rng.range(0.55, 0.95), Math.sin(a));
        const pts = branchPath(top, dir, R * 1.0, 0.16, rng, 5);
        const rb = r0 * 0.62;
        tb.tube(pts, pts.map((_, k) => rb * (1 - k * 0.15) + 0.02), 5, 0x76625c, PAT.BARK);
        // twigs
        const mid = pts[3];
        const tw = branchPath(mid, V(Math.cos(a + 0.8), 0.6, Math.sin(a + 0.8)), R * 0.4, 0.3, rng, 3);
        tb.tube(tw, tw.map((_, k) => rb * 0.45 * (1 - k * 0.25) + 0.01), 4, 0x76625c, PAT.BARK);
      }
      // compact trees (indoors) shrink their blossom clumps with the tree so the crown fits
      const cs = sp.compact ? s : 1;
      canopy(fol.get('blossom', sp.x, sp.z), cc, R, R * 0.58, SAKURA_COLS, rng, { cardSize: big ? [1.3 * cs, 2.0 * cs] : [0.9 * cs, 1.3 * cs], puffs: big ? 20 : 8, cardsPer: big ? 7 : 5, puffScale: (big ? 1 : 0.65) * cs, flatBottom: -0.25 });
      ctx.colliders.addCircle(sp.x, sp.z, r0 + 0.12);
      ctx.ground.petals(sp.x, sp.z, R * 1.15, big ? 0.55 : 0.35);
      if (sp.z > -135 && sp.x > -245 && sp.x < 325) emitters.push({ x: cc.x, y: cc.y, z: cc.z, r: R, ground: y0, big });
    } else if (sp.kind === 'broadleaf' || sp.kind === 'shrubTree' || sp.kind === 'forest') {
      const small = sp.kind === 'shrubTree';
      const forest = sp.kind === 'forest';
      const H = (small ? rng.range(2.2, 3.4) : forest ? rng.range(7, 12) : rng.range(6, 9)) * s;
      const R = (small ? rng.range(0.9, 1.4) : forest ? rng.range(3.5, 5.5) : rng.range(2.6, 3.6)) * s;
      let cy = y0 + H * (small ? 0.62 : 0.66);
      if (!forest) {
        const trunk = branchPath(base, V(rng.range(-0.1, 0.1), 1, rng.range(-0.1, 0.1)), H * 0.55, 0.06, rng, 3);
        const r0 = small ? 0.08 : 0.2;
        tb.tube(trunk, trunk.map((_, i) => r0 * (1 - i * 0.15)), 5, 0x6b5546, PAT.NONE);
        if (!small) ctx.colliders.addCircle(sp.x, sp.z, r0 + 0.1);
      } else {
        // hillside tree: the crown settles toward the downhill ground (so it never hangs
        // in the air on a slope) and a trunk with a couple of limbs carries it
        let lo = y0;
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2;
          lo = Math.min(lo, terrainH(sp.x + Math.cos(a) * R * 0.75, sp.z + Math.sin(a) * R * 0.75));
        }
        cy = Math.max(lo + H * 0.6, y0 + R * 0.55);
        const r0 = 0.24 * s;
        const trunk = branchPath(V(sp.x, y0 - 0.4, sp.z), V(rng.range(-0.08, 0.08), 1, rng.range(-0.08, 0.08)), cy - y0 + 0.4, 0.05, rng, 3);
        tb.tube(trunk, trunk.map((_, i) => r0 * (1 - i * 0.2)), 5, 0x5a4a40, PAT.BARK);
        const mid = trunk[1];
        for (let i = 0; i < 2; i++) {
          const a = rng.range(0, Math.PI * 2);
          const limb = branchPath(mid, V(Math.cos(a) * 0.6, 1, Math.sin(a) * 0.6), R * 0.7, 0.1, rng, 3);
          tb.tube(limb, limb.map((_, k) => r0 * 0.5 * (1 - k * 0.25) + 0.02), 4, 0x5a4a40, PAT.BARK);
        }
        ctx.colliders.addCircle(sp.x, sp.z, r0 + 0.1);
      }
      const cc = V(sp.x, cy, sp.z);
      const cols = forest ? DARK_GREENS : GREEN_COLS;
      canopy(fol.get(forest ? 'forest' : 'leaf', sp.x, sp.z), cc, R, R * (small ? 0.85 : 0.75), cols, rng, {
        puffs: small ? 5 : forest ? 6 : 12,
        cardsPer: small ? 4 : forest ? 4 : 6,
        cardSize: small ? [0.7, 1.1] : forest ? [2.6, 4.0] : [1.2, 1.9],
        puffScale: small ? 0.5 : forest ? 1.8 : 1,
        flatBottom: forest ? -0.5 : -0.35,
      });
    } else if (sp.kind === 'zelkova') {
      // vase shape: a straight trunk that splits into upward-reaching limbs, broad crown
      const H = rng.range(8.5, 10.5) * s;
      const R = rng.range(3.2, 4.0) * s;
      const trunk = branchPath(base, V(rng.range(-0.05, 0.05), 1, rng.range(-0.05, 0.05)), 2.8 * s, 0.04, rng, 3);
      tb.tube(trunk, trunk.map((_, i) => 0.24 * s * (1 - i * 0.1)), 7, 0x6f6a62, PAT.BARK);
      const top = trunk[trunk.length - 1];
      const nb = rng.int(4, 6);
      for (let i = 0; i < nb; i++) {
        const a = (i / nb) * Math.PI * 2 + rng.range(-0.3, 0.3);
        const pts = branchPath(top, V(Math.cos(a) * 0.55, 1, Math.sin(a) * 0.55), H * 0.48, 0.1, rng, 4);
        tb.tube(pts, pts.map((_, k) => 0.12 * s * (1 - k * 0.18) + 0.015), 5, 0x6f6a62, PAT.BARK);
      }
      const cc = V(top.x, y0 + H - R * 0.55, top.z);
      canopy(fol.get('leaf', sp.x, sp.z), cc, R, R * 0.62, ZELKOVA_COLS, rng, { puffs: 16, cardsPer: 6, cardSize: [1.2, 1.8], flatBottom: -0.1 });
      ctx.colliders.addCircle(sp.x, sp.z, 0.32);
    } else if (sp.kind === 'cedar') {
      // 杉: a straight reddish trunk and a slim dark spire of drooping sprays, tier on tier
      const H = rng.range(15, 21) * s;
      const r0 = rng.range(0.22, 0.3) * s;
      const lean = V(rng.range(-0.02, 0.02), 1, rng.range(-0.02, 0.02));
      const trunk = branchPath(V(sp.x, y0 - 0.4, sp.z), lean, H * 0.92, 0.01, rng, 4);
      tb.tube(trunk, trunk.map((_, i) => r0 * (1 - i * 0.2) + 0.02), 6, 0x7a5444, PAT.BARK);
      const fb = fol.get('cedar', sp.x, sp.z);
      const top = V(sp.x + lean.x * H, y0 + H, sp.z + lean.z * H);
      const R = rng.range(2.2, 2.8) * s;
      const base = rng.range(0.3, 0.4);
      const tiers = 9;
      for (let k = 0; k < tiers; k++) {
        const t = k / (tiers - 1);
        const y = y0 + H * (base + (1 - base) * t * 0.95);
        const r = R * Math.pow(1 - t * 0.88, 1.05) + 0.2;
        const n = Math.max(3, Math.round(7 - t * 4));
        const a0 = rng.next() * Math.PI * 2;
        const cy = V(sp.x + lean.x * (y - y0), y, sp.z + lean.z * (y - y0));
        for (let i = 0; i < n; i++) {
          const a = a0 + (i / n) * Math.PI * 2 + rng.range(-0.25, 0.25);
          const p = V(cy.x + Math.cos(a) * r * 0.58, y + rng.range(-0.2, 0.2), cy.z + Math.sin(a) * r * 0.58);
          const nrm = V(Math.cos(a), 0.4, Math.sin(a)).normalize();
          const col = CEDAR_COLS[(k + i) % CEDAR_COLS.length].clone().multiplyScalar(0.86 + t * 0.2);
          fb.card4(p, nrm, col, cy, (0.5 + r * 0.36) * rng.range(0.9, 1.12), rng.range(-0.25, 0.25));
        }
        // a darker core so the spire reads solid between the sprays
        const dk = CEDAR_COLS[2].clone().multiplyScalar(0.62);
        fb.card4(cy.clone(), V(0, 0.3, 1).normalize(), dk, cy, 0.35 + r * 0.32, 0);
      }
      fb.card4(top.clone().add(V(0, -0.5, 0)), V(0, 1, 0), CEDAR_COLS[1], top, 1.1 * s, 0);
      ctx.colliders.addCircle(sp.x, sp.z, r0 + 0.1);
    } else if (sp.kind === 'blackpine') {
      // クロマツ by the sea: a tall trunk bent by the wind, flat pads of needles at the top
      const H = rng.range(8, 12) * s;
      const pts = [base.clone()];
      let p = base.clone();
      const lean = sp.lean ?? [rng.range(-0.3, 0.3), rng.range(0.1, 0.35)];
      let d = V(lean[0], 1, lean[1]).normalize();
      for (let i = 0; i < 6; i++) {
        d = V(d.x + rng.range(-0.18, 0.18), 1, d.z + rng.range(-0.18, 0.18)).normalize();
        p = p.clone().addScaledVector(d, H / 6);
        pts.push(p);
      }
      tb.tube(pts, pts.map((_, i) => 0.26 * s * (1 - i * 0.12)), 6, 0x4a3a32, PAT.BARK);
      const fb = fol.get('pine', sp.x, sp.z);
      const npads = rng.int(5, 8);
      for (let i = 0; i < npads; i++) {
        const k = 3 + Math.floor(rng.next() * (pts.length - 3));
        const from = pts[Math.min(k, pts.length - 1)];
        const a = rng.next() * Math.PI * 2;
        const L = rng.range(1.0, 2.6) * s;
        const to = from.clone().add(V(Math.cos(a) * L, rng.range(-0.2, 0.5), Math.sin(a) * L));
        tb.rod(from, to, 0.1 * s, 0.05 * s, 4, 0x4a3a32);
        const padC = to.clone().add(V(0, 0.3, 0));
        const pr = rng.range(1.2, 2.0) * s;
        for (let c = 0; c < 7; c++) {
          const q = V(padC.x + rng.range(-pr, pr) * 0.8, padC.y + rng.range(-0.2, 0.25), padC.z + rng.range(-pr, pr) * 0.8);
          fb.card4(q, V(0, 1, 0).add(q.clone().sub(padC).multiplyScalar(0.3)).normalize(), PINE_COLS[c % 3], padC, rng.range(1.0, 1.5) * s, rng.range(-0.3, 0.3));
        }
      }
      ctx.colliders.addCircle(sp.x, sp.z, 0.34 * s);
    } else if (sp.kind === 'mikan') {
      // a low, round orange tree, pruned wide, fruit hanging on the outside of the crown
      const H = rng.range(2.3, 3.0) * s;
      const R = rng.range(1.25, 1.6) * s;
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + rng.range(-0.4, 0.4);
        const pts = branchPath(base, V(Math.cos(a) * 0.5, 1, Math.sin(a) * 0.5), H * 0.5, 0.15, rng, 3);
        tb.tube(pts, pts.map((_, k) => 0.07 * s * (1 - k * 0.2) + 0.015), 4, 0x6b5848, PAT.BARK);
      }
      const cc = V(sp.x, y0 + H * 0.55, sp.z);
      canopy(fol.get('mikan', sp.x, sp.z), cc, R, R * 0.8, MIKAN_COLS, rng, { puffs: 7, cardsPer: 4, cardSize: [0.75, 1.05], puffScale: 0.55, flatBottom: -0.45 });
      const fr = fol.get('fruit', sp.x, sp.z);
      for (let i = 0; i < 9; i++) {
        const u = rng.next() * Math.PI * 2, v = Math.acos(rng.range(-0.5, 0.7));
        const q = V(cc.x + Math.sin(v) * Math.cos(u) * R * 0.92, cc.y + Math.cos(v) * R * 0.7, cc.z + Math.sin(v) * Math.sin(u) * R * 0.92);
        fr.card4(q, q.clone().sub(cc).normalize(), FRUIT_COLS[i % FRUIT_COLS.length], cc, rng.range(0.32, 0.42) * s, rng.range(0, 6.28));
      }
      ctx.colliders.addCircle(sp.x, sp.z, 0.5 * s);
    } else if (sp.kind === 'pine') {
      const H = rng.range(3.5, 5.5) * s;
      const pts = [base.clone()];
      let p = base.clone();
      let d = V(rng.range(-0.4, 0.4), 1, rng.range(-0.4, 0.4)).normalize();
      for (let i = 0; i < 5; i++) {
        d = V(d.x + rng.range(-0.35, 0.35), 1, d.z + rng.range(-0.35, 0.35)).normalize();
        p = p.clone().addScaledVector(d, H / 5);
        pts.push(p);
      }
      tb.tube(pts, pts.map((_, i) => 0.2 * s * (1 - i * 0.13)), 6, 0x4f3f36, PAT.BARK);
      const fb = fol.get('pine', sp.x, sp.z);
      const npads = rng.int(4, 7);
      for (let i = 0; i < npads; i++) {
        const k = 2 + Math.floor(rng.next() * (pts.length - 2));
        const from = pts[Math.min(k, pts.length - 1)];
        const a = rng.next() * Math.PI * 2;
        const L = rng.range(0.6, 1.6) * s;
        const to = from.clone().add(V(Math.cos(a) * L, rng.range(-0.1, 0.4), Math.sin(a) * L));
        tb.rod(from, to, 0.08 * s, 0.05 * s, 4, 0x4f3f36);
        const padC = to.clone().add(V(0, 0.25, 0));
        const pr = rng.range(0.9, 1.4) * s;
        for (let c = 0; c < 6; c++) {
          const q = V(padC.x + rng.range(-pr, pr) * 0.8, padC.y + rng.range(-0.15, 0.2), padC.z + rng.range(-pr, pr) * 0.8);
          fb.card4(q, V(0, 1, 0).add(q.clone().sub(padC).multiplyScalar(0.4)).normalize(), PINE_COLS[c % 3], padC, rng.range(0.7, 1.1) * s, rng.range(-0.3, 0.3));
        }
      }
      const topC = pts[pts.length - 1].clone().add(V(0, 0.3, 0));
      for (let c = 0; c < 7; c++) {
        const q = V(topC.x + rng.range(-0.9, 0.9) * s, topC.y + rng.range(-0.2, 0.3), topC.z + rng.range(-0.9, 0.9) * s);
        fb.card4(q, V(0, 1, 0), PINE_COLS[c % 3], topC, rng.range(0.8, 1.2) * s, rng.range(-0.3, 0.3));
      }
      ctx.colliders.addCircle(sp.x, sp.z, 0.3);
    }
  }

  return { emitters };
}
