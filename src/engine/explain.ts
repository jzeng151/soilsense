// Turns engine output into reason facts and plain-language explanations (speech, SMS, summary).
// Deterministic templates: every sentence is built from computed facts, so nothing is invented.

import type {
  ClimateIndicator,
  ClimateSummary,
  CountyLosses,
  CropHistory,
  CropId,
  Priority,
  ReasonFact,
  RotationPlan,
  SoilProfile,
} from "../shared/types";
import type { Language } from "../shared/language";
import { formatSigned, round } from "../shared/units";
import { CROPS } from "./crops";
import type { CropClimate } from "./rotation";
import { isSignificant } from "./stats";
import { LOSS_WORDS, lossShares } from "./validate";

const PRIORITY_WORDS: Record<Priority, Record<Language, string>> = {
  profit: { en: "profit", es: "ganancia", ko: "수익", "zh-Hans": "收益" },
  soil: { en: "soil health", es: "salud del suelo", ko: "토양 건강", "zh-Hans": "土壤健康" },
  risk: { en: "lower risk", es: "menor riesgo", ko: "위험 감소", "zh-Hans": "降低风险" },
  balanced: { en: "a balance of profit, soil and risk", es: "un balance entre ganancia, suelo y riesgo", ko: "수익, 토양 건강, 위험 간의 균형", "zh-Hans": "兼顾收益、土壤健康和风险" },
};

export const CROP_ES: Record<CropId, string> = {
  corn: "maíz",
  soybean: "soja",
  winter_wheat: "trigo de invierno",
  oats: "avena",
  alfalfa: "alfalfa",
  sorghum: "sorgo de grano",
  fallow: "barbecho (sin cultivo)",
};

const CROP_KO: Record<CropId, string> = {
  corn: "옥수수",
  soybean: "대두",
  winter_wheat: "겨울밀",
  oats: "귀리",
  alfalfa: "알팔파",
  sorghum: "수수",
  fallow: "휴경(작물 미재배)",
};

const INDICATOR_KO: Record<string, string> = {
  gs_rain: "생육기 강수량(5–9월)",
  spring_rain: "봄철 강수량(4–5월)",
  hot_days: "기온이 95°F 이상인 날의 수(6–8월)",
  frost_free: "무상기간",
  gdd: "생육적산온도(5–9월)",
  dry_spell: "여름철 최장 연속 건조일수(6–8월)",
  summer_tmax: "여름철 평균 최고기온(6–8월)",
  water_demand: "작물 물 요구량(5–9월)",
  water_balance: "물수지: 강수량에서 물 요구량을 뺀 값(5–9월)",
  soil_wetness: "근권 토양 습윤도(6–8월)",
};

const CROP_ZH: Record<CropId, string> = {
  corn: "玉米",
  soybean: "大豆",
  winter_wheat: "冬小麦",
  oats: "燕麦",
  alfalfa: "苜蓿",
  sorghum: "谷物高粱",
  fallow: "休耕（不种植作物）",
};

const INDICATOR_ZH: Record<string, string> = {
  gs_rain: "生长季降水量（5–9月）",
  spring_rain: "春季降水量（4–5月）",
  hot_days: "气温达到或超过95°F的天数（6–8月）",
  frost_free: "无霜期",
  gdd: "生长度日（5–9月）",
  dry_spell: "夏季最长连续干旱天数（6–8月）",
  summer_tmax: "夏季平均最高气温（6–8月）",
  water_demand: "作物需水量（5–9月）",
  water_balance: "水分平衡：降水量减去需水量（5–9月）",
  soil_wetness: "根区土壤湿润度（6–8月）",
};

/** Make text easy for a text-to-speech voice: no symbols, units spelled out, no statistics jargon in brackets. */
export function toSpeech(text: string): string {
  return text
    .replace(/\s*\([^)]*\)/g, "")
    .replace(/°F·days/g, "degree days")
    .replace(/°F/g, " degrees Fahrenheit")
    .replace(/ in per decade/g, " inches per decade")
    .replace(/→/g, ", then ")
    .replace(/−\$/g, "minus $")
    .replace(/\+\$/g, "plus $")
    .replace(/lb\/acre/g, "pounds per acre")
    .replace(/\/acre/g, " per acre")
    .replace(/\s+,/g, ",")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

