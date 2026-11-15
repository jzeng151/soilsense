// FieldAgent: one Cloudflare Agent (Agents SDK, a SQLite-backed Durable Object) per watched field.
// It keeps the field's scheduled checks and their results in its own storage, and uses the SDK's
// scheduler so a check runs on Cloudflare CHECK_DELAY_SECONDS later whether or not a browser is open.
// The logic lives in agentCore.ts; this class only adapts it to the SDK (storage, scheduling, RPC).

import { Agent } from "agents";
import type { Env } from "../env";
import { executeRun, requestCheck, type AgentRun, type RunStore } from "./agentCore";
import { WATCHED_FIELDS, type WatchedField } from "./run";

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
    const run = await executeRun(this.store(), payload.runId, this.env, this.field(payload.fieldId), new Date());
    if (run && run.status !== "pending") await this.publish(run);
  }

  /** RPC: this field's recent checks, newest first. */
  async listRuns(limit = 10): Promise<AgentRun[]> {
    return this.store().list(Math.min(50, Math.max(1, limit)));
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
