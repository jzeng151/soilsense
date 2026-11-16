import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildExplanation } from "../src/engine/explain";
import { GLOSSARY, glossaryContext, glossaryEntries, glossaryEntry } from "../src/shared/glossary";
import { GLOSSARY_ZH } from "../src/shared/glossary-zh";
import type { ClimateIndicator, ClimateSummary, CoverId, CropId, Priority, RotationPlan } from "../src/shared/types";

const climate = { firstYear: 1991, lastYear: 2025, indicators: [], source: "NASA POWER" } as unknown as ClimateSummary;
const base = { climate, facts: [], priority: "balanced" as const, currentPractice: null };
const crops: [CropId, string][] = [
  ["corn", "Corn"], ["soybean", "Soybean"], ["sorghum", "Grain sorghum"],
  ["winter_wheat", "Winter wheat"], ["oats", "Oats"], ["alfalfa", "Alfalfa"], ["fallow", "Fallow"],
];
const covers: [CoverId, string][] = [
  ["none", "None"], ["cereal_rye", "Cereal rye"], ["crimson_clover", "Crimson clover"], ["hairy_vetch", "Hairy vetch"],
];
function plan(cropIndex = 0, coverIndex = 1): RotationPlan {
  const years = Array.from({ length: 3 }, (_, i) => {
    const [crop, cropName] = crops[(cropIndex + i) % crops.length]!;
    const [cover, coverName] = covers[(coverIndex + i) % covers.length]!;
    return { year: 2027 + i, crop, cropName, cover, coverName };
  });
  return {
    years, label: years.map(y => y.cropName).join(" → "),
    coverYears: years.filter(y => y.cover !== "none").length,
    totalNitrogenLbPerAcre: 150, avgNetReturnPerAcre: 125.5, scores: { soil: 0.723 },
  } as RotationPlan;
}
function trend(id: string, unit: string, changePerDecade = 1.26, significant = true): ClimateIndicator {
  return {
    id, label: `Indicator ${id}`, unit, changePerDecade,
    trend: { verdict: significant ? "significant_increase" : "no_clear_change" },
  } as ClimateIndicator;
}
function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

describe("English, Spanish and Korean output compatibility", () => {
  // Digests captured from unchanged templates before adding Chinese.
  it.each([
    ["en", "8f55ca7548bf323f63856a268f166aba755082c43cfd570ad5765ba47a60115e"],
    ["es", "8e4d5646cde1770c1d407735922963d10e8043708d64b5ef3d3018c90704a670"],
    ["ko", "d736afc6e16793b9de4c61d34f1ecfc63a3752ef946c0c377294c6d25ab02e03"],
  ] as const)("preserves every output byte for %s", (language, expected) => {
    const indicators = [
      [], [trend("hot_days", "days")], [trend("gs_rain", "in", -1.26)],
      [trend("gdd", "°F·days")], [trend("spring_rain", "in", 2.34, false)],
      [trend("gdd", "°F·days"), trend("dry_spell", "days", -2)],
    ];
    const outputs = [buildExplanation({ ...base, plans: [], language })];
    for (const priority of ["profit", "soil", "risk", "balanced"] satisfies Priority[]) {
      for (let cropIndex = 0; cropIndex < crops.length; cropIndex++) {
        for (let coverIndex = 0; coverIndex < covers.length; coverIndex++) {
          const top = plan(cropIndex, coverIndex);
          for (const nDiff of [null, 20, 21, -50]) {
            const currentPractice = nDiff === null ? null : { ...top, totalNitrogenLbPerAcre: 150 + nDiff };
            for (const [i, trends] of indicators.entries()) {
              outputs.push(buildExplanation({
                ...base, plans: [top], language, priority, currentPractice,
                climate: { ...climate, indicators: trends },
                placeName: i % 2 ? "Finney County, KS" : undefined,
                facts: i % 2 ? [{ id: "vs-current", text: "Estimated +$25.5/acre; 21 lb/acre less nitrogen.", source: "SoilSense engine", kind: "economics" }] : [],
              }));
            }
          }
        }
      }
    }
    const actual = digest({
      outputs,
      glossary: glossaryEntries(language),
      context: glossaryContext([...GLOSSARY.map(e => e.id), "et"], language),
    });
    expect(actual).toBe(expected);
  });
});

