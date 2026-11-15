# Historical hot-year exposure and event catalog (#39)

## Acceptance checklist / adaptation

- [x] Transparent hot-year rule fixed before selection: raw, unshifted NASA POWER Tmax, corn July 1–August 31 reference window, sum max(0,Tmax−30°C), all 62 highs required. 30°C is an illustrative demonstration screen, not a calibrated stage-specific response model. Candidates 1991 through the most recent completed year. Missing/absent summers excluded; all ties retained, earliest only for display.
- [x] Read-only `/api/historical-scenarios` returns dates, requested point/grid, source URL/product, units, LST, source resolution, exact parsed input and configuration, parser/config versions, SHA-256 snapshot and scenario IDs. Reproducible JSON round trip. Existing POWER memory+D1 cache reused.
- [x] Reference (mean over eligible summers with denominator years), explicit 2022 path, and hot-year selector. No change to existing drought replay, research yields, annual allocations, prices, current rankings or confirmed calendars. This adapts the older single-field rotation replay ask into a separate weather-exposure sensitivity for the current multi-field engine. It does not run a new yield simulation.
- [x] Official regional event catalog: 2012 Central-US/Corn-Belt drought; 2022 Southern Plains drought; 2023 Kansas statewide winter-wheat planted/grain-harvested acreage context. Catalog context is explicitly distinct from executable POWER summer diagnostics. No forecast or preferred winner.
- [x] Statewide 2023 acreage is regional context, not a field yield/loss prediction. Distinguishes not harvested for grain from complete crop loss or solely drought attribution.
- [x] Missing rain independent of heat eligibility; reference rainfall denominators shown. Gaps, narrative/point conflicts, ties and unchanged rankings allowed without tuning.
- [ ] Persistent publication/archive of a selected snapshot across deployments is not implemented. Exact parsed snapshot is returned for saving, but the existing rolling POWER cache does not retain original API release metadata/retrieval timestamp; its parser can discard globally incomplete years (shown as absent/ineligible here).
- [ ] Independent agronomist review and post-deploy browser/D1 smoke checks.

## Primary sources (accessed 2026-11-15)

- NASA POWER API (terminal verified for 38,-101.25, May 1–3 2023): https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M_MIN,T2M_MAX,PRECTOTCORR&community=AG&latitude=38&longitude=-101.25&start=20230501&end=20230503&format=JSON&time-standard=LST ; live API version v2.10.3. Existing history parser/cache is `power:v1`, not relabeled with an unpreserved release ID.
- NOAA NIDIS/state climatologists, 2012 assessment, published Jan 5 2015: https://www.drought.gov/documents/too-much-too-little-how-central-us-drought-2012-evolved-out-one-most-devastating-floods
- NOAA NIDIS, Dec 9 2022 regional report: https://www.drought.gov/drought-status-updates/southern-plains-drought-status-update-2022-12-09 (only historical conditions reused, not its outlook).
- USDA NASS Agricultural Statistics Board briefing, Sep 29 2023, *2023 Winter Wheat — Acreage, Yield, and Production*, Kansas row: https://www.nass.usda.gov/sites/default/files/Newsroom/Executive_Briefings/2023/09-29-2023.pdf . 8,100 and 5,750 thousand acres planted / harvested for grain. Derived unharvested-for-grain share = (8,100−5,750)/8,100 ×100 = approximately 29.0%. The older Kansas Wheat History PDF URL returned HTML rather than a PDF in terminal; it is deliberately not used for the card or the historical-superlative claim.

## Verification

Vitest: independent 124/62 degree-day examples, tied maxima, no forced 2022 winner, absent/incomplete-year exclusion, true zero rainfall, missing rainfall, unchanged input, JSON round trip, route with mocked upstream and snapshot digest. `npm test`, `npm run typecheck`, `npm run build` pass.

Live checks remaining after deploy: request the endpoint at demo and non-Kansas locations; download returned inputs and reproduce selection/hash; confirm cache hit and outage behavior; check UI selector and all evidence mounts; confirm existing bad-year replay and Field Watch unchanged. No Wrangler deploy/login performed.

Integration: origin/next lacked the shared App evidence block at branch time. Only additive import/block/mount changes; consolidate inside the canonical block with the parallel layout PR.
