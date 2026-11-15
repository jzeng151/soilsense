import { describe, expect, it } from "vitest";
import { buildExplanation } from "../src/engine/explain";
import type { ClimateSummary, RotationPlan } from "../src/shared/types";

const climate = { firstYear: 1991, lastYear: 2025, indicators: [] } as unknown as ClimateSummary;
const base = { currentPractice: null, climate, facts: [], priority: "balanced" as const };
describe("language-aware engine explanation", () => {
  it("localizes the no-plan result while preserving the English default", () => {
    expect(buildExplanation({ ...base, plans: [] }).summary).toBe("No feasible rotation found.");
    const es = buildExplanation({ ...base, plans: [], language: "es" });
    expect(es.summary).toBe("No se encontró una rotación viable.");
    expect(es.speech).toContain("No pude preparar un plan");
    expect(es.sms).toContain("no hay un plan disponible");
  });
  it("uses agricultural crop and winter-cover names in Spanish summaries", () => {
    const plan = { years: [{ year: 2027, crop: "sorghum", cover: "cereal_rye" }, { year: 2028, crop: "fallow", cover: "none" }], coverYears: 1 } as RotationPlan;
    const es = buildExplanation({ ...base, plans: [plan], language: "es" });
    expect(es.summary).toContain("sorgo de grano en 2027 con centeno como cobertura invernal");
    expect(es.summary).toContain("barbecho (sin cultivo) en 2028");
    expect(es.sms).toContain("agente de extensión");
  });
});