function indicator(climate: ClimateSummary, id: string): ClimateIndicator | undefined {
  return climate.indicators.find((i) => i.id === id);
}

function trendSentence(ind: ClimateIndicator): string {
  const per = `${formatSigned(ind.changePerDecade, ind.unit === "in" ? 2 : 1)} ${ind.unit} per decade`;
  if (isSignificant(ind.trend)) {
    return `${ind.label} is ${ind.changePerDecade > 0 ? "rising" : "falling"}: ${per} since ${ind.years[0]} (statistically significant, p = ${round(ind.trend.pValue, 3)}).`;
  }
  return `${ind.label}: no statistically clear change since ${ind.years[0]} (${per}, p = ${round(ind.trend.pValue, 2)}).`;
}

export function buildFacts(args: {
  climate: ClimateSummary;
  cropClimate: Record<CropId, CropClimate>;
  soil: SoilProfile;
  history: CropHistory;
  effectiveHistory: CropId[];
  plans: RotationPlan[];
  currentPractice: RotationPlan | null;
  irrigated: boolean;
  losses?: CountyLosses | null;
  countyName?: string | null;
}): ReasonFact[] {
  const { climate, cropClimate, soil, history, effectiveHistory, plans, currentPractice } = args;
  const facts: ReasonFact[] = [];

  // Climate trends: significant ones first.
  const inds = [...climate.indicators].sort(
    (a, b) => Number(isSignificant(b.trend)) - Number(isSignificant(a.trend)) || a.trend.pValue - b.trend.pValue,
  );
  for (const ind of inds) {
    facts.push({
      id: `trend-${ind.id}`,
      text: trendSentence(ind),
      source: `${climate.source}; Mann-Kendall test + Sen's slope`,
      significant: isSignificant(ind.trend),
      kind: "climate",
    });
  }

  // Field history.
  if (history.available && history.years.length) {
    const counts = new Map<string, number>();
    for (const y of history.years) counts.set(y.cdlName, (counts.get(y.cdlName) ?? 0) + 1);
    const parts = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k.toLowerCase()} ${v} of ${history.years.length} years`);
    facts.push({
      id: "history",
      text: `Satellite crop map shows this field was ${parts.join(", ")} (${history.years[0]?.year}–${history.years[history.years.length - 1]?.year}).`,
      source: history.source,
      kind: "history",
    });
  } else if (effectiveHistory.length) {
    facts.push({
      id: "history",
      text: `Recent crops (as reported): ${effectiveHistory.map((c) => CROPS[c].name.toLowerCase()).join(", then ")}.`,
      source: "Farmer input",
      kind: "history",
    });
  }

  // Soil.
  if (soil.available) {
    const bits = [
      soil.mapUnitName ?? soil.componentName,
      soil.drainageClass?.toLowerCase(),
      soil.ph !== undefined ? `pH ${soil.ph.toFixed(1)}` : undefined,
      soil.organicMatterPct !== undefined ? `${soil.organicMatterPct.toFixed(1)}% organic matter` : undefined,
    ].filter(Boolean);
    facts.push({ id: "soil", text: `Soil: ${bits.join(", ")}.`, source: soil.source, kind: "soil" });
  }

  // Crop climate risk for crops in the top plan.
  const top = plans[0];
  if (top) {
    // Uses the plan's own simulated years (soil water carried between crops), so it matches the plan cards.
    const seen = new Set<CropId>();
    for (const y of top.years) {
      if (seen.has(y.crop) || y.crop === "fallow") continue;
      seen.add(y.crop);
      const cc = cropClimate[y.crop];
      const total = cc.totalYears;
      const stressed = Math.round((1 - y.reliability) * total);
      const stress = y.mainStress && stressed > 0 ? `, mostly from ${y.mainStress}` : "";
      facts.push({
        id: `risk-${y.crop}`,
        text: `Replaying ${total} years of NASA weather (shifted to today's trends) with soil water carried from the crop before, ${CROPS[y.crop].name.toLowerCase()} in this rotation would have been stressed in about ${stressed} of ${total} years${stress}${args.irrigated ? " (irrigated)" : ""}.`,
        source: `${climate.source}; SoilSense crop water and stress model`,
        kind: "climate",
      });
      for (const note of cc.soilNotes) facts.push({ id: `soilfit-${y.crop}`, text: note, source: soil.source, kind: "soil" });
    }
    if (top.years.some((y) => y.crop === "fallow"))
      facts.push({
        id: "agro-fallow",
        text: "A fallow season (no crop, weeds controlled) stores roughly a quarter of the rain that falls during it in the soil, which raises the next crop's yield in dry areas, at the cost of a year without income and more erosion risk on bare ground.",
        source: "Great Plains dryland research, e.g. K-State and USDA-ARS Akron (approximate)",
        kind: "agronomy",
      });

    // Agronomy facts specific to the plan.
    const prevLast = effectiveHistory[effectiveHistory.length - 1];
    const firstCorn = top.years.findIndex((y) => y.crop === "corn");
    if (firstCorn >= 0) {
      const prev = firstCorn === 0 ? prevLast : top.years[firstCorn - 1]?.crop;
      if (prev === "soybean")
        facts.push({ id: "agro-corn-soy", text: "Corn after soybean typically yields about 10–15% more and needs roughly 50 lb/acre less nitrogen than corn after corn.", source: "Land-grant extension rotation research (approximate)", kind: "agronomy" });
      if (prev === "alfalfa")
        facts.push({ id: "agro-corn-alf", text: "First-year corn after alfalfa usually needs little or no added nitrogen.", source: "Land-grant extension guidance (approximate)", kind: "agronomy" });
    }
    if (prevLast && top.years[0] && prevLast === top.years[0].crop && top.years[0].crop !== "alfalfa")
      facts.push({ id: "agro-repeat", text: `Planting ${top.years[0].cropName.toLowerCase()} again right after ${top.years[0].cropName.toLowerCase()} increases pest and disease pressure.`, source: "Agronomy rule of thumb", kind: "agronomy" });
    if (top.coverYears > 0)
      facts.push({ id: "agro-cover", text: `Winter cover crops in ${top.coverYears} of 3 years protect soil from erosion and hold nitrogen over winter.`, source: "USDA NRCS cover crop guidance", kind: "agronomy" });
    if (top.years.some((y) => y.crop === "winter_wheat" || y.crop === "oats"))
      facts.push({ id: "agro-small-grain", text: "Adding a small grain (wheat or oats) breaks corn and soybean pest cycles and opens a summer window for a legume cover crop.", source: "Land-grant extension guidance", kind: "agronomy" });

    if (currentPractice) {
      const d = top.avgNetReturnPerAcre - currentPractice.avgNetReturnPerAcre;
      const nDiff = currentPractice.totalNitrogenLbPerAcre - top.totalNitrogenLbPerAcre;
      facts.push({
        id: "vs-current",
        text: `Compared with continuing the current pattern (${currentPractice.label.replace("Current pattern: ", "")}): estimated ${d >= 0 ? "+" : "−"}$${Math.abs(d)}/acre per year, ${nDiff >= 0 ? `${nDiff} lb/acre less` : `${-nDiff} lb/acre more`} nitrogen over 3 years, and a soil-health score of ${round(top.scores.soil * 100, 0)} vs ${round(currentPractice.scores.soil * 100, 0)} out of 100.`,
        source: "SoilSense engine (economics are indicative, based on editable price/cost assumptions)",
        kind: "economics",
      });
    }
  }
  // Crop-insurance history: what really hurt each recommended crop in this county.
  if (args.losses && top) {
    const seen = new Set<CropId>();
    for (const y of top.years) {
      if (seen.has(y.crop) || y.crop === "fallow") continue;
      seen.add(y.crop);
      const shares = lossShares(args.losses, y.crop).slice(0, 2);
      if (!shares.length) continue;
      const parts = shares.map((s) => `${LOSS_WORDS[s.group]} (${Math.round(s.share * 100)}% of payouts, in ${s.years} years)`);
      facts.push({
        id: `losses-${y.crop}`,
        text: `Since ${args.losses.firstYear}, crop insurance in ${args.countyName ?? "this county"} paid for ${CROPS[y.crop].name.toLowerCase()} losses mostly because of ${parts.join(" and ")}.`,
        source: "USDA Risk Management Agency, Cause of Loss records",
        kind: "history",
      });
    }
  }
  return facts;
}

