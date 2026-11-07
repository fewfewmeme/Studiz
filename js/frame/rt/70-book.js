// ===== «Книга»: the file's own body becomes a CSS-columns flow (its own css applies); a turn is one composited translate =====
var BK = null;
function setupBook() { BK = BOOK = new BookView(); BK.start(); }
function BookView() {
  this.page = 0; this.pages = 1; this.layouts = 0; this.turning = false; this.parts = []; this.two = true; this.ready = false; this.turns = []; this.frames = [];
}
var NOTEPAD = function () { var m = D.querySelector('meta[name="studiem:layout"]'); return !!m && m.content === 'pages-landscape'; };
BookView.prototype.geom = function () {
  if (NOTEPAD()) {
    // «Блокнот»: two landscape pages stacked top/bottom, bound in the middle; each fits fully
    var zz = S.zoom / 100, W0 = innerWidth, H0 = innerHeight, side0 = W0 < 600 ? 10 : 20, top0 = 14 + S.ins.t, bot0 = 54 + S.ins.b, availH0 = H0 - top0 - bot0, availW0 = W0 - 2 * side0;
    var im = D.querySelector('img.pdf-page'), asp = im && im.getAttribute('width') ? im.getAttribute('width') / im.getAttribute('height') : 1.6;
    var m0 = clamp(availW0 * 0.03, 12, 26), gap0 = 14, imgH0 = (availH0 - 2 * m0 - gap0) / 2, pageW0 = Math.min(availW0, imgH0 * asp + 2 * m0);
    // the page frame stays; the pictures follow the zoom (smaller = three slides on a sheet), never wider than the sheet
    var imgH = Math.min(imgH0 * (S.zoom / 75), (pageW0 - 2 * m0) / asp, availH0 - 2 * m0);
    this.notepad = true;
    return { z: zz, two: false, pageW: pageW0, pageH: availH0, m: m0, left: side0 + (availW0 - pageW0) / 2, top: top0, spreadW: pageW0, imgH: imgH, gap: gap0 };
  }
  this.notepad = false;
  var z = S.zoom / 100, W = innerWidth, Hh = innerHeight, side = W < 600 ? 10 : 20, top = 14 + S.ins.t, bottom = 54 + S.ins.b;
  var two = W > Hh * 1.08 && W >= 720, availW = W - 2 * side, availH = Hh - top - bottom;
  var pageW = two ? availW / 2 : availW, pageH = Math.min(availH, pageW * 1.7);
  var m = clamp(pageW * 0.075, 16, 34);
  var spreadW = pageW * (two ? 2 : 1);
  return { z: z, two: two, pageW: pageW, pageH: pageH, m: m, left: side + (availW - spreadW) / 2, top: top + (availH - pageH) / 2, spreadW: spreadW };
};
BookView.prototype.start = function () {
  var self = this;
  this.cover = this.makeCover();
  D.body.insertBefore(this.cover, D.body.firstChild);
  this.paper = ownEl('div', 'lz-bk'); this.paper.innerHTML = '<div class="lz-pg l"></div><div class="lz-pg r"></div><div class="lz-gut"></div><div class="lz-rh l"></div><div class="lz-rh r"></div><div class="lz-no l"></div><div class="lz-no r"></div><div class="lz-shade"></div>' + (NOTEPAD() ? '<div class="lz-bind"></div>' : '');
  D.documentElement.appendChild(this.paper);
  this.shade = this.paper.querySelector('.lz-shade');
  // tap zones / swipe / keys
  // ONE gesture owner: pointer events with a small threshold; the page has touch-action:pan-y so the browser never claims a horizontal swipe
  // (a claimed swipe ends in pointercancel and no pointerup: that was the "swipe 5 to 100 times" bug). A cancel still finishes the gesture.
  var g0 = null, THR = 8, DIST = 40, VEL = 0.3;
  var gestureEnd = function (e, cancelled) {
    if (!g0 || e.pointerId !== g0.id) return;
    var g = g0; g0 = null;
    if (S.tool === 'pen' || S.tool === 'eraser') return;
    var x = cancelled ? g.lx : e.clientX, y = cancelled ? g.ly : e.clientY;
    var dx = x - g.x, dy = y - g.y, dt = Math.max(1, performance.now() - g.t);
    var sel = getSelection(); if (sel && !sel.isCollapsed) return;
    var horiz = Math.abs(dx) > THR && Math.abs(dx) > Math.abs(dy) * 1.2;
    if (horiz && (Math.abs(dx) > DIST || (Math.abs(dx) >= 20 && (Math.abs(dx) / dt > VEL || Math.abs(g.v) > VEL)))) { self.turn(dx < 0 ? 1 : -1); return; }
    if (cancelled) return;
    if (Math.abs(dx) < THR && Math.abs(dy) < THR && dt < 400) {
      if (e.target.closest && e.target.closest('a,button,.lzm,.lz-tscroll,input,textarea')) return;
      var w = innerWidth; if (e.clientX < w * 0.25) self.turn(-1); else if (e.clientX > w * 0.75) self.turn(1); else post('tapcenter');
    }
  };
  D.addEventListener('pointerdown', function (e) {
    if (S.tool === 'pen' || S.tool === 'eraser' || (e.pointerType === 'mouse' && e.button > 0)) return;
    if (g0 && g0.id !== e.pointerId) { g0 = null; return; }       // a second finger is a pinch, not a turn
    var n = performance.now();
    g0 = { id: e.pointerId, x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, t: n, lt: n, v: 0, moved: false };
  }, { passive: true });
  D.addEventListener('pointermove', function (e) {
    if (!g0 || e.pointerId !== g0.id) return;
    var n = performance.now(), dt = Math.max(1, n - g0.lt);
    g0.v = 0.6 * g0.v + 0.4 * (e.clientX - g0.lx) / dt; g0.lx = e.clientX; g0.ly = e.clientY; g0.lt = n;
    if (!g0.moved && Math.hypot(e.clientX - g0.x, e.clientY - g0.y) > THR) g0.moved = true;
  }, { passive: true });
  D.addEventListener('pointerup', function (e) { gestureEnd(e, false); }, { passive: true });
  D.addEventListener('pointercancel', function (e) { gestureEnd(e, true); }, { passive: true });
  addEventListener('keydown', function (e) { if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { self.turn(1); e.preventDefault(); } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { self.turn(-1); e.preventDefault(); } });
  D.addEventListener('wheel', function (e) { e.preventDefault(); if (self._wheel) return; self._wheel = setTimeout(function () { self._wheel = 0; }, 350); self.turn((Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) > 0 ? 1 : -1); }, { passive: false });
  // fonts load after the first layout: lay out again (once per batch) so parts keep landing on left pages
  if (D.fonts && D.fonts.addEventListener) D.fonts.addEventListener('loadingdone', debounce(function () { if (BK && !BK.busy) BK.relayout(); }, 150));
  addEventListener('pagehide', function () { self.flushAnchor(); });
  D.addEventListener('visibilitychange', function () { if (D.visibilityState === 'hidden') self.flushAnchor(); });
  this.relayout(CFG.pos);
};
BookView.prototype.makeCover = function () {
  var c = ownEl('div', 'lz-cover'), cv = CFG.cover || {};
  c.innerHTML = '<div class="lz-cv-in"><p class="lz-cv-sub"></p><h1 class="lz-cv-t"></h1><div class="lz-cv-s"></div></div>';
  c.querySelector('.lz-cv-sub').textContent = cv.subject || '';
  var dt = (D.querySelector('meta[name="studiem:title"]') || {}).content || D.title || (D.querySelector('h1') || {}).textContent;
  c.querySelector('.lz-cv-t').textContent = (dt || cv.title || CFG.title || '').replace(/\s+/g, ' ').trim();
  if (cv.sticker) { var im = D.createElement('img'); im.src = cv.sticker; im.alt = ''; c.querySelector('.lz-cv-s').appendChild(im); }
  return c;
};
BookView.prototype.css = function (g) {
  var u = 1 / g.z, m = g.m * u, pw = g.pageW * u, ph = g.pageH * u, colW = pw - 2 * m;
  var bg = themeNow().bg, th = themeNow(), ink = th.ink;
  var dark = th.dark;
  var cols = g.two ? 2 : 1;
  css('lz-book-css',
    'html{overflow:hidden!important;height:100%!important;background:transparent!important;clip-path:inset(' + Math.max(0, g.top - 10) * u + 'px ' + Math.max(0, innerWidth - g.left - g.spreadW - 10) * u + 'px ' + Math.max(0, innerHeight - g.top - g.pageH - 10) * u + 'px ' + Math.max(0, g.left - 10) * u + 'px)}' +
    'body{position:absolute!important;left:' + (g.left * u) + 'px!important;top:' + (g.top * u) + 'px!important;margin:0!important;padding:' + m + 'px ' + m + 'px!important;box-sizing:content-box!important;max-width:none!important;min-width:0!important;' +
    'width:' + (cols * pw - 2 * m) + 'px!important;height:' + (ph - 2 * m) + 'px!important;column-width:' + colW + 'px!important;column-gap:' + (2 * m) + 'px!important;column-fill:auto!important;column-count:auto!important;overflow:visible!important;background:transparent!important;transform-origin:0 0;touch-action:pan-y}' +
    'html{touch-action:pan-y!important}' +
        'body > *{max-width:100%}' +
    '.lz-bkwrap{max-width:none!important;width:auto!important;margin:0!important;padding-left:0!important;padding-right:0!important;padding-top:0!important;border-left:0!important;border-right:0!important;box-shadow:none!important;background:none!important}' +
    'h1,h2,h3,h4,h5,h6,[data-h],.eyebrow,figcaption{break-after:avoid;page-break-after:avoid}' +
    'table,figure,pre,blockquote,.callout,.box,.note,.tip,.warn,li,tr{break-inside:avoid;page-break-inside:avoid}' +
    'p{orphans:3;widows:3}' +
    '.lz-part{break-before:column!important}.lz-brk{break-before:column!important}.lz-sp{break-before:column!important;display:block;height:1px;margin:0!important;padding:0!important;border:0!important;visibility:hidden}' +
    'body *{column-count:auto!important;column-width:auto!important}' +
    'img{max-height:' + Math.round(ph * 0.7) + 'px;width:auto;max-width:100%;object-fit:contain}' +
    (g.imgH ? 'img.pdf-page{max-height:none!important;width:100%!important;height:' + (g.imgH * u) + 'px!important;object-fit:contain;margin:0 0 ' + (g.gap * u) + 'px!important;box-shadow:0 0 0 1px rgba(0,0,0,.12);border-radius:3px;break-inside:avoid;background:#fff}.lz-bind{position:absolute;left:' + ((g.left + 8) * u) + 'px;width:' + ((g.pageW - 16) * u) + 'px;top:' + ((g.top + g.m + g.imgH + g.gap / 2) * u) + 'px;border-top:2px dotted rgba(0,0,0,.28)}' : '') +
    '.lz-grid1{display:block!important;grid-template-columns:1fr!important}' +
    '.lz-cover{break-after:column;height:' + (ph - 2 * m) + 'px;width:' + colW + 'px;margin:0;box-sizing:border-box;position:relative;display:flex;align-items:center;justify-content:center;text-align:center;font-family:"Cormorant","Cormorant Garamond",Georgia,serif;color:' + ink + '}' +
    '.lz-cv-in{padding:' + (m * 1.4) + 'px;border:1px solid ' + (dark ? 'rgba(255,255,255,.25)' : 'rgba(0,0,0,.2)') + ';border-radius:6px;width:100%;height:100%;display:flex;flex-direction:column;justify-content:center;gap:14px;box-sizing:border-box;background:linear-gradient(160deg,rgba(120,150,200,.16),rgba(120,150,200,.04))}' +
    '.lz-cv-sub{margin:0;font:700 12px/1 -apple-system,system-ui,sans-serif;letter-spacing:.16em;text-transform:uppercase;opacity:.75}.lz-cv-t{margin:0;font-weight:600;font-size:' + Math.min(44, colW / 9) + 'px;line-height:1.1;letter-spacing:0;color:inherit;border:0;padding:0;background:none}.lz-cv-s img{max-width:' + Math.round(colW * 0.42) + 'px;max-height:' + Math.round(ph * 0.22) + 'px}' +
    // paper, gutter, numerals (all inside the frame; the desk is the parent\'s)
    '.lz-bk{position:fixed;left:0;top:0;width:' + (innerWidth * u) + 'px;height:' + (innerHeight * u) + 'px;pointer-events:none;z-index:-1}' +
    '.lz-pg{position:absolute;top:' + (g.top * u) + 'px;height:' + ph + 'px;width:' + pw + 'px;background:' + bg + ';box-shadow:0 0 0 1px ' + (dark ? 'rgba(255,255,255,.12)' : 'rgba(0,0,0,.14)') + ',0 6px 22px -8px rgba(0,0,0,.4)}' +
    '.lz-pg.l{left:' + (g.left * u) + 'px;border-radius:6px 0 0 6px}.lz-pg.r{left:' + ((g.left + (g.two ? g.pageW : 0)) * u) + 'px;border-radius:' + (g.two ? '0 6px 6px 0' : '6px') + '}' +
    (g.two ? '' : '.lz-pg.l{display:none}') +
    '.lz-gut{position:absolute;top:' + (g.top * u) + 'px;height:' + ph + 'px;left:' + ((g.left + g.pageW) * u - 18 * u) + 'px;width:' + (36 * u) + 'px;background:linear-gradient(90deg,transparent,rgba(0,0,0,' + (dark ? .35 : .16) + ') 50%,transparent);' + (g.two ? '' : 'display:none') + '}' +
    '.lz-rh,.lz-no{position:absolute;font:600 ' + (11 * u) + 'px -apple-system,system-ui,sans-serif;color:' + ink + ';opacity:.6;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:' + (colW) + 'px}' +
    '.lz-rh{top:' + ((g.top + 6) * u) + 'px}.lz-no{top:' + ((g.top + g.pageH - 6) * u - 14 * u) + 'px;text-align:center}' +
    '.lz-rh.l,.lz-no.l{left:' + ((g.left + g.m) * u) + 'px;width:' + colW + 'px}.lz-rh.r,.lz-no.r{left:' + ((g.left + (g.two ? g.pageW : 0) + g.m) * u) + 'px;width:' + colW + 'px}' +
    '.lz-shade{position:absolute;inset:0;background:linear-gradient(90deg,rgba(0,0,0,.0),rgba(0,0,0,.14),rgba(0,0,0,0));opacity:0}.lz-shade.go{animation:lzshade 280ms ease-out}@keyframes lzshade{0%{opacity:0}40%{opacity:1}100%{opacity:0}}' +
    'body.lz-up{animation:lzup 260ms cubic-bezier(.22,.7,.2,1)}@keyframes lzup{from{opacity:.0;margin-top:28px}to{opacity:1;margin-top:0}}');
};
BookView.prototype.relayout = function (pos) {
  var self = this; if (this.busy) { this.again = pos || true; return; } this.busy = true;
  var keep = pos || (this.ready ? this.anchorNow() : null);
  this.layouts++;
  var g = this.g = this.geom(); this.two = g.two; calibrate();
  this.css(g);
  D.querySelectorAll('.lz-sp').forEach(function (e) { e.remove(); });
  D.querySelectorAll('.lz-part,.lz-brk').forEach(function (e) { e.classList.remove('lz-part', 'lz-brk'); });
  applyWidth(); var w = findWrapper(); if (w) { w.classList.remove('lz-wide'); w.classList.add('lz-bkwrap'); }
  D.querySelectorAll('div,section,ul,ol,dl').forEach(function (e) { if (e.closest('.lz-own')) return; var cs = getComputedStyle(e); if (cs.display === 'grid' && cs.gridTemplateColumns.split(' ').length > 1) e.classList.add('lz-grid1'); });
  D.body.style.transform = 'none'; D.body.classList.remove('lz-anim'); this.curX = null;
  this.parts = findParts().filter(function (p) { return p.el !== D.body && !self.cover.contains(p.el); });
  var idx0 = index();
  this.parts = this.parts.filter(function (p) { var n = D.createTreeWalker(p.el, NodeFilter.SHOW_TEXT).nextNode(); var o = n ? pointToOffset(idx0, n, 0) : 0; p.skipBreak = o == null || o < 160; return true; });
  this.parts.forEach(function (p) { if (!p.skipBreak) p.el.classList.add('lz-part'); });
  this.fitTables();
  this.fixPartParity();
  this.cleanBreaks();
  this.measure();
  this.busy = false; this.ready = true;
  if (keep && (keep.off != null || keep.quote || keep.blk)) this.gotoAnchorObj(keep); else this.show(this.page, false);
  this.report();
  if (this.again) { var a = this.again; this.again = null; this.relayout(a === true ? null : a); }
};
BookView.prototype.colOf = function (el) { var g = this.g, u = K.r / K.z, bx = D.body.getBoundingClientRect().left, r = el.getBoundingClientRect(); return Math.floor((r.left - bx) / (g.pageW * u) + 0.001); };
BookView.prototype.measure = function () {
  var g = this.g, u = 1 / g.z, pw = g.pageW * u;
  this.pages = Math.max(1, Math.ceil(D.body.scrollWidth / pw - 0.03));
  if (this.two && this.pages % 2) this.pages++;
  this.partsMsg = null;
  this.partCols = this.parts.map(function (p) { return { col: BK.colOf(p.el), title: p.title }; });
  this.imgCols = [].slice.call(D.querySelectorAll('img')).filter(function (im) { return !im.closest('.lz-own'); }).map(function (im) { return { im: im, col: BK.colOf(im) }; });
  this.spreads = Math.ceil(this.pages / (this.two ? 2 : 1));
};
// a part starts on a LEFT page: one blank column is inserted before it when it would land on the right
BookView.prototype.fixPartParity = function () {
  if (!this.two) return;
  for (var i = 0; i < this.parts.length; i++) {
    if (this.parts[i].skipBreak) continue;
    var el = this.parts[i].el, c = this.colOf(el);
    if (c % 2 === 1) { var sp = D.createElement('div'); sp.className = 'lz-sp lz-own'; sp.setAttribute('data-skip', '1'); el.parentNode.insertBefore(sp, el); }
  }
};
// WebKit ignores some break rules in columns: a heading stranded at the bottom of a column is moved to the next one
BookView.prototype.cleanBreaks = function () {
  var g = this.g, ph = (g.pageH - 2 * g.m) / g.z, u = K.r / K.z;
  for (var pass = 0; pass < 3; pass++) {
    var hs = [].slice.call(D.body.querySelectorAll('h1,h2,h3,h4,h5,h6,[data-h],.eyebrow')).filter(function (h) { return !h.closest('.lz-own,.lz-chrome') && !h.classList.contains('lz-brk') && !h.classList.contains('lz-part'); });
    var bt = D.body.getBoundingClientRect().top, changed = false;
    for (var i = 0; i < hs.length; i++) {
      var h = hs[i], r = h.getBoundingClientRect(); if (!r.height) continue;
      var top = (r.top - bt - 0) / u - g.m / g.z, bottom = (r.bottom - bt) / u - g.m / g.z;
      var inCol = bottom % ph; var remaining = ph - (bottom % ph);
      var fs = parseFloat(getComputedStyle(h).fontSize) || 16, lh = fs * 1.5;
      var atTop = top % ph < 4 || ph - (top % ph) < 4;
      if (!atTop && remaining < lh * 2.6 + 4 && remaining >= 0) { h.classList.add('lz-brk'); changed = true; }
      void inCol;
    }
    if (!changed) break;
    D.body.getBoundingClientRect(); this.fixPartParity();
  }
};
// tables inside pages: shrink the font up to 20%, then zoom the table alone (min .72); never cut
BookView.prototype.fitTables = function () {
  var g = this.g, colW = (g.pageW - 2 * g.m) / g.z;
  D.querySelectorAll('table').forEach(function (t) {
    if (t.closest('.lz-own')) return; t.style.removeProperty('font-size'); t.style.removeProperty('zoom'); t.style.removeProperty('overflow-wrap'); t.style.tableLayout = 'auto'; t.style.maxWidth = '100%';
    var wd = function () { return t.getBoundingClientRect().width / (K.r || 1); };
    if (wd() <= colW + 1) return;
    t.style.fontSize = '0.9em'; if (wd() <= colW + 1) return;
    t.style.fontSize = '0.8em'; if (wd() <= colW + 1) return;
    t.style.overflowWrap = 'anywhere'; if (wd() <= colW + 1) return;
    var k = Math.max(0.72, colW / wd()); t.style.zoom = String(k);
  });
};
BookView.prototype.anchorNow = function () {
  var g = this.g, u = K.r / K.z, x = (g.left + 8) * u, y = (g.top + 12) * u;
  var left = this.page % (this.two ? 2 : 1) === 0;
  var rg = D.caretRangeFromPoint ? D.caretRangeFromPoint(x, y) : null;
  if (this.two) rg = D.caretRangeFromPoint ? D.caretRangeFromPoint((g.left + g.m + 8) * u, (g.top + g.m + 6) * u) : null;
  if (!rg || rg.startContainer.nodeType !== 3 || isOwn(rg.startContainer)) { rg = null; var nodes = index().nodes; for (var i = 0; i < nodes.length; i++) { var r = D.createRange(); r.selectNodeContents(nodes[i].node); var b = r.getBoundingClientRect(); if (b.width && b.right > 0 && b.left >= 0 && b.left < innerWidth * u) { rg = { startContainer: nodes[i].node, startOffset: 0 }; break; } } }
  void left;
  if (!rg) return null;
  var idx = index(), off = pointToOffset(idx, rg.startContainer, rg.startOffset); if (off == null) return null;
  var s = segOfNode(rg.startContainer);
  return { off: off, quote: idx.text.slice(off, off + 48), blk: s ? s.id : null };
};
BookView.prototype.gotoAnchorObj = function (a) {
  var idx = index(), res = null;
  if (a.quote) res = resolveAnchor(idx, { start: a.off || 0, end: (a.off || 0) + a.quote.length, quote: a.quote, prefix: '', suffix: '' });
  var node = null, off = 0;
  if (res) { var p = offsetToPoint(idx, res.start, false); if (p) { node = p.node; off = p.offset; } }
  else if (a.blk) { var s = segments().filter(function (x) { return x.id === a.blk; })[0]; if (s) { node = s.leaves[0]; off = 0; } }
  if (!node) { this.show(0, false); return false; }
  return this.gotoNode(node, off);
};
BookView.prototype.gotoNode = function (node, off) {
  var r = D.createRange();
  try { if (node.nodeType === 3) { r.setStart(node, Math.min(off, Math.max(0, node.data.length - 1))); r.setEnd(node, Math.min(node.data.length, off + 1)); } else r.selectNode(node); } catch (e) { return false; }
  var save = D.body.style.transform; D.body.style.transform = 'none'; D.body.classList.remove('lz-anim');
  var c = this.colOf({ getBoundingClientRect: function () { return r.getBoundingClientRect(); } });
  D.body.style.transform = save;
  this.show(clamp(Math.floor(c / (this.two ? 2 : 1)) * (this.two ? 2 : 1), 0, this.pages - 1), false); return true;
};
// page = index of the LEFT page of the current spread
// A turn is a short rAF loop that moves the strip with a 2D translate: the cheapest path measured for a 150+ page flow.
// (A CSS transition / Web Animation or will-change on the strip makes the browser re-layerize the whole 80,000 px strip: ~2 s per turn on a slow CPU.)
// Page numerals and the running head are changed AFTER the slide, once: a repaint inside the animation has the same cost.
// work that is not needed to show the page runs when the turn is over (idle callback; setTimeout where Safari has none)
BookView.prototype.idle = function (fn) { if (window.requestIdleCallback) requestIdleCallback(fn, { timeout: 600 }); else setTimeout(fn, 60); };
var EASE = function (k) { return 1 - Math.pow(1 - k, 3); };
BookView.prototype.setX = function (x) { this.curX = x; D.body.style.transform = 'translate(' + x + 'px,0)'; };
BookView.prototype.show = function (page, animate, dir) {
  var per = this.two ? 2 : 1, g = this.g, step = g.spreadW / g.z, self = this;
  page = clamp(Math.floor(page / per) * per, 0, Math.max(0, this.pages - per));
  this.page = page;
  var tx = -(page / per) * step, from = this.curX == null ? tx : this.curX;
  if (this._raf) { cancelAnimationFrame(this._raf); this._raf = 0; }
  D.body.classList.remove('lz-anim');
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  this.report(true);
  if (animate && !reduce && Math.abs(from - tx) > 0.5) {
    var t0 = performance.now(), dur = 280, fr = [], last = t0;
    this.turning = true; post('turning', { on: true });
    var tick = function (n) {
      var k = clamp((n - t0) / dur, 0, 1);
      self.setX(from + (tx - from) * EASE(k));
      fr.push(n - last); last = n;
      if (k < 1) { self._raf = raf(tick); return; }
      self._raf = 0; self.turning = false; post('turning', { on: false });
      fr.shift(); var af = self.allFrames || (self.allFrames = []); for (var q = 0; q < fr.length; q++) af.push(fr[q]); if (af.length > 1500) af.splice(0, af.length - 1500);
      self.turns.push({ ms: Math.round(performance.now() - t0), p95: p95(fr) }); if (self.turns.length > 60) self.turns.shift(); self.frames = fr;
      post('perf', { turns: self.turns.slice(-30), layouts: self.layouts, p95all: p95(af) });
      if (CFG.perf) { var po = D.getElementById('lz-perf') || (function () { var e = ownEl('div', ''); e.id = 'lz-perf'; e.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:2147483600;background:#000c;color:#0f0;font:12px monospace;padding:4px 8px;border-radius:6px'; D.documentElement.appendChild(e); return e; })(); po.textContent = 'p95 ' + p95(self.allFrames) + ' ms · turn ' + Math.round(performance.now() - t0) + ' ms · layouts ' + self.layouts; }
      self.overlay();
      self.idle(function () { self.decodeNext(); });
      if (self.queued) { var qd = self.queued; self.queued = 0; self.turn(qd); }
    };
    this._raf = raf(tick);
    return;
  }
  this.setX(tx); this.overlay();
  this.idle(function () { self.decodeNext(); });
};
function p95(a) { if (!a.length) return 0; var s = a.slice().sort(function (x, y) { return x - y; }); return Math.round(s[Math.min(s.length - 1, Math.floor(s.length * 0.95))]); }
// while a leaf is turning ONE next turn is remembered (never dropped, never stacked) and runs when the animation ends
BookView.prototype.turn = function (dir) {
  if (this.turning) { this.queued = dir; return; }
  var per = this.two ? 2 : 1, np = this.page + dir * per;
  if (np < 0 || np >= this.pages) return;
  this.show(np, true, dir);
};
// pictures of the next two spreads are decoded while idle, before they slide in (a decode inside the slide is a visible hitch).
// Their columns are computed once per layout (measure), so a turn never scans or measures the whole document.
BookView.prototype.decodeNext = function () {
  var per = this.two ? 2 : 1, from = this.page, to = this.page + 3 * per, list = this.imgCols || [];
  for (var i = 0; i < list.length; i++) { var x = list[i]; if (x.col >= from && x.col < to && !x.im.__d) { x.im.__d = 1; if (x.im.decode) x.im.decode().catch(function () { }); } }
};
BookView.prototype.pageTitle = function (col) {
  var t = '', c = this.partCols || []; for (var i = 0; i < c.length; i++) if (c[i].col <= col) t = c[i].title; return t;
};
BookView.prototype.overlay = function () {
  var bd = this.paper.querySelector('.lz-bind'); if (bd) bd.style.display = this.page === 0 ? 'none' : '';
  var per = this.two ? 2 : 1, set = function (sel, v) { var e = BK.paper.querySelector(sel); if (e) e.textContent = v; };
  var pgs = [this.page, this.page + 1];
  [['l', pgs[0]], ['r', per === 2 ? pgs[1] : pgs[0]]].forEach(function (x) {
    var side = x[0], col = x[1], cover = col === 0, blank = col >= BK.pages;
    set('.lz-no.' + side, cover || blank ? '' : String(col));
    set('.lz-rh.' + side, cover || blank ? '' : BK.pageTitle(col));
  });
};
BookView.prototype.report = function (lazy) {
  var per = this.two ? 2 : 1;
  post('page', { page: this.page + 1, pages: this.pages, spread: this.page / per + 1, spreads: this.spreads, part: this.pageTitle(this.page + (this.two ? 1 : 0)), layouts: this.layouts, parts: this.partsMsg || (this.partsMsg = (this.partCols || []).map(function (p) { return { title: p.title, page: p.col + 1 }; })), two: this.two });
  // the text anchor needs a hit test (layout): after a turn it is sent once the reader stops turning, never inside the turn itself
  if (!lazy) { clearTimeout(this._aT); post('anchor', { a: this.ready ? this.anchorNow() : null }); return; }
  var self = this; clearTimeout(this._aT); this._aT = setTimeout(function () { self.idle(function () { if (self.ready && !self.turning) post('anchor', { a: self.anchorNow() }); }); }, 500);
};
BookView.prototype.flushAnchor = function () { if (this._aT) { clearTimeout(this._aT); this._aT = 0; if (this.ready) post('anchor', { a: this.anchorNow() }); } };
BookView.prototype.fillAnchor = function () { return this.anchorNow(); };
BookView.prototype.pageOfAnchor = function (a) { return a; };
H.turn = function (m) { if (BK) BK.turn(m.dir); };
H.flush = function () { if (BK) BK.flushAnchor(); };
H.page = function (m) { if (BK) BK.show(m.n, true); };
H.toc = function () { if (BK) post('toc', { parts: (BK.partCols || []).map(function (p) { return { title: p.title, page: p.col + 1 }; }), heads: [].slice.call(D.body.querySelectorAll('h1,h2,h3,[data-h]')).filter(function (h) { return !h.closest('.lz-own,.lz-chrome') && headLevel(h) <= 3; }).slice(0, 200).map(function (h) { return { title: headText(h), page: BK.colOf(h) + 1, level: headLevel(h) }; }) }); };
BookView.prototype.reflowAfterMarks = function () { };
function reflowAfterMarks() { if (BK && BK.ready) { BK.measure(); BK.report(); } }
