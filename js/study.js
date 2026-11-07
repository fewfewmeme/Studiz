// Учёба считается ТОЛЬКО за блоки: нет общего таймера, нет счётчика «время в документе».
// Блок засчитан, когда его таймер дошёл до цели или «Прочитала/Выучила» нажата после ≥ 50% цели.
// Награды: каждый засчитанный блок = 1 рыбка; каждые 2 засчитанных блока за день = +1 креветка.
import * as db from './db.js';
import { dateKey } from './util.js';

export const BLOCK_DONE_SHARE = 0.5;        // доля цели, после которой «Прочитала» засчитывает блок
export const IDLE_STOP_SEC = 180;           // 3 минуты без действий — время блока стоит

// совместимость со старым кодом (общего таймера больше нет)
export function ping() { lastAction = Date.now(); }
export function setPartTimerRunning() { }
export function sessionSeconds() { return 0; }
export function onStudyTick() { return () => { }; }
export function isActive() { return false; }
export function startStudy() { }
export function stopStudy() { return Promise.resolve(); }
export function flush() { return Promise.resolve(); }
let lastAction = Date.now();
export const lastActionAt = () => lastAction;
if (typeof addEventListener === 'function') for (const ev of ['pointerdown', 'keydown', 'wheel', 'touchstart']) addEventListener(ev, ping, { capture: true, passive: true });

// Засчитать блок. Возвращает {counted, fish, shrimp, blocksToday} — fish/shrimp = сколько ДОБАВИЛОСЬ этим блоком.
export async function recordBlockDone({ fileId, subject, blockId, seconds }) {
  const date = dateKey(), key = `${fileId}|${blockId}|${date}`;
  if (await db.get('completions', key)) return { counted: false, fish: 0, shrimp: 0, blocksToday: (await db.getAll('completions', 'date', date)).length };
  seconds = Math.max(0, Math.round(seconds));
  await db.put('completions', { key, date, subject, fileId, part: blockId, ts: Date.now(), seconds });
  if (seconds) await db.modify('study', `${date}|${subject}`, rec => ({ ...rec, seconds: rec.seconds + seconds }), { key: `${date}|${subject}`, date, subject, seconds: 0 });
  const n = (await db.getAll('completions', 'date', date)).length;
  return { counted: true, fish: 1, shrimp: n % 2 === 0 ? 1 : 0, blocksToday: n };
}
// старое имя: отметка без времени не награждается
export async function recordPartDone() { return false; }
export function fishFor(blocks) { return blocks; }

// ---- Итоги для «Чека» ----
export async function dayReport(date) {
  const [study, comps] = await Promise.all([db.getAll('study', 'date', date), db.getAll('completions', 'date', date)]);
  const bySubject = {};
  for (const s of study) bySubject[s.subject] = (bySubject[s.subject] || 0) + s.seconds;
  const totalSec = Object.values(bySubject).reduce((a, b) => a + b, 0);
  return { bySubject, totalSec, parts: comps.length, blocks: comps.length, fish: comps.length, shrimp: Math.floor(comps.length / 2) };
}

export async function allTimeReport() {
  const [study, comps] = await Promise.all([db.getAll('study'), db.getAll('completions')]);
  const byDay = {}, perDay = {};
  for (const s of study) byDay[s.date] = (byDay[s.date] || 0) + s.seconds;
  for (const c of comps) perDay[c.date] = (perDay[c.date] || 0) + 1;
  const totalSec = Object.values(byDay).reduce((a, b) => a + b, 0);
  return { totalSec, parts: comps.length, blocks: comps.length, fish: comps.length, shrimp: Object.values(perDay).reduce((a, n) => a + Math.floor(n / 2), 0), days: Object.keys(byDay).length };
}
