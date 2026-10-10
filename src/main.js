import './style.css';
import * as THREE from 'three';
import { SunLight } from 'three/addons/lights/SunLight.js';
import { steadyShadows } from './render/shadowfix.js';
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
import { createPedestrians } from './world/pedestrians.js';
import { createAvatar, OUTFITS } from './systems/avatar.js';
import { Bicycle } from './systems/bicycle.js';
import { VOICE_CREDITS } from './systems/voiceLines.js';
import { GamepadInput, moveFocus, activateFocused, focusEl } from './systems/gamepad.js';

const params = new URLSearchParams(location.search);
const debug = params.has('cam') || params.has('still');

// ---------------------------------------------------------------------------
// renderer / scene
// ---------------------------------------------------------------------------
steadyShadows();
const canvas = document.getElementById('scene');
// reversed depth (where the browser has EXT_clip_control): a float depth buffer then keeps the
// same relative precision out to the horizon, so walls, windows and signs a few millimetres
// apart stop fighting (flickering) on buildings far away
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false, reversedDepthBuffer: true });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.info.autoReset = false;

const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
const QUALITY = {
  low: { ratio: 0.8, maxRatio: 1, msaa: 0, shadow: 1024, petals: 1800, lite: true },
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
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.15, 5000);
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
  pipe.lite = !!Q.lite;
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
// (?nofit: leaves as planted, without keeping them out of walls; for comparisons)
const world = await buildWorld(scene, { progress: (p, l) => ui.setProgress(p, l), fitFoliage: !params.has('nofit') });
const buildMs = Math.round(performance.now() - t0);
const player = new Player(camera, world.colliders, canvas);
player.indoors = world.indoorRects || [];
// her bicycle (B to get on and off), in the colour picked last time
const bike = new Bicycle(world, scene, { audio });
try {
  bike.setColor(+(localStorage.getItem('sakura-bike-color') || 0) | 0);
  bike.gear = Math.max(0, Math.min(2, +(localStorage.getItem('sakura-bike-gear') ?? 1) | 0));
} catch {
  /* storage unavailable */
}
window.__bike = bike;
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
const residentsReady = createResidents(world, scene, { voice })
  .then((r) => {
    residents = r;
    window.__residents = r;
  })
  .catch((e) => console.warn('resident not loaded:', e));
// the protagonist (third person), in the outfit picked last time
let avatar = null;
let outfit = 0;
try {
  outfit = Math.max(0, Math.min(OUTFITS.length - 1, +(localStorage.getItem('sakura-outfit') || 0) | 0));
} catch {
  /* storage unavailable */
}
ui.setOutfit(outfit);
const avatarReady = createAvatar(world, scene, player, outfit)
  .then((a) => {
    avatar = a;
    a.bike = bike;
    bike.setRider(a.ch);
    window.__avatar = a;
  })
  .catch((e) => console.warn('protagonist not loaded:', e));
