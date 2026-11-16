import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { DOCS_LAYOUT, REVIEW_EVENT, docIdFromKey, type ReviewDecision } from "../../shared/ingest";
import type { Env } from "../env";
import { acceptedKey } from "../ingest/queue";
import { sha256Hex } from "../ingest/hash";
import { documentFromUrl, UrlIntakeError } from "../ingest/from-url";
import { getChunks, getDoc, getReviewChunks } from "../ingest/store";
import { isResearchTag } from "../research/config";

/** Used again inside the Workflow: even directly sent events must pass the human-review contract. */
export function validReview(value: unknown, currentChunkIds?: readonly string[]): value is ReviewDecision {
  if (!value || typeof value !== "object") return false;
  const r = value as ReviewDecision;
  if (r.excludeChunkIds !== undefined) {
    if (!Array.isArray(r.excludeChunkIds) || !r.excludeChunkIds.every((id) => typeof id === "string" && id.length > 0 && id.length <= 200)
      || new Set(r.excludeChunkIds).size !== r.excludeChunkIds.length) return false;
    if (currentChunkIds) {
      const current = new Set(currentChunkIds);
      if (!r.excludeChunkIds.every((id) => current.has(id))) return false;
    }
  }
  if (typeof r.reviewer !== "string" || !r.reviewer.trim() || r.reviewer.length > 300 || (r.note !== undefined && (typeof r.note !== "string" || r.note.length > 4000))) return false;
  if (r.decision === "reject") return true;
  if (r.decision !== "approve" || !r.source || !Array.isArray(r.crops) || !r.crops.length || r.crops.length > 8 || !r.crops.every(isResearchTag) || new Set(r.crops).size !== r.crops.length) return false;
  const s = r.source;
  if (![s.title,s.url,s.publisher,s.license,s.attribution,s.applicability].every((v) => typeof v === "string" && v.trim().length > 0 && v.length <= 4000)) return false;
  try { if (!["https:", "http:"].includes(new URL(s.url).protocol)) return false; } catch { return false; }
  return Number.isInteger(s.year) && s.year >= 1000 && s.year <= 9999;
}
function adminOk(header: string | undefined, token: string | undefined): boolean {
  if (!token || !header || !/^Bearer\s+/i.test(header)) return false;
  const given = header.replace(/^Bearer\s+/i, "");
  if (given.length !== token.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ token.charCodeAt(i);
  return diff === 0;
}
export const docs = new Hono<{ Bindings: Env }>();
// Lists and review chunks are operator-only too: pending uploads are not public research.
docs.use("*", async (c, next) => {
  if (!c.env.ADMIN_TOKEN) return c.json({ error: "Set ADMIN_TOKEN first" }, 403);
  if (!adminOk(c.req.header("Authorization"), c.env.ADMIN_TOKEN)) return c.json({ error: "unauthorized" }, 401);
  return next();
});
docs.post("/upload", bodyLimit({ maxSize: 10 * 1024 * 1024, onError: (c) => c.json({ error: "Upload exceeds 10 MB" }, 413) }), async (c) => {
  if (!c.env.DOCS) return c.json({ error: "DOCS binding required" }, 503);
  let name: string, bytes: ArrayBuffer, contentType: string;
  if (c.req.header("Content-Type")?.startsWith("multipart/form-data")) {
    const form = await c.req.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) return c.json({ error: "multipart file required" }, 400);
    name = file.name; bytes = await file.arrayBuffer(); contentType = file.type;
  } else {
    name = c.req.query("name") ?? ""; bytes = await c.req.arrayBuffer(); contentType = c.req.header("Content-Type") ?? "application/octet-stream";
  }
  const safe = name.replace(/\\/g, "/").split("/").pop()!.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 180);
  const key = DOCS_LAYOUT.uploadPrefix + safe;
  if (!safe || !acceptedKey(key) || !bytes.byteLength) return c.json({ error: "Nonempty pdf/html/htm/md/txt file required" }, 400);
  if (bytes.byteLength > 10 * 1024 * 1024) return c.json({ error: "Upload exceeds 10 MB" }, 413);
  const object = await c.env.DOCS.put(key, bytes, { httpMetadata: { contentType } });
  return c.json({ key, docId: docIdFromKey(await sha256Hex(key)), eTag: object?.etag, size: bytes.byteLength, status: "queued", note: "R2 object-create notification starts ingestion asynchronously" }, 202);
});
docs.post("/from-url", bodyLimit({ maxSize: 4096 }), async (c) => {
  if (!c.env.DOCS) return c.json({ error: "DOCS binding required" }, 503);
  const body: unknown = await c.req.json().catch(() => null);
  if (!body || typeof body !== "object" || !("url" in body)) return c.json({ error: "JSON url required" }, 400);
  try {
    const result = await documentFromUrl(c.env, body.url);
    return c.json({ ...result, docId: docIdFromKey(await sha256Hex(result.key)), status: "queued" }, 202);
  } catch (error) {
    if (error instanceof UrlIntakeError) return c.json({ error: error.message }, error.status);
    return c.json({ error: "Document retrieval or rendering failed; retry or upload a copy" }, 502);
  }
});
docs.get("/", async (c) => {
  if (!c.env.DB) return c.json({ error: "DB binding required" }, 503);
  const rows = await c.env.DB.prepare("SELECT * FROM ingest_docs ORDER BY updated_at DESC LIMIT 200").all();
  return c.json({ docs: rows.results });
});
docs.get("/:docId", async (c) => {
  if (!c.env.DB) return c.json({ error: "DB binding required" }, 503);
  const doc = await getDoc(c.env.DB, c.req.param("docId"));
  if (!doc) return c.json({ error: "Document not found" }, 404);
  const versions = await c.env.DB.prepare("SELECT * FROM ingest_doc_versions WHERE doc_id=? ORDER BY received_at DESC").bind(doc.doc_id).all();
  if (doc.status === "pending_review" && !c.env.DOCS) return c.json({ error: "DOCS binding required for current review chunks" }, 503);
  const chunks = doc.status === "pending_review"
    ? await getReviewChunks(c.env.DB, c.env.DOCS!, doc)
    : await getChunks(c.env.DB, doc.doc_id);
  let provenance: unknown = null;
  if (c.env.DOCS && doc.latest_sha256) {
    const manifest = await c.env.DOCS.get(DOCS_LAYOUT.manifest(doc.latest_sha256, doc.doc_id));
    if (manifest) provenance = (JSON.parse(await manifest.text()) as { provenance?: unknown }).provenance ?? null;
  }
  return c.json({ doc, versions: versions.results, chunks, provenance });
});
docs.post("/:docId/review", bodyLimit({ maxSize: 32 * 1024 }), async (c) => {
  if (!c.env.DB || !c.env.DOC_INGEST) return c.json({ error: "DB and DOC_INGEST bindings required" }, 503);
  const payload: unknown = await c.req.json().catch(() => null);
  if (!validReview(payload)) return c.json({ error: "Invalid review: reviewer, decision, and (for approval) complete source metadata and supported crops required" }, 400);
  const doc = await getDoc(c.env.DB, c.req.param("docId"));
  if (!doc) return c.json({ error: "Document not found" }, 404);
  if (doc.status !== "pending_review" || !doc.workflow_id) return c.json({ error: "Document is not waiting for review" }, 409);
  if (payload.excludeChunkIds?.length) {
    if (!c.env.DOCS) return c.json({ error: "DOCS binding required to validate exclusions" }, 503);
    const chunks = await getReviewChunks(c.env.DB, c.env.DOCS, doc);
    if (!validReview(payload, chunks.map((chunk) => chunk.chunk_id))) return c.json({ error: "Excluded chunk ids must belong to this document's current version" }, 400);
  }
  const instance = await c.env.DOC_INGEST.get(doc.workflow_id);
  await instance.sendEvent({ type: REVIEW_EVENT, payload });
  return c.json({ ok: true, docId: doc.doc_id, workflowId: doc.workflow_id, decision: payload.decision }, 202);
});
