import { it, expect } from "vitest";
import { writeFileSync, readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { buildPlan } from "../src/engine/plan";
import { finneyInputs } from "./helpers/finney";
import { CROPS } from "../src/engine/crops";
import { EXTRA_CROP_IDS } from "../src/shared/extraCrops";
import { availableCrops } from "../src/engine/regions";
import { runEngine, buildWaterContext, evaluateCropClimate, feasibleSequence } from "../src/engine/rotation";
import { planCacheKey } from "../src/worker/service";
import { pricesFrom } from "../src/worker/data/nass";
import { validateMeasurements } from "../src/shared/measurements";
import { extraCropParameterSource } from "../src/engine/additionalCrops";
it("pins each budget value and explicitly leaves unsupported response coefficients unsourced", () => {
 const budgets = [
  ["cotton",900,0.66,535,31.89,73], ["corn_silage",18,35.75,537.30,68.60,157],
  ["sorghum_silage",9.5,29.82,247,37.19,85], ["sunflower",1600,0.145,223.26,27.29,50],
  ["other_hay",2,81.79,220.36,19.32,36], ["sunflower_confection",1400,0.21,223.42,23.30,43],
 ] as const;
 for (const [crop,yieldValue,price,direct,nCost,n] of budgets) {
  expect(CROPS[crop].baseYield).toBe(yieldValue); expect(CROPS[crop].pricePerUnit).toBe(price);
  expect(CROPS[crop].costPerAcre).toBeCloseTo(direct-nCost,8); expect(CROPS[crop].nitrogen.default).toBe(n);
  const record=JSON.parse(readFileSync(`docs/evidence/sw-kansas/${crop}-budget.json`,"utf8"));
  expect(record.planningYear).toBe(2025); expect(record.sha256).toMatch(/^[0-9a-f]{64}$/);
  expect(extraCropParameterSource(crop,"baseYield")).toMatchObject({year:2025,status:"sourced budget assumption"});
 }
 for (const crop of EXTRA_CROP_IDS) {
  expect(extraCropParameterSource(crop,"heatThresholdC")).toMatchObject({sourceUrl:null,year:null,status:"approximate assumption"});
  expect(CROPS[crop].operations).toBeDefined(); expect(CROPS[crop].plantingWindow).toBeDefined();
 }
 expect(extraCropParameterSource("triticale","baseYield").sourceUrl).toBeNull();
});
it("does not evade species rotation or winter sowing rules with a new harvest product", () => {
 expect(feasibleSequence(["corn_silage","soybean","corn"],["corn","corn"],true)).toBe(false);
 expect(feasibleSequence(["corn","soybean","corn"],["corn_silage","corn"],true)).toBe(false);
 expect(feasibleSequence(["sunflower","sorghum","fallow"],["sunflower_confection","corn","winter_wheat"],true)).toBe(false);
 expect(feasibleSequence(["winter_wheat","sunflower","sorghum"],["sunflower","corn","fallow"],true)).toBe(true);
 expect(feasibleSequence(["triticale","corn","soybean"],[],false)).toBe(false);
});
it("validates new harvest records in their real product units", () => {
 expect(validateMeasurements({yieldRecords:[{crop:"corn_silage",year:2025,value:23,unit:"tons/acre"}]},2026)).toMatchObject({yieldRecords:[{crop:"corn_silage",unit:"tons/acre"}]});
 expect(typeof validateMeasurements({yieldRecords:[{crop:"corn_silage",year:2025,value:23,unit:"bu/acre"}]},2026)).toBe("string");
 expect(validateMeasurements({yieldRecords:[{crop:"cotton",year:2025,value:1500,unit:"lb/acre"}]},2026)).toMatchObject({yieldRecords:[{unit:"lb/acre"}]});
});
it("keeps new NASS price series opt-in and preserves pounds instead of bushels", () => {
 const rows=["JAN","FEB","MAR"].map(reference_period_desc=>({year:2025,reference_period_desc,short_desc:"COTTON, UPLAND - PRICE RECEIVED, MEASURED IN $ / LB",Value:"0.60"}));
 expect(pricesFrom(rows,"state").cotton).toBeUndefined();
 expect(pricesFrom(rows,"state",true).cotton).toMatchObject({price:0.6,unit:"$/lb"});
});
it("separates experimental engine caches without changing the default key", () => {
 const date=new Date("2026-11-15T12:00:00Z");
 const base=planCacheKey(finneyInputs.request,{},date);
 expect(planCacheKey(finneyInputs.request,{extraCrops:false},date)).toBe(base);
 expect(planCacheKey(finneyInputs.request,{extraCrops:true},date)).not.toBe(base);
});
it("bounds opt-in specialty templates without replacing exhaustive legacy search", () => {
 const crops = availableCrops("KS", [...Object.keys(CROPS)] as (keyof typeof CROPS)[], { extraCrops: true, countyFips: "20055" }).crops;
 const result = runEngine({ crops, history: [], priority: "balanced", planStartYear: 2027, firstYearWheatAllowed: true,
  cropClimate: evaluateCropClimate(finneyInputs.climate,finneyInputs.soil,false,2028),water:buildWaterContext(finneyInputs.climate,finneyInputs.soil,false) });
 expect(result.evaluated).toBeLessThan(3000);
});
it("gates expanded regional markets on an explicit engine opt-in", () => {
 const off = availableCrops("KS", [...EXTRA_CROP_IDS], { countyFips: "20055" });
 expect(off.crops).toEqual([]);
 const on = availableCrops("KS", [...EXTRA_CROP_IDS], { extraCrops: true, countyFips: "20055" });
 expect(on.crops).toEqual(EXTRA_CROP_IDS);
 expect(availableCrops("IA", [...EXTRA_CROP_IDS], { extraCrops: true, countyFips: "19169" }).crops).toEqual([]);
});
it("defines acreage-supported crops without treating silage as grain", () => {
 for (const id of EXTRA_CROP_IDS) expect(CROPS).toHaveProperty(id);
 expect(CROPS.corn_silage.yieldUnit).toBe("tons/acre");
 expect(CROPS.sorghum_silage.yieldUnit).toBe("tons/acre");
 expect(CROPS.cotton.yieldUnit).toBe("lb/acre");
});
const scratch = "C:/Users/steve/AppData/Local/hermes/profiles/renshuu/cache/scratch";
it("preserves full fixed Finney responses", () => {
 for (const irrigated of [false, true]) {
  const input = { ...finneyInputs, request: { ...finneyInputs.request, irrigated, water: irrigated ? "full" as const : "rain" as const } };
  const result = buildPlan(input);
  const file = `test/fixtures/plan-finney-default-${irrigated ? "full" : "rain"}.json`;
  if (process.env.P3_CAPTURE === "1") writeFileSync(file, JSON.stringify(result, null, 2) + "\n");
  else expect(result).toEqual(JSON.parse(readFileSync(file,"utf8")));
 }
});
it.skipIf(!process.env.P3_BENCH)("profiles fixed Finney without cache", () => {
 const rows=[];
 for (const irrigated of [false,true]) for (const extraCrops of [false,true]) {
  const input={...finneyInputs,extraCrops,request:{...finneyInputs.request,irrigated, water:irrigated ? "full" as const : "rain" as const}};
  for(let i=0;i<3;i++) buildPlan(input);
  const samples=[];
  let result;
  for(let i=0;i<12;i++) {const cpu=process.cpuUsage();const t=performance.now();result=buildPlan(input); const d=process.cpuUsage(cpu);samples.push({wallMs:performance.now()-t,cpuMs:(d.user+d.system)/1000});}
  rows.push({irrigated,extraCrops,samples,plans:result!.plans});
 }
 writeFileSync(`${scratch}/p3-bench-${process.env.P3_BENCH}.json`,JSON.stringify(rows,null,2));
},120000);
