import { useI18n } from "../i18n";
import { useEffect, useState } from 'react';
import type { PlanResponse } from '../../../src/shared/types';
import type { GroundwaterResult } from '../../../src/shared/groundwater';
const number=(v:number|null,n=2)=>v===null?'missing':v.toFixed(n);
export function GraceWellsCard({plan}:{plan:PlanResponse}) {
  const { t: tx, text: localize } = useI18n();
 const [data,setData]=useState<GroundwaterResult|null>(null),[error,setError]=useState(false);
 const {lat,lon}=plan.request;
 useEffect(()=>{const c=new AbortController();setData(null);setError(false);fetch(`/api/groundwater?lat=${lat}&lon=${lon}`,{signal:c.signal}).then(r=>{if(!r.ok)throw new Error();return r.json() as Promise<GroundwaterResult>}).then(setData).catch(()=>{if(!c.signal.aborted)setError(true)});return ()=>c.abort();},[lat,lon]);
 const b=data?.bundle,comparison=data?.comparison;
 return <section className="jr-card" style={{minWidth:0,overflowWrap:'anywhere'}} aria-label={tx("Regional GRACE and Kansas well observations")}><h2 className="jr-h2">{tx("Regional water storage & nearby Kansas wells")}</h2>
 <p>{tx("GRACE measures total terrestrial water storage across a broad region, not an individual aquifer, well or field. Groundwater, soil moisture, surface water and snow can contribute. These observations do not change crop rankings or Field Watch status.")}</p>
 <p aria-live="polite">{error?tx("Regional water evidence unavailable; no decline or stability is inferred."):(data ? localize(data.note) : null)??tx("Loading regional water evidence…")}</p>
 {b&&comparison&&<>
 <p><strong>NASA/JPL GRACE/GRACE-FO {b.grace.version}</strong> · mascon {b.grace.masconId} · {localize(b.grace.support)}{tx(". Native grid-cell center")}{" "}{b.grace.representativeGridCenter.lat}, {b.grace.representativeGridCenter.lon}{" "}{tx("identifies a regional estimate, not the selected field.")}</p>
 <p>{tx("2004–2009 time-mean baseline (")}{b.grace.baseline}{tx("); cm equivalent water thickness anomaly. Display period January 2015–December 2025.")}{" "}{b.grace.months.filter(m=>m.twsCm===null).length}{" "}{tx("missing months, including the inter-mission gap, remain gaps. Source coverage")}{" "}{b.grace.sourceCoverage.join(tx(' to '))}{tx(". Retrieved")}{" "}{b.retrievedAt}.</p>
 <p>{localize(b.grace.processing)}</p><p role={comparison.disagreement?'note':undefined}><strong>{comparison.disagreement?tx("Disagreement — investigate, not a crop verdict."):tx("Scale and interpretation limitation.")}</strong> {localize(comparison.note)}</p>
 <details><summary>{tx("Matched-period trend comparison and dated well records")}</summary><p>{localize(comparison.method)}</p><p>{localize(b.kgs.selection)}</p><p>{localize(b.kgs.signConvention)}</p><p>{localize(b.kgs.quality)}</p>
 {comparison.wells.map(w=>{const source=b.kgs.wells.find(s=>s.id===w.id)!;return <details key={w.id}><summary>{tx("Well")}{" "}{w.id}: {localize(w.wellDirection)}{tx("; regional storage")}{" "}{localize(w.graceDirection)} · {localize(w.agreement)}</summary>
 <p>{source.county}{" "}{tx("County;")}{" "}{source.lat}, {source.lon}; {source.distanceKm}{" "}{tx("km from demo. Geological unit codes (as supplied):")}{" "}{source.geologicalUnitCodes??tx("not supplied")}{tx(". Screened interval not supplied; well depth")}{" "}{localize(number(source.wellDepthFt))} ft. {source.siteUse}; {source.waterUse}{tx(". Well ID preserved as supplied, not used to derive coordinates.")}</p>
 <p>{tx("Matched months")}{" "}{w.period?.join(tx(' to '))??tx("insufficient")} ({w.pairs.length}{" "}{tx("pairs). GRACE slope")}{" "}{localize(number(w.graceCmPerYear,3))}{" "}{tx("cm/year; well signed level slope")}{" "}{localize(number(w.wellFtPerYear,3))}{" "}{tx("ft/year (more negative = lower). Units/quantities are not interchangeable; no conversion from storage to a well decline.")}</p>
 <p>{tx("Omitted selected dates (missing GRACE/quality):")}{" "}{w.omittedSelectedDates.join(', ')||tx('none')}.</p>
 <div style={{overflowX:'auto'}}><table><caption>{tx("All retained 2015–2025 source observations; only selected matched winter dates enter slopes")}</caption><thead><tr><th>{tx("Date")}</th><th>{tx("Native signed ft")}</th><th>{tx("Status")}</th><th>{tx("Agency / method")}</th><th>{tx("Comparison selection")}</th></tr></thead><tbody>{source.observations.map((o,i)=><tr key={`${o.date}-${i}`}><td>{o.date}</td><td>{localize(number(o.reportedSignedFt))}</td><td>{o.status}</td><td>{o.agency} / {o.method}</td><td>{w.pairs.some(p=>p.date===o.date)?tx("paired"):source.selectedAnnualDates.includes(o.date)?tx("missing regional month"):tx("not selected")}</td></tr>)}</tbody></table></div>
 <p><a href={source.detailUrl}>{tx("KGS well site context")}</a> · <a href={source.levelsUrl}>{tx("dated measurements")}</a></p></details>})}</details>
 <details><summary>{tx("Monthly regional storage, uncertainty and gaps")}</summary><div style={{overflowX:'auto'}}><table><caption>{tx("Native unscaled mascon storage anomaly; uncertainty is regional 1-sigma, not per-field error")}</caption><thead><tr><th>{tx("Month")}</th><th>{tx("Anomaly (cm)")}</th><th>1-sigma (cm)</th></tr></thead><tbody>{b.grace.months.map(m=><tr key={m.month}><td>{m.month}</td><td>{localize(number(m.twsCm))}</td><td>{localize(number(m.sigmaCm))}</td></tr>)}</tbody></table></div></details>
 <p><a href="https://podaac.jpl.nasa.gov/dataset/TELLUS_GRAC-GRFO_MASCON_CRI_GRID_RL06.3_V4">{tx("NASA/JPL / PO.DAAC product and citation")}</a> · DOI {b.grace.doi}. {b.grace.attribution}.</p><p><a href={b.kgs.url}>Kansas Geological Survey WIZARD</a> · <a href={b.kgs.disclaimerUrl}>{tx("KGS disclaimer")}</a>{tx(". Local observations are not definitive validation of a mascon. No prediction of the farmer’s own well, pumping or allocation follows.")}</p>
 </>}
 </section>;
}
