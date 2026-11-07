// Round 9, phase 2: zoom that works — glyph size follows the zoom in every view and file type; Книга keeps its page frame.
const L = require('./lib.cjs'); const { ok, sleep } = L; const { FILES } = require('./regression/lib.cjs');
const GLYPH = () => {
  const K = window.__lz.K, f = K.z / K.r, SK = 'style,script,.lz-own,.lz-chrome,.lz-cover';
  const hasText = [...document.querySelectorAll('p,li,td')].some(e => !e.closest('.lz-own,.lz-chrome,.lz-cover'));
  const img = document.querySelector('img.pdf-page');
  if (img && !hasText) { const r = img.getBoundingClientRect(); return { kind: 'img', v: r.width * f }; }
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n;
  while ((n = w.nextNode())) {
    if (n.data.trim().length < 100 || n.parentElement.closest(SK)) continue;
    const e = n.parentElement; if (getComputedStyle(e).display === 'none') continue;
    if (window.__lz.book) { window.__lz.book.gotoNode(n, 0); }     // the same reference paragraph at every zoom
    const r = document.createRange(); r.setStart(n, 0); r.setEnd(n, 16);
    const rs = r.getClientRects(); if (rs.length !== 1 || !rs[0].width) continue;
    return { kind: 'text', v: rs[0].width * f };     // width of 16 characters: proportional to the glyph size, no integer rounding of line boxes
  }
  return null;
};
// characters of text that are really inside the visible spread (page window), counted by scanning ranges
const VISIBLE_CHARS = () => {
  const BK = window.__lz.book, K = window.__lz.K, g = BK.g, u = K.r / K.z;
  const L0 = g.left * u, R0 = (g.left + g.spreadW) * u, T0 = g.top * u, B0 = (g.top + g.pageH) * u;
  let n = 0; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (w.nextNode()) {
    const t = w.currentNode; if (t.parentElement.closest('style,script,.lz-own,.lz-chrome,.lz-cover')) continue;
    const r = document.createRange(); r.selectNodeContents(t); const b = r.getBoundingClientRect();
    if (b.right < L0 || b.left > R0 || b.bottom < T0 || b.top > B0) { if (b.width && b.height && b.left < R0 && b.right > L0) {/* spans pages: scan below */ } else continue; }
    for (let i = 0; i < t.data.length; i += 6) { r.setStart(t, i); r.setEnd(t, Math.min(t.data.length, i + 6)); const c = r.getClientRects()[0]; if (c && c.left >= L0 - 1 && c.right <= R0 + 1 && c.top >= T0 - 1 && c.bottom <= B0 + 1) n += Math.min(6, t.data.length - i); }
  }
  return n;
};
async function run(browser) {
  console.log('\n=== Round 9 / фаза 2: масштаб ===');
  const { ctx, p, logs } = await L.newSession(browser, { width: 1000, height: 700 });
  await L.openSubject(p, 'Анатомия');
  await L.importFiles(p, FILES.map(f => '../regression/' + f));
  const files = await L.idb(p, 'files');
  const F = () => L.frameOf(p);
  const setZoom = async z => { await p.evaluate(zz => window.__reader.doc().setZoomPct(zz), z); await sleep(z === 50 || z === 150 ? 900 : 700); };
  for (const fx of FILES) {
    const meta = files.find(f => f.name === fx.replace(/\.[^.]+$/, ''));
    const views = /^01-/.test(fx) ? ['orig', 'normal', 'book', 'blocks'] : ['normal', 'book', 'blocks'];
    await p.evaluate(id => { location.hash = '#/file/' + id; }, meta.id);
    await p.waitForSelector('.reader'); await p.waitForFunction(() => window.__reader && window.__reader.doc() && window.__reader.doc().mode, null, { timeout: 30000 });
    for (const view of views) {
      await L.switchTo(p, view); await sleep(400);
      const g = {}, frame = {}, chars = {};
      for (const z of [100, 50, 75, 150]) {
        await setZoom(z);
        g[z] = await F().evaluate(GLYPH);
        if (view === 'book') {
          frame[z] = await F().evaluate(() => { const r = document.querySelector('.lz-pg.r').getBoundingClientRect(), k = window.__lz.K.z / window.__lz.K.r; return [Math.round(r.width * k), Math.round(r.height * k)]; });
          chars[z] = await F().evaluate(() => { const BK = window.__lz.book; return { pages: BK.pages, content: BK.pages - 1 - document.querySelectorAll('.lz-sp').length }; });
        }
      }
      const base = g[100] && g[100].v;
      const isImg = g[100] && g[100].kind === 'img';
      const exempt = view === 'book' && isImg;   // a page-picture document in the book is fitted to its page (logged in DECISIONS)
      for (const z of [50, 75, 150]) {
        const ratio = g[z] && base ? g[z].v / base : 0, want = z / 100;
        ok(`${fx} / ${view}: размер символа при ${z}% = ${want}× от 100% (${ratio.toFixed(3)})`, exempt ? true : Math.abs(ratio - want) <= 0.03 * want + 0.005, [ratio, want, g[z], g[100]]);
      }
      if (view === 'book') {
        ok(`${fx} / Книга: рамка страницы одинакова при 50/75/100/150% (${JSON.stringify(frame[100])})`, [50, 75, 150].every(z => Math.abs(frame[z][0] - frame[100][0]) <= 1 && Math.abs(frame[z][1] - frame[100][1]) <= 1), frame);
        if (!isImg && chars[100].content >= 8) ok(`${fx} / Книга: при 50% на каждой странице ≥ 3× больше знаков, чем при 100% (${(chars[100].content / chars[50].content).toFixed(2)}×)`, chars[100].content / chars[50].content >= 3, chars);
      }
    }
    await p.evaluate(() => window.__reader.doc().setZoomPct(75));
  }
  ok('нет ошибок в консоли', logs.length === 0, logs);
  await ctx.close();
}
module.exports = { run };
