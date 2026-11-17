import { cached,DAY_SECONDS } from "../lib/cache";
import { crosscheckJson, crosscheckText } from "./crosscheckHttp";
import type { WeatherEstimate } from "../../engine/weatherCrosscheck";
export function prismStability(end:string,now=new Date()){const cutoff=new Date(now);cutoff.setUTCMonth(cutoff.getUTCMonth()-6);return end<cutoff.toISOString().slice(0,10)?"stable (>6 calendar months old), not immutable/final":"provisional/revisable (within six months)";}
const RPC="https://prism.oregonstate.edu/explorer/dataexplorer/rpc.php";
interface Rpc {errors:unknown;result?:{csv?:string;data?:unknown}}
export function parsePrismCsv(csv:string,normals=false){
 const dataset=csv.match(/^Dataset: (.+)$/m)?.[1]?.trim();
 if(dataset!==(normals?"Norm91m":"AN91d") || !csv.includes("Spatial resolution: 4km") || !csv.includes("Grid Cell Interpolation: Off") || !csv.includes("1200 UTC") || !csv.includes("Date,ppt (mm),tmin (degrees C),tmax (degrees C)")) throw new Error("Unverified PRISM metadata/schema");
 const clean=(v:string|undefined)=>v!==undefined && v.trim()!=="" && Number.isFinite(Number(v)) && Number(v)>-999 ? Number(v):null;
 const rows:WeatherEstimate[]=csv.split(/\r?\n/).filter(l=>normals?/^(January|February|March|April|May|June|July|August|September|October|November|December),/.test(l):/^\d{4}-\d{2}-\d{2},/.test(l)).map(l=>{const [date,p,n,x]=l.split(",");return {date:date!,rain:clean(p)!==null && Number(p)>=0?clean(p):null,tmin:clean(n),tmax:clean(x)};});
 if(!rows.length)throw new Error("No PRISM rows");
 return {dataset,rows};
}
export async function getPrism(db:D1Database|undefined,lat:number,lon:number,start:string,end:string,normals=false){
 const params=new URLSearchParams({call:`pp/${normals?"monthly_normals":"daily"}_timeseries`,proc:"gridserv",spares:"4km",interp:"0",stats:"ppt tmin tmax",units:"si",range:normals?"monthly_normals":"daily",lon:String(lon),lat:String(lat),...(normals?{}:{start:start.replaceAll("-",""),end:end.replaceAll("-","")})});
 const {value}=await cached(db,`prism:AN91d:Norm91m:parser-v2:${lat}:${lon}:${normals?"normals":start+":"+end}`,30*DAY_SECONDS,async()=>{
  const raw=await crosscheckJson<Rpc>(RPC,{method:"POST",body:params.toString(),headers:{"Content-Type":"application/x-www-form-urlencoded"}},20000);
  const path=raw.result?.csv;
  if(raw.errors || !path || !/^[A-Za-z0-9]+\/PRISM_[A-Za-z0-9_.-]+\.csv$/.test(path))throw new Error("PRISM point access unavailable");
  const csvUrl="https://prism.oregonstate.edu/explorer/tmp/"+path;
  const csv=await crosscheckText(csvUrl,{},15000);
  const parsed=parsePrismCsv(csv,normals);
  const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(csv));
  return {...parsed,raw,csv,snapshotId:Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,"0")).join(""),retrievedAt:new Date().toISOString(),source:{url:RPC,request:params.toString(),csvUrl,product:parsed.dataset,resolution:"4 km",interpolation:"off; enclosing cell, not field average",dayBoundary:"24h ending 12:00 UTC on labelled date",units:{rain:normals?"mm/month":"mm/day",temperature:"C"},stability:normals?"1991-2020 normals":prismStability(end),attribution:"PRISM Group, Oregon State University, https://prism.oregonstate.edu",terms:"https://prism.oregonstate.edu/terms/"}};
 });return value;
}
