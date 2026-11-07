// View state that is restored on load (zoom, width, font, reading position). Everything read from storage is untrusted:
// a NaN, a huge number or a value from another version would otherwise survive a reload and reproduce a broken layout.
// Every restored number is validated and clamped; anything invalid falls back to the default.
import * as db from './db.js';

export const num = (v, min, max, def) => { const n = typeof v === 'number' ? v : (typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def; };
const oneOf = (v, list, def) => (list.includes(v) ? v : def);
const str = (v, max, def = '') => (typeof v === 'string' ? v.slice(0, max) : def);

export const ZOOM_MIN = 50, ZOOM_MAX = 400, ZOOM_DEFAULT = 75;

// { zoom: {normal: 75, book: 100, ...}, width, weight, family }
export function cleanCfg(raw) {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const zoom = {};
  if (o.zoom && typeof o.zoom === 'object') for (const k of ['normal', 'book', 'blocks', 'orig']) { const z = num(o.zoom[k], ZOOM_MIN, ZOOM_MAX, null); if (z != null) zoom[k] = Math.round(z); }
  return { zoom, width: oneOf(o.width, ['wide', 'original'], 'wide'), weight: oneOf(o.weight, ['file', 'lighter'], 'file'), family: oneOf(o.family, ['file', 'sans', 'serif'], 'file') };
}
// reading position: {anchor:{off,quote,blk}, top}
export function cleanPos(raw) {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const out = {};
  const top = num(o.top, 0, 5e7, null); if (top != null) out.top = top;
  const a = o.anchor;
  if (a && typeof a === 'object') {
    const anchor = {};
    const off = num(a.off, 0, 5e8, null); if (off != null) anchor.off = Math.floor(off);
    const quote = str(a.quote, 200, ''); if (quote) anchor.quote = quote;
    const blk = str(a.blk, 200, ''); if (blk) anchor.blk = blk;
    if (anchor.off != null || anchor.quote || anchor.blk) out.anchor = anchor;
  }
  return out;
}
export function cleanEdits(raw) {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  return { splits: Array.isArray(o.splits) ? o.splits.slice(0, 2000) : [], merges: Array.isArray(o.merges) ? o.merges.slice(0, 2000) : [] };
}

// kv keys that are pure view state (safe to drop); bookmarks (bmk:/bm:), marks, block edits (bkedit:), document state (ds:) are the user's data and stay
const VIEW_PREFIXES = ['fz:', 'fpos:', 'pos:'];
export async function resetViewState() {
  const all = await db.getAll('kv');
  const keys = all.map(r => r.key).filter(k => typeof k === 'string' && VIEW_PREFIXES.some(p => k.startsWith(p)));
  await db.delMany('kv', keys);
  let dropped = 0;
  try { if (typeof self.caches !== 'undefined') for (const k of await self.caches.keys()) if (k.startsWith('konspekty-')) { await self.caches.delete(k); dropped++; } } catch { /* no Cache API */ }
  try { for (const k of ['readerView', 'splashed']) { sessionStorage.removeItem(k); } } catch { /* ignore */ }
  try { const regs = await navigator.serviceWorker?.getRegistrations?.(); for (const r of regs || []) await r.unregister(); } catch { /* ignore */ }
  return { views: keys.length, caches: dropped };
}
