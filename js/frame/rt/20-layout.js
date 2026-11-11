// ===== layout: chrome, width, zoom, tables, font comfort, theme, activity =====
var BASE_CSS = [
  'a[x-apple-data-detectors]{color:inherit!important;text-decoration:none!important;font:inherit!important}',
  'html{-webkit-text-size-adjust:100%;text-size-adjust:100%}',
  '.lz-chrome{display:none!important}',
  '.lz-wide{max-width:none!important;width:auto!important;margin-left:auto!important;margin-right:auto!important;padding-left:24px!important;padding-right:24px!important;box-sizing:border-box!important}',
  '.lz-tscroll{overflow-x:auto;max-width:100%;-webkit-overflow-scrolling:touch;position:relative}',
  '.lz-tscroll.lz-fr{-webkit-mask-image:linear-gradient(to right,#000 calc(100% - 28px),transparent);mask-image:linear-gradient(to right,#000 calc(100% - 28px),transparent)}',
  '.lz-tscroll.lz-fl{-webkit-mask-image:linear-gradient(to left,#000 calc(100% - 28px),transparent);mask-image:linear-gradient(to left,#000 calc(100% - 28px),transparent)}',
  '.lz-tscroll.lz-fl.lz-fr{-webkit-mask-image:linear-gradient(to right,transparent,#000 28px,#000 calc(100% - 28px),transparent);mask-image:linear-gradient(to right,transparent,#000 28px,#000 calc(100% - 28px),transparent)}',
  'body{overflow-wrap:break-word}',
  'img,svg,video,canvas{max-width:100%}img{height:auto}',
  '.lz-own,.lz-own *{box-sizing:border-box}',
  'html.lz-vz,html.lz-vz body{overflow-x:auto!important}',
  'body,body *{-webkit-user-select:text;user-select:text}.lz-own,.lz-own *{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}',
  '@media print{html{zoom:1!important;padding:0!important}.lz-own,.lz-chrome,.lz-pen{display:none!important}.lzm{-webkit-print-color-adjust:exact;print-color-adjust:exact}}'
].join('\n');
var CHROME_SEL = '.bar,#bar,#tools,#uhl,#lb,#slb,.toolbar,#toolbar,.topbar,#topbar,.navbar,#navbar,.fab,#fab,.sticky-bar,.progress-bar,#progress,.toast,#toast,dialog,.modal,#modal,.lightbox,#lightbox,.overlay,#overlay';

function installBase() { css('lz-base', BASE_CSS); }

// hide the file's own interface: sticky/fixed elements (found through the stylesheets, cheap), known toolbars, button-only strips
function hideChrome() {
  var mark = function (e) {
    if (!e || e === D.body || e === R || e.classList.contains('lz-chrome')) return;
    if (e.querySelector && (e.querySelector('section.blk, h1, h2, table, figure') || (e.textContent || '').length > bodyText() * 0.5)) return;   // never hide the content
    e.classList.add('lz-chrome');
  };
  var seen = 0;
  var scan = function (rules) {
    for (var i = 0; i < rules.length; i++) {
      var r = rules[i];
      try {
        if (r.type === 1 && r.style && /fixed|sticky/.test(r.style.position || '') && r.selectorText) {
          D.querySelectorAll(r.selectorText).forEach(function (e) { mark(e); seen++; });
        } else if (r.cssRules && (r.type === 4 || r.type === 12)) { if (r.type === 4 && r.media && !matchMedia(r.media.mediaText).matches) continue; scan(r.cssRules); }
      } catch (e) { /* cross-origin / odd selector */ }
    }
  };
  for (var si = 0; si < D.styleSheets.length; si++) { try { scan(D.styleSheets[si].cssRules); } catch (e) { /* ignore */ } }
  D.querySelectorAll('[style*="fixed"],[style*="sticky"]').forEach(mark);
  D.querySelectorAll(CHROME_SEL).forEach(mark);
  // strips that hold only buttons (looked up from the buttons, not by scanning every div)
  D.querySelectorAll('button').forEach(function (b) {
    var e = b.parentElement;
    for (var up = 0; up < 3 && e && e !== D.body; up++, e = e.parentElement) {
      if (e.classList.contains('lz-chrome')) break;
      if (e.querySelector('section, table, figure, img, h1, h2, h3, p')) break;
      var bt = ''; e.querySelectorAll('button').forEach(function (x) { bt += x.textContent; });
      if ((e.textContent || '').length < 200 && (e.textContent || '').replace(/\s+/g, '') === bt.replace(/\s+/g, '')) { mark(e); break; }
    }
  });
  D.querySelectorAll('button, input, select, textarea, script, noscript').forEach(function (e) { if (!e.closest('.lz-own')) { if (e.tagName === 'SCRIPT' || e.tagName === 'NOSCRIPT') return; e.classList.add('lz-chrome'); } });
}

