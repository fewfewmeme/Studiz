// Library basics carried over from v1: folders, import errors, file actions, receipt, settings, backup/restore with annotations.
const L = require('./lib.cjs');
const path = require('path'), fs = require('fs');
const { ok, sleep } = L;

const dlgPrompt = async (p, text) => { await p.fill('.modal input, .modal textarea', text); await p.click('.modal .btn-primary'); };
const dlgConfirm = p => p.click('.modal .btn-danger, .modal .btn-primary');
async function fileMenu(p, name, label, badge) { await L.card(p, name, badge).locator('.doc-more').click(); await p.click(`.menu-item:has-text("${label}")`); }

async function run(browser) {
  console.log('\n=== Library: folders, import, file actions, check, settings, backup ===');
  const { ctx, p, logs } = await L.newSession(browser, { width: 1180, height: 820 });
  ok('заставка пропущена свайпом/нажатием, открыта главная', await p.locator('.hero').isVisible());
  const names = await p.$$eval('.subject-card strong', e => e.map(x => x.textContent));
  ok('8 предметов', names.length === 8 && names.includes('Патанатомия') && names.includes('Физиология'), names);
  await p.click('.subject-card:has(strong:text-is("Анатомия"))'); await p.waitForSelector('.subj-hero');
  ok('пустое состояние с понятной подсказкой', (await p.textContent('.empty-card')).includes('Добавьте конспекты'));
  // folders
  await p.click('.hero-actions .btn:has-text("Папка")'); await dlgPrompt(p, 'Лекции');
  await p.waitForSelector('.folder-card:has-text("Лекции")');
  await p.click('.folder-card:has-text("Лекции") .ibtn'); await p.click('.menu-item:has-text("Переименовать")'); await dlgPrompt(p, 'Лекции 1');
  await p.waitForSelector('.folder-card:has-text("Лекции 1")');
  await p.click('.folder-card:has-text("Лекции 1")'); await p.waitForSelector('.crumbs a:has-text("Лекции 1")');
  await p.click('.hero-actions .btn:has-text("Папка")'); await dlgPrompt(p, 'Вложенная');
  await p.waitForSelector('.folder-card:has-text("Вложенная")');
  ok('папки: создание, переименование, вложенность, путь', true);
  // import everything + broken ones
  const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.click('.hero-actions .btn-primary')]);
  await fc.setFiles([...['small.html', 'sample.html', 'sample.pdf', 'scan.pdf', 'sample.png', 'notes.txt', 'notes.md', 'sample.docx', 'broken.pdf'].map(n => ({ name: n, mimeType: 'application/octet-stream', buffer: fs.readFileSync(L.FX(n)) })),
    { name: 'bad.docx', mimeType: 'application/octet-stream', buffer: Buffer.from('not a docx') }, { name: 'bad.png', mimeType: 'image/png', buffer: Buffer.from('not a png') },
    { name: 'empty.txt', mimeType: 'text/plain', buffer: Buffer.alloc(0) }, { name: 'prog.exe', mimeType: 'application/octet-stream', buffer: Buffer.from('MZ') }]);
  await L.answerImportDialogs(p); await p.waitForSelector('.modal .btn-primary', { timeout: 120000 });
  const msg = await p.textContent('.modal');
  ok('повреждённые и неподходящие файлы — понятные сообщения на русском', /PDF-файл повреждён/.test(msg) && /DOCX-файл повреждён/.test(msg) && /изображение/.test(msg) && /пустой/.test(msg) && /не поддерживается/.test(msg), msg);
  await p.click('.modal .btn-primary');
  await p.waitForSelector('.doc-card:has(.doc-title:text-is("sample"))');
  const titles = await p.$$eval('.doc-title', e => e.map(x => x.textContent));
  ok('хорошие файлы добавлены (html, docx, txt, md, png, pdf)', ['small', 'sample', 'scan', 'notes'].every(n => titles.includes(n)) && titles.length === 8, titles);
  ok('у карточек настоящие обложки: оттенок предмета, наклейка, заголовок, тонкая линия прогресса', await p.evaluate(() => { const cs = [...document.querySelectorAll('.doc-card')]; return cs.length >= 4 && cs.every(c => c.querySelector('.cover .sticker') && c.querySelector('.cover .doc-title') && c.querySelector('.cover .cover-prog') && !c.querySelector('.cover > img')); }));
  ok('плашка типа файла в углу и не перекрывает заголовок', await p.evaluate(() => [...document.querySelectorAll('.doc-card')].every(c => { const b = c.querySelector('.cover-type').getBoundingClientRect(), t = c.querySelector('.doc-title').getBoundingClientRect(); return b.bottom <= t.top + 1; })));
  await p.click('.doc-card .doc-more >> nth=0'); await p.click('.menu-item:has-text("Сведения")'); await p.waitForSelector('.modal .det-thumb');
  ok('миниатюра первой страницы — только в окне сведений', await p.evaluate(() => !!document.querySelector('.modal .det-thumb')));
  await p.click('.modal .btn:has-text("Закрыть")');
  // file actions
  await fileMenu(p, 'scan', 'Переименовать', 'PDF'); await dlgPrompt(p, 'Скан лекции');
  await p.waitForSelector('.doc-card:has(.doc-title:text-is("Скан лекции"))');
  await fileMenu(p, 'notes', 'Переместить', 'TXT'); await p.click('.dest-row:text-is("Физиология")'); await sleep(500);
  ok('файл перемещён в другой предмет', !(await L.card(p, 'notes', 'TXT').count()));
  await fileMenu(p, 'notes', 'Удалить', 'MD'); await sleep(400);
  ok('удаление: файл исчезает, внизу «Вернуть» (мягкое удаление, корзина 30 дней)', !(await L.card(p, 'notes', 'MD').count()) && await p.locator('.toast .toast-act').isVisible());
  await p.click('.toast .toast-act'); await sleep(500);
  ok('«Вернуть» возвращает файл', !!(await L.card(p, 'notes', 'MD').count()));
  await fileMenu(p, 'notes', 'Удалить', 'MD'); await sleep(400);
  ok('файл в корзине (запись остаётся с отметкой удаления)', (await L.idb(p, 'files')).some(f => f.name === 'notes' && f.deleted));
  await p.click('.folder-card:has-text("Вложенная") .ibtn'); await p.click('.menu-item:has-text("Удалить")');
  ok('удаление папки просит подтверждения', (await p.textContent('.modal')).includes('Вложенная'));
  await dlgConfirm(p); await sleep(400);
  ok('папка удалена', !(await p.locator('.folder-card:has-text("Вложенная")').count()));
  ok('карточки показывают тип, объём и прогресс', await p.evaluate(() => !!document.querySelector('.doc-card .cover-prog') && !!document.querySelector('.doc-card .cover-type')));

  // annotations + reset + delete cascades
  await L.openFile(p, 'small', 'HTML');
  await L.frameSelect(p, 'p', 7, 21); await p.waitForSelector('.pill.show'); await p.click('.pill .pbtn.main'); await sleep(900);
  ok('в базе есть пометка', (await L.idb(p, 'annotations')).length === 1);
  await p.click('.rd-back'); await p.waitForSelector('.doc-card'); await sleep(500);
  await fileMenu(p, 'small', 'Сбросить', 'HTML');
  ok('сброс просит подтверждения и предупреждает о пометках', (await p.textContent('.modal')).includes('пометки'));
  await dlgConfirm(p); await p.waitForFunction(() => !document.querySelector('.progress-bar')); await sleep(500);
  ok('после сброса пометок нет', (await L.idb(p, 'annotations')).length === 0);
  await L.openFile(p, 'small', 'HTML');
  await L.frameSelect(p, 'p', 7, 21); await p.waitForSelector('.pill.show'); await p.click('.pill .pbtn.main'); await sleep(900);
  await p.click('.rd-back'); await p.waitForSelector('.doc-card'); await sleep(300);
  await fileMenu(p, 'small', 'Удалить', 'HTML'); await sleep(500);
  ok('в корзине пометки сохраняются (можно вернуть)', (await L.idb(p, 'annotations')).length > 0);
  await p.evaluate(() => { location.hash = '#/settings'; }); await p.waitForSelector('.trash-item'); await p.click('.trash-item:has-text("small") .btn-danger-soft'); await dlgConfirm(p); await sleep(600);
  ok('«Навсегда» из корзины удаляет файл и его пометки', (await L.idb(p, 'annotations')).length === 0 && !(await L.idb(p, 'files')).some(f => f.name === 'small'));
  await p.evaluate(() => history.back()); await p.waitForSelector('.doc-card');

  // backup + restore with annotations
  await L.openFile(p, 'sample', 'PDF');
  await L.frameSelect(p, 'p', 0, 20);
  await p.waitForSelector('.pill.show'); await p.click('.pill .pbtn >> nth=3'); await p.waitForSelector('.popover textarea'); await p.fill('.popover textarea', 'Заметка к PDF'); await p.click('.popover .btn-primary'); await sleep(900);
  ok('заметка к PDF сохранена как запись', (await L.idb(p, 'annotations')).some(a => a.type === 'note' && a.note === 'Заметка к PDF'));
  await p.click('.rd-back'); await p.waitForSelector('.doc-card');
  await p.evaluate(() => { location.hash = '#/settings'; }); await p.waitForSelector('.theme-card');
  await p.click('text=Сделать копию'); await p.waitForSelector('.modal:has-text("Копия готова")', { timeout: 120000 });
  const [bk] = await Promise.all([p.waitForEvent('download'), p.click('.modal .btn-primary:has-text("Сохранить копию")')]);
  const zipPath = path.join(L.ROOT, 'qa', 'backup.zip'); await bk.saveAs(zipPath);
  ok('копия: ZIP-файл', fs.readFileSync(zipPath).slice(0, 2).toString() === 'PK');
  await sleep(500);
  ok('дата копии запомнена', (await L.idb(p, 'kv', 'lastBackup')).value > 0);
  const snap = async () => ({ files: (await L.idb(p, 'files')).length, docs: (await L.idb(p, 'docs')).length, work: (await L.idb(p, 'work')).length, ann: (await L.idb(p, 'annotations')).length, folders: (await L.idb(p, 'folders')).length, study: (await L.idb(p, 'study')).length });
  const s0 = await snap();
  await p.evaluate(() => { location.hash = '#/subject/anatomy'; }); await p.waitForSelector('.folder-card'); await sleep(300);
  await p.click('.folder-card:has-text("Лекции 1")'); await p.waitForSelector('.crumbs a:has-text("Лекции 1")');
  await fileMenu(p, 'sample', 'Удалить', 'PDF'); await sleep(500);
  ok('перед восстановлением данные нарушены (файл в корзине)', (await L.idb(p, 'files')).some(f => f.name === 'sample' && f.deleted));
  await p.evaluate(() => { location.hash = '#/settings'; }); await p.waitForSelector('.theme-card');
  let [fcr] = await Promise.all([p.waitForEvent('filechooser'), p.click('text=Восстановить из копии')]);
  await fcr.setFiles(zipPath);
  await p.waitForSelector('.modal:has-text("Объединить")'); await p.click('.modal .btn:has-text("Объединить с текущим")');
  await p.waitForSelector('.modal:has-text("Данные восстановлены")', { timeout: 120000 }); await p.click('.modal .btn-primary');
  ok('объединение возвращает файлы и пометки', JSON.stringify(await snap()) === JSON.stringify(s0), [s0, await snap()]);
  await p.evaluate(() => { location.hash = '#/subject/philosophy'; }); await p.waitForSelector('.subj-hero');
  await L.importFiles(p, ['small.html']);
  [fcr] = await Promise.all([p.waitForEvent('filechooser'), (async () => { await p.evaluate(() => { location.hash = '#/settings'; }); await p.waitForSelector('.theme-card'); await p.click('text=Восстановить из копии'); })()]);
  await fcr.setFiles(zipPath);
  await p.waitForSelector('.modal:has-text("Что внутри копии")'); await p.click('.modal .btn:has-text("Заменить всё")');
  ok('«Заменить всё» просит подтверждения в интерфейсе', await p.waitForSelector('.modal:has-text("Заменить всё?")', { timeout: 5000 }).then(() => true).catch(() => false));
  await p.click('.modal .btn:has-text("Да, заменить")');
  await p.waitForSelector('.modal:has-text("Данные восстановлены")', { timeout: 120000 }); await p.click('.modal .btn-primary');
  ok('«Заменить всё» даёт ровно состояние копии', JSON.stringify(await snap()) === JSON.stringify(s0), [s0, await snap()]);

  // settings
  await p.evaluate(() => { location.hash = '#/settings'; }); await p.waitForSelector('.theme-card');
  ok('настройки: шесть тем, «Цианотипия» по умолчанию', (await p.$$('.theme-card')).length === 6 && (await p.getAttribute('html', 'data-theme')) === 'cyan');
  await p.click('.theme-card:has(strong:text-is("Глубина"))'); await sleep(400);
  ok('тема «Глубина» применилась', (await p.getAttribute('html', 'data-theme')) === 'deep' && await p.evaluate(() => getComputedStyle(document.body).backgroundColor !== 'rgb(238, 242, 246)'));
  await L.reload(p); await sleep(500);
  ok('тема сохраняется после перезагрузки (без белой вспышки)', (await p.getAttribute('html', 'data-theme')) === 'deep');
  await p.waitForSelector('.theme-card');
  ok('настройки: «Мой темп» — три варианта, по умолчанию «Обычно»', await p.evaluate(() => [...document.querySelectorAll('.pace-seg .seg-btn')].map(b => b.textContent + (b.classList.contains('on') ? '*' : '')).join('|')) === 'Медленно ×1.4|Обычно ×1*|Быстро ×0.75');
  await p.click('.pace-seg .seg-btn:has-text("Медленно")'); await sleep(400);
  const st = (await L.idb(p, 'kv', 'settings')).value;
  ok('настройки сохраняются (темп, тема)', st.pace === 'slow' && st.theme === 'deep', st);
  await p.click('.pace-seg .seg-btn:has-text("Обычно")'); await sleep(300);
  await p.waitForFunction(() => /Занято/.test(document.body.textContent), null, { timeout: 5000 }).catch(() => {});
  ok('настройки: занятое место', /Занято: .+/.test(await p.textContent('.content')));
  await p.click('.theme-card:has(strong:text-is("Лёд"))');

  // receipt (Round 10: the open receipt; the full flow is in t-r10.cjs)
  await p.evaluate(() => { location.hash = '#/check'; }); await p.waitForSelector('.rc-sheet'); await sleep(300);
  const rc = (await p.textContent('.rc-top')).replace(/\u00a0/g, ' ');
  ok('чек: заголовок, дата и пустое состояние', /ЧЕК УЧЁБЫ · БИБЛИОТЕКА КОНСПЕКТОВ/.test(rc) && /Дата: /.test(rc), rc.slice(0, 120));
  ok('чек: разделитель пунктиром и «ВСЕГО ЗА ВСЁ ВРЕМЯ»', rc.includes('ВСЕГО ЗА ВСЁ ВРЕМЯ') && await p.evaluate(() => getComputedStyle(document.querySelector('.rc-sep')).borderTopStyle === 'dotted'));
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('text=Сохранить картинкой')]);
  const png = path.join(L.ROOT, 'qa', 'chek.png'); await dl.saveAs(png);
  ok('чек: «Сохранить картинкой» даёт PNG', fs.readFileSync(png).slice(1, 4).toString() === 'PNG');
  await p.screenshot({ path: L.OUT + '/check.png' });

  // splash is shown on a fresh session
  const s2 = await L.newSession(browser, { width: 820, height: 1180 });
  ok('нет console.error в основных сценариях', logs.length === 0 && s2.logs.length === 0, [logs, s2.logs]);
  await s2.ctx.close();
  await ctx.close();
}
module.exports = { run };
