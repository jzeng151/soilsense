// Fetches every data source for a location (in parallel, cached) and runs the engine.

import { hasMeasurements } from "../shared/measurements";
import { mergeDaymet } from "../engine/climate";
import { buildPlan } from "../engine/plan";
import type { FieldResponse, PlanRequest, PlanResponse } from "../shared/types";
import { getCropHistory } from "./data/cdl";
import { getDaymet } from "./data/daymet";
import { getCounty } from "./data/geo";
import { getNassData } from "./data/nass";
import { getOpenEt } from "./data/openet";
import { getCountyLosses } from "./data/rma";
import { getDailyClimate } from "./data/power";
import { getSoil } from "./data/soil";
import type { Env } from "./env";
import { cached } from "./lib/cache";
import { planMemory, writeFieldMemory } from "./fieldMemory";

export function yearsFor(env: Env, now = new Date()) {
  const year = now.getUTCFullYear();
  const historyStart = Number(env.HISTORY_START_YEAR ?? 1991);
  const historyEnd = year - 1;
  // A new CDL year is usually published in late winter; before March use the year before.
  const cdlLastYear = now.getUTCMonth() < 2 ? year - 2 : year - 1;
  // Plan the next three seasons. Once the year's main harvest is done (after Sep), start next year.
  const planStartYear = now.getUTCMonth() >= 8 ? year + 1 : year;
  return { historyStart, historyEnd, cdlLastYear, planStartYear };
}

export function isInContiguousUS(lat: number, lon: number): boolean {
  return lat >= 24.4 && lat <= 49.5 && lon >= -125 && lon <= -66.8;
}

export async function getField(env: Env, lat: number, lon: number): Promise<FieldResponse> {
  const { cdlLastYear } = yearsFor(env);
  const [county, soil, cropHistory] = await Promise.all([
    getCounty(env.DB, lat, lon),
    getSoil(env.DB, lat, lon),
    getCropHistory(env.DB, lat, lon, cdlLastYear),
  ]);
  return { lat, lon, county, soil, cropHistory };
}

/**
 * A finished plan is saved for 6 hours (memory + D1): the same field and answers on the same day reuse it and
 * skip every data download and the whole engine run. This keeps repeated requests (demos, the phone agent
 * re-asking) far under the Worker CPU limit.
 */
/** Progress of one data source while a plan is built (used by the live call screen). */
export interface PlanSourceEvent {
  /** power, daymet, soil, cdl, county, nass, rma, openet, engine, or "saved" (a saved plan was reused). */
  source: string;
  phase?: "start";
  ms?: number;
  ok?: boolean;
}

export interface PlanOpts {
  /** Internal engine mode for cache identity; makePlan takes the actual mode from Env. */
  extraCrops?: boolean;
  placeName?: string;
  skipCropHistory?: boolean;
  now?: Date;
  /** Optional progress callback, one call per data source start/finish. Must not throw. */
  onEvent?: (e: PlanSourceEvent) => void;
}

/** Bump whenever the engine's output changes, so cached plans from older code are never served. */
export const PLAN_ENGINE_VERSION = "e7-diverse-cpu-safe";

/** Cloudflare terminates an isolate on 1102; a try/catch cannot recover from it. */
export class PlanNotReady extends Error {
  constructor() {
    super("This plan is not precomputed yet. Please try again shortly or ask the operator to warm this field. Fresh planning requires a larger Worker CPU budget.");
  }
}

export function planCacheKey(request: PlanRequest, opts: PlanOpts = {}, now = new Date()): string {
  const water = request.water ?? (request.irrigated ? "full" : "rain");
  return [
    `plan:${PLAN_ENGINE_VERSION}`,
    ...(opts.extraCrops ? ["extra-crops=v1"] : []),
    request.lat.toFixed(4),
    request.lon.toFixed(4),
    water,
    request.priority,
    ...(request.goals?.length ? [`goals=${request.goals.join(",")}`] : []),
    (request.recentCrops ?? []).join(","),
    request.language ?? "en",
    opts.skipCropHistory ? "nocdl" : "cdl",
    opts.placeName ?? "",
    now.toISOString().slice(0, 10),
  ].join(":");
}

export async function makePlan(
  env: Env,
  request: PlanRequest,
  opts: PlanOpts = {},
): Promise<PlanResponse> {
  // Default is inline (fresh computation). Set PLAN_COMPUTE_MODE=cache-only on a Workers Free account, where an
  // uncached plan exceeds the 10 ms CPU budget, and prewarm with scripts/prefetch-demo.mjs.
  const inline = env.PLAN_COMPUTE_MODE !== "cache-only";
  // Personal data never reaches shared caches, even on the low-budget fallback path.
  if (opts.now || hasMeasurements(request)) {
    if (!inline) throw new PlanNotReady();
    return makePlanFresh(env, request, opts);
  }
  const key = planCacheKey(request, { ...opts, extraCrops: env.EXTRA_CROPS === "on" });
  const t0 = Date.now();
  try {
    const { value, cache } = await cached(env.DB, key, 6 * 3600, async () => {
      if (!inline) throw new PlanNotReady();
      const meta: FreshMeta = { complete: true };
      const plan = await makePlanFresh(env, request, opts, meta);
      // A plan built while a key source was down (county, USDA) is shown but never saved, so the next
      // request gets a full plan instead of repeating the gap for hours.
      if (!meta.complete) throw new Uncached(plan);
      return plan;
    });
    if (cache !== "miss") opts.onEvent?.({ source: "saved", ms: Date.now() - t0, ok: true });
    return value;
  } catch (err) {
    if (err instanceof Uncached) return err.plan;
    throw err;
  }
}

