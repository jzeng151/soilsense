import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildExplanation } from "../src/engine/explain";
import { GLOSSARY, glossaryContext, glossaryEntries, glossaryEntry } from "../src/shared/glossary";
import { GLOSSARY_KO } from "../src/shared/glossary-ko";
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

describe("English and Spanish output compatibility", () => {
  // Digests captured from the unchanged templates before adding Korean; existing snapshots stay untouched.
  it.each([
    ["en", "8f55ca7548bf323f63856a268f166aba755082c43cfd570ad5765ba47a60115e"],
    ["es", "8e4d5646cde1770c1d407735922963d10e8043708d64b5ef3d3018c90704a670"],
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
    expect(digest({
      outputs,
      glossary: glossaryEntries(language),
      context: glossaryContext([...GLOSSARY.map(e => e.id), "et"], language),
    })).toBe(expected);
  });
});

describe("Korean deterministic explanations", () => {
  it("localizes all three no-plan outputs and preserves the English default", () => {
    expect(buildExplanation({ ...base, plans: [], language: "ko" })).toEqual({
      summary: "실행 가능한 윤작 계획을 찾지 못했습니다.",
      speech: "이 위치에 대한 윤작 계획을 수립하지 못했습니다.",
      sms: "SoilSense: 이용 가능한 윤작 계획이 없습니다.",
    });
    expect(buildExplanation({ ...base, plans: [] })).toEqual(buildExplanation({ ...base, plans: [], language: "en" }));
    expect(buildExplanation({ ...base, plans: [plan()] })).toEqual(buildExplanation({ ...base, plans: [plan()], language: "en" }));
  });

  it.each([
    [0, "옥수수"], [1, "대두"], [2, "수수"], [3, "겨울밀"], [4, "귀리"], [5, "알팔파"], [6, "휴경(작물 미재배)"],
  ] as const)("uses the agricultural Korean name for %s", (index, name) => {
    const ko = buildExplanation({ ...base, plans: [plan(index)], language: "ko" });
    for (const output of Object.values(ko)) {
      expect(output).toContain(`2027년 ${name}`);
      expect(output).toContain("NASA 기후 자료 1991-2025년 기준.");
      expect(output).not.toMatch(/Corn|Soybean|Grain sorghum|Winter wheat|Fallow|Cereal rye/);
    }
    expect(ko.summary).toContain("권장 윤작");
    expect(ko.speech).toContain("농업지도 담당자");
    expect(ko.sms).toContain("농업지도 담당자");
  });

  it.each([
    [1, "호밀"], [2, "크림슨클로버"], [3, "헤어리베치"],
  ] as const)("names winter cover %s in all channels", (index, name) => {
    const ko = buildExplanation({ ...base, plans: [plan(0, index)], language: "ko" });
    for (const output of Object.values(ko)) expect(output).toContain(`2027년 옥수수, 겨울철 피복작물로 ${name} 재배`);
    expect(ko.speech).toContain("피복작물은 겨울철 토양을 보호합니다.");
    expect(ko.speech).not.toContain("→");
  });

  it.each([
    ["profit", "수익"], ["soil", "토양 건강"], ["risk", "위험 감소"], ["balanced", "수익, 토양 건강, 위험 간의 균형"],
  ] as const)("localizes priority %s", (priority, expected) => {
    const ko = buildExplanation({ ...base, plans: [plan()], language: "ko", priority });
    expect(ko.summary).toContain(`${expected}에 중점을 둔 권장 윤작`);
    expect(ko.speech).toContain(`${expected}에 중점을 둔 권장 윤작`);
  });

  it("keeps trend direction, rounding, units, dates and place names", () => {
    const ko = buildExplanation({
      ...base, plans: [plan()], language: "ko", placeName: "Finney County, KS",
      climate: { ...climate, indicators: [trend("gs_rain", "in", -1.26)] },
    });
    expect(ko.summary).toContain("Finney County, KS 인근 농경지의 NASA 자료");
    expect(ko.summary).toContain("생육기 강수량(5–9월) 지표는 10년마다 약 1.3 인치 감소");
    expect(ko.summary).toContain("통계적으로 유의");
    expect(ko.speech).toContain("1.3 인치 감소");
    expect(ko.sms).toContain("1991-2025");
  });

  it.each([
    ["hot_days", "days", "기온이 95°F 이상인 날의 수(6–8월)", "1 일", "화씨 95도"],
    ["spring_rain", "in", "봄철 강수량(4–5월)", "1.3 인치", "1.3 인치"],
    ["frost_free", "days", "무상기간", "1 일", "1 일"],
    ["gdd", "°F·days", "생육적산온도(5–9월)", "1 °F·일", "1화씨 도일"],
    ["dry_spell", "days", "여름철 최장 연속 건조일수(6–8월)", "1 일", "1 일"],
    ["summer_tmax", "°F", "여름철 평균 최고기온(6–8월)", "1 °F", "화씨 1도"],
    ["water_demand", "in", "작물 물 요구량(5–9월)", "1.3 인치", "1.3 인치"],
    ["water_balance", "in", "물수지: 강수량에서 물 요구량을 뺀 값(5–9월)", "1.3 인치", "1.3 인치"],
    ["soil_wetness", "%", "근권 토양 습윤도(6–8월)", "1 %p", "1퍼센트포인트"],
  ])("translates the %s indicator and its spoken units", (id, unit, label, amount, spoken) => {
    const ko = buildExplanation({ ...base, plans: [plan()], language: "ko", climate: { ...climate, indicators: [trend(id, unit)] } });
    expect(ko.summary).toContain(`${label} 지표는 10년마다 약 ${amount} 증가`);
    expect(ko.speech).toContain(spoken);
    expect(ko.speech).not.toMatch(/°F|%p|→/);
  });

  it("does not claim a significant trend or a cover benefit when absent", () => {
    const top = plan();
    top.years = top.years.map(y => ({ ...y, cover: "none", coverName: "None" }));
    top.coverYears = 0;
    const ko = buildExplanation({ ...base, plans: [top], language: "ko", climate: { ...climate, indicators: [trend("gs_rain", "in", 1.26, false)] } });
    expect(ko.summary).toContain("1991년 이후 강수량이나 고온에 통계적으로 뚜렷한 변화가 나타나지 않았습니다.");
    expect(ko.summary).not.toContain("통계적으로 유의");
    expect(ko.speech).not.toContain("피복작물");
  });

  it.each([100, -50, 20, 21])("preserves economics and nitrogen comparisons for a %s lb/acre difference", (nDiff) => {
    const top = plan();
    const currentPractice = { ...top, totalNitrogenLbPerAcre: top.totalNitrogenLbPerAcre + nDiff, avgNetReturnPerAcre: 150, scores: { ...top.scores, soil: 0.485 } };
    const args = {
      ...base, plans: [top], currentPractice, language: "ko" as const,
      facts: [{ id: "vs-current", text: "Original engine comparison", source: "SoilSense engine", kind: "economics" as const }],
    };
    const before = JSON.stringify(args);
    const ko = buildExplanation(args);
    expect(ko.summary).toContain("−$24.5/acre");
    expect(ko.summary).toContain(`3년간 질소 투입량은 ${Math.abs(nDiff)} lb/acre ${nDiff >= 0 ? "감소" : "증가"}`);
    expect(ko.summary).toContain("100점 만점에 권장 윤작 72점, 현재 재배 방식 49점");
    expect(ko.summary).not.toContain("Original engine comparison");
    expect(ko.speech.includes(`약 ${nDiff}파운드 적습니다.`)).toBe(nDiff > 20);
    expect(JSON.stringify(args)).toBe(before);
  });
});

