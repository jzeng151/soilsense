import type { Language } from "../../src/shared/language";
import { cropText } from "./i18n";

const staticFacts: Record<string, string> = {
  "A fallow season (no crop, weeds controlled) stores roughly a quarter of the rain that falls during it in the soil, which raises the next crop's yield in dry areas, at the cost of a year without income and more erosion risk on bare ground.": "휴경기(작물 없이 잡초만 관리)에는 그 기간에 내린 비의 약 4분의 1이 토양에 저장되어 건조 지역에서 다음 작물의 수량을 높입니다. 다만 1년간 수입이 없고 맨땅의 침식 위험이 커집니다.",
  "Corn after soybean typically yields about 10–15% more and needs roughly 50 lb/acre less nitrogen than corn after corn.": "대두 다음에 옥수수를 재배하면 옥수수를 연작할 때보다 보통 수량이 약 10–15% 늘고 질소가 약 50 lb/acre 적게 필요합니다.",
  "First-year corn after alfalfa usually needs little or no added nitrogen.": "알팔파 다음 첫해에 재배하는 옥수수는 보통 추가 질소가 거의 또는 전혀 필요하지 않습니다.",
  "Adding a small grain (wheat or oats) breaks corn and soybean pest cycles and opens a summer window for a legume cover crop.": "맥류(밀 또는 귀리)를 추가하면 옥수수와 대두의 해충 발생 주기를 끊고 여름에 콩과 피복작물을 재배할 수 있습니다.",
  "Heat stress uses extreme-heat degree days above each crop's threshold (the measure used in Schlenker & Roberts, PNAS 2009); irrigation is assumed to remove about two-thirds of heat damage.": "고온 스트레스는 작물별 임계온도를 초과하는 극고온 적산온도(Schlenker & Roberts, PNAS 2009에서 사용한 지표)를 사용합니다. 관개는 고온 피해의 약 3분의 2를 줄이는 것으로 가정합니다.",
  "Climate history is shifted to today's conditions only where a trend is statistically significant (Mann-Kendall, p < 0.05).": "과거 기후 자료는 추세가 통계적으로 유의한 경우에만 현재 조건으로 보정합니다(Mann-Kendall, p < 0.05).",
  "Years from the last decade count twice when scoring climate fit.": "기후 적합성 점수를 계산할 때 최근 10년의 각 연도에는 두 배의 가중치를 줍니다.",
  "A crop-year counts as stressed when its combined water, heat, season-length and planting-condition score falls below 0.6.": "수분, 고온, 생육기간, 파종 조건을 합한 점수가 0.6 미만이면 해당 작물의 그해를 스트레스를 받은 해로 계산합니다.",
  "Each 3-year plan is replayed against every run of consecutive NASA weather years, carrying soil water from one season to the next: crops draw stored water down, and between crops the soil stores about 50% of cool-season (Nov–Mar) rain and 15% of warm-season rain. A winter cover crop uses about 40% of that recharge.": "각 3년 계획은 NASA 기상 자료의 모든 연속 연도 구간으로 재현하며 토양 수분을 다음 작기로 이월합니다. 작물은 저장된 수분을 소비하고, 작물 사이에 토양은 서늘한 계절(Nov–Mar) 강우의 약 50%와 따뜻한 계절 강우의 15%를 저장합니다. 겨울 피복작물은 이렇게 보충된 수분의 약 40%를 사용합니다.",
  "Effective in-season rainfall = 75% of season rain; the soil can hold 80% of its available water capacity, to 2 m or the depth of the soil.": "생육기 유효강우량 = 생육기 강우량의 75%입니다. 토양은 깊이 2 m 또는 토양 깊이까지 유효수분 보유능의 80%를 저장할 수 있습니다.",
  "Yield = water-unlimited potential × the share of the crop's water need that was met (a water-production function, with no grain below a crop-specific minimum) × heat, season-length and planting stress.": "수량 = 수분 제한이 없는 잠재수량 × 작물 물 요구량의 충족 비율(작물별 최솟값 미만에서는 곡실을 생산하지 않는 수분 생산 함수) × 고온, 생육기간, 파종 스트레스입니다.",
  "Yield potential: dry Plains states use approximate irrigated-practice yields; other states use state (or USDA NASS county) averages × 1.1, since average farm yields reach about 85–90% of potential.": "잠재수량: 건조한 대평원 주에서는 대략적인 관개 재배 수량을 사용합니다. 다른 주에서는 주 평균(또는 USDA NASS 카운티 평균) × 1.1을 사용합니다. 평균 농가 수량이 잠재수량의 약 85–90%에 이르기 때문입니다.",
  "Nitrogen, seed and other input costs scale with the expected yield (yield-goal method), so low-yield rain-fed crops are budgeted more cheaply.": "질소, 종자, 기타 투입 비용은 예상 수량에 비례합니다(목표수량 방식). 따라서 수량이 적은 천수 재배 작물의 예산은 더 낮게 책정됩니다.",
  "Fallow (a season with no crop, only weed control at about $45/acre) is offered only on rain-fed fields with under about 25 inches of rain a year.": "휴경(작물 없이 약 $45/acre의 잡초 관리만 하는 작기)은 연간 강우량이 약 25 inches 미만인 천수 재배 포장에서만 제안합니다.",
  "Irrigated fields: water need is met and about $110/acre pumping cost is added.": "관개 포장: 물 요구량이 충족되며 약 $110/acre의 양수 비용이 추가됩니다.",
  "Prices, costs, yield potentials and rotation yield effects are approximate defaults in src/engine/crops.ts and src/engine/regions.ts; replace them with local budgets.": "가격, 비용, 잠재수량, 윤작의 수량 효과는 src/engine/crops.ts와 src/engine/regions.ts에 있는 대략적인 기본값입니다. 지역 영농 예산으로 대체하세요.",
  "Winter wheat cannot be sown for the first plan year once its fall planting window has passed.": "가을 파종 적기가 지나면 계획 첫해의 겨울밀을 파종할 수 없습니다.",
  "Bad years out of 10: how often a crop would have been badly stressed when replayed through the 35 years of NASA weather (shifted to today's climate trends), averaged over the plan's crops.": "10년 중 흉작인 해: 현재 기후 추세로 보정한 35년간의 NASA 기상 자료를 재현했을 때 작물이 심한 스트레스를 받았을 빈도를 계획의 작물 전체에 걸쳐 평균한 값입니다.",
  "Prices are approximate defaults (add a USDA NASS API key for current state prices).": "가격은 대략적인 기본값입니다(현재 주별 가격을 사용하려면 USDA NASS API 키를 추가하세요).",
  "Replayed past years are history, not a forecast: each uses that year's real NASA weather on this soil, compared with what the county really harvested (USDA NASS) and why crop insurance paid out (USDA RMA).": "과거 연도 재현은 예보가 아닌 이력입니다. 각 연도의 실제 NASA 기상 자료를 이 토양에 적용하고, 카운티의 실제 수확량(USDA NASS) 및 작물 보험금 지급 원인(USDA RMA)과 비교합니다.",
  "Grain sorghum is left out because local markets for it are limited in this state.": "이 주에서는 수수의 지역 판로가 제한적이므로 수수를 제외합니다.",
  "Optional farmer goals add at most +0.1 total to the unchanged priority score, shared equally between the selected goals. Metrics are min–max normalized across feasible candidate plans before choosing covers; ties earn no bonus. Feasibility and crop-reliability gates still take precedence. Water uses simulated pumping (rain-only: main-crop water use); N uses lower fertilizer after credits (70%) and legume seasons (30%); erosion and organic matter use explicit rotation proxies, not measured outcomes. Forage-market bonus requires that goal; hay economics are unchanged.": "선택한 농가 목표는 기존 우선순위 점수에 합계 최대 +0.1을 추가하며, 선택한 목표에 균등 배분합니다. 피복작물을 선택하기 전에 실행 가능한 후보 계획 전체에서 지표를 최솟값–최댓값으로 정규화하며 동점에는 가점을 주지 않습니다. 실행 가능성과 작물 신뢰도 기준이 계속 우선합니다. 물 지표는 모의 양수량(강우 전용: 주작물 물 사용량)을 사용하고, N 지표는 질소 공제 후 비료 절감(70%)과 콩과 작물 재배 작기(30%)를 사용합니다. 침식과 유기물은 실측 결과 대신 명시적인 윤작 대리지표를 사용합니다. 조사료 판로 가점은 해당 목표를 선택해야 하며 건초 경제성은 바뀌지 않습니다.",
};

