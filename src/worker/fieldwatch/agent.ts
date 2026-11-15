// FieldAgent: one Cloudflare Agent (Agents SDK, a SQLite-backed Durable Object) per watched field.
// It keeps the field's scheduled checks and their results in its own storage, and uses the SDK's
// scheduler so a check runs on Cloudflare CHECK_DELAY_SECONDS later whether or not a browser is open.
// The logic lives in agentCore.ts; this class only adapts it to the SDK (storage, scheduling, RPC).

import { Agent } from "agents";
import type { CropId } from "../../shared/types";
import type { Env } from "../env";
import { executeRun, requestCheck, type AgentRun, type RunStore } from "./agentCore";
import { WATCHED_FIELDS, type WatchedField } from "./run";
import { applySettings, DEFAULT_SETTINGS, nextWeeklyAt, nextWindowOpening, runRecurringCheck, WEEKLY_DESCRIPTION, type WatchSettings } from "./watchCore";

type SqlTag = <T>(strings: TemplateStringsArray, ...values: (string | number | boolean | null)[]) => T[];

/** RunStore on the agent's SQLite database. Each run is one row; `data` holds the full JSON record. */
export class SqlRunStore implements RunStore {
  constructor(private sql: SqlTag) {
    this.sql`CREATE TABLE IF NOT EXISTS field_runs (
      run_id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      scheduled_at INTEGER NOT NULL,
      data TEXT NOT NULL
    )`;
  }
  get(runId: string): AgentRun | null {
    const rows = this.sql<{ data: string }>`SELECT data FROM field_runs WHERE run_id = ${runId}`;
    return rows[0] ? (JSON.parse(rows[0].data) as AgentRun) : null;
  }
  pending(): AgentRun | null {
    const rows = this.sql<{ data: string }>`SELECT data FROM field_runs WHERE status = 'pending' ORDER BY scheduled_at LIMIT 1`;
    return rows[0] ? (JSON.parse(rows[0].data) as AgentRun) : null;
  }
  insert(run: AgentRun): void {
    this.sql`INSERT INTO field_runs (run_id, status, scheduled_at, data) VALUES (${run.runId}, ${run.status}, ${run.scheduledAt}, ${JSON.stringify(run)})`;
  }
  update(run: AgentRun): void {
    this.sql`UPDATE field_runs SET status = ${run.status}, data = ${JSON.stringify(run)} WHERE run_id = ${run.runId}`;
  }
  list(limit: number): AgentRun[] {
    return this.sql<{ data: string }>`SELECT data FROM field_runs ORDER BY scheduled_at DESC LIMIT ${limit}`.map((r) => JSON.parse(r.data) as AgentRun);
  }
}

export class FieldAgent extends Agent<Env> {
  private _store: SqlRunStore | null = null;

  private store(): SqlRunStore {
    this._store ??= new SqlRunStore(this.sql.bind(this) as SqlTag);
    return this._store;
  }

  /** The watched field this call is about (callers route each field id to its own agent instance). */
  private field(fieldId: string): WatchedField {
    const f = WATCHED_FIELDS.find((x) => x.id === fieldId);
    if (!f) throw new Error(`Unknown field ${fieldId}`);
    return f;
  }

  /** RPC: schedule a check about 45 s ahead, or return the one already waiting. */
  async requestCheck(req: { fieldId: string; mode: unknown; replayId?: unknown }): Promise<{ run: AgentRun; created: boolean }> {
    const field = this.field(req.fieldId);
    return requestCheck(this.store(), field, req, Date.now(), async (runId, delay) => {
      await this.schedule(delay, "runScheduledCheck", { runId, fieldId: field.id });
    });
  }

  /** Called by the SDK scheduler. Safe to call twice: a finished run is never re-evaluated. */
  async runScheduledCheck(payload: { runId: string; fieldId: string }): Promise<void> {
    const run = await executeRun(this.store(), payload.runId, this.env, this.field(payload.fieldId), new Date(), undefined, this.settings().crop);
    if (run && run.status !== "pending") await this.publish(run);
  }

  /** RPC: this field's recent checks, newest first. */
  async listRuns(limit = 10): Promise<AgentRun[]> {
    return this.store().list(Math.min(50, Math.max(1, limit)));
  }

  // ---------- Recurring watch: weekly checks (#15) and crop stress-window checks (#35) ----------

  private settings(): WatchSettings {
    this.sql`CREATE TABLE IF NOT EXISTS watch_settings (id INTEGER PRIMARY KEY CHECK (id = 1), data TEXT NOT NULL)`;
    const rows = this.sql<{ data: string }>`SELECT data FROM watch_settings WHERE id = 1`;
    return rows[0] ? { ...DEFAULT_SETTINGS, ...(JSON.parse(rows[0].data) as WatchSettings) } : { ...DEFAULT_SETTINGS };
  }

