# IMERG access and comparison (#13)

## Status: draft, not live rainfall evidence

Authenticated terminal checks on 2026-11-15 used the server-side `EARTHDATA_TOKEN` from git-ignored `.dev.vars`. No token was printed or stored in evidence.

- CMR returned real Final granule `G2832176099-GES_DISC`, 2022-07-01, V07B, and a Late granule for 2026-11-10, V07C.
- CMR's current `opendap.earthdata.nasa.gov` service returned HTTP 403 for both products: its backend failed to read the source DMR++ from GES DISC.
- Legacy `gpm1.gesdisc.eosdis.nasa.gov/opendap/GPM_L3/.../2022/07/...` returned HTTP 200 for Final DDS/DAS metadata. Those exact responses are checked in as `test/fixtures/imerg-final-finney-20220701.{dds,das}`. The Late DDS was also reachable.
- The legacy constrained ASCII data request returned HTTP 401 with the supplied bearer credential. Metadata access is NOT successful rainfall retrieval.
- No rainfall values were retrieved, no historical bundle was invented, and no live-data success is claimed. The candidate adapter uses CMR's service links and fails closed. Both access permissions/service health and an authenticated Worker point retrieval need verification before release.

## Implemented contract

`EARTHDATA_TOKEN?: string` is the only Earthdata secret name; only DAP requests receive `Authorization: Bearer ...`. Untrusted service hosts and redirects are rejected. Responses are limited to 256 KB. Discovery is bounded to 16 days/20 results; a 14-day comparison uses at most 43 Earthdata requests (one discovery plus three per day), then one POWER request. No full HDF/NetCDF download or visitor Earthdata authentication.

`POST /api/imerg/warm/:field?end=2022-07-14&stream=final` requires the deployment's `ADMIN_TOKEN` bearer and D1. Fixed allowlisted demo fields only. Change `stream=late&end=<Field Watch dataThrough>` for a current window. Each window is 14 inclusive date labels. Operator-only warming means public visits cannot trigger Earthdata fan-out.

`GET /api/imerg/comparison/:field?end=...&stream=...` reads only the D1 comparison cache; absent/expired data is an explicit unavailable state. The Field Watch card requests Late evidence for its exact data-through date. Rule v2, POWER, and their tests are unchanged. Historical Final evidence has separate cache keys and a 30-day TTL; Late has a one-hour TTL. A successful operator warm must be read back through GET. Rewarming Late after expiry can pick up revisions; Final is never substituted for Late automatically.

Daily precipitation is the native **mm/day** mean daily rate. For fully sampled days its numeric value represents one UTC day's depth in mm. Require 48 valid half-hour samples; fill and incompletely sampled days stay null, never zero. A window total/difference remains unknown unless all 14 days are present in that estimate. Validate units, containing 0.1° grid-cell center, native dimension sizes/order and observation date.

POWER uses **LST** days, IMERG **UTC** days: these are not equivalent intervals despite shared labels. Display only qualified multi-day totals and descriptive IMERG-minus-POWER differences, not day-level agreement, truth, confidence or a new alert. A common-boundary comparison would require verified hourly reaggregation and is unmet.

## Product sources

- [Final GPM_3IMERGDF V07](https://disc.gsfc.nasa.gov/datasets/GPM_3IMERGDF_07/summary), DOI [10.5067/GPM/IMERGDF/DAY/07](https://doi.org/10.5067/GPM/IMERGDF/DAY/07): up to four months plus roughly 24 hours latency.
- [Late GPM_3IMERGDL V07](https://disc.gsfc.nasa.gov/datasets/GPM_3IMERGDL_07/summary), DOI [10.5067/GPM/IMERGDL/DAY/07](https://doi.org/10.5067/GPM/IMERGDL/DAY/07): no earlier than 14 hours after closure of the UTC day; actual delivery may lag.
- NASA GES DISC; Huffman, G.J.; Stocker, E.F.; Bolvin, D.T.; Nelkin, E.J.; Tan, J. Product-specific V07 citation at each DOI.

Hand-made protocol examples in `imerg-mocks.ts` are explicitly mocks, not recorded NASA responses. Live metadata fixtures above contain only public product metadata. After access is resolved: retrieve all four fields, verify sums against source subsets, read cache back, test Worker compatibility and inspect dashboard; do not mark draft ready based on mocked tests alone.
