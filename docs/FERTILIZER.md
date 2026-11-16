# Fertilizer guideline rates (display only)

## Evidence and source identity

Dorivar Ruiz Diaz et al., **Soil Test Interpretations and Fertilizer Recommendations in Kansas**, K-State Research and Extension MF2586, January 2024.

- Original PDF: https://bookstore.ksre.ksu.edu/pubs/soil-test-interpretations-and-fertilizer-recommendations_MF2586.pdf
- Retrieved **2026-11-16T01:36:31Z** (2026-11-15 US Eastern).
- Download verified `%PDF` magic, **804,803 bytes**, parsed as **36 PDF pages**.
- SHA-256: `21a21aece4f93acecff9e8d2eb30d835411aec2dc3961ad8e2a3cc912ef838a6`.
- Locators below are **printed pages**; add 2 for the one-based PDF page. Last page is p34, unnumbered back cover.
- Transcription is from the downloaded PDF text, not search snippets. Source is not vendored; the immutable hash identifies the revision.

> K-State MF2586 guideline rates for these inputs — not a prescription; confirm with a soil test and your agronomist

## API and independence

`POST /api/plan` keeps its original response when `includeFertilizer` is absent/false. Boolean `includeFertilizer: true` adds `fertilizer: PlanFertilizer` on each plan and current practice **after** `makePlan` and cache retrieval. The flag is not forwarded into engine inputs, stored, logged, or included in cache keys. No crop ranking, score, yield, nitrogenNeed, NITROGEN_PRICE_PER_LB, economics or cost-model nitrogen changes. The web client opts in explicitly. Enrichment is pure arithmetic O(plan-years), with no network calls or state mutation.

Lab fields live **additively in existing `SoilTest extends FertilizerInputs`**. Shared browser/API validation rejects strings, NaN, infinity and out-of-range values, rather than clipping. Ranges are application guards, not claims about agronomic calibration: profile nitrate-N and plant-available manure N 0–1000 lb/acre; Mehlich-3 P 0–1000 ppm; extractable K 0–5000 ppm; Sikora buffer pH 5.7–7.1 (printed table range); profile sulfate-S 0–500 ppm S; DTPA zinc 0–100 ppm. N application is `broadcast-preplant` or `injected-or-split`; P/K program is `sufficiency` or `build-maintenance`.

**Kansas only.** Numerical recommendations are withheld outside Kansas or when state is unknown. No other state guide is implemented. Lime additionally requires central/western Kansas (conservative implementation boundary longitude ≤ −98); eastern Kansas regional targets are not guessed.

## Nitrogen transcription (lb elemental N/acre)

EY is **the existing plan's expected yield for that crop-year**, not a new yield model. SOM is farmer-entered organic matter if supplied, otherwise the plan's USDA SSURGO mapped value explicitly labelled as such. Missing both means no numerical N or S rate.

Printed p5 corn / grain sorghum and p6 wheat:

`N = (ie / fe) × EY − se × ProfileN − SOM × factor − ManureN − OtherN + PreviousCropAdjustment`

| Crop | ie | SOM factor | Source |
|---|---:|---:|---|
| Corn, dryland | 0.88 | 20 | p5 |
| Corn, irrigated | 0.84 | 20 | p5 |
| Grain sorghum | 1.2 | 20 | p5 |
| Winter wheat | 1.45 | 10 | p6 |

`fe=0.65` injected/split; `fe=0.55` broadcast/fall preplant. `se=1.0` medium texture or western Kansas; `se=0.7` coarse texture or eastern Kansas. Where these overlap (coarse western soils), implementation conservatively uses 0.7. Longitude −98 separates western from eastern for this display approximation; confirm local loss risk. `ProfileN` defaults to **30 lb N/acre** when not sampled (p3–4); measured 0 is not missing. p3–4 nitrate conversion: `0.3 × depth(in) × ppm nitrate-N`. Inputs assume 0–24-inch samples.