describe("Simplified Chinese deterministic explanations", () => {
  it("localizes all three no-plan outputs and preserves the English default", () => {
    expect(buildExplanation({ ...base, plans: [], language: "zh-Hans" })).toEqual({
      summary: "未找到可行的轮作方案。",
      speech: "无法为此地点制定轮作方案。",
      sms: "SoilSense：暂无可用的轮作方案。",
    });
    expect(buildExplanation({ ...base, plans: [] })).toEqual(buildExplanation({ ...base, plans: [], language: "en" }));
    expect(buildExplanation({ ...base, plans: [plan()] })).toEqual(buildExplanation({ ...base, plans: [plan()], language: "en" }));
  });

  it.each([
    [0, "玉米"], [1, "大豆"], [2, "谷物高粱"], [3, "冬小麦"], [4, "燕麦"], [5, "苜蓿"], [6, "休耕（不种植作物）"],
  ] as const)("uses the agricultural Chinese name for crop %s", (index, name) => {
    const args = { ...base, plans: [plan(index)], language: "zh-Hans" as const };
    const zh = buildExplanation(args);
    expect(buildExplanation(args)).toEqual(zh);
    for (const output of Object.values(zh)) {
      expect(output).toContain(index === 6 ? `2027年${name}` : `2027年种植${name}`);
      expect(output).not.toContain("种植休耕");
      expect(output).toContain("依据NASA气候数据（1991-2025年）。");
      expect(output).not.toMatch(/Corn|Soybean|Grain sorghum|Winter wheat|Fallow|Cereal rye|undefined|NaN/);
    }
    expect(zh.summary).toContain("轮作");
    expect(zh.speech).toContain("农业推广人员");
    expect(zh.sms).toContain("农业推广人员");
  });

  it.each([
    [1, "黑麦"], [2, "绛三叶"], [3, "毛叶苕子"],
  ] as const)("names winter cover %s in all channels", (index, name) => {
    const zh = buildExplanation({ ...base, plans: [plan(0, index)], language: "zh-Hans" });
    for (const output of Object.values(zh)) expect(output).toContain(`2027年种植玉米，以${name}作为越冬覆盖作物`);
    expect(zh.speech).toContain("覆盖作物可在冬季保护土壤。");
    expect(zh.speech).not.toContain("→");
  });

  it.each([
    ["profit", "收益"], ["soil", "土壤健康"], ["risk", "降低风险"], ["balanced", "兼顾收益、土壤健康和风险"],
  ] as const)("localizes priority %s", (priority, expected) => {
    const zh = buildExplanation({ ...base, plans: [plan()], language: "zh-Hans", priority });
    expect(zh.summary).toContain(`以${expected}为重点`);
    expect(zh.speech).toContain(`以${expected}为重点`);
  });

  it("keeps trend direction, rounding, US units, dates and place names", () => {
    const zh = buildExplanation({
      ...base, plans: [plan()], language: "zh-Hans", placeName: "Finney County, KS",
      climate: { ...climate, indicators: [trend("gs_rain", "in", -1.26)] },
    });
    expect(zh.summary).toContain("Finney County, KS附近农田");
    expect(zh.summary).toContain("生长季降水量（5–9月）每10年约减少1.3 in");
    expect(zh.summary).toContain("统计显著性");
    expect(zh.speech).toContain("减少1.3英寸");
    expect(zh.sms).toContain("1991-2025");
  });

  it.each([
    ["hot_days", "days", "气温达到或超过95°F的天数（6–8月）", "1 days", "华氏95度", "1天"],
    ["spring_rain", "in", "春季降水量（4–5月）", "1.3 in", "1.3英寸", "1.3英寸"],
    ["frost_free", "days", "无霜期", "1 days", "1天", "1天"],
    ["gdd", "°F·days", "生长度日（5–9月）", "1 °F·days", "1华氏度日", "1华氏度日"],
    ["dry_spell", "days", "夏季最长连续干旱天数（6–8月）", "1 days", "1天", "1天"],
    ["summer_tmax", "°F", "夏季平均最高气温（6–8月）", "1 °F", "华氏1度", "华氏1度"],
    ["water_demand", "in", "作物需水量（5–9月）", "1.3 in", "1.3英寸", "1.3英寸"],
    ["water_balance", "in", "水分平衡：降水量减去需水量（5–9月）", "1.3 in", "1.3英寸", "1.3英寸"],
    ["soil_wetness", "%", "根区土壤湿润度（6–8月）", "1 个百分点", "1 个百分点", "1 个百分点"],
  ])("translates the %s indicator and its spoken units", (id, unit, label, amount, spokenLabel, spokenAmount) => {
    const zh = buildExplanation({ ...base, plans: [plan()], language: "zh-Hans", climate: { ...climate, indicators: [trend(id, unit)] } });
    expect(zh.summary).toContain(`${label}每10年约增加${amount}`);
    expect(zh.speech).toContain(spokenLabel);
    expect(zh.speech).toContain(spokenAmount);
    expect(zh.speech).not.toMatch(/°F|\bdays\b|\bin\b|→/);
  });

  it("selects a significant key trend and falls back to unknown indicator labels and units", () => {
    const zh = buildExplanation({
      ...base, plans: [plan()], language: "zh-Hans",
      climate: { ...climate, indicators: [trend("gdd", "°F·days"), trend("gs_rain", "in", -2.34), trend("hot_days", "days", 4, false)] },
    });
    expect(zh.summary).toContain("生长季降水量（5–9月）每10年约减少2.3 in");
    expect(zh.summary).not.toContain("统计上明确的变化");
    const unknown = buildExplanation({ ...base, plans: [plan()], language: "zh-Hans", climate: { ...climate, indicators: [trend("future_indicator", "custom-unit", 3.2)] } });
    expect(unknown.summary).toContain("Indicator future_indicator每10年约增加3 custom-unit");
  });

  it("does not claim significant trends, cover benefits or unsupported comparisons when absent", () => {
    const top = plan();
    top.years = top.years.map(y => ({ ...y, cover: "none", coverName: "None" }));
    top.coverYears = 0;
    const zh = buildExplanation({
      ...base, plans: [top], language: "zh-Hans", currentPractice: top,
      climate: { ...climate, indicators: [trend("gs_rain", "in", 1.26, false)] },
    });
    expect(zh.summary).toContain("自1991年以来，您的农田的降水或高温未出现统计上明确的变化。");
    expect(zh.summary).not.toContain("统计显著性");
    expect(zh.summary).not.toContain("净收益差额");
    expect(zh.speech).not.toContain("覆盖作物");
  });

  it.each([100, -50, 20, 21, 0])("preserves economics and nitrogen comparisons for a %s lb/acre difference", (nDiff) => {
    const top = plan();
    const currentPractice = { ...top, totalNitrogenLbPerAcre: top.totalNitrogenLbPerAcre + nDiff, avgNetReturnPerAcre: 150, scores: { ...top.scores, soil: 0.485 } };
    const args = {
      ...base, plans: [top], currentPractice, language: "zh-Hans" as const,
      facts: [{ id: "vs-current", text: "Original engine comparison", source: "SoilSense engine", kind: "economics" as const }],
    };
    const before = JSON.stringify(args);
    const zh = buildExplanation(args);
    expect(zh.summary).toContain("−$24.5/acre");
    expect(zh.summary).toContain(`3年内氮肥投入量${nDiff >= 0 ? "减少" : "增加"}${Math.abs(nDiff)} lb/acre`);
    expect(zh.summary).toContain("满分为100分，建议轮作为72分，当前种植方式为49分");
    expect(zh.summary).not.toContain("Original engine comparison");
    expect(zh.speech.includes(`约减少${nDiff}磅`)).toBe(nDiff > 20);
    expect(JSON.stringify(args)).toBe(before);
  });

  it.each([100, 125.5])("preserves positive and zero return differences against %s dollars", (currentReturn) => {
    const top = plan();
    const zh = buildExplanation({
      ...base, plans: [top], currentPractice: { ...top, avgNetReturnPerAcre: currentReturn }, language: "zh-Hans",
      facts: [{ id: "vs-current", text: "English evidence", source: "SoilSense engine", kind: "economics" }],
    });
    expect(zh.summary).toContain(`+$${125.5 - currentReturn}/acre`);
  });
});

