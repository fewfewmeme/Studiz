// Quick look at the reader: node tools/shot-reader.cjs <w> <h> <out.png> <pdf|html> <normal|book|blocks> [theme] [select]
const L = require('../tests/lib.cjs');
(async () => {
  const [w, h, out, kind = 'pdf', mode = 'normal', theme, sel] = process.argv.slice(2);
  const srv = await L.startServer();
  const browser = await L.pw.chromium.launch();
  const { p, logs } = await L.newSession(browser, { width: +w, height: +h }, { theme });
  await L.openSubject(p, 'Анатомия');
  await L.importFiles(p, ['sample.pdf', 'sample.html']);
  await L.openDoc(p, 'sample', kind === 'pdf' ? 'PDF' : 'HTML', mode);
  await L.sleep(1500);
  if (sel) {
    if (kind === 'pdf') await L.selectText(p, '.textLayer', 0, 30);
    else await L.selectText(p, mode === 'normal' ? '.doc p' : '.bk', 0, 40, 2);
    await L.sleep(500);
  }
  await p.screenshot({ path: out });
  console.log(logs.join('\n') || 'no errors');
  await browser.close(); srv.kill();
})();
