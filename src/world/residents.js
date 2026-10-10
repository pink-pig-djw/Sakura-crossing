import * as THREE from 'three';
import { loadCharacter } from '../systems/character.js';
import { createCharacterMaterial } from '../render/materials.js';
import { VOICE_LINES } from '../systems/voiceLines.js';

// 芽衣 (Mei), a second-year at 桜ヶ浜高校, out on 桜坂 from early morning until dusk.
//
// Her day: she strolls up and down the east sidewalk under the cherry trees, sometimes
// reading her phone as she goes; at the ends of her walk she stops for a while (checks her
// phone, shades her eyes to look out to sea, looks back, shifts her weight, stretches, yawns
// in the early morning, looks up at the blossoms) and now and then sits on the bench by the
// garden wall, swinging her feet.
// With you: she notices you, turns, looks at you and bows the first time you meet (later
// she raises a hand), chats when you talk to her (with gestures: glancing away shyly,
// pointing the way to the sea, slumping at the thought of a math test, nodding along, a hand
// on her heart), jumps if you run into her and waves goodbye when you leave.
// After dark she has gone home; she is back in the morning.

const HOURS = [6.5, 19]; // out on the street

// talk topics in order (the introduction once); face: heading to turn to for the gesture,
// gaze: what she looks at while saying it; mood: [happy, relaxed, sad]
const TALK = [
  { line: 'mei_intro', clip: 'lookAway', mood: [0.5], once: true }, // a shy glance away
  { line: 'mei_sakura', gaze: 'blossoms', mood: [0.75] },
  { line: 'mei_club', clip: 'happy', mood: [0.85] },
  // the point is to her front right: facing a little east of south, it points down the slope
  { line: 'mei_sea', clip: 'point', face: 0.31, gaze: 'sea', mood: [0.45] },
  { line: 'mei_test', clip: 'disappointed', mood: [0, 0.1, 0.6] }, // shoulders drop: math...
  { line: 'mei_shrine', clip: 'agree', mood: [0.45] },
  { line: 'mei_sento', clip: 'acknowledge', mood: [0.6] },
  { line: 'mei_shy', clip: 'thank', mood: [0.9] }, // a hand on her heart: glad you talked to her
];

// what she does when she stops at the end of her walk: [action, weight(hour)]
// seaward: she stopped facing down the slope, toward the sea
const AMBIENT = [
  ['idle', () => 2.5],
  ['phone', () => 3],
  ['blossoms', () => 2],
  ['lookFar', (h, seaward) => (seaward ? 5 : 0)], // a hand shading her eyes, looking out to sea
  ['lookBehind', () => 1],
  ['sway', () => 1.5],
  ['stretch', (h) => (h < 11 ? 2 : 0.6)],
  ['yawn', (h) => (h < 9.5 ? 2.5 : 0.3)],
  ['bored', (h) => (h > 15 ? 1.5 : 0.6)],
];

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _e = new THREE.Vector3();
const _m = new THREE.Matrix4();
// the phone held in one hand: its middle this far from the wrist along the fingers, toward the
// thumb and off the palm, its long side turned this far (rad) from the fingers toward the thumb
const PALM = { fingers: 0.055, thumb: 0.035, out: 0.025, lean: 1.15 };

// a phone in a pink case, held while she texts or reads (see holdPhone)
export function makePhone(color = 0xf3b9c9) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.01, 0.148), createCharacterMaterial({ name: 'char:phone', color, shadeMix: 0.5, outline: 0.6 }));
  const screen = new THREE.Mesh(new THREE.BoxGeometry(0.064, 0.002, 0.134), createCharacterMaterial({ name: 'char:phoneScreen', color: 0x9cc4e4, unlit: 0.85, outline: 0 }));
  screen.position.y = 0.0055;
  g.add(body, screen);
  g.matrixAutoUpdate = false;
  g.visible = false;
  return g;
}

