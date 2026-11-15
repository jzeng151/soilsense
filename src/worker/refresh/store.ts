// Publication and status for POWER current-observation snapshots.
// Publish order: (1) immutable, content-addressed R2 objects (skipped when they already exist), then
// (2) one D1 batch (a single transaction): snapshot row (INSERT OR IGNORE), farm pointers and attempt status.
// If anything fails, the farm pointers still reference the last accepted snapshot; an orphaned R2 object
// is harmless because its key is its content hash and the retry reuses it.

import type { Env } from "../env";
import { buildManifest, evidenceKeys, freshness, type GridCell, type Manifest, type PowerQuery, type Verdict } from "./snapshot";

export type Outcome = "published" | "unchanged" | "rejected" | "error";
export type RefreshTrigger = "cron" | "manual";

export interface PublishInput {
  cell: GridCell;
  verdict: Extract<Verdict, { ok: true }>;
  query: PowerQuery;
  retrievedAt: string;
  /** Raw upstream body, kept with the bundle so the snapshot can be re-derived. */
  rawText: string;
  trigger: RefreshTrigger;
  instanceId: string;
  now: number;
}

export interface PublishResult {
  outcome: "published" | "unchanged";
  snapshotId: string;
  contentHash: string;
  dataThrough: string;
  r2: "stored" | "exists" | "unbound";
}

const attemptSql = `INSERT INTO power_refresh_attempts (farm_id, attempted_at, outcome, detail, candidate_id, instance_id, trigger)
  VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
  ON CONFLICT(farm_id) DO UPDATE SET attempted_at = excluded.attempted_at, outcome = excluded.outcome, detail = excluded.detail,
    candidate_id = excluded.candidate_id, instance_id = excluded.instance_id, trigger = excluded.trigger`;

