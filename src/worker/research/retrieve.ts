// Cited research retrieval (#7): Workers AI embeddings + Vectorize, filtered by crop / rotation metadata,
// with an explicit empty result for unmatched requests and saved/unavailable fallbacks on failure.

import type { RotationPlan } from "../../shared/types";
import type { EmbeddingInfo, ResearchPassage, ResearchResult } from "../../shared/research";
import {
  CHUNKS_BY_ID,
  CORPUS,
  CORPUS_VERSION,
  EMBEDDING,
  embeddingInput,
  isResearchTag,
  MAX_PASSAGES,
  MIN_SCORE,
  SOURCES_BY_ID,
  vectorId,
  type ResearchTag,
} from "./config";
import type { SavedEntry } from "./saved";
import { DOCS_CORPUS } from "../../shared/ingest";
import { docsPassageFor } from "./docsLookup";

/** The part of the Workers AI binding we use (kept loose so tests can pass a plain mock). */
export interface AiLike {
  run(model: string, input: unknown, options?: unknown): Promise<unknown>;
}

/** The part of the Vectorize binding we use. */
export interface VectorIndexLike {
  query(vector: number[], options?: VectorizeQueryOptions): Promise<{ matches: { id: string; score: number; metadata?: Record<string, unknown> }[] }>;
  upsert?(vectors: { id: string; values: number[]; metadata?: Record<string, string> }[]): Promise<unknown>;
}

export const EMBEDDING_INFO: EmbeddingInfo = { id: EMBEDDING.id, model: EMBEDDING.model, dimensions: EMBEDDING.dimensions, pooling: EMBEDDING.pooling };

/** Embed texts with the pinned model and pooling; rejects vectors of the wrong dimension. */
export async function embed(ai: AiLike, texts: string[], gatewayId?: string): Promise<number[][]> {
  const out = (await ai.run(EMBEDDING.model, embeddingInput(texts), gatewayId ? { gateway: { id: gatewayId } } : undefined)) as { data?: number[][] };
  const data = out?.data;
  if (!Array.isArray(data) || data.length !== texts.length) throw new Error("embedding: unexpected response shape");
  for (const v of data) if (!Array.isArray(v) || v.length !== EMBEDDING.dimensions) throw new Error(`embedding: expected ${EMBEDDING.dimensions} dimensions`);
  return data;
}

/** Crop and rotation-feature tags for a rotation: its crops, plus "cover" when it uses winter cover crops. */
export function tagsForRotation(plan: RotationPlan): ResearchTag[] {
  const tags = new Set<ResearchTag>();
  for (const y of plan.years) {
    if (isResearchTag(y.crop)) tags.add(y.crop);
    if (y.cover !== "none") tags.add("cover");
  }
  return [...tags];
}

/** Query text for a rotation (same preprocessing as ingestion is applied inside embed()). */
export function rotationQuery(plan: RotationPlan, water?: string): string {
  const seq = plan.years.map((y) => (y.cover !== "none" ? `${y.cropName} with ${y.coverName} cover crop` : y.cropName)).join(", then ");
  const w = water === "rain" ? "rain-fed dryland" : water === "limited" ? "limited irrigation" : water === "full" ? "irrigated" : "";
  return `Crop rotation research: ${seq}. ${w} yields, soil water, nitrogen, pests and soil health of this rotation compared with continuous cropping.`.replace(/\s+/g, " ");
}

export function passageFor(chunkId: string, score?: number): ResearchPassage | null {
  const c = CHUNKS_BY_ID.get(chunkId);
  const s = c && SOURCES_BY_ID.get(c.sourceId);
  if (!c || !s) return null;
  return {
    chunkId: c.id,
    sourceId: s.id,
    sourceTitle: s.title,
    sourceUrl: s.url,
    year: s.year,
    license: s.license,
    attribution: s.attribution,
    applicability: s.applicability,
    crops: [...c.crops],
    text: c.text,
    ...(score !== undefined ? { score: Math.round(score * 1000) / 1000 } : {}),
  };
}

function base(tags: string[], status: ResearchResult["status"], extra: Partial<ResearchResult> = {}): ResearchResult {
  return { status, passages: [], tags, retrievedAt: null, corpusVersion: CORPUS_VERSION, embedding: EMBEDDING_INFO, ...extra };
}

/**
 * One live retrieval. Throws on embedding/Vectorize failure (callers decide the fallback).
 * Unsupported tags are dropped; with no supported tag the result is an explicit empty result.
 */
