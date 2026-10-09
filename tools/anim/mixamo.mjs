// Retarget Mixamo FBX animations onto the VRM humanoid.
//
//   node tools/anim/mixamo.mjs <MixamoLibrary dir> public/chars/motions.json
//
// The library (https://github.com/pink-pig-djw/mixamoLibrary): Mixamo clips on the standard
// X Bot rig, exported as FBX Binary at 30 fps, "Without Skin". The FBX files are not part of
// this repository; only the converted motions are.
//
// Every Mixamo joint carries its own local axes, so rotations are not copied over. For each
// bone we find the rotation Q that maps an ideal VRM T-pose bone frame (bone axis A plus a
// forward / up reference axis R) into the Mixamo joint's frame, calibrated on the rig's
// rest pose (a clean T-pose). Then W_vrm(t) = W_mixamo(t) * Q for every frame; the output
// stores these world rotations (character facing +Z) together with the ideal axes, so the
// browser can turn them into local rotations for whatever bone hierarchy the model has.
// Fingers and thumbs are included.
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const X = V(1, 0, 0), Y = V(0, 1, 0), Z = V(0, 0, 1);

// [Mixamo joint, VRM bone, ideal axis A, reference R, child joint giving the bone axis]
// The trunk, neck, head and feet carry no axis: their rotations are taken relative to the rest
// T-pose instead, so the model keeps its own posture (the X Bot's bones there do not run
// straight up when it stands and looks ahead: its head-top end sits 19° forward of the head).
function buildMap() {
  const m = [
    ['Hips', 'hips', null, null], ['Spine', 'spine', null, null], ['Spine1', 'chest', null, null],
    ['Spine2', 'upperChest', null, null], ['Neck', 'neck', null, null], ['Head', 'head', null, null],
  ];
  const seg = ['Proximal', 'Intermediate', 'Distal'];
  const thumbSeg = ['Metacarpal', 'Proximal', 'Distal'];
  for (const [S, s, sx] of [['Left', 'left', 1], ['Right', 'right', -1]]) {
    const out = V(sx, 0, 0), down = V(0, -1, 0);
    m.push(
      [`${S}Shoulder`, `${s}Shoulder`, out, Z, `${S}Arm`], [`${S}Arm`, `${s}UpperArm`, out, Z, `${S}ForeArm`],
      [`${S}ForeArm`, `${s}LowerArm`, out, Z, `${S}Hand`], [`${S}Hand`, `${s}Hand`, out, Z, `${S}HandMiddle1`],
      [`${S}UpLeg`, `${s}UpperLeg`, down, Z, `${S}Leg`], [`${S}Leg`, `${s}LowerLeg`, down, Z, `${S}Foot`],
      // feet: relative to the rest pose too (a T-posed X Bot's foot points 39° down, a VRoid
      // one's 29°: matching directions would dig her toes into the ground)
      [`${S}Foot`, `${s}Foot`, null, null], [`${S}ToeBase`, `${s}Toes`, null, null],
    );
    for (const [F, f] of [['Index', 'Index'], ['Middle', 'Middle'], ['Ring', 'Ring'], ['Pinky', 'Little']]) {
      for (let i = 1; i <= 3; i++) m.push([`${S}Hand${F}${i}`, `${s}${f}${seg[i - 1]}`, out, Z, `${S}Hand${F}${i + 1}`]);
    }
    // a T-posed thumb points out, forward and a little down
    const thumb = V(0.75 * sx, -0.2, 0.6).normalize();
    for (let i = 1; i <= 3; i++) m.push([`${S}HandThumb${i}`, `${s}Thumb${thumbSeg[i - 1]}`, thumb, Y, `${S}HandThumb${i + 1}`]);
  }
  return m;
}
const MAP = buildMap();
const BONE = Object.fromEntries(MAP.map((e, i) => [e[1], i]));

