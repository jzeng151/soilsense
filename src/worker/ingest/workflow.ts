import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { DOCS_CORPUS, DOCS_LAYOUT, INGEST_VERSION, REVIEW_EVENT, REVIEW_TIMEOUT, docIdFromKey, docVectorId, type DocIngestParams, type DocVectorMetadata, type ReviewDecision } from "../../shared/ingest";
import type { Env } from "../env";
import { embed } from "../research/retrieve";
import { validReview } from "../routes/docs";
import { sha256Hex } from "./hash";
import { extractText } from "./extract";
import { chunkText } from "./chunk";
import { diffChunks, verifyChunk } from "./verify";
import { assertCurrent, chunkStatement, getChunks, getDoc, receive, recordError, recordReview, saveVersion, setStatus } from "./store";
import type { StepConfig } from "../refresh/workflow";

export interface DocStepRunner {
  do<T>(name: string, config: StepConfig, callback: () => Promise<T>): Promise<T>;
  waitForEvent(name: string, options: { type: string; timeout: typeof REVIEW_TIMEOUT }): Promise<{ payload: unknown }>;
}
const IO = { retries: { limit: 3, delay: "5 seconds", backoff: "exponential" }, timeout: "5 minutes" } satisfies StepConfig;
const PURE = { retries: { limit: 0, delay: 0 }, timeout: "1 minute" } satisfies StepConfig;

