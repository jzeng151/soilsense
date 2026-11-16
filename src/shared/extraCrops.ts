import type { CropId } from "./types";
/** Product IDs must not evade species-level rotation constraints. */
export function cropSpecies(crop: CropId | undefined): CropId | undefined {
  return crop === "corn_silage" ? "corn" : crop === "sorghum_silage" || crop === "other_hay" ? "sorghum" : crop === "sunflower_confection" ? "sunflower" : crop;
}
/** Public harvest units. Silage uses fresh US short tons, hay dry US short tons. */
export function cropYieldUnit(crop: CropId): "bu/acre" | "tons/acre" | "lb/acre" {
  if (crop === "cotton" || crop === "sunflower" || crop === "sunflower_confection") return "lb/acre";
  if (["alfalfa", "corn_silage", "sorghum_silage", "triticale", "other_hay"].includes(crop)) return "tons/acre";
  return "bu/acre";
}
/** Decorative only: labels remain the accessible crop name in the chosen language. */
export const EXTRA_CROP_ICONS: Record<ExtraCropId, string> = { cotton: "☁️", corn_silage: "🌽", sorghum_silage: "🌾", sunflower: "🌻", triticale: "🌾", other_hay: "🌿", sunflower_confection: "🌻" };
/** P3 contract: opt-in crop expansion. No request flag: Worker env EXTRA_CROPS=on
 * becomes PlanInputs.extraCrops=true. Existing requests/defaults stay unchanged.
 * Acreage evidence: docs/evidence/sw-kansas/census-county-acres.json (2022, ASD 30).
 * Suppressed-only canola/proso and absent dry beans are not evidence of meaningful acreage.
 */
export const EXTRA_CROP_IDS = ["cotton", "corn_silage", "sorghum_silage", "sunflower", "triticale", "other_hay", "sunflower_confection"] as const;
export type ExtraCropId = (typeof EXTRA_CROP_IDS)[number];
export type { MarketOutlet, EquipmentGroup } from "./constraints";
import type { MarketOutlet, EquipmentGroup } from "./constraints";
/** Classification only, not a claim that a farmer has a buyer or this machinery. */
export const EXTRA_CROP_OPERATIONS: Record<ExtraCropId, { outlet: MarketOutlet; equipment: EquipmentGroup }> = {
  sunflower_confection: { outlet: "oilseed_buyer", equipment: "grain_combine" },
  cotton: { outlet: "cotton_gin", equipment: "cotton_stripper" },
  corn_silage: { outlet: "feedlot_dairy", equipment: "forage_harvester" },
  sorghum_silage: { outlet: "feedlot_dairy", equipment: "forage_harvester" },
  sunflower: { outlet: "oilseed_buyer", equipment: "grain_combine" },
  triticale: { outlet: "feedlot_dairy", equipment: "hay_equipment" },
  other_hay: { outlet: "feedlot_dairy", equipment: "hay_equipment" },
};
export const isExtraCrop = (id: string): id is ExtraCropId => (EXTRA_CROP_IDS as readonly string[]).includes(id);