// ------------------------------------------------------------------------------- FBX
function loadFBX(file) {
  const buf = fs.readFileSync(file);
  const g = new FBXLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '');
  // files that carry the X Bot mesh have an empty extra take
  const clip = g.animations.reduce((a, b) => (b.tracks.length > a.tracks.length ? b : a));
  const joint = (n) => g.getObjectByName('mixamorig' + n);
  return { g, clip, joint };
}

const perp = (v, n) => v.clone().addScaledVector(n, -v.dot(n)).normalize();
const basis = (a, r) => {
  const r2 = perp(r, a);
  return new THREE.Matrix4().makeBasis(a, r2, a.clone().cross(r2));
};

// per-bone Q (ideal VRM bone frame -> Mixamo joint frame) from the rest T-pose; for bones
// without an axis, the inverse rest rotation (so the rest pose maps to the model's rest)
function calibrate({ g, joint }) {
  g.updateMatrixWorld(true);
  return MAP.map(([jn, , A, R, child]) => {
    const j = joint(jn);
    if (!A) return j.getWorldQuaternion(new THREE.Quaternion()).invert();
    const a = joint(child).position.clone().normalize(); // bone axis in the joint's frame
    const wq = j.getWorldQuaternion(new THREE.Quaternion());
    const dir = a.clone().applyQuaternion(wq);
    const refW = R === Y ? Y : Math.abs(dir.dot(Z)) > 0.95 ? Y : Z; // the rig faces +Z
    const r = perp(refW, dir).applyQuaternion(wq.clone().invert());
    return new THREE.Quaternion().setFromRotationMatrix(basis(a, r).multiply(basis(A, R).transpose()));
  });
}

// sample every frame: ideal-frame world rotations of the mapped bones, hips position (m)
function sample(fbx, Q, fps) {
  const { g, clip, joint } = fbx;
  const mixer = new THREE.AnimationMixer(g);
  mixer.clipAction(clip).play();
  const n = Math.round(clip.duration * fps) + 1;
  const joints = MAP.map(([jn]) => joint(jn));
  const feet = ['LeftToeBase', 'RightToeBase'].map(joint);
  const legs = ['LeftUpLeg', 'LeftLeg', 'RightUpLeg', 'RightLeg'].map(joint);
  const frames = [];
  for (let k = 0; k < n; k++) {
    mixer.setTime(Math.min(k / fps, clip.duration));
    g.updateMatrixWorld(true);
    frames.push({
      rot: joints.map((j, i) => j.getWorldQuaternion(new THREE.Quaternion()).multiply(Q[i])),
      hips: joints[0].getWorldPosition(new THREE.Vector3()).multiplyScalar(0.01),
      toes: feet.map((f) => f.getWorldPosition(new THREE.Vector3()).multiplyScalar(0.01)),
      legs: legs.map((f) => f.getWorldPosition(new THREE.Vector3()).multiplyScalar(0.01)),
    });
  }
  return frames;
}

// walking pace of an in-place walk: how fast the planted foot slides back under the body
function inPlaceSpeed(frames, fps) {
  const v = [];
  for (let k = 1; k < frames.length; k++) {
    const lo = frames[k].toes[0].y < frames[k].toes[1].y ? 0 : 1;
    const a = frames[k].toes[lo], b = frames[k - 1].toes[lo];
    if (a.y - Math.min(...frames.map((f) => f.toes[lo].y)) < 0.02) v.push(Math.hypot(a.x - b.x, a.z - b.z) * fps);
  }
  v.sort((x, y) => x - y);
  return v[Math.floor(v.length / 2)];
}

const smooth = (u) => u * u * (3 - 2 * u);
// 0 -> 1 -> 0: rise over [t0, t1], hold, fall over [t2, t3]
const envelope = (t0, t1, t2, t3) => (t) => (t < t0 ? 0 : t < t1 ? smooth((t - t0) / (t1 - t0)) : t < t2 ? 1 : t < t3 ? 1 - smooth((t - t2) / (t3 - t2)) : 0);
// world rotation that turns ideal axis A into direction d, given as [x, y, z]
const aim = (A, d) => new THREE.Quaternion().setFromUnitVectors(A, V(...d).normalize());
const isFinger = (b) => /Thumb|Index|Middle|Ring|Little/.test(b);

