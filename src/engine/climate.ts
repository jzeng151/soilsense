// Turns NASA POWER daily data into per-year climate features and trend-tested indicators.

import type { ClimateIndicator, ClimateSummary, LatLon, PowerEvidence } from "../shared/types";
import { cToF, gddCToF, mmToIn, round } from "../shared/units";
import { mannKendall, mean } from "./stats";

export interface DailyRecord {
  /** Day of year, 1-366. */
  doy: number;
  month: number;
  day: number;
  prcp: number | null;
  tmax: number | null;
  tmin: number | null;
  t2m: number | null;
  gwetroot: number | null;
}

export interface YearSeries {
  year: number;
  days: DailyRecord[];
}

export interface DailyClimate {
  gridCell: LatLon;
  years: YearSeries[];
  firstYear: number;
  lastYear: number;
  /** Human-readable source of the daily weather (set when another dataset replaced part of NASA POWER). */
  weatherSource?: string;
  powerEvidence?: PowerEvidence;
}

export interface DaymetDay {
  year: number;
  /** Day of year 1-365 (Daymet drops Dec 31 in leap years, so this equals the calendar day of year). */
  yday: number;
  prcp: number;
  tmax: number;
  tmin: number;
}

/**
 * Two-dataset ensemble: each day's rain and temperature become the average of NASA POWER (MERRA-2 model,
 * ~50 km cell) and NASA Daymet (station-interpolated, 1 km). Their errors are largely independent, so the
 * average is more reliable than either one: in our check against 35 years of USDA county harvests (Story
 * County IA, Finney County KS) it matched good and bad years best overall. Root-zone soil wetness stays from
 * POWER; days Daymet lacks keep POWER values.
 */
export function mergeDaymet(climate: DailyClimate, days: DaymetDay[]): { climate: DailyClimate; replaced: number } {
  const byKey = new Map(days.map((d) => [d.year * 1000 + d.yday, d]));
  let replaced = 0;
  const avg = (a: number | null, b: number) => (a === null ? b : (a + b) / 2);
  const years = climate.years.map((ys) => ({
    year: ys.year,
    days: ys.days.map((d) => {
      const m = byKey.get(ys.year * 1000 + d.doy);
      if (!m) return d;
      replaced++;
      const tmax = avg(d.tmax, m.tmax);
      const tmin = avg(d.tmin, m.tmin);
      return { ...d, prcp: avg(d.prcp, m.prcp), tmax, tmin, t2m: (tmax + tmin) / 2 };
    }),
  }));
  const total = climate.years.reduce((a, y) => a + y.days.length, 0);
  // Only use the ensemble if Daymet covered nearly every day; otherwise keep POWER alone, consistently.
  if (replaced < total * 0.95) return { climate, replaced: 0 };
  return {
    climate: {
      ...climate,
      years,
      weatherSource: `Average of NASA POWER (50 km) and NASA Daymet (1 km) daily rain and temperature, ${climate.firstYear}–${climate.lastYear}; root-zone soil wetness from NASA POWER`,
    },
    replaced,
  };
}

export interface PowerResponse {
  geometry?: { coordinates?: number[] };
  header?: { fill_value?: number; api?: { version?: string } };
  properties: { parameter: Record<string, Record<string, number>> };
}

const FILL = -999;

function clean(v: number | undefined, fill: number): number | null {
  if (v === undefined || v === null || Number.isNaN(v) || v === fill || v <= FILL) return null;
  return v;
}

function dayOfYear(year: number, month: number, day: number): number {
  return Math.round((Date.UTC(year, month - 1, day) - Date.UTC(year, 0, 1)) / 86_400_000) + 1;
}

/**
 * Parse a NASA POWER daily point response. Incomplete years are excluded, not
 * treated as dry/unstressed days. Rain, max and min temperature must cover every day.
 */
export function parsePower(json: PowerResponse): DailyClimate {
  const fill = json.header?.fill_value ?? FILL;
  const p = json.properties.parameter;
  const prcp = p.PRECTOTCORR ?? {};
  const tmax = p.T2M_MAX ?? {};
  const tmin = p.T2M_MIN ?? {};
  const t2m = p.T2M ?? {};
  const gw = p.GWETROOT ?? {};

  const byYear = new Map<number, DailyRecord[]>();
  for (const key of Object.keys(tmax).sort()) {
    const year = Number(key.slice(0, 4));
    const month = Number(key.slice(4, 6));
    const day = Number(key.slice(6, 8));
    const rec: DailyRecord = {
      doy: dayOfYear(year, month, day),
      month,
      day,
      prcp: clean(prcp[key], fill),
      tmax: clean(tmax[key], fill),
      tmin: clean(tmin[key], fill),
      t2m: clean(t2m[key], fill),
      gwetroot: clean(gw[key], fill),
    };
    const list = byYear.get(year) ?? [];
    list.push(rec);
    byYear.set(year, list);
  }

  const years: YearSeries[] = [];
  for (const [year, days] of [...byYear.entries()].sort((a, b) => a[0] - b[0])) {
    const expected = dayOfYear(year, 12, 31);
    const missing = expected - days.filter((d) => d.tmax !== null && d.tmin !== null && d.prcp !== null).length;
    if (missing === 0) years.push({ year, days });
  }

  const coords = json.geometry?.coordinates ?? [];
  return {
    gridCell: { lon: coords[0] ?? NaN, lat: coords[1] ?? NaN },
    years,
    firstYear: years[0]?.year ?? NaN,
    lastYear: years[years.length - 1]?.year ?? NaN,
  };
}

