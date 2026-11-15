// NASA POWER current-observation snapshots (issues #12, #24, #25): request plan, validation and
// content addressing. Pure functions only (no bindings), so the Workflow's fetch -> validate -> publish
// logic is testable in Node.
//
// Current snapshots are a separate stream from the historical record: /api/plan and Field Watch's
// long-term normals use the 1991-to-last-year POWER archive (D1 cache keys "power:v1:*"), which this
// refresh never reads or writes.

import { snapToPowerGrid } from "../data/power";

export const SNAPSHOT_SCHEMA = "soilsense.power-daily-snapshot/v1";
export const POWER_DAILY_ENDPOINT = "https://power.larc.nasa.gov/api/temporal/daily/point";

/** Variables, documented units (POWER "parameters" block) and plausible physical ranges. */
export const REQUIRED_VARIABLES = {
  PRECTOTCORR: { units: "mm/day", min: 0, max: 1000, description: "Precipitation (bias-corrected), daily total" },
  T2M_MAX: { units: "C", min: -80, max: 65, description: "Air temperature at 2 m, daily maximum" },
  T2M_MIN: { units: "C", min: -80, max: 65, description: "Air temperature at 2 m, daily minimum" },
  GWETROOT: { units: "1", min: 0, max: 1, description: "Root-zone soil wetness (0 = dry, 1 = saturated), dimensionless" },
} as const;
export type PowerVariable = keyof typeof REQUIRED_VARIABLES;
export const VARIABLES = Object.keys(REQUIRED_VARIABLES) as PowerVariable[];

export const REFRESH_POLICY = {
  /** Days requested from POWER, ending today (inclusive): bounded, covers the 60-day window plus NASA's lag. */
  requestDays: 76,
  /** Days kept in a snapshot, ending at the observed data-through date. */
  windowDays: 60,
  /** Minimum share of non-missing days per variable inside the window. */
  minCompleteness: 0.95,
  /** A snapshot whose data-through date is older than this (vs. the run date) is stale/rejected. POWER lags ~3-5 days. */
  maxAgeDays: 10,
} as const;

export const POWER_LICENSE = {
  provider: "NASA Langley Research Center (LaRC) POWER Project, funded through the NASA Earth Science/Applied Science Program",
  terms: "NASA POWER data are freely available without restriction; NASA asks users to acknowledge the source.",
  attribution:
    "These data were obtained from the NASA Langley Research Center (LaRC) POWER Project funded through the NASA Earth Science/Applied Science Program.",
  url: "https://power.larc.nasa.gov/docs/referencing/",
} as const;

export interface Farm {
  id: string;
  name: string;
  lat: number;
  lon: number;
}

export interface GridCell {
  key: string;
  lat: number;
  lon: number;
  farmIds: string[];
}

/** Group farms by POWER grid cell so each identical upstream request is made once (NASA asks for this). */
export function planCells(farms: Farm[]): GridCell[] {
  const cells = new Map<string, GridCell>();
  for (const f of farms) {
    const g = snapToPowerGrid(f.lat, f.lon);
    const key = `${g.lat.toFixed(3)}_${g.lon.toFixed(3)}`;
    const cell = cells.get(key) ?? { key, lat: g.lat, lon: g.lon, farmIds: [] };
    cell.farmIds.push(f.id);
    cells.set(key, cell);
  }
  return [...cells.values()];
}

const DAY_MS = 86_400_000;
export const isoDay = (d: Date): string => d.toISOString().slice(0, 10);
const compactDay = (iso: string) => iso.replace(/-/g, "");
const addDays = (iso: string, n: number) => isoDay(new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY_MS));
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);

export interface PowerQuery {
  url: string;
  start: string;
  end: string;
  params: { parameters: string; community: string; latitude: number; longitude: number; start: string; end: string; format: string; "time-standard": string };
}

export function buildQuery(cell: Pick<GridCell, "lat" | "lon">, today: Date): PowerQuery {
  const end = isoDay(today);
  const start = addDays(end, -(REFRESH_POLICY.requestDays - 1));
  const params = {
    parameters: VARIABLES.join(","),
    community: "AG",
    latitude: cell.lat,
    longitude: cell.lon,
    start: compactDay(start),
    end: compactDay(end),
    format: "JSON",
    "time-standard": "LST",
  };
  const qs = Object.entries(params)
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  return { url: `${POWER_DAILY_ENDPOINT}?${qs}`, start, end, params };
}

