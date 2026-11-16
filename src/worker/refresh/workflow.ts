// PowerRefreshWorkflow (Cloudflare Workflows): refresh the watched farms' recent NASA POWER observations
// with explicit, individually retried steps per POWER grid cell:
//   fetch <cell>    -> one bounded request (76 days) per grid cell, shared by every farm in that cell
//   validate <cell> -> pure checks (variables, units, dates, fill values, grid, coverage, age); no retries
//   publish <cell>  -> R2 evidence bundle + one atomic D1 batch, idempotent by content hash
// A rejected or failed cell records its error and leaves the last accepted snapshot in place.
//
// The farms and variables are fixed in code: the Workflow takes no field, coordinate or URL input.

import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import type { Env } from "../env";
import { WATCHED_FIELDS } from "../fieldwatch/run";
import { publishLive } from "../live/publish";
import { fetchWithRetry } from "../lib/http";
import { putCached, DAY_SECONDS } from "../lib/cache";
import { freshnessKey } from "../lib/freshness";
import { buildQuery, planCells, validateCandidate, type Farm, type Verdict } from "./snapshot";
import { publishSnapshot, recordFailure, type RefreshTrigger } from "./store";

export interface RefreshParams {
  trigger?: RefreshTrigger;
}

/** Minimal shape of WorkflowStep.do used here, so tests can run the same code with a fake step. */
export interface StepRunner {
  do<T>(name: string, config: StepConfig, callback: () => Promise<T>): Promise<T>;
}
export interface StepConfig {
  retries?: { limit: number; delay: string | number; backoff?: "constant" | "linear" | "exponential" };
  timeout?: string | number;
}

export type FetchPower = (url: string) => Promise<{ status: number; text: string }>;

const defaultFetch: FetchPower = async (url) => {
  // Retries are owned by the Workflow step (bounded below), so a single attempt here.
  const res = await fetchWithRetry(url, { service: "NASA POWER", timeoutMs: 25_000, retries: 0 });
  return { status: res.status, text: await res.text() };
};

export const STEP_CONFIG = {
  fetch: { retries: { limit: 2, delay: "20 seconds", backoff: "exponential" }, timeout: "2 minutes" },
  validate: { retries: { limit: 0, delay: 0 }, timeout: "30 seconds" },
  publish: { retries: { limit: 3, delay: "5 seconds", backoff: "exponential" }, timeout: "1 minute" },
} satisfies Record<string, StepConfig>;

export interface CellResult {
  cell: string;
  farmIds: string[];
  outcome: "published" | "unchanged" | "rejected" | "error";
  snapshotId: string | null;
  dataThrough: string | null;
  errors: string[];
}

export const REFRESH_FARMS: Farm[] = WATCHED_FIELDS.map(({ id, name, lat, lon }) => ({ id, name, lat, lon }));

export async function runPowerRefresh(
  env: Env,
  step: StepRunner,
  opts: { now: Date; trigger: RefreshTrigger; instanceId: string; farms?: Farm[]; fetchPower?: FetchPower },
): Promise<{ instanceId: string; runDate: string; cells: CellResult[] }> {
  const fetchPower = opts.fetchPower ?? defaultFetch;
  const cells = planCells(opts.farms ?? REFRESH_FARMS);
  const results: CellResult[] = [];
  for (const cell of cells) {
    const query = buildQuery(cell, opts.now);
    const base = { cell: cell.key, farmIds: cell.farmIds };

    let fetched: { text: string; retrievedAt: string };
    try {
      fetched = await step.do(`fetch ${cell.key}`, STEP_CONFIG.fetch, async () => {
        const r = await fetchPower(query.url);
        return { text: r.text, retrievedAt: new Date().toISOString() };
      });
    } catch (err) {
      const errors = [`NASA POWER request failed after retries: ${err instanceof Error ? err.message : String(err)}`];
      await step.do(`record error ${cell.key}`, STEP_CONFIG.publish, () =>
        recordFailure(env.DB, cell, { outcome: "error", errors, trigger: opts.trigger, instanceId: opts.instanceId, now: opts.now.getTime() }).then(() => null),
      );
      results.push({ ...base, outcome: "error", snapshotId: null, dataThrough: null, errors });
      continue;
    }

    const verdict: Verdict = await step.do(`validate ${cell.key}`, STEP_CONFIG.validate, async () => {
      let raw: unknown;
      try {
        raw = JSON.parse(fetched.text);
      } catch {
        return { ok: false, errors: ["malformed response: not JSON"], dataThrough: null } as Verdict;
      }
      return validateCandidate(raw, query, cell);
    });

    if (!verdict.ok) {
      await step.do(`record rejection ${cell.key}`, STEP_CONFIG.publish, () =>
        recordFailure(env.DB, cell, { outcome: "rejected", errors: verdict.errors, dataThrough: verdict.dataThrough, trigger: opts.trigger, instanceId: opts.instanceId, now: opts.now.getTime() }).then(() => null),
      );
      results.push({ ...base, outcome: "rejected", snapshotId: null, dataThrough: verdict.dataThrough, errors: verdict.errors });
      continue;
    }

    try {
      const pub = await step.do(`publish ${cell.key}`, STEP_CONFIG.publish, () =>
        publishSnapshot(env, { cell, verdict, query, retrievedAt: fetched.retrievedAt, rawText: fetched.text, trigger: opts.trigger, instanceId: opts.instanceId, now: opts.now.getTime() }),
      );
      results.push({ ...base, outcome: pub.outcome, snapshotId: pub.snapshotId, dataThrough: pub.dataThrough, errors: [] });
      if (pub.outcome === "published") {
        for (const farmId of cell.farmIds)
          await publishLive(env, { type: "power.snapshot", farmId, snapshotId: pub.snapshotId, dataThrough: pub.dataThrough, stream: "current" });
      }
    } catch (err) {
      const errors = [`publish failed; previous snapshot kept: ${err instanceof Error ? err.message : String(err)}`];
      await step
        .do(`record publish error ${cell.key}`, STEP_CONFIG.publish, () =>
          recordFailure(env.DB, cell, { outcome: "error", errors, trigger: opts.trigger, instanceId: opts.instanceId, now: opts.now.getTime() }).then(() => null),
        )
        .catch(() => null);
      results.push({ ...base, outcome: "error", snapshotId: verdict.snapshotId, dataThrough: verdict.content.dataThrough, errors });
    }
  }
  console.log(JSON.stringify({ msg: "power refresh", instanceId: opts.instanceId, trigger: opts.trigger, results: results.map((r) => `${r.cell}=${r.outcome}`) }));
  return { instanceId: opts.instanceId, runDate: opts.now.toISOString().slice(0, 10), cells: results };
}

