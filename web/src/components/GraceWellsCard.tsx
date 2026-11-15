import { useEffect, useState } from 'react';
import type { PlanResponse } from '../../../src/shared/types';
import type { GroundwaterResult } from '../../../src/shared/groundwater';
const number=(v:number|null,n=2)=>v===null?'missing':v.toFixed(n);
export function GraceWellsCard({plan}:{plan:PlanResponse}) {
 const [data,setData]=useState<GroundwaterResult|null>(null),[error,setError]=useState(false);
 const {lat,lon}=plan.request;
 useEffect(()=>{const c=new AbortController();setData(null);setError(false);fetch(`/api/groundwater?lat=${lat}&lon=${lon}`,{signal:c.signal}).then(r=>{if(!r.ok)throw new Error();return r.json() as Promise<GroundwaterResult>}).then(setData).catch(()=>{if(!c.signal.aborted)setError(true)});return ()=>c.abort();},[lat,lon]);
 const b=data?.bundle,comparison=data?.comparison;
 return <section className="jr-card" style={{minWidth:0,overflowWrap:'anywhere'}} aria-label="Regional GRACE and Kansas well observations"><h2 className="jr-h2">Regional water storage & nearby Kansas wells</h2>
 <p>GRACE measures total terrestrial water storage across a broad region, not an individual aquifer, well or field. Groundwater, soil moisture, surface water and snow can contribute. These observations do not change crop rankings or Field Watch status.</p>
 <p aria-live="polite">{error?'Regional water evidence unavailable; no decline or stability is inferred.':data?.note??'Loading regional water evidence…'}</p>
 {b&&comparison&&<>
 <p><strong>NASA/JPL GRACE/GRACE-FO {b.grace.version}</strong> · mascon {b.grace.masconId} · {b.grace.support}. Native grid-cell center {b.grace.representativeGridCenter.lat}, {b.grace.representativeGridCenter.lon} identifies a regional estimate, not the selected field.</p>
 <p>2004–2009 time-mean baseline ({b.grace.baseline}); cm equivalent water thickness anomaly. Display period January 2015–December 2025. {b.grace.months.filter(m=>m.twsCm===null).length} missing months, including the inter-mission gap, remain gaps. Source coverage {b.grace.sourceCoverage.join(' to ')}. Retrieved {b.retrievedAt}.</p>
 <p>{b.grace.processing}</p><p role={comparison.disagreement?'note':undefined}><strong>{comparison.disagreement?'Disagreement — investigate, not a crop verdict.':'Scale and interpretation limitation.'}</strong> {comparison.note}</p>
 <details><summary>Matched-period trend comparison and dated well records</summary><p>{comparison.method}</p><p>{b.kgs.selection}</p><p>{b.kgs.signConvention}</p><p>{b.kgs.quality}</p>
 {comparison.wells.map(w=>{const source=b.kgs.wells.find(s=>s.id===w.id)!;return <details key={w.id}><summary>Well {w.id}: {w.wellDirection}; regional storage {w.graceDirection} · {w.agreement}</summary>
 <p>{source.county} County; {source.lat}, {source.lon}; {source.distanceKm} km from demo. Geological unit codes (as supplied): {source.geologicalUnitCodes??'not supplied'}. Screened interval not supplied; well depth {number(source.wellDepthFt)} ft. {source.siteUse}; {source.waterUse}. Well ID preserved as supplied, not used to derive coordinates.</p>
 <p>Matched months {w.period?.join(' to ')??'insufficient'} ({w.pairs.length} pairs). GRACE slope {number(w.graceCmPerYear,3)} cm/year; well signed level slope {number(w.wellFtPerYear,3)} ft/year (more negative = lower). Units/quantities are not interchangeable; no conversion from storage to a well decline.</p>
 <p>Omitted selected dates (missing GRACE/quality): {w.omittedSelectedDates.join(', ')||'none'}.</p>
 <div style={{overflowX:'auto'}}><table><caption>All retained 2015–2025 source observations; only selected matched winter dates enter slopes</caption><thead><tr><th>Date</th><th>Native signed ft</th><th>Status</th><th>Agency / method</th><th>Comparison selection</th></tr></thead><tbody>{source.observations.map((o,i)=><tr key={`${o.date}-${i}`}><td>{o.date}</td><td>{number(o.reportedSignedFt)}</td><td>{o.status}</td><td>{o.agency} / {o.method}</td><td>{w.pairs.some(p=>p.date===o.date)?'paired':source.selectedAnnualDates.includes(o.date)?'missing regional month':'not selected'}</td></tr>)}</tbody></table></div>
 <p><a href={source.detailUrl}>KGS well site context</a> · <a href={source.levelsUrl}>dated measurements</a></p></details>})}</details>
 <details><summary>Monthly regional storage, uncertainty and gaps</summary><div style={{overflowX:'auto'}}><table><caption>Native unscaled mascon storage anomaly; uncertainty is regional 1-sigma, not per-field error</caption><thead><tr><th>Month</th><th>Anomaly (cm)</th><th>1-sigma (cm)</th></tr></thead><tbody>{b.grace.months.map(m=><tr key={m.month}><td>{m.month}</td><td>{number(m.twsCm)}</td><td>{number(m.sigmaCm)}</td></tr>)}</tbody></table></div></details>
 <p><a href="https://podaac.jpl.nasa.gov/dataset/TELLUS_GRAC-GRFO_MASCON_CRI_GRID_RL06.3_V4">NASA/JPL / PO.DAAC product and citation</a> · DOI {b.grace.doi}. {b.grace.attribution}.</p><p><a href={b.kgs.url}>Kansas Geological Survey WIZARD</a> · <a href={b.kgs.disclaimerUrl}>KGS disclaimer</a>. Local observations are not definitive validation of a mascon. No prediction of the farmer’s own well, pumping or allocation follows.</p>
 </>}
 </section>;
}
