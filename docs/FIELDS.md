# Public field outlines (opt-in)

## Enable and integration

Off by default. Set Worker `FIELDS_ENABLED=on` explicitly (local example below); no default Wrangler variable, migration, account or cloud binding was added. `/api/fields/status` and `/api/fields` otherwise return HTTP 404 with exactly `{"error":"fields disabled"}`. The browser renders controls only after the status endpoint returns `enabled:true`.

```sh
npm ci
npm run build
npm run db:migrate:local
npx wrangler dev -c wrangler.offline.jsonc --port 8801 --var FIELDS_ENABLED:on
```

`src/shared/fields.ts` is the shared F1/F2/F3 contract. App owns `selectedFields: FieldBoundary[]`; `MapPicker` accepts optional boundaries, selection and callback. Pixel-fit and multiwatch sessions may consume that state additively; this PR does not implement those features. Checkboxes support keyboard selection; ordinary polygon clicks replace selection, Shift/Ctrl/Command-click toggles. The shared-edge button adds one hop of exactly touching neighbours, not all nearby or road-separated fields. Any subset can be selected explicitly, including noncontiguous fields; no ownership or single-farm relationship is inferred.

Selecting exactly one outline makes that field the default planning target and loads its centroid through the point picker. **Plan this field** is available on every selected field, including multi-selections: it loads that individual field and opens the questions/history controls; generating the plan sends its **exact centroid** and its CSB history. Different fields are never averaged. With more than one selected field, choose the individual action to target one; the ordinary point workflow remains available otherwise. A centroid of a concave polygon can lie outside the polygon or the demo query box; the chosen area catalog is retained in that case. Selection is visit-local React state; it is not registered, uploaded or claimed as ownership.

### Friendly names and browser-only renaming

Each committed area vintage is numbered by centroid **north to south**, then **west to east**, with CSB id as the tie-breaker. Numbering does not depend on API order, selection order or language. The same label helper feeds map tooltips, the keyboard checkbox list and selected summary: e.g. `Field 3 · 9.1 ac · Corn → Corn → Winter Wheat (2023–2025)` (`Parcela 3` in Spanish). Acreage is estimated; the raw `csb:<CSBID>` remains on a secondary line for provenance. Numbers can change if the underlying area dataset is replaced.

Selected fields can be renamed locally. Names are trimmed plain text, limited to 60 Unicode characters, with control characters rejected; blank resets to the generated label. Storage key: `soilsense:field-name:v1:<CSB id>`. Names are not sent in plan requests or written to an account/server. Storage failures are disclosed and the label remains visit-local. Custom names are not translated.

### CSB → plan crop history

`fieldPlanHistory` takes the latest **three source calendar observations**, sorts oldest first, then drops unknown/non-modeled crops (no backfilling old years across recent gaps). This matches `effectiveHistory` and the API's maximum of three `recentCrops`; the last crop is the most recent. Years remain visibly attached to the history controls and plan summary. CSB does **not** establish what the farmer planted in 2026: its 2018–2025 satellite history is sent as historical observations only, never relabeled as farmer-reported current-season crops.

