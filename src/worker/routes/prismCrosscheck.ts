import { Hono } from "hono";
import { compareWeather, type WeatherEstimate } from "../../engine/weatherCrosscheck";
import { noonRainBounds } from "../../engine/rainIntervalBounds";
import { noonTemperatureBounds } from "../../engine/temperatureIntervalBounds";
import { dataStatus } from "../../engine/dataEvidence";
import { getPrism } from "../data/prism";
import { crosscheckMerge, getCrosscheckPower, getCrosscheckDaymet } from "../data/crosscheckWeather";
import { getCrosscheckHourly } from "../data/crosscheckHourly";
import { getCrosscheckImerg } from "../data/crosscheckImerg";
import { days, retrieveSubset } from "../imerg/client";
import { isInContiguousUS } from "../service";
import type { AppEnv } from "./auth";
export const prismCrosscheck = new Hono<AppEnv>();
// Explicit administrator action only; reuse next's DAP4 validation and immutable day-cache keys.
prismCrosscheck.post("/imerg-warm", async c => {
  const token = c.env.ADMIN_TOKEN;
  if (!token || c.req.header("Authorization") !== `Bearer ${token}`) return c.json({ error: "Admin token required" }, 401);
  if (!c.env.DB) return c.json({ error: "D1 is required to warm IMERG evidence" }, 503);
  const latText = c.req.query("lat"), lonText = c.req.query("lon"), lat = Number(latText), lon = Number(lonText);
  const start = c.req.query("start") ?? "", end = c.req.query("end") ?? "";
  try {
    days(start, end);
    if (!latText?.trim() || !lonText?.trim() || !isInContiguousUS(lat, lon) || start < "2001-01-01" || end.slice(0, 4) >= String(new Date().getUTCFullYear())) throw new Error("invalid");
  } catch { return c.json({ error: "US point and completed-year interval of 1-16 days since 2001 required" }, 400); }
  try { return c.json(await retrieveSubset(c.env, lat, lon, start, end, "final")); }
  catch { return c.json({ state: "unavailable", note: "IMERG access or subset validation failed. Check server-side Earthdata token and GES DISC permissions. No data substituted." }, 503); }
});
prismCrosscheck.get("/", async c => {
  const latText = c.req.query("lat"), lonText = c.req.query("lon");
  const lat = Number(latText), lon = Number(lonText), start = c.req.query("start") ?? "2023-05-01", end = c.req.query("end") ?? "2023-05-03";
  const valid = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(Date.parse(d)) && new Date(d).toISOString().slice(0, 10) === d;
  if (!latText?.trim() || !lonText?.trim() || !isInContiguousUS(lat, lon) || !valid(start) || !valid(end) || start > end || Date.parse(end) - Date.parse(start) > 30 * 86400000 || start.slice(0, 4) < "1991" || end.slice(0, 4) >= String(new Date().getUTCFullYear())) return c.json({ error: "US point and completed-year interval of 1-31 days since 1991 required" }, 400);
  const dates: string[] = [];
  for (let t = Date.parse(start); t <= Date.parse(end); t += 86400000) dates.push(new Date(t).toISOString().slice(0, 10));
  // Each optional provider fails independently; no response bodies/errors containing credentials are returned.
  const safe = async <T,>(run: Promise<T>): Promise<T | null> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try { return await Promise.race([run.catch(() => null), new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), 40000); })]); }
    finally { clearTimeout(timer); }
  };
  const previousDate = new Date(Date.parse(start) - 86400000).toISOString().slice(0, 10);
  const [prism, power, daymet, normals, hourly, imerg, powerUtc] = await Promise.all([
    safe(getPrism(c.env.DB, lat, lon, start, end)), safe(getCrosscheckPower(c.env.DB, lat, lon, start, end)),
    safe(getCrosscheckDaymet(c.env.DB, lat, lon, start, end)), safe(getPrism(c.env.DB, lat, lon, start, end, true)),
    safe(getCrosscheckHourly(c.env.DB, lat, lon, start, end)), safe(getCrosscheckImerg(c.env.DB, lat, lon, [previousDate, ...dates])),
    safe(getCrosscheckPower(c.env.DB, lat, lon, previousDate, end, "UTC")),
  ]);
  const ps = prism ? { id: "PRISM", dayBoundary: "12:00 UTC ending", rows: prism.rows } : null;
  const merge = power && daymet ? crosscheckMerge(power, daymet) : null;
  const midnight = powerUtc;
  const prismTotalMm = prism && dates.every(d => { const v = prism.rows.find(r => r.date === d)?.rain; return typeof v === "number" && Number.isFinite(v) && v >= 0; }) ? prism.rows.filter(r => dates.includes(r.date)).reduce((sum, r) => sum + r.rain!, 0) : null;
  const indicator = (name: string, source: { rows: WeatherEstimate[] } | null, rainOnly = false) => {
    const variables = rainOnly ? ["rain"] as const : ["rain", "tmin", "tmax"] as const;
    const expected = dates.length * variables.length;
    const valid = dates.reduce((sum, date) => sum + variables.filter(variable => { const v = source?.rows.find(r => r.date === date)?.[variable]; return typeof v === "number" && Number.isFinite(v); }).length, 0);
    return { name, status: dataStatus({ available: !!source && (!rainOnly || valid > 0), complete: valid === expected, historical: true, cached: rainOnly, observedThrough: end }, new Date().toISOString()), valid, expected, reason: "Common data-status rules; coverage is distinct from interval comparability, independence and field applicability. Non-IMERG cache-hit origin not tracked; historical data are not current observations." };
  };
  return c.json({ start, end, requestedPoint: { lat, lon }, prism, power, daymet, merge, normals, hourly, imerg, powerUtc,
    sourceIndicators: [indicator("PRISM", prism), indicator("POWER daily LST", power), indicator("Daymet", daymet), indicator("POWER hourly UTC", hourly), indicator("POWER daily UTC", powerUtc), indicator("IMERG Final V07", imerg, true)],
    diagnostics: ps ? [hourly, power, daymet, merge, imerg].filter(v => v !== null).map(s => ({ reference: "PRISM", against: s!.id, rows: compareWeather(ps, s!, dates) })) : [],
    imergNoonBounds: imerg ? { ...noonRainBounds(imerg.rows, start, end, prismTotalMm), prismTotalMm } : null,
    powerTemperatureBounds: powerUtc ? noonTemperatureBounds(powerUtc.rows, prism?.rows ?? null, start, end) : null,
    powerNoonBounds: powerUtc ? { ...noonRainBounds(powerUtc.rows, start, end, prismTotalMm), prismTotalMm } : null,
    imergDiagnostics: imerg && midnight ? { reference: imerg.id, against: midnight.id, rows: compareWeather(imerg, midnight, dates), power: midnight } : null,
    evidenceReasons: {
      coverage: prism ? "PRISM point subset fetched; inspect per-variable gaps" : "PRISM unavailable; not zero",
      disagreement: "Descriptive differences only; neither product is truth. No ranking, crop-response, or Field Watch change",
      comparability: "POWER daily UTC and IMERG bound rain on the PRISM noon interval using full interior UTC days and both unknown endpoint allocations. Bounds, not invented half-day splits, resolve the daily boundary comparison. POWER hourly noon sums remain conditional and unclassified because hourly timestamp anchoring is unverified. Hourly-mean temperature extrema are not native PRISM extremes and are not classified. Daily POWER LST, Daymet and PRISM-vs-IMERG still have mismatched/unverified intervals",
      localApplicability: "Gridded estimates are not field measurements; agreement is not independent validation",
      imerg: "Uses next's validated Final V07 DAP4 day-cache only; public reads never initiate Earthdata requests. Missing/expired/unwarmed days stay null. IMERG-vs-POWER daily UTC midnight rain has common documented days; IMERG-vs-PRISM noon does not",
      merge: "Descriptive equal-weight daily merge only; not proof the main planner passed its whole-history Daymet coverage gate",
      service: "PRISM Explorer RPC is undocumented and may change. Official documented download service delivers full-grid ZIP packages, not a documented point subset; retained for a future offline ingestion path",
    },
  });
});
