// Field Watch agent, the part that doesn't depend on the Agents SDK (so it's unit-tested in Node):
// planning a scheduled check, running it exactly once, and recording what evidence it used.
//
// One FieldAgent (a Durable Object) exists per watched field. A visitor asks it to check the field;
// it schedules the check CHECK_DELAY_SECONDS ahead on Cloudflare, so the result is produced and saved
// even if the browser is closed, and reopening the page shows it without running anything again.

import type { FieldResearchNote } from "../../shared/fieldResearch";
import { researchNoteFor } from "./researchNote";
import type { Env } from "../env";
import { RULE_TEXT, RULE_VERSION, THRESHOLDS, evaluateField, isoDate, type DayMap, type KansasSignal, type WatchMetrics, type WatchReason, type WatchStatus } from "./rule";
import { defaultDeps, sourcesFor, type FieldWatchDeps, type WatchedField } from "./run";

export const CHECK_DELAY_SECONDS = 45;

/** The only replay windows the public demo accepts (each is the 14 days ending on `windowEnd`). */
export const REPLAY_PRESETS = [
  { id: "jun-2022", windowEnd: "2022-06-27", label: "Late June 2022 (14 days to Jun 27, 2022)" },
] as const;
export type ReplayId = (typeof REPLAY_PRESETS)[number]["id"];

/** live/replay: asked for by a visitor. weekly: the enabled weekly check. window: a crop stress window opening. */
export type CheckMode = "live" | "replay" | "weekly" | "window";
/** "inactive": the confirmed crop's reference window isn't open, so no stress result is given. */
export type AgentRunStatus = "pending" | WatchStatus | "inactive" | "error";

export interface SnapshotRef {
  /** "Historical replay" results use only data up to the replay window; "Current conditions" use the latest NASA days. */
  label: "Historical replay" | "Current conditions";
  source: string;
  /** Years the window was compared against (replays use only years before the replay year: "as known then"). */
  comparisonYears: string;
  windowStart: string | null;
  windowEnd: string | null;
  /** SHA-256 of the exact daily values the rule evaluated (rain window + root-zone window), for reproducibility. */
  inputSha256: string | null;
}

export interface AgentRun {
  runId: string;
  fieldId: string;
  fieldName: string;
  mode: CheckMode;
  replayId: ReplayId | null;
  status: AgentRunStatus;
  ruleVersion: number;
  rule: string;
  scheduledAt: number;
  dueAt: number;
  completedAt: number | null;
  headline: string | null;
  reasons: WatchReason[];
  metrics: WatchMetrics | null;
  snapshot: SnapshotRef | null;
  sources: { name: string; url: string; detail: string }[];
  /** Optional for older persisted runs and non-alert results. */
  researchNote?: FieldResearchNote;
}

export interface RunStore {
  get(runId: string): AgentRun | null;
  pending(): AgentRun | null;
  insert(run: AgentRun): void;
  update(run: AgentRun): void;
  list(limit: number): AgentRun[];
}

/** In-memory store (tests). The Durable Object uses its SQLite storage with the same interface. */
export class MemoryRunStore implements RunStore {
  private runs = new Map<string, AgentRun>();
  get(id: string) {
    const r = this.runs.get(id);
    return r ? structuredClone(r) : null;
  }
  pending() {
    for (const r of this.runs.values()) if (r.status === "pending") return structuredClone(r);
    return null;
  }
  insert(run: AgentRun) {
    if (this.runs.has(run.runId)) throw new Error(`duplicate run ${run.runId}`);
    this.runs.set(run.runId, structuredClone(run));
  }
  update(run: AgentRun) {
    this.runs.set(run.runId, structuredClone(run));
  }
  list(limit: number) {
    return [...this.runs.values()].sort((a, b) => b.scheduledAt - a.scheduledAt).slice(0, limit).map((r) => structuredClone(r));
  }
}

export class CheckRequestError extends Error {}

