import { useEffect, useRef, useState } from "react";
import type { HlsEvidence } from "../../../src/worker/data/hls";
import { useI18n } from "../i18n";

/** Read-only evidence: no plan, Field Watch or browser scenario writes. */
export function HlsEvidenceCard({ lat, lon }: { lat: number; lon: number }) {
  const { t, text } = useI18n();
  const [data, setData] = useState<HlsEvidence | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => {
    setData(null); setError(false); setBusy(false);
    return () => { request.current?.abort(); };
  }, [lat, lon]);
  async function load() {
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    setBusy(true); setError(false); setData(null);
    try {
      const response = await fetch(`/api/hls?lat=${lat}&lon=${lon}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) });
      if (!response.ok) throw new Error("HLS unavailable");
      const result = await response.json() as HlsEvidence;
      if (!controller.signal.aborted) setData(result);
    } catch { if (!controller.signal.aborted) setError(true); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }
  const rows = data?.field?.observations.slice().sort((a, b) => a.datetime.localeCompare(b.datetime)) ?? [];
  const tableStyle = { overflowX: "auto" as const, maxWidth: "100%" };
  return <details className="jr-more hls-evidence" style={{ minWidth: 0, overflowWrap: "anywhere" }}>
    <summary>{t("HLS vegetation: historical 30 m point-window sample")}</summary>
    <p>{t("Offline NASA LP DAAC HLSL30/HLSS30 v2.0, July 2025. Separate from coarse MODIS composites. Two selected scenes, not daily observations or a complete growing-season series. Field-boundary coverage is unknown.")}</p>
    <button type="button" disabled={busy} onClick={load}>{busy ? t("Loading HLS sample…") : t("Load HLS sample")}</button>
    <p role="status" aria-live="polite">{busy ? t("Loading HLS sample…") : error ? t("HLS snapshot unavailable; no vegetation inferred.") : data ? data.status === "available" ? t("HLS sample loaded.") : text(data.reason) : ""}</p>
    {data && <>
      <p>{text(data.status)}: {text(data.reason)}</p>
      {data.source && <p>{text(data.source.selection)}. {t("Reflectance scale {scale}, offset 0. Cloud, adjacency, shadow, snow, water, high aerosol and invalid reflectance excluded. Retrieved {date}.", { scale: data.source.scale, date: data.source.retrievedAt })} <a href={data.source.guide}>{t("HLS v2 user guide")}</a></p>}
      {rows.length > 0 && <>
        <svg viewBox="0 0 320 140" role="img" aria-label={t("Selected historical HLS NDVI observations; exact dates and values in following table")} style={{ width: "100%", maxWidth: 400 }}>
          <line x1="20" y1="120" x2="300" y2="120" stroke="currentColor" />
          {rows.map((o, i) => o.meanNdvi === null ? null : <circle key={o.id} cx={70 + i * 180} cy={120 - (o.meanNdvi + 1) * 50} r="5" fill="currentColor"><title>{o.datetime}: {o.meanNdvi.toFixed(4)}</title></circle>)}
        </svg>
        <div style={tableStyle} role="region" tabIndex={0} aria-label={t("Selected actual observations, no interpolation (NDVI unitless)")}><table>
          <caption>{t("Selected actual observations, no interpolation (NDVI unitless)")}</caption>
          <thead><tr>{[t("UTC observation"), t("Sensor"), t("Mean NDVI"), t("Clear valid window pixels")].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead>
          <tbody>{rows.map(o => <tr key={o.id}><th scope="row">{o.datetime}</th><td>{o.collection}</td><td>{o.meanNdvi?.toFixed(4) ?? t("unknown")}</td><td>{o.clearShare === null ? t("unknown") : `${o.clearPixelCount}/9 (${(o.clearShare * 100).toFixed(1)}%)`}</td></tr>)}</tbody>
        </table></div>
        {rows.map(o => <details key={o.id}>
          <summary>{o.id}: {t("source pixels and retained reflectance")}</summary>
          <p>{text(o.status)}. {t("Red/NIR/SWIR1/SWIR2: {bands}. Native 30 m, mixed-pixel limitations; 3×3 sample, not the field.", { bands: o.bands.slice(0, 4).join(" / ") })}</p>
          <div style={tableStyle} role="region" tabIndex={0} aria-label={t("Row-major 3×3 window; reflectance retained even for masked pixels, not valid evidence until QA passes")}><table>
            <caption>{t("Row-major 3×3 window; reflectance retained even for masked pixels, not valid evidence until QA passes")}</caption>
            <thead><tr>{[t("Pixel"), "Fmask", t("Reflectance (red/NIR/SWIR1/SWIR2)"), "NDVI", t("Exclusions")].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead>
            <tbody>{o.pixels.map((p, i) => <tr key={i}><th scope="row">{i}</th><td>{p.fmask ?? t("missing")}</td><td>{p.reflectance.map(v => v?.toFixed(4) ?? t("missing")).join(" / ")}</td><td>{p.ndvi?.toFixed(4) ?? t("unknown")}</td><td>{p.excluded.map(text).join(", ") || t("clear")}</td></tr>)}</tbody>
          </table></div>
          <p>{t("Subset SHA-256")} {o.subsetSha256 ?? t("unavailable")}</p>
          <ul>{Object.entries(o.assets).map(([band, url]) => <li key={band}><a href={url}>{band} {t("source COG")}</a></li>)}</ul>
        </details>)}
        <a href="/data/hls-demo.json">{t("Full provenance and raw subset JSON")}</a>
      </>}
    </>}
  </details>;
}
