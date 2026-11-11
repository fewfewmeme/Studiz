// Reader: pinch zoom in the middle of a long text keeps the text under the fingers; a lost pinch end never freezes scrolling;
// «прочитано» is the furthest point and survives a quick exit.
const P = require('./perf-lib.cjs'), L = P.L; const { ok } = L; const fs = require('fs');
async function run(browser) {
  console.log('\n=== Читалка: щипок, зависание прокрутки, «прочитано» ===');
  if (!fs.existsSync(L.FX('perf/angiology162.html'))) { console.log('  (нет tests/fixtures/perf — запустите node tests/gen-perf-fixtures.cjs)'); return; }
  const S = await P.session(browser, { cpu: 1 });
  await P.importFile(S.p, 'perf/angiology162.html');
  const meta = await P.openByName(S.p, 'angiology162', 'normal'); await P.sleep(1200);
  const fr = () => L.frameOf(S.p);
  const sc = () => fr().evaluate(() => { const se = document.scrollingElement || document.documentElement; return { top: se.scrollTop, max: se.scrollHeight - se.clientHeight, tr: document.documentElement.style.transform, z: window.__lz.S.zoom }; });
  const rect = await S.p.evaluate(() => { const r = document.querySelector('.lz-frame').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
  // ---- 1. a pinch whose end is lost must not freeze one-finger scrolling
  await fr().evaluate(() => { const mk = (id, x, y) => new Touch({ identifier: id, target: document.body, clientX: x, clientY: y }); const t = [mk(1, 100, 100), mk(2, 200, 100)]; document.dispatchEvent(new TouchEvent('touchstart', { touches: t, targetTouches: t, changedTouches: t, bubbles: true, cancelable: true })); });
  const t0 = (await sc()).top;
  for (let i = 0; i < 3; i++) { await P.swipe(S.cdp, cx, cy + 200, cx, cy - 200, 150); await P.sleep(250); }
  const t1 = (await sc()).top;
  ok('после «потерянного» щипка прокрутка одним пальцем работает', t1 - t0 > 400, [t0, t1]);
  // ---- 2. pinch in the middle of the document: the text stays under the fingers
  await fr().evaluate(() => { const se = document.scrollingElement || document.documentElement; se.scrollTop = 20000; }); await P.sleep(600);
  const probe = () => fr().evaluate(() => { const e = document.elementFromPoint(innerWidth / 2, innerHeight / 2); const r = e.getBoundingClientRect(); return { cy: r.top + r.height / 2, txt: (e.textContent || '').slice(0, 24) }; });
  const before = await probe();
  const pts = d => [{ x: cx - d, y: cy, id: 1 }, { x: cx + d, y: cy, id: 2 }];
  await S.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts(100) });
  let maxScale = 1, drift = 0;
  for (let d = 100; d <= 600; d += 50) { await S.cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts(d) }); await P.sleep(40); const s = await sc(); const m = /scale\(([\d.]+)\)/.exec(s.tr || ''); if (m) maxScale = Math.max(maxScale, +m[1]); }
  const mid = await probe();
  await S.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await P.sleep(900);
  const after = await sc();
  ok('щипок — чисто визуальный зум: масштаб растёт, но не больше 5×', maxScale > 1.2 && maxScale <= 5.01, maxScale);
  ok('после отпускания размер текста НЕ менялся (75), зум остался визуальным (transform держится)', after.z === 75 && /scale\(/.test(after.tr || ''), after);
  ok('в середине документа во время щипка текст не «улетает»: под пальцами тот же абзац (раньше центр масштаба был вверху страницы)', mid.txt === before.txt && Math.abs(mid.cy - before.cy) < 140, [before, mid]);
  // ---- 3. «прочитано»: the end of the file = 100 %, a quick exit does not lose it, reopening does not lower it
  await fr().evaluate(() => { const se = document.scrollingElement || document.documentElement; se.scrollTop = se.scrollHeight; }); await P.sleep(300);
  await S.p.evaluate(() => { location.hash = '#/'; }); await S.p.waitForSelector('.hero'); await P.sleep(500);
  let f = (await L.idb(S.p, 'files')).find(x => x.id === meta.id);
  ok('дочитала до конца и вышла сразу: «прочитано» = 100 % (раньше при быстром выходе писалось NaN → 0 %)', f.progress === 1, f.progress);
  await S.p.evaluate(id => { location.hash = '#/file/' + id; }, meta.id); await S.p.waitForSelector('.reader'); await P.sleep(350);
  await S.p.evaluate(() => { location.hash = '#/'; }); await S.p.waitForSelector('.hero'); await P.sleep(900);
  f = (await L.idb(S.p, 'files')).find(x => x.id === meta.id);
  ok('открыла и сразу закрыла: «прочитано» не упало', f.progress === 1, f.progress);
  ok('в файле нет нечисловых значений прогресса', Number.isFinite(f.progress));
  ok('без ошибок в консоли', !S.logs.length, S.logs);
}
module.exports = { run };
