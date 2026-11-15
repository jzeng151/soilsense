export interface WeatherEstimate {date:string;rain:number|null;tmin:number|null;tmax:number|null}
export interface WeatherSeries {id:string;dayBoundary:string;rows:WeatherEstimate[]}
/** Pairwise diagnostics, never a local-applicability or crop-response confidence score. */
export function compareWeather(a:WeatherSeries,b:WeatherSeries,dates:string[],illustrativeThresholdPct=25){
 const am=new Map(a.rows.map(d=>[d.date,d])),bm=new Map(b.rows.map(d=>[d.date,d]));
 return dates.flatMap(date=>(["rain","tmin","tmax"] as const).map(variable=>{
  const av=am.get(date)?.[variable]??null,bv=bm.get(date)?.[variable]??null;
  const missing=av===null || bv===null || !Number.isFinite(av) || !Number.isFinite(bv);
  const absoluteDifference=missing?null:Math.abs(av-bv);
  // Symmetric percentage avoids declaring either source truth. Suppress near-dry denominator.
  const denominator=missing?null:(Math.abs(av)+Math.abs(bv))/2;
  const relativeDifferencePct=variable!=="rain" || denominator===null || denominator<1 ? null:100*absoluteDifference!/denominator;
  const comparable=a.dayBoundary===b.dayBoundary && a.dayBoundary!=="unknown";
  return {date,variable,a:av,b:bv,absoluteDifference,relativeDifferencePct,
   state:missing?"missing":!comparable?"not_comparable":relativeDifferencePct!==null && relativeDifferencePct>illustrativeThresholdPct?"disagreeing":"consistent",
   missing,notComparable:!comparable,disagreeing:!missing && comparable && relativeDifferencePct!==null ? relativeDifferencePct>illustrativeThresholdPct:null,
   reason:!comparable?"Day boundaries differ or are unknown; same date label does not align observation intervals":missing?"At least one raw estimate missing":variable==="rain" && relativeDifferencePct===null?"Mean absolute rainfall below 1 mm; relative difference suppressed":"Consistency is not independent validation or local applicability",
   threshold:{value:illustrativeThresholdPct,unit:"% symmetric rainfall difference",status:"illustrative configurable screen; not agronomic certainty"}};
 }));
}
