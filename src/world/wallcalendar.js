import * as THREE from 'three';
import { FONTS } from '../render/atlas.js';
import { weekday, daysIn, holiday } from '../systems/calendar.js';

// The calendar on her bedroom wall (world/homedecor.js hangs it): a month to a page, a picture
// of the month above (初日の出, 梅, 菜の花, 桜, こいのぼり, 紫陽花, 入道雲, 花火, お月見, 紅葉,
// 銀杏, 椿), the days below with Sundays and holidays in red and Saturdays in blue, the days
// gone by crossed off and today ringed. main.js turns it to the town's date
// (systems/calendar.js) as the days go by.

const W = 240, H = 320;
const RED = '#d2475a', BLUE = '#3c6fb4', INK = '#3f3f48';
const MONTHS = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
const WEEK = ['日', '月', '火', '水', '木', '金', '土'];

export class WallCalendar {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = W;
    this.canvas.height = H;
    const t = new THREE.CanvasTexture(this.canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    this.texture = t;
    this.key = '';
  }

  // turn to the page for the date { y, m, d } (only redrawn when the date changes)
  show(D) {
    const key = `${D.y}-${D.m}-${D.d}`;
    if (key === this.key) return;
    this.key = key;
    drawPage(this.canvas.getContext('2d'), D);
    this.texture.needsUpdate = true;
  }
}

function drawPage(c, D) {
  c.save();
  c.fillStyle = '#fbfaf6';
  c.fillRect(0, 0, W, H);
  // the hole it hangs by
  c.strokeStyle = '#c9c4b8';
  c.lineWidth = 1.5;
  c.beginPath();
  c.arc(W / 2, 7, 3, 0, Math.PI * 2);
  c.stroke();
  // the month's picture
  const px = 12, py = 14, pw = W - 24, ph = 110;
  c.save();
  c.beginPath();
  if (c.roundRect) c.roundRect(px, py, pw, ph, 4);
  else c.rect(px, py, pw, ph);
  c.clip();
  c.translate(px, py);
  PICTURES[D.m - 1](c, pw, ph, rng(D.y * 13 + D.m));
  c.restore();
  // the month, the year (and the era: 令和 from 2019)
  c.textBaseline = 'alphabetic';
  c.fillStyle = INK;
  c.font = `700 32px ${FONTS.maru}`;
  c.fillText(String(D.m), 14, 160);
  const mw = c.measureText(String(D.m)).width;
  c.font = `700 14px ${FONTS.maru}`;
  c.fillText('月', 16 + mw, 160);
  c.fillStyle = '#8a8478';
  c.font = `700 10px ${FONTS.latin}`;
  c.letterSpacing = '2px';
  c.fillText(MONTHS[D.m - 1], 34 + mw, 159);
  c.letterSpacing = '0px';
  c.textAlign = 'right';
  c.font = `700 13px ${FONTS.latin}`;
  c.fillText(String(D.y), W - 14, 148);
  c.font = `700 9px ${FONTS.maru}`;
  c.fillText(`令和${D.y - 2018}年`, W - 14, 161);
  // the days of the week
  const gx = 12, cw = (W - 24) / 7;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.font = `700 11px ${FONTS.maru}`;
  WEEK.forEach((w, i) => {
    c.fillStyle = i === 0 ? RED : i === 6 ? BLUE : '#6a6a72';
    c.fillText(w, gx + cw * (i + 0.5), 175);
  });
  c.fillStyle = '#e2ddd2';
  c.fillRect(gx, 183, W - 24, 1);
  // the days
  const first = weekday(D.y, D.m, 1), n = daysIn(D.y, D.m);
  const rows = Math.ceil((first + n) / 7), rh = Math.min(25, (H - 192) / rows);
  for (let d = 1; d <= n; d++) {
    const k = first + d - 1, w = k % 7;
    const x = gx + cw * (w + 0.5), y = 188 + rh * (Math.floor(k / 7) + 0.5);
    const off = w === 0 || holiday(D.y, D.m, d);
    c.fillStyle = off ? RED : w === 6 ? BLUE : INK;
    c.font = `700 ${rh < 21 ? 13 : 15}px ${FONTS.maru}`;
    c.fillText(String(d), x, y + 1);
    if (d < D.d) {
      // crossed off in pencil
      c.strokeStyle = 'rgba(110, 100, 96, 0.5)';
      c.lineWidth = 1.4;
      c.beginPath();
      c.moveTo(x - 8, y + 7);
      c.lineTo(x + 8, y - 6);
      c.stroke();
    } else if (d === D.d) {
      // today, ringed round in red pen (a stroke that runs on past where it began)
      c.strokeStyle = '#e05a6a';
      c.lineWidth = 2.2;
      c.beginPath();
      c.ellipse(x + 0.5, y + 0.5, 12.5, rh / 2 - 1.5, -0.15, -2.2, -2.2 + Math.PI * 2.15);
      c.stroke();
    }
  }
  c.restore();
}

