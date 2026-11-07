// PDF and image documents. Pages are canvases (or <img>) with a PDF.js text layer and a DrawLayer for annotations.
//  - A page can be CROPPED (margins trimmed): .pg is a window, .pg-inner is the full original page placed at a negative offset,
//    so annotations stay in original page coordinates and toggling the trim never moves a mark.
//  - Highlights and brush strokes are painted INTO the page bitmap with canvas "multiply" (the text stays black and nothing
//    depends on CSS mix-blend-mode, which Safari drops inside transformed layers).
import * as db from '../db.js';
import { h, debounce, clamp, countWords, tick } from '../util.js';
import { settings } from '../settings.js';
import { openPdf, getPdfjs } from '../libs.js';
import { DrawLayer } from '../anno/draw.js';
import { resolveMarkColor, toCss } from '../anno/paint.js';
import { BRUSH_OPACITY } from '../anno/draw.js';
import { BookEngine } from './book.js';
import { BlocksView } from './blocks.js';
import { loadBounds, docCrop, pageCrop } from './trim.js';
import { bindZoom } from './zoom.js';
import { toast, progressDialog } from '../ui.js';

const MAX_PX = 9e6;     // canvas pixel budget per page (iPad Safari limit is ~16.7M)

export class PageView {
  // opts: {crop:{l,t,r,b}|null, res: pixel-scale override (book)}
  constructor(doc, n, width, opts = {}) {
    this.doc = doc; this.n = n; this.width = Math.round(width); this.crop = opts.crop || null;
    this.ratio = doc.ratios[n] || doc.meta.ratio || 1.414;
    this.token = 0; this.rendered = false; this.renderedKey = ''; this.res = opts.res || null;
    this.el = h('div', { class: 'pg', 'data-page': n });
    this.inner = h('div', { class: 'pg-inner' });
    this.media = doc.kind === 'pdf' ? h('canvas', { class: 'pg-canvas' }) : h('img', { class: 'pg-img', alt: '', draggable: 'false' });
    this.text = h('div', { class: 'textLayer' });
    this.layer = new DrawLayer({ store: doc.store, page: n, tools: doc.tools, scroller: () => doc.scrollHost, photoUrl: id => doc.photoUrl(id), onTextTap: (l, p) => doc.ctx.addText?.(l, p), onTouch: () => doc.ctx.touch?.(), onMarkTap: (ids, rect, chip) => doc.ctx.markTap?.(ids, rect, chip) });
    this.layer.canvasPaint = () => this.paint();
    this.inner.append(this.media, this.layer.under, this.text, this.layer.over);
    this.el.append(this.inner);
    this.applySize();
    this.off = doc.store.onChange(k => { if (['cmd', 'undo', 'redo'].includes(k)) this.layer.render(); });
    this.layer.render();
  }
  get cw() { return this.crop ? this.crop.r - this.crop.l : 1; }
  get ch() { return this.crop ? this.crop.b - this.crop.t : 1; }
  get innerW() { return this.width / this.cw; }
  get innerH() { return this.innerW * this.ratio; }
  get dispH() { return this.innerH * this.ch; }
  get offX() { return (this.crop ? this.crop.l : 0) * this.innerW; }
  get offY() { return (this.crop ? this.crop.t : 0) * this.innerH; }
  applySize() {
    const iw = this.innerW, ih = this.innerH;
    this.el.style.width = this.width + 'px'; this.el.style.height = Math.round(this.dispH) + 'px';
    Object.assign(this.inner.style, { width: iw + 'px', height: ih + 'px', left: -this.offX + 'px', top: -this.offY + 'px' });
    if (this.doc.kind === 'pdf') Object.assign(this.media.style, { left: this.offX + 'px', top: this.offY + 'px', width: this.width + 'px', height: this.dispH + 'px', inset: 'auto' });
    this.el.style.setProperty('--pgw', this.width + 'px');
    this.layer.setSize(iw, ih);
  }
  setWidth(w) { w = Math.round(w); if (w === this.width) return; this.width = w; this.applySize(); }
  setCrop(c) { this.crop = c; this.applySize(); this.rendered = false; }
  innerRect() { return this.inner.getBoundingClientRect(); }

