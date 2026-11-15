import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { passageFor } from "../src/worker/research/retrieve";
import { CORPUS } from "../src/worker/research/config";
import { expect, it } from "vitest";
import { ResearchNote } from "../web/src/components/ResearchNote";
import { researchNoteFor } from "../src/worker/fieldwatch/researchNote";
import { WATCHED_FIELDS } from "../src/worker/fieldwatch/run";

it("renders verbatim quotations with citation, year, applicability and score", async () => {
  const note = (await researchNoteFor("dry", {}, WATCHED_FIELDS[0]!))!;
  const passage = passageFor(CORPUS.chunks[0]!.id, 0.876)!;
  const html = renderToStaticMarkup(createElement(ResearchNote, { note: { ...note, status: "live", passages: [passage] } }));
  expect(html).toContain("<blockquote");
  expect(html).toContain(passage.text);
  expect(html).toContain(`href="${passage.sourceUrl.replaceAll("&", "&amp;")}"`);
  expect(html).toContain(String(passage.year));
  expect(html).toContain("Applicability:");
  expect(html).toContain("Retrieval score: 0.876");
  expect(html).toContain('aria-label="Cited research note"');
});

it("shows explicit unavailable research without inventing a passage", async () => {
  const note = await researchNoteFor("dry", {}, WATCHED_FIELDS[0]!);
  const html = renderToStaticMarkup(createElement(ResearchNote, { note }));
  expect(html).toContain("Research unavailable");
  expect(html).toContain("No matching research");
  expect(html).toContain("not advice for this field");
  expect(html).not.toContain("blockquote");
});
