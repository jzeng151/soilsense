import { Hono } from "hono";
import { ALL_CROPS } from "../../engine/crops";
import { farms, type DemoHistories } from "../../shared/demoPlans";
import type { Env } from "../env";
import { saveWarmRun, warmStatus, type WarmRun } from "./run";

export const prewarm = new Hono<{ Bindings: Env }>();
prewarm.use("*", async (c, next) => {
  c.header("Cache-Control", "no-store");
  const given = c.req.header("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const token = c.env.ADMIN_TOKEN;
  let diff = 0;
  if (!token || given.length !== token.length) return c.json({ error: "Admin token required" }, 401);
  for (let i = 0; i < token.length; i++) diff |= given.charCodeAt(i) ^ token.charCodeAt(i);
  if (diff) return c.json({ error: "Admin token required" }, 401);
  await next();
});
prewarm.get("/status", async c => {
  try { return c.json(await warmStatus(c.env)); }
  catch { return c.json({ error: "Durable warm status unavailable" }, 503); }
});
// The external runner reports progress; the count is independently read from live D1 entries,
// not accepted from the caller. Histories are bounded to the one inferred profile per fixed farm.
prewarm.post("/status", async c => {
  if (!c.env.DB) return c.json({ error: "Durable warm status unavailable" }, 503);
  const text = await c.req.text();
  if (text.length > 12_000) return c.json({ error: "Status too large" }, 413);
  let body: Partial<WarmRun>;
  try { body = JSON.parse(text); } catch { return c.json({ error: "Invalid JSON" }, 400); }
  if (!body || body.mode !== "external" || typeof body.startedAt !== "string" || !Number.isFinite(Date.parse(body.startedAt)) ||
    body.startedAt.slice(0, 10) !== new Date().toISOString().slice(0, 10) ||
    (body.completedAt !== null && (typeof body.completedAt !== "string" || !Number.isFinite(Date.parse(body.completedAt)))) ||
    !Number.isInteger(body.failures) || body.failures! < 0 || body.failures! > 1000 ||
    !Array.isArray(body.errors) || body.errors.length > 10 || body.errors.some(e => typeof e !== "string" || e.length > 300) ||
    !body.histories || typeof body.histories !== "object" || Array.isArray(body.histories)) return c.json({ error: "Invalid warm status" }, 400);
  const histories = body.histories as DemoHistories;
  for (const [name, profiles] of Object.entries(histories)) {
    if (!farms.some(f => f.name === name) || !Array.isArray(profiles) || profiles.length !== 1 ||
      !Array.isArray(profiles[0]) || profiles[0].length < 1 || profiles[0].length > 3 ||
      profiles[0].some(crop => !ALL_CROPS.includes(crop))) return c.json({ error: "Invalid demo histories" }, 400);
  }
  try {
    await saveWarmRun(c.env, { startedAt: body.startedAt, completedAt: body.completedAt!, failures: body.failures!, errors: body.errors,
      histories, mode: "external" });
    return c.json({ stored: true });
  } catch { return c.json({ error: "Durable warm status write failed" }, 503); }
});
