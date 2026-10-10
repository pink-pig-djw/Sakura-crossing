import * as THREE from 'three';
import { G } from '../render/materials.js';

// Keyframed lighting for the whole day. Colors marked (srgb) are authored as
// hex and converted; light multipliers are given directly in linear units.

const K = [
  // hour, zenith, horizon, sun(linear mult), skyAmb, groundAmb, haze, glow, cloudLit, cloudShade, waterDeep, waterShallow, night, exposure, bloom
  { h: 0.0, zen: '#081230', hor: '#1d2b52', sun: [0.10, 0.12, 0.2], amb: [0.12, 0.145, 0.27], gnd: [0.08, 0.08, 0.13], haze: '#1c2a50', glow: [0.02, 0.03, 0.06], cl: '#36457a', cs: '#151c3a', wd: '#071630', ws: '#16345a', night: 1, exp: 1.25, bloom: 0.9 },
  { h: 4.6, zen: '#121c45', hor: '#3d4778', sun: [0.08, 0.09, 0.16], amb: [0.2, 0.22, 0.38], gnd: [0.12, 0.12, 0.18], haze: '#3a4472', glow: [0.06, 0.04, 0.08], cl: '#5a5f92', cs: '#222a52', wd: '#0b1c3a', ws: '#1e3e66', night: 0.9, exp: 1.2, bloom: 0.85 },
  { h: 5.5, zen: '#3b5aa6', hor: '#f4a989', sun: [0.55, 0.32, 0.2], amb: [0.36, 0.36, 0.6], gnd: [0.3, 0.24, 0.28], haze: '#d99a8c', glow: [0.7, 0.35, 0.18], cl: '#ffc4a8', cs: '#8a7db0', wd: '#173a66', ws: '#3c6f8c', night: 0.35, exp: 1.08, bloom: 0.9 },
  { h: 6.8, zen: '#3876d8', hor: '#c9e2f2', sun: [0.64, 0.54, 0.4], amb: [0.38, 0.42, 0.66], gnd: [0.36, 0.33, 0.35], haze: '#bcd7ec', glow: [0.45, 0.32, 0.18], cl: '#fff8ee', cs: '#a9b2d8', wd: '#0a3a8a', ws: '#1aa0b0', night: 0, exp: 1.0, bloom: 0.75 },
  { h: 10.0, zen: '#2a6ae0', hor: '#cbe7fa', sun: [0.64, 0.58, 0.44], amb: [0.37, 0.42, 0.66], gnd: [0.38, 0.36, 0.37], haze: '#c2e0f5', glow: [0.32, 0.27, 0.18], cl: '#ffffff', cs: '#acb8e0', wd: '#0a3f98', ws: '#18aab4', night: 0, exp: 1.0, bloom: 0.7 },
  { h: 14.0, zen: '#2c6cde', hor: '#d0e8f8', sun: [0.64, 0.57, 0.43], amb: [0.37, 0.42, 0.66], gnd: [0.39, 0.36, 0.36], haze: '#c8e2f4', glow: [0.34, 0.28, 0.18], cl: '#ffffff', cs: '#aeb8de', wd: '#0a3f98', ws: '#18aab4', night: 0, exp: 1.0, bloom: 0.7 },
  { h: 16.3, zen: '#3f72cf', hor: '#f3dcc0', sun: [0.7, 0.53, 0.35], amb: [0.38, 0.39, 0.64], gnd: [0.4, 0.33, 0.32], haze: '#e8d6c4', glow: [0.55, 0.36, 0.16], cl: '#fff1d8', cs: '#a9a6cf', wd: '#14427e', ws: '#3a9aa0', night: 0, exp: 1.0, bloom: 0.8 },
  { h: 17.5, zen: '#465fae', hor: '#ffb27e', sun: [0.78, 0.45, 0.24], amb: [0.36, 0.34, 0.6], gnd: [0.38, 0.28, 0.29], haze: '#f0a888', glow: [0.85, 0.42, 0.16], cl: '#ffcf9e', cs: '#9583b4', wd: '#24406e', ws: '#5a8590', night: 0.1, exp: 1.02, bloom: 0.95 },
  { h: 18.25, zen: '#2c3a80', hor: '#ff8e6e', sun: [0.55, 0.24, 0.18], amb: [0.36, 0.32, 0.6], gnd: [0.32, 0.22, 0.28], haze: '#d8808a', glow: [0.95, 0.38, 0.22], cl: '#ff9f8c', cs: '#6b5590', wd: '#1d2f5e', ws: '#5a6488', night: 0.45, exp: 1.06, bloom: 1.05 },
  { h: 19.0, zen: '#1a2458', hor: '#8a6a9a', sun: [0.12, 0.1, 0.2], amb: [0.26, 0.25, 0.46], gnd: [0.18, 0.15, 0.22], haze: '#5e5486', glow: [0.3, 0.14, 0.2], cl: '#9a7aa8', cs: '#3a3468', wd: '#121e44', ws: '#2c3a68', night: 0.85, exp: 1.12, bloom: 1.0 },
  { h: 20.0, zen: '#0c1638', hor: '#26345e', sun: [0.1, 0.12, 0.2], amb: [0.13, 0.155, 0.29], gnd: [0.08, 0.08, 0.13], haze: '#223058', glow: [0.03, 0.03, 0.06], cl: '#3c4a7c', cs: '#161e40', wd: '#081834', ws: '#16345a', night: 1, exp: 1.22, bloom: 0.9 },
  { h: 24.0, zen: '#081230', hor: '#1d2b52', sun: [0.10, 0.12, 0.2], amb: [0.12, 0.145, 0.27], gnd: [0.08, 0.08, 0.13], haze: '#1c2a50', glow: [0.02, 0.03, 0.06], cl: '#36457a', cs: '#151c3a', wd: '#071630', ws: '#16345a', night: 1, exp: 1.25, bloom: 0.9 },
];

