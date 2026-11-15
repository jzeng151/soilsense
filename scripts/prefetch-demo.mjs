// Free-plan prewarming: compute locally/on paid Workers, import complete plans, verify the target.
// npm run build && npm run db:migrate:local
// npx wrangler dev -c wrangler.offline.jsonc --port 8791 --var PLAN_COMPUTE_MODE:inline --var ADMIN_TOKEN:local-prefetch-only
// ADMIN_TOKEN=<target secret> LOCAL_ADMIN_TOKEN=local-prefetch-only PLAN_COMPUTE_ORIGIN=http://127.0.0.1:8791 node scripts/prefetch-demo.mjs https://your-worker.workers.dev
// Both origins need matching admin credentials to exempt prewarming from the visitor rate limit.
// --list prints fixed profiles without network/secrets; --list-live adds the current UI-inferred histories.
// --limit=N is a smoke test ONLY. Rewarm every 6h and after midnight UTC (date/version are in the key).
// This covers mapped histories, original presets, corn answers and inferred UI defaults, not arbitrary edits/goals/measurements.
// For interactive uncached planning use Workers Paid + PLAN_COMPUTE_MODE=inline, not Workers Free.
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
export const farms = [
  { name: "Story County, IA", lat: 42.0563, lon: -93.495, recentCrops: ["corn", "corn"] },
  { name: "Champaign County, IL", lat: 40.048, lon: -88.33, recentCrops: ["soybean", "corn"] },
  { name: "Finney County, KS", lat: 38.1095, lon: -100.706, recentCrops: ["corn", "corn"] },
  { name: "Lancaster County, NE", lat: 40.73, lon: -96.55, recentCrops: ["corn", "soybean"] },
  { name: "Ames, IA (50010)", lat: 42.0379, lon: -93.6003, recentCrops: ["corn"] },
];
export function demoRequests(extraHistories = {}) {
  const rows = [];
  for (const farm of farms) {
    // UI users with unavailable CDL commonly enter corn; retain both original
    // presets and history-free API requests, plus the actual UI's inferred history.
    const profiles = [undefined, farm.recentCrops, ["corn"], ...(extraHistories[farm.name] ?? [])];
    const unique = [...new Map(profiles.map((history) => [JSON.stringify(history ?? []), history])).values()];
    for (const history of unique) for (const water of ["rain", "limited", "full"])
      for (const priority of ["balanced", "profit", "soil", "risk"]) for (const language of ["en", "es"]) rows.push({ name: farm.name, request: {
        lat: farm.lat, lon: farm.lon, water, irrigated: water !== "rain", priority, language,
        ...(history ? { recentCrops: history } : {}),
      } });
  }
  return rows;
}
async function jsonFetch(url, init = {}) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(180000) });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { throw new Error(`${url}: HTTP ${res.status}, non-JSON response (possible resource failure)`); }
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}: ${body.error ?? "request failed"}`);
  return body;
}
export function uiHistory(field, now = new Date()) {
  const last = [...(field.cropHistory?.years ?? [])].reverse().find((year) => year.crop);
  if (!last) return ["corn"]; // a common explicit answer when the UI cannot infer one
  const crop = last.crop === "corn" ? "soybean" : last.crop === "soybean" ? "corn" : last.crop;
  const season = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  return last.year < season ? [last.crop, crop] : [crop];
}
export async function main(args = process.argv.slice(2)) {
  let all = demoRequests();
  if (args.includes("--list")) { console.log(JSON.stringify(all, null, 2)); return; }
  const base = (args.find((arg) => !arg.startsWith("--")) ?? "http://127.0.0.1:8791").replace(/\/$/, "");
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
    const field = await jsonFetch(`${source}/api/field?lat=${farm.lat}&lon=${farm.lon}`, { headers: sourceAuth });
    return [farm.name, [uiHistory(field)]];
  })));
  all = demoRequests(extraHistories);
  if (args.includes("--list-live")) { console.log(JSON.stringify(all, null, 2)); return; }
  const limitArg = args.find((arg) => arg.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.slice(8)) : all.length;
  if (!Number.isInteger(limit) || limit < 1) throw new Error("--limit must be a positive integer");
  const rows = all.slice(0, limit);
  let complete = 0;
  for (const { name, request } of rows) {
    const plan = await jsonFetch(`${source}/api/plan`, post(request, sourceAuth));
    if (!plan.plans?.length || !plan.location?.county) throw new Error(`${name}: incomplete source plan; not imported`);
    if (source !== base) await jsonFetch(`${base}/api/plan/cache`, post({ engineVersion: targetRuntime.engineVersion, plan }, auth));
    const saved = await jsonFetch(`${base}/api/plan`, post(request, auth));
    if (!isDeepStrictEqual(saved, plan)) throw new Error(`${name}: target read-back differs from computed plan`);
    complete++;
    console.log(`${complete}/${rows.length} ${name} ${request.water}/${request.priority}/${request.language} history=${request.recentCrops?.join(",") ?? "mapped"}: ${saved.plans[0].label}`);
  }
  console.log(`Verified ${complete}/${rows.length} requests (${all.length} required for the full demo matrix).`);
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
