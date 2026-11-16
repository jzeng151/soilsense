// Wind-erosion EXPOSURE screen (GitHub issues #40, #17). Pure functions, no network.
//
// It answers one narrow question: during the months when wind erosion is typically worst, how many days per year
// are regionally windy (NASA POWER daily maximum hourly 10 m wind ≥ a configured threshold), and does the rotation
// calendar put living cover on the field in those months, or is protection unknown?
// It is a screen, NOT measured or predicted soil loss, and it does not change any rotation score.

import type {
  CoverId,
  CropId,
  ProtectionState,
  WindMeta,
  WindMonthStat,
  WindRotationScreen,
  WindRotationYear,
  WindScreen,
  WindSoil,
} from "../shared/types";
import { CROPS } from "./crops";

const MPH_TO_MS = 0.44704;

/** One versioned exposure rule. */
export const WIND_RULE = {
  version: "wind-exposure-v1",
  parameter: "WS10M_MAX" as const,
  thresholdMph: 18,
  thresholdMs: 18 * MPH_TO_MS, // 8.04672 m/s
  comparison: ">=" as const,
  months: [2, 3, 4, 5],
  monthsSource:
    "K-State Research and Extension MF2860, Principles of Wind Erosion and Its Control: in the Great Plains the critical wind erosion period " +
    '"is typically February through May when winds are the greatest and crops are not high enough to protect the soil surface". ' +
    "Other months are not shown to be safe; outside the Great Plains this window is an assumption.",
  thresholdSource:
    'USDA NRCS Wind Erosion reference (efotg TX Wind_Erosion.pdf, p. 1): winds "are considered erosive when they reach 13 miles per hour at 1 foot above the ground or about 18 miles per hour at a 30-foot height" (Lyles and Krauss 1971).',
  adaptation:
    "Adapted screening setting, not a validated field threshold: the NRCS 18 mph figure is for ~30 ft (~9.14 m); POWER supplies 10 m wind, so the height difference is ignored (approximate transfer). " +
    "WS10M_MAX is the maximum HOURLY wind at 10 m in each day (MERRA-2 grid cell, ~50 km), not a field gust and not a count of erosive hours. " +
    "The NRCS threshold assumes a vulnerable surface (loose, dry, finely granulated, smooth, little or no vegetation). A day at or above it is not evidence that erosion occurred.",
};

export const WIND_LIMITATIONS = [
  "Regional wind: one NASA POWER grid cell (0.5° × 0.625°, MERRA-2), not wind measured at your field; the daily maximum is of hourly means, not gusts.",
  "Not modeled: surface moisture and crusting, roughness and ridges, residue amount and orientation, field length along the wind, and shelter (windbreaks).",
  "Residue left after harvest depends on tillage, which we don't know, so seasons without a growing crop or cover crop show protection as unknown, not bare.",
  "WEI is NRCS's reference index for a bare, smooth, unsheltered, non-crusted soil in Garden City, KS climate. It is not your field's soil loss.",
  "Screen only: it does not change any rotation score. An agronomy review is needed before it could affect a ranking.",
];

/** POWER-style daily series (dates YYYY-MM-DD). */
export interface WindSeries {
  dates: string[];
  ws10m: (number | null)[];
  ws10mMax: (number | null)[];
}

export function isWindy(v: number | null | undefined, thresholdMs = WIND_RULE.thresholdMs): boolean | null {
  if (v === null || v === undefined || !Number.isFinite(v) || v < 0) return null; // missing/invalid: excluded, never zero wind
  return v >= thresholdMs;
}

const monthOf = (d: string) => Number(d.slice(5, 7));
const yearOf = (d: string) => Number(d.slice(0, 4));
const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const round1 = (n: number) => Math.round(n * 10) / 10;

/** Per-month windy-day counts over the baseline, excluding missing days from the denominator. */
export function monthStats(s: WindSeries, months = WIND_RULE.months, thresholdMs = WIND_RULE.thresholdMs): WindMonthStat[] {
  return months.map((month) => {
    let validDays = 0;
    let windyDays = 0;
    s.dates.forEach((d, i) => {
      if (monthOf(d) !== month) return;
      const w = isWindy(s.ws10mMax[i], thresholdMs);
      if (w === null) return;
      validDays += 1;
      if (w) windyDays += 1;
    });
    return { month, validDays, windyDays, share: validDays ? windyDays / validDays : null };
  });
}

/** Climatological windy days in the screened months: Σ share × days in month (null if any month has no valid day). */
export function expectedWindyDays(stats: WindMonthStat[]): number | null {
  let total = 0;
  for (const m of stats) {
    if (m.share === null) return null;
    total += m.share * daysInMonth(2001, m.month); // non-leap reference year
  }
  return round1(total);
}

