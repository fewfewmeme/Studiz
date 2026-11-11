// Dark document background: the light paper becomes black, hues of coloured text stay (red red, blue blue, violet violet), pictures are NOT changed, the choice is remembered.
const L = require('./lib.cjs'); const { ok } = L;
const PNG = require('child_process');
async function run(browser) {
  console.log('\n=== Тёмный фон документа ===');
  const { p, logs } = await L.newSession(browser, { width: 1180, height: 820 });
  await L.openSubject(p, 'Анатомия'); await L.importFiles(p, ['dark.html']);
  const f = (await L.idb(p, 'files')).find(x => x.name === 'dark');
  await p.evaluate(id => { location.hash = '#/file/' + id; }, f.id);
  await p.waitForSelector('.reader'); await p.waitForFunction(id => window.__reader && window.__reader.doc() && window.__reader.doc().id === id && window.__reader.doc().mode, f.id, { timeout: 30000 }); await L.waitFrameReady(p);
  const shot = async () => { await p.waitForTimeout(350); const b = await p.screenshot({ clip: await p.evaluate(() => { const r = document.querySelector('.lz-frame').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; }) }); return b; };
  // pixel analysis in the page (decode the PNG screenshot with a canvas)
  const analyse = async buf => p.evaluate(async b64 => {
    const img = await new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = 'data:image/png;base64,' + b64; });
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data; let dark = 0, light = 0, red = 0, blue = 0, violet = 0, pic = 0;
    for (let i = 0; i < d.length; i += 4) { const r = d[i], gg = d[i + 1], bb = d[i + 2];
      if (r < 40 && gg < 40 && bb < 40) dark++; if (r > 235 && gg > 235 && bb > 235) light++;
      if (r > 150 && gg < 110 && bb < 110 && !(Math.abs(r - 200) < 14 && Math.abs(gg - 40) < 14 && Math.abs(bb - 60) < 14)) red++;
      if (bb > 150 && r < 120 && gg < 140) blue++;
      if (r > 110 && bb > 150 && gg < 110 && r < 200) violet++;
      if (Math.abs(r - 200) < 14 && Math.abs(gg - 40) < 14 && Math.abs(bb - 60) < 14) pic++; }
    const n = d.length / 4; return { dark: dark / n, light: light / n, red, blue, violet, pic };
  }, buf.toString('base64'));
  const A = await analyse(await shot());
  ok('светлый документ: фон белый, картинка красная', A.light > 0.5 && A.dark < 0.02 && A.pic > 5000, A);
  await p.click('.dark-btn'); await p.waitForTimeout(500);
  const B = await analyse(await shot());
  ok('тёмный фон: почти весь экран чёрный, белого нет', B.dark > 0.5 && B.light < 0.02, B);
  ok('красный текст остался красным, синий синим, фиолетовый фиолетовым', B.red > 300 && B.blue > 300 && B.violet > 300, B);
  ok('картинка не изменилась (тот же цвет, столько же пикселей)', Math.abs(B.pic - A.pic) < A.pic * 0.03, [A.pic, B.pic]);
  ok('рамка читалки тоже стала тёмной', await p.evaluate(() => document.querySelector('.reader').classList.contains('doc-dark')));
  ok('выбор запомнен в настройках', (await p.evaluate(async () => (await import('./js/settings.js')).settings().docDark)) === true);
  await p.reload(); await p.waitForSelector('.reader'); await p.waitForFunction(id => window.__reader && window.__reader.doc() && window.__reader.doc().id === id && window.__reader.doc().mode, f.id, { timeout: 30000 }); await L.waitFrameReady(p);
  const C = await analyse(await shot()); ok('после перезагрузки документ сразу тёмный', C.dark > 0.5, C);
  await p.click('.dark-btn'); await p.waitForTimeout(500);
  const D = await analyse(await shot()); ok('кнопка ещё раз: снова светлый', D.light > 0.5 && D.dark < 0.02, D);
  ok('без ошибок в консоли', !logs.length, logs);
}
module.exports = { run };
