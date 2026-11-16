import { describe, expect, it } from "vitest";
import { cropYearFertilizer } from "../src/engine/fertilizer";
import type { PlanYear } from "../src/shared/types";
const year = (crop = "corn", expectedYield = 160) => ({ year: 2027, crop, expectedYield, yieldUnit: "bu/acre", cover: "none" }) as PlanYear;
const context = { stateCode: "KS", lon: -100.8, irrigated: false, organicMatterPct: 2, organicMatterSource: "USDA SSURGO" };
describe("MF2586 display-only guideline", () => {
  it("uses printed p5 corn efficiencies, p4 default profile N, and previous soybean credit", () => {
    const result = cropYearFertilizer(year(), { ...context, previousCrop: "soybean" });
    expect(result.recs.find(r => r.nutrient === "N")?.lbPerAcre).toBe(146);
  });
});
