# IMERG access and comparison (#13)

## Verified live access (2026-11-15)

The account holder accepted GES DISC terms. Actual binary DAP4 point retrieval now succeeds for **GPM_3IMERGDL V07 Late, V07C**, UTC day **2026-11-13**, at all four allowlisted demo cells. Independently requested constrained ASCII confirms Story 0, Champaign 0.045, Finney 0 and Lancaster 0 mm/day, with 48 samples each. `test/fixtures/imerg-live/` contains exact binary responses, readable excerpts, full DMR metadata and a credential-free URL/hash/retrieval manifest. Zeroes are actual observations, never replacements for missing.

The production adapter validates the CMR product/date/native filename and uses the verified legacy `gpm1.gesdisc.eosdis.nasa.gov/opendap/GPM_L3/` Hyrax DAP4 service, not the cloud DMR++ service that previously failed. Metadata and singleton binary `.dap?dap4.ce=...` replace DAP2 DDS/ASCII. The decoder checks chunk flags/endian, singleton dimensions, per-variable CRC32, variables, date/grid/units and Float32 fill equality. It supports Int8 and Int16 counts; this verified legacy response uses Int16. `.dap.csv` returned blank precipitation/count cells and `.json` malformed adjacent grid objects despite valid binary data: neither is used. A successful status/metadata response alone is still not evidence.

## Implemented contract

`EARTHDATA_TOKEN?: string` is the only Earthdata secret name; only DAP requests receive `Authorization: Bearer ...`. Untrusted service hosts are rejected. Bearer authorization follows at most four redirects, only to exact verified GES DISC and `urs.earthdata.nasa.gov` HTTPS hosts. Responses are limited to 256 KB and each fetch to 90 seconds. Discovery is bounded to 16 days/20 results; a 14-day comparison normally uses 29 Earthdata requests (one discovery plus two per day), then one POWER request, excluding bounded auth redirects. Validated per-day points are cached so timeouts do not discard earlier days. No full HDF/NetCDF download or visitor Earthdata authentication.

`POST /api/imerg/warm/:field?end=2022-07-14&stream=final` requires the deployment's `ADMIN_TOKEN` bearer and D1. Fixed allowlisted demo fields only. Change `stream=late&end=<Field Watch dataThrough>` for a current window. Each window is 14 inclusive date labels. Operator-only warming means public visits cannot trigger Earthdata fan-out.

`GET /api/imerg/comparison/:field?end=...&stream=...` reads only the D1 comparison cache; absent/expired data is an explicit unavailable state. The Field Watch card requests Late evidence for its exact data-through date. Rule v2, POWER, and their tests are unchanged. Historical Final evidence has separate cache keys and a 30-day TTL; Late has a one-hour TTL. A successful operator warm must be read back through GET. Rewarming Late after expiry can pick up revisions; Final is never substituted for Late automatically.

Daily precipitation is the native **mm/day** mean daily rate. For fully sampled days its numeric value represents one UTC day's depth in mm. Require 48 valid half-hour samples; fill and incompletely sampled days stay null, never zero. A window total/difference remains unknown unless all 14 days are present in that estimate. Validate units, containing 0.1° grid-cell center, native dimension sizes/order and observation date.

POWER uses **LST** days, IMERG **UTC** days: these are not equivalent intervals despite shared labels. Display only qualified multi-day totals and descriptive IMERG-minus-POWER differences, not day-level agreement, truth, confidence or a new alert. A common-boundary comparison would require verified hourly reaggregation and is unmet.

## Product sources

- [Final GPM_3IMERGDF V07](https://disc.gsfc.nasa.gov/datasets/GPM_3IMERGDF_07/summary), DOI [10.5067/GPM/IMERGDF/DAY/07](https://doi.org/10.5067/GPM/IMERGDF/DAY/07): up to four months plus roughly 24 hours latency.
- [Late GPM_3IMERGDL V07](https://disc.gsfc.nasa.gov/datasets/GPM_3IMERGDL_07/summary), DOI [10.5067/GPM/IMERGDL/DAY/07](https://doi.org/10.5067/GPM/IMERGDL/DAY/07): no earlier than 14 hours after closure of the UTC day; actual delivery may lag.
- NASA GES DISC; Huffman, G.J.; Stocker, E.F.; Bolvin, D.T.; Nelkin, E.J.; Tan, J. Product-specific V07 citation at each DOI.

Hand-made protocol examples in `imerg-mocks.ts` and synthetic DAP4 mutation cases are explicitly mocks, not additional NASA observations. `imerg-live/` holds actual retrieved observations; the older Final DDS/DAS files are metadata only. Current live data verification here is Late; no historical Final rainfall bundle or deployed cron is claimed. No real deployment or remote migration was run. POWER LST and IMERG UTC intervals remain non-equivalent; do not close that original issue criterion as if hourly common-boundary reaggregation existed.
