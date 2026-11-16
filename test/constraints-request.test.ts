import { expect, it } from 'vitest';
import { validatePlanRequest } from '../src/worker/routes/api';
import { planCacheKey } from '../src/worker/service';
import type { FarmerConstraints, PlanRequest } from '../src/shared/types';
const base: PlanRequest = { lat: 38.1095, lon: -100.706, priority: 'balanced', irrigated: false };
it('validates constraints strictly and retains their canonical form', () => {
 const request = validatePlanRequest({ ...base, constraints: { excludeCrops: ['corn', 'corn', 'alfalfa'], irrigationInches: 0 } });
 expect(request).toMatchObject({ constraints: { excludeCrops: ['alfalfa', 'corn'], irrigationInches: 0 } });
 for (const constraints of [null, [], { irrigationInches: -1 }, { irrigationInches: 31 }, { irrigationInches: '10' }, { maxCornYears: 1.5 }, { excludeCrops: ['rice'] }, { noSameCropBackToBack: 'true' }, { marketOutlets: ['online'] }, { unavailableEquipment: ['tractor'] }, { well: { gpm: 500 } }, { well: { gpm: 1, acres: 0, pumpingDays: 100, hoursPerDay: 24 } }, { unknown: true }]) {
  expect(typeof validatePlanRequest({ ...base, constraints })).toBe('string');
 }
});
it('separates every constraint in the cache, canonicalizes list order, preserves absent keys', () => {
 const key = planCacheKey(base);
 const variants: FarmerConstraints[] = [{ excludeCrops: ['corn'] }, { mustInclude: ['corn'] }, { maxCornYears: 0 }, { noSameCropBackToBack: true }, { unavailableEquipment: ['hay_equipment'] }, { marketOutlets: [] }, { irrigationInches: 0 }, { well: { gpm: 500, acres: 125, pumpingDays: 100, hoursPerDay: 20 } }];
 for (const constraints of variants) expect(planCacheKey({ ...base, constraints })).not.toBe(key);
 expect(new Set(variants.map(constraints => planCacheKey({ ...base, constraints }))).size).toBe(variants.length);
 expect(planCacheKey({ ...base, constraints: { excludeCrops: ['corn','alfalfa','corn'] } })).toBe(planCacheKey({ ...base, constraints: { excludeCrops: ['alfalfa','corn'] } }));
 expect(planCacheKey({ ...base, constraints: {} })).toBe(key);
});
