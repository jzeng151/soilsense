import { DatabaseSync } from "node:sqlite";
import { beforeEach, expect, it } from "vitest";
import { api } from "../src/worker/routes/api";
import { clearMemoryCache } from "../src/worker/lib/cache";
import { PLAN_ENGINE_VERSION, makePlan, planCacheKey } from "../src/worker/service";
import { buildPlan } from "../src/engine/plan";
import { finneyInputs } from "./helpers/finney";
import type { PlanRequest } from "../src/shared/types";
const ctx = { waitUntil: () => {}, passThroughOnException: () => {}, props: {} } as unknown as ExecutionContext;
function database(): D1Database {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE cache(key TEXT PRIMARY KEY, value TEXT, expires_at INTEGER, created_at INTEGER)");
  const stmt = (sql: string, args: unknown[] = []) => ({
    bind: (...a: unknown[]) => stmt(sql, a),
    first: async () => db.prepare(sql).get(...args as never[]) ?? null,
    run: async () => { db.prepare(sql).run(...args as never[]); return { success: true }; },
  });
  return { prepare: (sql: string) => stmt(sql) } as unknown as D1Database;
}
const plan = buildPlan({ ...finneyInputs, now: new Date() });
const post = (payload: unknown, token = "test-admin") => ({ method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, "CF-Connecting-IP": "import-test" }, body: JSON.stringify(payload) });
beforeEach(clearMemoryCache);
it("requires an admin credential before accepting precomputed output", async () => {
  const res = await api.request("/plan/cache", post({ engineVersion: PLAN_ENGINE_VERSION, plan }, "wrong"), { DB: database(), ADMIN_TOKEN: "test-admin" }, ctx);
  expect(res.status).toBe(401);
});
it("persists a real locally computed plan, and reads that exact response from D1 without any engine work", async () => {
  const env = { DB: database(), ADMIN_TOKEN: "test-admin" };
  const res = await api.request("/plan/cache", post({ engineVersion: PLAN_ENGINE_VERSION, plan }), env, ctx);
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ key: planCacheKey(plan.request), stored: true });
  clearMemoryCache();
  expect(await makePlan(env, plan.request)).toEqual(plan);
  expect(await makePlan(env, plan.request)).toEqual(plan); // independent memory read-back
  for (const changed of [
    { ...plan.request, priority: "risk" as const },
    { ...plan.request, water: "rain" as const, irrigated: false },
    { ...plan.request, language: "es" as const },
    { ...plan.request, goals: ["nitrogen_fixation" as const] },
    { ...plan.request, recentCrops: ["corn" as const] },
  ]) await expect(makePlan(env, changed)).rejects.toThrow("not precomputed");
});
it.each([
  { engineVersion: "old-engine", plan },
  { engineVersion: PLAN_ENGINE_VERSION, plan: { ...plan, generatedAt: "2000-01-01T00:00:00Z" } },
  { engineVersion: PLAN_ENGINE_VERSION, plan: { ...plan, request: { ...plan.request, soilTest: { ph: 6 } } } },
  { engineVersion: PLAN_ENGINE_VERSION, plan: { request: plan.request } },
])("rejects outdated, private or malformed cache imports", async (payload) => {
  const res = await api.request("/plan/cache", post(payload), { DB: database(), ADMIN_TOKEN: "test-admin" }, ctx);
  expect(res.status).toBe(400);
});
it("separates priority, water, language, history and goals in both levels of cache identity", () => {
  const base: PlanRequest = { lat: 38.1095, lon: -100.706, irrigated: true, priority: "balanced" };
  const variants: PlanRequest[] = [base, { ...base, priority: "profit" }, { ...base, priority: "soil" }, { ...base, priority: "risk" }, { ...base, irrigated: false }, { ...base, water: "limited" }, { ...base, language: "es" }, { ...base, recentCrops: ["corn"] }, { ...base, goals: ["nitrogen_fixation"] }];
  expect(new Set(variants.map((r) => planCacheKey(r))).size).toBe(variants.length);
  expect(planCacheKey(base)).toBe(planCacheKey({ ...base, language: "en", water: "full", goals: [] }));
});
