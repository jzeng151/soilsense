import { describe, expect, it } from 'vitest';
import { buildPlan } from '../src/engine/plan';
import { finneyInputs } from './helpers/finney';
import type { FarmerConstraints } from '../src/shared/constraints';
import { constraintWater } from '../src/shared/constraintWater';
import { cropConstraintIssues, sequenceConstraintIssues } from '../src/engine/constraints';
import { ALL_CROPS } from '../src/engine/crops';
const run = (constraints: unknown) => buildPlan({ ...finneyInputs, request: { ...finneyInputs.request, constraints } } as typeof finneyInputs);
describe('constraints during enumeration', () => {
 it.each<FarmerConstraints>([
  { mustInclude: ['corn'] }, { mustInclude: ['corn', 'sorghum'] },
  { maxCornYears: 0 }, { maxCornYears: 1 }, { noSameCropBackToBack: true },
  { unavailableEquipment: ['row_crop_planter'] }, { unavailableEquipment: ['grain_drill'] }, { unavailableEquipment: ['hay_equipment'] },
  { marketOutlets: ['grain_elevator'] }, { marketOutlets: ['feedlot_dairy'] },
  { excludeCrops: ['alfalfa'], mustInclude: ['corn'], maxCornYears: 1, noSameCropBackToBack: true, marketOutlets: ['grain_elevator'] },
 ])('returns only satisfying rotations for %j', constraints => {
  const result = run(constraints);
  expect(result.plans.length).toBeGreaterThan(0);
  expect(result.constraints?.status).toBe('satisfied');
  for (const plan of result.plans) expect(sequenceConstraintIssues(plan.years.map(y => y.crop), ['winter_wheat','corn','winter_wheat'], constraints)).toEqual([]);
 });
 it('checks no-repeat across the known-history boundary and within the plan', () => {
  expect(sequenceConstraintIssues(['corn','sorghum','oats'], ['corn'], { noSameCropBackToBack: true })).toContainEqual({ constraint: 'noSameCropBackToBack', crop: 'corn' });
  expect(sequenceConstraintIssues(['corn','oats','oats'], [], { noSameCropBackToBack: true })).toContainEqual({ constraint: 'noSameCropBackToBack', crop: 'oats' });
 });
 it.each<FarmerConstraints>([
  { excludeCrops: ALL_CROPS }, { mustInclude: ['corn'], excludeCrops: ['corn'] },
  { mustInclude: ['corn'], maxCornYears: 0 }, { mustInclude: ['alfalfa'], unavailableEquipment: ['hay_equipment'] },
  { mustInclude: ['corn'], marketOutlets: [] },
 ])('reports explicit infeasibility without relaxing %j and preserves current practice', constraints => {
  const result = run(constraints);
  expect(result.plans).toEqual([]);
  expect(result.constraints?.status).toBe('infeasible');
  expect(result.constraints?.message).toContain('No rotation satisfies these constraints');
  expect(result.constraints?.binding.length).toBeGreaterThan(0);
  if (constraints.mustInclude?.includes('corn')) expect(result.constraints?.bindingIssues).toContainEqual({ constraint: 'mustInclude', crop: 'corn' });
  expect(result.currentPractice).not.toBeNull();
  expect(result.constraints?.currentPracticeViolations.length).toBeGreaterThan(0);
 });
 it('returns specific equipment and market exclusion reasons', () => {
  const result = run({ unavailableEquipment: ['hay_equipment'], marketOutlets: ['grain_elevator'] });
  expect(result.constraints?.excludedCrops.find(c => c.crop === 'alfalfa')?.reasons).toEqual([
   { constraint: 'unavailableEquipment', crop: 'alfalfa', detail: 'hay_equipment' }, { constraint: 'marketOutlets', crop: 'alfalfa', detail: 'feedlot_dairy' },
  ]);
  expect(cropConstraintIssues('fallow', { marketOutlets: [], unavailableEquipment: ['grain_drill','hay_equipment','row_crop_planter','cotton_stripper'] })).toEqual([]);
 });
 it('converts capacity with explicit acreage and schedule, takes the smaller cap and cites K-State', () => {
  const water = constraintWater({ irrigationInches: 10, well: { gpm: 271.54, acres: 60, pumpingDays: 100, hoursPerDay: 1 } });
  expect(water?.wellCapInches).toBeCloseTo(1, 10);
  expect(water?.seasonalCapInches).toBeCloseTo(1, 10);
  expect(water?.formula).toContain('27,154');
  expect(water?.source).toContain('MF1040');
  const result = run({ irrigationInches: 3, well: { gpm: 500, acres: 125, pumpingDays: 100, hoursPerDay: 20 } });
  expect(result.constraints?.water?.seasonalCapInches).toBe(3);
  for (const plan of [...result.plans, result.currentPractice!]) for (const year of plan.years) expect(year.waterPumpedIn).toBeLessThanOrEqual(3);
 });
 it('finds a required crop missing from all of the old top three', () => {
  const original = buildPlan(finneyInputs);
  const missing = ALL_CROPS.find(crop => crop !== 'fallow' && original.plans.every(p => p.years.every(y => y.crop !== crop)));
  expect(missing).toBeDefined();
  const constrained = run({ mustInclude: [missing!] });
  expect(constrained.plans.length).toBeGreaterThan(0);
  for (const plan of constrained.plans) expect(plan.years.map(y => y.crop)).toContain(missing);
 });
 it('searches beyond the old top three to exclude a crop', () => {
  const original = buildPlan(finneyInputs);
  const crop = original.plans[0]!.years[0]!.crop;
  const result = run({ excludeCrops: [crop] });
  expect(result.plans.length).toBeGreaterThan(0);
  expect(result.plans.every(p => p.years.every(y => y.crop !== crop))).toBe(true);
 });
 it('applies an explicit zero seasonal cap even to full irrigation', () => {
  const input = { ...finneyInputs, request: { ...finneyInputs.request, water: 'full' as const, irrigated: true } };
  const full = buildPlan(input);
  const capped = buildPlan({ ...input, request: { ...input.request, constraints: { irrigationInches: 0 } } });
  expect(full.plans[0]!.waterPumpedIn).toBeGreaterThan(0);
  expect(capped.plans.every(p => p.waterPumpedIn === 0)).toBe(true);
  expect(capped.currentPractice?.waterPumpedIn).toBe(0);
  expect(capped.constraints?.water?.seasonalCapInches).toBe(0);
 });
});
