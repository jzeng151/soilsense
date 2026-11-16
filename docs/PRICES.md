# Farmer prices and price sensitivity

## Optional request contract

`PlanRequest.prices?: Partial<Record<CropId, number>>` overrides the corresponding USDA NASS price and then the prototype fallback, in that order. Units match the crop's yield unit: **$/bu for grain; $/US short ton for alfalfa hay**. Fallow has no product and cannot receive a price. Zero is a valid price. Non-numbers, non-finite values, negatives, values above 10,000, unknown crops and arrays are rejected at both the API boundary and pure-engine boundary. The upper bound is an input-safety limit, not a plausible-market-price assertion.

Prices affect every candidate's net return, relative profit score, selected plans, current-practice economics, water comparisons and drought replay economics. They do **not** change modeled yields, weather stress, nitrogen rates or cost assumptions. Farmer prices are unverified inputs, identified in plan facts; they are not market observations. The UI keeps an in-memory draft (including invalid text across navigation), does not persist it to an account, and blocks generation until it is valid.

`priceScenarios?: boolean` opts into `PlanResponse.priceSensitivity`. The dashboard requests this by default; API clients that omit it receive exactly the existing response shape and recommendation behavior. Absent fields do not alter the existing cache key or engine version. Prices use a sorted bounded key; the scenario flag and snapshot version also enter the cache key. These economic inputs can use shared plan caches; unlike farmer measurements, they are not treated as private personal measurements.

Example (prices here are **hypothetical farmer assumptions**, not sourced quotes):

```json
{
  "lat": 38.1095,
  "lon": -100.706,
  "irrigated": true,
  "priority": "profit",
  "recentCrops": ["winter_wheat", "corn", "winter_wheat"],
  "prices": { "corn": 8, "soybean": 6 },
  "priceScenarios": true
}
```

## Historical price scenarios: sensitivity, not a forecast

The small committed snapshot contains **60 actual annual observations**: six crop series × ten marketing-year labels, **2016–2025**, fetched live from USDA NASS Quick Stats at the timestamp in `src/engine/price-history.json`. All six returned Kansas state data; the capture script supports a national fallback but none was used in this snapshot.[1]

- `docs/data/prices/*.json` retains the exact six source-response byte streams (56,889 bytes total).
- `src/engine/price-history.json` records the credential-free exact queries, retrieval timestamp, source filenames, SHA-256 hashes and transcribed observations.
- `scripts/capture-price-scenarios.mjs` refreshes the snapshot using `NASS_API_KEY` from the environment or the ignored `.dev.vars`. It never writes the key into provenance URLs. Snapshot updates require review and a new `PRICE_SCENARIO_VERSION` if semantics/data change.
- Tests verify each source hash, each annual price against its raw returned observation, ten complete years, Kansas provenance and units. NASS may revise figures; these are the retained values, not a claim of permanently final prices.

Observed annual ranges in this snapshot (nominal dollars; **not** forecasts):[1]

| Engine crop | Received-price series | Minimum | Maximum | Source unit |
|---|---|---:|---:|---|
| corn | Corn, grain | 3.20 | 7.04 | $/bu |
| soybean | Soybeans | 7.93 | 14.30 | $/bu |
| winter_wheat | All wheat, explicit proxy | 3.20 | 8.71 | $/bu |
| sorghum | Sorghum, grain | 4.67 | 12.30 | $/cwt |
| oats | Oats | 1.77 | 5.01 | $/bu |
| alfalfa | Hay, alfalfa | 95.00 | 245.00 | $/US short ton |

Sorghum converts $/cwt × 0.56 to $/bu, following the existing NASS adapter's 56-lb/bu convention. All-wheat prices are used as a **proxy**, not falsely labeled winter-wheat-specific observations. Prices are not inflation-adjusted. Marketing years differ between crops; matching a year label is not matching an identical twelve-month window.

### What is calculated

