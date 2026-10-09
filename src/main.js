import './style.css';
import * as THREE from 'three';
import { SunLight } from 'three/addons/lights/SunLight.js';
import { G } from './render/materials.js';
import { AUDIT } from './core/builder.js';
import { createSky } from './render/sky.js';
import { createClouds } from './render/clouds.js';
import { Pipeline } from './render/pipeline.js';
import { TimeOfDay, PRESETS } from './systems/timeofday.js';
import { Player } from './systems/player.js';
import { AudioEngine } from './systems/audio.js';
import { buildWorld } from './world/world.js';
import { updateCrossings } from './world/railway.js';
import { createPetals, createCats, createBirds, createShells, createSmallAnimations, createTraffic } from './world/life.js';
import { areaAt, AREAS, shoreZ, STATION, groundH, RIVER, WEIRS, SUBWAY } from './world/layout.js';
import { walkState } from './world/commercial.js';
import { UI } from './ui/ui.js';
import { tr, tf, setLang } from './ui/i18n.js';
import { VoiceSystem } from './systems/voice.js';
import { TownVoices } from './systems/townVoices.js';
import { createResidents } from './world/residents.js';
import { createAvatar } from './systems/avatar.js';
import { VOICE_CREDITS } from './systems/voiceLines.js';
import { GamepadInput, moveFocus, activateFocused, focusEl } from './systems/gamepad.js';

const params = new URLSearchParams(location.search);
const debug = params.has('cam') || params.has('still');

// ---------------------------------------------------------------------------
// renderer / scene
// ---------------------------------------------------------------------------
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.info.autoReset = false;

const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
const QUALITY = {
  low: { ratio: 0.8, maxRatio: 1, msaa: 0, shadow: 1024, petals: 1800 },
  medium: { ratio: 1, maxRatio: 1.25, msaa: 4, shadow: 2048, petals: 3800 },
  high: { ratio: 1, maxRatio: 1.75, msaa: 4, shadow: 2048, petals: 5200 },
};
let quality = isTouch ? 'low' : 'medium';
try {
  const saved = localStorage.getItem('sakura-quality');
  if (saved && QUALITY[saved]) quality = saved;
} catch {
  /* storage unavailable */
}
if (QUALITY[params.get('q')]) quality = params.get('q');

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 5000);
camera.rotation.order = 'YXZ';

const sun = new SunLight(0xffffff, 1);
sun.castShadow = true;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 220;
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.04;
sun.shadow.radius = 1.5;
scene.add(sun);

const tod = new TimeOfDay(sun);
tod.setHour(params.has('t') ? parseFloat(params.get('t')) : 10.4);
scene.add(createSky());
const clouds = createClouds();
scene.add(clouds);

const pipe = new Pipeline(renderer, { msaa: QUALITY[quality].msaa });
let petals = null;

function applyQuality(q) {
  quality = q;
  const Q = QUALITY[q];
  const ratio = Math.min(devicePixelRatio * Q.ratio, Q.maxRatio);
  renderer.setPixelRatio(ratio);
  renderer.setSize(innerWidth, innerHeight, false);
  pipe.msaa = Q.msaa;
  pipe.width = 0;
  pipe.setSize(innerWidth, innerHeight, ratio);
  if (sun.shadow.mapSize.x !== Q.shadow) {
    sun.shadow.mapSize.set(Q.shadow, Q.shadow);
    if (sun.shadow.map) {
      sun.shadow.map.dispose();
      sun.shadow.map = null;
    }
  }
  if (petals) petals.geometry.instanceCount = Math.min(Q.petals, petals.userData.max);
  try {
    localStorage.setItem('sakura-quality', q);
  } catch {
    /* storage unavailable */
  }
}
applyQuality(quality);

// ---------------------------------------------------------------------------
// UI + build world
// ---------------------------------------------------------------------------
const ui = new UI();
const audio = new AudioEngine();
const voice = new VoiceSystem(audio, ui);
document.getElementById('voice-credits').textContent = VOICE_CREDITS.join(' / ');
const pad = new GamepadInput();
const usingPad = () => pad.connected && performance.now() - pad.lastUsed < 6000;
const state = {
  mode: 'loading', // loading | title | play | menu | map | omikuji
  visited: new Set(),
  cats: new Set(),
  shells: 0,
  drinks: 0,
  luck: null,
  trains: 0,
  lastArea: null,
};

