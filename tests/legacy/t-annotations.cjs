// Checks 1-3: undo/redo, highlighter crispness (pixel test), selection pill.
const L = require('./lib.cjs');
const { ok, sleep } = L;

// decode two PNG screenshots in the page and compare pixels
async function analyze(p, aB64, bB64, spec) {
  return p.evaluate(async ([a, b, spec]) => {
    const load = async s => { const bl = await (await fetch('data:image/png;base64,' + s)).blob(); const bm = await createImageBitmap(bl); const c = document.createElement('canvas'); c.width = bm.width; c.height = bm.height; const g = c.getContext('2d'); g.drawImage(bm, 0, 0); return g.getImageData(0, 0, c.width, c.height); };
    const A = await load(a), B = await load(b);
    const lum = (d, i) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    const out = { w: A.width, h: A.height };
    // glyph pixels: dark in A
    let n = 0, sumB = 0, maxB = 0, sumA = 0;
    for (let i = 0; i < A.data.length; i += 4) if (lum(A.data, i) < 60) { n++; sumA += lum(A.data, i); const l = lum(B.data, i); sumB += l; if (l > maxB) maxB = l; }
    out.glyphs = n; out.meanA = n ? sumA / n : 0; out.meanB = n ? sumB / n : 0; out.maxB = maxB;
    // sample colour at a given point (x,y) of B
    const cnt = (c, t = 8) => { let k = 0; for (let i = 0; i < B.data.length; i += 4) if (Math.abs(B.data[i] - c[0]) < t && Math.abs(B.data[i + 1] - c[1]) < t && Math.abs(B.data[i + 2] - c[2]) < t) k++; return k; };
    out.counts = (spec.colors || []).map(c => cnt(c));
    out.samples = (spec.points || []).map(([x, y]) => { const i = (y * B.width + x) * 4; return [B.data[i], B.data[i + 1], B.data[i + 2]]; });
    out.base = (spec.points || []).map(([x, y]) => { const i = (y * A.width + x) * 4; return [A.data[i], A.data[i + 1], A.data[i + 2]]; });
    return out;
  }, [aB64, bB64, spec]);
}

