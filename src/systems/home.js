import * as THREE from 'three';
import { MeshBuilder, PAT } from '../core/builder.js';
import { HOME } from '../world/home.js';
import { chairPiece, kyusu, yunomi, shoePair, SHOE_KIND } from '../world/homedecor.js';
import { MIN_AWAKE, hoursMinutes } from './body.js';
import { dateOf, dateLabel } from './calendar.js';

// Life at home (桜井家, world/home.js): what she does at each spot, played out move by move.
//
// A routine walks her to the spot (the walker steers itself there, she walks as ever), turns
// her, and then drives her (Avatar._home): where her root is, which clip plays and from where,
// how fast (backwards too), her eyes, a pose laid over the clip (a hand on a handle, a cup in
// her hand, the hips kept on the mattress through a change of clip) — while the things she
// handles move with her: the front door on its hinges (a closer shuts it after her), the
// wardrobe's door, the desk chair she pulls in, the teapot and cup, the diary, the TV.
//
//   door      家に入る / 出かける: a hand to the handle, the door drawn open (pushed, going out),
//             through, and it closes behind her
//   bed       she sits on the edge, swings her legs up and lies back (the clip turned a quarter
//             round as her legs come up, so she ends up along the bed, her head on the pillow);
//             sleepy (8 hours up): she turns her head, closes her eyes and sleeps as long as she
//             is tired (systems/body.js), waking to get up, stretch; not sleepy: she rests until
//             you get her up
//   wardrobe  opens a door, picks clothes (the menu of outfits), changes, looks in the mirror,
//             closes it
//   desk      pulls the chair out, sits, draws it in, opens her diary and writes (the diary page)
//   sofa      sits, the TV comes on: the weather forecast; she laughs at times, or nods off
//   tea       pours from the teapot into her cup, drinks it standing at the counter
//   zabuton   kneels down on the cushion (正座) in the 和室, gets up again
//   balcony   leans on the rail with both hands, the wind in her hair, and looks out

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const ramp = (t, a, b) => smooth((t - a) / (b - a));
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const lerpAngle = (a, b, t) => a + wrap(b - a) * t;

// Turning round on the spot by D (radians, to her left positive): the quarter-turn takes
// (turnL / turnR, each turning her about 120° in two steps), as many whole ones as it needs and
// the start of one more for the rest, cut where it has turned as far as that (a small rest goes
// to the whole take before it, a little wider). Small turns (under 25°) get none: null.
function turnPlan(ch, D) {
  const name = D > 0 ? 'turnL' : 'turnR', info = ch.info[name];
  if (!info?.yaw || Math.abs(D) < 0.44) return null;
  const Y = info.yaw, full = Math.abs(Y[Y.length - 1]), dur = (Y.length - 1) / info.fps;
  const segs = [];
  let rest = Math.abs(D);
  while (rest > full + 0.6) {
    segs.push({ ang: full, scale: 1, T: dur });
    rest -= full;
  }
  if (rest > full) segs.push({ ang: rest, scale: rest / full, T: dur });
  else if (rest >= 0.6 || !segs.length) {
    // (cut where the take has turned as far as the rest)
    let k = 1;
    while (k < Y.length - 1 && Math.abs(Y[k]) < rest) k++;
    const a = Math.abs(Y[k - 1]), b = Math.abs(Y[k]);
    const T = (k - 1 + (rest - a) / Math.max(b - a, 1e-6)) / info.fps;
    segs.push({ ang: rest, scale: 1, T: Math.min(dur, T) });
  } else {
    const last = segs[segs.length - 1];
    last.ang += rest;
    last.scale = last.ang / full;
  }
  // (one take after another of the same clip: every other one is its twin, to cross-fade)
  ch.alias(name, name + '2');
  segs.forEach((s, i) => (s.clip = i % 2 ? name + '2' : name));
  return { segs, sign: Math.sign(D), yaw: Y, fps: info.fps, T: segs.reduce((a, s) => a + s.T, 0) };
}
// how far a turn take has turned her t seconds in (radians, unsigned)
function turnYaw(P, t) {
  const f = Math.max(0, Math.min(P.yaw.length - 1, t * P.fps));
  const k = Math.min(P.yaw.length - 2, Math.floor(f));
  return Math.abs(P.yaw[k] + (P.yaw[k + 1] - P.yaw[k]) * (f - k));
}
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _u = new THREE.Vector3(), _p = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);
// a direction in her frame (heading h) in world terms
const toWorld = (h, lx, lz, out) => out.set(lx * Math.cos(h) + lz * Math.sin(h), 0, -lx * Math.sin(h) + lz * Math.cos(h));
const headingTo = (x0, z0, x1, z1) => Math.atan2(x1 - x0, z1 - z0);

function built(fn, material, o = {}) {
  const b = new MeshBuilder();
  fn(b);
  const m = new THREE.Mesh(b.toGeometry(), material);
  m.castShadow = !!o.shadow;
  m.receiveShadow = !!o.shadow;
  m.layers.enable(1);
  return m;
}

// ---------------------------------------------------------------------------- the things
// The front door: a dark wooden leaf with a frosted slit, a bar handle outside, a lever inside,
// hung on its south side and opening outward; a closer pulls it shut (fast, then slowly, the
// latch clicks)
class FrontDoor {
  constructor(scene, material, colliders) {
    const D = HOME.door;
    this.w = D.z1 - D.z0 - 0.012;
    this.h = D.h - 0.012;
    const w = this.w, h = this.h;
    this.pivot = new THREE.Group();
    this.pivot.position.set(D.x + 0.004, D.y, D.z1 - 0.004);
    this.leaf = built((b) => {
      b.boxMM(0, 0.008, -w, 0.05, h, 0, { color: 0x5b3e2c, pattern: PAT.BOARDS });
      // the frosted slit, the kick plate
      b.boxMM(-0.003, 0.42, -0.3, 0.053, h - 0.32, -0.19, { color: 0xdde6e8 });
      b.boxMM(-0.004, 0.01, -w + 0.02, 0.054, 0.12, -0.02, { color: 0x3e3a36 });
      // outside: a long bar on two posts near the free edge, a key cylinder
      b.boxMM(-0.075, 0.74, -w + 0.105, -0.055, 1.26, -w + 0.125, { color: 0xb9bdc1 });
      for (const y of [0.8, 1.2]) b.boxMM(-0.058, y - 0.012, -w + 0.11, 0.0, y + 0.012, -w + 0.12, { color: 0xb9bdc1 });
      b.boxMM(-0.012, 1.34, -w + 0.1, 0.0, 1.4, -w + 0.13, { color: 0x8a8e92 });
      // inside: a lever on a rose
      b.boxMM(0.05, 0.93, -w + 0.095, 0.058, 1.03, -w + 0.135, { color: 0xb9bdc1 });
      b.boxMM(0.058, 0.97, -w + 0.105, 0.1, 0.99, -w + 0.125, { color: 0xb9bdc1 });
      b.boxMM(0.085, 0.965, -w + 0.125, 0.105, 0.995, -w + 0.27, { color: 0xb9bdc1 });
    }, material, { shadow: true });
    this.pivot.add(this.leaf);
    scene.add(this.pivot);
    this.angle = 0;
    this.target = 0;
    this.holdUntil = 0;
    this.col = colliders.addDynamicBox(0.04, w / 2, 0, D.y + h, D.y - 0.6);
    this.col.cx = D.x + 0.025;
    this.col.cz = (D.z0 + D.z1) / 2;
    this.col.off = false;
    this.onShut = null;
  }
  // where the handle is (world): side 'out' the bar, 'in' the lever
  handle(side, out = new THREE.Vector3()) {
    const w = this.w;
    out.set(side === 'out' ? -0.066 : 0.098, 0.98, -w + 0.115);
    this.pivot.updateMatrixWorld(true);
    return out.applyMatrix4(this.pivot.matrixWorld);
  }
  update(dt) {
    let a = this.angle;
    if (this.drive !== undefined) {
      a = this.drive; // moved by her hand
      this.drive = undefined;
    } else if (this.target > a) a = Math.min(this.target, a + dt * (0.35 + 2.2 * (this.target - a)));
    else if (this.target < a) {
      // the closer: brisk, slowing over the last stretch, then the latch
      const sp = a > 0.35 ? 1.25 : 0.25 + a * 1.6;
      a = Math.max(this.target, a - dt * sp);
      if (a === 0 && this.angle > 0) this.onShut?.();
    }
    this.angle = a;
    this.pivot.rotation.y = a;
    this.col.off = a > 0.08;
  }
}

