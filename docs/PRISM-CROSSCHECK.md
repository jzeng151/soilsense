# PRISM point cross-check (#22)

## Acceptance checklist / current multi-field adaptation

- [x] Verified access and terms before implementation: public PRISM Data Explorer RPC returns point subsets without login or CONUS grid downloads. Daily AN91d and monthly 1991–2020 normals Norm91m pinned and parsed from returned CSV metadata, 4 km enclosing cell, interpolation off, SI units, PRISM 24-hour day ending at 12:00 UTC. Only completed-year 1–31-day requests allowed (stable >6 months old, not falsely called final/immutable).
- [x] Raw RPC/CSV, request parameters, product/version, source URL, acquisition timestamp, attribution, native spatial support, units, stability and SHA-256 CSV snapshot retained. Versioned memory+D1 cache; changed product/schema rejected, no silent relabeling.
- [x] Point-location NASA POWER raw daily LST Tmin/Tmax/rain and Daymet Version 4 R1 point data retained separately. Equal-weight descriptive merge shown as another diagnostic, not proof the main planner passed its whole-history Daymet coverage gate.
- [x] Absolute differences; symmetric rainfall relative difference 100×|A−B|/((|A|+|B|)/2), suppress near-dry mean <1 mm, no relative Celsius-temperature percentages. Zero stays zero; missing stays null. Configurable 25% threshold is illustrative only and never classifies boundary-mismatched data as agreement/disagreement.
- [x] Missing, disagreeing, and not-comparable independent indicators; coverage, disagreement, boundary mismatch and local-applicability reasons returned explicitly. No product is designated truth; shared underlying station information and spatial-support limitations disclosed.
- [x] Dashboard with raw estimates, differences/statuses, monthly normals, source/access attribution and limits. Main ranking, research yields and Field Watch untouched.
- [ ] True interval alignment: PRISM ends at 12UTC, POWER daily is LST, Daymet boundary is not verified by this adapter. Daily inputs cannot shift totals to common 12UTC intervals. Live comparisons are explicitly NOT COMPARABLE; differences are descriptive only. Hourly aggregation / verified aligned intervals remain needed.
- [ ] IMERG is unavailable: no verified existing adapter in origin/next. Not fabricated.
- [ ] Full common evidence-indicator integration with #53 is pending (structured evidenceReasons returned locally).
- [ ] Per-grid release dates/update numbers are not automatically retained. Dataset identifier + exact acquired CSV hash pin this subset; stable can still be revised. Published release service was verified separately below.
- [ ] Post-deploy Worker/browser smoke check and provider confirmation of long-term public RPC availability. This website RPC is used by the official explorer but is not the documented gridded-download service; keep draft until operational checks and interval work are resolved.

## Sources and live terminal checks (2026-11-15 UTC)

- PRISM Group, Oregon State University: https://prism.oregonstate.edu/explorer/ ; https://prism.oregonstate.edu/terms/ . Terms permit data reproduction/distribution and require prominent group name, URL and access date. No login or bulk download needed for the verified point RPC.
- RPC: POST https://prism.oregonstate.edu/explorer/dataexplorer/rpc.php with `call=pp/daily_timeseries`, `proc=gridserv`, `spares=4km`, `interp=0`, `stats=ppt tmin tmax`, `units=si`, `range=daily`, `start=20230501`, `end=20230503`, `lat=38`, `lon=-101.25`. Returned CSV under `/explorer/tmp/` with AN91d metadata; May 1–3 rainfall 0/0/0 mm/day, Tmin 3.1/3.6/5.9°C, Tmax 19.5/22.1/22.1°C. Generated Nov 14 2026 provider local date.
- Normals RPC uses `call=pp/monthly_normals_timeseries`, `range=monthly_normals`; returned Norm91m, Monthly 1991–2020 Normals, January rain 10.29 mm, Tmin −8.3°C, Tmax 7.4°C. Annual precipitation 478.19 mm (not added to monthly rows).
- Release service documentation: https://prism.oregonstate.edu/documents/PRISM_downloads_web_service.pdf (Mar 26 2025). GET https://services.nacse.org/prism/data/get/releaseDate/us/4km/tmax/20230501/20230503?json=true returned update 8, release date 2024-12-17 for those Tmax grids. No grids were downloaded.
- POWER identical labels/point request returned Tmin 4.03/6.89/10.96°C, Tmax 22.86/22.5/24.56°C, rain 0/0.01/0.12 mm/day; API v2.10.3, LST. Not aligned with PRISM day boundaries.
- Daymet short point API https://daymet.ornl.gov/single-pixel/api/data?lat=38&lon=-101.25&vars=prcp,tmax,tmin&start=2023-05-01&end=2023-05-03 returned Version 4 R1 (Thornton et al. 2022, doi:10.3334/ORNLDAAC/2129), 1 km, May 1–3 rain 0/0/0, Tmax 22.90/22.35/25.29°C, Tmin 3.23/4.12/6.51°C. No false field-observation or independent-truth claim.

## Verification / remaining live checks

Mocked-network Vitest tests: real schema parsing/version rejection, zero/missing, matching/disagreeing/dry fixtures, configurable threshold, missing overlap + boundary mismatch, raw retention/hash and point-not-grid acquisition. An additional scratch-only live Vitest route smoke passed against all four real upstream requests: AN91d and Norm91m fetched and parsed, POWER and Daymet each returned three days, and the first pairwise diagnostic was not_comparable. This probe is outside the repository and is not part of offline CI. `npm test`, `npm run typecheck`, `npm run build` pass. No Cloudflare login/deploy.

After deploy: open the card for demo and non-Kansas fields, inspect all three upstreams and normals, cache hit/raw hashes, PRISM public-service availability, source outage/partial coverage, UI mobile table overflow; verify all imported evidence mounts remain inside the canonical shared block. This PR adds that block because origin/next lacked it at branch time; reconcile with parallel layout changes.
