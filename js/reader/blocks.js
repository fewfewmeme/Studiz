// "Блоки": any document as a sequence of ~5-minute study blocks. No sticky panel: the timer lives in the popover of the
// timer chip, the block list in a bottom sheet, the plan is a normal card at the top of the content.
// "Прочитала" is stored by UNITS (PDF pages / paragraph hashes), so it survives re-splitting, reloads and mode switches.
import * as db from '../db.js';
import { uid } from '../db.js';
import { h, fmtDur, clamp, plural } from '../util.js';
import { settings } from '../settings.js';
import { BLOCK_PLANS, REST_TIPS } from '../../config.js';
import { collectLeaves, makeBlocks, hashStr } from './split.js';
import { buildIndex, resolveAnchor } from '../anno/anchor.js';
import { setPartTimerRunning, recordPartDone, dayReport } from '../study.js';
import { toast, customDialog } from '../ui.js';
import { icon } from '../icons.js';
import { autoQuestions } from './questions.js';
import { adaptBanner } from './banner.js';
import { showSessionCheck } from '../views/session-check.js';

const RECALL_SEC = 20;
const wordsOfEl = el => (el.textContent || '').split(/\s+/).filter(Boolean).length;

export class BlocksView {
  constructor({ doc, ctx, host, pos }) {
    this.doc = doc; this.ctx = ctx; this.host = host; this.pos = pos;
    this.blocks = []; this.els = new Map(); this.alive = true; this.recalls = new Map();
    this.idKey = 'bk:' + ctx.meta.id; this.tKey = 'bkt:' + ctx.meta.id;
    this._saving = Promise.resolve();
  }
  get plan() { return BLOCK_PLANS.find(p => p.id === this.st.plan) || BLOCK_PLANS[0]; }

  async init() {
    this.st = { done: {}, doneU: {}, flame: {}, ask: {}, qs: {}, qgen: {}, plan: '5-5', filter: 'all', ...(await db.kvGet(this.idKey, {})) };
    for (const k of ['done', 'doneU', 'flame', 'ask', 'qs', 'qgen']) this.st[k] ||= {};
    this.timer = (await db.kvGet(this.tKey, null)) || { phase: 'idle' };
    this.bmKey = 'bmk:' + this.ctx.meta.id; this.bm = await db.kvGet(this.bmKey, []);
    this.buildSkeleton();
    await this.compute();
    this.migrateDone();
    this.render();
    this.restoreTimer();
    this.refreshRewards();
    this.unlockAudio = () => { try { if (!this.audio) this.audio = new (window.AudioContext || window.webkitAudioContext)(); this.audio.resume?.(); } catch { /* ignore */ } };
    this.host.addEventListener('pointerdown', this.unlockAudio, { once: true });
    this._tick = setInterval(() => this.tick(), 500);
    this._vis = () => { if (document.visibilityState === 'hidden') { this.clearAllRecalls(); this.flushNow(); } this.tick(); if (document.visibilityState === 'visible' && this.timer.phase === 'study') this.lockScreen(); };
    document.addEventListener('visibilitychange', this._vis);
    this._rw = setInterval(() => this.refreshRewards(), 15000);
    this._off = this.ctx.store.onChange(k => { if (['cmd', 'undo', 'redo'].includes(k)) { this.applyStates(); } });
    if (this.pos?.block) this.scrollToBlock(this.pos.block, false);
    this.genQuestionsLater();
  }
  destroy() {
    this.alive = false;
    clearInterval(this._tick); clearInterval(this._rw);
    document.removeEventListener('visibilitychange', this._vis);
    this._off?.();
    this.clearAllRecalls();
    setPartTimerRunning(false);
    this.releaseLock();
    document.title = this.baseTitle || document.title;
    this.persistTimer();
    this.ctx.chip?.set(null);
    this.flushNow();
    this.host.replaceChildren();
  }
  // write-through: every change goes to IndexedDB at once (chained, so the last write wins and none is lost)
  save() { this._saving = this._saving.then(() => db.kvSet(this.idKey, JSON.parse(JSON.stringify(this.st)))).catch(() => {}); return this._saving; }
  flushNow() { this.persistTimer(); return this.save(); }
  persistTimer() { db.kvSet(this.tKey, this.timer).catch(() => {}); }

