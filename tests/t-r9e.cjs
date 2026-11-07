// Round 9, phase 5: DOCX through docx-preview (Word's own look), offline metric-compatible fonts, shapes notice, «Пересобрать».
const L = require('./lib.cjs'); const path = require('path'), fs = require('fs'), { execFileSync } = require('child_process'); const { ok, sleep } = L;
const D = path.join(L.ROOT, 'tests', 'fixtures', 'r9');
function genShapes() {
  const f = path.join(D, '09-shapes.docx'); if (fs.existsSync(f)) return;
  const py = path.join(D, '_g.py'); fs.writeFileSync(py, `
import docx, sys
from docx.oxml import parse_xml
d = docx.Document(); d.add_heading('Схема в текстовом поле', 1); p = d.add_paragraph('Перед схемой. ')
xml = '<w:r xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:v="urn:schemas-microsoft-com:vml"><w:pict><v:shape id="s1" style="width:200pt;height:60pt"><v:textbox><w:txbxContent><w:p><w:r><w:t>Текст в рамке</w:t></w:r></w:p></w:txbxContent></v:textbox></v:shape></w:pict></w:r>'
p._p.append(parse_xml(xml)); d.add_paragraph('После схемы.'); d.save(sys.argv[1])
`); try { execFileSync('python3', [py, f]); } finally { fs.unlinkSync(py); }
}
async function run(browser) {
  console.log('\n=== Round 9 / фаза 5: DOCX как в Word ===');
  fs.mkdirSync(D, { recursive: true }); genShapes();
  const { ctx, p, logs } = await L.newSession(browser, { width: 1000, height: 700 });
  await L.openSubject(p, 'Анатомия');
  await L.importFiles(p, ['../regression/03-angiology.docx', 'r9/09-shapes.docx', '../regression/02-plain-splanchnology.html']);
  const files = await L.idb(p, 'files'); const F = () => L.frameOf(p);
  const open = async (name, mode) => { const f = files.find(x => x.name === name); await p.evaluate(() => { location.hash = '#/'; }); await sleep(250); await p.evaluate(id => { location.hash = '#/file/' + id; }, f.id); await p.waitForSelector('.reader'); await p.waitForFunction(() => window.__reader && window.__reader.doc() && window.__reader.doc().mode, null, { timeout: 30000 }); if (mode) await L.switchTo(p, mode); else await L.waitFrameReady(p); await sleep(400); };

  await open('03-angiology', 'normal');
  const r = await F().evaluate(() => {
    const all = [...document.querySelectorAll('body *')].filter(e => !e.closest('.lz-own,.lz-chrome,style'));
    const cs = e => getComputedStyle(e);
    const rgb = (e, k) => cs(e)[k];
    const crimson = all.filter(e => rgb(e, 'color') === 'rgb(155, 28, 49)' && /Ангиология|Раздел/.test(e.textContent));
    const rule = all.some(e => cs(e).borderBottomStyle === 'solid' && parseFloat(cs(e).borderBottomWidth) > 0 && rgb(e, 'borderBottomColor') === 'rgb(155, 28, 49)');
    const callout = all.find(e => rgb(e, 'backgroundColor') === 'rgb(253, 233, 236)' && /Белок|белок|Артерия/i.test(e.textContent));
    const bar = callout && parseFloat(cs(callout).borderLeftWidth) >= 3 && cs(callout).borderLeftColor === 'rgb(155, 28, 49)';
    const th = all.filter(e => /^(TD|TH)$/.test(e.tagName) && rgb(e, 'backgroundColor') === 'rgb(242, 201, 208)');
    const latin = all.find(e => /arteria carotis/.test(e.textContent) && e.children.length === 0 && cs(e).fontStyle === 'italic' && rgb(e, 'color') === 'rgb(176, 48, 90)');
    const tables = document.querySelectorAll('table').length, imgs = document.querySelectorAll('img').length;
    const have = new Set([...document.fonts].map(f => f.family.replace(/"/g, ''))); const fonts = ['Calibri', 'Cambria'].map(f => have.has(f) && document.fonts.check('16px "' + f + '"'));
    const cap = [...document.querySelectorAll('p,span')].some(e => /^Рис\. \d/.test(e.textContent.trim()) && cs(e).fontStyle === 'italic');
    return { crimson: crimson.length, rule, callout: !!callout, bar: !!bar, th: th.length, latin: !!latin, tables, imgs, fonts, cap, engine: !!document.querySelector('[class*="docx"]'), banner: !!document.querySelector('.lz-docx-note') };
  });
  ok('DOCX: заголовки в цвете файла (малиновый) и линия под ними', r.crimson >= 3 && r.rule, r);
  ok('DOCX: цветная врезка с заливкой и линией слева', r.callout && r.bar, r);
  ok('DOCX: таблицы с залитой шапкой, 3 таблицы', r.tables === 3 && r.th >= 9, r);
  ok('DOCX: латинские слова цветные и курсивом', r.latin, r);
  ok('DOCX: 3 картинки с подписями курсивом', r.imgs === 3 && r.cap, r);
  ok('DOCX: отрисовано docx-preview (классы docx-*), без предупреждения о схемах', r.engine && !r.banner, r);
  const man = await p.evaluate(async () => Object.keys((await import('./js/frame/fonts.js')).DOC_FONTS));
  ok('шрифты Word работают офлайн: Calibri→Carlito, Cambria→Caladea, Times New Roman→Tinos, Arial→Arimo (встроены в документ)', r.fonts.every(Boolean) && ['Calibri', 'Cambria', 'Times New Roman', 'Arial', 'Carlito', 'Caladea', 'Tinos', 'Arimo'].every(f => man.includes(f)), [r.fonts, man.length]);
  await p.screenshot({ path: path.join(L.ROOT, 'docs', 'qa', 'round9', 'docx-angiology-normal.png') }).catch(async () => { fs.mkdirSync(path.join(L.ROOT, 'docs', 'qa', 'round9'), { recursive: true }); await p.screenshot({ path: path.join(L.ROOT, 'docs', 'qa', 'round9', 'docx-angiology-normal.png') }); });
  const srch = await p.evaluate(async () => { const lib = await import('./js/library.js'); return (await lib.searchLibrary('сосуды')).map(r => r.file.name); });
  ok('поиск по тексту Word работает (текст выделен через mammoth)', srch.includes('03-angiology'), srch);
  await open('03-angiology', 'blocks');
  const bl = await F().evaluate(() => window.__lz.segments().map(s => ({ t: s.title, m: s.min })));
  ok('Блоки в DOCX: заголовки разделов становятся блоками', bl.length >= 3 && bl.every(b => b.t && b.m >= 1.9), bl);
  await open('03-angiology', 'book');
  ok('Книга в DOCX: страницы с обложкой', await F().evaluate(() => !!document.querySelector('.lz-cover') && window.__lz.book.pages >= 4));

  await open('09-shapes', 'normal');
  const note = await F().evaluate(() => (document.querySelector('.lz-docx-note') || {}).textContent || '');
  ok('схемы/текстовые поля: «Часть схем из Word не отображается. Сохрани файл как PDF и загрузи PDF — будет точь-в-точь»', /Часть схем из Word не отображается/.test(note) && /Сохрани файл как PDF/.test(note), note);
  ok('текст файла при этом не теряется', await F().evaluate(() => /Перед схемой/.test(document.body.textContent) && /После схемы/.test(document.body.textContent)));

  // ---- already imported Word files: «Пересобрать» on the card ----
  const f3 = files.find(x => x.name === '03-angiology');
  await p.evaluate(async id => { const db = await import('./js/db.js'); const w = await db.get('work', id); delete w.engine; w.html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>old</title></head><body><main><h1>Старая версия</h1><p>серый текст mammoth</p></main></body></html>'; await db.put('work', w); const m = await db.get('files', id); delete m.engine; await db.put('files', m); }, f3.id);
  await p.evaluate(() => { location.hash = '#/subject/anatomy'; }); await p.waitForSelector('.doc-card'); await sleep(400);
  const btn = await p.$('.doc-card:has(.doc-title:text-is("03-angiology")) .rebuild-chip, .doc-card:has(.doc-title:text-is("03-angiology")) button:has-text("Пересобрать")');
  ok('на карточке старого Word-файла есть «Пересобрать»', !!btn);
  const plainCard = await p.$('.doc-card:has(.doc-title:text-is("02-plain-splanchnology")) button:has-text("Пересобрать")');
  ok('на карточках HTML «Пересобрать» нет (трогаем только Word)', !plainCard);
  if (btn) { await btn.click(); await p.waitForFunction(() => !document.querySelector('.progress-bar'), null, { timeout: 60000 }); await sleep(600); }
  const m2 = (await L.idb(p, 'files')).find(x => x.id === f3.id);
  ok('после «Пересобрать» файл собран через docx-preview', m2.engine === 'dp', m2);
  await open('03-angiology', 'normal');
  ok('после «Пересобрать» цвета как в Word', await F().evaluate(() => [...document.querySelectorAll('body *')].some(e => getComputedStyle(e).color === 'rgb(155, 28, 49)')));
  ok('нет ошибок в консоли', logs.length === 0, logs);
  await ctx.close();
}
module.exports = { run };
