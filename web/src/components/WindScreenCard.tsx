import { cropName, rotationText, translate, useI18n, type Language } from "../i18n";
// Wind-erosion EXPOSURE screen card (issues #40, #17). A screen, not measured or predicted soil loss.

import { useEffect, useState } from "react";
import type { CoverId, CropId, PlanResponse, WindScreen, WindRotationYear } from "../../../src/shared/types";
import { protectionFor } from "../../../src/engine/windErosion";
import { CROPS } from "../../../src/engine/crops";
import { fetchWindScreen } from "../api";
import "./wind.css";

const MONTHS = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pct = (x: number | null) => (x === null ? "n/a" : `${Math.round(x * 100)}%`);

/** Only the current deterministic rules are translated; unfamiliar provider explanations survive intact. */
export function windReason(y: WindRotationYear, prev: CropId | null, cover: CoverId | null, language: Language): string {
  if (language === "en" || y.reason !== protectionFor(y.crop, prev, cover).reason) return y.reason;
  const crop = cropName(y.crop, language);
  const def = CROPS[y.crop];
  if (def.fallSeeded) return translate(language, "{crop} is sown the fall before and grows through spring (stand density unknown).", { crop });
  if (def.perennial && prev === y.crop) return translate(language, "Established {crop} stand from the year before (regrowth timing unknown).", { crop: crop.toLowerCase() });
  if (cover && cover !== "none") return translate(language, "Cover crop seeded after the previous harvest, growing until it is ended before planting (termination date not modeled).");
  const previous = prev ? translate(language, "after {crop}", { crop: cropName(prev, language).toLowerCase() }) : translate(language, "previous crop unknown");
  if (y.crop === "fallow") return translate(language, "Fallow season ({previous}): stubble cover depends on tillage, unknown.", { previous });
  if (def.perennial) return translate(language, "{crop} seeding year: little cover until the stand establishes (seeding date not modeled).", { crop });
  return translate(language, "{crop} is planted in spring, so no crop canopy in Feb–May; residue {previous} depends on tillage, unknown.", { crop, previous });
}

function lastCropOf(plan: PlanResponse): CropId | null {
  const r = plan.request.recentCrops;
  if (r && r.length) return r[r.length - 1] ?? null;
  const ys = [...plan.cropHistory.years].sort((a, b) => a.year - b.year);
  return ys[ys.length - 1]?.crop ?? null;
}

