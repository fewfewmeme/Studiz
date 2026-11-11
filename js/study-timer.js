import { randomId } from './receipt-core.js';

// Study timer: a state machine over ONE plain object (studyTimer.v1). Pure functions: every one takes the state and `t` (a Date.now() timestamp)
// and mutates the state. Time is always computed from timestamps, never by counting ticks. No DOM, no storage (see study-store.js).

export const BLOCK_GRACE_MS = 15000;       // a block survives the page being hidden for at most this long

export const emptyTimer = () => ({
  v: 1,
  dayStart: null,          // first activity timestamp of the open receipt
  rid: null,               // id of the open receipt (10 chars): tearing twice after a crash writes the same record
  accMs: 0,                // general (non-block) time of the open receipt
  runStart: null,          // timestamp when the current running segment started, null when not running
  paused: false,           // paused by me (tap) or auto-paused (page hidden)
  pausedBy: null,          // 'user' | 'auto'
  subj: null,              // subject key of the open file: an|pa|bx|gi|mi|st|fi|fz
  exam: false,             // is the open file flagged exam
  bySubjMs: {},            // general time per subject
  examMs: 0,               // general time in exam files
  examSubjs: [],           // subjects that got exam time (general or blocks)
  block: null,             // { lenMin: 5|10, startAt, endAt, subj, exam, beat } while a block runs
  done: { b5: 0, b10: 0 }, // completed blocks
  blockBySubjMs: {},       // time of completed blocks per subject
  blockExamMs: 0,
  hiddenAt: null,
  ext: false               // the file's own block timer is running (not persisted: false after a reload)
});

// move the running segment into the accumulators
export function flush(S, t) {
  if (S.runStart == null) return S;
  const d = Math.max(0, t - S.runStart);
  S.accMs += d;
  if (S.subj) S.bySubjMs[S.subj] = (S.bySubjMs[S.subj] || 0) + d;
  if (S.exam) { S.examMs += d; if (S.subj && !S.examSubjs.includes(S.subj)) S.examSubjs.push(S.subj); }
  S.runStart = t;
  return S;
}

// mode: 'normal' | 'book' | 'blocks' | 'orig'. Opening any file starts the timer; it keeps running across files and is only reset by tearing the receipt.
export function openFile(S, subj, exam, mode, t) {
  flush(S, t);
  if (S.block && mode !== 'blocks') abandonBlock(S);          // left the block for ordinary reading: nothing is credited
  S.subj = subj || null; S.exam = !!exam;
  if (S.dayStart == null) { S.dayStart = t; S.rid = S.rid || randomId(); }
  if (mode === 'blocks' || S.ext) S.runStart = null;           // the general timer stops while blocks are done (ours, or the file's OWN block timer in «Оригинал»)
  else if (!S.paused) S.runStart = S.runStart ?? t;
  return S;
}

// home / settings / receipt: the timer does not run (and a block that was running is abandoned)
export function leaveFile(S, t) {
  flush(S, t);
  S.runStart = null; S.subj = null; S.exam = false; S.ext = false;
  if (S.block) abandonBlock(S);
  return S;
}

// the open file's exam flag changed: close the running segment under the old flag first
export function setExam(S, exam, t) { flush(S, t); S.exam = !!exam; return S; }

// tap on the timer
export function togglePause(S, t) {
  if (S.paused) { S.paused = false; S.pausedBy = null; if (S.subj && !S.block) S.runStart = t; }
  else { flush(S, t); S.runStart = null; S.paused = true; S.pausedBy = 'user'; }
  return S;
}

export function elapsedMs(S, t) { return S.accMs + (S.runStart != null ? Math.max(0, t - S.runStart) : 0); }

// page hidden: stop and remember when (a block gets its 15 seconds of grace)
export function hide(S, t) {
  S.hiddenAt = t;
  if (S.runStart != null) { flush(S, t); S.runStart = null; S.paused = true; S.pausedBy = 'auto'; }
  return S;
}
// page visible again: it STAYS paused; a block that was away for more than 15 s is abandoned. Returns what happened.
export function show(S, t) {
  const away = S.hiddenAt != null ? t - S.hiddenAt : 0;
  S.hiddenAt = null;
  if (S.block) {
    if (away > BLOCK_GRACE_MS) { abandonBlock(S); return 'abandoned'; }
    return tickBlock(S, t);
  }
  return 'none';
}

// minutes studied away from the site: counted as general time of that subject on the open receipt (never as exam minutes).
// `ms` may be negative (undo); the totals never go below zero. Returns the ms really applied.
export const MANUAL_MAX_MIN = 600;
export function addManual(S, subj, ms, t) {
  if (!subj || !Number.isFinite(ms) || ms === 0) return 0;
  flush(S, t);
  const cur = S.bySubjMs[subj] || 0, d = ms > 0 ? Math.min(ms, MANUAL_MAX_MIN * 60000) : -Math.min(-ms, cur, S.accMs);
  if (!d) return 0;
  S.accMs += d; S.bySubjMs[subj] = cur + d;
  if (S.dayStart == null) { S.dayStart = t; S.rid = S.rid || randomId(); }
  return d;
}

