// Synthetic fixtures for the adaptation engine (her real files are private and never committed).
//   node tests/gen-adapt-fixtures.cjs            -> tests/fixtures/adapt/*   (small, committed)  and tests/.tmp/big-13mb.html (generated, git-ignored)
// STRUCTURE copied from the facts about her 12 files: self-contained HTML mini-apps with Google Fonts <link>, one big <style> using BOTH
// :root[data-theme=dark] and @media (prefers-color-scheme: dark), scripts, sticky div.bar, #lb/#slb/#tools/#uhl, buttons, section.blk with
// data-sec/data-num/data-lab/data-img, inline classes .t .tm .hl .lbl .key .enz .lat .br .ma .tr .mv, <details>, tables, figure.fig data-URI images,
// tickets .tk .q .qa .ask .ticket, .mrow, .rv-item, .card.
const fs = require('fs'), path = require('path');
const sharp = require('sharp');
const OUT = path.join(__dirname, 'fixtures', 'adapt'), TMP = path.join(__dirname, '.tmp');
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(TMP, { recursive: true });
const WORDS = 'сердце артерия вена капилляр клапан стенка эндотелий интима медиа адвентиция лимфа узел проток аорта ветвь кровь давление фермент субстрат продукт белок цепь кислота ядро клетка мембрана рецептор сигнал гормон нерв синапс мышца кость сустав'.split(' ');
let seed = 7; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const sent = n => { const w = []; for (let i = 0; i < n; i++) w.push(WORDS[(rnd() * WORDS.length) | 0]); return w.join(' '); };
const img = async (w, h, hue, quality = 80) => {
  const buf = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 3, v = 128 + 90 * Math.sin((x + hue) / 23) * Math.cos(y / 31); buf[i] = v + hue % 60; buf[i + 1] = v; buf[i + 2] = 255 - v / 2 + ((rnd() * 12) | 0); }
  return 'data:image/jpeg;base64,' + (await sharp(buf, { raw: { width: w, height: h, channels: 3 } }).jpeg({ quality }).toBuffer()).toString('base64');
};

const APP_CSS = `:root{--bg:#ffffff;--ink:#1f2937;--acc:#0e7490;--hl:#fff3a0}
:root[data-theme="dark"]{--bg:#0d1117;--ink:#e6edf3;--acc:#67e8f9;--hl:#5b4b00}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--bg:#0d1117;--ink:#e6edf3;--acc:#67e8f9;--hl:#5b4b00}}
html,body{background:var(--bg);color:var(--ink);font:15px/1.5 'Manrope',Georgia,serif;margin:0;min-height:100vh}
.bar{position:sticky;top:0;z-index:50;background:#111827;color:#fff;padding:8px 14px;display:flex;gap:8px}
.bar button{background:#374151;color:#fff;border:0;border-radius:8px;padding:6px 10px}
#tools{position:fixed;right:12px;bottom:12px;z-index:60;display:flex;gap:6px}#uhl{position:fixed;left:12px;bottom:12px;z-index:60}
#lb,#slb{position:fixed;inset:0;display:none;background:rgba(0,0,0,.92);z-index:100}
.wrap{max-width:1100px;margin:0 auto;display:grid;grid-template-columns:1fr 1fr;gap:20px;padding:20px}
header{grid-column:1/-1}
.blk{border:3px solid #ef4444;padding:14px;margin:14px 0;border-radius:14px;background:var(--bg);min-height:40vh;overflow:hidden}
.t{color:#16a34a;font-weight:700}.tm{color:#dc2626;font-weight:700}.hl{background:var(--hl)}.lbl{font-variant:small-caps;color:var(--acc)}.key{border-bottom:2px solid var(--acc)}
.enz{color:#7c3aed}.lat{color:#be185d;font-style:italic}.br{color:#92400e}.ma{background:#dbeafe}.tr{color:#0f766e}.mv{color:#9333ea}
.fig{margin:10px 0}.fig img{max-width:100%;border-radius:8px}.tk{border:1px dashed var(--acc);padding:8px;margin:8px 0}.q{font-weight:700}.qa{color:var(--ink)}
table{border-collapse:collapse;width:100%}td,th{border:1px solid #9ca3af;padding:4px 8px}.card{box-shadow:0 2px 8px rgba(0,0,0,.2);padding:10px;border-radius:12px}.mrow{display:flex;gap:6px}.rv-item{padding:4px}`;
const APP_JS = `<script>document.addEventListener('DOMContentLoaded',function(){document.querySelectorAll('.blk').forEach(function(b,i){var h=document.createElement('div');h.className='bh';h.innerHTML='<span class="num">'+b.dataset.num+'</span> '+b.dataset.lab+' <button>Начать</button>';b.prepend(h)})});localStorage.setItem('x','1')</script><script src="https://cdn.example.com/x.js"></script>`;

