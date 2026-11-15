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
import { formatSigned, round } from "../shared/units";
import { CROPS } from "./crops";
import type { CropClimate } from "./rotation";
import { isSignificant } from "./stats";
import { LOSS_WORDS, lossShares } from "./validate";

const PRIORITY_WORDS: Record<Priority, { en: string; es: string }> = {
  profit: { en: "profit", es: "ganancia" },
  soil: { en: "soil health", es: "salud del suelo" },
  risk: { en: "lower risk", es: "menor riesgo" },
  balanced: { en: "a balance of profit, soil and risk", es: "un balance entre ganancia, suelo y riesgo" },
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

export function buildExplanation(args: {
  plans: RotationPlan[];
  currentPractice: RotationPlan | null;
  climate: ClimateSummary;
  facts: ReasonFact[];
  priority: Priority;
  placeName?: string;
  language?: "en" | "es";
}): { summary: string; speech: string; sms: string } {
  const { plans, climate, facts, priority, currentPractice } = args;
  const top = plans[0];
  if (!top) return args.language === "es"
    ? { summary: "No se encontró una rotación viable.", speech: "No pude preparar un plan para esta ubicación.", sms: "SoilSense: no hay un plan disponible." }
    : { summary: "No feasible rotation found.", speech: "Sorry, I could not build a plan for this location.", sms: "SoilSense: no plan available." };

  const sigTrends = climate.indicators.filter((i) => isSignificant(i.trend));
  const keyTrend = sigTrends.find((i) => ["hot_days", "gs_rain", "spring_rain", "dry_spell"].includes(i.id)) ?? sigTrends[0];
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
