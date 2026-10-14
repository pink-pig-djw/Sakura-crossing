// How long she has been up, and what that does to her.
//
// The town keeps one clock that only runs forward (TimeOfDay.abs: hours since the midnight
// before the first day): the flowing time, a jump to another time of day (on to the next time
// that hour comes round, so the hours skipped count), and her nights in bed all move it on.
// She got up at 7:00 on the first morning.
//
// - She can go to sleep once she has been up MIN_AWAKE hours by that clock, not before.
// - How long she sleeps follows how tired she is: half as long as she has been up, never more
//   than MAX_SLEEP hours (to the nearest 5 minutes).
// - Up more than TIRED_AFTER hours, she is tired: she walks slower and cannot run fast, yawns,
//   her eyes grow heavy (systems/avatar.js, systems/player.js), until she has slept.

export const WAKE_HOUR = 7;
export const MIN_AWAKE = 8;
export const MAX_SLEEP = 8;
export const TIRED_AFTER = 20;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class Body {
  constructor(tod) {
    this.tod = tod;
    this.reset();
  }

  // the first morning: up since 7:00 (yesterday's, if it is not yet 7)
  reset() {
    const h = this.tod.hour;
    this.tod.abs = 24 + h;
    this.woke = 24 + WAKE_HOUR - (h < WAKE_HOUR ? 24 : 0);
    this.nights = 0;
  }

  // hours since she got up
  get awake() {
    return Math.max(0, this.tod.abs - this.woke);
  }

  get canSleep() {
    return this.awake >= MIN_AWAKE - 1e-6;
  }

  // hours until she can sleep again
  get untilSleepy() {
    return Math.max(0, MIN_AWAKE - this.awake);
  }

  // how long she would sleep now (hours)
  get sleepFor() {
    return Math.round(clamp(this.awake / 2, 0.5, MAX_SLEEP) * 12) / 12;
  }

  // 0 (fine) .. 1: how tired, from TIRED_AFTER hours up (a little) to four hours on (worn out)
  get tiredness() {
    const over = this.awake - TIRED_AFTER;
    return over <= 0 ? 0 : clamp(0.35 + over / 6, 0, 1);
  }

  get tired() {
    return this.awake > TIRED_AFTER;
  }

  // a night's sleep of `hours`: the clock moves on, she wakes up rested
  sleep(hours) {
    this.tod.setHour(this.tod.hour + hours);
    this.woke = this.tod.abs;
    this.nights++;
  }
}

// "7時間40分" / "7小时40分钟" style lengths (the hours rounded to minutes)
export function hoursMinutes(h) {
  const m = Math.round(h * 60);
  return { h: Math.floor(m / 60), m: m % 60 };
}
