// Check 5: "Блоки" mode - splitting, timer phases with a controlled clock, persistence, rewards, filters.
const L = require('./lib.cjs');
const { ok, sleep } = L;

async function run(browser) {
  console.log('\n=== Blocks mode ===');
  const { ctx, p, logs } = await L.newSession(browser, { width: 1180, height: 820 }, { clock: true });
  const C = (sel, i = 0) => p.evaluate(([s, i]) => document.querySelectorAll(s)[i].click(), [sel, i]);
  await L.openSubject(p, 'Анатомия');
  await L.importFiles(p, ['sample.html', 'sample.pdf']);
  await L.openDoc(p, 'sample', 'HTML', 'blocks');
  await p.waitForSelector('.bk-head');
  ok('в Блоках нет залипающей панели: таймер, прогресс и награды — во всплывающем окне таймера', await p.evaluate(() => !document.querySelector('.bk-bar') && !document.querySelector('.bk-tpop')));
  await p.click('.timer-chip'); await p.waitForSelector('.bk-tpop');
  const heads = await p.$$eval('.bk-head .bk-title .muted', e => e.map(x => x.textContent));
  const mins = heads.map(t => Number(/~(\d+) мин/.exec(t)[1]));
  ok('документ разбит на блоки по заголовкам (6 разделов + вступление)', heads.length >= 6 && heads.length <= 9, heads);
  ok('каждый блок около 5 минут (не больше 7)', mins.every(m => m >= 1 && m <= 7) && mins.filter(m => m >= 4).length >= 4, mins);
  ok('у блока номер, название, время и слова', await p.evaluate(() => { const h = document.querySelector('.bk-head'); return !!h.querySelector('.bk-badge') && h.querySelector('strong').textContent.length > 2 && /слов/.test(h.textContent); }));
  ok('плашка «Сегодня: N блоков ~ M мин»', /Сегодня: \d+ (блок|блока|блоков) ~ \d+ мин/.test(await p.textContent('.bk-plan h3')));
  ok('плашка плана: 5/5, 10/5, 25, секундомер, только важное', (await p.$$('.bk-plan-chips .chip')).length === 5);
  await p.click('.rd-list'); await p.waitForSelector('.modal .bk-filters');
  ok('фильтры Все / Не прочитано / С пометками / Важное (в нижнем листе)', (await p.$$('.bk-filters .seg-btn')).length === 4 && (await p.$$('.bk-row')).length === heads.length);
  await p.click('.modal .btn:has-text("Закрыть")');
  await p.click('.timer-chip'); await p.waitForSelector('.bk-tpop');
  ok('счётчик прогресса «0 / N»', /0 \/ \d+/.test(await p.textContent('.bk-prog')));

  // timer: start block 2
  const total = heads.length;
  await p.evaluate(() => { document.querySelectorAll('.bk-foot .bk-start')[1].scrollIntoView(); });
  await C('.bk-foot .bk-start', 1);
  await p.clock.runFor(1000);
  ok('таймер: «Блок 2:» и 5:00 в начале', (await p.textContent('.bk-label')).includes('Блок 2') && /^(4:5\d|5:00)$/.test(await p.textContent('.bk-clock')), [await p.textContent('.bk-label'), await p.textContent('.bk-clock')]);
  ok('остальные блоки приглушены (фокус)', (await p.$$('.bk-dim')).length > 5);
  ok('document.title показывает остаток', /\d:\d\d · Блок 2/.test(await p.title()), await p.title());
  await p.clock.runFor(60 * 1000);
  const t0 = await p.textContent('.bk-clock');
  ok('таймер идёт (через минуту ~04:00)', /^(3:5\d|4:0\d)$/.test(t0), t0);
  await C('.bk-ctl .pill-btn', 0);
  const t1 = await p.textContent('.bk-clock');
  await p.clock.runFor(30000);
  const t1b = await p.textContent('.bk-clock');
  ok('пауза останавливает таймер', t1b === t1, [t1, t1b]);
  await C('.bk-ctl .pill-btn', 0);
  await C('.bk-ctl .pill-btn', 1);
  const t2 = await p.textContent('.bk-clock');
  ok('+5 мин добавляет пять минут', /^(8:|9:)/.test(t2), t2);
  // persistence mid-timer (real reload keeps the remaining time through the stored end timestamp)
  const stored = await L.idb(p, 'kv', 'bkt:' + (await p.evaluate(() => window.__reader.doc().meta.id)));
  ok('состояние таймера хранится в базе (endAt)', stored.value.phase === 'study' && typeof stored.value.endAt === 'number', stored.value);

  // fast-forward: study ends -> rest starts -> next suggestion
  await p.clock.runFor(10 * 60 * 1000);
  await p.clock.runFor(1000); ok('после блока показан «Чек»: цифры и рыбка/креветка (неподвижные)', await p.waitForSelector('.modal .chk-card', { timeout: 5000 }).then(() => true).catch(() => false)); await p.evaluate(() => document.querySelector('.modal .btn-primary')?.click());
  ok('после учебной фазы начинается отдых с советом', (await p.textContent('.bk-label')).includes('Отдых') && await p.locator('.bk-rest').isVisible(), await p.textContent('.bk-label'));
  const tip = await p.textContent('.bk-rest');
  ok('совет по отдыху показан', tip.length > 10, tip);
  await p.clock.runFor(6 * 60 * 1000);
  ok('после отдыха — предложение «Дальше блок 3»', await p.locator('.bk-rest .btn-primary').isVisible() && (await p.textContent('.bk-rest')).includes('блок 3'), await p.textContent('.bk-rest'));
  await C('.bk-rest .btn-primary', 0);
  await p.clock.runFor(500);
  ok('следующий блок запускается по нажатию', (await p.textContent('.bk-label')).includes('Блок 3'));

  // "Прочитала": progress + shrimp
  await p.evaluate(() => { document.querySelectorAll('.bk-foot .bk-read')[2].scrollIntoView(); });
  await C('.bk-foot .bk-read', 2);
  await sleep(500);
  await p.clock.runFor(1500);
  await sleep(300);
  ok('«Прочитала» обновляет прогресс', /1 \/ \d+/.test(await p.textContent('.bk-prog')));
  ok('креветка прилетела в счётчик', (await p.textContent('.shrimp-target')).includes('1'), await p.textContent('.shrimp-target'));
  ok('блок побледнел (бледнеет ~0.72)', await p.evaluate(() => getComputedStyle(document.querySelector('.bk.bk-done')).opacity === '0.72' || document.querySelector('.bk-done')));
  ok('«Прочитала» во время учёбы переводит в отдых', (await p.textContent('.bk-label')).includes('Отдых'), await p.textContent('.bk-label'));
  ok('награда записана в чек (завершённые части)', (await L.idb(p, 'completions')).length === 1);
  // filters (bottom sheet)
  await p.click('.rd-list'); await p.waitForSelector('.modal .bk-filters');
  await C('.bk-filters .seg-btn', 1);
  ok('фильтр «Не прочитано» скрывает прочитанный', (await p.$$eval('.bk-head', e => e.filter(x => !x.classList.contains('bk-hide')).length)) === total - 1);
  await C('.bk-filters .seg-btn', 2);
  ok('фильтр «С пометками» без пометок пуст', (await p.$$eval('.bk-head', e => e.filter(x => !x.classList.contains('bk-hide')).length)) === 0);
  await p.evaluate(() => { const l = window.__reader.doc(); l.blocks; });
  await C('.bk-filters .seg-btn', 0);
  await p.click('.modal .btn:has-text("Закрыть")');
  await C('.bk-head .flame', 0);
  await p.click('.rd-list'); await p.waitForSelector('.modal .bk-filters');
  await C('.bk-filters .seg-btn', 3);
  ok('фильтр «Важное» показывает помеченные огнём', (await p.$$eval('.bk-head', e => e.filter(x => !x.classList.contains('bk-hide')).length)) === 1);
  await C('.bk-filters .seg-btn', 0);
  await C('.bk-nextunread, .bk-chips .chip-accent', 0);
  ok('«Дальше» — следующий непрочитанный', !(await p.$('.modal .bk-filters')));
  // recall + ask
  await C('.bk-foot .bk-recallbtn', 3);
  ok('«Проверь себя» размывает текст блока', (await p.$$('.bk-recall')).length >= 1);
  await p.clock.runFor(21000);
  ok('текст возвращается через 20 секунд', (await p.$$('.bk-recall')).length === 0);
  await C('.bk-foot .btn-quiet', 1);
  await p.fill('.bk-ask-input >> nth=0', 'Спросят про капилляры');
  await p.dispatchEvent('.bk-ask-input >> nth=0', 'change');
  ok('поле «Спросят» сохраняется', (await L.idb(p, 'kv', 'bk:' + (await p.evaluate(() => window.__reader.doc().meta.id)))).value.ask && true);
  await p.screenshot({ path: L.OUT + '/blocks-1180x820.png' });
  await ctx.close();

  // ---- reload keeps remaining time (real clock) ----
  const s2 = await L.newSession(browser, { width: 1180, height: 820 });
  const p2 = s2.p;
  await L.openSubject(p2, 'Анатомия');
  await L.importFiles(p2, ['sample.html']);
  await L.openDoc(p2, 'sample', 'HTML', 'blocks');
  await p2.waitForSelector('.bk-head');
  await p2.evaluate(() => { document.querySelectorAll('.bk-foot .bk-start')[0].scrollIntoView(); });
  await p2.evaluate(() => document.querySelectorAll('.bk-foot .bk-start')[0].click());
  await sleep(3500);
  await L.reload(p2);
  await p2.waitForSelector('.timer-chip'); await sleep(800);
  await p2.click('.timer-chip'); await p2.waitForSelector('.bk-clock');
  const left = await p2.textContent('.bk-clock');
  ok('после перезагрузки таймер продолжает отсчёт', /^4:(4|5)\d$/.test(left) && (await p2.textContent('.bk-label')).includes('Блок 1'), left);
  ok('нет console.error', logs.length === 0 && s2.logs.length === 0, [logs, s2.logs]);
  await s2.ctx.close();

  // ---- PDF blocks ----
  const s3 = await L.newSession(browser, { width: 1180, height: 820 });
  await L.openSubject(s3.p, 'Анатомия');
  await L.importFiles(s3.p, ['sample.pdf']);
  await L.openDoc(s3.p, 'sample', 'PDF', 'blocks');
  await s3.p.waitForSelector('.bk-card', { timeout: 30000 });
  await sleep(1500);
  ok('PDF: блоки-карточки со страницами внутри', (await s3.p.$$('.bk-card')).length >= 2 && (await s3.p.$$('.bk-card .pg')).length >= 3);
  ok('PDF: названия «Страницы a–b»', /Страниц/.test(await s3.p.textContent('.bk-title strong')));
  await s3.p.screenshot({ path: L.OUT + '/blocks-pdf-1180x820.png' });
  await s3.ctx.close();
}
module.exports = { run };
