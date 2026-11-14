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

export async function makePlan(
  env: Env,
  request: PlanRequest,
  opts: { placeName?: string; skipCropHistory?: boolean; now?: Date } = {},
): Promise<PlanResponse> {
  const now = opts.now ?? new Date();
  const years = yearsFor(env, now);
  const [powerClimate, daymet, soil, cropHistory, county] = await Promise.all([
    getDailyClimate(env.DB, request.lat, request.lon, years.historyStart, years.historyEnd),
    getDaymet(env.DB, request.lat, request.lon, years.historyStart, years.historyEnd),
    getSoil(env.DB, request.lat, request.lon),
    opts.skipCropHistory
      ? Promise.resolve({ available: false, source: "Farmer input (phone call)", years: [] })
      : getCropHistory(env.DB, request.lat, request.lon, years.cdlLastYear),
    getCounty(env.DB, request.lat, request.lon),
  ]);
  // Weather: average of NASA POWER and NASA Daymet when Daymet answered; NASA POWER alone otherwise.
  const climate = daymet ? mergeDaymet(powerClimate, daymet).climate : powerClimate;
  const [nass, losses, openEt] = await Promise.all([
    getNassData(env.DB, env.NASS_API_KEY, county, now.getUTCFullYear()),
    getCountyLosses(env.ASSETS, county),
    // OpenET only helps where we know what grew; skip it for phone calls without crop history.
    cropHistory.years.length ? getOpenEt(env.DB, env.OPENET_API_KEY, request.lat, request.lon, years.historyEnd) : Promise.resolve(null),
  ]);
  return buildPlan({
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
