import * as THREE from 'three';
import { loadCharacter } from './character.js';

// 桜井ななみ (Sakurai Nanami), the protagonist, seen from behind in third person.
//
// She follows the walker (Player): turns toward where she is going, idles, walks and runs
// with her feet matched to the ground speed, jumps, sits down on benches and chairs, and
// turns her head toward what you look at or are about to use. Five outfits (one VRM
// each), switched from the settings; each is loaded the first time it is worn.

export const OUTFITS = [
  { file: 'chars/nanami.vrm', name: 'ワンピース' },
  { file: 'chars/nanami2.vrm', name: 'パーカー' },
  { file: 'chars/nanami3.vrm', name: '制服' },
  { file: 'chars/nanami4.vrm', name: 'デニム' },
  { file: 'chars/nanami5.vrm', name: 'ゴシック' },
];

// gestures she does with her eyes shut: from, to (s)
const EYES_SHUT = { pray: [0.9, 2.7] };

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const _v = new THREE.Vector3(), _w = new THREE.Vector3();

// the bench seat (top of the slats) above the sit spot's height, her hips above a seat
const SEAT_ABOVE_SPOT = 0.02;
const HIPS_OVER_SEAT = 0.1;

export class Avatar {
  constructor(world, scene, player) {
    this.world = world;
    this.scene = scene;
    this.player = player;
    this.ch = null;
    this.outfit = -1;
    this.loaded = new Map(); // outfit index -> Promise<Character>
    this.heading = wrap(player.yaw + Math.PI);
    this.gait = 'idle';
    this.airT = 0;
    this.seat = null;
  }

  // wear outfit i (loads it the first time); resolves once she has changed
  async setOutfit(i) {
    i = Math.max(0, Math.min(OUTFITS.length - 1, i | 0));
    this.want = i;
    if (!this.loaded.has(i)) this.loaded.set(i, loadCharacter(OUTFITS[i].file, 'chars/motions.json', { name: 'nanami' + i }));
    const ch = await this.loaded.get(i);
    if (this.want !== i) return; // another outfit was picked meanwhile
    const old = this.ch;
    const C = this.world.colliders, p = this.player;
    // the floor she stands on (stacked levels: the one at her feet)
    ch.ground = (x, z) => C.groundAt(x, z, p.pos.y + 0.3);
    ch.setMood(0.15);
    // footsteps in step with her stride
    p.strides = {
      walk: (ch.info.walk.speed * ch.clips.walk.duration) / 2,
      run: (ch.info.run.speed * ch.clips.run.duration) / 2,
    };
    if (old) old.root.removeFromParent();
    this.scene.add(ch.root);
    ch.root.visible = old ? old.root.visible : false;
    this.ch = ch;
    this.outfit = i;
    // start the new one in the same pose
    this.seat = null;
    this.gait = '';
    this.fresh = true;
  }

  // a gesture of her own (praying at the shrine), turned toward `heading`; walking off ends it
  perform(clip, heading) {
    if (!this.ch?.clips[clip]) return 0;
    this.act = { clip, heading, t: 0 };
    return this.ch.clips[clip].duration;
  }

  // world position of her head (for others to look at)
  head(out = new THREE.Vector3()) {
    return this.ch.node('head').getWorldPosition(out);
  }

