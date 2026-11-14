// County (FCC Area API) and ZIP code (Zippopotam.us) lookups.

import type { CountyInfo } from "../../shared/types";
import { cached, DAY_SECONDS } from "../lib/cache";
import { fetchJson } from "../lib/http";

interface FccResponse {
  results?: { county_fips: string; county_name: string; state_code: string; state_name: string }[];
}

export async function getCounty(db: D1Database | undefined, lat: number, lon: number): Promise<CountyInfo | null> {
  const key = `county:v1:${lat.toFixed(3)}:${lon.toFixed(3)}`;
  try {
    const { value } = await cached(db, key, 365 * DAY_SECONDS, async () => {
      const json = await fetchJson<FccResponse>(
        `https://geo.fcc.gov/api/census/area?lat=${lat}&lon=${lon}&censusYear=2020&format=json`,
        { service: "FCC Area API", timeoutMs: 8000 },
      );
      const r = json.results?.[0];
      return r ? { countyFips: r.county_fips, countyName: r.county_name, stateCode: r.state_code, stateName: r.state_name } : null;
    });
    return value;
  } catch (err) {
    console.warn(JSON.stringify({ msg: "county lookup failed", err: String(err) }));
    return null;
  }
}

interface ZipResponse {
  places?: { "place name": string; latitude: string; longitude: string; "state abbreviation": string }[];
}

export interface ZipPlace {
  zip: string;
  lat: number;
  lon: number;
  place: string;
  state: string;
}

export async function lookupZip(db: D1Database | undefined, zip: string): Promise<ZipPlace | null> {
  if (!/^\d{5}$/.test(zip)) return null;
  try {
    const { value } = await cached(db, `zip:v1:${zip}`, 365 * DAY_SECONDS, async () => {
      const json = await fetchJson<ZipResponse>(`https://api.zippopotam.us/us/${zip}`, { service: "Zippopotam.us", timeoutMs: 6000 });
      const p = json.places?.[0];
      if (!p) return null;
      return { zip, lat: Number(p.latitude), lon: Number(p.longitude), place: p["place name"], state: p["state abbreviation"] };
    });
    return value;
  } catch {
    return null;
  }
}