const indicators: Record<string, string> = {
  "Growing-season rain (May–Sep)": "생육기 강수량(5–9월)",
  "Spring rain (Apr–May)": "봄철 강수량(4–5월)",
  "Days at or above 95°F (Jun–Aug)": "95°F 이상인 날의 수(6–8월)",
  "Frost-free season": "무상기간",
  "Growing degree days (May–Sep)": "생육적산온도(5–9월)",
  "Growing-season warmth (May–Sep)": "생육기 온열량(5–9월)",
  "Longest summer dry spell (Jun–Aug)": "여름철 최장 연속 건조일수(6–8월)",
  "Average summer high (Jun–Aug)": "여름철 평균 최고기온(6–8월)",
  "Crop water demand (May–Sep)": "작물 물 요구량(5–9월)",
  "Water balance: rain minus demand (May–Sep)": "물수지: 강수량에서 물 요구량을 뺀 값(5–9월)",
  "Root-zone soil wetness (Jun–Aug)": "근권 토양 습윤도(6–8월)",
};
const drainage: Record<string, string> = {
  "excessively drained": "과도한 배수",
  "somewhat excessively drained": "다소 과도한 배수",
  "well drained": "양호한 배수",
  "moderately well drained": "보통으로 양호한 배수",
  "somewhat poorly drained": "다소 불량한 배수",
  "poorly drained": "불량한 배수",
  "very poorly drained": "매우 불량한 배수",
};
const stresses: Record<string, string> = {
  water: "수분 부족", heat: "고온", "season length": "생육기간", "wet spring": "습한 봄",
  "winter cold": "겨울 추위", "too much rain": "과도한 강우",
};
const lossCauses: Record<string, string> = {
  "drought or heat": "가뭄 또는 고온", "too much rain or flooding": "과도한 강우 또는 홍수",
  hail: "우박", "wind storms": "폭풍", "freeze or cold": "동결 또는 추위",
  "disease or insects": "병해 또는 해충", "other causes": "기타 원인",
};
const historyCrops: Record<string, string> = {
  soybeans: "대두", cotton: "면화", rice: "벼", sunflower: "해바라기",
  "sweet corn": "단옥수수", "pop or orn corn": "팝콘용 또는 관상용 옥수수",
  barley: "보리", "durum wheat": "듀럼밀", "spring wheat": "봄밀", rye: "호밀",
  "dbl crop winwht/soybeans": "겨울밀/대두 이모작", "dbl crop winwht/corn": "겨울밀/옥수수 이모작",
  "other hay/non alfalfa": "기타 건초/알팔파 제외", "sod/grass seed": "잔디/목초 종자",
  "fallow/idle cropland": "휴경/유휴 경작지", "open water": "수역",
  "developed/open space": "개발지/개방 공간", "developed/low intensity": "저밀도 개발지",
  "developed/med intensity": "중밀도 개발지", "developed/high intensity": "고밀도 개발지",
  "deciduous forest": "낙엽수림", "evergreen forest": "상록수림", "mixed forest": "혼합림",
  "grassland/pasture": "초지/목초지", "woody wetlands": "목본 습지", "herbaceous wetlands": "초본 습지",
};
const crop = (value: string) => cropText(value, "ko");
const historyCrop = (value: string) => Object.hasOwn(historyCrops, value) ? historyCrops[value]! : crop(value);
const area = (value: string) => value === "county" ? "카운티" : value.endsWith(" district") ? `${value.slice(0, -9)} 지구` : value;
const practice = (value: string) => value === "rain-fed" ? "천수 재배" : "관개 재배";

const measurementTextures: Record<string, string> = {
  sand: "사토", sandy_loam: "사양토", loam: "양토",
  silt_loam: "미사질양토", clay_loam: "식양토", clay: "식토",
};

