import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ASSUMPTIONS, buildPlan, type PlanInputs } from "../../src/engine/plan";
import { parsePower, type PowerResponse } from "../../src/engine/climate";
import { CDL_NAMES } from "../../src/engine/crops";
import { factText } from "./i18n-facts";

const zh = (value: string) => factText(value, "zh-Hans");
const numbers = (value: string) => (value.match(/\d+(?:\.\d+)?/g) ?? []).sort();
const unitTokens = (value: string) => value.match(/\$\d+(?:\.\d+)?(?:\/[^\s,;)]+)?|\d+(?:\.\d+)?(?:–\d+)?%|°F·days|°F|heat units|lb\/acre|\b\d+(?:\.\d+)? (?:inches|in|days|m)\b/g) ?? [];

function expectTranslated(value: string) {
  const translated = zh(value);
  expect(translated, value).not.toBe(value);
  expect(translated, value).toMatch(/[\u3400-\u9fff]/);
  expect(numbers(translated), value).toEqual(numbers(value));
  for (const unit of unitTokens(value)) expect(translated, value).toContain(unit);
  expect(factText(value, "en")).toBe(value);
  expect(factText(value, "es")).toBe(value);
  return translated;
}

describe("Simplified Chinese deterministic facts from the pure engine", () => {
  const captured = JSON.parse(readFileSync(new URL("../../test/fixtures/plan-finney-inputs.json", import.meta.url), "utf8")) as Omit<PlanInputs, "climate" | "cropHistory" | "now"> & { now: string };
  const power = JSON.parse(readFileSync(new URL("../../test/fixtures/power-finney-county-ks.json", import.meta.url), "utf8")) as PowerResponse;

  it.each(["rain", "limited", "full"] as const)("translates every supported fact and assumption in a real %s plan", water => {
    const plan = buildPlan({
      ...captured,
      request: { ...captured.request, water },
      climate: parsePower(power),
      cropHistory: { available: true, source: "Test crop history", years: [
        { year: 2023, crop: "winter_wheat", cdlCode: 24, cdlName: "Winter wheat" },
        { year: 2024, crop: "corn", cdlCode: 1, cdlName: "Corn" },
        { year: 2025, crop: "winter_wheat", cdlCode: 24, cdlName: "Winter wheat" },
      ] },
      now: new Date(captured.now),
    });
    expect(plan.plans.length).toBeGreaterThan(0);
    const knownFacts = plan.facts.filter(fact => !/^(farmer-|goal-|advice-|pest-)/.test(fact.id));
    expect(knownFacts.some(fact => fact.kind === "economics")).toBe(true);
    expect(knownFacts.some(fact => fact.id.startsWith("trend-"))).toBe(true);
    expect(knownFacts.some(fact => fact.id.startsWith("risk-"))).toBe(true);
    for (const value of [...knownFacts.map(fact => fact.text), ...plan.assumptions]) expectTranslated(value);
    for (const fact of plan.facts) {
      expect(zh(fact.source)).toBe(fact.source);
      if (!knownFacts.includes(fact)) expect(zh(fact.text)).toBe(fact.text);
    }
    expect(zh(knownFacts.find(fact => fact.id === "soil")!.text)).toContain("Richfield silt loam, 0 to 1 percent slopes");
  });

  it("translates all static engine assumptions while retaining scientific provenance", () => {
    for (const value of ASSUMPTIONS) {
      const translated = expectTranslated(value);
      for (const source of value.match(/Schlenker & Roberts|PNAS|Mann-Kendall|NASA|USDA NASS|src\/engine\/\w+\.ts|Nov–Mar/g) ?? []) {
        expect(translated).toContain(source);
      }
    }
  });
});

