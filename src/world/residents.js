import * as THREE from 'three';
import { loadCharacter } from '../systems/character.js';

// 春香 (Haruka): a resident who walks up and down the sidewalk of 桜坂 every morning.
// She notices you when you come near, turns and looks at you, bows and says hello, chats
// when you talk to her (nodding, or pointing the way to the sea) and waves when you leave.

const TALK = [
  { line: 'hr_weather', clip: 'nod' },
  { line: 'hr_walk', clip: 'nod' },
  // the gesture points to her left: facing west, that is down the slope toward the sea
  { line: 'hr_sea', clip: 'guide', face: -Math.PI / 2 },
];

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export class Resident {
  constructor(ch, world, voice, o) {
    this.ch = ch;
    this.world = world;
    this.voice = voice;
    this.path = o.path; // [[x, z], ...] walked back and forth
    this.wp = 1;
    this.step = 1;
    this.x = o.path[0][0];
    this.z = o.path[0][1];
    this.heading = Math.atan2(o.path[1][0] - this.x, o.path[1][1] - this.z);
    this.state = 'walk';
    this.timer = 0;
    this.greeted = false;
    this.waved = false;
    this.talkIdx = 0;
    this.meter = { node: null, until: 0 };
    this.buf = new Float32Array(512);
    const C = world.colliders;
    this.ground = (x, z) => C.groundAt(x, z);
    ch.ground = this.ground;
    this.solid = C.addDynamicBox(0.26, 0.26, 0, 99, -99);
    this.solid.off = false;
    this.interact = { kind: 'resident', label: '春香に話しかける', x: this.x, z: this.z, y: 0, r: 2.0, resident: this };
    world.interactables.push(this.interact);
    this.walkSpeed = ch.info.walk.speed;
    ch.play('walk', 0);
    this.place();
  }

  place() {
    const y = this.ground(this.x, this.z);
    this.ch.root.position.set(this.x, y, this.z);
    this.ch.root.rotation.set(0, this.heading, 0);
    this.solid.cx = this.x;
    this.solid.cz = this.z;
    this.solid.yTop = y + 1.6;
    this.solid.yBottom = y - 0.5;
    this.interact.x = this.x;
    this.interact.z = this.z;
    this.interact.y = y;
  }

  say(id, clip) {
    this.voice?.play(id, { channel: 'resident', interrupt: true, at: { x: this.x, y: this.ground(this.x, this.z) + 1.45, z: this.z }, ref: 3, meter: this.meter });
    if (clip) this.act(clip);
  }

  act(clip) {
    this.state = 'act';
    this.ch.play(clip, 0.35);
  }

  // E pressed while she is focused
  talk() {
    const t = TALK[this.talkIdx++ % TALK.length];
    this.greeted = true;
    this.ch.setMood(0.45);
    if (t.face !== undefined) this.faceTo = t.face;
    this.say(t.line, t.clip);
  }

  turnToward(target, rate, dt) {
    const d = wrap(target - this.heading);
    const step = Math.sign(d) * Math.min(Math.abs(d), rate * dt);
    this.heading = wrap(this.heading + step);
    return Math.abs(d);
  }

  // player: { pos: Vector3 (feet), head: Vector3 } or null (title screen)
  update(dt, player) {
    const ch = this.ch;
    let dP = 99, toP = 0, rel = 0;
    if (player) {
      dP = Math.hypot(player.pos.x - this.x, player.pos.z - this.z);
      toP = Math.atan2(player.pos.x - this.x, player.pos.z - this.z);
      rel = wrap(toP - this.heading);
    }
    const near = dP < 8 && (Math.abs(rel) < 1.7 || dP < 3.2);
    if (dP > 14) {
      this.greeted = false;
      this.waved = false;
    }

    switch (this.state) {
      case 'walk': {
        if (near) {
          this.state = 'attend';
          ch.play('idle', 0.5);
          break;
        }
        const [tx, tz] = this.path[this.wp];
        const dx = tx - this.x, dz = tz - this.z;
        const dist = Math.hypot(dx, dz);
        const end = this.wp === 0 || this.wp === this.path.length - 1;
        if (!end && dist < 0.6) {
          this.wp += this.step; // passing point of a detour
          break;
        }
        if (dist < 0.35) {
          this.state = 'pause';
          this.timer = 2.5 + Math.random() * 2.5;
          this.step = this.wp === 0 ? 1 : -1;
          this.wp += this.step;
          ch.play('idle', 0.6);
          // looks up at the blossoms for a moment
          this.gaze = new THREE.Vector3(this.x + Math.sin(this.heading) * 3, this.ground(this.x, this.z) + 4.5, this.z + Math.cos(this.heading) * 3);
          break;
        }
        const err = this.turnToward(Math.atan2(dx, dz), 1.8, dt);
        const v = this.walkSpeed * Math.max(0.15, Math.cos(Math.min(err, 1.5)));
        ch.play('walk', 0.45, v / this.walkSpeed);
        this.x += Math.sin(this.heading) * v * dt;
        this.z += Math.cos(this.heading) * v * dt;
        break;
      }
      case 'pause': {
        this.timer -= dt;
        if (near) {
          this.state = 'attend';
          break;
        }
        if (this.timer <= 0) {
          this.gaze = null;
          // turn toward the next point on the spot before walking off
          const [tx, tz] = this.path[this.wp];
          const err = this.turnToward(Math.atan2(tx - this.x, tz - this.z), 2.2, dt);
          ch.play(err > 0.3 ? 'walk' : 'idle', 0.4, 0.7);
          if (err < 0.3) this.state = 'walk';
        }
        break;
      }
      case 'attend': {
        if (dP > 9) {
          // waves goodbye when you walk off after saying hello
          if (this.greeted && !this.waved) {
            this.waved = true;
            this.say('hr_bye', 'wave');
            break;
          }
          this.state = 'walk';
          this.ch.setMood(0);
          break;
        }
        const err = this.turnToward(toP, 1.7, dt);
        ch.play(err > 0.55 ? 'walk' : 'idle', 0.4, 0.7);
        if (!this.greeted && dP < 3.4 && err < 0.5) {
          this.greeted = true;
          this.ch.setMood(0.7);
          this.say('hr_hello', 'bow');
        }
        break;
      }
      case 'act': {
        if (this.faceTo !== undefined) this.turnToward(this.faceTo, 1.2, dt);
        if (ch.remaining() < 0.3) {
          this.faceTo = undefined;
          this.state = dP < 9 ? 'attend' : 'walk';
          ch.setMood(dP < 9 ? 0.25 : 0);
          ch.play(this.state === 'walk' ? 'walk' : 'idle', 0.5);
        }
        break;
      }
    }

    // look at you while you are close (not while bowing low), otherwise at what she passes
    const looking = player && dP < 9 && !(this.state === 'act' && ch.currentName === 'bow');
    if (looking) ch.lookAt(player.head, 1);
    else if (this.gaze) ch.lookAt(this.gaze, 0.8);
    else ch.lookAt(null);

    // lip sync from the voice level
    let mouth = 0;
    const m = this.meter;
    if (m.node && this.voice?.audio?.ctx && this.voice.audio.ctx.currentTime < m.until) {
      m.node.getFloatTimeDomainData(this.buf);
      let s = 0;
      for (let i = 0; i < this.buf.length; i++) s += this.buf[i] * this.buf[i];
      mouth = Math.min(0.85, Math.sqrt(s / this.buf.length) * 9);
    }
    ch.mouth += (mouth - ch.mouth) * Math.min(1, dt * 18);

    this.place();
    ch.update(dt);
  }
}

