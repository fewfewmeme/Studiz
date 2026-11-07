// node tests/regression/record.cjs [WxH]   -> tests/regression/baseline-WxH.json (+ baseline/*.jpg for 1000x700)
const L = require('../lib.cjs'); const fs = require('fs'), path = require('path'); const { collect } = require('./lib.cjs');
(async () => {
  const [w, h] = (process.argv[2] || '1000x700').split('x').map(Number);
  const srv = await L.startServer(); const browser = await L.pw.chromium.launch();
  const { res } = await collect(browser, { width: w, height: h }, { shotsDir: path.join(__dirname, 'baseline'), log: k => process.stdout.write('.') });
  fs.writeFileSync(path.join(__dirname, `baseline-${w}x${h}.json`), JSON.stringify(res, null, 1));
  console.log('\nrecorded', Object.keys(res).length, 'view states');
  await browser.close(); srv.kill();
})();
