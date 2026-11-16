import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { buildPlan } from "../src/engine/plan";
import { analyzePriceSensitivity, HISTORICAL_PRICE_SCENARIOS } from "../src/engine/priceScenarios";
import history from "../src/engine/price-history.json";
import examples from "./fixtures/price-finney-examples.json";
import { finneyInputs } from "./helpers/finney";

describe("historical price sensitivity", () => {
 it("reproduces fixed Finney profit examples and scenario win counts", () => {
   const request = {...finneyInputs.request,irrigated:true,priority:"profit" as const,priceScenarios:true};
   const base = buildPlan({...finneyInputs,request});
   const changed = buildPlan({...finneyInputs,request:{...request,prices:{corn:8,soybean:6}}});
   expect(base.priceSensitivity).toEqual(examples.default.sensitivity);
   expect(changed.priceSensitivity).toEqual(examples.farmerPrices.sensitivity);
   expect(base.plans[0]!.avgNetReturnPerAcre).toBe(194);
   expect(changed.plans[0]!.avgNetReturnPerAcre).toBe(559);
 });
 it("is ten complete paired years of live-retrieved, source-hashed NASS data", () => {
   expect(HISTORICAL_PRICE_SCENARIOS.map(s=>s.year)).toEqual([2016,2017,2018,2019,2020,2021,2022,2023,2024,2025]);
   for (const r of history.records) {
     const raw = readFileSync(new URL(`../docs/data/prices/${r.rawFile}`,import.meta.url));
     expect(createHash("sha256").update(raw).digest("hex")).toBe(r.sha256);
     const actual = JSON.parse(raw.toString()).data;
     expect(r.observations).toHaveLength(10);
     for(const o of r.observations) {
       const record = actual.find((a:{year:string}) => Number(a.year)===o.year);
       expect(Number(record.Value.replaceAll(",",""))).toBe(o.price);
       expect(record.unit_desc).toBe(o.unit);
       expect(record.state_alpha).toBe("KS");
     }
   }
   expect(HISTORICAL_PRICE_SCENARIOS[0]!.prices.corn).toBe(3.2);
   expect(HISTORICAL_PRICE_SCENARIOS[0]!.prices.sorghum).toBeCloseTo(2.6152,6);
 });
 it("counts all tied winners, calls only the selected-candidate callback, and reproduces counts", () => {
   const candidates=[{id:"a",years:[]},{id:"b",years:[]}];
   const score=vi.fn(()=>100);
   const sensitivity=analyzePriceSensitivity(candidates,score);
   expect(score).toHaveBeenCalledTimes(20);
   expect(sensitivity.plans).toEqual([
     {planId:"a",bestCount:10,minNetPerAcre:100,maxNetPerAcre:100},
     {planId:"b",bestCount:10,minNetPerAcre:100,maxNetPerAcre:100},
   ]);
 });
 it("keeps recommendations identical and compares current practice using exact engine economics", () => {
   const base=buildPlan(finneyInputs);
   const response=buildPlan({...finneyInputs,request:{...finneyInputs.request,priceScenarios:true}});
   expect(response.plans).toEqual(base.plans);
   expect(response.currentPractice).toEqual(base.currentPractice);
   expect(response.priceSensitivity!.scenarioCount).toBe(10);
   expect(response.priceSensitivity!.plans).toHaveLength(4);
   expect(response.priceSensitivity).toEqual(buildPlan({...finneyInputs,request:{...finneyInputs.request,priceScenarios:true}}).priceSensitivity);
   const nets=HISTORICAL_PRICE_SCENARIOS.map(s=>buildPlan({...finneyInputs,request:{...finneyInputs.request,prices:s.prices}}).currentPractice!.avgNetReturnPerAcre);
   const current=response.priceSensitivity!.plans.find(p=>p.planId==="current")!;
   expect(current.minNetPerAcre).toBe(Math.min(...nets));
   expect(current.maxNetPerAcre).toBe(Math.max(...nets));
   expect(response.priceSensitivity!.fixedPriceCrops).toEqual([]);
 });
});