if (params.has('audit')) {
  AUDIT.on = true;
  window.__audit = AUDIT;
}
ui.setProgress(0.02, '町をつくっています');
const t0 = performance.now();
const world = await buildWorld(scene, { progress: (p, l) => ui.setProgress(p, l) });
const buildMs = Math.round(performance.now() - t0);
const player = new Player(camera, world.colliders, canvas);
player.indoors = world.indoorRects || [];
petals = createPetals(world.petalEmitters, QUALITY.high.petals);
petals.userData.max = QUALITY.high.petals;
petals.geometry.instanceCount = QUALITY[quality].petals;
scene.add(petals);
const catSys = createCats(world, world.materials, 7);
const birds = createBirds(world.materials);
scene.add(birds);
const shells = createShells(world, world.materials);
const anims = createSmallAnimations(world, world.materials);
const traffic = createTraffic(world, world.materials, 8);
if (matchMedia('(prefers-reduced-motion: reduce)').matches) player.bobAmount = 0;
const placesMax = new Set(AREAS.map((a) => a.name)).size;
const town = new TownVoices(voice, world);
// residents load in the background (a 3 MB model): the walk can start before they arrive
let residents = null;
createResidents(world, scene, { voice })
  .then((r) => {
    residents = r;
    window.__residents = r;
  })
  .catch((e) => console.warn('resident not loaded:', e));
// the protagonist (third person), in the outfit picked last time
let avatar = null;
let outfit = 0;
try {
  outfit = Math.max(0, Math.min(2, +(localStorage.getItem('sakura-outfit') || 0) | 0));
} catch {
  /* storage unavailable */
}
ui.setOutfit(outfit);
createAvatar(world, scene, player, outfit)
  .then((a) => {
    avatar = a;
    window.__avatar = a;
  })
  .catch((e) => console.warn('protagonist not loaded:', e));
ui.lots = world.lots;
ui.minimap.build(world.landmarks, world.lots);

// start position: on Sakura-zaka, looking down toward the crossing and the sea
const START = { x: 30.6, z: -26, yaw: Math.PI, pitch: -0.03 };
player.place(START.x, START.z, START.yaw, START.pitch);

// keep the walk going across live updates of the published page
const hot = window.claude?.hot;
hot?.snapshot?.(() => ({ x: player.pos.x, z: player.pos.z, yaw: player.yaw, pitch: player.pitch, hour: tod.hour }));
const restore = hot?.data;
if (restore && typeof restore.x === 'number') {
  player.place(restore.x, restore.z, restore.yaw, restore.pitch);
  if (typeof restore.hour === 'number') tod.setHour(restore.hour);
}

ui.ready();
state.mode = 'title';

