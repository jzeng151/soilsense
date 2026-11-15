# Accessibility audit — integrated SoilSense build

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
