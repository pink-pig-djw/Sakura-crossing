import * as THREE from 'three';
import { ChunkedBuilders } from '../core/builder.js';
import { RNG, fbm2 } from '../core/rng.js';
import { createToonMaterial, createWindowMaterial, createRoadMaterial } from '../render/materials.js';
import { Atlas } from '../render/atlas.js';
import { GroundMap, buildTerrain } from './terrain.js';
import { buildRoads, paintRoadsides } from './roads.js';
import { generateLots, WORLD_SEED, ROADS, roadAt, outsideDist, terrainH, SHRINE, PLAZA } from './layout.js';
import { buildHouse, buildOldHouse, buildApartment, buildMansion, buildParking, buildField, buildGarden, buildSento } from './buildings.js';
import { buildTrees } from './trees.js';
import { Colliders } from './collision.js';
import { buildPolesAndWires, buildStreetProps, buildVending, buildLightPools, createWireMaterial, WireSet } from './props.js';
import { buildTrack, buildCrossings, buildTrain } from './railway.js';
import { buildCoast, createWater, buildIsland, createSailboats } from './coast.js';
import { buildStation, buildPlaza, buildShotengai, buildPark, buildShrine, lanternMesh } from './places.js';

const tick = () => new Promise((r) => setTimeout(r, 0));

function streetTrees(ctx) {
  const rng = new RNG(31);
  const sak = ROADS.find((r) => r.id === 'sakura');
  const off = sak.w / 2 + sak.sidewalk / 2;
  for (const side of [-1, 1]) {
    for (let z = sak.a + 6; z < 47; z += rng.range(10, 12)) {
      const x = sak.c + side * off;
      // keep clear of side streets and crosswalks
      let clear = true;
      for (const r of ROADS) {
        if (r.axis !== 'x') continue;
        if (Math.abs(z - r.c) < r.w / 2 + 4.5) clear = false;
      }
      for (const cz of [13.2, -21.8, -91.8, 41.8]) if (Math.abs(z - cz) < 4) clear = false;
      if (!clear) continue;
      ctx.trees.push({ kind: 'sakura', x, z, seed: rng.int(1, 1e9), scale: rng.range(0.92, 1.08) });
    }
  }
  // along the rail-side lane a few more, and by the coastal road
  for (let x = -130; x < 140; x += rng.range(22, 34)) {
    if (x > PLAZA.x0 - 4 && x < PLAZA.x1 + 4) continue;
    if (roadAt(x, 50.8, 3)) continue;
    ctx.trees.push({ kind: rng.chance(0.75) ? 'sakura' : 'broadleaf', x, z: 50.8, seed: rng.int(1, 1e9), scale: rng.range(0.85, 1.0) });
  }
}

function forest(ctx) {
  const rng = new RNG(99);
  let n = 0;
  for (let i = 0; i < 2600 && n < 620; i++) {
    const x = rng.range(-460, 460);
    const z = rng.range(-520, 175);
    const d = outsideDist(x, z);
    if (d < 6) continue;
    const y = terrainH(x, z);
    if (y < 2.0 || y > 90) continue;
    if (x > SHRINE.terraceX0 - 6 && x < SHRINE.terraceX1 + 6 && z > SHRINE.terraceZ1 - 6 && z < SHRINE.z0 + 2) continue;
    const dens = fbm2(x * 0.012, z * 0.012, 3);
    if (rng.next() > dens * 1.4) continue;
    ctx.trees.push({ kind: 'forest', x, z, seed: rng.int(1, 1e9), scale: rng.range(0.8, 1.3) });
    n++;
  }
  // a few sakura on the hillsides (yamazakura)
  for (let i = 0; i < 40; i++) {
    const x = rng.range(-300, 300), z = rng.range(-300, -140);
    if (outsideDist(x, z) < 8) continue;
    ctx.trees.push({ kind: 'sakura', x, z, seed: rng.int(1, 1e9), scale: rng.range(1.0, 1.3) });
  }
}

