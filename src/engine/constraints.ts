import type { CropId } from '../shared/types';
import type { ConstraintIssue, CropRequirements, FarmerConstraints } from '../shared/constraints';
import { normalizeConstraints } from '../shared/constraints';

/** Planning assumptions for modeled products (corn/sorghum are grain, alfalfa is hay).
 * Not a claim that a crop has only one planting method or buyer. P3 can extend this lookup. */
export const CROP_REQUIREMENTS: Partial<Record<CropId, CropRequirements>> = {
  corn: { equipment: ['row_crop_planter'], markets: ['grain_elevator', 'feedlot_dairy'] },
  soybean: { equipment: ['row_crop_planter'], markets: ['grain_elevator', 'oilseed_buyer'] },
  winter_wheat: { equipment: ['grain_drill'], markets: ['grain_elevator'] },
  oats: { equipment: ['grain_drill'], markets: ['grain_elevator', 'feedlot_dairy'] },
  alfalfa: { equipment: ['grain_drill', 'hay_equipment'], markets: ['feedlot_dairy'] },
  sorghum: { equipment: ['row_crop_planter'], markets: ['grain_elevator', 'feedlot_dairy'] },
  fallow: { equipment: [], markets: [] },
};

export function cropConstraintIssues(crop: CropId, c: FarmerConstraints): ConstraintIssue[] {
  const issues: ConstraintIssue[] = [];
  if (c.excludeCrops?.includes(crop)) issues.push({ constraint: 'excludeCrops', crop });
  const requirements = CROP_REQUIREMENTS[crop];
  for (const equipment of requirements?.equipment ?? []) {
    if (c.unavailableEquipment?.includes(equipment)) issues.push({ constraint: 'unavailableEquipment', crop, detail: equipment });
  }
  if (c.marketOutlets !== undefined && requirements?.markets.length && !requirements.markets.some(m => c.marketOutlets!.includes(m)))
    issues.push({ constraint: 'marketOutlets', crop, detail: requirements.markets.join(' / ') });
  return issues;
}

export function sequenceConstraintIssues(seq: CropId[], history: CropId[], c: FarmerConstraints): ConstraintIssue[] {
  const issues = [...new Set(seq)].flatMap(crop => cropConstraintIssues(crop, c));
  for (const crop of c.mustInclude ?? []) if (!seq.includes(crop)) issues.push({ constraint: 'mustInclude', crop });
  if (c.maxCornYears !== undefined && seq.filter(crop => crop === 'corn').length > c.maxCornYears)
    issues.push({ constraint: 'maxCornYears', detail: String(c.maxCornYears) });
  if (c.noSameCropBackToBack) {
    for (let i = 0; i < seq.length; i++) if (seq[i] === (i ? seq[i - 1] : history[history.length - 1])) {
      issues.push({ constraint: 'noSameCropBackToBack', crop: seq[i] });
      break;
    }
  }
  return issues;
}

export { normalizeConstraints };
