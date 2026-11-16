import { DatabaseSync } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";
import app from "../src/worker/index";
import { FieldAgent } from "../src/worker/fieldwatch/agent";
import { capabilityId, GLOBAL_REGISTRATION_CAP, REGISTERED_ID, validateRegistration } from "../src/worker/fieldwatch/registration";
import { fieldRequestAllowed, registrationAllowed } from "../src/worker/fieldwatch/fieldLimit";
import type { Env } from "../src/worker/env";

const ctx = { waitUntil() {}, passThroughOnException() {}, props: {} } as unknown as ExecutionContext;
// Constructed geometry for validation/isolation tests, not represented as a real CSB record.
const boundary = { id: "csb:test-only", source: "usda-csb", centroid: { lat: 38.105, lon: -100.705 }, polygon: [[[-100.71,38.10],[-100.70,38.10],[-100.70,38.11],[-100.71,38.11],[-100.71,38.10]]] };
function harness() {
  const agents = new Map<string, { agent: FieldAgent; db: DatabaseSync; jobs: Map<string, { id: string; callback: string; payload: unknown }> }>();
  const env: Env = { FIELDS_ENABLED: "on", SCOUT_LIMITER: { limit: async () => ({ success: true }) } as RateLimit };
  const ns = {
    idFromName: (name: string) => name,
    get: (name: string) => {
      if (!agents.has(name)) {
        const db = new DatabaseSync(":memory:");
        const jobs = new Map<string, { id: string; callback: string; payload: unknown }>();
        const agent = new FieldAgent({} as ConstructorParameters<typeof FieldAgent>[0], env);
        agent.sql = <T,>(strings: TemplateStringsArray, ...values: (string | number | boolean | null)[]): T[] => {
          const text = strings.reduce((acc, s, i) => acc + s + (i < values.length ? "?" : ""), "");
          const stmt = db.prepare(text);
          return /^\s*select/i.test(text) ? stmt.all(...values as never[]) as T[] : (stmt.run(...values as never[]), []);
        };
        Object.assign(agent, {
          schedule: async (_at: unknown, callback: string, payload: unknown) => { const id = crypto.randomUUID(); jobs.set(id, { id, callback, payload }); return { id }; },
          listSchedules: async () => [...jobs.values()],
          cancelSchedule: async (id: string) => { jobs.delete(id); },
        });
        agents.set(name, { agent, db, jobs });
      }
      return agents.get(name)!.agent;
    },
  };
  env.FIELD_AGENT = ns as unknown as DurableObjectNamespace;
  let ip = 0;
  const call = (url: string, method = "GET", body?: unknown) => app.request(url, { method, headers: { "content-type": "application/json", "CF-Connecting-IP": `multiwatch-test-${++ip}` }, body: body === undefined ? undefined : JSON.stringify(body) }, env, ctx);
  const register = async (field = boundary, crop = "corn") => {
    const response = await call("/api/fields/register", "POST", { field, watchedCrop: crop });
    expect(response.status).toBe(201);
    return (await response.json() as { agentFieldId: string }).agentFieldId;
  };
  return { agents, env, call, register };
}
describe("capability registrations", () => {
  it("generates url-safe 192-bit distinct ids", () => {
    const ids = Array.from({ length: 1000 }, capabilityId);
    expect(ids.every(id => REGISTERED_ID.test(id))).toBe(true);
    expect(new Set(ids).size).toBe(1000);
  });
  it("validates bounded closed CONUS polygons and pins hash, centroid and crop", async () => {
    const config = await validateRegistration({ field: boundary, watchedCrop: "corn" });
    expect(config).toMatchObject({ fieldId: boundary.id, centroid: boundary.centroid, watchedCrop: "corn" });
    expect(config.polygonHash).toMatch(/^[a-f0-9]{64}$/);
    for (const field of [
      { ...boundary, id: "user:fake" }, { ...boundary, source: "owner" },
      { ...boundary, centroid: { lat: 0, lon: 0 } },
      { ...boundary, polygon: [[[0, 0], [0, 1], [1, 1], [0, 0]]] },
      { ...boundary, polygon: [boundary.polygon[0]!.slice(0, -1)] },
      { ...boundary, polygon: [Array.from({ length: 2001 }, () => [-100.7, 38.1])] },
      { ...boundary, polygon: [[[-110,30],[-109.1,30],[-109.1,30.9],[-110,30.9],[-110,30]]] },
    ]) await expect(validateRegistration({ field, watchedCrop: "corn" })).rejects.toThrow();
    await expect(validateRegistration({ field: boundary, watchedCrop: "fake" })).rejects.toThrow();
    await expect(validateRegistration({ field: boundary, watchedCrop: "corn", calendar: {} })).rejects.toThrow(/calendar/);
  });
  it("registers two fields with independent histories, crop and watch schedules", async () => {
    const h = harness();
    const a = await h.register();
    const b = await h.register({ ...boundary, id: "csb:second-test-only" }, "soybean");
    expect(a).not.toBe(b);
    for (const id of [a, b]) {
      const w = await (await h.call(`/api/fieldwatch/agent/${id}/watch`)).json() as { settings: { enabled: boolean; crop: string } };
      expect(w.settings.enabled).toBe(false);
      expect(w.settings.crop).toBe(id === a ? "corn" : "soybean");
      expect((await h.call(`/api/fieldwatch/agent/${id}/check`, "POST", { mode: "live" })).status).toBe(202);
      expect((await h.call(`/api/fieldwatch/agent/${id}/check`, "POST", { mode: "live" })).status).toBe(200);
    }
    expect(h.agents.get(a)!.jobs.size).toBe(1);
    expect(h.agents.get(b)!.jobs.size).toBe(1);
    const ar = await h.agents.get(a)!.agent.listRuns();
    const br = await h.agents.get(b)!.agent.listRuns();
    expect(ar).toHaveLength(1); expect(br).toHaveLength(1);
    expect(ar[0]!.fieldId).toBe(a); expect(br[0]!.fieldId).toBe(b);
    // Persist a completed record independently using the actual SQLite table.
    const done = { ...ar[0]!, status: "ok", completedAt: Date.now() };
    h.agents.get(a)!.db.prepare("UPDATE field_runs SET data=?, status='ok'").run(JSON.stringify(done));
    expect((await h.agents.get(a)!.agent.listRuns())[0]!.status).toBe("ok");
    expect((await h.agents.get(b)!.agent.listRuns())[0]!.status).toBe("pending");
    await h.call(`/api/fieldwatch/agent/${a}/watch`, "PUT", { enabled: true });
    expect(h.agents.get(a)!.jobs.size).toBe(3);
    expect(h.agents.get(b)!.jobs.size).toBe(1);
    // Rehydrate on the same SQL state and prove pinned configuration survives a fresh object.
    const fresh = new FieldAgent({} as ConstructorParameters<typeof FieldAgent>[0], h.env); fresh.sql = h.agents.get(a)!.agent.sql;
    expect(await fresh.isRegistered(a)).toBe(true);
    expect(await fresh.isRegistered(b)).toBe(false);
  });
  it("rejects forged/unknown ids before instantiating their storage; double-confirms registered ids", async () => {
    const h = harness(); const forged = capabilityId();
    for (const suffix of ["runs", "watch", "check"]) {
      const response = await h.call(`/api/fieldwatch/agent/${forged}/${suffix}`, suffix === "check" ? "POST" : "GET", suffix === "check" ? { mode: "live" } : undefined);
      expect(response.status).toBe(404);
    }
    expect(h.agents.has(forged)).toBe(false);
    expect((await h.call("/api/fieldwatch/agent/u_fake/runs")).status).toBe(404);
    expect(h.agents.has("u_fake")).toBe(false);
    const id = await h.register();
    await h.agents.get(id)!.agent.deleteField(id); // registry remains but agent must also confirm
    expect((await h.call(`/api/fieldwatch/agent/${id}/runs`)).status).toBe(404);
  });
  it("deletes schedules and application storage, rejects reads and stale callbacks", async () => {
    const h = harness(); const id = await h.register();
    await h.call(`/api/fieldwatch/agent/${id}/check`, "POST", { mode: "live" });
    await h.call(`/api/fieldwatch/agent/${id}/watch`, "PUT", { enabled: true });
    const owned = h.agents.get(id)!; const old = [...owned.jobs.values()];
    expect(old).toHaveLength(3);
    expect((await h.call(`/api/fields/${id}`, "DELETE")).status).toBe(200);
    expect(owned.jobs.size).toBe(0);
    expect(owned.db.prepare("SELECT name FROM sqlite_master WHERE name IN ('registered_field','field_runs','watch_settings')").all()).toHaveLength(0);
    expect((await h.call(`/api/fieldwatch/agent/${id}/runs`)).status).toBe(404);
    for (const job of old) {
      if (job.callback === "runScheduledCheck") await owned.agent.runScheduledCheck(job.payload as { fieldId: string; runId: string });
      if (job.callback === "weeklyCheck") await owned.agent.weeklyCheck(job.payload as { fieldId: string; version: number });
      if (job.callback === "windowCheck") await owned.agent.windowCheck(job.payload as Parameters<FieldAgent["windowCheck"]>[0]);
    }
    expect(owned.jobs.size).toBe(0);
    expect(owned.db.prepare("SELECT name FROM sqlite_master WHERE name='field_runs'").all()).toHaveLength(0);
  });
  it("enforces a durable lifetime global cap even after deletion", async () => {
    const h = harness(); await h.register();
    const registry = h.agents.get("__registry")!;
    for (let i = 1; i < GLOBAL_REGISTRATION_CAP; i++) expect(await registry.agent.reserveRegistration(capabilityId())).toBe(true);
    const id = [...h.agents.keys()].find(k => k.startsWith("u_"))!;
    await registry.agent.forgetRegistration(id);
    expect(await registry.agent.reserveRegistration(capabilityId())).toBe(false);
    expect((await h.call("/api/fields/register", "POST", { field: boundary, watchedCrop: "corn" })).status).toBe(429);
  });
  it("limits registration/actions by binding and labels fallback behavior explicitly", async () => {
    expect(Array.from({ length: 6 }, () => registrationAllowed("bucket-test", 1000))).toEqual([true, true, true, true, true, false]);
    expect(registrationAllowed("bucket-test", 13000)).toBe(true);
    const limit = vi.fn(async () => ({ success: false }));
    expect(await fieldRequestAllowed({ SCOUT_LIMITER: { limit } as RateLimit }, "visitor")).toBe(false);
    expect(limit).toHaveBeenCalledWith({ key: "fields:visitor" });
    const h = harness(); h.env.SCOUT_LIMITER = { limit } as RateLimit;
    expect((await h.call("/api/fields/register", "POST", { field: boundary, watchedCrop: "corn" })).status).toBe(429);
    expect(h.agents.size).toBe(0);
  });
  it("flag-off blocks new fields without touching the namespace", async () => {
    const h = harness(); h.env.FIELDS_ENABLED = undefined;
    for (const [path, method, body] of [
      ["/api/fields/register", "POST", { field: boundary, watchedCrop: "corn" }],
      [`/api/fields/${capabilityId()}`, "DELETE", undefined],
      [`/api/fieldwatch/agent/${capabilityId()}/runs`, "GET", undefined],
    ] as const) { const response = await h.call(path, method, body); expect(response.status).toBe(404); expect(await response.json()).toEqual({ error: "fields disabled" }); }
    expect(h.agents.size).toBe(0);
  });
  it("demo options/runs/watch/check and plan validation are byte-identical with flag off", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1794770000000);
    try {
      const h = harness();
      const run = { runId: "demo-run", dueAt: 1794770045000 };
      h.env.FIELD_AGENT = { idFromName: (n: string) => n, get: () => ({ listRuns: async () => [run], getWatch: async () => ({ settings: { enabled: false }, runs: [] }), updateWatch: async () => ({}), requestCheck: async () => ({ run, created: true }) }) } as unknown as DurableObjectNamespace;
      for (const [path, method, body] of [
        ["/api/fieldwatch/agent/options", "GET", undefined],
        ["/api/fieldwatch/agent/finney-ks/runs", "GET", undefined],
        ["/api/fieldwatch/agent/finney-ks/watch", "GET", undefined],
        ["/api/fieldwatch/agent/finney-ks/watch", "PUT", { enabled: false }],
        ["/api/fieldwatch/agent/finney-ks/check", "POST", { mode: "live" }],
        ["/api/plan", "POST", { lat: 0, lon: 0 }],
      ] as const) {
        h.env.FIELDS_ENABLED = undefined; const a = await h.call(path, method, body);
        h.env.FIELDS_ENABLED = "off"; const b = await h.call(path, method, body);
        h.env.FIELDS_ENABLED = "on"; const c = await h.call(path, method, body);
        expect(a.status).toBe(b.status); expect(a.status).toBe(c.status);
        const text = await a.text(); expect(await b.text()).toBe(text); expect(await c.text()).toBe(text);
      }
    } finally { vi.restoreAllMocks(); }
  });
});
