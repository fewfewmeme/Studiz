// Операции над папками и файлами (метаданные в IndexedDB).
import * as db from './db.js';
import { uid } from './db.js';
import { logEvent } from './journal.js';

export const isLive = f => !f.deleted;
export async function liveFiles() { return (await db.getAll('files')).filter(isLive); }
export async function subjectCounts() {
  const files = await liveFiles();
  const counts = {};
  for (const f of files) counts[f.subject] = (counts[f.subject] || 0) + 1;
  return { counts, total: files.length };
}

export async function listFolder(subject, folderId) {
  const [folders, files0] = await Promise.all([db.getAll('folders', 'subject', subject), db.getAll('files', 'subject', subject)]);
  const files = files0.filter(isLive);
  const pid = folderId || null;
  const fs = folders.filter(f => (f.parentId || null) === pid).sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  const fl = files.filter(f => (f.folderId || null) === pid).sort((a, b) => a.name.localeCompare(b.name, 'ru', { numeric: true }));
  const countIn = id => {
    let n = files.filter(f => f.folderId === id).length;
    for (const c of folders.filter(f => f.parentId === id)) n += countIn(c.id);
    return n;
  };
  return { folders: fs.map(f => ({ ...f, count: countIn(f.id) })), files: fl };
}

export async function folderPath(folderId) {
  const path = [];
  let id = folderId;
  while (id) {
    const f = await db.get('folders', id);
    if (!f) break;
    path.unshift(f);
    id = f.parentId;
  }
  return path;
}

export async function createFolder(subject, parentId, name) {
  const f = { id: uid(), subject, parentId: parentId || null, name: name.trim(), created: Date.now() };
  await db.put('folders', f);
  return f;
}
export async function renameFolder(id, name) {
  const f = await db.get('folders', id);
  if (!f) return;
  f.name = name.trim();
  await db.put('folders', f);
}

async function descendants(folderId) {
  const all = await db.getAll('folders');
  const ids = [folderId];
  for (let i = 0; i < ids.length; i++) for (const f of all) if (f.parentId === ids[i]) ids.push(f.id);
  return ids;
}
export async function folderStats(folderId) {
  const ids = await descendants(folderId);
  const files = (await db.getAll('files')).filter(f => ids.includes(f.folderId) && isLive(f));
  return { folders: ids.length - 1, files: files.length };
}
export async function deleteFolder(folderId) {
  const ids = await descendants(folderId);
  const files = (await db.getAll('files')).filter(f => ids.includes(f.folderId));
  for (const f of files) await trashFile(f.id);
  await db.delMany('folders', ids);
}

export async function renameFile(id, name) {
  const f = await db.get('files', id);
  if (!f) return;
  const old = f.name; f.name = name.trim();
  await db.put('files', f); logEvent('renamed', f.name, 'было: ' + old);
}
export async function setExam(id, exam) {
  const f = await db.get('files', id);
  if (!f) return;
  f.exam = !!exam; await db.put('files', f);
  // the timer of the open receipt follows the flag of the file that is open
  try { const ST = await import('./study-store.js'); if (ST.state().subj) ST.setExam(!!exam); } catch { /* ignore */ }
}
export async function moveFile(id, subject, folderId) {
  const f = await db.get('files', id);
  if (!f) return;
  f.subject = subject;
  f.folderId = folderId || null;
  await db.put('files', f); logEvent('moved', f.name, 'предмет: ' + subject);
}
// soft delete: the document goes to the trash for 30 days (undo in a toast, restore in Настройки → Корзина)
export async function trashFile(id) { const f = await db.get('files', id); if (!f) return; f.deleted = Date.now(); await db.put('files', f); logEvent('trashed', f.name); }
export async function restoreFile(id) {
  const f = await db.get('files', id); if (!f) return;
  delete f.deleted; if (f.folderId && !(await db.get('folders', f.folderId))) f.folderId = null;
  await db.put('files', f); logEvent('restored', f.name);
}
export async function trashList() { return (await db.getAll('files')).filter(f => f.deleted).sort((a, b) => b.deleted - a.deleted); }
export const TRASH_DAYS = 30;
export async function purgeTrash() { const old = (await trashList()).filter(f => Date.now() - f.deleted > TRASH_DAYS * 86400000); for (const f of old) await deleteFile(f.id); return old.length; }
export async function deleteFile(id) {
  const meta0 = await db.get('files', id);
  const imgKeys = await db.keysByIndex('images', 'fileId', id);
  await db.delMany('images', imgKeys);
  await db.del('docs', id);
  await db.del('work', id);
  await db.del('marks', id);
  await db.delMany('annotations', await db.keysByIndex('annotations', 'docId', id));
  await db.del('files', id);
  await clearFileState(id);
  if (meta0) logEvent('deleted', meta0.name);
}
export async function clearFileState(id) {
  const kv = await db.getAll('kv');
  await db.delMany('kv', kv.filter(r => ['pos:', 'read:', 'tools:', 'bk:', 'bkt:', 'bm:', 'bmk:', 'zoom:', 'undo:', 'trim:', 'pdfbounds:', 'ptext:', 'bkmap:', 'migratedMarks:', 'fz:', 'fpos:', 'ds:'].some(p => r.key.startsWith(p + id)) || r.key === `pdfwords:${id}`).map(r => r.key));
}

