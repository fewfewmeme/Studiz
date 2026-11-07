// Reader performance measurements (iPad-like context, 4x CPU throttle). Usage: node tests/perf-measure.cjs <label> [file]  → prints JSON.
// The same script ran on the code before the fix (label "before") and after ("after"); numbers go to docs/perf-report.md.
const P = require('./perf-lib.cjs'); const { L, sleep } = P;
const file = process.argv[3] || 'angiology162.html'; const name = file.replace(/\.[^.]+$/, '');
const STAT = a => { if (!a.length) return { n: 0 }; const s = a.slice().sort((x, y) => x - y); return { n: a.length, avg: +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(1), p95: +s[Math.floor(s.length * 0.95)].toFixed(1), max: +s[s.length - 1].toFixed(1) }; };
(async () => {
  const srv = await L.startServer(); const browser = await L.pw.chromium.launch();
  const { p, cdp, logs } = await P.session(browser, { cpu: 4 });
  const out = { label: process.argv[2] || 'run', file, cpu: 4, viewport: '1180x820@2x iPad UA' };
  await P.importFile(p, 'perf/' + file);
  // ---------- Книга ----------
  await P.openByName(p, name, 'book'); await sleep(2000);
  let fr = L.frameOf(p);
  const info = () => fr.evaluate(() => { const b = window.__lz.book; return { pages: b.pages, page: b.page, sw: document.body.scrollWidth, nodes: document.getElementsByTagName('*').length, heap: performance.memory ? performance.memory.usedJSHeapSize : 0 }; });
  out.book = { ...(await info()), counts: await P.domCounts(p) };
  const rect = await p.evaluate(() => { const r = document.querySelector('.lz-frame').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
  await fr.evaluate(() => { window.__fr = []; window.__lt = []; try { new PerformanceObserver(l => l.getEntries().forEach(e => window.__lt.push(e.duration))).observe({ entryTypes: ['longtask'] }); } catch (e) { /* ignore */ } let last = performance.now(); (function loop(n) { window.__fr.push(n - last); last = n; requestAnimationFrame(loop); })(last); });
  const m0 = await P.metrics(cdp); const h0 = (await info()).heap;
  // 1) 20 touch swipes through the browser's input pipeline
  let swiped = 0; const turnMs = [];
  for (let i = 0; i < 20; i++) { const b = (await info()).page; const t = Date.now(); await P.swipe(cdp, rect.x + rect.w * 0.8, rect.y + rect.h * 0.5, rect.x + rect.w * 0.3, rect.y + rect.h * 0.5 + 4, 140); await sleep(450); if ((await info()).page !== b) { swiped++; turnMs.push(Date.now() - t - 450); } }
  out.book.swipes = { tried: 20, turned: swiped };
  // 2) 50 consecutive swipes (backward and forward alternating in chunks) spaced longer than the animation: no gesture may be lost
  let turned50 = 0; const p0 = (await info()).page;
  for (let i = 0; i < 50; i++) { const b = (await info()).page; await P.swipe(cdp, rect.x + rect.w * 0.8, rect.y + rect.h * 0.5, rect.x + rect.w * 0.3, rect.y + rect.h * 0.5 + 3, 120); await sleep(420); if ((await info()).page !== b) turned50++; }
  out.book.consecutive50 = { turned: turned50, of: 50, startPage: p0 };
  const m1 = await P.metrics(cdp); const i1 = await info();
  out.book.layoutMsPerTurn = +((m1.LayoutDuration - m0.LayoutDuration) / 70 * 1000).toFixed(2);
  out.book.recalcMsPerTurn = +((m1.RecalcStyleDuration - m0.RecalcStyleDuration) / 70 * 1000).toFixed(2);
  out.book.scriptMsPerTurn = +((m1.ScriptDuration - m0.ScriptDuration) / 70 * 1000).toFixed(2);
  out.book.heapGrowthMB = +((i1.heap - h0) / 1048576).toFixed(2);
  const fst = await fr.evaluate(() => ({ fr: window.__fr.slice(5), lt: window.__lt, turns: window.__lz.book.allFrames || [] }));
  out.book.frameMs = STAT(fst.turns); out.book.rafMs = STAT(fst.fr); out.book.longTasks = STAT(fst.lt);
  out.book.fpsDuringTurns = fst.turns.length ? +(1000 / (fst.turns.reduce((a, b) => a + b, 0) / fst.turns.length)).toFixed(1) : null;
  // ---------- Обычный ----------
  await L.switchTo(p, 'normal'); await sleep(1500); fr = L.frameOf(p);
  const sc = () => fr.evaluate(() => ({ top: (document.scrollingElement || document.documentElement).scrollTop, h: (document.scrollingElement || document.documentElement).scrollHeight, ch: innerHeight }));
  const a = await sc(); out.normal = { scrollHeight0: a.h, counts: await P.domCounts(p) };
  await fr.evaluate(() => { window.__lt = []; try { new PerformanceObserver(l => l.getEntries().forEach(e => window.__lt.push(e.duration))).observe({ entryTypes: ['longtask'] }); } catch (e) { /* ignore */ } });
  const tops = [], heights = []; const rect2 = await p.evaluate(() => { const r = document.querySelector('.lz-frame').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
  for (let i = 0; i < 40; i++) { await P.swipe(cdp, rect2.x + rect2.w / 2, rect2.y + rect2.h * 0.8, rect2.x + rect2.w / 2, rect2.y + rect2.h * 0.2, 120); await sleep(350); const s = await sc(); tops.push(s.top); heights.push(s.h); }
  let jumps = 0; for (let i = 1; i < tops.length; i++) if (tops[i] < tops[i - 1] - 50) jumps++;
  out.normal.scrolledPx = tops[tops.length - 1]; out.normal.backwardJumps = jumps; out.normal.scrollHeightMin = Math.min(...heights); out.normal.scrollHeightMax = Math.max(...heights);
  out.normal.longTasks = STAT(await fr.evaluate(() => window.__lt));
  out.normal.nodesAfter = (await P.domCounts(p)).total;
  out.logs = logs.slice(0, 5);
  console.log(JSON.stringify(out, null, 1));
  await browser.close(); srv.kill();
})().catch(e => { console.error(e); process.exit(1); });
