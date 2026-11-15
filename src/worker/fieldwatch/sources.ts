// Data inputs for Field Watch: recent NASA POWER days, the long-term NASA POWER record, and the
// team's weekly Kansas drought outlook (a public JSON file on Cloudflare R2).

import type { DailyClimate } from "../../engine/climate";
import { cached } from "../lib/cache";
import { fetchJson, UpstreamError } from "../lib/http";
import { snapToPowerGrid } from "../data/power";
import type { DayMap, KansasSignal } from "./rule";
import { isoDate } from "./rule";

const RECENT_DAYS = 60;
const RECENT_TTL_SECONDS = 3 * 3600; // POWER updates daily; hourly cron runs reuse this.
const KS_TTL_SECONDS = 3600;
export const KS_ADVICE_URL = "https://pub-fe3948f31a9c462890b089ed5356c336.r2.dev/app_rotation_advice.json";

interface PowerDaily {
  header?: { fill_value?: number };
  properties?: { parameter?: Record<string, Record<string, number>> };
}

function clean(v: number | undefined, fill: number): number | null {
  if (v === undefined || v === null || Number.isNaN(v) || v === fill || v <= -999) return null;
  return v;
}

/** Recent NASA POWER days for a field (last ~60 days), keyed by ISO date. Days NASA hasn't filled yet are null. */
export async function getRecentDays(db: D1Database | undefined, lat: number, lon: number, today: Date): Promise<DayMap> {
  const grid = snapToPowerGrid(lat, lon);
  const end = isoDate(today);
  const start = isoDate(new Date(today.getTime() - RECENT_DAYS * 86_400_000));
  const key = `power-recent:v1:${grid.lat.toFixed(3)}:${grid.lon.toFixed(3)}:${end}`;
  const { value } = await cached(db, key, RECENT_TTL_SECONDS, async () => {
    const url =
      "https://power.larc.nasa.gov/api/temporal/daily/point?parameters=PRECTOTCORR,T2M_MAX,T2M_MIN,GWETROOT" +
      `&community=AG&latitude=${grid.lat}&longitude=${grid.lon}&start=${start.replace(/-/g, "")}&end=${end.replace(/-/g, "")}&format=JSON&time-standard=LST`;
    const json = await fetchJson<PowerDaily>(url, { service: "NASA POWER", timeoutMs: 20000, retries: 1 });
    const p = json?.properties?.parameter;
    if (!p?.PRECTOTCORR) throw new UpstreamError("NASA POWER", "unexpected response shape");
    const fill = json.header?.fill_value ?? -999;
    const rows: [string, (number | null)[]][] = Object.keys(p.PRECTOTCORR)
      .sort()
      .map((k) => [
        `${k.slice(0, 4)}-${k.slice(4, 6)}-${k.slice(6, 8)}`,
        [clean(p.PRECTOTCORR?.[k], fill), clean(p.T2M_MAX?.[k], fill), clean(p.T2M_MIN?.[k], fill), clean(p.GWETROOT?.[k], fill)],
      ]);
    return rows;
  });
  return new Map(value.map(([d, [prcp, tmax, tmin, gwetroot]]) => [d, { prcp: prcp ?? null, tmax: tmax ?? null, tmin: tmin ?? null, gwetroot: gwetroot ?? null }]));
}

/** The long-term record (same cached NASA POWER download the rotation plans use), keyed by ISO date. */
export function historyToDayMap(climate: DailyClimate): { map: DayMap; first: number; last: number } {
  const map: DayMap = new Map();
  for (const ys of climate.years) {
    for (const d of ys.days) {
      const iso = `${ys.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;
      map.set(iso, { prcp: d.prcp, tmax: d.tmax, tmin: d.tmin, gwetroot: d.gwetroot });
    }
  }
  return { map, first: climate.firstYear, last: climate.lastYear };
}

interface KsFile {
  data_through?: string;
  counties?: { fips?: string; county?: string; alert?: string; drought_probability_now?: number; rootzone_pct_now?: number }[];
}

/** The team's weekly Kansas outlook for one county (by 5-digit FIPS), or null if unavailable. */
export async function getKansasSignal(db: D1Database | undefined, fips: string): Promise<KansasSignal | null> {
  try {
    const { value } = await cached(db, "ks-advice:v1", KS_TTL_SECONDS, async () => {
      const json = await fetchJson<KsFile>(KS_ADVICE_URL, { service: "Kansas rotation advice (R2)", timeoutMs: 10000, retries: 1 });
      if (!Array.isArray(json?.counties)) throw new UpstreamError("Kansas rotation advice (R2)", "unexpected file shape");
      // Keep only what Field Watch uses (the full file is ~280 KB).
      return {
        dataThrough: String(json.data_through ?? ""),
        counties: json.counties.map((c) => ({
          fips: String(c.fips ?? ""),
          county: String(c.county ?? ""),
          alert: String(c.alert ?? "unknown"),
          p: typeof c.drought_probability_now === "number" ? c.drought_probability_now : null,
          r: typeof c.rootzone_pct_now === "number" ? c.rootzone_pct_now : null,
        })),
      };
    });
    const c = value.counties.find((x) => x.fips === fips);
    return c ? { county: c.county, alert: c.alert, droughtProbability: c.p, rootzonePct: c.r, dataThrough: value.dataThrough } : null;
  } catch (err) {
    console.warn(JSON.stringify({ msg: "kansas advice unavailable", err: String(err) }));
    return null;
  }
}
