import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";
import { categoryResult, toWeek, usdmSource } from "../src/engine/usdm";
import { districtOutlookFor } from "../src/worker/fieldwatch/outlook";
import { checkField, runFieldWatch, rowToRun, type FieldWatchDeps, type WatchedField } from "../src/worker/fieldwatch/run";
import { DEFAULT_SETTINGS, runRecurringCheck } from "../src/worker/fieldwatch/watchCore";
import { getKansasSignal } from "../src/worker/fieldwatch/sources";
import { executeRun, planRun, MemoryRunStore } from "../src/worker/fieldwatch/agentCore";
import { SqlRunStore } from "../src/worker/fieldwatch/agent";
import { type KansasSignal, type DayMap } from "../src/worker/fieldwatch/rule";
import type { UsdmCategory } from "../src/shared/types";

// Constructed county/weather fixtures, not a live model or USDM observation.
const now = new Date("2026-11-15T12:00:00Z");
const field: WatchedField = { id: "finney-ks", name: "Finney County, KS", state: "KS", fips: "20055", lat: 38.1, lon: -100.7 };
const signal: KansasSignal = { county: "Finney", alert: "warning", basis: "dry-year water (district on watch/warning)", dataThrough: "2026-11-09", droughtProbability: 0.99, rootzonePct: 2 };
function usdm(category: UsdmCategory = "D1") {
  const shares = { none: 0, d0: 0, d1: 0, d2: 0, d3: 0, d4: 0, [category.toLowerCase()]: 100 };
  const week = toWeek({ ...shares, mapDate: "2026-11-10", validStart: "2026-11-10", validEnd: "2026-11-16", fips: field.fips }, "KS")!;
  return categoryResult({ fips: field.fips, date: "2026-11-15", today: "2026-11-15", weeks: [week], countyName: "Finney", stateCode: "KS", source: usdmSource("https://example.test/usdm-fixture", now.toISOString()) });
}
function deps(alert = "warning"): FieldWatchDeps {
  const history: DayMap = new Map();
  const recent: DayMap = new Map();
  for (let y = 1991; y <= 2026; y++) for (let day = 1; day <= 14; day++) {
    const target = y === 2026 ? recent : history;
    target.set(`${y}-11-${String(day).padStart(2, "0")}`, { prcp: y === 2026 ? 0 : 2, gwetroot: y === 2026 ? 0.1 : 0.5, tmax: 15, tmin: 2 });
  }
  return { history: async () => ({ map: history, first: 1991, last: 2025 }), recent: async () => recent, kansas: async () => ({ ...signal, alert }), usdm: async () => usdm() };
}

