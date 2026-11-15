# Exploratory Kansas Field Watch backtest

**Limited retrospective evidence, not full scientific validation.** This delivers the backtest write-up portion of #53, not the entire issue. It is separate from the crop-yield checks in [VALIDATION.md](../VALIDATION.md).

## Versions and reproducibility boundary

- Repository build checked: `e69ac98ce93919d8e7b14311b88bf0c85c901eb7` (`origin/next`, including #56/#58).
- Current Field Watch `RULE_VERSION = 2`: Dry requires rain and root-zone percentiles ≤20; Watch requires either ≤30. Missing soil cannot produce Dry. These remain demonstration settings.
- Report implementation: `scripts/validation/summarize.py`, version `recorded-kansas-summary-v1`; its PR commit pins the report code.
- Historical A–E outputs came from the supplied backtest’s older code snapshot / rainfall candidate, **not this build**. The original generator snapshot’s commit ID is unknown.
- Full input SHA-256 hashes and unrounded results: [kansas-results.json](kansas-results.json). Original retrieval dates/product versions are unknown; no dates are invented.
- Raw inputs are external, in the supplied profile scratch `backtest/` folder. Required files: `rows.json`, `fixrows.json`, `yield_validation.csv`, `usdm_district_weekly.csv`. Raw observations are not republished.
- Six original scripts and the brief/project note are preserved unchanged under `scripts/validation/original/`. They contain historical machine paths and refer to generator sources not bundled here. They are archives, **not portable regeneration commands**. The new scorer is portable and offline.

Hashes identify the supplied records, not whether their original extraction was correct. A fresh clone cannot regenerate those raw records without the external bundle/source snapshots. No live provider or download regeneration was performed.

## Design and denominator

Nine Kansas district **points**, not field polygons or district-wide weather averages. POWER daily weather and modeled root-zone wetness span 1991–2025. Weekly USDM district area percentages cover 2015–2025; NASS district annual yield anomalies cover 2016–2025.

Recalculation found **5,166 district-weeks**, including **2,583 April–September weeks**. The comparison label is D1-or-worse covering at least 50% of a district: true in **676 growing-season weeks (26.2%)**. All nine candidates have 2,583 usable growing-season records and zero skipped records in these supplied data. Recorded window-end mismatches: zero. Missing predictions are skipped and counted, never changed to no-alerts.

Rain uses 14 days ending before the map date; root-zone wetness uses 7 days. Fixed-baseline candidates compare matching calendar windows in 1991–2020, excluding the evaluated year. Historical A–E variants differ in baseline/tie handling; see preserved generators. Upstream date/extraction correctness has not been independently revalidated by this scorer.

## Recomputed results

Percentages rounded to one decimal; JSON retains counts. Hit = TP/(TP+FN); false-positive rate = FP/(FP+TN); precision = TP/(TP+FP). False-positive rate is **not** the fraction of alerts that disagree with the label.

| Recorded / exploratory candidate | Alerts | Hit | False positive | Precision |
|---|---:|---:|---:|---:|
| A: 14-day rain < half of mean | 26.8% | 37.6% | 22.9% | 36.8% |
| B: rain in driest fifth | 20.8% | 29.1% | 17.9% | 36.6% |
| C: recorded version-1 Dry | 12.6% | 26.5% | 7.7% | 54.9% |
| D: recorded v1 Watch or Dry | 40.7% | 61.8% | 33.1% | 39.8% |
| E: recorded v1 rain-only test | 20.6% | 28.0% | 18.0% | 35.5% |
| Proposed rain ≤33 AND soil ≤25 | 16.7% | 38.8% | 8.9% | 60.8% |
| Soil-only ≤25 | 24.2% | 56.1% | 12.9% | 60.6% |
| Fixed-baseline rain AND soil ≤20 | 10.2% | 25.3% | 4.8% | 65.0% |
| Fixed-baseline rain OR soil ≤30 | 42.5% | 68.2% | 33.5% | 41.9% |

The last two resemble current v2 cutoffs but **do not exercise the current rule function/live source-selection pipeline**. They are not a fresh validation set. The proposed combination catches fewer labeled weeks than soil-only at similar precision: a sensitivity/alert-frequency trade-off, not an unambiguous winner. No thresholds or rankings were tuned for this report.

Spearman association of June–August alert counts with annual yield anomalies:

| Candidate | Corn (n=89) | Sorghum (n=84) | Soybeans (n=78) |
|---|---:|---:|---:|
| A | −0.23 | −0.36 | −0.48 |
| C: recorded v1 Dry | −0.40 | −0.57 | −0.58 |
| Proposed 33/25 | −0.48 | −0.63 | −0.55 |
| Soil-only ≤25 | −0.53 | −0.65 | −0.54 |

These are observational associations, not yield-prediction accuracy or proof alerts improve outcomes. No significance claim is made for differences between correlations.

JSON includes exploratory 95% percentile bootstrap intervals: 1,000 whole district-year resamples, seed 7, sorted block keys. They can differ slightly from archived intervals because block ordering is pinned. Blocks do not adequately account for shared statewide events or multi-year drought; uncertainty may be understated.

## Reviewer findings and limits

[Review notes](../../scripts/validation/REVIEW-NOTES.md) distinguish the original project suggestion from the independent Codex review. **These are AI/code-methodology reviews, not agronomist or extension approval.**

- Existing comparisons are exploratory after many examined thresholds/metrics. The later period influenced selection and is no longer untouched.
- A fixed 1991–2020 baseline includes future information for 2015–2019. It describes retrospective climate-normal context, not what was knowable then.
- Regional expert-blended USDM is not field-level ground truth for a 14-day signal. It also uses related rainfall/soil indicators, weakening independence. GWETROOT is modeled, not a soil probe.
- Complete revised historical data do not mimic publication lag, outages or preliminary-value revisions. No live/forecast/irrigation-need performance is established.
- NASS is a different outcome, but annual sample sizes are small and district-years clustered. CDL/NDVI may be correlated evidence. Groundwater and USDM are context, not automatic field-level truth gates.
- No professional strategy-card review, non-team comprehension study, or timed cached-load observation was available.

Permitted claim: **“A transparent demonstration check for unusual recent rain and modeled soil wetness in regional NASA estimates, with exploratory Kansas comparisons.”** Do not claim optimal thresholds, validated drought onset, field yield prediction or irrigation advice.

## Run locally

Python 3 standard library only; no network calls or credentials:

```bash
python -m unittest discover -s scripts/validation -p 'test_*.py'
python scripts/validation/summarize.py --data-dir PATH_TO_RECORDED_BACKTEST --output docs/validation/kansas-results.json
```

This session ran both: **5 Python tests passed**; 5,166 records / 2,583 growing-season rows / 9 candidates scored. Tests deliberately introduce missing/NaN values, wrong district/week joins and duplicates, plus known confusion/rank examples. Wrong joins fail, not silently associate evidence. This does not replace #53’s separate quoted-source/fact-association requirement.

Existing smoke and feature suites remain independently runnable:

```bash
npm test -- test/routes.test.ts test/engine.test.ts test/water-replay.test.ts
npm test -- test/fieldwatch.test.ts test/field-agent.test.ts test/research.test.ts
npm test
npm run typecheck
npm run build
```

This branch also ran the independently selected smoke suites (27 tests passed), agent/retrieval suites (63 passed), full `npm test` (143 passed, 10 existing opt-in skips), `npm run typecheck` and `npm run build` (both passed; existing bundle-size warning only).

## #53 acceptance coverage

| Requirement | Status |
|---|---|
| Pinned compact backtest record and honest limitations | Delivered for supplied recorded outputs |
| Existing MVP/replay/agent/retrieval mock suites remain runnable | Local gates checked; no new CI workflow claimed |
| Full feature-gated opt-out/access/outbox/new-module matrix | Partial existing tests; not delivered here |
| 20 handwritten answerable questions, ≥16/20 top-three, separate abstention set | Not done; denominator not reduced or relabeled |
| Every quote and crop/region/treatment association verified | Complete evaluation not done; existing corpus verifier is separate |
| Number/fact association in cards/generated text/messages | Not done end-to-end |
| Independent agronomy/extension card review | No expert available; no approval claimed |
| Two non-team comprehension/timing observations | Not collected |
| Groundwater/CDL/NDVI/USDM consistency matrix | Limits documented; expanded tests not done |
| Wind/residue/GDD/WIMAS/USDM unknown/attribution cases | Not delivered here; dependent feature work must supply these |

Next: precommit objective, farmer action and error costs; freeze candidates before untouched-region data; replay with live-availability/missing-soil masks; obtain independent professional and usability review. None is marked complete here.
