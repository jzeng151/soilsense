# Cited research and grounded explanations (#7, #8)

Each plan card shows a short explanation ("In short") with a visible status label and the research
passages it may cite. Everything is optional at runtime: with no Workers AI or Vectorize binding the
card falls back to the deterministic template and an explicit "research unavailable" state, and the
plan itself never changes.

## Pieces

| Piece | File |
| --- | --- |
| Shared config (embedding model, pooling, preprocessing, index, generation model, retired list) | `src/worker/research/config.ts` |
| Curated corpus (13 verbatim chunks, 3 sources, corpus version) | `src/worker/research/corpus.json` |
| Retrieval (embed → Vectorize query filtered by crop tag → ≤ 2 passages) | `src/worker/research/retrieve.ts` |
| Explanation (approved facts, prompt, validation, rendering, template, fallbacks) | `src/worker/research/explain.ts` |
| Saved demo bundle (empty until captured) + loader | `src/worker/research/saved-evidence.json`, `saved.ts` |
| API | `src/worker/routes/research.ts` (mounted at `/api/research`) |
| UI | `web/src/components/PlanExplanation.tsx` (rendered inside `TopPlan` in `PlanCard.tsx`) |
| Scripts | `scripts/setup-research-index.sh`, `ingest-research.mjs`, `snapshot-research.mjs`, `verify-research-corpus.mjs` |

## Configuration (pinned in one place)

- Embeddings: `@cf/baai/bge-base-en-v1.5`, 768 dimensions, `pooling: "cls"`, ≤ 512 tokens per input.
  Ingestion and queries both call `embeddingInput()` → `prepareEmbeddingText()` (collapse whitespace,
  cap at 1,500 characters ≈ ≤ 500 tokens; **no** prefix or heading on either side). Corpus chunks are
  all under the cap, so none is truncated (a test enforces this).
- `cls` and `mean` pooling are not compatible, and neither is a different model with equal dimensions.
  Any change ⇒ bump `EMBEDDING.id`, create a new index (e.g. `soilsense-research-v2`), re-ingest.
- Not used: `@cf/google/embeddinggemma-300m` (retiring 2026-11-20).
- Generation: `@cf/google/gemma-4-26b-a4b-it` (same model Scout already uses), thinking disabled,
  one attempt with a 12 s timeout, called through AI Gateway (`AI_GATEWAY_ID`, default `default`).
  None of the 2026-11-20 retirement-list models are used (see `RETIRED_MODELS`).
- Vectorize: index `soilsense-research-v1`, 768 dims, cosine, binding `RESEARCH_INDEX`. One vector per
  (chunk, crop tag) with metadata `crop`, `corpus`, `chunk_id`, `source_id`; metadata indexes on `crop`
  and `corpus` (string). Passage text is served from `corpus.json` by chunk ID, never from the index.

## Corpus

Tags: `corn`, `soybean`, `winter_wheat`, `oats`, `alfalfa`, `sorghum`, `fallow`, `cover` (winter cover
crops). Sources:

1. Schlegel & Bond (2021), *Alternative Cropping Systems with Limited Irrigation*, K-State SWREC
   (Tribune, KS; 10 in/yr limited irrigation, no-till). License stated in the PDF: free reproduction for
   educational purposes.
2. K-State Entomology, *Corn Rootworms* (last updated 2024-03-29). License: unknown (© Kansas State University).
3. Magdoff & van Es (2021), *Building Soils for Better Crops*, Ch. 11 Diversifying Cropping Systems, SARE.
   License: unknown (© SARE).

Each chunk is a contiguous verbatim excerpt (only whitespace normalized). Re-check against the live
sources at any time: `node scripts/verify-research-corpus.mjs` (needs `pdftotext` for the PDF).

## API

- `GET /api/research/status` – pinned config, **bundled** corpus version/chunk count, bindings,
  saved-entry count, and `ingestion.status: "unchecked"`. A bound index or nonzero index-wide vector
  count does **not** prove research ingestion: field memory and reviewed documents share the index.
- `GET /api/research/status?verify=true` – read-only inventory of all 40 expected curated vector IDs,
  in batches of at most 20 (`getByIds` limit). Reports `ready`, `missing`, `partial`, or `unavailable`,
  with expected/indexed/missing/invalid counts when the read succeeds. Checks default namespace,
  dimensions, finite values and exact corpus/crop/chunk/source metadata. This establishes vector
  presence, **not** semantic relevance or metadata-filter indexing; use the query verifier too.
- `GET /api/research/corpus` – the corpus.
- `POST /api/research/query` `{ "crops": ["corn"], "query": "…" }` – raw retrieval check:
  `status` is `live` (≤ 2 passages), `empty` (unsupported crop, or nothing above the 0.45 cosine floor),
  or `unavailable` (binding missing / failed).
