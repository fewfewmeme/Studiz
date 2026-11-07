// ===== boot =====
var BOOK = null;
// handle for tests / debugging (the page itself is sandboxed; this only exposes read access to the runtime state)
window.__lz = { get book() { return BK; }, get blocks() { return BL; }, segments: function () { return segments(); }, S: S, K: K, anchor: function () { return currentAnchor(); }, unanch: function () { return UNANCH; }, strokes: function () { return STROKES.map(function (st) { var p = strokePoints(st); return p && p[0]; }); }, charBox: function (o) { var b = charBox({ id: 'dbg', o: o, q: index().text.slice(o, o + 20) }); return b && b.range.getBoundingClientRect(); } };
var zoomSoon = debounce(function () { relayoutAll(); }, 250);
H.zoom = function (m) { if (m.z === S.zoom && !m.force) return; S.zoom = m.z; if (VIEW === 'book') zoomSoon(); else relayoutAll(); };   // Книга: one repagination per step (debounced)
H.width = function (m) { S.width = m.w; WRAP_APPLY(); relayoutAll(); };
H.font = function (m) { if (m.weight) S.weight = m.weight; if (m.family) S.family = m.family; applyWeight(); applyFamily(); relayoutAll(); };
H.fontcss = function (m) { css('lz-fontcss', m.css || ''); };
H.insets = function (m) { S.ins = m.ins || { t: 0, b: 0 }; applyInsets(); if (VIEW === 'book' && BOOK) BOOK.relayout(); };
function applyInsets() { if (VIEW === 'scroll' || VIEW === 'blocks') { R.style.paddingTop = (S.ins.t * 100 / S.zoom) + 'px'; R.style.paddingBottom = (S.ins.b * 100 / S.zoom) + 'px'; } }
H.goto = function (m) { gotoAnchor(m.anchor); };
H.scrollTo = function (m) { (D.scrollingElement || R).scrollTop = m.top || 0; };
H.query = function (m) { var v = null; if (m.q === 'anchor') v = currentAnchor(); else if (m.q === 'natural') { var w = findWrapper(); v = w ? w.getBoundingClientRect().width / K.r : R.scrollWidth; } post('answer', { q: m.q, v: v }); };
function WRAP_APPLY() { if (VIEW !== 'orig') applyWidth(); }
var relayoutT = 0;
function relayoutAll() {
  applyZoom(); applyInsets(); WRAP_APPLY();
  if (VIEW === 'book' && BOOK) { BOOK.relayout(); return; }
  if (VIEW !== 'orig') { fixTables(); }
  if (VIEW === 'scroll') cvApply();
  strokeCache = {}; sizePen(); drawStrokes();
  if (VIEW === 'blocks' && typeof layoutBlocks === 'function') layoutBlocks();
}
function lazyImages() {
  var imgs = D.querySelectorAll('img'); if (imgs.length < 60) { imgs.forEach(function (i) { i.decoding = 'async'; }); return; }
  imgs.forEach(function (i, n) { if (n > 6) i.loading = 'lazy'; i.decoding = 'async'; });
}
function boot() {
  installBase();
  if (VIEW !== 'orig') {
    hideChrome(); lazyImages();
    if (VIEW === 'book' || VIEW === 'blocks') D.querySelectorAll('details').forEach(function (d) { d.open = true; });
    D.querySelectorAll('a[href]').forEach(function (a) { a.removeAttribute('target'); });
  }
  applyZoom(); applyInsets(); WRAP_APPLY(); applyWeight(); applyFamily();
  if (VIEW === 'orig') D.addEventListener('click', origClick, true);
  watchTheme(); watchActivity(); watchScroll(); watchPinch();
  if (ANNO_ON) { watchSelection(); watchMarkTaps(); watchNoteTap(); MARKS = CFG.marks || []; STROKES = MARKS.filter(function (x) { return x.type === 'pen'; }); }
  var info = { words: words(D.body), title: (D.title || '').trim() };
  var go = function () {
    if (VIEW === 'book' && typeof setupBook === 'function') { THEME0 = themeNow(); setupBook(); }
    else if (VIEW === 'blocks' && typeof setupBlocks === 'function') setupBlocks();
    else if (VIEW === 'scroll') { fixTables(); cvApply(); }
    if (ANNO_ON) { paintMarks(); }
    if (CFG.pos) restore(CFG.pos);
    reportTheme();
    var sg = VIEW === 'orig' ? (D.querySelector('section.blk') ? segments() : []) : segments();
    post('ready', { words: info.words, title: info.title, blocks: sg.map(function (s) { return { id: s.id, title: s.title, min: Math.round(s.min * 10) / 10, words: s.words, part: s.part }; }), parts: VIEW === 'orig' ? [] : findParts().map(function (p) { return p.title; }), imgs: D.images.length });
    if (VIEW === 'scroll') { addEventListener('load', function () { fixTables(); cvApply(); if (CFG.pos) restore(CFG.pos); }, { once: true }); }
  };
  var fr = D.fonts && D.fonts.ready ? Promise.race([D.fonts.ready, new Promise(function (r) { setTimeout(r, 900); })]) : Promise.resolve();
  fr.then(function () { raf(go); });
  addEventListener('resize', debounce(function () { relayoutAll(); }, 150));
}
// «Оригинал»: the file's own «Начать» / «Выучила» buttons start and complete study blocks
var START_RE = /Начать|Старт|▶/i, DONE_RE = /Выучила|Прочитала|Готово|✓/i;
function origClick(e) {
  var t = e.target; if (!t || !t.closest) return;
  var el = t.closest('button, a, [role=button], .go, .dn, input[type=button]'); if (!el) return;
  var txt = (el.textContent || el.value || '').replace(/\s+/g, ' ').trim(); if (!txt || txt.length > 40) return;
  var kind = START_RE.test(txt) || (el.matches('.go') && !DONE_RE.test(txt)) ? 'start' : (DONE_RE.test(txt) || el.matches('.dn') ? 'done' : null); if (!kind) return;
  var sec = el.closest('section.blk'); if (!sec) return;
  var all = [].slice.call(D.querySelectorAll('section.blk')).filter(function (s) { return !s.parentElement.closest('section.blk'); });
  var i = all.indexOf(sec.parentElement.closest('section.blk') || sec); if (i < 0) return;
  post('origblock', { kind: kind, bi: i, title: sec.getAttribute('data-lab') || '' });
}
function restore(pos) {
  if (VIEW === 'orig') { if (pos.top != null) (D.scrollingElement || R).scrollTop = pos.top; return; }
  if (pos.off != null || pos.quote || pos.blk) gotoAnchor(pos);
}
if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', boot); else boot();
