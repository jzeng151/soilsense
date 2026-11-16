import type { UIMessageChunk } from "ai";
import { ChatResearch } from "./chat";
import type { ChatFieldMemory } from "../fieldMemory";
import type { FertilizerEvidence } from "../fertilizerFacts";

/** Finish-time enforcement: source links and quote cards are generated only from returned passages. */
export function checkedCitationStream(stream: ReadableStream<UIMessageChunk>, research: ChatResearch, memory?: ChatFieldMemory, fertilizer?: FertilizerEvidence): ReadableStream<UIMessageChunk> {
  let answer = "";
  return stream.pipeThrough(new TransformStream<UIMessageChunk, UIMessageChunk>({
    transform(part, controller) {
      if (part.type.startsWith("reasoning-")) return;
      if (part.type === "text-delta") answer += part.delta;
      // Dataset links are emitted by trusted tools separately. Never forward model-invented sources.
      if (part.type === "source-url" || part.type === "source-document") return;
      if (part.type === "finish") {
        if (part.finishReason === "length") controller.enqueue({ type: "data-answer-incomplete", data: true });
        const checked = research.validate(answer);
        const history = memory?.validate(answer) ?? { valid: [], records: [], invalid: [...new Set([...answer.matchAll(/\[(F\d+)\]/g)].map(m => m[1]!))] };
        const guideline = fertilizer?.validate(answer) ?? { facts: [], invalid: [...new Set([...answer.matchAll(/\[(G\d+)\]/g)].map(m => m[1]!))] };
        const invalid = [...checked.invalid, ...history.invalid, ...guideline.invalid];
        if (invalid.length) {
          console.warn(JSON.stringify({ msg: "scout invalid research citations", ids: invalid }));
          const id = "citation-warning";
          controller.enqueue({ type: "text-start", id });
          controller.enqueue({ type: "text-delta", id, delta: `\n\nCitation warning: ${invalid.map(x => `[${x}]`).join(", ")} were not returned by evidence search this turn. Those references are unverified; do not rely on them.` });
          controller.enqueue({ type: "text-end", id });
        }
        for (const p of checked.passages) {
          controller.enqueue({ type: "source-url", sourceId: p.citationId, url: p.sourceUrl, title: `[${p.citationId}] ${p.sourceTitle} (${p.year}) — ${p.applicability}` });
        }
        for (const record of history.records) {
          controller.enqueue({ type: "source-url", sourceId: record.citationId, url: record.sourceUrl, title: `[${record.citationId}] ${record.field_id} ${record.kind} (${record.date}) — historical record` });
        }
        for (const fact of guideline.facts) {
          controller.enqueue({ type: "source-url", sourceId: fact.citationId, url: fact.url, title: `[${fact.citationId}] ${fact.source} — guideline, not a prescription` });
        }
        if (memory) controller.enqueue({ type: "data-field-memory-citations", data: { records: history.records, invalid: history.invalid } });
        controller.enqueue({ type: "data-research-citations", data: { passages: checked.passages, invalid: checked.invalid } });
      }
      controller.enqueue(part);
    },
  }));
}
