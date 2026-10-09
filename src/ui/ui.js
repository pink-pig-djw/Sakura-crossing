import { ROADS, roadRect, PARK, PLAZA, SHRINE, STATION, SEAWALL_Z, shoreZ, BREAKWATER, RAIL_Z, CROSSINGS, RIVER, BRIDGES, SUBWAY, SHORE, TUNNEL, STEPPING_Z, outsideDist, eastBlocks } from '../world/layout.js';
import { PRESETS } from '../systems/timeofday.js';
import { tr, tf, getLang, setLang, onLang, applyStatic } from './i18n.js';

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
      minimap: $('minimap'),
      subtitle: $('subtitle'),
      subWho: $('sub-who'),
      subText: $('sub-text'),
    };
    this.subTimer = 0;
    this.minimap = new Minimap(this.el.minimap);
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
      b.dataset.ja = p.label;
      b.setAttribute('data-i18n', '');
      b.dataset.hour = p.hour;
      b.addEventListener('click', () => this.emit('time', p.hour));
      tb.appendChild(b);
    }
    $('flow').addEventListener('change', (ev) => this.emit('flow', ev.target.checked));
    $('vol-amb').addEventListener('input', (ev) => this.emit('volume', 'amb', ev.target.value / 100));
    $('vol-music').addEventListener('input', (ev) => this.emit('volume', 'music', ev.target.value / 100));
    $('sens').addEventListener('input', (ev) => this.emit('sens', ev.target.value / 100));
    $('outline-toggle').addEventListener('change', (ev) => this.emit('outlines', ev.target.checked));
    $('vol-voice').addEventListener('input', (ev) => this.emit('volume', 'voice', ev.target.value / 100));
    $('subs-toggle').addEventListener('change', (ev) => this.emit('subtitles', ev.target.checked));
    $('minimap-toggle').addEventListener('change', (ev) => this.emit('minimap', ev.target.checked));
    for (const b of document.querySelectorAll('[data-lang]')) b.addEventListener('click', () => setLang(b.dataset.lang));
    onLang(() => this._langChanged());
    applyStatic();
    this._langChanged();
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

  // language switched (or first applied): refresh everything drawn from code
  _langChanged() {
    const l = getLang();
    for (const b of document.querySelectorAll('[data-lang]')) b.classList.toggle('on', b.dataset.lang === l);
    if (this.loadLabel) this.el.loadtext.textContent = tr(this.loadLabel) + (this.loadLabel === '準備ができました' ? '' : '…');
    if (this.lastArea) this._setArea(this.lastArea);
    if (this.lastCounts) this.setCounts(this.lastCounts);
    if (this.lastMenu) this.syncMenu(this.lastMenu);
    if (this.lastLuck) this.openOmikuji(...this.lastLuck, !this.el.omikuji.hidden);
    if (this.lastSub && !this.el.subtitle.hidden) this._setSub(this.lastSub);
    if (this.mapArgs && !this.el.map.hidden) drawMap(this.el.mapCanvas, ...this.mapArgs);
    this.emit('lang', l);
  }

  setProgress(p, label) {
    if (p !== null && p !== undefined) this.el.loadbar.style.width = `${Math.round(p * 100)}%`;
    if (label) {
      this.loadLabel = label;
      this.el.loadtext.textContent = `${tr(label)}…`;
    }
  }

  ready() {
    this.loadLabel = '準備ができました';
    this.el.loadtext.textContent = tr('準備ができました');
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
    this.lastArea = a;
    this._setArea(a);
    this.el.area.classList.add('show');
    this.areaTimer = 4.5;
  }
  _setArea(a) {
    this.el.areaName.textContent = tr(a.name);
    this.el.areaSub.textContent = a.sub;
  }

  // text is Japanese (translated here) or already built with tf()
  toast(text, secs = 3.2) {
    this.el.toast.textContent = tr(text);
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
      this.promptJa = null;
      return;
    }
    this.el.prompt.hidden = false;
    if (label !== this.promptJa) {
      this.promptJa = label;
      this.el.promptText.textContent = tr(label);
    }
    this.el.prompt.querySelector('kbd').hidden = this.isTouch && this.inputMode !== 'pad';
  }

  setClock(label, period, hour) {
    this.el.clock.textContent = label;
    if (period !== this.periodJa || getLang() !== this.periodLang) {
      this.periodJa = period;
      this.periodLang = getLang();
      this.el.period.textContent = tr(period);
    }
    const icon = hour >= 5 && hour < 16.5 ? 'sun' : hour >= 16.5 && hour < 19 ? 'dusk' : 'moon';
    this.el.clockIcon.className = icon;
  }

  setCounts(c) {
    this.lastCounts = c;
    const parts = [];
    if (c.shells) parts.push(`<span>${tr('貝がら')} ${c.shells}/${c.shellsMax}</span>`);
    if (c.cats) parts.push(`<span>${tr('ねこ')} ${c.cats}/${c.catsMax}</span>`);
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
    if (this.subTimer > 0) {
      this.subTimer -= dt;
      if (this.subTimer <= 0) this.el.subtitle.hidden = true;
    }
  }

  // voice subtitle: { who, ja, zh } shown in the current language for `secs`
  subtitle(line, secs) {
    this.lastSub = line;
    this._setSub(line);
    this.el.subtitle.hidden = false;
    this.subTimer = secs;
  }
  _setSub(line) {
    this.el.subWho.textContent = tr(line.who);
    this.el.subText.textContent = getLang() === 'zh' ? line.zh : line.ja;
  }
  hideSubtitle() {
    this.el.subtitle.hidden = true;
    this.subTimer = 0;
  }

  setMinimap(on) {
    this.el.minimap.hidden = !on;
    $('minimap-toggle').checked = on;
  }

  openMenu(state) {
    this.el.menu.hidden = false;
    this.syncMenu(state);
  }
  closeMenu() {
    this.el.menu.hidden = true;
  }

  syncMenu(state) {
    this.lastMenu = state;
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
    add(tr('訪れた場所'), `${state.visited}/${state.placesMax}`);
    add(tr('なでたねこ'), `${state.cats}/${state.catsMax}`);
    add(tr('拾った貝がら'), `${state.shells}/${state.shellsMax}`);
    add(tr('買った飲み物'), tf('drinksN', { n: state.drinks }));
    add(tr('おみくじ'), tr(state.luck || 'まだ'));
    add(tr('電車を見送った'), tf('timesN', { n: state.trains }));
  }

  openOmikuji(luck, text, show = true) {
    this.lastLuck = [luck, text];
    this.el.luck.textContent = tr(luck);
    this.el.luckText.textContent = tr(text);
    if (show) this.el.omikuji.hidden = false;
  }
  closeOmikuji() {
    this.el.omikuji.hidden = true;
  }

  openMap(player, landmarks) {
    this.el.map.hidden = false;
    this.mapArgs = [player, landmarks, this.lots];
    drawMap(this.el.mapCanvas, ...this.mapArgs);
  }
  closeMap() {
    this.el.map.hidden = true;
  }
}

