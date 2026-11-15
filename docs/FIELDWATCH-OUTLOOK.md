# Field Watch: Kansas district outlook

This is optional **context**, not another Dry/Watch/OK rule. Rule v2 and its
thresholds are unchanged. The new line appears separately below each hourly or
scheduled result, without opening its weather details.

- Read `alert`, `basis`, and `data_through` from Varun Pisharody's public
  `app_rotation_advice.json` (the existing Kansas source). Only Kansas county
  FIPS and `watch`/`warning` alerts qualify; `normal` is hidden.
- Use the existing county USDM client for the check date. A current `matched`
  or `latest` map with any D1–D4 county area means **drought likely to continue**.
  Otherwise (none/D0) say **possible drought onset (low confidence)**. This is
  county context, not evidence that the exact field is in a drought polygon.
- Missing, stale, failed or mismatched USDM context hides the outlook instead
  of treating unavailable observations as no drought. It never fails a weather
  check. Historical replays never fetch or display today's outlook.
- The expandable explanation cites
  [`model_report.md`](../kansas-crop-rotation/reports/model_report.md), including
  the logistic onset-only hit rate **0.17** and false-alarm ratio **0.47**.
  Districts approximate nine points, not official NASS district boundaries.
- No probability or percentage is displayed in this context or its county
  rotations card. The existing weather rule's own percentile explanations are
  unchanged.
- Only an explicit `dry-year` basis shows the K-State dry-year link. It opens a
  county-specific **Second opinion** card in place, without requiring a planner
  plan or accidentally linking to another selected county. Rotations are read
  from the existing `/api/second-opinion?fips=…` endpoint; its own data-through
  date and saved-copy indicator are displayed. No irrigation recommendation or
  model-agreement badge is inferred from a Field Watch result.

## Storage and compatibility

Agent checks (live, weekly, crop-window) save `districtOutlook` in the existing
SQLite run JSON. Hourly/manual D1 runs save it inside the existing `metrics`
JSON. Both retain model source/date, basis, situation and the USDM map/source
used at check time. Reading a completed run does not re-fetch or reclassify it.
Older records without context render normally; their old raw Kansas-alert
reason is not displayed alongside the new, qualified line. No migration or new
Cloudflare binding is required.

## Verification

Tests cover hiding, continuation/onset wording, percentage exclusion, all three
unchanged rule statuses, parser basis retention, optional-source failure,
Spanish rendering, weekly context, replay isolation, and fresh-`SqlRunStore`
SQLite read-back. The dry-year link is exercised with a constructed DOM fixture.

A built-app Chromium smoke check at 1280px and 320px used a clearly labelled
constructed hourly run (not live weather). The county Second opinion request
was unmocked. The expanded outlook/card had no horizontal overflow and zero
selected WCAG A/AA axe violations or incomplete checks (axe 4.14.0). This is
scoped component evidence, not an accessibility conformance claim.

Public-source checks returned HTTP 200: the model had data through 2026-11-09;
Finney was `normal` (therefore hidden), Allen was `watch` with a dry-year basis.
Allen's official USDM map valid 2026-11-10 had no D1+ area (onset wording).
Real deployed scheduling, storage and account-specific fetches still need a
post-deployment check by the team. No real deployment was performed.
