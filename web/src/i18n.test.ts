import { describe, expect, it } from "vitest";
import { cropName, dictionaries, translate } from "./i18n";
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
    expect(cropName("winter_wheat", "es")).toBe("Trigo de invierno");
    expect(cropName("sorghum", "es")).toBe("Sorgo de grano");
    expect(cropName("fallow", "es")).toBe("Barbecho (sin cultivo)");
  });
});
