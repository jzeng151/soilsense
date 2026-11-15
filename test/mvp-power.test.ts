import { readFileSync } from "node:fs";
import { afterEach, expect, it, vi } from "vitest";
import { getDailyClimate } from "../src/worker/data/power";
import { clearMemoryCache } from "../src/worker/lib/cache";
import { evidenceForPlan } from "../src/engine/dataEvidence";
import { buildPlan } from "../src/engine/plan";

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); clearMemoryCache(); });
it("retains actual retrieval provenance on cache reuse and keeps observation time separate", async () => {
  const response = readFileSync(new URL("./fixtures/power-finney-county-ks.json", import.meta.url), "utf8");
  const fetch = vi.fn(async () => new Response(response));
  vi.stubGlobal("fetch", fetch);
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-15T06:00:00Z"));
  const first = await getDailyClimate(undefined, 38.1095, -100.706, 1991, 2025);
  expect(first.powerEvidence).toMatchObject({ retrievedAt: "2026-11-15T06:00:00.000Z", observedThrough: "2025-12-31", cached: false });
  vi.setSystemTime(new Date("2026-11-16T06:00:00Z"));
  const cached = await getDailyClimate(undefined, 38.1095, -100.706, 1991, 2025);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(cached.powerEvidence).toMatchObject({ retrievedAt: "2026-11-15T06:00:00.000Z", observedThrough: "2025-12-31", cached: true });
  const plan = buildPlan({ climate: cached, soil: { available: false, source: "unknown" }, cropHistory: { available: false, source: "unknown", years: [] }, county: null, request: { lat: 38, lon: -100, irrigated: false, priority: "balanced" }, planStartYear: 2027, now: new Date() });
  const row = evidenceForPlan(plan)[0]!;
  expect(row.retrievedAt).not.toBe(plan.generatedAt);
  expect(row.status).toBe("historical-cached");
  expect(row.url).toContain("time-standard=LST");
});
