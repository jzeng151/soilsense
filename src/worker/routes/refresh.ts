// NASA POWER current-snapshot refresh (#12, #24) and evidence bundles (#25).
//   GET  /api/refresh/status               → per watched farm: accepted snapshot, freshness by observed date, last attempt
//   GET  /api/refresh/snapshots/:id        → the snapshot's manifest (source, query, units, period, completeness, license)
//   GET  /api/refresh/snapshots/:id/bundle → the immutable R2 evidence bundle (manifest + observations)
//   POST /api/refresh/run                  → start a refresh now (ADMIN_TOKEN bearer only; no field/URL input accepted)

import { Hono } from "hono";
import type { AppEnv } from "./auth";
import { planCells, REFRESH_POLICY } from "../refresh/snapshot";
import { farmStatuses, getSnapshotRow } from "../refresh/store";
import { POWER_REFRESH_CRON, REFRESH_FARMS, startPowerRefresh } from "../refresh/workflow";

export const refresh = new Hono<AppEnv>();

const SNAPSHOT_ID = /^pwr-[0-9a-f]{24}$/;
const noDb = { error: "The refresh needs the database. Run the D1 migrations (0005_power_snapshots.sql), then try again." };
const missingTable = (err: unknown) => /no such table/i.test(String(err));

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

refresh.use("*", async (c, next) => {
  c.header("Cache-Control", "no-store");
  await next();
});

refresh.get("/status", async (c) => {
  if (!c.env.DB) return c.json(noDb, 503);
  const cellOf = new Map<string, string>();
  for (const cell of planCells(REFRESH_FARMS)) for (const id of cell.farmIds) cellOf.set(id, cell.key);
  try {
    const farms = await farmStatuses(
      c.env.DB,
      REFRESH_FARMS.map((f) => ({ id: f.id, name: f.name, gridKey: cellOf.get(f.id) ?? "" })),
      new Date(),
    );
    return c.json({
      farms,
      policy: REFRESH_POLICY,
      schedule: { cron: POWER_REFRESH_CRON, description: "Daily at 05:43 UTC (Cloudflare Workflow), plus an admin-only manual run" },
      workflowBound: Boolean(c.env.POWER_REFRESH),
      evidenceBucketBound: Boolean(c.env.EVIDENCE),
      note: "Freshness is judged by the observed data-through date, not by when the data were downloaded. Historical replay data are a separate stream and never change here.",
    });
  } catch (err) {
    if (missingTable(err)) return c.json(noDb, 503);
    throw err;
  }
});

refresh.get("/snapshots/:id", async (c) => {
  const id = c.req.param("id");
  if (!SNAPSHOT_ID.test(id)) return c.json({ error: "Unknown snapshot id." }, 400);
  if (!c.env.DB) return c.json(noDb, 503);
  try {
    const row = await getSnapshotRow(c.env.DB, id);
    if (!row) return c.json({ error: "Snapshot not found." }, 404);
    return c.json({
      manifest: JSON.parse(row.manifest),
      acceptedAt: new Date(row.accepted_at).toISOString(),
      bundle: row.r2_key ? { key: row.r2_key, url: `/api/refresh/snapshots/${id}/bundle` } : null,
    });
  } catch (err) {
    if (missingTable(err)) return c.json(noDb, 503);
    throw err;
  }
});

refresh.get("/snapshots/:id/bundle", async (c) => {
  const id = c.req.param("id");
  if (!SNAPSHOT_ID.test(id)) return c.json({ error: "Unknown snapshot id." }, 400);
  if (!c.env.DB) return c.json(noDb, 503);
  if (!c.env.EVIDENCE) return c.json({ error: "The evidence bucket isn't bound on this deployment; the manifest is still available." }, 503);
  const row = await getSnapshotRow(c.env.DB, id).catch(() => null);
  if (!row?.r2_key) return c.json({ error: "No stored bundle for this snapshot." }, 404);
  const obj = await c.env.EVIDENCE.get(row.r2_key);
  if (!obj) return c.json({ error: "Bundle object missing from the bucket." }, 404);
  return new Response(obj.body, { headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=31536000, immutable", ETag: obj.httpEtag } });
});

refresh.post("/run", async (c) => {
  const token = c.env.ADMIN_TOKEN;
  const given = (c.req.header("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return c.json({ error: "Manual refresh is disabled until ADMIN_TOKEN is set." }, 403);
  if (!given || !safeEqual(given, token)) return c.json({ error: "unauthorized" }, 401);
  if (!c.env.POWER_REFRESH) return c.json({ error: "The POWER_REFRESH Workflow binding isn't configured on this deployment." }, 503);
  const started = await startPowerRefresh(c.env, "manual");
  return c.json({ ...started, statusUrl: "/api/refresh/status" }, started.created ? 202 : 200);
});