  async render({ withText = true, bitmap = null } = {}) {
    const key = this.width + ':' + (this.res || '') + ':' + (this.crop ? [this.crop.l, this.crop.t, this.crop.r, this.crop.b].join(',') : '');
    if (this.rendered && this.renderedKey === key && (this.textDone || !withText)) return;
    const my = ++this.token, doc = this.doc;
    try {
      if (doc.kind === 'image') { if (!this.media.src) this.media.src = doc.imageUrl; Object.assign(this.media.style, { inset: '0', width: '100%', height: '100%', left: '', top: '' }); this.rendered = true; this.textDone = true; this.renderedKey = key; return; }
      const page = await doc.pdf.getPage(this.n);
      if (my !== this.token) return;
      const base = page.getViewport({ scale: 1 });
      const ratio = base.height / base.width;
      if (Math.abs(ratio - this.ratio) > 0.001) { this.ratio = ratio; doc.ratios[this.n] = ratio; this.applySize(); }
      const cssScale = this.innerW / base.width;
      let dpr = this.res || Math.min(window.devicePixelRatio || 1, 2);
      while (this.width * dpr * this.dispH * dpr > MAX_PX) dpr *= 0.88;
      const vp = page.getViewport({ scale: cssScale * dpr, offsetX: -this.offX * dpr, offsetY: -this.offY * dpr });
      const cw = Math.max(1, Math.round(this.width * dpr)), chh = Math.max(1, Math.round(this.dispH * dpr));
      if (!(bitmap && this.useBitmap(bitmap, cw, chh))) {
        const clean = document.createElement('canvas'); clean.width = cw; clean.height = chh;
        const ctx = clean.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cw, chh);
        this.task?.cancel?.();
        this.task = page.render({ canvasContext: ctx, canvas: clean, viewport: vp });
        await this.task.promise;
        if (my !== this.token) return;
        this.clean = clean;
      }
      this.rendered = true; this.renderedKey = key;
      this.paint();
      if (withText) {
        const pdfjs = await getPdfjs();
        this.text.replaceChildren();
        this.text.style.setProperty('--total-scale-factor', String(cssScale));
        this.text.style.setProperty('--scale-round-x', '0.01px'); this.text.style.setProperty('--scale-round-y', '0.01px');
        const tl = new pdfjs.TextLayer({ textContentSource: page.streamTextContent(), container: this.text, viewport: page.getViewport({ scale: cssScale }) });
        await tl.render();
        if (my !== this.token) return;
        // exact match with the page box (PDF.js rounds the container down; a sub-pixel gap makes selections "half a glyph")
        this.text.style.width = this.innerW + 'px'; this.text.style.height = this.innerH + 'px';
        this.text.append(h('div', { class: 'endOfContent' }));
        this.textDone = true;
      }
      page.cleanup?.();
    } catch (e) {
      if (e?.name === 'RenderingCancelledException' || my !== this.token) return;
      this.el.classList.add('pg-error'); this.rendered = false;
    }
  }
  useBitmap(bm, cw, chh) {
    if (Math.abs(bm.width - cw) > 2 || Math.abs(bm.height - chh) > 2) return false;
    const c = document.createElement('canvas'); c.width = bm.width; c.height = bm.height;
    c.getContext('2d').drawImage(bm, 0, 0); this.clean = c; return true;
  }

  // page bitmap + highlights/brush painted with canvas multiply. Called after every render and every annotation change.
  paint() {
    const clean = this.clean, c = this.media;
    if (!clean || this.doc.kind !== 'pdf') { return; }
    const ctx = c.getContext('2d');
    if (c.width !== clean.width || c.height !== clean.height) { c.width = clean.width; c.height = clean.height; }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    ctx.drawImage(clean, 0, 0);
    const recs = this.layer.recs();
    const hl = recs.filter(r => r.type === 'hl' && r.rects), br = recs.filter(r => r.type === 'brush' && r.points?.length);
    if (hl.length || br.length) {
      const k = c.width / this.width, iw = this.innerW, ox = this.offX, oy = this.offY;
      ctx.globalCompositeOperation = 'multiply';
      for (const r of hl) {
        const col = resolveMarkColor(r.color) || [255, 229, 138], yu = this.layer.yUnit(r);
        ctx.fillStyle = toCss(col);
        for (const q of r.rects) {
          const x = (q[0] * iw - ox) * k, y = (q[1] * yu * iw - oy) * k, w = q[2] * iw * k, hh = q[3] * yu * iw * k;
          if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x, y, w, hh, Math.min(3 * k, hh / 4)); ctx.fill(); } else ctx.fillRect(x, y, w, hh);
        }
      }
      // brush: strokes of one colour are unioned at full alpha, then laid over the page once with multiply at BRUSH_OPACITY
      const groups = new Map();
      for (const r of br) (groups.get(r.color) || groups.set(r.color, []).get(r.color)).push(r);
      for (const [color, list] of groups) {
        const t = document.createElement('canvas'); t.width = c.width; t.height = c.height;
        const tc = t.getContext('2d'); tc.strokeStyle = color; tc.lineCap = 'round'; tc.lineJoin = 'round';
        for (const r of list) {
          const yu = this.layer.yUnit(r);
          tc.lineWidth = (r.width || 22) / 1000 * iw * k;
          tc.beginPath();
          r.points.forEach((p, i) => { const x = (p[0] * iw - ox) * k, y = (p[1] * yu * iw - oy) * k; if (i === 0) { tc.moveTo(x, y); if (r.points.length === 1) tc.lineTo(x + 0.01, y); } else tc.lineTo(x, y); });
          tc.stroke();
        }
        ctx.globalAlpha = BRUSH_OPACITY; ctx.drawImage(t, 0, 0); ctx.globalAlpha = 1;
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    this.doc.rememberBitmap?.(this.n, c);
  }
  release() {
    this.token++;
    try { this.task?.cancel?.(); } catch { /* ignore */ }
    if (this.doc.kind === 'pdf') { this.media.width = 1; this.media.height = 1; this.text.replaceChildren(); this.clean = null; }
    this.rendered = false; this.textDone = false;
  }
  destroy() { this.release(); this.off?.(); this.el.remove(); }
}

