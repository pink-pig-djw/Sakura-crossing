// Background music: a generative piece for each part of the day, played by a handful of
// synthesized instruments (no samples) and crossfading as the hours turn.
//
//   day   (朝・昼)  the town's piano: 王道進行 in D major, broken chords, a sparse tune
//   dusk  (夕方)    夕凪: an electric piano, strings and a round bass in F, and in some phrases
//                   a soft pipe singing a tune made up as it goes (the borrowed iv, B♭m6, for
//                   the ache of the sun going down)
//   night (夜)      夜の海: a dark pad swelling and fading in D♭, a music box like stars coming
//                   out over the water, echoing, a soft low piano answering, now and then a
//                   few notes of a tune; whole phrases with nothing but the pad
//
// Each piece plays eight-bar phrases. At the start of a phrase it picks a progression, a
// texture (which instruments, how busy) and, for the tunes, a melody built from a motif and
// its variations, never quite the same as before; so it seldom plays the same thing twice.
// Notes are laid out on the audio clock a couple of seconds ahead (a stalled frame never
// reaches them), and each is two oscillators at most.

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const chance = (p) => Math.random() < p;
function weighted(list) {
  let total = 0;
  for (const [, w] of list) total += w;
  let r = Math.random() * total;
  for (const [v, w] of list) {
    r -= w;
    if (r <= 0) return v;
  }
  return list[list.length - 1][0];
}

