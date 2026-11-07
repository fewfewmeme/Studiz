// Shared helpers for the Playwright suite. Engines: Chromium by default; WEBKIT=1 adds WebKit when installed.
const { spawn, execFileSync } = require('child_process');
const path = require('path'), fs = require('fs');
const pw = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const FX = f => path.join(ROOT, 'tests', 'fixtures', f);
const PORT = 8123;
const URL = `http://localhost:${PORT}/app/`;
const OUT = path.join(ROOT, 'qa', 'after3');
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

const results = { passed: 0, failed: 0, failures: [] };
function ok(name, cond, extra) {
  if (cond) { results.passed++; console.log('  ✓', name); }
  else { results.failed++; results.failures.push(name); console.log('  ✗', name, extra !== undefined ? '→ ' + JSON.stringify(extra) : ''); }
}

async function startServer() {
  try { execFileSync('node', [path.join(ROOT, 'tools', 'build-sw.mjs')], { stdio: 'ignore' }); } catch { /* ignore */ }
  const srv = spawn('node', [path.join(ROOT, 'tools', 'serve.cjs'), String(PORT)], { stdio: 'ignore' });
  await sleep(800);
  return srv;
}

async function newSession(browser, vp, { sw = false, touch = true, clock = false, theme = null, tour = false } = {}) {
  const ctx = await browser.newContext({ viewport: vp, serviceWorkers: sw ? 'allow' : 'block', hasTouch: touch, acceptDownloads: true });
  const p = await ctx.newPage();
  const logs = [];
  p.on('console', m => { if (m.type() === 'error' && !/Content Security Policy|Refused to (load|connect|apply)/.test(m.text())) logs.push('console.error: ' + m.text()); });
  p.on('pageerror', e => { if (!/serviceWorker. property from .Navigator/.test(e.message)) logs.push('pageerror: ' + e.message); });
  p.on('response', r => { if (r.status() >= 400) logs.push('HTTP ' + r.status() + ' ' + r.url()); });
  if (!tour) await p.addInitScript(() => { try { localStorage.setItem('noTour', '1'); } catch (e) { /* ignore */ } });
  if (clock) await p.clock.install({ time: new Date('2026-11-05T10:00:00') });
  if (theme) await p.addInitScript(t => { try { localStorage.setItem('theme', t); } catch (e) { /* ignore */ } }, theme);
  await p.goto(URL);
  await p.waitForSelector('.splash, .hero', { timeout: 20000 });
  if (await p.$('.splash')) { await p.click('.splash .btn'); await p.waitForSelector('.splash-overlay', { state: 'detached', timeout: 5000 }).catch(() => {}); }
  await p.waitForSelector('.hero');
  return { ctx, p, logs };
}