// ---------------------------------------------------------------------------- pictures
function rng(seed) {
  let s = seed % 2147483647 || 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}
function sky(c, w, h, top, bottom) {
  const g = c.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);
}
function dot(c, x, y, r, color) {
  c.fillStyle = color;
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fill();
}
// a five-petalled flower (梅, 桜, 椿)
function flower(c, x, y, r, petal, mid, rot = 0) {
  for (let k = 0; k < 5; k++) {
    const a = rot + (k / 5) * Math.PI * 2 - Math.PI / 2;
    dot(c, x + Math.cos(a) * r * 0.52, y + Math.sin(a) * r * 0.52, r * 0.52, petal);
  }
  dot(c, x, y, r * 0.24, mid);
}
function branch(c, pts, width, color) {
  c.strokeStyle = color;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.lineWidth = width;
  c.beginPath();
  pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.stroke();
}
function cloud(c, x, y, s, color = '#ffffff') {
  for (const [dx, dy, r] of [[-1.1, 0.2, 0.7], [-0.4, -0.3, 0.9], [0.5, -0.15, 0.8], [1.15, 0.25, 0.6], [0, 0.35, 0.75]]) dot(c, x + dx * s, y + dy * s, r * s, color);
}
function sea(c, w, h, y, color, glint) {
  c.fillStyle = color;
  c.fillRect(0, y, w, h - y);
  c.strokeStyle = glint;
  c.lineWidth = 1.2;
  for (let k = 0; k < 6; k++) {
    const yy = y + 5 + k * 5, x0 = ((k * 37) % 60) + 8;
    c.beginPath();
    c.moveTo(x0, yy);
    c.lineTo(x0 + 22, yy);
    c.moveTo(x0 + 90, yy + 2);
    c.lineTo(x0 + 120, yy + 2);
    c.stroke();
  }
}

