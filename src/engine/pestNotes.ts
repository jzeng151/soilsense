import type { RotationPlan, WaterLevel } from "../shared/types";

export const ADVICE_VERSION = "pest-agronomist-v1";
export const ROOTWORM_SOURCE = {
  id: "kstate-corn-rootworm",
  url: "https://entomology.k-state.edu/extension/crop-protection/corn/cornrootworm.html",
  // Exact excerpts retrieved from K-State's Corn Rootworms page, not model-generated quotations.
  benefit: "However, these phenomena have not been reported in Kansas, and crop rotation still works well as part of an integrated management strategy.",
  volunteer: "Occasionally, rootworms cause problems when corn follows weedy soybeans, or soybeans infested with volunteer corn that persisted through July, as these situations can elicit adult beetles to lay eggs in the field in fall.",
  history: "Previous year counts of adult beetles can be used to estimate the likelihood of economic damage and the need for insecticide protection the following growing season.",
};

/** Qualitative advice ONLY. Never consumed by the scoring engine. Shared by cards and grounded facts. */
export function planAdvice(plan: RotationPlan, water: WaterLevel = "rain") {
  const includes_non_corn_year = plan.years.some((y) => y.crop !== "corn");
  const hasCorn = plan.years.some((y) => y.crop === "corn");
  const cornAfterNonCorn = plan.years.some((y, i) => i > 0 && y.crop === "corn" && plan.years[i - 1]!.crop !== "corn");
  const pestNotes = hasCorn && includes_non_corn_year ? [{
    pest: "corn rootworm", sourceIds: [ROOTWORM_SOURCE.id], sourceUrl: ROOTWORM_SOURCE.url,
    sequence: cornAfterNonCorn ? "Corn following a non-corn phase in this plan" : "A non-corn phase is included; a return to corn is not shown after it in this plan",
    potentialEffect: ROOTWORM_SOURCE.benefit,
    conditions: [ROOTWORM_SOURCE.volunteer, ROOTWORM_SOURCE.history,
      "K-State describes Kansas conditions; rotation resistance is reported in some upper Midwestern states. Confirm local species and field history. This is not protection against all corn pests, and no numerical benefit is scored."],
  }] : [];
  const checks = [
    "Confirm local planting, harvest and stress windows for each crop; these are model reference calendars, not observed field phenology.",
    "Replace approximate yield potentials, prices and input costs with local budgets; modeled yields and profit are not research-plot observations or field guarantees.",
    water === "limited" ? "Check the assumed allowance of about 10 inches per crop season against your annual allocation, well capacity and each phase; modeled pumping is not measured application."
      : water === "full" ? "Check whether well capacity and the legal annual allocation can actually meet the model's full-irrigation assumption."
      : "Check stored soil water and whether rain-only production is viable for these phases.",
    ...(hasCorn ? ["Review corn rootworm species, previous beetle counts, local field history and volunteer corn control with your agronomist."] : []),
    ...(plan.years.some((y) => y.crop === "winter_wheat") ? ["Confirm the winter-wheat sowing window after the preceding harvest and local winter survival."] : []),
    ...(plan.years.some((y) => y.crop === "alfalfa") ? ["Confirm alfalfa stand duration, soil pH, drainage and a hay market."] : []),
    ...(plan.years.some((y) => y.crop === "fallow") ? ["Review fallow weed control, residue retention and erosion risk; no crop does not mean observed bare soil."] : []),
    ...(plan.years.some((y) => y.cover !== "none") ? ["Review cover-crop termination timing, seed cost and stored-water use before the following crop."] : []),
  ];
  return { version: ADVICE_VERSION, includes_non_corn_year, pestNotes,
    undocumentedBenefit: pestNotes.length ? null : hasCorn ? "No documented non-corn rootworm break in this continuous-corn sequence; no universal pest benefit is claimed." : "No corn-rootworm benefit is assigned to this plan without corn; benefits for other pests are undocumented here.", checks };
}
