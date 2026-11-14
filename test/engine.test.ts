import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parsePower, type PowerResponse } from "../src/engine/climate";
import { buildPlan } from "../src/engine/plan";
import { currentPracticeSequence, soilHealthScore } from "../src/engine/rotation";
import type { CropHistory, SoilProfile } from "../src/shared/types";

// Real NASA POWER daily data, Story County, Iowa grid cell, 1991–2025.
const power = JSON.parse(readFileSync(new URL("./fixtures/power-story-county-ia.json", import.meta.url), "utf8")) as PowerResponse;
const climate = parsePower(power);

// Real SSURGO values for a Clarion loam point near Ames, IA.
const soil: SoilProfile = {
  available: true,
  source: "USDA NRCS SSURGO",
  mapUnitName: "Clarion loam, 2 to 6 percent slopes",
  componentName: "Clarion",
  drainageClass: "Well drained",
  ph: 6.2,
  organicMatterPct: 3.5,
  clayPct: 21,
  sandPct: 45,
  awc: 0.19,
  profileDepthCm: 152,
};

const cornHeavy: CropHistory = {
  available: true,
  source: "USDA NASS Cropland Data Layer",
  years: [
    { year: 2022, cdlCode: 1, cdlName: "Corn", crop: "corn" },
    { year: 2023, cdlCode: 1, cdlName: "Corn", crop: "corn" },
    { year: 2024, cdlCode: 5, cdlName: "Soybeans", crop: "soybean" },
    { year: 2025, cdlCode: 1, cdlName: "Corn", crop: "corn" },
  ],
};

const now = new Date("2026-11-14T17:00:00Z");

describe("parsePower", () => {
  it("keeps complete years only", () => {
    expect(climate.firstYear).toBe(1991);
    expect(climate.lastYear).toBe(2025);
    expect(climate.years.length).toBe(35);
  });
});

describe("buildPlan (real Iowa data)", () => {
  const res = buildPlan({
    request: { lat: 42.03, lon: -93.62, irrigated: false, priority: "balanced" },
    climate,
    soil,
    cropHistory: cornHeavy,
    county: { countyFips: "19169", countyName: "Story County", stateCode: "IA", stateName: "Iowa" },
    planStartYear: 2027,
    now,
  });

  it("returns three distinct ranked plans", () => {
    expect(res.plans).toHaveLength(3);
    const labels = new Set(res.plans.map((p) => p.label));
    expect(labels.size).toBe(3);
    const totals = res.plans.map((p) => p.scores.total);
    expect([...totals].sort((a, b) => b - a)).toEqual(totals);
  });

  it("never schedules winter wheat for 2027 after its fall 2026 window has passed", () => {
    for (const p of res.plans) expect(p.years[0]?.crop).not.toBe("winter_wheat");
  });

  it("does not recommend continuous corn on a corn-heavy field", () => {
    const top = res.plans[0]!;
    expect(top.years.map((y) => y.crop)).not.toEqual(["corn", "corn", "corn"]);
    expect(top.years[0]?.crop).not.toBe("corn");
  });

  it("produces trend-tested climate indicators and facts", () => {
    expect(res.climate.indicators.length).toBeGreaterThanOrEqual(6);
    for (const ind of res.climate.indicators) {
      expect(ind.values).toHaveLength(35);
      expect(Number.isFinite(ind.trend.pValue)).toBe(true);
    }
    expect(res.facts.some((f) => f.kind === "climate")).toBe(true);
    expect(res.facts.some((f) => f.id === "history")).toBe(true);
    expect(res.explanation.speech.length).toBeGreaterThan(50);
    expect(res.explanation.sms.length).toBeLessThan(320);
  });

  it("compares against the current pattern", () => {
    expect(res.currentPractice).not.toBeNull();
    expect(res.currentPractice!.years.map((y) => y.crop)).toEqual(["soybean", "corn", "soybean"]);
  });

  it("prints a readable summary", () => {
    console.log(res.explanation.summary);
    for (const p of res.plans) console.log(p.label, p.years.map((y) => y.coverName).join("/"), JSON.stringify(p.scores), p.avgNetReturnPerAcre);
    console.log("current", res.currentPractice?.label, JSON.stringify(res.currentPractice?.scores));
    for (const i of res.climate.indicators) console.log(i.id, i.mean, i.changePerDecade, i.trend.pValue.toFixed(3), i.trend.verdict);
  });
});

describe("priorities change the answer", () => {
  it("soil priority yields at least as high a soil score as profit priority", () => {
    const mk = (priority: "soil" | "profit") =>
      buildPlan({ request: { lat: 42, lon: -93.6, irrigated: false, priority }, climate, soil, cropHistory: cornHeavy, county: null, planStartYear: 2027, now }).plans[0]!;
    expect(mk("soil").scores.soil).toBeGreaterThanOrEqual(mk("profit").scores.soil);
  });
});

