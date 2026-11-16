# Submission handoff — team checklist

**No item below is marked complete by this documentation change.** Track [issue #11](https://github.com/jzeng151/soilsense/issues/11), the actual judging deployment and portal confirmation separately from code completion.

## Fill before submission

- [ ] Replace README's `**Live demo:** <TEAM_URL — fill in before submission>` with the teammate-account judging URL; do not substitute another account's test deployment.
- [ ] Record registered event, applicable local timezone and UTC offset: **<EVENT / TIMEZONE>**.
- [ ] Record local presentation deadline/format and any Local Lead updates: **<LOCAL DEADLINE / FORMAT>**. If registered for NYC, issue #11 records slides due **noon November 15**, presentations from 12:30 p.m., five minutes plus two minutes Q&A; confirm applicability and any changed instructions rather than assuming the global deadline replaces this.
- [ ] Finish **Submit for Judging by Sunday, November 15, 2026, 11:59 p.m. in the applicable local event timezone**. Internal team target: **9 p.m. local**, a buffer, not an organizer rule.
- [ ] Recheck the current [official event page](https://www.spaceappschallenge.org/2026/), [Project Submission Guide](https://www.spaceappschallenge.org/resources/project-submission-guide/) and Local Lead instructions. Confirm subtitle wording, eligibility consequences and editing/locking rules; issue #11 explicitly leaves these unresolved.

## Public access and required artifact

- [ ] In a fresh **signed-out** browser, open the judged app, [public repository](https://github.com/jzeng151/soilsense), submitted demo, slides and every supporting link. No access request, account creation or login should be needed for the judging flow.
- [ ] Supply the required global artifact: **video ≤30 seconds OR presentation ≤7 slides**, including title and closing slides. Artifact URL: **<SHORT VIDEO OR DECK URL>**. A longer backup does not replace it. [Format rule provenance](https://github.com/nasa/spaceapps/discussions/1947).
- [ ] Check actual duration/slide count and public playback. Use English captions for video as the team's accessibility default; verify any mandatory subtitle requirement separately.
- [ ] Prepare a labeled backup recording/static snapshot: **<BACKUP URL / SNAPSHOT ID / GENERATION TIME>**.
- [ ] Have a non-author teammate follow the links and explain the farmer decision from README/demo; record feedback without claiming a formal user study.

## Honest walkthrough and Cloudflare proof

- [ ] Show Finney County's High Plains irrigated field, its water/priority choices, the current pattern and three ranked alternatives with visible assumptions.
- [ ] Show the historical replay with its actual **changed or unchanged** result. Do not force 2022 to win a stress ranking or call a replay a forecast.
- [ ] Show a scheduled agent check, close the browser, reopen and read the persisted result. Retain run ID, schedule time, completion time and deployed response. A labeled elapsed-time jump is allowed for a roughly 45-second demo wait; do not imply instant execution.
- [ ] Verify weekly/crop-window settings and the exact configured account's Durable Object/Agents behavior, rather than presenting a mock or code path as deployment proof.
- [ ] Put the six-line Cloudflare map below on a sponsor slide. If included in the global deck, it counts toward the **seven-slide** cap. Demonstrate platform behavior beyond hosting, not just product logos.
- [ ] Confirm bindings and real account checks: D1 persistence; agent schedules; Workflow status; R2 evidence; real R2 notification → Queue → document Workflow; review/indexing; real Workers AI/Vectorize retrieval; Gateway logs. An upload 202, mock test or deployment success alone is not end-to-end proof.
- [ ] Count **only configured, called services**. Browser Rendering is commented out and excluded; HTML fetch/parser fallback is used. Do not count managed AI Search, Hyperdrive or historical Tiger Cloud work as current integrations.
- [ ] Label cached evidence, saved passages/explanations, snapshots, historical replay, fallbacks, recordings and controlled delivery explicitly, with scenario/snapshot and generation/retrieval date. Do not call saved output a fresh live model answer.
- [ ] Confirm IMERG cache dates/stream, MODIS warm caches, Finney-only SMAP/GRACE scope, unavailable states and context-versus-ranking labels on the judging URL. Use the README's linked operational docs; do not warm remote resources without authorization.

## Sources, AI and media disclosure

- [ ] Copy the README's actual source roles/versions/credits into submission references, including NASA POWER acknowledgement, product DOIs, USDM official credit, KGS disclaimer, research permissions and map credits.
- [ ] Credit Varun Pisharody's Kansas analysis, Claude-written pipeline scripts, actual libraries/services and any other data/library/image contributors; resolve or explicitly retain `[VERIFY]` source entries instead of promoting them to verified claims.
- [ ] Complete the submission's **AI-use field / designated disclosure location** with explanation/chat generation, embeddings, PDF conversion, AI-assisted code/documentation, generated text/data/media and where each was used. Confirm actual deployed model IDs and overrides against README.
- [ ] Audit generated assets and media provenance: **<MEDIA INVENTORY / CREDITS>**. Do not infer from README that no generated media exist.
- [ ] Apply visible **AI-generated** watermarks to AI-generated images/videos; acknowledge AI-generated audio/code/data in descriptive text and metadata as applicable. [AI rule provenance](https://github.com/nasa/spaceapps/discussions/1849).
- [ ] Ensure AI-generated content does not use, contain or modify NASA branding/design elements (logos, flags, mission identifiers). Assess genuinely sourced NASA imagery under its own attribution/media rules, not as generated content.
- [ ] Preserve limits: farmer-chosen water mode is not aquifer/well/right-derived supply; GRACE is regional context; SIF is unused; economics are indicative; plot yields are not field forecasts; validation is exploratory with no agronomist approval.
- [ ] Link [issue #54](https://github.com/jzeng151/soilsense/issues/54) as open work, not evidence that stretch features were used.

## Submit and read back

- [ ] Complete the official portal workflow; record **<SUBMISSION URL / CONFIRMATION / TIMESTAMP / TIMEZONE>**.
- [ ] Record editing/locking restrictions actually shown by the portal; do not assume irreversible submission or automatic disqualification without verified wording.
- [ ] Read back the submitted project and recheck app/repository/artifact/reference links, public playback, AI disclosure and both applicable deadlines.

## Cloudflare product map — six lines for one slide

1. **Workers + Static Assets:** React UI, API, deterministic rotation engine and phone webhooks.
2. **D1:** source/plan caches, hourly checks, logs and document/refresh metadata.
3. **Durable Objects + Agents SDK:** per-field SQLite schedules/results and the live event room, beyond an open browser.
4. **Workflows + R2 + Queues:** durable POWER refresh; document storage → event-driven ingest → human review → index.
5. **Workers AI + Vectorize + AI Gateway:** cited retrieval, optional explanations/chat, PDF conversion and bounded model routing; deterministic plans remain available without AI.
6. **Cron Triggers + Rate Limiting:** hourly checks/daily refresh; public Sprout per-IP request cap. Browser Rendering is not enabled or counted.

This slide maps implemented code/configuration, not a blanket claim that the team has verified every service on the judging account. Fill the proof checklist before presenting it as live behavior.
