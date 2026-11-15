import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";
import { watchMemory, writeFieldMemory, ChatFieldMemory, memoryNamespace, planMemory } from "../src/worker/fieldMemory";
import { EMBEDDING, embeddingInput } from "../src/worker/research/config";
import type { Env } from "../src/worker/env";
import type { PlanResponse } from "../src/shared/types";

function harness() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(readFileSync("migrations/0008_field_memory.sql", "utf8"));
  const statement = (sql: string, args: unknown[] = []): unknown => ({
    bind: (...values: unknown[]) => statement(sql, values),
    first: async () => sqlite.prepare(sql).get(...args as never[]) ?? null,
    all: async () => ({ results: sqlite.prepare(sql).all(...args as never[]) }),
    run: async () => ({ success: true, meta: sqlite.prepare(sql).run(...args as never[]) }),
  });
  type Vector = { id: string; namespace: string; values: number[]; metadata: Record<string, string> };
  const vectors = new Map<string, Vector>();
  const index = {
    upsert: vi.fn(async (rows: Vector[]) => { rows.forEach(v => vectors.set(v.id, v)); return {}; }),
    query: vi.fn(async (_v: number[], opts?: VectorizeQueryOptions) => ({ matches: [...vectors.values()].filter(v => v.namespace === opts?.namespace).map(v => ({ ...v, score: 0.9 })) })),
    deleteByIds: vi.fn(async (ids: string[]) => { ids.forEach(id => vectors.delete(id)); return {}; }),
  };
  const ai = { run: vi.fn(async () => ({ data: [Array(768).fill(0.1)] })) };
  const env = { DB: { prepare: statement }, RESEARCH_INDEX: index, AI: ai } as unknown as Env;
  return { sqlite, vectors, index, ai, env };
}
import { planRun, executeRun, MemoryRunStore } from "../src/worker/fieldwatch/agentCore";
import { logPlan } from "../src/worker/service";
import { runRecurringCheck, DEFAULT_SETTINGS } from "../src/worker/fieldwatch/watchCore";
import { makeTools } from "../src/worker/routes/scout";
import { ChatResearch } from "../src/worker/research/chat";
import { checkedCitationStream } from "../src/worker/research/chatStream";
import type { UIMessageChunk } from "ai";
import app from "../src/worker/index";
import { retrieveLive } from "../src/worker/research/retrieve";
import { CORPUS } from "../src/worker/research/config";
import { WATCHED_FIELDS } from "../src/worker/fieldwatch/run";

const field = WATCHED_FIELDS.find(f => f.id === "finney-ks")!;
const run = { ...planRun(field, "replay", "jun-2022", Date.parse("2026-11-15T03:00:00Z")), status: "dry" as const, completedAt: Date.parse("2026-11-15T03:01:00Z"), snapshot: { label: "Historical replay" as const, source: "NASA POWER", comparisonYears: "1991–2021", windowStart: "2022-06-14", windowEnd: "2022-06-27", inputSha256: "abc" }, metrics: { windowStart: "2022-06-14", dataThrough: "2022-06-27", rain14Mm: 9.5, normalRain14Mm: 40, rainPercentile: 3, et014Mm: 70, balance14Mm: -60.5, rootzoneDate: "2022-06-27", rootzoneWetness: 0.1, rootzonePercentile: 0, normalYears: 31, normalPeriod: "1991–2021", kansas: null } };

