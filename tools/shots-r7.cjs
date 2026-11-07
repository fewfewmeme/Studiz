// node tools/shots-r7.cjs  -> docs/qa/round7/shots/<fixture>-<view>-<WxH>.png (all fixtures x views x viewports)
const L = require('../tests/lib.cjs'); const path = require('path'), fs = require('fs');
const OUT = path.join(L.ROOT, 'docs', 'qa', 'round7', 'shots'); fs.mkdirSync(OUT, { recursive: true });
const FILES = ['r7/app-physiology.html', 'r7/plain-splanchnology.html', 'r7/slides-landscape.pdf', 'r7/text-portrait.pdf', 'r7/doc.docx', 'r7/notes.md'];
const VPS = [[1000, 700], [1180, 820], [820, 1100]];
(async () => {
  const srv = await L.startServer(); const browser = await L.pw.chromium.launch();
  const only = process.argv[2];
  for (const [w, h] of VPS) {
    const { p, ctx } = await L.newSession(browser, { width: w, height: h });
    await L.openSubject(p, 'Анатомия'); await L.importFiles(p, FILES);
    const files = await L.idb(p, 'files');
    for (const f of files) {
      if (only && !f.name.includes(only)) continue;
      for (const view of ['orig', 'normal', 'book', 'blocks']) {
        await p.evaluate(id => { location.hash = '#/file/' + id; }, f.id);
        await p.waitForSelector('.reader'); await p.waitForFunction(() => window.__reader && window.__reader.doc() && window.__reader.doc().mode, null, { timeout: 30000 });
        const has = await p.evaluate(v => !![...document.querySelectorAll('.reader [data-mode]')].find(b => b.dataset.mode === v && !b.hidden), view);
        if (!has) continue;
        await L.switchTo(p, view); await L.sleep(800);
        await p.screenshot({ path: path.join(OUT, `${f.name}-${view}-${w}x${h}.png`) });
      }
    }
    await ctx.close();
  }
  await browser.close(); srv.kill();
})();
