# Farmer-constraint screen and dryland treatment library preview (#38)

This optional item is deliberately a **partial implementation**, not closure of #38. The existing app enumerates three-year plans; the requested R3 is four years. It must not be truncated or assigned copied treatment yields to fit.

## Acceptance checklist

- [x] Pure engine-side farmer-constraint functions: crop exclusion, max corn years per displayed cycle, dryland applicability (unknown is not allowed), livestock/forage-market requirement and optional per-phase irrigation allowance checks. Invalid/unknown irrigation is not zero. No global reranking or scoring changed.
- [x] Read-only dashboard controls screen the existing returned alternatives and retain the current rotation with reasons even when excluded. Clearly says this is not a new exhaustive search; no passing displayed option does not mean no possible rotation exists.
- [x] Explicit distinct R4 dryland chemical-fallow, standing oat/triticale, hayed oat/triticale and grazed oat/triticale research treatments. Sourced K-State SARE LNC18-411, no-till dryland Brownell/Garden City 2018–2022; no limited-irrigation parameters borrowed.
- [x] R3 corn–wheat–sorghum–soybean retained as an exact-sequence research gap with null source/parameters, not an invented sourced study. Four-year cycle not silently reduced to three.
- [x] Water/forage trade-off and conditional later-wheat penalty described; oats/triticale not assigned legume N credits; no universal soil/profit benefit. Standing versus hayed versus grazed residue removal remains distinct and unparameterized.
- [x] Annualization helper divides whole-phase net totals by actual phase durations, including fallow. Any unavailable phase net or invalid duration makes result null. No unknown phases silently dropped.
- [ ] Full treatment-matched planting/harvest calendars, actual phase durations, phase irrigation, yields, cover/residue, forage and nitrogen parameters still need extraction/review. Library entries are deliberately not scored. No parameters transferred between studies or treatments.
- [ ] R3 exact sequence primary evidence and treatment data still unverified. The issue's limited-irrigation PDF URL returned non-PDF content locally, not usable trial evidence.
- [ ] Constraints are a preview over supplied top alternatives, not integrated into full enumeration, plan API/cache-key or persisted farmer settings. No user commitment/monitoring mutation.
- [ ] Per-phase irrigation controls are available at the pure function seam but not surfaced in this preview UI. Existing planner water mode remains unchanged.
- [ ] Ranked diverse-library cards, treatment-consistent annualized profit and independent agronomist review remain unavailable.
- [ ] Post-deploy UI/accessibility and full source-parameter audit pending.

## Source / provenance

K-State project *Cover Crop Management Options to Improve Weed Control, Crop Yield and Soil Health*, SARE LNC18-411 final report: https://projects.sare.org/project-reports/lnc18-411 (accessed 2026-11-15; terminal retrieval and primary-page extraction checked). Research section describes no-till winter wheat–grain sorghum–fallow; spring oat/triticale cover treatments compared with chemical fallow. Results: spring covers reduced winter-wheat yields 25–31% in two of five years at Brownell, while five-year means were not significantly different. This is a study-specific contrast, not a yield-reduction factor applied to a field. Final report has site/year/method differences and different summaries; no blanket benefit inferred.

The grazing/haying options require farmer-confirmed livestock access or forage market. Fallow is no-forage; standing CC is not automatically grazing/hay. Market need for alfalfa in the existing returned plans is a farmer screen, not a claimed source-derived yield/profit change.

`https://www.k-state.edu/irrigate/oow/p12/Schlegel12LIC.pdf` was attempted in terminal but could not be parsed as PDF; it is not cited as verification of R3 or transferred into R4.

## Relationship to feat/plan-constraints

This is a local read-only preview over the already-returned top three, not an in-search constraint implementation. It is expected to be superseded by `feat/plan-constraints`; the sourced dryland treatment library and whole-phase annualization helper remain independently useful. No plan API/cache keys, persisted settings, scores or Field Watch rules are changed.

For cover treatments the crop screen includes oats and the remaining fallow interval; that applicability crop list is not a phase calendar or a four-year rotation. Actual phase durations remain unknown.

## Verification

Pure Vitest coverage includes crop exclusion/corn limits, unchanged input rankings, excluded current rotation retention, dryland/forage toggles, unknown/over-limit/zero per-phase irrigation, oat exclusion across the three cover treatments, Spanish dynamic evidence copy and complete-cycle annualization with invalid/missing phase rejection. The App change is only one import plus one mount in the first canonical evidence block; all incoming `next` content is retained.

Local manual check (2026-11-15, port 8795): selected Kansas / Finney County, ran a rain-only plan, toggled every checkbox both ways and set maximum corn years to zero. Excluding all seven crop choices retained the current Corn → Soybean → Corn rotation with crop and corn-cap reasons, and showed no supplied alternatives passing. The ranked plan stayed Fallow → Winter wheat → Grain sorghum, with no new plan request from preview toggles. Field Watch is mounted only on the field-selection step; its `/api/fieldwatch/latest` response was identical before/after toggles (no local runs; no watch result invented). English and Spanish previews were inspected at 375 px; the card had no horizontal overflow. Switching language regenerates the main plan and resets the local-only preview, as changing plans does.

Screenshots are retained locally in the active profile scratch `pr70-evidence/`: `desktop-excluded.png`, `phone-en.png`, `phone-es.png`. Typecheck, tests and build results plus the merged `origin/next` SHA are recorded in PR #70. No deployment was performed; deployed UI/accessibility and treatment-parameter/agronomist audits remain outside this preview.
