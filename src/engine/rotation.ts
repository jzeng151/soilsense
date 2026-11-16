// Rotation engine: evaluates every feasible 3-year rotation (main crop + winter cover)
// against trend-adjusted NASA weather history, soil, economics and farmer priority.

import type { CoverId, CropId, Goal, PlanYear, Priority, RotationPlan, ScoreBreakdown, SoilProfile } from "../shared/types";
import { constraintWater } from '../shared/constraintWater';
import type { ConstraintCode, ConstraintIssue, ConstraintReport, FarmerConstraints } from '../shared/constraints';
import { cropConstraintIssues, normalizeConstraints, sequenceConstraintIssues } from './constraints';
import { clamp, round } from "../shared/units";
import {
  coldDays,
  type DailyClimate,
  degreeDaysAbove,
  et0HargreavesMm,
  frostFreeDays,
  gddC,
  rainMm,
  SPRING,
  type YearSeries,
} from "./climate";
import { ALL_CROPS, COVERS, CROPS, type CropDef, NITROGEN_PRICE_PER_LB, nitrogenNeed, rotationYieldFactor } from "./crops";
import { createGoalScorer, selectedGoals } from "./goals";
import { isSignificant, mannKendall } from "./stats";

export const PRIORITY_WEIGHTS: Record<Priority, Pick<ScoreBreakdown, "climate" | "reliability" | "soil" | "profit">> = {
  profit: { climate: 0.25, reliability: 0.15, soil: 0.15, profit: 0.45 },
  soil: { climate: 0.2, reliability: 0.15, soil: 0.45, profit: 0.2 },
  risk: { climate: 0.25, reliability: 0.4, soil: 0.1, profit: 0.25 },
  balanced: { climate: 0.25, reliability: 0.2, soil: 0.25, profit: 0.3 },
};

const STRESS_THRESHOLD = 0.6;
/** A crop must come through without stress in at least 40% of (recent-weighted) years to be recommended. */
const MIN_RECOMMENDED_RELIABILITY = 0.4;
/**
 * Pumping cost per inch of irrigation water, $/acre (energy, maintenance, labor; approximate K-State center-pivot
 * budget). About 14 in of full irrigation therefore costs about $110/acre, as the earlier flat assumption did.
 */
const IRRIGATION_COST_PER_INCH = 8;
/** $/acre/year below the best plan at which the profit score reaches zero. */
const PROFIT_SCALE_PER_ACRE = 200;
const DEFAULT_AWC = 0.17; // cm/cm, typical loam
const DEFAULT_PROFILE_MM = 1500;

export type StressFactor = "water" | "heat" | "season length" | "wet spring" | "winter cold" | "too much rain";

export interface MetricTrend {
  metric: string;
  slopePerYear: number;
  pValue: number;
  applied: boolean;
}

export interface CropClimate {
  crop: CropId;
  /** Recent-weighted mean of yearly scores (0–1). */
  climateScore: number;
  /** Recent-weighted share of years with score ≥ 0.6. */
  reliability: number;
  stressedYears: number;
  totalYears: number;
  mainStress: StressFactor | null;
  /** Soil suitability factor applied to yield (1 = no limitation). */
  soilFactor: number;
  soilNotes: string[];
  metricTrends: MetricTrend[];
  /** Per weather year (same order as climate.years), used by the rotation water simulation. */
  yearly: {
    /** Effective in-season rain (75% of trend-adjusted season rain), mm. */
    effRain: number[];
    /** Crop water need that year: kc × Hargreaves reference ET over the season, mm. */
    need: number[];
    /** Product of the non-water stress scores (heat, season length, wet spring, winter cold), 0-1. */
    nonWater: number[];
    nonWaterWorst: (StressFactor | null)[];
    nonWaterWorstVal: number[];
  };
}

/** Weather and soil facts the water simulation needs, shared by every rotation. */
export interface WaterContext {
  /** Number of weather years. */
  n: number;
  /** Monthly precipitation per weather year: monthRain[yearIndex][month 1-12], mm. */
  monthRain: number[][];
  /** Monthly reference evapotranspiration (Hargreaves), same shape, mm. */
  monthEt0: number[][];
  /** Recent-decade weighting per weather year (2 = last 10 years). */
  weights: number[];
  awc: number;
  profileMm: number;
  /** Plant-available water the whole profile (to 2 m) can hold, mm (80% of AWC, as at planting before). */
  profileCap: number;
  /** Full irrigation: the crop's water need is always met. */
  irrigated: boolean;
  /** Limited irrigation: up to this much water can be pumped per crop season, mm (0 = rain only). */
  allowanceMm: number;
}

/** Limited irrigation allowance, mm per season: about 10 inches, as in K-State's Tribune limited-irrigation trial. */
export const LIMITED_IRRIGATION_MM = 254;

/**
 * Between crops the soil keeps each month's rain minus what evaporates from the bare, residue-covered
 * surface: stored = max(0, rain - BARE_SOIL_EVAP x reference ET). One rule for every climate: a cold,
 * wet Iowa winter refills the soil almost fully, a hot Kansas summer fallow keeps about 30% (matching published no-till fallow efficiency of 25-35% in the central Great Plains).
 */
const BARE_SOIL_EVAP = 0.38;
/** Season rain above the crop's whole water need starts to hurt (waterlogging, nitrogen loss, disease, less sun). */
const EXCESS_RAIN_LOSS = 1.0;
/** Water a fall-sown crop uses from the soil between sowing and spring green-up, mm (approximate). */
const FALL_ESTABLISHMENT_USE_MM = 90;
/** A winter cover crop uses part of the water that would otherwise be stored. */
const COVER_WATER_USE = 0.4;

