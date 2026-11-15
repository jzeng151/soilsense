# HLS vegetation evidence (#19)

This PR stacks on draft #61 (MODIS), merged with `next`. HLS and MODIS remain separate evidence sources and cannot change engine rankings, yields, confirmed Field Watch state or pinned scenarios.

## Deliberately offline extraction

A Python/GDAL build-time script reads **3×3 native 30 m pixels (90×90 m)** around each exact demo point. The Worker serves the resulting small public JSON through `/api/hls?lat=...&lon=...`; it does not decode COGs, forward tokens or fetch whole satellite tiles during a page request. Other coordinates explicitly return unavailable rather than borrowing a neighboring field's sample.

Worker CPU/memory/subrequest feasibility of five-band COG decoding and the authenticated redirect chain has **not** been established. The reproducible offline artifact is the bounded implementation here, not a claim of a completed dynamic Worker decoder. No rasterio dependency is added to the app.

Reproduce from the repository using the ignored `.dev.vars` (or `EARTHDATA_TOKEN` environment variable):

```bash
uv run --python 3.12 --with rasterio==1.4.3 --with requests==2.32.5 python scripts/build-hls-evidence.py 2>/dev/null
uv run --python 3.12 --with rasterio==1.4.3 --with requests==2.32.5 python -m unittest discover -s scripts -p test_hls.py
npm test
npm run typecheck
npm run build
```

GDAL error output is suppressed because it can include temporary signed URLs. Script failure messages never contain exception text, bearer credentials or signed redirects. Only original LP DAAC asset URLs are retained. Verified Earthdata responses redirect to `d1nklfio7vscoe.cloudfront.net`; the script explicitly allowlists that host, LP DAAC and AWS, and does not forward Authorization to CloudFront. Every band's recorded HTTP range probe returned 206 with Content-Range. No token or signed URL is committed.

Python 3.14 plus rasterio 1.4.3 had no suitable wheel in this environment and tried an unsupported GDAL source build; the reproducible command deliberately selects Python 3.12 instead.

## Product, bands, masks and aggregation

- NASA LP DAAC **HLSL30/HLSS30 v2.0** (`HLSL30.020` / `HLSS30.020` assets). Search CMR-STAC for each sensor and exact point in July 2025. Choose one lowest tile-cloud-cover candidate per sensor; this is an explicit convenience sample, not unbiased seasonal sampling. Retain all candidate IDs, selection/search URLs, exact observation timestamps and asset URLs.
- L30: red B04, narrow NIR B05, SWIR1 B06, SWIR2 B07. S30: red B04, narrow NIR B8A, SWIR1 B11, SWIR2 B12. Reflectance = signed DN × **0.0001**, offset **0**; fill **-9999**, valid documented range -2000…16000. Do not use Landsat Collection 2's different scale/offset.
- HLS v2 Fmask: reject fill 255, cloud bit 1, cloud/shadow adjacency bit 2, shadow bit 3, snow bit 4, water bit 5, and high aerosol (bits 6–7 both set). Bit 0 is reserved in v2, not a separate active cirrus class. Medium/low/climatology aerosol are retained and raw masks are visible.
- Compute NDVI `(NIR−red)/(NIR+red)` per clear valid pixel, reject nonpositive denominator and out-of-range NDVI, then average valid NDVI. This is not NDVI of spatially averaged reflectance. Genuine zero is retained. All excluded/missing values remain null. Raw DN, scaled red/NIR/SWIR values, original Fmask, exclusion reasons, pixel window/geotransform/bounds, UTC date and subset SHA-256 survive in JSON.
- Share is **clear valid NDVI pixels / 9 sampled pixels**, not field-area coverage. Mixed pixels, non-field pixels and native sensor resampling remain limitations. Low NDVI does not prove bare soil. No temporal interpolation or cross-sensor fusion; historical measurements are not observations of proposed rotations.

## Live evidence — 2026-11-15

The committed `web/public/data/hls-demo.json` was produced from live CMR and authenticated LP DAAC COGs, not synthetic observations. All four exact dashboard demo coordinates are present. Full precision is retained in JSON; values below rounded for readability.

| Demo point | L30 date / mean NDVI / valid pixels | S30 date / mean NDVI / valid pixels |
|---|---|---|
| finney-ks, 38.1095 -100.706 | July 28 / 0.2580 / 9 of 9 | July 8 / 0.2931 / 9 of 9 |
| story-ia, 42.0563 -93.495 | July 23 / 0.9024 / 9 of 9 | July 14 / 0.8530 / 9 of 9 |
| champaign-il, 40.048 -88.33 | July 3 / 0.8588 / 6 of 9 | July 3 / 0.8492 / 9 of 9 |
| lancaster-ne, 40.73 -96.55 | July 14 / 0.8481 / 9 of 9 | July 27 / 0.8644 / 9 of 9 |

Vitest independently recomputes scale, QA acceptance, per-pixel NDVI, scene means and shares from actual raw subset DNs. This checks arithmetic/source-pixel consistency, not independent radiometric validation. The real Champaign L30 sample excludes three pixels; synthetic tests additionally cover fully cloud/shadow/snow/water/high-aerosol masked observations, fill, nonpositive denominator and genuine zero. Mocked asset reads cover missing/failed snapshots, schema rejection and exact-coordinate isolation.

## Acceptance / remaining work

- [x] Product/version, scale/bands, masks, native resolution and timestamps pinned.
- [x] Real authenticated clear-pixel samples for all four demo points with red/NIR/SWIR1/SWIR2 and masks retained.
- [x] Provenance/raw values, clear valid sample share, mixed-pixel and unknown field-boundary coverage disclosed.
- [x] Separate HLS plot/table/details card in marked stretch evidence block; MODIS remains distinct.
- [x] No gap filling, bare-soil inference or hypothetical-rotation observation claims.
- [ ] Dynamic arbitrary-field Worker COG processing and longer seasonal history, field polygons/area coverage.
- [ ] MODIS live Collection 061 reconciliation remains #61's dependency and is not established by HLS success.
- [ ] Deployed browser 375 px, screen-reader and common evidence-drawer integration verification.

Local `wrangler dev -c wrangler.offline.jsonc --port 8793` verification returned HTTP 200 / available / finney-ks / two observations; a neighboring non-demo point returned 200 / unavailable and invalid coordinates returned 400. `npm test`: 214 passed, 11 existing opt-in tests skipped. Python QA tests: 3 passed. Typecheck/build passed; existing Vite large-bundle warning remains.

After deployment: load each demo card and compare JSON values; test a non-demo point (explicit unavailable), asset failure and full-cloud snapshots; inspect field-switch reset and narrow layouts; confirm no Field Watch changes. No deploy or merge performed.

## Sources

- https://lpdaac.usgs.gov/documents/1698/HLS_User_Guide_V2.pdf — HLS v2 user guide, April 2026, reflectance/band tables and Table 9 QA.
- https://hls.gsfc.nasa.gov/algorithms — harmonization, Fmask 4.7, adjacency dilation and high aerosol caution.
- https://lpdaac.usgs.gov/documents/2434/HLS_v2.0_L30_known_issues_April2026.pdf — high aerosol and explicit scale-factor caveats.
- https://cmr.earthdata.nasa.gov/stac/LPCLOUD — discovery; exact search/item/asset URLs in JSON.
- NASA LP DAAC HLSL30 v2.0 DOI 10.5067/HLS/HLSL30.002; HLSS30 v2.0 DOI 10.5067/HLS/HLSS30.002.
