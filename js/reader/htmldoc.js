// HTML documents (html, docx, txt, md) — the document is immutable; marks are data painted over it.
// Modes: normal (scroll column + drawing layer), book (multicol flow in fixed logical pages), blocks (study cards).
import * as db from '../db.js';
import { h, debounce, clamp, raf } from '../util.js';
import { settings } from '../settings.js';
import { buildIndex, rangeToAnchor, rangeFromOffsets, resolveAnchor, offsetToPoint } from '../anno/anchor.js';
import { paintMarks } from '../anno/paint.js';
import { outlinePath, linePath, BRUSH_OPACITY } from '../anno/draw.js';
import { DrawLayer } from '../anno/draw.js';
import { lightenDoc } from '../htmlprep.js';
import { BookEngine } from './book.js';
import { BlocksView } from './blocks.js';
import { toast } from '../ui.js';
import { bindZoom } from './zoom.js';
import { adaptBanner } from './banner.js';
import { openLightbox } from './lightbox.js';
import { hashStr } from './split.js';
import { recordPartDone } from '../study.js';

const COL = 810, GAP = 220, STEP = COL + GAP, BOX_Y = 110, BOX_H = 1170;

export class HtmlDoc {
  constructor(ctx) {
    this.ctx = ctx; this.meta = ctx.meta; this.stage = ctx.stage; this.store = ctx.store; this.tools = ctx.tools;
    this.kind = 'html'; this.mode = null; this.root = null; this.zoom = 1;
    this.urls = new Map(); this.imgRecs = new Map(); this.cleanups = [];
  }
  caps() { return { draw: this.mode === 'normal', text: this.mode === 'normal', photo: this.mode === 'normal', select: true, zoom: this.mode !== 'blocks', trim: false }; }

  async load() {
    const w = await db.get('work', this.meta.id);
    if (!w) throw new Error('Файл не найден в хранилище.');
    this.html = w.html || ''; this.sdm = w.sdm || null; this.report = w.report || null;
    for (const r of await db.getAll('images', 'fileId', this.meta.id)) this.imgRecs.set(r.id, r);
    this._off = this.store.onChange(kind => { if (['cmd', 'undo', 'redo'].includes(kind)) this.repaint(); });
  }
  imgUrl(id) {
    if (this.urls.has(id)) return this.urls.get(id);
    const rec = this.imgRecs.get(id);
    if (!rec) return '';
    const u = URL.createObjectURL(rec.blob); this.urls.set(id, u); return u;
  }
  async photoUrl(id) {
    if (this.urls.has(id)) return this.urls.get(id);
    const rec = this.imgRecs.get(id) || await db.get('images', id);
    if (!rec) return '';
    const u = URL.createObjectURL(rec.blob); this.urls.set(id, u); return u;
  }

  buildRoot() {
    const root = document.createElement('article');
    root.className = 'doc';
    root.setAttribute('data-doc', this.meta.id); root.setAttribute('lang', this.sdm?.meta?.lang || 'ru');
    root.innerHTML = this.html;
    lightenDoc(root);
    if (this.mode === 'book') for (const i of root.querySelectorAll('img')) i.loading = 'eager';
    for (const img of root.querySelectorAll('img[data-img-id]')) { const u = this.imgUrl(img.getAttribute('data-img-id')); img.loading = this.mode === 'book' ? 'eager' : 'lazy'; if (u) img.src = u; }   // Book needs every image's size to paginate
    return root;
  }
  repaint() {
    if (!this.root) return;
    this.index = paintMarks(this.root, this.store.textMarks());
    this.index = buildIndex(this.root);
    this.book?.invalidate?.();
    const marks = this.store.textMarks();
    this.unanchored = marks.filter(m => !resolveAnchor(this.index, m.anchor));
    this.ctx.onUnanchored?.(this.unanchored);
    if (this.mode) this.paintAnchored();
  }

  // ---- strokes drawn ON an image: stored in the image's own normalised box, so they stay attached whatever the zoom / mode ----
  imgKey(img) { return img.getAttribute('data-img-id') || ('i' + [...this.root.querySelectorAll('img')].indexOf(img)); }
  imageHit(rec) {
    if (!this.root || !rec.points?.length) return null;
    const pts = rec.points, R = this.layer?.over.getBoundingClientRect(); if (!R) return null;
    const cx = R.left + (pts.reduce((a, p) => a + p[0], 0) / pts.length) * R.width, cy = R.top + (pts.reduce((a, p) => a + p[1], 0) / pts.length) * R.width;
    const img = [...this.root.querySelectorAll('img')].find(i => { const r = i.getBoundingClientRect(); return r.width > 40 && cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom; });
    if (!img) return null;
    const r = img.getBoundingClientRect();
    return { img: this.imgKey(img), points: pts.map(p => [Math.round(((R.left + p[0] * R.width - r.left) / r.width) * 10000) / 10000, Math.round(((R.top + p[1] * R.width - r.top) / r.height) * 10000) / 10000, p[2]]), width: Math.round((rec.width / 1000) * R.width / r.width * 10000) / 10 };
  }