export function buildWaterContext(climate: DailyClimate, soil: SoilProfile, irrigated: boolean, allowanceMm = 0): WaterContext {
  const monthRain = climate.years.map((ys) => {
    const m = new Array<number>(13).fill(0);
    for (const d of ys.days) m[d.month] = (m[d.month] ?? 0) + (d.prcp ?? 0);
    return m;
  });
  const lat = Number.isFinite(climate.gridCell.lat) ? climate.gridCell.lat : 40;
  const monthEt0 = climate.years.map((ys) => {
    const m = new Array<number>(13).fill(0);
    for (let k = 1; k <= 12; k++) m[k] = et0HargreavesMm(ys, { from: [k, 1], to: [k, 31] }, lat);
    return m;
  });
  const recentFrom = climate.lastYear - 9;
  const awc = soil.awc ?? DEFAULT_AWC;
  // SSURGO descriptions usually stop at ~150 cm even where the soil continues; treat that as deep (2 m).
  const described = soil.profileDepthCm ?? DEFAULT_PROFILE_MM / 10;
  const profileMm = described >= 150 ? 2000 : described * 10;
  return {
    n: climate.years.length,
    monthRain,
    monthEt0,
    weights: climate.years.map((y) => (y.year >= recentFrom ? 2 : 1)),
    awc,
    profileMm,
    profileCap: 0.8 * awc * profileMm,
    irrigated,
    allowanceMm: irrigated ? 0 : Math.max(0, allowanceMm),
  };
}

/** Mean annual precipitation, mm. */
export function meanAnnualRainMm(ctx: WaterContext): number {
  return ctx.monthRain.reduce((a, m) => a + m.reduce((x, y) => x + y, 0), 0) / Math.max(1, ctx.n);
}

interface Metrics {
  rain: number;
  heat: number;
  gdd: number | null;
  ffd: number;
  spring: number;
  cold: number | null;
}

function cropMetrics(ys: YearSeries, c: CropDef): Metrics {
  return {
    rain: rainMm(ys, c.season),
    heat: degreeDaysAbove(ys, c.heatWindow, c.heatThresholdC),
    gdd: c.gddNeedC > 0 ? gddC(ys, c.season) : null,
    ffd: frostFreeDays(ys),
    spring: rainMm(ys, SPRING),
    cold: c.winterKill ? coldDays(ys, { from: [1, 1], to: [2, 29] }, c.winterKill.thresholdC) : null,
  };
}

/** Shift each year's value by the significant trend so history reflects the target year's climate. */
function trendAdjust(years: number[], values: number[], targetYear: number, metric: string, floor = 0): { adjusted: number[]; trend: MetricTrend } {
  const t = mannKendall(years, values);
  const applied = isSignificant(t);
  const adjusted = applied
    ? values.map((v, i) => Math.max(floor, v + t.slopePerYear * (targetYear - (years[i] as number))))
    : values;
  return { adjusted, trend: { metric, slopePerYear: t.slopePerYear, pValue: t.pValue, applied } };
}

export function soilSuitability(crop: CropDef, soil: SoilProfile): { factor: number; notes: string[] } {
  let factor = 1;
  const notes: string[] = [];
  if (soil.ph !== undefined && soil.ph < crop.minPh) {
    const f = crop.id === "alfalfa" ? 0.75 : 0.92;
    factor *= f;
    notes.push(`${crop.name} prefers pH ≥ ${crop.minPh}; topsoil pH is ${soil.ph.toFixed(1)} (lime would help).`);
  }
  const poor = soil.drainageClass ? /poorly/i.test(soil.drainageClass) : false;
  if (poor && !crop.toleratesPoorDrainage) {
    const f = crop.id === "alfalfa" ? 0.65 : 0.85;
    factor *= f;
    notes.push(`${crop.name} does poorly on ${soil.drainageClass?.toLowerCase()} soils.`);
  }
  return { factor, notes };
}

export type CropWeatherMemo = Map<CropId, { metrics: Metrics[]; need: number[] }>;