- `POST /api/research/explain` – body = the same `PlanRequest` as `/api/plan`, plus optional `rotationId`
  (`plan-1`… or the current practice id). The Worker rebuilds the plan with `makePlan` (D1-cached, so the
  dashboard's request is a cache hit) — facts never come from the client. Returns
  `{ narrative, citations, status: live|saved|template, asOf, evidencePeriod, comparisonKey, research, … }`.
- `POST /api/research/ingest` – `Authorization: Bearer $ADMIN_TOKEN` only (403 if the secret is unset).

### Explanation rules

The model returns `{rotationId, narrative, citations}`; quantities appear only as placeholders such as
`{{plan-1/net_return}}`, `{{current/bad_years}}`, `{{field/weather_period}}`. Trusted code rejects the
whole output (⇒ template) on: invalid JSON/structure, wrong `rotationId`, unknown fact IDs, facts from
another rotation, any digit / `$` / `%` / number word outside placeholders, unknown citation IDs,
certainty/confidence wording or "bare", > 3 sentences or > 600 chars. Numbers are rendered from the
approved facts. The agronomist-check line is fixed text, never model-written.

Failures: HTTP 410 / error 5028 (retired), timeout or provider error ⇒ no retry; use a saved explanation
only when the **complete comparison key** matches and it re-validates, else the template.

### Comparison key

`k1 | lat,lon | climate period + hash(approved facts + engine facts) | water + recent crops |
rotation id + crop/cover sequence | priority | PLAN_ENGINE_VERSION | corpus version | embedding id |
generation model | prompt version`. Any change ⇒ saved output is not reused.

## Reviewed pipeline documents

Live retrieval searches `corpus in [CORPUS_VERSION, docs-v1]` with the existing crop filter,
score floor, ordering and two-passage limit. Pipeline vector hits are resolved by chunk ID through
`ingest_chunks JOIN ingest_docs`; both rows must be `indexed`. Text and all source fields come from
D1, never Vectorize or generated metadata. Missing DB, incomplete attribution, invalid URLs,
invalid crop metadata and inconsistent offset lengths drop the passage. Exact slice/content verification
belongs to pipeline ingestion before indexing; retrieval does not re-fetch extracted R2 objects.
Pipeline passages add optional `origin: "docs"` and `publisher` fields to the existing response.
The research route and explanation route both pass the optional D1 binding through.

The `k1` comparison key and curated saved fallback are intentionally unchanged. Saved passages are
still rehydrated **only from the curated corpus**; a saved explanation citing a pipeline chunk fails
citation validation and falls back to the template rather than replaying stale/unreviewed pipeline text.
Pipeline documents are live-only evidence in this increment; offline snapshots of them are not supported.

### Hidden operator page

Open `/#/admin/docs` (the hash router lives in `web/src/Shell.tsx`, not `App.tsx`). This page is not
linked in the public navigation. Enter `ADMIN_TOKEN`; it stays in sessionStorage only, with a clear-token
button. Refresh the list, upload a PDF/HTML/Markdown/text document, open its exact chunks and offsets,
and supply reviewer/source metadata plus supported crop tags to approve or reject it. Refresh after
approval: a queued upload or accepted review is **not** proof of indexing. The page reads back the
selected document and list after reviews, and the list after uploads. The server enforces authorization.

The typed client accepts both the documented camelCase API and the pipeline's raw D1 snake_case
list/detail responses. When list chunk counts are absent, it asks the operator to inspect the document
instead of inventing zero counts. Upload uses multipart field `file`, without manually setting its boundary.
Track B owns these endpoints; this branch does not add or change ingestion or document routes.

## Field Watch research notes

Dry and Watch results from the field agent (live, replay, weekly and crop-window checks) store a
`researchNote` in the existing SQLite run JSON. The note queries the same pinned research index for
the dry-spell topic, using the confirmed watch-settings crop first, otherwise the demo planner's crop
tags (`scripts/prefetch-demo.mjs`, mirrored on `WATCHED_FIELDS`). Those fallback tags are not a claim
about the field's current crop. With neither, the note records `skipped` and a reason.

The note includes at most two verbatim corpus passages, citation metadata, applicability, similarity
scores, retrieval status/date, corpus and embedding identifiers, and a fixed context-not-advice line.
There is no generation call and no change to rule v2. No passage above the shared `MIN_SCORE` yields
`empty`; absent bindings or a retrieval failure yields `unavailable`. Retrieval has a 1.5-second
ceiling and no retry. Notes do not reuse plan-specific saved explanations. Reopening the dashboard
reads the stored note, not a fresh index query; older runs are left unchanged.

`ScheduledCheck.tsx` renders notes through `ResearchNote.tsx` (no changes to `FieldWatchCard.tsx`).
Local tests exercise mocked embedding/index results and actual SQLite round trips through the Agents
stub. A deployed check with real Workers AI and Vectorize bindings is still required to assess live
retrieval relevance for dry-spell queries; a similarity score is not agronomic confidence.

## Diagnosing an empty shared index

The test Worker investigation on 2026-11-15 found 40/40 expected curated IDs absent. A complete
read-only inventory found 42 existing vectors, all in `field-memory:*` namespaces
and none with `corpus` metadata (the count was increasing with concurrent plan requests). Both
`crop` and `corpus` metadata indexes already existed. `/status` still said `chunks: 13` because
that number describes `corpus.json`, not Vectorize. There was no curated vector to score, so
changing thresholds, crop vocabulary, pooling or namespace filters would not repair this deployment.
No remote writes were performed during diagnosis.

Operator repair for **this test Worker** (not the production Worker):

```bash
# Coordinator only: run from C:/Users/steve/Projects/soilsense AFTER integrating this PR into next.
# The absolute config resolves Worker source/assets relative to that checkout, not this worktree.
npm run build
npx wrangler deploy -c C:/Users/steve/Projects/soilsense/wrangler.me.jsonc

# Read-only preflight: both crop and corpus must be present; they already were in this investigation.
npx wrangler vectorize list-metadata-index soilsense-research-v1 -c C:/Users/steve/Projects/soilsense/wrangler.me.jsonc

# Coordinator only: ADMIN_TOKEN must already be exported securely. Upserts ONLY the 40 curated IDs;
# it does not delete or overwrite field-memory or reviewed-document vectors.
node scripts/ingest-research.mjs https://soilsense-jason.jason-zeng151.workers.dev

# Read-only repeatable verification (no token needed and NO ingestion POST).
node scripts/ingest-research.mjs https://soilsense-jason.jason-zeng151.workers.dev --verify-only
curl --fail-with-body 'https://soilsense-jason.jason-zeng151.workers.dev/api/research/status?verify=true'
```

The script polls inventory and all eight supported crop/feature queries plus unsupported `rice`.
It exits nonzero on missing/invalid inventory, HTTP errors, supported crops without scored passages,
or unsupported crops returning passages. `--attempts=1` makes a one-shot read-only check;
`--attempts=12 --interval-ms=5000` are the default polling settings. An older deployment without
`ingestion` status deliberately fails verification rather than silently assuming readiness.
If a metadata index is absent, create it **before** re-ingesting (do not recreate/delete the shared
index). Existing vectors need re-upsert after metadata-index creation; query checks catch this
case even if inventory is `ready`.

Plans (`explainRotation`), Field Watch (`researchNoteFor`) and Sprout (`ChatResearch.search`) all
call `researchFor` → `retrieveLive` with the same embedding, corpus/crop filters and score floor.
The repair restores evidence for all three without a separate code path or a lowered score floor.
Existing persisted Field Watch notes are historical: reopening one does not requery; a **new**
Dry/Watch check is needed to store a new note. Watch retrieval still has its 1.5-second ceiling;
post-ingestion live latency/relevance and generated Sprout citations must be checked by the operator.

## Morning steps (Tunk) — initial setup checklist

1. `npx wrangler login` (if needed), then `bash scripts/setup-research-index.sh`
   (creates the index and **both metadata indexes before any upsert**).
   ⚠️ `wrangler.jsonc` now binds `RESEARCH_INDEX`; deploying before the index exists will fail.
2. `npm run deploy`
3. `ADMIN_TOKEN=… node scripts/ingest-research.mjs https://<worker-url>` — expects `dimensions: 768`;
   prints one known query per crop tag (should be `live`) and `rice` (should be `empty`). Keep the
   output as evidence of a real embedding call + Vectorize query.
4. Check one real explanation: open a plan in the dashboard; the card badge should read "AI summary".
   Record the response of `POST /api/research/explain` (status `live`, model id, latency).
5. Capture saved demo output: `ADMIN_TOKEN=… node scripts/snapshot-research.mjs https://<worker-url> [scenarios.json]`.
   Scenarios must equal what the dashboard sends (copy `lat`, `lon`, `water`, `priority`, `recentCrops`
   from the `/api/plan` request in DevTools for each demo field). Only live results are written.
   Review `src/worker/research/saved-evidence.json`, commit, `npm run deploy` again.
6. Verify fallbacks: temporarily remove the `vectorize`/`ai` bindings (or `wrangler.offline.jsonc`) and
   confirm prepared scenarios show "Saved summary" + saved passages with their retrieval date, and that
   an unprepared field/priority shows "Standard summary" and "research unavailable".
