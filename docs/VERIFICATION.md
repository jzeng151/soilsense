# SoilSense end-to-end verification

## Scope, revision and environment

- Verification window: **2026-11-15, 17:43–18:56 EST (UTC−05:00)**. This is a point-in-time record, not a claim of universal upstream availability.
- Baseline checkout: `4f44678df1d511b5f939d19aacb22bf288050870` (`origin/next` when the worktree was created).
- Tested application/fix commit: **`386ebb6ab100d534ab96ff6b4ccdb62037465914`**. The report/evidence commit adds documentation and verification runners, not ranking changes. Early artifacts identify the baseline runner SHA and include the then-uncommitted fixes; final gates were rerun with the fix commit checked out.
- Local: Windows 11 / Git Bash, Node `v24.20.0`, Chromium `159.0.8154.6`, Wrangler `4.162.0`; `wrangler.offline.jsonc`, local D1 migrations only, `http://127.0.0.1:8792`. “Offline” means no Workers AI binding, **not** disconnected from upstream data services.
- Deployed target: <https://soilsense-jason.jason-zeng151.workers.dev>. Its exact Worker revision is not exposed by `/api/health`; the checkout SHA identifies the runner, not deployment provenance. Served remote assets: `index-DDPSSX7s.js`, `index-CA94rnMT.css`. Local fixed assets: `index-DsCBIU2s.js`, `index-DB5VIccv.css`.
- Installed with `npm ci` and `npx playwright install chromium`. No deployment, remote D1 migration, account creation, issue comment, real phone call, SMS, credential disclosure, remote recurring-watch change or privileged document mutation was performed.
- The deployed opt-in E2E run scheduled **one replay** and sent **one AI question**. Subsequent smoke runs left both opt-ins off. Normal plan explanations can also invoke inference; these were ordinary UI evidence checks, not additional chat questions.

## How to read the result

`works` is scoped to the exact interactions and locations in the local/deployed columns. It does **not** imply every provider, every field, every variant, or an unexercised remote mutation works. `degrades explicitly` means the interface/API truthfully reports missing evidence; **it is not successful evidence retrieval**. `broken` includes unresolved deployed behavior even if this branch fixes its local counterpart. `not testable` means no complete acceptance run was available tonight.

The inventory was derived from `docs/HOW-IT-WORKS.md`, `docs/E2E.md`, the feature docs, `src/worker/index.ts`, every file in `src/worker/routes`, `web/src/App.tsx` and component declarations. [Source inventory](verification/source-inventory.json) preserves route declarations/line numbers, component filenames and documentation filenames. It is an inventory, not a claim that every route was invoked.

**Feature rows: 46 — 29 works, 6 degrades explicitly, 4 broken, 7 not testable.**

