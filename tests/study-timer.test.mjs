import test from 'node:test'; import assert from 'node:assert/strict';
import * as T from '../js/study-timer.js';
import { totalsFromTimer } from '../js/receipt-core.js';
const T0 = 1_800_000_000_000, MIN = 60000;
test('NO passive timer: opening a file / reading never counts time, fish or shrimp', () => {
  const S = T.emptyTimer(); T.openFile(S, 'an', false, 'normal', T0); T.openFile(S, 'fz', false, 'book', T0 + 10 * MIN);
  assert.equal(S.runStart, null); assert.equal(T.elapsedMs(S, T0 + 90 * MIN), 0);
  const tt = totalsFromTimer(T.flush(S, T0 + 90 * MIN)); assert.deepEqual([tt.g, tt.rewards.fish, tt.rewards.shrimp, tt.totalMin], [0, 0, 0, 0]);
  assert.equal(S.dayStart, T0); assert.ok(S.rid);
});
test('hide / show with nothing running changes nothing', () => {
  const S = T.emptyTimer(); T.openFile(S, 'an', false, 'normal', T0); T.hide(S, T0 + 3 * MIN); T.show(S, T0 + 30 * MIN);
  assert.equal(S.paused, false); assert.equal(T.elapsedMs(S, T0 + 40 * MIN), 0);
});
test('a running block survives a change of the reading view; leaving the file ends it', () => {
  const S = T.emptyTimer(); T.openFile(S, 'an', false, 'blocks', T0); T.startBlock(S, 5, T0 + MIN);
  T.openFile(S, 'an', false, 'normal', T0 + 2 * MIN); assert.ok(S.block);
  assert.equal(T.tickBlock(S, T0 + 7 * MIN), 'completed'); assert.equal(S.done.b5, 1); assert.equal(S.blockBySubjMs.an, 5 * MIN);
  T.startBlock(S, 10, T0 + 8 * MIN); T.leaveFile(S, T0 + 9 * MIN); assert.equal(S.block, null); assert.equal(S.done.b10, 0);
});
test('abandoned block credits nothing (stop, away > 15 s)', () => {
  let S = T.emptyTimer(); T.openFile(S, 'an', true, 'blocks', T0); T.startBlock(S, 10, T0); T.abandonBlock(S);
  assert.deepEqual([S.done.b5, S.done.b10, S.blockExamMs], [0, 0, 0]);
  S = T.emptyTimer(); T.openFile(S, 'an', true, 'blocks', T0); T.startBlock(S, 5, T0); T.hide(S, T0 + MIN);
  assert.equal(T.show(S, T0 + MIN + 16000), 'abandoned'); assert.equal(S.done.b5, 0);
  S = T.emptyTimer(); T.openFile(S, 'an', true, 'blocks', T0); T.startBlock(S, 5, T0); T.hide(S, T0 + MIN);
  assert.equal(T.show(S, T0 + MIN + 10000), 'running'); assert.ok(S.block);
});
test('a block finished inside the file\'s own timer is credited once, like our own countdown', () => {
  const S = T.emptyTimer(); T.openFile(S, 'an', true, 'orig', T0);
  T.creditBlock(S, 10, T0 + 10 * MIN); T.creditBlock(S, 5, T0 + 16 * MIN); T.creditBlock(S, 7, T0 + 20 * MIN);
  assert.deepEqual([S.done.b5, S.done.b10], [1, 1]); assert.equal(S.block, null);
  const tt = totalsFromTimer(S); assert.equal(tt.rewards.fish, 1 + 2); assert.equal(tt.rewards.shrimp, 1); assert.equal(tt.ex, 15);
  const E = T.emptyTimer(); T.creditBlock(E, 5, T0); assert.equal(E.done.b5, 0, 'no open file: nothing to credit');
});
test('restore after reload: away too long -> abandoned; quick reload continues; finished while watched -> credited', () => {
  let S = T.emptyTimer(); T.openFile(S, 'an', false, 'blocks', T0); T.startBlock(S, 5, T0); S.block.beat = T0 + MIN;
  assert.equal(T.restoreBlock(S, T0 + MIN + 30000), 'abandoned');
  S = T.emptyTimer(); T.openFile(S, 'an', false, 'blocks', T0); T.startBlock(S, 5, T0); S.block.beat = T0 + MIN;
  assert.equal(T.restoreBlock(S, T0 + MIN + 8000), 'running');
  S = T.emptyTimer(); T.openFile(S, 'an', false, 'blocks', T0); T.startBlock(S, 5, T0); S.block.beat = T0 + 5 * MIN - 2000;
  assert.equal(T.restoreBlock(S, T0 + 5 * MIN + 1000), 'completed'); assert.equal(S.done.b5, 1);
});
test('exam flag: completed blocks of an exam file count toward examMs', () => {
  const S = T.emptyTimer(); T.openFile(S, 'an', true, 'blocks', T0); T.startBlock(S, 5, T0); T.tickBlock(S, T0 + 5 * MIN);
  T.openFile(S, 'fz', false, 'blocks', T0 + 20 * MIN); T.startBlock(S, 10, T0 + 20 * MIN); T.tickBlock(S, T0 + 30 * MIN);
  const tt = totalsFromTimer(S); assert.equal(tt.ex, 5); assert.deepEqual(S.examSubjs, ['an']);
  assert.equal(tt.g, 0); assert.equal(tt.rewards.fish, 1 + 2); assert.equal(tt.rewards.shrimp, 1);
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
  const t = totalsFromTimer(S); assert.equal(t.g, 30); assert.equal(t.s.an, 30); assert.equal(t.ex, 0);
  T.openFile(S, 'fz', false, 'normal', T0 + MIN); T.addManual(S, 'an', 15 * MIN, T0 + 2 * MIN);
  assert.equal(Math.round(S.bySubjMs.an / MIN), 45);
  assert.equal(T.addManual(S, 'an', -999 * MIN, T0 + 2 * MIN), -45 * MIN); assert.equal(S.bySubjMs.an, 0);
  assert.equal(T.addManual(S, 'an', 99999 * MIN, T0 + 2 * MIN), T.MANUAL_MAX_MIN * MIN);
  assert.equal(T.addManual(S, null, MIN, T0), 0); assert.equal(T.addManual(S, 'an', NaN, T0), 0);
});
