import demo from "../../../data/smap-finney.json";
import { SMAP_SOURCE, summarizeSmap, type SmapSample } from "../../engine/smap";
import type { Env } from "../env";
import { cached, DAY_SECONDS } from "../lib/cache";
import { fetchJson } from "../lib/http";
export const SMAP_KEY = "context/smap-v008-finney.json";
export interface SmapBundle {
 schema: 1; product: "SPL4SMGP"; version: "008";
 point: {lat:number;lon:number}; cell: {row:number;column:number;lat:number;lon:number};
 retrievedAt: string; qualityPolicy: string; granules: {id:string;url:string;sha256:string}[]; samples:SmapSample[];
}
export function validSmapBundle(v: unknown): v is SmapBundle {
 if (!v || typeof v !== "object") return false;
 const b = v as SmapBundle;
 return b.schema===1 && b.product==="SPL4SMGP" && b.version==="008" && !!b.point && Number.isFinite(b.point.lat) && Number.isFinite(b.point.lon) && !!b.cell && [b.cell.row,b.cell.column,b.cell.lat,b.cell.lon].every(Number.isFinite) && typeof b.retrievedAt==="string" && Number.isFinite(Date.parse(b.retrievedAt)) && typeof b.qualityPolicy==="string" && b.qualityPolicy.length>0 && Array.isArray(b.granules) && b.granules.length>0 && b.granules.every(g=>typeof g.id==="string" && /^https:\/\//.test(g.url) && /^[a-f0-9]{64}$/.test(g.sha256)) && Array.isArray(b.samples) && b.samples.length<=100000 && b.samples.every(s=>typeof s.time==="string" && Number.isFinite(Date.parse(s.time)) && [s.surface,s.rootzone].every(v=>v===null || typeof v==="number" && Number.isFinite(v) && v>=0 && v<=1) && ["accepted","excluded","unreviewed"].includes(s.quality));
}
export async function getSmap(env: Env, lat:number, lon:number, year:number, start="07-01", end="07-01") {
 const empty = summarizeSmap([],year,start,end,Array.from({length:11},(_,i)=>2015+i));
 const unavailable = (note:string) => ({status:"unavailable" as const,note,evidence:empty,bundle:null as SmapBundle|null});

 try {
  const {value:b} = await cached(env.DB,"smap:SPL4SMGP:008:parser1:finney",DAY_SECONDS,async()=>{
   const object=await env.EVIDENCE?.get(SMAP_KEY);
   if (object && object.size > 2_000_000) throw new Error("Subset exceeds bound");
   const json:unknown=object ? await object.json() : demo;
   if (!validSmapBundle(json)) throw new Error("Invalid subset provenance or data");
   return json;
  });
  if (Math.abs(b.point.lat-lat)>1e-6 || Math.abs(b.point.lon-lon)>1e-6) return unavailable("Published subset belongs to another requested point; no field coverage is inferred.");
  return {status:"available" as const,note:SMAP_SOURCE.meaning,bundle:b,evidence:summarizeSmap(b.samples,year,start,end,Array.from({length:11},(_,i)=>2015+i))};
 } catch { return unavailable("Reviewed SMAP subset unavailable or invalid. Anomalies remain missing."); }
}
/** Deployment diagnostic only: catalog discovery is NOT verified measurement retrieval. */
export async function discoverSmap(env:Env) {
 if (!env.EARTHDATA_TOKEN) return {status:"not-configured",collection:null};
 try {
  const {value} = await cached(env.DB,"smap:catalog:SPL4SMGP:008:v1",DAY_SECONDS,()=>fetchJson<{feed:{entry:{id:string;title:string}[]}}>("https://cmr.earthdata.nasa.gov/search/collections.json?short_name=SPL4SMGP&version=008&page_size=1",{service:"NASA Earthdata catalog",headers:{Authorization:`Bearer ${env.EARTHDATA_TOKEN}`},timeoutMs:10000,retries:0}));
  return {status:"catalog-only",collection:value.feed.entry[0]?.id??null};
 } catch { return {status:"unavailable",collection:null}; }
}