// ---------------------------------------------------------------------------- harmony
const PC = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
const QUAL = {
  '': [0, 4, 7],
  m: [0, 3, 7],
  6: [0, 4, 7, 9],
  69: [0, 4, 7, 9, 14],
  m6: [0, 3, 7, 9],
  maj7: [0, 4, 7, 11],
  maj9: [0, 4, 7, 11, 14],
  'maj9#11': [0, 4, 7, 11, 14, 18],
  m7: [0, 3, 7, 10],
  m9: [0, 3, 7, 10, 14],
  7: [0, 4, 7, 10],
  '7sus4': [0, 5, 7, 10],
  '13sus4': [0, 5, 7, 10, 14, 21],
  add9: [0, 4, 7, 14],
};
// 'Bbmaj7', 'C7sus4', 'F/A' -> { root, iv (intervals over it), bass (pitch class) }
function chord(sym) {
  const [main, slash] = sym.split('/');
  const m = /^([A-G](?:b|#)?)(.*)$/.exec(main);
  const root = PC[m[1]];
  return { sym, root, iv: QUAL[m[2]], bass: slash ? PC[slash] : root };
}
// a progression: eight bars, each one chord or two (half a bar each)
const prog = (bars) => bars.map((b) => (Array.isArray(b) ? b : [b]).map(chord));
// the chord sounding at a point in a bar (0..1)
const chordIn = (bar, f) => bar[Math.min(bar.length - 1, Math.floor(f * bar.length))];
// its pitch classes in the order a few voices should have them: third and seventh (or sixth)
// first, then the colour (9th, #11, 13th), the fifth, the root last
function tonesByWeight(ch) {
  const rank = (i) => {
    const k = i % 12;
    if (k === 3 || k === 4 || k === 5 || (k === 2 && i < 12)) return 0;
    if (k === 10 || k === 11 || k === 9) return 1;
    if (i > 12) return 2;
    if (k === 7) return 3;
    return 4;
  };
  return [...ch.iv].sort((a, b) => rank(a) - rank(b)).map((i) => (ch.root + i) % 12);
}
// n of its tones placed close round the last voicing's middle (so the voices move as little
// as they can from chord to chord), within lo..hi, no two a semitone apart
function voicing(ch, n, lo, hi, prev) {
  const mid = (lo + hi) / 2;
  const centre = prev && prev.length ? 0.65 * (prev.reduce((a, b) => a + b, 0) / prev.length) + 0.35 * mid : mid;
  const pcs = [...new Set(tonesByWeight(ch))].slice(0, n);
  let notes = pcs.map((pc) => {
    let m = pc + 12 * Math.round((centre - pc) / 12);
    while (m < lo) m += 12;
    while (m > hi) m -= 12;
    return m;
  });
  notes.sort((a, b) => a - b);
  for (let i = 1; i < notes.length; i++) {
    if (notes[i] - notes[i - 1] < 2) {
      if (notes[i] + 12 <= hi) notes[i] += 12;
      else notes[i] = null;
      notes = notes.filter((v) => v !== null).sort((a, b) => a - b);
      i = 0;
    }
  }
  return notes;
}
// the notes of a chord or a scale (pitch classes) between lo and hi
function inRange(pcs, lo, hi) {
  const out = [];
  for (let m = lo; m <= hi; m++) if (pcs.includes(((m % 12) + 12) % 12)) out.push(m);
  return out;
}
const chordPcs = (ch) => ch.iv.map((i) => (ch.root + i) % 12);

// ---------------------------------------------------------------------------- the instruments
const WAVES = new WeakMap();
function waves(ctx) {
  let w = WAVES.get(ctx);
  if (w) return w;
  const make = (amps) => {
    const re = new Float32Array(amps.length), im = new Float32Array(amps.length);
    amps.forEach((a, i) => (im[i] = a));
    return ctx.createPeriodicWave(re, im);
  };
  w = {
    // a hammered string's overtones over its fundamental (the piano's bright attack)
    bright: make([0, 0, 1, 0.42, 0.24, 0.13, 0.07, 0.04, 0.02]),
    // an electric piano's: the second partial and a glint up at the tine's
    ep: make([0, 0, 1, 0.18, 0.08, 0, 0.12, 0.22, 0.05]),
    // a soft pipe: the fundamental and a breath of the next two
    pipe: make([0, 1, 0.2, 0.08, 0.025]),
    // the strings' and the pad's warm, band-limited saw
    warm: make([0, 1, 0.5, 0.33, 0.24, 0.17, 0.12, 0.08, 0.05, 0.03, 0.02]),
    // the bass: round, with a little body
    bass: make([0, 1, 0.28, 0.07]),
  };
  WAVES.set(ctx, w);
  return w;
}

// A piece's band, on its own output: each instrument a bus (with what is shared on it: the
// strings' filter, the electric piano's slow auto-pan, the music box's echo) going to the
// piece's output and the town's reverb.
class Band {
  constructor(e, out, o = {}) {
    const ctx = (this.ctx = e.ctx);
    this.w = waves(ctx);
    const bus = (gain, rev, pan = 0) => {
      const g = ctx.createGain();
      g.gain.value = gain;
      let tail = g;
      if (pan) {
        const p = ctx.createStereoPanner();
        p.pan.value = pan;
        g.connect(p);
        tail = p;
      }
      tail.connect(out);
      const s = ctx.createGain();
      s.gain.value = rev;
      tail.connect(s).connect(e.revSend);
      return g;
    };
    this.keysBus = bus(1, o.keysRev ?? 0.55);
    if (o.autoPan) {
      // (the electric piano wanders gently from side to side)
      const p = ctx.createStereoPanner();
      const lfo = ctx.createOscillator();
      lfo.frequency.value = o.autoPan;
      const depth = ctx.createGain();
      depth.gain.value = 0.35;
      lfo.connect(depth).connect(p.pan);
      lfo.start();
      this.epBus = ctx.createGain();
      this.epBus.connect(p).connect(this.keysBus);
    } else this.epBus = this.keysBus;
    this.pipeBus = bus(1, 0.6, 0.12);
    this.bassBus = bus(1, 0.12);
    // the strings: the two sides' voices a little apart, through one soft filter
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = o.padCut ?? 1400;
    lp.Q.value = 0.5;
    const padOut = bus(1, o.padRev ?? 0.7);
    lp.connect(padOut);
    this.padL = ctx.createStereoPanner();
    this.padL.pan.value = -0.55;
    this.padR = ctx.createStereoPanner();
    this.padR.pan.value = 0.55;
    this.padL.connect(lp);
    this.padR.connect(lp);
    // the music box, echoing from side to side
    this.boxBus = bus(1, 0.75);
    if (o.echo) {
      const dl = ctx.createDelay(2), dr = ctx.createDelay(2);
      dl.delayTime.value = o.echo[0];
      dr.delayTime.value = o.echo[1];
      const fb = ctx.createGain();
      fb.gain.value = 0.38;
      const damp = ctx.createBiquadFilter();
      damp.type = 'lowpass';
      damp.frequency.value = 2600;
      const pl = ctx.createStereoPanner(), pr = ctx.createStereoPanner();
      pl.pan.value = -0.8;
      pr.pan.value = 0.8;
      const send = ctx.createGain();
      send.gain.value = 0.32;
      this.boxBus.connect(send).connect(dl);
      dl.connect(pl).connect(out);
      dl.connect(dr);
      dr.connect(pr).connect(out);
      dr.connect(damp).connect(fb).connect(dl);
    }
  }

  // a struck note: the fundamental's long ring and the overtones' quick fade (brighter the
  // harder it is struck, and the lower the note)
  keys(t, midi, vel, dur, wave = 'bright', bus = this.keysBus) {
    const ctx = this.ctx, f = mtof(midi);
    const o1 = ctx.createOscillator(), g1 = ctx.createGain();
    o1.frequency.value = f;
    o1.detune.value = rand(-3, 3);
    const p1 = 0.055 * vel;
    g1.gain.setValueAtTime(0.0001, t);
    g1.gain.exponentialRampToValueAtTime(p1, t + 0.007);
    g1.gain.exponentialRampToValueAtTime(p1 * 0.38, t + Math.min(dur * 0.4, 1.3));
    g1.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o1.connect(g1).connect(bus);
    o1.start(t);
    o1.stop(t + dur + 0.05);
    const o2 = ctx.createOscillator(), g2 = ctx.createGain();
    o2.setPeriodicWave(this.w[wave]);
    o2.frequency.value = f;
    o2.detune.value = rand(-4, 4);
    const p2 = 0.03 * vel * (0.45 + vel);
    const d2 = Math.min(dur, (wave === 'ep' ? 0.5 : 0.35) + Math.max(0, (84 - midi) / 36) * 0.9);
    g2.gain.setValueAtTime(0.0001, t);
    g2.gain.exponentialRampToValueAtTime(p2, t + 0.004);
    g2.gain.exponentialRampToValueAtTime(0.0001, t + d2);
    o2.connect(g2).connect(bus);
    o2.start(t);
    o2.stop(t + d2 + 0.05);
  }

  // a breathed note: a soft scoop up to the pitch, swelling, and on a long note a vibrato
  // coming in late
  pipe(t, midi, vel, dur) {
    const ctx = this.ctx, f = mtof(midi);
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.setPeriodicWave(this.w.pipe);
    o.frequency.setValueAtTime(f * 0.988, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.1);
    let stop = t + dur + 0.7;
    if (dur > 0.9) {
      const lfo = ctx.createOscillator(), depth = ctx.createGain();
      lfo.frequency.value = rand(4.6, 5.4);
      depth.gain.setValueAtTime(0, t);
      depth.gain.linearRampToValueAtTime(0, t + 0.35);
      depth.gain.linearRampToValueAtTime(9, t + 0.9);
      lfo.connect(depth).connect(o.detune);
      lfo.start(t);
      lfo.stop(stop);
    }
    const pk = 0.06 * vel;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(pk, t + 0.08);
    g.gain.setTargetAtTime(pk * 0.78, t + 0.12, 0.5);
    g.gain.setTargetAtTime(0.0001, t + Math.max(0.15, dur - 0.04), 0.13);
    o.connect(g).connect(this.pipeBus);
    o.start(t);
    o.stop(stop);
  }

  // a held chord: each note a pair of slightly detuned voices, one either side, swelling in
  // and dying away slowly
  pad(t, midis, dur, vel = 1, att = 1.6, rel = 2.4) {
    const ctx = this.ctx;
    const level = (0.016 * vel) / Math.sqrt(Math.max(1, midis.length));
    const sides = [];
    for (const [side, cents] of [[this.padL, -7], [this.padR, 7]]) {
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(level, t + att);
      g.gain.setValueAtTime(level, t + Math.max(att, dur));
      g.gain.setTargetAtTime(0.0001, t + Math.max(att, dur), rel / 3);
      g.connect(side);
      sides.push([g, cents]);
    }
    for (const m of midis) {
      for (const [g, cents] of sides) {
        const o = ctx.createOscillator();
        o.setPeriodicWave(this.w.warm);
        o.frequency.value = mtof(m);
        o.detune.value = cents + rand(-2, 2);
        o.connect(g);
        o.start(t);
        o.stop(t + Math.max(att, dur) + rel * 1.6);
      }
    }
  }

  bass(t, midi, vel, dur) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.setPeriodicWave(this.w.bass);
    o.frequency.value = mtof(midi);
    const pk = 0.075 * vel;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(pk, t + 0.03);
    g.gain.exponentialRampToValueAtTime(pk * 0.55, t + Math.min(0.6, dur * 0.5));
    g.gain.setTargetAtTime(0.0001, t + dur, 0.15);
    o.connect(g).connect(this.bassBus);
    o.start(t);
    o.stop(t + dur + 0.8);
  }

  // a music box's tine (a celesta's bar): the note and its bright inharmonic partial, the
  // partial gone in a moment
  box(t, midi, vel, dur = 2.6) {
    const ctx = this.ctx, f = mtof(midi);
    for (const [k, a, d] of [[1, 1, dur], [2.76, 0.32, dur * 0.22]]) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = f * k;
      const pk = 0.04 * vel * a;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(pk, t + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g).connect(this.boxBus);
      o.start(t);
      o.stop(t + d + 0.05);
    }
  }
}

