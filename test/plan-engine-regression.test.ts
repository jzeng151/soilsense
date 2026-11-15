import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { finneyInputs } from "./helpers/finney";
import { buildPlan } from "../src/engine/plan";
import { buildWaterContext, evaluateCropClimate, PRIORITY_WEIGHTS, runEngine } from "../src/engine/rotation";
import type { Priority } from "../src/shared/types";

const priorities: Priority[] = ["balanced", "profit", "soil", "risk"];
const before = JSON.parse(readFileSync(new URL("./fixtures/plan-finney-before.json", import.meta.url), "utf8")) as { irrigated: boolean; priority: Priority; plans: unknown[]; currentPractice: unknown; waterOptions: unknown }[];

describe("Finney planner regression (real NASA POWER 1991–2025 and captured USDA prices/yields)", () => {
  it.each(before)("preserves the true winner, first alternative, baseline and water comparison: $irrigated/$priority", (row) => {
    const plan = buildPlan({ ...finneyInputs, request: { ...finneyInputs.request, irrigated: row.irrigated, priority: row.priority } });
    expect(plan.plans.slice(0, 2)).toEqual(row.plans.slice(0, 2));
    expect(plan.currentPractice).toEqual(row.currentPractice);
    expect(plan.waterOptions).toEqual(row.waterOptions);
  });
  it("offers a different first crop among the alternatives without changing the winning plan", () => {
    for (const priority of priorities) {
      const plan = buildPlan({ ...finneyInputs, request: { ...finneyInputs.request, priority } });
      expect(plan.plans[0]!.years.map((y) => y.crop)).toEqual(["soybean", "corn", "soybean"]);
      expect(plan.plans[0]!.scores.total).toBeGreaterThanOrEqual(plan.plans[1]!.scores.total);
      expect(new Set(plan.plans.map((p) => p.years[0]!.crop)).size).toBeGreaterThan(1);
      expect(plan.plans[2]!.notes.join(" ")).toContain("different first-crop alternative");
      expect(plan.plans[2]!.years.every((y) => y.reliability >= 0.4)).toBe(true);
      const w = PRIORITY_WEIGHTS[priority];
      const s = plan.plans[0]!.scores;
      expect(s.total).toBeCloseTo(w.climate * s.climate + w.reliability * s.reliability + w.soil * s.soil + w.profit * s.profit, 2);
    }
  });
  it("never breaks crop availability or continuous-crop rules just to diversify the first year", () => {
    const result = runEngine({
      cropClimate: evaluateCropClimate(finneyInputs.climate, finneyInputs.soil, true, 2028),
      water: buildWaterContext(finneyInputs.climate, finneyInputs.soil, true),
      history: ["corn", "corn"], crops: ["corn", "soybean"], priority: "balanced", planStartYear: 2027, firstYearWheatAllowed: false,
    });
    expect(result.plans.length).toBeGreaterThan(0);
    expect(result.plans.every((p) => p.years[0]!.crop === "soybean")).toBe(true);
    expect(result.plans.flatMap((p) => p.years).every((y) => ["corn", "soybean"].includes(y.crop))).toBe(true);
  });
  it("soil priority changes covers and the soil/profit tradeoff even when the main crops stay optimal", () => {
    const run = (priority: Priority) => buildPlan({ ...finneyInputs, request: { ...finneyInputs.request, priority } }).plans[0]!;
    const soil = run("soil");
    const profit = run("profit");
    expect(soil.label).toBe(profit.label);
    expect(soil.scores.soil).toBeGreaterThan(profit.scores.soil);
    expect(soil.avgNetReturnPerAcre).toBeLessThan(profit.avgNetReturnPerAcre);
    expect(soil.years.map((y) => y.cover)).not.toEqual(profit.years.map((y) => y.cover));
  });
});