// the file's main content wrapper: its own max-width is what makes the column narrow when zoomed out
var WRAP = null;
function findWrapper() {
  if (WRAP !== null) return WRAP || null;
  var total = bodyText(), best = null;
  var cands = [D.body]; D.body.querySelectorAll(':scope > *, :scope > * > *, :scope > * > * > *').forEach(function (e) { cands.push(e); });
  for (var i = 0; i < cands.length; i++) {
    var e = cands[i]; if (e.classList.contains('lz-chrome') || e.closest('.lz-own')) continue;
    if ((e.textContent || '').length < total * 0.6) continue;
    var cs = getComputedStyle(e);
    if (cs.maxWidth !== 'none' && cs.display !== 'inline') { best = e; break; }
  }
  if (!best) { var m = D.querySelector('main, .wrap, .container, article, #app'); if (m && (m.textContent || '').length >= total * 0.6) best = m; }
  WRAP = best || false; return best;
}
// width presets: narrow / mid / broad / wide (= full width); «original» keeps the file's own width. Never changed by pinch.
var WIDTHS = { narrow: '50ch', mid: '66ch', broad: '88ch' };
function applyWidth() {
  var w = findWrapper() || (VIEW === 'orig' ? null : D.body); if (!w) return;
  w.classList.toggle('lz-wide', S.width === 'wide' && VIEW !== 'orig');
  if (WIDTHS[S.width] && VIEW !== 'orig' && VIEW !== 'book') { w.style.setProperty('max-width', WIDTHS[S.width], 'important'); w.style.setProperty('margin-left', 'auto', 'important'); w.style.setProperty('margin-right', 'auto', 'important'); w.classList.remove('lz-wide'); }
  else if (w.dataset.lzw0 !== undefined || w.style.maxWidth) { if (w === D.body || w.hasAttribute('data-lzwset')) { w.style.removeProperty('max-width'); w.style.removeProperty('margin-left'); w.style.removeProperty('margin-right'); } }
  if (WIDTHS[S.width]) w.setAttribute('data-lzwset', '1');
}

// zoom: CSS zoom on the root scales the file's own px consistently, exactly like a pinch
function pagesDoc() { var m = D.querySelector('meta[name="studiem:layout"]'); return !!m && /^pages/.test(m.content); }
// page pictures (PDF slides / scans) scale WITH the zoom: 75% = the page fills the reading width, 150% = twice that (scroll sideways)
function applyPages() {
  if (!pagesDoc() || VIEW === 'book') return;
  css('lz-pages-css', '.pages,.paper{padding-left:0!important;padding-right:0!important;max-width:none!important;width:auto!important;margin-left:0!important;margin-right:0!important}img.pdf-page{width:' + Math.round(innerWidth * 100 / 75) + 'px!important;max-width:none!important;height:auto!important;margin-left:auto;margin-right:auto}');
}
function applyZoom() {
  applyPages();
  R.style.zoom = String((S.zoom || 100) / 100); R.style.setProperty('--u', (100 / (S.zoom || 100)) + 'px');
  calibrate();
  post('zoom', { z: S.zoom, k: K.z / K.r });
}

