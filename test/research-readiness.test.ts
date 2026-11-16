import { describe, expect, it } from "vitest";
import app from "../src/worker/index";
import { CORPUS, CORPUS_VERSION, EMBEDDING } from "../src/worker/research/config";
import { buildVectors, type VectorIndexLike } from "../src/worker/research/retrieve";
import { researchIngestionStatus } from "../src/worker/research/readiness";
import { ChatResearch } from "../src/worker/research/chat";
import { researchNoteFor } from "../src/worker/fieldwatch/researchNote";
import { WATCHED_FIELDS } from "../src/worker/fieldwatch/run";
import type { Env } from "../src/worker/env";
import type { ResearchResult } from "../src/shared/research";

function sharedIndex() {
  type Row = { id: string; namespace?: string; values: number[]; metadata?: Record<string, string> };
  const rows = new Map<string, Row>();
  // Reproduce the deployed index: nonzero count, but only field-memory vectors.
  rows.set("memory", { id: "memory", namespace: "field-memory:finney-ks", values: Array(768).fill(0.1), metadata: { field_id: "finney-ks", kind: "plan" } });
  const index = {
    async getByIds(ids: string[]) { return ids.flatMap(id => rows.has(id) ? [rows.get(id)!] : []); },
    async upsert(vectors: Row[]) { for (const row of vectors) rows.set(row.id, row); },
    async query(_vector: number[], options?: VectorizeQueryOptions) {
      const filters = options?.filter as Record<string, { $eq?: string; $in?: string[] }>;
      return { matches: [...rows.values()]
        .filter(row => (row.namespace ?? "") === (options?.namespace ?? ""))
        .filter(row => Object.entries(filters).every(([key, condition]) => condition.$eq ? row.metadata?.[key] === condition.$eq : condition.$in?.includes(row.metadata?.[key] ?? "")))
        .slice(0, options?.topK ?? 5).map(row => ({ id: row.id, metadata: row.metadata, score: 0.9 })) };
    },
  } satisfies VectorIndexLike & { getByIds(ids: string[]): Promise<Row[]> };
  const ai = { run: async (_model: string, input: unknown) => ({ data: (input as { text: string[] }).text.map(() => Array(EMBEDDING.dimensions).fill(0.1)) }) };
  return { index, rows, ai };
}

describe("curated research inventory", () => {
  it("becomes ready only after the 40 curated vectors are ingested in the default namespace", async () => {
    const h = sharedIndex();
    expect(await researchIngestionStatus(h.index, true)).toMatchObject({ status: "missing", missingVectors: 40, indexedVectors: 0 });
    await h.index.upsert(await buildVectors(h.ai));
    expect(await researchIngestionStatus(h.index, true)).toMatchObject({ status: "ready", indexedVectors: 40, missingVectors: 0, invalidVectors: 0 });
    expect(h.rows.has("memory")).toBe(true);
  });
  it.each(["namespace", "dimensions", "corpus", "crop", "chunk_id", "source_id", "nonfinite"])("rejects incompatible %s rather than declaring a bound index ready", async kind => {
    const h = sharedIndex();
    await h.index.upsert(await buildVectors(h.ai));
    const row = [...h.rows.values()].find(v => v.metadata?.corpus === CORPUS_VERSION)!;
    if (kind === "namespace") row.namespace = "field-memory:finney-ks";
    else if (kind === "dimensions") row.values = [0.1];
    else if (kind === "nonfinite") row.values = row.values.map((value, i) => i === 0 ? Number.NaN : value);
    else row.metadata![kind] = "wrong";
    expect(await researchIngestionStatus(h.index, true)).toMatchObject({ status: "partial", indexedVectors: 39, invalidVectors: 1 });
  });
  it("reports unavailable for inventory errors without implying an empty corpus", async () => {
    expect(await researchIngestionStatus({ getByIds: async () => { throw new Error("offline"); } }, true)).toMatchObject({ status: "unavailable" });
    expect(await researchIngestionStatus(undefined, true)).toMatchObject({ status: "unavailable" });
  });
  it("restores the same query, Field Watch note and Sprout citation path after curated ingestion", async () => {
    const h = sharedIndex();
    const env = { AI: h.ai, RESEARCH_INDEX: h.index } as unknown as Env;
    const field = WATCHED_FIELDS.find(f => f.id === "finney-ks")!;
    const query = async () => {
      const response = await app.request("/api/research/query", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ crops: ["winter_wheat", "sorghum", "fallow"], query: "limited irrigation crop rotation" }) }, env);
      return await response.json() as ResearchResult;
    };
    for (const ingested of [false, true]) {
      if (ingested) await h.index.upsert(await buildVectors(h.ai));
      const chat = new ChatResearch({ ai: h.ai, index: h.index });
      const results = [await query(), await researchNoteFor("dry", env, field, "winter_wheat"), await chat.search({ crops: ["winter_wheat"], question: "limited irrigation" })];
      for (const result of results) {
        expect(result).toMatchObject({ status: ingested ? "live" : "empty" });
        if (ingested) expect(result!.passages[0]).toMatchObject({ chunkId: expect.stringMatching(/^ksu-li-/), text: CORPUS.chunks[0]!.text });
        else expect(result!.passages).toEqual([]);
      }
      expect(chat.validate("[R1]").valid).toEqual(ingested ? ["R1"] : []);
    }
  });
});
