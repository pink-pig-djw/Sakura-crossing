import * as THREE from 'three';
import { RNG } from '../core/rng.js';
import { MeshBuilder } from '../core/builder.js';
import { G } from '../render/materials.js';
import { terrainH, shoreZ, COAST, TUNNEL_X } from './layout.js';
import { car } from './kit.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ---------------------------------------------------------------------------
// Falling sakura petals (GPU animated instanced quads)
// ---------------------------------------------------------------------------
export function createPetals(emitters, count = 5200) {
  const rng = new RNG(2024);
  const base = new THREE.PlaneGeometry(1, 1);
  const g = new THREE.InstancedBufferGeometry();
  g.index = base.index;
  g.setAttribute('position', base.attributes.position);
  g.setAttribute('uv', base.attributes.uv);
  const a0 = new Float32Array(count * 4); // start x, y, z, fall height
  const a1 = new Float32Array(count * 4); // phase, period, spin seed, size
  const big = emitters.filter((e) => e.big);
  const list = big.length ? big : emitters;
  for (let i = 0; i < count; i++) {
    const e = list[Math.floor(rng.next() * list.length)] || { x: 0, y: 10, z: 0, r: 4, ground: 5 };
    const a = rng.next() * Math.PI * 2;
    const r = Math.sqrt(rng.next()) * e.r * 1.05;
    const y = e.y + rng.range(-e.r * 0.3, e.r * 0.45);
    a0.set([e.x + Math.cos(a) * r, y, e.z + Math.sin(a) * r, Math.max(1, y - e.ground)], i * 4);
    a1.set([rng.next(), rng.range(7, 13), rng.next() * 100, rng.range(0.075, 0.11)], i * 4);
  }
  g.setAttribute('aStart', new THREE.InstancedBufferAttribute(a0, 4));
  g.setAttribute('aParam', new THREE.InstancedBufferAttribute(a1, 4));
  g.instanceCount = count;
  const mat = new THREE.ShaderMaterial({
    name: 'petals',
    side: THREE.DoubleSide,
    transparent: false,
    uniforms: {
      uTime: G.uTime,
      uWind: G.uWind,
      uSunDir: G.uSunDir,
      uSunColor: G.uSunColor,
      uSkyAmb: G.uSkyAmb,
      uHazeColor: G.uHazeColor,
      uHazeDensity: G.uHazeDensity,
      uNight: G.uNight,
      uGust: { value: 0 },
    },
    vertexShader: /* glsl */ `
      attribute vec4 aStart;
      attribute vec4 aParam;
      uniform float uTime;
      uniform vec2 uWind;
      uniform float uGust;
      varying vec2 vUv;
      varying float vLight;
      varying float vFade;
      varying vec3 vWorld;
      mat3 rotAxis(vec3 a, float ang) {
        float s = sin(ang), c = cos(ang), oc = 1.0 - c;
        return mat3(oc*a.x*a.x + c, oc*a.x*a.y + a.z*s, oc*a.z*a.x - a.y*s,
                    oc*a.x*a.y - a.z*s, oc*a.y*a.y + c, oc*a.y*a.z + a.x*s,
                    oc*a.z*a.x + a.y*s, oc*a.y*a.z - a.x*s, oc*a.z*a.z + c);
      }
      void main() {
        float period = aParam.y;
        float t = fract(uTime / period + aParam.x);
        float fall = aStart.w;
        float tt = t * period;
        vec3 p = aStart.xyz;
        p.y -= min(t * period * 0.85, fall + 0.3);
        float drift = tt * (0.55 + uGust * 1.4);
        p.xz += uWind * drift + vec2(sin(tt * 1.7 + aParam.z), cos(tt * 1.3 + aParam.z * 1.7)) * 0.45;
        vec3 axis = normalize(vec3(sin(aParam.z), cos(aParam.z * 1.3), sin(aParam.z * 0.7)));
        mat3 R = rotAxis(axis, tt * (2.0 + mod(aParam.z, 3.0)) + aParam.z);
        vec3 local = vec3(position.x * aParam.w, position.y * aParam.w * 0.7, 0.0);
        vec3 wp = p + R * local;
        vec3 n = R * vec3(0.0, 0.0, 1.0);
        vLight = abs(dot(n, normalize(vec3(0.3, 0.8, 0.4))));
        vUv = uv;
        // fade in/out over the cycle and with distance
        float d = length(wp - cameraPosition);
        vFade = smoothstep(0.0, 0.06, t) * (1.0 - smoothstep(0.88, 1.0, t)) * (1.0 - smoothstep(35.0, 70.0, d));
        if (p.y < aStart.y - fall - 0.25) vFade = 0.0;
        vWorld = wp;
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
        if (vFade <= 0.001) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uSunColor;
      uniform vec3 uSkyAmb;
      uniform vec3 uHazeColor;
      uniform float uHazeDensity;
      uniform float uNight;
      varying vec2 vUv;
      varying float vLight;
      varying float vFade;
      varying vec3 vWorld;
      void main() {
        vec2 q = vUv - 0.5;
        // petal shape: ellipse with a notch at the tip
        float e = length(q * vec2(2.0, 1.45));
        float notch = smoothstep(0.08, 0.0, length(q - vec2(0.0, 0.42)));
        if (e > 1.0 || notch > 0.5 || vFade < 0.02) discard;
        vec3 base = mix(vec3(1.0, 0.76, 0.85), vec3(0.95, 0.6, 0.74), smoothstep(0.2, 0.9, e));
        vec3 col = base * (uSkyAmb * 1.1 + uSunColor * (0.55 + 0.6 * vLight));
        float d = length(vWorld - cameraPosition);
        col = mix(col, uHazeColor, 1.0 - exp(-d * uHazeDensity));
        gl_FragColor = vec4(col, 0.0);
      }
    `,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false;
  mesh.name = 'petals';
  mesh.renderOrder = 3;
  return mesh;
}

// ---------------------------------------------------------------------------
// Cats
// ---------------------------------------------------------------------------
const CAT_COATS = [
  { name: 'みけ', body: 0xf6f1e8, patches: [0xe28a3a, 0x2a2624] },
  { name: 'くろ', body: 0x2a2726, patches: [] },
  { name: 'とら', body: 0xe8a050, patches: [0xc0702a] },
  { name: 'しろ', body: 0xf8f6f0, patches: [] },
  { name: 'はい', body: 0x9a9ca4, patches: [0x7a7c84] },
  { name: 'はちわれ', body: 0x2e2b2a, patches: [0xf6f1e8] },
  { name: 'ちゃとら', body: 0xd9883a, patches: [0xf6e8d0] },
];

function buildCat(coat, pose) {
  const body = new MeshBuilder();
  const tail = new MeshBuilder();
  const head = new MeshBuilder();
  const c = coat.body;
  const p1 = coat.patches[0] ?? c;
  const p2 = coat.patches[1] ?? p1;
  const sphere = (b, x, y, z, sx, sy, sz, color) => b.geom(new THREE.SphereGeometry(1, 12, 9), new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion(), V(sx, sy, sz)), color);
  if (pose === 'loaf') {
    sphere(body, 0, 0.13, 0, 0.17, 0.13, 0.25, c);
    sphere(body, 0.06, 0.18, -0.05, 0.1, 0.07, 0.12, p1);
    sphere(body, -0.07, 0.17, 0.09, 0.07, 0.06, 0.08, p2);
    for (const e of [-1, 1]) sphere(body, e * 0.07, 0.04, -0.2, 0.05, 0.04, 0.06, 0xf6f1e8);
  } else {
    sphere(body, 0, 0.17, 0.03, 0.13, 0.17, 0.15, c);
    sphere(body, 0.05, 0.22, 0.08, 0.08, 0.08, 0.08, p1);
    for (const e of [-1, 1]) {
      body.cyl(e * 0.05, 0, -0.09, 0.03, 0.03, 0.18, 6, c);
      sphere(body, e * 0.06, 0.03, 0.12, 0.06, 0.04, 0.07, c);
    }
  }
  // head (separate so it can turn): big and round for an anime look
  sphere(head, 0, 0, 0, 0.14, 0.125, 0.125, c);
  sphere(head, 0.04, 0.05, 0.02, 0.075, 0.06, 0.075, p1);
  sphere(head, 0, -0.035, -0.09, 0.07, 0.045, 0.05, 0xf6f1e8);
  for (const e of [-1, 1]) {
    const g = new THREE.ConeGeometry(0.055, 0.1, 4);
    head.geom(g, new THREE.Matrix4().compose(V(e * 0.075, 0.12, 0.0), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -e * 0.3)), V(1, 1, 0.55)), e > 0 ? p1 : c);
    head.box(e * 0.05, 0.015, -0.118, 0.026, 0.042, 0.012, { color: 0x1a1a1a });
    head.box(e * 0.05 + 0.006, 0.026, -0.124, 0.008, 0.01, 0.004, { color: 0xffffff });
  }
  head.box(0, -0.028, -0.135, 0.024, 0.016, 0.01, { color: 0xe89aa0 });
  // tail
  const pts = [];
  for (let i = 0; i <= 6; i++) pts.push(V(0, 0.05 + Math.sin(i * 0.35) * 0.18, i * 0.05));
  tail.tube(pts, pts.map((_, i) => 0.03 - i * 0.002), 5, p1 === c ? c : p1);
  return { body, tail, head };
}