export function evaluateCropClimate(
  climate: DailyClimate,
  soil: SoilProfile,
  irrigated: boolean,
  targetYear: number,
  /** adjustTrends: false keeps each year's weather exactly as it happened (used to check the model against real harvests). */
  opts: { adjustTrends?: boolean; weatherMemo?: CropWeatherMemo } = {},
): Record<CropId, CropClimate> {
  const years = climate.years.map((y) => y.year);
  const recentFrom = climate.lastYear - 9;
  const weights = years.map((y) => (y >= recentFrom ? 2 : 1));
  const wSum = weights.reduce((a, b) => a + b, 0);
  const awc = soil.awc ?? DEFAULT_AWC;
  const describedCm = soil.profileDepthCm ?? DEFAULT_PROFILE_MM / 10;
  const profileMm = describedCm >= 150 ? 2000 : describedCm * 10;
  const lat = Number.isFinite(climate.gridCell.lat) ? climate.gridCell.lat : 40;

  const out = {} as Record<CropId, CropClimate>;
  for (const id of ALL_CROPS) {
    const c = CROPS[id];
    if (id === "fallow") {
      const ones = years.map(() => 1);
      out[id] = {
        crop: id, climateScore: 1, reliability: 1, stressedYears: 0, totalYears: years.length, mainStress: null,
        soilFactor: 1, soilNotes: [], metricTrends: [],
        yearly: { effRain: years.map(() => 0), need: years.map(() => 0), nonWater: ones, nonWaterWorst: years.map(() => null), nonWaterWorstVal: ones },
      };
      continue;
    }
    let weather = opts.weatherMemo?.get(id);
    if (!weather) {
      weather = {
        metrics: climate.years.map((ys) => cropMetrics(ys, c)),
        need: climate.years.map((ys) => Math.max(1, c.kc * et0HargreavesMm(ys, c.season, lat))),
      };
      opts.weatherMemo?.set(id, weather);
    }
    const m = weather.metrics;
    const trends: MetricTrend[] = [];
    const adj = (name: string, vals: number[]) => {
      if (opts.adjustTrends === false) return vals;
      const r = trendAdjust(years, vals, targetYear, name);
      trends.push(r.trend);
      return r.adjusted;
    };
    const rain = adj("season rain", m.map((x) => x.rain));
    const heat = adj("extreme heat degree days", m.map((x) => x.heat));
    // Irrigation cools the canopy and removes most drought-heat interaction.
    const heatDamage = c.heatDamagePerDegreeDay * (irrigated ? 0.35 : 1);
    const gdd = c.gddNeedC > 0 ? adj("growing degree days", m.map((x) => x.gdd ?? 0)) : null;
    const ffd = c.frostFreeNeedDays > 0 ? adj("frost-free days", m.map((x) => x.ffd)) : null;
    const spring = c.wetSpringLimitMm > 0 ? adj("spring rain", m.map((x) => x.spring)) : null;
    const cold = c.winterKill ? adj("severe cold days", m.map((x) => x.cold ?? 0)) : null;

    const storage = 0.8 * awc * Math.min(c.rootDepthMm, profileMm);
    const stressCounts = new Map<StressFactor, number>();
    let scoreSum = 0;
    let reliableSum = 0;
    let stressed = 0;
    const yearly: CropClimate["yearly"] = { effRain: [], need: [], nonWater: [], nonWaterWorst: [], nonWaterWorstVal: [] };
    const need = weather.need;

    years.forEach((_, i) => {
      const comps: [StressFactor, number][] = [];
      const needI = need[i] as number;
      const avail = 0.75 * (rain[i] as number) + storage + (irrigated ? needI : 0);
      comps.push(["water", clamp((avail / needI - c.waterYieldThreshold) / (1 - c.waterYieldThreshold))]);
      comps.push(["heat", clamp(1 - (heat[i] as number) * heatDamage)]);
      const wetRatio = (0.75 * (rain[i] as number)) / needI;
      if (wetRatio > 1) comps.push(["too much rain", clamp(1 - (wetRatio - 1) * EXCESS_RAIN_LOSS, 0.4, 1)]);
      let season = 1;
      if (gdd) season = Math.min(season, clamp(((gdd[i] as number) / c.gddNeedC - 0.85) / 0.15));
      if (ffd) season = Math.min(season, clamp(((ffd[i] as number) - (c.frostFreeNeedDays - 20)) / 20));
      comps.push(["season length", season]);
      if (spring) {
        const s = spring[i] as number;
        const lim = c.wetSpringLimitMm;
        comps.push(["wet spring", s <= lim ? 1 : clamp(1 - (s - lim) / (lim * 0.5), 0.6, 1)]);
      }
      if (cold && c.winterKill) comps.push(["winter cold", clamp(1 - (cold[i] as number) / c.winterKill.daysToFail)]);

      const nonWaterComps = comps.filter(([k]) => k !== "water");
      const worstNW = nonWaterComps.reduce<[StressFactor | null, number]>((a, b) => (b[1] < a[1] ? b : a), [null, 1]);
      yearly.effRain.push(0.75 * (rain[i] as number));
      yearly.need.push(needI);
      yearly.nonWater.push(nonWaterComps.reduce((a, [, v]) => a * v, 1));
      yearly.nonWaterWorst.push(worstNW[0]);
      yearly.nonWaterWorstVal.push(worstNW[1]);

      const score = comps.reduce((a, [, v]) => a * v, 1);
      const w = weights[i] as number;
      scoreSum += w * score;
      if (score >= STRESS_THRESHOLD) reliableSum += w;
      else {
        stressed += 1;
        const worst = comps.reduce((a, b) => (b[1] < a[1] ? b : a));
        stressCounts.set(worst[0], (stressCounts.get(worst[0]) ?? 0) + 1);
      }
    });

    const { factor, notes } = soilSuitability(c, soil);
    let mainStress: StressFactor | null = null;
    let best = 0;
    for (const [k, v] of stressCounts) if (v > best) [mainStress, best] = [k, v];

    out[id] = {
      crop: id,
      climateScore: scoreSum / wSum,
      reliability: reliableSum / wSum,
      stressedYears: stressed,
      totalYears: years.length,
      mainStress,
      soilFactor: factor,
      soilNotes: notes,
      metricTrends: trends,
      yearly,
    };
  }
  return out;
}

// ---------------- Plan enumeration and scoring ----------------

export interface EngineInput {
  constraints?: FarmerConstraints;
  cropClimate: Record<CropId, CropClimate>;
  /** Recent crops on the field, oldest first; last = most recent season. */
  history: CropId[];
  priority: Priority;
  goals?: Goal[];
  planStartYear: number;
  /** Optional county yields (e.g. from USDA NASS) keyed by crop. */
  baseYieldOverrides?: Partial<Record<CropId, number>>;
  /** Irrigated fields: higher yield potential, added pumping cost. */
  irrigated?: boolean;
  /** Plan generated after mid-October: winter wheat can no longer be sown for the first plan year. */
  firstYearWheatAllowed: boolean;
  /** Crops that may be scheduled (regional market availability, fallow where allowed). Defaults to all but fallow. */
  crops?: CropId[];
  /** Weather and soil context for the multi-year soil-water simulation. */
  water: WaterContext;
  /** Current prices (e.g. USDA NASS prices received), per crop unit; defaults from crops.ts otherwise. */
  prices?: Partial<Record<CropId, number>>;
  /**
   * Quick search: rank every crop sequence without cover crops first, then try cover-crop variants only for the
   * best `quickSearch` sequences. Used for the "what if your water changes?" comparison, where only the best
   * plan is needed; the field's own plan always uses the full search.
   */
  quickSearch?: number;
}

interface RawPlan {
  seq: CropId[];
  covers: CoverId[];
  years: PlanYear[];
  climate: number;
  reliability: number;
  soil: number;
  avgNet: number;
  totalN: number;
  waterUseIn: number;
}

// Crops harvested early enough to sow winter wheat after them (sorghum: common in the Plains, with a small yield cost).
const EARLY_HARVEST: CropId[] = ["soybean", "oats", "alfalfa", "sorghum", "fallow"];

/** Plain-language reason a sequence breaks the engine's rotation rules, or null. */
export function sequenceIssue(seq: CropId[], history: CropId[], firstYearWheatAllowed: boolean, startYear: number): string | null {
  const full = [...history, ...seq];
  const off = history.length;
  for (let i = 0; i < seq.length; i++) {
    const crop = seq[i] as CropId;
    const idx = off + i;
    if (crop === "winter_wheat" && i === 0 && !firstYearWheatAllowed)
      return `Winter wheat for ${startYear} had to be sown by mid-October ${startYear - 1}.`;
    if (crop === "fallow" && full[idx - 1] === "fallow") return "Two fallow seasons in a row lose two years of income.";
    if (crop !== "alfalfa" && crop !== "fallow" && full[idx - 1] === crop && full[idx - 2] === crop)
      return `This would put ${CROPS[crop].name.toLowerCase()} on the field three or more years in a row, which builds up pests and disease.`;
  }
  return null;
}

