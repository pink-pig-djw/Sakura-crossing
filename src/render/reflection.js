import * as THREE from 'three';
import { G } from './materials.js';

// The sea's mirror. What stands on or over the water (her boat and her in it, the pier and its
// lamps, the island, the lighthouses: everything on layer 1) seen from the camera mirrored
// under the surface, at half resolution, into a texture the water shader shows where the sea
// reflects (coast.js createWater). Nothing under the surface is drawn: the camera's near plane
// is tilted to lie on it. The sky is left out (the shader mirrors it itself), so the texture's
// alpha says where something is reflected. Drawn only while the camera is near the sea and
// over it.

const _cp = new THREE.Vector3(), _look = new THREE.Vector3(), _rot = new THREE.Matrix4();
const _plane = new THREE.Plane(), _p = new THREE.Vector3(), _clip = new THREE.Vector4(), _q = new THREE.Vector4();
const UP = new THREE.Vector3(0, 1, 0);
const _clear = new THREE.Color();

export class SeaReflection {
  constructor(scale = 0.5) {
    this.scale = scale;
    this.rt = new THREE.WebGLRenderTarget(16, 16, { type: THREE.HalfFloatType, depthBuffer: true, stencilBuffer: false });
    this.rt.texture.generateMipmaps = false;
    this.rt.texture.minFilter = THREE.LinearFilter;
    this.rt.texture.magFilter = THREE.LinearFilter;
    this.cam = new THREE.PerspectiveCamera();
    this.cam.layers.set(1);
    this.on = true;
    this.fade = 0; // (eased in and out as the camera comes to the sea and goes: never switched)
    G.uReflMap.value = this.rt.texture;
  }

  setSize(w, h) {
    const W = Math.max(16, Math.round(w * this.scale)), H = Math.max(16, Math.round(h * this.scale));
    this.rt.setSize(W, H);
    G.uReflTexel.value.set(1 / W, 1 / H);
  }

  // the sea's surface at y; want: whether a reflection is wanted this frame at all
  render(renderer, scene, camera, y, want = true) {
    const now = performance.now();
    const dt = Math.min(0.1, (now - (this.lastT ?? now)) / 1000);
    this.lastT = now;
    this.fade = want ? Math.min(1, this.fade + dt * 1.25) : Math.max(0, this.fade - dt * 1.25);
    G.uReflOn.value = 0;
    if (!this.on || this.fade <= 0) return;
    camera.updateMatrixWorld();
    const cp = camera.getWorldPosition(_cp);
    if (cp.y < y + 0.05) return;
    // the camera mirrored in the water, looking at the mirror image of what it looks at
    _rot.extractRotation(camera.matrixWorld);
    _look.set(0, 0, -1).applyMatrix4(_rot).add(cp);
    const vc = this.cam;
    vc.position.set(cp.x, 2 * y - cp.y, cp.z);
    vc.up.set(0, 1, 0).applyMatrix4(_rot);
    vc.up.y = -vc.up.y;
    vc.lookAt(_look.x, 2 * y - _look.y, _look.z);
    vc.fov = camera.fov;
    vc.aspect = camera.aspect;
    vc.near = camera.near;
    vc.far = camera.far;
    vc.updateProjectionMatrix();
    vc.updateMatrixWorld();
    // where a point of the sea finds its reflection in the texture
    G.uReflMat.value.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1).multiply(vc.projectionMatrix).multiply(vc.matrixWorldInverse);
    // the near plane laid on the water (http://www.terathon.com/lengyel/Lengyel-Oblique.pdf),
    // for the usual -1..1 depth range: drawn with the reversed depth buffer switched off
    _plane.setFromNormalAndCoplanarPoint(UP, _p.set(0, y, 0)).applyMatrix4(vc.matrixWorldInverse);
    _clip.set(_plane.normal.x, _plane.normal.y, _plane.normal.z, _plane.constant);
    const P = vc.projectionMatrix.elements;
    _q.set((Math.sign(_clip.x) + P[8]) / P[0], (Math.sign(_clip.y) + P[9]) / P[5], -1, (1 + P[10]) / P[14]);
    _clip.multiplyScalar(2 / _clip.dot(_q));
    P[2] = _clip.x;
    P[6] = _clip.y;
    P[10] = _clip.z + 1 - 0.002;
    P[14] = _clip.w;
    vc.projectionMatrixInverse.copy(vc.projectionMatrix).invert();

    const depth = renderer.state.buffers.depth;
    const reversed = depth.getReversed();
    const target = renderer.getRenderTarget(), autoClear = renderer.autoClear, shadows = renderer.shadowMap.autoUpdate;
    const bg = scene.background;
    renderer.getClearColor(_clear);
    const clearA = renderer.getClearAlpha();
    scene.background = null;
    renderer.shadowMap.autoUpdate = false;
    if (reversed) depth.setReversed(false);
    renderer.setRenderTarget(this.rt);
    renderer.setClearColor(0x000000, 0);
    renderer.autoClear = false;
    renderer.clear(true, true, false);
    G.uReflPass.value = 1;
    renderer.render(scene, vc);
    G.uReflPass.value = 0;
    if (reversed) depth.setReversed(true);
    renderer.setRenderTarget(target);
    renderer.setClearColor(_clear, clearA);
    renderer.autoClear = autoClear;
    renderer.shadowMap.autoUpdate = shadows;
    scene.background = bg;
    G.uReflOn.value = this.fade;
  }

  dispose() {
    this.rt.dispose();
  }
}
