// node tests/parts.test.mjs — проверка правил деления на части
import { splitParts, blockSeconds } from '../js/parts.js';
import assert from 'node:assert/strict';

const T = 300;
const mk = (secs, headings = []) => secs.map((s, i) => ({ sec: s, heading: headings.includes(i) }));
const total = parts => parts.reduce((a, p) => a + (p.end - p.start), 0);

// 1. Ровные абзацы по 60 с: части ≈ 300 с, не больше 420 с
let blocks = mk(Array(40).fill(60));
let parts = splitParts(blocks, { targetSec: T });
assert.equal(total(parts), 40);
for (const p of parts) assert.ok(p.sec <= 1.4 * T + 1e-9, 'часть не длиннее 140%: ' + p.sec);
assert.ok(parts.slice(0, -1).every(p => p.sec >= 0.6 * T), 'не слишком короткие');

// 2. Заголовок после ≥60% цели — граница
blocks = mk([100, 100, 0, 100, 100, 100], [2]);   // заголовок на 3-м месте, до него 200 с = 66%
parts = splitParts(blocks, { targetSec: T });
assert.equal(parts[0].end, 2, 'режем перед заголовком');
assert.equal(parts[1].start, 2);

// 3. Заголовок до 60% — не режем
blocks = mk([50, 0, 100, 100, 50], [1]);
parts = splitParts(blocks, { targetSec: T });
assert.equal(parts.length, 1);

// 4. Один блок длиннее цели — отдельная часть
blocks = mk([60, 900, 60]);
parts = splitParts(blocks, { targetSec: T });
assert.deepEqual(parts.map(p => [p.start, p.end]), [[0, 1], [1, 2], [2, 3]]);

// 5. Заголовок не остаётся в конце части
blocks = mk([200, 100, 10, 200], [2]);   // 200+100=300, заголовок 10 — не должен остаться хвостом
parts = splitParts(blocks, { targetSec: T });
for (const p of parts) assert.ok(!blocks[p.end - 1].heading || p.end - p.start === 1, 'нет заголовка в хвосте');

// 6. Пустой документ и сумма времени
assert.deepEqual(splitParts([], { targetSec: T }), []);
assert.ok(Math.abs(blockSeconds(130, 1, 130, 20) - 80) < 1e-9);
console.log('parts: OK');
