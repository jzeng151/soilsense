# High Plains / Ogallala water-supply context

## Status and scope

Phase 1 is offline, descriptive evidence. `src/engine/aquifer.ts` is a pure
lookup/normalization function; only the evidence card imports it. Neither
`buildPlan`, crop ranking, pumping cost nor Field Watch consumes it. The card is
mounted inside App's marked data-evidence block and follows its LanguageProvider
in English and Spanish. No remote calls, keys, bindings or D1 migration are added.

Phase 2 is **design only**. Do not edit the engine session's files until
`fix/plan-engine` has merged into `origin/next`; merge that branch's integrated
result first. Do not describe Phase 1 as an aquifer-constrained recommendation.

## What the terminal actually retrieved (2026-11-15)

The checked-in `data/aquifer/context.json` contains unrounded source attributes,
returned section geometry, response URLs, retrieval timestamp and SHA-256 hashes.
Its companion JSON files are the **original response bytes** for metadata,
Finney's section query and an independent KGS district-boundary point query.
The mutable service is not itself an immutable scientific release: this is a
pinned, source-hashed snapshot of its explicitly named **2022–2024 product**.
The atlas now also advertises 2024–2026 maps. We do not relabel these older
attributes as current 2026 observations or silently combine different vintages.

### Primary KGS product

