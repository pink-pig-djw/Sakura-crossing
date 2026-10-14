import { BOUNDS, terrainH, ROADS, roadRect, PARK, PLAZA, SHRINE, STATION, SEAWALL_Z, shoreZ, BREAKWATER, RAIL_Z, CROSSINGS, RIVER, BRIDGES, SUBWAY, SHORE, TUNNEL, STEPPING_Z, outsideDist, eastBlocks, SCHOOL, EAST2, SEA, PIER } from '../world/layout.js';
import { ISLAND, islandH, pathPoints, PATH_W } from '../world/islandplan.js';
import { MAIN, GYM } from '../world/school.js';
import { HOSP, POST, KOBAN } from '../world/eastside.js';
import { PRESETS } from '../systems/timeofday.js';
import { route, HARBOR } from '../world/routeplan.js';
import { tr, tf, getLang, setLang, onLang, applyStatic } from './i18n.js';

const $ = (id) => document.getElementById(id);

// The controls page in the menu: per input, sections of [keys, what they do]. Keys are key
// caps on the keyboard, coloured buttons on the controller, button names on a touch screen.
const CONTROLS = {
  kb: [
    ['歩いているとき', [
      [['W', 'A', 'S', 'D'], '歩く'],
      [['マウス'], '見回す（画面をクリックして開始）'],
      [['Shift'], '走る（押しているあいだ）'],
      [['Space'], 'ジャンプ'],
      [['E', 'Enter'], 'しらべる・話しかける'],
      [['M'], '地図をひらく・とじる'],
      [['N'], 'ミニマップの表示'],
      [['V'], '視点切替'],
      [['ホイール'], 'カメラの距離'],
      [['T'], '時間帯'],
      [['R'], '雨を降らせる・やませる'],
      [['B'], '自転車に乗る・降りる'],
      [['F'], '全画面'],
      [['H'], '画面の文字を隠す（写真用）'],
      [['Esc'], 'メニュー'],
    ]],
    ['自転車に乗っているとき', [
      [['W'], 'こぐ'],
      [['S'], 'ブレーキ（止まって押し続けると後ろへ）'],
      [['A', 'D'], 'ハンドル'],
      [['Shift'], '立ちこぎ'],
      [['Q', 'E'], 'ギアを下げる・上げる'],
      [['1', '2', '3'], 'ギアをえらぶ'],
      [['Space'], 'ベル'],
      [['B'], '降りる'],
    ]],
    ['ボートに乗っているとき', [
      [['W'], '前進'],
      [['S'], '後進'],
      [['A', 'D'], 'かじ'],
      [['Shift'], '全速'],
      [['E', 'Enter'], '桟橋に着けて降りる'],
    ]],
  ],
  pad: [
    ['歩いているとき', [
      [['L'], '歩く'],
      [['R'], '見回す'],
      [['A'], 'しらべる・決定'],
      [['B'], 'もどる・立ち上がる'],
      [['X'], 'ジャンプ'],
      [['Y'], '地図をひらく'],
      [['RT'], '走る（押しているあいだ）'],
      [['LB', 'RB'], '時間帯'],
      [['⧉'], 'ミニマップの表示'],
      [['R+'], '視点切替（右スティック押し込み）'],
      [['✚↑'], '自転車に乗る・降りる'],
      [['✚↓'], '雨を降らせる・やませる'],
      [['≡'], 'メニュー'],
    ]],
    ['自転車に乗っているとき', [
      [['L'], 'こぐ・ブレーキ・ハンドル'],
      [['RT'], '立ちこぎ'],
      [['LT'], 'ブレーキ（押す強さで）'],
      [['LB', 'RB'], 'ギア'],
      [['X'], 'ベル'],
      [['B'], '降りる'],
    ]],
    ['ボートに乗っているとき', [
      [['L'], '前進・後進・かじ'],
      [['RT'], '全速'],
      [['A'], '桟橋に着けて降りる'],
    ]],
  ],
  touch: [
    ['歩いているとき', [
      [['左下のスティック'], '歩く'],
      [['右側をなぞる'], '見回す'],
      [['しらべる'], 'しらべる・話しかける'],
      [['ジャンプ'], 'ジャンプ'],
      [['走る'], '走る・歩くの切り替え'],
      [['自転車'], '自転車に乗る'],
      [['ミニマップ'], 'タップで地図をひらく'],
      [['≡'], 'メニュー'],
      [['全画面ボタン'], '全画面'],
      [['≡'], '天気（メニューの「天気」から）'],
    ]],
    ['自転車に乗っているとき', [
      [['スティック'], 'こぐ・ブレーキ・ハンドル'],
      [['ギア'], 'ギア切替'],
      [['ベル'], 'ベル'],
      [['立ちこぎ'], '立ちこぎ'],
      [['降りる'], '降りる'],
    ]],
    ['ボートに乗っているとき', [
      [['スティック'], '前進・後進・かじ'],
      [['全速'], '全速'],
      [['着ける'], '桟橋に着けて降りる'],
    ]],
  ],
};
const PAD_CLASS = { A: 'a', B: 'b', X: 'x', Y: 'y', LB: 'wide', RB: 'wide', LT: 'wide', RT: 'wide' };
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
function keyCap(kind, k) {
  if (kind === 'pad') return `<i class="pad-btn ${PAD_CLASS[k] || ''}">${esc(k)}</i>`;
  if (kind === 'touch') return `<b class="tkey">${esc(tr(k))}</b>`;
  return `<kbd>${esc(tr(k))}</kbd>`;
}

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
    // the minimap is also a way in to the big map (a click with the mouse free, a tap)
    e.minimap.addEventListener('click', () => this.emit('map'));
    for (const b of document.querySelectorAll('#controls-tabs button')) b.addEventListener('click', () => this.showControls(b.dataset.ctl));
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
    for (const b of document.querySelectorAll('#weather-buttons button')) b.addEventListener('click', () => this.emit('weather', b.dataset.weather));
    $('weather-auto').addEventListener('change', (ev) => this.emit('weatherAuto', ev.target.checked));
    $('vol-amb').addEventListener('input', (ev) => this.emit('volume', 'amb', ev.target.value / 100));
    $('vol-music').addEventListener('input', (ev) => this.emit('volume', 'music', ev.target.value / 100));
    $('sens').addEventListener('input', (ev) => this.emit('sens', ev.target.value / 100));
    $('outline-toggle').addEventListener('change', (ev) => this.emit('outlines', ev.target.checked));
    $('vol-voice').addEventListener('input', (ev) => this.emit('volume', 'voice', ev.target.value / 100));
    $('subs-toggle').addEventListener('change', (ev) => this.emit('subtitles', ev.target.checked));
    $('minimap-toggle').addEventListener('change', (ev) => this.emit('minimap', ev.target.checked));
    $('view-toggle').addEventListener('change', (ev) => this.emit('view', ev.target.checked));
    $('fs-toggle').addEventListener('change', (ev) => this.emit('fullscreen', ev.target.checked));
    $('fs-btn').addEventListener('click', () => this.emit('fullscreen'));
    $('fs-title').addEventListener('click', () => this.emit('fullscreen'));
    for (const b of document.querySelectorAll('[data-lang]')) b.addEventListener('click', () => setLang(b.dataset.lang));
    onLang(() => this._langChanged());
    applyStatic();
    this._langChanged();
    for (const b of document.querySelectorAll('#quality-buttons button')) b.addEventListener('click', () => this.emit('quality', b.dataset.q));
    for (const b of document.querySelectorAll('#outfit-buttons button')) b.addEventListener('click', () => this.emit('outfit', +b.dataset.outfit));
    for (const b of document.querySelectorAll('#bike-color-buttons button')) b.addEventListener('click', () => this.emit('bikeColor', +b.dataset.bikeColor));
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
    $('t-bike').addEventListener('click', () => this.emit('bike'));
    $('t-gear').addEventListener('click', () => this.emit('gear'));
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
    this.bikeGear = -1; // the touch gear button's label is drawn again
    if (this.fsOn !== undefined) this.setFullscreen(this.fsOn);
    this.el.minimap.title = tr('クリックで地図をひらく');
    if (this.ctlKind) this.showControls(this.ctlKind);
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

  // fullscreen buttons (HUD, title, menu) where the browser can do it; on an iPhone the menu
  // explains the home-screen way instead
  initFullscreen(supported, iphone) {
    this.fsSupported = supported;
    for (const id of ['fs-btn', 'fs-title', 'fs-row']) $(id).hidden = !supported;
    $('fs-note').hidden = supported || !iphone;
  }
  setFullscreen(on) {
    this.fsOn = on;
    for (const id of ['fs-btn', 'fs-title']) {
      const b = $(id);
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
      b.title = `${tr(on ? '全画面を終了' : '全画面')} (F)`;
    }
    $('fs-btn').setAttribute('aria-label', tr('全画面'));
    $('fs-toggle').checked = on;
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

  // the umbrella by the clock while it rains
  setRain(on) {
    if (on === this.rainOn) return;
    this.rainOn = on;
    $('rain-icon').toggleAttribute('hidden', !on);
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

  setView(v) {
    $('view-toggle').checked = v === 'third';
  }

  setOutfit(i) {
    for (const b of document.querySelectorAll('#outfit-buttons button')) b.classList.toggle('on', +b.dataset.outfit === i);
  }

  setBikeColor(i) {
    for (const b of document.querySelectorAll('#bike-color-buttons button')) b.classList.toggle('on', +b.dataset.bikeColor === i);
  }

  // on the bicycle: { gear (0..2), kmh, standing } shows the gear and speed chip (and the
  // touch buttons turn into the bell, standing up, the gears and getting off); null hides it
  // the lap timer chip while a lap of the cycling loop is on: time and places passed
  setLap(l) {
    const chip = $('lap-chip');
    if (!l) {
      if (!chip.hidden) chip.hidden = true;
      return;
    }
    if (chip.hidden) chip.hidden = false;
    if (l.t !== this.lapT) {
      this.lapT = l.t;
      $('lap-time').textContent = l.t;
    }
    const cp = `${l.n}/${l.of}`;
    if (cp !== this.lapCp) {
      this.lapCp = cp;
      $('lap-cp').textContent = cp;
    }
  }

  setBike(b) {
    const chip = $('bike-chip');
    const on = !!b;
    if (on !== this.bikeOn) {
      this.bikeOn = on;
      chip.hidden = !on;
      const label = (id, ja) => {
        const el = $(id);
        el.dataset.ja = ja;
        el.textContent = tr(ja);
      };
      label('t-jump', on ? 'ベル' : 'ジャンプ');
      label('t-run', on ? '立ちこぎ' : '走る');
      label('t-bike', on ? '降りる' : '自転車');
      $('t-gear').hidden = !on;
      $('t-act').hidden = on;
    }
    if (!on) return;
    if (b.gear !== this.bikeGear) {
      this.bikeGear = b.gear;
      [...$('bike-gears').children].forEach((el, k) => el.classList.toggle('on', k === b.gear));
      const g = $('t-gear');
      g.dataset.ja = `ギア ${b.gear + 1}`;
      g.textContent = `${tr('ギア')} ${b.gear + 1}`;
    }
    const kmh = Math.round(b.kmh);
    if (kmh !== this.bikeKmh) {
      this.bikeKmh = kmh;
      $('bike-kmh').textContent = String(kmh);
    }
    chip.classList.toggle('standing', !!b.standing);
  }

  // in the boat: { kmh, throttle (-1..1), full } shows the throttle and speed chip (and the
  // touch buttons turn into full ahead and coming alongside); null hides it
  setBoat(b) {
    const chip = $('boat-chip');
    const on = !!b;
    if (on !== this.boatOn) {
      this.boatOn = on;
      chip.hidden = !on;
      const label = (id, ja) => {
        const el = $(id);
        el.dataset.ja = ja;
        el.textContent = tr(ja);
      };
      label('t-run', on ? '全速' : '走る');
      label('t-act', on ? '着ける' : 'しらべる');
      $('t-jump').hidden = on;
      $('t-bike').hidden = on;
    }
    if (!on) return;
    const th = Math.round(b.throttle * 20) / 20;
    if (th !== this.boatTh) {
      this.boatTh = th;
      const bar = $('boat-throttle');
      const i = bar.firstElementChild;
      i.style.width = `${Math.abs(th) * 50}%`;
      i.style.left = th >= 0 ? '50%' : `${50 - Math.abs(th) * 50}%`;
      bar.classList.toggle('astern', th < 0);
    }
    const kmh = Math.round(b.kmh);
    if (kmh !== this.boatKmh) {
      this.boatKmh = kmh;
      $('boat-kmh').textContent = String(kmh);
    }
    chip.classList.toggle('full', !!b.full);
  }

  openMenu(state) {
    this.el.menu.hidden = false;
    this.syncMenu(state);
    // the controls page opens on the way you are playing
    this.showControls(this.inputMode === 'pad' ? 'pad' : this.inputMode === 'touch' || (!this.inputMode && this.isTouch) ? 'touch' : 'kb');
  }

  showControls(kind) {
    this.ctlKind = kind;
    for (const b of document.querySelectorAll('#controls-tabs button')) {
      b.classList.toggle('on', b.dataset.ctl === kind);
      b.setAttribute('aria-pressed', String(b.dataset.ctl === kind));
    }
    $('controls-list').innerHTML = CONTROLS[kind]
      .map(([head, rows]) => `<section class="ctl-sec"><h4>${esc(tr(head))}</h4><ul>${rows.filter(([, what]) => this.fsSupported || what !== '全画面').map(([keys, what]) => `<li><span class="keys">${keys.map((k) => keyCap(kind, k)).join('')}</span><span class="what">${esc(tr(what))}</span></li>`).join('')}</ul></section>`)
      .join('');
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
    for (const b of document.querySelectorAll('#weather-buttons button')) {
      const on = (b.dataset.weather === 'rain') === !!state.raining;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    }
    $('weather-auto').checked = !!state.weatherAuto;
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
    add(tr('さくら一周ライン ベスト'), state.lapBest ?? tr('まだ'));
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
// (the whole world you can walk in: the capes, the harbour and the breakwater reach far south)
const MAP = { ...BOUNDS };

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
  // the headlands either side reach out into the sea (the cape with its lighthouse, the mikan
  // hill), and the harbour's quay at the foot of the east one
  // (in 1 m cells: a coastline, not a staircase)
  for (let z = SEAWALL_Z - 14; z < MAP.z1; z += 1) {
    for (let x = MAP.x0; x < MAP.x1; x += 1) {
      const mx = x + 0.5, mz = z + 0.5;
      const quay = mx > HARBOR.x0 && mx < HARBOR.x1 && mz > HARBOR.z0 && mz < HARBOR.quay;
      if (!quay && mx > SHORE.x0 && mx < SHORE.x1) continue;
      if (terrainH(mx, mz) < 0.4) continue;
      c.fillStyle = quay ? '#e3ded2' : '#cfe0b8';
      const [px, pz] = P(x, z);
      c.fillRect(px, pz, s + 0.6, s + 0.6);
    }
  }
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
  // 東町: the high school (campus, the ground up the steps with its track), the hospital
  // and its car park, the post office and the police box
  rect(SCHOOL.x0, SCHOOL.z0, SCHOOL.x1, SCHOOL.z1, '#e6e1d2');
  rect(SCHOOL.x0 + 2, SCHOOL.z0 + 2, SCHOOL.x1 - 2, SCHOOL.wall[0], '#ead6b0');
  {
    const cz = (SCHOOL.z0 + SCHOOL.wall[0]) / 2, half = 26, r = 17.4;
    const [ax, az] = P(403 - half, cz - r), [bx] = P(403 + half, cz), rr = r * s;
    c.strokeStyle = '#ffffff';
    c.lineWidth = Math.max(1.2, 1.4 * s);
    c.beginPath();
    c.moveTo(ax, az);
    c.lineTo(bx, az);
    c.arc(bx, az + rr, rr, -Math.PI / 2, Math.PI / 2);
    c.lineTo(ax, az + 2 * rr);
    c.arc(ax, az + rr, rr, Math.PI / 2, (3 * Math.PI) / 2);
    c.stroke();
  }
  rect(MAIN.x0, MAIN.z0, MAIN.x1, MAIN.z1, '#c3cbd4');
  rect(GYM.x0, GYM.z0, GYM.x1, GYM.z1, '#b9c6cf');
  rect(EAST2.southW.x0, EAST2.southW.z0, EAST2.southW.x1, EAST2.southW.z1, '#e2e0da');
  rect(HOSP.x0, HOSP.z0, HOSP.x1, HOSP.z1, '#cfe3e0');
  rect(POST.x0, POST.z0, POST.x1, POST.z1, '#f1d2c8');
  rect(KOBAN.x0, KOBAN.z0, KOBAN.x1, KOBAN.z1, '#d3d9e8');
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
  // breakwater, and the pier out from the beach (its T-head at the end)
  rect(BREAKWATER.x - BREAKWATER.w / 2, BREAKWATER.z0, BREAKWATER.x + BREAKWATER.w / 2, BREAKWATER.z1, '#d8d4ca');
  rect(PIER.x - PIER.half, PIER.z0, PIER.x + PIER.half, PIER.z1, '#c9a882');
  rect(PIER.x - PIER.head, PIER.z1, PIER.x + PIER.headE, PIER.z2, '#c9a882');
  // crossings
  c.fillStyle = '#e8b83a';
  for (const x of CROSSINGS) {
    const [px, pz] = P(x, RAIL_Z);
    c.beginPath();
    c.arc(px, pz, 2.8 * s, 0, Math.PI * 2);
    c.fill();
  }
  drawRoute(c, P, s);
}

// さくら一周ライン: the loop in coral on a white casing, the river spine lighter and dashed
function drawRoute(c, P, s) {
  const legs = route().legs;
  const path = (leg) => {
    c.beginPath();
    leg.samples.forEach((o, i) => (i ? c.lineTo(...P(o.x, o.z)) : c.moveTo(...P(o.x, o.z))));
  };
  c.lineCap = 'round';
  c.lineJoin = 'round';
  for (const pass of [0, 1]) {
    for (const leg of legs) {
      path(leg);
      if (pass === 0) {
        c.strokeStyle = 'rgba(255,255,255,0.95)';
        c.lineWidth = Math.max(4, 3.4 * s);
        c.setLineDash([]);
      } else {
        c.strokeStyle = leg.spine ? '#5fa8d8' : '#f0647e';
        c.lineWidth = Math.max(2, 1.7 * s);
        c.setLineDash(leg.spine ? [Math.max(4, 3 * s), Math.max(3, 2.2 * s)] : []);
      }
      c.stroke();
    }
  }
  c.setLineDash([]);
  // the cycle station at the river mouth
  const [px, pz] = P(214, 70.75);
  c.beginPath();
  c.arc(px, pz, Math.max(5, 4 * s), 0, Math.PI * 2);
  c.fillStyle = '#ffffff';
  c.fill();
  c.lineWidth = Math.max(2, 1.4 * s);
  c.strokeStyle = '#f0647e';
  c.stroke();
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
    ['さくら桟橋', PIER.x + 16, 122, '#2f6fb8', true],
    ['防波堤', BREAKWATER.x + 18, 150, '#2f6fb8', false],
    ['海岸通り', 120, 66.5, '#273049', false],
    ['桜川', RIVER.x, -70, '#2f6fb8', true],
    ['飛び石', RIVER.x, STEPPING_Z + 6, '#2f6fb8', true],
    ['西町', -192, -40, '#273049', true],
    ['桜ヶ浜中央', 270, -70, '#8a4a3a', false],
    ['中央通り', 252, -100, '#273049', true],
    ['Ⓜ 桜ヶ浜中央駅', 252, -30, '#2f6fb8', true],
    ['さくらモール', 274, 4, '#8a4a3a', true],
    ['桜ヶ浜高校', (MAIN.x0 + MAIN.x1) / 2, MAIN.z1 + 6, '#273049', true],
    ['グラウンド', 403, (SCHOOL.z0 + SCHOOL.wall[0]) / 2, '#8a6a3a', false],
    ['体育館', (GYM.x0 + GYM.x1) / 2, (GYM.z0 + GYM.z1) / 2, '#273049', false],
    ['総合病院', (HOSP.x0 + HOSP.x1) / 2, (HOSP.z0 + HOSP.z1) / 2, '#2f8a66', true],
    ['郵便局', (POST.x0 + POST.x1) / 2, (POST.z0 + POST.z1) / 2, '#c0392b', true],
    ['交番', KOBAN.x0 - 6, KOBAN.z1 + 2, '#273049', false],
    ['東町', 445, 36, '#273049', true],
    // さくら一周ライン
    ['サイクルステーション', 214, 80, '#d24a66', true],
    ['漁港', 528, 118, '#2f6fb8', true],
    ['みかん畑', 600, 48, '#c56a1a', true],
    ['風車の丘', 420, -214, '#4a7a3a', true],
    ['源流の森', 290, -150, '#3f6b48', true],
    ['沢の橋', 182, -160, '#2f6fb8', true],
    ['茶畑', 112, -200, '#4a7a3a', true],
    ['千本鳥居', 30, -188, '#c0392b', true],
    ['棚田', -104, -205, '#4a7a3a', true],
    ['竹林', -238, -100, '#3f6b48', true],
    ['素掘りトンネル', -334, 24, '#5a4a3a', false],
    ['岬の灯台', -362, 120, '#2f6fb8', true],
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
  if (player?.sea) {
    drawChart(canvas, player);
    return;
  }
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
  // the moored boat, and her
  if (player?.boat) boatGlyph(c, ...P(player.boat.x, player.boat.z), 0.9);
  if (player) {
    const [px, pz] = P(player.x, player.z);
    c.save();
    c.translate(px, pz);
    c.rotate(-player.yaw);
    playerArrow(c);
    c.restore();
  }
}

// a little bicycle on a white disc (the parked bike on the minimap)
function bikeGlyph(c, x, y, s) {
  c.save();
  c.translate(x, y);
  c.scale(s, s);
  c.beginPath();
  c.arc(0, 0, 10, 0, Math.PI * 2);
  c.fillStyle = 'rgba(255,252,246,0.95)';
  c.fill();
  c.lineWidth = 1.5;
  c.strokeStyle = '#e2708f';
  c.stroke();
  c.strokeStyle = '#273049';
  c.lineWidth = 1.4;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.beginPath();
  c.arc(-4.5, 2.5, 3, 0, Math.PI * 2);
  c.moveTo(7.5, 2.5);
  c.arc(4.5, 2.5, 3, 0, Math.PI * 2);
  c.moveTo(-4.5, 2.5);
  c.lineTo(-1.5, -2.5);
  c.lineTo(3, -2.5);
  c.lineTo(4.5, 2.5);
  c.moveTo(-0.5, 2.5);
  c.lineTo(-1.8, -3.6);
  c.moveTo(-0.5, 2.5);
  c.lineTo(3, -2.5);
  c.stroke();
  c.restore();
}

// a little boat on a white disc (the moored boat on the minimap and the map)
function boatGlyph(c, x, y, s) {
  c.save();
  c.translate(x, y);
  c.scale(s, s);
  c.beginPath();
  c.arc(0, 0, 10, 0, Math.PI * 2);
  c.fillStyle = 'rgba(255,252,246,0.95)';
  c.fill();
  c.lineWidth = 1.5;
  c.strokeStyle = '#2f6fb8';
  c.stroke();
  // the hull from the side, the outboard at the stern, the lantern on its pole
  c.lineJoin = 'round';
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(-6.5, 0.5);
  c.lineTo(7, 0.5);
  c.lineTo(4.5, 4.2);
  c.lineTo(-5.2, 4.2);
  c.closePath();
  c.fillStyle = '#c86a3e';
  c.fill();
  c.strokeStyle = '#273049';
  c.lineWidth = 1.2;
  c.stroke();
  c.beginPath();
  c.moveTo(-6.2, 0.5);
  c.lineTo(-7, -3);
  c.moveTo(2.5, 0.5);
  c.lineTo(2.5, -5);
  c.stroke();
  c.fillStyle = '#f2b13a';
  c.fillRect(1.6, -7.2, 1.8, 2);
  c.restore();
}

// ---------------------------------------------------------------------------
// The sea chart: the bay from the cape to beyond 凪ノ島, out to the edge of the open water (a
// dashed line), with the places to tie up. The big map while she is out on the water or on
// the island, and under the minimap (which looks further about out there)
// ---------------------------------------------------------------------------
const CHART = { x0: SEA.x0 - 80, x1: SEA.x1 + 80, z0: -200, z1: SEA.z1 + 80 };
const CHART_K = 0.6; // offscreen pixels per metre
const MINI_SEA = 240; // the minimap's reach out on the water (m)
let townBase = null; // the town as the minimap draws it (MINI_K px/m over MAP)
let chartBase = null, isleBase = null;
let berthMarks = []; // [name, x, z] of the places the boat can tie up
const inMap = (x, z) => x > MAP.x0 && x < MAP.x1 && z > MAP.z0 && z < MAP.z1;

// the coast beyond the town: the headlands and the hills behind them, in cells
function drawCoast(c, P, s) {
  const cell = 3;
  for (let z = CHART.z0; z < 280; z += cell) {
    for (let x = CHART.x0; x < CHART.x1; x += cell) {
      const mx = x + cell / 2, mz = z + cell / 2;
      if (inMap(mx, mz)) continue;
      const h = terrainH(mx, mz);
      if (h < 0.3) continue;
      c.fillStyle = h < 2 && mz > SEAWALL_Z ? '#efe0bc' : '#cfe0b8';
      const [px, pz] = P(x, z);
      c.fillRect(px, pz, cell * s + 0.6, cell * s + 0.6);
    }
  }
}

// the island: its shore, the harbour's apron and the village, the breakwater arm, the path up
// and the lighthouse on the top
function drawIsle(c, P, s) {
  const I = ISLAND, cell = s >= 2 ? 1 : 2;
  for (let z = I.z0; z < I.z1; z += cell) {
    for (let x = I.x0; x < I.x1; x += cell) {
      const mx = x + cell / 2, mz = z + cell / 2, h = islandH(mx, mz);
      if (h === null || h < 0.25) continue;
      const u = mx - I.x, w = mz - I.z;
      const apron = u > I.quay.u0 && u < I.quay.u1 && w > I.quay.w && w < I.quay.w + I.quay.back;
      const village = u > I.village.u0 && u < I.village.u1 && w > I.village.w0 && w < I.village.w1;
      c.fillStyle = apron ? '#e3ded2' : village ? '#e8dccb' : h < 1.1 ? '#efe0bc' : '#cfe0b8';
      const [px, pz] = P(x, z);
      c.fillRect(px, pz, cell * s + 0.6, cell * s + 0.6);
    }
  }
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.strokeStyle = '#d8d4ca';
  c.lineWidth = Math.max(1.5, 4 * s);
  c.beginPath();
  I.mole.forEach(([u, w], i) => (i ? c.lineTo(...P(I.x + u, I.z + w)) : c.moveTo(...P(I.x + u, I.z + w))));
  c.stroke();
  c.strokeStyle = '#f6e3e9';
  c.lineWidth = Math.max(1.2, PATH_W * s);
  c.beginPath();
  pathPoints().forEach((p, i) => (i ? c.lineTo(...P(p.x, p.z)) : c.moveTo(...P(p.x, p.z))));
  c.stroke();
  const [lx, lz] = P(I.x + I.top.u + 2.5, I.z + I.top.w + 5.5);
  c.beginPath();
  c.arc(lx, lz, Math.max(2.5, 2.2 * s), 0, Math.PI * 2);
  c.fillStyle = '#ffffff';
  c.fill();
  c.lineWidth = Math.max(1, 0.8 * s);
  c.strokeStyle = '#c0392b';
  c.stroke();
}

// the edge of the open water, dashed: out along the west side, round the far corners, back
// along the east
function seaLine(c, P, s) {
  const { x0, x1, z1, r } = SEA;
  c.save();
  c.setLineDash([Math.max(4, 14 * s), Math.max(3, 10 * s)]);
  c.strokeStyle = 'rgba(47,111,184,0.7)';
  c.lineWidth = Math.max(1.2, 3 * s);
  c.beginPath();
  c.moveTo(...P(x0, 200));
  c.lineTo(...P(x0, z1 - r));
  const [ax, az] = P(x0 + r, z1 - r);
  c.arc(ax, az, r * s, Math.PI, Math.PI / 2, true);
  c.lineTo(...P(x1 - r, z1));
  const [bx, bz] = P(x1 - r, z1 - r);
  c.arc(bx, bz, r * s, Math.PI / 2, 0, true);
  c.lineTo(...P(x1, 200));
  c.stroke();
  c.restore();
}

// an anchor on a white disc: a place to tie up
function anchorGlyph(c, x, y, r) {
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fillStyle = 'rgba(255,252,246,0.95)';
  c.fill();
  c.lineWidth = Math.max(1, r * 0.16);
  c.strokeStyle = '#2f6fb8';
  c.stroke();
  c.lineCap = 'round';
  c.beginPath();
  c.arc(x, y - r * 0.5, r * 0.14, 0, Math.PI * 2);
  c.moveTo(x, y - r * 0.36);
  c.lineTo(x, y + r * 0.55);
  c.moveTo(x - r * 0.3, y - r * 0.18);
  c.lineTo(x + r * 0.3, y - r * 0.18);
  c.moveTo(x - r * 0.5, y + r * 0.1);
  c.quadraticCurveTo(x - r * 0.45, y + r * 0.6, x, y + r * 0.58);
  c.quadraticCurveTo(x + r * 0.45, y + r * 0.6, x + r * 0.5, y + r * 0.1);
  c.stroke();
}

// the sea chart's image (made once): the sea, the coast, the town as on the town map, the
// island, the edge of the open water
function chartImage() {
  if (chartBase) return chartBase;
  const W = Math.ceil((CHART.x1 - CHART.x0) * CHART_K), H = Math.ceil((CHART.z1 - CHART.z0) * CHART_K);
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const c = cv.getContext('2d');
  const P = (x, z) => [(x - CHART.x0) * CHART_K, (z - CHART.z0) * CHART_K];
  c.fillStyle = '#a9d4ea';
  c.fillRect(0, 0, W, H);
  drawCoast(c, P, CHART_K);
  if (townBase) c.drawImage(townBase, ...P(MAP.x0, MAP.z0), (MAP.x1 - MAP.x0) * CHART_K, (MAP.z1 - MAP.z0) * CHART_K);
  drawIsle(c, P, CHART_K);
  seaLine(c, P, CHART_K);
  chartBase = cv;
  return cv;
}
// the island in the minimap's detail, over the chart when she is near it
function isleImage() {
  if (isleBase) return isleBase;
  const I = ISLAND, cv = document.createElement('canvas');
  cv.width = Math.ceil((I.x1 - I.x0) * MINI_K);
  cv.height = Math.ceil((I.z1 - I.z0) * MINI_K);
  drawIsle(cv.getContext('2d'), (x, z) => [(x - I.x0) * MINI_K, (z - I.z0) * MINI_K], MINI_K);
  isleBase = cv;
  return cv;
}

// place names on the chart: [japanese, x, z, color] (the island is named by its landing)
const CHART_LABELS = [
  ['桜ヶ浜', 130, -60, '#273049'],
  ['岬の灯台', -362, 130, '#2f6fb8'],
  ['外洋', (SEA.x0 + SEA.x1) / 2, SEA.z1 + 46, '#2f6fb8'],
];

function drawChart(canvas, player) {
  const c = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const s = Math.min(W / (CHART.x1 - CHART.x0), H / (CHART.z1 - CHART.z0));
  const ox = (W - (CHART.x1 - CHART.x0) * s) / 2, oz = (H - (CHART.z1 - CHART.z0) * s) / 2;
  const P = (x, z) => [ox + (x - CHART.x0) * s, oz + (z - CHART.z0) * s];
  c.fillStyle = '#a9d4ea';
  c.fillRect(0, 0, W, H);
  c.drawImage(chartImage(), ox, oz, (CHART.x1 - CHART.x0) * s, (CHART.z1 - CHART.z0) * s);
  c.font = mapFont(14);
  c.textAlign = 'center';
  c.textBaseline = 'alphabetic';
  for (const [txt, x, z, col] of CHART_LABELS) outlinedText(c, tr(txt), ...P(x, z), col);
  // the places to tie up
  c.font = mapFont(12);
  for (const [name, x, z] of berthMarks) {
    const [px, pz] = P(x, z);
    anchorGlyph(c, px, pz, 7);
    outlinedText(c, tr(name), px, pz + 21, '#2f6fb8', 3);
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
  if (player.boat) boatGlyph(c, ...P(player.boat.x, player.boat.z), 0.8);
  const [px, pz] = P(player.x, player.z);
  c.save();
  c.translate(px, pz);
  c.rotate(-player.yaw);
  playerArrow(c, 0.9);
  c.restore();
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

  build(landmarks, lots, berths = []) {
    const W = Math.ceil((MAP.x1 - MAP.x0) * MINI_K), H = Math.ceil((MAP.z1 - MAP.z0) * MINI_K);
    const off = document.createElement('canvas');
    off.width = W;
    off.height = H;
    drawMapBase(off.getContext('2d'), W, H, (x, z) => [(x - MAP.x0) * MINI_K, (z - MAP.z0) * MINI_K], MINI_K, lots);
    this.base = off;
    townBase = off;
    this.labels = mapLabels(landmarks).filter((l) => l[4]);
    berthMarks = berths.map((b) => [b.name, b.x, b.z]);
    // (the sea chart and the island are drawn a little later, while the title is up)
    setTimeout(() => {
      chartImage();
      isleImage();
    }, 2500);
    this.range = MINI_RANGE;
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
    // out on the water it looks further about (easing out and back)
    this.range += ((player.sea ? MINI_SEA : MINI_RANGE) - this.range) * 0.12;
    const range = this.range;
    const k = R / range; // canvas pixels per meter
    // (the sea chart under the town where the view reaches past it, the island over it there)
    const past = player.x - range < MAP.x0 || player.x + range > MAP.x1 || player.z - range < MAP.z0 || player.z + range > MAP.z1;
    const chart = past ? chartBase : null;
    const I = ISLAND;
    const isle = isleBase && player.x + range > I.x0 && player.x - range < I.x1 && player.z + range > I.z0 && player.z - range < I.z1 ? isleBase : null;
    c.save();
    c.clearRect(0, 0, N, N);
    c.beginPath();
    c.arc(R, R, R, 0, Math.PI * 2);
    c.clip();
    c.fillStyle = chart || !inMap(player.x, player.z) ? '#a9d4ea' : '#cfe0b8';
    c.fillRect(0, 0, N, N);
    c.translate(R, R);
    c.rotate(player.yaw);
    if (chart) c.drawImage(chart, (CHART.x0 - player.x) * k, (CHART.z0 - player.z) * k, (chart.width * k) / CHART_K, (chart.height * k) / CHART_K);
    const sc = k / MINI_K;
    if (player.x - range < MAP.x1 && player.x + range > MAP.x0 && player.z - range < MAP.z1 && player.z + range > MAP.z0) {
      c.drawImage(this.base, (MAP.x0 - player.x) * k, (MAP.z0 - player.z) * k, this.base.width * sc, this.base.height * sc);
    }
    if (isle) c.drawImage(isle, (I.x0 - player.x) * k, (I.z0 - player.z) * k, isle.width * sc, isle.height * sc);
    c.restore();
    // labels stay upright
    const cs = Math.cos(player.yaw), sn = Math.sin(player.yaw);
    c.font = mapFont(Math.round(11 * dpr));
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    // labels in priority order; skip ones that would cover the arrow or another label
    const placed = [];
    const lh = 13 * dpr;
    // (the places to tie up, out on the water)
    const pin = (x, z) => {
      const dx = (x - player.x) * k, dz = (z - player.z) * k;
      return [dx * cs - dz * sn, dx * sn + dz * cs];
    };
    if (range > 110) {
      for (const [, x, z] of berthMarks) {
        const [px, py] = pin(x, z);
        if (px * px + py * py < (R - 10 * dpr) ** 2) anchorGlyph(c, R + px, R + py, 5.5 * dpr);
      }
    }
    const labels = range > 110 ? [...CHART_LABELS, ...berthMarks.map(([n, x, z]) => [n, x, z + 30, '#2f6fb8'])] : this.labels;
    for (const [txt, x, z, col] of labels) {
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
    // the moored boat (pinned to the rim when out of range)
    if (player.boat) {
      let [px, py] = pin(player.boat.x, player.boat.z);
      const d = Math.hypot(px, py), lim = R - 13 * dpr;
      if (d > lim) {
        px *= lim / d;
        py *= lim / d;
      }
      boatGlyph(c, R + px, R + py, 0.85 * dpr);
    }
    // the parked bicycle (pinned to the rim when out of range)
    if (player.bike) {
      const dx = (player.bike.x - player.x) * k, dz = (player.bike.z - player.z) * k;
      let px = dx * cs - dz * sn, py = dx * sn + dz * cs;
      const d = Math.hypot(px, py), lim = R - 13 * dpr;
      if (d > lim) {
        px *= lim / d;
        py *= lim / d;
      }
      bikeGlyph(c, R + px, R + py, 0.9 * dpr);
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
