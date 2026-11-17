// Read-only verification against the selected target; writes only the optional local report file.
import { performance } from "node:perf_hooks";
import { writeFileSync } from "node:fs";
import { demoRequests, farms, uiHistory } from "../src/shared/demoPlans.ts";
const target = process.argv[2];
if (!target || !process.env.ADMIN_TOKEN) throw new Error("Usage: ADMIN_TOKEN=... node scripts/verify-prewarm.mjs <target> [report.json]");
const base = target.replace(/\/$/, "");
const headers = { Authorization: `Bearer ${process.env.ADMIN_TOKEN}`, "Content-Type": "application/json" };
const histories = Object.fromEntries(await Promise.all(farms.map(async farm => {
  const r = await fetch(`${base}/api/field?lat=${farm.lat}&lon=${farm.lon}`, { headers });
  if (!r.ok) throw new Error(`Field lookup failed: ${r.status}`);
  return [farm.name, [uiHistory(await r.json())]];
})));
const rows = demoRequests(histories), durations = [], statuses = {};
const start = performance.now();
for (const { request } of rows) {
  const before = performance.now();
  const r = await fetch(`${base}/api/plan`, { method: "POST", headers, body: JSON.stringify(request) });
  await r.arrayBuffer();
  durations.push(performance.now() - before);
  statuses[r.status] = (statuses[r.status] ?? 0) + 1;
}
durations.sort((a, b) => a - b);
const runtime = await (await fetch(`${base}/api/plan/runtime`)).json();
const status = await (await fetch(`${base}/api/prewarm/status`, { headers })).json();
const report = { target: base, checkedAt: new Date().toISOString(), runtime, requests: rows.length, statuses,
  wallMs: Math.round(performance.now() - start), medianMs: Number(durations[Math.floor(durations.length / 2)].toFixed(2)),
  p95Ms: Number(durations[Math.floor(durations.length * .95)].toFixed(2)), status };
if (process.argv[3]) writeFileSync(process.argv[3], JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
if (statuses[200] !== rows.length) process.exitCode = 1;
