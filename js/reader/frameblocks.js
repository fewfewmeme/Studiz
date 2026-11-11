// Parent side of «Блоки»: state, timer (endAt-based, wake lock), rewards, «Спросят» sheet, list sheet. The cards are drawn inside the frame.
import * as db from '../db.js';
import { uid } from '../db.js';
import { h, fmtDur, clamp, plural } from '../util.js';
import { settings } from '../settings.js';
import { BLOCK_PLANS } from '../../config.js';
import * as ST from '../study-store.js';
import { toast, customDialog } from '../ui.js';
import { icon } from '../icons.js';
import { autoQuestions } from './questions.js';

export class FrameBlocks {
  constructor(doc) {
    this.doc = doc; this.ctx = doc.ctx; this.id = doc.id; this.key = 'bk:' + doc.id; this.bmKey = 'bmk:' + doc.id;
    this.st = { done: {}, flame: {}, ask: {}, qs: {}, plan: 'all', filter: 'all' }; this.timer = { phase: 'idle' }; this.bm = [];
    this.host = null; this.active = false; this._saving = Promise.resolve();
  }
  get plan() { return BLOCK_PLANS.find(p => p.id === this.st.plan) || BLOCK_PLANS[0]; }
  list() { return (this.doc.info.blocks || []).map((b, i) => ({ ...b, n: i + 1, sec: Math.max(30, (b.min || 1) * 60) })); }
  async init() {
    const s = await db.kvGet(this.key, null);
    this.st = { done: {}, flame: {}, ask: {}, qs: {}, plan: 'all', filter: 'all', ...(s || {}) };
    for (const k of ['done', 'flame', 'ask', 'qs']) this.st[k] ||= {};
    this.timer = { phase: 'idle' };
    this.bm = await db.kvGet(this.bmKey, []);
    this.buildSkeleton();
    // the countdown lives in the study timer (js/study-store.js); this class only mirrors it
    this._off = ST.subscribe((kind, extra) => this.onStudy(kind, extra));
    this._off2 = this.ctx.store.onChange(k => { if (['cmd', 'undo', 'redo'].includes(k)) this.push(); });
    this.unlockAudio = () => { try { if (!this.audio) this.audio = new (window.AudioContext || window.webkitAudioContext)(); this.audio.resume?.(); } catch { /* ignore */ } };
    document.addEventListener('pointerdown', this.unlockAudio, { once: true });
  }
  async attach(mode, host) {
    this.host = host; this.active = mode === 'blocks'; this.mode = mode;
    this.bm = await db.kvGet(this.bmKey, []);
    this.mirror(); this.push(); this.paint();
  }
  destroy() {
    clearInterval(this._rw);
    this._off?.(); this._off2?.();
    document.removeEventListener('pointerdown', this.unlockAudio);
    this.releaseLock(); this.ctx.chip?.set(null); this.flushNow();
  }
  save() { this._saving = this._saving.then(() => db.kvSet(this.key, JSON.parse(JSON.stringify(this.st)))).catch(() => {}); return this._saving; }
  flushNow() { return this.save(); }

  isDone(b) { return !!this.st.done[b.id]; }
  hasBm(b) { return this.bm.some(x => x.kind === 'block' && x.ref === b.id); }
  hasMarks(b) { return this.ctx.store.all().some(r => (r.anchor?.blk === b.id) || r.blk === b.id); }
  isKey(b) { return !!this.st.flame[b.id] || this.hasMarks(b); }
  push() {
    if (!this.active || !this.host) return;
    const list = this.list(), plan = this.plan;
    const keyIds = list.filter(b => this.isKey(b)).map(b => b.id);
    const bm = {}; list.forEach(b => { if (this.hasBm(b)) bm[b.id] = 1; });
    const active = this.timer.phase === 'study' ? this.timer.blockId : null;
    this.host.send('blockState', { state: { done: this.st.done, flame: this.st.flame, bm, keyIds, onlyKey: !!plan.onlyKey, plans: BLOCK_PLANS.map(p => ({ id: p.id, label: p.label })), planId: plan.id, planStudy: null, active, dim: false, restText: this.restText() } });
  }
  restText() { const t = this.timer; return t.phase === 'rest' ? 'Время отдыха — ' + (t.tip || 'Отдохни') : t.phase === 'ready' ? 'Отдых закончился' : ''; }
  scrollTo(id, smooth = true) { this.host?.send('blockScroll', { id, smooth }); }