  private saveSettings(s: WatchSettings): void {
    this.sql`INSERT INTO watch_settings (id, data) VALUES (1, ${JSON.stringify(s)}) ON CONFLICT(id) DO UPDATE SET data = excluded.data`;
  }

  /** RPC: recurring-watch settings, next scheduled runs and recent recurring results. */
  async getWatch(fieldId: string): Promise<{ settings: WatchSettings; schedule: string; scheduledJobs: number; runs: AgentRun[] }> {
    this.field(fieldId);
    const jobs = (await this.listSchedules()).filter((s) => s.callback === "weeklyCheck" || s.callback === "windowCheck").length;
    return { settings: this.settings(), schedule: WEEKLY_DESCRIPTION, scheduledJobs: jobs, runs: this.store().list(20).filter((r) => r.mode === "weekly" || r.mode === "window").slice(0, 8) };
  }

  /**
   * RPC: enable/disable recurrence and/or confirm the season's crop. Every change cancels this field's
   * existing recurring schedules and creates new ones for the new settings version, so queued work for the
   * old settings can't run (it also rechecks the version when it fires). Completed results are kept.
   */
  async updateWatch(fieldId: string, input: { enabled?: unknown; crop?: unknown }): Promise<WatchSettings> {
    this.field(fieldId);
    const now = Date.now();
    const next = applySettings(this.settings(), input, now);
    for (const id of [next.weeklyScheduleId, next.windowScheduleId]) if (id) await this.cancelSchedule(id);
    next.weeklyScheduleId = next.nextWeeklyAt = next.windowScheduleId = null;
    next.nextWindow = null;
    if (next.enabled) {
      const at = nextWeeklyAt(now);
      const weekly = await this.schedule(new Date(at), "weeklyCheck", { fieldId, version: next.version });
      next.weeklyScheduleId = weekly.id;
      next.nextWeeklyAt = at;
      if (next.crop) {
        const plan = nextWindowOpening(next.crop, now);
        const w = await this.schedule(new Date(plan.at), "windowCheck", { fieldId, version: next.version, crop: plan.crop, seasonYear: plan.seasonYear });
        next.windowScheduleId = w.id;
        next.nextWindow = plan;
      }
    }
    this.saveSettings(next);
    return next;
  }

  /** Weekly callback. Ignored if disabled or if the settings changed since it was scheduled; otherwise checks,
   *  then schedules next Monday's run for the same settings version. */
  async weeklyCheck(payload: { fieldId: string; version: number }): Promise<void> {
    const settings = this.settings();
    const run = await runRecurringCheck("weekly", payload, settings, this.store(), this.env, this.field(payload.fieldId), new Date());
    if (settings.enabled && settings.version === payload.version) {
      const at = nextWeeklyAt(Date.now());
      const s = await this.schedule(new Date(at), "weeklyCheck", { fieldId: payload.fieldId, version: settings.version });
      this.saveSettings({ ...settings, weeklyScheduleId: s.id, nextWeeklyAt: at });
    }
    if (run) await this.publish(run);
  }

  /** One-off callback when the confirmed crop's reference window opens; then plans next season's opening. */
  async windowCheck(payload: { fieldId: string; version: number; crop: CropId; seasonYear: number }): Promise<void> {
    const settings = this.settings();
    const run = await runRecurringCheck("window", payload, settings, this.store(), this.env, this.field(payload.fieldId), new Date());
    if (settings.enabled && settings.version === payload.version && settings.crop === payload.crop) {
      const plan = nextWindowOpening(payload.crop, Date.now());
      const w = await this.schedule(new Date(plan.at), "windowCheck", { fieldId: payload.fieldId, version: settings.version, crop: plan.crop, seasonYear: plan.seasonYear });
      this.saveSettings({ ...settings, windowScheduleId: w.id, nextWindow: plan });
    }
    if (run) await this.publish(run);
  }

  /** Mirror the finished run to the live room (#/live) when that binding exists; never fails the check. */
  private async publish(run: AgentRun): Promise<void> {
    const ns = this.env.LIVE_ROOM;
    if (!ns) return;
    try {
      const stub = ns.get(ns.idFromName(this.env.LIVE_ROOM_NAME ?? "demo")) as unknown as { publish?: (e: { type: string } & Record<string, unknown>) => Promise<unknown> };
      await stub.publish?.({
        type: "fieldwatch.agent",
        runId: run.runId,
        fieldId: run.fieldId,
        fieldName: run.fieldName,
        mode: run.mode,
        status: run.status,
        headline: run.headline,
        dataThrough: run.snapshot?.windowEnd ?? null,
        checkedAt: run.completedAt,
      });
    } catch (err) {
      console.warn(JSON.stringify({ msg: "field agent publish failed", err: String(err) }));
    }
  }
}