// passers-by come once she and Mei are there
let passersby = null;
const aroundThem = [];
Promise.allSettled([residentsReady, avatarReady])
  .then(() => createPedestrians(world, scene, () => player.pos))
  .then((p) => {
    passersby = p;
    window.__passersby = p;
  })
  .catch((e) => console.warn('passers-by not loaded:', e));
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
// up at the counter inside a shop
const SHOP_IN = {
  wagashi: '桜もちを二つ包んでもらった。葉っぱのいい香り。',
  cafe: '「ブレンドをひとつ」——サイフォンがこぽこぽ鳴りはじめた。',
  yorozuya: '「あら、いらっしゃい。ラムネ冷えてるよ」',
  bakery: 'メロンパンとクロワッサンをトレーにのせた。まだ温かい。',
  florist: 'フリージアとかすみ草で小さな花束を作ってもらった。',
  fish: '「今日はシラスがいいよ。釜揚げもあるよ」',
  books: '新刊の文庫を一冊買った。カバーをかけてもらう。',
  grocer: '春キャベツをひと玉買った。ずっしり重い。',
  ramen: '醤油ラーメンの食券を買った。「はい、醤油一丁！」',
  dagashi: 'きなこ棒とラムネ菓子。合わせて60円。',
  barber: '「今日は混んでるから、また夕方においで」',
  cleaning: 'ビニールに包まれたブラウスを受け取った。アイロンがぴしっとしている。',
  liquor: '桜ラベルの地酒が並んでいる。……大人になったら飲んでみたい。',
  pharmacy: '「花粉症ですか？　この目薬がよく効きますよ」',
  watch: '小さな腕時計を見せてもらった。秒針の音がかすかに聞こえる。',
  tofu: '絹ごし豆腐を一丁。水槽から手ですくってくれた。',
  stationery: '桜色のペンで試し書きした。「はるのうみ」',
  fashion: '春色のカーディガンを鏡の前で合わせてみた。',
  zakka: '桜の絵のマグカップ。ちょっと欲しくなった。',
  sports: 'ランニングシューズを手にとった。軽い！',
  shoes: 'スニーカーを試し履きした。ぴったり。',
  eyewear: '丸いフレームをかけてみた。鏡の中の自分が少し大人っぽい。',
  toys: '小さな電車がくるくる走っている。ずっと見ていられる。',
  electronics: '大きなテレビに海の映像。この町の海のほうがきれいかも。',
  accessory: '桜モチーフのピアス。光にかざすときらきらする。',
  kitchen: 'ホーロー鍋のふたを持ち上げてみた。思ったより重い。',
  music: 'ヘッドホンで新譜を試聴した。春っぽい曲。',
  pet: '子犬がしっぽを振って、ガラスに鼻をくっつけた。',
  bags: '帆布のトートバッグ。図書館に行くのにちょうどいい大きさ。',
  cosmetics: '春の新色リップを手の甲で試した。ほんのり桜色。',
  games: 'UFOキャッチャーに100円……アームがするっと滑った。',
  craft: '春色の毛糸を三玉選んだ。何を編もうかな。',
  gyudon: '「並、お待たせしました！」——早い。',
  crepe: 'いちごカスタードのクレープ。生地がふわふわ。',
  zakka100: '便利グッズをいくつか。全部で330円。',
  cake: 'いちごのショートケーキをひとつ。保冷剤を入れてくれた。',
  washoku: '「しらす丼、お待ちどおさま」',
  yakiniku: 'カルビがじゅうっと焼ける音。いい匂い。',
  realestate: '「海の見える1LDK」の貼り紙。家賃は……見なかったことにした。',
  laundry: '洗濯機が回りはじめた。あと38分。',
  tea: '新茶を一杯いただいた。甘くて青い香り。',
  izakaya: '「今日は桜鯛が入ってるよ」——まだ仕込み中らしい。',
  phone: '「画面割れなら30分で直りますよ」',
  bigbooks: '本棚の間をゆっくり歩いた。紙とインクの匂い。',
  drug: 'はちみつレモンののど飴を見つけた。',
};
// shops where going up to the counter means buying something
const SHOP_BUY = new Set(['wagashi', 'bakery', 'florist', 'books', 'grocer', 'dagashi', 'cleaning', 'tofu', 'crepe', 'zakka100', 'cake', 'craft', 'drug', 'gyudon']);
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
    if (it.off || (it.kind === 'shell' && it.shell.taken)) continue;
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
  if (state.mode !== 'play' || bike.on) return;
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
    case 'hospital':
    case 'post':
    case 'koban':
      ui.toast(it.text);
      audio.sfx(it.kind === 'post' ? 'register' : 'ui');
      break;
    case 'sento':
      ui.toast(it.text);
      audio.sfx(it.what === 'milk' ? 'register' : it.what === 'shoes' ? 'page' : 'ui');
      break;
    case 'school':
      if (it.what === 'ball' && world.gym) {
        const made = world.gym.shoot(player.pos);
        audio.sfx('ui');
        setTimeout(() => ui.toast(made ? 'ナイスシュート！' : 'おしい、リングに当たった。'), 900);
        break;
      }
      ui.toast(it.text);
      audio.sfx(it.what === 'piano' ? 'chime' : it.what === 'shoes' ? 'page' : 'ui');
      break;
    case 'shop':
      if (it.inside) {
        ui.toast(SHOP_IN[it.shopKind] || '店内をゆっくり見てまわった。');
        audio.sfx(SHOP_BUY.has(it.shopKind) ? 'register' : it.shopKind === 'ramen' ? 'beep' : it.shopKind === 'games' ? 'gacha' : 'ui');
        break;
      }
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
    case 'bike':
      toggleBike();
      break;
    default:
      break;
  }
  updateCounts();
}

