import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";
import { generateText } from "ai";
import { aiUsage, generateAI, GENERATION_FALLBACK, googleModel, markdownAI, runAI, workersModel } from "../src/worker/lib/ai";
import { EMBEDDING, GENERATION, RETIRED_MODELS } from "../src/worker/research/config";
import { embed } from "../src/worker/research/retrieve";
import { admin } from "../src/worker/routes/admin";
import type { Env } from "../src/worker/env";

function database() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(readFileSync("migrations/0001_init.sql", "utf8"));
  const statement = (sql: string, args: unknown[] = []): unknown => ({
    bind: (...values: unknown[]) => statement(sql, values),
    all: async () => ({ results: sqlite.prepare(sql).all(...args as never[]) }),
    run: async () => { sqlite.prepare(sql).run(...args as never[]); return { success: true }; },
  });
  const db = { prepare: statement, batch: async (stmts: { run(): Promise<unknown> }[]) => Promise.all(stmts.map(s => s.run())) } as unknown as D1Database;
  return { db, sqlite };
}
afterEach(() => vi.useRealTimers());

describe("AI Gateway public adapters", () => {
  it("routes every query embedding through default gateway without caching or fallback", async () => {
    const ai = { run: vi.fn(async () => ({ data: [Array(768).fill(1)] })) };
    expect(await embed(ai, ["fixed query"])).toHaveLength(1);
    expect(ai.run).toHaveBeenCalledExactlyOnceWith(EMBEDDING.model, { text: ["fixed query"], pooling: "cls" }, expect.objectContaining({ gateway: expect.objectContaining({ id: "default", skipCache: true, retries: { maxAttempts: 1 }, metadata: expect.objectContaining({ feature: "research-query", model: EMBEDDING.model, cachePolicy: "no-cache" }) }) }));
    ai.run.mockRejectedValue(new Error("quota"));
    await expect(embed(ai, ["query"])).rejects.toThrow("quota");
    expect(ai.run).toHaveBeenCalledTimes(2);
  });

  it("caches corpus embeddings only, with a 24-hour TTL", async () => {
    const run = vi.fn(async () => ({ data: [Array(768).fill(1)] }));
    await embed({ run }, ["reviewed passage"], "my-gateway", { corpusEmbedding: true, feature: "document-embedding" });
    expect(run.mock.calls[0]).toEqual([EMBEDDING.model, expect.anything(), expect.objectContaining({ gateway: expect.objectContaining({ id: "my-gateway", skipCache: false, cacheTtl: 86400 }) })]);
  });

  it("uses one bounded generation fallback and preserves actual model provenance and correlation", async () => {
    const { db } = database();
    const run = vi.fn().mockRejectedValueOnce(new Error("rate limit")).mockResolvedValueOnce({ response: "ok" });
    expect(await generateAI({ run }, { messages: [] }, { feature: "test-generation", db })).toEqual({ output: { response: "ok" }, model: GENERATION_FALLBACK });
    expect(run.mock.calls.map(call => call[0])).toEqual([GENERATION.model, GENERATION_FALLBACK]);
    expect(RETIRED_MODELS).not.toContain(GENERATION_FALLBACK);
    expect(run.mock.calls[0]![2].gateway.metadata.correlationId).toBe(run.mock.calls[1]![2].gateway.metadata.correlationId);
    expect(await aiUsage(db)).toMatchObject({ available: true, features: [{ feature: "test-generation", calls: 2, failures: 1, fallbacks: 1 }] });
    // A fresh reader sees persisted records, not process counters.
    expect((await aiUsage(db)).features[0]!.p50LatencyMs).toBeGreaterThanOrEqual(0);
  });

  it("fails closed after exactly two generation failures", async () => {
    const run = vi.fn().mockRejectedValue(new Error("offline"));
    await expect(generateAI({ run }, {}, { feature: "explain" })).rejects.toThrow("offline");
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("bounds a hung call and cancels its signal without trying another embedding model", async () => {
    vi.useFakeTimers();
    const run = vi.fn(() => new Promise(() => {}));
    const result = runAI({ run }, EMBEDDING.model, {}, { feature: "embedding", timeoutMs: 10 });
    const check = expect(result).rejects.toThrow("timed out");
    await vi.advanceTimersByTimeAsync(10);
    await check;
    expect(run).toHaveBeenCalledTimes(1);
    expect((run.mock.calls[0] as unknown as [string, unknown, { signal: AbortSignal }])[2].signal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("bounds a stalled stream after the first byte and records failure", async () => {
    vi.useFakeTimers();
    const { db } = database();
    const cancel = vi.fn();
    const raw = new ReadableStream({ start(controller) { controller.enqueue("first"); }, cancel });
    const output = await runAI({ run: async () => raw }, GENERATION.model, {}, { feature: "stream", db, timeoutMs: 20 }) as ReadableStream;
    const reader = output.getReader();
    expect(await reader.read()).toMatchObject({ value: "first" });
    const next = reader.read();
    const check = expect(next).rejects.toThrow("timed out");
    await vi.advanceTimersByTimeAsync(20);
    await check;
    expect(cancel).toHaveBeenCalledOnce();
    expect(await aiUsage(db)).toMatchObject({ features: [{ calls: 1, failures: 1 }] });
  });

  it("routes PDF conversion through the same gateway policy", async () => {
    const toMarkdown = vi.fn().mockResolvedValue([{ format: "markdown", data: "soil" }]);
    await markdownAI({ toMarkdown } as unknown as Ai, [], { feature: "document-extraction", gatewayId: "docs" });
    expect(toMarkdown).toHaveBeenCalledWith([], expect.objectContaining({ gateway: expect.objectContaining({ id: "docs", skipCache: true }), extraHeaders: { "cf-aig-collect-log-payload": "false" } }));
  });

  it("routes native Gemini through the AI binding, not direct fetch, and disables cache", async () => {
    const run = vi.fn().mockResolvedValue(new Response(JSON.stringify({ candidates: [{ content: { role: "model", parts: [{ text: "hello" }] }, finishReason: "STOP" }], usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 } }), { headers: { "content-type": "application/json" } }));
    const gateway = vi.fn(() => ({ run }));
    const model = googleModel({ AI: { gateway } as unknown as Ai, GEMINI_API_KEY: "mock-key", AI_GATEWAY_ID: "test" }, "gemini-3.8-flash", "phone-agent");
    expect((await generateText({ model, prompt: "hello", maxRetries: 0 })).text).toBe("hello");
    expect(gateway).toHaveBeenCalledWith("test");
    expect(run).toHaveBeenCalledWith(expect.objectContaining({ provider: "google-ai-studio", endpoint: expect.stringContaining("models/gemini-3.8-flash:generateContent"), headers: expect.objectContaining({ "x-goog-api-key": "mock-key" }) }), expect.objectContaining({ gateway: expect.objectContaining({ skipCache: true, metadata: expect.objectContaining({ feature: "phone-agent" }) }) }));
  });

  it("keeps Workers SDK generation on the shared adapter", async () => {
    const run = vi.fn().mockResolvedValue({ response: "hello", usage: { prompt_tokens: 1, completion_tokens: 1 } });
    const model = workersModel({ AI: { run } as unknown as Ai }, GENERATION.model, "scout");
    expect((await generateText({ model, prompt: "hi", maxRetries: 0 })).text).toBe("hello");
    expect(run).toHaveBeenCalledWith(GENERATION.model, expect.anything(), expect.objectContaining({ gateway: expect.objectContaining({ id: "default", skipCache: true }) }));
  });

  it("rejects retired overrides before making a model call", async () => {
    const run = vi.fn();
    await expect(runAI({ run }, RETIRED_MODELS[0], {}, { feature: "test" })).rejects.toThrow("Retired");
    expect(run).not.toHaveBeenCalled();
  });

  it("requires ADMIN_TOKEN and serves persistent counters without prompt data", async () => {
    const { db } = database();
    await runAI({ run: async () => ({ response: "private answer" }) }, GENERATION.model, { prompt: "private input" }, { feature: "test", db });
    const env = { DB: db, ADMIN_TOKEN: "test-token" } as Env;
    expect((await admin.request("/ai-usage", {}, env)).status).toBe(401);
    expect((await admin.request("/ai-usage", { headers: { Authorization: "Bearer wrong" } }, env)).status).toBe(401);
    const response = await admin.request("/ai-usage", { headers: { Authorization: "Bearer test-token" } }, env);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const body = await response.text();
    expect(body).not.toContain("private");
    expect(JSON.parse(body)).toMatchObject({ features: [{ feature: "test", calls: 1 }] });
  });
});
