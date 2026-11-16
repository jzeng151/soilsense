import { describe, expect, it } from "vitest";
import { buildPlan } from "../src/engine/plan";
import { finneyInputs } from "./helpers/finney";
import { validatePrices, pricesCacheToken } from "../src/shared/prices";
import type { PlanRequest } from "../src/shared/types";
describe("farmer prices", () => {
 it("override USDA prices and deterministically change profit recommendations", () => {
   const request = {...finneyInputs.request, irrigated:true, priority:"profit", prices:{corn:8,soybean:6}} as PlanRequest;
   const base = buildPlan({...finneyInputs,request:{...request,prices:undefined}});
   const changed = buildPlan({...finneyInputs,request});
   expect(changed.plans[0]!.label).not.toBe(base.plans[0]!.label);
   expect(changed.plans).toEqual(buildPlan({...finneyInputs,request}).plans);
   expect(changed.currentPractice!.avgNetReturnPerAcre).not.toBe(base.currentPractice!.avgNetReturnPerAcre);
 });
 it("accepts zero, rejects unknown crops, non-finite, negative, arrays and coercion", () => {
   expect(validatePrices({prices:{corn:0}})).toEqual({prices:{corn:0}});
   for(const prices of [{corn:-1},{corn:Infinity},{corn:NaN},{corn:"4"},{fallow:0},{x:3},[],null,{corn:10001}]) expect(typeof validatePrices({prices})).toBe("string");
   expect(typeof validatePrices({priceScenarios:"true"})).toBe("string");
   expect(pricesCacheToken({corn:4,soybean:10})).toBe(pricesCacheToken({soybean:10,corn:4}));
 });
});
