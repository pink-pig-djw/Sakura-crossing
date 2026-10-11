import * as THREE from 'three';
import { PAT } from '../core/builder.js';
import { route, roadDist, wallBy, VERGE, RS, BORE, BRIDGE, HARBOR, RAIL_GAPS } from './routeplan.js';
import { PROM, SEAWALL_Z, groundH } from './layout.js';
import { FONTS, drawBoard } from '../render/atlas.js';

// さくら一周ライン, the part that is built: the carriageway of every new leg (the hills were
// shaped for it in routeplan.js), the blue guide line along the promenade, railings along
// both sides of the hill roads (where the walk is kept to the road), the deck over the gorge
// and the walk and camera limits in the tunnel.

const _c = new THREE.Color();
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// left of the way the loop runs (x east, z south, y up)
const leftOf = (o) => [o.tz, -o.tx];

// a ribbon along samples S, from u0 to u1 across (u: metres from the left edge of a road
// `w` wide), y = the road's own height (+ lift)
function ribbon(ctx, S, w, u0, u1, style, lift = 0.004) {
  _c.setRGB(w / 20, 0, 0);
  for (let i0 = 0; i0 < S.length - 1; i0 += 24) {
    const i1 = Math.min(S.length - 1, i0 + 24);
    const mid = S[(i0 + i1) >> 1];
    const b = ctx.builders.get('road', mid.x, mid.z);
    const base = b.count;
    for (let i = i0; i <= i1; i++) {
      const o = S[i];
      const [lx, lz] = leftOf(o);
      for (const u of [u0, u1]) {
        const off = w / 2 - u;
        b.vtx(o.x + lx * off, o.y + lift, o.z + lz * off, 0, 1, 0, _c, u, o.s, style);
      }
    }
    for (let i = 0; i < i1 - i0; i++) {
      const p = base + i * 2;
      b.idx.push(p, p + 1, p + 2, p + 1, p + 3, p + 2);
    }
  }
}

// ---------------------------------------------------------------------------
// railings (栏杆): low and open, so the view goes on over them
// ---------------------------------------------------------------------------
// post spacing, height, post and rail colours, rail heights (fractions of h)
const RAILS = {
  // dark-stained timber railing of the forest roads (posts and two square rails)
  wood: { gap: 2.0, h: 1.0, post: 0x5e4632, rail: 0x6e5238, rails: [0.48, 0.94], square: true },
  // white pipe railing (ガードパイプ) of the plateau and the cape
  white: { gap: 2.0, h: 1.0, post: 0xf0efe8, rail: 0xf4f3ee, rails: [0.36, 0.66, 0.95], r: 0.035 },
  // galvanised pipe on the mikan farm road
  pipe: { gap: 2.2, h: 0.95, post: 0xa8adb0, rail: 0xb4b9bc, rails: [0.5, 0.94], r: 0.03 },
  // stakes and a straw rope along the tea fields and the paddies
  rope: { gap: 1.8, h: 0.8, post: 0x7d6246, rail: 0xc8b484, rails: [0.72], r: 0.018, sag: 0.07, stake: true },
  // bamboo railing (posts and three poles) through the grove
  bamboo: { gap: 1.8, h: 0.95, post: 0xa99a5e, rail: 0xb8a96c, rails: [0.3, 0.62, 0.92], r: 0.032, nodes: true },
  // stone posts and beams (玉垣) outside the torii
  stone: { gap: 1.5, h: 0.85, post: 0xa9a49a, rail: 0xb3aea4, rails: [0.86], square: true, stoneTop: true },
  // vermilion railing over the gorge
  red: { gap: 1.6, h: 1.1, post: 0xc8402e, rail: 0xd24a34, rails: [0.12, 0.98], square: true, giboshi: true },
};

