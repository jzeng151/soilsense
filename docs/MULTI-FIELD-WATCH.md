# Multi-field Field Watch (F3)

## Enablement and compatibility

This feature is dark unless the Worker environment has `FIELDS_ENABLED` set to the exact string `on`. The committed Wrangler configuration intentionally does not enable it. No new binding or D1 migration is required: the existing optional `FIELD_AGENT` SQLite Durable Object namespace hosts both field agents and one fixed `__registry` instance.

`GET /api/fields/status` is the shared discovery endpoint. My Fields renders only after it returns `enabled: true`; errors and disabled responses render no panel. The existing demo Field Watch stays available, and demo options/check/runs/watch responses are unchanged by the flag. Registered-field routes return JSON 404 when disabled. The map boundary selection from F1 (`selectedFields`) feeds My Fields directly.

Local test (never a deployment):

```sh
npm run build
npx wrangler dev --port 8803 --var FIELDS_ENABLED:on
```

Run the server in a separate terminal or background process. Local D1 must already have the existing application's migrations for successful live-data checks.

## Capability IDs, not accounts

`POST /api/fields/register` accepts `{ field: FieldBoundary, watchedCrop }` and returns HTTP 201 with `{ agentFieldId, capability }` (both values are the same ID). IDs are `u_` plus 32 URL-safe characters, generated with `crypto.getRandomValues` from **192 random bits**. There is no login, ownership verification, public registered-field listing, or recovery service. Treat the entire ID as a bearer secret: anyone who obtains it can read its results, change recurrence, or delete it.

The browser stores only `{ agentFieldId, name, fieldId, acres }` in `localStorage["soilsense.myfields.v1"]`. Clearing browser data loses access; it does not cancel a server watch. Names remain local. IDs occur in API paths and can therefore occur in browser history/devtools or infrastructure access logs: avoid sharing logs, screenshots with IDs, or the storage value. Browser extensions, XSS, shared browsers and copied storage are outside this no-account model. Do not put private/sensitive data into it. TLS is required outside localhost.

Registration pins the submitted CSB identifier, centroid, polygon SHA-256 and watched crop in that field's agent. Later requests cannot supply replacement geometry or crop; register another capability to change the crop. An optional `calendar` override is **not supported** in this first version: sending it returns 400 rather than silently ignoring it. Existing built-in crop reference windows apply. CSB labels are synthetic crop boundaries, **not ownership parcels**. A client-supplied CSB identifier is not a proof that geometry is an authentic USDA record.

Unknown or malformed registered IDs get 404. A registry lookup happens **before** opening the requested field's Durable Object; forged IDs do not allocate per-ID agent storage. Registered IDs must also be confirmed in their own agent. The fixed registry may be opened for a lookup. No registered capability or run is broadcast to the public live room or indexed into demo-only field memory.

## Limits and bounded state

- Registration bodies are streamed with a **100,000-byte** limit, including chunked requests.
- Geometry must have 1–16 closed rings, at most **2,000 total vertices**, and finite longitude/latitude pairs within the CONUS bounding box (-125…-66 longitude, 24…50 latitude).
- Each ring's longitude/latitude extent is at most one degree. Computed net spherical area must be between 40 m² (approximately 0.01 acre) and 40,468,564 m² (10,000 acres). The centroid must be inside the outer ring and outside holes. These are resource/extent guards, not complete polygon-topology or authenticity validation.
- A fixed registry DO enforces **1,000 lifetime reservations**, globally for this deployment. Reservation and count are synchronous SQL before any await. Deletion marks a reservation inactive; failed provisioning also consumes a reservation. Neither frees the lifetime budget. This intentionally bounds total per-field object creation rather than merely active watches. Raising/resetting it is an operator/code decision, not a public endpoint.
- Registration, deletion and registered-field mutations share the existing `SCOUT_LIMITER` binding with `fields:<IP>` keys (separate from chat keys). The current config is **20 mutations per IP per minute**. Reads are not charged to this mutation allowance.
- Without that binding, an explicitly **best-effort per-isolate** bucket permits a burst of five mutations, refilling one token every 12 seconds. It resets on isolate restart/eviction and is not a distributed abuse guarantee. The bounded in-memory map is cleared above 5,000 keys. Cloudflare's trusted `CF-Connecting-IP` header supplies the key; local requests without it share `local`.
- The UI keeps at most **10 fields per browser**, an advisory/client-side limit, not an account/server quota. Clearing storage, another browser, or direct requests can bypass it.
- Each field has at most one pending manual check and a one-minute reuse/cooldown after the latest scheduled check. Registered fields retain approximately **100 recent runs**, with pending records protected by retention pruning. Demo retention behavior is unchanged.