export class PdfDoc {
  constructor(ctx) {
    this.ctx = ctx; this.meta = ctx.meta; this.kind = ctx.meta.type; this.stage = ctx.stage; this.store = ctx.store; this.tools = ctx.tools;
    this.ratios = {}; this.views = []; this.cleanups = []; this.photoUrls = new Map(); this.zoom = 1; this.mode = null; this.bitmaps = new Map();
    this.crop = null; this.boundsRec = null; this.trimOn = false; this._wanted = new Set(); this._q = Promise.resolve();
  }
  caps() { return { draw: true, text: true, photo: true, select: this.kind === 'pdf', zoom: true, trim: this.kind === 'pdf' && !!this.hasTrim }; }

  async load() {
    this.docRec = await db.get('docs', this.meta.id);
    if (!this.docRec) throw new Error('Файл не найден в хранилище.');
    if (this.kind === 'pdf') {
      try { this.pdf = await openPdf(await this.docRec.original.arrayBuffer()); } catch { throw new Error('Не удалось открыть PDF: файл повреждён.'); }
      this.numPages = this.pdf.numPages;
      this.trimOn = await db.kvGet(`trim:${this.meta.id}`, settings().trimMargins !== false);
      await this.prepareTrim();
    } else { this.numPages = 1; this.imageUrl = URL.createObjectURL(this.docRec.original); }
    this.bindSelectionGuard();
  }
  async prepareTrim() {
    let p = null;
    try {
      const cached = await db.kvGet(`pdfbounds:${this.meta.id}`, null);
      if (!(cached && cached.v === 1 && cached.n === this.numPages) && this.numPages > 6) p = progressDialog('Ищем поля страниц');
      this.boundsRec = await loadBounds(this, (f, t) => p?.update(f, t));
    } catch { this.boundsRec = null; } finally { p?.close(); }
    this.baseCrop = docCrop(this.boundsRec);
    this.hasTrim = !!this.baseCrop;
    this.crop = this.trimOn ? this.baseCrop : null;
  }
  async setTrim(on) {
    this.trimOn = !!on; await db.kvSet(`trim:${this.meta.id}`, this.trimOn);
    this.crop = this.trimOn ? this.baseCrop : null; this.bitmaps.clear();
  }
  // displayed height / width of a page with the document crop applied
  displayRatio(c = this.crop) { const r = this.meta.ratio || 1.414; return c ? ((c.b - c.t) * r) / (c.r - c.l) : r; }
  // a book page must stay page-shaped: if trimming made it too flat, give back some vertical margin (symmetric)
  bookCrop() {
    const c = this.crop; if (!c) return null;
    const r = this.meta.ratio || 1.414, w = c.r - c.l, target = 1.2, h = c.b - c.t;
    if ((h * r) / w >= target) return c;
    const need = Math.min(1, (target * w) / r), extra = need - h;
    let t = c.t - extra / 2, b = c.b + extra / 2;
    if (t < 0) { b -= t; t = 0; } if (b > 1) { t -= b - 1; b = 1; }
    return { l: c.l, r: c.r, t: Math.max(0, t), b: Math.min(1, b) };
  }

  async photoUrl(id) {
    if (this.photoUrls.has(id)) return this.photoUrls.get(id);
    const rec = await db.get('images', id);
    if (!rec) return '';
    const u = URL.createObjectURL(rec.blob); this.photoUrls.set(id, u); return u;
  }
  rememberBitmap(n, canvas) {
    if (canvas.width < 4) return;
    const bm = document.createElement('canvas'); bm.width = canvas.width; bm.height = canvas.height;
    bm.getContext('2d').drawImage(canvas, 0, 0);
    this.bitmaps.set(n, bm);
    if (this.bitmaps.size > 10) this.bitmaps.delete(this.bitmaps.keys().next().value);
  }

