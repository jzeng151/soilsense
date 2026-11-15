// Recurring Field Watch for one field's agent (#15 weekly checks, #35 crop-stress-window checks).
// Pure logic, unit-tested in Node; FieldAgent (agent.ts) wires it to the Agents SDK scheduler and SQLite.
//
// - Recurrence is OFF by default and needs an explicit enable.
// - Weekly checks run on a fixed, documented schedule (Mondays 14:00 UTC, see nextWeeklyAt) and use only current NASA data
//   that passes the freshness rule; stale or incomplete data gives "insufficient", never a made-up result.
// - With a confirmed crop, a one-off check is also scheduled when that crop's reference stress window opens.
//   Windows come from SoilSense's crop defaults (src/engine/crops.ts, heatWindow): approximate planning
//   assumptions, NOT an observed crop stage. Outside the window, weekly results say "inactive" instead of
//   forcing a stress result.
// - Every change to the settings bumps `version`. Queued callbacks carry the version they were scheduled
//   under and do nothing if settings changed since, so obsolete work can't come back to life.
// - Run ids are stable per field + data period (weekly) or field + crop + season + settings version
//   (window), so repeated callbacks never create duplicate results.

import { researchNoteFor } from "./researchNote";
import { CROPS } from "../../engine/crops";
import type { CropId } from "../../shared/types";
import type { Env } from "../env";
import { RULE_TEXT, RULE_VERSION, type WatchReason } from "./rule";
import { evaluateLive, type AgentRun, type RunStore } from "./agentCore";
import { defaultDeps, sourcesFor, type FieldWatchDeps, type WatchedField } from "./run";

/** Mondays 14:00 UTC = 8:00 am CST / 9:00 am CDT for the Plains and Corn Belt demo farms. Computed here (not as a
 *  cron string) so the time never depends on the runtime's local time zone. */
export const WEEKLY_DESCRIPTION = "Mondays at 14:00 UTC (8:00 am CST / 9:00 am CDT)";

/** The next Monday 14:00 UTC strictly after `now` (ms). */
export function nextWeeklyAt(now: number): number {
  const d = new Date(now);
  const t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 14, 0, 0);
  const daysToMonday = (8 - new Date(t).getUTCDay()) % 7; // 0 when today is Monday
  let at = t + daysToMonday * 86_400_000;
  if (at <= now) at += 7 * 86_400_000;
  return at;
}
/** A weekly result needs NASA data whose 14-day window ends no more than this many days before the check. */
export const FRESH_DAYS = 10;
/** Crops a farmer can confirm for window checks (fallow has no stress window). */
export const WATCHABLE_CROPS: readonly CropId[] = (Object.keys(CROPS) as CropId[]).filter((c) => c !== "fallow");

export interface WatchSettings {
  enabled: boolean;
  /** The farmer's confirmed crop this season (separate from any hypothetical rotation compared in the planner). */
  crop: CropId | null;
  /** Bumped on every change; scheduled callbacks for an older version are ignored. */
  version: number;
  updatedAt: number | null;
  weeklyScheduleId: string | null;
  nextWeeklyAt: number | null;
  windowScheduleId: string | null;
  nextWindow: WindowPlan | null;
}

export interface WindowPlan {
  crop: CropId;
  seasonYear: number;
  /** ISO dates, inclusive. */
  from: string;
  to: string;
  /** When the opening check runs (ms). */
  at: number;
  source: string;
}

export const DEFAULT_SETTINGS: WatchSettings = {
  enabled: false,
  crop: null,
  version: 0,
  updatedAt: null,
  weeklyScheduleId: null,
  nextWeeklyAt: null,
  windowScheduleId: null,
  nextWindow: null,
};

export class SettingsError extends Error {}

const WINDOW_SOURCE = "SoilSense crop defaults (src/engine/crops.ts, heat-sensitive window): approximate planning assumption, not an observed crop stage";
const pad = (n: number) => String(n).padStart(2, "0");

/** The crop's reference stress window in a given year, as ISO dates. */
export function windowFor(crop: CropId, year: number): { from: string; to: string } {
  const w = CROPS[crop].heatWindow;
  return { from: `${year}-${pad(w.from[0])}-${pad(w.from[1])}`, to: `${year}-${pad(w.to[0])}-${pad(w.to[1])}` };
}

/** Next opening of the crop's window after `now` (this year if still ahead, otherwise next year), checked at 14:00 UTC. */
export function nextWindowOpening(crop: CropId, now: number): WindowPlan {
  const year = new Date(now).getUTCFullYear();
  for (const y of [year, year + 1]) {
    const { from, to } = windowFor(crop, y);
    const at = Date.parse(`${from}T14:00:00Z`);
    if (at > now) return { crop, seasonYear: y, from, to, at, source: WINDOW_SOURCE };
  }
  throw new Error("unreachable");
}

export function windowIsOpen(crop: CropId, isoDay: string): boolean {
  const { from, to } = windowFor(crop, Number(isoDay.slice(0, 4)));
  return isoDay >= from && isoDay <= to;
}

/** Validate a settings change. Returns the new settings (schedule ids are filled in by the agent). */
export function applySettings(current: WatchSettings, input: { enabled?: unknown; crop?: unknown }, now: number): WatchSettings {
  const enabled = input.enabled === undefined ? current.enabled : input.enabled;
  if (typeof enabled !== "boolean") throw new SettingsError("enabled must be true or false");
  let crop = current.crop;
  if (input.crop !== undefined) {
    if (input.crop !== null && !WATCHABLE_CROPS.includes(input.crop as CropId)) throw new SettingsError(`crop must be null or one of: ${WATCHABLE_CROPS.join(", ")}`);
    crop = input.crop as CropId | null;
  }
  return { ...current, enabled, crop, version: current.version + 1, updatedAt: now };
}