const PICTURES = [
  // 1月: the first sunrise of the year behind Fuji
  (c, w, h) => {
    sky(c, w, h, '#a9c8ea', '#fbe2c6');
    dot(c, w * 0.76, h * 0.36, 15, '#e8574a');
    c.fillStyle = '#5d7fb0';
    c.beginPath();
    c.moveTo(-10, h);
    c.lineTo(w * 0.37, h * 0.32);
    c.quadraticCurveTo(w * 0.45, h * 0.27, w * 0.53, h * 0.32);
    c.lineTo(w + 10, h);
    c.fill();
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.moveTo(w * 0.37, h * 0.32);
    c.quadraticCurveTo(w * 0.45, h * 0.27, w * 0.53, h * 0.32);
    c.lineTo(w * 0.6, h * 0.42);
    [[0.55, 0.39], [0.51, 0.46], [0.47, 0.4], [0.43, 0.47], [0.39, 0.41], [0.33, 0.44]].forEach(([x, y]) => c.lineTo(w * x, h * y));
    c.fill();
    c.strokeStyle = '#3e4a66';
    c.lineWidth = 1.2;
    for (const [x, y] of [[0.2, 0.25], [0.26, 0.2]]) {
      c.beginPath();
      c.moveTo(w * x - 4, h * y - 2);
      c.quadraticCurveTo(w * x - 2, h * y - 3, w * x, h * y);
      c.quadraticCurveTo(w * x + 2, h * y - 3, w * x + 4, h * y - 2);
      c.stroke();
    }
  },
  // 2月: a branch of red and pink plum
  (c, w, h) => {
    sky(c, w, h, '#f7f0e2', '#efe4cf');
    branch(c, [[-4, h * 0.8], [w * 0.3, h * 0.6], [w * 0.52, h * 0.66], [w * 0.8, h * 0.35], [w + 4, h * 0.22]], 6, '#4a3a32');
    branch(c, [[w * 0.3, h * 0.6], [w * 0.36, h * 0.3], [w * 0.44, h * 0.18]], 3.5, '#4a3a32');
    branch(c, [[w * 0.66, h * 0.5], [w * 0.7, h * 0.78]], 3, '#4a3a32');
    for (const [x, y, r, p] of [[0.12, 0.7, 9, 0], [0.33, 0.45, 10, 1], [0.42, 0.22, 8, 0], [0.5, 0.6, 11, 0], [0.62, 0.5, 8, 1], [0.7, 0.75, 9, 0], [0.84, 0.3, 10, 1], [0.95, 0.2, 7, 0], [0.25, 0.58, 6, 1]]) {
      flower(c, w * x, h * y, r, p ? '#f4b6c4' : '#d9485f', '#f6d36a', x * 7);
    }
  },
  // 3月: rape blossom under a spring sky
  (c, w, h, r) => {
    sky(c, w, h, '#bfe0f4', '#eaf5f6');
    cloud(c, w * 0.75, h * 0.25, 12);
    c.fillStyle = '#86bd62';
    c.fillRect(0, h * 0.55, w, h * 0.45);
    for (let k = 0; k < 70; k++) {
      const x = r() * w, y = h * 0.5 + r() * h * 0.5;
      c.strokeStyle = '#5f9a44';
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + 1, y + 12);
      c.stroke();
      for (let j = 0; j < 4; j++) dot(c, x + (r() - 0.5) * 7, y + (r() - 0.5) * 5, 1.8 + r(), j % 2 ? '#f7dc3c' : '#f2c81e');
    }
  },
  // 4月: cherry blossom, petals in the air
  (c, w, h, r) => {
    sky(c, w, h, '#c8e3f6', '#f7eef2');
    branch(c, [[-4, h * 0.18], [w * 0.28, h * 0.3], [w * 0.55, h * 0.26], [w * 0.75, h * 0.42]], 5, '#5a463e');
    branch(c, [[w * 0.28, h * 0.3], [w * 0.36, h * 0.58]], 3, '#5a463e');
    branch(c, [[w * 0.55, h * 0.26], [w * 0.68, h * 0.1]], 2.5, '#5a463e');
    for (const [x, y, s] of [[0.06, 0.24, 9], [0.16, 0.34, 10], [0.24, 0.2, 8], [0.33, 0.44, 9], [0.38, 0.6, 8], [0.45, 0.3, 11], [0.55, 0.18, 9], [0.6, 0.36, 10], [0.67, 0.12, 8], [0.72, 0.48, 9], [0.78, 0.38, 7], [0.3, 0.26, 7]]) {
      flower(c, w * x, h * y, s, '#f8cad6', '#e7859f', x * 9);
    }
    for (let k = 0; k < 14; k++) {
      c.fillStyle = '#f6bccb';
      c.beginPath();
      c.ellipse(w * (0.3 + r() * 0.7), h * (0.5 + r() * 0.48), 2.6, 1.6, r() * 3, 0, Math.PI * 2);
      c.fill();
    }
  },
  // 5月: carp streamers in the wind
  (c, w, h) => {
    sky(c, w, h, '#9fd0f2', '#e2f2fb');
    cloud(c, w * 0.78, h * 0.72, 11);
    c.fillStyle = '#8a6a4a';
    c.fillRect(w * 0.12, h * 0.08, 3, h);
    dot(c, w * 0.12 + 1.5, h * 0.08, 3.5, '#e8c45a');
    const carp = (y, len, body, belly) => {
      const x0 = w * 0.12 + 4;
      c.fillStyle = body;
      c.beginPath();
      c.moveTo(x0, y - len * 0.13);
      c.quadraticCurveTo(x0 + len * 0.5, y - len * 0.16, x0 + len * 0.85, y - len * 0.07);
      c.lineTo(x0 + len, y - len * 0.13);
      c.lineTo(x0 + len * 0.93, y);
      c.lineTo(x0 + len, y + len * 0.13);
      c.lineTo(x0 + len * 0.85, y + len * 0.07);
      c.quadraticCurveTo(x0 + len * 0.5, y + len * 0.16, x0, y + len * 0.13);
      c.fill();
      c.fillStyle = belly;
      c.fillRect(x0, y - len * 0.13, len * 0.05, len * 0.26);
      c.strokeStyle = belly;
      c.lineWidth = 1;
      for (let k = 0; k < 3; k++) {
        c.beginPath();
        c.arc(x0 + len * (0.32 + k * 0.16), y, len * 0.07, -0.9, 0.9);
        c.stroke();
      }
      dot(c, x0 + len * 0.12, y - len * 0.02, len * 0.045, '#ffffff');
      dot(c, x0 + len * 0.125, y - len * 0.02, len * 0.022, '#1e2430');
    };
    const sx = w * 0.12 + 4;
    ['#e8564a', '#f2c84a', '#4f8ad0', '#ffffff'].forEach((col, k) => {
      c.fillStyle = col;
      c.fillRect(sx, h * 0.12 + k * 3, w * 0.42, 3);
    });
    carp(h * 0.36, w * 0.62, '#2f3540', '#f2f0ea');
    carp(h * 0.6, w * 0.5, '#e0565a', '#ffe9e0');
    carp(h * 0.82, w * 0.4, '#4a7cc0', '#e6f0ff');
  },
  // 6月: hydrangea in the rain
  (c, w, h, r) => {
    sky(c, w, h, '#dfe8ec', '#eef2ee');
    c.strokeStyle = 'rgba(140, 160, 180, 0.55)';
    c.lineWidth = 1;
    for (let k = 0; k < 40; k++) {
      const x = r() * w * 1.2, y = r() * h;
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x - 4, y + 10);
      c.stroke();
    }
    for (const [x, y, a] of [[0.18, 0.8, -0.5], [0.38, 0.86, 0.4], [0.62, 0.84, -0.3], [0.86, 0.78, 0.5], [0.5, 0.95, 0]]) {
      c.fillStyle = '#5f9a5a';
      c.beginPath();
      c.ellipse(w * x, h * y, 20, 9, a, 0, Math.PI * 2);
      c.fill();
    }
    for (const [cx, cy, rad, cols] of [[0.32, 0.5, 30, ['#7f9be0', '#9aaee8', '#6f88d4']], [0.7, 0.46, 28, ['#b49ade', '#c9b3ea', '#a08ad4']]]) {
      for (let k = 0; k < 46; k++) {
        const a = r() * Math.PI * 2, d = Math.sqrt(r()) * rad;
        const x = w * cx + Math.cos(a) * d, y = h * cy + Math.sin(a) * d * 0.85;
        const col = cols[k % 3];
        for (let j = 0; j < 4; j++) dot(c, x + Math.cos(j * 1.57 + a) * 2.6, y + Math.sin(j * 1.57 + a) * 2.6, 2.4, col);
        dot(c, x, y, 1, '#f4f2ff');
      }
    }
  },
  // 7月: a summer cloud over the sea, a sail
  (c, w, h) => {
    sky(c, w, h, '#6fb6ea', '#cdeafa');
    cloud(c, w * 0.42, h * 0.42, 24);
    cloud(c, w * 0.52, h * 0.24, 17);
    sea(c, w, h, h * 0.68, '#2f7fc0', 'rgba(255, 255, 255, 0.6)');
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.moveTo(w * 0.8, h * 0.44);
    c.lineTo(w * 0.8, h * 0.66);
    c.lineTo(w * 0.7, h * 0.66);
    c.fill();
    c.fillStyle = '#e8564a';
    c.fillRect(w * 0.69, h * 0.66, w * 0.14, 3);
  },
  // 8月: fireworks over the night sea
  (c, w, h) => {
    sky(c, w, h, '#1b2650', '#394a7c');
    for (const [x, y, rad, col] of [[0.3, 0.38, 30, '#ffd75a'], [0.68, 0.3, 24, '#ff8fb0'], [0.84, 0.55, 15, '#8fe0ff']]) {
      c.strokeStyle = col;
      c.lineWidth = 1.4;
      for (let k = 0; k < 18; k++) {
        const a = (k / 18) * Math.PI * 2;
        c.beginPath();
        c.moveTo(w * x + Math.cos(a) * rad * 0.35, h * y + Math.sin(a) * rad * 0.35);
        c.lineTo(w * x + Math.cos(a) * rad * 0.85, h * y + Math.sin(a) * rad * 0.85);
        c.stroke();
        dot(c, w * x + Math.cos(a) * rad, h * y + Math.sin(a) * rad, 1.4, col);
      }
    }
    sea(c, w, h, h * 0.76, '#18213f', 'rgba(255, 215, 120, 0.45)');
  },
  // 9月: the harvest moon, pampas grass, moon-viewing dumplings
  (c, w, h) => {
    sky(c, w, h, '#26375f', '#4d6194');
    dot(c, w * 0.66, h * 0.34, 20, '#fff2b8');
    c.strokeStyle = '#d7c69e';
    c.lineWidth = 1.6;
    for (const [x, lean] of [[0.12, 0.3], [0.2, 0.5], [0.28, 0.2], [0.36, 0.55], [0.9, -0.4]]) {
      const bx = w * x, tx = bx + lean * 40, ty = h * 0.3;
      c.beginPath();
      c.moveTo(bx, h);
      c.quadraticCurveTo(bx + lean * 10, h * 0.6, tx, ty);
      c.stroke();
      for (let k = 0; k < 6; k++) {
        c.beginPath();
        c.moveTo(tx - lean * k * 2, ty + k * 3);
        c.lineTo(tx - lean * k * 2 + 7, ty + k * 3 + 6);
        c.stroke();
      }
    }
    c.fillStyle = '#c9a874';
    c.fillRect(w * 0.7, h * 0.86, 36, 4);
    c.fillRect(w * 0.7 + 8, h * 0.9, 20, h * 0.1);
    for (const [dx, dy] of [[6, -4], [15, -4], [24, -4], [33, -4], [10.5, -11], [19.5, -11], [28.5, -11], [15, -18], [24, -18], [19.5, -25]]) {
      dot(c, w * 0.7 + dx - 1.5, h * 0.86 + dy, 4.5, '#fbf8ee');
    }
  },
  // 10月: maple leaves
  (c, w, h, r) => {
    sky(c, w, h, '#f6eedc', '#efe2c8');
    for (let k = 0; k < 13; k++) {
      const x = w * (0.08 + r() * 0.84), y = h * (0.12 + r() * 0.76), s = 9 + r() * 7, a = r() * Math.PI * 2;
      const col = ['#d9452f', '#ec7a36', '#e7a93a', '#c2342e'][k % 4];
      c.save();
      c.translate(x, y);
      c.rotate(a);
      c.fillStyle = col;
      c.beginPath();
      for (let j = 0; j < 14; j++) {
        const lobe = j % 2 === 0, t = (j / 14) * Math.PI * 2 - Math.PI / 2, rr = lobe ? s * (j === 6 || j === 8 ? 0.6 : 1) : s * 0.38;
        if (j === 7) continue;
        c.lineTo(Math.cos(t) * rr, Math.sin(t) * rr);
      }
      c.closePath();
      c.fill();
      c.strokeStyle = col;
      c.lineWidth = 1.2;
      c.beginPath();
      c.moveTo(0, 0);
      c.lineTo(0, s * 0.9);
      c.stroke();
      c.restore();
    }
  },
  // 11月: ginkgo leaves
  (c, w, h, r) => {
    sky(c, w, h, '#f3ecd6', '#ebe0c4');
    for (let k = 0; k < 14; k++) {
      const x = w * (0.08 + r() * 0.84), y = h * (0.15 + r() * 0.75), s = 11 + r() * 6, a = r() * Math.PI * 2;
      c.save();
      c.translate(x, y);
      c.rotate(a);
      c.fillStyle = k % 3 ? '#f0c63a' : '#e2a826';
      c.beginPath();
      c.moveTo(0, 0);
      c.arc(0, 0, s, -Math.PI / 2 - 0.95, -Math.PI / 2 - 0.08);
      c.lineTo(0, -s * 0.72);
      c.arc(0, 0, s, -Math.PI / 2 + 0.08, -Math.PI / 2 + 0.95);
      c.closePath();
      c.fill();
      c.strokeStyle = '#c99a2a';
      c.lineWidth = 1.2;
      c.beginPath();
      c.moveTo(0, 0);
      c.lineTo(0, s * 0.55);
      c.stroke();
      c.restore();
    }
  },
  // 12月: a camellia in the snow
  (c, w, h, r) => {
    sky(c, w, h, '#a8c2e2', '#e8eff8');
    for (const [x, y, a] of [[0.3, 0.62, -0.6], [0.62, 0.66, 0.5], [0.44, 0.8, 0.1], [0.74, 0.42, -0.2]]) {
      c.fillStyle = '#2f5a3c';
      c.beginPath();
      c.ellipse(w * x, h * y, 22, 10, a, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = '#4f7d5a';
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(w * x - Math.cos(a) * 18, h * y - Math.sin(a) * 18);
      c.lineTo(w * x + Math.cos(a) * 18, h * y + Math.sin(a) * 18);
      c.stroke();
    }
    flower(c, w * 0.48, h * 0.48, 26, '#c8343e', '#f4d24a', 0.3);
    flower(c, w * 0.8, h * 0.66, 15, '#d64650', '#f4d24a', 1.2);
    for (let k = 0; k < 40; k++) dot(c, r() * w, r() * h, 1 + r() * 1.6, 'rgba(255, 255, 255, 0.9)');
  },
];
