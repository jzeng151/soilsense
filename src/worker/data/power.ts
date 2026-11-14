// NASA POWER daily point API client.
// Docs: https://power.larc.nasa.gov/docs/services/api/temporal/daily/
// Requests are snapped to the MERRA-2 grid (0.5° lat × 0.625° lon) so every field in
// the same grid cell shares one cached request, as NASA asks.

import { type DailyClimate, parsePower, type PowerResponse } from "../../engine/climate";
import { cached, DAY_SECONDS } from "../lib/cache";
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
  const key = `power:v1:${grid.lat.toFixed(3)}:${grid.lon.toFixed(3)}:${startYear}:${endYear}`;
  const { value } = await cached(db, key, 30 * DAY_SECONDS, async () => {
    const url =
      `https://power.larc.nasa.gov/api/temporal/daily/point?parameters=${PARAMS.join(",")}` +
      `&community=AG&latitude=${grid.lat}&longitude=${grid.lon}&start=${startYear}0101&end=${endYear}1231&format=JSON&time-standard=LST`;
    const json = await fetchJson<PowerResponse>(url, { service: "NASA POWER", timeoutMs: 25000, retries: 1 });
    if (!json?.properties?.parameter?.T2M_MAX) throw new UpstreamError("NASA POWER", "unexpected response shape");
    return compact(json);
  });
  const parsed = parsePower(expand(value));
  if (parsed.years.length < 10) throw new UpstreamError("NASA POWER", `only ${parsed.years.length} complete years returned`);
  return parsed;
}