/** Whole farmer-measurement templates from engine/plan.ts; citations are never rewritten. */
function measurementFactText(value: string): string | null {
  let m = /^Using your soil test (pH|organic matter|available water capacity) (\d+(?:\.\d+)?(?:e[+-]?\d+)?)(%| cm\/cm|) instead of the soil map's (unavailable|\d+(?:\.\d+)?\3)\.(?: Approximate capacity inferred from your (sand|sandy_loam|loam|silt_loam|clay_loam|clay) texture; not measured\.)?$/.exec(value);
  if (m) {
    const unit = m[1] === "pH" ? "" : m[1] === "organic matter" ? "%" : " cm/cm";
    if (m[3] !== unit || (m[5] && m[1] !== "available water capacity")) return null;
    const label = m[1] === "pH" ? "pH" : m[1] === "organic matter" ? "유기물" : "유효수분 보유능";
    const mapped = m[4] === "unavailable" ? "자료 없음" : m[4];
    const text = `토양 지도 값 ${mapped} 대신 입력한 토양 검사 ${label} ${m[2]}${unit} 값을 사용합니다.`;
    const texture = m[5] ? measurementTextures[m[5]] : null;
    return text + (texture ? ` 입력한 ${texture} 토성에서 추정한 대략적인 보유능이며 실측값이 아닙니다.` : "");
  }
  if (value === "Your organic matter replaces the map value in soil evidence; the model does not infer yield or water capacity changes from organic matter.") return "입력한 유기물 값은 토양 근거에서 지도 값을 대체합니다. 모델은 유기물로부터 수량이나 수분 보유능의 변화를 추정하지 않습니다.";
  m = /^Calibrated with your (\d+) years of (corn|soybean|winter wheat|oats|alfalfa \(hay\)|grain sorghum) yields \((\d{4}(?:, \d{4})*)\), average (\d+\.\d) (bu\/acre|US short tons\/acre)\. Regional potential (\d+\.\d) → (\d+\.\d): additive 50% adjustment toward average ÷ modeled weather fraction (\d+\.\d{3}), bounded to 60–115% of the state value\. (\d+) years outside weather history use the last-10-year fraction\. Assumes the selected water supply and usual previous crop; not independent validation\.$/.exec(value);
  if (m) return `입력한 ${crop(m[2]!)} 수량 ${m[1]}년 자료(${m[3]}), 평균 ${m[4]} ${m[5]}로 보정했습니다. 지역 잠재수량 ${m[6]} → ${m[7]}: 평균 ÷ 모델 기상 비율 ${m[8]}을 향해 차이의 50%를 더해 조정하며, 주 기준값의 60–115%로 제한합니다. 기상 이력 밖의 ${m[9]}년에는 최근 10년의 비율을 사용합니다. 선택한 용수 공급과 통상적인 전작을 가정하며, 독립적인 검증이 아닙니다.`;
  m = /^Your (corn|soybean|winter wheat|oats|alfalfa \(hay\)|grain sorghum) yields are stored in this browser, but this crop is not modeled in this region; no calibration was applied\.$/.exec(value);
  if (m) return `입력한 ${crop(m[1]!)} 수량은 이 브라우저에 저장되지만, 이 지역에서는 해당 작물을 모델링하지 않으므로 보정을 적용하지 않았습니다.`;
  return null;
}