/** The content that is hashed: observations and their provenance, never retrieval time. */
export interface SnapshotContent {
  schema: typeof SNAPSHOT_SCHEMA;
  stream: "current";
  product: { name: string; apiVersion: string | null; sources: string[]; community: "AG"; timeStandard: "LST"; temporal: "daily" };
  grid: { lat: number; lon: number; elevationM: number | null; resolution: string };
  parameters: Record<PowerVariable, { units: string; longname: string | null }>;
  period: { start: string; end: string; days: number };
  dataThrough: string;
  lastObserved: Record<PowerVariable, string | null>;
  completeness: Record<PowerVariable, number>;
  missingValue: { upstreamFill: number; storedAs: "null" };
  dates: string[];
  values: Record<PowerVariable, (number | null)[]>;
}

export interface Manifest {
  snapshotId: string;
  contentHash: string;
  schema: typeof SNAPSHOT_SCHEMA;
  stream: "current";
  source: { name: "NASA POWER Daily API"; endpoint: string; url: string; query: PowerQuery["params"]; requestedPeriod: { start: string; end: string } };
  product: SnapshotContent["product"];
  parameters: Record<PowerVariable, { units: string; longname: string | null; description: string }>;
  grid: SnapshotContent["grid"];
  observationPeriod: SnapshotContent["period"];
  dataThrough: string;
  retrievedAt: string;
  completeness: SnapshotContent["completeness"];
  missingValues: string;
  validation: { policy: typeof REFRESH_POLICY; passed: true; checks: string[] };
  license: typeof POWER_LICENSE;
  bundle: { objects: { bundle: string; source: string } };
}

export type Verdict =
  | { ok: true; content: SnapshotContent; contentHash: string; snapshotId: string; checks: string[] }
  | { ok: false; errors: string[]; dataThrough: string | null };

interface RawPower {
  geometry?: { coordinates?: number[] };
  header?: { fill_value?: unknown; api?: { version?: unknown }; sources?: unknown };
  parameters?: Record<string, { units?: unknown; longname?: unknown }>;
  properties?: { parameter?: Record<string, Record<string, unknown>> };
  messages?: unknown;
}

function isValidCompactDate(k: string): boolean {
  if (!/^\d{8}$/.test(k)) return false;
  const iso = `${k.slice(0, 4)}-${k.slice(4, 6)}-${k.slice(6, 8)}`;
  const t = Date.parse(`${iso}T00:00:00Z`);
  return Number.isFinite(t) && isoDay(new Date(t)) === iso;
}

/**
 * Validate a raw POWER response against the request. Checks: required variables, documented units,
 * contiguous dates matching the requested range, fill values -> null (never zero), plausible ranges,
 * grid mapping, coverage in the 60-day window and age of the observed data-through date.
 */
