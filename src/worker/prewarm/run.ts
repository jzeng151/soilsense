import { demoRequests, farms, uiHistory, type DemoHistories } from "../../shared/demoPlans";
import type { Env } from "../env";
import { makePlan, getField, planCacheKey, PLAN_ENGINE_VERSION } from "../service";
import { putCached } from "../lib/cache";

// One trigger, six runs/day: refresh before the six-hour TTL, including after UTC rollover.
export const PREWARM_CRON = "5 0,4,8,12,16,20 * * *";
export const PREWARM_BATCH_SIZE = 6;
export interface WarmRun {
  startedAt: string;
  completedAt: string | null;
  histories: DemoHistories;
  failures: number;
  errors: string[];
  mode: "external" | "inline";
}
const statusKey = () => `prewarm:${PLAN_ENGINE_VERSION}:last`;
export async function saveWarmRun(env: Env, run: WarmRun): Promise<void> {
  if (!env.DB) throw new Error("Durable plan cache unavailable");
  await putCached(env.DB, statusKey(), 7 * 86400, run);
}
export async function warmStatus(env: Env, now = new Date()) {
  if (!env.DB) throw new Error("Durable plan cache unavailable");
  const row = await env.DB.prepare("SELECT value FROM cache WHERE key = ?1 AND expires_at > ?2")
    .bind(statusKey(), now.getTime()).first<{ value: string }>();
  const run: WarmRun | null = row ? JSON.parse(row.value) : null;
  // Compute keys for TODAY, never present yesterday's successful run as today's coverage.
  const requests = demoRequests(run?.histories);
  const keys = requests.map(({ request }) => planCacheKey(request, {}, now));
  // SQLite json_each uses one parameter, below D1's 100-bound-parameter limit.
  const count = await env.DB.prepare("SELECT COUNT(*) AS n, MIN(expires_at) AS earliest FROM cache WHERE key IN (SELECT value FROM json_each(?1)) AND expires_at > ?2")
    .bind(JSON.stringify(keys), now.getTime()).first<{ n: number; earliest: number | null }>();
  return { date: now.toISOString().slice(0, 10), engineVersion: PLAN_ENGINE_VERSION,
    warmedToday: count?.n ?? 0, expected: keys.length, earliestExpiry: count?.earliest ? new Date(count.earliest).toISOString() : null,
    lastRunTime: run?.startedAt ?? null, completedAt: run?.completedAt ?? null,
    failures: run?.failures ?? 0, errors: run?.errors ?? [],
    mode: env.PLAN_COMPUTE_MODE === "cache-only" ? "external-required" : "inline",
    lastRunMode: run?.mode ?? null, cron: PREWARM_CRON, workflowBound: Boolean(env.PLAN_PREWARM) };
}
export interface WarmSteps {
  do<T>(name: string, callback: () => Promise<T>): Promise<T>;
}
// Also used as a graceful fallback on paid/inline deployments without the optional Workflow.
// Never called by a visitor request. Each Workflow batch has its own paid CPU budget.
export async function runPrewarm(env: Env, step: WarmSteps = { do: (_name, callback) => callback() }) {
  if (env.PLAN_COMPUTE_MODE === "cache-only") {
    console.log(JSON.stringify({ msg: "prewarm external runner required", cron: PREWARM_CRON }));
    return { skipped: true, reason: "cache-only requires off-Worker compute" };
  }
  if (!env.DB) throw new Error("Durable plan cache unavailable");
  const startedAt = await step.do("run time", async () => new Date().toISOString());
  const histories: DemoHistories = {};
  const run: WarmRun = { startedAt, completedAt: null, histories, failures: 0, errors: [], mode: "inline" };
  await step.do("start", () => saveWarmRun(env, run));
  for (const farm of farms) {
    try {
      histories[farm.name] = await step.do(`history ${farm.name}`, async () => [uiHistory(await getField(env, farm.lat, farm.lon))]);
    } catch (error) {
      run.failures++;
      if (run.errors.length < 10) run.errors.push(`History ${farm.name}: ${String(error).slice(0, 200)}`);
    }
  }
  const rows = demoRequests(histories);
  let warmed = 0;
  for (let i = 0; i < rows.length; i += PREWARM_BATCH_SIZE) {
    // A run crossing UTC midnight must not publish yesterday's plans under today's keys.
    if (new Date().toISOString().slice(0, 10) !== startedAt.slice(0, 10)) throw new Error("Prewarm crossed UTC rollover; rerun for today");
    const result = await step.do(`plans ${i}`, async () => {
      let count = 0;
      const errors: string[] = [];
      for (const { request, name } of rows.slice(i, i + PREWARM_BATCH_SIZE)) {
        try {
          const now = new Date();
          // opts.now forces fresh computation: reusing the four-hour-old cached result
          // would either expire before the next run or keep old observations alive forever.
          const plan = await makePlan(env, request, { now });
          if (!plan.location.county || !plan.plans.length) throw new Error("Incomplete plan; not cached");
          if (new Date().toISOString().slice(0, 10) !== now.toISOString().slice(0, 10)) throw new Error("UTC rollover during plan");
          await putCached(env.DB!, planCacheKey(request, {}, now), 6 * 3600, plan);
          count++;
        } catch (error) { errors.push(`${name}: ${String(error).slice(0, 200)}`); }
      }
      return { count, errors };
    });
    warmed += result.count;
    run.failures += result.errors.length;
    run.errors = [...run.errors, ...result.errors].slice(0, 10);
    await step.do(`status ${i}`, () => saveWarmRun(env, run));
    console.log(JSON.stringify({ msg: "prewarm batch", processed: Math.min(i + PREWARM_BATCH_SIZE, rows.length), expected: rows.length, warmed, failures: run.failures }));
  }
  run.completedAt = new Date().toISOString();
  await step.do("complete", () => saveWarmRun(env, run));
  return { warmed, expected: rows.length, failures: run.failures };
}
export async function startPrewarm(env: Env, scheduledTime = Date.now()) {
  // This check precedes even Workflow creation: Workflows Free steps ALSO have only 10 ms CPU.
  if (env.PLAN_COMPUTE_MODE === "cache-only") return runPrewarm(env);
  if (!env.PLAN_PREWARM) return runPrewarm(env);
  const slot = Math.floor(scheduledTime / (4 * 3600_000));
  const id = `demo-${PLAN_ENGINE_VERSION}-${slot}`;
  try { return { id: (await env.PLAN_PREWARM.create({ id, params: {} })).id }; }
  catch (error) {
    // A duplicate scheduled delivery is idempotent; real creation failures remain visible.
    if (/already exists|already been used|conflict/i.test(String(error))) return { id, duplicate: true };
    throw error;
  }
}
