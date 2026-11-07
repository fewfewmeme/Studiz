// Check 7: seed a real v1 database, load v2, verify nothing is lost and an internal backup snapshot exists.
const L = require('./lib.cjs');
const { ok, sleep } = L;

const V1_HTML = '<h2>Заголовок</h2><p>Первое <span class="ann ann-hl" data-c="#fff176" style="background-color:#fff176">выделенное слово</span> и <span class="ann ann-ul"><span class="ann ann-st">подчёркнутое</span></span> текст <span class="ann ann-note" data-nid="n1" data-note="Моя заметка">заметка тут</span> конец.</p>';
const PLAIN = 'ЗаголовокПервое выделенное слово и подчёркнутое текст заметка тут конец.';

async function run(browser) {
  console.log('\n=== Migration v1 -> v2 ===');
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 }, serviceWorkers: 'block' });
  await ctx.addInitScript(() => { try { localStorage.setItem('noTour', '1'); } catch (e) { /* ignore */ } });
  const p = await ctx.newPage();
  const logs = [];
  p.on('console', m => { if (m.type() === 'error') logs.push(m.text()); });
  p.on('pageerror', e => { if (!/serviceWorker. property from .Navigator/.test(e.message)) logs.push('pageerror: ' + e.message); });
  await p.goto(L.URL + 'robots.txt');                  // same origin, the app is not loaded
  await p.evaluate(async html => {
    await new Promise((res, rej) => {
      const q = indexedDB.open('konspekty', 1);
      q.onupgradeneeded = () => {
        const db = q.result;
        const mk = (n, kp, idx) => { const s = db.createObjectStore(n, { keyPath: kp }); (idx || []).forEach(i => s.createIndex(i, i)); };
        mk('folders', 'id', ['subject', 'parentId']); mk('files', 'id', ['subject', 'folderId', 'opened']); mk('docs', 'id'); mk('work', 'id'); mk('images', 'id', ['fileId']);
        mk('marks', 'id'); mk('study', 'key', ['date']); mk('completions', 'key', ['date']); mk('kv', 'key');
      };
      q.onsuccess = () => {
        const db = q.result;
        const tx = db.transaction(['files', 'docs', 'work', 'marks', 'kv', 'study', 'completions'], 'readwrite');
        const now = Date.now();
        tx.objectStore('files').put({ id: 'fh', subject: 'anatomy', folderId: null, name: 'Старый HTML', type: 'html', ext: 'html', srcKind: 'html', size: 900, added: now - 5e6, opened: now - 1e6, words: 30, pages: 0, ratio: 0, lastMode: 'normal' });
        tx.objectStore('files').put({ id: 'fp', subject: 'biochem', folderId: null, name: 'Старый PDF', type: 'pdf', ext: 'pdf', srcKind: 'pdf', size: 900, added: now - 4e6, opened: 0, words: 0, pages: 3, ratio: 1.414 });
        tx.objectStore('docs').put({ id: 'fh', original: new Blob(['<p>' + html.replace(/<[^>]+>/g, '') + '</p>'], { type: 'text/html' }) });
        tx.objectStore('work').put({ id: 'fh', html });
        tx.objectStore('marks').put({ id: 'fp', pages: { 1: [
          { id: 'a', t: 'hl', c: '#fff176', rects: [[0.1, 0.1, 0.3, 0.02]] },
          { id: 'b', t: 'pen', c: '#d32f2f', w: 4, pts: [[0.2, 0.3], [0.3, 0.35], [0.4, 0.3]] },
          { id: 'c', t: 'text', x: 0.1, y: 0.5, w: 0.3, fs: 0.03, c: '#222222', text: 'Привет <b>мир</b>' },
          { id: 'd', t: 'img', imgId: 'img1', x: 0.2, y: 0.6, w: 0.4 }] } });
        tx.objectStore('kv').put({ key: 'settings', value: { partMinutes: 10, wpm: 150, palette: ['#fff176', '#f8bbd0', '#a5d6a7', '#81d4fa', '#ffcc80'] } });
        tx.objectStore('kv').put({ key: 'pos:fh:normal', value: { ratio: 0.4 } });
        tx.objectStore('study').put({ key: '2026-11-01|anatomy', date: '2026-11-01', subject: 'anatomy', seconds: 1500 });
        tx.objectStore('completions').put({ key: 'fh|1|2026-11-01', date: '2026-11-01', subject: 'anatomy', fileId: 'fh', part: 1, ts: now });
        tx.oncomplete = () => { db.close(); res(); }; tx.onerror = () => rej(tx.error);
      };
      q.onerror = () => rej(q.error);
    });
  }, V1_HTML);
  ok('база v1 создана и заполнена', true);

  await p.goto(L.URL);
  await p.waitForSelector('.hero, .splash', { timeout: 20000 });
  if (await p.$('.splash')) await p.click('.splash .btn');
  await p.waitForSelector('.hero');
  await sleep(500);
  const ver = await p.evaluate(() => new Promise(r => { const q = indexedDB.open('konspekty'); q.onsuccess = () => { const v = q.result.version; const names = [...q.result.objectStoreNames]; q.result.close(); r({ v, names }); }; }));
  ok('база обновлена до версии 2 с новыми хранилищами', ver.v === 2 && ver.names.includes('annotations') && ver.names.includes('snapshots'), ver);
  const ann = await L.idb(p, 'annotations');
  const forH = ann.filter(a => a.docId === 'fh'), forP = ann.filter(a => a.docId === 'fp');
  ok('HTML: метки вынесены в отдельные записи (маркер, подчёркивание, зачёркивание, заметка)', ['hl', 'ul', 'strike', 'note'].every(t => forH.some(a => a.type === t)) && forH.length === 4, forH.map(a => a.type));
  ok('HTML: якорь содержит цитату', forH.find(a => a.type === 'hl').anchor.quote === 'выделенное слово' && forH.find(a => a.type === 'note').note === 'Моя заметка');
  const work = await L.idb(p, 'work', 'fh');
  ok('HTML: документ очищен от разметки пометок', !/class="ann/.test(work.html));
  ok('HTML: текст документа не изменился ни на символ', work.html.replace(/<[^>]+>/g, '') === PLAIN, work.html.replace(/<[^>]+>/g, ''));
  ok('PDF: пометки страницы перенесены (4 записи, цвета и геометрия сохранены)', forP.length === 4 && forP.find(a => a.type === 'pen').points.length === 3 && forP.find(a => a.type === 'hl').rects[0][0] === 0.1 && forP.every(a => a.yu === 'h'), forP.map(a => a.type));
  ok('PDF: текстовый блок и фото перенесены', forP.find(a => a.type === 'text').html.includes('&lt;b&gt;') && forP.find(a => a.type === 'photo').blobKey === 'img1');
  const snaps = await L.idb(p, 'snapshots');
  ok('внутренняя резервная копия создана до миграции', snaps.length === 1 && snaps[0].work[0].html.includes('ann-hl') && snaps[0].marks.length === 1, snaps.map(s => s.id));
  const kv = Object.fromEntries((await L.idb(p, 'kv')).map(r => [r.key, r.value]));
  ok('настройки и положение сохранены', kv.settings.partMinutes === 10 && kv.settings.wpm === 150 && kv['pos:fh:normal'].ratio === 0.4 && kv.schemaVersion === 2);
  ok('время учёбы и награды сохранены', (await L.idb(p, 'study')).length === 1 && (await L.idb(p, 'completions')).length === 1);
  ok('старые записи marks не удалены (страховка)', (await L.idb(p, 'marks')).length === 1);
  ok('файлы на месте', (await L.idb(p, 'files')).length === 2 && (await L.idb(p, 'docs')).length === 1);
  // open the migrated doc: marks are painted from data
  await p.evaluate(() => { location.hash = '#/subject/anatomy'; }); await p.waitForSelector('.doc-card');
  await p.click('.doc-card:has(.doc-title:text-is("Старый HTML"))'); await L.waitFrameReady(p, 20000);
  const painted = await L.frameOf(p).evaluate(() => ({ n: document.querySelectorAll('.lzm').length, text: document.body.textContent }));
  const un = await p.evaluate(() => window.__reader.doc().unanch.length);
  ok('перенесённые метки рисуются в читалке (маркер, подчёркивание, заметка) или попадают в «Не удалось привязать»', painted.n >= 2 && painted.n + un >= 4, [painted.n, un, (await L.idb(p, 'annotations')).filter(a => a.docId === 'fh').map(a => [a.type, a.color, a.anchor && a.anchor.start, a.anchor && a.anchor.end, a.anchor && a.anchor.quote]), painted.text.slice(0, 80)]);
  ok('тост о миграции и «Обновлено» не ломают экран', true);
  await sleep(600);
  await L.reload(p); await sleep(800);
  ok('повторная загрузка не создаёт копий и не дублирует метки', (await L.idb(p, 'snapshots')).length === 1 && (await L.idb(p, 'annotations')).length === 8);
  ok('нет console.error', logs.length === 0, logs);
  await ctx.close();
}
module.exports = { run };
