// Annotation store: records per document in IndexedDB + a command history (undo/redo, depth 100).
// Every change goes through `exec` so that undo/redo always works and listeners are always notified.
import * as db from '../db.js';
import { uid } from '../db.js';
import { debounce } from '../util.js';

const DEPTH = 100;

export class AnnoStore {
  constructor(docId, records) {
    this.docId = docId;
    this.map = new Map((records || []).map(r => [r.id, r]));
    this.undoStack = [];
    this.redoStack = [];
    this.listeners = new Set();
    this.dirty = new Set();
    this.gone = new Set();
    this.group = null;
    this.state = 'saved';           // 'saved' | 'dirty' | 'saving'
    this.save = debounce(() => this.saveNow(), 400);
    this.saveHist = debounce(() => this.persistHistory(), 700);
    this._seq = Date.now();
  }
  static async open(docId) {
    const recs = await db.getAll('annotations', 'docId', docId);
    recs.sort((a, b) => (a.created || 0) - (b.created || 0));
    const st = new AnnoStore(docId, recs);
    try {   // the undo / redo stack survives reload and app restart (ops whose records are gone are dropped)
      const h = await db.kvGet('undo:' + docId, null);
      if (h) { const ok = c => c && Array.isArray(c.ops) && c.ops.length; st.undoStack = (h.u || []).filter(ok); st.redoStack = (h.r || []).filter(ok); }
    } catch { /* no history */ }
    return st;
  }

  // ---- reading ----
  all() { return [...this.map.values()]; }
  get(id) { return this.map.get(id); }
  filter(fn) { return this.all().filter(fn); }
  textMarks() { return this.filter(r => r.anchor && ['hl', 'ul', 'strike', 'note', 'bold'].includes(r.type)); }
  forPage(page) { return this.filter(r => (r.page ?? 1) === page); }
  count() { return this.map.size; }

  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  _emit(ids, kind) { this.listeners.forEach(f => f(kind, ids)); }
  get canUndo() { return this.undoStack.length > 0; }
  get canRedo() { return this.redoStack.length > 0; }

  // ---- low level (no history) ----
  _apply(op, inverse) {
    const t = inverse ? ({ add: 'del', del: 'add', upd: 'upd' })[op.op] : op.op;
    if (t === 'add') { const r = op.rec; this.map.set(r.id, r); this.dirty.add(r.id); this.gone.delete(r.id); return r.id; }
    if (t === 'del') { const id = op.rec.id; this.map.delete(id); this.dirty.delete(id); this.gone.add(id); return id; }
    const cur = this.map.get(op.id);
    if (cur) { const next = { ...cur, ...(inverse ? op.before : op.after) }; this.map.set(op.id, next); this.dirty.add(op.id); }
    return op.id;
  }
  _applyAll(ops, inverse) {
    const seq = inverse ? [...ops].reverse() : ops;
    const ids = seq.map(o => this._apply(o, inverse));
    this._touched();
    return ids;
  }
  _touched() { this.state = 'dirty'; this.listeners.forEach(f => f('state', [])); this.save(); this.saveHist(); }
  persistHistory() { const pk = st => st.filter(c => !c.ext).slice(-DEPTH); db.kvSet('undo:' + this.docId, { u: pk(this.undoStack), r: pk(this.redoStack) }).catch(() => {}); }

  // ---- commands ----
  // Run fn(tx) where tx.add/remove/update collect operations; they are applied immediately and pushed as ONE undo step.
  transaction(fn, label = '') {
    if (this.group) { fn(this); return; }     // nested: join the outer step
    this.group = [];
    try { fn(this); } finally {
      const ops = this.group; this.group = null;
      if (ops.length) this._push({ label, ops });
    }
  }
  _push(cmd) {
    this.undoStack.push(cmd);
    if (this.undoStack.length > DEPTH) this.undoStack.shift();
    this.redoStack.length = 0;
    this._emit(cmd.ops.map(o => o.rec?.id || o.id), 'cmd');
  }
  _exec(op) {
    const id = this._apply(op, false);
    this._touched();
    if (this.group) { this.group.push(op); this._emit([id], 'live'); return; }
    this._push({ label: op.op, ops: [op] });
  }
  add(rec) {
    rec = { id: uid().slice(0, 12), created: this._nextSeq(), docId: this.docId, ...rec };
    this._exec({ op: 'add', rec });
    return rec;
  }
  remove(id) {
    const rec = this.map.get(id);
    if (rec) this._exec({ op: 'del', rec });
  }
  update(id, patch) {
    const cur = this.map.get(id);
    if (!cur) return;
    const before = {}, after = {};
    for (const k of Object.keys(patch)) { before[k] = cur[k]; after[k] = patch[k]; }
    this._exec({ op: 'upd', id, before, after });
  }
  _nextSeq() { return ++this._seq; }
  // Drop an "add" that is still on top of the undo stack (e.g. an empty text box) without leaving history noise.
  cancelAdd(id) {
    const top = this.undoStack[this.undoStack.length - 1];
    if (top && top.ops.length === 1 && top.ops[0].op === 'add' && top.ops[0].rec.id === id) {
      this.undoStack.pop(); this._apply(top.ops[0], true); this._touched(); this._emit([id], 'cmd'); return true;
    }
    return false;
  }

  // external commands (e.g. a block marked as read) take part in undo/redo too: {undo(), redo()}
  pushExternal(ext, label = 'ext') { this._push({ label, ops: [], ext }); }
  undo() {
    const cmd = this.undoStack.pop();
    if (!cmd) return false;
    if (cmd.ext) { cmd.ext.undo(); this.redoStack.push(cmd); this._emit([], 'undo'); return true; }
    const ids = this._applyAll(cmd.ops, true);
    this.redoStack.push(cmd);
    this._emit(ids, 'undo');
    return true;
  }
  redo() {
    const cmd = this.redoStack.pop();
    if (!cmd) return false;
    if (cmd.ext) { cmd.ext.redo(); this.undoStack.push(cmd); this._emit([], 'redo'); return true; }
    const ids = this._applyAll(cmd.ops, false);
    this.undoStack.push(cmd);
    this._emit(ids, 'redo');
    return true;
  }

  // ---- persistence ----
  async saveNow() {
    if (!this.dirty.size && !this.gone.size) { this._setState('saved'); return; }
    const put = [...this.dirty].map(id => this.map.get(id)).filter(Boolean);
    const del = [...this.gone];
    this.dirty.clear(); this.gone.clear();
    this._setState('saving');
    try {
      const d = await db.openDB();
      await new Promise((res, rej) => {
        const tx = d.transaction('annotations', 'readwrite');
        const os = tx.objectStore('annotations');
        put.forEach(r => os.put(r)); del.forEach(id => os.delete(id));
        tx.oncomplete = res; tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error);
      });
      this._setState(this.dirty.size || this.gone.size ? 'dirty' : 'saved');
    } catch (e) {
      put.forEach(r => this.dirty.add(r.id)); del.forEach(id => this.gone.add(id));
      this._setState('error', e);
    }
  }
  _setState(s, e) { this.state = s; this.listeners.forEach(f => f('state', [], e)); }
  async flush() { this.save.cancel(); this.saveHist.cancel(); this.persistHistory(); await this.saveNow(); }
}
