// Real, low-rate API verification. No secrets, admin actions or recurring remote writes.
import {mkdir, writeFile} from 'node:fs/promises';
const base=process.env.VERIFY_BASE_URL ?? 'http://127.0.0.1:8792';
const output=process.env.VERIFY_OUTPUT ?? 'test-results/features-local.json';
const coords='lat=38.1095&lon=-100.706';
const tests=[
 ['health','GET','/api/health'],['healthz','GET','/healthz'],
 ...[['Iowa',42.0563,-93.495],['Illinois',40.048,-88.33],['Kansas',38.1095,-100.706],['Nebraska',40.73,-96.55]].map(([n,lat,lon])=>['field-'+n,'GET',`/api/field?lat=${lat}&lon=${lon}`]),
 ['research-status','GET','/api/research/status'],['research-corpus','GET','/api/research/corpus'],['scout-status','GET','/api/scout/status'],
 ['fieldwatch','GET','/api/fieldwatch/latest'],['fieldwatch-history','GET','/api/fieldwatch/runs?field=finney-ks&limit=2'],['agent-options','GET','/api/fieldwatch/agent/options'],['agent-runs','GET','/api/fieldwatch/agent/finney-ks/runs?limit=2'],['weekly-watch','GET','/api/fieldwatch/agent/finney-ks/watch'],
 ['imerg','GET','/api/imerg/comparison/finney-ks'],['smap','GET',`/api/smap?${coords}&year=2022`],['smap-catalog','GET','/api/smap/catalog'],['modis','GET',`/api/vegetation?${coords}&year=2025`],['groundwater','GET',`/api/groundwater?${coords}`],
 ['usdm-category','GET','/api/usdm/category?fips=20055&date=2022-06-28'],['usdm-timeline','GET','/api/usdm/timeline?fips=20055&start=2022-05-01&end=2022-09-30'],['usdm-replay','GET','/api/usdm/replay?fips=20055&years=2022'],
 ['crop-timing','GET',`/api/crop-timing?${coords}&year=2022&planting=2022-05-01`],['historical-scenarios','GET',`/api/historical-scenarios?${coords}`],['economics','GET','/api/economics-assumptions?state=KS'],['second-opinion','GET','/api/second-opinion?fips=20055'],
 ['refresh-status','GET','/api/refresh/status'],['live-status','GET','/api/live/status'],['live-events','GET','/api/live/events'],['auth-me','GET','/api/auth/me'],['admin-check','GET','/api/admin/check'],['admin-usage','GET','/api/admin/ai-usage'],['docs-list','GET','/api/docs'],['docs-detail','GET','/api/docs/verification-nonexistent'],
 ['docs-upload-gate','POST','/api/docs/upload?name=verification.txt',{}],['docs-url-gate','POST','/api/docs/from-url',{}],['docs-review-gate','POST','/api/docs/verification/review',{}],['refresh-gate','POST','/api/refresh/run',{}],['research-ingest-gate','POST','/api/research/ingest',{}],
 ['plan-validation','POST','/api/plan',{lat:38.1095,lon:-100.706,goals:['organic_matter','organic_matter']}],
 ['cached-plan','POST','/api/plan',{lat:38.1095,lon:-100.706,irrigated:true,priority:'balanced'}],
];
const report={timestamp:new Date().toISOString(),base,tests:[]};
for(const [name,method,path,body] of tests){
 const start=Date.now();let row={name,method,path};
 try{const r=await fetch(base+path,{method,headers:body?{'content-type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(120000)});const text=await r.text();let data;try{data=JSON.parse(text)}catch{data=text}row={...row,status:r.status,data};}
 catch(e){row.error=String(e)}
 row.elapsedMs=Date.now()-start;report.tests.push(row);console.log(name,row.status??row.error,typeof row.data==='object'?row.data.status??row.data.error??'JSON':'text');
 await mkdir(output.replace(/[/\\][^/\\]+$/,''),{recursive:true});await writeFile(output,JSON.stringify(report,null,2)+'\n');await new Promise(r=>setTimeout(r,200));
}
