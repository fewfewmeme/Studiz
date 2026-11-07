// Pinch-to-zoom + double-tap for the reader. While the fingers move only a CSS transform changes (cheap);
// on release `commit(factor, cx, cy)` lets the document re-layout / re-render crisply.
//   bindZoom(host, { target(): element to scale live, current(): number, commit(newZoom, cx, cy), onDouble(cx, cy), enabled(): bool })
import { clamp } from '../util.js';

export function bindZoom(host, o) {
  let live = null;
  const apply = (scale, cx, cy) => {
    const t = o.target(); if (!t) return;
    const r = host.getBoundingClientRect();
    t.style.transformOrigin = `${cx - r.left + host.scrollLeft}px ${cy - r.top + host.scrollTop}px`;
    t.style.transform = `scale(${scale})`;
  };
  const end = () => {
    if (!live) return;
    const l = live; live = null;
    const t = o.target(); if (t) { t.style.transform = ''; t.style.transformOrigin = ''; }
    const z = clamp(l.z0 * l.scale, o.min ?? 0.6, o.max ?? 3);
    if (Math.abs(z - l.z0) > 0.01) o.commit(z, l.cx, l.cy);
  };
  const begin = (cx, cy) => { live = { z0: o.current(), scale: 1, cx, cy }; };
  const move = (scale, cx, cy) => {
    if (!live) return;
    const lo = (o.min ?? 0.6) / live.z0, hi = (o.max ?? 3) / live.z0;
    live.scale = clamp(scale, lo, hi); live.cx = cx; live.cy = cy;
    apply(live.scale, cx, cy);
  };
  // Safari: gesture events
  const gs = e => { if (!o.enabled()) return; e.preventDefault(); begin(e.clientX ?? host.clientWidth / 2, e.clientY ?? host.clientHeight / 2); };
  const gc = e => { if (!live) return; e.preventDefault(); move(e.scale, e.clientX ?? live.cx, e.clientY ?? live.cy); };
  const ge = e => { if (!live) return; e.preventDefault(); end(); };
  host.addEventListener('gesturestart', gs); host.addEventListener('gesturechange', gc); host.addEventListener('gestureend', ge);
  // everything else: two touch pointers
  const pts = new Map();
  let d0 = 0, viaPointers = false;
  const dist = () => { const a = [...pts.values()]; return Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y); };
  const mid = () => { const a = [...pts.values()]; return [(a[0].x + a[1].x) / 2, (a[0].y + a[1].y) / 2]; };
  const pd = e => {
    if (e.pointerType !== 'touch' || !o.enabled()) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2 && !live) { viaPointers = true; d0 = dist() || 1; const [cx, cy] = mid(); begin(cx, cy); }
  };
  const pm = e => {
    const p = pts.get(e.pointerId); if (!p) return;
    p.x = e.clientX; p.y = e.clientY;
    if (viaPointers && live && pts.size >= 2) { const [cx, cy] = mid(); move(dist() / d0, cx, cy); e.preventDefault?.(); }
  };
  const pu = e => {
    if (!pts.delete(e.pointerId)) return;
    if (viaPointers && live && pts.size < 2) { viaPointers = false; end(); }
  };
  host.addEventListener('pointerdown', pd); host.addEventListener('pointermove', pm, { passive: false });
  host.addEventListener('pointerup', pu); host.addEventListener('pointercancel', pu);
  // double tap = fit width
  let last = null;
  const tapUp = e => {
    if (e.pointerType === 'mouse' && e.detail < 2) { /* mouse uses dblclick below */ }
    if (!o.enabled() || e.pointerType !== 'touch' || pts.size) return;
    const now = performance.now();
    if (last && now - last.t < 320 && Math.hypot(e.clientX - last.x, e.clientY - last.y) < 28) { last = null; const sel = getSelection(); if (sel && !sel.isCollapsed) return; o.onDouble?.(e.clientX, e.clientY); return; }
    last = { t: now, x: e.clientX, y: e.clientY };
  };
  host.addEventListener('pointerup', tapUp);
  const dbl = e => { if (o.enabled() && e.pointerType !== 'touch') { const sel = getSelection(); if (sel && !sel.isCollapsed) return; } };
  host.addEventListener('dblclick', dbl);
  // trackpad / ctrl+wheel pinch (desktop)
  const wheel = e => {
    if (!e.ctrlKey || !o.enabled()) return;
    e.preventDefault();
    if (!live) begin(e.clientX, e.clientY);
    move((live.scale) * Math.exp(-e.deltaY * 0.01), e.clientX, e.clientY);
    clearTimeout(wheel.t); wheel.t = setTimeout(end, 140);
  };
  host.addEventListener('wheel', wheel, { passive: false });
  return () => {
    host.removeEventListener('gesturestart', gs); host.removeEventListener('gesturechange', gc); host.removeEventListener('gestureend', ge);
    host.removeEventListener('pointerdown', pd); host.removeEventListener('pointermove', pm); host.removeEventListener('pointerup', pu); host.removeEventListener('pointercancel', pu); host.removeEventListener('pointerup', tapUp);
    host.removeEventListener('dblclick', dbl); host.removeEventListener('wheel', wheel);
  };
}
