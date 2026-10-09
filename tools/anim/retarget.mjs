// Retarget motion-capture BVH clips onto the VRM humanoid.
//
//   node tools/anim/retarget.mjs <bvh dir> public/chars/motions.json
//
// <bvh dir>: dataset/Bandai-Namco-Research-Motiondataset-1/data of
// https://github.com/BandaiNamcoResearchInc/Bandai-Namco-Research-Motiondataset (CC BY-NC 4.0)
//
// The capture skeleton's joints carry their own local axes (bones run along local +X), so
// rotations cannot be copied over. For every bone we find the rotation Q that maps an ideal
// VRM T-pose bone frame (bone axis + a forward/up reference axis) into the capture joint's
// frame, calibrated on a neutral standing frame. Then W_vrm(t) = W_bvh(t) * Q for every
// frame; the output stores these world rotations (in a frame where the character faces
// +Z), so the browser can turn them into local rotations for whatever bone hierarchy the
// model has. Walks are cut to one seamless gait cycle and made in-place; the speed is kept
// so the walker can move at exactly the pace of its feet.
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const X = V(1, 0, 0), Y = V(0, 1, 0), Z = V(0, 0, 1);

// capture joint -> VRM humanoid bone, with the ideal T-pose [bone axis, reference axis]
const MAP = [
  ['Hips', 'hips', Y, Z], ['Spine', 'spine', Y, Z], ['Chest', 'chest', Y, Z], ['Neck', 'neck', Y, Z], ['Head', 'head', Y, Z],
  ['Shoulder_L', 'leftShoulder', X, Z], ['UpperArm_L', 'leftUpperArm', X, Z], ['LowerArm_L', 'leftLowerArm', X, Z], ['Hand_L', 'leftHand', X, Z],
  ['Shoulder_R', 'rightShoulder', X.clone().negate(), Z], ['UpperArm_R', 'rightUpperArm', X.clone().negate(), Z], ['LowerArm_R', 'rightLowerArm', X.clone().negate(), Z], ['Hand_R', 'rightHand', X.clone().negate(), Z],
  ['UpperLeg_L', 'leftUpperLeg', Y.clone().negate(), Z], ['LowerLeg_L', 'leftLowerLeg', Y.clone().negate(), Z], ['Foot_L', 'leftFoot', Z, Y], ['Toes_L', 'leftToes', Z, Y],
  ['UpperLeg_R', 'rightUpperLeg', Y.clone().negate(), Z], ['LowerLeg_R', 'rightLowerLeg', Y.clone().negate(), Z], ['Foot_R', 'rightFoot', Z, Y], ['Toes_R', 'rightToes', Z, Y],
];
// which child joint gives each joint's bone axis (otherwise: the joint's own offset)
const AXIS_CHILD = { Hips: 'Spine', Spine: 'Chest', Chest: 'Neck', Neck: 'Head', Shoulder_L: 'UpperArm_L', UpperArm_L: 'LowerArm_L', LowerArm_L: 'Hand_L', Shoulder_R: 'UpperArm_R', UpperArm_R: 'LowerArm_R', LowerArm_R: 'Hand_R', UpperLeg_L: 'LowerLeg_L', LowerLeg_L: 'Foot_L', Foot_L: 'Toes_L', UpperLeg_R: 'LowerLeg_R', LowerLeg_R: 'Foot_R', Foot_R: 'Toes_R' };

// ------------------------------------------------------------------------------- BVH
function parseBVH(text) {
  const [head, motion] = text.split(/MOTION/);
  const tok = head.split(/\s+/).filter(Boolean);
  const joints = [];
  const stack = [];
  let i = 0, cur = null;
  while (i < tok.length) {
    const t = tok[i++];
    if (t === 'ROOT' || t === 'JOINT') {
      cur = { name: tok[i++], parent: stack.length ? stack[stack.length - 1] : null, offset: null, channels: [], end: null };
      joints.push(cur);
    } else if (t === 'End') {
      i++; // Site
      const o = tok.indexOf('OFFSET', i);
      joints[joints.length - 1].end = V(+tok[o + 1], +tok[o + 2], +tok[o + 3]);
      // skip "{ OFFSET x y z }"
      i = o + 5;
    } else if (t === '{') {
      if (cur) stack.push(cur);
      cur = null;
    } else if (t === '}') {
      stack.pop();
    } else if (t === 'OFFSET') {
      const j = stack[stack.length - 1];
      j.offset = V(+tok[i], +tok[i + 1], +tok[i + 2]);
      i += 3;
    } else if (t === 'CHANNELS') {
      const n = +tok[i++];
      stack[stack.length - 1].channels = tok.slice(i, i + n);
      i += n;
    }
  }
  const lines = motion.trim().split('\n');
  const frames = lines.slice(2).map((l) => l.trim().split(/\s+/).map(Number));
  const dt = parseFloat(lines[1].split(':')[1]);
  return { joints, frames, dt };
}

