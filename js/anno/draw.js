// Drawing layer shared by PDF pages, images and the HTML "normal" mode.
// Coordinates are normalised: x in [0,1] of the layer width, y in units of the layer WIDTH (legacy v1 records
// carry yu:'h' = units of height). Pen strokes are pressure-aware filled outlines; brush strokes are one
// full-alpha path per colour, shown with opacity + multiply so overlaps never darken and text stays crisp.
import { clamp, h, escapeHtml } from '../util.js';
import { settings } from '../settings.js';

const NS = 'http://www.w3.org/2000/svg';
const svgEl = (n, a) => { const e = document.createElementNS(NS, n); for (const k in a) e.setAttribute(k, a[k]); return e; };

export const BRUSH_OPACITY = 0.55;

// Soft pressure curve: width = base * (0.6 + 0.4 * pressure^0.7), never thinner than 40% of the base; round caps;
// the outline is smoothed with quadratic curves through the midpoints, so ends are round, not leaf-shaped.
export const penWidthAt = (base, p) => Math.max(0.4 * base, base * (0.6 + 0.4 * Math.pow(Math.max(0, Math.min(1, p ?? 0.5)), 0.7)));
export function outlinePath(pts, baseW) {
  // pts: [[x,y,p]] in user units
  const f = n => n.toFixed(1);
  if (!pts.length) return '';
  const wAt = p => penWidthAt(baseW, p) / 2;
  if (pts.length === 1) { const [x, y, p] = pts[0], r = wAt(p); return `M${f(x - r)} ${f(y)}a${f(r)} ${f(r)} 0 1 0 ${f(2 * r)} 0a${f(r)} ${f(r)} 0 1 0 ${f(-2 * r)} 0z`; }
  // pressure smoothing over 5 points; the first/last points take the width of their neighbours so caps stay round
  const pr = i => pts[Math.max(0, Math.min(pts.length - 1, i))][2] ?? 0.5;
  const P = pts.map((q, i) => [q[0], q[1], (pr(i - 2) + pr(i - 1) * 2 + pr(i) * 3 + pr(i + 1) * 2 + pr(i + 2)) / 9]);
  const L = [], Rr = [];
  for (let i = 0; i < P.length; i++) {
    const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)];
    let dx = b[0] - a[0], dy = b[1] - a[1]; const len = Math.hypot(dx, dy) || 1; dx /= len; dy /= len;
    const w = wAt(P[i][2]);
    L.push([P[i][0] - dy * w, P[i][1] + dx * w]); Rr.push([P[i][0] + dy * w, P[i][1] - dx * w]);
  }
  const side = A => { let d = ''; for (let i = 1; i < A.length - 1; i++) { const mx = (A[i][0] + A[i + 1][0]) / 2, my = (A[i][1] + A[i + 1][1]) / 2; d += `Q${f(A[i][0])} ${f(A[i][1])} ${f(mx)} ${f(my)}`; } return d + `L${f(A[A.length - 1][0])} ${f(A[A.length - 1][1])}`; };
  const rw = wAt(P[P.length - 1][2]), lw = wAt(P[0][2]);
  const Rrev = [...Rr].reverse();
  return `M${f(L[0][0])} ${f(L[0][1])}${side(L)}A${f(rw)} ${f(rw)} 0 0 1 ${f(Rr[Rr.length - 1][0])} ${f(Rr[Rr.length - 1][1])}${side(Rrev)}A${f(lw)} ${f(lw)} 0 0 1 ${f(L[0][0])} ${f(L[0][1])}z`;
}
export function linePath(pts) {
  const f = n => n.toFixed(1);
  if (pts.length === 1) return `M${f(pts[0][0])} ${f(pts[0][1])}l0.01 0`;
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 1; i < pts.length - 1; i++) d += `Q${f(pts[i][0])} ${f(pts[i][1])} ${f((pts[i][0] + pts[i + 1][0]) / 2)} ${f((pts[i][1] + pts[i + 1][1]) / 2)}`;
  const l = pts[pts.length - 1];
  return d + `L${f(l[0])} ${f(l[1])}`;
}
function distSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const t = dx || dy ? clamp(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy), 0, 1) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