// Pointing the way (the library's pointing is crouched): the right arm rises toward the
// front, a little to her right and up, index finger out, the other fingers curled.
function synthPoint(stand, fps) {
  const env = envelope(0.3, 0.95, 2.6, 3.3);
  const R = X.clone().negate();
  const target = {
    rightShoulder: aim(R, [-1, 0.1, 0.08]),
    rightUpperArm: aim(R, [-0.3, 0.12, 0.95]), rightLowerArm: aim(R, [-0.25, 0.16, 0.95]), rightHand: aim(R, [-0.22, 0.15, 0.95]),
  };
  // curl about the hand's forward axis (fingers fold toward the palm)
  const curl = { Middle: [1.4, 1.5, 0.8], Ring: [1.5, 1.5, 0.8], Little: [1.55, 1.4, 0.8], Index: [0.05, 0.05, 0.03] };
  const frames = [];
  for (let k = 0; k <= Math.round(3.6 * fps); k++) {
    const e = env(k / fps);
    const rot = stand.rot.map((q) => q.clone());
    for (const [b, q] of Object.entries(target)) rot[BONE[b]].slerp(q, e);
    const hand = BONE.rightHand;
    MAP.forEach(([, b], i) => {
      if (!b.startsWith('right') || !isFinger(b)) return;
      const rel = stand.rot[hand].clone().invert().multiply(stand.rot[i]);
      const f = Object.keys(curl).find((n) => b.includes(n));
      let pointRel = rel;
      if (f) {
        const seg = ['Proximal', 'Intermediate', 'Distal'].findIndex((n) => b.endsWith(n));
        const a = curl[f].slice(0, seg + 1).reduce((x, y) => x + y, 0);
        pointRel = new THREE.Quaternion().setFromAxisAngle(Z, a);
      } else {
        // the thumb rests along the curled middle finger
        pointRel = rel.clone().premultiply(new THREE.Quaternion().setFromAxisAngle(Z, 0.35));
      }
      rot[i] = rot[hand].clone().multiply(rel.clone().slerp(pointRel, e));
    });
    // the upper body turns a touch toward where she points
    for (const b of ['spine', 'chest', 'upperChest']) rot[BONE[b]].premultiply(new THREE.Quaternion().setFromAxisAngle(Y, -0.06 * e));
    frames.push({ rot, hips: stand.hips.clone() });
  }
  return frames;
}

// Startled (the library's "Surprised" is a crouch): a quick flinch back, shoulders up, both
// hands drawn to the chest, then a slow relief.
function synthStartle(stand, fps) {
  const env = (t) => (t < 0.12 ? smooth(t / 0.12) : t < 1.0 ? 1 : t < 1.8 ? 1 - smooth((t - 1.0) / 0.8) : 0);
  const L = X, R = X.clone().negate();
  const target = {
    leftShoulder: aim(L, [1, 0.2, 0.02]), rightShoulder: aim(R, [-1, 0.2, 0.02]),
    leftUpperArm: aim(L, [0.35, -0.8, 0.45]), rightUpperArm: aim(R, [-0.35, -0.8, 0.45]),
    leftLowerArm: aim(L, [-0.45, 0.8, 0.4]), rightLowerArm: aim(R, [0.45, 0.8, 0.4]),
    leftHand: aim(L, [-0.55, 0.75, 0.3]), rightHand: aim(R, [0.55, 0.75, 0.3]),
  };
  const back = { hips: -0.05, spine: -0.08, chest: -0.1, upperChest: -0.12, neck: -0.1, head: -0.14 };
  const frames = [];
  for (let k = 0; k <= Math.round(2.0 * fps); k++) {
    const e = env(k / fps);
    const rot = stand.rot.map((q) => q.clone());
    for (const [b, q] of Object.entries(target)) rot[BONE[b]].slerp(q, e);
    MAP.forEach(([, b], i) => {
      if (!isFinger(b)) return;
      const hand = BONE[b.startsWith('left') ? 'leftHand' : 'rightHand'];
      rot[i] = rot[hand].clone().multiply(stand.rot[hand].clone().invert().multiply(stand.rot[i]));
    });
    MAP.forEach(([, b], i) => {
      const a = back[b] ?? (/UpperLeg|LowerLeg|Foot|Toes/.test(b) ? 0 : /Shoulder|Arm|Hand|Thumb|Index|Middle|Ring|Little/.test(b) ? back.upperChest : 0);
      if (a) rot[i].premultiply(new THREE.Quaternion().setFromAxisAngle(X, a * e));
    });
    const hips = stand.hips.clone();
    hips.z -= 0.035 * e;
    frames.push({ rot, hips });
  }
  return frames;
}

