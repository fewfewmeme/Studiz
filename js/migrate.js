// Data migration v1 -> v2.
// v1 kept HTML marks inside the document markup (span.ann) and PDF/image marks in the `marks` store.
// v2 keeps documents immutable and stores every annotation as a separate record in `annotations`.
// Before anything is changed, the records that are about to change are copied to the `snapshots` store.
import * as db from './db.js';
import { SCHEMA_VERSION } from '../config.js';
import { buildIndex, makeAnchor } from './anno/anchor.js';

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Pull v1 span.ann marks out of an HTML string. Returns {html (clean), marks[]}.
export function extractV1HtmlMarks(html) {
  const doc = new DOMParser().parseFromString(`<body><article class="doc">${html}</article></body>`, 'text/html');
  const root = doc.body.firstElementChild;
  const spans = [...root.querySelectorAll('span.ann')];
  if (!spans.length) return { html, marks: [] };
  const index = buildIndex(root);
  const marks = [];
  const t0 = Date.now();
  spans.forEach((sp, i) => {
    let start = Infinity, end = -1;
    const w = document.createTreeWalker(sp, NodeFilter.SHOW_TEXT);
    // TreeWalker needs an attached or any node: works on detached trees too
    while (w.nextNode()) { const e = index.map.get(w.currentNode); if (e) { start = Math.min(start, e.start); end = Math.max(end, e.end); } }
    if (end <= start) return;
    const cls = sp.className;
    const anchor = makeAnchor(index.text, start, end);
    const base = { docId: null, anchor, created: t0 + i, migrated: 'v1' };
    if (cls.includes('ann-hl')) marks.push({ ...base, type: 'hl', color: sp.dataset.c || sp.style.backgroundColor || '#ffe58a' });
    else if (cls.includes('ann-ul')) marks.push({ ...base, type: 'ul', color: '#d6246e', ulStyle: 'solid' });
    else if (cls.includes('ann-st')) marks.push({ ...base, type: 'strike', color: '#6f6a6d' });
    else if (cls.includes('ann-b')) marks.push({ ...base, type: 'bold' });
    else if (cls.includes('ann-note')) marks.push({ ...base, type: 'note', color: null, note: sp.dataset.note || '', group: sp.dataset.nid || null });
  });
  // unwrap marks; the text stays byte-identical, so the offsets stay valid
  for (const sp of spans.reverse()) { const p = sp.parentNode; while (sp.firstChild) p.insertBefore(sp.firstChild, sp); sp.remove(); }
  root.normalize();
  return { html: root.innerHTML, marks };
}

// v1 `marks` record ({pages:{n:[...]}}) -> annotation records (y stays "normalised by page height": yu:'h')
export function convertV1PageMarks(docId, rec) {
  const out = [];
  let k = 0;
  for (const [pg, list] of Object.entries(rec?.pages || {})) {
    const page = Number(pg);
    for (const a of list) {
      const base = { docId, page, yu: 'h', created: 1e12 + (k++), migrated: 'v1' };
      if (a.t === 'hl' || a.t === 'ul') out.push({ ...base, type: a.t, color: a.c, rects: a.rects, ulStyle: 'solid' });
      else if (a.t === 'pen' || a.t === 'brush') out.push({ ...base, type: a.t, color: a.c, width: a.w, points: (a.pts || []).map(p => [p[0], p[1], 0.5]) });
      else if (a.t === 'text') out.push({ ...base, type: 'text', x: a.x, y: a.y, w: a.w, fs: a.fs || 0.028, color: a.c || '#1c1e21', html: esc(a.text || '') });
      else if (a.t === 'img') out.push({ ...base, type: 'photo', blobKey: a.imgId, x: a.x, y: a.y, w: a.w, h: null, rot: 0 });
    }
  }
  return out;
}

export async function schemaVersion() { return db.kvGet('schemaVersion', 1); }

// Safe to call on every start (cheap when nothing is to do). `force` rescans everything (used after a restore).
export async function migrateIfNeeded({ force = false } = {}) {
  const ver = await schemaVersion();
  if (ver >= SCHEMA_VERSION && !force) return { migrated: false };
  const files = await db.getAll('files');
  const marksRecs = await db.getAll('marks');
  const migratedMarks = new Set((await db.getAll('kv')).filter(r => r.key.startsWith('migratedMarks:')).map(r => r.key.slice(14)));
  const pageDocs = marksRecs.filter(m => !migratedMarks.has(m.id) && Object.keys(m.pages || {}).length);

  // HTML documents that still carry v1 marks in the markup
  const htmlTodo = [];
  for (const f of files) {
    if (f.type !== 'html') continue;
    const w = await db.get('work', f.id);
    if (w && /class="ann /.test(w.html || '')) htmlTodo.push({ f, w });
  }

  if (htmlTodo.length || pageDocs.length) {
    const snap = {
      id: 'pre-v2-' + new Date().toISOString().replace(/[:.]/g, '-'),
      created: Date.now(), reason: 'migration v1 -> v2',
      files: htmlTodo.map(x => x.f), work: htmlTodo.map(x => x.w), marks: pageDocs,
    };
    await db.put('snapshots', snap);                       // 1. internal backup first
    for (const { f, w } of htmlTodo) {                     // 2. convert HTML documents
      const { html, marks } = extractV1HtmlMarks(w.html);
      const recs = marks.map((m, i) => ({ ...m, id: `${f.id}:v1:${i}`, docId: f.id }));
      await db.putMany('annotations', recs);
      await db.put('work', { ...w, html });
    }
    for (const m of pageDocs) {                            // 3. convert page marks
      const recs = convertV1PageMarks(m.id, m).map((r, i) => ({ ...r, id: `${m.id}:v1:${i}` }));
      await db.putMany('annotations', recs);
      await db.kvSet('migratedMarks:' + m.id, true);
    }
    // keep only the three newest snapshots
    const all = (await db.getAll('snapshots')).sort((a, b) => b.created - a.created);
    await db.delMany('snapshots', all.slice(3).map(s => s.id));
  }
  await db.kvSet('schemaVersion', SCHEMA_VERSION);
  return { migrated: true, html: htmlTodo.length, pages: pageDocs.length };
}
