import { describe, expect, it } from "vitest";
import { compactPlan } from "../src/worker/routes/scout";
import { buildPlan } from "../src/engine/plan";
import { finneyInputs } from "./helpers/finney";
import { FertilizerEvidence } from "../src/worker/fertilizerFacts";
import { checkedCitationStream } from "../src/worker/research/chatStream";
import { ChatResearch } from "../src/worker/research/chat";
import type { PlanFertilizer } from "../src/shared/fertilizer";
import type { UIMessageChunk } from "ai";
const guide: PlanFertilizer = { planId: "finney-example", assumptions: [], disclaimer: "Not a prescription; confirm with your agronomist.", years: [{ year: 2027, crop: "corn", expectedYield: 150, yieldUnit: "bu/acre", recs: [{ nutrient: "N", lbPerAcre: 150, basis: "formula", inputsUsed: { expectedYield: 150 }, notes: [], source: { doc: "MF2586", page: "5" } }] }] };
describe("fertilizer facts in chat", () => {
  it("passes actual Finney crop-year guideline facts through Scout's existing plan tool without mutating the plan", () => {
    const response = buildPlan(finneyInputs);
    const before = JSON.stringify(response);
    const evidence = new FertilizerEvidence();
    const compact = compactPlan(response, evidence);
    expect(compact.rankedPlans).toHaveLength(response.plans.length);
    for (const plan of compact.rankedPlans) {
      expect(plan.fertilizerFacts.some(f => f.id.includes("-N-") && f.text.includes("expected yield"))).toBe(true);
      expect(plan.fertilizerFacts.some(f => f.text.includes("soil test needed") && f.text.includes("cropRemovalLbPerAcre"))).toBe(true);
      expect(plan.fertilizerFacts.every(f => evidence.validate(`[${f.citationId}]`).invalid.length === 0)).toBe(true);
    }
    expect(JSON.stringify(response)).toBe(before);
  });
  it("registers nutrient inputs, source pages and credited product options with stable ids", () => {
    const evidence = new FertilizerEvidence();
    const facts = evidence.add(guide);
    expect(facts[0]).toMatchObject({ citationId: "G1", id: "fertilizer-finney-example-2027-N-0", source: "K-State MF2586 p. 5" });
    expect(facts[0]?.text).toContain('"expectedYield":150');
    expect(facts[0]?.text).toContain("Not a prescription");
    expect(facts.some(f => f.text.includes("182.9 lb product/acre"))).toBe(true);
    expect(evidence.add(guide)).toEqual(facts);
    expect(evidence.validate("Use [G1], not [G999]")).toEqual({ facts: [facts[0]], invalid: ["G999"] });
    expect(new FertilizerEvidence().validate("Prior client history [G1]").invalid).toEqual(["G1"]);
  });
  it("emits only registered cited guideline links and warns about invented citation ids", async () => {
    const evidence = new FertilizerEvidence(); evidence.add(guide);
    const input = new ReadableStream<UIMessageChunk>({ start(c) { c.enqueue({ type: "text-delta", id: "answer", delta: "See [G1] and [G999]." }); c.enqueue({ type: "finish" }); c.close(); } });
    const reader = checkedCitationStream(input, new ChatResearch({}), undefined, evidence).getReader();
    const chunks: UIMessageChunk[] = [];
    for (;;) { const next = await reader.read(); if (next.done) break; chunks.push(next.value); }
    expect(chunks.some(c => c.type === "source-url" && c.sourceId === "G1" && c.url.includes("MF2586"))).toBe(true);
    expect(chunks.some(c => c.type === "source-url" && c.sourceId === "G999")).toBe(false);
    expect(chunks.some(c => c.type === "text-delta" && c.delta.includes("Citation warning: [G999]"))).toBe(true);
  });
});
