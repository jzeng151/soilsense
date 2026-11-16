// NASA Daymet (ORNL DAAC): daily rain and temperature on a 1 km grid, built from weather stations and terrain.
// Single-pixel API, no key: https://daymet.ornl.gov/web_services
// Daymet uses a 365-day year (Dec 31 is dropped in leap years), so its yday equals the calendar day of year.

import type { DaymetDay } from "../../engine/climate";
import { cached } from "../lib/cache";
import { freshnessKey, HISTORY, DAYMET_RELEASE } from "../lib/freshness";
import { fetchWithRetry } from "../lib/http";

interface Compact {
  start: number;
  /** One array per year, values ×10 as integers: [prcp mm, tmax °C, tmin °C] interleaved. */
  years: number[][];
}

export function parseDaymetCsv(csv: string): DaymetDay[] {
  const out: DaymetDay[] = [];
  for (const line of csv.split(/\r?\n/)) {
    if (!/^\d{4},/.test(line)) continue;
    const [y, d, p, x, n] = line.split(",").map(Number);
    if ([y, d, p, x, n].every((v) => Number.isFinite(v))) out.push({ year: y!, yday: d!, prcp: p!, tmax: x!, tmin: n! });
  }
  return out;
}

function compact(days: DaymetDay[]): Compact {
  const start = Math.min(...days.map((d) => d.year));
  const years: number[][] = [];
  for (const d of days) {
    const row = (years[d.year - start] ??= []);
    const i = (d.yday - 1) * 3;
    row[i] = Math.round(d.prcp * 10);
    row[i + 1] = Math.round(d.tmax * 10);
    row[i + 2] = Math.round(d.tmin * 10);
  }
  return { start, years };
}

function expand(c: Compact): DaymetDay[] {
  const out: DaymetDay[] = [];
  c.years.forEach((row, k) => {
    for (let i = 0; i + 2 < (row?.length ?? 0); i += 3) {
      const p = row[i];
      if (p === undefined || p === null) continue;
      out.push({ year: c.start + k, yday: i / 3 + 1, prcp: p / 10, tmax: (row[i + 1] as number) / 10, tmin: (row[i + 2] as number) / 10 });
    }
  });
  return out;
}

/** Daily Daymet weather for a point, or null if the service is slow or down (callers fall back to NASA POWER). */
export async function getDaymet(db: D1Database | undefined, lat: number, lon: number, startYear: number, endYear: number): Promise<DaymetDay[] | null> {
  // ~1 km pixels: round to 0.01° so neighbouring clicks on the same field share the cache.
  const la = lat.toFixed(2);
  const lo = lon.toFixed(2);
  try {
    const { value } = await cached(db, freshnessKey(`daymet:v1:${la}:${lo}:${startYear}:${endYear}`, DAYMET_RELEASE), HISTORY, async () => {
      const url = `https://daymet.ornl.gov/single-pixel/api/data?lat=${la}&lon=${lo}&vars=prcp,tmax,tmin&start=${startYear}-01-01&end=${endYear}-12-31`;
      const res = await fetchWithRetry(url, { service: "NASA Daymet", timeoutMs: 20000, retries: 1, headers: { Accept: "text/csv" } });
      const days = parseDaymetCsv(await res.text());
      if (days.length < 365 * 10) throw new Error(`only ${days.length} days returned`);
      return compact(days);
    });
    return expand(value);
  } catch (err) {
    console.warn(JSON.stringify({ msg: "daymet unavailable, using NASA POWER only", err: String(err) }));
    return null;
  }
}