| Feature | Local | Deployed | Status | Evidence |
| --- | --- | --- | --- | --- |
| ZIP lookup and Use my location | Empty ZIP error; real 50010 lookup returns Ames; geolocation permission with simulated Finney coordinates loads real field data | Same browser flow passed at 375 px; browser location is test input, not physical GPS verification | works | ui-results.json: zipLocal, zipDeployed |
| Health (/healthz, /api/health) | 200; DB true, AI false | 200; DB and AI true | works | api-results.json: health, healthz |
| Planner landing, map, keyboard point selection | Rendered; keyboard map selection passed | Rendered at desktop and 375 px | works | e2e-local.json; e2e-deployed.json; ui-results.json |
| Four demo farms: field lookup and confirmation | All four return 200 and render confirmation | All four return 200; crop history unavailable for Illinois, Kansas and Nebraska in this lookup pass | degrades explicitly | api-results.json: field-*; ui-results.json: farms-and-inputs |
| Four demo farms: rotation plan generation | All 16 farm/priority combinations returned three plans | Cached irrigated Kansas UI passed; rain-fed Kansas soil API also returned 200 at 18:36 EST; other deployed farm plans not repeated | works | scenarios-local.json; e2e-deployed.json; Known engine limitations below |
| Priority selection and ranking sensitivity | All four selections work; Iowa/Nebraska soil differ; irrigated Kansas top pick identical across all priorities | Cached balanced Kansas verified; known same-priority-ranking issue belongs to engine owner | broken | scenarios-local.json: Kansas balanced/profit/soil/risk |
| Rain, limited and full irrigation / water alternatives | Controls select; full and limited requests return plans; rain represented in other farms and waterOptions | Full Kansas UI and rain Kansas API return plans; limited remote plan not submitted | works | scenarios-local.json; ui-results.json: kansas-expanded |
| Optional farmer goals (maximum two) | Two selected, three disabled; selected-goal plan returns 200 and goal disclosure renders | Selection and limit verified at 375 px; changed-goal plan intentionally not submitted | works | ui-results.json; a11y-summary.json; scenarios-local.json |
| Farmer soil test validation and persistence | pH 15 disables submit; pH 6.5 accepted, reload retained; real plan echoes soilTest | Validation and per-field browser persistence verified; changed-input plan not submitted | works | ui-results.json: farms-and-inputs |
| Farmer yield records validation, persistence and plan use | Incomplete row blocks submit; 2025 corn 140 bu/acre retained and echoed by real plan | Input validation and reload persistence verified; plan calibration not submitted | works | ui-results.json: farms-and-inputs |
| Plan reasons, soil building, assumptions and pest checks | Populated facts, plan disclosures and soil/pest content | Same sections populated on cached Kansas | works | ui-results.json: kansas-expanded |
| Short AI explanation and cited research explanation | Standard template; explicitly unavailable research without AI | AI summary completes; no matching passage explicitly shown | degrades explicitly | explanation-deployed.json; ui-results.json: kansas-expanded |
| Research corpus/configuration / Vectorize retrieval | 13 chunks; AI/index not bound; no live retrieval claim | AI/index bound, but approved chat and explanation retrieve no matching passages | degrades explicitly | api-results.json: research-status; sprout-deployed.png; explanation-deployed.json |
| Sprout chat answer and research citation display | Explicit AI-unconfigured state; smoke skips | One approved question answered; empty research reported, F1 historical-field source shown; no R citations available to verify | degrades explicitly | e2e-deployed-initial.json; sprout-deployed.png; Smoke false failure below |
| Public field-memory recall/source resolution | Not independently exercised | Approved chat displays F1 field-history citation, but its exact source target was not retained/read back | not testable | sprout-deployed.png; no claim that F1 target resolves |
| Ask about this plan (/api/ask) | 200, source=facts; returned supplied pH fact | Not submitted separately to avoid another AI question | works | manual-local.json: ask |
| Bad-year comparison / 2022 rotation replay | Expanded historical comparisons render | Expanded comparisons and USDM context render | works | ui-results.json: kansas-expanded |
| Hot-year exposure and historical event catalog | 1991–2025 candidates; 2011 selected; dated event context and immutable snapshot rendered | API 200; same UI renders after Load field history | works | api-results.json: historical-scenarios; ui-results.json |
| Field Watch scheduled 2022 replay and persisted result | Exact scheduled run completed Dry spell | One approved replay completed dry in 45,796 ms; exact run rendered after reload | works | e2e-local-initial.json; e2e-deployed-initial.json |
| Field Watch close tab, wait, reopen | Closed the only page before due time; reopened after 50 seconds; same run was dry in API and UI | Reload persistence verified; page was not closed during the approved replay | works | scenarios-local.json: scheduled, afterTabClosed, reopenedText; remote limitation explicit |
| Scheduled check duplicate protection | Second POST returns created=false, HTTP 200 and identical pending runId | Not repeated to keep the one-replay remote budget | works | scenarios-local.json: duplicate |
| Field Watch current checks, history and manual cooldown | Manual run returns four results; immediate repeat cooldown=true | Existing cron-created records read; manual remote run not triggered | works | manual-local.json; api-results.json: fieldwatch, fieldwatch-history |
| Weekly and crop-window watch settings / scheduling | Enabled corn watch, read back weekly and window jobs; restored disabled/null; read back zero jobs | Read default disabled settings only; no recurring remote changes | works | scenarios-local.json: watchEnabled, watchRestored; api-results.json: weekly-watch |
| Weekly/crop-window alarm actually firing | Jobs scheduled, future alarm not awaited | Not enabled; no scheduled weekly/window acceptance run | not testable | Next weekly/window times are not proof that a recurring job fired |
| District drought outlook alert and linked second opinion | Current Finney outlook normal, so alert-only component correctly absent; watch/warning path not induced | Existing Kansas context says normal; no live district alert to exercise | not testable | api-results.json: fieldwatch; DistrictOutlook hides non-alerts by design |
| IMERG evidence | Explicit unavailable/cache-expired response | Explicit unavailable/cache-expired response | degrades explicitly | api-results.json: imerg; not a successful live IMERG comparison |
| SMAP regional evidence and product catalog | Finney 2022 available; catalog-only discovery explicitly labeled | Same seasonal bundle and 0.070 / 0.174 m³/m³ values render | works | api-results.json: smap, smap-catalog; e2e-deployed-initial.json |
| MODIS NDVI historical evidence | 2025 complete, 23/23 valid composites | 2025 complete, 23/23; chart and provenance render | works | api-results.json: modis; e2e-deployed.json |
| GRACE regional storage + KGS wells | Available with dated records and uncertainty/gaps | Available; regional limits and separate wells render | works | api-results.json: groundwater; e2e-deployed.json |
| US Drought Monitor category, timeline and replay | Matched category and complete historical timeline | Same routes return real dated county data and render | works | api-results.json: usdm-*; ui-results.json |
| Wind-erosion screen | Real wind/soil tables render | 1991–2025 wind counts, 2025 61/120 windy days; SSURGO WEG/WEI and cover calendar render | works | ui-results.json: kansas-expanded |
| Corn GDD timing / NASS benchmark | 2022 estimated dates; opted-in UI comparison settles | API returns timing; UI 2025/2024/2023 survey brackets and source queries render | works | api-results.json: crop-timing; explanation-deployed.json |
| Economics source audit and margin limitations | Versioned Kansas budget assumptions render | Dated K-State source PDFs, non-irrigated scope and no-AMS warning render | works | api-results.json: economics; ui-results.json |
| Kansas separate second opinion / harvest checks | Second-opinion API 200; harvest model/observed comparisons render | Second-opinion API 200; disclaimer and real harvest sections render | works | api-results.json: second-opinion; ui-results.json |
| Glossary, inline definition popover and trend charts | Expanded glossary; popover opens and Escape closes; charts expanded | Same glossary and popover interaction at 375 px | works | ui-results.json: kansas-expanded; a11y-summary.json |
| Spanish planner, goals, evidence and guide | EN/ES full plan scans and keyboard flows pass at 1280/375; reflow at 320 fixed | Landing switch, Spanish controls and guide work; Spanish plan API returned 200 at 18:39 EST | works | a11y-summary.json; spanish-plan-deployed.json; ui-results.json |
| Spanish Sources and Live call pages | html lang=es but main copy remains English | Same untranslated copy at 375 px | broken | ui-results.json: sources-es, live-es; live-es-deployed.png |
| Spanish document-admin page | Upload-by-URL section translated, main heading/forms mostly English | Same mixed language | broken | ui-results.json: admin-docs-es |
| How-it-works public route | EN and ES render at 375 px without overflow | EN and ES render at 375 px without overflow | works | ui-results.json: how-it-works-*; how-it-works-es-deployed.png |
| Admin/settings and document mutation token gates | 401 admin; 403 document mutations without configured ADMIN_TOKEN; blank token disables UI | 401 admin and document mutations; unauthenticated settings redirects to sign-in | works | api-results.json: admin-*, docs-*-gate; e2e-deployed.json |
| Document list/detail read token gates | Fixed: 403 without configured token; regression proves missing/wrong token 401 and valid-token reads | Still public GET /api/docs returns 200; nonexistent detail gives 404 instead of auth rejection | broken | api-results.json: docs-list, docs-detail; test/doc-ingest.test.ts |
| Authenticated document ingest/review/indexing and operator settings | Synthetic pipeline/unit coverage passes, not a real bound workflow acceptance run | No operator token used; no upload/review/settings changes made | not testable | Requires authorized token and Cloudflare notification/workflow acceptance |
| POWER refresh workflow and R2 evidence bundles | Status returns never/no snapshots; trigger rejects without token | Bindings true, all four farms state=never; no accepted snapshots to resolve | degrades explicitly | api-results.json: refresh-status, refresh-gate |
| Twilio phone conversation, SMS and live socket event delivery | Live page explicitly demo off; no real phone call | Live page explicitly demo off; no real phone call or SMS sent | not testable | api-results.json: live-status, live-events; ui-results.json |
| Account signup/login/logout and browser microphone dictation | Signed-out /me 401 and sign-in screen verified; no account or microphone exercised | Same; no account creation, credentials or microphone access | not testable | api-results.json: auth-me; ui-results.json: settings-*, scout-* |
| Real production Cron/Queue dispatch | Manual checks and DO alarm replay pass; no real Cron event | Existing cron-stamped results observed, not a newly induced scheduled event; Queue not exercised | not testable | api-results.json: fieldwatch; existing stored records are not new trigger proof |

