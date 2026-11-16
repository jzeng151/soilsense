import { nutrientStatusText, type CropYearFertilizer, type Nutrient, type NutrientRec, type PlanFertilizer } from "../shared/fertilizer";
import { FERTILIZER_CROPS } from "./fertilizer";

export const MF2586_URL = "https://bookstore.ksre.ksu.edu/pubs/soil-test-interpretations-and-fertilizer-recommendations_MF2586.pdf";
const MSU = "https://extension.msstate.edu/publications/useful-nutrient-management-planning-data";
const UMN = "https://extension.umn.edu/agriculture/crop-production/nutrient-management-for-minnesota-crops/understanding-phosphorus-fertilizers";
export const LIME_SOURCE = "https://bookstore.ksre.ksu.edu/download/liming-acid-soils_MF1065";
export const FERTILIZER_SUGGESTION = "Fertilizer guide for this rotation (K-State)";
export interface Product { id: string; name: string; grade: string; analysis: Partial<Record<Nutrient, number>>; sourceUrl: string; locator: string }
/** Percent by mass; named grades are examples, not a substitute for the purchased product label. */
export const FERTILIZER_PRODUCTS: Record<string, Product> = {
  anhydrous: { id: "anhydrous", name: "Anhydrous ammonia", grade: "82-0-0", analysis: { N: 82 }, sourceUrl: MSU, locator: "Table 2" },
  urea: { id: "urea", name: "Urea", grade: "46-0-0", analysis: { N: 46 }, sourceUrl: MSU, locator: "Table 2" },
  uan28: { id: "uan28", name: "UAN", grade: "28-0-0", analysis: { N: 28 }, sourceUrl: MSU, locator: "Table 2 (28–32%)" },
  uan32: { id: "uan32", name: "UAN", grade: "32-0-0", analysis: { N: 32 }, sourceUrl: MSU, locator: "Table 2 (28–32%)" },
  ammoniumSulfate: { id: "ammoniumSulfate", name: "Ammonium sulfate", grade: "21-0-0-24S", analysis: { N: 21, S: 24 }, sourceUrl: MSU, locator: "Table 2" },
  map: { id: "map", name: "MAP", grade: "11-52-0", analysis: { N: 11, P2O5: 52 }, sourceUrl: UMN, locator: "How commercial phosphate fertilizer is manufactured → Adding ammonia (text, not Table 1's different MAP grade)" },
  dap: { id: "dap", name: "DAP", grade: "18-46-0", analysis: { N: 18, P2O5: 46 }, sourceUrl: MSU, locator: "Table 2" },
  potash: { id: "potash", name: "Potash (potassium chloride)", grade: "0-0-60", analysis: { K2O: 60 }, sourceUrl: MSU, locator: "Table 2" },
};
export function productAmount(nutrientLb: number, analysisPercent: number): number {
  if (!Number.isFinite(nutrientLb) || nutrientLb < 0 || !Number.isFinite(analysisPercent) || analysisPercent <= 0 || analysisPercent > 100) throw new RangeError("Use nonnegative nutrient pounds and an analysis greater than 0 and at most 100%.");
  return nutrientLb / (analysisPercent / 100);
}
/** Lime recommendation is lb ECC, not lb of untested aglime. No default ECC is assumed. */
export const limeProductAmount = productAmount;
export interface ProductLine { product: Product; lbProductPerAcre: number; supplies: Partial<Record<Nutrient, number>> }
export interface ProductOption { id: string; lines: ProductLine[]; nCreditLbPerAcre: number; remainingNLbPerAcre: number | null; excessNLbPerAcre: number | null }
function target(y: CropYearFertilizer, nutrient: Nutrient): number | null {
  const r = y.recs.find(r => r.nutrient === nutrient && r.basis !== "removal" && r.basis !== "soil-test-needed");
  return r?.lbPerAcre !== null && r?.lbPerAcre !== undefined && Number.isFinite(r.lbPerAcre) && r.lbPerAcre >= 0 ? r.lbPerAcre : null;
}
/** Unranked illustrative alternatives. Never converts removal-only fallback into an application rate. */
export function fertilizerProductOptions(y: CropYearFertilizer): ProductOption[] {
  if (y.crop === "fallow") return [];
  const n = target(y, "N"), p = target(y, "P2O5"), k = target(y, "K2O"), s = target(y, "S");
  if (![n, p, k, s].some(v => v !== null && v > 0)) return [];
  const seen = new Set<string>();
  return ([["map", "anhydrous"], ["dap", "urea"], ["map", "uan32"]] as const).map(([pId, nId]) => {
    const lines: ProductLine[] = [];
    const add = (id: string, nutrient: Nutrient, need: number | null) => {
      if (need === null || need <= 0) return;
      const product = FERTILIZER_PRODUCTS[id]!;
      const lbProductPerAcre = productAmount(need, product.analysis[nutrient]!);
      const supplies = Object.fromEntries(Object.entries(product.analysis).map(([key, percent]) => [key, lbProductPerAcre * percent / 100]));
      lines.push({ product, lbProductPerAcre, supplies });
    };
    add(pId, "P2O5", p);
    add("ammoniumSulfate", "S", s);
    const nCreditLbPerAcre = lines.reduce((sum, l) => sum + (l.supplies.N ?? 0), 0);
    const remainingNLbPerAcre = n === null ? null : Math.max(0, n - nCreditLbPerAcre);
    add(nId, "N", remainingNLbPerAcre);
    add("potash", "K2O", k);
    return { id: `${pId}-${nId}`, lines, nCreditLbPerAcre, remainingNLbPerAcre, excessNLbPerAcre: n === null ? null : Math.max(0, nCreditLbPerAcre - n) };
  }).filter(option => {
    const key = JSON.stringify(option.lines.map(l => [l.product.id, l.lbProductPerAcre]));
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
export interface TimingNote { text: string; es: string; page: string; url: string }
export function fertilizerTiming(y: CropYearFertilizer): TimingNote[] {
  if (y.crop === "fallow") return [];
  const notes: TimingNote[] = [];
  if (["corn", "sorghum", "winter_wheat"].includes(y.crop)) notes.push({
    text: "MF2586 uses fertilizer recovery efficiency 0.65 for injected or split N versus 0.55 for broadcast, fall-applied pre-plant N. Product choice alone does not change this input.",
    es: "MF2586 usa una eficiencia de recuperación de N de 0.65 para aplicaciones inyectadas o divididas, frente a 0.55 para N al voleo en otoño antes de sembrar. El producto por sí solo no cambia este dato.", page: y.crop === "winter_wheat" ? "6" : "5", url: MF2586_URL,
  });
  const pPages: Record<string, string> = { corn: "9", winter_wheat: "10", sorghum: "11", sunflower: "13", oats: "14", corn_silage: "15" };
  if (pPages[y.crop]) notes.push({
    text: "These are total broadcast-plus-banded nutrient amounts, not in-furrow rates. Keep seed-contact N + K2O within crop- and equipment-specific safety guidance; these product amounts are not a seed-safety approval.",
    es: "Son cantidades totales de nutrientes al voleo y en bandas, no dosis dentro del surco. El N + K2O en contacto con la semilla debe respetar los límites del cultivo y del equipo; estas cantidades no autorizan el contacto con la semilla.", page: pPages[y.crop]!, url: MF2586_URL,
  });
  return notes;
}
export function fertilizerCalculation(y: CropYearFertilizer, r: NutrientRec): string | null {
  const rule = FERTILIZER_CROPS[y.crop];
  if (!rule) return null;
  const i = r.inputsUsed;
  if (r.nutrient === "N" && typeof i.uncappedRate === "number") {
    const yieldTerm = typeof i.internalEfficiency === "number" ? `(${i.internalEfficiency} / ${i.fertilizerEfficiency}) × ${y.expectedYield}` : `${i.yieldFactor} × ${y.expectedYield}`;
    const nitrateEfficiency = typeof i.internalEfficiency === "number" ? i.soilNitrateEfficiency : 1;
    return `Uncapped N = ${yieldTerm} − ${nitrateEfficiency} × ${i.profileNitrateLbPerAcre} − ${i.organicMatterPct} × ${rule.cool ? 10 : 20} − ${i.manureNLbPerAcre} + (${i.previousCropAdjustment}) = ${i.uncappedRate} lb/acre. Other credits/adjustments assumed zero; minimum/cap and qualification in source notes.`;
  }
  if ((r.nutrient === "P2O5" || r.nutrient === "K2O") && typeof i.cropRemovalLbPerAcre === "number") {
    const removal = `Crop removal = ${y.expectedYield} × ${i.removalLbPerYieldUnit} = ${i.cropRemovalLbPerAcre} lb/acre (not an application rate).`;
    const lab = r.nutrient === "P2O5" ? i.mehlich3P : i.extractableK;
    if (typeof lab !== "number") return removal;
    const c = r.nutrient === "P2O5" ? rule.p : rule.k;
    return `${removal} Sufficiency polynomial = ${c[0]} + (${c[1]} × ${y.expectedYield}) + (${c[2]} × ${lab}) + (${c[3]} × ${y.expectedYield} × ${lab}); crop minimum/critical-test rules in source notes.${r.basis === "build-maintenance" ? ` Build = removal + max(0, ${i.targetSoilPpm} − ${lab}) × ${r.nutrient === "P2O5" ? 18 : 9} / ${i.yearsToBuild}, subject to sufficiency floor and upper-test cutoff.` : ""}`;
  }
  if (r.nutrient === "S" && rule.sulfur !== undefined && typeof i.profileSulfurLbPerAcre === "number") return `S = max(0, ${rule.sulfur} × ${y.expectedYield} − 2.5 × ${i.organicMatterPct} − ${i.profileSulfurLbPerAcre} − 0 other sulfur credits), rounded to 0.1 lb/acre.`;
  return null;
}
export interface FertilizerFact { id: string; text: string; source: string; url: string }
export function fertilizerFacts(plan: PlanFertilizer): FertilizerFact[] {
  return plan.years.flatMap(y => [
    ...y.recs.map((r, i) => ({ id: `fertilizer-${plan.planId}-${y.year}-${r.nutrient}-${i}`, text: `${y.year} ${y.crop}; expected yield ${y.expectedYield} ${y.yieldUnit} from the plan. ${r.nutrient}: ${nutrientStatusText(r)}; basis=${r.basis}. Inputs=${JSON.stringify(r.inputsUsed)}. ${r.notes.join(" ")} ${fertilizerCalculation(y, r) ?? ""} ${plan.disclaimer}`, source: `K-State MF2586 p. ${r.source.page}`, url: MF2586_URL })),
    ...fertilizerProductOptions(y).flatMap((o, i) => o.lines.map((l, j) => ({ id: `fertilizer-${plan.planId}-${y.year}-products-${i}-${j}`, text: `${y.year} ${y.crop}; illustrative option ${i + 1}, not ranked: ${l.product.name} ${l.product.grade}: ${l.lbProductPerAcre.toFixed(1)} lb product/acre; supplies ${JSON.stringify(l.supplies)} lb nutrient/acre. Option N credit from phosphate/sulfate: ${o.nCreditLbPerAcre.toFixed(1)} lb/acre; remaining N target after credits: ${o.remainingNLbPerAcre?.toFixed(1) ?? "unknown"}; excess N: ${o.excessNLbPerAcre?.toFixed(1) ?? "unknown"}. Product lb = nutrient lb / mass fraction. No price or seed-placement claim. ${plan.disclaimer}`, source: `${l.product.name} ${l.product.grade} guaranteed-analysis example — ${l.product.locator}`, url: l.product.sourceUrl }))),
    ...fertilizerTiming(y).map((n, i) => ({ id: `fertilizer-${plan.planId}-${y.year}-timing-${i}`, text: n.text, source: `K-State MF2586 p. ${n.page}`, url: n.url })),
  ]);
}
