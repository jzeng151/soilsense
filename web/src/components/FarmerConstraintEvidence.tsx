import { useState } from "react";
import type { CropId,RotationPlan } from "../../../src/shared/types";
import { checkFarmerConstraints,constrainRotationComparison,planConstraintCandidate,ROTATION_RESEARCH_LIBRARY,ROTATION_TRADEOFF,type FarmerConstraints } from "../../../src/engine/farmerConstraints";
export function FarmerConstraintEvidence({plans,current,rainOnly}:{plans:RotationPlan[];current:RotationPlan|null;rainOnly:boolean}){
 const [constraints,setConstraints]=useState<FarmerConstraints>({excludedCrops:[],maxCornYears:3,drylandOnly:false,livestockOrForageMarket:false});
 const change=(v:Partial<FarmerConstraints>)=>setConstraints(c=>({...c,...v}));
 const comparison=constrainRotationComparison(plans.map(p=>planConstraintCandidate(p,rainOnly)),current?planConstraintCandidate(current,rainOnly):null,constraints);
 const crops:CropId[]=["corn","soybean","winter_wheat","sorghum","oats","alfalfa","fallow"];
 return <details className="jr-more"><summary>Farmer constraints and dryland research library (preview)</summary>
 <p>Read-only screen of the alternatives already returned above, not a new exhaustive engine search or a change to the selected plan. The current rotation stays visible even if excluded. Three-year plan and four-year research sequence are not silently interchanged.</p>
 <fieldset><legend>Exclude crops</legend>{crops.map(c=><label key={c}><input type="checkbox" checked={constraints.excludedCrops.includes(c)} onChange={e=>change({excludedCrops:e.target.checked?[...constraints.excludedCrops,c]:constraints.excludedCrops.filter(x=>x!==c)})} />{c.replaceAll("_"," ")}</label>)}</fieldset>
 <label>Maximum corn years per displayed cycle <input type="number" min="0" max="4" value={constraints.maxCornYears} onChange={e=>change({maxCornYears:Math.max(0,Math.min(4,Math.floor(Number(e.target.value)||0)))})} /></label>
 <label><input type="checkbox" checked={constraints.drylandOnly} onChange={e=>change({drylandOnly:e.target.checked})} />Dryland only</label>
 <label><input type="checkbox" checked={constraints.livestockOrForageMarket} onChange={e=>change({livestockOrForageMarket:e.target.checked})} />I have livestock access or a forage market</label>
 {comparison.current?<p><b>Current rotation: {comparison.current.label}</b> — {comparison.current.eligible?"passes these constraints":comparison.current.reasons.join("; ")}</p>:<p>Current rotation unavailable; no invented baseline.</p>}
 <ul>{[...comparison.eligible,...comparison.excluded].map(p=><li key={p.id}>{p.label}: {p.eligible?"passes screen":p.reasons.join("; ")}</li>)}</ul>{!comparison.eligible.length&&<p>No supplied alternatives pass. This is not proof that no feasible rotation exists; rerun/full enumeration integration is pending.</p>}
 <p>{ROTATION_TRADEOFF}</p>
 <ul>{ROTATION_RESEARCH_LIBRARY.map(r=>{const e=checkFarmerConstraints(r,constraints);return <li key={r.id}><b>{r.label}</b> — {e.eligible?"passes applicability screen only":e.reasons.join("; ")}. Not scored: phase calendars, phase lengths, treatment budgets/yields and annualization are not parameterized. {r.source?<a href={r.source}>K-State SARE LNC18-411, 2018–2022</a>:"Exact sequence source not verified"}. {r.residue}</li>;})}</ul>
 <p>Source accessed 2026-11-15. No treatment yields, water allocations, N credits or profit transferred from other studies. Local checks: planting/termination dates, stored water, residue removal, forage quality, livestock logistics and treatment-matched budgets. Independent agronomist review pending.</p>
 </details>;
}
