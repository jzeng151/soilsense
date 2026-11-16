# Accessibility — SoilSense web app

## WCAG 2.2 AA audit (15 November 2026, PR #120)

**What this audit claims:** SoilSense was *tested against WCAG 2.2 Level AA* with automated axe-core checks plus scripted manual checks: keyboard, focus, target size, reflow, text spacing, motion and non-text contrast. This is **not** a certification or a full conformance audit. Screen-reader testing with real assistive-technology users is still outstanding.

**ADA / Section 508:** the ADA sets no technical standard of its own for private websites. DOJ's 2024 Title II rule uses WCAG 2.1 AA, and Section 508 (federal ICT) incorporates WCAG 2.0 AA. WCAG 2.2 AA includes those success criteria (except the removed 4.1.1). Even so, these test results do not establish legal compliance.

### Scope and method
- **Server.** Built Vite assets served by the local Worker (`wrangler dev -c wrangler.offline.jsonc --var FIELDS_ENABLED:on`, 127.0.0.1:8819). Nothing was written to any deployed site.
- **Automated scan.** `scripts/a11y-wcag22.mjs` runs axe-core 4.14.0 in Chromium 159.0.8154.6, using SwiftShader WebGL so MapLibre renders. Tags: `wcag2a wcag2aa wcag21a wcag21aa wcag22aa`. Reduced motion is on.
- **States scanned:**
  - Explore: globe; map after ZIP 67846; assistant open; layers menu open.
  - `#/demo`.
  - Planner questions with the constraints panel expanded.
  - The Finney (Kansas example) plan with **every** `details` open, including the fertilizer guide.
  - how-it-works, sources, live, scout, sign-in, and settings (signed out).
- **Viewports and languages.** 1440 and 390 px, in EN and ES. KO is spot-checked at 1440 px (globe, map, assistant, demo, how-it-works). 57 scans per capture.
- **Resolving axe "incomplete" contrast.** These color-contrast nodes stay recorded as incomplete **and** are resolved separately:
  - The element's text is made transparent and its content box is screenshotted.
  - The text color is compared with every third background pixel.
  - The verdict uses the 5th-percentile background: worst case, with no credit for text-shadow.
  - Up to 40 nodes per scan are resolved. Results are under `contrastResolved` in the JSON.
- **Manual-style checks.** `scripts/a11y-wcag22-manual.mjs` covers: the keyboard-only Explore flow; focus-indicator and focus-obscured sampling; 24×24 targets and overlap; 320 px reflow (equivalent to 400% zoom at 1280 px); WCAG 1.4.12 text spacing; a globe-motion pixel diff with and without reduced motion; the pause control; the map text alternative; `lang` switching; and the ZIP form error.
- **Before and after builds.** Before = `origin/next` 62ba35c web build. After = this branch at eb13af5. Both runs use the same scanner, Worker and data.
- **Evidence files:** [`screenshots/a11y/before.json`](screenshots/a11y/before.json), [`after.json`](screenshots/a11y/after.json), [`manual-before.json`](screenshots/a11y/manual-before.json), [`manual-after.json`](screenshots/a11y/manual-after.json). JPEG screenshots are in `screenshots/a11y/before/` and `screenshots/a11y/after/`.

> **Explore caveat.** PR #126 (feat/explore-chrome) redesigns the Explore nav rail, overlays and assistant panel, starting from d74a79f. The Explore rows below measure *this* branch's Explore UI. Re-run both scripts once #126 merges.

### axe results per state

Each cell reads: rules/nodes · axe contrast-incomplete nodes · resolved contrast fails/nodes resolved · visible h1 count.

