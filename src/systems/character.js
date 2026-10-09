import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { createCharacterMaterial } from '../render/materials.js';

// A VRM character in the town's style, driven by retargeted motion capture.
//
// Layers, applied every frame on the normalized humanoid rig:
//   1. AnimationMixer: mocap clips (idle pose, walk cycle, bow, wave, nod, guide) with
//      cross-fades
//   2. procedural: breathing, head/neck turning toward a look target (eyes follow through
//      the VRM look-at), blinking and expressions
//   3. ground fitting: the hips settle and a two-bone IK puts each foot on the terrain
//      under it (the town is built on a slope)
// then VRM.update copies the pose to the skin and runs the hair / skirt spring bones.

const BASE = import.meta.env?.BASE_URL ?? './';

// file from the page's folder, or embedded (single-file builds: window.__ASSETS)
export async function loadAsset(path) {
  const inline = window.__ASSETS?.[path];
  if (inline) return Uint8Array.from(atob(inline), (c) => c.charCodeAt(0)).buffer;
  const r = await fetch(`${BASE}${path}`);
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.arrayBuffer();
}

const decode = (b64, Type) => new Type(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer);

// ideal T-pose bone axis of each retargeted bone (must match tools/anim/retarget.mjs)
const AXIS = {
  hips: [0, 1, 0], spine: [0, 1, 0], chest: [0, 1, 0], neck: [0, 1, 0], head: [0, 1, 0],
  leftShoulder: [1, 0, 0], leftUpperArm: [1, 0, 0], leftLowerArm: [1, 0, 0], leftHand: [1, 0, 0],
  rightShoulder: [-1, 0, 0], rightUpperArm: [-1, 0, 0], rightLowerArm: [-1, 0, 0], rightHand: [-1, 0, 0],
  leftUpperLeg: [0, -1, 0], leftLowerLeg: [0, -1, 0], leftFoot: [0, 0, 1], leftToes: [0, 0, 1],
  rightUpperLeg: [0, -1, 0], rightLowerLeg: [0, -1, 0], rightFoot: [0, 0, 1], rightToes: [0, 0, 1],
};
const CHILD = {
  hips: 'spine', spine: 'chest', chest: 'neck', neck: 'head',
  leftShoulder: 'leftUpperArm', leftUpperArm: 'leftLowerArm', leftLowerArm: 'leftHand', leftHand: 'leftMiddleProximal',
  rightShoulder: 'rightUpperArm', rightUpperArm: 'rightLowerArm', rightLowerArm: 'rightHand', rightHand: 'rightMiddleProximal',
  leftUpperLeg: 'leftLowerLeg', leftLowerLeg: 'leftFoot', leftFoot: 'leftToes',
  rightUpperLeg: 'rightLowerLeg', rightLowerLeg: 'rightFoot', rightFoot: 'rightToes',
};
// relaxed hands: [bone, curl (rad)] — fingers bend toward the palm
const FINGERS = [
  ['IndexProximal', 0.22], ['IndexIntermediate', 0.32], ['IndexDistal', 0.22],
  ['MiddleProximal', 0.28], ['MiddleIntermediate', 0.4], ['MiddleDistal', 0.26],
  ['RingProximal', 0.34], ['RingIntermediate', 0.45], ['RingDistal', 0.28],
  ['LittleProximal', 0.4], ['LittleIntermediate', 0.5], ['LittleDistal', 0.3],
];

// The capture actor's arms clear a wider body than a slim anime figure's: bring hanging
// arms in (rotation about the torso's forward axis on the local rotation, scaled by how far
// the arm hangs down, so raised arms are left alone)
const ADDUCT = { leftUpperArm: -0.3, rightUpperArm: 0.3, leftLowerArm: -0.14, rightLowerArm: 0.14, leftHand: -0.18, rightHand: 0.18 };

// bones the procedural layers touch (breathing, looking, ground fitting)
const PROCEDURAL = ['hips', 'chest', 'neck', 'head', 'leftShoulder', 'rightShoulder', 'leftUpperLeg', 'leftLowerLeg', 'leftFoot', 'rightUpperLeg', 'rightLowerLeg', 'rightFoot'];

const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3();

