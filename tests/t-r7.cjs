// Round 7 gate, part A: sandboxed frame (security), «Оригинал», fidelity to the raw file, zoom steps, width, no cut content.
const L = require('./lib.cjs');
const path = require('path'), fs = require('fs');
const { ok, sleep } = L;
const sharp = require('sharp');
const OUT = path.join(L.ROOT, 'docs', 'qa', 'round7'); fs.mkdirSync(OUT, { recursive: true });
const FXD = name => path.join(L.ROOT, 'tests', 'fixtures', 'r7', name);
const STEPS = [50, 55, 60, 65, 70, 75, 80, 85, 90, 100, 110, 125, 150, 175, 200];

const SAMPLE = () => {
  const sels = ['h1', 'h2', 'h3', 'p', 'li', 'td', 'th', '.callout', '.lat', '.t', '.tk', 'b', 'table', 'figcaption', '.lead', '.eyebrow'];
  const out = [];
  let round = 0;
  while (out.length < 20 && round < 3) { for (const s of sels) { const e = document.querySelectorAll(s)[round]; if (e && !e.closest('.lz-chrome, .lz-own')) out.push({ key: s + '#' + round, cs: (c => ({ ff: c.fontFamily, color: c.color, bg: c.backgroundColor, bt: c.borderTopColor + '/' + c.borderTopWidth, fs: c.fontStyle, fw: c.fontWeight }))(getComputedStyle(e)) }); if (out.length >= 20) break; } round++; }
  return out;
};
async function diffRatio(aBuf, bBuf) {
  // a light blur: text anti-aliasing (frame vs page compositing) must not count as a different look
  const A = await sharp(aBuf).blur(1).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const B = await sharp(bBuf).resize(A.info.width, A.info.height, { fit: 'fill' }).blur(1).removeAlpha().raw().toBuffer();
  let bad = 0; const n = A.info.width * A.info.height;
  for (let i = 0; i < n; i++) { const o = i * 3; if (Math.abs(A.data[o] - B[o]) > 48 || Math.abs(A.data[o + 1] - B[o + 1]) > 48 || Math.abs(A.data[o + 2] - B[o + 2]) > 48) bad++; }
  return bad / n;
}

