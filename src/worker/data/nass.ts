// USDA NASS Quick Stats: real county harvests and current crop prices.
// Free API key: https://quickstats.nass.usda.gov/api
//
// Four bulk requests per county (each cached separately, so one failing never blocks the others):
//   1. every county yield since 1991, all crops, all practices (combined, irrigated, non-irrigated)
//   2. the same for the county's agricultural district (NASS stopped county practice splits around 2010)
//   3. state prices received, monthly, last ~2 years
//   4. national prices received, monthly (fallback where a state has no price for a crop)

import { ALL_CROPS, CROPS } from "../../engine/crops";
import type { CountyInfo, CropId, CropPrice, NassData, PracticeSeries } from "../../shared/types";
import { cached, DAY_SECONDS } from "../lib/cache";
import { fetchWithRetry, UpstreamError } from "../lib/http";

const API = "https://quickstats.nass.usda.gov/api/api_GET/";

export type { CropPrice, NassData, PracticeSeries, YieldRecord } from "../../shared/types";

interface Row {
  short_desc: string;
  year: number | string;
  Value: string;
  reference_period_desc?: string;
  asd_code?: string;
  asd_desc?: string;
}

/** One Quick Stats query. "No rows" (HTTP 400) is a valid empty answer; network failures throw. */
async function query(apiKey: string, params: Record<string, string>): Promise<Row[]> {
  const qs = new URLSearchParams({ key: apiKey, source_desc: "SURVEY", format: "JSON", ...params });
  try {
    const res = await fetchWithRetry(`${API}?${qs}`, { service: "USDA NASS Quick Stats", timeoutMs: 15000, retries: 1 });
    const json = (await res.json()) as { data?: Row[] };
    return json.data ?? [];
  } catch (err) {
    if (err instanceof UpstreamError && (err.status === 400 || err.status === 404)) return [];
    throw err;
  }
}

const num = (v: string): number => Number(String(v).replace(/,/g, ""));

/** "CORN, GRAIN - YIELD, …" → "CORN, GRAIN, NON-IRRIGATED - YIELD, …" */
const withPractice = (shortDesc: string, practice: "IRRIGATED" | "NON-IRRIGATED") => shortDesc.replace(" - YIELD", `, ${practice} - YIELD`);

function toSeries(rows: Row[]): Partial<Record<CropId, PracticeSeries>> {
  const out: Partial<Record<CropId, PracticeSeries>> = {};
  for (const crop of ALL_CROPS) {
    const desc = CROPS[crop].nassUnitFilter;
    if (!desc) continue;
    const pick = (d: string) =>
      rows
        .filter((r) => r.short_desc === d && r.reference_period_desc !== "YEAR - AUG FORECAST")
        .map((r) => ({ year: Number(r.year), value: num(r.Value) }))
        .filter((r) => Number.isFinite(r.value) && r.value > 0)
        .sort((a, b) => a.year - b.year)
        // NASS sometimes repeats a year (forecast + final); keep the last one listed.
        .filter((r, i, a) => a[i + 1]?.year !== r.year);
    const s: PracticeSeries = { all: pick(desc), irrigated: pick(withPractice(desc, "IRRIGATED")), nonIrrigated: pick(withPractice(desc, "NON-IRRIGATED")) };
    if (s.all.length || s.irrigated.length || s.nonIrrigated.length) out[crop] = s;
  }
  return out;
}

