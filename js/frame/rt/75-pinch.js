// ===== pinch inside the document: cheap transform preview during the gesture, ONE layout on release =====
var PINCH = null;
var STEPS = [50, 55, 60, 65, 70, 75, 80, 85, 90, 100, 110, 125, 150, 175, 200];
function nearestStep(z) { var b = STEPS[0]; for (var i = 0; i < STEPS.length; i++) if (Math.abs(STEPS[i] - z) < Math.abs(b - z)) b = STEPS[i]; return b; }
function dist(t) { return Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY); }
function watchPinch() {
  R.style.touchAction = VIEW === 'book' ? 'pan-y' : 'pan-x pan-y';   // Книга: a horizontal swipe belongs to the page turn, never to the browser's pan
  ['gesturestart', 'gesturechange', 'gestureend'].forEach(function (ev) { D.addEventListener(ev, function (e) { e.preventDefault(); }, { passive: false }); });   // Safari's own pinch
  // A pinch that never got its end (the finger left the frame, a system gesture, the page was hidden) used to leave PINCH set: from then on every
  // one-finger touchmove was preventDefault()ed and the document would not scroll at all. Now a pinch is dropped as soon as only one finger is
  // left, when a new one-finger touch starts, and after 2.5 s without a move; a single finger never has its scroll cancelled.
  var PINCH_T = 0;
  function pinchReset() { PINCH = null; clearTimeout(PINCH_T); R.style.transform = ''; R.style.transformOrigin = ''; }
  D.addEventListener('touchstart', function (e) {
    if (e.touches.length === 2) {
      var sc = scrollEl();
      PINCH = { d0: dist(e.touches), s: 1, z0: S.zoom || 100, cx: (e.touches[0].clientX + e.touches[1].clientX) / 2, cy: (e.touches[0].clientY + e.touches[1].clientY) / 2, sl: sc.scrollLeft, st: sc.scrollTop };
      clearTimeout(PINCH_T); PINCH_T = setTimeout(pinchReset, 2500);
      if (e.cancelable) e.preventDefault();
    } else if (e.touches.length > 2) { if (e.cancelable) e.preventDefault(); }
    else if (PINCH) pinchReset();
  }, { passive: false });
  D.addEventListener('touchmove', function (e) {
    if (!PINCH) { if (e.touches.length > 2 && e.cancelable) e.preventDefault(); return; }
    if (e.touches.length < 2) { pinchReset(); return; }            // one finger left: the pinch is over, scrolling stays with the browser
    if (e.cancelable) e.preventDefault();
    clearTimeout(PINCH_T); PINCH_T = setTimeout(pinchReset, 2500);
    // the preview never goes beyond what the release can really apply (50 % .. 200 %, pages 400 %): no more «300 %» that snaps back
    var lo = 50 / PINCH.z0, hi = (pagesDoc() ? 400 : 200) / PINCH.z0;
    var s = clamp(dist(e.touches) / (PINCH.d0 || 1), Math.min(lo, 1), Math.max(hi, 1)); PINCH.s = s;
    // the scale origin is a point of the DOCUMENT (viewport position + scroll offset), not of the viewport: from the middle of a long text the
    // old origin (the viewport coordinates) was the top of the page, so the text flew away from under the fingers
    var ox = (PINCH.sl + PINCH.cx) / (K.r || 1), oy = (PINCH.st + PINCH.cy) / (K.r || 1);
    R.style.transformOrigin = ox + 'px ' + oy + 'px'; R.style.transform = 'scale(' + s + ')';        // preview only: no layout
  }, { passive: false });
  var end = function (e) {
    if (!PINCH) return; if (e.touches && e.touches.length >= 2) return;
    var s = PINCH.s, z0 = PINCH.z0; clearTimeout(PINCH_T); PINCH = null;
    R.style.transform = ''; R.style.transformOrigin = '';
    if (Math.abs(s - 1) < 0.03) return;
    var target = z0 * s, z = pagesDoc() ? clamp(Math.round(target), 50, 400) : nearestStep(clamp(target, 50, 200));
    if (z === S.zoom) return;
    var a = pagesDoc() || VIEW === 'book' ? null : currentAnchor();
    S.zoom = z; relayoutAll(); if (a) gotoAnchor(a);
    post('pinchzoom', { z: z });
  };
  addEventListener('pagehide', pinchReset); document.addEventListener('visibilitychange', function () { if (D.visibilityState === 'hidden') pinchReset(); });
  D.addEventListener('touchend', end, { passive: true }); D.addEventListener('touchcancel', end, { passive: true });
}
