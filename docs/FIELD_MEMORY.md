# Public demo field memory (#46)

Sprout's `recall_field_history({ field_id, question })` searches **dated history**, not current conditions. Supported public demo ids: `story-ia`, `champaign-il`, `finney-ks`, `lancaster-ne`. Arbitrary/private ids are rejected server-side. This is not a private-field authorization system; do not extend the allowlist to user fields without owner checks and an account/field deletion lifecycle.

## Storage and isolation

- Reuses `RESEARCH_INDEX` → **soilsense-research-v1**. No new Cloudflare resource or binding.
- Uses **per-field namespaces** `field-memory:<field_id>`, rather than a shared `field-memory` namespace plus a metadata filter. Namespace filtering is built in, so **no metadata index creation command is required**. Shared research queries explicitly use the default namespace (`namespace: ""`) and retain their crop/corpus filters.
- Upsert metadata: `field_id`, `kind` (`watch` or `plan`), `date`, `record_id`, `embedding_id`. SHA-256 vector ids are stable for `(field, kind, source record id)` and distinct from research chunk ids. Reprocessing replaces the same vector/ledger row.
- Same `EMBEDDING`, `embeddingInput` and `embed` helper as research: BGE base English v1.5, CLS pooling, 768 dimensions, whitespace normalization, 1,500-character cap; no generation model makes the summary.
- D1 migration `0008_field_memory.sql` adds the source-derived summary ledger, record dates/ids, embedding version and index submission state. The existing run/plan records are saved first. Missing migration/bindings, AI or index failure do not fail the source run/plan.
- `index_status=submitted` means Vectorize accepted the mutation, **not** that it is query-visible. Vectorize mutations are asynchronous. `pending`/`failed` identify incomplete indexing; this implementation does not add a retry queue or backfill old records automatically.

## Producers and dates

- Scheduled live/replay checks in `fieldwatch/agentCore.ts`, including insufficient/error results, plus recurring weekly/window/inactive results in `watchCore.ts`.
- Demo-field plans after a successful `service.ts::logPlan` insert (web and voice callers). Non-demo coordinates are not assigned to the nearest field/county. Plan coordinates must match a demo point at four decimal places.
- Watch summaries use the snapshot observation-window end, otherwise completion date. Replay is explicitly labelled `replay`; completion time is retained separately as `recorded_at`. Rain and root-zone percentiles come only from the saved metrics; null is `unavailable`, never zero.
- Plans use their own `generatedAt`, water/priority, crop/cover ids, score and modeled average return. Labels, explanations, notes, farmer free text, phone numbers and call ids are not embedded. Modeled return is labelled as modeled, not an observed outcome.

## Recall and citations

Recall embeds the question, queries only that field's namespace (top 8, metadata `all`), rejects low/non-finite scores and wrong field/model metadata, then resolves each result against D1. Vector metadata never supplies summary prose/numerical facts. Maximum 5 records per tool call. Missing, expired or mismatched records are discarded. Missing bindings/failures return `unavailable`; no relevant records return `empty`; there is no fabricated fallback.

Each returned record includes its original `record_id`, `date`, `recorded_at`, template summary, citation id `[F1]` and a source URL. `GET /api/field-memory/:field/:vector` resolves that source to the retained ledger row without exposing plan-log caller data. The original record id can be looked up in the field agent's structured run history or `plan_log`.

The citation checker accepts only F ids returned server-side **this turn**, adds trusted source links and a `data-field-memory-citations` part, and warns on invented/prior-client-history F ids. Existing R-id research validation remains independent. A timed-out retrieval cannot later register citations. An 8-second deadline bounds recall; each embedding/index write step also has an 8-second deadline. Deadlines do not cancel an already submitted Cloudflare mutation.

## Retention, repair and rollout

The newest **200 combined watch/plan records per field**, ordered by record creation/completion time and stable id, are eligible for recall/source links. On writes, up to 50 older vector ids are deleted before their ledger rows are removed. Failure leaves cleanup candidates for a later write; only the latest 200 are readable even while physical deletion is pending. Concurrent/late index mutations can leave an orphan vector, but it cannot be recalled without a retained ledger row. Structured run/plan history is not deleted by this semantic-memory retention policy.

Tunk, after review/merge and before enabling the deployed feature, apply the existing database's migrations from the intended deployment checkout:

```sh
npx wrangler d1 migrations apply fieldshift --remote
```

This command is an operator handoff, **not executed by this PR task**. There is no Vectorize metadata-index or namespace creation step. Re-run a demo check/generate a demo plan, wait for asynchronous index visibility, ask Sprout about that field's history, inspect the F source URL and original record id, then repeat for a different field and research retrieval. Deployment/live relevance has not been validated by local mocks or dry-run.

If the embedding configuration changes, re-embed retained records from their source-derived summaries with the new shared configuration and update the ledger/vector `embedding_id`; recall fails closed for stale embedding ids. Use the migration guidance in `RESEARCH.md` if dimensions/index change. No automatic model migration is provided.

## Verification

`test/field-memory.test.ts` uses real SQLite for the D1 ledger and mocked Workers AI/Vectorize for deterministic templates, idempotence, producer hooks, namespace isolation, defensive cross-field resolution, retention, stale matches, index/migration failures, late timeouts and F citation enforcement. No live Cloudflare index is mutated by these tests.

API/types checked against installed `@cloudflare/workers-types` (`VectorizeVector.namespace`, `VectorizeQueryOptions.namespace`) and Cloudflare documentation:

- https://developers.cloudflare.com/vectorize/best-practices/insert-vectors/#namespaces
- https://developers.cloudflare.com/vectorize/reference/metadata-filtering/
- https://developers.cloudflare.com/vectorize/reference/client-api/