  // ---- drawings made in Normal mode follow their text in Book / Blocks ----
  // A record drawn in Normal mode carries anc = {off, ax, ay, ch}: the text offset of the nearest character, that character's
  // top-left (in units of the column width) and its height. In the other modes the same strokes are re-placed relative to
  // that character and scaled by the font-size ratio, so a mark stays next to the words it was made beside.
  makeAnchor(rec) {
    if (this.mode !== 'normal' || !this.root) return null;
    const R = this.root.getBoundingClientRect(), W = R.width; if (!W) return null;
    const pts = rec.points ? rec.points : [[rec.x, rec.y]];
    let mx = Infinity, my = Infinity;
    for (const p of pts) { mx = Math.min(mx, p[0]); my = Math.min(my, p[1]); }
    const cx = clamp(R.left + mx * W, R.left + 24, R.right - 24), cy = R.top + my * W;
    let pos = null;
    if (document.caretPositionFromPoint) { const c = document.caretPositionFromPoint(cx, cy); if (c) pos = { node: c.offsetNode, off: c.offset }; }
    else if (document.caretRangeFromPoint) { const c = document.caretRangeFromPoint(cx, cy); if (c) pos = { node: c.startContainer, off: c.startOffset }; }
    const idx = buildIndex(this.root);
    let e = pos && idx.map.get(pos.node);
    if (!e) { // nearest text node by vertical distance
      let best = null, bd = Infinity;
      for (const n of idx.nodes) { const rg = document.createRange(); rg.selectNodeContents(n.node); const b = rg.getBoundingClientRect(); if (!b.height) continue; const d = cy < b.top ? b.top - cy : cy > b.bottom ? cy - b.bottom : 0; if (d < bd) { bd = d; best = n; } }
      if (!best) return null; e = best; pos = { off: 0 };
    }
    const off = e.start + Math.min(pos.off, Math.max(0, e.node.data.length - 1));
    const pt = offsetToPoint(idx, off); if (!pt) return null;
    const rg = document.createRange(); rg.setStart(pt.node, Math.min(pt.offset, pt.node.data.length - 1)); rg.setEnd(pt.node, Math.min(pt.offset, pt.node.data.length - 1) + 1);
    const b = rg.getBoundingClientRect(); if (!b.height) return null;
    return { off, ax: Math.round((b.left - R.left) / W * 10000) / 10000, ay: Math.round((b.top - R.top) / W * 10000) / 10000, ch: Math.round(b.height / W * 10000) / 10000 };
  }
  paintAnchored() {
    const root = this.root; if (!root) return;
    root.querySelectorAll(':scope > .anc-layer').forEach(n => n.remove());
    const imgRecs = this.store.filter(r => r.img && (r.type === 'pen' || r.type === 'brush'));
    const recs = this.mode === 'normal' ? [] : this.store.filter(r => r.anc && ['pen', 'brush', 'text', 'photo'].includes(r.type));
    if (!recs.length && !imgRecs.length) return;
    const idx = this.index || buildIndex(root);
    const layer = document.createElement('div'); layer.className = 'anc-layer'; layer.setAttribute('aria-hidden', 'true');
    const rr = root.getBoundingClientRect();
    const sc = this.mode === 'book' ? (this.engine?.scale || 1) : 1;
    const Wn = root.offsetWidth || 1;
    const NS = 'http://www.w3.org/2000/svg';
    for (const r of recs) {
      const pt = offsetToPoint(idx, r.anc.off); if (!pt) continue;
      const i0 = Math.min(pt.offset, pt.node.data.length - 1); if (i0 < 0) continue;
      const rg = document.createRange(); rg.setStart(pt.node, i0); rg.setEnd(pt.node, i0 + 1);
      const b = rg.getBoundingClientRect(); if (!b.height) continue;      // hidden (filtered out block)
      const L = (b.left - rr.left) / sc, T = (b.top - rr.top) / sc;
      const k = (b.height / sc / Wn) / (r.anc.ch || 0.03);               // font-size ratio between the modes
      const X = x => L + (x - r.anc.ax) * Wn * k, Y = y => T + (y - r.anc.ay) * Wn * k;
      if (r.type === 'pen' || r.type === 'brush') {
        const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('class', 'anc-svg ' + r.type); svg.style.cssText = 'position:absolute;left:0;top:0;width:1px;height:1px;overflow:visible;pointer-events:none';
        const px = (r.points || []).map(p => [X(p[0]), Y(p[1]), p[2]]);
        const path = document.createElementNS(NS, 'path'); path.dataset.id = r.id;
        const wpx = (r.width || 4) / 1000 * Wn * k;
        if (r.type === 'pen') { path.setAttribute('d', outlinePath(px, wpx)); path.setAttribute('fill', r.color); }
        else { path.setAttribute('d', linePath(px.map(p => [p[0], p[1]]))); path.setAttribute('fill', 'none'); path.setAttribute('stroke', r.color); path.setAttribute('stroke-width', wpx); path.setAttribute('stroke-linecap', 'round'); path.setAttribute('stroke-linejoin', 'round'); svg.style.opacity = BRUSH_OPACITY; svg.style.mixBlendMode = 'multiply'; }
        svg.append(path); layer.append(svg);
      } else if (r.type === 'text') {
        const d = h('div', { class: 'anc-text' }); d.innerHTML = r.html || '';
        Object.assign(d.style, { position: 'absolute', left: X(r.x) + 'px', top: Y(r.y) + 'px', width: r.w * Wn * k + 'px', fontSize: (r.fs || 0.028) * Wn * k + 'px', color: r.color || '#151d2e', lineHeight: '1.25' });
        layer.append(d);
      } else if (r.type === 'photo') {
        const im = h('img', { class: 'anc-photo', alt: '' }); this.photoUrl(r.blobKey).then(u => { if (u) im.src = u; });
        Object.assign(im.style, { position: 'absolute', left: X(r.x) + 'px', top: Y(r.y) + 'px', width: r.w * Wn * k + 'px', height: 'auto', borderRadius: '6px' });
        layer.append(im);
      }
    }
    // strokes on images: an <svg> exactly over the image box, normalised coordinates
    for (const r of imgRecs) {
      const img = [...root.querySelectorAll('img')].find(i => this.imgKey(i) === r.img); if (!img) continue;
      const ir = img.getBoundingClientRect(); if (!ir.width) continue;
      const W = 1000, H = 1000 * ir.height / ir.width;
      const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('class', 'anc-svg on-img ' + r.type); svg.setAttribute('viewBox', `0 0 ${W} ${H.toFixed(2)}`); svg.setAttribute('preserveAspectRatio', 'none');
      svg.style.cssText = `position:absolute;left:${(ir.left - rr.left) / sc}px;top:${(ir.top - rr.top) / sc}px;width:${ir.width / sc}px;height:${ir.height / sc}px;overflow:hidden;pointer-events:none`;
      const px = r.points.map(p => [p[0] * W, p[1] * H, p[2]]);
      const path = document.createElementNS(NS, 'path'); path.dataset.id = r.id;
      if (r.type === 'pen') { path.setAttribute('d', outlinePath(px, r.width || 4)); path.setAttribute('fill', r.color); }
      else { path.setAttribute('d', linePath(px.map(p => [p[0], p[1]]))); path.setAttribute('fill', 'none'); path.setAttribute('stroke', r.color); path.setAttribute('stroke-width', r.width || 22); path.setAttribute('stroke-linecap', 'round'); path.setAttribute('stroke-linejoin', 'round'); svg.style.opacity = BRUSH_OPACITY; svg.style.mixBlendMode = 'multiply'; }
      svg.append(path); layer.append(svg);
    }
    root.append(layer);
  }