// ---------------------------------------------------------------------------
// interactions
// ---------------------------------------------------------------------------
const DRINKS = ['ラムネ', '麦茶', 'ほうじ茶', 'さくらソーダ', 'いちごミルク', 'コーンポタージュ', 'おしるこ', '緑茶', 'カフェオレ', 'みかんジュース'];
const FORTUNES = [
  ['大吉', '願いごと　思うままに叶う。\n待ち人　春風とともに来る。'],
  ['中吉', '旅立ち　海の見える道が吉。\n失せ物　桜の木の下にあり。'],
  ['小吉', '学問　こつこつと実を結ぶ。\n恋愛　焦らず待つがよし。'],
  ['吉', '健康　よく歩き、よく眠れ。\n商い　ゆっくりと上向く。'],
  ['末吉', '今は種をまく時。\n花は遅れて咲くもの。'],
];
const SHOP_LINES = {
  wagashi: '店先に桜もちが並んでいる。甘い香りがする。',
  cafe: 'コーヒーのいい匂い。窓際の席が空いている。',
  yorozuya: '「いらっしゃい」と奥からおばあさんの声がした。',
  bakery: '焼きたてのメロンパンが並んでいる。',
  florist: 'チューリップとフリージアのバケツが並ぶ。',
  fish: '今朝とれたシラスが店頭に並んでいる。',
  books: '店先のワゴンに古い文庫本が並んでいる。',
  grocer: '春キャベツと新玉ねぎが安い。',
  ramen: '湯気の向こうからスープの香りがする。',
  dagashi: '色とりどりの駄菓子。くじ引きもある。',
  barber: 'サインポールがくるくる回っている。',
  cleaning: '「本日仕上がり」の札がかかっている。',
  liquor: '地酒の一升瓶がずらりと並ぶ。',
  pharmacy: 'カエルの人形が店先でこちらを見ている。',
  watch: '古い柱時計がゆっくり時を刻んでいる。',
  tofu: '水槽の中で豆腐が静かに冷えている。',
  stationery: 'ノートと色鉛筆。少しだけ文化祭の匂い。',
  closed: '「貸店舗」の貼り紙。シャッターに花びらが一枚。',
};
const KONBINI_LINES = {
  drink: ['冷たいお茶を一本買った。', 'いちごミルクを買った。春の味がする。', '炭酸水を一本。シュワっと冷たい。'],
  onigiri: ['鮭とツナマヨで迷って……鮭にした。', '梅おにぎりと緑茶。いい組み合わせ。'],
  sweets: ['桜もちプリンを見つけた。春限定らしい。', 'シュークリームを一つ。ふわふわ。'],
  magazine: ['街の情報誌に「桜川 夜桜ライトアップ」の特集が載っている。', '旅行雑誌の表紙は、海の見える町の特集だった。'],
  register: ['「温めますか？」「お願いします」——からあげを一つ。', '「レシートはご利用ですか？」「大丈夫です」'],
  coffee: ['ホットコーヒー。紙カップから湯気がのぼる。'],
  atm: ['ATMの画面に「お取引を選んでください」。今日はやめておこう。'],
  shelf: ['棚をゆっくり眺める。新商品のポップがかわいい。', 'カップ麺の新作が並んでいる。'],
};
const BOOKS = ['『海辺の町の小さな本屋』', '『桜の下で待ち合わせ』', '『鉄道のある風景』', '『ねこと歩く散歩道』', '『はじめての天体観測』', '『港町レシピ帖』', '『川をのぼる魚たち』', '『夜行列車の窓から』'];
const GACHA = ['ミニチュアの踏切', 'ねこのフィギュア', 'さくらのキーホルダー', '駅名標のストラップ', 'ちいさな灯台', '電車のマグネット'];
const pick = (a) => a[Math.floor(Math.random() * a.length)];

let focus = null;
function findInteractable() {
  let best = null, bd = 1e9;
  const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
  const py = player.pos.y;
  const below = py < groundH(player.pos.x, player.pos.z) - 2.5; // underground / in the river bed
  for (const it of world.interactables) {
    if (it.kind === 'shell' && it.shell.taken) continue;
    // things on other floors (subway concourse, platform, street above) are out of reach
    const iy = it.y ?? (it.sit ? it.sit.y - 0.45 : null);
    if (iy !== null ? Math.abs(iy - py) > 2.2 : below) continue;
    const dx = it.x - player.pos.x, dz = it.z - player.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > it.r + 0.6) continue;
    const facing = d < 0.8 ? 1 : (dx * fx + dz * fz) / d;
    if (facing < 0.25) continue;
    const score = d - facing;
    if (score < bd) {
      bd = score;
      best = it;
    }
  }
  return best;
}

function updateCounts() {
  ui.setCounts({ shells: state.shells, shellsMax: shells.length, cats: state.cats.size, catsMax: catSys.cats.length });
}

