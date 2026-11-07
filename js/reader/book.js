// A believable book: fixed logical page size scaled to fit, spine, page edges, running header/footer, a 3D page leaf with
// shading that can be dragged by a finger, bookmarks (dog-ears) and a table of contents.
// The content comes from a "provider" (HTML multicol flow or PDF canvases); the engine only composes and animates.
import { h, clamp, debounce } from '../util.js';
import * as db from '../db.js';
import { customDialog } from '../ui.js';
import { icon } from '../icons.js';
import { bindZoom } from './zoom.js';

const PW = 1000, PH = 1400;
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const ease = t => { // cubic-bezier(.45,.05,.25,1) approximated
  return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};

export class BookEngine {
  // provider: {page:{w,h}, count, chrome, prepare(geom), mount(el), settle(left,right,geom), face(i), headerFor(i), pageOfOffset?, offsetOfPage?}
  constructor(host, provider, opts = {}) {
    this.host = host; this.p = provider; this.o = opts;
    this.PW = provider.page?.w || PW; this.PH = provider.page?.h || PH;
    this.cover = !!opts.cover;
    this.perView = 1; this.view = 0; this.scale = 1; this.zoom = opts.zoom ?? 1; this.pan = [0, 0];
    this.turning = null; this.alive = true;
    this.bookmarks = new Set();
    this.build();
  }

  build() {
    const { PW, PH } = this;
    this.content = h('div', { class: 'book-content' });
    this.leftPaper = h('div', { class: 'pgface paper-left' });
    this.rightPaper = h('div', { class: 'pgface paper-right' });
    this.overlay = h('div', { class: 'book-overlay' });
    this.leafLayer = h('div', { class: 'leaf-layer' });
    this.edgesL = h('div', { class: 'book-edge edge-l' }); this.edgesR = h('div', { class: 'book-edge edge-r' });
    this.spine = h('div', { class: 'book-spine' });
    this.shadow = h('div', { class: 'book-cast' });
    this.sheet = h('div', { class: 'book-sheet' }, this.shadow, this.edgesL, this.edgesR, this.leftPaper, this.rightPaper, this.content, this.spine, this.overlay, this.leafLayer);
    this.zoomWrap = h('div', { class: 'book-zoomwrap' }, this.sheet);
    this.desk = h('div', { class: 'book-desk' }, this.zoomWrap);
    this.counter = h('button', { class: 'book-counter', 'aria-label': 'Оглавление и закладки', onclick: () => this.openToc() }, '');
    this.slider = h('input', { type: 'range', class: 'book-slider', min: 0, max: 0, step: 1, value: 0, 'aria-label': 'Страница' });
    this.slider.addEventListener('input', () => { this.preview(Number(this.slider.value)); });
    this.slider.addEventListener('change', () => this.goView(Number(this.slider.value), 0));
    this.prevBtn = h('button', { class: 'ibtn sm', 'aria-label': 'Предыдущая страница', onclick: () => this.step(-1) }, icon('chevron-left', 18));
    this.nextBtn = h('button', { class: 'ibtn sm', 'aria-label': 'Следующая страница', onclick: () => this.step(1) }, icon('chevron-right', 18));
    this.tocBtn = h('button', { class: 'ibtn sm', 'aria-label': 'Оглавление', onclick: () => this.openToc() }, icon('list', 18));
    this.bar = h('div', { class: 'book-bar glass' }, this.prevBtn, this.slider, this.nextBtn, this.counter, this.tocBtn, ...(this.o.extraButtons || []));
    this.root = h('div', { class: 'book' }, this.desk, this.bar);
    this.host.append(this.root);
    this.p.mount?.(this.content);
    this.bindInput();
    this._ro = new ResizeObserver(() => { if (this._sz !== this.size()) { this._sz = this.size(); this.relayout(); } });
    this._ro.observe(this.desk);
    if (!this.o.noZoomGestures) this._zoomOff = bindZoom(this.desk, { target: () => this.zoomWrap, current: () => this.zoom, enabled: () => !this.o.gesturesOff?.(), commit: (z, cx, cy) => this.setZoom(z, [cx, cy]), onDouble: () => this.setZoom(this.zoom > 1.05 ? 1 : 2), min: 0.6, max: 3 });
  }
  size() { return this.desk.clientWidth + 'x' + this.desk.clientHeight; }

