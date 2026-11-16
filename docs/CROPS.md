# Southwest Kansas crop expansion (experimental, opt-in)

The original seven phases remain the production default. Set Worker `EXTRA_CROPS=on`
(or pure-engine `PlanInputs.extraCrops=true`) to consider the additional crops **only
in Kansas Southwest agricultural district (ASD 30) counties**. No Wrangler deployment
configuration is changed. This is not a claim that all agronomic response coefficients
have been calibrated: unsupported parameters have `sourceUrl: null`, `year: null`,
and `status: approximate assumption` in `extraCropParameterSource`.

## Acreage evidence, not a remembered crop list

USDA NASS Quick Stats was queried on 2026-11-15. Retained sanitized responses are in
[`evidence/sw-kansas/`](evidence/sw-kansas/): query parameters, original-response SHA-256,
and individual source rows (including suppressed values). API credentials are not retained.

* SURVEY, Kansas state FIPS 20, ASD 30, COUNTY, AREA HARVESTED, 2021 onward: 127 rows.
* SURVEY, AGRICULTURAL DISTRICT, ASD 30, AREA HARVESTED / AREA PLANTED, 2021 onward:
  HTTP 400/no rows. This does **not** mean no crops. A broader 2010-onward district
  query returned 111 records, last vintage 2019. Do not relabel these as current district estimates.
* CENSUS, Kansas, ASD 30, COUNTY, AREA HARVESTED, 2022: 1,597 rows. Use exact
  `… - ACRES HARVESTED`, `domain_desc=TOTAL`, all production practices. Operations
  counts are separate rows and must not be added to acres.
* SURVEY state harvested acres (2021 onward), yields and annual received prices
  (2023 onward) are retained separately. Forecasts and annual final observations must
  not be mixed or averaged indiscriminately.

The table sums **only disclosed county acreage**, not an official district total.
Suppressed `(D)` is unknown, never zero. Counties without a row are not assumed zero.
A reproducible inclusion screen is at least 1,000 disclosed harvested acres across
ASD 30 in the 2022 Census. This is a scope threshold, not a profitability threshold.

| Crop | 2022 disclosed county-acre sum, ASD 30 | Finney County 20055 | Counties with suppressed acreage | Decision |
|---|---:|---:|---:|---|
| Upland cotton | 26,479 | (D) | 5 | Add `cotton` |
| Corn silage | 56,260 | 4,288 | 2 | Add `corn_silage` |
| Sorghum silage | 16,707 | 2,705 | 4 | Add `sorghum_silage` |
| Sunflower, all types | 6,458 | 2,696 | 3 | Add **separate** oil and confection products |
| Sunflower, oil type | not summed with all-type total | 1,232 | source rows retained | `sunflower` |
| Sunflower, non-oil type | not summed with all-type total | 1,464 | source rows retained | `sunflower_confection` |
| Triticale | 4,447 | (D) | 6 | Add `triticale`, forage-hay model |
| Hay excluding alfalfa | 61,451 | 2,359 | 1 | Add `other_hay`, annual-forage representative |
| Canola | not disclosed | (D), 2 operations | 2 | Meaningful acreage not established; defer, not zero |
| Proso millet | not disclosed | no row | 1 (Grant, 1 operation) | Defer, not zero |
| Dry edible beans | no matching row | no row | 0 | Not established; snap beans are **not** dry edible beans |

Census triticale acreage does not specify that every acre became forage hay. K-State
MF2227 identifies triticale as primarily forage, supporting that **explicit product
choice**, not a grain-to-forage conversion. Other-hay acreage includes perennial
hay: the new model represents annual forage sorghum hay only, not every grass stand
and never conversion of native prairie. Non-alfalfa haylage is another harvested
product, not evidence for an additional species; species/harvest-specific coverage
remains incomplete. Small, entirely suppressed barley, rye and camelina rows do not
establish the acreage threshold. Horticultural crops are outside this row-crop engine.

Recent annual corroboration: Seward upland cotton harvested acreage was 9,560 in
2022 SURVEY; the 2022 Census estimate for Seward was 7,230. These are **different
statistical products**, not duplicates or interchangeable estimates.

