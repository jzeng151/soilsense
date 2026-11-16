import { describe, expect, it } from "vitest";
import { cropYearFertilizer, withFertilizer } from "../src/engine/fertilizer";
import { validateFertilizerInputs } from "../src/shared/fertilizer-inputs";
import { buildPlan } from "../src/engine/plan";
import { finneyInputs } from "./helpers/finney";
import type { Nutrient, FertilizerInputs } from "../src/shared/fertilizer";
import type { PlanYear } from "../src/shared/types";
const year = (crop = "corn", expectedYield = 160) => ({ year: 2027, crop, expectedYield, yieldUnit: crop === "alfalfa" ? "tons/acre" : "bu/acre", cover: "none" }) as PlanYear;
const context = { stateCode: "KS", lon: -100.8, irrigated: false, organicMatterPct: 2, organicMatterSource: "USDA SSURGO" };
const rec = (crop: string, ey: number, n: Nutrient, inputs: FertilizerInputs = {}, extra = {}) => cropYearFertilizer(year(crop, ey), { ...context, ...extra }, inputs).recs.find(r => r.nutrient === n)!;
describe("MF2586 printed tables and conservative missing-data behavior", () => {
  it.each([["corn", 1000, 230], ["corn", 0, 30], ["sorghum", 100, 148.2], ["winter_wheat", 50, 81.8], ["oats", 100, 80], ["alfalfa", 4, 0]] as const)("applies p5–7 N equation/minimum/cap for %s", (crop, ey, expected) => {
    expect(rec(crop, ey, "N").lbPerAcre).toBe(expected);
  });
  it("uses irrigated and high-efficiency coefficients and coarse-soil efficiency", () => {
    expect(rec("corn", 160, "N", { nApplication: "injected-or-split" }, { irrigated: true }).lbPerAcre).toBe(136.8);
    expect(rec("corn", 160, "N", {}, { coarseTexture: true }).lbPerAcre).toBe(195);
    expect(rec("corn", 1000, "N", {}, { irrigated: true }).lbPerAcre).toBe(300);
  });
  it("distinguishes cool/warm previous crop adjustments and sampled fallow", () => {
    expect(rec("winter_wheat", 50, "N", {}, { previousCrop: "soybean" }).lbPerAcre).toBe(81.8);
    expect(rec("winter_wheat", 50, "N", {}, { previousCrop: "sorghum" }).lbPerAcre).toBe(111.8);
    expect(rec("corn", 160, "N", {}, { previousCrop: "fallow" }).lbPerAcre).toBe(166);
    expect(rec("corn", 160, "N", { profileNitrateLbPerAcre: 30 }, { previousCrop: "fallow" }).lbPerAcre).toBe(186);
  });
  it("does not invent soybean N, alfalfa stand credit, organic matter or legume cover credits", () => {
    expect(rec("soybean", 50, "N").lbPerAcre).toBeNull();
    expect(rec("soybean", 50, "N").basis).toBe("legume-not-needed");
    expect(rec("soybean", 50, "N").notes.join(" ")).toContain("MF2586 gives no soybean N recommendation");
    expect(rec("alfalfa", 4, "N")).toMatchObject({ lbPerAcre: 0, basis: "legume-not-needed" });
    expect(rec("soybean", 50, "P2O5").basis).toBe("soil-test-needed");
    expect(rec("corn", 160, "N", {}, { previousCrop: "alfalfa" }).lbPerAcre).toBeNull();
    expect(rec("corn", 160, "N", {}, { organicMatterPct: undefined }).lbPerAcre).toBeNull();
    const cover = rec("corn", 160, "N", {}, { previousCover: "hairy_vetch" });
    expect(cover.lbPerAcre).toBe(186);
    expect(cover.notes.join(" ")).toContain("No cover-crop N credit");
  });
  // Literal printed category values. Midpoints explain table rounding; formulas are not forced to table buckets.
  it.each([
    ["corn", 80, 4, 20, 55, 75], ["corn", 120, 12, 20, 30, 85],
    ["winter_wheat", 50, 4, 20, 55, 65], ["sorghum", 80, 4, 20, 50, 80],
    ["soybean", 50, 4, 20, 65, 75], ["oats", 100, 4, 20, 60, 70], ["alfalfa", 2, 4, 25, 70, 80],
  ] as const)("reproduces printed P/K sufficiency table values for %s at EY %s (nearest 5 lb)", (crop, ey, p, k, expectedP, expectedK) => {
    expect(Math.round(rec(crop, ey, "P2O5", { mehlich3P: p }).lbPerAcre! / 5) * 5).toBe(expectedP);
    expect(Math.round(rec(crop, ey, "K2O", { extractableK: k }).lbPerAcre! / 5) * 5).toBe(expectedK);
  });
  it("reproduces p9/p21 four-year corn build-maintenance tables (nearest lb)", () => {
    expect(Math.round(rec("corn", 80, "P2O5", { mehlich3P: 4, pkProgram: "build-maintenance" }).lbPerAcre!)).toBe(98);
    expect(Math.round(rec("corn", 80, "K2O", { extractableK: 20, pkProgram: "build-maintenance" }).lbPerAcre!)).toBe(268);
    expect(rec("corn", 160, "P2O5", { mehlich3P: 25, pkProgram: "build-maintenance" }).lbPerAcre).toBe(52.8);
    expect(rec("corn", 160, "P2O5", { mehlich3P: 31, pkProgram: "build-maintenance" }).lbPerAcre).toBe(0);
  });
  it("reports removal separately from a missing P/K rate; honors thresholds/starter minimums", () => {
    expect(rec("corn", 160, "P2O5").lbPerAcre).toBeNull();
    expect(rec("corn", 160, "P2O5").inputsUsed.cropRemovalLbPerAcre).toBeCloseTo(52.8);
    expect(rec("corn", 160, "K2O").inputsUsed.cropRemovalLbPerAcre).toBe(41.6);
    expect(rec("corn", 160, "P2O5", { mehlich3P: 19 }).lbPerAcre).toBe(15);
    expect(rec("corn", 160, "P2O5", { mehlich3P: 20 }).lbPerAcre).toBe(15);
    expect(rec("corn", 160, "K2O", { extractableK: 130 }).lbPerAcre).toBe(15);
    expect(rec("corn", 160, "P2O5", { mehlich3P: 21 }).lbPerAcre).toBe(0);
    expect(rec("alfalfa", 4, "P2O5", { mehlich3P: 26 }).lbPerAcre).toBe(0);
  });
  it("matches p8 rounded lime table and p33 zinc rules, with p34 sulfur default", () => {
    expect(Math.round(rec("corn", 160, "lime", { bufferPh: 6.5 }, { soilPh: 5.5 }).lbPerAcre! / 100) * 100).toBe(3300);
    expect(rec("corn", 160, "lime", { bufferPh: 6.5 }).lbPerAcre).toBeNull();
    expect(rec("corn", 160, "lime", { bufferPh: 6.5 }, { soilPh: 6 }).lbPerAcre).toBe(0);
    expect(rec("corn", 160, "Zn", { zincDtpaPpm: 0 }).lbPerAcre).toBe(11.5);
    expect(rec("corn", 160, "Zn", { zincDtpaPpm: 1 }).lbPerAcre).toBe(1);
    expect(rec("corn", 160, "Zn", { zincDtpaPpm: 1.01 }).lbPerAcre).toBe(0);
    expect(rec("corn", 160, "S").lbPerAcre).toBe(2);
  });
  it("withholds all numerical rates outside Kansas and makes fallow zero", () => {
    expect(cropYearFertilizer(year(), { ...context, stateCode: "IA" }).recs.every(r => r.lbPerAcre === null)).toBe(true);
    expect(cropYearFertilizer(year("fallow", 0), context).recs.every(r => r.lbPerAcre === 0)).toBe(true);
  });
  it.each([{ mehlich3P: -1 }, { bufferPh: 8 }, { extractableK: Infinity }, { zincDtpaPpm: NaN }, { sulfatePpm: "10" }, { nApplication: "magic" }, { pkProgram: "other" }])("rejects invalid laboratory/method inputs: %j", value => {
    expect(typeof validateFertilizerInputs(value)).toBe("string");
  });
  it("enriches every plan/current practice without mutating Finney outputs or economics", () => {
    const plan = buildPlan(finneyInputs);
    const before = JSON.stringify(plan);
    const enriched = withFertilizer(plan);
    expect(JSON.stringify(plan)).toBe(before);
    const stripped = { ...enriched, plans: enriched.plans.map(({ fertilizer, ...p }) => p), currentPractice: enriched.currentPractice ? (({ fertilizer, ...p }) => p)(enriched.currentPractice) : null };
    expect(JSON.stringify(stripped)).toBe(before);
    expect(enriched.plans.every(p => p.fertilizer?.years.length === p.years.length)).toBe(true);
    expect(enriched.currentPractice?.fertilizer?.years.length).toBe(enriched.currentPractice?.years.length);
  });
});
