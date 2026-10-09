import { STATION, SUBWAY } from '../world/layout.js';

// When the town speaks: station and subway announcements follow the trains, shop staff
// greet you at the door and at the counter, machines thank you, the mall plays its PA,
// and at 5 pm the town loudspeaker sends the children home.

const rand = (a, b) => a + Math.random() * (b - a);

export class TownVoices {
  constructor(voice, world) {
    this.voice = voice;
    this.world = world;
    const g = (x, z) => world.colliders.groundAt(x, z);
    const px = (STATION.platX0 + STATION.platX1) / 2, pz = (STATION.platZ0 + STATION.platZ1) / 2;
    this.stationPA = { x: px, y: g(px, pz) + 3.2, z: pz };
    this.subwayPA = { x: (SUBWAY.x0 + SUBWAY.x1) / 2, y: -2, z: -14 };
    const find = (kind, what) => world.interactables.find((it) => it.kind === kind && (!what || it.what === what));
    const at = (it, dy = 1.5) => (it ? { x: it.x, y: (it.y ?? g(it.x, it.z)) + dy, z: it.z } : null);
    this.spots = {
      konbini: at(find('konbini', 'register')),
      cafe: at(find('cafe')),
      crepe: at(find('crepe')),
      library: at(find('library')),
    };
    this.announced = true; // the approach of the current run has been announced
    this.room = null;
    this.roomT = {};
    this.lastLeft = {};
    this.mallT = 6;
    this.infoT = rand(25, 45);
    this.cwT = 40;
    this.walk = new Map();
    this.seenMap = false;
  }

  // walking starts: a welcome from the town guide (first time only)
  onStart() {
    this.voice.preload(['nr_welcome', 'kb_welcome', 'kb_thanks', 'vd_thanks', 'st_approach_w', 'st_approach_e']);
    if (!this.welcomed) {
      this.welcomed = true;
      this.voice.play('nr_welcome', { channel: 'narr', delay: 2.4, maxWait: 6 });
    }
  }

  // something was used (main.js interact()); returns extra info for the toast
  onInteract(it, info = {}) {
    const v = this.voice;
    const here = { x: it.x, y: (it.y ?? this.world.colliders.groundAt(it.x, it.z)) + 1.3, z: it.z };
    switch (it.kind) {
      case 'vending':
        v.play(info.lucky ? 'vd_win' : 'vd_thanks', { at: here, channel: 'local', interrupt: true, delay: 0.9, ref: 3 });
        break;
      case 'ticket':
        v.play('tk_buy', { at: here, channel: 'local', interrupt: true, delay: 0.5, ref: 3 });
        break;
      case 'konbini':
        if (it.what === 'register') {
          v.play(info.line === 1 ? 'kb_receipt' : 'kb_warm', { at: this.spots.konbini, channel: 'local', interrupt: true, ref: 4 });
          setTimeout(() => v.play('kb_thanks', { at: this.spots.konbini, channel: 'local', ref: 4 }), 3600);
        } else if (it.what === 'drink' || it.what === 'onigiri' || it.what === 'sweets') {
          v.play('kb_thanks', { at: this.spots.konbini, channel: 'local', delay: 0.6, ref: 4 });
        }
        break;
      case 'cafe':
        v.play('cf_order', { at: this.spots.cafe ?? here, channel: 'local', interrupt: true, ref: 4 });
        break;
      case 'crepe':
        v.play('ml_crepe', { at: this.spots.crepe ?? here, channel: 'local', interrupt: true, ref: 4 });
        break;
      case 'library':
        v.play('lb_lend', { at: this.spots.library ?? here, channel: 'local', interrupt: true, ref: 3 });
        break;
      case 'map':
        if (!this.seenMap) {
          this.seenMap = true;
          v.play('nr_map', { channel: 'narr', delay: 0.4 });
        }
        break;
      default:
        break;
    }
  }