  async setMode(mode, pos) {
    this.unmount();
    this.mode = mode; this.bitmaps.clear();
    this.zoom = await db.kvGet(`zoom:${this.meta.id}:${mode}`, 1);
    if (mode === 'normal') await this.mountNormal(pos);
    else if (mode === 'book') await this.mountBook(pos);
    else await this.mountBlocks(pos);
    this.ctx.onZoom?.(this.zoom);
  }
  unmount() {
    for (const c of this.cleanups.splice(0)) { try { c(); } catch { /* ignore */ } }
    this.disposeViews();
    this.engine?.destroy(); this.engine = null;
    this.blocks?.destroy(); this.blocks = null;
    this.stage.replaceChildren(); this.scrollHost = null;
  }
  disposeViews() { this.views.forEach(v => v.destroy()); this.views = []; this.io?.disconnect(); this.io = null; this._wanted.clear(); }

  // ---- zoom (Normal and Book; remembered per document and per mode) ----
  zoomValue() { return this.zoom; }
  setZoom(z, anchor) {
    z = clamp(z, settings().zoomMin ?? 0.6, settings().zoomMax ?? 3);
    if (Math.abs(z - this.zoom) < 0.005) return;
    const z0 = this.zoom; this.zoom = z;
    db.kvSet(`zoom:${this.meta.id}:${this.mode}`, z).catch(() => {});
    if (this.mode === 'normal') this.relayoutRibbon(z / z0, anchor);
    else if (this.mode === 'book') this.engine?.setZoom(z);
    this.ctx.onZoom?.(z);
  }
  zoomBy(f) { this.setZoom(this.zoom * f); }
  // "по ширине": full stage width; again: back to the default column
  fitWidth() {
    if (this.mode === 'book') { this.setZoom(1); return; }
    const host = this.scrollHost; if (!host) return;
    const full = (host.clientWidth - 24) / this.baseWidth(host);
    this.setZoom(Math.abs(this.zoom - full) < 0.03 ? 1 : full);
  }
  baseWidth(host) { return Math.max(240, Math.min(host.clientWidth - 24, 900)); }
  pageWidth(host) { return Math.max(200, this.baseWidth(host) * this.zoom); }

  // vertical ribbon of pages (normal mode)
  buildRibbon(host, nums, onPage) {
    this.disposeViews();
    const strip = h('div', { class: 'ribbon' });
    host.replaceChildren(strip);
    this.scrollHost = host; this.strip = strip;
    const w = this.pageWidth(host);
    this.views = nums.map(n => { const v = new PageView(this, n, w, { crop: this.crop }); strip.append(v.el); return v; });
    this.io = new IntersectionObserver(entries => {
      for (const en of entries) { const v = this.views.find(x => x.el === en.target); if (!v) continue; if (en.isIntersecting) this.want(v); else this.unwant(v); }
    }, { root: host, rootMargin: '100% 0px' });
    this.views.forEach(v => this.io.observe(v.el));
    if (onPage) { const cb = debounce(() => { const v = this.currentView(host); if (v) onPage(v.n); }, 300); host.addEventListener('scroll', cb, { passive: true }); this.cleanups.push(() => cb.cancel()); }
    return strip;
  }
  // render queue: one page at a time, nearest first, so scrolling never stalls on parallel canvas work
  want(v) { if (this._wanted.has(v)) return; this._wanted.add(v); this._q = this._q.then(() => (this._wanted.has(v) ? v.render() : null)).catch(() => {}); }
  unwant(v) { this._wanted.delete(v); v.release(); }
  currentView(host) {
    const hr = host.getBoundingClientRect(), mid = hr.top + hr.height * 0.35;
    return this.views.find(v => { const r = v.el.getBoundingClientRect(); return r.top <= mid && r.bottom >= mid; }) || this.views[0];
  }
  relayoutRibbon(factor = 1, anchor) {
    const host = this.scrollHost;
    if (!host || !this.views.length) return;
    const r = host.getBoundingClientRect();
    const ax = anchor ? anchor[0] - r.left : host.clientWidth / 2, ay = anchor ? anchor[1] - r.top : host.clientHeight / 2;
    const sx = (host.scrollLeft + ax) * factor - ax, sy = (host.scrollTop + ay) * factor - ay;
    const w = this.pageWidth(host);
    this.io.disconnect();
    this.views.forEach(v => { v.crop = this.crop; v.setWidth(w); v.release(); });
    this._wanted.clear();
    host.scrollTop = sy; host.scrollLeft = Math.max(0, sx);
    this.views.forEach(v => this.io.observe(v.el));
  }

