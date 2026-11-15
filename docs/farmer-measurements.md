# Farmer measurements (local scenario calibration v1)

Optional fields on `PlanRequest`: `soilTest` and `yieldRecords`. Existing requests keep the entire original `buildPlan` response, verified by a full-response snapshot captured before the engine change. Empty measurements are also equivalent apart from the echoed request properties.

## Soil

- pH: finite 0–14. Organic matter: finite 0–100 percent. Available water capacity (AWC): finite 0.01–0.6 cm water/cm soil, numerically equivalent to in/in, **not total inches in the root zone**.
- Any supplied property overrides that property only. Measured AWC takes precedence over texture. The original map profile stays in `PlanResponse.soil`; all engine consumers receive the effective profile. Drainage and described profile depth are not changed.
- Texture-only AWC values are explicitly approximate **model assumptions**, not measured soil tests or values sourced from SSURGO: sand 0.08, sandy loam 0.13, loam 0.18, silt loam 0.21, clay loam 0.19, clay 0.15 cm/cm. No changes to drainage are inferred.
- pH reaches `soilSuitability` and climate scoring; AWC reaches both crop climate evaluation and `buildWaterContext`, including stored water, replays and water comparisons.
- Organic matter replaces the mapped value in soil evidence. The existing engine has no direct organic-matter-to-yield/water function; the interface and reasons say so rather than inventing a benefit.
- Questions and results show **Your soil test** beside **USDA soil map**, and the reasons report the replacement and its farmer provenance. Map values are rounded for display only.

## Harvest records

Up to five distinct **past calendar years per crop**, from 1900 to the year before the request. Grain crops use bu/acre (0–1000); alfalfa hay uses **US short tons/acre** (0–30). Silage and metric tonnes are not converted to grain yields. A zero harvest is valid, never treated as missing. Incomplete rows, duplicate crop-years, wrong units, nonfinite and out-of-range values block submission and are rejected by the API and direct engine entry point.

For each recorded crop:

1. Compute the farmer's arithmetic mean yield and replay that crop after its usual previous crop under the **selected water supply**, without trend shifts.
2. Average the modeled yield fractions for those harvest years. If a harvest year is outside the available weather history, substitute the last-ten-weather-years mean and report how many years needed that fallback. The calibration denominator has a floor of 0.25.
3. Infer local water-unlimited potential = farmer mean / that denominator.
4. Start with the unchanged regional potential (including any existing NASS calibration). Add **50% of the local-minus-regional potential difference**. Clamp to the existing `POTENTIAL_BOUNDS`: 60–115% of the state table value; round to 0.1 in the crop's yield unit.
5. Use that potential in ranking, indicative economics, current-practice comparison and alternative water scenarios. The local inferred potential continues to use the selected practice's records when comparing water supplies. Unrecorded crops keep their original potential. Unsupported regional crops are explicitly reported as not calibrated.

One to five records calibrate a local scenario; they do **not** establish independent validation, uncertainty intervals, causal rotation benefits or guaranteed future yields. Records are assumed to describe the selected field and water/management regime; users are asked to check that match. Reasons expose years, sample count, mean, regional and adjusted potential, fraction, weighting, bounds and assumptions. Farmer records never enter the public research corpus.

## Browser storage and privacy

- Drafts are stored under `soilsense:measurements:v1:<rounded field latitude>,<rounded field longitude>`, independent of accounts. Switching fields loads a different draft. Clearing measurements removes their values while retaining an empty draft; other fields are untouched.
- Browser storage can be blocked; the panel then says entries work only for this visit. Malformed saved drafts recover to empty inputs.
- Values are transmitted to the Worker to compute the requested plan. Personalized plan responses **bypass the memory/D1 plan cache**, skip `plan_log`, and use `Cache-Control: private, no-store`. Public source datasets still use their existing geographic caches. No schema migration, new resource, account or deployment is needed.
- This is the browser-only slice related to #50, not the entire stretch issue: harvested-area records, account-based ownership, audited revision history, formal uncertainty/held-out validation and a permanent original-versus-calibrated scenario archive are not implemented. Clearing inputs and rerunning restores regional-only calculations.

## Reproducible Kansas example

Run `npx vitest run test/measurements.test.ts`. Set `MEASUREMENTS_DEMO_OUTPUT` to a writable file to save the actual full baseline, soil-only and calibrated responses.

Inputs: `test/fixtures/power-finney-county-ks.json` parsed through `parsePower` and `buildPlan`; coordinates `(38.1095, -100.706)`; Finney County KS; **constructed test soil** (pH 6.4, OM 2%, AWC 0.21, described depth 200 cm), not a newly fetched SSURGO profile; rain only; balanced priority; recent crop corn; no NASS overrides; `now=2026-11-15T15:00:00Z`; plan start 2027. The saved weather is real source data; the soil/harvest entries are explicitly scenario inputs, not observations collected from a farmer.

| Scenario | Best rotation | Best indicative net return ($/acre/year) | Current-pattern corn yield (bu/acre) |
| --- | --- | ---: | ---: |
| No measurements | Fallow → Winter wheat → Grain sorghum | 5 | 65 |
| pH 5.8 only | Fallow → Winter wheat → Grain sorghum | 5 | 65 |
| pH 5.8 + corn: 2023=65, 2024=70, 2025=75 bu/acre | Fallow → Winter wheat → Grain sorghum | 5 | 68 |

The top rotation contains no corn, so its economics correctly remain unchanged. pH 5.8 does not cross the selected dryland crops' pH thresholds; the app does not force a ranking change just because a measurement was entered. The separate pH 4 test crosses thresholds and changes modeled plans. Unrecorded soybean years remain 31 bu/acre in the current pattern.

Actual added reasons for the combined scenario:

> Using your soil test pH 5.8 instead of the soil map's 6.4.
>
> Calibrated with your 3 years of corn yields (2023, 2024, 2025), average 70.0 bu/acre. Regional potential 220.0 → 229.2: additive 50% adjustment toward average ÷ modeled weather fraction 0.294, bounded to 60–115% of the state value. 0 years outside weather history use the last-10-year fraction. Assumes the selected water supply and usual previous crop; not independent validation.

## Verification

Automated tests cover the complete legacy-response snapshot, pH/OM/AWC/texture precedence and engine propagation, local crop-only adjustment, extreme/zero yields and bounds, malformed request inputs, per-field persistence and clearing, EN/ES, incomplete-row blocking, add/remove keyboard focus and privacy boundaries.

Built production assets were exercised against a real local Worker on port 8787, with no intercepted/synthesized API responses. Entered pH/OM/AWC and three corn yields survived a reload and were echoed in a successful real `/api/plan` response with the private/no-store header. Local D1 read-back found zero personalized plan cache entries and zero plan-log rows after that request.

The new panel was scanned at 320, 375 and 1280 px in English and Spanish, plus its real personalized result soil/reasons box at 375 px: axe-core 4.14.0, Chromium 159.0.8154.6, selected `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`; zero selected violations and zero incomplete results across seven scoped scans. No horizontal page overflow in the six input scans. Keyboard smoke checked the disclosure-to-pH Tab path; unit tests check focus after adding/removing yield rows. This scoped automation is not WCAG certification or a screen-reader user study. Full audit JSON and screenshots were retained in the task's local scratch artifacts, not committed as a large generated file.