  // ----- page <-> view mapping -----
  get base() { return this.perView === 2 ? -1 : 0; }
  pagesIn(v) {
    const n = this.p.count();
    if (this.perView === 1) return { left: null, right: v >= 0 && v < n ? v : null, single: true };
    const l = 2 * v + this.base, r = l + 1;
    return { left: l >= 0 && l < n ? l : null, right: r >= 0 && r < n ? r : null, single: false };
  }
  viewCount() {
    const n = this.p.count();
    return this.perView === 1 ? Math.max(1, n) : Math.max(1, Math.ceil((n - this.base) / 2));
  }
  viewOfPage(p) { return this.perView === 1 ? p : Math.floor((p - this.base) / 2); }
  firstPageOfView(v = this.view) { const x = this.pagesIn(v); return x.left ?? x.right ?? 0; }

  // ----- layout -----
  async relayout(keepPage) {
    if (!this.alive) return;
    const page = keepPage ?? (this.laid ? this.firstPageOfView() : (this.o.startPage ?? 0));
    const anchor = this.o.getAnchor?.();            // provider-specific stable anchor (text offset)
    const w = this.desk.clientWidth, hgt = this.desk.clientHeight;
    if (!w || !hgt) return;
    this.perView = (w > hgt * 1.08 && w >= 720) ? 2 : 1;
    const spreadW = this.perView * this.PW;
    // the book fills the screen: ~8 px above/below, ~16 px at the sides (room for the page-edge stacks)
    const land = !!this.host.closest?.('.reader.land'), padX = land ? 68 : w < 600 ? 10 : 18, padY = land ? 0 : (hgt < 500 ? 4 : 8);   // landscape: the stage already has an 8 px inset
    this.fit = Math.min((w - padX * 2) / spreadW, (hgt - padY * 2) / this.PH);
    this.scale = this.fit * this.zoom;
    this.sheet.style.setProperty('--pw', this.PW + 'px'); this.sheet.style.setProperty('--ph', this.PH + 'px');
    Object.assign(this.sheet.style, { width: spreadW + 'px', height: this.PH + 'px' });
    this.sheet.classList.toggle('single', this.perView === 1);
    this.applyTransform();
    this.geom = { PW: this.PW, PH: this.PH, per: this.perView, scale: this.scale, cover: this.cover };
    await this.p.prepare(this.geom);
    this.laid = true;
    this.slider.max = String(this.viewCount() - 1);
    let target = page;
    if (anchor != null && this.p.pageOfOffset) target = this.p.pageOfOffset(anchor);
    this.view = clamp(this.viewOfPage(target), 0, this.viewCount() - 1);
    this.settle();
    this.loadBookmarks();
  }

  // sheet position: centred, plus pan when zoomed; the lone first page (no cover) is centred on the desk
  applyTransform() {
    const w = this.desk.clientWidth, hgt = this.desk.clientHeight, spreadW = this.perView * this.PW;
    const lone = this.perView === 2 && !this.cover && this.view === 0 && this.pagesIn(0).left == null;
    const shift = lone ? -this.PW * this.scale / 2 : 0;
    const sw = spreadW * this.scale, sh = this.PH * this.scale;
    const maxX = Math.max(0, (sw - w) / 2 + 24), maxY = Math.max(0, (sh - hgt) / 2 + 24);
    this.pan = [clamp(this.pan[0], -maxX, maxX), clamp(this.pan[1], -maxY, maxY)];
    const left = (w - sw) / 2 + shift + this.pan[0], top = (hgt - sh) / 2 + this.pan[1];
    this.sheet.style.transform = `translate(${left}px, ${top}px) scale(${this.scale})`;
  }
  async setZoom(z, anchor) {
    z = clamp(z, 0.6, 3);
    const f = z / this.zoom;
    if (anchor) { const r = this.desk.getBoundingClientRect(); const ax = anchor[0] - r.left - r.width / 2, ay = anchor[1] - r.top - r.height / 2; this.pan = [ax - (ax - this.pan[0]) * f, ay - (ay - this.pan[1]) * f]; }
    if (z <= 1.001) this.pan = [0, 0];
    this.zoom = z; this.o.onZoom?.(z);
    await this.relayout();
  }

