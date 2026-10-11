import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { G, createCharacterMaterial } from '../render/materials.js';

// Umbrellas, and holding one.
//
// The umbrella: eight ribs on a shaft, a J handle, a runner and stretchers that slide up the
// shaft as it opens; the canopy a dome of eight panels between the ribs, its hem scalloped
// between the rib tips. Opening and closing move the ribs out from the shaft and back (the
// panels between them gather into folds as they close). Hers is a clear vinyl one (ビニール傘):
// the panels see-through, catching the light at a slant, white tape round the hem, rain
// beading on it while it rains; others are cloth in a colour, and a child's yellow one has a
// clear window in one panel to see through.
//
// Holding it (no motion clip has an umbrella in it, so the pose is laid over the clips): the
// right hand comes up in front of the chest, a two-bone IK puts it there, the fingers close
// round the handle with the thumb up the shaft, and the shaft leans so the canopy is over her
// head; it bobs with her walk. Closed, it hangs from her hand by the handle, swinging (a
// pendulum on the hand); on the bicycle it stands in the basket.

const RIBS = 8;
const NA = 5; // points across a panel
const NS = 10; // points along a rib
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _u = new THREE.Vector3(), _t = new THREE.Vector3();
const _q = new THREE.Quaternion(), _m = new THREE.Matrix4();

// open amount (0..1) -> the ribs' angle out from the shaft at the top, and their bend
function ribShape(o) {
  const e = o * o * (3 - 2 * o);
  return { beta: 0.035 + (1.536 - 0.035) * e, kappa: 0.95 * Math.pow(e, 1.5), e };
}
// a point down a rib (s 0..1 of length L): (out from the shaft, down from the top notch)
function ribAt(s, beta, kappa, L) {
  if (kappa < 1e-4) return [L * s * Math.sin(beta), -L * s * Math.cos(beta)];
  return [(L / kappa) * (Math.cos(beta - kappa * s) - Math.cos(beta)), (L / kappa) * (Math.sin(beta - kappa * s) - Math.sin(beta))];
}

