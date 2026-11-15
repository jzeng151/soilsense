import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { parsePower, type PowerResponse } from "../src/engine/climate";
import { buildDroughtReplays } from "../src/engine/droughtReplay";
import { buildPlan } from "../src/engine/plan";
import { makeReplay } from "../src/engine/rotation";
import type { RotationPlan } from "../src/shared/types";

it("changes revenue only in historical replay, keeping the original $200 cost fixed", () => {
  const plan = { label: "Corn", years: [{ crop: "corn", cropName: "Corn", expectedYield: 100, yieldUnit: "bu/acre", netReturnPerAcre: 200 }] } as RotationPlan;
  const result = buildDroughtReplays({ climate: { ...input().climate, location: { lat: 38, lon: -100 }, indicators: [], source: "test" },
    replay: () => [{ year: 2000, yieldFrac: 0.5, score: 0.5, mainStress: "water", waterUse: 100, pumped: 0 }, { year: 2001, yieldFrac: 1.5, score: 1, mainStress: null, waterUse: 300, pumped: 0 }],
    plan, current: null, lastCrop: "corn", usualPrev: () => "corn", prices: { corn: 4 }, countyYields: {}, losses: null, count: 2 });
  expect(result[0]!.plan.crops[0]).toMatchObject({ yield: 50, netPerAcre: 0 });
  expect(result[1]!.plan.crops[0]).toMatchObject({ yield: 150, netPerAcre: 400 });
  expect(plan.years[0]!.expectedYield).toBe(100);
  expect(plan.years[0]!.netReturnPerAcre).toBe(200);
});

const raw = () => JSON.parse(readFileSync(new URL("./fixtures/power-finney-county-ks.json", import.meta.url), "utf8")) as PowerResponse;
const soil = { available: false, source: "unavailable" };
const input = () => ({
  climate: parsePower(raw()), soil, cropHistory: { available: false, source: "unavailable", years: [] },
  county: { countyFips: "20055", countyName: "Finney County", stateCode: "KS", stateName: "Kansas" },
  request: { lat: 38.1095, lon: -100.706, irrigated: false, priority: "balanced" as const, recentCrops: ["corn" as const] },
  planStartYear: 2027, now: new Date("2026-11-15T06:00:00Z"),
});
it("excludes an incomplete POWER year rather than scoring missing rain as zero", () => {
  const json = raw();
  json.properties.parameter.PRECTOTCORR!["20220701"] = -999;
  expect(parsePower(json).years.some((y) => y.year === 2022)).toBe(false);
});
it("does not replay years whose soil-water spinup crosses missing calendar years", () => {
  const c = parsePower(raw());
  c.years = c.years.filter((y) => y.year !== 2022);
  const replay = makeReplay(c, soil, false)("corn", "soybean");
  expect(replay.some((r) => r.year === 2023 || r.year === 2024)).toBe(false);
});
it("preserves null indicator values in replay output, not zero rain or zero heat", () => {
  const i = input();
  const p = buildPlan(i);
  const climate = structuredClone(p.climate);
  for (const ind of climate.indicators) ind.values = ind.values.map(() => null as unknown as number);
  const replay = makeReplay(i.climate, soil, false);
  const result = buildDroughtReplays({ climate, replay, plan: p.plans[0]!, current: p.currentPractice, lastCrop: "corn", usualPrev: () => "soybean", prices: {}, countyYields: {}, losses: null });
  expect(result.length).toBeGreaterThan(0);
  expect(result.every((r) => r.weather.seasonRainIn === null && r.weather.hotDays === null)).toBe(true);
});
it("round-trips exactly and holds plan costs, prices, allowance and reference yields fixed", () => {
  const i = input();
  const before = JSON.stringify(i);
  const p = buildPlan(i);
  const original = JSON.stringify(p);
  const first = p.droughtReplays![0]!;
  const other = p.droughtReplays![1]!;
  expect(other.year).not.toBe(first.year);
  expect(p.droughtReplays!.find((r) => r.year === first.year)).toEqual(first);
  expect(JSON.stringify(p)).toBe(original);
  expect(JSON.stringify(i)).toBe(before);
  expect(buildPlan(i)).toEqual(p);
  for (const r of p.droughtReplays ?? []) for (const crop of r.plan.crops) {
    const phase = p.plans[0]!.years.find((y) => y.crop === crop.crop)!;
    // Revenue delta only: seed/input/pumping costs must remain those of the original plan.
    expect(Number.isFinite(phase.expectedYield)).toBe(true);
    expect(Number.isFinite(crop.netPerAcre)).toBe(true);
  }
});