/** Only complete deterministic engine templates are translated; provider prose stays verbatim. */
export function factText(value: string, language: Language): string {
  if (language === "ko" || language === "zh-Hans") {
    const measurement = measurementFactText(value, language);
    if (measurement !== null) return measurement;
  }
  if (language === "zh-Hans") return chineseFactText(value);
  if (language !== "ko") return value;
  const measurement = measurementFactText(value);
  if (measurement !== null) return measurement;
  if (Object.hasOwn(staticFacts, value)) return staticFacts[value]!;

  let m = /^(.+) is (rising|falling): ([+−-]?\d+(?:\.\d+)?) (in|days|°F·days|heat units|°F|%) per decade since (\d{4})(?: \(statistically significant, p = ([\d.]+)\))?\.$/.exec(value);
  if (m && Object.hasOwn(indicators, m[1]!)) return `${indicators[m[1]!]}: ${m[5]}년 이후 10년마다 ${m[3]} ${m[4]} ${m[2] === "rising" ? "증가" : "감소"}${m[6] ? ` (통계적으로 유의함, p = ${m[6]})` : ""}.`;
  m = /^(.+): no (?:statistically )?clear change since (\d{4})(?: \(([+−-]?\d+(?:\.\d+)?) (in|days|°F·days|heat units|°F|%) per decade, p = ([\d.]+)\))?\.$/.exec(value);
  if (m && Object.hasOwn(indicators, m[1]!)) return `${indicators[m[1]!]}: ${m[2]}년 이후 뚜렷한 변화 없음${m[3] ? ` (10년마다 ${m[3]} ${m[4]}, p = ${m[5]})` : ""}.`;

  m = /^Satellite crop map shows this field was (.+) \((\d{4})–(\d{4})\)\.$/.exec(value);
  if (m) {
    const parts = m[1]!.split(", ").map(part => /^(.+) (\d+) of (\d+) years$/.exec(part));
    if (parts.every(part => part !== null)) return `위성 작물 지도에 따르면 이 포장의 재배 이력은 ${parts.map(part => `${historyCrop(part![1]!)} ${part![3]}년 중 ${part![2]}년`).join(", ")}입니다(${m[2]}–${m[3]}).`;
  }
  m = /^Recent crops \(as reported\): (.+)\.$/.exec(value);
  if (m) return `최근 재배 작물(보고된 내용): ${m[1]!.split(", then ").map(crop).join(" → ")}.`;
  m = /^Soil: (.*)\.$/.exec(value);
  if (m) return `토양: ${m[1]!.split(", ").map(bit => {
    if (Object.hasOwn(drainage, bit)) return drainage[bit];
    const organic = /^(\d+\.\d+)% organic matter$/.exec(bit);
    return organic ? `유기물 ${organic[1]}%` : bit;
  }).join(", ")}.`;
  m = /^(.+) prefers pH ≥ (\d+(?:\.\d+)?); topsoil pH is (\d+\.\d+) \(lime would help\)\.$/.exec(value);
  if (m) return `${crop(m[1]!)}의 적정 pH는 ≥ ${m[2]}이며 표토 pH는 ${m[3]}입니다(석회 시용이 도움이 됩니다).`;
  m = /^(.+) does poorly on (.+) soils\.$/.exec(value);
  if (m && Object.hasOwn(drainage, m[2]!)) return `${crop(m[1]!)} 재배는 ${drainage[m[2]!]} 토양에서 생육이 좋지 않습니다.`;

  m = /^Replaying (\d+) years of NASA weather \(shifted to today's trends\) with soil water carried from the crop before, (.+) in this rotation would have been stressed in about (\d+) of (\d+) years(?:, mostly from (water|heat|season length|wet spring|winter cold|too much rain))?( \(irrigated\))?\.$/.exec(value);
  if (m) return `현재 추세로 보정한 ${m[1]}년간의 NASA 기상 자료를 이전 작물의 토양 수분을 이월하여 재현하면, 이 윤작의 ${crop(m[2]!)} 재배는 ${m[4]}년 중 약 ${m[3]}년에 스트레스를 받았을 것으로 추정됩니다${m[5] ? ` (주원인: ${stresses[m[5]!]})` : ""}${m[6] ? " (관개)" : ""}.`;
  m = /^Planting (.+) again right after \1 increases pest and disease pressure\.$/.exec(value);
  if (m) return `${crop(m[1]!)} 연작은 해충과 병해 부담을 키웁니다.`;
  m = /^Winter cover crops in (\d+) of 3 years protect soil from erosion and hold nitrogen over winter\.$/.exec(value);
  if (m) return `3년 중 ${m[1]}년에 재배하는 겨울 피복작물은 토양 침식을 막고 겨울 동안 질소를 보유합니다.`;
  m = /^Compared with continuing the current pattern \((.+)\): estimated ([+−])\$(\d+(?:\.\d+)?)\/acre per year, (\d+(?:\.\d+)?) lb\/acre (less|more) nitrogen over 3 years, and a soil-health score of (\d+) vs (\d+) out of 100\.$/.exec(value);
  if (m) return `현재 재배 방식(${m[1]!.split(" → ").map(crop).join(" → ")})을 유지할 때와 비교: 연간 추정 순수익 차이 ${m[2]}$${m[3]}/acre, 3년간 질소 ${m[4]} lb/acre ${m[5] === "less" ? "감소" : "증가"}, 토양 건강 점수는 100점 만점에 ${m[6]} 대 ${m[7]}입니다.`;
  m = /^Since (\d{4}), crop insurance in (.+) paid for (.+) losses mostly because of (.+)\.$/.exec(value);
  if (m) {
    const parts = m[4]!.split(" and ").map(part => /^(.+) \((\d+)% of payouts, in (\d+) years\)$/.exec(part));
    if (parts.every(part => part && Object.hasOwn(lossCauses, part[1]!))) return `${m[1]}년 이후 ${m[2] === "this county" ? "이 카운티" : m[2]}에서 ${crop(m[3]!)} 손실에 지급된 작물 보험금의 주원인은 ${parts.map(part => `${lossCauses[part![1]!]}(보험금의 ${part![2]}%, ${part![3]}년)`).join(" 및 ")}입니다.`;
  }

  m = /^Yield potential uses approximate ([A-Z]{2}|Iowa) state values \(add a USDA NASS API key for county averages\)\.$/.exec(value);
  if (m) return `잠재수량은 ${m[1]} 주의 대략적인 값을 사용합니다(카운티 평균을 사용하려면 USDA NASS API 키를 추가하세요).`;
  m = /^This area averages about (\d+) inches of rain a year; fallow was (not )?considered\.$/.exec(value);
  if (m) return `이 지역의 연평균 강우량은 약 ${m[1]} inches이며 휴경을 ${m[2] ? "고려하지 않았습니다" : "고려했습니다"}.`;
  m = /^Water: (rain only|full irrigation)\. Pumping costs about \$8 per inch of water per acre\.$/.exec(value);
  if (m) return `용수: ${m[1] === "rain only" ? "강우만 이용" : "전량 관개"}. 양수 비용은 에이커당 물 1 inch에 약 $8입니다.`;
  if (value === "Water: limited irrigation (about 10 in a year). Limited irrigation covers the crop's shortfall first, up to about 10 inches a season, as in K-State's Tribune limited-irrigation trial; stored soil water covers the rest. Pumping costs about $8 per inch of water per acre.") return "용수: 제한 관개(연간 약 10 in). K-State's Tribune 제한 관개 시험과 같이 작기의 물 부족분을 먼저 최대 약 10 inches까지 관개로 충족하고, 나머지는 토양에 저장된 수분으로 충족합니다. 양수 비용은 에이커당 물 1 inch에 약 $8입니다.";
  m = /^Yield potential is calibrated to real USDA NASS harvests for (rain-fed|irrigated) fields: recent average ÷ the share of potential the model says recent weather allowed \(kept within 60–115% of the state value\)\.$/.exec(value);
  if (m) return `잠재수량은 ${practice(m[1]!)} 포장의 실제 USDA NASS 수확량으로 보정합니다. 최근 평균 ÷ 최근 기상이 허용했다고 모델이 추정하는 잠재수량 비율이며, 주 기준값의 60–115% 이내로 유지합니다.`;
  m = /^(.+) yield basis: (.+)\.$/.exec(value);
  if (m) {
    const basis = yieldBasis(m[2]!);
    if (basis) return `${crop(m[1]!)} 수량 기준: ${basis}.`;
  }
  m = /^Prices: USDA NASS prices received, average of the latest months — (.*)\. Other prices are defaults\.$/.exec(value);
  if (m) {
    const parts = m[1] ? m[1].split(/, (?=[^,]+ \$)/).map(part => /^(.+) (\$\d+\.\d+\/[^ ]+) \((state|national), (\d+) months to ([^)]+)\)$/.exec(part)) : [];
    if (parts.every(part => part !== null)) return `가격: USDA NASS 농가 수취가격, 최근 월별 평균 — ${parts.map(part => `${crop(part![1]!)} ${part![2]} (${part![3] === "state" ? "주" : "전국"}, ${part![5]}까지 ${part![4]}개월)`).join(", ")}. 기타 가격은 기본값입니다.`;
  }
  return value;
}

function yieldBasis(value: string): string | null {
  if (value === "county average (all fields)") return "카운티 평균(모든 포장)";
  let m = /^USDA (county|.+ district) average for (rain-fed|irrigated) fields, (\d+) reports up to (\d{4})$/.exec(value);
  if (m) return `USDA ${area(m[1]!)} ${practice(m[2]!)} 포장 평균, ${m[4]}년까지 ${m[3]}개 보고`;
  m = /^(county|.+ district) average for (\d+) recent years × (\d+)% \(how (rain-fed|irrigated) fields compared with all fields in (\d+) years of (county|.+ district) records\)$/.exec(value);
  if (m) return `${area(m[1]!)} 최근 ${m[2]}년 평균 × ${m[3]}%(${area(m[6]!)} 기록 ${m[5]}년에서 모든 포장 대비 ${practice(m[4]!)} 포장의 비율)`;
  m = /^(county|.+ district) average for (\d+) recent years \(all fields; USDA has no (rain-fed|irrigated) split here\)$/.exec(value);
  if (m) return `${area(m[1]!)} 최근 ${m[2]}년 평균(모든 포장; USDA의 이 지역 ${practice(m[3]!)} 구분 자료 없음)`;
  return null;
}