// Her walk: down the middle of the east sidewalk of 桜坂, stepping out toward the curb to pass
// the street trees (and anything else standing on the sidewalk), between two ends that are
// clear of obstacles.
function sidewalkPath(world) {
  const C = world.colliders;
  const xc = 34.3, xs = 33.4; // sidewalk middle, side lane by the curb
  const clear = (x, z) => [-0.3, 0, 0.3].every((dx) => !C.solidAt(x + dx, z, C.groundAt(x, z)));
  // ends: the nearest clear spots to the wanted range
  let z1 = 4, z0 = -26;
  while (!clear(xc, z1) && z1 > 0) z1 -= 0.2;
  while (!clear(xc, z0) && z0 < -20) z0 += 0.2;
  const pts = [[xc, z1]];
  let blockedFrom = null;
  for (let z = z1; z >= z0; z -= 0.2) {
    const b = !clear(xc, z);
    if (b && blockedFrom === null) blockedFrom = z;
    if (!b && blockedFrom !== null) {
      // detour around [z, blockedFrom] by the side lane
      pts.push([xc, blockedFrom + 1.3], [xs, blockedFrom + 0.35], [xs, z - 0.35], [xc, z - 1.3]);
      blockedFrom = null;
    }
  }
  pts.push([xc, z0]);
  return pts;
}

export async function createResidents(world, scene, { voice } = {}) {
  const ch = await loadCharacter('chars/resident.vrm', 'chars/motions.json', { name: 'haruka' });
  scene.add(ch.root);
  const r = new Resident(ch, world, voice, { path: sidewalkPath(world) });
  return {
    list: [r],
    update(dt, player) {
      for (const p of this.list) p.update(dt, player);
    },
  };
}