/** Monthly "price received" series that match each crop, best first; factor converts to the engine's unit. */
const PRICE_SERIES: Partial<Record<CropId, { desc: string; factor: number }[]>> = {
  corn: [{ desc: "CORN, GRAIN - PRICE RECEIVED, MEASURED IN $ / BU", factor: 1 }],
  soybean: [{ desc: "SOYBEANS - PRICE RECEIVED, MEASURED IN $ / BU", factor: 1 }],
  winter_wheat: [
    { desc: "WHEAT, WINTER - PRICE RECEIVED, MEASURED IN $ / BU", factor: 1 },
    { desc: "WHEAT - PRICE RECEIVED, MEASURED IN $ / BU", factor: 1 },
  ],
  oats: [{ desc: "OATS - PRICE RECEIVED, MEASURED IN $ / BU", factor: 1 }],
  alfalfa: [{ desc: "HAY, ALFALFA - PRICE RECEIVED, MEASURED IN $ / TON", factor: 1 }],
  // Sorghum is priced per hundredweight; a bushel is 56 lb.
  sorghum: [{ desc: "SORGHUM, GRAIN - PRICE RECEIVED, MEASURED IN $ / CWT", factor: 0.56 }],
};
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/** Average of the latest 12 monthly prices (at least 3), per crop. */
export function pricesFrom(rows: Row[], level: "state" | "national"): Partial<Record<CropId, CropPrice>> {
  const out: Partial<Record<CropId, CropPrice>> = {};
  for (const [crop, options] of Object.entries(PRICE_SERIES) as [CropId, { desc: string; factor: number }[]][]) {
    for (const { desc, factor } of options) {
      const pts = rows
        .filter((r) => r.short_desc === desc && MONTHS.includes(r.reference_period_desc ?? ""))
        .map((r) => ({ t: Number(r.year) * 12 + MONTHS.indexOf(r.reference_period_desc!), v: num(r.Value) * factor }))
        .filter((p) => Number.isFinite(p.v) && p.v > 0)
        .sort((a, b) => b.t - a.t)
        .filter((p, i, a) => a[i - 1]?.t !== p.t)
        .slice(0, 12);
      if (pts.length < 3) continue;
      const latest = pts[0]!.t;
      const month = MONTHS[latest % 12]!;
      out[crop] = {
        price: Math.round((pts.reduce((a, p) => a + p.v, 0) / pts.length) * 100) / 100,
        unit: CROPS[crop].yieldUnit.startsWith("tons") ? "$/ton" : "$/bu",
        months: pts.length,
        through: `${month.charAt(0)}${month.slice(1).toLowerCase()} ${Math.floor(latest / 12)}`,
        level,
      };
      break;
    }
  }
  return out;
}

/** Everything SoilSense uses from NASS for one county. Never throws: missing parts come back empty. */
export async function getNassData(db: D1Database | undefined, apiKey: string | undefined, county: CountyInfo | null, currentYear: number): Promise<NassData | null> {
  if (!apiKey || !county) return null;
  const stateFips = county.countyFips.slice(0, 2);
  const countyAnsi = county.countyFips.slice(2);
  const errors: string[] = [];
  const load = async <T>(label: string, key: string, ttlDays: number, fn: () => Promise<T>, empty: T): Promise<T> => {
    try {
      return (await cached(db, key, ttlDays * DAY_SECONDS, fn)).value;
    } catch (err) {
      errors.push(label);
      console.warn(JSON.stringify({ msg: "nass request failed", label, err: String(err) }));
      return empty;
    }
  };

  const countyRows = await load("county yields", `nass:yields:county:v2:${county.countyFips}:${currentYear}`, 30, () => query(apiKey, { statisticcat_desc: "YIELD", agg_level_desc: "COUNTY", state_fips_code: stateFips, county_ansi: countyAnsi, year__GE: "1991" }), [] as Row[]);
  const asd = countyRows.find((r) => r.asd_code)?.asd_code ?? null;
  const districtName = countyRows.find((r) => r.asd_desc)?.asd_desc ?? null;

  const priceSince = String(currentYear - 2);
  const [districtRows, stateRows, nationalRows] = await Promise.all([
    asd
      ? load("district yields", `nass:yields:district:v2:${stateFips}:${asd}:${currentYear}`, 30, () => query(apiKey, { statisticcat_desc: "YIELD", agg_level_desc: "AGRICULTURAL DISTRICT", state_fips_code: stateFips, asd_code: asd, year__GE: "1991" }), [] as Row[])
      : Promise.resolve([] as Row[]),
    // Prices change monthly: cache for 7 days.
    load("state prices", `nass:prices:state:v2:${stateFips}:${currentYear}`, 7, () => query(apiKey, { statisticcat_desc: "PRICE RECEIVED", agg_level_desc: "STATE", state_fips_code: stateFips, freq_desc: "MONTHLY", year__GE: priceSince }), [] as Row[]),
    load("national prices", `nass:prices:national:v2:${currentYear}`, 7, () => query(apiKey, { statisticcat_desc: "PRICE RECEIVED", agg_level_desc: "NATIONAL", freq_desc: "MONTHLY", year__GE: priceSince }), [] as Row[]),
  ]);

  return {
    county: toSeries(countyRows),
    district: toSeries(districtRows),
    districtName: districtName ? titleCase(districtName) : null,
    prices: { ...pricesFrom(nationalRows, "national"), ...pricesFrom(stateRows, "state") },
    errors,
  };
}

const titleCase = (s: string) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
