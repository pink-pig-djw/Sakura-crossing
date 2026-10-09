// Xbox-style controller support through the standard Gamepad API mapping.
//
//  Left stick  move          Right stick  look
//  A  interact / confirm     B  back / stand up
//  X  jump                   Y  map
//  LB / RB  time of day      RT (hold) or L-stick click  run
//  Menu  pause menu          View  map
//  D-pad / left stick  move focus inside menus

const BTN = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, VIEW: 8, MENU: 9, LS: 10, RS: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };

function deadzone(x, y, dz = 0.16) {
  const m = Math.hypot(x, y);
  if (m < dz) return [0, 0, 0];
  const k = Math.min(1, (m - dz) / (1 - dz));
  return [(x / m) * k, (y / m) * k, k];
}

export class GamepadInput {
  constructor() {
    this.index = null;
    this.connected = false;
    this.prev = new Array(17).fill(false);
    this.handlers = {};
    this.move = { x: 0, y: 0 };
    this.look = { x: 0, y: 0 };
    this.run = false;
    this.runToggle = false;
    this.navCooldown = 0;
    this.lastUsed = 0;
    this.available = typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function';
    if (!this.available) return;
    addEventListener('gamepadconnected', (e) => {
      if (this.index === null) this.index = e.gamepad.index;
      this.connected = true;
      this.emit('connect', e.gamepad.id);
    });
    addEventListener('gamepaddisconnected', (e) => {
      if (e.gamepad.index === this.index) {
        this.index = null;
        this.connected = false;
        this.move.x = this.move.y = this.look.x = this.look.y = 0;
        this.emit('disconnect');
      }
    });
  }

  on(name, fn) {
    this.handlers[name] = fn;
  }
  emit(name, ...a) {
    this.handlers[name]?.(...a);
  }

  pad() {
    if (!this.available) return null;
    let pads;
    try {
      pads = navigator.getGamepads();
    } catch {
      // blocked (e.g. by a frame permissions policy)
      this.available = false;
      return null;
    }
    if (this.index !== null && pads[this.index]) return pads[this.index];
    for (const p of pads) {
      if (p && p.connected) {
        this.index = p.index;
        if (!this.connected) {
          this.connected = true;
          this.emit('connect', p.id);
        }
        return p;
      }
    }
    return null;
  }

  rumble(weak = 0.25, strong = 0.1, ms = 120) {
    const p = this.pad();
    const act = p?.vibrationActuator;
    if (act?.playEffect) act.playEffect('dual-rumble', { duration: ms, weakMagnitude: weak, strongMagnitude: strong }).catch?.(() => {});
  }

