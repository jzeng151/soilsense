# AI Gateway routing and operations

All model transports live in `src/worker/lib/ai.ts`. This uses the existing Workers
AI binding; no new resources, migration, provider account id or Gateway token are
required. `AI_GATEWAY_ID` selects the gateway; the default is `default`, which
Cloudflare creates on the first authenticated request. Gemini still requires the
existing optional `GEMINI_API_KEY`, but never bypasses Gateway when configured.
Without the AI binding, Gemini is unavailable rather than sent directly to Google.

## Call inventory and budgets

| Feature / consumer | Transport / model | Deadline per attempt | Fallback |
| --- | --- | --- | --- |
| Research retrieval, Scout/phone research tool | Workers AI, `@cf/baai/bge-base-en-v1.5`, CLS, 768 dimensions | 25 s; chat retrieval cancels at 12 s | No model substitution; existing saved/unavailable result |
| Field Watch optional research note | Same pinned embedding model | 1.5 s outer retrieval budget, propagated cancellation | Unavailable research note; never influences rule v2 |
| Curated corpus and approved-document ingestion | Same pinned embedding model | 25 s | Fail closed; Workflow controls retries |
| Research explanation and `/api/ask` | `@cf/google/gemma-4-26b-a4b-it` | 12 s per attempt, at most 24 s | One `@cf/meta/llama-3.3-70b-instruct-fp8-fast` attempt, then existing saved/template/facts response |
| Scout | Gemma, then Llama, then optional Gemini (`gemini-3.8-flash`) | 25 s to first content per candidate; 60 s per model invocation including stream consumption | Only before first text/reasoning/tool call; configured SCOUT_MODEL retains priority |
| Phone | Existing Gemini (`gemini-3.5-flash-lite`), then Gemma, then Llama; Workers only if no Gemini key | Same stream bounds | Only before first content/tool call; existing phone error/handoff behavior otherwise |
| PDF conversion | `AI.toMarkdown` with `ConversionRequestOptions.gateway` | 60 s | No model substitution; Workflow retry/review |

Overrides remain supported; retired Workers AI ids in `research/config.ts` are
rejected before dispatch. Explanation fallback output goes through the **same**
fact/schema/citation validation, with the actual answering model recorded in the
response and saved snapshot. No fallback changes scores or index compatibility.
The Llama fallback is listed in the [current model catalog](https://developers.cloudflare.com/workers-ai/models/llama-3.3-70b-instruct-fp8-fast/)
and is not in the project's retirement list. Availability on the actual account is
not proven by a mocked test.

SDK automatic retries are disabled; Gateway maxAttempts is one. Chat/phone retain
an eight-step tool budget and cap each output at 1,200 tokens; explanation/ask keep
400/300 tokens. Existing route rate limits remain in place. These are per-turn
bounds, not an account-wide spend/concurrency guarantee. Set account/Gateway
rate and cost controls in the dashboard for a hard aggregate budget.

## Cache isolation

Only immutable reviewed corpus/document embedding inputs enable Gateway cache,
with a 24-hour TTL. The native Gateway request-content key includes the model and
preprocessed input (text and pooling); do not replace it with a broad custom key.
Embedding preprocessing/model/index versions remain pinned in `research/config.ts`.
A model/preprocessing change requires re-embedding a versioned index, never an
embedding fallback. Query embeddings, PDF conversion and all user-specific
generation explicitly set `skipCache: true`, regardless of gateway defaults.
Existing saved research/explanation records continue to use their versioned
comparison keys and are labelled saved, not fresh Gateway cache results.

## Observability and privacy

Each attempt has metadata `feature`, `model`, `cachePolicy`, `correlationId` and
`fallback`. Nonstreaming generation fallback attempts share a correlation id.
Streaming invocations have individual ids; never infer one id covers a whole
multi-step agent turn. The same per-attempt id is in structured Worker `ai-call`
logs and persisted counters. Timed-out binding work is signalled for cancellation;
PDF conversion has no cancellation signal in its typed API, so its local timeout
bounds waiting but cannot guarantee upstream compute stops.

The helper enables metadata logs but sends `cf-aig-collect-log-payload: false`
for every transport, so prompt/completion bodies are not persisted in Gateway.
No prompt, contact, phone number, field coordinate or raw provider error is added
to the new counters. Review existing Logpush exports separately: per-request
logging headers do not control Logpush. Restrict Gateway access and set your
account's log-retention policy before production traffic.

### View Cloudflare logs

1. Open Cloudflare dashboard → **AI → AI Gateway**, select `AI_GATEWAY_ID` (or
   `default`; it appears after the first authenticated model request).
2. Open **Logs**, filter by model/status and custom metadata `feature` or
   `correlationId`. A failed primary and its fallback should share the id for
   nonstreaming generation. Request/response payloads should be absent.
3. Open **Analytics** for request count, errors, latency, token usage, cost and cache
   hits. Select a deterministic ingestion call to inspect cache behavior, not chat.
4. Compare an id with the structured Worker `ai-call` event. Do not copy prompts
   or secrets into issue reports. A controlled timeout should show a failed app
   attempt; Cloudflare's own status/timing may differ if upstream completed later.

Local mocks prove options, cancellation, fallback and persistence; they do **not**
prove a real account request appears in Cloudflare logs. No live deployment or
paid model call was made for this change. Operator verification after deployment
should include one benign request, a controlled failure, and identical corpus
embedding calls for a cache hit. Do not simulate failures against farmer calls.

### Settings usage panel and API

Settings → **Call history** → **AI Gateway usage** accepts an `ADMIN_TOKEN` held
only in component memory. A normal team session is intentionally insufficient.
`GET /api/admin/ai-usage` requires `Authorization: Bearer <ADMIN_TOKEN>` and sets
`Cache-Control: no-store`.

The existing D1 `cache` table stores metadata-only `ai-usage:<random-id>` records
with a 24-hour logical retention window. Each new record deletes expired usage
records; idle expired rows can remain physically present until another call or
normal cache cleanup, but are never included in the API. No new migration is
needed, avoiding parallel migration-number collisions. Reads aggregate at most
the latest 5,000 attempts across requests/isolates: per-feature calls, transport
failures/cancellations, fallback attempts and discrete lower-median (p50) elapsed
milliseconds. Stream latency includes completion, not just time-to-first-token.
Application citation/schema rejection after a successful transport is not a
provider failure. Fallback count is attempted fallbacks, not successful recoveries.

Without D1 the API explicitly reports persistent counters unavailable; with a
missing/broken table it returns 503. Logging failure must not fail a model request;
the helper emits a sanitized warning instead. Counters are not billing data and
do not count Gateway cache hits separately (use Cloudflare Analytics for that).

## Architecture

Keep direct Vectorize retrieval and the reviewed corpus: it preserves explicit
embedding versions, crop filters, verbatim passage ids and document approval.
Managed AI Search remains an optional alternative, not a new dependency or a
claimed integration. See `docs/RESEARCH.md` for the existing retrieval contract.

References: [Workers binding](https://developers.cloudflare.com/ai-gateway/usage/worker-binding-methods/),
[Gemini native provider](https://developers.cloudflare.com/ai-gateway/usage/providers/google-ai-studio/),
[metadata-only logging](https://developers.cloudflare.com/ai-gateway/observability/logging/).