// The wardrobe's two doors (hung at its sides, opening into the room)
class WardrobeDoors {
  constructor(scene, material) {
    const W = HOME.wardrobe;
    const F2 = HOME.f2;
    const w = (W.x1 - W.x0 - 0.04) / 2 - 0.003, h = W.h - 0.15;
    this.w = w;
    const leaf = (s) => built((b) => {
      const x0 = s > 0 ? 0 : -w, x1 = s > 0 ? w : 0;
      b.boxMM(x0, 0, 0, x1, h, 0.02, { color: 0xf8f6f0 });
      b.boxMM(x0 + 0.06, 0.12, 0.02, x1 - 0.06, h - 0.12, 0.024, { color: 0xf1ede4 });
      const kx = s > 0 ? w - 0.07 : -w + 0.07;
      b.rod(V(kx, 0.95, 0.024), V(kx, 0.95, 0.06), 0.012, 0.012, 8, 0xb39672);
      b.geom(new THREE.SphereGeometry(0.02, 10, 8), new THREE.Matrix4().makeTranslation(kx, 0.95, 0.065), 0xb39672);
    }, material);
    this.L = new THREE.Group();
    this.L.position.set(W.x0 + 0.02, F2 + 0.11, W.z1);
    this.L.add(leaf(1));
    this.R = new THREE.Group();
    this.R.position.set(W.x1 - 0.02, F2 + 0.11, W.z1);
    this.R.add(leaf(-1));
    scene.add(this.L, this.R);
    this.a = { L: 0, R: 0 };
    this.target = { L: 0, R: 0 };
  }
  knob(side, out = new THREE.Vector3()) {
    const g = this[side];
    out.set(side === 'L' ? this.w - 0.07 : -this.w + 0.07, 0.95, 0.075);
    g.updateMatrixWorld(true);
    return out.applyMatrix4(g.matrixWorld);
  }
  update(dt) {
    for (const s of ['L', 'R']) {
      let a = this.a[s];
      if (this.drive?.[s] !== undefined) {
        a = this.drive[s];
        this.drive[s] = undefined;
      } else a += (this.target[s] - a) * Math.min(1, dt * 3.5);
      this.a[s] = a;
      this[s].rotation.y = s === 'L' ? -a : a;
    }
  }
}

// The TV: a screen that comes on with the weather forecast (drawn on a small canvas)
class Television {
  constructor(scene) {
    const T = HOME.tv;
    this.canvas = document.createElement('canvas');
    this.canvas.width = 320;
    this.canvas.height = 180;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.mat = new THREE.MeshBasicMaterial({ map: this.tex, toneMapped: false });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(T.w, T.h), this.mat);
    this.mesh.position.set(T.x, T.y + T.h / 2 + 0.04, T.z + 0.026);
    this.mesh.visible = false;
    scene.add(this.mesh);
    this.on = false;
    this.t = 0;
    this.drawT = 0;
  }
  setOn(on) {
    this.on = on;
    this.mesh.visible = on;
    this.t = 0;
  }
  update(dt, w) {
    if (!this.on) return;
    this.t += dt;
    this.drawT -= dt;
    if (this.drawT > 0) return;
    this.drawT = 1 / 12;
    drawForecast(this.canvas.getContext('2d'), this.canvas.width, this.canvas.height, this.t, w);
    this.tex.needsUpdate = true;
  }
}

// the forecast: 桜ヶ浜's coast on a map, the next hours' weather, a ticker
function drawForecast(c, W, H, t, w) {
  const on = Math.min(1, t * 3);
  const g = c.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#2f7fd0');
  g.addColorStop(1, '#8fc8f0');
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);
  // the map: land, the bay, the island
  c.fillStyle = '#7fc06a';
  c.beginPath();
  c.moveTo(0, 0);
  c.lineTo(W * 0.75, 0);
  c.bezierCurveTo(W * 0.7, H * 0.25, W * 0.5, H * 0.4, W * 0.22, H * 0.46);
  c.bezierCurveTo(W * 0.12, H * 0.48, W * 0.05, H * 0.55, 0, H * 0.6);
  c.closePath();
  c.fill();
  c.fillStyle = '#9ad07e';
  c.beginPath();
  c.ellipse(W * 0.6, H * 0.62, 16, 10, 0.3, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = 'rgba(255,255,255,0.7)';
  c.lineWidth = 1.5;
  c.strokeRect(6, 6, W - 12, H - 12);
  // the title bar
  c.fillStyle = 'rgba(255,255,255,0.92)';
  c.fillRect(0, 0, W, 26);
  c.fillStyle = '#2a4f7a';
  c.font = '700 15px "Zen Maru Gothic", "Hiragino Maru Gothic ProN", sans-serif';
  c.textBaseline = 'middle';
  c.fillText('桜ヶ浜のお天気', 10, 14);
  c.textAlign = 'right';
  c.fillText(w.clock, W - 10, 14);
  const cw = c.measureText(w.clock).width;
  c.font = '700 12px "Zen Maru Gothic", "Hiragino Maru Gothic ProN", sans-serif';
  c.fillText(w.date, W - 18 - cw, 14);
  c.textAlign = 'left';
  // three slots: now, later, tonight/tomorrow
  const icon = (x, y, kind, s = 1) => {
    if (kind === 'sun') {
      c.fillStyle = '#ffd34a';
      c.beginPath();
      c.arc(x, y, 12 * s, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = '#ffd34a';
      c.lineWidth = 2;
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2 + t * 0.6;
        c.beginPath();
        c.moveTo(x + Math.cos(a) * 15 * s, y + Math.sin(a) * 15 * s);
        c.lineTo(x + Math.cos(a) * 20 * s, y + Math.sin(a) * 20 * s);
        c.stroke();
      }
    } else if (kind === 'moon') {
      c.fillStyle = '#fff2b0';
      c.beginPath();
      c.arc(x, y, 11 * s, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#4a78b0';
      c.beginPath();
      c.arc(x + 5 * s, y - 4 * s, 9 * s, 0, Math.PI * 2);
      c.fill();
    } else {
      c.fillStyle = kind === 'rain' ? '#d8dee8' : '#f4f7fb';
      for (const [dx, dy, r] of [[-8, 2, 9], [3, -3, 11], [12, 3, 8], [0, 5, 9]]) {
        c.beginPath();
        c.arc(x + dx * s, y + dy * s, r * s, 0, Math.PI * 2);
        c.fill();
      }
      if (kind === 'rain') {
        c.strokeStyle = '#3f7fe0';
        c.lineWidth = 2;
        for (let k = 0; k < 4; k++) {
          const yy = ((t * 30 + k * 7) % 14) + y + 12 * s;
          c.beginPath();
          c.moveTo(x - 9 * s + k * 6 * s, yy);
          c.lineTo(x - 11 * s + k * 6 * s, yy + 5);
          c.stroke();
        }
      }
    }
  };
  const slots = w.slots;
  for (let i = 0; i < slots.length; i++) {
    const x = W * (0.2 + i * 0.3), y = H * 0.62;
    c.fillStyle = 'rgba(255,255,255,0.88)';
    c.fillRect(x - 40, y - 46, 80, 92);
    c.fillStyle = '#2a4f7a';
    c.font = '700 12px "Zen Maru Gothic", sans-serif';
    c.textAlign = 'center';
    c.fillText(slots[i].label, x, y - 34);
    icon(x, y - 6, slots[i].kind, 0.95);
    c.font = '700 13px "Zen Maru Gothic", sans-serif';
    c.fillStyle = slots[i].kind === 'rain' ? '#2a5fb0' : '#d0502a';
    c.fillText(slots[i].text, x, y + 28);
    c.textAlign = 'left';
  }
  // the ticker
  c.fillStyle = 'rgba(20,40,70,0.85)';
  c.fillRect(0, H - 20, W, 20);
  c.fillStyle = '#ffffff';
  c.font = '500 12px "Zen Kaku Gothic New", sans-serif';
  const msg = w.ticker;
  const tw = c.measureText(msg).width + 40;
  const x0 = W - ((t * 40) % (tw + W));
  c.fillText(msg, x0, H - 10);
  c.fillText(msg, x0 + tw + W * 0.2, H - 10);
  if (on < 1) {
    c.fillStyle = `rgba(0,0,0,${1 - on})`;
    c.fillRect(0, 0, W, H);
  }
}

// a steam puff or two over a cup of tea
class Steam {
  constructor(scene) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 32;
    const c = cv.getContext('2d');
    const g = c.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, 'rgba(255,255,255,0.8)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 32, 32);
    const tex = new THREE.CanvasTexture(cv);
    this.puffs = [];
    for (let i = 0; i < 6; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0 }));
      s.scale.setScalar(0.06);
      s.visible = false;
      scene.add(s);
      this.puffs.push({ s, age: i / 6 });
    }
    this.at = null; // the cup (Object3D) it rises from
  }
  update(dt) {
    for (const p of this.puffs) {
      p.age += dt / 1.8;
      if (p.age > 1) p.age -= 1;
      const on = !!this.at && this.at.visible;
      p.s.visible = on;
      if (!on) continue;
      this.at.getWorldPosition(_v);
      const a = p.age;
      p.s.position.set(_v.x + Math.sin(a * 7 + p.age) * 0.015, _v.y + 0.09 + a * 0.22, _v.z + Math.cos(a * 5) * 0.012);
      p.s.scale.setScalar(0.04 + a * 0.07);
      p.s.material.opacity = 0.35 * Math.sin(a * Math.PI) * (this.strength ?? 1);
    }
  }
}

// ---------------------------------------------------------------------------- her hands
const ARM = {
  right: ['rightUpperArm', 'rightLowerArm', 'rightHand'],
  left: ['leftUpperArm', 'leftLowerArm', 'leftHand'],
};
const _saved = { right: [new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion()], left: [new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion()] };
// put a hand (its wrist) at `target` (world), blended with the clip's arm by k; the elbow
// bends toward `pole` (world direction)
function reach(ch, side, target, k, pole) {
  if (k <= 0.001) return;
  const bones = ARM[side];
  bones.forEach((b, i) => _saved[side][i].copy(ch.node(b).quaternion));
  ch.root.updateMatrixWorld(true);
  ch.ik(bones[0], bones[1], bones[2], target, pole);
  if (k < 0.999) {
    bones.forEach((b, i) => {
      const n = ch.node(b);
      _q.copy(n.quaternion);
      n.quaternion.slerpQuaternions(_saved[side][i], _q, k);
    });
  }
  ch.node(bones[0]).updateMatrixWorld(true);
}
// keep the hips (world) at p: their position in their parent's frame
function pinHips(ch, p, k = 1) {
  const hips = ch.node('hips');
  ch.root.updateMatrixWorld(true);
  _p.copy(p);
  hips.parent.worldToLocal(_p);
  if (k >= 0.999) hips.position.copy(_p);
  else hips.position.lerp(_p, k);
  hips.updateMatrixWorld(true);
}
// rotate a bone about a world axis
function turnBone(ch, bone, axis, angle) {
  const n = ch.node(bone);
  if (!n || Math.abs(angle) < 1e-5) return;
  n.parent.getWorldQuaternion(_q2);
  _q.setFromAxisAngle(_v.copy(axis).applyQuaternion(_q2.clone().invert()), angle);
  n.quaternion.premultiply(_q);
}

