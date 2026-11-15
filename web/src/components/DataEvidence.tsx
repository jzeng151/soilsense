import { useI18n } from "../i18n";
import type { PlanResponse } from "../../../src/shared/types";
import { evidenceForPlan, evidenceQuality } from "../../../src/engine/dataEvidence";
import "./mvp-evidence.css";

export function DecisionNotice() {
  const { t } = useI18n();
  return <p className="decision-notice" role="note">{t("Decision notice")}</p>;
}

export function DataEvidence({ plan }: { plan: PlanResponse }) {
  return <section className="jr-card data-evidence" aria-label="Evidence and limitations">
    <h2 className="jr-h2">Evidence and limitations</h2>
    <DecisionNotice />
    <p>Weather evidence: {plan.climate.firstYear}–{plan.climate.lastYear}. {plan.climate.source}. Regional grids are not measurements from an individual field.</p>
    <details>
      <summary>Data status — sources, dates and completeness</summary>
      <p>Status rule: unavailable means no returned evidence; incomplete includes unknown coverage or any missing required values. Historical-cached means complete historical data reused from cache, not current conditions. Current observations are stale only when older than that product’s stated maximum age. Unknown metadata stays unknown. Retrieval date is never substituted for observation date.</p>
      <div className="data-table-scroll" role="region" aria-label="Source status table" tabIndex={0}>
        <table>
          <caption>Source provenance. Unknown coverage does not mean complete.</caption>
          <thead><tr><th scope="col">Source / product / version</th><th scope="col">Observation period / support</th><th scope="col">Retrieval / status</th></tr></thead>
          <tbody>{evidenceForPlan(plan).map((row) => <tr key={row.name}>
            <th scope="row"><a href={row.url} target="_blank" rel="noreferrer">{row.name}</a><p>{row.product}<br />Version: {row.version ?? "unknown"}</p></th>
            <td>{row.period ?? "unknown"}<p>{row.resolution}</p><details><summary>Method, units and attribution</summary><p>{row.method}</p><p>Time convention: {row.timeConvention}</p><p>{row.units}</p><p>Attribution: {row.attribution}. License: {row.license ?? "unknown"}.</p></details></td>
            <td>Retrieved: {row.retrievedAt ?? "unknown"}<p><strong>Status: {row.status}</strong></p><p>{row.coverage}</p></td>
          </tr>)}</tbody>
        </table>
      </div>
    </details>
    <details><summary>Evidence quality — observations and missing data</summary><ul>{evidenceQuality(plan).map((reason) => <li key={reason}>{reason}</li>)}</ul></details>
    <details><summary>Local applicability — assumptions to review</summary>
      <p>Reference calendars are assumptions, not observed field phenology. Regional grids, soil survey map units and county harvests cannot establish field-specific performance. Kansas pest evidence may not transfer to other regions.</p>
      <ul>{plan.assumptions.map((reason) => <li key={reason}>{reason}</li>)}</ul>
    </details>
  </section>;
}
