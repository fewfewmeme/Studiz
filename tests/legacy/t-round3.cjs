// Round 3 quality gate: reader layout, zoom, selection, marks pixels, trim margins, pen across modes, Блоки persistence/recall/questions,
// sidebar, no looping animation, backup status.
const L = require('./lib.cjs');
const { ok, sleep } = L;
const sharp = (() => { try { return require('sharp'); } catch { return null; } })();

const animInfinite = p => p.evaluate(() => document.getAnimations().filter(a => { const t = a.effect?.getComputedTiming?.(); return t && t.iterations === Infinity; }).map(a => a.animationName || a.constructor.name));

async function run(browser) {
  console.log('\n=== Round 3: layout, zoom, selection, marks, trim, pen, blocks ===');
  // ---------------- landscape 1180x740 ----------------
  const { ctx, p, logs } = await L.newSession(browser, { width: 1180, height: 740 });
  await L.openSubject(p, 'Анатомия');
  await L.importFiles(p, ['sample.pdf', 'sample.html']);

  // splash / home / settings: no looping animation, sidebar labels not truncated
  await p.evaluate(() => { location.hash = '#/'; }); await p.waitForSelector('.subject-card'); await sleep(600);
  ok('главная: ни одной бесконечной анимации', (await animInfinite(p)).length === 0, await animInfinite(p));
  const trunc = await p.evaluate(() => [...document.querySelectorAll('.side-subjects .side-name')].map(e => ({ t: e.textContent, over: e.scrollWidth > e.clientWidth + 1, lines: Math.round(e.getBoundingClientRect().height / parseFloat(getComputedStyle(e).lineHeight)) })).filter(x => x.over || x.lines > 2));
  ok('сайдбар: названия всех 8 предметов не обрезаны', trunc.length === 0 && (await p.$$('.side-subjects .side-name')).length === 8, trunc);
  ok('сайдбар: нет серых «чёрточек», есть счётчик/кольцо только у предмета с файлами', await p.evaluate(() => !document.querySelector('.mini-prog') && !!document.querySelector('[data-meta="anatomy"] .ring') && document.querySelector('[data-meta="philosophy"]').children.length === 0));
  ok('сайдбар: строка «Копия: …»', /Копи/.test(await p.textContent('#side-backup')), await p.textContent('#side-backup'));
  ok('на главной нет розовой плашки: тонкое нейтральное уведомление', await p.evaluate(() => { const n = document.querySelector('.notice'); return !!n && n.getBoundingClientRect().height < 60; }));
  ok('главная: герой с фото (navy) и одна кнопка «Продолжить»/выбор предмета', await p.evaluate(() => !!document.querySelector('.hero .hero-photo') && document.querySelectorAll('.hero .btn-primary').length === 1));
  await p.evaluate(() => { location.hash = '#/settings'; }); await p.waitForSelector('.theme-card'); await sleep(500);
  ok('настройки: хранилище — занято/свободно и состояние защиты', /Занято: .+Свободно/.test(await p.textContent('.content')) && /Защита от автоматической очистки/.test(await p.textContent('#persist-state')), await p.textContent('#persist-state'));
  ok('настройки: карточка «Установить на экран Домой» с тремя шагами', await p.evaluate(() => /Установить на экран/.test(document.body.textContent) && document.querySelectorAll('.install-steps li').length === 3));
  ok('настройки: выбор наклеек для 8 предметов', await p.evaluate(() => document.querySelectorAll('.subj-pick .chip').length === 8));
  await p.click('.subj-pick .chip >> nth=2'); await p.waitForSelector('.sticker-pool .pool-item');
  await p.click('.sticker-pool .pool-item >> nth=5'); await sleep(300);
  ok('наклейку предмета можно сменить', (await L.idb(p, 'kv', 'subjectStickers')).value.biochem === 'cat-lying');
  ok('настройки: ни одной бесконечной анимации', (await animInfinite(p)).length === 0);

  // ---------------- landscape reader (PDF, normal) ----------------
  await p.evaluate(() => { location.hash = '#/'; }); await p.waitForSelector('.subject-card');
  await L.openSubject(p, 'Анатомия');
  await L.openDoc(p, 'sample', 'PDF', 'normal');
  await p.waitForSelector('.pg .textLayer span'); await sleep(500);
  const lay = await p.evaluate(() => {
    const vw = innerWidth, vh = innerHeight, st = document.querySelector('.rd-stage').getBoundingClientRect();
    const top = document.querySelector('.rd-top'), dock = document.querySelector('.dock');
    const area = e => { const r = e.getBoundingClientRect(); return r.width * r.height / (vw * vh); };
    return { vw, vh, w: st.width, h: st.height, topH: top ? top.getBoundingClientRect().height : 0, dockH: dock ? dock.getBoundingClientRect().height : 0, rails: [...document.querySelectorAll('.rail')].map(area), railW: [...document.querySelectorAll('.rail')].map(e => e.getBoundingClientRect().width) };
  });
  ok('горизонтально: нет верхней панели и нижнего дока (высота 0)', lay.topH === 0 && lay.dockH === 0, lay);
  ok('горизонтально: область документа ≥ высота − 16 и ≥ ширина − 2×76', lay.h >= lay.vh - 16 && lay.w >= lay.vw - 152, lay);
  ok('горизонтально: рейки 64 px, каждая < 6% экрана', lay.railW.length === 2 && lay.railW.every(w => w === 64) && lay.rails.every(a => a < 0.06), lay);
  ok('в читалке нет бесконечных анимаций', (await animInfinite(p)).length === 0);
  ok('кнопки режимов — только иконки (нет текста)', await p.evaluate(() => [...document.querySelectorAll('.rd-modes .seg-btn')].every(b => !b.textContent.trim() && b.getAttribute('aria-label'))));
  const pgw = await p.evaluate(() => document.querySelector('.pg[data-page="1"]').getBoundingClientRect().width);
  ok('PDF по ширине ≤ ~900 px (не на весь экран)', pgw <= 905 && pgw > 600, pgw);
  ok('поля обрезаны: видна область с текстом (страница ниже/уже оригинала)', await p.evaluate(() => { const d = window.__reader.doc(); return d.hasTrim && d.trimOn && !!d.crop; }));
  // rails dim after idle, return on touch; focus mode hides them, edge strip brings back
  await sleep(3400);
  ok('рейки тускнеют через ~3 с без касаний', await p.evaluate(() => document.querySelector('.reader').classList.contains('dim') && +getComputedStyle(document.querySelector('.rail')).opacity < 0.7));
  await p.mouse.move(600, 300); await sleep(700);
  ok('и возвращаются при касании', await p.evaluate(() => !document.querySelector('.reader').classList.contains('dim')));
  await p.click('.rail-l button[aria-label="Режим фокуса"]'); await sleep(500);
  ok('режим фокуса скрывает обе рейки', await p.evaluate(() => [...document.querySelectorAll('.rail')].every(r => r.getBoundingClientRect().right < 0 || r.getBoundingClientRect().left > innerWidth)));
  await p.click('.rd-edge.edge-l'); await sleep(500);
  ok('нажатие на край возвращает панели', await p.evaluate(() => !document.querySelector('.reader').classList.contains('focus')));

  // zoom
  const w100 = await p.evaluate(() => document.querySelector('.pg[data-page="1"]').getBoundingClientRect().width);
  await p.click('.rd-zoom button[aria-label="Крупнее"]'); await sleep(600);
  const w118 = await p.evaluate(() => document.querySelector('.pg[data-page="1"]').getBoundingClientRect().width);
  ok('«+» увеличивает страницы (×1.18), процент обновился', Math.abs(w118 / w100 - 1.18) < 0.03 && /118%/.test(await p.textContent('.zoom-pct')), [w100, w118]);
  await p.click('.rd-zoom button[aria-label="По ширине"]'); await sleep(600);
  const wfit = await p.evaluate(() => document.querySelector('.pg[data-page="1"]').getBoundingClientRect().width);
  ok('«по ширине» — на всю ширину рабочей области', wfit > w100 && wfit >= 1180 - 152 - 30, wfit);
  for (let i = 0; i < 12; i++) await p.click('.rd-zoom button[aria-label="Мельче"]');
  await sleep(300);
  ok('минимум 60%', /^60%$/.test((await p.textContent('.zoom-pct')).trim()), await p.textContent('.zoom-pct'));
  for (let i = 0; i < 20; i++) await p.click('.rd-zoom button[aria-label="Крупнее"]');
  ok('максимум 300%', /^300%$/.test((await p.textContent('.zoom-pct')).trim()), await p.textContent('.zoom-pct'));
  await p.click('.zoom-pct'); await sleep(500);
  ok('нажатие на процент возвращает 100%', /^100%$/.test((await p.textContent('.zoom-pct')).trim()));
  await p.click('.rd-zoom button[aria-label="Крупнее"]'); await sleep(400);
  await L.reload(p); await p.waitForFunction(() => window.__reader && window.__reader.doc() && window.__reader.doc().mode, null, { timeout: 30000 }); await sleep(800);
  ok('масштаб запоминается для документа и режима', /118%/.test(await p.textContent('.zoom-pct')), await p.textContent('.zoom-pct'));
  await p.click('.zoom-pct'); await sleep(400);
  // pinch via gesture events (Safari path)
  await p.evaluate(() => { const host = document.querySelector('.rd-scroll'); const mk = (t, s) => { const e = new Event(t, { bubbles: true, cancelable: true }); e.scale = s; e.clientX = 600; e.clientY = 300; return e; }; host.dispatchEvent(mk('gesturestart', 1)); host.dispatchEvent(mk('gesturechange', 1.5)); host.dispatchEvent(mk('gestureend', 1.5)); });
  await sleep(700);
  ok('щипок (gesture events) масштабирует до 150%', /15\d%|14\d%/.test(await p.textContent('.zoom-pct')), await p.textContent('.zoom-pct'));
  await p.click('.zoom-pct'); await sleep(400);

  // ---------------- selection: word box vs glyph box, no whole-page selection ----------------
  await sleep(500);
  const sel = await p.evaluate(async () => {
    const d = window.__reader.doc(), v = d.views[0], page = await d.pdf.getPage(1), tc = await page.getTextContent(), base = page.getViewport({ scale: 1 });
    const s = v.innerW / base.width, ir = v.inner.getBoundingClientRect();
    const items = tc.items.filter(i => i.str.trim().length > 30);
    const it = items[0];
    const sp = [...document.querySelectorAll('.pg[data-page="1"] .textLayer > span')].filter(x => x.textContent.trim().length > 30)[0];
    // whole item selection: glyph box from the PDF data vs selection rect
    const r = document.createRange(); r.selectNodeContents(sp); const sl = getSelection(); sl.removeAllRanges(); sl.addRange(r);
    const rc = r.getBoundingClientRect();
    const exp = { x: ir.left + it.transform[4] * s, w: it.width * s };
    // a single word
    const t = sp.firstChild, txt = t.data, a = txt.indexOf(' ') + 1, b = txt.indexOf(' ', a);
    const w = document.createRange(); w.setStart(t, a); w.setEnd(t, b); const wr = w.getBoundingClientRect();
    const cw = rc.width * (b - a) / txt.length;
    return { dx: Math.abs(rc.left - exp.x), dw: Math.abs(rc.width - exp.w), wordInside: wr.left >= rc.left - 2 && wr.right <= rc.right + 2, wordApprox: Math.abs(wr.width - cw) < cw * 0.35, h: rc.height, selLen: String(getSelection()).length, total: [...document.querySelectorAll('.pg[data-page="1"] .textLayer > span')].reduce((n, x) => n + x.textContent.length, 0) };
  });
  ok('выделение строки PDF совпадает с глифами (смещение и ширина ≤ 2 px)', sel.dx <= 2 && sel.dw <= 2, sel);
  ok('выделение слова лежит внутри строки', sel.wordInside && sel.wordApprox, sel);
  ok('выделение — не вся страница', sel.selLen < sel.total * 0.5, sel);
  // iOS long-press that swallows the whole page is cut back to the word under the finger
  await p.evaluate(() => { document.querySelector('.rd-scroll').scrollTop = 0; }); await sleep(500);
  const guard = await p.evaluate(async () => {
    const lay = document.querySelector('.pg[data-page="1"] .textLayer'); const sp = [...lay.querySelectorAll(':scope > span')][3]; const rc = sp.getBoundingClientRect();
    document.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch', clientX: rc.left + 40, clientY: rc.top + 6, bubbles: true }));
    const r = document.createRange(); r.selectNodeContents(lay); const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    const before = String(s).length;
    await new Promise(res => setTimeout(res, 400));
    return { before, after: String(getSelection()).length };
  });
  ok('выделение всей страницы пальцем сжимается до слова', guard.before > 500 && guard.after > 0 && guard.after < 40, guard);
  await p.evaluate(() => getSelection().removeAllRanges());

  // ---------------- marks: pixel test in three modes at 100% and 200% ----------------
  await p.evaluate(() => { const d = window.__reader.doc(); d.zoom = 1; });
  await p.evaluate(() => {
    const sp = [...document.querySelectorAll('.pg[data-page="1"] .textLayer > span')].filter(s => s.textContent.trim().length > 30);
    const r = document.createRange(); r.setStart(sp[0].firstChild, 0); r.setEnd(sp[1].firstChild, sp[1].firstChild.length); const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  });
  await p.waitForSelector('.pill.show'); await p.evaluate(() => window.__reader.tools.set({ color: 1 })); await p.click('.pill .pbtn.main'); await sleep(400);
  ok('маркер создан с прямоугольниками по строкам (высота ≈ 0.95 строки)', await p.evaluate(() => { const r = window.__reader.store.all().find(x => x.type === 'hl'); return r && r.rects.length === 2 && r.rects.every(q => q[3] > 0.005 && q[3] < 0.03); }));
  const markPx = async tag => {
    // find the page view with the mark; read its bitmap: glyph pixels must stay dark, mark pixels must be yellow
    return p.evaluate(() => {
      const d = window.__reader.doc();
      const v = d.views.find(x => x.rendered && x.n === 1 && document.body.contains(x.el));
      if (!v) return { err: 'no view' };
      const c = v.media, g = c.getContext('2d'), k = c.width / v.width;
      const rec = window.__reader.store.all().find(x => x.type === 'hl'), q = rec.rects[0];
      const x0 = Math.round((q[0] * v.innerW - v.offX) * k), y0 = Math.round((q[1] * v.innerW - v.offY) * k), w = Math.round(q[2] * v.innerW * k), h = Math.max(2, Math.round(q[3] * v.innerW * k));
      const img = g.getImageData(Math.max(0, x0), Math.max(0, y0), Math.max(1, w), h).data;
      let dark = 0, yellow = 0, light = 0, n = 0;
      for (let i = 0; i < img.length; i += 4) { n++; const r = img[i], gg = img[i + 1], b = img[i + 2]; if (r + gg + b < 150) dark++; else if (r > 230 && gg > 200 && b < 170) yellow++; else if (r + gg + b > 740) light++; }
      return { n, dark, yellow, light, k };
    });
  };
  for (const zoom of [1, 2]) {
    await p.evaluate(z => window.__reader.doc().setZoom(z), zoom); await sleep(1200);
    const px = await markPx('normal');
    ok(`маркер, Обычный ${zoom * 100}%: текст остался чёрным и закрашен жёлтым`, px.dark > px.n * 0.03 && px.yellow > px.n * 0.4 && px.light < px.n * 0.08, px);
  }
  await p.evaluate(() => window.__reader.doc().setZoom(1));
  await p.click('[data-mode=book]'); await sleep(1800);
  const bk = await p.evaluate(() => { const d = window.__reader.doc(); return d.views.filter(v => v.rendered).length; });
  await p.evaluate(() => window.__reader.doc().engine.goPage(0)); await sleep(1200);
  // in the book, page 1 is the right page; use the same pixel probe
  let px = await markPx('book');
  ok('маркер, Книга: текст остался чёрным и закрашен жёлтым', px.dark > px.n * 0.03 && px.yellow > px.n * 0.4 && px.light < px.n * 0.08, [px, bk]);
  await p.evaluate(() => window.__reader.doc().setZoom(2)); await sleep(1500);
  px = await markPx('book');
  ok('маркер, Книга 200%: то же', !px.err && px.dark > px.n * 0.03 && px.yellow > px.n * 0.4 && px.light < px.n * 0.08, px);
  await p.evaluate(() => window.__reader.doc().setZoom(1)); await sleep(800);
  await p.click('[data-mode=blocks]'); await sleep(2200);
  px = await markPx('blocks');
  ok('маркер, Блоки: текст остался чёрным и закрашен жёлтым', !px.err && px.dark > px.n * 0.03 && px.yellow > px.n * 0.4 && px.light < px.n * 0.08, px);
  ok('в Блоках нет залипающей панели; рейки < 6% экрана', await p.evaluate(() => !document.querySelector('.bk-bar') && [...document.querySelectorAll('.rail')].every(r => { const b = r.getBoundingClientRect(); return b.width * b.height / (innerWidth * innerHeight) < 0.06; })));
  await p.click('[data-mode=normal]'); await sleep(1500);

  // ---------------- pen: same stroke in three modes ----------------
  await p.evaluate(() => { const s = window.__reader.store; s.transaction(() => s.all().forEach(r => s.remove(r.id))); });
  await p.evaluate(() => window.__reader.tools.set({ tool: 'pen', penIdx: 1, penW: 1 }));
  await p.evaluate(() => window.__reader.closePop());
  await p.evaluate(() => { document.querySelector('.rd-scroll').scrollTop = 0; }); await sleep(500);
  const pg = await p.locator('.pg[data-page="1"]').boundingBox();
  await p.mouse.move(pg.x + 150, pg.y + 120); await p.mouse.down();
  for (let i = 1; i <= 16; i++) await p.mouse.move(pg.x + 150 + i * 16, pg.y + 120 + Math.sin(i / 2.5) * 22);
  await p.mouse.up(); await sleep(400);
  await p.evaluate(() => window.__reader.tools.set({ tool: 'none' }));
  const penInfo = async () => p.evaluate(() => {
    const d = window.__reader.doc(); const v = d.views.find(x => x.n === 1 && document.body.contains(x.el)); if (!v) return null;
    const path = v.layer.penSvg.querySelector('path'); if (!path) return null;
    const bb = path.getBBox(), ir = v.inner.getBoundingClientRect(), r = path.getBoundingClientRect();
    return { fill: path.getAttribute('fill'), nx: (r.left - ir.left) / ir.width, ny: (r.top - ir.top) / ir.width, nw: r.width / ir.width, bbw: bb.width };
  });
  const penN = await penInfo();
  await p.click('[data-mode=book]'); await sleep(1800); await p.evaluate(() => window.__reader.doc().engine.goPage(0)); await sleep(1000);
  const penB = await penInfo();
  await p.click('[data-mode=blocks]'); await sleep(2000);
  const penK = await penInfo();
  const same = (a, b) => a && b && a.fill === b.fill && Math.abs(a.nx - b.nx) < 0.004 && Math.abs(a.ny - b.ny) < 0.004 && Math.abs(a.nw - b.nw) < 0.004;
  ok('ручка: штрих одинаков (цвет, положение, ширина) в Обычном, Книге и Блоках', same(penN, penB) && same(penN, penK), [penN, penB, penK]);
  ok('ручка: закруглённые концы, кривая ширины мягкая (минимум 40% базы)', await p.evaluate(async () => { const m = await import('/app/js/anno/draw.js'); return Math.abs(m.penWidthAt(10, 0) - 6) < 1e-6 && Math.abs(m.penWidthAt(10, 1) - 10) < 1e-6 && m.penWidthAt(10, 0.5) > 8; }));
  await p.click('[data-mode=normal]'); await sleep(1200);

  // ---------------- trim margins: toggle never moves a mark ----------------
  await p.evaluate(() => { const s = window.__reader.store; s.transaction(() => s.all().forEach(r => s.remove(r.id))); });
  await p.evaluate(() => {
    const sp = [...document.querySelectorAll('.pg[data-page="1"] .textLayer > span')].filter(s => s.textContent.trim().length > 30);
    const r = document.createRange(); r.setStart(sp[0].firstChild, 0); r.setEnd(sp[0].firstChild, 20); const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  });
  await p.waitForSelector('.pill.show'); await p.click('.pill .pbtn.main'); await sleep(300);
  const recBefore = await p.evaluate(() => JSON.stringify(window.__reader.store.all().find(x => x.type === 'hl').rects));
  const hOn = await p.evaluate(() => document.querySelector('.pg[data-page="1"]').getBoundingClientRect().height);
  await p.click('.rail-r [data-id=more]'); await p.waitForSelector('.popover .switch-row:has-text("Обрезать поля")');
  await p.click('.popover .switch-row:has-text("Обрезать поля") input'); await sleep(2200);
  const hOff = await p.evaluate(() => document.querySelector('.pg[data-page="1"]').getBoundingClientRect().height);
  const recAfter = await p.evaluate(() => JSON.stringify(window.__reader.store.all().find(x => x.type === 'hl').rects));
  const sameText = await p.evaluate(() => { const d = window.__reader.doc(); const v = d.views.find(x => x.n === 1); const r = v.inner.getBoundingClientRect(), sp = [...v.text.querySelectorAll(':scope > span')].filter(s => s.textContent.trim().length > 30)[0].getBoundingClientRect(), q = window.__reader.store.all().find(x => x.type === 'hl').rects[0]; return Math.abs((sp.left - r.left) / r.width - q[0]) < 0.004 && Math.abs((sp.top - r.top) / r.width - q[1]) < 0.012; });
  ok('«Обрезать поля»: выключение делает страницу выше, пометка не сдвинулась (те же координаты, та же строка)', hOff > hOn * 1.05 && recBefore === recAfter && sameText, [hOn, hOff]);
  ok('переключатель обрезки запомнен для документа', (await L.idb(p, 'kv', 'trim:' + (await p.evaluate(() => window.__reader.doc().meta.id)))).value === false);
  await p.click('.rail-r [data-id=more]'); await p.click('.popover .switch-row:has-text("Обрезать поля") input'); await sleep(1800);
  ok('и снова включается', await p.evaluate(() => window.__reader.doc().trimOn === true));
  await p.evaluate(() => window.__reader.closePop());
  ok('нет console.error (альбом)', logs.length === 0, logs);
  await ctx.close();

  // ---------------- Блоки: persistence, recall, questions (HTML) ----------------
  const s2 = await L.newSession(browser, { width: 1180, height: 740 });
  const q = s2.p;
  await L.openSubject(q, 'Анатомия'); await L.importFiles(q, ['sample.html']);
  await L.openDoc(q, 'sample', 'HTML', 'blocks'); await q.waitForSelector('.bk-head');
  const dn = () => q.evaluate(() => [...document.querySelectorAll('.bk-head')].map(h => h.classList.contains('bk-done')));
  await q.evaluate(() => { document.querySelectorAll('.bk-foot .bk-read')[1].click(); }); await sleep(500);
  await q.evaluate(() => { document.querySelectorAll('.bk-foot .bk-read')[3].click(); }); await sleep(700);
  const d1 = await dn();
  ok('«Прочитала»: два блока отмечены', d1[1] && d1[3] && d1.filter(Boolean).length === 2, d1);
  const kv1 = (await L.idb(q, 'kv', 'bk:' + (await q.evaluate(() => window.__reader.doc().meta.id)))).value;
  ok('…и записаны в IndexedDB сразу (по единицам текста)', Object.keys(kv1.doneU).length >= 2, Object.keys(kv1.doneU).length);
  await q.click('.timer-chip'); await q.waitForSelector('.bk-tpop'); const cnt1 = await q.textContent('.bk-tpop');
  await L.reload(q); await q.waitForSelector('.bk-head'); await sleep(900);
  const d2 = await dn();
  ok('после перезагрузки отметки на месте', JSON.stringify(d1) === JSON.stringify(d2), d2);
  await q.click('.rd-back'); await q.waitForSelector('.doc-card'); await L.openDoc(q, 'sample', 'HTML');
  await q.waitForSelector('.bk-head'); await sleep(600);
  ok('после выхода из документа и возврата отметки на месте', JSON.stringify(d1) === JSON.stringify(await dn()));
  await q.click('[data-mode=normal]'); await sleep(900); await q.click('[data-mode=book]'); await sleep(1500); await q.click('[data-mode=blocks]'); await q.waitForSelector('.bk-head'); await sleep(700);
  ok('после смены режимов отметки на месте', JSON.stringify(d1) === JSON.stringify(await dn()));
  await q.click('.timer-chip'); await q.waitForSelector('.bk-tpop'); const cnt2 = await q.textContent('.bk-tpop');
  ok('прогресс, рыбки и креветки не изменились', cnt1.replace(/\s+/g, '') === cnt2.replace(/\s+/g, '') && /2 \/ \d+/.test(cnt2), [cnt1, cnt2]);
  // undo toggles it back (history lives while the document is open)
  await q.evaluate(() => window.__reader.closePop());
  await q.evaluate(() => document.querySelectorAll('.bk-foot .bk-read')[4].click()); await sleep(700);
  ok('перед отменой отмечено три блока', (await dn()).filter(Boolean).length === 3);
  await q.click('.rail-r [data-id=undo]'); await sleep(400);
  ok('Отмена снимает последнюю отметку «Прочитала»', (await dn()).filter(Boolean).length === 2);
  await q.click('.rail-r [data-id=redo]'); await sleep(400);
  ok('Повтор возвращает', (await dn()).filter(Boolean).length === 3);
  await q.evaluate(() => document.querySelectorAll('.bk-foot .bk-read')[1].click()); await sleep(400);
  ok('повторное нажатие снимает отметку', (await dn()).filter(Boolean).length === 2);

  // recall: a toggle that is never stuck
  const blur = () => q.evaluate(() => document.querySelectorAll('.bk-recall').length);
  await q.evaluate(() => document.querySelectorAll('.bk-foot .bk-recallbtn')[2].click()); await sleep(300);
  ok('«Проверь себя»: текст размыт, на кнопке кольцо-таймер', (await blur()) > 0 && await q.evaluate(() => !!document.querySelector('.bk-recallbtn.on .rc-ring svg')));
  await q.evaluate(() => document.querySelectorAll('.bk-foot .bk-recallbtn')[2].click()); await sleep(300);
  ok('повторное нажатие на кнопку сразу показывает текст', (await blur()) === 0);
  await q.evaluate(() => document.querySelectorAll('.bk-foot .bk-recallbtn')[2].click()); await sleep(300);
  await q.evaluate(() => document.querySelector('.bk-recall').click()); await sleep(300);
  ok('нажатие на размытый блок тоже показывает', (await blur()) === 0);
  await q.evaluate(() => document.querySelectorAll('.bk-foot .bk-recallbtn')[2].click()); await sleep(300);
  await q.click('[data-mode=normal]'); await sleep(900); await q.click('[data-mode=blocks]'); await q.waitForSelector('.bk-head'); await sleep(500);
  ok('смена режима снимает размытие', (await blur()) === 0 && await q.evaluate(() => !document.querySelector('.bk-recallbtn.on')));
  await q.evaluate(() => document.querySelectorAll('.bk-foot .bk-recallbtn')[1].click()); await sleep(200);
  await q.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true }); });
  await sleep(200);
  ok('скрытие вкладки снимает размытие', (await blur()) === 0);
  // auto questions
  await q.evaluate(() => document.querySelectorAll('.bk-foot .bk-askbtn')[1].click()); await sleep(400);
  const qs = await q.evaluate(() => [...document.querySelectorAll('.bk-ask:not([hidden]) .bk-q')].map(e => ({ auto: !!e.querySelector('.tag'), text: e.querySelector('input').value })));
  ok('«Спросят»: заготовлены вопросы с пометкой «авто» (до 3)', qs.length >= 1 && qs.length <= 3 && qs.every(x => x.auto) && qs.some(x => /Что известно о/.test(x.text)), qs);
  ok('пустое поле «Спросят» свёрнуто по умолчанию (у других блоков)', await q.evaluate(() => document.querySelectorAll('.bk-ask[hidden]').length >= 5));
  await q.fill('.bk-ask:not([hidden]) .bk-q input >> nth=0', 'Мой вопрос про капилляры'); await q.dispatchEvent('.bk-ask:not([hidden]) .bk-q input >> nth=0', 'change'); await sleep(300);
  await q.evaluate(() => [...document.querySelectorAll('.bk-ask:not([hidden]) button')].find(b => /Обновить/.test(b.textContent)).click()); await sleep(500);
  const qs2 = await q.evaluate(() => [...document.querySelectorAll('.bk-ask:not([hidden]) .bk-q input')].map(e => e.value));
  ok('«Обновить» не трогает вопрос, который вы написали', qs2.includes('Мой вопрос про капилляры'), qs2);
  ok('блок: одна тонкая строка кнопок', await q.evaluate(() => { const r = document.querySelector('.bk-foot-row'); return r.getBoundingClientRect().height < 60; }));
  ok('нет console.error (Блоки)', s2.logs.length === 0, s2.logs);
  await s2.ctx.close();

  // ---------------- portrait 820x1100 ----------------
  const s3 = await L.newSession(browser, { width: 820, height: 1100 });
  const r3 = s3.p;
  await L.openSubject(r3, 'Анатомия'); await L.importFiles(r3, ['sample.pdf', 'sample.html']);
  await L.openDoc(r3, 'sample', 'PDF', 'normal'); await r3.waitForSelector('.pg .textLayer span'); await sleep(600);
  const pl = await r3.evaluate(() => { const t = document.querySelector('.rd-top').getBoundingClientRect(), s = document.querySelector('.rd-scroll'); const first = document.querySelector('.pg').getBoundingClientRect(); return { topH: t.height, firstTop: first.top, topBottom: t.bottom, rails: getComputedStyle(document.querySelector('.rail')).display }; });
  ok('портрет: верхняя панель ≤ 44 px, рейки скрыты', pl.topH <= 44 && pl.rails === 'none', pl);
  ok('портрет: первая строка не прячется под панелью', pl.firstTop >= pl.topBottom - 1, pl);
  await r3.evaluate(() => { document.querySelector('.rd-scroll').scrollTop = 900; }); await sleep(500); await r3.evaluate(() => { document.querySelector('.rd-scroll').scrollTop = 1500; }); await sleep(500);
  ok('портрет: панель прячется при прокрутке вниз', await r3.evaluate(() => document.querySelector('.reader').classList.contains('bar-off') && document.querySelector('.rd-top').getBoundingClientRect().bottom <= 0));
  await r3.evaluate(() => { document.querySelector('.rd-scroll').scrollTop = 600; }); await sleep(500);
  ok('…и возвращается при прокрутке вверх', await r3.evaluate(() => !document.querySelector('.reader').classList.contains('bar-off')));
  ok('портрет: режимы — три иконки примерно 108 px', await r3.evaluate(() => { const w = document.querySelector('.rd-top .rd-modes').getBoundingClientRect().width; return w >= 90 && w <= 124; }));
  await r3.click('[data-mode=blocks]'); await sleep(2000);
  ok('портрет, Блоки: нет залипающей панели, кнопка списка в верхней панели', await r3.evaluate(() => !document.querySelector('.bk-bar') && !!document.querySelector('.rd-top .rd-list') && !document.querySelector('.rd-list').hidden));
  ok('портрет: «Сегодня» — обычная карточка в начале ленты', await r3.evaluate(() => { const c = document.querySelector('.bk-plan'); return getComputedStyle(c).position !== 'sticky' && getComputedStyle(c).position !== 'fixed'; }));
  await r3.click('[data-mode=book]'); await sleep(1800);
  const bs = await r3.evaluate(() => { const b = document.querySelector('.book-sheet').getBoundingClientRect(); return { h: b.height, vh: innerHeight, w: b.width, vw: innerWidth }; });
  ok('портрет, Книга: книга заполняет экран (высота ≥ экран − 80 или ширина ≥ экран − 36)', bs.h >= bs.vh - 80 || bs.w >= bs.vw - 36, bs);
  ok('нет console.error (портрет)', s3.logs.length === 0, s3.logs);
  await s3.ctx.close();

  // ---------------- book cover / centred first page ----------------
  const s4 = await L.newSession(browser, { width: 1180, height: 740 });
  const b4 = s4.p;
  await L.openSubject(b4, 'Анатомия'); await L.importFiles(b4, ['sample.html']);
  await L.openDoc(b4, 'sample', 'HTML', 'book'); await sleep(1500);
  const geo = await b4.evaluate(() => { const s = document.querySelector('.book-sheet').getBoundingClientRect(); return { h: s.height, vh: innerHeight, edges: [...document.querySelectorAll('.book-edge')].map(e => getComputedStyle(e).display), cover: !!document.querySelector('.paper-left .cover-face') }; });
  ok('Книга: страница крупная (в альбомной ориентации по ширине остаётся поле под рейки, ≥ высота − 40)', geo.h >= geo.vh - 40, geo);
  ok('Книга: слева настоящая обложка, не пустая белая страница', geo.cover);
  await b4.click('.rail-r [data-id=more]'); await b4.waitForSelector('.popover .switch-row:has-text("Обложка")'); await b4.click('.popover .switch-row:has-text("Обложка") input'); await sleep(1500);
  ok('без обложки первая страница по центру (левой страницы нет)', await b4.evaluate(() => { const l = document.querySelector('.paper-left'), r = document.querySelector('.paper-right').getBoundingClientRect(); return getComputedStyle(l).display === 'none' && Math.abs((r.left + r.width / 2) - innerWidth / 2) < 40; }));
  ok('нет console.error (книга)', s4.logs.length === 0, s4.logs);
  await s4.ctx.close();

  // ---------------- perf page ----------------
  const s5 = await L.newSession(browser, { width: 1180, height: 740 });
  await s5.p.evaluate(() => { location.hash = '#/perf'; }); await s5.p.waitForSelector('.perf-out'); await sleep(800);
  ok('скрытая страница /#perf показывает FPS и долгие задачи', /FPS/.test(await s5.p.textContent('.perf-out')) && /Долгих задач/.test(await s5.p.textContent('.perf-out')));
  await s5.ctx.close();
}
module.exports = { run };