function planSentenceEn(plan: RotationPlan): string {
  return plan.years
    .map((y) => `${y.cropName.toLowerCase()} in ${y.year}${y.cover !== "none" ? ` with ${y.coverName.toLowerCase()} over winter` : ""}`)
    .join(", then ");
}

function planSentenceEs(plan: RotationPlan): string {
  const covers = { cereal_rye: "centeno", crimson_clover: "trébol encarnado", hairy_vetch: "veza vellosa", none: "" };
  return plan.years.map((y) => `${CROP_ES[y.crop]} en ${y.year}${y.cover !== "none" ? ` con ${covers[y.cover]} como cobertura invernal` : ""}`).join(", luego ");
}

function planSentenceKo(plan: RotationPlan): string {
  const covers = { cereal_rye: "호밀", crimson_clover: "크림슨클로버", hairy_vetch: "헤어리베치", none: "" };
  return plan.years.map((y) => `${y.year}년 ${CROP_KO[y.crop]}${y.cover !== "none" ? `, 겨울철 피복작물로 ${covers[y.cover]} 재배` : ""}`).join(" → ");
}

function planSentenceZh(plan: RotationPlan): string {
  const covers = { cereal_rye: "黑麦", crimson_clover: "绛三叶", hairy_vetch: "毛叶苕子", none: "" };
  return plan.years.map((y) => `${y.year}年${y.crop === "fallow" ? CROP_ZH[y.crop] : `种植${CROP_ZH[y.crop]}`}${y.cover !== "none" ? `，以${covers[y.cover]}作为越冬覆盖作物` : ""}`).join(" → ");
}

