// Round 9, phase 4: block estimator + cutter (learning speed ~70 words/min), per-page PDF model, split/merge, pace.
const L = require('./lib.cjs'); const path = require('path'), fs = require('fs'); const { ok, sleep } = L; const { FILES } = require('./regression/lib.cjs');
const D = path.join(L.ROOT, 'tests', 'fixtures', 'r9');
const words = (n, s = 0) => { const w = ['белок', 'цепь', 'фермент', 'клетка', 'мембрана', 'сосуд', 'ткань', 'кровь', 'нерв', 'мышца']; return Array.from({ length: n }, (_, i) => w[(i * 3 + s) % w.length]).join(' '); };
const wrap = (title, body) => `<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><title>${title}</title><style>body{font:17px/1.6 Georgia,serif;margin:0}.wrap{max-width:800px;margin:0 auto;padding:20px}</style></head><body><div class="wrap">${body}</div></body></html>`;
function gen() {
  // (1) the model: one section with a known mix -> exact minutes
  const mix = `<h1>Модель</h1><h2>Раздел модели</h2><div><p>${words(210)}</p><p>${Array.from({ length: 4 }, (_, i) => `<b>термин${i}</b>`).join(' ')} ${Array.from({ length: 10 }, (_, i) => `<span class="lat">lat${i}</span>`).join(' ')}</p>` +
    `<img alt="a" src="data:image/gif;base64,R0lGODlhAQABAAAAACw="><img alt="b" src="data:image/gif;base64,R0lGODlhAQABAAAAACw="><table><tr><td>1</td></tr><tr><td>2</td></tr><tr><td>3</td></tr><tr><td>4</td></tr></table><math><mi>x</mi></math><math><mi>y</mi></math><svg width="10" height="10"><rect width="5" height="5"/></svg></div><h2>Второй раздел</h2><p>${words(350, 2)}</p>`;
  fs.writeFileSync(path.join(D, 'model.html'), wrap('Модель', mix));
  // (2) cutting: one 30-minute section (30 paragraphs of 70 words), two tiny h3 under one h2, one 600-word paragraph, one 40-row table
  let big = '<h1>Нарезка</h1><p>Введение документа.</p><h2>Большой раздел</h2>';
  for (let i = 0; i < 30; i++) big += `<p>${words(70, i)}.</p>`;
  big += `<h2>Родитель</h2><h3>Малый один</h3><p>${words(35)}</p><h3>Малый два</h3><p>${words(35, 4)}</p>`;
  big += `<h2>Один длинный абзац</h2><p>${words(600, 5)}.</p>`;
  big += `<h2>Большая таблица</h2><table>${Array.from({ length: 40 }, (_, i) => `<tr><td>строка ${i}</td><td>${words(2, i)}</td></tr>`).join('')}</table>`;
  big += `<h2>Хвост</h2><p>${words(300, 7)}.</p>`;
  fs.writeFileSync(path.join(D, 'cut.html'), wrap('Нарезка', big));
}
async function run(browser) {
  console.log('\n=== Round 9 / фаза 4: оценка и нарезка блоков ===');
  fs.mkdirSync(D, { recursive: true }); gen();
  const { ctx, p, logs } = await L.newSession(browser, { width: 1000, height: 700 });
  await L.openSubject(p, 'Анатомия');
  await L.importFiles(p, [...FILES.map(f => '../regression/' + f), 'r9/model.html', 'r9/cut.html']);
  const files = await L.idb(p, 'files'); const F = () => L.frameOf(p);
  const open = async (name, mode) => { const f = files.find(x => x.name === name); await p.evaluate(() => { location.hash = '#/'; }); await sleep(250); await p.evaluate(id => { location.hash = '#/file/' + id; }, f.id); await p.waitForSelector('.reader'); await p.waitForFunction(() => window.__reader && window.__reader.doc() && window.__reader.doc().mode, null, { timeout: 30000 }); await L.switchTo(p, mode); await sleep(400); };
  const segs = () => F().evaluate(() => window.__lz.segments().map(s => ({ title: s.title, min: s.min, words: s.words, leaves: s.leaves.length, single: !!s.single, pages: s.pages || null, id: s.id })));

  // ---- the model ----
  await open('model', 'blocks');
  let sg = await segs();
  const exp = 210 / 70 + 4 * 0.15 + 10 * 0.05 + 2 * 0.75 + 4 * 0.25 + 2 * 0.6 + 1 * 1.0 + (4 + 10) / 70;   // + the words of the term line
  ok(`оценка = слова/70 + термины×0.15 + латынь×0.05 + картинки×0.75 + строки таблиц×0.25 + формулы×0.6 + схемы×1.0 (ждём ≈ ${exp.toFixed(2)}, получили ${sg[0].min})`, Math.abs(sg[0].min - exp) < 0.25, sg[0]);
  ok('скорость запоминания ~70 слов/мин: 350 слов ≈ 5 мин', Math.abs(sg[1].min - 5) < 0.3, sg[1]);

  // ---- cutting ----
  await open('cut', 'blocks'); sg = await segs();
  const bigPieces = sg.filter(s => /Большой раздел/.test(s.title));
  ok('раздел в 30 минут режется на куски по ~5 минут (4–6 минут каждый, 5–7 кусков)', bigPieces.length >= 5 && bigPieces.length <= 7 && bigPieces.every(s => s.min >= 3.9 && s.min <= 6.6), bigPieces.map(s => s.min));
  ok('куски режутся по границам абзацев (в каждом целые абзацы)', bigPieces.every(s => s.leaves >= 3));
  const parent = sg.filter(s => /Малый/.test(s.title) || /Родитель/.test(s.title));
  ok('два коротких h3 под одним h2 сливаются в один блок', parent.length === 1, parent);
  const longP = sg.find(s => /Один длинный абзац/.test(s.title)); ok('один абзац > 7 минут — отдельный блок с реальной оценкой (≈ 8.6)', longP && Math.abs(longP.min - 600 / 70) < 0.3 && longP.leaves <= 2, longP);
  const tbl = sg.find(s => /Большая таблица/.test(s.title)); ok('большая таблица не режется: один блок с её оценкой', tbl && tbl.min > 7 && tbl.leaves <= 2, tbl);
  ok('введение документа не становится блоком №1 само по себе', !/Нарезка|Введение/.test(sg[0].title) && sg[0].words > 100, sg[0]);
  ok('названия читаемы: из одного заголовка, с пробелами, ≤ 80 знаков', sg.every(s => s.title && s.title.length <= 80 && !/[а-яё][А-ЯЁ]/.test(s.title)), sg.map(s => s.title));

  // ---- every fixture within 2–7 min ----
  for (const fx of FILES) {
    const name = fx.replace(/\.[^.]+$/, ''); await open(name, 'blocks'); const s = await segs();
    const hasBlk = /^01-/.test(fx);
    const bad = s.filter(x => (x.min < 1.95 || x.min > 7.05) && !x.single && !hasBlk && !(x.pages && x.pages.length === 1) && s.length > 1);
    ok(`${fx}: блоки 2–7 минут (кроме неделимых): ${s.map(x => x.min).join(', ')}`, s.length > 0 && bad.length === 0 && (hasBlk ? s.length === 8 : true), bad);
    ok(`${fx}: названия блоков читаемы`, s.every(x => x.title && x.title.length <= 80 && !/undefined|NaN/.test(x.title) && !/[а-яё][А-ЯЁ]/.test(x.title)), s.map(x => x.title));
    if (/^05-/.test(fx)) {
      const pm = await F().evaluate(() => [...document.querySelectorAll('img.pdf-page')].map(i => ({ pg: +i.dataset.page, pm: +i.dataset.pm, pt: i.dataset.pt || '' })));
      ok(`${fx}: у каждой страницы есть оценка 1.5–8 мин (пути, формулы, текст)`, pm.length === 14 && pm.every(x => x.pm >= 1.5 && x.pm <= 8), pm.map(x => x.pm));
      ok(`${fx}: схемы тяжелее текстовых страниц (диаграммы ≥ 3 мин, текст < 3)`, pm.filter(x => x.pg >= 3 && x.pg <= 9).every(x => x.pm >= 3) && pm.filter(x => x.pg >= 11).every(x => x.pm < 3), pm.map(x => x.pm));
      ok(`${fx}: заголовок страницы — самая крупная строка`, pm.every(x => /Обмен|Введение/.test(x.pt)), pm.map(x => x.pt));
      const run7 = s.filter(x => x.pages && x.pages.some(pg => pg >= 3 && pg <= 9));
      ok(`${fx}: 7 страниц схем дают 5–9 блоков (${run7.length})`, run7.length >= 5 && run7.length <= 9, run7.map(x => x.pages));
      ok(`${fx}: в блоке не больше 3 страниц и ≤ 7 минут (кроме одной тяжёлой страницы)`, s.every(x => x.pages.length <= 3 && (x.min <= 7.05 || x.pages.length === 1)), s.map(x => [x.pages, x.min]));
      ok(`${fx}: заголовок блока — самая крупная строка страницы или «Страница N–M»`, s.every(x => /^Страниц[аы] \d+(–\d+)?$/.test(x.title) || /Обмен|Введение/.test(x.title)), s.map(x => x.title));
    }
  }

  // ---- split / merge persist ----
  await open('cut', 'blocks'); sg = await segs();
  const n0 = sg.length, pieceIdx = sg.findIndex(s => /Большой раздел/.test(s.title));
  await F().evaluate(id => document.querySelector(`.lz-bf[data-b="${id}"] .sp`).click(), sg[pieceIdx].id); await sleep(900);
  let n1 = (await segs()).length; ok('«Разделить» делит блок на два', n1 === n0 + 1, [n0, n1]);
  await open('cut', 'normal'); await open('cut', 'blocks'); sg = await segs();
  ok('разделение сохраняется после перерисовки (смена вида)', sg.length === n0 + 1, sg.length);
  await L.reload(p); await sleep(600); await open('cut', 'blocks'); sg = await segs();
  ok('разделение сохраняется после перезагрузки страницы', sg.length === n0 + 1, sg.length);
  await F().evaluate(id => document.querySelector(`.lz-bf[data-b="${id}"] .mg`).click(), sg[pieceIdx].id); await sleep(900);
  ok('«Объединить со следующим» возвращает один блок', (await segs()).length === n0, (await segs()).length);
  await L.reload(p); await sleep(600); await open('cut', 'blocks');
  ok('объединение тоже сохраняется', (await segs()).length === n0);

  // ---- pace ----
  await open('model', 'blocks'); const normal = (await segs())[1].min;
  await p.evaluate(async () => { const s = await import('./js/settings.js'); await s.setSetting({ pace: 'slow' }); }); await open('model', 'blocks');
  const slow = (await segs())[1].min;
  await p.evaluate(async () => { const s = await import('./js/settings.js'); await s.setSetting({ pace: 'fast' }); }); await open('model', 'blocks');
  const fast = (await segs())[1].min;
  await p.evaluate(async () => { const s = await import('./js/settings.js'); await s.setSetting({ pace: 'normal' }); });
  ok(`«Мой темп»: медленно ×1.4, быстро ×0.75 (${normal} → ${slow} / ${fast})`, Math.abs(slow / normal - 1.4) < 0.06 && Math.abs(fast / normal - 0.75) < 0.06, [normal, slow, fast]);
  await p.evaluate(() => { location.hash = '#/settings'; }); await p.waitForSelector('.theme-card'); await sleep(300);
  ok('в настройках есть «Мой темп: медленно / обычно / быстро»', await p.evaluate(() => /Мой темп/.test(document.body.innerText) && /медленно/i.test(document.body.innerText) && /быстро/i.test(document.body.innerText)));
  ok('нет ошибок в консоли', logs.length === 0, logs);
  await ctx.close();
}
module.exports = { run };
