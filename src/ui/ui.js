import { ROADS, roadRect, PARK, PLAZA, SHRINE, STATION, SEAWALL_Z, shoreZ, BREAKWATER, RAIL_Z, CROSSINGS } from '../world/layout.js';
import { PRESETS } from '../systems/timeofday.js';

const $ = (id) => document.getElementById(id);

export class UI {
  constructor() {
    this.el = {
      title: $('title'),
      loadbar: $('loadbar'),
      loadtext: $('loadtext'),
      start: $('start'),
      hud: $('hud'),
      area: $('area'),
      areaName: $('area-name'),
      areaSub: $('area-sub'),
      clock: $('clock'),
      period: $('period'),
      clockIcon: $('clock-icon'),
      counts: $('counts'),
      prompt: $('prompt'),
      promptText: $('prompt-text'),
      toast: $('toast'),
      crosshair: $('crosshair'),
      menu: $('menu'),
      map: $('map'),
      mapCanvas: $('map-canvas'),
      omikuji: $('omikuji'),
      luck: $('luck'),
      luckText: $('luck-text'),
      touch: $('touch'),
      notebook: $('notebook'),
    };
    this.areaTimer = 0;
    this.toastTimer = 0;
    this.isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    this.handlers = {};
    this._bind();
  }

  on(name, fn) {
    this.handlers[name] = fn;
  }
  emit(name, ...a) {
    this.handlers[name]?.(...a);
  }

  _bind() {
    const e = this.el;
    e.start.addEventListener('click', () => this.emit('start'));
    $('resume').addEventListener('click', () => this.emit('resume'));
    $('menu-btn').addEventListener('click', () => this.emit('menu'));
    $('open-map').addEventListener('click', () => this.emit('map'));
    $('close-map').addEventListener('click', () => this.emit('closeMap'));
    $('close-omikuji').addEventListener('click', () => this.emit('closeOmikuji'));
    e.map.addEventListener('click', (ev) => {
      if (ev.target === e.map) this.emit('closeMap');
    });
    const tb = $('tod-buttons');
    for (const p of PRESETS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = p.label;
      b.dataset.hour = p.hour;
      b.addEventListener('click', () => this.emit('time', p.hour));
      tb.appendChild(b);
    }
    $('flow').addEventListener('change', (ev) => this.emit('flow', ev.target.checked));
    $('vol-amb').addEventListener('input', (ev) => this.emit('volume', 'amb', ev.target.value / 100));
    $('vol-music').addEventListener('input', (ev) => this.emit('volume', 'music', ev.target.value / 100));
    $('sens').addEventListener('input', (ev) => this.emit('sens', ev.target.value / 100));
    $('outline-toggle').addEventListener('change', (ev) => this.emit('outlines', ev.target.checked));
    for (const b of document.querySelectorAll('#quality-buttons button')) b.addEventListener('click', () => this.emit('quality', b.dataset.q));
    this._bindTouch();
  }

  _bindTouch() {
    const zone = $('stick-zone');
    const stick = $('stick');
    const knob = stick.querySelector('i');
    let id = null, cx = 0, cy = 0;
    const R = 50;
    const move = (x, y) => {
      let dx = x - cx, dy = y - cy;
      const d = Math.hypot(dx, dy);
      if (d > R) {
        dx = (dx / d) * R;
        dy = (dy / d) * R;
      }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      this.emit('stick', dx / R, -dy / R);
    };
    zone.addEventListener('touchstart', (ev) => {
      const t = ev.changedTouches[0];
      id = t.identifier;
      const r = stick.getBoundingClientRect();
      cx = r.left + r.width / 2;
      cy = r.top + r.height / 2;
      move(t.clientX, t.clientY);
      ev.preventDefault();
    }, { passive: false });
    zone.addEventListener('touchmove', (ev) => {
      for (const t of ev.changedTouches) if (t.identifier === id) move(t.clientX, t.clientY);
      ev.preventDefault();
    }, { passive: false });
    const end = (ev) => {
      for (const t of ev.changedTouches) {
        if (t.identifier === id) {
          id = null;
          knob.style.transform = '';
          this.emit('stick', 0, 0);
        }
      }
    };
    zone.addEventListener('touchend', end);
    zone.addEventListener('touchcancel', end);
    // look: drag anywhere else on the canvas
    const canvas = $('scene');
    let lid = null, lx = 0, ly = 0;
    canvas.addEventListener('touchstart', (ev) => {
      const t = ev.changedTouches[0];
      lid = t.identifier;
      lx = t.clientX;
      ly = t.clientY;
    }, { passive: true });
    canvas.addEventListener('touchmove', (ev) => {
      for (const t of ev.changedTouches) {
        if (t.identifier === lid) {
          this.emit('look', (t.clientX - lx) * 1.6, (t.clientY - ly) * 1.6);
          lx = t.clientX;
          ly = t.clientY;
        }
      }
      ev.preventDefault();
    }, { passive: false });
    canvas.addEventListener('touchend', (ev) => {
      for (const t of ev.changedTouches) if (t.identifier === lid) lid = null;
    });
    $('t-act').addEventListener('click', () => this.emit('interact'));
    $('t-jump').addEventListener('click', () => this.emit('jump'));
    const run = $('t-run');
    run.addEventListener('click', () => {
      run.classList.toggle('on');
      this.emit('runToggle', run.classList.contains('on'));
    });
  }

