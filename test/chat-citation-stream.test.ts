import { describe, expect, it, vi } from "vitest";
import type { UIMessageChunk } from "ai";
import { ChatResearch } from "../src/worker/research/chat";
import { checkedCitationStream } from "../src/worker/research/chatStream";
import { makeTools } from "../src/worker/routes/scout";
import { CORPUS } from "../src/worker/research/config";

function fixtureResearch() {
  const chunk = CORPUS.chunks[0]!;
  const research = new ChatResearch({
    ai: { run: async () => ({ data: [new Array(768).fill(0)] }) },
    index: { query: async () => ({ matches: [{ id: chunk.id, score: 0.9 }] }) },
  });
  return { research, chunk };
}

async function collect(research: ChatResearch, text: string) {
  const parts: UIMessageChunk[] = [
    { type: "start", messageId: "fixture" },
    { type: "text-start", id: "answer" },
    // Deliberately split a citation id across stream tokens.
    { type: "text-delta", id: "answer", delta: text.slice(0, 12) },
    { type: "text-delta", id: "answer", delta: text.slice(12) },
    { type: "text-end", id: "answer" },
    { type: "source-url", sourceId: "invented", url: "https://example.invalid", title: "Invented model source" },
    { type: "finish" },
  ];
  const out: UIMessageChunk[] = [];
  const reader = checkedCitationStream(new ReadableStream({ start(c) { parts.forEach(p => c.enqueue(p)); c.close(); } }), research).getReader();
  for (;;) { const next = await reader.read(); if (next.done) break; out.push(next.value); }
  return out;
}

describe("Sprout citation stream enforcement", () => {
  it("emits verified links, quotes and an explicit warning before finish; drops invented model sources", async () => {
    const { research, chunk } = fixtureResearch();
    await research.search({ question: "rotation", crops: chunk.crops });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const out = await collect(research, "Claim here [R1]. Bad [R99].");
    const sources = out.filter(p => p.type === "source-url");
    expect(sources).toEqual([expect.objectContaining({ sourceId: "R1", url: expect.stringMatching(/^https:/), title: expect.stringContaining("[R1]") })]);
    expect(out.some(p => p.type === "text-delta" && p.delta.includes("Citation warning: [R99]"))).toBe(true);
    expect(out.find(p => p.type === "data-research-citations")).toMatchObject({ data: { invalid: ["R99"], passages: [expect.objectContaining({ text: chunk.text, citationId: "R1" })] } });
    expect(out.at(-1)?.type).toBe("finish");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("R99"));
    warn.mockRestore();
  });

  it("does not accept client-history ids or emit phantom sources when retrieval is unavailable", async () => {
    const out = await collect(new ChatResearch({}), "Unknown [R1]");
    expect(out.filter(p => p.type === "source-url")).toEqual([]);
    expect(out.find(p => p.type === "data-research-citations")).toMatchObject({ data: { invalid: ["R1"], passages: [] } });
  });

  it("registers the real web tool and emits its explicit unavailable state", async () => {
    const research = new ChatResearch({});
    const writes: unknown[] = [];
    const writer = { write: (part: unknown) => { writes.push(part); } };
    const tools = makeTools({}, writer as Parameters<typeof makeTools>[1], research);
    const result = await tools.search_research.execute!({ question: "corn", crops: ["corn"] }, { toolCallId: "fixture", messages: [], context: {} });
    expect(result).toMatchObject({ status: "unavailable", passages: [] });
    expect(writes).toEqual([expect.objectContaining({ type: "data-research-status", data: expect.objectContaining({ status: "unavailable", reason: expect.any(String) }) })]);
  });
});
