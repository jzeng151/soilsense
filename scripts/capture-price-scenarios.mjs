// Rebuild a public USDA NASS snapshot. Credentials never enter saved URLs or output.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
const key = process.env.NASS_API_KEY ?? /^NASS_API_KEY=(.+)$/m.exec(readFileSync(".dev.vars", "utf8"))?.[1]?.trim().replace(/^['"]|['"]$/g, "");
if (!key) throw new Error("NASS_API_KEY required");
const specs = [
 ["corn","CORN","CORN, GRAIN - PRICE RECEIVED, MEASURED IN $ / BU"],
 ["soybean","SOYBEANS","SOYBEANS - PRICE RECEIVED, MEASURED IN $ / BU"],
 ["winter_wheat","WHEAT","WHEAT - PRICE RECEIVED, MEASURED IN $ / BU"],
 ["sorghum","SORGHUM","SORGHUM, GRAIN - PRICE RECEIVED, MEASURED IN $ / CWT"],
 ["oats","OATS","OATS - PRICE RECEIVED, MEASURED IN $ / BU"],
 ["alfalfa","HAY","HAY, ALFALFA - PRICE RECEIVED, MEASURED IN $ / TON"],
];
mkdirSync("docs/data/prices",{recursive:true});
const records=[];
for (const [crop,commodity,shortDesc] of specs) {
 const q = new URLSearchParams({source_desc:"SURVEY",sector_desc:"CROPS",group_desc:crop==="alfalfa"?"FIELD CROPS":"FIELD CROPS",commodity_desc:commodity,statisticcat_desc:"PRICE RECEIVED",agg_level_desc:"STATE",state_alpha:"KS",freq_desc:"ANNUAL",year__GE:"2016",year__LE:"2025",short_desc:shortDesc,domain_desc:"TOTAL",format:"JSON"});
 let data, bytes, level="KS";
 for(const national of [false,true]) {
  if(national){q.delete("state_alpha");q.set("agg_level_desc","NATIONAL");level="US";}
  const url = new URL("https://quickstats.nass.usda.gov/api/api_GET/");url.search=q.toString();url.searchParams.set("key",key);
  try { const res=await fetch(url,{signal:AbortSignal.timeout(45000)});bytes=await res.text(); data=JSON.parse(bytes);if(res.ok && data.data?.length)break; } catch { data=null; }
 }
 if(!data?.data?.length){ console.log(`${crop}: no annual data`);continue; }
 // Store actual returned bytes, not a hand-authored imitation. API response has no request key.
 if(bytes.includes(key)) throw new Error("Credential appeared in source response; refusing to save");
 const rawFile=`${crop}-${level.toLowerCase()}-2016-2025.json`;
 writeFileSync(`docs/data/prices/${rawFile}`,bytes);
 const rows=data.data.filter(r=>/^\d+(\.\d+)?$/.test(r.Value.replaceAll(",","")) && r.reference_period_desc==="MARKETING YEAR").map(r=>({year:Number(r.year),price:Number(r.Value.replaceAll(",","")),unit:r.unit_desc,period:r.reference_period_desc})).sort((a,b)=>a.year-b.year);
 records.push({crop,level,query:"https://quickstats.nass.usda.gov/api/api_GET/?"+q.toString(),rawFile,sha256:createHash("sha256").update(bytes).digest("hex"),observations:rows});
 console.log(`${crop}: ${level}, ${data.data.length} records, ${rows.length} marketing-year observations`);
}
writeFileSync("src/engine/price-history.json",JSON.stringify({id:"ks-2016-2025-v1",retrievedAt:new Date().toISOString(),attribution:"USDA National Agricultural Statistics Service, Quick Stats",note:"Marketing year annual prices received, Kansas where available, US fallback. Wheat is all wheat, used as a winter-wheat proxy. Nominal dollars; no inflation adjustment.",records},null,2)+"\n");
