// ===== dark document background =====
// The light paper becomes near-black. Text, backgrounds and borders are recoloured ELEMENT BY ELEMENT with their hue kept: red text stays red, blue blue,
// violet violet (only brightened so that it reads on black); dark text becomes light; light tints become dark tints. Pictures (img, canvas, video) are never touched.
// A file that is already dark is left alone. Everything is undone exactly (the previous inline values are remembered).
var DK = { touched: [], seen: null, effL: null, mo: null, gen: 0 };
function dkParse(c) { var m = String(c).match(/[\d.]+/g); return m && m.length >= 3 ? { r: +m[0], g: +m[1], b: +m[2], a: m.length > 3 ? +m[3] : 1 } : null; }
function dkHsl(c) {
  var r = c.r / 255, g = c.g / 255, b = c.b / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, h = 0, s = 0, d = mx - mn;
  if (d) { s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h /= 6; }
  return { h: h, s: s, l: l };
}
function dkRgb(h, s, l) {
  var f = function (p, q, t) { if (t < 0) t += 1; if (t > 1) t -= 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < .5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  if (!s) { var v = Math.round(l * 255); return [v, v, v]; }
  var q = l < .5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  return [Math.round(f(p, q, h + 1 / 3) * 255), Math.round(f(p, q, h) * 255), Math.round(f(p, q, h - 1 / 3) * 255)];
}
function dkText(c) {                                            // text colour for a dark page
  var x = dkParse(c); if (!x) return null; var o = dkHsl(x), l;
  if (o.s < .16) l = Math.min(.93, Math.max(.66, 1 - o.l * .9));        // black / grey text -> light grey / white
  else l = o.l < .64 ? .64 + o.l * .1 : o.l;                           // coloured text: same hue, brightened to read on black
  var v = dkRgb(o.h, o.s, l); return 'rgb(' + v[0] + ',' + v[1] + ',' + v[2] + ')';
}
function dkBg(c) {                                              // background / border colour: light -> dark, tint kept
  var x = dkParse(c); if (!x) return null; var o = dkHsl(x);
  var v = dkRgb(o.h, o.s * .7, .07 + (1 - o.l) * .17); return 'rgb(' + v[0] + ',' + v[1] + ',' + v[2] + ')';
}
var DK_SIDES = ['Top', 'Right', 'Bottom', 'Left'];
function dkProcess(list) {
  var i = 0, g = DK.gen;
  (function chunk() {
    if (g !== DK.gen) return;
    var t0 = performance.now(), recs = [];
    // read first ... (inherited colours must be read before any parent is changed)
    while (i < list.length && performance.now() - t0 < 6) {
      var e = list[i++]; if (DK.seen.has(e) || e.closest('.lz-chrome') || /^(SCRIPT|STYLE|IMG|PICTURE|VIDEO|CANVAS|SVG|BR|HEAD|META|LINK|TITLE)$/i.test(e.tagName) || (e.closest && e.closest('svg'))) continue;
      DK.seen.add(e);
      var cs = getComputedStyle(e), bg = dkParse(cs.backgroundColor), hasBg = bg && bg.a > .3, par = e.parentElement;
      var pl = par && DK.effL.has(par) ? DK.effL.get(par) : 1, myL = hasBg ? dkHsl(bg).l : pl; DK.effL.set(e, myL);
      var own = false; for (var n = e.firstChild; n; n = n.nextSibling) if (n.nodeType === 3 && n.data.trim()) { own = true; break; }
      var bor = []; for (var k = 0; k < 4; k++) { var w = parseFloat(cs['border' + DK_SIDES[k] + 'Width']); if (w > 0 && cs['border' + DK_SIDES[k] + 'Style'] !== 'none') bor.push([k, cs['border' + DK_SIDES[k] + 'Color']]); }
      recs.push({ e: e, col: cs.color, bg: hasBg ? cs.backgroundColor : null, bgL: hasBg ? myL : 1, effL: myL, own: own, bor: bor, mark: e.classList.contains('lzm') });
    }
    // ... then write
    for (var j = 0; j < recs.length; j++) {
      var r = recs[j], el = r.e, st = el.style, prev = {}, put = function (prop, val) { if (!val) return; if (!(prop in prev)) prev[prop] = [st.getPropertyValue(prop), st.getPropertyPriority(prop)]; st.setProperty(prop, val, 'important'); };
      if (r.mark) { var m = dkParse(r.bg || ''); if (m) put('background-color', 'rgba(' + m.r + ',' + m.g + ',' + m.b + ',.42)'); }
      else if (r.bg && r.bgL > .4) put('background-color', dkBg(r.bg));
      if (r.own && r.effL > .4 && !r.mark) put('color', dkText(r.col));
      r.bor.forEach(function (b) { var x = dkParse(b[1]); if (x && dkHsl(x).l > .45) put('border-' + DK_SIDES[b[0]].toLowerCase() + '-color', dkBg(b[1])); });
      if (Object.keys(prev).length) DK.touched.push([el, prev]);
    }
    if (i < list.length) requestAnimationFrame(chunk);
  })();
}
function dkAll() { dkProcess([].slice.call(D.body.querySelectorAll('*'))); }
function applyDark() {
  var on = !!S.dark;
  DK.gen++;
  if (DK.mo) { DK.mo.disconnect(); DK.mo = null; }
  DK.touched.forEach(function (t) { for (var p in t[1]) { if (t[1][p][0]) t[0].style.setProperty(p, t[1][p][0], t[1][p][1]); else t[0].style.removeProperty(p); } });
  DK.touched = []; css('lz-dark', ''); R.classList.remove('lz-dk'); DK.seen = new WeakSet(); DK.effL = new WeakMap();
  if (on && themeLight().dark) on = false;                         // a file that is already dark stays as it is
  if (on) {
    css('lz-dark', 'html,body{background-color:#0d0d0f!important;color-scheme:dark}body{color:#e6e8ec}' +
      'html.lz-dk .lzm{mix-blend-mode:normal!important}html.lz-dk .lzm-ul{background:none!important}' +
      'html.lz-dk .lz-pen,html.lz-dk svg{-webkit-filter:invert(1) hue-rotate(180deg);filter:invert(1) hue-rotate(180deg)}' +
      'html.lz-dk ::selection{background:rgba(120,160,255,.45)}');
    R.classList.add('lz-dk'); dkAll();
    // anything added later (marks, block cards, relayout) is recoloured too
    var d = debounce(function () { dkAll(); }, 150);
    try { DK.mo = new MutationObserver(d); DK.mo.observe(D.body, { childList: true, subtree: true }); } catch (e) { /* ignore */ }
  }
  reportTheme();
}
