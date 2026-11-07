// Before-screenshots of the round-2 UI (kept for the audit). Run against the old build.
const L = require('../tests/lib.cjs');
const path = require('path');
(async () => {
  const srv = await L.startServer();
  const browser = await L.pw.chromium.launch();
  const OUT = path.join(L.ROOT, 'qa', 'before3');
  for (const [w, h] of [[1180, 740], [820, 1100]]) {
    const { p } = await L.newSession(browser, { width: w, height: h });
    await L.openSubject(p, 'Анатомия');
    await L.importFiles(p, ['sample.pdf', 'sample.html']);
    await p.screenshot({ path: `${OUT}/${w}x${h}-subject.png` });
    await p.evaluate(() => { location.hash = '#/'; }); await L.sleep(500);
    await p.screenshot({ path: `${OUT}/${w}x${h}-home.png` });
    await p.evaluate(() => { location.hash = '#/settings'; }); await L.sleep(500);
    await p.screenshot({ path: `${OUT}/${w}x${h}-settings.png` });
    await p.evaluate(() => { location.hash = '#/'; }); await L.sleep(300);
    await L.openSubject(p, 'Анатомия');
    await L.openDoc(p, 'sample', 'PDF', 'normal');
    await p.screenshot({ path: `${OUT}/${w}x${h}-pdf-normal.png` });
    await p.click('[data-mode=book]'); await L.sleep(1500);
    await p.screenshot({ path: `${OUT}/${w}x${h}-pdf-book.png` });
    await p.click('[data-mode=blocks]'); await L.sleep(1500);
    await p.screenshot({ path: `${OUT}/${w}x${h}-pdf-blocks.png` });
  }
  await browser.close(); srv.kill();
})();