  // ---------- layout ----------
  buildSkeleton() {
    this.baseTitle = document.title;
    this.clock = h('div', { class: 'bk-clock', 'aria-live': 'off' }, '00:00');
    this.label = h('div', { class: 'bk-label' }, 'Готова начать');
    this.pauseBtn = h('button', { class: 'pill-btn', onclick: () => this.togglePause() }, icon('pause', 18), h('span', null, 'Пауза'));
    this.plusBtn = h('button', { class: 'pill-btn', onclick: () => this.addMinutes(5) }, icon('plus', 18), h('span', null, '5 мин'));
    this.progress = h('div', { class: 'bk-prog' });
    this.fishEl = h('span', { class: 'bk-counter-num' }, '0'); this.shrimpEl = h('span', { class: 'bk-counter-num' }, '0');
    this.rewardBox = h('div', { class: 'bk-rewards', 'aria-label': 'Награды за сегодня' }, h('span', { class: 'rw' }, '🐟 ', this.fishEl), h('span', { class: 'rw shrimp-target' }, '🦐 ', this.shrimpEl));
    // content of the timer popover (built once, painted always, shown on demand)
    this.tpop = h('div', { class: 'pop-body bk-tpop' }, h('div', { class: 'pop-title' }, 'Таймер блока'), h('div', { class: 'bk-time' }, this.label, this.clock), h('div', { class: 'bk-ctl' }, this.pauseBtn, this.plusBtn), this.progress, this.rewardBox);
    this.restBox = h('div', { class: 'bk-rest', hidden: true });
    this.planCard = h('section', { class: 'bk-plan card' });
    this.listHost = h('div', { class: 'bk-list' });
    this.scroller = h('div', { class: 'scroll-col rd-scroll bk-scroll' }, h('div', { class: 'bk-wrap' }, adaptBanner(this.doc.report, this.ctx.meta.name), this.planCard, this.restBox, this.listHost));
    this.host.replaceChildren(h('div', { class: 'bk-root' }, this.scroller));
    this.scroller.addEventListener('scroll', () => { this.ctx.progress?.(this.doneCount() / Math.max(1, this.blocks.length)); }, { passive: true });
  }

  async compute() {
    const s = settings();
    if (this.doc.kind === 'html') {
      this.doc.root.classList.add('blocks');
      const secs = [...this.doc.root.querySelectorAll(':scope > section.lz-sec')];
      if (secs.length) {      // adapted document: the document's own sections ARE the blocks (never re-split)
        this.leaves = secs.map(el => ({ el, words: wordsOfEl(el), images: el.querySelectorAll('img').length, level: 0, text: (el.textContent || '').trim() }));
      } else this.leaves = collectLeaves(this.doc.root);
      // stable unit keys: hash of the paragraph text, k-th duplicate gets a suffix
      const seen = new Map();
      this.leaves.forEach(l => { const k = hashStr((l.text || '').slice(0, 160) + '|' + (l.text || '').length); const n = (seen.get(k) || 0) + 1; seen.set(k, n); l.unit = 'u' + k + (n > 1 ? '#' + n : ''); });
      if (secs.length) this.blocks = secs.map((el, i) => ({ start: i, end: i + 1, sec: Math.max(30, this.leaves[i].words / s.wpm * 60), words: this.leaves[i].words, title: el.getAttribute('data-lab') || 'Раздел ' + (i + 1), id: el.getAttribute('data-lz-id') || String(i), n: i + 1 }));
      else this.blocks = makeBlocks(this.leaves, { minutes: s.partMinutes, wpm: s.wpm });
      this.blocks.forEach(b => { b.units = this.leaves.slice(b.start, b.end).filter(l => l.text || l.images).map(l => l.unit); });
    } else {
      const src = await this.doc.blocksSource();
      this.src = src;
      this.blocks = makeBlocks(src.items, { minutes: s.partMinutes, wpm: s.wpm });
      this.blocks.forEach(b => { b.title = src.titleFor(b); b.units = this.doc.blockPages(src, b).map(p => 'p' + p); });
    }
  }
  // old data: done by block id -> done by units (once)
  migrateDone() {
    let changed = false;
    for (const b of this.blocks) if (this.st.done[b.id] && b.units.length && !b.units.every(u => this.st.doneU[u])) { b.units.forEach(u => { this.st.doneU[u] ||= this.st.done[b.id]; }); changed = true; }
    if (changed) this.save();
  }
  isDone(b) { return b.units?.length ? b.units.every(u => this.st.doneU[u]) : !!this.st.done[b.id]; }
  setDone(b, on) {
    const ts = Date.now();
    if (on) { b.units.forEach(u => { this.st.doneU[u] = ts; }); this.st.done[b.id] = ts; }
    else { b.units.forEach(u => { delete this.st.doneU[u]; }); delete this.st.done[b.id]; }
    this.save();
  }

  render() {
    this.els.clear();
    this.renderPlan();
    if (this.doc.kind === 'html') {
      this.listHost.replaceChildren(this.doc.root);
      this.blocks.forEach(b => {
        const leaves = this.leaves.slice(b.start, b.end).map(x => x.el);
        leaves.forEach((el, k) => { el.classList.add('bk'); el.dataset.b = b.id; if (k === 0) el.classList.add('bk-first'); if (k === leaves.length - 1) el.classList.add('bk-last'); });
        const head = this.makeHead(b), foot = this.makeFoot(b);
        leaves[0].before(head); leaves[leaves.length - 1].after(foot);
        this.els.set(b.id, { leaves, head, foot });
      });
    } else {
      const cards = h('div', { class: 'bk-cards' });
      this.blocks.forEach(b => {
        const pages = this.doc.renderBlockPages(this.src, b);
        const head = this.makeHead(b), foot = this.makeFoot(b);
        const card = h('section', { class: 'bk-card' }, head, pages, foot);
        cards.append(card);
        this.els.set(b.id, { leaves: [card], pages, head, foot, card });
      });
      this.listHost.replaceChildren(cards);
    }
    this.applyStates();
    this.renderProgress();
  }

