// Local benchmark: first capture public data with PLAN_CAPTURE_DIR and plan-engine-capture.test.ts.
// PLAN_CAPTURE_DIR=<scratch> PLAN_BENCH_OUTPUT=<scratch/report.json> npx vitest run test/plan-engine-benchmark.test.ts
// Timings are synchronous local CPU/wall measurements, not Cloudflare CPU-time billing.
import { readFileSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { expect, it } from "vitest";
import { buildPlan, type PlanInputs } from "../src/engine/plan";
import type { CropId, Priority } from "../src/shared/types";
it.skipIf(!process.env.PLAN_CAPTURE_DIR)("profiles every demo farm × irrigation × priority without the response cache", () => {
  const rows = [];
  const histories: Record<string, CropId[]> = { finney: ["winter_wheat", "corn", "winter_wheat"], story: ["corn", "corn"], champaign: ["soybean", "corn"], lancaster: ["corn", "soybean"] };
  for (const farm of ["finney", "story", "champaign", "lancaster"]) {
    const data = JSON.parse(readFileSync(`${process.env.PLAN_CAPTURE_DIR}/plan-input-${farm}.json`, "utf8"));
    for (const irrigated of [false, true]) for (const priority of ["balanced", "profit", "soil", "risk"] as Priority[]) {
      const input: PlanInputs = { ...data, extraCrops: process.env.PLAN_EXTRA_CROPS === "on", now: new Date(data.now), request: { ...data.request, recentCrops: histories[farm], irrigated, priority } };
      const samples = [];
      let plan: ReturnType<typeof buildPlan> | undefined;
      for (let i = 0; i < 4; i++) {
        const cpu = process.cpuUsage();
        const t = performance.now();
        plan = buildPlan(input);
        const delta = process.cpuUsage(cpu);
        samples.push({ wallMs: performance.now() - t, cpuMs: (delta.user + delta.system) / 1000 });
      }
      rows.push({ farm, irrigated, priority, samples, plans: plan!.plans, currentPractice: plan!.currentPractice, waterOptions: plan!.waterOptions });
    }
  }
  if (process.env.PLAN_BENCH_OUTPUT) writeFileSync(process.env.PLAN_BENCH_OUTPUT, JSON.stringify(rows, null, 2));
  expect(rows).toHaveLength(32);
}, 120000);
