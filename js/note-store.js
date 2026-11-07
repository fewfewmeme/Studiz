// Notes («Текст»): create / update a note as an ordinary library file (type html, conv, note:true).
import * as db from './db.js';
import { uid } from './db.js';
import { getPurify, getMarked } from './libs.js';
import { wrapPaper } from './convert/paper.js';
import { sha256 } from './library.js';
import { logEvent } from './journal.js';
import { cleanStyle, buildNoteDoc, countWordsHtml, titleFromText, looksLikeMarkdown, plainToHtml } from './note-core.js';

const TAGS = ['p', 'br', 'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'del', 'sub', 'sup', 'span', 'font', 'h1', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'blockquote', 'pre', 'code', 'hr', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'img', 'div', 'a', 'figure', 'figcaption', 'mark'];
// anything pasted or typed goes through here: DOMPurify, then the inline-style whitelist; images only as data: URLs
export async function sanitizeBody(html) {
  const purify = await getPurify();
  const clean = purify.sanitize(String(html), { ALLOWED_TAGS: TAGS, ALLOWED_ATTR: ['style', 'src', 'alt', 'href', 'data-wrap', 'colspan', 'rowspan', 'align', 'size', 'color', 'face'], ALLOWED_URI_REGEXP: /^(?:data:image\/|#|mailto:|https?:)/i });
  const doc = new DOMParser().parseFromString('<body>' + clean + '</body>', 'text/html');
  doc.body.querySelectorAll('[style]').forEach(el => { const s = cleanStyle(el.getAttribute('style')); if (s) el.setAttribute('style', s); else el.removeAttribute('style'); });
  doc.body.querySelectorAll('font').forEach(f => { const sp = doc.createElement('span'); const st = []; if (f.getAttribute('color')) st.push('color:' + f.getAttribute('color')); if (f.getAttribute('face')) st.push('font-family:' + f.getAttribute('face')); const c = cleanStyle(st.join(';')); if (c) sp.setAttribute('style', c); sp.append(...f.childNodes); f.replaceWith(sp); });
  doc.body.querySelectorAll('img').forEach(im => { if (!/^data:image\//i.test(im.getAttribute('src') || '')) im.remove(); else if (!im.dataset.wrap) im.dataset.wrap = 'none'; });
  doc.body.querySelectorAll('a').forEach(a => { a.setAttribute('rel', 'noopener noreferrer'); a.setAttribute('target', '_blank'); });
  return doc.body.innerHTML;
}
// pasted plain text -> HTML (Markdown is rendered: bold, headings, lists, tables, ...)
export async function textToNoteHtml(text) {
  if (looksLikeMarkdown(text)) { const { marked } = await getMarked(); return sanitizeBody(marked.parse(String(text).replace(/\r\n?/g, '\n'), { gfm: true, breaks: true })); }
  return sanitizeBody(plainToHtml(text));
}

export const getNote = async id => { const meta = await db.get('files', id); if (!meta || !meta.note) return null; const work = await db.get('work', id); return { meta, body: work?.noteHtml || '' }; };

async function write(meta, body) {
  const html = buildNoteDoc(body, meta.name, wrapPaper);
  const blob = new Blob([html], { type: 'text/html' });
  meta.words = countWordsHtml(body); meta.minutes = Math.max(1, Math.round(meta.words / 110)); meta.size = blob.size; meta.updatedAt = Date.now();
  const plain = body.replace(/<img[^>]*>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  await db.put('docs', { id: meta.id, original: blob });
  await db.put('work', { id: meta.id, html, converted: true, noteHtml: body, plain });
  await db.put('files', meta);
}
export async function createNote({ subject, folderId = null, title, body }) {
  const name = (title || '').trim() || titleFromText(body);
  const meta = { id: uid(), subject, folderId: folderId || null, name, ext: 'note', srcKind: 'html', type: 'html', conv: true, layout: 'text', note: true, added: Date.now(), opened: 0, pages: 0, ratio: 0 };
  meta.hash = await sha256(new TextEncoder().encode(name + body));
  await write(meta, body);
  try { localStorage.setItem('hadFiles', '1'); } catch { /* ignore */ }
  logEvent('imported', meta.name, 'текст');
  return meta;
}
export async function updateNote(id, { title, body }) {
  const meta = await db.get('files', id); if (!meta) throw new Error('Файл не найден.');
  if (title && title.trim()) meta.name = title.trim();
  await write(meta, body); return meta;
}