// ---------------------------------------------------------------------------- routines
// base: walking there, turning, then the routine's own steps
class Routine {
  constructor(home, it) {
    this.home = home;
    this.it = it;
    this.t = 0; // time in the current step
    this.step = 'walk';
    this.done = false;
    this.spec = { clip: 'idle' };
  }
  get ch() {
    return this.home.avatar.ch;
  }
  // walk there (the walker steers; close to it, right up to the furniture), then turn to
  // heading h — stepping the last bit to the spot as she turns — and call next()
  // via: a point to go round by first (the side of a chair drawn out from a desk)
  goTo(x, z, h, next, via = null) {
    this.via = via;
    if (via) this.home.player.walkTo(via.x, via.z);
    else this.home.player.walkTo(x, z, { near: 0.7, r: 0.15 });
    this.step = 'walk';
    this.after = { h, next, x, z };
  }
  // the camera swung round to where she is best seen doing it: of the views offered, the one
  // with the most room behind it ([{ yaw, pitch }], the yaw the camera's bearing from her)
  frame(views, pivot = 1.32) {
    if (!views?.length) return;
    const P = this.home.player;
    let best = null, room = -1;
    for (const v of views) {
      const d = P.freeBoom(this.x, this.y + pivot, this.z, v.yaw, v.pitch ?? -0.25);
      if (d > room + 0.05) {
        best = v;
        room = d;
      }
    }
    P.viewTo(best.yaw, best.pitch ?? -0.25);
  }
  to(step) {
    this.step = step;
    this.t = 0;
  }
  // the common steps: walking, turning
  tick(dt) {
    this.t += dt;
    const P = this.home.player;
    if (this.step === 'walk') {
      const A = P.auto;
      if (this.via) {
        // round the side first, then in to the spot
        const dv = Math.hypot(P.pos.x - this.via.x, P.pos.z - this.via.z);
        if (A && !A.done && !(A.stuck > 0.3 && dv < 0.45)) {
          if (A.stuck > 2.5) this.abort();
          return true;
        }
        this.via = null;
        P.walkTo(this.after.x, this.after.z, { near: 1.2, r: 0.15 });
        return true;
      }
      if (A && !A.done) {
        // (held off by something a hand's breadth short of the spot: near enough)
        const d = Math.hypot(P.pos.x - this.after.x, P.pos.z - this.after.z);
        if (!(A.stuck > 0.3 && d < 0.35)) {
          if (A.stuck > 2.5) this.abort();
          return true;
        }
      }
      P.walkTo(null);
      this.x0 = this.x = P.pos.x;
      this.y = P.pos.y;
      this.z0 = this.z = P.pos.z;
      this.h0 = this.home.avatar.heading;
      this.h = this.h0; // (this frame too: the turn starts from where she faces)
      // the turn takes longer for a wider turn or a step still to take (unhurried: a quick
      // spin flings her hair out)
      const dd = Math.hypot(this.after.x - this.x0, this.after.z - this.z0);
      // (round by more than a little: stepping round, as long as the steps take)
      this.plan = turnPlan(this.ch, wrap(this.after.h - this.h0));
      this.turnT = this.plan ? this.plan.T : 0.5 + 0.6 * Math.abs(wrap(this.after.h - this.h0)) / Math.PI + dd * 1.6;
      this.to('turn');
      this.hold();
      this.frame(this.views?.(this.after.h));
      return true;
    }
    if (this.step === 'turn') {
      const k = smooth(this.t / this.turnT);
      const P = this.plan;
      if (P) {
        // the take she is in and how far into it; her heading as far round as it has turned
        let t = this.t, j = 0, base = 0;
        while (j < P.segs.length - 1 && t > P.segs[j].T) {
          t -= P.segs[j].T;
          base += P.segs[j].ang;
          j++;
        }
        const sg = P.segs[j];
        this.h = this.h0 + P.sign * (base + turnYaw(P, Math.min(t, sg.T)) * sg.scale);
        this.spec = { clip: sg.clip, key: 'turn' + j, time: 0, fade: j ? 0.18 : 0.25 };
      } else {
        this.h = lerpAngle(this.h0, this.after.h, k);
        this.spec = { clip: 'idle', fade: 0.3 };
      }
      this.x = this.x0 + (this.after.x - this.x0) * k;
      this.z = this.z0 + (this.after.z - this.z0) * k;
      this.hold();
      if (this.t >= this.turnT) {
        this.h = this.after.h;
        const next = this.after.next;
        this.after = null;
        next();
      }
      return true;
    }
    return false;
  }
  // the camera follows her here (the walker held still)
  hold(x = this.x, y = this.y, z = this.z, pivot = 1.32) {
    this.home.player.holdAt({ x, y, z, pivot });
  }
  abort() {
    this.finish();
  }
  finish() {
    this.done = true;
  }
  rider() {
    if (this.step === 'walk') return null;
    return { x: this.x, y: this.y, z: this.z, h: this.h, ...this.spec };
  }
  interact() {}
  prompt() {
    return null;
  }
}

// ---- the front door
class DoorRoutine extends Routine {
  start() {
    const D = HOME.door, side = this.it.side;
    this.side = side;
    const zc = (D.z0 + D.z1) / 2;
    if (side === 'out') {
      // on the porch, north of the door's sweep, the bar handle ahead and to her right
      this.stand = { x: D.x - 0.52, z: D.z0 - 0.26 };
      this.through = [{ x: D.x - 0.38, z: zc - 0.06 }, { x: HOME.xi0 + 0.62, z: zc }];
    } else {
      this.stand = { x: HOME.xi0 + 0.44, z: D.z0 + 0.2 };
      this.through = [{ x: D.x - 0.25, z: zc }, { x: D.x - 1.05, z: zc }];
    }
    const hd = this.home.door.handle(side, _v);
    this.goTo(this.stand.x, this.stand.z, headingTo(this.stand.x, this.stand.z, hd.x, hd.z), () => this.to('open'));
  }
  update(dt) {
    if (this.tick(dt)) return;
    const door = this.home.door;
    if (this.step === 'open') {
      // the clip: the hand out (0.4-0.95 s), drawing back (0.95-1.8 s); going out she only
      // reaches and pushes
      const t = this.t;
      this.spec = { clip: 'open', time: 0, fade: 0.25 };
      const out = this.side === 'out';
      const grab = ramp(t, 0.45, 0.85), pull = ramp(t, 0.95, 1.75);
      const open = out ? 0.62 * pull : 0.55 * ramp(t, 0.8, 1.35);
      door.drive = open;
      this.handK = grab * (1 - ramp(t, out ? 1.75 : 1.35, out ? 2.05 : 1.6));
      if (t > 0.9 && !this.clicked) {
        this.clicked = true;
        this.home.audio?.sfx?.('door');
      }
      if (t >= (out ? 1.95 : 1.45)) {
        door.target = 1.62;
        door.angle = Math.max(door.angle, open);
        this.handK = 0;
        this.to('through');
        this.wp = 0;
        this.release();
        this.home.player.walkTo(this.through[0].x, this.through[0].z);
      }
      return;
    }
    if (this.step === 'through') {
      const P = this.home.player;
      door.target = 1.62;
      if (P.auto?.done || P.auto?.stuck > 2.5) {
        this.wp++;
        if (this.wp < this.through.length) P.walkTo(this.through[this.wp].x, this.through[this.wp].z);
        else {
          P.walkTo(null);
          // the closer shuts it after her
          door.target = 0;
          this.finish();
        }
      }
    }
  }
  // her own steps through the doorway: the walker steers, the avatar walks as ever
  release() {
    this.home.player.holdAt(null);
    this.free = true;
  }
  rider() {
    if (this.step === 'walk' || this.free) return null;
    const r = super.rider();
    if (this.step === 'open') {
      const door = this.home.door, side = this.side;
      r.pose = (ch) => {
        if (!this.handK) return;
        const hd = door.handle(side, _w);
        // the wrist a hand's breadth back from the grip
        const fw = toWorld(this.h, 0, 1, _u);
        hd.addScaledVector(fw, -0.07);
        hd.y -= 0.02;
        reach(ch, 'right', hd, this.handK, _p.set(0.3, -1, -0.4).applyAxisAngle(UP, this.h).normalize());
      };
    }
    return r;
  }
}

// ---- sitting down on something and getting up (desk chair, sofa; the bed's edge)
// seat: { x, z } where the hips come down, top (m over the floor), h (she faces)
function seatRoot(ch, seat, y) {
  const back = 0.06 + ch.sitBack;
  return { x: seat.x + Math.sin(seat.h) * back, y, z: seat.z + Math.cos(seat.h) * back };
}

