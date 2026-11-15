// County (FCC Area API) and ZIP code (Zippopotam.us) lookups.

import type { CountyInfo } from "../../shared/types";
import { cached, DAY_SECONDS } from "../lib/cache";
import { fetchJson } from "../lib/http";

interface FccResponse {
  results?: { county_fips: string; county_name: string; state_code: string; state_name: string }[];
}

/** State FIPS -> postal code and name (50 states + DC), for the Census geocoder fallback. */
const STATES: Record<string, [string, string]> = {
  "01": ["AL", "Alabama"], "02": ["AK", "Alaska"], "04": ["AZ", "Arizona"], "05": ["AR", "Arkansas"], "06": ["CA", "California"],
  "08": ["CO", "Colorado"], "09": ["CT", "Connecticut"], "10": ["DE", "Delaware"], "11": ["DC", "District of Columbia"],
  "12": ["FL", "Florida"], "13": ["GA", "Georgia"], "15": ["HI", "Hawaii"], "16": ["ID", "Idaho"], "17": ["IL", "Illinois"],
  "18": ["IN", "Indiana"], "19": ["IA", "Iowa"], "20": ["KS", "Kansas"], "21": ["KY", "Kentucky"], "22": ["LA", "Louisiana"],
  "23": ["ME", "Maine"], "24": ["MD", "Maryland"], "25": ["MA", "Massachusetts"], "26": ["MI", "Michigan"], "27": ["MN", "Minnesota"],
  "28": ["MS", "Mississippi"], "29": ["MO", "Missouri"], "30": ["MT", "Montana"], "31": ["NE", "Nebraska"], "32": ["NV", "Nevada"],
  "33": ["NH", "New Hampshire"], "34": ["NJ", "New Jersey"], "35": ["NM", "New Mexico"], "36": ["NY", "New York"],
  "37": ["NC", "North Carolina"], "38": ["ND", "North Dakota"], "39": ["OH", "Ohio"], "40": ["OK", "Oklahoma"], "41": ["OR", "Oregon"],
  "42": ["PA", "Pennsylvania"], "44": ["RI", "Rhode Island"], "45": ["SC", "South Carolina"], "46": ["SD", "South Dakota"],
  "47": ["TN", "Tennessee"], "48": ["TX", "Texas"], "49": ["UT", "Utah"], "50": ["VT", "Vermont"], "51": ["VA", "Virginia"],
  "53": ["WA", "Washington"], "54": ["WV", "West Virginia"], "55": ["WI", "Wisconsin"], "56": ["WY", "Wyoming"],
};

interface CensusResponse {
  result?: { geographies?: { Counties?: { GEOID: string; NAME: string; STATE: string }[] } };
}

async function fromFcc(lat: number, lon: number): Promise<CountyInfo | null> {
  const json = await fetchJson<FccResponse>(`https://geo.fcc.gov/api/census/area?lat=${lat}&lon=${lon}&censusYear=2020&format=json`, {
    service: "FCC Area API",
    timeoutMs: 8000,
  });
  const r = json.results?.[0];
  return r ? { countyFips: r.county_fips, countyName: r.county_name, stateCode: r.state_code, stateName: r.state_name } : null;
}

/** Backup: the US Census Bureau geocoder (free, no key). */
export async function fromCensus(lat: number, lon: number): Promise<CountyInfo | null> {
  const json = await fetchJson<CensusResponse>(
    `https://geocoding.geo.census.gov/geocoder/geographies/coordinates?x=${lon}&y=${lat}&benchmark=Public_AR_Current&vintage=Current_Current&layers=Counties&format=json`,
    { service: "Census geocoder", timeoutMs: 8000 },
  );
  const c = json.result?.geographies?.Counties?.[0];
  const st = c ? STATES[c.STATE] : undefined;
  return c && st ? { countyFips: c.GEOID, countyName: c.NAME, stateCode: st[0], stateName: st[1] } : null;
}

/** County for a point: FCC first, the Census geocoder if FCC fails. A failed lookup is not cached (only "no county", e.g. at sea). */
export async function getCounty(db: D1Database | undefined, lat: number, lon: number): Promise<CountyInfo | null> {
  const key = `county:v1:${lat.toFixed(3)}:${lon.toFixed(3)}`;
  try {
    const { value } = await cached(db, key, 365 * DAY_SECONDS, async () => {
      try {
        const r = await fromFcc(lat, lon);
        if (r) return r;
      } catch (err) {
        console.warn(JSON.stringify({ msg: "FCC county lookup failed, trying Census", err: String(err) }));
      }
      return fromCensus(lat, lon);
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
