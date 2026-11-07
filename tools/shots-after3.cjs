// Quality-gate screenshots (qa/after3): node tools/shots-after3.cjs [outdir]
const L = require('../tests/lib.cjs');
const fs = require('fs');
const OUT = process.argv[2] || L.OUT; fs.mkdirSync(OUT, { recursive: true });
const SIZES = [[1180, 740], [820, 1100], [1366, 1024], [390, 844]];
(async () => {
  const srv = await L.startServer();
  const browser = await L.pw.chromium.launch();
  for (const [w, h] of SIZES) {
    const tag = `${w}x${h}`;
    const s = await L.newSession(browser, { width: w, height: h });
    const p = s.p;
    // splash (fresh session, before entering)
    const sp = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, serviceWorkers: 'block' }); const sq = await sp.newPage();
    await sq.goto(L.URL); await sq.waitForSelector('.splash'); await L.sleep(900); await sq.screenshot({ path: `${OUT}/${tag}-splash.png` }); await sp.close();
    await p.evaluate(() => { location.hash = '#/'; }); await L.sleep(500);
    await p.screenshot({ path: `${OUT}/${tag}-home-empty.png` });
    await L.openSubject(p, 'Анатомия');
    await p.screenshot({ path: `${OUT}/${tag}-subject-empty.png` });
    await L.importFiles(p, ['sample.pdf', 'sample.html', 'small.html']);
    await L.sleep(1200);
    await p.screenshot({ path: `${OUT}/${tag}-subject.png` });
    await p.evaluate(() => { location.hash = '#/'; }); await L.sleep(1200); await p.screenshot({ path: `${OUT}/${tag}-home.png` });
    await p.evaluate(() => { location.hash = '#/settings'; }); await p.waitForSelector('.theme-card'); await L.sleep(900); await p.screenshot({ path: `${OUT}/${tag}-settings.png` });
    await p.evaluate(() => { location.hash = '#/subject/anatomy'; }); await p.waitForSelector('.doc-card');
    // reader PDF
    await L.openDoc(p, 'sample', 'PDF', 'normal'); await p.waitForSelector('.pg .textLayer span'); await L.sleep(700);
    await p.evaluate(() => { const sp = [...document.querySelectorAll('.pg[data-page="1"] .textLayer > span')].filter(s => s.textContent.trim().length > 30); const r = document.createRange(); r.setStart(sp[0].firstChild, 0); r.setEnd(sp[1].firstChild, sp[1].firstChild.length); const s = getSelection(); s.removeAllRanges(); s.addRange(r); });
    await p.waitForSelector('.pill.show'); await L.sleep(500); await p.screenshot({ path: `${OUT}/${tag}-reader-normal-selection.png` });
    await p.click('.pill .pbtn.main'); await L.sleep(400);
    await p.evaluate(() => { window.__reader.tools.set({ color: 4 }); const sp = [...document.querySelectorAll('.pg[data-page="1"] .textLayer > span')].filter(s => s.textContent.trim().length > 30); const r = document.createRange(); r.setStart(sp[3].firstChild, 0); r.setEnd(sp[4].firstChild, 40); const s = getSelection(); s.removeAllRanges(); s.addRange(r); });
    await p.waitForSelector('.pill.show'); await p.click('.pill .pbtn.main'); await L.sleep(400);
    await p.screenshot({ path: `${OUT}/${tag}-reader-normal-marks.png` });
    await p.click('[data-id=marker]'); await p.waitForSelector('.popover'); await L.sleep(400); await p.screenshot({ path: `${OUT}/${tag}-reader-colour-popover.png` });
    await p.evaluate(() => { window.__reader.closePop(); window.__reader.tools.set({ tool: 'none' }); });
    await p.click('[data-mode=book]'); await L.sleep(2000); await p.screenshot({ path: `${OUT}/${tag}-reader-book.png` });
    await p.click('[data-mode=blocks]'); await L.sleep(2200); await p.screenshot({ path: `${OUT}/${tag}-reader-blocks-pdf.png` });
    // HTML blocks with timer popover + list sheet
    await p.click('.rd-back, .rd-top .rd-back'); await p.waitForSelector('.doc-card'); await L.openDoc(p, 'sample', 'HTML', 'blocks'); await p.waitForSelector('.bk-head'); await L.sleep(800);
    await p.screenshot({ path: `${OUT}/${tag}-reader-blocks.png` });
    await p.evaluate(() => document.querySelectorAll('.bk-foot .bk-start')[1].click()); await L.sleep(500);
    await p.click('.timer-chip'); await p.waitForSelector('.bk-tpop'); await L.sleep(400); await p.screenshot({ path: `${OUT}/${tag}-reader-blocks-timer.png` });
    await p.evaluate(() => window.__reader.closePop());
    await p.click('.rd-list'); await p.waitForSelector('.modal .bk-rows'); await L.sleep(400); await p.screenshot({ path: `${OUT}/${tag}-reader-blocks-list.png` });
    await p.click('.modal .btn:has-text("Закрыть")');
    await p.click('[data-mode=normal]'); await L.sleep(1200); await p.screenshot({ path: `${OUT}/${tag}-reader-html-normal.png` });
    await p.click('[data-mode=book]'); await L.sleep(1800); await p.screenshot({ path: `${OUT}/${tag}-reader-html-book.png` });
    console.log(tag, s.logs.length ? s.logs : 'ok');
    await s.ctx.close();
  }
  await browser.close(); srv.kill();
})();