  settle() {
    const { left, right, single } = this.pagesIn(this.view);
    this.paper(this.leftPaper, left, 'l', single);
    this.paper(this.rightPaper, right, single ? 's' : 'r', single);
    const loneFirst = !single && !this.cover && this.view === 0 && left == null;
    this.leftPaper.style.display = single || loneFirst ? 'none' : '';
    this.applyTransform();
    this.rightPaper.style.left = single ? '0' : this.PW + 'px';
    this.p.settle(left, right, this.geom);
    this.slider.value = String(this.view);
    this.updateCounter();
    this.o.onView?.(this.firstPageOfView(), this.p.count());
    // page-edge stacks: thickness follows how much is read / left
    const vc = this.viewCount(), readFrac = vc > 1 ? this.view / (vc - 1) : 0;
    this.edgesL.style.width = (3 + readFrac * 16) + 'px'; this.edgesL.style.left = -(3 + readFrac * 16) + 'px';
    this.edgesR.style.width = (3 + (1 - readFrac) * 16) + 'px'; this.edgesR.style.right = -(3 + (1 - readFrac) * 16) + 'px';
    this.edgesL.style.opacity = this.view === 0 ? '0' : '1'; this.edgesR.style.opacity = this.view >= vc - 1 ? '0' : '1';
    this.prevBtn.disabled = this.view <= 0; this.nextBtn.disabled = this.view >= this.viewCount() - 1;
  }
  updateCounter(v = this.view) {
    const { left, right } = this.pagesIn(v);
    const n = this.p.count();
    const a = left != null ? left + 1 : right + 1, b = right != null ? right + 1 : left + 1;
    this.counter.textContent = a === b ? `стр. ${a} / ${n}` : `стр. ${a}–${b} / ${n}`;
  }
  preview(v) { this.updateCounter(v); }

  // paper shell with margins, header, footer, bookmark ear. `side`: l | r | s
  paper(el, page, side, single) {
    el.replaceChildren();
    el.className = 'pgface paper-' + (side === 'l' ? 'left' : side === 'r' ? 'right' : 'single');
    if (page == null) { this.fillBlank(el, side); return el; }
    if (this.p.chrome) {
      const head = this.p.headerFor?.(page) || '';
      el.append(h('div', { class: 'pf-head', style: { left: this.p.box(page, side).x + 'px', width: this.p.box(page, side).w + 'px' } }, h('span', null, head)),
        h('div', { class: 'pf-foot' }, String(page + 1)));
    }
    el.append(this.ear(page, side));
    return el;
  }
  // the empty slot of a spread: the real cover (first spread, left) or an endpaper
  fillBlank(el, side) {
    el.classList.add('blank');
    if (side === 'l' && this.cover && this.view === 0 && this.perView === 2) { el.classList.add('cover-paper'); const c = this.o.coverEl?.(); if (c) el.append(c); }
    else el.classList.add('endpaper');
  }
  ear(page, side) {
    const e = h('button', { class: 'pf-ear' + (this.bookmarks.has(page) ? ' on' : ''), 'aria-label': 'Закладка', 'data-page': page, tabindex: '-1' });
    e.addEventListener('click', ev => { ev.stopPropagation(); this.toggleBookmark(page); });
    return e;
  }

  // ----- turning -----
  faceEl(page, side) {
    const el = h('div', { class: 'pgface' });
    if (page == null) { this.fillBlank(el, side); return el; }
    this.paper(el, page, side, this.perView === 1);
    const content = this.p.face(page, side);
    if (content) el.insertBefore(content, el.firstChild);
    return el;
  }

