import test from 'node:test'; import assert from 'node:assert/strict';
import { mergeKv, daysBetween, K_DAYS, K_ARCHIVE, K_LIFE } from '../js/receipt-store.js';
test('Days / Archive are united by id, local wins', () => {
  const m = mergeKv(K_DAYS, [{ id: 'a', minutes: 5 }], [{ id: 'a', minutes: 99 }, { id: 'b', minutes: 7 }]);
  assert.deepEqual(m.map(x => x.id), ['a', 'b']); assert.equal(m[0].minutes, 5);
  assert.equal(mergeKv(K_ARCHIVE, [], [{ id: 'z' }]).length, 1); assert.equal(mergeKv(K_ARCHIVE, undefined, undefined).length, 0);
});
test('lifetime counters never go down, days are united', () => {
  const m = mergeKv(K_LIFE, { minutes: 100, fish: 5, days: ['2026-11-01'], counted: ['a'] }, { minutes: 80, fish: 9, days: ['2026-11-02'], counted: ['b'] });
  assert.equal(m.minutes, 100); assert.equal(m.fish, 9); assert.deepEqual(m.days, ['2026-11-01', '2026-11-02']); assert.deepEqual(m.counted.sort(), ['a', 'b']);
});
test('the open timer of this device is kept on merge', () => { assert.equal(mergeKv('studyTimer.v1', 'local', 'other'), 'local'); });
test('daysBetween covers every day of a receipt that spans days', () => { assert.deepEqual(daysBetween('2026-10-31', '2026-11-02'), ['2026-10-31', '2026-11-01', '2026-11-02']); assert.deepEqual(daysBetween('2026-11-06', '2026-11-06'), ['2026-11-06']); });
