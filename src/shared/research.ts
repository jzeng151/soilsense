// API contract for cited research retrieval (#7) and grounded explanations (#8).
// Shared by the Worker and the dashboard.

import type { PlanRequest } from "./types";

export interface ResearchPassage {
  chunkId: string;
  sourceId: string;
  sourceTitle: string;
  sourceUrl: string;
  year: number;
  license: string;
  attribution: string;
  /** Where the research was done and its limits (irrigation treatment, region). */
  applicability: string;
  /** Crop / rotation-feature tags this passage applies to. */
  crops: string[];
  /** Verbatim excerpt from the source. Research-plot numbers here are NOT computed field facts. */
  text: string;
  /** Cosine similarity from Vectorize (live or captured at save time). */
  score?: number;
}

export interface EmbeddingInfo {
  id: string;
  model: string;
  dimensions: number;
  pooling: string;
}

/**
 * live: retrieved now from Vectorize. saved: a stored Vectorize result for exactly this comparison key
 * (not a new retrieval). empty: retrieval ran (or the request is unsupported) and nothing applicable matched.
 * unavailable: retrieval failed and no matching saved result exists.
 */
export type ResearchStatus = "live" | "saved" | "empty" | "unavailable";

export interface ResearchResult {
  status: ResearchStatus;
  passages: ResearchPassage[];
  /** Crop / rotation-feature tags that were searched. */
  tags: string[];
  /** When the passages were retrieved (for saved results: the original retrieval time). */
  retrievedAt: string | null;
  corpusVersion: string;
  embedding: EmbeddingInfo;
  reason?: string;
}

export interface ComparisonKeyParts {
  /** Field location (rounded lat,lon). */
  field: string;
  /** Evidence snapshot: climate period + hash of the approved facts for this comparison. */
  evidence: string;
  /** Scenario: water level and recent crops. */
  scenario: string;
  /** Rotation: engine rank id + crop/cover sequence. */
  rotation: string;
  /** Farmer priority. */
  priority: string;
  /** Scoring / engine configuration version. */
  scoring: string;
  corpus: string;
  embedding: string;
  model: string;
  prompt: string;
}

export interface ExplainFactView {
  id: string;
  label: string;
  display: string;
  period: string;
  source: string;
}

/** live: validated model output now. saved: a validated stored output for the identical comparison key. template: deterministic text. */
export type ExplanationStatus = "live" | "saved" | "template";

export interface ExplanationResponse {
  comparisonKey: string;
  keyParts: ComparisonKeyParts;
  rotationId: string;
  rotationLabel: string;
  status: ExplanationStatus;
  /** Two short sentences; every number was rendered from an approved fact by trusted code. */
  narrative: string;
  /** Chunk IDs of research passages the narrative cites (always a subset of research.passages). */
  citations: string[];
  /** Approved facts used in the narrative. */
  facts: ExplainFactView[];
  /** Fixed agronomist-check line (never model-written). */
  checks: string;
  /** When the field evidence (NASA/USDA data and engine run) was assembled. */
  asOf: string;
  /** Historical weather period the facts come from. */
  evidencePeriod: string;
  /** For saved explanations: when the saved text was generated (not when the data was observed). */
  savedAt?: string;
  model: { id: string; promptVersion: string } | null;
  research: ResearchResult;
  /** Why a fallback was used (template/saved), for logs and the demo. */
  reason?: string;
}

export interface ExplainRequest extends PlanRequest {
  /** Which rotation to explain: "plan-1".. or the current practice id. Defaults to the top plan. */
  rotationId?: string;
}
