import type { UIMessageChunk } from "ai";
import { ChatResearch } from "./chat";

/** Finish-time enforcement: source links and quote cards are generated only from returned passages. */
export function checkedCitationStream(stream: ReadableStream<UIMessageChunk>, research: ChatResearch): ReadableStream<UIMessageChunk> {
  let answer = "";
  return stream.pipeThrough(new TransformStream<UIMessageChunk, UIMessageChunk>({
    transform(part, controller) {
      if (part.type === "text-delta") answer += part.delta;
      // Dataset links are emitted by trusted tools separately. Never forward model-invented sources.
      if (part.type === "source-url" || part.type === "source-document") return;
      if (part.type === "finish") {
        const checked = research.validate(answer);
        if (checked.invalid.length) {
          console.warn(JSON.stringify({ msg: "scout invalid research citations", ids: checked.invalid }));
          const id = "citation-warning";
          controller.enqueue({ type: "text-start", id });
          controller.enqueue({ type: "text-delta", id, delta: `\n\nCitation warning: ${checked.invalid.map(x => `[${x}]`).join(", ")} were not returned by research search this turn. Those references are unverified; do not rely on them.` });
          controller.enqueue({ type: "text-end", id });
        }
        for (const p of checked.passages) {
          controller.enqueue({ type: "source-url", sourceId: p.citationId, url: p.sourceUrl, title: `[${p.citationId}] ${p.sourceTitle} (${p.year}) — ${p.applicability}` });
        }
        controller.enqueue({ type: "data-research-citations", data: { passages: checked.passages, invalid: checked.invalid } });
      }
      controller.enqueue(part);
    },
  }));
}
