// Quality gate: fixtures x modes x light/dark x viewports. Programmatic checks everywhere, screenshots for a subset.
// node tools/qa-matrix.cjs [--quick]   -> docs/qa/final/*.jpg + docs/qa/final/MATRIX.md
const L = require('../tests/lib.cjs'); const fs = require('fs'), path = require('path');
const OUT = path.join(L.ROOT, 'docs', 'qa', 'final'); fs.mkdirSync(OUT, { recursive: true });
const quick = process.argv.includes('--quick');
const VPS = [[1000, 700], [1180, 820], [820, 1100], [390, 844]];
const FX = fs.readdirSync(path.join(L.ROOT, 'tests/fixtures/adapt')).filter(f => /\.html$/.test(f) && f !== 'sdf-example.html').map(f => 'adapt/' + f);
const SHOT = new Set(['app-angiology', 'app-histology', 'app-biochem1', 'app-philosophy', 'hostile-3col', 'hostile-word']);
const fails = []; let checks = 0; const rows = [];
const bad = (k, d) => { fails.push(k + ' ' + JSON.stringify(d).slice(0, 220)); console.log('  ✗', k, JSON.stringify(d).slice(0, 220)); };
const good = () => { checks++; };

const PROBE = () => {
  const lum = c => { const m = c.match(/[\d.]+/g).map(Number); const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }; return { L: .2126 * f(m[0]) + .7152 * f(m[1]) + .0722 * f(m[2]), a: m[3] == null ? 1 : m[3] }; };
  const paperL = (() => { const t = document.createElement('i'); t.style.background = 'var(--paper)'; document.body.append(t); const l = lum(getComputedStyle(t).backgroundColor).L; t.remove(); return l; })();
  const bgOf = el => { for (let e = el; e; e = e.parentElement) { const cs = getComputedStyle(e); const l = lum(cs.backgroundColor); if (l.a > .5) return l.L; if ((cs.backgroundImage !== 'none' || e.matches('.book-content')) && e.closest('.doc, .book-sheet, .pg')) return paperL; } return 1; };
  const doc = document.querySelector('.book-content') && document.querySelector('.book-sheet') ? document.querySelector('.book-content') : document.querySelector('.doc');
  const out = { fixed: 0, overflowX: document.documentElement.scrollWidth > innerWidth + 1, clipped: 0, minContrast: 21, imgs: 0, blk: 0, fonts: [] };
  const root = document.querySelector('.rd-scroll') || document.body;
  out.overflowX = out.overflowX || root.scrollWidth > root.clientWidth + 2;
  if (doc) {
    for (const e of doc.querySelectorAll('*')) { const p = getComputedStyle(e).position; if (p === 'fixed' || p === 'sticky') out.fixed++; }
    out.imgs = doc.querySelectorAll('img, .lz-missing, canvas').length;
    out.blk = doc.querySelectorAll('section.blk, .blk-card').length;
    const w = document.createTreeWalker(doc, NodeFilter.SHOW_TEXT); let n, tested = 0;
    while ((n = w.nextNode()) && tested < 500) {
      if (!n.data.trim()) continue; const e = n.parentElement; const cs = getComputedStyle(e); if (cs.visibility === 'hidden' || cs.display === 'none' || cs.opacity === '0') continue;
      tested++; const fg = lum(cs.color); const bg = bgOf(e); const a = Math.max(fg.L, bg) + .05, b = Math.min(fg.L, bg) + .05; const r = a / b;
      const big = parseFloat(cs.fontSize) >= 24; if (r < (big ? 3 : 4.5)) out.minContrast = Math.min(out.minContrast, r); else out.minContrast = Math.min(out.minContrast, Math.max(r, 4.5));
      const ov = cs.overflowX; if ((ov === 'hidden' || ov === 'clip') && e.scrollWidth > e.clientWidth + 3 && e.clientWidth > 0 && e.children.length === 0) out.clipped++;
    }
    out.fonts = [...new Set([...doc.querySelectorAll('p')].slice(0, 80).map(p => getComputedStyle(p).fontSize))];
  }
  return out;
};