const chineseStaticFacts: Record<string, string> = {
  "A fallow season (no crop, weeds controlled) stores roughly a quarter of the rain that falls during it in the soil, which raises the next crop's yield in dry areas, at the cost of a year without income and more erosion risk on bare ground.": "休耕季（不种作物，仅防除杂草）可将当季降雨的约四分之一储存在土壤中，提高干旱地区下一季作物的产量，但代价是一年没有收入，且裸地的侵蚀风险增加。",
  "Corn after soybean typically yields about 10–15% more and needs roughly 50 lb/acre less nitrogen than corn after corn.": "与玉米连作相比，大豆茬玉米的产量通常提高约 10–15%，氮肥需求减少约 50 lb/acre。",
  "First-year corn after alfalfa usually needs little or no added nitrogen.": "苜蓿之后第一年种植的玉米通常只需少量或无需额外施氮。",
  "Adding a small grain (wheat or oats) breaks corn and soybean pest cycles and opens a summer window for a legume cover crop.": "加入小粒谷物（小麦或燕麦）可打断玉米和大豆的害虫发生周期，并在夏季留出种植豆科覆盖作物的时间。",
  "Heat stress uses extreme-heat degree days above each crop's threshold (the measure used in Schlenker & Roberts, PNAS 2009); irrigation is assumed to remove about two-thirds of heat damage.": "高温胁迫采用超过各作物温度阈值的极端高温积温（Schlenker & Roberts, PNAS 2009 使用的指标）；假定灌溉可减轻约三分之二的高温损害。",
  "Climate history is shifted to today's conditions only where a trend is statistically significant (Mann-Kendall, p < 0.05).": "仅在趋势具有统计显著性时，才将历史气候资料调整到当前条件（Mann-Kendall, p < 0.05）。",
  "Years from the last decade count twice when scoring climate fit.": "计算气候适宜性评分时，最近十年的各年份按双倍权重计入。",
  "A crop-year counts as stressed when its combined water, heat, season-length and planting-condition score falls below 0.6.": "当水分、高温、生长季长度和播种条件的综合评分低于 0.6 时，该作物在该年份被计为受到胁迫。",
  "Each 3-year plan is replayed against every run of consecutive NASA weather years, carrying soil water from one season to the next: crops draw stored water down, and between crops the soil stores about 50% of cool-season (Nov–Mar) rain and 15% of warm-season rain. A winter cover crop uses about 40% of that recharge.": "每个 3 年计划均用 NASA 气象资料中所有连续年份序列进行回放，并将土壤水分逐季结转：作物消耗储存的水分，作物间歇期土壤储存约 50% 的冷季（Nov–Mar）降雨和 15% 的暖季降雨。冬季覆盖作物消耗约 40% 的这部分补充水量。",
  "Effective in-season rainfall = 75% of season rain; the soil can hold 80% of its available water capacity, to 2 m or the depth of the soil.": "生长季有效降雨量 = 当季降雨量的 75%；在 2 m 深度或实际土层深度范围内，土壤可储存其有效持水容量的 80%。",
  "Yield = water-unlimited potential × the share of the crop's water need that was met (a water-production function, with no grain below a crop-specific minimum) × heat, season-length and planting stress.": "产量 = 无水分限制的潜在产量 × 作物需水量的满足比例（水分生产函数，低于作物特定最低值时不形成籽粒）× 高温、生长季长度和播种胁迫系数。",
  "Yield potential: dry Plains states use approximate irrigated-practice yields; other states use state (or USDA NASS county) averages × 1.1, since average farm yields reach about 85–90% of potential.": "潜在产量：干旱大平原各州采用灌溉种植的近似产量；其他州采用州平均值（或 USDA NASS 县平均值）× 1.1，因为农场平均产量约为潜在产量的 85–90%。",
  "Nitrogen, seed and other input costs scale with the expected yield (yield-goal method), so low-yield rain-fed crops are budgeted more cheaply.": "氮肥、种子及其他投入成本随预期产量调整（目标产量法），因此低产雨养作物的预算成本较低。",
  "Fallow (a season with no crop, only weed control at about $45/acre) is offered only on rain-fed fields with under about 25 inches of rain a year.": "休耕（一个种植季不种作物，仅进行约 $45/acre 的杂草防除）仅适用于年降雨量低于约 25 inches 的雨养田块。",
  "Irrigated fields: water need is met and about $110/acre pumping cost is added.": "灌溉田块：满足作物需水量，并增加约 $110/acre 的抽水成本。",
  "Prices, costs, yield potentials and rotation yield effects are approximate defaults in src/engine/crops.ts and src/engine/regions.ts; replace them with local budgets.": "价格、成本、潜在产量及轮作的产量效应均为 src/engine/crops.ts 和 src/engine/regions.ts 中的近似默认值；请用当地预算替换。",
  "Winter wheat cannot be sown for the first plan year once its fall planting window has passed.": "秋季播种窗口结束后，计划第一年便不能再播种冬小麦。",
  "Bad years out of 10: how often a crop would have been badly stressed when replayed through the 35 years of NASA weather (shifted to today's climate trends), averaged over the plan's crops.": "每 10 年中的不利年份：用 35 年 NASA 气象资料（已按当前气候趋势调整）回放时作物受到严重胁迫的频率，取计划内各作物的平均值。",
  "Prices are approximate defaults (add a USDA NASS API key for current state prices).": "价格为近似默认值（添加 USDA NASS API 密钥可获取当前州级价格）。",
  "Replayed past years are history, not a forecast: each uses that year's real NASA weather on this soil, compared with what the county really harvested (USDA NASS) and why crop insurance paid out (USDA RMA).": "历史年份回放反映历史情况，并非预测：每年均将该年真实的 NASA 气象资料应用于此土壤，并与县级实际收获量（USDA NASS）及作物保险赔付原因（USDA RMA）对照。",
  "Grain sorghum is left out because local markets for it are limited in this state.": "由于该州谷物高粱的当地市场有限，未将其纳入计划。",
  "Optional farmer goals add at most +0.1 total to the unchanged priority score, shared equally between the selected goals. Metrics are min–max normalized across feasible candidate plans before choosing covers; ties earn no bonus. Feasibility and crop-reliability gates still take precedence. Water uses simulated pumping (rain-only: main-crop water use); N uses lower fertilizer after credits (70%) and legume seasons (30%); erosion and organic matter use explicit rotation proxies, not measured outcomes. Forage-market bonus requires that goal; hay economics are unchanged.": "可选的农户目标在原有优先级评分上合计最多增加 +0.1，并在所选目标间平均分配。选择覆盖作物之前，先在可行候选计划间对指标进行最小值–最大值归一化；并列时不加分。可行性和作物可靠性门槛仍优先适用。用水指标采用模拟抽水量（仅降雨时采用主作物用水量）；N 指标采用氮抵扣后的施肥减少量（70%）及豆科作物种植季（30%）；侵蚀和有机质采用明确的轮作代理指标，并非实测结果。饲草市场加分需选择该目标；干草经济性保持不变。",
};

