import { LEGUME_N_NOTE, type CropYearFertilizer, type FertilizerInputs, type Nutrient, type NutrientRec, type PlanFertilizer } from "../shared/fertilizer";
import { validateFertilizerInputs } from "../shared/fertilizer-inputs";
import type { PlanResponse, PlanYear, RotationPlan } from "../shared/types";

export const FERTILIZER_DISCLAIMER = "K-State MF2586 guideline rates for these inputs — not a prescription; confirm with a soil test and your agronomist";
/** Printed page numbers, not PDF indices (PDF index = printed page + 2). */
type Coefficients = readonly [number, number, number, number];
interface CropRule { p: Coefficients; k: Coefficients; removal: readonly [number, number]; pPage: string; kPage: string; nPage: string; ie?: number; nFactor?: number; cool?: boolean; sulfur?: number; alfalfa?: boolean; }
/** Extensible without changing the rotation/economics crop table. Units must match MF2586. */
export const FERTILIZER_CROPS: Readonly<Record<string, CropRule>> = {
  corn: { p: [50, .2, -2.5, -.01], k: [73, .21, -.565, -.0016], removal: [.33, .26], pPage: "9", kPage: "21", nPage: "5", ie: .88, sulfur: .2 },
  sorghum: { p: [50, .16, -2.5, -.008], k: [80, .17, -.616, -.0013], removal: [.4, .26], pPage: "11", kPage: "23", nPage: "5", ie: 1.2, sulfur: .2 },
  winter_wheat: { p: [46, .42, -2.3, -.021], k: [62, .24, -.48, -.0018], removal: [.5, .3], pPage: "10", kPage: "22", nPage: "6", ie: 1.45, cool: true, sulfur: .6 },
  oats: { p: [47, .25, -2.3, -.013], k: [62, .221, -.48, -.0017], removal: [.25, .2], pPage: "14", kPage: "26", nPage: "6", nFactor: 1.3, cool: true },
  soybean: { p: [56, .51, -2.8, -.0257], k: [60, .628, -.46, -.0048], removal: [.8, 1.4], pPage: "12", kPage: "24", nPage: "5–7 (no soybean N formula)", sulfur: .4 },
  sunflower: { p: [42, .01, -2.1, -.0005], k: [80, .008, -.622, -.00006], removal: [.015, .006], pPage: "13", kPage: "25", nPage: "6", nFactor: .075, sulfur: .005 },
  corn_silage: { p: [56, 1.12, -2.8, -.056], k: [74, 1.5, -.567, -.0115], removal: [3.2, 8.7], pPage: "15", kPage: "27", nPage: "7", nFactor: 10.67, sulfur: 1.33 },
  sorghum_silage: { p: [48, 1.19, -2.38, -.0594], k: [73, 1.8, -.56, -.0139], removal: [3.2, 8.7], pPage: "16", kPage: "28", nPage: "7", nFactor: 10.67, sulfur: 1.33 },
  alfalfa: { p: [73, 4.56, -2.92, -.18], k: [84, 5.24, -.56, -.035], removal: [12, 60], pPage: "19", kPage: "31", nPage: "19", alfalfa: true, sulfur: 6 },
};
export interface FertilizerContext {
  stateCode: string; lon: number; irrigated: boolean; organicMatterPct?: number; organicMatterSource: string;
  previousCrop?: string; previousCover?: string; coarseTexture?: boolean; soilPh?: number;
}
const nutrients: Nutrient[] = ["N", "P2O5", "K2O", "lime", "S", "Zn"];
const rate = (nutrient: Nutrient, lbPerAcre: number | null, basis: NutrientRec["basis"], page: string, inputsUsed: NutrientRec["inputsUsed"] = {}, notes: string[] = []): NutrientRec => ({ nutrient, lbPerAcre: lbPerAcre === null ? null : Math.round(Math.max(0, lbPerAcre) * 10) / 10, basis, inputsUsed, notes, source: { doc: "MF2586", page } });
const needed = (nutrient: Nutrient, page: string, note: string, inputs: NutrientRec["inputsUsed"] = {}) => rate(nutrient, null, "soil-test-needed", page, inputs, [note]);
const polynomial = (c: Coefficients, y: number, soil: number) => c[0] + c[1] * y + c[2] * soil + c[3] * y * soil;

