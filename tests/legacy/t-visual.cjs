// Check 8: screenshot sets for 3 themes x (home, subject, reader normal, book, blocks) x 3 sizes + accessibility smoke checks.
const L = require('./lib.cjs');
const { ok, sleep } = L;
const THEMES = [['cyan', 'Цианотипия'], ['deep', 'Глубина'], ['rose', 'Роза']];
const SIZES = [[1180, 820], [820, 1180], [390, 844]];

const contrastCode = () => {
  const parse = c => {
    const m = (c.match(/-?[\d.]+(?:e-?\d+)?/g) || ['0', '0', '0']).map(Number);
    if (/^color\(/.test(c)) return { r: m[0] * 255, g: m[1] * 255, b: m[2] * 255, a: m.length > 3 ? m[3] : 1 };
    return { r: m[0], g: m[1], b: m[2], a: m.length > 3 ? m[3] : 1 };
  };
  const gradFirst = e => { const bi = getComputedStyle(e).backgroundImage; const m = /(rgba?\([^)]*\)|color\([^)]*\))/.exec(bi); return m ? parse(m[1]) : null; };
  const over = (top, bot) => ({ r: top.r * top.a + bot.r * (1 - top.a), g: top.g * top.a + bot.g * (1 - top.a), b: top.b * top.a + bot.b * (1 - top.a), a: 1 });
  const lum = c => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }; return .2126 * f(c.r) + .7152 * f(c.g) + .0722 * f(c.b); };
  return (el) => {
    let bg = parse(getComputedStyle(document.documentElement).backgroundColor); bg.a = 1;
    const chain = []; for (let e = el; e; e = e.parentElement) chain.unshift(e);
    for (const e of chain) { let c = parse(getComputedStyle(e).backgroundColor); if (c.a === 0) c = gradFirst(e) || c; if (c.a > 0) bg = over(c, bg); }
    let fg = parse(getComputedStyle(el).color); fg = over(fg, bg);
    const a = lum(fg), b = lum(bg);
    return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
  };
};

async function setTheme(p, label) {
  await p.evaluate(() => { location.hash = '#/settings'; }); await p.waitForSelector('.theme-card');
  await p.click(`.theme-card:has(strong:text-is("${label}"))`); await sleep(350);
}