// tables: never cut. In reading views a table wider than its container gets a scroll box with an edge fade.
function fixTables(root) {
  var ts = (root || D).querySelectorAll('table');
  for (var i = 0; i < ts.length; i++) {
    var t = ts[i]; if (t.closest('.lz-own')) continue;
    var wrap = t.parentElement && t.parentElement.classList.contains('lz-tscroll') ? t.parentElement : null;
    var host = (wrap || t).parentElement; if (!host) continue;
    var hr = host.getBoundingClientRect().width, tr = t.getBoundingClientRect().width;
    if (!wrap && tr > hr + 1 && hr > 0) { wrap = D.createElement('div'); wrap.className = 'lz-tscroll'; t.parentNode.insertBefore(wrap, t); wrap.appendChild(t); wrap.addEventListener('scroll', fadeOf, { passive: true }); }
    if (wrap) fadeOf.call(wrap);
  }
}
function fadeOf() { var w = this; w.classList.toggle('lz-fr', w.scrollLeft + w.clientWidth < w.scrollWidth - 2); w.classList.toggle('lz-fl', w.scrollLeft > 2); }

// font comfort
var WMAP = { 600: 500, 700: 600, 800: 700, 900: 800 };
function applyWeight() {
  var els = D.body.querySelectorAll('*'), i, e, w, o;
  if (S.weight !== 'lighter') {
    D.body.querySelectorAll('[data-lzw]').forEach(function (x) { if (x.dataset.lzo) x.style.setProperty('font-weight', x.dataset.lzo); else x.style.removeProperty('font-weight'); x.removeAttribute('data-lzw'); x.removeAttribute('data-lzo'); });
    return;
  }
  for (i = 0; i < els.length; i++) {
    e = els[i]; if (e.closest('.lz-own') || e.hasAttribute('data-lzw')) continue;
    if (!/^(SCRIPT|STYLE|SVG|PATH|IMG|BR)$/i.test(e.tagName) === false) continue;
    w = parseInt(getComputedStyle(e).fontWeight, 10);
    if (w >= 600 && WMAP[w]) { o = e.style.getPropertyValue('font-weight'); e.setAttribute('data-lzw', String(w)); if (o) e.setAttribute('data-lzo', o); e.style.setProperty('font-weight', String(WMAP[w]), 'important'); }
  }
}
var FAM = { sans: '"Manrope","Golos Text",system-ui,-apple-system,"Segoe UI",sans-serif', serif: '"PT Serif",Georgia,"Times New Roman",serif' };
var HEAD_FAM = null;
function applyFamily() {
  var heads = D.body.querySelectorAll('h1,h2,h3,h4,h5,h6');
  if (!HEAD_FAM) { HEAD_FAM = []; for (var i = 0; i < heads.length; i++) HEAD_FAM.push([heads[i], getComputedStyle(heads[i]).fontFamily]); }
  if (S.family === 'file' || !FAM[S.family]) {
    var s0 = D.getElementById('lz-font'); if (s0) s0.textContent = '';
    HEAD_FAM.forEach(function (x) { x[0].style.removeProperty('font-family'); });
    return;
  }
  css('lz-font', 'body :not(h1):not(h2):not(h3):not(h4):not(h5):not(h6):not(code):not(pre):not(kbd):not(samp):not(h1 *):not(h2 *):not(h3 *):not(h4 *):not(h5 *):not(h6 *):not(.lz-own):not(.lz-own *){font-family:' + FAM[S.family] + '!important}');
  HEAD_FAM.forEach(function (x) { x[0].style.setProperty('font-family', x[1], 'important'); });
}

