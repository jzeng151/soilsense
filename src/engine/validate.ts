// Checks the model against reality: its replay of each past year vs. what the county actually harvested
// (USDA NASS county yields). Real yields rise over time with better seed and machinery, so both series are
// compared as departures from their own long-term level: did the model call the good and bad years?

import type { CountyLosses, CropHistoryYear, CropId, CropValidation, EtMonth, LossGroup, WaterCheck, YieldRecord } from "../shared/types";
import { round } from "../shared/units";
import { CROPS } from "./crops";
import type { ReplayYear } from "./rotation";

export type { YieldRecord };

const MIN_YEARS = 12;

export const LOSS_WORDS: Record<LossGroup, string> = {
  drought: "drought or heat",
  wet: "too much rain or flooding",
  hail: "hail",
  wind: "wind storms",
  cold: "freeze or cold",
  pests: "disease or insects",
  other: "other causes",
};

/** Main insured cause of loss for a crop in a year, if insurance paid out anything. */
export function mainLossCause(losses: CountyLosses | null | undefined, crop: CropId, year: number): LossGroup | null {
  const vals = losses?.crops[crop]?.[String(year)];
  if (!vals || !losses) return null;
  let best = -1;
  vals.forEach((v, i) => {
    if (v > 0 && (best < 0 || v > (vals[best] as number))) best = i;
  });
  return best >= 0 ? (losses.groups[best] ?? null) : null;
}

/** Least-squares line through (x, y). */
function linearFit(xs: number[], ys: number[]): (x: number) => number {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  const sxx = xs.reduce((a, x) => a + (x - mx) ** 2, 0);
  const slope = sxx > 0 ? xs.reduce((a, x, i) => a + (x - mx) * ((ys[i] as number) - my), 0) / sxx : 0;
  return (x) => my + slope * (x - mx);
}

export function pearson(a: number[], b: number[]): number {
  const n = a.length;
  const ma = a.reduce((x, y) => x + y, 0) / n;
  const mb = b.reduce((x, y) => x + y, 0) / n;
  const cov = a.reduce((s, x, i) => s + (x - ma) * ((b[i] as number) - mb), 0);
  const den = Math.sqrt(a.reduce((s, x) => s + (x - ma) ** 2, 0) * b.reduce((s, x) => s + (x - mb) ** 2, 0));
  return den > 0 ? cov / den : 0;
}

export function validateCrop(
  crop: CropId,
  afterCrop: CropId,
  replay: ReplayYear[],
  records: YieldRecord[],
  label: { practice: "rain-fed" | "all"; area: string } = { practice: "all", area: "county" },
  losses?: CountyLosses | null,
): CropValidation | null {
  const byYear = new Map(records.map((r) => [r.year, r.value]));
  const rows = replay.filter((r) => byYear.has(r.year));
  if (rows.length < MIN_YEARS) return null;
  const years = rows.map((r) => r.year);
  const actual = rows.map((r) => byYear.get(r.year) as number);
  const trend = linearFit(years, actual);
  const meanFrac = rows.reduce((a, r) => a + r.yieldFrac, 0) / rows.length;
  if (!(meanFrac > 0)) return null;
  const actualDev = actual.map((y, i) => y / trend(years[i] as number) - 1);
  const modelDev = rows.map((r) => r.yieldFrac / meanFrac - 1);
  const order = years.map((_, i) => i).sort((a, b) => (actualDev[a] as number) - (actualDev[b] as number));
  const worst = order.slice(0, 5);
  const unit = CROPS[crop].yieldUnit;
  const digits = unit.startsWith("tons") ? 2 : 0;
  return {
    crop,
    cropName: CROPS[crop].name,
    afterCropName: CROPS[afterCrop].name,
    unit,
    years,
    actual: actual.map((v) => round(v, digits + 1)),
    modeled: rows.map((r, i) => round(Math.max(0, trend(years[i] as number) * (r.yieldFrac / meanFrac)), digits + 1)),
    correlation: round(pearson(actualDev, modelDev), 2),
    sameDirection: actualDev.filter((a, i) => Math.sign(a) === Math.sign(modelDev[i] as number)).length,
    worstYearsFlagged: worst.filter((i) => (modelDev[i] as number) < 0).length,
    worstYears: worst.map((i) => {
      const cause = mainLossCause(losses, crop, years[i] as number);
      return { year: years[i] as number, actualPct: Math.round((actualDev[i] as number) * 100), modeledPct: Math.round((modelDev[i] as number) * 100), ...(cause ? { cause: LOSS_WORDS[cause] } : {}) };
    }),
    // A bad year counts as missed when the model saw less than half of the real drop.
    ...(losses ? { missesExplained: explainMisses(worst.filter((i) => (modelDev[i] as number) > (actualDev[i] as number) * 0.5).map((i) => years[i] as number), crop, losses) } : {}),
    source: `USDA NASS Quick Stats ${label.area === "county" ? "county" : `${label.area} district`} yields, ${label.practice === "rain-fed" ? "non-irrigated fields" : "all fields"}`,
    practice: label.practice,
    area: label.area,
  };
}