export async function validateCandidate(raw: unknown, query: PowerQuery, cell: Pick<GridCell, "lat" | "lon">): Promise<Verdict> {
  const errors: string[] = [];
  const checks: string[] = [];
  const r = (raw && typeof raw === "object" ? raw : {}) as RawPower;
  const param = r.properties?.parameter;
  if (!param || typeof param !== "object") return { ok: false, errors: ["malformed response: properties.parameter is missing"], dataThrough: null };

  const missing = VARIABLES.filter((v) => !param[v] || typeof param[v] !== "object");
  if (missing.length) return { ok: false, errors: [`required variables missing: ${missing.join(", ")}`], dataThrough: null };
  checks.push(`required variables present: ${VARIABLES.join(", ")}`);

  // Units must be documented by the response and match what the app assumes.
  const parameters = {} as SnapshotContent["parameters"];
  for (const v of VARIABLES) {
    const meta = r.parameters?.[v];
    const units = typeof meta?.units === "string" ? meta.units : null;
    if (units === null) errors.push(`units for ${v} not documented in the response`);
    else if (units !== REQUIRED_VARIABLES[v].units) errors.push(`unexpected units for ${v}: "${units}" (expected "${REQUIRED_VARIABLES[v].units}")`);
    parameters[v] = { units: units ?? "", longname: typeof meta?.longname === "string" ? meta.longname : null };
  }
  if (!errors.length) checks.push("units match the documented POWER units");

  const fill = r.header?.fill_value;
  if (typeof fill !== "number" || !Number.isFinite(fill)) errors.push("header.fill_value missing; cannot tell missing values from observations");
  const fillValue = typeof fill === "number" ? fill : -999;

  // Dates: valid, identical across variables, contiguous, exactly the requested range.
  const keys = Object.keys(param.PRECTOTCORR!).sort();
  const bad = keys.filter((k) => !isValidCompactDate(k));
  if (bad.length) errors.push(`invalid dates in response: ${bad.slice(0, 3).join(", ")}`);
  for (const v of VARIABLES) {
    const k2 = Object.keys(param[v]!).sort();
    if (k2.length !== keys.length || k2.some((k, i) => k !== keys[i])) errors.push(`dates for ${v} differ from PRECTOTCORR`);
  }
  const dates = keys.filter(isValidCompactDate).map((k) => `${k.slice(0, 4)}-${k.slice(4, 6)}-${k.slice(6, 8)}`);
  for (let i = 1; i < dates.length; i++) {
    if (daysBetween(dates[i - 1]!, dates[i]!) !== 1) {
      errors.push(`dates not contiguous between ${dates[i - 1]} and ${dates[i]}`);
      break;
    }
  }
  if (dates[0] !== query.start || dates[dates.length - 1] !== query.end)
    errors.push(`returned range ${dates[0] ?? "?"}..${dates[dates.length - 1] ?? "?"} does not match requested ${query.start}..${query.end}`);
  if (!errors.some((e) => e.startsWith("dates") || e.startsWith("returned range") || e.startsWith("invalid dates"))) checks.push("dates valid, contiguous and match the requested range");

  // Spatial mapping: the response must be for the requested grid point.
  const coords = r.geometry?.coordinates ?? [];
  const [gLon, gLat, elev] = coords;
  if (typeof gLat !== "number" || typeof gLon !== "number" || Math.abs(gLat - cell.lat) > 0.25 || Math.abs(gLon - cell.lon) > 0.3125)
    errors.push(`response location ${gLat ?? "?"}, ${gLon ?? "?"} is not the requested grid cell ${cell.lat}, ${cell.lon}`);
  else checks.push(`location matches grid cell ${cell.lat}, ${cell.lon}`);

  // Values: fill / non-numeric -> null; out-of-range real values mean the units or product changed.
  const values = {} as SnapshotContent["values"];
  for (const v of VARIABLES) {
    const series = param[v]!;
    const { min, max } = REQUIRED_VARIABLES[v];
    let outOfRange = 0;
    values[v] = keys.filter(isValidCompactDate).map((k) => {
      const x = series[k];
      if (typeof x !== "number" || !Number.isFinite(x) || x === fillValue || x <= -999) return null;
      if (x < min || x > max) outOfRange++;
      return x;
    });
    if (outOfRange) errors.push(`${outOfRange} value(s) of ${v} outside the plausible range ${min}..${max} ${REQUIRED_VARIABLES[v].units}`);
  }
  const tminAboveTmax = dates.filter((_, i) => {
    const lo = values.T2M_MIN[i];
    const hi = values.T2M_MAX[i];
    return lo !== null && lo !== undefined && hi !== null && hi !== undefined && lo > hi + 0.01;
  }).length;
  if (tminAboveTmax) errors.push(`${tminAboveTmax} day(s) with T2M_MIN above T2M_MAX`);
  checks.push(`fill value ${fillValue} stored as null, never zero`);

  // Observed data-through: the last day on which every required variable has a real value.
  let throughIdx = -1;
  for (let i = dates.length - 1; i >= 0; i--) {
    if (VARIABLES.every((v) => values[v][i] !== null && values[v][i] !== undefined)) {
      throughIdx = i;
      break;
    }
  }
  const dataThrough = throughIdx >= 0 ? dates[throughIdx]! : null;
  if (!dataThrough) {
    errors.push("no day has all required variables observed");
    return { ok: false, errors, dataThrough: null };
  }
  const age = daysBetween(dataThrough, query.end);
  if (age > REFRESH_POLICY.maxAgeDays) errors.push(`stale: observations end ${dataThrough}, ${age} days before ${query.end} (limit ${REFRESH_POLICY.maxAgeDays})`);
  else checks.push(`observed data through ${dataThrough} (${age} days before run date ${query.end})`);

  const startIdx = throughIdx - (REFRESH_POLICY.windowDays - 1);
  if (startIdx < 0) {
    errors.push(`short coverage: only ${throughIdx + 1} day(s) up to ${dataThrough}; ${REFRESH_POLICY.windowDays} required`);
    return { ok: false, errors, dataThrough };
  }
  const windowDates = dates.slice(startIdx, throughIdx + 1);
  const windowValues = {} as SnapshotContent["values"];
  const completeness = {} as SnapshotContent["completeness"];
  const lastObserved = {} as SnapshotContent["lastObserved"];
  for (const v of VARIABLES) {
    windowValues[v] = values[v].slice(startIdx, throughIdx + 1);
    const present = windowValues[v].filter((x) => x !== null).length;
    completeness[v] = Math.round((present / REFRESH_POLICY.windowDays) * 1000) / 1000;
    if (completeness[v] < REFRESH_POLICY.minCompleteness)
      errors.push(`insufficient coverage for ${v}: ${(completeness[v] * 100).toFixed(1)}% of ${REFRESH_POLICY.windowDays} days (need ${REFRESH_POLICY.minCompleteness * 100}%)`);
    let last: string | null = null;
    for (let i = dates.length - 1; i >= 0; i--)
      if (values[v][i] !== null) {
        last = dates[i]!;
        break;
      }
    lastObserved[v] = last;
  }
  if (errors.length) return { ok: false, errors, dataThrough };
  checks.push(`coverage >= ${REFRESH_POLICY.minCompleteness * 100}% for every variable over ${REFRESH_POLICY.windowDays} days`);

  const content: SnapshotContent = {
    schema: SNAPSHOT_SCHEMA,
    stream: "current",
    product: {
      name: "NASA POWER Daily API",
      apiVersion: typeof r.header?.api?.version === "string" ? r.header.api.version : null,
      sources: Array.isArray(r.header?.sources) ? (r.header.sources as unknown[]).map(String) : [],
      community: "AG",
      timeStandard: "LST",
      temporal: "daily",
    },
    grid: { lat: cell.lat, lon: cell.lon, elevationM: typeof elev === "number" ? elev : null, resolution: "0.5° lat × 0.625° lon (MERRA-2)" },
    parameters,
    period: { start: windowDates[0]!, end: dataThrough, days: windowDates.length },
    dataThrough,
    lastObserved,
    completeness,
    missingValue: { upstreamFill: fillValue, storedAs: "null" },
    dates: windowDates,
    values: windowValues,
  };
  const contentHash = await sha256Hex(canonicalJson(content));
  return { ok: true, content, contentHash, snapshotId: snapshotIdFor(contentHash), checks };
}

