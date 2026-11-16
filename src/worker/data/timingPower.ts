import type { TimingDay } from "../../engine/cropTiming";
import { cached } from "../lib/cache";
import { freshnessKey, powerPolicy } from "../lib/freshness";
import { fetchJson } from "../lib/http";
import { snapToPowerGrid } from "./power";
interface RawPower {
  header: { fill_value: number; time_standard: string; api: { version: string }; sources: string[] };
  properties: { parameter: Record<string, Record<string, number>> };
  parameters: Record<string, { units: string }>;
}
/** Preserve raw source, calendar gaps, time standard and exact response hash; never use the Daymet ensemble here. */
export async function getTimingPower(db: D1Database | undefined, lat: number, lon: number, year: number) {
  const grid = snapToPowerGrid(lat, lon);
  const url = `https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M_MIN,T2M_MAX,PRECTOTCORR&community=AG&latitude=${grid.lat}&longitude=${grid.lon}&start=${year}0101&end=${year}1231&format=JSON&time-standard=LST`;
  const { value } = await cached(db, freshnessKey(`timing-power:v1:${grid.lat}:${grid.lon}:${year}`, "MERRA2-GEOSIT"), powerPolicy(year), async () => {
    const raw = await fetchJson<RawPower>(url, { service: "NASA POWER timing", timeoutMs: 25000, retries: 1 });
    if (raw.header?.time_standard !== "LST" || raw.parameters?.T2M_MIN?.units !== "C" || raw.parameters?.T2M_MAX?.units !== "C" || raw.parameters?.PRECTOTCORR?.units !== "mm/day") throw new Error("POWER timing units/time standard unavailable");
    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(raw)));
    const snapshotId = Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, "0")).join("");
    return { raw, snapshotId, retrievedAt: new Date().toISOString() };
  });
  const p = value.raw.properties.parameter;
  const dates = [...new Set(Object.values(p).flatMap(s => Object.keys(s)))].sort();
  const get = (name: string, date: string) => {
    const v = p[name]?.[date];
    return v === undefined || !Number.isFinite(v) || v === value.raw.header.fill_value ? null : v;
  };
  const days: TimingDay[] = dates.map(d => ({ date: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`, tmin: get("T2M_MIN", d), tmax: get("T2M_MAX", d), rain: get("PRECTOTCORR", d) }));
  return { ...value, days, source: { url, product: "NASA POWER daily point / MERRA-2", apiVersion: value.raw.header.api.version, timeStandard: "LST", units: { temperature: "C", rain: "mm/day" }, nativeResolution: "0.5 latitude x 0.625 longitude degrees", requestedPoint: { lat, lon }, grid, attribution: "NASA POWER Project, NASA Langley Research Center" } };
}