There are **ten paired historical price sets**, not an independent low/high Cartesian grid. Each scenario uses every covered crop's price from the same marketing-year label, applied to all three plan years. This preserves the observed relative-price relationships rather than combining unobserved extremes. It does not model historical weather-price correlation or assume next season repeats one of those years.

Only the **already selected three plans plus current practice, when known**, are compared. Their exact crop order, cover choices, history, irrigation, modeled yields and cost assumptions remain fixed. Historical scenario prices replace farmer-entered prices for covered crops; the recommendation itself still uses the farmer-entered prices. Future crops without a retained historical series are explicitly reported in `fixedPriceCrops` and held at the entered/NASS/default price, never given fabricated histories. Fallow retains its weed-control cost and no revenue.

For each candidate:

- `bestCount`: scenarios where it has the highest **net return**, including every tie, **among only these displayed candidates**. Counts can sum to more than ten when candidates tie. This is not a probability, a percentage chance of success, or proof of global optimality. Priority scores are not recomputed and do not determine this count.
- `minNetPerAcre`, `maxNetPerAcre`: minimum/maximum annualized net return across those ten sets, rounded to whole $/acre/year. Annual yield and net displays use existing engine rounding; scenario economics use the unrounded yield inside `evaluate`, then the same per-year net rounding as the planner.

The callback re-evaluates economics for at most four fixed sequences per scenario using the **same input object and cached water simulation**. It does not call `runEngine`, enumerate crop/cover combinations, or download any source per scenario. Water-comparison searches do not calculate their own robustness cards.

## Real fixed Finney examples

`test/helpers/finney.ts` provides the retained POWER + Daymet weather, soil/NASS input fixture and wheat → corn → wheat recent history. With full irrigation and profit priority, the unchanged default is:

| Inputs | Selected top plan | Annualized net |
|---|---|---:|
| Existing NASS fixture prices, including corn $4.19/bu and soybean $10.88/bu | Soybean → Corn → Soybean | $194/acre/year |
| Hypothetical farmer corn $8/bu and soybean $6/bu | Corn → Oats → Corn | $559/acre/year |

The second input does **not** guarantee the highest dollar return: unchanged agronomic, reliability, soil and climate weighting still applies even under profit priority. Its current practice nets $590/acre/year, illustrating that trade-off rather than concealing it.

For the default profit-priority choice set, the four sensitivity rows have best counts **4, 4, 2, 0 of 10**. The default top plan ranges **$26–$533/acre/year**; current practice ranges **−$122–$530**. After the hypothetical farmer overrides, the newly selected top plan wins **0/10** historical sets (range **−$136–$468**) while its corn → soybean → corn alternative wins **10/10** (range **−$27–$604**). This is expected: sensitivity evaluates the fixed choice set at historical prices, not at the hypothetical farmer quote. Exact captured results and the wheat audit are retained in `test/fixtures/price-finney-examples.json` and checked by tests.

## Why irrigated wheat shows −$22/acre

The fixed Finney current practice has a winter-wheat year with **65.2860767934 unrounded modeled bu/acre** (displayed 65), $5.38/bu from the retained NASS input, 10.6749804006 modeled inches pumped (displayed 10.7), and 78.3432921521 lb N (displayed 78). Instrumenting the existing `evaluate` calculation gives:

| Component | Formula / value | $/acre |
|---|---|---:|
| Revenue | 65.2860767934 × $5.38 | 351.239093 |
| Base direct costs excluding N and land | $260 × (0.3 + 0.7 × yield/75) | 236.427546 |
| Nitrogen | 78.3432921521 × $0.65/lb | 50.923140 |
| Pumping | 10.6749804006 in × $8/in | 85.399843 |
| Cover planted after wheat in current practice | none | 0 |
| Establishment supplement | wheat: none | 0 |
| Total listed costs | sum above | 372.750529 |
| Net | revenue − listed costs | **−21.511436 → −22** |

