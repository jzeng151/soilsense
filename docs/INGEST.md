# Document → Vectorize pipeline (contract)

Puts research documents into the cited-research index without hand-copying excerpts, while keeping the rule that **every quoted sentence can be checked against its source**.

```
Upload to R2 soilsense-docs under docs/
  → R2 event notification (object-create, prefix docs/) → Queue soilsense-docs
  → Queue consumer: one DocIngestWorkflow instance per object version (id from workflowInstanceId)
      1. read + hash        sha256 of the bytes; same bytes as the current version → stop ("unchanged")
      2. extract            PDF: Workers AI toMarkdown → remove converter wrapper → plain text; HTML: local text parser
                            saved unchanged to extracted/ingest-v2/<docId>/<sha>.md (legacy keys remain readable)
      3. chunk + hash       chunks are exact slices [start, end) of the extracted text (CHUNKING)
      4. diff               chunk ids are content-addressed: chunks already indexed are kept, new ones are pending,
                            ones that disappeared are retired (vectors deleted after approval)
      5. wait for review    step.waitForEvent(REVIEW_EVENT, REVIEW_TIMEOUT). Nothing is searchable before this.
      6. embed              same model and preprocessing as the curated corpus (research/config.ts), via AI Gateway
      7. upsert             Vectorize ids docVectorId(chunkId, tag); metadata DocVectorMetadata (corpus = docs-v1)
      8. record             D1: ingest_docs / ingest_doc_versions / ingest_chunks (migration 0007)
```

**Review** (`POST /api/docs/:docId/review`, ADMIN_TOKEN): a person supplies the source metadata (title, URL, licence, attribution, applicability, crop tags) and approves or rejects. Approval may include `excludeChunkIds?: string[]` (default: none). Exclusions must be unique string ids from **this document's current version**, not another document or an obsolete chunk. The HTTP route validates against the current manifest, and the Workflow independently validates its current chunk plan. That sends the event to the waiting Workflow instance. A model never invents source metadata.

In `/#/admin/docs`, each current chunk shows its exact text, UTF-16 offsets, status, and an initially unchecked **Exclude from search** checkbox. Use exclusions for publisher boilerplate, recommended citations, or unreadable text. **Warning: possibly garbled text** is a review-only heuristic: at least two alphabetic tokens of ten or more letters with internal lower→upper case boundaries (for example `KansasAgricultural NewPrairie`). It can miss errors or flag legitimate names; it never repairs words or selects exclusions.

`ChunkStatus` is `pending | indexed | retired | excluded`. On approval, excluded chunks retain their exact text and offsets in D1 with `status='excluded'` and an empty vector-id list; they are never embedded or upserted in that approval. If a kept chunk had old vectors, those are deleted before their durable ids are cleared. Retrieval only accepts `indexed` chunks, so excluded text also fails closed during Vectorize propagation. The manifest records the decision and per-chunk status. Excluding all chunks is allowed (zero new vectors). Exclusions are per approval, not permanent rules: on a later changed upload the reviewer chooses again.

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

## Add a research document by URL

`POST /api/docs/from-url` accepts JSON `{ "url": "https://…" }` and requires bearer `ADMIN_TOKEN` (same gate as uploads). `DOCS` is required. The admin's URL form has English/Spanish labels and feedback, using the planner's saved language preference. A successful 202 means **R2 stored the document**, not that review/indexing finished. The existing R2 object-create → Queue → Workflow path is unchanged; there is no synthetic event or automatic approval in this route.

