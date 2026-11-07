// Round 9, phase 3: pinch zoom without the site sliding.
const L = require('./lib.cjs'); const { ok, sleep } = L;
const REG = f => '../regression/' + f;

// synthetic two-finger pinch inside a document (frame) or on the shell: returns whether touchmove was cancelled
const PINCH = ({ cx, cy, d0, d1, steps }) => new Promise(res => {
  const t = (id, x, y) => new Touch({ identifier: id, target: document.elementFromPoint(x, y) || document.body, clientX: x, clientY: y });
  const fire = (type, ts, ch) => { const e = new TouchEvent(type, { bubbles: true, cancelable: true, touches: ts, targetTouches: ts, changedTouches: ch || ts }); (ts[0] ? ts[0].target : document.body).dispatchEvent(e); return e; };
  let prevented = false, i = 0;
  const pos = d => [t(1, cx - d / 2, cy), t(2, cx + d / 2, cy)];
  fire('touchstart', pos(d0));
  const iv = setInterval(() => { i++; const d = d0 + (d1 - d0) * i / steps; const e = fire('touchmove', pos(d)); if (e.defaultPrevented) prevented = true; if (i >= steps) { clearInterval(iv); fire('touchend', [], pos(d1)); res({ prevented }); } }, 16);
});
const sig = p => p.evaluate(() => { const fr = document.querySelector('.lz-frame'), r = document.querySelector('.rail-l'), rr = document.querySelector('.rail-r'); const f = r => r ? [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)] : null; return JSON.stringify({ fr: f(fr && fr.getBoundingClientRect()), l: f(r && r.getBoundingClientRect()), r: f(rr && rr.getBoundingClientRect()), vv: window.visualViewport.scale, sx: document.scrollingElement.scrollLeft, sy: document.scrollingElement.scrollTop, ox: visualViewport.offsetLeft, oy: visualViewport.offsetTop }); });
const fsig = fr => fr.evaluate(() => JSON.stringify({ z: document.documentElement.style.zoom, h: document.documentElement.scrollHeight, w: document.documentElement.scrollWidth, t: Math.round((document.scrollingElement || document.documentElement).scrollTop), tr: document.documentElement.style.transform }));

