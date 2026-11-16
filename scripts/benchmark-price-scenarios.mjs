// Standalone paired local benchmark, not Cloudflare billed CPU telemetry.
// PLAN_BASELINE_ROOT=<checkout of baseline src> PLAN_CAPTURE_DIR=<public captures> PLAN_BENCH_OUTPUT=<report.json> node scripts/benchmark-price-scenarios.mjs
import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";
import { dirname, resolve } from "node:path";
import { deepStrictEqual } from "node:assert";
if (!process.env.PLAN_BENCH_OUTPUT) throw new Error("PLAN_BENCH_OUTPUT must point to a scratch report file");
const scratch=resolve(dirname(process.env.PLAN_BENCH_OUTPUT),"price-profile-bundles");
mkdirSync(scratch,{recursive:true});
if(!process.env.PLAN_BASELINE_ROOT || !process.env.PLAN_CAPTURE_DIR) throw new Error("Baseline root and captures required");
const engines=[];
for(const [name,root] of [["before",process.env.PLAN_BASELINE_ROOT],["after",process.cwd()]]) {
 const out=`${scratch}/${name}.mjs`;
 await build({entryPoints:[resolve(root,"src/engine/plan.ts")],outfile:out,bundle:true,format:"esm",platform:"node",logLevel:"silent"});
 engines.push((await import(pathToFileURL(out).href)).buildPlan);
}
const histories={finney:["winter_wheat","corn","winter_wheat"],story:["corn","corn"],champaign:["soybean","corn"],lancaster:["corn","soybean"]};
const rows=[];
for(const farm of Object.keys(histories)) {
 const data=JSON.parse(readFileSync(`${process.env.PLAN_CAPTURE_DIR}/plan-input-${farm}.json`,"utf8"));
 for(const irrigated of [false,true]) for(const priority of ["balanced","profit","soil","risk"]) {
  const input={...data,now:new Date(data.now),request:{...data.request,recentCrops:histories[farm],irrigated,priority}};
  const scenarioInput={...input,request:{...input.request,priceScenarios:true}};
  const resultBefore=engines[0](input),resultAfter=engines[1](input),resultScenario=engines[1](scenarioInput);
  deepStrictEqual(resultAfter,resultBefore);
  deepStrictEqual(resultScenario.plans,resultAfter.plans);
  const samples={before:[],after:[],scenarios:[]};
  const jobs=[()=>engines[0](input),()=>engines[1](input),()=>engines[1](scenarioInput)];
  const names=["before","after","scenarios"];
  // Alternate order to distribute host activity/JIT/GC rather than running all baseline calls first.
  for(let i=0;i<12;i++) for(const j of (i%2 ? [2,1,0] : [0,1,2])) {
   const cpu=process.cpuUsage(),t=performance.now();jobs[j]();const dt=process.cpuUsage(cpu);
   samples[names[j]].push({wallMs:performance.now()-t,cpuMs:(dt.user+dt.system)/1000});
  }
  rows.push({farm,irrigated,priority,samples});
 }
}
const summary={};
for(const name of ["before","after","scenarios"]){const ss=rows.flatMap(r=>r.samples[name]);summary[name]={meanWallMs:ss.reduce((a,s)=>a+s.wallMs,0)/ss.length,meanProcessCpuMs:ss.reduce((a,s)=>a+s.cpuMs,0)/ss.length,builds:ss.length};}
const report={runtime:process.version,method:"32 farm × irrigation × priority combinations; 12 repetitions each, alternating baseline/default/scenarios order; standalone esbuild Node bundles. Process CPU includes GC/V8 threads and Windows quantization; not Worker CPU telemetry. Full default responses deeply equal for all 32 inputs.",summary,rows};
writeFileSync(process.env.PLAN_BENCH_OUTPUT??`${scratch}/report.json`,JSON.stringify(report,null,2)+"\n");
console.log(JSON.stringify({verifiedDefaultResponses:rows.length,summary},null,2));