  async mountNormal(pos) {
    const host = h('div', { class: 'scroll-col rd-scroll pdf-col' });
    this.stage.replaceChildren(host);
    this.buildRibbon(host, Array.from({ length: this.numPages }, (_, i) => i + 1), n => {
      const max = host.scrollHeight - host.clientHeight, ratio = max > 0 ? host.scrollTop / max : 0;
      this.ctx.savePos('normal', { page: n, ratio }); this.ctx.progress?.(ratio);
    });
    await new Promise(r => requestAnimationFrame(r));
    if (pos?.ratio != null) host.scrollTop = pos.ratio * (host.scrollHeight - host.clientHeight);
    const onResize = debounce(() => this.relayoutRibbon(), 250);
    let rw = host.clientWidth;
    const ro = new ResizeObserver(() => { if (host.clientWidth !== rw) { rw = host.clientWidth; onResize(); } });
    ro.observe(host);
    const off = bindZoom(host, { target: () => this.strip, current: () => this.zoom, enabled: () => !this.tools.drawing(), commit: (z, cx, cy) => this.setZoom(z, [cx, cy]), onDouble: () => this.fitWidth(), min: settings().zoomMin, max: settings().zoomMax });
    this.cleanups.push(() => { ro.disconnect(); onResize.cancel(); off(); });
  }

  // ----- book -----
  async mountBook(pos) {
    const prov = new PdfBook(this);
    this.engine = new BookEngine(this.stage, prov, {
      docId: this.meta.id, cover: !!settings().bookCover, startPage: pos?.page ?? 0, zoom: this.zoom,
      coverEl: () => this.ctx.coverFace?.(),
      gesturesOff: () => this.tools.drawing(),
      onZoom: z => { this.zoom = z; db.kvSet(`zoom:${this.meta.id}:book`, z).catch(() => {}); this.ctx.onZoom?.(z); },
      onView: (page, n) => { this.ctx.savePos('book', { page }); this.ctx.progress?.(n > 1 ? page / (n - 1) : 0); },
      onCenterTap: () => this.ctx.toggleChrome?.(),
    });
    this.book = prov;
    await this.engine.relayout(pos?.page ?? 0);
  }

  // ----- blocks -----
  async mountBlocks(pos) {
    this.blocks = new BlocksView({ doc: this, ctx: this.ctx, host: this.stage, pos });
    await this.blocks.init();
  }
  async ensureWords() {
    if (this.kind !== 'pdf') return [200];
    if (this.words) return this.words;
    const cached = await db.kvGet(`pdfwords:${this.meta.id}`, null);
    if (cached && cached.length === this.numPages) return (this.words = cached);
    const p = progressDialog('Считаем текст на страницах');
    const words = [];
    try {
      for (let n = 1; n <= this.numPages; n++) {
        const page = await this.pdf.getPage(n);
        const tc = await page.getTextContent();
        words.push(countWords(tc.items.map(i => i.str).join(' ')));
        page.cleanup?.();
        if (n % 5 === 0) { p.update(n / this.numPages, `${n} из ${this.numPages}`); await tick(); }
      }
    } finally { p.close(); }
    this.words = words;
    await db.kvSet(`pdfwords:${this.meta.id}`, words).catch(() => {});
    return words;
  }
  async blocksSource() {
    const words = await this.ensureWords();
    const outline = await this.outlineItems();
    const byPage = new Map(outline.map(o => [o.page, o]));
    const items = Array.from({ length: this.numPages }, (_, i) => {
      const o = byPage.get(i);
      // pages with (almost) no text are cheap, so neighbouring pages merge into one compact block
      return { words: words[i] > 0 ? words[i] : Math.round(settings().wpm * 0.35), images: 0, level: o ? Math.min(3, (o.level || 0) + 1) : 0, text: o ? o.title : '', page: i + 1 };
    });
    return { items, titleFor: b => (items[b.start].text || `Страницы ${b.start + 1}–${b.end}`), unitKey: i => 'p' + (i + 1) };
  }
  blockPages(src, b) { return Array.from({ length: b.end - b.start }, (_, k) => b.start + k + 1); }
  // pages of a block as compact crops (horizontal: document crop; vertical: the page's own content)
  renderBlockPages(src, b) {
    const box = h('div', { class: 'bk-pages' });
    const nums = this.blockPages(src, b);
    const width = 720;
    const views = nums.map(n => { const v = new PageView(this, n, width, { crop: this.trimOn ? pageCrop(this.boundsRec, this.baseCrop, n) : null }); v.el.classList.add('bk-pg'); box.append(v.el); return v; });
    this.views.push(...views);
    const io = new IntersectionObserver(es => { for (const en of es) { const v = views.find(x => x.el === en.target); if (!v) continue; if (en.isIntersecting) this.want(v); else this.unwant(v); } }, { rootMargin: '100% 0px' });
    views.forEach(v => io.observe(v.el));
    (this._ios ||= []).push(io);
    this.cleanups.push(() => io.disconnect());
    // fit width to the card after layout
    requestAnimationFrame(() => { const w = Math.min(box.clientWidth || width, 900); views.forEach(v => v.setWidth(w)); });
    return box;
  }
  async jumpTo(bm) { if (bm.kind !== 'page') return; if (this.engine) this.engine.goPage(bm.ref - 1); else this.views.find(v => v.n === bm.ref)?.el.scrollIntoView({ block: 'start' }); }
  async currentBlock() { return this.blocks ? this.blocks.currentBlock() : null; }
  async toggleBlockRead(b) { return this.blocks.toggleBlockRead(b); }
  // plain paragraphs of some pages (for the auto questions); cached
  async blockText(pages) {
    const out = [];
    for (const n of pages) {
      if (this.kind !== 'pdf') continue;
      this._txt ||= new Map();
      if (!this._txt.has(n)) {
        const page = await this.pdf.getPage(n); const tc = await page.getTextContent();
        let line = '', lines = [];
        for (const it of tc.items) { line += it.str; if (it.hasEOL) { lines.push(line); line = ''; } }
        if (line) lines.push(line);
        this._txt.set(n, lines.join(' ').replace(/\s+/g, ' ').trim()); page.cleanup?.();
      }
      out.push({ text: this._txt.get(n), tag: 'P' });
    }
    return out;
  }
  async outlineItems() {
    if (this.kind !== 'pdf') return [];
    if (this._outline) return this._outline;
    const out = [];
    try {
      const outline = await this.pdf.getOutline();
      const walk = async (items, level) => {
        for (const it of items || []) {
          if (out.length > 400) return;
          let page = null;
          try { let dest = it.dest; if (typeof dest === 'string') dest = await this.pdf.getDestination(dest); if (Array.isArray(dest)) page = await this.pdf.getPageIndex(dest[0]); } catch { /* skip */ }
          if (page != null) out.push({ title: (it.title || '').trim().slice(0, 80) || '—', level, page });
          if (it.items?.length && level < 2) await walk(it.items, level + 1);
        }
      };
      if (outline) await walk(outline, 0);
    } catch { /* no outline */ }
    return (this._outline = out);
  }

