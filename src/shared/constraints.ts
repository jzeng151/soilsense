import type { CropId } from './types';

export const EQUIPMENT_GROUPS = ['row_crop_planter', 'grain_drill', 'hay_equipment', 'cotton_stripper'] as const;
export type EquipmentGroup = typeof EQUIPMENT_GROUPS[number];
export const MARKET_OUTLETS = ['grain_elevator', 'feedlot_dairy', 'cotton_gin', 'oilseed_buyer'] as const;
export type MarketOutlet = typeof MARKET_OUTLETS[number];

/** Optional hard constraints. Omitted lists impose no restriction; marketOutlets: [] means no outlets. */
export interface FarmerConstraints {
  excludeCrops?: CropId[];
  /** Every listed crop must occur at least once within the three planned years. */
  mustInclude?: CropId[];
  maxCornYears?: number;
  /** Also checks the boundary with the most recent known crop. */
  noSameCropBackToBack?: boolean;
  unavailableEquipment?: EquipmentGroup[];
  marketOutlets?: MarketOutlet[];
  /** Gross seasonal pumped depth, 0–30 inches; applies to each planned year. */
  irrigationInches?: number;
  /** Capacity conversion requires irrigated area and explicit pumping days/hours; no hidden season assumption. */
  well?: { gpm: number; acres: number; pumpingDays: number; hoursPerDay: number };
}

/** Additive per-crop assumptions; outlet alternatives are OR, equipment requirements are AND. */
export interface CropRequirements {
  equipment: EquipmentGroup[];
  markets: MarketOutlet[];
}
export type ConstraintCode = 'excludeCrops' | 'mustInclude' | 'maxCornYears' | 'noSameCropBackToBack' | 'unavailableEquipment' | 'marketOutlets';
export interface ConstraintIssue { constraint: ConstraintCode; crop?: CropId; detail?: string }
export interface ConstraintReport {
  status: 'satisfied' | 'infeasible';
  /** Constraints rejecting otherwise agronomically feasible sequences, not a claimed minimal unsatisfiable set. */
  binding: ConstraintCode[];
  excludedCrops: { crop: CropId; reasons: ConstraintIssue[] }[];
  currentPracticeViolations: ConstraintIssue[];
  message?: string;
  water?: { seasonalCapInches: number; wellCapInches?: number; formula?: string; source?: string };
}

/** Stable, bounded canonical representation for cache identity. */
export function normalizeConstraints(c?: FarmerConstraints): FarmerConstraints | undefined {
  if (!c) return undefined;
  const result: FarmerConstraints = {};
  for (const key of ['excludeCrops', 'mustInclude', 'unavailableEquipment', 'marketOutlets'] as const) {
    const values = c[key];
    if (values && (values.length || key === 'marketOutlets')) (result as Record<string, unknown>)[key] = [...new Set(values)].sort();
  }
  if (c.maxCornYears !== undefined && c.maxCornYears !== 3) result.maxCornYears = c.maxCornYears;
  if (c.noSameCropBackToBack) result.noSameCropBackToBack = true;
  if (c.irrigationInches !== undefined) result.irrigationInches = c.irrigationInches;
  if (c.well) result.well = { gpm: c.well.gpm, acres: c.well.acres, pumpingDays: c.well.pumpingDays, hoursPerDay: c.well.hoursPerDay };
  return Object.keys(result).length ? result : undefined;
}
