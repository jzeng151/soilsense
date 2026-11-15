import { Hono } from "hono";
import type { Env } from "../env";
import { WATCHED_FIELDS } from "../fieldwatch/run";
import { comparisonKey, warmComparison, type Comparison } from "./comparison";
import { days, type Stream } from "./client";
export const imerg = new Hono<{ Bindings: Env }>();
// Public reads never start an Earthdata request. Admin warming bounds cloud/API costs.
imerg.get("/comparison/:field", async (c) => {
  const field = WATCHED_FIELDS.find((f) => f.id === c.req.param("field"));
  const end = c.req.query("end") ?? "2022-07-14", stream: Stream = c.req.query("stream") === "late" ? "late" : "final";
  try { days(end, end); } catch { return c.json({ error: "Invalid end day" }, 400); }
  if (!field) return c.json({ error: "Unknown demo field" }, 404);
  if (c.env.DB) {
    const row = await c.env.DB.prepare("SELECT value, expires_at FROM cache WHERE key = ?1").bind(comparisonKey(field.id, end, stream)).first<{ value: string; expires_at: number }>().catch(() => null);
    if (row && row.expires_at > Date.now()) return c.json(JSON.parse(row.value) as Comparison);
  }
  return c.json({ state: "unavailable", note: "Optional IMERG evidence has not been retrieved for this window, or its cache expired. POWER and Field Watch are unchanged." });
});
imerg.post("/warm/:field", async (c) => {
  const expected = c.env.ADMIN_TOKEN, given = c.req.header("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!expected || given !== expected) return c.json({ error: "unauthorized" }, 401);
  const f = WATCHED_FIELDS.find((f) => f.id === c.req.param("field"));
  if (!f) return c.json({ error: "Unknown demo field" }, 404);
  if (!c.env.DB) return c.json({ error: "D1 is required to warm evidence" }, 503);
  const end = c.req.query("end") ?? "2022-07-14", stream: Stream = c.req.query("stream") === "late" ? "late" : "final";
  try { days(end, end); } catch { return c.json({ error: "Invalid end day" }, 400); }
  try { return c.json(await warmComparison(c.env, f, end, stream)); }
  catch { return c.json({ state: "unavailable", note: "Earthdata access, subset validation or POWER comparison failed. No evidence was substituted. Check the server-side EARTHDATA_TOKEN and GES DISC access permissions." }, 503); }
});
