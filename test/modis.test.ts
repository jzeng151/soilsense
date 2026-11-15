import { readFileSync } from "node:fs";
import { afterEach, expect, it, vi } from "vitest";
import { getModisNdvi, parseModisSubset } from "../src/worker/data/modis";
import { clearMemoryCache } from "../src/worker/lib/cache";
import app from "../src/worker/index";

// Synthetic protocol cases, NOT downloaded satellite observations.
it("does not mislabel the official documented Collection 006 example as 061", () => {
  const source = JSON.parse(readFileSync(new URL("./fixtures/modis/ornl-documented-006.json", import.meta.url), "utf8"));
  expect(source.subset.find((r: { band: string }) => r.band.endsWith("NDVI")).data[40]).toBe(4429);
  expect(parseModisSubset(source, ["A2018049"])[0]!.ndvi).toBeNull();
});
const row = (band: string, data: number[], date = "A2024185", version = "061") => ({ band: `250m_16_days_${band}`, data, modis_date: date, version, proc_date: "2024200120000", title: "h10v04" });
const subset = (reliability = 0, ndvi = 4500) => ({ nrows: 1, ncols: 1, cellsize: "231.656358264", subset: [row("NDVI", [ndvi]), row("pixel_reliability", [reliability]), row("VI_Quality", [2048]), row("composite_day_of_the_year", [190])] });
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
  const fetcher = vi.fn(async (u: RequestInfo | URL) => new Response(JSON.stringify(String(u).includes("/dates?") ? { dates: [{ modis_date: "A2024193", calendar_date: "2024-07-11" }] } : scheduled)));
  vi.stubGlobal("fetch", fetcher);
  const a = await getModisNdvi(db, 42.03, -93.62, 2024);
  const b = await getModisNdvi(db, 42.03, -93.62, 2024);
  expect(a).toEqual(b); expect(a.status).toBe("partial"); expect(a.validCount).toBe(1); expect(a.expectedCount).toBe(23);
  expect(bind.mock.calls.some(args => String((args as unknown[])[0]).includes("modis:MOD13Q1:061:qa-v1"))).toBe(true);
  expect(run).toHaveBeenCalled(); expect(fetcher).toHaveBeenCalledTimes(2);
  clearMemoryCache(); vi.stubGlobal("fetch", vi.fn(async () => new Response("down", { status: 503 })));
  const fail = await getModisNdvi(undefined, 42.03, -93.62, 2024);
  expect(fail.status).toBe("unavailable"); expect(fail.validCount).toBe(0); expect(fail.retrievedAt).toBeNull();
});
it("validates route input before any network request", async () => {
  const spy = vi.fn(); vi.stubGlobal("fetch", spy);
  const res = await app.request("/api/vegetation?lat=42&lon=-93&year=abc", {}, {});
  expect(res.status).toBe(400); expect(spy).not.toHaveBeenCalled();
});
