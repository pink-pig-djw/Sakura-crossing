// さくら一周ライン's lap timer. Riding east over the START / GOAL line at the cycle station
// starts a lap; the places on the way (the harbour, the windmill hill, the torii, the tunnel,
// the cape) are passed in order; back over the line with all of them behind you, the lap is
// timed and the best kept (in this browser). A shortcut or a turn back simply starts afresh.

const KEY = 'sakura-lap-best';

function load() {
  try {
    const v = parseFloat(localStorage.getItem(KEY));
    return v > 0 ? v : null;
  } catch {
    return null;
  }
}

function save(v) {
  try {
    localStorage.setItem(KEY, String(v));
  } catch {
    /* storage unavailable */
  }
}

export function lapTime(s) {
  // (rounded to the tenth first, so 59.96 reads 1:00.0, not 0:60.0)
  const d = Math.round(s * 10);
  const m = Math.floor(d / 600), r = d - m * 600;
  return `${m}:${String(Math.floor(r / 10)).padStart(2, '0')}.${r % 10}`;
}

export class LapTimer {
  // gate: { x, z0, z1 } (the line, crossed going +x); checkpoints: [{ x, z, r }] in order
  constructor(gate, checkpoints) {
    this.gate = gate;
    this.cps = checkpoints;
    this.running = false;
    this.t = 0;
    this.next = 0;
    this.best = load();
    this.prevX = null;
  }

  // one step; returns what happened: { kind: 'start' | 'cp' | 'lap', ... } or null
  update(dt, x, z, riding) {
    let ev = null;
    if (this.running) {
      this.t += dt;
      // (an hour out is not a lap any more)
      if (this.t > 3600) this.running = false;
    }
    const g = this.gate;
    const crossed = this.prevX !== null && this.prevX < g.x && x >= g.x && x - this.prevX < 5 && z > g.z0 && z < g.z1;
    this.prevX = x;
    // (on the bike: a walk past a checkpoint doesn't count it)
    if (this.running && riding && this.next < this.cps.length) {
      const c = this.cps[this.next];
      if (Math.hypot(x - c.x, z - c.z) < c.r) {
        this.next++;
        ev = { kind: 'cp', n: this.next, of: this.cps.length };
      }
    }
    if (crossed && riding) {
      if (this.running && this.next >= this.cps.length) {
        const time = this.t;
        const isBest = !this.best || time < this.best;
        if (isBest) {
          this.best = time;
          save(time);
        }
        ev = { kind: 'lap', time, best: this.best, isBest };
      } else ev = { kind: 'start' };
      this.running = true;
      this.t = 0;
      this.next = 0;
    }
    return ev;
  }
}