export class Resident {
  constructor(ch, world, voice, o) {
    this.ch = ch;
    this.world = world;
    this.voice = voice;
    this.path = o.path; // [[x, z], ...] walked back and forth
    this.bench = o.bench; // { x, y, z, ry, it } or null
    const C = world.colliders;
    this.ground = (x, z) => C.groundAt(x, z);
    ch.ground = this.ground;
    this.solid = C.addDynamicBox(0.26, 0.26, 0, 99, -99);
    this.solid.off = false;
    this.interact = { kind: 'resident', label: '芽衣に話しかける', x: 0, z: 0, y: 0, r: 2.0, resident: this };
    world.interactables.push(this.interact);
    this.walkRate = 1; // the clip is a stroll
    this.setWalk('walk');
    this.phone = makePhone();
    this.meter = { node: null, until: 0 };
    this.buf = new Float32Array(512);
    this.talkIdx = 0;
    this.met = false; // has bowed to you once: later meetings start with a wave
    this.greeted = false;
    this.waved = false;
    this.lastD = null;
    this.vP = 0;
    this.startleCool = 0;
    this.benchCool = 20;
    this.attendT = 0;
    this.ignore = false;
    this.home = false;
    this.spawn(0);
  }

  // her walk: 'walk', or 'walkText' (looking at her phone as she goes)
  setWalk(clip) {
    this.walkClip = clip;
    this.walkSpeed = this.ch.info[clip].speed * this.walkRate;
  }

  // at one end of her walk, setting off along it
  spawn(end) {
    const p = this.path;
    this.wp = end === 0 ? 1 : p.length - 2;
    this.step = end === 0 ? 1 : -1;
    [this.x, this.z] = p[end];
    this.heading = Math.atan2(p[this.wp][0] - this.x, p[this.wp][1] - this.z);
    this.state = 'walk';
    this.leaveBench();
    this.setWalk('walk');
    this.ch.play('walk', 0, this.walkRate);
    this.place();
  }

  setHome(home) {
    this.home = home;
    this.ch.root.visible = !home;
    this.solid.off = home;
    this.interact.r = home ? 0 : 2.0;
    this.phone.visible = false;
    if (home) this.leaveBench();
  }

  place() {
    const ch = this.ch;
    const y = this.ground(this.x, this.z);
    ch.root.position.set(this.x, y, this.z);
    ch.root.rotation.set(0, this.heading, 0);
    // her body (what you bump into and talk to) is where the hips are: on the seat when sitting
    let bx = this.x, bz = this.z;
    if (this.benchSit) {
      ch.root.updateMatrixWorld(true);
      ch.node('hips').getWorldPosition(_a);
      bx = _a.x;
      bz = _a.z;
    }
    this.solid.cx = bx;
    this.solid.cz = bz;
    this.solid.yTop = y + 1.5;
    this.solid.yBottom = y - 0.5;
    this.interact.x = bx;
    this.interact.z = bz;
    this.interact.y = y;
  }

  // speaks a line from her head; returns its length (s)
  say(id) {
    this.ch.root.updateMatrixWorld(true);
    this.ch.node('head').getWorldPosition(_a);
    this.voice?.play(id, { channel: 'resident', interrupt: true, at: { x: _a.x, y: _a.y, z: _a.z }, ref: 3, meter: this.meter });
    return VOICE_LINES[id]?.dur || 3;
  }

  // a gesture (clip, or none) lasting at least `secs`; `full`: the clip plays out to its end
  act(clip, secs = 0, full = false) {
    this.state = 'act';
    this.actClip = clip;
    this.actT = 0;
    this.actMin = full && clip ? Math.max(secs, this.ch.clips[clip].duration * (this.ch.info[clip].reps || 1) - 0.3) : secs;
    if (clip) this.ch.play(clip, 0.35);
  }

  // E pressed while she is focused
  talk() {
    if (this.home || this.state === 'sitDown' || this.state === 'standUp') return;
    let t = TALK[this.talkIdx % TALK.length];
    if (t.once && this.talkedIntro) t = TALK[++this.talkIdx % TALK.length];
    if (t.once) this.talkedIntro = true;
    this.talkIdx = this.talkIdx + 1 >= TALK.length ? 1 : this.talkIdx + 1;
    this.greeted = this.met = true;
    this.ignore = false;
    this.attendT = 0;
    this.sinceTalk = 0;
    const [happy = 0, relaxed = 0.25, sad = 0] = t.mood;
    this.ch.setMood(happy, relaxed, sad);
    const dur = this.say(t.line);
    this.gazeKind = t.gaze || null;
    this.gazeT = t.gaze ? Math.min(2.4, dur * 0.6) : 0;
    if (this.seated) {
      // sitting: just the words and her face
      this.resumeAfter = 'sit';
      this.act(null, dur + 0.3);
      return;
    }
    if (this.state === 'toBench') this.benchCool = 60;
    this.faceTo = t.face;
    this.act(t.clip || null, dur + 0.4);
  }