async function openSubject(p, name) { await p.evaluate(() => { location.hash = '#/'; }); await p.waitForSelector('.subject-card'); await p.click(`.subject-card:has(strong:text-is("${name}"))`); await p.waitForSelector('.subj-hero'); }
async function importFiles(p, files) {
  const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.click('.hero-actions .btn-primary')]);
  await fc.setFiles(files.map(FX));
  // the import may ask questions (which subject? a new version?): the helper always keeps files where they are
  const t0 = Date.now(); await sleep(400);
  while (Date.now() - t0 < 180000) {
    if (await p.$('.modal:has-text("Какой предмет")')) { await p.click('.modal .btn:has-text("Оставить здесь")'); await sleep(300); continue; }
    if (await p.$('.modal:has-text("Есть новая версия")')) { await p.click('.modal .btn:has-text("Добавить как отдельный")'); await sleep(300); continue; }
    if (await p.$('.modal:has-text("Этот файл уже есть")')) { await p.click('.modal .btn:has-text("Всё равно добавить")'); await sleep(300); continue; }
    if (await p.$('.modal:has-text("в Корзине")')) { await p.click('.modal .btn:has-text("Добавить как новый")'); await sleep(300); continue; }
    if (await p.$('.progress-bar')) { await sleep(150); continue; }
    if (await p.$('.modal, .toast')) break;
    await sleep(150);
  }
  if (await p.$('.modal .btn-primary')) await p.click('.modal .btn-primary');
  await p.waitForSelector('.doc-card');
}
// answers the duplicate / subject questions of an import until the final alert (an error summary) or a toast shows up
async function answerImportDialogs(p, timeout = 180000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if (await p.$('.modal:has-text("Какой предмет")')) { await p.click('.modal .btn:has-text("Оставить здесь")'); await sleep(300); continue; }
    if (await p.$('.modal:has-text("Есть новая версия")')) { await p.click('.modal .btn:has-text("Добавить как отдельный")'); await sleep(300); continue; }
    if (await p.$('.modal:has-text("Этот файл уже есть")')) { await p.click('.modal .btn:has-text("Всё равно добавить")'); await sleep(300); continue; }
    if (await p.$('.modal:has-text("в Корзине")')) { await p.click('.modal .btn:has-text("Добавить как новый")'); await sleep(300); continue; }
    if (await p.$('.progress-bar')) { await sleep(150); continue; }
    if (await p.$('.modal:has-text("Не все файлы"), .toast')) return;
    await sleep(150);
  }
}
const card = (p, name, badge) => p.locator(`.doc-card:has(.doc-title:text-is("${name}"))${badge ? `:has(.cover-type:text-is("${badge}"))` : ''}`).first();
async function openDoc(p, name, badge, mode) {
  await card(p, name, badge).click();
  await p.waitForSelector('.reader');
  await p.waitForFunction(() => window.__reader && window.__reader.doc() && window.__reader.doc().mode, null, { timeout: 30000 });
  if (mode) { await p.click(`[data-mode=${mode}]`); }
  await p.waitForFunction(() => !document.querySelector('.rd-stage.swap') && !document.querySelector('.rd-loading'), null, { timeout: 30000 });
  await sleep(700);
}
async function selectText(p, sel, from, to, nth = 0) {
  await p.evaluate(([sel, from, to, nth]) => {
    const el = document.querySelectorAll(sel)[nth];
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let pos = 0, n, sN = null, sO = 0, eN = null, eO = 0;
    while ((n = w.nextNode())) {
      const len = n.data.length;
      if (!sN && from < pos + len) { sN = n; sO = from - pos; }
      if (!eN && to <= pos + len) { eN = n; eO = to - pos; break; }
      pos += len;
    }
    if (!eN) { eN = sN; eO = sN.data.length; }
    const r = document.createRange(); r.setStart(sN, sO); r.setEnd(eN, eO);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  }, [sel, from, to, nth]);
}
// ---- Round 7: the document lives in a sandboxed frame ----
const frameOf = p => p.frames().find(f => f.url().startsWith('blob:') || (f.parentFrame() && f !== p.mainFrame() && f.url() === 'about:srcdoc'));
async function waitFrameReady(p, timeout = 30000) {
  await p.waitForSelector('.reader .lz-frame:not(.lz-hidden)', { timeout });
  await p.waitForFunction(() => document.querySelectorAll('.reader .lz-frame').length === 1, null, { timeout });
  await p.waitForFunction(() => window.__reader && window.__reader.doc() && window.__reader.doc().mode && window.__reader.doc().host && window.__reader.doc().host.ready, null, { timeout });
  await sleep(500);
}
async function frameSelect(p, sel, from, to, nth = 0) {
  const fr = frameOf(p);
  await fr.evaluate(([sel, from, to, nth]) => {
    const el = document.querySelectorAll(sel)[nth];
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let pos = 0, n, sN = null, sO = 0, eN = null, eO = 0;
    while ((n = w.nextNode())) { const len = n.data.length; if (!sN && from < pos + len) { sN = n; sO = from - pos; } if (!eN && to <= pos + len) { eN = n; eO = to - pos; break; } pos += len; }
    if (!eN) { eN = sN; eO = sN.data.length; }
    const r = document.createRange(); r.setStart(sN, sO); r.setEnd(eN, eO);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  }, [sel, from, to, nth]);
}
async function openFile(p, name, badge, mode) {
  await card(p, name, badge).click();
  await p.waitForSelector('.reader');
  await p.waitForFunction(() => window.__reader && window.__reader.doc() && window.__reader.doc().mode, null, { timeout: 30000 });
  if (mode) await switchTo(p, mode);
  await waitFrameReady(p);
}
async function switchTo(p, mode) {
  await p.evaluate(m => document.querySelector(`.reader [data-mode=${m}]`).click(), mode);
  await sleep(300);
  await waitFrameReady(p);
}
async function idb(p, store, key) {
  return p.evaluate(([store, key]) => new Promise((res, rej) => {
    const q = indexedDB.open('konspekty');
    q.onsuccess = () => {
      const os = q.result.transaction(store).objectStore(store);
      const g = key ? os.get(key) : os.getAll();
      g.onsuccess = () => { q.result.close(); res(JSON.parse(JSON.stringify(g.result, (k, v) => (v instanceof Blob ? { blob: v.size } : v)))); };
      g.onerror = () => rej(g.error);
    };
  }), [store, key]);
}
const reload = async p => { await p.reload(); await p.waitForSelector('#view > .view > *'); };
const store = (p, expr) => p.evaluate(`(() => { const s = window.__reader.store; return ${expr}; })()`);

module.exports = { frameOf, waitFrameReady, frameSelect, openFile, switchTo, answerImportDialogs, pw, ROOT, FX, PORT, URL, OUT, sleep, ok, results, startServer, newSession, openSubject, importFiles, card, openDoc, selectText, idb, reload, store };
