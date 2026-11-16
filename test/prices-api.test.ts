import { expect, it } from "vitest";
import { validatePlanRequest } from "../src/worker/routes/api";
import { planCacheKey } from "../src/worker/service";
import type { PlanRequest } from "../src/shared/types";
const request: PlanRequest={lat:38.1095,lon:-100.706,irrigated:true,priority:"profit"};
const now=new Date("2026-11-15T22:00:00Z");
it("validates and preserves farmer prices and scenario flag at the API boundary",()=>{
 expect(validatePlanRequest({...request,prices:{corn:0,alfalfa:190},priceScenarios:true})).toMatchObject({prices:{corn:0,alfalfa:190},priceScenarios:true});
 expect(validatePlanRequest(request)).not.toHaveProperty("prices");
 expect(validatePlanRequest(request)).not.toHaveProperty("priceScenarios");
 for(const prices of [{corn:-1},{corn:"4"},{unknown:3},{fallow:0},[],null]) expect(typeof validatePlanRequest({...request,prices})).toBe("string");
 expect(typeof validatePlanRequest({...request,priceScenarios:1})).toBe("string");
});
it("keys all optional prices and scenarios, preserving absent keys and normalizing order",()=>{
 const key=(r:PlanRequest)=>planCacheKey(r,{},now);
 expect(key({...request,prices:{corn:4,soybean:10}})).toBe(key({...request,prices:{soybean:10,corn:4}}));
 expect(key({...request,prices:{corn:0}})).not.toBe(key(request));
 expect(key({...request,prices:{}})).toBe(key(request));
 expect(key({...request,priceScenarios:false})).not.toBe(key(request));
 expect(key({...request,priceScenarios:true})).not.toBe(key(request));
 expect(key({...request,prices:{corn:4}})).not.toBe(key({...request,prices:{corn:5}}));
 expect(key({...request,prices:{alfalfa:10000,corn:10000,oats:10000,sorghum:10000,soybean:10000,winter_wheat:10000}}).length).toBeLessThan(300);
});
