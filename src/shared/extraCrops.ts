/** P3 contract: opt-in crop expansion. No request flag: Worker env EXTRA_CROPS=on
 * becomes PlanInputs.extraCrops=true. Existing requests/defaults stay unchanged.
 * Acreage evidence: docs/evidence/sw-kansas/census-county-acres.json (2022, ASD 30).
 * Suppressed-only canola/proso and absent dry beans are not evidence of meaningful acreage.
 */
export const EXTRA_CROP_IDS = ["cotton", "corn_silage", "sorghum_silage", "sunflower", "triticale", "other_hay"] as const;
export type ExtraCropId = (typeof EXTRA_CROP_IDS)[number];
export type MarketOutlet = "elevator" | "gin" | "feedlot_dairy" | "oilseed_buyer" | "hay_buyer";
export type EquipmentGroup = "grain_combine" | "cotton_harvester" | "forage_harvester" | "hay_equipment";
/** Classification only, not a claim that a farmer has a buyer or this machinery. */
export const EXTRA_CROP_OPERATIONS: Record<ExtraCropId, { outlet: MarketOutlet; equipment: EquipmentGroup }> = {
  cotton: { outlet: "gin", equipment: "cotton_harvester" },
  corn_silage: { outlet: "feedlot_dairy", equipment: "forage_harvester" },
  sorghum_silage: { outlet: "feedlot_dairy", equipment: "forage_harvester" },
  sunflower: { outlet: "oilseed_buyer", equipment: "grain_combine" },
  triticale: { outlet: "feedlot_dairy", equipment: "forage_harvester" },
  other_hay: { outlet: "hay_buyer", equipment: "hay_equipment" },
};
export const isExtraCrop = (id: string): id is ExtraCropId => (EXTRA_CROP_IDS as readonly string[]).includes(id);
