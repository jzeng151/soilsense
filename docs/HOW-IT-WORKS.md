# In-app How it works guide

Public route: `/#/how-it-works` (sidebar **How it works / Cómo funciona**).
No sign-in, API request or external image is needed for the guide itself.
The shared shell still performs its normal session check.

## Content provenance

- `README.md`: deterministic rotation engine, core sources, geographic and model limits.
- `wrangler.jsonc`: product selection and displayed binding names are read directly by
  `web/src/pages/cloudflare-products.ts` at bundle time. The checked-in config uses
  whole-line `//` comments; the parser deliberately does not silently accept a different format.
- `src/worker/index.ts`: Hono entry points, assets fallback, Cron and Queue dispatch.
- `docs/INGEST.md`: R2 object-create notification → Queue → document Workflow →
  human review → embedding/indexing. Notifications are account-side setup, not a
  binding, and this guide is not evidence that they are live.
- `docs/RESEARCH.md` and `src/worker/{routes,research,ingest}`: research retrieval,
  exact source text, generation vs deterministic planning, and AI Gateway call options.
  AI Gateway is not a separate Wrangler binding; calls without a configured or
  route-default gateway ID can bypass it.
- `src/worker/service.ts`, `src/worker/data/*`, `src/engine/smap.ts`,
  `data/grace-wells-finney.json`, `web/src/components/MapPicker.tsx` and
  `src/worker/research/corpus.json`: runtime vs optional/demo-only vs map-only
  data, source URLs, geographic/resolution/applicability limits.
- `docs/VALIDATION.md`: recorded out-of-sample correlation **0.41**, **42 of 43**
  positive correlations, **33 of 43** better than rainfall-only; OpenET average
  water use within **6%** on one Finney County center-pivot field (2016–2024).
  These are not new evaluations, field-level accuracy claims or next-season forecasts.
- No team-role footer: README does not identify team roles.

The reference architecture's entry/features/background/document/storage structure is
adapted into three inline SVG panels. All colors use app semantic tokens; the panels
stack on smaller screens rather than shrinking the fixed-width reference screenshot.
SVGs have localized titles/descriptions and a longer expandable text alternative.
The language provider now wraps the shell, so the guide, its nav link and the planner
share a single language preference across navigation.

## Reproduce checks

```bash
npm test
npm run typecheck
npm run build
npx vite preview --config web/vite.config.ts --host 127.0.0.1 --port 8786 --strictPort
# In another terminal; choose an explicit scratch output file:
A11Y_OUTPUT='<scratch>/how-it-works.json' node scripts/check-how-it-works.mjs
```

Optional: `A11Y_SCREENSHOTS='<scratch>/shots'` saves full-page captures.
Stop the preview when finished. This serves built static assets only; it neither
creates Cloudflare resources nor deploys anything.

## Local evidence

- `npm test`: 376 passed, 11 skipped (53 passing files; 3 skipped files).
- Typecheck, production build and `git diff --check`: passed. Build emits a
  large-bundle warning; this task does not restructure the app bundle.
- Playwright Chromium 159.0.8154.6 + axe-core 4.14.0: English and Spanish at
  1440, 375 and 320 px; six expanded-guide scans, zero selected WCAG 2 A/AA and
  2.1 A/AA violations, no horizontal overflow, clipped SVG labels or external images.
- axe leaves SVG text contrast incomplete in each scan. The checker separately
  calculates contrast from actual rendered text and rect fills; minimum **11.91:1**.
  The incomplete records are preserved, not relabelled as axe passes.
- Keyboard activation changes language; mobile Escape restores the menu button's
  focus. Route tests also exercise sidebar navigation away/back without losing language.
- Source links are checked for valid HTTPS URL format, not universal upstream uptime.
  Static-preview checks do not prove live Cloudflare AI, R2 notifications or ingestion.
  These checks are not WCAG certification or a substitute for screen-reader user testing.