export function buildExplanation(args: {
  plans: RotationPlan[];
  currentPractice: RotationPlan | null;
  climate: ClimateSummary;
  facts: ReasonFact[];
  priority: Priority;
  placeName?: string;
  language?: Language;
}): { summary: string; speech: string; sms: string } {
  const { plans, climate, facts, priority, currentPractice } = args;
  const top = plans[0];
  if (!top && args.language === "zh-Hans") return {
    summary: "未找到可行的轮作方案。",
    speech: "无法为此地点制定轮作方案。",
    sms: "SoilSense：暂无可用的轮作方案。",
  };
  if (!top && args.language === "ko") return {
    summary: "실행 가능한 윤작 계획을 찾지 못했습니다.",
    speech: "이 위치에 대한 윤작 계획을 수립하지 못했습니다.",
    sms: "SoilSense: 이용 가능한 윤작 계획이 없습니다.",
  };
  if (!top) return args.language === "es"
    ? { summary: "No se encontró una rotación viable.", speech: "No pude preparar un plan para esta ubicación.", sms: "SoilSense: no hay un plan disponible." }
    : { summary: "No feasible rotation found.", speech: "Sorry, I could not build a plan for this location.", sms: "SoilSense: no plan available." };

  const sigTrends = climate.indicators.filter((i) => isSignificant(i.trend));
  const keyTrend = sigTrends.find((i) => ["hot_days", "gs_rain", "spring_rain", "dry_spell"].includes(i.id)) ?? sigTrends[0];

  if (args.language === "zh-Hans") {
    const place = args.placeName ? `${args.placeName}附近农田` : "您的农田";
    const units: Record<string, string> = { "%": "个百分点" };
    const climateLine = keyTrend
      ? `NASA数据显示，${place}的${INDICATOR_ZH[keyTrend.id] ?? keyTrend.label}每10年约${keyTrend.changePerDecade > 0 ? "增加" : "减少"}${Math.abs(round(keyTrend.changePerDecade, keyTrend.unit === "in" ? 1 : 0))} ${units[keyTrend.unit] ?? keyTrend.unit}，这一变化具有统计显著性。`
      : `NASA数据显示，自${climate.firstYear}年以来，${place}的降水或高温未出现统计上明确的变化。`;
    const provenance = `依据NASA气候数据（${climate.firstYear}-${climate.lastYear}年）。`;
    const recommendation = `以${PRIORITY_WORDS[priority]["zh-Hans"]}为重点，建议采用以下轮作：${planSentenceZh(top)}。`;
    const nDiff = currentPractice ? currentPractice.totalNitrogenLbPerAcre - top.totalNitrogenLbPerAcre : 0;
    let comparison = "";
    if (currentPractice && facts.some(f => f.id === "vs-current")) {
      const d = top.avgNetReturnPerAcre - currentPractice.avgNetReturnPerAcre;
      comparison = ` 与继续当前种植方式（${planSentenceZh(currentPractice)}）相比，估算的每年净收益差额为${d >= 0 ? "+" : "−"}$${Math.abs(d)}/acre，3年内氮肥投入量${nDiff >= 0 ? "减少" : "增加"}${Math.abs(nDiff)} lb/acre。土壤健康评分满分为100分，建议轮作为${round(top.scores.soil * 100, 0)}分，当前种植方式为${round(currentPractice.scores.soil * 100, 0)}分。`;
    }
    const benefit = currentPractice && nDiff > 20 ? ` 与当前种植方式相比，3年内每英亩氮肥投入量约减少${nDiff}磅。` : "";
    const coverLine = top.coverYears > 0 ? " 覆盖作物可在冬季保护土壤。" : "";
    const advice = "购买种子前，请向当地农业推广人员核实。";
    const speech = `${climateLine} ${provenance} ${recommendation}${benefit}${coverLine} ${advice}`
      .replace(/([\d.]+)\s*°F·days/g, "$1华氏度日")
      .replace(/([\d.]+)\s*°F/g, "华氏$1度")
      .replace(/([\d.]+) in\b/g, "$1英寸")
      .replace(/([\d.]+) days\b/g, "$1天")
      .replace(/ → /g, "，然后");
    return {
      summary: `${climateLine} ${provenance} ${recommendation}${comparison}`,
      speech,
      sms: `SoilSense轮作方案：${planSentenceZh(top)}。${provenance} ${advice}`,
    };
  }

  if (args.language === "ko") {
    const place = args.placeName ? `${args.placeName} 인근 농경지` : "해당 농경지";
    const units: Record<string, string> = { in: "인치", days: "일", "°F·days": "°F·일", "°F": "°F", "%": "%p" };
    const climateLine = keyTrend
      ? `${place}의 NASA 자료에 따르면 ${INDICATOR_KO[keyTrend.id] ?? keyTrend.label} 지표는 10년마다 약 ${Math.abs(round(keyTrend.changePerDecade, keyTrend.unit === "in" ? 1 : 0))} ${units[keyTrend.unit] ?? keyTrend.unit} ${keyTrend.changePerDecade > 0 ? "증가" : "감소"}하는 추세이며, 이 변화는 통계적으로 유의합니다.`
      : `${place}의 NASA 자료에서는 ${climate.firstYear}년 이후 강수량이나 고온에 통계적으로 뚜렷한 변화가 나타나지 않았습니다.`;
    const provenance = `NASA 기후 자료 ${climate.firstYear}-${climate.lastYear}년 기준.`;
    const recommendation = `${PRIORITY_WORDS[priority].ko}에 중점을 둔 권장 윤작: ${planSentenceKo(top)}.`;
    const nDiff = currentPractice ? currentPractice.totalNitrogenLbPerAcre - top.totalNitrogenLbPerAcre : 0;
    let comparison = "";
    if (currentPractice && facts.some(f => f.id === "vs-current")) {
      const d = top.avgNetReturnPerAcre - currentPractice.avgNetReturnPerAcre;
      comparison = ` 현재 재배 방식(${planSentenceKo(currentPractice)})을 유지할 때와 비교하면, 연간 에이커당 추정 순수익 차이는 ${d >= 0 ? "+" : "−"}$${Math.abs(d)}/acre이며, 3년간 질소 투입량은 ${Math.abs(nDiff)} lb/acre ${nDiff >= 0 ? "감소" : "증가"}합니다. 토양 건강 점수는 100점 만점에 권장 윤작 ${round(top.scores.soil * 100, 0)}점, 현재 재배 방식 ${round(currentPractice.scores.soil * 100, 0)}점입니다.`;
    }
    const benefit = currentPractice && nDiff > 20 ? ` 현재 재배 방식보다 3년간 에이커당 질소 투입량이 약 ${nDiff}파운드 적습니다.` : "";
    const coverLine = top.coverYears > 0 ? " 피복작물은 겨울철 토양을 보호합니다." : "";
    const advice = "종자를 구입하기 전에 관할 지역의 농업지도 담당자와 확인하세요.";
    const speech = `${climateLine} ${provenance} ${recommendation}${benefit}${coverLine} ${advice}`
      .replace(/([\d.]+) °F·일/g, "$1화씨 도일")
      .replace(/([\d.]+)\s*°F/g, "화씨 $1도")
      .replace(/([\d.]+) %p/g, "$1퍼센트포인트")
      .replace(/ → /g, ", 다음으로 ");
    return {
      summary: `${climateLine} ${provenance} ${recommendation}${comparison}`,
      speech,
      sms: `SoilSense 윤작 계획: ${planSentenceKo(top)}. ${provenance} ${advice}`,
    };
  }
  const place = args.placeName ? ` near ${args.placeName}` : "";

  const climateLine = keyTrend
    ? `NASA data for your field${place} shows ${lowerFirst(keyTrend.label)} ${keyTrend.changePerDecade > 0 ? "rising" : "falling"} by about ${Math.abs(round(keyTrend.changePerDecade, keyTrend.unit === "in" ? 1 : 0))} ${keyTrend.unit === "in" ? "inches" : keyTrend.unit} per decade, and that change is statistically real.`
    : `NASA data for your field${place} shows no statistically clear change in rain or heat since ${climate.firstYear}.`;

  const vs = facts.find((f) => f.id === "vs-current");
  const nDiff = currentPractice ? currentPractice.totalNitrogenLbPerAcre - top.totalNitrogenLbPerAcre : 0;
  const benefit = currentPractice && nDiff > 20 ? ` It needs about ${nDiff} pounds per acre less nitrogen over three years than your current pattern.` : "";
  const coverLine = top.coverYears > 0 ? " The cover crops protect your soil over winter." : "";

  if (args.language === "es") {
    const speech = `Revisé ${climate.lastYear - climate.firstYear + 1} años de datos climáticos de la NASA para su campo. Para ${PRIORITY_WORDS[priority].es}, le sugiero: ${planSentenceEs(top)}. Confirme con su agente de extensión antes de comprar semilla.`;
    return {
      summary: speech,
      speech,
      sms: `SoilSense: ${top.years.map((y) => `${y.year} ${CROP_ES[y.crop]}`).join(", ")}. Basado en datos NASA ${climate.firstYear}-${climate.lastYear}. Confirme con su agente de extensión.`,
    };
  }

  const speech = toSpeech(
    `${climateLine} Focusing on ${PRIORITY_WORDS[priority].en}, I suggest ${planSentenceEn(top)}.${benefit}${coverLine} Please check with your county extension agent before buying seed.`,
  );
  const summary = `${climateLine} Recommended for ${PRIORITY_WORDS[priority].en}: ${top.label}.${vs ? ` ${vs.text}` : ""}`;
  const sms =
    `SoilSense plan: ` +
    top.years.map((y) => `${y.year} ${y.cropName}${y.cover !== "none" ? ` + ${y.coverName}` : ""}`).join("; ") +
    `. Based on NASA climate data ${climate.firstYear}-${climate.lastYear}. Check with your extension agent.`;
  return { summary, speech, sms };
}
