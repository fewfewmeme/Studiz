// Создаёт тестовые файлы в tests/fixtures (не личные данные). Запуск: node tests/gen-fixtures.cjs
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const out = path.join(__dirname, 'fixtures');
fs.mkdirSync(out, { recursive: true });

const lorem = ['сердце', 'кровь', 'сосуд', 'клетка', 'ткань', 'орган', 'мышца', 'нерв', 'кость', 'железа', 'печень', 'почка', 'лёгкое', 'артерия', 'вена', 'эпителий'];
function para(n, seed = 0) { const w = []; for (let i = 0; i < n; i++) w.push(lorem[(i * 7 + seed * 3 + i % 5) % lorem.length]); return w.join(' ') + '.'; }

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 800, height: 1000 } });

  // PNG-картинка (>2 КБ, чтобы уходила в отдельную запись)
  await page.setContent('<body style="margin:0"><div style="width:800px;height:1000px;background:linear-gradient(135deg,#e3f2fd,#fff59d);font:48px sans-serif;padding:40px">Схема: сердце<br>Тестовая картинка<div style="margin-top:80px;width:300px;height:300px;border-radius:50%;background:#ef9a9a"></div></div></body>');
  await page.screenshot({ path: path.join(out, 'sample.png') });
  const png = fs.readFileSync(path.join(out, 'sample.png'));
  const b64 = png.toString('base64');

  // HTML: заголовки, абзацы, таблица, картинка base64, «опасные» вещи и стиль на body (как у старых артефактов)
  let body = '';
  for (let s = 1; s <= 6; s++) {
    body += `<h2>Раздел ${s}. Тема ${lorem[s]}</h2>\n`;
    for (let p = 0; p < 5; p++) body += `<p>${para(110, s * 10 + p)}</p>\n`;
    if (s === 2) body += `<p><img alt="схема" src="data:image/png;base64,${b64}" width="300"></p>\n`;
    if (s === 3) body += `<table><tr><th>Орган</th><th>Функция</th></tr><tr><td>Сердце</td><td>Насос</td></tr><tr><td>Почка</td><td>Фильтрация</td></tr></table>\n`;
  }
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Тестовый конспект</title>
<style>body{background:#202020;color:#eee;font-family:serif} .box{border:2px solid #4caf50;padding:8px} h2{color:#ffd54f}</style>
<script>document.title='x';window.hacked=1;</script></head>
<body onload="window.hacked=2"><div class="box" onclick="window.hacked=3">Блок с таймером: <span id="t">0</span><iframe src="https://example.com"></iframe><object data="x.swf"></object><embed src="x.swf"></div>
<button onclick="start()">Старт</button>
${body}</body></html>`;
  fs.writeFileSync(path.join(out, 'sample.html'), html);

  // маленький чистый HTML
  fs.writeFileSync(path.join(out, 'small.html'), `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Малый</title></head><body><h1>Малый конспект</h1><p>Первый абзац про сердце и сосуды. Здесь достаточно слов для выделения и пометок.</p><p>Второй абзац: печень, почки, лёгкие.</p></body></html>`);

  // PDF 6 страниц с текстом
  let pdfHtml = '<body style="font:16px sans-serif;margin:0">';
  for (let p = 1; p <= 6; p++) pdfHtml += `<div style="page-break-after:always;padding:20px"><h1>Страница ${p}</h1><p>${para(180, p)}</p><p>${para(120, p + 3)}</p></div>`;
  await page.setContent(pdfHtml);
  await page.pdf({ path: path.join(out, 'sample.pdf'), format: 'A4', printBackground: true });

  // PDF-скан: только картинка, без текстового слоя
  await page.setContent(`<body style="margin:0"><img src="data:image/png;base64,${b64}" style="width:100%"></body>`);
  await page.pdf({ path: path.join(out, 'scan.pdf'), format: 'A4' });

  fs.writeFileSync(path.join(out, 'broken.pdf'), Buffer.from('%PDF-1.4\nэто не настоящий pdf\n'.repeat(5)));
  fs.writeFileSync(path.join(out, 'notes.txt'), `Заметки по физиологии\n\n${para(60, 1)}\n\n${para(60, 2)}\nвторая строка абзаца\n`);
  fs.writeFileSync(path.join(out, 'notes.md'), `# Заметки по биохимии\n\n${para(50, 1)}\n\n## Подраздел\n\n- пункт один\n- пункт два\n\n**Жирный** текст и <script>alert(1)</script>\n`);

  // DOCX
  try {
    const docx = require('docx');
    const d = new docx.Document({ sections: [{ children: [
      new docx.Paragraph({ text: 'Документ Word', heading: docx.HeadingLevel.HEADING_1 }),
      new docx.Paragraph({ text: para(80, 4) }),
      new docx.Paragraph({ text: para(80, 5) }),
    ] }] });
    fs.writeFileSync(path.join(out, 'sample.docx'), await docx.Packer.toBuffer(d));
  } catch (e) { console.log('docx не создан:', e.message); }

  await browser.close();
  for (const f of fs.readdirSync(out)) console.log(f, fs.statSync(path.join(out, f)).size);
})();
