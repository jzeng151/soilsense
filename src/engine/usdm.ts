// U.S. Drought Monitor (USDM) weekly context: pure functions (no network). GitHub issue #31.
//
// Source: the official USDM data services REST API, county statistics in *categorical* (exclusive) format, so the
// six shares add up to 100% and a week is never counted in two categories. These are county-wide area shares of the
// weekly USDM polygons, i.e. regional context at the field's location, never a field measurement, never soil moisture,
// and never proof that the model is right. USDM never changes a rotation score.

import type { UsdmCategory, UsdmCategoryResult, UsdmSourceInfo, UsdmTimeline, UsdmWeek } from "../shared/types";

export const USDM_CATEGORIES: UsdmCategory[] = ["none", "D0", "D1", "D2", "D3", "D4"];

/** Official attribution (https://droughtmonitor.unl.edu/About/Permission.aspx). */
export const USDM_ATTRIBUTION =
  "The U.S. Drought Monitor is jointly produced by the National Drought Mitigation Center at the University of Nebraska-Lincoln, " +
  "the U.S. Department of Agriculture, the National Oceanic and Atmospheric Administration and NASA. Data courtesy of NDMC, via https://droughtmonitor.unl.edu.";

export const USDM_DOCS_URL = "https://droughtmonitor.unl.edu/DmData/DataDownload/WebServiceInfo.aspx";
export const USDM_API_BASE = "https://usdmdataservices.unl.edu/api/CountyStatistics/GetDroughtSeverityStatisticsByAreaPercent";
/** The first USDM map is valid 2000-01-04. */
export const USDM_FIRST_MAP = "2000-01-04";
/** Maps come out on Thursday with data through the Tuesday valid date (2 days later). */
export const USDM_RELEASE_LAG_DAYS = 2;
/** Days after a map's valid week ends before it is "stale": the next map is normally out 3 days after (Thursday). */
const LATEST_MAX_DAYS = 3;

export const USDM_NAMES: Record<UsdmCategory, string> = {
  none: "no drought",
  D0: "D0 abnormally dry",
  D1: "D1 moderate drought",
  D2: "D2 severe drought",
  D3: "D3 extreme drought",
  D4: "D4 exceptional drought",
};

/** Raw row from the statistics service (statisticsType=2, JSON). */
export interface UsdmApiRow {
  mapDate: string;
  fips: string;
  county?: string;
  state?: string;
  none: number;
  d0: number;
  d1: number;
  d2: number;
  d3: number;
  d4: number;
  validStart: string;
  validEnd: string;
  statisticFormatID?: number;
}

/** A share below this (in % of county area) is treated as "covers the whole county" for the mixed flag. */
const UNIFORM_PCT = 99.5;

const iso = (s: string) => s.slice(0, 10);
const DAY_MS = 86_400_000;
const toMs = (d: string) => Date.parse(`${iso(d)}T00:00:00Z`);
const fromMs = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** M/D/YYYY as the service requires. */
export function usdmDate(isoDate: string): string {
  const [y, m, d] = iso(isoDate).split("-").map(Number);
  return `${m}/${d}/${y}`;
}

export function usdmCountyUrl(fips: string, startIso: string, endIso: string): string {
  return `${USDM_API_BASE}?aoi=${fips}&startdate=${usdmDate(startIso)}&enddate=${usdmDate(endIso)}&statisticsType=2`;
}

export function usdmStateMapUrl(validStart: string, stateCode: string | null): string {
  const d = iso(validStart).replace(/-/g, "");
  return stateCode ? `https://droughtmonitor.unl.edu/data/png/${d}/${d}_${stateCode}_trd.png` : `https://droughtmonitor.unl.edu/data/png/${d}/${d}_usdm.png`;
}