describe("Kansas district outlook, separate from rule v2", () => {
  it("omits normal, unknown, non-Kansas, missing and stale county context", () => {
    expect(districtOutlookFor("KS", field.fips, { ...signal, alert: "normal" }, usdm())).toBeUndefined();
    expect(districtOutlookFor("KS", field.fips, { ...signal, alert: "unknown" }, usdm())).toBeUndefined();
    expect(districtOutlookFor("IA", "19169", signal, usdm())).toBeUndefined();
    expect(districtOutlookFor("KS", field.fips, signal, null)).toBeUndefined();
    expect(districtOutlookFor("KS", field.fips, signal, { ...usdm(), status: "stale" })).toBeUndefined();
  });
  it.each(["D1", "D2", "D3", "D4"] as const)("uses continuation for current %s", (category) => {
    expect(districtOutlookFor("KS", field.fips, signal, usdm(category))?.situation).toBe("continue");
  });
  it.each(["none", "D0"] as const)("uses low-confidence onset for current %s", (category) => {
    expect(districtOutlookFor("KS", field.fips, { ...signal, alert: "watch" }, usdm(category))?.situation).toBe("onset");
  });
  it("retains the dry-year basis and source/date, but no model percentage", () => {
    const outlook = districtOutlookFor("KS", field.fips, signal, usdm())!;
    expect(outlook).toMatchObject({ alert: "warning", dataThrough: "2026-11-09", dryYearRanking: true, usdm: { validStart: "2026-11-10" } });
    expect(outlook.source.url).toContain("app_rotation_advice.json");
    expect(outlook).not.toHaveProperty("droughtProbability");
    expect(JSON.stringify(outlook)).not.toContain("%");
    expect(districtOutlookFor("KS", field.fips, { ...signal, basis: "normal-year water" }, usdm())?.dryYearRanking).toBe(false);
  });
  it("pins the cited onset metrics to the actual teammate report", () => {
    const report = readFileSync(new URL("../kansas-crop-rotation/reports/model_report.md", import.meta.url), "utf8");
    expect(report.split("## Onset only")[1]!.split("## What drives")[0]).toContain("| logistic | 0.17 | 0.47 |");
  });
  it.each(["dry", "watch", "ok"] as const)("never changes %s status/headline, even if optional USDM fails", async (status) => {
    const d = deps();
    const recent = new Map([...(await d.recent(undefined, field, now))].map(([date, values]) => [date, { ...values, prcp: status === "ok" ? 2 : 0, gwetroot: status === "dry" ? 0.1 : 0.5 }]));
    const current = { ...d, recent: async () => recent };
    const warning = await checkField({}, field, now, current);
    const normal = await checkField({}, field, now, { ...current, kansas: deps("normal").kansas });
    const failed = await checkField({}, field, now, { ...current, usdm: async () => { throw new Error("offline"); } });
    expect(warning.result.status).toBe(status);
    expect(warning.result.status).toBe(normal.result.status);
    expect(warning.result.headline).toBe(normal.result.headline);
    expect(failed.result.status).toBe(warning.result.status);
    expect(failed.districtOutlook).toBeUndefined();
    const nonKs = { ...field, state: "IA", fips: "19169" };
    const lookup = vi.fn(async () => usdm());
    expect((await checkField({}, nonKs, now, { ...deps(), usdm: lookup })).districtOutlook).toBeUndefined();
    expect(lookup).not.toHaveBeenCalled();
  });
  it("persists completed agent context through a fresh SQLite store and reuses it without fetching", async () => {
    const db = new DatabaseSync(":memory:");
    const sql = <T,>(strings: TemplateStringsArray, ...values: (string | number | boolean | null)[]): T[] => {
      const text = strings.reduce((s, part, i) => s + part + (i < values.length ? "?" : ""), "");
      const stmt = db.prepare(text);
      return /^\s*select/i.test(text) ? stmt.all(...(values as never[])) as T[] : (stmt.run(...(values as never[])), []);
    };
    const store = new SqlRunStore(sql);
    const run = planRun(field, "live", undefined, now.getTime());
    store.insert(run);
    const done = await executeRun(store, run.runId, {}, field, now, deps());
    expect(done?.districtOutlook?.situation).toBe("continue");
    const reopened = new SqlRunStore(sql);
    expect(reopened.get(run.runId)?.districtOutlook).toEqual(done?.districtOutlook);
    const fetch = vi.fn(async () => { throw new Error("must not refresh"); });
    expect(await executeRun(reopened, run.runId, {}, field, now, { ...deps(), history: fetch })).toEqual(done);
    expect(fetch).not.toHaveBeenCalled();
    db.close();
  });
  it("also persists context on weekly checks, while historical replays never fetch today's outlook", async () => {
    const store = new MemoryRunStore();
    const run = await runRecurringCheck("weekly", { version: 1 }, { ...DEFAULT_SETTINGS, enabled: true, version: 1 }, store, {}, field, now, deps());
    expect(run?.districtOutlook?.situation).toBe("continue");
    expect(store.get(run!.runId)?.districtOutlook).toEqual(run?.districtOutlook);
    const replay = planRun(field, "replay", "jun-2022", now.getTime());
    store.insert(replay);
    const lookup = vi.fn(async () => usdm());
    const done = await executeRun(store, replay.runId, {}, field, now, { ...deps(), usdm: lookup });
    expect(done?.districtOutlook).toBeUndefined();
    expect(lookup).not.toHaveBeenCalled();
  });
  it("reads the dry-year basis from the teammate file alongside the alert and data-through date", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ data_through: "2026-11-09", counties: [{ fips: "20001", county: "Allen County", alert: "watch", basis: "dry-year water (district on watch/warning)" }] }));
    try {
      expect(await getKansasSignal(undefined, "20001")).toMatchObject({ alert: "watch", basis: "dry-year water (district on watch/warning)", dataThrough: "2026-11-09" });
    } finally { fetch.mockRestore(); }
  });
  it("stores hourly outlook in the existing D1 metrics JSON, round-trippable by the API reader", async () => {
    const [run] = await runFieldWatch({}, "manual", { now, fields: [field], deps: deps() });
    const reread = rowToRun({ run_id: run!.runId, field_id: field.id, field_name: field.name, data_through: run!.dataThrough, status: run!.status, headline: run!.headline, reasons: JSON.stringify(run!.reasons), metrics: JSON.stringify(run!.metrics), sources: JSON.stringify(run!.sources), trigger: "manual", first_checked_at: now.getTime(), checked_at: now.getTime(), check_count: 1 });
    expect(reread.metrics.districtOutlook).toEqual(run!.metrics.districtOutlook);
    expect(reread.metrics.districtOutlook).toMatchObject({ situation: "continue" });
  });
});
