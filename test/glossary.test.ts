import { describe, expect, it } from "vitest";
import { GLOSSARY, GLOSSARY_ES, GLOSSARY_VERSION, glossaryContext, glossaryEntries, glossaryEntry } from "../src/shared/glossary";
describe("shared plain-language vocabulary", () => {
  it("has complete Spanish entries and preserves English defaults and source provenance", () => {
    expect(Object.keys(GLOSSARY_ES).sort()).toEqual(GLOSSARY.map(entry => entry.id).sort());
    expect(glossaryEntries()).toBe(GLOSSARY);
    for (const entry of GLOSSARY) {
      expect(glossaryEntry(entry.id)).toBe(entry);
      const es = glossaryEntry(entry.id, "es");
      expect(es.source).toBe(entry.source);
      for (const key of ["plain", "technical", "definition", "limit"] as const) expect(es[key].length).toBeGreaterThan(10);
      expect(es.definition).not.toBe(entry.definition);
    }
    const context = glossaryContext(["et", "ndvi", "drought-category", "et"], "es");
    expect(context).toContain("no equivale a extracción para riego");
    expect(context).toContain("no demuestra suelo descubierto");
    expect(context).toContain("D0 no es una categoría de sequía");
    expect(context.split("Agua que vuelve al aire (")).toHaveLength(2);
    expect(() => glossaryEntry("nonexistent", "es")).toThrow("Unknown glossary term");
  });
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
