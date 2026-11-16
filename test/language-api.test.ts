import { describe, expect, it } from "vitest";
import { validatePlanRequest } from "../src/worker/routes/api";
import { planCacheKey } from "../src/worker/service";

describe("Korean planner API language", () => {
  it("accepts ko and isolates cached plans from English and Spanish", () => {
    const request = { lat: 42.03, lon: -93.62, irrigated: false, priority: "balanced" as const, language: "ko" as const };
    expect(validatePlanRequest(request)).toMatchObject({ language: "ko" });
    expect(planCacheKey(request)).not.toBe(planCacheKey({ ...request, language: "en" }));
    expect(planCacheKey(request)).not.toBe(planCacheKey({ ...request, language: "es" }));
  });
});
