import type { ResearchResult } from "./research";

/** Stored verbatim evidence, not a generated recommendation or an input to the watch rule. */
export interface FieldResearchNote extends Omit<ResearchResult, "status"> {
  status: ResearchResult["status"] | "skipped";
  cropSource: "watch settings" | "demo field configuration" | null;
  template: string;
  query: string | null;
}
