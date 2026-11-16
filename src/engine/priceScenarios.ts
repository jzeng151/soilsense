import type { CropId, RotationPlan } from "../shared/types";
import { PRICE_SCENARIO_VERSION, type FarmerPrices, type PriceSensitivity } from "../shared/prices";
import history from "./price-history.json";

/** Paired marketing-year observations preserve cross-crop price relationships. No Cartesian extremes. */
export const HISTORICAL_PRICE_SCENARIOS: { year: number; prices: FarmerPrices }[] = Array.from({length:10}, (_,i) => {
  const year = 2016+i;
  const prices: FarmerPrices = {};
  for (const record of history.records) {
    const observation = record.observations.find(o => o.year === year);
    if (!observation) throw new Error(`Incomplete price history: ${record.crop} ${year}`);
    // Same 56 lb/bu conversion as the NASS price adapter; dollars/cwt × 0.56 = dollars/bu.
    const factor = record.crop === "sorghum" && observation.unit === "$ / CWT" ? 0.56 : 1;
    prices[record.crop as CropId] = observation.price * factor;
  }
  return {year, prices};
});

/** Only selected candidates (plus current practice) are rescored. The callback must not enumerate. */
export function analyzePriceSensitivity(
  plans: Pick<RotationPlan,"id"|"years">[],
  netAtPrices: (planId: string, prices: FarmerPrices) => number,
): PriceSensitivity {
  const rows = plans.map(p => ({planId:p.id,bestCount:0,minNetPerAcre:Infinity,maxNetPerAcre:-Infinity}));
  for (const scenario of HISTORICAL_PRICE_SCENARIOS) {
    const nets = plans.map(p => netAtPrices(p.id, scenario.prices));
    const best = Math.max(...nets);
    rows.forEach((row,i) => {
      const net = nets[i]!;
      if (!Number.isFinite(net)) throw new Error("Non-finite price-scenario net");
      if (Math.abs(net-best) < 1e-9) row.bestCount++;
      row.minNetPerAcre = Math.min(row.minNetPerAcre,net);
      row.maxNetPerAcre = Math.max(row.maxNetPerAcre,net);
    });
  }
  const covered = new Set(history.records.map(r => r.crop));
  const crops = [...new Set(plans.flatMap(p => p.years.map(y => y.crop)))].filter(c => c!=="fallow").sort();
  return {
    kind:"sensitivity-not-forecast",scenarioCount:HISTORICAL_PRICE_SCENARIOS.length,
    source:`USDA NASS Quick Stats; Kansas marketing-year prices received, 2016–2025; snapshot ${PRICE_SCENARIO_VERSION} (docs/PRICES.md)`,
    scenarioYears:HISTORICAL_PRICE_SCENARIOS.map(s=>s.year),
    varyingCrops:crops.filter(c=>covered.has(c)), fixedPriceCrops:crops.filter(c=>!covered.has(c)),
    plans:rows.map(r=>({...r,minNetPerAcre:Math.round(r.minNetPerAcre),maxNetPerAcre:Math.round(r.maxNetPerAcre)})),
  };
}
