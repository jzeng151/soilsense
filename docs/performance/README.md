# Frontend performance: production build and local Chromium

## Outcome

The original single 1,431,289-byte JS bundle is split into route/evidence/language chunks. The largest final chunk is React at 218,797 bytes (84.7% smaller than the original largest chunk); the entry is about 203 kB. Vite's >500 kB warning is gone without raising its warning threshold. First-visit JS transfer falls 47.1% on the planner and 60.3% on the guide. Throttled mobile improves; desktop planner timings are slightly worse, not claimed as a win.

| Profile / route | LCP before → after (ms) | JS transferred before → after (bytes) | Enabled plan button before → after (ms) |
| --- | ---: | ---: | ---: |
| Desktop `#/` | 588 → 624 | 477,758 → 252,895 | 298.6 → 331.2 |
| Desktop `#/how-it-works` | 216 → 212 | 477,750 → 189,845 | N/A |
| Fast 3G / 4× CPU `#/` | 3,688 → 2,808 | 477,765 → 252,895 | 4,367.3 → 3,383.6 |
| Fast 3G / 4× CPU `#/how-it-works` | 3,648 → 2,232 | 477,752 → 189,854 | N/A |

All table values are medians of three runs, not the best run. Mobile LCP reductions are 23.9% / 38.8%; mobile plan-button readiness improves 22.5%. Desktop planner LCP rises 36 ms and plan-button readiness rises 32.6 ms; this small local sample does not establish a desktop latency improvement. Raw runs, including slow outliers, are retained in `before.json` / `after.json`.

## Method and limits

- Baseline: `ac9db24a6f034f05ffe03481068744bca7c1b993` (the base of this performance branch). Measured before implementation, then rebuilt/retested with the extended plan-button instrument for an equivalent before/after protocol. Final run includes the page-owned Korean dictionary split.
- Windows host, Playwright's Chromium **159.0.8154.6**, headless. Actual `npm run build:web` output served by `npx wrangler dev -c wrangler.offline.jsonc --port 8818`; not Vite's development server. No deployment or remote mutation.
- Three new browser contexts per profile/route, English, reduced motion, device scale 1. Desktop 1440×900, unthrottled; mobile 390×844, CDP 4× CPU slowdown, 150 ms network latency, 1.6 Mbit/s download / 750 Kbit/s upload (configured using 1024-based units). Desktop and mobile run sequentially, without simultaneous test suites.
- A separate unmeasured visit warms Wrangler's asset indexing/compression; it does **not** warm the measured browser contexts. CDP disables the browser HTTP cache on every measured page, including the plan-button navigation.
- `PerformanceObserver` collects buffered LCP. The observation window ends four seconds after a real enabled route control appears; the script does not click during that LCP window. JS transfer is CDP `Network.loadingFinished.encodedDataLength` for Script requests, including response overhead/compression, not the sum of uncompressed build files. CSS, map tiles, fonts and API payloads are not counted as JS.
- `ready` in the JSON is a custom visual/DOM readiness marker: visible enabled Kansas example button on the planner, English language button on the guide. It is **not** standardized Lighthouse TTI.
- `planButtonReadyMs` uses a separate full navigation, clicks Kansas, confirms the real field response, and stops when **Show my plan** is enabled. No fixed four-second observation delay is included. Uses the actual local Worker with warmed D1/upstream field cache; this measures the automated warm-data journey, not cold NASA/USDA latency, human input time, or plan computation. There is no plan button on the guide.
- Measurements depend on this shared workstation, local compression and API cache state. They are not deployed Core Web Vitals, field RUM, or confidence intervals. This PR does not promise a desktop speedup.

Reproduce with the assigned local Worker running (local D1 migrations applied):

```sh
npm run build:web
node scripts/web-performance.mjs after
node scripts/web-performance-smoke.mjs
E2E_BASE_URL=http://127.0.0.1:8818 npm run e2e
A11Y_BASE_URL=http://127.0.0.1:8818 A11Y_OUTPUT=test-results/perf-axe.json A11Y_KEYBOARD_OUTPUT=test-results/perf-keyboard.json npm run a11y
```

Run the same measurement script with the baseline's web sources/build to reproduce `before`. Use `PERF_BASE_URL` for an alternate local server. Do not run baseline and final source rewrites while another session owns the worktree.

## Implementation

- `Shell.tsx`: React lazy routes for planner, How it works, Sources, Live, Scout, docs admin, Settings and Auth. Critical initial planner/guide module resolves before React mounts, avoiding an avoidable Suspense reveal delay. Unrelated tools are not preloaded. The assigned base has **no Explore route**; no other track's Explore files are edited.
- Ten plan-only evidence/economics modules load behind individual Suspense boundaries. One card download cannot blank the answer or move keyboard focus. These are mount-deferred, not intersection/scroll-gated: existing assistive-technology access and smoke expectations remain intact.
- Rolldown vendor groups isolate React and Leaflet. Leaflet remains on the planner's critical path because the interactive map is its primary field input; it is excluded from the guide and other independent routes. Charts are native existing components, not replaced or simplified.
- Main and page-owned Korean dictionaries are lazy-selected together. English falls back while they load or if a chunk fails; guide-copy getters update after hydration. Moved 286 page Korean entries verbatim; programmatic en/es/ko dictionary equality against the base passed. No copy edits. This base supports EN/ES/KO and has **no Chinese dictionary** to split. English/Spanish remain synchronous to preserve the typed English-key inventory and existing Spanish behavior.
- `web/public/_headers` is copied into production assets: `/assets/*` returns `public, max-age=31536000, immutable`; `/` and `/index.html` return `no-cache` (HTML can be cached but must revalidate). Local Worker verification captured an HTTP 307 canonical redirect from `/index.html` to `/`, also `no-cache`. API caching is untouched.

## Verification / evidence

- Typecheck and production build pass; 845 tests pass, 14 existing skips (111 passed files, six skipped).
- Local `npm run e2e`: three pass, two intentional opt-in skips (AI inference / Field Watch replay). `e2e.json` retains result and failure inventories; not a claim that opted-out writes were exercised.
- Existing axe matrix: **48/48** scans, zero violations and zero horizontal overflows, EN/ES/KO at 1280/375 widths. `axe.json` summarizes inventories, violations and incomplete-rule counts; `axe-full.json.gz` contains the complete actual axe report. Automated axe incomplete checks remain manual-review candidates, not falsely described as all-clear.
- Existing keyboard / 44 px target checks pass across all six language/width combinations (`keyboard.json`).
- Additional guide axe checks at 1440 and 390 widths: zero violations. Browser request assertions prove English planner/guide/Sources do not fetch either Korean dictionary, selection fetches both, and deliberately failed dictionary requests preserve a usable English guide (`smoke.json`).
- The axe runner now waits for asynchronously mounted evidence buttons to attach **before** expanding disclosures. Without that wait, a newly arrived card could introduce a closed details element after the old synchronous expansion pass. Existing coverage is retained, not skipped.

## Cloud setup for owner

**No new resources, bindings, migrations or secrets.** Deploy the ordinary production build and retain its generated `_headers` file. No Wrangler registry changes are needed. Owner should verify `/`, `/index.html` and one current hashed JS/CSS URL with `curl -I` after deployment. Remote headers and real mobile/desktop field metrics remain unverified because remote deployment was prohibited.
