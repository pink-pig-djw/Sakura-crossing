import { VOICE_LINES } from './voiceLines.js';

// Japanese voice lines (VOICEVOX, see tools/voice) played through small "rooms":
//   pa       station / subway / mall loudspeakers: band-limited, a second speaker a
//            little later, reverb; positioned at the platform or in the hall
//   townpa   the 5 pm town loudspeaker: far away, echoing between the hills
//   room     a clerk behind a counter: close, a touch of room tone
//   machine  vending / ticket machine: tiny speaker
//   narrator the town guide: dry and centred
// Each line plays on one channel; music ducks under any voice; subtitles follow the
// interface language.

const FX = { station: 'pa', clerk: 'room', cafe: 'room', narrator: 'narrator', townpa: 'townpa', machine: 'machine' };
const PRESET = {
  st_approach_w: 'station', st_approach_e: 'station', st_arrive: 'station', st_close: 'station',
  sw_approach_1: 'station', sw_approach_2: 'station', sw_arrive: 'station', sw_close: 'station', sw_info: 'station',
  ml_pa: 'station', kb_welcome: 'clerk', kb_thanks: 'clerk', kb_warm: 'clerk', kb_receipt: 'clerk', ml_crepe: 'clerk',
  cf_welcome: 'cafe', cf_order: 'cafe', lb_lend: 'narrator', nr_welcome: 'narrator', nr_map: 'narrator',
  vd_thanks: 'machine', vd_win: 'machine', tk_buy: 'machine', cw_green: 'machine', pa_evening: 'townpa',
};

export class VoiceSystem {
  constructor(audio, ui) {
    this.audio = audio;
    this.ui = ui;
    this.volume = 0.8;
    this.subtitles = true;
    this.cache = new Map(); // id -> Promise<AudioBuffer|null>
    this.channels = {}; // name -> { src, until }
    this.duck = 0;
    this.base = (import.meta.env?.BASE_URL ?? './') + 'voice/';
  }

  get ready() {
    return !!this.audio.ctx;
  }

  setVolume(v) {
    this.volume = v;
    if (this.bus) this.bus.gain.setTargetAtTime(v, this.audio.ctx.currentTime, 0.1);
  }

  _init() {
    if (this.bus || !this.audio.ctx) return;
    const ctx = this.audio.ctx;
    this.bus = ctx.createGain();
    this.bus.gain.value = this.volume;
    this.bus.connect(this.audio.master);
    // short room for the clerk lines
    this.room = ctx.createConvolver();
    this.room.buffer = this.audio.impulse(0.5, 3.5);
    this.roomSend = ctx.createGain();
    this.roomSend.gain.value = 0.22;
    this.roomSend.connect(this.room).connect(this.bus);
  }