function interact() {
  if (state.mode !== 'play') return;
  if (player.sitting) {
    player.stand();
    return;
  }
  const it = focus;
  if (!it) return;
  switch (it.kind) {
    case 'vending': {
      const d = pick(DRINKS);
      state.drinks++;
      audio.sfx('vending');
      setTimeout(() => pad.rumble(0.35, 0.3, 140), 900);
      // the roulette on the machine sometimes hits: one more drink
      const lucky = Math.random() < 0.12;
      ui.toast(tf('bought', { d }));
      if (lucky) {
        state.drinks++;
        setTimeout(() => ui.toast(tf('lucky', { d: pick(DRINKS) })), 2600);
      }
      town.onInteract(it, { lucky });
      break;
    }
    case 'cat': {
      const c = it.cat;
      c.petted = 3;
      audio.sfx('meow');
      setTimeout(() => audio.sfx('purr'), 500);
      const first = !state.cats.has(c.name);
      state.cats.add(c.name);
      ui.toast(first ? tf('catFirst', { c: c.name, n: state.cats.size, m: catSys.cats.length }) : tf('catAgain', { c: c.name }));
      break;
    }
    case 'shell':
      it.shell.taken = true;
      it.shell.mesh.visible = false;
      state.shells++;
      audio.sfx('pickup');
      ui.toast(tf('shell', { n: state.shells, m: shells.length }));
      break;
    case 'bench':
      player.sit(it.sit);
      audio.sfx('sit');
      ui.toast('ひと休み。移動するか E で立ち上がる。', 2.6);
      break;
    case 'shrine': {
      audio.sfx('suzu');
      setTimeout(() => audio.sfx('clap'), 700);
      const f = FORTUNES[Math.floor(Math.random() * FORTUNES.length)];
      state.luck = f[0];
      // in third person she faces the hall, puts her hands together and prays before the fortune comes
      const pray = player.view === 'third' && avatar ? avatar.perform('pray', Math.atan2(it.hall.x - player.pos.x, it.hall.z - player.pos.z)) : 0;
      setTimeout(() => openOmikuji(f), pray ? pray * 1000 - 300 : 1300);
      break;
    }
    case 'map':
      town.onInteract(it);
      openMap();
      break;
    case 'sign':
      ui.toast(it.text);
      break;
    case 'shop':
      ui.toast(it.shopKind === 'city' ? tf('cityShop', { s: it.shop }) : SHOP_LINES[it.shopKind] || 'のんびりした店先。');
      break;
    case 'konbini': {
      const lines = KONBINI_LINES[it.what] || KONBINI_LINES.shelf;
      const line = Math.floor(Math.random() * lines.length);
      ui.toast(lines[line]);
      town.onInteract(it, { line });
      audio.sfx(it.what === 'register' || it.what === 'drink' || it.what === 'onigiri' || it.what === 'sweets' ? 'register' : it.what === 'magazine' ? 'page' : 'ui');
      if (it.what === 'drink') state.drinks++;
      break;
    }
    case 'cafe':
      ui.toast('桜ラテを注文した。ほんのり桜の香りがする。');
      audio.sfx('register');
      town.onInteract(it);
      break;
    case 'book':
      ui.toast(tf('book', { b: pick(BOOKS) }));
      audio.sfx('page');
      break;
    case 'library':
      ui.toast('「返却は2週間後です」——本を一冊借りた。');
      audio.sfx('beep');
      town.onInteract(it);
      break;
    case 'mallshop':
      ui.toast(tf('mallShop', { s: it.shop, sub: it.sub }));
      break;
    case 'crepe':
      ui.toast('いちごクリームのクレープを買った。');
      audio.sfx('register');
      town.onInteract(it);
      break;
    case 'gacha':
      audio.sfx('gacha');
      setTimeout(() => ui.toast(tf('gacha', { g: pick(GACHA) })), 800);
      break;
    case 'ticket':
      audio.sfx('ticket');
      ui.toast('桜ヶ浜中央 → 汐見、180円のきっぷを買った。');
      town.onInteract(it);
      break;
    case 'resident':
      it.resident.talk();
      break;
    case 'gate':
      audio.sfx('beep');
      ui.toast('ICカードをタッチ。ピッ。');
      break;
    default:
      break;
  }
  updateCounts();
}

// ---------------------------------------------------------------------------
// modes
// ---------------------------------------------------------------------------
const volumes = { amb: 0.7, music: 0.45, voice: 0.8 };
let minimapOn = true;
try {
  minimapOn = localStorage.getItem('sakura-minimap') !== '0';
} catch {
  /* storage unavailable */
}
ui.setMinimap(minimapOn);
// view: third person (default) or first person
let viewMode = 'third';
try {
  if (localStorage.getItem('sakura-view') === 'first') viewMode = 'first';
} catch {
  /* storage unavailable */
}
player.setView(viewMode);
ui.setView(viewMode);
function toggleView(v = player.view === 'third' ? 'first' : 'third') {
  player.setView(v);
  ui.setView(v);
  try {
    localStorage.setItem('sakura-view', v);
  } catch {
    /* storage unavailable */
  }
}
function toggleMinimap(v = !minimapOn) {
  minimapOn = v;
  ui.setMinimap(v);
  try {
    localStorage.setItem('sakura-minimap', v ? '1' : '0');
  } catch {
    /* storage unavailable */
  }
}

function menuState() {
  return {
    hour: tod.hour,
    flowing: tod.flowing,
    quality,
    visited: state.visited.size,
    placesMax,
    cats: state.cats.size,
    catsMax: catSys.cats.length,
    shells: state.shells,
    shellsMax: shells.length,
    drinks: state.drinks,
    luck: state.luck,
    trains: state.trains,
  };
}

