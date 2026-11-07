// Импорт файлов: оригинал (Blob) и рабочая копия хранятся отдельно.
import * as db from './db.js';
import { uid } from './db.js';
import { baseName, extOf, tick } from './util.js';
import { openPdf } from './libs.js';
import { sniffKind } from './adapt/index.js';
import { guessSubject } from './adapt/guess.js';
import { convertToFrame } from './convert/index.js';
import { clearFileState, sha256 } from './library.js';
import { logEvent } from './journal.js';

const TYPE_BY_EXT = {
  pdf: 'pdf', html: 'html', htm: 'html', docx: 'docx', txt: 'txt', md: 'md', markdown: 'md',
  jpg: 'image', jpeg: 'image', png: 'image',
};
const MIME_BY_EXT = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', pdf: 'application/pdf', html: 'text/html', htm: 'text/html', txt: 'text/plain', md: 'text/markdown', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };

const IMG_MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', heic: 'image/heic', heif: 'image/heif' };
export function detectType(file) { return { ext: extOf(file.name) || '' }; }

// Round 7: an HTML file is kept exactly as it is (never restyled); only a few facts are read from it.
export function rawHtmlInfo(buf, name) {
  let t; try { t = new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch { t = new TextDecoder('windows-1251').decode(buf); }
  const title = (/<meta[^>]+name=["']studiem:title["'][^>]+content=["']([^"']+)/i.exec(t) || /<title[^>]*>([^<]*)/i.exec(t) || [])[1];
  const subject = (/<meta[^>]+name=["']studiem:subject["'][^>]+content=["']([^"']+)/i.exec(t) || [])[1];
  const body = t.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ');
  const words = (body.match(/[\p{L}\p{N}]+/gu) || []).length;
  const blocks = (t.match(/<section[^>]*class=["'][^"']*\bblk\b/gi) || []).length;
  const g = guessSubject((title || name || '') + ' ' + (name || ''), body);
  return { type: 'html', raw: true, words, title: (title || '').trim(), subject, blockCount: blocks, guess: g.key, guessConf: g.confidence };
}
// bytes -> {type, html?, images, words, pages?, w?, h?, sdm?, report?}
async function convert(kind, buf, name, mime, id, onProgress) {
  if (kind === 'pdf') {
    let pdf, ratio = 1.414, pages = 0;
    try { pdf = await openPdf(buf.slice(0)); pages = pdf.numPages; try { const p = await pdf.getPage(1); const v = p.getViewport({ scale: 1 }); ratio = v.height / v.width; } catch { /* A4 */ } pdf.destroy?.(); }
    catch (e) {
      if (e?.name === 'PasswordException') throw new Error('PDF защищён паролем. Снимите защиту и добавьте файл снова.');
      throw new Error('PDF-файл повреждён или не открывается.');
    }
    const r = await convertToFrame({ kind, buf, name: baseName(name), onProgress });
    return { type: 'pdf', conv: true, html: r.html, pages, ratio, words: r.words, layout: r.layout };
  }
  if (kind === 'image') {
    const blob = new Blob([buf], { type: mime });
    const dims = await new Promise((res, rej) => {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => { res({ w: img.naturalWidth, h: img.naturalHeight }); URL.revokeObjectURL(url); };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Не удалось открыть изображение: файл повреждён или формат не поддерживается этим браузером.')); };
      img.src = url;
    });
    const r = await convertToFrame({ kind, buf, name: baseName(name), onProgress });
    return { type: 'image', conv: true, html: r.html, pages: 1, ratio: dims.h / dims.w, w: dims.w, h: dims.h, layout: 'pages' };
  }
  if (kind === 'html') return rawHtmlInfo(buf, name);
  const r = await convertToFrame({ kind, buf, name: baseName(name), onProgress });
  return { type: 'html', conv: true, html: r.html, words: r.words, layout: r.layout, title: baseName(name), plain: r.plain, engine: r.engine, loss: r.loss };
}

// Возвращает метаданные нового файла. Бросает Error с русским сообщением.
export async function importFile(file, { subject, folderId, onProgress, hash } = {}) {
  let buf;
  try { buf = await file.arrayBuffer(); }
  catch { throw new Error(`Не удалось прочитать «${file.name}». Возможно, файл ещё не скачан из iCloud.`); }
  if (!buf.byteLength) throw new Error(`Файл «${file.name}» пустой.`);
  const ext = extOf(file.name);
  const kind = sniffKind(buf, file.name);
  if (kind === 'corrupt-pdf') throw new Error('PDF-файл повреждён или не открывается.');
  if (kind === 'corrupt-docx') throw new Error('DOCX-файл повреждён или не является документом Word.');
  if (kind === 'corrupt-image') throw new Error('Не удалось открыть изображение: файл повреждён или формат не поддерживается этим браузером.');
  if (kind === 'unsupported') throw new Error(`Тип файла не поддерживается: «${file.name}». Подходят: PDF, HTML, DOCX, Markdown, TXT и фотографии.`);
  const mime = kind === 'image' ? (file.type || IMG_MIME[ext] || 'image/jpeg') : (file.type || 'application/octet-stream');
  const id = uid();
  const conv = await convert(kind, buf, file.name, mime, id, onProgress);
  await tick();
  const original = new Blob([buf], { type: mime });
  const meta = {
    id, subject, folderId: folderId || null, name: baseName(file.name) || file.name,
    ext, srcKind: kind, type: conv.type, size: file.size, added: Date.now(), opened: 0, hash: hash || await sha256(buf),
    words: conv.words || 0, pages: conv.pages || 0, ratio: conv.ratio || 0,
  };
  if (conv.conv) Object.assign(meta, { conv: true, layout: conv.layout || '', ...(conv.engine ? { engine: conv.engine, docxLoss: !!conv.loss } : {}), minutes: Math.max(1, Math.round((conv.words || 0) / 110)) });
  if (conv.raw) Object.assign(meta, { raw: true, blockCount: conv.blockCount || 0, minutes: Math.max(1, Math.round((conv.words || 0) / 110)), studiemSubject: conv.subject || null, subjectGuess: conv.subject || conv.guess || null, subjectConfidence: conv.subject ? 1 : (conv.guessConf || 0) });
  try {
        await db.put('docs', { id, original });
    if (conv.conv) await db.put('work', { id, html: conv.html, converted: true, ...(conv.plain ? { plain: conv.plain } : {}), ...(conv.engine ? { engine: conv.engine } : {}) });
    await db.put('files', meta);
  } catch (e) {
    try {
      await db.delMany('images', await db.keysByIndex('images', 'fileId', id));
      await db.del('docs', id);
      await db.del('work', id);
    } catch { /* ignore */ }
    throw new Error(db.describeError(e));
  }
  try { localStorage.setItem('hadFiles', '1'); } catch { /* ignore */ }
  logEvent('imported', meta.name, meta.size ? Math.round(meta.size / 1024) + ' КБ' : '');
  return meta;
}

// «Пересобрать»: a converted file (PDF, Word, Markdown, text, photo) is converted again from the stored original. An HTML file is never changed.
export async function readapt(fileId, { onProgress } = {}) {
  const meta = await db.get('files', fileId), docRec = await db.get('docs', fileId);
  if (!meta || !docRec) throw new Error('Файл не найден.');
  if (meta.raw || meta.note) return false;      // a note is edited in the editor, never re-converted
  const buf = await docRec.original.arrayBuffer();
  const conv = await convert(meta.srcKind || meta.type, buf, meta.name, docRec.original.type, fileId, onProgress);
  if (!conv.conv) return false;
  await db.put('work', { id: fileId, html: conv.html, converted: true, ...(conv.plain ? { plain: conv.plain } : {}), ...(conv.engine ? { engine: conv.engine } : {}) });
  Object.assign(meta, { conv: true, ...(conv.engine ? { engine: conv.engine, docxLoss: !!conv.loss } : {}), layout: conv.layout || '', words: conv.words || meta.words, pages: conv.pages || meta.pages, minutes: Math.max(1, Math.round((conv.words || 0) / 110)) });
  await db.put('files', meta);
  return true;
}

// «Сбросить к оригиналу»: рабочая копия пересоздаётся из оригинала, пометки пропадают
export async function resetToOriginal(fileId) {
  const meta = await db.get('files', fileId);
  const docRec = await db.get('docs', fileId);
  if (!meta || !docRec) throw new Error('Файл не найден.');
  await db.del('marks', fileId);
  await db.delMany('annotations', await db.keysByIndex('annotations', 'docId', fileId));
  await db.delMany('images', await db.keysByIndex('images', 'fileId', fileId));
  await clearFileState(fileId);
  if (meta.type === 'html' || meta.type === 'pdf' || meta.type === 'image') await readapt(fileId);
}

// ---- a re-uploaded document: same title in the same subject -> offer "update" instead of a duplicate ----
export async function findSameDoc(fileName, subject) {   // legacy name; the library uses findDuplicates()
  const key = baseName(fileName).trim().toLowerCase();
  const ext = extOf(fileName);
  return (await db.getAll('files')).find(f => f.subject === subject && f.ext === ext && f.name.trim().toLowerCase() === key) || null;
}
// update in place: progress, bookmarks, marks stay (marks are re-anchored when the document opens); a snapshot is taken first
export async function updateFromFile(fileId, file, { onProgress } = {}) {
  const meta = await db.get('files', fileId); if (!meta) throw new Error('Файл не найден.');
  const buf = await file.arrayBuffer();
  const kind = sniffKind(buf, file.name);
  if (['unsupported', 'corrupt-pdf', 'corrupt-docx', 'corrupt-image'].includes(kind)) throw new Error('Новая версия не открывается.');
  const old = await db.get('docs', fileId), oldWork = await db.get('work', fileId);
  const anns = await db.getAll('annotations', 'docId', fileId);
  await db.put('snapshots', { id: 'upd-' + fileId + '-' + Date.now(), created: Date.now(), kind: 'before-update', fileId, original: old?.original, work: oldWork, annotations: anns, meta });
  const mime = file.type || old?.original?.type || 'application/octet-stream';
  const conv = await convert(kind, buf, file.name, mime, fileId, onProgress);
  await db.put('docs', { id: fileId, original: new Blob([buf], { type: mime }) });
  if (conv.conv) {
    await db.put('work', { id: fileId, html: conv.html, converted: true, ...(conv.plain ? { plain: conv.plain } : {}), ...(conv.engine ? { engine: conv.engine } : {}) });
    Object.assign(meta, { conv: true, ...(conv.engine ? { engine: conv.engine, docxLoss: !!conv.loss } : {}), raw: false, srcKind: kind, ext: extOf(file.name) || meta.ext, type: conv.type, layout: conv.layout || '', words: conv.words || 0, pages: conv.pages || meta.pages, ratio: conv.ratio || meta.ratio, minutes: Math.max(1, Math.round((conv.words || 0) / 110)) });
  } else if (conv.raw) {
    await db.del('work', fileId);
    Object.assign(meta, { raw: true, conv: false, srcKind: 'html', type: 'html', ext: extOf(file.name) || meta.ext, words: conv.words, blockCount: conv.blockCount || 0, minutes: Math.max(1, Math.round((conv.words || 0) / 110)) });
  }
  meta.size = file.size; meta.hash = await sha256(buf); meta.updatedAt = Date.now();
  await db.put('files', meta);
  logEvent('updated', meta.name);
  return meta;
}