| State | Width | Lang | Before: rules/nodes · contrast-incomplete · resolved fails · h1 | After: rules/nodes · contrast-incomplete · resolved fails · h1 |
|---|---:|---|---|---|
| explore-globe | 1440 | EN | 0/0 · 11 · 0/11 · 1 | 0/0 · 11 · 0/11 · 1 |
| explore-globe | 1440 | ES | 0/0 · 11 · 0/11 · 1 | 0/0 · 11 · 0/11 · 1 |
| explore-globe | 1440 | KO | 0/0 · 11 · 0/11 · 1 | 0/0 · 11 · 0/11 · 1 |
| explore-globe | 390 | EN | 0/0 · 13 · 2/13 · 1 | 0/0 · 11 · 0/11 · 1 |
| explore-globe | 390 | ES | 0/0 · 13 · 2/13 · 1 | 0/0 · 11 · 0/11 · 1 |
| explore-map | 1440 | EN | 0/0 · 3 · 0/3 · 0 | 0/0 · 3 · 0/3 · 1 |
| explore-map | 1440 | ES | 0/0 · 3 · 0/3 · 0 | 0/0 · 3 · 0/3 · 1 |
| explore-map | 1440 | KO | 0/0 · 3 · 0/3 · 0 | 0/0 · 3 · 0/3 · 1 |
| explore-map | 390 | EN | 0/0 · 5 · 2/5 · 0 | 0/0 · 3 · 0/3 · 1 |
| explore-map | 390 | ES | 0/0 · 5 · 2/5 · 0 | 0/0 · 3 · 0/3 · 1 |
| explore-assistant | 1440 | EN | 0/0 · 3 · 0/3 · 0 | 0/0 · 3 · 0/3 · 1 |
| explore-assistant | 1440 | ES | 0/0 · 3 · 0/3 · 0 | 0/0 · 3 · 0/3 · 1 |
| explore-assistant | 1440 | KO | 0/0 · 3 · 0/3 · 0 | 0/0 · 3 · 0/3 · 1 |
| explore-assistant | 390 | EN | 0/0 · 5 · 2/5 · 0 | 0/0 · 3 · 0/3 · 1 |
| explore-assistant | 390 | ES | 0/0 · 5 · 2/5 · 0 | 0/0 · 3 · 0/3 · 1 |
| explore-layers | 1440 | EN | 0/0 · 3 · 0/3 · 0 | 0/0 · 3 · 0/3 · 1 |
| explore-layers | 1440 | ES | 0/0 · 3 · 0/3 · 0 | 0/0 · 3 · 0/3 · 1 |
| explore-layers | 390 | EN | 0/0 · 5 · 3/5 · 0 | 1/1 · 3 · 1/3 · 1 |
| explore-layers | 390 | ES | 0/0 · 5 · 4/5 · 0 | 1/1 · 3 · 2/3 · 1 |
| demo | 1440 | EN | 0/0 · 0 · 0/0 · 1 | 0/0 · 0 · 0/0 · 1 |
| demo | 1440 | ES | 0/0 · 0 · 0/0 · 1 | 0/0 · 0 · 0/0 · 1 |
| demo | 1440 | KO | 0/0 · 0 · 0/0 · 1 | 0/0 · 0 · 0/0 · 1 |
| demo | 390 | EN | 0/0 · 0 · 0/0 · 1 | 0/0 · 0 · 0/0 · 1 |
| demo | 390 | ES | 0/0 · 0 · 0/0 · 1 | 0/0 · 0 · 0/0 · 1 |
| planner-questions | 1440 | EN | 0/0 · 2 · 1/2 · 1 | 0/0 · 2 · 1/2 · 1 |
| planner-questions | 1440 | ES | 0/0 · 1 · 1/1 · 1 | 0/0 · 1 · 1/1 · 1 |
| planner-questions | 390 | EN | 0/0 · 2 · 1/2 · 1 | 0/0 · 2 · 1/2 · 1 |
| planner-questions | 390 | ES | 0/0 · 1 · 1/1 · 1 | 0/0 · 1 · 1/1 · 1 |
| planner-plan | 1440 | EN | 0/0 · 71 · 2/40 · 1 | 0/0 · 76 · 2/40 · 1 |
| planner-plan | 1440 | ES | 0/0 · 75 · 2/40 · 1 | 0/0 · 75 · 2/40 · 1 |
| planner-plan | 390 | EN | 0/0 · 168 · 2/40 · 1 | 0/0 · 180 · 2/40 · 1 |
| planner-plan | 390 | ES | 0/0 · 165 · 2/40 · 1 | 0/0 · 172 · 2/40 · 1 |
| how-it-works | 1440 | EN | 0/0 · 25 · 0/25 · 1 | 0/0 · 25 · 0/25 · 1 |
| how-it-works | 1440 | ES | 0/0 · 25 · 0/25 · 1 | 0/0 · 25 · 0/25 · 1 |
| how-it-works | 1440 | KO | 0/0 · 25 · 0/25 · 1 | 0/0 · 25 · 0/25 · 1 |
| how-it-works | 390 | EN | 0/0 · 25 · 0/25 · 1 | 0/0 · 25 · 0/25 · 1 |
| how-it-works | 390 | ES | 0/0 · 25 · 0/25 · 1 | 0/0 · 25 · 0/25 · 1 |
| sources | 1440 | EN | 0/0 · 0 · 0/0 · 1 | 0/0 · 0 · 0/0 · 1 |
| sources | 1440 | ES | 0/0 · 0 · 0/0 · 1 | 0/0 · 0 · 0/0 · 1 |
| sources | 390 | EN | 0/0 · 0 · 0/0 · 1 | 0/0 · 0 · 0/0 · 1 |
| sources | 390 | ES | 0/0 · 0 · 0/0 · 1 | 0/0 · 0 · 0/0 · 1 |
| live | 1440 | EN | 0/0 · 0 · 0/0 · 1 | 0/0 · 0 · 0/0 · 1 |
| live | 1440 | ES | 0/0 · 0 · 0/0 · 1 | 0/0 · 0 · 0/0 · 1 |
| live | 390 | EN | 0/0 · 0 · 0/0 · 1 | 0/0 · 0 · 0/0 · 1 |
| live | 390 | ES | 0/0 · 0 · 0/0 · 1 | 0/0 · 0 · 0/0 · 1 |
| scout | 1440 | EN | 0/0 · 0 · 0/0 · 1 | 0/0 · 0 · 0/0 · 1 |
| scout | 1440 | ES | 0/0 · 0 · 0/0 · 1 | 0/0 · 0 · 0/0 · 1 |
| scout | 390 | EN | 0/0 · 0 · 0/0 · 1 | 0/0 · 0 · 0/0 · 1 |
| scout | 390 | ES | 0/0 · 0 · 0/0 · 1 | 0/0 · 0 · 0/0 · 1 |
| signin | 1440 | EN | 0/0 · 0 · 0/0 · 1 | 0/0 · 0 · 0/0 · 1 |
| signin | 1440 | ES | 0/0 · 0 · 0/0 · 1 | 0/0 · 0 · 0/0 · 1 |
| signin | 390 | EN | 0/0 · 0 · 0/0 · 0 | 0/0 · 0 · 0/0 · 1 |
| signin | 390 | ES | 0/0 · 0 · 0/0 · 0 | 0/0 · 0 · 0/0 · 1 |
| settings | 1440 | EN | 0/0 · 0 · 0/0 · 1 | 0/0 · 0 · 0/0 · 1 |
| settings | 1440 | ES | 0/0 · 0 · 0/0 · 1 | 0/0 · 0 · 0/0 · 1 |
| settings | 390 | EN | 0/0 · 0 · 0/0 · 0 | 0/0 · 0 · 0/0 · 1 |
| settings | 390 | ES | 0/0 · 0 · 0/0 · 0 | 0/0 · 0 · 0/0 · 1 |
| **Totals (57 / 57 scans)** | | | **0/0 · 723 · 31** | **2/2 · 731 · 15** |