// ---- the bed
class BedRoutine extends Routine {
  // (from the room, over the bed's long side)
  views() {
    return [{ yaw: Math.PI + 0.5, pitch: -0.42 }, { yaw: Math.PI - 0.5, pitch: -0.42 }];
  }
  start() {
    const B = HOME.bed;
    this.y0 = HOME.f2;
    this.surface = B.top - 0.005;
    // she sits down on the edge a little in from the foot of the pillow; she ends up lying
    // along the bed, her head on the pillow (to the east)
    this.seat = { x: 43.42, z: B.z0 + 0.2, h: Math.PI, top: B.top - 0.01 - this.y0 }; // (top: over the floor)
    const r = seatRoot(this.ch, this.seat, this.y0);
    this.sleepy = this.home.body.canSleep;
    this.goTo(r.x, r.z, Math.PI, () => {
      this.to('sitDown');
      this.hold(43.4, this.y0, -20.9, 1.0);
    });
  }
  // the lying-down clip's path: hips from the edge (H_s) to along the bed (H_e), the root turned
  // a quarter round (facing north, then west) as the legs come up
  path(t, out) {
    const ch = this.ch, s = ch.hipsHeight / 1.0427;
    const T = ch.clips.lieDown.duration;
    const p = ch.hipsAt('lieDown', t, _u);
    const p0 = ch.hipsAt('lieDown', 0, _w).clone();
    const pT = ch.hipsAt('lieDown', T, _p).clone();
    const Hs = this.Hs, He = this.He;
    const kx = ramp(t, 1.0, 3.9);
    const ky = ramp(t, 0.9, 3.8);
    const h = Math.PI + (Math.PI / 2) * ramp(t, 1.05, 2.75);
    const hx = Hs.x + (He.x - Hs.x) * kx, hz = Hs.z + (He.z - Hs.z) * kx;
    const hy = Hs.y + (p.y - p0.y) + ky * (He.y - Hs.y - (pT.y - p0.y));
    void s;
    out.h = h;
    out.hips = new THREE.Vector3(hx, hy, hz);
    // the root under the hips (the clip's hips offset turned with her)
    const off = toWorld(h, p.x, p.z, _v);
    out.x = hx - off.x;
    out.z = hz - off.z;
    out.y = hy - p.y;
    return out;
  }
  update(dt) {
    if (this.tick(dt)) return;
    const ch = this.ch, t = this.t;
    const s = ch.hipsHeight / 1.0427;
    if (this.step === 'sitDown') {
      this.spec = { clip: 'sitDown', fade: 0.25, seat: { lift: Math.max(0, this.seat.top + 0.1 - ch.sitHips) } };
      if (t >= ch.clips.sitDown.duration - 0.25) {
        // where the hips are now: over the edge of the bed
        const sd = ch.hipsAt('sitDown', ch.clips.sitDown.duration, _v);
        const off = toWorld(this.h, sd.x, sd.z, _w);
        this.Hs = new THREE.Vector3(this.x + off.x, this.y0 + this.seat.top + 0.1, this.z + off.z);
        // along the bed: the head (about 0.56 of the X Bot's metres back from the hips) on the pillow
        const B = HOME.bed;
        this.He = new THREE.Vector3(B.x1 - 0.31 - 0.56 * s, this.surface + 0.105, (B.z0 + B.z1) / 2 + 0.03);
        this.to('lieDown');
      }
      return;
    }
    if (this.step === 'lieDown' || this.step === 'getUp') {
      const T = ch.clips.lieDown.duration;
      const act = ch.actions.lieDown;
      const ct = this.step === 'lieDown' ? Math.min(T, t) : Math.max(0, T - t * 1.12);
      const P = this.path(ct, {});
      this.x = P.x;
      this.y = P.y;
      this.z = P.z;
      this.h = P.h;
      this.spec = { clip: 'lieDown', time: this.step === 'lieDown' ? 0 : T, rate: this.step === 'lieDown' ? 1 : -1.12, fade: 0.45, noFit: true };
      // through the first moments of a change of clip, the hips stay where they were
      const pin = this.step === 'lieDown' ? 1 - ramp(t, 0.0, 0.5) : 0;
      this.spec.pose = (c) => {
        if (pin > 0) pinHips(c, this.Hs, pin);
        this.pillow(c, ct);
      };
      void act;
      if (this.step === 'lieDown' && t >= T) {
        this.to(this.sleepy ? 'drowse' : 'rest');
      } else if (this.step === 'getUp' && ct <= 0) {
        // seated on the edge again: up onto her feet
        const r = seatRoot(ch, this.seat, this.y0);
        this.x = r.x;
        this.y = r.y;
        this.z = r.z;
        this.h = Math.PI;
        this.to('standUp');
      }
      return;
    }
    if (this.step === 'rest' || this.step === 'drowse' || this.step === 'asleep' || this.step === 'wake' || this.step === 'unrest') {
      // lying along the bed: the hips kept on the mattress whichever clip lies her there
      const He = this.He;
      const clip = this.step === 'rest' ? 'lieBack' : this.step === 'unrest' || (this.step === 'wake' && t > 1.4) ? 'lieDown' : 'lieSide';
      const T = ch.clips.lieDown.duration;
      this.spec = clip === 'lieDown' ? { clip, time: T, rate: 0, fade: 1.1, noFit: true } : { clip, fade: 1.3, noFit: true };
      this.spec.pose = (c) => {
        pinHips(c, He, 1);
        this.pillow(c, T);
      };
      if (this.step === 'drowse') {
        this.spec.eyes = ramp(t, 1.4, 2.6);
        if (t > 2.4 && !this.slept) {
          this.slept = true;
          this.home.sleepNow();
        }
      } else if (this.step === 'asleep') {
        this.spec.eyes = 1;
      } else if (this.step === 'wake') {
        this.spec.eyes = 1 - ramp(t, 0.3, 0.9);
        if (t > 2.6) this.to('getUp');
      } else if (this.step === 'unrest' && t > 1.1) this.to('getUp');
      return;
    }
    if (this.step === 'standUp') {
      const T = ch.clips.standUp.duration;
      this.spec = { clip: 'standUp', fade: 0.4, seat: { lift: Math.max(0, this.seat.top + 0.1 - ch.sitHips) } };
      const pin = 1 - ramp(t, 0, 0.4);
      this.spec.pose = pin > 0 ? (c) => pinHips(c, this.Hs, pin) : null;
      if (t >= T - 0.3) this.to(this.woke ? 'stretch' : 'end');
      return;
    }
    if (this.step === 'stretch') {
      this.spec = { clip: 'stretch', fade: 0.4, mood: [0.3, 0.4] };
      if (t >= 5.2) this.to('end');
      return;
    }
    if (this.step === 'end') {
      this.home.player.holdAt(null, { x: this.x, y: this.y0, z: this.z });
      this.finish();
    }
  }
  // her head on the pillow: lying, the neck bends a little so the head rests on it, not in it
  pillow(ch, ct) {
    const k = ramp(ct, 3.2, 4.4);
    if (k <= 0) return;
    const fwd = toWorld(this.h, 1, 0, _w); // her left, the axis the neck bends about
    turnBone(ch, 'neck', fwd, 0.22 * k);
    turnBone(ch, 'head', fwd, 0.16 * k);
  }
  // asleep through the fade (systems/home.js HomeLife.sleepNow), awake again
  asleep() {
    this.to('asleep');
  }
  wakeUp() {
    this.woke = true;
    this.to('wake');
  }
  interact() {
    if (this.step === 'rest') this.to('unrest');
  }
  prompt() {
    return this.step === 'rest' ? '起き上がる' : null;
  }
  rider() {
    if (this.step === 'walk') return null;
    return { x: this.x, y: this.y, z: this.z, h: this.h, look: null, ...this.spec };
  }
}

// ---- sitting on a seat (desk chair, sofa)
class SeatRoutine extends Routine {
  // seat: { x, z, h, top }; clip: the loop while seated
  // via: in round that side (and back out that way once up)
  begin(seat, loopClip, pivotAt, via = null) {
    this.seat = seat;
    this.loopClip = loopClip;
    this.y0 = this.it.y;
    this.out = via;
    const r = seatRoot(this.ch, seat, this.y0);
    this.goTo(r.x, r.z, seat.h, () => {
      this.to('sitDown');
      this.hold(pivotAt?.x ?? r.x, this.y0, pivotAt?.z ?? r.z, 1.0);
    }, via);
  }
  lift() {
    return { lift: Math.max(0, this.seat.top + 0.1 - this.ch.sitHips) };
  }
  seated(dt) {} // the routine's own while seated
  update(dt) {
    if (this.tick(dt)) return;
    const ch = this.ch, t = this.t;
    if (this.step === 'sitDown') {
      this.spec = { clip: 'sitDown', fade: 0.25, seat: this.lift() };
      if (t >= ch.clips.sitDown.duration - 0.25) {
        this.to('seated');
        this.onSeated?.();
      }
      return;
    }
    if (this.step === 'seated') {
      this.spec = { clip: this.loopClip, fade: 0.4, seat: this.lift() };
      this.seated(dt);
      return;
    }
    if (this.step === 'standUp') {
      this.spec = { clip: 'standUp', fade: 0.35, seat: this.lift() };
      if (t >= ch.clips.standUp.duration - 0.3) {
        const P = this.home.player;
        P.holdAt(null, { x: this.x, y: this.y0, z: this.z });
        if (this.out) {
          // out the way she came, round the side
          P.walkTo(this.out.x, this.out.z, { near: 9, r: 0.15 });
          this.to('stepOut');
        } else this.finish();
      }
      return;
    }
    if (this.step === 'stepOut') {
      const A = this.home.player.auto;
      if (!A || A.done || A.stuck > 0.6 || t > 3) {
        this.home.player.walkTo(null);
        this.finish();
      }
    }
  }
  rider() {
    return this.step === 'stepOut' ? null : super.rider();
  }
  interact() {
    if (this.step === 'seated') this.getUp();
  }
  getUp() {
    this.onUp?.();
    this.to('standUp');
  }
  prompt() {
    return this.step === 'seated' ? '立ち上がる' : null;
  }
}

