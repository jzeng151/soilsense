# CDL / IMERG test-Worker recovery (2026-11-15)

Target: `https://soilsense-jason.jason-zeng151.workers.dev`. Remote operations in this investigation were **read-only** (public GETs and one D1 SELECT). No deploy, migration, secret mutation or warm POST was performed.

## CDL findings

The earlier unavailable responses did **not** reproduce on this run: all four `/api/field` demo GETs returned ten years, 2016–2025. Elapsed seconds: Story 0.335, Champaign 0.381, Finney 0.081, Lancaster 0.099. These fast responses do not prove fresh upstream retrieval; they can be cached.

Direct terminal `curl --max-time 65 -w '\nstatus=%{http_code} seconds=%{time_total}\n'` probes to `https://nassgeodata.gmu.edu/axis2/services/CDLService/GetCDLValue`:

| query | status | seconds | observed result |
|---|---:|---:|---|
| `year=2025&x=647917.57&y=1918516.21` (Champaign) | 200 | 1.977 | code 5, Soybeans |
| `year=2025&x=-408559.26&y=1685215.80` (Finney) | 200 | 0.896 | code 205, Triticale |
| `year=2025&x=-46068.91&y=1968888.08` (Lancaster) | 200 | 0.880 | code 1, Corn |
| `year=2024&x=647917.57&y=1918516.21` | 200 | 0.886 | code 1, Corn |
| `year=2026&x=647917.57&y=1918516.21` | 500 | 0.108 | `Error: The year must be between 1997 and 2025.` |

The first observed body was:

```xml
<ns1:GetCDLValueResponse xmlns:ns1="http://cropscape.csiss.gmu.edu/CDLService/"><Result>{x: 647917.57, y: 1918516.21, value: 5, category: "Soybeans", color: "#267300"}</Result></ns1:GetCDLValueResponse>
```

The existing EPSG:5070 coordinates and parser work with these responses. `yearsFor` requests 2025 in November 2026, not the unpublished 2026 CDL. No evidence supports changing the projection or year selection.

**Confirmed failure-amplification defect:** `recentFailures["service"]` previously short-circuited *before* reading memory/D1. A single all-failed point hid every field's healthy cached history for ten minutes in that isolate. The regression test reproduces that sequence; the fix scopes the cooldown to the exact coordinate/year-window key, checks it only inside the cache loader, caps its size, and does not refresh its timestamp on suppressed calls. This explains how a transient failure can spread, but the trigger of the earlier incident cannot be proven from today's recovered upstream.

Additional hardening:

- Full-body timeout is now 20 seconds per attempt with one retry, not an 8-second headers-only deadline. Current observed upstream calls were below eight seconds; this is resilience, not a claim that timeout was the earlier trigger.
- Partial observations are labelled and never newly cached for 180 days (previously a 60%-complete window qualified). Existing cache keys/healthy entries are retained; already-written partial entries, if any, keep their previous expiry.
- If every live year fails, use a committed USDA CSB sequence **only for the polygon containing the point**, excluding holes. All four exact demo points are covered, with eight years (2018–2025). Label the fallback, polygon id, product vintage, retrieval date and source URL. Do not pick nearest centroids, invent 2016–2017, replace partial live years, or cache fallback under a live-CDL key. After cooldown a healthy live lookup wins again. Outside committed polygons, remain unavailable.

## IMERG findings and operator action

All four default historical Final comparison GETs (`end=2022-07-14`) and all four Late GETs ending `2026-11-13` returned unavailable. `/api/fieldwatch/latest` showed Story's data-through date `2026-11-12`: warming Nov 13 alone would not satisfy that card. Use each field's actual date, not today's date or the last NASA date.

Remote read-only D1 query:

```sh
npx wrangler d1 execute fieldshift --remote -c C:/Users/steve/Projects/soilsense/wrangler.me.jsonc --command "SELECT key, datetime(created_at/1000, 'unixepoch') AS created_utc, datetime(expires_at/1000, 'unixepoch') AS expires_utc FROM cache WHERE key LIKE 'imerg-comparison:%' ORDER BY key LIMIT 30;"
```

Result: **zero comparison rows**, `rows_written: 0`, `changed_db: false`. Thus this deployment's message is **not-yet-warmed**, not an observed expired row or proof of invalid Earthdata credentials. The previously verified local D1 data never populated remote D1. Public GETs intentionally cannot initiate retrieval.

See [imerg-demo-warm.md](imerg-demo-warm.md) for exact warming/read-back commands. No secret change or migration is indicated. The account's existing EARTHDATA_TOKEN is used server-side; only the admin bearer goes to the warm route.

Historical Final retention is extended from 30 to 365 days consistently for metadata, validated day points, subsets and comparisons. Late stays at one hour because revisions matter. Final retention is a versioned-cache policy, not a claim NASA can never reprocess a product. The new policy applies to new writes; it does not rewrite existing expiry timestamps. It does not fill an empty cache and never substitutes Final for a Late card.

## Verification scope

Local regression tests cover cross-field cache poisoning, memory/D1 precedence, non-sliding cooldown/recovery, the observed XML wrapper/fault, partial retry, a stalled HTTP-200 body, actual committed demo CSB coverage/year filtering, fallback-to-live recovery, and durable comparison reads after 31 days (Final available, Late expired) and 366 days (Final expired). The IMERG retention test uses explicitly synthetic rain and a D1-shaped test double, not additional NASA observations. Existing live NASA binary fixture tests still run in the full suite.

A local workerd instance on assigned port 8814 (offline config, fresh local D1 migrations) also returned Champaign's complete 2016–2025 live-CDL history via `/api/field` in 1.889 seconds; an unwarmed local Final comparison correctly remained unavailable. This exercised the modified Worker transport, not only mocked fetch tests.

After merging `origin/next` at `57b35d2`, typecheck and production build passed; the full suite passed **694 tests**, with **14 skipped** (101 passed files, six skipped). Existing test output included localhost:3000 connection diagnostics despite exit 0; the build retained its large-chunk warning.

No assertion here claims the modified Worker is deployed or that remote IMERG warming succeeded. Operator POST followed by exact public GET read-back is still required.
