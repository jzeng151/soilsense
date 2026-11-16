# Browser demo smoke

`npm run e2e` uses the same `playwright` Chromium dependency as `npm run a11y` (no extra test runner). It exercises the real UI and backend, with fresh browser storage per case, no credentials, no mocked responses and no automatic retries. Failures exit nonzero; capability skips are named in stdout and JSON.

## Local (two terminals)

```sh
npm ci
npx playwright install chromium
npm run build
npm run db:migrate:local
npx wrangler dev -c wrangler.offline.jsonc --port 8785
```

In another terminal:

```sh
npm run e2e
# Also schedule one historical demo run and try one AI question:
E2E_REPLAY=1 E2E_AI=1 npm run e2e
```

Stop Wrangler with Ctrl+C afterwards. The suite connects to an existing server; it does not start, deploy, migrate or stop one itself. Offline dev normally reports AI as unconfigured and explicitly skips Sprout.

## Deployed targets

```sh
# Team URL: replace <team-app> with the configured Worker name.
E2E_BASE_URL='https://<team-app>.workers.dev' npm run e2e

# Jason's backup: read-only UI checks plus exactly one demo replay, no AI chat.
E2E_BASE_URL=https://soilsense-jason.jason-zeng151.workers.dev \
  E2E_REPLAY=1 E2E_OUTPUT=test-results/jason npm run e2e
```

Use an HTTP(S) origin without credentials. `E2E_BASE_URL` defaults to `http://127.0.0.1:8785`. Environment examples use bash (including Windows Git Bash).

### Safety and coverage

The default is read-only **demo interaction**, not a promise of zero server-side cache/audit writes: generating the normal plan and its explanations uses POST and the app may cache data or record usage. A fail-closed browser request allowlist permits only the normal `/api/plan`, `/api/research/explain` and `/api/wind-screen` computations. All other mutating requests fail the case unless explicitly enabled below. No admin token is read or supplied; no uploads, reviews, recurring watches, live checks or account actions are performed.

1. Landing map loads; EN → ES → EN changes both translated copy and `html[lang]`.
2. Kansas → field confirmation → questions → plan. Verify nonempty advice, rotation cards, source provenance/status rows and settled MODIS, SMAP and GRACE/well evidence cards. Missing cards and forever-loading cards fail; unavailable/incomplete evidence is not misreported as populated data. This targets the current `next` UI; an older deploy missing a card fails rather than silently reducing coverage.
3. **Opt in with `E2E_REPLAY=1`**: inspect FIELD_AGENT capability, choose `finney-ks`, click **Replay Late June 2022**, track the exact returned run ID, and require completion with `status: dry` within 70 seconds. Reload and verify that same run renders as Dry spell. The run remains saved on the target. No recurring watch settings change. If another run is already pending, wait up to 70 seconds before scheduling; concurrent non-replay collisions fail rather than being counted as our replay. Explicit `available=false` skips; broken capability APIs fail.
4. **Opt in with `E2E_AI=1`**: send one short question to Sprout (inference may cost money), await the completed answer and check every `[R#]` in the answer against exactly one displayed verbatim research passage with an HTTP(S) source URL. No citations is valid, not proof that retrieval worked. Explicit `configured=false` skips; a configured model that errors fails. Leave this off for read-only deployed checks.
5. `/#/admin/docs` displays an empty password token field with refresh/upload disabled and makes no document API requests.

Uncaught JavaScript errors and application `console.error` calls fail. Browser HTTP/resource error messages are collected, not automatically failed: signed-out `/api/auth/me` returns 401 and optional evidence can explicitly be unavailable. Every case records all console errors, failed HTTP responses and blocked writes; inspect these even on a passing run. The suite is a smoke check, not a full accessibility, security or model-quality audit.

## Artifacts

`test-results/e2e/report.json` contains per-case pass/fail/skip, reasons, elapsed times, browser version, runner checkout revision, console/page errors, HTTP failures, replay ID/result/timing and evidence/answer observations. `E2E_OUTPUT` selects another output directory. Failures also save a full-page PNG and heading/section inventory. The checkout revision identifies the runner, **not** the deployed Worker revision. Artifacts are gitignored; preserve them separately when needed. No auth storage state, request headers or secrets are captured.

## Verification snapshot (2026-11-15)

Runner based on `origin/next` `147d756`; Chromium `159.0.8154.6`. Local production assets: `index-izKgl1UA.js`.

| Case | Local offline, replay + AI enabled | Jason backup, replay enabled, AI off |
| --- | --- | --- |
| Landing EN/ES | PASS | PASS |
| Kansas plan and evidence | PASS | **FAIL**: plan, rotation cards and provenance render, but MODIS `Historical vegetation evidence` card is absent (neither present nor explicitly unavailable) |
| Field Watch replay | PASS, dry in 45,619 ms | PASS, dry in 45,402 ms |
| Sprout | SKIP: `configured=false` | SKIP: read-only AI opt-out |
| Admin token gate | PASS | PASS |
| Total | 4 passed, 0 failed, 1 skipped | 3 passed, 1 failed, 1 skipped |

Local replay: `finney-ks:jun-2022:2026-11-15T16:42:49.832Z`.
Backup replay: `finney-ks:jun-2022:2026-11-15T16:44:10.473Z`.
Both were read back from the API and rendered after reload. Neither run had uncaught JS errors or application console errors; HTTP-resource console errors were signed-out `/api/auth/me` 401s. The backup section inventory includes SMAP, GRACE/wells, economics and Evidence and limitations, but not the current MODIS card. No deployment was performed to hide this mismatch.

Other gates: `npm test` — 52 files passed, 3 skipped; 374 tests passed, 11 skipped. `npm run typecheck` and `npm run build` passed (existing large-bundle warning).