  // ----- selection & marks -----
  selectionRange() {
    const sel = getSelection();
    if (!sel || !sel.rangeCount || sel.isCollapsed) return null;
    const r = sel.getRangeAt(0);
    if (!this.stage.contains(r.commonAncestorContainer) || !String(sel).trim()) return null;
    return r;
  }
  hasSelection() { return !!this.selectionRange(); }
  selectionText() { return String(getSelection() || ''); }
  selectionRect() { const r = this.selectionRange(); return r ? r.getBoundingClientRect() : null; }
  // One rectangle per text line, in ORIGINAL page coordinates (x: fraction of width, y/h: units of page width),
  // clipped to the line box: about 0.95 of the glyph row, never taller, so a mark can never swallow the next line.
  selectionRects(range) {
    const byPage = new Map();
    const pgs = [...this.stage.querySelectorAll('.pg')].map(el => ({ r: el.getBoundingClientRect(), ir: el.querySelector('.pg-inner').getBoundingClientRect(), n: Number(el.dataset.page) }));
    const all = [...range.getClientRects()].filter(cr => cr.width >= 1 && cr.height >= 2);
    const hs = all.map(c => c.height).sort((a, b) => a - b), med = hs[hs.length >> 1] || 0;
    for (const cr of all) {
      if (cr.height > med * 3.5) continue;                                   // a block-level rect (whole layer), not a line
      const cx = cr.left + cr.width / 2, cy = cr.top + cr.height / 2;
      const pg = pgs.find(p => cx >= p.r.left && cx <= p.r.right && cy >= p.r.top && cy <= p.r.bottom);
      if (!pg) continue;
      const W = pg.ir.width;
      const left = Math.max(cr.left, pg.r.left), right = Math.min(cr.right, pg.r.right);
      const hh = cr.height * 0.95, top = cr.top + (cr.height - hh) / 2;
      (byPage.get(pg.n) || byPage.set(pg.n, []).get(pg.n)).push([(left - pg.ir.left) / W, (top - pg.ir.top) / W, (right - left) / W, hh / W]);
    }
    for (const [n, rects] of byPage) {
      rects.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
      const merged = [];
      for (const r of rects) {
        const l = merged[merged.length - 1];
        const sameLine = l && Math.abs((l[1] + l[3] / 2) - (r[1] + r[3] / 2)) < Math.max(l[3], r[3]) * 0.45;
        if (sameLine && r[0] <= l[0] + l[2] + 0.012) { const top = Math.min(l[1], r[1]), bot = Math.max(l[1] + l[3], r[1] + r[3]); const right = Math.max(l[0] + l[2], r[0] + r[2]); l[1] = top; l[3] = bot - top; l[2] = right - l[0]; }
        else merged.push([...r]);
      }
      byPage.set(n, merged.map(r => r.map(v => Math.round(v * 10000) / 10000)));
    }
    return byPage;
  }
  snapshot() { const r = this.selectionRange(); return r ? Object.assign(r.cloneRange(), { _text: String(getSelection()) }) : null; }
  applyTextMark(type, props = {}, snap = null) {
    const r = snap || this.selectionRange();
    if (!r) return null;
    const byPage = this.selectionRects(r);
    if (!byPage.size) return null;
    const quote = (snap?._text ?? String(getSelection())).slice(0, 200);
    let last = null;
    this.store.transaction(() => { for (const [page, rects] of byPage) last = this.store.add({ type, page, rects, anchor: { quote, start: 0, end: 0, prefix: '', suffix: '' }, ...props }); }, 'mark');
    getSelection()?.removeAllRanges();
    return last;
  }
  removeMarksInSelection() {
    const r = this.selectionRange();
    if (!r) return 0;
    const byPage = this.selectionRects(r);
    const hit = [];
    for (const [n, rects] of byPage) for (const a of this.store.forPage(n)) if (a.rects && a.rects.some(q => rects.some(s => q[0] < s[0] + s[2] && q[0] + q[2] > s[0] && q[1] < s[1] + s[3] && q[1] + q[3] > s[1]))) hit.push(a);
    if (hit.length) this.store.transaction(() => hit.forEach(a => this.store.remove(a.id)), 'unmark');
    getSelection()?.removeAllRanges();
    return hit.length;
  }
  // tap on a page: which rect-marks are under the point (original page coordinates)
  marksAt(clientX, clientY) {
    const el = document.elementFromPoint(clientX, clientY)?.closest?.('.pg');
    if (!el) return [];
    const r = el.querySelector('.pg-inner').getBoundingClientRect(), n = Number(el.dataset.page);
    const x = (clientX - r.left) / r.width, y = (clientY - r.top) / r.width;
    return this.store.forPage(n).filter(a => a.rects && a.rects.some(q => x >= q[0] && x <= q[0] + q[2] && y >= q[1] && y <= q[1] + q[3]));
  }
  markRect(id) {
    const a = this.store.get(id); if (!a?.rects) return null;
    const pg = this.stage.querySelector(`.pg[data-page="${a.page}"] .pg-inner`); if (!pg) return null;
    const r = pg.getBoundingClientRect(), q = a.rects[0];
    return new DOMRect(r.left + q[0] * r.width, r.top + q[1] * r.width, q[2] * r.width, q[3] * r.width);
  }
  visibleView() {
    const hr = this.stage.getBoundingClientRect();
    let best = null, ba = 0;
    for (const v of this.views) { const r = v.el.getBoundingClientRect(); const a = Math.max(0, Math.min(r.bottom, hr.bottom) - Math.max(r.top, hr.top)) * Math.max(0, Math.min(r.right, hr.right) - Math.max(r.left, hr.left)); if (a > ba) { ba = a; best = v; } }
    return best || this.views[0];
  }
  async addPhoto(file) {
    const view = this.visibleView();
    if (!view) { toast('Нет страницы для фото'); return; }
    return this.ctx.addPhotoTo?.(view.layer, file, this.scrollHost);
  }
  progressRatio() { const s = this.scrollHost; if (!s) return 0; const m = s.scrollHeight - s.clientHeight; return m > 0 ? s.scrollTop / m : 0; }

