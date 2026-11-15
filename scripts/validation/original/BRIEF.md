# Second opinion wanted: how to choose a dry-spell alert rule objectively

## Context
SoilSense is a NASA Space Apps 2026 hackathon app (submission due Sun 2026-11-15 23:59 local; ~1 day left).
"Field Watch" checks a farm field and tells the farmer whether a dry spell is under way. It must be
deterministic, explainable to a farmer with no stats background, never treat missing data as zero, and
work as a "historical replay" (e.g. re-run June 2022) as well as live. The project issue (#4) asks for
"one configured rainfall rule ... e.g. unusually low 14-day rainfall relative to matching historical
windows; the threshold must be labelled a demonstration setting unless independently justified".

The user (a developer, no ML/stats background) asks: **with so many variables that could influence
the result, how do we determine an approach that is correct or close to correct, objectively?**
We want an independent judgment, not agreement with the analysis below. Disagree where warranted.

## Data (all real, NASA POWER daily, MERRA-2 based, ~0.5 x 0.625 deg grid)
- 9 Kansas district points, 1991-2025: rain (PRECTOTCORR mm/day), Tmax/Tmin, root-zone soil wetness
  (GWETROOT, 0-1, a land-surface MODEL output, not a measurement). Files: `power/*.json`.
- Truth candidates:
  - U.S. Drought Monitor (USDM) weekly % of each district in D1+ drought, 2015-2025
    (`usdm_district_weekly.csv`). Expert-blended product; authors look at precipitation percentiles
    and modelled soil moisture among other inputs (partial circularity).
  - USDA NASS district yield % anomalies, corn/sorghum/soybeans/wheat 2016-2025
    (`yield_validation.csv`, ~80-90 district-years per crop). Independent of USDM.

## Candidate rules (all compare against the same 14 calendar days in past years)
- A  "mine": 14-day rain < 50% of the 1991-2020 mean (checked year excluded). Triggered / not.
- B  A but by rank: rain in the driest 20% of 1991-2020 years.
- C  "Tunk's" production rule (origin/main src/worker/fieldwatch/rule.ts, snapshot in `mainsnap/`):
     rain percentile vs 1991..last-year; root-zone 7-day mean percentile; water balance (rain - FAO-56
     Hargreaves ET0). Dry = rain pct <= 20 AND (root pct <= 30, or if root missing, balance <= -15 mm).
     Watch = rain pct <= 33 OR root pct <= 25 (OR Kansas outlook, excluded from the backtest).
- D  C's watch-or-dry. E  C's rain test alone (<= 20th pct).
- Proposed: Dry = rain pct <= 33 AND root pct <= 25; Watch = either; fixed 1991-2020; balance and the
  Kansas outlook shown as context only; if soil missing, low rain caps at Watch.

## Backtest (scripts: `run.test.ts` -> `rows.json`; `analyze.py`; `fixes.test.ts` -> `fixrows.json`; `fixes.py`)
5,166 district-weeks; window = 14 days ending the day before each USDM map date. Truth "in drought" =
D1+ >= 50% of district. Bootstrap CIs resample whole district-years. Growing season = Apr-Sep.

Growing season vs USDM in-drought (26% of weeks):
| rule | fires | hit | false alarm | precision |
| A | 27% | 38% [33-42] | 23% | 37% |
| B | 21% | 29% [25-33] | 18% | 37% |
| E | 21% | 28% | 18% | 36% |
| C dry | 13% | 26% [22-31] | 8% [6-10] | 55% |
| D watch/dry | 41% | 62% | 33% | 40% |
| Proposed dry (33/25) | 17% | 39% [33-44] | 9% [7-11] | 61% |

Spearman, summer (Jun-Aug) alert-week count vs yield anomaly (corn/sorghum/soy): A -0.23/-0.36/-0.48,
B -0.21/-0.33/-0.43, C -0.40/-0.57/-0.58, D -0.44/-0.44/-0.60, proposed -0.48/-0.63/-0.55.
Also: balance <= -15 mm holds in 67% of growing-season weeks, so C's fallback == rain-only.
Fixed 1991-2020 vs moving baseline: no measurable difference.
Cut-off grid (rain {10..33} x soil {15..50}) chosen on 2015-2020, checked on 2021-2025: rain<=33 beat
rain<=20 in both halves; soil<=25 chosen partly for simplicity after seeing all data (mild tuning).

## Known weaknesses (add more)
- Only 9 points, Kansas only, 11 years; drought years heavily autocorrelated; 2021-2025 has 38% drought weeks vs 17% in 2015-2020.
- USDM measures longer-term drought; a 14-day alert is a short-term signal - is it even the right truth?
- GWETROOT is modelled; USDM uses similar models -> soil rules may look good partly by shared inputs.
- Many comparisons / researcher degrees of freedom (truth definition, season, cut-offs, metrics).
- Yields check is small and annual.

## Questions
1. Give your own recommendation for an OBJECTIVE (or as-objective-as-practical) method to choose the rule, given the 1-day deadline and the data above. What must be decided BEFORE looking at results?
2. Critique the backtest: leakage, truth choice, metrics, statistics, overfitting. Is any conclusion above unsupported?
3. Concretely, what should the team ship tomorrow, and what should they claim (and not claim) about it?
4. Your confidence, and the single most useful extra check if there's time.
You may read/run the scripts (python; `npx vitest run --root <this dir> --dir <this dir> <file>` from C:/Users/steve/Projects/soilsense). Do not modify files in C:/Users/steve/Projects/soilsense. Keep the answer under ~600 words, plain language.