// ---------------------------------------------------------------------------- melodies
// Rhythms for two bars in eighths (16 a cell); negative: a rest that long
const CELLS = [
  [3, 1, 2, 2, 4, 4],
  [2, 2, 2, 2, 6, 2],
  [4, 2, 2, 8],
  [1, 1, 2, 4, 2, 2, 4],
  [2, 1, 1, 4, 4, 4],
  [6, 2, 4, 4],
  [-2, 2, 2, 2, 8],
  [2, 2, 4, -2, 2, 4],
  [-1, 1, 2, 2, 2, 8],
  [3, 3, 2, 8],
];
const CADENCES = [
  [2, 2, 4, 8],
  [4, 4, 8],
  [3, 1, 4, 8],
  [-2, 2, 2, 2, 8],
];

// A tune over an eight-bar phrase: a motif (bars 1-2), the motif again fitted to the next
// chords (3-4), a contrasting cell rising to the phrase's peak (5-6), and a cadence falling to
// a chord tone (7-8). Notes on the beat are chord tones, between beats the scale's; steps
// rather than leaps, a leap turned back by a step. Returns [{ step (eighths from the phrase's
// start), midi, len (eighths) }]
function makeTune(bars, scale, lo, hi, opts = {}) {
  const out = [];
  const motif = pick(CELLS);
  const answer = chance(0.7) ? motif : pick(CELLS);
  const rise = pick(CELLS.filter((c) => c !== motif));
  const close = pick(CADENCES);
  const cells = [motif, answer, rise, close];
  // the phrase's arc: the register each cell aims at
  const span = hi - lo;
  const aim = [lo + span * rand(0.3, 0.5), lo + span * rand(0.35, 0.55), lo + span * rand(0.65, 0.9), lo + span * rand(0.2, 0.4)];
  let prev = Math.round(lo + span * rand(0.35, 0.55));
  let lastLeap = 0;
  const motifPitches = [];
  cells.forEach((cell, ci) => {
    let pos = 0;
    cell.forEach((len, ni) => {
      const at = ci * 16 + pos;
      pos += Math.abs(len);
      if (len < 0) return;
      const barI = Math.floor(at / 8);
      const ch = chordIn(bars[barI], (at % 8) / 8);
      const strong = at % 2 === 0;
      const last = ci === 3 && ni === cell.length - 1;
      const pcs = chordPcs(ch);
      // (between beats the scale's notes too, but none a semitone against the chord)
      const passing = scale.filter((pc) => pcs.includes(pc) || !pcs.some((c) => (pc - c + 12) % 12 === 1 || (c - pc + 12) % 12 === 1));
      let cands = inRange(strong || last ? pcs : [...new Set([...passing, ...pcs])], lo, hi);
      if (last) {
        // (the cadence settles on the chord's root, third or fifth)
        const rest = [ch.root, (ch.root + ch.iv[1]) % 12, (ch.root + 7) % 12];
        cands = inRange(rest, lo, hi);
      }
      // the answer echoes the motif's shape: the same move from its last note
      let want = aim[ci];
      if (ci === 1 && cell === motif && motifPitches[ni] !== undefined && ni > 0) want = prev + (motifPitches[ni] - motifPitches[ni - 1]);
      let best = cands[0], bw = -Infinity;
      for (const c of cands) {
        const d = c - prev;
        let w = -Math.abs(c - want) * 0.18 - Math.abs(d) * 0.35;
        if (Math.abs(d) <= 2 && d !== 0) w += 1.1;
        if (d === 0) w -= 0.7;
        if (Math.abs(d) > 7) w -= 2.5;
        // after a leap, a step back the other way
        if (lastLeap && Math.sign(d) === Math.sign(lastLeap)) w -= 1.2;
        w += Math.random() * 0.9;
        if (w > bw) {
          bw = w;
          best = c;
        }
      }
      lastLeap = Math.abs(best - prev) > 4 ? best - prev : 0;
      prev = best;
      if (ci === 0) motifPitches[ni] = best;
      out.push({ step: at, midi: best, len });
    });
  });
  if (opts.octave) for (const n of out) n.midi += opts.octave;
  return out;
}

