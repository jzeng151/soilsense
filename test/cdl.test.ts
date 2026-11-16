import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { clearMemoryCache } from "../src/worker/lib/cache";
import { csbCropHistory } from "../src/worker/data/cdl-csb";

beforeEach(() => { vi.resetModules(); clearMemoryCache(); });
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
const good = () => new Response('<Result>{x: 647917.57, y: 1918516.21, value: 5, category: "Soybeans", color: "#267300"}</Result>');

it("parses the observed CropScape XML wrapper; rejects unpublished-year faults", async () => {
  const { parseCdlValue } = await import("../src/worker/data/cdl");
  expect(parseCdlValue(await good().text())).toEqual({ code: 5, name: "Soybeans" });
  expect(parseCdlValue('<faultstring>Error: The year must be between 1997 and 2025.</faultstring>')).toBeNull();
});

it("does not let one failed point mask healthy memory or D1 history, or other cold points", async () => {
  const { getCropHistory } = await import("../src/worker/data/cdl");
  const fetcher = vi.spyOn(globalThis, "fetch").mockImplementation(async () => good());
  const healthy = await getCropHistory(undefined, 40.048, -88.33, 2025, 1);
  fetcher.mockRejectedValue(new Error("outage"));
  await getCropHistory(undefined, 30, -100, 2025, 1);
  const calls = fetcher.mock.calls.length;
  expect(await getCropHistory(undefined, 40.048, -88.33, 2025, 1)).toEqual(healthy);
  expect(fetcher).toHaveBeenCalledTimes(calls);
  const db = { prepare: () => ({ bind: () => ({ first: async () => ({ value: JSON.stringify(healthy), expires_at: Date.now() + 10000 }) }) }) } as unknown as D1Database;
  expect(await getCropHistory(db, 40.73, -96.55, 2025, 1)).toEqual(healthy);
  expect(fetcher).toHaveBeenCalledTimes(calls);
  fetcher.mockImplementation(async () => good());
  expect((await getCropHistory(undefined, 38.1095, -100.706, 2025, 1)).source).toContain("Cropland Data Layer");
});

it("suppresses only the failed key for ten minutes without extending its cooldown", async () => {
  vi.useFakeTimers();
  const { getCropHistory } = await import("../src/worker/data/cdl");
  const fetcher = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("outage"));
  expect((await getCropHistory(undefined, 30, -100, 2025, 1)).available).toBe(false);
  await vi.advanceTimersByTimeAsync(9 * 60 * 1000);
  await getCropHistory(undefined, 30, -100, 2025, 1);
  expect(fetcher).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(60 * 1000 + 1);
  fetcher.mockImplementation(async () => good());
  expect((await getCropHistory(undefined, 30, -100, 2025, 1)).available).toBe(true);
  expect(fetcher).toHaveBeenCalledTimes(3);
});

it("never persists even a mostly-complete lookup for 180 days", async () => {
  const { getCropHistory } = await import("../src/worker/data/cdl");
  const fetcher = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => String(url).includes("year=2024") ? new Response("<faultstring>temporary failure</faultstring>") : good());
  const partial = await getCropHistory(undefined, 40.048, -88.33, 2025, 3);
  expect(partial.years).toHaveLength(2);
  expect(partial.note).toContain("2 of 3");
  fetcher.mockImplementation(async () => good());
  expect((await getCropHistory(undefined, 40.048, -88.33, 2025, 3)).years).toHaveLength(3);
  expect(fetcher).toHaveBeenCalledTimes(6);
});

it("allows a valid ten-second upstream response instead of the old eight-second cutoff", async () => {
  vi.useFakeTimers();
  const { getCropHistory } = await import("../src/worker/data/cdl");
  const fetcher = vi.spyOn(globalThis, "fetch").mockImplementation(() => new Promise(resolve => setTimeout(() => resolve(good()), 10000)));
  const pending = getCropHistory(undefined, 40.048, -88.33, 2025, 1);
  await vi.advanceTimersByTimeAsync(10001);
  expect((await pending).years).toHaveLength(1);
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("bounds a stalled HTTP 200 body and retries once", async () => {
  vi.useFakeTimers();
  const { getCropHistory } = await import("../src/worker/data/cdl");
  const fetcher = vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => new Response(new ReadableStream({
    start(controller) { init!.signal!.addEventListener("abort", () => controller.error(new Error("aborted"))); },
  })));
  const pending = getCropHistory(undefined, 30, -100, 2025, 1);
  await vi.advanceTimersByTimeAsync(40001);
  expect((await pending).available).toBe(false);
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it("uses only containing committed CSB polygons, labels provenance and limits years", async () => {
  for (const [lat, lon] of [[42.0563, -93.495], [40.048, -88.33], [38.1095, -100.706], [40.73, -96.55]]) {
    const fallback = csbCropHistory(lat!, lon!, 2025, 10);
    expect(fallback?.source).toContain("committed fallback");
    expect(fallback?.years).toHaveLength(8);
    expect(fallback?.note).toContain("csb:");
    expect(csbCropHistory(lat!, lon!, 2022, 2)?.years.map(y => y.year)).toEqual([2021, 2022]);
  }
  expect(csbCropHistory(40, -88, 2025, 10)).toBeNull();
  expect(csbCropHistory(40.048, -88.33, 2017, 1)).toBeNull();
  const { getCropHistory } = await import("../src/worker/data/cdl");
  const fetcher = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("outage"));
  const fallback = await getCropHistory(undefined, 40.048, -88.33, 2025);
  expect(fallback.source).toContain("committed fallback");
  vi.useFakeTimers(); await vi.advanceTimersByTimeAsync(600001);
  fetcher.mockImplementation(async () => good());
  expect((await getCropHistory(undefined, 40.048, -88.33, 2025)).source).not.toContain("fallback");
});
