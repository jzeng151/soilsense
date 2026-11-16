import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ASSUMPTIONS, buildPlan } from "../../src/engine/plan";
import type { PlanInputs } from "../../src/engine/plan";
import { parsePower, type PowerResponse } from "../../src/engine/climate";
import { CDL_NAMES } from "../../src/engine/crops";
import { factText } from "./i18n-facts";

describe("Korean deterministic reason facts", () => {
  it.each([
    ["Growing-season rain (May–Sep)", "생육기 강수량(5–9월)", "in"],
    ["Spring rain (Apr–May)", "봄철 강수량(4–5월)", "in"],
    ["Days at or above 95°F (Jun–Aug)", "95°F 이상인 날의 수(6–8월)", "days"],
    ["Frost-free season", "무상기간", "days"],
    ["Growing degree days (May–Sep)", "생육적산온도(5–9월)", "°F·days"],
    ["Growing-season warmth (May–Sep)", "생육기 온열량(5–9월)", "heat units"],
    ["Longest summer dry spell (Jun–Aug)", "여름철 최장 연속 건조일수(6–8월)", "days"],
    ["Average summer high (Jun–Aug)", "여름철 평균 최고기온(6–8월)", "°F"],
    ["Crop water demand (May–Sep)", "작물 물 요구량(5–9월)", "in"],
    ["Water balance: rain minus demand (May–Sep)", "물수지: 강수량에서 물 요구량을 뺀 값(5–9월)", "in"],
    ["Root-zone soil wetness (Jun–Aug)", "근권 토양 습윤도(6–8월)", "%"],
  ])("translates the complete %s trend and retains scientific values", (label, korean, unit) => {
    expect(factText(`${label} is rising: +1.25 ${unit} per decade since 1991 (statistically significant, p = 0.003).`, "ko"))
      .toBe(`${korean}: 1991년 이후 10년마다 +1.25 ${unit} 증가 (통계적으로 유의함, p = 0.003).`);
    expect(factText(`${label} is falling: -1.25 ${unit} per decade since 1991.`, "ko"))
      .toBe(`${korean}: 1991년 이후 10년마다 -1.25 ${unit} 감소.`);
    expect(factText(`${label}: no statistically clear change since 1991 (+0.01 ${unit} per decade, p = 0.64).`, "ko"))
      .toBe(`${korean}: 1991년 이후 뚜렷한 변화 없음 (10년마다 +0.01 ${unit}, p = 0.64).`);
    expect(factText(`${label}: no clear change since 1991.`, "ko"))
      .toBe(`${korean}: 1991년 이후 뚜렷한 변화 없음.`);
  });

  it("handles the actual App.plain transformations", () => {
    const plain = (value: string) => value
      .replace(/\s*\([^)]*\bp\s*[=<]\s*[\d.]+[^)]*\)/g, "")
      .replace(/no statistically clear change/gi, "no clear change")
      .replace(/Growing degree days \(May–Sep\)/g, "Growing-season warmth (May–Sep)")
      .replace(/°F·days/g, "heat units");
    expect(factText(plain("Growing degree days (May–Sep) is rising: +52.3 °F·days per decade since 1991 (statistically significant, p = 0.002)."), "ko"))
      .toBe("생육기 온열량(5–9월): 1991년 이후 10년마다 +52.3 heat units 증가.");
    expect(factText(plain("Growing-season rain (May–Sep): no statistically clear change since 1991 (-0.02 in per decade, p = 0.78)."), "ko"))
      .toBe("생육기 강수량(5–9월): 1991년 이후 뚜렷한 변화 없음.");
  });

  it.each([
    ["Satellite crop map shows this field was corn 3 of 5 years, soybeans 1 of 5 years, provider crop 1 of 5 years (2021–2025).", "위성 작물 지도에 따르면 이 포장의 재배 이력은 옥수수 5년 중 3년, 대두 5년 중 1년, provider crop 5년 중 1년입니다(2021–2025)."],
    ["Recent crops (as reported): corn, then soybean, then alfalfa (hay).", "최근 재배 작물(보고된 내용): 옥수수 → 대두 → 알팔파 / 건초."],
    ["Soil: Harney silt loam, 0 to 1 percent slopes, well drained, pH 6.2, 2.7% organic matter.", "토양: Harney silt loam, 0 to 1 percent slopes, 양호한 배수, pH 6.2, 유기물 2.7%."],
    ["Soil: pH 7.0.", "토양: pH 7.0."],
    ["Corn prefers pH ≥ 5.8; topsoil pH is 5.2 (lime would help).", "옥수수의 적정 pH는 ≥ 5.8이며 표토 pH는 5.2입니다(석회 시용이 도움이 됩니다)."],
    ["Alfalfa (hay) does poorly on very poorly drained soils.", "알팔파 / 건초 재배는 매우 불량한 배수 토양에서 생육이 좋지 않습니다."],
    ["Planting winter wheat again right after winter wheat increases pest and disease pressure.", "겨울밀 연작은 해충과 병해 부담을 키웁니다."],
    ["Winter cover crops in 2 of 3 years protect soil from erosion and hold nitrogen over winter.", "3년 중 2년에 재배하는 겨울 피복작물은 토양 침식을 막고 겨울 동안 질소를 보유합니다."],
    ["Compared with continuing the current pattern (Corn → Soybean → Corn): estimated +$127.5/acre per year, 50 lb/acre less nitrogen over 3 years, and a soil-health score of 83 vs 41 out of 100.", "현재 재배 방식(옥수수 → 대두 → 옥수수)을 유지할 때와 비교: 연간 추정 순수익 차이 +$127.5/acre, 3년간 질소 50 lb/acre 감소, 토양 건강 점수는 100점 만점에 83 대 41입니다."],
    ["Compared with continuing the current pattern (Winter wheat → Grain sorghum → Fallow (no crop)): estimated −$19/acre per year, 12.5 lb/acre more nitrogen over 3 years, and a soil-health score of 75 vs 29 out of 100.", "현재 재배 방식(겨울밀 → 수수 → 휴경(작물 없음))을 유지할 때와 비교: 연간 추정 순수익 차이 −$19/acre, 3년간 질소 12.5 lb/acre 증가, 토양 건강 점수는 100점 만점에 75 대 29입니다."],
  ])("translates %s", (value, expected) => {
    expect(factText(value, "ko")).toBe(expected);
  });

  it("translates every known satellite class only inside the count template", () => {
    for (const name of Object.values(CDL_NAMES)) {
      const lower = name.toLowerCase();
      const value = `Satellite crop map shows this field was ${lower} 2 of 5 years (2021–2025).`;
      expect(factText(value, "ko"), name).not.toContain(lower);
      expect(factText(value, "ko")).toContain("5년 중 2년");
      expect(factText(`Provider mentions ${lower} 2 of 5 years.`, "ko")).toBe(`Provider mentions ${lower} 2 of 5 years.`);
    }
  });

  it.each([
    ["water", "수분 부족"], ["heat", "고온"], ["season length", "생육기간"],
    ["wet spring", "습한 봄"], ["winter cold", "겨울 추위"], ["too much rain", "과도한 강우"],
  ])("translates NASA replay stress %s without changing counts", (stress, korean) => {
    const value = `Replaying 35 years of NASA weather (shifted to today's trends) with soil water carried from the crop before, grain sorghum in this rotation would have been stressed in about 12 of 35 years, mostly from ${stress} (irrigated).`;
    expect(factText(value, "ko")).toBe(`현재 추세로 보정한 35년간의 NASA 기상 자료를 이전 작물의 토양 수분을 이월하여 재현하면, 이 윤작의 수수 재배는 35년 중 약 12년에 스트레스를 받았을 것으로 추정됩니다 (주원인: ${korean}) (관개).`);
  });

  it("handles NASA replay with neither a stress cause nor irrigation", () => {
    expect(factText("Replaying 34 years of NASA weather (shifted to today's trends) with soil water carried from the crop before, corn in this rotation would have been stressed in about 0 of 34 years.", "ko"))
      .toBe("현재 추세로 보정한 34년간의 NASA 기상 자료를 이전 작물의 토양 수분을 이월하여 재현하면, 이 윤작의 옥수수 재배는 34년 중 약 0년에 스트레스를 받았을 것으로 추정됩니다.");
  });

  it.each([
    ["drought or heat", "가뭄 또는 고온"], ["too much rain or flooding", "과도한 강우 또는 홍수"],
    ["hail", "우박"], ["wind storms", "폭풍"], ["freeze or cold", "동결 또는 추위"],
    ["disease or insects", "병해 또는 해충"], ["other causes", "기타 원인"],
  ])("translates insured loss cause %s", (cause, korean) => {
    expect(factText(`Since 1991, crop insurance in Finney County, KS paid for corn losses mostly because of ${cause} (67% of payouts, in 19 years).`, "ko"))
      .toBe(`1991년 이후 Finney County, KS에서 옥수수 손실에 지급된 작물 보험금의 주원인은 ${korean}(보험금의 67%, 19년)입니다.`);
  });

  it("handles two insured loss causes and the unnamed county", () => {
    expect(factText("Since 1991, crop insurance in this county paid for soybean losses mostly because of drought or heat (61% of payouts, in 23 years) and hail (17% of payouts, in 8 years).", "ko"))
      .toBe("1991년 이후 이 카운티에서 대두 손실에 지급된 작물 보험금의 주원인은 가뭄 또는 고온(보험금의 61%, 23년) 및 우박(보험금의 17%, 8년)입니다.");
  });

  it.each([
    ["A fallow season (no crop, weeds controlled) stores roughly a quarter of the rain that falls during it in the soil, which raises the next crop's yield in dry areas, at the cost of a year without income and more erosion risk on bare ground.", "휴경기"],
    ["Corn after soybean typically yields about 10–15% more and needs roughly 50 lb/acre less nitrogen than corn after corn.", "10–15%"],
    ["First-year corn after alfalfa usually needs little or no added nitrogen.", "추가 질소가 거의 또는 전혀"],
    ["Adding a small grain (wheat or oats) breaks corn and soybean pest cycles and opens a summer window for a legume cover crop.", "콩과 피복작물"],
  ])("translates static agronomy: %s", (value, expected) => {
    expect(factText(value, "ko")).toContain(expected);
    expect(factText(value, "ko")).toMatch(/[가-힣]/);
    if (value.includes("50 lb/acre")) expect(factText(value, "ko")).toContain("50 lb/acre");
  });
});