function railRun(ctx, pts, kind) {
  const R = RAILS[kind];
  if (pts.length < 2) return;
  // posts at even spacing along the run
  const posts = [pts[0]];
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    acc += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
    if (acc >= R.gap - 0.05 || i === pts.length - 1) {
      posts.push(pts[i]);
      acc = 0;
    }
  }
  for (let i = 0; i < posts.length; i++) {
    const p = posts[i];
    const b = ctx.builders.get('toon', p.x, p.z);
    if (R.square) {
      const t = kind === 'stone' ? 0.16 : kind === 'red' ? 0.14 : 0.12;
      b.box(p.x, p.y + R.h / 2 - 0.15, p.z, t, R.h + 0.3, t, { color: R.post, pattern: kind === 'stone' ? PAT.STONE : kind === 'wood' ? PAT.BOARDS : 0, ao: 0.15 });
      if (R.giboshi) b.cyl(p.x, p.y + R.h + 0.15, p.z, 0.075, 0.0, 0.16, 6, 0xc9a646, PAT.METAL);
      if (R.stoneTop) b.box(p.x, p.y + R.h + 0.17, p.z, t + 0.04, 0.05, t + 0.04, { color: 0x9c978d, pattern: PAT.STONE });
    } else {
      const pr = R.stake ? 0.045 : kind === 'bamboo' ? 0.04 : 0.042;
      b.cyl(p.x, p.y - 0.25, p.z, pr, pr * (R.stake ? 0.7 : 1), R.h + 0.27, 6, R.post, R.stake ? PAT.BARK : 0, { ao: 0.2 });
      if (R.nodes) b.cyl(p.x, p.y + R.h * 0.55, p.z, pr * 1.18, pr * 1.18, 0.025, 6, 0x8f8150);
    }
  }
  for (let i = 0; i < posts.length - 1; i++) {
    const p = posts[i], q = posts[i + 1];
    const b = ctx.builders.get('toon', p.x, p.z).detail;
    for (const f of R.rails) {
      const ya = p.y + R.h * f, yb = q.y + R.h * f;
      if (R.square) {
        const t = kind === 'stone' ? 0.13 : 0.08;
        b.wall(p.x, p.z, q.x, q.z, Math.min(ya, yb) - t / 2, Math.max(ya, yb) + t / 2, t, { color: R.rail, pattern: kind === 'stone' ? PAT.STONE : kind === 'wood' ? PAT.BOARDS : 0 });
      } else if (R.sag) {
        // a rope hangs between its stakes
        const n = 4, pts3 = [];
        for (let k = 0; k <= n; k++) {
          const t = k / n;
          pts3.push(V(p.x + (q.x - p.x) * t, ya + (yb - ya) * t - Math.sin(t * Math.PI) * R.sag, p.z + (q.z - p.z) * t));
        }
        b.tube(pts3, R.r, 4, R.rail);
      } else b.rod(V(p.x, ya, p.z), V(q.x, yb, q.z), R.r, R.r, 5, R.rail);
    }
    ctx.colliders.addSegment(p.x, p.z, q.x, q.z, 0.22, Math.max(p.y, q.y) + R.h);
  }
}

// the railings along one side of a leg, `off` metres out (signed: + left), as runs broken
// where another road comes near (junctions, the inside of hairpins), at the openings, in
// the tunnel and over the bridge
function legRailings(ctx, leg, side, off, kind, skip) {
  const S = leg.samples;
  let run = [];
  const flush = () => {
    if (run.length > 2) railRun(ctx, run, kind);
    run = [];
  };
  for (let i = 0; i < S.length; i++) {
    const o = S[i];
    const [lx, lz] = leftOf(o);
    const p = { x: o.x + lx * off * side, z: o.z + lz * off * side, y: o.y };
    const blocked = skip(o, p) || roadDist(p.x, p.z) < off - 0.35 || RAIL_GAPS.some(([gx, gz, r]) => Math.hypot(p.x - gx, p.z - gz) < r);
    if (blocked) flush();
    else run.push(p);
  }
  flush();
}

// ---------------------------------------------------------------------------
// retaining walls (擁壁): where a road runs close above another and the ground between them
// can't fall away gently, the upper road's edge is held up by a wall with a coping on top
// ---------------------------------------------------------------------------
const WALLS = {
  zuido: { color: 0x8c8478, pattern: PAT.STONE },
  misaki: { color: 0x9a9284, pattern: PAT.STONE },
};
const BLOCK_WALL = { color: 0xb4b0a6, pattern: PAT.BLOCK, drains: true };