describe("Chinese climate measurements", () => {
  it.each([
    ["Growing-season rain (May–Sep)", "生长季降雨量（May–Sep）", "in"],
    ["Spring rain (Apr–May)", "春季降雨量（Apr–May）", "in"],
    ["Days at or above 95°F (Jun–Aug)", "达到或超过 95°F 的天数（Jun–Aug）", "days"],
    ["Frost-free season", "无霜期", "days"],
    ["Growing degree days (May–Sep)", "生长度日（May–Sep）", "°F·days"],
    ["Growing-season warmth (May–Sep)", "生长季热量（May–Sep）", "heat units"],
    ["Longest summer dry spell (Jun–Aug)", "夏季最长连续干旱期（Jun–Aug）", "days"],
    ["Average summer high (Jun–Aug)", "夏季平均最高温度（Jun–Aug）", "°F"],
    ["Crop water demand (May–Sep)", "作物需水量（May–Sep）", "in"],
    ["Water balance: rain minus demand (May–Sep)", "水量平衡：降雨量减需水量（May–Sep）", "in"],
    ["Root-zone soil wetness (Jun–Aug)", "根区土壤湿度（Jun–Aug）", "%"],
  ])("translates all variants of %s with unchanged signed values and units", (label, chinese, unit) => {
    expect(expectTranslated(`${label} is rising: +1.25 ${unit} per decade since 1991 (statistically significant, p = 0.003).`))
      .toBe(`${chinese}：自 1991 年以来每十年上升 +1.25 ${unit}（具有统计显著性，p = 0.003）。`);
    for (const sign of ["-", "−"]) {
      expect(expectTranslated(`${label} is falling: ${sign}1.25 ${unit} per decade since 1991.`))
        .toBe(`${chinese}：自 1991 年以来每十年下降 ${sign}1.25 ${unit}。`);
    }
    expect(expectTranslated(`${label}: no statistically clear change since 1991 (+0.01 ${unit} per decade, p = 0.64).`))
      .toBe(`${chinese}：自 1991 年以来无明显变化（每十年 +0.01 ${unit}，p = 0.64）。`);
    expect(expectTranslated(`${label}: no clear change since 1991.`)).toBe(`${chinese}：自 1991 年以来无明显变化。`);
  });

  it("accepts the climate sentences after App.plain removes statistics and renames degree days", () => {
    const plain = (value: string) => value
      .replace(/\s*\([^)]*\bp\s*[=<]\s*[\d.]+[^)]*\)/g, "")
      .replace(/no statistically clear change/gi, "no clear change")
      .replace(/Growing degree days \(May–Sep\)/g, "Growing-season warmth (May–Sep)")
      .replace(/°F·days/g, "heat units");
    expect(zh(plain("Growing degree days (May–Sep) is rising: +52.3 °F·days per decade since 1991 (statistically significant, p = 0.002).")))
      .toBe("生长季热量（May–Sep）：自 1991 年以来每十年上升 +52.3 heat units。");
    expect(zh(plain("Growing-season rain (May–Sep): no statistically clear change since 1991 (-0.02 in per decade, p = 0.78).")))
      .toBe("生长季降雨量（May–Sep）：自 1991 年以来无明显变化。");
  });
});

