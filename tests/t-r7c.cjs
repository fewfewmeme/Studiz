// Round 7 gate, part C: the same checks at 1180x820 and portrait 820x1100, and the 13 MB file.
const L = require('./lib.cjs');
const path = require('path'), fs = require('fs'), sharp = require('sharp');
const { ok, sleep } = L;
const OUT = path.join(L.ROOT, 'docs', 'qa', 'round7'); fs.mkdirSync(OUT, { recursive: true });
const FILES = ['r7/app-physiology.html', 'r7/plain-splanchnology.html', 'r7/slides-landscape.pdf', 'r7/text-portrait.pdf'];

async function bigHtml() {
  const out = path.join(L.ROOT, 'tests', 'fixtures', 'r7', '_big.html');
  const imgs = [];
  for (let i = 0; i < 40; i++) { const b = await sharp({ create: { width: 400, height: 260, channels: 3, noise: { type: 'gaussian', mean: 128, sigma: 55 } } }).jpeg({ quality: 75 }).toBuffer(); imgs.push('data:image/jpeg;base64,' + b.toString('base64')); }
  let h = '<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><title>Большой файл</title><style>body{font:17px/1.6 Georgia,serif;background:#fbf8f1;color:#222}.wrap{max-width:820px;margin:0 auto;padding:30px}img{max-width:100%}</style></head><body><div class="wrap"><h1>Большой файл</h1>';
  for (let s = 0; s < 50; s++) { h += `<h2>Раздел ${s + 1}</h2><p>${'Слово текст кровь сосуд клетка орган ткань. '.repeat(60)}</p>`; for (let k = 0; k < 4; k++) h += `<img alt="р" src="${imgs[(s * 4 + k) % 40]}">`; }
  fs.writeFileSync(out, h + '</div></body></html>'); return out;
}