**Reading the totals:**
- **New violation.** Only one selected-tag axe violation appears in either capture: a new `target-size` (2.5.8) instance at 390 px with the layers menu open (EN and ES). The 18×18 imagery radio sits too close to the zoom buttons because the open menu overlaps the right-hand map controls. That file is now owned by PR #126. A suggested fix (move layers to the bottom-left on phones, plus Escape-to-close) was handed over.
- **Resolved contrast failures fell from 31 to 15.**
- **Fixed:**
  - Cream intro heading over white cloud tops at 390 px (p05 1.07:1).
  - Map scale bar (1.47–2.48:1) and attribution (2.58:1), which were partly covered by the floating assistant button at 390 px.
- **Remaining, explained:**
  - 14 are planner step dots (`.jr-dot ✓`). The pixel sampler picks up the page color in the corners of the round badge. The real pair is white on `--green`, computed at **5.28:1 before and 5.87:1 after**.
  - The 15th is the layers-menu overlap described above.

### "The green blends in": token changes (computed WCAG ratios)

| Pair | Before | After | Need |
|---|---:|---:|---:|
| Green links/selected text `--color-primary` on cream `#fbf6ea` | `#2f7a3e` 4.9 | `#2c723a` 5.45 | 4.5 |
| `--color-primary` on white surface | `#2f7a3e` 5.28 | `#2c723a` 5.87 | 4.5 |
| `--color-primary` on subtle `#f4ecda` | `#2f7a3e` 4.49 ❌ | `#2c723a` 4.99 | 4.5 |
| `--color-primary`/`--color-success` on leaf-wash `#e6f2e0` (AI badge, status chips) | `#2f7a3e` 4.56 | `#2c723a` 5.07 | 4.5 |
| Canopy panel muted text on Canopy `#1f5a3a` | `#b9d3b6` 5.06 | `#dae8d9` 6.4 | 4.5 |
| Canopy muted text / placeholder on subtle `#2a6b47` (composer, buttons) | `#b9d3b6` 3.97 ❌ | `#dae8d9` 5.02 | 4.5 |
| Canopy faint text on subtle `#2a6b47` | `#b3d0af` 3.81 ❌ | `#d4e4d2` 4.81 | 4.5 |
| Canopy gold links `--color-primary` on Canopy | `#ffc857` 5.29 | `#ffd47a` 5.79 | 4.5 |
| Canopy gold links on subtle `#2a6b47` | `#ffc857` 4.15 ❌ | `#ffd47a` 4.54 | 4.5 |
| Canopy panel/card edge `--color-border-strong` vs Canopy (1.4.11) | `#4c8a66` 1.99 ❌ | `#7bb794` 3.5 | 3.0 |