const NOT_MODELLED: LossGroup[] = ["wet", "hail", "wind", "cold", "pests"];

/** Bad years the model missed, and how many crop insurance blames on causes outside a water model. */
function explainMisses(missedYears: number[], crop: CropId, losses: CountyLosses): { missed: number; otherCauses: number; causes: string[] } {
  const causes: string[] = [];
  let other = 0;
  for (const y of missedYears) {
    const g = mainLossCause(losses, crop, y);
    if (g && NOT_MODELLED.includes(g)) {
      other++;
      causes.push(`${y}: ${LOSS_WORDS[g]}`);
    }
  }
  return { missed: missedYears.length, otherCauses: other, causes };
}

/** Share of all insured losses (since the first year on record) by cause, largest first. */
export function lossShares(losses: CountyLosses, crop: CropId): { group: LossGroup; share: number; years: number }[] {
  const byYear = losses.crops[crop];
  if (!byYear) return [];
  const totals = losses.groups.map(() => 0);
  const years = losses.groups.map(() => 0);
  for (const vals of Object.values(byYear))
    vals.forEach((v, i) => {
      totals[i] = (totals[i] as number) + v;
      if (v > 0) years[i] = (years[i] as number) + 1;
    });
  const sum = totals.reduce((a, b) => a + b, 0);
  if (sum <= 0) return [];
  return losses.groups
    .map((g, i) => ({ group: g, share: (totals[i] as number) / sum, years: years[i] as number }))
    .filter((x) => x.share > 0)
    .sort((a, b) => b.share - a.share);
}

/**
 * Independent check of the water model: for each year the satellite crop map shows one of our crops on the
 * field, compare the model's water use over that crop's season with OpenET's measured evapotranspiration
 * (NASA/USGS Landsat) over the same months. Needs at least 4 matching years.
 */
export function checkWaterUse(
  months: EtMonth[],
  history: CropHistoryYear[],
  replay: (crop: CropId, prev: CropId) => ReplayYear[],
  usualPrev: (crop: CropId) => CropId,
): WaterCheck | null {
  const et = new Map(months.map((m) => [m.year * 100 + m.month, m.et]));
  const cropIn = new Map(history.map((h) => [h.year, h.crop]));
  const rows: { year: number; crop: CropId; measured: number; modeled: number }[] = [];
  for (const h of history) {
    const crop = h.crop;
    if (!crop || crop === "fallow") continue;
    const season = CROPS[crop].season;
    let measured = 0;
    let complete = true;
    for (let m = season.from[0]; m <= season.to[0]; m++) {
      const v = et.get(h.year * 100 + m);
      if (v === undefined) complete = false;
      else measured += v;
    }
    if (!complete) continue;
    const before = cropIn.get(h.year - 1);
    const prev = before ?? usualPrev(crop);
    const sim = replay(crop, prev).find((r) => r.year === h.year);
    if (!sim || !(sim.waterUse > 0)) continue;
    rows.push({ year: h.year, crop, measured, modeled: sim.waterUse });
  }
  if (rows.length < 4) return null;
  const meanOf = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  return {
    years: rows.map((r) => r.year),
    crops: rows.map((r) => CROPS[r.crop].name),
    measured: rows.map((r) => Math.round(r.measured)),
    modeled: rows.map((r) => Math.round(r.modeled)),
    correlation: round(pearson(rows.map((r) => r.measured), rows.map((r) => r.modeled)), 2),
    ratio: round(meanOf(rows.map((r) => r.measured)) / meanOf(rows.map((r) => r.modeled)), 2),
    source: "OpenET Ensemble actual evapotranspiration (NASA/USGS Landsat), monthly, summed over each crop's season",
  };
}