// ---------------------------------------------------------------------------
// Hand-drawn style town map (full map and the HUD minimap share the drawing)
// ---------------------------------------------------------------------------
const MAP = { x0: -300, x1: 382, z0: -182, z1: 122 };

const mapFont = (px) => `700 ${px}px ${getLang() === 'zh' ? '"Noto Sans SC", "PingFang SC", "Microsoft YaHei"' : '"Zen Maru Gothic", "Hiragino Maru Gothic ProN"'}, sans-serif`;

// everything but labels, compass and player; P(x, z) -> [px, py] in canvas pixels
function drawMapBase(c, W, H, P, s, lots = []) {
  c.fillStyle = '#f4efe2';
  c.fillRect(0, 0, W, H);
  // hills (sampled from the terrain shape)
  c.fillStyle = '#cfe0b8';
  const step = 4;
  for (let z = MAP.z0; z < MAP.z1; z += step) {
    for (let x = MAP.x0; x < MAP.x1; x += step) {
      if (outsideDist(x + step / 2, z + step / 2) > 2) {
        const [px, pz] = P(x, z);
        c.fillRect(px, pz, step * s + 0.6, step * s + 0.6);
      }
    }
  }
  // sea + beach
  c.beginPath();
  c.moveTo(0, H);
  for (let x = MAP.x0; x <= MAP.x1; x += 5) {
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
  // house lots
  for (const l of lots) {
    const col = l.type === 'garden' || l.type === 'field' ? '#d3e3bd' : l.type === 'parking' ? '#e4e2dc' : l.type === 'shop' || l.type === 'cornershop' ? '#efd9c4' : '#e8dccb';
    rect(l.x0 + 0.5, l.z0 + 0.5, l.x1 - 0.5, l.z1 - 0.5, col);
  }
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
      c.arc(px, pz, 2 * s, 0, Math.PI * 2);
      c.fill();
    }
  }
  // promenade
  rect(SHORE.x0 + 6, 68.5, SHORE.x1 - 6, 73, '#e9e2d0');
  // railway
  c.strokeStyle = '#5a5f6a';
  c.lineWidth = Math.max(3, 1.9 * s);
  c.beginPath();
  c.moveTo(...P(TUNNEL.w, RAIL_Z));
  c.lineTo(...P(TUNNEL.e, RAIL_Z));
  c.stroke();
  c.setLineDash([6, 6]);
  c.strokeStyle = '#ffffff';
  c.lineWidth = Math.max(1.5, 0.9 * s);
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
    c.arc(px, pz, 2.8 * s, 0, Math.PI * 2);
    c.fill();
  }
}

