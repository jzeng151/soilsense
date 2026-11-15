# Document → Vectorize pipeline (contract)

Puts research documents into the cited-research index without hand-copying excerpts, while keeping the rule that **every quoted sentence can be checked against its source**.

```
Upload to R2 soilsense-docs under docs/
  → R2 event notification (object-create, prefix docs/) → Queue soilsense-docs
  → Queue consumer: one DocIngestWorkflow instance per object version (id from workflowInstanceId)
      1. read + hash        sha256 of the bytes; same bytes as the current version → stop ("unchanged")
      2. extract            Workers AI toMarkdown for PDF/HTML; md/txt read as-is. Saved to extracted/<sha>.md
      3. chunk + hash       chunks are exact slices [start, end) of the extracted text (CHUNKING)
      4. diff               chunk ids are content-addressed: chunks already indexed are kept, new ones are pending,
                            ones that disappeared are retired (vectors deleted after approval)
      5. wait for review    step.waitForEvent(REVIEW_EVENT, REVIEW_TIMEOUT). Nothing is searchable before this.
      6. embed              same model and preprocessing as the curated corpus (research/config.ts), via AI Gateway
      7. upsert             Vectorize ids docVectorId(chunkId, tag); metadata DocVectorMetadata (corpus = docs-v1)
      8. record             D1: ingest_docs / ingest_doc_versions / ingest_chunks (migration 0007)
```

**Review** (`POST /api/docs/:docId/review`, ADMIN_TOKEN): a person supplies the source metadata (title, URL, licence, attribution, applicability, crop tags) and approves or rejects. That sends the event to the waiting Workflow instance. A model never invents source metadata.

**Retrieval:** queries both corpora (the curated one and `docs-v1`). Pipeline passages are looked up in D1 by `chunk_id`, and each is shown with its source and applicability, exactly like the curated ones. A passage whose text no longer matches `extracted.slice(start, end)` is dropped.

## Bindings (added to wrangler.jsonc by track B)
| Binding | Type | Name |
|---|---|---|
| `DOCS` | R2 bucket | `soilsense-docs` |
| `DOC_QUEUE` | Queue consumer (and producer for retries) | `soilsense-docs` |
| `DOC_INGEST` | Workflow | `soilsense-doc-ingest`, class `DocIngestWorkflow` |

One-time account setup (done on the test account 2026-11-15):
```
npx wrangler r2 bucket create soilsense-docs
npx wrangler queues create soilsense-docs
npx wrangler r2 bucket notification create soilsense-docs --event-type object-create --queue soilsense-docs --prefix docs/
```

## API and operational checks

- `GET /api/docs` returns `{ docs }` (newest 200 documents). `GET /api/docs/:docId` returns `{ doc, versions, chunks }`; D1 field names and UTF-16 `[start_offset, end_offset)` offsets are preserved.
- `POST /api/docs/upload?name=paper.pdf` accepts a raw body, or multipart form field `file`; bearer `ADMIN_TOKEN` is required. The 10 MiB request cap includes multipart overhead. The upload response is HTTP 202 with `{ key, docId, eTag, size }`: it does **not** fabricate a Queue event or bypass the actual R2 notification. Poll the list for `pending_review`.
- `POST /api/docs/:docId/review` requires bearer `ADMIN_TOKEN` and JSON `ReviewDecision` from `src/shared/ingest.ts`. Approval requires every source field and at least one supported crop tag. Rejection requires only `decision`, `reviewer`, and optional `note`. The response is 202 after `sendEvent`; poll for the final status.
- The installed Workflows API is `step.waitForEvent("review", { type: REVIEW_EVENT, timeout: REVIEW_TIMEOUT })`; the decision is `event.payload`. The timeout is seven days. Rejection/timeout does not embed or upsert any chunks from the new version.
- Existing indexed chunks retain their offsets and embeddings until approval; approved kept chunks receive refreshed offsets, version metadata and crop tags without re-embedding when existing vectors are available. Retired/rejected pending chunks are never made searchable before approval. Vectorize mutations are asynchronous: allow propagation time before testing retrieval.
- Notifications are deduplicated by Workflow instance id. A delayed event whose ETag no longer matches R2 is marked superseded rather than ingesting newer bytes under an older event id. R2 does not retain historical object versions. Avoid concurrent edits to the same key during review/indexing; use different document names for independent uploads.
- Required before deployment: apply D1 migration `0007_doc_ingest.sql`, bind the existing bucket/queue/Workflow, configure `ADMIN_TOKEN`, and ensure the research index's `crop` / `corpus` metadata indexes exist (see `RESEARCH.md`). No dead-letter queue is configured; investigate Queue retry exhaustion in account monitoring.