  makeHead(b) {
    const done = this.isDone(b);
    return h('div', { class: 'bk-head', 'data-skip': '1', 'data-bid': b.id },
      h('span', { class: 'bk-badge' }, done ? icon('check', 16) : String(b.n)),
      h('div', { class: 'bk-title' }, h('strong', null, b.title), h('span', { class: 'muted' }, `~${Math.max(1, Math.round(b.sec / 60))} мин · ${b.words} ${plural(b.words, 'слово', 'слова', 'слов')}`)),
      h('button', { class: 'ibtn bm' + (this.hasBm(b) ? ' on' : ''), 'aria-label': 'Закладка', 'aria-pressed': String(this.hasBm(b)), onclick: e => this.toggleBm(b, e.currentTarget) }, icon('bookmark', 20)),
      h('button', { class: 'ibtn flame' + (this.st.flame[b.id] ? ' on' : ''), 'aria-label': 'Важное', 'aria-pressed': String(!!this.st.flame[b.id]), onclick: e => this.toggleFlame(b, e.currentTarget) }, icon('flame', 20)));
  }
  makeFoot(b) {
    const done = this.isDone(b);
    const notes = h('textarea', { class: 'bk-ask-input', rows: 2, placeholder: 'Спросят: что ещё может спросить преподаватель?', 'aria-label': 'Спросят' });
    notes.value = this.st.ask[b.id] || '';
    notes.addEventListener('change', () => { this.st.ask[b.id] = notes.value; this.save(); });
    const qBox = h('div', { class: 'bk-qs' });
    const askBox = h('div', { class: 'bk-ask', hidden: true }, qBox, notes);
    const start = h('button', { class: 'btn btn-primary bk-start', onclick: () => this.start(b) }, icon('play', 16), h('span', null, 'Начать'));
    const read = h('button', { class: 'btn bk-read' + (done ? ' on' : ''), 'aria-pressed': String(done), onclick: e => this.markRead(b, e.currentTarget) }, icon('check', 16), h('span', null, done ? 'Прочитано' : 'Прочитала'));
    const recall = h('button', { class: 'btn btn-quiet bk-recallbtn', onclick: e => this.recall(b, e.currentTarget) }, h('span', { class: 'rc-ring' }), icon('recall', 16), h('span', { class: 'rc-t' }, 'Проверь себя'));
    const askBtn = h('button', { class: 'btn btn-quiet bk-askbtn', 'aria-expanded': 'false', onclick: () => { askBox.hidden = !askBox.hidden; askBtn.setAttribute('aria-expanded', String(!askBox.hidden)); if (!askBox.hidden) this.drawQuestions(b, qBox); } }, icon('note', 16), h('span', { class: 'ask-t' }, 'Спросят'));
    return h('div', { class: 'bk-foot', 'data-skip': '1', 'data-bid': b.id }, h('div', { class: 'bk-foot-row' }, start, read, recall, askBtn), askBox);
  }

  renderPlan() {
    const left = this.visibleBlocks().filter(b => !this.isDone(b)).length;
    const mins = left * this.plan.study;
    this.planCard.replaceChildren(
      h('div', { class: 'bk-plan-top' }, h('div', null, h('h3', null, `Сегодня: ${left} ${plural(left, 'блок', 'блока', 'блоков')} ~ ${mins} мин`), h('p', { class: 'muted' }, 'Блок — кусочек документа примерно на 5 минут чтения.')),
        h('div', { class: 'bk-plan-chips' }, BLOCK_PLANS.map(p => h('button', { class: 'chip' + (p.id === this.plan.id ? ' on' : ''), onclick: () => { this.st.plan = p.id; this.save(); this.renderPlan(); this.applyStates(); this.renderProgress(); } }, p.label)))));
  }

