import { describe, expect, it } from "vitest";
import { cropName, cropText, rotationText, cropKeys, dictionaries, translate, translateKnown, watchText } from "./i18n";
import type { TranslationKey } from "./i18n";

describe("English and Spanish dictionaries", () => {
  it("has a nonempty Spanish translation for every English key", () => {
    expect(Object.keys(dictionaries.es).sort()).toEqual(Object.keys(dictionaries.en).sort());
    for (const key of Object.keys(dictionaries.en) as TranslationKey[]) {
      expect(dictionaries.es[key].trim(), key).not.toBe("");
      expect(dictionaries.es[key].match(/\{\w+\}/g) ?? [], key).toEqual(dictionaries.en[key].match(/\{\w+\}/g) ?? []);
    }
  });
  it("interpolates values without translating place names", () => {
    expect(translate("es", "About your field in {place}.", { place: "Finney County, KS" })).toBe("Sobre tu parcela en Finney County, KS.");
    expect(translate("en", "Option {number}", { number: 2 })).toBe("Option 2");
  });
  it("uses agricultural crop names", () => {
    for (const name of ["Alfalfa (hay)", "alfalfa (hay)"]) {
      expect(cropText(name, "es")).toBe("Alfalfa / heno");
      expect(cropText(name, "en")).toBe(name);
    }
    const current = "Current pattern: Corn → Soybean → Corn";
    expect(rotationText(current, "es")).toBe("Práctica actual: Maíz → Soja → Maíz");
    expect(rotationText(current, "en")).toBe(current);
    expect(cropName("winter_wheat", "es")).toBe("Trigo de invierno");
    expect(cropName("sorghum", "es")).toBe("Sorgo de grano");
    expect(cropName("fallow", "es")).toBe("Barbecho (sin cultivo)");
    for (const crop of Object.keys(cropKeys) as (keyof typeof cropKeys)[]) {
      expect(cropText(crop, "es")).toBe(cropName(crop, "es"));
      expect(cropText(cropName(crop, "en"), "es")).toBe(cropName(crop, "es"));
    }
    expect(rotationText("Wheat → Sorghum → Fallow", "es")).toBe("Trigo de invierno → Sorgo de grano → Barbecho (sin cultivo)");
    expect(translateKnown("es", "historical-cached")).toBe("histórico en caché");
    expect(translateKnown("es", "NASA/JPL GRACE/GRACE-FO RL06.3")).toBe("NASA/JPL GRACE/GRACE-FO RL06.3");
  });
  it("uses a contextual Sprout setup sentence instead of the inch abbreviation", () => {
    const sentence = "Sprout needs the Workers AI binding or a Gemini API key (GEMINI_API_KEY in .dev.vars). Restart the dev server after adding it.";
    expect(translateKnown("es", sentence)).toContain("GEMINI_API_KEY en .dev.vars");
    expect(translateKnown("es", sentence)).not.toContain("pulgadas");
    expect(translateKnown("en", sentence)).toBe(sentence);
    expect(translateKnown("es", "in")).toBe("pulgadas");
  });
  it("translates exact deterministic watch templates and preserves unfamiliar text", () => {
    const samples: [string, string][] = [
      ["Dry spell starting: 0.10 in of rain in 14 days, drier than 95% of past years, and soil drier than usual (5th percentile)", "percentil 5"],
      ["Watch: rain below normal (0.10 in in 14 days), soil unconfirmed", "suelo sin confirmar"],
      ["OK: 1.00 in of rain in 14 days, near normal for this time of year", "cerca de lo habitual"],
      ["Historical replay: Not enough recent NASA data to check Finney County", "Finney County"],
      ["Rain Feb 1–Feb 14: 0.10 in, drier than 95% of the same two weeks in 1991–2025 (typical: 1.00 in).", "Lluvia feb 1–feb 14"],
      ["Water balance Feb 1–Feb 14 (context only): rain minus estimated crop water demand is −0.50 in (demand 0.60 in, FAO-56 Hargreaves).", "−0.50 pulgadas"],
      ["Root-zone soil wetness (7 days to Feb 14): 5th percentile for this time of year.", "percentil 5"],
      ["Alfalfa (hay)'s reference stress window (04-01 to 09-01) isn't open, so no stress check this week", "alfalfa / heno"],
    ];
    for (const [value, expected] of samples) {
      expect(watchText(value, "es")).toContain(expected);
      expect(watchText(value, "es")).not.toBe(value);
      expect(watchText(value, "en")).toBe(value);
    }
    expect(watchText("An unfamiliar provider message about corn.", "es")).toBe("An unfamiliar provider message about corn.");
  });
});