// ---------- Window helpers (month/day ranges within one calendar year) ----------

export interface Window {
  from: [month: number, day: number];
  to: [month: number, day: number];
}

function inWindow(d: DailyRecord, w: Window): boolean {
  const v = d.month * 100 + d.day;
  return v >= w.from[0] * 100 + w.from[1] && v <= w.to[0] * 100 + w.to[1];
}

export function windowDays(ys: YearSeries, w: Window): DailyRecord[] {
  return ys.days.filter((d) => inWindow(d, w));
}

export function rainMm(ys: YearSeries, w: Window): number {
  return windowDays(ys, w).reduce((a, d) => a + (d.prcp ?? 0), 0);
}

/**
 * Reference evapotranspiration over a window, mm (FAO-56 Hargreaves equation, eq. 52, with
 * extraterrestrial radiation from eq. 21). Needs only daily max/min temperature and latitude,
 * so it captures how much more water crops use in hot, dry places than in humid ones.
 */
export function et0HargreavesMm(ys: YearSeries, w: Window, latDeg: number): number {
  const phi = (latDeg * Math.PI) / 180;
  let sum = 0;
  for (const d of windowDays(ys, w)) {
    if (d.tmax === null || d.tmin === null) continue;
    const j = d.doy;
    const dr = 1 + 0.033 * Math.cos((2 * Math.PI * j) / 365);
    const delta = 0.409 * Math.sin((2 * Math.PI * j) / 365 - 1.39);
    const ws = Math.acos(Math.max(-1, Math.min(1, -Math.tan(phi) * Math.tan(delta))));
    const ra = ((24 * 60) / Math.PI) * 0.082 * dr * (ws * Math.sin(phi) * Math.sin(delta) + Math.cos(phi) * Math.cos(delta) * Math.sin(ws));
    const tmean = (d.tmax + d.tmin) / 2;
    const range = Math.max(0, d.tmax - d.tmin);
    sum += Math.max(0, 0.0023 * (tmean + 17.8) * Math.sqrt(range) * ra * 0.408);
  }
  return sum;
}

export function hotDays(ys: YearSeries, w: Window, thresholdC: number): number {
  return windowDays(ys, w).filter((d) => d.tmax !== null && d.tmax >= thresholdC).length;
}

/**
 * Degree days above a threshold (°C·day), triangle method on daily min/max.
 * Used as "extreme heat degree days", the heat measure behind US crop-yield damage
 * research (Schlenker & Roberts, PNAS 2009).
 */
export function degreeDaysAbove(ys: YearSeries, w: Window, thresholdC: number): number {
  let sum = 0;
  for (const d of windowDays(ys, w)) {
    if (d.tmax === null || d.tmin === null) continue;
    const { tmax, tmin } = d;
    if (tmax <= thresholdC) continue;
    if (tmin >= thresholdC) sum += (tmax + tmin) / 2 - thresholdC;
    else sum += ((tmax - thresholdC) ** 2) / (2 * (tmax - tmin));
  }
  return sum;
}

export function coldDays(ys: YearSeries, w: Window, thresholdC: number): number {
  return windowDays(ys, w).filter((d) => d.tmin !== null && d.tmin <= thresholdC).length;
}

/** Growing degree days, base 10 °C, upper cap 30 °C (the standard corn method). */
export function gddC(ys: YearSeries, w: Window): number {
  let sum = 0;
  for (const d of windowDays(ys, w)) {
    if (d.tmax === null || d.tmin === null) continue;
    const hi = Math.min(Math.max(d.tmax, 10), 30);
    const lo = Math.min(Math.max(d.tmin, 10), 30);
    sum += Math.max(0, (hi + lo) / 2 - 10);
  }
  return sum;
}

/** Days between the last spring frost (≤ 0 °C, Jan–Jun) and the first fall frost (Jul–Dec). */
export function frostFreeDays(ys: YearSeries): number {
  let lastSpring = 0;
  let firstFall = 366;
  for (const d of ys.days) {
    if (d.tmin === null || d.tmin > 0) continue;
    if (d.month <= 6) lastSpring = Math.max(lastSpring, d.doy);
    else firstFall = Math.min(firstFall, d.doy);
  }
  return Math.max(0, firstFall - lastSpring - 1);
}

export function longestDrySpell(ys: YearSeries, w: Window, wetMm = 1): number {
  let best = 0;
  let run = 0;
  for (const d of windowDays(ys, w)) {
    if ((d.prcp ?? 0) < wetMm) {
      run += 1;
      best = Math.max(best, run);
    } else run = 0;
  }
  return best;
}

