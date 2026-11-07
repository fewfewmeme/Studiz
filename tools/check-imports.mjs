// Checks that every named import between local modules exists. Run: node tools/check-imports.mjs
import fs from 'node:fs'; import path from 'node:path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const files = ['config.js'];
const walk = d => { for (const e of fs.readdirSync(path.join(root, d), { withFileTypes: true })) { const r = d + '/' + e.name; if (e.isDirectory()) walk(r); else if (r.endsWith('.js')) files.push(r); } };
walk('js');
const exportsOf = {};
for (const f of files) {
  const src = fs.readFileSync(path.join(root, f), 'utf8');
  const ex = new Set();
  for (const m of src.matchAll(/export\s+(?:async\s+)?(?:function|const|let|class)\s+([A-Za-z0-9_$]+)/g)) ex.add(m[1]);
  for (const m of src.matchAll(/export\s*\{([^}]+)\}/g)) m[1].split(',').forEach(s => ex.add(s.trim().split(/\s+as\s+/).pop()));
  exportsOf[f] = ex;
}
let bad = 0;
for (const f of files) {
  const src = fs.readFileSync(path.join(root, f), 'utf8');
  for (const m of src.matchAll(/import\s*\{([^}]+)\}\s*from\s*'(\.[^']+)'/g)) {
    const target = path.posix.normalize(path.posix.join(path.posix.dirname(f), m[2]));
    if (!exportsOf[target]) { if (!m[2].includes('vendor')) { console.log('missing file', f, m[2]); bad++; } continue; }
    for (const name of m[1].split(',').map(s => s.trim().split(/\s+as\s+/)[0]).filter(Boolean))
      if (!exportsOf[target].has(name)) { console.log(`${f}: "${name}" is not exported by ${target}`); bad++; }
  }
}
console.log(bad ? `errors: ${bad}` : 'imports: OK');
process.exit(bad ? 1 : 0);
