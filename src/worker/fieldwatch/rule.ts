// Field Watch rule: a transparent, deterministic check of the last two weeks on a field.
// Pure functions only (no I/O), so every result can be reproduced from its inputs.
//
//   1. Rain in the latest complete 14 days vs the same calendar window in every past year (percentile).
//   2. Water balance over those 14 days: rain minus reference crop water demand (FAO-56 Hargreaves ET0).
//   3. Root-zone soil wetness (NASA POWER GWETROOT), 7-day mean vs the same window in past years (percentile).
//   4. Kansas only: the weekly drought outlook from the team's Kansas pipeline, as a second signal.
//
// Thresholds are DEMONSTRATION SETTINGS, not agronomic standards; they are listed in THRESHOLDS and shown in the UI.
// Missing rainfall is never treated as zero: a 14-day window counts only if all 14 days have rain values.

import { et0HargreavesMm, type DailyRecord } from "../../engine/climate";

export type WatchStatus = "ok" | "watch" | "dry" | "insufficient";

export const THRESHOLDS = {
  windowDays: 14,
  rootDays: 7,
  /** Look back at most this many days from today for a complete 14-day window (NASA POWER lags a few days). */
  maxLagDays: 21,
  minNormalYears: 20,
  dryRainPct: 20,
  dryRootPct: 30,
  /** Used for "dry" only when root-zone wetness is unavailable. */
  dryBalanceMm: -15,
  watchRainPct: 33,
  watchRootPct: 25,
  ksDroughtProbability: 0.5,
} as const;

export const RULE_TEXT =
  `Dry spell starting: rain in the last ${THRESHOLDS.windowDays} days is at or below the ${THRESHOLDS.dryRainPct}th percentile for this time of year ` +
  `and root-zone wetness is at or below the ${THRESHOLDS.dryRootPct}th percentile. Watch: rain at or below the ${THRESHOLDS.watchRainPct}th percentile, ` +
  `root-zone wetness at or below the ${THRESHOLDS.watchRootPct}th percentile, or a Kansas drought watch/warning. ` +
  `These thresholds are demonstration settings, not agronomic standards.`;

/** One day of recent or historical weather, keyed by ISO date. */
export interface DayValues {
  prcp: number | null;
  tmax: number | null;
  tmin: number | null;
  gwetroot: number | null;
}
export type DayMap = Map<string, DayValues>;

export interface KansasSignal {
  county: string;
  alert: string;
  droughtProbability: number | null;
  rootzonePct: number | null;
  dataThrough: string;
}

export interface WatchReason {
  id: string;
  text: string;
  source: string;
}

export interface WatchMetrics {
  windowStart: string | null;
  dataThrough: string | null;
  rain14Mm: number | null;
  normalRain14Mm: number | null;
  rainPercentile: number | null;
  et014Mm: number | null;
  balance14Mm: number | null;
  rootzoneDate: string | null;
  rootzoneWetness: number | null;
  rootzonePercentile: number | null;
  normalYears: number;
  normalPeriod: string | null;
  kansas: KansasSignal | null;
}

export interface WatchResult {
  status: WatchStatus;
  headline: string;
  reasons: WatchReason[];
  metrics: WatchMetrics;
}

// ---------- date helpers (UTC, ISO yyyy-mm-dd) ----------

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return isoDate(d);
}
function shiftYear(iso: string, years: number): string {
  const y = Number(iso.slice(0, 4)) + years;
  const md = iso.slice(5);
  // 29 Feb in a non-leap year → 28 Feb.
  if (md === "02-29" && !(y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0))) return `${y}-02-28`;
  return `${y}-${md}`;
}
function dayOfYear(iso: string): number {
  const y = Number(iso.slice(0, 4));
  return Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.UTC(y, 0, 1)) / 86_400_000) + 1;
}
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function shortDate(iso: string): string {
  return `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}`;
}
const mmToIn = (mm: number) => mm / 25.4;
const fmtIn = (mm: number) => `${mmToIn(mm).toFixed(2)} in`;
const round1 = (x: number) => Math.round(x * 10) / 10;

/** Percentile rank of x among values (0-100): share below plus half of ties. */
export function percentileRank(values: number[], x: number): number {
  if (!values.length) return NaN;
  let below = 0;
  let equal = 0;
  for (const v of values) {
    if (v < x) below++;
    else if (v === x) equal++;
  }
  return Math.round(((below + equal / 2) / values.length) * 100);
}
function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}
export function ordinal(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}

// ---------- the rule ----------

function windowDates(end: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => addDays(end, i - n + 1));
}

/** Latest end date (within maxLagDays of today) whose 14-day window has rain + temperature on every day. */
export function latestCompleteWindowEnd(recent: DayMap, today: string): string | null {
  for (let lag = 1; lag <= THRESHOLDS.maxLagDays; lag++) {
    const end = addDays(today, -lag);
    const ok = windowDates(end, THRESHOLDS.windowDays).every((d) => {
      const v = recent.get(d);
      return v && v.prcp !== null && v.tmax !== null && v.tmin !== null;
    });
    if (ok) return end;
  }
  return null;
}

