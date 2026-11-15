import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";
import app from "../src/worker/index";
import { parsePower, type PowerResponse } from "../src/engine/climate";
import { CHECK_DELAY_SECONDS, CheckRequestError, executeRun, MemoryRunStore, planRun, requestCheck, type AgentRun, type RunStore } from "../src/worker/fieldwatch/agentCore";
import { SqlRunStore } from "../src/worker/fieldwatch/agent";
import { historyToDayMap } from "../src/worker/fieldwatch/sources";
import { isoDate, type DayMap } from "../src/worker/fieldwatch/rule";
import type { FieldWatchDeps, WatchedField } from "../src/worker/fieldwatch/run";

const ctx = { waitUntil: () => {}, passThroughOnException: () => {}, props: {} } as unknown as ExecutionContext;
const finney: WatchedField = { id: "finney-ks", name: "Finney County, KS", lat: 38.1095, lon: -100.706, fips: "20055", state: "KS" };
const NOW = Date.parse("2026-11-15T03:00:00Z");

// Real NASA POWER daily data for the Finney County, KS grid cell, 1991–2025 (rain, temperature, root-zone wetness).
const finneyHistory = historyToDayMap(parsePower(JSON.parse(readFileSync(new URL("./fixtures/power-finney-county-ks.json", import.meta.url), "utf8")) as PowerResponse));

function deps(history = finneyHistory, extra: Partial<FieldWatchDeps> = {}): FieldWatchDeps & { calls: { history: number } } {
  const calls = { history: 0 };
  return {
    calls,
    recent: async () => new Map(),
    history: async () => {
      calls.history++;
      return history;
    },
    kansas: async () => ({ county: "Finney County", alert: "warning", droughtProbability: 0.9, rootzonePct: 3, dataThrough: "2026-11-09" }),
    ...extra,
  };
}

describe("Field Watch agent: scheduling", () => {
  it("validates the request: only live checks and configured replay windows", () => {
    expect(() => planRun(finney, "forecast", undefined, NOW)).toThrow(CheckRequestError);
    expect(() => planRun(finney, "replay", "jun-1999", NOW)).toThrow(/replay must be one of/);
    const run = planRun(finney, "replay", "jun-2022", NOW);
    expect(run).toMatchObject({ status: "pending", fieldId: "finney-ks", mode: "replay", replayId: "jun-2022", ruleVersion: 2 });
    expect(run.dueAt - run.scheduledAt).toBe(CHECK_DELAY_SECONDS * 1000);
    expect(run.runId).toBe("finney-ks:jun-2022:2026-11-15T03:00:00.000Z");
  });

  it("allows at most one pending check per field and schedules it once", async () => {
    const store = new MemoryRunStore();
    const schedule = vi.fn(async () => {});
    const a = await requestCheck(store, finney, { mode: "live" }, NOW, schedule);
    const b = await requestCheck(store, finney, { mode: "replay", replayId: "jun-2022" }, NOW + 5000, schedule);
    expect(a.created).toBe(true);
    expect(b.created).toBe(false);
    expect(b.run.runId).toBe(a.run.runId);
    expect(schedule).toHaveBeenCalledTimes(1);
    expect(schedule).toHaveBeenCalledWith(a.run.runId, 45);
    expect(store.list(10)).toHaveLength(1);
  });
});