// The painted light and the compositing through the day: st = tint of the shaded side,
// al = how much of the sky fill reaches sunlit faces (less keeps them warm), ct = the cool
// shade in corners and recesses, dif = diffusion glow, top = deepening toward the top of the
// frame, sht / lt = split toning of shadows / light (sRGB offsets), leak = warm light leak
// from the sun's side of the frame, rays = light shafts through gaps toward the sun.
const GRADE = [
  { h: 0.0, st: [0.98, 0.98, 1.04], al: 1.0, ct: [0.72, 0.74, 0.86], dif: 0.36, top: [0.86, 0.87, 0.96], sht: [0.0, 0.006, 0.03], lt: [0.012, 0.006, -0.01], leak: 0, rays: 0 },
  { h: 4.8, st: [0.98, 0.98, 1.04], al: 1.0, ct: [0.72, 0.74, 0.86], dif: 0.36, top: [0.86, 0.87, 0.96], sht: [0.0, 0.006, 0.03], lt: [0.012, 0.006, -0.01], leak: 0, rays: 0 },
  { h: 5.8, st: [1.0, 0.96, 1.04], al: 0.9, ct: [0.68, 0.64, 0.78], dif: 0.34, top: [0.9, 0.86, 0.97], sht: [0.015, 0.0, 0.035], lt: [0.04, 0.02, -0.02], leak: 0.3, rays: 0.55 },
  { h: 7.6, st: [0.99, 0.99, 1.03], al: 0.85, ct: [0.64, 0.67, 0.8], dif: 0.24, top: [0.88, 0.92, 1.0], sht: [0.004, 0.002, 0.03], lt: [0.022, 0.012, -0.015], leak: 0.16, rays: 0.3 },
  { h: 15.6, st: [0.99, 0.99, 1.03], al: 0.85, ct: [0.64, 0.67, 0.8], dif: 0.24, top: [0.88, 0.92, 1.0], sht: [0.004, 0.002, 0.03], lt: [0.022, 0.012, -0.015], leak: 0.16, rays: 0.3 },
  { h: 17.3, st: [1.0, 0.96, 1.03], al: 0.82, ct: [0.68, 0.63, 0.76], dif: 0.32, top: [0.9, 0.87, 0.97], sht: [0.015, 0.0, 0.035], lt: [0.045, 0.02, -0.03], leak: 0.32, rays: 0.6 },
  { h: 18.3, st: [1.0, 0.95, 1.04], al: 0.86, ct: [0.68, 0.61, 0.76], dif: 0.36, top: [0.86, 0.84, 0.96], sht: [0.02, 0.0, 0.04], lt: [0.05, 0.02, -0.03], leak: 0.34, rays: 0.65 },
  { h: 19.3, st: [0.97, 0.96, 1.06], al: 0.95, ct: [0.7, 0.7, 0.84], dif: 0.38, top: [0.84, 0.85, 0.96], sht: [0.01, 0.004, 0.045], lt: [0.02, 0.01, -0.01], leak: 0, rays: 0 },
  { h: 20.2, st: [0.98, 0.98, 1.04], al: 1.0, ct: [0.72, 0.74, 0.86], dif: 0.36, top: [0.86, 0.87, 0.96], sht: [0.0, 0.006, 0.03], lt: [0.012, 0.006, -0.01], leak: 0, rays: 0 },
  { h: 24.0, st: [0.98, 0.98, 1.04], al: 1.0, ct: [0.72, 0.74, 0.86], dif: 0.36, top: [0.86, 0.87, 0.96], sht: [0.0, 0.006, 0.03], lt: [0.012, 0.006, -0.01], leak: 0, rays: 0 },
];

