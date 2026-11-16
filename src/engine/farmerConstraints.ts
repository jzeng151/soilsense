import type { CropId, RotationPlan } from "../shared/types";
export interface FarmerConstraints {
  excludedCrops: CropId[];
  maxCornYears: number;
  drylandOnly: boolean;
  livestockOrForageMarket: boolean;
}
export interface ConstraintCandidate {
  id:string; label:string; crops:CropId[];
  drylandAllowed:boolean|null;
  requiresForageMarket:boolean;
  /** Phase-specific irrigation requirement/allowance must be supplied together; unknown is not zero. */
  phaseIrrigationMm?: {required:number|null;allowed:number|null}[];
}
export function checkFarmerConstraints(candidate:ConstraintCandidate,constraints:FarmerConstraints){
 if(!Number.isInteger(constraints.maxCornYears)||constraints.maxCornYears<0)throw new Error("Maximum corn years must be a nonnegative integer");
 const reasons:string[]=[];
 for(const crop of new Set(candidate.crops))if(constraints.excludedCrops.includes(crop))reasons.push(`Excluded crop: ${crop}`);
 if(candidate.crops.filter(c=>c==="corn").length>constraints.maxCornYears)reasons.push(`Exceeds maximum ${constraints.maxCornYears} corn years per displayed cycle`);
 if(constraints.drylandOnly && candidate.drylandAllowed!==true)reasons.push(candidate.drylandAllowed===null?"Dryland applicability undocumented":"Treatment requires irrigation");
 if(candidate.requiresForageMarket&&!constraints.livestockOrForageMarket)reasons.push("Livestock access or a forage market required");
 candidate.phaseIrrigationMm?.forEach((p,i)=>{if(p.required===null||p.allowed===null||!Number.isFinite(p.required)||!Number.isFinite(p.allowed)||p.required<0||p.allowed<0)reasons.push(`Phase ${i+1}: irrigation requirement/allowance unknown or invalid`);else if(p.required>p.allowed)reasons.push(`Phase ${i+1}: irrigation exceeds allowance`);});
 return {eligible:reasons.length===0,reasons};
}
/** Filter only supplied alternatives; keep current visible even when excluded. Does not rescore. */
export function constrainRotationComparison(plans:ConstraintCandidate[],current:ConstraintCandidate|null,constraints:FarmerConstraints){
 const rows=plans.map(p=>({...p,...checkFarmerConstraints(p,constraints)}));
 return {eligible:rows.filter(p=>p.eligible),excluded:rows.filter(p=>!p.eligible),current:current?{...current,...checkFarmerConstraints(current,constraints)}:null};
}
export function planConstraintCandidate(plan:RotationPlan,rainOnly:boolean):ConstraintCandidate{
 return {id:plan.id,label:plan.label,crops:plan.years.map(y=>y.crop),drylandAllowed:rainOnly,requiresForageMarket:plan.years.some(y=>y.crop==="alfalfa")};
}
/** Annualized net margin needs every treatment phase, including fallow; never drop an unknown phase.
 * netPerAcre is the TOTAL net over that whole phase, not an annual rate; durationYears is its actual duration.
 */
export function annualizedTreatmentMargin(phases:{durationYears:number;netPerAcre:number|null}[]):number|null{
 if(!phases.length||phases.some(p=>!Number.isFinite(p.durationYears)||p.durationYears<=0||p.netPerAcre===null||!Number.isFinite(p.netPerAcre)))return null;
 return phases.reduce((s,p)=>s+p.netPerAcre!,0)/phases.reduce((s,p)=>s+p.durationYears,0);
}
const SARE="https://projects.sare.org/project-reports/lnc18-411";
export const ROTATION_RESEARCH_LIBRARY = [
 {id:"r3-research-gap",label:"R3 Corn → wheat → sorghum → soybean",crops:["corn","winter_wheat","sorghum","soybean"] as CropId[],drylandAllowed:null,requiresForageMarket:false,source:null,treatment:"Exact four-crop sequence and treatment parameters not verified; not eligible for scoring",phaseYears:null,plantingHarvest:null,annualizedMargin:null,yields:null,irrigation:null,residue:null,nitrogenCredit:null},
 ...(["chemical-fallow","standing-oat-triticale","hayed-oat-triticale","grazed-oat-triticale"] as const).map(treatment=>({id:`r4-${treatment}`,label:`R4 Wheat → sorghum → ${treatment}`,crops:(treatment==="chemical-fallow"?["winter_wheat","sorghum","fallow"]:["winter_wheat","sorghum","fallow","oats"]) as CropId[],drylandAllowed:true,requiresForageMarket:treatment==="hayed-oat-triticale"||treatment==="grazed-oat-triticale",source:SARE,treatment,phaseYears:null,plantingHarvest:"Study: spring oat/triticale replaces part of fallow ahead of winter wheat; exact phase calendars not parameterized",annualizedMargin:null,yields:null,irrigation:"No-till dryland treatment, not limited-irrigation research",residue:"Standing, hayed and grazed are distinct treatments; removal/regrowth depends on site-year",nitrogenCredit:null})),
];
export const ROTATION_TRADEOFF = "K-State SARE LNC18-411, Brownell/Garden City, 2018–2022: cover crops consume water otherwise stored for the next crop. At Brownell, spring covers reduced wheat yields 25–31% versus fallow in two of five years, while five-year treatment means were not significantly different. Forage can offset costs but depends on markets, moisture and management. Oat/triticale is a grass mixture, not a legume nitrogen credit. These are study observations, not field predictions or universal soil/profit benefits.";