  // ---------- from the frame ----------
  onFrameEvent(d) {
    const b = this.list().find(x => x.id === d.rid);
    switch (d.ev) {
      case 'start': if (b) this.start(b); break;
      case 'read': if (b) this.markRead(b, d.on, d.rect); break;
      case 'bm': if (b) this.toggleBm(b); break;
      case 'flame': if (b) { this.st.flame[b.id] = !!d.on || !this.st.flame[b.id]; if (!this.st.flame[b.id]) delete this.st.flame[b.id]; this.save(); this.push(); } break;
      case 'ask': if (b) this.openAsk(b, d); break;
      case 'plan': { const p = BLOCK_PLANS.find(x => x.id === d.rid); if (p) { this.st.plan = p.id; this.save(); this.push(); } break; }
      default: break;
    }
  }
  async toggleBm(b) {
    this.bm = await db.kvGet(this.bmKey, []);
    if (this.hasBm(b)) this.bm = this.bm.filter(x => !(x.kind === 'block' && x.ref === b.id)); else this.bm.push({ id: uid().slice(0, 8), kind: 'block', ref: b.id, title: b.title, ts: Date.now() });
    await db.kvSet(this.bmKey, this.bm); this.push();
  }
  async markRead(b, on, rect) {
    const was = !!this.st.done[b.id];
    if (on === undefined) on = !was;
    if (on === was) return;
    if (on) this.st.done[b.id] = Date.now(); else delete this.st.done[b.id];
    this.save(); this.push();
    this.ctx.progress?.(Object.keys(this.st.done).length / Math.max(1, this.list().length));
    if (!on) toast('Отметка снята');
    const ts = this.st.done[b.id];
    this.ctx.store.pushExternal({
      undo: () => { if (on) delete this.st.done[b.id]; else this.st.done[b.id] = ts || Date.now(); this.save(); this.push(); },
      redo: () => { if (on) this.st.done[b.id] = Date.now(); else delete this.st.done[b.id]; this.save(); this.push(); },
    }, 'block-read');
  }
  // «Прочитала» only marks the block as read. Minutes, fish and shrimp come from the study timer: general time while reading,
  // and a 5 / 10 minute block ONLY when its countdown reaches zero (stopping, leaving or closing the page earlier credits nothing).
  // the file's own countdown (heuristic adapter or the studiz:block-* contract): the reward is credited ONCE when it reaches 00:00; the site shows no second timer
  onOrigTimer(d) {
    if (d.ev === 'start') ST.setExternal(true);                 // the general timer waits while the file's own block timer runs (no two counters in parallel)
    else if (d.ev === 'pause' || d.ev === 'cancel') ST.setExternal(false);
    if (d.ev === 'complete') {
      ST.setExternal(false);
      const n = Date.now(); if (this._lastCredit && n - this._lastCredit < 4000) return; this._lastCredit = n;
      if (ST.creditBlock(Number(d.minutes) === 10 ? 10 : 5)) toast('Блок засчитан');
    }
  }
  async onOrigEvent(d) {
    const b = this.list()[d.bi]; if (!b) return;
    if (d.kind === 'start') { /* the file runs its own timer: nothing to open */ }
    else if (d.kind === 'done' && !this.st.done[b.id]) { this.st.done[b.id] = Date.now(); this.save(); this.push(); }
  }
  refreshRewards() { const r = ST.totals().rewards; if (this.fishEl) { this.fishEl.textContent = String(r.fish); this.shrimpEl.textContent = String(r.shrimp); } }