  // ---------- state ----------
  blockHasMarks(b) {
    if (this.doc.kind === 'html') {
      const els = this.els.get(b.id); if (!els) return false;
      const root = this.doc.root;
      const stamp = this.ctx.store.undoStack.length + ':' + this.ctx.store.redoStack.length;
      const idx = this._idx && this._idxStamp === stamp ? this._idx : (this._idx = buildIndex(root));
      this._idxStamp = stamp;
      let s = Infinity, e = -1;
      for (const leaf of els.leaves) { const w = document.createTreeWalker(leaf, NodeFilter.SHOW_TEXT); while (w.nextNode()) { const x = idx.map.get(w.currentNode); if (x) { s = Math.min(s, x.start); e = Math.max(e, x.end); } } }
      if (e < 0) return false;
      return this.ctx.store.textMarks().some(m => { const r = resolveAnchor(idx, m.anchor); return r && r.start < e && r.end > s; });
    }
    const pages = this.doc.blockPages(this.src, b);
    return pages.some(p => this.ctx.store.forPage(p).length > 0);
  }
  isKey(b) { return !!this.st.flame[b.id] || this.blockHasMarks(b); }
  visibleBlocks() {
    const f = this.st.filter;
    let list = this.blocks;
    if (this.plan.onlyKey) list = list.filter(b => this.isKey(b));
    if (f === 'unread') list = list.filter(b => !this.isDone(b));
    else if (f === 'marks') list = list.filter(b => this.blockHasMarks(b));
    else if (f === 'key') list = list.filter(b => !!this.st.flame[b.id]);
    return list;
  }
  applyStates() {
    const vis = new Set(this.visibleBlocks().map(b => b.id));
    const active = this.timer.phase === 'study' ? this.timer.blockId : null;
    for (const b of this.blocks) {
      const e = this.els.get(b.id); if (!e) continue;
      const done = this.isDone(b);
      const show = vis.has(b.id);
      e.leaves.forEach(el => { el.classList.toggle('bk-done', done); el.classList.toggle('bk-hide', !show); el.classList.toggle('bk-active', active === b.id); el.classList.toggle('bk-dim', !!active && active !== b.id); });
      e.head.classList.toggle('bk-hide', !show); e.foot.classList.toggle('bk-hide', !show);
      e.head.classList.toggle('bk-done', done); e.head.classList.toggle('bk-active', active === b.id); e.head.classList.toggle('bk-dim', !!active && active !== b.id);
      e.foot.classList.toggle('bk-dim', !!active && active !== b.id); e.foot.classList.toggle('bk-active', active === b.id);
      const badge = e.head.querySelector('.bk-badge'); badge.replaceChildren(done ? icon('check', 16) : String(b.n));
      const rb = e.foot.querySelector('.bk-read'); rb.classList.toggle('on', done); rb.setAttribute('aria-pressed', String(done)); rb.querySelector('span').textContent = done ? 'Прочитано' : 'Прочитала';
      const st = e.foot.querySelector('.bk-start'); st.querySelector('span').textContent = active === b.id ? 'Идёт' : 'Начать'; st.disabled = active === b.id;
      const q = (this.st.qs[b.id] || []).length; e.foot.querySelector('.ask-t').textContent = q ? `Спросят · ${q}` : 'Спросят';
    }
    this.renderPlan(); this.renderProgress();
    if (this.doc.kind === 'html') this.doc.paintAnchored?.();
  }
  doneCount() { return this.blocks.filter(b => this.isDone(b)).length; }
  renderProgress() {
    const total = this.blocks.length, d = this.doneCount();
    const pct = total ? d / total : 0, R = 15, C = 2 * Math.PI * R;
    this.progress.innerHTML = `<svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="${R}" class="ring-bg"/><circle cx="20" cy="20" r="${R}" class="ring-fg" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - pct)}"/></svg><span>${d} / ${total}</span>`;
    this.progress.setAttribute('aria-label', `Прочитано ${d} из ${total}`);
    this.ctx.progress?.(pct);
  }

  // ---------- actions ----------
  hasBm(b) { return this.bm.some(x => x.kind === 'block' && x.ref === b.id); }
  async toggleBm(b, btn) {
    this.bm = await db.kvGet(this.bmKey, []);
    if (this.hasBm(b)) this.bm = this.bm.filter(x => !(x.kind === 'block' && x.ref === b.id)); else this.bm.push({ id: uid().slice(0, 8), kind: 'block', ref: b.id, title: b.title, ts: Date.now() });
    await db.kvSet(this.bmKey, this.bm); btn.classList.toggle('on', this.hasBm(b)); btn.setAttribute('aria-pressed', String(this.hasBm(b)));
  }
  toggleFlame(b, btn) { this.st.flame[b.id] = !this.st.flame[b.id]; if (!this.st.flame[b.id]) delete this.st.flame[b.id]; btn.classList.toggle('on', !!this.st.flame[b.id]); btn.setAttribute('aria-pressed', String(!!this.st.flame[b.id])); this.save(); if (this.st.filter === 'key' || this.plan.onlyKey) this.applyStates(); }
  async markRead(b, btn) {
    const was = this.isDone(b);
    const before = { units: Object.fromEntries(b.units.map(u => [u, this.st.doneU[u]])), done: this.st.done[b.id] };
    if (was) {
      this.setDone(b, false); this.applyStates(); toast('Отметка снята');
    } else {
      this.setDone(b, true);
      btn?.classList.add('pop');
      this.applyStates();
      const gave = await recordPartDone(this.ctx.meta.id, this.ctx.meta.subject, b.id);
      if (this.timer.phase === 'study' && this.timer.blockId === b.id) { if (this.timer.stopwatch) { this.timer = { phase: 'idle' }; this.persistTimer(); setPartTimerRunning(false); this.releaseLock(); this.paint(); } else this.endStudy(true); }
      this.refreshRewards();
    }
    // the global Undo / Redo buttons also toggle the mark
    this.ctx.store.pushExternal({
      undo: () => { if (was) { b.units.forEach(u => { if (before.units[u]) this.st.doneU[u] = before.units[u]; }); if (before.done) this.st.done[b.id] = before.done; this.save(); } else this.setDone(b, false); this.applyStates(); },
      redo: () => { this.setDone(b, !was); this.applyStates(); },
    }, 'block-read');
  }
  flyShrimp(from) {
    const target = this.ctx.chipEl?.() || this.shrimpEl;
    if (!from || !target) return;
    const a = from.getBoundingClientRect(), t = target.getBoundingClientRect();
    const el = h('div', { class: 'shrimp-fly' }, '🦐');
    el.style.left = a.left + a.width / 2 + 'px'; el.style.top = a.top + 'px';
    document.body.append(el);
    const dx = t.left - a.left - a.width / 2 + t.width / 2, dy = t.top - a.top + t.height / 2;
    const an = el.animate([{ transform: 'translate(0,0) scale(.6)', opacity: 0 }, { transform: 'translate(0,-30px) scale(1.3)', opacity: 1, offset: .25 }, { transform: `translate(${dx}px,${dy}px) scale(.7)`, opacity: 1 }], { duration: 800, easing: 'cubic-bezier(.4,0,.2,1)' });
    an.onfinish = () => { el.remove(); target.animate?.([{ transform: 'scale(1)' }, { transform: 'scale(1.18)' }, { transform: 'scale(1)' }], { duration: 360, easing: 'cubic-bezier(.2,.8,.2,1)' }); this.refreshRewards(); };
  }
  async refreshRewards() {
    try { const d = await dayReport(new Date().toLocaleDateString('sv-SE')); this.fishEl.textContent = String(d.fish); this.shrimpEl.textContent = String(d.shrimp); } catch { /* ignore */ }
  }