// theme sync: the site takes the colours of the file
function lumOf(c) { var m = String(c).match(/[\d.]+/g); if (!m) return 1; var f = function (v) { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }; return .2126 * f(+m[0]) + .7152 * f(+m[1]) + .0722 * f(+m[2]); }
function opaque(c) { var m = String(c).match(/[\d.]+/g); return m && (m.length < 4 || +m[3] > 0.5); }
var THEME0 = null;      // book view: the file's colours as they were before the book styles took over
function themeNow() {
  if (THEME0) return THEME0;
  var bg = null, e = [D.body, R]; var w = findWrapper(); if (w) e.unshift(w);
  for (var i = 0; i < e.length; i++) { var c = getComputedStyle(e[i]).backgroundColor; if (opaque(c)) { bg = c; break; } }
  if (!bg) bg = 'rgb(255,255,255)';
  var ink = getComputedStyle(D.body).color;
  var acc = getComputedStyle(R).getPropertyValue('--accent').trim();
  if (!acc) { var h = D.querySelector('h1, h2, h3'); acc = h ? getComputedStyle(h).color : ink; }
  return { bg: bg, ink: ink, accent: acc, dark: lumOf(bg) < 0.3 };
}
var lastTheme = '';
function reportTheme() { var t = themeNow(), k = JSON.stringify(t); if (k !== lastTheme) { lastTheme = k; post('theme', t); } }
function watchTheme() {
  var d = debounce(reportTheme, 120);
  try { var mo = new MutationObserver(d); mo.observe(R, { attributes: true }); mo.observe(D.body, { attributes: true }); } catch (e) { /* ignore */ }
  try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', d); } catch (e) { /* ignore */ }
}

// activity + scroll reports
var lastActive = 0;
function active() { var n = Date.now(); if (n - lastActive >= 5000) { lastActive = n; post('active'); } }
function watchActivity() {
  ['pointerdown', 'keydown', 'touchstart', 'wheel'].forEach(function (ev) { addEventListener(ev, active, { passive: true, capture: true }); });
}
var scrollEl = function () { return D.scrollingElement || R; };
var lastScrollPost = 0;
function watchScroll() {
  addEventListener('scroll', function () { active(); var n = performance.now(); if (n - lastScrollPost < 90) return; lastScrollPost = n; var s = scrollEl(); post('scroll', { top: s.scrollTop, max: Math.max(0, s.scrollHeight - s.clientHeight) }); }, { passive: true });
  addEventListener('scroll', debounce(function () { var s = scrollEl(); post('scroll', { top: s.scrollTop, max: Math.max(0, s.scrollHeight - s.clientHeight), settled: true }); if (VIEW !== 'book') post('anchor', { a: currentAnchor() }); }, 350), { passive: true });
}

// ---- long documents (scroll view only): offscreen blocks are skipped by the browser (content-visibility) but keep their REAL height.
// A fixed guess (the old "auto 700px") made every unseen paragraph 700px tall: the page height jumped while scrolling and, in Книга,
// every paragraph filled a whole page. Heights are measured once with everything rendered, then handed to the browser as the placeholder size.
var CV_MIN_CHARS = 250000;
function cvKids() {
  var out = [], sel = ['body > *', 'main > *', '.wrap > *'];
  for (var i = 0; i < sel.length; i++) D.querySelectorAll(sel[i]).forEach(function (e) { if (out.indexOf(e) < 0 && !e.closest('.lz-own') && !e.classList.contains('lz-chrome') && e.tagName !== 'SCRIPT' && e.tagName !== 'STYLE') out.push(e); });
  return out;
}
function cvApply() {
  if (VIEW !== 'scroll' || bodyText() < CV_MIN_CHARS) return;
  css('lz-cv', '');                                   // everything rendered: true heights
  var kids = cvKids(), hs = new Array(kids.length), i;
  for (i = 0; i < kids.length; i++) hs[i] = kids[i].getBoundingClientRect().height / (K.r || 1);   // reads first ...
  for (i = 0; i < kids.length; i++) { kids[i].classList.add('lz-cvb'); if (hs[i] > 0) kids[i].style.setProperty('contain-intrinsic-size', 'auto ' + Math.round(hs[i]) + 'px'); }   // ... writes after
  css('lz-cv', '.lz-cvb{content-visibility:auto}');
}