- Oats p6: `N = 1.3 × EY − SOM × 10 − ProfileN − OtherN + PreviousCropAdjustment + TillageAdjustment`.
- Sunflower p6: `N = 0.075 × EY − SOM × 20 − ProfileN − ManureN − OtherN + PreviousCropAdjustment`, EY **lb seed/acre**.
- Corn/sorghum silage p7: `N = 10.67 × EY − SOM × 20 − ProfileN − ManureN − OtherN + PreviousCropAdjustment`, EY **US short tons/acre at 65% moisture**.
- Corn cap **230 dryland / 300 irrigated** (p5); corn silage same cap (p7). Corn, sorghum and wheat minimum **30**; oats/sunflower/silage say a 30-lb minimum **may be appropriate**. Implementation presents 30 as an explicit provisional starter assumption for these latter crops, not an unconditional source mandate.
- Established alfalfa **0 N** (p19). New seedings are not represented; p20 has different starter guidance.
- **No numeric soybean N formula is given in this revision.** Show unavailable/confirm with agronomist rather than inventing a legume application rate or copying economic nitrogenNeed. Fallow is 0 for all nutrients (no crop).
- This January 2024 revision **does not contain the requested old-style “Fertilizer N required at various yield and SOM levels” tables**. Tests instead exercise its actual printed equations, P/K tables, lime table and micronutrient thresholds. Do not claim nonexistent N-table replication.

Previous crop adjustments p3–4:

| Previous crop | Cool-season following crop | Warm-season following crop |
|---|---:|---:|
| Corn / wheat | 0 | 0 |
| Grain sorghum / sunflower | +30 | 0 |
| Soybean | 0 | −40 |
| Fallow, no profile test | −20 | −20 |
| Fallow, measured profile N | 0 | 0 |
| Alfalfa excellent / good / fair / poor | −60 / −40 / −20 / 0 | −120 / −80 / −40 / 0 |

Alfalfa credit also depends on destruction tillage; no-till halves credit. Stand density/destruction data are absent, so **following-alfalfa numerical N is withheld**. Prior crop comes from preceding plan year, or recent-crop override/history for year one. Never wrap last plan year around to first. Missing previous crop is labelled, not inferred. MF2586 lists red/sweet clover credits, **not crimson clover or hairy vetch**; no quantitative credit assigned to any app cover crop. Previous cover is recorded and this omission explained.

No irrigation-water N, grazing or tillage credits are supplied; zero explicitly assumed. `manureNLbPerAcre` means **plant-available N for this crop** (not total manure N): user/agronomist must apply p3 cool-season organic manure availability (50%) versus p4 warm-season availability (100%) before entering. Oats' printed formula lacks an explicit manure term; subtracting supplied available manure N is an application extension and must be confirmed locally.

## P2O5 and K2O transcription

Amounts are **lb nutrient/acre**, not lb elemental P/K or product weight. Required inputs: Mehlich-3 P and extractable K, ppm. Missing either: rate null, basis `soil-test-needed`, plus **crop-removal estimate in inputsUsed**. Never use a guessed lab value. Removal is nutrient export, **not a fertilizer prescription**.

All sufficiency equations use `a + b × EY + c × lab + d × EY × lab`:

| Crop | P coefficients a,b,c,d | P page | K coefficients a,b,c,d | K page | Removal P2O5 / K2O per yield unit (p2) |
|---|---|---:|---|---:|---|
| Corn | 50, .2, −2.5, −.01 | 9 | 73, .21, −.565, −.0016 | 21 | .33 / .26 per bu |
| Wheat | 46, .42, −2.3, −.021 | 10 | 62, .24, −.48, −.0018 | 22 | .50 / .30 per bu |
| Sorghum | 50, .16, −2.5, −.008 | 11 | 80, .17, −.616, −.0013 | 23 | .40 / .26 per bu |
| Soybean | 56, .51, −2.8, −.0257 | 12 | 60, .628, −.46, −.0048 | 24 | .80 / 1.40 per bu |
| Sunflower | 42, .01, −2.1, −.0005 | 13 | 80, .008, −.622, −.00006 | 25 | .015 / .006 per lb |
| Oats | 47, .25, −2.3, −.013 | 14 | 62, .221, −.48, −.0017 | 26 | .25 / .20 per bu |
| Corn silage | 56, 1.12, −2.8, −.056 | 15 | 74, 1.50, −.567, −.0115 | 27 | 3.20 / 8.70 per ton |
| Sorghum silage | 48, 1.19, −2.38, −.0594 | 16 | 73, 1.8, −.56, −.0139 | 28 | 3.20 / 8.70 per ton |
| Established alfalfa | 73, 4.56, −2.92, −.18 | 19 | 84, 5.24, −.56, −.035 | 31 | 12 / 60 per ton (15% moisture) |

