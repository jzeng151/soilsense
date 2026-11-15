import type { LanguageModel, TextStreamPart, ToolSet } from "ai";
import { describe, expect, it, vi } from "vitest";
import { firstWorking } from "../src/worker/routes/scout";

type Part = TextStreamPart<ToolSet>;
const m = (id: string) => ({ provider: (id.startsWith("@cf/") ? "workers-ai" : "gemini") as "workers-ai" | "gemini", id, model: null as unknown as LanguageModel });
const fromParts = (parts: Part[], hang = false) =>
  new ReadableStream<Part>({
    start(c) {
      for (const p of parts) c.enqueue(p);
      if (!hang) c.close();
    },
  });
const read = async ({ stream: s }: { stream: ReadableStream<Part> }) => {
  const out: string[] = [];
  const r = s.getReader();
  for (;;) {
    const n = await r.read();
    if (n.done) return out;
    out.push(n.value.type === "text-delta" ? `text:${(n.value as { text: string }).text}` : n.value.type);
  }
};
const text = (t: string) => ({ type: "text-delta", id: "1", text: t }) as unknown as Part;
const start = { type: "start" } as unknown as Part;
const err = { type: "error", error: new Error("5035: not available") } as unknown as Part;

describe("Scout model fallback", () => {
  it("uses the first model when it answers", async () => {
    const used: string[] = [];
    const s = await firstWorking([m("@cf/a"), m("gemini")], (x) => (used.push(x.id), fromParts([start, text("hi"), text("!")])));
    expect(used).toEqual(["@cf/a"]);
    expect(await read(s)).toEqual(["start", "text:hi", "text:!"]);
  });

  it("falls back when the first model errors before answering", async () => {
    const used: string[] = [];
    const s = await firstWorking([m("@cf/a"), m("gemini")], (x) => (used.push(x.id), x.id === "@cf/a" ? fromParts([start, err]) : fromParts([start, text("ok")])));
    expect(used).toEqual(["@cf/a", "gemini"]);
    expect(s.model.id).toBe("gemini");
    expect(await read(s)).toEqual(["start", "text:ok"]);
  });

  it("falls back when the first model stays silent", async () => {
    const s = await firstWorking([m("@cf/a"), m("gemini")], (x) => (x.id === "@cf/a" ? fromParts([start], true) : fromParts([text("ok")])), 50);
    expect(await read(s)).toEqual(["text:ok"]);
  });

  it("bounds even the final silent model and aborts it", async () => {
    vi.useFakeTimers();
    try {
      let signal: AbortSignal | undefined;
      const pending = firstWorking([m("@cf/last")], (_, attempt) => { signal = attempt; return fromParts([start], true); }, 50);
      await vi.advanceTimersByTimeAsync(50);
      expect(await read(await pending)).toEqual(["start", "error"]);
      expect(signal?.aborted).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); }
  });

  it("never retries a stream once a tool call or partial answer is visible", async () => {
    const used: string[] = [];
    const toolCall = { type: "tool-call", toolCallId: "one", toolName: "send_plan_by_text", input: {} } as Part;
    const result = await firstWorking([m("@cf/first"), m("gemini")], candidate => { used.push(candidate.id); return fromParts([toolCall, err]); });
    expect(await read(result)).toEqual(["tool-call", "error"]);
    expect(used).toEqual(["@cf/first"]);
  });

  it("shows the error when the last model fails too", async () => {
    const s = await firstWorking([m("@cf/a"), m("gemini")], () => fromParts([start, err]));
    expect(await read(s)).toEqual(["start", "error"]);
  });
});