**Other green and imagery changes:**
- **Floating Explore controls over imagery** now have a 2 px light border (`#b3d0af`) inside a 1 px dark ring (`rgba(10,30,18,.9)`). The light border is 7.9–10:1 against the ring, so the control outline stays visible on any imagery. Sampled border-vs-imagery p05, 4–6 px outside the box:
  - Before: location-chip 1.44, map-controls 1.17, layers > button 1, assistant-toggle 1.19, location-chip 1.66, map-controls 1.54, layers > button 2.28, assistant-toggle 1.81.
  - After: location-chip 1.44, map-controls 1.17, layers > button 1.7, assistant-toggle 1.16, location-chip 1.67, map-controls 1.56, layers > button 2.28, assistant-toggle 1.76.
  - Those sampled numbers barely move because the sample band falls in the drop shadow. Treat 1.4.11 over imagery as *mitigated, needs human review*. The PR #126 redesign supersedes this styling.
- **Explore intro** gets an 85% Canopy scrim: cream text on it is 5.1:1 even over pure white.
- **Map pin** gets a white and dark halo.
- **Unchanged and already passing:** white on the Sprout CTA (5.28), cream on Canopy (7.54), and the light-gold/white focus rings.
- **Logo:** `--color-brand-arc-2` (#4fa84a) is used only in the logo arcs, which are exempt as a logotype.

### Manual checks (after)
| Check | Result |
|---|---|
| Keyboard flow (1440 + 390): Tab to ZIP, Enter submits, Enter opens layers menu, Tab into options, assistant toggle opens, close by keyboard | Pass |
| Escape closes the layers menu | No. Suggested fix handed to #126 |
| Assistant send by keyboard | **Not exercised.** The local Worker has no AI model, so the composer is correctly disabled with a visible notice. Needs a check on an AI-enabled environment. |
| 2.4.7 / 2.4.11 focus visible and not obscured | Every recorded focus stop had an outline of at least 2 px or a ring. None was fully covered (see `keyboard-explore-*`). |
| 2.5.8 targets | No interactive element under 24 px in the Explore map + assistant state. Attribution toggle: before, it was 44 px tall with the info icon tiled twice; after, one 24×24 icon. At 390 px the attribution overlapped the assistant button before and no longer does, because it starts collapsed. |
| 1.4.10 reflow at 320 px | No page-level horizontal scroll on 8 routes, before or after |
| 1.4.12 text spacing | Before: `#/sources` overflowed at 320 px (badge). After: no overflow on any of the 8 routes. |
| 2.2.2 / 2.3.3 motion | With reduced motion: 0% of pixels changed over 6 s. Without: 17.5% changed, and 0% after "Stop globe rotation" is pressed. |
| Map text alternative | The canvas is a labelled region. The ZIP form, Sprout and plan facts provide equivalent non-visual access, so the imagery is treated as decorative-with-equivalent. |
| Headings / landmarks | One h1 on every scanned state after this PR. Before: none on the Explore map/assistant states (now a visually hidden h1); none on sign-in/settings at 390 px, where the brand h1 was hidden (the form title is now the h1); and Scout had no `main` landmark (added). |
| `lang` switching | Planner header offers EN/ES/KO, and the sidebar copy is hidden there so each view has one switcher. The Explore rail cycles en→es→ko; before, it was en↔es only and Korean was unreachable. |
| Chat live region | The assistant thread is `role=log` with `aria-live=polite`, and status is `role=status`. |
| Form errors (ZIP "123") | Only the browser's native pattern bubble appears ("Please match the requested format."), with no `aria-invalid` and no persistent text error. **Open issue** (Explore, PR #126 scope). |

### Known gaps and work needing a human
- Screen-reader passes (NVDA + Firefox, VoiceOver on iOS, TalkBack) over Explore, the assistant's streamed answers, and the planner plan.
- Keyboard send/stop in the assistant on an AI-enabled environment.
- ZIP form error identification (3.3.1/3.3.3) and Escape on the layers menu.
- Re-run both scripts after PR #126. Translucent panels will produce axe `incomplete` results, which need the pixel resolution in this script.
- axe `label-content-name-mismatch` incompletes remain on symbol-only buttons (+, −, ⌖, Ⅱ). Their names ("Zoom in" etc.) are reasonable, but voice-control users should spot-check them.
- Field imagery itself (crops, boundaries) is described only through plan facts.

---

## Earlier audit — integrated SoilSense build (WCAG 2.0/2.1)

## Status and public wording

> SoilSense's English and Spanish planning flow passed the selected axe-core WCAG 2.0/2.1 A and AA automated checks at desktop and phone widths in the recorded states. Keyboard smoke checks also passed in both languages. This is not a full WCAG conformance audit or certification; screen-reader user testing remains outstanding.

Do not turn zero automated violations into a claim of WCAG 2.1 AA conformance. Incomplete findings are not passes. The Spanish setting does not imply every evidence card or operator page has been translated.

## Integrated rescan: scope and provenance

- **15 November 2026**, Windows 11; axe-core **4.14.0**, Playwright **1.65.1**, Chromium **159.0.8154.6**. Exact UTC timestamps are in each JSON result.
- Production Vite assets served by the real local Cloudflare Worker using `wrangler.offline.jsonc` at `127.0.0.1:8783`; not a Vite development server or a fabricated planner response. No deployment or production writes.
- Selected tags: `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`; no excluded rules. WCAG 2.2 target-size rules are outside these tags.
- **EN + ES × 1280 × 900 and 375 × 900 CSS pixels × eight states = 32 scans** per capture. Reduced motion is enabled. The keyboard script additionally checks a default plan at **320 CSS pixels**.
- Before UI: `147d7563023656a60a3a13687cf2496a5ece5f61`, the integrated `origin/next` at task start (includes Spanish #85, goals #83, document fixes #84, MODIS #61 and K-State #82, plus #86).
- After UI: `8290061` (full source revision in the JSON). The baseline was rebuilt by temporarily restoring only the baseline's `web/src`, using the same expanded-state scanner, Worker and warmed local data, and restoring committed current sources before rebuilding the after UI. The expected failing baseline exited 1; the after audit exited 0.
- Real Kansas example: Finney County, 38.1095, -100.706, inferred current crop, full irrigation and balanced priority. Scan questions with no optional goals, then select **Water conservation + Organic matter**. Assert two selected / three disabled checkboxes; the resulting plan must include goal-score disclosures.
- Plan coverage: activate **Compare timing** and **Load field history**, wait for loading text to clear, then repeatedly expand all rendered/nested `details`. **51 disclosures, including five goal-score disclosures, were open** in each final plan scan. Inventories include headings, goals, vegetation text, harvest-table count, disclosure state, page language and overflow.
- MODIS returned real complete 2025 point/composite data: **23/23 strict-QA composites** in both captures. Expanded coverage includes its chart, exact-date/QA table and source links, SMAP, regional water/well records, K-State margin assumptions, wind/cover, historical timing/scenarios, alternate plans and evidence methods. Conditional county harvest tables did **not** render (recorded count zero); their availability is not fabricated.
- Field Watch: a manual **local-only** check populated four real farm rows, verified by reading `/api/fieldwatch/latest`. Dedicated scans expand all `.fw` disclosures and scope axe to `.fw`. The separate glossary outside that card remains closed in those scans; this is intentional.
- Admin entry: real public `/#/admin/docs`, with labeled token and upload inputs.
- Admin review: **explicitly synthetic local browser fixture**, not server authentication coverage. Playwright intercepts document GETs with one pending-review document and two constructed chunks, including the garbled-text warning. A non-secret placeholder enables list/detail/metadata/crop/exclusion/review controls. Non-GET document requests are aborted; no upload, approval or rejection is submitted. These four scans are labeled `admin-docs-review-fixture` in JSON. This does not validate authorization, ingestion, persistence or real document content.

## Before / after results

A rule instance is one failing rule in one scan; nodes are affected DOM elements under that rule. Repeated states/widths/languages count repeatedly, not as unique bugs or WCAG criteria. Every row below aggregates its four language/width combinations.

| State (four scans each) | Before rules / nodes | After rules / nodes | Before / after incomplete rules |
|---|---:|---:|---:|
| Landing | 4 / 8 | 0 / 0 | 12 / 12 |
| Field confirmation | 4 / 8 | 0 / 0 | 10 / 8 |
| Three questions, no optional goals | 4 / 8 | 0 / 0 | 4 / 4 |
| Two goals selected; remaining options disabled | 4 / 8 | 0 / 0 | 4 / 4 |
| Kansas plan, every rendered disclosure expanded | 4 / 8 | 0 / 0 | 4 / 4 |
| Field Watch, four farm rows expanded | 0 / 0 | 0 / 0 | 0 / 0 |
| Admin docs entry | 0 / 0 | 0 / 0 | 0 / 0 |
| Admin docs review, synthetic fixture | 0 / 0 | 0 / 0 | 0 / 0 |
| **32 scan-instance totals** | **20 / 40** | **0 / 0** | **34 / 32** |

The only newly failing rule type was **`label-content-name-mismatch` (WCAG 2.5.3)**. Both language buttons visibly said `EN` / `ES`, but their accessible names were `English` / `Español`, which did not contain the complete visible labels. The final names are **`EN English` / `ES Español`**, matching Tunk's concurrent fix exactly. This repaired 40 repeated affected-node instances, not 40 distinct bugs. No page-level horizontal overflow was recorded in any of the 32 before or after scans.

Evidence: [`a11y/integrated-before.json`](a11y/integrated-before.json), [`a11y/integrated-after.json`](a11y/integrated-after.json), [`a11y/keyboard.json`](a11y/keyboard.json). Full axe passes, violations and incomplete results are preserved, including selectors and HTML. Historical #86 evidence remains in [`a11y/before.json`](a11y/before.json) and [`a11y/after.json`](a11y/after.json): that earlier English-only 12-scan audit went from 6 rule / 30 node instances to zero, with 14 after incomplete instances. Its counts are not interchangeable with this expanded audit.

## Reconciliation with Tunk's main changes

Initial `git diff origin/next...origin/main` identified `cec685f` (17 files). Initial merge simulation conflicted in `package-lock.json`, `App.tsx`, `Shell.tsx`, `MapPicker.tsx` and `ScoutMessage.tsx`. Compatible main changes were adopted as ordinary next-based commits, **not a merge of main pushed into next**.

| Area | Overlap / reconciliation |
|---|---|
| `MapPicker.tsx` | Both #86 and main added keyboard center selection/help. Keep #86's named **region**, visible translated instructions, reduced-motion handling and Leaflet-owned cleanup; add main's **Space** activation and focus crosshair. Use one Leaflet key handler, not duplicate DOM listeners; do not restore `role=application`. Final implementation matches Tunk's integrated follow-up. |
| `styles.css`, `tokens.css`, `a11y.css` | Both strengthen visible focus, especially ZIP/map. Retain #86's 44px team targets, reduced motion, mobile drawer focus repair, reflow/hash wrapping and opacity/contrast fixes; also retain main's stronger faint/input-border tokens, broader form/composer focus rings, skip-link styling, crosshair and underlined attribution links. These are additive, not competing overrides. |
| `App.tsx` | Add main's always-mounted ZIP `role=status` while preserving Spanish translation of structured ZIP messages. Keep #86's planner focus transitions, native toggle groups and definition-button names. Adopt Tunk's follow-up `EN English` / `ES Español` fix verbatim. |
| `Shell.tsx` | Keep main's skip link and focusable `#content` **alongside** #86's admin-docs route and mobile navigation work; neither route nor focus fix is dropped. |
| `ScoutMessage.tsx` | Preserve next's reviewed-research citation display/import and main's passage-language tagging/import. This integration conflict is adjacent feature work, not an alternative to #86's planner fixes. |
| `HarvestCheck.tsx`, `TrendChart.tsx`, `evidence.css` | Main's additional harvest table and richer chart description are retained. They supplement #86 rather than replace it; conditional harvest tables were absent from this real field response. |
| Scout/live/settings language and live transcript changes | Retain main's `lang.ts`/`franc-min`, language-of-parts tagging, transcript log/status and corresponding Worker event language metadata; preserve next's research behavior. These routes were not exhaustively browser-audited here. |
| `package-lock.json` | Regenerate from the combined manifest, retaining both axe/Playwright and main's `franc-min` dependencies; no dependency is discarded to resolve the conflict. |
| Keyboard runner and screen-reader utility follow-ups | Retain Tunk's skip-link-first assertions and `0d60689`'s `.sr-only` positioned-ancestor scroll repair. Extend keyboard checks to ES without removing any of those assertions. |

During this task, Tunk integrated main into next (`e56b4ba`), fixed the same language names (`e734df7`), updated keyboard assertions (`bdc462b`), merged next to main (#88), and added `0d60689`. We matched those compatible follow-ups instead of leaving redundant alternative implementations. The PR branch was then rebased onto the updated `origin/next` at `bdc462b`, dropping the now-redundant initial reconciliation commit; its final tree was unchanged. The published delta adds the expanded audit, evidence/docs and main-only screen-reader scroll follow-up, not a duplicate merge of main into next.

**Actual scratch-branch test:** on `scratch/a11y-main-merge`, `git merge --no-commit --no-ff origin/main` at **`0d60689`** completed **conflict-free**, then was aborted; work returned to `fix/a11y-rescan`. No merge commit was pushed. This is a point-in-time result; later remote changes need a fresh check.

## Keyboard verification and remaining work

The rerunnable browser smoke checks passed for **EN/ES at both widths**: skip link is first and focuses `#content`; closed mobile navigation is not a hidden Tab stop; opening, reverse Tab, Escape and focus restoration work; Kansas and confirmation are reachable by Tab; Space selects a crop; Enter builds a plan and opens native disclosures; ArrowRight + Enter selects the map center. Enabled landing/confirmation buttons meet the team's 44 × 44 rule, and the default plan reflows at 320px. This is not exhaustive keyboard or screen-reader user testing.

- **32 incomplete rule instances remain** in after results, mainly contrast/interpretation over SVG, map and symbolic content. They remain available for manual review and are not suppressed or called passes.
- No NVDA, JAWS, VoiceOver, TalkBack or assistive-technology user testing. Reading order, announcement quality and language pronunciation still require manual assessment, including English evidence/operator content under the Spanish document setting.
- No full-WCAG review of all non-text contrast, chart equivalents, zoom/text spacing, cognitive usability, error/conditional states or every route.
- No real authenticated admin upload/review audit. Synthetic operator UI coverage is not a substitute. No county-harvest chart/table state rendered for this field.
- Automated data availability can change. The MODIS completeness and populated Field Watch results describe these captures, not future runs or field-area coverage.
- Validation: `npm test` **374 passed / 11 skipped** (52 test files passed / 3 skipped); `npm run typecheck` and `npm run build` passed. The existing large-JavaScript-chunk build warning remains. Skipped tests are not claimed as verified.

## Rerun locally

```sh
npm ci
npx playwright install chromium
npm run db:migrate:local
npm run build
npx wrangler dev -c wrangler.offline.jsonc --port 8783 --ip 127.0.0.1
```

In a second shell, optionally use the **local** Field Watch UI's Run check now button to populate the four farm rows, then:

```sh
A11Y_BASE_URL=http://127.0.0.1:8783 A11Y_OUTPUT=docs/a11y/integrated-after.json npm run a11y
```

The command scans all 32 combinations and runs both-language keyboard checks, saving `keyboard.json`. It exits nonzero for violations, missing scans, page-level overflow, missing expanded plan/goal states or keyboard assertion failures. Incomplete findings are reported but do not fail the automated gate. Planner/evidence responses are real; only the explicitly labeled admin review state uses local synthetic GET interception.

Optional variables: `A11Y_BASE_URL` (default `http://127.0.0.1:8790`), `A11Y_OUTPUT` (default `docs/a11y/latest.json`), `A11Y_SCREENSHOTS`, `A11Y_REVISION` (separately rebuilt baseline UI revision). Stop the assigned local Wrangler server when finished; never deploy to run this audit.
