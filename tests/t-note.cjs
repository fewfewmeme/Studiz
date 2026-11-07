// «Текст»: paste Markdown into a subject (bold / headings / table are rendered), format, add a photo with wrapping + rotation, save, read in the reader, edit again.
const L = require('./lib.cjs'); const { ok } = L;
const MD = '# Сердце\n\nЭто **важный** текст и *курсив*.\n\n| Камера | Объём |\n|---|---|\n| Левое предсердие | 70 мл |\n\n- раз\n- два\n';
async function run(browser) {
  console.log('\n=== «Текст»: вставка, оформление, фото, чтение, правка ===');
  const { p, logs } = await L.newSession(browser, { width: 1180, height: 820 });
  await L.openSubject(p, 'Анатомия');
  await p.click('button:has-text("Вставить текст")'); await p.waitForSelector('.note-ed');
  // paste Markdown the way Safari delivers it: text/plain only
  await p.evaluate(md => { const ed = document.querySelector('.note-ed'); ed.focus(); const dt = new DataTransfer(); dt.setData('text/plain', md); ed.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); }, MD);
  await p.waitForFunction(() => document.querySelector('.note-ed table'), null, { timeout: 8000 });
  const st = await p.evaluate(() => { const e = document.querySelector('.note-ed'); return { h1: !!e.querySelector('h1'), strong: e.querySelector('strong')?.textContent, em: !!e.querySelector('em'), cells: e.querySelectorAll('td').length, th: e.querySelectorAll('th').length, li: e.querySelectorAll('li').length, stars: /\*\*/.test(e.textContent) }; });
  ok('Markdown: заголовок, **жирный**, *курсив*, таблица и список отрисованы', st.h1 && st.strong === 'важный' && st.em && st.th === 2 && st.cells === 2 && st.li === 2 && !st.stars, st);
  // colour / font / size on a selection
  await p.evaluate(() => { const e = document.querySelector('.note-ed'), r = document.createRange(), t = e.querySelector('strong').firstChild; r.setStart(t, 0); r.setEnd(t, t.length); getSelection().removeAllRanges(); getSelection().addRange(r); });
  await p.click('.note-sw:nth-child(2)'); await p.selectOption('.note-tools select[aria-label="Размер"]', '30'); await p.selectOption('.note-tools select[aria-label="Шрифт"]', 'serif');
  const sty = await p.evaluate(() => { const e = document.querySelector('.note-ed'); const sp = [...e.querySelectorAll('[style]')].map(x => x.getAttribute('style') || '').join('|'); return sp; });
  ok('цвет, размер и шрифт применились к выделению', /color/.test(sty) && /font-size:\s*30px/.test(sty) && /font-family/.test(sty), sty);
  // photo: insert, wrap left, rotate, size
  await p.setInputFiles('.note-view input[type=file]', L.FX('red.png'));
  await p.waitForSelector('.note-ed img');
  await p.click('.note-ed img'); await p.click('.note-ctx button[data-w="left"]');
  await p.evaluate(() => { const r = document.querySelector('.note-ctx input[aria-label="Поворот фото"]'); r.value = 20; r.dispatchEvent(new Event('input', { bubbles: true })); const w = document.querySelector('.note-ctx input[aria-label="Размер фото"]'); w.value = 30; w.dispatchEvent(new Event('input', { bubbles: true })); });
  const im = await p.evaluate(() => { const i = document.querySelector('.note-ed img'); const cs = getComputedStyle(i); return { wrap: i.dataset.wrap, float: cs.float, rot: i.style.transform, w: i.style.width }; });
  ok('фото: обтекание слева, поворот 20°, ширина 30%', im.wrap === 'left' && im.float === 'left' && /rotate\(20deg\)/.test(im.rot) && im.w === '30%', im);
  await p.click('.note-head .btn-primary');
  await p.waitForSelector('.reader', { timeout: 20000 }); await p.waitForFunction(() => window.__reader && window.__reader.doc() && window.__reader.doc().mode, null, { timeout: 30000 }); await L.waitFrameReady(p);
  const fr = L.frameOf(p);
  const rd = await fr.evaluate(() => ({ strong: !!document.querySelector('strong'), table: !!document.querySelector('table'), img: (() => { const i = document.querySelector('img[data-wrap]'); return i ? { wrap: i.dataset.wrap, float: getComputedStyle(i).float, rot: i.style.transform } : null; })(), h1: document.querySelector('h1')?.textContent }));
  ok('в читалке: жирный, таблица, фото с обтеканием слева и поворотом', rd.strong && rd.table && rd.img && rd.img.float === 'left' && /rotate\(20deg\)/.test(rd.img.rot) && /Сердце/.test(rd.h1 || ''), rd);
  const meta = (await L.idb(p, 'files')).find(f => f.note);
  ok('в библиотеке: файл-заметка предмета «Анатомия» с названием из заголовка', meta && meta.subject === 'anatomy' && meta.name === 'Сердце' && meta.words > 5, meta);
  // edit again
  await p.evaluate(id => { location.hash = '#/note/' + id; }, meta.id); await p.waitForSelector('.note-ed');
  const again = await p.evaluate(() => ({ table: !!document.querySelector('.note-ed table'), img: document.querySelector('.note-ed img')?.dataset.wrap }));
  ok('правка: текст, таблица и фото возвращаются в редактор', again.table && again.img === 'left', again);
  ok('без ошибок в консоли', !logs.length, logs);
}
module.exports = { run };
