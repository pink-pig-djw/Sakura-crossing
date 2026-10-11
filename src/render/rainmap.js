import * as THREE from 'three';
import { G } from './materials.js';
import { BOUNDS } from '../world/layout.js';

// The rain map: the town seen from straight above once, each texel keeping the height of the
// highest surface there (a roof, an eave, a station canopy, a bridge, a tree trunk, the
// ground itself). Rain stops on it: drops below it are not drawn, the splashes land on it,
// surfaces under it stay dry, and she closes her umbrella when something is over her head.
//
// Leaves and grass are left out (rain comes through the trees), and so is everything that
// moves (the train, the bicycle, the people) or floats in the sky.

const Y0 = -60, SPAN = 400; // heights kept: Y0 .. Y0 + SPAN
const W = 2048, H = 1024;
const M = 40; // margin round the town (the beach, the sea's edge)

const LEAVE_OUT = new Set(['sky', 'clouds', 'train', 'lightpools', 'fireflies', 'petals', 'grass', 'foliage', 'pampas', 'bicycleRoot', 'cats', 'birds', 'traffic', 'shells']);

function leftOut(o) {
  for (let p = o; p; p = p.parent) if (LEAVE_OUT.has(p.name)) return true;
  if (o.isSprite || o.isPoints || o.isLine || o.isLineSegments2 || o.isLine2) return true;
  const m = Array.isArray(o.material) ? o.material[0] : o.material;
  if (!m) return true;
  if (/^(foliage|grass|sky|char|falls|unlit)/.test(m.name || '')) return true;
  if (m.isLineMaterial) return true;
  // glows, decals, haze: blended and not in the depth
  if (m.transparent && m.depthWrite === false) return true;
  if (m.blending === THREE.AdditiveBlending) return true;
  return false;
}

export class RainMap {
  constructor() {
    this.x0 = BOUNDS.x0 - M;
    this.x1 = BOUNDS.x1 + M;
    this.z0 = BOUNDS.z0 - M;
    this.z1 = BOUNDS.z1 + M;
    this.heights = null; // Float32Array W * H (row 0 at z1)
    this.texture = null;
  }

  // draw it (once, with the town built)
  build(renderer, scene) {
    const { x0, x1, z0, z1 } = this;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const cam = new THREE.OrthographicCamera(x0 - cx, x1 - cx, cz - z0, -(z1 - cz), 1, SPAN + 20);
    cam.position.set(cx, Y0 + SPAN + 10, cz);
    cam.up.set(0, 0, -1);
    cam.lookAt(cx, 0, cz);
    cam.updateMatrixWorld(true);
    cam.updateProjectionMatrix();
    const rt = new THREE.WebGLRenderTarget(W, H, { depthBuffer: true, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false });
    const mat = new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      vertexShader: /* glsl */ `
        varying float vY;
        void main() {
          vec4 wp = vec4(position, 1.0);
          #ifdef USE_INSTANCING
            wp = instanceMatrix * wp;
          #endif
          wp = modelMatrix * wp;
          vY = wp.y;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vY;
        void main() {
          float v = clamp((vY - ${Y0.toFixed(1)}) / ${SPAN.toFixed(1)}, 0.0, 0.99999) * 255.0;
          float hi = floor(v);
          gl_FragColor = vec4(hi / 255.0, v - hi, 0.0, 1.0);
        }
      `,
    });
    // leave out the leaves, the sky and all that moves
    const hidden = [];
    scene.traverse((o) => {
      if ((o.isMesh || o.isPoints || o.isLine || o.isSprite) && o.visible && leftOut(o)) {
        o.visible = false;
        hidden.push(o);
      }
    });
    const prev = {
      target: renderer.getRenderTarget(),
      override: scene.overrideMaterial,
      auto: renderer.shadowMap.autoUpdate,
      clear: renderer.getClearColor(new THREE.Color()),
      alpha: renderer.getClearAlpha(),
      autoClear: renderer.autoClear,
    };
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = false;
    scene.overrideMaterial = mat;
    renderer.setRenderTarget(rt);
    renderer.setClearColor(0x000000, 0);
    renderer.autoClear = true;
    renderer.clear(true, true, true);
    renderer.render(scene, cam);
    const px = new Uint8Array(W * H * 4);
    renderer.readRenderTargetPixels(rt, 0, 0, W, H, px);
    scene.overrideMaterial = prev.override;
    renderer.setRenderTarget(prev.target);
    renderer.setClearColor(prev.clear, prev.alpha);
    renderer.autoClear = prev.autoClear;
    renderer.shadowMap.autoUpdate = prev.auto;
    for (const o of hidden) o.visible = true;
    mat.dispose();

    const h = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) h[i] = Y0 + ((px[i * 4] + px[i * 4 + 1] / 255) / 255) * SPAN;
    this.heights = h;
    this.texture = rt.texture;
    G.uRainMap.value = rt.texture;
    G.uRainRect.value.set(x0, z1, 1 / (x1 - x0), -1 / (z1 - z0));
    G.uRainRange.value.set(Y0, SPAN);
    this.rt = rt;
    return this;
  }

  // the highest surface over (x, z) (far below anything outside the map)
  top(x, z) {
    if (!this.heights) return -1e4;
    const u = (x - this.x0) / (this.x1 - this.x0), v = (this.z1 - z) / (this.z1 - this.z0);
    if (u <= 0 || v <= 0 || u >= 1 || v >= 1) return -1e4;
    return this.heights[Math.floor(v * H) * W + Math.floor(u * W)];
  }

  // is something over a point at height y (a roof over her head)? within r round it
  covered(x, y, z, r = 0) {
    if (this.top(x, z) > y) return true;
    if (r > 0) {
      let n = 0;
      for (const [dx, dz] of [[r, 0], [-r, 0], [0, r], [0, -r]]) if (this.top(x + dx, z + dz) > y) n++;
      return n >= 3;
    }
    return false;
  }
}