export function feasibleSequence(seq: CropId[], history: CropId[], firstYearWheatAllowed: boolean): boolean {
  const full = [...history, ...seq];
  const off = history.length;
  for (let i = 0; i < seq.length; i++) {
    const idx = off + i;
    const crop = seq[i] as CropId;
    const prev = full[idx - 1] ?? null;
    if (crop === "winter_wheat") {
      if (i === 0 && !firstYearWheatAllowed) return false;
      if (prev && !EARLY_HARVEST.includes(prev)) return false;
    }
    // Never two fallow seasons in a row; no annual crop three seasons in a row.
    if (crop === "fallow" && prev === "fallow") return false;
    if (crop !== "alfalfa" && crop !== "fallow" && full[idx - 1] === crop && full[idx - 2] === crop) return false;
    // An alfalfa stand that ends inside the plan must last at least two years
    // (a seeding-year-only stand is not a realistic hay rotation).
    if (crop === "alfalfa" && i < seq.length - 1 && seq[i + 1] !== "alfalfa") {
      let stand = 1;
      for (let k = idx - 1; k >= 0 && full[k] === "alfalfa"; k--) stand++;
      if (stand < 2) return false;
    }
  }
  return true;
}

function coverOptions(seq: CropId[], i: number): CoverId[] {
  const crop = seq[i] as CropId;
  const next = seq[i + 1];
  let opts = CROPS[crop].coversAfter;
  if (next === "winter_wheat" || next === "fallow") return ["none"];
  if (crop === "alfalfa" && next === "alfalfa") return ["none"];
  // Legume covers pay off by feeding nitrogen to a following corn or sorghum crop (or as the last fall's cover).
  if (next !== undefined && next !== "corn" && next !== "sorghum") opts = opts.filter((c) => !COVERS[c].legume);
  return opts;
}

function cartesian<T>(lists: T[][]): T[][] {
  return lists.reduce<T[][]>((acc, list) => acc.flatMap((a) => list.map((v) => [...a, v])), [[]]);
}

export function soilHealthScore(seq: CropId[], covers: CoverId[], history: CropId[]): number {
  let s = 0.3;
  if (seq.includes("soybean")) s += 0.1;
  if (seq.includes("alfalfa")) s += 0.15;
  if (seq.some((c) => c === "winter_wheat" || c === "oats")) s += 0.1;
  const grown = seq.filter((c) => c !== "fallow");
  s += 0.08 * Math.max(0, new Set(grown).size - 1);
  // A fallow season leaves soil bare: more erosion risk and organic-matter loss.
  s -= 0.12 * (seq.length - grown.length);
  for (const cv of covers) {
    if (cv !== "none") s += 0.08 + (COVERS[cv].legume ? 0.03 : 0);
  }
  for (let i = 0; i < seq.length; i++) {
    const prev = i === 0 ? history[history.length - 1] : seq[i - 1];
    if (prev && prev === seq[i] && seq[i] !== "alfalfa" && seq[i] !== "fallow") s -= 0.12;
  }
  return clamp(s);
}

/** Rain kept by bare soil in one month of one weather year, mm. */
const storedInMonth = (ctx: WaterContext, idx: number, m: number) =>
  Math.max(0, (ctx.monthRain[idx]![m] ?? 0) - BARE_SOIL_EVAP * (ctx.monthEt0[idx]![m] ?? 0));

/** Rain stored in the soil from the month after harvest (year A) to the month before the next crop starts (year B). */
const gapMemo = new WeakMap<WaterContext, Map<number, number>>();

function gapRecharge(ctx: WaterContext, idxA: number, endMonthA: number, idxB: number, startMonthB: number): number {
  let memo = gapMemo.get(ctx);
  if (!memo) {
    memo = new Map();
    gapMemo.set(ctx, memo);
  }
  const key = ((idxA * 13 + endMonthA) * 128 + idxB) * 13 + startMonthB;
  const hit = memo.get(key);
  if (hit !== undefined) return hit;
  const r = gapRechargeUncached(ctx, idxA, endMonthA, idxB, startMonthB);
  memo.set(key, r);
  return r;
}

function gapRechargeUncached(ctx: WaterContext, idxA: number, endMonthA: number, idxB: number, startMonthB: number): number {
  let r = 0;
  for (let m = endMonthA + 1; m <= 12; m++) r += storedInMonth(ctx, idxA, m);
  for (let m = 1; m < startMonthB; m++) r += storedInMonth(ctx, idxB, m);
  return r;
}

interface YearOutcome {
  /** Combined stress score 0-1 (water × heat × season × planting × winter). */
  score: number;
  /** Share of water-unlimited yield potential reached. */
  yieldFrac: number;
  worst: StressFactor | null;
  /** Plant-available water left in the profile after the crop, mm. */
  storageAfter: number;
  /** Water the crop used over its season (rain it could use + soil water drawn, or full need if irrigated), mm. */
  waterUse: number;
  /** Irrigation water pumped for this crop, mm. */
  pumped: number;
}

/** One crop in one weather year, starting with `storage` mm of plant-available water in the profile. */
function runCropYear(crop: CropId, idx: number, storage: number, input: EngineInput): YearOutcome {
  const ctx = input.water;
  const def = CROPS[crop];
  if (crop === "fallow") {
    // No crop uses water; the soil keeps the season's rain minus bare-soil evaporation.
    let stored = 0;
    for (let m = def.season.from[0]; m <= def.season.to[0]; m++) stored += storedInMonth(ctx, idx, m);
    return { score: 1, yieldFrac: 0, worst: null, storageAfter: Math.min(ctx.profileCap, storage + stored), waterUse: 0, pumped: 0 };
  }
  const y = input.cropClimate[crop].yearly;
  const effRain = y.effRain[idx] as number;
  const need = y.need[idx] as number;
  const rootCap = 0.8 * ctx.awc * Math.min(def.rootDepthMm, ctx.profileMm);
  // Fall-sown crops (winter wheat) use soil water to establish before winter, ahead of the spring season window.
  if (def.fallSeeded && !ctx.irrigated) storage = Math.max(0, storage - FALL_ESTABLISHMENT_USE_MM);
  const accessible = Math.min(storage, rootCap);
  let water = 1;
  let draw = 0;
  let pumped = 0;
  const deficit = Math.max(0, need - effRain);
  if (ctx.irrigated) {
    pumped = deficit;
  } else {
    // Limited irrigation covers the shortfall first, up to the allowance; stored soil water covers the rest.
    pumped = Math.min(ctx.allowanceMm, deficit);
    const ratio = (effRain + pumped + accessible) / need;
    const thr = def.waterYieldThreshold;
    water = clamp((ratio - thr) / (1 - thr));
    draw = clamp(deficit - pumped, 0, accessible);
  }
  const nonWater = y.nonWater[idx] as number;
  const nwWorstVal = y.nonWaterWorstVal[idx] as number;
  const score = water * nonWater;
  // Water limits yield in proportion (water-production function); other stresses are damped as before.
  const yieldFrac = water * (0.5 + 0.5 * nonWater);
  const worst: StressFactor | null = water < nwWorstVal ? "water" : (y.nonWaterWorst[idx] ?? null);
  const waterUse = ctx.irrigated ? need : Math.min(need, effRain + pumped + draw);
  return { score, yieldFrac, worst, storageAfter: storage - draw, waterUse, pumped };
}