// place names: [japanese, x, z, color, minimap?]
function mapLabels(landmarks) {
  const L = [
    ['汐見神社', SHRINE.x, SHRINE.terraceZ1 + 8, '#b9466a', true],
    ['桜坂', 30, -60, '#b9466a', true],
    ['浜通り商店街', -35, -12, '#273049', true],
    ['ひだまり公園', (PARK.x0 + PARK.x1) / 2, (PARK.z0 + PARK.z1) / 2, '#273049', true],
    ['桜ヶ浜駅', -35, 46, '#273049', true],
    ['桜ヶ浜海岸', 40, 88, '#2f6fb8', true],
    ['防波堤', BREAKWATER.x + 18, 150, '#2f6fb8', false],
    ['海岸通り', 120, 66.5, '#273049', false],
    ['桜川', RIVER.x, -70, '#2f6fb8', true],
    ['飛び石', RIVER.x, STEPPING_Z + 6, '#2f6fb8', true],
    ['西町', -192, -40, '#273049', true],
    ['桜ヶ浜中央', 270, -70, '#8a4a3a', false],
    ['中央通り', 252, -100, '#273049', true],
    ['Ⓜ 桜ヶ浜中央駅', 252, -30, '#2f6fb8', true],
    ['さくらモール', 274, 4, '#8a4a3a', true],
  ];
  for (const l of landmarks || []) {
    if (l.id === 'sento') L.push(['汐の湯', l.x, l.z + 6, '#273049', true]);
    if (l.id === 'konbini') L.push(['さくらマート', l.x, l.z - 4, '#273049', true]);
    if (l.id === 'library') L.push(['市立図書館', l.x - 10, l.z, '#273049', true]);
    if (l.id === 'cafe2') L.push(['喫茶 さくらテラス', l.x - 6, l.z + 6, '#273049', true]);
  }
  return L;
}

function outlinedText(c, txt, x, y, col, lw = 4) {
  c.lineWidth = lw;
  c.lineJoin = 'round';
  c.strokeStyle = 'rgba(255,255,255,0.92)';
  c.strokeText(txt, x, y);
  c.fillStyle = col;
  c.fillText(txt, x, y);
}

function playerArrow(c, size = 1) {
  c.fillStyle = '#e2708f';
  c.strokeStyle = '#fff';
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(0, -11 * size);
  c.lineTo(7 * size, 7 * size);
  c.lineTo(0, 3 * size);
  c.lineTo(-7 * size, 7 * size);
  c.closePath();
  c.fill();
  c.stroke();
}

