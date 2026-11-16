// @vitest-environment happy-dom
import { act, createElement as h } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import type { FieldResearchNote } from "../../../src/shared/fieldResearch";
import { LanguageProvider, LANGUAGE_STORAGE_KEY, translate } from "../i18n";
import { ResearchNote } from "./ResearchNote";

it("uses the research template with Korean crop names while preserving the cited passage", async () => {
  const note: FieldResearchNote = {
    status: "live", template: "Research on winter wheat in dry conditions (shown as context, not advice for this field):",
    tags: ["winter_wheat"], cropSource: "watch settings", query: null, corpusVersion: "v1", reason: "",
    retrievedAt: null, embedding: { id: "fixture", model: "fixture", dimensions: 1, pooling: "mean" },
    passages: [{ chunkId: "r1", sourceId: "k-state", crops: ["winter_wheat"], sourceTitle: "K-State Research", sourceUrl: "https://example.com/research", year: 2025,
      attribution: "K-State", license: "CC BY", applicability: "Kansas", text: "Verbatim English research quotation.", score: 0.876 }],
  };
  localStorage.setItem(LANGUAGE_STORAGE_KEY, "ko");
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(h(LanguageProvider, { children: h(ResearchNote, { note }) })));
    expect(container.querySelector("section > p")?.textContent).toBe(translate("ko", "Research on {crops} in dry conditions (shown as context, not advice for this field):", { crops: "겨울밀" }));
    expect(container.querySelector("section > p")?.textContent).not.toContain("winter wheat");
    expect(container.querySelector("blockquote")?.textContent).toBe(note.passages[0]!.text);
    expect(container.querySelector("a")?.getAttribute("href")).toBe(note.passages[0]!.sourceUrl);
    expect(container.textContent).toContain("0.876");
  } finally {
    await act(async () => root.unmount());
    container.remove();
    localStorage.clear();
  }
});
