import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createGoalScorer } from "../src/engine/goals";
import type { Goal, RotationPlan } from "../src/shared/types";
import { parsePower, type PowerResponse } from "../src/engine/climate";
import { buildWaterContext, evaluateCropClimate, runEngine, type EngineInput } from "../src/engine/rotation";

const climate = parsePower(JSON.parse(readFileSync(new URL("./fixtures/power-finney-county-ks.json", import.meta.url), "utf8")) as PowerResponse);
const soil = { available: true, source: "test", awc: 0.21, profileDepthCm: 200, ph: 7.3 };
const input: EngineInput = {
  cropClimate: evaluateCropClimate(climate, soil, true, 2028),
  water: buildWaterContext(climate, soil, true),
  history: ["corn"], priority: "balanced", planStartYear: 2027, firstYearWheatAllowed: false,
};

describe("optional farmer goals", () => {
  it("lets a lower-pumping plan overtake a slightly higher base score, with real numbers in its reason", () => {
    const base = runEngine(input).plans[0]!;
    const thirsty: RotationPlan = { ...base, id: "thirsty", waterPumpedIn: 12, waterUseIn: 20, scores: { ...base.scores, total: 0.7 } };
    const conserving: RotationPlan = { ...base, id: "conserving", waterPumpedIn: 6, waterUseIn: 14, scores: { ...base.scores, total: 0.65 } };
    const score = createGoalScorer([thirsty, conserving], ["water_conservation"], "full");
    expect(score(conserving).scores.total).toBeGreaterThan(score(thirsty).scores.total);
    expect(score(conserving).scores.goals?.[0]?.reason).toContain("6.0 in/yr");
    expect(score(conserving).scores.goalsBonus).toBe(0.1);
  });

  it("rewards legumes and lower fertilizer N after the engine's nitrogen credits", () => {
    const base = runEngine(input).plans[0]!;
    const annual: RotationPlan = { ...base, totalNitrogenLbPerAcre: 450, years: base.years.map((y) => ({ ...y, crop: "corn", cover: "none" })), scores: { ...base.scores, total: 0.7 } };
    const legume: RotationPlan = { ...base, totalNitrogenLbPerAcre: 0, years: base.years.map((y) => ({ ...y, crop: "soybean", cover: "none" })), scores: { ...base.scores, total: 0.65 } };
    const score = createGoalScorer([annual, legume], ["nitrogen_fixation"], "full");
    expect(score(legume).scores.total).toBeGreaterThan(score(annual).scores.total);
    expect(score(legume).scores.goals?.[0]?.reason).toContain("0 lb N/acre");
    expect(score(legume).scores.goals?.[0]?.reason).toContain("3 legume");
  });

  it.each(["erosion_control", "organic_matter"] as Goal[])("%s rewards covers, perennials and fewer bare seasons", (goal) => {
    const base = runEngine(input).plans[0]!;
    const bare: RotationPlan = { ...base, years: base.years.map((y) => ({ ...y, crop: "fallow", cover: "none" })), scores: { ...base.scores, total: 0.7 } };
    const protectedPlan: RotationPlan = { ...base, years: base.years.map((y, i) => ({ ...y, crop: i === 0 ? "winter_wheat" : "alfalfa", cover: i === 0 ? "cereal_rye" : "none" })), scores: { ...base.scores, total: 0.65 } };
    const score = createGoalScorer([bare, protectedPlan], [goal], "full");
    expect(score(protectedPlan).scores.total).toBeGreaterThan(score(bare).scores.total);
    expect(score(protectedPlan).scores.goals?.[0]?.reason).toContain("1 cover");
    expect(score(protectedPlan).scores.goals?.[0]?.reason).toContain("2 perennial");
    expect(score(protectedPlan).scores.goals?.[0]?.reason).toContain("proxy");
  });

  it("only gives a hay-market bonus when the farmer selects that market", () => {
    const base = runEngine(input).plans[0]!;
    const grain: RotationPlan = { ...base, years: base.years.map((y) => ({ ...y, crop: "corn" })), scores: { ...base.scores, total: 0.7 } };
    const hay: RotationPlan = { ...base, years: base.years.map((y) => ({ ...y, crop: "alfalfa" })), scores: { ...base.scores, total: 0.65 } };
    const score = createGoalScorer([grain, hay], ["forage_market"], "full");
    expect(score(hay).scores.total).toBeGreaterThan(score(grain).scores.total);
    expect(score(hay).scores.goals?.[0]?.reason).toContain("3 alfalfa/hay");
    expect(createGoalScorer([grain, hay], [], "full")(hay)).toEqual(hay);
    expect(score(hay).avgNetReturnPerAcre).toBe(hay.avgNetReturnPerAcre);
    expect(score(hay).years).toEqual(hay.years);
  });

  it("shares the +0.1 budget across two goals, and gives no bonus for ties", () => {
    const base = runEngine(input).plans[0]!;
    const a = { ...base, waterPumpedIn: 12, totalNitrogenLbPerAcre: 300 };
    const b = { ...base, waterPumpedIn: 4, totalNitrogenLbPerAcre: 0 };
    const score = createGoalScorer([a, b], ["water_conservation", "nitrogen_fixation"], "full");
    const result = score(b);
    expect(result.scores.goals).toHaveLength(2);
    for (const g of result.scores.goals!) expect(g.bonus).toBeLessThanOrEqual(0.05);
    expect(result.scores.goalsBonus).toBeLessThanOrEqual(0.1);
    expect(result.scores.priorityTotal).toBe(base.scores.total);
    expect(createGoalScorer([base, base], ["water_conservation"], "full")(base).scores.goalsBonus).toBe(0);
  });

  it("labels rain-only water use honestly, without claiming pumping savings", () => {
    const base = runEngine(input).plans[0]!;
    const a = { ...base, waterPumpedIn: 0, waterUseIn: 15 };
    const b = { ...base, waterPumpedIn: 0, waterUseIn: 10 };
    const score = createGoalScorer([a, b], ["water_conservation"], "rain");
    expect(score(b).scores.total).toBeGreaterThan(score(a).scores.total);
    const detail = score(b).scores.goals![0]!;
    expect(detail.metrics).toContainEqual({ label: "Modeled main-crop water use", value: 10, unit: "in/yr" });
    expect(detail.reason).toContain("no pumping savings");
    expect(detail.reason).toContain("water stress or fallow");
  });

  it.each(["water_conservation", "nitrogen_fixation", "erosion_control", "organic_matter", "forage_market"] as Goal[])("threads %s through candidate/cover selection without bypassing the reliability gate", (goal) => {
    const result = runEngine({ ...input, goals: [goal], quickSearch: 1 });
    expect(result.plans).toHaveLength(3);
    expect(result.evaluated).toBe(runEngine(input).evaluated);
    for (const plan of result.plans) {
      expect(plan.scores.goals?.map((g) => g.goal)).toEqual([goal]);
      expect(plan.scores.goalsBonus).toBeLessThanOrEqual(0.1);
      expect(plan.scores.goalsBonus).toBeGreaterThanOrEqual(0);
      expect(plan.waterUseIn).toBeGreaterThan(0);
      expect(plan.totalNitrogenLbPerAcre).toBe(plan.years.reduce((n, y) => n + y.nitrogenLbPerAcre, 0));
      expect(plan.notes.join(" ")).toContain("Goal bonus");
      expect(plan.years.every((y) => y.reliability >= 0.4)).toBe(true);
      if (goal !== "forage_market") expect(plan.scores.goals?.some((g) => g.goal === "forage_market")).toBe(false);
    }
    expect(result.currentPractice?.scores.goals?.[0]?.goal).toBe(goal);
  });

  it("does not turn missing simulated water use into zero water use", () => {
    const base = runEngine(input).plans[0]!;
    const known = { ...base, waterUseIn: 15 };
    const missing = { ...base, waterUseIn: undefined };
    const result = createGoalScorer([known, missing], ["water_conservation"], "rain")(missing);
    expect(result.scores.goalsBonus).toBe(0);
    expect(result.scores.goals?.[0]?.reason).toContain("unavailable");
    expect(result.scores.goals?.[0]?.metrics).toEqual([]);
  });

  it.each(["profit", "soil", "risk", "balanced"] as const)("keeps %s priority byte-equivalent when goals are empty", (priority) => {
    expect(JSON.stringify(runEngine({ ...input, priority, goals: [] }))).toBe(JSON.stringify(runEngine({ ...input, priority })));
  });

  it("preserves the pre-goals engine output exactly", () => {
    expect(runEngine(input)).toMatchSnapshot();
    expect(runEngine({ ...input, goals: [] })).toEqual(runEngine(input));
  });
});