// ---------------------------------------------------------------- clear vinyl
function clearCanopyMaterial() {
  return new THREE.ShaderMaterial({
    name: 'char:umbrellaClear',
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.ZeroFactor,
    blendDstAlpha: THREE.OneFactor,
    uniforms: {
      uSunDir: G.uSunDir,
      uSunColor: G.uSunColor,
      uSkyAmb: G.uSkyAmb,
      uNight: G.uNight,
      uTime: G.uTime,
      uWet: { value: 0 }, // rain on the canopy 0..1 (set by its holder)
      uIndoor: { value: 0 },
      uTint: { value: new THREE.Color(0.9, 0.96, 1.0) },
      uHem: { value: 0.97 }, // where the hem tape starts (along the rib)
    },
    vertexShader: /* glsl */ `
      attribute vec2 drop;
      varying vec3 vN;
      varying vec3 vWP;
      varying vec2 vDrop;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWP = wp.xyz;
        vN = normalize(mat3(modelMatrix) * normal);
        vDrop = drop;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uSunDir;
      uniform vec3 uSunColor;
      uniform vec3 uSkyAmb;
      uniform float uNight;
      uniform float uTime;
      uniform float uWet;
      uniform float uIndoor;
      uniform vec3 uTint;
      uniform float uHem;
      varying vec3 vN;
      varying vec3 vWP;
      varying vec2 vDrop;
      float hash12(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx) * 0.1031);
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
      }
      // beads of rain on the vinyl: (body, rim, highlight); now and then one runs off and
      // another lands
      vec3 beads(vec2 p, float size, float t, float k) {
        vec2 q = p / size;
        vec2 cell = floor(q);
        vec2 f = fract(q) - 0.5;
        float h = hash12(cell);
        float epoch = floor(t * 0.3 + h * 7.0);
        float present = step(hash12(cell + epoch * 1.37), 0.6 * k);
        vec2 c = (vec2(hash12(cell + 3.1 + epoch), hash12(cell + 5.7 + epoch)) - 0.5) * 0.45;
        float r = 0.17 + 0.2 * hash12(cell + 9.9 + epoch);
        float d = length(f - c);
        float body = smoothstep(r, r * 0.75, d) * present;
        float rim = smoothstep(r * 0.4, r, d) * body;
        float hl = smoothstep(r * 0.42, 0.0, length(f - c - vec2(-0.3, 0.3) * r)) * present;
        return vec3(body, rim, hl);
      }
      void main() {
        vec3 N = normalize(vN);
        vec3 V = normalize(cameraPosition - vWP);
        if (dot(N, V) < 0.0) N = -N;
        float ndv = clamp(dot(N, V), 0.0, 1.0);
        float fres = pow(1.0 - ndv, 3.0);
        vec3 light = mix(uSkyAmb * 1.25 + uSunColor * 0.6 + vec3(0.04), vec3(0.85, 0.82, 0.76), uIndoor * 0.6);
        light += vec3(0.05, 0.05, 0.06) * uNight;
        vec3 H = normalize(uSunDir + V);
        float spec = pow(max(dot(N, H), 0.0), 80.0) * length(uSunColor) * 1.5;
        vec3 b1 = beads(vDrop, 0.024, uTime, uWet);
        vec3 b2 = beads(vDrop + 3.7, 0.013, uTime * 1.3, uWet);
        float body = max(b1.x, b2.x), rim = max(b1.y, b2.y), hl = max(b1.z, b2.z);
        float a = 0.09 + 0.42 * fres + body * 0.22 + rim * 0.25;
        vec3 col = uTint * light * (0.85 + 0.3 * fres);
        col = mix(col, col * 0.55, rim * 0.6);
        col += vec3(1.0) * light * hl * 1.6 + spec;
        a = clamp(a + hl * 0.5 + spec * 0.3, 0.0, 0.95);
        // the white tape round the hem
        float hem = smoothstep(uHem - 0.004, uHem + 0.004, vDrop.y / 0.58);
        col = mix(col, vec3(0.95) * light * 1.1, hem);
        a = mix(a, 0.92, hem);
        gl_FragColor = vec4(col * a, a);
      }
    `,
  });
}