const chineseIndicators: Record<string, string> = {
  "Growing-season rain (May–Sep)": "生长季降雨量（May–Sep）",
  "Spring rain (Apr–May)": "春季降雨量（Apr–May）",
  "Days at or above 95°F (Jun–Aug)": "达到或超过 95°F 的天数（Jun–Aug）",
  "Frost-free season": "无霜期",
  "Growing degree days (May–Sep)": "生长度日（May–Sep）",
  "Growing-season warmth (May–Sep)": "生长季热量（May–Sep）",
  "Longest summer dry spell (Jun–Aug)": "夏季最长连续干旱期（Jun–Aug）",
  "Average summer high (Jun–Aug)": "夏季平均最高温度（Jun–Aug）",
  "Crop water demand (May–Sep)": "作物需水量（May–Sep）",
  "Water balance: rain minus demand (May–Sep)": "水量平衡：降雨量减需水量（May–Sep）",
  "Root-zone soil wetness (Jun–Aug)": "根区土壤湿度（Jun–Aug）",
};
const chineseDrainage: Record<string, string> = {
  "excessively drained": "排水过强", "somewhat excessively drained": "排水偏强",
  "well drained": "排水良好", "moderately well drained": "排水中等良好",
  "somewhat poorly drained": "排水稍差", "poorly drained": "排水不良", "very poorly drained": "排水极差",
};
const chineseStresses: Record<string, string> = {
  water: "水分不足", heat: "高温", "season length": "生长季长度", "wet spring": "春季过湿",
  "winter cold": "冬季寒冷", "too much rain": "降雨过多",
};
const chineseLossCauses: Record<string, string> = {
  "drought or heat": "干旱或高温", "too much rain or flooding": "降雨过多或洪涝", hail: "冰雹",
  "wind storms": "风暴", "freeze or cold": "冰冻或寒冷", "disease or insects": "病害或虫害", "other causes": "其他原因",
};
const chineseCrops: Record<string, string> = {
  corn: "玉米", soybean: "大豆", soybeans: "大豆", winter_wheat: "冬小麦", wheat: "冬小麦",
  oats: "燕麦", alfalfa: "苜蓿", "alfalfa_/_hay": "苜蓿 / 干草", "alfalfa_(hay)": "苜蓿 / 干草",
  sorghum: "谷物高粱", grain_sorghum: "谷物高粱", fallow: "休耕（不种作物）", "fallow_(no_crop)": "休耕（不种作物）",
};
const chineseHistoryCrops: Record<string, string> = {
  cotton: "棉花", rice: "水稻", sunflower: "向日葵", "sweet corn": "甜玉米",
  "pop or orn corn": "爆裂玉米或观赏玉米", barley: "大麦", "durum wheat": "硬粒小麦",
  "spring wheat": "春小麦", rye: "黑麦", "dbl crop winwht/soybeans": "冬小麦/大豆一年两熟",
  "dbl crop winwht/corn": "冬小麦/玉米一年两熟", "other hay/non alfalfa": "其他干草/非苜蓿",
  "sod/grass seed": "草皮/草籽", "fallow/idle cropland": "休耕/闲置耕地", "open water": "开阔水域",
  "developed/open space": "建设用地/开放空间", "developed/low intensity": "低强度建设用地",
  "developed/med intensity": "中强度建设用地", "developed/high intensity": "高强度建设用地",
  "deciduous forest": "落叶林", "evergreen forest": "常绿林", "mixed forest": "混交林",
  "grassland/pasture": "草地/牧场", "woody wetlands": "木本湿地", "herbaceous wetlands": "草本湿地",
};
const chineseCrop = (value: string) => {
  const key = value.toLowerCase().replaceAll(" ", "_");
  return Object.hasOwn(chineseCrops, key) ? chineseCrops[key]! : value;
};
const chineseHistoryCrop = (value: string) => Object.hasOwn(chineseHistoryCrops, value) ? chineseHistoryCrops[value]! : chineseCrop(value);
const chineseArea = (value: string) => value === "county" ? "县" : value.endsWith(" district") ? `${value.slice(0, -9)} 区` : value;
const chinesePractice = (value: string) => value === "rain-fed" ? "雨养" : "灌溉";

const measurementTextures: Record<string, [string, string]> = {
  sand: ["사토", "砂土"], sandy_loam: ["사양토", "砂壤土"], loam: ["양토", "壤土"],
  silt_loam: ["미사질양토", "粉砂壤土"], clay_loam: ["식양토", "黏壤土"], clay: ["식토", "黏土"],
};