  // active: third person (in play, or behind a menu); visible: drawn (not when the camera is
  // pulled in against her); still: the walker is paused (menus); look: a point to turn her
  // head to, or null
  update(dt, { active, visible, look, still = false }) {
    const ch = this.ch, p = this.player;
    if (!ch) return;
    ch.root.visible = active && visible;
    if (!active) return;
    // on her bicycle (getting on, riding, getting off)
    if (this.bike?.on) {
      this._ride(dt, still);
      return;
    }
    if (this.riding) this._offBike();

    let x = p.pos.x, y = p.pos.y, z = p.pos.z;
    if (p.sitting) {
      const s = p.sitting;
      if (this.seat !== s) {
        // just sat down: back to the seat, facing the way it faces
        this.seat = s;
        this.heading = wrap(s.yaw + Math.PI);
        ch.seat = { lift: Math.max(0, 0.45 + SEAT_ABOVE_SPOT + HIPS_OVER_SEAT - ch.sitHips) };
        ch.play(this.fresh ? 'sit' : 'sitDown', this.fresh ? 0 : 0.25);
        this.gait = 'sit';
      }
      const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
      const back = 0.06 + ch.sitBack;
      x = s.x + fx * back;
      z = s.z + fz * back;
      y = s.y - 0.45;
      if (ch.currentName === 'sitDown' && ch.remaining() < 0.25) ch.play('sit', 0.3);
      ch.noFit = false;
    } else {
      if (this.seat) {
        // up again (the walker has already stepped off the bench)
        this.seat = null;
        ch.seat = null;
      }
      const sp = still ? 0 : Math.hypot(p.vel.x, p.vel.z);
      // a gesture of her own, until it ends or she moves off
      if (this.act && (sp > 0.3 || !p.onGround)) this.act = null;
      if (this.act) {
        const a = this.act;
        if (a.t === 0) ch.play(a.clip, 0.3);
        a.t += dt;
        this.heading = wrap(this.heading + wrap(a.heading - this.heading) * Math.min(1, dt * 8));
        if (a.t > ch.clips[a.clip].duration - 0.3) {
          this.act = null;
          this.gait = '';
        }
      }
      // eyes shut for the prayer itself
      const shut = this.act && EYES_SHUT[this.act.clip];
      ch.eyesClosed = shut && this.act.t > shut[0] && this.act.t < shut[1] ? 1 : 0;
      // she faces the way she goes
      if (sp > 0.25) {
        const d = wrap(Math.atan2(p.vel.x, p.vel.z) - this.heading);
        this.heading = wrap(this.heading + d * Math.min(1, dt * (sp > 3 ? 12 : 9)));
      }
      // a jump: the take-off to landing of a jump clip; a longer drop: falling
      if (!p.onGround && this.airT === 0 && p.vy > 0) this.jumping = true;
      if (p.onGround) this.jumping = false;
      this.airT = p.onGround ? 0 : this.airT + dt;
      ch.noFit = this.airT > 0;
      let gait;
      const st = p.stairs;
      if (this.act) gait = 'act';
      else if (this.jumping && this.airT < 0.85) gait = 'jump';
      else if (this.airT > (this.jumping ? 0 : 0.3)) gait = 'fall';
      else if (sp < 0.2) gait = 'idle';
      else if (st && ch.clips.stairsUp) gait = st.dir > 0 ? (p.running ? 'stairsRun' : 'stairsUp') : 'stairsDown';
      else if (this.gait === 'run' ? sp > 2.6 : sp > 3.2) gait = 'run';
      else gait = 'walk';
      // on stairs: one tread a step; the legs lift as high as these risers need
      ch.stairs = gait.startsWith('stairs') ? { k: THREE.MathUtils.clamp(st.rise / (ch.info[gait].rise || 0.25), 0.35, 1.3) } : null;
      const fade = gait === 'fall' || gait === 'jump' ? 0.12 : this.gait === 'fall' || this.gait === 'jump' ? 0.12 : 0.3;
      if (gait === 'act') {
        // the gesture plays itself
      } else if (gait === 'jump') {
        if (this.gait !== 'jump') ch.play('jump', fade, 0.92);
      } else if (gait === 'walk') ch.play('walk', fade, THREE.MathUtils.clamp(sp / ch.info.walk.speed, 0.5, 1.6));
      else if (gait === 'run') ch.play('run', fade, THREE.MathUtils.clamp(sp / ch.info.run.speed, 0.6, 1.3));
      else if (gait.startsWith('stairs')) ch.play(gait, 0.2, THREE.MathUtils.clamp(sp / st.run / (2 / ch.clips[gait].duration), 0.6, 2.6));
      else ch.play(gait, fade);
      this.gait = gait;
    }

    // on stairs her body follows the line through the treads (the walker hops tread to
    // tread); the change eases in and out
    const stairY = !p.sitting && p.stairs && p.onGround ? p.stairs.rampY : null;
    if (stairY !== null || this.stairEase > 0) {
      this.stairEase = stairY !== null ? 1 : Math.max(0, (this.stairEase ?? 0) - dt * 4);
      const want = stairY ?? y;
      if (this.bodyY === undefined || Math.abs(want - this.bodyY) > 1) this.bodyY = want;
      this.bodyY += (want - this.bodyY) * Math.min(1, dt * 14);
      y = stairY !== null ? this.bodyY : this.bodyY + (p.pos.y - this.bodyY) * (1 - this.stairEase);
    } else this.bodyY = y;
    ch.root.position.set(x, y, z);
    ch.root.rotation.set(0, this.heading, 0);

    // her head turns toward what you look at or are about to use (not behind her)
    let target = look;
    if (!target) {
      _w.set(-Math.sin(p.yaw), 0, -Math.cos(p.yaw));
      target = _v.set(x, y + 1.35, z).addScaledVector(_w, 8);
      target.y += Math.sin(p.pitch) * 8;
    }
    _w.set(target.x - x, 0, target.z - z);
    const ahead = Math.cos(wrap(Math.atan2(_w.x, _w.z) - this.heading));
    ch.lookAt(this.act ? null : ahead > -0.2 ? target : null, look ? 1 : 0.7);
    ch.update(dt);
    if (this.fresh) {
      // just changed clothes: hair and skirt start at rest
      this.fresh = false;
      ch.resetPhysics();
    }
  }

