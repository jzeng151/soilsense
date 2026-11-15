import { Hono } from "hono";
import { estimateCornTiming } from "../../engine/cropTiming";
import { getTimingPower } from "../data/timingPower";
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
    return c.json({ timing: estimateCornTiming(weather.days, planting, `${year}-10-31`), weather,
      nassComparison: { status: "unavailable", reason: c.env.NASS_API_KEY ? "Crop-progress benchmark adapter not implemented; county-to-district mapping and weekly report intervals not yet verified" : "NASS_API_KEY not configured; no benchmark fetched", source: "https://quickstats.nass.usda.gov/api", interpretation: "Weekly cumulative regional acreage at/beyond silking, not field observations or field validation" } });
  } catch { return c.json({ status: "unavailable", reason: "NASA POWER timing request failed; no dates estimated" }, 502); }
});