  // "Проверь себя": a toggle. Blur + countdown ring; tap the button or the blurred block to reveal; auto reveal at 0;
  // always cleared on mode/route/visibility change, so it can never stay stuck.
  recall(b, btn) {
    if (this.recalls.has(b.id)) { this.endRecall(b.id); return; }
    const e = this.els.get(b.id); if (!e) return;
    const targets = e.pages ? [e.pages] : e.leaves;
    targets.forEach(el => el.classList.add('bk-recall'));
    const R = 7, C = 2 * Math.PI * R, ring = btn.querySelector('.rc-ring');
    ring.innerHTML = `<svg width="18" height="18" viewBox="0 0 18 18"><circle cx="9" cy="9" r="${R}" class="ring-bg"/><circle cx="9" cy="9" r="${R}" class="ring-fg" stroke-dasharray="${C}" stroke-dashoffset="0" transform="rotate(-90 9 9)"/></svg>`;
    btn.classList.add('on');
    const rec = { left: RECALL_SEC, targets, btn, onClick: ev => { ev.preventDefault(); ev.stopPropagation(); this.endRecall(b.id); } };
    btn.querySelector('.rc-t').textContent = `Показать (${rec.left})`;
    targets.forEach(el => el.addEventListener('click', rec.onClick, true));
    rec.t = setInterval(() => {
      rec.left--;
      if (rec.left <= 0 || !this.alive) { this.endRecall(b.id); return; }
      btn.querySelector('.rc-t').textContent = `Показать (${rec.left})`;
      btn.querySelector('.ring-fg')?.setAttribute('stroke-dashoffset', String(C * (1 - rec.left / RECALL_SEC)));
    }, 1000);
    this.recalls.set(b.id, rec);
  }
  endRecall(id) {
    const rec = this.recalls.get(id); if (!rec) return;
    clearInterval(rec.t);
    rec.targets.forEach(el => { el.classList.remove('bk-recall'); el.removeEventListener('click', rec.onClick, true); });
    rec.btn.classList.remove('on'); rec.btn.querySelector('.rc-t').textContent = 'Проверь себя';
    this.recalls.delete(id);
  }
  clearAllRecalls() { for (const id of [...this.recalls.keys()]) this.endRecall(id); }