function materialFor(m) {
  const name = m.name || '';
  const map = m.map || m.uniforms?.map?.value || null;
  const shade = m.shadeColorFactor ? m.shadeColorFactor.clone() : new THREE.Color(0xb9b4d8);
  const base = { map, name: 'char:' + name, side: THREE.DoubleSide };
  if (/EYE|FaceMouth|FaceEyeline|FaceBrow/.test(name)) {
    // eyes, lashes, brows and mouth: flat, no ink lines, no cast shadows on them
    return createCharacterMaterial({ ...base, unlit: /Highlight/.test(name) ? 1 : 0.7, outline: 0, selfShadow: 0, soft: 0.3 });
  }
  if (/Face_00_SKIN/.test(name)) return createCharacterMaterial({ ...base, shade, shadeMix: 0.85, soft: 0.22, wrap: 0.12, selfShadow: 0.55, outline: 0.5, rim: 0.12 });
  if (/SKIN/.test(name)) return createCharacterMaterial({ ...base, shade, shadeMix: 0.8, soft: 0.08, wrap: 0.04 });
  if (/HAIR/.test(name)) return createCharacterMaterial({ ...base, shade: new THREE.Color(0.78, 0.74, 0.9), shadeMix: 0.5, soft: 0.05, rim: 0.3 });
  return createCharacterMaterial({ ...base, shade, shadeMix: 0.55, soft: 0.05 });
}

