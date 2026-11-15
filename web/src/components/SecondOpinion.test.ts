import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SecondOpinionCard } from "./SecondOpinion";
import type { CropId, RotationPlan, SecondOpinion } from "../../../src/shared/types";

const file = JSON.parse(readFileSync("kansas-crop-rotation/data/app_rotation_advice.json", "utf8"));
const wheatRotation = { rank: 1, code: "W-S-F", name: "wheat-sorghum-fallow", weightPct: 38, crops: ["winter_wheat", "sorghum", "fallow"] as CropId[], note: null };
const opinion: SecondOpinion = {
  source: "Kansas model", sourceUrl: "https://example.com", dataThrough: file.data_through,
  disclaimer: file.disclaimer, county: "Finney County", region: "west", alert: "warning",
  droughtChanceNow: 0.9, rootzonePctNow: 5, dryYearRanking: true,
  rotations: [wheatRotation],
  byCurrentCrop: { wheat: { message: null, rotations: [wheatRotation] }, corn: { message: "Corn guidance", rotations: [] } },
};
const history = { available: true, source: "satellite", years: [{ year: 2025, crop: "corn" as const, cdlCode: 1, cdlName: "Corn" }] };
const plan = { years: [] } as unknown as RotationPlan;
function render(op: SecondOpinion = opinion, recentCrops?: CropId[]) {
  return renderToStaticMarkup(createElement(SecondOpinionCard, { op, plan, history, recentCrops, irrigated: false }));
}
const text = (html: string) => html.replace(/<[^>]*>/g, "").replaceAll("&#x27;", "'").replaceAll("&quot;", '"');

describe("Kansas second opinion card", () => {
  it("prefers the farmer's latest answer and maps winter wheat to the wheat ranking", () => {
    const html = text(render(opinion, ["corn", "winter_wheat"]));
    expect(html).toContain("If you're growing wheat now");
    expect(html).toContain("Based on your current-crop answer");
    expect(html).not.toContain("If you're growing corn now");
    expect(html).toContain("their first choice is Wheat → Sorghum → Fallow (38%)");
  });

  it("uses satellite history only when no current-crop answer was supplied", () => {
    expect(text(render())).toContain("If you're growing corn now");
    expect(text(render())).toContain("Based on satellite crop history");
    expect(text(render(opinion, []))).toContain("If you're growing corn now");
    expect(text(render(opinion, ["oats"]))).not.toContain("If you're growing corn now");
  });

  it("shows a current-crop message even when there are no matching rotations", () => {
    const op = { ...opinion, byCurrentCrop: { wheat: { rotations: [], message: "No suitable wheat rotation in this region." } } };
    expect(text(render(op, ["winter_wheat"]))).toContain("No suitable wheat rotation in this region.");
  });

  it("hides drought warnings and root-zone percentages, retaining the basis, date and disclaimer", () => {
    const html = text(render({ ...opinion, basis: "dry-year water (district on watch/warning)", dryYearRanking: false, droughtChanceNow: 0.987, rootzonePctNow: 99.9 }));
    expect(html).toContain("Ranked for a drier-than-normal season.");
    expect(html).not.toMatch(/chance of drought|Drought warning|Root-zone|99.9|99%/);
    expect(html).toContain(`Based on NASA data through ${file.data_through}`);
    expect(html).toContain(file.disclaimer);
    expect(text(render({ ...opinion, basis: "normal-year water", dryYearRanking: true }))).not.toContain("Ranked for a drier-than-normal season.");
    expect(text(render({ ...opinion, basis: undefined, dryYearRanking: true }))).toContain("Ranked for a drier-than-normal season.");
  });

  it("quotes the exact source credit lines from REFERENCES.md", () => {
    const refs = readFileSync("kansas-crop-rotation/reports/REFERENCES.md", "utf8").replace(/\s+/g, " ");
    const html = text(render());
    for (const start of ["The data was obtained from National", "The data was obtained from the POWER", "The U.S. Drought Monitor is jointly"]) {
      const quote = refs.slice(refs.indexOf(start)).split('"')[0]!;
      expect(html).toContain(quote);
    }
  });

  it("identifies the saved copy with its own data-through date", () => {
    expect(text(render({ ...opinion, savedCopy: true }))).toContain(`saved copy, data through ${file.data_through}`);
    expect(text(render())).not.toContain("saved copy");
  });
});
