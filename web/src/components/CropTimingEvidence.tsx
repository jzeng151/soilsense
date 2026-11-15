import { useState } from "react";
import type { estimateCornTiming } from "../../../src/engine/cropTiming";
type Result = { timing: ReturnType<typeof estimateCornTiming>; weather: { snapshotId: string; source: { url: string; nativeResolution: string; apiVersion: string }; retrievedAt: string }; nassComparison: { status: string; reason: string; interpretation: string; source?: { urls: string[]; retrievedAt: string }; seasons: { year: number; geography: string; geographyName: string | null; fallbackReason: string | null; lower: { date: string; percent: number } | null; upper: { date: string; percent: number } | null; status: string; gapDays: number | null; estimatedSilking: string | null; modelMinusSurveyDays: number[] | null; discrepancy: string; reports: { date: string; percent: number }[] }[] } };
export function CropTimingEvidence({ lat, lon }: { lat: number; lon: number }) {
  const [year, setYear] = useState(2025), [planting, setPlanting] = useState("05-01");
  const [result, setResult] = useState<Result | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  async function load() { setBusy(true); setResult(null); setError(""); try { const r = await fetch(`/api/crop-timing?lat=${lat}&lon=${lon}&year=${year}&planting=${year}-${planting}`); if (!r.ok) throw new Error("Timing unavailable; check date or retry the source."); setResult(await r.json()); } catch(e) { setError(String(e)); } finally { setBusy(false); } }
  const t = result?.timing;
  return <details className="jr-more"><summary>Estimated corn-stage timing (historical sensitivity)</summary>
    <p>Not observed stages, forecasts or a change to your saved plan. Assumed 110-day hybrid; planting day included. Sorghum unsupported; winter wheat retains its reference calendar.</p>
    <label>Completed year <input type="number" min="1991" max={new Date().getFullYear()-1} value={year} onChange={e => { setYear(Number(e.target.value)); setResult(null); }} /></label>
    <label>Assumed planting (MM-DD) <input value={planting} onChange={e => { setPlanting(e.target.value); setResult(null); }} /></label>
    <button type="button" disabled={busy} onClick={load}>{busy ? "Loading…" : "Compare timing"}</button>{error && <p role="status">{error}</p>}
    {t && result && <div><p>{t.status}: emergence {t.emergenceRange.join(" to ")}; silking {t.silking ?? "unavailable / not reached"}; maturity {t.physiologicalMaturity ?? "unavailable / not reached"}. Temperature gaps: {t.missingTemperatureDates.length}.</p>
      <p>Base 50°F; Tmax cap 86°F; Tmin floor 50°F; negative totals zero. Silking 1,500°F-days; maturity 2,670°F-days. GDD Celsius units = Fahrenheit degree days / 1.8.</p>
      <table><caption>Weather exposure, not a yield adjustment</caption><thead><tr><th>Window</th><th>Dates</th><th>Heat °C-days &gt;30°C</th><th>Rain mm</th></tr></thead><tbody>{[t.fixed, t.estimated].map((w,i) => <tr key={i}><th>{i ? "Estimated" : "Fixed reference"}</th><td>{w ? `${w.start}–${w.end}` : "unavailable"}</td><td>{w?.heatDegreeDaysAbove30C?.toFixed(1) ?? "missing"}</td><td>{w?.rainMm?.toFixed(1) ?? "missing"}</td></tr>)}</tbody></table>
      <p>{t.windowNote}</p><p>NASS {result.nassComparison.status}: {result.nassComparison.reason}. {result.nassComparison.interpretation}</p>
      {result.nassComparison.seasons.map(s => <details key={s.year}><summary>{s.year}: {s.geographyName} {s.geography}; estimated silking {s.estimatedSilking ?? "unavailable"}; survey 50% bracket {s.lower?.date ?? "unknown"} to {s.upper?.date ?? "unknown"}</summary><p>{s.status}; interval {s.gapDays ?? "unknown"} days. Model minus survey interval: {s.modelMinusSurveyDays?.join(" to ") ?? "unknown"} days. {s.fallbackReason} {s.discrepancy}</p><table><caption>NASS weekly regional cumulative silking survey</caption><thead><tr><th>Week ending</th><th>Acreage at/beyond silking (%)</th></tr></thead><tbody>{s.reports.map(r => <tr key={r.date}><td>{r.date}</td><td>{r.percent}</td></tr>)}</tbody></table></details>)}
      {result.nassComparison.source && <p>NASS retrieved {result.nassComparison.source.retrievedAt}; {result.nassComparison.source.urls.map((url,i) => <a key={url} href={url}>Query {i+1} (key omitted) </a>)}</p>}
      <p><a href={t.model.source}>K-State, June 18 2026</a> · <a href={result.weather.source.url}>NASA POWER API {result.weather.source.apiVersion}</a> · LST · {result.weather.source.nativeResolution} · retrieved {result.weather.retrievedAt} · snapshot {result.weather.snapshotId}</p>
    </div>}
  </details>;
}
