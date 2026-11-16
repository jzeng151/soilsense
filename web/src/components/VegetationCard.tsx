import { useI18n } from "../i18n";
import { useEffect, useState } from "react";
import type { ModisVegetation, PlanResponse } from "../../../src/shared/types";
import { fetchVegetation } from "../api";

export function VegetationCard({ plan }: { plan: PlanResponse }) {
  const { t: tx, text: localize } = useI18n();
  const [data, setData] = useState<ModisVegetation | null>(null);
  const [error, setError] = useState(false);
  const { lat, lon } = plan.location;
  const year = plan.climate.lastYear;
  useEffect(() => {
    const ctrl = new AbortController(); setData(null); setError(false);
    fetchVegetation(lat, lon, year, ctrl.signal).then(setData).catch(() => { if (!ctrl.signal.aborted) setError(true); });
    return () => ctrl.abort();
  }, [lat, lon, year]);
  return <section className="jr-card" style={{ minWidth: 0, overflowWrap: "anywhere" }} aria-label={tx("Historical vegetation evidence")}>
    <h2 className="jr-h2">{tx("Vegetation evidence · MODIS")}</h2>
    <p>{tx("Historical coarse/composite point pixel, not field measurements or a prediction for any proposed rotation. Low NDVI does not establish bare soil.")}</p>
    {!data && <p role="status">{error ? tx("Vegetation unavailable; observations remain unknown.") : tx("Loading MODIS observations…")}</p>}
    {data && <>
      <p>{year}: {data.validCount}{" "}{tx("of")}{" "}{data.expectedCount}{" "}{tx("expected composites pass strict QA (")}{localize(data.status)}{tx("). Field-area coverage unknown.")}</p>
      {data.validCount > 0 && <figure style={{ margin: "1rem 0" }}>
        <svg viewBox="0 0 320 120" role="img" aria-label={tx("NDVI {year}, range minus 0.2 to 1; {count} valid composites. Exact dates, values and gaps in the table below.", { year, count: data.validCount })} style={{ display: "block", width: "100%", height: "auto" }}>
          <line x1="28" x2="310" y1="90" y2="90" stroke="currentColor" opacity="0.3" />
          <text x="0" y="17" fontSize="10">1.0</text><text x="0" y="93" fontSize="10">0</text><text x="0" y="110" fontSize="10">−0.2</text>
          {data.observations.map((p, i) => p.ndvi === null ? null : <circle key={p.modisDate} cx={28 + i / 22 * 282} cy={90 - p.ndvi * 75} r="3" fill="currentColor"><title>{p.compositeStart}: {p.ndvi.toFixed(4)}</title></circle>)}
          <text x="28" y="120" fontSize="10">{tx("Jan")}</text><text x="290" y="120" fontSize="10">{tx("Dec")}</text>
        </svg>
        <figcaption>{tx("NDVI (dimensionless), 250 m nominal, 16-day composites. Dots only: gaps are not interpolated.")}</figcaption>
      </figure>}
      <details><summary>{tx("Dates, QA, sources and limits")}</summary>
        <p>{localize(data.note)}</p>
        <p>{data.product}{" "}{tx("collection")}{" "}{data.version} · {data.resolution} · {data.interval}{tx(". NDVI scale")}{" "}{data.scale}{tx(", applied once. Accept only reliability 0 and good land QA without adjacent/mixed cloud, snow or shadow. Marginal observations excluded.")}</p>
        <p>{data.attribution}{" "}{tx("Retrieved:")}{" "}{data.retrievedAt ?? tx("no successful retrieval")}.</p>
        <p><a href={data.docsUrl}>{tx("Product QA guide")}</a></p>
        <ul>{data.requestUrls.map(u => <li key={u}><a href={u}>{u.includes("/dates?") ? tx("Available composite dates") : tx("Subset request")}</a></li>)}</ul>
        <table style={{ width: "100%", fontSize: ".8rem", tableLayout: "fixed" }}>
          <caption>{tx("Single-pixel coverage per composite; unknown is not zero.")}</caption>
          <thead><tr><th>{tx("Composite start")}</th><th>{tx("Observed")}</th><th>NDVI</th><th>{tx("QA rank")}</th></tr></thead>
          <tbody>{data.observations.map(p => <tr key={p.modisDate}><td>{p.compositeStart}</td><td>{p.observationDate ?? tx("unknown")}</td><td>{p.ndvi === null ? tx("unknown") : p.ndvi.toFixed(4)}</td><td>{p.reliability ?? tx("missing")}</td></tr>)}</tbody>
        </table>
      </details>
    </>}
  </section>;
}
