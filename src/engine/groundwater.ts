/** Regional descriptive comparison only; never used by crop ranking or Field Watch. */
export interface StorageMonth { month:string; twsCm:number|null }
export interface WellLevel {date:string;reportedSignedFt:number|null;status:string}
export interface ComparisonWell {id:string;selectedAnnualDates:string[];observations:WellLevel[]}
export function linearSlope(points:{x:number;y:number}[]):number|null {
 if(points.length<2 || points.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)))return null;
 const mx=points.reduce((n,p)=>n+p.x,0)/points.length,my=points.reduce((n,p)=>n+p.y,0)/points.length;
 const denominator=points.reduce((n,p)=>n+(p.x-mx)**2,0);
 return denominator===0?null:points.reduce((n,p)=>n+(p.x-mx)*(p.y-my),0)/denominator;
}
const direction=(v:number|null)=>v===null?"unknown":Math.abs(v)<1e-9?"flat":v>0?"rising":"falling";
export function compareGroundwater(months:StorageMonth[],wells:ComparisonWell[]) {
 // Repeated source month invalidates that month rather than choosing a convenient value.
 const seen=new Set<string>(), data=new Map<string,number|null>();
 for(const m of months){if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(m.month))continue;data.set(m.month,seen.has(m.month)?null:m.twsCm);seen.add(m.month);}
 const comparisons=wells.map(w=>{
  const dates=new Set(w.selectedAnnualDates), selected=w.observations.filter(o=>dates.has(o.date));
  const duplicates=new Set(selected.filter((o,i)=>selected.findIndex(x=>x.date.slice(0,7)===o.date.slice(0,7))!==i).map(o=>o.date.slice(0,7)));
  const pairs=selected.flatMap(o=>{
   const month=o.date.slice(0,7),g=data.get(month),value=o.reportedSignedFt;
   if(duplicates.has(month)||o.status!=="-"||g===null||g===undefined||value===null||!Number.isFinite(g)||!Number.isFinite(value))return [];
   return [{date:o.date,month,twsCm:g,wellSignedFt:value}];
  }).sort((a,b)=>a.date.localeCompare(b.date));
  const x=(month:string)=>Number(month.slice(0,4))+(Number(month.slice(5,7))-.5)/12;
  const enough=pairs.length>=5; // explicit demonstration minimum, not a significance test
  const graceCmPerYear=enough?linearSlope(pairs.map(p=>({x:x(p.month),y:p.twsCm}))):null;
  const wellFtPerYear=enough?linearSlope(pairs.map(p=>({x:x(p.month),y:p.wellSignedFt}))):null;
  const gd=direction(graceCmPerYear),wd=direction(wellFtPerYear);
  const agreement: "insufficient"|"same-direction"|"disagree"|"flat-or-mixed" = !enough?"insufficient":(gd==="rising"&&wd==="falling"||gd==="falling"&&wd==="rising")?"disagree":gd===wd?"same-direction":"flat-or-mixed";
  return {id:w.id,pairs,omittedSelectedDates:w.selectedAnnualDates.filter(d=>!pairs.some(p=>p.date===d)),period:pairs.length?[pairs[0]!.month,pairs.at(-1)!.month]:null,graceCmPerYear,wellFtPerYear,graceDirection:gd,wellDirection:wd,agreement};
 });
 const disagreement=comparisons.some(w=>w.agreement==="disagree");
 return {wells:comparisons,disagreement,note:disagreement?"Investigate disagreement: soil/surface water, scale, pumping/recovery, timing and well/aquifer context may differ. No series is rewritten and no crop-confidence verdict follows.":"Direction agreement is descriptive, not validation: total terrestrial storage includes groundwater, soil moisture, surface water and snow. Nearby wells do not validate a broad mascon or predict this field’s own well.",method:"OLS descriptive slopes on identical available calendar months per well (Jan–Mar selected annual observations); gaps omitted pairwise, never filled. Minimum 5 pairs is a demonstration policy, no statistical significance or causal claim. Different well coverage may yield different periods; compare only the displayed matched periods."};
}