interface FreshMeta {
  complete: boolean;
}

class Uncached extends Error {
  constructor(public readonly plan: PlanResponse) {
    super("incomplete plan: not cached");
  }
}

async function makePlanFresh(
  env: Env,
  request: PlanRequest,
  opts: PlanOpts = {},
  meta?: FreshMeta,
): Promise<PlanResponse> {
  const now = opts.now ?? new Date();
  const years = yearsFor(env, now);
  // Per-source timing, logged once per plan (helps find slow upstream services).
  const t0 = Date.now();
  const timing: Record<string, number> = {};
  const timed = <T>(label: string, p: Promise<T>): Promise<T> => {
    opts.onEvent?.({ source: label, phase: "start" });
    return p.then(
      (v) => {
        timing[label] = Date.now() - t0;
        opts.onEvent?.({ source: label, ms: timing[label], ok: v != null });
        return v;
      },
      (err) => {
        timing[label] = Date.now() - t0;
        opts.onEvent?.({ source: label, ms: timing[label], ok: false });
        throw err;
      },
    );
  };
  const [powerClimate, daymet, soil, cropHistory, county] = await Promise.all([
    timed("power", getDailyClimate(env.DB, request.lat, request.lon, years.historyStart, years.historyEnd)),
    timed("daymet", getDaymet(env.DB, request.lat, request.lon, years.historyStart, years.historyEnd)),
    timed("soil", getSoil(env.DB, request.lat, request.lon)),
    opts.skipCropHistory
      ? Promise.resolve({ available: false, source: "Farmer input (phone call)", years: [] })
      : timed("cdl", getCropHistory(env.DB, request.lat, request.lon, years.cdlLastYear)),
    timed("county", getCounty(env.DB, request.lat, request.lon)),
  ]);
  // Weather: average of NASA POWER and NASA Daymet when Daymet answered; NASA POWER alone otherwise.
  const climate = daymet ? mergeDaymet(powerClimate, daymet).climate : powerClimate;
  const [nass, losses, openEt] = await Promise.all([
    timed("nass", getNassData(env.DB, env.NASS_API_KEY, county, now.getUTCFullYear(), env.EXTRA_CROPS === "on")),
    timed("rma", getCountyLosses(env.ASSETS, county)),
    // OpenET only helps where we know what grew; skip it for phone calls without crop history.
    cropHistory.years.length ? timed("openet", getOpenEt(env.DB, env.OPENET_API_KEY, request.lat, request.lon, years.historyEnd)) : Promise.resolve(null),
  ]);
  if (meta) meta.complete = county !== null && (!env.NASS_API_KEY || nass !== null);
  const tEngine = Date.now();
  const plan = buildPlan({
    extraCrops: env.EXTRA_CROPS === "on",
    request,
    climate,
    soil,
    cropHistory,
    county,
    nass,
    losses,
    openEt,
    placeName: opts.placeName,
    planStartYear: years.planStartYear,
    now,
  });
  timing.engine = Date.now() - tEngine;
  opts.onEvent?.({ source: "engine", ms: timing.engine, ok: true });
  timing.total = Date.now() - t0;
  console.log(JSON.stringify({ msg: "plan timing", lat: request.lat, lon: request.lon, ms: timing }));
  return plan;
}

export async function logPlan(
  env: Env,
  entry: {
    channel: "voice" | "web";
    callSid?: string;
    caller?: string | null;
    place?: string;
    plan: PlanResponse;
    smsSent?: boolean;
  },
): Promise<string> {
  const id = crypto.randomUUID();
  if (!env.DB || hasMeasurements(entry.plan.request)) return id;
  const top = entry.plan.plans[0];
  try {
    await env.DB.prepare(
      "INSERT INTO plan_log (id, created_at, channel, call_sid, caller_masked, place, lat, lon, irrigated, priority, recent_crops, top_plan, total_score, sms_sent) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
    )
      .bind(
        id,
        Date.now(),
        entry.channel,
        entry.callSid ?? null,
        entry.caller ?? null,
        entry.place ?? null,
        entry.plan.request.lat,
        entry.plan.request.lon,
        entry.plan.request.irrigated ? 1 : 0,
        entry.plan.request.priority,
        JSON.stringify(entry.plan.request.recentCrops ?? []),
        top?.label ?? null,
        top?.scores.total ?? null,
        entry.smsSent ? 1 : 0,
      )
      .run();
    await writeFieldMemory(env, planMemory(entry.plan, id));
  } catch (err) {
    console.warn(JSON.stringify({ msg: "plan log failed", err: String(err) }));
  }
  return id;
}