// Sitting with the knees together (the capture sits with them apart, which a skirt does not
// forgive): swing each whole leg in about the vertical through the hip, by as much as the
// thigh lies horizontal, so the knees come to `gap` apart (m, capture scale).
// world rotation turning ideal axis A into direction d with the palm side facing down
function aimPalmDown(A, d) {
  const D = V(...d).normalize();
  const U = perp(Y, D);
  const m = new THREE.Matrix4().makeBasis(D, U, D.clone().cross(U));
  const m0 = new THREE.Matrix4().makeBasis(A, Y, A.clone().cross(Y));
  return new THREE.Quaternion().setFromRotationMatrix(m.multiply(m0.transpose()));
}
const LAP = {};
for (const [s, A, sx] of [['left', X, 1], ['right', X.clone().negate(), -1]]) {
  LAP[s + 'UpperArm'] = aimPalmDown(A, [0.12 * sx, -0.93, 0.35]);
  LAP[s + 'LowerArm'] = aimPalmDown(A, [-0.5 * sx, -0.48, 0.72]);
  LAP[s + 'Hand'] = aimPalmDown(A, [-0.6 * sx, -0.55, 0.58]);
}

function kneesTogether(frames, gap) {
  const legBones = (s) => ['UpperLeg', 'LowerLeg', 'Foot', 'Toes'].map((b) => BONE[s + b]);
  for (const f of frames) {
    let seated = 0;
    const [hipL, kneeL, hipR, kneeR] = f.legs;
    for (const [s, hip, knee, sign] of [['left', hipL, kneeL, 1], ['right', hipR, kneeR, -1]]) {
      const thigh = knee.clone().sub(hip);
      const flat = Math.hypot(thigh.x, thigh.z);
      if (flat < 0.05) continue;
      const lying = THREE.MathUtils.clamp(flat / thigh.length(), 0, 1) ** 2;
      // the knee should sit gap/2 from the middle between the hips
      const mid = (hipL.x + hipR.x) / 2;
      const want = mid + sign * gap / 2;
      const a = Math.atan2(thigh.x, thigh.z), b = Math.atan2(want - hip.x, Math.sqrt(Math.max(1e-4, flat * flat - (want - hip.x) ** 2)));
      const turn = new THREE.Quaternion().setFromAxisAngle(Y, (b - a) * lying);
      for (const i of legBones(s)) f.rot[i].premultiply(turn);
      seated += lying / 2;
    }
    // and the hands rest together on her lap, over the skirt
    const rel = MAP.map(([, b], i) => (isFinger(b) ? f.rot[BONE[b.startsWith('left') ? 'leftHand' : 'rightHand']].clone().invert().multiply(f.rot[i]) : null));
    for (const [b, q] of Object.entries(LAP)) f.rot[BONE[b]].slerp(q, seated);
    MAP.forEach(([, b], i) => {
      if (rel[i]) f.rot[i] = f.rot[BONE[b.startsWith('left') ? 'leftHand' : 'rightHand']].clone().multiply(rel[i]);
    });
  }
}