/** Latest year whose screened months are all present in the series. */
export function recentSeason(s: WindSeries, months = WIND_RULE.months, thresholdMs = WIND_RULE.thresholdMs): WindScreen["recentSeason"] {
  const years = [...new Set(s.dates.map(yearOf))].sort((a, b) => b - a);
  for (const y of years) {
    const idx = s.dates.map((d, i) => [d, i] as const).filter(([d]) => yearOf(d) === y && months.includes(monthOf(d)));
    const expected = months.reduce((a, m) => a + daysInMonth(y, m), 0);
    if (idx.length < expected) continue;
    const ws10mMax = idx.map(([, i]) => s.ws10mMax[i] ?? null);
    const flags = ws10mMax.map((v) => isWindy(v, thresholdMs));
    return {
      year: y,
      dates: idx.map(([d]) => d),
      ws10mMax,
      ws10m: idx.map(([, i]) => s.ws10m[i] ?? null),
      windyDays: flags.filter((f) => f === true).length,
      validDays: flags.filter((f) => f !== null).length,
    };
  }
  return null;
}

/**
 * Declared protection assumption for the screened (Feb–May) months of one plan year.
 * Only two states are ever assigned: living cover (a crop or cover crop growing through that period) or unknown.
 * We never assign "bare": residue depends on tillage, which we do not know.
 */
export function protectionFor(crop: CropId, prev: CropId | null, coverBefore: CoverId | null): { state: ProtectionState; reason: string } {
  const def = CROPS[crop];
  if (def.fallSeeded) return { state: "living-cover", reason: `${def.name} is sown the fall before and grows through spring (stand density unknown).` };
  if (def.perennial && prev === crop) return { state: "living-cover", reason: `Established ${def.name.toLowerCase()} stand from the year before (regrowth timing unknown).` };
  if (coverBefore && coverBefore !== "none")
    return { state: "living-cover", reason: `Cover crop seeded after the previous harvest, growing until it is ended before planting (termination date not modeled).` };
  const prevText = prev ? `after ${CROPS[prev].name.toLowerCase()}` : "previous crop unknown";
  if (crop === "fallow") return { state: "unknown", reason: `Fallow season (${prevText}): stubble cover depends on tillage, unknown.` };
  if (def.perennial) return { state: "unknown", reason: `${def.name} seeding year: little cover until the stand establishes (seeding date not modeled).` };
  return { state: "unknown", reason: `${def.name} is planted in spring, so no crop canopy in Feb–May; residue ${prevText} depends on tillage, unknown.` };
}

export interface RotationInput {
  label: string;
  years: { year: number; crop: CropId; cover: CoverId }[];
}

export function screenRotation(r: RotationInput, lastCrop: CropId | null, windyDays: number | null): WindRotationScreen {
  const years: WindRotationYear[] = r.years.map((y, k) => {
    const prev = k > 0 ? r.years[k - 1]!.crop : lastCrop;
    const coverBefore = k > 0 ? r.years[k - 1]!.cover : null; // unknown for the first plan year
    const p = protectionFor(y.crop, prev, coverBefore);
    return { year: y.year, crop: y.crop, state: p.state, reason: p.reason, windyDays };
  });
  const n = years.length || 1;
  const sum = (s: ProtectionState) => (windyDays === null ? null : round1((years.filter((y) => y.state === s).length * windyDays) / n));
  return { label: r.label, years, windyDaysWithoutLivingCover: sum("unknown"), windyDaysWithLivingCover: sum("living-cover") };
}

export function buildWindScreen(args: {
  series: WindSeries | null;
  meta: WindMeta | null;
  soil: WindSoil;
  rotations: RotationInput[];
  lastCrop: CropId | null;
}): WindScreen {
  const months = args.series ? monthStats(args.series) : WIND_RULE.months.map((month) => ({ month, validDays: 0, windyDays: 0, share: null }));
  const windy = expectedWindyDays(months);
  const years = args.series ? [...new Set(args.series.dates.map(yearOf))].sort((a, b) => a - b) : [];
  const status: WindScreen["status"] = !args.series ? "unavailable" : windy === null || !args.soil.available ? "partial" : "ok";
  return {
    rule: { ...WIND_RULE },
    wind: args.meta,
    months,
    baseline: years.length ? { startYear: years[0]!, endYear: years.at(-1)!, seasons: years.length } : null,
    recentSeason: args.series ? recentSeason(args.series) : null,
    soil: args.soil,
    rotations: args.rotations.map((r) => screenRotation(r, args.lastCrop, windy)),
    limitations: WIND_LIMITATIONS,
    status,
  };
}