P threshold 20 ppm (alfalfa 25), K 130 ppm (alfalfa 150). Below threshold minimum 15 lb/acre; above threshold basic sufficiency rate zero, with optional starter P **up to 20 lb P2O5/acre** for non-alfalfa crops. Starter is **not automatically added**. At exactly threshold apply printed polynomial, clamp negative to 0; don't extend the “less than” minimum beyond its stated domain. K starter has no numeric generic rate in MF2586; no amount inferred. Soybean fertilizer should not contact seed. Respect seed-contact N+K2O limits for all starters. At very low P at least 25–50% banded is recommended by the guide; placement needs local equipment/seed safety decisions.

Build-maintenance, same crop-specific pages:

- `P rate = (targetP − measuredP) × 18 / yearsToBuild + P2O5 crop removal`.
- `K rate = (targetK − measuredK) × 9 / yearsToBuild + K2O crop removal`.
- **Four-year build** is explicitly assumed. Do not go below sufficiency. No negative build increment. Within maintenance band (P target to target+10, K target to target+30): removal only. Above upper bound: zero basic application; optional starter guidance remains relevant.
- Initial lab values reused each year, **not simulated future soil-test results**. Repeat sampling; no guarantee that these rates achieve target soil concentration in four years.
- Formula outputs rounded to 0.1 lb/acre; printed category tables are not exact formula lookup/interpolation. Tests reproduce selected category cells with their printed rounding. Some formula/category midpoint pairs differ by 5 lb (e.g. corn K at EY120/K60), so exact agreement is not claimed for every category cell.

## Lime (p8)

Requires **measured soil pH plus Sikora buffer pH**, not USDA map pH. Guide formulas, multiplied by incorporation depth inches:

- Target 6.8: `(28300 − 7100 × buffer + 449 × buffer²) × depth`; southeast all crops and northeast alfalfa/clover, trigger pH<6.4.
- Target 6.0: `(14100 − 3540 × buffer + 224 × buffer²) × depth`; central/west all crops, northeast except alfalfa/clover, trigger pH<5.8.
- Target 5.5: `(7060 − 1770 × buffer + 112 × buffer²) × depth`; cash-flow/lime-availability problem areas central/west, trigger pH<5.5.

Only **target6 central/west** is computed currently. Default depth 6 inches incorporated, established alfalfa 2 inches. No-till requires 2 inches (one third the 6-inch rate); no-till status is not an app input, so the displayed rate must be confirmed, never applied without checking incorporation. Units **lb effective calcium carbonate (ECC)/acre, not lime product mass**. Rates >10,000: half rate, incorporate, wait 12–18 months, retest.

Printed p8 target6 examples at 6-inch depth: buffer7.1→1500, 6.5→3300, 6.0→5500 lb ECC/acre (rounded table).

## Sulfur (p34) and zinc (p33)

`S = cropFactor × EY − 2.5 × SOM − ProfileSulfur − OtherSulfurCredits`, nonnegative:

| Crop | Factor |
|---|---:|
| Corn / grain sorghum | .2 |
| Corn / sorghum silage | 1.33 |
| Wheat | .6 |
| Soybean | .4 |
| Sunflower | .005 |
| Alfalfa | 6 |

Profile S defaults to **25 lb S/acre** (explicit guide default). Sulfate-S input represents **0–24-inch sample, ppm elemental S**; convert using `0.3 × 24 × ppm` soil-profile mass convention (p3–4 nitrogen conversion; applying same soil-mass factor to sulfur is an explicit implementation assumption). Other sulfur credits zero. Oats has no calibrated S equation in the guide: withheld.

Zinc broadcast for corn, sorghum, soybean: `11.5 − 11.25 × ppm DTPA Zn`; at ≤1 ppm minimum1, >1 ppm0. Optional band starter0.5–1 lb Zn/acre alternative, **not in addition**. Wheat, sunflower, oats, alfalfa: no Zn recommended (p33). Missing DTPA test for responsive crops means null, not deficiency inferred.

## Limits / extensibility

`src/engine/fertilizer.ts` has its own crop table; no changes to cost-model crop records. Source-supported sunflower/corn_silage/sorghum_silage entries are reserved for expanded crop IDs with matching source yield units. **Cotton, canola, triticale, millet are not covered in MF2586: rates withheld**, never borrowed from wheat/corn. No commercial product selection, nutrient blending, seed-contact dose, environmental loss estimate, or prescription is implied. This is a provisional crop-year guideline conditional on stated inputs and assumptions.
