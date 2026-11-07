import test from 'node:test'; import assert from 'node:assert/strict';
import * as T from '../js/study-timer.js';
import { totalsFromTimer } from '../js/receipt-core.js';
const T0 = 1_800_000_000_000, MIN = 60000;
test('opening a file starts the timer and it keeps running across files', () => {
  const S = T.emptyTimer();
  T.openFile(S, 'an', false, 'normal', T0);
  T.openFile(S, 'fz', false, 'book', T0 + 10 * MIN);
  assert.equal(T.elapsedMs(S, T0 + 25 * MIN), 25 * MIN);
  assert.equal(S.bySubjMs.an, 10 * MIN); assert.equal(Math.round(T.flush(S, T0 + 25 * MIN).bySubjMs.fz), 15 * MIN);
});
test('tap pauses and resumes from the same value', () => {
  const S = T.emptyTimer(); T.openFile(S, 'an', false, 'normal', T0);
  T.togglePause(S, T0 + 5 * MIN); assert.equal(S.paused, true); assert.equal(S.pausedBy, 'user');
  assert.equal(T.elapsedMs(S, T0 + 50 * MIN), 5 * MIN);
  T.togglePause(S, T0 + 50 * MIN); assert.equal(T.elapsedMs(S, T0 + 52 * MIN), 7 * MIN);
});
test('hidden auto-pauses and stays paused when visible again', () => {
  const S = T.emptyTimer(); T.openFile(S, 'an', false, 'normal', T0);
  T.hide(S, T0 + 3 * MIN); T.show(S, T0 + 30 * MIN);
  assert.equal(S.paused, true); assert.equal(S.pausedBy, 'auto'); assert.equal(T.elapsedMs(S, T0 + 40 * MIN), 3 * MIN);
});
test('leaving the file stops the timer; the receipt total is kept', () => {
  const S = T.emptyTimer(); T.openFile(S, 'an', false, 'normal', T0); T.leaveFile(S, T0 + 4 * MIN);
  assert.equal(T.elapsedMs(S, T0 + 99 * MIN), 4 * MIN); assert.equal(S.runStart, null);
});
test('blocks mode stops the general timer; reading again continues', () => {
  const S = T.emptyTimer(); T.openFile(S, 'an', false, 'normal', T0);
  T.openFile(S, 'an', false, 'blocks', T0 + 6 * MIN);
  assert.equal(S.runStart, null); T.startBlock(S, 5, T0 + 7 * MIN);
  assert.equal(T.tickBlock(S, T0 + 12 * MIN), 'completed'); assert.equal(S.done.b5, 1);
  T.openFile(S, 'an', false, 'normal', T0 + 20 * MIN);
  assert.equal(T.elapsedMs(S, T0 + 30 * MIN), 6 * MIN + 10 * MIN);
  assert.equal(S.blockBySubjMs.an, 5 * MIN);
});
test('paused general timer stays paused after blocks', () => {
  const S = T.emptyTimer(); T.openFile(S, 'an', false, 'normal', T0); T.togglePause(S, T0 + MIN);
  T.openFile(S, 'an', false, 'blocks', T0 + 2 * MIN); T.openFile(S, 'an', false, 'normal', T0 + 3 * MIN);
  assert.equal(S.runStart, null); assert.equal(S.paused, true);
});
test('abandoned block credits nothing (stop, leave, away > 15 s)', () => {
  let S = T.emptyTimer(); T.openFile(S, 'an', true, 'blocks', T0); T.startBlock(S, 10, T0); T.abandonBlock(S);
  assert.deepEqual([S.done.b5, S.done.b10, S.blockExamMs], [0, 0, 0]);
  S = T.emptyTimer(); T.openFile(S, 'an', true, 'blocks', T0); T.startBlock(S, 10, T0); T.openFile(S, 'an', true, 'normal', T0 + MIN);
  assert.equal(S.block, null); assert.equal(S.done.b10, 0);
  S = T.emptyTimer(); T.openFile(S, 'an', true, 'blocks', T0); T.startBlock(S, 5, T0); T.hide(S, T0 + MIN);
  assert.equal(T.show(S, T0 + MIN + 16000), 'abandoned'); assert.equal(S.done.b5, 0);
  S = T.emptyTimer(); T.openFile(S, 'an', true, 'blocks', T0); T.startBlock(S, 5, T0); T.hide(S, T0 + MIN);
  assert.equal(T.show(S, T0 + MIN + 10000), 'running'); assert.ok(S.block);
});
test('restore after reload: away too long -> abandoned; quick reload continues; finished while watched -> credited', () => {
  let S = T.emptyTimer(); T.openFile(S, 'an', false, 'blocks', T0); T.startBlock(S, 5, T0); S.block.beat = T0 + MIN;
  assert.equal(T.restoreBlock(S, T0 + MIN + 30000), 'abandoned');
  S = T.emptyTimer(); T.openFile(S, 'an', false, 'blocks', T0); T.startBlock(S, 5, T0); S.block.beat = T0 + MIN;
  assert.equal(T.restoreBlock(S, T0 + MIN + 8000), 'running');
  S = T.emptyTimer(); T.openFile(S, 'an', false, 'blocks', T0); T.startBlock(S, 5, T0); S.block.beat = T0 + 5 * MIN - 2000;
  assert.equal(T.restoreBlock(S, T0 + 5 * MIN + 1000), 'completed'); assert.equal(S.done.b5, 1);
});
test('exam flag: general time and completed blocks count toward examMs', () => {
  const S = T.emptyTimer(); T.openFile(S, 'an', true, 'normal', T0); T.setExam(S, false, T0 + 10 * MIN);
  T.openFile(S, 'fz', true, 'blocks', T0 + 20 * MIN); T.startBlock(S, 10, T0 + 20 * MIN); T.tickBlock(S, T0 + 30 * MIN);
  const tt = totalsFromTimer(T.flush(S, T0 + 30 * MIN));
  assert.equal(tt.ex, 20); assert.deepEqual(S.examSubjs.sort(), ['an', 'fz']);
  assert.equal(tt.g, 20); assert.equal(tt.rewards.fish, 4 + 2); assert.equal(tt.rewards.shrimp, 2 + 1);
});
test('sanitize: garbage falls back to an empty timer, partial garbage is cleaned', () => {
  assert.deepEqual(T.sanitize('x'), T.emptyTimer()); assert.deepEqual(T.sanitize({ v: 2 }), T.emptyTimer());
  const S = T.sanitize({ v: 1, accMs: -5, runStart: 'a', bySubjMs: { an: NaN, fz: 5 }, done: { b5: 'x', b10: 2.7 }, block: { lenMin: 7 } });
  assert.equal(S.accMs, 0); assert.equal(S.runStart, null); assert.deepEqual(S.bySubjMs, { fz: 5 }); assert.deepEqual(S.done, { b5: 0, b10: 2 }); assert.equal(S.block, null);
});

