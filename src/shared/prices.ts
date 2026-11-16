import type { CropId } from "./types";

/** Farmer prices in $/bu, or $/US short ton for hay. Fallow has no saleable product. */
export type FarmerPrices = Partial<Record<CropId, number>>;
export interface PriceSensitivity {
  kind: "sensitivity-not-forecast";
  scenarioCount: number;
  source: string;
  /** All tied highest-net candidates count as best; these counts need not sum to N. */
  plans: { planId: string; bestCount: number; minNetPerAcre: number; maxNetPerAcre: number }[];
}
/** Bounded, sorted representation; adding crops requires adding them to this list. */
export const PRICE_CROPS: CropId[] = ["alfalfa", "corn", "oats", "sorghum", "soybean", "winter_wheat"];
export const MAX_FARMER_PRICE = 10000;
export function validatePrices(b: Record<string, unknown>): { prices?: FarmerPrices; priceScenarios?: boolean } | string {
  const out: { prices?: FarmerPrices; priceScenarios?: boolean } = {};
  if (b.priceScenarios !== undefined) {
    if (typeof b.priceScenarios !== "boolean") return "priceScenarios must be boolean";
    out.priceScenarios = b.priceScenarios;
  }
  if (b.prices !== undefined) {
    if (!b.prices || typeof b.prices !== "object" || Array.isArray(b.prices)) return "prices must be an object";
    const entries = Object.entries(b.prices);
    if (entries.length > PRICE_CROPS.length) return "Too many crop prices";
    const prices: FarmerPrices = {};
    for (const [crop, value] of entries) {
      if (!PRICE_CROPS.includes(crop as CropId)) return `Unsupported price crop: ${crop}`;
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > MAX_FARMER_PRICE) return "Prices must be finite numbers from 0 to 10000";
      prices[crop as CropId] = value;
    }
    if (entries.length) out.prices = prices;
  }
  return out;
}
export function pricesCacheToken(prices?: FarmerPrices): string {
  return PRICE_CROPS.filter(c => prices?.[c] !== undefined).map(c => `${c}=${prices![c]}`).join(",");
}
