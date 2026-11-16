// Free-plan prewarming: compute locally/on paid Workers, import complete plans, verify the target.
// npm run build && npm run db:migrate:local
// npx wrangler dev -c wrangler.offline.jsonc --port 8791 --var PLAN_COMPUTE_MODE:inline --var ADMIN_TOKEN:local-prefetch-only
// ADMIN_TOKEN=<target secret> LOCAL_ADMIN_TOKEN=local-prefetch-only PLAN_COMPUTE_ORIGIN=http://127.0.0.1:8791 node scripts/prefetch-demo.mjs https://your-worker.workers.dev
// Both origins need matching admin credentials to exempt prewarming from the visitor rate limit.
// --list prints fixed profiles without network/secrets; --list-live adds the current UI-inferred histories.
// --limit=N is a smoke test ONLY. Rewarm every 4h and after midnight UTC (date/version are in the key).
// This covers mapped histories, original presets, corn answers and inferred UI defaults, not arbitrary edits/goals/measurements.
// Workers Paid: the default inline mode computes fresh plans. Workers Free: set PLAN_COMPUTE_MODE=cache-only on the
// target and prewarm with this script (fresh computation exceeds the Free 10 ms CPU budget).
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { demoRequests, farms, uiHistory } from "../src/shared/demoPlans.ts";
export { demoRequests, farms, uiHistory };
async function jsonFetch(url, init = {}) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(180000) });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { throw new Error(`${url}: HTTP ${res.status}, non-JSON response (possible resource failure)`); }
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}: ${body.error ?? "request failed"}`);
  return body;
}

export async function main(args = process.argv.slice(2)) {
  let all = demoRequests();
  if (args.includes("--list")) { console.log(JSON.stringify(all, null, 2)); return; }
  const targetIndex = args.indexOf("--target");
  if (targetIndex !== -1 && (!args[targetIndex + 1] || args[targetIndex + 1].startsWith("--"))) throw new Error("--target requires a URL");
  const base = (targetIndex === -1 ? args.find(arg => !arg.startsWith("--")) ?? "http://127.0.0.1:8815" : args[targetIndex + 1]).replace(/\/$/, "");
  const source = (process.env.PLAN_COMPUTE_ORIGIN ?? base).replace(/\/$/, "");
  const sourceToken = process.env.LOCAL_ADMIN_TOKEN ?? process.env.ADMIN_TOKEN;
  const auth = process.env.ADMIN_TOKEN ? { Authorization: `Bearer ${process.env.ADMIN_TOKEN}` } : {};
  const sourceAuth = sourceToken ? { Authorization: `Bearer ${sourceToken}` } : {};
  const post = (body, headers) => ({ method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
  const [targetRuntime, sourceRuntime] = await Promise.all([jsonFetch(`${base}/api/plan/runtime`), jsonFetch(`${source}/api/plan/runtime`)]);
  if (sourceRuntime.engineVersion !== targetRuntime.engineVersion) throw new Error("Source and target engine versions differ; use the same checkout/build.");
  if (sourceRuntime.computeMode !== "inline") throw new Error("Source must have PLAN_COMPUTE_MODE=inline; do not run fresh computation on Workers Free.");
  if (!process.env.ADMIN_TOKEN) throw new Error("ADMIN_TOKEN is required for authenticated prewarming (including the rate-limit exemption).");
  const extraHistories = Object.fromEntries(await Promise.all(farms.map(async (farm) => {
    const field = await jsonFetch(`${base}/api/field?lat=${farm.lat}&lon=${farm.lon}`, { headers: auth });
    return [farm.name, [uiHistory(field)]];
  })));
  all = demoRequests(extraHistories);
  if (args.includes("--list-live")) { console.log(JSON.stringify(all, null, 2)); return; }
  const limitArg = args.find((arg) => arg.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.slice(8)) : all.length;
  if (!Number.isInteger(limit) || limit < 1) throw new Error("--limit must be a positive integer");
  const rows = all.slice(0, limit);
  let complete = 0, failures = 0;
  const errors = [];
  const startedAt = new Date().toISOString();
  const report = async finished => jsonFetch(`${base}/api/prewarm/status`, post({ startedAt,
    completedAt: finished ? new Date().toISOString() : null, histories: extraHistories, failures, errors, mode: "external" }, auth));
  await report(false);
  for (const { name, request } of rows) {
    try {
      const plan = await jsonFetch(`${source}/api/plan`, post(request, sourceAuth));
      if (!plan.plans?.length || !plan.location?.county) throw new Error(`${name}: incomplete source plan; not imported`);
      if (source !== base) await jsonFetch(`${base}/api/plan/cache`, post({ engineVersion: targetRuntime.engineVersion, plan }, auth));
      const saved = await jsonFetch(`${base}/api/plan`, post(request, auth));
      if (!isDeepStrictEqual(saved, plan)) throw new Error(`${name}: target read-back differs from computed plan`);
      complete++;
      console.log(`${complete}/${rows.length} ${name} ${request.water}/${request.priority}/${request.language} history=${request.recentCrops?.join(",") ?? "mapped"}: ${saved.plans[0].label}`);
    } catch (error) {
      failures++;
      if (errors.length < 10) errors.push(String(error.message).slice(0, 300));
      console.error(`${name}: ${error.message}`);
    }
    if ((complete + failures) % 12 === 0) await report(false);
  }
  await report(true);
  const status = await jsonFetch(`${base}/api/prewarm/status`, { headers: auth });
  console.log(`Verified ${complete}/${rows.length} requests (${all.length} required for the full demo matrix). Durable warm status: ${status.warmedToday}/${status.expected}; failures=${failures}.`);
  if (failures || (!limitArg && status.warmedToday !== all.length)) throw new Error("Demo matrix incomplete; inspect /api/prewarm/status and rerun.");
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
