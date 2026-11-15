import { ACCEPTED_EXTENSIONS, DOCS_LAYOUT, docIdFromKey, workflowInstanceId, type R2EventMessage } from "../../shared/ingest";
import type { Env } from "../env";
import { sha256Hex } from "./hash";

export function acceptedKey(key: string): boolean {
  return key.startsWith(DOCS_LAYOUT.uploadPrefix) && ACCEPTED_EXTENSIONS.some((ext) => key.toLowerCase().endsWith(ext));
}

/** R2 notifications are at-least-once; the deterministic Workflow id is the deduplication key. */
export async function queue(batch: MessageBatch<unknown>, env: Env): Promise<void> {
  for (const message of batch.messages) {
    try {
      const body = (typeof message.body === "string" ? JSON.parse(message.body) : message.body) as R2EventMessage | null;
      if (!body || typeof body.object?.key !== "string" || !acceptedKey(body.object.key) || body.bucket !== "soilsense-docs" || !["PutObject", "CopyObject", "CompleteMultipartUpload"].includes(body.action)) {
        message.ack();
        continue;
      }
      if (!env.DOC_INGEST) throw new Error("DOC_INGEST binding required");
      const docId = docIdFromKey(await sha256Hex(body.object.key));
      try {
        await env.DOC_INGEST.create({
          id: workflowInstanceId(docId, body.object.eTag ?? null, body.eventTime),
          params: { bucket: body.bucket, key: body.object.key, eTag: body.object.eTag ?? null, size: body.object.size ?? null, eventTime: body.eventTime },
        });
      } catch (error) {
        if (!/already exists|already_exists|instance.*exists/i.test(String(error))) throw error;
      }
      message.ack();
    } catch (error) {
      console.warn(JSON.stringify({ msg: "document notification retry", error: String(error) }));
      message.retry();
    }
  }
}
