// Field Watch runner: checks every watched field, saves each result in D1 (deduplicated by
// run_id = "<field>:<data day>"), and publishes run events to the live room when that binding exists.
// Called by the Cloudflare Cron Trigger (scheduled handler) and by POST /api/fieldwatch/run.

import type { Env } from "../env";
import { getDailyClimate } from "../data/power";
import { yearsFor } from "../service";
import { evaluateField, isoDate, type DayMap, type KansasSignal, type WatchReason, type WatchResult } from "./rule";
import { getKansasSignal, getRecentDays, historyToDayMap, KS_ADVICE_URL } from "./sources";

export interface WatchedField {
  id: string;
  name: string;
  lat: number;
  lon: number;
  /** 5-digit county FIPS (used for the Kansas outlook). */
  fips: string;
  state: string;
}

/** The demo farms (same points as the planner's examples and scripts/prefetch-demo.mjs). */
export const WATCHED_FIELDS: WatchedField[] = [
  { id: "story-ia", name: "Story County, IA", lat: 42.0563, lon: -93.495, fips: "19169", state: "IA" },
  { id: "champaign-il", name: "Champaign County, IL", lat: 40.048, lon: -88.33, fips: "17019", state: "IL" },
  { id: "finney-ks", name: "Finney County, KS", lat: 38.1095, lon: -100.706, fips: "20055", state: "KS" },
  { id: "lancaster-ne", name: "Lancaster County, NE", lat: 40.73, lon: -96.55, fips: "31109", state: "NE" },
];

export type Trigger = "cron" | "manual";
export type RunStatus = WatchResult["status"] | "error";

export interface FieldRun {
  runId: string;
  fieldId: string;
  fieldName: string;
  dataThrough: string | null;
  status: RunStatus;
  headline: string;
  reasons: WatchReason[];
  metrics: Record<string, unknown>;
  sources: { name: string; url: string; detail: string }[];
  trigger: Trigger;
  firstCheckedAt: number;
  checkedAt: number;
  checkCount: number;
}

/** Inputs are injectable so tests run without the network. */
export interface FieldWatchDeps {
  recent: (db: D1Database | undefined, f: WatchedField, today: Date) => Promise<DayMap>;
  history: (env: Env, f: WatchedField, today: Date) => Promise<{ map: DayMap; first: number; last: number }>;
  kansas: (db: D1Database | undefined, fips: string) => Promise<KansasSignal | null>;
}

const defaultDeps: FieldWatchDeps = {
  recent: (db, f, today) => getRecentDays(db, f.lat, f.lon, today),
  history: async (env, f, today) => {
    const y = yearsFor(env, today);
    return historyToDayMap(await getDailyClimate(env.DB, f.lat, f.lon, y.historyStart, y.historyEnd));
  },
  kansas: (db, fips) => getKansasSignal(db, fips),
};

function sourcesFor(f: WatchedField, kansas: KansasSignal | null) {
  const s = [
    { name: "NASA POWER daily", url: "https://power.larc.nasa.gov/", detail: "Rain, max/min temperature and root-zone soil wetness: the last 60 days and 1991 to last year" },
    { name: "FAO-56 Hargreaves ET0", url: "https://www.fao.org/4/x0490e/x0490e00.htm", detail: "Crop water demand from daily temperature and latitude" },
  ];
  if (f.state === "KS")
    s.push({
      name: "Kansas Crop Rotation Advice (team pipeline, V. Pisharody)",
      url: KS_ADVICE_URL,
      detail: kansas ? `Weekly drought outlook, data through ${kansas.dataThrough}` : "Weekly drought outlook (unavailable for this run)",
    });
  return s;
}

export async function checkField(env: Env, f: WatchedField, now: Date, deps: FieldWatchDeps = defaultDeps): Promise<{ result: WatchResult; kansas: KansasSignal | null }> {
  const [recent, history, kansas] = await Promise.all([
    deps.recent(env.DB, f, now),
    deps.history(env, f, now),
    f.state === "KS" ? deps.kansas(env.DB, f.fips) : Promise.resolve(null),
  ]);
  const result = evaluateField({ fieldName: f.name, lat: f.lat, today: isoDate(now), recent, history: history.map, historyYears: { first: history.first, last: history.last }, kansas });
  return { result, kansas };
}

async function saveRun(db: D1Database, run: Omit<FieldRun, "firstCheckedAt" | "checkCount">): Promise<FieldRun> {
  await db
    .prepare(
      `INSERT INTO field_watch_runs (run_id, field_id, field_name, data_through, status, headline, reasons, metrics, sources, trigger, first_checked_at, checked_at, check_count)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?11, 1)
       ON CONFLICT(run_id) DO UPDATE SET status = excluded.status, headline = excluded.headline, reasons = excluded.reasons,
         metrics = excluded.metrics, sources = excluded.sources, trigger = excluded.trigger, checked_at = excluded.checked_at,
         check_count = field_watch_runs.check_count + 1`,
    )
    .bind(run.runId, run.fieldId, run.fieldName, run.dataThrough, run.status, run.headline, JSON.stringify(run.reasons), JSON.stringify(run.metrics), JSON.stringify(run.sources), run.trigger, run.checkedAt)
    .run();
  const row = await db.prepare("SELECT first_checked_at, check_count FROM field_watch_runs WHERE run_id = ?1").bind(run.runId).first<{ first_checked_at: number; check_count: number }>();
  return { ...run, firstCheckedAt: row?.first_checked_at ?? run.checkedAt, checkCount: row?.check_count ?? 1 };
}

