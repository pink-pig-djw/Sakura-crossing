import { terrainH } from './layout.js';

// 2D collision world (XZ) with a spatial hash, plus walkable height overrides
// (platforms, stairs, promenade ...) layered over the terrain.

export class Colliders {
  constructor(cell = 8) {
    this.cell = cell;
    this.grid = new Map();
    this.surfaces = [];
    this.surfGrid = new Map();
  }

  _insert(grid, item, x0, z0, x1, z1) {
    const c = this.cell;
    const i0 = Math.floor(x0 / c), i1 = Math.floor(x1 / c);
    const j0 = Math.floor(z0 / c), j1 = Math.floor(z1 / c);
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const k = i * 100003 + j;
        let arr = grid.get(k);
        if (!arr) {
          arr = [];
          grid.set(k, arr);
        }
        arr.push(item);
      }
    }
  }

  addBox(cx, cz, hx, hz, ry = 0, yTop = 99, yBottom = -99) {
    const c = Math.cos(ry), s = Math.sin(ry);
    const ex = Math.abs(c) * hx + Math.abs(s) * hz;
    const ez = Math.abs(s) * hx + Math.abs(c) * hz;
    const item = { t: 0, cx, cz, hx, hz, c, s, yTop, yBottom };
    this._insert(this.grid, item, cx - ex, cz - ez, cx + ex, cz + ez);
    return item;
  }

  addCircle(x, z, r, yTop = 99) {
    const item = { t: 1, cx: x, cz: z, r, yTop, yBottom: -99 };
    this._insert(this.grid, item, x - r, z - r, x + r, z + r);
    return item;
  }

  addSegment(x0, z0, x1, z1, thick = 0.25, yTop = 99) {
    const dx = x1 - x0, dz = z1 - z0;
    const len = Math.hypot(dx, dz);
    if (len < 0.01) return null;
    const ry = Math.atan2(-dz, dx);
    return this.addBox((x0 + x1) / 2, (z0 + z1) / 2, len / 2, thick / 2, ry, yTop);
  }

  // walkable surface: rect (axis aligned) with height function h(x,z)
  addSurface(x0, z0, x1, z1, h, priority = 0) {
    const item = { x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1), h, priority };
    this.surfaces.push(item);
    this._insert(this.surfGrid, item, item.x0, item.z0, item.x1, item.z1);
    return item;
  }

  groundAt(x, z) {
    let h = terrainH(x, z);
    const arr = this.surfGrid.get(Math.floor(x / this.cell) * 100003 + Math.floor(z / this.cell));
    if (arr) {
      let best = null;
      for (const s of arr) {
        if (x >= s.x0 && x <= s.x1 && z >= s.z0 && z <= s.z1) {
          if (!best || s.priority > best.priority) best = s;
        }
      }
      if (best) {
        const v = best.h(x, z);
        if (best.priority > 0) h = v;
        else h = Math.max(h, v);
      }
    }
    return h;
  }

  // Push a circle (x,z,r) out of solid colliders. feetY lets low objects be stepped over.
  resolve(p, r, feetY) {
    const c = this.cell;
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      const i0 = Math.floor((p.x - r) / c), i1 = Math.floor((p.x + r) / c);
      const j0 = Math.floor((p.z - r) / c), j1 = Math.floor((p.z + r) / c);
      const seen = new Set();
      for (let i = i0; i <= i1; i++) {
        for (let j = j0; j <= j1; j++) {
          const arr = this.grid.get(i * 100003 + j);
          if (!arr) continue;
          for (const it of arr) {
            if (seen.has(it)) continue;
            seen.add(it);
            if (it.yTop < feetY + 0.45 || it.yBottom > feetY + 1.7) continue;
            if (it.t === 1) {
              const dx = p.x - it.cx, dz = p.z - it.cz;
              const d = Math.hypot(dx, dz);
              const m = r + it.r;
              if (d < m && d > 1e-6) {
                p.x = it.cx + (dx / d) * m;
                p.z = it.cz + (dz / d) * m;
                moved = true;
              }
            } else {
              const wx = p.x - it.cx, wz = p.z - it.cz;
              const lx = it.c * wx - it.s * wz;
              const lz = it.s * wx + it.c * wz;
              const qx = Math.max(-it.hx, Math.min(it.hx, lx));
              const qz = Math.max(-it.hz, Math.min(it.hz, lz));
              let dx = lx - qx, dz = lz - qz;
              let d = Math.hypot(dx, dz);
              if (d >= r) continue;
              let px, pz;
              if (d < 1e-6) {
                // inside: push along the shallow axis
                const ox = it.hx - Math.abs(lx), oz = it.hz - Math.abs(lz);
                if (ox < oz) {
                  px = Math.sign(lx || 1) * (ox + r);
                  pz = 0;
                } else {
                  px = 0;
                  pz = Math.sign(lz || 1) * (oz + r);
                }
              } else {
                const k = (r - d) / d;
                px = dx * k;
                pz = dz * k;
              }
              // back to world
              p.x += it.c * px + it.s * pz;
              p.z += -it.s * px + it.c * pz;
              moved = true;
            }
          }
        }
      }
      if (!moved) break;
    }
    return p;
  }
}
