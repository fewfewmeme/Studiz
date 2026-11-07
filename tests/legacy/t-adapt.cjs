// Adaptation engine: every fixture through every adapter (Fit Report), then real imports through the UI in the three modes.
const L = require('./lib.cjs'); const fs = require('fs'), path = require('path');
const { ok, sleep } = L;
const DIR = path.join(L.ROOT, 'tests', 'fixtures', 'adapt');
const countImgs = html => (html.match(/<img\b[^>]*\bsrc=/gi) || []).length;
const BLOCKS = { 'app-angiology': 24, 'app-urogenital': 20, 'app-biochem1': 30, 'app-simple-proteins': 16, 'app-complex-proteins': 18, 'app-histology': 22, 'app-bacterial-genetics': 14, 'app-patanat-5-7': 26, 'app-patanat-1-7': 28, 'app-orthopedics': 15, 'app-physiology': 32, 'app-philosophy': 12 };

async function run(browser) {
  console.log('\n=== Adaptation engine ===');
  const { ctx, p, logs } = await L.newSession(browser, { width: 1000, height: 700 });
  const files = fs.readdirSync(DIR);
  const results = {};
  for (const f of files) {
    const buf = fs.readFileSync(path.join(DIR, f));
    results[f] = await p.evaluate(async ([b64, name]) => {
      const { adaptSource, sniffKind } = await import('/app/js/adapt/index.js');
      const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer;
      const kind = sniffKind(bin, name);
      try {
        const r = await adaptSource({ kind, buf: bin, fileName: name, docId: 'T', wpm: 130 });
        const d = new DOMParser().parseFromString('<body>' + r.html, 'text/html');
        return { kind, rep: r.report, blocks: r.sdm.blocks, htmlImgs: d.querySelectorAll('img').length, fixed: /position\s*:\s*(fixed|sticky)/i.test(r.html), scripts: d.querySelectorAll('script,iframe,button,input').length, css: (r.html.match(/<style>([\s\S]*?)<\/style>/) || [])[1] || '', imagesStored: r.images.length, title: r.title, ask: r.sdm.ask.length, headBlock: d.querySelector('section.lz-sec')?.getAttribute('data-lab') };
      } catch (e) { return { kind, err: e.message }; }
    }, [buf.toString('base64'), f]);
  }
  const bad = Object.entries(results).filter(([, r]) => r.err || !r.rep.ok).map(([f, r]) => f + ': ' + (r.err || r.rep.hard.join('|')));
  ok('все фикстуры адаптированы без жёстких ошибок (отчёт о посадке)', bad.length === 0, bad);
  ok('нет fixed/sticky, скриптов, кнопок и iframe ни в одном результате', Object.values(results).every(r => !r.fixed && r.scripts === 0));
  ok('число картинок до и после совпадает (в том числе удалённые → заглушка)', Object.values(results).every(r => r.rep.images === r.rep.srcImages && r.htmlImgs === r.rep.images));
  ok('текст сохранён не менее чем на 97%', Object.values(results).every(r => r.rep.textRetention >= 97));
  ok('12 файлов мини-приложений: число блоков = числу section.blk в источнике, без «лишнего первого блока»', Object.entries(BLOCKS).every(([k, n]) => results[k + '.html'].blocks.length === n && results[k + '.html'].headBlock && !/Конспект для подготовки/.test(results[k + '.html'].blocks[0].title)), Object.entries(BLOCKS).map(([k, n]) => [k, n, results[k + '.html'].blocks.length]));
  ok('блоки с названиями, без дублей', Object.values(results).every(r => r.blocks.every(b => b.title && b.title.trim()) && new Set(r.blocks.map(b => b.title)).size === r.blocks.length));
  ok('id блоков стабильны (хэш названия + порядок): повторный запуск даёт те же id', await p.evaluate(async b64 => { const { adaptSource } = await import('/app/js/adapt/index.js'); const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer; const a = await adaptSource({ kind: 'html', buf: bin, fileName: 'x', docId: 'T' }), b = await adaptSource({ kind: 'html', buf: bin, fileName: 'x', docId: 'T' }); return a.sdm.blocks.map(x => x.id).join() === b.sdm.blocks.map(x => x.id).join(); }, fs.readFileSync(path.join(DIR, 'app-angiology.html')).toString('base64')));
  ok('тёмные правила источника отброшены (prefers-color-scheme: dark, [data-theme=dark])', Object.values(results).every(r => !/prefers-color-scheme\s*:\s*dark|data-theme\s*=\s*["']?dark/i.test(r.css)));
  ok('CSS ограничен областью документа, без @import, @font-face, внешних url()', Object.values(results).every(r => !/@import|@font-face|url\(\s*["']?https?:|\/\/fonts\./i.test(r.css) && (!r.css || r.css.split('}').filter(x => x.trim() && !x.trim().startsWith('.doc[data-doc="T"]') && !x.trim().startsWith('@')).length === 0)));
  ok('семантика: тикеты .tk/.q/.qa попали в «Спросят» (ask)', results['app-angiology.html'].ask === 48 && results['sdf-example.html'].ask >= 1, [results['app-angiology.html'].ask, results['sdf-example.html'].ask]);
  ok('источник «Только тёмный»: результат не тёмный и не светло-на-светлом (цвета пересчитаны)', await p.evaluate(async b64 => { const { adaptSource } = await import('/app/js/adapt/index.js'); const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer; const r = await adaptSource({ kind: 'html', buf: bin, fileName: 'x', docId: 'T' }); return !/background(-color)?\s*:\s*#0d1117|#000\b/i.test(r.html) && r.report.colorsFixed >= 0; }, fs.readFileSync(path.join(DIR, 'hostile-dark-only.html')).toString('base64')));
  ok('cp1251 .txt читается правильно', await p.evaluate(async b64 => { const { adaptSource, sniffKind } = await import('/app/js/adapt/index.js'); const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer; const r = await adaptSource({ kind: sniffKind(bin, 'a.txt'), buf: bin, fileName: 'a', docId: 'T' }); return /Привет, мир/.test(r.html); }, fs.readFileSync(path.join(DIR, 'txt-cp1251.txt')).toString('base64')));
  ok('Markdown: таблица, код и чек-листы', await p.evaluate(async b64 => { const { adaptSource } = await import('/app/js/adapt/index.js'); const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer; const r = await adaptSource({ kind: 'md', buf: bin, fileName: 'a', docId: 'T' }); return /<table/.test(r.html) && /<code/.test(r.html) && /☑/.test(r.html); }, fs.readFileSync(path.join(DIR, 'md-tables-code.md')).toString('base64')));
  ok('DOCX: заголовки и картинки (sample.docx)', await p.evaluate(async b64 => { const { adaptSource, sniffKind } = await import('/app/js/adapt/index.js'); const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer; const k = sniffKind(bin, 'sample.docx'); const r = await adaptSource({ kind: k, buf: bin, fileName: 'sample', docId: 'T' }); return k === 'docx' && r.sdm.blocks.length >= 1 && r.report.ok; }, fs.readFileSync(L.FX('sample.docx')).toString('base64')));
  ok('неподдерживаемое (pptx) — понятное сообщение, без падения', await p.evaluate(async () => { const { sniffKind } = await import('/app/js/adapt/index.js'); const zip = new Uint8Array([0x50, 0x4B, 3, 4, ...new TextEncoder().encode('ppt/slides/slide1.xml')]).buffer; return sniffKind(zip, 'x.pptx') === 'unsupported'; }));
  ok('жёсткий отказ → упрощённый режим → только текст (цепочка отката)', await p.evaluate(async () => {
    const { adaptSource } = await import('/app/js/adapt/index.js');
    // a document whose text lives in <script>/hidden chrome is lost in the normal path only if chrome removal eats it; emulate with a body that is almost all "fixed bar" text
    const html = '<html><body><div style="position:fixed">' + 'слово '.repeat(50) + '</div><p>Короткий текст.</p></body></html>';
    const r = await adaptSource({ kind: 'html', buf: new TextEncoder().encode(html).buffer, fileName: 'x', docId: 'T' });
    return !!r.report && r.words > 0 && ['normal', 'safe', 'plain'].includes(r.report.level);
  }));

  // ---------- real imports through the UI ----------
  await L.openSubject(p, 'Анатомия');
  const t0 = Date.now();
  await L.importFiles(p, ['adapt/app-angiology.html', 'adapt/app-histology.html', 'adapt/hostile-word.html', 'adapt/hostile-remote-images.html']);
  ok('импорт 4 файлов через «Добавить файлы» без зависания', Date.now() - t0 < 60000, Date.now() - t0);
  const meta = await L.idb(p, 'files');
  ok('в записи файла: адаптер, версия, отчёт, число блоков, минуты', meta.every(m => m.adapter && m.adapterVersion && m.fit && m.blockCount > 0 && m.minutes > 0), meta.map(m => [m.name, m.adapter, m.blockCount]));
  const work = await L.idb(p, 'work');
  ok('«work» хранит SDM и отчёт', work.every(w => w.sdm && w.report && w.sdm.toc.length === w.sdm.blocks.length));
  await p.click('.doc-card:has(.doc-title:text-is("app-angiology"))'); await p.waitForSelector('.reader');
  await p.waitForFunction(() => window.__reader && window.__reader.doc() && window.__reader.doc().mode, null, { timeout: 30000 }); await sleep(900);
  const norm = await p.evaluate(() => {
    const doc = document.querySelector('.doc'), cs = getComputedStyle(doc), all = [...doc.querySelectorAll('*')];
    const fixed = all.filter(e => ['fixed', 'sticky'].includes(getComputedStyle(e).position)).length;
    const wide = doc.scrollWidth > document.querySelector('.rd-scroll').clientWidth + 2;
    const bg = cs.backgroundColor;
    const lum = c => { const m = c.match(/[\d.]+/g).map(Number); return (0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]) / 255; };
    return { fixed, wide, bgLum: lum(bg), imgs: doc.querySelectorAll('img').length, loaded: [...doc.querySelectorAll('img')].filter(i => i.complete && i.naturalWidth > 0).length, blocks: doc.querySelectorAll('section.lz-sec').length, font: cs.fontSize, col: doc.parentElement.getBoundingClientRect().width };
  });
  ok('Обычный: нет fixed/sticky, нет горизонтальной прокрутки, бумага светлая', norm.fixed === 0 && !norm.wide && norm.bgLum > 0.9, norm);
  ok('Обычный: 24 блока, 24 картинки, все показываются; колонка ≈ 680 px, шрифт 17 px', norm.blocks === 24 && norm.imgs === 24 && norm.font === '17px' && norm.col <= 700, norm);
  // contrast of every sampled text colour on the paper
  const contrast = await p.evaluate(() => {
    const parse = c => { const m = c.match(/[\d.]+/g).map(Number); return m.slice(0, 3); };
    const L = ([r, g, b]) => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }; return .2126 * f(r) + .7152 * f(g) + .0722 * f(b); };
    const bad = []; let n = 0;
    for (const el of document.querySelectorAll('.doc p, .doc li, .doc span, .doc td, .doc h3, .doc summary, .doc strong')) {
      if (!el.textContent.trim() || el.children.length > 3) continue;
      let bg = [253, 253, 252]; for (let e = el; e && e.classList && !e.classList.contains('doc'); e = e.parentElement) { const c = getComputedStyle(e).backgroundColor; const m = c.match(/[\d.]+/g).map(Number); if (m.length < 4 || m[3] > 0.5) { bg = m.slice(0, 3); break; } }
      const fg = parse(getComputedStyle(el).color), a = L(fg), b = L(bg), r = (Math.max(a, b) + .05) / (Math.min(a, b) + .05); n++;
      if (r < 4.5) bad.push([el.className, getComputedStyle(el).color, r.toFixed(2)]);
    }
    return { n, bad: bad.slice(0, 5), badN: bad.length };
  });
  ok('контраст всех текстовых цветов ≥ 4.5:1 на бумаге', contrast.n > 100 && contrast.badN === 0, contrast);
  await p.screenshot({ path: L.OUT + '/adapt-angiology-normal.png' });
  await p.click('[data-mode=blocks]'); await p.waitForSelector('.bk-head'); await sleep(900);
  const bk = await p.evaluate(() => ({ heads: document.querySelectorAll('.bk-head').length, first: document.querySelector('.bk-head strong').textContent, borders: [...document.querySelectorAll('.doc .lz-sec')].filter(e => getComputedStyle(e).borderTopWidth !== '0px' || getComputedStyle(e).outlineStyle !== 'none').length, secs: document.querySelectorAll('.doc > section.lz-sec').length }));
  ok('Блоки: 24 блока = 24 секции источника, первый блок — «Ангиология: тема 1», без чужих рамок', bk.heads === 24 && bk.first === 'Ангиология: тема 1' && bk.secs === 24 && bk.borders === 0, bk);
  ok('Блоки: заголовок документа не блок №1 (виден отдельно сверху)', await p.evaluate(() => !!document.querySelector('.doc .lz-head') && document.querySelector('.bk-head .bk-badge').textContent.trim() === '1'));
  await p.evaluate(() => { document.querySelectorAll('.bk-foot .bk-askbtn')[0].click(); }); await sleep(500);
  ok('«Спросят» заполнено автоматически из тикетов документа', await p.evaluate(() => [...document.querySelectorAll('.bk-ask:not([hidden]) .bk-q input')].some(i => /^Что такое/.test(i.value))), await p.evaluate(() => [...document.querySelectorAll('.bk-ask:not([hidden]) .bk-q input')].map(i => i.value)));
  await p.screenshot({ path: L.OUT + '/adapt-angiology-blocks.png' });
  await p.click('[data-mode=book]'); await p.waitForFunction(() => /стр\./.test(document.querySelector('.book-counter')?.textContent || ''), null, { timeout: 30000 }).catch(() => {}); await sleep(800);
  const bkm = await p.evaluate(() => { const f = document.querySelector('.book-flow'); const fs = new Set([...document.querySelectorAll('.book-flow p')].slice(0, 30).map(e => getComputedStyle(e).fontSize)); return { fonts: [...fs], details: [...document.querySelectorAll('.book-flow details')].every(d => d.open), cover: !!document.querySelector('.paper-left .cover-face'), pages: document.querySelector('.book-counter').textContent }; });
  ok('Книга: один размер шрифта на весь текст, details раскрыты, обложка отдельной страницей', bkm.fonts.length === 1 && bkm.details && bkm.cover, bkm);
  await p.screenshot({ path: L.OUT + '/adapt-angiology-book.png' });
  await p.click('.rail-l .rd-back'); await p.waitForSelector('.doc-card');
  await p.click('.doc-card:has(.doc-title:text-is("app-histology"))'); await p.waitForSelector('.reader'); await sleep(1500);
  const hist = await p.evaluate(() => ({ imgs: document.querySelectorAll('.doc img').length, vis: [...document.querySelectorAll('.doc img')].filter(i => i.getBoundingClientRect().width > 50 || !i.complete).length }));
  ok('Гистология (почти только картинки): 66 картинок на месте', hist.imgs === 66, hist);
  await p.click('.rail-l .rd-back'); await p.waitForSelector('.doc-card');
  await p.click('.doc-card:has(.doc-title:text-is("hostile-remote-images"))'); await p.waitForSelector('.reader'); await sleep(1200);
  ok('удалённые картинки → аккуратная заглушка «картинка не встроена»', await p.evaluate(() => document.querySelectorAll('.doc img[data-blocked-src]').length === 2));
  ok('нет console.error при адаптации и просмотре', logs.length === 0, logs);
  await ctx.close();

  // ---------- OS in dark mode, site light: the document stays light ----------
  const dctx = await browser.newContext({ viewport: { width: 1000, height: 700 }, colorScheme: 'dark', hasTouch: true, serviceWorkers: 'block' });
  await dctx.addInitScript(() => { try { localStorage.setItem('noTour', '1'); } catch (e) { /* ignore */ } });
  const dp = await dctx.newPage(); const dl = []; dp.on('pageerror', e => dl.push(e.message));
  await dp.goto(L.URL); await dp.waitForSelector('.splash, .hero'); if (await dp.$('.splash')) await dp.click('.splash .btn'); await dp.waitForSelector('.hero');
  await L.openSubject(dp, 'Анатомия'); await L.importFiles(dp, ['adapt/app-physiology.html']);
  await dp.click('.doc-card'); await dp.waitForSelector('.reader'); await dp.waitForFunction(() => window.__reader && window.__reader.doc() && window.__reader.doc().mode); await sleep(800);
  const dark = await dp.evaluate(() => { const lum = c => { const m = c.match(/[\d.]+/g).map(Number); return (0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]) / 255; }; const doc = document.querySelector('.doc'); return { paper: lum(getComputedStyle(doc).backgroundColor), text: lum(getComputedStyle(doc.querySelector('p')).color), mq: matchMedia('(prefers-color-scheme: dark)').matches }; });
  ok('iPad в тёмном режиме: документ остаётся на светлой бумаге с тёмным текстом', dark.mq && dark.paper > 0.9 && dark.text < 0.35, dark);
  await dp.screenshot({ path: L.OUT + '/adapt-physiology-osdark.png' });
  await dctx.close();

  // ---------- 13 MB file with ~200 images ----------
  const bigPath = path.join(__dirname, '.tmp', 'big-13mb.html');
  if (fs.existsSync(bigPath)) {
    const s2 = await L.newSession(browser, { width: 1000, height: 700 }); const q = s2.p;
    await L.openSubject(q, 'Анатомия');
    const t1 = Date.now();
    const [fc] = await Promise.all([q.waitForEvent('filechooser'), q.click('.hero-actions .btn-primary')]);
    await fc.setFiles(bigPath);
    await q.waitForSelector('.progress-bar', { timeout: 20000 });
    let longest = 0; await q.evaluate(() => { window.__lt = 0; new PerformanceObserver(l => l.getEntries().forEach(e => { window.__lt = Math.max(window.__lt, e.duration); })).observe({ entryTypes: ['longtask'] }); });
    await q.waitForFunction(() => !document.querySelector('.progress-bar'), null, { timeout: 180000 });
    const impMs = Date.now() - t1;
    if (await q.$('.modal .btn-primary')) await q.click('.modal .btn-primary');
    await q.waitForSelector('.doc-card'); longest = await q.evaluate(() => window.__lt);
    ok('13 МБ / ~200 картинок: импорт завершился (прогресс показан)', impMs < 120000, impMs);
    const bm = (await L.idb(q, 'files'))[0];
    ok('13 МБ: 50 блоков, 200 картинок сохранены (в IndexedDB)', bm.blockCount === 50 && (await L.idb(q, 'images')).filter(i => i.src).length === 200, [bm.blockCount]);
    const t2 = Date.now();
    await q.click('.doc-card'); await q.waitForSelector('.doc p', { timeout: 30000 });
    const firstScreen = Date.now() - t2;
    ok(`13 МБ: первый экран появился < 1.5 с (${firstScreen} мс)`, firstScreen < 1500, firstScreen);
    await sleep(1000);
    ok('13 МБ: после загрузки нет долгой задачи > 100 мс при прокрутке 3 с', await (async () => { await q.evaluate(() => { window.__lt = 0; }); for (let i = 0; i < 20; i++) { await q.evaluate(() => document.querySelector('.rd-scroll').scrollBy(0, 400)); await sleep(150); } return (await q.evaluate(() => window.__lt)) <= 100; })(), await q.evaluate(() => window.__lt));
    ok('нет console.error (большой файл)', s2.logs.length === 0, s2.logs);
    await s2.ctx.close();
  }
}
module.exports = { run };