All evidence paths in the table are relative to [`docs/verification/`](verification/). Compact API summaries retain HTTP status, data-state fields, counts and selected provenance; the full multi-megabyte weather/bundle bodies are intentionally not committed.

## Executed gates and real observations

| Command / run | Result |
| --- | --- |
| `npm test` (initial) | 72 files passed, 3 skipped; 562 tests passed, 11 skipped |
| `npm run typecheck` | Passed before and after fixes |
| `npm test` (final fixed application) | 73 files passed, 3 skipped; **564 tests passed, 11 skipped** |
| `npm run build` | Passed; existing >500 kB bundle warning remains |
| `E2E_BASE_URL=http://127.0.0.1:8792 E2E_REPLAY=1 E2E_AI=1 E2E_OUTPUT=test-results/local npm run e2e` | 4 passed, 0 failed, 1 skipped; local AI explicitly unconfigured |
| `E2E_BASE_URL=https://soilsense-jason.jason-zeng151.workers.dev E2E_REPLAY=1 E2E_AI=1 E2E_OUTPUT=test-results/deployed npm run e2e` | Original runner: 4 passed, 1 failed. Failure was an English-answer **test selector bug**, not an empty chat response; see below |
| Final local and deployed `npm run e2e` with replay/AI opt-ins absent | Each 3 passed, 0 failed, 2 explicit opt-out skips |
| `A11Y_BASE_URL=http://127.0.0.1:8792 A11Y_OUTPUT=test-results/a11y-final.json npm run a11y` | **Passed**: 32 axe scans, EN/ES × 1280/375 px × 8 states; zero selected-rule violations and no horizontal overflow. Keyboard/44px checks passed, including plan reflow at 320 CSS pixels |
| `node scripts/verify-features.mjs` / deployed equivalent | 41 probes per target; expected auth/validation errors retained, not relabeled as failed features |
| `node scripts/verify-ui.mjs` / deployed equivalent | 14 render/input/evidence cases per target at 375 px passed; two additional ZIP/geolocation cases passed. Render checks are not semantic translation checks |
| `node scripts/verify-scenarios.mjs` | 19 real local plan requests; watch settings scheduled/restored; duplicate protection; tab-close/reopen persisted replay verified |

