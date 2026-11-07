// ===== segments (blocks), parts, anchors-of-position =====
var INDEX = null;
function index() { return INDEX || (INDEX = buildIndex(D.body)); }
function dropIndex() { INDEX = null; }
var HEAD_RE = /^h[1-6]$/i;
var PART_RE = /^(КОНТРОЛЬНАЯ ТОЧКА|КТ\s*\d|ТЕМА|ЧАСТЬ|ЗАНЯТИЕ|РАЗДЕЛ)\b/i;
function isHeading(e) { return HEAD_RE.test(e.tagName) || (e.hasAttribute && e.hasAttribute('data-h')); }
function headLevel(e) { return HEAD_RE.test(e.tagName) ? +e.tagName[1] : +(e.getAttribute('data-h') || 3); }
function headText(e) { return (e.innerText != null && e.offsetParent !== null ? e.innerText : e.textContent).replace(/\s+/g, ' ').trim(); }
function isPartHeading(e) { return e.matches && (e.matches('h2.part,.part-title,.part') && isHeading(e) || isHeading(e) && PART_RE.test((e.textContent || '').trim())); }
// ---- the study-time model: LEARNING speed (~70 words/min for dense medical text), not reading speed ----
var PACE = CFG.pace || 1;
var EDITS = CFG.edits || { splits: [], merges: [] };
var KEY_SEL = 'b,strong,mark,.t,.tm,.hl,.key,.term,[data-t=key],[data-term]', LAT_SEL = '.lat,[data-t=latin]', FORM_SEL = 'math,.katex,.MathJax,mjx-container', DIA_SEL = 'svg,canvas';
function cnt(e, sel) { return e.querySelectorAll(sel).length + (e.matches && e.matches(sel) ? 1 : 0); }
function pageMin(e) { var v = parseFloat(e.getAttribute && e.getAttribute('data-pm')); return v > 0 ? v : (e.matches && e.matches('img.pdf-page') ? 3.6 : 0); }
function minutesOf(leaves) {
  var w = 0, key = 0, lat = 0, img = 0, rows = 0, fm = 0, dia = 0, pm = 0, pages = [];
  leaves.forEach(function (e) {
    var im = e.matches && e.matches('img.pdf-page') ? e : (e.querySelector ? e.querySelector('img.pdf-page') : null);
    if (im && pageMin(im)) { pm += pageMin(im); pages.push(+im.getAttribute('data-page') || pages.length + 1); return; }
    w += words(e); key += cnt(e, KEY_SEL); lat += cnt(e, LAT_SEL); img += cnt(e, 'img,picture') - (e.querySelector ? e.querySelectorAll('picture img').length : 0);
    rows += cnt(e, 'tr'); fm += cnt(e, FORM_SEL); dia += cnt(e, DIA_SEL);
  });
  var min = (w / 70 + key * 0.15 + Math.max(0, lat) * 0.05 + img * 0.75 + rows * 0.25 + fm * 0.6 + dia * 1.0 + pm) * PACE;
  return { words: w, media: { img: img, tbl: rows }, min: min, pages: pages };
}
// flat list of leaf blocks in reading order (wrappers that contain headings are looked through)
function flatten(root, out) {
  for (var c = root.firstElementChild; c; c = c.nextElementSibling) {
    if (c.classList.contains('lz-chrome') || /^(SCRIPT|STYLE|LINK|META|TEMPLATE|NOSCRIPT|BR)$/.test(c.tagName) || isOwn(c)) continue;
    if (!isHeading(c) && /^(DIV|SECTION|ARTICLE|MAIN|HEADER)$/.test(c.tagName) && !c.classList.contains('blk') && c.querySelector('h1,h2,h3,h4,[data-h]')) {
      // a wrapper that has headings among its children: look inside
      var hasDirectHead = false; for (var k = c.firstElementChild; k; k = k.nextElementSibling) if (isHeading(k)) { hasDirectHead = true; break; }
      if (hasDirectHead || c.children.length > 1 || c.querySelector('h2,h3,[data-h]')) { flatten(c, out); continue; }
    }
    out.push(c);
  }
  return out;
}
function seg(title, leaves, partTitle) {
  var m = minutesOf(leaves);
  return { id: '', title: String(title || '').replace(/\s+/g, ' ').trim().slice(0, 80), leaves: leaves, words: m.words, media: m.media, min: m.min, pages: m.pages.length ? m.pages : null, part: partTitle || '', single: leaves.filter(function (l) { return !isHeading(l); }).length === 1 && m.min > 7 };
}
// text offset where an element starts (stable across reloads: used for ids and for the user's split / merge points)
function offsetAt(el) {
  var idx = index(), nodes = idx.nodes; if (!nodes.length) return 0;
  var lo = 0, hi = nodes.length;
  while (lo < hi) { var mid = (lo + hi) >> 1; if (el.compareDocumentPosition(nodes[mid].node) & 4) hi = mid; else lo = mid + 1; }
  return lo < nodes.length ? nodes[lo].start : idx.text.length;
}
function ownMinutes(sec) {
  var a = parseFloat(sec.getAttribute('data-min') || sec.getAttribute('data-time')); if (a > 0) return a;
  var h = sec.querySelector('.time,.t-min,.est,[data-time]') || sec.querySelector('h1,h2,h3,h4,[data-h]');
  var m = h && /(?:выучить|время|учить)[^\d]{0,12}(\d{1,2})\s*мин/i.exec(h.textContent || ''); return m ? +m[1] : 0;
}
var SEGS = null;
function segments() {
  if (SEGS) return SEGS;
  var blks = [].slice.call(D.querySelectorAll('section.blk')).filter(function (s) { return !s.parentElement.closest('section.blk') && !s.classList.contains('lz-chrome'); });
  var out = [];
  if (blks.length) {
    blks.forEach(function (s, i) {
      var h = s.querySelector('h1,h2,h3,h4'), t = s.getAttribute('data-lab') || (h ? headText(h) : 'Раздел ' + (i + 1)), sg = seg(t, [s], s.getAttribute('data-part') || s.getAttribute('data-sec') || ''), own = ownMinutes(s);
      if (own) { sg.min = own * PACE; sg.own = true; }
      out.push(sg);
    });
  } else out = autoSegments();
  out = applyEdits(out);
  var seen = {};
  out.forEach(function (s, i) { var id = hash(s.title + '|' + offsetAt(s.leaves[0])); while (seen[id]) id += 'x'; seen[id] = 1; s.id = id; s.idx = i; });
  SEGS = out; return out;
}
// page-picture documents (PDF slides / scans): consecutive pages up to ~5 min, never > 7 min, never > 3 pages; a heavier page stands alone
function pageSegments(leaves) {
  var imgs = leaves.filter(function (e) { return e.matches && (e.matches('img.pdf-page') || e.querySelector('img.pdf-page')); });
  var out = [], acc = [], accMin = 0, flush = function () { if (!acc.length) return; var first = acc[0].matches('img.pdf-page') ? acc[0] : acc[0].querySelector('img.pdf-page'), pages = acc.map(function (e) { var im = e.matches('img.pdf-page') ? e : e.querySelector('img.pdf-page'); return +im.getAttribute('data-page') || 0; }), pt = first.getAttribute('data-pt');
    var t = pt && pt.length > 2 ? pt : (pages.length > 1 ? 'Страницы ' + pages[0] + '–' + pages[pages.length - 1] : 'Страница ' + pages[0]);
    var sg = seg(t, acc, ''); sg.pages = pages; out.push(sg); acc = []; accMin = 0; };
  imgs.forEach(function (e) {
    var pm = minutesOf([e]).min;
    if (pm > 7) { flush(); acc = [e]; flush(); return; }
    if (acc.length && (accMin + pm > 7 || acc.length >= 3 || accMin >= 4.5)) flush();
    acc.push(e); accMin += pm;
  });
  flush(); return out;
}
function autoSegments() {
  var root = findWrapper() || D.body, leaves = flatten(root, []);
  if (!leaves.length) return [];
  var pg = leaves.filter(function (e) { return e.matches && e.matches('img.pdf-page') && pageMin(e); }).length; if (pg >= leaves.length * 0.7) return pageSegments(leaves);
  // a block starts at an h2 / h3 (or a part heading, or a ticket); without them: h1 / h4
  var is23 = function (e) { return isHeading(e) && (headLevel(e) === 2 || headLevel(e) === 3 || isPartHeading(e)); };
  var nb = leaves.filter(is23).length, firstHead = leaves.filter(isHeading)[0];
  var isBound = nb >= 2 ? function (e) { return is23(e) || (isHeading(e) && headLevel(e) === 1 && e !== firstHead) || (e.matches && e.matches('.ticket,[data-ticket]')); }
    : function (e) { return isHeading(e) && e !== firstHead && headLevel(e) <= 4; };
  var secs = [], cur = null, parent = -1;
  leaves.forEach(function (e) {
    if (isBound(e)) { if (!isHeading(e) || headLevel(e) !== 3 || parent < 0) parent = secs.length; cur = { leaves: [e], parent: parent, part: '' }; secs.push(cur); }
    else if (cur) cur.leaves.push(e);
  });
  if (!secs.length) { secs = [{ leaves: leaves, parent: 0, part: '' }]; }
  var partNow = '';
  secs.forEach(function (s) { var h0 = s.leaves[0]; if (isHeading(h0) && isPartHeading(h0)) partNow = headText(h0); s.part = partNow; s.m = minutesOf(s.leaves); });
  var onlyHead = function (s) { return s.leaves.every(isHeading); };
  var mergeInto = function (a, b) { a.leaves = a.leaves.concat(b.leaves); a.m = minutesOf(a.leaves); a.merged = true; };
  // merge short sections (< 2 min) with the next one of the same parent heading, else the previous one, else a neighbour
  for (var i = 0; i < secs.length;) {
    var s = secs[i], nx = secs[i + 1], pv = secs[i - 1];
    if (s.m.min >= 2 && !onlyHead(s)) { i++; continue; }
    if (nx && nx.parent === s.parent && (s.m.min + nx.m.min <= 7.5 || onlyHead(s))) { mergeInto(s, nx); secs.splice(i + 1, 1); continue; }
    if (pv && pv.parent === s.parent && pv.m.min + s.m.min <= 7.5) { mergeInto(pv, s); secs.splice(i, 1); i--; continue; }
    if (nx && (s.m.min + nx.m.min <= 7.5 || onlyHead(s))) { mergeInto(s, nx); secs.splice(i + 1, 1); continue; }
    if (pv && pv.m.min + s.m.min <= 7.5) { mergeInto(pv, s); secs.splice(i, 1); i--; continue; }
    i++;
  }
  // cut sections longer than 7 min at element boundaries into ~5 min pieces; one element over 7 min stays whole
  var res = [];
  secs.forEach(function (s) {
    var head = s.leaves.filter(isHeading)[0];
    var baseTitle = function (lv) { var lead = []; for (var q = 0; q < lv.length && isHeading(lv[q]); q++) lead.push(lv[q]); var h = lead.length ? lead[lead.length - 1] : lv.filter(isHeading)[0]; return h ? headText(h) : ''; };
    var title0 = baseTitle(s.leaves) || (head ? headText(head) : '') || 'Раздел ' + (res.length + 1);
    if (s.m.min <= 7) { res.push(seg(title0, s.leaves, s.part)); return; }
    var n = Math.max(2, Math.round(s.m.min / 5)), tgt = s.m.min / n, pieces = [], acc = [], accMin = 0;
    var flush = function () { if (acc.length) { pieces.push(acc); acc = []; accMin = 0; } };
    s.leaves.forEach(function (e) {
      var m = minutesOf([e]).min;
      if (m > 7) { if (acc.length && !acc.every(isHeading)) flush(); acc.push(e); flush(); return; }     // a heavy element keeps its heading and stands alone
      if (acc.length && accMin + m > tgt * 1.15 && accMin >= 3) flush();
      acc.push(e); accMin += m;
    });
    flush();
    for (var j = 0; j < pieces.length - 1; j++) { while (pieces[j].length > 1 && isHeading(pieces[j][pieces[j].length - 1])) pieces[j + 1].unshift(pieces[j].pop()); }
    for (var k = pieces.length - 1; k > 0; k--) { if (minutesOf(pieces[k]).min < 2 && minutesOf(pieces[k - 1].concat(pieces[k])).min <= 7.5) { pieces[k - 1] = pieces[k - 1].concat(pieces[k]); pieces.splice(k, 1); } }
    pieces.forEach(function (pc, pi) { var t = baseTitle(pc); if (!t || pi === 0) t = t || title0; if (!t || (pi > 0 && !pc.some(isHeading))) t = title0 + ' (продолжение)'; res.push(seg(t, pc, s.part)); });
  });
  return res;
}
// the user's own «Разделить» / «Объединить со следующим» (kept by text offsets, so they survive re-rendering and reloads)
function applyEdits(list) {
  var e = EDITS || {}, i, j;
  (e.splits || []).forEach(function (off) {
    for (i = 0; i < list.length; i++) for (j = 1; j < list[i].leaves.length; j++) if (offsetAt(list[i].leaves[j]) === off) {
      var s = list[i], a = s.leaves.slice(0, j), b = s.leaves.slice(j), hb = b.filter(isHeading)[0];
      var s2 = seg(hb ? headText(hb) : s.title + ' (продолжение)', b, s.part), s1 = seg(s.title, a, s.part); if (s.pages) { s1.pages = null; s2.pages = null; }
      list.splice(i, 1, s1, s2); return;
    }
  });
  (e.merges || []).forEach(function (off) {
    for (i = 1; i < list.length; i++) if (offsetAt(list[i].leaves[0]) === off) { var a = list[i - 1], b = list[i], m = seg(a.title, a.leaves.concat(b.leaves), a.part); if (a.pages && b.pages) m.pages = a.pages.concat(b.pages); list.splice(i - 1, 2, m); return; }
  });
  return list;
}
// parts for Book: a new part starts a new spread
function findParts() {
  var res = [], prev = null;
  var blks = D.querySelectorAll('section.blk');
  blks.forEach(function (s) { var p = s.getAttribute('data-part') || s.getAttribute('data-sec'); if (p && p !== prev) { res.push({ el: s, title: p }); } if (p) prev = p; });
  D.querySelectorAll('h1,h2,h3,h4,[data-h]').forEach(function (h) {
    if (h.closest('.lz-chrome,.lz-own')) return;
    if (isPartHeading(h) || headLevel(h) === 1) {
      var dup = res.some(function (r) { return r.el === h || r.el.contains(h) && r.el.querySelector('h1,h2,h3,h4') === h; });
      if (!dup) res.push({ el: h, title: headText(h) });
    }
  });
  res.sort(function (a, b) { return a.el === b.el ? 0 : (a.el.compareDocumentPosition(b.el) & 4) ? -1 : 1; });
  return res;
}
// where the reader is: the text offset at the top of the view + the segment
function segOfNode(n) {
  var s = segments(); if (!s.length) return null;
  var e = n.nodeType === 1 ? n : n.parentElement;
  for (var i = 0; i < s.length; i++) for (var j = 0; j < s[i].leaves.length; j++) if (s[i].leaves[j].contains(e)) return s[i];
  // heading/preamble before a segment: the nearest following one
  for (var k = 0; k < s.length; k++) if (s[k].leaves[0].compareDocumentPosition(e) & 2) return s[k];
  return s[s.length - 1];
}
function currentAnchor() {
  if (VIEW === 'book' && typeof BK !== 'undefined' && BK && BK.ready) return BK.anchorNow();
  try {
    var idx = index(), nodes = idx.nodes; if (!nodes.length) return null;
    var vh = innerHeight / K.z * K.r; var lo = 0, hi = nodes.length - 1, ans = -1;
    // first text node whose box ends below the top edge (nodes are in document order, boxes grow downward in the scroll flow)
    var probe = function (i) { var r = D.createRange(); r.selectNodeContents(nodes[i].node); var b = r.getBoundingClientRect(); return b.height === 0 && b.width === 0 ? null : b; };
    while (lo <= hi) { var mid = (lo + hi) >> 1, b = probe(mid); var k = mid; while (!b && k < hi) { k++; b = probe(k); } if (!b) { hi = mid - 1; continue; } if (b.bottom > 4 * K.r) { ans = k; hi = mid - 1; } else lo = k + 1; }
    if (ans < 0) ans = nodes.length - 1;
    var e = nodes[ans]; var off = e.start;
    var s = segOfNode(e.node);
    return { off: off, quote: idx.text.slice(off, off + 48), blk: s ? s.id : null };
  } catch (err) { return null; }
}
function gotoAnchor(a) {
  if (!a) return false;
  var idx = index(), r = null;
  if (a.quote) { var res = resolveAnchor(idx, { start: a.off || 0, end: (a.off || 0) + a.quote.length, quote: a.quote, prefix: '', suffix: '' }); if (res) r = rangeFromOffsets(idx, res.start, res.start + 1); }
  if (!r && a.blk) { var s = segments().filter(function (x) { return x.id === a.blk; })[0]; if (s) { (typeof BL !== 'undefined' && BL.els[s.id] ? BL.els[s.id].head : s.leaves[0]).scrollIntoView({ block: 'start' }); return true; } }
  if (!r) return false;
  var t = r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentElement;
  if (VIEW === 'book') return !!(BOOK && BOOK.gotoNode(r.startContainer, r.startOffset));
  t.scrollIntoView({ block: 'start' });
  return true;
}
