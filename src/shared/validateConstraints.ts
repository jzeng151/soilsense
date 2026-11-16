import type { CropId } from './types';
import { EQUIPMENT_GROUPS, MARKET_OUTLETS, normalizeConstraints, type FarmerConstraints } from './constraints';

/** Strict shape/bounds; conflicting but well-formed choices reach the engine's explicit infeasible result. */
export function validateConstraints(value: unknown, crops: readonly CropId[]): FarmerConstraints | string | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'constraints must be an object';
  const c = value as Record<string, unknown>;
  const allowed = ['excludeCrops', 'mustInclude', 'maxCornYears', 'noSameCropBackToBack', 'unavailableEquipment', 'marketOutlets', 'irrigationInches', 'well'];
  if (Object.keys(c).some(k => !allowed.includes(k))) return 'unknown constraints field';
  for (const [key, choices] of [['excludeCrops', crops], ['mustInclude', crops], ['unavailableEquipment', EQUIPMENT_GROUPS], ['marketOutlets', MARKET_OUTLETS]] as const) {
    const list = c[key];
    if (list === undefined) continue;
    if (!Array.isArray(list) || list.length > choices.length || list.some(v => !(choices as readonly unknown[]).includes(v))) return `${key} must list known values (at most ${choices.length})`;
  }
  if (c.mustInclude && new Set(c.mustInclude as CropId[]).size > 3) return 'mustInclude may require at most 3 crops';
  if (c.maxCornYears !== undefined && (typeof c.maxCornYears !== 'number' || !Number.isInteger(c.maxCornYears) || c.maxCornYears < 0 || c.maxCornYears > 3)) return 'maxCornYears must be an integer from 0 to 3';
  if (c.noSameCropBackToBack !== undefined && typeof c.noSameCropBackToBack !== 'boolean') return 'noSameCropBackToBack must be boolean';
  if (c.irrigationInches !== undefined && (typeof c.irrigationInches !== 'number' || !Number.isFinite(c.irrigationInches) || c.irrigationInches < 0 || c.irrigationInches > 30)) return 'irrigationInches must be a number from 0 to 30';
  if (c.well !== undefined) {
    if (!c.well || typeof c.well !== 'object' || Array.isArray(c.well)) return 'well requires gpm, acres, pumpingDays and hoursPerDay';
    const w = c.well as Record<string, unknown>;
    if (Object.keys(w).some(k => !['gpm','acres','pumpingDays','hoursPerDay'].includes(k))) return 'unknown well field';
    // Input guardrails, not agronomic recommendations. Acreage/time are explicit, never guessed.
    for (const [key, min, max] of [['gpm',0,100000], ['acres',0.01,1000000], ['pumpingDays',1,366], ['hoursPerDay',0.01,24]] as const) {
      const n = w[key];
      if (typeof n !== 'number' || !Number.isFinite(n) || n < min || n > max) return `well.${key} must be a number from ${min} to ${max}`;
    }
  }
  return normalizeConstraints(c as FarmerConstraints);
}