describe("Korean plan assumptions", () => {
  it("covers buildFacts output and assumptions from a captured USDA/NASA plan", () => {
    const captured = JSON.parse(readFileSync(new URL("../../test/fixtures/plan-finney-inputs.json", import.meta.url), "utf8")) as Omit<PlanInputs, "climate" | "cropHistory" | "now"> & { now: string };
    const power = JSON.parse(readFileSync(new URL("../../test/fixtures/power-finney-county-ks.json", import.meta.url), "utf8")) as PowerResponse;
    const plan = buildPlan({
      ...captured,
      climate: parsePower(power),
      cropHistory: { available: true, source: "Test crop history", years: [
        { year: 2023, crop: "winter_wheat", cdlCode: 24, cdlName: "Winter wheat" },
        { year: 2024, crop: "corn", cdlCode: 1, cdlName: "Corn" },
        { year: 2025, crop: "winter_wheat", cdlCode: 24, cdlName: "Winter wheat" },
      ] },
      now: new Date(captured.now),
    });
    const facts = plan.facts.filter(fact => !/^(farmer-|goal-|advice-|pest-)/.test(fact.id));
    for (const value of [...facts.map(fact => fact.text), ...plan.assumptions]) {
      expect(factText(value, "ko"), value).not.toBe(value);
      expect(factText(value, "ko"), value).toMatch(/[가-힣]/);
      expect(factText(value, "en")).toBe(value);
      expect(factText(value, "es")).toBe(value);
    }
    for (const fact of plan.facts.filter(fact => !facts.includes(fact))) {
      expect(factText(fact.text, "ko")).toBe(fact.text);
    }
  });

  it("covers every static engine assumption and keeps provenance and units", () => {
    for (const value of ASSUMPTIONS) {
      expect(factText(value, "ko"), value).not.toBe(value);
      expect(factText(value, "ko"), value).toMatch(/[가-힣]/);
      for (const token of value.match(/\d+(?:\.\d+)?(?:–\d+)?%?|Schlenker & Roberts|PNAS|Mann-Kendall|NASA|USDA NASS|\$\d+\/acre|2 m|src\/engine\/\w+\.ts/g) ?? []) {
        expect(factText(value, "ko"), value).toContain(token);
      }
    }
  });

  it.each([
    ["Yield potential uses approximate KS state values (add a USDA NASS API key for county averages).", "잠재수량은 KS 주의 대략적인 값을 사용합니다(카운티 평균을 사용하려면 USDA NASS API 키를 추가하세요)."],
    ["This area averages about 23 inches of rain a year; fallow was considered.", "이 지역의 연평균 강우량은 약 23 inches이며 휴경을 고려했습니다."],
    ["This area averages about 37 inches of rain a year; fallow was not considered.", "이 지역의 연평균 강우량은 약 37 inches이며 휴경을 고려하지 않았습니다."],
    ["Corn yield basis: USDA county average for rain-fed fields, 5 reports up to 2024.", "옥수수 수량 기준: USDA 카운티 천수 재배 포장 평균, 2024년까지 5개 보고."],
    ["Winter wheat yield basis: USDA WEST CENTRAL district average for irrigated fields, 3 reports up to 2023.", "겨울밀 수량 기준: USDA WEST CENTRAL 지구 관개 재배 포장 평균, 2023년까지 3개 보고."],
    ["Soybean yield basis: county average for 5 recent years × 72% (how rain-fed fields compared with all fields in 14 years of WEST CENTRAL district records).", "대두 수량 기준: 카운티 최근 5년 평균 × 72%(WEST CENTRAL 지구 기록 14년에서 모든 포장 대비 천수 재배 포장의 비율)."],
    ["Oats yield basis: WEST CENTRAL district average for 4 recent years (all fields; USDA has no irrigated split here).", "귀리 수량 기준: WEST CENTRAL 지구 최근 4년 평균(모든 포장; USDA의 이 지역 관개 재배 구분 자료 없음)."],
    ["Alfalfa (hay) yield basis: county average (all fields).", "알팔파 / 건초 수량 기준: 카운티 평균(모든 포장)."],
    ["Prices: USDA NASS prices received, average of the latest months — corn $4.27/bu (state, 6 months to 2026-08), alfalfa (hay) $189.50/ton (national, 3 months to 2026-07). Other prices are defaults.", "가격: USDA NASS 농가 수취가격, 최근 월별 평균 — 옥수수 $4.27/bu (주, 2026-08까지 6개월), 알팔파 / 건초 $189.50/ton (전국, 2026-07까지 3개월). 기타 가격은 기본값입니다."],
    ["Water: rain only. Pumping costs about $8 per inch of water per acre.", "용수: 강우만 이용. 양수 비용은 에이커당 물 1 inch에 약 $8입니다."],
    ["Water: full irrigation. Pumping costs about $8 per inch of water per acre.", "용수: 전량 관개. 양수 비용은 에이커당 물 1 inch에 약 $8입니다."],
  ])("translates assumption %s", (value, expected) => {
    expect(factText(value, "ko")).toBe(expected);
  });

  it("preserves the limited irrigation trial, allowance, and cost", () => {
    const value = "Water: limited irrigation (about 10 in a year). Limited irrigation covers the crop's shortfall first, up to about 10 inches a season, as in K-State's Tribune limited-irrigation trial; stored soil water covers the rest. Pumping costs about $8 per inch of water per acre.";
    const translated = factText(value, "ko");
    for (const token of ["K-State's Tribune", "10 in", "10 inches", "$8", "1 inch"]) expect(translated).toContain(token);
    expect(translated).toContain("제한 관개");
  });

  it.each(["rain-fed", "irrigated"])("translates USDA calibration for %s fields", mode => {
    const value = `Yield potential is calibrated to real USDA NASS harvests for ${mode} fields: recent average ÷ the share of potential the model says recent weather allowed (kept within 60–115% of the state value).`;
    const translated = factText(value, "ko");
    expect(translated).toContain(mode === "rain-fed" ? "천수 재배" : "관개 재배");
    for (const token of ["USDA NASS", "÷", "60–115%"]) expect(translated).toContain(token);
  });
});

