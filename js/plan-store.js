// План (stage 2): the weekly timetable (subjects per weekday, entered once) and the to-do items of each day.
// item = { id, date 'YYYY-MM-DD', subj|null, text, done, fileId|null, fileMs }
import * as db from './db.js';
import { uid } from './db.js';

export const K_TT = 'plan.timetable.v1', K_ITEMS = 'plan.items.v1';
export const DAYS = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
export const FILE_MIN_FOR_PROMPT = 30;       // minutes in the linked file before a quiet «отметить?» appears

const pad = n => String(n).padStart(2, '0');
export const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const weekday = d => (d.getDay() + 6) % 7;   // Monday = 0
export function weekStart(d = new Date()) { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - weekday(x)); return x; }

export async function getTimetable() {
  const t = await db.kvGet(K_TT, null); const out = {};
  for (let i = 0; i < 7; i++) out[i] = Array.isArray(t?.[i]) ? t[i].filter(x => typeof x === 'string').slice(0, 12) : [];
  return out;
}
export async function setTimetable(t) { await db.kvSet(K_TT, t); }
export async function getItems() {
  const a = await db.kvGet(K_ITEMS, []);
  return (Array.isArray(a) ? a : []).filter(x => x && typeof x.id === 'string' && /^\d{4}-\d\d-\d\d$/.test(x.date) && typeof x.text === 'string')
    .map(x => ({ id: x.id, date: x.date, subj: typeof x.subj === 'string' ? x.subj : null, text: x.text.slice(0, 300), done: !!x.done, fileId: typeof x.fileId === 'string' ? x.fileId : null, fileMs: Number.isFinite(x.fileMs) && x.fileMs > 0 ? x.fileMs : 0 }));
}
async function save(items) { await db.kvSet(K_ITEMS, items); }
export async function addItem({ date, subj = null, text, fileId = null }) { const items = await getItems(); const it = { id: uid().slice(0, 10), date, subj, text: text.trim(), done: false, fileId, fileMs: 0 }; items.push(it); await save(items); return it; }
export async function updateItem(id, patch) { const items = await getItems(); const it = items.find(x => x.id === id); if (it) Object.assign(it, patch); await save(items); return it; }
export async function removeItem(id) { await save((await getItems()).filter(x => x.id !== id)); }

// the week sheet: 7 check cells under the title, «Мотивация недели», one short line per weekday (bottom-left of the sheet)
export const K_WEEK = 'plan.week.v1';
export async function getWeek(startYmd) {
  const all = await db.kvGet(K_WEEK, {}); const w = all && typeof all === 'object' ? all[startYmd] : null;
  return { mark: Array.from({ length: 7 }, (_, i) => !!w?.mark?.[i]), motiv: typeof w?.motiv === 'string' ? w.motiv.slice(0, 400) : '', notes: Array.from({ length: 7 }, (_, i) => (typeof w?.notes?.[i] === 'string' ? w.notes[i].slice(0, 120) : '')) };
}
export async function setWeek(startYmd, patch) {
  const all = await db.kvGet(K_WEEK, {}); const cur = await getWeek(startYmd);
  const next = { ...(all && typeof all === 'object' ? all : {}) }; next[startYmd] = { ...cur, ...patch };
  await db.kvSet(K_WEEK, next);
}

// time spent in a linked file today counts for today's items that point to it (called with the length of a finished timer segment)
let pending = 0, pendingFile = null, timer = null;
export function addFileMs(fileId, ms) {
  if (!fileId || !(ms > 0)) return;
  if (pendingFile && pendingFile !== fileId) flushFileMs();
  pendingFile = fileId; pending += ms;
  if (!timer) timer = setTimeout(flushFileMs, 5000);
}
export async function flushFileMs() {
  clearTimeout(timer); timer = null;
  const id = pendingFile, ms = pending; pending = 0; pendingFile = null;
  if (!id || !ms) return;
  const items = await getItems(), today = ymd(new Date()); let ch = false;
  for (const it of items) if (it.fileId === id && it.date === today && !it.done) { it.fileMs += ms; ch = true; }
  if (ch) await save(items);
}
if (typeof addEventListener === 'function') addEventListener('pagehide', () => { flushFileMs(); });