// Дерево папок для выбора места
export async function folderTree() {
  const [folders] = await Promise.all([db.getAll('folders')]);
  const by = new Map();
  for (const f of folders) { const k = (f.subject) + '|' + (f.parentId || ''); (by.get(k) || by.set(k, []).get(k)).push(f); }
  const walk = (subject, parentId, depth, out) => {
    const list = (by.get(subject + '|' + (parentId || '')) || []).sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    for (const f of list) { out.push({ subject, folderId: f.id, name: f.name, depth }); walk(subject, f.id, depth + 1, out); }
  };
  return (subject) => { const out = []; walk(subject, null, 1, out); return out; };
}

export async function recentFiles(n) {
  return db.lastByIndex('files', 'opened', n, f => f.opened > 0 && !f.deleted);
}

// ---------- search across the whole library (titles + text, offline) ----------
const stripHtml = h => h.replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
const textCache = new Map();
export async function textOf(f, { pdfPages = 60 } = {}) {
  if (textCache.has(f.id)) return textCache.get(f.id);
  let t = '';
  if (f.type === 'html') {
    const w = await db.get('work', f.id);
    if (w?.plain) t = w.plain;
    else if (w?.html) t = stripHtml(w.html);
    else { try { const rec = await db.get('docs', f.id); const buf = await rec.original.arrayBuffer(); let raw; try { raw = new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch { raw = new TextDecoder('windows-1251').decode(buf); } t = stripHtml(raw.replace(/<script[\s\S]*?<\/script>/gi, ' ')); } catch { t = ''; } }
  }
  else if (f.type === 'pdf') {
    t = (await db.kvGet('ptext:' + f.id, null)) ?? null;
    if (t == null) {
      try {
        const { openPdf } = await import('./libs.js');
        const pdf = await openPdf(await (await db.get('docs', f.id)).original.arrayBuffer()); const parts = [];
        for (let n = 1; n <= Math.min(pdf.numPages, pdfPages); n++) { const pg = await pdf.getPage(n); const tc = await pg.getTextContent(); parts.push(tc.items.map(i => i.str).join(' ')); pg.cleanup?.(); }
        pdf.destroy?.(); t = parts.join(' ').replace(/\s+/g, ' ');
      } catch { t = ''; }
      db.kvSet('ptext:' + f.id, t).catch(() => {});
    }
  }
  textCache.set(f.id, t); return t;
}
export async function searchLibrary(query, { onProgress } = {}) {
  const q = query.trim().toLowerCase(); if (q.length < 2) return [];
  const toks = q.split(/\s+/).filter(Boolean);
  const files = await liveFiles(), out = [];
  let i = 0;
  for (const f of files) {
    onProgress?.(++i / files.length);
    const name = f.name.toLowerCase(), titleHit = toks.every(t => name.includes(t));
    const text = await textOf(f), low = text.toLowerCase();
    const textHit = toks.every(t => low.includes(t));
    if (!titleHit && !textHit) continue;
    let snippet = '';
    if (textHit) { const at = low.indexOf(toks[0]); snippet = (at > 50 ? '…' : '') + text.slice(Math.max(0, at - 50), at + 110) + '…'; }
    out.push({ file: f, title: titleHit, snippet, score: (titleHit ? 100 : 0) + toks.reduce((a, t) => a + Math.min(20, low.split(t).length - 1), 0) });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 60);
}

// ---------- duplicates: by content hash first, then by title; ONLY live documents count (never the trash) ----------
export async function sha256(buf) {
  try { const d = await crypto.subtle.digest('SHA-256', buf); return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join(''); } catch { return null; }
}
const normTitle = n => String(n || '').replace(/\.[a-z0-9]{1,5}$/i, '').replace(/\s+/g, ' ').trim().toLowerCase();
export async function findDuplicates({ name, hash }) {
  const all = await db.getAll('files');
  const key = normTitle(name);
  const match = list => list.find(f => hash && f.hash === hash) || list.find(f => normTitle(f.name) === key);
  const live = match(all.filter(isLive)), trashed = live ? null : match(all.filter(f => f.deleted));
  const how = f => (f && hash && f.hash === hash ? 'hash' : 'title');
  return { live, trashed, liveBy: how(live), trashedBy: how(trashed) };
}
export async function whereIs(f) {
  const { SUBJECTS } = await import('../config.js');
  const sj = SUBJECTS.find(s => s.key === f.subject);
  const path = f.folderId ? (await folderPath(f.folderId)).map(x => x.name).join(' / ') : '';
  return { subject: sj ? sj.name : f.subject, folder: path, added: f.updatedAt || f.added };
}
