// "Replay a bad year on your field": for the field's own worst past years, what the farmer's current crops and
// the recommended plan would have yielded in that year's REAL weather (no trend shifting), next to what really
// happened in the county (USDA NASS) and what crop insurance paid out for (USDA RMA).
//
// Rules (GitHub issue #6): labelled as history, never a forecast; missing data stays missing; no forced winner.

import type { ClimateSummary, CountyLosses, CropId, DroughtReplay, ReplayCropOutcome, ReplayPlanOutcome, RotationPlan, YieldRecord } from "../shared/types";
import { round } from "../shared/units";
import { CROPS } from "./crops";
import type { ReplayYear } from "./rotation";
import { LOSS_WORDS, mainLossCause } from "./validate";

type Replay = (crop: CropId, prev: CropId) => ReplayYear[];
const known = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const optionalRound = (v: unknown, digits = 0): number | null => known(v) ? round(v, digits) : null;

/** Each year's yield as a % above/below its long-term trend line (real yields rise with better seed). */
export function trendDeviations(records: YieldRecord[]): Map<number, number> {
  const out = new Map<number, number>();
  if (records.length < 8) return out;
  const n = records.length;
  const mx = records.reduce((a, r) => a + r.year, 0) / n;
  const my = records.reduce((a, r) => a + r.value, 0) / n;
  const sxx = records.reduce((a, r) => a + (r.year - mx) ** 2, 0);
  const b = sxx > 0 ? records.reduce((a, r) => a + (r.year - mx) * (r.value - my), 0) / sxx : 0;
  for (const r of records) {
    const t = my + b * (r.year - mx);
    if (t > 0) out.set(r.year, Math.round((r.value / t - 1) * 100));
  }
  return out;
}

interface Input {
  climate: ClimateSummary;
  /** Replays every past year for a crop after a previous crop, with this field's water level. */
  replay: Replay;
  plan: RotationPlan;
  current: RotationPlan | null;
  /** Last crop the farmer grew (to know what precedes the first plan year). */
  lastCrop: CropId | null;
  usualPrev: (crop: CropId) => CropId;
  prices: Partial<Record<CropId, number>>;
  /** County yield series per crop, best first (e.g. rain-fed, then all fields for years without a rain-fed figure). */
  countyYields: Partial<Record<CropId, { records: YieldRecord[]; fields: "rain-fed" | "all" }[]>>;
  losses: CountyLosses | null;
  /** How many bad years to offer. */
  count?: number;
}

/** Per-crop outcome in one past year, scaled from the plan's typical expected yield. */
function outcomeFor(plan: RotationPlan, lastCrop: CropId | null, usualPrev: Input["usualPrev"], replay: Replay, year: number, prices: Input["prices"], cache: Map<string, ReplayYear[]>): ReplayPlanOutcome {
  const crops: ReplayCropOutcome[] = [];
  const seen = new Set<string>();
  plan.years.forEach((py, k) => {
    if (py.crop === "fallow") return;
    const prev: CropId = k > 0 ? (plan.years[k - 1]!.crop as CropId) : (lastCrop ?? usualPrev(py.crop));
    const key = `${py.crop}>${prev}`;
    if (seen.has(key)) return;
    seen.add(key);
    let series = cache.get(key);
    if (!series) {
      series = replay(py.crop, prev);
      cache.set(key, series);
    }
    const mean = series.reduce((a, r) => a + r.yieldFrac, 0) / Math.max(1, series.length);
    const that = series.find((r) => r.year === year);
    if (!that || !(mean > 0)) return; // missing stays missing
    const rel = that.yieldFrac / mean;
    const yieldThatYear = py.expectedYield * rel;
    const price = prices[py.crop] ?? CROPS[py.crop].pricePerUnit;
    const tons = py.yieldUnit.startsWith("tons");
    crops.push({
      crop: py.crop,
      cropName: py.cropName,
      afterCropName: CROPS[prev].name,
      yield: round(yieldThatYear, tons ? 1 : 0),
      unit: py.yieldUnit,
      pctVsTypical: Math.round((rel - 1) * 100),
      // Same costs as a typical year (seed, fertilizer, pumping); only the harvest changes.
      netPerAcre: Math.round(py.netReturnPerAcre + (yieldThatYear - py.expectedYield) * price),
      mainStress: that.mainStress,
    });
  });
  const avg = crops.length ? crops.reduce((a, c) => a + c.netPerAcre, 0) / crops.length : null;
  return { label: plan.label.replace(/^Current pattern: /, ""), crops, avgNetPerAcre: avg === null ? null : Math.round(avg) };
}

export function buildDroughtReplays(inp: Input): DroughtReplay[] {
  const cache = new Map<string, ReplayYear[]>();
  // Which crop decides "bad year": the farmer's current main crop, else the plan's first real crop.
  const refPlan = inp.current ?? inp.plan;
  const refYear = refPlan.years.find((y) => y.crop !== "fallow");
  if (!refYear) return [];
  const refPrev = inp.lastCrop && inp.lastCrop !== refYear.crop ? inp.lastCrop : inp.usualPrev(refYear.crop);
  const refSeries = inp.replay(refYear.crop, refPrev);
  const worst = [...refSeries]
    .sort((a, b) => a.yieldFrac - b.yieldFrac)
    .slice(0, inp.count ?? 3)
    .map((r) => r.year)
    .sort((a, b) => a - b);

  const rain = inp.climate.indicators.find((i) => i.id === "gs_rain");
  const heat = inp.climate.indicators.find((i) => i.id === "hot_days");
  const deviations = new Map<CropId, { dev: Map<number, number>; fields: "rain-fed" | "all" }[]>();
  for (const [c, list] of Object.entries(inp.countyYields) as [CropId, { records: YieldRecord[]; fields: "rain-fed" | "all" }[]][])
    deviations.set(c, list.map((s) => ({ dev: trendDeviations(s.records), fields: s.fields })));

  return worst.map((year) => {
    const ri = rain ? rain.years.indexOf(year) : -1;
    const hi = heat ? heat.years.indexOf(year) : -1;
    const planOut = outcomeFor(inp.plan, inp.lastCrop, inp.usualPrev, inp.replay, year, inp.prices, cache);
    const currentOut = inp.current ? outcomeFor(inp.current, inp.lastCrop, inp.usualPrev, inp.replay, year, inp.prices, cache) : null;
    const cropsShown = new Set<CropId>([...planOut.crops, ...(currentOut?.crops ?? [])].map((c) => c.crop));
    const county = [...cropsShown].flatMap((c) => {
      const hit = deviations.get(c)?.find((s) => s.dev.has(year));
      return hit ? [{ crop: c, cropName: CROPS[c].name, actualPct: hit.dev.get(year) as number, fields: hit.fields }] : [];
    });
    const insurance = [...cropsShown]
      .map((c) => ({ crop: c, cropName: CROPS[c].name, cause: mainLossCause(inp.losses, c, year) }))
      .filter((c) => c.cause !== null)
      .map((c) => ({ crop: c.crop, cropName: c.cropName, cause: LOSS_WORDS[c.cause!] }));
    return {
      year,
      weather: {
        seasonRainIn: rain && ri >= 0 ? optionalRound(rain.values[ri], 1) : null,
        typicalSeasonRainIn: optionalRound(rain?.mean, 1),
        hotDays: heat && hi >= 0 ? optionalRound(heat.values[hi]) : null,
        typicalHotDays: optionalRound(heat?.mean),
      },
      current: currentOut,
      plan: planOut,
      county,
      insurance,
    };
  });
}
