import { Hono } from "hono";
import type { Env } from "../env";
import { WATCHED_FIELDS } from "../fieldwatch/run";
import { acceptedImergFor } from "./imerg-store";
import { IMERG_POLICY } from "./imerg-snapshot";
import { startImergRefresh } from "./imerg-workflow";
export const imergRefresh = new Hono<{ Bindings: Env }>();
imergRefresh.get("/status", async (c) => {
  if (!c.env.DB) return c.json({ error: "Apply 0006_imerg_snapshots.sql and bind D1" }, 503);
  try {
    const farms = await Promise.all(WATCHED_FIELDS.map(async (f) => ({ farmId: f.id, ...await acceptedImergFor(c.env.DB!, f.id, new Date()), lastAttempt: await c.env.DB!.prepare("SELECT attempted_at,outcome,detail,instance_id,trigger FROM imerg_refresh_attempts WHERE farm_id=?1").bind(f.id).first() })));
    return c.json({ product: "GPM_3IMERGDL V07 Late", stream: "current-late", farms, policy: IMERG_POLICY, workflowBound: Boolean(c.env.IMERG_REFRESH), credentialConfigured: Boolean(c.env.EARTHDATA_TOKEN), schedule: "43 5 * * *", note: "Freshness uses observed UTC data-through, not download time. POWER and historical Final are independent. Accepted IMERG evidence is context only, never a new Field Watch rule." });
  } catch { return c.json({ error: "IMERG status unavailable; apply migration 0006 and check D1" }, 503); }
});
imergRefresh.post("/run", async (c) => {
  const expected = c.env.ADMIN_TOKEN, given = c.req.header("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!expected || given !== expected) return c.json({ error: "unauthorized" }, 401);
  if (!c.env.IMERG_REFRESH) return c.json({ error: "IMERG_REFRESH binding not configured" }, 503);
  const result = await startImergRefresh(c.env, "manual");
  return c.json({ ...result, statusUrl: "/api/refresh/imerg/status" }, result.created ? 202 : 200);
});
imergRefresh.get("/snapshots/:id", async (c) => {
  if (!/^iml-[a-f0-9]{24}$/.test(c.req.param("id"))) return c.json({ error: "Unknown snapshot id" }, 400);
  const row = await c.env.DB?.prepare("SELECT manifest,r2_key FROM imerg_snapshots WHERE snapshot_id=?1").bind(c.req.param("id")).first<{ manifest: string; r2_key: string }>();
  return row ? c.json({ manifest: JSON.parse(row.manifest), bundleUrl: `/api/refresh/imerg/snapshots/${c.req.param("id")}/bundle` }) : c.json({ error: "Snapshot not found" }, 404);
});
imergRefresh.get("/snapshots/:id/bundle", async (c) => {
  if (!/^iml-[a-f0-9]{24}$/.test(c.req.param("id"))) return c.json({ error: "Unknown snapshot id" }, 400);
  const row = await c.env.DB?.prepare("SELECT r2_key FROM imerg_snapshots WHERE snapshot_id=?1").bind(c.req.param("id")).first<{ r2_key: string }>();
  const obj = row ? await c.env.EVIDENCE?.get(row.r2_key) : null;
  return obj ? new Response(obj.body, { headers: { "Content-Type": "application/json", "Cache-Control": "public,max-age=31536000,immutable", ETag: obj.httpEtag } }) : c.json({ error: "Bundle unavailable" }, 404);
});
