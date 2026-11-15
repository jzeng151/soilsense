import { translate, translateKnown, useI18n, type Language } from "../i18n";
import type { PlanResponse } from "../../../src/shared/types";
import { evidenceForPlan } from "../../../src/engine/dataEvidence";
import "./mvp-evidence.css";

/** Exact client-generated provenance templates; source/product names and credits never pass here. */
export function evidenceText(value: string, language: Language): string {
  const potential = /^Yield potential uses approximate ([A-Z]{2}|Iowa) state values \(add a USDA NASS API key for county averages\)\.$/.exec(value);
  if (potential) return translate(language, "Yield potential uses approximate {state} state values (add a USDA NASS API key for county averages).", { state: potential[1]! });
  const rain = /^This area averages about (\d+) inches of rain a year; fallow was (not )?considered\.$/.exec(value);
  if (rain) return translate(language, rain[2] ? "This area averages about {rain} inches of rain a year; fallow was not considered." : "This area averages about {rain} inches of rain a year; fallow was considered.", { rain: rain[1]! });
  const ensemble = /^Average of NASA POWER \(50 km\) and NASA Daymet \(1 km\) daily rain and temperature, (\d{4}–\d{4}); root-zone soil wetness from NASA POWER$/.exec(value);
  if (ensemble) return translate(language, "Average of NASA POWER (50 km) and NASA Daymet (1 km) daily rain and temperature, {years}; root-zone soil wetness from NASA POWER", { years: ensemble[1]! });
  const retained = /^(\d{4}–\d{4}) \(retained climate years\)$/.exec(value);
  if (retained) return translate(language, "{years} (retained climate years)", { years: retained[1]! });
  const requested = /^(\d{4}–\d{4}) requested; actual coverage unknown$/.exec(value);
  if (requested) return translate(language, "{years} requested; actual coverage unknown", { years: requested[1]! });
  const daily = /^(\d+) \/ (\d+) required daily rain\/max\/min values; incomplete years excluded from replay$/.exec(value);
  if (daily) return translate(language, "{valid} / {expected} required daily rain/max/min values; incomplete years excluded from replay", { valid: daily[1]!, expected: daily[2]! });
  const crops = /^(\d+) annual classifications; expected coverage unknown$/.exec(value);
  if (crops) return translate(language, "{count} annual classifications; expected coverage unknown", { count: crops[1]! });
  return translateKnown(language, value);
}

export function DecisionNotice() {
  const { t } = useI18n();
  return <p className="decision-notice" role="note">{t("Decision notice")}</p>;
}

export function DataEvidence({ plan }: { plan: PlanResponse }) {
  const { t: tx, language } = useI18n();
  const localize = (value: string) => evidenceText(value, language);
  return <section className="jr-card data-evidence" aria-label={tx("Evidence and limitations")}>
    <h2 className="jr-h2">{tx("Evidence and limitations")}</h2>
    <DecisionNotice />
    <p>{tx("Weather evidence:")}{" "}{plan.climate.firstYear}–{plan.climate.lastYear}. {localize(plan.climate.source)}{tx(". Regional grids are not measurements from an individual field.")}</p>
    <details>
      <summary>{tx("Data status — sources, dates and completeness")}</summary>
      <p>{tx("Status rule: unavailable means no returned evidence; incomplete includes unknown coverage or any missing required values. Historical-cached means complete historical data reused from cache, not current conditions. Current observations are stale only when older than that product’s stated maximum age. Unknown metadata stays unknown. Retrieval date is never substituted for observation date.")}</p>
      <div className="data-table-scroll" role="region" aria-label={tx("Source status table")} tabIndex={0}>
        <table>
          <caption>{tx("Source provenance. Unknown coverage does not mean complete.")}</caption>
          <thead><tr><th scope="col">{tx("Source / product / version")}</th><th scope="col">{tx("Observation period / support")}</th><th scope="col">{tx("Retrieval / status")}</th></tr></thead>
          <tbody>{evidenceForPlan(plan).map((row) => <tr key={row.name}>
            <th scope="row"><a href={row.url} target="_blank" rel="noreferrer">{row.name}</a><p>{row.product}<br />{tx("Version:")}{" "}{row.version ?? tx("unknown")}</p></th>
            <td>{row.period ? localize(row.period) : tx("unknown")}<p>{localize(row.resolution)}</p><details><summary>{tx("Method, units and attribution")}</summary><p>{localize(row.method)}</p><p>{tx("Time convention:")}{" "}{localize(row.timeConvention)}</p><p>{localize(row.units)}</p><p>{tx("Attribution:")}{" "}{row.attribution}{tx(". License:")}{" "}{row.license ?? tx("unknown")}.</p></details></td>
            <td>{tx("Retrieved:")}{" "}{row.retrievedAt ?? tx("unknown")}<p><strong>{tx("Status:")}{" "}{localize(row.status)}</strong></p><p>{localize(row.coverage)}</p></td>
          </tr>)}</tbody>
        </table>
      </div>
    </details>
    <details><summary>{tx("Evidence quality — observations and missing data")}</summary><ul>{evidenceForPlan(plan).filter(row => row.status === "incomplete" || row.status === "unavailable").map(row => <li key={row.name}>{row.name}: {localize(row.status)}. {localize(row.coverage)}.</li>)}<li>{tx("Unknown retrieval dates and product versions are not evidence of fresh or complete observations.")}</li></ul></details>
    <details><summary>{tx("Local applicability — assumptions to review")}</summary>
      <p>{tx("Reference calendars are assumptions, not observed field phenology. Regional grids, soil survey map units and county harvests cannot establish field-specific performance. Kansas pest evidence may not transfer to other regions.")}</p>
      <ul>{plan.assumptions.map((reason) => <li key={reason}>{localize(reason)}</li>)}</ul>
    </details>
  </section>;
}
