import * as THREE from 'three';
import { RNG } from '../core/rng.js';
import { PAT } from '../core/builder.js';
import { terrainH } from './layout.js';
import { FoliageSet } from './greenery.js';

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
    for (let k = 0; k < n; k++) {
      const p = V(pc.x + rng.range(-pr, pr), pc.y + rng.range(-pr * 0.6, pr * 0.7), pc.z + rng.range(-pr, pr));
      const up = (p.y - center.y) / Ry;
      tmp.copy(cols[Math.floor(rng.next() * cols.length)]);
      tmp.multiplyScalar(scaleCol * (0.94 + up * 0.08));
      fb.card4(p, cn, tmp, pc, rng.range(cardSize[0], cardSize[1]), rng.range(0, Math.PI * 2));
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
      if (!forest) {
        const trunk = branchPath(base, V(rng.range(-0.1, 0.1), 1, rng.range(-0.1, 0.1)), H * 0.55, 0.06, rng, 3);
        const r0 = small ? 0.08 : 0.2;
        tb.tube(trunk, trunk.map((_, i) => r0 * (1 - i * 0.15)), 5, 0x6b5546, PAT.NONE);
        if (!small) ctx.colliders.addCircle(sp.x, sp.z, r0 + 0.1);
      }
      const cc = V(sp.x, y0 + H * (small ? 0.62 : 0.66), sp.z);
      const cols = forest ? DARK_GREENS : GREEN_COLS;
      canopy(fol.get(forest ? 'forest' : 'leaf', sp.x, sp.z), cc, R, R * (small ? 0.85 : 0.75), cols, rng, {
        puffs: small ? 5 : forest ? 6 : 12,
        cardsPer: small ? 4 : forest ? 4 : 6,
        cardSize: small ? [0.7, 1.1] : forest ? [2.6, 4.0] : [1.2, 1.9],
        puffScale: small ? 0.5 : forest ? 1.8 : 1,
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
