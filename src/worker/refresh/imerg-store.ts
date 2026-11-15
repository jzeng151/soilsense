import type { Env } from "../env";
import type { Subset } from "../imerg/client";
import { IMERG_POLICY, imergFreshness, type ImergCell, type ImergVerdict } from "./imerg-snapshot";
import type { RefreshTrigger } from "./store";
const attemptSql = `INSERT INTO imerg_refresh_attempts(farm_id,attempted_at,outcome,detail,instance_id,trigger) VALUES (?1,?2,?3,?4,?5,?6)
 ON CONFLICT(farm_id) DO UPDATE SET attempted_at=excluded.attempted_at,outcome=excluded.outcome,detail=excluded.detail,instance_id=excluded.instance_id,trigger=excluded.trigger WHERE excluded.attempted_at >= imerg_refresh_attempts.attempted_at`;
export async function recordImergFailure(env: Env, cell: ImergCell, outcome: "error" | "rejected", errors: string[], instanceId: string, trigger: RefreshTrigger, now: number) {
  if (!env.DB) return;
  await env.DB.batch(cell.farmIds.map((id) => env.DB!.prepare(attemptSql).bind(id, now, outcome, JSON.stringify({ errors }), instanceId, trigger)));
}
export async function publishImerg(env: Env, cell: ImergCell, verdict: Extract<ImergVerdict, { ok: true }>, source: Subset, instanceId: string, trigger: RefreshTrigger, now: number) {
  if (!env.DB || !env.EVIDENCE) throw new Error("IMERG publication requires D1 and R2; last accepted snapshot kept");
  const db = env.DB, { content, contentHash, snapshotId } = verdict;
  const old = await db.prepare("SELECT retrieved_at FROM imerg_snapshots WHERE content_hash = ?1").bind(contentHash).first<{ retrieved_at: number }>();
  const base = `public/imerg-late/v1/${contentHash}`, bundle = `${base}/bundle.json`, raw = `${base}/source.json`;
  const retrievedAt = old ? new Date(old.retrieved_at).toISOString() : source.retrievedAt;
  const manifest = { snapshotId, contentHash, product: content.product, stream: content.stream, grid: content.grid, units: content.units, timeStandard: content.timeStandard, observationPeriod: { start: content.start, end: content.dataThrough }, dataThrough: content.dataThrough, retrievedAt, attribution: source.attribution, source: source.source, sourceUrls: source.observations.map((d) => d.sourceUrl), validation: { policy: IMERG_POLICY, passed: true }, replacementPolicy: content.replacementPolicy, objects: { bundle, source: raw } };
  if (!await env.EVIDENCE.head(bundle)) {
    await env.EVIDENCE.put(raw, JSON.stringify(source), { httpMetadata: { contentType: "application/json" } });
    await env.EVIDENCE.put(bundle, JSON.stringify({ manifest, snapshot: content }), { httpMetadata: { contentType: "application/json", cacheControl: "public,max-age=31536000,immutable" } });
  }
  const outcome = old ? "unchanged" : "published";
  const statements = [db.prepare(`INSERT OR IGNORE INTO imerg_snapshots(snapshot_id,content_hash,grid_key,period_start,data_through,retrieved_at,accepted_at,r2_key,r2_source_key,manifest) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)`).bind(snapshotId, contentHash, cell.key, content.start, content.dataThrough, Date.parse(retrievedAt), now, bundle, raw, JSON.stringify(manifest))];
  for (const id of cell.farmIds) {
    statements.push(db.prepare(`INSERT INTO imerg_snapshot_current(farm_id,snapshot_id,grid_key,data_through,accepted_at,confirmed_at) VALUES (?1,?2,?3,?4,?5,?5)
      ON CONFLICT(farm_id) DO UPDATE SET snapshot_id=excluded.snapshot_id,grid_key=excluded.grid_key,data_through=excluded.data_through,
       accepted_at=CASE WHEN imerg_snapshot_current.snapshot_id=excluded.snapshot_id THEN imerg_snapshot_current.accepted_at ELSE excluded.accepted_at END,confirmed_at=excluded.confirmed_at
      WHERE excluded.data_through > imerg_snapshot_current.data_through OR (excluded.data_through = imerg_snapshot_current.data_through AND excluded.confirmed_at >= imerg_snapshot_current.confirmed_at)`).bind(id, snapshotId, cell.key, content.dataThrough, now));
    statements.push(db.prepare(attemptSql).bind(id, now, outcome, JSON.stringify({ candidateId: snapshotId, dataThrough: content.dataThrough }), instanceId, trigger));
    statements.push(db.prepare(`INSERT OR IGNORE INTO imerg_snapshot_events(farm_id,snapshot_id,data_through,accepted_at,stream)
      SELECT farm_id,snapshot_id,data_through,accepted_at,'current-late' FROM imerg_snapshot_current WHERE farm_id=?1 AND snapshot_id=?2`).bind(id, snapshotId));
  }
  await db.batch(statements);
  return { outcome, snapshotId, dataThrough: content.dataThrough };
}
/** Weekly/window consumers use this gate, not retrievedAt. No IMERG alert/decision rule is added. */
export async function acceptedImergFor(db: D1Database, farmId: string, now: Date) {
  const row = await db.prepare("SELECT snapshot_id, data_through FROM imerg_snapshot_current WHERE farm_id=?1").bind(farmId).first<{ snapshot_id: string; data_through: string }>();
  if (!row) return { usable: false, reason: "No accepted IMERG Late snapshot", snapshot: null };
  const freshness = imergFreshness(row.data_through, now);
  return { usable: freshness.state === "fresh", reason: freshness.state === "fresh" ? null : "IMERG observations are stale; skip optional evidence", snapshot: { id: row.snapshot_id, dataThrough: row.data_through, ...freshness } };
}