const SUNRISE = 5.25;
const SUNSET = 18.35;

function prep(k) {
  const c = (hex) => new THREE.Color(hex);
  const v = (a) => new THREE.Color(a[0], a[1], a[2]);
  return {
    h: k.h,
    zen: c(k.zen),
    hor: c(k.hor),
    sun: v(k.sun),
    amb: v(k.amb),
    gnd: v(k.gnd),
    haze: c(k.haze),
    glow: v(k.glow),
    cl: c(k.cl),
    cs: c(k.cs),
    wd: c(k.wd),
    ws: c(k.ws),
    night: k.night,
    exp: k.exp,
    bloom: k.bloom,
  };
}

const KEYS = K.map(prep);

export const PRESETS = [
  { id: 'morning', label: '朝', hour: 7.2 },
  { id: 'day', label: '昼', hour: 11.5 },
  { id: 'evening', label: '夕', hour: 17.55 },
  { id: 'night', label: '夜', hour: 20.6 },
];

export class TimeOfDay {
  constructor(sunLight) {
    this.hour = 10.5;
    this.speed = 1 / 60; // game hours per real second (1 hour per minute)
    this.flowing = true;
    this.sun = sunLight;
    this.exposure = 1;
    this.bloom = 0.7;
    this.lightIntensity = 1;
    this.leak = 0;
    this.rays = 0;
    this.sunDir = new THREE.Vector3();
    this.moonDir = new THREE.Vector3();
    this.isNight = false;
    this._tmp = new THREE.Color();
    this.apply();
  }

  setHour(h) {
    this.hour = ((h % 24) + 24) % 24;
    this.apply();
  }

  update(dt) {
    if (this.flowing) {
      this.hour = (this.hour + dt * this.speed) % 24;
    }
    this.apply();
  }

  // Sun path: rises in the east (+X), passes south (+Z) at ~56° and sets west-south-west over the sea.
  static sunDirection(hour, out) {
    const th = ((hour - SUNRISE) / (SUNSET - SUNRISE)) * Math.PI;
    out.set(Math.cos(th), Math.sin(th) * 0.85, 0.3 + Math.sin(th) * 0.28);
    return out.normalize();
  }

  static moonDirection(hour, out) {
    let hh = hour < 12 ? hour + 24 : hour;
    const th = ((hh - 17.5) / (30.5 - 17.5)) * Math.PI;
    out.set(Math.cos(th) * 0.9, Math.max(Math.sin(th), -0.3) * 0.75 + 0.05, 0.45);
    return out.normalize();
  }