Winter/summer fallow already exists as `fallow`, with storage carryover, weed-control
cost and exclusion of consecutive fallow. Wheat–sorghum–fallow therefore needs no new
crop ID. A three-year planning horizon is not permission to repeat a sunflower cycle
indefinitely: the four-year return rule must also be checked beyond this horizon.

## Budget values used, and their limits

Official K-State AgManager PDFs were downloaded and verified as PDF bytes, then
text-extracted. The `*-budget.json` records retain exact URL, original SHA-256,
planning year 2025, retrieval date, and page text. All six were published 2024-11-20.
Page 2 = middle-yield abstract; page 3 = nitrogen quantity and expense. They are
**budget assumptions**, not actual 2025 returns, current bids or observed field yields.

| Crop / source geography | Budget planning yield (engine units) | Price / product unit | Total direct $/ac | Source N expense $/ac | Engine base cost excluding N $/ac | N lb/ac |
|---|---:|---:|---:|---:|---:|---:|
| Cotton, Southwest KS W-CT-F | 900 lb lint | 0.66/lb | 535.00 | 31.89 | 503.11 | 73 |
| Corn silage, Northeast KS non-irrigated | 18 fresh short tons | 35.75/ton | 537.30 | 68.60 | 468.70 | 157 |
| Forage sorghum silage, South Central KS | 9.5 fresh short tons | 29.82/ton | 247.00 | 37.19 | 209.81 | 85 |
| Oil sunflower, Western KS W-SF-F | 1,600 lb (16 cwt) | 0.145/lb (14.50/cwt) | 223.26 | 27.29 | 195.97 | 50 |
| Confection sunflower, Western KS W-SF-F | 1,400 lb (14 cwt) | 0.21/lb (21.00/cwt) | 223.42 | 23.30 | 200.12 | 43 |
| Annual forage sorghum hay, Western KS W-H-F | 2 dry short tons | 81.79/ton | 220.36 | 19.32 | 201.04 | 36 |
| Triticale hay, no verified local enterprise budget | **3 dry short tons, approximate** | **100/ton, approximate** | unknown | unknown | **200, approximate** | **80, approximate** |

Source filenames and their URLs are in `additionalCrops.ts` and the retained budget
records. Cotton's source has $145.80 additional cottonseed revenue; the engine
**does not include that credit** or treat seed cotton pounds as lint. Sunflower
conversion is exactly 100 lb/cwt. Silage has **no conversion to grain bushels**.

The engine yield-scales cost and N and adds its generic nitrogen price and pumping
cost. Subtracting the source N dollars first prevents double-counting nitrogen, but
this still is **not** the unmodified enterprise budget. Do not compare the engine's
net return to a source's returns-over-total-costs without restoring land, capital,
actual N price and the source's treatment. Northeast/South Central budgets are
explicit geographic transfers, not Southwest Kansas observations.

The model needs water-unlimited potential. A non-irrigated budget yield is **not**
such a potential. Until local irrigated-practice calibration is available, these
budget yields are conservative uncalibrated fallback bounds; this transfer is an
approximate assumption with no independent potential source. New values do not
modify the old state tables. NASS county/district exact-product yield series can
calibrate corn/sorghum silage, cotton and each sunflower type when the opt-in is on.
Generic other-hay yields cannot calibrate annual forage sorghum hay, and grain
triticale yields cannot calibrate hay. Kansas 2025 annual all-practice NASS yields
were 23 tons/ac corn silage and 15.5 tons/ac sorghum silage; neither is silently
installed as an irrigated yield potential.

NASS annual Kansas 2025 prices: upland cotton $0.562/lb, sunflower all types
$20.70/cwt, hay excluding alfalfa $103/ton. The oil/non-oil sunflower prices were
suppressed. These dated observations are retained as context, **not** silently
used in place of the budget/product-specific defaults. Runtime monthly exact-product
series can override cotton and oil sunflower. There is no grain-price fallback for
silage, generic hay-price fallback for annual forage, or all-type sunflower fallback
for a confection contract. Missing quotes remain defaults, never invented live prices.