interface SimulatedYear {
  climateScore: number;
  reliability: number;
  mainStress: StressFactor | null;
  yieldFrac: number;
  /** Average irrigation pumped, mm. */
  pumpedMm: number;
  waterUseMm: number;
}

/**
 * Replays the 3-year plan against every run of consecutive historical weather years, carrying soil water
 * from one season to the next (a crop that dries the subsoil leaves less for the next one; fallow refills it).
 */
const spinUpMemo = new WeakMap<EngineInput, { storage: number[]; lastEnd: number }>();

/** Soil water after the field's last known crop, for each weather scenario (same for every candidate plan). */
function spinUp(input: EngineInput): { storage: number[]; lastEnd: number } {
  const hit = spinUpMemo.get(input);
  if (hit) return hit;
  const ctx = input.water;
  const n = ctx.n;
  const prevCrop = input.history[input.history.length - 1] ?? null;
  const out = prevCrop
    ? { storage: Array.from({ length: n }, (_, i) => runCropYear(prevCrop, (i - 1 + n) % n, 0.6 * ctx.profileCap, input).storageAfter), lastEnd: CROPS[prevCrop].season.to[0] }
    : { storage: Array.from({ length: n }, () => 0.3 * ctx.profileCap), lastEnd: 9 };
  spinUpMemo.set(input, out);
  return out;
}

const simulationMemo = new WeakMap<EngineInput, Map<string, SimulatedYear[]>>();

function simulate(seq: CropId[], covers: CoverId[], input: EngineInput): SimulatedYear[] {
  // The last cover is planted after the simulation ends. Before then, all non-empty
  // covers consume the same recharge fraction, and full irrigation removes that effect.
  // Costs, N credits and yield effects still use the exact cover in evaluate().
  const key = seq.join(",") + (input.water.irrigated ? "" : `:${covers.slice(0, -1).map((c) => Number(c !== "none")).join("")}`);
  let memo = simulationMemo.get(input);
  if (!memo) simulationMemo.set(input, memo = new Map());
  const hit = memo.get(key);
  if (hit) return hit;
  const result = simulateUncached(seq, covers, input);
  memo.set(key, result);
  return result;
}

function simulateUncached(seq: CropId[], covers: CoverId[], input: EngineInput): SimulatedYear[] {
  const ctx = input.water;
  const n = ctx.n;
  const start = spinUp(input);
  const acc = seq.map(() => ({ w: 0, score: 0, reliable: 0, yieldFrac: 0, pumped: 0, waterUse: 0, stress: new Map<StressFactor, number>() }));

  for (let i = 0; i < n; i++) {
    let prevIdx = (i - 1 + n) % n;
    // Spin up with the field's last known crop in the preceding weather year (or a typical summer crop).
    let storage = start.storage[i] as number;
    let lastEnd = start.lastEnd;
    for (let k = 0; k < seq.length; k++) {
      const crop = seq[k] as CropId;
      const idx = (i + k) % n;
      const coverBefore = k > 0 && covers[k - 1] !== "none";
      const recharge = gapRecharge(ctx, prevIdx, lastEnd, idx, CROPS[crop].season.from[0]);
      storage = Math.min(ctx.profileCap, storage + recharge * (coverBefore && !ctx.irrigated ? 1 - COVER_WATER_USE : 1));
      const out = runCropYear(crop, idx, storage, input);
      storage = out.storageAfter;
      lastEnd = CROPS[crop].season.to[0];
      prevIdx = idx;

      const w = ctx.weights[idx] as number;
      const a = acc[k]!;
      a.w += w;
      a.score += w * out.score;
      a.yieldFrac += w * out.yieldFrac;
      a.pumped += w * out.pumped;
      a.waterUse += w * out.waterUse;
      if (out.score >= STRESS_THRESHOLD) a.reliable += w;
      else if (out.worst) a.stress.set(out.worst, (a.stress.get(out.worst) ?? 0) + 1);
    }
  }
  return acc.map((a) => {
    let mainStress: StressFactor | null = null;
    let best = 0;
    for (const [k, v] of a.stress) if (v > best) [mainStress, best] = [k, v];
    return { climateScore: a.score / a.w, reliability: a.reliable / a.w, mainStress, yieldFrac: a.yieldFrac / a.w, pumpedMm: a.pumped / a.w, waterUseMm: a.waterUse / a.w };
  });
}

