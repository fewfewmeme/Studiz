// Quick look: node tools/shot.cjs <w> <h> <out.png> [hash] [theme]  (imports fixtures into Анатомия first)
const L = require('../tests/lib.cjs');
(async () => {
  const [w, h, out, hash = '#/', theme] = process.argv.slice(2);
  const srv = await L.startServer();
  const browser = await L.pw.chromium.launch();
  const { p, logs } = await L.newSession(browser, { width: +w, height: +h }, { theme });
  await L.openSubject(p, 'Анатомия');
  await L.importFiles(p, ['sample.pdf', 'sample.html']);
  await p.evaluate(x => { location.hash = x; }, hash);
  await L.sleep(1200);
  await p.screenshot({ path: out });
  console.log(logs.join('\n') || 'no errors');
  await browser.close(); srv.kill();
})();
