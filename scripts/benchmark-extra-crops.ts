import { performance } from "node:perf_hooks";
import { writeFileSync } from "node:fs";
import { buildPlan } from "../src/engine/plan";
import { finneyInputs } from "../test/helpers/finney";
const extraCrops=process.argv.includes("on");
const rows=[];
for(const irrigated of [false,true]) {
 const input={...finneyInputs, extraCrops, request:{...finneyInputs.request,irrigated,water:irrigated?"full" as const:"rain" as const}};
 for(let i=0;i<20;i++) buildPlan(input);
 const samples=[];let result;
 for(let b=0;b<10;b++) { const c=process.cpuUsage();const t=performance.now();for(let i=0;i<10;i++)result=buildPlan(input);const d=process.cpuUsage(c);samples.push({wallMs:(performance.now()-t)/10,cpuMs:(d.user+d.system)/10000}); }
 rows.push({irrigated,extraCrops,samples,plans:result!.plans});
}
writeFileSync(process.argv[2]!, JSON.stringify({node:process.version,warmup:20,repetitions:100,rows},null,2));
console.log(JSON.stringify(rows.map(r=>({irrigated:r.irrigated,extraCrops,wallMs:r.samples.reduce((a,b)=>a+b.wallMs,0)/10,cpuMs:r.samples.reduce((a,b)=>a+b.cpuMs,0)/10}))));
