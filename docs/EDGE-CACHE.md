# Public edge caching and placement

## Route inventory / boundary

Only **GET + 200 + anonymous** responses from this exact allowlist are shared. `src/worker/lib/edgeCache.ts` wraps the deployed fetch and Hono's test request boundary. Never change `/api/fields` into a prefix match: capability-owned farmer fields share that prefix.

| Existing route | Browser max-age | stale-while-revalidate | Rationale |
| --- | ---: | ---: | --- |
| `/api/fields`, `/api/fields/` (`area` or bounded `bbox`), `/api/fields/status` | 1 hour | 1 hour | Bundled public CSB subsets; feature flag included in key |
| `/api/historical-scenarios` (including trailing slash) | 1 hour | 1 hour | Public replay catalog |
| `/api/research/corpus` | 1 hour | 1 hour | Bundled source/corpus metadata |
| `/api/research/status` | 60 seconds | 60 seconds | Public capability/configuration metadata |
| `/api/refresh/status` | 60 seconds | 60 seconds | Public demo-farm refresh summaries; not farmer records |
| `/api/refresh/snapshots/pwr-<24 hex>` and `/bundle` | 1 day | 1 day | Public evidence manifests/bundles by immutable snapshot id; conservative bound rather than permanent browser cache |

Not cached: admin, authentication, accounts, documents/intake/review, logs, live events/WebSockets, field memory, Field Watch runs/watches, custom/capability fields, farmer measurements, plans, AI/chat/explanations, all non-GETs, errors/404s. Other public read-only data endpoints (`/api/field`, vegetation, USDM, SMAP, crop timing, groundwater, economics assumptions, second opinion, runtime/health/scout status) deliberately remain `no-store`: their live data, upstream outages, or high-cardinality query inputs need a separate freshness review. Read-only does not automatically mean safe to share.

**Absent routes in this base:** `/api/ui/status`, `/api/zip*`, `/api/sources`, `/api/glossary` do not exist. Glossary is a bundled client/shared module; sources are in research corpus. ZIP/county lookups are internal functions (Scout, voice, planner), not an HTTP route. Unknown paths remain `no-store`; no fictional routes added.

Credentialed requests (`Cookie` or `Authorization`), ranges, upgrades and secret-like query keys bypass shared caching and receive `no-store`. Responses with Set-Cookie, Vary, private/no-store or non-200 status cannot enter Cache API. Existing explicit no-store policies are preserved; unclassified API responses get `private, no-store`. Security headers survive hits. CORS already emitted by the origin is stored unchanged.

Keys include origin, full query (including duplicate order), `public-v1`, optional `EDGE_CACHE_VERSION`, and feature/binding presence. Bump the code version or owner variable whenever public schemas/data change. Browser cache keys cannot be versioned server-side: existing client entries can live for max-age + stale window. This is why status TTLs are short and evidence TTL is bounded.

Cloudflare Cache API **does not implement SWR**. We store for fresh+stale seconds, save an internal timestamp, return Age, and refresh stale entries with `waitUntil`. One refresh per key/isolate is coalesced. Failure never extends stale lifetime. No context means synchronous refresh rather than detached work. Cache unavailability falls back to the origin. `X-Edge-Cache` exposes MISS/HIT/STALE/BYPASS; internal timestamp is stripped.

Cache API remains per-data-center, not globally replicated or tiered, and still executes the Worker. It does **not** solve uncached planner CPU overages on Free. Browser Cache-Control and Cache API are separate layers. Cloudflare's current docs guarantee functional Cache API on custom-domain Workers and Pages; verify actual MISS→HIT on the target hostname instead of assuming the workers.dev test hostname proves production behavior. Access-protected Workers / dashboard previews have additional Cache API limitations.

## Optional geography KV and read replicas

Lookup order: isolate memory → optional `GEO_KV` → D1 cache → upstream. Only `zip:v1:` / `county:v1:` keys can use KV or replica sessions. Payloads retain the original D1 absolute expiry; warming KV never extends an old D1 row by another year. Null lookups are not written to KV. Invalid/expired/unavailable KV falls back; no binding is required. KV reads/writes are best effort and writes are awaited (no untracked promise); they can add miss latency. KV is eventually consistent: these are slow-changing public reference values, not user state. Bump geography key versions when the reference definition changes.

`GEO_CACHE_READ_REPLICA="on"` opts only those cache-table reads into `DB.withSession("first-unconstrained")`. Replica miss/expiry is rechecked on primary before calling upstream, avoiding overwrite of a newly populated primary entry. Writes stay primary. **Mutable plan cache/admin imports, farmer measurements, users, and other queries are untouched**: there are no propagated bookmarks in those flows, so enabling unconstrained replicas globally would break cross-request read-your-writes. Geography is allowed to read an older, unexpired reference entry. This is explicitly not a general RYW solution. Sessions absent in an older runtime fall back to primary.

D1 docs currently describe read replication as built in, no extra replica compute/storage charge, normal rows-read/write billing on Free and Paid (no paid-only restriction documented). Enable it per database in the dashboard. Sessions are required; `DB.prepare` alone still goes to primary. Replicas are asynchronous, can lag arbitrarily, and are managed by Cloudflare. A bookmark is needed to carry consistency across sessions; `first-primary` starts on latest primary but gives no first-read replica latency saving. Local SQLite cannot measure global replication or replica lag. After enablement, inspect D1 query metadata (`served_by_region`, `served_by_primary`, `rows_read`, timings) with owner-side observability; never treat our invocation counts as billable rows.

## Smart Placement: evaluate, do not enable by default