class SofaRoutine extends SeatRoutine {
  // (in front of her, a little to a side: she and the TV's light on her face)
  views(h) {
    return [{ yaw: h + 0.65, pitch: -0.2 }, { yaw: h - 0.65, pitch: -0.2 }];
  }
  start() {
    const s = this.it.seat;
    this.begin({ x: s.x, z: s.z, h: s.face, top: s.h }, 'sitHands');
    this.onSeated = () => {
      this.home.tv.setOn(true);
      this.home.audio?.sfx?.('ui');
      this.nextLaugh = 6 + Math.random() * 6;
    };
    this.onUp = () => this.home.tv.setOn(false);
  }
  seated(dt) {
    const tired = this.home.body.tired;
    // she watches; now and then she laughs (or, tired, nods off)
    this.nextLaugh -= dt;
    if (this.react) {
      this.react.t += dt;
      this.spec = { clip: this.react.clip, fade: 0.4, seat: this.lift() };
      if (this.react.t > this.ch.clips[this.react.clip].duration - 0.4) this.react = null;
    } else if (this.nextLaugh <= 0) {
      this.react = { clip: tired ? 'doze' : 'sitLaugh', t: 0 };
      this.nextLaugh = tired ? 7 + Math.random() * 5 : 14 + Math.random() * 12;
    }
    this.spec.look = this.home.tv.mesh.position;
    this.spec.lookW = 0.8;
    this.spec.mood = tired ? [0.05, 0.1, 0.15] : [this.react?.clip === 'sitLaugh' ? 0.8 : 0.3, 0.4];
  }
}

class DeskRoutine extends SeatRoutine {
  // (over her shoulder: the diary and her hand)
  views(h) {
    return [{ yaw: h + 2.3, pitch: -0.34 }, { yaw: h - 2.3, pitch: -0.34 }];
  }
  start() {
    const C = HOME.chair, D = HOME.desk;
    this.D = D;
    // the chair stands pulled out: she comes round its side (the side she comes from) to
    // between it and the desk, sits on it there, then draws it (and herself) in
    const side = this.home.player.pos.z < C.z ? -1 : 1;
    this.begin({ x: C.x - 0.02, z: C.z, h: -Math.PI / 2, top: HOME.f2 + 0.47 - this.it.y }, 'write', null, { x: C.x - 0.3, z: C.z + side * 0.62 });
    this.scoot = 0;
  }
  update(dt) {
    // drawing the chair in under the desk once seated (and out again before getting up)
    if (this.step === 'seated' || this.step === 'scootOut') {
      const want = this.step === 'seated' ? 1 : 0;
      const prev = this.scoot;
      this.scoot += Math.sign(want - this.scoot) * Math.min(Math.abs(want - this.scoot), dt / 0.9);
      const d = (this.scoot - prev) * (HOME.chair.x - HOME.chair.near);
      this.x -= d;
      this.home.chair.offset = this.scoot * (HOME.chair.x - HOME.chair.near);
      if (this.step === 'scootOut') {
        this.t += dt;
        this.spec = { clip: 'sit', fade: 0.4, seat: this.lift() };
        if (this.scoot <= 0) this.to('standUp');
        return;
      }
    }
    super.update(dt);
  }
  seated() {
    // the diary opens once she sits close; the pen in her hand
    const near = this.scoot > 0.95;
    this.spec.clip = near ? 'write' : 'sit';
    this.home.diary.open = near;
    this.home.pen.visible = near && this.t > 0.6;
    this.spec.look = (this.lookAt ||= new THREE.Vector3()).set(this.D.x0 + 0.33, this.D.top, HOME.chair.z);
    this.spec.lookW = 0.9;
    if (near && !this.shown) {
      this.shown = true;
      this.home.openDiary();
    }
  }
  getUp() {
    this.home.diary.open = false;
    this.home.pen.visible = false;
    this.home.closeDiary();
    this.to('scootOut');
  }
  diaryShut() {
    if (this.step === 'seated') this.getUp();
  }
  rider() {
    const r = super.rider();
    if (r && this.home.pen.visible) {
      r.pose = (ch) => this.home.holdInHand(ch, this.home.pen, 'right', PEN_GRIP);
    }
    return r;
  }
}
// where a held thing sits in her hand (the hand bone's frame): position, then turn (euler)
const PEN_GRIP = { p: [0.02, -0.035, 0.06], r: [0.9, 0.0, 0.3] };
const CUP_GRIP = { p: [0.045, -0.06, 0.03], r: [0, 0, 1.45] };
const POT_GRIP = { p: [0.05, -0.04, 0.0], r: [0, 1.57, 1.5] };

// ---- tea
class TeaRoutine extends Routine {
  // (behind her to a side: the teapot, the cup and her hands on the counter)
  views(h) {
    return [{ yaw: h + Math.PI - 1.05, pitch: -0.3 }, { yaw: h + Math.PI + 1.05, pitch: -0.3 }];
  }
  start() {
    const S = this.it.stand;
    this.goTo(S.x, S.z, S.face, () => this.to('reachPot'));
  }
  update(dt) {
    if (this.tick(dt)) return;
    const H = this.home, t = this.t;
    const pot = H.teapot, cup = H.cup;
    if (this.step === 'reachPot') {
      this.spec = { clip: 'idle', fade: 0.3 };
      this.handK = ramp(t, 0.1, 0.7);
      this.handTo = pot.userData.handle;
      if (t > 0.75) {
        H.grab(pot, 'right');
        this.to('pour');
      }
      return;
    }
    if (this.step === 'pour') {
      // lift it over the cup, tip it, tea runs, set it back
      this.handK = 1;
      const lift = ramp(t, 0, 0.6) * (1 - ramp(t, 2.6, 3.2));
      const tip = ramp(t, 0.7, 1.2) * (1 - ramp(t, 2.1, 2.6));
      const c = cup.userData.rest;
      const p0 = pot.userData.handle;
      this.handTo = (this.handAt ||= new THREE.Vector3()).copy(p0).lerp(_v.set(c.x + 0.1, c.y + 0.2, c.z + 0.02), lift);
      this.tip = tip;
      H.pour = tip > 0.6 ? 1 : 0;
      if (t > 1.3 && !this.filled) {
        this.filled = true;
        H.audio?.sfx?.('pour');
      }
      if (t > 3.25) {
        H.letGo(pot);
        this.to('reachCup');
      }
      return;
    }
    if (this.step === 'reachCup') {
      this.handK = ramp(t, 0.0, 0.5);
      this.handTo = cup.userData.grip;
      this.tip = 0;
      if (t > 0.55) {
        H.grab(cup, 'right');
        H.steam.at = cup;
        this.to('drink');
      }
      return;
    }
    if (this.step === 'drink') {
      // the drinking clip lifts it to her lips; the hand eases from the counter into it
      this.spec = { clip: 'drink', fade: 0.6 };
      this.handK = 1 - ramp(t, 0.0, 0.9);
      const T = this.ch.clips.drink.duration;
      if (t >= Math.min(T, 6.2) - 0.2) this.to('putDown');
      return;
    }
    if (this.step === 'putDown') {
      this.spec = { clip: 'idle', fade: 0.6 };
      this.handK = ramp(t, 0.0, 0.7);
      this.handTo = cup.userData.grip;
      if (t > 0.8 && !this.down) {
        this.down = true;
        H.letGo(cup);
      }
      if (t > 1.3) {
        this.handK = 0;
        H.player.holdAt(null, { x: this.x, y: this.y, z: this.z });
        this.finish();
      }
    }
  }
  rider() {
    const r = super.rider();
    if (!r) return r;
    r.look = this.home.cup.position;
    r.lookW = 0.8;
    r.pose = (ch) => {
      if (this.handK > 0 && this.handTo) {
        // (leaning in over the counter a little as the hand goes out: the arm keeps a bend)
        const lean = toWorld(this.h, 1, 0, _u);
        turnBone(ch, 'spine', lean, 0.1 * this.handK);
        turnBone(ch, 'chest', lean, 0.05 * this.handK);
        reach(ch, 'right', this.handTo, this.handK, _p.set(0.6, -0.5, -0.4).applyAxisAngle(UP, this.h).normalize());
      }
      this.home.holdHeld(ch, this.tip ?? 0);
    };
    return r;
  }
}

