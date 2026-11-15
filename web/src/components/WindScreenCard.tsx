// Wind-erosion EXPOSURE screen card (issues #40, #17). A screen, not measured or predicted soil loss.

import { useEffect, useState } from "react";
import type { CropId, PlanResponse, WindScreen } from "../../../src/shared/types";
import { fetchWindScreen } from "../api";
import "./wind.css";

const MONTHS = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pct = (x: number | null) => (x === null ? "n/a" : `${Math.round(x * 100)}%`);

function lastCropOf(plan: PlanResponse): CropId | null {
  const r = plan.request.recentCrops;
  if (r && r.length) return r[r.length - 1] ?? null;
  const ys = [...plan.cropHistory.years].sort((a, b) => a.year - b.year);
  return ys[ys.length - 1]?.crop ?? null;
}

function SeasonChart({ s, threshold }: { s: NonNullable<WindScreen["recentSeason"]>; threshold: number }) {
  const max = Math.max(threshold * 1.6, ...s.ws10mMax.map((v) => v ?? 0));
  const w = 2.5;
  const h = 60;
  const y = (v: number) => h - (v / max) * h;
  return (
    <svg className="wind-chart" viewBox={`0 0 ${s.dates.length * w} ${h}`} preserveAspectRatio="none" role="img" aria-label={`Daily maximum hourly wind, Feb–May ${s.year}`}>
      {s.ws10mMax.map((v, i) =>
        v === null ? (
          <rect key={s.dates[i]} x={i * w} y={0} width={w * 0.8} height={h} className="wind-missing" />
        ) : (
          <rect key={s.dates[i]} x={i * w} y={y(v)} width={w * 0.8} height={h - y(v)} className={v >= threshold ? "wind-hi" : "wind-lo"}>
            <title>{`${s.dates[i]}: ${v} m/s`}</title>
          </rect>
        ),
      )}
      <line x1={0} x2={s.dates.length * w} y1={y(threshold)} y2={y(threshold)} className="wind-threshold" />
    </svg>
  );
}

