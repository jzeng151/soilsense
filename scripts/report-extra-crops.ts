// Replays pinned public-source Finney weather/soil/NASS inputs, never live price claims.
import { writeFileSync } from "node:fs";
import { buildPlan } from "../src/engine/plan";
import { finneyInputs } from "../test/helpers/finney";
import type { PlanRequest } from "../src/shared/types";
const cases: {name:string; extraCrops:boolean; water:"rain"|"full"; overrides?:Partial<PlanRequest>; note:string}[] = [
 {name:"default-rain",extraCrops:false,water:"rain",note:"Original crop pool"},
 {name:"expanded-rain",extraCrops:true,water:"rain",note:"Expanded bounded portfolio; no farmer override"},
 {name:"default-full",extraCrops:false,water:"full",note:"Original crop pool"},
 {name:"expanded-full",extraCrops:true,water:"full",note:"Expanded bounded portfolio; no farmer override"},
 {name:"cotton-required-full",extraCrops:true,water:"full",overrides:{constraints:{mustInclude:["cotton"]}},note:"Farmer requires cotton; source budget defaults with approximate climate response, not a source-validated recommendation."},
 {name:"forage-required-full",extraCrops:true,water:"full",overrides:{constraints:{mustInclude:["corn_silage"]},priceScenarios:true},note:"Farmer requires one corn-silage year. Default budget economics, not an invented live quote."},
 {name:"forage-price-scenario-full",extraCrops:true,water:"full",overrides:{prices:{corn_silage:65},priceScenarios:true},note:"Explicit HYPOTHETICAL farmer-price sensitivity: $65/fresh short ton, not a market observation. Public recorded Finney weather/soil remain unchanged."},
];
const rows=cases.map(c=>{
 const response=buildPlan({...finneyInputs,extraCrops:c.extraCrops,request:{...finneyInputs.request,water:c.water,irrigated:c.water==="full",...c.overrides}});
 return {...c,plans:response.plans,currentPractice:response.currentPractice,constraints:response.constraints,priceSensitivity:response.priceSensitivity};
});
writeFileSync(process.argv[2] ?? "test/fixtures/extra-crops-examples.json",JSON.stringify({fixture:"test/helpers/finney.ts; fixed real public captures, no new field measurements",cases:rows},null,2)+"\n");
console.log(JSON.stringify(rows.map(r=>({name:r.name,plans:r.plans.map(p=>({label:p.label,net:p.avgNetReturnPerAcre,score:p.scores.total})),fixed:r.priceSensitivity?.fixedPriceCrops})),null,2));
