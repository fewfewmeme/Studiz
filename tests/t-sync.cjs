// Sync Layer A: two devices complete blocks the same day, export / import both ways -> one check for the date, the union of events, equal totals; importing twice changes nothing.
const L = require('./lib.cjs'); const { ok } = L;
async function run(browser) {
  console.log('\n=== Синхронизация вручную: два устройства ===');
  const mk = async () => { const s = await L.newSession(browser, { width: 1180, height: 820 }); await s.p.evaluate(() => { location.hash = '#/settings'; }); await s.p.waitForSelector('.card'); return s; };
  const A = await mk(), B = await mk();
  const credit = (p, lens) => p.evaluate(async lens => { const ST = await import('./js/study-store.js'); await ST.initStudy(); ST.openFile({ id: 'f', subject: 'anatomy' }, 'normal'); for (const l of lens) ST.creditBlock(l); return ST.totals(); }, lens);
  const ta = await credit(A.p, [5, 10]), tb = await credit(B.p, [5, 5]);
  ok('на каждом устройстве свои блоки', ta.b5 === 1 && ta.b10 === 1 && tb.b5 === 2, [ta.b5, ta.b10, tb.b5]);
  const exportCode = p => p.evaluate(async () => { const S = await import('./js/sync.js'); return S.toCode(await S.buildPackage()); });
  const importCode = (p, code) => p.evaluate(async c => { const S = await import('./js/sync.js'); const r = await S.mergePackage(await S.fromText(c)); const ST = await import('./js/study-store.js'); return { r, t: ST.totals() }; }, code);
  const ca = await exportCode(A.p), cb = await exportCode(B.p);
  ok('код начинается с LIZSYNC1 и читается', /^LIZSYNC1\./.test(ca) && /^LIZSYNC1\./.test(cb));
  const ia = await importCode(A.p, cb), ib = await importCode(B.p, ca);
  ok('после обмена на обоих устройствах одно и то же: 3 блока по 5 и 1 блок по 10', ia.t.b5 === 3 && ia.t.b10 === 1 && ib.t.b5 === 3 && ib.t.b10 === 1, [ia.t, ib.t].map(t => [t.b5, t.b10]));
  ok('🐟 и 🦐 сходятся: 3 + 2 = 5 рыбок и 1 креветка', ia.t.rewards.fish === 5 && ia.t.rewards.shrimp === 1 && ib.t.rewards.fish === 5 && ib.t.rewards.shrimp === 1, [ia.t.rewards, ib.t.rewards]);
  const again = await importCode(A.p, cb);
  ok('тот же код второй раз ничего не меняет', again.t.b5 === 3 && again.t.b10 === 1 && again.r.events === 0 && again.r.dup >= 2, again);
  const closedLate = await A.p.evaluate(async () => { const RS = await import('./js/receipt-store.js'); await RS.tearOff(0.5); return (await RS.getArchive()).length; });
  ok('чек закрыт на iPad (один чек за день)', closedLate === 1);
  const gotLate = await credit(B.p, [10]);       // the phone completes one more block of the same day AFTER the iPad closed the check
  const late = await importCode(A.p, await exportCode(B.p));
  const days = await A.p.evaluate(async () => (await (await import('./js/receipt-store.js')).getDays()));
  ok('поздний блок закрытого дня — «Дополнение», а не второй чек', late.r.late === 1 && days.some(d => d.addendum) && late.t.b10 === 0, [late.r, days.length]);
  ok('без ошибок в консоли', !A.logs.length && !B.logs.length, [A.logs, B.logs]);
  void gotLate;
}
module.exports = { run };