  // ---------- current block / list ----------
  async currentBlock() {
    const a = await this.doc.query('anchor', 800);
    const bl = this.list(); if (!bl.length) return null;
    const b = bl.find(x => x.id === a?.blk) || bl[0];
    return { id: b.id, title: b.title, done: this.isDone(b), block: b };
  }
  async toggleRead(b) { const blk = b.block || this.list().find(x => x.id === b.id); await this.markRead(blk, undefined, null); return this.isDone(blk); }
  visible() { const f = this.st.filter; let l = this.list(); if (this.plan.onlyKey) l = l.filter(b => this.isKey(b)); if (f === 'unread') l = l.filter(b => !this.isDone(b)); else if (f === 'marks') l = l.filter(b => this.hasMarks(b)); else if (f === 'key') l = l.filter(b => !!this.st.flame[b.id]); return l; }
  nextUnread() { const b = this.visible().find(x => !this.isDone(x)); if (!b) { toast('Все блоки прочитаны'); return; } this.scrollTo(b.id); }
  openList() {
    const F = [['all', 'Все'], ['unread', 'Не прочитано'], ['marks', 'С пометками'], ['key', 'Важное']];
    const body = h('div', { class: 'bk-list-sheet' });
    const m = customDialog([h('h3', null, 'Блоки'), body, h('div', { class: 'modal-actions' }, h('button', { class: 'btn', onclick: () => m.close() }, 'Закрыть'))], { onBackdrop: () => m.close(), sheet: true });
    const draw = () => {
      const rows = this.visible().map(b => h('button', { class: 'bk-row' + (this.isDone(b) ? ' done' : ''), onclick: () => { m.close(); this.scrollTo(b.id); } }, h('span', { class: 'bk-badge' }, this.isDone(b) ? icon('check', 14) : String(b.n)), h('span', { class: 't' }, b.title), h('small', null, `~${Math.max(1, Math.round(b.sec / 60))} мин`)));
      body.replaceChildren(h('div', { class: 'bk-chips' }, h('button', { class: 'chip chip-accent', onclick: () => { m.close(); this.nextUnread(); } }, 'Дальше', icon('chevron-right', 16))),
        h('div', { class: 'seg bk-filters', role: 'group', 'aria-label': 'Фильтр блоков' }, F.map(([k, l]) => h('button', { class: 'seg-btn' + (this.st.filter === k ? ' on' : ''), 'aria-pressed': String(this.st.filter === k), onclick: () => { this.st.filter = k; this.save(); this.push(); draw(); } }, l))),
        h('div', { class: 'bk-rows' }, rows.length ? rows : h('p', { class: 'muted', style: { padding: '12px' } }, 'Здесь пока ничего нет.')));
    };
    draw(); return m;
  }

  // ---------- «Спросят · N» ----------
  openAsk(b, d) {
    const items = d.items || [];
    const auto = autoQuestions({ title: d.title || b.title, paras: d.paras || [] }).slice(0, 4);
    const KIND = { ask: 'Спросят', key: 'Важно', callout: 'Врезка', term: 'Термин' };
    const note = h('textarea', { class: 'bk-ask-input', rows: 3, placeholder: 'Что ещё может спросить преподаватель?', 'aria-label': 'Свой вопрос' });
    note.value = this.st.ask[b.id] || '';
    note.addEventListener('change', () => { this.st.ask[b.id] = note.value; this.save(); });
    const sect = (title, rows) => rows.length ? h('div', { class: 'ask-sec' }, h('h4', null, title), ...rows) : null;
    const main = items.filter(x => x.kind !== 'term'), terms = items.filter(x => x.kind === 'term');
    const m = customDialog([h('h3', null, `Спросят · ${items.length}`), h('p', { class: 'muted' }, b.title),
      h('div', { class: 'ask-list' },
        sect('Из документа', main.map(x => h('div', { class: 'ask-item' }, h('span', { class: 'tag' }, KIND[x.kind] || ''), h('span', null, x.text)))),
        sect('Термины', terms.map(x => h('span', { class: 'chip ask-term' }, x.text))),
        sect('Вопросы для самопроверки', auto.map(q => h('div', { class: 'ask-item' }, h('span', { class: 'tag' }, 'авто'), h('span', null, q)))),
        !items.length && !auto.length ? h('p', { class: 'muted' }, 'В этом блоке пока ничего не нашлось. Напишите свой вопрос ниже.') : null),
      note, h('div', { class: 'modal-actions' }, h('button', { class: 'btn btn-primary', onclick: () => m.close() }, 'Готово'))], { onBackdrop: () => m.close(), sheet: true });
  }

