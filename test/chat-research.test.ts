import { describe, expect, it, vi } from "vitest";
import { ChatResearch, appendResearchUrls } from "../src/worker/research/chat";
import { CORPUS, EMBEDDING, MAX_PASSAGES, SOURCES_BY_ID } from "../src/worker/research/config";
import { defaultVoiceSettings, LOCKED_RULES, normalizeVoiceSettings, VOICE_TOOLS } from "../src/worker/voiceSettings";

describe("chat research boundary", () => {
  it("returns bounded verbatim passages, stable ids, full sources and validates only returned ids", async () => {
    const chunk = CORPUS.chunks.find(c => c.crops.includes("corn"))!;
    const run = vi.fn(async () => ({ data: [new Array(EMBEDDING.dimensions).fill(0)] }));
    const query = vi.fn(async () => ({ matches: [{ id: chunk.id, score: 0.9 }] }));
    const session = new ChatResearch({ ai: { run }, index: { query } });
    const result = await session.search({ question: "corn rotation", crops: ["corn"] });
    expect(result.status).toBe("live");
    expect(result.passages.length).toBeLessThanOrEqual(MAX_PASSAGES);
    expect(result.passages[0]).toMatchObject({ citationId: "R1", chunkId: chunk.id, text: chunk.text, publisher: SOURCES_BY_ID.get(chunk.sourceId)!.publisher });
    expect(result.passages[0]?.sourceUrl).toMatch(/^https:\/\//);
    expect(result.passages[0]?.applicability).toBeTruthy();
    expect((await session.search({ question: "corn rotation", crops: ["corn"] })).passages[0]?.citationId).toBe("R1");
    expect(session.validate("Evidence [R1], repeated [R1], invented [R999].")).toMatchObject({ valid: ["R1"], invalid: ["R999"] });
    expect(session.validate("[R1]").invalid).toEqual([]);
    expect(new ChatResearch({}).validate("[R1]").invalid).toEqual(["R1"]);
    expect(query.mock.calls.length).toBe(2);
  });

  it("returns explicit empty and unavailable results without inventing passages", async () => {
    const session = new ChatResearch({});
    expect(await session.search({ question: "corn" })).toMatchObject({ status: "unavailable", passages: [], reason: expect.stringMatching(/bindings/) });
    const low = new ChatResearch({ ai: { run: async () => ({ data: [new Array(768).fill(0)] }) }, index: { query: async () => ({ matches: [] }) } });
    expect(await low.search({ question: "corn", crops: ["corn"] })).toMatchObject({ status: "empty", passages: [], reason: "no applicable passage matched" });
    expect(low.validate("[R1]").invalid).toEqual(["R1"]);
  });

  it("converts split-model citation text to source-name speech and only texts cited URLs", async () => {
    const chunk = CORPUS.chunks[0]!;
    const session = new ChatResearch({ ai: { run: async () => ({ data: [new Array(768).fill(0)] }) }, index: { query: async () => ({ matches: [{ id: chunk.id, score: 0.9 }] }) } });
    const result = await session.search({ question: "rotation", crops: chunk.crops });
    expect(session.citedPassages()).toEqual([]);
    const speech = session.forSpeech("Research says this [R1]. Unknown [R99].");
    expect(speech.text).toContain(`according to ${result.passages[0]!.publisher}`);
    expect(speech.text).not.toMatch(/\[R\d+\]/);
    expect(speech.invalid).toEqual(["R99"]);
    const sms = appendResearchUrls("SoilSense plan", session.citedPassages());
    expect(sms).toContain(result.passages[0]!.sourceUrl);
    expect(sms).not.toContain("R99");
    expect(appendResearchUrls("Plan", [])).toBe("Plan");
    expect(appendResearchUrls("x".repeat(1600), session.citedPassages()).length).toBeLessThanOrEqual(1600);
    expect(appendResearchUrls("x".repeat(1600), session.citedPassages())).toContain(result.passages[0]!.sourceUrl);
  });

  it("bounds a hung retrieval and clears the timeout without fabricating citations", async () => {
    vi.useFakeTimers();
    try {
      const session = new ChatResearch({ ai: { run: () => new Promise(() => {}) }, index: { query: async () => ({ matches: [] }) } });
      const pending = session.search({ question: "corn", crops: ["corn"] });
      await vi.advanceTimersByTimeAsync(12_000);
      expect(await pending).toMatchObject({ status: "unavailable", passages: [], reason: expect.stringMatching(/timed out/) });
      expect(vi.getTimerCount()).toBe(0);
      expect(session.validate("[R1]").invalid).toEqual(["R1"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("makes search editable and enabled for default and stale voice settings, with locked citation rules", () => {
    expect(VOICE_TOOLS.find(t => t.name === "search_research")).toBeTruthy();
    expect(defaultVoiceSettings().tools.search_research.enabled).toBe(true);
    expect(normalizeVoiceSettings({ tools: {} }).tools.search_research.enabled).toBe(true);
    expect(normalizeVoiceSettings({ tools: { search_research: { description: "Find evidence" } } }).tools.search_research.description).toBe("Find evidence");
    expect(LOCKED_RULES).toContain("search_research");
    expect(LOCKED_RULES).toContain("[R1]");
    expect(LOCKED_RULES).toContain("dataset");
  });
});
