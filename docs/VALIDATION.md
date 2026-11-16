# How well does SoilSense match real harvests?

SoilSense replays every past year (1991–2025) of NASA weather on a field's soil and estimates how each crop would have done. We check those estimates against what farmers really harvested, as recorded by USDA NASS.

**What we compare:** good and bad years. Real yields rise steadily over decades with better seed and machinery, so we compare each year's yield with that long-term trend ("15% below normal") against the model's estimate for the same year. The match score is the Pearson correlation: 1.00 is perfect, 0 is no relationship.

## 1. Out-of-sample test: 13 counties the model was never tuned on

Run on 2026-11-14 with the model frozen: nothing was changed after seeing these results. The counties, crops and method were fixed before the run. Rerun with:

```
LIVE_OOS=1 npx vitest run test/out-of-sample.test.ts
```

Full results: [`validation/out-of-sample.json`](validation/out-of-sample.json).

| | Result |
|---|---|
| County–crop cases | **43** (13 counties, 4 crops, 12–35 years each) |
| Average match score | **0.41** |
| Cases where the model moves in the right direction (score above 0) | **42 of 43** |
| Cases where the model beats a "season rainfall only" rule | **33 of 43** (average score 0.41 vs 0.21) |
| Of each county's 5 worst real years, how many the model also called below normal | **3.4 of 5** on average |

| Region | Cases | Average match |
|---|---|---|
| Central Plains (Saline, Sumner KS) | 8 | **0.53** |
| Lower Midwest (Saline MO) | 3 | **0.54** |
| High Plains, dry (Perkins NE, Kit Carson CO, Thomas KS) | 11 | **0.47** |
| Southern Plains (Garfield OK) | 4 | 0.43 |
| Corn Belt (Sioux IA, McLean IL, Tippecanoe IN, Blue Earth MN) | 10 | 0.30 |
| Northern Plains (Sully SD) | 4 | 0.30 |
| Eastern Corn Belt (Wood OH) | 3 | 0.23 |

| Crop | Cases | Average match |
|---|---|---|
| Corn | 13 | 0.48 |
| Soybean | 12 | 0.44 |
| Grain sorghum | 7 | 0.40 |
| Winter wheat | 11 | 0.30 |

**What this means.** On counties it never saw, the model still calls good and bad years better than chance almost everywhere. It beats the obvious shortcut ("more rain, more crop") in three cases out of four. It is strongest where water limits harvests (the Plains and the lower Midwest) and weaker in the wet eastern Corn Belt, where floods, wind, hail and disease matter more. In those years we use USDA crop-insurance records to show the real cause.

## 2. In-sample check: the two counties used to build the model

Story County, Iowa and Finney County, Kansas were used while choosing model settings, so these numbers are optimistic. They are the permanent regression test, run on every `npm test` with saved data: `test/accuracy.test.ts`.

| | Match |
|---|---|
| Finney Co. KS wheat, rain-fed (21 years) | 0.72 |
| Finney Co. KS sorghum, rain-fed (17 years) | 0.65 |
| Story Co. IA corn (35 years) | 0.49 |
| Story Co. IA soybean (35 years) | 0.51 |

The drop from about 0.60 here to 0.41 on new counties is the honest cost of testing on unseen data. Report the out-of-sample number.

## 3. Water use measured from space (OpenET)

On a center-pivot field in Finney County, KS (2016–2024), our modelled crop water use averaged within 6% of OpenET's satellite measurement. The year-to-year match was 0.88.

## Known limits
- The comparison is with **county** averages; one field can differ from its county.
- USDA stopped publishing separate rain-fed yields around 2010 in most counties, so many recent checks use "all fields", which include irrigated fields.
- Winter wheat is the weakest crop (freeze, disease and grain prices drive its yields as much as water).
- No agronomist or farmer review yet.

## Field Watch rule backtest (separate exploratory analysis)

The [Kansas Field Watch backtest report](validation/KANSAS-BACKTEST.md) recalculates recorded candidate alerts against regional USDM context and annual district yield anomalies. It is not the crop-yield validation above and does not establish live accuracy, optimal thresholds, field-level stress or professional agronomy approval. Reproduction commands, input hashes, reviewer critiques and the remaining #53 acceptance gaps are included.
