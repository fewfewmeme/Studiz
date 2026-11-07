// Check 4: book mode (spread / single page, no clipped text, stable page count, leaf animation, drag-turn).
const L = require('./lib.cjs');
const { ok, sleep } = L;

async function bookState(p) {
  return p.evaluate(() => {
    const c = document.querySelector('.book-counter').textContent;
    const sheet = document.querySelector('.book-sheet');
    return { counter: c, single: sheet.classList.contains('single'), total: Number(/\/ (\d+)/.exec(c)[1]), first: Number(/стр\. (\d+)/.exec(c)[1]) };
  });
}
// every painted text line of the visible spread must lie inside the two page content boxes
async function clipped(p) {
  return p.evaluate(() => {
    const sheet = document.querySelector('.book-sheet').getBoundingClientRect();
    const sc = sheet.width / (document.querySelector('.book-sheet').offsetWidth);
    const single = document.querySelector('.book-sheet').classList.contains('single');
    const pw = 1000 * sc;
    const boxes = single ? [[sheet.left + 95 * sc, sheet.left + (95 + 810) * sc]] : [[sheet.left + 80 * sc, sheet.left + (80 + 810) * sc], [sheet.left + pw + 110 * sc, sheet.left + pw + (110 + 810) * sc]];
    const top = sheet.top + 110 * sc, bottom = sheet.top + (110 + 1170) * sc;
    const flow = document.querySelector('.book-flow');
    const w = document.createTreeWalker(flow, NodeFilter.SHOW_TEXT);
    let bad = 0, seen = 0, n;
    const r = document.createRange();
    while ((n = w.nextNode())) {
      if (!n.data.trim()) continue;
      r.selectNodeContents(n);
      for (const q of r.getClientRects()) {
        if (q.width < 1) continue;
        const inside = boxes.some(b => q.left >= b[0] - 2 && q.right <= b[1] + 2);
        const visible = boxes.some(b => q.right > b[0] && q.left < b[1]) && q.bottom > top - 4 && q.top < bottom + 4;
        if (!visible) continue;
        seen++;
        if (!inside || q.top < top - 3 || q.bottom > bottom + 3) bad++;
      }
    }
    return { bad, seen };
  });
}