// world rotation / position of every joint for every frame (meters)
function fk(bvh) {
  const { joints, frames } = bvh;
  const out = [];
  const e = new THREE.Euler();
  for (const f of frames) {
    let c = 0;
    const W = new Map();
    for (const j of joints) {
      const pos = j.offset.clone();
      const ang = {};
      let order = '';
      for (const ch of j.channels) {
        const v = f[c++];
        if (ch === 'Xposition') pos.x = v;
        else if (ch === 'Yposition') pos.y = v;
        else if (ch === 'Zposition') pos.z = v;
        else {
          const ax = ch[0];
          ang[ax] = THREE.MathUtils.degToRad(v);
          order += ax;
        }
      }
      e.set(ang.X || 0, ang.Y || 0, ang.Z || 0, order || 'XYZ');
      const q = new THREE.Quaternion().setFromEuler(e);
      pos.multiplyScalar(0.01);
      const p = j.parent ? W.get(j.parent.name) : { q: new THREE.Quaternion(), p: V(0, 0, 0) };
      W.set(j.name, { q: p.q.clone().multiply(q), p: pos.applyQuaternion(p.q).add(p.p) });
    }
    out.push(W);
  }
  return out;
}

function boneAxes(bvh) {
  const byName = new Map(bvh.joints.map((j) => [j.name, j]));
  const axes = {};
  for (const j of bvh.joints) {
    const child = AXIS_CHILD[j.name];
    let a = child ? byName.get(child).offset.clone() : j.end && j.end.length() > 1e-4 ? j.end.clone() : j.offset.clone();
    axes[j.name] = a.normalize();
  }
  return axes;
}

// body facing (+Z of the character) at a frame, from the hip joints
function facing(W) {
  const left = W.get('UpperLeg_L').p.clone().sub(W.get('UpperLeg_R').p);
  left.y = 0;
  return left.normalize().cross(Y).normalize(); // left x up = forward
}

const perp = (v, n) => v.clone().addScaledVector(n, -v.dot(n)).normalize();
function basis(a, r) {
  const r2 = perp(r, a);
  return new THREE.Matrix4().makeBasis(a, r2, a.clone().cross(r2));
}

// per-bone Q (ideal VRM bone frame -> capture joint frame), from a neutral standing frame
function calibrate(bvh, W0) {
  const axes = boneAxes(bvh);
  const fwd = facing(W0);
  const Q = {};
  for (const [jn, , A, R] of MAP) {
    const w = W0.get(jn);
    const a = axes[jn];
    const dir = a.clone().applyQuaternion(w.q);
    const refW = R === Y ? Y : Math.abs(dir.dot(fwd)) > 0.95 ? Y : fwd;
    const r = perp(refW, dir).applyQuaternion(w.q.clone().invert());
    const m = basis(a, r).multiply(basis(A, R).transpose());
    Q[jn] = new THREE.Quaternion().setFromRotationMatrix(m);
  }
  return Q;
}

