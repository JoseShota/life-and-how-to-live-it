// P1-9 budgets, minified sizes, checked after `vite build` (the build fails when one is exceeded):
// - the entry chunk (the script index.html loads) stays under 300 kB;
// - everything the browser loads before the first page's own chunk (entry + modulepreloaded vendor) stays under
//   350 kB, so moving code into the vendor chunk can't hide growth.
import { readFileSync, statSync } from 'node:fs';

const LIMIT_KB = 300;
const STARTUP_LIMIT_KB = 350;
const html = readFileSync('dist/index.html', 'utf8');
const scripts = [...html.matchAll(/<script[^>]+src="\/([^"]+\.js)"/g)].map(m => m[1]);
const preloads = [...html.matchAll(/<link rel="modulepreload"[^>]+href="\/([^"]+\.js)"/g)].map(m => m[1]);
const kb = f => statSync(`dist/${f}`).size / 1024;
let failed = false;
for (const f of scripts) {
  const size = kb(f);
  const ok = size < LIMIT_KB;
  failed ||= !ok;
  console.log(`${ok ? 'ok  ' : 'FAIL'} entry ${f}: ${size.toFixed(1)} kB (limit ${LIMIT_KB} kB)`);
}
for (const f of preloads) console.log(`     preloaded ${f}: ${kb(f).toFixed(1)} kB`);
const startup = [...scripts, ...preloads].reduce((sum, f) => sum + kb(f), 0);
const startupOk = startup < STARTUP_LIMIT_KB;
failed ||= !startupOk;
console.log(`${startupOk ? 'ok  ' : 'FAIL'} startup JS (entry + preloads): ${startup.toFixed(1)} kB (limit ${STARTUP_LIMIT_KB} kB)`);
if (!scripts.length) { console.error('check-bundle: no entry script found in dist/index.html'); process.exit(1); }
if (failed) process.exit(1);
