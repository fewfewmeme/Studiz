// node tools/shot-adapt.cjs <fixture rel path> <w> <h> <mode> <out.png> [theme]
const L = require('../tests/lib.cjs'); const path = require('path');
(async () => {
  const [fx, w, h, mode, out, theme] = process.argv.slice(2);
  const srv = await L.startServer(); const browser = await L.pw.chromium.launch();
  const { p, logs } = await L.newSession(browser, { width: +w, height: +h }, { theme });
  await L.openSubject(p, 'Анатомия');
  await L.importFiles(p, [fx]);
  const name = path.basename(fx).replace(/\.[^.]+$/, '');
  await p.click('.doc-card'); await p.waitForSelector('.reader');
  await p.waitForFunction(() => window.__reader && window.__reader.doc() && window.__reader.doc().mode, null, { timeout: 30000 });
  await p.click(`[data-mode=${mode}]`); await L.sleep(2500);
  await p.screenshot({ path: out });
  console.log(logs.join('\n') || 'no errors');
  await browser.close(); srv.kill();
})();
