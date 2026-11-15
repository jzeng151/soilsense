import type { CountyInfo } from "../../shared/types";
import { cached, DAY_SECONDS } from "../lib/cache";

const API = "https://quickstats.nass.usda.gov/api/api_GET/";
const DESC = "CORN - PROGRESS, MEASURED IN PCT SILKING";
export interface ProgressRow { year: string | number; Value: string; week_ending?: string; short_desc?: string; asd_code?: string; asd_desc?: string }
export interface WeeklyProgress { date: string; percent: number }
/** Never interpolate weekly surveys, turn suppression into zero, or bridge a missing week silently. */
export function bracketSilking(rows: ProgressRow[], year: number, estimated: string | null) {
  const reports: WeeklyProgress[] = rows.filter(r => Number(r.year) === year && r.short_desc === DESC && /^\d{4}-\d{2}-\d{2}$/.test(r.week_ending ?? "") && r.week_ending!.startsWith(`${year}-`) && /^\d+(\.\d+)?$/.test(r.Value.trim()))
    .map(r => ({ date: r.week_ending!, percent: Number(r.Value) })).filter(r => r.percent >= 0 && r.percent <= 100).sort((a,b) => a.date.localeCompare(b.date));
  const conflicting = reports.some((r,i) => i > 0 && ((r.date === reports[i-1]!.date && r.percent !== reports[i-1]!.percent) || r.percent < reports[i-1]!.percent));
  const unique = reports.filter((r,i) => i === 0 || r.date !== reports[i-1]!.date);
  const index = unique.findIndex(r => r.percent >= 50);
  const upper = index >= 0 ? unique[index]! : null;
  const lower = index > 0 ? unique[index-1]! : null;
  const gapDays = lower && upper ? (Date.parse(upper.date)-Date.parse(lower.date))/86400000 : null;
  const usable = !conflicting && !!lower && !!upper;
  const delta = usable && estimated ? [(Date.parse(estimated)-Date.parse(upper!.date))/86400000, (Date.parse(estimated)-Date.parse(lower!.date))/86400000] : null;
  return { year, reports: unique, lower: usable ? lower : null, upper: usable ? upper : null, status: conflicting ? "inconsistent_reports" : !usable ? "unbracketed" : gapDays! > 7 ? "missing_report_gap" : "bracketed", gapDays, estimatedSilking: estimated, estimatedWindow: estimated ? { start: new Date(Date.parse(estimated)-7*86400000).toISOString().slice(0,10), end: new Date(Date.parse(estimated)+7*86400000).toISOString().slice(0,10) } : null, modelMinusSurveyDays: delta,
    discrepancy: delta && (delta[0]! > 14 || delta[1]! < -14) ? "Large regional discrepancy: investigate assumed May planting date, 110-day maturity, POWER grid and regional planting spread; do not tune to the survey or claim field validation." : "Regional plausibility only; planting/hybrid and observed field stages are not matched." };
}
async function query(key: string, params: Record<string,string>): Promise<ProgressRow[]> {
  // Only this private transport URL contains the key. Never return/log the URL or upstream body.
  const response = await fetch(`${API}?${new URLSearchParams({ key, source_desc: "SURVEY", format: "JSON", ...params })}`, { signal: AbortSignal.timeout(15000) });
  const body = await response.json() as { data?: ProgressRow[]; error?: unknown };
  if (response.status === 400 && JSON.stringify(body.error).includes("No Data Found")) return [];
  if (!response.ok || !Array.isArray(body.data)) throw new Error("NASS progress response unavailable");
  return body.data;
}
export async function getNassSilking(db: D1Database | undefined, key: string | undefined, county: CountyInfo | null, estimates: { year: number; silking: string | null }[]) {
  const interpretation = "NASS survey: cumulative percentage of regional corn acreage at or beyond silking, not this field. GDD dates and ±7-day windows are estimates, not observations. No interpolation.";
  if (!key || !county) return { status: "unavailable", reason: !key ? "NASS_API_KEY not configured" : "County lookup unavailable", interpretation, seasons: [] };
  try {
    const state = county.countyFips.slice(0,2);
    const years = estimates.map(e => e.year).sort();
    const value = (await cached(db, `nass:silking:v1:${county.countyFips}:${years.join(",")}`, 30*DAY_SECONDS, async () => {
      const base = { short_desc: DESC, freq_desc: "WEEKLY", state_fips_code: state, year__GE: String(years[0]), year__LE: String(years[years.length-1]) };
      const urls: string[] = [];
      const recordQuery = async (params: Record<string,string>) => { urls.push(`${API}?${new URLSearchParams({ source_desc: "SURVEY", format: "JSON", ...params })}`); return query(key, params); };
      // County yield records supply the county-to-ASD association; never hard-code a guessed district.
      const mapping = await recordQuery({ agg_level_desc: "COUNTY", state_fips_code: state, county_ansi: county.countyFips.slice(2), statisticcat_desc: "YIELD", commodity_desc: "CORN", year__GE: "2010" });
      const districts = [...new Set(mapping.map(r => r.asd_code).filter((x): x is string => !!x))];
      const asd = districts.length === 1 ? districts[0]! : null;
      let districtRows: ProgressRow[] = [];
      if (asd) {
        try { districtRows = await recordQuery({ ...base, agg_level_desc: "AGRICULTURAL DISTRICT", asd_code: asd }); }
        catch { /* Explicit fallback, including query failure; not proof no district reports exist. */ }
      }
      const needsState = years.some(y => !["bracketed","missing_report_gap"].includes(bracketSilking(districtRows,y,null).status));
      const stateRows = needsState ? await recordQuery({ ...base, agg_level_desc: "STATE" }) : [];
      return { retrievedAt: new Date().toISOString(), urls, asd, districtName: mapping.find(r => r.asd_code === asd)?.asd_desc ?? null, districtRows, stateRows };
    })).value;
    return { status: "available", reason: "Weekly regional 50% benchmark intervals; no exact crossing day inferred", interpretation, county, mapping: { asdCode: value.asd, districtName: value.districtName, method: "ASD association from NASS county corn yield rows since 2010; ambiguous associations remain unknown" }, source: { urls: value.urls, retrievedAt: value.retrievedAt, product: DESC, parser: "nass:silking:v1" }, seasons: estimates.map(e => {
      const district = bracketSilking(value.districtRows,e.year,e.silking);
      const useDistrict = ["bracketed","missing_report_gap"].includes(district.status);
      return { ...(useDistrict ? district : bracketSilking(value.stateRows,e.year,e.silking)), geography: useDistrict ? "AGRICULTURAL DISTRICT" : "STATE", geographyName: useDistrict ? value.districtName : county.stateName, fallbackReason: useDistrict ? null : "District weekly benchmark unavailable, unbracketed, inconsistent or request failed; state fallback (not field validation)" };
    }) };
  } catch { return { status: "unavailable", reason: "NASS progress or mapping request failed; no survey benchmark invented", interpretation, seasons: [] }; }
}
