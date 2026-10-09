// Procedural soundscape (Web Audio): sea, wind, birds, crossing bells, the
// train, footsteps, wind chimes and a gentle generative piano. No samples.

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.started = false;
    this.ambVol = 0.7;
    this.musicVol = 0.45;
    this.timers = { sparrow: 3, uguisu: 8, tonbi: 14, chime: 5, frog: 2 };
  }

  start() {
    if (this.started) {
      this.ctx?.resume?.();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
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
    this.crossingVoices = new Map();
    this.music = new PianoMusic(this);
    this.music.start();
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

  frogCall() {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const pan = ctx.createStereoPanner();
    pan.pan.value = rand(-0.9, 0.9);
    pan.connect(this.nightG);
    const n = Math.floor(rand(3, 8));
    const f0 = rand(380, 620);
    for (let i = 0; i < n; i++) {
      const o = ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = f0 * rand(0.97, 1.03);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = f0 * 2;
      bp.Q.value = 6;
      const g = ctx.createGain();
      const st = t + i * 0.16;
      g.gain.setValueAtTime(0, st);
      g.gain.linearRampToValueAtTime(0.06, st + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, st + 0.09);
      o.connect(bp).connect(g).connect(pan);
      o.start(st);
      o.stop(st + 0.12);
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
  crossingStrike(p, alt) {
    const t = this.ctx.currentTime;
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
    this.clackT = 0;
  }

  clack() {
    const ctx = this.ctx;
    const t = ctx.currentTime;
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
      s.connect(bp).connect(g).connect(this.trainPan);
      s.start(t + dt);
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

  step(surface, running) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const v = running ? 1.25 : 1;
    if (surface === 'sand') {
      this.noiseHit(this.sfxBus, t, 700, 0.6, 0.12, 0.09 * v, 'lowpass');
    } else if (surface === 'water') {
      this.noiseHit(this.sfxBus, t, 1600, 0.8, 0.22, 0.1 * v);
      this.tone(this.sfxBus, t + 0.03, rand(500, 800), rand(900, 1300), 0.06, 0.02);
    } else {
      this.noiseHit(this.sfxBus, t, rand(1800, 2600), 1.4, 0.05, 0.06 * v);
      this.noiseHit(this.sfxBus, t, 160, 1, 0.07, 0.08 * v, 'lowpass');
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

  // pedestrian signal guide tones: ピヨピヨ / カッコー
  crosswalkTone(kind, x, y, z) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const p = this.panner(x, y, z, 6, 1.4);
    p.connect(this.amb);
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
    this.walkT = 0;
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
    this.seaBed.gain.setTargetAtTime((0.32 * near + 0.03) * outside, t, 0.5);
    this.nextWave -= dt;
    if (this.nextWave <= 0) {
      if (outside > 0.5) this.waveCrash(near);
      this.nextWave = rand(5.5, 9.5);
    }
    // wind: stronger on the hill and the beach
    this.windT += dt;
    const wv = 0.035 + 0.03 * Math.sin(this.windT * 0.21) + 0.02 * Math.sin(this.windT * 0.57) + (s.y > 18 ? 0.04 : 0) + (dShore < 30 ? 0.02 : 0);
    this.windG.gain.setTargetAtTime(Math.max(0.005, wv * outside), t, 0.8);
    this.windF.frequency.setTargetAtTime(420 + 260 * Math.sin(this.windT * 0.13), t, 1);

    // birds by time of day
    const day = s.night < 0.5 && !s.indoor;
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
    this.nightG.gain.setTargetAtTime(s.night > 0.6 ? 0.9 : 0, t, 1);
    if (s.night > 0.6 && T.frog <= 0) {
      this.frogCall();
      T.frog = rand(0.6, 2.2);
    }

    // crossings
    for (const c of s.crossings || []) {
      let v = this.crossingVoices.get(c);
      if (!v) {
        v = { p: this.panner(c.x, 3, 56, 8, 1.1), t: 0, alt: false };
        v.p.connect(this.amb);
        this.crossingVoices.set(c, v);
      }
      if (c.active) {
        v.t -= dt;
        if (v.t <= 0) {
          this.crossingStrike(v.p, v.alt);
          v.alt = !v.alt;
          v.t = 0.52;
        }
      } else v.t = 0;
    }
    // train
    const tr = s.train;
    if (tr) {
      const vis = tr.state !== 'wait';
      const center = tr.head - tr.dir * tr.length * 0.5;
      this.setPos(this.trainPan, center, 4, 56);
      const sp = vis ? tr.v : 0;
      this.trainG.gain.setTargetAtTime(vis ? 0.12 + sp * 0.05 : 0, t, 0.4);
      this.trainF.frequency.setTargetAtTime(160 + sp * 40, t, 0.4);
      this.motorG.gain.setTargetAtTime(vis && sp > 0.2 ? 0.015 + sp * 0.002 : 0, t, 0.3);
      this.motor.frequency.setTargetAtTime(90 + sp * 38, t, 0.3);
      if (sp > 1) {
        this.clackT -= dt;
        if (this.clackT <= 0) {
          this.clack();
          this.clackT = 18 / sp;
        }
      }
      for (const e of tr.events.splice(0)) {
        if (e === 'horn') this.horn();
        if (e === 'melody') this.melody(s.station.x, 5, s.station.z);
      }
    }
    // river, fountain, underground hum, subway, crosswalk tones
    if (this.riverG) {
      const rd = s.river ? s.river.d : 999;
      if (s.river) this.setPos(this.riverPan, s.river.x, s.river.y, s.river.z);
      this.riverG.gain.setTargetAtTime(rd < 40 ? 0.22 * Math.min(1, 10 / (rd + 4)) * outside + (s.river?.weir ? 0.05 : 0) : 0, t, 0.6);
      const fd = Math.hypot(s.x - 229.4, s.z + 33);
      this.fountainG.gain.setTargetAtTime(fd < 30 && !s.under ? 0.06 : 0, t, 0.6);
      this.humG.gain.setTargetAtTime(s.under ? 0.1 : 0, t, 0.8);
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
        this.subG.gain.setTargetAtTime(best && audible ? 0.08 + best.v * 0.03 : 0, t, 0.4);
        this.subF.frequency.setTargetAtTime(140 + (best ? best.v * 30 : 0), t, 0.4);
        for (const ev of sub.events.splice(0)) {
          if (!s.under) continue;
          if (['approach', 'doorsOpen', 'melody', 'doorsClose'].includes(ev.e)) this.stationChime(ev.e, 252, -2, -14);
        }
      }
      if (s.crosswalks && !s.under) {
        this.walkT -= dt;
        if (this.walkT <= 0) {
          this.walkT = 0.75;
          for (const c of s.crosswalks) {
            if (Math.hypot(c.x - s.x, c.z - s.z) > 28 || !c.walk) continue;
            this.crosswalkTone(c.axis === 1 ? 'piyo' : 'kakko', c.x, 4, c.z);
          }
        }
      }
    }
    if (this.music) this.music.update(t);
  }
}

// ---------------------------------------------------------------------------
// Generative piano: IV - V - iii - vi (王道進行) in D major, slow and airy
// ---------------------------------------------------------------------------
class PianoMusic {
  constructor(engine) {
    this.e = engine;
    this.bpm = 68;
    this.beat = 60 / this.bpm;
    this.next = 0;
    this.step = 0;
    // MIDI chord tones
    this.chords = [
      { bass: 43, tones: [55, 59, 62, 66, 69] }, // Gmaj7(9)
      { bass: 45, tones: [57, 61, 64, 66, 71] }, // A6(9)
      { bass: 42, tones: [54, 57, 61, 64, 68] }, // F#m7(11)
      { bass: 47, tones: [54, 59, 62, 66, 69] }, // Bm7(9)
    ];
    this.scale = [62, 64, 66, 69, 71, 74, 76, 78, 81];
  }

  start() {
    this.next = this.e.ctx.currentTime + 1.5;
  }

  note(t, midi, vel, dur = 3.5) {
    const ctx = this.e.ctx;
    const f = 440 * Math.pow(2, (midi - 69) / 12);
    const out = ctx.createGain();
    out.gain.value = 1;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1800 + vel * 2000;
    out.connect(lp);
    lp.connect(this.e.musicBus);
    const send = ctx.createGain();
    send.gain.value = 0.55;
    lp.connect(send).connect(this.e.revSend);
    for (const [k, a, d] of [[1, 1, 1], [2, 0.32, 0.55], [3, 0.12, 0.35], [4.01, 0.05, 0.22]]) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f * k;
      o.detune.value = (Math.random() - 0.5) * 6;
      const g = ctx.createGain();
      const peak = 0.05 * vel * a;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + 0.008);
      g.gain.exponentialRampToValueAtTime(peak * 0.35, t + 0.4 * d);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur * d);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + dur * d + 0.05);
    }
  }

  update(now) {
    if (this.e.musicVol <= 0.001) {
      this.next = Math.max(this.next, now + 0.5);
      return;
    }
    // schedule a little ahead
    while (this.next < now + 0.6) {
      const bar = Math.floor(this.step / 8);
      const chord = this.chords[Math.floor(bar / 2) % 4];
      const sub = this.step % 8; // eighth notes in a bar
      const t = this.next;
      if (sub === 0 && bar % 2 === 0) this.note(t, chord.bass, 0.75, 6);
      if (sub === 0 && bar % 2 === 1) this.note(t, chord.bass + 12, 0.5, 4);
      // broken chord, gently varied
      if ([0, 2, 3, 5, 6].includes(sub) && Math.random() < 0.85) {
        const idx = [0, 2, 1, 3, 4][[0, 2, 3, 5, 6].indexOf(sub)];
        this.note(t + rand(0, 0.015), chord.tones[idx] + 12, rand(0.35, 0.55), 3.2);
      }
      // sparse melody on top
      if ((sub === 1 || sub === 4 || sub === 7) && Math.random() < 0.28) {
        const m = pick(this.scale) + 12;
        this.note(t + rand(0, 0.02), m, rand(0.4, 0.6), 2.6);
      }
      this.step++;
      this.next += this.beat / 2;
    }
  }
}