export async function publishSnapshot(env: Pick<Env, "DB" | "EVIDENCE">, input: PublishInput): Promise<PublishResult> {
  const db = env.DB;
  if (!db) throw new Error("D1 binding DB is required to publish snapshots");
  const { verdict, cell, query, retrievedAt, now } = input;
  const existing = await db.prepare("SELECT snapshot_id, retrieved_at, r2_key FROM power_snapshots WHERE content_hash = ?1").bind(verdict.contentHash).first<{ snapshot_id: string; retrieved_at: number; r2_key: string | null }>();

  // The manifest records the first retrieval that produced this exact content.
  const manifest: Manifest = buildManifest(verdict, query, existing ? new Date(existing.retrieved_at).toISOString() : retrievedAt);
  const keys = evidenceKeys(verdict.contentHash);
  let r2: PublishResult["r2"] = "unbound";
  if (env.EVIDENCE) {
    const head = await env.EVIDENCE.head(keys.bundle);
    if (head) r2 = "exists";
    else {
      const meta = { snapshotId: verdict.snapshotId, contentHash: verdict.contentHash, dataThrough: verdict.content.dataThrough, gridKey: cell.key };
      await env.EVIDENCE.put(keys.source, input.rawText, { httpMetadata: { contentType: "application/json" }, customMetadata: { ...meta, kind: "source", sourceUrl: query.url } });
      await env.EVIDENCE.put(keys.bundle, JSON.stringify({ manifest, snapshot: verdict.content }), {
        httpMetadata: { contentType: "application/json", cacheControl: "public, max-age=31536000, immutable" },
        customMetadata: { ...meta, kind: "bundle" },
      });
      r2 = "stored";
    }
  }

  const minCompleteness = Math.min(...Object.values(verdict.content.completeness));
  const outcome: PublishResult["outcome"] = existing ? "unchanged" : "published";
  const stmts: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT OR IGNORE INTO power_snapshots (snapshot_id, content_hash, grid_key, grid_lat, grid_lon, period_start, data_through, retrieved_at, accepted_at, source_url, completeness, r2_key, r2_source_key, manifest)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)`,
      )
      .bind(
        verdict.snapshotId,
        verdict.contentHash,
        cell.key,
        cell.lat,
        cell.lon,
        verdict.content.period.start,
        verdict.content.dataThrough,
        Date.parse(manifest.retrievedAt),
        now,
        query.url,
        minCompleteness,
        r2 === "unbound" ? null : keys.bundle,
        r2 === "unbound" ? null : keys.source,
        JSON.stringify(manifest),
      ),
  ];
  // Backfill R2 keys if the row was first written while the bucket was unbound.
  if (existing && !existing.r2_key && r2 !== "unbound")
    stmts.push(db.prepare("UPDATE power_snapshots SET r2_key = ?1, r2_source_key = ?2 WHERE content_hash = ?3").bind(keys.bundle, keys.source, verdict.contentHash));
  for (const farmId of cell.farmIds) {
    stmts.push(
      db
        .prepare(
          `INSERT INTO power_snapshot_current (farm_id, snapshot_id, grid_key, data_through, accepted_at, confirmed_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?5)
           ON CONFLICT(farm_id) DO UPDATE SET
             snapshot_id = excluded.snapshot_id, grid_key = excluded.grid_key, data_through = excluded.data_through,
             accepted_at = CASE WHEN power_snapshot_current.snapshot_id = excluded.snapshot_id THEN power_snapshot_current.accepted_at ELSE excluded.accepted_at END,
             confirmed_at = excluded.confirmed_at
           WHERE excluded.data_through >= power_snapshot_current.data_through`,
        )
        .bind(farmId, verdict.snapshotId, cell.key, verdict.content.dataThrough, now),
      db.prepare(attemptSql).bind(farmId, now, outcome, JSON.stringify({ dataThrough: verdict.content.dataThrough }), verdict.snapshotId, input.instanceId, input.trigger),
    );
  }
  await db.batch(stmts);
  return { outcome, snapshotId: verdict.snapshotId, contentHash: verdict.contentHash, dataThrough: verdict.content.dataThrough, r2 };
}

/** Record a rejected candidate or failed fetch. Never touches the accepted-snapshot pointers. */
export async function recordFailure(
  db: D1Database | undefined,
  cell: GridCell,
  f: { outcome: "rejected" | "error"; errors: string[]; dataThrough?: string | null; trigger: RefreshTrigger; instanceId: string; now: number },
): Promise<void> {
  if (!db) return;
  const detail = JSON.stringify({ errors: f.errors.slice(0, 20).map((e) => e.slice(0, 300)), dataThrough: f.dataThrough ?? null });
  await db.batch(cell.farmIds.map((farmId) => db.prepare(attemptSql).bind(farmId, f.now, f.outcome, detail, null, f.instanceId, f.trigger)));
}

export interface FarmStatus {
  farmId: string;
  name: string;
  gridKey: string;
  /** fresh/stale = accepted snapshot judged by its data-through date; error = last refresh failed (last snapshot still served); never = no snapshot yet. */
  state: "fresh" | "stale" | "error" | "never";
  snapshot: { id: string; dataThrough: string; ageDays: number | null; freshness: "fresh" | "stale" | "none"; retrievedAt: string; acceptedAt: string; confirmedAt: string; manifestUrl: string } | null;
  lastAttempt: { at: string; outcome: Outcome; errors: string[]; candidateId: string | null; instanceId: string | null; trigger: string } | null;
}

export async function farmStatuses(db: D1Database, farms: { id: string; name: string; gridKey: string }[], now: Date): Promise<FarmStatus[]> {
  const { results: current } = await db
    .prepare(
      `SELECT c.farm_id, c.snapshot_id, c.data_through, c.accepted_at, c.confirmed_at, s.retrieved_at
         FROM power_snapshot_current c JOIN power_snapshots s ON s.snapshot_id = c.snapshot_id`,
    )
    .all<{ farm_id: string; snapshot_id: string; data_through: string; accepted_at: number; confirmed_at: number; retrieved_at: number }>();
  const { results: attempts } = await db
    .prepare("SELECT farm_id, attempted_at, outcome, detail, candidate_id, instance_id, trigger FROM power_refresh_attempts")
    .all<{ farm_id: string; attempted_at: number; outcome: Outcome; detail: string; candidate_id: string | null; instance_id: string | null; trigger: string }>();
  const cur = new Map((current ?? []).map((r) => [r.farm_id, r]));
  const att = new Map((attempts ?? []).map((r) => [r.farm_id, r]));
  return farms.map((f) => {
    const c = cur.get(f.id);
    const a = att.get(f.id);
    const fr = freshness(c?.data_through ?? null, now);
    let errors: string[] = [];
    try {
      errors = a ? ((JSON.parse(a.detail) as { errors?: string[] }).errors ?? []) : [];
    } catch {
      errors = [];
    }
    const failed = a && (a.outcome === "rejected" || a.outcome === "error");
    const state: FarmStatus["state"] = !c ? (failed ? "error" : "never") : failed ? "error" : fr.state === "stale" ? "stale" : "fresh";
    return {
      farmId: f.id,
      name: f.name,
      gridKey: f.gridKey,
      state,
      snapshot: c
        ? {
            id: c.snapshot_id,
            dataThrough: c.data_through,
            ageDays: fr.ageDays,
            freshness: fr.state,
            retrievedAt: new Date(c.retrieved_at).toISOString(),
            acceptedAt: new Date(c.accepted_at).toISOString(),
            confirmedAt: new Date(c.confirmed_at).toISOString(),
            manifestUrl: `/api/refresh/snapshots/${c.snapshot_id}`,
          }
        : null,
      lastAttempt: a
        ? { at: new Date(a.attempted_at).toISOString(), outcome: a.outcome, errors, candidateId: a.candidate_id, instanceId: a.instance_id, trigger: a.trigger }
        : null,
    };
  });
}

export interface SnapshotRow {
  snapshot_id: string;
  content_hash: string;
  grid_key: string;
  data_through: string;
  retrieved_at: number;
  accepted_at: number;
  r2_key: string | null;
  r2_source_key: string | null;
  manifest: string;
}

export async function getSnapshotRow(db: D1Database, snapshotId: string): Promise<SnapshotRow | null> {
  return db
    .prepare("SELECT snapshot_id, content_hash, grid_key, data_through, retrieved_at, accepted_at, r2_key, r2_source_key, manifest FROM power_snapshots WHERE snapshot_id = ?1")
    .bind(snapshotId)
    .first<SnapshotRow>();
}

/** Accepted snapshot for a farm (for weekly/window checks): consumers must skip or explain when stale or missing. */
export async function acceptedSnapshotFor(db: D1Database, farmId: string, now: Date): Promise<{ snapshotId: string; dataThrough: string; freshness: "fresh" | "stale" | "none"; ageDays: number | null } | null> {
  const row = await db.prepare("SELECT snapshot_id, data_through FROM power_snapshot_current WHERE farm_id = ?1").bind(farmId).first<{ snapshot_id: string; data_through: string }>();
  if (!row) return null;
  const fr = freshness(row.data_through, now);
  return { snapshotId: row.snapshot_id, dataThrough: row.data_through, freshness: fr.state, ageDays: fr.ageDays };
}
