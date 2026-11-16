// Standalone Node harness; bundle with esbuild, then pass a directory of public planner captures.
// node bundle.mjs <capture-dir> <output.json>
import { readFileSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { buildPlan, type PlanInputs } from '../src/engine/plan';
import type { FarmerConstraints } from '../src/shared/constraints';
const dir = process.argv[2];
const output = process.argv[3];
if (!dir || !output) throw new Error('Pass capture directory and output JSON path');
const captured = JSON.parse(readFileSync(`${dir}/plan-input-finney.json`, 'utf8'));
const variants: { name: string; constraints?: FarmerConstraints }[] = [
 { name: 'unconstrained' }, { name: 'no-hay', constraints: { unavailableEquipment: ['hay_equipment'] } },
 { name: 'no-row-planter', constraints: { unavailableEquipment: ['row_crop_planter'] } },
 { name: 'must-corn-once', constraints: { mustInclude: ['corn'], maxCornYears: 1 } },
 { name: 'no-corn', constraints: { excludeCrops: ['corn'] } },
 { name: 'no-repeat-grain-market', constraints: { noSameCropBackToBack: true, marketOutlets: ['grain_elevator'] } },
 { name: '3-inch-cap', constraints: { irrigationInches: 3 } },
 { name: 'conflict', constraints: { mustInclude: ['corn'], excludeCrops: ['corn'] } },
];
const rows = [];
for (const variant of variants) {
 const input: PlanInputs = { ...captured, now: new Date(captured.now), request: { ...captured.request, water: 'limited', irrigated: true, priority: 'balanced', recentCrops: ['winter_wheat','corn','winter_wheat'], ...(variant.constraints ? { constraints: variant.constraints } : {}) } };
 for (let i = 0; i < 5; i++) buildPlan(input);
 const samples = [];
 let result: ReturnType<typeof buildPlan> | undefined;
 for (let i = 0; i < 20; i++) {
  const cpu = process.cpuUsage(); const start = performance.now();
  result = buildPlan(input);
  const delta = process.cpuUsage(cpu);
  samples.push({ wallMs: performance.now() - start, cpuMs: (delta.user + delta.system) / 1000 });
 }
 rows.push({ ...variant, samples, plans: result!.plans.map(p => ({ crops: p.years.map(y => y.crop), net: p.avgNetReturnPerAcre, pumpedIn: p.waterPumpedIn })), current: result!.currentPractice?.years.map(y => y.crop), report: result!.constraints });
}
writeFileSync(output, JSON.stringify({ runtime: process.version, platform: process.platform, repetitions: 20, warmups: 5, rows }, null, 2));
console.log(`Recorded ${rows.length} scenarios to ${output}`);