/** Whole farmer-measurement templates from engine/plan.ts; citations are never rewritten. */
function measurementFactText(value: string, language: Extract<Language, "ko" | "zh-Hans">): string | null {
  const ko = language === "ko";
  let m = /^Using your soil test (pH|organic matter|available water capacity) (\d+(?:\.\d+)?(?:e[+-]?\d+)?)(%| cm\/cm|) instead of the soil map's (unavailable|\d+(?:\.\d+)?\3)\.(?: Approximate capacity inferred from your (sand|sandy_loam|loam|silt_loam|clay_loam|clay) texture; not measured\.)?$/.exec(value);
  if (m) {
    const unit = m[1] === "pH" ? "" : m[1] === "organic matter" ? "%" : " cm/cm";
    if (m[3] !== unit || (m[5] && m[1] !== "available water capacity")) return null;
    const label = m[1] === "pH" ? "pH" : m[1] === "organic matter" ? (ko ? "유기물" : "有机质") : (ko ? "유효수분 보유능" : "有效持水量");
    const mapped = m[4] === "unavailable" ? (ko ? "자료 없음" : "无数据") : m[4];
    const text = ko ? `토양 지도 값 ${mapped} 대신 입력한 토양 검사 ${label} ${m[2]}${unit} 값을 사용합니다.` : `采用您输入的土壤检测${label} ${m[2]}${unit}，替代土壤地图值 ${mapped}。`;
    const texture = m[5] ? measurementTextures[m[5]]![ko ? 0 : 1] : null;
    return text + (texture ? (ko ? ` 입력한 ${texture} 토성에서 추정한 대략적인 보유능이며 실측값이 아닙니다.` : ` 该持水量根据您输入的${texture}质地粗略推断，并非实测值。`) : "");
  }
  if (value === "Your organic matter replaces the map value in soil evidence; the model does not infer yield or water capacity changes from organic matter.") return ko
    ? "입력한 유기물 값은 토양 근거에서 지도 값을 대체합니다. 모델은 유기물로부터 수량이나 수분 보유능의 변화를 추정하지 않습니다."
    : "您输入的有机质值替代土壤证据中的地图值；模型不会根据有机质推断产量或持水量的变化。";
  m = /^Calibrated with your (\d+) years of (corn|soybean|winter wheat|oats|alfalfa \(hay\)|grain sorghum) yields \((\d{4}(?:, \d{4})*)\), average (\d+\.\d) (bu\/acre|US short tons\/acre)\. Regional potential (\d+\.\d) → (\d+\.\d): additive 50% adjustment toward average ÷ modeled weather fraction (\d+\.\d{3}), bounded to 60–115% of the state value\. (\d+) years outside weather history use the last-10-year fraction\. Assumes the selected water supply and usual previous crop; not independent validation\.$/.exec(value);
  if (m) return ko
    ? `입력한 ${crop(m[2]!)} 수량 ${m[1]}년 자료(${m[3]}), 평균 ${m[4]} ${m[5]}로 보정했습니다. 지역 잠재수량 ${m[6]} → ${m[7]}: 평균 ÷ 모델 기상 비율 ${m[8]}을 향해 차이의 50%를 더해 조정하며, 주 기준값의 60–115%로 제한합니다. 기상 이력 밖의 ${m[9]}년에는 최근 10년의 비율을 사용합니다. 선택한 용수 공급과 통상적인 전작을 가정하며, 독립적인 검증이 아닙니다.`
    : `使用您提供的 ${m[1]} 年${chineseCrop(m[2]!)}产量记录（${m[3]}），平均 ${m[4]} ${m[5]}进行校准。区域潜在产量 ${m[6]} → ${m[7]}：以平均值 ÷ 模拟气象比例 ${m[8]} 为目标，加上差值的 50% 进行调整，限制在州基准值的 60–115% 以内。气象历史范围之外的 ${m[9]} 年采用最近 10 年的比例。假设采用所选供水方式和通常的前茬作物；这并非独立验证。`;
  m = /^Your (corn|soybean|winter wheat|oats|alfalfa \(hay\)|grain sorghum) yields are stored in this browser, but this crop is not modeled in this region; no calibration was applied\.$/.exec(value);
  if (m) return ko
    ? `입력한 ${crop(m[1]!)} 수량은 이 브라우저에 저장되지만, 이 지역에서는 해당 작물을 모델링하지 않으므로 보정을 적용하지 않았습니다.`
    : `您的${chineseCrop(m[1]!)}产量记录已保存在此浏览器中，但本地区未对该作物建模，因此未应用校准。`;
  return null;
}

