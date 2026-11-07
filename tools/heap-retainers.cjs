// Diagnoses what keeps DETACHED DOM nodes alive after the reader was opened/closed N times (heap snapshot + shortest retaining path).
//   NODE_PATH=<dir with playwright> node tools/heap-retainers.cjs [cycles=6] [className=HTMLIFrameElement]
// Needs the perf fixtures (node tests/gen-perf-fixtures.cjs). Prints, for up to 3 detached nodes of that class, the chain root -> ... -> node.
const P = require('../tests/perf-lib.cjs'), L = P.L;
const cycles = +process.argv[2] || 6, cls = process.argv[3] || 'HTMLIFrameElement';
(async () => {
  const srv = await L.startServer();
  const browser = await L.pw.chromium.launch();
  const S = await P.session(browser, { cpu: 1 });
  await P.importFile(S.p, 'perf/angiology162.html');
  const files = await L.idb(S.p, 'files'); const id = files.find(f => f.name === 'angiology162').id;
  const cycle = async () => { await S.p.evaluate(x => { location.hash = '#/file/' + x; }, id); await S.p.waitForSelector('.reader .lz-frame:not(.lz-hidden)', { timeout: 60000 }).then(hd => hd.dispose()); await S.p.evaluate(() => { location.hash = '#/'; }); await S.p.waitForSelector('.hero').then(hd => hd.dispose()); };
  for (let i = 0; i < cycles; i++) await cycle();
  await S.p.evaluate(() => new Promise(r => setTimeout(r, 500)));
  for (let i = 0; i < 3; i++) await S.cdp.send('HeapProfiler.collectGarbage');
  const chunks = []; S.cdp.on('HeapProfiler.addHeapSnapshotChunk', e => chunks.push(e.chunk));
  await S.cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false, captureNumericValue: false });
  const snap = JSON.parse(chunks.join(''));
  const m = snap.snapshot.meta, nf = m.node_fields, ef = m.edge_fields, NF = nf.length, EF = ef.length;
  const iName = nf.indexOf('name'), iType = nf.indexOf('type'), iEdges = nf.indexOf('edge_count'), iDet = nf.indexOf('detachedness');
  const eType = ef.indexOf('type'), eName = ef.indexOf('name_or_index'), eTo = ef.indexOf('to_node');
  const nodes = snap.nodes, edges = snap.edges, strings = snap.strings, N = nodes.length / NF;
  const etypes = m.edge_types[0], ntypes = m.node_types[0];
  const first = new Int32Array(N + 1); for (let i = 0, e = 0; i < N; i++) { first[i] = e; e += nodes[i * NF + iEdges]; } first[N] = edges.length / EF;
  const prev = new Int32Array(N).fill(-1), via = new Int32Array(N).fill(-1), q = [0]; prev[0] = 0;
  for (let h = 0; h < q.length; h++) {
    const u = q[h];
    for (let e = first[u]; e < first[u + 1]; e++) {
      const t = etypes[edges[e * EF + eType]]; if (t === 'weak' || t === 'shortcut') continue;
      const v = edges[e * EF + eTo] / NF; if (prev[v] !== -1) continue;
      prev[v] = u; via[v] = e; q.push(v);
    }
  }
  const nm = i => strings[nodes[i * NF + iName]];
  const targets = []; for (let i = 0; i < N; i++) if (nm(i).includes('<' + (process.argv[4] || 'iframe')) || nm(i).startsWith('Detached ')) targets.push(i);
  const detached = targets.filter(i => nm(i).startsWith('Detached') || nodes[i * NF + iDet] === 2);
  const hist = {}; for (const i of targets) { const k = nm(i).replace(/ .*/, '').slice(0, 30) + '#' + nodes[i * NF + iDet]; hist[k] = (hist[k] || 0) + 1; } console.log('histogram (class#detachedness):', JSON.stringify(hist));
  console.log(`${cls}: total ${targets.length}, detached ${detached.length} after ${cycles} cycles`);
  for (const t of detached.slice(0, 3)) {
    const chain = []; for (let v = t, g = 0; v !== 0 && prev[v] !== -1 && g < 60; v = prev[v], g++) { const e = via[v]; const en = etypes[edges[e * EF + eType]]; const eNameV = en === 'element' || en === 'hidden' ? edges[e * EF + eName] : strings[edges[e * EF + eName]]; chain.push(`${nm(v)} <-[${en}:${eNameV}]-`); }
    console.log('\n' + chain.join('\n  '));
  }
  await browser.close(); srv.kill?.(); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
