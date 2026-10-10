import * as THREE from 'three';
import { ChunkedBuilders, AUDIT, SOLIDS } from '../core/builder.js';
import { RNG, fbm2 } from '../core/rng.js';
import { createToonMaterial, createWindowMaterial, createRoadMaterial, createInteriorMaterial, createGlassMaterial } from '../render/materials.js';
import { Atlas } from '../render/atlas.js';
import { GroundMap, buildTerrain } from './terrain.js';
import { buildRoads, paintRoadsides } from './roads.js';
import { generateLots, WORLD_SEED, ROADS, roadAt, outsideDist, terrainH, SHRINE, PLAZA, TOWN, overRiver, SUBWAY } from './layout.js';
import { buildHouse, buildOldHouse, buildApartment, buildMansion, buildParking, buildField, buildGarden, buildSento } from './buildings.js';
import { buildTrees, fitTrees } from './trees.js';
import { FoliageSet, useFoliage, buildFoliageMeshes, fitFoliage } from './greenery.js';
import { buildGrass } from './grass.js';
import { Colliders } from './collision.js';
import { buildPolesAndWires, buildStreetProps, buildVending, buildLightPools, createWireMaterial, WireSet } from './props.js';
import { buildTrack, buildCrossings, buildTrain } from './railway.js';
import { buildCoast, createWater, buildIsland, createSailboats } from './coast.js';
import { buildStation, buildPlaza, buildShotengai, buildPark, buildShrine, lanternMesh } from './places.js';
import { buildRiver } from './river.js';
import { buildCommercial } from './commercial.js';
import { buildSubway } from './subway.js';
import { buildInteriors } from './interiors.js';

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
  for (let x = TOWN.x0 + 8; x < TOWN.x1 - 8; x += rng.range(22, 34)) {
    if (x > PLAZA.x0 - 4 && x < PLAZA.x1 + 4) continue;
    if (roadAt(x, 50.8, 3) || overRiver(x, 50.8, 6)) continue;
    ctx.trees.push({ kind: rng.chance(0.75) ? 'sakura' : 'broadleaf', x, z: 50.8, seed: rng.int(1, 1e9), scale: rng.range(0.85, 1.0) });
  }
}