function evaluate(seq: CropId[], covers: CoverId[], input: EngineInput): RawPlan {
  const { cropClimate, history, planStartYear } = input;
  const full = [...history, ...seq];
  const offset = history.length;
  const sim = simulate(seq, covers, input);
  const years: PlanYear[] = seq.map((crop, i) => {
    const idx = offset + i;
    const prev = full[idx - 1] ?? null;
    const prev2 = full[idx - 2] ?? null;
    const coverBefore: CoverId = i === 0 ? "none" : (covers[i - 1] as CoverId);
    const coverAfter = covers[i] as CoverId;
    const def = CROPS[crop];
    const s = sim[i]!;

    if (crop === "fallow") {
      return {
        year: planStartYear + i,
        crop,
        cropName: def.name,
        cover: coverAfter,
        coverName: COVERS[coverAfter].name,
        climateScore: 1,
        reliability: 1,
        mainStress: null,
        expectedYield: 0,
        yieldUnit: def.yieldUnit,
        nitrogenLbPerAcre: 0,
        netReturnPerAcre: -Math.round(def.costPerAcre),
      };
    }

    let stand = 1;
    for (let k = idx - 1; k >= 0 && full[k] === "alfalfa" && crop === "alfalfa"; k--) stand++;
    const cc = cropClimate[crop];
    // Water-unlimited potential for this area (state/county), then this field's simulated water and stress.
    const potential = input.baseYieldOverrides?.[crop] ?? def.baseYield;
    const coverYield = crop === "corn" ? COVERS[coverBefore].nextCornYieldFactor : 1;
    const expectedYield = potential * rotationYieldFactor(crop, prev, prev2, stand) * cc.soilFactor * s.yieldFrac * coverYield;
    // Yield-goal based inputs (K-State / UNL method): nitrogen, seed and P/K scale with the expected yield.
    const yieldRatio = def.baseYield > 0 ? expectedYield / def.baseYield : 1;
    const n = nitrogenNeed(crop, prev, coverBefore) * clamp(yieldRatio, 0.4, 1.2);
    const establishment = crop === "alfalfa" && stand === 1 ? 150 : 0;
    const costScale = 0.3 + 0.7 * Math.min(1.2, yieldRatio);
    // Pumping cost scales with the water actually pumped (energy, maintenance, labor).
    const irrigationCost = (s.pumpedMm / 25.4) * IRRIGATION_COST_PER_INCH;
    const cost = def.costPerAcre * costScale + irrigationCost + establishment + n * NITROGEN_PRICE_PER_LB + COVERS[coverAfter].costPerAcre;
    const net = expectedYield * (input.prices?.[crop] ?? def.pricePerUnit) - cost;
    return {
      year: planStartYear + i,
      crop,
      cropName: def.name,
      cover: coverAfter,
      coverName: COVERS[coverAfter].name,
      climateScore: round(s.climateScore, 3),
      reliability: round(s.reliability, 3),
      mainStress: s.mainStress,
      expectedYield: round(expectedYield, def.yieldUnit.startsWith("tons") ? 2 : 0),
      yieldUnit: def.yieldUnit,
      nitrogenLbPerAcre: Math.round(n),
      netReturnPerAcre: Math.round(net),
      waterPumpedIn: round(s.pumpedMm / 25.4, 1),
    };
  });

  const cropped = years.filter((y) => y.crop !== "fallow");
  const avgOf = (list: PlanYear[], f: (y: PlanYear) => number) => (list.length ? list.reduce((a, y) => a + f(y), 0) / list.length : 0);
  return {
    seq,
    covers,
    years,
    climate: avgOf(cropped, (y) => y.climateScore),
    reliability: avgOf(cropped, (y) => y.reliability),
    soil: soilHealthScore(seq, covers, history),
    // Per calendar year, so a fallow year counts as a year with costs and no income.
    avgNet: avgOf(years, (y) => y.netReturnPerAcre),
    totalN: years.reduce((a, y) => a + y.nitrogenLbPerAcre, 0),
    waterUseIn: round(sim.reduce((sum, y) => sum + y.waterUseMm, 0) / Math.max(1, sim.length) / 25.4, 1),
  };
}

function priorityTotal(raw: RawPlan, profit: number, priority: Priority): number {
  const w = PRIORITY_WEIGHTS[priority];
  return round(w.climate * raw.climate + w.reliability * raw.reliability + w.soil * raw.soil + w.profit * profit, 3);
}

function toPlan(raw: RawPlan, profitNorm: (v: number) => number, priority: Priority, id: string): RotationPlan {
  const profit = profitNorm(raw.avgNet);
  const total = priorityTotal(raw, profit, priority);
  const notes: string[] = [];
  raw.years.forEach((y, i) => {
    if (y.cover !== "none") {
      const next = raw.years[i + 1];
      notes.push(
        `Fall ${y.year}: seed ${y.coverName.toLowerCase()} after ${y.cropName.toLowerCase()} harvest` +
          (next ? `, terminate before planting ${next.cropName.toLowerCase()} in ${next.year}.` : "."),
      );
    }
    const next = raw.years[i + 1];
    if (next?.crop === "winter_wheat") notes.push(`Fall ${y.year}: sow winter wheat after ${y.cropName.toLowerCase()} harvest.`);
  });
  return {
    id,
    label: raw.seq.map((c) => CROPS[c].name).join(" → "),
    years: raw.years,
    scores: {
      climate: round(raw.climate, 3),
      reliability: round(raw.reliability, 3),
      soil: round(raw.soil, 3),
      profit: round(profit, 3),
      total: round(total, 3),
    },
    avgNetReturnPerAcre: Math.round(raw.avgNet),
    totalNitrogenLbPerAcre: Math.round(raw.totalN),
    coverYears: raw.covers.filter((c) => c !== "none").length,
    notes,
    badYearsIn10: badYearsIn10(raw.years),
    waterPumpedIn: round(raw.years.reduce((a, y) => a + (y.waterPumpedIn ?? 0), 0) / Math.max(1, raw.years.length), 1),
  };
}

/**
 * Bad years out of 10: for each crop year, the recent-weighted share of the 35 replayed years in which the crop
 * was badly stressed (stress score below 0.6); averaged over the crop years (fallow years excluded).
 */
export function badYearsIn10(years: PlanYear[]): number {
  const cropped = years.filter((y) => y.crop !== "fallow");
  if (!cropped.length) return 0;
  const bad = cropped.reduce((a, y) => a + (1 - y.reliability), 0) / cropped.length;
  return Math.round(bad * 10);
}

/** What the farmer would most likely do without advice, inferred from recent history. */
export function currentPracticeSequence(history: CropId[], length = 3): CropId[] | null {
  const last = history[history.length - 1];
  if (!last) return null;
  const prev = history[history.length - 2];
  // Two different recent crops: assume the farmer keeps cycling them.
  if (prev !== undefined && prev !== last) return Array.from({ length }, (_, i) => (i % 2 === 0 ? prev : last));
  // Only corn or only soybean known once: assume the common corn-soybean alternation.
  if (prev === undefined && (last === "corn" || last === "soybean")) {
    const other: CropId = last === "corn" ? "soybean" : "corn";
    return Array.from({ length }, (_, i) => (i % 2 === 0 ? other : last));
  }
  return Array.from({ length }, () => last);
}