  // ---------- modes ----------
  async setMode(mode, pos) {
    this.unmount();
    this.mode = mode;
    this.zoom = await db.kvGet(`zoom:${this.meta.id}:${mode}`, mode === 'book' ? Math.pow(1.08, settings().bookFontStep || 0) : 1);
    this.bookStep = Math.round(Math.log(this.zoom) / Math.log(1.08));
    this.root = this.buildRoot();
    this.bindRoot(this.root);
    if (mode === 'normal') await this.mountNormal(pos);
    else if (mode === 'book') await this.mountBook(pos);
    else await this.mountBlocks(pos);
    this.repaint();
    this.ctx.onZoom?.(this.zoom);
  }
  unmount() {
    for (const c of this.cleanups.splice(0)) { try { c(); } catch { /* ignore */ } }
    this.engine?.destroy(); this.engine = null; this.book = null;
    this.blocks?.destroy(); this.blocks = null;
    this.layer = null;
    this.stage.replaceChildren();
    this.root = null; this.index = null;
  }

  bindRoot(root) {
    root.addEventListener('click', e => {
      const chip = e.target.closest?.('.mk-chip');
      const mk = e.target.closest?.('.mk');
      if (mk) {
        const sel = getSelection();
        if (sel && !sel.isCollapsed) return;
        const ids = mk.dataset.ids.split(',');
        if (this.tools.tool === 'eraser') { this.store.transaction(() => ids.forEach(id => this.store.remove(id)), 'erase'); return; }
        const rect = mk.getBoundingClientRect();
        this.ctx.markTap?.(ids, rect, !!chip);
        return;
      }
      const stroke = e.target.closest?.('.anc-svg path[data-id]');
      if (stroke && this.tools.tool === 'eraser') { this.store.remove(stroke.dataset.id); return; }
      const im = e.target.closest?.('img');
      if (im && im.src && !im.hasAttribute('data-blocked-src') && this.tools.tool === 'none' && !im.closest('.tbox,.pobj')) { const sel = getSelection(); if (!sel || sel.isCollapsed) { openLightbox(im.src, im.alt); return; } }
      const a = e.target.closest?.('a[href]');
      if (a) {
        const href = a.getAttribute('href') || '';
        if (href.startsWith('#')) { e.preventDefault(); root.querySelector(`[id="${CSS.escape(href.slice(1))}"]`)?.scrollIntoView({ block: 'start' }); }
      }
    });
    root.addEventListener('dblclick', e => e.preventDefault());
    // double tap on a word underlines it
    let last = null;
    root.addEventListener('pointerup', e => {
      if (this.tools.drawing() || e.target.closest('a, img, .mk-chip, .anc-layer')) { last = null; return; }
      const now = performance.now();
      if (last && now - last.t < 320 && Math.hypot(e.clientX - last.x, e.clientY - last.y) < 24) { last = null; this.underlineWordAt(e.clientX, e.clientY); return; }
      last = { t: now, x: e.clientX, y: e.clientY };
    });
  }

