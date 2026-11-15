import type { ResearchPassage, ResearchResult } from "./research";

// `publisher` is optional on ResearchPassage (pipeline documents add it); chat passages always carry it, null when unknown.
export interface ChatResearchPassage extends Omit<ResearchPassage, "publisher"> {
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