The mapping is deliberately small and centralized in `cdlToCropId`, using the [USDA NASS CDL code list](https://www.nass.usda.gov/Research_and_Science/Cropland/):

| CDL code | Source crop | Plan CropId |
|---|---|---|
| 1 | Corn | `corn` |
| 4 | Sorghum | `sorghum` |
| 5 | Soybeans | `soybean` |
| 24 | Winter wheat | `winter_wheat` |
| 28 | Oats | `oats` |
| 36 | Alfalfa | `alfalfa` |
| 61 | Fallow/idle cropland | `fallow` |

All other codes are unknown for this plan, including double-crop classes (e.g. 26, 225, 236), noncrop land cover and non-modeled crops. They are not guessed, split, or collapsed to a modeled crop. An EN/ES note lists each dropped year's original source label and CDL code. If every recent crop is unknown (or the sequence is absent), generation is disabled until the farmer supplies at least one modeled crop; this prevents the engine's empty-override fallback from silently substituting point-based history.

The questions view replaces its single-current-season crop question with chronological history controls for the targeted CSB field. Corrections are visit-local, retained separately by CSB id, and disclosed as corrected in this browser. The plan view identifies the field/acreage/id, exact history used, and source: **USDA Crop Sequence Boundaries 2018–2025, satellite-derived, not farmer-reported; edit if wrong.** Its correction action returns to the history controls. With the flag off, the original point/current-season workflow and request payload are unchanged, irrespective of stored field labels.

## What the data is / is not

USDA NASS Crop Sequence Boundaries (CSB), developed with ERS, are **fully synthetic representations** of crop field outlines inferred from satellite Cropland Data Layers and public data. These are real downloaded CSB features, not hand-drawn/fabricated polygons. They are **not ownership boundaries, cadastral/tax parcels, verified farm management units, or producer/FSA records**. They contain no owner or producer personal data. Geometry and cropping history may be inaccurate or stale; confirm against your own field and records. Acreage is an estimate, not survey acreage. Source CDL labels also include noncrop land cover; do not treat every displayed label as a planted crop.

Tonight's coverage is intentionally limited to approximately 3 km × 3 km query boxes around:

| Area | Center (lat, lon) | Source features / served polygons |
|---|---|---|
| Finney, KS | 38.1095, -100.706 | 63 / 63 |
| Story, IA | 42.0563, -93.495 | 47 / 47 |
| Champaign, IL | 40.048, -88.33 | 73 / 73 |
| Lancaster, NE | 40.73, -96.55 | 38 / 38 |

221 features total; no multipart features were omitted. Intersecting fields remain whole, so some extend outside the query boxes. `/api/fields?area=finney|story|champaign|lancaster` serves the respective subset. `/api/fields?bbox=west,south,east,north` filters **only the committed subsets**, by feature bounding-box intersection (not exact polygon clipping). Maximum bbox extent is 0.06 degrees per side; maximum response is 500 features with explicit truncation status for bbox queries. An empty result outside coverage does not mean no agricultural fields exist there.

POWER weather remains roughly 50 km: adjacent selected fields share weather. Drawing small outlines does not increase any sensor's resolution.

## Source, release and reproducibility

- Originator: USDA National Agricultural Statistics Service (NASS), with USDA ERS.
- Official product documentation: <https://www.nass.usda.gov/Research_and_Science/Crop-Sequence-Boundaries/>.
- Source queried: official USDA SCINet ArcGIS layer <https://pdi.scinet.usda.gov/hosting/rest/services/Hosted/Crop_Sequence_Boundaries_2025/FeatureServer/0>.
- Verified layer name: `national1825_OG`; service item `71ec86833ad849ab87e35e5335bf6da9`; returned `csbyears=1825` and `cdl2018` through `cdl2025` on every feature.
- Window: **2018–2025**, not the older source.coop dissolved 2023 mirror. NASS's product page says the 2018–2025 release was March 27, 2026 and current algorithm version is **v2024**. The hosted layer itself does not independently expose an algorithm revision; do not infer `rev23` from archive filenames.
- Retrieved November 16, 2026 UTC (November 15 Eastern); exact retrieval timestamp and query URL are embedded per subset/feature.
- The preferred source.coop GeoParquet was reachable but is 4,331,885,251 bytes, last modified November 25, 2024; its product description reports dissolution by 2023 crop. The official bounded 2025 service preserves the required IDs, source acreage and eight-year history without downloading multi-GB national archives.

Reproduce with `python scripts/csb-subset.py` (Python stdlib only, network required). It fetches layer metadata, then four bounded WGS84 GeoJSON queries; checks an independent count-only query, transfer-limit flags, years, geometry closure and layer schema before writing. Raw response bytes are committed under `data/fields/source/`, including metadata. Each feature's `provenance.sha256` is the SHA-256 of its **raw area-query response bytes**, not a hash of the national file. Exact query URLs and timestamps are preserved. Derived files retain original `sourceAcres` for numerical comparison. No geometry simplification, clipping or rounding is performed.

`fieldGeometry.ts` computes spherical geodesic area using mean Earth radius 6,371,008.8 m and 4,046.8564224 m²/acre, subtracts holes independently of winding, and uses a local equirectangular area-weighted centroid. These local-field helpers are not intended for antimeridian/polar polygons. All 221 derived acreages agree with source `CSBACRES` within 0.3%; source acreage uses its native projected/geodetic convention, so exact equality is not expected. Shared-edge tests tolerate 1e-8 degrees (~1 mm), handle split segments and reject corner-only contact; roads/gaps are deliberately not adjacency.

## Built-app verification

At source revision `4a7853fc4effc63f9ed7b1e6df84b1511dc682b4` (clean worktree), `node scripts/csb-smoke.mjs <scratch-output-dir>` exercised the real built Worker on 8801 without mocking API responses:

- All four API field counts matched SVG outlines and checkbox counts: 63 / 47 / 73 / 38.
- Polygon event handlers: single select, Shift-add and Ctrl-remove; real keyboard Space toggled a focused checkbox.
- EN and ES, expanded field list and crop histories, widths 1280 / 375 / 320: zero selected axe violations, no page or component horizontal overflow, no page errors. Scanner: axe 4.14.0, Playwright 1.65.1, Chromium 159.0.8154.6; tags `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, scoped to the boundary picker.
- 78 color-contrast node instances across those six states remain **incomplete**, not passes. This is not WCAG certification or a screen-reader listening test. Full axe JSON, screenshots and source hashes were retained in the session scratch `fields-audit` directory; the committed smoke script reproduces them.
- Restarting the same built Worker **without** the flag returned exact disabled 404 JSON for status and data, with zero new picker controls and zero outline paths in the actual browser.

## License / attribution

USDA NASS states that CSB is public domain and free to redistribute, supplied **as is**, without warranty of results. Users are responsible for interpretations. Attribute USDA NASS Crop Sequence Boundaries (2018–2025), link the product documentation, and preserve source URLs/vintage and this limitation. See the official product page and <https://gee-community-catalog.org/projects/csb/> for the published license/liability text. Basemap imagery retains its existing USGS/NASA/OpenStreetMap attribution, separate from CSB.
