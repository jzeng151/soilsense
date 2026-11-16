import { CORPUS, CORPUS_VERSION, EMBEDDING, vectorId } from "./config";

interface StoredVector {
  id: string;
  namespace?: string;
  values: number[] | Float32Array | Float64Array;
  metadata?: Record<string, unknown>;
}
export interface ResearchInventoryIndex {
  getByIds(ids: string[]): Promise<StoredVector[]>;
}

const expected = CORPUS.chunks.flatMap(chunk => chunk.crops.map(crop => ({
  id: vectorId(chunk.id, crop), crop, chunkId: chunk.id, sourceId: chunk.sourceId,
})));

export interface ResearchIngestionStatus {
  status: "unchecked" | "ready" | "missing" | "partial" | "unavailable";
  expectedVectors: number;
  indexedVectors?: number;
  missingVectors?: number;
  invalidVectors?: number;
  reason?: string;
}

/** Bundled corpus size and a bound/shared index do not prove that research was ingested. */
export async function researchIngestionStatus(index?: ResearchInventoryIndex, verify = false): Promise<ResearchIngestionStatus> {
  const base = { expectedVectors: expected.length };
  if (!verify) return { ...base, status: "unchecked" };
  if (!index?.getByIds) return { ...base, status: "unavailable", reason: "Research index inventory binding is unavailable." };
  try {
    const found = new Map<string, StoredVector>();
    // Vectorize getByIds accepts at most 20 identifiers per request.
    for (let offset = 0; offset < expected.length; offset += 20) {
      for (const vector of await index.getByIds(expected.slice(offset, offset + 20).map(v => v.id))) found.set(vector.id, vector);
    }
    let indexedVectors = 0;
    let missingVectors = 0;
    let invalidVectors = 0;
    for (const entry of expected) {
      const stored = found.get(entry.id);
      if (!stored) { missingVectors++; continue; }
      const m = stored.metadata;
      if ((stored.namespace ?? "") !== "" || stored.values.length !== EMBEDDING.dimensions || !stored.values.every(Number.isFinite)
        || m?.corpus !== CORPUS_VERSION || m.crop !== entry.crop || m.chunk_id !== entry.chunkId || m.source_id !== entry.sourceId) {
        invalidVectors++;
      } else indexedVectors++;
    }
    return {
      ...base, status: indexedVectors === expected.length ? "ready" : missingVectors === expected.length ? "missing" : "partial",
      indexedVectors, missingVectors, invalidVectors,
      ...(indexedVectors !== expected.length ? { reason: "Curated research vectors are missing or incompatible; run scripts/ingest-research.mjs after checking metadata indexes. Field-memory vectors and bundled chunks are not research ingestion." } : {}),
    };
  } catch {
    return { ...base, status: "unavailable", reason: "Research index inventory check failed; readiness is unknown." };
  }
}
