// Manual sync between devices (Layer A, no server): the data that COUNTS (completed blocks, closed checks) and the planner travel as one
// package: a short text code or a .json file. Importing is idempotent: events and checks have unique ids, importing the same package twice changes nothing.
import * as db from './db.js';
import * as ST from './study-store.js';
import * as RS from './receipt-store.js';
import * as P from './plan-store.js';

const MAGIC = 'LIZSYNC1';
export async function deviceId() { let d = await db.kvGet('sync.device', null); if (!d) { d = Math.random().toString(36).slice(2, 10); await db.kvSet('sync.device', d); } return d; }

export async function buildPackage() {
  const [events, days, archive, life, items, tt, week] = await Promise.all([ST.getEvents(), RS.getDays(), RS.getArchive(), RS.getLifetime(), P.getItems(), P.getTimetable(), db.kvGet(P.K_WEEK, {})]);
  return { magic: MAGIC, v: 1, device: await deviceId(), at: Date.now(), events, days, archive, life, plan: { items, timetable: tt, week } };
}

const b64u = bytes => { let s = ''; bytes.forEach(b => s += String.fromCharCode(b)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const unb64u = t => { t = t.replace(/-/g, '+').replace(/_/g, '/'); while (t.length % 4) t += '='; return Uint8Array.from(atob(t), c => c.charCodeAt(0)); };
async function pipe(bytes, Stream) { const s = new Blob([bytes]).stream().pipeThrough(new Stream('gzip')); return new Uint8Array(await new Response(s).arrayBuffer()); }
// text code: LIZSYNC1.<gzip+base64url of the JSON>  (gzip when the browser has it)
export async function toCode(pkg) {
  const raw = new TextEncoder().encode(JSON.stringify(pkg));
  try { if (typeof CompressionStream !== 'undefined') return `${MAGIC}.z.${b64u(await pipe(raw, CompressionStream))}`; } catch { /* plain */ }
  return `${MAGIC}.p.${b64u(raw)}`;
}
export async function fromText(text) {
  const t = String(text || '').trim();
  if (t.startsWith('{')) { const o = JSON.parse(t); if (o.magic !== MAGIC) throw new Error('bad'); return o; }
  const [m, kind, body] = t.split('.');
  if (m !== MAGIC || !body) throw new Error('bad');
  let bytes = unb64u(body); if (kind === 'z') bytes = await pipe(bytes, DecompressionStream);
  const o = JSON.parse(new TextDecoder().decode(bytes)); if (o.magic !== MAGIC) throw new Error('bad'); return o;
}

// merge a package into this device. Returns the numbers for the Russian summary.
export async function mergePackage(pkg) {
  const res = { events: 0, dup: 0, late: 0, fish: 0, shrimp: 0, checks: 0, addenda: 0, tasks: 0 };
  // closed days: a day that already has a torn-off check
  const days0 = await RS.getDays(), arch0 = await RS.getArchive();
  const closed = new Set(); for (const r of [...days0, ...arch0.map(a => a.payload || {})]) for (const k of RS.daysBetween(r.d1, r.d2)) closed.add(k);
  // checks first (ids make it idempotent); a check for an already closed date becomes a «Дополнение», never a second normal check
  const have = new Set(arch0.map(a => a.id)); const dayHave = new Set(days0.map(d => d.id));
  const A = [...arch0], D = [...days0];
  for (const a of Array.isArray(pkg.archive) ? pkg.archive : []) {
    if (!a || !a.id || have.has(a.id) || !a.payload) continue;
    const dup = RS.daysBetween(a.payload.d1, a.payload.d2).some(k => closed.has(k));
    A.push({ ...a, ...(dup ? { addendum: true } : {}) }); have.add(a.id); res.checks++; if (dup) res.addenda++;
    RS.daysBetween(a.payload.d1, a.payload.d2).forEach(k => closed.add(k));
  }
  for (const d of Array.isArray(pkg.days) ? pkg.days : []) {
    if (!d || !d.id || dayHave.has(d.id)) continue;
    const dup = RS.daysBetween(d.d1, d.d2).some(k => closed.has(k) && !have.has(d.id)) && !arch0.some(a => a.id === d.id);
    D.push({ ...d, ...(dup && !(Array.isArray(pkg.archive) && pkg.archive.some(a => a.id === d.id)) ? { addendum: true } : {}) }); dayHave.add(d.id);
  }
  await db.kvSet(RS.K_ARCHIVE, A); await db.kvSet(RS.K_DAYS, D);
  // lifetime counters: keep the larger numbers, union of the days (existing merge rule)
  await db.kvSet(RS.K_LIFE, RS.mergeKv(RS.K_LIFE, await RS.getLifetime(), pkg.life));
  // completed blocks (set union by id)
  await ST.initStudy();
  const ev = await ST.applyRemoteEvents(pkg.events, closed);
  res.events = ev.added; res.dup = ev.dup; res.late = ev.late.length; res.fish = ev.fish; res.shrimp = ev.shrimp;
  if (ev.late.length) {       // events of an already closed day: one «Дополнение» stub per day
    const byDay = {}; for (const e of ev.late) (byDay[e.dateKey] ||= []).push(e);
    const D2 = await RS.getDays();
    for (const [k, list] of Object.entries(byDay)) {
      const id = 'add-' + k + '-' + list[0].id.slice(0, 6), min = list.reduce((s, e) => s + e.minutes, 0);
      if (D2.some(x => x.id === id)) continue;
      D2.push({ id, ts: Date.now(), d1: k, d2: k, minutes: min, fish: list.reduce((s, e) => s + (e.minutes === 5 ? 1 : 2), 0), shrimp: list.filter(e => e.minutes === 10).length, sx: 0.5, addendum: true }); res.addenda++;
    }
    await db.kvSet(RS.K_DAYS, D2);
  }
  // planner: tasks by id (a task done on either device stays done), timetable only if this device has none, week notes where empty
  const mine = await P.getItems(), ids = new Map(mine.map(x => [x.id, x]));
  for (const t of Array.isArray(pkg.plan?.items) ? pkg.plan.items : []) {
    if (!t || typeof t.id !== 'string' || typeof t.text !== 'string' || !/^\d{4}-\d\d-\d\d$/.test(t.date || '')) continue;
    const m = ids.get(t.id); if (m) { if (t.done && !m.done) m.done = true; } else { mine.push({ id: t.id, date: t.date, subj: t.subj || null, text: String(t.text).slice(0, 300), done: !!t.done, fileId: null, fileMs: 0 }); res.tasks++; }
  }
  await db.kvSet(P.K_ITEMS, mine);
  const tt = await P.getTimetable(); if (!Object.values(tt).some(a => a.length) && pkg.plan?.timetable) await P.setTimetable(pkg.plan.timetable);
  return res;
}

export function summaryRu(r) {
  const parts = [];
  if (r.events) parts.push(`блоков: ${r.events} (🐟 ${r.fish}, 🦐 ${r.shrimp})`);
  if (r.checks) parts.push(`чеков: ${r.checks}`);
  if (r.tasks) parts.push(`задач: ${r.tasks}`);
  if (r.addenda) parts.push(`«Дополнений» к закрытым дням: ${r.addenda}`);
  const lead = parts.length ? 'Добавлено — ' + parts.join(', ') + '.' : 'Новых данных нет — всё уже было на этом устройстве.';
  return lead + (r.dup ? ` Уже были: ${r.dup}.` : '');
}
