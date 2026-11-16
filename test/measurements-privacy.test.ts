import { beforeEach, expect, it, vi } from "vitest";
import { makePlan, logPlan } from "../src/worker/service";
import { cached } from "../src/worker/lib/cache";
import type { PlanRequest, PlanResponse } from "../src/shared/types";

vi.mock("../src/worker/lib/cache", () => ({ cached: vi.fn(async () => ({ value: null, cache: "hit" })) }));
// Stop at the source boundary: this test verifies no personalized response reaches the shared cache.
vi.mock("../src/worker/data/power", () => ({ getDailyClimate: vi.fn(async () => { throw new Error("fresh-source-boundary"); }) }));
vi.mock("../src/worker/data/daymet", () => ({ getDaymet: vi.fn(async () => null) }));
vi.mock("../src/worker/data/soil", () => ({ getSoil: vi.fn(async () => null) }));
vi.mock("../src/worker/data/cdl", () => ({ getCropHistory: vi.fn(async () => null) }));
vi.mock("../src/worker/data/geo", () => ({ getCounty: vi.fn(async () => null) }));
const request: PlanRequest = { lat: 38.1095, lon: -100.706, irrigated: false, priority: "balanced" };
beforeEach(() => vi.clearAllMocks());
it.each([{ soilTest: { ph: 5.8 } }, { yieldRecords: [{ crop: "corn" as const, year: 2025, value: 70, unit: "bu/acre" as const }] }])("never caches or logs personalized plans %j", async (measurements) => {
  const prepare = vi.fn();
  await expect(makePlan({ PLAN_COMPUTE_MODE: "inline", DB: { prepare } } as never, { ...request, ...measurements })).rejects.toThrow("fresh-source-boundary");
  expect(cached).not.toHaveBeenCalled();
  await logPlan({ DB: { prepare } } as never, { channel: "web", plan: { request: { ...request, ...measurements } } as PlanResponse });
  expect(prepare).not.toHaveBeenCalled();
});
it("retains caching for absent or empty measurements", async () => {
  await makePlan({}, request);
  await makePlan({}, { ...request, soilTest: {}, yieldRecords: [] });
  expect(cached).toHaveBeenCalledTimes(2);
  expect(vi.mocked(cached).mock.calls[0]![1]).toBe(vi.mocked(cached).mock.calls[1]![1]);
});
