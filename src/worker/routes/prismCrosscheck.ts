import { Hono } from "hono";
import { compareWeather } from "../../engine/weatherCrosscheck";
import { getPrism } from "../data/prism";
import { crosscheckMerge,getCrosscheckPower,getCrosscheckDaymet } from "../data/crosscheckWeather";
import { isInContiguousUS } from "../service";
import type { AppEnv } from "./auth";
export const prismCrosscheck=new Hono<AppEnv>();
prismCrosscheck.get("/",async c=>{
 const lat=Number(c.req.query("lat")),lon=Number(c.req.query("lon")),start=c.req.query("start")??"2023-05-01",end=c.req.query("end")??"2023-05-03";
 const valid=(d:string)=>/^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(Date.parse(d)) && new Date(d).toISOString().slice(0,10)===d;
 if(!isInContiguousUS(lat,lon)||!valid(start)||!valid(end)||start>end||Date.parse(end)-Date.parse(start)>30*86400000||start.slice(0,4)<"1991"||end.slice(0,4)>=String(new Date().getUTCFullYear()))return c.json({error:"US point and completed-year interval of 1-31 days since 1991 required"},400);
 const dates:string[]=[];for(let t=Date.parse(start);t<=Date.parse(end);t+=86400000)dates.push(new Date(t).toISOString().slice(0,10));
 const settled=await Promise.allSettled([getPrism(c.env.DB,lat,lon,start,end),getCrosscheckPower(c.env.DB,lat,lon,start,end),getCrosscheckDaymet(c.env.DB,lat,lon,start,end),getPrism(c.env.DB,lat,lon,start,end,true)]);
 const prism=settled[0].status==="fulfilled"?settled[0].value:null,power=settled[1].status==="fulfilled"?settled[1].value:null,daymet=settled[2].status==="fulfilled"?settled[2].value:null,normals=settled[3].status==="fulfilled"?settled[3].value:null;
 const ps=prism?{id:"PRISM",dayBoundary:"12:00 UTC ending",rows:prism.rows}:null;
 const merge=power&&daymet?crosscheckMerge(power,daymet):null;
 return c.json({start,end,requestedPoint:{lat,lon},prism,power,daymet,merge,normals,
  diagnostics:ps?[power,daymet,merge].filter(v=>v!==null).map(s=>({against:s!.id,rows:compareWeather(ps,s!,dates)})):[],
  evidenceReasons:{coverage:prism?"PRISM point subset fetched; inspect per-variable gaps":"PRISM unavailable; not zero",disagreement:"Retained absolute differences; no product is truth",comparability:"Daily boundaries differ/unknown. Identical date labels are not identical intervals; cannot align 12UTC with LST from daily totals. No global confidence score",localApplicability:"Gridded estimates are not field measurements; agreement is not independent validation",imerg:"unavailable; no verified IMERG adapter in this branch",merge:"Descriptive equal-weight merge on this interval only; not proof the main planner used Daymet. Main planner has its own full-history coverage gate"}});
});