async function run(browser) {
  console.log('\n=== Round 7 (A): рамка, «Оригинал», точность, масштаб, ширина ===');
  console.log('  (WebKit недоступен в песочнице: проверки идут в Chromium с эмуляцией касаний)');
  const reqs = [];
  const { ctx, p, logs } = await L.newSession(browser, { width: 1000, height: 700 });
  p.on('request', r => reqs.push(r.url()));
  await L.openSubject(p, 'Анатомия');
  await L.importFiles(p, ['r7/app-physiology.html', 'r7/plain-splanchnology.html', 'r7/slides-landscape.pdf', 'r7/text-portrait.pdf', 'r7/doc.docx', 'r7/notes.md']);
  const files = await L.idb(p, 'files');
  ok('импортированы 6 файлов', files.length === 6, files.map(f => f.name));
  const byName = n => files.find(f => f.name === n);
  const F = () => L.frameOf(p);
  const reload = async () => { await L.reload(p); await sleep(600); };
  const open = async (name, mode) => { await p.evaluate(() => { location.hash = '#/subject/anatomy'; }); await p.waitForSelector('.doc-card'); await L.openFile(p, name, null, mode); };

  // ---------------- Оригинал (app-HTML) ----------------
  reqs.length = 0;
  await open('app-physiology');
  const doc0 = await p.evaluate(() => ({ mode: window.__reader.doc().mode, views: window.__reader.doc().views, sandbox: document.querySelector('.lz-frame').getAttribute('sandbox') }));
  ok('app-HTML открывается в «Оригинале» по умолчанию; видов четыре', doc0.mode === 'orig' && doc0.views.join() === 'orig,normal,book,blocks', doc0);
  ok('iframe: sandbox без allow-same-origin', /allow-scripts/.test(doc0.sandbox) && !/allow-same-origin/.test(doc0.sandbox) && !/allow-top-navigation/.test(doc0.sandbox), doc0.sandbox);
  const csp = await F().evaluate(() => document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content);
  ok('в рамке есть CSP: default-src none, connect-src none, form-action none', /default-src 'none'/.test(csp) && /connect-src 'none'/.test(csp) && /form-action 'none'/.test(csp) && /img-src data: blob:/.test(csp), csp);
  ok('родитель недоступен из рамки: window.parent.document бросает исключение', await F().evaluate(() => { try { void parent.document.title; return false; } catch (e) { return e.name === 'SecurityError'; } }));
  ok('в Оригинале нет боковых панелей сайта', await p.evaluate(() => getComputedStyle(document.querySelector('.rail-l')).display === 'none' && getComputedStyle(document.querySelector('.rail-r')).display === 'none'));
  ok('шрифт файла (Golos Text) встроен локально и загружен', await F().evaluate(async () => { await document.fonts.ready; return document.fonts.check('16px "Golos Text"') && [...document.fonts].some(f => f.family.replace(/"/g, '') === 'Golos Text' && f.status === 'loaded'); }));
  const t1 = await F().evaluate(() => document.getElementById('clock').textContent); await sleep(2300);
  const t2 = await F().evaluate(() => document.getElementById('clock').textContent);
  ok('собственные скрипты файла работают (таймер идёт)', t1 !== t2, [t1, t2]);
  ok('на экране ни одного запроса в сеть (только localhost / data / blob)', reqs.every(u => /^(http:\/\/localhost:\d+\/|data:|blob:|about:)/.test(u)), reqs.filter(u => !/^(http:\/\/localhost|data:|blob:|about:)/.test(u)));
  await F().evaluate(() => { document.getElementById('inc').click(); document.getElementById('inc').click(); });
  await sleep(900);
  const ds = (await L.idb(p, 'kv', 'ds:' + byName('app-physiology').id));
  ok('localStorage файла сохраняется через прокладку в IndexedDB (docState)', ds && ds.value && ds.value.cnt === '2', ds);
  const bg = await p.evaluate(() => getComputedStyle(document.querySelector('.reader')).getPropertyValue('--doc-bg').trim());
  ok('цвет фона документа передан оболочке (синхронизация темы)', /244,\s*241,\s*234/.test(bg), bg);
  await F().evaluate(() => { document.documentElement.setAttribute('data-theme', 'dark'); }); await sleep(600);
  const bg2 = await p.evaluate(() => getComputedStyle(document.querySelector('.reader')).getPropertyValue('--doc-bg').trim());
  ok('смена темы внутри файла меняет цвет оболочки', /20,\s*23,\s*28/.test(bg2) && bg2 !== bg, bg2);
  await F().evaluate(() => { document.documentElement.setAttribute('data-theme', 'light'); });
  await F().evaluate(() => (document.scrollingElement || document.documentElement).scrollTo(0, 900)); await sleep(1200);
  await reload(); await open('app-physiology');
  const cnt = await F().evaluate(() => document.getElementById('cnt').textContent);
  const st = await F().evaluate(() => (document.scrollingElement || document.documentElement).scrollTop);
  ok('после перезагрузки счётчик файла сохранён', cnt === '2', cnt);
  ok('положение прокрутки в Оригинале восстановлено', Math.abs(st - 900) < 40, st);
  await p.screenshot({ path: path.join(OUT, 'orig-app-1000x700.png') });
  // a fake message from the parent window itself is ignored (only the frame's window is trusted)
  await p.evaluate(id => window.postMessage({ lz: 1, id, type: 'storage', data: { hacked: '1' } }, '*'), byName('app-physiology').id); await sleep(600);
  ok('сообщения не из рамки игнорируются (e.source === iframe.contentWindow)', !JSON.stringify(await L.idb(p, 'kv', 'ds:' + byName('app-physiology').id)).includes('hacked'));

  // ---------------- fidelity: Обычный equals the raw file ----------------
  const rawCtx = await browser.newContext({ viewport: { width: 848, height: 684 } });
  const raw = await rawCtx.newPage();
  for (const [name, file, shot] of [['plain-splanchnology', 'plain-splanchnology.html', ['table', '.callout']], ['app-physiology', 'app-physiology.html', ['.blk p', '.tk']]]) {
    await open(name, 'normal');
    await p.evaluate(() => window.__reader.doc().setWidth('original')); await sleep(900);
    { const css = await p.evaluate(async () => (await import('./js/frame/build.js')).fontCss(['PT Serif', 'Golos Text']));
      const html = fs.readFileSync(FXD(file), 'utf8').replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<link[^>]*fonts\.googleapis[^>]*>/gi, '').replace('<head>', '<head><style>' + css + '</style>');
      await raw.setContent(html); await raw.evaluate(() => { document.documentElement.style.zoom = '0.75'; }); await raw.evaluate(() => document.fonts.ready); await sleep(500); }
    const ours = await F().evaluate(SAMPLE), theirs = await raw.evaluate(SAMPLE);
    const bad = []; ours.forEach(o => { const t = theirs.find(x => x.key === o.key); if (!t) { bad.push(o.key + ' нет в оригинале'); return; } for (const k of Object.keys(o.cs)) if (o.cs[k] !== t.cs[k]) bad.push(`${o.key}.${k}: ${o.cs[k]} ≠ ${t.cs[k]}`); });
    ok(`${name}: 20 элементов — шрифт, цвет, фон, рамки таблиц как в исходном файле`, ours.length >= 18 && bad.length === 0, bad.slice(0, 5));
    for (const sel of shot) {
      const a = await F().locator(sel).first().screenshot(), b = await raw.locator(sel).first().screenshot();
      const d = await diffRatio(a, b);
      fs.writeFileSync(path.join(OUT, `fidelity-${name}-${sel.replace(/\W/g, '')}-site.png`), a); fs.writeFileSync(path.join(OUT, `fidelity-${name}-${sel.replace(/\W/g, '')}-raw.png`), b);
      ok(`${name}: фрагмент «${sel}» отличается от исходного файла < 3% (${(d * 100).toFixed(2)}%)`, d < 0.03, d);
    }
    await p.evaluate(() => window.__reader.doc().setWidth('wide')); await sleep(500);
  }
  await rawCtx.close();

  // ---------------- zoom: one list of steps, default 75, never jumps ----------------
  const seqs = {};
  for (const name of ['plain-splanchnology', 'app-physiology', 'text-portrait', 'doc', 'notes']) {
    await open(name, name === 'app-physiology' ? 'normal' : undefined);
    const label = () => p.evaluate(() => document.querySelector('.zoom-pct').textContent);
    const applied = () => F().evaluate(() => Math.round(parseFloat(document.documentElement.style.zoom) * 100));
    const first = await label();
    const seq = [parseInt(first)];
    for (let i = 0; i < 7; i++) { await p.click('.rd-zoom [aria-label="Мельче"]'); await sleep(250); seq.push(parseInt(await label())); }
    for (let i = 0; i < 18; i++) { await p.click('.rd-zoom [aria-label="Крупнее"]'); await sleep(250); seq.push(parseInt(await label())); }
    const exp = [75, 70, 65, 60, 55, 50, 50, 50]; let z = 50; const up = []; for (let i = 0; i < 18; i++) { z = STEPS[Math.min(STEPS.length - 1, STEPS.indexOf(z) + 1)]; up.push(z); }
    ok(`${name}: масштаб 75 → 50 → 200: каждое нажатие — один шаг общего списка`, parseInt(first) === 75 && JSON.stringify(seq) === JSON.stringify([...exp, ...up]) && seq.every(v => STEPS.includes(v)), seq);
    ok(`${name}: подпись равна применённому масштабу (${await label()} / ${await applied()})`, parseInt(await label()) === await applied());
    seqs[name] = JSON.stringify(seq);
    await p.click('.zoom-pct'); await sleep(300);
    ok(`${name}: тап по проценту возвращает 75%`, parseInt(await label()) === 75);
  }
  ok('шаги масштаба одинаковы на всех файлах', new Set(Object.values(seqs)).size === 1);
  for (const z of [50, 75]) {
    await open('plain-splanchnology', 'normal');
    await p.evaluate(zz => window.__reader.doc().setZoomPct(zz), z); await sleep(700);
    const fill = await F().evaluate(() => { const w = document.querySelector('.wrap'); const r = w.getBoundingClientRect(), h = document.documentElement.getBoundingClientRect(); return r.width / h.width; });
    ok(`«на всю ширину» при ${z}%: колонка занимает ≥ 90% области чтения (${(fill * 100).toFixed(0)}%)`, fill > 0.9, fill);
  }
  await p.evaluate(() => window.__reader.doc().setZoomPct(75));

  // ---------------- no horizontal overflow / no cut table in Обычный and Блоки ----------------
  for (const name of ['plain-splanchnology', 'app-physiology', 'doc', 'notes', 'text-portrait']) {
    for (const mode of ['normal', 'blocks']) {
      await open(name, mode); await sleep(400);
      const r = await F().evaluate(() => {
        const vw = document.documentElement.getBoundingClientRect().width;
        const cut = [...document.querySelectorAll('table')].filter(t => { const b = t.getBoundingClientRect(); const sc = t.closest('.lz-tscroll'); if (sc) { const sb = sc.getBoundingClientRect(); return sb.right > vw + 1; } return b.right > vw + 1 || b.left < -1; }).length;
        return { over: document.documentElement.scrollWidth > innerWidth + 1, cut };
      });
      ok(`${name} / ${mode}: нет горизонтальной прокрутки, таблицы не обрезаны`, !r.over && r.cut === 0, r);
    }
  }

  // ---------------- no data-detector underlines, lighter weight, per-document memory ----------------
  await open('plain-splanchnology', 'normal');
  const ul = await F().evaluate(() => { const a = document.createElement('a'); a.setAttribute('x-apple-data-detectors', 'true'); a.href = '#'; a.textContent = '+7 495 000-00-00'; document.body.prepend(a); const c = getComputedStyle(a), b = getComputedStyle(document.body); return { same: c.color === b.color, none: c.textDecorationLine === 'none' }; });
  ok('синие подчёркивания iOS (data detectors) подавлены', ul.same && ul.none, ul);
  ok('meta format-detection отключает телефоны, даты, адреса, e-mail', await F().evaluate(() => /telephone=no/.test(document.querySelector('meta[name="format-detection"]').content)));
  const h1f0 = await F().evaluate(() => getComputedStyle(document.querySelector('h1')).fontFamily);
  const w0 = await F().evaluate(() => parseInt(getComputedStyle(document.querySelector('h1')).fontWeight));
  await p.evaluate(() => window.__reader.doc().setFont({ weight: 'lighter' })); await sleep(600);
  const w1 = await F().evaluate(() => parseInt(getComputedStyle(document.querySelector('h1')).fontWeight));
  ok('«Насыщенность: светлее» понижает жирность на один шаг (700 → 600)', w0 >= 600 && w1 === w0 - 100, [w0, w1]);
  await p.evaluate(() => window.__reader.doc().setFont({ family: 'serif' })); await sleep(600);
  const ff = await F().evaluate(() => ({ p: getComputedStyle(document.querySelector('.wrap p')).fontFamily, h: getComputedStyle(document.querySelector('h1')).fontFamily }));
  ok('«Шрифт: с засечками» меняет текст, заголовки сохраняют свой', /^"PT Serif"/.test(ff.p) && ff.h === h1f0, [ff, h1f0]);
  await p.evaluate(() => window.__reader.doc().setFont({ family: 'sans' })); await sleep(600);
  ok('«Шрифт: без засечек» — Manrope', /Manrope/.test(await F().evaluate(() => getComputedStyle(document.querySelector('.wrap p')).fontFamily)));
  await p.evaluate(() => window.__reader.doc().setFont({ family: 'file' })); await sleep(400);
  await reload(); await open('plain-splanchnology', 'normal');
  ok('настройки чтения запомнены для документа', (await p.evaluate(() => window.__reader.doc().cfgState)).weight === 'lighter');
  await p.evaluate(() => window.__reader.doc().setFont({ weight: 'file' }));

  ok('нет ошибок в консоли страницы', logs.length === 0, logs);
  await ctx.close();
}
module.exports = { run };
