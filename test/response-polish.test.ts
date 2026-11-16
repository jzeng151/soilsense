import { expect, it } from "vitest";
import { INSTRUCTIONS, compactPlan, scout } from "../src/worker/routes/scout";
import { checkedCitationStream } from "../src/worker/research/chatStream";
import { ChatResearch } from "../src/worker/research/chat";
import type { UIMessageChunk } from "ai";
import { buildPrompt, validateOutput, type ExplainFact } from "../src/worker/research/explain";
import type { RotationPlan, PlanResponse } from "../src/shared/types";
import fixture from "./fixtures/plan-finney-default-rain.json";

it("reports live AI unavailable without bindings rather than fabricating a response", async () => {
  const status = await scout.request('/status', {}, {});
  expect(await status.json()).toMatchObject({ configured: false });
  const response = await scout.request('/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: [{ id: 'u', role: 'user', parts: [{ type: 'text', text: 'Why this rotation?' }] }] }) }, {});
  expect(response.status).toBe(503);
});

it("gives chat both modeled stress baselines and preserves exact fact IDs and sources", () => {
  const plan = fixture as unknown as PlanResponse;
  const compact = compactPlan(plan);
  expect(compact.rankedPlans[0]).toHaveProperty("badYearsIn10", plan.plans[0]!.badYearsIn10);
  expect(compact.currentPractice).toHaveProperty("badYearsIn10", plan.currentPractice!.badYearsIn10);
  expect(compact.facts[0]).toMatchObject({ id: plan.facts[0]!.id, text: plan.facts[0]!.text, source: plan.facts[0]!.source });
});

it("drops all reasoning stream chunks before they reach the browser", async () => {
  const parts = [
    { type: "reasoning-start", id: "r" }, { type: "reasoning-delta", id: "r", delta: "PRIVATE" }, { type: "reasoning-end", id: "r" },
    { type: "text-start", id: "t" }, { type: "text-delta", id: "t", delta: "Answer" }, { type: "text-end", id: "t" },
  ] as UIMessageChunk[];
  const stream = new ReadableStream<UIMessageChunk>({ start(c) { parts.forEach(p => c.enqueue(p)); c.close(); } });
  const result: UIMessageChunk[] = [];
  const reader = checkedCitationStream(stream, new ChatResearch({})).getReader();
  for (;;) { const next = await reader.read(); if (next.done) break; result.push(next.value); }
  expect(result).toEqual(parts.filter(p => p.type.startsWith("text-")));
});
it("signals an output-limit finish so the UI does not silently present truncated text", async () => {
  const stream = new ReadableStream<UIMessageChunk>({ start(c) { c.enqueue({ type: "finish", finishReason: "length" }); c.close(); } });
  const parts: UIMessageChunk[] = [];
  const reader = checkedCitationStream(stream, new ChatResearch({})).getReader();
  for (;;) { const next = await reader.read(); if (next.done) break; parts.push(next.value); }
  expect(parts).toContainEqual({ type: "data-answer-incomplete", data: true });
});
it("rejects an unsourced claim that rotation reduces bad years", () => {
  for (const narrative of ["This rotation reduces the frequency of bad years.", "This rotation has fewer crop failures."]) {
    expect(validateOutput({ rotationId: "demo", narrative, citations: [] }, "demo", [], []).ok).toBe(false);
  }
});
it("permits a risk comparison only when cited modeled stress values support it", () => {
  const facts = [{ id: "demo/bad_years", rotationId: "demo", value: 2 }, { id: "current/bad_years", rotationId: "current", value: 4 }] as ExplainFact[];
  const out = { rotationId: "demo", narrative: "The model shows fewer bad years: {{demo/bad_years}} versus {{current/bad_years}}.", citations: [] };
  expect(validateOutput(out, "demo", facts, []).ok).toBe(true);
  expect(validateOutput(out, "demo", facts.map(f => ({ ...f, value: 4 })), []).ok).toBe(false);
});
it("both explanation and chat prompts require plain language and qualify risk comparisons", () => {
  const prompt = buildPrompt({ id: "demo", label: "Sorghum → Fallow" } as RotationPlan, [], [], []).system;
  const scout = INSTRUCTIONS;
  for (const text of [prompt, scout]) {
    expect(text).toContain("modeled stress, not observed crop failures");
    expect(text).toContain("Do not claim fewer bad years");
    expect(text).toContain("plain language");
    expect(text).toContain("Unicode arrows");
  }
});
