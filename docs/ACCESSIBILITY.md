# Accessibility audit — SoilSense main flow

## Status and wording for the one-pager

**Do not claim full “WCAG 2.1 Level AA” conformance on the strength of this audit.**

Suggested wording:

> SoilSense’s main planning flow was checked against axe-core’s WCAG 2.0/2.1 A and AA rules at desktop and phone widths, with zero automated violations in the audited states after fixes. Keyboard smoke checks also passed. Full WCAG conformance and screen-reader user testing remain to be evaluated.

Automated checks do not establish full WCAG conformance. This is a scoped engineering audit, not certification. No screen-reader user testing has been performed.

## Scope, environment and provenance

- Date: **15 November 2026**, Eastern Standard Time. Before capture began 10:17 EST; final after capture began 10:20 EST. JSON includes UTC timestamps for each axe result.
- Built React/Vite production assets, served by the real local Cloudflare Worker with `wrangler.offline.jsonc`, not a mocked HTML fixture or Vite development server.
- axe-core **4.14.0**, Playwright **1.65.1**, Chromium **159.0.8154.6** on Windows 11.
- Rules selected by `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`. No rule exclusions. WCAG 2.2 target-size rules are not part of these tags; the separate keyboard smoke script checks the team's 44 × 44 CSS-pixel enabled landing-button rule.
- Viewports: **1280 × 900** and **375 × 900** CSS pixels, reduced-motion preference enabled.
- Before UI: `cdeff6bdb3bb6dbcec003e62ca7dc74d2a67d70a` (`origin/next` at audit start). After UI: `560680517183b506c3c31d075e618a4b2ce0ad0a`. For the final baseline the base revision's `web/src` was temporarily rebuilt with the same scanner, Worker and warmed local data, then restored before the final after build.
- Real Kansas example: Finney County, coordinates 38.1095, -100.706, default inferred recent crop, full irrigation and balanced priority. The keyboard smoke test additionally changes the crop using Space.
- Field Watch: a real **local-only** manual check populated four farm rows before both final captures. The dedicated Field Watch scan expands the farm disclosures; landing captures keep them collapsed. No production state was changed.
- Plan: wait for asynchronously fetched evidence, activate **Compare timing** and **Load field history**, then expand **every** rendered `details`, including nested comparisons, charts, assumptions, SMAP, water/well records and evidence methods. The JSON inventory records headings, disclosure states and horizontal overflow. All plan disclosures are open in the final before/after scans.
- Admin docs: public `/#/admin/docs` entry page, with token and file inputs; no credential was entered and no research document was uploaded. Authenticated list/detail/review states were **not** audited.
- Conditional content absent from the real API response is not fabricated to force a card to appear. Other demo farms, changed water/priority outcomes, AI chat, voice, authentication and settings are outside this audit.

## Before / after results

A **rule** count means distinct failing axe rules in that scan; **nodes** means affected DOM elements under those rules. The same element/state at two widths is counted twice. These are not counts of unique WCAG success criteria or unique bugs. Incomplete counts are rules requiring review, not passes.

| State | Width | Before rules / nodes | After rules / nodes | Before / after incomplete rules |
|---|---:|---:|---:|---:|
| Landing: map, demos, Field Watch | 1280 | 0 / 0 | 0 / 0 | 3 / 3 |
| Field confirmation | 1280 | 0 / 0 | 0 / 0 | 3 / 2 |
| Three questions | 1280 | 1 / 1 | 0 / 0 | 1 / 1 |
| Kansas plan, all rendered disclosures expanded | 1280 | 2 / 14 | 0 / 0 | 2 / 1 |
| Field Watch, four farm details expanded | 1280 | 0 / 0 | 0 / 0 | 0 / 0 |
| Admin docs entry page | 1280 | 0 / 0 | 0 / 0 | 0 / 0 |
| Landing: map, demos, Field Watch | 375 | 0 / 0 | 0 / 0 | 3 / 3 |
| Field confirmation | 375 | 0 / 0 | 0 / 0 | 3 / 2 |
| Three questions | 375 | 1 / 1 | 0 / 0 | 1 / 1 |
| Kansas plan, all rendered disclosures expanded | 375 | 2 / 14 | 0 / 0 | 2 / 1 |
| Field Watch, four farm details expanded | 375 | 0 / 0 | 0 / 0 | 0 / 0 |
| Admin docs entry page | 375 | 0 / 0 | 0 / 0 | 0 / 0 |
| **Scan-instance totals** | | **6 / 30** | **0 / 0** | **18 / 14** |

Machine-readable evidence: [`a11y/before.json`](a11y/before.json), [`a11y/after.json`](a11y/after.json), [`a11y/keyboard.json`](a11y/keyboard.json). These contain actual browser results, including passes, violations, incomplete checks, selectors, HTML snippets and source versions. The final scan records no page-level horizontal overflow in any of the 12 states; the baseline expanded phone plan overflowed.

## Repairs

### Violations reproduced by axe before the fixes

- **WCAG 2.5.3, label in name:** definition buttons' overriding accessible labels did not match their complete visible labels. Let native button text supply the accessible name and retain the technical definition hint in `title`.
- **WCAG 1.4.3, contrast:** remove container opacity from small U.S. Drought Monitor attribution and wind-method text; opacity washed out their green links on white (reported ratios 3.55:1 and 3.92:1). Use the existing muted text token without fading links.
- **WCAG 1.4.3, contrast:** stop fading current-practice crop chips (reported soybean chip 3.95:1). Keep the semantic crop-label foreground fully opaque.