export class DrawLayer {
  // opts: store, page, tools (observable), scroller() -> element to scroll with a finger, onTouch()
  constructor(opts) {
    Object.assign(this, opts);
    this.W = 1000; this.H = 1414;
    this.under = h('div', { class: 'dl-under' });
    this.brushSvg = svgEl('svg', { class: 'dl-brush', preserveAspectRatio: 'none' });
    this.penSvg = svgEl('svg', { class: 'dl-pen', preserveAspectRatio: 'none' });
    this.hit = h('div', { class: 'dl-hit' });
    this.objs = h('div', { class: 'dl-objs' });
    this.over = h('div', { class: 'dl-over' }, this.brushSvg, this.penSvg, this.hit, this.objs);
    this.bindInput();
    this.setSize(this.W, this.H);
  }
  setSize(W, H) {
    this.W = W || 1; this.H = H || 1;
    const vb = `0 0 1000 ${(1000 * this.H / this.W).toFixed(2)}`;
    this.brushSvg.setAttribute('viewBox', vb); this.penSvg.setAttribute('viewBox', vb);
    this.over.style.setProperty('--lw', this.W + 'px');
    this.render();
  }
  yUnit(r) { return r.yu === 'h' ? this.H / this.W : 1; }
  toU(r, x, y) { return [x * 1000, y * this.yUnit(r) * 1000]; }
  recs() { return this.store.filter(r => (r.page ?? 1) === this.page); }

