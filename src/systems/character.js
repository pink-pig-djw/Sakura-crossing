import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { createCharacterMaterial } from '../render/materials.js';

// A VRM character in the town's style, driven by retargeted motion capture
// (tools/anim/mixamo.mjs).
//
// Layers, applied every frame on the normalized humanoid rig:
//   1. AnimationMixer: motion clips (idles, the walk cycle, gestures, sitting down) with
//      cross-fades
//   2. procedural: breathing, head/neck turning toward a look target (eyes follow through
//      the VRM look-at), blinking and expressions
//   3. ground fitting: the hips settle and a two-bone IK puts each foot on the terrain
//      under it (the town is built on a slope)
// then VRM.update copies the pose to the skin and runs the hair / skirt spring bones.

const BASE = import.meta.env?.BASE_URL ?? './';

const fromBase64 = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer;

// file from the page's folder, or embedded (single-file builds: window.__ASSETS), or as
// base64 text next to the page (hosts that do not serve .vrm: window.__ASSET_TEXT maps the
// path to the text file)
export async function loadAsset(path) {
  const inline = window.__ASSETS?.[path];
  if (inline) return fromBase64(inline);
  const text = window.__ASSET_TEXT?.[path];
  const r = await fetch(`${BASE}${text || path}`);
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return text ? fromBase64((await r.text()).trim()) : r.arrayBuffer();
}

const decode = (b64, Type) => new Type(fromBase64(b64));

const CHILD = {
  hips: 'spine', spine: 'chest', chest: 'upperChest', upperChest: 'neck', neck: 'head',
  leftShoulder: 'leftUpperArm', leftUpperArm: 'leftLowerArm', leftLowerArm: 'leftHand', leftHand: 'leftMiddleProximal',
  rightShoulder: 'rightUpperArm', rightUpperArm: 'rightLowerArm', rightLowerArm: 'rightHand', rightHand: 'rightMiddleProximal',
  leftUpperLeg: 'leftLowerLeg', leftLowerLeg: 'leftFoot', leftFoot: 'leftToes',
  rightUpperLeg: 'rightLowerLeg', rightLowerLeg: 'rightFoot', rightFoot: 'rightToes',
};
for (const s of ['left', 'right']) {
  for (const f of ['Index', 'Middle', 'Ring', 'Little']) {
    CHILD[`${s}${f}Proximal`] = `${s}${f}Intermediate`;
    CHILD[`${s}${f}Intermediate`] = `${s}${f}Distal`;
  }
  CHILD[`${s}ThumbMetacarpal`] = `${s}ThumbProximal`;
  CHILD[`${s}ThumbProximal`] = `${s}ThumbDistal`;
}

// bones the procedural layers touch (breathing, looking, ground fitting)
const PROCEDURAL = ['hips', 'chest', 'upperChest', 'neck', 'head', 'leftShoulder', 'rightShoulder', 'leftUpperLeg', 'leftLowerLeg', 'leftFoot', 'rightUpperLeg', 'rightLowerLeg', 'rightFoot'];

const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3();

// typical brightness of a texture's opaque texels (the median, linear as the shader sees it:
// stripes, buttons and stitching do not pull it off the cloth's own tone)
const lumaOf = new WeakMap();
function meanLuma(tex) {
  const img = tex?.image;
  if (!img) return 0.5;
  if (lumaOf.has(img)) return lumaOf.get(img);
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0, 32, 32);
  const d = g.getImageData(0, 0, 32, 32).data;
  const lin = (v) => Math.pow(v / 255, 2.2);
  const ls = [];
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] >= 128) ls.push(0.299 * lin(d[i]) + 0.587 * lin(d[i + 1]) + 0.114 * lin(d[i + 2]));
  ls.sort((a, b) => a - b);
  const v = ls.length ? Math.max(0.02, ls[ls.length >> 1]) : 0.5;
  lumaOf.set(img, v);
  return v;
}

