// docs/qa/round9: site view next to the raw file (HTML rendered alone; Word through docx-preview alone; PDF first page)
const L = require('../tests/lib.cjs'); const { FILES } = require('../tests/regression/lib.cjs'); const path = require('path'), fs = require('fs'); const sharp = require('sharp');
const OUT = path.join(L.ROOT, 'docs', 'qa', 'round9'); fs.mkdirSync(OUT, { recursive: true });
const RG = f => path.join(L.ROOT, 'tests', 'regression', f);
(async () => {
  const srv = await L.startServer(); const browser = await L.pw.chromium.launch();
  const { p } = await L.newSession(browser, { width: 1000, height: 700 });
  await L.openSubject(p, 'Анатомия'); await L.importFiles(p, FILES.map(f => '../regression/' + f));
  const files = await L.idb(p, 'files'); const raw = await (await browser.newContext({ viewport: { width: 848, height: 684 } })).newPage();
  for (const fx of FILES) {
    const name = fx.replace(/\.[^.]+$/, ''), meta = files.find(f => f.name === name);
    await p.evaluate(id => { location.hash = '#/file/' + id; }, meta.id); await p.waitForSelector('.reader');
    await p.waitForFunction(() => window.__reader && window.__reader.doc() && window.__reader.doc().mode, null, { timeout: 30000 });
    for (const view of (/^01-/.test(fx) ? ['orig', 'normal', 'book', 'blocks'] : ['normal', 'book', 'blocks'])) { await L.switchTo(p, view); await L.sleep(700); await p.screenshot({ path: path.join(OUT, `${name}-${view}.png`) }); }
    await L.switchTo(p, /^01-/.test(fx) ? 'orig' : 'normal'); await L.sleep(500);
    const site = path.join(OUT, `${name}-${/^01-/.test(fx) ? 'orig' : 'normal'}.png`);
    let rawPng = null;
    if (/\.html$/.test(fx)) { const html = fs.readFileSync(RG(fx), 'utf8'); await raw.setContent(html.replace(/<link[^>]*googleapis[^>]*>/gi, '')); rawPng = await raw.screenshot(); }
    else if (/\.md$|\.txt$/.test(fx)) { await raw.setContent('<pre style="font:15px/1.5 monospace;white-space:pre-wrap;padding:20px">' + fs.readFileSync(RG(fx), 'utf8').replace(/</g, '&lt;') + '</pre>'); rawPng = await raw.screenshot(); }
    if (rawPng) { const a = await sharp(site).resize({ height: 700 }).toBuffer({ resolveWithObject: true }); const b = await sharp(rawPng).resize({ height: 700 }).toBuffer({ resolveWithObject: true }); await sharp({ create: { width: a.info.width + b.info.width + 10, height: 700, channels: 3, background: '#888' } }).composite([{ input: a.data, left: 0, top: 0 }, { input: b.data, left: a.info.width + 10, top: 0 }]).png().toFile(path.join(OUT, `${name}-site-vs-raw.png`)); }
    console.log(name);
  }
  await browser.close(); srv.kill();
})();
