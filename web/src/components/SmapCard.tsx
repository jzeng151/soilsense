import { useEffect, useState } from "react";
import type { PlanResponse } from "../../../src/shared/types";
import type { summarizeSmap } from "../../../src/engine/smap";
import { SMAP_SOURCE } from "../../../src/engine/smap";
type Result = { note:string; evidence:ReturnType<typeof summarizeSmap>; bundle: {cell:{row:number;column:number}; retrievedAt:string; qualityPolicy:string; samples:{time:string}[]} | null };
export function SmapCard({plan}:{plan:PlanResponse}) {
 const [result,setResult]=useState<Result|null>(null),[failed,setFailed]=useState(false);
 const {lat,lon}=plan.request;
 useEffect(()=>{const ctrl=new AbortController();setResult(null);setFailed(false);
 fetch(`/api/smap?lat=${lat}&lon=${lon}&year=2022`,{signal:ctrl.signal}).then(r=>{if(!r.ok)throw new Error();return r.json() as Promise<Result>}).then(setResult).catch(()=>{if(!ctrl.signal.aborted)setFailed(true)});return ()=>ctrl.abort();},[lat,lon]);
 const fmt=(v:number|null)=>v===null?"unavailable":v.toFixed(3);
 return <section className="jr-card" aria-label="SMAP regional moisture evidence"><h2 className="jr-h2">SMAP soil moisture · regional context</h2>
 <p>{SMAP_SOURCE.meaning} Does not change crop rankings or Field Watch Dry/Watch/OK.</p>
 <p>{failed?"SMAP request failed; moisture remains unknown.":result?.note??"Loading SMAP evidence…"}</p>
 {result && <><p>2022 July 1 UTC seasonal window; requested baseline 2015–2025, replay year excluded. No pre-2015 SMAP history is fabricated.</p>
 {(["surface","rootzone"] as const).map(q=>{const v=result.evidence[q];return <details key={q}><summary>{q==="surface"?"Surface (0–5 cm)":"Root zone (0–100 cm)"}: {fmt(v.mean)} m³/m³</summary><p>Anomaly {fmt(v.anomaly)} m³/m³; percentile {v.percentile===null?"unavailable":v.percentile.toFixed(1)}. Native samples {v.count}/{v.expected}; complete reference windows {v.baseline.length}. {v.note}</p><ul>{v.baseline.map(b=><li key={b.year}>{b.year}: {b.mean.toFixed(3)} m³/m³ ({b.count} samples)</li>)}</ul></details>})}
 {result.bundle&&<p>Cell row {result.bundle.cell.row}, column {result.bundle.cell.column}; data retrieved {result.bundle.retrievedAt}. QA: {result.bundle.qualityPolicy}. Record {result.bundle.samples[0]?.time} to {result.bundle.samples.at(-1)?.time}.</p>}</>}
 <p><a href={SMAP_SOURCE.url}>NASA / NSIDC SPL4SMGP v008</a> · DOI {SMAP_SOURCE.doi} · {SMAP_SOURCE.spatial}, {SMAP_SOURCE.temporal}. Short records are not long-term drought normals.</p></section>;
}
