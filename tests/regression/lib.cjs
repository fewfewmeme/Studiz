// PHASE 0 regression net: every supported file type x every view. collect() returns plain data that record.cjs saves as the
// baseline and t-reg.cjs compares against after each phase.
const L = require('../lib.cjs'); const path = require('path'), fs = require('fs');
const FILES = ['01-app-pathanat.html', '02-plain-splanchnology.html', '03-angiology.docx', '04-text-portrait.pdf', '05-diagrams-landscape.pdf', '06-scan.pdf', '07-notes.md', '08-notes.txt'];
const sleep = L.sleep;

const PROBE = () => {
  const SKIP = 'style,script,template,.lz-own,.lz-chrome';
  const colorsOf = () => {
    const sels = ['h1', 'h2', 'h3', 'p', 'li', 'td', 'th', '.callout', '.lat', 'b', 'table', 'figcaption', 'blockquote', 'img'];
    const out = []; let round = 0;
    while (out.length < 20 && round < 3) { for (const s of sels) { const e = [...document.querySelectorAll(s)].filter(x => !x.closest(SKIP))[round]; if (e) { const c = getComputedStyle(e); out.push(s + '#' + round + '|' + [c.fontFamily, c.color, c.backgroundColor, c.borderTopColor + '/' + c.borderTopWidth, c.fontStyle, c.fontWeight].join('|')); } if (out.length >= 20) break; } round++; }
    return out;
  };
  let textLen = 0; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (w.nextNode()) { const n = w.currentNode; if (n.parentElement && !n.parentElement.closest(SKIP)) textLen += n.data.replace(/\s+/g, ' ').trim().length; }
  const fixed = [...document.querySelectorAll('body *')].filter(e => !e.closest(SKIP) && ['fixed', 'sticky'].includes(getComputedStyle(e).position)).length;
  // normalised markup of the document itself (runtime-owned nodes and per-round data attributes removed)
  const clone = document.body.cloneNode(true);
  clone.querySelectorAll('.lz-own,script,.lz-pen').forEach(e => e.remove());
  clone.querySelectorAll('*').forEach(e => { for (const a of [...e.attributes]) if (/^data-(pm|pt|w|bl|lzw|lzo|m)$/.test(a.name)) e.removeAttribute(a.name); e.classList.remove('lz-done', 'lz-dim', 'lz-hide', 'lz-blur'); if (e.getAttribute('class') === '') e.removeAttribute('class'); });
  let h = 5381; const s = clone.innerHTML; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return { textLen, imgs: [...document.querySelectorAll('img')].filter(e => !e.closest('.lz-own')).length, colors: colorsOf(), overflowX: document.documentElement.scrollWidth > innerWidth + 1, fixed, domHash: (h >>> 0).toString(36), domLen: s.length, lzm: document.querySelectorAll('.lzm').length };
};

async function collect(browser, vp, { shotsDir = null, only = null, log = () => {} } = {}) {
  const { ctx, p, logs } = await L.newSession(browser, vp);
  const res = {};
  await L.openSubject(p, 'Анатомия');
  await L.importFiles(p, FILES.map(f => '../regression/' + f));
  const files = await L.idb(p, 'files'); const byName = n => files.find(f => f.name === n.replace(/\.[^.]+$/, ''));
  for (const fx of FILES) {
    if (only && !fx.includes(only)) continue;
    for (let attempt = 0; attempt < 2; attempt++) { try { await doFixture(fx); break; } catch (e) { if (attempt) throw e; await sleep(1500); } }
  }
  async function doFixture(fx) {
    const meta = byName(fx); const views = /^01-/.test(fx) ? ['orig', 'normal', 'book', 'blocks'] : ['normal', 'book', 'blocks'];
    await p.evaluate(id => { location.hash = '#/file/' + id; }, meta.id);
    await p.waitForSelector('.reader'); await p.waitForFunction(() => window.__reader && window.__reader.doc() && window.__reader.doc().mode, null, { timeout: 30000 });
    // a mark + a bookmark made in the normal view, then looked for in every view
    let markMade = false;
    await L.switchTo(p, 'normal');
    const hasText = await L.frameOf(p).evaluate(() => !!document.querySelector('p') && document.querySelector('p').textContent.length > 40);
    if (hasText) { await L.frameSelect(p, 'p', 5, 30); await p.waitForSelector('.pill.show', { timeout: 5000 }).catch(() => {}); if (await p.$('.pill.show')) { await p.click('.pill .pgrp:first-child .pbtn'); await sleep(600); markMade = true; } }
    for (const view of views) {
      await L.switchTo(p, view); await sleep(view === 'book' ? 900 : 500);
      const r = await L.frameOf(p).evaluate(PROBE);
      r.markMade = markMade; r.markPlaced = markMade && view !== 'orig' ? r.lzm > 0 : null;
      if (view === 'blocks') {
        const b = await L.frameOf(p).evaluate(() => ({ n: document.querySelectorAll('.lz-bh').length }));
        r.blocks = b.n;
        if (b.n) { const ok = await L.frameOf(p).evaluate(() => { document.querySelector('.lz-bh .bm').click(); return true; }); await sleep(500); const bm = await L.idb(p, 'kv', 'bmk:' + meta.id); r.bookmark = !!(bm && bm.value && bm.value.length); await L.frameOf(p).evaluate(() => document.querySelector('.lz-bh .bm').click()); await sleep(300); void ok; }
      }
      res[fx + '|' + view] = r;
      if (shotsDir && vp.width === 1000) { fs.mkdirSync(shotsDir, { recursive: true }); await p.screenshot({ path: path.join(shotsDir, `${fx.replace(/\.[^.]+$/, '')}-${view}.jpg`), type: 'jpeg', quality: 62 }); }
      log(fx + '|' + view);
    }
  }
  await ctx.close();
  return { res, logs };
}
module.exports = { collect, FILES };
