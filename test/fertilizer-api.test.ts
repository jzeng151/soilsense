import { expect, it, vi, beforeEach } from "vitest";
import { buildPlan } from "../src/engine/plan";
import { finneyInputs } from "./helpers/finney";
import { withFertilizer } from "../src/engine/fertilizer";
import { writeFileSync } from "node:fs";
import { makePlan } from "../src/worker/service";
import { api, validatePlanRequest } from "../src/worker/routes/api";
vi.mock("../src/worker/service", async (importOriginal) => ({ ...await importOriginal<typeof import("../src/worker/service")>(), makePlan: vi.fn(), logPlan: vi.fn(async () => {}) }));
const ctx = { waitUntil: () => {}, passThroughOnException: () => {}, props: {} } as unknown as ExecutionContext;
const baseline = buildPlan(finneyInputs);
it("checks the recorded Finney 2028 corn example against an independent p5 worked calculation", () => {
  const enriched = withFertilizer(baseline);
  const corn = enriched.plans[0]!.fertilizer!.years.find(y => y.crop === "corn")!;
  expect(corn.year).toBe(2028);
  expect(corn.expectedYield).toBe(202);
  expect(corn.recs.find(r => r.nutrient === "N")!.lbPerAcre).toBe(206.4);
  expect(corn.recs.find(r => r.nutrient === "P2O5")!.inputsUsed.cropRemovalLbPerAcre).toBeCloseTo(66.66);
  expect(corn.recs.find(r => r.nutrient === "K2O")!.inputsUsed.cropRemovalLbPerAcre).toBeCloseTo(52.52);
  expect(corn.recs.find(r => r.nutrient === "S")!.lbPerAcre).toBe(11.4);
  if (process.env.FERTILIZER_EVIDENCE_PATH) {
    const current = buildPlan({ ...finneyInputs, now: new Date() });
    writeFileSync(process.env.FERTILIZER_EVIDENCE_PATH, JSON.stringify(current, null, 2));
  }
});
const post = (body: unknown) => ({ method: "POST", headers: { "Content-Type": "application/json", "CF-Connecting-IP": "fertilizer-test" }, body: JSON.stringify(body) });
beforeEach(() => { vi.mocked(makePlan).mockResolvedValue(baseline); });
it("returns byte-identical serialized Finney response by default, optional only with includeFertilizer", async () => {
  const before = JSON.stringify(baseline);
  const ordinary = await api.request("/plan", post(finneyInputs.request), {}, ctx);
  expect(ordinary.status).toBe(200);
  expect(await ordinary.text()).toBe(before);
  const optedIn = await api.request("/plan", post({ ...finneyInputs.request, includeFertilizer: true }), {}, ctx);
  const enriched = await optedIn.json() as typeof baseline;
  expect(enriched.plans.every(p => !!p.fertilizer)).toBe(true);
  expect(enriched.currentPractice?.fertilizer).toBeDefined();
  expect(JSON.stringify({ ...enriched, plans: enriched.plans.map(({ fertilizer, ...p }) => p), currentPractice: enriched.currentPractice ? (({ fertilizer, ...p }) => p)(enriched.currentPractice) : null })).toBe(before);
  expect(JSON.stringify(baseline)).toBe(before);
  expect(vi.mocked(makePlan).mock.calls[0]?.[1]).toEqual(vi.mocked(makePlan).mock.calls[1]?.[1]);
});
it("validates laboratory values and opt-in flag at the request seam", () => {
  expect(validatePlanRequest({ ...finneyInputs.request, includeFertilizer: "true" })).toBe("includeFertilizer must be boolean");
  expect(typeof validatePlanRequest({ ...finneyInputs.request, soilTest: { mehlich3P: -1 } })).toBe("string");
  expect(validatePlanRequest({ ...finneyInputs.request, soilTest: { mehlich3P: 0, extractableK: 130, pkProgram: "build-maintenance" } })).toMatchObject({ soilTest: { mehlich3P: 0, extractableK: 130, pkProgram: "build-maintenance" } });
});
it("laboratory fertilizer values cannot alter Finney rankings, yields, costs, or nitrogen accounting", () => {
  const measured = buildPlan({ ...finneyInputs, request: { ...finneyInputs.request, soilTest: { mehlich3P: 5, extractableK: 20, bufferPh: 6.5, profileNitrateLbPerAcre: 100, nApplication: "injected-or-split", pkProgram: "build-maintenance" } } });
  expect(measured.plans).toEqual(baseline.plans);
  expect(measured.currentPractice).toEqual(baseline.currentPractice);
});