  // Poll once per frame. `mode` decides whether presses drive gameplay or menu focus.
  poll(dt, mode) {
    const p = this.pad();
    if (!p) {
      this.move.x = this.move.y = this.look.x = this.look.y = 0;
      return;
    }
    const b = (i) => {
      const x = p.buttons[i];
      return x ? x.pressed || x.value > 0.5 : false;
    };
    const val = (i) => (p.buttons[i] ? p.buttons[i].value : 0);
    const [mx, my] = deadzone(p.axes[0] || 0, p.axes[1] || 0);
    const [lx, ly, lk] = deadzone(p.axes[2] || 0, p.axes[3] || 0, 0.14);
    this.move.x = mx;
    this.move.y = -my;
    // response curve: precise near the centre, fast at full tilt
    const curve = lk > 0 ? Math.pow(lk, 1.8) / lk : 0;
    this.look.x = lx * curve;
    this.look.y = ly * curve;
    this.run = this.runToggle || val(BTN.RT) > 0.45;
    const any = mx || my || lx || ly || p.buttons.some((x) => x && x.pressed);
    if (any) {
      this.lastUsed = performance.now();
      this.emit('active');
    }

    // edge-triggered buttons
    const pressed = [];
    for (let i = 0; i < 17; i++) {
      const now = b(i);
      if (now && !this.prev[i]) pressed.push(i);
      this.prev[i] = now;
    }
    const menuish = mode === 'menu' || mode === 'map' || mode === 'omikuji';
    for (const i of pressed) {
      if (i === BTN.LS) this.runToggle = !this.runToggle;
      if (mode === 'title') {
        if (i === BTN.A || i === BTN.MENU) this.emit('start');
      } else if (mode === 'play') {
        if (i === BTN.A) this.emit('interact');
        else if (i === BTN.B) this.emit('back');
        else if (i === BTN.X) this.emit('jump');
        else if (i === BTN.Y) this.emit('map');
        else if (i === BTN.VIEW) this.emit('minimap');
        else if (i === BTN.RS) this.emit('view');
        else if (i === BTN.MENU) this.emit('menu');
        else if (i === BTN.LB) this.emit('time', -1);
        else if (i === BTN.RB) this.emit('time', 1);
      } else if (menuish) {
        if (i === BTN.A) this.emit('confirm');
        else if (i === BTN.B || i === BTN.MENU || (mode === 'map' && (i === BTN.Y || i === BTN.VIEW))) this.emit('close');
        else if (i === BTN.UP) this.emit('nav', 0, -1);
        else if (i === BTN.DOWN) this.emit('nav', 0, 1);
        else if (i === BTN.LEFT) this.emit('nav', -1, 0);
        else if (i === BTN.RIGHT) this.emit('nav', 1, 0);
      }
    }
    // left stick also navigates menus (with repeat delay)
    if (menuish) {
      this.navCooldown -= dt;
      if (this.navCooldown <= 0 && (Math.abs(mx) > 0.6 || Math.abs(my) > 0.6)) {
        if (Math.abs(mx) > Math.abs(my)) this.emit('nav', Math.sign(mx), 0);
        else this.emit('nav', 0, Math.sign(my));
        this.navCooldown = 0.22;
      } else if (Math.abs(mx) < 0.3 && Math.abs(my) < 0.3) this.navCooldown = 0;
    }
  }
}

// Spatial focus navigation for menus driven by the controller.
export function moveFocus(root, dx, dy) {
  const items = [...root.querySelectorAll('button:not([hidden]), input')].filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && !el.closest('[hidden]');
  });
  if (!items.length) return;
  let cur = document.activeElement;
  if (!items.includes(cur)) {
    focusEl(items[0]);
    return;
  }
  // left/right on a slider adjusts its value instead of moving focus
  if (dx !== 0 && cur.type === 'range') {
    const step = (Number(cur.max) - Number(cur.min)) / 20;
    cur.value = String(Math.min(Number(cur.max), Math.max(Number(cur.min), Number(cur.value) + dx * step)));
    cur.dispatchEvent(new Event('input', { bubbles: true }));
    return;
  }
  const a = cur.getBoundingClientRect();
  const ax = a.left + a.width / 2, ay = a.top + a.height / 2;
  let best = null, bs = Infinity;
  for (const el of items) {
    if (el === cur) continue;
    const r = el.getBoundingClientRect();
    const bx = r.left + r.width / 2, by = r.top + r.height / 2;
    const vx = bx - ax, vy = by - ay;
    const along = vx * dx + vy * dy;
    if (along <= 4) continue;
    const across = Math.abs(vx * dy) + Math.abs(vy * dx);
    const s = along + across * 2.2;
    if (s < bs) {
      bs = s;
      best = el;
    }
  }
  if (best) focusEl(best);
}

export function focusEl(el) {
  document.querySelectorAll('.gp-focus').forEach((x) => x.classList.remove('gp-focus'));
  el.classList.add('gp-focus');
  try {
    el.focus({ preventScroll: false, focusVisible: true });
  } catch {
    el.focus();
  }
  el.scrollIntoView?.({ block: 'nearest' });
}

export function activateFocused(root) {
  const el = document.activeElement;
  if (!el || !root.contains(el)) {
    moveFocus(root, 0, 1);
    return;
  }
  if (el.type === 'checkbox') {
    el.checked = !el.checked;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  } else if (el.type !== 'range') el.click();
}
