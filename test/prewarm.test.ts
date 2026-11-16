import { DatabaseSync } from "node:sqlite";
import { afterEach, expect, it, vi } from "vitest";
import app from "../src/worker/index";
import { prewarm } from "../src/worker/prewarm/routes";
import { PREWARM_CRON, startPrewarm } from "../src/worker/prewarm/run";
import { demoRequests } from "../src/shared/demoPlans";
import { planCacheKey } from "../src/worker/service";
import type { Env } from "../src/worker/env";

function database() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("CREATE TABLE cache (key TEXT PRIMARY KEY, value TEXT NOT NULL, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL)");
  const stmt = (sql: string, args: unknown[] = []) => ({
    bind: (...a: unknown[]) => stmt(sql, a),
    first: async () => sqlite.prepare(sql).get(...args as never[]) ?? null,
    run: async () => { sqlite.prepare(sql).run(...args as never[]); return { success: true }; },
  });
  return { sqlite, DB: { prepare: (sql: string) => stmt(sql) } as unknown as D1Database };
}
afterEach(() => vi.useRealTimers());
it("requires the admin secret for reading and reporting status, even without a configured secret", async () => {
  for (const env of [{}, { ADMIN_TOKEN: "test" }]) for (const method of ["GET", "POST"]) {
    const response = await prewarm.request("/status", { method }, env);
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
  }
});
it("counts only unexpired, current-engine, today's matrix keys; ignores claimed counts and yesterday's run", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-15T01:00:00Z"));
  const { sqlite, DB } = database();
  const env = { DB, ADMIN_TOKEN: "test", PLAN_COMPUTE_MODE: "cache-only" as const };
  const headers = { Authorization: "Bearer test", "Content-Type": "application/json" };
  const body = { startedAt: new Date().toISOString(), completedAt: null, histories: {}, failures: 2, errors: ["upstream unavailable"], mode: "external", warmedToday: 999 };
  const saved = await prewarm.request("/status", { method: "POST", headers, body: JSON.stringify(body) }, env);
  expect(saved.status).toBe(200);
  const rows = demoRequests();
  const insert = sqlite.prepare("INSERT INTO cache VALUES (?,?,?,?)");
  insert.run(planCacheKey(rows[0]!.request), "{}", Date.now() + 60000, Date.now());
  insert.run(planCacheKey(rows[1]!.request), "{}", Date.now() - 1, Date.now());
  insert.run("plan:old-version:irrelevant", "{}", Date.now() + 60000, Date.now());
  const status = await (await prewarm.request("/status", { headers }, env)).json();
  expect(status).toMatchObject({ warmedToday: 1, expected: 504, failures: 2, mode: "external-required", completedAt: null });
  vi.setSystemTime(new Date("2026-11-16T00:01:00Z"));
  const tomorrow = await (await prewarm.request("/status", { headers }, env)).json();
  expect(tomorrow).toMatchObject({ warmedToday: 0, lastRunTime: body.startedAt, date: "2026-11-16" });
  sqlite.close();
});
it("rejects malformed/unbounded histories and fails explicitly without D1", async () => {
  const { sqlite, DB } = database();
  const headers = { Authorization: "Bearer test", "Content-Type": "application/json" };
  const response = await prewarm.request("/status", { method: "POST", headers, body: JSON.stringify({ startedAt: new Date().toISOString(),
    completedAt: null, histories: { attacker: [["corn"]] }, failures: 0, errors: [], mode: "external" }) }, { DB, ADMIN_TOKEN: "test" });
  expect(response.status).toBe(400);
  expect((await prewarm.request("/status", { headers }, { ADMIN_TOKEN: "test" })).status).toBe(503);
  sqlite.close();
});
it("routes the prewarm cron without Field Watch or Workflow compute on cache-only", async () => {
  const create = vi.fn();
  const pending: Promise<unknown>[] = [];
  const env: Env = { PLAN_COMPUTE_MODE: "cache-only", PLAN_PREWARM: { create } as unknown as Env["PLAN_PREWARM"] };
  const ctx = { waitUntil: (p: Promise<unknown>) => pending.push(p) } as unknown as ExecutionContext;
  await app.scheduled({ cron: PREWARM_CRON, scheduledTime: Date.now() } as ScheduledController, env, ctx);
  await Promise.all(pending);
  expect(create).not.toHaveBeenCalled();
});
it("creates a bounded paid Workflow with a stable four-hour-slot id and handles duplicate deliveries only", async () => {
  const create = vi.fn().mockResolvedValue({ id: "accepted" });
  const env: Env = { PLAN_COMPUTE_MODE: "inline", PLAN_PREWARM: { create } as unknown as Env["PLAN_PREWARM"] };
  const now = Date.parse("2026-11-15T00:05:00Z");
  await startPrewarm(env, now);
  await startPrewarm(env, now + 1000);
  expect(create.mock.calls[0]).toEqual(create.mock.calls[1]);
  create.mockRejectedValueOnce(new Error("instance already exists"));
  expect(await startPrewarm(env, now)).toMatchObject({ duplicate: true });
  create.mockRejectedValueOnce(new Error("permission denied"));
  await expect(startPrewarm(env, now)).rejects.toThrow("permission denied");
});