async function run(browser) {
  console.log('\n=== Round 7 (C): другие размеры окна, большой файл ===');
  for (const [w, hh] of [[1180, 820], [820, 1100]]) {
    const land = w > hh;
    const { ctx, p, logs } = await L.newSession(browser, { width: w, height: hh });
    await L.openSubject(p, 'Анатомия'); await L.importFiles(p, FILES);
    const open = async (name, mode) => { await p.evaluate(() => { location.hash = '#/subject/anatomy'; }); await p.waitForSelector('.doc-card'); await L.openFile(p, name, null, mode); };
    const F = () => L.frameOf(p);
    const tag = `${w}×${hh}`;
    // default zoom + steps through the API (the rail buttons exist only in landscape)
    await open('plain-splanchnology', 'normal');
    ok(`${tag}: масштаб по умолчанию 75`, (await p.evaluate(() => window.__reader.doc().zoomOf())) === 75);
    await p.evaluate(() => { const d = window.__reader.doc(); for (let i = 0; i < 8; i++) d.zoomStep(-1); }); await sleep(300);
    ok(`${tag}: ниже 50 не опускается и не прыгает на 100`, (await p.evaluate(() => window.__reader.doc().zoomOf())) === 50);
    await p.evaluate(() => window.__reader.doc().resetZoom());
    for (const name of ['plain-splanchnology', 'app-physiology', 'text-portrait']) {
      for (const mode of ['normal', 'blocks']) {
        await open(name, mode); await sleep(300);
        const r = await F().evaluate(() => ({ over: document.documentElement.scrollWidth > innerWidth + 1, cut: [...document.querySelectorAll('table')].filter(t => { const sc = t.closest('.lz-tscroll'), b = (sc || t).getBoundingClientRect(); return b.right > document.documentElement.getBoundingClientRect().width + 1; }).length }));
        ok(`${tag} ${name} / ${mode}: без горизонтальной прокрутки, таблицы не обрезаны`, !r.over && !r.cut, r);
      }
      await open(name, 'book'); await sleep(700);
      const g = await F().evaluate(() => {
        const BK = window.__lz.book, K = window.__lz.K, g = BK.g, u = K.r / K.z, out = { covers: document.querySelectorAll('.lz-cover').length, coverCol: BK.colOf(document.querySelector('.lz-cover')), two: BK.two, bad: 0, tested: 0 };
        const left = g.left * u, right = (g.left + g.spreadW) * u, top = g.top * u, bottom = (g.top + g.pageH) * u;
        const w2 = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n;
        while ((n = w2.nextNode()) && out.tested < 500) { if (!n.data.trim() || n.parentElement.closest('.lz-own,.lz-chrome,style,script')) continue; const r = document.createRange(); r.selectNodeContents(n); for (const b of r.getClientRects()) { if (b.right < 0 || b.left > innerWidth * u) continue; out.tested++; if (b.left < left - 2 || b.right > right + 2 || b.top < top - 2 || b.bottom > bottom + 2) out.bad++; } }
        out.partsLeft = BK.partCols.every((x, i) => BK.parts[i].skipBreak || !BK.two || x.col % 2 === 0);
        out.cols = BK.partCols.map(x => x.col); out.skip = BK.parts.map(x => !!x.skipBreak); return out;
      });
      const pager = await p.evaluate(() => { const pg = document.querySelector('.fr-pager').getBoundingClientRect(), fr = document.querySelector('.lz-frame').getBoundingClientRect(); return { pagerTop: pg.top, frameTop: fr.top }; });
      const pageBottom = await F().evaluate(() => { const BK = window.__lz.book; const e = document.querySelector('.lz-pg.r').getBoundingClientRect(); return e.bottom * window.__lz.K.z / window.__lz.K.r; });
      const fb = await p.evaluate(() => document.querySelector('.lz-frame').getBoundingClientRect().top);
      ok(`${tag} ${name} / Книга: одна обложка, колонки на месте, текст внутри страниц, части с левой`, g.covers === 1 && g.coverCol === 0 && g.bad === 0 && g.partsLeft, g);
      ok(`${tag} ${name} / Книга: страница не заходит под переключатель страниц (${Math.round(fb + pageBottom)} ≤ ${Math.round(pager.pagerTop)})`, fb + pageBottom <= pager.pagerTop + 1, [fb + pageBottom, pager.pagerTop]);
      await p.screenshot({ path: path.join(OUT, `book-${name}-${w}x${hh}.png`) });
    }
    await open('slides-landscape', 'book'); await sleep(600);
    ok(`${tag}: альбомный PDF в «Блокноте», страницы целиком`, await F().evaluate(() => { const imgs = [...document.querySelectorAll('img.pdf-page')]; const pg = document.querySelector('.lz-pg.r').getBoundingClientRect(); const r = imgs[0].getBoundingClientRect(); return window.__lz.book.notepad && r.width <= pg.width + 1; }));
    // position survives a view switch
    await open('plain-splanchnology', 'normal');
    await F().evaluate(() => { document.querySelectorAll('h3')[5].scrollIntoView({ block: 'start' }); }); await sleep(800);
    const a0 = await F().evaluate(() => window.__lz.anchor()); await L.switchTo(p, 'book'); await sleep(700); const a1 = await F().evaluate(() => window.__lz.anchor()); await L.switchTo(p, 'blocks'); await sleep(700); const a2 = await F().evaluate(() => window.__lz.anchor());
    ok(`${tag}: переключение вида сохраняет место чтения`, a0 && a1 && a2 && Math.abs(a0.off - a1.off) < 1500 && Math.abs(a0.off - a2.off) < 1500, [a0 && a0.off, a1 && a1.off, a2 && a2.off]);
    ok(`${tag}: нет ошибок в консоли`, logs.length === 0, logs);
    await ctx.close();
  }

  // ---- 13 MB file: first screen < 1.5 s ----
  const big = await bigHtml(); const sz = fs.statSync(big).size;
  const { ctx, p } = await L.newSession(browser, { width: 1180, height: 820 });
  await L.openSubject(p, 'Анатомия');
  const t0 = Date.now(); const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.click('.hero-actions .btn-primary')]); await fc.setFiles(big);
  await L.answerImportDialogs(p); await p.waitForSelector('.doc-card', { timeout: 120000 });
  const impMs = Date.now() - t0;
  ok(`большой файл (${(sz / 1048576).toFixed(1)} МБ): импорт без зависания (${impMs} мс)`, impMs < 60000, impMs);
  for (const mode of ['normal', 'blocks', 'book']) {
    await p.evaluate(() => { location.hash = '#/subject/anatomy'; }); await p.waitForSelector('.doc-card');
    const t1 = Date.now(); await p.click('.doc-card'); await p.waitForSelector('.reader'); await p.waitForFunction(() => window.__reader && window.__reader.doc() && window.__reader.doc().mode);
    if (mode !== 'normal') { await p.evaluate(m => document.querySelector(`.reader [data-mode=${m}]`).click(), mode); }
    await p.waitForSelector('.reader .lz-frame:not(.lz-hidden)', { timeout: 30000 }); const dt = Date.now() - t1;
    ok(`большой файл / ${mode}: первый экран за ${dt} мс (< 1500)`, dt < 1500, dt);
  }
  fs.unlinkSync(big);
  await ctx.close();
}
module.exports = { run };