function SeasonChart({ s, threshold }: { s: NonNullable<WindScreen["recentSeason"]>; threshold: number }) {
  const { t: tx } = useI18n();
  const max = Math.max(threshold * 1.6, ...s.ws10mMax.map((v) => v ?? 0));
  const w = 2.5;
  const h = 60;
  const y = (v: number) => h - (v / max) * h;
  return (
    <svg className="wind-chart" viewBox={`0 0 ${s.dates.length * w} ${h}`} preserveAspectRatio="none" role="img" aria-label={tx("Daily maximum hourly wind, Feb–May {year}", { year: s.year })}>
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
  const { t: tx, text: localize, language } = useI18n();
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
      <h2 className="jr-h2">{tx("Wind-erosion exposure (screen)")}</h2>
      <p className="wind-lead">{tx("How often spring winds near your field reach the erosive range, and whether the plan keeps something growing on the soil then. A screen, not a measurement or prediction of soil loss; it does not change any score.")}</p>
      {error && <p className="wind-note">{tx("Wind screen unavailable:")}{" "}{localize(error)}</p>}
      {!data && !error && <p className="wind-note">{tx("Loading wind and soil data…")}</p>}
      {data && (
        <>
          <p className="wind-rule">
            <b>{tx("Windy day")}</b>{" "}{tx("= NASA POWER daily maximum of hourly wind at 10 m ≥")}{" "}{thr.toFixed(2)}{" "}{tx("m/s (18 mph) · months")}{" "}
            {data.rule.months.map((m) => localize(MONTHS[m] ?? "")).join("–")}{" "}{tx("· rule")}{" "}{data.rule.version}
          </p>
          {data.wind ? (
            <table className="wind-table">
              <thead>
                <tr>
                  <th>{tx("Month")}</th>
                  <th>{tx("Windy days / valid days")}</th>
                  <th>{tx("Share")}</th>
                </tr>
              </thead>
              <tbody>
                {data.months.map((m) => (
                  <tr key={m.month}>
                    <td>{localize(MONTHS[m.month])}</td>
                    <td>
                      {m.windyDays} / {m.validDays}
                    </td>
                    <td>{localize(pct(m.share))}</td>
                  </tr>
                ))}
              </tbody>
              <caption>
                {data.baseline ? `${data.baseline.startYear}–${data.baseline.endYear}` : ""}{" "}{tx("· missing days are left out of the denominator")}</caption>
            </table>
          ) : (
            <p className="wind-note">{tx("NASA POWER wind unavailable: windy days unknown (not zero).")}</p>
          )}
          {data.recentSeason && (
            <figure className="wind-fig">
              <SeasonChart s={data.recentSeason} threshold={thr} />
              <figcaption>{tx("Feb–May")}{" "}{data.recentSeason.year}: {data.recentSeason.windyDays}{" "}{tx("of")}{" "}{data.recentSeason.validDays}{" "}{tx("valid days at or above the line.")}</figcaption>
            </figure>
          )}

          <h3 className="wind-h3">{tx("Soil wind erodibility (SSURGO)")}</h3>
          {data.soil.available ? (
            <>
              <p className="wind-note">
                {data.soil.mapUnitName}{" "}{tx("(map unit")}{" "}{data.soil.mapUnitKey}{tx(", survey")}{" "}{data.soil.surveyArea}
                {data.soil.surveyVersion ? `, version ${data.soil.surveyVersion}` : ""})
              </p>
              <table className="wind-table">
                <thead>
                  <tr>
                    <th>{tx("Component")}</th>
                    <th>{tx("Share")}</th>
                    <th>WEG</th>
                    <th>WEI*</th>
                    <th>{tx("Surface texture")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.soil.components.map((c) => (
                    <tr key={c.componentKey}>
                      <td>
                        {c.name}
                        {c.major ? tx(" (major)") : ""}
                      </td>
                      <td>{c.pct === null ? tx("n/a") : `${c.pct}%`}</td>
                      <td>{c.weg ?? tx("not rated")}</td>
                      <td>{c.wei === null ? tx("not rated") : c.wei}</td>
                      <td>{c.surfaceTexture ?? tx("n/a")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="wind-small">{tx("WEG 1 = most susceptible to blowing … 8 = least (categories, not averaged). *WEI is NRCS's reference index in tons/acre/yr for a bare, smooth, unsheltered, non-crusted soil in Garden City, KS climate, not your field's soil loss.")}</p>
            </>
          ) : (
            <p className="wind-note">{tx("SSURGO wind erodibility unavailable for this point.")}</p>
          )}

          <h3 className="wind-h3">{tx("Cover in Feb–May, by plan year")}</h3>
          {data.rotations.map((r) => (
            <div key={r.label} className="wind-rot">
              <p className="wind-rot-label">
                <b>{rotationText(r.label, language)}</b>
                {r.windyDaysWithoutLivingCover !== null && (
                  <span>
                    {" "}
                    ≈ {r.windyDaysWithoutLivingCover}{" "}{tx("windy days a year with protection unknown ·")}{" "}{r.windyDaysWithLivingCover}{" "}{tx("with living cover")}</span>
                )}
              </p>
              <ul>
                {r.years.map((y, i) => (
                  <li key={`${y.year}-${y.crop}`}>
                    <span className={`wind-state ${y.state}`}>{y.state === "living-cover" ? tx("Living cover") : tx("Protection unknown")}</span> {y.year}:{" "}
                    {windReason(y, i ? r.years[i - 1]!.crop : lastCropOf(plan), i ? rotations.find(p => p.label === r.label)?.years[i - 1]?.cover ?? null : null, language)}
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <details className="wind-details">
            <summary>{tx("Method, sources and limits")}</summary>
            <p className="wind-small">{tx("Threshold:")}{" "}{localize(data.rule.thresholdSource)}</p>
            <p className="wind-small">{tx("Adaptation:")}{" "}{localize(data.rule.adaptation)}</p>
            <p className="wind-small">{tx("Months:")}{" "}{localize(data.rule.monthsSource)}</p>
            <ul className="wind-small">
              {data.limitations.map((l) => (
                <li key={l}>{localize(l)}</li>
              ))}
            </ul>
            {data.wind && (
              <p className="wind-small">{tx("Wind:")}{" "}{data.wind.source}{tx(", parameters")}{" "}{data.wind.parameters.map((p) => `${p.id} (${p.units}, ${p.heightM} m, ${localize(p.aggregation)})`).join("; ")}{tx("; grid cell")}{" "}{data.wind.grid.lat}, {data.wind.grid.lon} ({localize(data.wind.grid.resolution)}); {data.wind.start}{" "}{tx("to")}{" "}{data.wind.end} ({data.wind.timeStandard}{tx("); missing days WS10M_MAX")}{" "}{data.wind.missingDays.WS10M_MAX}, WS10M {data.wind.missingDays.WS10M}{tx("; retrieved")}{" "}{data.wind.retrievedAt.slice(0, 10)}
                {data.wind.apiVersion ? `, POWER API ${data.wind.apiVersion}` : ""}.{" "}
                <a href={data.wind.requestUrl} target="_blank" rel="noreferrer">{tx("Request")}</a>
              </p>
            )}
            <p className="wind-small">{tx("Soil:")}{" "}{data.soil.source}
              {data.soil.retrievedAt ? `, retrieved ${data.soil.retrievedAt.slice(0, 10)}` : ""}.
            </p>
          </details>
        </>
      )}
    </div>
  );
}
