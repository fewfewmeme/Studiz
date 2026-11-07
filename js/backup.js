// Резервная копия: один ZIP со всем содержимым (без сжатия — быстрее) и восстановление.
import * as db from './db.js';
import { STORES } from './db.js';
import { getJSZip } from './libs.js';
import { h, dateKey, downloadBlob, fmtBytes, tick } from './util.js';
import { customDialog, progressDialog, chooseDialog, alertDialog, confirmDialog, toast } from './ui.js';
import { loadSettings } from './settings.js';
import { migrateIfNeeded } from './migrate.js';

const FORMAT = 2;   // 1 = v1 (marks inside HTML / marks store); 2 = separate annotation records
const JSON_STORES = STORES.filter(s => !['docs', 'work', 'images', 'snapshots'].includes(s));

export async function lastBackupAt() { return db.kvGet('lastBackup', 0); }

export function backupAgeText(ts) {
  if (!ts) return 'Копии нет';
  const days = Math.floor((Date.now() - ts) / 86400000);
  if (days <= 0) return 'Копия: сегодня';
  if (days === 1) return 'Копия: вчера';
  const m = days % 10, c = days % 100;
  return `Копия: ${days} ${c > 10 && c < 20 ? 'дней' : m === 1 ? 'день' : m > 1 && m < 5 ? 'дня' : 'дней'} назад`;
}
export async function backupDaysAgo() { const t = await lastBackupAt(); return t ? (Date.now() - t) / 86400000 : Infinity; }

export async function hasData() { return (await db.count('files')) > 0; }

export async function createBackup(onProgress = () => {}) {
  const JSZip = await getJSZip();
  const zip = new JSZip();
  onProgress(0.02, 'Собираем данные…');
  const counts = {};
  for (const s of JSON_STORES) {
    let rows = await db.getAll(s);
    if (s === 'kv') rows = rows.filter(r => r.key !== 'lastBackup');
    counts[s] = rows.length;
    zip.file(`data/${s}.json`, JSON.stringify(rows));
  }
  const docs = await db.getAll('docs');
  let i = 0;
  for (const d of docs) {
    zip.file(`docs/${d.id}/original.bin`, d.original, { binary: true });
    zip.file(`docs/${d.id}/meta.json`, JSON.stringify({ type: d.original.type }));
    onProgress(0.02 + 0.3 * (++i / Math.max(1, docs.length)), `Файл ${i} из ${docs.length}`);
    if (i % 5 === 0) await tick();
  }
  for (const w of await db.getAll('work')) zip.file(`docs/${w.id}/work.html`, w.html || '');
  counts.docs = docs.length;
  const images = await db.getAll('images');
  const imgMeta = [];
  for (const im of images) {
    zip.file(`images/${im.id}.bin`, im.blob, { binary: true });
    imgMeta.push({ id: im.id, fileId: im.fileId, mime: im.mime });
  }
  zip.file('data/images.json', JSON.stringify(imgMeta));
  counts.images = images.length;
  zip.file('manifest.json', JSON.stringify({ app: 'konspekty', format: FORMAT, created: new Date().toISOString(), counts }));
  const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE', streamFiles: true },
    meta => onProgress(0.35 + 0.65 * (meta.percent / 100), 'Упаковка…'));
  return { blob, name: `konspekty-kopiya-${dateKey()}.zip`, counts };
}