  render() {
    const recs = this.recs();
    this.under.replaceChildren(); this.penSvg.replaceChildren(); this.brushSvg.replaceChildren(); this.objs.replaceChildren();
    const groups = new Map();
    for (const r of recs) {
      if (r.img && (r.type === 'pen' || r.type === 'brush')) continue;     // strokes drawn ON an image live in the image's own coordinates (HtmlDoc.paintAnchored)
      if (r.type === 'hl') { if (!this.canvasPaint) this.renderRects(r); }
      else if (r.type === 'ul' || r.type === 'strike' || r.type === 'note') this.renderRects(r);
      else if (r.type === 'pen') this.penSvg.append(this.penEl(r));
      else if (r.type === 'brush') { if (!this.canvasPaint) this.brushGroup(groups, r.color).append(this.brushEl(r)); }
      else if (r.type === 'text') this.objs.append(this.textBox(r));
      else if (r.type === 'photo') this.objs.append(this.photoBox(r));
    }
    this.canvasPaint?.(recs);   // PDF/image pages paint highlights + brush into the page bitmap (multiply, text stays black)
  }
  renderRects(r) {
    const k = this.yUnit(r) * this.W / this.H;     // y fraction of layer height
    const col = !r.color ? 'var(--accent)' : /^m[1-6]$/.test(r.color) ? `var(--mark-${r.color.slice(1)})` : r.color;
    const rects = r.rects || [];
    rects.forEach((q, i) => {
      const cls = r.type === 'hl' ? 'hl-rect' : r.type === 'strike' ? 'st-rect' : r.type === 'note' ? 'ul-rect note-rect' : 'ul-rect';
      const d = h('div', { class: cls, 'data-id': r.id });
      Object.assign(d.style, { left: q[0] * 100 + '%', top: q[1] * k * 100 + '%', width: q[2] * 100 + '%', height: q[3] * k * 100 + '%' });
      if (r.type === 'hl') d.style.background = col;
      else if (r.type === 'strike') d.style.borderTopColor = col;
      else { d.style.borderBottomColor = col; d.style.borderBottomStyle = r.type === 'note' ? 'dotted' : (r.ulStyle === 'wavy' ? 'dotted' : (r.ulStyle || 'solid')); }
      this.under.append(d);
      if (r.type === 'note' && i === rects.length - 1) {
        const chip = h('button', { class: 'note-chip', 'data-id': r.id, 'aria-label': 'Заметка', type: 'button' }, '✎');
        Object.assign(chip.style, { left: (q[0] + q[2]) * 100 + '%', top: q[1] * k * 100 + '%' });
        chip.addEventListener('click', e => { e.stopPropagation(); this.onMarkTap?.([r.id], chip.getBoundingClientRect(), true); });
        this.objs.append(chip);
      }
    });
  }
  brushGroup(groups, color) {
    let g = groups.get(color);
    if (!g) { g = svgEl('g', { opacity: BRUSH_OPACITY, style: 'mix-blend-mode:multiply' }); groups.set(color, g); this.brushSvg.append(g); }
    return g;
  }
  penEl(r) {
    const pts = (r.points || []).map(p => [...this.toU(r, p[0], p[1]), p[2]]);
    const p = svgEl('path', { d: outlinePath(pts, r.width || 4), fill: r.color });
    p.dataset.id = r.id;
    return p;
  }
  brushEl(r) {
    const pts = (r.points || []).map(p => this.toU(r, p[0], p[1]));
    const p = svgEl('path', { d: linePath(pts), fill: 'none', stroke: r.color, 'stroke-width': r.width || 22, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
    p.dataset.id = r.id;
    return p;
  }

  // ---- text boxes and photos ----
  box(r, inner, extra) {
    const Y = this.yUnit(r) * this.W;
    const b = h('div', { class: 'pg-obj ' + (r.type === 'text' ? 'tbox' : 'pobj'), 'data-id': r.id });
    b.style.left = r.x * this.W + 'px'; b.style.top = r.y * Y + 'px'; b.style.width = r.w * this.W + 'px';
    if (r.rot) b.style.transform = `rotate(${r.rot}deg)`;
    const drag = h('button', { class: 'obj-btn obj-drag', 'aria-label': 'Переместить', type: 'button' }, '✥');
    const del = h('button', { class: 'obj-btn obj-del', 'aria-label': 'Удалить', type: 'button' }, '✕');
    const size = h('div', { class: 'obj-resize', 'aria-label': 'Размер' });
    b.append(inner, h('div', { class: 'obj-ctl' }, drag, ...(extra || []), del), size);
    b.addEventListener('pointerdown', () => this.select(b));
    const store = this.store;
    drag.addEventListener('pointerdown', e => {
      e.preventDefault(); e.stopPropagation(); drag.setPointerCapture(e.pointerId);
      const rect = this.over.getBoundingClientRect(), sc = rect.width / this.W;
      const sx = e.clientX, sy = e.clientY, ox = r.x, oy = r.y;
      let nx = ox, ny = oy;
      const mv = ev => { nx = clamp(ox + (ev.clientX - sx) / sc / this.W, 0, 1 - r.w); ny = Math.max(0, oy + (ev.clientY - sy) / sc / Y); b.style.left = nx * this.W + 'px'; b.style.top = ny * Y + 'px'; };
      const up = () => { drag.removeEventListener('pointermove', mv); drag.removeEventListener('pointerup', up); drag.removeEventListener('pointercancel', up); if (nx !== ox || ny !== oy) store.update(r.id, { x: nx, y: ny }); };
      drag.addEventListener('pointermove', mv); drag.addEventListener('pointerup', up); drag.addEventListener('pointercancel', up);
    });
    size.addEventListener('pointerdown', e => {
      e.preventDefault(); e.stopPropagation(); size.setPointerCapture(e.pointerId);
      const rect = this.over.getBoundingClientRect(), sc = rect.width / this.W;
      const sx = e.clientX, ow = r.w; let nw = ow;
      const mv = ev => { nw = clamp(ow + (ev.clientX - sx) / sc / this.W, 0.06, 1 - r.x); b.style.width = nw * this.W + 'px'; };
      const up = () => { size.removeEventListener('pointermove', mv); size.removeEventListener('pointerup', up); size.removeEventListener('pointercancel', up); if (nw !== ow) store.update(r.id, { w: nw }); };
      size.addEventListener('pointermove', mv); size.addEventListener('pointerup', up); size.addEventListener('pointercancel', up);
    });
    del.addEventListener('click', () => store.remove(r.id));
    return b;
  }
  textBox(r) {
    const ed = h('div', { class: 'tbox-text', contenteditable: 'true', spellcheck: 'false', role: 'textbox', 'aria-label': 'Текстовый блок' });
    ed.innerHTML = r.html || '';
    ed.style.fontSize = `calc(var(--lw) * ${r.fs || 0.028})`;
    ed.style.color = r.color || '#26212b';
    let before = r.html || '';
    ed.addEventListener('focus', () => { before = r.html || ''; });
    ed.addEventListener('paste', e => { e.preventDefault(); document.execCommand('insertText', false, e.clipboardData?.getData('text/plain') || ''); });
    ed.addEventListener('blur', () => {
      const t = ed.innerText.replace(/ /g, ' ').replace(/\n+$/, '');
      if (!t.trim()) { if (!this.store.cancelAdd(r.id)) this.store.remove(r.id); return; }
      const html = escapeHtml(t).replace(/\n/g, '<br>');
      if (html !== before) this.store.update(r.id, { html });
    });
    const sm = h('button', { class: 'obj-btn', type: 'button', 'aria-label': 'Мельче' }, 'A−');
    const bg = h('button', { class: 'obj-btn', type: 'button', 'aria-label': 'Крупнее' }, 'A+');
    const fsz = d => { const fs = clamp((r.fs || 0.028) * d, 0.012, 0.09); ed.style.fontSize = `calc(var(--lw) * ${fs})`; this.store.update(r.id, { fs }); r.fs = fs; };
    sm.addEventListener('click', () => fsz(0.88)); bg.addEventListener('click', () => fsz(1.14));
    return this.box(r, ed, [sm, bg]);
  }
  photoBox(r) {
    const img = h('img', { class: 'pobj-img', alt: 'Фото', draggable: 'false' });
    this.photoUrl?.(r.blobKey).then(u => { if (u) img.src = u; });
    return this.box(r, img);
  }
  select(b) { this.over.querySelectorAll('.pg-obj.sel').forEach(x => { if (x !== b) x.classList.remove('sel'); }); b?.classList.add('sel'); }
  focusObj(id) { const ed = this.objs.querySelector(`[data-id="${id}"] .tbox-text`); if (ed) { this.select(ed.closest('.pg-obj')); ed.focus(); } }

  // ---- input ----
  point(e) {
    const r = this.over.getBoundingClientRect();
    return [clamp((e.clientX - r.left) / r.width, 0, 1), Math.max(0, (e.clientY - r.top) / r.width)];
  }
  active() { const t = this.tools; return t.drawing(); }
  bindInput() {
    const hit = this.hit;
    let st = null;
    const fingerOk = e => e.pointerType !== 'touch' || settings().drawWithFinger;
    hit.addEventListener('pointerdown', e => {
      const tools = this.tools, tool = tools.drawTool();
      if (!tool) return;
      this.onTouch?.(e);
      if (tool === 'text') { st = { text: true, x: e.clientX, y: e.clientY }; return; }
      if (!fingerOk(e)) { st = { scroll: true, x: e.clientX, y: e.clientY }; hit.setPointerCapture(e.pointerId); return; }
      e.preventDefault(); hit.setPointerCapture(e.pointerId);
      if (tool === 'eraser') { st = { eraser: true, ids: new Set(), size: tools.eraserSize() }; this.erase(this.point(e), st); return; }
      const a = tool === 'pen'
        ? { type: 'pen', color: tools.penColor(), width: tools.penWidth(), points: [[...this.point(e), e.pressure || 0.5]] }
        : { type: 'brush', color: tools.brushColor(), width: tools.brushWidth(), points: [[...this.point(e), 0.5]] };
      const el = a.type === 'pen' ? this.penEl(a) : this.brushEl(a);
      if (a.type === 'pen') this.penSvg.append(el);
      else { let g = [...this.brushSvg.children].find(c => c.dataset.col === a.color); if (!g) { g = svgEl('g', { opacity: BRUSH_OPACITY, style: 'mix-blend-mode:multiply' }); g.dataset.col = a.color; this.brushSvg.append(g); } g.append(el); }
      st = { stroke: a, el, pen: a.type === 'pen' };
      this.drawLive(st);
    });
    hit.addEventListener('pointermove', e => {
      if (!st) return;
      if (st.scroll) { const sc = this.scroller?.(); sc?.scrollBy(st.x - e.clientX, st.y - e.clientY); st.x = e.clientX; st.y = e.clientY; return; }
      if (st.text) return;
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      for (const ev of (evs.length ? evs : [e])) {
        const p = this.point(ev);
        if (st.eraser) this.erase(p, st);
        else if (st.stroke) { const l = st.stroke.points[st.stroke.points.length - 1]; if (Math.hypot(p[0] - l[0], p[1] - l[1]) > 0.0009) st.stroke.points.push([p[0], p[1], ev.pressure || 0.5]); }
      }
      if (st.stroke) this.drawLive(st);
      this.onTouch?.(e);
    });
    const end = e => {
      if (!st) return;
      const s = st; st = null;
      if (s.text) { if (Math.hypot(e.clientX - s.x, e.clientY - s.y) < 10) this.onTextTap?.(this, this.point(e)); return; }
      if (s.scroll) return;
      if (s.eraser) { this.commitErase(s); return; }
      if (s.stroke) {
        s.el.remove();
        const a = s.stroke;
        a.points = a.points.map(p => [Math.round(p[0] * 10000) / 10000, Math.round(p[1] * 10000) / 10000, Math.round((p[2] ?? .5) * 100) / 100]);
        a.page = this.page;
        const onImg = this.imageHit?.(a);
        if (onImg) Object.assign(a, onImg);
        const anc = onImg ? null : this.anchorOf?.(a); if (anc) a.anc = anc;     // HTML: remember which text it was drawn next to (so it follows the text in Book / Blocks)
        this.store.add(a);      // re-render happens through the store listener
      }
    };
    hit.addEventListener('pointerup', end);
    hit.addEventListener('pointercancel', () => { if (st?.el) st.el.remove(); if (st?.eraser) this.render(); st = null; });
  }
  drawLive(st) {
    const a = st.stroke;
    if (st.pen) st.el.setAttribute('d', outlinePath(a.points.map(p => [p[0] * 1000, p[1] * 1000, p[2]]), a.width));
    else st.el.setAttribute('d', linePath(a.points.map(p => [p[0] * 1000, p[1] * 1000])));
  }
  erase(p, st) {
    const R = st.size;
    for (const r of this.recs()) {
      if (st.ids.has(r.id)) continue;
      let hit = false;
      if (r.type === 'pen' || r.type === 'brush') {
        const tol = R + ((r.width || 4) / 1000) / 2, k = this.yUnit(r), pts = r.points;
        for (let i = 0; i < pts.length && !hit; i++) { const q = pts[i], q2 = pts[i + 1] || q; if (distSeg(p[0], p[1], q[0], q[1] * k, q2[0], q2[1] * k) < tol) hit = true; }
      } else if (r.rects) {
        const k = this.yUnit(r) * this.W / this.H, py = p[1] * this.W / this.H;
        hit = (r.rects || []).some(q => p[0] >= q[0] - 0.005 && p[0] <= q[0] + q[2] + 0.005 && py >= q[1] * k - 0.005 && py <= (q[1] + q[3]) * k + 0.005);
      }
      if (hit) {
        st.ids.add(r.id);
        this.over.querySelectorAll(`[data-id="${r.id}"]`).forEach(n => { n.style.opacity = '.18'; });
        this.under.querySelectorAll(`[data-id="${r.id}"]`).forEach(n => { n.style.opacity = '.18'; });
      }
    }
  }
  commitErase(st) {
    if (!st.ids.size) return;
    this.store.transaction(() => st.ids.forEach(id => this.store.remove(id)), 'erase');   // one drag = one undo step
  }
}