  turnToward(target, rate, dt) {
    const d = wrap(target - this.heading);
    const step = Math.sign(d) * Math.min(Math.abs(d), rate * dt);
    this.heading = wrap(this.heading + step);
    return Math.abs(d);
  }

  pickAmbient(hour) {
    const seaward = Math.cos(this.heading) > 0.7;
    const w = AMBIENT.map(([, f]) => f(hour, seaward));
    let r = Math.random() * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < w.length; i++) if ((r -= w[i]) <= 0) return AMBIENT[i][0];
    return 'idle';
  }

  startPause(hour) {
    const a = this.pickAmbient(hour);
    this.state = 'pause';
    this.gaze = null;
    if (a === 'idle' || a === 'blossoms') {
      this.ch.play('idle', 0.6);
      this.timer = 3 + Math.random() * 3;
      if (a === 'blossoms') this.gaze = new THREE.Vector3(this.x + Math.sin(this.heading) * 2.5, this.ground(this.x, this.z) + 4.6, this.z + Math.cos(this.heading) * 2.5);
    } else {
      this.ch.play(a, 0.6);
      this.timer = this.ch.clips[a].duration - 0.4;
      if (a === 'yawn') this.ch.setMood(0, 0.6);
    }
  }

  // ---------------------------------------------------------------- the bench
  // her place: the half of the bench toward +z, hips a little in front of the backrest; she
  // stands in front of it facing away, and sitting down takes her hips back onto it
  benchSeat() {
    const B = this.bench;
    const fx = -Math.sin(B.ry), fz = -Math.cos(B.ry); // the way the seat faces
    const sx = B.x + fx * 0.06, sz = B.z + fz * 0.06 + 0.42;
    const back = this.ch.sitBack;
    return { x: sx + fx * back, z: sz + fz * back, heading: Math.atan2(fx, fz) };
  }

  benchFree(player) {
    const it = this.bench.it;
    if (player?.sitting && player.sitting === it.sit) return false;
    return !player || Math.hypot(player.pos.x - this.bench.x, player.pos.z - this.bench.z) > 1.6;
  }

  takeBench() {
    const it = this.bench.it;
    this.benchSit = it.sit;
    // you can still sit down: on the other half, next to her
    it.sit = { ...it.sit, z: it.sit.z - 0.45 };
  }

  leaveBench() {
    if (this.benchSit) this.bench.it.sit = this.benchSit;
    this.benchSit = null;
    this.seated = false;
    this.ch.seat = null;
  }

  // ---------------------------------------------------------------- update
  // player: { pos, head, sitting } or null (title screen); hour: time of day
  update(dt, player, hour = 10) {
    const ch = this.ch;
    // her day: out between HOURS; she comes and goes while you are not near
    const out = hour >= HOURS[0] && hour < HOURS[1];
    const far = !player || Math.hypot(player.pos.x - this.x, player.pos.z - this.z) > 30;
    if (!out && !this.home && far) this.setHome(true);
    if (out && this.home && far) {
      this.setHome(false);
      this.spawn(Math.random() < 0.5 ? 0 : this.path.length - 1);
    }
    if (this.home) return;

    let dP = 99, toP = 0, rel = 0;
    if (player) {
      dP = Math.hypot(player.pos.x - this.x, player.pos.z - this.z);
      if (this.benchSit) dP = Math.hypot(player.pos.x - this.interact.x, player.pos.z - this.interact.z);
      toP = Math.atan2(player.pos.x - this.x, player.pos.z - this.z);
      rel = wrap(toP - this.heading);
      // how fast you are closing in
      if (this.lastD !== null) this.vP += ((this.lastD - dP) / Math.max(dt, 1e-3) - this.vP) * Math.min(1, dt * 10);
      this.lastD = dP;
    }
    const reading = this.state === 'walk' && this.walkClip === 'walkText';
    const near = !this.ignore && (reading ? dP < 2.6 : dP < 8 && (Math.abs(rel) < 1.7 || dP < 3.2));
    if (dP > 14) {
      this.greeted = false;
      this.waved = false;
    }
    if (dP > 10) this.ignore = false;
    this.startleCool -= dt;
    this.benchCool -= dt;
    this.sinceTalk = (this.sinceTalk ?? 99) + dt;
    this.gazeT = Math.max(0, (this.gazeT || 0) - dt);

    // startled: you ran into her
    if (player && this.startleCool <= 0 && dP < 0.8 && this.vP > 2.2 && this.state !== 'sitDown' && this.state !== 'standUp') {
      this.startleCool = 15;
      this.greeted = this.met = true;
      ch.setMood(0, 0, 0, 1);
      const dur = this.say('mei_startle');
      if (this.seated) {
        this.resumeAfter = 'sit';
        this.act(null, dur);
      } else {
        this.heading += THREE.MathUtils.clamp(rel, -0.6, 0.6) * 0.5;
        this.act('startle', dur, true);
      }
      this.after = () => ch.setMood(0.2);
    }

    switch (this.state) {
      case 'walk': {
        if (near) {
          // (she puts her phone away)
          this.setWalk('walk');
          this.state = 'attend';
          this.attendT = 0;
          ch.play('idle', 0.5);
          break;
        }
        const [tx, tz] = this.path[this.wp];
        const dx = tx - this.x, dz = tz - this.z;
        const dist = Math.hypot(dx, dz);
        const end = this.wp === 0 || this.wp === this.path.length - 1;
        // the bench: passing it, now and then she sits down for a while
        if (this.bench && this.benchCool <= 0 && hour < HOURS[1] - 0.3) {
          const s = this.benchSeat();
          if (Math.hypot(s.x - this.x, s.z - this.z) < 2) {
            this.benchCool = 90;
            if (Math.random() < 0.6 && this.benchFree(player)) {
              this.setWalk('walk');
              this.state = 'toBench';
              break;
            }
          }
        }
        if (!end && dist < 0.6) {
          this.wp += this.step; // passing point of a detour
          break;
        }
        if (dist < 0.35) {
          this.step = this.wp === 0 ? 1 : -1;
          this.wp += this.step;
          this.startPause(hour);
          break;
        }
        // someone standing in her way: wait
        if (player && dP < 1.1 && Math.abs(rel) < 0.7) {
          ch.play('idle', 0.4);
          break;
        }
        const err = this.turnToward(Math.atan2(dx, dz), 1.8, dt);
        const v = this.walkSpeed * Math.max(0.15, Math.cos(Math.min(err, 1.5)));
        ch.play(this.walkClip, 0.45, this.walkRate * (v / this.walkSpeed));
        this.x += Math.sin(this.heading) * v * dt;
        this.z += Math.cos(this.heading) * v * dt;
        break;
      }
      case 'pause': {
        this.timer -= dt;
        if (near) {
          this.gaze = null;
          ch.setMood(0);
          this.state = 'attend';
          this.attendT = 0;
          ch.play('idle', 0.5);
          break;
        }
        if (this.timer <= 0) {
          this.gaze = null;
          ch.setMood(0);
          // turn toward the next point on the spot before walking off
          const [tx, tz] = this.path[this.wp];
          const err = this.turnToward(Math.atan2(tx - this.x, tz - this.z), 2.2, dt);
          ch.play(err > 0.3 ? 'walk' : 'idle', 0.4, 0.6);
          if (err < 0.3) {
            this.state = 'walk';
            // now and then she reads her phone as she walks on
            this.setWalk(Math.random() < 0.3 ? 'walkText' : 'walk');
          }
        }
        break;
      }
      case 'toBench': {
        const s = this.benchSeat();
        const dx = s.x - this.x, dz = s.z - this.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 0.04) {
          this.turnToward(Math.atan2(dx, dz), 2.4, dt);
          const v = Math.min(this.walkSpeed * 0.8, dist * 3);
          ch.play('walk', 0.4, this.walkRate * 0.8);
          this.x += (dx / dist) * Math.min(dist, v * dt);
          this.z += (dz / dist) * Math.min(dist, v * dt);
          break;
        }
        // back to the bench, then sit
        ch.play('idle', 0.4);
        if (this.turnToward(s.heading, 2.6, dt) < 0.03) {
          this.heading = s.heading;
          this.takeBench();
          // the clip's seat is lower than the bench: the hips rise onto it
          ch.seat = { lift: Math.max(0, this.bench.y + SEAT_TOP + HIPS_OVER_SEAT - this.ground(this.x, this.z) - ch.sitHips) };
          ch.play('sitDown', 0.3);
          this.state = 'sitDown';
        }
        break;
      }
      case 'sitDown': {
        if (ch.remaining() < 0.25) {
          this.seated = true;
          ch.play('sit', 0.3);
          this.state = 'sit';
          this.timer = 18 + Math.random() * 20;
        }
        break;
      }
      case 'sit': {
        this.timer -= dt;
        // now and then she swings her feet
        this.fidgetT = (this.fidgetT ?? 4) - dt;
        if (this.fidgetT <= 0) {
          const fidget = ch.currentName !== 'sitFidget' && Math.random() < 0.6;
          ch.play(fidget ? 'sitFidget' : 'sit', 0.5);
          this.fidgetT = fidget ? 3 + Math.random() * 3 : 4 + Math.random() * 5;
        }
        // looks at you while you are around, says hello, and goodbye when you go
        if (player && dP < 6 && !this.greeted) {
          this.greeted = this.met = true;
          ch.setMood(0.7);
          this.resumeAfter = 'sit';
          this.act(null, this.say('mei_hello'));
          break;
        }
        if (player && this.greeted && !this.waved && dP > 9) {
          this.waved = true;
          ch.setMood(0.5);
          this.resumeAfter = 'sit';
          this.act(null, this.say('mei_bye'));
          break;
        }
        // stays while you sit beside her, or while you are chatting
        const beside = player?.sitting && player.sitting === this.bench.it.sit;
        const chatting = dP < 4 && this.sinceTalk < 15;
        if (this.timer <= 0 && !beside && !chatting) {
          ch.play('standUp', 0.3);
          this.state = 'standUp';
          this.seated = false;
          ch.setMood(0);
        }
        break;
      }
      case 'standUp': {
        if (ch.remaining() < 0.3) {
          // the clip ends standing about where she started: back on the path
          this.leaveBench();
          this.setWalk('walk');
          ch.play('walk', 0.4, this.walkRate);
          this.state = 'walk';
        }
        break;
      }
      case 'attend': {
        this.attendT += dt;
        if (dP > 9 || (this.attendT > 25 && this.greeted)) {
          // waves goodbye when you walk off after saying hello
          if (dP > 9 && this.greeted && !this.waved) {
            this.waved = true;
            ch.setMood(0.6);
            this.act('wave', this.say('mei_bye'), true);
            break;
          }
          // you just stand there: she carries on with her walk
          if (dP <= 9) this.ignore = true;
          this.state = 'walk';
          ch.setMood(0);
          break;
        }
        const err = this.turnToward(toP, 1.7, dt);
        ch.play(err > 0.55 ? 'walk' : 'idle', 0.4, 0.6);
        if (!this.greeted && dP < 3.4 && err < 0.5) {
          this.greeted = true;
          ch.setMood(0.7);
          const first = !this.met;
          this.met = true;
          // a bow the first time; later a raised hand
          this.act(first ? 'bow' : 'greet', this.say(first ? 'mei_hello' : 'mei_again'), true);
        }
        break;
      }
      case 'act': {
        this.actT += dt;
        if (this.faceTo !== undefined) this.turnToward(this.faceTo, 1.4, dt);
        if (this.actT >= this.actMin) {
          this.faceTo = undefined;
          this.after?.();
          this.after = null;
          if (this.resumeAfter === 'sit') {
            this.resumeAfter = null;
            this.state = 'sit';
            break;
          }
          this.state = dP < 9 ? 'attend' : 'walk';
          this.attendT = 0;
          ch.setMood(dP < 9 ? 0.25 : 0);
          ch.play(this.state === 'walk' ? 'walk' : 'idle', 0.5, this.state === 'walk' ? this.walkRate : 1);
        }
        break;
      }
    }

    // where she looks: at you while you are close (not while bowing low or jumping), at what
    // she talks about, or at what caught her eye
    let gazeAt = null;
    if (this.gazeT > 0 && this.gazeKind) {
      const y = this.ground(this.x, this.z);
      gazeAt = this.gazeKind === 'sea' ? _e.set(this.x + 2, y + 1.0, this.z + 30) : _e.set(this.x + Math.sin(this.heading) * 2, y + 4.8, this.z + Math.cos(this.heading) * 2);
    }
    const busy = this.state === 'act' && (this.actClip === 'bow' || this.actClip === 'startle');
    if (gazeAt) ch.lookAt(gazeAt, 0.9);
    else if (player && dP < 9 && !busy && this.state !== 'pause') ch.lookAt(player.head, 1);
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
    this.updatePhone();
  }

  updatePhone() {
    holdPhone(this.ch, this.phone);
  }
}

