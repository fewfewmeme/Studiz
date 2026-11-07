// «Чек»: the OPEN receipt (it accumulates until it is torn off), the stamp, the tear. Closed receipts live in Дни (stubs) and Архив для Уголка (top parts).
import { h } from './util.js';
import { toast } from './ui.js';
import { downloadBlob } from './util.js';
import { checkPosterUrl, slotSticker } from './assets.js';
import * as ST from './study-store.js';
import * as RS from './receipt-store.js';
import { buildTop, buildBottom, tearLine, stampHalf, jagged, tearPolygon, PAPER_W, STAMP_RATIO, STAMP_SRC } from './receipt-ui.js';
import { maybeEveningBanner } from './receipt-banner.js';

const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// open receipt + lifetime counters as shown on it (lifetime already includes the open receipt)
export async function currentView(sx = 0.5) {
  await ST.initStudy();
  const { payload, code, totals } = RS.buildPayload(sx);
  const life = await RS.getLifetime();
  const days = new Set(life.days); for (const k of RS.daysBetween(payload.d1, payload.d2)) days.add(k);
  const shown = { minutes: life.minutes + totals.totalMin, days: [...days], blocks: life.blocks + payload.b5 + payload.b10, fish: life.fish + payload.f, shrimp: life.shrimp + payload.sh };
  return { payload, code, totals, life: shown };
}

// «Сохранить картинкой»: the top part of the open receipt drawn on a canvas (the same rows as on the screen)
export function receiptToCanvas(topEl) {
  const W = PAPER_W, scale = 2, pad = 20, lh = 20;
  const items = [];
  const walk = el => {
    for (const c of el.children) {
      const cl = c.classList;
      if (cl.contains('rc-exam') || cl.contains('rc-life')) { walk(c); continue; }
      if (cl.contains('rc-tear')) continue;
      if (cl.contains('rc-sep')) items.push({ k: 'sep' });
      else if (cl.contains('rc-row')) items.push({ k: 'row', l: c.querySelector('.rc-l').textContent, r: c.querySelector('.rc-r').textContent, b: cl.contains('rc-bold') });
      else items.push({ k: 'text', t: c.textContent, a: cl.contains('rc-sub') ? 'right' : (cl.contains('rc-h') ? 'left' : 'center'), b: cl.contains('rc-title') || cl.contains('rc-h'), m: cl.contains('rc-muted') || cl.contains('rc-foot') });
    }
  };
  walk(topEl);
  const H = pad + items.length * lh + 14, c = document.createElement('canvas');
  c.width = W * scale; c.height = H * scale;
  const g = c.getContext('2d'); g.scale(scale, scale);
  g.fillStyle = '#fffefb'; g.fillRect(0, 0, W, H); g.textBaseline = 'middle';
  const mono = 'ui-monospace, "SF Mono", Menlo, Consolas, "Courier New", monospace';
  items.forEach((it, i) => {
    const y = pad - 2 + i * lh + lh / 2;
    g.fillStyle = '#1b1b1b';
    if (it.k === 'sep') { g.save(); g.setLineDash([1, 3]); g.strokeStyle = '#1b1b1b'; g.beginPath(); g.moveTo(pad, y); g.lineTo(W - pad, y); g.stroke(); g.restore(); return; }
    g.font = `${(it.b ? '800 ' : '')}${it.m ? 12.5 : 14}px ${mono}`;
    if (it.k === 'row') { g.textAlign = 'left'; g.fillText(it.l, pad, y); g.textAlign = 'right'; g.fillText(it.r, W - pad, y); return; }
    g.fillStyle = it.m ? '#55504a' : '#1b1b1b';
    g.textAlign = it.a; g.fillText(it.t, it.a === 'center' ? W / 2 : it.a === 'right' ? W - pad : pad, y);
  });
  return c;
}