  load(id) {
    if (!this.audio.ctx || !VOICE_LINES[id]) return Promise.resolve(null);
    let p = this.cache.get(id);
    if (!p) {
      // single-file builds embed the clips as base64 (window.__VOICES); otherwise fetch them
      const inline = window.__VOICES?.[id];
      const bytes = inline
        ? Promise.resolve(Uint8Array.from(atob(inline), (ch) => ch.charCodeAt(0)).buffer)
        : fetch(`${this.base}${id}.mp3`).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.status))));
      p = bytes
        .then((b) => new Promise((res, rej) => this.audio.ctx.decodeAudioData(b, res, rej)))
        .catch(() => null);
      this.cache.set(id, p);
    }
    return p;
  }

  preload(ids) {
    for (const id of ids) this.load(id);
  }

  busy(channel) {
    const c = this.channels[channel];
    return !!c && c.until > this.audio.ctx.currentTime;
  }

  stop(channel) {
    const c = this.channels[channel];
    if (c) {
      try {
        c.src.stop();
      } catch {
        /* already stopped */
      }
      delete this.channels[channel];
    }
  }

  // play(id, { at: {x,y,z}, channel, delay, interrupt, subtitle, gain })
  async play(id, o = {}) {
    if (!this.audio.ctx || !VOICE_LINES[id] || this.volume <= 0.001) return false;
    this._init();
    const channel = o.channel ?? 'local';
    if (this.busy(channel) && !o.interrupt) return false;
    const requested = this.audio.ctx.currentTime;
    const buf = await this.load(id);
    if (!buf) return false;
    const ctx = this.audio.ctx;
    // too late to still make sense (slow network)? drop it
    if (ctx.currentTime - requested > (o.maxWait ?? 4)) return false;
    if (this.busy(channel)) {
      if (!o.interrupt) return false;
      this.stop(channel);
    }
    const t = ctx.currentTime + (o.delay ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const out = this._chain(FX[PRESET[id]] ?? 'narrator', o);
    src.connect(out);
    src.start(t);
    const until = t + buf.duration;
    this.channels[channel] = { src, until };
    src.onended = () => {
      if (this.channels[channel]?.src === src) delete this.channels[channel];
    };
    const line = VOICE_LINES[id];
    if (this.subtitles && o.subtitle !== false) {
      const show = () => this.ui.subtitle(line, buf.duration + 0.5);
      if (o.delay) setTimeout(show, o.delay * 1000);
      else show();
    }
    this.duckUntil = Math.max(this.duckUntil || 0, until + 0.4);
    return true;
  }

  // per-line signal chain, ending at the voice bus
  _chain(kind, o) {
    const ctx = this.audio.ctx;
    const g = ctx.createGain();
    g.gain.value = o.gain ?? 1;
    let tail = g;
    const pan = () => {
      if (!o.at) return;
      const p = this.audio.panner(o.at.x, o.at.y, o.at.z, o.ref ?? 6, o.roll ?? 1.1);
      tail.connect(p);
      tail = p;
    };
    if (kind === 'pa') {
      // loudspeaker band, a nasal lift, a second speaker further down the hall
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 320;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 4200;
      const pk = ctx.createBiquadFilter();
      pk.type = 'peaking';
      pk.frequency.value = 1900;
      pk.gain.value = 5;
      pk.Q.value = 0.9;
      g.connect(hp).connect(pk).connect(lp);
      const mix = ctx.createGain();
      lp.connect(mix);
      const d = ctx.createDelay(0.5);
      d.delayTime.value = o.spread ?? 0.075;
      const dg = ctx.createGain();
      dg.gain.value = 0.42;
      lp.connect(d).connect(dg).connect(mix);
      tail = mix;
      pan();
      tail.connect(this.bus);
      const send = ctx.createGain();
      send.gain.value = o.wet ?? 0.55;
      tail.connect(send).connect(this.audio.revSend);
      return g;
    }
    if (kind === 'townpa') {
      // a far-off outdoor horn bouncing between the hills
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 380;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 3200;
      g.connect(hp).connect(lp);
      const mix = ctx.createGain();
      mix.gain.value = 0.85;
      lp.connect(mix);
      for (const [dt, k] of [[0.42, 0.45], [0.95, 0.28], [1.6, 0.14]]) {
        const d = ctx.createDelay(2);
        d.delayTime.value = dt;
        const dg = ctx.createGain();
        dg.gain.value = k;
        lp.connect(d).connect(dg).connect(mix);
      }
      mix.connect(this.bus);
      const send = ctx.createGain();
      send.gain.value = 0.7;
      mix.connect(send).connect(this.audio.revSend);
      return g;
    }
    if (kind === 'machine') {
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 450;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 5200;
      g.connect(hp).connect(lp);
      tail = lp;
      pan();
      tail.connect(this.bus);
      return g;
    }
    if (kind === 'room') {
      pan();
      tail.connect(this.bus);
      tail.connect(this.roomSend);
      return g;
    }
    // narrator: dry, centred
    g.connect(this.bus);
    return g;
  }

  // music (and a little ambience) dips under the voice
  update() {
    if (!this.audio.ctx || !this.bus) return;
    const ctx = this.audio.ctx;
    const on = ctx.currentTime < (this.duckUntil || 0) ? 1 : 0;
    if (on !== this.duck) {
      this.duck = on;
      const t = ctx.currentTime;
      this.audio.musicBus.gain.setTargetAtTime(this.audio.musicVol * 0.55 * (on ? 0.3 : 1), t, on ? 0.15 : 0.8);
      this.audio.amb.gain.setTargetAtTime(this.audio.ambVol * (on ? 0.7 : 1), t, on ? 0.2 : 0.8);
    }
  }
}