// ---------------------------------------------------------------------------- a piece
// The phrase machine every piece shares: steps on a grid (eighths or sixteenths), a phrase
// planned when one begins, faded in and out by the director
class Piece {
  constructor(e, bpm, stepsPerBeat, level = 1) {
    this.e = e;
    this.level = level; // (the pieces evened out to about the same loudness)
    this.beat = 60 / bpm;
    this.dt = this.beat / stepsPerBeat;
    this.perBar = 4 * stepsPerBeat;
    this.out = e.ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(e.musicBus);
    this.on = false;
    this.next = 0;
    this.step = 0;
    this.count = 0; // phrases played since it began
  }

  start(t) {
    this.on = true;
    this.next = t;
    this.step = 0;
    this.count = 0;
    this.plan = null;
    const g = this.out.gain;
    g.cancelScheduledValues(t);
    g.setTargetAtTime(this.level, t, 1.2);
  }

  stop(t) {
    this.on = false;
    const g = this.out.gain;
    g.cancelScheduledValues(t);
    g.setTargetAtTime(0, t, 1.1);
  }

  update(now) {
    if (!this.on) return;
    if (this.e.musicVol <= 0.001) {
      this.next = Math.max(this.next, now + 0.5);
      return;
    }
    // a long stall of the page (a model loading, shaders compiling) left the schedule
    // behind: skip what was missed rather than sounding it all at once
    if (this.next < now - 0.05) {
      const missed = Math.ceil((now - this.next) / this.dt);
      this.step += missed;
      this.next += missed * this.dt;
    }
    while (this.next < now + 1.8) {
      const len = this.perBar * 8;
      const s = this.step % len;
      if (s === 0 || !this.plan) {
        this.plan = this.compose(this.count);
        this.count++;
      }
      // (a touch of human looseness in the timing)
      this.play(this.next, s, this.plan);
      this.step++;
      this.next += this.dt;
    }
  }
}