// Some takes hold the head tipped back the whole time: level it (by its mean pitch) so she
// looks at whoever she is talking to.
function levelHead(frames) {
  const h = BONE.head;
  const pitch = frames.reduce((s, f) => s + Math.asin(-new THREE.Vector3(0, 0, 1).applyQuaternion(f.rot[h]).y), 0) / frames.length;
  const fix = new THREE.Quaternion().setFromAxisAngle(X, -pitch);
  for (const f of frames) f.rot[h].premultiply(fix);
}

// The take leans back and looks up as it prays; at a Japanese shrine you bow your head
// instead. As far as the take leans back (its upper chest, against its first frame), the upper
// body tips forward to `chest` degrees instead, and the neck and head drop a further `head`.
function bowInstead(frames, [chest, head]) {
  const pitch = (q) => Math.asin(-new THREE.Vector3(0, 0, 1).applyQuaternion(q).y);
  const p0 = pitch(frames[0].rot[BONE.upperChest]);
  const back = frames.map((f) => Math.min(0, pitch(f.rot[BONE.upperChest]) - p0));
  const most = Math.min(...back);
  if (most > -1e-3) return;
  const upper = MAP.map(([, b], i) => (b === 'hips' || /UpperLeg|LowerLeg|Foot|Toes/.test(b) ? -1 : i)).filter((i) => i >= 0);
  const R = new THREE.Quaternion(), rad = THREE.MathUtils.degToRad;
  frames.forEach((f, k) => {
    const w = back[k] / most;
    R.setFromAxisAngle(X, -back[k] + w * rad(chest));
    for (const i of upper) f.rot[i].premultiply(R);
    f.rot[BONE.neck].premultiply(R.setFromAxisAngle(X, w * rad(head) * 0.4));
    f.rot[BONE.head].premultiply(R.setFromAxisAngle(X, w * rad(head)));
  });
}

function pack(frames, o) {
  const nb = MAP.length, nf = frames.length;
  const rot = new Int16Array(nf * nb * 4);
  const pos = new Int16Array(nf * 3);
  frames.forEach((f, k) => {
    f.rot.forEach((q, i) => {
      q.normalize();
      // keep consecutive keys in the same hemisphere so interpolation takes the short way
      const prev = k ? frames[k - 1].rot[i] : null;
      const s = prev && prev.dot(q) < 0 ? -1 : 1;
      const at = (k * nb + i) * 4;
      rot[at] = Math.round(q.x * s * 32767);
      rot[at + 1] = Math.round(q.y * s * 32767);
      rot[at + 2] = Math.round(q.z * s * 32767);
      rot[at + 3] = Math.round(q.w * s * 32767);
      if (s < 0) q.set(-q.x, -q.y, -q.z, -q.w);
    });
    pos[k * 3] = Math.round(f.hips.x * 10000);
    pos[k * 3 + 1] = Math.round(f.hips.y * 10000);
    pos[k * 3 + 2] = Math.round(f.hips.z * 10000);
  });
  const out = { frames: nf, loop: !!o.loop, speed: +(o.speed || 0).toFixed(4), hipsHeight: +o.hipsHeight.toFixed(4) };
  if (o.reps) out.reps = o.reps;
  if (o.root) out.root = true;
  out.rot = Buffer.from(rot.buffer).toString('base64');
  out.hips = Buffer.from(pos.buffer).toString('base64');
  return out;
}