/** Sunday revision sweep: retain all 90 requested days separately; never change Field Watch's 60-day stream. */
export async function recheckPowerRevisions(env: Env, step: StepRunner, now: Date, fetchPower: FetchPower = defaultFetch): Promise<void> {
  if (now.getUTCDay() !== 0 || !env.DB) return;
  for (const cell of planCells(REFRESH_FARMS)) {
    const query = buildQuery(cell, now);
    query.start = new Date(Date.parse(`${query.end}T00:00:00Z`) - 89 * DAY_SECONDS * 1000).toISOString().slice(0, 10);
    query.params.start = query.start.replace(/-/g, "");
    query.url = query.url.replace(/&start=\d{8}/, `&start=${query.params.start}`);
    try {
      await step.do(`recheck revisions ${cell.key}`, STEP_CONFIG.fetch, async () => {
        const response = await fetchPower(query.url);
        if (response.status !== 200) throw new Error(`POWER revision status ${response.status}`);
        const raw: unknown = JSON.parse(response.text);
        const verdict = await validateCandidate(raw, query, cell);
        if (!verdict.ok) throw new Error(verdict.errors.join("; "));
        // Raw revision archive is deliberately not a rule input. A failure cannot replace accepted data.
        await putCached(env.DB!, freshnessKey(`power-revisions:v1:${cell.key}:${query.start}:${query.end}`), 365 * DAY_SECONDS,
          { raw, query, retrievedAt: new Date().toISOString() });
        return null;
      });
    } catch (err) { console.warn(JSON.stringify({ msg: "POWER revision sweep failed", cell: cell.key, err: String(err) })); }
  }
}

export class PowerRefreshWorkflow extends WorkflowEntrypoint<Env, RefreshParams> {
  override async run(event: Readonly<WorkflowEvent<RefreshParams>>, step: WorkflowStep) {
    const trigger: RefreshTrigger = event.payload?.trigger === "manual" ? "manual" : "cron";
    // event.timestamp is fixed for the instance, so a replayed run uses the same request range.
    await recheckPowerRevisions(this.env, step as unknown as StepRunner, new Date(event.timestamp));
    return runPowerRefresh(this.env, step as unknown as StepRunner, { now: new Date(event.timestamp), trigger, instanceId: event.instanceId });
  }
}

/** Daily schedule for the refresh (05:43 UTC, after POWER's daily update); kept apart from Field Watch's hourly cron. */
export const POWER_REFRESH_CRON = "43 5 * * *";

/** Start a refresh instance. Daily cron runs use a date-based id, so a re-delivered cron can't start a second run. */
export async function startPowerRefresh(env: Env, trigger: RefreshTrigger, now = new Date()): Promise<{ id: string; created: boolean }> {
  if (!env.POWER_REFRESH) throw new Error("POWER_REFRESH Workflow binding is not configured");
  const id = trigger === "cron" ? `daily-${now.toISOString().slice(0, 10)}` : `manual-${now.toISOString().slice(0, 16).replace(/[-:T]/g, "")}`;
  try {
    const inst = await env.POWER_REFRESH.create({ id, params: { trigger } });
    return { id: inst.id, created: true };
  } catch (err) {
    if (/already|exists|duplicate/i.test(String(err))) return { id, created: false };
    throw err;
  }
}