## Per-parameter agronomy provenance

`extraCropParameterSource(crop, parameter)` exposes source/year/status/note. All
unverified exact coefficients are approximate assumptions with null source and year,
even when a broad guidance document is linked below. **A relevant handbook is not
validation of an undocumented number.**

| Parameter | Current implementation and provenance |
|---|---|
| Legume / family | None of the new crops is a legume. Cotton and sunflower are broadleaf; corn, sorghum, triticale and annual forage are grasses. No invented N-fixation credit. |
| Seasonal water reference | Cotton 800, corn silage 580, sorghum silage 450, sunflower types 560, triticale 330, annual hay 400 mm: approximate assumptions, null source/year. Reference only; engine uses Kc × local ET0. |
| Season-average Kc | Cotton/corn silage/sunflower 0.8; others 0.75: approximate single-season constants, null source/year. They are **not** the FAO-56 mid-season coefficients. |
| Water-yield threshold | Cotton 0.1; sunflower types 0.05; forage crops 0: uncalibrated assumptions, null source/year. Zero means a biomass-response approximation, not a feed-quality guarantee. |
| Root depth | Sunflower types 2,000 mm; others 1,500 mm: approximate, null source/year. Soil profile still caps accessible storage. |
| Heat damage | Cotton/sorghum/sunflower/triticale/hay threshold 35°C; corn silage 32°C; damage 0.003 per degree-day: approximate, null source/year. Triticale heat window May 1–June 10; corn silage June 1–August 15; cotton July–August; other new summer crops June 15–August 31. |
| Cold / season length | Triticale winter-kill −23°C over 12 days is an unvalidated proxy, null source/year. No other new winter-kill screen. Cotton frost-free requirement 150 days; corn/sorghum/sunflower/hay 100; triticale 0 (not checked): approximate, null source/year. No cotton-specific base-60°F GDD model; generic base-10°C grain GDD is deliberately disabled for these new crops. |
| Plant / harvest windows | Explicit `plantingWindow` / `harvestWindow`; illustrative, not a dynamic planting-date predictor. Cotton May 1–June 5 / Oct 1–Nov 15; triticale Sept 1–25 / May 15–June 10; corn silage April 20–May 20 / Aug 20–Sept 30; other summer crops May 20–June 15 / Aug 20–Sept 30. Approximate assumptions with null source/year; source context below. Main water-use season may be narrower. |
| Drought tolerance | High (corn silage moderate) is a qualitative approximate category, null source/year, not an independent score bonus. |
| pH / drainage | Minimum pH 5.5, avoid poorly drained soils: approximate common placeholders, null source/year. |
| N / direct cost / yield / price | Exact 2025 budget assumptions and conversions above for six crops. Triticale remains fully approximate. No new rotation yield bonus is invented. |
| Rotation | Sunflower types share a ≥4-year return interval including the last three history years. Source: April 2001 Kansas sunflower crop profile, Sclerotinia management, below. This is a conservative disease screen, not a universal disease claim. Grain/silage corn count as one species; grain/forage sorghum and annual sorghum hay count as one species for the existing three-consecutive-year exclusion. Triticale inherits fall-sowing and previous-harvest checks, with the prototype mid-October deadline (not a validated triticale recommendation). |
| Outlet / equipment | Cotton: gin / cotton harvester; silages: feedlot-dairy / forage harvester; sunflower types: specialist buyer / grain combine; triticale/annual hay: hay buyer / hay equipment. Classification assumptions, not owned machinery or signed offtake. Confection sunflower needs a food/birdseed contract; `oilseed_buyer` is only the coarse constraint group. |

### Primary guidance (context, with limits)