// ---- kneeling on the cushion in the 和室
class KneelRoutine extends Routine {
  // (from across the low table)
  views(h) {
    return [{ yaw: h + 0.8, pitch: -0.32 }, { yaw: h - 0.8, pitch: -0.32 }];
  }
  start() {
    const S = this.it.seat;
    this.goTo(S.x, S.z, S.face, () => {
      this.to('down');
      this.y = S.y + 0.065; // standing on the cushion
      this.hold(this.x, this.y, this.z, 0.95);
    });
  }
  // Down on one knee (the take, a little slower than taken: kneeling, not dropping), the other
  // knee down (kneeling upright), then back onto her heels: 正座, her hands resting on her
  // thighs. Getting up is the same backwards.
  update(dt) {
    if (this.tick(dt)) return;
    const T = this.ch.clips.kneel.duration, t = this.t;
    let k = 0, kh = 0, kf = 0;
    if (this.step === 'down') {
      this.spec = { clip: 'kneel', time: 0, rate: 0.8, fade: 0.3, noFit: true };
      if (t >= T / 0.8 - 0.05) this.to('settle');
    } else if (this.step === 'settle') {
      this.spec = { clip: 'kneelIdle', fade: 0.7, noFit: true, mood: [0.2, 0.6] };
      kf = ramp(t, 0.0, 0.6);
      k = ramp(t, 0.6, 1.6);
      kh = ramp(t, 1.0, 1.8);
      if (t >= 1.8) this.to('seiza');
    } else if (this.step === 'seiza') {
      this.spec = { clip: 'kneelIdle', fade: 0.7, noFit: true, mood: [0.2, 0.6] };
      k = kh = kf = 1;
    } else if (this.step === 'up') {
      this.spec = { clip: 'kneelIdle', fade: 0.7, noFit: true };
      k = 1 - ramp(t, 0.1, 1.0);
      kh = 1 - ramp(t, 0, 0.45);
      kf = 1 - ramp(t, 0.55, 1.05);
      if (t >= 1.05) this.to('rise');
    } else if (this.step === 'rise') {
      this.spec = { clip: 'kneel', time: T, rate: -1, fade: 0.6, noFit: true };
      if (t >= T - 0.05) {
        this.home.player.holdAt(null, { x: this.x, y: this.it.y, z: this.z });
        this.finish();
      }
    }
    this.kSeiza = k;
    if (k <= 0.001 && kh <= 0.001 && kf <= 0.001) return;
    const V3 = (this._v3 ||= Array.from({ length: 8 }, () => new THREE.Vector3()));
    this.spec.pose = (ch) => {
      seiza(ch, k, this.h, V3, kf);
      if (kh <= 0.001) return;
      ch.root.updateMatrixWorld(true);
      const fwd = toWorld(this.h, 0, 1, V3[1]);
      for (const s of ['left', 'right']) {
        const hip = ch.node(s + 'UpperLeg').getWorldPosition(V3[2]);
        const knee = ch.node(s + 'LowerLeg').getWorldPosition(V3[3]);
        // on top of the thigh two thirds of the way to the knee, the wrist a little behind
        const target = hip.lerp(knee, 0.62);
        target.y += 0.085;
        target.addScaledVector(fwd, -0.05);
        const pole = toWorld(this.h, s === 'left' ? 0.8 : -0.8, -0.6, V3[4]);
        pole.y = -0.35;
        reach(ch, s, target, kh, pole.normalize());
      }
    };
  }
  // (sitting back onto her heels she comes forward on the cushion as much: knees near its
  // front edge, heels on it)
  rider() {
    const r = super.rider();
    if (r && this.kSeiza > 0) {
      r.x += Math.sin(this.h) * 0.17 * this.kSeiza;
      r.z += Math.cos(this.h) * 0.17 * this.kSeiza;
    }
    return r;
  }
  interact() {
    if (this.step === 'seiza') this.to('up');
  }
  prompt() {
    return this.step === 'seiza' ? '立ち上がる' : null;
  }
}

// 正座 from kneeling upright (k: how far): the knees, shins and feet stay where they lie on the
// cushion; the hips swing back and down round the knees (the thighs keep their length) until
// she sits on her heels, the thighs laid along her calves; the legs are aimed at their knees
// and ankles again, the feet keep their turn. kf: the shins laid flat (the clip kneels with
// them rising behind her, the feet up off the cushion), the feet turned down with them
const _sq = [new THREE.Quaternion(), new THREE.Quaternion()], _qf = new THREE.Quaternion();
function seiza(ch, k, h, V3, kf = 1) {
  if (k <= 0.001 && kf <= 0.001) return;
  ch.root.updateMatrixWorld(true);
  const fwd = toWorld(h, 0, 1, V3[0]);
  const legs = ['left', 'right'].map((s, i) => {
    const up = ch.node(s + 'UpperLeg'), lo = ch.node(s + 'LowerLeg'), ft = ch.node(s + 'Foot');
    const H = up.getWorldPosition(new THREE.Vector3()), K = lo.getWorldPosition(new THREE.Vector3()), A = ft.getWorldPosition(new THREE.Vector3());
    return { up, lo, ft, H, K, A, q: ft.getWorldQuaternion(_sq[i]) };
  });
  if (kf > 0.001) {
    for (const l of legs) {
      const sh = l.A.clone().sub(l.K);
      const len = sh.length();
      const back = sh.clone().setY(0);
      if (back.lengthSq() < 1e-6) back.copy(fwd).negate();
      else back.normalize();
      // (the ankle a touch below the knee: the top of the foot down, the kneecap's thickness)
      const flat = l.K.clone().addScaledVector(back, len);
      flat.y = l.K.y - 0.012;
      const A2 = l.A.clone().lerp(flat, kf);
      _qf.setFromUnitVectors(sh.divideScalar(len), A2.clone().sub(l.K).normalize());
      l.q.premultiply(_qf);
      l.A.copy(A2);
    }
  }
  const Hm = V3[5].copy(legs[0].H).add(legs[1].H).multiplyScalar(0.5);
  const Km = V3[6].copy(legs[0].K).add(legs[1].K).multiplyScalar(0.5);
  const off = V3[7].copy(Hm).sub(Km);
  const L = off.length();
  // the leg roots' bearing from the knees in her forward/up plane: kneeling up (as taken) to
  // back over the heels, a little higher than the knees (the thighs on the calves)
  const b0 = -off.dot(fwd), v0 = off.y;
  const lat = off.clone().addScaledVector(fwd, b0).setY(0); // (any sideways part, kept)
  const p0 = Math.atan2(b0, v0), p1 = Math.atan2(Math.sqrt(Math.max(0, L * L - 0.13 * 0.13)), 0.13);
  const p = p0 + (p1 - p0) * k;
  const target = Km.clone().addScaledVector(fwd, -Math.sin(p) * L).add(lat);
  target.y = Km.y + Math.cos(p) * L;
  // the hips moved by as much
  const hips = ch.node('hips');
  const hp = hips.getWorldPosition(new THREE.Vector3()).add(target.sub(Hm));
  hips.parent.worldToLocal(hp);
  hips.position.copy(hp);
  hips.updateMatrixWorld(true);
  for (const l of legs) {
    const H2 = l.up.getWorldPosition(new THREE.Vector3()), K1 = l.lo.getWorldPosition(new THREE.Vector3());
    ch._rotateWorld(l.up, K1.sub(H2).normalize(), l.K.clone().sub(H2).normalize());
    l.up.updateMatrixWorld(true);
    const K2 = l.lo.getWorldPosition(new THREE.Vector3()), A1 = l.ft.getWorldPosition(new THREE.Vector3());
    ch._rotateWorld(l.lo, A1.sub(K2).normalize(), l.A.clone().sub(K2).normalize());
    l.lo.updateMatrixWorld(true);
    l.ft.quaternion.copy(l.ft.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(l.q));
    l.ft.updateMatrixWorld(true);
  }
}

// ---- the balcony rail
class BalconyRoutine extends Routine {
  // (from along the balcony: her and the view)
  views(h) {
    return [{ yaw: h + 1.9, pitch: -0.12 }, { yaw: h - 1.9, pitch: -0.12 }];
  }
  start() {
    // (rail: the inner edge of the wall's cap, its top)
    const R = this.it.rail;
    this.rail = R;
    this.goTo(this.it.x, R.z - 0.31, 0, () => {
      this.to('lean');
      this.hold(this.x, this.y, this.z, 1.32);
      this.home.toast(viewLine(this.home.tod.hour));
    });
  }
  update(dt) {
    if (this.tick(dt)) return;
    const t = this.t;
    if (this.step === 'lean' || this.step === 'back') {
      const k = this.step === 'lean' ? ramp(t, 0.1, 0.9) : 1 - ramp(t, 0, 0.7);
      this.k = k;
      this.spec = { clip: 'idle', fade: 0.4, mood: [0.35, 0.6] };
      if (this.step === 'back' && t > 0.75) {
        this.home.player.holdAt(null, { x: this.x, y: this.y, z: this.z });
        this.finish();
      }
    }
  }
  rider() {
    const r = super.rider();
    if (!r) return r;
    const k = this.k ?? 0;
    // the far shore and the sea to the south
    r.look = (this.lookAt ||= new THREE.Vector3()).set(this.x + 6, this.y + 0.3, this.z + 40);
    r.lookW = 0.7;
    // (a breeze off the sea in gusts, her hair given some weight against it: it has none of its
    // own, so a sideways pull alone, however light, lays it out flat like a cyclist's)
    const gust = 0.75 + 0.35 * Math.sin(this.t * 1.3) * Math.sin(this.t * 0.47 + 1.1);
    r.wind = _w.set(0.06 * gust, -0.35, -0.085 * gust);
    r.pose = (ch) => {
      if (k <= 0.001) return;
      const side = toWorld(this.h, 1, 0, _u);
      turnBone(ch, 'spine', side, 0.13 * k);
      turnBone(ch, 'chest', side, 0.1 * k);
      for (const [s, dx] of [['left', 0.21], ['right', -0.21]]) {
        const p = toWorld(this.h, dx, 0, _p);
        const target = new THREE.Vector3(this.x + p.x, this.rail.y + 0.04, this.rail.z + 0.02);
        reach(ch, s, target, k, toWorld(this.h, dx > 0 ? 1 : -1, -0.6, new THREE.Vector3()).setY(-0.6).normalize());
      }
    };
    return r;
  }
  interact() {
    if (this.step === 'lean') this.to('back');
  }
  prompt() {
    return this.step === 'lean' ? 'もどる' : null;
  }
}
function viewLine(h) {
  if (h >= 4.5 && h < 9) return '朝の光で、海がきらきらしている。';
  if (h >= 9 && h < 16) return '桜坂の向こうに、青い海が見える。';
  if (h >= 16 && h < 19) return '夕焼けが町の屋根を染めていく。';
  return '町の灯りと、遠くの灯台の光。';
}