// ---------------------------------------------------------------- one umbrella
export class Umbrella {
  // canopy: 'clear' or a colour; frame / handle colours; window: a clear panel (child's);
  // size: 1 adult (60 cm ribs), less for a child's
  constructor({ canopy = 'clear', frame = 0xe9edf2, handle = 0xf4f4f0, window: win = false, size = 1 } = {}) {
    this.L = 0.58 * size; // rib
    this.top = 0.765 * size; // the top notch above the grip
    this.size = size;
    this.clear = canopy === 'clear';
    this.open = -1;
    this.group = new THREE.Group();
    this.group.name = 'umbrella';
    this.group.matrixAutoUpdate = false;
    // the canopy: panels between the ribs (one panel clear on a child's, to see out of)
    const n = RIBS * NA * NS;
    const cg = new THREE.BufferGeometry();
    cg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    cg.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    cg.setAttribute('drop', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    const idx = [];
    for (let g = 0; g < RIBS; g++) {
      for (let j = 0; j < NS - 1; j++) {
        for (let i = 0; i < NA - 1; i++) {
          const a = g * NA * NS + j * NA + i;
          idx.push(a, a + NA, a + 1, a + 1, a + NA, a + NA + 1);
        }
      }
    }
    cg.setIndex(idx);
    const per = (NS - 1) * (NA - 1) * 6;
    this.canopyGeo = cg;
    this.clearMat = this.clear || win ? clearCanopyMaterial() : null;
    if (this.clearMat) this.clearMat.uniforms.uHem.value = this.clear ? 0.97 : 2;
    const cloth = this.clear ? null : createCharacterMaterial({ name: 'char:umbrella', color: canopy, side: THREE.DoubleSide, shadeMix: 0.5, outline: 0.7, rim: 0.15 });
    if (this.clear) this.canopy = new THREE.Mesh(cg, this.clearMat);
    else if (win) {
      cg.addGroup(0, per, 1);
      cg.addGroup(per, per * (RIBS - 1), 0);
      this.canopy = new THREE.Mesh(cg, [cloth, this.clearMat]);
    } else this.canopy = new THREE.Mesh(cg, cloth);
    this.canopy.renderOrder = this.clear ? 30 : 0;
    this.canopy.frustumCulled = false;
    // ribs, stretchers and rib tips (moving), the shaft, the tip, the runner and the handle
    const fg = new THREE.BufferGeometry();
    const fv = (RIBS * NS + RIBS * 2) * 4 + RIBS * 8;
    fg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(fv * 3), 3));
    fg.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(fv * 3), 3));
    const fi = [];
    const tube = (base, count) => {
      for (let k = 0; k < count - 1; k++) {
        for (let c = 0; c < 4; c++) {
          const a = base + k * 4 + c, b = base + k * 4 + ((c + 1) % 4);
          fi.push(a, b, a + 4, b, b + 4, a + 4);
        }
      }
    };
    for (let g = 0; g < RIBS; g++) tube(g * NS * 4, NS);
    for (let g = 0; g < RIBS; g++) tube(RIBS * NS * 4 + g * 8, 2);
    const tipBase = (RIBS * NS + RIBS * 2) * 4;
    for (let g = 0; g < RIBS; g++) {
      const b = tipBase + g * 8;
      // a little box: 8 corners
      for (const [p, q, r, s] of [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]]) fi.push(b + p, b + q, b + r, b + p, b + r, b + s);
    }
    fg.setIndex(fi);
    this.frameGeo = fg;
    const frameMat = createCharacterMaterial({ name: 'char:umbrellaFrame', color: frame, shadeMix: 0.45, outline: 0.5 });
    const handleMat = createCharacterMaterial({ name: 'char:umbrellaHandle', color: handle, shadeMix: 0.45, outline: 0.8, rim: 0.3 });
    this.mats = [frameMat, handleMat, cloth].filter(Boolean);
    this.frame = new THREE.Mesh(fg, frameMat);
    this.frame.frustumCulled = false;
    const S = size;
    const shaft = new THREE.CylinderGeometry(0.0062, 0.0062, this.top - 0.06 * S, 8, 1, true).translate(0, (this.top + 0.06 * S) / 2, 0);
    const ferrule = new THREE.CylinderGeometry(0.0045, 0.0085, 0.04 * S, 8).translate(0, this.top + 0.02 * S, 0);
    const cap = new THREE.CylinderGeometry(0.012, 0.024 * S, 0.014, 12).translate(0, this.top + 0.002, 0);
    this.static = new THREE.Mesh(mergeGeometries([shaft, ferrule, cap].map((g) => g.toNonIndexed())), frameMat);
    this.static.frustumCulled = false;
    const hook = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.07 * S, 0),
      new THREE.Vector3(0, -0.07 * S, 0),
      new THREE.Vector3(0, -0.1 * S, 0.012 * S),
      new THREE.Vector3(0, -0.118 * S, 0.04 * S),
      new THREE.Vector3(0, -0.1 * S, 0.068 * S),
      new THREE.Vector3(0, -0.07 * S, 0.078 * S),
      new THREE.Vector3(0, -0.05 * S, 0.074 * S),
    ]);
    this.handle = new THREE.Mesh(new THREE.TubeGeometry(hook, 24, 0.0115 * (0.8 + 0.2 * S), 8, false), handleMat);
    this.handle.frustumCulled = false;
    this.runner = new THREE.Mesh(new THREE.CylinderGeometry(0.0105, 0.0105, 0.045, 10), frameMat);
    this.runner.frustumCulled = false;
    this.group.add(this.canopy, this.frame, this.static, this.handle, this.runner);
    for (const m of [this.canopy, this.frame, this.static, this.handle, this.runner]) {
      m.castShadow = false;
      m.receiveShadow = !(m === this.canopy && this.clear);
    }
    this.group.visible = false;
    this.setOpen(0);
  }

  // 0 closed .. 1 open
  setOpen(o) {
    o = THREE.MathUtils.clamp(o, 0, 1);
    if (Math.abs(o - this.open) < 1e-4) return;
    this.open = o;
    const { beta, kappa, e } = ribShape(o);
    const L = this.L, top = this.top;
    const pos = this.canopyGeo.attributes.position.array;
    const drop = this.canopyGeo.attributes.drop.array;
    const rib = [];
    for (let k = 0; k < NS; k++) rib.push(ribAt(k / (NS - 1), beta, kappa, L));
    const fold = (1 - e) * 0.03 * this.size;
    for (let g = 0; g < RIBS; g++) {
      const a0 = (g / RIBS) * Math.PI * 2, a1 = ((g + 1) / RIBS) * Math.PI * 2;
      for (let j = 0; j < NS; j++) {
        const s = j / (NS - 1);
        const [r, y] = rib[j];
        const x0 = Math.cos(a0) * r, z0 = Math.sin(a0) * r, x1 = Math.cos(a1) * r, z1 = Math.sin(a1) * r;
        const chord = Math.hypot(x1 - x0, z1 - z0);
        for (let i = 0; i < NA; i++) {
          const w = i / (NA - 1);
          const mid = Math.sin(Math.PI * w);
          let x = x0 + (x1 - x0) * w, z = z0 + (z1 - z0) * w;
          // gathered folds (closing), a slight billow (open), the hem lifting between the tips
          const am = a0 + (a1 - a0) * w;
          const out = mid * (fold * THREE.MathUtils.smoothstep(s, 0, 0.25) + e * 0.008 * this.size * Math.sin(Math.PI * s));
          x += Math.cos(am) * out;
          z += Math.sin(am) * out;
          const yy = top + y + e * 0.032 * this.size * mid * Math.pow(s, 6);
          const v = (g * NA * NS + j * NA + i) * 3;
          pos[v] = x;
          pos[v + 1] = yy;
          pos[v + 2] = z;
          const d = (g * NA * NS + j * NA + i) * 2;
          drop[d] = g * 0.9 + w * chord;
          drop[d + 1] = s * L;
        }
      }
    }
    this.canopyGeo.computeVertexNormals();
    this.canopyGeo.attributes.position.needsUpdate = true;
    this.canopyGeo.attributes.drop.needsUpdate = true;

    // the frame under the panels
    const fp = this.frameGeo.attributes.position.array;
    const fn = this.frameGeo.attributes.normal.array;
    let o3 = 0;
    const ring = (p, t, n1, h) => {
      const n2 = _u.crossVectors(t, n1).normalize();
      for (const [a, b] of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) {
        fp[o3] = p.x + (n1.x * a + n2.x * b) * h;
        fp[o3 + 1] = p.y + (n1.y * a + n2.y * b) * h;
        fp[o3 + 2] = p.z + (n1.z * a + n2.z * b) * h;
        fn[o3] = n1.x * a + n2.x * b;
        fn[o3 + 1] = n1.y * a + n2.y * b;
        fn[o3 + 2] = n1.z * a + n2.z * b;
        o3 += 3;
      }
    };
    const ribPts = [];
    for (let g = 0; g < RIBS; g++) {
      const a = (g / RIBS) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      const pts = rib.map(([r, y]) => new THREE.Vector3(ca * r, top + y, sa * r));
      ribPts.push(pts);
      for (let k = 0; k < NS; k++) {
        const t = _t.copy(pts[Math.min(k + 1, NS - 1)]).sub(pts[Math.max(k - 1, 0)]).normalize();
        // just under the vinyl
        const out = _w.set(ca, 0, sa);
        const nrm = _v.copy(out).addScaledVector(t, -out.dot(t)).normalize();
        const p = pts[k].clone().addScaledVector(nrm, -0.004);
        ring(p, t, nrm, 0.0026 * (1 - 0.3 * (k / NS)));
      }
    }
    // the runner slides up the shaft as the stretchers push the ribs out
    const at = Math.round(0.36 * (NS - 1));
    const [ra, ya] = rib[at];
    const sl = 0.328 * this.size;
    const runY = top + ya - Math.sqrt(Math.max(sl * sl - ra * ra, 0));
    this.runner.position.set(0, runY, 0);
    this.runner.updateMatrix();
    for (let g = 0; g < RIBS; g++) {
      const a = (g / RIBS) * Math.PI * 2;
      const p0 = new THREE.Vector3(Math.cos(a) * 0.009, runY + 0.012, Math.sin(a) * 0.009);
      const p1 = ribPts[g][at].clone();
      const t = _t.copy(p1).sub(p0).normalize();
      const n1 = _v.set(-Math.sin(a), 0, Math.cos(a));
      ring(p0, t, n1, 0.0019);
      ring(p1.addScaledVector(_w.set(0, -1, 0), 0.006), t, n1, 0.0019);
    }
    // the rib tips (露先)
    for (let g = 0; g < RIBS; g++) {
      const p = ribPts[g][NS - 1];
      const h = 0.0055 * this.size;
      for (const [a, b, c] of [[-1, -1, -1], [1, -1, -1], [-1, 1, -1], [1, 1, -1], [-1, -1, 1], [1, -1, 1], [-1, 1, 1], [1, 1, 1]]) {
        fp[o3] = p.x + a * h;
        fp[o3 + 1] = p.y + b * h * 1.6 - 0.004;
        fp[o3 + 2] = p.z + c * h;
        _v.set(a, b, c).normalize();
        fn[o3] = _v.x;
        fn[o3 + 1] = _v.y;
        fn[o3 + 2] = _v.z;
        o3 += 3;
      }
    }
    this.frameGeo.attributes.position.needsUpdate = true;
    this.frameGeo.attributes.normal.needsUpdate = true;
    this.tips = ribPts.map((pts) => pts[NS - 1]);
  }

  // put it in the world: the grip at `origin`, the shaft up along `up`, the hook toward `fwd`
  place(origin, up, fwd) {
    const Y = _v.copy(up).normalize();
    const Z = _w.copy(fwd).addScaledVector(Y, -fwd.dot(Y));
    if (Z.lengthSq() < 1e-6) Z.set(0, 0, 1).addScaledVector(Y, -Y.z);
    Z.normalize();
    const X = _u.crossVectors(Y, Z);
    this.group.matrix.makeBasis(X, Y, Z).setPosition(origin);
    this.group.matrixWorldNeedsUpdate = true;
  }

  // rain on it, the room's light (as on the one holding it)
  setWet(k) {
    if (this.clearMat) this.clearMat.uniforms.uWet.value = k;
  }
  setIndoor(k) {
    for (const m of this.mats) if (m.uniforms?.uIndoor) m.uniforms.uIndoor.value = k;
    if (this.clearMat) this.clearMat.uniforms.uIndoor.value = k;
  }

  // the canopy over the holder in world terms, for the rain to keep off: centre x, z, the top
  // and the rim's height, its radius
  cover() {
    const m = this.group.matrix;
    const { beta, kappa } = ribShape(this.open);
    const [r, y] = ribAt(1, beta, kappa, this.L);
    _v.set(0, this.top, 0).applyMatrix4(m);
    const topY = _v.y;
    _w.set(0, this.top + y, 0).applyMatrix4(m);
    return { x: _w.x, z: _w.z, top: topY + 0.03, low: _w.y, r: r + 0.02 };
  }
}

