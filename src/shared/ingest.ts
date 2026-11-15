// Shared contract for the document → Vectorize pipeline (R2 event → Queue → Workflow → review → Vectorize).
// Every track builds against this file. Change it only by adding fields; never rename or reorder.
// Design notes: docs/INGEST.md.

/** R2 bucket layout (binding DOCS, bucket "soilsense-docs"). Only uploads under UPLOAD_PREFIX trigger ingestion. */
export const DOCS_LAYOUT = {
  /** Uploads: docs/<any name>.(pdf|html|htm|md|txt). The R2 event notification is filtered to this prefix. */
  uploadPrefix: "docs/",
  /** Extracted text, exactly as chunk offsets refer to it: extracted/<docSha256>.md */
  extracted: (docSha256: string) => `extracted/${docSha256}.md`,
  /** Per-version manifest (source, hashes, extraction method, chunk list): manifests/<docSha256>.json */
  manifest: (docSha256: string) => `manifests/${docSha256}.json`,
} as const;

export const ACCEPTED_EXTENSIONS = [".pdf", ".html", ".htm", ".md", ".txt"] as const;

/** Vectorize `corpus` metadata value for chunks from this pipeline (the curated corpus keeps its own value). */
export const DOCS_CORPUS = "docs-v1";

/** Pipeline version; bump when extraction or chunking rules change (stored on every version row). */
export const INGEST_VERSION = "ingest-v1";

/** Chunking rules (track C). Chunks are exact slices of the extracted text; maxChars matches EMBEDDING.maxChars. */
export const CHUNKING = { maxChars: 1500, minChars: 200, overlapChars: 0 } as const;

/** How long a document waits for human review before the Workflow gives up (Workflows waitForEvent timeout). */
export const REVIEW_TIMEOUT = "7 days";
/** Event type sent to the Workflow instance by the review route. */
export const REVIEW_EVENT = "review";

/** Body of an R2 event notification as delivered to the Queue consumer (only the fields we use). */
export interface R2EventMessage {
  account: string;
  bucket: string;
  action: string; // "PutObject" | "CompleteMultipartUpload" | "CopyObject" | ...
  object: { key: string; size?: number; eTag?: string };
  eventTime: string;
}

/** Params for one DocIngestWorkflow instance (binding DOC_INGEST). */
export interface DocIngestParams {
  bucket: string;
  key: string;
  eTag: string | null;
  size: number | null;
  eventTime: string;
}

/** Workflow instance id: one per uploaded object version, so a redelivered event can't start a second run. */
export function workflowInstanceId(docId: string, eTag: string | null, eventTime: string): string {
  return `${docId}-${(eTag ?? eventTime).replace(/[^A-Za-z0-9]/g, "").slice(0, 32)}`;
}

/** Stable document id from its R2 key (same file name = same document, new upload = new version). */
export function docIdFromKey(sha256OfKeyHex: string): string {
  return `doc-${sha256OfKeyHex.slice(0, 16)}`;
}

/** Content-addressed chunk id: an unchanged chunk keeps its id (and vectors) across document versions. */
export function chunkId(docId: string, chunkSha256Hex: string): string {
  return `${docId}:${chunkSha256Hex.slice(0, 16)}`;
}

/** Vector id: one vector per (chunk, crop tag), same scheme as the curated corpus. */
export function docVectorId(chunkIdValue: string, tag: string): string {
  return `${chunkIdValue}#${tag}`;
}

export type DocStatus = "received" | "extracted" | "pending_review" | "approved" | "rejected" | "indexed" | "error";
export type ChunkStatus = "pending" | "indexed" | "retired";

/** A chunk produced by track C. text === extracted.slice(start, end), always. */
export interface DocChunk {
  id: string;
  docId: string;
  docSha256: string;
  sha256: string;
  start: number;
  end: number;
  text: string;
}

/** What the reviewer supplies when approving. Source metadata comes from a person, never guessed by a model. */
export interface ReviewDecision {
  decision: "approve" | "reject";
  reviewer: string;
  /** Required for approve. */
  source?: {
    title: string;
    url: string;
    publisher: string;
    year: number;
    license: string;
    attribution: string;
    applicability: string;
  };
  /** Research tags (RESEARCH_TAGS) the document covers; required for approve. */
  crops?: string[];
  note?: string;
}

/** Vectorize metadata for pipeline vectors (all strings; `crop` and `corpus` are the indexed fields). */
export interface DocVectorMetadata {
  crop: string;
  corpus: typeof DOCS_CORPUS;
  chunk_id: string;
  source_id: string; // = docId
  doc_sha256: string;
  [k: string]: string;
}
