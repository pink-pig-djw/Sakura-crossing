import * as THREE from 'three';
import { outsideDist, terrainH, shoreZ } from '../world/layout.js';

// First-person walker: keyboard + mouse (pointer lock or drag), touch joystick.
// Feet position is kept on the walkable height field; colliders push back.

const EYE = 1.58;
const RADIUS = 0.32;
const STEP = 0.55;

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
    addEventListener('blur', () => this.keys.clear());
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
      if (this.pointerLocked || this.dragging) {
        const dx = THREE.MathUtils.clamp(e.movementX, -160, 160);
        const dy = THREE.MathUtils.clamp(e.movementY, -160, 160);
        this.lookDelta.x += dx;
        this.lookDelta.y += dy;
      }
    });
    this.dom.addEventListener('mousedown', (e) => {
      if (!this.enabled || e.button !== 0) return;
      if (!this.pointerLocked) this.dragging = true;
    });
    addEventListener('mouseup', () => (this.dragging = false));
  }

  requestLock() {
    try {
      const p = this.dom.requestPointerLock?.();
      if (p && p.catch) p.catch(() => {});
    } catch {
      /* pointer lock not available: drag-to-look still works */
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

  sit(spot) {
    this.sitting = spot;
    this.vy = 0;
    this.yaw = spot.yaw + Math.PI;
    this.pitch = -0.05;
  }

  stand() {
    if (!this.sitting) return;
    const s = this.sitting;
    this.sitting = null;
    // step forward off the bench
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    this.pos.set(s.x + fx * 0.8, this.col.groundAt(s.x + fx * 0.8, s.z + fz * 0.8), s.z + fz * 0.8);
  }

  update(dt) {
    // look
    const k = 0.0022 * this.sensitivity;
    this.yaw -= this.lookDelta.x * k;
    this.pitch -= this.lookDelta.y * k * (this.invertY ? -1 : 1);
    // controller look (rates in rad/s at full tilt)
    if (this.enabled) {
      this.yaw -= this.padLook.x * 2.7 * this.sensitivity * dt;
      this.pitch -= this.padLook.y * 1.9 * this.sensitivity * dt * (this.invertY ? -1 : 1);
    }
    this.pitch = THREE.MathUtils.clamp(this.pitch, -1.45, 1.45);
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
    const running = this.run || this.padRun || K.has('ShiftLeft') || K.has('ShiftRight') || Math.hypot(this.touchMove.x, this.touchMove.y) > 0.92;
    const maxSpeed = running ? 6.2 : 3.1;
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const rx = -fz, rz = fx;
    const wantX = (fx * iz + rx * ix) * maxSpeed;
    const wantZ = (fz * iz + rz * ix) * maxSpeed;
    const acc = this.onGround ? 10 : 2;
    this.vel.x += (wantX - this.vel.x) * Math.min(1, dt * acc);
    this.vel.z += (wantZ - this.vel.z) * Math.min(1, dt * acc);

    // jump / gravity
    const ground = this.col.groundAt(this.pos.x, this.pos.z);
    if (this.onGround && (K.has('Space') || this._jumpReq)) {
      this.vy = 4.6;
      this.onGround = false;
    }
    this._jumpReq = false;

    // horizontal move with step-height check (axis separated for sliding)
    const tryMove = (dx, dz) => {
      const nx = this.pos.x + dx, nz = this.pos.z + dz;
      const p = { x: nx, z: nz };
      this.col.resolve(p, RADIUS, this.pos.y);
      const g = this.col.groundAt(p.x, p.z);
      if (g - this.pos.y > STEP && !(this.vy > 0 && g - this.pos.y < 1.1)) return false;
      if (!this.allowed(p.x, p.z, g)) return false;
      this.pos.x = p.x;
      this.pos.z = p.z;
      return true;
    };
    const mx = this.vel.x * dt, mz = this.vel.z * dt;
    if (!tryMove(mx, mz)) {
      if (!tryMove(mx, 0)) this.vel.x = 0;
      if (!tryMove(0, mz)) this.vel.z = 0;
    }
    // vertical
    const g = this.col.groundAt(this.pos.x, this.pos.z);
    this.vy -= 13 * dt;
    this.pos.y += this.vy * dt;
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
    void ground;

    // smooth eye height (stairs feel soft) + head bob
    this.speed = Math.hypot(this.vel.x, this.vel.z);
    const targetEye = this.pos.y + EYE;
    if (this.onGround) this.eyeY += (targetEye - this.eyeY) * Math.min(1, dt * 14);
    else this.eyeY = targetEye;
    if (this.onGround && this.speed > 0.4) {
      this.bob += dt * this.speed * 2.1;
      this.stepDist += this.speed * dt;
      const stride = running ? 1.7 : 1.25;
      if (this.stepDist > stride) {
        this.stepDist = 0;
        if (this.onStep) this.onStep(this.surface(), running);
      }
    }
    this.applyCamera();
  }

  allowed(x, z, g) {
    if (x < -212 || x > 212 || z < -182 || z > 186) return false;
    if (outsideDist(x, z) > 18 && g > terrainH(x, z) - 0.01 && g > 22) return false;
    // deep water
    if (g < -0.65) return false;
    return true;
  }

  surface() {
    const { x, z } = this.pos;
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
    const c = this.camera;
    const bob = this.onGround && !this.sitting ? Math.sin(this.bob) * 0.035 * this.bobAmount * Math.min(1, this.speed / 3) : 0;
    c.position.set(this.pos.x, (this.sitting ? this.eyeY : this.eyeY) + bob, this.pos.z);
    c.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }

  forward(out = new THREE.Vector3()) {
    return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }
}