  // ---------- block timer ----------
  // You choose 5 or 10 minutes and press start. The countdown (absolute endAt) is the study timer's `block`; it is credited only when it reaches 0.
  buildSkeleton() {
    this.clock = h('div', { class: 'bk-clock', 'aria-live': 'off' }, '00:00');
    this.label = h('div', { class: 'bk-label' }, 'Выберите 5 или 10 минут');
    this.len5 = h('button', { class: 'pill-btn', type: 'button', onclick: () => this.begin(5) }, h('span', null, '5 мин'));
    this.len10 = h('button', { class: 'pill-btn', type: 'button', onclick: () => this.begin(10) }, h('span', null, '10 мин'));
    this.stopBtn = h('button', { class: 'pill-btn', type: 'button', onclick: () => this.stop() }, icon('x', 18), h('span', null, 'Стоп'));
    this.note = h('p', { class: 'muted bk-note' }, 'Засчитывается блок, который дошёл до нуля. Остановка или уход со страницы больше чем на 15 секунд — ничего не засчитывается.');
    this.fishEl = h('span', { class: 'bk-counter-num' }, '0'); this.shrimpEl = h('span', { class: 'bk-counter-num' }, '0');
    this.rewardBox = h('div', { class: 'bk-rewards', 'aria-label': 'Награды открытого чека' }, h('span', { class: 'rw' }, '🐟 ', this.fishEl), h('span', { class: 'rw shrimp-target' }, '🦐 ', this.shrimpEl));
    this.tpop = h('div', { class: 'pop-body bk-tpop' }, h('div', { class: 'pop-title' }, 'Таймер блока'), h('div', { class: 'bk-time' }, this.label, this.clock),
      h('div', { class: 'bk-ctl' }, this.len5, this.len10, this.stopBtn), this.note, this.rewardBox);
    this.refreshRewards();
  }
  openTimerPop(anchor) { this.ctx.pop.open(anchor, this.tpop, { side: anchor.closest('.rail') ? 'right' : 'up' }); this.paint(); }
  // «Начать» on a block: scroll to it and offer the two lengths
  start(b, { orig = false } = {}) {
    this.unlockAudio?.(); this.pending = b;
    if (ST.state().block) { this.timer = { phase: 'study', blockId: b.id, n: b.n }; this.scrollTo(b.id); this.push(); this.paint(); return; }   // a countdown is running: «Начать» on another block only moves the marker
    if (!orig) this.scrollTo(b.id);
    const chip = this.ctx.chipEl?.(); if (chip) this.openTimerPop(chip);
    this.paint();
  }
  begin(len) {
    if (ST.state().block) return;
    const b = this.pending || this.list().find(x => !this.isDone(x)) || this.list()[0];
    try { ST.startBlock(len); } catch (e) { toast('Откройте файл и режим «Блоки»'); return; }
    this.timer = { phase: 'study', blockId: b?.id, n: b?.n }; this.pending = null;
    this.lockScreen(); this.push(); this.paint(); this.ctx.pop.close?.();
  }
  stop() { if (ST.state().block) ST.stopBlock(); }
  // the study timer's block <-> what this panel shows
  mirror() {
    const blk = ST.state().block;
    if (blk && this.timer.phase !== 'study') { this.timer = { phase: 'study', blockId: this.pending?.id || this.list()[0]?.id, n: 0 }; this.lockScreen(); }
    if (!blk && this.timer.phase === 'study') { this.timer = { phase: 'idle' }; this.releaseLock(); }
  }
  onStudy(kind, extra) {
    if (kind === 'blockDone') { this.mirror(); this.releaseLock(); this.push(); this.paint(); this.ctx.rewardCard?.({ fish: extra?.fish || 0, shrimp: extra?.shrimp || 0 }); this.chime(); this.refreshRewards(); return; }
    if (kind === 'blockAbandoned') { this.mirror(); this.push(); this.paint(); toast('Блок прерван — ничего не засчитано'); return; }
    if (kind === 'tick' || kind === 'change') { this.mirror(); this.paint(); }
  }
  paint() {
    const blk = ST.state().block, chip = (txt, f) => this.ctx.chip?.set(txt, f);
    if (blk) {
      const left = ST.blockLeftMs(), txt = fmtDur(Math.ceil(left / 1000)), frac = clamp(1 - left / (blk.lenMin * 60000), 0, 1);
      this.clock.textContent = txt; this.label.textContent = `Блок · ${blk.lenMin} мин`; this.len5.disabled = this.len10.disabled = true; this.stopBtn.disabled = false; chip(txt, frac); return;
    }
    this.clock.textContent = '00:00'; this.label.textContent = this.pending ? `Блок «${this.pending.title.slice(0, 30)}» — выберите время` : 'Выберите 5 или 10 минут';
    this.len5.disabled = this.len10.disabled = false; this.stopBtn.disabled = true; chip(null);
  }
  chime() { const c = this.audio; if (!c || !settings().chime) return; [523.25, 659.25, 783.99].forEach((f, i) => { const o = c.createOscillator(), g = c.createGain(), t = c.currentTime + i * 0.18; o.type = 'sine'; o.frequency.value = f; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.16, t + 0.03); g.gain.exponentialRampToValueAtTime(0.001, t + 1); o.connect(g).connect(c.destination); o.start(t); o.stop(t + 1.05); }); }
  async lockScreen() { try { if ('wakeLock' in navigator && !this.lock && document.visibilityState === 'visible') { this.lock = await navigator.wakeLock.request('screen'); this.lock.addEventListener('release', () => { this.lock = null; }); } } catch { /* ignore */ } }
  releaseLock() { try { this.lock?.release(); } catch { /* ignore */ } this.lock = null; }
}
void plural;
