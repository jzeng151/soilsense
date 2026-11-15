// NASA POWER daily wind (issues #17, #40): WS10M (daily mean) and WS10M_MAX (maximum hourly value within the day),
// both at 10 m, m/s. A separate request with its own versioned cache key, so the existing temperature/rain snapshot
// (`power:v1:*`) is untouched and the plan never waits on it.
// Docs: https://power.larc.nasa.gov/docs/services/api/temporal/daily/
// Parameter metadata: https://power.larc.nasa.gov/api/system/manager/parameters?community=AG&temporal=daily

import type { WindSeries } from "../../engine/windErosion";
import type { WindMeta } from "../../shared/types";
import { cached, DAY_SECONDS } from "../lib/cache";
import { fetchJson, UpstreamError } from "../lib/http";
import { snapToPowerGrid } from "./power";

export const WIND_PARAMS = ["WS10M", "WS10M_MAX"] as const;
export const WIND_CONTENT_VERSION = "power-wind:v1";

/** Definitions as published in the POWER AG daily parameter metadata (checked 2026-11-14). */
const DEFINITIONS: WindMeta["parameters"] = [
  {
    id: "WS10M_MAX",
    name: "Wind Speed at 10 Meters Maximum",
    definition: "The maximum hourly wind speed at 10 meters above the surface of the earth in the period of interest.",
    units: "m/s",
    heightM: 10,
    aggregation: "Daily maximum of hourly values (LST day). Not a gust.",
  },
  {
    id: "WS10M",
    name: "Wind Speed at 10 Meters",
    definition: "The average of wind speed at 10 meters above the surface of the earth.",
    units: "m/s",
    heightM: 10,
    aggregation: "Daily mean (LST day).",
  },
];

interface PowerWindResponse {
  geometry?: { coordinates?: number[] };
  header?: { fill_value?: number; api?: { version?: string } };
  properties?: { parameter?: Record<string, Record<string, number>> };
}

export interface WindSnapshot {
  series: WindSeries;
  meta: WindMeta;
}

export function parseWind(json: PowerWindResponse, requestUrl: string, retrievedAt: string): WindSnapshot {
  const p = json.properties?.parameter;
  if (!p?.WS10M_MAX) throw new UpstreamError("NASA POWER", "unexpected wind response shape");
  const fill = json.header?.fill_value ?? -999;
  const keys = Object.keys(p.WS10M_MAX).sort();
  const val = (name: string, k: string): number | null => {
    const v = p[name]?.[k];
    return v === undefined || v === null || v === fill || !Number.isFinite(v) || v < 0 ? null : Math.round(v * 100) / 100;
  };
  const dates = keys.map((k) => `${k.slice(0, 4)}-${k.slice(4, 6)}-${k.slice(6, 8)}`);
  const ws10mMax = keys.map((k) => val("WS10M_MAX", k));
  const ws10m = keys.map((k) => val("WS10M", k));
  const valid = (a: (number | null)[]) => a.filter((v) => v !== null).length;
  const c = json.geometry?.coordinates ?? [];
  return {
    series: { dates, ws10m, ws10mMax },
    meta: {
      source: "NASA POWER daily point API, AG community (MERRA-2 meteorology)",
      parameters: DEFINITIONS,
      grid: { lat: c[1] ?? NaN, lon: c[0] ?? NaN, resolution: "0.5° latitude × 0.625° longitude (MERRA-2)" },
      timeStandard: "LST",
      fillValue: fill,
      start: dates[0] ?? "",
      end: dates.at(-1) ?? "",
      validDays: { WS10M: valid(ws10m), WS10M_MAX: valid(ws10mMax) },
      missingDays: { WS10M: dates.length - valid(ws10m), WS10M_MAX: dates.length - valid(ws10mMax) },
      requestUrl,
      retrievedAt,
      apiVersion: json.header?.api?.version ?? null,
      contentVersion: WIND_CONTENT_VERSION,
    },
  };
}

export function windUrl(lat: number, lon: number, startYear: number, endYear: number): string {
  const grid = snapToPowerGrid(lat, lon);
  return (
    `https://power.larc.nasa.gov/api/temporal/daily/point?parameters=${WIND_PARAMS.join(",")}` +
    `&community=AG&latitude=${grid.lat}&longitude=${grid.lon}&start=${startYear}0101&end=${endYear}1231&format=JSON&time-standard=LST`
  );
}

/** Daily wind for the POWER grid cell, cached 30 days per cell and year range (historical days don't change). */
export async function getDailyWind(db: D1Database | undefined, lat: number, lon: number, startYear: number, endYear: number): Promise<WindSnapshot> {
  const grid = snapToPowerGrid(lat, lon);
  const key = `${WIND_CONTENT_VERSION}:${grid.lat.toFixed(3)}:${grid.lon.toFixed(3)}:${startYear}:${endYear}`;
  const { value } = await cached(db, key, 30 * DAY_SECONDS, async () => {
    const url = windUrl(lat, lon, startYear, endYear);
    const json = await fetchJson<PowerWindResponse>(url, { service: "NASA POWER", timeoutMs: 20000, retries: 1 });
    return parseWind(json, url, new Date().toISOString());
  });
  return value;
}