/** Pure arithmetic only. Never feeds rankings, engine nitrogenNeed, or fertilizer costs. */
export function cropYearFertilizer(y: PlanYear, c: FertilizerContext, inputs: FertilizerInputs = {}): CropYearFertilizer {
  const r = FERTILIZER_CROPS[y.crop];
  const result = (recs: NutrientRec[]): CropYearFertilizer => ({ year: y.year, crop: y.crop, expectedYield: y.expectedYield, yieldUnit: y.yieldUnit, recs });
  if (c.stateCode !== "KS") return result(nutrients.map(n => needed(n, "1", "Kansas-specific guide withheld outside Kansas; use your state's extension guide.")));
  if (y.crop === "fallow") return result(nutrients.map(n => rate(n, 0, "not-needed", "2", {}, ["No crop: no fertilizer recommendation."])));
  if (!r) return result(nutrients.map(n => needed(n, "1–34", "MF2586 crop rule not implemented; do not substitute another crop's rate.")));
  const validInputs = validateFertilizerInputs(inputs as Record<string, unknown>);
  if (typeof validInputs === "string") return result(nutrients.map(n => needed(n, "1", validInputs)));
  const crop = String(y.crop);
  const expectedUnit = crop === "sunflower" ? "lb" : r.alfalfa || crop.endsWith("_silage") ? "tons" : "bu";
  if (!y.yieldUnit.startsWith(expectedUnit)) return result(nutrients.map(n => needed(n, "2", "Expected yield unit does not match the MF2586 crop rule; rate withheld.")));
  if (!Number.isFinite(y.expectedYield) || y.expectedYield < 0) return result(nutrients.map(n => needed(n, "2", "Valid expected yield needed.")));
  const ey = y.expectedYield;
  const om = c.organicMatterPct !== undefined && Number.isFinite(c.organicMatterPct) ? c.organicMatterPct : undefined;
  const profile = inputs.profileNitrateLbPerAcre ?? 30;
  const fe = inputs.nApplication === "injected-or-split" ? .65 : .55;
  // Coarse soil is conservatively treated as high loss risk, even in western Kansas.
  const se = c.coarseTexture || c.lon > -98 ? .7 : 1;
  const previousAdjustment = c.previousCrop === "fallow" && inputs.profileNitrateLbPerAcre === undefined ? -20 :
    r.cool ? c.previousCrop === "sorghum" || c.previousCrop === "sunflower" ? 30 : 0 : c.previousCrop === "soybean" ? -40 : 0;
  const nInputs: NutrientRec["inputsUsed"] = { expectedYield: ey, profileNitrateLbPerAcre: profile, profileNSource: inputs.profileNitrateLbPerAcre === undefined ? "MF2586 default; not sampled" : "farmer soil test (0–24 inches)", ...(r.ie === undefined ? { profileNitrateMultiplier: 1 } : { nApplication: inputs.nApplication ?? "broadcast-preplant", fertilizerEfficiency: fe, soilNitrateEfficiency: se }), previousCrop: c.previousCrop ?? "unknown", previousCropAdjustment: previousAdjustment, manureNLbPerAcre: inputs.manureNLbPerAcre ?? 0, organicMatterSource: c.organicMatterSource };
  const nNotes = ["Other N credits (irrigation water, grazing) and tillage adjustments are not supplied; assumed zero. Manure input means plant-available N for this crop, not total manure N."];
  if (om !== undefined) nInputs.organicMatterPct = om;
  if (c.previousCover && c.previousCover !== "none") nNotes.push("No cover-crop N credit: MF2586 does not quantify cereal rye, crimson clover or hairy vetch credits. Do not equate crimson clover with red/sweet clover.");
  if (!c.previousCrop) nNotes.push("Previous crop unknown; no previous-crop credit assumed.");
  let n: NutrientRec;
  if (r.alfalfa) n = rate("N", 0, "legume-not-needed", r.nPage, {}, [LEGUME_N_NOTE, "Established alfalfa assumed. New seedings have different recommendations (p20)."]);
  else if (y.crop === "soybean") n = rate("N", null, "legume-not-needed", r.nPage, {}, [LEGUME_N_NOTE]);
  else if (om === undefined) n = needed("N", r.nPage, "Organic matter soil test or SSURGO value needed; no organic matter value invented.", nInputs);
  else if (c.previousCrop === "alfalfa") n = needed("N", "3–4", "Previous alfalfa credit requires stand density and destruction tillage. Confirm those before calculating N.", nInputs);
  else {
    const ie = y.crop === "corn" && c.irrigated ? .84 : r.ie;
    const raw = (ie === undefined ? (r.nFactor ?? 0) * ey : ie / fe * ey) - (ie === undefined ? 1 : se) * profile - om * (r.cool ? 10 : 20) - (inputs.manureNLbPerAcre ?? 0) + previousAdjustment;
    const cap = crop === "corn" || crop === "corn_silage" ? c.irrigated ? 300 : 230 : Infinity;
    n = rate("N", Math.min(cap, Math.max(30, raw)), "formula", r.nPage, { ...nInputs, ...(ie === undefined ? { yieldFactor: r.nFactor ?? 0 } : { internalEfficiency: ie }), uncappedRate: raw }, [...nNotes, r.ie === undefined ? "Provisional 30 lb N/acre starter minimum: MF2586 says this may be appropriate for oats, sunflower and silage, not mandatory." : "30 lb N/acre minimum recommended for early crop growth and development."]);
  }
  const pk = (which: 0 | 1): NutrientRec => {
    const nutrient = which === 0 ? "P2O5" : "K2O";
    const lab = which === 0 ? inputs.mehlich3P : inputs.extractableK;
    const page = which === 0 ? r.pPage : r.kPage;
    const removal = ey * r.removal[which];
    const used: NutrientRec["inputsUsed"] = { expectedYield: ey, removalLbPerYieldUnit: r.removal[which], cropRemovalLbPerAcre: removal };
    if (lab === undefined) return needed(nutrient, `2, ${page}`, "Soil test needed. Crop removal is a nutrient export estimate, not a fertilizer application rate.", used);
    used[which === 0 ? "mehlich3P" : "extractableK"] = lab;
    const target = which === 0 ? r.alfalfa ? 25 : 20 : r.alfalfa ? 150 : 130;
    const upper = target + (which === 0 ? 10 : 30);
    const sufficiency = lab > target ? 0 : Math.max(15, polynomial(which === 0 ? r.p : r.k, ey, lab));
    const notes = ["Formula rate, rounded to 0.1 lb/acre; printed category tables use representative soil values and rounded rates, not exact interpolation."];
    if (lab > target && !r.alfalfa) notes.push(which === 0 ? "Only optional starter P suggested above critical soil test: up to 20 lb P2O5/acre at planting; not automatically added." : "Only optional NPK/NPKS starter suggested above critical K; no starter K amount inferred.");
    notes.push("Total broadcast + banded nutrients. Respect seed-contact limits; do not place soybean fertilizer in direct seed contact.");
    if (inputs.pkProgram !== "build-maintenance") return rate(nutrient, sufficiency, sufficiency === 0 ? "not-needed" : "sufficiency", page, used, notes);
    used.yearsToBuild = 4;
    used.targetSoilPpm = target;
    notes.push("Four-year build assumed; repeated soil sampling required. No future soil-test trajectory simulated.");
    const build = lab > upper ? 0 : removal + Math.max(0, target - lab) * (which === 0 ? 18 : 9) / 4;
    return rate(nutrient, Math.max(sufficiency, build), "build-maintenance", page, used, notes);
  };
  let lime: NutrientRec;
  if (c.lon > -98) lime = needed("lime", "8", "Regional lime target and incorporation depth needed; eastern Kansas targets are not inferred from county coordinates.");
  else if (c.soilPh === undefined || inputs.bufferPh === undefined) lime = needed("lime", "8", "Measured soil pH and Sikora buffer pH needed; USDA map pH is not a lime test.");
  else if (c.soilPh >= 5.8) lime = rate("lime", 0, "not-needed", "8", { soilPh: c.soilPh, targetPh: 6 });
  else {
    const depth = r.alfalfa ? 2 : 6;
    const b = inputs.bufferPh;
    lime = rate("lime", (14100 - 3540 * b + 224 * b * b) * depth, "formula", "8", { soilPh: c.soilPh, bufferPh: b, targetPh: 6, incorporationDepthInches: depth }, ["lb effective calcium carbonate (ECC)/acre, NOT product weight. Central/western Kansas target pH 6.0. Assumes 6-inch incorporation (2 inches for established alfalfa); no-till requires 2 inches, about one-third the 6-inch rate.", "If >10,000 lb ECC/acre: apply half, incorporate, wait 12–18 months and retest."]);
  }
  const s = r.sulfur === undefined || om === undefined ? needed("S", "34", "No calibrated sulfur rule for this crop or organic matter missing.") : rate("S", r.sulfur * ey - 2.5 * om - (inputs.sulfatePpm === undefined ? 25 : inputs.sulfatePpm * .3 * 24), "formula", "34", { expectedYield: ey, organicMatterPct: om, organicMatterSource: c.organicMatterSource, profileSulfurLbPerAcre: inputs.sulfatePpm === undefined ? 25 : inputs.sulfatePpm * .3 * 24, profileSulfurSource: inputs.sulfatePpm === undefined ? "MF2586 default 25 lb S/acre" : "farmer sulfate-S test, 0–24 inches; ppm × 0.3 × 24" }, ["Other sulfur credits assumed zero. Sulfate input must be sulfate-S (elemental S), not sulfate ion concentration."]);
  const zn = !["corn", "sorghum", "soybean"].includes(y.crop) ? rate("Zn", 0, "not-needed", "33") : inputs.zincDtpaPpm === undefined ? needed("Zn", "33", "DTPA zinc soil test needed.") : rate("Zn", inputs.zincDtpaPpm > 1 ? 0 : Math.max(1, 11.5 - 11.25 * inputs.zincDtpaPpm), "formula", "33", { zincDtpaPpm: inputs.zincDtpaPpm }, ["Broadcast rate to correct deficiency for several years. Alternative band starter 0.5–1 lb Zn/acre is not an additional application."]);
  return result([n, pk(0), pk(1), lime, s, zn]);
}

