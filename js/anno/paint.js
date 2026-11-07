// Paints text marks into the document DOM from annotation data.
// - the document is split at every mark boundary into non-overlapping segments;
// - each segment becomes ONE <span class="mk"> with ONE solid background (multiply of the colours covering it),
//   drawn behind the glyphs, so text colour is never touched and overlaps stay clean;
// - underline / strike are real text-decorations with an independent colour and style.
import { buildIndex, resolveAnchor } from './anchor.js';

export function parseColor(c) {
  if (!c) return null;
  c = String(c).trim();
  let m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c);
  if (m) {
    let h = m[1]; if (h.length === 3) h = h.split('').map(x => x + x).join('');
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  m = /^rgba?\(\s*(\d+)[ ,]+(\d+)[ ,]+(\d+)/i.exec(c);
  return m ? [+m[1], +m[2], +m[3]] : null;
}
export const multiply = (a, b) => [Math.round(a[0] * b[0] / 255), Math.round(a[1] * b[1] / 255), Math.round(a[2] * b[2] / 255)];
export const toCss = c => `rgb(${c[0]}, ${c[1]}, ${c[2]})`;

// 'm1'..'m6' -> value of --mark-N; anything else is taken as a CSS colour
export function resolveMarkColor(c) {
  if (/^m[1-6]$/.test(c || '')) {
    const v = getComputedStyle(document.documentElement).getPropertyValue('--mark-' + c.slice(1)).trim();
    return parseColor(v) || [255, 229, 138];
  }
  return parseColor(c);
}

export function unpaint(root) {
  const spans = root.querySelectorAll('span.mk');
  if (!spans.length) return;
  for (const sp of spans) { const p = sp.parentNode; while (sp.firstChild) p.insertBefore(sp.firstChild, sp); sp.remove(); }
  try { root.normalize(); } catch { /* ignore */ }
}

// Returns the fresh text index (built on the unpainted text; offsets are identical when painted).
export function paintMarks(root, marks) {
  unpaint(root);
  const index = buildIndex(root);
  const items = [];
  for (const m of marks) {
    const r = resolveAnchor(index, m.anchor);
    if (r && r.end > r.start) items.push({ m, start: r.start, end: r.end });
  }
  if (!items.length) return index;
  items.sort((a, b) => (a.m.created || 0) - (b.m.created || 0));

  const pts = [...new Set(items.flatMap(i => [i.start, i.end]))].sort((a, b) => a - b);
  const segs = [];
  for (let k = 0; k + 1 < pts.length; k++) {
    const a = pts[k], b = pts[k + 1];
    const cover = items.filter(i => i.start <= a && i.end >= b);
    if (cover.length) segs.push({ a, b, cover });
  }
  // paint per text node (two-pointer over segments)
  let si = 0;
  for (const e of index.nodes) {
    while (si < segs.length && segs[si].b <= e.start) si++;
    let sj = si;
    const pieces = [];
    while (sj < segs.length && segs[sj].a < e.end) { pieces.push(segs[sj]); sj++; }
    if (!pieces.length) continue;
    const node = e.node, text = node.data;
    const frag = document.createDocumentFragment();
    let cur = 0;
    for (const sg of pieces) {
      const s = Math.max(sg.a, e.start) - e.start, t = Math.min(sg.b, e.end) - e.start;
      if (s > cur) frag.append(text.slice(cur, s));
      frag.append(makeSpan(sg, text.slice(s, t)));
      cur = t;
    }
    if (cur < text.length) frag.append(text.slice(cur));
    node.parentNode.replaceChild(frag, node);
  }
  return index;
}

function makeSpan(seg, text) {
  const sp = document.createElement('span');
  sp.className = 'mk';
  sp.textContent = text;
  sp.dataset.ids = seg.cover.map(i => i.m.id).join(',');
  let bg = null, ul = null, st = null, note = false, bold = false;
  for (const { m } of seg.cover) {
    if (m.type === 'hl') { const c = resolveMarkColor(m.color); if (c) bg = bg ? multiply(bg, c) : c; }
    else if (m.type === 'ul') ul = m;
    else if (m.type === 'strike') st = m;
    else if (m.type === 'note') note = true;
    else if (m.type === 'bold') bold = true;
  }
  if (bg) sp.style.backgroundColor = toCss(bg);
  const lines = [];
  if (ul) lines.push('underline');
  if (st) lines.push('line-through');
  if (lines.length) {
    sp.style.textDecorationLine = lines.join(' ');
    const deco = ul || st;
    sp.style.textDecorationStyle = (ul && ul.ulStyle) || 'solid';
    const c = parseColor(deco.color);
    if (c) sp.style.textDecorationColor = toCss(c);
  } else if (note) {
    sp.classList.add('mk-note');
  }
  if (note) {
    const ends = seg.cover.filter(i => i.m.type === 'note' && i.end === seg.b);
    if (ends.length) { sp.classList.add('mk-chip'); sp.dataset.noteId = ends[ends.length - 1].m.id; }
    sp.classList.add('mk-hasnote');
  }
  if (bold) sp.style.fontWeight = '700';
  return sp;
}