Break-even price under these exact assumptions is approximately **$5.709495/bu**. The $260 base cost is an **undifferentiated approximate model assumption, year unknown, source null**; there is no defensible sourced seed/chemical/labor decomposition for it. The $0.65 N price, $8/in pumping cost, yield-goal scaling and rotation/weather adjustments also remain approximate assumptions, not verified Finney budgets. Land, capital recovery and marketing basis are excluded. The negative margin follows the arithmetic, but is **not evidence that actual irrigated Finney wheat necessarily loses money**. Covers add their own separately modeled costs when selected.

## K-State cost-basis decision: no unsafe opt-in

Do **not** relabel the existing reference budgets `kstate-2026` or make them drive defaults. The checked PDFs are **2025 Northeast Kansas, non-irrigated, middle-yield enterprise budgets**, published November 20, 2024: corn 145 bu/acre at $4.21/bu with $449.20 total direct expenses, soybean 55 bu/acre at $9.67/bu with $272.28 total direct expenses.[2][3]

Those two budgets are compatible with each other as a separately labeled reference illustration, **not** with this model's irrigated Southwest Kansas weather-adjusted treatment. Their direct expenses already include fertilizer/N, operator labor, insurance, fuel, repairs, seed, chemicals and operating interest; substituting them for `costPerAcre` and retaining model N/pumping additions would double-count components.[2][3] The existing reference treatment does not supply all other candidate crops, covers, rotation effects or irrigation treatments. A partial opt-in would rank some crops under one cost basis and the others under another. Therefore `economics.ts` remains display-only; no `costBasis` request option is introduced. A safe future option needs a complete, treatment-matched irrigated/rain-fed Southwest Kansas crop budget set and an explicit cost-component replacement policy.

## Verification and CPU budget

- `test/plan-prices-defaults.test.ts`: eight **full-response** snapshots (Finney × both irrigation modes × four priorities), captured from `origin/next` revision `825f163ad03cc087e0789e4c22787db296dfe517` before implementation. Not just winning-plan equality. No opt-in fields, defaults identical.
- The existing opt-in `test/plan-engine-benchmark.test.ts` was run before and after against the shared four-farm public captures, 32 combinations × four repetitions. Separate runs were noisy on the shared host, so a paired standalone harness supplements rather than hides them.
- `scripts/benchmark-price-scenarios.mjs`: standalone esbuild Node bundles, baseline source archive versus this branch, 32 combinations × 12 alternating repetitions each. It deeply compares **all 32 full default responses** and confirms scenario cards do not change selected recommendations. Node v24.20.0, Windows 11. Per-build means from that measured run:

| Variant | Wall ms | Process CPU ms | Builds |
|---|---:|---:|---:|
| Baseline `origin/next` | 23.99 | 25.91 | 384 |
| New code, inputs omitted | 23.17 | 25.81 | 384 |
| New code, sensitivity requested | 23.36 | 24.09 | 384 |

These are local process measurements, **not Cloudflare billed CPU telemetry**. Coarse Windows counters, V8/GC and concurrent host activity explain differences within noise; no claim that scenarios make planning faster. The measured change does not meaningfully slow uncached planning. `docs/data/price-engine-profile.json` preserves aggregate and per-case measurements, input hashes, runtime and baseline revision.

The EN/ES UI shows each year's expected yield beside net $/acre for top, alternative and current-practice plan cards. Local browser checks at **375 × 812** verified two-column yearly economics, no horizontal overflow, price validation, live request/recommendation changes, and translated sensitivity text. No changes to Korean translations, field boundaries, field-watch, pixel-fit, deployment, engine version or remote database.

## Sources

[1] https://quickstats.nass.usda.gov — USDA NASS Quick Stats annual Kansas prices, 2016–2025
[2] https://agmanager.info/sites/default/files/wysiwyg/Corn%20Cost-Return%20Budget%20in%20Northeast%20Kansas__Nov-20-2024.pdf
[3] https://agmanager.info/sites/default/files/wysiwyg/Soybean%20Cost-Return%20Budget%20in%20Northeast%20Kansas__Nov-20-2024.pdf