- [High Plains Aquifer Section Properties, layer 0](https://services2.arcgis.com/ZOdjAzAQ2B0f85zi/ArcGIS/rest/services/High_Plains_Aquifer_Section_Properties/FeatureServer/0)
- [ArcGIS item 223ec510fbb044e88b0d147196ae42a5](https://www.arcgis.com/home/item.html?id=223ec510fbb044e88b0d147196ae42a5), owner verified as `KS_Geological_Survey`.
- Metadata: attributes created May 30, 2024. Winter water levels originate from
  KGS WIZARD. Thickness is interpolated water-table elevation minus estimated
  aquifer bedrock elevation ([KGS Technical Series 20](https://www.kgs.ku.edu/Publications/Bulletins/TS20/)).
- Native spatial support: PLSS section, approximately one square mile; **not a
  field average or direct point measurement**. Underlying interpolation raster
  cell size is not supplied by this layer; do not claim a finer resolution.
- Native geometry CRS EPSG:26914, NAD83 / UTM zone 14N. ArcGIS returns our requested
  EPSG:4326 geometry, unsimplified. Runtime uses polygon containment, not nearest
  neighbor, a county label or a circular demo radius. Exactly-on-edge points are
  unavailable because adjacent-section attribution is ambiguous.
- Units: thickness and changes in feet; percent-change field in percent;
  negative changes are declines. The source's general prose says "all
  measurements are in feet", but percent and usable-life fields are explicitly
  different quantities. Preserve native field names rather than forcing all
  fields to feet.
- Public item license information: "None. Users can determine if this data fits
  their purposes." Attribution is Kansas Geological Survey. This does not imply
  endorsement, a well-yield guarantee or a water-right determination.

### Finney demo: 38.1095, -100.706

Exact intersect query returned one section, `22S31W27`, OBJECTID `18173`:

| Native field | Published value | Interpretation |
|---|---:|---|
| `satthick_2022_2024` | 66.92423502604152 ft | Winter-average saturated thickness, 2022–2024 |
| `predev_satthick_updated` | 110.66204833984011 ft | Predevelopment (~late 1940s) estimate |
| `chng_predev_20222024_act` | -43.7378133137986 ft | Predevelopment-to-2022–2024 thickness change |
| `chng_predev_20222024_pct` | -39.52376986505886% | Percent change, same endpoints |
| `chng_3yr_2013_2023` | -4.035846418804592 ft | 2012–2014 to 2022–2024 water-level change |
| `eul_3yr_2013_2023_200gpm` | 94.64219027960489 | Published historical usable-life scenario field, years |
| `gmd` | 3 | Section's district attribute |

The decade change product uses **all wells, not only High Plains wells**, per
KGS metadata. We show endpoint change, not a measured annual well-decline rate.
No slope fitting, GRACE-to-thickness conversion or linear depletion calculation
is performed. Zero and positive rises are retained; null/nonfinite values stay
unknown. Negative thickness/lifetime values are not interpreted as usable supply.

### Published usable lifetime: what is and is not verified

A numeric usable-life field **is published for this section**. Its raw field name
is retained and the card shows it only within qualified scenario details. The
layer's field list does not fully document its hydraulic parameters or algorithm;
we have not independently reproduced that number or established a precise
projection epoch from a formal field definition. It is **not** a remaining-life
countdown and we do not subtract elapsed years, infer a depletion date or use it
as a ranking threshold.

For interpretation, the terminal downloaded the actual PDF of
[Buchanan, Wilson & Butler, KGS Public Information Circular 18, January 2023 revision](https://kgs.ku.edu/sites/kgs/files/files/PICpdfs/PIC18HighPlainsAquifer2023revision.pdf),
SHA-256 `d9781742aee4d90b0058a74767f266717264a3e7f6ce24cbfc3ca0679d8e09c0`.
Pages 3–4 explain that lifetime projections assuming sufficient thickness for
200 gallons/minute throughout the growing season are illustrations based on
past trends and additional assumptions. Its Figure 6 uses **2011–2013 to
2020–2022**, a different period from our field name; do not claim the PDF
independently validates this 2024 field's numeric value. Page 4 describes local
clay layers making a lifetime projection overly optimistic. Thus even a long
published scenario does not establish full irrigation for this field.

The [legacy 2000 atlas lifetime method](https://www.kgs.ku.edu/HighPlains/atlas/ateul.htm)
uses 1997–1999 thickness and a 30-ft illustrative target. Its
[thickness discussion](https://www.kgs.ku.edu/HighPlains/atlas/atcst.htm)
mentions 30–50 ft for high-volume pumping. These **are not** universal operating
limits and are **not** the verified algorithm for the newer 200-gpm product.
No threshold is copied into ranking.

### GMD3 and LEMA: do not conflate membership with regulation

Finney's section has `gmd=3`. An independent point-in-district query of the
[KGS GMDs service, layer 35](https://services2.arcgis.com/ZOdjAzAQ2B0f85zi/ArcGIS/rest/services/GMDs/FeatureServer/35)
returned `GMD_ID=3`, `NAME=Southwest Kansas GMD #3`. This confirms the **demo
point**, not every point in Finney County; the full section's GMD attribute is
regional context and does not survey any individual's parcel.

**Current effective LEMA membership/allocation remains unverified.** Direct
terminal requests for the GMD3 proposal and KDA documents returned HTTP 403.
A separate web text retrieval returned the KDA Chief Engineer's
[July 23, 2026 letter](https://agriculture.ks.gov/home/showpublisheddocument/16936/639210159550700000),
which explicitly says the submitted action plan and LEMA could not be approved
as submitted; the
[later petition for reconsideration](https://agriculture.ks.gov/home/showpublisheddocument/18142/639282715892230000)
describes rejection of the groundwater-decline portion of the revised action
plan on September 30. These are research leads, **not proof of the current
legal status of this parcel**. A proposed 2028–2032 LEMA is not a presently
operative allocation. Do not infer either "in a LEMA" or "no LEMA" from a
proposal, a news story, GMD membership, or a blocked request. Owner/DWR review
must verify the current effective order, dates, exact boundary, exemptions and
specific water rights before legal constraints enter any scenario.

### All four demo points: independent USGS boundary check

The terminal downloaded **USGS Data Series 543** (Qi, 2010),
[publication and citation](https://pubs.usgs.gov/ds/543/),
[data DOI 10.5066/P9KA17IW](https://doi.org/10.5066/P9KA17IW).
The ZIP SHA-256 is
`e5b94e11453aa375ec655b47e666cd06306a8a7af41c808aa8b60d4c653a03d9`.
All 199 source features were read. The offline method unions aquifer-present
polygons and subtracts aquifer-not-present islands, projects WGS84 demo points
to native NAD83 Albers, then tests coverage. Distances are to the mapped boundary
in the native projection, approximate, not surveyed distances or uncertainty.

| Demo | Coordinates | DS543 coverage | Approximate boundary distance |
|---|---|---|---:|
| Story County IA | 42.0563, -93.495 | Outside | 244.0 km |
| Champaign County IL | 40.048, -88.33 | Outside | 678.3 km |
| Finney County KS | 38.1095, -100.706 | Inside | 6.7 km |
| Lancaster County NE | 40.73, -96.55 | Outside | 36.1 km |

Lancaster is east of the mapped aquifer at this particular point; do not label
all Nebraska as Ogallala or the demo as definitively on the boundary. DS543 is
a regional compilation of mixed source scales with internal islands, not a
field-scale aquifer survey. Other aquifers may exist outside its extent. Only
the exact other demo coordinates have retained boundary classifications; **all
other points outside the retained Finney section are unavailable**, not assumed
outside the aquifer. No out-of-state thickness, lifetime or Kansas district
attribute is extrapolated.

## Reproduce and audit

Prerequisites for the optional offline data-refresh tool: Python 3,
`pyshp==3.0.3`, `shapely==2.1.2`, `pyproj==3.8.0`. None is a runtime dependency.
The run used these versions; install in your own virtualenv or a scratch target,
not the app's dependencies. The terminal verified the source byte hashes and
actual numeric responses; metadata-only reachability was not treated as data.

```sh
python scripts/subset-aquifer.py --output <new-directory>
# Review metadata, response hashes, section identity and data-vintage differences.
# Do not replace the pinned data without review.
npx vitest run test/aquifer.test.ts test/aquifer-provenance.test.ts web/src/components/AquiferCard.test.ts
npm run typecheck
npm test
npm run build
```

The script fails on ArcGIS error JSON, transfer-limit truncation, ambiguous
section selection, wrong section identity or non-KGS ownership. It writes only
public data to a **new output directory**. Original KGS responses are retained;
the full USGS archive need not be committed (its exact URL/hash are retained).
The runtime never accesses that archive. Source snapshots can be replayed
without provider access. The card is independent of `.dev.vars` and fails to an
explicit unavailable state when lookup coverage is absent.

## Phase 2 design — after the engine branch is integrated

### Recommended first integration: a warning, not an invented water budget

1. Add an explicitly opt-in aquifer-context policy, default **off**. With no
   opt-in, no data, unknown applicability, or unavailable evidence, return the
   existing entire plan response unchanged (including facts and score breakdowns).
2. When the farmer selects **full irrigation** and an applicable published
   thickness change is negative, explain that regional decline does not verify
   their selected supply: ask them to confirm well capacity, seasonal pumping
   history and allocation with their district. Cite the exact dated product and
   section. Describe a *published decline*, not "rapid decline" without a sourced
   definition. Do not penalize a crop or override the farmer's mode automatically.
3. If a low-thickness display class is later added, pin a reviewed source-specific
   definition and its applicability to this product. The old atlas's 30/50-ft
   values are historical illustrations, not a calibrated modern rule. Any other
   test setting must say **illustrative demonstration setting**, never "safe".
4. Keep warning/evidence metadata out of weather inputs, Field Watch status and
   personalised data logs. A new response field, if needed, is additive and has
   explicit availability, product version, provenance and opt-in state.

### A suggested seasonal irrigation allowance is not justified by these data

Aquifer saturated thickness alone cannot provide mm/season. Well-specific
transmissivity, drawdown, pump capacity, irrigated area, operating hours and
right/LEMA constraints are missing. The published lifetime field cannot supply
these. Do not scale 254 mm by thickness, by lifetime, by GRACE storage or by a
regional percent decline. Do not replace the flat pumping cost with an invented
lift: the section's depth-to-water is not total dynamic pumping head.

A future **farmer-confirmed scenario** could accept usable pumping capacity,
operating hours, irrigated acres and an independently verified seasonal legal
allocation, with units/date/provenance. A transparent capacity-based volume/area
conversion could suggest a scenario limit; the farmer must accept it. Gross
pumped versus net-applied water and efficiency must be distinguished. No
provider-derived allocation is implemented here. Decide whether such a scenario
belongs in a later PR rather than extending this evidence PR indefinitely.

### Required acceptance tests before Phase 2 can be marked ready

- Fetch and merge `origin/next` after the engine fix is demonstrably merged.
- Capture full `buildPlan` snapshots with real saved weather fixtures for all
  three water modes, before integration. Retain no-feature, feature-off and
  unavailable cases byte-for-byte after integration; do not regenerate expected
  snapshots merely to accept a changed score.
- Test opt-in warning only for applicable full-irrigation input; no warning for
  a noncovered point, rain-fed mode, null or nondeclining change. Missing never
  means zero, stable, an empty well or legal permission.
- Test changed evidence version and cache identity if any numeric scenario
  input enters the engine. Warning-only context must not alter score/cache keys
  for unchanged recommendations.
- Test bilingual provenance/limits and browser water-mode transitions. Numeric
  values alone are not sufficient acceptance evidence.
- Re-run typecheck, the entire test suite and build after integration. No remote
  migrations or deployment as part of this task.

## Recorded Phase 1 verification

On 2026-11-15 the assigned local Worker ran on **127.0.0.1:8799**, with the
production Vite assets. A named browser session followed the actual Kansas demo
profile → confirm field → full irrigation → build plan flow, with **no API
interception or fabricated responses**. The resulting plan mounted the aquifer
card with 66.9 ft, -43.7 ft (-39.5%), section 22S31W27 and explicit GMD3 / unknown
LEMA context. Source/lifetime disclosures and English/Spanish switching were
exercised. Space activated the source disclosure; Tab and Shift+Tab moved between
the two native summaries. A screenshot was inspected at desktop width and a
320px Spanish view.

Scoped axe-core **4.14.0** checks on the expanded **aquifer card only**, with
`wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, found zero violations and zero
incomplete rules in all four language/width pairs (EN and ES × 1100px and 320px).
The card itself had no horizontal overflow. This is not whole-app WCAG
certification. The **existing Spanish water-comparison panel** overflowed the
page (not this card): at 320px its `Agua extraída / pulgadas/año` values extended
to about 340px. That unrelated UI was left untouched for the verification/engine
sessions. The local Field Watch showed its existing missing-migrations notice;
no migrations were run and no Field Watch success is claimed.

`npm run typecheck`, `npm test` and `npm run build` all passed: 75 test files
passed, 3 skipped; 570 tests passed, 11 skipped. Tests include recorded-source
SHA-256/geometry/attribute checks, all-demo coverage inventory, boundary/no-data
cases and bilingual server-rendered card checks. Existing full-response engine
snapshots passed without expected-output edits. The Vite build retained its
pre-existing large-chunk warning. Vitest rewrote two snapshot files' line endings
without a content diff; these unrelated worktree changes were restored.

The ignored local `test-results/aquifer/browser-audit.json` retains full axe
results and per-state card inventories. It is local execution evidence, not
additional source data and not a deployed verification claim.

## Cloud setup for owner

None for Phase 1: no keys, D1 tables, migrations, optional cloud bindings or
provider calls are needed. Normal app build includes the pinned subset. To
refresh, run the offline script, review source vintages/hashes and submit a
separate reviewed data update. For Phase 2, first confirm whether warning-only
opt-in is the desired scope and obtain qualified review before any quantitative
allocation or legal-order integration.