export function createCats(ctx, materials, count = 7) {
  const rng = new RNG(4545);
  // memorable spots first (platform, shrine steps, park, boats, sea wall, Sakura-zaka), then the rest
  const score = (s) => (['platform', 'steps', 'bench', 'boat'].includes(s.kind) ? 3 : 0) + (s.z > 70 ? 2.5 : 0) + (Math.abs(s.x - 30) < 8 ? 2 : 0) + rng.next();
  const spots = ctx.catSpots.map((s) => ({ s, k: score(s) })).sort((a, b) => b.k - a.k).map((e) => e.s);
  const cats = [];
  const group = new THREE.Group();
  group.name = 'cats';
  for (let i = 0; i < Math.min(count, spots.length); i++) {
    const s = spots[i];
    const coat = CAT_COATS[i % CAT_COATS.length];
    const pose = rng.chance(0.55) ? 'loaf' : 'sit';
    const parts = buildCat(coat, pose);
    const root = new THREE.Group();
    root.scale.setScalar(1.15);
    root.position.set(s.x, s.y ?? terrainH(s.x, s.z), s.z);
    root.rotation.y = s.ry ?? rng.range(0, 6.28);
    const mk = (b) => {
      const m = new THREE.Mesh(b.toGeometry(), materials.toon.material);
      m.castShadow = true;
      m.receiveShadow = true;
      return m;
    };
    const body = mk(parts.body);
    const head = mk(parts.head);
    head.position.set(0, pose === 'loaf' ? 0.27 : 0.4, pose === 'loaf' ? -0.25 : -0.06);
    const tail = mk(parts.tail);
    tail.position.set(0, pose === 'loaf' ? 0.06 : 0.04, pose === 'loaf' ? 0.2 : 0.14);
    root.add(body, head, tail);
    group.add(root);
    const cat = { root, head, tail, body, name: coat.name, x: s.x, z: s.z, phase: rng.range(0, 10), petted: 0, hearts: 0 };
    cats.push(cat);
    ctx.interactables.push({ kind: 'cat', x: s.x, z: s.z, r: 1.7, label: `ねこ（${coat.name}）をなでる`, cat });
    ctx.colliders.addCircle(s.x, s.z, 0.25, (s.y ?? 0) + 0.5);
  }
  ctx.scene.add(group);
  const tmp = new THREE.Vector3();
  const update = (t, dt, player) => {
    for (const c of cats) {
      const near = Math.hypot(player.x - c.x, player.z - c.z);
      c.tail.rotation.y = Math.sin(t * (c.petted > 0 ? 6 : 1.6) + c.phase) * 0.5;
      c.body.scale.y = 1 + Math.sin(t * 2.2 + c.phase) * 0.02;
      // look at the player when close
      if (near < 6) {
        c.root.worldToLocal(tmp.set(player.x, player.y + 1.4, player.z));
        const yaw = Math.atan2(-tmp.x, -tmp.z);
        c.head.rotation.y += (THREE.MathUtils.clamp(yaw, -0.9, 0.9) - c.head.rotation.y) * Math.min(1, dt * 4);
      } else {
        c.head.rotation.y += (Math.sin(t * 0.3 + c.phase) * 0.4 - c.head.rotation.y) * Math.min(1, dt);
      }
      c.head.rotation.x = c.petted > 0 ? Math.sin(t * 10) * 0.08 - 0.15 : 0;
      c.petted = Math.max(0, c.petted - dt);
    }
  };
  return { cats, update, group };
}