// ------------------------------------------------------------------------------- clips
// loop: cycles (the last sample repeats the first and is dropped)
// reps: a short cycle played that many times as a one-shot
// range: [from, to] seconds of the take
// level: the take holds the head tipped back: level it
// bow: [chest, head] degrees: bow where the take leans back (see bowInstead)
// root: keep the hips' travel (sitting down / standing up move onto and off the seat)
// after: start where that clip ends
// seat: sit at the height that clip sits at (seated clips are captured on different chairs)
// knees: sitting, knees brought together this far apart
// airborne: a jump: the hips keep only their height over the lower foot
// legs: blend the legs this far toward the standing pose
export const CLIPS = {
  idle: { file: '15_NPC_Idle/Idle - Female.fbx', loop: true },
  happy: { file: '01_Idle/Happy Idle.fbx', loop: true, level: true },
  walk: { file: '09_Female_Locomotion/Female Walk.fbx', loop: true, walk: true, level: true },
  run: { file: '02_Locomotion/Running.fbx', loop: true, walk: true },
  fall: { file: '03_Jump_Climb/Falling Idle.fbx', loop: true },
  jump: { file: '03_Jump_Climb/Jumping.fbx', range: [0.5, 1.15], airborne: true, legs: 0.55 }, // in the air
  stretch: { file: '08_Daily/Arm Stretching.fbx' },
  yawn: { file: '01_Idle/Yawn.fbx' },
  phone: { file: '08_Daily/Texting While Standing.fbx', range: [0, 9] },
  bored: { file: '01_Idle/Bored.fbx' },
  lookFar: { file: '15_NPC_Idle/Looking Far - Shading Eyes.fbx' }, // a hand shading her eyes: the sea
  lookBehind: { file: '15_NPC_Idle/Looking Behind.fbx' },
  sway: { file: '15_NPC_Idle/Weight Shift Side To Side.fbx' },
  walkText: { file: '20_Movement_Plus/Texting And Walking - Female.fbx', loop: true, walk: true },
  pray: { file: '13_Japanese/Praying.fbx', bow: [10, 16] }, // at the shrine
  // greetings and goodbyes
  bow: { file: '13_Japanese/Quick Formal Bow.fbx' },
  greet: { file: '13_Japanese/Standing Greeting.fbx', range: [1.0, 4.6], level: true }, // a hand raised: hi!
  wave: { file: '06_Emote/Waving.fbx', loop: true, reps: 3, level: true },
  // reactions while talking
  agree: { file: '12_Dialogue/Agreeing.fbx' },
  acknowledge: { file: '12_Dialogue/Acknowledging.fbx' },
  thank: { file: '12_Dialogue/Thankful.fbx' },
  lookAway: { file: '12_Dialogue/Look Away Gesture.fbx' },
  disappointed: { file: '12_Dialogue/Disappointed.fbx' },
  // sitting on a bench
  sitDown: { file: '05_Interact/Stand To Sit.fbx', root: true, knees: 0.11 },
  sit: { file: '05_Interact/Sitting Idle.fbx', loop: true, after: 'sitDown', knees: 0.11 },
  standUp: { file: '05_Interact/Sit To Stand.fbx', root: true, after: 'sitDown', knees: 0.11 },
  sitFidget: { file: '16_Sitting/Sitting Fidgeting Feet.fbx', loop: true, after: 'sitDown', seat: 'sit', knees: 0.11 }, // swinging her feet
};