describe("Chinese history, soil and agronomy", () => {
  it.each([
    ["Satellite crop map shows this field was corn 3 of 5 years, soybeans 1 of 5 years, provider crop 1 of 5 years (2021–2025).", "卫星作物地图显示，该田块的历史种植情况为：玉米 5 年中有 3 年，大豆 5 年中有 1 年，provider crop 5 年中有 1 年（2021–2025）。"],
    ["Recent crops (as reported): corn, then soybean, then alfalfa (hay).", "近期作物（据报告）：玉米 → 大豆 → 苜蓿 / 干草。"],
    ["Soil: Harney silt loam, 0 to 1 percent slopes, well drained, pH 6.2, 2.7% organic matter.", "土壤：Harney silt loam, 0 to 1 percent slopes, 排水良好, pH 6.2, 有机质 2.7%。"],
    ["Soil: pH 7.0.", "土壤：pH 7.0。"],
    ["Corn prefers pH ≥ 5.8; topsoil pH is 5.2 (lime would help).", "玉米适宜的 pH ≥ 5.8；表土 pH 为 5.2（施用石灰有帮助）。"],
    ["Alfalfa (hay) does poorly on very poorly drained soils.", "苜蓿 / 干草在排水极差的土壤上生长不良。"],
    ["Planting winter wheat again right after winter wheat increases pest and disease pressure.", "冬小麦连作会增加病虫害压力。"],
    ["Winter cover crops in 2 of 3 years protect soil from erosion and hold nitrogen over winter.", "在 3 年中的 2 年种植冬季覆盖作物，可保护土壤免受侵蚀，并在冬季保留氮素。"],
  ])("translates the whole template: %s", (value, expected) => {
    expect(expectTranslated(value)).toBe(expected);
  });

  it("translates every known satellite class only within the complete trusted count template", () => {
    for (const name of Object.values(CDL_NAMES)) {
      const lower = name.toLowerCase();
      const value = `Satellite crop map shows this field was ${lower} 2 of 5 years (2021–2025).`;
      expect(expectTranslated(value), name).not.toContain(lower);
      expect(zh(value)).toContain("5 年中有 2 年");
      const provider = `Provider mentions ${lower} 2 of 5 years.`;
      expect(zh(provider)).toBe(provider);
    }
  });

  it.each([
    ["excessively drained", "排水过强"], ["somewhat excessively drained", "排水偏强"],
    ["well drained", "排水良好"], ["moderately well drained", "排水中等良好"],
    ["somewhat poorly drained", "排水稍差"], ["poorly drained", "排水不良"], ["very poorly drained", "排水极差"],
  ])("translates the known drainage class %s in both templates", (drainage, chinese) => {
    expect(expectTranslated(`Soil: provider soil, ${drainage}.`)).toBe(`土壤：provider soil, ${chinese}。`);
    expect(expectTranslated(`Soybean does poorly on ${drainage} soils.`)).toBe(`大豆在${chinese}的土壤上生长不良。`);
  });

  it.each([
    ["water", "水分不足"], ["heat", "高温"], ["season length", "生长季长度"],
    ["wet spring", "春季过湿"], ["winter cold", "冬季寒冷"], ["too much rain", "降雨过多"],
  ])("translates NASA replay stress %s and preserves all counts", (stress, chinese) => {
    const value = `Replaying 35 years of NASA weather (shifted to today's trends) with soil water carried from the crop before, grain sorghum in this rotation would have been stressed in about 12 of 35 years, mostly from ${stress} (irrigated).`;
    expect(expectTranslated(value)).toBe(`回放 35 年 NASA 气象资料（已按当前趋势调整），并结转前茬作物留下的土壤水分后，估计该轮作中的谷物高粱在 35 年中约有 12 年受到胁迫（主要原因：${chinese}）（灌溉）。`);
  });

  it("handles replay with neither a stress cause nor irrigation", () => {
    expect(expectTranslated("Replaying 34 years of NASA weather (shifted to today's trends) with soil water carried from the crop before, corn in this rotation would have been stressed in about 0 of 34 years."))
      .toBe("回放 34 年 NASA 气象资料（已按当前趋势调整），并结转前茬作物留下的土壤水分后，估计该轮作中的玉米在 34 年中约有 0 年受到胁迫。");
  });

  it.each([
    ["A fallow season (no crop, weeds controlled) stores roughly a quarter of the rain that falls during it in the soil, which raises the next crop's yield in dry areas, at the cost of a year without income and more erosion risk on bare ground.", "休耕季"],
    ["Corn after soybean typically yields about 10–15% more and needs roughly 50 lb/acre less nitrogen than corn after corn.", "大豆茬玉米"],
    ["First-year corn after alfalfa usually needs little or no added nitrogen.", "少量或无需额外施氮"],
    ["Adding a small grain (wheat or oats) breaks corn and soybean pest cycles and opens a summer window for a legume cover crop.", "豆科覆盖作物"],
    ["Grain sorghum is left out because local markets for it are limited in this state.", "谷物高粱"],
    ["Optional farmer goals add at most +0.1 total to the unchanged priority score, shared equally between the selected goals. Metrics are min–max normalized across feasible candidate plans before choosing covers; ties earn no bonus. Feasibility and crop-reliability gates still take precedence. Water uses simulated pumping (rain-only: main-crop water use); N uses lower fertilizer after credits (70%) and legume seasons (30%); erosion and organic matter use explicit rotation proxies, not measured outcomes. Forage-market bonus requires that goal; hay economics are unchanged.", "轮作代理指标"],
  ])("translates static agronomy and goal assumptions: %s", (value, expected) => {
    expect(expectTranslated(value)).toContain(expected);
  });
});

