// Деление на части «по ~N минут». Чистые функции, без DOM (проверяются тестом в tests/parts.test.mjs).

// Время блока в секундах: слова / скорость + картинки
export function blockSeconds(words, images, wpm, imageSec) {
  return (words / wpm) * 60 + images * imageSec;
}

// blocks: [{sec, heading}] — подряд идущие блоки документа.
// Возвращает [{start, end}] (end не включительно).
// Правила: границы только между блоками; на заголовке режем, если часть набрала ≥ preferHeadingAt цели;
// часть не длиннее maxRatio цели (кроме одного большого блока); заголовок не остаётся в конце части.
export function splitParts(blocks, { targetSec, preferHeadingAt = 0.6, maxRatio = 1.4 }) {
  const parts = [];
  const n = blocks.length;
  if (!n) return parts;
  let start = 0, t = 0;
  for (let i = 0; i < n; i++) {
    const b = blocks[i];
    if (i > start) {
      const over = t + b.sec;
      let cut = false;
      if (b.heading && t >= preferHeadingAt * targetSec) cut = true;
      else if (over > maxRatio * targetSec) cut = true;
      else if (t >= preferHeadingAt * targetSec && over - targetSec > targetSec - t) cut = true;
      if (cut) {
        let end = i;
        while (end - 1 > start && blocks[end - 1].heading) end--;   // заголовок уходит в следующую часть
        parts.push({ start, end });
        start = end;
        t = 0;
        for (let k = start; k < i; k++) t += blocks[k].sec;
      }
    }
    t += b.sec;
  }
  parts.push({ start, end: n });
  return parts.map(p => ({ ...p, sec: blocks.slice(p.start, p.end).reduce((a, b) => a + b.sec, 0) }));
}

export function partMinutes(sec) { return Math.max(1, Math.round(sec / 60)); }