### Keyboard, structure and layout findings outside the selected axe violations

- Replace radio roles without radio-pattern arrow-key handling with named groups of native toggle buttons (`aria-pressed`). All options remain Tab-reachable and activate with Space/Enter; no unimplemented radio interaction pattern is promised.
- Allow keyboard map selection: Arrow keys pan using Leaflet's keyboard support; Enter selects the map center. Provide visible instructions and a named region rather than application mode. Demo buttons remain an alternative to the map.
- Move focus to the planner main region on step changes; honor reduced motion for scrolling and Leaflet flights.
- Fix collapsed mobile navigation still receiving Tab focus while translated off-screen. Hide it from focus/accessibility when closed; provide a visible Close navigation button, Escape dismissal, focus restoration and contained Tab navigation when open.
- Make Field Watch an `h2` under the landing `h1`, retaining its styling.
- Ensure 44px minimum enabled button dimensions, map zoom/layer targets and disclosure heights; strengthen visible focus outlines, including the ZIP input.
- Disable CSS animation/transitions under `prefers-reduced-motion: reduce`.
- Make the planner grid shrink correctly at narrow widths and wrap long immutable evidence hashes instead of forcing page-level horizontal scrolling. The browser smoke test also checks the default plan at **320 CSS pixels**.
- Preserve existing labeled inputs and meaningful Sprout image alternatives; axe reported no missing image names or input labels in the audited states.

## Manual keyboard and visual smoke checks

An agent-operated real browser pass inspected visible focus rings at desktop and phone widths. On the phone flow: Tab through glossary → ZIP → Go → location → map → zoom/layers → demos; activate Kansas with Enter; continue through Field Watch to confirmation; activate confirmation; Tab through all crop, water and priority controls; activate Show my plan with Enter. The resulting plan and phone focus ring were visually inspected. Desktop ZIP/Go focus was also visually inspected. This is **not** testing by an assistive-technology user.

The rerunnable Playwright keyboard checks exercise actual browser Tab, Shift+Tab, Enter, Space, ArrowRight and Escape events at both widths. They verify:

- Kansas and field confirmation are reachable in forward Tab order, without pointer clicks.
- Closed phone navigation is not a hidden focus stop; opening/closing the drawer moves/restores focus and reverse Tab stays inside it.
- Space selects a crop and exposes its pressed state, and Enter builds the plan.
- Native plan disclosures open with Enter.
- ArrowRight then Enter selects a point on the map.
- Enabled visible landing/confirmation buttons meet 44 × 44 pixels; the plan reflows at 320px.

`keyboard.json` records the landing Tab order, dimensions finding list, transition focus, plan heading and map selection. These are smoke checks, not exhaustive keyboard testing of every expanded evidence link or every admin action.

## What remains

- **14 incomplete rule instances remain** across the 12 after scans. Most are contrast checks over SVG text, decorative glyphs/arrows or map content; Leaflet's symbolic zoom labels and attribution also need manual interpretation. They are preserved in JSON, not suppressed or counted as passes. The visible focus/layout spot check does not close every incomplete finding.
- No NVDA, JAWS, VoiceOver, TalkBack or screen-reader user testing; announcement quality, reading order and map usability with those tools remain unverified.
- No exhaustive full-WCAG review of non-text contrast, every chart's equivalent explanation, zoom/text-spacing settings, cognitive usability or all success criteria that automation cannot assess.
- Admin authenticated/upload/review results, all alternate conditional/data-error states and non-planner routes need their own audit.
- Data requests use actual external services through the local Worker. Content, coverage and availability can change; a successful rerun is evidence for its recorded state, not a permanent guarantee.
- Build passes with the pre-existing large-JavaScript-chunk warning. Unit suite: **289 passed, 11 skipped** (40 test files passed, 3 skipped); typecheck passes. Skipped tests are not claimed as verified.

## Rerun

From a clean checkout with Node/npm installed:

```sh
npm ci
npx playwright install chromium
npm run db:migrate:local
npm run build
npx wrangler dev -c wrangler.offline.jsonc --port 8790 --ip 127.0.0.1
```

Leave that local server running. In a second shell in the same checkout:

```sh
# Optional: populate Field Watch using the LOCAL UI's Run check now button.
# Do not point a state-changing population request at production.
npm run a11y
```

`npm run a11y` scans all 12 state/width combinations, writes `docs/a11y/latest.json`, and runs the keyboard checks (writing `docs/a11y/keyboard.json`). It exits nonzero for an axe violation, missing scan, page-level overflow or failed keyboard assertion. Incomplete axe findings are reported but deliberately do not fail the automated gate. An unavailable core field/plan response fails the run rather than substituting a fixture.

Optional environment variables: `A11Y_BASE_URL` (defaults to `http://127.0.0.1:8790`), `A11Y_OUTPUT` (JSON destination), `A11Y_SCREENSHOTS` (directory for viewport screenshots), and `A11Y_REVISION` (explicit source revision when auditing a separately rebuilt baseline). For example in bash:

```sh
A11Y_OUTPUT=docs/a11y/after.json npm run a11y
```

Stop the local Wrangler server with Ctrl+C when finished. Never deploy to run this audit. Rerun after integrating translations or the new farmer-goal picker: this evidence covers this branch's English/default-priority UI, not parallel changes that have not yet been integrated.