  apply() {
    const h = this.hour;
    let i = 0;
    while (i < KEYS.length - 2 && KEYS[i + 1].h <= h) i++;
    const a = KEYS[i];
    const b = KEYS[i + 1];
    let t = (h - a.h) / (b.h - a.h);
    t = t * t * (3 - 2 * t);
    const L = (key, target) => target.copy(a[key]).lerp(b[key], t);
    L('zen', G.uZenith.value);
    L('hor', G.uHorizon.value);
    L('amb', G.uSkyAmb.value);
    L('gnd', G.uGroundAmb.value);
    L('haze', G.uHazeColor.value);
    L('glow', G.uSunGlow.value);
    L('cl', G.uCloudLit.value);
    L('cs', G.uCloudShade.value);
    L('wd', G.uWaterDeep.value);
    L('ws', G.uWaterShallow.value);
    const sunCol = L('sun', this._tmp);
    G.uNight.value = a.night + (b.night - a.night) * t;
    G.uStars.value = THREE.MathUtils.smoothstep(G.uNight.value, 0.5, 1.0);
    this.exposure = a.exp + (b.exp - a.exp) * t;
    this.bloom = a.bloom + (b.bloom - a.bloom) * t;

    this.applyGrade(h);

    TimeOfDay.sunDirection(h, this.sunDir);
    TimeOfDay.moonDirection(h, this.moonDir);
    G.uMoonDir.value.copy(this.moonDir);

    // Light source: sun while it is up, otherwise the moon.
    const sunUp = this.sunDir.y;
    const dayK = THREE.MathUtils.smoothstep(sunUp, -0.02, 0.06);
    this.isNight = dayK < 0.5;
    const lightDir = G.uSunDir.value;
    if (dayK > 0.001) {
      lightDir.copy(this.sunDir);
      lightDir.y = Math.max(lightDir.y, 0.04);
      lightDir.normalize();
    } else {
      lightDir.copy(this.moonDir);
      lightDir.y = Math.max(lightDir.y, 0.15);
      lightDir.normalize();
    }
    // fade direct light around the swap so shadows never pop
    const swapFade = dayK > 0.001 ? THREE.MathUtils.smoothstep(sunUp, -0.02, 0.08) : THREE.MathUtils.smoothstep(-sunUp, 0.02, 0.12);
    G.uSunColor.value.copy(sunCol).multiplyScalar(Math.max(swapFade, 0.0));
    G.uSunDisk.value = THREE.MathUtils.smoothstep(sunUp, -0.03, 0.0);
    // haze density: a touch thicker at dawn / dusk (enough to lay the town out in planes
    // of distance, the far ones paler and bluer)
    G.uHazeDensity.value = 0.00104 + 0.00052 * (1 - Math.abs(Math.sin(((h - 6) / 24) * Math.PI * 2)));

    if (this.sun) {
      this.sun.position.copy(lightDir).multiplyScalar(100);
      this.sun.updateMatrixWorld();
      this.sun.intensity = 1;
    }
  }

  applyGrade(h) {
    let i = 0;
    while (i < GRADE.length - 2 && GRADE[i + 1].h <= h) i++;
    const a = GRADE[i];
    const b = GRADE[i + 1];
    let t = Math.min(1, Math.max(0, (h - a.h) / (b.h - a.h)));
    t = t * t * (3 - 2 * t);
    const mix = (x, y) => x + (y - x) * t;
    const col = (key, target) => target.setRGB(mix(a[key][0], b[key][0]), mix(a[key][1], b[key][1]), mix(a[key][2], b[key][2]));
    col('st', G.uShadowTint.value);
    col('ct', G.uCornerTint.value);
    col('top', G.uTopTint.value);
    col('sht', G.uShadowTone.value);
    col('lt', G.uLightTone.value);
    G.uAmbLit.value = mix(a.al, b.al);
    G.uDiffuse.value = mix(a.dif, b.dif);
    this.leak = mix(a.leak, b.leak);
    this.rays = mix(a.rays, b.rays);
  }

  get label() {
    const hh = Math.floor(this.hour);
    const mm = Math.floor((this.hour - hh) * 60);
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }

  get period() {
    const h = this.hour;
    if (h >= 4.5 && h < 9.5) return { id: 'morning', label: '朝' };
    if (h >= 9.5 && h < 16.0) return { id: 'day', label: '昼' };
    if (h >= 16.0 && h < 19.0) return { id: 'evening', label: '夕方' };
    return { id: 'night', label: '夜' };
  }
}