// ---- blocks ----
export function startBlock(S, lenMin, t) {
  if (lenMin !== 5 && lenMin !== 10) throw new Error('block length must be 5 or 10');
  if (!S.subj) throw new Error('no open file');
  flush(S, t); S.runStart = null;
  S.block = { lenMin, startAt: t, endAt: t + lenMin * 60000, subj: S.subj, exam: !!S.exam, beat: t };
  if (S.dayStart == null) { S.dayStart = t; S.rid = S.rid || randomId(); }
  return S;
}
export function abandonBlock(S) { S.block = null; return S; }
export function completeBlock(S) {
  const b = S.block; if (!b) return S;
  if (b.lenMin === 5) S.done.b5++; else S.done.b10++;
  const ms = b.lenMin * 60000;
  S.blockBySubjMs[b.subj] = (S.blockBySubjMs[b.subj] || 0) + ms;
  if (b.exam) { S.blockExamMs += ms; if (!S.examSubjs.includes(b.subj)) S.examSubjs.push(b.subj); }
  S.lastBlock = { subj: b.subj, exam: !!b.exam, lenMin: b.lenMin, fish: b.lenMin === 5 ? 1 : 2, shrimp: b.lenMin === 10 ? 1 : 0 };   // transient, for the reward card
  S.block = null;
  return S;
}
// the open file runs its OWN block timer («Оригинал»): the general timer waits for it (no two counters in parallel) and continues afterwards
export function setExternal(S, on, t) {
  on = !!on; if (!!S.ext === on) return S;
  flush(S, t); S.ext = on;
  if (on) S.runStart = null; else if (S.subj && !S.paused && !S.block) S.runStart = t;
  return S;
}
// a block finished inside a file's OWN timer (Оригинал): the same credit as our own countdown reaching zero
export function creditBlock(S, lenMin, t) {
  if (lenMin !== 5 && lenMin !== 10) return S;
  if (!S.subj) return S;
  if (S.dayStart == null) { S.dayStart = t; S.rid = S.rid || randomId(); }
  S.block = { lenMin, startAt: t - lenMin * 60000, endAt: t, subj: S.subj, exam: !!S.exam, beat: t };
  return completeBlock(S);
}
// a block completed on ANOTHER device, applied to this device's open receipt (the same numbers our own completeBlock writes)
export function applyEvent(S, ev, t) {
  if (!ev || (ev.minutes !== 5 && ev.minutes !== 10) || typeof ev.subj !== 'string') return S;
  if (S.dayStart == null) { S.dayStart = t; S.rid = S.rid || randomId(); }
  if (ev.minutes === 5) S.done.b5++; else S.done.b10++;
  const ms = ev.minutes * 60000;
  S.blockBySubjMs[ev.subj] = (S.blockBySubjMs[ev.subj] || 0) + ms;
  if (ev.exam) { S.blockExamMs += ms; if (!S.examSubjs.includes(ev.subj)) S.examSubjs.push(ev.subj); }
  return S;
}
export const blockRemainingMs = (S, t) => (S.block ? Math.max(0, S.block.endAt - t) : 0);
// reached zero while the page was watched -> credited; returns 'completed' | 'running' | 'none'
export function tickBlock(S, t) {
  if (!S.block) return 'none';
  S.block.beat = t;
  if (t >= S.block.endAt) { completeBlock(S); return 'completed'; }
  return 'running';
}
// after a reload: continue, credit or drop the block depending on how long the page was away
export function restoreBlock(S, t) {
  const b = S.block; if (!b) return 'none';
  const lastSeen = S.hiddenAt ?? b.beat ?? b.startAt;
  S.hiddenAt = null;
  if (t - lastSeen > BLOCK_GRACE_MS + 5000) { abandonBlock(S); return 'abandoned'; }
  return tickBlock(S, t);
}

// validation of a stored state: anything odd falls back to the empty timer
export function sanitize(raw) {
  const E = emptyTimer();
  if (!raw || typeof raw !== 'object' || raw.v !== 1) return E;
  const n = (v, d = 0) => (Number.isFinite(v) && v >= 0 && v < 1e13 ? v : d);
  const ts = v => (Number.isFinite(v) && v > 1e12 && v < 4e12 ? v : null);
  const map = o => { const r = {}; if (o && typeof o === 'object') for (const k of Object.keys(o)) if (Number.isFinite(o[k]) && o[k] >= 0 && o[k] < 1e13) r[k] = o[k]; return r; };
  const S = { ...E,
    dayStart: ts(raw.dayStart), rid: typeof raw.rid === 'string' && /^[a-z0-9]{10}$/.test(raw.rid) ? raw.rid : null, accMs: n(raw.accMs), runStart: ts(raw.runStart), paused: !!raw.paused, pausedBy: raw.pausedBy === 'user' || raw.pausedBy === 'auto' ? raw.pausedBy : null,
    subj: typeof raw.subj === 'string' ? raw.subj.slice(0, 4) : null, exam: !!raw.exam, bySubjMs: map(raw.bySubjMs), examMs: n(raw.examMs),
    examSubjs: Array.isArray(raw.examSubjs) ? raw.examSubjs.filter(x => typeof x === 'string').slice(0, 8) : [],
    done: { b5: Math.floor(n(raw.done?.b5)), b10: Math.floor(n(raw.done?.b10)) }, blockBySubjMs: map(raw.blockBySubjMs), blockExamMs: n(raw.blockExamMs), hiddenAt: ts(raw.hiddenAt) };
  const b = raw.block;
  if (b && (b.lenMin === 5 || b.lenMin === 10) && ts(b.startAt) && ts(b.endAt) && typeof b.subj === 'string') S.block = { lenMin: b.lenMin, startAt: b.startAt, endAt: b.endAt, subj: b.subj.slice(0, 4), exam: !!b.exam, beat: ts(b.beat) || b.startAt };
  return S;
}