describe("Chinese economics, USDA yield bases and water assumptions", () => {
  it.each([
    ["Compared with continuing the current pattern (Corn → Soybean → Corn): estimated +$127.5/acre per year, 50 lb/acre less nitrogen over 3 years, and a soil-health score of 83 vs 41 out of 100.", "与继续当前种植模式（玉米 → 大豆 → 玉米）相比：估计每年净收益差为 +$127.5/acre，3 年间氮肥减少 50 lb/acre，土壤健康评分为 83 对 41（满分 100）。"],
    ["Compared with continuing the current pattern (Winter wheat → Grain sorghum → Fallow (no crop)): estimated −$19/acre per year, 12.5 lb/acre more nitrogen over 3 years, and a soil-health score of 75 vs 29 out of 100.", "与继续当前种植模式（冬小麦 → 谷物高粱 → 休耕（不种作物））相比：估计每年净收益差为 −$19/acre，3 年间氮肥增加 12.5 lb/acre，土壤健康评分为 75 对 29（满分 100）。"],
    ["Corn yield basis: USDA county average for rain-fed fields, 5 reports up to 2024.", "玉米产量依据：USDA 县雨养田块平均值，截至 2024 年的 5 份报告。"],
    ["Winter wheat yield basis: USDA WEST CENTRAL district average for irrigated fields, 3 reports up to 2023.", "冬小麦产量依据：USDA WEST CENTRAL 区灌溉田块平均值，截至 2023 年的 3 份报告。"],
    ["Soybean yield basis: county average for 5 recent years × 72% (how rain-fed fields compared with all fields in 14 years of WEST CENTRAL district records).", "大豆产量依据：县最近 5 年平均值 × 72%（依据 WEST CENTRAL 区 14 年记录中雨养田块与所有田块的比值）。"],
    ["Grain sorghum yield basis: WEST CENTRAL district average for 4 recent years × 91% (how irrigated fields compared with all fields in 12 years of county records).", "谷物高粱产量依据：WEST CENTRAL 区最近 4 年平均值 × 91%（依据 县 12 年记录中灌溉田块与所有田块的比值）。"],
    ["Oats yield basis: WEST CENTRAL district average for 4 recent years (all fields; USDA has no irrigated split here).", "燕麦产量依据：WEST CENTRAL 区最近 4 年平均值（所有田块；USDA 此处无单独的灌溉数据）。"],
    ["Corn yield basis: county average for 5 recent years (all fields; USDA has no rain-fed split here).", "玉米产量依据：县最近 5 年平均值（所有田块；USDA 此处无单独的雨养数据）。"],
    ["Alfalfa (hay) yield basis: county average (all fields).", "苜蓿 / 干草产量依据：县平均值（所有田块）。"],
    ["Prices: USDA NASS prices received, average of the latest months — corn $4.27/bu (state, 6 months to 2026-08), alfalfa (hay) $189.50/ton (national, 3 months to 2026-07). Other prices are defaults.", "价格：USDA NASS 农户销售价格，最近月份的平均值 — 玉米 $4.27/bu（州级，截至 2026-08 的 6 个月），苜蓿 / 干草 $189.50/ton（全国，截至 2026-07 的 3 个月）。其他价格采用默认值。"],
    ["Prices: USDA NASS prices received, average of the latest months — . Other prices are defaults.", "价格：USDA NASS 农户销售价格，最近月份的平均值 — 。其他价格采用默认值。"],
    ["Water: rain only. Pumping costs about $8 per inch of water per acre.", "用水：仅靠降雨。每 acre 每 inch 水的抽水成本约为 $8。"],
    ["Water: full irrigation. Pumping costs about $8 per inch of water per acre.", "用水：充分灌溉。每 acre 每 inch 水的抽水成本约为 $8。"],
    ["This area averages about 23 inches of rain a year; fallow was considered.", "该地区年平均降雨量约为 23 inches；已考虑休耕。"],
    ["This area averages about 37 inches of rain a year; fallow was not considered.", "该地区年平均降雨量约为 37 inches；未考虑休耕。"],
  ])("translates economics and assumption template: %s", (value, expected) => {
    expect(expectTranslated(value)).toBe(expected);
  });

  it.each(["KS", "Iowa"])("preserves the approximate state yield source %s", state => {
    expect(expectTranslated(`Yield potential uses approximate ${state} state values (add a USDA NASS API key for county averages).`))
      .toBe(`潜在产量采用 ${state} 州的近似值（添加 USDA NASS API 密钥可获取县平均值）。`);
  });

  it.each(["rain-fed", "irrigated"])("translates USDA calibration for %s fields", mode => {
    const translated = expectTranslated(`Yield potential is calibrated to real USDA NASS harvests for ${mode} fields: recent average ÷ the share of potential the model says recent weather allowed (kept within 60–115% of the state value).`);
    expect(translated).toContain(mode === "rain-fed" ? "雨养田块" : "灌溉田块");
    for (const token of ["USDA NASS", "÷", "60–115%"]) expect(translated).toContain(token);
  });

  it("preserves the limited-irrigation allowance, trial provenance and pumping cost", () => {
    const translated = expectTranslated("Water: limited irrigation (about 10 in a year). Limited irrigation covers the crop's shortfall first, up to about 10 inches a season, as in K-State's Tribune limited-irrigation trial; stored soil water covers the rest. Pumping costs about $8 per inch of water per acre.");
    for (const token of ["K-State's Tribune", "10 in", "10 inches", "$8", "inch", "acre"]) expect(translated).toContain(token);
    expect(translated).toContain("有限灌溉");
  });

  it.each([
    ["drought or heat", "干旱或高温"], ["too much rain or flooding", "降雨过多或洪涝"],
    ["hail", "冰雹"], ["wind storms", "风暴"], ["freeze or cold", "冰冻或寒冷"],
    ["disease or insects", "病害或虫害"], ["other causes", "其他原因"],
  ])("translates insured loss cause %s without changing the county", (cause, chinese) => {
    expect(expectTranslated(`Since 1991, crop insurance in Finney County, KS paid for corn losses mostly because of ${cause} (67% of payouts, in 19 years).`))
      .toBe(`自 1991 年以来，Finney County, KS的玉米作物保险损失赔付主要源于${chinese}（占赔付额 67%，涉及 19 年）。`);
  });

  it("translates two loss causes and the unnamed county", () => {
    expect(expectTranslated("Since 1991, crop insurance in this county paid for soybean losses mostly because of drought or heat (61% of payouts, in 23 years) and hail (17% of payouts, in 8 years)."))
      .toBe("自 1991 年以来，本县的大豆作物保险损失赔付主要源于干旱或高温（占赔付额 61%，涉及 23 年）和冰雹（占赔付额 17%，涉及 8 年）。");
  });
});

