// Safari's own page zoom (pinch / double tap) is remembered per page, also across reloads. If it is above 1 the visual viewport is smaller than
// the layout viewport: the reader looked cut off on the right with an empty strip below the controls. user-scalable=no is ignored by iOS, so the
// zoom is undone here: re-applying the viewport meta with scale locked to 1 makes Safari drop it.
let busy = false;
export function pageScale() { return window.visualViewport ? window.visualViewport.scale : 1; }
export function resetPageZoom() {
  if (busy || pageScale() <= 1.02) return false;
  const meta = document.querySelector('meta[name=viewport]'); if (!meta) return false;
  busy = true;
  const orig = meta.getAttribute('content');
  meta.setAttribute('content', 'width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover, interactive-widget=resizes-content');
  setTimeout(() => { meta.setAttribute('content', orig); busy = false; }, 350);
  return true;
}
// at boot and whenever the visual viewport changes
export function watchPageZoom() {
  resetPageZoom();
  window.visualViewport?.addEventListener('resize', resetPageZoom);
  addEventListener('pageshow', resetPageZoom);
}
