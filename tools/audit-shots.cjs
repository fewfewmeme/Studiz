// Takes "before" screenshots of the v1 site at iPad/iPhone sizes. Usage: node tools/audit-shots.cjs [outdir]
const { chromium } = require('playwright');
const path = require('path');
const out = process.argv[2] || path.join(__dirname, '..', 'qa', 'before');
const FX = f => path.join(__dirname, '..', 'tests', 'fixtures', f);
const sizes = [[1180, 820], [820, 1180], [1366, 1024], [1024, 768], [390, 844]];
(async () => {
  const b = await chromium.launch();
  for (const [w, h] of sizes) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, serviceWorkers: 'block', hasTouch: w < 900, isMobile: w < 500 });
    const p = await ctx.newPage();
    const tag = `${w}x${h}`;
    await p.goto('http://localhost:8080/app/');
    await p.waitForSelector('.splash');
    await p.screenshot({ path: `${out}/${tag}-splash.png` });
    await p.click('.splash-btn'); await p.waitForSelector('.subject-grid');
    await p.click('.subject-card:has-text("Анатомия")'); await p.waitForSelector('.content-head');
    const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.click('text=Добавить файлы')]);
    await fc.setFiles(['sample.html', 'sample.pdf'].map(FX));
    await p.waitForSelector('.toast'); await p.waitForTimeout(600);
    await p.screenshot({ path: `${out}/${tag}-subject.png` });
    for (const [name, kind] of [['sample', 'HTML'], ['sample', 'PDF']]) {
      await p.click(`.list-row:has(.badge:text-is("${kind}")) .list-main`);
      await p.waitForSelector('.stage > *'); await p.waitForTimeout(900);
      for (const m of ['normal', 'book', 'parts']) {
        await p.click(`[data-mode=${m}]`); await p.waitForTimeout(1100);
        await p.screenshot({ path: `${out}/${tag}-${kind.toLowerCase()}-${m}.png` });
      }
      await p.click('.file-top a.btn'); await p.waitForSelector('.content-head');
    }
    await ctx.close();
  }
  await b.close();
})();
