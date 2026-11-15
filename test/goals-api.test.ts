import { describe, expect, it } from "vitest";
import { GOALS } from "../src/shared/types";
import { validatePlanRequest } from "../src/worker/routes/api";

const request = { lat: 38.1095, lon: -100.706, water: "full", priority: "balanced" };

describe("farmer goals HTTP boundary", () => {
  it("preserves optional goals and accepts every supported goal", () => {
    for (const goal of GOALS) expect(validatePlanRequest({ ...request, goals: [goal] })).toMatchObject({ goals: [goal] });
    expect(validatePlanRequest({ ...request, goals: [] })).toMatchObject({ goals: [] });
    expect(validatePlanRequest(request)).not.toHaveProperty("goals");
    expect(validatePlanRequest({ ...request, goals: ["water_conservation", "nitrogen_fixation"] })).toMatchObject({ goals: ["water_conservation", "nitrogen_fixation"] });
  });

  it.each([null, "water_conservation", ["unknown"], ["water_conservation", "water_conservation"], ["water_conservation", "nitrogen_fixation", "erosion_control"], [1]])("rejects invalid goals %j rather than silently ignoring the farmer's preference", (goals) => {
    expect(typeof validatePlanRequest({ ...request, goals })).toBe("string");
  });
});
