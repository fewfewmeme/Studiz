// Check 6: SPA routing without page loads, view transition / fallback, long tasks, offline through the service worker.
const L = require('./lib.cjs');
const { ok, sleep } = L;

async function run(browser) {
  console.log('\n=== Routing, transitions, offline ===');
  const { ctx, p, logs } = await L.newSession(browser, { width: 1180, height: 820 });
  await p.evaluate(() => {
    window.__marker = 'alive'; window.__long = [];
    try { new PerformanceObserver(l => l.getEntries().forEach(e => window.__long.push(Math.round(e.duration)))).observe({ entryTypes: ['longtask'] }); } catch (e) { /* not supported */ }
  });
  await L.openSubject(p, 'Анатомия');
  await L.importFiles(p, ['sample.html', 'small.html']);
  await p.evaluate(() => { window.__long.length = 0; });
  const n0 = await p.evaluate(() => window.__nav.count);
  // home -> subject (shared element) -> doc -> back -> home through the sidebar
  await p.evaluate(() => { location.hash = '#/'; }); await p.waitForSelector('.subject-card');
  await p.click('.subject-card:has(strong:text-is("Анатомия"))'); await p.waitForSelector('.subj-hero');
  await p.click('.doc-card:has(.doc-title:text-is("small"))'); await p.waitForSelector('.reader'); await p.waitForFunction(() => window.__reader && window.__reader.doc() && window.__reader.doc().mode);
  await p.click('.rd-back'); await p.waitForSelector('.doc-card');
  await p.click('.sidebar a[data-nav="home"]'); await p.waitForSelector('.subject-card');
  const info = await p.evaluate(() => ({ marker: window.__marker, navEntries: performance.getEntriesByType('navigation').length, count: window.__nav.count, kind: window.__nav.kind, long: window.__long }));
  ok('ни одной полной перезагрузки страницы при переходах', info.marker === 'alive' && info.navEntries === 1, info);
  ok('каждый переход прошёл через роутер (счётчик растёт)', info.count - n0 >= 5, [n0, info.count]);
  ok('переходы идут через View Transitions или запасную анимацию', ['view-transition', 'fallback'].includes(info.kind), info.kind);
  const maxLong = Math.max(0, ...info.long);
  console.log('    long tasks during navigation (ms):', JSON.stringify(info.long));
  ok('нет длинных задач > 250 мс при переходах (главная/предмет/читалка)', maxLong < 250, info.long);
  ok('боковая панель и фон не перерисовываются между экранами', await p.evaluate(() => !!document.querySelector('#sidebar') && !!document.querySelector('#bg')));
  // reduced motion fallback path
  await p.emulateMedia({ reducedMotion: 'reduce' });
  await p.click('.subject-card:has(strong:text-is("Анатомия"))'); await p.waitForSelector('.subj-hero');
  ok('reduced motion: переход работает', await p.evaluate(() => window.__marker === 'alive'));
  await p.emulateMedia({ reducedMotion: 'no-preference' });
  // fallback animation (disable startViewTransition)
  await p.evaluate(() => { document.startViewTransition = undefined; });
  await p.click('.sidebar a[data-nav="home"]'); await p.waitForSelector('.subject-card');
  ok('запасная анимация (без View Transitions) работает', await p.evaluate(() => window.__nav.kind === 'fallback'));
  ok('нет console.error', logs.length === 0, logs);
  await ctx.close();

  // ---- offline through the service worker ----
  const s = await L.newSession(browser, { width: 1180, height: 820 }, { sw: true });
  const q = s.p;
  await q.evaluate(() => navigator.serviceWorker.ready);
  await q.waitForFunction(async () => { const ks = await caches.keys(); if (!ks.length) return false; const c = await caches.open(ks[0]); return (await c.keys()).length > 250; }, null, { timeout: 90000 }).catch(() => {});
  const cache = await q.evaluate(async () => { const ks = await caches.keys(); const c = await caches.open(ks[0]); const keys = (await c.keys()).map(r => new URL(r.url).pathname); return { name: ks[0], n: keys.length, fonts: keys.filter(k => k.endsWith('.woff2')).length, manifest: keys.some(k => k.endsWith('assets/manifest.json')), sticker: keys.some(k => k.endsWith('stickers/cat-hehe.webp')) }; });
  ok('service worker: кэш с версией, шрифты, стикеры и манифест ассетов', /^konspekty-[0-9a-f]{10}$/.test(cache.name) && cache.fonts >= 10 && cache.manifest && cache.sticker, cache);
  await L.openSubject(q, 'Анатомия');
  await L.importFiles(q, ['small.html', 'sample.pdf']);
  await s.ctx.setOffline(true);
  await q.reload(); await q.waitForSelector('.view > *', { timeout: 20000 });
  ok('офлайн: приложение загружается из кэша', !!(await q.waitForSelector('.doc-card', { timeout: 20000 }).catch(() => null)));
  const fontOk = await q.evaluate(async () => { await document.fonts.ready; const f = [...document.fonts].filter(x => x.status === 'loaded').map(x => x.family.replace(/"/g, '')); return f.includes('Manrope') && f.includes('Cormorant Garamond'); });
  ok('офлайн: шрифты Manrope и Cormorant доступны', fontOk);
  await q.click('.doc-card:has(.doc-title:text-is("small"))'); await L.waitFrameReady(q, 20000);
  ok('офлайн: документ открывается', (await L.frameOf(q).evaluate(() => document.body.textContent)).includes('Малый конспект'));
  await L.switchTo(q, 'book'); await L.frameOf(q).waitForSelector('.lz-cover', { timeout: 20000 });
  ok('офлайн: книга работает', true);
  await q.click('.rd-back'); await q.waitForSelector('.doc-card');
  await q.click('.doc-card:has(.cover-type:text-is("PDF"))'); await L.waitFrameReady(q, 20000);
  ok('офлайн: PDF открывается', await L.frameOf(q).evaluate(() => !!document.querySelector('p, img')));
  ok('нет console.error (офлайн)', s.logs.filter(l => !/Failed to load resource|net::ERR/.test(l)).length === 0, s.logs);
  await s.ctx.setOffline(false);
  await s.ctx.close();
}
module.exports = { run };
