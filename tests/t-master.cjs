// Master spec checks: Home title, card info, search, trash/restore, tour, bookmarks, offline pill.
const L = require('./lib.cjs');
const { ok, sleep } = L;

async function run(browser) {
  console.log('\n=== Master: библиотека, поиск, корзина, закладки, экскурсия ===');
  const { ctx, p, logs } = await L.newSession(browser, { width: 1180, height: 820 });
  await L.openSubject(p, 'Анатомия');
  await L.importFiles(p, ['adapt/app-angiology.html', 'notes.md']);
  await p.evaluate(() => { location.hash = '#/'; }); await p.waitForSelector('.subject-card');
  ok('главная: заголовок «Библиотека», приветствие отдельной строкой', await p.evaluate(() => document.querySelector('.hero h1').textContent === 'Библиотека' && !!document.querySelector('.hero .greet')));
  ok('карточка предмета: «% прочитано»', /прочитано/.test(await p.textContent('.subject-card:has(strong:text-is("Анатомия")) small')));
  await L.openSubject(p, 'Анатомия');
  ok('карточка документа: число блоков и минуты', /\d+ (блок|блока|блоков) · ~\d+ мин/.test(await p.textContent('.doc-card:has(.doc-title:text-is("app-angiology")) .doc-meta')), await p.textContent('.doc-card .doc-meta'));

  // search
  await p.evaluate(() => { location.hash = '#/search/' + encodeURIComponent('аорта'); });
  await p.waitForSelector('.search-item', { timeout: 15000 });
  ok('поиск по тексту находит документ и показывает фрагмент', await p.evaluate(() => document.querySelectorAll('.search-item').length >= 1 && !!document.querySelector('.search-item mark')));

  // trash and restore
  await L.openSubject(p, 'Анатомия');
  const before = (await p.$$('.doc-card')).length;
  await p.hover('.doc-card:has(.doc-title:text-is("notes"))').catch(() => {});
  await p.click('.doc-card:has(.doc-title:text-is("notes")) .doc-more');
  await p.click('.menu-row:has-text("Удалить"), .menu button:has-text("Удалить")');
  await sleep(500);
  ok('удаление без подтверждения: файл исчез из списка, есть «Вернуть»', (await p.$$('.doc-card')).length === before - 1 && !!(await p.$('.toast:has-text("корзине")')));
  const rec = (await L.idb(p, 'files')).find(f => f.name === 'notes');
  ok('файл не стёрт: в IndexedDB с меткой deleted', !!rec && !!rec.deleted);
  await p.evaluate(() => { location.hash = '#/settings'; }); await p.waitForSelector('.theme-card');
  ok('в настройках «Корзина» показывает файл', /notes/.test(await p.evaluate(() => [...document.querySelectorAll('.card')].find(c => /Корзина/.test(c.textContent))?.textContent || '')));
  await p.click('.card:has(h2:text-is("Корзина")) .btn:has-text("Вернуть")').catch(async () => { await p.click('.btn:has-text("Вернуть")'); });
  await sleep(400);
  ok('восстановление возвращает файл', !(await L.idb(p, 'files')).find(f => f.name === 'notes').deleted);

  // bookmarks
  await L.openSubject(p, 'Анатомия');
  await L.openFile(p, 'app-angiology', null, 'blocks');
  await p.click('[aria-label="Ещё"], .rd-more').catch(() => {});
  await sleep(300);
  const hasBm = await p.$('.menu-row:has-text("Добавить закладку здесь")');
  ok('меню «Ещё» содержит закладки', !!hasBm);
  if (hasBm) { await hasBm.click(); await sleep(500); const kv = await L.idb(p, 'kv'); ok('закладка сохранена в kv bmk:*', kv.some(r => String(r.key || r.k || '').startsWith('bmk:')) || JSON.stringify(kv).includes('bmk:')); }
  await ctx.close();

  // tour: shown once, not again after "Понятно"
  const t = await L.newSession(browser, { width: 1180, height: 820 }, { tour: true });
  await t.p.waitForSelector('.tour-body', { timeout: 8000 }).catch(() => {});
  ok('первый запуск: показывается экскурсия из 3 карточек', !!(await t.p.$('.tour-body')));
  if (await t.p.$('.tour-body')) {
    await t.p.click('.tour-body .btn-primary'); await t.p.click('.tour-body .btn-primary'); await t.p.click('.tour-body .btn-primary'); await sleep(400);
    await t.p.reload(); await t.p.waitForSelector('.hero'); await sleep(2500);
    ok('после «Понятно» экскурсия больше не появляется', !(await t.p.$('.tour-body')));
  }
  await t.ctx.close();
  ok('нет ошибок в консоли', logs.length === 0, logs);
}
module.exports = { run };