describe("Simplified Chinese glossary and shared context", () => {
  const missing = GLOSSARY.filter(entry => !GLOSSARY_ZH[entry.id]);
  it(`reports coverage without blocking future English entries: ${GLOSSARY.length - missing.length}/${GLOSSARY.length}; ${missing.length} missing`, () => {
    console.info(`Chinese glossary: ${GLOSSARY.length - missing.length}/${GLOSSARY.length}; ${missing.length} entries fall back to English`, missing.map(entry => entry.id));
    expect(glossaryEntries("zh-Hans")).toEqual(GLOSSARY.map(e => glossaryEntry(e.id, "zh-Hans")));
    for (const entry of GLOSSARY) {
      const zh = glossaryEntry(entry.id, "zh-Hans");
      expect(zh.id).toBe(entry.id);
      expect(zh.source).toBe(entry.source);
      if (!GLOSSARY_ZH[entry.id]) { expect(zh).toEqual(entry); continue; }
      for (const key of ["plain", "technical", "definition", "limit"] as const) {
        expect(zh[key]).toMatch(/[\u3400-\u9fff]/);
        expect(zh[key]).not.toBe(entry[key]);
        expect(zh[key]).not.toMatch(/TODO|TBD|PLACEHOLDER|待翻译|占位|undefined|\uFFFD|<[^>]+>/i);
        expect(zh[key].match(/\{[^}]+\}|%[sd]/g) ?? []).toEqual(entry[key].match(/\{[^}]+\}|%[sd]/g) ?? []);
        expect(zh[key].match(/\d+(?:\.\d+)?/g) ?? []).toEqual(entry[key].match(/\d+(?:\.\d+)?/g) ?? []);
      }
    }
    expect(() => glossaryEntry("nonexistent", "zh-Hans")).toThrow("Unknown glossary term");
  });

  it("preserves US unit thresholds in provided translations", () => {
    if (GLOSSARY_ZH["irrigation-allocation"]) expect(glossaryEntry("irrigation-allocation", "zh-Hans").limit).toContain("10英寸");
    if (GLOSSARY_ZH.gdd) {
      expect(glossaryEntry("gdd", "zh-Hans").definition).toContain("50°F");
      expect(glossaryEntry("gdd", "zh-Hans").definition).toContain("86°F");
    }
    if (GLOSSARY_ZH["frost-risk"]) expect(glossaryEntry("frost-risk", "zh-Hans").definition).toContain("32°F");
  });

  it("localizes and deduplicates context while retaining important limits", () => {
    const context = glossaryContext(["et", "ndvi", "ndti", "drought-category", "reported-use", "crop-stage", "et"], "zh-Hans");
    expect(context).toMatch(/^术语表: plain-language-v1\n/);
    expect(context.split(`${glossaryEntry("et", "zh-Hans").plain} (`)).toHaveLength(2);
    for (const id of ["et", "ndvi", "ndti", "drought-category", "reported-use", "crop-stage"]) {
      expect(context).toContain(glossaryEntry(id, "zh-Hans").limit);
    }
    expect(context).toContain(`来源: ${glossaryEntry("et").source.url}`);
    expect(glossaryEntry("et", "zh-Hans").limit).toContain("不等于灌溉抽水量");
    expect(glossaryEntry("ndvi", "zh-Hans").limit).toContain("并不能证明土壤裸露");
    expect(glossaryEntry("ndti", "zh-Hans").limit).toContain("并不表示SoilSense已实现该数据图层");
    expect(glossaryEntry("drought-category", "zh-Hans").limit).toContain("D0不属于干旱等级");
    expect(glossaryEntry("reported-use", "zh-Hans").limit).toContain("水井当前供水能力或当前抽水量");
    expect(glossaryEntry("crop-stage", "zh-Hans").limit).toContain("不是对该农田的实际观测");
  });

  it("falls back to English when a translation is absent", () => {
    const translated = GLOSSARY_ZH.et;
    try {
      delete GLOSSARY_ZH.et;
      const english = glossaryEntry("et");
      expect(glossaryEntry("et", "zh-Hans")).toEqual(english);
      expect(glossaryEntries("zh-Hans").find(e => e.id === "et")).toEqual(english);
      expect(glossaryContext(["et"], "zh-Hans")).toContain(english.definition);
    } finally {
      GLOSSARY_ZH.et = translated;
    }
  });
});