function forest(ctx) {
  const rng = new RNG(99);
  let n = 0;
  for (let i = 0; i < 4200 && n < 900; i++) {
    const x = rng.range(-560, 660);
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
  for (let i = 0; i < 56; i++) {
    const x = rng.range(-380, 460), z = rng.range(-300, -140);
    if (outsideDist(x, z) < 8) continue;
    ctx.trees.push({ kind: 'sakura', x, z, seed: rng.int(1, 1e9), scale: rng.range(1.0, 1.3) });
  }
}

// Builds the whole town. `progress(p, label)` reports 0..1 for the loader.
export async function buildWorld(scene, opts = {}) {
  const progress = opts.progress || (() => {});
  const atlas = new Atlas(2048, 0);
  const atlas2 = new Atlas(2048, 1, 4096);
  const signTex = atlas.texture();
  const signTex2 = atlas2.texture();
  const materials = {
    toon: { material: createToonMaterial({ name: 'toon' }) },
    detail: null,
    window: { material: createWindowMaterial(), castShadow: false },
    road: { material: createRoadMaterial(), castShadow: false },
    sign: { material: createToonMaterial({ name: 'sign', map: signTex, emissiveFlag: true, alphaTest: 0.5, alphaToCoverage: true }), castShadow: false },
    sign2: { material: createToonMaterial({ name: 'sign2', map: signTex2, emissiveFlag: true, alphaTest: 0.5, alphaToCoverage: true }), castShadow: false },
    emissive: { material: createToonMaterial({ name: 'emissive', emissiveAll: true, noPattern: true }), castShadow: false },
    // inside shops and stations: lit by ceiling lights, see-through glass in front
    interior: { material: createInteriorMaterial(), castShadow: false, receiveShadow: false },
    interiorSign: { material: createInteriorMaterial({ name: 'interiorSign', map: signTex2, alphaTest: 0.5, emissiveFlag: true }), castShadow: false, receiveShadow: false },
    glass: { material: createGlassMaterial(), castShadow: false, receiveShadow: false, renderOrder: 3 },
  };
  materials.detail = { material: materials.toon.material, castShadow: false };
  const ctx = {
    scene,
    materials,
    builders: new ChunkedBuilders(48),
    ground: new GroundMap(-300, -192, 380, 100, 3),
    colliders: new Colliders(8),
    atlas,
    atlas2,
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
  // leaf cards from every builder (trees, hedges, shrubs, flowers) gather here
  ctx.foliage = new FoliageSet(64);
  useFoliage(ctx.foliage);
  SOLIDS.on = true;
  SOLIDS.list.length = 0;

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
    AUDIT.tag = `${lot.type}@${Math.round(lot.x0)},${Math.round(lot.z0)}`;
    (builders[lot.type] || buildHouse)(ctx, lot);
    if (++n % 25 === 0) {
      progress(0.08 + 0.4 * (n / lots.length), '家を建てています');
      await tick();
    }
  }

  progress(0.5, '電線を張っています');
  await tick();
  ctx.wires = new WireSet();
  AUDIT.tag = 'shotengai';
  buildShotengai(ctx);
  AUDIT.tag = 'station';
  buildStation(ctx);
  AUDIT.tag = 'plaza';
  buildPlaza(ctx);
  AUDIT.tag = 'park';
  buildPark(ctx);
  AUDIT.tag = 'shrine';
  buildShrine(ctx);
  AUDIT.tag = 'poles';
  buildPolesAndWires(ctx);
  AUDIT.tag = 'streetprops';
  buildStreetProps(ctx);

  progress(0.58, '線路を敷いています');
  await tick();
  buildTrack(ctx);
  buildCrossings(ctx, scene);

  progress(0.64, '海を描いています');
  await tick();
  AUDIT.tag = 'coast';
  buildCoast(ctx);
  AUDIT.tag = 'river';
  buildRiver(ctx);

  progress(0.68, '街をつくっています');
  await tick();
  AUDIT.tag = 'interiors';
  const interiors = buildInteriors(ctx, scene);
  AUDIT.tag = 'commercial';
  buildCommercial(ctx, interiors.specials);
  ctx.autoDoors = interiors.doors;
  AUDIT.tag = 'subway';
  const subway = buildSubway(ctx, scene);
  ctx.updaters.push((t, dt) => subway.update(dt));
  for (const v of ctx.vending) buildVending(ctx, v.x, v.z, v.ry, v.seed, v.n ?? (new RNG(v.seed).chance(0.5) ? 2 : 1));

  progress(0.7, '桜を植えています');
  await tick();
  streetTrees(ctx);
  forest(ctx);
  ctx.treeFit = fitTrees(ctx);
  const trees = buildTrees(ctx, ctx.trees);
  ctx.petalEmitters = trees.emitters;
  // leaves stay on their side of walls, gate posts and floors
  SOLIDS.on = false;
  if (opts.fitFoliage !== false) ctx.foliageFit = fitFoliage(ctx.foliage, SOLIDS.list);
  SOLIDS.list.length = 0;
  buildFoliageMeshes(ctx.foliage, scene);
  useFoliage(null);
  // street-level colliders above the subway must not block anyone walking below
  ctx.colliders.liftOver(SUBWAY.x0 - 4, SUBWAY.z0 - 2, SUBWAY.x1 + 4, SUBWAY.z1 + 2, 3.0);

  progress(0.86, '仕上げ中');
  await tick();
  const terrain = buildTerrain(ctx.ground);
  scene.add(terrain);
  ctx.terrain = terrain;
  const grass = buildGrass(ctx);
  scene.add(grass.group);
  ctx.grass = grass;

  signTex.needsUpdate = true;
  signTex2.needsUpdate = true;
  const group = new THREE.Group();
  group.name = 'static';
  ctx.builders.build(materials, group);
  scene.add(group);
  interiors.finalize();

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