export function planFertilizer(plan: RotationPlan, response: PlanResponse, inputs: FertilizerInputs = response.request.soilTest ?? {}): PlanFertilizer {
  const test = response.request.soilTest;
  const history = response.request.recentCrops ?? response.cropHistory.years.filter(h => h.crop && h.year < (plan.years[0]?.year ?? Infinity)).sort((a, b) => a.year - b.year).map(h => h.crop!);
  return { planId: plan.id, years: plan.years.map((y, i) => cropYearFertilizer(y, {
    stateCode: response.location.county?.stateCode ?? "unknown", lon: response.location.lon,
    irrigated: (response.request.water ?? (response.request.irrigated ? "full" : "rain")) !== "rain",
    organicMatterPct: test?.organicMatterPct ?? response.soil.organicMatterPct,
    organicMatterSource: test?.organicMatterPct !== undefined ? "farmer soil test" : "USDA SSURGO (mapped estimate, not a lab result)",
    soilPh: test?.ph, coarseTexture: test?.texture ? ["sand", "sandy_loam"].includes(test.texture) : (response.soil.sandPct ?? 0) >= 70,
    previousCrop: i ? plan.years[i - 1]?.crop : history.at(-1), previousCover: i ? plan.years[i - 1]?.cover : undefined,
  }, inputs)), assumptions: ["Expected yield is the plan's expected yield for that crop-year, not a new yield prediction.", "Display only: no changes to rankings, scores, economics, or the engine's cost-model nitrogen.", "Initial measured P/K reused for each year; no invented future soil tests. Build-maintenance uses four years.", "Kansas-specific rates withheld outside Kansas. Lime implementation limited to central/western Kansas (longitude ≤ −98).", "Alfalfa is treated as an established stand. MF2586 has no numeric soybean N formula; soybean (legume) N is shown as not needed, with no rate."], disclaimer: FERTILIZER_DISCLAIMER };
}
/** Opt-in enrichment; no mutation of input, cached plans, or current practice. */
export function withFertilizer(response: PlanResponse): PlanResponse {
  return { ...response, plans: response.plans.map(p => ({ ...p, fertilizer: planFertilizer(p, response) })), currentPractice: response.currentPractice ? { ...response.currentPractice, fertilizer: planFertilizer(response.currentPractice, response) } : null };
}