/** Validate a request and create the pending run record. The run id is fixed here and never changes. */
export function planRun(field: WatchedField, mode: unknown, replayId: unknown, now: number): AgentRun {
  if (mode !== "live" && mode !== "replay") throw new CheckRequestError('mode must be "live" or "replay"');
  let replay: ReplayId | null = null;
  if (mode === "replay") {
    const p = REPLAY_PRESETS.find((x) => x.id === replayId);
    if (!p) throw new CheckRequestError(`replay must be one of: ${REPLAY_PRESETS.map((x) => x.id).join(", ")}`);
    replay = p.id;
  }
  const dueAt = now + CHECK_DELAY_SECONDS * 1000;
  return {
    runId: `${field.id}:${mode === "replay" ? replay : "live"}:${new Date(now).toISOString()}`,
    fieldId: field.id,
    fieldName: field.name,
    mode,
    replayId: replay,
    status: "pending",
    ruleVersion: RULE_VERSION,
    rule: RULE_TEXT,
    scheduledAt: now,
    dueAt,
    completedAt: null,
    headline: null,
    reasons: [],
    metrics: null,
    snapshot: null,
    sources: [],
  };
}

/**
 * Ask for a check. At most one pending check per field: if one is already waiting, it is returned
 * instead of creating another. `schedule` is called only for a newly created run.
 */
export async function requestCheck(
  store: RunStore,
  field: WatchedField,
  req: { mode: unknown; replayId?: unknown },
  now: number,
  schedule: (runId: string, delaySeconds: number) => Promise<void>,
): Promise<{ run: AgentRun; created: boolean }> {
  const waiting = store.pending();
  if (waiting) return { run: waiting, created: false };
  const run = planRun(field, req.mode, req.replayId, now);
  store.insert(run);
  await schedule(run.runId, CHECK_DELAY_SECONDS);
  return { run, created: true };
}

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function addDaysIso(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return isoDate(d);
}

/** Hash of the daily values the rule actually used, so a result can be checked against its inputs later. */
async function inputHash(map: DayMap, m: WatchMetrics): Promise<string | null> {
  if (!m.windowStart || !m.dataThrough) return null;
  const days: [string, number | null, number | null][] = [];
  const start = m.rootzoneDate ? [m.windowStart, addDaysIso(m.rootzoneDate, -6)].sort()[0]! : m.windowStart;
  const end = m.rootzoneDate && m.rootzoneDate > m.dataThrough ? m.rootzoneDate : m.dataThrough;
  for (let d = start; d <= end; d = addDaysIso(d, 1)) {
    const v = map.get(d);
    days.push([d, v?.prcp ?? null, v?.gwetroot ?? null]);
  }
  return sha256(JSON.stringify(days));
}

/** Evaluate the rule on the latest NASA days for a field ("Current conditions"). Throws if a data service fails. */
export async function evaluateLive(
  env: Env,
  field: WatchedField,
  now: Date,
  deps: FieldWatchDeps = defaultDeps,
  history?: Awaited<ReturnType<FieldWatchDeps["history"]>>,
): Promise<{ result: ReturnType<typeof evaluateField>; kansas: KansasSignal | null; snapshot: SnapshotRef }> {
  const [hist, recent, kansas] = await Promise.all([
    history ? Promise.resolve(history) : deps.history(env, field, now),
    deps.recent(env.DB, field, now),
    field.state === "KS" ? deps.kansas(env.DB, field.fips) : Promise.resolve(null),
  ]);
  const result = evaluateField({ fieldName: field.name, lat: field.lat, today: isoDate(now), recent, history: hist.map, historyYears: { first: hist.first, last: hist.last }, kansas });
  return {
    result,
    kansas,
    snapshot: {
      label: "Current conditions",
      source: `NASA POWER daily (last ~60 days) at the grid cell containing ${field.lat}, ${field.lon}`,
      comparisonYears: `${hist.first}–${hist.last}`,
      windowStart: result.metrics.windowStart,
      windowEnd: result.metrics.dataThrough,
      inputSha256: await inputHash(recent, result.metrics),
    },
  };
}

