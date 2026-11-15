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

## Ownership
| Track | Owns |
|---|---|
| B pipeline | `src/worker/ingest/{queue.ts,workflow.ts,store.ts}`, `src/worker/routes/docs.ts`, bindings, `index.ts` queue handler |
| C text | `src/worker/ingest/{extract.ts,chunk.ts,hash.ts,verify.ts}` (pure functions, no bindings) |
| D retrieval | `src/worker/research/retrieve.ts` changes, admin review page |
| A agent note | `src/worker/fieldwatch/` note module + its own component |
