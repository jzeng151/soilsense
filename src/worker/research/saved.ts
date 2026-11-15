// Saved demo evidence (#7) and explanations (#8): a small checked-in JSON bundle, keyed by the full
// comparison key. It is written ONLY by scripts/snapshot-research.mjs from real Vectorize retrieval and
// real Workers AI output captured from the deployed Worker; an empty bundle simply means "no saved result".

import type { ComparisonKeyParts, ResearchResult } from "../../shared/research";
import bundleFile from "./saved-evidence.json";

export interface SavedExplanation {
  /** Narrative in placeholder form ({{fact-id}}); numbers are re-rendered from current approved facts. */
  narrative: string;
  citations: string[];
  factIds: string[];
  generatedAt: string;
  modelId: string;
  promptVersion: string;
}

export interface SavedEntry {
  comparisonKey: string;
  keyParts: ComparisonKeyParts;
  scenarioName?: string;
  research: ResearchResult & { query?: string };
  explanation?: SavedExplanation;
}

export interface SavedBundle {
  version: number;
  entries: SavedEntry[];
}

function isEntry(x: unknown): x is SavedEntry {
  const e = x as SavedEntry;
  return !!e && typeof e.comparisonKey === "string" && !!e.research && Array.isArray(e.research.passages);
}

export function loadBundle(raw: unknown): SavedBundle {
  const b = raw as { version?: unknown; entries?: unknown };
  const entries = Array.isArray(b?.entries) ? b.entries.filter(isEntry) : [];
  return { version: typeof b?.version === "number" ? b.version : 1, entries };
}

export const SAVED_BUNDLE: SavedBundle = loadBundle(bundleFile);

/** Exact key match only: a changed field, scenario, priority, rotation or version never reuses saved output. */
export function findSaved(bundle: SavedBundle, comparisonKey: string): SavedEntry | null {
  return bundle.entries.find((e) => e.comparisonKey === comparisonKey) ?? null;
}
