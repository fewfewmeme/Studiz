// Regression fixtures that do not exist yet (existing files are never regenerated).
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const sharp = require('sharp');
const out = __dirname; const has = f => fs.existsSync(path.join(out, f));
const W = ['артерия', 'вена', 'желудок', 'кишка', 'печень', 'брюшина', 'сальник', 'связка', 'мышечная', 'оболочка', 'сфинктер', 'ворота', 'долька', 'белок', 'фермент', 'кислота', 'цепь', 'мембрана'];
const para = (n, s = 0) => { const a = []; for (let i = 0; i < n; i++) a.push(W[(i * 5 + s * 3 + (i % 4)) % W.length]); const t = a.join(' '); return t[0].toUpperCase() + t.slice(1) + '.'; };
(async () => {
  if (!has('01-app-pathanat.html')) {
    const img = 'data:image/png;base64,' + (await sharp({ create: { width: 480, height: 260, channels: 3, background: { r: 80, g: 130, b: 190 } } }).png().toBuffer()).toString('base64');
    let secs = '';
    for (let s = 0; s < 8; s++) {
      secs += `<section class="blk" data-part="${s < 4 ? 'КТ 1' : 'КТ 2'}" data-lab="Тема ${s + 1}: ${W[s]}"><h2>Тема ${s + 1}. ${W[s][0].toUpperCase() + W[s].slice(1)}</h2>`;
      for (let p = 0; p < 3; p++) secs += `<p>${para(80, s * 5 + p)} <b class="lat">${['peritoneum', 'omentum majus', 'mesenterium'][(s + p) % 3]}</b></p>`;
      if (s % 2 === 0) secs += `<figure><img alt="рис" src="${img}"><figcaption>Рис. ${s + 1}</figcaption></figure>`;
      secs += `<div class="ctl"><button class="go">▶ Начать</button><button class="dn">✓ Выучила</button><span class="st"></span></div></section>\n`;
    }
    fs.writeFileSync(path.join(out, '01-app-pathanat.html'), `<!DOCTYPE html><html lang="ru" data-theme="light"><head><meta charset="utf-8"><title>Патанатомия — приложение</title>
<style>:root{--bg:#f6f1e8;--ink:#1f2630;--ac:#8a2f3d}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.6 Georgia,serif}
.bar{position:sticky;top:0;z-index:9;background:var(--ac);color:#fff;padding:8px 14px;display:flex;gap:10px;align-items:center;font-family:system-ui}
main{max-width:780px;margin:0 auto;padding:18px}.blk{background:#fffdf8;border:1px solid #d9cdb8;border-radius:12px;padding:12px 18px;margin:16px 0}
.blk h2{color:var(--ac)}.lat{color:#a0305a;font-style:italic}.ctl{display:flex;gap:10px;align-items:center;margin-top:10px}
button{font:600 14px system-ui;padding:8px 14px;border-radius:10px;border:1px solid #b9a98a;background:#fff}.dn.on{background:#2f7d4f;color:#fff}.st{font:13px system-ui;color:#555}
figure{margin:12px 0}img{max-width:100%}</style></head><body>
<div class="bar"><b>Патанатомия</b><span id="cnt">0</span><button id="inc">+1</button></div>
<main><h1>Патологическая анатомия</h1>${secs}</main>
<script>
var c=+(localStorage.getItem('cnt')||0);document.getElementById('cnt').textContent=c;
document.getElementById('inc').onclick=function(){c++;localStorage.setItem('cnt',c);document.getElementById('cnt').textContent=c;};
document.querySelectorAll('.blk').forEach(function(s){var st=s.querySelector('.st'),t=0,iv=null;
s.querySelector('.go').onclick=function(){if(iv)return;iv=setInterval(function(){t++;st.textContent=Math.floor(t/60)+':'+String(t%60).padStart(2,'0');},1000);};
s.querySelector('.dn').onclick=function(){clearInterval(iv);iv=null;this.classList.add('on');this.textContent='✓ Выучила!';};});
</script></body></html>`);
  }
  const py = (code, ...args) => { const f = path.join(out, '_g.py'); fs.writeFileSync(f, code); try { execFileSync('python3', [f, ...args], { stdio: 'inherit' }); } finally { fs.unlinkSync(f); } };
  if (!has('03-angiology.docx')) {
    const png = path.join(out, '_img.png'); await sharp({ create: { width: 640, height: 320, channels: 3, background: { r: 200, g: 120, b: 120 } } }).png().toFile(png);
    py(`
import sys, docx
from docx.shared import Pt, RGBColor, Cm
from docx.oxml.ns import qn
from docx.oxml import OxmlElement
out, png, words = sys.argv[1], sys.argv[2], sys.argv[3].split(',')
def para(n, s): return ' '.join(words[(i*5+s*3+(i%4)) % len(words)] for i in range(n))
d = docx.Document()
def border(p, side, color, sz=12):
    pPr = p._p.get_or_add_pPr(); b = OxmlElement('w:pBdr'); e = OxmlElement('w:'+side)
    e.set(qn('w:val'), 'single'); e.set(qn('w:sz'), str(sz)); e.set(qn('w:space'), '4'); e.set(qn('w:color'), color); b.append(e); pPr.append(b)
def shade(p, fill):
    pPr = p._p.get_or_add_pPr(); s = OxmlElement('w:shd'); s.set(qn('w:val'), 'clear'); s.set(qn('w:fill'), fill); pPr.append(s)
def heading(t):
    p = d.add_paragraph(); r = p.add_run(t); r.bold = True; r.font.size = Pt(20); r.font.color.rgb = RGBColor(0x9b, 0x1c, 0x31); r.font.name = 'Cambria'; border(p, 'bottom', '9B1C31', 12); return p
h = d.add_paragraph(); r = h.add_run('Ангиология'); r.bold = True; r.font.size = Pt(28); r.font.color.rgb = RGBColor(0x9b, 0x1c, 0x31); border(h, 'bottom', '9B1C31', 18)
for s in range(3):
    heading('Раздел %d. Сосуды' % (s+1))
    p = d.add_paragraph(); p.add_run(para(60, s) + ' ')
    lat = p.add_run('arteria carotis communis'); lat.italic = True; lat.font.color.rgb = RGBColor(0xb0, 0x30, 0x5a)
    p.add_run(' — ' + para(20, s+1))
    c = d.add_paragraph(para(25, s+2)); shade(c, 'FDE9EC'); border(c, 'left', '9B1C31', 36)
    t = d.add_table(rows=3, cols=3); t.style = 'Table Grid'
    for ci, txt in enumerate(['Сосуд', 'Стенка', 'Функция']):
        cell = t.rows[0].cells[ci]; cell.text = txt
        tcPr = cell._tc.get_or_add_tcPr(); sh = OxmlElement('w:shd'); sh.set(qn('w:val'), 'clear'); sh.set(qn('w:fill'), 'F2C9D0'); tcPr.append(sh)
    for ri in (1, 2):
        for ci in range(3): t.rows[ri].cells[ci].text = para(3, ri+ci+s)
    d.add_picture(png, width=Cm(9))
    cap = d.add_paragraph('Рис. %d. Схема сосуда' % (s+1)); cap.runs[0].italic = True; cap.runs[0].font.size = Pt(9)
d.save(out + '/03-angiology.docx')
`, out, png, W.join(','));
    fs.unlinkSync(png);
  }
  if (!has('05-diagrams-landscape.pdf')) {
    py(`
import sys, random, math
from reportlab.lib.pagesizes import A4, landscape
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
import glob, os
pdfmetrics.registerFont(TTFont('DV', glob.glob('/usr/share/fonts/**/DejaVuSans.ttf', recursive=True)[0]))
pdfmetrics.registerFont(TTFont('DVB', glob.glob('/usr/share/fonts/**/DejaVuSans-Bold.ttf', recursive=True)[0]))
random.seed(7)
c = canvas.Canvas(sys.argv[1] + '/05-diagrams-landscape.pdf', pagesize=landscape(A4)); w, h = landscape(A4)
for pg in range(14):
    c.setFont('DVB', 26); c.drawString(50, h-60, 'Обмен сложных белков %d' % (pg+1) if pg >= 2 else 'Введение %d' % (pg+1))
    if 2 <= pg <= 8:   # diagram run: structure formulas, arrows, handwriting
        c.setLineWidth(1.4)
        for k in range(40):
            x = 80 + (k % 8) * 90; y = h - 140 - (k // 8) * 60
            c.line(x, y, x+30, y+15); c.line(x+30, y+15, x+60, y); c.circle(x+30, y+15, 6)
        c.setFont('DV', 14)
        for k in range(24): c.drawString(70 + (k % 6) * 120, 120 - (k // 6) * 22, 'C%dH%dO%d → NH2 ⇄ OH' % (k % 9, 2*(k % 5), k % 4))
        for k in range(30):   # handwriting-like curves
            p = c.beginPath(); x0 = 60 + random.random()*600; y0 = 80 + random.random()*300; p.moveTo(x0, y0)
            for j in range(12): p.curveTo(x0+j*4, y0+12*math.sin(j), x0+j*5, y0-8, x0+j*6+random.random()*3, y0+random.random()*6)
            c.drawPath(p, stroke=1, fill=0)
    else:
        c.setFont('DV', 18)
        for j in range(6): c.drawString(50, h-120-j*34, 'Пояснение: ' + ' '.join(['белок', 'цепь', 'мембрана', 'фермент'][(i+j) % 4] for i in range(8)))
    c.showPage()
c.save()
`, out);
  }
  console.log(fs.readdirSync(out).join('\n'));
})();
