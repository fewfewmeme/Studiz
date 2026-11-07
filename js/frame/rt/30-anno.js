// ===== annotations: text marks, selection, pen (strokes anchored to the nearest character) =====
var MARKS = [], PALETTE = CFG.palette || ['#ffe58a', '#ffc9d9', '#cdeccf', '#cfe6fb', '#e6d6fb', '#f3d2b8'];
var UNANCH = [];
var ANNO_ON = VIEW !== 'orig';
function markCss() {
  css('lz-mark-css', '.lzm{mix-blend-mode:multiply;border-radius:2px;-webkit-box-decoration-break:clone;box-decoration-break:clone}' +
    '.lzm-ul{background:none!important}.lzm-strike{text-decoration:line-through;text-decoration-color:#5d6a80;text-decoration-thickness:2px}' +
    '.lzm-note{box-shadow:inset 0 -2px 0 #e0a800;cursor:pointer}.lzm-note::after{content:"✎";font-size:.7em;vertical-align:super;color:#b07f00;margin-left:1px}' +
    '.lzm-photo::after{content:"▣";font-size:.7em;vertical-align:super;color:#2f6f8f}' +
    '.lzm-flash{outline:2px solid #3b5ba9;outline-offset:1px}');
}
function unwrapMarks() {
  var spans = D.querySelectorAll('span.lzm'), parents = [];
  for (var i = 0; i < spans.length; i++) { var s = spans[i], p = s.parentNode; if (!p) continue; while (s.firstChild) p.insertBefore(s.firstChild, s); p.removeChild(s); if (parents.indexOf(p) < 0) parents.push(p); }
  parents.forEach(function (p) { try { p.normalize(); } catch (e) { /* ignore */ } });
}
// all marks at once: every text node is cut at every mark boundary inside it, and each piece is wrapped by the marks covering it
function markSpan(m, nodeText) {
  var cls = 'lzm lzm-' + m.type, style = '';
  if (m.type === 'hl') { var mm = /^m(\d)$/.exec(m.color || ''); var ci = (mm ? +mm[1] : 1) - 1; style = 'background:' + (PALETTE[ci] || (/^#|rgb/.test(m.color || '') ? m.color : PALETTE[0])); }
  if (m.type === 'ul') style = 'text-decoration:underline;text-decoration-style:' + (m.ulStyle || 'solid') + ';text-decoration-color:' + (m.color || '#d6246e') + ';text-underline-offset:3px;text-decoration-thickness:2px';
  if (m.type === 'bold') style = 'font-weight:700';
  if (m.type === 'hl' && m.note) cls += ' lzm-note';
  if (m.photo) cls += ' lzm-photo';
  var sp = D.createElement('span'); sp.className = cls; sp.setAttribute('data-m', m.id); if (style) sp.style.cssText = style; void nodeText; return sp;
}
function paintMarks() {
  markCss(); unwrapMarks(); dropIndex();
  var idx = index(); UNANCH = [];
  var nodes = idx.nodes, per = new Map(), ok = 0;
  MARKS.forEach(function (m) {
    if (!m.anchor || ['hl', 'ul', 'strike', 'note', 'bold'].indexOf(m.type) < 0) return;
    var r = resolveAnchor(idx, m.anchor);
    if (!r || r.end <= r.start) { UNANCH.push({ id: m.id, type: m.type, anchor: { quote: m.anchor.quote } }); return; }
    // first node whose end is after r.start
    var lo = 0, hi = nodes.length - 1; while (lo < hi) { var mid = (lo + hi) >> 1; if (nodes[mid].end <= r.start) lo = mid + 1; else hi = mid; }
    var any = false;
    for (var i = lo; i < nodes.length && nodes[i].start < r.end; i++) {
      var n = nodes[i], f = Math.max(r.start, n.start) - n.start, t = Math.min(r.end, n.end) - n.start; if (t <= f) continue;
      var arr = per.get(n.node); if (!arr) { arr = []; per.set(n.node, arr); } arr.push({ m: m, f: f, t: t }); any = true;
    }
    if (any) ok++; else UNANCH.push({ id: m.id, type: m.type, anchor: { quote: m.anchor.quote } });
  });
  per.forEach(function (list, node) {
    var cuts = [0, node.data.length]; list.forEach(function (x) { cuts.push(x.f, x.t); });
    cuts = cuts.filter(function (v, i, a) { return v >= 0 && v <= node.data.length && a.indexOf(v) === i; }).sort(function (a, b) { return a - b; });
    // split from the end so earlier offsets stay valid
    var pieces = [];
    var cur = node;
    for (var k = cuts.length - 2; k >= 0; k--) { var from = cuts[k], to = cuts[k + 1]; var piece = from > 0 ? cur.splitText(from) : cur; if (from > 0) { /* piece is the tail starting at from */ } pieces.unshift({ node: piece, from: from, to: to }); }
    pieces.forEach(function (pc) {
      var cover = list.filter(function (x) { return x.f <= pc.from && x.t >= pc.to; }).map(function (x) { return x.m; });
      if (!cover.length) return;
      cover.sort(function (a, b) { return (a.created || 0) - (b.created || 0); });
      var inner = pc.node; cover.forEach(function (m) { var sp = markSpan(m); inner.parentNode.insertBefore(sp, inner); sp.appendChild(inner); inner = sp; });
    });
  });
  void ok;
  dropIndex(); post('unanchored', { list: UNANCH });
  if (typeof reflowAfterMarks === 'function') reflowAfterMarks();
  drawStrokes();
}
var paintSoon = (function () { var q = 0; return function () { if (q) return; q = raf(function () { q = 0; paintMarks(); }); }; })();

// ---- selection ----
var lastSelKey = '';
function selectionInfo() {
  var s = getSelection(); if (!s || s.rangeCount === 0 || s.isCollapsed) return null;
  var r = s.getRangeAt(0); if (!D.body.contains(r.commonAncestorContainer)) return null;
  var ce = r.commonAncestorContainer.nodeType === 1 ? r.commonAncestorContainer : r.commonAncestorContainer.parentElement;
  if (ce && ce.closest('.lz-own')) return null;
  var idx = index(), a = rangeToAnchor(idx, r); if (!a) return null;
  var sg = segOfNode(r.startContainer); if (sg) a.blk = sg.id;
  var rc = r.getBoundingClientRect(), d = toDev(rc);
  return { text: s.toString(), anchor: a, rect: { left: d.left, top: d.top, right: d.right, bottom: d.bottom } };
}
function reportSelection() {
  var i = null; try { i = selectionInfo(); } catch (e) { i = null; }
  var k = i ? i.anchor.start + ':' + i.anchor.end : '';
  post('selection', i ? { has: true, text: i.text, anchor: i.anchor, rect: i.rect } : { has: false });
  lastSelKey = k;
}
var reportSelectionSoon = debounce(reportSelection, 70);
function watchSelection() {
  D.addEventListener('selectionchange', reportSelectionSoon);
  addEventListener('pointerdown', function () { post('pointer', { down: true }); }, { capture: true, passive: true });
  ['pointerup', 'pointercancel'].forEach(function (ev) { addEventListener(ev, function () { post('pointer', { down: false }); }, { capture: true, passive: true }); });
}
H.clearSel = function () { var s = getSelection(); if (s) s.removeAllRanges(); post('selection', { has: false }); };
H.marks = function (m) {
  MARKS = m.list || []; PALETTE = m.palette || PALETTE;
  var strokes = MARKS.filter(function (x) { return x.type === 'pen'; }); STROKES = strokes; strokeCache = {};
  if (m.textChanged !== false) paintSoon(); else drawStrokes();
};
// tap on a mark (text): report the stack of marks under the finger; the eraser removes
function watchMarkTaps() {
  D.addEventListener('click', function (e) {
    var t = e.target && e.target.closest ? e.target.closest('.lzm') : null; if (!t) return;
    var s = getSelection(); if (s && !s.isCollapsed) return;
    var ids = [], n = t; while (n && n.closest) { var m = n.closest('.lzm'); if (!m) break; ids.push(m.getAttribute('data-m')); n = m.parentElement; }
    if (S.tool === 'eraser') { ids.forEach(function (id) { post('mark', { op: 'remove', id: id }); }); return; }
    if (S.tool !== 'none' && S.tool !== 'marker' && S.tool !== 'underline') return;
    var d = toDev(t.getBoundingClientRect()); post('markTap', { ids: ids, rect: { left: d.left, top: d.top, right: d.right, bottom: d.bottom, width: d.width, height: d.height } });
  }, true);
}
// «Текст» tool: a tap on a word attaches a note to it
function watchNoteTap() {
  D.addEventListener('click', function (e) {
    if (S.tool !== 'text') return;
    var rg = D.caretRangeFromPoint ? D.caretRangeFromPoint(e.clientX, e.clientY) : null; if (!rg || rg.startContainer.nodeType !== 3 || isOwn(rg.startContainer)) return;
    var t = rg.startContainer, o = rg.startOffset, d = t.data, s0 = o, e2 = o;
    while (s0 > 0 && /\S/.test(d[s0 - 1])) s0--; while (e2 < d.length && /\S/.test(d[e2])) e2++; if (e2 <= s0) return;
    var r = D.createRange(); r.setStart(t, s0); r.setEnd(t, e2);
    var a = rangeToAnchor(index(), r); if (!a) return; var sg = segOfNode(t); if (sg) a.blk = sg.id;
    e.preventDefault(); e.stopPropagation(); post('noteAt', { anchor: a, text: d.slice(s0, e2) });
  }, true);
}
H.flashMark = function (m) { var e = D.querySelector('.lzm[data-m="' + m.id + '"]'); if (!e) return; e.scrollIntoView({ block: 'center' }); e.classList.add('lzm-flash'); setTimeout(function () { e.classList.remove('lzm-flash'); }, 1400); };

// ---- pen ----
var STROKES = CFG.marks ? CFG.marks.filter(function (x) { return x.type === 'pen'; }) : [], strokeCache = {}, PEN = null, CTX = null, LIVE = null;
function penCanvas() {
  if (PEN) return PEN;
  PEN = ownEl('canvas', 'lz-pen'); PEN.style.cssText = 'position:fixed;left:0;top:0;pointer-events:none;z-index:2147483000;touch-action:pan-x pan-y pinch-zoom';
  D.body.appendChild(PEN); sizePen();
  PEN.addEventListener('pointerdown', penDown); PEN.addEventListener('pointermove', penMove); PEN.addEventListener('pointerup', penUp); PEN.addEventListener('pointercancel', penUp);
  return PEN;
}
function sizePen() {
  if (!PEN) return;
  var dpr = Math.min(2, devicePixelRatio || 1);
  PEN.style.width = (innerWidth / K.z) + 'px'; PEN.style.height = (innerHeight / K.z) + 'px';
  PEN.width = Math.round(innerWidth * dpr); PEN.height = Math.round(innerHeight * dpr); CTX = PEN.getContext('2d'); var f = K.z / K.r; CTX.setTransform(dpr * f, 0, 0, dpr * f, 0, 0);
}
function fontPx(node) { var e = node.nodeType === 1 ? node : node.parentElement; return (parseFloat(getComputedStyle(e).fontSize) || 16) * K.r; }
// character box for a stroke anchor (cached until the layout changes)
function charBox(a) {
  var c = strokeCache[a.id + ':' + a.o]; if (c) return c;
  var idx = index(); var res = resolveAnchor(idx, { start: a.o, end: a.o + a.q.length, quote: a.q, prefix: '', suffix: '' });
  if (!res) return null;
  var p = offsetToPoint(idx, res.start, false); if (!p || p.node.data.length === 0) return null;
  var r = D.createRange(); r.setStart(p.node, Math.min(p.offset, p.node.data.length - 1)); r.setEnd(p.node, Math.min(p.offset + 1, p.node.data.length));
  strokeCache[a.id + ':' + a.o] = { range: r, fs: fontPx(p.node) }; return strokeCache[a.id + ':' + a.o];
}
function strokePoints(st) {
  var cb = charBox({ id: st.id, o: st.anc.o, q: st.anc.q }); if (!cb) return null;
  var b = cb.range.getBoundingClientRect(); if (!b.width && !b.height) return null;
  var out = [];
  for (var i = 0; i < st.pts.length; i++) { var q = st.pts[i]; out.push([b.left + q[0] * cb.fs, b.top + q[1] * cb.fs, q[2]]); }
  return out;
}
function drawStroke(pts, color, w, alpha) {
  if (!pts || pts.length < 1) return;
  CTX.strokeStyle = color; CTX.lineCap = 'round'; CTX.lineJoin = 'round'; CTX.globalAlpha = alpha || 1;
  if (pts.length === 1) { CTX.fillStyle = color; CTX.beginPath(); CTX.arc(pts[0][0], pts[0][1], w * (0.5 + (pts[0][2] || 0.5)) / 2, 0, 7); CTX.fill(); CTX.globalAlpha = 1; return; }
  for (var i = 1; i < pts.length; i++) { var a = pts[i - 1], b = pts[i]; CTX.lineWidth = w * (0.45 + (b[2] == null ? 0.5 : b[2]) * 0.9); CTX.beginPath(); CTX.moveTo(a[0], a[1]); var mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2; CTX.quadraticCurveTo(a[0], a[1], mx, my); CTX.lineTo(b[0], b[1]); CTX.stroke(); }
  CTX.globalAlpha = 1;
}
var drawQ = 0;
function drawStrokes() { if (drawQ) return; drawQ = raf(function () { drawQ = 0; drawStrokesNow(); }); }
function drawStrokesNow() {
  if (!STROKES.length && !LIVE) { if (PEN) { CTX.save(); CTX.setTransform(1, 0, 0, 1, 0, 0); CTX.clearRect(0, 0, PEN.width, PEN.height); CTX.restore(); } return; }
  penCanvas(); CTX.save(); CTX.setTransform(1, 0, 0, 1, 0, 0); CTX.clearRect(0, 0, PEN.width, PEN.height); CTX.restore();
  var f = K.z / K.r;
  for (var i = 0; i < STROKES.length; i++) {
    var st = STROKES[i], pts = strokePoints(st); if (!pts) continue;
    var minY = 1e9, maxY = -1e9; for (var j = 0; j < pts.length; j++) { minY = Math.min(minY, pts[j][1]); maxY = Math.max(maxY, pts[j][1]); }
    if (maxY < -20 || minY > innerHeight + 20) continue;
    drawStroke(pts, st.color || '#2f4a8f', (st.w || 3) / f, st.alpha);
  }
  if (LIVE) drawStroke(LIVE.pts, LIVE.color, LIVE.w / f);
}
function wantsPen(e) { return S.tool === 'pen' || S.tool === 'eraser' ? (e.pointerType === 'pen' || e.pointerType === 'mouse' || (e.pointerType === 'touch' && S.finger)) : false; }
function setPenMode() {
  var on = S.tool === 'pen' || S.tool === 'eraser';
  if (on) penCanvas();
  if (PEN) { PEN.style.pointerEvents = on ? 'auto' : 'none'; PEN.style.touchAction = S.finger ? 'none' : 'pan-x pan-y pinch-zoom'; }
  D.documentElement.classList.toggle('lz-drawing', on);
}
function ptFrom(e) { return [e.clientX, e.clientY, e.pressure && e.pressure > 0 ? e.pressure : (e.pointerType === 'pen' ? 0.5 : 0.5)]; }
var ERA = null;
function penDown(e) {
  if (!wantsPen(e)) return;
  e.preventDefault(); try { PEN.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ }
  if (S.tool === 'eraser') { ERA = { removed: {} }; eraseAt(e.clientX, e.clientY); return; }
  LIVE = { pts: [ptFrom(e)], color: S.pen.color, w: S.pen.w, id: e.pointerId };
  drawStrokes();
}
function penMove(e) {
  if (ERA) { e.preventDefault(); eraseAt(e.clientX, e.clientY); return; }
  if (!LIVE || e.pointerId !== LIVE.id) return;
  e.preventDefault();
  var evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e]; evs.forEach(function (x) { LIVE.pts.push(ptFrom(x)); });
  drawStrokes();
}
function penUp(e) {
  if (ERA) { ERA = null; return; }
  if (!LIVE || e.pointerId !== LIVE.id) return;
  var live = LIVE; LIVE = null;
  // anchor: the character under the first point (device px -> CSS px of the root for caretRangeFromPoint)
  var rg = D.caretRangeFromPoint ? D.caretRangeFromPoint(live.pts[0][0], live.pts[0][1]) : null;
  if (!rg || !rg.startContainer || rg.startContainer.nodeType !== 3) rg = nearestText(live.pts[0][0], live.pts[0][1]);
  if (!rg) { drawStrokes(); return; }
  var idx = index(), o = pointToOffset(idx, rg.startContainer, rg.startOffset); if (o == null) { drawStrokes(); return; }
  o = clamp(o, 0, idx.text.length - 2);
  var pt = offsetToPoint(idx, o, false), r = D.createRange(); r.setStart(pt.node, Math.min(pt.offset, pt.node.data.length - 1)); r.setEnd(pt.node, Math.min(pt.offset + 1, pt.node.data.length));
  var b = r.getBoundingClientRect(), fs = fontPx(pt.node);
  var pts = live.pts.map(function (q) { return [+((q[0] - b.left) / fs).toFixed(3), +((q[1] - b.top) / fs).toFixed(3), +(q[2] || 0.5).toFixed(2)]; });
  post('mark', { op: 'add', rec: { type: 'pen', anc: { o: o, q: idx.text.slice(o, o + 20) }, pts: pts, color: live.color, w: live.w, blk: (segOfNode(pt.node) || {}).id || null } });
  drawStrokes();
}
function nearestText(x, y) {
  var best = null, bd = 1e9, ss = segments();
  var lists = []; ss.forEach(function (s) { s.leaves.forEach(function (l) { lists.push(l); }); });
  lists.forEach(function (l) { var b = l.getBoundingClientRect(); var dy = y < b.top ? b.top - y : y > b.bottom ? y - b.bottom : 0; if (dy < bd) { bd = dy; best = l; } });
  if (!best) return null; var w = D.createTreeWalker(best, NodeFilter.SHOW_TEXT), n = w.nextNode(); if (!n) return null; var r = D.createRange(); r.setStart(n, 0); r.collapse(true); return r;
}
function eraseAt(x, y) {
  var rad = S.eraser / (K.z / K.r), dx = x, dy = y;
  for (var i = 0; i < STROKES.length; i++) {
    var st = STROKES[i]; if (ERA.removed[st.id]) continue; var pts = strokePoints(st); if (!pts) continue;
    for (var j = 0; j < pts.length; j++) if (Math.hypot(pts[j][0] - dx, pts[j][1] - dy) < rad) { ERA.removed[st.id] = 1; post('mark', { op: 'remove', id: st.id }); break; }
  }
}
H.tool = function (m) { S.tool = m.tool; if (m.pen) S.pen = m.pen; if (m.eraser) S.eraser = m.eraser; S.finger = !!m.finger; setPenMode(); };
