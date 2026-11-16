import type { PlanFertilizer } from "../shared/fertilizer";
import { fertilizerFacts, type FertilizerFact } from "../engine/fertilizerProducts";

export interface CitedFertilizerFact extends FertilizerFact { citationId: string }
/** Per-answer registry, populated only from trusted arithmetic (never client history). */
export class FertilizerEvidence {
  private facts = new Map<string, CitedFertilizerFact>();
  private byContent = new Map<string, CitedFertilizerFact>();
  add(plan: PlanFertilizer): CitedFertilizerFact[] {
    return fertilizerFacts(plan).map(f => {
      const key = `${f.id}:${f.text}`;
      const existing = this.byContent.get(key);
      if (existing) return existing;
      const fact = { ...f, citationId: `G${this.facts.size + 1}` };
      this.facts.set(fact.citationId, fact);
      this.byContent.set(key, fact);
      return fact;
    });
  }
  validate(text: string): { facts: CitedFertilizerFact[]; invalid: string[] } {
    const ids = [...new Set([...text.matchAll(/\[(G\d+)\]/g)].map(m => m[1]!))];
    return { facts: ids.filter(id => this.facts.has(id)).map(id => this.facts.get(id)!), invalid: ids.filter(id => !this.facts.has(id)) };
  }
}
export const FERTILIZER_CITATION_RULES = "Fertilizer guideline facts from build_rotation_plan carry G citation ids: cite them exactly like [G1], only after calling the tool this turn. These Kansas-specific guidelines are display-only, not the cost-model nitrogen or a prescription. Do not turn removal-only values or missing soil tests into application rates. Product amounts are lb product/acre, not gallons. Respect each fact's inputs, disclaimer and source page; do not invent seed-safe rates, timing, products or prices.";
