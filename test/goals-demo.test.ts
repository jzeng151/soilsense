// Fixture-backed Kansas sanity check; no network, no substituted API results.
// Set GOALS_DEMO_OUTPUT to save the actual buildPlan responses for review/browser checks.
import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { comparisonKeyParts } from "../src/worker/research/explain";
import { parsePower, type PowerResponse } from "../src/engine/climate";
import { buildPlan, type PlanInputs } from "../src/engine/plan";
import { GOALS, type Goal, type PlanResponse, type WaterLevel } from "../src/shared/types";

const climate = parsePower(JSON.parse(readFileSync(new URL("./fixtures/power-finney-county-ks.json", import.meta.url), "utf8")) as PowerResponse);
const inputs: Omit<PlanInputs, "request"> = {
  climate,
  soil: { available: true, source: "Existing engine-test Richfield silt loam values (not a new soil fetch)", mapUnitName: "Richfield silt loam, 0 to 1 percent slopes", drainageClass: "Well drained", ph: 7.3, organicMatterPct: 1.6, awc: 0.21, profileDepthCm: 200 },
  cropHistory: { available: false, source: "Farmer input for fixture demo", years: [] },
  county: { countyFips: "20055", countyName: "Finney County", stateCode: "KS", stateName: "Kansas" },
  planStartYear: 2027,
  now: new Date("2026-11-15T15:00:00Z"),
};
const run = (water: WaterLevel, goals?: Goal[]) => buildPlan({ ...inputs, request: { lat: 38.1095, lon: -100.706, irrigated: water === "full", water, priority: "balanced", recentCrops: ["corn"], ...(goals === undefined ? {} : { goals }) } });

describe("Kansas farmer goals demo (real saved POWER weather)", () => {
  it("keeps empty-goal buildPlan output identical apart from the echoed input field", () => {
    for (const water of ["full", "rain"] as const) {
      const original = run(water);
      const empty = run(water, []);
      const { goals: _goals, ...request } = empty.request;
      expect({ ...empty, request }).toEqual(original);
    }
  });

  it("runs both water levels without goals and with each goal, retaining grounded breakdowns/reasons", () => {
    const rows: { water: WaterLevel; goal: Goal | "none"; response: PlanResponse }[] = [];
    for (const water of ["full", "rain"] as const) {
      for (const goal of ["none", ...GOALS] as const) {
        const response = run(water, goal === "none" ? undefined : [goal]);
        expect(response.plans).toHaveLength(3);
        if (goal !== "none") {
          expect(comparisonKeyParts(response, response.plans[0]!, [], "test").scenario).toContain(`goals=${goal}`);
          expect(response.facts.find((f) => f.id === `goal-${goal}`)?.text).toContain(response.plans[0]!.scores.goals![0]!.reason);
          for (const plan of response.plans) {
            expect(plan.scores.goals?.[0]?.goal).toBe(goal);
            expect(plan.scores.goalsBonus).toBeGreaterThanOrEqual(0);
            expect(plan.scores.goalsBonus).toBeLessThanOrEqual(0.1);
          }
        }
        rows.push({ water, goal, response });
      }
    }
    expect(rows).toHaveLength(12);
    if (process.env.GOALS_DEMO_OUTPUT) writeFileSync(process.env.GOALS_DEMO_OUTPUT, JSON.stringify(rows, null, 2));
  });
});