describe("Korean glossary and shared context", () => {
  it("translates every current entry and preserves published source provenance", () => {
    const missing = GLOSSARY.filter(entry => !GLOSSARY_KO[entry.id]);
    console.info(`Korean glossary: ${GLOSSARY.length - missing.length}/${GLOSSARY.length}; ${missing.length} entries fall back to English`, missing.map(entry => entry.id));
    expect(glossaryEntries("ko")).toEqual(GLOSSARY.map(e => glossaryEntry(e.id, "ko")));
    for (const entry of GLOSSARY) {
      const ko = glossaryEntry(entry.id, "ko");
      expect(ko.id).toBe(entry.id);
      expect(ko.source).toBe(entry.source);
      if (!GLOSSARY_KO[entry.id]) { expect(ko).toEqual(entry); continue; }
      for (const key of ["plain", "technical", "definition", "limit"] as const) {
        expect(ko[key]).toMatch(/[가-힣]/);
        expect(ko[key]).not.toBe(entry[key]);
      }
    }
    expect(glossaryEntry("irrigation-allocation", "ko").limit).toContain("10인치");
    expect(glossaryEntry("gdd", "ko").definition).toContain("50°F");
    expect(glossaryEntry("gdd", "ko").definition).toContain("86°F");
    expect(glossaryEntry("frost-risk", "ko").definition).toContain("32°F");
    expect(() => glossaryEntry("nonexistent", "ko")).toThrow("Unknown glossary term");
  });

  it("localizes and deduplicates context while retaining important limits", () => {
    const context = glossaryContext(["et", "ndvi", "ndti", "drought-category", "reported-use", "crop-stage", "et"], "ko");
    expect(context).toMatch(/^용어집: plain-language-v1\n/);
    expect(context.split("대기로 되돌아가는 물 (")).toHaveLength(2);
    expect(context).toContain("관개를 위한 양수량과 같지 않습니다");
    expect(context).toContain("NDVI가 낮거나 없다는 사실만으로");
    expect(context).toContain("해당 자료 계층이 구현되어 있다는 뜻은 아닙니다");
    expect(context).toContain("D0는 가뭄 등급에 해당하지 않습니다");
    expect(context).toContain("현재 관정의 양수 능력 또는 현재 양수량과 같지 않습니다");
    expect(context).toContain("이 농경지에서 관측한 결과가 아닙니다");
    expect(context).toContain(`출처: ${glossaryEntry("et").source.url}`);
  });

  it("falls back to English when a translation is absent", () => {
    const translated = GLOSSARY_KO.et;
    try {
      delete GLOSSARY_KO.et;
      const english = glossaryEntry("et");
      expect(glossaryEntry("et", "ko")).toEqual(english);
      expect(glossaryEntries("ko").find(e => e.id === "et")).toEqual(english);
      expect(glossaryContext(["et"], "ko")).toContain(english.definition);
    } finally {
      GLOSSARY_KO.et = translated;
    }
  });
});
