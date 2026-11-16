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

Selecting an outline alone does **not** change the planning point. For one selected field, the optional centroid button explicitly uses its centroid through the existing point picker. No CSB crop sequence is injected into `recentCrops`; historical years are 2018–2025, not a verified 2026 farmer crop. The existing point-based history and current-crop question remain authoritative. A centroid of a concave polygon can lie outside the polygon. Selection is visit-local React state; it is not registered, uploaded or claimed as ownership.

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