function baseRun(field: WatchedField, runId: string, mode: "weekly" | "window", now: number): AgentRun {
  return {
    runId,
    fieldId: field.id,
    fieldName: field.name,
    mode,
    replayId: null,
    status: "pending",
    ruleVersion: RULE_VERSION,
    rule: RULE_TEXT,
    scheduledAt: now,
    dueAt: now,
    completedAt: null,
    headline: null,
    reasons: [],
    metrics: null,
    snapshot: null,
    sources: [],
  };
}

const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

/**
 * A scheduled recurring check fired. Does nothing (returns null) if recurrence was disabled or the settings
 * changed since it was scheduled. Otherwise records at most one result per field + data period (weekly) or
 * per field + crop + season + settings version (window).
 */
export async function runRecurringCheck(
  kind: "weekly" | "window",
  payload: { version: number; seasonYear?: number; crop?: CropId },
  settings: WatchSettings,
  store: RunStore,
  env: Env,
  field: WatchedField,
  now: Date,
  deps: FieldWatchDeps = defaultDeps,
): Promise<AgentRun | null> {
  if (!settings.enabled || payload.version !== settings.version) return null;
  if (kind === "window" && (!settings.crop || settings.crop !== payload.crop)) return null;
  const today = now.toISOString().slice(0, 10);

  if (kind === "window") {
    const runId = `${field.id}:window:${payload.crop}:${payload.seasonYear}:v${payload.version}`;
    const existing = store.get(runId);
    if (existing) return existing;
    return evaluateAndSave(store, baseRun(field, runId, "window", now.getTime()), env, field, now, deps, settings.crop, {
      id: "window",
      text: `${CROPS[payload.crop!].name} reference stress window ${windowFor(payload.crop!, payload.seasonYear!).from} to ${windowFor(payload.crop!, payload.seasonYear!).to} opened: checking current conditions. This is an estimate from crop defaults, not an observed crop stage, and not a forecast.`,
      source: WINDOW_SOURCE,
    });
  }

  // Weekly. With a confirmed crop outside its window, report "inactive" instead of a stress result.
  if (settings.crop && !windowIsOpen(settings.crop, today)) {
    const w = windowFor(settings.crop, Number(today.slice(0, 4)));
    const runId = `${field.id}:weekly:inactive:${settings.crop}:${today}`;
    const existing = store.get(runId);
    if (existing) return existing;
    const run: AgentRun = {
      ...baseRun(field, runId, "weekly", now.getTime()),
      status: "inactive",
      completedAt: now.getTime(),
      headline: `${CROPS[settings.crop].name}'s reference stress window (${w.from.slice(5)} to ${w.to.slice(5)}) isn't open, so no stress check this week`,
      reasons: [{ id: "inactive", text: "Weekly checks resume when the confirmed crop's reference window opens.", source: WINDOW_SOURCE }],
      sources: sourcesFor(field, null),
    };
    store.insert(run);
    return run;
  }
  return evaluateAndSave(store, baseRun(field, "", "weekly", now.getTime()), env, field, now, deps, settings.crop, null);
}

async function evaluateAndSave(
  store: RunStore,
  run: AgentRun,
  env: Env,
  field: WatchedField,
  now: Date,
  deps: FieldWatchDeps,
  crop: CropId | null,
  extraReason: WatchReason | null,
): Promise<AgentRun> {
  const today = now.toISOString().slice(0, 10);
  let done: AgentRun;
  try {
    const live = await evaluateLive(env, field, now, deps);
    const through = live.result.metrics.dataThrough;
    const stale = !through || daysBetween(through, today) > FRESH_DAYS;
    done = {
      ...run,
      // Weekly ids are per data period, so the same NASA data is never recorded twice.
      runId: run.mode === "weekly" ? `${field.id}:weekly:${through ?? `no-data:${today}`}` : run.runId,
      status: stale && live.result.status !== "insufficient" ? "insufficient" : live.result.status,
      completedAt: now.getTime(),
      headline: stale
        ? `Not enough fresh NASA data for ${field.name}: the latest complete 14 days end ${through ?? "nowhere in the last 3 weeks"}`
        : live.result.headline,
      reasons: [
        ...(extraReason ? [extraReason] : []),
        ...(stale ? [{ id: "stale", text: `Weekly checks need a 14-day window ending within ${FRESH_DAYS} days of the check; this one ends ${through ?? "—"}.`, source: "SoilSense freshness rule" }] : []),
        ...live.result.reasons,
      ],
      districtOutlook: live.districtOutlook,
      metrics: live.result.metrics,
      snapshot: live.snapshot,
      sources: sourcesFor(field, live.kansas),
    };
  } catch (err) {
    done = {
      ...run,
      runId: run.runId || `${field.id}:weekly:error:${now.toISOString().slice(0, 13)}`,
      status: "error",
      completedAt: now.getTime(),
      headline: `Check failed for ${field.name}: a data service didn't answer`,
      reasons: [{ id: "error", text: String(err instanceof Error ? err.message : err).slice(0, 300), source: "SoilSense" }],
    };
  }
  const existing = store.get(done.runId);
  if (existing) return existing; // a repeated callback on the same data period
  done.researchNote = await researchNoteFor(done.status, env, field, crop);
  store.insert(done);
  return done;
}