export function WindScreenCard({ plan }: { plan: PlanResponse }) {
  const [data, setData] = useState<WindScreen | null>(null);
  const [error, setError] = useState<string | null>(null);
  const best = plan.plans[0];
  const rotations = [best, plan.currentPractice].filter((p): p is NonNullable<typeof p> => !!p);
  const key = `${plan.generatedAt}-${rotations.map((r) => r.id).join("|")}`;

  useEffect(() => {
    if (!rotations.length) return;
    const ctrl = new AbortController();
    setData(null);
    setError(null);
    fetchWindScreen(
      {
        lat: plan.location.lat,
        lon: plan.location.lon,
        lastCrop: lastCropOf(plan),
        rotations: rotations.map((r) => ({ label: r.label, years: r.years.map((y) => ({ year: y.year, crop: y.crop, cover: y.cover })) })),
      },
      ctrl.signal,
    )
      .then(setData)
      .catch((e: unknown) => {
        if (!ctrl.signal.aborted) setError(e instanceof Error ? e.message : "Wind screen unavailable");
      });
    return () => ctrl.abort();
  }, [key]);

  if (!rotations.length) return null;
  const thr = data?.rule.thresholdMs ?? 8.04672;
  return (
    <div className="jr-card wind-card">
      <h2 className="jr-h2">Wind-erosion exposure (screen)</h2>
      <p className="wind-lead">
        How often spring winds near your field reach the erosive range, and whether the plan keeps something growing on the soil then. A
        screen, not a measurement or prediction of soil loss; it does not change any score.
      </p>
      {error && <p className="wind-note">Wind screen unavailable: {error}</p>}
      {!data && !error && <p className="wind-note">Loading wind and soil data…</p>}
      {data && (
        <>
          <p className="wind-rule">
            <b>Windy day</b> = NASA POWER daily maximum of hourly wind at 10 m ≥ {thr.toFixed(2)} m/s (18 mph) · months{" "}
            {data.rule.months.map((m) => MONTHS[m]).join("–")} · rule {data.rule.version}
          </p>
          {data.wind ? (
            <table className="wind-table">
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Windy days / valid days</th>
                  <th>Share</th>
                </tr>
              </thead>
              <tbody>
                {data.months.map((m) => (
                  <tr key={m.month}>
                    <td>{MONTHS[m.month]}</td>
                    <td>
                      {m.windyDays} / {m.validDays}
                    </td>
                    <td>{pct(m.share)}</td>
                  </tr>
                ))}
              </tbody>
              <caption>
                {data.baseline ? `${data.baseline.startYear}–${data.baseline.endYear}` : ""} · missing days are left out of the denominator
              </caption>
            </table>
          ) : (
            <p className="wind-note">NASA POWER wind unavailable: windy days unknown (not zero).</p>
          )}
          {data.recentSeason && (
            <figure className="wind-fig">
              <SeasonChart s={data.recentSeason} threshold={thr} />
              <figcaption>
                Feb–May {data.recentSeason.year}: {data.recentSeason.windyDays} of {data.recentSeason.validDays} valid days at or above the line.
              </figcaption>
            </figure>
          )}

          <h3 className="wind-h3">Soil wind erodibility (SSURGO)</h3>
          {data.soil.available ? (
            <>
              <p className="wind-note">
                {data.soil.mapUnitName} (map unit {data.soil.mapUnitKey}, survey {data.soil.surveyArea}
                {data.soil.surveyVersion ? `, version ${data.soil.surveyVersion}` : ""})
              </p>
              <table className="wind-table">
                <thead>
                  <tr>
                    <th>Component</th>
                    <th>Share</th>
                    <th>WEG</th>
                    <th>WEI*</th>
                    <th>Surface texture</th>
                  </tr>
                </thead>
                <tbody>
                  {data.soil.components.map((c) => (
                    <tr key={c.componentKey}>
                      <td>
                        {c.name}
                        {c.major ? " (major)" : ""}
                      </td>
                      <td>{c.pct === null ? "n/a" : `${c.pct}%`}</td>
                      <td>{c.weg ?? "not rated"}</td>
                      <td>{c.wei === null ? "not rated" : c.wei}</td>
                      <td>{c.surfaceTexture ?? "n/a"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="wind-small">
                WEG 1 = most susceptible to blowing … 8 = least (categories, not averaged). *WEI is NRCS's reference index in tons/acre/yr for a
                bare, smooth, unsheltered, non-crusted soil in Garden City, KS climate, not your field's soil loss.
              </p>
            </>
          ) : (
            <p className="wind-note">SSURGO wind erodibility unavailable for this point.</p>
          )}

          <h3 className="wind-h3">Cover in Feb–May, by plan year</h3>
          {data.rotations.map((r) => (
            <div key={r.label} className="wind-rot">
              <p className="wind-rot-label">
                <b>{r.label}</b>
                {r.windyDaysWithoutLivingCover !== null && (
                  <span>
                    {" "}
                    ≈ {r.windyDaysWithoutLivingCover} windy days a year with protection unknown · {r.windyDaysWithLivingCover} with living cover
                  </span>
                )}
              </p>
              <ul>
                {r.years.map((y) => (
                  <li key={`${y.year}-${y.crop}`}>
                    <span className={`wind-state ${y.state}`}>{y.state === "living-cover" ? "Living cover" : "Protection unknown"}</span> {y.year}:{" "}
                    {y.reason}
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <details className="wind-details">
            <summary>Method, sources and limits</summary>
            <p className="wind-small">Threshold: {data.rule.thresholdSource}</p>
            <p className="wind-small">Adaptation: {data.rule.adaptation}</p>
            <p className="wind-small">Months: {data.rule.monthsSource}</p>
            <ul className="wind-small">
              {data.limitations.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
            {data.wind && (
              <p className="wind-small">
                Wind: {data.wind.source}, parameters {data.wind.parameters.map((p) => `${p.id} (${p.units}, ${p.heightM} m, ${p.aggregation})`).join("; ")};
                grid cell {data.wind.grid.lat}, {data.wind.grid.lon} ({data.wind.grid.resolution}); {data.wind.start} to {data.wind.end} ({data.wind.timeStandard});
                missing days WS10M_MAX {data.wind.missingDays.WS10M_MAX}, WS10M {data.wind.missingDays.WS10M}; retrieved {data.wind.retrievedAt.slice(0, 10)}
                {data.wind.apiVersion ? `, POWER API ${data.wind.apiVersion}` : ""}.{" "}
                <a href={data.wind.requestUrl} target="_blank" rel="noreferrer">
                  Request
                </a>
              </p>
            )}
            <p className="wind-small">
              Soil: {data.soil.source}
              {data.soil.retrievedAt ? `, retrieved ${data.soil.retrievedAt.slice(0, 10)}` : ""}.
            </p>
          </details>
        </>
      )}
    </div>
  );
}
