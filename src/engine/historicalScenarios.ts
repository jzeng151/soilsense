import type { DailyClimate } from "./climate";
/** Versioned, illustrative corn summer screen, not a calibrated biological threshold or forecast. */
export const HOT_YEAR_RULE = { version:"corn-summer-exposure-v1", crop:"corn", start:"07-01", end:"08-31", thresholdC:30, metric:"sum max(0, daily Tmax Celsius - 30), Celsius degree-days", coverage:"every calendar date and Tmax required; incomplete summers excluded", tie:"all tied years retained; earliest used for display only", weatherAdjustment:"none; raw NASA POWER only" } as const;
export const HISTORICAL_EVENTS = [
 {id:"central-us-2012",start:"2012-01-01",end:"2012-12-31",place:"Central US / Corn Belt",title:"2012 Central US drought",sourceDate:"2015-01-05",source:"https://www.drought.gov/documents/too-much-too-little-how-central-us-drought-2012-evolved-out-one-most-devastating-floods",attribution:"NOAA NIDIS / state climatologists",context:"Regional assessment of the rapidly intensifying 2012 drought across the Corn Belt. Not proof of loss or the worst year on this field."},
 {id:"southern-plains-2022",start:"2022-01-01",end:"2022-12-31",place:"Southern Plains, including Kansas and Oklahoma",title:"2022 Plains drought",sourceDate:"2022-12-09",source:"https://www.drought.gov/drought-status-updates/southern-plains-drought-status-update-2022-12-09",attribution:"NOAA NIDIS and state climatologists",context:"December 9 regional drought-status report describes agricultural impacts in western Kansas and parts of Oklahoma. A dated historical report, not its then-outlook presented as a current forecast."},
 {id:"kansas-wheat-2023",start:"2022-09-01",end:"2023-08-31",place:"Kansas statewide winter-wheat crop year 2023",title:"2023 Kansas wheat abandonment",sourceDate:"2023-09-29",source:"https://www.nass.usda.gov/sites/default/files/Newsroom/Executive_Briefings/2023/09-29-2023.pdf",attribution:"USDA NASS Agricultural Statistics Board",context:"Small Grains Summary briefing, 2023 Winter Wheat Acreage, Yield, and Production table, Kansas row: 8.100 million acres planted and 5.750 million harvested for grain. The planted-minus-grain-harvested share is approximately 29.0%; this includes acreage not harvested for grain, not necessarily complete crop loss or solely drought. Statewide context, not a measured field loss or generated yield prediction."},
] as const;
export function buildHistoricalScenarios(climate: DailyClimate, first: number, last: number) {
 const years = new Map(climate.years.map(y => [y.year,y]));
 const candidates = [];
 for (let year=first;year<=last;year++) {
  const days = new Map((years.get(year)?.days ?? []).map(d => [`${String(d.month).padStart(2,"0")}-${String(d.day).padStart(2,"0")}`,d]));
  let heat=0, rain=0, missingHeat=0, missingRain=0;
  for(let t=Date.UTC(year,6,1);t<=Date.UTC(year,7,31);t+=86400000){
   const d=days.get(new Date(t).toISOString().slice(5,10));
   if(d?.tmax === null || d?.tmax === undefined || !Number.isFinite(d.tmax)) missingHeat++; else heat+=Math.max(0,d.tmax-30);
   if(d?.prcp === null || d?.prcp === undefined || !Number.isFinite(d.prcp)) missingRain++; else rain+=d.prcp;
  }
  candidates.push({year,start:`${year}-07-01`,end:`${year}-08-31`,expectedDays:62,missingHeat,missingRain,heatDegreeDaysC:missingHeat ? null:heat,rainMm:missingRain ? null:rain,eligible:missingHeat===0});
 }
 const eligible=candidates.filter(c => c.eligible);
 const maximum=eligible.length ? Math.max(...eligible.map(c=>c.heatDegreeDaysC!)):null;
 const tiedYears=eligible.filter(c=>c.heatDegreeDaysC===maximum).map(c=>c.year);
 const mean=(xs:number[])=>xs.length ? xs.reduce((a,b)=>a+b,0)/xs.length:null;
 return {rule:HOT_YEAR_RULE, candidateYears:{first,last}, candidates, tiedYears,
  hot:tiedYears.length ? candidates.find(c=>c.year===tiedYears[0])!:null,
  reference:{id:"reference-record-mean",label:"Mean of eligible complete summers, not a normal-year forecast",years:eligible.map(c=>c.year),heatDegreeDaysC:mean(eligible.map(c=>c.heatDegreeDaysC!)),rainMm:mean(eligible.flatMap(c=>c.rainMm===null ? []:[c.rainMm])),rainYears:eligible.filter(c=>c.rainMm!==null).map(c=>c.year)},
  replay2022:candidates.find(c=>c.year===2022) ?? null,
  catalog:HISTORICAL_EVENTS.map(e=>({...e,execution:"context-only; use separately dated POWER summer diagnostics, not the full event footprint"})),
  limitations:["Gridded exposure, not measured field stress or losses", "No changes to yields, allocation, fixed trial assumptions, saved calendars or rankings", "30 C threshold and fixed corn July-August window are illustrative; not transferable to wheat or all corn hybrids", "Regional event narratives need not agree with this point/window, and 2022 need not be hottest", "Reference rainfall can use fewer years; exact denominator years retained"],
 };
}
