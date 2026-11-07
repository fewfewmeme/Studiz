// ===== reader runtime: core =====
var CFG = window.__LZ, D = document, R = D.documentElement;
var VIEW = CFG.view;                         // 'orig' | 'scroll' | 'book' | 'blocks'
var S = { ins: CFG.insets || { t: 0, b: 0 }, zoom: CFG.zoom || 75, width: CFG.width || 'wide', weight: CFG.weight || 'file', family: CFG.family || 'file', tool: 'none', pen: { color: '#2f4a8f', w: 3 }, eraser: 18, finger: false };
var H = {};                                  // parent -> frame commands
function post(type, data) { try { var m = {}; if (data) for (var k in data) m[k === 'id' ? 'rid' : k] = data[k]; m.lz = 1; m.id = CFG.id; m.type = type; parent.postMessage(m, '*'); } catch (e) { /* ignore */ } }   // data.id (a block / mark id) travels as rid: id is the document's
addEventListener('message', function (e) {
  if (e.source !== parent || !e.data || e.data.lz !== 1) return;
  var f = H[e.data.cmd];
  if (f) { try { f(e.data); } catch (err) { post('error', { message: String(err && err.stack || err) }); } }
});
function raf(fn) { return requestAnimationFrame(fn); }
function debounce(fn, ms) { var t = null; var d = function () { var a = arguments, s = this; clearTimeout(t); t = setTimeout(function () { fn.apply(s, a); }, ms); }; d.now = function () { clearTimeout(t); fn(); }; return d; }
function hash(s) { var h = 5381; for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function el(tag, cls, html) { var e = D.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
function ownEl(tag, cls, html) { var e = el(tag, 'lz-own ' + (cls || ''), html); e.setAttribute('data-skip', '1'); return e; }
function txt(n) { return ((n.innerText != null && n.offsetParent !== null ? n.innerText : n.textContent) || '').replace(/\s+/g, ' ').trim(); }
function words(n) { var t = (n.textContent || '').trim(); return t ? t.split(/\s+/).length : 0; }
function css(id, text) { var s = D.getElementById(id); if (!s) { s = D.createElement('style'); s.id = id; (D.head || R).appendChild(s); } s.textContent = text; return s; }
function bodyText() { return (D.body && D.body.textContent || '').length; }
function isOwn(n) { return !!(n.closest && n.closest('.lz-own')); }
// device px per CSS px (the root zoom) and the unit getBoundingClientRect speaks in
var K = { z: 1, r: 1 };
function calibrate() {
  var z = (S.zoom || 100) / 100; K.z = z;
  var p = D.createElement('div'); p.style.cssText = 'position:absolute;left:0;top:0;width:100px;height:10px;visibility:hidden;pointer-events:none'; D.body.appendChild(p);
  var w = p.getBoundingClientRect().width; D.body.removeChild(p); K.r = w / 100 || 1;   // rect px per CSS px
}
// rect (as the browser reports) -> viewport px of the frame as the parent sees it (device px)
function toDev(rc) { var f = K.z / K.r; return { left: rc.left * f, top: rc.top * f, right: rc.right * f, bottom: rc.bottom * f, width: rc.width * f, height: rc.height * f }; }
function viewW() { return innerWidth / K.z; }      // viewport width in CSS px of the zoomed root
function viewH() { return innerHeight / K.z; }
