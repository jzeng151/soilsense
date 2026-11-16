import { describe, expect, it } from "vitest";
import { cropName, dictionaries, english, howItWorksCopy, howItWorksProducts, howItWorksSources, rotationText, translate, translateKnown, watchText } from "./i18n";
import type { TranslationKey } from "./i18n";
import { pageMessages, pageTranslate, pageWatchText } from "./i18n-pages";
import { LANGUAGE_LOCALES, parseLanguage, responseLanguageInstruction } from "../../src/shared/language";

const language = "zh-Hans";
const placeholders = (value: string) => (value.match(/\{\w+\}/g) ?? []).sort();

describe("Simplified Chinese web and planner language", () => {
  it("uses agricultural Chinese and preserves place names in rotations and copy", () => {
    const crops = {
      soybean: "大豆", corn: "玉米", winter_wheat: "冬小麦", sorghum: "谷物高粱",
      oats: "燕麦", alfalfa: "苜蓿 / 干草", fallow: "休耕（不种作物）",
    } as const;
    for (const crop of Object.keys(crops) as (keyof typeof crops)[]) expect(cropName(crop, language)).toBe(crops[crop]);
    expect(translate(language, "About your field in {place}.", { place: "Finney County, KS" })).toContain("Finney County, KS");
    expect(rotationText("Current pattern: Corn → Soybean", language)).toContain("玉米 → 大豆");
  });

  it("keeps provenance names and overwinter cover distinct from sowing time", () => {
    expect(translate(language, "U.S. Drought Monitor")).toContain("U.S. Drought Monitor");
    expect(translate(language, "+ {cover} over winter", { cover: "黑麦" })).toBe("+ 越冬覆盖作物：黑麦");
    expect(translateKnown(language, "Confirm alfalfa stand duration, soil pH, drainage and a hay market.")).toContain("苜蓿草地利用年限");
    for (const key of Object.keys(english).filter(key => key.startsWith("K-State Research and Extension MF2860") || key.startsWith("USDA NRCS Wind Erosion reference"))) {
      const output = translate(language, key as TranslationKey);
      for (const quote of key.matchAll(/"([^"]+)"/g)) expect(output).toContain(quote[1]);
      if (key.startsWith("K-State")) expect(output).toContain("Principles of Wind Erosion and Its Control");
    }
  });
  it("uses a validated preference, Chinese locale and explicit response language", () => {
    expect(parseLanguage(language)).toBe(language);
    expect(parseLanguage("arbitrary prompt text")).toBe("en");
    expect(LANGUAGE_LOCALES[language]).toBe("zh-CN");
    expect(responseLanguageInstruction(language)).toContain("Simplified Chinese (简体中文)");
  });

  it("interpolates deterministic watch text without losing amounts, units or field names", () => {
    const samples: [string, string, string[]][] = [
      ["Watch: rain below normal (0.10 in in 14 days)", "Watch: rain below normal ({rain} in in 14 days)", ["0.10", "in", "14"]],
      ["Dry spell starting: 0.10 in of rain in 14 days, drier than 95% of past years, and soil drier than usual (5th percentile)", "Dry spell starting: {rain} in of rain in 14 days, drier than {pct}% of past years, and soil drier than usual ({root} percentile)", ["0.10", "in", "14", "95%", "5"]],
      ["Historical replay: Not enough recent NASA data to check Finney County, KS", "Not enough recent NASA data to check {field}", ["Finney County, KS"]],
    ];
    for (const [input, key, values] of samples) {
      for (const [dictionary, output] of [[dictionaries[language], watchText(input, language)], [pageMessages[language], pageWatchText(language, input)]] as const) {
        if (dictionary[key]) expect(output).toMatch(/[\u3400-\u9fff]/);
        expect(placeholders(output)).toEqual([]);
        for (const value of values) expect(output).toContain(value);
      }
    }
  });

  it("reports main coverage without blocking new English keys and validates supplied placeholders", () => {
    const keys = Object.keys(english) as TranslationKey[];
    const missing = keys.filter(key => !dictionaries[language][key]);
    console.info(`Chinese coverage: ${keys.length - missing.length}/${keys.length}; ${missing.length} keys fall back to English`, missing);
    for (const [key, value] of Object.entries(dictionaries[language])) {
      if (value === undefined) continue;
      expect(value.trim(), key).not.toBe("");
      expect(placeholders(value), key).toEqual(placeholders(key in english ? english[key as TranslationKey] : key));
    }
    for (const key of missing) expect(translate(language, key)).toBe(english[key]);
  });

  it("reports How-it-works coverage and validates supplied paired copy", () => {
    const pairs: { en: string; "zh-Hans": string }[] = [];
    const visit = (value: unknown): void => {
      if (!value || typeof value !== "object") return;
      if ("en" in value && "zh-Hans" in value && typeof value.en === "string" && typeof value[language] === "string") pairs.push(value as { en: string; "zh-Hans": string });
      else Object.values(value).forEach(visit);
    };
    [howItWorksCopy, howItWorksProducts, howItWorksSources].forEach(visit);
    const missing = pairs.filter(pair => !dictionaries[language][pair.en]);
    console.info(`Chinese How-it-works coverage: ${pairs.length - missing.length}/${pairs.length}; ${missing.length} keys fall back to English`, missing.map(pair => pair.en));
    expect(pairs.length).toBeGreaterThan(0);
    for (const pair of pairs) {
      expect(pair[language], pair.en).toBe(dictionaries[language][pair.en] ?? pair.en);
      expect(placeholders(pair[language]), pair.en).toEqual(placeholders(pair.en));
    }
  });

  it("reports page coverage and validates supplied placeholders", () => {
    const keys = Object.keys(pageMessages.en);
    const missing = keys.filter(key => !pageMessages[language][key]);
    console.info(`Chinese page coverage: ${keys.length - missing.length}/${keys.length}; ${missing.length} keys fall back to English`, missing);
    for (const [key, value] of Object.entries(pageMessages[language])) {
      if (value === undefined) continue;
      expect(value.trim(), key).not.toBe("");
      expect(placeholders(value), key).toEqual(placeholders(key));
    }
    for (const key of missing) expect(pageTranslate(language, key)).toBe(key);
  });

  it("falls back to interpolated English when a translation is absent and preserves provider prose", () => {
    const key = "About your field in {place}.";
    const saved = dictionaries[language][key];
    try {
      delete dictionaries[language][key];
      expect(translate(language, key, { place: "Finney County, KS" })).toBe("About your field in Finney County, KS.");
    } finally {
      if (saved !== undefined) dictionaries[language][key] = saved;
    }
    const provider = "An unfamiliar provider message about corn.";
    expect(translateKnown(language, provider)).toBe(provider);
    expect(watchText(provider, language)).toBe(provider);
    expect(pageWatchText(language, provider)).toBe(provider);
    expect(pageTranslate(language, "Future copy for {place}", { place: "Finney County, KS" })).toBe("Future copy for Finney County, KS");
  });
});
