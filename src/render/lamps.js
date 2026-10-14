import * as THREE from 'three';
import { G } from './materials.js';

// The town's lamps at night, lighting what is near them: the ground under them in a soft pool,
// the walls, fences, grass and leaves round them, and on a wet street their reflections (the
// shaders' lampLight, render/glsl.js; they take the place of light decals laid over the
// ground, which cut into slopes and kerbs in hard-edged pieces). Each lamp goes into a data
// texture (where its light hangs, its pool's centre, radius and floor, its colour), and a grid
// of 8 m cells over the town lists the lamps that reach into each cell (up to eight, the
// strongest first), so that a point looks at those alone.
const CELL = 8, SLOTS = 8;
// (a wet street shows a lamp this many times further off than its pool reaches: the shaders'
// SHEEN_REACH, render/glsl.js)
const SHEEN_REACH = 2.2;

// rainMap (render/rainmap.js): what is over each spot of the town. A lamp out under the sky
// lights nothing under a roof (through a shop's wall onto its floor); one under a roof (a
// porch, a station's canopy, the subway) lights what is under it.
export function buildLampGrid(lamps, groundAt, rainMap) {
  const list = [];
  for (const l of lamps) {
    const px = l.pool?.x ?? l.x, pz = l.pool?.z ?? l.z;
    const floor = l.floor ?? (l.ground ? l.y - 0.1 : groundAt(px, pz, l.y + 0.2));
    const r = l.pool?.r ?? l.r ?? 6;
    const c = new THREE.Color(l.color ?? 0xffd9a0);
    // (a roof over the lamp: something over three of four points round it, clear of its head)
    let over = 0;
    for (const [dx, dz] of [[0.6, 0], [-0.6, 0], [0, 0.6], [0, -0.6]]) if (rainMap && rainMap.top(l.x + dx, l.z + dz) > l.y + 0.25) over++;
    // (a light at the foot of things, a garden lantern or a porch light given at the floor: its
    // light taken from a little over it, so that it falls on the ground round it)
    const y = Math.max(l.y, floor + 0.6);
    list.push({ x: l.x, y, z: l.z, px, pz, r, floor, h: y - floor, c, open: over >= 3 ? 0 : 1, reach: r * SHEEN_REACH });
  }
  const n = list.length;
  // the lamps: a column of three texels each (light, pool, colour)
  const data = new Float32Array(Math.max(1, n) * 3 * 4);
  list.forEach((L, i) => {
    data.set([L.x, L.y, L.z, L.r], i * 4);
    data.set([L.px, L.pz, L.floor, L.h], (n + i) * 4);
    data.set([L.c.r, L.c.g, L.c.b, L.open], (2 * n + i) * 4);
  });
  const dataTex = new THREE.DataTexture(data, Math.max(1, n), 3, THREE.RGBAFormat, THREE.FloatType);
  dataTex.minFilter = dataTex.magFilter = THREE.NearestFilter;
  dataTex.needsUpdate = true;
  // the grid over every lamp's reach
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const L of list) {
    x0 = Math.min(x0, L.px - L.reach);
    x1 = Math.max(x1, L.px + L.reach);
    z0 = Math.min(z0, L.pz - L.reach);
    z1 = Math.max(z1, L.pz + L.reach);
  }
  if (!n) x0 = z0 = 0, x1 = z1 = CELL;
  x0 = Math.floor(x0 / CELL) * CELL;
  z0 = Math.floor(z0 / CELL) * CELL;
  const cols = Math.max(1, Math.ceil((x1 - x0) / CELL)), rows = Math.max(1, Math.ceil((z1 - z0) / CELL));
  const cells = Array.from({ length: cols * rows }, () => []);
  list.forEach((L, i) => {
    const ca = Math.floor((L.px - L.reach - x0) / CELL), cb = Math.floor((L.px + L.reach - x0) / CELL);
    const ra = Math.floor((L.pz - L.reach - z0) / CELL), rb = Math.floor((L.pz + L.reach - z0) / CELL);
    for (let rz = Math.max(0, ra); rz <= Math.min(rows - 1, rb); rz++) {
      for (let cx = Math.max(0, ca); cx <= Math.min(cols - 1, cb); cx++) {
        // the nearest point of the cell to the pool's centre: in reach?
        const qx = Math.min(Math.max(L.px, x0 + cx * CELL), x0 + (cx + 1) * CELL);
        const qz = Math.min(Math.max(L.pz, z0 + rz * CELL), z0 + (rz + 1) * CELL);
        const d = Math.hypot(qx - L.px, qz - L.pz);
        if (d >= L.reach) continue;
        // (how much it may light there: kept first when a cell has more than it can list)
        const u = 1 - (d / L.reach) ** 2;
        cells[rz * cols + cx].push({ i, w: u * u * L.r });
      }
    }
  });
  let most = 0, dropped = 0;
  const ids = new Float32Array(cols * 2 * rows * 4);
  cells.forEach((c, k) => {
    most = Math.max(most, c.length);
    if (c.length > SLOTS) {
      c.sort((a, b) => b.w - a.w);
      dropped += c.length - SLOTS;
    }
    const cx = k % cols, rz = Math.floor(k / cols);
    for (let s = 0; s < Math.min(SLOTS, c.length); s++) ids[(rz * cols * 2 + cx * 2) * 4 + s] = c[s].i + 1;
  });
  const cellTex = new THREE.DataTexture(ids, cols * 2, rows, THREE.RGBAFormat, THREE.FloatType);
  cellTex.minFilter = cellTex.magFilter = THREE.NearestFilter;
  cellTex.needsUpdate = true;
  G.uLampData.value = dataTex;
  G.uLampCells.value = cellTex;
  G.uLampGrid.value.set(x0, z0, 1 / CELL, cols);
  G.uLampRows.value = rows;
  G.uLampCount.value = n;
  return { lamps: n, cols, rows, most, dropped };
}
