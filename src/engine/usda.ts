// Turns raw USDA NASS records into what the engine needs:
//   - a recent average yield for THIS field's practice (irrigated or rain-fed),
//   - the best real-harvest series to check the model against,
//   - current prices.
//
// NASS stopped splitting county yields into irrigated / non-irrigated around 2010 (districts ~2016-2019);
// recent years are published only as "all practices". So the practice yield today is estimated as
//   recent all-practice average × (practice yield ÷ all-practice yield, averaged over years that have both),
// at county level when possible, otherwise at district level.

import type { CropId, CropPrice, NassData, PracticeSeries, YieldRecord } from "../shared/types";
import { ALL_CROPS } from "./crops";

export interface RecentYield {
  value: number;
  /** Plain description for the assumptions list. */
  basis: string;
}

export interface ValidationSeries {
  records: YieldRecord[];
  practice: "rain-fed" | "all";
  area: string;
}

export interface UsdaInputs {
  recent: Partial<Record<CropId, RecentYield>>;
  validation: Partial<Record<CropId, ValidationSeries>>;
  prices: Partial<Record<CropId, CropPrice>>;
}

const MIN_RATIO_YEARS = 3;
const MIN_VALIDATION_YEARS = 12;
const RECENT_WINDOW = 10; // years
const RECENT_N = 5; // reports averaged

function recentAverage(rs: YieldRecord[], currentYear: number): { value: number; n: number; last: number } | null {
  const recent = rs.filter((r) => r.year >= currentYear - RECENT_WINDOW).slice(-RECENT_N);
  if (recent.length < 2) return null;
  return { value: recent.reduce((a, r) => a + r.value, 0) / recent.length, n: recent.length, last: recent[recent.length - 1]!.year };
}

/** Mean of practice ÷ all over the years both exist. */
export function practiceRatio(s: PracticeSeries | undefined, practice: "irrigated" | "nonIrrigated"): { ratio: number; years: number } | null {
  if (!s) return null;
  const all = new Map(s.all.map((r) => [r.year, r.value]));
  const pairs = s[practice].filter((r) => all.has(r.year)).map((r) => r.value / (all.get(r.year) as number));
  if (pairs.length < MIN_RATIO_YEARS) return null;
  const mean = pairs.reduce((a, b) => a + b, 0) / pairs.length;
  return { ratio: Math.min(1.6, Math.max(0.3, mean)), years: pairs.length };
}

export function usdaInputs(nass: NassData, irrigated: boolean, currentYear: number): UsdaInputs {
  const recent: UsdaInputs["recent"] = {};
  const validation: UsdaInputs["validation"] = {};
  const practice = irrigated ? "irrigated" : "nonIrrigated";
  const practiceWord = irrigated ? "irrigated" : "rain-fed";
  const district = nass.districtName ?? "district";

  for (const crop of ALL_CROPS) {
    const c = nass.county[crop];
    const d = nass.district[crop];

    // 1. Recent average for this field's practice. Best: USDA's own practice series, if it is recent
    // (county, then district). Otherwise: recent all-practice average × the practice ratio.
    const directCounty = recentAverage(c?.[practice] ?? [], currentYear);
    const directDistrict = recentAverage(d?.[practice] ?? [], currentYear);
    const direct = directCounty ?? directDistrict;
    if (direct && direct.n >= 3) {
      recent[crop] = {
        value: direct.value,
        basis: `USDA ${directCounty ? "county" : `${district} district`} average for ${practiceWord} fields, ${direct.n} reports up to ${direct.last}`,
      };
    }
    const base = recentAverage(c?.all ?? [], currentYear) ?? recentAverage(d?.all ?? [], currentYear);
    const baseArea = recentAverage(c?.all ?? [], currentYear) ? "county" : `${district} district`;
    if (base && !recent[crop]) {
      const r = practiceRatio(c, practice) ?? practiceRatio(d, practice);
      const rArea = practiceRatio(c, practice) ? "county" : `${district} district`;
      recent[crop] = r
        ? {
            value: base.value * r.ratio,
            basis: `${baseArea} average for ${base.n} recent years × ${Math.round(r.ratio * 100)}% (how ${practiceWord} fields compared with all fields in ${r.years} years of ${rArea} records)`,
          }
        : { value: base.value, basis: `${baseArea} average for ${base.n} recent years (all fields; USDA has no ${practiceWord} split here)` };
    }

    // 2. Series for the real-harvest check (always rain-fed: that is where weather drives yields).
    if ((c?.nonIrrigated.length ?? 0) >= MIN_VALIDATION_YEARS) validation[crop] = { records: c!.nonIrrigated, practice: "rain-fed", area: "county" };
    else if ((d?.nonIrrigated.length ?? 0) >= MIN_VALIDATION_YEARS) validation[crop] = { records: d!.nonIrrigated, practice: "rain-fed", area: district };
    else if ((c?.all.length ?? 0) >= MIN_VALIDATION_YEARS) validation[crop] = { records: c!.all, practice: "all", area: "county" };
  }
  return { recent, validation, prices: nass.prices };
}