test('manual minutes outside the site: subject + general time, not exam; undo; clamps', () => {
  const S = T.emptyTimer();
  assert.equal(T.addManual(S, 'an', 30 * MIN, T0), 30 * MIN);
  assert.equal(S.dayStart, T0); assert.ok(S.rid);
  const t = totalsFromTimer(S); assert.equal(t.g, 30); assert.equal(t.s.an, 30); assert.equal(t.ex, 0); assert.equal(t.rewards.fish, 6); assert.equal(t.rewards.shrimp, 3);
  T.openFile(S, 'fz', false, 'normal', T0 + MIN); T.addManual(S, 'an', 15 * MIN, T0 + 2 * MIN);   // a running segment is not lost
  assert.equal(Math.round(S.bySubjMs.fz / MIN), 1); assert.equal(Math.round(S.bySubjMs.an / MIN), 45);
  assert.equal(T.addManual(S, 'an', -999 * MIN, T0 + 2 * MIN), -45 * MIN); assert.equal(S.bySubjMs.an, 0);
  assert.equal(T.addManual(S, 'an', 99999 * MIN, T0 + 2 * MIN), T.MANUAL_MAX_MIN * MIN);
  assert.equal(T.addManual(S, null, MIN, T0), 0); assert.equal(T.addManual(S, 'an', NaN, T0), 0);
});