Axe **incomplete** records remain in [a11y-summary.json](verification/a11y-summary.json); zero violations is not WCAG certification or a screen-reader listening test. The document-review fixture in the a11y runner is explicitly synthetic and is **not** authenticated live document ingestion coverage.

No uncaught browser JavaScript/window errors were found in the recorded UI cases. The expected signed-out `/api/auth/me` 401 generates browser resource-console noise; it is retained in artifacts. During one deliberately over-parallel local run, POST-heavy suites exceeded the app's real 40/minute per-isolate limiter: `/api/plan` and a duplicate-check request returned 429. After serializing/cooling down, local E2E and scenario runs passed. The limiter was not weakened. Failed selector/parallel runs were investigated rather than reported as product successes.

### Exact persisted replay evidence

- Approved deployed run: `finney-ks:jun-2022:2026-11-15T22:47:22.527Z`, completed `dry` in **45,796 ms**, read back and rendered after reload. Research note: `empty`, “no applicable passage matched.”
- Local tab-close/duplicate acceptance run: see `scheduled.run.runId` in [scenarios-local.json](verification/scenarios-local.json). The duplicate response has `created=false` and the identical run ID. The only browser tab was closed before the due time, then reopened after 50 seconds; both API and UI showed that exact completed dry run.
- Local recurring-watch acceptance: read-back showed `enabled=true`, `crop=corn`, two scheduled jobs and explicit next weekly/window times. Cleanup read-back showed `enabled=false`, `crop=null`, zero scheduled jobs. This proves settings/scheduling/restoration, **not** future weekly execution.

