import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parsePower } from "../../src/engine/climate";
import { buildPlan, type PlanInputs } from "../../src/engine/plan";
import type { FarmerYield } from "../../src/shared/types";
import { factText } from "./i18n-facts";

// Recorded weather parsed by the pure engine; no Worker helpers or live providers.
const inputs: PlanInputs = {
  request: { lat: 38.1095, lon: -100.706, irrigated: false, priority: "balanced", recentCrops: ["corn"] },
  climate: parsePower(JSON.parse(readFileSync(new URL("../../test/fixtures/power-finney-county-ks.json", import.meta.url), "utf8"))),
  soil: { available: true, source: "USDA SSURGO", ph: 6.4, organicMatterPct: 2, awc: 0.21, profileDepthCm: 200 },
  cropHistory: { available: false, source: "fixture", years: [] },
  county: { countyFips: "20055", countyName: "Finney County", stateCode: "KS", stateName: "Kansas" },
  now: new Date("2026-11-15T15:00:00Z"), planStartYear: 2027,
};
const records: FarmerYield[] = [
  ...[1900, 2024, 2025].map(year => ({ crop: "corn" as const, year, value: 70, unit: "bu/acre" as const })),
  ...(["soybean", "winter_wheat", "oats", "sorghum"] as const).map(crop => ({ crop, year: 2025, value: 40.5, unit: "bu/acre" as const })),
  { crop: "alfalfa", year: 2025, value: 3.2, unit: "tons/acre" },
];
const measured = buildPlan({ ...inputs, request: { ...inputs.request, soilTest: { ph: 5.8, organicMatterPct: 4, awc: 0.08, texture: "clay" }, yieldRecords: records } });
const farmerFacts = measured.facts.filter(f => f.id.startsWith("farmer-"));
const numbers = (value: string) => value.match(/\d+(?:\.\d+)?/g)?.sort();

describe.each(["ko", "zh-Hans"] as const)("%s farmer measurement facts", language => {
  const ko = language === "ko";

  it("translates every generated measurement fact, retaining all numbers, units and citation names", () => {
    expect(farmerFacts.map(f => f.id).sort()).toEqual([
      "farmer-soil-ph", "farmer-soil-organicMatterPct", "farmer-soil-awc", "farmer-om-limit",
      "farmer-yield-corn", "farmer-yield-soybean", "farmer-yield-winter_wheat", "farmer-yield-oats", "farmer-yield-sorghum", "farmer-yield-alfalfa",
    ].sort());
    for (const fact of farmerFacts) {
      const translated = factText(fact.text, language);
      expect(translated, fact.id).not.toBe(fact.text);
      expect(numbers(translated), fact.id).toEqual(numbers(fact.text));
      expect(factText(fact.text, "en")).toBe(fact.text);
      expect(factText(fact.text, "es")).toBe(fact.text);
      expect(factText(fact.source, language)).toBe(fact.source);
      for (const unit of ["cm/cm", "bu/acre", "US short tons/acre"]) {
        if (fact.text.includes(unit)) expect(translated).toContain(unit);
      }
    }
    expect(farmerFacts.find(f => f.id === "farmer-soil-ph")!.source).toBe("Farmer-entered soil test (unverified)");
    expect(farmerFacts.find(f => f.id === "farmer-yield-corn")!.source).toBe("Farmer-entered harvest records (unverified); SoilSense local calibration");
    expect(farmerFacts.find(f => f.id === "farmer-om-limit")!.source).toBe("SoilSense model limitation");
  });

  it("states the organic-matter limitation and preserves measured versus inferred capacity", () => {
    const text = (id: string) => factText(farmerFacts.find(f => f.id === id)!.text, language);
    expect(text("farmer-om-limit")).toBe(ko
      ? "입력한 유기물 값은 토양 근거에서 지도 값을 대체합니다. 모델은 유기물로부터 수량이나 수분 보유능의 변화를 추정하지 않습니다."
      : "您输入的有机质值替代土壤证据中的地图值；模型不会根据有机质推断产量或持水量的变化。");
    expect(text("farmer-soil-awc")).toBe(ko
      ? "토양 지도 값 0.21 cm/cm 대신 입력한 토양 검사 유효수분 보유능 0.08 cm/cm 값을 사용합니다."
      : "采用您输入的土壤检测有效持水量 0.08 cm/cm，替代土壤地图值 0.21 cm/cm。");
    expect(text("farmer-soil-organicMatterPct")).toBe(ko
      ? "토양 지도 값 2% 대신 입력한 토양 검사 유기물 4% 값을 사용합니다."
      : "采用您输入的土壤检测有机质 4%，替代土壤地图值 2%。");
    expect(text("farmer-soil-ph")).toBe(ko
      ? "토양 지도 값 6.4 대신 입력한 토양 검사 pH 5.8 값을 사용합니다."
      : "采用您输入的土壤检测pH 5.8，替代土壤地图值 6.4。");
  });

  it("labels calibration as calibration, never independent validation, with every caveat", () => {
    const labels: Record<string, string> = ko
      ? { corn: "옥수수", soybean: "대두", winter_wheat: "겨울밀", oats: "귀리", sorghum: "수수", alfalfa: "알팔파 / 건초" }
      : { corn: "玉米", soybean: "大豆", winter_wheat: "冬小麦", oats: "燕麦", sorghum: "谷物高粱", alfalfa: "苜蓿 / 干草" };
    const yields = farmerFacts.filter(f => f.id.startsWith("farmer-yield-"));
    expect(yields).toHaveLength(6);
    for (const fact of yields) {
      const text = factText(fact.text, language);
      expect(text).toContain(labels[fact.id.replace("farmer-yield-", "")]);
      for (const token of ko
        ? ["보정했습니다", "차이의 50%", "평균 ÷ 모델 기상 비율", "60–115%", "기상 이력 밖의", "최근 10년", "선택한 용수 공급과 통상적인 전작", "독립적인 검증이 아닙니다"]
        : ["进行校准", "差值的 50%", "平均值 ÷ 模拟气象比例", "60–115%", "气象历史范围之外", "最近 10 年", "所选供水方式和通常的前茬作物", "并非独立验证"]) expect(text).toContain(token);
    }
    const corn = factText(yields.find(f => f.id === "farmer-yield-corn")!.text, language);
    expect(corn).toContain("1900, 2024, 2025");
    expect(corn).toContain(ko ? "기상 이력 밖의 1년" : "气象历史范围之外的 1 年");
  });

  it("preserves unknown provider prose, source names and altered or partial templates verbatim", () => {
    const unknown = [
      "Provider says your soil test pH 5.8 is independently validated by NASA POWER.",
      "Farmer-entered soil test (unverified)", "Farmer records", "USDA NRCS SSURGO (Soil Data Access)",
      "Using your soil test provider property 1.2 instead of the soil map's 2.3.",
      "Using your soil test pH 5.8% instead of the soil map's 6.4%.",
      "Using your soil test pH 5.8 instead of the soil map's 6.4. Approximate capacity inferred from your sand texture; not measured.",
      "Using your soil test available water capacity 0.08 cm/cm instead of the soil map's 0.21 cm/cm. Approximate capacity inferred from your provider texture; not measured.",
      "Your provider crop yields are stored in this browser, but this crop is not modeled in this region; no calibration was applied.",
      ...farmerFacts.flatMap(f => ["Provider: " + f.text, f.text + " Provider addendum.", f.text.slice(0, -1)]),
      farmerFacts.find(f => f.id === "farmer-yield-corn")!.text.replace("not independent validation", "independent validation"),
    ];
    for (const value of unknown) expect(factText(value, language)).toBe(value);
  });
});

