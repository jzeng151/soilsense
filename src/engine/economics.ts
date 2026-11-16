// Sourced reference budgets are kept separate from the weather-driven ranking model.
// All transcribed values verified in official PDFs on 2026-11-15; see docs/economics-sources.md.
import type { CropId } from "../shared/types";
import { ALL_CROPS, LEGACY_CROPS, CROPS } from "./crops";
import { AVERAGE_TO_POTENTIAL, PLAINS_POTENTIAL, STATE_YIELDS, statePotential } from "./regions";

export interface EconomicValue {
  value: number; units: string; region: string; year: number | null; sourceUrl: string | null;
  status: "sourced budget assumption" | "approximate default"; treatment: string;
  published: string | null; retrievedAt: string | null; attribution: string | null; locator: string | null;
}
const KSU_BASE = "https://agmanager.info/sites/default/files/wysiwyg/";
const source = (crop: "corn" | "soybean") => KSU_BASE + (crop === "corn" ? "Corn" : "Soybean") + "%20Cost-Return%20Budget%20in%20Northeast%20Kansas__Nov-20-2024.pdf";
const budgetValue = (crop: "corn" | "soybean", value: number, units: string): EconomicValue => ({
  value, units, region: "Northeast Kansas", year: 2025, sourceUrl: source(crop), status: "sourced budget assumption",
  treatment: "Non-irrigated, middle planning yield, source enterprise budget; not measured yield or a crop-rotation trial",
  published: "2024-11-20", retrievedAt: "2026-11-15", attribution: "Kansas State University Department of Agricultural Economics: Gregg Ibendahl, Daniel O'Brien, Sarah Lancaster and Stewart Duncan",
  locator: "Middle yields, Budget abstract (page 2): Product / Total direct expenses",
});
export const KSU_2025 = {
  corn: { yield: budgetValue("corn", 145, "bu/acre"), price: budgetValue("corn", 4.21, "$/bu"), directCost: budgetValue("corn", 449.2, "$/acre") },
  soybean: { yield: budgetValue("soybean", 55, "bu/acre"), price: budgetValue("soybean", 9.67, "$/bu"), directCost: budgetValue("soybean", 272.28, "$/acre") },
};
export const REFERENCE = {
  year: 2025, label: "K-State Northeast Kansas 2025 non-irrigated middle-yield reference",
  geography: "Northeast Kansas only; not Finney County or a national/default field budget",
  resolution: "Regional enterprise planning assumptions; no field observations",
  costs: "Total direct expenses already include fertilizer (including nitrogen), labor, insurance, fuel, repairs, seed, chemicals and operating interest. Add none of those again. Excludes cash rent and capital recovery. No cover crop or rotation benefit is assumed.",
  limits: "Two separately published compatible enterprise budgets combined as a two-phase margin illustration, not a measured rotation trial. Prices are dated budget assumptions, not fresh AMS market quotes. Yield and price do not change with weather replay. Margin over direct expenses is not complete profit, a forecast, a guarantee or a planting recommendation.",
  budgets: KSU_2025,
};
interface Scenario {
  priceFactor?: number; yieldFactor?: number; costFactor?: number;
  prices?: Partial<Record<CropId, number | null>>;
}
export function referenceMargin(crops: CropId[], scenario: Scenario = {}) {
  const { priceFactor = 1, yieldFactor = 1, costFactor = 1 } = scenario;
  if (![priceFactor, yieldFactor, costFactor].every(v => Number.isFinite(v) && v >= 0)) throw new Error("Scenario factors must be finite nonnegative numbers");
  const phases = crops.map(crop => {
    const b = crop === "corn" || crop === "soybean" ? KSU_2025[crop] : null;
    const price = scenario.prices && Object.hasOwn(scenario.prices, crop) ? scenario.prices[crop] : b?.price.value;
    const known = b && typeof price === "number" && Number.isFinite(price) && price >= 0;
    const revenue = known ? b.yield.value * yieldFactor * price * priceFactor : null;
    const directCost = b ? b.directCost.value * costFactor : null;
    return { crop, revenue, directCost, margin: revenue !== null && directCost !== null ? revenue - directCost : null };
  });
  return { phases, mean: phases.length && phases.every(p => p.margin !== null) ? phases.reduce((s, p) => s + p.margin!, 0) / phases.length : null };
}
function approximate(value: number, units: string, region: string, treatment: string): EconomicValue {
  // A null source is deliberate: a broadly relevant extension homepage is NOT evidence for a number.
  return { value, units, region, treatment, status: "approximate default", year: null, sourceUrl: null, published: null, retrievedAt: null, attribution: null, locator: null };
}
export function assumptionAudit(state?: string, extraCrops = false) {
  const potential = statePotential(state);
  const known = Boolean(state && (PLAINS_POTENTIAL[state] || STATE_YIELDS[state]));
  const region = known ? state! : "IA (Iowa fallback)";
  const mode = state && PLAINS_POTENTIAL[state] ? "Approximate irrigated-practice potential" : `Approximate state average × ${AVERAGE_TO_POTENTIAL} (demonstration conversion, not observed potential)`;
  return {
    regionNote: known ? `${region}: ${mode}` : `No configured state table: Iowa fallback; ${mode}`,
    crops: (extraCrops ? ALL_CROPS : LEGACY_CROPS).map(crop => ({ crop, name: CROPS[crop].name,
      price: approximate(CROPS[crop].pricePerUnit, CROPS[crop].yieldUnit.startsWith("tons") ? "$/short ton" : CROPS[crop].yieldUnit.startsWith("lb") ? "$/lb" : crop === "fallow" ? "not applicable (no product)" : "$/bu", "US prototype (not regionalized)", "Unspecified practice; live NASS prices may override"),
      cost: approximate(CROPS[crop].costPerAcre, "$/acre", "US prototype (not regionalized)", "Base direct cost excluding nitrogen and land; yield-scaled in engine, not a complete budget"),
      baseYield: approximate(CROPS[crop].baseYield, CROPS[crop].yieldUnit || "not applicable (no crop)", "US prototype", "Unspecified planning yield; not a measured yield or a documented trial"),
      potential: approximate(potential[crop] ?? CROPS[crop].baseYield, CROPS[crop].yieldUnit || "not applicable (no crop)", region, potential[crop] === undefined ? "Crop-level fallback, not a regional estimate" : mode),
    })),
    adjustments: "Nitrogen, cover costs/credits, alfalfa establishment, irrigation pumping, rotation yield effects and cost scaling remain approximate defaults.",
    note: "These are fallback assumptions, NOT a claim that NASS overrides were used or that any sourced budget governs the ranked plans. See the plan's own assumptions for overrides. Regional averages and modelled potential are not field yields.",
    reference: REFERENCE,
  };
}