describe("Field Watch agent: running a scheduled check", () => {
  it("replays late June 2022 on real NASA data, comparing only with earlier years, labelled Historical replay", async () => {
    const store = new MemoryRunStore();
    const { run } = await requestCheck(store, finney, { mode: "replay", replayId: "jun-2022" }, NOW, async () => {});
    const done = (await executeRun(store, run.runId, {}, finney, new Date(NOW + 45_000), deps()))!;
    expect(done.status).not.toBe("pending");
    expect(done.status).not.toBe("error");
    expect(done.headline).toMatch(/^Historical replay: /);
    expect(done.snapshot).toMatchObject({ label: "Historical replay", comparisonYears: "1991–2021", windowStart: "2022-06-14", windowEnd: "2022-06-27" });
    expect(done.snapshot!.inputSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(done.metrics!.normalYears).toBe(31);
    // The Kansas outlook describes today, not 2022, so a replay never uses it.
    expect(done.reasons.some((r) => r.id === "kansas")).toBe(false);
    expect(done.completedAt).toBe(NOW + 45_000);
    // Expected result, recorded from the real data (rule v2): pinned so a rule or data change is noticed.
    expect({ status: done.status, rain: done.metrics!.rainPercentile, root: done.metrics!.rootzonePercentile, rainMm: done.metrics!.rain14Mm }).toEqual({ status: "dry", rain: 3, root: 0, rainMm: 9.5 });
  });

  it("runs a run id once: a second call returns the saved result without evaluating again", async () => {
    const store = new MemoryRunStore();
    const d = deps();
    const { run } = await requestCheck(store, finney, { mode: "replay", replayId: "jun-2022" }, NOW, async () => {});
    const first = await executeRun(store, run.runId, {}, finney, new Date(NOW + 45_000), d);
    const second = await executeRun(store, run.runId, {}, finney, new Date(NOW + 90_000), d);
    expect(d.calls.history).toBe(1);
    expect(second).toEqual(first);
    expect(store.list(10)).toHaveLength(1);
  });

  it("gives Insufficient data when the replay window has a missing rain day, and never slides or fills it", async () => {
    const holed: DayMap = new Map([...finneyHistory.map].map(([k, v]) => [k, { ...v }]));
    holed.get("2022-06-20")!.prcp = null;
    const store = new MemoryRunStore();
    const { run } = await requestCheck(store, finney, { mode: "replay", replayId: "jun-2022" }, NOW, async () => {});
    const done = (await executeRun(store, run.runId, {}, finney, new Date(NOW + 45_000), deps({ ...finneyHistory, map: holed })))!;
    expect(done.status).toBe("insufficient");
    expect(done.reasons[0]!.text).toMatch(/2022-06-20/);
    expect(done.snapshot).toMatchObject({ windowEnd: "2022-06-27", inputSha256: null });
  });

  it("turns a failed data service into a visible error result", async () => {
    const store = new MemoryRunStore();
    const { run } = await requestCheck(store, finney, { mode: "live" }, NOW, async () => {});
    const broken = deps(finneyHistory, { recent: async () => { throw new Error("NASA POWER: HTTP 503"); } });
    const done = (await executeRun(store, run.runId, {}, finney, new Date(NOW + 45_000), broken))!;
    expect(done.status).toBe("error");
    expect(done.reasons[0]!.text).toMatch(/503/);
    expect(store.pending()).toBeNull();
  });

  it("labels a live check Current conditions and keeps the Kansas outlook as context", async () => {
    const recent: DayMap = new Map();
    const today = new Date(NOW);
    for (let i = 60; i >= 1; i--) recent.set(isoDate(new Date(NOW - i * 86_400_000)), { prcp: 1, tmax: 12, tmin: 0, gwetroot: 0.5 });
    const store = new MemoryRunStore();
    const { run } = await requestCheck(store, finney, { mode: "live" }, NOW, async () => {});
    const done = (await executeRun(store, run.runId, {}, finney, today, deps(finneyHistory, { recent: async () => recent })))!;
    expect(done.snapshot!.label).toBe("Current conditions");
    expect(done.snapshot!.comparisonYears).toBe("1991–2025");
    expect(done.reasons.some((r) => r.id === "kansas" && /context only/.test(r.text))).toBe(true);
  });
});

describe("Field Watch agent: SQLite storage", () => {
  it("stores, finds the pending run and updates it", () => {
    const db = new DatabaseSync(":memory:");
    const sql = <T,>(strings: TemplateStringsArray, ...values: (string | number | boolean | null)[]): T[] => {
      const text = strings.reduce((acc, s, i) => acc + s + (i < values.length ? "?" : ""), "");
      const stmt = db.prepare(text);
      return /^\s*select/i.test(text) ? (stmt.all(...(values as never[])) as T[]) : (stmt.run(...(values as never[])), []);
    };
    const store: RunStore = new SqlRunStore(sql);
    const run = planRun(finney, "live", undefined, NOW);
    store.insert(run);
    expect(store.pending()!.runId).toBe(run.runId);
    store.update({ ...run, status: "ok", completedAt: NOW + 1 } as AgentRun);
    expect(store.pending()).toBeNull();
    expect(store.get(run.runId)!.status).toBe("ok");
    expect(store.list(5)).toHaveLength(1);
  });
});

describe("Field Watch agent: routes", () => {
  /** A fake FIELD_AGENT namespace: one in-memory agent per field name, using the real core logic. */
  function fakeAgents() {
    const stores = new Map<string, MemoryRunStore>();
    const scheduled: string[] = [];
    const ns = {
      idFromName: (name: string) => name,
      get: (name: string) => {
        if (!stores.has(name)) stores.set(name, new MemoryRunStore());
        const store = stores.get(name)!;
        return {
          requestCheck: (req: { fieldId: string; mode: unknown; replayId?: unknown }) =>
            requestCheck(store, finney, req, Date.now(), async (runId) => {
              scheduled.push(runId);
            }),
          listRuns: async (limit: number) => store.list(limit),
        };
      },
    };
    return { ns: ns as unknown as DurableObjectNamespace, scheduled };
  }

  it("schedules a check, returns the same pending check on repeat, and lists it", async () => {
    const { ns, scheduled } = fakeAgents();
    const env = { FIELD_AGENT: ns };
    const post = () => app.request("/api/fieldwatch/agent/finney-ks/check", { method: "POST", body: JSON.stringify({ mode: "replay", replayId: "jun-2022" }) }, env, ctx);
    const first = await post();
    expect(first.status).toBe(202);
    const second = await post();
    expect(second.status).toBe(200);
    expect(((await second.json()) as { created: boolean }).created).toBe(false);
    expect(scheduled).toHaveLength(1);
    const list = await app.request("/api/fieldwatch/agent/finney-ks/runs", {}, env, ctx);
    const body = (await list.json()) as { runs: AgentRun[] };
    expect(body.runs).toHaveLength(1);
    expect(body.runs[0]).toMatchObject({ status: "pending", mode: "replay" });
  });

  it("rejects unknown fields, modes and replay windows, and explains a missing binding", async () => {
    const { ns } = fakeAgents();
    const env = { FIELD_AGENT: ns };
    expect((await app.request("/api/fieldwatch/agent/mars/check", { method: "POST", body: '{"mode":"live"}' }, env, ctx)).status).toBe(400);
    expect((await app.request("/api/fieldwatch/agent/finney-ks/check", { method: "POST", body: '{"mode":"forecast"}' }, env, ctx)).status).toBe(400);
    expect((await app.request("/api/fieldwatch/agent/finney-ks/check", { method: "POST", body: '{"mode":"replay","replayId":"x"}' }, env, ctx)).status).toBe(400);
    expect((await app.request("/api/fieldwatch/agent/finney-ks/check", { method: "POST", body: "not json" }, env, ctx)).status).toBe(400);
    expect((await app.request("/api/fieldwatch/agent/finney-ks/check", { method: "POST", body: '{"mode":"live"}' }, {}, ctx)).status).toBe(503);
    const opts = (await (await app.request("/api/fieldwatch/agent/options", {}, {}, ctx)).json()) as { delaySeconds: number; available: boolean; replays: { id: string }[] };
    expect(opts).toMatchObject({ delaySeconds: 45, available: false });
    expect(opts.replays.map((r) => r.id)).toEqual(["jun-2022"]);
  });
});
