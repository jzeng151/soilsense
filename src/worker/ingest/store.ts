import { DOCS_LAYOUT, INGEST_VERSION, type ChunkStatus, type DocChunk, type DocStatus, type ReviewDecision } from "../../shared/ingest";

export interface DocRow {
  doc_id: string; r2_key: string; latest_sha256: string | null; status: DocStatus; workflow_id: string | null;
  title: string | null; url: string | null; publisher: string | null; year: number | null; license: string | null;
  attribution: string | null; applicability: string | null; crops_json: string | null;
  reviewer: string | null; reviewed_at: string | null; review_note: string | null; error: string | null; updated_at: string;
}
export interface ChunkRow {
  chunk_id: string; doc_id: string; doc_sha256: string; chunk_sha256: string;
  start_offset: number; end_offset: number; text: string; status: ChunkStatus; vector_ids_json: string | null;
}
export const getDoc = (db: D1Database, id: string) => db.prepare("SELECT * FROM ingest_docs WHERE doc_id = ?").bind(id).first<DocRow>();
export async function getChunks(db: D1Database, id: string): Promise<ChunkRow[]> {
  return (await db.prepare("SELECT * FROM ingest_chunks WHERE doc_id = ? ORDER BY start_offset, chunk_id").bind(id).all<ChunkRow>()).results;
}
/** D1 deliberately preserves old indexed offsets during review. The manifest is the
 * authoritative current-version chunk set (including kept ids at their new offsets).
 */
export async function getReviewChunks(db: D1Database, bucket: R2Bucket, doc: DocRow): Promise<ChunkRow[]> {
  if (!doc.latest_sha256) throw new Error("Current document version missing");
  const object = await bucket.get(DOCS_LAYOUT.manifest(doc.latest_sha256, doc.doc_id))
    ?? await bucket.get(DOCS_LAYOUT.manifest(doc.latest_sha256));
  if (!object) throw new Error("Current document manifest missing");
  const manifest = JSON.parse(await object.text()) as { docId: string; sha256: string; chunks: DocChunk[] };
  if (manifest.docId !== doc.doc_id || manifest.sha256 !== doc.latest_sha256 || !Array.isArray(manifest.chunks)) throw new Error("Current document manifest mismatch");
  const rows = new Map((await getChunks(db, doc.doc_id)).map((c) => [c.chunk_id, c]));
  return manifest.chunks.map((c) => {
    if (c.docId !== doc.doc_id || c.docSha256 !== doc.latest_sha256) throw new Error("Current chunk version mismatch");
    const row = rows.get(c.id);
    return { chunk_id: c.id, doc_id: c.docId, doc_sha256: c.docSha256, chunk_sha256: c.sha256,
      start_offset: c.start, end_offset: c.end, text: c.text,
      status: row?.status ?? "pending", vector_ids_json: row?.vector_ids_json ?? null };
  });
}
export async function assertCurrent(db: D1Database, id: string, instanceId: string): Promise<void> {
  if ((await getDoc(db, id))?.workflow_id !== instanceId) throw new Error("document workflow superseded");
}
export async function receive(db: D1Database, id: string, key: string, sha: string, instanceId: string): Promise<void> {
  await db.prepare(`INSERT INTO ingest_docs (doc_id,r2_key,latest_sha256,status,workflow_id,updated_at)
    VALUES (?,?,?,'received',?,?) ON CONFLICT(doc_id) DO UPDATE SET latest_sha256=excluded.latest_sha256,
    status='received',workflow_id=excluded.workflow_id,error=NULL,updated_at=excluded.updated_at`).bind(id,key,sha,instanceId,new Date().toISOString()).run();
}
export async function setStatus(db: D1Database, id: string, instanceId: string, status: DocStatus, error: string | null = null): Promise<void> {
  await db.prepare("UPDATE ingest_docs SET status=?, error=?, updated_at=? WHERE doc_id=? AND workflow_id=?")
    .bind(status,error,new Date().toISOString(),id,instanceId).run();
}
export async function recordError(db: D1Database, id: string, key: string, instanceId: string, error: string): Promise<void> {
  await db.prepare(`INSERT INTO ingest_docs (doc_id,r2_key,status,workflow_id,error,updated_at)
    VALUES (?,?,'error',?,?,?) ON CONFLICT(doc_id) DO UPDATE SET status='error',error=excluded.error,updated_at=excluded.updated_at
    WHERE ingest_docs.workflow_id=excluded.workflow_id`).bind(id,key,instanceId,error,new Date().toISOString()).run();
}
export async function saveVersion(db: D1Database, v: { id: string; sha: string; size: number; contentType: string; method: string; extractedKey: string; chars: number; receivedAt: string }): Promise<void> {
  await db.prepare(`INSERT INTO ingest_doc_versions (doc_id,sha256,size,content_type,extraction,extracted_key,extracted_chars,ingest_version,received_at)
    VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(doc_id,sha256) DO NOTHING`)
    .bind(v.id,v.sha,v.size,v.contentType,v.method,v.extractedKey,v.chars,INGEST_VERSION,v.receivedAt).run();
}
export function chunkStatement(db: D1Database, c: DocChunk, status: "pending" | "indexed" | "excluded", vectors: string[] | null): D1PreparedStatement {
  const now = new Date().toISOString();
  return db.prepare(`INSERT INTO ingest_chunks (chunk_id,doc_id,doc_sha256,chunk_sha256,start_offset,end_offset,text,status,vector_ids_json,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(chunk_id) DO UPDATE SET doc_sha256=excluded.doc_sha256,chunk_sha256=excluded.chunk_sha256,
    start_offset=excluded.start_offset,end_offset=excluded.end_offset,text=excluded.text,status=excluded.status,
    vector_ids_json=excluded.vector_ids_json,updated_at=excluded.updated_at`)
    .bind(c.id,c.docId,c.docSha256,c.sha256,c.start,c.end,c.text,status,vectors ? JSON.stringify(vectors) : null,now,now);
}
export async function recordReview(db: D1Database, id: string, instanceId: string, review: ReviewDecision): Promise<void> {
  const s = review.source;
  await db.prepare(`UPDATE ingest_docs SET status=?,title=?,url=?,publisher=?,year=?,license=?,attribution=?,applicability=?,
    crops_json=?,reviewer=?,reviewed_at=?,review_note=?,updated_at=? WHERE doc_id=? AND workflow_id=?`)
    .bind(review.decision === "approve" ? "approved" : "rejected",s?.title ?? null,s?.url ?? null,s?.publisher ?? null,s?.year ?? null,
      s?.license ?? null,s?.attribution ?? null,s?.applicability ?? null,review.crops ? JSON.stringify(review.crops) : null,
      review.reviewer,new Date().toISOString(),review.note ?? null,new Date().toISOString(),id,instanceId).run();
}
