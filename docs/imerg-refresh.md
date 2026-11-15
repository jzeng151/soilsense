# IMERG second-product daily refresh (#24)

## Live access recovered; publication verification

The independent `ImergRefreshWorkflow` joins the **existing daily 05:43 UTC refresh cron**, alongside POWER. Failures in one product do not stop the other; `runPowerRefresh`, its storage, historical streams, Field Watch rule v2 and existing POWER tests are unchanged.

On 2026-11-15, after the account holder accepted GES DISC terms, authenticated binary DAP4 observations succeeded for **GPM_3IMERGDL V07 Late, V07C**, at all four demo cells for UTC 2026-11-13. The production client uses CMR-validated native filenames on verified legacy NASA GES DISC Hyrax, strict singleton DAP4 decoding, CRC32, date/grid/units/count/fill checks and exact NASA-only Bearer redirects. It no longer depends on cloud DMR++ availability or DAP2 DDS. The verified legacy count type is Int16; Int8 is also supported. `.dap.csv` blank precipitation/count cells and malformed `.json` output are not used.

`test/fixtures/imerg-live/` preserves exact binary responses, independently requested ASCII excerpts, DMR metadata and credential-free source URLs/hashes/retrieval timestamps. The four point values were Story 0, Champaign 0.045, Finney 0 and Lancaster 0 mm/day, all with count 48. Real local Worker 14-day replays for all four cells ending Nov 13 and Nov 12 are also saved; Python independently recomputed totals. In the Nov 13 comparison POWER was genuinely missing that day, so POWER totals/differences remain null; no values were substituted.

The older Final DDS/DAS fixtures remain metadata only. No newly retrieved Final rainfall bundle, full-grid fallback or deployment is claimed. All synthetic protocol/mutation/revision cases remain clearly labeled mocks.

## Publication policy

- Product: NASA GES DISC **GPM_3IMERGDL V07 Late**, 0.1° × 0.1°, native daily precipitation **mm/day**, UTC day. Full sampling requires all 48 half-hour observations. Missing remains null at acquisition; any missing/incompletely sampled day rejects a current snapshot.
- Discover the newest completed UTC day in CMR (bounded 16-day search); retrieve exactly 14 days for each distinct demo grid cell. Validate product, version, processing stream, grid center, units, UTC day, all daily sample counts and completeness. Reject data-through age >3 days, future/incomplete UTC days and malformed periods. Retrieval time is never a freshness proxy.
- Four fixed demo farms only. One request set per shared grid cell; no private/user-supplied fields or URLs. A 14-day cell normally uses 29 requests (discovery plus DMR and constrained DAP4 data per day), excluding bounded auth redirects and one transient retry per request. Metadata and validated per-day points are cached and shared across fields/windows; each response is bounded to 256 KB, each fetch to 90 seconds. Workflow fetch step retries at most twice; validation never retries; publication retries three times. Daily instance IDs deduplicate repeated cron starts. Current subsets cache one hour, separately from Final's 30-day historical cache. Cost is bounded, not claimed to have been benchmarked in production.
- R2 source subset plus content-addressed immutable bundle is written first. One D1 transaction inserts the snapshot, moves per-farm current pointers, records attempts and inserts accepted-event rows. If either stage fails, last-good pointers remain. An orphan R2 object is safe and reused by retry. D1 and R2 are required for IMERG publication.
- Content hashes exclude retrieval time and field identity. Repeated equal content is unchanged. Revised same-period Late data receives a new hash and replaces the pointer in run-time order; newer periods supersede older ones. Older end dates never roll back current pointers. Historical **Final GPM_3IMERGDF** is separate and never silently replaces Late. Retained immutable objects preserve revisions.
- `imerg_snapshot_events` is a transactionally inserted accepted-snapshot feed, keyed by farm+snapshot. `acceptedImergFor` exposes usable/missing/stale status for weekly/window consumers. No new alert rule or change to the existing Dry/Watch/OK decision. Active weekly/window checks now call the gate through `evaluateLive`, read the exact immutable R2 snapshot, recheck its containing cell/completeness/content hash, and persist an `imergContext` on the saved run. The UI displays its 14-day UTC total beside POWER LST summed over the same date labels (null when incomplete), not necessarily the older POWER decision window. No day-boundary equivalence or delta/confidence claim is made. Missing migration/bindings/snapshot, stale data, corrupt bundles or storage errors fall back to the unchanged POWER-only check. Historical replay and inactive checks do not acquire current IMERG context. Saved runs retain the evidence seen at evaluation; reruns do not rewrite history.