export function usdmSource(requestUrl: string, retrievedAt: string): UsdmSourceInfo {
  return {
    name: "U.S. Drought Monitor, county statistics (categorical % area), USDM data services REST API",
    attribution: USDM_ATTRIBUTION,
    requestUrl,
    docsUrl: USDM_DOCS_URL,
    statistics: "Categorical: % of the county's area in exactly one category each (None, D0, D1, D2, D3, D4); shares are not cumulative.",
    spatial:
      "County-wide shares computed by NDMC from the weekly USDM polygons. Regional classification at the field's county, not a field-level measurement or soil-moisture reading.",
    crs: "Not applicable: area shares are pre-computed by NDMC per county; SoilSense does no polygon intersection. The field is placed in its county from its WGS84 latitude/longitude (FCC / Census geocoder).",
    publication:
      "USDM maps are released on Thursdays using data through the Tuesday valid date and are not changed after publication. The statistics service reports the valid week, not a per-map release date.",
    retrievedAt,
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Convert one API row into a week summary. Returns null if the row is malformed (it then counts as missing). */
export function toWeek(row: UsdmApiRow, stateCode: string | null): UsdmWeek | null {
  const pct: Record<UsdmCategory, number> = { none: row.none, D0: row.d0, D1: row.d1, D2: row.d2, D3: row.d3, D4: row.d4 };
  for (const c of USDM_CATEGORIES) if (typeof pct[c] !== "number" || !Number.isFinite(pct[c])) return null;
  const total = USDM_CATEGORIES.reduce((a, c) => a + pct[c], 0);
  // Categorical rows add up to 100; a cumulative (traditional) row would add up to more. Reject anything else.
  if (Math.abs(total - 100) > 1) return null;
  let predominant: UsdmCategory = "none";
  for (const c of USDM_CATEGORIES) if (pct[c] > pct[predominant]) predominant = c; // ties keep the milder category
  let worst: UsdmCategory = "none";
  for (const c of USDM_CATEGORIES) if (pct[c] > 0) worst = c;
  for (const c of USDM_CATEGORIES) pct[c] = round1(pct[c]);
  const validStart = iso(row.validStart || row.mapDate);
  return {
    validStart,
    validEnd: iso(row.validEnd || fromMs(toMs(validStart) + 6 * DAY_MS)),
    pct,
    predominant,
    worst,
    mixed: pct[predominant] < UNIFORM_PCT,
    mapUrl: usdmStateMapUrl(validStart, stateCode),
  };
}

/** Tuesdays (map valid dates) whose valid week (Tue–Mon) overlaps [start, end], capped at the newest map possible by `today`. */
export function expectedValidDates(start: string, end: string, today: string): string[] {
  const first = Math.max(toMs(start), toMs(USDM_FIRST_MAP));
  // Step back to the Tuesday on or before `first`: that map's week covers `first`.
  const dow = new Date(first).getUTCDay(); // 0 Sun … 2 Tue
  let t = first - ((dow - 2 + 7) % 7) * DAY_MS;
  // A map exists only once it is released (Thursday after its Tuesday valid date).
  const lastPossible = Math.min(toMs(end), toMs(today) - USDM_RELEASE_LAG_DAYS * DAY_MS);
  const out: string[] = [];
  for (; t <= lastPossible; t += 7 * DAY_MS) if (t >= toMs(USDM_FIRST_MAP)) out.push(fromMs(t));
  return out;
}

export function summarizeTimeline(args: {
  fips: string;
  start: string;
  end: string;
  today: string;
  rows: UsdmApiRow[];
  source: UsdmSourceInfo;
}): UsdmTimeline {
  const stateCode = args.rows.find((r) => r.state)?.state ?? null;
  const countyName = args.rows.find((r) => r.county)?.county ?? null;
  const byDate = new Map<string, UsdmWeek>();
  for (const r of args.rows) {
    if (r.fips && r.fips !== args.fips) continue;
    const w = toWeek(r, stateCode);
    if (w && !byDate.has(w.validStart)) byDate.set(w.validStart, w); // deduplicate the same week
  }
  const expected = expectedValidDates(args.start, args.end, args.today);
  const expectedSet = new Set(expected);
  const weeks = [...byDate.values()].filter((w) => expectedSet.has(w.validStart)).sort((a, b) => a.validStart.localeCompare(b.validStart));
  const missingWeeks = expected.filter((d) => !byDate.has(d));
  const counts = Object.fromEntries(USDM_CATEGORIES.map((c) => [c, 0])) as Record<UsdmCategory, number>;
  for (const w of weeks) counts[w.predominant] += 1;
  const droughtWeeks = counts.D1 + counts.D2 + counts.D3 + counts.D4;
  const mixedWeeks = weeks.filter((w) => w.mixed).length;
  const status: UsdmTimeline["status"] = weeks.length === 0 ? "unavailable" : missingWeeks.length ? "partial" : "complete";
  const before2000 = toMs(args.end) < toMs(USDM_FIRST_MAP);
  const note = before2000
    ? "No USDM context: the U.S. Drought Monitor starts in January 2000."
    : weeks.length === 0
      ? "USDM data unavailable for this county and period."
      : `${weeks.length} of ${expected.length} weekly maps observed` +
        (missingWeeks.length ? ` (${missingWeeks.length} missing week${missingWeeks.length > 1 ? "s" : ""} not counted as no drought)` : "") +
        `; drought (D1–D4) covered most of the county in ${droughtWeeks} of ${weeks.length} observed weeks.`;
  return {
    fips: args.fips,
    countyName,
    stateCode,
    window: { start: iso(args.start), end: iso(args.end) },
    expectedWeeks: expected.length,
    observedWeeks: weeks.length,
    missingWeeks,
    weeks,
    counts,
    droughtWeeks,
    mixedWeeks,
    status,
    note,
    source: args.source,
  };
}

/**
 * Target-date rule: use the map whose valid week (validStart Tuesday … validEnd Monday) contains the date.
 * - If that map has not been released yet (it comes out the Thursday after its Tuesday valid date), use the newest
 *   earlier map: "latest" when it ended ≤ 3 days before the date, else "stale".
 * - If that map should exist but is missing: for historical dates the result is "unavailable" (a neighbouring week is
 *   never substituted); for current dates (within 7 days of today) the newest earlier map is used and labelled "stale".
 * Never uses a later map for an earlier date.
 */
export function pickWeekFor(
  weeks: UsdmWeek[],
  date: string,
  today?: string,
): { week: UsdmWeek | null; status: UsdmCategoryResult["status"]; ageDays: number | null } {
  const t = toMs(date);
  const sorted = [...weeks].sort((a, b) => a.validStart.localeCompare(b.validStart));
  const hit = sorted.find((w) => toMs(w.validStart) <= t && t <= toMs(w.validEnd));
  if (hit) return { week: hit, status: "matched", ageDays: 0 };
  const before = sorted.filter((w) => toMs(w.validStart) <= t).pop();
  if (!before) return { week: null, status: "unavailable", ageDays: null };
  const ageDays = Math.round((t - toMs(before.validEnd)) / DAY_MS);
  if (today) {
    const tuesday = t - ((new Date(t).getUTCDay() - 2 + 7) % 7) * DAY_MS;
    const released = tuesday + USDM_RELEASE_LAG_DAYS * DAY_MS <= toMs(today);
    const historical = t < toMs(today) - 7 * DAY_MS;
    if (released && historical) return { week: null, status: "unavailable", ageDays: null };
    if (released) return { week: before, status: "stale", ageDays };
  }
  return { week: before, status: ageDays <= LATEST_MAX_DAYS ? "latest" : "stale", ageDays };
}

export function describeWeek(w: UsdmWeek, countyName: string | null, stateCode: string | null): string {
  const place = countyName ? `${countyName}${stateCode ? `, ${stateCode}` : ""}` : "the county";
  const main = `${USDM_NAMES[w.predominant]} over ${Math.round(w.pct[w.predominant])}% of ${place}`;
  const worse = w.worst !== w.predominant ? `; up to ${USDM_NAMES[w.worst]} in part of the county` : "";
  return `${main}${worse} (USDM map valid ${w.validStart})`;
}

export function categoryResult(args: {
  fips: string;
  date: string;
  today: string;
  weeks: UsdmWeek[];
  countyName: string | null;
  stateCode: string | null;
  source: UsdmSourceInfo;
}): UsdmCategoryResult {
  const date = iso(args.date);
  const historical = toMs(date) < toMs(args.today) - 7 * DAY_MS;
  const base = { fips: args.fips, date, historical, countyName: args.countyName, stateCode: args.stateCode, source: args.source };
  if (toMs(date) < toMs(USDM_FIRST_MAP))
    return { ...base, status: "unavailable", week: null, ageDays: null, snapshotId: null, label: "No USDM context: the U.S. Drought Monitor starts in January 2000." };
  const { week, status, ageDays } = pickWeekFor(args.weeks, date, args.today);
  if (!week) return { ...base, status, week: null, ageDays, snapshotId: null, label: `USDM category unavailable for ${date} (no map for that week); not the same as no drought.` };
  let label = describeWeek(week, args.countyName, args.stateCode);
  if (status === "stale") label = `Stale: ${label}, ${ageDays} days before ${date}`;
  if (status === "latest") label = `${label}; newest released map`;
  if (historical) label = `Historical: ${label}`;
  return { ...base, status, week, ageDays, snapshotId: `usdm-county-${args.fips}-${week.validStart}`, label };
}

/**
 * How the USDM weeks compare with a replayed bad year. Agreement and disagreement are both valid outcomes; this never
 * feeds a score.
 */
export function replayAgreement(t: UsdmTimeline): { kind: "drought" | "no-drought" | "mixed" | "unknown"; text: string } {
  if (t.observedWeeks === 0) return { kind: "unknown", text: t.note };
  const share = t.droughtWeeks / t.observedWeeks;
  if (share >= 0.5)
    return { kind: "drought", text: `USDM also showed drought (D1–D4) over most of the county in ${t.droughtWeeks} of ${t.observedWeeks} observed weeks.` };
  if (t.droughtWeeks === 0 && t.counts.D0 === 0)
    return {
      kind: "no-drought",
      text: `USDM showed no drought over most of the county in all ${t.observedWeeks} observed weeks: this bad year was likely driven by something else (heat, timing, excess water) or local conditions.`,
    };
  return { kind: "mixed", text: `USDM drought (D1–D4) covered most of the county in ${t.droughtWeeks} of ${t.observedWeeks} observed weeks; abnormally dry (D0) in ${t.counts.D0}.` };
}