function convert(dir, only) {
  const fps = 30;
  const rest = loadFBX(path.join(dir, CLIPS.walk.file));
  const Q = calibrate(rest);
  rest.g.updateMatrixWorld(true);
  const hipsHeight = rest.joint('Hips').getWorldPosition(new THREE.Vector3()).y * 0.01;
  const out = {
    fps,
    source: 'Mixamo (X Bot rig)',
    bones: MAP.map((m) => m[1]),
    axes: Object.fromEntries(MAP.map(([, b, A]) => [b, A ? A.toArray().map((v) => +v.toFixed(4)) : null])),
    clips: {},
  };
  let standFrame = null;
  const ends = {}, starts = {};
  for (const [name, c] of Object.entries(CLIPS)) {
    if (only && !only.includes(name) && name !== 'idle') continue;
    const fbx = loadFBX(path.join(dir, c.file));
    let frames = sample(fbx, Q, fps);
    if (c.range) frames = frames.slice(Math.round(c.range[0] * fps), Math.round(c.range[1] * fps) + 1);
    if (c.knees) kneesTogether(frames, c.knees);
    // in the air the game lifts the body: keep only the hips' height over the lower foot
    if (c.airborne) for (const f of frames) f.hips.y -= Math.min(f.toes[0].y, f.toes[1].y);
    // legs: tone down the legs toward standing (a skirt does not forgive a high tuck)
    if (c.legs) {
      const legs = MAP.map(([, b], i) => (/UpperLeg|LowerLeg|Foot|Toes/.test(b) ? i : -1)).filter((i) => i >= 0);
      for (const f of frames) {
        for (const i of legs) f.rot[i].slerp(standFrame.rot[i], c.legs);
        f.hips.y += (standFrame.hips.y - f.hips.y) * c.legs;
      }
    }
    if (c.level) levelHead(frames);
    if (c.bow) bowInstead(frames, c.bow);
    const N = frames.length;
    let speed = 0;
    if (c.walk) speed = inPlaceSpeed(frames, fps);
    if (!c.root) {
      // in place: remove any drift of the hips over the take
      const p0 = frames[0].hips.clone(), p1 = frames[N - 1].hips.clone();
      frames.forEach((f, k) => {
        const u = N > 1 ? k / (N - 1) : 0;
        f.hips.x -= p0.x + (p1.x - p0.x) * u;
        f.hips.z -= p0.z + (p1.z - p0.z) * u;
      });
    }
    if (c.after) {
      // continues from where another clip ends (sitting on the seat that sitting down reached)
      const end = ends[c.after], f0 = frames[0].hips.clone();
      frames.forEach((f) => {
        f.hips.x += end.x - f0.x;
        f.hips.z += end.z - f0.z;
      });
    }
    if (c.seat) {
      const dy = starts[c.seat].y - frames[0].hips.y;
      frames.forEach((f) => (f.hips.y += dy));
    }
    let seam = 0;
    if (c.loop) {
      // close the cycle: spread any end/start mismatch over the loop, then drop the last key
      const last = frames[N - 1];
      seam = Math.max(...frames[0].rot.map((q, i) => q.angleTo(last.rot[i])));
      const fix = frames[0].rot.map((q, i) => q.clone().multiply(last.rot[i].clone().invert()));
      const dy = frames[0].hips.y - last.hips.y;
      frames.forEach((f, k) => {
        const u = k / (N - 1);
        f.rot = f.rot.map((q, i) => new THREE.Quaternion().slerp(fix[i], u).multiply(q));
        f.hips.y += dy * u;
      });
      frames.pop();
    }
    if (name === 'idle') standFrame = frames[0];
    ends[name] = frames[frames.length - 1].hips.clone();
    starts[name] = frames[0].hips.clone();
    out.clips[name] = pack(frames, { ...c, speed, hipsHeight });
    console.log(name.padEnd(10), String(frames.length).padStart(4), 'frames', (frames.length / fps).toFixed(2).padStart(6), 's', c.loop ? `loop seam ${THREE.MathUtils.radToDeg(seam).toFixed(1)}°` : '', speed ? `speed ${speed.toFixed(2)} m/s` : '');
  }
  out.clips.point = pack(synthPoint(standFrame, fps), { hipsHeight });
  out.clips.startle = pack(synthStartle(standFrame, fps), { hipsHeight });
  console.log('point, startle synthesized from the idle pose');
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const [dir, outPath, only] = process.argv.slice(2);
  const out = convert(dir, only?.split(','));
  fs.writeFileSync(outPath, JSON.stringify(out));
  console.log('wrote', outPath, (fs.statSync(outPath).size / 1024).toFixed(0), 'KB,', MAP.length, 'bones');
}