  // ---------- zoom ----------
  zoomValue() { return this.zoom; }
  setZoom(z, anchor) {
    z = clamp(z, settings().zoomMin ?? 0.6, settings().zoomMax ?? 3);
    if (Math.abs(z - this.zoom) < 0.005) return;
    const z0 = this.zoom; this.zoom = z;
    db.kvSet(`zoom:${this.meta.id}:${this.mode}`, z).catch(() => {});
    if (this.mode === 'normal' && this.scroller) {
      const sc = this.scroller, max = sc.scrollHeight - sc.clientHeight, ratio = max > 0 ? sc.scrollTop / max : 0;
      this.wrap.style.setProperty('--z', String(z));
      sc.scrollTop = ratio * (sc.scrollHeight - sc.clientHeight);
    } else if (this.mode === 'book') { this.setBookStep(Math.round(Math.log(z) / Math.log(1.08))); return; }
    this.ctx.onZoom?.(z);
    void z0;
  }
  zoomBy(f) { if (this.mode === 'book') this.setBookStep(this.bookStep + (f > 1 ? 1 : -1)); else this.setZoom(this.zoom * f); }
  async setBookStep(step) {
    step = clamp(step, -4, 10); if (step === this.bookStep) return;
    this.bookStep = step; this.zoom = Math.pow(1.08, step);
    db.kvSet(`zoom:${this.meta.id}:book`, this.zoom).catch(() => {});
    this.ctx.onZoom?.(this.zoom);
    await this.engine?.relayout();
  }
  fitWidth() { if (this.mode === 'normal') { const sc = this.scroller; const full = sc ? (sc.clientWidth - 24) / 680 : 1; this.setZoom(Math.abs(this.zoom - full) < 0.03 ? 1 : full); } else this.setZoom(1); }

  // ---------- normal ----------
  async mountNormal(pos) {
    const scroller = h('div', { class: 'scroll-col rd-scroll' });
    const wrap = h('div', { class: 'doc-wrap', style: { '--z': String(this.zoom) } }, this.root);
    this.wrap = wrap;
    const ban = adaptBanner(this.report, this.meta.name); if (ban) { ban.style.cssText = 'max-width:680px;margin:0 auto 12px'; scroller.append(ban); }
    scroller.append(wrap);
    this.scroller = scroller;
    this.layer = new DrawLayer({ store: this.store, page: 1, tools: this.tools, scroller: () => scroller, photoUrl: id => this.photoUrl(id), anchorOf: rec => this.makeAnchor(rec), imageHit: rec => this.imageHit(rec), onTextTap: (l, p) => this.ctx.addText?.(l, p), onTouch: () => this.ctx.touch?.() });
    wrap.append(this.layer.over);
    this.stage.replaceChildren(scroller);
    await this.waitImages();
    const size = () => { this.layer.setSize(this.root.offsetWidth, this.root.offsetHeight); this.paintAnchored(); };
    size();
    const ro = new ResizeObserver(() => size()); ro.observe(this.root);
    const unsub = this.store.onChange(k => { if (['cmd', 'undo', 'redo'].includes(k)) this.layer?.render(); });
    const save = debounce(() => {
      const max = scroller.scrollHeight - scroller.clientHeight;
      const ratio = max > 0 ? scroller.scrollTop / max : 0;
      this.ctx.savePos('normal', { ratio }); this.ctx.progress?.(ratio);
    }, 300);
    scroller.addEventListener('scroll', save, { passive: true });
    // text zoom = a CSS font-size variable (buttons / fit width); pinch is reserved for images (lightbox)
    this.cleanups.push(() => { ro.disconnect(); unsub(); save.flush(); });
    await raf();
    if (pos?.ratio != null) scroller.scrollTop = pos.ratio * (scroller.scrollHeight - scroller.clientHeight);
  }
  waitImages(ms = 2500) {
    const imgs = [...this.root.querySelectorAll('img')].filter(i => i.getAttribute('src') && !i.complete);
    if (!imgs.length) return Promise.resolve();
    return Promise.race([Promise.all(imgs.map(i => new Promise(r => { i.addEventListener('load', r, { once: true }); i.addEventListener('error', r, { once: true }); }))), new Promise(r => setTimeout(r, ms))]);
  }