async function run(browser) {
  console.log('\n=== Undo / redo, highlighter, selection pill ===');
  const { ctx, p, logs } = await L.newSession(browser, { width: 1180, height: 820 });
  await L.openSubject(p, 'Анатомия');
  await L.importFiles(p, ['sample.pdf', 'small.html']);

  // ---------- 1. undo / redo ----------
  await L.openDoc(p, 'sample', 'PDF', 'normal');
  await p.waitForSelector('.pg .textLayer span');
  ok('кнопки отмены/повтора выключены в начале', await p.evaluate(() => document.querySelector('[data-id=undo]').disabled && document.querySelector('[data-id=redo]').disabled));
  const pg = await p.locator('.pg[data-page="1"]').boundingBox();
  await p.click('[data-id=pen]');
  ok('Ручка включается и показывает настройки', (await p.$$('.popover .sw')).length === 6 && (await p.$$('.popover .wbtn')).length === 3);
  for (let k = 0; k < 3; k++) {
    await p.mouse.move(pg.x + 120, pg.y + 200 + k * 40); await p.mouse.down();
    for (let i = 1; i <= 14; i++) await p.mouse.move(pg.x + 120 + i * 14, pg.y + 200 + k * 40 + Math.sin(i / 2) * 14);
    await p.mouse.up();
  }
  ok('3 штриха нарисованы (по одной команде на штрих)', await L.store(p, "s.filter(r=>r.type==='pen').length === 3 && s.undoStack.length === 3"));
  ok('после первого штриха кнопка «Отмена» включена', await p.evaluate(() => !document.querySelector('[data-id=undo]').disabled));
  await p.evaluate(() => window.__reader.tools.set({ tool: 'none' }));
  for (let k = 0; k < 2; k++) {
    await p.evaluate(k => { const sp = document.querySelectorAll('.pg[data-page="1"] .textLayer span'); const r = document.createRange(); r.setStart(sp[2 + k * 3].firstChild, 0); r.setEnd(sp[2 + k * 3].firstChild, sp[2 + k * 3].firstChild.length); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }, k);
    await p.waitForSelector('.pill.show');
    await p.click('.pill .pbtn.main');
    await sleep(150);
  }
  ok('2 текстовые пометки добавлены', await L.store(p, "s.filter(r=>r.type==='hl').length === 2"));
  const snapshot = JSON.stringify(await L.store(p, 's.all().map(r=>({id:r.id,type:r.type,pts:r.points&&r.points.length,rects:r.rects}))'));
  for (let i = 0; i < 5; i++) { await p.click('[data-id=undo]'); await sleep(60); }
  ok('5 отмен → пусто', await L.store(p, 's.count() === 0'));
  ok('«Отмена» отключена, «Повтор» включена', await p.evaluate(() => document.querySelector('[data-id=undo]').disabled && !document.querySelector('[data-id=redo]').disabled));
  ok('на листе ничего не осталось', await p.evaluate(() => !document.querySelector('.dl-pen path') && !window.__reader.store.all().some(r => r.type === 'hl')));
  for (let i = 0; i < 5; i++) { await p.click('[data-id=redo]'); await sleep(60); }
  ok('5 повторов → то же самое', JSON.stringify(await L.store(p, 's.all().map(r=>({id:r.id,type:r.type,pts:r.points&&r.points.length,rects:r.rects}))')) === snapshot);
  ok('«Повтор» отключена после всех повторов', await p.evaluate(() => document.querySelector('[data-id=redo]').disabled));
  // keyboard shortcuts
  await p.keyboard.press('Control+z'); ok('Ctrl+Z отменяет', await L.store(p, 's.count() === 4'));
  await p.keyboard.press('Control+Shift+z'); ok('Ctrl+Shift+Z повторяет', await L.store(p, 's.count() === 5'));
  // eraser = one command per drag
  await p.evaluate(() => window.__reader.tools.set({ tool: 'eraser', eraserIdx: 2 }));
  const before = await L.store(p, 's.undoStack.length');
  await p.mouse.move(pg.x + 100, pg.y + 200); await p.mouse.down(); await p.mouse.move(pg.x + 100, pg.y + 640, { steps: 12 }); await p.mouse.move(pg.x + 400, pg.y + 640, { steps: 12 }); await p.mouse.up();
  const erased = await L.store(p, "s.filter(r=>r.type==='pen').length");
  ok('ластик стёр несколько штрихов за одно движение одной командой', erased < 3 && (await L.store(p, 's.undoStack.length')) === before + 1, [erased]);
  await p.click('[data-id=undo]');
  ok('отмена возвращает всё стёртое', await L.store(p, "s.filter(r=>r.type==='pen').length === 3"));
  await p.evaluate(() => window.__reader.tools.set({ tool: 'none' }));
  await sleep(1200);
  await L.reload(p);
  await p.waitForFunction(() => window.__reader && window.__reader.doc() && window.__reader.doc().mode, null, { timeout: 30000 });
  await sleep(800);
  ok('после перезагрузки состояние сохранилось (5 пометок)', await L.store(p, 's.count() === 5'));
  ok('после перезагрузки штрихи и маркер на листе', await p.evaluate(() => document.querySelectorAll('.dl-pen path').length === 3 && window.__reader.store.all().filter(r => r.type === 'hl').length >= 2));
  ok('после перезагрузки история отмены сохранена (Отмена доступна)', await p.evaluate(() => !document.querySelector('[data-id=undo]').disabled));

  // ---------- 2. crispness ----------
  await p.evaluate(() => { const s = window.__reader.store; s.transaction(() => s.all().forEach(r => s.remove(r.id))); });
  await sleep(300);
  const el = p.locator('.pg[data-page="1"]');
  const box = await el.boundingBox();
  const clip = { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.min(Math.round(box.height), 700) };
  const shotA = (await p.screenshot({ clip })).toString('base64');
  // highlight two line ranges with two different colours, overlapping
  const lines = await p.evaluate(() => { const sp = [...document.querySelectorAll('.pg[data-page="1"] .textLayer span')].filter(s => s.textContent.trim().length > 20).slice(0, 4); return sp.length; });
  ok('на странице есть строки текста', lines >= 3, lines);
  const pick = async (k, color) => {
    await p.evaluate(([k]) => { const sp = [...document.querySelectorAll('.pg[data-page="1"] .textLayer span')].filter(s => s.textContent.trim().length > 20); const r = document.createRange(); r.setStart(sp[k].firstChild, 0); r.setEnd(sp[k + 1].firstChild, sp[k + 1].firstChild.length); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }, [k]);
    await p.waitForSelector('.pill.show');
    await p.evaluate(c => window.__reader.tools.set({ color: c }), color);
    await p.click('.pill .pbtn.main'); await sleep(250);
  };
  await pick(0, 1); await pick(1, 2);      // overlap on the second line
  // highlights are painted INTO the page bitmap (canvas multiply); their geometry is data in original page coordinates
  const hlRects = await p.evaluate(() => { const ir = document.querySelector('.pg[data-page="1"] .pg-inner').getBoundingClientRect(); return window.__reader.store.all().filter(r => r.type === 'hl').flatMap(r => r.rects.map(q => [ir.x + q[0] * ir.width, ir.y + q[1] * ir.width, q[2] * ir.width, q[3] * ir.width])); });
  // brush stroke across the third/fourth lines
  await p.evaluate(() => window.__reader.tools.set({ tool: 'marker', brush: true, color: 4 }));
  const textY = await p.evaluate(() => [...document.querySelectorAll('.pg[data-page="1"] .textLayer span')].filter(s => s.textContent.trim().length > 20).slice(3, 5).map(s => s.getBoundingClientRect().y));
  await p.mouse.move(box.x + 60, textY[0] + 5); await p.mouse.down(); await p.mouse.move(box.x + 500, textY[0] + 5, { steps: 10 }); await p.mouse.move(box.x + 500, textY[1] + 5, { steps: 4 }); await p.mouse.move(box.x + 80, textY[1] + 5, { steps: 10 }); await p.mouse.up();
  // second stroke overlapping the first (same colour must not get darker)
  await p.mouse.move(box.x + 60, textY[0] + 8); await p.mouse.down(); await p.mouse.move(box.x + 500, textY[0] + 8, { steps: 10 }); await p.mouse.up();
  await p.evaluate(() => window.__reader.tools.set({ tool: 'none' }));
  await sleep(300);
  const shotB = (await p.screenshot({ clip })).toString('base64');
  // sample a background point inside the overlap of the two highlight rects and one in the single-colour area
  const [r1, r2] = hlRects;
  const ovX = Math.round(Math.max(r1[0], r2[0]) + 6 - clip.x), ovY = Math.round(Math.max(r1[1], r2[1]) + 1 - clip.y);
  const res = await analyze(p, shotA, shotB, { points: [[ovX, ovY], [Math.round(r1[0] + 4 - clip.x), Math.round(r1[1] + 1 - clip.y)]], colors: [[255, 229, 138], [255, 201, 217], [255, 180, 117]] });
  ok('чёрный текст остаётся чёрным под маркером и кистью (средняя яркость глифов)', res.glyphs > 500 && res.meanB < 45, res);
  ok('ни один глиф не посветлел заметно', res.maxB < 120, res.maxB);
  const [cy, cp, co] = res.counts;      // pure yellow, pure pink, and their multiply = orange (255,180,117)
  ok('пересечение двух маркеров — чистое умножение цветов (оранжевый), не серый', cy > 300 && cp > 300 && co > 300, res.counts);
  ok('кисть: два штриха одного цвета записаны, рисуются в битмап страницы (без CSS-наложения)', await L.store(p, "s.filter(r=>r.type==='brush').length === 2 && new Set(s.filter(r=>r.type==='brush').map(r=>r.color)).size === 1") && await p.evaluate(() => !document.querySelector('.pg[data-page="1"] .dl-brush g')));
  await L.reload(p);
  await p.waitForSelector('.reader'); await p.click('.rd-back'); await p.waitForSelector('.doc-card');

  // ---------- 3. selection pill on HTML ----------
  await L.openDoc(p, 'small', 'HTML', 'normal');
  await p.waitForSelector('.doc');
  await L.selectText(p, '.doc p', 7, 21);
  await p.waitForSelector('.pill.show');
  ok('при выделении появляется плавающая панель', await p.evaluate(() => getComputedStyle(document.querySelector('.pill')).display !== 'none' && document.querySelector('.reader').classList.contains('sel-active')));
  const bb = await p.locator('.pill .pbtn.main').boundingBox();
  await p.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await p.mouse.down();
  const kept = await p.evaluate(() => String(getSelection()).length);
  ok('нажатие на кнопку панели не сбрасывает выделение', kept > 5, kept);
  await p.mouse.up(); await sleep(200);
  ok('пометка применена, выделение снято', (await p.$$('.doc .mk')).length === 1 && await p.evaluate(() => getSelection().isCollapsed));
  const col = await p.evaluate(() => { const m = document.querySelector('.doc .mk'); const cs = getComputedStyle(m); return { bg: cs.backgroundColor, color: cs.color, deco: cs.textDecorationLine }; });
  ok('цвет текста под пометкой не тронут (тёмный), фон сплошной', /rgb\(38, 33, 43\)|rgb\(0, 0, 0\)/.test(col.color) || col.color === 'rgb(21, 29, 46)', col);
  // overlapping text marks: computed multiply
  await L.selectText(p, '.doc p', 12, 30);
  await p.evaluate(() => window.__reader.tools.set({ color: 2 }));
  await p.waitForSelector('.pill.show'); await p.click('.pill .pbtn.main'); await sleep(200);
  const bgs = await p.evaluate(() => [...document.querySelectorAll('.doc .mk')].map(m => m.style.backgroundColor));
  ok('пересечение в тексте: отдельный сегмент с перемноженным цветом', bgs.some(c => c === 'rgb(255, 181, 117)'), bgs);
  // underline combined with highlight
  await L.selectText(p, '.doc p', 7, 21);
  await p.waitForSelector('.pill.show'); await p.click('.pill .pbtn >> nth=1'); await sleep(200);
  ok('подчёркивание комбинируется с маркером', await p.evaluate(() => [...document.querySelectorAll('.doc .mk')].some(m => m.style.textDecorationLine.includes('underline') && m.style.backgroundColor)));
  ok('пометки данные: 3 записи в сторе', await L.store(p, 's.textMarks().length === 3'));
  await sleep(1000);
  const nmk = (await p.$$('.doc .mk')).length;
  await L.reload(p); await p.waitForFunction(() => window.__reader && window.__reader.doc() && window.__reader.doc().mode, null, { timeout: 30000 }); await sleep(800);
  ok('после перезагрузки пометки на месте', (await p.$$('.doc .mk')).length === nmk && nmk > 0, [nmk, (await p.$$('.doc .mk')).length]);
  for (const m of ['book', 'blocks', 'normal']) {
    await p.click(`[data-mode=${m}]`); await sleep(1400);
    const n = await p.evaluate(() => document.querySelectorAll('.doc .mk, .book-flow .mk').length);
    ok(`пометки видны в режиме «${m}»`, n >= 3, n);
  }
  // marker mode applies automatically
  await p.evaluate(() => window.__reader.tools.set({ tool: 'marker', markerMode: true, color: 3 }));
  await L.selectText(p, '.doc p', 40, 52);
  await sleep(900);
  ok('режим маркера: выделил — закрасилось само', await L.store(p, "s.textMarks().filter(m=>m.color==='m3').length === 1"));
  await p.evaluate(() => window.__reader.tools.set({ tool: 'none', markerMode: false }));
  // tap on a mark -> popover, remove
  await p.click('.doc .mk >> nth=0');
  await p.waitForSelector('.popover');
  ok('касание метки открывает мини-меню', (await p.textContent('.popover')).includes('Убрать'));
  await p.click('.popover .btn-danger-soft'); await sleep(200);
  ok('удаление метки из меню', await L.store(p, 's.textMarks().length < 4'));
  ok('нет console.error', logs.length === 0, logs);
  await p.screenshot({ path: L.OUT + '/annotations-final.png' });
  await ctx.close();
}
module.exports = { run };
