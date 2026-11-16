import { describe, expect, it } from "vitest";
import { fertilizerProductOptions, limeProductAmount, productAmount } from "../src/engine/fertilizerProducts";
import type { CropYearFertilizer, Nutrient, NutrientRec } from "../src/shared/fertilizer";
const rec = (nutrient: Nutrient, lbPerAcre: number | null, basis: NutrientRec["basis"] = "formula"): NutrientRec => ({ nutrient, lbPerAcre, basis, inputsUsed: {}, notes: [], source: { doc: "MF2586", page: "5" } });
const year = (...recs: NutrientRec[]): CropYearFertilizer => ({ year: 2027, crop: "corn", expectedYield: 150, yieldUnit: "bu/acre", recs });

describe("display-only fertilizer product equivalents", () => {
  it("converts 150 lb N to about 183 lb of 82-0-0 anhydrous, not 150 lb of product", () => {
    expect(productAmount(150, 82)).toBeCloseTo(182.926829, 5);
    expect(Math.round(productAmount(150, 82))).toBe(183);
  });
  it.each([[46, 326.0869565], [28, 535.7142857], [32, 468.75], [21, 714.2857143]] as const)("converts a 150 lb N target using %s%% guaranteed analysis", (analysis, expected) => {
    expect(productAmount(150, analysis)).toBeCloseTo(expected, 5);
  });
  it("credits DAP N before sizing urea, and reports an excess instead of a negative rate", () => {
    const options = fertilizerProductOptions(year(rec("N", 150), rec("P2O5", 46), rec("K2O", 60)));
    expect(options).toHaveLength(3);
    const dap = options.find(o => o.id === "dap-urea")!;
    expect(dap.lines.find(l => l.product.id === "dap")?.lbProductPerAcre).toBe(100);
    expect(dap.nCreditLbPerAcre).toBe(18);
    expect(dap.lines.find(l => l.product.id === "urea")?.lbProductPerAcre).toBeCloseTo(286.956522, 5);
    expect(dap.lines.find(l => l.product.id === "potash")?.lbProductPerAcre).toBe(100);
    const excess = fertilizerProductOptions(year(rec("N", 0), rec("P2O5", 46)))[1]!;
    expect(excess.excessNLbPerAcre).toBe(18);
    expect(excess.lines.some(l => l.product.id === "urea")).toBe(false);
  });
  it("does not turn unknown soil tests or crop removal into product applications", () => {
    expect(fertilizerProductOptions(year(rec("P2O5", 50, "removal"), rec("K2O", null, "soil-test-needed")))).toEqual([]);
  });
  it("credits ammonium sulfate N and never mutates the nutrient guide", () => {
    const input = year(rec("N", 150), rec("S", 24), rec("P2O5", 52));
    const before = JSON.stringify(input);
    const option = fertilizerProductOptions(input)[0]!;
    expect(option.lines.find(l => l.product.id === "ammoniumSulfate")?.lbProductPerAcre).toBe(100);
    expect(option.nCreditLbPerAcre).toBe(32); // 11 MAP + 21 ammonium sulfate
    expect(option.remainingNLbPerAcre).toBe(118);
    expect(JSON.stringify(input)).toBe(before);
  });
  it("deduplicates identical P-only examples rather than showing three fake alternatives", () => {
    expect(fertilizerProductOptions(year(rec("P2O5", 52)))).toHaveLength(2);
  });
  it("converts lime using measured ECC rather than pretending aglime is pure", () => {
    expect(limeProductAmount(3000, 60)).toBe(5000); // K-State MF1065 worked example
    expect(() => limeProductAmount(3000, 0)).toThrow(RangeError);
    expect(() => productAmount(-1, 46)).toThrow(RangeError);
    expect(() => productAmount(1, NaN)).toThrow(RangeError);
  });
});