  // ---------- book ----------
  async mountBook(pos) {
    const prov = new HtmlBook(this);
    this.book = prov;
    this.engine = new BookEngine(this.stage, prov, {
      docId: this.meta.id, cover: !!settings().bookCover, startPage: 0, zoom: this.zoom,
      coverEl: () => this.ctx.coverFace?.(),
      onZoom: z => { this.zoom = z; db.kvSet(`zoom:${this.meta.id}:book`, z).catch(() => {}); this.ctx.onZoom?.(z); },
      getAnchor: () => (prov.ready ? prov.offsetOfPage(this.engine.firstPageOfView()) : (pos?.off ?? null)),
      gesturesOff: () => this.tools.drawing(), noZoomGestures: true,
      onView: (page, n) => { if (!prov.ready) return; this.ctx.savePos('book', { off: prov.offsetOfPage(page), page }); this.ctx.progress?.(n > 1 ? page / (n - 1) : 0); },
      onCenterTap: () => this.ctx.toggleChrome?.(),
      extraButtons: [
        h('button', { class: 'ibtn tx', 'aria-label': 'Мельче шрифт', onclick: () => this.changeFont(-1) }, 'A−'),
        h('button', { class: 'ibtn tx', 'aria-label': 'Крупнее шрифт', onclick: () => this.changeFont(1) }, 'A+'),
      ],
    });
    this.engine.o.startPage = pos?.page ?? 0;
    await this.engine.relayout(pos?.page ?? 0);
    if (pos?.off != null && prov.ready) await this.engine.goView(this.engine.viewOfPage(prov.pageOfOffset(pos.off)), 0);
  }
  async changeFont(d) { await this.setBookStep((this.bookStep || 0) + d); }

  // ---------- blocks ----------
  async mountBlocks(pos) {
    this.blocks = new BlocksView({ doc: this, ctx: this.ctx, host: this.stage, pos });
    await this.blocks.init();
  }

  // ---------- «Прочитала» for the block under the reading position (Обычный / Книга); Блоки delegates to its own view ----------
  unitOfSection(el) { const t = (el.textContent || '').trim(); return 'u' + hashStr(t.slice(0, 160) + '|' + t.length); }
  async currentBlock() {
    if (this.blocks) return this.blocks.currentBlock();
    const secs = [...(this.root?.querySelectorAll(':scope > section.lz-sec') || [])];
    if (!secs.length) return null;
    let el = null;
    if (this.mode === 'book' && this.book?.ready) { const pt = offsetToPoint(this.index || buildIndex(this.root), this.book.offsetOfPage(this.engine.firstPageOfView())); el = pt?.node.parentElement?.closest('section.lz-sec'); }
    else if (this.scroller) { const top = this.scroller.getBoundingClientRect().top + this.scroller.clientHeight * 0.35; el = secs.find(s => s.getBoundingClientRect().bottom > top); }
    el = el || secs[0];
    const st = await db.kvGet('bk:' + this.meta.id, {}), u = this.unitOfSection(el);
    return { el, id: el.getAttribute('data-lz-id'), title: el.getAttribute('data-lab') || 'Раздел', unit: u, done: !!st.doneU?.[u] };
  }
  async toggleBlockRead(b) {
    if (this.blocks) return this.blocks.toggleBlockRead(b);
    const key = 'bk:' + this.meta.id, st = { done: {}, doneU: {}, ...(await db.kvGet(key, {})) };
    st.done ||= {}; st.doneU ||= {};
    if (st.doneU[b.unit]) { delete st.doneU[b.unit]; delete st.done[b.id]; await db.kvSet(key, st); return false; }
    st.doneU[b.unit] = Date.now(); st.done[b.id] = Date.now(); await db.kvSet(key, st);
    recordPartDone(this.meta.id, this.meta.subject, b.id).catch(() => {});
    return true;
  }