async function run(browser) {
  console.log('\n=== Round 9 / фаза 3: щипок без «уезжающего» сайта ===');
  const { ctx, p, logs } = await L.newSession(browser, { width: 1000, height: 700 });
  await L.openSubject(p, 'Анатомия');
  await L.importFiles(p, [REG('02-plain-splanchnology.html'), REG('05-diagrams-landscape.pdf')]);
  const open = async (name, mode) => { const f = (await L.idb(p, 'files')).find(x => x.name === name); await p.evaluate(id => { location.hash = '#/file/' + id; }, f.id); await p.waitForSelector('.reader'); await p.waitForFunction(() => window.__reader && window.__reader.doc() && window.__reader.doc().mode, null, { timeout: 30000 }); if (mode) await L.switchTo(p, mode); else await L.waitFrameReady(p); };

  const meta = await p.evaluate(() => document.querySelector('meta[name=viewport]').content);
  ok('viewport: maximum-scale=1, user-scalable=no, viewport-fit=cover', /maximum-scale=1/.test(meta) && /user-scalable=no/.test(meta) && /viewport-fit=cover/.test(meta), meta);
  const g = await p.evaluate(() => { const out = {}; for (const t of ['gesturestart', 'gesturechange', 'gestureend']) { const e = new Event(t, { bubbles: true, cancelable: true }); document.body.dispatchEvent(e); out[t] = e.defaultPrevented; } return out; });
  ok('на оболочке gesturestart / gesturechange / gestureend отменяются', g.gesturestart && g.gesturechange && g.gestureend, g);
  const shellPinch = await p.evaluate(PINCH, { cx: 500, cy: 350, d0: 80, d1: 260, steps: 8 });
  ok('двухпальцевое движение на оболочке отменяется (touchmove preventDefault)', shellPinch.prevented, shellPinch);
  ok('оболочка: touch-action pan-x pan-y, у кнопок manipulation', await p.evaluate(() => /pan-x/.test(getComputedStyle(document.querySelector('#app')).touchAction) && getComputedStyle(document.querySelector('.btn, button')).touchAction === 'manipulation'), await p.evaluate(() => getComputedStyle(document.querySelector('#app')).touchAction));
  // real touch pinch through the browser (CDP): the visual viewport must stay at 1 and nothing moves
  const cdp = await ctx.newCDPSession(p);
  const before = await sig(p);
  await cdp.send('Input.synthesizePinchGesture', { x: 500, y: 350, scaleFactor: 2.2, relativeSpeed: 400, gestureSourceType: 'touch' }).catch(e => console.log('  (CDP pinch:', e.message.slice(0, 80), ')'));
  await sleep(600);
  const after = await sig(p);
  ok('щипок по оболочке: visualViewport.scale остаётся 1, ничего не сдвинулось', after === before && JSON.parse(after).vv === 1, [before, after]);

  // ---- щипок в документе ----
  await open('02-plain-splanchnology', 'normal');
  const F = () => L.frameOf(p);
  ok('в рамке документа: touch-action не даёт браузерному масштабированию', await F().evaluate(() => /pan-x/.test(getComputedStyle(document.documentElement).touchAction) && !/pinch/.test(getComputedStyle(document.documentElement).touchAction)));
  const z0 = await p.evaluate(() => window.__reader.doc().zoomOf());
  const box = await p.locator('.lz-frame').boundingBox();
  const pr = await F().evaluate(PINCH, { cx: 400, cy: 300, d0: 80, d1: 120, steps: 8 });
  ok('щипок в документе: движение отменено', pr.prevented, pr);
  await sleep(500);
  const z1 = await p.evaluate(() => window.__reader.doc().zoomOf());
  ok(`щипок ×1.5 увеличивает масштаб до ближайшего шага списка (${z0} → ${z1})`, z1 === 110 && [50, 55, 60, 65, 70, 75, 80, 85, 90, 100, 110, 125, 150, 175, 200].includes(z1), [z0, z1]);
  const label = await p.evaluate(() => document.querySelector('.zoom-pct').textContent);
  ok('подпись масштаба показывает применённое значение', parseInt(label) === z1, label);
  const s1 = [await fsig(F()), await sig(p)]; await sleep(450); const s2 = [await fsig(F()), await sig(p)]; await sleep(450); const s3 = [await fsig(F()), await sig(p)];
  ok('после отпускания в течение 400+ мс нет новых раскладок и прокруток; рейки не двигаются', JSON.stringify(s1) === JSON.stringify(s2) && JSON.stringify(s2) === JSON.stringify(s3) && !JSON.parse(s1[0]).tr, [s1, s3]);
  const prOut = await F().evaluate(PINCH, { cx: 400, cy: 300, d0: 160, d1: 40, steps: 8 }); await sleep(600);
  const z2 = await p.evaluate(() => window.__reader.doc().zoomOf());
  ok(`щипок ×0.25 уменьшает до нижней границы списка (${z1} → ${z2})`, z2 === 50, [z1, z2]);
  // book: snaps too, the page frame stays
  await open('02-plain-splanchnology', 'book'); await sleep(500);
  const fr0 = await F().evaluate(() => { const r = document.querySelector('.lz-pg.r').getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; });
  await p.evaluate(() => window.__reader.doc().setZoomPct(75)); await sleep(800);
  await F().evaluate(PINCH, { cx: 400, cy: 300, d0: 80, d1: 160, steps: 8 }); await sleep(900);
  const zb = await p.evaluate(() => window.__reader.doc().zoomOf());
  const fr1 = await F().evaluate(() => { const r = document.querySelector('.lz-pg.r').getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; });
  ok(`щипок в «Книге»: масштаб ${zb}, рамка страницы не изменилась`, zb === 150 && JSON.stringify(fr0.map(v => Math.round(v / 10))) === JSON.stringify(fr1.map(v => Math.round(v / 10))), [fr0, fr1, zb]);
  const b1 = await fsig(F()); await sleep(500); ok('«Книга»: после щипка ничего не двигается', (await fsig(F())) === b1);
  // PDF page pictures: continuous 0.5x - 4x
  await open('05-diagrams-landscape', 'normal'); await p.evaluate(() => window.__reader.doc().setZoomPct(75)); await sleep(600);
  await F().evaluate(PINCH, { cx: 400, cy: 300, d0: 60, d1: 150, steps: 8 }); await sleep(700);
  const zp = await p.evaluate(() => window.__reader.doc().zoomOf());
  ok(`страницы PDF: непрерывный масштаб (75 × 2.5 = ${zp}), можно > 200%`, zp > 175 && zp <= 400 && ![50, 55, 60, 65, 70, 75, 80, 85, 90, 100, 110, 125, 150, 175, 200].includes(zp) || zp === 188, zp);
  await F().evaluate(PINCH, { cx: 400, cy: 300, d0: 40, d1: 400, steps: 8 }); await sleep(700);
  ok('страницы PDF: верхний предел 400%', (await p.evaluate(() => window.__reader.doc().zoomOf())) === 400);
  ok('нет ошибок в консоли', logs.length === 0, logs);
  await ctx.close();
}
module.exports = { run };
