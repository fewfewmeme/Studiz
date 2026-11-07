// Layout of the reader: the spread fits the viewport in every orientation / size, no strip under the controls, no scroll lock left behind,
// corrupted saved view state does not break opening. Run: node --test tests/reader-layout.spec.mjs
import test from 'node:test'; import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const P = require('./perf-lib.cjs'); const { L, sleep } = P;

let srv, browser, S, id;
test.before(async () => {
  srv = await L.startServer(); browser = await L.pw.chromium.launch();
  S = await P.session(browser, { cpu: 1 });
  await P.importFile(S.p, 'perf/angiology162.html');
  id = (await L.idb(S.p, 'files')).find(f => f.name === 'angiology162').id;
});
test.after(async () => { await browser?.close(); srv?.kill(); });

const open = async mode => { await S.p.evaluate(x => { location.hash = '#/file/' + x; }, id); await S.p.waitForSelector('.reader'); await S.p.waitForFunction(() => window.__reader?.doc()?.mode, null, { timeout: 60000 }); await L.switchTo(S.p, mode); await sleep(500); };
// everything that must hold in every layout
async function check(label) {
  const app = await S.p.evaluate(() => { const r = document.querySelector('.reader').getBoundingClientRect(), pg = document.querySelector('.fr-pager'), pr = pg && !pg.hidden ? pg.getBoundingClientRect() : null; return { w: innerWidth, h: innerHeight, reader: [r.left, r.top, r.right, r.bottom], pager: pr && [pr.left, pr.top, pr.right, pr.bottom], sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight }; });
  assert.deepEqual(app.reader.map(Math.round), [0, 0, app.w, app.h], label + ': reader must fill the viewport');
  assert.ok(app.sw <= app.w, label + ': horizontal overflow ' + app.sw + ' > ' + app.w);
  if (app.pager) { assert.ok(app.pager[3] <= app.h && app.pager[0] >= 0 && app.pager[2] <= app.w, label + ': pager outside the screen ' + app.pager); assert.ok(app.h - app.pager[3] < 80, label + ': empty strip under the controls ' + (app.h - app.pager[3])); }
  const fr = L.frameOf(S.p);
  const g = await fr.evaluate(() => { const b = window.__lz.book; return b ? { left: b.g.left, top: b.g.top, spreadW: b.g.spreadW, pageH: b.g.pageH, iw: innerWidth, ih: innerHeight } : null; });
  if (g) { assert.ok(g.left >= 0 && g.left + g.spreadW <= g.iw + 0.5, `${label}: spread ${g.left}+${g.spreadW} > ${g.iw}`); assert.ok(g.top >= 0 && g.top + g.pageH <= g.ih + 0.5, `${label}: spread height ${g.top}+${g.pageH} > ${g.ih}`); }
}

for (const [w, h, name] of [[1180, 820, 'iPad landscape'], [820, 1180, 'iPad portrait'], [1366, 1024, 'iPad Pro landscape'], [1000, 700, 'small landscape'], [390, 844, 'iPhone']]) {
  test(`Книга fits: ${name} ${w}x${h}`, async () => { await S.p.setViewportSize({ width: w, height: h }); await open('book'); await check(name); });
}
test('orientation change keeps the layout', async () => {
  await S.p.setViewportSize({ width: 1180, height: 820 }); await open('book'); await check('land');
  await S.p.setViewportSize({ width: 820, height: 1180 }); await sleep(900); await L.waitFrameReady(S.p); await check('after rotate to portrait');
  await S.p.setViewportSize({ width: 1180, height: 820 }); await sleep(900); await check('after rotate back');
});
test('a page zoomed by Safari (visual viewport scale 1.6) does not shrink the reader', async () => {
  await S.p.setViewportSize({ width: 1180, height: 820 }); await open('book');
  await S.cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1.6 }); await sleep(600);
  const r = await S.p.evaluate(() => { const b = document.querySelector('.reader').getBoundingClientRect(); return [b.width, b.height, innerWidth, innerHeight, visualViewport.scale]; });
  assert.equal(Math.round(r[0]), r[2]); assert.equal(Math.round(r[1]), r[3]);
  await S.cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });
});
test('Normal → Book → Blocks → Normal ×10 and open / close ×20: layout correct every time, scroll lock released', async () => {
  await S.p.setViewportSize({ width: 1180, height: 820 }); await open('normal');
  for (let i = 0; i < 10; i++) for (const m of ['book', 'blocks', 'normal']) { await L.switchTo(S.p, m); if (i % 5 === 0) await check(`cycle ${i} ${m}`); }
  await L.switchTo(S.p, 'book'); await check('after mode cycles');
  for (let i = 0; i < 20; i++) { await S.p.evaluate(() => { location.hash = '#/'; }); await S.p.waitForSelector('.hero'); await S.p.evaluate(x => { location.hash = '#/file/' + x; }, id); await S.p.waitForSelector('.reader .lz-frame:not(.lz-hidden)', { timeout: 60000 }); }
  await sleep(700); await check('after 20 open/close');
  await S.p.evaluate(() => { location.hash = '#/'; }); await S.p.waitForSelector('.hero');
  const lock = await S.p.evaluate(() => ({ cls: document.documentElement.classList.contains('reader-open'), ov: getComputedStyle(document.documentElement).overflow, bodyOv: getComputedStyle(document.body).overflow, ta: getComputedStyle(document.documentElement).touchAction }));
  assert.equal(lock.cls, false); assert.notEqual(lock.bodyOv, 'hidden');
});
test('garbage in every saved view-state key: reload still opens cleanly with defaults', async () => {
  await open('book');
  await S.p.evaluate(async x => {
    const q = indexedDB.open('konspekty'); await new Promise(r => { q.onsuccess = r; });
    const tx = q.result.transaction('kv', 'readwrite'), os = tx.objectStore('kv');
    const junk = [NaN, 'x', { zoom: { book: 'NaN', normal: 9e9, blocks: -4 }, width: 5, family: {}, weight: null }, { anchor: { off: -1, quote: 7 }, top: 'a' }];
    for (const [k, v] of [['fz:' + x, junk[2]], ['fpos:' + x, junk[3]], ['pos:' + x + ':book', junk[3]], ['pos:' + x + ':normal', junk[1]], ['pos:' + x + ':blocks', junk[0]], ['ds:' + x, 'garbage'], ['bkedit:' + x, 5], ['bk:' + x, 'zzz']]) os.put({ key: k, value: v });
    await new Promise(r => { tx.oncomplete = r; });
    for (const k of ['theme', 'noTour']) { try { if (k === 'theme') localStorage.setItem(k, 'nonsense'); } catch (e) { /* ignore */ } }
  }, id);
  await S.p.reload(); await S.p.waitForSelector('.reader', { timeout: 60000 });
  await S.p.waitForFunction(() => window.__reader?.doc()?.mode, null, { timeout: 60000 }); await L.waitFrameReady(S.p); await sleep(800);
  await check('after garbage');
  const z = await S.p.evaluate(() => window.__reader.doc().zoomOf('book')); assert.ok(z >= 50 && z <= 400, 'zoom ' + z);
  assert.equal(S.logs.filter(l => /pageerror/.test(l)).length, 0, S.logs.join('\n'));
});