  async jumpTo(bm) {
    if (bm.kind !== 'block') return;
    if (this.blocks) { this.blocks.scrollToBlock(bm.ref); return; }
    const el = this.root?.querySelector(`[data-lz-id="${bm.ref}"]`); if (!el) return;
    if (this.mode === 'book' && this.book?.ready) { const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); const n = w.nextNode(); const e = n && (this.index || buildIndex(this.root)).map.get(n); if (e) this.engine.goPage(this.book.pageOfOffset(e.start)); }
    else el.scrollIntoView({ block: 'start' });
  }
  underlineWordAt(x, y) {
    let pos = null;
    if (document.caretPositionFromPoint) { const c = document.caretPositionFromPoint(x, y); if (c) pos = { node: c.offsetNode, off: c.offset }; }
    else if (document.caretRangeFromPoint) { const c = document.caretRangeFromPoint(x, y); if (c) pos = { node: c.startContainer, off: c.startOffset }; }
    if (!pos || pos.node.nodeType !== 3 || !this.root?.contains(pos.node) || pos.node.parentElement.closest('.anc-layer,.mk-chip')) return;
    const t = pos.node.data; let a = Math.min(pos.off, t.length), b = a;
    while (a > 0 && /[\p{L}\p{N}]/u.test(t[a - 1])) a--; while (b < t.length && /[\p{L}\p{N}]/u.test(t[b])) b++;
    if (a === b) return;
    const rg = document.createRange(); rg.setStart(pos.node, a); rg.setEnd(pos.node, b);
    this.applyTextMark('ul', { color: this.tools.ulInk(), ulStyle: this.tools.ulStyle }, rg);
  }

  // ---------- selection & marks ----------
  selectionRange() {
    const sel = getSelection();
    if (!sel || !sel.rangeCount || sel.isCollapsed || !this.root) return null;
    const r = sel.getRangeAt(0);
    if (!this.root.contains(r.commonAncestorContainer)) return null;
    if (!String(sel).trim()) return null;
    return r;
  }
  hasSelection() { return !!this.selectionRange(); }
  selectionText() { return String(getSelection() || ''); }
  selectionRect() { const r = this.selectionRange(); return r ? r.getBoundingClientRect() : null; }

  // type: hl | ul | strike | note
  snapshot() { return this.selectionRange()?.cloneRange() || null; }
  applyTextMark(type, props = {}, snap = null) {
    const r = snap || this.selectionRange();
    if (!r) return null;
    const index = buildIndex(this.root);
    const anchor = rangeToAnchor(index, r);
    if (!anchor) return null;
    let rec = null;
    this.store.transaction(() => {
      if (type === 'ul' || type === 'strike') {
        const same = this.store.textMarks().find(m => m.type === type && m.anchor.start === anchor.start && m.anchor.end === anchor.end);
        if (same) { this.store.remove(same.id); return; }
      }
      rec = this.store.add({ type, anchor, ...props });
    }, 'mark');
    getSelection()?.removeAllRanges();
    this.popLast(anchor);
    return rec;
  }
  popLast(anchor) {
    requestAnimationFrame(() => {
      const idx = this.index;
      if (!idx) return;
      const pt = offsetToPoint(idx, anchor.start);
      const el = pt?.node.parentElement?.closest('.mk');
      el?.animate?.([{ transform: 'scale(1)' }, { transform: 'scale(1.06)' }, { transform: 'scale(1)' }], { duration: 360, easing: 'cubic-bezier(.34,1.4,.5,1)' });
    });
  }
  removeMarksInSelection() {
    const r = this.selectionRange();
    if (!r) return 0;
    const index = buildIndex(this.root);
    const a = rangeToAnchor(index, r);
    if (!a) return 0;
    const hit = this.store.textMarks().filter(m => { const x = resolveAnchor(index, m.anchor); return x && x.start < a.end && x.end > a.start; });
    if (hit.length) this.store.transaction(() => hit.forEach(m => this.store.remove(m.id)), 'unmark');
    getSelection()?.removeAllRanges();
    return hit.length;
  }
  markRect(id) {
    const el = this.root?.querySelector(`.mk[data-ids~="${id}"], .mk[data-ids*="${id}"]`);
    return el?.getBoundingClientRect() || null;
  }
  async addPhoto(file) {
    if (this.mode !== 'normal' || !this.layer) { toast('Фото можно добавлять в обычном режиме', {}); return; }
    return this.ctx.addPhotoTo?.(this.layer, file, this.scroller);
  }
  progressRatio() { const s = this.scroller; if (!s) return 0; const m = s.scrollHeight - s.clientHeight; return m > 0 ? s.scrollTop / m : 0; }

  destroy() {
    this.unmount();
    this._off?.();
    for (const u of this.urls.values()) URL.revokeObjectURL(u);
    this.urls.clear();
  }
}

