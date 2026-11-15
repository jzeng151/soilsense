import { Hono } from "hono";
import { buildHistoricalScenarios } from "../../engine/historicalScenarios";
import { getDailyClimate, snapToPowerGrid } from "../data/power";
import { isInContiguousUS } from "../service";
import type { AppEnv } from "./auth";
export const historicalScenarios = new Hono<AppEnv>();
historicalScenarios.get("/",async c=>{
 const lat=Number(c.req.query("lat")),lon=Number(c.req.query("lon"));
 if(!isInContiguousUS(lat,lon)) return c.json({error:"Contiguous US point required"},400);
 const first=1991,last=new Date().getUTCFullYear()-1;
 try {
  const climate=await getDailyClimate(c.env.DB,lat,lon,first,last);
  const scenarios=buildHistoricalScenarios(climate,first,last);
  const input={climate,rule:scenarios.rule,requestedPoint:{lat,lon},candidateYears:{first,last},parserVersion:"power:v1"};
  const hash=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify(input)));
  const snapshotId=Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,"0")).join("");
  const grid=snapToPowerGrid(lat,lon);
  return c.json({...scenarios,snapshot:{id:snapshotId,scenarioId:`hot:${snapshotId}`,configVersion:scenarios.rule.version,parserVersion:"power:v1",inputs:input,source:{product:"NASA POWER daily / MERRA-2",url:`https://power.larc.nasa.gov/api/temporal/daily/point?parameters=PRECTOTCORR,T2M,T2M_MAX,T2M_MIN,GWETROOT&community=AG&latitude=${grid.lat}&longitude=${grid.lon}&start=${first}0101&end=${last}1231&format=JSON&time-standard=LST`,timeStandard:"LST",resolution:"0.5 latitude x 0.625 longitude degrees",units:{tmax:"C",rain:"mm/day",heat:"C degree-days"},attribution:"NASA POWER Project, NASA Langley Research Center"}}});
 }catch{return c.json({status:"unavailable",reason:"POWER history unavailable; event catalog is not executable weather evidence"},502);}
});
