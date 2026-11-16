// Build baseline/current engine ESM bundles first (see docs/CONSTRAINTS.md).
// node scripts/benchmark-constraints-paired.mjs <capture-and-bundle-dir> <output.json>
import { readFileSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const dir = process.argv[2];
const output = process.argv[3];
if (!dir || !output) throw new Error('Pass capture/bundle directory and output JSON path');
const { buildPlan: before } = await import(pathToFileURL(`${dir}/constraints-baseline-engine.mjs`).href);
const { buildPlan: after } = await import(pathToFileURL(`${dir}/constraints-current-engine.mjs`).href);
const histories = { finney: ['winter_wheat','corn','winter_wheat'], story: ['corn','corn'], champaign: ['soybean','corn'], lancaster: ['corn','soybean'] };
const rows = [];
for (const farm of Object.keys(histories)) {
 const data = JSON.parse(readFileSync(`${dir}/plan-input-${farm}.json`, 'utf8'));
 for (const irrigated of [false,true]) for (const priority of ['balanced','profit','soil','risk']) {
  const input = { ...data, now: new Date(data.now), request: { ...data.request, recentCrops: histories[farm], irrigated, priority } };
  for (let i = 0; i < 4; i++) { before(input); after(input); }
  const samples = { before: [], after: [] };
  let responseBefore;
  for (let rep = 0; rep < 8; rep++) for (const [name, fn] of rep % 2 ? [['after', after], ['before', before]] : [['before', before], ['after', after]]) {
   const cpu = process.cpuUsage(); const start = performance.now(); const response = fn(input); const delta = process.cpuUsage(cpu);
   samples[name].push({ cpuMs: (delta.user + delta.system) / 1000, wallMs: performance.now() - start });
   if (rep === 0 && name === 'before') responseBefore = JSON.stringify(response);
   if (rep === 0 && name === 'after') assert.equal(JSON.stringify(response), responseBefore, `Full response changed: ${farm}/${irrigated}/${priority}`);
  }
  rows.push({ farm, irrigated, priority, ...samples });
 }
}
const median = xs => { const s = xs.toSorted((a,b) => a-b); return (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };
const summary = Object.fromEntries(['before','after'].map(name => [name, Object.fromEntries(['cpuMs','wallMs'].map(metric => [metric, median(rows.flatMap(r => r[name].map(s => s[metric])))]))]));
assert.equal(rows.length, 32);
writeFileSync(output, JSON.stringify({ runtime: process.version, platform: process.platform, warmups: 4, repetitions: 8, order: 'alternating before/after each repetition', fullResponsesIdentical: true, summary, rows, disclaimer: 'Local process CPU/wall, not Cloudflare billed CPU. Windows counters are coarse; concurrent host activity is uncontrolled.' }, null, 2));
console.log(JSON.stringify(summary));
