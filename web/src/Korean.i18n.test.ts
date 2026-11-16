import { describe, expect, it } from "vitest";
import { cropName, dictionaries, english, howItWorksCopy, howItWorksProducts, howItWorksSources, rotationText, translate, watchText } from "./i18n";
import { LANGUAGE_LOCALES, parseLanguage, responseLanguageInstruction } from "../../src/shared/language";


describe("Korean web and planner language", () => {
  it("uses agricultural Korean and preserves interpolation values", () => {
    expect(cropName("soybean", "ko")).toBe("대두");
    expect(cropName("corn", "ko")).toBe("옥수수");
    expect(cropName("winter_wheat", "ko")).toBe("겨울밀");
    expect(cropName("sorghum", "ko")).toBe("수수");
    expect(translate("ko", "About your field in {place}.", { place: "Finney County, KS" })).toContain("Finney County, KS");
    expect(rotationText("Current pattern: Corn → Soybean", "ko")).toContain("옥수수 → 대두");
    expect(watchText("Watch: rain below normal (0.10 in in 14 days)", "ko")).toMatch(/[가-힣]/);
    expect(watchText("Watch: rain below normal (0.10 in in 14 days)", "ko")).toContain("0.10");
  });
  it("uses a validated preference and Korean locale", () => {
    expect(parseLanguage("ko")).toBe("ko");
    expect(parseLanguage("arbitrary prompt text")).toBe("en");
    expect(LANGUAGE_LOCALES.ko).toBe("ko-KR");
    expect(responseLanguageInstruction("ko")).toContain("Korean (한국어)");
  });
  it("reports How-it-works coverage without blocking new paired copy", () => {
    const pairs: { en: string; ko: string }[] = [];
    const visit = (value: unknown): void => {
      if (!value || typeof value !== "object") return;
      if ("en" in value && "ko" in value && typeof value.en === "string" && typeof value.ko === "string") pairs.push(value as { en: string; ko: string });
      else Object.values(value).forEach(visit);
    };
    [howItWorksCopy, howItWorksProducts, howItWorksSources].forEach(visit);
    const missing = pairs.filter(pair => !dictionaries.ko[pair.en]);
    console.info(`Korean How-it-works coverage: ${pairs.length - missing.length}/${pairs.length}; ${missing.length} keys fall back to English`, missing.map(pair => pair.en));
    expect(howItWorksCopy.title.ko).toMatch(/[가-힣]/);
    for (const pair of missing) expect(pair.ko).toBe(pair.en);
  });
  it("reports missing Korean keys without blocking parallel English additions", () => {
    const missing = Object.keys(english).filter(key => !dictionaries.ko[key as keyof typeof english]);
    console.info(`Korean coverage: ${Object.keys(english).length - missing.length}/${Object.keys(english).length}; ${missing.length} keys fall back to English`, missing);
    for (const [key, value] of Object.entries(dictionaries.ko)) {
      if (!value || !(key in english)) continue;
      expect((value.match(/\{\w+\}/g) ?? []).sort(), key).toEqual((english[key as keyof typeof english].match(/\{\w+\}/g) ?? []).sort());
    }
    for (const key of missing) expect(translate("ko", key as keyof typeof english)).toBe(english[key as keyof typeof english]);
  });
});
