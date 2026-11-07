// Round 7 fixtures (synthetic; her real files stay in /fixtures-private/ which is git-ignored).
// node tests/gen-r7-fixtures.cjs   -> tests/fixtures/r7/*
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const sharp = require('sharp');
const out = path.join(__dirname, 'fixtures', 'r7'); fs.mkdirSync(out, { recursive: true });
const W = ['артерия', 'вена', 'желудок', 'кишка', 'печень', 'брюшина', 'сальник', 'связка', 'брыжейка', 'слизистая', 'мышечная', 'оболочка', 'сфинктер', 'ворота', 'долька', 'поджелудочная', 'селезёнка', 'двенадцатиперстная', 'ободочная', 'прямая', 'пищевод', 'глотка', 'диафрагма'];
const para = (n, s = 0) => { const a = []; for (let i = 0; i < n; i++) a.push(W[(i * 5 + s * 3 + (i % 4)) % W.length]); const t = a.join(' '); return t[0].toUpperCase() + t.slice(1) + '.'; };
const LAT = ['peritoneum', 'omentum majus', 'mesenterium', 'ductus choledochus', 'lig. hepatogastricum', 'tunica mucosa'];

(async () => {
  // ---------- (b) plain styled HTML, like «Спланхнология» ----------
  let b = '';
  b += `<header class="top"><div class="eyebrow">Анатомия человека · подготовка к экзамену</div><h1>Спланхнология</h1><p class="lead">Пищеварительная и дыхательная системы: строение, топография, кровоснабжение.</p></header>\n`;
  const parts = ['КОНТРОЛЬНАЯ ТОЧКА 1. Пищеварительная система', 'КОНТРОЛЬНАЯ ТОЧКА 2. Печень и желчные пути', 'КОНТРОЛЬНАЯ ТОЧКА 3. Дыхательная система'];
  let k = 0;
  parts.forEach((pt, pi) => {
    b += `<h2 class="part">${pt}</h2>\n`;
    for (let s = 1; s <= 3; s++) {
      k++;
      b += `<h3>${pi + 1}.${s} Тема ${W[k]}</h3>\n`;
      for (let p = 0; p < 3; p++) b += `<p>${para(95, k * 7 + p)} <span class="lat">${LAT[(k + p) % LAT.length]}</span> — ${para(18, k + p)}</p>\n`;
      b += `<div class="callout pink"><b>Спросят:</b> ${para(20, k)}</div>\n`;
      b += `<table><thead><tr><th>Отдел</th><th>Кровоснабжение</th><th>Иннервация и лимфоотток (длинное название столбца)</th></tr></thead><tbody>` + [1, 2, 3].map(r => `<tr><td>${W[r + k]}</td><td>${para(8, r + k)}</td><td>${para(14, r)} <span class="lat">${LAT[r]}</span></td></tr>`).join('') + `</tbody></table>\n`;
      b += `<div class="callout yellow">Запомнить: ${para(16, k + 3)}</div>\n<ul><li>${para(12, k)}</li><li>${para(10, k + 1)}</li><li>${para(9, k + 2)}</li></ul>\n`;
    }
  });
  fs.writeFileSync(path.join(out, 'plain-splanchnology.html'), `<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><title>Спланхнология</title><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
body{margin:0;background:#fbf6ee;color:#2b2622;font-family:Georgia,"PT Serif",serif;font-size:17px;line-height:1.65}
.wrap{max-width:860px;margin:0 auto;padding:36px 28px 80px}
.top{border-bottom:2px solid #c9a46a;margin-bottom:24px}.eyebrow{font:600 12px/1 system-ui,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#9a6b2e}
h1{font-size:40px;margin:.3em 0 .2em;color:#4a2f1a}.lead{font-style:italic;color:#6b5b4b}
h2.part{font-size:24px;color:#7a2e3a;border-left:6px solid #d98fa0;padding-left:14px;margin-top:2.2em}
h3{font-size:20px;color:#3d4f6b;margin-top:1.6em}
.lat{color:#b23a6a;font-style:italic;font-weight:600}
.callout{padding:12px 16px;border-radius:10px;margin:1em 0}.callout.pink{background:#fde4ea;border:1px solid #f1b6c4}.callout.yellow{background:#fff3bf;border:1px solid #e8d16a}
table{border-collapse:collapse;width:100%;margin:1em 0;font-size:15px}th,td{border:1.5px solid #8a6f4d;padding:7px 9px;text-align:left;vertical-align:top}th{background:#efe3cf}
ul{padding-left:1.3em}
</style></head><body><div class="wrap">\n${b}</div></body></html>`);

  // ---------- (a) app-HTML: sticky bar, JS-made block headers, localStorage counter, themes, Google Fonts, 30 images ----------
  const imgs = [];
  for (let i = 0; i < 30; i++) {
    const buf = await sharp({ create: { width: 480, height: 260, channels: 3, background: { r: 40 + i * 6, g: 120, b: 200 - i * 4 } } }).png().toBuffer();
    imgs.push(`data:image/png;base64,${buf.toString('base64')}`);
  }
  let secs = '';
  for (let s = 0; s < 12; s++) {
    secs += `<section class="blk" data-part="${s < 4 ? 'КТ 1' : s < 8 ? 'КТ 2' : 'КТ 3'}" data-lab="Блок ${s + 1}: ${W[s]}" data-num="${s + 1}"><h2>${W[s][0].toUpperCase() + W[s].slice(1)} — основное</h2>`;
    for (let p = 0; p < 3; p++) secs += `<p>${para(70, s * 5 + p)} <b class="t">${LAT[(s + p) % LAT.length]}</b></p>`;
    secs += `<figure><img alt="рис ${s}" src="${imgs[s]}"><figcaption>Рис. ${s + 1}</figcaption></figure>`;
    if (s % 3 === 0) secs += `<figure><img alt="рис ${s}b" src="${imgs[12 + s]}"><figcaption>Рис. ${s + 1}б</figcaption></figure>`;
    secs += `<div class="tk"><b>Спросят:</b> ${para(14, s)}</div></section>\n`;
  }
  const extra = imgs.slice(21).map((s, i) => `<section class="blk" data-part="КТ 3" data-lab="Атлас ${i + 1}"><h2>Атлас ${i + 1}</h2><img alt="атлас ${i}" src="${s}"><p>${para(30, i)}</p></section>`).join('\n');
  fs.writeFileSync(path.join(out, 'app-physiology.html'), `<!DOCTYPE html><html lang="ru" data-theme="light"><head><meta charset="utf-8"><title>Физиология — приложение</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Golos+Text:wght@400;600;700&display=swap" rel="stylesheet">
<style>
:root{--bg:#f4f1ea;--ink:#222;--accent:#2f6f8f}:root[data-theme=dark]{--bg:#14171c;--ink:#e6e6e6;--accent:#7cc4e4}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){--bg:#14171c;--ink:#e6e6e6}}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.6 "Golos Text",system-ui,sans-serif}
.bar{position:sticky;top:0;background:var(--accent);color:#fff;padding:10px 16px;display:flex;gap:12px;align-items:center;z-index:10}
#tools{position:fixed;right:10px;bottom:10px}#tools button{margin:2px}
main{max-width:760px;margin:0 auto;padding:20px}
.blk{background:rgba(255,255,255,.5);border:1px solid #c9d3da;border-radius:12px;padding:14px 18px;margin:16px 0}
.blk h2{color:var(--accent)}.t{color:#a33}.tk{background:#fff3bf;padding:8px 12px;border-radius:8px}
.jshead{font:700 12px system-ui;letter-spacing:.1em;color:var(--accent)}
img{max-width:100%}
</style></head><body>
<div class="bar"><b>Физиология</b><span id="cnt">0</span><button id="inc">+1</button><span id="clock">0:00</span></div>
<div id="tools"><button>маркер</button><button>ластик</button></div>
<main><h1>Физиология: конспект-приложение</h1>
${secs}${extra}</main>
<script>
document.querySelectorAll('.blk').forEach(function(s,i){var h=document.createElement('div');h.className='jshead';h.textContent='БЛОК '+(i+1)+' · '+(s.getAttribute('data-part')||'');s.insertBefore(h,s.firstChild);});
var c=+(localStorage.getItem('cnt')||0);document.getElementById('cnt').textContent=c;
document.getElementById('inc').onclick=function(){c++;localStorage.setItem('cnt',c);document.getElementById('cnt').textContent=c;};
var t=0;setInterval(function(){t++;document.getElementById('clock').textContent=Math.floor(t/60)+':'+String(t%60).padStart(2,'0');},1000);
</script></body></html>`);

  // ---------- (f) markdown ----------
  fs.writeFileSync(path.join(out, 'notes.md'), `# Конспект по гистологии\n\n## Эпителий\n\n${para(60, 1)}\n\n- первый пункт: ${para(8, 2)}\n- второй пункт: ${para(8, 3)}\n\n| Тип | Где | Функция |\n|---|---|---|\n| Плоский | сосуды | обмен |\n| Кубический | канальцы | всасывание |\n\n## Соединительная ткань\n\n${para(80, 4)}\n\n> Запомнить: ${para(10, 5)}\n`);

  // ---------- (c)/(d)/(e) PDFs + DOCX through python ----------
  const py = `
import sys
from reportlab.lib.pagesizes import A4, landscape
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
import glob, os
fonts = glob.glob('/usr/share/fonts/**/DejaVuSans.ttf', recursive=True)
bold = glob.glob('/usr/share/fonts/**/DejaVuSans-Bold.ttf', recursive=True)
pdfmetrics.registerFont(TTFont('DV', fonts[0])); pdfmetrics.registerFont(TTFont('DVB', bold[0]))
out = sys.argv[1]
words = sys.argv[2].split(',')
def para(n, s):
    return ' '.join(words[(i*5+s*3+(i%4)) % len(words)] for i in range(n))
# (c) landscape slides
c = canvas.Canvas(os.path.join(out, 'slides-landscape.pdf'), pagesize=landscape(A4))
w, h = landscape(A4)
for i in range(40):
    c.setFillColorRGB(0.95, 0.97, 1); c.rect(0, 0, w, h, fill=1, stroke=0)
    c.setFillColorRGB(0.1, 0.2, 0.4); c.setFont('DVB', 30); c.drawString(60, h-80, 'Слайд %d: %s' % (i+1, words[i % len(words)]))
    c.setFont('DV', 16); c.setFillColorRGB(0.1, 0.1, 0.1)
    for j in range(5): c.drawString(60, h-140-j*30, '• ' + para(7, i+j))
    c.showPage()
c.save()
# (d) portrait text PDF
c = canvas.Canvas(os.path.join(out, 'text-portrait.pdf'), pagesize=A4)
w, h = A4
for pg in range(8):
    c.setFont('DV', 9); c.setFillColorRGB(.5,.5,.5); c.drawString(60, h-30, 'Кафедра нормальной анатомии')
    c.drawString(w/2, 30, str(pg+1))
    y = h - 70
    c.setFillColorRGB(0, 0, 0)
    if pg % 2 == 0:
        c.setFont('DVB', 20); c.drawString(60, y, 'Глава %d. %s' % (pg//2+1, words[pg % len(words)])); y -= 34
    c.setFont('DV', 11)
    while y > 70:
        c.drawString(60, y, para(11, int(y)+pg)[:92]); y -= 16
    c.showPage()
c.save()
`;
  const fp = path.join(out, '_gen.py'); fs.writeFileSync(fp, py);
  execFileSync('python3', [fp, out, W.join(',')]); fs.unlinkSync(fp);
  const dpy = `
import sys, docx
d = docx.Document()
d.add_heading('Гистология: DOCX', 1)
words = sys.argv[2].split(',')
def para(n, s): return ' '.join(words[(i*5+s*3+(i%4)) % len(words)] for i in range(n))
for s in range(4):
    d.add_heading('Раздел %d' % (s+1), 2)
    d.add_paragraph(para(70, s))
    t = d.add_table(rows=2, cols=3); t.style = 'Table Grid'
    for r in range(2):
        for c in range(3): t.cell(r, c).text = para(3, r+c+s)
d.save(sys.argv[1] + '/doc.docx')
`;
  fs.writeFileSync(fp, dpy); execFileSync('python3', [fp, out, W.join(',')]); fs.unlinkSync(fp);
  console.log(fs.readdirSync(out).join('\n'));
})();