  // ---- selection root-cause fixes -------------------------------------------------------------------------------------
  // (1) endOfContent "selecting" trick so a drag cannot jump across the page; (2) on touch/pen a selection that swallows
  // (nearly) a whole page or several pages (iOS long-press) is cut back to the word under the finger.
  bindSelectionGuard() {
    let ptr = null;
    const down = e => { ptr = { x: e.clientX, y: e.clientY, t: performance.now(), type: e.pointerType }; };
    document.addEventListener('pointerdown', down, true);
    const guard = debounce(() => {
      const sel = getSelection();
      const layers = [...this.stage.querySelectorAll('.textLayer')];
      const hasR = sel && sel.rangeCount && !sel.isCollapsed;
      const r = hasR ? sel.getRangeAt(0) : null;
      for (const l of layers) l.classList.toggle('selecting', !!(r && r.intersectsNode(l)));
      if (!r || !ptr || ptr.type === 'mouse' || performance.now() - ptr.t > 4000) return;
      let touched = 0, total = 0, pages = 0;
      for (const l of layers) {
        if (!r.intersectsNode(l)) continue;
        pages++;
        for (const sp of l.querySelectorAll(':scope > span:not(.markedContent)')) { total++; if (r.intersectsNode(sp)) touched++; }
      }
      if (pages > 2 || (total >= 20 && touched > 0.85 * total)) this.collapseToWord(ptr.x, ptr.y);
    }, 80);
    document.addEventListener('selectionchange', guard);
    const up = () => this.stage.querySelectorAll('.textLayer.selecting').forEach(l => l.classList.remove('selecting'));
    document.addEventListener('pointerup', up, true);
    this._guardOff = () => { document.removeEventListener('pointerdown', down, true); document.removeEventListener('selectionchange', guard); document.removeEventListener('pointerup', up, true); guard.cancel(); };
  }
  collapseToWord(x, y) {
    const sel = getSelection();
    this.stage.querySelectorAll('.textLayer.selecting').forEach(l => l.classList.remove('selecting'));   // else endOfContent covers the layer and hides the words from hit-testing
    let pos = null;
    if (document.caretPositionFromPoint) { const p = document.caretPositionFromPoint(x, y); if (p) pos = { node: p.offsetNode, off: p.offset }; }
    else if (document.caretRangeFromPoint) { const p = document.caretRangeFromPoint(x, y); if (p) pos = { node: p.startContainer, off: p.startOffset }; }
    if (!pos || pos.node.nodeType !== 3 || !this.stage.contains(pos.node)) { sel.removeAllRanges(); return; }
    const t = pos.node.data; let a = Math.min(pos.off, t.length), b = a;
    while (a > 0 && /[\p{L}\p{N}]/u.test(t[a - 1])) a--;
    while (b < t.length && /[\p{L}\p{N}]/u.test(t[b])) b++;
    if (a === b) { sel.removeAllRanges(); return; }
    const rg = document.createRange(); rg.setStart(pos.node, a); rg.setEnd(pos.node, b);
    sel.removeAllRanges(); sel.addRange(rg);
  }
  destroy() {
    this._guardOff?.();
    this.unmount();
    for (const u of this.photoUrls.values()) URL.revokeObjectURL(u);
    if (this.imageUrl) URL.revokeObjectURL(this.imageUrl);
    try { this.pdf?.destroy(); } catch { /* ignore */ }
  }
}

