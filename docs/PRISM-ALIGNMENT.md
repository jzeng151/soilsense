# PRISM common-window decision and live verification

Access date: 2026-11-15. Context only: no source is truth, no source is a field observation, no ranking or Field Watch rule changes.

## Decision: bounded intervals, not invented daily alignment

NASA POWER's documented [daily API](https://power.larc.nasa.gov/docs/services/api/temporal/daily/) accepts `time-standard=UTC` (default is LST). This was verified live: API v2.10.3 returned `header.time_standard=UTC`, `PRECTOTCORR` in mm/day, and Tmin/Tmax in C. Preserve the original LST series separately; do not shift it by an integer number of dates.

The [hourly API](https://power.larc.nasa.gov/docs/services/api/temporal/hourly/) also exists and was verified live: v2.10.4, UTC, T2M in C, PRECTOTCORR in mm/hour. Its documentation describes hourly averages, but our retained evidence does not independently settle whether labels mark interval starts, centers or ends. Therefore the previous-noon-through-11:00-bin sum is explicitly **conditional and unclassified**, not asserted to be exactly aligned. Requiring 24 valid bins and retaining ±1-hour sensitivity does not itself establish timestamp anchoring. Hourly extrema are extrema of hourly means, not native PRISM daily extremes.

For a requested PRISM label range S..E, the exact target window is `[S-1 12:00 UTC, E 12:00 UTC)`. Daily UTC products bound their own rain over this same window:

- Lower = sum of complete UTC days S..E-1.
- Upper = lower + all rain on the preceding day S-1 + all rain on day E.
- Both edge allocations are unknown; never allocate half a daily total to each half-day.
- Bound width is the two edge-day total, explicitly quantified in mm. It is not a measurement-error or confidence interval. Bounds can be uninformative for short windows or wet endpoints; users may request up to 31 days.
- Every required day must have valid nonnegative rain. Missing preceding/edge/interior days invalidate the bounds; zero remains zero.
- Compare the PRISM rain sum against this range with minimum/maximum absolute difference and symmetric-percentage ranges. Suppress the entire percentage range if any possible denominator is below the 1 mm mean-rain gate. Do not assign agreement from a bound.

Temperature uses the **extreme across the entire window**, not the mean of daily minima/maxima. With at least one complete interior UTC day: window Tmin is bounded below by min(all covering daily Tmin) and above by min(interior daily Tmin); window Tmax is bounded below by max(interior Tmax) and above by max(all covering Tmax). Missing coverage or a one-PRISM-day window gives unknown bounds. POWER temporal sampling differs from native PRISM extrema; the result remains descriptive. No relative Celsius percentages.

IMERG-versus-POWER **daily UTC** can separately use matching midnight-to-midnight days. PRISM-versus-same-label daily UTC, original POWER LST and Daymet comparisons remain visibly not comparable. A suppressed near-dry screen returns `descriptive`, not `consistent`.

## Real observations and exercised paths

Point: 38 N, -101.25 E, PRISM labels 2023-05-10..12; UTC sources include May 9 for the leading edge.

| Quantity | Real acquired result |
|---|---|
| PRISM AN91d rainfall sum | 6.43 mm |
| POWER daily UTC noon-window rain | 8.51–8.53 mm; endpoint-allocation width 0.02 mm |
| PRISM–POWER absolute rain difference | 2.08–2.10 mm; symmetric difference 27.84–28.07% |
| IMERG Final V07B noon-window rain | 2.6700–2.7550 mm; endpoint-allocation width about 0.0850 mm |
| PRISM–IMERG absolute rain difference | 3.6750–3.7600 mm; symmetric difference 80.02–82.64% |
| Full-window Tmin | PRISM 9.1 C; POWER 11.08–16.40 C; absolute difference 1.98–7.30 C |
| Full-window Tmax | PRISM 33.8 C; POWER 32.06–34.23 C; absolute difference 0–1.74 C |

These residual differences cannot be attributed solely to the bounded endpoint allocations, but do not establish which estimate is more accurate. Spatial support remains different (PRISM 4 km enclosing cell, POWER 0.5 x 0.625 degrees, IMERG 0.1 degree); no spatial resampling to field measurements is claimed. Source methods and underlying inputs differ or can be shared.

PRISM RPC and returned CSV were fetched live again; monthly Norm91m, daily LST POWER and Daymet also returned through local workerd. Two IMERG Final windows were freshly retrieved using next's `retrieveSubset` and actual authenticated CMR/GES DISC DAP4 reads. The May 9..12 counts were all 48; native revisions, URLs and retrieval time are retained in fixtures. For local persistence verification, the freshly acquired, validated observations were inserted into **local-only D1** under the adapter's exact day keys, then read back through the public PRISM route. This verifies real-data cache consumption, not a deployed/admin-warm success. The optional admin-warm route's auth, limits and sanitized failure paths have offline tests; the local `.dev.vars` did not contain ADMIN_TOKEN, so no live admin token was invented or added.

Fixtures: `test/fixtures/prism/`; pure tests replay both acquired and explicitly synthetic edge/missing cases. The application contains no fabricated fallback observations.

## PRISM service choice and attribution

[Official download service documentation](https://prism.oregonstate.edu/documents/PRISM_downloads_web_service.pdf), updated 26 Mar 2025, documents `https://services.nacse.org/prism/data/get/us/4km/<variable>/<date>`: **one full-grid ZIP package per request**, default COG plus metadata/station files, optional netCDF/ASCII/BIL. It explicitly replaces the old service (retired September 2025), has duplicate-download/IP-blocking limits, and does not provide normals through that service. No documented point subset was found in this service documentation.

For a small synchronous Worker point request, retain the Explorer's verified point RPC rather than fetching/decompressing three CONUS grids per day (up to 93 grids for a 31-day request), or pretending a ZIP-wrapped COG is a directly range-addressable raster. An offline grid ingestion/subsetting pipeline is a defensible future stable-service alternative, but is not implemented or verified here. RPC service/schema changes fail to explicit unavailable; 30-day versioned caches limit requests. This remains a website RPC, **not a stable public API contract**.

The documented releaseDate endpoint was reverified: Tmax grids 2023-05-01..03 returned update 8 and release date 2024-12-17. These are metadata for those grids, not a proof that the separately acquired Explorer subset used those exact releases. Automatic per-grid release IDs remain unimplemented; AN91d/Norm91m metadata, request, raw CSV and SHA-256 pin each acquired subset.

[Terms](https://prism.oregonstate.edu/terms/) were read again: reproduced data must prominently name PRISM Group, Oregon State University, URL and access date. The card footer now displays these even when individual raw-source disclosures are closed. No PRISM map images are reproduced. Sources remain revisable; dates within six calendar months are labelled provisional/revisable rather than calling every prior-year request stable.

## Cloud setup for owner

No new bindings, packages, migrations or deployments. PRISM/POWER/Daymet require no new keys. Missing DB or provider responses remain explicit unavailable/unknown.

For optional IMERG persistence, use the existing D1 `cache` table and server-side EARTHDATA_TOKEN with the user's already-approved GES DISC permissions. Configure existing ADMIN_TOKEN only if enabling administrative warming. POST `/api/prism-crosscheck/imerg-warm?lat=<lat>&lon=<lon>&start=<UTC-day>&end=<UTC-day>` with `Authorization: Bearer <ADMIN_TOKEN>` (never a token in the URL). The route reuses next's Final V07 adapter, accepts 1–16 completed-year days, and requires D1. Warm the requested **preceding UTC day through end day**, splitting larger windows into at most 16-day batches. Warming the existing demo IMERG route also populates the same day cache for matching grid/dates. Public GET never starts Earthdata retrieval; expired/unwarmed days remain null. Local D1 warming does not warm production.

After owner deployment, repeat the live source read and browser smoke. Deployment, remote migrations, and production cache warming were deliberately not performed. Long-term RPC availability and fully independent provider confirmation of hourly timestamp anchoring remain operational/research follow-ups; the bounded comparison does not depend on resolving the latter.

## Reproduce

`npm ci`; `npm run typecheck`; `npm test`; `npm run build`. Local-only: `npm run db:migrate:local`, then `npx wrangler dev -c wrangler.offline.jsonc --port 8798`. `node scripts/verify-prism.mjs` drives the actual built Kansas planner and opt-in card at 1280/en, 320/en and 320/es, expands loaded disclosures, saves screenshots/full axe output under ignored `test-results/prism/`, and asserts no PRISM-card overflow or selected WCAG axe violations. It records whole-page overflow separately, not as a claim about the card. The observed Spanish What-if water-card overflow (340/320 px) is outside this PR's evidence-card files; zero selected axe violations is not WCAG certification.