// the phone sits between her palms while she texts (once both hands are up), or in the palm
// of the one hand that faces up (she reads it holding it in one hand as she walks)
export function holdPhone(ch, phone) {
  let on = (ch.currentName === 'phone' && ch.remaining() > 0.4) || ch.currentName === 'walkText';
  if (on) {
    const L = ch.node('leftHand'), R = ch.node('rightHand');
    L.getWorldPosition(_a);
    R.getWorldPosition(_b);
    const fl = _c.set(1, 0, 0).transformDirection(L.matrixWorld);
    const fr = _d.set(-1, 0, 0).transformDirection(R.matrixWorld);
    _a.addScaledVector(fl, 0.065);
    _b.addScaledVector(fr, 0.065);
    const both = _a.distanceTo(_b) < 0.2 && fl.y > -0.55 && fr.y > -0.55;
    if (both) {
      const across = _e.copy(_a).sub(_b).normalize();
      const fwd = fl.add(fr).normalize();
      fwd.addScaledVector(across, -fwd.dot(across)).normalize();
      const up = _d.crossVectors(fwd, across).normalize();
      if (up.y < 0) {
        up.negate();
        across.negate();
      }
      _m.makeBasis(across, up, fwd);
      _m.setPosition(_a.add(_b).multiplyScalar(0.5).addScaledVector(up, 0.012));
    } else {
      // the palm (the hand's -Y) facing up the most
      let hand = null, side = 0, best = 0.35;
      for (const [h, sx] of [[L, 1], [R, -1]]) {
        const n = _c.set(0, -1, 0).transformDirection(h.matrixWorld).y;
        if (n > best) [hand, side, best] = [h, sx, n];
      }
      on = !!hand;
      if (on) {
        // held upright: its long side leans from the fingers toward the thumb (the hand's +Z)
        const up = _c.set(0, -1, 0).transformDirection(hand.matrixWorld);
        const fingers = _d.set(side, 0, 0).transformDirection(hand.matrixWorld);
        const thumb = _b.set(0, 0, 1).transformDirection(hand.matrixWorld);
        hand.getWorldPosition(_a).addScaledVector(fingers, PALM.fingers).addScaledVector(thumb, PALM.thumb).addScaledVector(up, PALM.out);
        const fwd = fingers.multiplyScalar(Math.cos(PALM.lean)).addScaledVector(thumb, Math.sin(PALM.lean)).normalize();
        _m.makeBasis(_e.crossVectors(up, fwd).normalize(), up, fwd);
        _m.setPosition(_a);
      }
    }
    if (on) {
      phone.matrix.copy(_m);
      phone.matrixWorldNeedsUpdate = true;
    }
  }
  phone.visible = on;
}

// the bench seat (top of the slats) above its feet, and her hips above a seat
const SEAT_TOP = 0.47;
const HIPS_OVER_SEAT = 0.1;

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
  const ch = await loadCharacter('chars/mei.vrm', 'chars/motions.json', { name: 'mei' });
  scene.add(ch.root);
  const r = new Resident(ch, world, voice, { path: sidewalkPath(world), bench: world.spots?.sakuraBench || null });
  scene.add(r.phone);
  return {
    list: [r],
    update(dt, player, hour) {
      for (const p of this.list) p.update(dt, player, hour);
    },
    // where everyone stands (feet), for the train to look out for
    positions(out = []) {
      for (const p of this.list) if (!p.home) out.push({ x: p.x, y: p.ground(p.x, p.z), z: p.z });
      return out;
    },
  };
}
