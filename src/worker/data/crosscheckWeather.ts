import { cached, DAY_SECONDS } from "../lib/cache";
import { crosscheckJson, crosscheckText } from "./crosscheckHttp";
import { snapToPowerGrid } from "./power";
import type { WeatherEstimate,WeatherSeries } from "../../engine/weatherCrosscheck";
interface Power {header:{fill_value:number;time_standard:string;api:{version:string}};properties:{parameter:Record<string,Record<string,number>>};parameters:Record<string,{units:string}>}
export async function getCrosscheckPower(db:D1Database|undefined,lat:number,lon:number,start:string,end:string,timeStandard:"LST"|"UTC"="LST"){
 const grid=snapToPowerGrid(lat,lon),url=`https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M_MIN,T2M_MAX,PRECTOTCORR&community=AG&latitude=${grid.lat}&longitude=${grid.lon}&start=${start.replaceAll("-","")}&end=${end.replaceAll("-","")}&format=JSON&time-standard=${timeStandard}`;
 const {value}=await cached(db,`crosscheck-power:v2:${timeStandard}:${grid.lat}:${grid.lon}:${start}:${end}`,30*DAY_SECONDS,async()=>{
  const raw=await crosscheckJson<Power>(url,{},25000);
  if(raw.header?.time_standard!==timeStandard || raw.parameters?.T2M_MIN?.units!=="C" || raw.parameters?.T2M_MAX?.units!=="C" || raw.parameters?.PRECTOTCORR?.units!=="mm/day")throw new Error("Unverified POWER units/time standard");
  const p=raw.properties.parameter,keys=[...new Set(Object.values(p).flatMap(s=>Object.keys(s)))].sort();
  const get=(name:string,d:string)=>{const v=p[name]?.[d];return v===undefined || !Number.isFinite(v) || v===raw.header.fill_value || (name==="PRECTOTCORR" && v<0)?null:v;};
  const rows:WeatherEstimate[]=keys.map(d=>({date:`${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}`,rain:get("PRECTOTCORR",d),tmin:get("T2M_MIN",d),tmax:get("T2M_MAX",d)}));
  return {id:timeStandard==="LST"?"POWER":"POWER daily UTC",dayBoundary:timeStandard==="LST"?"LST daily":"UTC midnight",rows,raw,retrievedAt:new Date().toISOString(),source:{url,product:`NASA POWER daily API ${raw.header.api.version} / MERRA-2 / ${timeStandard}`,units:{rain:"mm/day",temperature:"C"},resolution:"0.5 latitude x 0.625 longitude degrees",grid,attribution:"NASA POWER Project, NASA Langley Research Center"}};
 });return {...value, source:{...value.source, requestedPoint:{lat,lon}}};
}
export async function getCrosscheckDaymet(db:D1Database|undefined,lat:number,lon:number,start:string,end:string){
 const url=`https://daymet.ornl.gov/single-pixel/api/data?lat=${lat}&lon=${lon}&vars=prcp,tmax,tmin&start=${start}&end=${end}`;
 const {value}=await cached(db,`crosscheck-daymet:v4r1-parser-v2:${lat}:${lon}:${start}:${end}`,30*DAY_SECONDS,async()=>{
  const csv=await crosscheckText(url,{},20000);
  if(!csv.includes("Version 4 R1") || !csv.includes("year,yday,prcp (mm/day),tmax (deg c),tmin (deg c)"))throw new Error("Unverified Daymet schema/product");
  const rows:WeatherEstimate[]=csv.split(/\r?\n/).filter(l=>/^\d{4},/.test(l)).map(l=>{const [y,d,p,x,n]=l.split(",").map(v=>v.trim()===""?NaN:Number(v));const clean=(v:number|undefined)=>v!==undefined && Number.isFinite(v)&&v>-999?v:null;return {date:new Date(Date.UTC(y!,0,d!)).toISOString().slice(0,10),rain:p!==undefined && p>=0?clean(p):null,tmax:clean(x),tmin:clean(n)};});
  return {id:"Daymet",dayBoundary:"unknown",rows,csv,retrievedAt:new Date().toISOString(),source:{url,product:"Daymet Version 4 R1",resolution:"1 km",units:{rain:"mm/day",temperature:"C"},attribution:"Thornton et al. 2022, ORNL DAAC, doi:10.3334/ORNLDAAC/2129",dayBoundary:"not verified in this adapter; not comparable",calendar:"365 days; drops Dec 31 in leap years"}};
 });return {...value, source:{...value.source, requestedPoint:{lat,lon}}};
}
export function crosscheckMerge(power:WeatherSeries,daymet:WeatherSeries):WeatherSeries{
 const dm=new Map(daymet.rows.map(d=>[d.date,d]));
 return {id:"POWER-Daymet descriptive merge",dayBoundary:"unknown",rows:power.rows.map(p=>{const d=dm.get(p.date);const avg=(a:number|null,b:number|null|undefined)=>b===undefined||b===null?a:a===null?b:(a+b)/2;return {...p,rain:avg(p.rain,d?.rain),tmin:avg(p.tmin,d?.tmin),tmax:avg(p.tmax,d?.tmax)};})};
}
