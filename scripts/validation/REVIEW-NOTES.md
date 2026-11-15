# Review record: exploratory Kansas backtest

These are **AI/code-methodology reviews, not independent agronomist or extension approval**. No expert card review or farmer comprehension study is recorded here.

## Original project note

`original/MY_VIEW.md` is copied unchanged from the supplied folder. It recommends stopping threshold tuning, using externally described USDM percentile bands for demonstration cutoffs, and freezing candidates before testing on untouched Iowa/Illinois/Nebraska data. The note’s proposed claim about agreement is not accepted as a general validation conclusion here.

## Independent Codex reviewer

Source: supplied `codex_answer.log`, final answer (lines 2816–2839 in that artifact); model/tool review, not a domain professional. The reviewer recalculated saved rows, not original downloads or live behavior. Key findings retained:

- Define the intended action and target before thresholds: unusually little rain, crop stress and drought onset are different questions.
- The existing comparisons are exploratory. A genuinely untouched test needs new data.
- The fixed 1991–2020 baseline includes future information for earlier replays. Excluding the replay year does not fix “as known then” leakage.
- Complete historical inputs through yesterday do not establish live performance with publication lag and revised preliminary data.
- USDM is a regional blend of short/long-term indicators with partially shared inputs, not field-level ground truth for a 14-day dry spell.
- Soil ≤25 was chosen after examining later-period results; that later period is no longer untouched.
- Soil-only ≤25 has about 56% sensitivity and 61% precision, versus about 39% and 61% for the proposed rain≤33 AND soil≤25 combination. The combined rule sacrifices sensitivity to reduce alerts; it is not unambiguously superior.
- District-year bootstrap blocks miss statewide dependence and multi-year droughts. Annual yield associations are observational and clustered.
- “9% false alarms” refers to non-drought weeks, not the fraction of alerts that are wrong. “No measurable baseline difference” is not evidence of equivalence.
- Recommended a simple rainfall-percentile **demonstration** rule, transparent dates/baseline/freshness, complete windows, explicit missingness and pinned rule/input versions. Did not endorse field stress, yield, irrigation-need or drought-onset claims.
- Best extra check: freeze a replay and mask recent days to mimic live availability, including missing soil.

## Disagreement and current implementation

The project note preferred rain-plus-soil bands; the independent reviewer preferred rainfall-only for the narrow low-rainfall purpose. Neither is expert approval. Current `origin/next` at the tested build uses rule version 2: rain AND soil ≤20 for Dry, either ≤30 for Watch; missing soil cannot produce Dry. Its thresholds are explicitly demonstration settings. This report does not choose or change that rule, and the archived outputs do not exercise its current live pipeline.

## Fixes and open uncertainty

This PR makes denominators explicit, adds the omitted soil-only comparison, hashes the actual row inputs, detects duplicate/misaligned row associations, preserves missing values, and distinguishes version-1 recorded outputs from version-2-shaped exploratory comparisons.

Still open: untouched-region evaluation, availability-lag replay, raw download provenance/revisions, independent agronomy review, and a precommitted objective/cost trade-off. Threshold tuning is not performed by this report.
