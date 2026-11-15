// State-level defaults: approximate yields and which crops have practical local markets.
// Approximate defaults, not sourced observations: no documented vintage/source for the numbers below.
// economics.ts provides per-crop region/unit/treatment annotations and explicitly null year/source fields.
// With a NASS key, county/district averages calibrate (not directly replace) these potential bounds.
// Reference, NOT substituted for state averages: Iowa State Ag Decision Maker A1-20, January 2026,
// https://extension.iastate.edu/agdm/crops/pdf/a1-20.pdf (fetched 2026-11-15), corn following soybeans
// middle budget yield 211 bu/ac (p3); herbicide-tolerant soybean following corn 61 bu/ac (p5).
// These are Iowa budget TREND yields, not state observations or water-unlimited potential. Never silently
// use them as irrigated Plains yields. See docs/economics-sources.md for scope and actual costs.
//
// The engine needs *water-unlimited* yield potential: what a crop yields when water is not short.
// Rain-fed yields are then computed from that potential and the water the field actually gets each
// year (see rotation.ts). State averages cannot be used directly in the dry Plains, because there they
// blend irrigated and rain-fed fields and would make rain-fed crops look far better than they are.

import type { CropId } from "../shared/types";

type Yields = Partial<Record<CropId, number>>;

/** Approximate recent state-average yields (bu/acre; alfalfa tons/acre), all practices combined. */
export const STATE_YIELDS: Record<string, Yields> = {
  IA: { corn: 200, soybean: 59, oats: 70, alfalfa: 3.6, winter_wheat: 70 },
  IL: { corn: 205, soybean: 63, winter_wheat: 80, alfalfa: 3.8, oats: 70 },
  IN: { corn: 190, soybean: 59, winter_wheat: 80, alfalfa: 3.8, oats: 65 },
  OH: { corn: 180, soybean: 56, winter_wheat: 80, alfalfa: 3.5, oats: 65 },
  MN: { corn: 185, soybean: 50, oats: 70, alfalfa: 3.5, winter_wheat: 60 },
  WI: { corn: 175, soybean: 53, oats: 65, alfalfa: 3.3, winter_wheat: 75 },
  MI: { corn: 175, soybean: 50, winter_wheat: 85, alfalfa: 3.3, oats: 65 },
  MO: { corn: 160, soybean: 50, winter_wheat: 65, sorghum: 110, alfalfa: 3.5 },
  KY: { corn: 175, soybean: 52, winter_wheat: 80, alfalfa: 3.5 },
  PA: { corn: 155, soybean: 50, winter_wheat: 70, alfalfa: 3.0, oats: 65 },
  NY: { corn: 150, soybean: 48, winter_wheat: 75, alfalfa: 2.8, oats: 65 },
};

/**
 * Dry-Plains states: approximate *irrigated* yields (USDA NASS irrigated-practice levels, rounded),
 * used as water-unlimited potential. Approximate planning values for an agronomist to review.
 */
export const PLAINS_POTENTIAL: Record<string, Yields> = {
  KS: { corn: 220, soybean: 62, winter_wheat: 62, sorghum: 125, alfalfa: 5.2, oats: 70 },
  NE: { corn: 225, soybean: 66, winter_wheat: 65, sorghum: 120, alfalfa: 5.0, oats: 75 },
  CO: { corn: 210, soybean: 55, winter_wheat: 62, sorghum: 100, alfalfa: 4.8 },
  OK: { corn: 195, soybean: 50, winter_wheat: 55, sorghum: 100, alfalfa: 5.0 },
  TX: { corn: 205, soybean: 50, winter_wheat: 55, sorghum: 105, alfalfa: 6.0 },
  SD: { corn: 195, soybean: 56, winter_wheat: 68, sorghum: 95, alfalfa: 4.2, oats: 78 },
  ND: { corn: 175, soybean: 45, winter_wheat: 65, alfalfa: 3.4, oats: 78 },
};

/** Demonstration conversion of average yield to model potential. Approximate default, not a sourced
 * crop/state-specific yield-gap estimate; multiplying by 1.2 is not an observed field measurement.
 */
export const AVERAGE_TO_POTENTIAL = 1.2;

export const DEFAULT_STATE = "IA";

/** Grain sorghum has thin local markets outside these states, so it is not offered elsewhere. */
const SORGHUM_STATES = new Set(["KS", "TX", "NE", "OK", "CO", "SD", "MO", "AR", "LA", "MS", "NM", "GA", "AL"]);

export function availableCrops(stateCode: string | undefined, all: CropId[]): { crops: CropId[]; notes: string[] } {
  const notes: string[] = [];
  let crops = all.filter((c) => c !== "fallow");
  if (!stateCode || !SORGHUM_STATES.has(stateCode)) {
    crops = crops.filter((c) => c !== "sorghum");
    notes.push("Grain sorghum is left out because local markets for it are limited in this state.");
  }
  return { crops, notes };
}

const scale = (y: Yields, f: number): Yields =>
  Object.fromEntries(Object.entries(y).map(([k, v]) => [k, Math.round((v as number) * f * 10) / 10])) as Yields;

/** Water-unlimited yield potential for a state (falls back to Iowa). */
export function statePotential(stateCode: string | undefined): Yields {
  const code = stateCode ?? "";
  if (PLAINS_POTENTIAL[code]) return PLAINS_POTENTIAL[code]!;
  return scale(STATE_YIELDS[code] ?? STATE_YIELDS[DEFAULT_STATE]!, AVERAGE_TO_POTENTIAL);
}

/** Convert observed average yields (e.g. USDA NASS county averages) to water-unlimited potential. */
export function averagesToPotential(avg: Yields): Yields {
  return scale(avg, AVERAGE_TO_POTENTIAL);
}

/** Fallow is only offered on rain-fed fields where it is a real practice: under ~25 in of rain a year. */
export const FALLOW_MAX_ANNUAL_RAIN_MM = 635;