export function drawMap(canvas, player, landmarks, lots) {
  const c = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const s = Math.min(W / (MAP.x1 - MAP.x0), H / (MAP.z1 - MAP.z0));
  const ox = (W - (MAP.x1 - MAP.x0) * s) / 2, oz = (H - (MAP.z1 - MAP.z0) * s) / 2;
  const P = (x, z) => [ox + (x - MAP.x0) * s, oz + (z - MAP.z0) * s];
  drawMapBase(c, W, H, P, s, lots);
  // labels
  c.font = mapFont(14);
  c.textAlign = 'center';
  for (const [txt, x, z, col] of mapLabels(landmarks)) {
    if (txt === 'さくらマート' || txt === '市立図書館' || txt === '喫茶 さくらテラス') continue; // too small at this scale
    const [px, pz] = P(x, z);
    outlinedText(c, tr(txt), px, pz, col);
  }
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
    c.rotate(-player.yaw);
    playerArrow(c);
    c.restore();
  }
}

// Round heading-up minimap in the HUD. The town is drawn once into a large offscreen
// canvas; each update copies the area around the player, rotated so "forward" is up.
const MINI_K = 2.5; // offscreen pixels per meter
const MINI_RANGE = 70; // meters from the center to the rim

class Minimap {
  constructor(canvas) {
    this.canvas = canvas;
    this.base = null;
    this.labels = [];
    this.t = 0;
  }

  build(landmarks, lots) {
    const W = Math.ceil((MAP.x1 - MAP.x0) * MINI_K), H = Math.ceil((MAP.z1 - MAP.z0) * MINI_K);
    const off = document.createElement('canvas');
    off.width = W;
    off.height = H;
    drawMapBase(off.getContext('2d'), W, H, (x, z) => [(x - MAP.x0) * MINI_K, (z - MAP.z0) * MINI_K], MINI_K, lots);
    this.base = off;
    this.labels = mapLabels(landmarks).filter((l) => l[4]);
  }

  update(dt, player) {
    if (!this.base || this.canvas.hidden) return;
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 1 / 20;
    const cv = this.canvas;
    const css = cv.clientWidth || 168;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const N = Math.round(css * dpr);
    if (cv.width !== N) {
      cv.width = N;
      cv.height = N;
    }
    const c = cv.getContext('2d');
    const R = N / 2;
    const k = R / MINI_RANGE; // canvas pixels per meter
    c.save();
    c.clearRect(0, 0, N, N);
    c.beginPath();
    c.arc(R, R, R, 0, Math.PI * 2);
    c.clip();
    c.fillStyle = '#cfe0b8';
    c.fillRect(0, 0, N, N);
    c.translate(R, R);
    c.rotate(player.yaw);
    const sc = k / MINI_K;
    c.drawImage(this.base, (MAP.x0 - player.x) * k, (MAP.z0 - player.z) * k, this.base.width * sc, this.base.height * sc);
    c.restore();
    // labels stay upright
    const cs = Math.cos(player.yaw), sn = Math.sin(player.yaw);
    c.font = mapFont(Math.round(11 * dpr));
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    // labels in priority order; skip ones that would cover the arrow or another label
    const placed = [];
    const lh = 13 * dpr;
    for (const [txt, x, z, col] of this.labels) {
      const dx = (x - player.x) * k, dz = (z - player.z) * k;
      const px = dx * cs - dz * sn, py = dx * sn + dz * cs;
      if (px * px + py * py > (R - 14 * dpr) ** 2) continue;
      const label = tr(txt);
      const hw = c.measureText(label).width / 2 + 2 * dpr;
      const box = [R + px - hw, R + py - lh / 2, R + px + hw, R + py + lh / 2];
      if (Math.abs(px) < hw + 9 * dpr && Math.abs(py) < lh / 2 + 11 * dpr) continue;
      if (placed.some((b) => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1])) continue;
      placed.push(box);
      outlinedText(c, label, R + px, R + py, col, 3 * dpr);
    }
    // north marker on the rim
    const nx = R + Math.sin(player.yaw) * (R - 10 * dpr), ny = R - Math.cos(player.yaw) * (R - 10 * dpr);
    c.beginPath();
    c.arc(nx, ny, 8 * dpr, 0, Math.PI * 2);
    c.fillStyle = '#273049';
    c.fill();
    c.fillStyle = '#fff';
    c.font = `700 ${Math.round(10 * dpr)}px sans-serif`;
    c.fillText('N', nx, ny + 0.5);
    // player
    c.save();
    c.translate(R, R);
    playerArrow(c, 0.85 * dpr);
    c.restore();
  }
}
