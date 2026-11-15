# Optional farmer goals

`PlanRequest.goals?: Goal[]` accepts up to two distinct preferences, independent of the four existing priorities. The API rejects unknown goals, duplicates, non-arrays and more than two goals. Omitted/empty goals keep the old engine object shape, scores, selected covers and ranking; the response still echoes `goals: []` when explicitly provided.

## Scoring contract

The four `PRIORITY_WEIGHTS` remain unchanged. Before selecting the best covers per sequence, normalize each goal metric across **all feasible candidate plans** with `(value - min) / (max - min)` (reversed for lower-is-better). Equal metrics earn zero, and baseline/current-practice values outside the candidate range are clamped. Each selected goal receives `0.1 / selectedGoalCount` of bonus budget. The sum is at most **+0.1**; it can legitimately leave the top plan unchanged. Existing reliability gates, feasible-sequence rules and crop-set diversity selection still take precedence. Scores retain the existing 3-decimal total rounding; each goal bonus is recorded to four decimals.

- **Water conservation:** lower simulated pumping in inches/calendar year under full/limited irrigation. On rain-only fields, compare simulated **main-crop water use**, not pumping savings. This can reward fallow or reflect water stress; UI and reasons explicitly warn about that. Cover-crop ET is not separately modeled by this metric (the existing cover/recharge behavior remains unchanged).
- **Nitrogen fixation:** 70% normalized lower total fertilizer N after the engine's existing rotation/cover nitrogen credits, plus 30% normalized count of legume crop/cover seasons. This is not a measured amount of biological fixation.
- **Erosion control:** normalized rotation proxy `0.08 × cover seasons + 0.10 × small-grain seasons + 0.15 × perennial seasons − 0.12 × fallow seasons`. These are the existing soil-health component concepts, not measured residue or erosion reduction. The wind screen is a separate route, not already computed in `buildPlan`; no extra wind/network requests are added.
- **Organic matter:** normalized rotation proxy `0.15 × perennial seasons + 0.08 × cover seasons + 0.08 × max(0, distinct non-fallow crops − 1) − 0.12 × fallow seasons`. Not a prediction of carbon sequestration or measured organic-matter gain.
- **Forage/hay market:** normalized alfalfa/hay-season count, only when `forage_market` is selected. It does **not** remove existing alfalfa candidates when off, and does not change hay prices, yields or costs. Alfalfa can still benefit from other selected agronomic goals; there is no implicit *market* bonus.

`RotationPlan.scores` includes `priorityTotal`, `goalsBonus` and per-goal `{normalized, bonus, metrics, reason}` only with goals. Goal reasons are also in plan notes and the top plan's facts. Plan cards expose the separate subtotal, bonus and reasons. Goal-aware water comparisons use full candidate search so base-only quick pruning cannot hide cover/goal benefits. Plan and research-explanation cache keys include selected goals, and the plan engine version is bumped.

## Verification and Kansas fixture sanity check

Run `npx vitest run test/goals.test.ts test/goals-api.test.ts test/goals-demo.test.ts web/src/components/GoalPicker.test.ts`. The no-goal golden snapshot was captured before changing engine behavior; existing ranking tests are untouched. The demo test runs `buildPlan` for 12 scenarios (36 shown plans) and can save full real results with `GOALS_DEMO_OUTPUT`.

The table below was generated from those actual saved `buildPlan` results, not a live API request. Inputs: `(38.1095, -100.706)`, balanced priority, recent crop `[corn]`, Finney County KS, existing engine-test Richfield soil values, no NASS price/yield overrides, saved `test/fixtures/power-finney-county-ks.json` weather, `now=2026-11-15T15:00:00Z`, plan start 2027 (first-year winter wheat planting window closed). A different recent crop, live soil response, weather merge, or market-price inputs can change the result.

Notable tradeoffs: full-irrigation alfalfa remains top even with the water goal because the capped bonus does not override its base score; it receives **zero water bonus**. The rain-only water goal moves the two-fallow plan up by lowering modeled main-crop water use, **not** by saving pumped irrigation. Erosion/organic goals can change covers without changing the crop label. Existing alfalfa economics remain for the team's separate price decision.

