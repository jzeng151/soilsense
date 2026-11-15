import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import type { Env } from "../env";
import { WATCHED_FIELDS } from "../fieldwatch/run";
import { retrieveSubset, shift, type Subset } from "../imerg/client";
import { planImergCells, validateImerg } from "./imerg-snapshot";
import { publishImerg, recordImergFailure } from "./imerg-store";
import { STEP_CONFIG, type StepRunner, type RefreshParams } from "./workflow";
import type { Farm } from "./snapshot";
import type { RefreshTrigger } from "./store";
export async function latestImergDay(now: Date): Promise<string> {
  const end = shift(now.toISOString().slice(0, 10), -1), start = shift(end, -15);
  const qs = new URLSearchParams({ short_name: "GPM_3IMERGDL", version: "07", temporal: `${start}T00:00:00Z,${end}T23:59:59Z`, page_size: "1", sort_key: "-start_date" });
  const r = await fetch(`https://cmr.earthdata.nasa.gov/search/granules.json?${qs}`, { signal: AbortSignal.timeout(90000), redirect: "manual" });
  if (!r.ok) throw new Error("CMR Late discovery failed");
  const json = await r.json() as { feed?: { entry?: { time_start?: string }[] } };
  const day = json.feed?.entry?.[0]?.time_start?.slice(0, 10);
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day) || day > end || day < start) throw new Error("No completed IMERG Late day discovered");
  return day;
}
export async function runImergRefresh(env: Env, step: StepRunner, opts: { now: Date; trigger: RefreshTrigger; instanceId: string; farms?: Farm[]; latest?: () => Promise<string>; retrieve?: typeof retrieveSubset }) {
  const cells = planImergCells(opts.farms ?? WATCHED_FIELDS), results: { cell: string; outcome: string; errors?: string[]; snapshotId?: string; dataThrough?: string }[] = [];
  let end: string;
  try { end = await step.do("imerg discover completed Late day", STEP_CONFIG.fetch, async () => { if (!env.EARTHDATA_TOKEN) throw new Error("EARTHDATA_TOKEN is not configured"); return (opts.latest ?? (() => latestImergDay(opts.now)))(); }); }
  catch {
    for (const cell of cells) { const errors = ["IMERG access/discovery failed; check EARTHDATA_TOKEN, provider health and product availability. Previous snapshot kept."]; await step.do(`imerg discovery failure ${cell.key}`, STEP_CONFIG.publish, () => recordImergFailure(env, cell, "error", errors, opts.instanceId, opts.trigger, opts.now.getTime())); results.push({ cell: cell.key, outcome: "error", errors }); }
    return { instanceId: opts.instanceId, cells: results };
  }
  for (const cell of cells) {
    try {
      const source: Subset = await step.do(`imerg fetch ${cell.key}`, { ...STEP_CONFIG.fetch, timeout: "15 minutes" }, () => (opts.retrieve ?? retrieveSubset)(env, cell.lat, cell.lon, shift(end, -13), end, "late"));
      const verdict = await step.do(`imerg validate ${cell.key}`, STEP_CONFIG.validate, () => validateImerg(source, cell, opts.now));
      if (!verdict.ok) { await step.do(`imerg rejection ${cell.key}`, STEP_CONFIG.publish, () => recordImergFailure(env, cell, "rejected", verdict.errors, opts.instanceId, opts.trigger, opts.now.getTime())); results.push({ cell: cell.key, outcome: "rejected", errors: verdict.errors }); continue; }
      const published = await step.do(`imerg publish ${cell.key}`, STEP_CONFIG.publish, () => publishImerg(env, cell, verdict, source, opts.instanceId, opts.trigger, opts.now.getTime()));
      results.push({ cell: cell.key, ...published });
    } catch {
      // Never copy an upstream error body/header into persisted status (may contain provider auth details).
      const errors = ["IMERG fetch/validation/publication failed after bounded retries. Previous accepted snapshot kept; no substituted observations."];
      await step.do(`imerg failure ${cell.key}`, STEP_CONFIG.publish, () => recordImergFailure(env, cell, "error", errors, opts.instanceId, opts.trigger, opts.now.getTime()));
      results.push({ cell: cell.key, outcome: "error", errors });
    }
  }
  return { instanceId: opts.instanceId, runDate: opts.now.toISOString().slice(0, 10), cells: results };
}
export class ImergRefreshWorkflow extends WorkflowEntrypoint<Env, RefreshParams> {
  override async run(event: Readonly<WorkflowEvent<RefreshParams>>, step: WorkflowStep) {
    return runImergRefresh(this.env, step as unknown as StepRunner, { now: new Date(event.timestamp), trigger: event.payload?.trigger === "manual" ? "manual" : "cron", instanceId: event.instanceId });
  }
}
export async function startImergRefresh(env: Env, trigger: RefreshTrigger, now = new Date()) {
  if (!env.IMERG_REFRESH) throw new Error("IMERG_REFRESH Workflow binding is not configured");
  const id = trigger === "cron" ? `imerg-daily-${now.toISOString().slice(0, 10)}` : `imerg-manual-${now.toISOString().slice(0, 16).replace(/[-:T]/g, "")}`;
  try { const instance = await env.IMERG_REFRESH.create({ id, params: { trigger } }); return { id: instance.id, created: true }; }
  catch (err) { if (/already|exists|duplicate/i.test(String(err))) return { id, created: false }; throw err; }
}
