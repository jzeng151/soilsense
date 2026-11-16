// FieldAgent: one Cloudflare Agent (Agents SDK, a SQLite-backed Durable Object) per watched field.
// It keeps the field's scheduled checks and their results in its own storage, and uses the SDK's
// scheduler so a check runs on Cloudflare CHECK_DELAY_SECONDS later whether or not a browser is open.
// The logic lives in agentCore.ts; this class only adapts it to the SDK (storage, scheduling, RPC).

import { Agent } from "agents";
import { GLOBAL_REGISTRATION_CAP, REGISTERED_ID, registeredField, type Registration } from "./registration";
import type { CropId } from "../../shared/types";
import type { Env } from "../env";
import { executeRun, requestCheck, type AgentRun, type RunStore } from "./agentCore";
import { WATCHED_FIELDS, type WatchedField } from "./run";
import { applySettings, DEFAULT_SETTINGS, nextWeeklyAt, nextWindowOpening, runRecurringCheck, WEEKLY_DESCRIPTION, type WatchSettings } from "./watchCore";

type SqlTag = <T>(strings: TemplateStringsArray, ...values: (string | number | boolean | null)[]) => T[];

/** RunStore on the agent's SQLite database. Each run is one row; `data` holds the full JSON record. */
export class SqlRunStore implements RunStore {
  constructor(private sql: SqlTag, private retention = 0) {
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
    if (this.retention) this.sql`DELETE FROM field_runs WHERE status != 'pending' AND run_id NOT IN (SELECT run_id FROM field_runs ORDER BY scheduled_at DESC LIMIT ${this.retention})`;
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
  private _registeredLifecycle = false;

  private store(): SqlRunStore {
    this._store ??= new SqlRunStore(((strings: TemplateStringsArray, ...values: (string | number | boolean | null)[]) => {
      // A provider response can arrive after deletion. Never resurrect deleted application rows.
      if (this._registeredLifecycle && !this.registration()) return [];
      return this.sql(strings, ...values);
    }) as SqlTag, this._registeredLifecycle ? 100 : 0);
    return this._store;
  }

  /** Registry RPCs live on the fixed __registry instance. SQL before any await serializes reservations. */
  async reserveRegistration(id: string): Promise<boolean> {
    if (this.env.FIELDS_ENABLED !== "on" || !REGISTERED_ID.test(id)) return false;
    this.sql`CREATE TABLE IF NOT EXISTS field_registry (id TEXT PRIMARY KEY, active INTEGER NOT NULL)`;
    const total = this.sql<{ n: number }>`SELECT COUNT(*) AS n FROM field_registry`[0]!.n;
    if (total >= GLOBAL_REGISTRATION_CAP) return false;
    this.sql`INSERT INTO field_registry (id, active) VALUES (${id}, 1)`;
    return true;
  }
  async hasRegistration(id: string): Promise<boolean> {
    if (this.env.FIELDS_ENABLED !== "on" || !REGISTERED_ID.test(id)) return false;
    if (!this.sql`SELECT name FROM sqlite_master WHERE type='table' AND name='field_registry'`.length) return false;
    return this.sql`SELECT id FROM field_registry WHERE id=${id} AND active=1`.length > 0;
  }
  async forgetRegistration(id: string): Promise<void> {
    this.sql`UPDATE field_registry SET active=0 WHERE id=${id}`;
  }
  private registration(): { id: string; config: Registration } | null {
    if (!this.sql`SELECT name FROM sqlite_master WHERE type='table' AND name='registered_field'`.length) return null;
    const row = this.sql<{ id: string; data: string }>`SELECT id, data FROM registered_field LIMIT 1`[0];
    if (row) this._registeredLifecycle = true;
    return row ? { id: row.id, config: JSON.parse(row.data) as Registration } : null;
  }
  async isRegistered(id: string): Promise<boolean> {
    return this.env.FIELDS_ENABLED === "on" && this.registration()?.id === id;
  }
  async registerField(id: string, config: Registration): Promise<void> {
    if (this.env.FIELDS_ENABLED !== "on" || !REGISTERED_ID.test(id) || this.registration()) throw new Error("Invalid registration");
    this.sql`CREATE TABLE registered_field (id TEXT PRIMARY KEY, data TEXT NOT NULL)`;
    this.sql`INSERT INTO registered_field (id, data) VALUES (${id}, ${JSON.stringify(config)})`;
    this.saveSettings({ ...this.settings(), crop: config.watchedCrop });
  }
  async deleteField(id: string): Promise<void> {
    if (!await this.isRegistered(id)) return;
    // Remove authorization synchronously before yielding to scheduler cancellation.
    this.sql`DELETE FROM registered_field`;
    for (const schedule of await this.listSchedules()) await this.cancelSchedule(schedule.id);
    this.sql`DROP TABLE IF EXISTS field_runs`;
    this.sql`DROP TABLE IF EXISTS watch_settings`;
    this.sql`DROP TABLE IF EXISTS registered_field`;
    this._store = null;
  }

  /** The watched field this call is about (callers route each field id to its own agent instance). */
  private field(fieldId: string): WatchedField {
    const f = WATCHED_FIELDS.find((x) => x.id === fieldId);
    if (f) return f;
    const r = this.env.FIELDS_ENABLED === "on" ? this.registration() : null;
    if (r?.id === fieldId) return registeredField(fieldId, r.config);
    throw new Error("Unknown field");
  }

  /** Cancel a newly-created job if registration was deleted while the scheduler yielded. */
  private async scheduleForField(fieldId: string, at: Date | number, callback: "runScheduledCheck" | "weeklyCheck" | "windowCheck", payload: Record<string, unknown>) {
    this.field(fieldId);
    const job = await this.schedule(at, callback, payload);
    if (fieldId.startsWith("u_") && this.registration()?.id !== fieldId) {
      await this.cancelSchedule(job.id);
      throw new Error("Unknown field");
    }
    return job;
  }

  /** RPC: schedule a check about 45 s ahead, or return the one already waiting. */
  async requestCheck(req: { fieldId: string; mode: unknown; replayId?: unknown }): Promise<{ run: AgentRun; created: boolean }> {
    const field = this.field(req.fieldId);
    if (REGISTERED_ID.test(field.id)) {
      const recent = this.store().list(1)[0];
      if (recent && recent.status !== "pending" && Date.now() - recent.scheduledAt < 60_000) return { run: recent, created: false };
      this.sql`DELETE FROM field_runs WHERE run_id NOT IN (SELECT run_id FROM field_runs ORDER BY scheduled_at DESC LIMIT 99)`;
    }
    return requestCheck(this.store(), field, req, Date.now(), async (runId, delay) => {
      await this.scheduleForField(field.id, delay, "runScheduledCheck", { runId, fieldId: field.id });
    });
  }

  /** Called by the SDK scheduler. Safe to call twice: a finished run is never re-evaluated. */
  async runScheduledCheck(payload: { runId: string; fieldId: string }): Promise<void> {
    if (payload.fieldId.startsWith("u_") && !await this.isRegistered(payload.fieldId)) return;
    const run = await executeRun(this.store(), payload.runId, this.env, this.field(payload.fieldId), new Date(), undefined, this.settings().crop);
    if (run && run.status !== "pending") await this.publish(run);
  }

  /** RPC: this field's recent checks, newest first. */
  async listRuns(limit = 10): Promise<AgentRun[]> {
    return this.store().list(Math.min(50, Math.max(1, limit)));
  }

  // ---------- Recurring watch: weekly checks (#15) and crop stress-window checks (#35) ----------

  private settings(): WatchSettings {
    if (this._registeredLifecycle && !this.registration()) return { ...DEFAULT_SETTINGS };
    this.sql`CREATE TABLE IF NOT EXISTS watch_settings (id INTEGER PRIMARY KEY CHECK (id = 1), data TEXT NOT NULL)`;
    const rows = this.sql<{ data: string }>`SELECT data FROM watch_settings WHERE id = 1`;
    return rows[0] ? { ...DEFAULT_SETTINGS, ...(JSON.parse(rows[0].data) as WatchSettings) } : { ...DEFAULT_SETTINGS };
  }

  private saveSettings(s: WatchSettings): void {
    if (this._registeredLifecycle && !this.registration()) return;
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
    if (REGISTERED_ID.test(fieldId) && input.crop !== undefined) throw new Error("Registered crop is pinned");
    const now = Date.now();
    const next = applySettings(this.settings(), input, now);
    for (const id of [next.weeklyScheduleId, next.windowScheduleId]) if (id) await this.cancelSchedule(id);
    next.weeklyScheduleId = next.nextWeeklyAt = next.windowScheduleId = null;
    next.nextWindow = null;
    if (next.enabled) {
      const at = nextWeeklyAt(now);
      const weekly = await this.scheduleForField(fieldId, new Date(at), "weeklyCheck", { fieldId, version: next.version });
      next.weeklyScheduleId = weekly.id;
      next.nextWeeklyAt = at;
      if (next.crop) {
        const plan = nextWindowOpening(next.crop, now);
        const w = await this.scheduleForField(fieldId, new Date(plan.at), "windowCheck", { fieldId, version: next.version, crop: plan.crop, seasonYear: plan.seasonYear });
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
    if (payload.fieldId.startsWith("u_") && !await this.isRegistered(payload.fieldId)) return;
    const settings = this.settings();
    const run = await runRecurringCheck("weekly", payload, settings, this.store(), this.env, this.field(payload.fieldId), new Date());
    if (payload.fieldId.startsWith("u_") && !await this.isRegistered(payload.fieldId)) return;
    if (settings.enabled && settings.version === payload.version) {
      const at = nextWeeklyAt(Date.now());
      const s = await this.scheduleForField(payload.fieldId, new Date(at), "weeklyCheck", { fieldId: payload.fieldId, version: settings.version });
      this.saveSettings({ ...settings, weeklyScheduleId: s.id, nextWeeklyAt: at });
    }
    if (run) await this.publish(run);
  }

  /** One-off callback when the confirmed crop's reference window opens; then plans next season's opening. */
  async windowCheck(payload: { fieldId: string; version: number; crop: CropId; seasonYear: number }): Promise<void> {
    if (payload.fieldId.startsWith("u_") && !await this.isRegistered(payload.fieldId)) return;
    const settings = this.settings();
    const run = await runRecurringCheck("window", payload, settings, this.store(), this.env, this.field(payload.fieldId), new Date());
    if (payload.fieldId.startsWith("u_") && !await this.isRegistered(payload.fieldId)) return;
    if (settings.enabled && settings.version === payload.version && settings.crop === payload.crop) {
      const plan = nextWindowOpening(payload.crop, Date.now());
      const w = await this.scheduleForField(payload.fieldId, new Date(plan.at), "windowCheck", { fieldId: payload.fieldId, version: settings.version, crop: plan.crop, seasonYear: plan.seasonYear });
      this.saveSettings({ ...settings, windowScheduleId: w.id, nextWindow: plan });
    }
    if (run) await this.publish(run);
  }

  /** Mirror the finished run to the live room (#/live) when that binding exists; never fails the check. */
  private async publish(run: AgentRun): Promise<void> {
    if (run.fieldId.startsWith("u_")) return; // capabilities must never enter the public live room
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
