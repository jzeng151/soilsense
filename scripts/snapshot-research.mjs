// Capture REAL retrieval + explanation output from the deployed Worker into the checked-in saved bundle
// (src/worker/research/saved-evidence.json), keyed by the full comparison key. Only live results (a real
// Vectorize retrieval and a validated Workers AI generation) are saved; anything else is reported and skipped.
//
// Usage: ADMIN_TOKEN=<admin token> node scripts/snapshot-research.mjs https://soilsense.<you>.workers.dev [scenarios.json]
// Then review the diff, commit, and redeploy so the Worker bundles the saved file.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const base = (process.argv[2] ?? "http://127.0.0.1:8787").replace(/\/$/, "");
const token = process.env.ADMIN_TOKEN;
if (!token) {
  console.error("Set ADMIN_TOKEN (the Worker's ADMIN_TOKEN secret).");
  process.exit(1);
}
const OUT = fileURLToPath(new URL("../src/worker/research/saved-evidence.json", import.meta.url));

// Scripted demo scenarios (same farms as scripts/prefetch-demo.mjs). Each must match what the dashboard
// sends exactly (lat/lon, water, priority, recentCrops), or the saved entry will never be used.
const DEFAULT_SCENARIOS = [
  { name: "Story County, IA", lat: 42.0563, lon: -93.495, water: "rain", priority: "balanced", recentCrops: ["corn", "corn"] },
  { name: "Champaign County, IL", lat: 40.048, lon: -88.33, water: "rain", priority: "balanced", recentCrops: ["soybean", "corn"] },
  { name: "Finney County, KS", lat: 38.1095, lon: -100.706, water: "full", priority: "balanced", recentCrops: ["corn", "corn"] },
];
const scenarios = process.argv[3] ? JSON.parse(readFileSync(process.argv[3], "utf8")) : DEFAULT_SCENARIOS;
const ROTATIONS = ["plan-1", "plan-2", "plan-3"];

const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
const bundle = JSON.parse(readFileSync(OUT, "utf8"));
const byKey = new Map((bundle.entries ?? []).map((e) => [e.comparisonKey, e]));
let added = 0;

for (const s of scenarios) {
  const req = { lat: s.lat, lon: s.lon, water: s.water, irrigated: s.water !== "rain", priority: s.priority ?? "balanced", recentCrops: s.recentCrops, language: "en" };
  // Warm/build the plan first (cached in D1) so the explain route reuses the identical plan.
  const plan = await fetch(`${base}/api/plan`, { method: "POST", headers, body: JSON.stringify(req) });
  if (!plan.ok) {
    console.log(`${s.name}: plan failed (${plan.status}); skipped`);
    continue;
  }
  for (const rotationId of ROTATIONS) {
    const t = Date.now();
    const res = await fetch(`${base}/api/research/explain`, { method: "POST", headers, body: JSON.stringify({ ...req, rotationId, capture: true }) });
    const j = await res.json().catch(() => ({}));
    const label = `${s.name} ${rotationId}`;
    if (!res.ok) {
      console.log(`${label}: HTTP ${res.status} ${j.error ?? ""}`);
      continue;
    }
    console.log(`${label}: explanation=${j.status} research=${j.research?.status} in ${Date.now() - t} ms${j.reason ? ` [${j.reason}]` : ""}`);
    console.log(`   ${j.narrative}`);
    if (!j.capture) {
      console.log("   not saved: only live retrieval + validated live generation are saved");
      continue;
    }
    byKey.set(j.capture.comparisonKey, { ...j.capture, scenarioName: s.name });
    added++;
  }
}

bundle.entries = [...byKey.values()];
bundle.capturedFrom = base;
bundle.updatedAt = new Date().toISOString();
writeFileSync(OUT, `${JSON.stringify(bundle, null, 2)}\n`);
console.log(`Saved ${added} new/updated entries (${bundle.entries.length} total) to ${OUT}. Review, commit and redeploy.`);
