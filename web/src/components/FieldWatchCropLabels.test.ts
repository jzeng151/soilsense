// @vitest-environment happy-dom
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { watchCropName, watchText } from "../i18n";
import { ResearchNote } from "./ResearchNote";
import type { FieldResearchNote } from "../../../src/shared/fieldResearch";

it.each([
  ["winter_wheat", "Winter wheat"], ["CORN", "Corn"], ["corn_silage", "Corn silage"],
  ["grain_sorghum", "Grain sorghum"], ["cover", "Cover crops"], ["new_crop", "New crop"],
])("formats the Field Watch label %s without changing its ID", (id, label) => {
  expect(watchCropName(id, "en")).toBe(label);
});
it("keeps translated crop labels and formats stored crop-window headlines", () => {
  expect(watchCropName("winter_wheat", "es")).toBe("Trigo de invierno");
  expect(watchCropName("winter_wheat", "ko")).not.toContain("_");
  expect(watchText("winter_wheat's reference stress window (03-01 to 06-01) isn't open, so no stress check this week", "en")).toMatch(/^Winter wheat's/);
});
it("formats research headings and tags but never rewrites quoted source text", () => {
  const note = { status: "live", tags: ["winter_wheat", "corn_silage"], template: "Research on winter wheat, corn silage in dry conditions (shown as context, not advice for this field):", cropSource: "watch settings", corpusVersion: "test-corpus", passages: [{ chunkId: "test", text: "Verbatim winter_wheat source notation.", sourceUrl: "https://example.org/research", sourceTitle: "Fixture source", year: 2024, applicability: "Fixture only", attribution: "Fixture", license: "CC BY 4.0" }] } as unknown as FieldResearchNote;
  const markup = renderToStaticMarkup(createElement(ResearchNote, { note }));
  expect(markup).toContain("Research on Winter wheat, Corn silage");
  expect(markup).toContain("Crop tags:");
  expect(markup).toContain("Verbatim winter_wheat source notation.");
  expect(note.tags).toEqual(["winter_wheat", "corn_silage"]);
});