function et0ForDates(map: DayMap, dates: string[], lat: number): number {
  const days: DailyRecord[] = dates.map((iso) => {
    const v = map.get(iso)!;
    return { doy: dayOfYear(iso), month: Number(iso.slice(5, 7)), day: Number(iso.slice(8, 10)), prcp: v.prcp, tmax: v.tmax, tmin: v.tmin, t2m: null, gwetroot: v.gwetroot };
  });
  // et0HargreavesMm sums a calendar window of one YearSeries; a whole-year window over our chosen days sums exactly those days.
  return et0HargreavesMm({ year: 0, days }, { from: [1, 1], to: [12, 31] }, lat);
}

function sumRain(map: DayMap, dates: string[]): number | null {
  let sum = 0;
  for (const d of dates) {
    const p = map.get(d)?.prcp;
    if (p === null || p === undefined) return null; // never treat missing rain as zero
    sum += p;
  }
  return sum;
}

function meanRoot(map: DayMap, dates: string[]): number | null {
  const vals = dates.map((d) => map.get(d)?.gwetroot).filter((v): v is number => typeof v === "number");
  return vals.length === dates.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

export function evaluateField(input: {
  fieldName: string;
  lat: number;
  today: string;
  recent: DayMap;
  history: DayMap;
  historyYears: { first: number; last: number };
  kansas?: KansasSignal | null;
}): WatchResult {
  const { recent, history, historyYears, lat, today } = input;
  const kansas = input.kansas ?? null;
  const reasons: WatchReason[] = [];
  const end = latestCompleteWindowEnd(recent, today);
  const empty: WatchMetrics = {
    windowStart: null, dataThrough: null, rain14Mm: null, normalRain14Mm: null, rainPercentile: null, et014Mm: null, balance14Mm: null,
    rootzoneDate: null, rootzoneWetness: null, rootzonePercentile: null, normalYears: 0, normalPeriod: null, kansas,
  };
  if (!end) {
    return {
      status: "insufficient",
      headline: `Not enough recent NASA data to check ${input.fieldName}`,
      reasons: [{ id: "no-window", text: `NASA POWER has no complete ${THRESHOLDS.windowDays}-day stretch of rain and temperature in the last ${THRESHOLDS.maxLagDays} days.`, source: "NASA POWER" }],
      metrics: empty,
    };
  }

  const dates = windowDates(end, THRESHOLDS.windowDays);
  const rain14 = sumRain(recent, dates)!;
  const et014 = et0ForDates(recent, dates, lat);
  const balance = rain14 - et014;

  // Normals: the same calendar window in each past year, only where all 14 days have rain.
  const normals: number[] = [];
  const endYear = Number(end.slice(0, 4));
  for (let y = historyYears.first; y <= historyYears.last; y++) {
    const shifted = dates.map((d) => shiftYear(d, y - endYear));
    const s = sumRain(history, shifted);
    if (s !== null) normals.push(s);
  }

  // Root zone: the latest 7 days that all have GWETROOT (it can lag rain by a few days).
  let rootEnd: string | null = null;
  for (let lag = 0; lag <= THRESHOLDS.maxLagDays; lag++) {
    const e = addDays(end, -lag);
    if (meanRoot(recent, windowDates(e, THRESHOLDS.rootDays)) !== null) {
      rootEnd = e;
      break;
    }
  }
  let rootNow: number | null = null;
  let rootPct: number | null = null;
  if (rootEnd) {
    const rd = windowDates(rootEnd, THRESHOLDS.rootDays);
    rootNow = meanRoot(recent, rd);
    const rootNormals: number[] = [];
    const rootYear = Number(rootEnd.slice(0, 4));
    for (let y = historyYears.first; y <= historyYears.last; y++) {
      const m = meanRoot(history, rd.map((d) => shiftYear(d, y - rootYear)));
      if (m !== null) rootNormals.push(m);
    }
    if (rootNow !== null && rootNormals.length >= THRESHOLDS.minNormalYears) rootPct = percentileRank(rootNormals, rootNow);
  }

  const metrics: WatchMetrics = {
    windowStart: dates[0]!,
    dataThrough: end,
    rain14Mm: round1(rain14),
    normalRain14Mm: normals.length ? round1(median(normals)) : null,
    rainPercentile: normals.length >= THRESHOLDS.minNormalYears ? percentileRank(normals, rain14) : null,
    et014Mm: round1(et014),
    balance14Mm: round1(balance),
    rootzoneDate: rootEnd,
    rootzoneWetness: rootNow === null ? null : Math.round(rootNow * 1000) / 1000,
    rootzonePercentile: rootPct,
    normalYears: normals.length,
    normalPeriod: `${historyYears.first}–${historyYears.last}`,
    kansas,
  };

  if (metrics.rainPercentile === null) {
    return {
      status: "insufficient",
      headline: `Not enough past years to judge ${input.fieldName}`,
      reasons: [{ id: "few-normals", text: `Only ${normals.length} past years have complete rain for ${shortDate(dates[0]!)}–${shortDate(end)}; at least ${THRESHOLDS.minNormalYears} are needed.`, source: "NASA POWER" }],
      metrics,
    };
  }
  const rainPct = metrics.rainPercentile;
  const span = `${shortDate(dates[0]!)}–${shortDate(end)}`;

  const vsNormal =
    rainPct < 34
      ? `drier than ${100 - rainPct}% of the same two weeks in ${metrics.normalPeriod}`
      : rainPct > 66
        ? `wetter than ${rainPct}% of the same two weeks in ${metrics.normalPeriod}`
        : `about normal for these two weeks in ${metrics.normalPeriod} (${ordinal(rainPct)} percentile)`;
  reasons.push({
    id: "rain14",
    text: `Rain ${span}: ${fmtIn(rain14)}, ${vsNormal} (typical: ${fmtIn(metrics.normalRain14Mm!)}).`,
    source: "NASA POWER daily (PRECTOTCORR)",
  });
  const balIn = Math.round(mmToIn(balance) * 100) / 100;
  reasons.push({
    id: "balance14",
    text: `Water balance ${span}: rain minus estimated crop water demand is ${balIn === 0 ? "about even" : `${balIn > 0 ? "+" : "−"}${Math.abs(balIn).toFixed(2)} in`} (demand ${fmtIn(et014)}, FAO-56 Hargreaves).`,
    source: "NASA POWER daily (T2M_MAX, T2M_MIN) + FAO-56 Hargreaves ET0",
  });
  if (rootPct !== null && rootEnd) {
    reasons.push({
      id: "rootzone",
      text: `Root-zone soil wetness (7 days to ${shortDate(rootEnd)}): ${ordinal(rootPct)} percentile for this time of year.`,
      source: "NASA POWER daily (GWETROOT)",
    });
  } else {
    reasons.push({ id: "rootzone-missing", text: "Root-zone soil wetness isn't available for these dates yet, so the water balance is used instead.", source: "NASA POWER daily (GWETROOT)" });
  }
  const ksWatch = !!kansas && (["watch", "warning"].includes(kansas.alert.toLowerCase()) || (kansas.droughtProbability ?? 0) >= THRESHOLDS.ksDroughtProbability);
  if (kansas) {
    reasons.push({
      id: "kansas",
      text:
        `Kansas weekly outlook for ${kansas.county} (data through ${kansas.dataThrough}): alert "${kansas.alert}"` +
        `${kansas.droughtProbability !== null ? `, ${Math.round(kansas.droughtProbability * 100)}% chance of drought in 4 weeks` : ""}` +
        `${kansas.rootzonePct !== null ? `, root zone ${ordinal(Math.round(kansas.rootzonePct))} percentile` : ""}.`,
      source: "Kansas Crop Rotation Advice pipeline (V. Pisharody, team): NASA POWER + U.S. Drought Monitor",
    });
  }
  const month = Number(end.slice(5, 7));
  if (month >= 11 || month <= 3) {
    reasons.push({ id: "season", text: "Outside the main growing season: this matters most for winter wheat and for refilling soil water before spring.", source: "SoilSense" });
  }

  const dryRoot = rootPct !== null ? rootPct <= THRESHOLDS.dryRootPct : balance <= THRESHOLDS.dryBalanceMm;
  let status: WatchStatus;
  if (rainPct <= THRESHOLDS.dryRainPct && dryRoot) status = "dry";
  else if (kansas?.alert.toLowerCase() === "warning" && rainPct <= THRESHOLDS.watchRainPct) status = "dry";
  else if (rainPct <= THRESHOLDS.watchRainPct || (rootPct !== null && rootPct <= THRESHOLDS.watchRootPct) || ksWatch) status = "watch";
  else status = "ok";

  const headline =
    status === "dry"
      ? `Dry spell starting: ${fmtIn(rain14)} of rain in 14 days, drier than ${100 - rainPct}% of past years`
      : status === "watch"
        ? `Watch: ${rainPct <= THRESHOLDS.watchRainPct ? `rain below normal (${fmtIn(rain14)} in 14 days)` : rootPct !== null && rootPct <= THRESHOLDS.watchRootPct ? `soil drier than usual (${ordinal(rootPct)} percentile)` : "Kansas drought outlook on watch"}`
        : `OK: ${fmtIn(rain14)} of rain in 14 days, ${rainPct >= 67 ? "wetter than usual" : "near normal"} for this time of year`;
  return { status, headline, reasons, metrics };
}