function chineseFactText(value: string): string {
  if (Object.hasOwn(chineseStaticFacts, value)) return chineseStaticFacts[value]!;
  let m = /^(.+) is (rising|falling): ([+−-]?\d+(?:\.\d+)?) (in|days|°F·days|heat units|°F|%) per decade since (\d{4})(?: \(statistically significant, p = ([\d.]+)\))?\.$/.exec(value);
  if (m && Object.hasOwn(chineseIndicators, m[1]!)) return `${chineseIndicators[m[1]!]}：自 ${m[5]} 年以来每十年${m[2] === "rising" ? "上升" : "下降"} ${m[3]} ${m[4]}${m[6] ? `（具有统计显著性，p = ${m[6]}）` : ""}。`;
  m = /^(.+): no (?:statistically )?clear change since (\d{4})(?: \(([+−-]?\d+(?:\.\d+)?) (in|days|°F·days|heat units|°F|%) per decade, p = ([\d.]+)\))?\.$/.exec(value);
  if (m && Object.hasOwn(chineseIndicators, m[1]!)) return `${chineseIndicators[m[1]!]}：自 ${m[2]} 年以来无明显变化${m[3] ? `（每十年 ${m[3]} ${m[4]}，p = ${m[5]}）` : ""}。`;
  m = /^Satellite crop map shows this field was (.+) \((\d{4})–(\d{4})\)\.$/.exec(value);
  if (m) {
    const parts = m[1]!.split(", ").map(part => /^(.+) (\d+) of (\d+) years$/.exec(part));
    if (parts.every(part => part !== null)) return `卫星作物地图显示，该田块的历史种植情况为：${parts.map(part => `${chineseHistoryCrop(part![1]!)} ${part![3]} 年中有 ${part![2]} 年`).join("，")}（${m[2]}–${m[3]}）。`;
  }
  m = /^Recent crops \(as reported\): (.+)\.$/.exec(value);
  if (m) return `近期作物（据报告）：${m[1]!.split(", then ").map(chineseCrop).join(" → ")}。`;
  m = /^Soil: (.*)\.$/.exec(value);
  if (m) return `土壤：${m[1]!.split(", ").map(bit => {
    if (Object.hasOwn(chineseDrainage, bit)) return chineseDrainage[bit];
    const organic = /^(\d+\.\d+)% organic matter$/.exec(bit);
    return organic ? `有机质 ${organic[1]}%` : bit;
  }).join(", ")}。`;
  m = /^(.+) prefers pH ≥ (\d+(?:\.\d+)?); topsoil pH is (\d+\.\d+) \(lime would help\)\.$/.exec(value);
  if (m) return `${chineseCrop(m[1]!)}适宜的 pH ≥ ${m[2]}；表土 pH 为 ${m[3]}（施用石灰有帮助）。`;
  m = /^(.+) does poorly on (.+) soils\.$/.exec(value);
  if (m && Object.hasOwn(chineseDrainage, m[2]!)) return `${chineseCrop(m[1]!)}在${chineseDrainage[m[2]!]}的土壤上生长不良。`;
  m = /^Replaying (\d+) years of NASA weather \(shifted to today's trends\) with soil water carried from the crop before, (.+) in this rotation would have been stressed in about (\d+) of (\d+) years(?:, mostly from (water|heat|season length|wet spring|winter cold|too much rain))?( \(irrigated\))?\.$/.exec(value);
  if (m) return `回放 ${m[1]} 年 NASA 气象资料（已按当前趋势调整），并结转前茬作物留下的土壤水分后，估计该轮作中的${chineseCrop(m[2]!)}在 ${m[4]} 年中约有 ${m[3]} 年受到胁迫${m[5] ? `（主要原因：${chineseStresses[m[5]!]}）` : ""}${m[6] ? "（灌溉）" : ""}。`;
  m = /^Planting (.+) again right after \1 increases pest and disease pressure\.$/.exec(value);
  if (m) return `${chineseCrop(m[1]!)}连作会增加病虫害压力。`;
  m = /^Winter cover crops in (\d+) of 3 years protect soil from erosion and hold nitrogen over winter\.$/.exec(value);
  if (m) return `在 3 年中的 ${m[1]} 年种植冬季覆盖作物，可保护土壤免受侵蚀，并在冬季保留氮素。`;
  m = /^Compared with continuing the current pattern \((.+)\): estimated ([+−])\$(\d+(?:\.\d+)?)\/acre per year, (\d+(?:\.\d+)?) lb\/acre (less|more) nitrogen over 3 years, and a soil-health score of (\d+) vs (\d+) out of 100\.$/.exec(value);
  if (m) return `与继续当前种植模式（${m[1]!.split(" → ").map(chineseCrop).join(" → ")}）相比：估计每年净收益差为 ${m[2]}$${m[3]}/acre，3 年间氮肥${m[5] === "less" ? "减少" : "增加"} ${m[4]} lb/acre，土壤健康评分为 ${m[6]} 对 ${m[7]}（满分 100）。`;
  m = /^Since (\d{4}), crop insurance in (.+) paid for (.+) losses mostly because of (.+)\.$/.exec(value);
  if (m) {
    const parts = m[4]!.split(" and ").map(part => /^(.+) \((\d+)% of payouts, in (\d+) years\)$/.exec(part));
    if (parts.every(part => part && Object.hasOwn(chineseLossCauses, part[1]!))) return `自 ${m[1]} 年以来，${m[2] === "this county" ? "本县" : m[2]}的${chineseCrop(m[3]!)}作物保险损失赔付主要源于${parts.map(part => `${chineseLossCauses[part![1]!]}（占赔付额 ${part![2]}%，涉及 ${part![3]} 年）`).join("和")}。`;
  }
  m = /^Yield potential uses approximate ([A-Z]{2}|Iowa) state values \(add a USDA NASS API key for county averages\)\.$/.exec(value);
  if (m) return `潜在产量采用 ${m[1]} 州的近似值（添加 USDA NASS API 密钥可获取县平均值）。`;
  m = /^This area averages about (\d+) inches of rain a year; fallow was (not )?considered\.$/.exec(value);
  if (m) return `该地区年平均降雨量约为 ${m[1]} inches；${m[2] ? "未考虑" : "已考虑"}休耕。`;
  m = /^Water: (rain only|full irrigation)\. Pumping costs about \$8 per inch of water per acre\.$/.exec(value);
  if (m) return `用水：${m[1] === "rain only" ? "仅靠降雨" : "充分灌溉"}。每 acre 每 inch 水的抽水成本约为 $8。`;
  if (value === "Water: limited irrigation (about 10 in a year). Limited irrigation covers the crop's shortfall first, up to about 10 inches a season, as in K-State's Tribune limited-irrigation trial; stored soil water covers the rest. Pumping costs about $8 per inch of water per acre.") return "用水：有限灌溉（每年约 10 in）。参照 K-State's Tribune 有限灌溉试验，先用灌溉满足作物的缺水量，每季最多约 10 inches；剩余部分由土壤储水补足。每 acre 每 inch 水的抽水成本约为 $8。";
  m = /^Yield potential is calibrated to real USDA NASS harvests for (rain-fed|irrigated) fields: recent average ÷ the share of potential the model says recent weather allowed \(kept within 60–115% of the state value\)\.$/.exec(value);
  if (m) return `潜在产量用${chinesePractice(m[1]!)}田块的真实 USDA NASS 收获量校准：近期平均值 ÷ 模型估算近期气象条件所允许达到的潜在产量比例（限制在州基准值的 60–115% 以内）。`;
  m = /^(.+) yield basis: (.+)\.$/.exec(value);
  if (m) {
    const basis = chineseYieldBasis(m[2]!);
    if (basis) return `${chineseCrop(m[1]!)}产量依据：${basis}。`;
  }
  m = /^Prices: USDA NASS prices received, average of the latest months — (.*)\. Other prices are defaults\.$/.exec(value);
  if (m) {
    const parts = m[1] ? m[1].split(/, (?=[^,]+ \$)/).map(part => /^(.+) (\$\d+\.\d+\/[^ ]+) \((state|national), (\d+) months to ([^)]+)\)$/.exec(part)) : [];
    if (parts.every(part => part !== null)) return `价格：USDA NASS 农户销售价格，最近月份的平均值 — ${parts.map(part => `${chineseCrop(part![1]!)} ${part![2]}（${part![3] === "state" ? "州级" : "全国"}，截至 ${part![5]} 的 ${part![4]} 个月）`).join("，")}。其他价格采用默认值。`;
  }
  return value;
}

function chineseYieldBasis(value: string): string | null {
  if (value === "county average (all fields)") return "县平均值（所有田块）";
  let m = /^USDA (county|.+ district) average for (rain-fed|irrigated) fields, (\d+) reports up to (\d{4})$/.exec(value);
  if (m) return `USDA ${chineseArea(m[1]!)}${chinesePractice(m[2]!)}田块平均值，截至 ${m[4]} 年的 ${m[3]} 份报告`;
  m = /^(county|.+ district) average for (\d+) recent years × (\d+)% \(how (rain-fed|irrigated) fields compared with all fields in (\d+) years of (county|.+ district) records\)$/.exec(value);
  if (m) return `${chineseArea(m[1]!)}最近 ${m[2]} 年平均值 × ${m[3]}%（依据 ${chineseArea(m[6]!)} ${m[5]} 年记录中${chinesePractice(m[4]!)}田块与所有田块的比值）`;
  m = /^(county|.+ district) average for (\d+) recent years \(all fields; USDA has no (rain-fed|irrigated) split here\)$/.exec(value);
  if (m) return `${chineseArea(m[1]!)}最近 ${m[2]} 年平均值（所有田块；USDA 此处无单独的${chinesePractice(m[3]!)}数据）`;
  return null;
}
