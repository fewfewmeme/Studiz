// Generates large fixtures for the reader performance tests (162 pages): node tests/gen-perf-fixtures.cjs
// angiology162.html — text with headings, tables and pictures (about 162 Книга pages at 1180x820)
// scan162.pdf       — 162 raster pages (page-picture layout), like a scanned lecture
const fs = require('fs'), path = require('path');
const pw = require('playwright');
const out = path.join(__dirname, 'fixtures', 'perf');
fs.mkdirSync(out, { recursive: true });
const words = 'артерия вена сосуд стенка просвет интима медиа адвентиция эндотелий кровоток давление сердце аорта ветвь анастомоз коллатераль капилляр венула артериола лимфа узел проток ствол плечеголовной подключичная сонная общая наружная внутренняя'.split(' ');
let seed = 7; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const sent = () => { const n = 8 + Math.floor(rnd() * 10); let s = []; for (let i = 0; i < n; i++) s.push(words[Math.floor(rnd() * words.length)]); s[0] = s[0][0].toUpperCase() + s[0].slice(1); return s.join(' ') + '.'; };
const para = () => { const n = 3 + Math.floor(rnd() * 4); return Array.from({ length: n }, sent).join(' '); };
(async () => {
  const browser = await pw.chromium.launch(); const page = await browser.newPage({ viewport: { width: 900, height: 1200 } });
  // inline picture (about 40 KB of noisy jpeg) reused
  const img = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 900; c.height = 500; const x = c.getContext('2d'); for (let i = 0; i < 400; i++) { x.fillStyle = `hsl(${i * 7 % 360},60%,${40 + (i % 30)}%)`; x.fillRect(Math.random() * 900, Math.random() * 500, 80, 80); } return c.toDataURL('image/jpeg', 0.8); });
  let html = '<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Ангиология</title><style>body{font:17px/1.55 Georgia,serif;max-width:760px;margin:0 auto;padding:24px}h1{font-size:30px}h2{font-size:22px;border-bottom:1px solid #999}table{border-collapse:collapse;width:100%}td,th{border:1px solid #999;padding:4px 8px}img{max-width:100%}</style></head><body><h1>Ангиология</h1>';
  for (let ch = 1; ch <= 54; ch++) {
    html += `<h2>Глава ${ch}. ${words[ch % words.length]} ${words[(ch * 3) % words.length]}</h2>`;
    for (let i = 0; i < 9; i++) html += `<p>${para()}</p>`;
    if (ch % 3 === 0) html += `<table><tr><th>Сосуд</th><th>Ветвь</th><th>Область</th></tr>${Array.from({ length: 6 }, () => `<tr><td>${sent()}</td><td>${sent()}</td><td>${sent()}</td></tr>`).join('')}</table>`;
    if (ch % 2 === 0) html += `<p><img src="${img}" alt="рисунок"></p>`;
  }
  fs.writeFileSync(path.join(out, 'angiology162.html'), html + '</body></html>');
  // scan PDF: 162 page pictures
  const pages = await page.evaluate(() => { const r = []; for (let p = 0; p < 162; p++) { const c = document.createElement('canvas'); c.width = 840; c.height = 1188; const x = c.getContext('2d'); x.fillStyle = '#f7f4ea'; x.fillRect(0, 0, 840, 1188); for (let i = 0; i < 40; i++) { x.fillStyle = '#222'; x.fillRect(60, 80 + i * 26, 300 + Math.random() * 420, 6); } for (let i = 0; i < 120; i++) { x.fillStyle = `rgba(${(i * 37) % 255},${(i * 91) % 255},120,.25)`; x.fillRect(Math.random() * 800, Math.random() * 1150, 50, 50); } x.fillStyle = '#000'; x.font = '28px sans-serif'; x.fillText('Страница ' + (p + 1), 60, 60); r.push(c.toDataURL('image/jpeg', 0.7)); } return r; });
  await page.setContent('<body style="margin:0">' + pages.map(u => `<img src="${u}" style="display:block;width:210mm;height:297mm;page-break-after:always">`).join('') + '</body>');
  await page.pdf({ path: path.join(out, 'scan162.pdf'), format: 'A4', printBackground: true, margin: { top: 0, bottom: 0, left: 0, right: 0 } });
  await browser.close();
  for (const f of fs.readdirSync(out)) console.log(f, (fs.statSync(path.join(out, f)).size / 1048576).toFixed(2), 'MB');
})();