export interface EngineResult {
  constraints?: ConstraintReport;
  plans: RotationPlan[];
  currentPractice: RotationPlan | null;
  evaluated: number;
}

export function runEngine(input: EngineInput, topN = 3): EngineResult {
  const waterConstraint = constraintWater(input.constraints);
  if (waterConstraint) input = { ...input, irrigated: false, water: { ...input.water, irrigated: false, allowanceMm: waterConstraint.seasonalCapInches * 25.4 } };
  const crops = input.crops?.length ? input.crops : ALL_CROPS.filter((c) => c !== "fallow");
  let sequences = cartesian([crops, crops, crops]).filter((s) =>
    feasibleSequence(s, input.history, input.firstYearWheatAllowed),
  );

  const constraints = normalizeConstraints(input.constraints);
  const binding = new Set<ConstraintCode>();
  const bindingIssues = new Map<string, ConstraintIssue>();
  if (constraints) sequences = sequences.filter(seq => {
    const issues = sequenceConstraintIssues(seq, input.history, constraints);
    for (const issue of issues) {
      binding.add(issue.constraint);
      bindingIssues.set(`${issue.constraint}:${issue.crop ?? ""}:${issue.detail ?? ""}`, issue);
    }
    return !issues.length;
  });
  const goals = selectedGoals(input.goals);
  // Goal-sensitive cover variants must not be pruned using the old base-only quick score.
  if (!goals.length && input.quickSearch && sequences.length > input.quickSearch) {
    const bare = sequences.map((seq) => evaluate(seq, seq.map(() => "none" as CoverId), input));
    const top = Math.max(...bare.map((r) => r.avgNet));
    const norm = (v: number) => clamp(1 - (top - v) / PROFIT_SCALE_PER_ACRE);
    const keep = bare
      .map((r) => ({ seq: r.seq, total: priorityTotal(r, norm(r.avgNet), input.priority) }))
      .sort((a, b) => b.total - a.total)
      .slice(0, input.quickSearch)
      .map((x) => x.seq);
    sequences = keep;
  }

  const raws: RawPlan[] = [];
  for (const seq of sequences) {
    const coverLists = seq.map((_, i) => coverOptions(seq, i));
    for (const covers of cartesian(coverLists)) raws.push(evaluate(seq, covers, input));
  }

  const baselineSeq = currentPracticeSequence(input.history);
  const baselineRaw = baselineSeq ? evaluate(baselineSeq, baselineSeq.map(() => "none" as CoverId), input) : null;
  const baselineIssue = baselineSeq ? sequenceIssue(baselineSeq, input.history, input.firstYearWheatAllowed, input.planStartYear) : null;

  // Profit score: 1 for the most profitable feasible plan, minus 0.1 for every $20/acre/year below it.
  const hi = Math.max(...raws.map((r) => r.avgNet));
  const profitNorm = (v: number) => clamp(1 - (hi - v) / PROFIT_SCALE_PER_ACRE);

  const basePlan = (raw: RawPlan, id: string) => {
    const plan = toPlan(raw, profitNorm, input.priority, id);
    return goals.length ? { ...plan, waterUseIn: raw.waterUseIn } : plan;
  };
  // Without goals, compare cheap scalar scores first. Materializing notes, labels
  // and response objects for every cover variant is wasted work. Goal normalization
  // still sees every feasible candidate, including losing cover variants.
  const candidates = goals.length ? raws.map((raw) => basePlan(raw, raw.seq.join(">"))) : [];
  const goalScore = createGoalScorer(candidates, goals, input.water.irrigated ? "full" : input.water.allowanceMm > 0 ? "limited" : "rain");

  const bestBySeq = new Map<string, { raw: RawPlan; plan: RotationPlan }>();
  if (!goals.length) {
    const best = new Map<string, { raw: RawPlan; total: number }>();
    for (const raw of raws) {
      const key = raw.seq.join(">");
      const total = priorityTotal(raw, profitNorm(raw.avgNet), input.priority);
      const cur = best.get(key);
      if (!cur || total > cur.total) best.set(key, { raw, total });
    }
    for (const [key, { raw }] of best) bestBySeq.set(key, { raw, plan: basePlan(raw, key) });
  } else {
    for (const [i, raw] of raws.entries()) {
      const key = raw.seq.join(">");
      const plan = goalScore(candidates[i]!);
      const cur = bestBySeq.get(key);
      if (!cur || plan.scores.total > cur.plan.scores.total) bestBySeq.set(key, { raw, plan });
    }
  }
  const ranked = [...bestBySeq.values()].sort((a, b) => b.plan.scores.total - a.plan.scores.total);
  // Never recommend a crop that would be stressed in most years here, however good its average looks
  // (e.g. rain-fed soybean on 22 in of rain). Fall back to such plans only if nothing else is feasible.
  const dependable = (r: { raw: RawPlan }) => r.raw.years.every((y) => y.crop === "fallow" || y.reliability >= MIN_RECOMMENDED_RELIABILITY);
  // Dependable plans always come first; the rest only fill the remaining slots (so one dependable plan is enough
  // to keep an often-stressed crop from being the top pick).
  const pool = [...ranked.filter(dependable), ...ranked.filter((r) => !dependable(r))];
  // Show genuinely different options: skip plans that use the same set of crops as one already chosen.
  const chosen: { raw: RawPlan; plan: RotationPlan }[] = [];
  const seen = new Set<string>();
  for (const r of pool) {
    const sig = [...r.raw.seq].sort().join(",");
    if (seen.has(sig)) continue;
    seen.add(sig);
    chosen.push(r);
    if (chosen.length === topN) break;
  }
  // If all displayed options start with the same crop, replace only the final
  // alternative with the highest-ranked different starting crop in the same
  // dependability tier. Keep the true winner, scores, and rotation rules intact.
  // This is a choice set, not a promise that these are consecutive score ranks.
  if (chosen.length > 1 && chosen.every((r) => r.raw.seq[0] === chosen[0]!.raw.seq[0])) {
    const retained = chosen.slice(0, -1);
    const signatures = new Set(retained.map((r) => [...r.raw.seq].sort().join(",")));
    const last = chosen[chosen.length - 1]!;
    const alternative = pool.find((r) => r.raw.seq[0] !== chosen[0]!.raw.seq[0] &&
      dependable(r) === dependable(last) && !signatures.has([...r.raw.seq].sort().join(",")));
    if (alternative) chosen[chosen.length - 1] = {
      ...alternative,
      plan: { ...alternative.plan, notes: [...alternative.plan.notes, "Shown as a different first-crop alternative, not necessarily the next-highest score. Review its score and return against the top plan."] },
    };
  }
  const plans = chosen.map((r, i) => ({ ...r.plan, id: `plan-${i + 1}` }));

  return {
    plans,
    currentPractice: baselineRaw
      ? (() => {
          const p = goalScore(basePlan(baselineRaw, "current"));
          if (baselineIssue) p.notes.unshift(baselineIssue);
          return { ...p, label: `Current pattern: ${baselineRaw.seq.map((c) => CROPS[c].name).join(" → ")}` };
        })()
      : null,
    evaluated: raws.length,
    ...(constraints ? { constraints: {
      status: plans.length ? 'satisfied' as const : 'infeasible' as const,
      ...(waterConstraint ? { water: waterConstraint } : {}),
      binding: plans.length ? [] : [...binding].sort(),
      ...(!plans.length ? { bindingIssues: [...bindingIssues.values()] } : {}),
      excludedCrops: crops.map(crop => ({ crop, reasons: cropConstraintIssues(crop, constraints) })).filter(x => x.reasons.length),
      currentPracticeViolations: baselineSeq ? sequenceConstraintIssues(baselineSeq, input.history, constraints) : [],
      ...(!plans.length ? { message: `No rotation satisfies these constraints: ${[...binding].join(', ') || 'crop availability and rotation rules'}. No constraints were relaxed.` } : {}),
    } } : {}),
  };
}

