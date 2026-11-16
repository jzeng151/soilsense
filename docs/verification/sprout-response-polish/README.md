# Sprout response polish — verification

## Scope and outcome

Branch: `fix/sprout-response-polish`, based on `origin/feat/explore-chrome` at `a32b554`. Stacked onto UI PR #126. No merge, deployment, remote migration, secret access or research-index mutation.

- Reasoning is disabled in SDK transport and Gemini thought inclusion, filtered again in the server stream, and ignored in the shared UI (including persisted completed reasoning). Before answer text, both chat entry points show only localized **Thinking… / Pensando… / 생각 중…**. Live tool cards are withheld; completed data-tool summaries remain.
- The shared Markdown renderer replaces only the known rotation-arrow notation outside code, keeps currency and ordinary bracketed prose, resolves actual returned fact/research references to named evidence, and explicitly labels recognized references with no evidence as unavailable. Citations are also resolved inside emphasis. Adjacent headings and mixed ordered/bulleted lists remain separate semantic blocks. Plan explanations now use the same renderer.
- Plan tools preserve exact fact IDs/text/source and both selected/current modeled-stress values. Chat and plan-explanation prompts require plain language, historical/model scope, trial applicability, and supported comparisons. Explanation validation rejects the tested unsupported risk-reduction wording and comparisons without lower cited model values. The explanation prompt version is bumped to avoid using old saved generation keys.
- Output-limit finishes emit a localized interruption notice rather than silently implying a complete answer. The chat output budget is increased from 1200 to 2000 tokens; prompts prefer short complete answers.

## Before / after

**Reported before:** raw `Sorghum $\\rightarrow$ Fallow`, dangling `[trend-gdd]`, jargon about growing degree days, modeled stress confused with failures or future failure dates, and an expandable streamed thought process.

**Observed after (local streaming fixture, not live AI):** `Sorghum → Fallow → Sorghum`, a named `NASA POWER (fixture)` evidence reference, separate heading/list blocks, and an explicit unavailable-source label for intentionally unresolved `[soil]`. Pending DOM text is exactly the localized generic thinking string. Deliberately injected private reasoning is absent during pending, partial-answer and finished states. The controlled fixture says stress is modeled, not observed failure or a forecast, and does not establish fewer bad years. This fixture wording is test input, not evidence of model quality.

TDD reproduced failures before fixes: the original renderer exposed `PRIVATE MODEL THOUGHTS`; arrow/citation/mixed-list tests failed; the server originally forwarded reasoning chunks; unsupported bad-year claims were originally accepted; output-limit notices were originally missing. All regression tests now pass.

## Executed checks

| Check | Actual result | Raw evidence |
|---|---|---|
| `npm test` | 132 files passed, 6 skipped; **968 tests passed, 15 skipped** | [tests.txt](tests.txt) |
| `npm run typecheck` | exit 0; worker, test and web TypeScript projects | [typecheck.txt](typecheck.txt) |
| `npm run build` | exit 0, production Vite bundle | [build.txt](build.txt) |
| `node scripts/verify-sprout-stream.mjs` | 4 browser runs passed: EN/ES/KO desktop and EN 390px mobile | [browser.json](browser.json), [browser-run.txt](browser-run.txt) |
| Real HTTP SSE events | controlled pending → partial answer → output-limit finish into the production bundle | [stream-events.json](stream-events.json) |
| Browser checks | no page errors or horizontal page overflow in tested viewports; source URL preserved | [browser.json](browser.json) |

Screenshots are visibly marked **LOCAL STREAM FIXTURE — NO LIVE AI**:

- [EN pending](en-1280-thinking.png), [EN answer](en-1280-answer.png)
- [ES pending](es-1280-thinking.png), [ES answer](es-1280-answer.png)
- [KO pending](ko-1280-thinking.png), [KO answer](ko-1280-answer.png)
- [Mobile pending](en-390-thinking.png), [Mobile answer](en-390-answer.png)

The fixture server serves `dist/web`, sends actual chunked SSE through `DefaultChatTransport`/`useChat`, and closes itself. It is not a mocked React render or a `route.fulfill` response. External browser requests are blocked. It intentionally injects reasoning (client defense), raw notation, returned and missing citations, and an output-limit finish. The fixture answer stays English in all runs to distinguish generated text from localized UI chrome.

## Remaining gaps / warnings

- **No live model generation was exercised.** The checked-in offline config intentionally has no Workers AI binding; the actual Scout route without bindings returns `configured: false` and HTTP 503 (tested). No credentials were read/copied and no remote AI endpoint was called. Live language quality, tool selection and model adherence still need an authorized live-generation check after integration. Prompt guidance is not a general semantic proof; the deterministic explanation guard covers the tested risk-reduction forms, not every possible paraphrase or arbitrary chat claim.
- Shared rendering was exercised through the full Scout page. The coordinator's newer, uncommitted Explore/planning-context integration was deliberately untouched and was not part of this build. The only `FieldAssistantContent.tsx` change is its submitted-state label; integration should preserve that line while taking the coordinator's context changes.
- Existing happy-dom tests log incidental `ECONNREFUSED localhost:3000` errors while passing. The production build retains the existing >500 kB chunk-size warning. Raw logs retain these warnings rather than hiding them.
- A stale sidebar test still expected the old rotation-planner name even though the branch base renamed it Field Watch; its assertion now matches the current base. Generated snapshot line-ending-only changes were discarded.
