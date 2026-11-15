// Fetches every data source for a location (in parallel, cached) and runs the engine.

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
  placeName?: string;
  skipCropHistory?: boolean;
  now?: Date;
  /** Optional progress callback, one call per data source start/finish. Must not throw. */
  onEvent?: (e: PlanSourceEvent) => void;
}

export async function makePlan(
  env: Env,
  request: PlanRequest,
  opts: PlanOpts = {},
): Promise<PlanResponse> {
  if (opts.now) return makePlanFresh(env, request, opts); // tests pin the date: always compute
  const water = request.water ?? (request.irrigated ? "full" : "rain");
  const key = [
    "plan:v2",
    request.lat.toFixed(4),
    request.lon.toFixed(4),
    water,
    request.priority,
    (request.recentCrops ?? []).join(","),
    request.language ?? "en",
    opts.skipCropHistory ? "nocdl" : "cdl",
    opts.placeName ?? "",
    new Date().toISOString().slice(0, 10),
  ].join(":");
  const t0 = Date.now();
  const { value, cache } = await cached(env.DB, key, 6 * 3600, () => makePlanFresh(env, request, opts));
  if (cache !== "miss") opts.onEvent?.({ source: "saved", ms: Date.now() - t0, ok: true });
  return value;
}

async function makePlanFresh(
  env: Env,
  request: PlanRequest,
  opts: PlanOpts = {},
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
    timed("nass", getNassData(env.DB, env.NASS_API_KEY, county, now.getUTCFullYear())),
    timed("rma", getCountyLosses(env.ASSETS, county)),
    // OpenET only helps where we know what grew; skip it for phone calls without crop history.
    cropHistory.years.length ? timed("openet", getOpenEt(env.DB, env.OPENET_API_KEY, request.lat, request.lon, years.historyEnd)) : Promise.resolve(null),
  ]);
  const tEngine = Date.now();
  const plan = buildPlan({
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
  if (!env.DB) return id;
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
  } catch (err) {
    console.warn(JSON.stringify({ msg: "plan log failed", err: String(err) }));
  }
  return id;
}