// ------------------------------------------------------------------------------- clips
function retarget(bvh, Q, opts) {
  const W = fk(bvh);
  const n = W.length;
  let a = 0, b = n - 1;
  // yaw so that the character faces (or walks along) +Z
  let dir;
  if (opts.loop) {
    const sp = W.map((w, k) => (k ? w.get('Hips').p.clone().sub(W[k - 1].get('Hips').p).setY(0).length() : 0));
    const vmax = Math.max(...sp.slice(5));
    const steady = sp.map((v, k) => k > 3 && v > 0.8 * vmax);
    const first = steady.indexOf(true), last = steady.lastIndexOf(true);
    a = first + 8;
    const feat = (w) => {
      const f = [w.get('Hips').p.y * 4];
      for (const jn of ['UpperLeg_L', 'LowerLeg_L', 'UpperLeg_R', 'LowerLeg_R', 'UpperArm_L', 'UpperArm_R']) {
        const d = w.get(jn).q.clone().multiply(Q[jn]);
        const v = V(0, 1, 0).applyQuaternion(d);
        f.push(v.x, v.y, v.z);
      }
      return f;
    };
    const fa = feat(W[a]);
    let best = 1e9;
    for (let k = a + 24; k <= Math.min(a + 48, last); k++) {
      const fk2 = feat(W[k]);
      const d = fa.reduce((s, v, i) => s + (v - fk2[i]) ** 2, 0);
      if (d < best) {
        best = d;
        b = k;
      }
    }
    dir = W[b].get('Hips').p.clone().sub(W[a].get('Hips').p).setY(0).normalize();
  } else {
    dir = facing(W[0]);
    // the captures repeat the gesture: keep the first one. Motion energy = summed joint
    // rotation speed in the hips' frame (smoothed); the first active stretch, with gaps
    // under 0.4 s bridged, plus a little standing before and after.
    const rel = (w, jn) => w.get('Hips').q.clone().invert().multiply(w.get(jn).q);
    const raw = W.map((w, k) => {
      if (!k) return 0;
      let s = 0;
      for (const [jn] of MAP) if (jn !== 'Hips') s += rel(w, jn).angleTo(rel(W[k - 1], jn));
      return s;
    });
    const R = Math.round(0.15 / bvh.dt);
    const energy = raw.map((_, k) => {
      let s = 0, c = 0;
      for (let j = Math.max(0, k - R); j <= Math.min(n - 1, k + R); j++, c++) s += raw[j];
      return s / c;
    });
    const sorted = [...energy].sort((x, y) => x - y);
    const lo = sorted[Math.floor(n * 0.1)], hi = sorted[Math.floor(n * 0.95)];
    const thr = lo + (hi - lo) * (opts.thr ?? 0.3);
    const gap = Math.round((opts.gap ?? 0.4) / bvh.dt);
    let s0 = energy.findIndex((e) => e > thr), s1 = s0, quiet = 0;
    for (let k = s0; k < n && s0 >= 0; k++) {
      if (energy[k] > thr) {
        s1 = k;
        quiet = 0;
      } else if (++quiet > gap) break;
    }
    a = Math.max(0, s0 - Math.round(0.35 / bvh.dt));
    if (opts.maxLen) s1 = Math.min(s1, s0 + Math.round(opts.maxLen / bvh.dt));
    b = Math.min(n - 1, s1 + Math.round(0.5 / bvh.dt));
    // or a range picked by eye (seconds)
    if (opts.range) [a, b] = opts.range.map((t) => Math.min(n - 1, Math.round(t / bvh.dt)));
    if (process.env.DEBUG_TRIM) console.log('  energy', energy.filter((_, k) => k % 6 === 0).map((e) => (e > thr ? '#' : '.')).join(''));
  }
  const G = new THREE.Quaternion().setFromUnitVectors(dir, Z);
  const frames = [];
  for (let k = a; k <= b; k++) {
    const w = W[k];
    frames.push({
      rot: MAP.map(([jn]) => G.clone().multiply(w.get(jn).q).multiply(Q[jn])),
      hips: w.get('Hips').p.clone().applyQuaternion(G),
    });
  }
  const N = frames.length;
  const p0 = frames[0].hips.clone(), p1 = frames[N - 1].hips.clone();
  const span = (N - 1) * bvh.dt;
  const speed = opts.loop ? p1.clone().sub(p0).setY(0).length() / span : 0;
  // in place: remove the straight-line travel (and, for one-shots, any drift)
  for (let k = 0; k < N; k++) {
    const u = k / (N - 1);
    const f = frames[k].hips;
    f.x -= p0.x + (p1.x - p0.x) * u;
    f.z -= p0.z + (p1.z - p0.z) * u;
  }
  if (opts.loop) {
    // close the cycle: spread the end/start mismatch over the loop, then drop the last frame
    const last = frames[N - 1];
    const fix = MAP.map((_, i) => frames[0].rot[i].clone().multiply(last.rot[i].clone().invert()));
    const dy = frames[0].hips.y - last.hips.y;
    for (let k = 0; k < N; k++) {
      const u = k / (N - 1);
      frames[k].rot = frames[k].rot.map((q, i) => new THREE.Quaternion().slerp(fix[i], u).multiply(q));
      frames[k].hips.y += dy * u;
    }
    frames.pop();
  }
  return { frames, speed, hipsHeight: W[a].get('Hips').p.y, dt: bvh.dt, range: [a, b] };
}

