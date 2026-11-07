// IndexedDB: тонкая обёртка с промисами.
import { DB_NAME, DB_VERSION } from '../config.js';

// Хранилища:
//  folders    {id, subject, parentId|null, name, created}
//  files      {id, subject, folderId|null, name, type, ext, size, added, opened, ...}  — только метаданные
//  docs       {id(=fileId), original: Blob}                                          — оригинал, грузится лениво
//  work       {id(=fileId), html}                                                    — рабочая копия HTML (пометки внутри разметки)
//  images     {id, fileId, blob, mime}                                                 — картинки HTML и фото пользователя
//  marks      {id(=fileId), pages: {номер: [пометки]}}                                 — пометки PDF/картинок
//  study      {key: "дата|предмет", date, subject, seconds}
//  completions{key: "файл|часть|дата", date, subject, fileId, part, ts}
//  kv         {key, value}                                                             — настройки, положения, прочее
export const STORES = ['folders', 'files', 'docs', 'work', 'images', 'marks', 'annotations', 'snapshots', 'study', 'completions', 'kv'];
const KEYPATH = { study: 'key', completions: 'key', kv: 'key' };

let dbPromise = null;

export function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const s of STORES) {
        if (db.objectStoreNames.contains(s)) continue;
        const st = db.createObjectStore(s, { keyPath: KEYPATH[s] || 'id' });
        if (s === 'folders') { st.createIndex('subject', 'subject'); st.createIndex('parentId', 'parentId'); }
        if (s === 'files') { st.createIndex('subject', 'subject'); st.createIndex('folderId', 'folderId'); st.createIndex('opened', 'opened'); }
        if (s === 'images') st.createIndex('fileId', 'fileId');
        if (s === 'annotations') st.createIndex('docId', 'docId');
        if (s === 'study') st.createIndex('date', 'date');
        if (s === 'completions') st.createIndex('date', 'date');
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    req.onerror = () => { dbPromise = null; reject(req.error); };
    req.onblocked = () => reject(new Error('База данных занята другой вкладкой'));
  });
  return dbPromise;
}

function wrap(req) {
  return new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
}

function txDone(tx) {
  return new Promise((res, rej) => {
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
    tx.onabort = () => rej(tx.error || new DOMException('Транзакция отменена', 'AbortError'));
  });
}

export async function get(store, key) {
  const db = await openDB();
  return wrap(db.transaction(store).objectStore(store).get(key));
}
export async function getAll(store, indexName, query) {
  const db = await openDB();
  const os = db.transaction(store).objectStore(store);
  return wrap((indexName ? os.index(indexName) : os).getAll(query));
}
export async function count(store, indexName, query) {
  const db = await openDB();
  const os = db.transaction(store).objectStore(store);
  return wrap((indexName ? os.index(indexName) : os).count(query));
}
export async function put(store, value) {
  const db = await openDB();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).put(value);
  return txDone(tx);
}
// Прочитать, изменить и записать в ОДНОЙ транзакции (надёжно при закрытии страницы)
export async function modify(store, key, fn, fallback) {
  const db = await openDB();
  const tx = db.transaction(store, 'readwrite');
  const os = tx.objectStore(store);
  const g = os.get(key);
  g.onsuccess = () => { const next = fn(g.result === undefined ? fallback : g.result); if (next !== undefined) os.put(next); };
  return txDone(tx);
}
export async function putMany(store, values) {
  if (!values.length) return;
  const db = await openDB();
  const tx = db.transaction(store, 'readwrite');
  const os = tx.objectStore(store);
  for (const v of values) os.put(v);
  return txDone(tx);
}
export async function del(store, key) {
  const db = await openDB();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).delete(key);
  return txDone(tx);
}
export async function delMany(store, keys) {
  if (!keys.length) return;
  const db = await openDB();
  const tx = db.transaction(store, 'readwrite');
  const os = tx.objectStore(store);
  for (const k of keys) os.delete(k);
  return txDone(tx);
}
export async function clear(store) {
  const db = await openDB();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).clear();
  return txDone(tx);
}
// Ключи по индексу (для удаления связанных записей)
export async function keysByIndex(store, indexName, query) {
  const db = await openDB();
  return wrap(db.transaction(store).objectStore(store).index(indexName).getAllKeys(query));
}
// Последние N записей по индексу (по убыванию)
export async function lastByIndex(store, indexName, n, filter) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const out = [];
    const req = db.transaction(store).objectStore(store).index(indexName).openCursor(null, 'prev');
    req.onsuccess = () => {
      const c = req.result;
      if (!c || out.length >= n) return resolve(out);
      if (!filter || filter(c.value)) out.push(c.value);
      c.continue();
    };
    req.onerror = () => reject(req.error);
  });
}

// kv
export async function kvGet(key, fallback) {
  const r = await get('kv', key);
  return r === undefined ? fallback : r.value;
}
export function kvSet(key, value) { return put('kv', { key, value }); }
export function kvDel(key) { return del('kv', key); }

export function uid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'id' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

// Понятное сообщение об ошибке хранилища
export function describeError(e) {
  if (!e) return 'Неизвестная ошибка';
  if (e.name === 'QuotaExceededError' || /quota/i.test(e.message || '')) {
    return 'Не хватает места на устройстве. Освободите место или удалите ненужные файлы.';
  }
  return e.message || String(e);
}
