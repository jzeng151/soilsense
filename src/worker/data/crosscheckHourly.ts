import { cached, DAY_SECONDS } from "../lib/cache";
import { crosscheckJson } from "./crosscheckHttp";
import type { WeatherEstimate } from "../../engine/weatherCrosscheck";

export interface HourlyPower {
  header: { fill_value: number; time_standard: string; api: { version: string } };
  properties: { parameter: Record<string, Record<string, number>> };
  parameters: Record<string, { units: string }>;
}
const shift = (date: string, n: number) => new Date(Date.parse(date) + n * 86400000).toISOString().slice(0, 10);
/** Hour label HH denotes the UTC hourly bin [HH, HH+1). No daily LST shifting. */
export function aggregatePowerHours(raw: HourlyPower, start: string, end: string, endingHour: 0 | 12 = 12) {
  if (raw.header?.time_standard !== "UTC" || !Number.isFinite(raw.header.fill_value) || raw.parameters?.PRECTOTCORR?.units !== "mm/hour" || raw.parameters?.T2M?.units !== "C") throw new Error("Unverified POWER hourly units/time standard");
  const rows: WeatherEstimate[] = [], coverage: { date: string; rainHours: number; temperatureHours: number; boundarySensitivityMm: number | null }[] = [];
  const get = (name: string, t: number) => {
    const key = new Date(t).toISOString().slice(0, 13).replaceAll("-", "").replace("T", "");
    const v = raw.properties.parameter[name]?.[key];
    return typeof v === "number" && Number.isFinite(v) && v !== raw.header.fill_value && (name !== "PRECTOTCORR" || v >= 0) ? v : null;
  };
  for (let date = start; date <= end; date = shift(date, 1)) {
    const begin = Date.parse(endingHour === 12 ? `${shift(date, -1)}T12:00:00Z` : `${date}T00:00:00Z`);
    const values = (name: string, offset = 0) => Array.from({ length: 24 }, (_, i) => get(name, begin + (i + offset) * 3600000));
    const rain = values("PRECTOTCORR"), temperature = values("T2M");
    const sum = (v: (number | null)[]) => v.every(x => x !== null) ? (v as number[]).reduce((a, b) => a + b, 0) : null;
    const total = sum(rain), earlier = sum(values("PRECTOTCORR", -1)), later = sum(values("PRECTOTCORR", 1));
    rows.push({ date, rain: total, tmin: temperature.every(x => x !== null) ? Math.min(...temperature as number[]) : null, tmax: temperature.every(x => x !== null) ? Math.max(...temperature as number[]) : null });
    coverage.push({ date, rainHours: rain.filter(x => x !== null).length, temperatureHours: temperature.filter(x => x !== null).length, boundarySensitivityMm: total === null || earlier === null || later === null ? null : Math.max(Math.abs(total - earlier), Math.abs(total - later)) });
  }
  return { rows, coverage };
}
export async function getCrosscheckHourly(db: D1Database | undefined, lat: number, lon: number, start: string, end: string) {
  if (start < "2001-01-02") throw new Error("POWER hourly alignment requires the preceding day since 2001-01-01");
  const url = `https://power.larc.nasa.gov/api/temporal/hourly/point?${new URLSearchParams({ parameters: "T2M,PRECTOTCORR", community: "AG", latitude: String(lat), longitude: String(lon), start: shift(start, -1).replaceAll("-", ""), end: end.replaceAll("-", ""), format: "JSON", "time-standard": "UTC" })}`;
  const { value } = await cached(db, `crosscheck-hourly:utc-noon-v3:${lat}:${lon}:${start}:${end}`, 30 * DAY_SECONDS, async () => {
    const raw = await crosscheckJson<HourlyPower>(url, {}, 30000);
    return { id: "POWER hourly UTC → noon", dayBoundary: "12:00 UTC ending", nonEquivalentVariables: { rain: "Conditional noon sum: UTC is verified but start/end/center anchoring of hourly labels is not independently verified. Use the daily UTC interval bounds for defensible comparisons", tmin: "Minimum of hourly mean T2M is not a native daily minimum", tmax: "Maximum of hourly mean T2M is not a native daily maximum" }, ...aggregatePowerHours(raw, start, end), raw, retrievedAt: new Date().toISOString(), source: { url, product: `NASA POWER hourly ${raw.header.api.version} / MERRA-2`, attribution: "NASA POWER Project, NASA Langley Research Center", requestedPoint: { lat, lon }, units: { rain: "mm per 24 hours", temperature: "C; extrema of hourly means, not native daily extremes" }, interval: "[previous date 12:00 UTC, labelled date 12:00 UTC); sum 24 one-hour rain rates", limitation: "UTC hourly-bin convention; ±1-hour rainfall sensitivity retained. Hourly mean temperature extrema are descriptive, not equivalent to PRISM native Tmin/Tmax; their agreement is not classified.", documentation: "https://power.larc.nasa.gov/docs/services/api/temporal/hourly/" } };
  });
  return value;
}