  // s: { play, x, y, z, under, room, hour, dHour, train, subway, crosswalks, night }
  update(dt, s) {
    const v = this.voice;
    v.update();
    if (!s.play) return;

    // --- 桜ヶ浜駅: approach / arrival / doors closing ---------------------------------
    const tr = s.train;
    const nearStation = !s.under && Math.hypot(s.x - this.stationPA.x, s.z - this.stationPA.z) < 95;
    if (tr) {
      if (tr.events.includes('enter')) this.announced = false;
      if (tr.state === 'arrive' && this.announced === false) {
        const remain = (tr.stopHead() - tr.head) * tr.dir;
        if (remain < 170) {
          this.announced = true;
          if (nearStation) v.play(tr.dir < 0 ? 'st_approach_w' : 'st_approach_e', { at: this.stationPA, channel: 'pa', ref: 14, spread: 0.11 });
        }
      }
      for (const e of tr.events) {
        if (!nearStation) continue;
        if (e === 'arrived') v.play('st_arrive', { at: this.stationPA, channel: 'pa', delay: 1.2, ref: 14, spread: 0.11 });
        if (e === 'melody') v.play('st_close', { at: this.stationPA, channel: 'pa', delay: 2.9, ref: 14, spread: 0.11, interrupt: true });
      }
    }

    // --- 地下鉄 桜ヶ浜中央駅 ---------------------------------------------------------------
    if (s.subway) {
      for (const ev of s.subway.events) {
        if (!s.under) continue;
        const track = ev.train.x < (SUBWAY.x0 + SUBWAY.x1) / 2 ? 1 : 2;
        const o = { at: this.subwayPA, channel: 'pa', ref: 16, wet: 0.7, spread: 0.06 };
        if (ev.e === 'approach') v.play(`sw_approach_${track}`, { ...o, delay: 1.6, maxWait: 3 });
        else if (ev.e === 'doorsOpen') v.play('sw_arrive', { ...o, delay: 0.4 });
        else if (ev.e === 'doorsClose') v.play('sw_close', { ...o, interrupt: true });
      }
      if (s.under) {
        this.infoT -= dt;
        if (this.infoT <= 0) {
          this.infoT = rand(110, 170);
          if (!v.busy('pa')) v.play('sw_info', { at: this.subwayPA, channel: 'pa', ref: 16, wet: 0.7, spread: 0.06 });
        }
      }
    }

    // --- shops: greeted at the door, thanked on the way out ----------------------------
    if (s.room !== this.room) {
      const prev = this.room;
      this.room = s.room;
      const now = performance.now() / 1000;
      if (prev === 'konbini' && now - (this.roomT.konbini || 0) > 4) v.play('kb_thanks', { at: this.spots.konbini, channel: 'local', ref: 5 });
      if (s.room === 'konbini' && now - (this.lastLeft.konbini || 0) > 20) {
        this.roomT.konbini = now;
        v.play('kb_welcome', { at: this.spots.konbini, channel: 'local', interrupt: true, delay: 0.5, ref: 5 });
      }
      if (s.room === 'cafe' && now - (this.lastLeft.cafe || 0) > 30) v.play('cf_welcome', { at: this.spots.cafe, channel: 'local', interrupt: true, delay: 0.6, ref: 5 });
      if (s.room === 'mall') this.mallT = Math.min(this.mallT, 7);
      if (prev) this.lastLeft[prev] = now;
    }
    if (s.room === 'mall') {
      this.mallT -= dt;
      if (this.mallT <= 0) {
        this.mallT = rand(140, 200);
        if (!v.busy('pa')) v.play('ml_pa', { channel: 'pa', gain: 0.85, wet: 0.8, spread: 0.13 });
      }
    }

    // --- 5 pm: the town loudspeaker -----------------------------------------------------
    if (s.dHour > 0 && s.dHour < 0.5 && s.hour >= 17 && s.hour - s.dHour < 17) this.eveningPA(s);

    // --- talking pedestrian signal in the commercial district --------------------------
    this.cwT -= dt;
    for (const c of s.crosswalks || []) {
      const was = this.walk.get(c);
      this.walk.set(c, c.walk);
      if (c.walk && was === false && this.cwT <= 0 && !s.under && Math.hypot(c.x - s.x, c.z - s.z) < 12) {
        this.cwT = rand(120, 200);
        if (Math.random() < 0.7) v.play('cw_green', { at: { x: c.x, y: s.y + 2.5, z: c.z }, channel: 'local', ref: 5, gain: 0.8 });
      }
    }
  }

  // a short chime (an original tune) then the announcement, echoing over the town
  eveningPA(s) {
    const v = this.voice;
    const a = v.audio;
    if (!a.ctx) return;
    v._init();
    const indoor = s.room || s.under;
    const k = indoor ? 0.35 : 1;
    const input = v._chain('townpa', { gain: 0.9 * k });
    const t0 = a.ctx.currentTime + 0.3;
    // G A B D | E D B - | A B D B | A G - -   (bell-like: fundamental + octave)
    const tune = [67, 69, 71, 74, 76, 74, 71, null, 69, 71, 74, 71, 69, 67, null, null];
    tune.forEach((m, i) => {
      if (m === null) return;
      const f = 440 * Math.pow(2, (m - 69) / 12);
      const t = t0 + i * 0.52;
      const long = i === 13 ? 2.2 : 0.9;
      a.tone(input, t, f, f, long, 0.09);
      a.tone(input, t, f * 2, f * 2, long * 0.6, 0.025);
    });
    const tuneLen = tune.length * 0.52 + 1.4;
    v.duckUntil = Math.max(v.duckUntil || 0, a.ctx.currentTime + tuneLen);
    setTimeout(() => v.play('pa_evening', { channel: 'town', gain: k }), tuneLen * 1000);
  }
}