## Local live verification (2026-11-15)

`npx wrangler dev -c wrangler.offline.jsonc --port 8793 --ip 127.0.0.1` used ignored `.dev.vars`, local D1 and local R2; migration **0006** was applied locally after the already-present **0007** without renumbering either. A manual POST returned 202; the same-minute duplicate returned 200/created=false. CMR's actual newest day advanced to **2026-11-14**. All four complete Nov 1–14 Late snapshots became usable/published, and every public manifest and R2 bundle read returned 200 with 14 real observations. A later manual instance returned unchanged for all four, preserving identical snapshot IDs. D1 read-back showed exactly four snapshots, four current pointers and four accepted events. Responses are saved as `imerg-live/refresh-20261114.json` and `refresh-rerun-20261114.json`. Their sums: Story 46.82500037737191, Champaign 10.804999720305204, Finney 19.26499963272363, Lancaster 21.3949983259663 mm.

Live workerd exposed a bug Node mocks did not: `redirect: "error"` is unsupported at the edge. Discovery now uses `redirect: "manual"` and rejects non-OK redirects, with a regression test. The local server was stopped and port 8793 verified closed. No real deployment, remote D1 migration, production cron run or genuinely revised provider product was exercised. Revision/outage/partial-data retention remain deterministic tests, not claimed live provider events. Consumer integration is now covered by SQLite-backed weekly/window replays with recorded real IMERG observations; POWER inputs in those decision-invariance tests are explicitly constructed, not observed.

## Cloud setup for owner

Default `wrangler.jsonc` intentionally does **not** bind IMERG_REFRESH: deploying this PR requires no new Cloudflare resources. The Env binding and scheduled start are optional; absent/missing/stale IMERG never prevents a POWER check. `wrangler.offline.jsonc` enables the Workflow only for local verification (do not use it as the production deployment config).

To opt in after review (not executed remotely here):
1. Apply additive migration `0006_imerg_snapshots.sql` to the existing D1 database; do not renumber existing 0007.
2. Reuse the existing `DB` and `EVIDENCE` bucket bindings; no new bucket/database is needed.
3. Add `{ "name": "soilsense-imerg-refresh", "binding": "IMERG_REFRESH", "class_name": "ImergRefreshWorkflow" }` to the existing `workflows` array in your deployment config, preserving POWER_REFRESH and DOC_INGEST. This reuses the daily 05:43 UTC cron.
4. Set `EARTHDATA_TOKEN` with `npx wrangler secret put EARTHDATA_TOKEN`; the account holder must accept applicable GES DISC terms themselves. Never put credentials in config or Git. Configure ADMIN_TOKEN separately for manual starts.
5. Start a refresh and read status, manifests and bundles back before claiming IMERG availability. Missing resource/migration means context unavailable, not an alert failure.

 `POST /api/refresh/imerg/run` is `ADMIN_TOKEN`-protected; public `/api/refresh/imerg/status` exposes dates, freshness and last attempt, never credentials. `/api/refresh/imerg/snapshots/:id` and `/bundle` serve accepted evidence only.

Verify after deploy: an authenticated real 14-day point subset for each distinct demo cell; original-source sums; repeat-run deduplication; a real revised Late product; upstream outage with last-good retention; R2/D1 status and manifest read-back; cron execution and actual event consumption. No claim of current data should be made while these are unverified.

IMERG daily UTC and POWER daily LST are **not aligned day-for-day**. Their multi-day totals are descriptive independent context; neither is field truth or agronomic confidence. #13's optional comparison and historical cache do not depend on this Workflow. The merged #71 comparison routes and this Workflow both import the single `src/worker/imerg/client.ts` / `dap4.ts` adapter; no second adapter is introduced.

## Current-next scheduled-event verification (2026-11-15)

After merging current `origin/next`, including #71, a **fresh isolated local D1/R2/Workflow state directory** was migrated locally (IMERG stays `0006`). Ignored `.dev.vars` supplied real provider access; no deployment or remote migration was run.