// ---------------------------------------------------------------------------
// Birds: kites (トンビ) circling over the beach, gulls skimming the water
// ---------------------------------------------------------------------------
export function createBirds(materials) {
  const group = new THREE.Group();
  group.name = 'birds';
  const rng = new RNG(808);
  const birds = [];
  for (let i = 0; i < 7; i++) {
    const kite = i < 3;
    const b = new MeshBuilder();
    const col = kite ? 0x5a4a40 : 0xf4f4f0;
    const tip = kite ? 0x3a302a : 0x4a4a4e;
    b.geom(new THREE.SphereGeometry(1, 8, 6), new THREE.Matrix4().compose(V(0, 0, 0), new THREE.Quaternion(), V(0.12, 0.1, kite ? 0.38 : 0.32)), col);
    const wingL = new MeshBuilder();
    const span = kite ? 0.85 : 0.7;
    wingL.quad(V(0, 0, -0.1), V(0, 0, 0.18), V(span, 0, 0.05), V(span, 0, -0.18), col, 0, { double: true });
    wingL.quad(V(span, 0, -0.18), V(span, 0, 0.05), V(span * 1.35, 0, 0.0), V(span * 1.35, 0, -0.12), tip, 0, { double: true });
    const body = new THREE.Mesh(b.toGeometry(), materials.toon.material);
    const wg = wingL.toGeometry();
    const wl = new THREE.Mesh(wg, materials.toon.material);
    const wr = new THREE.Mesh(wg, materials.toon.material);
    wr.scale.x = -1;
    const root = new THREE.Group();
    root.add(body, wl, wr);
    const s = kite ? 1.6 : 1.2;
    root.scale.setScalar(s);
    group.add(root);
    birds.push({
      root, wl, wr, kite,
      cx: rng.range(-140, 140), cz: kite ? rng.range(70, 140) : rng.range(95, 200),
      r: kite ? rng.range(18, 40) : rng.range(25, 60), h: kite ? rng.range(26, 45) : rng.range(4, 12),
      speed: kite ? rng.range(0.12, 0.2) : rng.range(0.25, 0.4), phase: rng.range(0, 6.28), flap: rng.range(0, 6),
    });
  }
  group.userData.update = (t) => {
    for (const b of birds) {
      const a = t * b.speed + b.phase;
      const x = b.cx + Math.cos(a) * b.r;
      const z = b.cz + Math.sin(a) * b.r * 0.7;
      const y = b.h + Math.sin(a * 2.3) * (b.kite ? 2 : 1);
      b.root.position.set(x, y, z);
      b.root.rotation.set(0, -a + (b.speed > 0 ? Math.PI : 0), b.kite ? -0.35 : -0.15);
      const f = b.kite ? Math.sin(t * 1.4 + b.flap) * 0.12 + (Math.sin(t * 0.3 + b.flap) > 0.8 ? Math.sin(t * 9) * 0.5 : 0) : Math.sin(t * 5 + b.flap) * 0.6;
      b.wl.rotation.z = f;
      b.wr.rotation.z = -f;
    }
  };
  group.userData.birds = birds;
  return group;
}

