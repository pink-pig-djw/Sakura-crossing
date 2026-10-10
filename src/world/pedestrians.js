import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin } from '@pixiv/three-vrm';
import { Character, loadAsset, loadMotions } from '../systems/character.js';
import { makePhone, holdPhone } from './residents.js';

// Passers-by: a few people walking the town's streets for company. Four base models (two
// high school uniforms, two women in everyday clothes) dressed differently each time: hair
// repainted, the women's tops and skirts in other colours. They stroll up and down a
// stretch of sidewalk, stop now and then (a look at the sea, a glance at the phone), step
// aside for you, and keep their hours (students on their way to and from school).

const MODELS = {
  student1: 'chars/ped_student1.vrm',
  student2: 'chars/ped_student2.vrm',
  woman1: 'chars/ped_woman1.vrm',
  woman2: 'chars/ped_woman2.vrm',
};

// natural hair colours around the models' own brown
const HAIR = { black: '#262126', dark: '#3d2b23', chestnut: '#6b4029', honey: '#8f6440', ash: '#7c6a62' };

// where they walk: a line along a sidewalk (axis, its coordinate, from a to b), and who
const PEOPLE = [
  { model: 'student1', hair: HAIR.black, route: { axis: 'z', c: 327.8, a: -108, b: -22 }, hours: [7, 18.5], phone: true },
  { model: 'student1', hair: HAIR.chestnut, route: { axis: 'z', c: -35.8, a: -44, b: 15 }, hours: [7, 19] },
  { model: 'student2', hair: HAIR.dark, route: { axis: 'z', c: 246.2, a: -44, b: -20 }, hours: [7, 18.5], phone: true },
  { model: 'student2', hair: null, route: { axis: 'z', c: 194, a: -44, b: 14 }, hours: [7.5, 19] },
  { model: 'woman1', hair: HAIR.black, tops: '#f2c4cc', bottoms: '#2e3a58', route: { axis: 'z', c: 257.8, a: -9, b: 14 }, hours: [6.5, 20.5] },
  { model: 'woman1', hair: HAIR.honey, tops: '#bcd6ea', bottoms: '#d6c6a6', route: { axis: 'z', c: -34.2, a: 14, b: -44 }, hours: [9, 19.5], phone: true },
  { model: 'woman2', hair: HAIR.dark, tops: '#c6d6b4', bottoms: '#46587a', route: { axis: 'x', c: 16, a: 223.5, b: 245.5 }, hours: [6.5, 21] },
  { model: 'woman2', hair: HAIR.ash, tops: '#f4eee2', bottoms: '#2a2a30', route: { axis: 'z', c: 170, a: -44, b: 14 }, hours: [8, 20] },
];

const IDLES = ['idle', 'lookFar', 'sway', 'idle'];
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const _v = new THREE.Vector3();

// A walkable line: points along the route, stepping out sideways (either way) to pass
// whatever stands on the sidewalk; the ends are moved in to clear spots.
function routePath(C, r) {
  const at = (u, off) => (r.axis === 'z' ? [r.c + off, u] : [u, r.c + off]);
  const clear = (u, off) => [-0.3, 0, 0.3].every((d) => {
    const [x, z] = at(u, off + d);
    return !C.solidAt(x, z, C.groundAt(x, z));
  });
  const dir = Math.sign(r.b - r.a);
  let a = r.a, b = r.b;
  while (!clear(a, 0) && (b - a) * dir > 2) a += dir * 0.2;
  while (!clear(b, 0) && (b - a) * dir > 2) b -= dir * 0.2;
  const pts = [at(a, 0)];
  let from = null;
  for (let u = a; (b - u) * dir >= 0; u += dir * 0.2) {
    const blocked = !clear(u, 0);
    if (blocked && from === null) from = u;
    if (!blocked && from !== null) {
      // the narrowest step aside that is clear the whole way past
      const span = (o) => {
        for (let w = from - dir * 0.6; (u + dir * 0.6 - w) * dir >= 0; w += dir * 0.2) if (!clear(w, o)) return false;
        return true;
      };
      const off = [0.8, -0.8, 1.3, -1.3, 1.8, -1.8].find(span);
      if (off !== undefined) pts.push(at(from - dir * 1.1, 0), at(from - dir * 0.3, off), at(u + dir * 0.3, off), at(u + dir * 1.1, 0));
      from = null;
    }
  }
  pts.push(at(b, 0));
  return pts;
}