* [FAO Irrigation and Drainage Paper 56 (1998), chapter 6, Table 12](https://www.fao.org/4/x0490e/x0490e0b.htm): cotton Kc-mid 1.15–1.20; sunflower 1.0–1.15; grain sorghum 1.00–1.10. These are stage/time-averaged **within-stage**, non-stressed crop coefficients used with FAO Penman–Monteith reference ET, not a calibrated season average for this Hargreaves model or Kansas silage.
* [K-State MF3066, Efficient Crop Water Use in Kansas](https://bookstore.ksre.ksu.edu/pubs/efficient-crop-water-use-in-kansas_MF3066.pdf): grain sunflower reference ET 22 inches and water-production examples; no claim that a grain relation validates a forage response curve.
* [K-State MF2227, Triticale in Kansas](https://bookstore.ksre.ksu.edu/download/triticale-in-kansas_MF2227): primarily forage; Southwest–North Central planting Aug 20–Sept 25; Hays forage yield variability under 2,000 to over 10,000 lb/ac. Those are not Finney field yields.
* [K-State MF1072, Small Grain Cereals for Forage (August 1993)](https://bookstore.ksre.ksu.edu/download/small-grain-cereals-for-forage_MF1072): hay/silage harvest stages, quality and nitrogen considerations. It does not supply the triticale price or cost used here.
* [K-State MF2871, Summer Annual Forages](https://bookstore.ksre.ksu.edu/pubs/summer-annual-forages-selection-and-production-characteristics_MF2871.pdf): product/management distinctions for annual forages. Sorghum feed safety, prussic acid/nitrate risk, moisture, fermentation and storage are **not modeled**.
* [K-State cotton stand establishment, April 2026](https://eupdate.agronomy.ksu.edu/eu_article.throck?article_id=4363): May 1–June 5 window, actual soil-temperature conditions matter; baseline 60°F and emergence favored above 64°F. Air-temperature frost counts are not a soil-temperature germination model.
* [Kansas sunflower crop profile (April 2001), Sclerotinia/head diseases](https://ipmdata.ipmcenters.org/documents/cropprofiles/KSsunflowr.pdf): at least four-year rotations with non-host wheat/corn/sorghum; broadleaf host and field-history review still needed. The dated three-phase W-SF-F **economic budget** does not override this disease screen.
* [Kansas Cotton Association gin directory](https://kansascotton.com/contact/), accessed 2026-11-15: Northwest Cotton Growers, 2138 Rd 18, Moscow KS 67952. Availability is only screened to ASD 30 counties, not claimed statewide. Farmer must verify hauling capacity, gin acceptance and their own equipment.

## Search and CPU budget

Unrestricted expansion produced 10,755 cover variants in a no-history Finney engine
case and about 4–5× local wall/CPU cost. It is **not shipped**. The opt-in now keeps
exhaustive original-crop search and adds a bounded specialty portfolio: one new crop
anchored by wheat/sorghum, corn/soybean or wheat/fallow phases, all passed through
regional and rotation feasibility first. Specialty templates have no winter covers.
This is a transparent experimental **choice-set restriction**, not a mathematical
claim of dominated-candidate pruning, exhaustive optimality or an agronomic ban.
It may miss profitable specialty-heavy rotations. Constraints that require such a
rotation must report infeasible, not silently violate constraints.

Per-build daily Hargreaves contributions and identical trend fits are shared across
crop and irrigation evaluations. Seasonal ET0 sums preserve original day order rather
than subtracting prefix sums, keeping floating-point tie breaks and full default
responses unchanged. No cross-request weather memo makes the benchmark artificially warm.

`test/extra-crops.test.ts` compares full rain-fed and fully irrigated fixed Finney
responses against JSON captured from the unmodified `origin/next` engine.
`test/et0-memo.test.ts` checks exact ET0 equality for every crop/year. The existing
opt-in 32-combination `plan-engine-benchmark.test.ts` is also exercised with retained
real public demo captures. See the accompanying CPU report for local measurements;
these are Node process CPU, **not Cloudflare billed CPU telemetry**.

## Integrated verification (next `57b35d2`, P1 + P2 merged)

Standalone Node bundled uncached Finney benchmark, two alternating baseline/on pairs,
200 measured calls per mode and water level after warmup (raw batch samples in
[`test/fixtures/extra-crops-cpu.json`](../test/fixtures/extra-crops-cpu.json)):

| Water | next process CPU ms/call | extra crops on CPU ms/call | Change | next wall ms | on wall ms |
|---|---:|---:|---:|---:|---:|
| Rain-fed | 42.655 | 49.540 | +16.14% | 33.621 | 38.914 |
| Full irrigation | 29.060 | 32.815 | +12.92% | 27.032 | 30.503 |

Both observed aggregate CPU increases are below the approximate 20% budget after
bounded-template pruning. Individual batches varied on the shared Windows host;
these local process measurements are not Cloudflare billed CPU or a latency SLA.
The existing 32-case benchmark was rerun with `PLAN_EXTRA_CROPS=on` as well.

Full-response no-input rain/full Finney snapshots remain identical after integrating
constraints and prices. EN card rendering is exercised from real constrained Finney
plans and checks short tons for silage and pounds for cotton. Existing EN/ES names,
icons, price-unit labels and exhaustive requirement maps include every new ID.

### Actual fixed-input recommendations

The seven-case reproducible replay is in
[`test/fixtures/extra-crops-examples.json`](../test/fixtures/extra-crops-examples.json),
generated by `scripts/report-extra-crops.ts`. These are results from recorded public
Finney weather, soil and NASS inputs, not fabricated field observations or current bids.
Enabling the flag alone **does not change these top three**:

| Water | Rank | Sequence | Model net $/acre/year |
|---|---:|---|---:|
| Rain | 1 | Fallow → winter wheat → grain sorghum | -3 |
| Rain | 2 | Grain sorghum → fallow → grain sorghum | -1 |
| Rain | 3 | Fallow → grain sorghum → fallow | -18 |
| Full | 1 | Soybean → corn → soybean | 194 |
| Full | 2 | Soybean → winter wheat → soybean | 165 |
| Full | 3 | Corn → soybean → corn | 143 |

A farmer requirement `constraints.mustInclude=["corn_silage"]` with full irrigation
selects corn → corn silage → soybean ($100/acre/year), with corn silage → winter
wheat → grain sorghum (-$28) as the second distinct option. Only two distinct
specialty templates survive here; **a third is not fabricated**. Constraint scores
are normalized over the constrained choice set and should not be compared as though
they were unchanged unconstrained scores.

An explicitly **hypothetical** farmer quote `prices.corn_silage=65` ($65/fresh short
ton, not a sourced market observation) without a crop requirement moves corn → corn
silage → soybean to first ($273), ahead of soybean → corn → soybean ($194) and
soybean → winter wheat → soybean ($165). Silage stays in fresh short tons, not grain.

### Historical price gaps remain gaps

`extra-price-history.json` records the exact-product Kansas 2016–2025 queries and
raw-response hashes. Upland cotton has nine disclosed years but **2017 is (D)**;
both sunflower product series have all ten years suppressed. No complete exact-product
silage/triticale/annual-forage-hay received-price history was verified. Accordingly
all new products stay in `fixedPriceCrops` with explicit null `fixedPriceSources`
when selected. No gap is interpolated, no grain series is substituted, and the
original six-crop paired scenario snapshot is unchanged. Raw probes are retained in
`docs/data/prices/{cotton,sunflower,sunflower_confection}-ks-2016-2025.json`.

### Local Worker smoke

Port 8807, offline Wrangler with `--var EXTRA_CROPS:on`, returned a satisfied real
`/api/plan` request requiring corn silage: corn → corn silage → soybean ($100) and
corn silage → winter wheat → grain sorghum (-$28). The exact same request was read
back with identical plans and `generatedAt`; `fixedPriceSources.corn_silage` was null.
This verifies local execution and cache identity, not a production deployment.

## Remaining agronomic limitations

This mode is experimental until new-crop climate/yield response, local irrigated
potential, buyer-specific prices, feed quality and equipment constraints are reviewed
with Southwest Research-Extension Center agronomists and local buyers. No claim is
made that the new crops outrank existing grains or that simply enabling the flag must
change a winner. Display labels and yield units support pounds and fresh/dry short
tons without converting silage to grain. EN/ES copy is included; other languages use
the application's English fallback.