function retainingWalls(ctx, rt) {
  rt.legs.forEach((leg, li) => {
    // (the bridge's ends are its abutments)
    if (leg.existing || leg.id === 'sawa') return;
    const st = WALLS[leg.id] ?? BLOCK_WALL;
    const S = leg.samples;
    const half = leg.w / 2 + VERGE;
    for (const side of [-1, 1]) {
      const at = (o, t) => {
        const [lx, lz] = leftOf(o);
        return [o.x + lx * side * t, o.z + lz * side * t];
      };
      const need = S.map((o) => [0.5, 1.5, 2.5, 3.5, 4.5].some((t) => wallBy(...at(o, half + t)) === li) && o.y - groundH(...at(o, half + 1.5)) > 0.8);
      // close small gaps, run on a little past the ends, drop odd samples
      for (let i = 0, last = -99; i < S.length; i++) {
        if (!need[i]) continue;
        if (i - last > 1 && i - last <= 5) for (let j = last + 1; j < i; j++) need[j] = true;
        last = i;
      }
      const runs = [];
      for (let i = 0; i < S.length; i++) {
        if (!need[i]) continue;
        let j = i;
        while (j + 1 < S.length && need[j + 1]) j++;
        if (j - i >= 4) runs.push([Math.max(0, i - 2), Math.min(S.length - 1, j + 2)]);
        i = j;
      }
      for (const [i0, i1] of runs) {
        let drain = 0;
        for (let i = i0; i < i1; i++) {
          const p = S[i], q = S[i + 1];
          const [ax, az] = at(p, half + 0.3), [bx, bz] = at(q, half + 0.3);
          const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz) || 1;
          const ex = (dx / l) * 0.04, ez = (dz / l) * 0.04;
          const top = (p.y + q.y) / 2 + 0.45;
          const foot = Math.min(groundH(...at(p, half + 1.0)), groundH(...at(q, half + 1.0)), groundH(...at(p, half + 2.0))) - 0.4;
          const b = ctx.builders.get('toon', ax, az);
          b.wall(ax - ex, az - ez, bx + ex, bz + ez, foot, top, 1.0, { color: st.color, pattern: st.pattern, ao: 0.12 });
          b.wall(ax - ex, az - ez, bx + ex, bz + ez, top, top + 0.08, 1.12, { color: 0xc9c5bb, pattern: PAT.CONCRETE });
          // weep holes every few metres down the face
          if (st.drains && top - foot > 1.8 && (drain += l) > 3) {
            drain = 0;
            const [hx, hz] = at(p, half + 0.81);
            b.box(hx, foot + 0.4 + (top - foot - 0.4) * 0.35, hz, 0.12, 0.12, 0.04, { color: 0x3a3834, ry: Math.atan2(-dz, dx) });
          }
        }
      }
    }
  });
}

// ---------------------------------------------------------------------------
// signs: a board on two posts (both faces printed), the name of each stretch where it
// begins, a post every 500 m round the loop, the loop's map at the station
// ---------------------------------------------------------------------------
function signBoard(ctx, x, y, z, ry, uv, w, h, lift, o = {}) {
  const b = ctx.builders.get('toon', x, z);
  const sb = ctx.builders.get(o.page === 2 ? 'sign2' : 'sign', x, z);
  const c = Math.cos(ry), sn = Math.sin(ry);
  // the board's plane: across = (c, -sn) in xz, facing (sn, c)
  for (const e of [-1, 1]) {
    // posts just outside the frame, so neither face is hidden behind them
    const px = x + c * (w / 2 + 0.11) * e, pz = z - sn * (w / 2 + 0.11) * e;
    b.box(px, y + (lift + h) / 2 - 0.15, pz, 0.1, lift + h + 0.3, 0.1, { color: o.post ?? 0x6e5238, pattern: PAT.BOARDS, ry });
  }
  b.box(x, y + lift + h / 2, z, w + 0.12, h + 0.12, 0.08, { color: o.frame ?? 0x5e4632, ry });
  const at = (u, v, f) => V(x + c * (u - 0.5) * w * f + sn * 0.05 * f, y + lift + v * h, z - sn * (u - 0.5) * w * f + c * 0.05 * f);
  for (const f of [1, -1]) {
    // front (facing +(sn, c)) and back, each reading left to right
    const a = at(0, 0, f), bb = at(1, 0, f), cc = at(1, 1, f), d = at(0, 1, f);
    sb.quad(a, bb, cc, d, 0xffffff, 0.35, { uvs: [[uv.u0, uv.v0], [uv.u1, uv.v0], [uv.u1, uv.v1], [uv.u0, uv.v1]] });
  }
  ctx.colliders.addBox(x, z, w / 2, 0.12, -ry, y + lift + h);
}

