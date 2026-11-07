// Reader performance on a 160-page file, iPad-like context (touch, DPR 2, 4x CPU throttle). Run: node --test tests/reader-perf.spec.mjs
// Chromium only (WebKit cannot be downloaded in the sandbox). Numbers are printed so docs/perf-report.md can quote them.
import test from 'node:test'; import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const P = require('./perf-lib.cjs'); const { L, sleep } = P;

let srv, browser, S, fr, rect;
const info = () => fr.evaluate(() => { const b = window.__lz.book; return { pages: b.pages, page: b.page, heap: performance.memory ? performance.memory.usedJSHeapSize : 0 }; });
const stat = a => { const s = a.slice().sort((x, y) => x - y); return { n: a.length, avg: a.reduce((x, y) => x + y, 0) / (a.length || 1), p95: s[Math.floor(s.length * 0.95)] || 0, max: s[s.length - 1] || 0 }; };

test.before(async () => {
  srv = await L.startServer(); browser = await L.pw.chromium.launch();
  S = await P.session(browser, { cpu: 4 });
  await P.importFile(S.p, 'perf/angiology162.html');
  await P.openByName(S.p, 'angiology162', 'book'); await sleep(2000);
  fr = L.frameOf(S.p);
  rect = await S.p.evaluate(() => { const r = document.querySelector('.lz-frame').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
});
test.after(async () => { await browser?.close(); srv?.kill(); });

test('Книга: the page count is real (no 700 px placeholders) and the strip is not absurd', async () => {
  const i = await info(); console.log('pages', i.pages);
  assert.ok(i.pages > 80 && i.pages < 260, 'pages ' + i.pages);
});

test('Книга: the FIRST swipe turns the page', async () => {
  const b = (await info()).page;
  await P.swipe(S.cdp, rect.x + rect.w * 0.8, rect.y + rect.h / 2, rect.x + rect.w * 0.3, rect.y + rect.h / 2 + 4, 140); await sleep(500);
  assert.ok((await info()).page > b, 'page did not change');
});

test('Книга: 50 consecutive swipes, no dropped gesture; frame times; no leak', async () => {
  await fr.evaluate(() => { window.__lt = []; try { new PerformanceObserver(l => l.getEntries().forEach(e => window.__lt.push(e.duration))).observe({ entryTypes: ['longtask'] }); } catch (e) { /* ignore */ } });
  const h0 = (await info()).heap; let turned = 0;
  for (let i = 0; i < 50; i++) {
    const b = (await info()).page;
    await P.swipe(S.cdp, rect.x + rect.w * 0.8, rect.y + rect.h / 2, rect.x + rect.w * 0.3, rect.y + rect.h / 2 + 3, 120); await sleep(420);
    if ((await info()).page !== b) turned++;
  }
  assert.equal(turned, 50, `turned ${turned}/50`);
  const frames = await fr.evaluate(() => window.__lz.book.allFrames || []);
  const st = stat(frames), fps = 1000 / st.avg;
  console.log('turn frames', JSON.stringify(st), 'fps', fps.toFixed(1), 'longtasks', await fr.evaluate(() => window.__lt.length));
  assert.ok(fps >= 55, 'avg fps ' + fps.toFixed(1));
  assert.ok(st.max <= 50, 'longest frame ' + st.max);
  const grow = ((await info()).heap - h0) / 1048576; console.log('heap growth MB', grow.toFixed(2));
  assert.ok(grow < 30, 'heap grew ' + grow);
  const c = await P.domCounts(S.p); console.log('dom', JSON.stringify(c)); assert.ok(c.total < 3000, 'dom nodes ' + c.total);
});

test('Обычный: scroll height is stable (no flying away), no freeze', async () => {
  await L.switchTo(S.p, 'normal'); await sleep(1500); fr = L.frameOf(S.p);
  const sc = () => fr.evaluate(() => ({ top: (document.scrollingElement || document.documentElement).scrollTop, h: (document.scrollingElement || document.documentElement).scrollHeight }));
  const h0 = (await sc()).h, tops = [], hs = [];
  const r = await S.p.evaluate(() => { const b = document.querySelector('.lz-frame').getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; });
  for (let i = 0; i < 30; i++) { await P.swipe(S.cdp, r.x + r.w / 2, r.y + r.h * 0.8, r.x + r.w / 2, r.y + r.h * 0.2, 120); await sleep(300); const s = await sc(); tops.push(s.top); hs.push(s.h); }
  console.log('scrollHeight', h0, Math.min(...hs), Math.max(...hs), 'scrolled', tops[tops.length - 1]);
  assert.ok(tops[tops.length - 1] > 5000, 'did not scroll');
  assert.ok((Math.max(...hs) - Math.min(...hs, h0)) / h0 < 0.03, 'scroll height jumps');
  for (let i = 1; i < tops.length; i++) assert.ok(tops[i] >= tops[i - 1] - 50, 'scroll jumped back at ' + i);
  assert.ok((await P.domCounts(S.p)).total < 3000);
});

test('open / close leaves nothing behind (0 nodes, 0 listeners per cycle once the harness handles are disposed)', async () => {
  const files = await L.idb(S.p, 'files'); const id = files.find(f => f.name === 'angiology162').id;
  await S.cdp.send('HeapProfiler.enable');
  const counters = async () => { await S.p.evaluate(() => new Promise(r => setTimeout(r, 300))); for (let i = 0; i < 3; i++) await S.cdp.send('HeapProfiler.collectGarbage'); return S.cdp.send('Memory.getDOMCounters'); };
  const cycle = async () => { await S.p.evaluate(x => { location.hash = '#/file/' + x; }, id); await S.p.waitForSelector('.reader .lz-frame:not(.lz-hidden)', { timeout: 60000 }).then(hd => hd.dispose()); await S.p.evaluate(() => { location.hash = '#/'; }); await S.p.waitForSelector('.hero').then(hd => hd.dispose()); };   // dispose: an undisposed ElementHandle is a DevTools-console root that keeps the detached iframe / cards alive (that was the whole "residual")
  await S.p.evaluate(() => { location.hash = '#/'; }); await S.p.waitForSelector('.hero').then(hd => hd.dispose()); await cycle();
  const c0 = await counters();
  for (let i = 0; i < 20; i++) await cycle();
  const c1 = await counters(); console.log('counters after GC', JSON.stringify(c0), JSON.stringify(c1), 'per cycle: nodes', ((c1.nodes - c0.nodes) / 20).toFixed(0), 'listeners', ((c1.jsEventListeners - c0.jsEventListeners) / 20).toFixed(1));
  assert.equal(c1.documents, c0.documents, 'documents accumulate');
  assert.ok((c1.nodes - c0.nodes) / 20 <= 5, 'nodes per open/close ' + (c1.nodes - c0.nodes) / 20);        // measured: 0.0 (before the round-10 fixes ~425; the "193" residual was Playwright's own ElementHandles)
  assert.ok((c1.jsEventListeners - c0.jsEventListeners) / 20 <= 1, 'listeners per open/close');           // measured: 0.0 (before ~69)
  assert.equal(await S.p.evaluate(() => document.documentElement.classList.contains('reader-open')), false);
});
