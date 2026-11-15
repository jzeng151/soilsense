import type { Env } from "../env";
import { cached } from "../lib/cache";
import { retrieveSubset, shift, days, TIME_NOTE, type Subset, type Stream } from "./client";
export interface Comparison {
  state: "available";
  start: string;
  end: string;
  imergMm: number | null;
  powerMm: number | null;
  differenceMm: number | null;
  equivalentIntervals: false;
  note: string;
  imerg: Subset;
  power: { timeStandard: "LST"; units: "mm/day"; retrievedAt: string; sourceUrl: string; values: (number | null)[] };
}
export function compare(imerg: Subset, power: Comparison["power"]): Comparison {
  const complete = (v: (number | null)[]) => v.length === 14 && v.every((x) => x !== null && Number.isFinite(x) && x >= 0) ? (v as number[]).reduce((a, b) => a + b, 0) : null;
  const imergMm = complete(imerg.observations.map((d) => d.mm)), powerMm = complete(power.values);
  return { state: "available", start: imerg.start, end: imerg.end, imergMm, powerMm, differenceMm: imergMm === null || powerMm === null ? null : imergMm - powerMm, equivalentIntervals: false, note: TIME_NOTE, imerg, power };
}
export const comparisonKey = (field: string, end: string, stream: Stream) => `imerg-comparison:V07:qa1:${stream}:${field}:${end}`;
export async function warmComparison(env: Env, f: { id: string; lat: number; lon: number }, end: string, stream: Stream): Promise<Comparison> {
  const start = shift(end, -13), dates = days(start, end);
  const { value } = await cached(env.DB, comparisonKey(f.id, end, stream), stream === "final" ? 30 * 86400 : 3600, async () => {
    const imerg = await retrieveSubset(env, f.lat, f.lon, start, end, stream);
    const q = new URLSearchParams({ parameters: "PRECTOTCORR", community: "AG", latitude: String(f.lat), longitude: String(f.lon), start: start.replaceAll("-", ""), end: end.replaceAll("-", ""), format: "JSON", "time-standard": "LST" });
    const sourceUrl = `https://power.larc.nasa.gov/api/temporal/daily/point?${q}`;
    const response = await fetch(sourceUrl, { signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error("POWER comparison unavailable");
    const raw = await response.json() as { header?: { fill_value?: number }; parameters?: { PRECTOTCORR?: { units?: string } }; properties?: { parameter?: { PRECTOTCORR?: Record<string, number> } } };
    if (raw.parameters?.PRECTOTCORR?.units !== "mm/day" || typeof raw.header?.fill_value !== "number" || !raw.properties?.parameter?.PRECTOTCORR) throw new Error("POWER comparison metadata invalid");
    const values = dates.map((d) => { const v = raw.properties!.parameter!.PRECTOTCORR![d.replaceAll("-", "")]; return typeof v === "number" && Number.isFinite(v) && v >= 0 && v !== raw.header!.fill_value ? v : null; });
    return compare(imerg, { timeStandard: "LST", units: "mm/day", retrievedAt: new Date().toISOString(), sourceUrl, values });
  });
  return value;
}