// the loop as a cycling map: numbered stops, a key and the climb along the bottom
function drawRouteMap(c, w, h, legs) {
  const head = 56, foot = 96;
  c.fillStyle = '#f6f1e4';
  c.fillRect(0, 0, w, h);
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const l of legs) for (const o of l.samples) {
    x0 = Math.min(x0, o.x); x1 = Math.max(x1, o.x); z0 = Math.min(z0, o.z); z1 = Math.max(z1, o.z);
  }
  const pad = 26, top = head + 18, bottom = h - foot - 10;
  const k = Math.min((w - pad * 2) / (x1 - x0), (bottom - top) / (z1 - z0));
  const ox = (w - (x1 - x0) * k) / 2;
  const P = (x, z) => [ox + (x - x0) * k, top + (z - z0) * k];
  // land, and the sea up to the shore (the cape and the east headland reach out into it)
  c.fillStyle = '#e3ebcf';
  c.fillRect(0, head, w, bottom + 10 - head);
  const shore = new Float32Array(w).fill(74);
  for (const l of legs) for (const o of l.samples) {
    const px = Math.round(P(o.x, o.z)[0]);
    for (let i = Math.max(0, px - 7); i <= Math.min(w - 1, px + 7); i++) shore[i] = Math.max(shore[i], o.z + 7);
  }
  c.fillStyle = '#b3d9ec';
  for (let i = 0; i < w; i++) {
    const sy = P(0, shore[i])[1];
    c.fillRect(i, sy, 1, bottom + 10 - sy);
  }
  c.fillStyle = '#3f7fbf';
  c.fillRect(0, 0, w, head);
  c.fillStyle = '#ffffff';
  c.font = `700 30px ${FONTS.gothic}`;
  c.textAlign = 'left';
  c.textBaseline = 'middle';
  c.fillText('さくら一周ライン  サイクリングマップ', 18, head / 2 + 1);
  c.lineCap = 'round';
  c.lineJoin = 'round';
  for (const pass of [0, 1]) {
    for (const l of legs) {
      c.beginPath();
      l.samples.forEach((o, i) => (i ? c.lineTo(...P(o.x, o.z)) : c.moveTo(...P(o.x, o.z))));
      c.strokeStyle = pass === 0 ? '#ffffff' : l.spine ? '#4f97cf' : '#ee5f7a';
      c.lineWidth = pass === 0 ? 9 : 5;
      c.setLineDash(pass === 1 && l.spine ? [9, 7] : []);
      c.stroke();
    }
  }
  c.setLineDash([]);
  // numbered stops halfway along each stretch, keyed below
  const stops = legs.filter((l) => !l.existing || l.id === 'coastW');
  const dot = (x, y, n, col) => {
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.arc(x, y, 11, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = col;
    c.beginPath();
    c.arc(x, y, 9, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#ffffff';
    c.font = `700 ${n > 9 ? 11 : 13}px ${FONTS.gothic}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(String(n), x, y + 1);
  };
  stops.forEach((l, i) => {
    const o = l.samples[l.samples.length >> 1];
    dot(...P(o.x, o.z), i + 1, l.spine ? '#4f97cf' : '#d9485f');
  });
  // you are here
  const [hx, hy] = P(214, 70.75);
  c.fillStyle = '#c0392b';
  c.beginPath();
  c.moveTo(hx, hy);
  c.lineTo(hx - 8, hy - 14);
  c.arc(hx, hy - 16, 8, Math.PI * 0.85, Math.PI * 0.15);
  c.closePath();
  c.fill();
  c.font = `700 16px ${FONTS.gothic}`;
  c.textAlign = 'left';
  c.textBaseline = 'alphabetic';
  c.fillText('現在地', hx + 10, hy - 12);
  // north
  c.fillStyle = '#273049';
  c.beginPath();
  c.moveTo(w - 30, head + 14);
  c.lineTo(w - 38, head + 34);
  c.lineTo(w - 22, head + 34);
  c.closePath();
  c.fill();
  c.font = `700 13px ${FONTS.latin}`;
  c.textAlign = 'center';
  c.fillText('N', w - 30, head + 48);
  // the key
  c.fillStyle = '#fbf8ef';
  c.fillRect(0, h - foot, w, foot);
  c.fillStyle = '#d8cfb8';
  c.fillRect(0, h - foot, w, 2);
  const cols = 4, cw = (w - 24) / cols;
  stops.forEach((l, i) => {
    const cx = 12 + (i % cols) * cw, cy = h - foot + 17 + Math.floor(i / cols) * 22;
    dot(cx + 10, cy, i + 1, l.spine ? '#4f97cf' : '#d9485f');
    c.fillStyle = '#273049';
    c.font = `500 15px ${FONTS.gothic}`;
    c.textAlign = 'left';
    c.textBaseline = 'middle';
    c.fillText(l.spine ? l.name + '（近道）' : l.name, cx + 26, cy + 1);
  });
  // the loop in numbers, worked out from the road itself
  let climb = 0, steep = 0;
  for (const l of legs) {
    if (l.spine) continue;
    const S = l.samples;
    for (let i = 1; i < S.length; i++) climb += Math.max(0, S[i].y - S[i - 1].y);
    for (let i = 0; i + 20 < S.length; i += 2) steep = Math.max(steep, Math.abs(S[i + 20].y - S[i].y) / 20);
  }
  const loop = legs.filter((l) => !l.spine).reduce((a, l) => a + l.length, 0);
  c.fillStyle = '#3f7fbf';
  c.font = `700 15px ${FONTS.gothic}`;
  c.textAlign = 'right';
  c.textBaseline = 'alphabetic';
  c.fillText(`一周 約${(loop / 1000).toFixed(1)}km ・ 反時計回り ・ 登り 約${Math.round(climb / 5) * 5}m ・ 最大勾配 約${Math.round(steep * 100)}%`, w - 14, h - 10);
}

function routeSigns(ctx, rt) {
  const legs = rt.legs;
  // where each new stretch begins: its name on a wooden board, facing the riders coming
  for (const leg of legs) {
    if (leg.existing && leg.id !== 'coastW') continue;
    const S = leg.samples;
    const o = S[Math.min(S.length - 1, leg.existing ? 2 : 5)];
    const [lx, lz] = leftOf(o);
    const off = leg.existing ? 0 : leg.w / 2 + 1.25;
    // (on the promenade: a narrower board at its road-side edge, clear of the way along it)
    const bw = leg.existing ? 1.2 : 1.5;
    const x = leg.existing ? o.x + 1 : o.x + lx * off, z = leg.existing ? PROM.z0 + 0.7 : o.z + lz * off;
    const y = leg.existing ? PROM.y : groundH(x, z);
    const uv = ctx.atlas2.draw('leg:' + leg.id, 256, 72, (c, w, h) => drawBoard(c, w, h, { text: leg.name, bg: '#f2ead8', fg: '#3a2a1c', border: '#6e5238', font: FONTS.mincho ?? FONTS.gothic }));
    signBoard(ctx, x, y, z, Math.atan2(-o.tx, -o.tz), uv, bw, 0.42 * (bw / 1.5), 1.25, { page: 2 });
  }
  // a post every 500 m round the loop (from the station, counterclockwise)
  const order = ['coastE', 'harbor', 'mikan', 'kaze', 'sawa', 'cha', 'torii', 'tanada', 'take', 'zuido', 'misaki', 'coastW'];
  let acc = 0, next = 500;
  for (const id of order) {
    const leg = legs.find((l) => l.id === id);
    for (const o of leg.samples) {
      const s = acc + o.s;
      if (s < next) continue;
      next += 500;
      if (leg.id === 'zuido' && o.z > BORE.z0 - 2 && o.z < BORE.z1 + 2) continue;
      const [lx, lz] = leftOf(o);
      const off = leg.existing ? 0 : leg.w / 2 + 0.9;
      const x = leg.existing ? o.x : o.x + lx * off, z = leg.existing ? 69.2 : o.z + lz * off;
      const y = leg.existing ? PROM.y : groundH(x, z);
      const b = ctx.builders.get('toon', x, z);
      b.box(x, y + 0.45, z, 0.16, 0.9, 0.16, { color: 0xf2f2ee, ry: Math.atan2(o.tx, o.tz) });
      b.box(x, y + 0.92, z, 0.18, 0.06, 0.18, { color: 0x3f7fbf });
      const km = (s / 1000).toFixed(1);
      const uv = ctx.atlas2.draw('km:' + km, 64, 96, (c, w, h) => {
        c.fillStyle = '#f2f2ee';
        c.fillRect(0, 0, w, h);
        c.fillStyle = '#3f7fbf';
        c.font = `700 30px ${FONTS.gothic}`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(km, w / 2, h * 0.4);
        c.font = `700 20px ${FONTS.gothic}`;
        c.fillText('km', w / 2, h * 0.75);
      });
      const sb = ctx.builders.get('sign2', x, z);
      const fx = -o.tx, fz = -o.tz;
      const r = [fz, -fx];
      const q = (u, v) => V(x + fx * 0.085 + r[0] * (u - 0.5) * 0.15, y + 0.3 + v * 0.48, z + fz * 0.085 + r[1] * (u - 0.5) * 0.15);
      sb.quad(q(1, 0), q(0, 0), q(0, 1), q(1, 1), 0xffffff, 0.3, { uvs: [[uv.u0, uv.v0], [uv.u1, uv.v0], [uv.u1, uv.v1], [uv.u0, uv.v1]] });
      ctx.colliders.addCircle(x, z, 0.12);
    }
    acc += leg.length;
  }
  // the loop's map at the station
  const uv = ctx.atlas2.draw('route-map', 768, 448, (c, w, h) => drawRouteMap(c, w, h, legs));
  signBoard(ctx, 208.5, PROM.y, 69.0, Math.PI, uv, 2.7, 1.575, 0.7, { page: 2, post: 0x3f7fbf, frame: 0x2f5f9f });
  ctx.interactables.push({
    kind: 'sign',
    x: 208.5,
    z: 70.2,
    r: 1.8,
    label: '案内板を見る',
    secs: 8,
    text: 'さくら一周ライン。漁港からみかん畑、風車の丘、沢の橋、茶畑、千本鳥居、棚田、竹林、素掘りトンネル、岬の灯台をめぐって、海沿いに戻ってくる約2.6kmの道。真ん中の源流の森を抜ける近道もある。',
  });
}

export function buildCycleRoute(ctx) {
  const rt = route();
  ctx.route = rt;
  for (const leg of rt.legs) {
    const S = leg.samples;
    if (leg.existing) {
      // the blue guide line along the promenade (the loop runs east along both halves)
      if (leg.id === 'coastE' || leg.id === 'coastW') {
        const line = S.map((o) => ({ ...o, z: 70.3, y: PROM.y }));
        ribbon(ctx, line, 0.16, 0, 0.16, RS.BLUE, 0.006);
      }
      continue;
    }
    if (leg.id === 'zuido') {
      // (inside the bore its own floor is drawn with the tunnel, lit by its lamps)
      ribbon(ctx, S.filter((o) => o.z < BORE.z0 + 0.6), leg.w, 0, leg.w, leg.style);
      ribbon(ctx, S.filter((o) => o.z > BORE.z1 - 0.6), leg.w, 0, leg.w, leg.style);
    } else ribbon(ctx, S, leg.w, 0, leg.w, leg.style);
    if (!leg.rail) continue;
    const half = leg.w / 2;
    // the railing stands at the outer edge of the verge; red railings line the bridge deck
    const off = half + VERGE - 0.6;
    const inBore = (o) => leg.id === 'zuido' && o.z > BORE.z0 - 0.6 && o.z < BORE.z1 + 0.6;
    const onBridge = (o) => leg.id === 'sawa' && o.x > BRIDGE.x0 - 0.5 && o.x < BRIDGE.x1 + 0.5;
    // the first and last few metres of a leg that starts or ends in town stay open
    const town = (o) => (leg.id === 'mori' && o.s < 6) || (leg.id === 'misaki' && o.s > leg.length - 6) || (leg.id === 'mikan' && o.s < 3);
    for (const side of [1, -1]) {
      legRailings(ctx, leg, side, off, leg.rail, (o) => inBore(o) || onBridge(o) || town(o));
      if (leg.id === 'sawa') legRailings(ctx, leg, side, half + 0.75, 'red', (o) => !onBridge(o));
    }
  }
  // the ramp down through the gap in the sea wall to the harbour: ridden on the road itself
  // (the promenade's paving stops at the wall)
  const hl = rt.legs.find((l) => l.id === 'harbor');
  const rs = hl.samples.filter((o) => o.s < 26);
  ctx.colliders.addSurface(HARBOR.ramp[0], PROM.z0, HARBOR.ramp[1], SEAWALL_Z + 2.5, (x, z) => {
    if (z < SEAWALL_Z - 0.3) return PROM.y;
    let b = rs[0], bd = Infinity;
    for (const o of rs) {
      const d = (o.x - x) ** 2 + (o.z - z) ** 2;
      if (d < bd) {
        bd = d;
        b = o;
      }
    }
    return bd < (hl.w / 2 + 0.8) ** 2 ? b.y + 0.004 : groundH(x, z);
  }, 2);
  // the deck over the gorge: walked and ridden at the road's height
  const sawa = rt.legs.find((l) => l.id === 'sawa');
  const deckY = (x) => {
    let best = sawa.samples[0];
    for (const o of sawa.samples) if (Math.abs(o.x - x) < Math.abs(best.x - x)) best = o;
    return best.y + 0.004;
  };
  const dy = deckY((BRIDGE.x0 + BRIDGE.x1) / 2);
  ctx.colliders.addSurface(BRIDGE.x0 - 1, BRIDGE.z - 2.6, BRIDGE.x1 + 1, BRIDGE.z + 2.6, (x) => deckY(x), 3, { min: dy - 3, max: dy + 3 });
  // the bore: walked on at the road's height under the hill, walls and roof keep the camera in
  const zl = rt.legs.find((l) => l.id === 'zuido');
  const inBore = zl.samples.filter((o) => o.z >= BORE.z0 - 1 && o.z <= BORE.z1 + 1);
  const yAt = (z) => {
    let best = inBore[0];
    for (const o of inBore) if (Math.abs(o.z - z) < Math.abs(best.z - z)) best = o;
    return best.y;
  };
  const yMid = yAt((BORE.z0 + BORE.z1) / 2);
  ctx.colliders.addSurface(BORE.x - BORE.w / 2, BORE.z0 - 0.5, BORE.x + BORE.w / 2, BORE.z1 + 0.5, (x, z) => yAt(z) + 0.004, 3, { min: yMid - 3, max: yMid + 3.5 });
  for (const e of [-1, 1]) ctx.colliders.addBox(BORE.x + e * (BORE.w / 2 + 0.25), (BORE.z0 + BORE.z1) / 2, 0.25, (BORE.z1 - BORE.z0) / 2, 0, yMid + BORE.h + 1, yMid - 1);
  (ctx.indoorRects = ctx.indoorRects || []).push({ x0: BORE.x - BORE.w / 2, x1: BORE.x + BORE.w / 2, z0: BORE.z0, z1: BORE.z1, y0: yMid - 2, y1: yMid + BORE.h, tunnel: true });
  retainingWalls(ctx, rt);
  routeSigns(ctx, rt);
  return rt;
}

