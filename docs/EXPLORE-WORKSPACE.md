# Explore planning and Field Watch monitoring

Explore (`#/explore`) is the default home. A selected location/field opens **Rotation options**, which embeds the existing `App` planning flow: history, irrigation, priority, constraints, prices, measurements, three rotation choices and current practice. A single selected CSB field seeds its centroid and editable crop history. Multiple outlined fields can be registered for monitoring; when multiple fields are selected, an explicit **Field to plan** selector is required before planning. Sprout receives only the active planning field's ID.

The **Sprout** tab receives that exact `PlanResponse`, including the original request, facts and assumptions. It does not make an independent automatic `/api/plan` request. Until a plan is built, or when edited inputs invalidate it, the tab shows a prompt to build/rebuild it and does not send plan-related messages. The tabs remain mounted so switching/closing does not throw away the in-session form state. Changing the selected location/field resets the planning session. Settings are not yet persisted across leaving Explore/reloading.

`#/field-watch` is monitoring-only: saved browser field capabilities and their existing per-field watch toggles/check/run history, plus the existing four-demo-farm Field Watch. The old `#/planner` URL aliases monitoring. Planning no longer lives on this route. Monitoring rules/cadences have not been changed by this UI refactor; the multi-risk design is separate.

Guest chat synchronization, recent-chat persistence and LLM formatting are separate pending PRs. Do not claim that tab-to-full-chat streaming is solved by this patch.

## Verification

- Full suite: 958 passed, 15 skipped; typecheck/build pass.
- Updated actual browser smoke: landing language cycle, complete Finney planning flow including comparison/evidence cards, admin gate: 3 pass; live AI and replay opt-ins skipped.
- Additional local built-browser check: no plan request on selection; full-irrigation request sent exactly once with history/priorities; Sprout displayed the same returned soybean → corn → soybean and made no second request. Field Watch had no planner water controls.
- Six axe WCAG 2.0–2.2 A/AA scans: globe landing, input form and Field Watch at 1440/390 px: no violations, no document overflow, no page errors. Automated scans are not a complete conformance/legal assessment.
- Review regressions: deferred old plan response is aborted and rejected even if the mock API ignores cancellation; multiple-selection requires an explicit active field; Start over → Cancel → reopen preserves the existing plan without an extra request; edited water invalidates Sprout and disables its composer; Field Watch has exactly one main landmark.
- ESO source, licence, transformation details and hashes: `web/public/images/ESO-MILKY-WAY-LICENSE.md`. Decorative CSS background, visible credit and CC BY 4.0 link, only on globe landing.

Still unmerged/unreleased pending owner UI review.