describe("fact text boundaries", () => {
  const unchanged = [
    "Provider says corn needs 12.75 in of water, NASA POWER 2026.",
    "한국어 제공자 설명: 옥수수 12.75 in, pH 6.4.",
    "NASA/JPL GRACE/GRACE-FO RL06.3",
    "USDA Risk Management Agency, Cause of Loss records",
    "NASA POWER; Mann-Kendall test + Sen's slope",
    "Custom indicator is rising: +2.4 in per decade since 1991 (statistically significant, p = 0.001).",
    "Before Growing-season rain (May–Sep) is rising: +2.4 in per decade since 1991.",
    "Corn yield basis: unreviewed provider description with 123 bu/acre.",
    "Since 1991, crop insurance in this county paid for corn losses mostly because of provider cause (67% of payouts, in 19 years).",
    "Satellite crop map shows this field was unstructured provider text (2021–2025).",
    "Planting corn again right after soybean increases pest and disease pressure.",
    "SoilSense provider text about well drained soil and 2.7% organic matter.",
    "Winter cover crops in 2 of 3 years protect soil from erosion and hold nitrogen over winter. Provider addendum.",
    "",
  ];
  it.each(unchanged)("preserves unfamiliar or source text verbatim: %s", value => {
    expect(factText(value, "ko")).toBe(value);
  });

  it.each(["en", "es"] as const)("returns every input unchanged in %s", language => {
    for (const value of [...unchanged, ...ASSUMPTIONS,
      "Recent crops (as reported): corn, then soybean.",
      "Growing-season rain (May–Sep) is rising: +0.25 in per decade since 1991 (statistically significant, p = 0.003).",
      "This area averages about 23 inches of rain a year; fallow was considered.",
      "Corn after soybean typically yields about 10–15% more and needs roughly 50 lb/acre less nitrogen than corn after corn.",
    ]) expect(factText(value, language)).toBe(value);
  });
});