// ---------- HTML book provider (single multicol flow inside fixed logical pages) ----------
class HtmlBook {
  constructor(doc) {
    this.doc = doc; this.page = { w: 1000, h: 1400 }; this.chrome = true; this.n = 1; this.starts = [0]; this.ready = false;
  }
  count() { return this.n; }
  invalidate() { this._idx = null; }
  mount(el) {
    this.win = h('div', { class: 'hb-window' });
    this.flow = this.doc.root;
    this.flow.classList.add('book-flow');
    this.win.append(this.flow);
    el.append(this.win);
  }
  fontLogical() {
    const small = Math.min(innerWidth, innerHeight) < 520;
    return (small ? 46 : 34) * Math.pow(1.08, this.doc.bookStep || 0);
  }
  box(page, side) { return { x: side === 'l' ? 80 : side === 'r' ? 110 : 95, y: BOX_Y, w: COL, h: BOX_H }; }
  index() { return (this._idx ||= buildIndex(this.flow)); }

  async prepare(g) {
    this.g = g;
    const f = this.flow;
    Object.assign(this.win.style, { width: g.per * g.PW + 'px', height: g.PH + 'px' });
    Object.assign(f.style, { position: 'absolute', left: '0px', top: BOX_Y + 'px', width: COL + 'px', height: BOX_H + 'px', columnWidth: COL + 'px', columnGap: GAP + 'px', columnFill: 'auto', columnCount: 'auto', fontSize: this.fontLogical() + 'px', transform: 'none', '--book-h': BOX_H + 'px' });
    await this.doc.waitImages();
    for (const d of f.querySelectorAll('details')) d.open = true;      // Book shows details expanded
    for (const t of f.querySelectorAll('table')) { t.style.zoom = ''; }
    for (const t of f.querySelectorAll('table')) { const hh = t.getBoundingClientRect().height / g.scale; if (hh > BOX_H * 0.96) t.style.zoom = String(Math.max(.72, (BOX_H * 0.94) / hh)); }   // shrink only the table, never below .72
    await new Promise(r => requestAnimationFrame(r));
    this._idx = null;
    this._cache = await db.kvGet(this.mapKey(), null).catch(() => null);
    this.measure();
    this.ready = true;
    this.doc.paintAnchored?.();
  }