export async function renderCheck(root) {
  root.className = 'view check-view';
  await ST.initStudy();
  const poster = checkPosterUrl();
  const state = { sx: null, placed: false, tearing: false, busy: false };
  const banner = h('div', { class: 'rc-banner', hidden: true });
  const hint = h('p', { class: 'rc-hint', 'aria-live': 'polite' }, '');
  const saveBtn = h('button', { class: 'btn', type: 'button', onclick: save }, 'Сохранить картинкой');
  const stage = h('div', { class: 'rc-wrap' });
  const wrap = h('div', { class: 'content wide' },
    h('header', { class: 'poster-panel', style: poster ? { '--poster': `url("${poster}")` } : {} }, h('p', { class: 'eyebrow' }, 'Итоги учёбы'), h('h1', { class: 'display' }, 'Чек'), slotSticker('checkSticker', 'poster-sticker')),
    banner, stage, hint, h('div', { class: 'row-center' }, saveBtn));
  root.replaceChildren(wrap);
  const cleanups = [];
  const off = ST.subscribe(kind => { if (kind === 'blockDone' && !state.tearing && !state.busy) build(); });
  cleanups.push(off);

  async function save() {
    const top = stage.querySelector('.rc-top'); if (!top) return;
    const blob = await new Promise(res => receiptToCanvas(top).toBlob(res, 'image/png')); if (!blob) return;
    const name = `chek-${new Date().toLocaleDateString('sv-SE')}.png`, file = new File([blob], name, { type: 'image/png' });
    try { if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'Чек учёбы' }); return; } } catch (e) { if (e?.name === 'AbortError') return; }
    downloadBlob(blob, name); toast('Картинка сохранена в загрузки');
  }

  async function build() {
    const empty = ST.isEmpty();
    const v = await currentView(state.sx ?? 0.5);
    state.placed = false; state.tearing = false; state.sx = null;
    const W = PAPER_W, R = Math.round(W * STAMP_RATIO / 2);
    const top = h('div', { class: 'rc-piece top' }), peel = h('div', { class: 'rc-peel' }, top);
    const topBody = buildTop(v.payload, v.life);
    const tl = tearLine();
    topBody.append(tl);
    top.append(topBody);
    const bottom = h('div', { class: 'rc-piece bottom' }, buildBottom({ d1: v.payload.d1, d2: v.payload.d2, minutes: v.totals.totalMin, fish: v.payload.f, shrimp: v.payload.sh }));
    const hit = h('div', { class: 'rc-tear-hit', hidden: true, 'aria-label': 'Линия отрыва' });
    const sheet = h('div', { class: 'rc-sheet' }, peel, bottom, hit);
    const rc = h('div', { class: 'rc', id: 'receipt' }, sheet);
    const tray = h('div', { class: 'rc-tray' });
    stage.replaceChildren(rc, tray);
    // zigzag on the bottom piece (px polygon so it can be combined with the torn top edge)
    const bh = () => bottom.offsetHeight, th = () => top.offsetHeight;
    const flat = () => { bottom.style.clipPath = tearPolygon('top', W, bh(), [0, 0], 0, 0); };
    flat();
    let jag = jagged(Math.round(W / 6));

    if (empty) {
      tray.append(h('p', { class: 'muted', style: { textAlign: 'center' } }, 'Чек пока пуст. Откройте любой файл — таймер пойдёт сам.'));
      hint.textContent = '';
      return;
    }
    // ----- the stamp tool: a hand stamp (handle + plate + inked face). Pick it up anywhere, bring its FACE to the tear line, let go: it presses,
    //       the print appears (ink animation), the tool lifts away. Outside the paper it flies back to the tray. -----
    const FACE = Math.round(W * STAMP_RATIO), FACE_TOP = 78, TOOL_H = FACE_TOP + FACE;     // face 150px under a 78px handle+plate
    const toolEl = () => h('div', { class: 'stamp-drag stamp-tool', role: 'img', 'aria-label': 'Штамп — возьмите и приложите к линии отрыва' },
      h('div', { class: 'st-handle' }), h('div', { class: 'st-plate' }), h('img', { class: 'st-face', src: STAMP_SRC, alt: '', draggable: 'false' }));
    const slot = h('div', { class: 'slot' });
    const ghost = h('div', { class: 'stamp-ghost', hidden: true, 'aria-hidden': 'true' }); ghost.style.width = ghost.style.height = FACE + 'px';
    sheet.append(ghost);
    tray.append(slot, h('button', { class: 'btn btn-quiet btn-sm', type: 'button', hidden: true, id: 'restamp' }, 'Переставить печать'));
    const restampBtn = tray.querySelector('#restamp');
    let drag = null, pressing = false;
    const mountTrayStamp = () => { const s = toolEl(); slot.replaceChildren(s); bindDrag(s); hint.textContent = 'Возьмите штамп, поднесите к линии отрыва и отпустите — он оставит печать. Потом проведите пальцем вдоль линии.'; };
    function placeStamp(x) {
      state.sx = +(x / W).toFixed(2); state.placed = true;
      top.querySelector('.rc-stamp-img')?.remove(); bottom.querySelector('.rc-stamp-img')?.remove();
      const a = stampHalf('top', state.sx, W), b = stampHalf('bottom', state.sx, W);
      top.firstChild.append(a); bottom.firstChild.append(b);
      // the ink: the print lands slightly big and blurred, then settles
      if (!reduceMotion()) for (const el of [a, b]) el.animate([{ opacity: 0, transform: 'scale(1.12)', filter: 'blur(3px)' }, { opacity: 1, transform: 'scale(.985)', filter: 'blur(.6px)', offset: .55 }, { opacity: 1, transform: 'scale(1)', filter: 'none' }], { duration: 320, easing: 'ease-out' });
      hit.hidden = false; hit.style.top = th() + 'px';
      slot.replaceChildren(); restampBtn.hidden = false;
      hint.textContent = 'Теперь проведите пальцем вдоль линии отрыва (в любую сторону).';
    }
    function liftStamp() {
      const imgs = [top.querySelector('.rc-stamp-img'), bottom.querySelector('.rc-stamp-img')].filter(Boolean);
      imgs.forEach(el => { if (reduceMotion()) el.remove(); else el.animate([{ opacity: 1 }, { opacity: 0, transform: 'scale(1.06)' }], { duration: 160, fill: 'forwards' }).finished.then(() => el.remove(), () => el.remove()); });
      state.placed = false; state.sx = null; hit.hidden = true; restampBtn.hidden = true; mountTrayStamp();
    }
    restampBtn.addEventListener('click', () => { if (!state.tearing && !pressing) liftStamp(); });
    // where the stamp FACE would land: its centre = pointer + the grab offset; it only counts near the tear line
    const faceAt = (d, e) => ({ x: e.clientX + d.fx, y: e.clientY + d.fy });
    const lineY = () => sheet.getBoundingClientRect().top + th();
    const nearLine = (f, rr) => Math.abs(f.y - (rr.top + th())) < FACE * 0.7 && f.x > rr.left - FACE * 0.3 && f.x < rr.right + FACE * 0.3;
    function bindDrag(el) {
      el.addEventListener('pointerdown', e => {
        if (state.tearing || pressing || e.button > 0) return;
        e.preventDefault();
        const r = el.getBoundingClientRect();
        // the tool stays where it is (position:fixed at its own place) and moves with a transform: cheap on every frame
        drag = { el, id: e.pointerId, left: r.left, top: r.top, gx: e.clientX, gy: e.clientY, fx: r.left + FACE / 2 - e.clientX, fy: r.top + FACE_TOP + FACE / 2 - e.clientY, slotRect: slot.getBoundingClientRect() };
        el.classList.add('dragging'); el.style.left = r.left + 'px'; el.style.top = r.top + 'px';
        try { el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
        move(e);
      });
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', end); el.addEventListener('pointercancel', e => end(e, true));
    }
    function move(e) {
      if (!drag || e.pointerId !== drag.id) return;
      drag.el.style.transform = `translate(${e.clientX - drag.gx}px, ${e.clientY - drag.gy}px) scale(1.05)`;
      const f = faceAt(drag, e), rr = sheet.getBoundingClientRect(), on = nearLine(f, rr);
      ghost.hidden = !on;
      if (on) { const x = clamp(f.x - rr.left, FACE / 2, W - FACE / 2); ghost.style.left = (x - FACE / 2) + 'px'; ghost.style.top = (th() - FACE / 2) + 'px'; }
    }
    async function end(e, cancelled) {
      if (!drag || e.pointerId !== drag.id) return;
      const d = drag; drag = null; ghost.hidden = true;
      const rr = sheet.getBoundingClientRect(), f = faceAt(d, e), inside = !cancelled && nearLine(f, rr);
      const tx = e.clientX - d.gx, ty = e.clientY - d.gy;
      if (!inside) { await flyBack(d, tx, ty); return; }
      pressing = true;
      const x = clamp(f.x - rr.left, FACE / 2, W - FACE / 2);
      // leave the slot: the tool becomes a free fixed element for the animation
      document.body.append(d.el); slot.replaceChildren();
      if (reduceMotion()) { d.el.remove(); placeStamp(x); pressing = false; return; }
      // 1) glide above the spot (face centre over the line, a little raised)  2) press down  3) the print appears  4) lift away
      const toX = rr.left + x - (d.left + FACE / 2), toY = (rr.top + th() - FACE / 2 - FACE_TOP) - d.top;
      try {
        await d.el.animate([{ transform: `translate(${tx}px, ${ty}px) scale(1.05)` }, { transform: `translate(${toX}px, ${toY - 22}px) scale(1.07)` }], { duration: 170, easing: 'ease-out', fill: 'forwards' }).finished;
        await d.el.animate([{ transform: `translate(${toX}px, ${toY - 22}px) scale(1.07)` }, { transform: `translate(${toX}px, ${toY}px) scale(1)` }], { duration: 110, easing: 'cubic-bezier(.55,0,.9,.45)', fill: 'forwards' }).finished;
        placeStamp(x);
        await new Promise(r => setTimeout(r, 110));
        await d.el.animate([{ transform: `translate(${toX}px, ${toY}px) scale(1)`, opacity: 1 }, { transform: `translate(${toX}px, ${toY - 90}px) scale(1.1)`, opacity: 0 }], { duration: 340, easing: 'ease-out', fill: 'forwards' }).finished;
      } catch { /* interrupted */ }
      d.el.remove();
      if (!state.placed) placeStamp(x);
      pressing = false;
    }
    async function flyBack(d, tx, ty) {
      const s = slot.getBoundingClientRect();
      if (!reduceMotion()) { try { await d.el.animate([{ transform: `translate(${tx}px, ${ty}px) scale(1.05)` }, { transform: `translate(${s.left - d.left}px, ${s.top - d.top}px) scale(1)` }], { duration: 230, easing: 'cubic-bezier(.3,.8,.3,1)', fill: 'forwards' }).finished; } catch { /* ignore */ } }
      d.el.classList.remove('dragging'); d.el.style.cssText = ''; d.el.getAnimations?.().forEach(a => a.cancel());
    }
    mountTrayStamp();

    // ----- tear -----
    let g = null, raf = 0, healing = 0;
    const apply = (a, b, p, fromLeft) => {
      const H1 = th(), H2 = bh();
      top.style.clipPath = p > 0 ? tearPolygon('bottom', W, H1, jag, a, b) : '';
      bottom.style.clipPath = tearPolygon('top', W, H2, jag, p > 0 ? a : 0, p > 0 ? b : 0);
      // only the transform changes per frame (a blurred box-shadow that changed every frame was repainted at 60 fps on the iPad: that was the tremble)
      if (peel.dataset.o !== (fromLeft ? 'l' : 'r')) { peel.dataset.o = fromLeft ? 'l' : 'r'; peel.style.transformOrigin = fromLeft ? 'right bottom' : 'left bottom'; }
      peel.style.transform = p > 0 ? `rotate(${(fromLeft ? 1 : -1) * p * 10}deg) translateY(${-p * 6}px)` : '';
      if (p > 0 && !peel.dataset.sh) { peel.dataset.sh = '1'; peel.style.willChange = 'transform'; peel.style.boxShadow = '0 8px 18px rgba(0,0,0,.24)'; }
      else if (p <= 0 && peel.dataset.sh) { delete peel.dataset.sh; peel.style.willChange = ''; peel.style.boxShadow = ''; }
    };
    hit.addEventListener('pointerdown', e => {
      if (state.busy || !state.placed) return;
      e.preventDefault();
      const r = hit.getBoundingClientRect();
      g = { id: e.pointerId, x0: e.clientX - r.left, a: e.clientX - r.left, b: e.clientX - r.left, last: e.clientX - r.left, left: (e.clientX - r.left) < W / 2 };
      state.tearing = true; restampBtn.hidden = true; jag = jagged(Math.round(W / 6));
      try { hit.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      hint.textContent = '';
    });
    hit.addEventListener('pointermove', e => {
      if (!g || e.pointerId !== g.id) return;
      g.last = clamp(e.clientX - hit.getBoundingClientRect().left, 0, W); g.a = Math.min(g.a, g.last); g.b = Math.max(g.b, g.last);
      if (!raf) raf = requestAnimationFrame(() => { raf = 0; if (g) apply(g.a, g.b, clamp((g.b - g.a) / W, 0, 1), g.left); });
    });
    const release = e => {
      if (!g || e.pointerId !== g.id) return;
      const s = g; g = null; cancelAnimationFrame(raf); raf = 0;
      const p = clamp((s.b - s.a) / W, 0, 1);
      if (p >= 0.5 || p >= 0.9) finish(s); else heal(s, p);
    };
    hit.addEventListener('pointerup', release); hit.addEventListener('pointercancel', release);
    function tween(ms, fn) { return new Promise(res => { const t0 = performance.now(); const step = n => { const k = clamp((n - t0) / ms, 0, 1); fn(k); if (k < 1) requestAnimationFrame(step); else res(); }; requestAnimationFrame(step); }); }
    async function heal(s, p0) {
      healing++; const ms = reduceMotion() ? 1 : 260;
      await tween(ms, k => { const f = 1 - k, b = s.a + (s.b - s.a) * f; apply(s.a, b, p0 * f, s.left); });
      apply(0, 0, 0, s.left); top.style.clipPath = ''; flat(); state.tearing = false; restampBtn.hidden = false; healing--;
      hint.textContent = 'Не дотянули до середины — чек склеился. Проведите ещё раз.';
    }
    async function finish(s) {
      state.busy = true; hit.hidden = true;
      let res = null;
      try { res = await RS.tearOff(state.sx); } catch (err) { state.busy = false; state.tearing = false; hit.hidden = false; toast('Не получилось закрыть чек: ' + (err.message || err), { error: true }); heal(s, clamp((s.b - s.a) / W, 0, 1)); return; }
      const p0 = clamp((s.b - s.a) / W, 0, 1), ms = reduceMotion() ? 1 : 450;
      await tween(ms, k => {
        const a = s.a + (0 - s.a) * k, b = s.b + (W - s.b) * k, p = p0 + (1 - p0) * k;
        apply(a, b, p, s.left);
        peel.style.transform = `translateY(${-k * 140}px) rotate(${(s.left ? 1 : -1) * (p * 10 + k * 14)}deg)`; peel.style.opacity = String(1 - k);
      });
      peel.remove();
      bottom.style.transition = 'transform 260ms ease-out'; bottom.style.transform = 'translateY(0)';
      toast('Чек закрыт. Код для Уголка — в «Архиве».', { ms: 3600 });
      state.busy = false; state.sx = null;
      setTimeout(() => build(), reduceMotion() ? 0 : 600);
      void res;
    }
    cleanups.push(() => { cancelAnimationFrame(raf); });
  }

  await build();
  maybeEveningBanner(banner, () => { stage.scrollIntoView?.({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'center' }); }, () => !ST.isEmpty());
  return () => { cleanups.forEach(f => { try { f(); } catch { /* ignore */ } }); };
}