// ---------------------------------------------------------------- holding it
// the right hand's fingers closed round a handle, the thumb along it (w: how far)
const GRIP = [
  ['rightIndexProximal', 'z', 1.25], ['rightIndexIntermediate', 'z', 1.45], ['rightIndexDistal', 'z', 0.9],
  ['rightMiddleProximal', 'z', 1.3], ['rightMiddleIntermediate', 'z', 1.5], ['rightMiddleDistal', 'z', 0.9],
  ['rightRingProximal', 'z', 1.35], ['rightRingIntermediate', 'z', 1.5], ['rightRingDistal', 'z', 0.9],
  ['rightLittleProximal', 'z', 1.4], ['rightLittleIntermediate', 'z', 1.45], ['rightLittleDistal', 'z', 0.85],
  ['rightThumbMetacarpal', 'x', 0.35], ['rightThumbProximal', 'x', 0.45], ['rightThumbDistal', 'x', 0.35],
];
const AXES = { x: new THREE.Vector3(1, 0, 0), z: new THREE.Vector3(0, 0, 1) };
const gripQ = GRIP.map(([b, ax, a]) => [b, new THREE.Quaternion().setFromAxisAngle(AXES[ax], a)]);
// bones the hold lays its pose on (their clip pose is put back each frame: Character keep)
export const HOLD_BONES = ['rightUpperArm', 'rightLowerArm', 'rightHand', ...GRIP.map((g) => g[0])];

