import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parsePower } from "../src/engine/climate";
import { buildPlan, type PlanInputs } from "../src/engine/plan";
import { effectiveSoil } from "../src/shared/measurements";
import { soilSuitability, buildWaterContext } from "../src/engine/rotation";
import { CROPS } from "../src/engine/crops";

export const inputs: PlanInputs = {
  request: { lat: 38.1095, lon: -100.706, irrigated: false, priority: "balanced", recentCrops: ["corn"] },
  climate: parsePower(JSON.parse(readFileSync(new URL("./fixtures/power-finney-county-ks.json", import.meta.url), "utf8"))),
  soil: { available: true, source: "USDA SSURGO", ph: 6.4, organicMatterPct: 2, awc: 0.21, profileDepthCm: 200 },
  cropHistory: { available: false, source: "fixture", years: [] },
  county: { countyFips: "20055", countyName: "Finney County", stateCode: "KS", stateName: "Kansas" },
  now: new Date("2026-11-15T15:00:00Z"), planStartYear: 2027,
};

describe("farmer measurements", () => {
  it("preserves the entire legacy response with no measurements", () => {
    expect(buildPlan(inputs)).toMatchSnapshot();
  });
  it("passes the test pH through the entire plan and cites both values without relabeling the map", () => {
    const plan = buildPlan({ ...inputs, request: { ...inputs.request, soilTest: { ph: 5.8 } } });
    expect(plan.soil).toEqual(inputs.soil);
    expect(plan.facts.some((f) => f.text.includes("Using your soil test pH 5.8 instead of the soil map's 6.4"))).toBe(true);
    // 5.8 does not cross the selected dryland crops' pH thresholds; no forced ranking change.
    const acidic = buildPlan({ ...inputs, request: { ...inputs.request, soilTest: { ph: 4 } } });
    expect(acidic.plans).not.toEqual(buildPlan(inputs).plans);
  });
  it("calibrates only the recorded crop and explains the bounded additive adjustment", () => {
    const plan = buildPlan({ ...inputs, request: { ...inputs.request, yieldRecords: [2023, 2024, 2025].map((year) => ({ crop: "corn", year, value: 70, unit: "bu/acre" })) } });
    expect(plan.currentPractice!.years.find((y) => y.crop === "corn")!.expectedYield).not.toBe(buildPlan(inputs).currentPractice!.years.find((y) => y.crop === "corn")!.expectedYield);
    expect(plan.currentPractice!.years.filter((y) => y.crop === "soybean")).toEqual(buildPlan(inputs).currentPractice!.years.filter((y) => y.crop === "soybean"));
    expect(plan.facts.find((f) => f.id === "farmer-yield-corn")?.text).toContain("Calibrated with your 3 years of corn yields");
    expect(plan.facts.find((f) => f.id === "farmer-yield-corn")?.text).toContain("50%");
  });
  it.each([0, 1000])("bounds extreme local corn records (%s) without modifying unrecorded soybean potential", (value) => {
    const plan = buildPlan({ ...inputs, request: { ...inputs.request, yieldRecords: [{ crop: "corn", year: 2025, value, unit: "bu/acre" }] } });
    const fact = plan.facts.find((f) => f.id === "farmer-yield-corn")!.text;
    const potential = Number(fact.match(/→ ([\d.]+):/)![1]);
    expect(potential).toBeGreaterThanOrEqual(0.6 * 220);
    expect(potential).toBeLessThanOrEqual(1.15 * 220 + 1e-10);
    expect(plan.currentPractice!.years.filter((y) => y.crop === "soybean")).toEqual(buildPlan(inputs).currentPractice!.years.filter((y) => y.crop === "soybean"));
    expect(fact).toContain(`average ${value.toFixed(1)}`);
  });
  it("applies AWC and texture to the plan water model while showing OM without inventing a yield effect", () => {
    const baseline = buildPlan(inputs);
    const awc = buildPlan({ ...inputs, request: { ...inputs.request, soilTest: { awc: 0.08 } } });
    const texture = buildPlan({ ...inputs, request: { ...inputs.request, soilTest: { texture: "sand" } } });
    const om = buildPlan({ ...inputs, request: { ...inputs.request, soilTest: { organicMatterPct: 4 } } });
    expect(awc.plans).not.toEqual(baseline.plans);
    expect(texture.plans).toEqual(awc.plans);
    expect(texture.facts.find((f) => f.id === "farmer-soil-awc")!.text).toContain("not measured");
    expect(om.plans).toEqual(baseline.plans);
    expect(om.facts.find((f) => f.id === "soil")!.text).toContain("4.0% organic matter");
    expect(om.facts.find((f) => f.id === "soil")!.source).toContain("Farmer-entered");
    expect(om.facts.find((f) => f.id === "farmer-om-limit")!.text).toContain("does not infer");
  });
  it("keeps empty measurement objects identical except for echoing the request", () => {
    const plan = buildPlan({ ...inputs, request: { ...inputs.request, soilTest: {}, yieldRecords: [] } });
    const { soilTest: _soil, yieldRecords: _records, ...request } = plan.request;
    expect({ ...plan, request }).toEqual(buildPlan(inputs));
  });
  it("rejects invalid measurements even for direct engine callers", () => {
    expect(() => buildPlan({ ...inputs, request: { ...inputs.request, soilTest: { awc: -1 } } })).toThrow("awc");
  });
  it("replays the Kansas fixture without inputs, with pH 5.8, and with three corn records", () => {
    const baseline = buildPlan(inputs);
    const soilOnly = buildPlan({ ...inputs, request: { ...inputs.request, soilTest: { ph: 5.8 } } });
    const calibrated = buildPlan({ ...inputs, request: { ...inputs.request, soilTest: { ph: 5.8 }, yieldRecords: [2023, 2024, 2025].map((year, i) => ({ crop: "corn", year, value: [65, 70, 75][i]!, unit: "bu/acre" })) } });
    expect(soilOnly.plans).toEqual(baseline.plans);
    expect(calibrated.currentPractice!.years.find((y) => y.crop === "corn")!.expectedYield).not.toBe(baseline.currentPractice!.years.find((y) => y.crop === "corn")!.expectedYield);
    if (process.env.MEASUREMENTS_DEMO_OUTPUT) writeFileSync(process.env.MEASUREMENTS_DEMO_OUTPUT, JSON.stringify({ baseline, soilOnly, calibrated }, null, 2));
  });
  it("overrides only supplied soil properties and keeps the map unchanged", () => {
    const soil = effectiveSoil(inputs.soil, { ph: 5.8, organicMatterPct: 3.1, awc: 0.1 });
    expect(soil).toMatchObject({ ph: 5.8, organicMatterPct: 3.1, awc: 0.1, profileDepthCm: 200 });
    expect(inputs.soil.ph).toBe(6.4);
    expect(effectiveSoil(inputs.soil)).toBe(inputs.soil);
    expect(soilSuitability(CROPS.alfalfa, soil).factor).toBeLessThan(soilSuitability(CROPS.alfalfa, inputs.soil).factor);
    expect(buildWaterContext(inputs.climate, soil, false)).not.toEqual(buildWaterContext(inputs.climate, inputs.soil, false));
  });
});
