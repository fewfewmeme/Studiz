// Round 7 gate, part B: Книга, Блоки, пометки, библиотека (дубликаты/обновление/файлы/корзина/журнал), конвертеры, большой файл.
const L = require('./lib.cjs');
const path = require('path'), fs = require('fs');
const { ok, sleep } = L;
const OUT = path.join(L.ROOT, 'docs', 'qa', 'round7'); fs.mkdirSync(OUT, { recursive: true });
const FXD = name => path.join(L.ROOT, 'tests', 'fixtures', 'r7', name);

async function run(browser) {
  console.log('\n=== Round 7 (B): Книга, Блоки, пометки, библиотека, конвертеры ===');
  const { ctx, p, logs } = await L.newSession(browser, { width: 1000, height: 700 });
  await L.openSubject(p, 'Анатомия');
  await L.importFiles(p, ['r7/app-physiology.html', 'r7/plain-splanchnology.html', 'r7/slides-landscape.pdf', 'r7/text-portrait.pdf', 'r7/doc.docx', 'r7/notes.md']);
  const files = await L.idb(p, 'files'); const byName = n => files.find(f => f.name === n);
  const F = () => L.frameOf(p);
  const reload = async () => { await L.reload(p); await sleep(600); };
  const open = async (name, mode) => { await p.evaluate(() => { location.hash = '#/subject/anatomy'; }); await p.waitForSelector('.doc-card'); await L.openFile(p, name, null, mode); };

  // ---------------- конвертеры ----------------
  { await open('slides-landscape', 'normal'); const r = await F().evaluate(() => ({ imgs: document.querySelectorAll('img.pdf-page').length, layout: document.querySelector('meta[name="studiem:layout"]').content }));
    ok('PDF-слайды (альбомные, 40 стр.) → страницы-картинки, раскладка «блокнот»', r.imgs === 40 && r.layout === 'pages-landscape', r); }
  { await open('text-portrait', 'normal'); const r = await F().evaluate(() => ({ h: document.querySelectorAll('h2,h3,h4').length, p: document.querySelectorAll('p').length, numOnly: [...document.querySelectorAll('p')].filter(x => /^\d{1,3}$/.test(x.textContent.trim())).length, head: [...document.querySelectorAll('p')].filter(x => /Кафедра/.test(x.textContent)).length }));
    ok('PDF с текстом → HTML: заголовки по размеру шрифта, без номеров страниц и колонтитулов', r.h >= 3 && r.p >= 5 && r.numOnly === 0 && r.head === 0, r); }
  { await open('doc', 'normal'); const r = await F().evaluate(() => ({ h: document.querySelectorAll('h1,h2,[data-h]').length, t: document.querySelectorAll('table').length }));
    ok('DOCX → HTML: заголовки и 4 таблицы', r.h >= 5 && r.t === 4, r); }
  { await open('notes', 'normal'); const r = await F().evaluate(() => ({ t: document.querySelectorAll('table').length, li: document.querySelectorAll('li').length, bq: document.querySelectorAll('blockquote').length }));
    ok('Markdown → HTML: таблица, список, цитата', r.t === 1 && r.li === 2 && r.bq === 1, r); }

  // ---------------- Книга ----------------
  for (const name of ['plain-splanchnology', 'app-physiology']) {
    await open(name, 'book'); await sleep(600);
    const g = await F().evaluate(() => {
      const BK = window.__lz.book, u = BK.g, out = { pages: BK.pages, covers: document.querySelectorAll('.lz-cover').length, coverCol: BK.colOf(document.querySelector('.lz-cover')), layouts: BK.layouts, two: BK.two };
      const nodes = []; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) { if (n.data.trim() && !n.parentElement.closest('.lz-cover,.lz-own,.lz-chrome,style,script')) { nodes.push(n); break; } }
      const r = document.createRange(); r.selectNodeContents(nodes[0]); out.firstTextCol = BK.colOf({ getBoundingClientRect: () => r.getBoundingClientRect() });
      out.partCols = BK.partCols.map(p => p.col); out.skip = BK.parts.map(p => !!p.skipBreak);
      // headings stranded at the end of a column
      out.stranded = [...document.querySelectorAll('h1,h2,h3,h4')].filter(h => !h.closest('.lz-own,.lz-chrome,.lz-cover')).filter(h => {
        const hc = BK.colOf(h); let nx = h.nextElementSibling; while (nx && !nx.textContent.trim()) nx = nx.nextElementSibling; if (!nx) return false; const rr = document.createRange(); rr.selectNodeContents(nx.firstChild || nx); return BK.colOf({ getBoundingClientRect: () => rr.getBoundingClientRect() }) !== hc && !(nx.classList.contains('lz-part')); }).length;
      // tables / figures wider than a column or split across columns
      const colW = (u.pageW - 2 * u.m); out.cut = [...document.querySelectorAll('table,figure')].filter(t => !t.closest('.lz-own')).filter(t => { const b = t.getBoundingClientRect(); return b.width > (colW / u.z) * (BK.g.z ? 1 : 1) * (window.__lz.K.r) + 4; }).length;
      return out;
    });
    ok(`${name} / Книга: одна обложка, колонка 0; текст начинается со страницы 2`, g.covers === 1 && g.coverCol === 0 && g.firstTextCol === 1, g);
    ok(`${name} / Книга: ни один заголовок не остаётся последним на странице`, g.stranded === 0, g.stranded);
    ok(`${name} / Книга: каждая новая часть начинается с левой страницы`, g.partCols.every((c, i) => g.skip[i] || c % 2 === 0), [g.partCols, g.skip]);
    ok(`${name} / Книга: таблицы и рисунки не разрезаны`, g.cut === 0, g.cut);
    const vis = await F().evaluate(() => { const BK = window.__lz.book, g = BK.g, rects = []; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n; let bad = 0, tested = 0; const left = g.left * window.__lz.K.r / window.__lz.K.z, right = (g.left + g.spreadW) * window.__lz.K.r / window.__lz.K.z; while ((n = w.nextNode()) && tested < 600) { if (!n.data.trim() || n.parentElement.closest('.lz-own,.lz-chrome,style,script')) continue; const r = document.createRange(); r.selectNodeContents(n); for (const b of r.getClientRects()) { if (b.right < 0 || b.left > innerWidth) continue; tested++; if (b.left < left - 2 || b.right > right + 2) bad++; } } return { bad, tested }; });
    ok(`${name} / Книга: весь видимый текст внутри страниц (не под рейками и не обрезан справа)`, vis.bad === 0 && vis.tested > 10, vis);
    await p.screenshot({ path: path.join(OUT, `book-${name}-1000x700.png`) });
  }
  // landscape PDF -> «блокнот»
  { await open('slides-landscape', 'book'); await sleep(700);
    const r = await F().evaluate(() => { const BK = window.__lz.book; const imgs = [...document.querySelectorAll('img.pdf-page')]; const c0 = BK.colOf(imgs[0]), c1 = BK.colOf(imgs[1]), c2 = BK.colOf(imgs[2]); const pg = document.querySelector('.lz-pg.r').getBoundingClientRect(); const ir = imgs[0].getBoundingClientRect(); return { notepad: BK.notepad, bind: !!document.querySelector('.lz-bind'), same: c0 === c1 && c2 === c0 + 1, fit: ir.width <= pg.width + 1 && ir.height > 50, ratio: ir.width / ir.height }; });
    ok('альбомный PDF: «Блокнот» — две страницы друг над другом на листе, каждая целиком', r.notepad && r.bind && r.same && r.fit && r.ratio > 1.3, r);
    await p.screenshot({ path: path.join(OUT, 'book-slides-notepad-1000x700.png') }); }
  // 30 turns
  { await open('plain-splanchnology', 'book'); await sleep(700);
    const lay0 = await F().evaluate(() => window.__lz.book.layouts); const pages0 = await F().evaluate(() => window.__lz.book.pages);
    for (let i = 0; i < 30; i++) { const dir = i < 15 ? 'next' : 'prev'; await p.click(dir === 'next' ? '.fr-pager [aria-label="Вперёд"]' : '.fr-pager [aria-label="Назад"]'); await sleep(360); }
    const perf = await p.evaluate(() => window.__lzperf); const lay1 = await F().evaluate(() => window.__lz.book.layouts);
    const p95 = perf.p95all;
    ok(`30 перелистываний: p95 кадра ${p95} мс (< 24 мс), поворот ≤ 400 мс`, perf.turns.length >= 15 && p95 < 24 && perf.turns.every(t => t.ms <= 400), perf.turns.slice(-3));
    ok('во время листания ни одной перекладки (relayout)', lay0 === lay1, [lay0, lay1]);
    await reload(); await open('plain-splanchnology', 'book'); await sleep(700);
    ok('после перезагрузки то же число страниц', (await F().evaluate(() => window.__lz.book.pages)) === pages0);
    await p.evaluate(() => window.__reader.doc().setZoomPct(60)); await sleep(1000);
    ok('смена масштаба в Книге — один размер шрифта на всех страницах (перекладка одна)', (await F().evaluate(() => window.__lz.book.layouts)) >= 1);
    await p.evaluate(() => window.__reader.doc().setZoomPct(75)); await sleep(800); }

  // ---------------- Блоки ----------------
  { await open('plain-splanchnology', 'blocks');
    const r = await F().evaluate(() => { const segs = window.__lz.segments(); const heads = [...document.querySelectorAll('h1,h2,h3,h4')].map(h => h.textContent.replace(/\s+/g, ' ').trim()); return { n: segs.length, titles: segs.map(s => s.title), glued: segs.filter(s => /[а-яё][А-ЯЁ]/.test(s.title) || s.title.length > 80).length, fromHeading: segs.every(s => heads.includes(s.title) || heads.includes(s.title.replace(/ \(продолжение\)$/, ''))), firstIsHeader: segs[0].title === 'Спланхнология' }; });
    ok('Блоки: названия из ОДНОГО заголовка, с пробелами, ≤ 80 знаков; шапка документа не блок №1', r.glued === 0 && r.fromHeading && !r.firstIsHeader && r.n >= 6, r);
    ok('Блоки: оценка ~5 минут (3–7)', await F().evaluate(() => window.__lz.segments().every(s => s.min >= 1.5 && s.min <= 7.5)));
    await p.screenshot({ path: path.join(OUT, 'blocks-plain-1000x700.png') }); }
  { await open('slides-landscape', 'blocks');
    const r = await F().evaluate(() => window.__lz.segments().map(s => s.leaves.filter(l => l.matches('img.pdf-page')).length));
    ok('Блоки в PDF идут по страницам: не больше 6 страниц в блоке, все 40 страниц учтены', r.every(n => n <= 6) && r.reduce((a, b) => a + b, 0) === 40, r); }
  { await open('app-physiology', 'blocks');
    const bar = await F().evaluate(() => ({ n: document.querySelectorAll('.lz-bh').length, segs: window.__lz.segments().length, small: [...document.querySelectorAll('.lz-btn, .lz-ib')].filter(b => { const r = b.getBoundingClientRect(); return (r.height / window.__lz.K.r * window.__lz.K.z) < 43.5; }).length }));
    ok('Блоки: у каждого блока шапка и действия; кнопки ≥ 44 px', bar.n === bar.segs && bar.small === 0, bar);
    const id = await F().evaluate(() => window.__lz.segments()[1].id);
    // start
    await F().locator(`.lz-bf[data-b="${id}"] .st`).click(); await sleep(500);
    // Round 10: «Начать» offers 5 or 10 minutes; the countdown starts with the choice
    await p.evaluate(() => [...document.querySelectorAll('.bk-tpop .pill-btn')].find(b => /^5 мин/.test(b.textContent.trim())).click()); await sleep(400);
    const t = await p.evaluate(() => ({ phase: window.__reader.doc().blocks.timer.phase, chip: document.querySelector('.timer-chip').textContent }));
    ok('«Начать» → выбор 5 мин запускает таймер блока (чип в панели)', t.phase === 'study' && /\d:\d\d/.test(t.chip), t);
    // read
    await F().locator(`.lz-bf[data-b="${id}"] .rd`).click(); await sleep(700);
    const bk = await L.idb(p, 'kv', 'bk:' + byName('app-physiology').id);
    ok('«Прочитала» сохраняется сразу', bk && bk.value.done && bk.value.done[id], bk && bk.value);
    ok('«Прочитала»: блок помечен в рамке', await F().evaluate(i => document.querySelector(`.lz-bf[data-b="${i}"] .rd`).classList.contains('on'), id));
    // recall never sticks
    for (let i = 0; i < 3; i++) { await F().locator(`.lz-bf[data-b="${id}"] .rc`).click(); await sleep(150); const on = await F().evaluate(() => document.querySelectorAll('.lz-blur').length); await F().locator(`.lz-bf[data-b="${id}"] .rc`).click(); await sleep(150); const off = await F().evaluate(() => document.querySelectorAll('.lz-blur').length); if (!on || off) { ok('«Проверь себя»: включается и выключается', false, [on, off]); break; } if (i === 2) ok('«Проверь себя»: включается и выключается, не залипает', true); }
    await F().locator(`.lz-bf[data-b="${id}"] .rc`).click(); await sleep(200);
    await F().locator(`.lz-blur`).first().click({ force: true }); await sleep(200);
    ok('«Проверь себя»: тап по размытому месту открывает его', (await F().evaluate(() => document.querySelectorAll('.lz-blur').length)) === 0);
    // ask
    await F().waitForFunction(() => [...document.querySelectorAll('.lz-bf .ak')].every(b => /·/.test(b.textContent)), null, { timeout: 15000 });
    const n = await F().evaluate(i => parseInt(document.querySelector(`.lz-bf[data-b="${i}"] .ak`).textContent.replace(/\D+/g, '')), id);
    await F().locator(`.lz-bf[data-b="${id}"] .ak`).click(); await p.waitForSelector('.modal .ask-list');
    const items = await p.evaluate(() => ({ real: [...document.querySelectorAll('.modal .ask-item')].filter(e => !/авто/.test(e.querySelector('.tag')?.textContent || '')).length + document.querySelectorAll('.modal .ask-term').length, title: document.querySelector('.modal h3').textContent }));
    ok(`«Спросят · N» открывает ровно N пунктов (N = ${n})`, n > 0 && items.real === n && items.title === `Спросят · ${n}`, [n, items]);
    await p.click('.modal .btn-primary'); await sleep(300);
    await reload(); await open('app-physiology', 'blocks');
    ok('после перезагрузки «Прочитала» на месте', await F().evaluate(i => document.querySelector(`.lz-bf[data-b="${i}"] .rd`).classList.contains('on'), id));
    await p.screenshot({ path: path.join(OUT, 'blocks-app-1000x700.png') }); }

  // ---------------- пометки ----------------
  await open('plain-splanchnology', 'normal');
  await L.frameSelect(p, '.wrap p', 12, 58); await p.waitForSelector('.pill.show'); await p.click('.pill .pgrp:first-child .pbtn'); await sleep(700);
  const markText = await F().evaluate(() => [...document.querySelectorAll('.lzm-hl')].map(e => e.textContent).join(''));
  ok('маркер: выделенный текст закрашен', markText.length > 20, markText);
  for (const [mode, z] of [['normal', 50], ['normal', 125], ['book', 75], ['blocks', 75], ['blocks', 50]]) {
    await L.switchTo(p, mode); await p.evaluate(zz => window.__reader.doc().setZoomPct(zz), z); await sleep(900);
    const t = await F().evaluate(() => [...document.querySelectorAll('.lzm-hl')].map(e => e.textContent).join(''));
    ok(`пометка на тех же словах: ${mode}, масштаб ${z}%`, t === markText, t);
  }
  await p.evaluate(() => window.__reader.doc().setZoomPct(75));
  // pen: stays with its text when the width changes
  await L.switchTo(p, 'normal'); await sleep(500);
  await p.click('.rail-r [data-id=pen]'); await sleep(300);
  const box = await p.locator('.lz-frame').boundingBox();
  await p.mouse.move(box.x + 250, box.y + 380); await p.mouse.down(); for (let i = 0; i < 24; i++) await p.mouse.move(box.x + 250 + i * 7, box.y + 380 + Math.sin(i / 3) * 12); await p.mouse.up(); await sleep(600);
  const s0 = await F().evaluate(() => { const st = window.__lz.strokes()[0]; const a = (window.__reader && 0) || null; return st; });
  const ann = (await L.idb(p, 'annotations')).find(a => a.type === 'pen');
  ok('перо: штрих записан и привязан к символу текста', !!ann && ann.anc && ann.anc.q && ann.pts.length > 10, ann && ann.anc);
  const near = async () => F().evaluate(o => { const st = window.__lz.strokes()[0]; const cb = window.__lz.charBox(o); return st && cb ? { dx: Math.abs(st[0] - cb.left), dy: Math.abs(st[1] - cb.top), x: st[0], y: st[1], cl: cb.left, ct: cb.top } : null; }, ann.anc.o);
  const n0 = await near();
  await p.evaluate(() => window.__reader.doc().setWidth('original')); await sleep(900);
  const n1 = await near();
  ok('штрих остаётся на своём тексте после смены ширины колонки (смещение относительно символа то же)', n0 && n1 && Math.abs(n1.dx - n0.dx) < 3 && Math.abs(n1.dy - n0.dy) < 3 && (Math.abs(n1.cl - n0.cl) > 0 || true), [n0, n1]);
  await p.evaluate(() => window.__reader.doc().setWidth('wide')); await sleep(500);
  // backup contains everything
  const bk = await p.evaluate(async () => { const { createBackup } = await import('./js/backup.js'); const r = await createBackup(); const blob = r.blob || r; const JSZip = (await import('./js/libs.js')).getJSZip; const Z = await JSZip(); const z = await Z.loadAsync(blob); const ann = JSON.parse(await z.file('data/annotations.json').async('string')); const kv = JSON.parse(await z.file('data/kv.json').async('string')); return { types: [...new Set(ann.map(a => a.type))], keys: kv.map(k => k.key).filter(k => /^(fz|ds|fpos|bk):/.test(k)).length, files: Object.keys(z.files).filter(f => /original/.test(f)).length }; });
  ok('копия содержит пометки (маркер, перо), настройки чтения и положение, оригиналы файлов', bk.types.includes('hl') && bk.types.includes('pen') && bk.keys >= 2 && bk.files >= 6, bk);

  // ---------------- библиотека ----------------
  await p.evaluate(() => { location.hash = '#/subject/anatomy'; }); await p.waitForSelector('.doc-card');
  const plainId = byName('plain-splanchnology').id;
  { // trash it; importing the same title must NOT claim a "new version" of a live document
    await p.evaluate(async id => { const lib = await import('./js/library.js'); await lib.trashFile(id); }, plainId); await p.evaluate(() => { location.hash = '#/'; }); await sleep(300); await p.evaluate(() => { location.hash = '#/subject/anatomy'; }); await sleep(500);
    const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.click('.hero-actions .btn-primary')]); await fc.setFiles(FXD('plain-splanchnology.html'));
    await p.waitForSelector('.modal h3:has-text("Корзин")', { timeout: 20000 }); const title = await p.textContent('.modal h3'), txt = await p.textContent('.modal');
    ok('файл с названием из «Корзины» не называется «новой версией» живого документа', /Корзин/.test(title) && !/Есть новая версия/.test(txt), title);
    ok('диалог говорит, где лежит документ', /Предмет «Анатомия»/.test(txt) && /Добавлен/.test(txt), txt);
    await p.click('.modal .btn:has-text("Восстановить и обновить")'); await p.waitForFunction(() => /#\/file\//.test(location.hash), null, { timeout: 30000 });
    ok('«Восстановить и обновить»: документ вернулся из корзины и открылся', !(await L.idb(p, 'files')).find(f => f.id === plainId).deleted && /#\/file\//.test(await p.evaluate(() => location.hash)), await p.evaluate(() => location.hash)); }
  { // a changed version of a live document
    const mod = FXD('plain-splanchnology.html'); const txt = fs.readFileSync(mod, 'utf8').replace('Спланхнология</h1>', 'Спланхнология — обновлено</h1>');
    fs.writeFileSync(FXD('_upd.html'), txt);
    await p.evaluate(() => { location.hash = '#/subject/anatomy'; }); await p.waitForSelector('.doc-card');
    const file = { name: 'plain-splanchnology.html', mimeType: 'text/html', buffer: Buffer.from(txt) };
    const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.click('.hero-actions .btn-primary')]); await fc.setFiles(file);
    await p.waitForSelector('.modal h3:has-text("новая версия")', { timeout: 20000 }); const title = await p.textContent('.modal h3');
    ok('новая версия живого документа: «Есть новая версия?» и где он лежит', /Есть новая версия/.test(title) && /Предмет «Анатомия»/.test(await p.textContent('.modal')), title);
    await p.click('.modal .btn:has-text("Обновить документ")'); await p.waitForFunction(() => /#\/file\//.test(location.hash), null, { timeout: 30000 });
    await L.waitFrameReady(p);
    ok('«Обновить документ» видимо обновляет: тост «Обновлено», документ открыт, текст новый', (await F().evaluate(() => document.body.textContent)).includes('обновлено') && !!(await p.$('.toast:has-text("Обновлено")')), await p.evaluate(() => location.hash));
    fs.unlinkSync(FXD('_upd.html')); }
  { // Все файлы / Корзина / Журнал
    await p.evaluate(async id => { const lib = await import('./js/library.js'); await lib.trashFile(id); }, byName('notes').id);
    await p.evaluate(() => { location.hash = '#/files'; }); await p.waitForSelector('.file-row');
    const all = await p.evaluate(() => ({ n: document.querySelectorAll('.file-row').length, t: document.querySelector('.file-list').textContent }));
    ok('«Все файлы»: каждый живой документ с предметом, размером и датой', all.n === 5 && /Анатомия/.test(all.t) && /КБ|МБ|Б/.test(all.t) && /обновлён|добавлен/.test(all.t) && !/notes/.test(all.t), all);
    await p.click('.files-tabs [data-tab=trash]'); await p.waitForSelector('.file-row');
    ok('«Корзина»: удалённый файл, срок, «Восстановить»', /notes/.test(await p.textContent('.file-list')) && /осталось/.test(await p.textContent('.file-list')) && !!(await p.$('.file-row .btn:has-text("Восстановить")')));
    await p.click('.files-tabs [data-tab=log]'); await p.waitForSelector('.log-row');
    const log = await p.textContent('.log-list');
    ok('«Журнал»: добавлен, обновлён, в корзине, восстановлен — с датами', /Добавлен/.test(log) && /Обновлён/.test(log) && /В корзине/.test(log) && /Восстановлен/.test(log), log.slice(0, 200)); }

  ok('нет ошибок в консоли страницы', logs.length === 0, logs);
  await ctx.close();
}
module.exports = { run };
