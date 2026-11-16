// NASA POWER daily point API client.
// Docs: https://power.larc.nasa.gov/docs/services/api/temporal/daily/
// Requests are snapped to the MERRA-2 grid (0.5° lat × 0.625° lon) so every field in
// the same grid cell shares one cached request, as NASA asks.

import { type DailyClimate, parsePower, type PowerResponse } from "../../engine/climate";
import { cached } from "../lib/cache";
import { freshnessKey, powerPolicy } from "../lib/freshness";
import { fetchJson, UpstreamError } from "../lib/http";

const PARAMS = ["PRECTOTCORR", "T2M", "T2M_MAX", "T2M_MIN", "GWETROOT"] as const;

export function snapToPowerGrid(lat: number, lon: number): { lat: number; lon: number } {
  return { lat: Math.round(lat / 0.5) * 0.5, lon: Math.round((lon / 0.625)) * 0.625 };
}

interface CompactPower {
  gridLat: number;
  gridLon: number;
  dates: string[];
  values: Record<(typeof PARAMS)[number], (number | null)[]>;
  fill: number;
  retrievedAt?: string;
  version?: string;
}

function compact(json: PowerResponse): CompactPower {
  const p = json.properties.parameter;
  const dates = Object.keys(p.T2M_MAX ?? {}).sort();
  const fill = json.header?.fill_value ?? -999;
  const values = {} as CompactPower["values"];
  for (const name of PARAMS) {
    const series = p[name] ?? {};
    values[name] = dates.map((d) => {
      const v = series[d];
      return v === undefined || v === fill ? null : Math.round(v * 100) / 100;
    });
  }
  const c = json.geometry?.coordinates ?? [];
  return { gridLat: c[1] ?? NaN, gridLon: c[0] ?? NaN, dates, values, fill };
}

function expand(c: CompactPower): PowerResponse {
  const parameter: Record<string, Record<string, number>> = {};
  for (const name of PARAMS) {
    const series: Record<string, number> = {};
    c.dates.forEach((d, i) => {
      const v = c.values[name][i];
      series[d] = v === null || v === undefined ? c.fill : v;
    });
    parameter[name] = series;
  }
  return { geometry: { coordinates: [c.gridLon, c.gridLat] }, header: { fill_value: c.fill }, properties: { parameter } };
}

export async function getDailyClimate(
  db: D1Database | undefined,
  lat: number,
  lon: number,
  startYear: number,
  endYear: number,
): Promise<DailyClimate> {
  const grid = snapToPowerGrid(lat, lon);
  const url =
    `https://power.larc.nasa.gov/api/temporal/daily/point?parameters=${PARAMS.join(",")}` +
    `&community=AG&latitude=${grid.lat}&longitude=${grid.lon}&start=${startYear}0101&end=${endYear}1231&format=JSON&time-standard=LST`;
  // Keep the stable archive separate from years overlapping the 90-day revision window.
  // At most two requests, not one request per historical year.
  const recentYear = new Date(Date.now() - 90 * 86_400_000).getUTCFullYear();
  const ranges = [[startYear, Math.min(endYear, recentYear - 1)], [Math.max(startYear, recentYear), endYear]]
    .filter(([start, end]) => start! <= end!);
  const parts = await Promise.all(ranges.map(async ([start, end]) => cached(db,
    freshnessKey(`power:v1:${grid.lat.toFixed(3)}:${grid.lon.toFixed(3)}:${start}:${end}`, "MERRA2-GEOSIT"),
    powerPolicy(end!), async () => {
      const partUrl = url.replace(`start=${startYear}0101&end=${endYear}1231`, `start=${start}0101&end=${end}1231`);
      const json = await fetchJson<PowerResponse>(partUrl, { service: "NASA POWER", timeoutMs: 25000, retries: 1 });
      if (!json?.properties?.parameter?.T2M_MAX) throw new UpstreamError("NASA POWER", "unexpected response shape");
      const value = compact(json);
      if (!value.dates.length || (end! - start! >= 9 && parsePower(expand(value)).years.length < 10))
        throw new UpstreamError("NASA POWER", "incomplete historical response");
      return { ...value, retrievedAt: new Date().toISOString(), version: json.header?.api?.version };
    })));
  const value: CompactPower = { ...parts[0]!.value,
    dates: parts.flatMap(p => p.value.dates),
    values: Object.fromEntries(PARAMS.map(name => [name, parts.flatMap(p => p.value.values[name])])) as CompactPower["values"],
  };
  const cache = parts.every(p => p.cache !== "miss") ? "memory" : "miss";
  const parsed = parsePower(expand(value));
  const expectedDays = (Date.UTC(endYear + 1, 0, 1) - Date.UTC(startYear, 0, 1)) / 86_400_000;
  const validValues = ["PRECTOTCORR", "T2M_MAX", "T2M_MIN"].reduce((n, key) =>
    n + value.values[key as (typeof PARAMS)[number]].filter((v) => v !== null && Number.isFinite(v) && v > -999).length, 0);
  const lastDate = value.dates[value.dates.length - 1];
  parsed.powerEvidence = {
    url, version: value.version ?? null, retrievedAt: value.retrievedAt ?? null,
    period: `${startYear}-01-01–${endYear}-12-31 (requested)`,
    observedThrough: lastDate ? `${lastDate.slice(0, 4)}-${lastDate.slice(4, 6)}-${lastDate.slice(6, 8)}` : null,
    validValues, expectedValues: expectedDays * 3, cached: cache !== "miss",
  };
  if (parsed.years.length < 10) throw new UpstreamError("NASA POWER", `only ${parsed.years.length} complete years returned`);
  return parsed;
}
