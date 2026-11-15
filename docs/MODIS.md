# MODIS historical vegetation evidence

`GET /api/vegetation?lat=38.1095&lon=-100.706&year=2025` is independent of `/api/plan`. `VegetationCard` starts its own request after a plan exists and displays Loading / unavailable without holding up plan results. Field changes abort the browser request. The coarse nominal 250 m point pixel is not a field measurement or field-area coverage. Missing remains null; no temporal interpolation or low-NDVI bare-soil inference.

## Slow upstream and response format

ORNL DAAC TESViS synchronous subsets permit **at most ten composite dates** per request. A full completed year needs three maximum-size batches (10 + 10 + 3), plus one date-inventory request. Requests remain sequential to avoid multiplying load on the public service. Each upstream request has a 60-second header timeout and at most one retry, not the previous 10-second timeout / two retries. Cold requests can take minutes; prefetch before a demo, do not put this in the hourly cron or a `waitUntil` task. No deployed Worker resource-limit claim is implied by local verification.

Live terminal probes on 2026-11-15 (seconds, HTTP 200): products 5.344; Finney dates 7.287; one composite (A2025193) 10.828; ten composites (A2025001–A2025145) 52.698. An initial A2025185 request returned 400 in 2.278 s: it is not a valid 2025 16-day composite start; this was corrected, not counted as availability evidence. Other observations that morning were ~29–32 s, so endpoint availability alone does not establish a usable 10-second timeout.

Current JSON subsets **omit version and granule title**. The adapter requests `Accept: text/csv` instead: the native id includes product, composite date, tile, **061**, processing timestamp and band. It validates these plus the exact coordinate and one-pixel sample/line label. It never fills in a missing JSON version or relabels the official old 006 example. Strict reliability=0 and detailed good-land/no-adjacent-cloud/mixed-cloud/snow/shadow QA remain required. Cache key is `modis:MOD13Q1:061:qa-v2-csv:<lat>:<lon>:<year>`, TTL 30 days, memory + D1.

`test/fixtures/modis/ornl-live-061.json` retains a small real CSV response, URL, request format, retrieval timestamp and explicit product/version. Finney A2025193 has raw NDVI 3406 → 0.3406, reliability 0, detailed QA 2116, acquisition day 204 (2025-07-23), tile h10v05. This reconciles provider values/scaling/QA, not independent satellite radiometric validation.

## Warm the four demo points

Set the existing Worker `ADMIN_TOKEN` secret out of band, then run (Node 22+):

```bash
ADMIN_TOKEN=... node scripts/prefetch-modis.mjs https://your-worker.example 2025
```

The default year is the previous UTC year, matching the dashboard's latest completed climate year. The script calls **ADMIN_TOKEN-protected** `POST /api/vegetation/prefetch` for Finney KS (38.1095, -100.706), Story IA (42.0563, -93.495), Champaign IL (40.048, -88.33), Lancaster NE (40.73, -96.55), sequentially, then reads back each public vegetation snapshot. Missing tokens fail before requests; upstream failure or no valid observations gives a nonzero exit instead of a false warm-cache success. It refuses insecure non-loopback HTTP and redirects so it cannot leak the admin token. It does not force-refresh unexpired historical snapshots. Run again after expiry or before demo readiness checks; no cron was added.

For offline-config local verification (live ORNL, local D1 only):

```bash
npx wrangler d1 migrations apply fieldshift --local -c wrangler.offline.jsonc
npm run build
npx wrangler dev -c wrangler.offline.jsonc --port 8792 --ip 127.0.0.1 --var ADMIN_TOKEN:local-test-only
ADMIN_TOKEN=local-test-only node scripts/prefetch-modis.mjs http://127.0.0.1:8792 2025
```

This warms the **local** database, not production D1. Repeat against the deployed URL after an authorized deployment; no deployment is part of this change. Confirm persistence by restarting local Wrangler and reading the same retrievedAt/value without another cold fetch. `node --test scripts/test-prefetch-modis.mjs`, `npm test`, `npm run typecheck`, `npm run build` cover the script, route authorization, CSV/QA/real source-pixel reconciliation, slow-request budget and bounded retry behavior.

## Local live demo cache verification — 2026-11-15

The admin script completed successfully for all four 2025 demo points. Every response was read back and matched the persisted local D1 JSON exactly. Each has all 23 composite slots; rejected observations remain null, not zero.

| Point | QA-valid / expected | Snapshot retrieved (UTC) | Warm GET readback |
|---|---|---|---|
| Finney KS | 23 / 23 | 14:56:56.245Z | 0.030 s |
| Story IA | 16 / 23 | 15:02:58.358Z | 0.021 s |
| Champaign IL | 17 / 23 | 15:05:45.992Z | 0.032 s |
| Lancaster NE | 21 / 23 | 15:10:19.586Z | 0.029 s |

Story, Champaign and Lancaster cold warm-up plus readback took 243.737, 167.632 and 273.584 seconds respectively. Finney was already persisted and survived a Wrangler restart. This is why warm-up is an external pre-demo job and not on the plan path. The local server was stopped and port 8792 confirmed closed; no other worktree's processes were killed. Production D1 was not touched.

Deployed narrow-screen/screen-reader checks remain a follow-up. HLS is a separate offline-precomputed evidence source in stacked PR #73, not a dynamic MODIS or Worker COG decoder.