  // Riding: the bike poses her (see Bicycle.pose); her root takes the bike's frame, moving
  // from where she stood to the saddle as she gets on (and back to the roadside as she gets
  // off). She smiles into the wind, her head turned down the road and into the turns, or the
  // way you look when you look about, and her hair streams back with the speed.
  _ride(dt, still) {
    const ch = this.ch, B = this.bike, p = this.player;
    if (this.riding !== ch) {
      if (this.riding) this._offBike();
      this.riding = ch;
      this.seat = null;
      ch.seat = null;
      this.act = null;
      ch.stairs = null;
      ch.eyesClosed = 0;
      ch.noFit = true;
      ch.pose = (c) => B.pose(c);
      ch.widenSkirt(2.0);
      ch.skirtFollow = true;
      ch.play('idle', 0.3);
      this.gait = 'ride';
      this.from = { x: ch.root.position.x, y: ch.root.position.y, z: ch.root.position.z, h: this.heading };
    }
    B.placeRider(ch.root);
    const k = B.k * B.k * (3 - 2 * B.k);
    if (k < 1) {
      const f = B.state === 'dismounting' && B.offSpot ? B.offSpot : this.from;
      const r = ch.root;
      r.position.set(f.x + (r.position.x - f.x) * k, f.y + (r.position.y - f.y) * k, f.z + (r.position.z - f.z) * k);
      r.rotation.set(r.rotation.x * k, (f.h ?? B.h) + wrap(B.h - (f.h ?? B.h)) * k, r.rotation.z * k);
    }
    this.heading = B.h;
    // a smile that grows with the speed
    const v = Math.abs(B.v);
    ch.setMood(0.18 + Math.min(v / 6, 1) * 0.42);
    // where she looks: down the road (into the turn), or where you look
    const hx = Math.sin(B.h + B.steerVis * 0.9), hz = Math.cos(B.h + B.steerVis * 0.9);
    ch.node('head').getWorldPosition(_v);
    const cam = _w.set(-Math.sin(p.yaw), Math.sin(p.pitch), -Math.cos(p.yaw));
    const ahead = cam.x * Math.sin(B.h) + cam.z * Math.cos(B.h);
    const lookCam = p.lookIdle < 1.2 && ahead > -0.1 ? 1 : 0;
    this.lookK = (this.lookK ?? 0) + (lookCam - (this.lookK ?? 0)) * Math.min(1, dt * 3);
    _v.x += (hx * (1 - this.lookK) + cam.x * this.lookK) * 10;
    _v.z += (hz * (1 - this.lookK) + cam.z * this.lookK) * 10;
    _v.y += -0.6 + cam.y * 6 * this.lookK;
    ch.lookAt(_v, 0.65);
    // the wind of riding, and a little gusting
    const wind = (this.wind ||= new THREE.Vector3());
    const gust = 1 + 0.25 * Math.sin(ch.t * 7.3) * Math.sin(ch.t * 2.9 + 1.0);
    wind.set(-Math.sin(B.h) * B.v, 0.02 * v, -Math.cos(B.h) * B.v).multiplyScalar(0.07 * gust);
    ch.wind = still ? null : wind;
    ch.update(dt);
  }

  _offBike() {
    const ch = this.riding;
    this.riding = null;
    ch.pose = null;
    ch.noFit = false;
    ch.wind = null;
    ch.widenSkirt(1);
    ch.skirtFollow = false;
    ch.root.rotation.set(0, this.heading, 0);
    ch.setMood(0.15);
    this.gait = '';
  }
}

export async function createAvatar(world, scene, player, outfit = 0) {
  const a = new Avatar(world, scene, player);
  await a.setOutfit(outfit);
  return a;
}