// Диалог «Скачать копию»: создаём ZIP, затем отдельным нажатием — «Сохранить» (так работает share на iPad)
export async function backupFlow() {
  const prog = progressDialog('Создаём копию');
  let res;
  try {
    res = await createBackup((p, t) => prog.update(p, t));
  } catch (e) {
    prog.close();
    await alertDialog('Не удалось создать копию: ' + db.describeError(e), { title: 'Ошибка' });
    return false;
  }
  prog.close();
  return new Promise(resolve => {
    const file = new File([res.blob], res.name, { type: 'application/zip' });
    const m = customDialog([
      h('h3', null, 'Копия готова'),
      h('p', { class: 'modal-text' }, `${res.name}, ${fmtBytes(res.blob.size)}. Сохраните её в «Файлы» или отправьте себе.`),
      h('div', { class: 'modal-stack' },
        h('button', {
          class: 'btn btn-primary', onclick: async () => {
            let ok = false;
            try {
              if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file] }); ok = true; }
              else { downloadBlob(res.blob, res.name); ok = true; }
            } catch (e) {
              if (e?.name !== 'AbortError') { downloadBlob(res.blob, res.name); ok = true; }
            }
            if (ok) { await db.kvSet('lastBackup', Date.now()); import('./journal.js').then(j => j.logEvent('backup', '', 'один файл')); m.close(); toast('Копия сохранена'); resolve(true); }
          },
        }, 'Сохранить копию'),
        h('button', { class: 'btn btn-quiet', onclick: () => { m.close(); resolve(false); } }, 'Закрыть')),
    ], { onBackdrop: () => {} });
  });
}

// Shows exactly what is inside the copy and what would happen; nothing is overwritten without a choice in the UI.
async function previewDialog(zip, manifest) {
  const rd = async n => { const f = zip.file(n); if (!f) return []; try { return JSON.parse(await f.async('string')); } catch { return []; } };
  const [files, ann, kv, study] = await Promise.all([rd('data/files.json'), rd('data/annotations.json'), rd('data/kv.json'), rd('data/study.json')]);
  const have = new Set((await db.getAll('files')).map(f => f.id));
  const fresh = files.filter(f => !have.has(f.id)), dup = files.length - fresh.length;
  const blocks = kv.filter(r => /^bk:/.test(r.key)).reduce((n, r) => n + Object.keys(r.value?.done || {}).length + Object.keys(r.value?.doneU || {}).length, 0);
  const when = manifest.created ? new Date(manifest.created).toLocaleString('ru-RU') : '—';
  return new Promise(resolve => {
    const done = v => { m.close(); resolve(v); };
    const row = (a, b) => h('div', { class: 'det-row' }, h('span', { class: 'muted' }, a), h('strong', null, String(b)));
    const names = fresh.slice(0, 6).map(f => f.name);
    const m = customDialog([
      h('h3', null, 'Что внутри копии'),
      h('div', { class: 'det-rows' }, row('Создана', when), row('Документов', files.length), row('…новых для этого устройства', fresh.length), row('…уже есть здесь', dup), row('Пометок и рисунков', ann.length), row('Отмеченных блоков', blocks), row('Дней учёбы', study.length)),
      names.length ? h('p', { class: 'muted' }, 'Будут добавлены: ' + names.join(', ') + (fresh.length > names.length ? ` и ещё ${fresh.length - names.length}` : '')) : h('p', { class: 'muted' }, 'Новых документов нет: добавятся только недостающие пометки и данные.'),
      h('div', { class: 'modal-stack' },
        h('button', { class: 'btn btn-primary', onclick: () => done('merge') }, 'Объединить с текущим (безопасно)'),
        h('button', { class: 'btn btn-danger-soft', onclick: () => done('replace') }, 'Заменить всё…'),
        h('button', { class: 'btn btn-quiet', onclick: () => done(null) }, 'Отмена')),
    ], { onBackdrop: () => done(null) });
  });
}