describe("factual field memory", () => {
  it("keeps a completed source result when the database binding itself throws synchronously", async () => {
    const h = harness();
    try {
      const env = { ...h.env, DB: { prepare() { throw new Error("binding offline"); } } } as unknown as Env;
      const store = new MemoryRunStore();
      const pending = planRun(field, "live", null, Date.now());
      store.insert(pending);
      const done = await executeRun(store, pending.runId, env, field, new Date(), { history: async () => ({ map: new Map(), first: 1991, last: 2025 }), recent: async () => new Map(), kansas: async () => null });
      expect(done?.status).toBe("insufficient");
      expect(store.get(pending.runId)?.status).toBe("insufficient");
    } finally { h.sqlite.close(); }
  });
  it.each(["weekly", "window"] as const)("remembers completed %s runs through the recurring agent path", async kind => {
    const h = harness();
    try {
      const store = new MemoryRunStore();
      const now = new Date("2025-07-14T14:00:00Z");
      const settings = { ...DEFAULT_SETTINGS, enabled: true, version: 1, crop: "corn" as const };
      const done = await runRecurringCheck(kind, { version: 1, crop: "corn", seasonYear: 2025 }, settings, store, h.env, field, now, { history: async () => ({ map: new Map(), first: 1991, last: 2024 }), recent: async () => new Map(), kansas: async () => null });
      expect(done?.status).toBe("insufficient");
      expect(h.vectors.size).toBe(1);
    } finally { h.sqlite.close(); }
  });
  it("retains the latest 200 records per field, deletes only memory vectors, and refuses stale matches", async () => {
    const h = harness();
    try {
      const record = watchMemory(run)!;
      await writeFieldMemory(h.env, { ...record, field_id: "story-ia", record_id: "other" });
      let oldest: ReturnType<typeof h.vectors.get>;
      for (let i = 0; i < 202; i++) {
        await writeFieldMemory(h.env, { ...record, record_id: `run-${i}`, recorded_at: i });
        if (i === 0) oldest = [...h.vectors.values()].find(v => v.metadata.record_id === "run-0");
      }
      expect(h.sqlite.prepare("SELECT COUNT(*) AS n FROM field_memory WHERE field_id=?").get(field.id)).toMatchObject({ n: 200 });
      expect(h.vectors.size).toBe(201);
      expect(h.index.deleteByIds).toHaveBeenCalledTimes(2);
      h.index.query.mockResolvedValueOnce({ matches: [{ ...oldest!, score: 0.9 }] });
      expect((await new ChatFieldMemory(h.env).recall({ field_id: field.id, question: "old history" })).records).toEqual([]);
    } finally { h.sqlite.close(); }
  });
  it("does not accept records that arrive after a recall timeout", async () => {
    const h = harness();
    try {
      await writeFieldMemory(h.env, watchMemory(run));
      const matches = { matches: [...h.vectors.values()].map(v => ({ ...v, score: 0.9 })) };
      let resolve!: (value: typeof matches) => void;
      h.index.query.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
      vi.useFakeTimers();
      const memory = new ChatFieldMemory(h.env);
      const pending = memory.recall({ field_id: field.id, question: "history" });
      await vi.advanceTimersByTimeAsync(8000);
      expect(await pending).toMatchObject({ status: "unavailable", records: [] });
      resolve(matches);
      await vi.advanceTimersByTimeAsync(0);
      expect(memory.validate("[F1]").invalid).toEqual(["F1"]);
      expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); h.sqlite.close(); }
  });
  it("degrades safely with missing migrations/bindings and records index failures without losing source runs", async () => {
    const h = harness();
    try {
      h.ai.run.mockRejectedValueOnce(new Error("offline"));
      expect(await writeFieldMemory(h.env, watchMemory(run))).toBe("failed");
      expect(h.sqlite.prepare("SELECT index_status FROM field_memory").get()).toMatchObject({ index_status: "failed" });
      expect((await new ChatFieldMemory({}).recall({ field_id: field.id, question: "history" })).status).toBe("unavailable");
      h.sqlite.exec("DROP TABLE field_memory");
      expect(await writeFieldMemory(h.env, watchMemory(run))).toBe("failed");
    } finally { h.sqlite.close(); }
  });
  it("isolates research queries from all field-memory namespaces", async () => {
    const h = harness();
    try {
      await writeFieldMemory(h.env, watchMemory(run));
      const result = await retrieveLive({ ai: h.ai, index: h.index }, [...CORPUS.chunks[0]!.crops], "dry weather");
      expect(result.passages).toEqual([]);
      expect(h.index.query).toHaveBeenLastCalledWith(expect.any(Array), expect.objectContaining({ namespace: "" }));
    } finally { h.sqlite.close(); }
  });
  it("logs demo plan memory under its original plan-log id, with resolvable source links", async () => {
    const h = harness();
    try {
      h.sqlite.exec(readFileSync("migrations/0001_init.sql", "utf8"));
      const plan = { request: { lat: field.lat, lon: field.lon, irrigated: false, priority: "balanced" }, generatedAt: "2026-11-15T12:00:00Z", plans: [], explanation: { summary: "MODEL TEXT" } } as unknown as PlanResponse;
      const id = await logPlan(h.env, { channel: "web", plan });
      expect(h.vectors.size).toBe(1);
      const vectorId = [...h.vectors.keys()][0]!;
      const response = await app.request(`/api/field-memory/${field.id}/${vectorId}`, {}, h.env);
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ record_id: id, kind: "plan", summary: expect.not.stringContaining("MODEL TEXT") });
      expect((await app.request(`/api/field-memory/story-ia/${vectorId}`, {}, h.env)).status).toBe(404);
    } finally { h.sqlite.close(); }
  });
  it("indexes completed scheduled runs once, without changing failed/successful source execution", async () => {
    const h = harness();
    try {
      const store = new MemoryRunStore();
      const pending = planRun(field, "live", null, Date.now());
      store.insert(pending);
      const deps = { history: async () => ({ map: new Map(), first: 1991, last: 2025 }), recent: async () => new Map(), kansas: async () => null };
      const done = await executeRun(store, pending.runId, h.env, field, new Date(), deps);
      expect(done?.status).toBe("insufficient");
      expect(h.vectors.size).toBe(1);
      await executeRun(store, pending.runId, h.env, field, new Date(), deps);
      expect(h.index.upsert).toHaveBeenCalledOnce();
    } finally { h.sqlite.close(); }
  });
  it("registers recall as a Sprout tool and validates only F ids returned this turn", async () => {
    const h = harness();
    try {
      await writeFieldMemory(h.env, watchMemory(run));
      const research = new ChatResearch({});
      const memory = new ChatFieldMemory(h.env);
      const tools = makeTools(h.env, { write() {}, merge() {}, onError: undefined } as Parameters<typeof makeTools>[1], research, memory);
      const result = await tools.recall_field_history.execute!({ field_id: field.id, question: "past dry checks" }, { toolCallId: "memory-test", messages: [], context: {} });
      expect("records" in result && result.records[0]?.citationId).toBe("F1");
      const parts: UIMessageChunk[] = [{ type: "text-start", id: "text" }, { type: "text-delta", id: "text", delta: "Past [F" }, { type: "text-delta", id: "text", delta: "1]. Invalid [F99] [R99]." }, { type: "text-end", id: "text" }, { type: "finish" }];
      const output: UIMessageChunk[] = [];
      const reader = checkedCitationStream(new ReadableStream({ start(c) { parts.forEach(p => c.enqueue(p)); c.close(); } }), research, memory).getReader();
      for (;;) { const next = await reader.read(); if (next.done) break; output.push(next.value); }
      expect(output.filter(p => p.type === "source-url")).toEqual([expect.objectContaining({ sourceId: "F1", url: expect.stringContaining("/api/field-memory/finney-ks/") })]);
      expect(output.find(p => p.type === "data-field-memory-citations")).toMatchObject({ data: { invalid: ["F99"], records: [expect.objectContaining({ record_id: run.runId })] } });
      expect(output.some(p => p.type === "text-delta" && p.delta.includes("[F99]"))).toBe(true);
    } finally { h.sqlite.close(); }
  });
  it("embeds idempotently in a field-scoped namespace and recalls only trusted stored summaries", async () => {
    const h = harness();
    try {
      const record = watchMemory(run)!;
      expect(await writeFieldMemory(h.env, record)).toBe("submitted");
      await writeFieldMemory(h.env, record);
      await writeFieldMemory(h.env, { ...record, field_id: "story-ia", record_id: "other" });
      expect(h.vectors.size).toBe(2);
      expect(h.ai.run).toHaveBeenCalledWith(EMBEDDING.model, embeddingInput([record.summary]), undefined);
      expect([...h.vectors.values()][0]).toMatchObject({ namespace: memoryNamespace(field.id), metadata: { field_id: field.id, kind: "watch", date: record.date, record_id: run.runId } });
      const chat = new ChatFieldMemory(h.env);
      const result = await chat.recall({ field_id: field.id, question: "past dry replays" });
      expect(result.status).toBe("live");
      expect(result.records).toHaveLength(1);
      expect(result.records[0]).toMatchObject({ citationId: "F1", summary: record.summary, record_id: run.runId, date: "2022-06-27" });
      expect(h.index.query).toHaveBeenCalledWith(expect.any(Array), expect.objectContaining({ namespace: "field-memory:finney-ks" }));
      expect(chat.validate("History [F1], invented [F2]")).toMatchObject({ valid: ["F1"], invalid: ["F2"] });
      expect(new ChatFieldMemory(h.env).validate("Client history [F1]").invalid).toEqual(["F1"]);
      await expect(chat.recall({ field_id: "private-field", question: "history" })).rejects.toThrow();
      h.index.query.mockResolvedValueOnce({ matches: [...h.vectors.values()].filter(v => v.metadata.field_id === "story-ia").map(v => ({ ...v, score: 0.9 })) });
      expect((await chat.recall({ field_id: field.id, question: "history" })).records).toEqual([]);
    } finally { h.sqlite.close(); }
  });
  it("constructs demo plan summaries without model explanation or arbitrary locations", () => {
    const plan = { request: { lat: field.lat, lon: field.lon, irrigated: false, priority: "balanced" }, generatedAt: "2026-11-15T12:00:00Z", plans: [{ label: "MODEL LABEL", years: [{ year: 2027, crop: "corn", cover: "none" }], avgNetReturnPerAcre: 123.45, scores: { total: 0.8 } }], explanation: { summary: "MODEL PROSE" } } as PlanResponse;
    expect(planMemory(plan, "plan-1")?.summary).toBe("2026-11-15 plan, Finney County, KS: rain water; balanced priority; top modeled rotation 2027 corn; modeled average net return 123.45 USD/acre/year; score 0.8. Not an observed outcome.");
    expect(planMemory({ ...plan, request: { ...plan.request, lat: 38 } }, "id")).toBeNull();
  });
  it("templates only record fields, preserving replay dates and genuine zeros", () => {
    const memory = watchMemory({ ...run, headline: "MODEL PROSE MUST NOT BE INDEXED", rule: "UNTRUSTED NARRATIVE" })!;
    expect(memory.summary).toBe("2022-06-27 replay, Finney County, KS: dry; 14-day rain 9.5 mm (3rd percentile); root-zone wetness 0th percentile; rule v2.");
    expect(memory).toMatchObject({ field_id: field.id, record_id: run.runId, kind: "watch", date: "2022-06-27" });
    expect(watchMemory({ ...run, status: "pending", completedAt: null })).toBeNull();
    expect(watchMemory({ ...run, metrics: null })!.summary).toContain("rain unavailable");
  });
});
