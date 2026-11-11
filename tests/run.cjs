// Runs the whole suite: node tests/run.cjs [name ...]   (names: annotations book blocks routing migration visual)
const L = require('./lib.cjs');
const all = ['dark', 'sync', 'pinch', 'note', 'plan', 'core', 'routing', 'migration', 'master', 'r7', 'r7b', 'r7c', 'reg', 'r9b', 'r9c', 'r9d', 'r9e', 'r10'];

(async () => {
  const wanted = process.argv.slice(2).length ? process.argv.slice(2) : all;
  const srv = await L.startServer();
  const engines = [['chromium', L.pw.chromium]];
  if (process.env.WEBKIT) engines.push(['webkit', L.pw.webkit]);
  for (const [name, type] of engines) {
    let browser;
    try { browser = await type.launch(); } catch (e) { console.log(`\n(${name} unavailable: ${String(e.message).split('\n')[0]})`); continue; }
    console.log(`\n##### ${name} #####`);
    for (const t of wanted) {
      try { await require(`./t-${t}.cjs`).run(browser, name); }
      catch (e) { L.results.failed++; L.results.failures.push(`${t}: CRASH ${e.message.split('\n')[0]}`); console.log('  ✗ crash in', t, '\n', e.message.split('\n').slice(0, 6).join('\n')); }
    }
    await browser.close();
  }
  srv.kill();
  console.log(`\nTotal: ${L.results.passed} passed, ${L.results.failed} failed`);
  if (L.results.failed) { console.log('Failures:\n - ' + L.results.failures.join('\n - ')); process.exit(1); }
})();
