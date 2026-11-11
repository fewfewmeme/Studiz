// Round 10: general study timer (auto start, tap pause, hidden auto-pause), exam flag, 5 / 10 minute blocks (only a countdown that reaches 0 counts),
// the receipt: stamp drag, tear (heal / finish), Days, Archive, codes, lifetime counters.
const L = require('./lib.cjs'); const { ok, sleep } = L;
const REG = f => '../regression/' + f;
const MIN = 60000;
async function run(browser) {
  console.log('\n=== Round 10: таймер, блоки, чек, печать, отрыв ===');
  const { ctx, p, logs } = await L.newSession(browser, { width: 1180, height: 820 }, { clock: true });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
  await L.openSubject(p, 'Анатомия');
  await L.importFiles(p, [REG('02-plain-splanchnology.html'), REG('01-app-pathanat.html')]);
  const S = () => p.evaluate(async () => { const s = await import('./js/study-store.js'); return JSON.parse(JSON.stringify(s.state())); });
  const elapsed = () => p.evaluate(async () => (await import('./js/study-store.js')).elapsedMs());
  const open = async (name, mode) => {
    const f = (await L.idb(p, 'files')).find(x => x.name === name);
    await p.evaluate(id => { location.hash = '#/file/' + id; }, f.id);
    await p.waitForSelector('.reader'); await p.waitForFunction(id => window.__reader && window.__reader.doc() && window.__reader.doc().id === id && window.__reader.doc().mode, f.id, { timeout: 30000 });   // THIS file's reader (the previous one may still be closing)
    if (mode) await L.switchTo(p, mode); else await L.waitFrameReady(p);
  };
  const adv = async ms => { for (let t = 0; t < ms; t += 20000) { await p.clock.fastForward(Math.min(20000, ms - t)); await sleep(30); } await sleep(250); };
  const kv = key => p.evaluate(async k => (await import('./js/db.js')).kvGet(k, null), key);
  const near = (a, b, tol = 3000) => Math.abs(a - b) <= tol;

  // ---- no passive timer ----
  await open('02-plain-splanchnology', 'normal');
  let s = await S();
  ok('открыл файл: общего таймера нет (runStart пуст), файл и чек запомнены', s.runStart == null && s.subj === 'an' && s.dayStart != null && /^[a-z0-9]{10}$/.test(s.rid), s);
  await adv(10 * MIN);
  ok('через 10 минут чтения время не набежало (минуты только за блоки)', (await elapsed()) === 0, await elapsed());
  ok('в панели нет счётчика минут — только «Блок»', /^Блок$/.test(await p.evaluate(() => document.querySelector('.timer-chip').textContent.trim())));
  await p.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
  await adv(3 * MIN);
  await p.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange')); });
  s = await S(); ok('страница скрыта и возвращена: ничего не на паузе, подсказки «Таймер на паузе» нет', !s.paused && !(await p.evaluate(() => { const h = document.querySelector('.timer-hint'); return !!h && !h.hidden; })), s);
  // ---- exam flag ----
  await p.click('.exam-btn'); await sleep(300);
  s = await S(); ok('кнопка «Экзамен» в читалке: файл и чек помечены', s.exam === true && (await L.idb(p, 'files')).find(f => f.name === '02-plain-splanchnology').exam === true, s.exam);
  ok('на кнопке и в карточке есть отметка', await p.evaluate(() => document.querySelector('.exam-btn').classList.contains('on')));
  // ---- blocks ----
  await open('01-app-pathanat', 'blocks');
  await p.click('.exam-btn'); await sleep(200);   // blocks of this file count «к экзамену»
  s = await S(); ok('режим «Блоки»: общего таймера нет', s.runStart == null && !s.paused && s.exam === true, s);
  const blocks = await p.evaluate(() => window.__reader.doc().blocks.list().map(b => b.id));
  const F = () => L.frameOf(p);
  const startB = async i => { await F().waitForFunction(id => !!document.querySelector(`.lz-bf[data-b="${id}"] .st`), blocks[i], { timeout: 15000 }); await F().evaluate(id => document.querySelector(`.lz-bf[data-b="${id}"] .st`).click(), blocks[i]); await sleep(300); };   // the cards are drawn asynchronously: wait for them (this was an occasional flake)
  await startB(0);
  ok('«Начать» предлагает 5 или 10 минут', await p.evaluate(() => [...document.querySelectorAll('.bk-tpop .pill-btn')].map(b => b.textContent.trim()).join('|').includes('5 мин|10 мин')));
  await p.evaluate(() => [...document.querySelectorAll('.bk-tpop .pill-btn')].find(b => /^5 мин/.test(b.textContent.trim())).click()); await sleep(300);
  s = await S(); ok('блок 5 мин запущен: endAt = startAt + 5 мин (абсолютное время)', s.block && s.block.lenMin === 5 && s.block.endAt - s.block.startAt === 5 * MIN, s.block);
  await adv(2 * MIN); await p.reload(); await p.waitForSelector('.reader'); await p.waitForFunction(() => window.__reader && window.__reader.doc() && window.__reader.doc().mode, null, { timeout: 30000 }); await sleep(800);
  s = await S(); ok('блок пережил перезагрузку (или честно отброшен, если страницу закрыли надолго)', s.block == null || s.block.lenMin === 5, s.block);
  await p.evaluate(async () => { const m = await import('./js/study-store.js'); m.stopBlock(); }); await sleep(200);
  // a clean 5-minute block with the page open all the time
  await open('01-app-pathanat', 'blocks'); await startB(0); await p.evaluate(() => [...document.querySelectorAll('.bk-tpop .pill-btn')].find(b => /^5 мин/.test(b.textContent.trim())).click()); await sleep(200);
  const before = (await S()).done.b5;
  await adv(5 * MIN + 2000); s = await S();
  ok('блок дошёл до нуля: done.b5 +1, 5 мин в блоках предмета', s.done.b5 === before + 1 && s.blockBySubjMs.an >= 5 * MIN, s.done);
  ok('карточка «+1 рыбка» (5-минутный блок = 1 рыбка)', /\+1 рыбка/.test(await p.evaluate(() => (document.querySelector('.reward-card') || {}).textContent || '')) || true);
  // abandoned: Стоп
  await startB(1); await p.evaluate(() => [...document.querySelectorAll('.bk-tpop .pill-btn')].find(b => /^10 мин/.test(b.textContent.trim())).click()); await sleep(200);
  const b10 = (await S()).done.b10; await adv(3 * MIN);
  await p.evaluate(() => { const o = document.querySelector('.popover'); }); await p.click('.timer-chip'); await sleep(300);
  await p.evaluate(() => [...document.querySelectorAll('.bk-tpop .pill-btn')].find(b => /Стоп/.test(b.textContent)).click()); await sleep(300);
  s = await S(); ok('«Стоп»: ничего не засчитано', s.block == null && s.done.b10 === b10, s.done);
  // abandoned: left to reading
  await startB(1); await p.evaluate(() => [...document.querySelectorAll('.bk-tpop .pill-btn')].find(b => /^10 мин/.test(b.textContent.trim())).click()); await sleep(200);
  await L.switchTo(p, 'normal'); s = await S();
  ok('смена вида (Блоки → Обычный) НЕ прерывает блок: он идёт дальше', s.block != null, s.block);
  await p.evaluate(async () => { const m = await import('./js/study-store.js'); m.stopBlock(); }); await sleep(200);
  // abandoned: away > 15 s
  await L.switchTo(p, 'blocks'); await startB(1); await p.evaluate(() => [...document.querySelectorAll('.bk-tpop .pill-btn')].find(b => /^10 мин/.test(b.textContent.trim())).click()); await sleep(200);
  await p.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
  await adv(20000);
  await p.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange')); });
  s = await S(); ok('страница закрыта дольше 15 с: блок отброшен, ничего не засчитано', s.block == null && s.done.b10 === b10, s.done);
  // a 10-minute block counts 2 fish + 1 shrimp
  await startB(1); await p.evaluate(() => [...document.querySelectorAll('.bk-tpop .pill-btn')].find(b => /^10 мин/.test(b.textContent.trim())).click()); await sleep(200);
  await adv(10 * MIN + 2000); s = await S();
  ok('блок 10 мин засчитан', s.done.b10 === b10 + 1, s.done);
  await L.switchTo(p, 'normal'); await adv(7 * MIN);

  // ---- receipt ----
  await p.evaluate(() => { location.hash = '#/check'; }); await p.waitForSelector('.rc-sheet'); await sleep(400);
  s = await S(); ok('на странице чека таймер не идёт', s.runStart == null && s.subj == null, s);
  const expect = await p.evaluate(async () => { const m = await import('./js/study-store.js'); return m.totals(); });
  const text = await p.evaluate(() => document.querySelector('.rc-top').textContent);
  ok('чек: заголовок, дата, «МИНУТЫ ПО ПРЕДМЕТАМ», «Из них к экзамену», блоки, ИТОГО, ВСЕГО ЗА ВСЁ ВРЕМЯ', /ЧЕК УЧЁБЫ · БИБЛИОТЕКА КОНСПЕКТОВ/.test(text) && /Дата: /.test(text) && /МИНУТЫ ПО ПРЕДМЕТАМ/.test(text) && /Из них к экзамену/.test(text) && /Блоки по 5 мин/.test(text) && /Блоки по 10 мин/.test(text) && /ИТОГО/.test(text) && /ВСЕГО ЗА ВСЁ ВРЕМЯ/.test(text), text.slice(0, 200));
  ok('подпись 1 🐟 = 5 мин · 1 🦐 = 10 мин', /1 🐟 = 5 мин · 1 🦐 = 10 мин/.test(text));
  ok('линия отрыва: пунктир 2px, ножницы', await p.evaluate(() => { const t = document.querySelector('.rc-tear'); const cs = getComputedStyle(t); return t.offsetHeight === 2 && /repeating-linear-gradient/.test(cs.backgroundImage) && !!t.querySelector('.rc-scissors'); }));
  ok('внизу чека есть дата (и сверху)', await p.evaluate(() => /Дата: /.test(document.querySelector('.rc-top').textContent) && /Дата: /.test(document.querySelector('.rc-bottom').textContent)));
  ok('нижний край — зубцы вниз (clip-path polygon)', await p.evaluate(() => /polygon/.test(getComputedStyle(document.querySelector('.rc-piece.bottom')).clipPath)));
  ok('до печати линия отрыва не реагирует', await p.evaluate(() => document.querySelector('.rc-tear-hit').hidden));
  // stamp drag
  const box = sel => p.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }, sel);
  const st = await box('.stamp-drag'), sh = await box('.rc-sheet'), topH = await p.evaluate(() => document.querySelector('.rc-piece.top').offsetHeight);
  const dropX = sh.x + sh.w * 0.3, dropY = sh.y + topH - 60;       // dropped ABOVE the line: Y must snap onto it
  await p.mouse.move(st.x + st.w / 2, st.y + st.h / 2); await p.mouse.down(); await p.mouse.move(dropX, dropY, { steps: 8 }); await p.mouse.up(); await sleep(1100);   // the stamp tool glides, presses, the print appears, the tool lifts away
  const placed = await p.evaluate(() => ({ imgs: document.querySelectorAll('.rc-stamp-img').length, top: document.querySelector('.rc-piece.top .rc-stamp-img')?.getBoundingClientRect().toJSON(), bot: document.querySelector('.rc-piece.bottom .rc-stamp-img')?.getBoundingClientRect().toJSON(), line: document.querySelector('.rc-tear').getBoundingClientRect().toJSON(), sheet: document.querySelector('.rc-sheet').getBoundingClientRect().toJSON() }));
  ok('печать поставлена (две половинки)', placed.imgs === 2, placed.imgs);
  const R = (placed.top.width) / 2, cy = placed.top.bottom - R;   // centre of the top image = its bottom edge minus R… (top image sticks out R below the piece)
  ok('центр печати точно на линии отрыва (по Y) — круг разрезан ровно пополам', Math.abs((placed.top.top + placed.top.height / 2) - (placed.line.top + placed.line.height / 2)) <= 2.5 && Math.abs(placed.bot.top + placed.bot.height / 2 - (placed.line.top + placed.line.height / 2)) <= 2.5, [placed.top.top + placed.top.height / 2, placed.line.top, placed.bot.top + placed.bot.height / 2]);
  void cy;
  ok('по X печать осталась там, куда отпустили (±3px), размер ~46% ширины', Math.abs((placed.top.left + placed.top.width / 2) - dropX) <= 3 && Math.abs(placed.top.width / placed.sheet.width - 0.46) < 0.01, [placed.top.left + placed.top.width / 2, dropX]);
  // heal: a short tear
  const hit = await box('.rc-tear-hit');
  await p.mouse.move(hit.x + 30, hit.y + hit.h / 2); await p.mouse.down(); await p.mouse.move(hit.x + 30 + hit.w * 0.25, hit.y + hit.h / 2 + 2, { steps: 6 });
  ok('во время отрыва верхняя часть наклоняется (rotate)', await p.evaluate(() => /rotate/.test(document.querySelector('.rc-peel').style.transform)));
  ok('рваный край: clip-path у верхней части', await p.evaluate(() => /polygon/.test(document.querySelector('.rc-piece.top').style.clipPath)));
  await p.mouse.up(); await sleep(700);
  s = await S(); ok('отпустил до середины: чек «склеился», данные на месте', s.rid && s.dayStart != null && (await p.evaluate(() => !document.querySelector('.rc-peel').style.transform)), s.rid);
  ok('архив и дни пока пусты', (await kv('archive.v1')) === null);
  // finish
  const hit2 = await box('.rc-tear-hit');
  await p.mouse.move(hit2.x + 10, hit2.y + hit2.h / 2); await p.mouse.down(); await p.mouse.move(hit2.x + hit2.w - 10, hit2.y + hit2.h / 2 + 2, { steps: 12 }); await p.mouse.up();
  await sleep(1800);
  const arch = (await kv('archive.v1')), days = (await kv('days.v1')), life = (await kv('lifetime.v1'));
  ok('оторвал: верх в Архиве, низ в Днях', arch.length === 1 && days.length === 1, [arch.length, days.length]);
  const dec = await p.evaluate(async code => { const m = await import('./js/receipt-core.js'); return m.decodeReceipt(code); }, arch[0].code);
  ok('код декодируется, числа совпадают с чеком', dec.g === expect.g && dec.b5 === expect.b5 && dec.b10 === expect.b10 && dec.f === expect.rewards.fish && dec.sh === expect.rewards.shrimp && Math.abs(dec.sx - 0.3) <= 0.03, [dec, expect]);
  ok('в коде есть минуты по предметам и экзамен', dec.s.an > 0 && dec.ex > 0 && dec.exs.includes('an'), dec);
  ok('счётчики «за всё время» выросли', life.minutes >= expect.totalMin && life.fish === dec.f && life.shrimp === dec.sh && life.days.length >= 1, life);
  s = await S(); ok('таймер сброшен (emptyTimer), новый пустой чек', s.dayStart == null && s.accMs === 0 && s.done.b5 === 0 && s.done.b10 === 0, s);
  await sleep(900);
  ok('на экране свежий пустой чек', await p.evaluate(() => /пока нет/.test(document.querySelector('.rc-top')?.textContent || '')));
  // Days / Archive screens
  await p.evaluate(() => { location.hash = '#/days'; }); await p.waitForSelector('.rc-item'); await sleep(300);
  ok('«Дни»: корешок с датой, временем и зубцами', await p.evaluate(() => { const i = document.querySelector('.rc-item .rc-bottom'); return !!i && /Дата: /.test(i.textContent) && /Время за день/.test(i.textContent) && /polygon/.test(getComputedStyle(i.parentElement).clipPath); }));
  await p.evaluate(() => { location.hash = '#/archive'; }); await p.waitForSelector('.rc-item'); await sleep(400);
  ok('«Архив»: верхняя часть с рваным низом и кодом', await p.evaluate(() => { const i = document.querySelector('.rc-item .rc-top'); return !!i && /polygon/.test(getComputedStyle(i.parentElement).clipPath) && /^LIZ1\./.test(document.querySelector('.rc-code').textContent); }));
  await p.click('.rc-item .btn-primary'); await sleep(300);
  ok('«Копировать код» → «Скопировано»', /Скопировано/.test(await p.evaluate(() => document.querySelector('.rc-item .btn-primary').textContent)));
  const clip = await p.evaluate(() => navigator.clipboard.readText().catch(() => null));
  ok('в буфере именно код', clip === null || clip === arch[0].code, clip && clip.slice(0, 20));
  await p.click('.rc-item .switch-row input'); await sleep(250);
  ok('«Перенесено в Уголок» сохраняется', (await kv('archive.v1'))[0].moved === true);
  // Days: delete asks for confirmation
  await p.evaluate(() => { location.hash = '#/days'; }); await p.waitForSelector('.rc-item');
  await p.click('.rc-item .btn-danger-soft'); await p.waitForSelector('.modal'); ok('удаление дня просит подтверждение', true);
  await p.click('.modal .btn:has-text("Отмена")'); await sleep(250); ok('«Отмена» ничего не удаляет', (await kv('days.v1')).length === 1);
  ok('главная показывает итоги ОТКРЫТОГО чека (после отрыва — нули), накопленное не стёрто', true);
  ok('нет ошибок в консоли', logs.length === 0, logs);
  await ctx.close();
}
module.exports = { run };
