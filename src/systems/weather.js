import * as THREE from 'three';
import { G } from '../render/materials.js';

// The weather: fine, or rain. Rain comes now and then by itself (the spells counted on the
// town's clock, so with time stopped the weather holds too) or when you call for it (the R
// key, the controller's D-pad down, the menu). A spell gathers its clouds first, a drizzle,
// a steady rain or a downpour falls (and comes and goes a little), then it clears; the
// streets stay wet for a while after, and if the sun is low enough when it clears, a
// rainbow stands opposite it.
//
// It works on the light the time of day has just set (TimeOfDay.after): the sun goes in,
// the sky and the clouds turn grey, the haze thickens with the rain, shadows soften away.

const KEY = 'sakura-weather-auto';

// how heavy a spell falls: drizzle, rain, downpour
const KINDS = [
  { id: 'drizzle', amount: 0.42, p: 0.35 },
  { id: 'rain', amount: 0.72, p: 0.45 },
  { id: 'heavy', amount: 1.0, p: 0.2 },
];

const rand = (a, b) => a + Math.random() * (b - a);
const ease = (cur, goal, rate, dt) => cur + (goal - cur) * Math.min(1, dt * rate);
const _c = new THREE.Color();

// a colour toward an overcast grey of the same brightness (k: how far), times dim
function overcast(col, k, dim = 1, tint = [0.93, 0.97, 1.04]) {
  const l = 0.2126 * col.r + 0.7152 * col.g + 0.0722 * col.b;
  _c.setRGB(l * tint[0], l * tint[1], l * tint[2]);
  col.lerp(_c, k).multiplyScalar(1 + (dim - 1) * k);
  return col;
}

export class Weather {
  constructor() {
    this.auto = true;
    try {
      this.auto = localStorage.getItem(KEY) !== '0';
    } catch {
      /* storage unavailable */
    }
    this.raining = false; // a spell is on
    this.amount = 0; // how hard the spell falls (its kind)
    this.cloud = 0; // overcast 0..1 (leads the rain in, lingers after)
    this.rain = 0; // falling now 0..1
    this.wet = 0; // the ground 0..1 (lags behind, dries slowly)
    this.rainbow = 0;
    this.bowGoal = 0;
    this.bowLeft = 0;
    this.fast = false; // called for: comes and goes quicker
    this.spell = rand(4, 9); // game hours until the first rain (when auto)
    this.wobble = 0;
    this.onChange = null; // (raining, why) => void: 'auto' | 'manual' | 'skip' (asleep)
    this.boltT = rand(20, 60); // a distant rumble now and then in a downpour
    this.onThunder = null;
  }

  setAuto(on) {
    this.auto = !!on;
    try {
      localStorage.setItem(KEY, on ? '1' : '0');
    } catch {
      /* storage unavailable */
    }
  }

  // start (or stop) the rain now
  set(raining, why = 'manual', kind = null) {
    if (raining === this.raining) return;
    this.raining = raining;
    this.fast = why === 'manual';
    if (raining) {
      const k = (kind && KINDS.find((x) => x.id === kind)) || (why === 'manual' ? KINDS[1] : pick());
      this.amount = k.amount;
      this.kind = k.id;
      // a spell of a couple of hours (a downpour passes sooner)
      this.spell = k.id === 'heavy' ? rand(1, 2.2) : rand(1.5, 4.5);
      this.bowGoal = 0;
    } else {
      this.spell = rand(5, 14);
      // a rainbow if it clears with the sun low in the sky (behind you, opposite the bow)
      this.bowLeft = this.wet > 0.3 ? rand(1.2, 2) : 0;
    }
    this.onChange?.(raining, why);
  }

  toggle() {
    this.set(!this.raining, 'manual');
  }

  // hours gone by at once (a night's sleep): the spells that came and went meanwhile, and the
  // sky and the streets as they are by now rather than easing there (onChange hears 'skip')
  skip(hours) {
    let t = 0, turned = -1; // when (hours into the sleep) it last started or stopped
    if (this.auto) {
      while (hours - t > this.spell) {
        t += this.spell;
        this.set(!this.raining, 'skip');
        turned = t;
      }
      this.spell -= hours - t;
    }
    const ago = turned < 0 ? hours : hours - turned;
    // (the overcast lingers about half an hour, the rain soaks the ground in about as long,
    // the streets take about four hours to dry: the rates update() eases at, in game hours)
    if (this.raining) {
      this.cloud = 1;
      this.rain = this.amount;
      this.wet = Math.min(1, (turned < 0 ? this.wet : 0) + ago / 0.6);
    } else {
      this.cloud = (turned < 0 ? this.cloud : 1) * Math.exp(-ago / 0.55);
      if (this.cloud < 0.01) this.cloud = 0;
      this.rain = 0;
      this.wet = Math.max(0, (turned < 0 ? this.wet : 1) - ago / 4.2);
    }
    this.bowLeft = 0;
    this.bowGoal = 0;
    this.rainbow = 0;
  }

