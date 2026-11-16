# Demo plan prewarming

## Deploy note / owner runbook

After deploying **the same `next` checkout** as the target Worker:

```bash
npm ci
# Supply the existing target ADMIN_TOKEN securely in the environment, not a command argument.
npm run prewarm -- --target https://soilsense-jason.jason-zeng151.workers.dev
# Read-only full-matrix check (also works against a cache-only target):
node scripts/verify-prewarm.mjs https://soilsense-jason.jason-zeng151.workers.dev
```

Requires Node >=22.18 (CI uses 24). `prewarm` migrates only an ephemeral **local** D1 database,
builds the local assets, launches local Wrangler inline compute on `PREWARM_PORT` (default 8815),
imports each complete current-version plan via the existing admin route, and reads back the exact
target response. It stops its own child process and deletes successful local state. Failed local
logs remain in the printed scratch directory. It does not deploy, migrate remote databases, or
change secrets. An occupied source port is an error, never permission to kill another process.
For an existing trusted inline source, set `PLAN_COMPUTE_ORIGIN` and `LOCAL_ADMIN_TOKEN`;
then the wrapper does not launch/migrate/build anything. Use a fresh source to renew the TTL,
not the target itself: re-reading cached responses alone does not renew six-hour freshness.
`--limit=N` is a smoke check, never a full prewarm. `npm run prewarm -- --list` needs no secrets/network.

## Cloud setup for owner

- **Free / cache-only:** keep `PLAN_COMPUTE_MODE=cache-only` on the target. Add the matching
  `ADMIN_TOKEN` **repository secret**. Optionally set repository variable `SOILSENSE_PREWARM_TARGET`;
  otherwise the job uses the `next` test deployment above. No Cloudflare account token is needed
  by the job: all computation and migrations are local, imports use the existing admin endpoint.
- Install `.github/workflows/prewarm.yml` on the repository's **default branch** and enable Actions.
  GitHub scheduled jobs do not run merely because this PR is merged into `next`; the workflow
  explicitly checks out `next` to match the test deployment. Without the secret, the job skips all
  checkout/network/import work and prints setup instructions. Run `workflow_dispatch` once after setup.
- **Paid / inline:** the appended optional `PLAN_PREWARM` Workflow binding points to
  `PlanPrewarmWorkflow` (`soilsense-plan-prewarm`). Wrangler can provision it at deploy. No manual
  resource creation or database migration is needed. It is never instantiated in cache-only mode.
  Without the binding, the paid scheduled handler falls back to the same bounded sequential runner.
- Existing D1 `cache` table is required. Status uses that table; no new migrations, KV, queues, or secrets.
- Both Wrangler configs append **one** cron expression: `5 0,4,8,12,16,20 * * *`. Together with
  Field Watch and POWER this is **3** triggers in this Worker. Free allows **5 account-wide**;
  check other Workers' triggers before deploying. The Actions job uses the same schedule.
- Monitor `GET /api/prewarm/status` with `Authorization: Bearer <ADMIN_TOKEN>` and `Cache-Control: no-store`.
  `warmedToday` is independently counted from unexpired matching **today/current-engine** D1 keys,
  not the runner's claimed counter. It includes `expected`, `earliestExpiry`, `lastRunTime`,
  `completedAt`, `failures`, bounded `errors`, mode and Workflow availability. History inference
  errors count as failures even when all fixed profiles are warm. Check both coverage and failures.

## Why this design

[Workers limits](https://developers.cloudflare.com/workers/platform/limits/) specify **10 ms CPU**
for Free HTTP **and cron** invocations, and **5 cron triggers/account**. Paid hourly-or-longer crons
can use up to **15 minutes CPU**, with a **15-minute wall-time** limit. [Workflow limits](https://developers.cloudflare.com/workflows/reference/limits/)
specify **10 ms per step on Free** (30 seconds default on Paid). Moving the existing 20–30 ms
planning operation into a Free Workflow step therefore does **not** solve the CPU problem.
These limits were checked directly during implementation; local Wrangler does not enforce the
production Free CPU budget, so local timings are not evidence that uncached Free compute is safe.

Paid runs use six plans per durable Workflow step, sequential batches, bounded retries/timeouts,
and compact progress results (not full plans in Workflow state). A stable engine/four-hour-slot
instance ID makes duplicate cron delivery idempotent. Each run recomputes fresh outputs instead
of extending old results indefinitely. The fallback runs only in the scheduled invocation, never
on a user's request or HTTP `waitUntil` (which has a shorter lifetime). Cache-only cron does no
plan/source work; the external job handles compute/import one plan per HTTP request.

`src/shared/demoPlans.ts` is the single matrix definition for both paths: four demo farms **plus
the pre-existing Ames ZIP demo**, three water levels, four priorities, **en/es/ko**, unique mapped,
original and corn-answer histories, plus each dashboard-inferred history fetched from the target.
There are **504 fixed requests**; live inferred histories may increase that count. Arbitrary goals,
constraints, prices, measurements, other locations and custom histories are intentionally not covered.

Six-hour entries need renewal before expiry: running only at midnight would leave most of each day
cold. The four-hour schedule gives two hours of renewal slack. **This is not a zero-miss SLA:** keys
change at 00:00 UTC and the first run starts at 00:05; filling the matrix takes additional time.
Actions schedules can be delayed, upstream services can fail, and deployments invalidate engine keys.
Run the post-deploy command and verify complete coverage **before presenting**. For an uninterrupted
midnight guarantee, future work would need next-day precomputation/import support or explicitly
bounded previous-day fallback; this change does not silently serve yesterday's plans.

## Local verification

```bash
npm run build
npm run db:migrate:local
npx wrangler dev -c wrangler.offline.jsonc --port 8815 --test-scheduled \
  --var PLAN_COMPUTE_MODE:inline --var ADMIN_TOKEN:local-prewarm-test
# Legacy Wrangler route requested in the task:
curl 'http://127.0.0.1:8815/__scheduled?cron=5%200,4,8,12,16,20%20*%20*%20*'
# Wrangler 4.162 uses this route; legacy /__scheduled resolves to the SPA, not the cron:
curl 'http://127.0.0.1:8815/cdn-cgi/handler/scheduled?cron=5%200,4,8,12,16,20%20*%20*%20*&format=json'
```

Poll admin status until `completedAt` is set. Restart the same local state with
`--var PLAN_COMPUTE_MODE:cache-only`, invoke the cron again (it must skip compute), and run
`ADMIN_TOKEN=local-prewarm-test node scripts/verify-prewarm.mjs http://127.0.0.1:8815`.
Stop only your own Wrangler process tree after checking port ownership and command lines.
See `docs/PREWARM-VERIFICATION.md` for recorded results, not production CPU claims.