  setProgress(p, label) {
    if (p !== null && p !== undefined) this.el.loadbar.style.width = `${Math.round(p * 100)}%`;
    if (label) this.el.loadtext.textContent = `${label}…`;
  }

  ready() {
    this.el.loadtext.textContent = '準備ができました';
    this.el.start.hidden = false;
    this.el.start.focus({ preventScroll: true });
    setTimeout(() => (document.getElementById('loader').hidden = true), 600);
  }

  enterGame() {
    this.el.title.hidden = true;
    this.el.hud.hidden = false;
    if (this.isTouch) this.el.touch.hidden = false;
  }

  showArea(a) {
    if (!a) return;
    this.el.areaName.textContent = a.name;
    this.el.areaSub.textContent = a.sub;
    this.el.area.classList.add('show');
    this.areaTimer = 4.5;
  }

  toast(text, secs = 3.2) {
    this.el.toast.textContent = text;
    this.el.toast.classList.add('show');
    this.toastTimer = secs;
  }

  setPrompt(label) {
    if (!label) {
      this.el.prompt.hidden = true;
      return;
    }
    this.el.prompt.hidden = false;
    this.el.promptText.textContent = label;
    this.el.prompt.querySelector('kbd').hidden = this.isTouch;
  }

  setClock(label, period, hour) {
    this.el.clock.textContent = label;
    this.el.period.textContent = period;
    const icon = hour >= 5 && hour < 16.5 ? 'sun' : hour >= 16.5 && hour < 19 ? 'dusk' : 'moon';
    this.el.clockIcon.className = icon;
  }

  setCounts(c) {
    const parts = [];
    if (c.shells) parts.push(`<span>貝がら ${c.shells}/${c.shellsMax}</span>`);
    if (c.cats) parts.push(`<span>ねこ ${c.cats}/${c.catsMax}</span>`);
    this.el.counts.innerHTML = parts.join('');
  }

  setCrosshair(v) {
    this.el.crosshair.hidden = !v;
  }

  update(dt) {
    if (this.areaTimer > 0) {
      this.areaTimer -= dt;
      if (this.areaTimer <= 0) this.el.area.classList.remove('show');
    }
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.el.toast.classList.remove('show');
    }
  }

  openMenu(state) {
    this.el.menu.hidden = false;
    this.syncMenu(state);
  }
  closeMenu() {
    this.el.menu.hidden = true;
  }

  syncMenu(state) {
    for (const b of document.querySelectorAll('#tod-buttons button')) {
      const h = parseFloat(b.dataset.hour);
      b.classList.toggle('on', Math.abs(h - state.hour) < 0.6);
    }
    $('flow').checked = state.flowing;
    for (const b of document.querySelectorAll('#quality-buttons button')) b.classList.toggle('on', b.dataset.q === state.quality);
    const nb = this.el.notebook;
    nb.innerHTML = '';
    const add = (k, v) => {
      const li = document.createElement('li');
      li.innerHTML = `<span>${k}</span><span>${v}</span>`;
      nb.appendChild(li);
    };
    add('訪れた場所', `${state.visited}/${state.placesMax}`);
    add('なでたねこ', `${state.cats}/${state.catsMax}`);
    add('拾った貝がら', `${state.shells}/${state.shellsMax}`);
    add('買った飲み物', `${state.drinks}本`);
    add('おみくじ', state.luck || 'まだ');
    add('電車を見送った', `${state.trains}回`);
  }

  openOmikuji(luck, text) {
    this.el.luck.textContent = luck;
    this.el.luckText.textContent = text;
    this.el.omikuji.hidden = false;
  }
  closeOmikuji() {
    this.el.omikuji.hidden = true;
  }

  openMap(player, landmarks) {
    this.el.map.hidden = false;
    drawMap(this.el.mapCanvas, player, landmarks);
  }
  closeMap() {
    this.el.map.hidden = true;
  }
}

