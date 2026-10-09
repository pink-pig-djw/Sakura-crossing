import * as THREE from 'three';
import { RNG, fbm2, smoothstep } from '../core/rng.js';
import { PAT } from '../core/builder.js';
import { terrainH, outsideDist, roadAt, overRiver, RAIL_Z, HOLES } from './layout.js';
import { grassTint } from './terrain.js';
import { createGrassMaterial } from '../render/materials.js';
import { grassTexture, canvasTexture } from './greenery.js';

// Grass tufts: crossed blade cards scattered over lawns, verges, embankments and
// the hill edges (wherever the ground is grass and nothing stands on it),
// instanced per 32 m chunk and drawn only near the camera.

const CHUNK = 32;
const FAR = 44;

function tuftGeometry() {
  const pos = [], nor = [], uv = [], idx = [];
  const w = 0.46, h = 0.34;
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI;
    const dx = Math.cos(a) * w / 2, dz = Math.sin(a) * w / 2;
    const nx = -Math.sin(a), nz = Math.cos(a);
    const b = pos.length / 3;
    pos.push(-dx, 0, -dz, dx, 0, dz, dx, h, dz, -dx, h, -dz);
    for (let i = 0; i < 4; i++) nor.push(nx, 0, nz);
    uv.push(0, 0, 1, 0, 1, 1, 0, 1);
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

export function buildGrass(ctx) {
  const gm = ctx.ground, C = ctx.colliders;
  const rng = new RNG(4242);
  const indoor = ctx.indoorRects || [];
  const chunks = new Map();
  const tint = new THREE.Color();
  const straw = new THREE.Color(0.62, 0.6, 0.32);
  const cell = 0.62;
  const grassType = PAT.GRASS + 1;
  let count = 0;
  for (let z = gm.z0 + 0.5; z < gm.z0 + gm.h / gm.ppm - 0.5; z += cell) {
    for (let x = gm.x0 + 0.5; x < gm.x0 + gm.w / gm.ppm - 0.5; x += cell) {
      const px = x + rng.range(-0.5, 0.5) * cell, pz = z + rng.range(-0.5, 0.5) * cell;
      const keep = rng.next();
      const out = outsideDist(px, pz);
      if (out > 14) continue;
      const ti = (Math.floor((pz - gm.z0) * gm.ppm) * gm.w + Math.floor((px - gm.x0) * gm.ppm)) * 4;
      const type = gm.data[ti + 3];
      if (type !== 0 && type !== grassType) continue;
      if (type === 0 && out <= 0 && pz > 60.5) continue; // sea front: paving, promenade, beach
      // patchy where nobody mows, full on painted lawns
      const n = fbm2(px * 0.09, pz * 0.09, 2);
      const p = type === grassType ? 0.85 : out > 0 ? 0.25 + 0.55 * smoothstep(0.3, 0.7, n) : 0.15 + 0.8 * smoothstep(0.35, 0.68, n);
      if (keep > p) continue;
      if (Math.abs(pz - RAIL_Z) < 2.1 || overRiver(px, pz, 0.4) || roadAt(px, pz, 0.25)) continue;
      const th = terrainH(px, pz);
      const gy = C.groundAt(px, pz);
      if (Math.abs(gy - th) > 0.03) continue; // something walkable is built over it
      if (C.solidAt(px, pz, gy)) continue;
      if (indoor.some((r) => px > r.x0 && px < r.x1 && pz > r.z0 && pz < r.z1)) continue;
      if (HOLES.some((r) => px > r.x0 - 0.5 && px < r.x1 + 0.5 && pz > r.z0 - 0.5 && pz < r.z1 + 0.5)) continue;
      const sx = terrainH(px + 0.4, pz) - terrainH(px - 0.4, pz), sz = terrainH(px, pz + 0.4) - terrainH(px, pz - 0.4);
      if (Math.hypot(sx, sz) > 0.8) continue; // cliffs and wall faces
      if (type === grassType) {
        tint.setRGB(gm.data[ti] / 255, gm.data[ti + 1] / 255, gm.data[ti + 2] / 255, THREE.SRGBColorSpace);
      } else grassTint(px, pz, out, tint);
      tint.multiplyScalar(rng.range(0.86, 1.06));
      if (rng.next() < 0.25) tint.lerp(straw, 0.25); // a few straw-tipped tufts
      const key = Math.floor(px / CHUNK) + ',' + Math.floor(pz / CHUNK);
      let ch = chunks.get(key);
      if (!ch) {
        ch = { inst: [], tint: [], cx: (Math.floor(px / CHUNK) + 0.5) * CHUNK, cz: (Math.floor(pz / CHUNK) + 0.5) * CHUNK, y0: Infinity, y1: -Infinity };
        chunks.set(key, ch);
      }
      ch.inst.push(px, gy - 0.02, pz, rng.range(0, Math.PI));
      ch.tint.push(tint.r, tint.g, tint.b, rng.range(0.7, 1.25) * (type === grassType ? 0.85 : 1));
      ch.y0 = Math.min(ch.y0, gy);
      ch.y1 = Math.max(ch.y1, gy);
      count++;
    }
  }
  const material = createGrassMaterial(canvasTexture(grassTexture()), { far: FAR });
  const base = tuftGeometry();
  const group = new THREE.Group();
  group.name = 'grass';
  const meshes = [];
  for (const ch of chunks.values()) {
    const g = new THREE.InstancedBufferGeometry();
    g.index = base.index;
    for (const k of ['position', 'normal', 'uv']) g.setAttribute(k, base.getAttribute(k));
    g.setAttribute('inst', new THREE.InstancedBufferAttribute(new Float32Array(ch.inst), 4));
    g.setAttribute('tint', new THREE.InstancedBufferAttribute(new Float32Array(ch.tint), 4));
    g.instanceCount = ch.inst.length / 4;
    const cy = (ch.y0 + ch.y1) / 2;
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(ch.cx, cy, ch.cz), CHUNK * 0.75 + (ch.y1 - ch.y0) / 2 + 1);
    g.boundingBox = new THREE.Box3(new THREE.Vector3(ch.cx - CHUNK / 2, ch.y0 - 1, ch.cz - CHUNK / 2), new THREE.Vector3(ch.cx + CHUNK / 2, ch.y1 + 1, ch.cz + CHUNK / 2));
    const mesh = new THREE.Mesh(g, material);
    mesh.frustumCulled = true;
    mesh.matrixAutoUpdate = false;
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    mesh.visible = false;
    mesh.userData.c = new THREE.Vector2(ch.cx, ch.cz);
    meshes.push(mesh);
    group.add(mesh);
  }
  const reach = FAR + CHUNK * 0.72;
  return {
    group,
    count,
    // only chunks near the camera are drawn (the blades fade out by FAR anyway)
    update(camera) {
      const x = camera.position.x, z = camera.position.z;
      for (const m of meshes) m.visible = Math.hypot(m.userData.c.x - x, m.userData.c.y - z) < reach;
    },
  };
}