// 王道進行 in D major (the town's daytime piano, as it always was)
class DayPiece extends Piece {
  constructor(e) {
    super(e, 68, 2);
    this.band = new Band(e, this.out, { keysRev: 0.55 });
    this.chords = [
      { bass: 43, tones: [55, 59, 62, 66, 69] }, // Gmaj7(9)
      { bass: 45, tones: [57, 61, 64, 66, 71] }, // A6(9)
      { bass: 42, tones: [54, 57, 61, 64, 68] }, // F#m7(11)
      { bass: 47, tones: [54, 59, 62, 66, 69] }, // Bm7(9)
    ];
    this.scale = [62, 64, 66, 69, 71, 74, 76, 78, 81];
  }
  compose() {
    return {};
  }
  play(t, s) {
    const B = this.band;
    const bar = Math.floor(this.step / 8);
    const chord = this.chords[Math.floor(bar / 2) % 4];
    const sub = s % 8;
    if (sub === 0 && bar % 2 === 0) B.keys(t, chord.bass, 0.75, 6);
    if (sub === 0 && bar % 2 === 1) B.keys(t, chord.bass + 12, 0.5, 4);
    if ([0, 2, 3, 5, 6].includes(sub) && chance(0.85)) {
      const idx = [0, 2, 1, 3, 4][[0, 2, 3, 5, 6].indexOf(sub)];
      B.keys(t + rand(0, 0.015), chord.tones[idx] + 12, rand(0.35, 0.55), 3.2);
    }
    if ((sub === 1 || sub === 4 || sub === 7) && chance(0.28)) B.keys(t + rand(0, 0.02), pick(this.scale) + 12, rand(0.4, 0.6), 2.6);
  }
}