// where she holds it, in her own frame (x left, y up, z forward) from her upper chest: the
// hand in front of her chest a little to the right; the canopy over her head
const HOLD = { grip: new THREE.Vector3(-0.125, -0.02, 0.215), apex: new THREE.Vector3(-0.035, 0.55, -0.01), fingers: new THREE.Vector3(0.38, -0.1, 1), pole: new THREE.Vector3(-0.6, -1, -0.3) };
const FIST = { fingers: 0.05, palm: 0.022 }; // the handle's centre from the wrist

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _e = new THREE.Vector3();
const _rq = new THREE.Quaternion(), _hq = new THREE.Quaternion();
const _saved = new Map();

// A character with an umbrella: wants 'away' (put away), 'open' (held over her), 'hang'
// (closed, carried) or 'basket' (on the bicycle, see Bicycle.basket).
export class UmbrellaCarrier {
  constructor(umbrella, opts = {}) {
    this.u = umbrella;
    this.want = 'away';
    this.arm = 0; // the arm up holding it 0..1
    this.fingers = 0; // the fingers round the handle
    this.shown = false;
    this.basket = null; // Object3D on the bicycle to stand it in
    this.openRate = opts.openRate ?? 2.2;
    this.tip = null; // the pendulum's tip (hanging)
    this.tipPrev = null;
    this.raise = opts.raise ?? 1; // (a child holds it lower, nearer)
    // her own way of holding it (a child holds hers up high, close in): offsets as in HOLD
    this.grip = opts.grip ? new THREE.Vector3(...opts.grip) : HOLD.grip.clone().multiplyScalar(this.raise);
    this.apex = opts.apex ? new THREE.Vector3(...opts.apex) : HOLD.apex;
    this.wetK = 0;
    this.lean = 0; // tilted forward into the rain (running)
  }