  // page index of a point (client rect left) in unscaled flow space
  pageAtX(left) {
    const fl = this.flow.getBoundingClientRect().left;
    return Math.max(0, Math.floor(((left - fl) / this.g.scale + 6) / STEP));
  }
  charPage(node, off) {
    const r = document.createRange();
    const len = node.data.length;
    for (let k = off; k < Math.min(len, off + 6); k++) {
      r.setStart(node, k); r.setEnd(node, k + 1);
      const rc = r.getClientRects()[0];
      if (rc && (rc.width || rc.height)) return this.pageAtX(rc.left);
    }
    return null;
  }
  // First 10 pages are measured synchronously, the rest in idle chunks; the finished map is cached in IndexedDB keyed by
  // (document version, font size) so the next open is instant. Page COUNT is exact from the start (last visible character).
  mapKey() { return `bkmap:${this.doc.meta.id}:${this.doc.meta.adapterVersion || 'x'}:${this.doc.meta.words || 0}:${this.fontLogical().toFixed(1)}`; }
  measure() {
    this._gen = (this._gen || 0) + 1;
    const idx = this.index(), nodes = idx.nodes;
    this.starts = [0]; this.full = false;
    if (!nodes.length) { this.n = 1; this.full = true; return; }
    this.pnMemo = new Array(nodes.length).fill(undefined);
    const c = this._cache; this._cache = null;
    let last = 0;
    if (c && c.n && Array.isArray(c.starts)) { this.n = c.n; this.starts = c.starts.slice(); this.full = true; this.heads = this.collectHeads(idx); return; }
    for (let i = nodes.length - 1; i >= 0; i--) { const e = nodes[i]; const len = e.node.data.length; for (let k = len - 1; k >= Math.max(0, len - 6); k--) { const p = this.charPage(e.node, k); if (p != null) { last = p; break; } } if (last || i < nodes.length - 20) break; }
    for (const m of this.flow.querySelectorAll('img,table,figure')) { const rc = m.getBoundingClientRect(); if (rc.width) last = Math.max(last, this.pageAtX(rc.left)); }
    this.n = last + 1;
    this.heads = this.collectHeads(idx);
    for (let p = 1; p < Math.min(this.n, 10); p++) this.start(p);       // first 10 pages, synchronously
    this.fillIdle(this._gen);
  }
  collectHeads(idx) {
    return [...this.flow.querySelectorAll('h1,h2,h3,h4')].map(el => {
      const t = el.textContent.trim(); const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); const n = w.nextNode();
      const e = n && idx.map.get(n);
      return t && e ? { title: t.slice(0, 90), level: Number(el.tagName[1]) - 1, off: e.start } : null;
    }).filter(Boolean);
  }
  pageOfNode(i) { const nodes = this.index().nodes; if (this.pnMemo[i] !== undefined) return this.pnMemo[i]; const e = nodes[i]; let r = null; for (let k = 0; k < Math.min(e.node.data.length, 12); k++) { const p = this.charPage(e.node, k); if (p != null) { r = p; break; } } return (this.pnMemo[i] = r); }
  // text offset of the first character on page p (binary search through nodes, then characters)
  start(p) {
    if (p <= 0) return 0;
    if (this.starts[p] !== undefined) return this.starts[p];
    const nodes = this.index().nodes;
    let lo = 0, hi = nodes.length - 1, found = -1;
    while (lo <= hi) { const mid = (lo + hi) >> 1; let v = this.pageOfNode(mid); if (v == null) v = this.pageOfNode(Math.min(nodes.length - 1, mid + 1)) ?? 0; if (v < p) { found = mid; lo = mid + 1; } else hi = mid - 1; }
    let st = nodes[Math.max(0, found)].start;
    if (found >= 0) {
      const e = nodes[found];
      let a = 0, b = e.node.data.length;
      while (a < b) { const m = (a + b) >> 1; const cp = this.charPage(e.node, m); if (cp != null && cp < p) a = m + 1; else b = m; }
      st = a < e.node.data.length ? e.start + a : (nodes[found + 1]?.start ?? e.end);
    }
    return (this.starts[p] = Math.max(st, this.starts[p - 1] ?? 0));
  }
  async fillIdle(gen) {
    const cached = null; void cached;
    let p = 10;
    const chunk = () => new Promise(res => (window.requestIdleCallback ? requestIdleCallback(res, { timeout: 200 }) : setTimeout(res, 16)));
    while (p < this.n) {
      if (gen !== this._gen || !this.doc.root) return;
      await chunk();
      const t0 = performance.now();
      while (p < this.n && performance.now() - t0 < 10) this.start(p++);
    }
    if (gen === this._gen) { this.full = true; db.kvSet(this.mapKey(), { n: this.n, starts: this.starts.slice() }).catch(() => {}); }
  }
  pageOfOffset(off) { let lo = 0, hi = this.n - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (this.start(mid) <= off) lo = mid; else hi = mid - 1; } return lo; }
  offsetOfPage(p) { return this.start(clamp(p, 0, this.n - 1)) || 0; }
  toc() { return (this.heads || []).map(x => ({ title: x.title, level: x.level, page: this.pageOfOffset(x.off) })); }
  headerFor(page) {
    const off = this.offsetOfPage(page);
    let cur = '';
    for (const hd of this.heads || []) { if (hd.off <= off + 1) cur = hd.title; else break; }
    return cur || this.doc.meta.name;
  }
  settle(left, right, g) {
    let x;
    if (g.per === 2) x = left != null ? 80 - left * STEP : 110 + 0 - (right ?? 0) * STEP + 0;
    else x = 95 - (right ?? 0) * STEP;
    if (g.per === 2 && left == null && right != null) x = 1110 - right * STEP;
    this.flow.style.transform = `translateX(${x}px)`;
    this.flow.style.left = '0px';
  }

  // visual copy of one page's text for the page-turn animation
  face(page, side) {
    const box = this.box(page, side);
    const start = this.offsetOfPage(page), end = page + 1 < this.n ? this.offsetOfPage(page + 1) : this.index().text.length;
    const wrap = h('div', { class: 'hb-face', style: { left: box.x + 'px', top: box.y + 'px', width: box.w + 'px', height: box.h + 'px' } });
    const range = rangeFromOffsets(this.index(), start, end);
    if (!range) return wrap;
    const frag = range.cloneContents();
    let node = frag;
    for (let el = range.commonAncestorContainer; el && el !== this.flow; el = el.parentNode) {
      if (el.nodeType !== 1) continue;
      const c = el.cloneNode(false); c.appendChild(node); node = c;
    }
    const slice = h('div', { class: 'doc book-flow book-slice', style: { fontSize: this.fontLogical() + 'px', width: COL + 'px', height: BOX_H + 'px', '--book-h': BOX_H + 'px' } });
    slice.append(node);
    wrap.append(slice);
    return wrap;
  }
}