// ---------------- Replay of actual years (for checking the model against real harvest records) ----------------

export interface ReplayYear {
  year: number;
  /** Share of water-unlimited yield potential the model says the crop reached in that year's actual weather. */
  yieldFrac: number;
  score: number;
  mainStress: StressFactor | null;
  /** Modelled crop water use over the season, mm. */
  waterUse: number;
  /** Irrigation pumped that season, mm. */
  pumped: number;
}

/**
 * What each real weather year would have done to `crop` grown after `prevCrop` (and `crop` again before that),
 * with soil water carried through the two preceding seasons. Weather is NOT shifted by trends here:
 * this is the model's hindcast, to be compared with what farmers actually harvested.
 */
export function replayCropByYear(climate: DailyClimate, soil: SoilProfile, crop: CropId, prevCrop: CropId, irrigated: boolean): ReplayYear[] {
  return makeReplay(climate, soil, irrigated)(crop, prevCrop);
}

/** Prepares the weather once, then replays any (crop, previous crop) pair against the actual years. */
export function makeReplay(
  climate: DailyClimate,
  soil: SoilProfile,
  irrigated: boolean,
  allowanceMm = 0,
  shared?: Record<CropId, CropClimate>,
  sharedWater?: WaterContext,
): (crop: CropId, prevCrop: CropId) => ReplayYear[] {
  const water = sharedWater ?? buildWaterContext(climate, soil, irrigated, allowanceMm);
  const cropClimate = shared ?? evaluateCropClimate(climate, soil, irrigated, climate.lastYear, { adjustTrends: false });
  const input: EngineInput = { cropClimate, water, history: [], priority: "balanced", planStartYear: 0, firstYearWheatAllowed: true };
  // Completeness is a property of the weather, not of a crop pair. Scan daily
  // records once instead of once per crop, comparison, drought replay and year.
  const complete = climate.years.map((ys) =>
    ys.days.length === (Date.UTC(ys.year + 1, 0, 1) - Date.UTC(ys.year, 0, 1)) / 86_400_000 &&
    ys.days.every((d) => d.prcp !== null && d.tmax !== null && d.tmin !== null));
  const valid = climate.years.map((_, i) => {
    for (let k = Math.max(0, i - 2); k <= i; k++) {
      if (!complete[k] || (k > Math.max(0, i - 2) && climate.years[k]!.year !== climate.years[k - 1]!.year + 1)) return false;
    }
    return true;
  });
  const memo = new Map<string, ReplayYear[]>();
  return (crop, prevCrop) => {
    const key = `${crop}:${prevCrop}`;
    let result = memo.get(key);
    if (!result) memo.set(key, result = replayPair(climate, water, input, crop, prevCrop, valid));
    return result;
  };
}

function replayPair(climate: DailyClimate, water: WaterContext, input: EngineInput, crop: CropId, prevCrop: CropId, valid: boolean[]): ReplayYear[] {
  const out: ReplayYear[] = [];
  for (let i = 0; i < water.n; i++) {
    // A missing year cannot be bridged by substituting a different calendar year for soil-water spinup.
    if (!valid[i]) continue;
    // Spin up through the two seasons before (crop → prevCrop → crop), using the real preceding years.
    const steps: [CropId, number][] = [];
    if (i >= 2) steps.push([crop, i - 2]);
    if (i >= 1) steps.push([prevCrop, i - 1]);
    steps.push([crop, i]);
    let storage = 0.5 * water.profileCap;
    let lastEnd = 9;
    let lastIdx = steps[0]![1];
    steps.forEach(([c, idx], k) => {
      if (k > 0) storage = Math.min(water.profileCap, storage + gapRecharge(water, lastIdx, lastEnd, idx, CROPS[c].season.from[0]));
      const r = runCropYear(c, idx, storage, input);
      storage = r.storageAfter;
      lastEnd = CROPS[c].season.to[0];
      lastIdx = idx;
      if (k === steps.length - 1) out.push({ year: climate.years[i]!.year, yieldFrac: r.yieldFrac, score: r.score, mainStress: r.worst, waterUse: r.waterUse, pumped: r.pumped });
    });
  }
  return out;
}