// Builds the whole town. `progress(p, label)` reports 0..1 for the loader.
export async function buildWorld(scene, opts = {}) {
  const progress = opts.progress || (() => {});
  const atlas = new Atlas(2048);
  const signTex = atlas.texture();
  const materials = {
    toon: { material: createToonMaterial({ name: 'toon' }) },
    detail: null,
    window: { material: createWindowMaterial(), castShadow: false },
    road: { material: createRoadMaterial(), castShadow: false },
    sign: { material: createToonMaterial({ name: 'sign', map: signTex, emissiveFlag: true, alphaTest: 0.5 }), castShadow: false },
    emissive: { material: createToonMaterial({ name: 'emissive', emissiveAll: true, noPattern: true }), castShadow: false },
  };
  materials.detail = { material: materials.toon.material, castShadow: false };
  const ctx = {
    scene,
    materials,
    builders: new ChunkedBuilders(48),
    ground: new GroundMap(-224, -192, 224, 100, 3),
    colliders: new Colliders(8),
    atlas,
    rng: new RNG(WORLD_SEED),
    trees: [],
    soundSpots: [],
    catSpots: [],
    vending: [],
    landmarks: [],
    lamps: [],
    interactables: [],
    dropPoints: [],
    clocks: [],
    updaters: [],
  };
  ctx.wires = null;

  progress(0.04, '道を描いています');
  await tick();
  paintRoadsides(ctx);
  buildRoads(ctx);

  progress(0.08, '家を建てています');
  await tick();
  const lots = generateLots();
  ctx.lots = lots;
  let n = 0;
  const builders = {
    house: buildHouse,
    cornershop: buildHouse,
    oldhouse: buildOldHouse,
    apartment: buildApartment,
    mansion: buildMansion,
    parking: buildParking,
    field: buildField,
    garden: buildGarden,
    sento: buildSento,
  };
  for (const lot of lots) {
    if (lot.type === 'shop') continue;
    (builders[lot.type] || buildHouse)(ctx, lot);
    if (++n % 25 === 0) {
      progress(0.08 + 0.4 * (n / lots.length), '家を建てています');
      await tick();
    }
  }

  progress(0.5, '電線を張っています');
  await tick();
  ctx.wires = new WireSet();
  buildShotengai(ctx);
  buildStation(ctx);
  buildPlaza(ctx);
  buildPark(ctx);
  buildShrine(ctx);
  buildPolesAndWires(ctx);
  buildStreetProps(ctx);

  progress(0.58, '線路を敷いています');
  await tick();
  buildTrack(ctx);
  buildCrossings(ctx, scene);

  progress(0.64, '海を描いています');
  await tick();
  buildCoast(ctx);
  for (const v of ctx.vending) buildVending(ctx, v.x, v.z, v.ry, v.seed, v.n ?? (new RNG(v.seed).chance(0.5) ? 2 : 1));

  progress(0.7, '桜を植えています');
  await tick();
  streetTrees(ctx);
  forest(ctx);
  const trees = buildTrees(ctx, ctx.trees);
  ctx.petalEmitters = trees.emitters;

  progress(0.86, '仕上げ中');
  await tick();
  const terrain = buildTerrain(ctx.ground);
  scene.add(terrain);
  ctx.terrain = terrain;

  signTex.needsUpdate = true;
  const group = new THREE.Group();
  group.name = 'static';
  ctx.builders.build(materials, group);
  scene.add(group);

  // dynamic / special meshes
  const wireMat = createWireMaterial(1.35);
  ctx.wireMaterial = wireMat;
  scene.add(ctx.wires.build(wireMat));
  scene.add(buildLightPools(ctx));
  if (ctx.lanterns?.length) scene.add(lanternMesh(ctx));
  buildIsland(scene, materials);
  scene.add(createWater());
  const boats = createSailboats(materials);
  scene.add(boats);
  ctx.updaters.push((t, dt) => boats.userData.update(t, dt));
  buildTrain(ctx, scene);
  progress(1, '完成');
  return ctx;
}