  // called from Character.update (ch.hold), after the clip, the look and the ground fit
  pose(ch, dt) {
    const U = this.u, want = this.want;
    // put away / in the basket: no hand on it
    const inHand = want === 'open' || want === 'hang';
    if (want === 'basket') {
      this.arm = 0;
      this.fingers = 0;
      U.setOpen(0);
      this._toBasket();
      return;
    }
    if (U.group.parent !== ch.root.parent && ch.root.parent) {
      ch.root.parent.add(U.group);
      this.tip = null;
    }
    // the arm comes up to hold it; it opens once up (and closes before it comes down)
    const armGoal = want === 'open' ? 1 : 0;
    if (armGoal > this.arm) this.arm = Math.min(1, this.arm + dt * 2.4);
    else if (U.open <= 0.02) this.arm = Math.max(0, this.arm - dt * 2.0);
    const openGoal = want === 'open' && this.arm > 0.85 ? 1 : 0;
    U.setOpen(U.open + THREE.MathUtils.clamp(openGoal - U.open, -dt * this.openRate * 1.2, dt * this.openRate));
    this.fingers += ((inHand ? 1 : 0) - this.fingers) * Math.min(1, dt * 8);
    const visible = inHand || this.arm > 0.02 || U.open > 0.02;
    U.group.visible = visible && ch.root.visible;
    this.shown = visible;
    if (!visible && this.fingers < 0.02) return;

    const root = ch.root;
    root.updateMatrixWorld(true);
    _rq.copy(root.quaternion);
    const k = this.arm * this.arm * (3 - 2 * this.arm);
    // her frame
    const uc = ch.node('upperChest') || ch.node('chest');
    uc.getWorldPosition(_a);
    const gripW = _b.copy(this.grip).applyQuaternion(_rq).add(_a);
    ch.node('head').getWorldPosition(_c);
    const apexW = _d.copy(this.apex).applyQuaternion(_rq).add(_c);
    const shaftDir = _e.copy(apexW).sub(gripW).normalize();
    if (this.lean > 0.001) shaftDir.addScaledVector(_t.set(0, 0, 1).applyQuaternion(_rq), this.lean).normalize();
    // the hand round the handle: fingers forward and in, thumb up the shaft, palm inward
    const T = shaftDir;
    const F0 = _v.copy(HOLD.fingers).applyQuaternion(_rq).normalize();
    const F = F0.addScaledVector(T, -F0.dot(T)).normalize();
    const P = _w.crossVectors(T, F).normalize();
    _m.makeBasis(_u.copy(F).negate(), _t.copy(P).negate(), T);
    _hq.setFromRotationMatrix(_m);

    // the clip's pose of the arm, to blend from
    for (const b of HOLD_BONES) {
      const n = ch.node(b);
      if (!n) continue;
      if (!_saved.has(b)) _saved.set(b, new THREE.Quaternion());
      _saved.get(b).copy(n.quaternion);
    }
    if (k > 0.001) {
      const wrist = gripW.clone().addScaledVector(F, -FIST.fingers).addScaledVector(P, -FIST.palm);
      const pole = HOLD.pole.clone().applyQuaternion(_rq);
      ch.ik('rightUpperArm', 'rightLowerArm', 'rightHand', wrist, pole);
      ch.setWorldQuaternion('rightHand', _hq);
      for (const b of ['rightUpperArm', 'rightLowerArm', 'rightHand']) {
        const n = ch.node(b);
        _q.copy(n.quaternion);
        n.quaternion.slerpQuaternions(_saved.get(b), _q, k);
      }
    }
    for (const [b, q] of gripQ) {
      const n = ch.node(b);
      if (n) n.quaternion.slerpQuaternions(_saved.get(b), q, this.fingers);
    }
    ch.node('rightUpperArm').updateMatrixWorld(true);

    // where the handle is now: in the fist
    const hand = ch.node('rightHand');
    hand.getWorldPosition(_a);
    const fx = _c.set(-1, 0, 0).transformDirection(hand.matrixWorld);
    const py = _d.set(0, -1, 0).transformDirection(hand.matrixWorld);
    const origin = _a.addScaledVector(fx, FIST.fingers).addScaledVector(py, FIST.palm);
    const fwd = _u.set(0, 0, 1).applyQuaternion(_rq);

    // closed and carried: it hangs from her hand and swings (a pendulum on the hand)
    const len = U.top * 0.8;
    if (!this.tip) {
      this.tip = origin.clone().addScaledVector(_v.set(0, -1, 0), len);
      this.tipPrev = this.tip.clone();
    }
    const tip = this.tip, prev = this.tipPrev;
    const step = Math.min(dt, 1 / 30);
    _v.copy(tip).sub(prev).multiplyScalar(0.9);
    prev.copy(tip);
    tip.add(_v).y -= 9.8 * step * step;
    const ground = ch.ground(tip.x, tip.z) + 0.03;
    if (tip.y < ground) tip.y = ground;
    _v.copy(tip).sub(origin);
    if (_v.lengthSq() < 1e-8) _v.set(0, -1, 0);
    tip.copy(origin).addScaledVector(_v.normalize(), len);
    const hangDir = _v; // origin -> tip

    // held up: the shaft over her (raising it swings it up through the front)
    let up;
    if (k >= 0.999) up = _w.copy(shaftDir);
    else {
      const th = Math.PI * k;
      up = _w.copy(hangDir).multiplyScalar(Math.cos(th)).addScaledVector(fwd, Math.sin(th) * (1 - Math.abs(hangDir.dot(fwd)))).normalize();
      if (k > 0.5) up.lerp(shaftDir, (k - 0.5) * 2).normalize();
      // (the pendulum follows the raised umbrella, so lowering it again starts from there)
      if (k > 0.05) {
        tip.copy(origin).addScaledVector(up, -len);
        prev.copy(tip);
      }
    }
    U.place(origin, up, fwd);
    // rain beading on it while it is up in the rain
    this.wetK += ((G.uRain.value > 0.02 && U.open > 0.5 ? 1 : 0) - this.wetK) * Math.min(1, dt * (this.wetK < 0.5 ? 0.15 : 0.05));
    U.setWet(this.wetK);
    U.setIndoor(ch.indoorK ?? 0);
  }

