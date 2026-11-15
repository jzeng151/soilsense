import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import app from "../src/worker/index";
import { evaluateField, isoDate, percentileRank, type DayMap } from "../src/worker/fieldwatch/rule";
import { runFieldWatch, type FieldWatchDeps, type WatchedField } from "../src/worker/fieldwatch/run";

const ctx = { waitUntil: () => {}, passThroughOnException: () => {}, props: {} } as unknown as ExecutionContext;

function fakeD1(): D1Database {
  const db = new DatabaseSync(":memory:");
  for (const f of readdirSync("migrations").sort()) db.exec(readFileSync(`migrations/${f}`, "utf8"));
  const stmt = (sql: string, args: unknown[] = []) => ({
    bind: (...a: unknown[]) => stmt(sql, a),
    first: async () => (db.prepare(sql).get(...(args as never[])) as unknown) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...(args as never[])) }),
    run: async () => {
      db.prepare(sql).run(...(args as never[]));
      return { success: true };
    },
  });
  return { prepare: (sql: string) => stmt(sql), batch: async () => [] } as unknown as D1Database;
}

const TODAY = new Date("2026-11-14T12:00:00Z");

/** Synthetic weather: every past year gets `normalRain(y)` mm/day; recent days get `recentRain` mm/day. */
function history(normalRain: (y: number) => number, root: (y: number) => number = () => 0.5): { map: DayMap; first: number; last: number } {
  const map: DayMap = new Map();
  for (let y = 1991; y <= 2025; y++) {
    for (let d = new Date(Date.UTC(y, 0, 1)); d.getUTCFullYear() === y; d.setUTCDate(d.getUTCDate() + 1)) {
      map.set(isoDate(d), { prcp: normalRain(y), tmax: 15, tmin: 2, gwetroot: root(y) });
    }
  }
  return { map, first: 1991, last: 2025 };
}
function recent(rain: number, opts: { root?: number; lagDays?: number; holeAt?: string } = {}): DayMap {
  const map: DayMap = new Map();
  for (let i = 60; i >= 0; i--) {
    const iso = isoDate(new Date(TODAY.getTime() - i * 86_400_000));
    const filled = i >= (opts.lagDays ?? 4);
    map.set(iso, filled ? { prcp: iso === opts.holeAt ? null : rain, tmax: 15, tmin: 2, gwetroot: opts.root ?? 0.5 } : { prcp: null, tmax: null, tmin: null, gwetroot: null });
  }
  return map;
}
const base = { fieldName: "Test field", lat: 38.1, today: isoDate(TODAY) };

describe("Field Watch rule", () => {
  it("percentile rank counts ties as half", () => {
    expect(percentileRank([1, 2, 3, 4], 2.5)).toBe(50);
    expect(percentileRank([1, 1, 1, 1], 1)).toBe(50);
    expect(percentileRank([1, 2, 3, 4], 0)).toBe(0);
  });

  it("flags a dry spell when rain and root-zone wetness are both near record lows", () => {
    const h = history((y) => 1 + (y % 10) / 10, (y) => 0.4 + (y % 10) / 50);
    const r = evaluateField({ ...base, recent: recent(0, { root: 0.3 }), history: h.map, historyYears: h });
    expect(r.status).toBe("dry");
    expect(r.headline).toMatch(/^Dry spell starting/);
    expect(r.metrics.rainPercentile).toBe(0);
    expect(r.metrics.rootzonePercentile).toBe(0);
    expect(r.metrics.dataThrough).toBe("2026-11-10"); // NASA lags 4 days in this fixture
    expect(r.metrics.normalYears).toBe(35);
    expect(r.metrics.balance14Mm).toBeLessThan(0);
  });

  it("says OK when rain is above normal", () => {
    const h = history((y) => 1 + (y % 10) / 10);
    const r = evaluateField({ ...base, recent: recent(3, { root: 0.8 }), history: h.map, historyYears: h });
    expect(r.status).toBe("ok");
    expect(r.metrics.rainPercentile).toBe(100);
  });

  it("raises a watch from the Kansas outlook even when local rain is fine", () => {
    const h = history((y) => 1 + (y % 10) / 10);
    const r = evaluateField({
      ...base,
      recent: recent(3, { root: 0.8 }),
      history: h.map,
      historyYears: h,
      kansas: { county: "Finney County", alert: "watch", droughtProbability: 0.3, rootzonePct: 40, dataThrough: "2026-11-09" },
    });
    expect(r.status).toBe("watch");
    expect(r.reasons.some((x) => x.id === "kansas" && /Finney County/.test(x.text))).toBe(true);
  });

  it("never treats missing rain as zero: a gap moves the window back to complete days", () => {
    const h = history(() => 1);
    // A missing value 5 days ago: windows ending on/after that day are incomplete, so the rule uses an earlier window.
    const hole = isoDate(new Date(TODAY.getTime() - 5 * 86_400_000));
    const r = evaluateField({ ...base, recent: recent(1, { holeAt: hole }), history: h.map, historyYears: h });
    expect(r.metrics.dataThrough! < hole).toBe(true);
    expect(r.metrics.rain14Mm).toBe(14);
  });

  it("reports insufficient data when no complete 14-day window exists", () => {
    const h = history(() => 1);
    const r = evaluateField({ ...base, recent: recent(1, { lagDays: 40 }), history: h.map, historyYears: h });
    expect(r.status).toBe("insufficient");
  });
});