function lockPointer() {
  if (!isTouch && !usingPad()) player.requestLock();
}
function releasePointer() {
  if (document.pointerLockElement) document.exitPointerLock();
}

function startPlay() {
  if (state.mode !== 'title') return;
  audio.start();
  audio.setVolumes(volumes.amb, volumes.music);
  voice.setVolume(volumes.voice);
  ui.enterGame();
  state.mode = 'play';
  player.enabled = true;
  player.applyCamera();
  lockPointer();
  const a = areaAt(player.pos.x, player.pos.z);
  if (a) {
    state.lastArea = a.name;
    state.visited.add(a.name);
    ui.showArea(a);
  }
  const hint = usingPad()
    ? '左スティックで歩く・右スティックで見回す。A でしらべる'
    : isTouch
      ? '左下のスティックで歩く・右側をなぞって見回す'
      : 'マウスで見回し、WASDで歩く。E でしらべる';
  setTimeout(() => ui.toast(hint), 1400);
  updateCounts();
  town.onStart();
}

function openMenu() {
  if (state.mode !== 'play') return;
  state.mode = 'menu';
  player.enabled = false;
  releasePointer();
  ui.openMenu(menuState());
  if (usingPad()) focusEl(document.getElementById('resume'));
}
function backToPlay() {
  ui.closeMenu();
  ui.closeMap();
  ui.closeOmikuji();
  state.mode = 'play';
  player.enabled = true;
  lockPointer();
}
function openMap() {
  if (state.mode !== 'play' && state.mode !== 'menu') return;
  state.mode = 'map';
  player.enabled = false;
  releasePointer();
  ui.closeMenu();
  ui.openMap({ x: player.pos.x, z: player.pos.z, yaw: player.yaw }, world.landmarks);
}
function openOmikuji(f) {
  state.mode = 'omikuji';
  player.enabled = false;
  releasePointer();
  ui.openOmikuji(f[0], f[1]);
  if (usingPad()) focusEl(document.getElementById('close-omikuji'));
}

function cycleTime(dir) {
  let i = 0, best = 99;
  PRESETS.forEach((p, k) => {
    const d = Math.abs(p.hour - tod.hour);
    if (d < best) {
      best = d;
      i = k;
    }
  });
  const next = PRESETS[(i + dir + PRESETS.length) % PRESETS.length];
  tod.setHour(next.hour);
  ui.toast(tf('timeTo', { t: next.label }), 1.6);
}

// controller
function modalRoot() {
  for (const id of ['omikuji', 'map', 'menu']) {
    const el = document.getElementById(id);
    if (!el.hidden) return el;
  }
  return document.body;
}
pad.on('connect', () => {
  document.getElementById('app').classList.add('has-pad');
  ui.toast('コントローラーを接続しました', 2.4);
});
pad.on('disconnect', () => document.getElementById('app').classList.remove('has-pad'));
pad.on('active', () => ui.setInputMode('pad'));
pad.on('start', startPlay);
pad.on('interact', interact);
pad.on('back', () => {
  if (player.sitting) player.stand();
});
pad.on('jump', () => player.jump());
pad.on('map', openMap);
pad.on('minimap', () => toggleMinimap());
pad.on('view', () => toggleView());
pad.on('menu', openMenu);
pad.on('time', cycleTime);
pad.on('confirm', () => activateFocused(modalRoot()));
pad.on('close', backToPlay);
pad.on('nav', (dx, dy) => moveFocus(modalRoot(), dx, dy));

ui.on('start', startPlay);
ui.on('resume', backToPlay);
ui.on('menu', () => (state.mode === 'menu' ? backToPlay() : openMenu()));
ui.on('map', openMap);
ui.on('closeMap', backToPlay);
ui.on('closeOmikuji', backToPlay);
ui.on('time', (h) => {
  tod.setHour(h);
  ui.syncMenu(menuState());
});
ui.on('flow', (v) => (tod.flowing = v));
ui.on('volume', (k, v) => {
  volumes[k] = v;
  if (k === 'voice') voice.setVolume(v);
  else audio.setVolumes(volumes.amb, volumes.music);
});
ui.on('subtitles', (v) => {
  voice.subtitles = v;
  if (!v) ui.hideSubtitle();
});
ui.on('minimap', (v) => toggleMinimap(v));
ui.on('view', (third) => toggleView(third ? 'third' : 'first'));
ui.on('outfit', (i) => {
  outfit = i;
  ui.setOutfit(i);
  avatar?.setOutfit(i).catch((e) => console.warn('outfit not loaded:', e));
  try {
    localStorage.setItem('sakura-outfit', String(i));
  } catch {
    /* storage unavailable */
  }
});
ui.on('sens', (v) => (player.sensitivity = v));
ui.on('outlines', (v) => (pipe.outlines = v));
ui.on('quality', (q) => {
  applyQuality(q);
  ui.syncMenu(menuState());
});
ui.on('stick', (x, y) => player.setTouchMove(x, y));
ui.on('look', (dx, dy) => {
  if (state.mode === 'play') player.addLook(dx, dy);
});
ui.on('interact', interact);
ui.on('jump', () => player.jump());
ui.on('runToggle', (v) => (player.run = v));