describe("helpers", () => {
  it("infers corn-soy alternation", () => {
    expect(currentPracticeSequence(["soybean", "corn"])).toEqual(["soybean", "corn", "soybean"]);
    expect(currentPracticeSequence(["corn", "corn"])).toEqual(["corn", "corn", "corn"]);
  });
  it("penalises continuous corn in soil score", () => {
    expect(soilHealthScore(["corn", "corn", "corn"], ["none", "none", "none"], ["corn"])).toBeLessThan(
      soilHealthScore(["soybean", "corn", "oats"], ["cereal_rye", "none", "crimson_clover"], ["corn"]),
    );
  });
  it("counts a fallow season against soil health and not as crop diversity", () => {
    expect(soilHealthScore(["fallow", "winter_wheat", "sorghum"], ["none", "none", "none"], [])).toBeLessThan(
      soilHealthScore(["soybean", "winter_wheat", "sorghum"], ["none", "none", "none"], []),
    );
  });
});

// Real NASA POWER daily data, Finney County, Kansas grid cell (semi-arid High Plains, ~22 in rain/yr).
const ksClimate = parsePower(JSON.parse(readFileSync(new URL("./fixtures/power-finney-county-ks.json", import.meta.url), "utf8")) as PowerResponse);
// Real SSURGO values for Richfield silt loam near Garden City, KS.
const ksSoil: SoilProfile = {
  available: true,
  source: "USDA NRCS SSURGO",
  mapUnitName: "Richfield silt loam, 0 to 1 percent slopes",
  drainageClass: "Well drained",
  ph: 7.3,
  organicMatterPct: 1.6,
  awc: 0.21,
  profileDepthCm: 200,
};
const ksCounty = { countyFips: "20055", countyName: "Finney County", stateCode: "KS", stateName: "Kansas" };
const ksPlan = (irrigated: boolean, recentCrops: ("winter_wheat" | "fallow" | "corn")[]) =>
  buildPlan({
    request: { lat: 38.11, lon: -100.71, irrigated, priority: "balanced", recentCrops },
    climate: ksClimate,
    soil: ksSoil,
    cropHistory: { available: false, source: "test", years: [] },
    county: ksCounty,
    planStartYear: 2027,
    now,
  });
/** Highest yield of a crop across the shown plans (e.g. an established alfalfa year, not the seeding year). */
const yieldOf = (p: ReturnType<typeof ksPlan>, crop: string) =>
  Math.max(...[...p.plans, ...(p.currentPractice ? [p.currentPractice] : [])].flatMap((r) => r.years).filter((y) => y.crop === crop).map((y) => y.expectedYield));

describe("dry rain-fed Plains field (real Kansas data)", () => {
  const dry = ksPlan(false, ["winter_wheat", "winter_wheat"]);
  const wet = ksPlan(true, ["corn", "corn"]);

  it("offers fallow on a dry rain-fed field, but not when irrigated or in the Corn Belt", () => {
    expect(dry.plans.some((p) => p.years.some((y) => y.crop === "fallow"))).toBe(true);
    expect(wet.plans.some((p) => p.years.some((y) => y.crop === "fallow"))).toBe(false);
    const ia = buildPlan({ request: { lat: 42, lon: -93.6, irrigated: false, priority: "balanced" }, climate, soil, cropHistory: cornHeavy, county: null, planStartYear: 2027, now });
    expect(ia.plans.some((p) => p.years.some((y) => y.crop === "fallow"))).toBe(false);
  });

  it("does not recommend rain-fed alfalfa for three years on 22 inches of rain", () => {
    const top = dry.plans[0]!.years.map((y) => y.crop);
    expect(top).not.toEqual(["alfalfa", "alfalfa", "alfalfa"]);
  });

  it("gives realistic rain-fed yields, well below irrigated ones", () => {
    const wheatAfterFallow = dry.plans.flatMap((p) => p.years.filter((y, i) => y.crop === "winter_wheat" && p.years[i - 1]?.crop === "fallow"))[0];
    expect(wheatAfterFallow?.expectedYield).toBeGreaterThan(35);
    expect(wheatAfterFallow?.expectedYield).toBeLessThan(60);
    const irrigatedAlfalfa = yieldOf(wet, "alfalfa");
    expect(irrigatedAlfalfa).toBeGreaterThan(4);
  });

  it("carries soil water between seasons: continuous wheat yields less than wheat after fallow", () => {
    const cont = dry.currentPractice!;
    expect(cont.years.map((y) => y.crop)).toEqual(["winter_wheat", "winter_wheat", "winter_wheat"]);
    const contWheat = cont.years[1]!.expectedYield;
    const fallowWheat = dry.plans.flatMap((p) => p.years.filter((y, i) => y.crop === "winter_wheat" && p.years[i - 1]?.crop === "fallow"))[0]!.expectedYield;
    expect(contWheat).toBeLessThan(fallowWheat * 0.75);
  });

  it("recognises an existing wheat-fallow system as the current practice", () => {
    const wf = ksPlan(false, ["fallow", "winter_wheat"]);
    expect(wf.currentPractice!.years.map((y) => y.crop)).toEqual(["fallow", "winter_wheat", "fallow"]);
  });
});