### Coordinator live acceptance (not covered by dry-run or fake-binding tests)

On the test account where the bucket, queue and notification already exist, deploy only with coordinator approval. Upload one real PDF through the helper, verify **R2 object-create → Queue → Workflow**, verify extracted offsets against R2, approve with real licensed source metadata, and check Vectorize/D1 plus the retrieval UI after propagation. Also reject a second upload and verify no new vectors. This implementation's automated tests exercise fake AI/R2/Vectorize and SQLite-backed D1; they do not prove live notification delivery, PDF model availability or the seven-day runtime timeout.

## Ownership
| Track | Owns |
|---|---|
| B pipeline | `src/worker/ingest/{queue.ts,workflow.ts,store.ts}`, `src/worker/routes/docs.ts`, bindings, `index.ts` queue handler |
| C text | `src/worker/ingest/{extract.ts,chunk.ts,hash.ts,verify.ts}` (pure functions, no bindings) |
| D retrieval | `src/worker/research/retrieve.ts` changes, admin review page |
| A agent note | `src/worker/fieldwatch/` note module + its own component |

## Text extraction and chunk offsets

`src/worker/ingest/{hash,extract,chunk,verify}.ts` are pure helpers; they do not read bindings or write storage. `extractText` accepts the AI instance explicitly only for PDF conversion. The installed Workers types and [Cloudflare binding documentation](https://developers.cloudflare.com/workers-ai/features/markdown-conversion/usage/binding/) define `ai.toMarkdown([{ name, blob }])` as returning `ConversionResponse[]`; conversion failures have `format: "error"` and `error`, while successes contain `data`.

- Markdown/text are decoded as UTF-8, preserving whitespace and BOM. HTML is parsed locally with `htmlparser2`, removing scripts, styles, comments, and tags, decoding entities and inserting block/paragraph breaks. PDF text comes from Workers AI toMarkdown. Empty extraction is an error.
- After extraction, **only CRLF/CR line endings are normalized to LF**. The pipeline must save the returned `text` unchanged in R2. Every `start`/`end` is a JavaScript UTF-16 index into that exact normalized text, not a byte offset or an offset into the source HTML/PDF.
- Chunks pack adjacent paragraphs while the complete source slice fits `CHUNKING.maxChars`. Oversized paragraphs prefer sentence boundaries, then hard cuts (without bisecting a surrogate pair). Trimming moves offsets rather than rewriting text. Short partial chunks and chunks with over 60% numeric/punctuation/symbol content (ignoring whitespace) are omitted. Numeric answers come from D1, not semantic search.
- Identical chunk text within one document is emitted once, at its first qualifying span. Chunk ids depend on document id and chunk text hash, not version hash or offsets. Unchanged text keeps its id when its chunk boundaries remain unchanged; greedy packing is not edit-local and an edit can change adjacent chunk boundaries.
- `verifyChunk` rejects invalid/coerced/out-of-range offsets as well as any text mismatch. `diffChunks` keeps matching pending/indexed ids, adds only ids absent from **all** existing rows, and retires disappeared pending/indexed ids. A matching retired row is neither kept nor re-added; reactivation policy belongs to the pipeline, not this helper.

Offline tests and the attributed, source-verified K-State excerpt live in `test/ingest-text.test.ts` and `test/fixtures/ingest/`. The real account-backed PDF conversion check is left to the coordinator; these tests mock only the Workers AI boundary and do not access the account.