  // ---------- "Спросят": auto questions (local) + yours ----------
  async blockParas(b) {
    if (this.doc.kind === 'html' && this.leaves[b.start]?.el.matches?.('section.lz-sec')) {       // adapted section: its children are the paragraphs
      const out = [];
      for (const l of this.leaves.slice(b.start, b.end)) {
        const kids = [...l.el.children];
        kids.forEach((c, i) => {
          if (/^(UL|OL)$/.test(c.tagName) || c.querySelector?.('table,figure,img')) return;
          const next = kids[i + 1], lead = c.firstElementChild && /^(B|STRONG)$/.test(c.firstElementChild.tagName) ? c.firstElementChild.textContent.trim() : '';
          out.push({ text: (c.textContent || '').replace(/\s+/g, ' ').trim(), tag: c.tagName, lead, items: next && /^(UL|OL)$/.test(next.tagName) ? next.children.length : 0 });
        });
      }
      return out;
    }
    if (this.doc.kind === 'html') {
      return this.leaves.slice(b.start, b.end).map(l => {
        const el = l.el, lead = el.firstElementChild && /^(B|STRONG)$/.test(el.firstElementChild.tagName) ? el.firstElementChild.textContent.trim() : '';
        const list = el.matches?.('ul,ol') ? el.children.length : 0;
        return { text: l.text, tag: el.tagName, lead, items: list };
      });
    }
    return this.doc.blockText ? this.doc.blockText(this.doc.blockPages(this.src, b)) : [];
  }
  async genQuestions(b, force = false) {
    if (this.st.qgen[b.id] && !force) return;
    const paras = await this.blockParas(b);
    const first = this.doc.kind === 'html' ? this.leaves[b.start] : null;
    const adapted = this.doc.kind === 'html' && first?.el.matches?.('section.lz-sec');
    const title = adapted ? (first.el.querySelector('h1,h2,h3')?.textContent.trim() || b.title) : this.doc.kind === 'html' ? (first && first.level > 0 && first.level <= 4 ? first.text : '') : (this.src.items[b.start].level > 0 ? this.src.items[b.start].text : '');
    const fromDoc = (this.doc.sdm?.ask || []).filter(a => a.block === b.n - 1).map(a => a.q).filter(Boolean);
    const gen = [...new Set([...fromDoc, ...autoQuestions({ title, paras })])].slice(0, 4);
    const mine = (this.st.qs[b.id] || []).filter(q => !q.auto);
    const have = new Set(mine.map(q => q.text.toLowerCase()));
    this.st.qs[b.id] = [...gen.filter(q => !have.has(q.toLowerCase())).map(q => ({ text: q, auto: true })), ...mine];
    this.st.qgen[b.id] = true;
  }
  async genQuestionsLater() {
    for (const b of this.blocks) {
      if (!this.alive) return;
      if (this.st.qgen[b.id]) continue;
      try { await this.genQuestions(b); } catch { /* skip */ }
      await new Promise(r => setTimeout(r, 0));
    }
    if (this.alive) { this.save(); this.applyStates(); }
  }
  drawQuestions(b, box) {
    const list = this.st.qs[b.id] || [];
    const rows = list.map((q, i) => {
      const inp = h('input', { type: 'text', value: q.text, 'aria-label': 'Вопрос' });
      inp.addEventListener('change', () => { q.text = inp.value; q.auto = false; this.save(); this.drawQuestions(b, box); this.applyStates(); });
      return h('div', { class: 'bk-q' }, q.auto ? h('span', { class: 'tag' }, 'авто') : null, inp,
        h('button', { class: 'ibtn sm', 'aria-label': 'Удалить вопрос', onclick: () => { list.splice(i, 1); this.save(); this.drawQuestions(b, box); this.applyStates(); } }, icon('x', 16)));
    });
    const add = h('button', { class: 'btn btn-quiet btn-sm', onclick: () => { list.push({ text: '', auto: false }); this.st.qs[b.id] = list; this.save(); this.drawQuestions(b, box); box.querySelector('.bk-q:last-of-type input')?.focus(); } }, icon('plus', 14), h('span', null, 'Свой вопрос'));
    const upd = h('button', { class: 'btn btn-quiet btn-sm', onclick: async () => { await this.genQuestions(b, true); this.save(); this.drawQuestions(b, box); this.applyStates(); } }, icon('sparkle', 14), h('span', null, 'Обновить'));
    box.replaceChildren(...rows, h('div', { class: 'bk-ask-actions' }, add, upd));
  }

