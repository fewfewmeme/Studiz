// Helpers for the reader performance / layout tests: iPad-like context (touch, DPR 2, mobile), CPU throttling, CDP touch swipes,
// frame-time sampling, DOM / heap counters. Chromium only (WebKit cannot be downloaded in the sandbox; use WEBKIT=1 where available).
const L = require('./lib.cjs');
const sleep = L.sleep;
const IPAD_UA = 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

async function session(browser, { width = 1180, height = 820, cpu = 4, dpr = 2 } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, hasTouch: true, isMobile: true, deviceScaleFactor: dpr, userAgent: IPAD_UA, serviceWorkers: 'block', acceptDownloads: true });
  const p = await ctx.newPage();
  const logs = [];
  p.on('console', m => { if (m.type() === 'error' && !/Content Security Policy|Refused to (load|connect|apply)/.test(m.text())) logs.push('console.error: ' + m.text()); });
  p.on('pageerror', e => { if (!/serviceWorker. property from .Navigator/.test(e.message)) logs.push('pageerror: ' + e.message); });
  await p.addInitScript(() => { try { localStorage.setItem('noTour', '1'); sessionStorage.setItem('splashed', '1'); } catch (e) { /* ignore */ } });
  const cdp = await ctx.newCDPSession(p);
  await cdp.send('Performance.enable');
  if (cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
  await p.goto(L.URL);
  await p.waitForSelector('.hero', { timeout: 30000 });
  return { ctx, p, cdp, logs };
}
async function importFile(p, rel) {
  await L.openSubject(p, 'Анатомия');
  await L.importFiles(p, [rel]);
}
async function openByName(p, name, mode) {
  const files = await L.idb(p, 'files'); const meta = files.find(f => f.name === name);
  await p.evaluate(id => { location.hash = '#/file/' + id; }, meta.id);
  await p.waitForSelector('.reader'); await p.waitForFunction(() => window.__reader && window.__reader.doc() && window.__reader.doc().mode, null, { timeout: 60000 });
  if (mode) await L.switchTo(p, mode); else await L.waitFrameReady(p);
  return meta;
}
async function metrics(cdp) {
  const { metrics } = await cdp.send('Performance.getMetrics'); const o = {}; for (const m of metrics) o[m.name] = m.value; return o;
}
// real touch swipe through the browser's input pipeline (so touch-action / pointercancel behave like on a device)
async function swipe(cdp, x0, y0, x1, y1, ms = 160, steps = 8) {
  const pt = (x, y) => [{ x, y, id: 1, radiusX: 4, radiusY: 4, force: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(x0, y0) });
  for (let i = 1; i <= steps; i++) { await sleep(ms / steps); await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps) }); }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
async function tapAt(cdp, x, y) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
  await sleep(40); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
// counts of nodes in the app document and in the document frame
async function domCounts(p) {
  const app = await p.evaluate(() => ({ nodes: document.getElementsByTagName('*').length, imgs: document.images.length, canvases: document.getElementsByTagName('canvas').length, iframes: document.getElementsByTagName('iframe').length }));
  const fr = L.frameOf(p);
  const doc = fr ? await fr.evaluate(() => ({ nodes: document.getElementsByTagName('*').length, imgs: document.images.length, canvases: document.getElementsByTagName('canvas').length })).catch(() => ({ nodes: 0, imgs: 0, canvases: 0 })) : { nodes: 0, imgs: 0, canvases: 0 };
  return { app, doc, total: app.nodes + doc.nodes };
}
module.exports = { session, importFile, openByName, metrics, swipe, tapAt, domCounts, sleep, L };