// ---- the wardrobe
class WardrobeRoutine extends Routine {
  // (behind her to a side: the open doors and the clothes)
  views(h) {
    return [{ yaw: h + Math.PI - 0.75, pitch: -0.22 }, { yaw: h + Math.PI + 0.75, pitch: -0.22 }];
  }
  start() {
    const S = this.it.stand;
    const kn = this.home.wardrobe.knob('R', _v);
    this.goTo(S.x - 0.18, S.z, headingTo(S.x - 0.18, S.z, kn.x, kn.z), () => this.to('open'));
  }
  update(dt) {
    if (this.tick(dt)) return;
    const W = this.home.wardrobe, t = this.t;
    if (this.step === 'open') {
      this.spec = { clip: 'open', time: 0, fade: 0.25 };
      const grab = ramp(t, 0.45, 0.85), pull = ramp(t, 0.95, 1.75);
      (W.drive ||= {}).R = 0.75 * pull;
      this.handK = grab * (1 - ramp(t, 1.75, 2.05));
      if (t > 1.95) {
        W.target.R = 1.75;
        W.a.R = Math.max(W.a.R, 0.75);
        this.handK = 0;
        this.to('choose');
        this.home.chooseOutfit((i) => this.picked(i));
      }
      return;
    }
    if (this.step === 'choose') {
      this.spec = { clip: 'idle', fade: 0.5 };
      return;
    }
    if (this.step === 'change') {
      // reach in for them; a sparkle and she has changed; a look in the mirror
      this.spec = { clip: 'idle', fade: 0.4 };
      this.reachIn = ramp(t, 0.0, 0.6) * (1 - ramp(t, 1.2, 1.7));
      if (t > 0.6 && !this.flashed) {
        this.flashed = true;
        this.home.changeInto(this.pick).then(() => (this.changed = true));
      }
      if (this.changed && t > 1.8) this.to('mirror');
      return;
    }
    if (this.step === 'mirror') {
      const M = HOME.mirror;
      const hm = headingTo(this.x, this.z, M.x, M.z);
      if (this.hFrom === undefined) this.hFrom = this.h;
      this.h = lerpAngle(this.hFrom, hm, ramp(t, 0, 0.6));
      this.spec = { clip: 'happy', fade: 0.4, mood: [0.85, 0.3] };
      if (t > 3.2) {
        this.hFrom = undefined;
        this.to('close');
      }
      return;
    }
    if (this.step === 'close') {
      // back to the door, a hand on it, it swings shut
      const kn = W.knob('R', _v);
      if (this.hFrom === undefined) this.hFrom = this.h;
      this.h = lerpAngle(this.hFrom, headingTo(this.x, this.z, kn.x, kn.z), ramp(t, 0, 0.5));
      this.spec = { clip: 'idle', fade: 0.4 };
      this.handK = ramp(t, 0.4, 0.8) * (1 - ramp(t, 1.5, 1.8));
      if (t > 0.8) W.target.R = 0;
      if (t > 1.9) {
        this.home.player.holdAt(null, { x: this.x, y: this.y, z: this.z });
        this.finish();
      }
    }
  }
  picked(i) {
    if (i === null || i === this.home.avatar.outfit) {
      this.to('close');
      return;
    }
    this.pick = i;
    this.to('change');
  }
  rider() {
    const r = super.rider();
    if (!r) return r;
    const W = this.home.wardrobe;
    r.pose = (ch) => {
      if (this.handK > 0) {
        const kn = W.knob('R', _w);
        kn.addScaledVector(toWorld(this.h, 0, 1, _u), -0.06);
        reach(ch, 'right', kn, this.handK, _p.set(0.4, -1, -0.3).applyAxisAngle(UP, this.h).normalize());
      }
      if (this.reachIn > 0) {
        const Wd = HOME.wardrobe;
        for (const [s, dx] of [['right', 0.35], ['left', 0.12]]) {
          const target = _w.set(Wd.x0 + 0.7 + dx, HOME.f2 + 1.18, Wd.z1 - 0.12);
          reach(ch, s, target, this.reachIn, _p.set(s === 'right' ? 0.5 : -0.5, -1, -0.2).applyAxisAngle(UP, this.h).normalize());
        }
      }
    };
    return r;
  }
}

const ROUTINES = { door: DoorRoutine, bed: BedRoutine, wardrobe: WardrobeRoutine, desk: DeskRoutine, sofa: SofaRoutine, tea: TeaRoutine, zabuton: KneelRoutine, balcony: BalconyRoutine };