async function app({ title, blocks, images = 2, details = 2, tables = 1, tickets = 2, imageOnly = false, imgSize = [160, 110] }) {
  let body = '';
  for (let b = 1; b <= blocks; b++) {
    let s = `<section class="blk" id="b${b}" data-sec="Раздел ${Math.ceil(b / 4)}" data-num="${['🫀', '🧬', '🩸', '🦷', '🧠'][b % 5]}" data-lab="${title}: тема ${b}" data-img="${images}">`;
    if (!imageOnly) {
      s += `<h3>Тема ${b}. ${WORDS[b % WORDS.length]}</h3><p>${sent(40)} <span class="t">активирует</span> ${sent(12)} <span class="tm">ингибирует</span> ${sent(10)} <span class="hl">часто спрашивают</span> <span class="lat">arteria ${WORDS[b % 7]}</span> <span class="key">${sent(3)}</span> <span class="enz">${sent(2)}-аза</span>.</p>`;
      s += `<ul><li>${sent(8)}</li><li><span class="lbl">Важно:</span> ${sent(9)}</li><li>${sent(7)}</li></ul><p class="mrow"><span class="ma">${sent(4)}</span> <span class="br">${sent(3)}</span> <span class="tr">${sent(3)}</span> <span class="mv">${sent(3)}</span></p>`;
      for (let d = 0; d < details; d++) s += `<details><summary>Подробнее ${d + 1}</summary><p>${sent(30)}</p></details>`;
      for (let t = 0; t < tables; t++) s += `<table><tr><th>Орган</th><th>Функция</th><th>Мишень</th></tr><tr><td>${sent(1)}</td><td>${sent(4)}</td><td>${sent(2)}</td></tr><tr><td>${sent(1)}</td><td>${sent(4)}</td><td>${sent(2)}</td></tr></table>`;
      for (let k = 0; k < tickets; k++) s += `<div class="tk ticket"><div class="q">Вопрос ${k + 1}: что такое ${WORDS[(b + k) % WORDS.length]}?</div><div class="qa">Ответ: ${sent(14)}</div><div class="ask">Спросят: ${sent(6)}</div></div>`;
      s += `<div class="card rv-item">💡 Запомни: ${sent(10)}</div>`;
    }
    for (let i = 0; i < images; i++) s += `<figure class="fig"><img src="${await img(imgSize[0], imgSize[1], b * 7 + i, imgSize[2] || 80)}" alt="Рис. ${b}.${i + 1}"><figcaption>Рисунок ${b}.${i + 1}</figcaption></figure>`;
    s += '</section>';
    body += s;
  }
  return `<!DOCTYPE html><html lang="ru" data-theme="light"><head><meta charset="utf-8"><title>${title}</title><meta name="viewport" content="width=device-width,initial-scale=1"><link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;700&display=swap" rel="stylesheet"><style>${APP_CSS}</style>${APP_JS}</head><body>
<div class="bar" id="bar"><button id="theme">☾ тема</button><button>Сброс</button><button>Таймер 05:00</button><span>${title}</span></div>
<div id="tools"><button>маркер</button><button>ластик</button></div><div id="uhl"><button>снять выделение</button></div><div id="lb"><img alt=""></div><div id="slb"></div>
<main class="wrap"><header><h1>${title}</h1><p>Конспект для подготовки. ${sent(12)}</p></header>${body}</main><script>document.getElementById('theme').onclick=function(){document.documentElement.dataset.theme='dark'}</script></body></html>`;
}