  // Build overlay for turning between views F and F+1 (earlier = F). Returns controller with setQ(q).
  beginTurn(F) {
    const per2 = this.perView === 2;
    const a = this.pagesIn(F), b = this.pagesIn(F + 1);
    const size = { w: this.PW, h: this.PH };
    const leftStatic = per2 ? this.faceEl(a.left, 'l') : null;
    const rightUnder = this.faceEl(per2 ? b.right : b.right, per2 ? 'r' : 's');
    const front = this.faceEl(a.right, per2 ? 'r' : 's');
    const back = per2 ? this.faceEl(b.left, 'l') : h('div', { class: 'pgface blank' });
    const x0 = per2 ? this.PW : 0;
    const under = h('div', { class: 'turn-under', style: { left: x0 + 'px' } }, rightUnder);
    const lStatic = leftStatic ? h('div', { class: 'turn-under', style: { left: '0px' } }, leftStatic) : null;
    const castShadow = h('div', { class: 'turn-cast' });
    under.append(castShadow);
    const frontShade = h('div', { class: 'leaf-shade' });
    const backShade = h('div', { class: 'leaf-shade back' });
    front.append(frontShade); back.append(backShade);
    const faceF = h('div', { class: 'leaf-face front' }, front);
    const faceB = h('div', { class: 'leaf-face back' }, back);
    const leaf = h('div', { class: 'leaf', style: { left: x0 + 'px' } }, faceF, faceB);
    this.overlay.replaceChildren(...(lStatic ? [lStatic] : []), under);
    this.leafLayer.replaceChildren(leaf);
    this.content.style.visibility = 'hidden';
    const T = {
      F, leaf, els: { castShadow, frontShade, backShade },
      frames(q0, q1) {
        const N = 16, out = { leaf: [], f: [], b: [], c: [] };
        for (let i = 0; i <= N; i++) {
          const q = q0 + (q1 - q0) * ease(i / N), a = q * 180, s = Math.sin(q * Math.PI);
          out.leaf.push({ transform: `rotateY(${-a}deg)`, offset: i / N });
          out.f.push({ opacity: q < .5 ? s * 0.55 : 0, offset: i / N });
          out.b.push({ opacity: q >= .5 ? s * 0.55 : 0, offset: i / N });
          out.c.push({ opacity: s * 0.7, offset: i / N });
        }
        return out;
      },
      setQ(q) {
        const s = Math.sin(q * Math.PI);
        leaf.style.transform = `rotateY(${-q * 180}deg)`;
        frontShade.style.opacity = q < .5 ? s * 0.55 : 0;
        backShade.style.opacity = q >= .5 ? s * 0.55 : 0;
        castShadow.style.opacity = s * 0.7;
      },
      q: 0,
    };
    void size;
    T.setQ(0);
    return T;
  }
  endTurn() {
    this.overlay.replaceChildren(); this.leafLayer.replaceChildren();
    this.content.style.visibility = '';
  }

  // Animate q from q0 to q1; returns a handle that can finish instantly
  animate(T, q0, q1, ms = 650) {
    const f = T.frames(q0, q1);
    const opts = { duration: ms * Math.max(.35, Math.abs(q1 - q0)), easing: 'linear', fill: 'forwards' };
    T.leaf.style.willChange = 'transform';      // only while this one leaf turns
    const anims = [T.leaf.animate(f.leaf, opts), T.els.frontShade.animate(f.f, opts), T.els.backShade.animate(f.b, opts), T.els.castShadow.animate(f.c, opts)];
    const done = Promise.all(anims.map(a => a.finished.catch(() => {}))).then(() => { T.leaf.style.willChange = ''; });
    return { done, finish: () => anims.forEach(a => { try { a.finish(); } catch { /* ignore */ } }) };
  }