class Walker {
  constructor(ch, world, spec, path) {
    this.ch = ch;
    this.spec = spec;
    this.path = path;
    const C = world.colliders;
    this.C = C;
    ch.ground = (x, z) => C.groundAt(x, z);
    this.solid = C.addDynamicBox(0.24, 0.24, 0, 99, -99);
    this.rate = 0.86 + Math.random() * 0.16; // a stroll, each at their own pace
    this.phone = spec.phone ? makePhone(spec.model.startsWith('student') ? 0xa8d0f0 : 0xf3e0b0) : null;
    this.lod = 0;
    this.acc = 0;
    this.away = false;
    this.spawnAnywhere();
  }

  // somewhere along the walk, going either way
  spawnAnywhere() {
    const p = this.path;
    const i = Math.floor(Math.random() * (p.length - 1)), t = Math.random();
    this.x = p[i][0] + (p[i + 1][0] - p[i][0]) * t;
    this.z = p[i][1] + (p[i + 1][1] - p[i][1]) * t;
    this.step = Math.random() < 0.5 ? 1 : -1;
    this.wp = this.step > 0 ? i + 1 : i;
    this.heading = Math.atan2(p[this.wp][0] - this.x, p[this.wp][1] - this.z);
    this.nextPause = 20 + Math.random() * 40;
    this.walk();
  }

  walk() {
    this.state = 'walk';
    this.clip = this.phone && Math.random() < 0.45 ? 'walkText' : 'walk';
    this.speed = this.ch.info[this.clip].speed * this.rate;
    this.ch.play(this.clip, 0.4, this.rate);
  }

  pause(secs, clip = IDLES[Math.floor(Math.random() * IDLES.length)]) {
    this.state = 'pause';
    this.timer = secs;
    this.ch.play(this.phone && Math.random() < 0.4 ? 'phone' : clip, 0.5);
  }

  setAway(away) {
    this.away = away;
    this.ch.root.visible = !away;
    this.solid.off = away;
    if (this.phone) this.phone.visible = false;
  }

