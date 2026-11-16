import {readFile,writeFile,mkdir,copyFile,readdir,unlink} from 'node:fs/promises';
const out='docs/verification';
await mkdir(out,{recursive:true});
const read=async path=>JSON.parse(await readFile(path,'utf8'));
const save=async(name,data)=>writeFile(`${out}/${name}`,JSON.stringify(data,null,2)+'\n');
const api={};
for(const target of ['local','deployed']){
 const report=await read(`test-results/features-${target}.json`);
 api[target]={timestamp:report.timestamp,base:report.base,tests:report.tests.map(t=>{
  const d=t.data??{};
  const details=Object.fromEntries(Object.entries(d).filter(([,v])=>v===null||['string','number','boolean'].includes(typeof v)));
  details.keys=Object.keys(d);
  for(const [k,v] of Object.entries(d))if(Array.isArray(v))details[`${k}Count`]=v.length;
  if(d.soil)details.soil={available:d.soil.available,source:d.soil.source};
  if(d.cropHistory)details.cropHistory={available:d.cropHistory.available,years:d.cropHistory.years?.length,note:d.cropHistory.note};
  if(d.plans)details.plans=d.plans.map(p=>({id:p.id,label:p.label,total:p.scores.total}));
  if(d.timing)details.timing={status:d.timing.status,planting:d.timing.planting,silking:d.timing.silking,maturity:d.timing.physiologicalMaturity};
  if(d.index)details.indexBound=d.index.bound;
  if(d.farms)details.farms=d.farms.map(f=>({farmId:f.farmId,state:f.state}));
  if(d.runs)details.runs=d.runs.map(r=>({runId:r.runId,fieldId:r.fieldId,status:r.status,trigger:r.trigger,completedAt:r.completedAt,kansas:r.metrics?.kansas,districtOutlook:r.districtOutlook??r.metrics?.districtOutlook}));
  if(d.settings)details.settings=d.settings;
  return {name:t.name,method:t.method,path:t.path,httpStatus:t.status,elapsedMs:t.elapsedMs,error:t.error,details};
 })};
}
await save('api-results.json',api);
const ui={};
for(const target of ['local','deployed'])ui[target]=await read(`test-results/ui-${target}/report.json`);
ui.zipLocal=await read('test-results/zip-local/report.json');
ui.zipDeployed=await read('test-results/zip-deployed/report.json');
await save('ui-results.json',ui);
for(const [source,dest] of [
 ['test-results/a11y-keyboard-final.json','keyboard.json'],
 ['test-results/local/report.json','e2e-local-initial.json'],['test-results/deployed/report.json','e2e-deployed-initial.json'],
 ['test-results/local-final/report.json','e2e-local.json'],['test-results/deployed-final/report.json','e2e-deployed.json'],
 ['test-results/scenarios-local.json','scenarios-local.json'],['test-results/manual-local.json','manual-local.json'],
 ['test-results/explanation-deployed/report.json','explanation-deployed.json'],['test-results/spanish-plan-deployed.json','spanish-plan-deployed.json'],
 ['test-results/deployed/sprout.png','sprout-deployed.png'],['test-results/ui-deployed/live-es.png','live-es-deployed.png'],
 ['test-results/ui-deployed/how-it-works-es.png','how-it-works-es-deployed.png'],
])await copyFile(source,`${out}/${dest}`);
const a=await read('test-results/a11y-final.json');
await save('a11y-summary.json',{timestamp:a.timestamp,base:a.base,revision:a.revision,browser:a.browser,axe:a.axe,tags:a.tags,scans:a.scans.map(s=>({state:s.state,language:s.language,width:s.width,fixture:s.fixture,overflow:s.inventory.horizontalOverflow,violations:s.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.length})),incomplete:s.incomplete.map(v=>({id:v.id,nodes:v.nodes.length}))}))});
const manifest={docs:[],routes:[],components:[]};
for(const f of await readdir('docs'))if(f.endsWith('.md'))manifest.docs.push(f);
for(const dir of ['src/worker/routes','src/worker/imerg'])for(const f of await readdir(dir))if(f.endsWith('.ts')){const path=`${dir}/${f}`;const lines=(await readFile(path,'utf8')).split(/\r?\n/);const declarations=lines.flatMap((line,i)=>/^\s*(?:api|admin|auth|docs|fieldWatch|live|refresh|research|scout|smap|usdm|voice|windScreen|cropTiming|historicalScenarios|groundwater|imerg)\.(?:get|post|put|delete|patch|route|on|use)\(/.test(line)?[{line:i+1,declaration:line.trim()}]:[]);if(declarations.length)manifest.routes.push({path,declarations});}
for(const f of await readdir('web/src/components'))if(f.endsWith('.tsx'))manifest.components.push(f);
await save('source-inventory.json',manifest);
const features=await read(`${out}/features.json`);
const counts=features.reduce((a,f)=>(a[f.status]=(a[f.status]??0)+1,a),{});
console.log(JSON.stringify({featureRows:features.length,counts,apiProbes:Object.fromEntries(Object.entries(api).map(([k,v])=>[k,v.tests.length])),uiCases:Object.fromEntries(Object.entries(ui).map(([k,v])=>[k,v.cases.length])),axeScans:a.scans.length},null,2));
