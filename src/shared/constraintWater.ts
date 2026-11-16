import type { FarmerConstraints, ConstraintReport } from './constraints';

export const GALLONS_PER_ACRE_INCH = 27154;
export const WELL_CONVERSION_SOURCE = 'https://bookstore.ksre.ksu.edu/download/useful-conversions-and-formulas_MF1040';
/** Gross delivered depth; no efficiency assumption. Same convention as existing model's allowance. */
export function constraintWater(c?: FarmerConstraints): ConstraintReport['water'] {
  if (c?.irrigationInches === undefined && !c?.well) return undefined;
  const w = c.well;
  const wellCapInches = w ? w.gpm * 60 * w.hoursPerDay * w.pumpingDays / (GALLONS_PER_ACRE_INCH * w.acres) : undefined;
  return {
    seasonalCapInches: Math.min(c.irrigationInches ?? Infinity, wellCapInches ?? Infinity),
    ...(wellCapInches !== undefined ? { wellCapInches, source: WELL_CONVERSION_SOURCE,
      formula: `${w!.gpm} × 60 × ${w!.hoursPerDay} × ${w!.pumpingDays} ÷ (27,154 × ${w!.acres}) = ${wellCapInches.toFixed(2)}` } : {}),
  };
}