/**
 * Publish to the live room Durable Object (class LiveRoom, binding LIVE_ROOM) when it is bound; otherwise a no-op.
 * Contract agreed with the live-room owner: RPC `publish(event)`, where event has a string `type`.
 */
async function publish(env: Env, run: FieldRun): Promise<void> {
  const ns = env.LIVE_ROOM;
  if (!ns) return;
  try {
    const stub = ns.get(ns.idFromName(env.LIVE_ROOM_NAME ?? "demo")) as unknown as { publish?: (event: { type: string } & Record<string, unknown>) => Promise<unknown> };
    if (typeof stub.publish !== "function") return;
    await stub.publish({
      type: "fieldwatch.run",
      runId: run.runId,
      fieldId: run.fieldId,
      fieldName: run.fieldName,
      status: run.status,
      headline: run.headline,
      dataThrough: run.dataThrough,
      checkedAt: run.checkedAt,
      trigger: run.trigger,
    });
  } catch (err) {
    console.warn(JSON.stringify({ msg: "fieldwatch publish failed", err: String(err) }));
  }
}

export async function runFieldWatch(env: Env, trigger: Trigger, opts: { now?: Date; deps?: FieldWatchDeps; fields?: WatchedField[] } = {}): Promise<FieldRun[]> {
  const now = opts.now ?? new Date();
  const fields = opts.fields ?? WATCHED_FIELDS;
  const started = Date.now();
  const settled = await Promise.allSettled(fields.map((f) => checkField(env, f, now, opts.deps)));
  const runs: FieldRun[] = [];
  for (let i = 0; i < fields.length; i++) {
    const f = fields[i]!;
    const s = settled[i]!;
    const checkedAt = now.getTime();
    const base =
      s.status === "fulfilled"
        ? {
            runId: `${f.id}:${s.value.result.metrics.dataThrough ?? `insufficient:${isoDate(now)}`}`,
            dataThrough: s.value.result.metrics.dataThrough,
            status: s.value.result.status as RunStatus,
            headline: s.value.result.headline,
            reasons: s.value.result.reasons,
            metrics: s.value.result.metrics as unknown as Record<string, unknown>,
            sources: sourcesFor(f, s.value.kansas),
          }
        : {
            runId: `${f.id}:error:${now.toISOString().slice(0, 13)}`,
            dataThrough: null,
            status: "error" as const,
            headline: `Check failed for ${f.name}: a data service didn't answer`,
            reasons: [{ id: "error", text: String(s.reason instanceof Error ? s.reason.message : s.reason).slice(0, 300), source: "SoilSense" }],
            metrics: {},
            sources: sourcesFor(f, null),
          };
    const run = { ...base, fieldId: f.id, fieldName: f.name, trigger, checkedAt };
    const saved = env.DB ? await saveRun(env.DB, run) : { ...run, firstCheckedAt: checkedAt, checkCount: 1 };
    runs.push(saved);
    await publish(env, saved);
  }
  console.log(JSON.stringify({ msg: "field watch run", trigger, ms: Date.now() - started, results: runs.map((r) => `${r.fieldId}=${r.status}`) }));
  return runs;
}

interface Row {
  run_id: string;
  field_id: string;
  field_name: string;
  data_through: string | null;
  status: RunStatus;
  headline: string;
  reasons: string;
  metrics: string;
  sources: string;
  trigger: Trigger;
  first_checked_at: number;
  checked_at: number;
  check_count: number;
}

export function rowToRun(r: Row): FieldRun {
  return {
    runId: r.run_id,
    fieldId: r.field_id,
    fieldName: r.field_name,
    dataThrough: r.data_through,
    status: r.status,
    headline: r.headline,
    reasons: JSON.parse(r.reasons),
    metrics: JSON.parse(r.metrics),
    sources: JSON.parse(r.sources),
    trigger: r.trigger,
    firstCheckedAt: r.first_checked_at,
    checkedAt: r.checked_at,
    checkCount: r.check_count,
  };
}

/** The most recent run for each watched field, plus when the cron last ran. */
export async function latestRuns(db: D1Database): Promise<{ runs: FieldRun[]; lastCronAt: number | null; lastCheckAt: number | null }> {
  const { results } = await db
    .prepare(
      `SELECT r.* FROM field_watch_runs r
       JOIN (SELECT field_id, MAX(checked_at) AS t FROM field_watch_runs GROUP BY field_id) m ON m.field_id = r.field_id AND m.t = r.checked_at`,
    )
    .all<Row>();
  const cron = await db.prepare("SELECT MAX(checked_at) AS t FROM field_watch_runs WHERE trigger = 'cron'").first<{ t: number | null }>();
  const any = await db.prepare("SELECT MAX(checked_at) AS t FROM field_watch_runs").first<{ t: number | null }>();
  const order = new Map(WATCHED_FIELDS.map((f, i) => [f.id, i]));
  const runs = (results ?? []).map(rowToRun).sort((a, b) => (order.get(a.fieldId) ?? 99) - (order.get(b.fieldId) ?? 99));
  return { runs, lastCronAt: cron?.t ?? null, lastCheckAt: any?.t ?? null };
}

export async function runHistory(db: D1Database, fieldId: string | undefined, limit: number): Promise<FieldRun[]> {
  const stmt = fieldId
    ? db.prepare("SELECT * FROM field_watch_runs WHERE field_id = ?1 ORDER BY checked_at DESC LIMIT ?2").bind(fieldId, limit)
    : db.prepare("SELECT * FROM field_watch_runs ORDER BY checked_at DESC LIMIT ?1").bind(limit);
  const { results } = await stmt.all<Row>();
  return (results ?? []).map(rowToRun);
}