// ---------------------------------------------------------------------------- the house
export class HomeLife {
  // deps: { player, avatar, body, tod, weather, audio, ui, toast, materials }
  constructor(world, scene, deps) {
    Object.assign(this, deps);
    this.world = world;
    const M = world.materials;
    const homeMat = M.propsHome.material;
    this.light = M.home.material.uniforms.uLight.value;
    this.door = new FrontDoor(scene, M.toon.material, world.colliders);
    this.door.onShut = () => this.audio?.sfx?.('doorShut');
    this.wardrobe = new WardrobeDoors(scene, homeMat);
    this.tv = new Television(scene);
    this.steam = new Steam(scene);
    // the desk chair (it moves in and out with her)
    const C = HOME.chair;
    this.chair = built((b) => chairPiece(b, 0xd4b083, 0xf6c3cf), homeMat);
    this.chair.rotation.y = -Math.PI / 2;
    scene.add(this.chair);
    this.chair.offset = 0;
    this.chairCol = world.colliders.addDynamicBox(0.21, 0.21, 0, HOME.f2 + 0.62, HOME.f2 - 0.4);
    this.chairCol.off = false;
    // her diary on the desk, shut or open; a pen
    const D = HOME.desk;
    this.diary = { open: false };
    this.diaryShut = built((b) => {
      b.boxMM(-0.11, 0, -0.15, 0.11, 0.022, 0.15, { color: 0xf2b6c4 });
      b.boxMM(-0.105, 0.003, -0.148, 0.108, 0.02, 0.146, { color: 0xfbf7ee });
      b.boxMM(-0.07, 0.022, -0.06, 0.07, 0.024, 0.06, { color: 0xfbe4ea });
      b.boxMM(-0.112, 0.004, 0.06, -0.106, 0.02, 0.14, { color: 0xd88a9c });
    }, homeMat);
    this.diaryOpen = built((b) => {
      b.boxMM(-0.22, 0, -0.15, 0.22, 0.012, 0.15, { color: 0xf2b6c4 });
      for (const s of [-1, 1]) {
        b.boxMM(s > 0 ? 0.003 : -0.215, 0.012, -0.145, s > 0 ? 0.215 : -0.003, 0.02, 0.145, { color: 0xfdfaf2 });
        for (let k = 0; k < 9; k++) b.boxMM(s > 0 ? 0.02 : -0.2, 0.0205, -0.12 + k * 0.028, s > 0 ? 0.2 : -0.02, 0.021, -0.118 + k * 0.028, { color: 0xc8d4e0 });
      }
      for (let k = 0; k < 5; k++) b.boxMM(-0.19, 0.0212, -0.11 + k * 0.028, -0.06 - (k % 2) * 0.04, 0.0216, -0.106 + k * 0.028, { color: 0x6a6a78 });
    }, homeMat);
    for (const d of [this.diaryShut, this.diaryOpen]) {
      d.position.set(D.x0 + 0.3, D.top, HOME.chair.z + 0.02);
      d.rotation.y = Math.PI / 2;
      scene.add(d);
    }
    this.pen = built((b) => {
      b.rod(V(0, -0.06, 0), V(0, 0.07, 0), 0.0045, 0.0045, 6, 0x2a5aa8);
      b.rod(V(0, -0.07, 0), V(0, -0.06, 0), 0.001, 0.0045, 6, 0xd8d8d8);
    }, homeMat);
    this.pen.visible = false;
    scene.add(this.pen);
    // the teapot and her cup on the tray
    const T = HOME.teaSpot;
    this.teapot = built((b) => kyusu(b, 0, 0, 0, 0x6d7d68, 1.15), homeMat);
    this.cup = built((b) => yunomi(b, 0, 0, 0, 0xf3c6cf, 1.2), homeMat);
    this.teapot.position.set(T.x - 0.02, T.y, T.z + 0.03);
    this.teapot.rotation.y = Math.PI / 2;
    this.cup.position.set(T.x + 0.13, T.y, T.z + 0.05);
    this.teapot.userData.rest = this.teapot.position.clone();
    this.teapot.userData.restRot = this.teapot.rotation.clone();
    this.cup.userData.rest = this.cup.position.clone();
    // where her hand takes them (the wrist, a little off the handle / the cup's side)
    this.teapot.userData.handle = new THREE.Vector3(T.x - 0.02, T.y + 0.1, T.z + 0.17);
    this.cup.userData.grip = new THREE.Vector3(T.x + 0.13, T.y + 0.06, T.z + 0.13);
    scene.add(this.teapot, this.cup);
    this.held = new Map(); // object -> hand
    this.pour = 0;
    // the tea pouring: a thin amber stream from the spout
    this.stream = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.006, 1, 6), new THREE.MeshBasicMaterial({ color: 0xc9a85a, transparent: true, opacity: 0.8 }));
    this.stream.visible = false;
    scene.add(this.stream);

    // her shoes, left neatly in the entrance (toes to the door) while she is in her socks
    this.shoes = {};
    for (const kind of new Set(SHOE_KIND)) {
      const m = built((b) => shoePair(b, kind), homeMat);
      m.position.set(40.22, HOME.doma, -25.25);
      m.rotation.y = -Math.PI / 2;
      m.visible = false;
      scene.add(m);
      this.shoes[kind] = m;
    }

    this.routine = null;
    this.lightK = 1;
    this.away = 0;
    this.lit = new THREE.Color(1, 1, 1);
  }

  get busy() {
    return !!this.routine;
  }
  get active() {
    return !!this.routine;
  }

  // start what she does at a spot
  use(it) {
    if (this.routine) return;
    const R = ROUTINES[it.what];
    if (!R) return;
    if (it.what === 'bed') {
      if (this.body.canSleep) this.audio?.sfx?.('ui');
      else {
        // (up less than eight hours: she lies down a while, but cannot sleep yet)
        const d = hoursMinutes(Math.max(1 / 60, this.body.untilSleepy));
        this.toast?.(d.h ? `まだ眠くない（あと${d.h}時間${d.m}分くらいで眠れそう）。少し横になろう。` : `まだ眠くない（あと${d.m}分くらいで眠れそう）。少し横になろう。`, 4);
      }
    }
    this.routine = new R(this, it);
    this.avatar.home = this;
    this.routine.start();
  }

  // E (or A) while busy
  interact() {
    this.routine?.interact();
  }
  prompt() {
    return this.routine?.prompt() ?? null;
  }
  // what the avatar does this frame (null: walking by herself)
  rider() {
    return this.routine?.rider() ?? null;
  }

  // the bed's spot says how long she would sleep (or how long until she is sleepy)
  labels() {
    for (const it of this.world.interactables) {
      if (it.kind !== 'home' || it.what !== 'bed') continue;
      if (this.body.canSleep) {
        const d = hoursMinutes(this.body.sleepFor);
        it.label = d.m ? `眠る（約${d.h}時間${d.m}分）` : `眠る（約${d.h}時間）`;
      } else it.label = 'ベッドに横になる';
    }
  }

  // asleep: the screen goes dark, the night goes by, she wakes
  sleepNow() {
    const R = this.routine;
    const hours = this.body.sleepFor;
    const from = this.tod.hour;
    this.sleeping = true;
    this.ui.sleep?.({ from, hours }, {
      dark: () => {
        R?.asleep?.();
        this.body.sleep(hours);
        this.weather?.skip?.(hours);
      },
      done: () => {
        this.sleeping = false;
        R?.wakeUp?.();
        const d = hoursMinutes(hours);
        this.toast?.(d.m ? `おはよう。${d.h}時間${d.m}分ぐっすり眠った。` : `おはよう。${d.h}時間ぐっすり眠った。`, 4);
      },
    });
  }

  chooseOutfit(cb) {
    if (this.ui.chooseOutfit) this.ui.chooseOutfit(this.avatar.outfit, cb);
    else cb(null);
  }
  // put on outfit i behind a sparkle; resolves once she wears it
  async changeInto(i) {
    this.ui.sparkle?.();
    this.audio?.sfx?.('ui');
    try {
      await this.onOutfit?.(i);
    } catch {
      /* stays as she was */
    }
  }
  // the diary page on the screen; shutting it, she puts the pen down and gets up
  openDiary() {
    this.ui.openDiary?.(this.diaryPage?.(), () => this.routine?.diaryShut?.());
  }
  closeDiary() {
    this.ui.closeDiary?.();
  }

  // something in her hand: put it at the grip (hand bone frame)
  holdInHand(ch, obj, side, grip) {
    const hand = ch.node(side === 'right' ? 'rightHand' : 'leftHand');
    hand.updateMatrixWorld(true);
    obj.position.set(...grip.p).applyMatrix4(hand.matrixWorld);
    hand.getWorldQuaternion(_q);
    obj.quaternion.copy(_q).multiply(_q2.setFromEuler(new THREE.Euler(...grip.r)));
  }
  grab(obj, side) {
    this.held.set(obj, side);
  }
  letGo(obj) {
    this.held.delete(obj);
    obj.position.copy(obj.userData.rest);
    if (obj.userData.restRot) obj.rotation.copy(obj.userData.restRot);
    else obj.rotation.set(0, 0, 0);
    if (obj === this.cup) this.steam.at = obj;
  }
  // (from the pose hook) the held things follow her hand; the teapot tips to pour
  holdHeld(ch, tip = 0) {
    for (const [obj, side] of this.held) {
      const grip = obj === this.teapot ? POT_GRIP : CUP_GRIP;
      this.holdInHand(ch, obj, side, grip);
      if (obj === this.teapot && tip > 0) obj.rotateX(-0.9 * tip);
    }
  }

  // the room light: daylight, the lamps on when she is home after dark, low while she sleeps,
  // out when she is away at night
  _light(dt) {
    const h = this.tod.hour, p = this.player.pos;
    const home = HOME.inside(p.x, p.y, p.z) || HOME.onBalcony(p.x, p.y, p.z);
    const night = h < 6.2 || h > 18.2 ? 1 : h > 17.0 ? (h - 17.0) / 1.2 : h < 7.2 ? 7.2 - h : 0;
    let r = 1.0, g = 0.98, b = 0.95;
    if (night > 0) {
      // lamps on (warm) when she is in, otherwise the dark house and a little moonlight
      const on = home ? 1 : 0;
      const lr = 1.02, lg = 0.93, lb = 0.82;
      const dr = 0.34, dg = 0.38, db = 0.52;
      const k = Math.min(1, night);
      r = r + ((on ? lr : dr) - r) * k;
      g = g + ((on ? lg : dg) - g) * k;
      b = b + ((on ? lb : db) - b) * k;
    }
    if (this.sleeping || this.routine?.step === 'asleep') {
      r = 0.3;
      g = 0.32;
      b = 0.45;
    }
    const L = this.light;
    const kk = Math.min(1, dt * 2.5);
    L.r += (r - L.r) * kk;
    L.g += (g - L.g) * kk;
    L.b += (b - L.b) * kk;
    this.roomLight = home ? L : null;
  }

  update(dt) {
    this._light(dt);
    this.door.update(dt);
    // nobody left inside the doorway: the door shuts itself after a while
    const p = this.player.pos;
    if (!this.routine && this.door.target > 0) {
      const dz = Math.abs(p.z - (HOME.door.z0 + HOME.door.z1) / 2), dx = p.x - HOME.door.x;
      if (dz > 0.9 || dx > 0.9 || dx < -1.3) this.door.target = 0;
    }
    this.wardrobe.update(dt);
    const kind = SHOE_KIND[this.avatar.outfit] ?? 'canvas';
    for (const k in this.shoes) this.shoes[k].visible = !!this.avatar.shoesOff && k === kind;
    // the chair, drawn in (offset toward the desk)
    const C = HOME.chair;
    this.chair.position.set(C.x - this.chair.offset, HOME.f2, C.z);
    this.chairCol.cx = this.chair.position.x;
    this.chairCol.cz = C.z;
    this.chairCol.off = !!this.routine && this.routine.it.what === 'desk' && this.routine.step !== 'walk';
    this.diaryShut.visible = !this.diary.open;
    this.diaryOpen.visible = this.diary.open;
    if (this.tv.on) this.tv.update(dt, this.forecast());
    this.steam.strength = 1;
    this.steam.update(dt);
    // tea running from the spout into the cup
    this.stream.visible = this.pour > 0 && this.held.has(this.teapot);
    if (this.stream.visible) {
      const sp = _v.set(0, 0.055, -0.15).applyMatrix4(this.teapot.matrixWorld);
      const cp = _w.copy(this.cup.position).setY(this.cup.position.y + 0.07);
      this.stream.position.copy(sp).add(cp).multiplyScalar(0.5);
      this.stream.scale.set(1, sp.distanceTo(cp), 1);
      this.stream.quaternion.setFromUnitVectors(UP, _u.copy(sp).sub(cp).normalize());
    }
    if (this.routine) {
      this.routine.update(dt);
      if (this.routine.done) this.end();
    }
    this.labels();
  }

  end() {
    const R = this.routine;
    this.routine = null;
    this.avatar.home = null;
    this.player.walkTo(null);
    this.player.holdAt(null);
    for (const obj of [...this.held.keys()]) this.letGo(obj);
    this.pour = 0;
    if (R?.it.what === 'desk') this.chair.offset = 0;
  }

  // the forecast on the TV: now, in a few hours, tomorrow morning
  forecast() {
    const W = this.weather, h = this.tod.hour;
    const kindAt = (later) => {
      const rainNow = W.raining;
      const change = W.auto && W.spell !== undefined && later >= W.spell;
      const r = change ? !rainNow : rainNow;
      const hh = (h + later) % 24;
      return r ? 'rain' : hh > 18.5 || hh < 5 ? 'moon' : 'sun';
    };
    const lbl = (later, base) => `${base}`;
    const slots = [
      { label: lbl(0, 'いま'), kind: kindAt(0) },
      { label: lbl(3, '3時間後'), kind: kindAt(3) },
      { label: lbl(12, 'あした'), kind: kindAt(14) },
    ];
    for (const s of slots) s.text = s.kind === 'rain' ? '雨' : s.kind === 'moon' ? '晴れ' : '晴れ';
    return {
      slots,
      clock: this.tod.label,
      date: dateLabel(dateOf(this.tod.abs)),
      ticker: W.raining ? '雨の日は足もとに気をつけて。傘をお忘れなく。' : '桜ヶ浜の桜は今が見ごろ。週末は海辺のプロムナードがにぎわいそうです。',
    };
  }
}

export { MIN_AWAKE };
