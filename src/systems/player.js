import * as THREE from 'three';
import { G } from '../render/materials.js';
import { outsideDist, terrainH, shoreZ, BOUNDS, inRiver, riverLevel, SEAWALL_Z } from '../world/layout.js';
import { onRoute, HARBOR } from '../world/routeplan.js';
import { ISLAND, islandWalk, pathNear, PATH_W } from '../world/islandplan.js';

// The walker: keyboard + mouse (pointer lock or drag), touch joystick, gamepad.
// Feet position is kept on the walkable height field; colliders push back.
// Two views: third person (the camera on a boom behind the protagonist, pulled in by walls,
// ceilings and floors above; the mouse wheel sets its length) and first person.

const EYE = 1.58;
const RADIUS = 0.32;
const HEAD = 1.78; // the top of her hair over her feet (a jump stops under a lintel)
const STEP = 0.55;
// third person: walking and running pace (the protagonist's own stride), boom pivot height
const TP_WALK = 1.45, TP_RUN = 5.0;
const PIVOT = 1.32, PIVOT_SIT = 1.0;
const BOOM_MIN = 1.4, BOOM_MAX = 6;

export class Player {
  constructor(camera, colliders, dom) {
    this.camera = camera;
    this.col = colliders;
    this.dom = dom;
    this.pos = new THREE.Vector3(30, 0, -20);
    this.vel = new THREE.Vector3();
    this.vy = 0;
    this.yaw = Math.PI;
    this.pitch = -0.04;
    this.onGround = true;
    this.eyeY = 0;
    this.keys = new Set();
    this.enabled = false;
    this.sensitivity = 1;
    this.invertY = false;
    this.run = false;
    this.sitting = null;
    this.bob = 0;
    this.bobAmount = 1;
    this.stepDist = 0;
    this.onStep = null;
    this.moveInput = new THREE.Vector2();
    this.touchMove = new THREE.Vector2();
    this.padMove = new THREE.Vector2();
    this.padLook = new THREE.Vector2();
    this.padRun = false;
    this.lookDelta = new THREE.Vector2();
    this.dragging = false;
    this.pointerLocked = false;
    this.speed = 0;
    this.skipMoves = 0;
    this.moveAvg = 0; // recent mouse motion per event (spike filter)
    this.lastBig = false;
    this.view = 'third';
    this.boom = 2.7; // wanted camera distance (third person)
    this.boomNow = 2.7; // after collisions
    this.indoors = []; // rooms: { x0, x1, z0, z1, y0, y1 } (y1: ceiling)
    this.ride = null; // the bicycle while she rides it (see systems/bicycle.js)
    this.padBrake = 0;
    this.lookIdle = 0; // seconds since the view was last turned by hand
    this._dt = 0;
    // at home (systems/home.js): walking to a spot by herself, then held where she is busy
    this.auto = null; // { x, z, done, stuck }
    this.held = null; // { x, y, z, pivot }
    this.holdInput = 0; // how hard the stick / keys are pushed meanwhile
    this.tired = 0; // 0..1 (systems/body.js): slower, no sprint
    this._bindEvents();
  }

  place(x, z, yaw = this.yaw, pitch = this.pitch) {
    this.pos.set(x, this.col.groundAt(x, z), z);
    this.eyeY = this.pos.y + EYE;
    this.yaw = yaw;
    this.pitch = pitch;
    this.vy = 0;
    this.sitting = null;
    this.applyCamera();
  }

