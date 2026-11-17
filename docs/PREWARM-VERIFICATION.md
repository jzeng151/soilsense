# Recorded prewarm verification

All writes below were local. No deployment, remote migration, remote import, or secret change was performed.

## Current-branch checks

- `npm run typecheck`: passed.
- `npm test`: 131 files passed, 6 skipped; 960 tests passed, 15 skipped (975 total).
- `npm run build`: passed (existing Vite large-chunk warning).
- Focused public-boundary tests cover admin protection, truthful live D1 counts, expired/old-engine keys,
  UTC rollover, malformed histories, absent D1, cache-only cron dispatch, stable Workflow IDs and real errors.

## Real Wrangler scheduled / persistent cache-only check

Using Wrangler 4.162.0, local D1, port 8815 and current `next` merged into this branch:

1. Copied only local source-cache D1 data into an isolated scratch state; removed plan/status keys.
   Initial admin GET reported `warmedToday: 0`, `expected: 504`, no last run.
2. Started `wrangler dev --test-scheduled` in inline mode with the optional Workflow bound.
   The requested legacy `/__scheduled?cron=...` resolved to the SPA, not a cron. Used the current
   `/cdn-cgi/handler/scheduled?cron=5%200,4,8,12,16,20%20*%20*%20*&format=json` route instead.
3. The Workflow inferred the target dashboard histories and completed **576/576** durable plans,
   **0 failures**, from `2026-11-16T03:10:32.876Z` to `2026-11-16T03:11:17.471Z`.
4. Stopped that process tree and restarted the **same durable state** with `PLAN_COMPUTE_MODE=cache-only`.
   Invoked the cron again: structured outcome `ok`; it skipped compute and preserved the prior run.
5. `scripts/verify-prewarm.mjs` independently fetched the live field histories and POSTed **all 576
   requests**. **576 HTTP 200**, median **30.06 ms**, p95 **36.69 ms**, total **17,326 ms**.
   The exact machine-readable output is in `docs/prewarm-cache-only.json`.

These are local HTTP wall latencies, **not Worker CPU measurements** or production Free-limit validation.
The fresh paid runner must not be enabled on Free; even Workflow steps are limited to 10 ms there.

## End-to-end external runner

`PLAN_LIVE_SOURCE=auto ... npx vitest run test/plan-prefetch-live.test.ts`:

- Real local HTTP target uses the actual Hono API and SQLite adapter, with **cache-only** mode.
- Before warming: **504/504 fixed requests returned 503** on the cold target (asserted individually).
- `scripts/prewarm.mjs --target ...` automatically migrated ephemeral local D1, built assets, started
  real local Wrangler inline compute, fetched histories from the target, imported plans and read back
  each exact target response.
- Latest fresh-target inferred histories required **612 requests**; output:
  `Verified 612/612 requests (612 required for the full demo matrix). Durable warm status: 612/612; failures=0.`
- Integration passed in **219.52 seconds**, including local setup/build, real upstream data fetching,
  all imports/read-backs and source shutdown. Live counts can differ because target CDL source caches
  differ; both runners use the same shared matrix and the target's inferred histories.
- First Windows attempt completed computation/import but failed during synchronous removal of locked
  local files. The wrapper now retries asynchronous cleanup and warns rather than misreporting an
  otherwise verified warm as failed. The complete integration was rerun and passed.

The opt-in test is intentionally skipped in the normal suite because it uses real upstream services.
Set `PLAN_LIVE_SOURCE=auto` to exercise the automatic source lifecycle, or point it at an existing
local inline source with matching `local-plan-engine-test` admin token. Target listens on
`127.0.0.3:8815`, local Wrangler on `127.0.0.1:8815`; both are local-only.

## Deployment caveats

- This is a draft PR, not a production verification. Actions has not been activated or remotely run.
- The owner must add the secret and install the scheduled workflow on the default branch, even though
  it checks out `next`. Confirm account-wide cron capacity and run post-deploy prewarm before presenting.
- There is still a midnight rollover-to-warm-completion window and no hard guarantee against delayed
  schedules/upstream failures. This implementation does not serve stale yesterday-key plans silently.