function pack(clip) {
  const nb = MAP.length, nf = clip.frames.length;
  const rot = new Int16Array(nf * nb * 4);
  const pos = new Int16Array(nf * 3);
  clip.frames.forEach((f, k) => {
    f.rot.forEach((q, i) => {
      q.normalize();
      const o = (k * nb + i) * 4;
      rot[o] = Math.round(q.x * 32767);
      rot[o + 1] = Math.round(q.y * 32767);
      rot[o + 2] = Math.round(q.z * 32767);
      rot[o + 3] = Math.round(q.w * 32767);
    });
    pos[k * 3] = Math.round(f.hips.x * 10000);
    pos[k * 3 + 1] = Math.round(f.hips.y * 10000);
    pos[k * 3 + 2] = Math.round(f.hips.z * 10000);
  });
  return {
    frames: nf,
    loop: !!clip.loop,
    speed: +clip.speed.toFixed(4),
    hipsHeight: +clip.hipsHeight.toFixed(4),
    rot: Buffer.from(rot.buffer).toString('base64'),
    hips: Buffer.from(pos.buffer).toString('base64'),
  };
}

// ------------------------------------------------------------------------------- main
const [dir, outPath] = process.argv.slice(2);
const CLIPS = {
  walk: { file: 'dataset-1_walk_feminine_001.bvh', loop: true },
  stand: { file: 'dataset-1_bow_feminine_001.bvh', range: [0, 0.3] }, // standing still before the bow
  bow: { file: 'dataset-1_bow_feminine_001.bvh', range: [0.7, 3.9] }, // down, hold, up (the take goes on)
  wave: { file: 'dataset-1_bye_feminine_001.bvh', maxLen: 2.6 }, // one short wave of the hand
  nod: { file: 'dataset-1_respond_normal_001.bvh' },
  guide: { file: 'dataset-1_guide_feminine_001.bvh', gap: 0.6 },
};
// calibrate on the standing first frame of the bow (walks start mid-stride); clips recorded
// with a different skeleton calibrate on their own first frame
const calib = parseBVH(fs.readFileSync(path.join(dir, 'dataset-1_bow_feminine_001.bvh'), 'utf8'));
const calibW = fk(calib)[0];
const Qcal = calibrate(calib, calibW);
const skelKey = (b) => b.joints.map((j) => j.name + j.offset.toArray().map((v) => v.toFixed(3)).join(',')).join(';');
const out = { fps: Math.round(1 / calib.dt), bones: MAP.map((m) => m[1]), clips: {} };
console.log('calibration facing', facing(calibW).toArray().map((v) => v.toFixed(2)).join(','));
for (const [name, c] of Object.entries(CLIPS)) {
  const bvh = parseBVH(fs.readFileSync(path.join(dir, c.file), 'utf8'));
  const Q = skelKey(bvh) === skelKey(calib) ? Qcal : calibrate(bvh, fk(bvh)[0]);
  const clip = retarget(bvh, Q, c);
  clip.loop = !!c.loop;
  // one scale for every clip (the actor's standing hip height), so the figure keeps its size
  clip.hipsHeight = calibW.get('Hips').p.y;
  out.clips[name] = pack(clip);
  console.log(name, 'frames', clip.frames.length, 'range', clip.range.join('-'), 'speed', clip.speed.toFixed(2), 'hips', clip.hipsHeight.toFixed(3));
}
fs.writeFileSync(outPath, JSON.stringify(out));
console.log('wrote', outPath, (fs.statSync(outPath).size / 1024).toFixed(0), 'KB');
