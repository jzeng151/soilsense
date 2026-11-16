// Scheduled IMERG refresh: keeps the demo fields' IMERG comparisons readable without an operator.
//
// Late comparisons live one hour (cache-policy.ts) and the Field Watch card asks for the window ending on each field's
// current data-through day, which advances daily. Operator warming (docs/imerg-demo-warm.md) therefore goes stale within
// an hour. This cron refreshes at most ONE window per run, chosen as the missing or soonest-expiring one, and refreshes it
// before it expires so public GETs never fall into a gap. One window per run keeps a cold fetch (~30 Earthdata + 1 POWER
// subrequest) inside the Workers Free per-invocation subrequest budget. Final demo windows (365-day TTL) are filled only
// when nothing Late is due. A failed window is skipped for FAILURE_BACKOFF_SECONDS so it cannot starve the others.
import type { Env } from "../env";
import { putCached } from "../lib/cache";
import { latestRuns, WATCHED_FIELDS, type WatchedField } from "../fieldwatch/run";
import { comparisonKey, warmComparison } from "./comparison";
import { days, type Stream } from "./client";

export const IMERG_REFRESH_CRON = "*/5 * * * *";
/** Refresh a cached window once it is this close to expiring (Late TTL is one hour). */
export const REFRESH_MARGIN_MS = 30 * 60_000;
export const FAILURE_BACKOFF_SECONDS = 15 * 60;
/** Historical Final demonstration window, matching the dashboard's default replay. */
export const FINAL_DEMO_END = "2022-07-14";

export interface RefreshTarget { field: WatchedField; end: string; stream: Stream }
export interface RefreshCandidate { target: RefreshTarget; expiresAt: number | null; failedRecently: boolean }
export type RefreshResult =
  | { status: "skipped"; reason: string }
  | { status: "idle"; checked: number }
  | { status: "refreshed" | "failed"; field: string; stream: Stream; end: string; ms: number; error?: string };

export const failureKey = (t: RefreshTarget) => `imerg-refresh-failed:${t.stream}:${t.field.id}:${t.end}`;

/** Pure choice: the due Late window expiring soonest (missing first), else a due Final window; never a recently failed one. */
export function pickTarget(candidates: RefreshCandidate[], now: number): RefreshTarget | null {
  const due = (c: RefreshCandidate) => !c.failedRecently && (c.expiresAt === null || c.expiresAt - now < REFRESH_MARGIN_MS);
  const soonest = (a: RefreshCandidate, b: RefreshCandidate) => (a.expiresAt ?? -Infinity) - (b.expiresAt ?? -Infinity);
  for (const stream of ["late", "final"] as const) {
    const next = candidates.filter((c) => c.target.stream === stream && due(c)).sort(soonest)[0];
    if (next) return next.target;
  }
  return null;
}

/** Windows the dashboard reads: each field's Late window ending on its latest Field Watch data-through day, plus Final 2022. */
export function refreshTargets(dataThrough: Map<string, string | null>): RefreshTarget[] {
  const valid = (end: string | null | undefined): end is string => { if (!end) return false; try { days(end, end); return true; } catch { return false; } };
  const late = WATCHED_FIELDS.flatMap((field) => { const end = dataThrough.get(field.id); return valid(end) ? [{ field, end, stream: "late" as const }] : []; });
  const final = WATCHED_FIELDS.map((field) => ({ field, end: FINAL_DEMO_END, stream: "final" as const }));
  return [...late, ...final];
}

export interface RefreshDeps { now?: number; warm?: typeof warmComparison; latest?: typeof latestRuns }

export async function refreshImergEvidence(env: Env, deps: RefreshDeps = {}): Promise<RefreshResult> {
  if (!env.DB) return { status: "skipped", reason: "D1 binding missing" };
  if (!env.EARTHDATA_TOKEN) return { status: "skipped", reason: "EARTHDATA_TOKEN not configured" };
  const now = deps.now ?? Date.now(), warm = deps.warm ?? warmComparison, latest = deps.latest ?? latestRuns;
  const { runs } = await latest(env.DB);
  const targets = refreshTargets(new Map(runs.map((r) => [r.fieldId, r.dataThrough])));
  const keys = targets.flatMap((t) => [comparisonKey(t.field.id, t.end, t.stream), failureKey(t)]);
  const { results } = await env.DB.prepare(`SELECT key, expires_at FROM cache WHERE key IN (${keys.map((_, i) => `?${i + 1}`).join(", ")})`)
    .bind(...keys).all<{ key: string; expires_at: number }>();
  const expiry = new Map((results ?? []).map((r) => [r.key, r.expires_at]));
  const live = (key: string) => { const at = expiry.get(key); return at !== undefined && at > now ? at : null; };
  const candidates = targets.map((target) => ({ target, expiresAt: live(comparisonKey(target.field.id, target.end, target.stream)), failedRecently: live(failureKey(target)) !== null }));
  const target = pickTarget(candidates, now);
  if (!target) return { status: "idle", checked: candidates.length };
  const started = Date.now();
  try {
    await warm(env, target.field, target.end, target.stream, { force: true });
    return { status: "refreshed", field: target.field.id, stream: target.stream, end: target.end, ms: Date.now() - started };
  } catch (err) {
    await putCached(env.DB, failureKey(target), FAILURE_BACKOFF_SECONDS, { at: now, error: String(err) }).catch(() => {});
    return { status: "failed", field: target.field.id, stream: target.stream, end: target.end, ms: Date.now() - started, error: String(err) };
  }
}
