// U.S. Drought Monitor county statistics client (GitHub issue #31).
// Docs: https://droughtmonitor.unl.edu/DmData/DataDownload/WebServiceInfo.aspx (public, no key).
// Historical weekly maps never change after publication, so past windows are cached for a year; windows that reach
// into the last two weeks are refreshed every 6 hours. The newest good answer per county is also kept as a
// "last valid snapshot", used (and labelled by age) when a refresh fails.

import {
  categoryResult,
  summarizeTimeline,
  toWeek,
  type UsdmApiRow,
  usdmCountyUrl,
  usdmSource,
} from "../../engine/usdm";
import type { UsdmCategoryResult, UsdmTimeline, UsdmWeek } from "../../shared/types";
import { cached, DAY_SECONDS } from "../lib/cache";
import { freshnessKey, usdmTtl } from "../lib/freshness";
import { fetchJson, UpstreamError } from "../lib/http";

const SERVICE = "U.S. Drought Monitor";

interface RowsSnapshot {
  rows: UsdmApiRow[];
  requestUrl: string;
  retrievedAt: string;
}

const today = (now: Date) => now.toISOString().slice(0, 10);
const addDays = (isoDate: string, n: number) => new Date(Date.parse(`${isoDate}T00:00:00Z`) + n * DAY_SECONDS * 1000).toISOString().slice(0, 10);

export function isFips(fips: string): boolean {
  return /^\d{5}$/.test(fips);
}

async function download(fips: string, start: string, end: string, now: Date): Promise<RowsSnapshot> {
  const requestUrl = usdmCountyUrl(fips, start, end);
  const json = await fetchJson<unknown>(requestUrl, { service: SERVICE, timeoutMs: 15000, retries: 1, headers: { Accept: "application/json" } });
  if (!Array.isArray(json)) throw new UpstreamError(SERVICE, "unexpected response shape");
  const rows = (json as UsdmApiRow[]).filter((r) => r && typeof r.validStart === "string" && r.fips === fips);
  return { rows, requestUrl, retrievedAt: now.toISOString() };
}

// Last valid snapshot per county (memory + the shared D1 `cache` table), kept 60 days for refresh failures.
const lastMem = new Map<string, RowsSnapshot>();
const lastKey = (fips: string) => `usdm:last:v1:${fips}`;
const newest = (s: RowsSnapshot | null | undefined) => (s?.rows ?? []).reduce((m, r) => (r.validStart > m ? r.validStart : m), "");

async function loadLast(db: D1Database | undefined, fips: string): Promise<RowsSnapshot | null> {
  const mem = lastMem.get(fips);
  if (mem) return mem;
  if (!db) return null;
  try {
    const row = await db.prepare("SELECT value, expires_at FROM cache WHERE key = ?1").bind(lastKey(fips)).first<{ value: string; expires_at: number }>();
    return row && row.expires_at > Date.now() ? (JSON.parse(row.value) as RowsSnapshot) : null;
  } catch {
    return null;
  }
}

async function saveLast(db: D1Database | undefined, fips: string, snap: RowsSnapshot): Promise<void> {
  const prev = await loadLast(db, fips);
  if (prev && newest(prev) >= newest(snap)) return; // same week/revision already kept
  lastMem.set(fips, snap);
  if (!db) return;
  try {
    const now = Date.now();
    await db
      .prepare("INSERT INTO cache (key, value, expires_at, created_at) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(key) DO UPDATE SET value = excluded.value, expires_at = excluded.expires_at, created_at = excluded.created_at")
      .bind(lastKey(fips), JSON.stringify(snap), now + 60 * DAY_SECONDS * 1000, now)
      .run();
  } catch (err) {
    console.warn(JSON.stringify({ msg: "usdm snapshot save failed", fips, err: String(err) }));
  }
}

/** For tests. */
export function clearUsdmSnapshots(): void {
  lastMem.clear();
}

/** Raw weekly rows for a county and window, cached (immutable past windows for a year, recent ones for 6 h). */
export async function getUsdmRows(db: D1Database | undefined, fips: string, start: string, end: string, now = new Date()): Promise<RowsSnapshot> {
  if (!isFips(fips)) throw new Error("fips must be a 5-digit county code");
  const recent = end >= addDays(today(now), -14);
  const key = freshnessKey(`usdm:v1:${fips}:${start}:${end}`);
  try {
    const ttl = recent ? usdmTtl(now) : 365 * DAY_SECONDS;
    const { value } = await cached(db, key, { softTtlSeconds: ttl, staleSeconds: 0, expiresAt: now.getTime() + ttl * 1000 }, () => download(fips, start, end, now));
    if (recent && value.rows.length) await saveLast(db, fips, value);
    return value;
  } catch (err) {
    if (!recent) throw err;
    // Refresh failed: fall back to the last valid snapshot (the caller labels its age as latest/stale).
    const last = await loadLast(db, fips);
    if (last?.rows.length) return last;
    throw err;
  }
}

/** Weekly USDM timeline for a county and window (missing weeks stay missing). */
export async function getUsdmTimeline(db: D1Database | undefined, fips: string, start: string, end: string, now = new Date()): Promise<UsdmTimeline> {
  try {
    const snap = await getUsdmRows(db, fips, start, end, now);
    return summarizeTimeline({ fips, start, end, today: today(now), rows: snap.rows, source: usdmSource(snap.requestUrl, snap.retrievedAt) });
  } catch (err) {
    console.warn(JSON.stringify({ msg: "usdm timeline failed", fips, start, end, err: String(err) }));
    const t = summarizeTimeline({ fips, start, end, today: today(now), rows: [], source: usdmSource(usdmCountyUrl(fips, start, end), now.toISOString()) });
    return { ...t, note: `USDM data unavailable right now (${err instanceof Error ? err.message : "request failed"}); missing weeks are not treated as no drought.` };
  }
}

/** USDM context for the growing season (May–Sep, the replay's weather window) of each year. */
export async function getUsdmReplayTimelines(db: D1Database | undefined, fips: string, years: number[], now = new Date()): Promise<UsdmTimeline[]> {
  return Promise.all(years.map((y) => getUsdmTimeline(db, fips, `${y}-05-01`, `${y}-09-30`, now)));
}

/**
 * Dated USDM category for a county on a date: the map whose valid week contains the date; if the date is after the
 * newest released map, the newest earlier map labelled "latest" or "stale". For Field Watch results and messages.
 */
export async function usdmCategoryFor(
  fips: string,
  isoDate: string,
  opts: { db?: D1Database; now?: Date } = {},
): Promise<UsdmCategoryResult> {
  const now = opts.now ?? new Date();
  const date = isoDate.slice(0, 10);
  const start = addDays(date, -21);
  let weeks: UsdmWeek[] = [];
  let countyName: string | null = null;
  let stateCode: string | null = null;
  let source = usdmSource(usdmCountyUrl(fips, start, date), now.toISOString());
  try {
    const snap = await getUsdmRows(opts.db, fips, start, date, now);
    stateCode = snap.rows.find((r) => r.state)?.state ?? null;
    countyName = snap.rows.find((r) => r.county)?.county ?? null;
    weeks = snap.rows.map((r) => toWeek(r, stateCode)).filter((w): w is UsdmWeek => w !== null);
    source = usdmSource(snap.requestUrl, snap.retrievedAt);
  } catch (err) {
    console.warn(JSON.stringify({ msg: "usdm category failed", fips, date, err: String(err) }));
  }
  return categoryResult({ fips, date, today: today(now), weeks, countyName, stateCode, source });
}
