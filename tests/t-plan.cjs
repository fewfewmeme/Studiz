// План: cards, adding a task with a subject, the task menu (attach a file / edit / done / delete), the «выполнено?» offer after reading, the Чек hero sticker.
const L = require('./lib.cjs'); const { ok } = L;
async function run(browser) {
  console.log('\n=== План: карточки дней, задачи, привязка файла ===');
  const { p, logs } = await L.newSession(browser, { width: 1180, height: 820 });
  await L.openSubject(p, 'Анатомия'); await L.importFiles(p, ['../regression/02-plain-splanchnology.html']);
  await p.evaluate(() => { location.hash = '#/plan'; }); await p.waitForSelector('.plan-grid');
  const n = await p.evaluate(() => ({ days: document.querySelectorAll('.plan-day:not(.plan-motiv)').length, motiv: !!document.querySelector('.plan-motiv textarea'), today: document.querySelectorAll('.plan-day.today').length, sheet: !!document.querySelector('.plan-sheet'), full: document.querySelector('.plan-wrap').getBoundingClientRect().width }));
  ok('7 карточек дней + «Мотивация», сегодня выделен, листка-сетки нет, страница во всю ширину', n.days === 7 && n.motiv && n.today === 1 && !n.sheet && n.full > 800, n);
  // add a task to today with a subject
  const today = await p.evaluate(() => document.querySelector('.plan-day.today').dataset.date);
  const day = `.plan-day[data-date="${today}"]`;
  await p.click(`${day} .pa-subj`); await p.click('.menu-item:has-text("Анатомия")');
  await p.fill(`${day} .plan-new`, 'Выучить сердце'); await p.press(`${day} .plan-new`, 'Enter');
  await p.waitForSelector(`${day} .plan-item`);
  let it = await p.evaluate(async () => { const P = await import('./js/plan-store.js'); return (await P.getItems())[0]; });
  ok('задача добавлена в сегодняшний день с предметом «Анатомия»', it && it.text === 'Выучить сердце' && it.subj === 'anatomy' && !it.done, it);
  ok('после добавления фокус остаётся в поле дня (можно вводить дальше)', await p.evaluate(s => document.activeElement === document.querySelector(s + ' .plan-new'), day));
  // tap the text -> menu -> attach a file
  await p.click(`${day} .plan-text`); await p.click('.menu-item:has-text("Привязать файл")');
  await p.waitForSelector('.plan-files button');
  await p.click('.plan-files button:has-text("02-plain-splanchnology")');
  await p.waitForSelector(`${day} .plan-file`);
  it = await p.evaluate(async () => (await (await import('./js/plan-store.js')).getItems())[0]);
  ok('файл привязан к задаче и показан под ней', !!it.fileId && /file\//.test(await p.getAttribute(`${day} .plan-file`, 'href')), it);
  // not enough reading yet -> progress only; enough -> the offer
  ok('пока файл не читали — предложения «выполнено?» нет', !(await p.$(`${day} .plan-ask`)));
  await p.evaluate(async id => { const P = await import('./js/plan-store.js'); await P.updateItem(id, { fileMs: 16 * 60000 }); location.hash = '#/'; }, it.id);
  await p.evaluate(() => { location.hash = '#/plan'; }); await p.waitForSelector(`${day} .plan-ask`);
  ok('после чтения (≥ 15 мин) предлагается отметить выполненным', /Прочитано 16 мин/.test(await p.textContent(`${day} .plan-ask`)));
  await p.click(`${day} .plan-ask`); await p.waitForSelector(`${day} .plan-item.done`);
  it = await p.evaluate(async () => (await (await import('./js/plan-store.js')).getItems())[0]);
  ok('нажатие «✓» отмечает задачу выполненной', it.done === true);
  // dot toggles back, text edit, delete
  await p.click(`${day} .plan-dot`); await p.waitForSelector(`${day} .plan-item:not(.done)`);
  await p.click(`${day} .plan-text`); await p.click('.menu-item:has-text("Удалить")');
  await p.waitForFunction(s => !document.querySelector(s + ' .plan-item'), day);
  ok('точка снимает отметку, «Удалить» убирает задачу', (await p.evaluate(async () => (await (await import('./js/plan-store.js')).getItems()).length)) === 0);
  // minutes outside the site still reachable
  await p.click('.plan-ghost:has-text("Минуты вне сайта")'); await p.waitForSelector('.modal');
  ok('«Минуты вне сайта» открывается из шапки', await p.isVisible('.modal'));
  await p.keyboard.press('Escape'); await p.evaluate(() => document.querySelector('.modal-back, .modal-backdrop, .modal')?.parentElement?.click?.());
  // Чек hero sticker
  await p.evaluate(() => { location.hash = '#/check'; }); await p.waitForSelector('.poster-panel');
  ok('в шапке «Чек» есть стикер со шприцем', await p.evaluate(() => { const s = document.querySelector('.poster-panel .poster-sticker img, .poster-panel .poster-sticker'); return !!s; }));
  ok('без ошибок в консоли', !logs.length, logs);
}
module.exports = { run };