// 夕凪 (dusk)
const DUSK_PROGS = [
  prog(['Bbmaj7', ['C7sus4', 'C7'], 'Am7', 'Dm7', 'Gm7', 'C7sus4', 'Fmaj7', 'Fmaj7']),
  prog(['Fmaj7', 'Am7', 'Bbmaj7', 'Bbm6', 'Am7', 'D7', 'Gm7', ['C7sus4', 'C7']]),
  prog(['Fmaj7', 'C/E', 'Dm7', 'F/C', 'Bbmaj7', 'F/A', 'Gm7', 'C7sus4']),
  prog(['Bbmaj7', 'Am7', 'Gm7', 'Fmaj7', 'Bbmaj7', 'Bbm6', 'Fmaj7', ['Gm7', 'C7sus4']]),
  prog(['Dm9', 'Bbmaj7', 'Fmaj7', 'C/E', 'Dm7', 'Bbmaj7', 'Gm7', ['C7sus4', 'C7']]),
];
const F_MAJOR = [5, 7, 9, 10, 0, 2, 4];
// the electric piano's broken chords: which voice on each eighth of a bar (null: none)
const DUSK_ARPS = [
  [0, 1, 2, 3, 2, 1, 2, null],
  [0, 2, 3, 2, 1, 2, 3, 1],
  [0, null, 2, 1, 3, null, 2, 1],
  [1, 2, 3, null, 2, 3, 1, 2],
  [0, 1, 3, null, 2, null, 1, null],
];

class DuskPiece extends Piece {
  constructor(e) {
    super(e, 63, 2, 0.74);
    this.band = new Band(e, this.out, { keysRev: 0.5, autoPan: 0.18, padCut: 1500 });
    this.lastProg = -1;
    this.lastTex = null;
  }

  compose(n) {
    let pi;
    do pi = Math.floor(Math.random() * DUSK_PROGS.length);
    while (pi === this.lastProg && DUSK_PROGS.length > 1);
    this.lastProg = pi;
    const bars = DUSK_PROGS[pi];
    let tex;
    if (n === 0) tex = 'open';
    else {
      do tex = weighted([['arp', 0.3], ['tune', 0.34], ['tune2', 0.2], ['rest', 0.16]]);
      while (tex === this.lastTex && (tex === 'rest' || tex === 'arp'));
    }
    this.lastTex = tex;
    // the voicings, one chord to the next
    const ep = [], pad = [];
    let pe = this.epPrev, pp = this.padPrev;
    for (const bar of bars) {
      ep.push(bar.map((c) => (pe = voicing(c, 4, 57, 76, pe))));
      pad.push(bar.map((c) => (pp = voicing(c, 4, 53, 72, pp))));
    }
    this.epPrev = pe;
    this.padPrev = pp;
    const arp = pick(DUSK_ARPS), arp2 = chance(0.5) ? arp : pick(DUSK_ARPS);
    const tune = tex === 'tune' || tex === 'tune2' ? makeTune(bars, F_MAJOR, 69, 86) : null;
    const tuneAt = new Map(tune ? tune.map((nt) => [nt.step, nt]) : []);
    return { bars, ep, pad, tex, arp, arp2, tuneAt, swell: rand(0.85, 1.1) };
  }