These caps reduce accidental/unbounded work; this is not a billing ceiling or a substitute for deployment-level Cloudflare limits and monitoring.

## Per-field behavior and deletion

Existing `/api/fieldwatch/agent/:field/check`, `/runs`, and `/watch` routes accept either an unchanged demo `WATCHED_FIELDS` ID or an enabled, registered `u_` capability. Each registration has independent SQLite settings, pending checks, run history and scheduler jobs. The chosen crop is pinned at registration. Recurrence starts **off**. The existing watch toggle enables weekly checks **and the existing crop-window opening check**; it is not an alert notification/subscription service.

My Fields supports scheduling a live check, status/last result, recurrence on/off, and removal with confirmation. It polls saved fields every 15 seconds while mounted. Native buttons/selects support keyboard operation and wrap on phone widths. EN/ES strings are supplied; other language support follows the shared translation fallback.

`DELETE /api/fields/:agentFieldId` revokes the agent registration, cancels all scheduler jobs, clears application run/settings/config tables, and marks the registry entry inactive. The UI forgets the entry only after success or an explicit `Unknown field.` 404, not on a flag-disabled 404 or a transient error. Stale callbacks and late provider writes cannot restore deleted application rows. Scheduler writes also recheck registration and cancel a newly-created job if deletion overlapped its await. Deletion is logical application-data removal, not a promise of immediate erasure of infrastructure logs/backups or SDK-internal tables. Shared NASA weather caches are deliberately retained.

Turning the feature flag off blocks capability access and makes registered callbacks no-ops; it does not delete registrations. Re-enabling a deployment does not promise to recreate jobs that fired while disabled: toggle the watch off/on after enabling to re-arm it.

## Shared weather cells and interpretation

Nearby fields can share the same roughly 50 km NASA POWER weather cell, so distinct field histories may have identical weather inputs/results. The result is a coarse grid-cell watch, not field-scale sensing, parcel ownership, or a diagnosis of on-farm soil moisture. Configured centroid/crop isolation does not increase NASA's spatial resolution. Registered fields do not infer a county/state or Kansas district signal from an arbitrary centroid.

## Verification and reproducibility

```sh
npm run typecheck
npx vitest run test/multi-field-watch.test.ts web/src/components/MyFieldsPanel.test.ts
npm test
npm run build
# With the local flag-on Worker already running on port 8803:
MULTIWATCH_ARTIFACTS="<absolute scratch directory>" node scripts/multiwatch-smoke.mjs
```

The local-only smoke refuses non-loopback hosts/other ports. It uses explicitly constructed test polygons (not sourced USDA records), creates two real agents, reads back pinned crops and separate scheduled histories, waits for both real scheduler callbacks, enables/disables recurrence, rejects a forged ID, then deletes its registrations and verifies subsequent reads return 404. It scans the built My Fields panel with installed axe-core for selected WCAG 2/2.1 A/AA rules in EN/ES at 375 px, exercises Tab/Space, and writes full audit JSON, panel screenshots and a summary outside the repository. It waits for actual UI readiness, not network-idle (the app polls continuously).

Unit/integration tests cover geometry guards, entropy format/uniqueness, independence, forged IDs without per-ID allocation, flag-off demo compatibility, lifetime cap, binding/fallback rate limiting, pinned crop, deletion and a deletion/watch-update race. The tests use the production agent class with actual in-memory SQLite and a scheduler/DO transport adapter; only the local smoke verifies the real SDK scheduler/runtime. Zero selected axe violations plus this keyboard smoke is not a claim of full WCAG conformance or screen-reader user testing. Remote deployment behavior is not verified by these local checks.