describe("Chinese trusted-template boundaries", () => {
  it.each([
    "Provider says corn needs 12.75 in of water, NASA POWER 2026.",
    "提供方说明：玉米 12.75 in，pH 6.4。",
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
    "Prices: USDA NASS prices received, average of the latest months — corn provider price (state, 6 months to 2026-08). Other prices are defaults.",
    "Soybean does poorly on provider drainage soils.",
    "",
  ])("preserves unknown messages and provenance verbatim: %s", value => {
    expect(zh(value)).toBe(value);
    expect(factText(value, "en")).toBe(value);
    expect(factText(value, "es")).toBe(value);
  });

  it("preserves unknown embedded crop names, soil text, price units and reporting periods", () => {
    expect(zh("Recent crops (as reported): corn, then Provider crop 12.75 in."))
      .toBe("近期作物（据报告）：玉米 → Provider crop 12.75 in。");
    expect(zh("Soil: Provider 土壤 12.75 in, pH 6.4, unknown drainage."))
      .toBe("土壤：Provider 土壤 12.75 in, pH 6.4, unknown drainage。");
    expect(zh("Prices: USDA NASS prices received, average of the latest months — Provider crop $12.75/custom-unit (national, 4 months to provider-period). Other prices are defaults."))
      .toBe("价格：USDA NASS 农户销售价格，最近月份的平均值 — Provider crop $12.75/custom-unit（全国，截至 provider-period 的 4 个月）。其他价格采用默认值。");
  });
});