  _bindEvents() {
    const isTyping = (e) => e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA');
    addEventListener('keydown', (e) => {
      if (isTyping(e)) return;
      this.keys.add(e.code);
      if (e.code === 'Space' && this.enabled) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => {
      this.keys.clear();
      this.dragging = false;
    });
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === this.dom;
      this.skipMoves = 2; // browsers can report a large bogus delta right after locking
    });
    addEventListener('mousemove', (e) => {
      if (!this.enabled) return;
      if (this.skipMoves > 0) {
        this.skipMoves--;
        return;
      }
      // drag-to-look ends when the button is no longer held (released outside the window)
      if (this.dragging && !(e.buttons & 1)) this.dragging = false;
      if (!this.pointerLocked && !this.dragging) return;
      // Browsers occasionally report one huge bogus jump under pointer lock; a lone event far
      // above the recent motion is dropped (a real flick ramps up and its next event passes).
      const m = Math.hypot(e.movementX, e.movementY);
      const big = m > this.moveAvg * 4 + 50;
      this.moveAvg += (Math.min(m, 150) - this.moveAvg) * 0.3;
      if (big && !this.lastBig) {
        this.lastBig = true;
        return;
      }
      this.lastBig = big;
      // and a cap on any single step keeps fast swings controllable
      this.lookDelta.x += THREE.MathUtils.clamp(e.movementX, -110, 110);
      this.lookDelta.y += THREE.MathUtils.clamp(e.movementY, -110, 110);
    });
    this.dom.addEventListener('mousedown', (e) => {
      if (!this.enabled || e.button !== 0) return;
      if (!this.pointerLocked) this.dragging = true;
    });
    addEventListener('mouseup', () => (this.dragging = false));
    this.dom.addEventListener(
      'wheel',
      (e) => {
        if (!this.enabled || this.view !== 'third') return;
        e.preventDefault();
        this.boom = THREE.MathUtils.clamp(this.boom * Math.exp(e.deltaY * 0.0012), BOOM_MIN, BOOM_MAX);
      },
      { passive: false },
    );
  }

  setView(v) {
    this.view = v;
    // looking up from below the boom is not much use: keep the pitch in a friendly range
    if (v === 'third') this.pitch = THREE.MathUtils.clamp(this.pitch, -0.9, 0.5);
    this.applyCamera();
  }

  // Raw mouse motion (no OS pointer acceleration) where supported, so a quick turn of the
  // wrist doesn't swing the view much further than a slow one; plain lock elsewhere.
  requestLock() {
    const plain = () => {
      try {
        const p = this.dom.requestPointerLock?.();
        if (p && p.catch) p.catch(() => {});
      } catch {
        /* pointer lock not available: drag-to-look still works */
      }
    };
    try {
      const p = this.dom.requestPointerLock?.({ unadjustedMovement: true });
      if (p && p.catch) p.catch((err) => (err?.name === 'NotSupportedError' ? plain() : null));
    } catch {
      plain();
    }
  }

  // touch input hooks (set by the UI)
  setTouchMove(x, y) {
    this.touchMove.set(x, y);
  }
  addLook(dx, dy) {
    this.lookDelta.x += dx;
    this.lookDelta.y += dy;
  }
  // swing the view round to (yaw, pitch) over a moment (a routine at home showing what she
  // does); looking round yourself takes over at once
  viewTo(yaw, pitch, secs = 1.6) {
    this.camGoal = { yaw, pitch, t: secs };
  }

  sit(spot) {
    this.sitting = spot;
    this.vy = 0;
    // where she sat down from: always a place she can stand (see stand)
    this.sitFrom = { x: this.pos.x, y: this.pos.y, z: this.pos.z };
    // first person: looking out the way the seat faces; third person: the camera swings round
    // in front of her (benches often stand against a wall)
    this.yaw = this.view === 'third' ? spot.yaw + Math.PI - 0.6 : spot.yaw;
    this.pitch = this.view === 'third' ? -0.18 : -0.05;
  }

  // walk to (x, z) by herself at a walking pace (null: stop)
  // o.near / o.r: within `near` of the spot her margin from furniture shrinks to r (she walks
  // right up to the bed's edge, the chair)
  walkTo(x, z, o = {}) {
    this.auto = x === null || x === undefined ? null : { x, z, done: false, stuck: 0, best: Infinity, near: o.near ?? 0, r: o.r ?? RADIUS };
  }

  // keep her where a routine has her ({ x, y, z, pivot }; the camera follows, looking round
  // still works), or let go (at pos)
  holdAt(h, pos = null) {
    this.held = h;
    if (!h && pos) {
      this.pos.set(pos.x, pos.y, pos.z);
      this.vel.set(0, 0, 0);
      this.vy = 0;
      this.onGround = true;
      // (let go right by the furniture: she eases out of its margin instead of popping out)
      this.ease = 0.8;
    }
  }

  stand() {
    if (!this.sitting) return;
    const s = this.sitting;
    this.sitting = null;
    // step off the seat (whatever the camera looks at): off the front of a bench, back from a
    // counter or a table, to a side in a booth; only onto clear floor at the seat's own level,
    // with nothing (a wall, a railing) between the seat and there. Failing all of those, back
    // to where she sat down from.
    const fx = -Math.sin(s.yaw), fz = -Math.cos(s.yaw);
    const floor = s.y - 0.45;
    const C = this.col;
    const free = (x, z) => {
      const p = { x, z };
      C.resolve(p, RADIUS, floor);
      return Math.hypot(p.x - x, p.z - z) < 0.03 && Math.abs(C.groundAt(x, z, floor + 0.3) - floor) < 0.35;
    };
    // the way there: no wall or railing across it (the seat itself left out)
    const clear = (x, z) => {
      const d = Math.hypot(x - s.x, z - s.z);
      for (let t = 0.45; t < d; t += 0.05) {
        const k = t / d;
        if (C.solidAt(s.x + (x - s.x) * k, s.z + (z - s.z) * k, floor)) return false;
      }
      return true;
    };
    let at = null;
    const tries = [[0.8, 0], [0.65, 0], [0.55, 0], [0.7, 0.5], [0.7, -0.5], [0.45, 0], [0, 0.7], [0, -0.7], [-0.7, 0], [-0.6, 0.45], [-0.6, -0.45], [-0.85, 0], [0, 0.95], [0, -0.95]];
    for (const [d, side] of tries) {
      const x = s.x + fx * d + fz * side, z = s.z + fz * d - fx * side;
      if (free(x, z) && clear(x, z)) {
        at = [x, z];
        break;
      }
    }
    if (!at && this.sitFrom) {
      this.pos.set(this.sitFrom.x, this.sitFrom.y, this.sitFrom.z);
      return;
    }
    if (!at) at = [s.x + fx * 0.8, s.z + fz * 0.8];
    this.pos.set(at[0], C.groundAt(at[0], at[1], floor + 0.3), at[1]);
  }

  update(dt) {
    this._dt = dt;
    // look
    const k = 0.0017 * this.sensitivity;
    this.yaw -= this.lookDelta.x * k;
    this.pitch -= this.lookDelta.y * k * (this.invertY ? -1 : 1);
    // controller look (rates in rad/s at full tilt)
    if (this.enabled) {
      this.yaw -= this.padLook.x * 2.7 * this.sensitivity * dt;
      this.pitch -= this.padLook.y * 1.9 * this.sensitivity * dt * (this.invertY ? -1 : 1);
    }
    this.pitch = this.view === 'third' ? THREE.MathUtils.clamp(this.pitch, -1.1, 0.6) : THREE.MathUtils.clamp(this.pitch, -1.45, 1.45);
    const looked = this.lookDelta.x || this.lookDelta.y || Math.abs(this.padLook.x) > 0.05 || Math.abs(this.padLook.y) > 0.05;
    this.lookIdle = looked ? 0 : this.lookIdle + dt;
    if (this.camGoal) {
      const g = this.camGoal;
      if (looked) this.camGoal = null;
      else {
        const k = Math.min(1, dt * 2.6);
        this.yaw += Math.atan2(Math.sin(g.yaw - this.yaw), Math.cos(g.yaw - this.yaw)) * k;
        if (g.pitch !== undefined) this.pitch += (g.pitch - this.pitch) * k;
        g.t -= dt;
        if (g.t <= 0) this.camGoal = null;
      }
    }
    this.lookDelta.set(0, 0);
    if (!this.enabled) {
      this.applyCamera();
      return;
    }
    // input
    let ix = 0, iz = 0;
    const K = this.keys;
    if (K.has('KeyW') || K.has('ArrowUp')) iz += 1;
    if (K.has('KeyS') || K.has('ArrowDown')) iz -= 1;
    if (K.has('KeyA') || K.has('ArrowLeft')) ix -= 1;
    if (K.has('KeyD') || K.has('ArrowRight')) ix += 1;
    ix += this.touchMove.x + this.padMove.x;
    iz += this.touchMove.y + this.padMove.y;
    const len = Math.hypot(ix, iz);
    if (len > 1) {
      ix /= len;
      iz /= len;
    }
    if (this.ride) {
      // on the bicycle: forward pedals, back brakes, sideways steers (each at full strength,
      // not shared out like a walking direction); Shift / RT / the stick pushed all the way:
      // up out of the saddle
      const kz = THREE.MathUtils.clamp((K.has('KeyW') || K.has('ArrowUp') ? 1 : 0) - (K.has('KeyS') || K.has('ArrowDown') ? 1 : 0) + this.touchMove.y + this.padMove.y, -1, 1);
      const kx = THREE.MathUtils.clamp((K.has('KeyD') || K.has('ArrowRight') ? 1 : 0) - (K.has('KeyA') || K.has('ArrowLeft') ? 1 : 0) + this.touchMove.x + this.padMove.x, -1, 1);
      const boost = this.run || this.padRun || K.has('ShiftLeft') || K.has('ShiftRight') || Math.hypot(this.touchMove.x, this.touchMove.y) > 0.92;
      this.running = false;
      this.ride.drive(dt, { ix: kx, iz: kz, boost, brake: this.padBrake }, this);
      this.applyCamera();
      return;
    }
    if (this.held) {
      const h = this.held;
      this.holdInput = len;
      this.pos.set(h.x, h.y, h.z);
      this.vel.set(0, 0, 0);
      this.vy = 0;
      this.onGround = true;
      this.stairs = null;
      this.speed = 0;
      this._jumpReq = false;
      this.eyeY = h.y + EYE;
      this.applyCamera();
      return;
    }
    if (this.sitting) {
      if (len > 0.3) this.stand();
      else {
        const s = this.sitting;
        this.pos.set(s.x, s.y - 0.45, s.z);
        this.eyeY += (s.y + 0.78 - this.eyeY) * Math.min(1, dt * 6);
        this.speed = 0;
        this.applyCamera();
        return;
      }
    }
    const running = !this.auto && (this.run || this.padRun || K.has('ShiftLeft') || K.has('ShiftRight') || Math.hypot(this.touchMove.x, this.touchMove.y) > 0.92);
    this.running = running;
    let maxSpeed = this.view === 'third' ? (running ? TP_RUN : TP_WALK) : running ? 6.2 : 3.1;
    // tired: a heavier step, and no more than a jog
    if (this.tired > 0) maxSpeed = running ? THREE.MathUtils.lerp(maxSpeed, maxSpeed * 0.5, this.tired) : maxSpeed * (1 - 0.3 * this.tired);
    // on stairs she takes one tread a step, briskly (about three steps a second, five running)
    if (this.stairs && this.view === 'third') maxSpeed = THREE.MathUtils.clamp(this.stairs.run * (running ? 5.0 : 3.2), running ? 1.3 : 0.75, running ? 2.6 : 1.3);
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const rx = -fz, rz = fx;
    let wantX = (fx * iz + rx * ix) * maxSpeed;
    let wantZ = (fz * iz + rz * ix) * maxSpeed;
    // walking to a spot by herself: straight there, easing in at the end
    const A = this.auto;
    if (A && !A.done) {
      const dx = A.x - this.pos.x, dz = A.z - this.pos.z, d = Math.hypot(dx, dz);
      if (d < 0.03) {
        A.done = true;
        wantX = wantZ = 0;
        this.vel.set(0, 0, 0);
      } else {
        const sp = Math.min(TP_WALK * 0.9, 0.35 + d * 2.2);
        wantX = (dx / d) * sp;
        wantZ = (dz / d) * sp;
        // (blocked: it gives up after a while rather than walking into a wall for ever)
        if (d < A.best - 0.01) {
          A.best = d;
          A.stuck = 0;
        } else A.stuck += dt;
      }
    } else if (A && A.done) {
      wantX = wantZ = 0;
    }
    const acc = this.onGround ? 10 : 2;
    this.vel.x += (wantX - this.vel.x) * Math.min(1, dt * acc);
    this.vel.z += (wantZ - this.vel.z) * Math.min(1, dt * acc);

    // jump / gravity
    if (this.onGround && !this.auto && (K.has('Space') || this._jumpReq)) {
      this.vy = 4.6;
      this.onGround = false;
    }
    this._jumpReq = false;

    // horizontal move with step-height check (axis separated for sliding)
    // (and still once there, until the routine takes her over: no shove out of the margin)
    const near = A && A.near > 0 && (A.done || Math.hypot(A.x - this.pos.x, A.z - this.pos.z) < A.near);
    const rad = near ? A.r : RADIUS;
    if (this.ease > 0) this.ease -= dt;
    const tryMove = (dx, dz) => {
      const nx = this.pos.x + dx, nz = this.pos.z + dz;
      const p = { x: nx, z: nz };
      this.col.resolve(p, rad, this.pos.y);
      if (this.ease > 0) {
        const k = Math.min(1, dt * 6);
        p.x = nx + (p.x - nx) * k;
        p.z = nz + (p.z - nz) * k;
      }
      const g = this.col.groundAt(p.x, p.z, this.pos.y);
      if (g - this.pos.y > STEP && !(this.vy > 0 && g - this.pos.y < 1.1)) return false;
      if (!this.allowed(p.x, p.z, g)) return false;
      this.pos.x = p.x;
      this.pos.z = p.z;
      return true;
    };
    const mx = this.vel.x * dt, mz = this.vel.z * dt;
    const x0 = this.pos.x, z0 = this.pos.z;
    if (!tryMove(mx, mz)) {
      if (!tryMove(mx, 0)) this.vel.x = 0;
      if (!tryMove(0, mz)) this.vel.z = 0;
    }
    // the way she really went (against a wall: nowhere, or sliding along it), so she does not
    // walk on the spot into it and her steps are not heard
    if (dt > 0) {
      const ax = (this.pos.x - x0) / dt, az = (this.pos.z - z0) / dt;
      const want = Math.hypot(this.vel.x, this.vel.z), got = Math.hypot(ax, az);
      if (got < want * 0.9) {
        const k = want > 1e-4 ? got / want : 0;
        this.vel.x = this.vel.x * k;
        this.vel.z = this.vel.z * k;
        if (got > 0.05) {
          this.vel.x = ax;
          this.vel.z = az;
        }
      }
    }
    // vertical
    const g = this.col.groundAt(this.pos.x, this.pos.z, this.pos.y);
    this.vy -= 13 * dt;
    this.pos.y += this.vy * dt;
    // rising into a lintel or a beam: the head stops there
    if (this.vy > 0) {
      const top = this.col.ceilingAt(this.pos.x, this.pos.z, this.pos.y + 1.0, RADIUS * 0.7);
      if (this.pos.y + HEAD > top) {
        this.pos.y = Math.max(g, top - HEAD);
        this.vy = 0;
      }
    }
    if (this.pos.y <= g) {
      if (!this.onGround && this.vy < -6 && this.onLand) this.onLand(-this.vy);
      this.pos.y = g;
      this.vy = 0;
      this.onGround = true;
    } else if (this.pos.y - g < 0.25 && this.vy <= 0) {
      // stick to ramps / stairs when walking down
      this.pos.y = g;
      this.vy = 0;
      this.onGround = true;
    } else {
      this.onGround = false;
    }
    if (this.onGround) {
      this.lastGround = g;
      // the safety net: in deep water (shoved off a landing, set down beside it), back to where
      // she last stood dry
      if (!this._deep(this.pos.x, this.pos.z, g)) (this.dry ||= new THREE.Vector3()).copy(this.pos);
      else if (this.dry) {
        this.pos.copy(this.dry);
        this.vel.set(0, 0, 0);
        this.lastGround = this.pos.y;
      }
    }

    this._probeStairs(dt);
    // smooth eye height (stairs feel soft) + head bob
    this.speed = Math.hypot(this.vel.x, this.vel.z);
    const targetEye = this.pos.y + EYE;
    if (this.onGround) this.eyeY += (targetEye - this.eyeY) * Math.min(1, dt * 14);
    else this.eyeY = targetEye;
    if (this.onGround && this.speed > 0.4) {
      this.bob += dt * this.speed * 2.1;
      this.stepDist += this.speed * dt;
      const tp = this.view === 'third' && this.strides;
      const stride = this.stairs ? this.stairs.run : tp ? (running ? this.strides.run : this.strides.walk) : running ? 1.7 : 1.25;
      if (this.stepDist > stride) {
        this.stepDist = 0;
        if (this.onStep) this.onStep(this.surface(), running);
      }
    }
    this.applyCamera();
  }

  // Stairs under her: the ground along the way she walks rises (or falls) in two or more
  // sharp steps within ±0.45 m (a ramp rises smoothly, a kerb is a single step). Sets
  // this.stairs = { dir: +1 up / -1 down, rise, run, rampY } or null; rampY is the height of
  // the line through the treads at her position (the ground averaged over one tread), which
  // the protagonist's body follows instead of hopping tread to tread.
  _probeStairs(dt) {
    const sp = Math.hypot(this.vel.x, this.vel.z);
    if (!this.onGround || this.sitting || sp < 0.15) {
      if (this.stairs && (this.stairHold = (this.stairHold ?? 0) - dt) <= 0) this.stairs = null;
      return;
    }
    const ux = this.vel.x / sp, uz = this.vel.z / sp, x = this.pos.x, z = this.pos.z, fy = this.pos.y + 0.3;
    const at = (d) => this.col.groundAt(x + ux * d, z + uz * d, fy + Math.max(0, d) * 0.9);
    const N = 13, h = [];
    for (let i = 0; i < N; i++) h.push(at((i - 6) * 0.075));
    const edges = [];
    for (let i = 1; i < N; i++) {
      const dh = h[i] - h[i - 1];
      if (Math.abs(dh) < 0.05 || Math.abs(dh) > 0.4) continue;
      // find the riser between the two samples
      let a = (i - 7) * 0.075, b = (i - 6) * 0.075;
      for (let k = 0; k < 4; k++) {
        const m = (a + b) / 2;
        if (Math.abs(at(m) - h[i - 1]) < Math.abs(dh) / 2) a = m;
        else b = m;
      }
      edges.push({ d: (a + b) / 2, dh });
    }
    const up = edges.filter((e) => e.dh > 0).length, down = edges.length - up;
    const ok = edges.length >= 2 && (up === 0 || down === 0);
    const keep = this.stairs && edges.length === 1 && Math.sign(edges[0].dh) === this.stairs.dir;
    if (!ok && !keep) {
      if (this.stairs && (this.stairHold = (this.stairHold ?? 0) - dt) <= 0) this.stairs = null;
      return;
    }
    this.stairHold = 0.25;
    const dir = ok ? (up ? 1 : -1) : this.stairs.dir;
    const rise = ok ? edges.reduce((s, e) => s + Math.abs(e.dh), 0) / edges.length : this.stairs.rise;
    const run = ok ? THREE.MathUtils.clamp((edges[edges.length - 1].d - edges[0].d) / (edges.length - 1), 0.2, 0.6) : this.stairs.run;
    // the ground averaged over one tread centred on her: a straight line through the treads
    const half = run / 2;
    let y = at(-half) * run;
    for (const e of edges) if (e.d > -half && e.d < half) y += e.dh * (half - e.d);
    this.stairs = { dir, rise, run, rampY: y / run };
  }

  allowed(x, z, g) {
    // out on 凪ノ島: its harbour, lanes, path and top (the rest is cliff and wood)
    if (x > ISLAND.x0 && x < ISLAND.x1 && z > ISLAND.z0 && z < ISLAND.z1) return islandWalk(x, z);
    if (x < BOUNDS.x0 || x > BOUNDS.x1 || z < BOUNDS.z0 || z > BOUNDS.z1) return false;
    // the hills are off limits but for the cycling loop's roads and the places along them
    if (outsideDist(x, z) > 18 && g > terrainH(x, z) - 0.01 && g > 22 && !onRoute(x, z)) return false;
    // the sea: from the beach no further than ankle-deep in the surf (the subway lies below sea
    // level, so only out past the shoreline); the river's mouth across the beach likewise
    if (g < -0.2 && z > shoreZ(x) - 4) return false;
    if (inRiver(x, z) && g < riverLevel(z) - 0.2) return false;
    // never off an edge into the water: from a landing, a quay, a deck, stairs or a wall, a step
    // (or a jump) that would drop her more than a stride into the sea or the river is a wall
    // (wading in from the sand drops no more than a step at a time)
    if (this.waterBelow(x, z, g) && (this.onGround ? this.pos.y : this.lastGround ?? this.pos.y) - g > 0.45) return false;
    // no wading up the walled river: only the stones, stairs and the open mouth on the beach
    if (z < SEAWALL_Z + 1.4 && inRiver(x, z) && g < riverLevel(z) - 0.02) return false;
    return true;
  }

  // the ground at x, z (g) lies under water: the sea's or the river's
  waterBelow(x, z, g) {
    const sea = G.uTide.value;
    if (g < sea + 0.05 && terrainH(x, z) < sea + 0.05) return true;
    return inRiver(x, z) && g < riverLevel(z) + 0.05;
  }
  // in water too deep to stand in (only ever by some mishap: see allowed)
  _deep(x, z, g) {
    return (g < -0.45 && z > shoreZ(x) - 4) || (inRiver(x, z) && g < riverLevel(z) - 0.45);
  }

  surface() {
    const { x, z } = this.pos;
    if (x > ISLAND.x0 && x < ISLAND.x1 && z > ISLAND.z0 && z < ISLAND.z1) return pathNear(x - ISLAND.x, z - ISLAND.z).d < PATH_W / 2 + 0.3 ? 'sand' : 'hard';
    if (inRiver(x, z) && this.pos.y < riverLevel(z) + 0.02) return 'water';
    // the fishing harbour's concrete quays and slipway, and anything built over the beach
    // (decks, steps) are hard going, not sand
    if (x > HARBOR.x0 && x < HARBOR.x1 && z < HARBOR.z1 && this.pos.y > HARBOR.y - 0.6) return 'hard';
    if (z > 73.5 && this.pos.y < 2.2 && this.pos.y - terrainH(x, z) > 0.15) return 'hard';
    if (z > 73.5 && this.pos.y < 2.2) {
      if (z > shoreZ(x) - 0.5) return 'water';
      return 'sand';
    }
    return 'hard';
  }

  jump() {
    this._jumpReq = true;
  }

  applyCamera() {
    if (this.view === 'third') {
      this._thirdPerson();
      return;
    }
    const c = this.camera;
    if (this.ride) {
      // on the saddle, leaning with the bike a little
      this.ride.eye(c.position);
      c.rotation.set(this.pitch, this.yaw, this.ride.roll * 0.3, 'YXZ');
      return;
    }
    const bob = this.onGround && !this.sitting ? Math.sin(this.bob) * 0.035 * this.bobAmount * Math.min(1, this.speed / 3) : 0;
    c.position.set(this.pos.x, (this.sitting ? this.eyeY : this.eyeY) + bob, this.pos.z);
    c.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }

  // Third person: the camera at the end of a boom from a pivot above the protagonist's
  // shoulders, pointing where you look. The boom stops short of walls, the room's ceiling,
  // a floor above (stacked levels) and the ground; it snaps in and eases back out.
  _thirdPerson() {
    const c = this.camera;
    const px = this.pos.x, pz = this.pos.z;
    // the pivot follows the feet smoothly (steps and stairs do not jolt the view)
    const want = this.pos.y + (this.held?.pivot ?? this.ride?.pivot ?? (this.sitting ? PIVOT_SIT : PIVOT));
    if (this.pivotY === undefined || !this.onGround || Math.abs(want - this.pivotY) > 2) this.pivotY = want;
    else this.pivotY += (want - this.pivotY) * Math.min(1, (this._dt || 0.016) * 10);
    const py = this.pivotY;
    const free = this.freeBoom(px, py, pz, this.yaw, this.pitch);
    const cp = Math.cos(this.pitch);
    const bx = Math.sin(this.yaw) * cp, by = -Math.sin(this.pitch), bz = Math.cos(this.yaw) * cp;
    if (free < this.boomNow) this.boomNow = free;
    else this.boomNow += (free - this.boomNow) * Math.min(1, (this._dt || 0.016) * 3);
    const d = this.boomNow;
    c.position.set(px + bx * d, py + by * d, pz + bz * d);
    c.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }

  // how far the camera can stand back from the pivot (px, py, pz) looking along yaw / pitch
  freeBoom(px, py, pz, yaw, pitch, max = this.boom) {
    const cp = Math.cos(pitch);
    const bx = Math.sin(yaw) * cp, by = -Math.sin(pitch), bz = Math.cos(yaw) * cp;
    const feet = this.pos.y;
    const room = this.indoors.find((r) => px > r.x0 && px < r.x1 && pz > r.z0 && pz < r.z1 && feet > r.y0 && feet < r.y1);
    const floorHere = this.col.groundAt(px, pz, feet + 0.3);
    for (let d = 0.25; d <= max; d += 0.08) {
      const x = px + bx * d, y = py + by * d, z = pz + bz * d;
      const g = this.col.groundAt(x, z, y);
      // (things lower than the camera, a bench under her, a low wall, are passed over)
      let hit = this.col.solidAt(x, z, y - 0.2) || y < g + 0.3 || this.col.movingAt(x, z, y);
      // nor under the sea (or close over it)
      if (!hit && g < G.uTide.value && y < G.uTide.value + 0.4) hit = true;
      // another level's floor between the pivot and the camera
      if (!hit && g > floorHere + 0.9 && g < y + 0.2) hit = true;
      if (!hit && room) hit = y > room.y1 - 0.3 || x < room.x0 + 0.2 || x > room.x1 - 0.2 || z < room.z0 + 0.2 || z > room.z1 - 0.2;
      if (hit) return Math.max(0.3, d - 0.3);
    }
    return max;
  }

  forward(out = new THREE.Vector3()) {
    return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }
}