describe("Field Watch runs and routes", () => {
  const field: WatchedField = { id: "finney-ks", name: "Finney County, KS", lat: 38.1095, lon: -100.706, fips: "20055", state: "KS" };
  const deps = (rain: number): FieldWatchDeps => ({
    recent: async () => recent(rain, { root: 0.3 }),
    history: async () => history((y) => 1 + (y % 10) / 10, (y) => 0.4 + (y % 10) / 50),
    kansas: async () => ({ county: "Finney County", alert: "normal", droughtProbability: 0.07, rootzonePct: 89, dataThrough: "2026-11-09" }),
  });

  it("saves one row per field per data day and counts re-checks instead of duplicating", async () => {
    const env = { DB: fakeD1() };
    await runFieldWatch(env, "cron", { now: TODAY, deps: deps(0), fields: [field] });
    const second = await runFieldWatch(env, "cron", { now: new Date(TODAY.getTime() + 3600_000), deps: deps(0), fields: [field] });
    expect(second[0]!.runId).toBe("finney-ks:2026-11-10");
    expect(second[0]!.checkCount).toBe(2);
    expect(second[0]!.status).toBe("dry");
    const rows = await env.DB.prepare("SELECT COUNT(*) AS n FROM field_watch_runs").first<{ n: number }>();
    expect(rows!.n).toBe(1);
  });

  it("records a failed data service as an error result, not a crash", async () => {
    const env = { DB: fakeD1() };
    const broken: FieldWatchDeps = { ...deps(0), recent: async () => { throw new Error("NASA POWER: HTTP 503"); } };
    const [run] = await runFieldWatch(env, "manual", { now: TODAY, deps: broken, fields: [field] });
    expect(run!.status).toBe("error");
    expect(run!.reasons[0]!.text).toMatch(/503/);
  });

  it("serves the latest result per field with the rule and schedule", async () => {
    const env = { DB: fakeD1() };
    await runFieldWatch(env, "cron", { now: TODAY, deps: deps(0), fields: [field] });
    const res = await app.request("/api/fieldwatch/latest", {}, env, ctx);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { runs: { fieldId: string; status: string; sources: { name: string }[] }[]; lastCronAt: number; schedule: { cron: string }; rule: string };
    expect(body.runs).toHaveLength(1);
    expect(body.runs[0]).toMatchObject({ fieldId: "finney-ks", status: "dry" });
    expect(body.runs[0]!.sources.some((s) => /Kansas/.test(s.name))).toBe(true);
    expect(body.lastCronAt).toBe(TODAY.getTime());
    expect(body.schedule.cron).toBe("17 * * * *");
    expect(body.rule).toMatch(/demonstration settings/);
  });

  it("applies a cooldown to Run check now", async () => {
    const env = { DB: fakeD1() };
    await runFieldWatch(env, "cron", { now: new Date(), deps: deps(0), fields: [field] });
    const res = await app.request("/api/fieldwatch/run", { method: "POST" }, env, ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ cooldown: true });
  });

  it("explains a missing table instead of failing", async () => {
    const res = await app.request("/api/fieldwatch/latest", {}, {}, ctx);
    expect(res.status).toBe(503);
  });
});
