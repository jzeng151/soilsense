// Field Watch API.
//   GET  /api/fieldwatch/latest           → latest result per watched field + when the cron last ran
//   GET  /api/fieldwatch/runs?field=&limit → run history (newest first)
//   POST /api/fieldwatch/run              → "Run check now" (60 s cooldown; same access rules as the planner)

import { Hono } from "hono";
import { RULE_TEXT, THRESHOLDS } from "../fieldwatch/rule";
import { latestRuns, runFieldWatch, runHistory, WATCHED_FIELDS } from "../fieldwatch/run";
import type { AppEnv } from "./auth";

export const fieldWatch = new Hono<AppEnv>();

export const CRON_SCHEDULE = "17 * * * *";
const COOLDOWN_MS = 60_000;
let lastManualRun = 0; // per isolate; D1 is checked too

const noDb = { error: "Field Watch needs the database. Run the D1 migrations (0004_field_watch.sql), then try again." };
const migrationHint = (err: unknown) => (/no such table/i.test(String(err)) ? noDb : null);

fieldWatch.use("*", async (c, next) => {
  c.header("Cache-Control", "no-store");
  await next();
});

const about = {
  rule: RULE_TEXT,
  thresholds: THRESHOLDS,
  schedule: { cron: CRON_SCHEDULE, description: "Every hour at :17 (Cloudflare Cron Trigger)" },
  fields: WATCHED_FIELDS.map(({ id, name, lat, lon }) => ({ id, name, lat, lon })),
};

fieldWatch.get("/latest", async (c) => {
  if (!c.env.DB) return c.json(noDb, 503);
  try {
    return c.json({ ...(await latestRuns(c.env.DB)), ...about });
  } catch (err) {
    const hint = migrationHint(err);
    if (hint) return c.json(hint, 503);
    throw err;
  }
});

fieldWatch.get("/runs", async (c) => {
  if (!c.env.DB) return c.json(noDb, 503);
  const field = c.req.query("field");
  if (field && !WATCHED_FIELDS.some((f) => f.id === field)) return c.json({ error: `Unknown field. Use one of: ${WATCHED_FIELDS.map((f) => f.id).join(", ")}` }, 400);
  const limit = Math.min(100, Math.max(1, Number(c.req.query("limit") ?? 20) || 20));
  try {
    return c.json({ runs: await runHistory(c.env.DB, field, limit) });
  } catch (err) {
    const hint = migrationHint(err);
    if (hint) return c.json(hint, 503);
    throw err;
  }
});

fieldWatch.post("/run", async (c) => {
  if (!c.env.DB) return c.json(noDb, 503);
  try {
    const latest = await latestRuns(c.env.DB);
    const recent = Math.max(lastManualRun, latest.lastCheckAt ?? 0);
    if (Date.now() - recent < COOLDOWN_MS) {
      return c.json({ ...latest, ...about, cooldown: true, message: "Checked less than a minute ago. Showing that result." });
    }
    lastManualRun = Date.now();
    await runFieldWatch(c.env, "manual");
    return c.json({ ...(await latestRuns(c.env.DB)), ...about, cooldown: false });
  } catch (err) {
    const hint = migrationHint(err);
    if (hint) return c.json(hint, 503);
    throw err;
  }
});