  _toBasket() {
    const U = this.u;
    if (!this.basket) {
      U.group.visible = false;
      return;
    }
    if (U.group.parent !== this.basket) {
      // standing in the basket (on its floor), leaning back against the stem, the handle up
      this.basket.add(U.group);
      const up = _w.set(0.05, 1, -0.32).normalize();
      const origin = _a.set(0.04, 0.015, 0.06).addScaledVector(up, U.top + 0.035 * U.size);
      U.place(origin, _c.copy(up).negate(), _u.set(1, 0, 0));
      this.tip = null;
    }
    U.group.visible = true;
  }
}

// Water running off the rib tips of an open umbrella in the rain: a drop now and then from
// one tip or another, falling.
export class Drips {
  constructor(n = 16) {
    this.n = n;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 8 * 3), 3));
    const uv = new Float32Array(n * 8 * 2);
    const idx = [];
    for (let i = 0; i < n * 2; i++) {
      uv.set([0, 0, 1, 0, 1, 1, 0, 1], i * 8);
      const b = i * 4;
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    this.geo = g;
    this.mesh = new THREE.Mesh(
      g,
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.CustomBlending,
        blendEquation: THREE.AddEquation,
        blendSrc: THREE.OneFactor,
        blendDst: THREE.OneFactor,
        blendSrcAlpha: THREE.ZeroFactor,
        blendDstAlpha: THREE.OneFactor,
        uniforms: { uSkyAmb: G.uSkyAmb, uNight: G.uNight },
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 uSkyAmb;
          uniform float uNight;
          varying vec2 vUv;
          void main() {
            float a = (1.0 - abs(vUv.x * 2.0 - 1.0)) * smoothstep(0.0, 0.5, vUv.y);
            gl_FragColor = vec4((uSkyAmb * 1.3 + vec3(0.12 + 0.08 * uNight)) * a * 0.9, 0.0);
          }
        `,
      }),
    );
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 31;
    this.mesh.name = 'drips';
    this.d = Array.from({ length: n }, () => ({ x: 0, y: 0, z: 0, vy: 0, life: 0 }));
  }

  // rate: drops a second (0: none new)
  update(dt, umbrella, rate) {
    const pos = this.geo.attributes.position.array;
    const m = umbrella.group.matrixWorld;
    let alive = false;
    for (let i = 0; i < this.n; i++) {
      const d = this.d[i];
      if (d.life <= 0 && rate > 0 && Math.random() < (rate * dt) / this.n * 2) {
        _v.copy(umbrella.tips[(Math.random() * umbrella.tips.length) | 0]).applyMatrix4(m);
        d.x = _v.x;
        d.y = _v.y - 0.012;
        d.z = _v.z;
        d.vy = -0.3;
        d.life = 0.65;
      }
      let len = 0;
      if (d.life > 0) {
        alive = true;
        d.life -= dt;
        d.vy -= 9.8 * dt;
        d.y += d.vy * dt;
        len = Math.min(0.09, 0.015 + Math.abs(d.vy) * 0.012);
      }
      const w = len ? 0.0045 : 0;
      const o = i * 24;
      const quad = (k, ax, az) => {
        const b = o + k * 12;
        const y0 = d.y, y1 = d.y + len;
        pos.set([d.x - ax * w, y0, d.z - az * w, d.x + ax * w, y0, d.z + az * w, d.x + ax * w, y1, d.z + az * w, d.x - ax * w, y1, d.z - az * w], b);
      };
      quad(0, 1, 0);
      quad(1, 0, 1);
    }
    this.geo.attributes.position.needsUpdate = true;
    this.mesh.visible = alive;
  }
}