async function run(browser) {
  console.log('\n=== Book mode ===');
  const { ctx, p, logs } = await L.newSession(browser, { width: 1180, height: 820 });
  await L.openSubject(p, 'Анатомия');
  await L.importFiles(p, ['sample.html', 'sample.pdf']);
  await L.openDoc(p, 'sample', 'HTML', 'book');
  await p.waitForSelector('.book-sheet');
  await sleep(600);
  let st = await bookState(p);
  ok('1180×820: разворот: слева настоящая обложка (не пустая страница), справа страница 1', !st.single && await p.evaluate(() => !!document.querySelector('.paper-left .cover-face .cf-title') && getComputedStyle(document.querySelector('.paper-left')).display !== 'none'), st);
  const geo = await p.evaluate(() => { const s = document.querySelector('.book-sheet'); return { w: s.offsetWidth, h: s.offsetHeight }; });
  ok('логический размер страницы фиксирован (1000×1400)', geo.w === 2000 && geo.h === 1400, geo);
  ok('корешок, обрезы страниц, колонтитулы на месте', await p.evaluate(() => !!document.querySelector('.book-spine') && !!document.querySelector('.book-edge') && !!document.querySelector('.pf-head') && !!document.querySelector('.pf-foot')));
  let cl = await clipped(p);
  ok('текст не обрезан по краям страниц (разворот)', cl.seen > 20 && cl.bad === 0, cl);
  const total0 = st.total;
  // stable page count after resizes
  await p.setViewportSize({ width: 900, height: 700 }); await sleep(900);
  const mid = await bookState(p);
  await p.setViewportSize({ width: 1180, height: 820 }); await sleep(900);
  const back = await bookState(p);
  ok('число страниц стабильно после изменения размера туда и обратно', back.total === total0, [total0, mid.total, back.total]);
  await p.setViewportSize({ width: 1180, height: 820 }); await sleep(300);
  // mid-turn screenshot: leaf is rotating with a shade
  await p.click('.book-bar .ibtn[aria-label="Следующая страница"]');
  await sleep(260);
  const leaf = await p.evaluate(() => { const l = document.querySelector('.leaf'); if (!l) return null; const t = getComputedStyle(l).transform; const sh = [...document.querySelectorAll('.leaf-shade, .turn-cast')].map(e => parseFloat(getComputedStyle(e).opacity)); return { t, sh }; });
  ok('в середине перелистывания лист поворачивается и затеняется', !!leaf && leaf.t !== 'none' && Math.max(...leaf.sh) > 0.05, leaf);
  await p.screenshot({ path: L.OUT + '/book-mid-turn-1180x820.png' });
  await sleep(900);
  st = await bookState(p);
  ok('после перелистывания следующий разворот', st.first >= 2 && st.counter.includes('–'), st);
  ok('лист убран после анимации', await p.evaluate(() => !document.querySelector('.leaf')));
  // double input during a turn
  await p.keyboard.press('ArrowRight'); await sleep(120); await p.keyboard.press('ArrowRight'); await sleep(60); await p.click('.book-bar .ibtn[aria-label="Следующая страница"]');
  await sleep(1800);
  const after = await bookState(p);
  ok('быстрые повторные нажатия во время листания не ломают состояние', !(await p.$('.leaf')) && after.first > st.first && after.first <= after.total, [st, after]);
  cl = await clipped(p);
  ok('после серии листаний текст не обрезан', cl.bad === 0, cl);
  // drag turn with touch pointer events
  const before = await bookState(p);
  await p.evaluate(() => { const v = document.querySelector('.book-desk'); const o = { pointerType: 'touch', pointerId: 9, bubbles: true, isPrimary: true }; const r = v.getBoundingClientRect(); const y = r.top + r.height / 2; const x0 = r.left + r.width * 0.8;
    v.dispatchEvent(new PointerEvent('pointerdown', { ...o, clientX: x0, clientY: y }));
    for (let i = 1; i <= 8; i++) v.dispatchEvent(new PointerEvent('pointermove', { ...o, clientX: x0 - i * 50, clientY: y }));
    window.__midLeaf = !!document.querySelector('.leaf') && getComputedStyle(document.querySelector('.leaf')).transform;
    v.dispatchEvent(new PointerEvent('pointerup', { ...o, clientX: x0 - 400, clientY: y })); });
  await sleep(1200);
  const dragged = await bookState(p);
  ok('лист следует за пальцем и перелистывает при перетаскивании', (await p.evaluate(() => window.__midLeaf)) && dragged.first > before.first, [before, dragged, await p.evaluate(() => window.__midLeaf)]);
  const b2 = await bookState(p);
  await p.evaluate(() => { const v = document.querySelector('.book-desk'); const o = { pointerType: 'touch', pointerId: 10, bubbles: true, isPrimary: true }; const r = v.getBoundingClientRect(); const y = r.top + r.height / 2; const x0 = r.left + r.width * 0.8;
    v.dispatchEvent(new PointerEvent('pointerdown', { ...o, clientX: x0, clientY: y })); (async () => { for (let i = 1; i <= 3; i++) { v.dispatchEvent(new PointerEvent('pointermove', { ...o, clientX: x0 - i * 20, clientY: y })); await new Promise(r => setTimeout(r, 120)); } v.dispatchEvent(new PointerEvent('pointerup', { ...o, clientX: x0 - 60, clientY: y })); })(); });
  await sleep(700);
  await sleep(1000);
  ok('короткое перетаскивание возвращает лист на место', (await bookState(p)).first === b2.first);
  // tap on edge, slider, keys
  const vb = await p.locator('.book-desk').boundingBox();
  await p.mouse.click(vb.x + 90, vb.y + vb.height / 2); await sleep(1000);
  ok('касание левого края листает назад', (await bookState(p)).first < b2.first);
  await p.fill('.book-slider', '3'); await p.dispatchEvent('.book-slider', 'change'); await sleep(900);
  ok('ползунок страниц переходит к развороту', (await bookState(p)).first > 4);
  // A+ re-paginates and keeps reading position (by character anchor)
  const firstText = await p.evaluate(() => window.__reader.doc().book.offsetOfPage(window.__reader.doc().engine.firstPageOfView()));
  await p.click('.book-bar .ibtn.tx >> nth=1'); await sleep(1500);
  const posAfter = await p.evaluate(() => window.__reader.doc().book.offsetOfPage(window.__reader.doc().engine.firstPageOfView()));
  const total2 = (await bookState(p)).total;
  ok('A+ меняет число страниц', total2 > total0, [total0, total2]);
  ok('A+ сохраняет место чтения (по символу)', Math.abs(posAfter - firstText) < 1500, [firstText, posAfter]);
  // table of contents + bookmark
  await p.click('.book-bar .ibtn[aria-label="Оглавление"]');
  await p.waitForSelector('.toc-item');
  ok('оглавление по заголовкам', (await p.$$('.toc-item')).length >= 5);
  await p.click('.toc-item >> nth=3'); await sleep(1100);
  ok('переход по заголовку', (await bookState(p)).first > 4);
  await p.evaluate(() => window.__reader.doc().engine.toggleBookmark(window.__reader.doc().engine.firstPageOfView()));
  await sleep(400);
  ok('закладка (загнутый уголок) ставится', (await p.$$('.pf-ear.on')).length >= 1);
  // marks work in book mode
  await L.selectText(p, '.book-flow p', 0, 14, 12);
  await p.waitForSelector('.pill.show'); await p.click('.pill .pbtn.main'); await sleep(300);
  ok('пометка ставится в книге', (await p.$$('.book-flow .mk')).length >= 1);
  await p.screenshot({ path: L.OUT + '/book-1180x820.png' });

  // portrait: single page
  await p.setViewportSize({ width: 820, height: 1180 }); await sleep(1300);
  st = await bookState(p);
  ok('820×1180: одна страница', st.single && !st.counter.includes('–'), st);
  cl = await clipped(p);
  ok('текст не обрезан (одна страница)', cl.seen > 10 && cl.bad === 0, cl);
  await p.screenshot({ path: L.OUT + '/book-820x1180.png' });
  await p.setViewportSize({ width: 390, height: 844 }); await sleep(1300);
  st = await bookState(p);
  ok('390×844: одна страница', st.single, st);
  cl = await clipped(p);
  ok('текст не обрезан на iPhone', cl.bad === 0, cl);
  await p.screenshot({ path: L.OUT + '/book-390x844.png' });
  await p.setViewportSize({ width: 1024, height: 768 }); await sleep(1300);
  st = await bookState(p);
  ok('1024×768: разворот', !st.single, st);
  await p.setViewportSize({ width: 1366, height: 1024 }); await sleep(1300);
  ok('1366×1024: разворот', !(await bookState(p)).single);

  // PDF book: cover on the right, spread of two pages, leaf turn
  await p.setViewportSize({ width: 1180, height: 820 });
  await p.click('.rd-back'); await p.waitForSelector('.doc-card');
  await L.openDoc(p, 'sample', 'PDF', 'book');
  await p.waitForSelector('.book-sheet .pg canvas'); await sleep(1500);
  st = await bookState(p);
  ok('PDF: первая страница — обложка справа', !st.single && st.counter.startsWith('стр. 1 /'), st);
  await p.click('.book-bar .ibtn[aria-label="Следующая страница"]'); await sleep(280);
  ok('PDF: страница поворачивается', await p.evaluate(() => !!document.querySelector('.leaf canvas')));
  await sleep(1000);
  st = await bookState(p);
  ok('PDF: разворот из двух соседних страниц', st.counter.includes('2–3'), st);
  await p.waitForFunction(() => document.querySelectorAll('.book-sheet .pg canvas').length === 2, null, { timeout: 5000 }).catch(() => {});
  await p.screenshot({ path: L.OUT + '/book-pdf-1180x820.png' });
  ok('нет console.error', logs.length === 0, logs);
  await ctx.close();
}
module.exports = { run };
