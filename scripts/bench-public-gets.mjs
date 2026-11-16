// Run against a local Wrangler only: node scripts/bench-public-gets.mjs [label] [base URL]
import { writeFile } from 'node:fs/promises';
const label = process.argv[2] ?? 'sample';
const base = process.argv[3] ?? 'http://127.0.0.1:8817';
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw new Error('Local benchmark only');
const results = [];
for (const path of ['/api/fields?area=finney', '/api/fields/status', '/api/research/status', '/api/research/corpus', '/api/refresh/status']) {
  const samples = [];
  const states = {};
  for (let i = 0; i < 31; i++) {
    const start = performance.now();
    const response = await fetch(base + path);
    await response.arrayBuffer();
    if (response.status !== 200) throw new Error(`${path}: ${response.status}`);
    if (i) {
      samples.push(performance.now() - start);
      const state = response.headers.get('x-edge-cache') ?? 'none';
      states[state] = (states[state] ?? 0) + 1;
    }
  }
  const sorted = [...samples].sort((a, b) => a - b);
  results.push({ path, n: samples.length, p50_ms: sorted[Math.ceil(samples.length * .5) - 1], p95_ms: sorted[Math.ceil(samples.length * .95) - 1], states, samples_ms: samples });
}
console.log(JSON.stringify({ label, base, results }, null, 2));
// Optional file is explicit, so no generated artifacts pollute the repository.
if (process.env.BENCH_OUTPUT) await writeFile(process.env.BENCH_OUTPUT, JSON.stringify({ label, base, results }, null, 2) + '\n');
