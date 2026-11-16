// OpenET (built on NASA/USGS Landsat): measured actual evapotranspiration for the field, monthly.
// Free API key from https://etdata.org (set OPENET_API_KEY). Point time series, Ensemble model, 30 m pixels.
// The API allows at most 10 years per request, so we ask once for the latest 10 full years and cache it.

import { cached } from "../lib/cache";
import { freshnessKey, openetPolicy } from "../lib/freshness";
import { fetchWithRetry } from "../lib/http";

import type { EtMonth } from "../../shared/types";

export type OpenEtMonth = EtMonth;

/** Monthly measured ET for the point, or null when there is no key or the service fails (never throws). */
export async function getOpenEt(db: D1Database | undefined, apiKey: string | undefined, lat: number, lon: number, endYear: number): Promise<OpenEtMonth[] | null> {
  if (!apiKey) return null;
  const startYear = endYear - 9;
  // 30 m pixels; ~100 m rounding keeps one cache entry per field and protects the monthly API quota.
  const la = Number(lat.toFixed(3));
  const lo = Number(lon.toFixed(3));
  try {
    const { value } = await cached(db, freshnessKey(`openet:v1:${la}:${lo}:${startYear}:${endYear}`), openetPolicy(endYear), async () => {
      const res = await fetchWithRetry("https://openet-api.org/raster/timeseries/point", {
        service: "OpenET",
        method: "POST",
        timeoutMs: 25000,
        retries: 1,
        headers: { Authorization: apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          date_range: [`${startYear}-01-01`, `${endYear}-12-31`],
          interval: "monthly",
          geometry: [lo, la],
          model: "Ensemble",
          variable: "ET",
          reference_et: "gridMET",
          units: "mm",
          file_format: "JSON",
        }),
      });
      const rows = (await res.json()) as { time?: string; et?: number | null }[];
      if (!Array.isArray(rows)) throw new Error("unexpected OpenET response");
      const months = rows
        .filter((r) => typeof r.time === "string" && typeof r.et === "number" && Number.isFinite(r.et))
        .map((r) => ({ year: Number(r.time!.slice(0, 4)), month: Number(r.time!.slice(5, 7)), et: r.et as number }));
      if (months.length < 24) throw new Error(`only ${months.length} months returned`);
      return months;
    });
    return value;
  } catch (err) {
    console.warn(JSON.stringify({ msg: "openet unavailable", err: String(err) }));
    return null;
  }
}
