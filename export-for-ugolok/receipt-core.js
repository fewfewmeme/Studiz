// receipt-core.js — no DOM, no imports. Works in browser and Node. Copy this file verbatim into the other app (Уголок Лиз).
export const SUBJECTS = ['an', 'pa', 'bx', 'gi', 'mi', 'st', 'fi', 'fz'];

// subject keys of the library (config.js) <-> short codes of the receipt
export const SUBJECT_CODE = { anatomy: 'an', patanatomy: 'pa', biochem: 'bx', histology: 'gi', microbio: 'mi', dentistry: 'st', philosophy: 'fi', physiology: 'fz' };
export const SUBJECT_NAME = { an: 'Анатомия', pa: 'Патанатомия', bx: 'Биохимия', gi: 'Гистология', mi: 'Микробиология', st: 'Стоматология', fi: 'Философия', fz: 'Физиология' };

// g = general minutes, b5 / b10 = completed 5- and 10-minute blocks
export function rewards(g, b5, b10) {
  const fishG = Math.floor(g / 5), shrimpG = Math.floor(g / 10);
  return {
    fishGeneral: fishG, shrimpGeneral: shrimpG,
    fishB5: b5, fishB10: b10 * 2, shrimpB10: b10,
    fish: fishG + b5 + b10 * 2,
    shrimp: shrimpG + b10
  };
}

export function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

const toB64u = (s) => {
  const bytes = new TextEncoder().encode(s);
  let bin = ''; bytes.forEach(b => bin += String.fromCharCode(b));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromB64u = (s) => {
  s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '=';
  const bin = atob(s); const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
};

// payload fields:
// v:1  id (10-char random)  d1,d2 'YYYY-MM-DD'  ct 'YYYY-MM-DDTHH:MM'
// g  general minutes (int)  b5, b10 completed blocks (int)
// s  minutes per subject {an,pa,bx,gi,mi,st,fi,fz}, zeros omitted (general + blocks)
// ex exam minutes (int)  exs array of subject keys with exam time
// f  total fish  sh total shrimp  sx stamp x as fraction of receipt width (0..1, 2 decimals)
export function makePayload({ id, d1, d2, ct, g, b5, b10, s, ex, exs, sx }) {
  const r = rewards(g, b5, b10);
  return { v: 1, id, d1, d2, ct, g, b5, b10, s, ex, exs, f: r.fish, sh: r.shrimp, sx };
}

export function encodeReceipt(payload) {
  const data = toB64u(JSON.stringify(payload));
  return `LIZ1.${data}.${fnv1a(data)}`;
}

export function decodeReceipt(code) {
  const parts = String(code).trim().split('.');
  if (parts.length !== 3 || parts[0] !== 'LIZ1') throw new Error('bad format');
  const [, data, sum] = parts;
  if (fnv1a(data) !== sum) throw new Error('bad checksum');
  const p = JSON.parse(fromB64u(data));
  const ok = (n) => Number.isInteger(n) && n >= 0 && n < 100000;
  if (p.v !== 1 || typeof p.id !== 'string' || !ok(p.g) || !ok(p.b5) || !ok(p.b10) || !ok(p.ex)) throw new Error('bad fields');
  const r = rewards(p.g, p.b5, p.b10);
  if (p.f !== r.fish || p.sh !== r.shrimp) throw new Error('rewards mismatch');
  for (const k of Object.keys(p.s || {})) if (!SUBJECTS.includes(k) || !ok(p.s[k])) throw new Error('bad subject');
  return p;
}

// ---- helpers shared by the receipt screens (pure) ----
export function randomId(len = 10, rnd = Math.random) {
  const abc = 'abcdefghijklmnopqrstuvwxyz0123456789'; let s = '';
  for (let i = 0; i < len; i++) s += abc[Math.floor(rnd() * abc.length)];
  return s;
}
const pad2 = n => String(n).padStart(2, '0');
export const ymd = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
export const ymdhm = d => `${ymd(d)}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
// '2026-11-06' -> {d:6, m:'ноября', y:2026}
const parts = s => { const [y, m, d] = String(s).split('-').map(Number); return { y, m, d }; };
// "6 ноября 2026 г." or "6–7 ноября 2026 г." (a receipt that spans days)
export function dateRangeRu(d1, d2) {
  const a = parts(d1), b = parts(d2 || d1);
  if (!a.y) return '';
  if (d1 === d2 || !d2) return `${a.d} ${MONTHS[a.m - 1]} ${a.y} г.`;
  if (a.y === b.y && a.m === b.m) return `${a.d}–${b.d} ${MONTHS[a.m - 1]} ${a.y} г.`;
  if (a.y === b.y) return `${a.d} ${MONTHS[a.m - 1]} – ${b.d} ${MONTHS[b.m - 1]} ${a.y} г.`;
  return `${a.d} ${MONTHS[a.m - 1]} ${a.y} – ${b.d} ${MONTHS[b.m - 1]} ${b.y} г.`;
}
// 210 -> "3 ч 30 мин", 45 -> "45 мин", 0 -> "0 мин"
export function minutesText(min) {
  min = Math.max(0, Math.floor(min));
  const h = Math.floor(min / 60), m = min % 60;
  return h ? (m ? `${h} ч ${m} мин` : `${h} ч`) : `${m} мин`;
}

// Totals of one receipt from the raw timer numbers (milliseconds) -> the numbers printed on it and stored in the payload.
export function totalsFromTimer(t) {
  const sMs = {};
  for (const k of SUBJECTS) { const ms = (t.bySubjMs?.[k] || 0) + (t.blockBySubjMs?.[k] || 0); if (ms > 0) sMs[k] = ms; }
  const s = {}; for (const k of Object.keys(sMs)) { const m = Math.round(sMs[k] / 60000); if (m > 0) s[k] = m; }
  const g = Math.floor((t.accMs || 0) / 60000);
  const b5 = t.done?.b5 || 0, b10 = t.done?.b10 || 0;
  const ex = Math.round(((t.examMs || 0) + (t.blockExamMs || 0)) / 60000);
  return { g, b5, b10, s, ex, rewards: rewards(g, b5, b10), blockMin: b5 * 5 + b10 * 10, totalMin: g + b5 * 5 + b10 * 10 };
}

// Bottom edge of the receipt: small triangles pointing DOWN. Use as clip-path on the bottom piece; teeth = round(width / 12).
export function zigzagClip(teeth = 28, depthPx = 8) {
  const p = ['0% 0%', '100% 0%', `100% calc(100% - ${depthPx}px)`];
  for (let i = teeth; i >= 1; i--) {
    p.push(`${((i - 0.5) / teeth) * 100}% 100%`);                       // tip
    p.push(`${((i - 1) / teeth) * 100}% calc(100% - ${depthPx}px)`);    // valley
  }
  return `polygon(${p.join(',')})`;
}