// ---------------------------------------------------------------------------
// the bicycle
// ---------------------------------------------------------------------------
let bikeTips = 0;
function toggleBike() {
  if (state.mode !== 'play') return;
  if (bike.on) {
    bike.dismount();
    return;
  }
  if (player.sitting) player.stand();
  // facing the way she faces (third person) or you look (first person)
  const h = player.view === 'third' && avatar ? avatar.heading : player.yaw + Math.PI;
  const r = bike.mount(player, h);
  if (r !== 'ok') {
    ui.toast(r === 'here' ? 'ここでは自転車に乗れない。' : '自転車に乗れない。', 2.4);
    return;
  }
  if (bikeTips < 2) {
    bikeTips++;
    const tip = usingPad()
      ? '左スティックでこぐ・ブレーキ・ハンドル、RT で立ちこぎ、LB / RB でギア、X でベル、B で降りる'
      : isTouch
        ? 'スティックでこぐ・ハンドル、ベルとギアのボタン、もう一度「自転車」で降りる'
        : 'W でこぐ・S でブレーキ・A / D でハンドル、Shift で立ちこぎ、Q / E でギア、Space でベル、B で降りる';
    setTimeout(() => ui.toast(tip, 5.5), 600);
  }
}
function shiftGear(d, abs = null) {
  if (!bike.riding) return;
  const ok = abs !== null ? bike.setGear(abs) : bike.shift(d);
  if (!ok) return;
  try {
    localStorage.setItem('sakura-bike-gear', String(bike.gear));
  } catch {
    /* storage unavailable */
  }
}
// bumping into a doorway or a flight of steps: a hint, now and then
let blockedToast = 0;
bike.onBlocked = (why) => {
  if (performance.now() - blockedToast < 6000) return;
  blockedToast = performance.now();
  if (why === 'door') ui.toast('自転車のままでは入れない。（B で降りる）', 2.6);
  else if (why === 'step') ui.toast('段差が高くて自転車では進めない。', 2.4);
  pad.rumble(0.25, 0.2, 120);
};
// people slowed for (passers-by and Mei), and those who hear the bell
const bikeAgents = [];
bike.agents = () => {
  bikeAgents.length = 0;
  for (const p of passersby?.list ?? []) bikeAgents.push(p);
  for (const r of residents?.list ?? []) bikeAgents.push(r);
  return bikeAgents;
};
bike.onRing = (x, z, h) => passersby?.bell?.(x, z, h);

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
  if (bike.on) bike.dismount();
  else if (player.sitting) player.stand();
});
pad.on('jump', () => (bike.on ? bike.ring() : player.jump()));
pad.on('bike', toggleBike);
pad.on('map', openMap);
pad.on('minimap', () => toggleMinimap());
pad.on('view', () => toggleView());
pad.on('menu', openMenu);
pad.on('time', (d) => (bike.riding ? shiftGear(d) : cycleTime(d)));
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
  avatar
    ?.setOutfit(i)
    .then(() => bike.setRider(avatar.ch))
    .catch((e) => console.warn('outfit not loaded:', e));
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
ui.on('jump', () => (bike.on ? bike.ring() : player.jump()));
ui.on('bike', toggleBike);
ui.on('gear', () => shiftGear(0, (bike.gear + 1) % 3));
ui.on('bikeColor', (i) => {
  bike.setColor(i);
  ui.setBikeColor(i);
  try {
    localStorage.setItem('sakura-bike-color', String(i));
  } catch {
    /* storage unavailable */
  }
});
ui.setBikeColor(bike.colorIndex);
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
  if (e.code === 'KeyB') toggleBike();
  if (bike.on) {
    // on the bicycle: Q / E (or 1 2 3) change gear, Space rings the bell
    if (e.code === 'KeyQ') shiftGear(-1);
    if (e.code === 'KeyE') shiftGear(1);
    if (e.code === 'Digit1' || e.code === 'Digit2' || e.code === 'Digit3') shiftGear(0, +e.code.slice(5) - 1);
    if (e.code === 'Space' && !e.repeat) bike.ring();
  } else if (e.code === 'KeyE' || e.code === 'Enter') interact();
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
const walkers = []; // feet positions of everyone the train must not run into
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
  simulate(dt);

  // render
  pipe.setIndoor(cameraIndoors(), dt);
  pipe.updateFlare(camera, G.uSunDir.value, (1 - G.uNight.value) * G.uSunDisk.value, tod.leak * G.uSunDisk.value, tod.rays * G.uSunDisk.value);
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