/**
 * Run a scheduled check exactly once. Re-running a run id that already finished returns the saved
 * result unchanged (no second evaluation, no second record). Never throws: failures become "error".
 */
export async function executeRun(
  store: RunStore,
  runId: string,
  env: Env,
  field: WatchedField,
  now: Date,
  deps: FieldWatchDeps = defaultDeps,
  crop?: string | null,
): Promise<AgentRun | null> {
  const run = store.get(runId);
  if (!run) return null;
  if (run.status !== "pending") return run;
  try {
    const history = await deps.history(env, field, now);
    let result;
    let recentMap: DayMap;
    let snapshot: SnapshotRef;
    let kansas = null;
    if (run.mode === "replay") {
      const preset = REPLAY_PRESETS.find((p) => p.id === run.replayId);
      if (!preset) throw new Error(`unknown replay ${run.replayId}`);
      const replayYear = Number(preset.windowEnd.slice(0, 4));
      const last = Math.min(history.last, replayYear - 1);
      recentMap = history.map;
      const windowDays: string[] = [];
      for (let i = THRESHOLDS.windowDays - 1; i >= 0; i--) windowDays.push(addDaysIso(preset.windowEnd, -i));
      const missing = windowDays.filter((d) => { const v = history.map.get(d); return !v || v.prcp === null; });
      if (missing.length) {
        // A replay checks exactly its preset window: it never slides to another window, and never fills gaps with zero.
        const done: AgentRun = {
          ...run,
          status: "insufficient",
          completedAt: now.getTime(),
          headline: `Historical replay: not enough NASA data for ${preset.label}`,
          reasons: [{ id: "replay-missing", text: `NASA POWER has no rain value for ${missing.join(", ")} in the replay window.`, source: "NASA POWER" }],
          snapshot: { label: "Historical replay", source: `NASA POWER daily (cached record ${history.first}–${history.last})`, comparisonYears: `${history.first}–${last}`, windowStart: windowDays[0]!, windowEnd: preset.windowEnd, inputSha256: null },
          sources: sourcesFor(field, null),
        };
        store.update(done);
        return done;
      }
      // "today" is the day after the window, so the rule picks exactly this window when its data are complete.
      result = evaluateField({ fieldName: field.name, lat: field.lat, today: addDaysIso(preset.windowEnd, 1), recent: recentMap, history: history.map, historyYears: { first: history.first, last }, kansas: null });
      snapshot = {
        label: "Historical replay",
        source: `NASA POWER daily (cached record ${history.first}–${history.last}), grid cell containing ${field.lat}, ${field.lon}`,
        comparisonYears: `${history.first}–${last}`,
        windowStart: result.metrics.windowStart,
        windowEnd: result.metrics.dataThrough,
        inputSha256: await inputHash(recentMap, result.metrics),
      };
    } else {
      const live = await evaluateLive(env, field, now, deps, history);
      kansas = live.kansas;
      result = live.result;
      snapshot = live.snapshot;
    }
    const done: AgentRun = {
      ...run,
      status: result.status,
      completedAt: now.getTime(),
      headline: run.mode === "replay" ? `Historical replay: ${result.headline}` : result.headline,
      reasons: result.reasons,
      metrics: result.metrics,
      snapshot,
      sources: sourcesFor(field, kansas),
      researchNote: await researchNoteFor(result.status, env, field, crop),
    };
    store.update(done);
    return done;
  } catch (err) {
    const failed: AgentRun = {
      ...run,
      status: "error",
      completedAt: now.getTime(),
      headline: `Check failed for ${field.name}: a data service didn't answer`,
      reasons: [{ id: "error", text: String(err instanceof Error ? err.message : err).slice(0, 300), source: "SoilSense" }],
    };
    store.update(failed);
    return failed;
  }
}
