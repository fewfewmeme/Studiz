// Closed receipts: tearing one off writes its TOP part to the Archive (with the code for Уголок), its BOTTOM part to Days,
// adds its totals to the lifetime counters and resets the open timer. All of it lives in IndexedDB kv, so backups carry it.
import * as db from './db.js';
import * as ST from './study-store.js';
import { makePayload, encodeReceipt, totalsFromTimer, ymd, ymdhm, randomId, SUBJECTS } from './receipt-core.js';

export const K_DAYS = 'days.v1', K_ARCHIVE = 'archive.v1', K_LIFE = 'lifetime.v1';
const emptyLife = () => ({ v: 1, minutes: 0, blocks: 0, b5: 0, b10: 0, fish: 0, shrimp: 0, days: [], counted: [] });

// every date from d1 to d2 inclusive ('YYYY-MM-DD'), at most 40
export function daysBetween(d1, d2) {
  const out = [], a = new Date(d1 + 'T12:00:00'), b = new Date(d2 + 'T12:00:00');
  if (isNaN(a) || isNaN(b)) return [d1, d2].filter(Boolean);
  for (let i = 0; i < 40 && a <= b; i++) { out.push(ymd(a)); a.setDate(a.getDate() + 1); }
  return out;
}

export async function getLifetime() {
  const l = await db.kvGet(K_LIFE, null);
  if (!l || typeof l !== 'object') return emptyLife();
  return { ...emptyLife(), ...l, days: Array.isArray(l.days) ? l.days : [], counted: Array.isArray(l.counted) ? l.counted : [] };
}
export async function getDays() { const a = await db.kvGet(K_DAYS, []); return Array.isArray(a) ? a.slice().sort((x, y) => (y.ts || 0) - (x.ts || 0)) : []; }
export async function getArchive() { const a = await db.kvGet(K_ARCHIVE, []); return Array.isArray(a) ? a.slice().sort((x, y) => (y.ts || 0) - (x.ts || 0)) : []; }
export async function deleteDay(id) { const a = (await db.kvGet(K_DAYS, [])).filter(x => x.id !== id); await db.kvSet(K_DAYS, a); }
export async function deleteArchive(id) { const a = (await db.kvGet(K_ARCHIVE, [])).filter(x => x.id !== id); await db.kvSet(K_ARCHIVE, a); }
export async function setMoved(id, moved) { const a = await db.kvGet(K_ARCHIVE, []); const r = a.find(x => x.id === id); if (r) { r.moved = !!moved; await db.kvSet(K_ARCHIVE, a); } }

// Build the receipt that the open timer would produce right now (no side effects)
export function buildPayload(sx, at = new Date()) {
  const S = ST.state(), tt = ST.totals();
  const start = S.dayStart ? new Date(S.dayStart) : at;
  const payload = makePayload({ id: S.rid || randomId(), d1: ymd(start), d2: ymd(at), ct: ymdhm(at), g: tt.g, b5: tt.b5, b10: tt.b10, s: tt.s, ex: tt.ex, exs: SUBJECTS.filter(k => S.examSubjs.includes(k)), sx: +Number(sx).toFixed(2) });
  return { payload, code: encodeReceipt(payload), totals: tt };
}

// Tear it off. Order: archive + days (idempotent by id), lifetime (counted once per id), then the timer is reset.
export async function tearOff(sx) {
  if (ST.isEmpty()) throw new Error('empty receipt');
  const { payload, code, totals } = buildPayload(sx);
  const ts = Date.now();
  // lifetime after this receipt (counted once per receipt id, so a repeated tear after a crash does not add twice)
  const life = await getLifetime();
  if (!life.counted.includes(payload.id)) {
    life.minutes += totals.totalMin; life.b5 += payload.b5; life.b10 += payload.b10; life.blocks += payload.b5 + payload.b10; life.fish += payload.f; life.shrimp += payload.sh;
    const d = new Set(life.days); for (const k of daysBetween(payload.d1, payload.d2)) d.add(k); life.days = [...d].sort();
    life.counted = [...life.counted, payload.id].slice(-200);
  }
  const arch = (await db.kvGet(K_ARCHIVE, [])).filter(x => x.id !== payload.id);
  // one normal check per day: a second check for a day that is already closed (the other device closed it first) is marked as a «Дополнение»
  const addendum = arch.some(x => x.payload && daysBetween(x.payload.d1, x.payload.d2).some(k => daysBetween(payload.d1, payload.d2).includes(k)));
  arch.push({ id: payload.id, ts, payload, code, moved: false, ...(addendum ? { addendum: true } : {}), life: { minutes: life.minutes, days: life.days, blocks: life.blocks, fish: life.fish, shrimp: life.shrimp } });
  await db.kvSet(K_ARCHIVE, arch);
  const days = (await db.kvGet(K_DAYS, [])).filter(x => x.id !== payload.id);
  const stub = { ...(addendum ? { addendum: true } : {}), id: payload.id, ts, d1: payload.d1, d2: payload.d2, minutes: totals.totalMin, fish: payload.f, shrimp: payload.sh, sx: payload.sx };
  days.push(stub);
  await db.kvSet(K_DAYS, days);
  await db.kvSet(K_LIFE, life);
  ST.resetAfterTear();
  return { payload, code, stub };
}

// «Объединить» in a restore: closed receipts are united by id, the lifetime counters never go down, the open timer stays as it is here.
export function mergeKv(key, local, incoming) {
  if (key === K_DAYS || key === K_ARCHIVE) {
    const have = new Set((Array.isArray(local) ? local : []).map(x => x.id));
    return [...(Array.isArray(local) ? local : []), ...(Array.isArray(incoming) ? incoming : []).filter(x => x && !have.has(x.id))];
  }
  if (key === K_LIFE) {
    const a = local && typeof local === 'object' ? local : emptyLife(), b = incoming && typeof incoming === 'object' ? incoming : emptyLife();
    const counted = new Set(a.counted || []), out = { ...emptyLife(), ...a };
    // receipts of the copy that are not counted here yet are added; counters that only the copy knows about (older receipts) are kept via max
    for (const k of ['minutes', 'blocks', 'b5', 'b10', 'fish', 'shrimp']) out[k] = Math.max(a[k] || 0, b[k] || 0);
    out.days = [...new Set([...(a.days || []), ...(b.days || [])])].sort();
    out.counted = [...new Set([...(a.counted || []), ...(b.counted || [])])].slice(-200); void counted;
    return out;
  }
  return local;   // studyTimer.v1 and everything else: the local value wins
}
export const MERGED_KV_KEYS = [K_DAYS, K_ARCHIVE, K_LIFE];