(async () => {
  const srv = await L.startServer(); const browser = await L.pw.chromium.launch();
  const srcInfo = {};
  for (const f of FX) { const t = fs.readFileSync(path.join(L.ROOT, 'tests/fixtures', f), 'utf8'); srcInfo[path.basename(f, '.html')] = { imgs: (t.match(/<img\b[^>]*\bsrc=/gi) || []).length, blk: (t.match(/<section[^>]*class="[^"]*\bblk\b/gi) || []).length }; }
  for (const [w, h] of (quick ? [[1180, 820], [390, 844]] : VPS)) {
    console.log(`\n=== ${w}x${h} ===`);
    const { ctx, p, logs } = await L.newSession(browser, { width: w, height: h });
    await L.openSubject(p, 'Анатомия');
    const t0 = Date.now(); await L.importFiles(p, FX); console.log('  import', FX.length, 'files', Date.now() - t0, 'ms');
    const files = await L.idb(p, 'files'); const land = w > h;
    for (const f of files) {
      const name = f.name; const src = srcInfo[name]; if (!src) continue;
      for (const mode of ['normal', 'book', 'blocks']) {
        for (const scheme of ['light', 'dark']) {
          const key = `${name} ${mode} ${scheme} ${w}x${h}`;
          try {
            await p.evaluate(([id, th]) => { document.documentElement.dataset.theme = th; location.hash = '#/file/' + id; }, [f.id, scheme === 'dark' ? 'deep' : 'cyan']);
            await p.waitForSelector('.reader'); await p.waitForFunction(() => window.__reader && window.__reader.doc() && window.__reader.doc().mode, null, { timeout: 30000 });
            await p.waitForFunction(m => { const e = document.querySelector(`[data-mode=${m}]`); if (!e) return false; e.click(); return true; }, mode, { timeout: 10000 });
            await p.waitForFunction(() => !document.querySelector('.rd-stage.swap') && !document.querySelector('.rd-loading'), null, { timeout: 30000 });
            await L.sleep(mode === 'book' ? 700 : 350);
            const r = await p.evaluate(PROBE);
            if (r.fixed) bad(key + ' fixed/sticky', r.fixed); else good();
            if (r.overflowX) bad(key + ' horizontal overflow', r); else good();
            if (r.minContrast < 4.5) bad(key + ' contrast', r.minContrast); else good();
            if (r.clipped) bad(key + ' clipped text', r.clipped); else good();
            if (mode === 'normal') { if (r.imgs < src.imgs) bad(key + ' images', { got: r.imgs, want: src.imgs }); else good(); }
            if (mode === 'blocks' && src.blk) { if (r.blk !== src.blk) bad(key + ' blocks', { got: r.blk, want: src.blk }); else good(); }
            if (mode === 'book') { if (r.fonts.length > 1) bad(key + ' book font-size not single', r.fonts); else good(); }
            const lay = await p.evaluate(() => ({ strip: !!document.querySelector('.rd-top') && getComputedStyle(document.querySelector('.rd-top')).display !== 'none', rail: !!document.querySelector('.rail-l') && getComputedStyle(document.querySelector('.rail-l')).display !== 'none' }));
            if (land ? (lay.strip || !lay.rail) : (!lay.strip)) bad(key + ' layout', lay); else good();
            if (SHOT.has(name) && scheme === (w > 500 ? 'light' : 'dark') && (name === 'app-angiology' || mode === 'normal') && !(land && w === 1000)) {
              await p.screenshot({ path: path.join(OUT, `${name}-${mode}-${scheme}-${w}x${h}.jpg`), type: 'jpeg', quality: 62 });
            }
            rows.push([key, 'ok']);
          } catch (e) { bad(key + ' CRASH', String(e.message).split('\n')[0]); }
        }
      }
    }
    if (logs.length) bad(`console errors ${w}x${h}`, logs.slice(0, 3));
    await ctx.close();
  }
  await browser.close(); srv.kill();
  const md = `# QA-матрица (автоматическая)\n\nПроверок: ${checks}, ошибок: ${fails.length}\n\nФикстуры: ${FX.length} (12 «мини-приложений» + враждебные), режимы: Обычный/Книга/Блоки, схемы: светлая (Цианотипия) и тёмная (Глубина), окна: ${(quick ? [[1180, 820], [390, 844]] : VPS).map(v => v.join('×')).join(', ')}.\n\n${fails.length ? '## Ошибки\n\n' + fails.map(x => '- ' + x).join('\n') : 'Все проверки пройдены.'}\n`;
  fs.writeFileSync(path.join(OUT, 'MATRIX.md'), md); console.log(`\nchecks ${checks}, fails ${fails.length}`);
  process.exit(fails.length ? 1 : 0);
})();
