// The town's calendar.
//
// The clock that only runs forward (TimeOfDay.abs: hours since the midnight before the first
// day) counts the days too. The first day is Friday 10 April 2026, and a new day begins at
// midnight, so the date moves on with the flowing time, with a jump to another time of day (on
// to the next time that hour comes round) and with her nights in bed alike.
//
// Japanese public holidays (国民の祝日, with the substitute 振替休日 and the in-between
// 国民の休日) are worked out for any year, for the calendar on her wall (world/homedecor.js).

const FIRST_DAY = Date.UTC(2026, 3, 10);
const DAY = 864e5;
const WEEK_JA = ['日', '月', '火', '水', '木', '金', '土'];
const WEEK_ZH = ['日', '一', '二', '三', '四', '五', '六'];

// the day (0 on the first day) at the clock `abs`, the day changing `from` hours past midnight
// (her diary's day runs on to four in the morning)
export function dayIndex(abs, from = 0) {
  return Math.floor((abs - from) / 24) - 1;
}

// { y, m (1..12), d, w (0 Sunday .. 6 Saturday), n (the day: 0 on the first) }
export function dateOf(abs, from = 0) {
  const n = dayIndex(abs, from);
  const t = new Date(FIRST_DAY + n * DAY);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate(), w: t.getUTCDay(), n };
}

export const weekdayName = (w, lang = 'ja') => (lang === 'zh' ? WEEK_ZH : WEEK_JA)[w];

// 「4月10日（金）」, 「4月10日 周五」; with the year 「2026年4月10日（金）」
export function dateLabel(D, lang = 'ja', year = false) {
  const y = year ? `${D.y}年` : '';
  return lang === 'zh' ? `${y}${D.m}月${D.d}日 周${WEEK_ZH[D.w]}` : `${y}${D.m}月${D.d}日（${WEEK_JA[D.w]}）`;
}
// 「4/10（金）」, 「4/10 周五」 (where there is little room)
export function dateShort(D, lang = 'ja') {
  return lang === 'zh' ? `${D.m}/${D.d} 周${WEEK_ZH[D.w]}` : `${D.m}/${D.d}（${WEEK_JA[D.w]}）`;
}

export const weekday = (y, m, d) => new Date(Date.UTC(y, m - 1, d)).getUTCDay();
export const daysIn = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
function shift(y, m, d, k) {
  const t = new Date(Date.UTC(y, m - 1, d + k));
  return [t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()];
}

// ---------------------------------------------------------------------------- holidays
const FIXED = {
  '1-1': '元日',
  '2-11': '建国記念の日',
  '2-23': '天皇誕生日',
  '4-29': '昭和の日',
  '5-3': '憲法記念日',
  '5-4': 'みどりの日',
  '5-5': 'こどもの日',
  '8-11': '山の日',
  '11-3': '文化の日',
  '11-23': '勤労感謝の日',
};
// (the Mondays: [month, which Monday])
const MONDAYS = { 成人の日: [1, 2], 海の日: [7, 3], 敬老の日: [9, 3], スポーツの日: [10, 2] };

function namedHoliday(y, m, d) {
  const f = FIXED[`${m}-${d}`];
  if (f) return f;
  if (weekday(y, m, d) === 1) {
    for (const [name, [mm, nth]] of Object.entries(MONDAYS)) if (m === mm && Math.ceil(d / 7) === nth) return name;
  }
  // the equinoxes (the usual reckoning, good from 1980 to 2099)
  const k = y - 1980;
  if (m === 3 && d === Math.floor(20.8431 + 0.242194 * k - Math.floor(k / 4))) return '春分の日';
  if (m === 9 && d === Math.floor(23.2488 + 0.242194 * k - Math.floor(k / 4))) return '秋分の日';
  return null;
}

// the holiday's name on that day, or null
export function holiday(y, m, d) {
  const h = namedHoliday(y, m, d);
  if (h) return h;
  // a holiday on a Sunday: the first day after it that is not a holiday is one instead
  for (let k = 1; k < 7; k++) {
    const p = shift(y, m, d, -k);
    if (!namedHoliday(...p)) break;
    if (weekday(...p) === 0) return '振替休日';
  }
  // a day between two holidays
  if (namedHoliday(...shift(y, m, d, -1)) && namedHoliday(...shift(y, m, d, 1))) return '国民の休日';
  return null;
}
