import { describe,it,expect } from "vitest";
import { messages, translate } from "../web/src/i18n";
import { annualizedTreatmentMargin,checkFarmerConstraints,constrainRotationComparison,ROTATION_RESEARCH_LIBRARY,ROTATION_TRADEOFF,type FarmerConstraints,type ConstraintCandidate } from "../src/engine/farmerConstraints";
const constraints:FarmerConstraints={excludedCrops:[],maxCornYears:1,drylandOnly:true,livestockOrForageMarket:false};
const candidate:ConstraintCandidate={id:"fixture",label:"Fixture",crops:["winter_wheat","sorghum","fallow"],drylandAllowed:true,requiresForageMarket:false};
describe("farmer constraints",()=>{
 it("has Spanish copy for dynamic applicability reasons and research prose",()=>{
   const copy=[ROTATION_TRADEOFF,...ROTATION_RESEARCH_LIBRARY.map(r=>r.residue).filter((v):v is string=>v!==null),"Dryland applicability undocumented","Treatment requires irrigation","Livestock access or a forage market required"];
   for(const value of copy){expect(Object.hasOwn(messages,value)).toBe(true);expect(messages[value as keyof typeof messages]).not.toBe(value);}
   expect(translate("es","Excluded crop: {crop}",{crop:"Maíz"})).toBe("Cultivo excluido: Maíz");
   expect(translate("es","Exceeds maximum {count} corn years per displayed cycle",{count:0})).toContain("0 años de maíz");
 });
 it("does not mutate supplied rankings, current rotation or constraints",()=>{
   const plans=[{...candidate,id:"first"},{...candidate,id:"second",crops:["corn"] as ConstraintCandidate["crops"]}];
   const before=JSON.stringify({plans,candidate,constraints});
   constrainRotationComparison(plans,candidate,{...constraints,excludedCrops:["corn"]});
   expect(JSON.stringify({plans,candidate,constraints})).toBe(before);
 });
 it("excludes oats in every cover treatment without excluding chemical fallow",()=>{
   const screen={...constraints,excludedCrops:["oats"] as ConstraintCandidate["crops"],livestockOrForageMarket:true};
   const covers=ROTATION_RESEARCH_LIBRARY.filter(r=>r.id.includes("oat-triticale"));
   expect(covers).toHaveLength(3);
   for(const cover of covers)expect(checkFarmerConstraints(cover,screen).reasons).toContain("Excluded crop: oats");
   expect(checkFarmerConstraints(ROTATION_RESEARCH_LIBRARY.find(r=>r.id==="r4-chemical-fallow")!,screen).eligible).toBe(true);
 });
 it("rejects invalid corn limits and incomplete or invalid annualization",()=>{
   for(const maxCornYears of [-1,0.5,NaN,Infinity])expect(()=>checkFarmerConstraints(candidate,{...constraints,maxCornYears})).toThrow();
   expect(annualizedTreatmentMargin([])).toBeNull();
   for(const durationYears of [-1,NaN,Infinity])expect(annualizedTreatmentMargin([{durationYears,netPerAcre:100}])).toBeNull();
   for(const netPerAcre of [NaN,Infinity])expect(annualizedTreatmentMargin([{durationYears:1,netPerAcre}])).toBeNull();
   expect(annualizedTreatmentMargin([{durationYears:0.5,netPerAcre:100},{durationYears:1.5,netPerAcre:-20}])).toBe(40);
 });
 it("distinguishes dryland fallow, hay and grazing without borrowing trial parameters",()=>{const fallow=ROTATION_RESEARCH_LIBRARY.find(r=>r.id==="r4-chemical-fallow")!,hay=ROTATION_RESEARCH_LIBRARY.find(r=>r.id==="r4-hayed-oat-triticale")!;expect(checkFarmerConstraints(fallow,constraints).eligible).toBe(true);expect(checkFarmerConstraints(hay,constraints).eligible).toBe(false);expect(checkFarmerConstraints(hay,{...constraints,livestockOrForageMarket:true}).eligible).toBe(true);expect(hay.yields).toBeNull();expect(hay.annualizedMargin).toBeNull();});
 it("retains infeasible current, explains exclusions and permits no alternatives",()=>{const p={...candidate,crops:["corn","corn","sorghum"] as ConstraintCandidate["crops"]};const r=constrainRotationComparison([p],p,{...constraints,excludedCrops:["sorghum"]});expect(r.eligible).toHaveLength(0);expect(r.excluded[0]!.reasons).toHaveLength(2);expect(r.current?.label).toBe("Fixture");expect(r.current?.eligible).toBe(false);});
 it("checks unknown dryland and per-phase allowance rather than treating missing as zero",()=>{expect(checkFarmerConstraints({...candidate,drylandAllowed:null},constraints).eligible).toBe(false);expect(checkFarmerConstraints({...candidate,phaseIrrigationMm:[{required:null,allowed:10}]},constraints).eligible).toBe(false);expect(checkFarmerConstraints({...candidate,phaseIrrigationMm:[{required:11,allowed:10}]},constraints).eligible).toBe(false);expect(checkFarmerConstraints({...candidate,phaseIrrigationMm:[{required:0,allowed:0}]},constraints).eligible).toBe(true);});
 it("annualizes whole-phase totals over all phase durations, including fallow",()=>{expect(annualizedTreatmentMargin([{durationYears:1,netPerAcre:100},{durationYears:1,netPerAcre:200},{durationYears:1,netPerAcre:-30}])).toBe(90);expect(annualizedTreatmentMargin([{durationYears:1,netPerAcre:100},{durationYears:1,netPerAcre:null}])).toBeNull();expect(annualizedTreatmentMargin([{durationYears:0,netPerAcre:0}])).toBeNull();});
});