As of the cited docs, Smart Placement is available on **all Workers plans**, per Worker. Enablement is `"placement": { "mode": "smart" }` in Wrangler (or dashboard Settings → General → Placement). Allow up to 15 minutes of representative traffic for analysis; it only considers locations where the Worker has previously run and forwards only if estimated benefit exceeds forwarding cost. Local Wrangler cannot validate it.

For SoilSense, uncached NASA/USDA requests and primary D1 round trips might benefit. Public static/cache hits want near-user execution, and read replicas already bring geography reads closer. Cache API entries live where execution occurs, so changing placement can fragment/warm a different cache. A single monolithic Worker also serves auth, voice and live WebSockets: do not assume moving it improves all of them. Static assets served directly remain near the incoming request; assets fetched via ASSETS binding are served where the Worker runs.

Durable Objects have **their own automatic placement**; Smart Placement does not move `LiveRoom` or `FieldAgent`, or their embedded SQLite storage. It also does not relocate the D1 primary or replace D1 replication. Prefer composite DO operations over multiple Worker↔DO calls. Longer-term, Cloudflare recommends separating edge/auth/cache and placed backend Workers with Service Bindings when mixed workloads conflict.

Owner A/B procedure: use a staging Worker with the same bindings/data and representative US + distant probes. Keep cache/version/replication settings fixed, run at least one warm-up period and 15 minutes of actual traffic, then compare cold and warm route-level p50/p95 wall time, Worker CPU, error rate, D1 time/rows and voice/WebSocket handshake latency. Log the incoming `cf-placement` request header (`local-EWR`, `remote-LHR`, etc.) in staging; it is not automatically a response header. Compare cache HIT rate by execution location. Repeat with placement disabled; do not combine a replication toggle with the placement comparison. Keep default if latency/error regressions outweigh backend gains.

## Cloud setup for owner

No remote deploy, migration, namespace, secret or database setting was changed by this work.

1. Nothing is required for baseline safe HTTP policies/Cache API; validate behavior on a production custom domain and choose a release `EDGE_CACHE_VERSION`.
2. Optional: `npx wrangler kv namespace create GEO_KV`, then add the returned namespace id to the intended config only:
   ```jsonc
   "kv_namespaces": [{ "binding": "GEO_KV", "id": "<returned namespace id>" }]
   ```
   For a local smoke test add that binding in a local-only config and run Wrangler locally. Do not reuse another profile's secrets or a production remote binding for tests. KV limits/operations still apply on Free.
3. Optional D1: dashboard D1 → fieldshift → Settings → Enable Read Replication; then add `"GEO_CACHE_READ_REPLICA": "on"` to the intended vars. Revert the variable to use primary again. All other database operations remain unchanged.
4. Optional **experiment only**, after staging setup and measurement, add this fragment to the staging Wrangler config (not default):
   ```jsonc
   "placement": { "mode": "smart" }
   ```
   Remove it to roll back. This is a fragment, not a standalone deployment file that could accidentally omit existing bindings/migrations.
5. `EDGE_CACHE_MODE="off"` disables Cache API reads/writes for controlled comparisons; public browser headers still apply, so use curl/Node or bypass browser cache for benchmarks. Credentials still force no-store.

## Local measurements

Windows, local `wrangler dev -c wrangler.offline.jsonc --port 8817 --var FIELDS_ENABLED:on`, locally migrated D1, same worktree. Before = unmodified base `ac9db24`; after = this implementation. Sequential Node fetch, response body consumed, one discarded warm-up + 30 samples per route, nearest-rank p50/p95. Not a production experiment; sub-millisecond p50 differences are noise and several static routes did not improve.

| Route | Before p50 / p95 ms | After p50 / p95 ms |
| --- | ---: | ---: |
| fields?area=finney | 14.853 / 25.928 | 15.806 / 22.432 |
| fields/status | 15.807 / 25.539 | 15.287 / 20.666 |
| research/status | 15.026 / 23.004 | 15.243 / 18.880 |
| research/corpus | 15.482 / 20.818 | 15.929 / 18.723 |
| refresh/status | 16.381 / 28.139 | 15.479 / 18.169 |

After samples reported HIT. Reproduce with `node scripts/bench-public-gets.mjs after`; optional `BENCH_OUTPUT` writes raw samples to an explicit path. Use baseline checkout or EDGE_CACHE_MODE=off for a new comparison, and separate runs rather than shared-cache browser hits.

**Query-invocation measurement:** `npx vitest run test/edge-cache.test.ts` instruments the D1 binding boundary for 30 GET `/api/refresh/status` requests: Cache API off **60 SELECT invocations**, on **2** (first request only). This uses a test binding returning empty tables and an in-memory Cache API double, not remote D1 or billable rows_read. It demonstrates bypassed handler queries, not real network latency or replicated D1 behavior. KV tests also prove a valid KV hit makes zero D1 calls, including after clearing isolate memory.

Expected production effect: browser hits can avoid requests; warm same-location Cache API hits avoid JSON serialization, D1 queries and R2 reads for allowlisted resources. KV can avoid primary-D1 RTTs across cold isolates for geography. Neither guarantees lower local latency, global cache hits, lower rows per uncached query, nor a fix for 10 ms planner CPU. Production placement/replica efficacy and target-host Cache API availability remain owner validation work.

## Sources checked

- [Cache API](https://developers.cloudflare.com/workers/runtime-apis/cache/) — data-center locality, supported hosts, unsupported SWR, no Tiered Cache, Set-Cookie behavior.
- [Placement](https://developers.cloudflare.com/workers/configuration/placement/) — plans, warm-up, routing, static assets, Durable Objects, split-Worker recommendation.
- [D1 global read replication](https://developers.cloudflare.com/d1/best-practices/read-replication/) — enablement, Sessions, lag and sequential consistency.
- [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/) — Free/Paid limits and no extra replica charge.