canvas.addEventListener('click', () => {
  if (state.mode === 'play' && !player.pointerLocked) lockPointer();
});

addEventListener('keydown', (e) => {
  ui.setInputMode('kb');
  if (state.mode === 'title' && (e.code === 'Enter' || e.code === 'Space')) {
    e.preventDefault();
    startPlay();
    return;
  }
  if (e.code === 'Escape') {
    if (state.mode === 'map' || state.mode === 'omikuji' || state.mode === 'menu') backToPlay();
    else if (state.mode === 'play' && !player.pointerLocked) openMenu();
    return;
  }
  if (state.mode === 'map' && e.code === 'KeyM') {
    backToPlay();
    return;
  }
  if (state.mode !== 'play') return;
  if (e.code === 'KeyE' || e.code === 'Enter') interact();
  if (e.code === 'KeyM') openMap();
  if (e.code === 'KeyN') toggleMinimap();
  if (e.code === 'KeyV') toggleView();
  if (e.code === 'KeyT') cycleTime(1);
  if (e.code === 'KeyH') document.getElementById('hud').classList.toggle('photo');
});

// Esc (or the browser) released pointer lock while walking: show the menu
let hadLock = false;
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement) hadLock = true;
  else if (hadLock && state.mode === 'play') openMenu();
});

function onResize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  applyQuality(quality);
  world.wireMaterial?.resolution.set(innerWidth, innerHeight);
}
addEventListener('resize', onResize);
world.wireMaterial?.resolution.set(innerWidth, innerHeight);

player.onStep = (surface, running) => audio.step(surface, running);
player.onLand = (v) => {
  audio.step('hard', true);
  if (v > 7) pad.rumble(0.2, 0.25, 110);
};

// ---------------------------------------------------------------------------
// title attract camera: a slow glide down Sakura-zaka toward the sea
// ---------------------------------------------------------------------------
function attract(t) {
  const u = (t * 0.011) % 1;
  const z = -72 + u * 96;
  const x = 30.4 + Math.sin(t * 0.05) * 1.0;
  const g = world.colliders.groundAt(x, z);
  camera.position.set(x, g + 1.9 + Math.sin(t * 0.1) * 0.25, z);
  camera.rotation.set(-0.015 + Math.sin(t * 0.07) * 0.02, Math.PI + Math.sin(t * 0.04) * 0.1, 0, 'YXZ');
}

// ---------------------------------------------------------------------------
// main loop
// ---------------------------------------------------------------------------
let lastNow = performance.now();
let areaCheck = 0;
let gust = 0, gustT = 4;
let frames = 0;
let lastTrainState = 'wait';
let rumbleT = 0;
let prevHour = tod.hour;
const fwd = new THREE.Vector3();
const headPos = new THREE.Vector3(), focusAt = new THREE.Vector3();
// where the protagonist looks: what she is about to use (a person's face, a thing at chest height)
function focusPoint(it) {
  if (!it || state.mode !== 'play') return null;
  if (it.kind === 'resident') return it.resident.ch.node('head').getWorldPosition(focusAt);
  const y = it.y ?? (it.sit ? it.sit.y - 0.45 : world.colliders.groundAt(it.x, it.z, player.pos.y + 0.3));
  return focusAt.set(it.x, y + 1.0, it.z);
}
window.__info = { buildMs };

