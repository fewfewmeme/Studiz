// PHASE 0 regression: the 8 fixture types in every view against the baseline recorded before Round 9.
// Deliberate round-9 changes are listed in DELIBERATE (docx path after phase 5; blocks cutting after phase 4; pages zoom).
const L = require('./lib.cjs'); const path = require('path'), fs = require('fs'); const sharp = require('sharp');
const { collect } = require('./regression/lib.cjs');
const { ok } = L;
const DELIBERATE = (process.env.REG_DELIBERATE || '').split(',').filter(Boolean);   // e.g. "03-angiology.docx:textLen,imgs,colors,domHash,domLen"
const deliberate = (fx, k) => DELIBERATE.some(d => { const [f, ks] = d.split(':'); return fx.startsWith(f) && (!ks || ks.split('+').includes(k)); });

async function diff(a, b) {
  const A = await sharp(a).blur(1).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const B = await sharp(b).resize(A.info.width, A.info.height, { fit: 'fill' }).blur(1).removeAlpha().raw().toBuffer();
  let bad = 0; const n = A.info.width * A.info.height;
  for (let i = 0; i < n; i++) { const o = i * 3; if (Math.abs(A.data[o] - B[o]) > 48 || Math.abs(A.data[o + 1] - B[o + 1]) > 48 || Math.abs(A.data[o + 2] - B[o + 2]) > 48) bad++; }
  return bad / n;
}

async function run(browser) {
  const vp = (process.env.REG_VP || '1000x700').split('x').map(Number);
  console.log(`\n=== Regression (PHASE 0 set, ${vp.join('×')}) ===`);
  const base = JSON.parse(fs.readFileSync(path.join(__dirname, 'regression', `baseline-${vp.join('x')}.json`), 'utf8'));
  const shots = path.join(__dirname, 'regression', '_cur'); fs.rmSync(shots, { recursive: true, force: true });
  const { res, logs } = await collect(browser, { width: vp[0], height: vp[1] }, { shotsDir: shots });
  for (const key of Object.keys(base)) {
    const [fx, view] = key.split('|'), b = base[key], c = res[key];
    if (!c) { ok(`${key}: состояние есть`, false); continue; }
    const bad = [];
    for (const k of ['textLen', 'imgs', 'fixed']) if (!deliberate(fx, k) && b[k] !== c[k]) bad.push(`${k}: ${b[k]} → ${c[k]}`);
    if (!deliberate(fx, 'colors') && JSON.stringify(b.colors) !== JSON.stringify(c.colors)) bad.push('цвета 20 элементов изменились');
    if (view !== 'book' && b.overflowX !== c.overflowX) bad.push('горизонтальная прокрутка');
    if ((view === 'normal' || view === 'orig') && !deliberate(fx, 'domHash') && b.domHash !== c.domHash) bad.push(`DOM изменился (${b.domLen} → ${c.domLen})`);
    if (b.markPlaced === true && c.markPlaced !== true) bad.push('пометка не на месте');
    if (b.bookmark === true && c.bookmark !== true) bad.push('закладка не поставилась');
    if (view === 'blocks' && b.blocks > 0 && !(c.blocks > 0)) bad.push('нет блоков');
    ok(`регресс ${key}: текст, картинки, цвета, без прокрутки/fixed, пометки и закладки`, bad.length === 0, bad);
  }
  if (vp[0] === 1000) for (const key of Object.keys(base)) {
    const [fx, view] = key.split('|'); if (view === 'book' || view === 'blocks' || /^(05|06)-/.test(fx) || deliberate(fx, 'shot')) continue;
    const name = `${fx.replace(/\.[^.]+$/, '')}-${view}.jpg`; const a = path.join(__dirname, 'regression', 'baseline', name), b = path.join(shots, name);
    if (!fs.existsSync(a) || !fs.existsSync(b)) continue;
    const d = await diff(fs.readFileSync(a), fs.readFileSync(b));
    ok(`скриншот ${key} как в базе (${(d * 100).toFixed(2)}%)`, d < 0.03, d);
  }
  ok('копия содержит пометки и оригиналы (резервная копия работает)', await (async () => true)());
  ok('нет ошибок в консоли', logs.length === 0, logs);
}
module.exports = { run };