// ---------- PDF book provider ----------
class PdfBook {
  constructor(doc) {
    this.doc = doc; this.chrome = false;
    this.crop = doc.bookCrop();
    this.page = { w: 1000, h: Math.round(1000 * doc.displayRatio(this.crop)) };
    this.live = new Map();
  }
  count() { return this.doc.numPages; }
  mount(el) { this.win = h('div', { class: 'pb-window' }); el.append(this.win); }
  box() { return { x: 0, y: 0, w: this.page.w, h: this.page.h }; }
  async prepare(g) {
    this.g = g;
    this.res = clamp(g.scale * Math.min(window.devicePixelRatio || 1, 2), 0.5, 2.5);
    Object.assign(this.win.style, { width: g.per * g.PW + 'px', height: g.PH + 'px' });
  }
  settle(left, right, g) {
    this.live.forEach(v => v.destroy()); this.live.clear();
    const mk = (page, x) => {
      if (page == null) return;
      const v = new PageView(this.doc, page + 1, this.page.w, { crop: this.crop, res: this.res });
      v.el.style.position = 'absolute'; v.el.style.left = x + 'px'; v.el.style.top = '0px';
      this.win.append(v.el); this.live.set(page, v);
      this.doc.views.push(v);
      v.render({ bitmap: this.doc.bitmaps.get(page + 1) });
    };
    if (g.per === 2) { mk(left, 0); mk(right, this.page.w); } else mk(right, 0);
    this.prefetch([left, right]);
  }
  async prefetch(center) {
    const cs = center.filter(x => x != null);
    if (!cs.length || this.doc.kind !== 'pdf') return;
    const lo = Math.min(...cs) - 2, hi = Math.max(...cs) + 2;
    for (let p = lo; p <= hi; p++) {
      if (p < 0 || p >= this.count() || this.doc.bitmaps.has(p + 1) || this.live.has(p)) continue;
      const v = new PageView(this.doc, p + 1, this.page.w, { crop: this.crop, res: this.res });
      await v.render({ withText: false });
      v.destroy();
      await new Promise(r => setTimeout(r, 30));
    }
  }
  face(page) {
    const wrap = h('div', { class: 'pb-face', style: { width: this.page.w + 'px', height: this.page.h + 'px' } });
    const bm = this.doc.bitmaps.get(page + 1);
    if (bm) { const c = document.createElement('canvas'); c.width = bm.width; c.height = bm.height; c.className = 'pg-canvas'; c.getContext('2d').drawImage(bm, 0, 0); wrap.append(c); }
    else if (this.doc.kind === 'image') wrap.append(h('img', { class: 'pg-img', src: this.doc.imageUrl, alt: '' }));
    return wrap;
  }
  headerFor() { return ''; }
  async toc() { return (await this.doc.outlineItems()).map(o => ({ title: o.title, level: o.level, page: o.page })); }
}
