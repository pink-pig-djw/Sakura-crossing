import { ZH, TEMPLATES, PATTERNS } from './zh.js';

// Interface language: 日本語 (the original strings) or 简体中文. Strings are looked up
// by their Japanese text, so the game code keeps writing Japanese and wraps it in tr().

export const LANGS = [
  { id: 'ja', label: '日本語' },
  { id: 'zh', label: '中文' },
];

// ?lang=zh / ?lang=ja in a shared link wins, then the viewer's last choice, then the browser
function detect() {
  const q = new URLSearchParams(location.search).get('lang');
  if (q === 'ja' || q === 'zh') return q;
  try {
    const saved = localStorage.getItem('sakura-lang');
    if (saved === 'ja' || saved === 'zh') return saved;
  } catch {
    /* storage unavailable */
  }
  return (navigator.language || '').toLowerCase().startsWith('zh') ? 'zh' : 'ja';
}

let lang = detect();
const listeners = [];

export const getLang = () => lang;

export function tr(ja) {
  if (lang !== 'zh' || ja == null || ja === '') return ja;
  const hit = ZH[ja];
  if (hit !== undefined) return hit;
  for (const [re, zh] of PATTERNS) {
    if (re.test(ja)) return ja.replace(re, (...m) => zh.replace(/\$(\d)/g, (_, i) => tr(m[+i])));
  }
  return ja;
}

// templated sentence: tf('shell', { n: 3, m: 12 }); values are translated too
export function tf(key, v = {}) {
  const t = TEMPLATES[key];
  if (!t) return key;
  const s = lang === 'zh' ? t[1] : t[0];
  return s.replace(/\{(\w+)\}/g, (_, k) => (typeof v[k] === 'string' ? tr(v[k]) : String(v[k] ?? '')));
}

export function onLang(fn) {
  listeners.push(fn);
}

export function setLang(l) {
  if (l !== 'ja' && l !== 'zh') return;
  lang = l;
  try {
    localStorage.setItem('sakura-lang', l);
  } catch {
    /* storage unavailable */
  }
  applyStatic();
  for (const fn of listeners) fn(l);
}

// Elements marked data-i18n keep their Japanese text in data-ja and show tr() of it;
// data-i18n-label does the same for aria-label.
export function applyStatic(root = document) {
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'ja';
  for (const el of root.querySelectorAll('[data-i18n]')) {
    if (el.dataset.ja === undefined) el.dataset.ja = el.innerHTML;
    const ja = el.dataset.ja;
    // multi-line strings use <br> in the markup
    el.innerHTML = lang === 'zh' ? ja.split(/<br\s*\/?>/).map((p) => escapeHtml(tr(p.trim()))).join('<br>') : ja;
  }
  for (const el of root.querySelectorAll('[data-i18n-label]')) {
    if (el.dataset.jaLabel === undefined) el.dataset.jaLabel = el.getAttribute('aria-label') || '';
    el.setAttribute('aria-label', tr(el.dataset.jaLabel));
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}