  currentBlock() {
    const top = this.scroller.getBoundingClientRect().top + this.scroller.clientHeight * 0.3;
    const vis = this.visibleBlocks();
    let pick = vis[0];
    for (const b of vis) { const e = this.els.get(b.id); const r = (e.foot || e.leaves[e.leaves.length - 1]).getBoundingClientRect(); if (r.bottom > top) { pick = b; break; } }
    return pick ? { id: pick.id, title: pick.title, done: this.isDone(pick), block: pick } : null;
  }
  async toggleBlockRead(b) { const blk = b.block || this.blocks.find(x => x.id === b.id); await this.markRead(blk, null); return this.isDone(blk); }
  scrollToBlock(id, smooth = true) {
    const e = this.els.get(id); if (!e) return;
    (e.head || e.leaves[0]).scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });
  }
  nextUnread() {
    const b = this.visibleBlocks().find(x => !this.isDone(x));
    if (!b) { toast('Все блоки прочитаны'); return; }
    this.scrollToBlock(b.id);
  }

  // ---------- popover of the timer chip + list sheet ----------
  openTimerPop(anchor) { this.ctx.pop.open(anchor, this.tpop, { side: anchor.closest('.rail') ? 'right' : 'up' }); this.paint(); }
  openList() {
    const F = [['all', 'Все'], ['unread', 'Не прочитано'], ['marks', 'С пометками'], ['key', 'Важное']];
    const body = h('div', { class: 'bk-list-sheet' });
    const m = customDialog([h('h3', null, 'Блоки'), body, h('div', { class: 'modal-actions' }, h('button', { class: 'btn', onclick: () => m.close() }, 'Закрыть'))], { onBackdrop: () => m.close(), sheet: true });
    const draw = () => {
      const rows = this.visibleBlocks().map(b => h('button', { class: 'bk-row' + (this.isDone(b) ? ' done' : ''), onclick: () => { m.close(); this.scrollToBlock(b.id); } },
        h('span', { class: 'bk-badge' }, this.isDone(b) ? icon('check', 14) : String(b.n)), h('span', { class: 't' }, b.title), h('small', null, `~${Math.max(1, Math.round(b.sec / 60))} мин`)));
      body.replaceChildren(
        h('div', { class: 'bk-chips' },
          h('button', { class: 'chip', onclick: () => { m.close(); this.scroller.scrollTo({ top: 0, behavior: 'smooth' }); } }, 'Сегодня'),
          h('button', { class: 'chip', onclick: () => rowsEl.scrollTo({ top: 0 }) }, 'По разделам'),
          h('button', { class: 'chip chip-accent', onclick: () => { m.close(); this.nextUnread(); } }, 'Дальше', icon('chevron-right', 16))),
        h('div', { class: 'seg bk-filters', role: 'group', 'aria-label': 'Фильтр блоков' }, F.map(([k, l]) => h('button', { class: 'seg-btn' + (this.st.filter === k ? ' on' : ''), 'aria-pressed': String(this.st.filter === k), onclick: () => { this.st.filter = k; this.save(); this.applyStates(); draw(); } }, l))),
        rowsEl = h('div', { class: 'bk-rows' }, rows.length ? rows : h('p', { class: 'muted', style: { padding: '12px' } }, 'Здесь пока ничего нет.')));
    };
    let rowsEl;
    draw();
    return m;
  }

  // ---------- timer (robust: endAt timestamps, persisted, recomputed on every tick) ----------
  start(b) {
    this.unlockAudio?.();
    const plan = this.plan;
    this.timer = plan.stopwatch ? { phase: 'study', blockId: b.id, stopwatch: true, startAt: Date.now(), elapsed: 0, total: 0, paused: false, n: b.n } : { phase: 'study', blockId: b.id, endAt: Date.now() + plan.study * 60000, total: plan.study * 60000, paused: false, n: b.n };
    this.persistTimer(); setPartTimerRunning(true); this.lockScreen();
    this.restBox.hidden = true;
    this.applyStates(); this.scrollToBlock(b.id);
    this.paint();
  }
  endStudy(early = false) {
    const plan = this.plan;
    const tip = REST_TIPS[Math.floor(Math.random() * REST_TIPS.length)];
    const prevEnd = this.timer.endAt;
    this.timer = { phase: 'rest', blockId: this.timer.blockId, endAt: (early ? Date.now() : prevEnd) + plan.rest * 60000, total: plan.rest * 60000, paused: false, tip, n: this.timer.n };
    this.persistTimer(); setPartTimerRunning(false); this.releaseLock();
    if (!early) { this.chime(); setTimeout(() => { if (this.alive) showSessionCheck(); }, 400); }
    this.applyStates(); this.paint();
  }
  endRest() {
    const vis = this.visibleBlocks(), cur = vis.findIndex(x => x.id === this.timer.blockId);
    const unread = x => !this.isDone(x) && x.id !== this.timer.blockId;
    const next = vis.slice(cur + 1).find(unread) || vis.slice(0, Math.max(0, cur)).find(unread);
    this.timer = { phase: 'ready', nextId: next?.id || null, prev: this.timer.blockId };
    this.persistTimer(); this.chime(); this.applyStates(); this.paint();
  }
  togglePause() {
    const t = this.timer;
    if (t.phase !== 'study' && t.phase !== 'rest') return;
    if (t.stopwatch) {
      if (!t.paused) { t.paused = true; t.elapsed = Date.now() - t.startAt; setPartTimerRunning(false); this.releaseLock(); } else { t.paused = false; t.startAt = Date.now() - t.elapsed; setPartTimerRunning(true); this.lockScreen(); }
      this.persistTimer(); this.paint(); return;
    }
    if (!t.paused) { t.paused = true; t.remaining = Math.max(0, t.endAt - Date.now()); setPartTimerRunning(false); this.releaseLock(); }
    else { t.paused = false; t.endAt = Date.now() + t.remaining; if (t.phase === 'study') { setPartTimerRunning(true); this.lockScreen(); } }
    this.persistTimer(); this.paint();
  }
  addMinutes(m) {
    const t = this.timer;
    if (t.phase !== 'study' && t.phase !== 'rest') return;
    if (t.stopwatch) return;
    if (t.paused) t.remaining += m * 60000; else t.endAt += m * 60000;
    t.total = (t.total || 0) + m * 60000;
    this.persistTimer(); this.paint();
  }
  restoreTimer() {
    const t = this.timer;
    if (t.stopwatch && t.phase === 'study') { if (!t.paused) { setPartTimerRunning(true); this.lockScreen(); } this.applyStates(); this.paint(); return; }
    if (t.phase === 'study' || t.phase === 'rest') {
      if (!t.paused) {
        const now = Date.now();
        if (t.phase === 'study' && now >= t.endAt) { this.endStudy(false); this.timer.endAt = t.endAt + this.plan.rest * 60000; if (now >= this.timer.endAt) this.endRest(); }
        else if (t.phase === 'rest' && now >= t.endAt) this.endRest();
      }
      if (this.timer.phase === 'study' && !this.timer.paused) { setPartTimerRunning(true); this.lockScreen(); }
    }
    this.applyStates(); this.paint();
  }
  tick() {
    const t = this.timer;
    if (!this.alive) return;
    if ((t.phase === 'study' || t.phase === 'rest') && !t.stopwatch && !t.paused && Date.now() >= t.endAt) {
      if (t.phase === 'study') this.endStudy(false); else this.endRest();
      return;
    }
    this.paint();
  }
  remainingMs() { const t = this.timer; return t.paused ? t.remaining : Math.max(0, t.endAt - Date.now()); }
  paint() {
    const t = this.timer;
    if (t.phase === 'study' && t.stopwatch) {
      const el = t.paused ? t.elapsed : Date.now() - t.startAt, txt = fmtDur(Math.floor(el / 1000));
      this.clock.textContent = txt; this.label.textContent = `Блок ${t.n} · секундомер`;
      this.pauseBtn.lastChild.textContent = t.paused ? 'Дальше' : 'Пауза'; this.pauseBtn.firstChild.replaceWith(icon(t.paused ? 'play' : 'pause', 18));
      this.pauseBtn.disabled = false; this.plusBtn.disabled = true; this.tpop.classList.remove('is-rest');
      this.ctx.chip?.set(txt, (el / 60000) % 1); document.title = `${t.paused ? '⏸ ' : ''}${txt} · Блок ${t.n}`; this.restBox.hidden = true; return;
    }
    if (t.phase === 'study' || t.phase === 'rest') {
      const rem = this.remainingMs();
      const txt = fmtDur(Math.ceil(rem / 1000));
      const frac = t.total ? clamp(1 - rem / t.total, 0, 1) : 0;
      this.clock.textContent = txt;
      this.label.textContent = t.phase === 'study' ? `Блок ${t.n}` : 'Отдых';
      this.pauseBtn.lastChild.textContent = t.paused ? 'Дальше' : 'Пауза';
      this.pauseBtn.firstChild.replaceWith(icon(t.paused ? 'play' : 'pause', 18));
      this.pauseBtn.disabled = false; this.plusBtn.disabled = false;
      this.tpop.classList.toggle('is-rest', t.phase === 'rest');
      this.ctx.chip?.set(txt, frac);
      if (!t.paused) document.title = `${txt} · ${t.phase === 'study' ? 'Блок ' + t.n : 'Отдых'}`; else document.title = `⏸ ${txt}`;
      if (t.phase === 'rest') { this.restBox.hidden = false; this.restBox.replaceChildren(h('div', null, h('strong', null, 'Время отдыха'), h('div', null, t.tip || 'Отдохни'))); } else this.restBox.hidden = true;
    } else if (t.phase === 'ready') {
      document.title = this.baseTitle;
      const next = this.blocks.find(b => b.id === t.nextId);
      this.clock.textContent = '00:00'; this.label.textContent = next ? 'Отдохнули' : 'Всё на сегодня';
      this.tpop.classList.remove('is-rest'); this.ctx.chip?.set(null);
      this.pauseBtn.disabled = true; this.plusBtn.disabled = true;
      this.restBox.hidden = false;
      this.restBox.replaceChildren(
        next ? h('div', null, h('strong', null, 'Отдых закончился'), h('div', null, `Дальше блок ${next.n}`)) : h('div', null, h('strong', null, 'Всё на сегодня'), h('div', null, 'Хорошая работа.')),
        next ? h('button', { class: 'btn btn-primary', onclick: () => this.start(next) }, icon('play', 16), h('span', null, `Дальше блок ${next.n}`)) : null);
    } else {
      this.clock.textContent = '00:00'; this.label.textContent = 'Готова начать'; document.title = this.baseTitle;
      this.pauseBtn.disabled = true; this.plusBtn.disabled = true; this.tpop.classList.remove('is-rest'); this.restBox.hidden = true; this.ctx.chip?.set(null);
    }
  }
  chime() {
    const c = this.audio; if (!c || !settings().chime) return;
    [523.25, 659.25, 783.99].forEach((f, i) => {
      const o = c.createOscillator(), g = c.createGain(), t = c.currentTime + i * 0.18;
      o.type = 'sine'; o.frequency.value = f; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.16, t + 0.03); g.gain.exponentialRampToValueAtTime(0.001, t + 1);
      o.connect(g).connect(c.destination); o.start(t); o.stop(t + 1.05);
    });
  }
  async lockScreen() { try { if ('wakeLock' in navigator && !this.lock && document.visibilityState === 'visible') { this.lock = await navigator.wakeLock.request('screen'); this.lock.addEventListener('release', () => { this.lock = null; }); } } catch { /* ignore */ } }
  releaseLock() { try { this.lock?.release(); } catch { /* ignore */ } this.lock = null; }
}