it("preserves the engine's scientific notation for small supplied soil measurements", () => {
  const plan = buildPlan({ ...inputs, request: { ...inputs.request, soilTest: { ph: 1e-7, organicMatterPct: 1e-7 } } });
  const facts = plan.facts.filter(f => f.id.startsWith("farmer-soil-"));
  expect(facts).toHaveLength(2);
  for (const fact of facts) {
    for (const language of ["ko", "zh-Hans"] as const) {
      const text = factText(fact.text, language);
      expect(text).not.toBe(fact.text);
      expect(text).toContain("1e-7");
      expect(numbers(text)).toEqual(numbers(fact.text));
    }
  }
});

it.each([
  ["sand", "사토", "砂土"], ["sandy_loam", "사양토", "砂壤土"], ["loam", "양토", "壤土"],
  ["silt_loam", "미사질양토", "粉砂壤土"], ["clay_loam", "식양토", "黏壤土"], ["clay", "식토", "黏土"],
] as const)("translates generated %s inference and unavailable map values without claiming a measurement", (texture, korean, chinese) => {
  const plan = buildPlan({ ...inputs, soil: { available: false, source: "USDA SSURGO" }, request: { ...inputs.request, soilTest: { ph: 5.8, organicMatterPct: 4, texture } } });
  const facts = plan.facts.filter(f => f.id.startsWith("farmer-soil-"));
  expect(facts).toHaveLength(3);
  for (const language of ["ko", "zh-Hans"] as const) {
    for (const fact of facts) {
      const text = factText(fact.text, language);
      expect(text).not.toBe(fact.text);
      expect(numbers(text)).toEqual(numbers(fact.text));
      expect(text).toContain(language === "ko" ? "자료 없음" : "无数据");
    }
    const awc = factText(facts.find(f => f.id === "farmer-soil-awc")!.text, language);
    expect(awc).toContain(language === "ko" ? korean : chinese);
    expect(awc).toContain(language === "ko" ? "추정한 대략적인 보유능이며 실측값이 아닙니다" : "粗略推断，并非实测值");
    expect(awc).toContain("cm/cm");
  }
});

it("translates the generated unmodeled-crop notice without changing its storage or no-calibration meaning", () => {
  const plan = buildPlan({ ...inputs, county: { countyFips: "19169", countyName: "Story County", stateCode: "IA", stateName: "Iowa" }, request: { ...inputs.request, yieldRecords: [{ crop: "sorghum", year: 2025, value: 80, unit: "bu/acre" }] } });
  const fact = plan.facts.find(f => f.id === "farmer-yield-sorghum")!;
  expect(fact.source).toBe("Farmer records");
  expect(factText(fact.text, "ko")).toBe("입력한 수수 수량은 이 브라우저에 저장되지만, 이 지역에서는 해당 작물을 모델링하지 않으므로 보정을 적용하지 않았습니다.");
  expect(factText(fact.text, "zh-Hans")).toBe("您的谷物高粱产量记录已保存在此浏览器中，但本地区未对该作物建模，因此未应用校准。");
  for (const language of ["en", "es"] as const) expect(factText(fact.text, language)).toBe(fact.text);
});
