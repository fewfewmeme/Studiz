import test from 'node:test'; import assert from 'node:assert/strict';
import { debounce } from '../js/util.js';
test('debounce.flush runs the pending call WITH its own arguments (saveProgress(undefined) -> NaN -> «прочитано 0%» on exit)', async () => {
  const got = []; const d = debounce(v => got.push(v), 50);
  d(0.2); d(0.97); d.flush();
  assert.deepEqual(got, [0.97]);
  d.flush(); assert.deepEqual(got, [0.97], 'nothing pending: flush is a no-op');
  d(0.5); await new Promise(r => setTimeout(r, 80)); assert.deepEqual(got, [0.97, 0.5]);
  d(0.7); d.cancel(); d.flush(); assert.deepEqual(got, [0.97, 0.5]);
});
