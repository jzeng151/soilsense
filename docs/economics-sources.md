# Economic source audit (#23)

## What is and is not used

The app now annotates every fallback price, crop base yield, regional potential and base direct cost via `assumptionAudit(state)`. A number without a defensible original source stays **approximate default**, with `sourceUrl`, `year`, `published`, `retrievedAt` and attribution explicitly null. No extension homepage is used as a false citation for a prototype constant. Unknown states visibly use the existing Iowa fallback. The model's 1.2 average-to-potential multiplier is explicitly a demonstration assumption; the misleading old 1.1/85–90% comment was removed, without changing the constant.

Rankings and numerical model inputs are unchanged. The separate K-State reference illustration does NOT feed ranked plans, NASS calibration, bad-year weather replay or hypothetical rotation yields. It cannot make a national field budget from Northeast Kansas dryland assumptions. No before/after rank change is expected: only comments in crops.ts/regions.ts changed, and no calculation path in plan.ts/rotation.ts changed.

## Transcribed primary sources

Retrieved **2026-11-15** with terminal `curl -fL` (HTTP success), then read as PDF text. No authentication was needed. PDFs are not redistributed; hashes identify the exact retrieved editions, because publisher URLs can change. Values below are cited budget assumptions, NOT measured crop yields or actual returns.

### Kansas State University, 2025 planning budgets

Published **2024-11-20**. Authors: Gregg Ibendahl, Daniel O'Brien, Sarah Lancaster and Stewart Duncan, Department of Agricultural Economics. Geography: **Northeast Kansas**. Treatment: **non-irrigated, middle planning yield**. Native support: regional enterprise budget, not a point/field observation. Observed dates: not applicable; these are dated planning assumptions.

- Corn: https://agmanager.info/sites/default/files/wysiwyg/Corn%20Cost-Return%20Budget%20in%20Northeast%20Kansas__Nov-20-2024.pdf
  - Page 2, middle-yield Budget abstract: **145 bu/acre**, **$4.21/bu**, **$449.20/acre total direct expenses**; printed income **$610.45/acre**; printed return above direct expenses **$161.25/acre**.
  - SHA-256: `a4c6b582b14e69675189675336fe284fbeadd1801a16c78a66a80ca1d749d839`.
- Soybean: https://agmanager.info/sites/default/files/wysiwyg/Soybean%20Cost-Return%20Budget%20in%20Northeast%20Kansas__Nov-20-2024.pdf
  - Page 2, middle-yield Budget abstract: **55 bu/acre**, **$9.67/bu**, **$272.28/acre total direct expenses**; printed income **$531.85/acre**; printed return above direct expenses **$259.57/acre**.
  - SHA-256: `33ec58d4cf8e96ee225ec7fba1a0e33446c224c00c2fdb596d48ec83312d1de3`.

Both use the same region, planning vintage, irrigation treatment and direct-cost definition. These are two enterprise budgets, **not evidence of a corn–soybean rotation trial**. The UI combines them only as a transparent two-phase scenario. It assumes no extra rotation benefit, cover-crop credit, forage value or pest saving. Direct expenses already include nitrogen/fertilizer, seed, fuel, labor, chemicals, insurance, repairs and operating interest: **do not add engine nitrogen or pumping costs again**. Cash rent and capital recovery remain excluded; this is not complete profit.

Independent recalculation (also tested): corn `145 × 4.21 − 449.20 = 161.25`; soybean `55 × 9.67 − 272.28 = 259.57`; two-phase calendar-year mean `(161.25 + 259.57) / 2 = 210.41 $/acre/year`. The module includes each phase in the denominator; an unsupported crop or missing price makes the mean unknown rather than silently dropping a phase. UI price/cost/yield sensitivity sliders are labelled **demonstration scenarios**, not new observations or revised source budgets. A 10% price cut gives **$153.295/acre/year** before display rounding.

Budget caveats from the official index: https://agmanager.info/farm-budgets/historical-farm-budget-projections/2025-historical-budget-projections-non-irrigated — planning yields are best-case assumptions, prices are estimates, not actual historical returns.

### Iowa State University, January 2026 comparison only

Chad Hart, Ag Decision Maker **File A1-20 / FM 1712**, revised January 2026: https://extension.iastate.edu/agdm/crops/pdf/a1-20.pdf

- Page 3, corn following soybeans middle column: **211 bu/acre**, **$483.60/acre variable cost**, including **159 lb N/acre × $0.53/lb N = $84.27/acre**.
- Page 5, herbicide-tolerant soybeans following corn middle column: **61 bu/acre**, **$290.21/acre variable cost**.
- Page 10, established alfalfa/alfalfa-grass, 4-ton, large-round-bale scenario: **4 short tons/acre**, **$242.56/acre variable cost**.
- SHA-256: `d522d8e90f0c22ac3cc2c587c78d808e20263c87f2c47be6a8dd3b7788d0c195`.

These are **Iowa regional budget trend yields**, not observed Iowa state averages or water-unlimited field potential. The source's variable-cost definition differs from both the engine's nitrogen-excluded base costs and K-State's total direct expenses; none is silently substituted for another. Those distinctions are why this PR annotates rather than changes rankings.

## Remaining scope and live checks

- The engine's costs/yield potentials/rotation effects still need reviewed local, treatment-compatible replacements. This PR does not pretend otherwise.
- Existing optional NASS county/district yield calibration and NASS monthly prices are unchanged. They are regional data, not field yields. Suppressed/missing observations must stay absent. No new authenticated live NASS verification is claimed.
- No AMS market report ingestion, market/grade metadata or freshness feed yet. The reference uses dated budget prices only, never calls them current prices.
- No full multi-state economic budget library or treatment-consistent trial replacement.
- After deploy, visually check the evidence block at 375 px, keyboard/screen-reader slider labels, outbound source URLs and `/api/economics-assumptions?state=KS`. No migration, secrets or deployment is required to serve the static sourced audit.