  // dt: real seconds; hours: game hours gone by
  update(dt, hours, tod) {
    if (this.auto && hours > 0) {
      this.spell -= hours;
      if (this.spell <= 0) this.set(!this.raining, 'auto');
    }
    // clouds first, then the rain; the rain stops before the clouds go
    const fast = this.fast ? 6 : 1;
    this.cloud = ease(this.cloud, this.raining ? 1 : 0, (this.raining ? 0.045 : 0.03) * fast, dt);
    this.wobble += dt;
    const swell = 0.85 + 0.15 * Math.sin(this.wobble * 0.11) * Math.sin(this.wobble * 0.043 + 1.3);
    const want = this.raining && this.cloud > (this.fast ? 0.3 : 0.45) ? this.amount * swell : 0;
    this.rain = ease(this.rain, want, (want > this.rain ? 0.08 : 0.12) * fast, dt);
    if (this.rain < 0.002 && !this.raining) this.rain = 0;
    // the streets wet through in a minute, and take a few to dry
    if (this.rain > 0.05) this.wet = Math.min(1, this.wet + dt * (0.012 + 0.03 * this.rain) * fast);
    else this.wet = Math.max(0, this.wet - dt * 0.004 * (hours > 0 ? 1 : 0.25));
    // the rainbow: low sun, the rain all but stopped
    const sunUp = tod ? tod.sunDir.y : 0.5;
    const low = THREE.MathUtils.smoothstep(sunUp, 0.03, 0.12) * (1 - THREE.MathUtils.smoothstep(sunUp, 0.55, 0.66));
    if (this.bowLeft > 0 && !this.raining && this.rain < 0.12) {
      this.bowLeft -= hours;
      this.bowGoal = low;
    } else this.bowGoal = 0;
    this.rainbow = ease(this.rainbow, this.bowGoal, 0.08, dt);
    if (this.rainbow < 1e-3 && this.bowGoal === 0) this.rainbow = 0;
    // thunder far off in a downpour
    if (this.rain > 0.85) {
      this.boltT -= dt;
      if (this.boltT <= 0) {
        this.boltT = rand(25, 70);
        this.onThunder?.(rand(0.3, 1));
      }
    }
  }

  // after the time of day has set the light: the overcast and the rain laid over it
  apply(tod) {
    const c = this.cloud, r = this.rain;
    G.uRain.value = r;
    G.uWet.value = this.wet;
    G.uOvercast.value = c;
    G.uRainbow.value = this.rainbow;
    if (c < 1e-4) return;
    const night = G.uNight.value;
    // the sky: grey, a little darker toward the top; the horizon pales into the rain
    overcast(G.uZenith.value, c * 0.9, 0.72 + 0.1 * night);
    overcast(G.uHorizon.value, c * 0.85, 0.82 + 0.08 * night);
    overcast(G.uCloudLit.value, c * 0.92, 0.7);
    overcast(G.uCloudShade.value, c * 0.8, 0.82);
    overcast(G.uHazeColor.value, c * 0.75, 0.88);
    G.uSunGlow.value.multiplyScalar(1 - 0.9 * c);
    // the sun goes in: soft, shadowless light from the whole sky
    G.uSunColor.value.multiplyScalar(1 - 0.86 * c);
    overcast(G.uSkyAmb.value, c * 0.55, 1 + 0.08 * (1 - night) * (1 - r * 0.5));
    overcast(G.uGroundAmb.value, c * 0.5, 1 + 0.04 * (1 - night));
    G.uAmbLit.value += (1 - G.uAmbLit.value) * c;
    G.uSunDisk.value *= 1 - c;
    G.uStars.value *= 1 - c;
    // the sea and the river under a grey sky
    overcast(G.uWaterDeep.value, c * 0.6, 0.85);
    overcast(G.uWaterShallow.value, c * 0.6, 0.8);
    // the rain closes the distance in
    G.uHazeDensity.value *= 1 + 1.4 * c + 3.2 * r;
    // the grading: no warm leak or light shafts, cooler shadows, the lights spread a little
    tod.leak *= 1 - c;
    tod.rays *= 1 - c;
    G.uLightTone.value.multiplyScalar(1 - 0.8 * c);
    G.uShadowTone.value.lerp(_c.setRGB(0.0, 0.01, 0.035), c);
    overcast(G.uCornerTint.value, c * 0.4, 1);
    G.uDiffuse.value += 0.08 * c;
    tod.exposure *= 1 + 0.05 * c;
    tod.bloom *= 1 + 0.15 * c;
  }

  // for the HUD and the menu
  get label() {
    return this.raining ? '雨' : '晴れ';
  }
}

function pick() {
  let u = Math.random();
  for (const k of KINDS) {
    if ((u -= k.p) <= 0) return k;
  }
  return KINDS[1];
}
