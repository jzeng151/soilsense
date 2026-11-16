// /api/usdm/*: weekly U.S. Drought Monitor context for a county (GitHub issue #31).
// Regional context only: never a field measurement, never used in a rotation score.

import { Hono } from "hono";
import { replayAgreement } from "../../engine/usdm";
import { getUsdmReplayTimelines, getUsdmTimeline, isFips, usdmCategoryFor } from "../data/usdm";
import type { AppEnv } from "./auth";

export const usdm = new Hono<AppEnv>();

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const validIso = (s: string) => ISO.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));

/** GET /api/usdm/category?fips=20055&date=2022-07-15 → dated category (for Field Watch results/messages). */
usdm.get("/category", async (c) => {
  const fips = c.req.query("fips") ?? "";
  const date = c.req.query("date") ?? new Date().toISOString().slice(0, 10);
  if (!isFips(fips)) return c.json({ error: "fips must be a 5-digit county code" }, 400);
  if (!validIso(date)) return c.json({ error: "date must be YYYY-MM-DD" }, 400);
  const result = await usdmCategoryFor(fips, date, { db: c.env.DB });
  c.header("Cache-Control", result.historical ? "public, max-age=86400" : "public, max-age=1800");
  return c.json(result);
});

/** GET /api/usdm/timeline?fips=20055&start=2022-05-01&end=2022-09-30 → weekly timeline with coverage. */
usdm.get("/timeline", async (c) => {
  const fips = c.req.query("fips") ?? "";
  const start = c.req.query("start") ?? "";
  const end = c.req.query("end") ?? "";
  if (!isFips(fips)) return c.json({ error: "fips must be a 5-digit county code" }, 400);
  if (!validIso(start) || !validIso(end) || start > end) return c.json({ error: "start and end must be YYYY-MM-DD with start <= end" }, 400);
  if (Date.parse(end) - Date.parse(start) > 400 * 86_400_000) return c.json({ error: "window must be 400 days or less" }, 400);
  return c.json(await getUsdmTimeline(c.env.DB, fips, start, end));
});

/** GET /api/usdm/replay?fips=20055&years=2012,2022 → May–Sep timeline for each replayed year. */
usdm.get("/replay", async (c) => {
  const fips = c.req.query("fips") ?? "";
  if (!isFips(fips)) return c.json({ error: "fips must be a 5-digit county code" }, 400);
  const thisYear = new Date().getUTCFullYear();
  const years = [...new Set((c.req.query("years") ?? "").split(",").map(Number))].filter((y) => Number.isInteger(y) && y >= 1990 && y <= thisYear);
  if (!years.length || years.length > 6) return c.json({ error: "years must list 1 to 6 years" }, 400);
  const timelines = await getUsdmReplayTimelines(c.env.DB, fips, years.sort());
  return c.json({ timelines: timelines.map((t) => ({ ...t, agreement: replayAgreement(t) })) });
});