// recolor(materialName) -> THREE.Color or null: repaint that part (hair, clothes)
function materialFor(m, recolor = null) {
  const name = m.name || '';
  const map = m.map || m.uniforms?.map?.value || null;
  const rc = recolor?.(name);
  if (rc && map) {
    const opts = /HAIR/.test(name) ? { shade: new THREE.Color(0.78, 0.74, 0.9), shadeMix: 0.5, soft: 0.05, rim: 0.3 } : { shade: m.shadeColorFactor ? m.shadeColorFactor.clone() : new THREE.Color(0xb9b4d8), shadeMix: 0.55, soft: 0.05 };
    return createCharacterMaterial({ map, name: 'char:' + name, side: THREE.DoubleSide, alphaTest: m.alphaTest || 0, transparent: !!m.transparent, ...opts, recolor: rc, recolorRef: meanLuma(map) });
  }
  const shade = m.shadeColorFactor ? m.shadeColorFactor.clone() : new THREE.Color(0xb9b4d8);
  // cut-out (MASK) and blended (BLEND) parts as the model sets them up
  const base = { map, name: 'char:' + name, side: THREE.DoubleSide, alphaTest: m.alphaTest || 0, transparent: !!m.transparent };
  if (/FaceMouth/.test(name)) {
    // the inside of the mouth is painted in greys and takes its colour from the shade colour
    // in MToon: tint it (tongue pink, the throat dark red), leaving the teeth white
    return createCharacterMaterial({ ...base, unlit: 0.7, outline: 0, selfShadow: 0, soft: 0.3, tint: new THREE.Color(1.0, 0.47, 0.44) });
  }
  if (/EYE|FaceEyeline|FaceEyelash|FaceBrow/.test(name)) {
    // eyes, lashes and brows: flat, no ink lines, no cast shadows on them
    return createCharacterMaterial({ ...base, unlit: /Highlight/.test(name) ? 1 : 0.7, outline: 0, selfShadow: 0, soft: 0.3 });
  }
  // skin: a light, warm shadow side (it must not go dark in the shade)
  // the face: shaded as a sphere around the head (see uHeadCenter), a faint shadow side
  if (/Face_00_SKIN/.test(name)) return createCharacterMaterial({ ...base, shade, shadeMix: 0.85, soft: 0.25, wrap: 0.12, selfShadow: 0.35, outline: 0.5, rim: 0.12, shadeFloor: 0.9, faceSphere: 0.85 });
  if (/SKIN/.test(name)) return createCharacterMaterial({ ...base, shade, shadeMix: 0.8, soft: 0.08, wrap: 0.04, shadeFloor: 0.8 });
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
      // the town draws ink lines in post: drop MToon's inverted-hull outline pass
      if (Array.isArray(o.material) && o.material.some((m) => m.isOutline)) {
        o.material = o.material.find((m) => !m.isOutline);
        o.geometry.clearGroups();
      }
      if (o.material.transparent) o.castShadow = false;
      o.material = Array.isArray(o.material) ? o.material.map((m) => materialFor(m, opts.recolor)) : materialFor(o.material, opts.recolor);
    });
    // face materials follow the head's centre (sphere-shaded face)
    this.faceMats = [];
    vrm.scene.traverse((o) => {
      if (o.isMesh) for (const m of [o.material].flat()) if (m.defines?.FACE_SPHERE) this.faceMats.push(m);
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
    this.sole = this._solePoints(vrm, rest);
    // per-bone correction: the model's own rest bone direction -> the motion file's ideal
    // T-pose bone axis (none for the trunk, neck and head)
    const AXIS = motions.axes;
    this.D = {};
    for (const b of Object.keys(AXIS)) {
      this.D[b] = new THREE.Quaternion();
      if (!rest[b] || !AXIS[b]) continue; // no axis: rotations relative to the rest pose
      const c = CHILD[b] && (rest[CHILD[b]] ? CHILD[b] : b === 'chest' && rest.neck ? 'neck' : null);
      let dir;
      if (c) dir = rest[c].clone().sub(rest[b]);
      else if (/Distal$/.test(b) && this.parentOf[b]) dir = rest[b].clone().sub(rest[this.parentOf[b]]); // finger tips: along the last joint
      else continue;
      this.D[b].setFromUnitVectors(dir.normalize(), new THREE.Vector3(...AXIS[b]));
    }

    // clips
    this.mixer = new THREE.AnimationMixer(vrm.scene);
    this.clips = {};
    this.info = {};
    for (const [name, c] of Object.entries(motions.clips)) {
      this.clips[name] = this._buildClip(name, c, motions);
      // reps: a short cycle (a wave of the hand) played a few times as a one-shot
      this.info[name] = { speed: c.speed * (this.hipsHeight / c.hipsHeight), rise: (c.rise || 0) * (this.hipsHeight / c.hipsHeight), loop: c.loop && !c.reps, reps: c.reps || 1 };
    }
    this.actions = {};
    for (const [n, clip] of Object.entries(this.clips)) {
      const a = this.mixer.clipAction(clip);
      if (!this.info[n].loop) {
        a.setLoop(this.info[n].reps > 1 ? THREE.LoopRepeat : THREE.LoopOnce, this.info[n].reps);
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
    this.eyesClosed = 0; // set by the owner (0..1): eyes shut, e.g. while praying
    this.shut = 0;
    this.mood = { happy: 0, relaxed: 0.25, sad: 0, surprised: 0 };
    this.openSmile = !!(vrm.expressionManager?.getExpression('smile') && vrm.expressionManager.getExpression('worried'));
    this.moodTarget = { ...this.mood };
    this.mouth = 0;
    this.ground = opts.ground || (() => 0);
    // sitting on something higher than the clip's seat: { lift } (m), the hips rise by up to
    // that much as they come down, the feet stay on the ground
    this.seat = null;
    const sit = motions.clips.sit, sd = motions.clips.sitDown;
    this.sitHips = sit ? (decode(sit.hips, Int16Array)[1] / 10000) * (this.hipsHeight / sit.hipsHeight) : 0;
    // skirt spring chains (VRoid names): seated, the front and sides drape forward over the lap
    // instead of being shoved aside by the thighs
    this.skirt = [...(vrm.springBoneManager?.joints ?? [])]
      .filter((j) => /_Skirt(Front|Side)/.test(j.bone?.name || '') && !/Coat/.test(j.bone.name))
      .map((j) => ({ j, front: /Front/.test(j.bone.name), power: j.settings.gravityPower, stiff: j.settings.stiffness, dir: j.settings.gravityDir.clone() }));
    this.seatedness = 0;
    // hair spring chains: `wind` (a world vector, set by the owner) blows them along it, as
    // when riding a bicycle
    this.hair = [...(vrm.springBoneManager?.joints ?? [])]
      .filter((j) => /Hair/.test(j.bone?.name || ''))
      .map((j) => ({ j, power: j.settings.gravityPower, dir: j.settings.gravityDir.clone() }));
    this.wind = null;
    this._blown = false;
    // how far back sitting down takes the hips (the clip faces +Z)
    if (sd) {
      const h = decode(sd.hips, Int16Array), n = sd.frames;
      this.sitBack = ((h[2] - h[(n - 1) * 3 + 2]) / 10000) * (this.hipsHeight / sd.hipsHeight);
    }
  }

  // Points under each shoe (heel, ball, tip), from the vertices skinned to the foot and toes:
  // offsets from the foot / toes bone at rest, so that they follow the posed bones. The
  // ground fit keeps them all above the ground (a foot rolled heel-down or toe-down would
  // otherwise dig its shoe in).
  _solePoints(vrm, rest) {
    const H = vrm.humanoid;
    const out = {};
    for (const side of ['left', 'right']) {
      const foot = H.getRawBoneNode(side + 'Foot'), toes = H.getRawBoneNode(side + 'Toes');
      const pts = { foot: [], toes: [] };
      vrm.scene.traverse((o) => {
        if (!o.isSkinnedMesh) return;
        const g = o.geometry, P = g.attributes.position, I = g.attributes.skinIndex, Wt = g.attributes.skinWeight;
        const bones = o.skeleton.bones;
        for (let i = 0; i < P.count; i++) {
          let best = -1, bw = 0;
          for (let k = 0; k < 4; k++) if (Wt.getComponent(i, k) > bw) (bw = Wt.getComponent(i, k)), (best = I.getComponent(i, k));
          const b = bones[best];
          if (b !== foot && b !== toes) continue;
          const y = P.getY(i);
          if (y > rest[side + 'Foot'].y) continue; // the sole and the lower shoe only
          (b === foot ? pts.foot : pts.toes).push(new THREE.Vector3(P.getX(i), y, P.getZ(i)));
        }
      });
      const all = [...pts.foot, ...pts.toes];
      if (!all.length) continue;
      const minY = Math.min(...all.map((p) => p.y));
      const low = (arr) => arr.filter((p) => p.y < minY + 0.02);
      const heel = low(pts.foot).reduce((a, p) => (!a || p.z < a.z ? p : a), null);
      const tip = low(pts.toes.length ? pts.toes : pts.foot).reduce((a, p) => (!a || p.z > a.z ? p : a), null);
      const ball = new THREE.Vector3(rest[side + 'Toes']?.x ?? 0, minY, rest[side + 'Toes']?.z ?? 0);
      const F = rest[side + 'Foot'], T = rest[side + 'Toes'] || F;
      out[side] = [
        { bone: side + 'Foot', p: heel.clone().sub(F) },
        { bone: side + 'Foot', p: ball.clone().sub(F) },
        { bone: rest[side + 'Toes'] ? side + 'Toes' : side + 'Foot', p: tip.clone().sub(rest[side + 'Toes'] ? T : F) },
      ];
    }
    return out;
  }

  // how far a foot must rise so that no point under its shoe is below the ground
  _soleNeed(side) {
    let need = -Infinity;
    for (const s of this.sole[side] || []) {
      _v3.copy(s.p).applyMatrix4(this.node(s.bone).matrixWorld);
      need = Math.max(need, this.ground(_v3.x, _v3.z) - _v3.y);
    }
    return need;
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
          W[b] = (W[b] || new THREE.Quaternion()).set(rot[o] / 32767, rot[o + 1] / 32767, rot[o + 2] / 32767, rot[o + 3] / 32767).normalize().multiply(this.D[b] || _q3.identity());
        } else {
          // bones the clips lack (eyes, jaw ...) follow their parent
          const p = this.parentOf[b];
          W[b] = (W[b] || new THREE.Quaternion()).copy(p ? W[p] : _q.identity());
        }
        if (!values[b]) continue;
        const p = this.parentOf[b];
        const local = _q2.copy(p ? W[p] : _q.identity()).invert().multiply(W[b]);
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

  setMood(happy, relaxed = 0.25, sad = 0, surprised = 0) {
    Object.assign(this.moodTarget, { happy, relaxed, sad, surprised });
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
    n('upperChest')?.quaternion.multiply(_q.setFromAxisAngle(_v.set(1, 0, 0), -0.018 * br));
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
      this.shut += (this.eyesClosed - this.shut) * Math.min(1, dt * 6);
      const blink = 1 - (1 - this.blink) * (1 - this.shut);
      const M = this.mood;
      for (const k in M) M[k] += (this.moodTarget[k] - M[k]) * Math.min(1, dt * (k === 'surprised' ? 9 : 4));
      if (this.openSmile) {
        // a smile and a worried look that keep the eyes open (see tools/chars/optimize_vrm.py)
        em.setValue('smile', Math.min(1, M.happy + M.relaxed * 0.5) * (1 - M.sad) * (1 - M.surprised));
        em.setValue('worried', M.sad * (1 - M.surprised));
        em.setValue('blink', blink * (1 - M.surprised));
      } else {
        em.setValue('happy', M.happy * (1 - M.surprised));
        em.setValue('relaxed', M.relaxed * (1 - M.happy) * (1 - M.sad) * (1 - M.surprised));
        em.setValue('sad', M.sad * (1 - M.happy));
        // happy eyes are already closed into arcs, wide eyes stay open: blink less
        em.setValue('blink', blink * (1 - M.happy * 0.8) * (1 - M.surprised));
      }
      em.setValue('surprised', M.surprised);
      // speech: mostly "a", drifting toward "o" and "e" so the mouth does not just flap
      const m = this.mouth, v = Math.sin(this.t * 5.3) * 0.5 + 0.5, w = Math.sin(this.t * 3.1 + 1) * 0.5 + 0.5;
      em.setValue('aa', m * (0.75 - 0.3 * v));
      em.setValue('oh', m * 0.45 * v);
      em.setValue('ee', m * 0.3 * w * (1 - v));
    }

    this._fitGround();
    // a pose laid over the clip (a cyclist on her bike), before the skin and the hair follow
    if (this.pose) this.pose(this, dt);
    this._drapeSkirt();
    this._blowHair();
    if (this.lite) {
      // far off (a passer-by down the street): the pose and the face, no hair or skirt physics
      this.vrm.humanoid.update();
      this.vrm.expressionManager?.update();
    } else this.vrm.update(dt);
    if (this.faceMats.length) {
      // the middle of the head: a little above and behind the head bone
      const head = n('head');
      head.updateWorldMatrix(true, false);
      _v.set(0, 0.075, -0.015).applyMatrix4(head.matrixWorld);
      for (const m of this.faceMats) m.uniforms.uHeadCenter.value.copy(_v);
    }
  }

  _drapeSkirt() {
    if (!this.skirt.length || !this.sitHips) return;
    if (this.skirtFollow) {
      this._followKnees();
      return;
    }
    const k = THREE.MathUtils.clamp(((this.hipsHeight - this._hipsY) / (this.hipsHeight - this.sitHips) - 0.25) / 0.6, 0, 1);
    if (k < 0.01 && this.seatedness < 0.01) return;
    this.seatedness = k;
    const fwd = _v.set(0, 0, 1).applyQuaternion(this.root.quaternion);
    for (const s of this.skirt) {
      const st = s.j.settings;
      st.gravityDir.copy(s.dir).lerp(_v2.copy(fwd).multiplyScalar(s.front ? 1 : 0.6).add(_v3.set(0, -0.35, 0)).normalize(), k).normalize();
      st.gravityPower = s.power + (s.front ? 2.4 : 0.9) * k;
      st.stiffness = s.stiff * (1 - 0.8 * k);
    }
  }

  // Riding (skirtFollow): the front and side chains of the skirt are drawn toward the knee on
  // their side, the side chains a little outside it, so the cloth lies over the thighs and
  // follows them up and down with the pedals (the leg colliders keep it on top)
  _followKnees() {
    this.seatedness = 1;
    const out = new THREE.Vector3(), knee = new THREE.Vector3(), at = new THREE.Vector3();
    for (const s of this.skirt) {
      const left = /_L_/.test(s.j.bone.name);
      this.node(left ? 'leftLowerLeg' : 'rightLowerLeg').getWorldPosition(knee);
      s.j.bone.getWorldPosition(at);
      out.set(left ? 1 : -1, 0, 0).applyQuaternion(this.root.quaternion);
      knee.addScaledVector(out, s.front ? 0.045 : 0.13);
      knee.y -= s.front ? 0.06 : 0.14;
      const st = s.j.settings;
      st.gravityDir.copy(knee.sub(at).normalize());
      st.gravityPower = s.power + (s.front ? 2.8 : 2.0);
      st.stiffness = s.stiff * 0.25;
    }
  }

  // Riding a bicycle, the thighs come up through a skirt of a few spring chains (the cloth
  // between chains is not pushed out): widen the leg colliders the skirt chains use, and the
  // chains' own reach, by k (1: as the model has them)
  widenSkirt(k) {
    const sbm = this.vrm.springBoneManager;
    if (!sbm || k === this._skirtK) return;
    this._skirtK = k;
    if (!this._skirtCols) {
      const groups = new Set();
      this._skirtJoints = [...sbm.joints].filter((j) => /Skirt/.test(j.bone?.name || ''));
      for (const j of this._skirtJoints) for (const g of j.colliderGroups ?? []) groups.add(g);
      this._skirtCols = [...groups].flatMap((g) => g.colliders).filter((c) => /UpperLeg/.test(c.parent?.name || '') && c.shape?.radius !== undefined).map((c) => ({ shape: c.shape, r: c.shape.radius }));
      this._skirtHit = this._skirtJoints.map((j) => j.settings.hitRadius);
    }
    for (const c of this._skirtCols) c.shape.radius = c.r * k;
    this._skirtJoints.forEach((j, i) => (j.settings.hitRadius = this._skirtHit[i] * (1 + (k - 1) * 2)));
  }

  _blowHair() {
    const w = this.wind;
    const on = !!w && w.lengthSq() > 1e-5;
    if (!on && !this._blown) return;
    this._blown = on;
    for (const h of this.hair) {
      const st = h.j.settings;
      if (!on) {
        st.gravityDir.copy(h.dir);
        st.gravityPower = h.power;
        continue;
      }
      _v.copy(h.dir).multiplyScalar(h.power).add(w);
      const p = _v.length();
      st.gravityDir.copy(_v).divideScalar(Math.max(p, 1e-6));
      st.gravityPower = p;
    }
  }

  // Settle the hips and IK each leg so the feet meet the terrain under them.
  _fitGround() {
    if (this.noFit) return; // in the air: the legs keep the clip's pose
    const n = this.node;
    this.root.updateMatrixWorld(true);
    const g0 = this.root.position.y;
    // for each foot: how far the ankle must move. It follows the terrain under it (the clip
    // stands on flat ground at the root's height) and never goes below its standing height
    // over the ground (no sole sinks into it)
    // on stairs (a stair clip, its climb taken out, the root on the line through the treads)
    // the clip's own risers are scaled to these by k, and no foot goes into a tread
    const k = this.stairs?.k;
    const legs = ['left', 'right'].map((s) => {
      n(s + 'Foot').getWorldPosition(_v);
      const d = this.ground(_v.x, _v.z) - g0;
      const a = _v.y - g0;
      if (k !== undefined) {
        const want = this.ankleHeight + k * (a - this.ankleHeight);
        return { s, c: Math.max(want - a, d + this.ankleHeight * 0.98 - a, this._soleNeed(s) + 0.005) };
      }
      return { s, c: Math.max(d, d + this.ankleHeight * 0.98 - a, this._soleNeed(s) + 0.005) };
    });
    const drop = Math.min(0, legs[0].c, legs[1].c);
    // on a seat: raise the hips in proportion to how far down toward the clip's seat they are
    const hips = n('hips');
    this._hipsY = hips.position.y;
    let raise = 0;
    if (this.seat && this.sitHips) raise = this.seat.lift * THREE.MathUtils.clamp((this.hipsHeight - hips.position.y) / (this.hipsHeight - this.sitHips), 0, 1);
    if (Math.abs(legs[0].c) < 0.004 && Math.abs(legs[1].c) < 0.004 && raise < 0.004) return;
    hips.position.y += drop + raise;
    this.root.updateMatrixWorld(true);
    for (const leg of legs) {
      const lift = leg.c - drop - raise;
      if (Math.abs(lift) > 0.004) this._ikLeg(leg.s, lift);
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
  // Two-bone IK in world space: the end bone's joint onto `target`, the middle joint bent
  // toward the direction `pole` (knees forward, elbows out and back).
  ik(upper, lower, end, target, pole) {
    const up = this.node(upper), lo = this.node(lower), en = this.node(end);
    const a0 = up.getWorldPosition(new THREE.Vector3()), k0 = lo.getWorldPosition(new THREE.Vector3()), e0 = en.getWorldPosition(new THREE.Vector3());
    const a = a0.distanceTo(k0), b = k0.distanceTo(e0);
    const c = THREE.MathUtils.clamp(a0.distanceTo(target), Math.abs(a - b) + 1e-3, a + b - 1e-3);
    const d = target.clone().sub(a0).normalize();
    const p = pole.clone().addScaledVector(d, -pole.dot(d)).normalize();
    const cosA = (a * a + c * c - b * b) / (2 * a * c), sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
    const mid = a0.clone().addScaledVector(d, a * cosA).addScaledVector(p, a * sinA);
    this._rotateWorld(up, k0.sub(a0).normalize(), mid.sub(a0).normalize());
    up.updateMatrixWorld(true);
    const k1 = lo.getWorldPosition(new THREE.Vector3()), e1 = en.getWorldPosition(new THREE.Vector3());
    this._rotateWorld(lo, e1.sub(k1).normalize(), target.clone().sub(k1).normalize());
    lo.updateMatrixWorld(true);
  }

  // give a bone this world orientation
  setWorldQuaternion(bone, q) {
    const n = this.node(bone);
    n.quaternion.copy(n.parent.getWorldQuaternion(_q3).invert().multiply(q));
    n.updateMatrixWorld(true);
  }

  _rotateWorld(node, from, to) {
    const delta = _q.setFromUnitVectors(from, to);
    const wq = node.getWorldQuaternion(_q2);
    const pq = node.parent.getWorldQuaternion(_q3);
    node.quaternion.copy(pq.invert().multiply(delta.multiply(wq)));
  }
}

// motion files are shared by every character that uses them
const motionFiles = new Map();
export function loadMotions(path) {
  if (!motionFiles.has(path)) motionFiles.set(path, loadAsset(path).then((b) => JSON.parse(new TextDecoder().decode(b))));
  return motionFiles.get(path);
}

export async function loadCharacter(modelPath, motionsPath, opts = {}) {
  const loader = new GLTFLoader();
  loader.register((parser) => new VRMLoaderPlugin(parser));
  const [buf, motions] = await Promise.all([loadAsset(modelPath), loadMotions(motionsPath)]);
  const gltf = await loader.parseAsync(buf, '');
  return new Character(gltf, motions, opts);
}