(async () => {
  const w = (n, s) => fs.writeFileSync(path.join(OUT, n), s);
  // her 12 files, scaled down to run fast in tests (structure identical)
  const twelve = [['Ангиология', 24, 'angiology'], ['Мочеполовой аппарат', 20, 'urogenital'], ['Биохимия 1 семестр', 30, 'biochem1'], ['Простые белки', 16, 'simple-proteins'], ['Сложные белки', 18, 'complex-proteins'], ['Гистология', 22, 'histology'], ['Генетика бактерий', 14, 'bacterial-genetics'], ['Патанатомия 5-7', 26, 'patanat-5-7'], ['Патанатомия темы 1-7', 28, 'patanat-1-7'], ['Ортопедия', 15, 'orthopedics'], ['Физиология', 32, 'physiology'], ['Философия', 12, 'philosophy']];
  for (const [t, n, slug] of twelve) w(`app-${slug}.html`, await app({ title: t, blocks: n, images: t === 'Гистология' ? 3 : 1, imageOnly: t === 'Гистология' }));
  // hostile
  w('hostile-dark-only.html', `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Только тёмный</title><style>body{background:#0d1117;color:#e6edf3;font-family:Arial}@media (prefers-color-scheme: dark){body{background:#000;color:#9ad}} @media (prefers-color-scheme: light){body{background:#fff;color:#222}} a{color:#7aa2f7}.k{color:#ffd866}</style></head><body><h1>Тёмный документ</h1><p>${sent(60)} <span class="k">жёлтый на чёрном</span> <a href="#x">ссылка</a></p><h2>Второй раздел</h2><p>${sent(80)}</p></body></html>`);
  w('hostile-100vh-shell.html', `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Оболочка 100vh</title><style>html,body{height:100vh;margin:0;overflow:hidden}.app{display:grid;grid-template-columns:240px 1fr;height:100vh;width:100vw}.side{position:fixed;left:0;top:0;bottom:0;width:240px;background:#123;color:#fff;padding:10px}.main{margin-left:240px;height:100vh;overflow:auto;padding:20px}</style></head><body><div class="app"><nav class="side"><b>Меню</b><br><a href="#a">Раздел A</a><br><a href="#b">Раздел B</a></nav><div class="main"><h1 id="a">Раздел A</h1><p>${sent(120)}</p><h1 id="b">Раздел B</h1><p>${sent(120)}</p><h2>Подраздел</h2><p>${sent(80)}</p></div></div></body></html>`);
  w('hostile-3col.html', `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Три колонки</title><style>.cols{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;width:1400px}.c{border:1px solid #888;padding:10px}</style></head><body><h1>Три колонки</h1><div class="cols"><div class="c"><h2>Левая</h2><p>${sent(70)}</p></div><div class="c"><h2>Средняя</h2><p>${sent(70)}</p></div><div class="c"><h2>Правая</h2><p>${sent(70)}</p></div></div></body></html>`);
  w('hostile-abs-slides.html', `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Слайды</title><style>.slide{position:absolute;left:0;top:0;width:1280px;height:720px;background:#fff;border:1px solid #000}.slide:nth-child(2){top:760px}.slide h2{position:absolute;left:40px;top:30px}.slide p{position:absolute;left:40px;top:120px;width:600px}</style></head><body><div class="slide"><h2>Слайд 1</h2><p>${sent(40)}</p></div><div class="slide"><h2>Слайд 2</h2><p>${sent(40)}</p></div></body></html>`);
  w('hostile-30col-table.html', `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Широкая таблица</title></head><body><h1>Таблица</h1><p>${sent(30)}</p><table border="1"><tr>${Array.from({ length: 30 }, (_, i) => `<th>Колонка ${i + 1}</th>`).join('')}</tr>${Array.from({ length: 6 }, (_, r) => `<tr>${Array.from({ length: 30 }, (_, i) => `<td>${r}-${i}</td>`).join('')}</tr>`).join('')}</table><p>${sent(30)}</p></body></html>`);
  w('hostile-word.html', `<html xmlns:o="urn:schemas-microsoft-com:office:office"><head><meta charset="utf-8"><title>Word</title><style>p.MsoNormal{margin:0cm;font-size:12.0pt;font-family:"Times New Roman",serif}h1{mso-style-name:"Heading 1";font-size:18pt}@page{size:21cm 29.7cm;margin:2cm}div.WordSection1{page:WordSection1}</style></head><body><div class=WordSection1><h1>Заголовок Word</h1><p class=MsoNormal>${sent(50)}<o:p></o:p></p><p class=MsoNormal><o:p>&nbsp;</o:p></p><p class=MsoNormal>${sent(50)}</p><h1>Второй</h1><p class=MsoNormal>${sent(50)}</p></div></body></html>`);
  w('hostile-gdocs.html', `<html><head><meta charset="utf-8"><title>Google Docs</title><style>@import url(https://themes.googleusercontent.com/fonts/css?kit=x);.c1{color:#000;font-size:11pt;font-family:"Arial"}.c2{padding-top:0;padding-bottom:0;orphans:2}.title{font-size:26pt}.doc-content{max-width:468pt;padding:72pt}</style></head><body class="c2 doc-content"><h1 class="c3 title">Google Docs</h1><p class="c2"><span class="c1">${sent(60)}</span></p><h2 class="c3">Часть</h2><p class="c2"><span class="c1">${sent(60)}</span></p></body></html>`);
  w('hostile-notion.html', `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Notion</title><style>.page-body{font-size:16px}.sans{font-family:ui-sans-serif}.highlight-yellow_background{background:#fdecc8}</style></head><body><article id="n1" class="page sans"><header><h1 class="page-title">Notion</h1></header><div class="page-body"><h2>Раздел</h2><p>${sent(40)} <mark class="highlight-yellow_background">важное</mark></p><ul class="bulleted-list"><li>${sent(6)}</li><li>${sent(6)}</li></ul><h2>Другой</h2><p>${sent(40)}</p></div></article></body></html>`);
  w('md-tables-code.md', `# Заметки\n\n${sent(30)}\n\n## Таблица\n\n| Орган | Функция |\n|---|---|\n| Сердце | Насос |\n| Почка | Фильтр |\n\n## Код\n\n\`\`\`js\nconst x = 1;\n\`\`\`\n\n- [x] сделано\n- [ ] не сделано\n\n## Ещё\n\n${sent(40)}\n`);
  const cp = str => Buffer.from([...str].map(ch => { const c = ch.charCodeAt(0); if (c < 128) return c; if (c === 0x401) return 0xA8; if (c === 0x451) return 0xB8; if (c >= 0x410 && c <= 0x44F) return c - 0x410 + 0xC0; return 0x3F; }));
  fs.writeFileSync(path.join(OUT, 'txt-cp1251.txt'), cp('Заголовок\n\nТекст в кодировке windows-1251. Привет, мир. ' + sent(30) + '\n\nВторой абзац. ' + sent(30)));
  w('hostile-remote-images.html', `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Удалённые картинки</title></head><body><h1>Картинки из сети</h1><p>${sent(30)}</p><img src="https://example.com/a.png" alt="внешняя 1"><img src="//example.com/b.png" alt="внешняя 2"><p>${sent(20)}</p></body></html>`);
  // SDF native example
  w('sdf-example.html', fs.readFileSync(path.join(__dirname, '..', 'docs', 'sdf-example.html'), 'utf8').toString());
  // big: ~13 MB, ~200 images (generated on demand, git-ignored)
  if (!fs.existsSync(path.join(TMP, 'big-13mb.html')) || process.argv.includes('--big')) fs.writeFileSync(path.join(TMP, 'big-13mb.html'), await app({ title: 'Патанатомия темы 1-7 (большой)', blocks: 50, images: 4, details: 2, imgSize: [900, 640, 86] }));
  console.log('fixtures written to', OUT, 'big:', (fs.statSync(path.join(TMP, 'big-13mb.html')).size / 1048576).toFixed(1) + ' MB');
})();
