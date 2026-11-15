import type { ResearchPassage, ResearchResult } from "./research";

export interface ChatResearchPassage extends ResearchPassage {
  /** Stable for this server-owned turn (web) or call (phone); never supplied by the model. */
  citationId: string;
  publisher: string | null;
}

export interface ChatResearchResult extends Omit<ResearchResult, "passages"> {
  passages: ChatResearchPassage[];
}

export interface ChatCitationDisplay {
  passages: ChatResearchPassage[];
  invalid: string[];
}