  play(t, s, P) {
    const B = this.band, beat = this.beat;
    const bar = Math.floor(s / 8), e8 = s % 8;
    const half = e8 >= 4 ? 1 : 0;
    const chords = P.bars[bar];
    const ci = Math.min(chords.length - 1, half);
    const ch = chords[ci];
    const ep = P.ep[bar][ci], pad = P.pad[bar][ci];
    const start = e8 === 0 || (e8 === 4 && chords.length > 1);
    const span = chords.length > 1 ? 2 : 4;
    const hum = () => rand(0, 0.018);
    // strings: each chord held for its length
    if (start && P.tex !== 'tune2') B.pad(t, pad, span * beat + 0.2, P.tex === 'rest' ? 0.8 : P.swell, 1.4, 2.6);
    if (start && P.tex === 'tune2') B.pad(t, pad.slice(0, 3), span * beat + 0.2, 0.6, 1.2, 2.2);
    // bass: the root on the bar, and on beat three now and then the fifth or a step to the next
    if (P.tex !== 'rest') {
      const root = 41 + ((ch.bass - 5 + 12) % 12);
      if (start) B.bass(t, root, 0.9, span * beat * 0.9);
      else if (e8 === 4 && chance(0.45)) {
        // (the fifth, or a step in the key toward the next chord's root)
        const nxt = P.bars[(bar + 1) % 8][0];
        const target = 41 + ((nxt.bass - 5 + 12) % 12);
        const dir = target > root ? -1 : 1;
        const step = [1, 2].map((k) => target + dir * k).find((m) => F_MAJOR.includes(((m % 12) + 12) % 12)) ?? root + 7;
        B.bass(t, chance(0.5) ? root + 7 : step, 0.6, beat * 1.8);
      }
    }
    // the electric piano
    if (P.tex === 'open' || P.tex === 'rest') {
      if (start) for (const m of ep) B.keys(t + hum() * 2, m, P.tex === 'rest' ? 0.35 : 0.45, span * beat + 1.6, 'ep', B.epBus);
      if (P.tex === 'rest' && e8 === 6 && chance(0.35)) B.keys(t + hum(), pick(ep) + 12, 0.3, 2.5, 'ep', B.epBus);
    } else if (P.tex === 'arp' || P.tex === 'tune') {
      const pat = bar < 4 ? P.arp : P.arp2;
      const v = pat[e8];
      if (v !== null && v < ep.length && (P.tex === 'arp' || chance(0.8))) {
        const accent = e8 === 0 ? 0.62 : e8 % 2 ? 0.36 : 0.46;
        B.keys(t + hum(), ep[v] + (P.tex === 'tune' && v > 1 ? -12 : 0), accent * (P.tex === 'tune' ? 0.85 : 1), 2.4, 'ep', B.epBus);
      }
    } else if (P.tex === 'tune2') {
      // block chords on one and the and-of-two
      if (e8 === 0 || e8 === 3) for (const m of ep.slice(0, 3)) B.keys(t + hum(), m - 12 * (m > 70 ? 1 : 0), e8 === 0 ? 0.42 : 0.32, beat * 1.6, 'ep', B.epBus);
    }
    // the pipe's tune
    const nt = P.tuneAt.get(s);
    if (nt) B.pipe(t + hum(), nt.midi, nt.len >= 4 ? 0.75 : 0.62, nt.len * (beat / 2) * 0.96);
    // a high glint at the phrase's end
    if (s === 63 && chance(0.4)) B.box(t, pick(ep) + 24, 0.35, 3.2);
  }
}

// 夜の海 (night)
const NIGHT_PROGS = [
  prog(['Dbmaj9', 'Dbmaj9', 'Gbmaj9#11', 'Gbmaj9#11', 'Bbm9', 'Bbm9', 'Abadd9/C', 'Ab7sus4']),
  prog(['Gbmaj7', 'Gbmaj7', 'Fm7', 'Fm7', 'Ebm9', 'Ebm9', 'Ab13sus4', 'Ab13sus4']),
  prog(['Bbm9', 'Bbm9', 'Gbmaj7', 'Gbmaj7', 'Db/F', 'Db/F', 'Ebm7', 'Ab7sus4']),
  prog(['Db69', 'Db69', 'Gb/Ab', 'Gb/Ab', 'Fm7', 'Fm7', 'Bbm9', 'Bbm9']),
  prog(['Gbmaj9#11', 'Gbmaj9#11', 'Dbmaj9/F', 'Dbmaj9/F', 'Ebm9', 'Ebm9', 'Gb/Ab', 'Ab7sus4']),
];
const DB_MAJOR = [1, 3, 5, 6, 8, 10, 0];

class NightPiece extends Piece {
  constructor(e) {
    super(e, 56, 4);
    this.band = new Band(e, this.out, { keysRev: 0.7, padCut: 950, padRev: 0.8, echo: [0.54, 0.81] });
    this.lastProg = -1;
    this.lastTex = null;
  }

  compose(n) {
    let pi;
    do pi = Math.floor(Math.random() * NIGHT_PROGS.length);
    while (pi === this.lastProg);
    this.lastProg = pi;
    const bars = NIGHT_PROGS[pi];
    let tex;
    if (n === 0) tex = 'stars';
    else {
      do tex = weighted([['stars', 0.3], ['nocturne', 0.28], ['song', 0.26], ['calm', 0.16]]);
      while (tex === this.lastTex && tex !== 'stars');
    }
    this.lastTex = tex;
    const pad = [], keys = [];
    let pp = this.padPrev, pk = this.keysPrev;
    for (const bar of bars) {
      pad.push(bar.map((c) => (pp = voicing(c, 4, 51, 70, pp))));
      keys.push(bar.map((c) => (pk = voicing(c, 3, 53, 68, pk))));
    }
    this.padPrev = pp;
    this.keysPrev = pk;
    // the tune (slow: one note to a beat or longer, in quarters)
    let tuneAt = new Map();
    if (tex === 'song') {
      const tune = makeTune(bars, DB_MAJOR, 65, 80);
      tuneAt = new Map(tune.map((nt) => [nt.step * 2, { ...nt, len: nt.len * 2 }]));
    }
    // how thick the stars are, rising and falling over the phrase
    const density = tex === 'stars' ? rand(0.1, 0.17) : tex === 'calm' ? 0.025 : rand(0.04, 0.08);
    return { bars, pad, keys, tex, tuneAt, density, runAt: chance(0.55) ? 16 * Math.floor(rand(2, 7)) + 8 : -1, lastBox: 0 };
  }