```sh
npx wrangler dev -c wrangler.offline.jsonc --test-scheduled --port 8796 --ip 127.0.0.1 --persist-to <native-scratch>/imerg-scheduled-state
curl --fail 'http://127.0.0.1:8796/__scheduled?cron=43%205%20*%20*%20*'
npx wrangler workflows instances describe soilsense-imerg-refresh imerg-daily-2026-11-15 --local --port 8796 --json -c wrangler.offline.jsonc
```

The first trigger attempt exposed a local verification trap: static SPA routing returned HTTP 200 **HTML** instead of running the scheduled handler. The offline config now includes `/__scheduled` in `assets.run_worker_first`; it then returned `Ran scheduled event`. A regression test guards that route and the default-config opt-out, plus independent POWER dispatch when IMERG is absent or fails to start.

The actual scheduled handler started both product Workflows. IMERG instance `imerg-daily-2026-11-15` completed from **22:49:53.818Z to 22:50:43.411Z**, publishing all four real **Nov 1–14 Late V07C** windows. All public status/manifest/bundle responses were read back; Python independently checked four fields, fourteen distinct observed days each, count 48 throughout, exact manifest/bundle agreement and totals. The immutable IDs and totals matched the earlier real fixtures exactly: **no provider revision was observed**. POWER also published four cells independently.

A repeated scheduled trigger retained the same daily instance. A new local manual Workflow instance (`wrangler workflows trigger ... --local --port 8796`, not an HTTP authorization bypass) completed with all four outcomes `unchanged`. That repeat reused the valid one-hour observation cache; it is **not** an independent fresh-provider revision probe. D1 read-back after the repeat contained exactly **4 snapshots, 4 current pointers, 4 accepted events**. `scheduled-20261115.json` and `scheduled-repeat-20261115.json` retain the real Workflow summary and public storage read-backs. Unit-test failure/revision cases remain explicitly constructed simulations.

Both deployment-config dry runs passed with `--outdir C:/Users/steve/AppData/Local/hermes/profiles/renshuu/cache/scratch/dryrun-imerg`: default has POWER_REFRESH/DOC_INGEST but **no IMERG_REFRESH**; `-c wrangler.offline.jsonc` explicitly opts in. Dry runs are not deployed binding verification.

### Still unmet / deployed checks

- Observe actual Cloudflare 05:43 UTC cron delivery (not the locally invoked scheduled-event handler), remote migration/binding/secret permissions, successful remote Workflow/storage read-back and production weekly/crop-window timer consumption. The local handler check closes only the local scheduler-to-Workflow path.
- Observe a genuinely revised same-period Late provider subset after cache expiry; compare source observations/hash, retain the old immutable object, verify the new current pointer and one new accepted event per field, and confirm historical Final/replays remain independent. Today's real observations were unchanged, so this criterion stays open.
- Observe an actual upstream outage/access error or partial product through the real deployed pipeline; verify bounded retries, sanitized visible attempt status, unchanged last-good pointer/events and stale-context fallback as the observed-day age increases. No actual outage/partial product occurred in this run. Deterministic failure tests do not close this live-provider criterion.

The integration remains **draft** pending these operational/provider criteria; it is conflict-resolved and locally verified, not claimed production-verified.

## Primary sources and attribution

- [GPM_3IMERGDL V07 Late](https://disc.gsfc.nasa.gov/datasets/GPM_3IMERGDL_07/summary), [DOI 10.5067/GPM/IMERGDL/DAY/07](https://doi.org/10.5067/GPM/IMERGDL/DAY/07): no earlier than 14 hours after closure of the UTC day; delivery can lag.
- [GPM_3IMERGDF V07 Final](https://disc.gsfc.nasa.gov/datasets/GPM_3IMERGDF_07/summary), [DOI 10.5067/GPM/IMERGDF/DAY/07](https://doi.org/10.5067/GPM/IMERGDF/DAY/07): up to four months plus about 24 hours.
- NASA GES DISC; Huffman, G.J.; Stocker, E.F.; Bolvin, D.T.; Nelkin, E.J.; Tan, J. Use the product-specific V07 citation at the linked DOI.