  update(dt, player, cam, hour) {
    const [h0, h1] = this.spec.hours;
    const out = hour >= h0 && hour < h1;
    const dc = Math.hypot(cam.x - this.x, cam.z - this.z);
    // they come and go out of sight
    if (!out && !this.away && dc > 45) this.setAway(true);
    if (out && this.away && dc > 45) {
      this.setAway(false);
      this.spawnAnywhere();
    }
    if (this.away) return;

    // you, in the way: wait (and look at you) until you pass
    let dP = 99, ahead = false;
    if (player) {
      dP = Math.hypot(player.pos.x - this.x, player.pos.z - this.z);
      ahead = dP < 1.4 && Math.abs(wrap(Math.atan2(player.pos.x - this.x, player.pos.z - this.z) - this.heading)) < 0.9;
    }
    this.nextPause -= dt;
    switch (this.state) {
      case 'walk': {
        if (ahead) {
          this.state = 'yield';
          this.timer = 0.6;
          this.waited = 0;
          this.ch.play('idle', 0.3);
          break;
        }
        const [tx, tz] = this.path[this.wp];
        const dx = tx - this.x, dz = tz - this.z, d = Math.hypot(dx, dz);
        if (d < 0.25) {
          const next = this.wp + this.step;
          if (next < 0 || next >= this.path.length) {
            // the end of the walk: a look round, then back the other way
            this.step = -this.step;
            this.wp += this.step;
            this.pause(2 + Math.random() * 3, Math.random() < 0.5 ? 'lookFar' : 'idle');
          } else this.wp = next;
          break;
        }
        if (this.nextPause <= 0) {
          this.nextPause = 25 + Math.random() * 45;
          this.pause(3 + Math.random() * 3);
          break;
        }
        const want = Math.atan2(dx, dz);
        const turn = wrap(want - this.heading);
        this.heading = wrap(this.heading + Math.sign(turn) * Math.min(Math.abs(turn), 3.2 * dt));
        // slow down through a sharp turn
        const s = Math.min(d, this.speed * dt * (Math.abs(turn) > 0.9 ? 0.4 : 1));
        this.x += (dx / d) * s;
        this.z += (dz / d) * s;
        break;
      }
      case 'yield':
        this.timer = ahead ? 0.6 : this.timer - dt;
        this.waited += dt;
        // you are not moving: she goes back the way she came
        if (this.waited > 4 && ahead) {
          this.step = -this.step;
          this.wp = Math.max(0, Math.min(this.path.length - 1, this.wp + this.step));
          this.pause(1.4, 'idle');
          break;
        }
        if (this.timer <= 0) this.walk();
        break;
      case 'pause': {
        this.timer -= dt;
        // turning to face the way on
        const [tx, tz] = this.path[this.wp];
        const turn = wrap(Math.atan2(tx - this.x, tz - this.z) - this.heading);
        if (this.timer < 1.2) this.heading = wrap(this.heading + Math.sign(turn) * Math.min(Math.abs(turn), 2.4 * dt));
        if (this.timer <= 0) this.walk();
        break;
      }
    }

    // where they stand, and what you bump into
    const y = this.C.groundAt(this.x, this.z);
    const ch = this.ch;
    ch.root.position.set(this.x, y, this.z);
    ch.root.rotation.set(0, this.heading, 0);
    this.solid.cx = this.x;
    this.solid.cz = this.z;
    this.solid.yTop = y + 1.5;
    this.solid.yBottom = y - 0.5;

    // drawn and animated near the camera only; further off, every few frames
    const shown = dc < 100;
    ch.root.visible = shown;
    if (!shown) {
      if (this.phone) this.phone.visible = false;
      return;
    }
    if (player && dP < 3.5) {
      ch.root.updateMatrixWorld();
      ch.lookAt(_v.set(player.head.x, player.head.y, player.head.z), 0.7);
    } else ch.lookAt(null);
    const every = dc < 30 ? 1 : dc < 60 ? 2 : 4;
    this.acc += dt;
    if (++this.lod % every === 0) {
      ch.update(this.acc);
      this.acc = 0;
      if (this.phone) holdPhone(ch, this.phone);
    }
  }
}

export async function createPedestrians(world, scene) {
  const loader = new GLTFLoader();
  loader.register((parser) => new VRMLoaderPlugin(parser));
  const motions = await loadMotions('chars/motions.json');
  const bufs = new Map();
  const list = [];
  const api = {
    list,
    update(dt, player, cam, hour) {
      for (const w of list) w.update(dt, player, cam, hour);
    },
  };
  // one at a time, so the walk does not stutter while they arrive
  (async () => {
    for (const spec of PEOPLE) {
      const file = MODELS[spec.model];
      if (!bufs.has(file)) bufs.set(file, loadAsset(file));
      const gltf = await loader.parseAsync(await bufs.get(file), '');
      const paint = { HAIR: spec.hair, Tops: spec.tops, Bottoms: spec.bottoms };
      const recolor = (name) => {
        for (const [k, c] of Object.entries(paint)) if (c && name.includes(k)) return new THREE.Color(c);
        return null;
      };
      const ch = new Character(gltf, motions, { name: 'passerby', recolor });
      const path = routePath(world.colliders, spec.route);
      const w = new Walker(ch, world, spec, path);
      scene.add(ch.root);
      if (w.phone) scene.add(w.phone);
      list.push(w);
      await new Promise((r) => setTimeout(r, 300));
    }
  })().catch((e) => console.warn('passers-by not loaded:', e));
  return api;
}
