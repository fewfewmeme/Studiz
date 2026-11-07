// Image lightbox with pinch zoom, pan and double-tap. Pinch is only for images (text zoom is a font-size variable).
import { h, clamp } from '../util.js';
import { icon } from '../icons.js';

export function openLightbox(src, alt = '') {
  const img = h('img', { class: 'lb-img', src, alt, draggable: 'false' });
  const close = h('button', { class: 'ibtn lb-close', type: 'button', 'aria-label': 'Закрыть' }, icon('x', 22));
  const box = h('div', { class: 'lb-wrap', role: 'dialog', 'aria-label': 'Картинка', 'aria-modal': 'true' }, img, close);
  document.body.append(box);
  let s = 1, tx = 0, ty = 0; const pts = new Map(); let d0 = 0, s0 = 1, lastTap = 0, moved = false;
  const apply = () => { img.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`; };
  const reset = () => { s = 1; tx = ty = 0; apply(); };
  const end = () => { box.remove(); document.removeEventListener('keydown', key); };
  const key = e => { if (e.key === 'Escape') end(); };
  document.addEventListener('keydown', key);
  close.addEventListener('click', e => { e.stopPropagation(); end(); });
  box.addEventListener('pointerdown', e => { pts.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY }); moved = false; if (pts.size === 2) { const [a, b] = [...pts.values()]; d0 = Math.hypot(a.x - b.x, a.y - b.y) || 1; s0 = s; } box.setPointerCapture?.(e.pointerId); });
  box.addEventListener('pointermove', e => {
    const p = pts.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
    if (Math.hypot(e.clientX - p.sx, e.clientY - p.sy) > 6) moved = true;
    if (pts.size >= 2) { const [a, b] = [...pts.values()]; s = clamp(s0 * Math.hypot(a.x - b.x, a.y - b.y) / d0, 1, 6); }
    else if (s > 1) { tx += dx; ty += dy; }
    apply();
  });
  const up = e => {
    const had = pts.delete(e.pointerId);
    if (!had || moved || pts.size) { if (s <= 1.02) reset(); return; }
    const now = performance.now();
    if (now - lastTap < 320) { if (s > 1.2) reset(); else { s = 2.5; apply(); } lastTap = 0; return; }
    lastTap = now;
    setTimeout(() => { if (lastTap && performance.now() - lastTap >= 320 && s <= 1.02 && e.target === box) end(); }, 340);
  };
  box.addEventListener('pointerup', up); box.addEventListener('pointercancel', up);
  box.addEventListener('wheel', e => { e.preventDefault(); s = clamp(s * Math.exp(-e.deltaY * 0.002), 1, 6); if (s === 1) { tx = ty = 0; } apply(); }, { passive: false });
  box.addEventListener('gesturestart', e => e.preventDefault());
  return end;
}