/** Deterministic JSON (object keys sorted) so equal content always hashes the same. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const o = value as Record<string, unknown>;
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`)
    .join(",")}}`;
}

export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const snapshotIdFor = (contentHash: string) => `pwr-${contentHash.slice(0, 24)}`;

/** R2 keys: content-addressed and immutable; public demo evidence lives under "public/". */
export function evidenceKeys(contentHash: string): { bundle: string; source: string } {
  const base = `public/power-daily/v1/${contentHash}`;
  return { bundle: `${base}/bundle.json`, source: `${base}/source.json` };
}

export function buildManifest(v: Extract<Verdict, { ok: true }>, query: PowerQuery, retrievedAt: string): Manifest {
  const parameters = {} as Manifest["parameters"];
  for (const k of VARIABLES) parameters[k] = { ...v.content.parameters[k], description: REQUIRED_VARIABLES[k].description };
  return {
    snapshotId: v.snapshotId,
    contentHash: v.contentHash,
    schema: SNAPSHOT_SCHEMA,
    stream: "current",
    source: { name: "NASA POWER Daily API", endpoint: POWER_DAILY_ENDPOINT, url: query.url, query: query.params, requestedPeriod: { start: query.start, end: query.end } },
    product: v.content.product,
    parameters,
    grid: v.content.grid,
    observationPeriod: v.content.period,
    dataThrough: v.content.dataThrough,
    retrievedAt,
    completeness: v.content.completeness,
    missingValues: `Upstream fill value ${v.content.missingValue.upstreamFill} is stored as null (never zero).`,
    validation: { policy: REFRESH_POLICY, passed: true, checks: v.checks },
    license: POWER_LICENSE,
    bundle: { objects: evidenceKeys(v.contentHash) },
  };
}

/** Freshness of an accepted snapshot is judged by its observed data-through date, not by when it was fetched. */
export function freshness(dataThrough: string | null, now: Date): { state: "fresh" | "stale" | "none"; ageDays: number | null } {
  if (!dataThrough) return { state: "none", ageDays: null };
  const ageDays = daysBetween(dataThrough, isoDay(now));
  return { state: ageDays <= REFRESH_POLICY.maxAgeDays ? "fresh" : "stale", ageDays };
}