// one step of the town, the walk and the sounds (everything but drawing the frame)
function simulate(dt) {
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
  player.padBrake = padOn ? pad.brake : 0;
  // the bicycle (its wheels, cranks and bars set before she is posed on it)
  bike.update(state.mode === 'play' ? dt : 0, player);
  // a touch wider view the faster she rides
  const fov = 62 + Math.max(0, Math.abs(bike.riding ? bike.v : 0) - 2) * 0.9;
  if (Math.abs(camera.fov - fov) > 0.01) {
    camera.fov += (fov - camera.fov) * Math.min(1, dt * 2);
    camera.updateProjectionMatrix();
  }

  // town life
  const train = world.train;
  // the train looks out for everyone on the track, also while a menu is open over the walk
  const walking = state.mode !== 'title' && state.mode !== 'loading';
  walkers.length = 0;
  if (walking) walkers.push(player.pos);
  residents?.positions(walkers);
  train.update(dt, walkers);
  if (lastTrainState === 'depart' && train.state === 'wait') state.trains++;
  lastTrainState = train.state;
  updateCrossings(world.crossings, train, dt, t, walking ? player.pos : null);
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
  world.cullInteriors?.(camera.position);
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
  // the passers-by keep clear of you and of Mei
  aroundThem.length = 0;
  if (state.mode === 'play') aroundThem.push(bike.on ? { x: player.pos.x, z: player.pos.z, vx: player.vel.x, vz: player.vel.z, bike: true } : player.pos);
  bike.obstacles(aroundThem);
  const mei = residents?.list[0];
  if (mei && !mei.home) aroundThem.push(mei);
  passersby?.update(dt, state.mode === 'play' ? { pos: player.pos, head } : null, camera, tod.hour, aroundThem);
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
    focus = bike.on ? null : findInteractable();
    ui.setPrompt(player.sitting ? '立ち上がる' : focus ? focus.label : null);
    ui.setBike(bike.on ? { gear: bike.gear, kmh: Math.abs(bike.v) * 3.6, standing: bike.stand > 0.5 } : null);
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
    ui.minimap.update(dt, { x: player.pos.x, z: player.pos.z, yaw: player.yaw, bike: !bike.on && bike.parked ? bike.parked : null });
  } else {
    ui.setPrompt(null);
    ui.setBike(null);
  }
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
}
// (tests: run the town n steps of dt seconds without drawing)
window.__tick = (dt = 1 / 30, n = 1) => {
  for (let i = 0; i < n; i++) simulate(dt);
};

// the camera in a room or underground: the compositing's sky gradients and sun effects step back
function cameraIndoors() {
  const { x, y, z } = camera.position;
  if (y < groundH(x, z) - 2.5 && x > SUBWAY.x0 - 6 && x < SUBWAY.x1 + 6 && z > SUBWAY.z0 - 100 && z < SUBWAY.z1 + 70) return true;
  return (world.indoorRects || []).some((r) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1 && y > r.y0 && y < r.y1);
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
  window.__tuneHook?.(); // (comparison shots: overrides applied after the time of day)
  clouds.userData.update(camera, G.uTime.value);
  world.grass?.update(camera);
  world.cullInteriors?.(camera.position);
  pipe.setIndoor(cameraIndoors(), 0);
  pipe.updateFlare(camera, G.uSunDir.value, (1 - G.uNight.value) * G.uSunDisk.value, tod.leak * G.uSunDisk.value, tod.rays * G.uSunDisk.value);
  renderer.info.reset();
  pipe.render(scene, camera, { exposure: tod.exposure, bloom: tod.bloom });
  pipe.render(scene, camera, { exposure: tod.exposure, bloom: tod.bloom });
  return true;
};
window.__game = { world, player, tod, state, ui, startPlay, updateCrossings, voice, town, audio, pipe, sun, G, scene, i18n: { tr, tf, setLang } };
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
