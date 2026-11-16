// Opt-in crops. Every numeric default not pinned below is an APPROXIMATE ASSUMPTION,
// not a measured Kansas value. See docs/CROPS.md and retained source transcriptions.
import type { CropDef } from "./crops";
import { EXTRA_CROP_OPERATIONS, type ExtraCropId } from "../shared/extraCrops";

const BUDGET_BASE = "https://agmanager.info/sites/default/files/wysiwyg/";
const budgetFiles: Partial<Record<ExtraCropId, string>> = {
 sunflower_confection: "Confectionary Sunflowers Cost-Return Budget (W-SF-F)_Western Kansas_Nov-20-2024.pdf",
 cotton: "Cotton Cost-Return Budget (W-CT-F)_Southwest KS_Nov-20-2024.pdf",
 corn_silage: "Corn Silage Cost-Return Budget in Northeast Kansas__Nov-20-2024.pdf",
 sorghum_silage: "Forage Sorghum Silage Cost-Return Budget in South Central KS__Nov-20-2024.pdf",
 sunflower: "Oil-Type Sunflowers Cost-Return Budget (W-SF-F)_Western KS _Nov-20-2024.pdf",
 other_hay: "Forage Sorghum Hay Cost-Return Budget (W-H-F)_Western Kansas_Nov-20-2024.pdf",
};
export interface ParameterSource {
 status: "sourced budget assumption" | "approximate assumption";
 sourceUrl: string | null;
 year: number | null;
 locator: string | null;
 note: string;
}
const approximate = (note: string): ParameterSource => ({ status: "approximate assumption", sourceUrl: null, year: null, locator: null, note });
export function extraCropParameterSource(id: ExtraCropId, parameter: keyof CropDef): ParameterSource {
 const file = budgetFiles[id];
 if (file && ["baseYield", "pricePerUnit", "costPerAcre", "nitrogen"].includes(parameter)) return {
  status: "sourced budget assumption", sourceUrl: BUDGET_BASE + encodeURIComponent(file), year: 2025,
  locator: parameter === "nitrogen" ? "Page 3, middle yield summary: Nitrogen lbs" : "Page 2, middle yield abstract: Product and Total direct expenses; nitrogen dollars page 3",
  note: parameter === "costPerAcre" ? "Direct expenses minus the source's nitrogen expense to avoid double-counting; model then yield-scales and adds its own N and pumping costs. Not the unmodified enterprise budget."
   : parameter === "baseYield" ? "Regional NON-IRRIGATED budget planning yield, not observed yield or water-unlimited potential; transfer to a model potential is approximate."
   : id === "sunflower" && parameter === "pricePerUnit" ? "Oil-type price $14.50/cwt divided by 100 lb/cwt; not a confection sunflower contract price."
   : "Dated budget assumption, not a current quote. Cotton revenue excludes the budget's cottonseed credit.",
 };
 return approximate("Uncalibrated prototype parameter; guidance links in docs/CROPS.md are context, not validation of this exact value.");
}
// Shared modelling placeholders, deliberately NOT attributed to FAO-56. In particular a
// single season-average Kc is not FAO's initial/mid/end stage coefficients.
const summer = {
 family: "grass" as const, legume: false, perennial: false,
 plantingWindow: { from: [5,20], to: [6,15] }, harvestWindow: { from: [8,20], to: [9,30] }, droughtTolerance: "high" as const,
 season: { from: [5,20], to: [9,15] }, waterNeedMm: 470, kc: 0.75,
 rootDepthMm: 1500, waterYieldThreshold: 0, heatWindow: { from: [6,15], to: [8,31] },
 heatThresholdC: 35, heatDamagePerDegreeDay: 0.003, gddNeedC: 0, frostFreeNeedDays: 100,
 wetSpringLimitMm: 0, minPh: 5.5, toleratesPoorDrainage: false,
 coversAfter: ["none", "cereal_rye"], fallSeeded: false,
} satisfies Partial<CropDef>;
export const ADDITIONAL_CROPS: Record<ExtraCropId, CropDef> = {
 sunflower_confection: {
  ...summer, id: "sunflower_confection", name: "Confection sunflower", family: "broadleaf",
  season: { from: [6,1], to: [9,30] }, waterNeedMm: 560, kc: 0.8, rootDepthMm: 2000, waterYieldThreshold: 0.05,
  baseYield: 1400, yieldUnit: "lb/acre", pricePerUnit: 0.21, costPerAcre: 223.42 - 23.30,
  nitrogen: { default: 43 }, nassCommodity: "SUNFLOWER", nassUnitFilter: "SUNFLOWER, NON-OIL TYPE - YIELD, MEASURED IN LB / ACRE",
 },
 cotton: {
  ...summer, plantingWindow: { from: [5,1], to: [6,5] }, harvestWindow: { from: [10,1], to: [11,15] }, id: "cotton", name: "Upland cotton", family: "broadleaf",
  season: { from: [5,15], to: [10,15] }, heatWindow: { from: [7,1], to: [8,31] },
  waterNeedMm: 800, kc: 0.8, waterYieldThreshold: 0.1, frostFreeNeedDays: 150,
  baseYield: 900, yieldUnit: "lb/acre", pricePerUnit: 0.66, costPerAcre: 503.11,
  nitrogen: { default: 73 }, coversAfter: ["none"],
  nassCommodity: "COTTON", nassUnitFilter: "COTTON, UPLAND - YIELD, MEASURED IN LB / ACRE",
 },
 corn_silage: {
  ...summer, plantingWindow: { from: [4,20], to: [5,20] }, droughtTolerance: "moderate", id: "corn_silage", name: "Corn silage",
  season: { from: [5,1], to: [9,15] }, heatWindow: { from: [6,1], to: [8,15] },
  waterNeedMm: 580, kc: 0.8, waterYieldThreshold: 0, heatThresholdC: 32,
  baseYield: 18, yieldUnit: "tons/acre", pricePerUnit: 35.75, costPerAcre: 468.7,
  nitrogen: { default: 157 }, nassCommodity: "CORN", nassUnitFilter: "CORN, SILAGE - YIELD, MEASURED IN TONS / ACRE",
 },
 sorghum_silage: {
  ...summer, id: "sorghum_silage", name: "Forage sorghum silage", waterNeedMm: 450,
  baseYield: 9.5, yieldUnit: "tons/acre", pricePerUnit: 29.82, costPerAcre: 209.81,
  nitrogen: { default: 85 }, nassCommodity: "SORGHUM", nassUnitFilter: "SORGHUM, SILAGE - YIELD, MEASURED IN TONS / ACRE",
 },
 sunflower: {
  ...summer, id: "sunflower", name: "Oilseed sunflower", family: "broadleaf",
  season: { from: [6,1], to: [9,30] }, waterNeedMm: 560, kc: 0.8,
  rootDepthMm: 2000, waterYieldThreshold: 0.05,
  baseYield: 1600, yieldUnit: "lb/acre", pricePerUnit: 0.145, costPerAcre: 195.97,
  nitrogen: { default: 50 }, nassCommodity: "SUNFLOWER", nassUnitFilter: "SUNFLOWER, OIL TYPE - YIELD, MEASURED IN LB / ACRE",
 },
 triticale: {
  ...summer, plantingWindow: { from: [9,1], to: [9,25] }, harvestWindow: { from: [5,15], to: [6,10] }, id: "triticale", name: "Triticale (forage hay)",
  season: { from: [3,1], to: [6,10] }, heatWindow: { from: [5,1], to: [6,10] },
  waterNeedMm: 330, kc: 0.75, frostFreeNeedDays: 0,
  winterKill: { thresholdC: -23, daysToFail: 12 },
  baseYield: 3, yieldUnit: "tons/acre", pricePerUnit: 100, costPerAcre: 200,
  nitrogen: { default: 80 }, coversAfter: ["none", "cereal_rye"], fallSeeded: true,
 },
 other_hay: {
  ...summer, id: "other_hay", name: "Annual forage hay (non-alfalfa)", waterNeedMm: 400,
  baseYield: 2, yieldUnit: "tons/acre", pricePerUnit: 81.79, costPerAcre: 201.04,
  nitrogen: { default: 36 },
  // The NASS other-hay aggregate includes perennial grasses: do NOT calibrate an
  // annual forage-sorghum prototype from that incompatible aggregate yield series.
 },
};
for (const id of Object.keys(ADDITIONAL_CROPS) as ExtraCropId[]) ADDITIONAL_CROPS[id].operations = EXTRA_CROP_OPERATIONS[id];
export const extraCropOperations = EXTRA_CROP_OPERATIONS;
