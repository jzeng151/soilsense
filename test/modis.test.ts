import { readFileSync } from "node:fs";
import { afterEach, expect, it, vi } from "vitest";
import { getModisNdvi, parseModisCsv, parseModisSubset } from "../src/worker/data/modis";
import { clearMemoryCache } from "../src/worker/lib/cache";
import app from "../src/worker/index";

it("reconciles the real 061 CSV source pixel independently of protocol fixtures", () => {
  const source = JSON.parse(readFileSync(new URL("./fixtures/modis/ornl-live-061.json", import.meta.url), "utf8"));
  const p = parseModisSubset(parseModisCsv(source.csv, 38.1095, -100.706), ["A2025193"])[0]!;
  expect(source.product).toBe("MOD13Q1"); expect(source.version).toBe("061");
  expect(p.ndvi).toBe(3406 * 0.0001); expect(p.reliability).toBe(0); expect(p.quality).toBe(2116);
  expect(p.observationDate).toBe("2025-07-23"); expect(p.tile).toBe("h10v05");
});
// Synthetic protocol cases, NOT downloaded satellite observations.
it("does not mislabel the official documented Collection 006 example as 061", () => {
  const source = JSON.parse(readFileSync(new URL("./fixtures/modis/ornl-documented-006.json", import.meta.url), "utf8"));
  expect(source.subset.find((r: { band: string }) => r.band.endsWith("NDVI")).data[40]).toBe(4429);
  expect(parseModisSubset(source, ["A2018049"])[0]!.ndvi).toBeNull();
});
const row = (band: string, data: number[], date = "A2024185", version = "061") => ({ band: `250m_16_days_${band}`, data, modis_date: date, version, proc_date: "2024200120000", title: "h10v04" });
const subset = (reliability = 0, ndvi = 4500) => ({ nrows: 1, ncols: 1, cellsize: "231.656358264", subset: [row("NDVI", [ndvi]), row("pixel_reliability", [reliability]), row("VI_Quality", [2048]), row("composite_day_of_the_year", [190])] });
it("reads explicit collection from CSV granule names, not absent JSON version fields", () => {
  const csv = ["NDVI,3406", "pixel_reliability,0", "VI_Quality,2116", "composite_day_of_the_year,204"]
    .map(s => `MOD13Q1.A2025193.h10v05.061.2025212122359.250m_16_days_${s.split(",")[0]},MOD13Q1,A2025193,Lat38.1095Lon-100.706Samp1Line1,2025212122359,${s.split(",")[1]}`).join("\n");
  expect(parseModisSubset(parseModisCsv(csv, 38.1095, -100.706), ["A2025193"])[0]).toMatchObject({ ndvi: 0.3406, version: "061", tile: "h10v05", observationDate: "2025-07-23" });
  expect(() => parseModisCsv(csv.replaceAll(".061.", ".006."), 38.1095, -100.706)).toThrow();
  expect(() => parseModisCsv(csv.replaceAll("Samp1Line1", "Samp3Line3"), 38.1095, -100.706)).toThrow();
  expect(() => parseModisCsv(csv, 42, -93)).toThrow();
});
afterEach(() => { vi.unstubAllGlobals(); clearMemoryCache(); });
it("scales NDVI once, joins QA by composite date and retains actual acquisition date", () => {
  const p = parseModisSubset(subset(), ["A2024185"])[0]!;
  expect(p).toMatchObject({ ndvi: 0.45, compositeStart: "2024-07-03", compositeEnd: "2024-07-18", observationDate: "2024-07-08", reliability: 0, quality: 2048, version: "061" });
});
it.each([1, 2, 3, -1])("does not interpret rejected reliability %s as zero NDVI", (q) => {
  expect(parseModisSubset(subset(q), ["A2024185"])[0]!.ndvi).toBeNull();
});
it("rejects fill, missing QA, wrong collections, water and shadow; preserves real zero", () => {
  expect(parseModisSubset(subset(0, -3000), ["A2024185"])[0]!.ndvi).toBeNull();
  expect(parseModisSubset(subset(0, 0), ["A2024185"])[0]!.ndvi).toBe(0);
  const s = subset(); s.subset = s.subset.filter(r => !r.band.endsWith("pixel_reliability"));
  expect(parseModisSubset(s, ["A2024185"])[0]!.ndvi).toBeNull();
  for (const quality of [0, 2048 | 32768, 2048 | 16384, 2048 | 1024, 2048 | 256]) {
    const s = subset(); s.subset[2]!.data = [quality];
    expect(parseModisSubset(s, ["A2024185"])[0]!.ndvi).toBeNull();
  }
  const old = subset(); old.subset.forEach(r => r.version = "006");
  expect(parseModisSubset(old, ["A2024185"])[0]!.ndvi).toBeNull();
  expect(parseModisSubset(subset(), ["A2024185", "A2024201"])[1]!.ndvi).toBeNull();
});
it("caches versioned snapshots in D1 and memory; retries failed upstream then reports unavailable", async () => {
  const run = vi.fn(async () => ({})); const bind = vi.fn(() => ({ first: async () => null, run }));
  const db = { prepare: vi.fn(() => ({ bind })) } as unknown as D1Database;
  const scheduled = subset(); scheduled.subset.forEach(r => r.modis_date = "A2024193"); scheduled.subset[3]!.data = [198];
  const csv = scheduled.subset.map(r => `MOD13Q1.${r.modis_date}.h10v04.061.${r.proc_date}.${r.band},MOD13Q1,${r.modis_date},Lat42.03Lon-93.62Samp1Line1,${r.proc_date},${r.data[0]}`).join("\n");
  const fetcher = vi.fn(async (u: RequestInfo | URL) => new Response(String(u).includes("/dates?") ? JSON.stringify({ dates: [{ modis_date: "A2024193", calendar_date: "2024-07-11" }] }) : csv));
  vi.stubGlobal("fetch", fetcher);
  const a = await getModisNdvi(db, 42.03, -93.62, 2024);
  const b = await getModisNdvi(db, 42.03, -93.62, 2024);
  expect(a).toEqual(b); expect(a.status).toBe("partial"); expect(a.validCount).toBe(1); expect(a.expectedCount).toBe(23);
  expect(bind.mock.calls.some(args => String((args as unknown[])[0]).includes("modis:MOD13Q1:061:qa-v2-csv"))).toBe(true);
  expect(run).toHaveBeenCalled(); expect(fetcher).toHaveBeenCalledTimes(2);
  clearMemoryCache(); vi.stubGlobal("fetch", vi.fn(async () => new Response("down", { status: 503 })));
  const fail = await getModisNdvi(undefined, 42.03, -93.62, 2024);
  expect(fail.status).toBe("unavailable"); expect(fail.validCount).toBe(0); expect(fail.retrievedAt).toBeNull();
});
it("allows slow ORNL responses and stops after one retry", async () => {
  vi.useFakeTimers();
  try {
    const signals: AbortSignal[] = [];
    const fetcher = vi.fn(async (_u: RequestInfo | URL, init?: RequestInit) => {
      signals.push(init!.signal!);
      await new Promise(resolve => setTimeout(resolve, 31000));
      return new Response("down", { status: 503 });
    });
    vi.stubGlobal("fetch", fetcher);
    const pending = getModisNdvi(undefined, 38.1095, -100.706, 2025);
    await vi.advanceTimersByTimeAsync(11000);
    expect(signals[0]!.aborted).toBe(false);
    await vi.runAllTimersAsync();
    expect((await pending).status).toBe("unavailable");
    expect(fetcher).toHaveBeenCalledTimes(2);
  } finally { vi.useRealTimers(); }
});
it("protects the prefetch route before validation or network access", async () => {
  const spy = vi.fn(); vi.stubGlobal("fetch", spy);
  for (const token of [undefined, "wrong"]) {
    const res = await app.request("/api/vegetation/prefetch?lat=38.1095&lon=-100.706&year=2025", { method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {} }, { ADMIN_TOKEN: "test-admin" });
    expect(res.status).toBe(401);
  }
  const res = await app.request("/api/vegetation/prefetch?lat=38.1095&lon=-100.706&year=no", { method: "POST", headers: { Authorization: "Bearer test-admin" } }, { ADMIN_TOKEN: "test-admin" });
  expect(res.status).toBe(400);
  expect(spy).not.toHaveBeenCalled();
});
it("validates route input before any network request", async () => {
  const spy = vi.fn(); vi.stubGlobal("fetch", spy);
  const res = await app.request("/api/vegetation?lat=42&lon=-93&year=abc", {}, {});
  expect(res.status).toBe(400); expect(spy).not.toHaveBeenCalled();
});
