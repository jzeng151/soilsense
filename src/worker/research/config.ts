// One shared configuration for cited research retrieval (#7) and grounded explanations (#8).
// Ingestion (POST /api/research/ingest) and query-time retrieval both import from here, so the embedding
// model, pooling, preprocessing and index can never drift apart.
//
// Changing EMBEDDING.model or EMBEDDING.pooling makes old vectors incompatible even when the dimensions
// match: bump EMBEDDING.id and VECTORIZE_INDEX_NAME, create a new index, and re-run ingestion.

import corpusFile from "./corpus.json";

export const EMBEDDING = {
  /** Bump when model, pooling or preprocessing changes (part of every comparison key). */
  id: "bge-base-en-v1.5/cls/768/v1",
  model: "@cf/baai/bge-base-en-v1.5",
  dimensions: 768,
  pooling: "cls",
  /** Model input limit, including any heading or prefix. We add no prefix to passages or queries. */
  maxTokens: 512,
  /**
   * Conservative character cap that keeps every input under maxTokens (BERT WordPiece averages well over
   * 3 characters per token in English prose; 1,500 / 3 = 500 tokens). Corpus chunks must fit untruncated.
   */
  maxChars: 1500,
} as const;

/** Vectorize index (cosine, 768 dims). See docs/RESEARCH.md for the create / metadata-index commands. */
export const VECTORIZE_INDEX_NAME = "soilsense-research-v1";
export const VECTORIZE_METRIC = "cosine";
/** Metadata indexes that must exist BEFORE the first upsert (filters ignore vectors upserted earlier). */
export const VECTORIZE_METADATA_INDEXES = [
  { propertyName: "crop", type: "string" },
  { propertyName: "corpus", type: "string" },
] as const;

/** Max passages returned per crop or rotation. */
export const MAX_PASSAGES = 2;
/** Cosine scores below this are treated as unrelated, so a weak match returns an explicit empty result. */
export const MIN_SCORE = 0.45;

/** Generation model for #8, pinned by full ID. Not on the 2026-11-20 retirement list. */
export const GENERATION = {
  model: "@cf/google/gemma-4-26b-a4b-it",
  /** Bump when the prompt or output schema changes (part of every comparison key). */
  promptVersion: "explain-v1",
  maxTokens: 400,
  temperature: 0.2,
  timeoutMs: 12_000,
} as const;

/** Models retired on 2026-11-20 (Cloudflare changelog 2026-11-05). Never configure these. */
export const RETIRED_MODELS = [
  "@cf/google/embeddinggemma-300m",
  "@cf/meta/llama-3.1-8b-instruct-fp8",
  "@cf/meta/llama-3.2-1b-instruct",
  "@cf/meta/llama-3.2-3b-instruct",
  "@cf/qwen/qwen3-30b-a3b-fp8",
  "@cf/moonshotai/kimi-k2.6",
] as const;

/** Crop / rotation-feature tags used in corpus metadata and Vectorize filters. */
export const RESEARCH_TAGS = ["corn", "soybean", "winter_wheat", "oats", "alfalfa", "sorghum", "fallow", "cover"] as const;
export type ResearchTag = (typeof RESEARCH_TAGS)[number];

export function isResearchTag(x: unknown): x is ResearchTag {
  return typeof x === "string" && (RESEARCH_TAGS as readonly string[]).includes(x);
}

/**
 * The single preprocessing step for BOTH ingestion and queries: collapse whitespace and cap the length.
 * No instruction prefix is added on either side.
 */
export function prepareEmbeddingText(text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > EMBEDDING.maxChars ? t.slice(0, EMBEDDING.maxChars) : t;
}

/** The exact Workers AI input used for every embedding call (ingestion and query). */
export function embeddingInput(texts: string[]): { text: string[]; pooling: "cls" } {
  return { text: texts.map(prepareEmbeddingText), pooling: EMBEDDING.pooling };
}

// ---------- Corpus ----------

export interface ResearchSource {
  id: string;
  title: string;
  url: string;
  doi: string | null;
  publisher: string;
  year: number;
  license: string;
  attribution: string;
  /** Where the research applies and its limits (irrigation treatment, region). Shown beside passages. */
  applicability: string;
}

export interface ResearchChunk {
  id: string;
  sourceId: string;
  crops: ResearchTag[];
  topic: string;
  /** Verbatim excerpt (whitespace normalized). */
  text: string;
}

export const CORPUS = corpusFile as unknown as { corpusVersion: string; curatedAt: string; sources: ResearchSource[]; chunks: ResearchChunk[] };
export const CORPUS_VERSION = CORPUS.corpusVersion;
export const SOURCES_BY_ID = new Map(CORPUS.sources.map((s) => [s.id, s]));
export const CHUNKS_BY_ID = new Map(CORPUS.chunks.map((c) => [c.id, c]));

/** Vector IDs: one vector per (chunk, crop tag) so Vectorize can filter on a single string field. */
export function vectorId(chunkId: string, tag: ResearchTag): string {
  return `${chunkId}#${tag}`;
}
