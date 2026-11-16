import { describe, expect, it } from "vitest";
import { validatePlanRequest } from "../src/worker/routes/api";
import { planCacheKey } from "../src/worker/service";

describe("Simplified Chinese planner API language", () => {
  const request = { lat: 42.03, lon: -93.62, irrigated: false, priority: "balanced" as const, language: "zh-Hans" as const };
  const now = new Date("2026-11-15T12:00:00Z");

  it("accepts zh-Hans and isolates cached plans from every existing language", () => {
    const validated = validatePlanRequest(request);
    expect(validated).toMatchObject({ language: "zh-Hans" });
    if (typeof validated === "string") throw new Error(validated);
    const key = planCacheKey(validated, {}, now);
    for (const language of ["en", "es", "ko"] as const) {
      expect(key).not.toBe(planCacheKey({ ...validated, language }, {}, now));
    }
  });

  it("falls back to English validation and cache identity for unsupported language values", () => {
    const english = validatePlanRequest({ ...request, language: "en" });
    if (typeof english === "string") throw new Error(english);
    for (const language of [undefined, "zh-CN", "zh-Hant", "arbitrary prompt text", null, 42]) {
      const validated = validatePlanRequest({ ...request, language });
      expect(validated).toMatchObject({ language: "en" });
      if (typeof validated === "string") throw new Error(validated);
      expect(planCacheKey(validated, {}, now)).toBe(planCacheKey(english, {}, now));
    }
  });
});