/** Production entry point is deliberately thin; this function exercises the same durable steps in tests. */
export async function runDocIngest(env: Env, step: DocStepRunner, params: DocIngestParams, instanceId: string): Promise<{ outcome: string; docId: string }> {
  if (!env.DB || !env.DOCS) throw new Error("DB and DOCS bindings required");
  const db = env.DB, bucket = env.DOCS;
  const docId = docIdFromKey(await sha256Hex(params.key));
  try {
    const read = await step.do("read and hash", IO, async () => {
      const object = await bucket.get(params.key);
      if (!object) throw new Error("Uploaded object missing");
      // R2 has no historical reads: never ingest newer bytes under an old notification's identity.
      if (params.eTag && object.etag !== params.eTag.replace(/^\"|\"$/g, "")) return { stale: true, sha: "", unchanged: false, size: 0, contentType: "" };
      if (object.size > 10 * 1024 * 1024) throw new Error("Upload exceeds 10 MB");
      const bytes = await object.arrayBuffer();
      const sha = await sha256Hex(bytes);
      const previous = await getDoc(db, docId);
      return { stale: false, sha, unchanged: previous?.latest_sha256 === sha, size: bytes.byteLength, contentType: object.httpMetadata?.contentType ?? "application/octet-stream" };
    });
    if (read.stale || read.unchanged) return { outcome: read.stale ? "superseded" : "unchanged", docId };
    await step.do("record received", IO, async () => {
      await receive(db, docId, params.key, read.sha, instanceId);
      return null;
    });
    const extraction = await step.do("extract", IO, async () => {
      await assertCurrent(db, docId, instanceId);
      const object = await bucket.get(params.key);
      if (!object) throw new Error("Uploaded object missing");
      const bytes = await object.arrayBuffer();
      if (await sha256Hex(bytes) !== read.sha) throw new Error("Upload changed during extraction; await its new notification");
      const result = await extractText(env.AI, bytes, params.key, read.contentType, { gatewayId: env.AI_GATEWAY_ID, db: env.DB });
      if (!result.text.trim()) throw new Error("Document has no extractable text");
      const key = DOCS_LAYOUT.extracted(read.sha, docId);
      await bucket.put(key, result.text, { httpMetadata: { contentType: "text/plain; charset=utf-8" } });
      await saveVersion(db, { id: docId, sha: read.sha, size: read.size, contentType: read.contentType, method: result.method, extractedKey: key, chars: result.text.length, receivedAt: params.eventTime });
      await setStatus(db, docId, instanceId, "extracted");
      return { method: result.method, key, chars: result.text.length, converterPreamble: result.converterPreamble ?? { removed: false, chars: 0 }, plainTextConversion: result.plainTextConversion ?? null };
    });
    // Large text/embedding arrays stay in R2/D1, not Workflow step outputs (1 MiB limit).
    const loadChunks = async () => {
      const object = await bucket.get(extraction.key);
      if (!object) throw new Error("Extracted object missing");
      const text = await object.text();
      const chunks = await chunkText(text, docId, read.sha);
      if (!chunks.length || chunks.some((c) => !verifyChunk(c, text))) throw new Error("Chunk offsets do not match extracted source");
      return chunks;
    };
    const plan = await step.do("chunk verify and diff", PURE, async () => {
      await assertCurrent(db, docId, instanceId);
      const chunks = await loadChunks();
      const delta = diffChunks(chunks, await getChunks(db, docId));
      return { keep: delta.keep.length, add: delta.add.length, retire: delta.retire.length, ids: chunks.map((c) => c.id) };
    });
    await step.do("stage pending chunks", IO, async () => {
      await assertCurrent(db, docId, instanceId);
      // Do not overwrite offsets/status of still-searchable chunks until approval.
      const existing = new Map((await getChunks(db, docId)).map((c) => [c.chunk_id, c.status]));
      for (const c of await loadChunks()) {
        if (existing.get(c.id) !== "indexed") await chunkStatement(db, c, "pending", null).run();
      }
      return null;
    });
    const manifest = async (status: string, review?: ReviewDecision) => {
      const chunks = await loadChunks();
      const excluded = new Set(review?.decision === "approve" ? review.excludeChunkIds ?? [] : []);
      const reviewedChunks = chunks.map((chunk) => ({ ...chunk, status: excluded.has(chunk.id) ? "excluded" : status === "indexed" ? "indexed" : "pending" }));
      await bucket.put(DOCS_LAYOUT.manifest(read.sha, docId), JSON.stringify({ docId, sha256: read.sha, key: params.key, ingestVersion: INGEST_VERSION, extraction: extraction.method, converterPreamble: extraction.converterPreamble, plainTextConversion: extraction.plainTextConversion, extractedKey: extraction.key, status, source: review?.source ?? null, review: review ?? null, chunks: reviewedChunks, diff: plan }), { httpMetadata: { contentType: "application/json" } });
    };
    await step.do("pending review", IO, async () => {
      await assertCurrent(db, docId, instanceId);
      await manifest("pending_review");
      await setStatus(db, docId, instanceId, "pending_review");
      return null;
    });
    let review: ReviewDecision;
    try {
      // Installed workers-types: waitForEvent(name, {type, timeout}) -> WorkflowStepEvent<T>.
      const event = await step.waitForEvent("review", { type: REVIEW_EVENT, timeout: REVIEW_TIMEOUT });
      if (!validReview(event.payload, plan.ids)) throw new Error("Invalid review event or foreign chunk exclusions");
      review = event.payload.decision === "reject"
        ? { decision: "reject", reviewer: event.payload.reviewer, ...(event.payload.note !== undefined ? { note: event.payload.note } : {}) }
        : event.payload;
    } catch (error) {
      await step.do("review timeout", IO, async () => {
        await setStatus(db, docId, instanceId, "error", `Review timed out or failed: ${String(error)}`);
        await manifest("error");
        return null;
      });
      return { outcome: "error", docId };
    }
    if (!validReview(review, plan.ids)) throw new Error("Invalid review event");
    await step.do("record review", IO, async () => {
      await assertCurrent(db, docId, instanceId);
      await recordReview(db, docId, instanceId, review);
      await manifest(review.decision === "approve" ? "approved" : "rejected", review);
      return null;
    });
    if (review.decision === "reject") return { outcome: "rejected", docId };
    if (!env.AI || !env.RESEARCH_INDEX) throw new Error("AI and RESEARCH_INDEX bindings required");
    const ai = env.AI, index = env.RESEARCH_INDEX, crops = review.crops!;
    const excluded = new Set(review.excludeChunkIds ?? []);
    // Bound step count for multi-megabyte uploads. A failed batch replays stable vector ids / SQL upserts.
    for (let offset = 0; offset < plan.ids.length; offset += 64) {
      const ids = plan.ids.slice(offset, offset + 64);
      await step.do(`embed and upsert batch ${offset / 64}`, IO, async () => {
        await assertCurrent(db, docId, instanceId);
        const chunks = new Map((await loadChunks()).map((chunk) => [chunk.id, chunk]));
        const existing = new Map((await getChunks(db, docId)).map((chunk) => [chunk.chunk_id, chunk]));
        for (const id of ids) {
          const chunk = chunks.get(id)!;
          const oldIds = JSON.parse(existing.get(id)?.vector_ids_json ?? "[]") as string[];
          if (excluded.has(id)) {
            // A kept chunk may still have vectors from the previous approved version.
            // Delete before clearing their durable ids, so a retry can finish deletion.
            await assertCurrent(db, docId, instanceId);
            if (oldIds.length) await index.deleteByIds(oldIds);
            await chunkStatement(db, chunk, "excluded", []).run();
            continue;
          }
          // Kept chunks retain embeddings, but refresh version metadata and reviewer-selected crop tags.
          const old = oldIds.length ? await index.getByIds(oldIds) : [];
          const values = old[0]?.values ?? (await embed(ai, [chunk.text], env.AI_GATEWAY_ID, { db: env.DB, corpusEmbedding: true, feature: "document-embedding" }))[0]!;
          const vectors = crops.map((crop) => {
            const metadata: DocVectorMetadata = { crop, corpus: DOCS_CORPUS, chunk_id: id, source_id: docId, doc_sha256: read.sha };
            return { id: docVectorId(id, crop), values: Array.from(values), metadata };
          });
          await assertCurrent(db, docId, instanceId);
          await index.upsert(vectors);
          const removed = oldIds.filter((v) => !vectors.some((next) => next.id === v));
          if (removed.length) await index.deleteByIds(removed);
          await chunkStatement(db, chunk, "indexed", vectors.map((v) => v.id)).run();
        }
        return null;
      });
    }
    await step.do("retire removed chunks", IO, async () => {
      await assertCurrent(db, docId, instanceId);
      for (const c of await getChunks(db, docId)) {
        if (plan.ids.includes(c.chunk_id)) continue;
        const ids = JSON.parse(c.vector_ids_json ?? "[]") as string[];
        if (ids.length) await index.deleteByIds(ids);
        await db.prepare("UPDATE ingest_chunks SET status='retired', updated_at=? WHERE chunk_id=?").bind(new Date().toISOString(),c.chunk_id).run();
      }
      return null;
    });
    await step.do("record indexed", IO, async () => {
      await assertCurrent(db, docId, instanceId);
      await manifest("indexed", review);
      await setStatus(db, docId, instanceId, "indexed");
      return null;
    });
    return { outcome: "indexed", docId };
  } catch (error) {
    await step.do("record error", IO, async () => {
      const message = String(error).slice(0, 2000);
      await recordError(db, docId, params.key, instanceId, message);
      const current = await getDoc(db, docId);
      if (current?.workflow_id === instanceId && current.latest_sha256) {
        const key = DOCS_LAYOUT.manifest(current.latest_sha256, docId);
        const saved = await bucket.get(key);
        if (saved) {
          const manifest = JSON.parse(await saved.text()) as Record<string, unknown>;
          await bucket.put(key, JSON.stringify({ ...manifest, status: "error", error: message }), { httpMetadata: { contentType: "application/json" } });
        }
      }
      return null;
    });
    throw error;
  }
}
export class DocIngestWorkflow extends WorkflowEntrypoint<Env, DocIngestParams> {
  override async run(event: Readonly<WorkflowEvent<DocIngestParams>>, step: WorkflowStep) {
    return runDocIngest(this.env, step, event.payload, event.instanceId);
  }
}
