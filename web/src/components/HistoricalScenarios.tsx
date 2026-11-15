import { useI18n } from "../i18n";
import { useState } from "react";
import type { buildHistoricalScenarios } from "../../../src/engine/historicalScenarios";
type Result=ReturnType<typeof buildHistoricalScenarios>&{snapshot:{id:string;scenarioId:string;source:{url:string}}};
export function HistoricalScenarios({lat,lon}:{lat:number;lon:number}){
  const { t: tx } = useI18n();
 const [data,setData]=useState<Result|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(false),[mode,setMode]=useState("hot");
 async function load(){setBusy(true);setError("");try{const r=await fetch(`/api/historical-scenarios?lat=${lat}&lon=${lon}`);if(!r.ok)throw new Error(tx("POWER history unavailable"));setData(await r.json());}catch(e){setError(e instanceof Error ? e.message : tx("POWER history unavailable"));}finally{setBusy(false);}}
 const selected=data ? mode==="hot" ? data.hot:mode==="2022" ? data.replay2022:data.reference:null;
 return <details className="jr-more"><summary>{tx("Hot-year exposure and historical event catalog")}</summary>
 <p>{tx("Historical corn July–August screen only; not forecasts, observed crop losses or a change to rotation rankings. Select the largest sum of daily Tmax above 30°C in the field's own unadjusted POWER record. All 62 daily highs required. Threshold is illustrative.")}</p>
 <button type="button" disabled={busy} onClick={load}>{busy ? tx("Loading…"):tx("Load field history")}</button>{error && <p role="status">{error}</p>}
 {data && <div><label>{tx("Comparison")}{" "}<select value={mode} onChange={e=>setMode(e.target.value)}><option value="reference">{tx("Record reference")}</option><option value="2022">{tx("2022 summer")}</option><option value="hot">{tx("Hot year")}</option></select></label>
 <p>{tx("Candidate years")}{" "}{data.candidateYears.first}–{data.candidateYears.last}{tx("; eligible")}{" "}{data.candidates.filter(c=>c.eligible).length}{tx("; tied hottest years")}{" "}{data.tiedYears.join(", ") || tx("unavailable")}{tx(". Earliest tie displayed, not an exclusive winner.")}</p>
 <p>{mode==="hot" ? tx("Selected {year}", { year: data.hot?.year ?? tx("unavailable") }):mode==="2022"?"2022":tx("Record mean")}{tx(": heat")}{" "}{selected?.heatDegreeDaysC?.toFixed(1) ?? tx("missing")} {tx("°C-days >30°C; rain")} {selected?.rainMm?.toFixed(1) ?? tx("missing")} mm.</p>
 <p>{tx("Reference heat years:")}{" "}{data.reference.years.join(", ")}{tx("; reference rain years:")}{" "}{data.reference.rainYears.join(", ")}.</p>
 <details><summary>{tx("Coverage and conflicts")}</summary><ul>{data.candidates.filter(c=>!c.eligible || c.missingRain).map(c=><li key={c.year}>{c.year}{tx(": missing highs")}{" "}{c.missingHeat}{tx(", rain")}{" "}{c.missingRain}; {c.eligible?tx("heat eligible"):tx("excluded")}</li>)}</ul><p>{tx("Agreement with an event narrative is not required. Current rankings and existing bad-year replay remain unchanged.")}</p></details>
 <ul>{data.catalog.map(e=><li key={e.id}><a href={e.source}>{e.title}</a> — {e.place}, {e.start}–{e.end}{tx("; published")}{" "}{e.sourceDate}. {e.context} <b>{tx("Context only.")}</b></li>)}</ul>
 <p><a href={data.snapshot.source.url}>NASA POWER, LST, 0.5° × 0.625°</a>{tx("; immutable parsed-input/config SHA-256")}{" "}{data.snapshot.id}{tx(". Original raw API metadata are not preserved by the existing history cache.")}</p>
 </div>}
 </details>;
}
