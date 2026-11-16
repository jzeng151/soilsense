# Farmer constraints in the rotation search

## Challenge mapping

The official [Field Shift challenge](https://www.spaceappschallenge.org/2026/challenges/adapting-farms-with-nasa-data), **Farmer-Centered Design**, suggests:

> Think about ways to allow farmers to input their own priorities or constraints, such as water availability, equipment limitations, or market preferences.

It also suggests comparing at least three rotation strategies **including the existing rotation**, explaining risks and information gaps, and supporting rather than replacing local expertise. These are optional challenge considerations, not NASA agronomic prescriptions.

| Request field (`constraints?`) | Challenge consideration | Search behavior |
| --- | --- | --- |
| `excludeCrops?: CropId[]` | Farmer priorities / local constraints | Remove any sequence containing a listed main crop. |
| `mustInclude?: CropId[]` | Farmer priorities, contract / landlord requirements | Every listed crop must occur at least once in the three future years. Up to three distinct crops. |
| `maxCornYears?: 0..3` | Farmer constraints; crop diversity | Count corn in the three planned years only. Zero is allowed. |
| `noSameCropBackToBack?: boolean` | Farmer constraints; rotation exploration | Reject adjacent identical crops, including the boundary with the last known historical crop. Also applies to alfalfa and fallow. This can conflict with the engine's multi-year alfalfa establishment rule; infeasibility is explicit. |
| `unavailableEquipment?: EquipmentGroup[]` | Equipment limitations | Reject main crops requiring any listed equipment group, based on explicit model-product assumptions below. |
| `marketOutlets?: MarketOutlet[]` | Market preferences / suitability | Require at least one reachable outlet for each modeled product. Omitted means no additional market restriction; `[]` means no buyers. Fallow needs no outlet. |
| `irrigationInches?: number` | Water availability | 0–30 seasonal inches, **each planned year**. Replaces the selected rain/limited/full water mode, including the old 254 mm (~10 inch) limited allowance. Zero is no pumping. It caps irrigation, not rain or total crop evapotranspiration. Crops remain possible under water stress; a cap is not a promise of adequate yield. |
| `well?: {gpm, acres, pumpingDays, hoursPerDay}` | Water availability | Derive a seasonal cap from capacity, explicit irrigated acreage and farmer-specified schedule. Use the smaller of allocation and capacity when both are given. |

## Search, defaults and infeasibility

`runEngine` applies crop/sequence constraints to **all agronomically feasible three-year sequences before cover evaluation, quick-search pruning, scoring, reliability selection or alternative diversification**. It does not filter the old top three. Existing agronomic feasibility rules remain hard constraints. Remaining plans are scored using the existing priorities and optional goals; profit normalization is relative to the remaining feasible choice set.

No constraints means the old path, cache key and response shape are retained. `test/constraints-baseline-capture.test.ts` compares the **entire serialized response** against `test/fixtures/constraints-defaults-before.json`, recorded from d0e175f using the fixed Finney fixtures/helper before engine edits, across 3 water levels × 4 priorities. The existing planner regression test also remains in place. This fixture contains model output, not observed future harvests.

When there is no satisfying sequence, `plans` is empty **with an explicit `constraints.status: "infeasible"` and message**, not an unexplained empty list and never a relaxed recommendation. `binding` names constraints that rejected otherwise agronomically feasible candidates. It is deliberately labeled a **non-minimal conflict set**; it is not a claim that each named constraint independently causes infeasibility. The UI presents the conflict and a route back to inputs. Fewer than three distinct feasible alternatives may be returned; we never manufacture alternatives.

The current-practice comparison is evaluated separately and retained even when it violates crop/equipment/market constraints. `currentPracticeViolations` lists those violations. The constraints result card shows it without requiring the alternatives accordion, even when no recommendation is possible. A water cap is applied to both new rotations and the current-pattern scenario for a like-for-like water comparison; this does **not** claim the farmer's historical pumping obeyed that future cap. Unknown history remains explicitly unknown.

When a specific water cap is present, generic rain/limited/full comparison buttons are not supplied (`waterOptions: []`); the cap would override all three and identical labeled options would mislead. Historical yield calibration and OpenET checks keep their historical selected-practice assumptions; drought scenario replays use the new cap. Neither new water inputs nor crop constraints are independently verified farm measurements.

## Extensible equipment and market assumptions

`src/shared/constraints.ts` exports the optional request contract, stable identifiers and `CropRequirements`. `src/engine/constraints.ts` exports `CROP_REQUIREMENTS: Partial<Record<CropId, CropRequirements>>`; add entries for any newly modeled crop/product. The additive lookup avoids changing `CropDef` or exhaustive crop tables in parallel work. New crop entries **must** supply metadata before their equipment/outlet restrictions can be enforced.

These are **explicit planning assumptions**, not sourced claims that these are the only ways to plant or market a crop. Regional availability remains a separate gate. Market alternatives are OR; equipment requirements are AND.

| Modeled product | Equipment groups required | One of these outlets |
| --- | --- | --- |
| Corn grain | Row-crop planter | Grain elevator; feedlot/dairy |
| Soybean grain | Row-crop planter | Grain elevator; oilseed buyer |
| Winter wheat grain | Grain drill | Grain elevator |
| Oats grain | Grain drill | Grain elevator; feedlot/dairy |
| Alfalfa hay | Grain drill + hay equipment | Feedlot/dairy/hay buyer |
| Sorghum grain | Row-crop planter | Grain elevator; feedlot/dairy |
| Fallow | None of these crop-specific groups | None |

Cotton-stripper and cotton-gin identifiers are reserved for the cotton extension, not evidence of cotton availability today. The current corn/sorghum definitions model grain, not silage. Groups cover crop-specific planting/harvest capabilities, not an exhaustive inventory (e.g. a grain combine, spray equipment or tractor). Cover crops keep existing establishment assumptions; no unsupported herbicide/cover-establishment restriction is invented. Users should review the equipment/outlet assumptions with local advisers.

## Well conversion and limitations

Source: Danny H. Rogers and Mahbub Alam, Kansas State University Extension, [**MF1040 Useful Conversions and Formulas**, revised January 1998](https://bookstore.ksre.ksu.edu/download/useful-conversions-and-formulas_MF1040), sections **Water Measurement** and **Water Application**:

- 1 acre-inch = **27,154 gallons**.
- Application depth = flow rate × application time ÷ area.
- 1 inch = 2.54 cm = 25.4 mm.
- Net irrigation = gross irrigation × system efficiency.

```
well seasonal inches = gpm × 60 minutes/hour × hours/day × pumpingDays
                       ÷ (27,154 gallons/acre-inch × irrigated acres)
effective cap = min(entered allocation, well seasonal inches)
```

All acreage and schedule values are explicit; the model assumes no default pumping season. For example, 271.54 gpm × 60 × 1 hour/day × 100 days ÷ (27,154 × 60 acres) = 1 seasonal inch (a unit-test conversion example, **not a recommended pumping schedule**). The form and result show the substituted conversion and source.

This is a **gross seasonal volume approximation**, not a daily hydraulic capacity or irrigation scheduling model. Existing engine allowances treat gross pumped water as root-available (no additional application-efficiency loss); this optimistic assumption is disclosed in the form and response assumptions. Rainfall, stored soil water, pumping costs and stressed yields are still simulated. Pump drawdown, downtime, water rights, peak-day delivery, application uniformity and conveyance losses are not modeled. The numerical request guardrails (`gpm` 0–100,000; acres 0.01–1,000,000; pumping days 1–366; hours/day 0.01–24) are input-safety bounds, **not agronomic recommendations**.

## Validation, caching and UI

`src/shared/validateConstraints.ts` rejects unknown fields, invalid crop/group/outlet identifiers, non-finite numbers, numeric strings and missing well parameters. Both the route and `buildPlan` validate. Conflicting but structurally valid inputs reach the explicit infeasible result. Lists are bounded, deduplicated and sorted for cache identity. Empty defaults do not add cache-key segments; an explicitly empty market list does. Every substantive constraint field enters `planCacheKey`. Constraints are cacheable non-personal configuration; existing measurement privacy behavior is unchanged.

The optional EN/ES `ConstraintsPanel` uses native checkbox/number controls, labels, fieldsets, focus outlines and a single-column mobile layout under 400 px. Invalid numeric input blocks planning. The results card explains exclusions and current-practice violations. Korean and other translations use the application's fallback policy; this change adds EN/ES only.

## Herbicide carryover

**Not implemented.** No farmer-specific product label, application date/rate or crop-specific authoritative restriction is collected. A generic number of months would be unsafe. Consult the actual herbicide label and local K-State Extension guidance; no unsourced warning or exclusion is applied.

## Relationship to preview work

PR #70 / `feat/38-rotation-constraints` explores a read-only preview over existing recommendations in `farmerConstraints.ts` / `FarmerConstraintEvidence.tsx`. This implementation supersedes that **post-search filtering behavior** by constraining the candidate search itself. It does not edit those files or claim their evidence panel is equivalent.

## Verification

- Constraint unit/integration tests: exclusion, required crops, corn limits, history-boundary repeat rule, every equipment group affecting current crops, outlet alternatives, combinations, conflicts, current-practice retention, seasonal allocation, well conversion and strict validation.
- Cache tests cover every field and canonical order/default equivalence.
- Full-response default snapshots cover all 12 Finney water/priority cases.
- EN/ES component tests exercise native crop checkboxes and label associations.
- Local benchmark: `PLAN_CAPTURE_DIR=<public captures> PLAN_BENCH_OUTPUT=<report.json> npx vitest run test/plan-engine-benchmark.test.ts`. Measurements are local process CPU/wall time, **not Cloudflare billed CPU**. Warm samples omit each scenario's first run. Before/after results are documented in the PR.

### Recorded local evidence

- [`evidence/constraints-cpu.json`](evidence/constraints-cpu.json): Node v24.20.0 on Windows, original 32-scenario benchmark before d0e175f versus after 8329e5b. Warm median CPU 31 → 31 ms; separate-run wall median 24.75 → 28.06 ms (concurrent host activity was uncontrolled).
- [`evidence/constraints-cpu-paired.json`](evidence/constraints-cpu-paired.json): independent standalone ESM bundles of the baseline and new engine, same process and inputs, alternating order, 4 warmups + 8 measured repetitions for each of 32 scenarios. **Every complete serialized response matches**, not only the winners. Median wall 22.48 → 22.43 ms; mean process CPU 27.06 → 26.96 ms (coarse Windows median CPU 30 → 31 ms). The paired control does not show a material default-path regression; these local measurements cannot guarantee any Cloudflare CPU tier.
- Standalone constrained Finney capture, 5 warmups + 20 repetitions: baseline median CPU/wall 31/30.78 ms; unavailable row planter 16/16.91 ms; require corn at most once 16/19.87 ms. Constrained pruning reduces simulation work.
- [`evidence/constraints-a11y.json`](evidence/constraints-a11y.json): axe-core 4.14.0 against real production build a5622f7 / Chrome 145, 3 scoped panel/result states in EN/ES at 375/320 px, **0 selected-rule violations and 0 incomplete results**. Explicit WCAG 2 A/AA + 2.1 A/AA tags; not whole-app certification. Native Tab/Space/Tab/Shift+Tab verified summary → corn checkbox → toggle → soybean → corn. No horizontal overflow at document client widths 360 and 305 px (classic scrollbars consume 15 px).
- Real local Worker, public Finney lookup (not a mocked API): require/exclude corn showed the infeasible notice and current corn → soybean → corn comparison, in EN and ES. A 3-inch allocation with 500 gpm / 125 acres / 100 days / 20 hours displayed `500 × 60 × 20 × 100 ÷ (27,154 × 125) = 17.68`; all three returned recommendations included corn and pumped at most 3 inches in every year. Allocation 31 returned HTTP 400; the form also marked it invalid and disabled planning.

`benchmark-constraints.ts` bundles with esbuild (`--bundle --platform=node --format=esm`) and accepts capture directory + output JSON. For a paired default comparison, bundle `src/engine/plan.ts` at the old and new revisions to `constraints-baseline-engine.mjs` / `constraints-current-engine.mjs` alongside the four public capture files, then run:

```sh
node scripts/benchmark-constraints-paired.mjs <native-capture-and-bundle-directory> <output.json>
```

The scripts perform no network calls and bypass the Worker response cache. The 32-scenario paired test asserts complete response equality before recording successful output. Public capture provenance remains the existing benchmark's; model outputs are not measured future yields.
