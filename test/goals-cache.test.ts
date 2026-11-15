import { beforeEach, describe, expect, it, vi } from "vitest";
import { cached } from "../src/worker/lib/cache";
import { makePlan } from "../src/worker/service";
import type { PlanRequest } from "../src/shared/types";

// Cache-boundary test only: no data services or actual plan output are substituted/claimed here.
vi.mock("../src/worker/lib/cache", () => ({ cached: vi.fn(async () => ({ value: null, cache: "hit" })) }));
const request: PlanRequest = { lat: 38.1095, lon: -100.706, irrigated: true, water: "full", priority: "balanced" };

describe("goal-aware plan cache identity", () => {
  beforeEach(() => vi.clearAllMocks());
  it("does not serve an unselected-goal cache entry for a selected goal, but keeps empty goals equivalent", async () => {
    await makePlan({}, request);
    await makePlan({}, { ...request, goals: [] });
    await makePlan({}, { ...request, goals: ["water_conservation"] });
    await makePlan({}, { ...request, goals: ["nitrogen_fixation"] });
    await makePlan({}, { ...request, goals: ["water_conservation", "nitrogen_fixation"] });
    const keys = vi.mocked(cached).mock.calls.map((args) => args[1]);
    expect(keys).toHaveLength(5);
    expect(keys[0]).toBe(keys[1]);
    expect(new Set([keys[0], ...keys.slice(2)]).size).toBe(4);
    expect(keys[2]).toContain("goals=water_conservation");
    expect(keys[4]).toContain("goals=water_conservation,nitrogen_fixation");
  });
});