// ---------------------------------------------------------------------------
// Sea shells to collect on the beach
// ---------------------------------------------------------------------------
export function createShells(ctx, materials) {
  const group = new THREE.Group();
  const shells = [];
  for (const s of ctx.shells || []) {
    const b = new MeshBuilder();
    const g = new THREE.SphereGeometry(0.11, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    b.geom(g, new THREE.Matrix4().compose(V(0, 0, 0), new THREE.Quaternion(), V(1, 0.55, 1.25)), s.color);
    for (let i = -2; i <= 2; i++) b.box(i * 0.035, 0.035, 0, 0.012, 0.03, 0.22, { color: new THREE.Color(s.color).multiplyScalar(0.85) });
    const m = new THREE.Mesh(b.toGeometry(), materials.toon.material);
    m.position.set(s.x, s.y + 0.02, s.z);
    m.rotation.y = s.x * 3.1;
    m.castShadow = true;
    group.add(m);
    const shell = { mesh: m, x: s.x, z: s.z, taken: false };
    shells.push(shell);
    ctx.interactables.push({ kind: 'shell', x: s.x, z: s.z, r: 1.4, label: '貝がらを拾う', shell });
  }
  group.name = 'shells';
  ctx.scene.add(group);
  return shells;
}

// Barber pole + clock hands (small animated props)
export function createSmallAnimations(ctx, materials) {
  const updaters = [];
  for (const bp of ctx.barberPoles || []) {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = '#fff';
    g.fillRect(0, 0, 64, 64);
    const cols = ['#d2252b', '#ffffff', '#1f4fa8', '#ffffff'];
    for (let i = -4; i < 8; i++) {
      g.fillStyle = cols[((i % 4) + 4) % 4];
      g.beginPath();
      g.moveTo(i * 16, 0);
      g.lineTo(i * 16 + 16, 0);
      g.lineTo(i * 16 + 16 + 32, 64);
      g.lineTo(i * 16 + 32, 64);
      g.fill();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1, 2);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.7, 16), new THREE.MeshBasicMaterial({ map: tex }));
    const [wx, wz] = bp.frame.toW(bp.p.x, bp.p.z);
    m.position.set(wx, bp.p.y + 0.3, wz);
    ctx.scene.add(m);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), materials.emissive.material);
    cap.position.set(wx, bp.p.y + 0.7, wz);
    ctx.scene.add(cap);
    updaters.push((t) => (tex.offset.y = -t * 0.35));
  }
  // clock hands showing game time
  const handMat = new THREE.MeshBasicMaterial({ color: 0x1a1a1a });
  const hands = [];
  for (const cl of ctx.clocks || []) {
    for (const e of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(cl.x, cl.y, cl.z + e * (cl.off ?? 0.1));
      const hh = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.16, 0.01), handMat);
      hh.position.y = 0.07;
      const mm = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.24, 0.01), handMat);
      mm.position.y = 0.11;
      const ph = new THREE.Group();
      ph.add(hh);
      const pm = new THREE.Group();
      pm.add(mm);
      pivot.add(ph, pm);
      pivot.rotation.y = e > 0 ? 0 : Math.PI;
      ctx.scene.add(pivot);
      hands.push({ ph, pm, e });
    }
  }
  return {
    update: (t, hour) => {
      for (const u of updaters) u(t);
      for (const h of hands) {
        const hr = hour % 12;
        h.ph.rotation.z = -(hr / 12) * Math.PI * 2;
        h.pm.rotation.z = -((hour % 1) * Math.PI * 2);
      }
    },
  };
}