  async goView(v, dir) {
    v = clamp(v, 0, this.viewCount() - 1);
    if (this.turning) { this.turning.finish(); await this.turning.done; }
    if (v === this.view) return;
    if (reduceMotion() || Math.abs(v - this.view) !== 1 || !dir) {
      this.content.animate?.([{ opacity: .2 }, { opacity: 1 }], { duration: 260 });
      this.view = v; this.settle(); return;
    }
    const F = Math.min(v, this.view), forward = v > this.view;
    const T = this.beginTurn(F);
    const handle = this.animate(T, forward ? 0 : 1, forward ? 1 : 0);
    this.turning = { finish: handle.finish, done: handle.done };
    await handle.done;
    this.turning = null;
    this.view = v; this.settle(); this.endTurn();
  }
  step(d) { return this.goView(this.view + d, d); }
  goPage(p) { return this.goView(this.viewOfPage(p), 0); }

  // ----- input -----
  bindInput() {
    const desk = this.desk;
    let st = null;
    const blocked = e => e.target.closest?.('a, button, input, textarea, .mk, .pg-obj, img, [contenteditable="true"], .pf-ear');
    this._pd = e => {
      if (e.button > 0 || this.o.gesturesOff?.() || blocked(e)) return;
      const r = this.sheet.getBoundingClientRect();
      const fx = (e.clientX - r.left) / r.width, fy = (e.clientY - r.top) / r.height;
      st = { id: e.pointerId, x: e.clientX, y: e.clientY, t: Date.now(), fx, fy, type: e.pointerType, drag: null, w: r.width / this.perView, moved: false, pan0: this.pan.slice() };
      st.lp = setTimeout(() => { if (st && !st.moved && fy < 0.14 && (fx < 0.18 || fx > 0.82 || this.perView === 1)) { const pg = this.pageAt(fx); if (pg != null) { this.toggleBookmark(pg); st.long = true; } } }, 650);
    };
    this._pm = e => {
      if (!st || e.pointerId !== st.id) return;
      const dx = e.clientX - st.x, dy = e.clientY - st.y;
      if (!st.moved && Math.hypot(dx, dy) > 8) st.moved = true;
      if (st.moved) clearTimeout(st.lp);
      if (this.zoom > 1.02 && st.type !== 'mouse') { const sel0 = getSelection(); if (!(sel0 && !sel0.isCollapsed)) { if (st.moved) { this.pan = [st.pan0[0] + dx, st.pan0[1] + dy]; this.applyTransform(); e.preventDefault?.(); } return; } }
      if (!st.drag && Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.4 && (st.type !== 'mouse' || st.fx < 0.12 || st.fx > 0.88)) {
        const sel = getSelection();
        if (sel && !sel.isCollapsed && String(sel).length) { st = null; return; }
        const fwd = dx < 0;
        if (this.turning) { this.turning.finish(); }
        const F = fwd ? this.view : this.view - 1;
        if (F < 0 || F + 1 > this.viewCount() - 1) { st.drag = 'none'; return; }
        const T = this.beginTurn(F);
        st.drag = { T, fwd, q0: fwd ? 0 : 1 };
        try { desk.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      }
      if (st.drag && st.drag !== 'none') {
        const d = st.drag, p = clamp(Math.abs(dx) / (st.w * 0.9), 0, 1);
        const q = d.fwd ? p : 1 - p;
        d.q = q; d.T.setQ(q);
        const now = performance.now(); d.v = (e.clientX - (d.lx ?? e.clientX)) / Math.max(1, now - (d.lt ?? now - 16)); d.lx = e.clientX; d.lt = now;
        e.preventDefault?.();
      }
    };
    this._pu = async e => {
      if (!st || e.pointerId !== st.id) return;
      const s = st; st = null; clearTimeout(s.lp);
      if (s.long) return;
      if (s.drag && s.drag !== 'none') {
        const d = s.drag;
        const p = d.fwd ? d.q : 1 - d.q;
        const fast = d.fwd ? (d.v || 0) < -0.5 : (d.v || 0) > 0.5;
        const complete = p > 0.35 || fast;
        const target = complete ? (d.fwd ? 1 : 0) : (d.fwd ? 0 : 1);
        const handle = this.animate(d.T, d.q, target, 520);
        this.turning = { finish: handle.finish, done: handle.done };
        await handle.done; this.turning = null;
        if (complete) this.view = d.fwd ? this.view + 1 : this.view - 1;
        this.settle(); this.endTurn();
        return;
      }
      if (s.drag === 'none') return;
      const dt = Date.now() - s.t;
      if (!s.moved && dt < 400) {
        const sel = getSelection();
        if (sel && !sel.isCollapsed && String(sel).length) return;
        if (s.fx < 0.2) this.step(-1); else if (s.fx > 0.8) this.step(1);
        else if (this.perView === 1) { /* centre tap toggles chrome in the reader */ this.o.onCenterTap?.(); }
        else this.o.onCenterTap?.();
      }
    };
    desk.addEventListener('pointerdown', this._pd);
    desk.addEventListener('pointermove', this._pm);
    desk.addEventListener('pointerup', this._pu);
    desk.addEventListener('pointercancel', () => { if (st?.drag?.T) { this.settle(); this.endTurn(); } st = null; });
    this._key = e => {
      if (e.target.closest?.('input, textarea, [contenteditable="true"]') || document.querySelector('.modal-back')) return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); this.step(1); }
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); this.step(-1); }
    };
    document.addEventListener('keydown', this._key);
  }
  pageAt(fx) { const p = this.pagesIn(this.view); return this.perView === 1 ? p.right : (fx < 0.5 ? p.left : p.right); }

  // ----- bookmarks and TOC -----
  async loadBookmarks() {
    const arr = await db.kvGet('bm:' + this.o.docId, []);
    this.bookmarks = new Set(arr.map(b => (typeof b === 'number' ? b : (this.p.pageOfOffset ? this.p.pageOfOffset(b.off) : b.page))));
    this.refreshEars();
  }
  refreshEars() { this.root.querySelectorAll('.pf-ear').forEach(e => e.classList.toggle('on', this.bookmarks.has(Number(e.dataset.page)))); }
  async toggleBookmark(page) {
    if (this.bookmarks.has(page)) this.bookmarks.delete(page); else this.bookmarks.add(page);
    const ear = this.root.querySelector(`.pf-ear[data-page="${page}"]`);
    ear?.classList.toggle('on', this.bookmarks.has(page));
    ear?.animate?.([{ transform: 'scale(.4)' }, { transform: 'scale(1.15)' }, { transform: 'scale(1)' }], { duration: 380, easing: 'cubic-bezier(.34,1.4,.5,1)' });
    const list = [...this.bookmarks].map(p => (this.p.offsetOfPage ? { off: this.p.offsetOfPage(p), page: p } : p));
    await db.kvSet('bm:' + this.o.docId, list);
  }
  async openToc() {
    const toc = (await this.p.toc?.()) || [];
    const bms = [...this.bookmarks].sort((a, b) => a - b);
    const go = p => { m.close(); this.goView(this.viewOfPage(p), p >= this.firstPageOfView() ? 1 : -1); };
    const m = customDialog([
      h('h3', null, 'Оглавление'),
      bms.length ? h('div', { class: 'toc-bms' }, h('span', { class: 'muted' }, 'Закладки:'), ...bms.map(p => h('button', { class: 'chip', onclick: () => go(p) }, icon('bookmark'), ` стр. ${p + 1}`))) : null,
      toc.length ? h('div', { class: 'toc-list' }, toc.map(it => h('button', { class: 'toc-item', style: { paddingLeft: 14 + (it.level || 0) * 16 + 'px' }, onclick: () => go(it.page) }, h('span', { class: 'toc-title' }, it.title), h('span', { class: 'muted' }, `стр. ${it.page + 1}`))))
        : h('p', { class: 'modal-text' }, 'В документе нет заголовков. Листайте кнопками или ползунком внизу.'),
      h('div', { class: 'modal-actions' }, h('button', { class: 'btn', onclick: () => m.close() }, 'Закрыть')),
    ], { onBackdrop: () => m.close() });
  }

  destroy() {
    this.alive = false; this._ro.disconnect(); this._zoomOff?.();
    document.removeEventListener('keydown', this._key);
    this.root.remove();
  }
}
