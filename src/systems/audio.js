// Procedural soundscape (Web Audio): sea, wind, birds, crossing bells, the
// train, footsteps, wind chimes and generative music for the time of day. No samples.

import { MusicDirector } from './music.js';

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
// how far ahead (s) rhythmic sounds are laid out on the audio clock
const LOOK = 0.3;

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.started = false;
    this.ambVol = 0.7;
    this.musicVol = 0.45;
    this.timers = { sparrow: 3, uguisu: 8, tonbi: 14, chime: 5, knock: 2, lark: 6, gull: 4, drip: 1, lap: 1, eave: 1, rfrog: 2 };
    this.wet = 0; // the ground (wet footsteps and tyres)
    this.baked = {}; // short sounds rendered once (bakeSheet)
    // clocks for the sounds laid out ahead (ahead): the night's frogs, the paddies', the
    // train's wheels, the crosswalks' tones
    this.clocks = { frog: {}, pfrog: {}, clack: {}, walk: {} };
  }

  start() {
    if (this.started) {
      this.ctx?.resume?.();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    // more buffer than the lowest-latency default: with the town drawing hard on the same
    // machine, small buffers ran dry now and then (clicks and drop-outs). 80 ms is still
    // well within a footstep
    let ctx;
    try {
      ctx = new AC({ latencyHint: 0.08 });
    } catch {
      ctx = new AC();
    }
    this.ctx = ctx;
    this.started = true;
    // master chain
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 12;
    comp.ratio.value = 4;
    comp.attack.value = 0.005;
    comp.release.value = 0.2;
    this.master.connect(comp).connect(ctx.destination);
    this.amb = ctx.createGain();
    this.amb.gain.value = this.ambVol;
    this.amb.connect(this.master);
    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = 0.8;
    this.sfxBus.connect(this.master);
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = this.musicVol * 0.55;
    this.musicBus.connect(this.master);
    // reverb
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse(2.8, 2.2);
    this.revSend = ctx.createGain();
    this.revSend.gain.value = 0.5;
    this.revSend.connect(this.reverb).connect(this.master);
    // noise buffers
    this.white = this.noiseBuffer('white', 4);
    this.pink = this.noiseBuffer('pink', 6);
    this.brown = this.noiseBuffer('brown', 6);
    this.setupSea();
    this.setupWind();
    this.setupTrain();
    this.setupNight();
    this.setupPlaces();
    this.setupRoute();
    this.setupRain();
    this.crossingVoices = new Map();
    this.walkPans = new Map();
    this.bakeSheet();
    this.music = new MusicDirector(this);
  }

  setVolumes(amb, music) {
    this.ambVol = amb;
    this.musicVol = music;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.amb.gain.setTargetAtTime(amb, t, 0.1);
    this.musicBus.gain.setTargetAtTime(music * 0.55, t, 0.1);
  }

  noiseBuffer(type, seconds) {
    const ctx = this.ctx;
    const n = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
      for (let i = 0; i < n; i++) {
        const w = Math.random() * 2 - 1;
        if (type === 'white') d[i] = w * 0.5;
        else if (type === 'pink') {
          b0 = 0.99886 * b0 + w * 0.0555179;
          b1 = 0.99332 * b1 + w * 0.0750759;
          b2 = 0.969 * b2 + w * 0.153852;
          b3 = 0.8665 * b3 + w * 0.3104856;
          b4 = 0.55 * b4 + w * 0.5329522;
          b5 = -0.7616 * b5 - w * 0.016898;
          d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
          b6 = w * 0.115926;
        } else {
          last = (last + 0.02 * w) / 1.02;
          d[i] = last * 3.5;
        }
      }
    }
    return buf;
  }

  impulse(seconds, decay) {
    const ctx = this.ctx;
    const n = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay) * 0.6;
    }
    return buf;
  }

  loopNoise(buf) {
    const s = this.ctx.createBufferSource();
    s.buffer = buf;
    s.loop = true;
    s.loopStart = Math.random();
    s.start(0, Math.random() * 2);
    return s;
  }

  panner(x, y, z, ref = 6, roll = 1.2) {
    const p = this.ctx.createPanner();
    p.panningModel = 'equalpower';
    p.distanceModel = 'inverse';
    p.refDistance = ref;
    p.maxDistance = 600;
    p.rolloffFactor = roll;
    this.setPos(p, x, y, z);
    return p;
  }

  // a per-frame target: only a value that moved goes onto the param's timeline (a score of
  // params re-aimed sixty times a second kept the audio thread busy for nothing)
  ease(param, v, tc) {
    if (param._to !== undefined && Math.abs(param._to - v) <= Math.abs(v) * 0.01 + 1e-4) return;
    param._to = v;
    param.setTargetAtTime(v, this.ctx.currentTime, tc);
  }

  // ------------------------------------------------------------------ baked sounds
  // The short sounds heard over and over (crossing bells, the wheels' clack, the crosswalks'
  // tones, frogs, footsteps) are rendered once at the start, all in one offline pass (off the
  // main thread), from the same recipes that play them live; then each sounds as one node
  // instead of up to a dozen. Building and tearing down hundreds of nodes a second (the frogs'
  // chorus, every step, the rain's drops) was what made the sound stutter on a busy machine.
  // Until the pass is done the recipes play live.
  bakeSheet() {
    const OC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!OC) return;
    const items = [];
    const add = (name, len, build) => items.push({ name, len, build });
    for (const alt of [0, 1]) add('kan' + alt, 0.5, (d, t) => this.strikeRecipe(d, !!alt, t));
    for (let i = 0; i < 2; i++) add('clack' + i, 0.24, (d, t) => this.clackRecipe(d, t));
    add('piyo', 0.36, (d, t) => this.walkRecipe(d, 'piyo', t));
    add('kakko', 0.72, (d, t) => this.walkRecipe(d, 'kakko', t));
    for (let i = 0; i < 6; i++) {
      const n = Math.floor(rand(3, 8)), f0 = rand(380, 620);
      add('frogA' + i, n * 0.16 + 0.15, (d, t) => this.frogRecipe(d, t, n, f0, 0.16, 0.06));
    }
    for (let i = 0; i < 6; i++) {
      const n = Math.floor(rand(2, 6)), f0 = rand(420, 680), gap = rand(0.13, 0.19);
      add('frogB' + i, n * gap + 0.15, (d, t) => this.frogRecipe(d, t, n, f0, gap, 1));
    }
    for (let i = 0; i < 4; i++) add('stepHard' + i, 0.12, (d, t) => {
      this.noiseHit(d, t, rand(1800, 2600), 1.4, 0.05, 0.06);
      this.noiseHit(d, t, 160, 1, 0.07, 0.08, 'lowpass');
    });
    for (let i = 0; i < 3; i++) add('stepSand' + i, 0.16, (d, t) => this.noiseHit(d, t, rand(620, 780), 0.6, 0.12, 0.09, 'lowpass'));
    for (let i = 0; i < 3; i++) add('stepWater' + i, 0.28, (d, t) => {
      this.noiseHit(d, t, rand(1450, 1750), 0.8, 0.22, 0.1);
      this.tone(d, t + 0.03, rand(500, 800), rand(900, 1300), 0.06, 0.02);
    });
    for (let i = 0; i < 3; i++) add('stepSplash' + i, 0.14, (d, t) => this.noiseHit(d, t + 0.01, rand(2600, 3800), 0.9, 0.09, 0.05));
    const rate = 32000;
    let at = 0;
    for (const it of items) {
      it.at = at;
      at += it.len + 0.05;
    }
    let off;
    try {
      off = new OC(2, Math.ceil(at * rate), rate);
    } catch {
      return;
    }
    const real = this.ctx;
    this.ctx = off;
    try {
      for (const it of items) it.build(off.destination, it.at);
    } finally {
      this.ctx = real;
    }
    off.startRendering().then((sheet) => {
      for (const it of items) this.baked[it.name] = this.slice(sheet, it.at, it.len);
    }, () => {});
  }

  // len seconds of a buffer from at, as a buffer of its own; with loop, the part past the end
  // laid over the start (so it loops without a seam)
  slice(buf, at, len, loop = false) {
    const r = buf.sampleRate, i0 = Math.floor(at * r), n = Math.floor(len * r);
    const out = this.ctx.createBuffer(buf.numberOfChannels, n, r);
    for (let ch = 0; ch < buf.numberOfChannels; ch++) {
      const src = buf.getChannelData(ch), dst = out.getChannelData(ch);
      dst.set(src.subarray(i0, i0 + n));
      if (loop) for (let i = i0 + n, k = 0; i < src.length && k < n; i++, k++) dst[k] += src[i];
    }
    return out;
  }

  // a baked sound: one buffer source into dest at t (with a gain if it is not 1)
  playBaked(b, dest, t, gain = 1, rate = 1) {
    const s = this.ctx.createBufferSource();
    s.buffer = b;
    if (rate !== 1) s.playbackRate.value = rate;
    if (gain !== 1) {
      const g = this.ctx.createGain();
      g.gain.value = gain;
      s.connect(g).connect(dest);
    } else s.connect(dest);
    s.start(t);
    return s;
  }
  // one of a baked sound's takes (name0, name1 ...), or null before the bake is done
  take(name, n) {
    return this.baked[name + Math.floor(Math.random() * n)] ?? null;
  }

  // Rhythmic and dense sounds are laid out on the audio clock a little ahead (LOOK s), so a
  // slow or stalled frame never shows in their rhythm: fire(t) for each time due, gap (s, or a
  // function giving one) apart; after a stall, picked up from now rather than caught up
  ahead(clock, gap, fire, now) {
    if (!(clock.next > now - 0.05)) clock.next = now + 0.03;
    while (clock.next < now + LOOK) {
      fire(clock.next);
      clock.next += typeof gap === 'function' ? gap() : gap;
    }
  }

  setPos(p, x, y, z) {
    if (p.positionX) {
      p.positionX.value = x;
      p.positionY.value = y;
      p.positionZ.value = z;
    } else p.setPosition(x, y, z);
  }

  // ------------------------------------------------------------------ sea
  setupSea() {
    const ctx = this.ctx;
    this.seaPan = this.panner(0, 0, 100, 18, 0.9);
    this.seaPan.connect(this.amb);
    // continuous surf bed
    const bed = this.loopNoise(this.brown);
    const bedF = ctx.createBiquadFilter();
    bedF.type = 'lowpass';
    bedF.frequency.value = 520;
    this.seaBed = ctx.createGain();
    this.seaBed.gain.value = 0.0;
    bed.connect(bedF).connect(this.seaBed).connect(this.seaPan);
    // wash layer that swells per wave
    const wash = this.loopNoise(this.pink);
    this.washF = ctx.createBiquadFilter();
    this.washF.type = 'lowpass';
    this.washF.frequency.value = 900;
    this.washG = ctx.createGain();
    this.washG.gain.value = 0;
    wash.connect(this.washF).connect(this.washG).connect(this.seaPan);
    this.nextWave = 1;
    this.seaLevel = 0;
  }

  waveCrash(level) {
    const t = this.ctx.currentTime;
    const g = this.washG.gain;
    const peak = 0.55 * level;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(peak * 0.4, t + 0.6);
    g.linearRampToValueAtTime(peak, t + 1.1);
    g.exponentialRampToValueAtTime(Math.max(peak * 0.15, 0.0001), t + 4.8);
    const f = this.washF.frequency;
    f.cancelScheduledValues(t);
    f.setValueAtTime(700, t);
    f.linearRampToValueAtTime(2600, t + 1.1);
    f.exponentialRampToValueAtTime(600, t + 4.5);
  }

  // ------------------------------------------------------------------ wind
  setupWind() {
    const ctx = this.ctx;
    const n = this.loopNoise(this.pink);
    this.windF = ctx.createBiquadFilter();
    this.windF.type = 'bandpass';
    this.windF.frequency.value = 500;
    this.windF.Q.value = 0.6;
    this.windG = ctx.createGain();
    this.windG.gain.value = 0.05;
    n.connect(this.windF).connect(this.windG).connect(this.amb);
    this.windT = 0;
  }

  // ------------------------------------------------------------------ night ambience (frogs / insects)
  setupNight() {
    this.nightG = this.ctx.createGain();
    this.nightG.gain.value = 0;
    this.nightG.connect(this.amb);
  }

  frogCall(t = this.ctx.currentTime) {
    const ctx = this.ctx;
    const pan = ctx.createStereoPanner();
    pan.pan.value = rand(-0.9, 0.9);
    pan.connect(this.nightG);
    const b = this.take('frogA', 6);
    if (b) this.playBaked(b, pan, t, 1, rand(0.92, 1.08));
    else this.frogRecipe(pan, t, Math.floor(rand(3, 8)), rand(380, 620), 0.16, 0.06);
  }

  // ケロケロ: n croaks gap apart (a square wave's buzz through a band)
  frogRecipe(dest, t, n, f0, gap, vol) {
    const ctx = this.ctx;
    for (let i = 0; i < n; i++) {
      const o = ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = f0 * rand(0.97, 1.03);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = f0 * 2;
      bp.Q.value = 6;
      const g = ctx.createGain();
      const st = t + i * gap * rand(0.95, 1.05);
      g.gain.setValueAtTime(0, st);
      g.gain.linearRampToValueAtTime(vol, st + 0.01);
      g.gain.exponentialRampToValueAtTime(vol * 0.016, st + 0.085);
      o.connect(bp).connect(g).connect(dest);
      o.start(st);
      o.stop(st + 0.11);
    }
  }

  // ------------------------------------------------------------------ birds
  tone(dest, t, f0, f1, dur, vol, type = 'sine', vib = 0) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(f1, 20), t + dur);
    if (vib) {
      const l = ctx.createOscillator();
      l.frequency.value = vib;
      const lg = ctx.createGain();
      lg.gain.value = f0 * 0.03;
      l.connect(lg).connect(o.frequency);
      l.start(t);
      l.stop(t + dur + 0.05);
    }
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.04, dur * 0.3));
    g.gain.setValueAtTime(vol, t + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  sparrow(x, y, z) {
    const p = this.panner(x, y, z, 8, 1.4);
    p.connect(this.amb);
    const t = this.ctx.currentTime;
    const n = Math.floor(rand(2, 6));
    for (let i = 0; i < n; i++) {
      const st = t + i * rand(0.09, 0.16);
      const f = rand(3600, 5200);
      this.tone(p, st, f, f * rand(0.75, 0.9), rand(0.04, 0.07), 0.05);
    }
  }

  uguisu(x, y, z) {
    // ホーー ホケキョ
    const p = this.panner(x, y, z, 30, 0.8);
    p.connect(this.amb);
    p.connect(this.revSend);
    const t = this.ctx.currentTime;
    this.tone(p, t, 880, 1180, 1.25, 0.07, 'sine', 5);
    this.tone(p, t + 1.55, 1750, 1700, 0.13, 0.08);
    this.tone(p, t + 1.75, 2250, 1950, 0.16, 0.08);
    this.tone(p, t + 1.98, 2600, 1550, 0.42, 0.085, 'sine', 9);
  }

  tonbi(x, y, z) {
    // ピーーヒョロロロ
    const p = this.panner(x, y, z, 40, 0.7);
    p.connect(this.amb);
    p.connect(this.revSend);
    const t = this.ctx.currentTime;
    this.tone(p, t, 2050, 2350, 0.9, 0.045);
    this.tone(p, t + 0.95, 2400, 1500, 1.2, 0.05, 'sine', 12);
  }

  // ------------------------------------------------------------------ wind chime (風鈴)
  furin(x, y, z) {
    const p = this.panner(x, y, z, 5, 1.6);
    p.connect(this.amb);
    p.connect(this.revSend);
    const t = this.ctx.currentTime;
    const base = rand(2100, 2500);
    for (const [k, v, d] of [[1, 0.05, 1.8], [2.76, 0.025, 1.1], [5.4, 0.012, 0.6]]) {
      this.tone(p, t, base * k, base * k * 0.998, d, v);
    }
  }

  // ------------------------------------------------------------------ crossing bell (カンカン)
  crossingStrike(p, alt, t = this.ctx.currentTime) {
    const b = this.baked[alt ? 'kan1' : 'kan0'];
    if (b) this.playBaked(b, p, t);
    else this.strikeRecipe(p, alt, t);
  }

  strikeRecipe(p, alt, t) {
    const f = alt ? 720 : 690;
    for (const [k, v, d] of [[1, 0.12, 0.42], [2.43, 0.06, 0.28], [4.1, 0.025, 0.15]]) this.tone(p, t, f * k, f * k * 0.995, d, v, 'triangle');
    // strike click
    const s = this.ctx.createBufferSource();
    s.buffer = this.white;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.08, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2500;
    s.connect(hp).connect(g).connect(p);
    s.start(t);
    s.stop(t + 0.05);
  }

  // ------------------------------------------------------------------ train
  setupTrain() {
    const ctx = this.ctx;
    this.trainPan = this.panner(0, 4, 56, 14, 1.0);
    this.trainPan.connect(this.amb);
    const rumble = this.loopNoise(this.brown);
    this.trainF = ctx.createBiquadFilter();
    this.trainF.type = 'lowpass';
    this.trainF.frequency.value = 300;
    this.trainG = ctx.createGain();
    this.trainG.gain.value = 0;
    rumble.connect(this.trainF).connect(this.trainG).connect(this.trainPan);
    // motor whine
    this.motor = ctx.createOscillator();
    this.motor.type = 'sawtooth';
    this.motor.frequency.value = 120;
    const mf = ctx.createBiquadFilter();
    mf.type = 'lowpass';
    mf.frequency.value = 900;
    this.motorG = ctx.createGain();
    this.motorG.gain.value = 0;
    this.motor.connect(mf).connect(this.motorG).connect(this.trainPan);
    this.motor.start();
  }

  // the wheels over a rail joint: clack-clack
  clack(t = this.ctx.currentTime) {
    const b = this.take('clack', 2);
    if (b) this.playBaked(b, this.trainPan, t, 1, rand(0.95, 1.05));
    else this.clackRecipe(this.trainPan, t);
  }

  clackRecipe(dest, t) {
    const ctx = this.ctx;
    for (const dt of [0, 0.11]) {
      const s = ctx.createBufferSource();
      s.buffer = this.white;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 900;
      bp.Q.value = 1.2;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t + dt);
      g.gain.exponentialRampToValueAtTime(0.35, t + dt + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.07);
      s.connect(bp).connect(g).connect(dest);
      s.start(t + dt, Math.random());
      s.stop(t + dt + 0.1);
    }
  }

  horn() {
    const p = this.trainPan;
    const t = this.ctx.currentTime;
    this.tone(p, t, 520, 515, 1.2, 0.18, 'sawtooth');
    this.tone(p, t, 655, 650, 1.2, 0.12, 'sawtooth');
  }

  melody(x, y, z) {
    // short departure melody (発車メロディ)
    const p = this.panner(x, y, z, 10, 1.0);
    p.connect(this.amb);
    p.connect(this.revSend);
    const notes = [76, 79, 83, 81, 79, 76, 78, 79, 81, 83, 86, 83];
    const t0 = this.ctx.currentTime;
    notes.forEach((m, i) => {
      const f = 440 * Math.pow(2, (m - 69) / 12);
      const t = t0 + i * 0.22;
      this.tone(p, t, f, f, 0.5, 0.06, 'sine');
      this.tone(p, t, f * 2, f * 2, 0.25, 0.02, 'sine');
    });
  }

  // ------------------------------------------------------------------ one-shot sfx
  noiseHit(dest, t, freq, q, dur, vol, type = 'bandpass') {
    const s = this.ctx.createBufferSource();
    s.buffer = this.white;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(dest);
    s.start(t, Math.random());
    s.stop(t + dur + 0.02);
  }

  // a struck metal partial: instant attack, exponential ring-out
  ping(dest, t, f, dur, vol) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(f, t);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  // ------------------------------------------------------------------ the bicycle
  // tyres on the road (a band of noise rising with the speed), the freewheel's pawls ticking
  // while she coasts, wind past her ears, and the brakes' squeal when she stops hard
  setupBike() {
    const ctx = this.ctx;
    const n = this.loopNoise(this.pink);
    const tf = ctx.createBiquadFilter();
    tf.type = 'bandpass';
    tf.frequency.value = 300;
    tf.Q.value = 0.8;
    const tg = ctx.createGain();
    tg.gain.value = 0;
    n.connect(tf).connect(tg).connect(this.sfxBus);
    const fo = ctx.createOscillator();
    fo.type = 'square';
    fo.frequency.value = 20;
    const ff = ctx.createBiquadFilter();
    ff.type = 'bandpass';
    ff.frequency.value = 3600;
    ff.Q.value = 3;
    const fg = ctx.createGain();
    fg.gain.value = 0;
    fo.connect(ff).connect(fg).connect(this.sfxBus);
    fo.start();
    const wn = this.loopNoise(this.white);
    const wf = ctx.createBiquadFilter();
    wf.type = 'highpass';
    wf.frequency.value = 700;
    const wg = ctx.createGain();
    wg.gain.value = 0;
    wn.connect(wf).connect(wg).connect(this.sfxBus);
    const so = ctx.createOscillator();
    so.type = 'triangle';
    so.frequency.value = 2350;
    const vib = ctx.createOscillator();
    vib.frequency.value = 9;
    const vg = ctx.createGain();
    vg.gain.value = 40;
    vib.connect(vg).connect(so.frequency);
    const sg = ctx.createGain();
    sg.gain.value = 0;
    so.connect(sg).connect(this.sfxBus);
    so.start();
    vib.start();
    this.bk = { tf, tg, fo, fg, wf, wg, sg };
  }

  // s: { on, v (m/s), coast, brake (0..1), surface }
  bike(dt, s) {
    if (!this.ctx) return;
    if (!this.bk) {
      if (!s.on) return;
      this.setupBike();
    }
    const B = this.bk;
    const v = s.on ? Math.abs(s.v) : 0;
    const sand = s.surface === 'sand';
    this.ease(B.tg.gain, Math.min(1, v / 5) * (sand ? 0.09 : 0.07), 0.08);
    this.ease(B.tf.frequency, (sand ? 160 : 220) + v * (sand ? 60 : 110), 0.1);
    // about 24 clicks a turn of the wheel
    this.ease(B.fo.frequency, Math.max(2, (v / (2 * Math.PI * 0.334)) * 24), 0.04);
    this.ease(B.fg.gain, s.coast && v > 0.5 ? 0.006 + Math.min(v, 6) * 0.0012 : 0, 0.05);
    this.ease(B.wg.gain, Math.max(0, v - 2.5) ** 2 * 0.0011, 0.25);
    this.ease(B.sg.gain, s.brake > 0.6 && v > 2.4 ? 0.006 * Math.min(1, (v - 2.4) / 2) : 0, 0.04);
    // the tyres hissing through the wet
    if (this.rainSet) this.ease(this.rainSet.tyreG.gain, sand ? 0 : Math.min(1, v / 6) * 0.07 * this.wet, 0.1);
  }

  // ------------------------------------------------------------------ the boat
  // the outboard: a single cylinder's putter at idle rising to a buzz at full throttle (a
  // sawtooth pulsed at the firing rate, its exhaust's breath and the whine of the gears), the
  // water rushing along the hull and hissing off the bow with the speed, and now and then a
  // wavelet slapping the planks
  setupBoat() {
    const ctx = this.ctx;
    const out = ctx.createGain();
    out.gain.value = 0;
    out.connect(this.sfxBus);
    const eng = ctx.createOscillator();
    eng.type = 'sawtooth';
    eng.frequency.value = 40;
    const ef = ctx.createBiquadFilter();
    ef.type = 'lowpass';
    ef.frequency.value = 420;
    ef.Q.value = 1.2;
    // (each firing a pulse: the oscillator's level beaten by a square wave at the firing rate)
    const pulse = ctx.createGain();
    pulse.gain.value = 0.5;
    const fire = ctx.createOscillator();
    fire.type = 'square';
    fire.frequency.value = 9;
    const fireG = ctx.createGain();
    fireG.gain.value = 0.5;
    fire.connect(fireG).connect(pulse.gain);
    const eg = ctx.createGain();
    eg.gain.value = 0.12;
    eng.connect(ef).connect(pulse).connect(eg).connect(out);
    const ex = this.loopNoise(this.pink);
    const xf = ctx.createBiquadFilter();
    xf.type = 'bandpass';
    xf.frequency.value = 260;
    xf.Q.value = 1.4;
    const xg = ctx.createGain();
    xg.gain.value = 0.05;
    ex.connect(xf).connect(xg).connect(pulse);
    const whine = ctx.createOscillator();
    whine.type = 'triangle';
    whine.frequency.value = 600;
    const wg = ctx.createGain();
    wg.gain.value = 0;
    whine.connect(wg).connect(out);
    eng.start();
    fire.start();
    whine.start();
    // the water: a rush along the hull, the bow's hiss
    const rush = this.loopNoise(this.brown);
    const rf = ctx.createBiquadFilter();
    rf.type = 'lowpass';
    rf.frequency.value = 500;
    const rg = ctx.createGain();
    rg.gain.value = 0;
    rush.connect(rf).connect(rg).connect(this.sfxBus);
    const hiss = this.loopNoise(this.white);
    const hf = ctx.createBiquadFilter();
    hf.type = 'highpass';
    hf.frequency.value = 1800;
    const hg = ctx.createGain();
    hg.gain.value = 0;
    hiss.connect(hf).connect(hg).connect(this.sfxBus);
    this.bt = { out, eng, ef, fire, fireG, eg, whine, wg, rf, rg, hg, slap: 1 };
  }

  // s: { on (her in it, the engine running), rpm (0..1), v (m/s), throttle (-1..1) }
  boat(dt, s) {
    if (!this.ctx) return;
    if (!this.bt) {
      if (!s.on) return;
      this.setupBoat();
    }
    const B = this.bt;
    const r = s.on ? s.rpm : 0;
    this.ease(B.out.gain, s.on ? 1 : 0, s.on ? 0.15 : 0.35);
    // firing 8 times a second at idle, near 45 flat out
    const fire = 8 + r * 37;
    this.ease(B.fire.frequency, fire, 0.12);
    this.ease(B.eng.frequency, fire * 2.1, 0.12);
    this.ease(B.ef.frequency, 300 + r * 1100, 0.15);
    this.ease(B.eg.gain, 0.06 + r * 0.09, 0.15);
    // (at speed the pulses run together into a hum)
    this.ease(B.fireG.gain, 0.5 - r * 0.32, 0.2);
    this.ease(B.whine.frequency, 420 + r * 900, 0.15);
    this.ease(B.wg.gain, r * r * 0.012, 0.2);
    const v = s.v;
    this.ease(B.rg.gain, Math.min(1, v / 6) * 0.14, 0.2);
    this.ease(B.rf.frequency, 300 + v * 120, 0.2);
    this.ease(B.hg.gain, Math.max(0, v - 2.5) * 0.01, 0.2);
    // a wavelet slapping the hull now and then (more often under way)
    B.slap -= dt * (1 + v * 0.4);
    if (s.on && B.slap <= 0) {
      B.slap = rand(0.5, 1.6);
      const t = this.ctx.currentTime;
      this.noiseHit(this.sfxBus, t, rand(260, 420), 1.1, rand(0.08, 0.14), 0.05 + Math.min(v, 5) * 0.012, 'lowpass');
      this.noiseHit(this.sfxBus, t + 0.01, rand(1400, 2200), 1.2, 0.05, 0.015);
    }
  }

  step(surface, running) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const v = running ? 1.25 : 1;
    const r = rand(0.93, 1.07);
    const hard = this.take('stepHard', 4);
    if (hard) {
      if (surface === 'sand') this.playBaked(this.take('stepSand', 3), this.sfxBus, t, v, r);
      else if (surface === 'water') this.playBaked(this.take('stepWater', 3), this.sfxBus, t, v, r);
      else {
        this.playBaked(hard, this.sfxBus, t, v, r);
        if (this.wet > 0.25) this.playBaked(this.take('stepSplash', 3), this.sfxBus, t, v * this.wet, r);
      }
      return;
    }
    if (surface === 'sand') {
      this.noiseHit(this.sfxBus, t, 700, 0.6, 0.12, 0.09 * v, 'lowpass');
    } else if (surface === 'water') {
      this.noiseHit(this.sfxBus, t, 1600, 0.8, 0.22, 0.1 * v);
      this.tone(this.sfxBus, t + 0.03, rand(500, 800), rand(900, 1300), 0.06, 0.02);
    } else {
      this.noiseHit(this.sfxBus, t, rand(1800, 2600), 1.4, 0.05, 0.06 * v);
      this.noiseHit(this.sfxBus, t, 160, 1, 0.07, 0.08 * v, 'lowpass');
      // on a wet street: a splash in each step
      if (this.wet > 0.25) this.noiseHit(this.sfxBus, t + 0.01, rand(2600, 3800), 0.9, 0.09, 0.05 * v * this.wet);
    }
  }

  sfx(name) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const out = this.sfxBus;
    switch (name) {
      case 'vending':
        for (let i = 0; i < 3; i++) this.tone(out, t + i * 0.12, 3200, 3100, 0.08, 0.05);
        this.tone(out, t + 0.45, 1400, 1400, 0.12, 0.05, 'square');
        this.noiseHit(out, t + 0.9, 180, 1, 0.25, 0.4, 'lowpass');
        this.noiseHit(out, t + 0.92, 900, 2, 0.1, 0.1);
        break;
      // the lap timer: a bright double ping to start, a single one at each place, a little
      // rising arpeggio at the line
      case 'lapStart':
        this.ping(out, t, 1320, 0.25, 0.05);
        this.ping(out, t + 0.14, 1760, 0.35, 0.05);
        break;
      case 'lapCp':
        this.ping(out, t, 1568, 0.3, 0.04);
        break;
      case 'lapDone':
        [1047, 1319, 1568, 2093].forEach((f, i) => this.ping(out, t + i * 0.11, f, 0.5, 0.05));
        break;
      case 'clap':
        this.noiseHit(out, t, 1400, 0.9, 0.09, 0.4);
        this.noiseHit(out, t + 0.38, 1300, 0.9, 0.09, 0.4);
        break;
      case 'suzu':
        for (let i = 0; i < 9; i++) {
          const f = rand(3800, 6200);
          this.tone(out, t + i * 0.035 + rand(0, 0.02), f, f, 0.3, 0.02);
        }
        out && this.tone(this.revSend, t, 4400, 4400, 0.4, 0.015);
        break;
      case 'meow': {
        const o = this.ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(520, t);
        o.frequency.linearRampToValueAtTime(820, t + 0.18);
        o.frequency.linearRampToValueAtTime(560, t + 0.55);
        const f1 = this.ctx.createBiquadFilter();
        f1.type = 'bandpass';
        f1.Q.value = 3;
        f1.frequency.setValueAtTime(700, t);
        f1.frequency.linearRampToValueAtTime(1500, t + 0.2);
        f1.frequency.linearRampToValueAtTime(900, t + 0.55);
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.18, t + 0.05);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
        o.connect(f1).connect(g).connect(out);
        o.start(t);
        o.stop(t + 0.65);
        break;
      }
      case 'purr': {
        const s = this.ctx.createBufferSource();
        s.buffer = this.brown;
        const f = this.ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = 220;
        const g = this.ctx.createGain();
        const lfo = this.ctx.createOscillator();
        lfo.frequency.value = 24;
        const lg = this.ctx.createGain();
        lg.gain.value = 0.12;
        lfo.connect(lg).connect(g.gain);
        g.gain.setValueAtTime(0.15, t);
        g.gain.linearRampToValueAtTime(0.0, t + 1.8);
        s.connect(f).connect(g).connect(out);
        s.start(t);
        s.stop(t + 1.9);
        lfo.start(t);
        lfo.stop(t + 1.9);
        break;
      }
      case 'pickup':
        this.tone(out, t, 1320, 1320, 0.25, 0.06);
        this.tone(out, t + 0.1, 1760, 1760, 0.4, 0.06);
        this.tone(this.revSend, t + 0.1, 1760, 1760, 0.4, 0.03);
        break;
      case 'ui':
        this.tone(out, t, 880, 990, 0.08, 0.04);
        break;
      case 'sit':
        this.noiseHit(out, t, 300, 1, 0.15, 0.12, 'lowpass');
        break;
      case 'chime':
        // shop door chime (two soft electronic tones)
        this.tone(out, t, 1318, 1318, 0.55, 0.05);
        this.tone(out, t + 0.32, 1046, 1046, 0.9, 0.05);
        this.tone(this.revSend, t + 0.32, 1046, 1046, 0.9, 0.02);
        break;
      case 'beep':
        this.tone(out, t, 2093, 2093, 0.09, 0.05, 'square');
        break;
      case 'ticket':
        this.noiseHit(out, t, 600, 1.5, 0.5, 0.06);
        this.tone(out, t + 0.6, 1568, 1568, 0.08, 0.04, 'square');
        this.noiseHit(out, t + 0.75, 2400, 2, 0.12, 0.08);
        break;
      case 'register':
        this.tone(out, t, 2637, 2637, 0.07, 0.04, 'square');
        this.noiseHit(out, t + 0.25, 3000, 1.5, 0.35, 0.05);
        break;
      case 'gacha':
        for (let i = 0; i < 6; i++) this.noiseHit(out, t + i * 0.09, rand(2000, 3200), 3, 0.05, 0.12);
        this.noiseHit(out, t + 0.75, 500, 1, 0.12, 0.25, 'lowpass');
        break;
      case 'page':
        this.noiseHit(out, t, 4200, 0.7, 0.18, 0.06);
        break;
      case 'bell': {
        // チリンチリン: a small dome bell struck twice (inharmonic partials), the striker's tick
        const f0 = rand(2280, 2360);
        for (const [dt, a] of [[0, 1], [0.15, 0.85]]) {
          for (const [k, vol, dur] of [[1, 0.06, 1.1], [2.71, 0.028, 0.7], [4.16, 0.014, 0.45], [5.93, 0.008, 0.3]]) this.ping(out, t + dt, f0 * k, dur, vol * a);
          this.ping(this.revSend, t + dt, f0, 0.9, 0.012 * a);
          this.noiseHit(out, t + dt, 6000, 2, 0.02, 0.03 * a);
        }
        break;
      }
      case 'bikeStand':
        // the stand flipped up or kicked down: a light metal clack
        this.noiseHit(out, t, 260, 1, 0.09, 0.16, 'lowpass');
        this.ping(out, t + 0.005, 1850, 0.12, 0.02);
        this.ping(out, t + 0.005, 2960, 0.08, 0.012);
        break;
      case 'bikeShift':
        // the twist shifter's detent and the hub's click
        this.noiseHit(out, t, 3200, 2.5, 0.03, 0.05);
        this.noiseHit(out, t + 0.07, 1500, 2, 0.04, 0.04);
        break;
      case 'bikeBump':
        this.noiseHit(out, t, 140, 1, 0.16, 0.3, 'lowpass');
        this.noiseHit(out, t + 0.01, 900, 1.5, 0.08, 0.08);
        this.ping(out, t + 0.02, 1400, 0.25, 0.015);
        break;
      case 'bikeStroke':
        // the chain over the ring on each stroke, very soft
        this.noiseHit(out, t, rand(2400, 3200), 2, 0.05, 0.012);
        break;
      // the boat: her step down onto the floorboards (a hollow thump, the water sloshing), the
      // outboard's pull cord and its first coughs, the engine cut, a knock on the hull, the
      // mooring line creaking as it takes up
      case 'boatStep':
        this.noiseHit(out, t, 170, 1, 0.13, 0.24, 'lowpass');
        this.noiseHit(out, t + 0.01, 950, 1.4, 0.05, 0.05);
        this.noiseHit(out, t + 0.09, 650, 0.8, 0.3, 0.05, 'lowpass');
        break;
      case 'boatStart': {
        const s = this.ctx.createBufferSource();
        s.buffer = this.pink;
        const f = this.ctx.createBiquadFilter();
        f.type = 'bandpass';
        f.Q.value = 2.5;
        f.frequency.setValueAtTime(400, t);
        f.frequency.exponentialRampToValueAtTime(1500, t + 0.32);
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.12, t + 0.05);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);
        s.connect(f).connect(g).connect(out);
        s.start(t, Math.random() * 2);
        s.stop(t + 0.4);
        for (let i = 0; i < 4; i++) this.noiseHit(out, t + 0.42 + i * 0.11 + rand(0, 0.03), rand(120, 180), 1, 0.08, 0.2 - i * 0.03, 'lowpass');
        break;
      }
      case 'boatStop':
        this.noiseHit(out, t, 140, 1, 0.12, 0.16, 'lowpass');
        this.noiseHit(out, t + 0.16, 110, 1, 0.16, 0.1, 'lowpass');
        break;
      case 'boatBump':
        this.noiseHit(out, t, 120, 1, 0.2, 0.32, 'lowpass');
        this.noiseHit(out, t + 0.015, 700, 1.4, 0.1, 0.07);
        this.tone(out, t + 0.03, 230, 180, 0.25, 0.02, 'triangle');
        break;
      case 'boatRope':
        this.tone(out, t, 520, 760, 0.22, 0.012, 'sawtooth', 6);
        this.noiseHit(out, t + 0.05, 1800, 2, 0.18, 0.03);
        break;
      default:
        break;
    }
  }

  // subway platform: arrival chime, door chimes and a short departure melody (original)
  stationChime(kind, x, y, z) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const p = this.panner(x, y, z, 10, 1.0);
    p.connect(this.amb);
    const send = this.ctx.createGain();
    send.gain.value = 0.6;
    p.connect(send).connect(this.revSend);
    if (kind === 'approach') {
      [784, 988, 1175, 988].forEach((f, i) => this.tone(p, t + i * 0.28, f, f, 0.6, 0.05));
    } else if (kind === 'doorsOpen') {
      for (let k = 0; k < 3; k++) {
        this.tone(p, t + k * 0.62, 1480, 1480, 0.3, 0.04);
        this.tone(p, t + k * 0.62 + 0.24, 1175, 1175, 0.36, 0.04);
      }
    } else if (kind === 'melody') {
      const notes = [76, 79, 83, 88, 86, 83, 85, 88, 81, 85, 88, 93];
      notes.forEach((m, i) => {
        const f = 440 * Math.pow(2, (m - 69) / 12);
        this.tone(p, t + i * 0.2, f, f, 0.32, 0.045);
        this.tone(p, t + i * 0.2, f * 2, f * 2, 0.2, 0.012);
      });
    } else if (kind === 'doorsClose') {
      for (let k = 0; k < 4; k++) this.tone(p, t + k * 0.3, 1760, 1760, 0.14, 0.035, 'square');
    }
  }

  // pedestrian signal guide tones: ピヨピヨ / カッコー (each crosswalk keeps its panner)
  crosswalkTone(kind, c, t = this.ctx.currentTime) {
    if (!this.ctx) return;
    let p = this.walkPans.get(c);
    if (!p) {
      p = this.panner(c.x, 4, c.z, 6, 1.4);
      p.connect(this.amb);
      this.walkPans.set(c, p);
    }
    const b = this.baked[kind];
    if (b) this.playBaked(b, p, t);
    else this.walkRecipe(p, kind, t);
  }

  walkRecipe(p, kind, t) {
    if (kind === 'piyo') {
      this.tone(p, t, 2600, 2200, 0.12, 0.035);
      this.tone(p, t + 0.16, 2600, 2200, 0.12, 0.035);
    } else {
      this.tone(p, t, 1080, 1060, 0.22, 0.04);
      this.tone(p, t + 0.3, 880, 860, 0.36, 0.04);
    }
  }

  setupPlaces() {
    const ctx = this.ctx;
    // flowing river water (moved to the nearest river point every frame)
    this.riverPan = this.panner(182, 3, 0, 8, 1.1);
    this.riverPan.connect(this.amb);
    const rn = this.loopNoise(this.pink);
    const rf = ctx.createBiquadFilter();
    rf.type = 'bandpass';
    rf.frequency.value = 900;
    rf.Q.value = 0.5;
    this.riverG = ctx.createGain();
    this.riverG.gain.value = 0;
    rn.connect(rf).connect(this.riverG).connect(this.riverPan);
    // fountain
    this.fountainPan = this.panner(229, 6, -33, 5, 1.3);
    this.fountainPan.connect(this.amb);
    const fn = this.loopNoise(this.white);
    const ff = ctx.createBiquadFilter();
    ff.type = 'highpass';
    ff.frequency.value = 1400;
    this.fountainG = ctx.createGain();
    this.fountainG.gain.value = 0;
    fn.connect(ff).connect(this.fountainG).connect(this.fountainPan);
    // underground hum (ventilation, distant trains)
    const hn = this.loopNoise(this.brown);
    const hf = ctx.createBiquadFilter();
    hf.type = 'lowpass';
    hf.frequency.value = 180;
    this.humG = ctx.createGain();
    this.humG.gain.value = 0;
    hn.connect(hf).connect(this.humG).connect(this.amb);
    // subway train rumble
    this.subPan = this.panner(252, -3, -14, 12, 1.0);
    this.subPan.connect(this.amb);
    const sn = this.loopNoise(this.brown);
    this.subF = ctx.createBiquadFilter();
    this.subF.type = 'lowpass';
    this.subF.frequency.value = 260;
    this.subG = ctx.createGain();
    this.subG.gain.value = 0;
    sn.connect(this.subF).connect(this.subG).connect(this.subPan);
  }

  // ------------------------------------------------------------------ the cycling loop's places
  setupRoute() {
    const ctx = this.ctx;
    const bed = (buf, type, f, q, pan) => {
      const n = this.loopNoise(buf);
      const fl = ctx.createBiquadFilter();
      fl.type = type;
      fl.frequency.value = f;
      fl.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = 0;
      n.connect(fl).connect(g).connect(pan);
      return g;
    };
    // the gorge's stream over its stones (kept at its nearest point) and the waterfall
    this.streamPan = this.panner(182, 12, -160, 6, 1.1);
    this.streamPan.connect(this.amb);
    this.streamG = bed(this.pink, 'bandpass', 1150, 0.45, this.streamPan);
    this.fallPan = this.panner(184, 20, -196, 10, 1.0);
    this.fallPan.connect(this.amb);
    this.fallPan.connect(this.revSend);
    this.fallG = bed(this.white, 'lowpass', 2100, 0.7, this.fallPan);
    // bamboo leaves hissing overhead
    this.bambooG = bed(this.pink, 'bandpass', 2700, 0.7, this.amb);
    // a wind turbine's slow swish, once a blade
    this.millPan = this.panner(428, 40, -246, 14, 1.0);
    this.millPan.connect(this.amb);
    this.millG = bed(this.pink, 'bandpass', 360, 0.8, this.millPan);
  }

  // カーン: two culms knocking together in the wind
  knock(x, y, z) {
    const p = this.panner(x, y, z, 6, 1.3);
    p.connect(this.amb);
    p.connect(this.revSend);
    const t = this.ctx.currentTime;
    const f = rand(480, 720);
    this.tone(p, t, f, f * 0.96, 0.09, 0.05, 'triangle');
    if (Math.random() < 0.6) this.tone(p, t + rand(0.12, 0.22), f * 0.92, f * 0.88, 0.08, 0.035, 'triangle');
  }

  // a frog in the paddies (ケロケロ), placed
  frogAt(x, y, z, vol, t = this.ctx.currentTime) {
    const p = this.panner(x, y, z, 5, 1.2);
    p.connect(this.amb);
    const b = this.take('frogB', 6);
    if (b) this.playBaked(b, p, t, vol, rand(0.9, 1.1));
    else this.frogRecipe(p, t, Math.floor(rand(2, 6)), rand(420, 680), rand(0.13, 0.19), vol);
  }

  // 雲雀: a skylark's long tumbling song from high over the fields
  hibari(x, y, z) {
    const p = this.panner(x, y, z, 30, 0.8);
    p.connect(this.amb);
    const t = this.ctx.currentTime;
    let at = t;
    const n = Math.floor(rand(18, 34));
    for (let i = 0; i < n; i++) {
      const f = rand(3200, 6400);
      const d = rand(0.03, 0.09);
      this.tone(p, at, f, f * rand(0.85, 1.2), d, 0.022);
      at += d + (Math.random() < 0.15 ? rand(0.08, 0.2) : rand(0.005, 0.03));
    }
  }

  // ウミネコ: a gull's mewing call, twice or three times
  gull(x, y, z) {
    const ctx = this.ctx;
    const p = this.panner(x, y, z, 14, 1.0);
    p.connect(this.amb);
    p.connect(this.revSend);
    const t = ctx.currentTime;
    const n = Math.floor(rand(2, 4));
    for (let i = 0; i < n; i++) {
      const st = t + i * rand(0.45, 0.7);
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      const f = rand(780, 980);
      o.frequency.setValueAtTime(f, st);
      o.frequency.linearRampToValueAtTime(f * 1.45, st + 0.12);
      o.frequency.exponentialRampToValueAtTime(f * 0.85, st + 0.42);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1700;
      bp.Q.value = 1.6;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, st);
      g.gain.exponentialRampToValueAtTime(0.03, st + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, st + 0.45);
      o.connect(bp).connect(g).connect(p);
      o.start(st);
      o.stop(st + 0.5);
    }
  }

  // the sea slapping against the quay
  lap(x, y, z) {
    const ctx = this.ctx;
    const p = this.panner(x, y, z, 4, 1.4);
    p.connect(this.amb);
    const s = ctx.createBufferSource();
    s.buffer = this.pink;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = rand(380, 620);
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(rand(0.12, 0.2), t + 0.06);
    g.gain.exponentialRampToValueAtTime(0.0001, t + rand(0.35, 0.6));
    s.connect(f).connect(g).connect(p);
    s.start(t, rand(0, 4));
    s.stop(t + 0.7);
  }

  // ぴちょん: water dripping from the tunnel's roof, ringing in the bore
  drip(x, y, z) {
    const p = this.panner(x, y, z, 3, 1.2);
    p.connect(this.amb);
    const send = this.ctx.createGain();
    send.gain.value = 2.2;
    p.connect(send).connect(this.revSend);
    const t = this.ctx.currentTime;
    const f = rand(1500, 2800);
    this.tone(p, t, f, f * 0.55, 0.07, 0.04);
  }

  // ------------------------------------------------------------------ rain
  // The rain's hiss over everything (and its low roar when it pours), drops pattering near
  // by, on her vinyl umbrella a quick light drumming close overhead; under a roof the rain
  // outside, a drip from the eaves; indoors it is muffled behind the walls. Thunder rolls far
  // off in a downpour, and the frogs (雨蛙) call in the rain.
  setupRain() {
    const ctx = this.ctx;
    const R = {};
    R.bus = ctx.createGain();
    R.bus.gain.value = 1;
    // muffled indoors: a lowpass on the whole of it
    R.muff = ctx.createBiquadFilter();
    R.muff.type = 'lowpass';
    R.muff.frequency.value = 18000;
    R.bus.connect(R.muff).connect(this.amb);
    const bed = (buf, type, f, q) => {
      const n = this.loopNoise(buf);
      const fl = ctx.createBiquadFilter();
      fl.type = type;
      fl.frequency.value = f;
      fl.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = 0;
      n.connect(fl).connect(g).connect(R.bus);
      return { g, fl };
    };
    R.hiss = bed(this.white, 'bandpass', 5200, 0.35);
    R.wash = bed(this.pink, 'bandpass', 1500, 0.5);
    R.roar = bed(this.brown, 'lowpass', 420, 0.6);
    // drops near by: a few short buffers, played at random rates and pans
    R.drops = [0, 1, 2, 3].map((k) => {
      const n = Math.floor(ctx.sampleRate * 0.05);
      const b = ctx.createBuffer(1, n, ctx.sampleRate);
      const d = b.getChannelData(0);
      const f = 2400 + k * 900;
      for (let i = 0; i < n; i++) {
        const tt = i / ctx.sampleRate;
        d[i] = ((Math.random() * 2 - 1) * 0.6 + Math.sin(tt * f * Math.PI * 2) * 0.5) * Math.exp(-tt * (90 + k * 25));
      }
      return b;
    });
    R.dropBus = ctx.createGain();
    R.dropBus.gain.value = 0;
    R.dropBus.connect(R.bus);
    // the umbrella: taps on the vinyl, right over her
    R.umbBus = ctx.createGain();
    R.umbBus.gain.value = 0;
    const umbF = ctx.createBiquadFilter();
    umbF.type = 'peaking';
    umbF.frequency.value = 1900;
    umbF.gain.value = 6;
    R.umbBus.connect(umbF).connect(this.amb);
    // tyres through the wet
    const tn = this.loopNoise(this.white);
    const tf = ctx.createBiquadFilter();
    tf.type = 'highpass';
    tf.frequency.value = 2400;
    R.tyreG = ctx.createGain();
    R.tyreG.gain.value = 0;
    tn.connect(tf).connect(R.tyreG).connect(this.sfxBus);
    R.dropAcc = 0;
    R.umbAcc = 0;
    R.beds = null;
    this.rainSet = R;
  }

  // The rain's patter as loops, made the first time it rains: drops scattered at random over a
  // few seconds (two layers of different lengths for the ground and two for the umbrella, so
  // together they never come round the same way), rendered offline. Lighter rain plays the
  // sparse layer only; their levels follow how hard it rains. (It was a buffer source, a gain
  // and a panner for every drop, seventy a second.)
  bakeRain() {
    const R = this.rainSet;
    const OC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    R.beds = [];
    if (!OC) return;
    const layers = [
      { bus: R.dropBus, secs: 5.3, per: 9, vol: [0.01, 0.035], rate: [0.55, 1.3], pan: 1, k: 'light' },
      { bus: R.dropBus, secs: 7.1, per: 17, vol: [0.01, 0.035], rate: [0.55, 1.3], pan: 1, k: 'heavy' },
      { bus: R.umbBus, secs: 4.7, per: 14, vol: [0.03, 0.09], rate: [0.35, 0.65], pan: 0.45, k: 'light' },
      { bus: R.umbBus, secs: 6.3, per: 28, vol: [0.03, 0.09], rate: [0.35, 0.65], pan: 0.45, k: 'heavy' },
    ];
    const sr = 24000;
    for (const L of layers) {
      let off;
      try {
        off = new OC(2, Math.ceil((L.secs + 0.3) * sr), sr);
      } catch {
        continue;
      }
      for (let i = 0, n = Math.round(L.secs * L.per); i < n; i++) {
        const s = off.createBufferSource();
        s.buffer = pick(R.drops);
        s.playbackRate.value = rand(L.rate[0], L.rate[1]);
        const g = off.createGain();
        g.gain.value = rand(L.vol[0], L.vol[1]);
        const pn = off.createStereoPanner();
        pn.pan.value = rand(-L.pan, L.pan);
        s.connect(g).connect(pn).connect(off.destination);
        s.start(Math.random() * L.secs);
      }
      off.startRendering().then((buf) => {
        const ctx = this.ctx;
        const src = ctx.createBufferSource();
        src.buffer = this.slice(buf, 0, L.secs, true);
        src.loop = true;
        const g = ctx.createGain();
        g.gain.value = 0;
        src.connect(g).connect(L.bus);
        src.start();
        R.beds.push({ g, k: L.k, umb: L.bus === R.umbBus });
      }, () => {});
    }
  }

  rainDrop(dest, vol, rate, pan) {
    const ctx = this.ctx;
    const s = ctx.createBufferSource();
    s.buffer = pick(this.rainSet.drops);
    s.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.value = vol;
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    s.connect(g).connect(p).connect(dest);
    s.start(ctx.currentTime + Math.random() * 0.02);
  }

  // far off, rolling (k: how near, 0..1)
  thunder(k = 0.6) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + rand(0.2, 1.2);
    const s = ctx.createBufferSource();
    s.buffer = this.brown;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(160 + 260 * k, t);
    f.frequency.exponentialRampToValueAtTime(70, t + 5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16 * k + 0.05, t + 0.35 + (1 - k) * 0.6);
    for (let i = 0; i < 3; i++) g.gain.setTargetAtTime((0.1 * k + 0.03) * rand(0.6, 1), t + 0.8 + i * rand(0.5, 1.1), 0.25);
    g.gain.setTargetAtTime(0.0001, t + 2.6, 1.1);
    s.connect(f).connect(g).connect(this.rainSet ? this.rainSet.bus : this.amb);
    g.connect(this.revSend);
    s.start(t, rand(0, 2));
    s.stop(t + 8);
  }

  // r: { amount 0..1, wet, umbrella (her open umbrella over the listener 0..1), shelter (a roof
  // over the listener), indoor }
  rainUpdate(dt, s) {
    const R = this.rainSet;
    const r = s.rain;
    if (!R || !r) return;
    const a = r.amount;
    this.wet = r.wet;
    const inside = s.indoor || 0;
    const roof = Math.max(r.shelter ? 1 : 0, inside);
    this.ease(R.muff.frequency, inside ? 700 : roof ? 6000 : 18000, 0.3);
    this.ease(R.bus.gain, inside ? 0.45 : 1, 0.3);
    this.ease(R.hiss.g.gain, 0.05 * Math.min(1, a * 1.4), 0.6);
    this.ease(R.wash.g.gain, 0.06 * a * a, 0.8);
    this.ease(R.roar.g.gain, 0.12 * Math.max(0, a - 0.55) * (1 - 0.5 * inside), 1.0);
    this.ease(R.dropBus.gain, roof ? 0.35 : 1, 0.3);
    this.ease(R.umbBus.gain, r.umbrella, 0.15);
    // drops landing round about, and on the umbrella quick light taps, close: the beds once
    // they are made (live drops until then)
    if (a > 0.01 && !R.beds) this.bakeRain();
    if (R.beds && R.beds.length === 4) {
      const light = Math.min(1, a / 0.35), heavy = a < 0.25 ? 0 : Math.min(1, (a - 0.25) / 0.65);
      for (const b of R.beds) this.ease(b.g.gain, b.k === 'light' ? light : heavy * heavy * (3 - 2 * heavy), 0.4);
    } else {
      R.dropAcc += dt * a * 26;
      while (R.dropAcc > 1) {
        R.dropAcc -= 1;
        this.rainDrop(R.dropBus, rand(0.01, 0.035), rand(0.55, 1.3), rand(-1, 1));
      }
      if (r.umbrella > 0.05) {
        R.umbAcc += dt * a * 42;
        while (R.umbAcc > 1) {
          R.umbAcc -= 1;
          this.rainDrop(R.umbBus, rand(0.03, 0.09), rand(0.35, 0.65), rand(-0.45, 0.45));
        }
      } else R.umbAcc = 0;
    }
    // a drip from the eaves when under a roof (out of the rain)
    const T = this.timers;
    if (roof && !inside && a > 0.2 && T.eave <= 0) {
      this.drip(s.x + rand(-2, 2), s.y + rand(0.5, 1.5), s.z + rand(-2, 2));
      T.eave = rand(0.3, 1.2);
    }
    // the tree frogs call when it rains, by day as well
    if (a > 0.25 && !inside && T.rfrog <= 0 && s.inTown !== undefined) {
      const ang = rand(0, Math.PI * 2), d = rand(8, 30);
      this.frogAt(s.x + Math.cos(ang) * d, s.y - 1.5, s.z + Math.sin(ang) * d, 0.035 + 0.02 * a);
      T.rfrog = rand(1.2, 5) / (0.5 + a);
    }
  }

  // ------------------------------------------------------------------ per frame
  update(dt, s) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const L = ctx.listener;
    // listener
    if (L.positionX) {
      L.positionX.value = s.x;
      L.positionY.value = s.y;
      L.positionZ.value = s.z;
      L.forwardX.value = s.fx;
      L.forwardY.value = 0;
      L.forwardZ.value = s.fz;
      L.upX.value = 0;
      L.upY.value = 1;
      L.upZ.value = 0;
    } else {
      L.setPosition(s.x, s.y, s.z);
      L.setOrientation(s.fx, 0, s.fz, 0, 1, 0);
    }
    // sea: nearest shoreline point
    this.setPos(this.seaPan, s.x, 0.5, Math.max(s.shoreZ, s.z + 2));
    const dShore = Math.max(0, s.shoreZ - s.z);
    const near = Math.max(0.05, Math.min(1, 26 / (dShore + 14)));
    const outside = 1 - 0.85 * (s.indoor || 0);
    this.ease(this.seaBed.gain, (0.32 * near + 0.03) * outside, 0.5);
    this.nextWave -= dt;
    if (this.nextWave <= 0) {
      if (outside > 0.5) this.waveCrash(near);
      this.nextWave = rand(5.5, 9.5);
    }
    // wind: stronger on the hill and the beach
    this.windT += dt;
    const wv = 0.035 + 0.03 * Math.sin(this.windT * 0.21) + 0.02 * Math.sin(this.windT * 0.57) + (s.y > 18 ? 0.04 : 0) + (dShore < 30 ? 0.02 : 0) + (s.route && s.route.plateau < 10 ? 0.035 : 0);
    this.ease(this.windG.gain, Math.max(0.005, wv * outside), 0.8);
    this.ease(this.windF.frequency, 420 + 260 * Math.sin(this.windT * 0.13), 1);

    // birds by time of day (they keep under cover while it rains)
    const day = s.night < 0.5 && !s.indoor && !(s.rain && s.rain.amount > 0.15);
    const T = this.timers;
    for (const k in T) T[k] -= dt;
    if (day && T.sparrow <= 0 && s.inTown) {
      this.sparrow(s.x + rand(-20, 20), s.y + rand(3, 8), s.z + rand(-20, 20));
      T.sparrow = rand(3, 9);
    }
    if (day && T.uguisu <= 0) {
      this.uguisu(s.x + rand(-80, 80), s.y + rand(10, 30), Math.min(s.z - rand(40, 120), 0));
      T.uguisu = rand(18, 40);
    }
    if (day && T.tonbi <= 0 && dShore < 120) {
      this.tonbi(s.x + rand(-60, 60), 40, s.shoreZ - rand(-10, 40));
      T.tonbi = rand(25, 55);
    }
    if (T.chime <= 0) {
      if (s.chime) this.furin(s.chime.x, s.chime.y, s.chime.z);
      T.chime = rand(3, 9);
    }
    this.ease(this.nightG.gain, s.night > 0.6 ? 0.9 : 0, 1);
    if (s.night > 0.6) this.ahead(this.clocks.frog, () => rand(0.6, 2.2), (at) => this.frogCall(at), t);
    else this.clocks.frog.next = undefined;

    // crossings
    for (const c of s.crossings || []) {
      let v = this.crossingVoices.get(c);
      if (!v) {
        v = { p: this.panner(c.x, 3, 56, 8, 1.1), t: 0, alt: false };
        v.p.connect(this.amb);
        this.crossingVoices.set(c, v);
      }
      // (the bell's beat laid out on the audio clock: steady whatever the frame rate)
      if (c.active) {
        this.ahead(v, 0.52, (at) => {
          this.crossingStrike(v.p, v.alt, at);
          v.alt = !v.alt;
        }, t);
      } else v.next = undefined;
    }
    // train
    const tr = s.train;
    if (tr) {
      const vis = tr.state !== 'wait';
      const center = tr.head - tr.dir * tr.length * 0.5;
      this.setPos(this.trainPan, center, 4, 56);
      const sp = vis ? tr.v : 0;
      this.ease(this.trainG.gain, vis ? 0.12 + sp * 0.05 : 0, 0.4);
      this.ease(this.trainF.frequency, 160 + sp * 40, 0.4);
      this.ease(this.motorG.gain, vis && sp > 0.2 ? 0.015 + sp * 0.002 : 0, 0.3);
      this.ease(this.motor.frequency, 90 + sp * 38, 0.3);
      if (sp > 1) this.ahead(this.clocks.clack, 18 / sp, (at) => this.clack(at), t);
      else this.clocks.clack.next = undefined;
      for (const e of tr.events.splice(0)) {
        if (e === 'horn') this.horn();
        if (e === 'melody') this.melody(s.station.x, 5, s.station.z);
      }
    }
    // river, fountain, underground hum, subway, crosswalk tones
    if (this.riverG) {
      const rd = s.river ? s.river.d : 999;
      if (s.river) this.setPos(this.riverPan, s.river.x, s.river.y, s.river.z);
      this.ease(this.riverG.gain, rd < 40 ? 0.22 * Math.min(1, 10 / (rd + 4)) * outside + (s.river?.weir ? 0.05 : 0) : 0, 0.6);
      const fd = Math.hypot(s.x - 229.4, s.z + 33);
      this.ease(this.fountainG.gain, fd < 30 && !s.under ? 0.06 : 0, 0.6);
      this.ease(this.humG.gain, s.under ? 0.1 : 0, 0.8);
      const sub = s.subway;
      if (sub) {
        let best = null, bd = 1e9;
        for (const tr of sub.trains) {
          if (tr.state === 'wait') continue;
          const d = Math.abs(tr.z - s.z) + Math.abs(tr.x - s.x);
          if (d < bd) {
            bd = d;
            best = tr;
          }
        }
        if (best) this.setPos(this.subPan, best.x, -3, best.z);
        const audible = s.under || bd < 40;
        this.ease(this.subG.gain, best && audible ? 0.08 + best.v * 0.03 : 0, 0.4);
        this.ease(this.subF.frequency, 140 + (best ? best.v * 30 : 0), 0.4);
        for (const ev of sub.events.splice(0)) {
          if (!s.under) continue;
          if (['approach', 'doorsOpen', 'melody', 'doorsClose'].includes(ev.e)) this.stationChime(ev.e, 252, -2, -14);
        }
      }
      if (s.crosswalks && !s.under) {
        this.ahead(this.clocks.walk, 0.75, (at) => {
          for (const c of s.crosswalks) {
            if (Math.hypot(c.x - s.x, c.z - s.z) > 28 || !c.walk) continue;
            this.crosswalkTone(c.axis === 1 ? 'piyo' : 'kakko', c, at);
          }
        }, t);
      }
    }
    // the cycling loop's places
    const r = s.route;
    if (r && this.streamG) {
      this.setPos(this.streamPan, r.stream.x, r.stream.y, r.stream.z);
      this.ease(this.streamG.gain, r.stream.d < 50 ? 0.2 * Math.min(1, 9 / (r.stream.d + 3)) * outside : 0, 0.6);
      this.ease(this.fallG.gain, r.stream.fall < 110 ? 0.15 * Math.min(1, 18 / (r.stream.fall + 8)) * outside : 0, 0.6);
      this.ease(this.bambooG.gain, 0.06 * r.bamboo * (0.65 + 0.35 * Math.sin(this.windT * 0.73)) * outside, 0.5);
      if (r.bamboo > 0.4 && T.knock <= 0) {
        this.knock(s.x + rand(-12, 12), s.y + rand(2, 6), s.z + rand(-12, 12));
        T.knock = rand(2.5, 8);
      }
      if (r.mill) {
        this.setPos(this.millPan, r.mill.x, r.mill.y, r.mill.z);
        const ph = Math.sin(t * Math.PI * 0.95);
        this.ease(this.millG.gain, r.mill.d < 130 ? (0.03 + 0.09 * ph * ph) * outside : 0, 0.15);
      }
      // the paddies: a frog now and then by day, a chorus by night
      if (r.paddy < 45 && outside > 0.5) {
        this.ahead(this.clocks.pfrog, () => (s.night > 0.6 ? rand(0.12, 0.45) : rand(1.8, 6)), (at) => {
          const a = rand(0, Math.PI * 2), d = rand(6, 26);
          this.frogAt(s.x + Math.cos(a) * d, s.y - 1, s.z + Math.sin(a) * d, s.night > 0.6 ? 0.07 : 0.05, at);
        }, t);
      } else this.clocks.pfrog.next = undefined;
      if (day && r.fields < 40 && T.lark <= 0) {
        this.hibari(s.x + rand(-50, 50), s.y + rand(25, 45), s.z + rand(-50, 50));
        T.lark = rand(8, 20);
      }
      if (day && r.harbor < 80 && T.gull <= 0) {
        this.gull(s.x + rand(-30, 30), s.y + rand(8, 20), s.z + rand(5, 40));
        T.gull = rand(4, 12);
      }
      if (r.harbor < 16 && T.lap <= 0) {
        this.lap(s.x + rand(-6, 6), 1.5, 103.5);
        T.lap = rand(0.7, 2.0);
      }
      if (r.tunnel && T.drip <= 0) {
        this.drip(s.x + rand(-1.5, 1.5), s.y + rand(1.5, 2.5), s.z + rand(-6, 6));
        T.drip = rand(0.6, 2.4);
      }
    }
    this.rainUpdate(dt, s);
    if (this.music) this.music.update(t, s.hour ?? 12);
  }
}