// Hand-drawn style town map
export function drawMap(canvas, player, landmarks) {
  const c = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const x0 = -215, x1 = 215, z0 = -180, z1 = 125;
  const sx = W / (x1 - x0), sz = H / (z1 - z0);
  const s = Math.min(sx, sz);
  const ox = (W - (x1 - x0) * s) / 2, oz = (H - (z1 - z0) * s) / 2;
  const P = (x, z) => [ox + (x - x0) * s, oz + (z - z0) * s];
  c.fillStyle = '#f4efe2';
  c.fillRect(0, 0, W, H);
  // hills
  c.fillStyle = '#cfe0b8';
  c.fillRect(0, 0, W, P(0, -127)[1]);
  c.fillRect(0, 0, P(-146, 0)[0], P(0, 51)[1]);
  c.fillRect(P(146, 0)[0], 0, W - P(146, 0)[0], P(0, 51)[1]);
  // sea + beach
  c.beginPath();
  c.moveTo(0, H);
  for (let x = x0; x <= x1; x += 5) {
    const [px, pz] = P(x, shoreZ(x));
    c.lineTo(px, pz);
  }
  c.lineTo(W, H);
  c.closePath();
  c.fillStyle = '#a9d4ea';
  c.fill();
  c.fillStyle = '#efe0bc';
  c.beginPath();
  c.moveTo(0, P(0, SEAWALL_Z)[1]);
  for (let x = x0; x <= x1; x += 5) {
    const [px, pz] = P(x, shoreZ(x));
    c.lineTo(px, pz);
  }
  c.lineTo(W, P(0, SEAWALL_Z)[1]);
  c.closePath();
  c.fill();
  // park, plaza, shrine
  const rect = (a, b, d, e, col) => {
    const [ax, az] = P(a, b), [bx, bz] = P(d, e);
    c.fillStyle = col;
    c.fillRect(ax, az, bx - ax, bz - az);
  };
  rect(PARK.x0, PARK.z0, PARK.x1, PARK.z1, '#bcd9a0');
  rect(PLAZA.x0, PLAZA.z0, PLAZA.x1, PLAZA.z1, '#e8dcc8');
  rect(SHRINE.terraceX0, SHRINE.terraceZ1, SHRINE.terraceX1, SHRINE.terraceZ0, '#e2d8c4');
  // roads
  for (const r of ROADS) {
    const q = roadRect(r);
    rect(q.x0, q.z0, q.x1, q.z1, r.id === 'sakura' ? '#f2c4d2' : r.id === 'shotengai' ? '#f0d9b0' : '#ffffff');
  }
  // promenade
  rect(-200, 68.5, 200, 73, '#e9e2d0');
  // railway
  c.strokeStyle = '#5a5f6a';
  c.lineWidth = 3;
  c.beginPath();
  c.moveTo(...P(-205, RAIL_Z));
  c.lineTo(...P(205, RAIL_Z));
  c.stroke();
  c.setLineDash([6, 6]);
  c.strokeStyle = '#ffffff';
  c.lineWidth = 1.5;
  c.beginPath();
  c.moveTo(...P(-205, RAIL_Z));
  c.lineTo(...P(205, RAIL_Z));
  c.stroke();
  c.setLineDash([]);
  rect(STATION.platX0, STATION.platZ0, STATION.platX1, STATION.platZ1, '#c9c4ba');
  rect(STATION.x0, STATION.z0, STATION.x1, STATION.z1, '#9aa7b8');
  // breakwater
  rect(BREAKWATER.x - BREAKWATER.w / 2, BREAKWATER.z0, BREAKWATER.x + BREAKWATER.w / 2, BREAKWATER.z1, '#d8d4ca');
  // crossings
  c.fillStyle = '#e8b83a';
  for (const x of CROSSINGS) {
    const [px, pz] = P(x, RAIL_Z);
    c.beginPath();
    c.arc(px, pz, 5, 0, Math.PI * 2);
    c.fill();
  }
  // labels
  c.font = `700 15px "Zen Maru Gothic", "Hiragino Maru Gothic ProN", sans-serif`;
  c.textAlign = 'center';
  const label = (txt, x, z, col = '#273049') => {
    const [px, pz] = P(x, z);
    c.lineWidth = 4;
    c.strokeStyle = 'rgba(255,255,255,0.9)';
    c.strokeText(txt, px, pz);
    c.fillStyle = col;
    c.fillText(txt, px, pz);
  };
  label('汐見神社', SHRINE.x, SHRINE.terraceZ1 + 8, '#b9466a');
  label('桜坂', 30, -60, '#b9466a');
  label('浜通り商店街', -35, -12);
  label('ひだまり公園', (PARK.x0 + PARK.x1) / 2, (PARK.z0 + PARK.z1) / 2);
  label('桜ヶ浜駅', -35, 46);
  label('桜ヶ浜海岸', 40, 88, '#2f6fb8');
  label('防波堤', BREAKWATER.x + 18, 150, '#2f6fb8');
  label('海岸通り', 120, 66.5);
  for (const l of landmarks || []) if (l.id === 'sento') label('汐の湯', l.x, l.z + 6);
  // compass
  c.fillStyle = '#273049';
  c.font = '700 14px sans-serif';
  c.fillText('N', W - 30, 28);
  c.beginPath();
  c.moveTo(W - 30, 34);
  c.lineTo(W - 36, 50);
  c.lineTo(W - 24, 50);
  c.closePath();
  c.fill();
  // player
  if (player) {
    const [px, pz] = P(player.x, player.z);
    c.save();
    c.translate(px, pz);
    c.rotate(-player.yaw + Math.PI);
    c.fillStyle = '#e2708f';
    c.strokeStyle = '#fff';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(0, 11);
    c.lineTo(7, -7);
    c.lineTo(0, -3);
    c.lineTo(-7, -7);
    c.closePath();
    c.fill();
    c.stroke();
    c.restore();
  }
}