| Water | Goal | Rank | Rotation | Covers after years 1 / 2 / 3 | Base | Bonus | Total | Pump in/yr | N lb/acre over plan | Net $/acre/yr |
|---|---|---:|---|---|---:|---:|---:|---:|---:|---:|
| full | none | 1 | Alfalfa (hay) → Alfalfa (hay) → Alfalfa (hay) | none / none / none | 0.859 | 0.0000 | 0.859 | 21.8 | 0 | 281 |
| full | none | 2 | Soybean → Alfalfa (hay) → Alfalfa (hay) | none / none / none | 0.760 | 0.0000 | 0.760 | 18.7 | 0 | 194 |
| full | none | 3 | Alfalfa (hay) → Alfalfa (hay) → Corn | none / none / none | 0.737 | 0.0000 | 0.737 | 19.7 | 42 | 199 |
| full | water_conservation | 1 | Alfalfa (hay) → Alfalfa (hay) → Alfalfa (hay) | none / none / none | 0.859 | 0.0000 | 0.859 | 21.8 | 0 | 281 |
| full | water_conservation | 2 | Soybean → Alfalfa (hay) → Alfalfa (hay) | none / none / none | 0.760 | 0.0254 | 0.785 | 18.7 | 0 | 194 |
| full | water_conservation | 3 | Alfalfa (hay) → Alfalfa (hay) → Corn | none / none / none | 0.737 | 0.0172 | 0.754 | 19.7 | 42 | 199 |
| full | nitrogen_fixation | 1 | Alfalfa (hay) → Alfalfa (hay) → Alfalfa (hay) | none / none / none | 0.859 | 0.0925 | 0.952 | 21.8 | 0 | 281 |
| full | nitrogen_fixation | 2 | Alfalfa (hay) → Alfalfa (hay) → Soybean | none / none / hairy_vetch | 0.758 | 0.1000 | 0.858 | 18.7 | 0 | 174 |
| full | nitrogen_fixation | 3 | Alfalfa (hay) → Alfalfa (hay) → Corn | none / none / none | 0.737 | 0.0778 | 0.815 | 19.7 | 42 | 199 |
| full | erosion_control | 1 | Alfalfa (hay) → Alfalfa (hay) → Alfalfa (hay) | none / none / cereal_rye | 0.859 | 0.0898 | 0.949 | 21.8 | 0 | 268 |
| full | erosion_control | 2 | Soybean → Alfalfa (hay) → Alfalfa (hay) | cereal_rye / none / cereal_rye | 0.760 | 0.0780 | 0.838 | 18.7 | 0 | 167 |
| full | erosion_control | 3 | Alfalfa (hay) → Alfalfa (hay) → Corn | none / cereal_rye / cereal_rye | 0.732 | 0.0780 | 0.810 | 19.7 | 41 | 169 |
| full | organic_matter | 1 | Alfalfa (hay) → Alfalfa (hay) → Alfalfa (hay) | none / none / cereal_rye | 0.859 | 0.0957 | 0.955 | 21.8 | 0 | 268 |
| full | organic_matter | 2 | Soybean → Alfalfa (hay) → Alfalfa (hay) | cereal_rye / none / cereal_rye | 0.760 | 0.0979 | 0.858 | 18.7 | 0 | 167 |
| full | organic_matter | 3 | Alfalfa (hay) → Alfalfa (hay) → Corn | none / cereal_rye / cereal_rye | 0.732 | 0.0979 | 0.830 | 19.7 | 41 | 169 |
| full | forage_market | 1 | Alfalfa (hay) → Alfalfa (hay) → Alfalfa (hay) | none / none / none | 0.859 | 0.1000 | 0.959 | 21.8 | 0 | 281 |
| full | forage_market | 2 | Soybean → Alfalfa (hay) → Alfalfa (hay) | none / none / none | 0.760 | 0.0667 | 0.827 | 18.7 | 0 | 194 |
| full | forage_market | 3 | Alfalfa (hay) → Alfalfa (hay) → Corn | none / none / none | 0.737 | 0.0667 | 0.804 | 19.7 | 42 | 199 |
| rain | none | 1 | Fallow (no crop) → Winter wheat → Grain sorghum | none / none / none | 0.524 | 0.0000 | 0.524 | 0.0 | 122 | 5 |
| rain | none | 2 | Grain sorghum → Fallow (no crop) → Grain sorghum | none / none / none | 0.518 | 0.0000 | 0.518 | 0.0 | 155 | 19 |
| rain | none | 3 | Fallow (no crop) → Grain sorghum → Fallow (no crop) | none / none / none | 0.506 | 0.0000 | 0.506 | 0.0 | 88 | -7 |
| rain | water_conservation | 1 | Fallow (no crop) → Grain sorghum → Fallow (no crop) | none / none / none | 0.506 | 0.0838 | 0.590 | 0.0 | 88 | -7 |
| rain | water_conservation | 2 | Fallow (no crop) → Winter wheat → Grain sorghum | none / none / none | 0.524 | 0.0543 | 0.578 | 0.0 | 122 | 5 |
| rain | water_conservation | 3 | Grain sorghum → Fallow (no crop) → Grain sorghum | none / none / none | 0.518 | 0.0438 | 0.562 | 0.0 | 155 | 19 |
| rain | nitrogen_fixation | 1 | Fallow (no crop) → Winter wheat → Grain sorghum | none / none / none | 0.524 | 0.0305 | 0.555 | 0.0 | 122 | 5 |
| rain | nitrogen_fixation | 2 | Fallow (no crop) → Grain sorghum → Fallow (no crop) | none / none / none | 0.506 | 0.0415 | 0.548 | 0.0 | 88 | -7 |
| rain | nitrogen_fixation | 3 | Grain sorghum → Fallow (no crop) → Alfalfa (hay) | none / none / none | 0.482 | 0.0558 | 0.538 | 0.0 | 67 | -13 |
| rain | erosion_control | 1 | Fallow (no crop) → Winter wheat → Grain sorghum | none / none / cereal_rye | 0.524 | 0.0361 | 0.560 | 0.0 | 122 | -8 |
| rain | erosion_control | 2 | Grain sorghum → Fallow (no crop) → Grain sorghum | none / none / cereal_rye | 0.518 | 0.0241 | 0.542 | 0.0 | 155 | 5 |
| rain | erosion_control | 3 | Grain sorghum → Fallow (no crop) → Alfalfa (hay) | none / none / cereal_rye | 0.482 | 0.0422 | 0.524 | 0.0 | 67 | -26 |
| rain | organic_matter | 1 | Fallow (no crop) → Winter wheat → Grain sorghum | none / none / cereal_rye | 0.524 | 0.0354 | 0.559 | 0.0 | 122 | -8 |
| rain | organic_matter | 2 | Grain sorghum → Fallow (no crop) → Grain sorghum | none / none / cereal_rye | 0.518 | 0.0253 | 0.543 | 0.0 | 155 | 5 |
| rain | organic_matter | 3 | Grain sorghum → Fallow (no crop) → Alfalfa (hay) | none / none / cereal_rye | 0.482 | 0.0544 | 0.536 | 0.0 | 67 | -26 |
| rain | forage_market | 1 | Fallow (no crop) → Winter wheat → Grain sorghum | none / none / none | 0.524 | 0.0000 | 0.524 | 0.0 | 122 | 5 |
| rain | forage_market | 2 | Grain sorghum → Fallow (no crop) → Grain sorghum | none / none / none | 0.518 | 0.0000 | 0.518 | 0.0 | 155 | 19 |
| rain | forage_market | 3 | Grain sorghum → Fallow (no crop) → Alfalfa (hay) | none / none / none | 0.482 | 0.0333 | 0.515 | 0.0 | 67 | -13 |