## Fixes in this PR

1. **Protect document GETs, not only writes.** `GET /api/docs` and `GET /api/docs/:docId` exposed operator document metadata and potentially pending review chunks without a token. The existing admin-token middleware now covers all document routes. A failing-then-passing regression verifies missing/wrong token rejection and valid-token reads; existing pipeline tests now authenticate their reads. No token was obtained or used against the deployed system.
2. **Fix the false Sprout smoke failure.** `detectLang()` intentionally omits `lang` for inherited English. The smoke required `.sc-bot > div[lang] > .md`, so a fully visible English reply was called empty. It now selects direct answer Markdown without requiring that attribute, still excluding reasoning/tool cards. A real-render regression reproduces the former failure. [Original deployed screenshot](verification/sprout-deployed.png) proves a completed answer existed. The original failing report is preserved; it has **not** been edited into a fabricated green run. No second deployed chat was sent just to obtain a green screenshot.
3. **Make a11y and keyboard selectors bilingual.** The scripts previously timed out on Spanish goal labels, evidence buttons and navigation names. They now use actual EN/ES accessible names and wait for Spanish loading text as well.
4. **Fix Spanish 320px water-stat overflow.** The “Agua extraída / pulgadas/año” cells forced 340px scroll width at a 320px viewport. `minmax(0, 1fr)` columns and wrapping remove the forced minimum. The full keyboard/reflow and axe runs pass after the change, covering the reported Spanish What-if/water-comparison overflow. Deployed assets were not changed.

No ranking-engine files, plan-cache code, `src/worker/service.ts`, farmer-constraint-owned files, `README.md`, or stretch-evidence `App.tsx` blocks were edited.

## Broken / needs owner

### 1. Deployed document read authorization — security / document pipeline owner

**Repro:** without Authorization, `curl -i https://soilsense-jason.jason-zeng151.workers.dev/api/docs` returns **200**, whereas document mutations reject with 401. A nonexistent `GET /api/docs/verification-nonexistent` returns 404 instead of rejecting authentication. Pending review detail reads are not protected by the baseline middleware. **Expected:** operator-token rejection before listing or resolving document records. **Status:** fixed and regression-tested locally in this PR; still needs integration and an authorized deployment. Do not treat hiding the admin page controls as API authorization.

### 2. Irrigated Finney ranking insensitive to priority — ranking engine owner (already assigned)

**Repro locally:** POST `/api/plan` four times with `{lat:38.1095, lon:-100.706, irrigated:true, priority:P}` for `P=balanced,profit,soil,risk`. All return `Soybean → Corn → Soybean`. Iowa/Nebraska soil priorities do change the top plan, so the selector is not simply ignored everywhere. [Recorded matrix](verification/scenarios-local.json). Identical top picks alone do not mathematically prove an invalid optimum; the preassigned concern needs engine review of all scored candidates and tradeoffs. No engine fix was attempted here.

### 3. Sources / Live call are not Spanish — UI/i18n owner

**Repro:** set ES or `localStorage['soilsense.language']='es'`, then visit `/#/sources` or `/#/live`, at 375 px or desktop. `html[lang]` is `es`, but headings and body remain English (“Where our data comes from”, “Watch a call”). **Expected:** translated page copy or a clearly labeled English-only passage. Both local and deployed reproduce. [Live screenshot](verification/live-es-deployed.png); full texts in `ui-results.json`.

### 4. Document operator page partly untranslated — document UI/i18n owner

**Repro:** select ES and visit `/#/admin/docs`. The URL-intake section is Spanish, but “Document review”, main upload fields and token/help copy remain English. **Expected:** consistent page localization or explicit language-of-parts marking. Both environments reproduce. Token enforcement does not depend on this cosmetic/UI issue.

### Previously reported deployed resource limit — engine/cache owner, not reproduced in later warm probes

The delegation reported uncached `/api/plan` returning 503 `error code: 1102` for rain-fed Finney soil/risk, Iowa, Nebraska and Spanish variants. Do **not** erase that report because the standard cached demo succeeds. In this verification window, the cached English irrigated Kansas demo passed; a later rain-fed soil request returned 200 at **18:36 EST**, and the Spanish irrigated balanced request returned 200 at **18:39 EST**, with three plans and Spanish summary. Those successful requests are **not** a cold-cache test, and do not prove the resource-limit issue is fixed. Coordinate with the already assigned engine/cache owner before broad cache-miss testing on the small Worker plan.