export async function retrieveLive(
  deps: { ai: AiLike; index: VectorIndexLike; db?: D1Database; now?: () => Date; gatewayId?: string },
  rawTags: string[],
  query: string,
): Promise<ResearchResult> {
  const tags = [...new Set(rawTags.filter(isResearchTag))];
  if (!tags.length) return base(rawTags, "empty", { reason: "unsupported crop or rotation" });
  const [vector] = await embed(deps.ai, [query], deps.gatewayId);
  if (!vector) throw new Error("embedding: empty");
  const res = await deps.index.query(vector, {
    // All shared research is in the default namespace. Never search field-memory namespaces.
    namespace: "",
    topK: 10,
    returnMetadata: "indexed",
    filter: { corpus: { $in: [CORPUS_VERSION, DOCS_CORPUS] }, crop: tags.length === 1 ? { $eq: tags[0]! } : { $in: tags } },
  });
  const seen = new Set<string>();
  const passages: ResearchPassage[] = [];
  for (const m of [...(res?.matches ?? [])].sort((a, b) => b.score - a.score)) {
    if (m.score < MIN_SCORE) continue;
    const chunkId = String(m.metadata?.chunk_id ?? m.id.split("#")[0]);
    if (seen.has(chunkId)) continue;
    if (m.metadata?.corpus === DOCS_CORPUS) {
      const p = await docsPassageFor(deps.db, chunkId, tags, m.score);
      if (!p) continue;
      seen.add(chunkId);
      passages.push(p);
      if (passages.length >= MAX_PASSAGES) break;
      continue;
    }
    // Defensive: never return text outside the curated corpus, from another corpus version, or for another crop.
    const chunk = CHUNKS_BY_ID.get(chunkId);
    if (!chunk || (m.metadata?.corpus !== undefined && m.metadata.corpus !== CORPUS_VERSION)) continue;
    if (!chunk.crops.some((c) => (tags as string[]).includes(c))) continue;
    const p = passageFor(chunkId, m.score);
    if (!p) continue;
    seen.add(chunkId);
    passages.push(p);
    if (passages.length >= MAX_PASSAGES) break;
  }
  const retrievedAt = (deps.now?.() ?? new Date()).toISOString();
  return passages.length ? base(tags, "live", { passages, retrievedAt }) : base(tags, "empty", { retrievedAt, reason: "no applicable passage matched" });
}

/**
 * Research for one comparison: live retrieval when the bindings work; on failure the saved result for the
 * exact same comparison key (labelled saved, with its original retrieval time); otherwise research-unavailable.
 */
export async function researchFor(
  deps: { ai?: AiLike; index?: VectorIndexLike; db?: D1Database; now?: () => Date; gatewayId?: string },
  tags: string[],
  query: string,
  saved: SavedEntry | null,
): Promise<ResearchResult> {
  if (!tags.some(isResearchTag)) return base(tags, "empty", { reason: "unsupported crop or rotation" });
  let failure = "research bindings not configured";
  if (deps.ai && deps.index) {
    try {
      return await retrieveLive({ ai: deps.ai, index: deps.index, db: deps.db, now: deps.now, gatewayId: deps.gatewayId }, tags, query);
    } catch (err) {
      failure = `retrieval failed: ${String(err).slice(0, 160)}`;
      console.warn(JSON.stringify({ msg: "research retrieval failed", err: String(err) }));
    }
  }
  if (saved) return savedResearch(saved, failure);
  return base(tags.filter(isResearchTag), "unavailable", { reason: failure });
}

export function savedResearch(saved: SavedEntry, reason?: string): ResearchResult {
  return {
    ...saved.research,
    status: saved.research.passages.length ? "saved" : "empty",
    // Text always comes from the curated corpus by chunk ID, so a saved bundle can't smuggle in other text.
    passages: saved.research.passages.map((p) => passageFor(p.chunkId, p.score)).filter((p): p is ResearchPassage => p !== null),
    ...(reason ? { reason: `${reason}; using saved result` } : {}),
  };
}

/** Vectors for ingestion: one per (chunk, tag), all embedded with the shared config. */
export async function buildVectors(ai: AiLike, gatewayId?: string): Promise<{ id: string; values: number[]; metadata: Record<string, string> }[]> {
  const chunks = CORPUS.chunks;
  const vectors = await embed(ai, chunks.map((c) => c.text), gatewayId);
  return chunks.flatMap((c, i) =>
    c.crops.map((tag) => ({
      id: vectorId(c.id, tag),
      values: vectors[i]!,
      metadata: { crop: tag, corpus: CORPUS_VERSION, chunk_id: c.id, source_id: c.sourceId },
    })),
  );
}