function frame() {
  const now = performance.now();
  const dt = Math.min((now - lastNow) / 1000, 0.1);
  lastNow = now;
  const t = (G.uTime.value += dt);

  if (state.mode === 'title') {
    tod.update(dt * 0.25);
    if (!debug) attract(t);
  } else if (state.mode !== 'loading') {
    if (state.mode === 'play') tod.update(dt);
    player.update(state.mode === 'play' ? dt : 0);
  }

  // controller
  pad.poll(dt, state.mode);
  const padOn = state.mode === 'play';
  player.padMove.set(padOn ? pad.move.x : 0, padOn ? pad.move.y : 0);
  player.padLook.set(padOn ? pad.look.x : 0, padOn ? pad.look.y : 0);
  player.padRun = padOn && pad.run;

  // town life
  const train = world.train;
  train.update(dt, state.mode === 'play' ? player.pos : null);
  if (lastTrainState === 'depart' && train.state === 'wait') state.trains++;
  lastTrainState = train.state;
  updateCrossings(world.crossings, train, dt, t, state.mode === 'play' ? player.pos : null);
  if (padOn && train.v > 2 && Math.abs(player.pos.z - 56) < 12) {
    const [a, b] = train.span();
    const dx = Math.max(a - player.pos.x, 0, player.pos.x - b);
    rumbleT -= dt;
    if (dx < 10 && rumbleT <= 0) {
      pad.rumble(0.22, 0.08, 160);
      rumbleT = 0.3;
    }
  }
  for (const u of world.updaters) u(t, dt);
  world.grass?.update(camera);
  world.autoDoors?.update(dt, state.mode === 'play' ? player.pos : null, audio);
  catSys.update(t, dt, player.pos);
  traffic.update(dt, state.mode === 'play' ? player.pos : null);
  // the protagonist: shown in third person unless the camera is pulled in against her
  // (she stays on screen behind menus, the map and the fortune slip)
  const tpOn = !!avatar && state.mode !== 'title' && state.mode !== 'loading' && player.view === 'third';
  const tpShown = tpOn && player.boomNow > 0.75;
  avatar?.update(dt, { active: tpOn, visible: tpShown, look: focusPoint(focus), still: state.mode !== 'play' });
  const head = tpShown ? avatar.head(headPos) : camera.position;
  residents?.update(dt, state.mode === 'play' ? { pos: player.pos, head, sitting: player.sitting } : null, tod.hour);
  birds.userData.update(t);
  anims.update(t, tod.hour);
  clouds.userData.update(camera, t);
  G.uTide.value = 0.06 * Math.sin(t * 0.42) + 0.025 * Math.sin(t * 1.13);
  gustT -= dt;
  if (gustT <= 0) {
    gust = Math.random() < 0.35 ? 1 : 0;
    gustT = gust ? 3 + Math.random() * 3 : 6 + Math.random() * 10;
  }
  const gu = petals.material.uniforms.uGust;
  gu.value += (gust - gu.value) * Math.min(1, dt * 0.8);

  if (state.mode === 'play') {
    focus = findInteractable();
    ui.setPrompt(player.sitting ? '立ち上がる' : focus ? focus.label : null);
    areaCheck -= dt;
    if (areaCheck <= 0) {
      areaCheck = 0.4;
      const a = areaAt(player.pos.x, player.pos.z, player.pos.y);
      const name = a ? a.name : null;
      if (name && name !== state.lastArea) {
        ui.showArea(a);
        state.visited.add(name);
      }
      state.lastArea = name;
    }
    ui.setCrosshair(player.pointerLocked && player.view === 'first');
    ui.minimap.update(dt, { x: player.pos.x, z: player.pos.z, yaw: player.yaw });
  } else ui.setPrompt(null);
  ui.setClock(tod.label, tod.period.label, tod.hour);
  const lastHour = prevHour;
  prevHour = tod.hour;
  ui.update(dt);

  // audio
  if (audio.started) {
    player.forward(fwd);
    if (state.mode === 'title') fwd.set(0, 0, 1);
    let chime = null, cd = 30;
    for (const s of world.soundSpots) {
      const d = Math.hypot(s.x - camera.position.x, s.z - camera.position.z);
      if (d < cd) {
        cd = d;
        chime = s;
      }
    }
    const cx = camera.position.x, cz = camera.position.z, feet = player.pos.y;
    const under = state.mode === 'play' && feet < groundH(cx, cz) - 2.5 && cx > SUBWAY.x0 - 6 && cx < SUBWAY.x1 + 6 && cz > SUBWAY.z0 - 100 && cz < SUBWAY.z1 + 70;
    const inside = state.mode === 'play' && (world.indoorRects || []).some((r) => cx > r.x0 && cx < r.x1 && cz > r.z0 && cz < r.z1 && feet > r.y0 && feet < r.y1);
    const rz = Math.min(Math.max(cz, RIVER.zHead), 100), rx = Math.min(Math.max(cx, RIVER.x - RIVER.inner), RIVER.x + RIVER.inner);
    const river = { x: rx, y: 2, z: rz, d: Math.hypot(cx - rx, cz - rz), weir: WEIRS.some((w) => Math.abs(rz - w.z - 1) < 5) };
    for (const c of world.crosswalkSounds || []) c.walk = walkState(G.uTime.value, c.axis) === 'walk';
    const room = state.mode === 'play' ? (world.indoorRects || []).find((r) => r.name && cx > r.x0 && cx < r.x1 && cz > r.z0 && cz < r.z1 && feet > r.y0 && feet < r.y1)?.name ?? null : null;
    // voices read this frame's train / subway events before the soundscape consumes them
    town.update(dt, {
      play: state.mode === 'play',
      x: cx,
      y: camera.position.y,
      z: cz,
      under,
      room,
      hour: tod.hour,
      dHour: tod.hour - lastHour,
      train,
      subway: world.subway,
      crosswalks: world.crosswalkSounds,
    });
    audio.update(dt, {
      x: cx,
      y: camera.position.y,
      z: cz,
      fx: fwd.x,
      fz: fwd.z,
      shoreZ: shoreZ(cx),
      night: G.uNight.value,
      inTown: cz < 60,
      indoor: under || inside ? 1 : 0,
      under,
      river,
      subway: world.subway,
      crosswalks: world.crosswalkSounds,
      crossings: world.crossings,
      train,
      chime,
      station: { x: (STATION.platX0 + STATION.platX1) / 2, z: STATION.platZ0 },
    });
  }

  // render
  pipe.updateFlare(camera, G.uSunDir.value, (1 - G.uNight.value) * G.uSunDisk.value);
  renderer.info.reset();
  pipe.render(scene, camera, { exposure: tod.exposure, bloom: tod.bloom });
  frames++;
  if (frames === 3) {
    window.__info.calls = renderer.info.render.calls;
    window.__info.tris = renderer.info.render.triangles;
    window.__ready = true;
    if (params.has('still')) return;
  }
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------------------
// debug hooks for automated screenshots (?cam=x,y,z,yawDeg,pitchDeg&still)
// ---------------------------------------------------------------------------
function setCam(str) {
  const [x, y, z, yaw, pitch, fy] = str.split(',').map(Number);
  const g = world.colliders.groundAt(x, z, Number.isFinite(fy) ? fy : null);
  camera.position.set(x, y + g, z);
  camera.rotation.set(THREE.MathUtils.degToRad(pitch || 0), THREE.MathUtils.degToRad(yaw || 0), 0, 'YXZ');
}
if (params.get('cam')) setCam(params.get('cam'));
window.__setView = (cam, hour) => {
  document.getElementById('title').hidden = true;
  if (cam) setCam(cam); // null: keep the camera where the game put it
  if (hour !== undefined && !Number.isNaN(hour)) tod.setHour(hour);
  tod.update(0);
  clouds.userData.update(camera, G.uTime.value);
  world.grass?.update(camera);
  pipe.updateFlare(camera, G.uSunDir.value, (1 - G.uNight.value) * G.uSunDisk.value);
  renderer.info.reset();
  pipe.render(scene, camera, { exposure: tod.exposure, bloom: tod.bloom });
  pipe.render(scene, camera, { exposure: tod.exposure, bloom: tod.bloom });
  return true;
};
window.__game = { world, player, tod, state, ui, startPlay, updateCrossings, voice, town, audio, i18n: { tr, tf, setLang } };
// debug: subway trains standing at the platform with doors open (?subway)
if (params.has('subway') && world.subway) {
  for (const tr of world.subway.trains) {
    tr.state = 'dwell';
    tr.z = -14;
    tr.timer = 15;
    tr.open = 1;
    tr.place();
  }
  world.subway.update(0);
}
// debug: place the train (?train=x[,dir]) for screenshots
if (params.get('train')) {
  const [tx, td] = params.get('train').split(',').map(Number);
  const tr = world.train;
  tr.dir = td || -1;
  tr.state = 'depart';
  tr.v = 0.001;
  tr.head = tx;
  tr.place();
}
frame();
