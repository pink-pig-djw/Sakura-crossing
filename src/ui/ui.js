import { ROADS, roadRect, PARK, PLAZA, SHRINE, STATION, SEAWALL_Z, shoreZ, BREAKWATER, RAIL_Z, CROSSINGS, RIVER, BRIDGES, SUBWAY, SHORE, TUNNEL, STEPPING_Z, outsideDist, eastBlocks } from '../world/layout.js';
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
      this.setInputMode('touch');
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

  setInputMode(mode) {
    if (mode === this.inputMode) return;
    this.inputMode = mode;
    const k = this.el.prompt.querySelector('kbd');
    k.textContent = mode === 'pad' ? 'A' : 'E';
    k.classList.toggle('pad', mode === 'pad');
  }

  setPrompt(label) {
    if (!label) {
      this.el.prompt.hidden = true;
      return;
    }
    this.el.prompt.hidden = false;
    this.el.promptText.textContent = label;
    this.el.prompt.querySelector('kbd').hidden = this.isTouch && this.inputMode !== 'pad';
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
  const x0 = -300, x1 = 382, z0 = -182, z1 = 122;
  const sx = W / (x1 - x0), sz = H / (z1 - z0);
  const s = Math.min(sx, sz);
  const ox = (W - (x1 - x0) * s) / 2, oz = (H - (z1 - z0) * s) / 2;
  const P = (x, z) => [ox + (x - x0) * s, oz + (z - z0) * s];
  c.fillStyle = '#f4efe2';
  c.fillRect(0, 0, W, H);
  // hills (sampled from the terrain shape)
  c.fillStyle = '#cfe0b8';
  const step = 4;
  for (let z = z0; z < z1; z += step) {
    for (let x = x0; x < x1; x += step) {
      if (outsideDist(x + step / 2, z + step / 2) > 2) {
        const [px, pz] = P(x, z);
        c.fillRect(px, pz, step * s + 0.6, step * s + 0.6);
      }
    }
  }
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
  c.moveTo(...P(SHORE.x0, SEAWALL_Z));
  for (let x = SHORE.x0; x <= SHORE.x1; x += 5) {
    const [px, pz] = P(x, shoreZ(x));
    c.lineTo(px, pz);
  }
  c.lineTo(...P(SHORE.x1, SEAWALL_Z));
  c.closePath();
  c.fill();
  const rect = (a, b, d, e, col) => {
    const [ax, az] = P(a, b), [bx, bz] = P(d, e);
    c.fillStyle = col;
    c.fillRect(ax, az, bx - ax, bz - az);
  };
  // commercial district blocks
  for (const bl of eastBlocks()) rect(bl.x0, bl.z0, bl.x1, bl.z1, '#ecdcd2');
  rect(PARK.x0, PARK.z0, PARK.x1, PARK.z1, '#bcd9a0');
  rect(PLAZA.x0, PLAZA.z0, PLAZA.x1, PLAZA.z1, '#e8dcc8');
  rect(SHRINE.terraceX0, SHRINE.terraceZ1, SHRINE.terraceX1, SHRINE.terraceZ0, '#e2d8c4');
  // roads
  for (const r of ROADS) {
    const q = roadRect(r);
    const col = r.id === 'sakura' ? '#f2c4d2' : r.id === 'shotengai' ? '#f0d9b0' : r.path ? '#f6e3e9' : r.id === 'avenue' ? '#fff8ec' : '#ffffff';
    rect(q.x0, q.z0, q.x1, q.z1, col);
  }
  // river
  rect(RIVER.x - RIVER.inner, RIVER.zHead, RIVER.x + RIVER.inner, SEAWALL_Z, '#8cc4e0');
  c.fillStyle = '#8cc4e0';
  c.beginPath();
  c.moveTo(...P(RIVER.x - RIVER.inner, SEAWALL_Z));
  c.lineTo(...P(RIVER.x - RIVER.inner - 7, shoreZ(RIVER.x) + 2));
  c.lineTo(...P(RIVER.x + RIVER.inner + 7, shoreZ(RIVER.x) + 2));
  c.lineTo(...P(RIVER.x + RIVER.inner, SEAWALL_Z));
  c.fill();
  for (const b of BRIDGES) if (b.kind !== 'rail') rect(RIVER.x - RIVER.inner - 2, b.z0, RIVER.x + RIVER.inner + 2, b.z1, b.kind === 'prom' ? '#e9e2d0' : '#ffffff');
  // sakura along the river
  c.fillStyle = '#f2b6c8';
  for (let z = RIVER.zHead + 5; z < 44; z += 8.8) {
    for (const x of [RIVER.x - RIVER.inner - 1.6, RIVER.x + RIVER.inner + 1.6]) {
      const [px, pz] = P(x, z);
      c.beginPath();
      c.arc(px, pz, 3.2, 0, Math.PI * 2);
      c.fill();
    }
  }
  // promenade
  rect(SHORE.x0 + 6, 68.5, SHORE.x1 - 6, 73, '#e9e2d0');
  // railway
  c.strokeStyle = '#5a5f6a';
  c.lineWidth = 3;
  c.beginPath();
  c.moveTo(...P(TUNNEL.w, RAIL_Z));
  c.lineTo(...P(TUNNEL.e, RAIL_Z));
  c.stroke();
  c.setLineDash([6, 6]);
  c.strokeStyle = '#ffffff';
  c.lineWidth = 1.5;
  c.beginPath();
  c.moveTo(...P(TUNNEL.w, RAIL_Z));
  c.lineTo(...P(TUNNEL.e, RAIL_Z));
  c.stroke();
  c.setLineDash([]);
  rect(STATION.platX0, STATION.platZ0, STATION.platX1, STATION.platZ1, '#c9c4ba');
  rect(STATION.x0, STATION.z0, STATION.x1, STATION.z1, '#9aa7b8');
  // subway (dashed outline under the avenue) and its exits
  c.setLineDash([4, 4]);
  c.strokeStyle = '#2f6fb8';
  c.lineWidth = 1.5;
  {
    const [ax, az] = P(SUBWAY.x0, SUBWAY.z0), [bx, bz] = P(SUBWAY.x1, SUBWAY.z1);
    c.strokeRect(ax, az, bx - ax, bz - az);
  }
  c.setLineDash([]);
  for (const e of SUBWAY.exits) rect(e.x0, e.z0, e.x1, e.z1, '#2f6fb8');
  // breakwater
  rect(BREAKWATER.x - BREAKWATER.w / 2, BREAKWATER.z0, BREAKWATER.x + BREAKWATER.w / 2, BREAKWATER.z1, '#d8d4ca');
  // crossings
  c.fillStyle = '#e8b83a';
  for (const x of CROSSINGS) {
    const [px, pz] = P(x, RAIL_Z);
    c.beginPath();
    c.arc(px, pz, 4.5, 0, Math.PI * 2);
    c.fill();
  }
  // labels
  c.font = `700 14px "Zen Maru Gothic", "Hiragino Maru Gothic ProN", sans-serif`;
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
  label('桜川', RIVER.x, -70, '#2f6fb8');
  label('飛び石', RIVER.x, STEPPING_Z + 6, '#2f6fb8');
  label('西町', -192, -40);
  label('桜ヶ浜中央', 270, -70, '#8a4a3a');
  label('中央通り', 252, -100);
  label('Ⓜ 桜ヶ浜中央駅', 252, -30, '#2f6fb8');
  label('さくらモール', 274, 4, '#8a4a3a');
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
