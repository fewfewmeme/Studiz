// Text anchors: character offsets in the flattened document text + quote/prefix/suffix fallback
// (the idea of the W3C TextQuoteSelector). Marks survive re-pagination, re-render and mode switches.

const SKIP_SEL = 'style,script,template,[data-skip],.anc-layer';

// Flattened text of a root. Text inside <style>, <script> and [data-skip] elements is ignored.
export function buildIndex(root) {
  const nodes = [];
  let pos = 0;
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: n => (n.parentElement && n.parentElement.closest(SKIP_SEL) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  const parts = [];
  while (w.nextNode()) {
    const n = w.currentNode;
    nodes.push({ node: n, start: pos, end: pos + n.data.length });
    parts.push(n.data);
    pos += n.data.length;
  }
  const map = new Map(nodes.map(e => [e.node, e]));
  return { root, nodes, text: parts.join(''), map };
}

// Offset of (node, offset) inside the flattened text
export function pointToOffset(index, node, offset) {
  if (node.nodeType === 3) {
    const e = index.map.get(node);
    return e ? e.start + Math.min(offset, node.data.length) : null;
  }
  // element boundary: the offset of the first text node at/after the child `offset`
  const child = node.childNodes[offset] || null;
  let n = child;
  while (n) {
    const first = firstText(n);
    if (first && index.map.has(first)) return index.map.get(first).start;
    n = n.nextSibling;
  }
  // after the last child: end of the last text before this point
  let last = lastText(node);
  if (last && index.map.has(last)) return index.map.get(last).end;
  const prev = prevText(index, node);
  return prev ? prev.end : 0;
}
function firstText(n) {
  if (n.nodeType === 3) return n;
  const w = document.createTreeWalker(n, NodeFilter.SHOW_TEXT);
  return w.nextNode();
}
function lastText(n) {
  if (n.nodeType === 3) return n;
  const w = document.createTreeWalker(n, NodeFilter.SHOW_TEXT);
  let l = null;
  while (w.nextNode()) l = w.currentNode;
  return l;
}
function prevText(index, node) {
  let best = null;
  for (const e of index.nodes) {
    if (node.compareDocumentPosition(e.node) & Node.DOCUMENT_POSITION_PRECEDING) best = e; else break;
  }
  return best;
}

// Offset → DOM point (binary search)
export function offsetToPoint(index, off, preferEnd = false) {
  const a = index.nodes;
  if (!a.length) return null;
  let lo = 0, hi = a.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (a[mid].end < off || (preferEnd ? a[mid].end < off : a[mid].end <= off)) lo = mid + 1; else hi = mid;
  }
  const e = a[lo];
  return { node: e.node, offset: Math.max(0, Math.min(e.node.data.length, off - e.start)) };
}

export function rangeToAnchor(index, range) {
  const s = pointToOffset(index, range.startContainer, range.startOffset);
  const e = pointToOffset(index, range.endContainer, range.endOffset);
  if (s == null || e == null || e <= s) return null;
  return makeAnchor(index.text, s, e);
}
export function makeAnchor(text, start, end) {
  return { start, end, quote: text.slice(start, end), prefix: text.slice(Math.max(0, start - 24), start), suffix: text.slice(end, end + 24) };
}

// Find [start, end) for an anchor: exact offsets first, then quote search scored by prefix/suffix.
export function resolveAnchor(index, a) {
  const text = index.text;
  if (!a) return null;
  if (text.slice(a.start, a.end) === a.quote) return { start: a.start, end: a.end };
  const q = a.quote;
  if (!q) return null;
  let best = null, bestScore = -1;
  let i = text.indexOf(q);
  while (i !== -1) {
    let score = 0;
    const pre = text.slice(Math.max(0, i - a.prefix.length), i), suf = text.slice(i + q.length, i + q.length + a.suffix.length);
    for (let k = 1; k <= Math.min(pre.length, a.prefix.length); k++) { if (pre[pre.length - k] === a.prefix[a.prefix.length - k]) score++; else break; }
    for (let k = 0; k < Math.min(suf.length, a.suffix.length); k++) { if (suf[k] === a.suffix[k]) score++; else break; }
    score -= Math.abs(i - a.start) / 1e6;
    if (score > bestScore) { bestScore = score; best = i; }
    i = text.indexOf(q, i + 1);
  }
  return best == null ? null : { start: best, end: best + q.length };
}

export function rangeFromOffsets(index, start, end) {
  const a = offsetToPoint(index, start, false), b = offsetToPoint(index, end, true);
  if (!a || !b) return null;
  const r = document.createRange();
  r.setStart(a.node, a.offset);
  r.setEnd(b.node, b.offset);
  return r;
}