async function run(browser) {
  console.log('\n=== Visual QA (screenshots in qa/after) + accessibility ===');
  const a11yFail = [];
  for (const [theme, label] of THEMES) {
    const { ctx, p, logs } = await L.newSession(browser, { width: 1180, height: 820 });
    await L.openSubject(p, 'Анатомия');
    await L.importFiles(p, ['sample.html', 'sample.pdf', 'small.html']);
    await setTheme(p, label);
    for (const [w, h] of SIZES) {
      await p.setViewportSize({ width: w, height: h }); await sleep(500);
      const tag = `${theme}-${w}x${h}`;
      await p.evaluate(() => { location.hash = '#/'; }); await p.waitForSelector('.subject-card'); await sleep(1800);
      await p.screenshot({ path: `${L.OUT}/${tag}-home.png` });
      await p.evaluate(() => { location.hash = '#/subject/anatomy'; }); await p.waitForSelector('.doc-card'); await sleep(2200);
      await p.screenshot({ path: `${L.OUT}/${tag}-subject.png` });
      await p.click('.doc-card:has(.cover-type:text-is("HTML")):has(.doc-title:text-is("sample"))');
      await p.waitForSelector('.reader'); await p.waitForFunction(() => window.__reader && window.__reader.doc() && window.__reader.doc().mode); await sleep(900);
      // some marks so the reader looks real
      if (theme === 'cyan' && w === 1180) {
        await L.selectText(p, '.doc p', 10, 60, 1); await p.waitForSelector('.pill.show'); await p.click('.pill .pbtn.main'); await sleep(250);
        await p.evaluate(() => window.__reader.tools.set({ color: 2 })); await L.selectText(p, '.doc p', 120, 190, 2); await p.waitForSelector('.pill.show'); await p.click('.pill .pbtn.main'); await sleep(250);
        await L.selectText(p, '.doc p', 200, 260, 2); await p.waitForSelector('.pill.show'); await p.click('.pill .pbtn >> nth=1'); await sleep(250);
        await p.evaluate(() => window.__reader.tools.set({ color: 1 }));
      }
      await p.screenshot({ path: `${L.OUT}/${tag}-reader-normal.png` });
      if (w === 1180 && theme === 'cyan') {
        await L.selectText(p, '.doc p', 300, 340, 3); await p.waitForSelector('.pill.show'); await sleep(450);
        await p.screenshot({ path: `${L.OUT}/${tag}-selection-pill.png` });
        await p.evaluate(() => getSelection().removeAllRanges()); await sleep(300);
        await p.click('[data-id=marker]'); await p.waitForSelector('.popover'); await sleep(350);
        await p.screenshot({ path: `${L.OUT}/${tag}-marker-popover.png` });
        await p.evaluate(() => { window.__reader.tools.set({ tool: 'none' }); }); await p.mouse.click(600, 300);
      }
      for (const m of ['book', 'blocks']) {
        await p.click(`[data-mode=${m}]`); await sleep(1700);
        await p.screenshot({ path: `${L.OUT}/${tag}-reader-${m}.png` });
      }
      if (w === 1180) {
        // accessibility smoke on the blocks view of this theme
        const names = await p.evaluate(() => [...document.querySelectorAll('button, a[href], input, textarea')].filter(e => e.offsetParent !== null || getComputedStyle(e).position === 'fixed').filter(e => !(e.getAttribute('aria-label') || e.textContent.trim() || e.getAttribute('title') || e.labels?.length)).map(e => e.outerHTML.slice(0, 80)));
        ok(`[${theme}] у всех кнопок и ссылок есть название (читалка)`, names.length === 0, names.slice(0, 5));
        const small = await p.evaluate(() => [...document.querySelectorAll('button, a[href], .seg-btn, input[type=range]')].filter(e => e.offsetParent !== null && !e.closest('.doc')).map(e => { const r = e.getBoundingClientRect(); return { t: (e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 18), w: Math.round(r.width), h: Math.round(r.height) }; }).filter(b => (b.h < 36 || b.w < 36) && b.w > 0));
        ok(`[${theme}] цели нажатия не меньше ~40 px (блоки)`, small.length === 0, small.slice(0, 6));
      }
      await p.click('.rd-back'); await p.waitForSelector('.doc-card'); await sleep(200);
    }
    await p.setViewportSize({ width: 1180, height: 820 }); await sleep(300);
    for (const [route, sel, nm] of [['#/settings', '.theme-card', 'settings'], ['#/check', '.receipt', 'check']]) {
      await p.evaluate(r => { location.hash = r; }, route); await p.waitForSelector(sel); await sleep(1300);
      await p.screenshot({ path: `${L.OUT}/${theme}-1180x820-${nm}.png` });
    }
    // contrast on glass panels / text, desktop size
    await p.setViewportSize({ width: 1180, height: 820 }); await sleep(300);
    await p.evaluate(() => { location.hash = '#/'; }); await p.waitForSelector('.subject-card'); await sleep(900);
    const src = '(' + contrastCode.toString() + ')()';
    const rr = await p.evaluate(([src, sel]) => { const fn = eval(src); return sel.map(s => { const e = document.querySelector(s); return [s, e ? Math.round(fn(e) * 10) / 10 : null]; }); }, [src, ['.hero .eyebrow', '.hero .sub', '.stat small', '.stat strong', '.subject-card strong', '.subject-card small', '.side-link.active', '.side-link:not(.active)', '.btn-primary', '.sec-head h2']]).catch(e => [['error', String(e)]]);
    console.log(`    [${theme}] contrast:`, JSON.stringify(rr));
    for (const [s, r] of rr) if (r != null && r < 4.5) a11yFail.push(`${theme} ${s}: ${r}`);
    ok(`нет console.error (${theme})`, logs.length === 0, logs);
    await ctx.close();
  }
  ok('контраст основного текста на панелях ≥ 4.5:1 во всех темах', a11yFail.length === 0, a11yFail);
}
module.exports = { run };
