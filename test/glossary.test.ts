import { describe, expect, it } from "vitest";
import { GLOSSARY, GLOSSARY_VERSION, glossaryContext, glossaryEntry } from "../src/shared/glossary";
describe("shared plain-language vocabulary", () => {
  it("has stable unique IDs, definitions, limits and source links for all required terms", () => {
    expect(new Set(GLOSSARY.map((entry) => entry.id)).size).toBe(GLOSSARY.length);
    for (const id of ["irrigation-allocation", "rainfall-anomaly", "historical-replay", "regional-grid", "et", "root-zone-moisture", "ndvi", "ndti", "gdd", "soil-erodibility", "margin", "drought-category", "reported-use", "crop-stage"]) {
      const entry = glossaryEntry(id);
      expect(entry.definition.length).toBeGreaterThan(20);
      expect(entry.limit.length).toBeGreaterThan(20);
      expect(entry.source.url).toMatch(/^https:\/\//);
    }
  });
  it("preserves important distinctions in shared context without claiming absent data capabilities", () => {
    const context = glossaryContext(["et", "ndvi", "ndti", "reported-use", "crop-stage", "drought-category", "et"]);
    expect(context).toContain(GLOSSARY_VERSION);
    expect(context).toContain("not irrigation pumping");
    expect(context).toContain("does not prove bare soil");
    expect(context).toContain("not the legal water right");
    expect(context).toContain("not an observation");
    expect(context).toContain("not an implemented SoilSense data layer");
    expect(context).toContain("D0 is not a drought category");
    expect(context.split("Water returned to the air (")).toHaveLength(2);
    expect(() => glossaryEntry("nonexistent")).toThrow("Unknown glossary term");
  });
});
