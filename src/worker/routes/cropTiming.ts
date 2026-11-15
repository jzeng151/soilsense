import { Hono } from "hono";
import { estimateCornTiming } from "../../engine/cropTiming";
import { getTimingPower } from "../data/timingPower";
import { getNassSilking } from "../data/nassProgress";
import { getCounty } from "../data/geo";
import { isInContiguousUS } from "../service";
import type { AppEnv } from "./auth";
export const cropTiming = new Hono<AppEnv>();
cropTiming.get("/", async c => {
  const lat = Number(c.req.query("lat")), lon = Number(c.req.query("lon"));
  const year = Number(c.req.query("year"));
  const planting = c.req.query("planting") ?? `${year}-05-01`;
  if (!isInContiguousUS(lat, lon) || !Number.isInteger(year) || year < 1991 || year >= new Date().getUTCFullYear() || !new RegExp(`^${year}-(0[4-6])-(0[1-9]|[12][0-9]|3[01])$`).test(planting) || new Date(planting).toISOString().slice(0,10) !== planting) return c.json({ error: "Valid US point, completed year since 1991 and April-June planting date required" }, 400);
  try {
    const weather = await getTimingPower(c.env.DB, lat, lon, year);
    const timing = estimateCornTiming(weather.days, planting, `${year}-10-31`);
    const estimates: { year: number; silking: string | null }[] = [{ year, silking: timing.silking }];
    // Regional surveys are useful only when qualified against the same assumed planting/maturity.
    if (c.env.NASS_API_KEY) for (const previous of [year-1,year-2].filter(y => y >= 1991)) {
      try { const w = await getTimingPower(c.env.DB,lat,lon,previous); estimates.push({ year: previous, silking: estimateCornTiming(w.days,`${previous}${planting.slice(4)}`,`${previous}-10-31`).silking }); }
      catch { estimates.push({ year: previous, silking: null }); }
    }
    const county = c.env.NASS_API_KEY ? await getCounty(c.env.DB,lat,lon) : null;
    return c.json({ timing, weather, nassComparison: await getNassSilking(c.env.DB,c.env.NASS_API_KEY,county,estimates) });
  } catch { return c.json({ status: "unavailable", reason: "NASA POWER timing request failed; no dates estimated" }, 502); }
});
