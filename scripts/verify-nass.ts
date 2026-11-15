// Run: npx tsx scripts/verify-nass.ts. Reads local secrets; never outputs request URLs containing keys.
import { readFileSync, writeFileSync } from "node:fs";
import { getNassData } from "../src/worker/data/nass";
import { getNassSilking } from "../src/worker/data/nassProgress";
import { getTimingPower } from "../src/worker/data/timingPower";
import { estimateCornTiming } from "../src/engine/cropTiming";
import { parsePower } from "../src/engine/climate";
import { buildPlan } from "../src/engine/plan";
const vars = Object.fromEntries(readFileSync(".dev.vars","utf8").split(/\r?\n/).filter(l=> /^[A-Z_]+=/.test(l)).map(l=> { const i=l.indexOf("="); return [l.slice(0,i),l.slice(i+1).trim().replace(/^(["'])(.*)\1$/, "$2")]; }));
if (!vars.NASS_API_KEY) throw new Error("NASS_API_KEY missing; no live result produced");
const county = { countyFips: "20055", countyName: "Finney County", stateCode: "KS", stateName: "Kansas" };
const nass = await getNassData(undefined,vars.NASS_API_KEY,county,new Date().getUTCFullYear());
const estimates=[];
for (const year of [2023,2024,2025]) { const w = await getTimingPower(undefined,38.11,-100.71,year); estimates.push({year,silking:estimateCornTiming(w.days,`${year}-05-01`,`${year}-10-31`).silking,weatherSnapshot:w.snapshotId}); }
const comparison=await getNassSilking(undefined,vars.NASS_API_KEY,county,estimates);
const climate=parsePower(JSON.parse(readFileSync("test/fixtures/power-finney-county-ks.json","utf8")));
const soil={available:true,source:"USDA NRCS SSURGO (existing test scenario)",mapUnitName:"Richfield silt loam",drainageClass:"Well drained",ph:7.3,organicMatterPct:1.6,awc:0.21,profileDepthCm:200};
const scenarios=[];
for (const irrigated of [false,true]) {
 const inputs={request:{lat:38.11,lon:-100.71,irrigated,priority:"balanced" as const,recentCrops:["corn" as const,"corn" as const]},climate,soil,cropHistory:{available:false,source:"explicit scenario",years:[]},county,planStartYear:2027,now:new Date("2026-11-15T12:00:00Z")};
 const summary=(p:ReturnType<typeof buildPlan>)=>p.plans.map(r=>({label:r.label,net:r.avgNetReturnPerAcre,scores:r.scores}));
 scenarios.push({irrigated,defaults:summary(buildPlan(inputs)),nassPricesOnly:summary(buildPlan({...inputs,nass:nass ? {...nass,county:{},district:{}} : null})),nassYieldsAndPrices:summary(buildPlan({...inputs,nass}))});
}
const result={retrievedAt:new Date().toISOString(),interpretation:"Live getNassData path used by service.ts. Plan sensitivity holds existing Kansas fixture weather/soil and explicit corn/corn history fixed; not a deployed full-source field plan. No defaults or ranking logic modified.",nass,estimates,comparison,scenarios};
writeFileSync("docs/nass-live-verification.json",JSON.stringify(result,null,2));
console.log(JSON.stringify({errors:nass?.errors,prices:nass?.prices,comparison:comparison.status,seasons:comparison.seasons,scenarios},null,2));
if (nass?.errors.length || comparison.status!=="available") process.exitCode=1;
