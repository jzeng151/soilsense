# Regional GRACE / Kansas well comparison (#21)

## Delivered evidence and exact scope

`GET /api/groundwater?lat=38.1095&lon=-100.706` supplies a checked-in, reproducible **regional mascon time series plus three distinct nearby Finney County point wells**. Other requested fields return unavailable rather than silently substituting these wells. No rank, crop-confidence score or Field Watch rule is changed. No live deployment was performed.

## NASA Earthdata source and regional support

- **TELLUS_GRAC-GRFO_MASCON_CRI_GRID_RL06.3_V4**, NASA/JPL **RL06.3Mv04 CRI**, DOI **10.5067/TEMSC-3JC634**. [PO.DAAC product/citation](https://podaac.jpl.nasa.gov/dataset/TELLUS_GRAC-GRFO_MASCON_CRI_GRID_RL06.3_V4); [JPL mascon method](https://grace.jpl.nasa.gov/data/get-data/jpl_global_mascons/). Attribution: NASA/JPL; NASA/DLR GRACE and NASA/GFZ GRACE-FO; PO.DAAC. Watkins et al. (2015), doi:10.1002/2014JB011547; Wiese et al. (2016), doi:10.1002/2016WR019344.
- Fetched live with `Authorization: Bearer <EARTHDATA_TOKEN>` from the official PO.DAAC Earthdata archive on 2026-11-15. Exact file URL and SHA-256 are in `data/grace-wells-finney.json`. Source is `GRCTellus.JPL.200204_202609.GLO.RL06.3M.MSCNv04CRI.nc`, 46,365,171 bytes, SHA256 `3522dd579cc10326339efdecece550ba01f41b9bee599d0ed915fc35f9eafb64`, source creation 2026-11-10. Global `product_version` attribute says `v3.0` while title/collection identify RL06.3Mv04; **both are preserved**, not silently normalized.
- Product source coverage: 2002-04-16 to 2026-09-16. Small artifact: **132 calendar months, January 2015–December 2025**, with **21 explicit missing months**, including the GRACE/GRACE-FO gap. Native center dates and time bounds are retained; months are assigned from the native center time, not an invented daily measurement.
- Storage unit: **cm liquid-water-equivalent thickness anomaly**, relative to the native **2004.000–2009.999 (2004–2009)** time mean, not a well depth, groundwater-only quantity or volume pumped.
- Actual native `mascon_ID` **861** contains the demo point. Representative display-grid center **38.25, -100.75**. Bounds of the set of native display cells assigned that mascon: south37.5/north40.5/west-104.5/east-100.5; these are a gridded envelope, not an aquifer boundary or field polygon. Effective support is **~3° equal-area mascon**, despite the **0.5° display grid**. Do not count replicated display cells as independent observations.
- Use the unscaled native CRI `lwe_thickness`, no optional gain factors, extra GAD, smoothing, spatial interpolation, groundwater subtraction or rebaselining. Native mascon 1-sigma uncertainty (cm) retained; this is not a per-field uncertainty. Fill -99999 and non-finite values become null. No conversion to a farmer's well decline, pumping or irrigation allocation.
- Total terrestrial storage includes groundwater, soil moisture, surface water and snow. Uncertainty and the mass-component mixture prevent treating this as direct well validation.

## Kansas Geological Survey source, terms and selection

Verified via terminal before implementation: current [WIZARD](https://geohydro.kgs.ku.edu/geohydro/wizard/) and [disclaimer](https://geohydro.kgs.ku.edu/geohydro/wizard/wizarddisclaim.html) publicly accessible HTTP200. The old KGS WaterLevels page includes a meta-refresh to this service; the well-detail page is a frameset, so use the scientific site and measurements frame endpoints, not the parent frame page. **No blanket license or unrestricted-commercial-use claim is made.** WIZARD says information comes from multiple agencies; KGS does not guarantee freedom from errors and disclaims responsibility for interpretations/decisions. Retain attribution/disclaimer for any publication.

Reproducible POST selection: Finney county code55, Kansas20, wells with levels, 2015-01-01 through 2025-12-31. Read all **105** selected wells over three pages (50+50+5), assert count after deduplication, then sort by Haversine distance to the demo. Choose the nearest three with ≥8 calendar years containing a Jan–Mar numeric record with status `-` (no status supplied). **No trend-sign or magnitude selection criterion**. Native dates preserved; do not move December observations into the next year. Earliest qualifying winter record per calendar year enters the comparison; other retained dates stay visible. Missing locations are ineligible, not zero-distance. The script caps selection at 200 listings and 15 candidate detail requests.

| Native well ID | Location | Distance | Geological codes | Well depth | Eligible winter years |
|---|---|---:|---|---:|---:|
| 380435100422401 | 38.076291, -100.705431 | 3.693 km | QU TO | 180 ft | 11 |
| 390856100451901 | 38.148801, -100.755832 | 6.172 km | QU TO | 200 ft | 10 |
| 380333100442901 | 38.060951, -100.742033 | 6.252 km | QU TO | not supplied | 11 |

IDs, coordinates and geological codes are preserved **exactly as supplied**. In particular the second ID is not rewritten to resemble its reported latitude. Codes are source context, not proof of screened aquifer connectivity; screened intervals were not supplied. Do not infer a single uniform aquifer or hydrologic connection from nearby coordinates. Retained records carry dates, agency (DWR here), method (Steel Tape here) and status. `-` does not certify an error-free observation. These sites are irrigation withdrawal wells, so pumping/recovery and measurement timing can affect levels.

The WIZARD measurement frame says feet below land surface and renders below-surface levels as **negative signed table values**. Preserve `reportedSignedFt` exactly, label it native signed level, and interpret more negative as lower relative water level. Do not accidentally fit an unsigned-depth series and compare its positive sign to declining GRACE. Do not subtract these local signed levels from storage anomalies or claim absolute elevations/saturated thickness.

Only scientific whitelisted fields are committed. Owner/contact information, free-text remarks, access directions and personnel initials are **not retained**. Source-page hashes identify the fetched responses; dynamic session HTML may make repeat response hashes differ.

## Alignment, trends and independent checks

Pair each selected winter observation only with GRACE's **same named calendar month**, requiring both quantities. Retain the exact observation date and satellite center/bounds separately: this is monthly context, not exact daily temporal coincidence. Do not fill missing satellite months, invent annual well measurements or force a common full-year denominator. Each well exposes matched period, sample count, omitted dates, its own signed-ft/year OLS slope and the regional cm/year OLS slope calculated on **those exact same available months**. OLS x = year + (month−0.5)/12. Minimum five pairs is a demonstration coverage policy; slopes are descriptive, **not trend-significance tests**, causal attribution or forecasts. Different well records can yield different matched sets.

Independent `numpy.polyfit` and local Wrangler HTTP200 API readback agree for January2015–January2025 (2018 January GRACE missing; second well also lacks 2021):

| Well ID | Pairs | Regional storage slope cm/year | Well signed level slope ft/year |
|---|---:|---:|---:|
| 380435100422401 | 10 | -0.4262333711072 | -0.348125 |
| 390856100451901 | 9 | -0.4302511702730 | -0.4849682203390 |
| 380333100442901 | 10 | -0.4262333711072 | -0.3392803030303 |

These selected records share a declining direction, but that **does not validate the regional mascon or predict the selected field's own well**. Well-to-well variation remains visible. Vitest uses explicitly handmade disagreement, missing-year, quality-status, duplicate-month and zero fixtures; disagreement produces a visible investigation note about components, scale, pumping, timing and aquifer context, never a rewritten series or lower crop-confidence verdict. Mocked network is disabled in serving tests: the published evidence remains usable without upstream access.

## Reproduction and deployment check

```sh
uv pip install requests beautifulsoup4 h5py numpy
python scripts/grace-wells.py --vars-file .dev.vars --netcdf-cache C:/path/to/profile-scratch/grace.nc --output data/grace-wells-finney.json
npm test
npm run typecheck
npm run build
```

The guessed central Earthdata OPeNDAP path returned404 for this GRACE collection; official authenticated archive retrieval worked (including HTTP206 range and a full bounded46MB download). Therefore processing is intentionally **offline**, not a Worker attempting global netCDF decoding. The script pins file/version/hash, fails on source changes and never synthesizes replacement measurements. Workers serve only the small committed JSON through memory/D1 cache keyed to source hash and retrieval snapshot. The runtime path does not require credentials; offline regeneration does. No real deployment, R2 upload, main-branch change or PR merge was performed.

After deployment inspect the Finney card, both units/baselines, the 21 missing months, each well's matched dates/slopes, source links, and other-field unavailable state. Fresh monitoring/arbitrary-field well searches are outside this bounded demo. There is no prediction that the farmer's own well falls by the GRACE amount.
