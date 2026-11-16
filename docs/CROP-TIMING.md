# Corn timing sensitivity (#42)

## Acceptance and adaptation to multi-field SoilSense

- [x] Separate read-only `/api/crop-timing` and dashboard evidence card for any contiguous-US point and a completed year. No change to research yields, ranking, irrigation, pinned plans or Field Watch.
- [x] POWER raw responses retained with observation dates, units, LST, API version, retrieval time, SHA-256 snapshot ID, request URL, snapped grid point and native resolution. Cache/parser key `timing-power:v1` uses memory + D1. Null/fill and absent dates remain gaps.
- [x] Versioned corn configuration: K-State June 18 2026; assumed 110-day hybrid, accumulation inclusive of assumed planting. Tmax capped at 86°F, Tmin floored at 50°F, negative daily heat zero. Emergence 90–120, silking 1,500, maturity 2,670 Fahrenheit degree-days. Celsius degree-days = Fahrenheit degree-days / 1.8 (not a temperature conversion).
- [x] Missing temperature invalidates subsequent threshold crossings; already crossed stages remain available. Unreached thresholds have no date. Independent heat/rain gaps return null, not zero.
- [x] Stage dates plus fixed July–August exposure and illustrative ±7-day silking exposure shown side by side. Unequal durations explicitly stated; not interchangeable totals, not a biological stress-window calibration. Weather threshold >30°C is illustrative, not a yield model.
- [x] Wheat explicitly unsupported for year-specific stages: existing reference calendar retained. No generic corn model applied to wheat or sorghum.
- [x] Read-only `estimated-stage-window-v1` scheduler contract, requires confirmation, no scheduling side effects.
- [ ] Separate complete sourced sorghum configuration/model.
- [ ] Documented wheat model evaluation with matched cultivar, vernalization and photoperiod inputs.
- [ ] 2–3-season NASS silking benchmark table, verified county-to-district mapping, weekly 50% bracket/missing-report intervals and discrepancy investigation. NASS_API_KEY was absent in the build shell. UI/API say unavailable; even if configured the benchmark adapter is not yet implemented. No invented regional or field validation.
- [ ] External agronomist review of planting/hybrid and stress-window assumptions.

## Sources and verification

- K-State, *Late-Planted Corn in North-Central and Eastern Kansas*, June 18 2026: https://agronomy.k-state.edu/eupdates/2026/issue-1108-june-18/late-planted-corn-2026.html (method and 110-day thresholds verified).
- NASA POWER daily API: https://power.larc.nasa.gov/docs/services/api/temporal/daily/
- NASS: https://quickstats.nass.usda.gov/api ; https://www.nass.usda.gov/Publications/National_Crop_Progress/terms_definitions.php

Terminal verification: POWER request at 38,-101.25 for May 1–3 2023 returned API v2.10.3, LST, Tmin/Tmax C and precipitation mm/day. Returned Tmin 4.03/6.89/10.96 C; Tmax 22.86/22.5/24.56 C; rainfall 0/0.01/0.12 mm/day. This checks the live API contract, not a local-stage validation. Fetch date: 2026-11-15.

Tests use independent ordinary/cold/hot examples, planting shift, temperature gap, unreached threshold, degree-day conversion, round-trip, invalid date and mocked source metadata/missing values. `npm test`, `npm run typecheck`, `npm run build` pass locally. Initial typecheck needed `npm ci` to restore the newly merged Agents dependency; no package changes.

After deploy (not deployed here): open the card, compare 2023/2024/2025 at the demo and a non-Kansas point, check D1 cache/hash stability and failure states; confirm no Field Watch state changes. Validate actual source product metadata and local agronomic relevance with an adviser. The source comparison remains draft pending the unmet requirements above.

Integration note: origin/next lacked the shared App evidence marker at branch time; the marker was added immediately before the question form. Preserve all evidence mounts inside the canonical block when integrating parallel layout changes.
