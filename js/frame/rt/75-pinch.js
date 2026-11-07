// ===== pinch inside the document: cheap transform preview during the gesture, ONE layout on release =====
var PINCH = null;
var STEPS = [50, 55, 60, 65, 70, 75, 80, 85, 90, 100, 110, 125, 150, 175, 200];
function nearestStep(z) { var b = STEPS[0]; for (var i = 0; i < STEPS.length; i++) if (Math.abs(STEPS[i] - z) < Math.abs(b - z)) b = STEPS[i]; return b; }
function dist(t) { return Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY); }
function watchPinch() {
  R.style.touchAction = VIEW === 'book' ? 'pan-y' : 'pan-x pan-y';   // Книга: a horizontal swipe belongs to the page turn, never to the browser's pan
  ['gesturestart', 'gesturechange', 'gestureend'].forEach(function (ev) { D.addEventListener(ev, function (e) { e.preventDefault(); }, { passive: false }); });   // Safari's own pinch
  D.addEventListener('touchstart', function (e) { if (e.touches.length === 2) { PINCH = { d0: dist(e.touches), s: 1, cx: (e.touches[0].clientX + e.touches[1].clientX) / 2, cy: (e.touches[0].clientY + e.touches[1].clientY) / 2 }; if (e.cancelable) e.preventDefault(); } else if (e.touches.length > 2 && e.cancelable) e.preventDefault(); }, { passive: false });
  D.addEventListener('touchmove', function (e) {
    if (e.touches.length < 2 && !PINCH) return;
    if (e.cancelable) e.preventDefault();
    if (!PINCH || e.touches.length < 2) return;
    var s = clamp(dist(e.touches) / (PINCH.d0 || 1), 0.4, 6); PINCH.s = s;
    var ox = PINCH.cx / (K.r || 1), oy = PINCH.cy / (K.r || 1);
    R.style.transformOrigin = ox + 'px ' + oy + 'px'; R.style.transform = 'scale(' + s + ')';        // preview only: no layout
  }, { passive: false });
  var end = function (e) {
    if (!PINCH) return; if (e.touches && e.touches.length >= 2) return;
    var s = PINCH.s; PINCH = null;
    R.style.transform = ''; R.style.transformOrigin = '';
    if (Math.abs(s - 1) < 0.03) return;
    var target = S.zoom * s, z = pagesDoc() ? clamp(Math.round(target), 50, 400) : nearestStep(clamp(target, 50, 200));
    if (z === S.zoom) return;
    var a = pagesDoc() || VIEW === 'book' ? null : currentAnchor();
    S.zoom = z; relayoutAll(); if (a) gotoAnchor(a);
    post('pinchzoom', { z: z });
  };
  D.addEventListener('touchend', end, { passive: true }); D.addEventListener('touchcancel', end, { passive: true });
}
