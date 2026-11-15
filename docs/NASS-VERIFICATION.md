# NASS live verification — 2026-11-15

Run `npx tsx scripts/verify-nass.ts` from the repository with an ignored `.dev.vars`. No deployment is performed. The script calls the exact `getNassData` used by `service.ts`, then the progress adapter and pure plan engine. Raw credential-bearing request URLs are never stored. Machine-readable results: `nass-live-verification.json`.

## Corn benchmark

Finney County FIPS 20055 maps to Kansas ASD **30, SOUTHWEST**, according to returned county corn yield records. District weekly silking queries yielded no usable benchmark, so all seasons explicitly use the Kansas state survey fallback. This is cumulative percentage of state corn acreage at or beyond silking, **not this field's observed stage**. No interpolation or calibration to the survey.

| Year | Assumed May 1 planting / 110-day hybrid GDD estimate | State 50% bracket (week ending) | Percent at endpoints | Model minus bracket (days) |
|---|---|---|---|---|
| 2023 | July 13 | July 9–16 | 36–55 | -3 to +4 |
| 2024 | July 7 | July 7–14 | 47–59 | -7 to 0 |
| 2025 | July 12 | July 6–13 | 39–51 | -1 to +6 |

Illustrative model windows are ±7 days. Each 50% interval spans seven days; there is no missing weekly report inside these crossing brackets. Full queried report dates, percentages, sanitized query URLs, POWER snapshot IDs and retrieval times are retained in JSON. Differences are consistent with regional planting/hybrid spread at this coarse plausibility level; none triggers the illustrative >14-day discrepancy screen. This does **not** verify field stages or local hybrid/planting assumptions. Other state points use the same geocoded county/district discovery; live non-Kansas samples remain a post-deploy check.

## Existing yield and price path

`getNassData` returned **zero errors**; county corn/soybean/winter-wheat/sorghum series and district series are populated. County corn has 26 combined-practice, 16 irrigated and 14 non-irrigated years. Latest 12-month received-price averages through September 2026: Kansas corn $4.19/bu, soybeans $10.88/bu, winter wheat $5.38/bu, sorghum $3.62/bu (converted from $/cwt), alfalfa $123.83/ton; oats $3.14/bu is a labeled national fallback. The $122/ton Kansas 2025 annual alfalfa number previously flagged is not the same statistic as this client's rolling monthly average. Neither supports treating the $190/ton engine default as a current NASS quotation.

## Kansas plan sensitivity (not a deployed full-source plan)

Held existing Kansas POWER fixture, Richfield soil assumptions, corn/corn history, balanced priority and 2027 start fixed. No default or ranking code changed.

- Irrigated defaults: alfalfa/alfalfa/alfalfa first, $281/ac average modeled annual net, total 0.859.
- With **NASS prices only**: soybean/corn/soybean first, $158/ac, total 0.839. Alfalfa leaves the displayed top three.
- With **NASS yields and prices**: soybean/corn/soybean first, $194/ac, total 0.839.
- Rain-fed top sequence remains fallow/winter-wheat/sorghum. Its modeled net moves from $5/ac default to -$8/ac prices-only and -$6/ac yields+prices. Second/third places swap.

These are indicative sensitivities, not audited farm budgets or a recommendation. All crop prices change together, so attributing the entire change solely to alfalfa would be incorrect. Existing ranking normalization is intentionally unchanged.

## Verification and remaining work

209 tests passed, 11 existing opt-in tests skipped; typecheck and build passed (existing large-bundle warning). Network tests use synthetic protocol rows and cover suppression, missing weeks, unbracketed/declining values, explicit state fallback and key-free provenance. No live Worker deployment or browser/accessibility check performed. After deployment check 2023–2025 demo and Iowa/Illinois/Nebraska points, D1 cache reuse, narrow layouts and unchanged Field Watch. Sorghum model, documented wheat-model evaluation and adviser review remain unmet #42 scope.
