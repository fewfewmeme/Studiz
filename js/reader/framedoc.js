// Every HTML document is shown in its OWN sandboxed iframe with its OWN css; a small runtime inside the frame changes only
// layout (scroll / book / blocks), zoom, width and draws marks. This class is the parent side: views, zoom state, marks sync, storage.
import * as db from '../db.js';
import { h, debounce, clamp } from '../util.js';
import { MARK_COLORS } from '../../config.js';
import { FrameHost } from '../frame/host.js';
import { frameHtml, fontCss } from '../frame/build.js';
import { toast, customDialog } from '../ui.js';
import { FrameBlocks } from './frameblocks.js';
import { stickerSrc, subjectStickerName } from '../assets.js';
import { subjectName } from '../views/common.js';
import { icon } from '../icons.js';
import { cleanCfg, cleanPos, cleanEdits, num } from '../viewstate.js';

export const ZOOM_STEPS = [50, 55, 60, 65, 70, 75, 80, 85, 90, 100, 110, 125, 150, 175, 200];
export const ZOOM_DEFAULT = 75;
const PACE = { slow: 1.4, normal: 1, fast: 0.75 };
const VIEW = { normal: 'scroll', book: 'book', blocks: 'blocks', orig: 'orig' };

export function looksLikeApp(raw) {
  return /<script\b/i.test(raw) && (/class\s*=\s*["'][^"']*\bblk\b/.test(raw) || /position\s*:\s*(sticky|fixed)/i.test(raw) || /data-theme/i.test(raw));
}
async function decode(blob) {
  const buf = await blob.arrayBuffer();
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch { return new TextDecoder('windows-1251').decode(buf); }
}

export class FrameDoc {
  constructor(ctx) {
    this.ctx = ctx; this.meta = ctx.meta; this.id = ctx.meta.id; this.stage = ctx.stage; this.store = ctx.store; this.tools = ctx.tools;
    this.kind = 'html'; this.mode = null; this.host = null; this.sel = { has: false }; this.info = { blocks: [], parts: [] };
    this.cfgState = { zoom: {}, width: 'wide', weight: 'file', family: 'file' };
    this.pointerDown = false; this.theme = null; this.pageInfo = null; this.unanch = [];
  }
  insets() { return this.ctx.root.classList.contains('port') ? { t: 48, b: 74 } : { t: 0, b: 0 }; }
  relayoutInsets() { this.host?.send('insets', { ins: this.insets() }); }
  caps() { return { draw: this.mode !== 'orig', text: this.mode !== 'orig', photo: this.mode !== 'orig', select: true, zoom: true, trim: false }; }
  get views() { return this.isApp ? ['orig', 'normal', 'book', 'blocks'] : ['normal', 'book', 'blocks']; }
  get defaultView() { return this.isApp ? 'orig' : 'normal'; }

  async load() {
    const rec = await db.get('docs', this.id);
    let work = await db.get('work', this.id);
    if (!rec && !work?.converted) throw new Error('Файл не найден в хранилище.');
    // a Word / Markdown / text / PDF file imported before Round 7 is converted now (once)
    if (!work?.converted && this.meta.srcKind && this.meta.srcKind !== 'html') {
      const { convertToFrame } = await import('../convert/index.js');
      const conv = await convertToFrame({ kind: this.meta.srcKind, buf: await rec.original.arrayBuffer(), name: this.meta.name });
      work = { id: this.id, html: conv.html, converted: true }; await db.put('work', work);
      db.modify('files', this.id, f => (f ? { ...f, conv: true, layout: conv.layout } : f)).catch(() => {});
    }
    this.raw = work?.converted ? work.html : (await decode(rec.original));
    this.converted = !!work?.converted;
    this.isApp = !this.converted && looksLikeApp(this.raw);
    this.docState = await db.kvGet('ds:' + this.id, {});
    // everything restored from storage is validated and clamped: a broken value falls back to the default instead of reproducing a broken view
    const saved = await db.kvGet('fz:' + this.id, null);
    if (saved) Object.assign(this.cfgState, cleanCfg(saved));
    this.pos = cleanPos(await db.kvGet('fpos:' + this.id, {}));
    this.edits = cleanEdits(await db.kvGet('bkedit:' + this.id, { splits: [], merges: [] }));
    if (!this.docState || typeof this.docState !== 'object' || Array.isArray(this.docState)) this.docState = {};
    this._offStore = this.store.onChange((kind, ids) => { if (['cmd', 'undo', 'redo', 'live'].includes(kind)) this.pushMarks(ids); });
    this.blocks = new FrameBlocks(this);
    await this.blocks.init();
  }

  // ---------------- zoom / width / font (one source of truth: here) ----------------
  zoomOf(mode = this.mode) { return num(this.cfgState.zoom[mode], ZOOM_STEPS[0], 400, ZOOM_DEFAULT); }
  zoomValue() { return this.zoomOf() / 100; }
  stepIndex(z) { let bi = 0; ZOOM_STEPS.forEach((s, i) => { if (Math.abs(s - z) < Math.abs(ZOOM_STEPS[bi] - z)) bi = i; }); return bi; }
  get continuous() { return this.meta.layout ? /^pages/.test(this.meta.layout) : this.meta.type === 'image'; }   // page pictures zoom continuously 50–400 %
  setZoomPct(z, mode = this.mode, { fromFrame = false } = {}) {
    z = clamp(Math.round(z), ZOOM_STEPS[0], this.continuous ? 400 : ZOOM_STEPS[ZOOM_STEPS.length - 1]);
    this.cfgState.zoom[mode] = z; this.persistCfg();
    this.ctx.onZoom?.(z / 100);
    if (!fromFrame) this.host?.send('zoom', { z });
  }
  zoomStep(dir) { const i = clamp(this.stepIndex(this.zoomOf()) + dir, 0, ZOOM_STEPS.length - 1); this.setZoomPct(ZOOM_STEPS[i]); }
  zoomBy(f) { this.zoomStep(f > 1 ? 1 : -1); }
  setZoom(z) { this.setZoomPct(this.stepZoom(z)); }
  stepZoom(z) { return ZOOM_STEPS[this.stepIndex(z <= 3 ? z * 100 : z)]; }
  resetZoom() { this.setZoomPct(ZOOM_DEFAULT); }
  // «По ширине»: the file's own width at the nearest step that fills the reading area
  async fitWidth() {
    if (this.cfgState.width !== 'original') { this.cfgState.width = 'original'; this.host?.send('width', { w: 'original' }); }
    const nat = await this.query('natural');
    this.persistCfg();
    if (nat > 0) { const vw = this.stage.clientWidth; this.setZoomPct(ZOOM_STEPS[this.stepIndex(vw / nat * 100)]); }
  }
  setWidth(w) { this.cfgState.width = w; this.persistCfg(); this.host?.send('width', { w }); }
  setFont(patch) { Object.assign(this.cfgState, patch); this.persistCfg(); if (patch.family && patch.family !== 'file') this.sendFontCss(); this.host?.send('font', patch); }
  async sendFontCss() { const css = await fontCss(['Manrope', 'PT Serif']); this.host?.send('fontcss', { css }); }
  persistCfg() { db.kvSet('fz:' + this.id, this.cfgState).catch(() => {}); }

  query(q, timeout = 1500) {
    return new Promise(res => {
      const t = setTimeout(() => { this._q = null; res(null); }, timeout);
      this._q = { q, res: v => { clearTimeout(t); res(v); } };
      this.host?.send('query', { q });
    });
  }

  // ---------------- views ----------------
  async setMode(mode) {
    if (!this.views.includes(mode)) mode = this.defaultView;
    const prev = this.host;
    let pos = this.pos;
    if (prev && this.mode) { const a = await this.query('anchor', 800).catch(() => null); if (a && this.mode !== 'orig') this.pos = pos = { ...pos, anchor: a }; }
    this.mode = mode;
    const view = VIEW[mode];
    const cfg = {
      id: this.id, view, zoom: this.zoomOf(mode), width: this.cfgState.width, weight: this.cfgState.weight, family: this.cfgState.family,
      insets: this.insets(), pace: PACE[this.ctx.getSettings?.().pace] || 1, edits: this.edits, state: this.docState, marks: this.store.all(), palette: MARK_COLORS, dpr: devicePixelRatio || 1,
      pos: mode === 'orig' ? { top: pos.top || 0 } : (pos.anchor || null),
      title: this.meta.name, subject: this.meta.subject, perf: /perf=1/.test(location.hash + location.search),
      cover: view === 'book' ? { title: this.meta.name, subject: subjectName(this.meta.subject), sticker: await this.stickerData() } : null,
    };
    const fams = [...(this.cfgState.family !== 'file' ? ['Manrope', 'PT Serif'] : []), ...(view === 'book' ? ['Cormorant'] : [])];
    const extra = fams.length ? await fontCss([...new Set(fams)]) : '';
    const html = await frameHtml(this.raw, { view, cfg, extraCss: extra });
    const host = new FrameHost(this.id, d => this.onMessage(d, host)); this.loading = host;
    host.iframe.classList.add('lz-hidden'); host.iframe.classList.toggle('lz-book', view === 'book');
    this.stage.append(host.iframe);
    let ready;
    try { ready = await host.load(html); }
    catch (e) { host.destroy(); throw e; }
    this.host = host;
    if (prev) prev.destroy();
    host.iframe.classList.remove('lz-hidden');
    this.stage.querySelector('.rd-loading')?.remove();
    this.info = { blocks: ready.blocks || [], parts: ready.parts || [], words: ready.words, imgs: ready.imgs };
    this.ctx.onZoom?.(this.zoomOf(mode) / 100);
    this.ctx.root.classList.toggle('orig', mode === 'orig');
    if (this.cfgState.family !== 'file') this.sendFontCss();
    this.pushTool();
    this.togglePager(mode === 'book');
    await this.blocks.attach(mode, host, ready);
    host.focus();
  }

  onMessage(d, host) {
    if (host !== this.host && host !== this.loading) return;
    switch (d.type) {
      case 'storage': this.docState = d.data; clearTimeout(this._dsT); this._dsT = setTimeout(() => db.kvSet('ds:' + this.id, this.docState).catch(() => {}), 150); break;
      case 'scroll': this.onScroll(d); break;
      case 'anchor': if (d.a) { this.pos = { ...this.pos, anchor: d.a }; this.savePos(); } break;
      case 'active': this.ctx.touch?.(); this.ctx.wake?.(); break;
      case 'theme': this.theme = d; this.ctx.onTheme?.(d); break;
      case 'selection': this.sel = d; this.ctx.onSelection?.(); break;
      case 'pointer': this.pointerDown = !!d.down; this.ctx.onPointer?.(d.down); break;
      case 'markTap': this.onMarkTap(d); break;
      case 'noteAt': this.noteAt(d); break;
      case 'mark': this.onMark(d); break;
      case 'unanchored': this.unanch = (d.list || []).filter(x => this.store.get(x.id)).map(x => ({ ...x, anchor: { ...(this.store.get(x.id)?.anchor || {}), quote: x.anchor?.quote } })); this.ctx.onUnanchored?.(this.unanch); break;
      case 'answer': this._q?.res(d.v); this._q = null; break;
      case 'pinchzoom': this.setZoomPct(d.z, this.mode, { fromFrame: true }); break;
      case 'natural': break;
      case 'page': this.pageInfo = d; this.onPage(d); break;
      case 'toc': this.showToc(d); break;
      case 'turning': this.ctx.root.classList.toggle('turning', !!d.on); break;
      case 'tapcenter': this.ctx.toggleChrome?.(); break;
      case 'perf': this.perf = d; window.__lzperf = d; break;
      case 'block': this.blocks.onFrameEvent(d); break;
      case 'bkedits': this.edits = d.edits; db.kvSet('bkedit:' + this.id, d.edits).catch(() => {}); break;
      case 'blocksinfo': this.info.blocks = d.blocks; this.blocks.push(); break;
      case 'toast': toast(d.text); break;
      case 'origblock': this.blocks.onOrigEvent(d); break;
      case 'origtimer': this.blocks.onOrigTimer(d); break;
      case 'error': console.error('[frame]', d.message); break;
      default: break;
    }
  }
  toStage(r) { const b = this.host.iframe.getBoundingClientRect(); return { left: b.left + r.left, right: b.left + r.right, top: b.top + r.top, bottom: b.top + r.bottom, width: r.width, height: r.height }; }
  onScroll(d) {
    if (this.mode === 'orig') { this.pos = { ...this.pos, top: d.top }; if (d.settled) this.savePos(); }
    this.ctx.progress?.(d.max > 0 ? d.top / d.max : 0);
    this.ctx.onFrameScroll?.(d.top);
  }
  savePos() { if (this._pT) return; this._pT = setTimeout(() => { this._pT = 0; db.kvSet('fpos:' + this.id, this.pos).catch(() => {}); }, 1000); }   // at most once a second; flushNow() on pagehide / close

  // ---------------- marks ----------------
  pushMarks(ids) {
    clearTimeout(this._mT);
    this._textChanged = this._textChanged || !ids || ids.some(i => { const r = this.store.get(i); return !r || r.type !== 'pen'; });
    this._mT = setTimeout(() => { const tc = this._textChanged; this._textChanged = false; this.host?.send('marks', { list: this.store.all(), palette: MARK_COLORS, textChanged: tc }); }, 0);
  }
  onMark(d) {
    if (d.op === 'add') this.store.add(d.rec);
    else if (d.op === 'remove') { const r = this.store.get(d.rid); if (r) this.store.remove(d.rid); }
  }
  pushTool() {
    const t = this.tools, st = this.ctx.getSettings?.() || {};
    this.host?.send('tool', { tool: t.drawTool() === 'brush' ? 'none' : (t.tool === 'pen' || t.tool === 'eraser' || t.tool === 'text' ? t.tool : 'none'), pen: { color: t.penColor(), w: t.penWidth() * 0.7 }, eraser: 10 + t.eraserIdx * 8, finger: !!st.drawWithFinger });
  }
  hasSelection() { return !!this.sel.has; }
  selectionText() { return this.sel.text || ''; }
  selectionRect() { return this.sel.rect ? this.toStage(this.sel.rect) : null; }
  snapshot() { return this.sel.has ? { ...this.sel } : null; }
  applyTextMark(type, props = {}, snap = null) {
    const s = snap || this.sel; if (!s?.has || !s.anchor) return;
    if (s.anchor.end - s.anchor.start > 2500) { toast('Слишком большой фрагмент — выделите меньше'); this.host?.send('clearSel'); return; }   // never a whole page
    this.store.add({ type, anchor: s.anchor, ...props });
    this.host?.send('clearSel');
  }
  removeMarksInSelection() {
    const a = this.sel.anchor; if (!a) return 0;
    const hit = this.store.textMarks().filter(r => r.anchor && r.anchor.start < a.end && r.anchor.end > a.start);
    if (hit.length) this.store.transaction(() => hit.forEach(r => this.store.remove(r.id)), 'unmark');
    this.host?.send('clearSel');
    return hit.length;
  }
  popLast() { /* no pop animation in the frame */ }
  // a note / photo anchored to a word
  noteAt(d) {
    const ta = h('textarea', { class: 'input', rows: 4, placeholder: 'Текст заметки', 'aria-label': 'Текст заметки' });
    const m = customDialog([h('h3', null, 'Заметка'), h('p', { class: 'muted' }, '«' + (d.text || '').slice(0, 60) + '»'), ta, h('div', { class: 'modal-actions' }, h('button', { class: 'btn', type: 'button', onclick: () => m.close() }, 'Отмена'), h('button', { class: 'btn btn-primary', type: 'button', onclick: () => { const t = ta.value.trim(); if (t) this.store.add({ type: 'note', anchor: d.anchor, note: t }); m.close(); this.tools.set({ tool: 'none' }); } }, 'Сохранить'))], { onBackdrop: () => m.close() });
    setTimeout(() => ta.focus(), 60);
  }
  onMarkTap(d) {
    const recs = (d.ids || []).map(i => this.store.get(i)).filter(Boolean), ph = recs.find(r => r.photo);
    if (ph) { const m = customDialog([h('img', { class: 'note-photo', src: ph.photo, alt: 'Фото-заметка' }), ph.note ? h('p', null, ph.note) : null, h('div', { class: 'modal-actions' }, h('button', { class: 'btn btn-danger-soft', type: 'button', onclick: () => { this.store.remove(ph.id); m.close(); } }, 'Убрать'), h('button', { class: 'btn btn-primary', type: 'button', onclick: () => m.close() }, 'Закрыть'))], { onBackdrop: () => m.close() }); return; }
    this.ctx.markTap?.(d.ids, this.toStage(d.rect));
  }
  async addPhoto(file) {
    if (!file.type.startsWith('image/')) { toast('Это не картинка', { error: true }); return; }
    try {
      const url = await new Promise((res, rej) => { const u = URL.createObjectURL(file), im = new Image(); im.onload = () => { const k = Math.min(1, 640 / Math.max(im.naturalWidth, im.naturalHeight)), c = document.createElement('canvas'); c.width = Math.round(im.naturalWidth * k); c.height = Math.round(im.naturalHeight * k); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(u); res(c.toDataURL('image/jpeg', 0.72)); }; im.onerror = () => { URL.revokeObjectURL(u); rej(new Error('Не удалось прочитать картинку')); }; im.src = u; });
      let anchor = this.sel.has ? this.sel.anchor : null;
      if (!anchor) { const a = await this.query('anchor', 800); if (a) anchor = { start: a.off, end: a.off + Math.min(12, (a.quote || '').length || 1), quote: (a.quote || '').slice(0, 12), prefix: '', suffix: '', blk: a.blk }; }
      if (!anchor) { toast('Сначала выделите слово, к которому прикрепить фото'); return; }
      this.store.add({ type: 'note', anchor, note: '', photo: url }); toast('Фото прикреплено к тексту');
    } catch (e) { toast(e.message || 'Не получилось добавить фото', { error: true }); }
  }
  progressRatio() { return 0; }

  // ---------------- Книга: pager (the pages themselves are drawn in the frame) ----------------
  async stickerData() {
    try {
      if (this._stk?.subject === this.meta.subject) return this._stk.data;
      const src = stickerSrc(subjectStickerName(this.meta.subject)); if (!src) return null;
      const blob = await (await fetch(src)).blob();
      const data = await new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob); });
      this._stk = { subject: this.meta.subject, data }; return data;
    } catch { return null; }
  }
  togglePager(on) {
    if (!this.pager) {
      this.slider = h('input', { type: 'range', class: 'fr-slider', min: 1, max: 1, step: 1, value: 1, 'aria-label': 'Страница' });
      this.slider.addEventListener('input', () => this.host?.send('page', { n: Number(this.slider.value) - 1 }));
      this.pageLbl = h('span', { class: 'fr-pg' }, 'стр. 1');
      const b = (ic, label, fn) => h('button', { class: 'ibtn sm', type: 'button', 'aria-label': label, title: label, onclick: fn }, icon(ic, 18));
      this.pager = h('div', { class: 'fr-pager glass', role: 'toolbar', 'aria-label': 'Страницы' }, b('chevron-left', 'Назад', () => this.host?.send('turn', { dir: -1 })), this.slider, b('chevron-right', 'Вперёд', () => this.host?.send('turn', { dir: 1 })), this.pageLbl,
        b('list', 'Оглавление', () => this.host?.send('toc')), h('button', { class: 'btn btn-sm btn-quiet fr-az', type: 'button', onclick: () => this.zoomStep(-1), 'aria-label': 'Мельче' }, 'A−'), h('button', { class: 'btn btn-sm btn-quiet fr-az', type: 'button', onclick: () => this.zoomStep(1), 'aria-label': 'Крупнее' }, 'A+'));
      this.ctx.root.append(this.pager);
    }
    this.pager.hidden = !on;
    this.ctx.root.classList.toggle('bookmode', !!on);
  }
  onPage(d) {
    if (this.slider) { this.slider.max = String(d.pages); this.slider.value = String(d.page); }
    if (this.pageLbl) this.pageLbl.textContent = `стр. ${d.page} / ${d.pages}`;
    this.ctx.progress?.(d.pages > 1 ? (d.page - 1) / (d.pages - 1) : 0);
    this.ctx.onPage?.(d);
  }
  showToc(d) {
    const rows = [];
    for (const p of d.parts || []) rows.push(h('button', { class: 'menu-row', onclick: () => { m.close(); this.host?.send('page', { n: p.page - 1 }); } }, icon('book-open', 20), h('span', null, p.title), h('span', { class: 'spacer' }), h('small', { class: 'muted' }, 'стр. ' + p.page)));
    for (const x of d.heads || []) rows.push(h('button', { class: 'menu-row', style: { paddingLeft: 12 + (x.level - 1) * 14 + 'px' }, onclick: () => { m.close(); this.host?.send('page', { n: x.page - 1 }); } }, h('span', null, x.title), h('span', { class: 'spacer' }), h('small', { class: 'muted' }, 'стр. ' + x.page)));
    const m = customDialog([h('h3', null, 'Оглавление'), h('div', { class: 'toc-list' }, ...(rows.length ? rows : [h('p', { class: 'muted' }, 'В документе нет заголовков.')])), h('div', { class: 'modal-actions' }, h('button', { class: 'btn', onclick: () => m.close() }, 'Закрыть'))], { onBackdrop: () => m.close(), sheet: true });
  }

  // ---------------- position / bookmarks ----------------
  async currentBlock() { return this.blocks.currentBlock(); }
  async toggleBlockRead(b) { return this.blocks.toggleRead(b); }
  async jumpTo(bm) {
    if (bm.kind === 'block') { if (this.mode === 'orig') await this.ctx.switchMode?.('normal'); this.host?.send('goto', { anchor: { blk: bm.ref } }); }
    else if (bm.kind === 'anchor') this.host?.send('goto', { anchor: bm.anchor });
  }
  async print() { if (this.mode === 'book') await this.ctx.switchMode?.('normal'); setTimeout(() => { try { this.host.iframe.contentWindow.print(); } catch { window.print(); } }, 400); }
  flushNow() { clearTimeout(this._dsT); db.kvSet('ds:' + this.id, this.docState).catch(() => {}); clearTimeout(this._pT); this._pT = 0; db.kvSet('fpos:' + this.id, this.pos).catch(() => {}); }
  unmount() { this.host?.send('flush'); this.flushNow(); }
  destroy() {
    this._offStore?.(); this.pager?.remove(); this.blocks?.destroy(); this.host?.destroy(); this.host = null;
  }
}
void h; void debounce; void customDialog;
