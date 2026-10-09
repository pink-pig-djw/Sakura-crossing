import * as THREE from 'three';
import { loadCharacter } from './character.js';

// 桜井ななみ (Sakurai Nanami), the protagonist, seen from behind in third person.
//
// She follows the walker (Player): turns toward where she is going, idles, walks and runs
// with her feet matched to the ground speed, jumps, sits down on benches and chairs, and
// turns her head toward what you look at or are about to use. Three outfits (one VRM
// each), switched from the settings; each is loaded the first time it is worn.

export const OUTFITS = [
  { file: 'chars/nanami.vrm', name: 'ワンピース' },
  { file: 'chars/nanami2.vrm', name: 'パーカー' },
  { file: 'chars/nanami3.vrm', name: '制服' },
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
      if (this.act) gait = 'act';
      else if (this.jumping && this.airT < 0.85) gait = 'jump';
      else if (this.airT > (this.jumping ? 0 : 0.3)) gait = 'fall';
      else if (sp < 0.2) gait = 'idle';
      else if (this.gait === 'run' ? sp > 2.6 : sp > 3.2) gait = 'run';
      else gait = 'walk';
      const fade = gait === 'fall' || gait === 'jump' ? 0.12 : this.gait === 'fall' || this.gait === 'jump' ? 0.12 : 0.3;
      if (gait === 'act') {
        // the gesture plays itself
      } else if (gait === 'jump') {
        if (this.gait !== 'jump') ch.play('jump', fade, 0.92);
      } else if (gait === 'walk') ch.play('walk', fade, THREE.MathUtils.clamp(sp / ch.info.walk.speed, 0.5, 1.6));
      else if (gait === 'run') ch.play('run', fade, THREE.MathUtils.clamp(sp / ch.info.run.speed, 0.6, 1.3));
      else ch.play(gait, fade);
      this.gait = gait;
    }

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
}

export async function createAvatar(world, scene, player, outfit = 0) {
  const a = new Avatar(world, scene, player);
  await a.setOutfit(outfit);
  return a;
}