- Policy lives in the reviewed `RESEARCH_HOSTS` constant in `src/worker/ingest/from-url.ts`: K-State/`ksu.edu` subdomains and apexes, exact `newprairiepress.org` and `ksu.janeway.systems`, `extension.<university>.edu`, and USDA/NASA subdomains and apexes. Add a trusted host there only after reviewing it. No caller-supplied allow-list.
- HTTPS/443 only, no credentials, IP literals (including normalized numeric IPv4), malformed/trailing-dot names or unlisted hosts. Public A/AAAA answers are checked via Cloudflare DNS-over-HTTPS before **each** request; any private, loopback, link-local, mapped private IPv6, reserved or missing address fails closed. DNS errors fail closed. Only three same-host HTTPS redirects are followed, manually; cross-host redirects are rejected even when both hosts are allow-listed. No admin credentials/cookies are forwarded. The actual HTTPS connection is pinned to the validated numeric public IP via `cloudflare:sockets`; TLS `expectedServerHostname` authenticates the original research host. No second DNS lookup occurs between validation and connection, including on redirects. There is no unpinned fallback. Workers `node:https` is fetch-backed, and `cf.resolveOverride` cannot pin these third-party research hosts (it is restricted to the Worker's zone), so neither is used as a purported SSRF fix.
- Fetch/DNS deadline is 30 seconds across redirects. Direct HTTPS uses the `http-parser-js` streaming HTTP/1 parser (including chunked bodies), with a 32 KiB header cap and 1 MiB framing-overhead budget. Servers are asked for identity encoding; unexpected compression fails closed. The runtime may refuse raw TCP destinations (for example Cloudflare-owned addresses), in which case intake returns 502 and the operator can upload a copy; it never retries with unsafe hostname resolution. The 10 MiB cap checks both Content-Length and streamed bytes (and the final extracted text). The JSON request cap is 4 KiB. PDF classification requires `%PDF-` bytes; a `.pdf` URL returning HTML is rejected. Other supported responses are HTML/XHTML only.
- PDFs are stored unchanged as `docs/url-<slug>-<source-url-hash>.pdf`. HTML becomes `.txt` under the same prefix, preserving the exact extracted article text that the existing pipeline will chunk. Re-fetching the same URL uses the same document key; identical source bytes remain unchanged under the pipeline's existing dedupe rule.
- With optional `BROWSER`, `@cloudflare/puppeteer` renders the fetched HTML snapshot in Chromium, selects `article`/`main`/`[role=main]` (body fallback), and captures visible text after removing navigation/boilerplate. **Page scripts and all browser network requests are disabled**: browser redirects, subresources and inline scripts cannot bypass intake checks. This is intentionally static snapshot rendering, not a JS-enabled crawler. JS-only articles may need a licensed upload instead. Browser acquisition/rendering has a 30-second application deadline, cleanup is bounded to two seconds, and late-acquired sessions are closed. Sessions close in `finally`; a bound-but-failing browser returns 502 rather than silently degrading.
- Without `BROWSER`, HTML uses plain fetch, semantic article selection/boilerplate removal, then the existing `extract.ts` HTML-to-text path. The API (`method: html-fetch-fallback`, explanatory `note`) and localized UI success message explicitly report fallback. Source remains subject to review; heuristics can leave breadcrumbs or publisher text.
- R2 `customMetadata` records `sourceUrl`, `resolvedUrl`, `retrievedAt` (UTC ISO), and `intakeMethod`. The Workflow copies these into the per-byte-version manifest's `provenance`, and document details expose it. The reviewer sees the source URL pre-filled, along with retrieval time/method, but **must still confirm all source/licensing/applicability metadata**. `source` stays null until human approval. Existing uploaded documents and legacy manifests work without provenance. No D1 migration is needed.

### Cloudflare setup for Tunk

The browser binding is **off by default**, with a commented example in `wrangler.jsonc`; production and offline development continue to work through HTML fallback. No new secret, account id, bucket, queue or migration is introduced.

1. Enable/check Browser Rendering (now documented as Browser Run) in the intended Cloudflare account and review its usage limits/pricing.
2. Opt in by uncommenting the top-level `"browser": { "binding": "BROWSER" }` entry in `wrangler.jsonc` (or configure the equivalent in the main-branch deployment). Keep the existing `nodejs_compat` flag. Package dependency is already included.
3. Tunk deploys through the normal **main** deployment process after merge/approval. This PR does not deploy. Without this step, URL intake still works and reports HTML fallback. Roll back optional rendering by removing the binding.
4. Verify a real HTML intake reports `browser-rendering`, inspect its captured text/source in pending review, then review as usual. Verify real R2 notification delivery and Workers AI PDF conversion on the deployment account separately.

References checked: [Cloudflare Puppeteer binding API](https://developers.cloudflare.com/browser-rendering/puppeteer/) and [Wrangler browser configuration](https://developers.cloudflare.com/browser-rendering/reference/wrangler/).

### Local acceptance for URL intake

Run the built Worker on port 8788 with the offline config, local D1 migrations, and a local-only admin test token. Real source checks used:

- HTML: `https://extension.k-state.edu/news-and-publications/news/stories/2026/09/horticulture-rotating-crops-in-the-fall.html` — real article fetched/stored as text with fallback explicitly reported. This garden article is an intake test, **not** approval of applicability to field rotations.
- PDF: `https://bookstore.ksre.ksu.edu/pubs/rotations-and-cultural-practices_MF2908.pdf` — real PDF fetched/stored unchanged, verified by reading local R2 back.

Local R2 does not automatically deliver the account's bucket notification rule, so these writes alone leave the local D1 document list empty. Do not interpret 202 as a running Workflow. Using a temporary local-only harness (removed before commit), explicitly simulated R2 events were sent to the real local Queue: the real HTML article reached `pending_review` with exact chunks and manifest provenance, and the PDF reached `received` but could not extract without Workers AI in offline mode. Playwright verified English/Spanish URL controls, allow-list rejection, and the real pending article's source URL prefill while other source metadata stayed blank. The final pinned transport fetched the real PDF (402,862 bytes) and HTML (3,327 bytes, query `?intake-pinned=1`) successfully under local Wrangler. Local Browser Rendering was attempted, but Miniflare's pinned Chrome install failed on Windows during `pwsh Expand-Archive`; the browser boundary, network isolation configuration, timeout/late-close behavior and errors are covered by mocks, not claimed live rendering. Automated tests also cover the explicitly simulated event through Queue → Workflow → pending manifest/review with SQLite-backed D1 and the pinned TLS/HTTP transport. Account-backed Browser Rendering/PDF conversion, notification delivery, and Vectorize relevance remain separate deployment checks; no deployment or auto-approval is part of local verification.

## Ownership
| Track | Owns |
|---|---|
| B pipeline | `src/worker/ingest/{queue.ts,workflow.ts,store.ts}`, `src/worker/routes/docs.ts`, bindings, `index.ts` queue handler |
| C text | `src/worker/ingest/{extract.ts,chunk.ts,hash.ts,verify.ts}` (pure functions, no bindings) |
| D retrieval | `src/worker/research/retrieve.ts` changes, admin review page |
| A agent note | `src/worker/fieldwatch/` note module + its own component |

## Text extraction and chunk offsets

`src/worker/ingest/{hash,extract,chunk,verify}.ts` are pure helpers; they do not read bindings or write storage. `extractText` accepts the AI instance explicitly only for PDF conversion. The installed Workers types and [Cloudflare binding documentation](https://developers.cloudflare.com/workers-ai/features/markdown-conversion/usage/binding/) define `ai.toMarkdown([{ name, blob }])` as returning `ConversionResponse[]`; conversion failures have `format: "error"` and `error`, while successes contain `data`.

- Markdown/text uploads are decoded as UTF-8, preserving whitespace and BOM. HTML is parsed locally with `htmlparser2`, removing scripts, styles, comments, and tags, decoding entities and inserting block/paragraph breaks. PDF text comes from Workers AI toMarkdown and is saved as **plain text** with extraction method `workers-ai-tomarkdown+plain`. Empty extraction is an error.
- PDF conversion first normalizes CRLF/CR to LF, then removes only the recognized converter preamble: an exact leading `# <input name>` heading and the immediately following `## Metadata` section with a `PDFFormatVersion` marker, ending at the next non-Metadata `## ` heading. A filename-only heading is removable too. Ambiguous metadata/no safe boundary is preserved for review, not deleted by guessing. Later document-owned Metadata sections remain. [Cloudflare's PDF processing documentation](https://developers.cloudflare.com/workers-ai/features/markdown-conversion/how-it-works/#pdfs) and [conversion options](https://developers.cloudflare.com/workers-ai/features/markdown-conversion/conversion-options/#pdf) confirm metadata inclusion and an opt-out, but do **not** specify its exact Markdown serialization; the constructed test fixture follows the observed live wrapper, not a claimed captured response.
- After preamble removal, the `marked` GFM lexer converts **PDF converter output only**: heading text keeps its line, emphasis/inline code are unwrapped, links become label text, list items become plain lines, and table rows become one line each with ` · ` between cells (separator rows disappear). Paragraph breaks are retained. No spelling correction, degluing, paraphrasing or automatic boilerplate removal occurs. Saved text and displayed citations are plain strings, never rendered Markdown/HTML; the admin, planner, Field Watch and Scout passage displays preserve line breaks with `white-space: pre-line`.
- The manifest records `converterPreamble: { removed, chars }` (UTF-16 characters removed after LF normalization) and `plainTextConversion: { format: 'markdown-to-plain-v1', inputChars, outputChars }` (after preamble removal). D1 version rows record the extraction method and `ingest-v2`. New R2 artifacts use `extracted/ingest-v2/<docId>/<sha>.md` and `manifests/ingest-v2/<docId>/<sha>.json`, retaining the `.md` suffix additively; PDF extracted objects have `text/plain` content type. The optional docId argument to `DOCS_LAYOUT` retains legacy key generation, and review reads fall back to legacy manifests. Namespacing prevents identical PDF bytes under the recovery upload's new key from overwriting the old workflow's text/manifest.
- The pipeline saves the returned **post-removal, post-plain-conversion** `text` unchanged in R2. Every `start`/`end` is a JavaScript UTF-16 index into that exact saved text, not a byte offset or an offset into the PDF, original Markdown or removed wrapper. Pending-review details project current chunks and offsets from that version's manifest: kept indexed D1 rows still refer to the earlier approved version until approval.
- Chunks pack adjacent paragraphs while the complete source slice fits `CHUNKING.maxChars`. Oversized paragraphs prefer sentence boundaries, then hard cuts (without bisecting a surrogate pair). Trimming moves offsets rather than rewriting text. Short partial chunks and chunks with over 60% numeric/punctuation/symbol content (ignoring whitespace) are omitted. Numeric answers come from D1, not semantic search.
- Identical chunk text within one document is emitted once, at its first qualifying span. Chunk ids depend on document id and chunk text hash, not version hash or offsets. Unchanged text keeps its id when its chunk boundaries remain unchanged; greedy packing is not edit-local and an edit can change adjacent chunk boundaries.
- `verifyChunk` rejects invalid/coerced/out-of-range offsets as well as any text mismatch. `diffChunks` keeps matching pending/indexed ids, adds only ids absent from **all** existing rows, and retires disappeared pending/indexed ids. A matching retired row is neither kept nor re-added; reactivation policy belongs to the pipeline, not this helper.

Offline tests and the attributed, source-verified K-State excerpt live in `test/ingest-text.test.ts` and `test/fixtures/ingest/`. The real account-backed PDF conversion check is left to the coordinator; these tests mock only the Workers AI boundary and do not access the account.

## Recover the already-pending live PDF after deployment

`doc-4faef33e6ed06129` was extracted with the old rules. Deployment does not replay its completed extraction step. After an authorized deployment (this change does not deploy):

1. Upload the same [Schlegel & Bond 2021 PDF](https://ksu.janeway.systems/kaesrr/article/7218/galley/7152/download) under a **new** key, for example `docs/schlegel-bond-2021-limited-irrigation-v2.pdf` (use that filename in the admin upload). Same bytes at the old key would stop as `unchanged` and are not a re-ingest.
2. Wait for the new document's `pending_review`; inspect the saved extracted text and manifest. Verify `workers-ai-tomarkdown+plain`, removed preamble length, plain headings/lists/table rows/links, and every chunk's exact offsets. Check glued words against the original PDF; the pipeline never guesses replacements.
3. Reject the old pending `doc-4faef33e6ed06129` with reviewer identity and a note that the v2 upload supersedes it. Do not approve the old preamble/boilerplate chunks. Legacy artifacts are left intact; the new upload has document-scoped artifacts, so old-workflow completion cannot overwrite its extraction or manifest.
4. On the new document, select **Exclude from search** for remaining New Prairie Press boilerplate, recommended-citation blocks and garbled passages. Supply verified source/licensing/applicability metadata and crops, then approve. Poll for `indexed`, verify excluded D1 rows have no vector ids, and test retrieval after Vectorize propagation. No migration is required for `excluded`: the existing status column is unconstrained TEXT.

These are operator follow-up steps, not claims that a real re-upload, approval, deployment or retrieval check has already run.