One Python `urllib` deployed probe received Cloudflare 403 `error code: 1010`; the same Spanish request using Node fetch returned 200. This was a client/WAF-specific retrieval blocker, not evidence that Spanish planning itself failed.

## Explicit degradation / evidence owners

- **IMERG:** both targets say the optional comparison is unavailable/not retrieved/cache expired. Needs a real warmed comparison if the demo promises live IMERG; not marked successful here.
- **Research retrieval:** the deployed AI answer and short plan explanation work, but both report no matching research; no `[R#]` citation was available for live passage validation. Index binding presence and a corpus count are not proof of successful Vectorize matches. Suggested owner: research/index ingestion.
- **Crop history:** the four deployed field lookups succeeded, but three reported unavailable crop history. The cached full Kansas plan separately contained historical crops. Suggested owner: upstream crop-map timeout/cache handling; UI correctly allows a farmer-provided current crop.
- **POWER refresh:** all four deployed status rows are `state=never` despite workflow/evidence bindings being present. Trigger is protected; no accepted snapshot/bundle exists to verify. Suggested owner: refresh/workflow operations.

## Not testable tonight / remaining acceptance work

- A new real Twilio phone conversation, bilingual ASR/TTS, SMS, ConversationRelay websocket and live event fan-out. The page's “demo off” state is truthful but not a successful call.
- Actual microphone dictation and account signup/login/logout. Only signed-out redirects and `/api/auth/me` rejection were exercised; no credentials or accounts were created.
- A genuinely fired weekly/crop-window job, a newly induced real Cloudflare Cron event, R2 object-create Queue notification and authorized upload→review→index end-to-end acceptance. Unit/fixture coverage is not substituted for cloud execution.
- Alert-specific district drought outlook and dry-year rotation link: current Finney context is normal. The component deliberately renders only watch/warning alerts; no fake drought response was injected to claim live success.
- Exact `[F1]` field-memory source resolution after the approved chat; the screenshot shows a historical source, but the precise URL was not retained and reread.
- Remote recurring-watch mutations, duplicate scheduling, close-tab-before-due acceptance, altered-goal/measurement plan calculations and all non-Kansas plan variants. Their local acceptance is recorded; remote budgets were kept bounded.
- Every external tile/layer/source URL, all geographic points and all dynamic provider outage conditions; 375px visual checks do not replace physical mobile-device testing. The geolocation check used explicit simulated browser coordinates and a real field API, not physical GPS.
- Full screen-reader listening, performance/load tests, adversarial security audit and model-quality validation.

## Reproduce safely

```bash
npm ci
npx playwright install chromium
npm run build
npm run db:migrate:local
npx wrangler dev -c wrangler.offline.jsonc --port 8792
# Another shell, same worktree. Run POST-heavy suites serially.
E2E_BASE_URL=http://127.0.0.1:8792 npm run e2e
A11Y_BASE_URL=http://127.0.0.1:8792 A11Y_OUTPUT=test-results/a11y-final.json npm run a11y
node scripts/verify-features.mjs
node scripts/verify-ui.mjs
node scripts/verify-scenarios.mjs # local only: changes/restores local watch and schedules replay
# Remote default: no replay/chat or recurring mutations.
VERIFY_BASE_URL=https://soilsense-jason.jason-zeng151.workers.dev \
  VERIFY_OUTPUT=test-results/features-deployed.json node scripts/verify-features.mjs
# Opt-in replay/AI costs and state changes require fresh authorization; don't repeat blindly.
```

The API runner performs ordinary cached plan computation and **unauthenticated** mutation-gate checks, not privileged uploads or refreshes. The UI runner uses fresh storage and real APIs; remote measurement/goal edits stop short of submitting a changed plan. Treat its `passed` as the specific asserted interaction, not proof that every section is translated. Stop only the Wrangler process tree you started and verify port 8792 closes when finished.

**Cleanup verified:** the owned Wrangler tree was stopped at 18:55 EST; a TCP connection no longer succeeded and `netstat` showed zero listeners on 8792. No server on another session’s port was stopped. See [server-cleanup.json](verification/server-cleanup.json).
