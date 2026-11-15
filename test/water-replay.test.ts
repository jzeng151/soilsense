// Water levels (rain / limited / full), "bad years in 10" and the bad-year replay, on real data (offline fixtures).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { mergeDaymet, parsePower, type PowerResponse } from "../src/engine/climate";
import { buildPlan } from "../src/engine/plan";
import type { CountyLosses, CropId, LossGroup, PlanResponse, SoilProfile, WaterLevel, YieldRecord } from "../src/shared/types";
import { parseDaymetCsv } from "../src/worker/data/daymet";

const fx = (p: string) => readFileSync(new URL(`./fixtures/${p}`, import.meta.url), "utf8");
const nass = (f: string) => (JSON.parse(fx(`nass/${f}`)) as { records: YieldRecord[] }).records;
const losses = (stateFips: string, county: string): CountyLosses => {
  const f = JSON.parse(readFileSync(new URL(`../web/public/data/rma/${stateFips}.json`, import.meta.url), "utf8")) as { groups: LossGroup[]; years: number[]; counties: Record<string, CountyLosses["crops"]>; source: string };
  return { groups: f.groups, crops: f.counties[county]!, firstYear: Math.min(...f.years), lastYear: Math.max(...f.years), source: f.source };
};
const now = new Date("2026-11-14T17:00:00Z");

const ks = {
  climate: mergeDaymet(parsePower(JSON.parse(fx("power-finney-county-ks.json")) as PowerResponse), parseDaymetCsv(fx("daymet/daymet-finney-county-ks.csv"))).climate,
  soil: { available: true, source: "SSURGO", mapUnitName: "Richfield silt loam", drainageClass: "Well drained", ph: 7.3, organicMatterPct: 1.6, awc: 0.21, profileDepthCm: 200 } as SoilProfile,
  county: { countyFips: "20055", countyName: "Finney County", stateCode: "KS", stateName: "Kansas" },
  yieldHistory: { winter_wheat: nass("finney-ks-wheat-nonirrigated.json"), sorghum: nass("finney-ks-sorghum-nonirrigated.json") } as Partial<Record<CropId, YieldRecord[]>>,
  losses: losses("20", "055"),
};
const ia = {
  climate: mergeDaymet(parsePower(JSON.parse(fx("power-story-county-ia.json")) as PowerResponse), parseDaymetCsv(fx("daymet/daymet-story-county-ia.csv"))).climate,
  soil: { available: true, source: "SSURGO", mapUnitName: "Clarion loam", drainageClass: "Well drained", ph: 6.2, organicMatterPct: 3.5, awc: 0.19, profileDepthCm: 152 } as SoilProfile,
  county: { countyFips: "19169", countyName: "Story County", stateCode: "IA", stateName: "Iowa" },
  yieldHistory: { corn: nass("story-ia-corn-all.json"), soybean: nass("story-ia-soybean-all.json") } as Partial<Record<CropId, YieldRecord[]>>,
  losses: losses("19", "169"),
};

function plan(site: typeof ks, water: WaterLevel, recentCrops: CropId[]): PlanResponse {
  return buildPlan({
    request: { lat: 40, lon: -95, irrigated: water !== "rain", water, priority: "balanced", recentCrops },
    climate: site.climate,
    soil: site.soil,
    cropHistory: { available: false, source: "", years: [] },
    county: site.county,
    yieldHistory: site.yieldHistory,
    losses: site.losses,
    planStartYear: 2027,
    now,
  });
}

function describePlan(name: string, p: PlanResponse): string {
  const lines = [`\n== ${name} (water: ${p.water})`];
  for (const r of [...p.plans.slice(0, 1), ...(p.currentPractice ? [p.currentPractice] : [])])
    lines.push(`  ${r.label}: bad years ${r.badYearsIn10}/10, net $${r.avgNetReturnPerAcre}/acre/yr, pumped ${r.waterPumpedIn} in/yr`);
  for (const o of p.waterOptions ?? []) lines.push(`  option ${o.water.padEnd(7)}: ${o.bestLabel} | bad ${o.badYearsIn10}/10 | $${o.avgNetReturnPerAcre} | pumped ${o.waterPumpedIn} in`);
  for (const d of p.droughtReplays ?? [])
    lines.push(
      `  replay ${d.year}: rain ${d.weather.seasonRainIn} in (typical ${d.weather.typicalSeasonRainIn}) | now: ${d.current?.crops.map((c) => `${c.cropName} ${c.yield} ${c.pctVsTypical}% $${c.netPerAcre}`).join(", ") ?? "-"} | plan: ${d.plan.crops.map((c) => `${c.cropName} ${c.yield} ${c.pctVsTypical}% $${c.netPerAcre}`).join(", ")} | county: ${d.county.map((c) => `${c.cropName} ${c.actualPct}%`).join(", ") || "-"} | insurance: ${d.insurance.map((c) => `${c.cropName}: ${c.cause}`).join(", ") || "-"}`,
    );
  return lines.join("\n");
}

describe("water levels, bad years in 10, bad-year replay", () => {
  const ksRain = plan(ks, "rain", ["corn", "soybean"]);
  const ksLimited = plan(ks, "limited", ["corn", "soybean"]);
  const ksFull = plan(ks, "full", ["corn", "corn"]);
  const iaRain = plan(ia, "rain", ["soybean", "corn"]);

  it("prints the Kansas pivot and Iowa results", () => {
    console.log([describePlan("Finney KS, rain only", ksRain), describePlan("Finney KS, limited", ksLimited), describePlan("Finney KS, full", ksFull), describePlan("Story IA, rain only", iaRain)].join("\n"));
  });

  it("offers all three water levels with sensible pumping", () => {
    const opts = Object.fromEntries((ksRain.waterOptions ?? []).map((o) => [o.water, o]));
    expect(Object.keys(opts).sort()).toEqual(["full", "limited", "rain"]);
    expect(opts.rain!.waterPumpedIn).toBe(0);
    expect(opts.limited!.waterPumpedIn).toBeGreaterThan(0);
    expect(opts.limited!.waterPumpedIn).toBeLessThanOrEqual(10.5);
    expect(opts.full!.waterPumpedIn).toBeGreaterThan(opts.limited!.waterPumpedIn);
  });

  it("more water never means more bad years on a dry Plains field", () => {
    const b = Object.fromEntries((ksRain.waterOptions ?? []).map((o) => [o.water, o.badYearsIn10]));
    expect(b.full!).toBeLessThanOrEqual(b.limited!);
    expect(b.limited!).toBeLessThanOrEqual(b.rain!);
  });

  it("gives every plan a bad-years number from 0 to 10", () => {
    for (const p of [ksRain, ksLimited, ksFull, iaRain])
      for (const r of [...p.plans, ...(p.currentPractice ? [p.currentPractice] : [])]) {
        expect(r.badYearsIn10).toBeGreaterThanOrEqual(0);
        expect(r.badYearsIn10).toBeLessThanOrEqual(10);
      }
  });

  it("replays the field's own worst years, as history with county records", () => {
    for (const p of [ksRain, iaRain]) {
      const d = p.droughtReplays ?? [];
      expect(d.length).toBe(3);
      for (const r of d) {
        expect(r.year).toBeGreaterThanOrEqual(1991);
        expect(r.year).toBeLessThanOrEqual(2025);
        expect(r.plan.crops.length).toBeGreaterThan(0);
        expect(r.current).not.toBeNull();
      }
      // Worst years for the reference crop are at or below typical for that crop.
      expect(d.every((r) => (r.current?.crops[0]?.pctVsTypical ?? 0) <= 0)).toBe(true);
    }
  });
});