export class Character {
  // gltf: loaded with VRMLoaderPlugin; motions: tools/anim output
  constructor(gltf, motions, opts = {}) {
    const vrm = gltf.userData.vrm;
    this.vrm = vrm;
    VRMUtils.removeUnnecessaryVertices(gltf.scene);
    VRMUtils.combineSkeletons?.(gltf.scene);
    this.root = new THREE.Group();
    this.root.name = opts.name || 'character';
    this.root.add(vrm.scene);
    vrm.scene.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
      o.frustumCulled = false;
      o.material = Array.isArray(o.material) ? o.material.map(materialFor) : materialFor(o.material);
    });
    const H = vrm.humanoid;
    this.node = (b) => H.getNormalizedBoneNode(b);
    // bone hierarchy of the normalized rig
    this.boneOf = new Map();
    this.bones = [];
    for (const b of Object.keys(H.humanBones)) {
      const n = this.node(b);
      if (!n) continue;
      n.name = `N_${b}`;
      this.boneOf.set(n, b);
      this.bones.push(b);
    }
    this.parentOf = {};
    for (const b of this.bones) {
      let p = this.node(b).parent;
      while (p && !this.boneOf.has(p)) p = p.parent;
      this.parentOf[b] = p ? this.boneOf.get(p) : null;
    }
    // topological order (parents first)
    const depth = (b) => (this.parentOf[b] ? depth(this.parentOf[b]) + 1 : 0);
    this.bones.sort((a, b) => depth(a) - depth(b));
    // rest pose (T-pose, identity rotations): world positions in character space
    vrm.scene.updateMatrixWorld(true);
    const rest = {};
    for (const b of this.bones) rest[b] = this.node(b).getWorldPosition(new THREE.Vector3());
    this.rest = rest;
    this.hipsHeight = rest.hips.y;
    this.ankleHeight = (rest.leftFoot.y + rest.rightFoot.y) / 2;
    // per-bone correction: the model's own rest bone direction -> the ideal axis
    this.D = {};
    for (const b of Object.keys(AXIS)) {
      const c = CHILD[b] && (rest[CHILD[b]] ? CHILD[b] : b === 'chest' && rest.upperChest ? 'upperChest' : null);
      const ideal = new THREE.Vector3(...AXIS[b]);
      if (!rest[b] || !c) {
        this.D[b] = new THREE.Quaternion();
        continue;
      }
      const dir = rest[c].clone().sub(rest[b]).normalize();
      this.D[b] = new THREE.Quaternion().setFromUnitVectors(dir, ideal);
    }
    this.Dinv = Object.fromEntries(Object.entries(this.D).map(([b, q]) => [b, q.clone().invert()]));
    // relaxed fingers and thumbs (never animated by the clips)
    for (const side of ['left', 'right']) {
      const s = side === 'left' ? -1 : 1;
      for (const [f, a] of FINGERS) this.node(side + f)?.quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), s * a);
      this.node(side + 'ThumbMetacarpal')?.quaternion.setFromEuler(new THREE.Euler(0, -s * 0.35, s * 0.1));
      this.node(side + 'ThumbProximal')?.quaternion.setFromEuler(new THREE.Euler(0, -s * 0.25, 0));
      this.node(side + 'ThumbDistal')?.quaternion.setFromEuler(new THREE.Euler(0, -s * 0.2, 0));
    }

    // clips
    this.mixer = new THREE.AnimationMixer(vrm.scene);
    this.clips = {};
    this.info = {};
    for (const [name, c] of Object.entries(motions.clips)) {
      this.clips[name] = this._buildClip(name, c, motions);
      this.info[name] = { speed: c.speed * (this.hipsHeight / c.hipsHeight), loop: c.loop };
    }
    // idle: the actor standing at ease before a take (breathing is added on top)
    this.clips.idle = this._poseClip('idle', this.clips.stand, 0);
    this.info.idle = { speed: 0, loop: true };
    this.actions = {};
    for (const [n, clip] of Object.entries(this.clips)) {
      const a = this.mixer.clipAction(clip);
      if (!this.info[n].loop) {
        a.setLoop(THREE.LoopOnce, 1);
        a.clampWhenFinished = true;
      }
      this.actions[n] = a;
    }
    this.current = null;
    this.play('idle', 0);

    // procedural state
    this.t = Math.random() * 10;
    this.look = { target: null, weight: 0, yaw: 0, pitch: 0 };
    this.lookTarget = new THREE.Object3D();
    this.root.add(this.lookTarget);
    if (vrm.lookAt) {
      vrm.lookAt.target = this.lookTarget;
      vrm.lookAt.autoUpdate = true;
    }
    this.blinkT = 2 + Math.random() * 3;
    this.blink = 0;
    this.blinkPhase = -1;
    this.mood = { happy: 0, relaxed: 0.25 };
    this.moodTarget = { happy: 0, relaxed: 0.25 };
    this.mouth = 0;
    this.ground = opts.ground || (() => 0);
  }

  // world rotations of the clip -> local rotations of this model's normalized bones
  _buildClip(name, c, motions) {
    const nb = motions.bones.length, nf = c.frames;
    const rot = decode(c.rot, Int16Array);
    const pos = decode(c.hips, Int16Array);
    const scale = this.hipsHeight / c.hipsHeight;
    const idx = Object.fromEntries(motions.bones.map((b, i) => [b, i]));
    const n = c.loop ? nf + 1 : nf; // loops repeat their first key at the end
    const times = new Float32Array(n);
    const values = {};
    for (const b of this.bones) if (idx[b] !== undefined || b === 'upperChest') values[b] = new Float32Array(n * 4);
    const hipsPos = new Float32Array(n * 3);
    const W = {};
    for (let k = 0; k < n; k++) {
      const f = k % nf;
      times[k] = k / motions.fps;
      for (const b of this.bones) {
        const i = idx[b];
        if (i !== undefined) {
          const o = (f * nb + i) * 4;
          W[b] = (W[b] || new THREE.Quaternion()).set(rot[o] / 32767, rot[o + 1] / 32767, rot[o + 2] / 32767, rot[o + 3] / 32767).normalize().multiply(this.D[b]);
        } else {
          // bones the capture lacks (upper chest, fingers ...) follow their parent
          const p = this.parentOf[b];
          W[b] = (W[b] || new THREE.Quaternion()).copy(p ? W[p] : _q.identity());
        }
        if (!values[b]) continue;
        const p = this.parentOf[b];
        const local = _q2.copy(p ? W[p] : _q.identity()).invert().multiply(W[b]);
        if (ADDUCT[b]) {
          // how far this bone hangs below horizontal, in the character's frame
          const dir = _v.set(...AXIS[b]).applyQuaternion(_q3.copy(W[b]).multiply(this.Dinv[b]));
          const hang = THREE.MathUtils.clamp(-dir.y, 0, 1);
          local.premultiply(_q3.setFromAxisAngle(_v.set(0, 0, 1), ADDUCT[b] * hang));
        }
        local.toArray(values[b], k * 4);
      }
      hipsPos[k * 3] = (pos[f * 3] / 10000) * scale;
      hipsPos[k * 3 + 1] = (pos[f * 3 + 1] / 10000) * scale;
      hipsPos[k * 3 + 2] = (pos[f * 3 + 2] / 10000) * scale;
    }
    const tracks = Object.entries(values).map(([b, v]) => new THREE.QuaternionKeyframeTrack(`N_${b}.quaternion`, times, v));
    tracks.push(new THREE.VectorKeyframeTrack('N_hips.position', times, hipsPos));
    return new THREE.AnimationClip(name, times[n - 1], tracks);
  }

  // a one-frame looping clip holding the pose of `clip` at time t
  _poseClip(name, clip, t) {
    const tracks = clip.tracks.map((tr) => {
      const interp = tr.createInterpolant();
      const v = interp.evaluate(t).slice();
      return new tr.constructor(tr.name, [0, 1], [...v, ...v]);
    });
    return new THREE.AnimationClip(name, 1, tracks);
  }

  play(name, fade = 0.35, timeScale = 1) {
    const next = this.actions[name];
    if (!next) return;
    if (this.current === next) {
      if (!next.isRunning()) next.reset().play();
      next.timeScale = timeScale;
      return;
    }
    next.reset();
    next.timeScale = timeScale;
    next.enabled = true;
    next.setEffectiveWeight(1);
    next.play();
    if (this.current && fade > 0) this.current.crossFadeTo(next, fade, false);
    else if (this.current) this.current.stop();
    this.current = next;
    this.currentName = name;
  }

  // seconds left in a one-shot clip (0 when looping)
  remaining() {
    const a = this.current;
    if (!a || this.info[this.currentName].loop) return 0;
    return Math.max(0, (a.getClip().duration - a.time) / Math.max(a.timeScale, 1e-3));
  }

  // worldTarget: Vector3 to look at, or null
  lookAt(worldTarget, weight = 1) {
    this.look.target = worldTarget;
    this.look.goal = worldTarget ? weight : 0;
  }

  // after a teleport: let hair and skirt start from rest instead of swinging in
  resetPhysics() {
    this.root.updateMatrixWorld(true);
    this.vrm.springBoneManager?.reset();
  }

  setMood(happy, relaxed = 0.25) {
    this.moodTarget.happy = happy;
    this.moodTarget.relaxed = relaxed;
  }

  update(dt) {
    this.t += dt;
    // The mixer only writes a bone when its value changes (a held pose never does), so the
    // procedural layers below must not accumulate: put back the clip's pose first.
    const keep = this._keep || (this._keep = PROCEDURAL.map((b) => this.node(b)).filter(Boolean).map((node) => ({ node, q: new THREE.Quaternion(), p: new THREE.Vector3() })));
    if (this._kept) for (const k of keep) {
      k.node.quaternion.copy(k.q);
      k.node.position.copy(k.p);
    }
    this.mixer.update(dt);
    for (const k of keep) {
      k.q.copy(k.node.quaternion);
      k.p.copy(k.node.position);
    }
    this._kept = true;
    const n = this.node;

    // breathing: the upper chest rises a touch, shoulders follow
    const br = Math.sin(this.t * (Math.PI * 2) / 3.6);
    n('upperChest')?.quaternion.setFromAxisAngle(_v.set(1, 0, 0), -0.018 * br);
    for (const s of ['left', 'right']) {
      const sh = n(s + 'Shoulder');
      if (sh) sh.quaternion.multiply(_q.setFromAxisAngle(_v.set(0, 0, 1), (s === 'left' ? 1 : -1) * 0.012 * (br * 0.5 + 0.5)));
    }

    // head turn toward the look target, spread over neck and head
    const L = this.look;
    L.weight += ((L.goal || 0) - L.weight) * Math.min(1, dt * 3);
    let yaw = 0, pitch = 0;
    const head = n('head');
    if (L.target && head) {
      this.root.updateMatrixWorld(true);
      head.getWorldPosition(_v2);
      _v3.copy(L.target).sub(_v2);
      // into the character's frame
      _q.copy(this.root.quaternion).invert();
      _v3.applyQuaternion(_q);
      yaw = THREE.MathUtils.clamp(Math.atan2(_v3.x, _v3.z), -1.25, 1.25);
      pitch = THREE.MathUtils.clamp(Math.atan2(_v3.y, Math.hypot(_v3.x, _v3.z)), -0.45, 0.4);
    }
    // the eyes (VRM look-at) aim between straight ahead and the target
    const ahead = _v4.set(0, this.hipsHeight + 0.65, 4);
    if (L.target) ahead.lerp(this.root.worldToLocal(_v.copy(L.target)), L.weight);
    this.lookTarget.position.copy(ahead);
    L.yaw += (yaw * L.weight - L.yaw) * Math.min(1, dt * 4);
    L.pitch += (pitch * L.weight - L.pitch) * Math.min(1, dt * 4);
    if (Math.abs(L.yaw) + Math.abs(L.pitch) > 1e-4) {
      n('chest')?.quaternion.premultiply(_q.setFromAxisAngle(_v.set(0, 1, 0), L.yaw * 0.12));
      n('neck')?.quaternion.multiply(_q.setFromEuler(new THREE.Euler(-L.pitch * 0.35, L.yaw * 0.35, 0, 'YXZ')));
      head?.quaternion.multiply(_q.setFromEuler(new THREE.Euler(-L.pitch * 0.55, L.yaw * 0.5, 0, 'YXZ')));
    }

    // blinking (sometimes twice), expressions, mouth
    const em = this.vrm.expressionManager;
    if (em) {
      this.blinkT -= dt;
      if (this.blinkT <= 0 && this.blinkPhase < 0) {
        this.blinkPhase = 0;
        this.blinkT = Math.random() < 0.2 ? 0.25 : 2 + Math.random() * 4;
      }
      if (this.blinkPhase >= 0) {
        this.blinkPhase += dt;
        const p = this.blinkPhase;
        this.blink = p < 0.06 ? p / 0.06 : p < 0.1 ? 1 : Math.max(0, 1 - (p - 0.1) / 0.12);
        if (p > 0.22) this.blinkPhase = -1;
      }
      for (const k of ['happy', 'relaxed']) this.mood[k] += (this.moodTarget[k] - this.mood[k]) * Math.min(1, dt * 4);
      em.setValue('happy', this.mood.happy);
      em.setValue('relaxed', this.mood.relaxed * (1 - this.mood.happy));
      // happy eyes are already closed into arcs: blink less over them
      em.setValue('blink', this.blink * (1 - this.mood.happy * 0.8));
      em.setValue('aa', this.mouth);
    }

    this._fitGround();
    this.vrm.update(dt);
  }

  // Settle the hips and IK each leg so the feet meet the terrain under them.
  _fitGround() {
    const n = this.node;
    this.root.updateMatrixWorld(true);
    const g0 = this.root.position.y;
    const legs = ['left', 'right'].map((s) => {
      const foot = n(s + 'Foot');
      foot.getWorldPosition(_v);
      return { s, d: this.ground(_v.x, _v.z) - g0 };
    });
    const drop = Math.min(0, legs[0].d, legs[1].d);
    if (Math.abs(legs[0].d) < 0.008 && Math.abs(legs[1].d) < 0.008) return;
    n('hips').position.y += drop;
    this.root.updateMatrixWorld(true);
    for (const leg of legs) {
      const lift = leg.d - drop;
      if (lift > 0.004) this._ikLeg(leg.s, lift);
    }
  }

  _ikLeg(side, lift) {
    const up = this.node(side + 'UpperLeg'), lo = this.node(side + 'LowerLeg'), ft = this.node(side + 'Foot');
    const hip = up.getWorldPosition(new THREE.Vector3());
    const knee = lo.getWorldPosition(new THREE.Vector3());
    const ankle = ft.getWorldPosition(new THREE.Vector3());
    const footQ = ft.getWorldQuaternion(new THREE.Quaternion());
    const target = ankle.clone();
    target.y += lift;
    const a = hip.distanceTo(knee), b = knee.distanceTo(ankle);
    const c = THREE.MathUtils.clamp(hip.distanceTo(target), Math.abs(a - b) + 1e-3, a + b - 1e-3);
    const d = _v.copy(target).sub(hip).normalize();
    const pole = _v2.copy(knee).sub(hip);
    pole.addScaledVector(d, -pole.dot(d)).normalize();
    const cosA = (a * a + c * c - b * b) / (2 * a * c);
    const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
    const kneeNew = _v3.copy(hip).addScaledVector(d, a * cosA).addScaledVector(pole, a * sinA);
    // thigh
    this._rotateWorld(up, _v4.copy(knee).sub(hip).normalize(), kneeNew.clone().sub(hip).normalize());
    up.updateMatrixWorld(true);
    // shin
    const ankle2 = ft.getWorldPosition(new THREE.Vector3());
    const kneeNow = lo.getWorldPosition(new THREE.Vector3());
    this._rotateWorld(lo, ankle2.sub(kneeNow).normalize(), target.clone().sub(kneeNow).normalize());
    lo.updateMatrixWorld(true);
    // keep the foot's world orientation from the animation
    const pq = lo.getWorldQuaternion(new THREE.Quaternion());
    ft.quaternion.copy(pq.invert().multiply(footQ));
  }

  // rotate a node so that world direction `from` becomes `to`
  _rotateWorld(node, from, to) {
    const delta = _q.setFromUnitVectors(from, to);
    const wq = node.getWorldQuaternion(_q2);
    const pq = node.parent.getWorldQuaternion(_q3);
    node.quaternion.copy(pq.invert().multiply(delta.multiply(wq)));
  }
}

export async function loadCharacter(modelPath, motionsPath, opts = {}) {
  const loader = new GLTFLoader();
  loader.register((parser) => new VRMLoaderPlugin(parser));
  const [buf, mbuf] = await Promise.all([loadAsset(modelPath), loadAsset(motionsPath)]);
  const gltf = await loader.parseAsync(buf, '');
  const motions = JSON.parse(new TextDecoder().decode(mbuf));
  return new Character(gltf, motions, opts);
}