export const GROWING_SEASON: Window = { from: [5, 1], to: [9, 30] };
export const SPRING: Window = { from: [4, 1], to: [5, 31] };
export const SUMMER: Window = { from: [6, 1], to: [8, 31] };

// ---------- Headline indicators for the dashboard and the explanation ----------

interface IndicatorDef {
  id: string;
  label: string;
  unit: string;
  description: string;
  compute: (ys: YearSeries, latDeg: number) => number;
}

const INDICATORS: IndicatorDef[] = [
  {
    id: "gs_rain",
    label: "Growing-season rain (May–Sep)",
    unit: "in",
    description: "Total rainfall from May 1 to September 30.",
    compute: (ys) => mmToIn(rainMm(ys, GROWING_SEASON)),
  },
  {
    id: "spring_rain",
    label: "Spring rain (Apr–May)",
    unit: "in",
    description: "Rain during planting season. Very wet springs delay planting.",
    compute: (ys) => mmToIn(rainMm(ys, SPRING)),
  },
  {
    id: "hot_days",
    label: "Days at or above 95°F (Jun–Aug)",
    unit: "days",
    description: "Days with a maximum temperature of at least 35 °C (95 °F). Heat during pollination cuts corn yield.",
    compute: (ys) => hotDays(ys, SUMMER, 35),
  },
  {
    id: "frost_free",
    label: "Frost-free season",
    unit: "days",
    description: "Days between the last spring frost and the first fall frost (minimum air temperature ≤ 32 °F).",
    compute: (ys) => frostFreeDays(ys),
  },
  {
    id: "gdd",
    label: "Growing degree days (May–Sep)",
    unit: "°F·days",
    description: "Heat units for crop development (base 50 °F, cap 86 °F).",
    compute: (ys) => gddCToF(gddC(ys, GROWING_SEASON)),
  },
  {
    id: "dry_spell",
    label: "Longest summer dry spell (Jun–Aug)",
    unit: "days",
    description: "Longest run of days with less than 0.04 in (1 mm) of rain.",
    compute: (ys) => longestDrySpell(ys, SUMMER),
  },
  {
    id: "summer_tmax",
    label: "Average summer high (Jun–Aug)",
    unit: "°F",
    description: "Mean daily maximum temperature, June to August.",
    compute: (ys) => {
      const t = windowDays(ys, SUMMER)
        .map((d) => d.tmax)
        .filter((v): v is number => v !== null);
      return cToF(mean(t));
    },
  },
  {
    id: "water_demand",
    label: "Crop water demand (May–Sep)",
    unit: "in",
    description:
      "Evapotranspiration: the water a well-watered crop would use and the air would take, May to September. Worked out from daily temperatures with the FAO Hargreaves method. Hotter seasons raise it.",
    compute: (ys, lat) => mmToIn(et0HargreavesMm(ys, GROWING_SEASON, lat)),
  },
  {
    id: "water_balance",
    label: "Water balance: rain minus demand (May–Sep)",
    unit: "in",
    description: "Growing-season rain minus crop water demand. The more negative it is, the more a crop depends on water stored in the soil or on irrigation.",
    compute: (ys, lat) => mmToIn(rainMm(ys, GROWING_SEASON) - et0HargreavesMm(ys, GROWING_SEASON, lat)),
  },
  {
    id: "soil_wetness",
    label: "Root-zone soil wetness (Jun–Aug)",
    unit: "%",
    description:
      "How full of water the soil is where roots grow, June to August (0% = dry, 100% = saturated). From NASA's MERRA-2 land model via NASA POWER: a satellite-era model estimate for a 30-mile grid square, not a probe in your field.",
    compute: (ys) => {
      const g = windowDays(ys, SUMMER)
        .map((d) => d.gwetroot)
        .filter((v): v is number => v !== null);
      return g.length ? mean(g) * 100 : NaN;
    },
  },
];

export function buildIndicators(climate: DailyClimate, requested: LatLon): ClimateSummary {
  const years = climate.years.map((y) => y.year);
  const source = climate.weatherSource ?? `NASA POWER daily (MERRA-2), ${climate.firstYear}–${climate.lastYear}`;
  const indicators: ClimateIndicator[] = INDICATORS.map((def) => {
    const lat = Number.isFinite(climate.gridCell.lat) ? climate.gridCell.lat : requested.lat;
    const values = climate.years.map((ys) => round(def.compute(ys, lat), 2));
    const trend = mannKendall(years, values);
    return {
      id: def.id,
      label: def.label,
      unit: def.unit,
      description: def.description,
      years,
      values,
      trend,
      changePerDecade: round(trend.slopePerYear * 10, 2),
      mean: round(mean(values), 2),
      source,
    };
  });
  return {
    location: requested,
    gridCell: climate.gridCell,
    firstYear: climate.firstYear,
    lastYear: climate.lastYear,
    indicators,
    source,
  };
}
