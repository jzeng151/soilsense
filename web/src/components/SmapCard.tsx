import { useI18n } from "../i18n";
import { useEffect, useState } from "react";
import type { PlanResponse } from "../../../src/shared/types";
import type { summarizeSmap } from "../../../src/engine/smap";
import { SMAP_SOURCE } from "../../../src/engine/smap";
type Result = { note:string; evidence:ReturnType<typeof summarizeSmap>; bundle: {cell:{row:number;column:number}; retrievedAt:string; qualityPolicy:string; samples:{time:string}[]} | null };
export function SmapCard({plan}:{plan:PlanResponse}) {
  const { t: tx, text: localize } = useI18n();
 const [result,setResult]=useState<Result|null>(null),[failed,setFailed]=useState(false);
 const {lat,lon}=plan.request;
 useEffect(()=>{const ctrl=new AbortController();setResult(null);setFailed(false);
 fetch(`/api/smap?lat=${lat}&lon=${lon}&year=2022`,{signal:ctrl.signal}).then(r=>{if(!r.ok)throw new Error();return r.json() as Promise<Result>}).then(setResult).catch(()=>{if(!ctrl.signal.aborted)setFailed(true)});return ()=>ctrl.abort();},[lat,lon]);
 const fmt=(v:number|null)=>v===null?tx("unavailable"):v.toFixed(3);
 return <section className="jr-card" aria-label={tx("SMAP regional moisture evidence")}><h2 className="jr-h2">{tx("SMAP soil moisture · regional context")}</h2>
 <p>{localize(SMAP_SOURCE.meaning)}{" "}{tx("Does not change crop rankings or Field Watch Dry/Watch/OK.")}</p>
 <p>{failed?tx("SMAP request failed; moisture remains unknown."):(result ? localize(result.note) : null)??tx("Loading SMAP evidence…")}</p>
 {result && <><p>{tx("2022 July 1 UTC seasonal window; requested baseline 2015–2025, replay year excluded. No pre-2015 SMAP history is fabricated.")}</p>
 {(["surface","rootzone"] as const).map(q=>{const v=result.evidence[q];return <details key={q}><summary>{q==="surface"?tx("Surface (0–5 cm)"):tx("Root zone (0–100 cm)")}: {fmt(v.mean)} m³/m³</summary><p>{tx("Anomaly")}{" "}{fmt(v.anomaly)}{" "}{tx("m³/m³; percentile")}{" "}{v.percentile===null?tx("unavailable"):v.percentile.toFixed(1)}{tx(". Native samples")}{" "}{v.count}/{v.expected}{tx("; complete reference windows")}{" "}{v.baseline.length}. {localize(v.note)}</p><ul>{v.baseline.map(b=><li key={b.year}>{b.year}: {b.mean.toFixed(3)} m³/m³ ({b.count}{" "}{tx("samples)")}</li>)}</ul></details>})}
 {result.bundle&&<p>{tx("Cell row")}{" "}{result.bundle.cell.row}{tx(", column")}{" "}{result.bundle.cell.column}{tx("; data retrieved")}{" "}{result.bundle.retrievedAt}{tx(". QA:")}{" "}{result.bundle.qualityPolicy}{tx(". Record")}{" "}{result.bundle.samples[0]?.time}{" "}{tx("to")}{" "}{result.bundle.samples.at(-1)?.time}.</p>}</>}
 <p><a href={SMAP_SOURCE.url}>NASA / NSIDC SPL4SMGP v008</a> · DOI {SMAP_SOURCE.doi} · {SMAP_SOURCE.spatial}, {localize(SMAP_SOURCE.temporal)}{tx(". Short records are not long-term drought normals.")}</p></section>;
}