  play(t, s, P) {
    const B = this.band, beat = this.beat;
    const bar = Math.floor(s / 16), e16 = s % 16;
    const ch = P.bars[bar][0];
    const pad = P.pad[bar][0], keys = P.keys[bar][0];
    const newChord = e16 === 0 && (bar === 0 || P.bars[bar - 1][0].sym !== ch.sym);
    const len = (bar + 1 < 8 && P.bars[bar + 1][0].sym === ch.sym ? 8 : 4) * beat;
    // the pad: a long swell for each chord
    if (newChord) B.pad(t, pad, len + 0.4, P.tex === 'calm' ? 0.9 : 1, 2.8, 4.2);
    // the sub: the chord's bass, very low and soft
    if (newChord && P.tex !== 'calm') B.bass(t, 37 + ((ch.bass - 1 + 12) % 12), 0.55, len);
    // the soft low piano: the chord rolled slowly upward, or a single answer
    if (P.tex === 'nocturne' || P.tex === 'song') {
      if (newChord) keys.forEach((m, i) => B.keys(t + i * beat * (P.tex === 'song' ? 0.5 : 0.75) + rand(0, 0.02), m, 0.32 - i * 0.04, len + 1.5));
      else if (e16 === 0 && chance(0.4)) B.keys(t + rand(0, 0.03), pick(keys) + 12, 0.24, 3.5);
    }
    // the tune, on the piano, an octave up from the chords
    const nt = P.tuneAt.get(s);
    if (nt) B.keys(t + rand(0, 0.02), nt.midi, nt.len >= 8 ? 0.42 : 0.36, Math.max(2.2, nt.len * (beat / 4) * 1.6));
    // the music box: stars coming out
    const lift = 0.6 + 0.8 * Math.sin((Math.PI * s) / 128) ** 2;
    const pcs = chordPcs(ch);
    if (s - P.lastBox > 2 && chance(P.density * lift * (e16 % 4 === 0 ? 1.5 : 0.7))) {
      const notes = inRange(pcs, 78, 96);
      B.box(t + rand(0, 0.01), pick(notes), rand(0.4, 0.75), rand(2.2, 3.4));
      P.lastBox = s;
    }
    // now and then a little run up or down
    if (s === P.runAt && P.tex !== 'calm') {
      const notes = inRange(pcs, 80, 97);
      const n = Math.floor(rand(3, 6)), up = chance(0.6);
      let i = up ? Math.floor(rand(0, 2)) : notes.length - 1 - Math.floor(rand(0, 2));
      for (let k = 0; k < n && i >= 0 && i < notes.length; k++, i += up ? 1 : -1) B.box(t + k * this.dt * 0.75, notes[i], 0.55 - k * 0.06, 2.4);
      P.lastBox = s + 4;
    }
  }
}

// ---------------------------------------------------------------------------- the director
// Which piece the hour calls for, and the turn from one to the next: the old one stops taking
// new notes and fades as its last ones ring out, the new one comes in a little after
export function musicMood(hour) {
  if (hour >= 16.4 && hour < 19.3) return 'dusk';
  if (hour >= 19.3 || hour < 4.9) return 'night';
  return 'day';
}

export class MusicDirector {
  constructor(engine) {
    this.e = engine;
    this.pieces = { day: new DayPiece(engine), dusk: new DuskPiece(engine), night: new NightPiece(engine) };
    this.mood = null;
  }

  update(now, hour) {
    const want = musicMood(hour);
    if (want !== this.mood) {
      if (this.mood) this.pieces[this.mood].stop(now);
      this.pieces[want].start(now + (this.mood ? 2.6 : 0.8));
      this.mood = want;
    }
    for (const k in this.pieces) this.pieces[k].update(now);
  }
}

// (for tests: the pieces, to play one on its own)
export const PIECES = { DayPiece, DuskPiece, NightPiece };