export async function restoreFlow(file) {
  const JSZip = await getJSZip();
  let zip;
  try { zip = await JSZip.loadAsync(file); }
  catch { await alertDialog('Это не файл копии: ZIP не открывается.', { title: 'Ошибка' }); return false; }
  const mf = zip.file('manifest.json');
  if (!mf) { await alertDialog('В архиве нет данных этого приложения.', { title: 'Ошибка' }); return false; }
  let manifest;
  try { manifest = JSON.parse(await mf.async('string')); } catch { manifest = null; }
  if (!manifest || manifest.app !== 'konspekty') { await alertDialog('Это не копия «Библиотеки конспектов».', { title: 'Ошибка' }); return false; }
  if (manifest.format > FORMAT) { await alertDialog('Копия создана более новой версией приложения.', { title: 'Ошибка' }); return false; }

  const mode = await previewDialog(zip, manifest);
  if (!mode) return false;
  if (mode === 'replace' && !await confirmDialog('Заменить всё? Текущие документы, пометки и прогресс будут стёрты и заменены копией. Это нельзя отменить.', { ok: 'Да, заменить', danger: true, title: 'Заменить всё?' })) return false;

  const prog = progressDialog('Восстанавливаем');
  try {
    prog.update(0.02, 'Читаем копию…');
    const read = async name => JSON.parse(await zip.file(name).async('string'));
    const data = {};
    for (const s of JSON_STORES) { const f = zip.file(`data/${s}.json`); data[s] = f ? await read(`data/${s}.json`) : []; }
    const imgMeta = zip.file('data/images.json') ? await read('data/images.json') : [];

    if (mode === 'replace') for (const s of STORES) await db.clear(s);

    const existing = async (store) => new Set((await db.getAll(store)).map(r => r.id ?? r.key));
    const merge = mode === 'merge';
    const haveFiles = merge ? await existing('files') : new Set();

    // docs
    const docIds = [...new Set(Object.keys(zip.files).filter(n => /^docs\/[^/]+\/original\.bin$/.test(n)).map(n => n.split('/')[1]))];
    const haveDocs = merge ? await existing('docs') : new Set();
    let i = 0;
    for (const id of docIds) {
      i++;
      prog.update(0.05 + 0.5 * (i / Math.max(1, docIds.length)), `Файл ${i} из ${docIds.length}`);
      if (haveDocs.has(id)) continue;
      const meta = JSON.parse(await zip.file(`docs/${id}/meta.json`).async('string'));
      const ab = await zip.file(`docs/${id}/original.bin`).async('arraybuffer');
      await db.put('docs', { id, original: new Blob([ab], { type: meta.type || '' }) });
      const wf = zip.file(`docs/${id}/work.html`);
      if (wf) await db.put('work', { id, html: await wf.async('string') });
      if (i % 3 === 0) await tick();
    }
    // images
    const haveImgs = merge ? await existing('images') : new Set();
    let j = 0;
    for (const im of imgMeta) {
      j++;
      if (haveImgs.has(im.id)) continue;
      const f = zip.file(`images/${im.id}.bin`);
      if (!f) continue;
      const ab = await f.async('arraybuffer');
      await db.put('images', { id: im.id, fileId: im.fileId, mime: im.mime, blob: new Blob([ab], { type: im.mime || '' }) });
      if (j % 10 === 0) { prog.update(0.55 + 0.25 * (j / Math.max(1, imgMeta.length)), `Картинки ${j} из ${imgMeta.length}`); await tick(); }
    }
    prog.update(0.85, 'Метаданные…');
    for (const s of JSON_STORES) {
      let rows = data[s];
      if (merge) {
        if (s === 'study') {
          const cur = new Map((await db.getAll('study')).map(r => [r.key, r]));
          rows = rows.map(r => { const c = cur.get(r.key); return c ? { ...r, seconds: Math.max(c.seconds, r.seconds) } : r; });
        } else {
          const have = await existing(s);
          if (s === 'kv') {   // receipts: closed receipts / lifetime counters are united, not skipped
            const { mergeKv, MERGED_KV_KEYS } = await import('./receipt-store.js');
            for (const r of rows.filter(r => MERGED_KV_KEYS.includes(r.key) && have.has(r.key))) await db.kvSet(r.key, mergeKv(r.key, await db.kvGet(r.key, null), r.value));
          }
          rows = rows.filter(r => !have.has(r.id ?? r.key));
        }
      }
      await db.putMany(s, rows);
    }
    if (merge) for (const r of data.files || []) if (haveFiles.has(r.id) && !r.deleted) { const loc = await db.get('files', r.id); if (loc?.deleted) { delete loc.deleted; await db.put('files', loc); } }   // a trashed file that is alive in the copy comes back
    prog.update(0.95, 'Обновляем разметку…');
    await migrateIfNeeded({ force: true });   // copies made by v1 carry marks inside the documents
    prog.close();
    await loadSettings();
    await alertDialog('Данные восстановлены.', { title: 'Готово' });
    return true;
  } catch (e) {
    prog.close();
    await alertDialog('Не удалось восстановить: ' + db.describeError(e), { title: 'Ошибка' });
    return false;
  }
}
