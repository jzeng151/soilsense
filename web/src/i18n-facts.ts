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
