# IMERG second-product daily refresh (#24)

## Draft / live access blocked

The independent `ImergRefreshWorkflow` joins the **existing daily 05:43 UTC refresh cron**, alongside POWER. Failures in one product do not stop the other; `runPowerRefresh`, its storage, historical streams, Field Watch rule v2 and existing POWER tests are unchanged.

Authenticated terminal probes on 2026-11-15 used the supplied git-ignored `.dev.vars` / `EARTHDATA_TOKEN`, without printing its value. CMR discovers Final V07B (2022-07-01) and Late V07C (2026-11-10) granules. Current CMR cloud OPeNDAP links return **HTTP 403**, reporting a backend DMR++ read failure. Legacy Hyrax serves Final DDS/DAS and Late DDS (HTTP 200), but its constrained ASCII rainfall request returns **HTTP 401** with the supplied bearer credential. No actual rainfall subset or live refresh was accepted. `live Earthdata retrieval not yet verified`; this PR must remain draft until access is resolved and checked from the Worker. No full-grid fallback, invented observations, deployment or silent product switching.

- Follow-up live probe of the newest CMR Late granule, 2026-11-13 (`G4411794632-GES_DISC`), found a second concrete compatibility blocker: full DAP2 DDS returns HTTP 400 because six V07C count/probability variables are Int8. DAP4 DMR XML returns HTTP 200; DAP4 `.dap.csv` point retrieval returns HTTP 200 **containing an error**, not observations. The underlying provider error is `EULA Acceptance Failure`, with user-action URL https://urs.earthdata.nasa.gov/approve_app?client_id=e2WVk8Pw6weeLUKZYOxvTQ . User must review/accept provider terms themselves; no acceptance was attempted. The candidate DAP2 adapter remains intentionally unready: it must be replaced with a live-verified DAP4 point/count adapter after access is enabled. Successful metadata or HTTP 200 alone is not evidence retrieval.

The two checked-in `test/fixtures/imerg-final-finney-20220701.{dds,das}` files are exact successful public metadata responses from the legacy service, not precipitation observations. Their source is `https://gpm1.gesdisc.eosdis.nasa.gov/opendap/GPM_L3/GPM_3IMERGDF.07/2022/07/3B-DAY.MS.MRG.3IMERG.20220701-S000000-E235959.V07B.nc4` plus `.dds` / `.das`. Other test precipitation is clearly labeled hand-made mocks.

## Publication policy

- Product: NASA GES DISC **GPM_3IMERGDL V07 Late**, 0.1° × 0.1°, native daily precipitation **mm/day**, UTC day. Full sampling requires all 48 half-hour observations. Missing remains null at acquisition; any missing/incompletely sampled day rejects a current snapshot.
- Discover the newest completed UTC day in CMR (bounded 16-day search); retrieve exactly 14 days for each distinct demo grid cell. Validate product, version, processing stream, grid center, units, UTC day, all daily sample counts and completeness. Reject data-through age >3 days, future/incomplete UTC days and malformed periods. Retrieval time is never a freshness proxy.
- Four fixed demo farms only. One request set per shared grid cell; no private/user-supplied fields or URLs. A 14-day cell uses 43 requests (discovery plus DDS/DAS/constrained ASCII per day). Workflow fetch step retries at most twice; validation never retries; publication retries three times. Daily instance IDs deduplicate repeated cron starts. Current subsets cache one hour, separately from Final's 30-day historical cache. Cost is bounded, not claimed to have been benchmarked in production.
- R2 source subset plus content-addressed immutable bundle is written first. One D1 transaction inserts the snapshot, moves per-farm current pointers, records attempts and inserts accepted-event rows. If either stage fails, last-good pointers remain. An orphan R2 object is safe and reused by retry. D1 and R2 are required for IMERG publication.
- Content hashes exclude retrieval time and field identity. Repeated equal content is unchanged. Revised same-period Late data receives a new hash and replaces the pointer in run-time order; newer periods supersede older ones. Older end dates never roll back current pointers. Historical **Final GPM_3IMERGDF** is separate and never silently replaces Late. Retained immutable objects preserve revisions.
- `imerg_snapshot_events` is a transactionally inserted accepted-snapshot feed, keyed by farm+snapshot. `acceptedImergFor` exposes usable/missing/stale status for weekly/window consumers. No new alert rule or change to the existing Dry/Watch/OK decision. Active weekly/window consumer wiring remains a separate integration check; this PR does not pretend a helper is already consumed.

## Operations

After review/access repair (not executed here): apply additive `0006_imerg_snapshots.sql`, bind `IMERG_REFRESH` / `ImergRefreshWorkflow`, D1 and the existing EVIDENCE bucket; provision `EARTHDATA_TOKEN` as a Cloudflare secret. Both checked-in Wrangler configs add only the new Workflow entry, reusing the daily cron. `POST /api/refresh/imerg/run` is `ADMIN_TOKEN`-protected; public `/api/refresh/imerg/status` exposes dates, freshness and last attempt, never credentials. `/api/refresh/imerg/snapshots/:id` and `/bundle` serve accepted evidence only.

Verify after deploy: an authenticated real 14-day point subset for each distinct demo cell; original-source sums; repeat-run deduplication; a real revised Late product; upstream outage with last-good retention; R2/D1 status and manifest read-back; cron execution and actual event consumption. No claim of current data should be made while these are unverified.

IMERG daily UTC and POWER daily LST are **not aligned day-for-day**. Their multi-day totals are descriptive independent context; neither is field truth or agronomic confidence. #13's optional comparison and historical cache do not depend on this Workflow. Both PRs contain the same candidate point client so each branches independently from `origin/next`; keep one identical client on integration.

## Primary sources and attribution

- [GPM_3IMERGDL V07 Late](https://disc.gsfc.nasa.gov/datasets/GPM_3IMERGDL_07/summary), [DOI 10.5067/GPM/IMERGDL/DAY/07](https://doi.org/10.5067/GPM/IMERGDL/DAY/07): no earlier than 14 hours after closure of the UTC day; delivery can lag.
- [GPM_3IMERGDF V07 Final](https://disc.gsfc.nasa.gov/datasets/GPM_3IMERGDF_07/summary), [DOI 10.5067/GPM/IMERGDF/DAY/07](https://doi.org/10.5067/GPM/IMERGDF/DAY/07): up to four months plus about 24 hours.
- NASA GES DISC; Huffman, G.J.; Stocker, E.F.; Bolvin, D.T.; Nelkin, E.J.; Tan, J. Use the product-specific V07 citation at the linked DOI.