export function nearestShoreDistance(x, z) {
  return Math.abs(z - shoreZ(x));
}

// ---------------------------------------------------------------------------
// Traffic on the coastal road (cars appear from one tunnel and leave by the other)
// ---------------------------------------------------------------------------
function miniKit() {
  const mk = () => new MeshBuilder();
  const k = { t: mk(), w: mk(), s: mk(), e: mk(), d: mk() };
  k.t.detail = k.d;
  k.all = [k.t, k.w, k.s, k.e, k.d];
  k.begin = (x, y, z, ry) => k.all.forEach((b) => b.pushTRS(x, y, z, ry));
  k.end = () => k.all.forEach((b) => b.pop());
  return k;
}

export function createTraffic(ctx, materials, count = 5) {
  const rng = new RNG(1717);
  const group = new THREE.Group();
  group.name = 'traffic';
  const cars = [];
  const laneW = COAST.z0 + 1.75; // eastbound keeps left (north lane)
  const laneE = COAST.z1 - 1.75; // westbound (south lane)
  for (let i = 0; i < count; i++) {
    const k = miniKit();
    car(k, 0, 0, 0, 0, rng, i === 2 ? 'truck' : null);
    const root = new THREE.Group();
    const add = (b, m, cast) => {
      if (b.empty) return;
      const mesh = new THREE.Mesh(b.toGeometry(), m);
      mesh.castShadow = cast;
      mesh.receiveShadow = true;
      root.add(mesh);
    };
    add(k.t, materials.toon.material, true);
    add(k.d, materials.toon.material, false);
    add(k.w, materials.window.material, false);
    add(k.e, materials.emissive.material, false);
    const dir = i % 2 === 0 ? 1 : -1;
    const c = { root, dir, x: rng.range(-TUNNEL_X, TUNNEL_X), z: dir > 0 ? laneW : laneE, v: rng.range(8, 11), vMax: rng.range(9, 12), wait: 0 };
    root.position.set(c.x, COAST.y + 0.03, c.z);
    root.rotation.y = dir > 0 ? 0 : Math.PI;
    group.add(root);
    cars.push(c);
  }
  ctx.scene.add(group);
  const update = (dt, player) => {
    for (const c of cars) {
      if (c.wait > 0) {
        c.wait -= dt;
        c.root.visible = false;
        if (c.wait <= 0) {
          c.x = -c.dir * (TUNNEL_X + 8);
          c.v = c.vMax;
        }
        continue;
      }
      // brake for the player or a car ahead in the same lane
      let limit = c.vMax;
      if (player && Math.abs(player.z - c.z) < 2.2) {
        const ahead = (player.x - c.x) * c.dir;
        if (ahead > 0 && ahead < 22) limit = Math.min(limit, Math.max(0, (ahead - 4.5) * 0.9));
      }
      for (const o of cars) {
        if (o === c || o.dir !== c.dir || o.wait > 0) continue;
        const ahead = (o.x - c.x) * c.dir;
        if (ahead > 0 && ahead < 14) limit = Math.min(limit, Math.max(0, (ahead - 6) * 0.8));
      }
      c.v += (limit - c.v) * Math.min(1, dt * (limit < c.v ? 3 : 0.8));
      c.x += c.dir * c.v * dt;
      c.root.visible = true;
      c.root.position.x = c.x;
      if (c.x * c.dir > TUNNEL_X + 10) c.wait = rng.range(4, 18);
    }
  };
  return { cars, update };
}
