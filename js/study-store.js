// The one study timer of the app: state lives in studyTimer.v1 (IndexedDB kv + a synchronous localStorage mirror for pagehide).
// Saved on every state change and every 5 s while something runs. The timer machine itself is js/study-timer.js (pure).
import * as db from './db.js';
import * as T from './study-timer.js';
import { SUBJECT_CODE, rewards, totalsFromTimer, randomId } from './receipt-core.js';
import { addFileMs, flushFileMs } from './plan-store.js';

export const KEY = 'studyTimer.v1';
let S = T.emptyTimer(), inited = null, iv = null, mode = null;
const subs = new Set();
const now = () => Date.now();

export const state = () => S;
export function subscribe(fn) { subs.add(fn); return () => subs.delete(fn); }
function emit(kind, extra) { if (kind === 'blockDone' && extra) logBlock({ id: randomId(16), minutes: extra.lenMin, dateKey: dateKey(now()), subj: extra.subj || S.subj, exam: !!extra.exam, rid: S.rid, ts: now() }); subs.forEach(f => { try { f(kind, extra); } catch { /* a listener must not break the timer */ } }); }

// ---- persistence ----
let lastKv = 0;
function persist() {
  const rec = { savedAt: now(), s: S };
  try { localStorage.setItem(KEY, JSON.stringify(rec)); } catch { /* private mode */ }
  lastKv = rec.savedAt;
  db.kvSet(KEY, rec).catch(() => {});
}
async function load() {
  let a = null, b = null;
  try { a = await db.kvGet(KEY, null); } catch { /* ignore */ }
  try { b = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { /* ignore */ }
  const pick = [a, b].filter(r => r && typeof r === 'object' && Number.isFinite(r.savedAt) && r.s).sort((x, y) => y.savedAt - x.savedAt)[0];
  S = pick ? T.sanitize(pick.s) : T.emptyTimer();
  const savedAt = pick ? pick.savedAt : now(), t = now();
  // the page was closed while the timer ran: count only up to the last save, then leave it paused (it never counts time nobody watched)
  if (S.runStart != null) { T.flush(S, Math.min(savedAt, t)); S.runStart = null; S.paused = true; S.pausedBy = 'auto'; }
  if (S.block) { const r = T.restoreBlock(S, t); if (r === 'completed') queueMicrotask(() => emit('blockDone', S.lastBlock)); }
  mode = null; S.subj = null; S.exam = false;      // no file is open after a (re)load; the reader opens it again
  persist();
}
export function initStudy() {
  if (inited) return inited;
  inited = load().then(() => {
    document.addEventListener('visibilitychange', onVis);
    addEventListener('pagehide', () => { T.hide(S, now()); persist(); });
    emit('ready');
  });
  return inited;
}
function onVis() {
  const t = now();
  if (document.visibilityState === 'hidden') { T.hide(S, t); persist(); emit('hidden'); }
  else {
    const r = T.show(S, t);
    if (r === 'abandoned') emit('blockAbandoned', 'away');
    if (r === 'completed') emit('blockDone', S.lastBlock);
    persist(); emit('visible');
  }
}

// ---- interval: only while a file is open (running timer or block) ----
function ensureTick() { if (!iv) iv = setInterval(tick, 1000); }
function stopTick() { clearInterval(iv); iv = null; }
let n5 = 0, lastTick = 0, curFile = null;
function tick() {
  const t = now();
  if (S.runStart != null && curFile && lastTick) addFileMs(curFile, Math.min(t - lastTick, 3000));   // time in the linked file for the day plan
  lastTick = t;
  if (S.block && T.tickBlock(S, t) === 'completed') { persist(); emit('blockDone', S.lastBlock); emit('change'); return; }
  if (++n5 >= 5) { n5 = 0; if (S.runStart != null || S.block) persist(); }   // every 5 s while something runs
  emit('tick');
}

// ---- operations used by the reader ----
export const codeOf = subjectKey => SUBJECT_CODE[subjectKey] || null;
export function openFile(meta, m) {
  const code = codeOf(meta.subject); if (!code) return;
  mode = m; curFile = meta.id || null; lastTick = now(); T.openFile(S, code, !!meta.exam, m, now());
  persist(); ensureTick(); emit('change');
}
export function leaveFile() {
  const had = S.block; T.leaveFile(S, now()); mode = null; curFile = null; lastTick = 0; flushFileMs(); stopTick(); persist();
  if (had) emit('blockAbandoned', 'left');
  emit('change');
}
export function togglePause() { T.togglePause(S, now()); persist(); emit('change'); }
export function setExam(flag) { T.setExam(S, flag, now()); persist(); emit('change'); }
export function startBlock(lenMin) {
  T.startBlock(S, lenMin, now()); persist(); ensureTick(); emit('change');
}
// minutes studied outside the site (План): they go to the open receipt as that subject's general time. Returns the applied minutes (negative = undo).
export function addManualMinutes(subjectKey, minutes) {
  const code = codeOf(subjectKey); if (!code) return 0;
  const d = T.addManual(S, code, Math.round(minutes) * 60000, now());
  if (d) { persist(); emit('change'); }
  return Math.round(d / 60000);
}
// the append-only log of completed blocks (ids make a later merge between devices idempotent); totals on the receipt are still the timer's numbers
export const EVENTS_KEY = 'study.events.v1';
let logChain = Promise.resolve();      // writes are queued: two blocks credited in the same tick must both reach the log
function logBlock(rec) { logChain = logChain.then(async () => { const a = await db.kvGet(EVENTS_KEY, []); const l = Array.isArray(a) ? a : []; l.push(rec); await db.kvSet(EVENTS_KEY, l.slice(-5000)); }).catch(() => {}); return logChain; }
const dateKey = t => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
export function creditBlock(lenMin) {
  const before = S.done.b5 + S.done.b10; T.creditBlock(S, lenMin, now());
  if (S.done.b5 + S.done.b10 === before) return false;
  persist(); emit('blockDone', S.lastBlock); emit('change'); return true;
}
export const getEvents = async () => { await logChain; const a = await db.kvGet(EVENTS_KEY, []); return Array.isArray(a) ? a.filter(e => e && typeof e.id === 'string') : []; };
// events from another device: new ids only; an event of a day that already has a CLOSED check goes to a «Дополнение» (returned in `late`), the others join the open receipt
export async function applyRemoteEvents(list, closedDays) {
  const have = await getEvents(), ids = new Set(have.map(e => e.id)), out = { added: 0, dup: 0, late: [], minutes: 0, fish: 0, shrimp: 0 };
  const fresh = [];
  for (const e of Array.isArray(list) ? list : []) {
    if (!e || typeof e.id !== 'string' || ids.has(e.id)) { if (e) out.dup++; continue; }
    if ((e.minutes !== 5 && e.minutes !== 10) || typeof e.dateKey !== 'string' || typeof e.subj !== 'string') continue;
    if (Math.abs(new Date(e.dateKey + 'T12:00:00').getTime() - (e.ts || 0)) > 36 * 3600000) continue;     // anti-cheat: the day must match when it was created
    ids.add(e.id); fresh.push(e);
    out.added++; out.minutes += e.minutes; out.fish += e.minutes === 5 ? 1 : 2; out.shrimp += e.minutes === 10 ? 1 : 0;
    if (closedDays.has(e.dateKey)) out.late.push(e); else { T.applyEvent(S, e, now()); }
  }
  if (fresh.length) { await db.kvSet(EVENTS_KEY, [...have, ...fresh].slice(-5000)); persist(); emit('change'); }
  return out;
}
export function stopBlock() { if (!S.block) return; T.abandonBlock(S); persist(); emit('blockAbandoned', 'stopped'); emit('change'); }
export const elapsedMs = () => T.elapsedMs(S, now());
export const blockLeftMs = () => T.blockRemainingMs(S, now());
export function totals() { const c = { ...S, accMs: T.elapsedMs(S, now()), bySubjMs: { ...S.bySubjMs } }; if (S.runStart != null && S.subj) c.bySubjMs[S.subj] = (c.bySubjMs[S.subj] || 0) + (now() - S.runStart); if (S.runStart != null && S.exam) c.examMs = S.examMs + (now() - S.runStart); return totalsFromTimer(c); }
// the open receipt is reset by tearing it off
export function resetAfterTear() { const keepSubj = null; S = T.emptyTimer(); void keepSubj; mode = null; stopTick(); persist(); emit('change'); }
export function isEmpty() { return S.dayStart == null; }
export { rewards };
