# SoilSense

**Compare crop rotations, understand the trade-offs, and keep watching the weather after the browser closes.**

NASA Space Apps Challenge 2026 · *Field Shift: Adapting Farms with NASA Data*

**Live demo:** <TEAM_URL — fill in before submission>

[Submission checklist](docs/SUBMISSION.md) · [How it works](docs/HOW-IT-WORKS.md) · [Validation](docs/VALIDATION.md) · [Open work](https://github.com/jzeng151/soilsense/issues/54)

## The farmer's decision

What should this field grow over the next three seasons, given its weather history, soil, water supply and the farmer's priorities? SoilSense compares the current crop pattern with three ranked alternatives, explains the assumptions, and puts supporting observations beside the calculation. It is decision support to discuss with an extension adviser—not a planting prescription or a weather forecast.

The submission walkthrough focuses on the **irrigated center-pivot demo in Finney County, Kansas, in the High Plains** (38.1095, -100.706). Other selectable examples are Story County, Iowa; Champaign County, Illinois; and Lancaster County, Nebraska, all marked rain-fed in [MapPicker.tsx](web/src/components/MapPicker.tsx). The planner accepts contiguous-US points; that does not imply that every evidence product is available everywhere. Selection is a point, not a surveyed field boundary.

## What is built

| Capability | What it does today |
|---|---|
| Map → plan | Looks up soil and recent satellite crop history, calculates climate indicators and trends, and compares feasible three-year crop/cover sequences with the current pattern. Crops include corn, soybean, winter wheat, oats, alfalfa, sorghum and conditionally fallow. |
| Farmer choices | Profit, soil health, lower-risk or balanced priority; rain-only, limited or full irrigation; confirmation of recent crops; and up to two optional goals: water conservation, nitrogen fixation, erosion control, organic matter or forage/hay market. Goal proxies can change scores, but do not guarantee a new winner. |
| Farmer measurements | Optional soil-test pH/AWC/texture inputs replace relevant map assumptions; harvest records provide bounded local yield calibration. Organic matter is displayed but has no direct yield-response function. Drafts stay in that browser; personalized plan responses bypass the public plan cache/log. [Details](docs/farmer-measurements.md). |
| Reasons and research | Deterministic facts/reasons plus optional AI summaries, with retrieved passages, source links and applicability. Vectorize and Workers AI support retrieval; unavailable research does not prevent ranking. |
| Sprout chat | Tool-using field Q&A with plan, research and public-demo field-memory citations. The backend/API still calls this `scout`; citation support is not a guarantee that every generated statement is correct. [Citation contract](docs/CHAT_CITATIONS.md). |
| Historical views | A 2022 drought replay and other bad-year comparisons, plus a separate hot-year exposure selector and historical event catalog. The hot-year card does not rerank plans or simulate new yields. [Scenario scope](docs/HISTORICAL-SCENARIOS.md). |
| Field Watch | Hourly background checks saved in D1, plus per-field Agents SDK Durable Objects for a roughly 45-second demo check, weekly checks and confirmed crop-window checks. The agent persists schedules/results independently of an open browser. Kansas district drought outlook is separately labeled context, not a new field alert rule. [Outlook limits](docs/FIELDWATCH-OUTLOOK.md). |
| Evidence cards | IMERG rainfall comparison, SMAP moisture, MODIS NDVI, regional GRACE plus nearby KGS wells, US Drought Monitor, wind exposure, corn GDD timing and sourced economic illustrations—with gaps, dates and scale limitations. |
| Access and explanation | English/Spanish interface, glossary definitions and a How-it-works page. Twilio supports a conversational phone agent and a keypad/voice IVR with plan, reasons and SMS; account credentials and a configured number are required. |
| Research intake | Admin upload or allowlisted URL intake → R2 notification → Queue → durable extraction/chunking Workflow → human review → embeddings/Vectorize. Source/licensing/applicability metadata must be reviewed before new passages become searchable. [Pipeline and setup](docs/INGEST.md). |

**Implemented is not the same as verified on the judging account.** Code and committed local/source checks support the features above. The team must verify the final deployment, public access, real scheduled persistence, model availability and ingestion delivery before submission; see the [unticked checklist](docs/SUBMISSION.md).

### What actually changes a ranking?

The [pure TypeScript engine](src/engine/plan.ts) uses historical climate and trend calculations, SSURGO available water capacity/pH/drainage, CDL or farmer-confirmed crop history, crop/cover rules, farmer-chosen water mode, yield/price/cost/nitrogen assumptions, priority weights, optional goal bonuses and farmer soil/yield inputs. Optional NASS yields and prices can replace/calibrate regional defaults.

The climate path is **NASA POWER, optionally averaged with Daymet rain and temperature when coverage qualifies**, not POWER alone. See [service.ts](src/worker/service.ts) and [climate.ts](src/engine/climate.ts). Trends are applied only where the engine's significance test qualifies them. The scores are climate fit, reliability, soil health and indicative profit—not four independently observed outcomes. [Goal bonuses](docs/farmer-goals.md) use candidate-relative normalization and add at most +0.1 to the priority subtotal.

**IMERG, SMAP, MODIS, GRACE/KGS, USDM, wind exposure and the separate GDD card are context only: they do not change rotation rankings.** Neither do retrieved research passages, AI prose or the separate sourced budget illustration. Field Watch has its own deterministic rain/root-zone-wetness rule; district outlook and research notes do not override it.

## Data sources and credits

Product versions below are those preserved in code or committed evidence, not inferred versions for an unpinned live service. Observation date, retrieval date and replay year are different. Missing data are not observations of zero.

| Source / product | Actual role and scope | Credit / provenance |
|---|---|---|
| [NASA POWER daily API](https://power.larc.nasa.gov/), MERRA-2-based meteorology; default 1991–last completed year | Ranking climate/trends and replay; recent rain/GWETROOT for Field Watch; separate wind and timing diagnostics. About 0.5° × 0.625° meteorological grid, not a field sensor. | NASA Langley Research Center POWER Project, funded through NASA Earth Science Division. Committed recent probes report Daily API v2.10.3; older rolling caches do not preserve every API release. [Source references](kansas-crop-rotation/reports/REFERENCES.md). |
| [NASA Daymet, ORNL DAAC](https://daymet.ornl.gov/web_services), 1 km daily single-pixel service | Optional rain/Tmin/Tmax average with POWER on the ranking path; POWER-only fallback. Service release is not pinned by this adapter. | Credit NASA Daymet / ORNL DAAC; [adapter](src/worker/data/daymet.ts). A 1 km grid is not a field weather station. |
| [USDA NRCS SSURGO / Soil Data Access](https://sdmdataaccess.sc.egov.usda.gov/) | Map soil AWC, pH and drainage affect engine suitability/water storage; other attributes provide evidence. Separate susceptibility attributes support wind screening. | USDA NRCS SSURGO; live survey data, no single frozen survey edition claimed. [Soil client](src/worker/data/soil.ts). |
| [USDA NASS Cropland Data Layer](https://nassgeodata.gmu.edu/CropScape/), annual crop labels | Recent point crop history informs baseline/sequence; farmer confirmation takes precedence. Not a field-boundary or current-season survey. | USDA NASS CDL; requested years and returned labels are retained by the [client](src/worker/data/cdl.ts). |
| [GPM IMERG](https://disc.gsfc.nasa.gov/), GPM_3IMERGDL / GPM_3IMERGDF V07 | Cached 14-day Late rainfall comparison; separate Final historical path. Four allowlisted demo cells; operator warming with Earthdata token. UTC IMERG and LST POWER day boundaries are not equivalent. No rank/alert effect. | NASA GES DISC; Huffman, Stocker, Bolvin, Nelkin and Tan; [Late DOI](https://doi.org/10.5067/GPM/IMERGDL/DAY/07), [Final DOI](https://doi.org/10.5067/GPM/IMERGDF/DAY/07). Live-verified record is Late V07C, not a verified historical Final bundle. [Access/provenance](docs/imerg-access.md). |
| [SMAP SPL4SMGP v008](https://doi.org/10.5067/T5RUATAQREF8), 9 km, 3-hourly L4 | Finney-only July 1 seasonal-window illustration for 2015–2025; surface/root-zone modeled-assimilated moisture. Not fresh daily monitoring or a full-season replay. | NASA / NSIDC DAAC / SMAP L4 science team, Reichle et al. (2025), version-specific DOI citation. [Artifact, QA and baseline](docs/smap-evidence.md). |
| [MODIS MOD13Q1.061](https://doi.org/10.5067/MODIS/MOD13Q1.061), 250 m nominal, 16-day NDVI via [ORNL TESViS](https://modis.ornl.gov/) | QA-screened historical point vegetation series, fetched separately from plan construction. Low NDVI does not establish bare soil or residue cover. | NASA MODIS / LP DAAC and ORNL DAAC subset service; retain product DOI and snapshot provenance. [QA and warming](docs/MODIS.md). |
| [GRACE/GRACE-FO JPL RL06.3Mv04 CRI](https://doi.org/10.5067/TEMSC-3JC634), TELLUS_GRAC-GRFO_MASCON_CRI_GRID_RL06.3_V4 | Finney regional total-water-storage anomaly, 2015–2025 artifact. Approximately 3° mascon support despite 0.5° display grid; regional context only. | NASA/JPL, NASA/DLR GRACE, NASA/GFZ GRACE-FO, PO.DAAC; Watkins et al. (2015), Wiese et al. (2016). Native file's conflicting `product_version` attribute is preserved in [provenance](docs/grace-wells-evidence.md), not silently corrected. |
| [Kansas Geological Survey WIZARD](https://geohydro.kgs.ku.edu/geohydro/wizard/) | Three nearby Finney point-well records alongside matched-month GRACE trends; not the selected field's well or saturated thickness. | KGS and contributing measurement agencies; retain the [WIZARD disclaimer](https://geohydro.kgs.ku.edu/geohydro/wizard/wizarddisclaim.html). No blanket commercial licence claim. [Selection/method](docs/grace-wells-evidence.md). |
| [U.S. Drought Monitor](https://droughtmonitor.unl.edu/), weekly county/district area statistics | Regional context, replay timeline and Kansas outlook qualification; not a field-level truth label or ranking input. | Jointly produced by NDMC at University of Nebraska–Lincoln, USDA, NOAA and NASA; map courtesy of NDMC. Preserve the full [official credit line](https://droughtmonitor.unl.edu/About/Permission.aspx), also transcribed in [references](kansas-crop-rotation/reports/REFERENCES.md). |
| [USDA NASS Quick Stats](https://quickstats.nass.usda.gov/api), optional key | County/district yields and received prices affect calibration/economics; corn-progress district/state fallback is a regional timing plausibility check only. Suppressed values stay absent. | USDA NASS; [live verification and practice distinctions](docs/NASS-VERIFICATION.md). A regional survey is not this field's harvest or growth stage. |
| [USDA RMA Cause of Loss](https://www.rma.usda.gov/tools-reports/summary-of-business/cause-loss) | Bundled county insurance-loss context explaining historical bad years; not a ranking predictor. | USDA Risk Management Agency; [client](src/worker/data/rma.ts). |
| [OpenET](https://etdata.org/), monthly Ensemble, nominal 30 m; optional key | Satellite/model ET comparison for the water-model diagnostic, not irrigation pumping measurement or a ranking input. Adapter does not pin a product release. | OpenET and contributing models; NASA/USGS Landsat basis; preserve returned provenance. [Client](src/worker/data/openet.ts). |
| [K-State 2025 Northeast Kansas budgets](https://agmanager.info/farm-budgets/historical-farm-budget-projections/2025-historical-budget-projections-non-irrigated), published Nov 20, 2024; ISU FM1712/A1-20 Jan 2026 | K-State corn/soybean direct-margin illustration; ISU comparison/audit. These dated references do **not** replace engine defaults or constitute a rotation trial. | Credit listed authors/K-State Agricultural Economics and Chad Hart/ISU; [source editions, pages and hashes](docs/economics-sources.md). |
| [K-State / SARE research](docs/RESEARCH.md) and reviewed ingested documents | Verbatim passages for explanations/chat, not field facts or automatic yield parameters. Research yields are plot/treatment observations. | Schlegel & Bond (2021), K-State *Corn Rootworms*, Magdoff & van Es (2021), plus per-document credits/licences. Unknown corpus licences remain unknown; educational reproduction permission is not a blanket licence. |
| [Kansas pipeline](kansas-crop-rotation/), Varun Pisharody | Separate district-model/K-State rain-fed **Second opinion** and Field Watch district outlook, read from published R2 JSON with a labeled bundled fallback. Does not replace the main engine's ranking or run inside the Worker. | Data analysis: Varun Pisharody; scripts: Claude (Anthropic AI), as disclosed in the folder. POWER, USDM, NASS, FAO and K-State references are in its [reference list](kansas-crop-rotation/reports/REFERENCES.md); entries marked `[VERIFY]` remain unverified. [Upstream pipeline](https://github.com/vp822-arch/spaceapps2026-kansas-crop-rotation). |
| [NASA GIBS](https://gibs.earthdata.nasa.gov/), [USGS imagery](https://www.usgs.gov/programs/national-geospatial-program/national-map), [OpenStreetMap](https://www.openstreetmap.org/copyright) | Map basemaps; optional MODIS NDVI/SMAP overlays use the map's fixed demonstration date, not live measurements. | NASA GIBS/MODIS Terra, USGS The National Map, © OpenStreetMap contributors (ODbL); visible map attribution in MapPicker. |
| [FCC Area API](https://geo.fcc.gov/api/census/), [U.S. Census geocoder](https://geocoding.geo.census.gov/geocoder/), [Zippopotam.us](https://zippopotam.us/) | County lookup with Census fallback / approximate ZIP-to-location lookup, not field boundary detection. | Credit FCC / U.S. Census Bureau / Zippopotam.us; [geographic client](src/worker/data/geo.ts). |

POWER acknowledgement: “The data was obtained from National Aeronautics and Space Administration (NASA) Langley Research Center's Prediction Of Worldwide Energy Resources (POWER) project funded through the NASA Earth Science Division.” Data/API-version dates should match the actual artifact used, not today's date by default.

## Cloudflare product map

These are wired in [wrangler.jsonc](wrangler.jsonc) and exercised by code, not a list of proposed sponsor integrations. Account-specific runtime proof is still a submission check.

| Product / binding | Job and fallback boundary |
|---|---|
| Workers | Hono API, deterministic planner, Twilio handlers and upstream data adapters. Core runtime. |
| Workers Static Assets / `ASSETS` | Built React dashboard and bundled assets, including county-loss files. |
| D1 / `DB` | Source/plan caches, logs, hourly Field Watch results, refresh and document metadata. Persistence requires migrations; this is not optional for the full demo. |
| Durable Objects + Agents SDK / `FIELD_AGENT`, `LIVE_ROOM` | Per-field SQLite schedules and stored checks; live event room for calls/checks. Scheduled checks are unavailable without the agent binding. |
| Workflows / `POWER_REFRESH`, `DOC_INGEST` | Durable daily POWER snapshot refresh and document extraction/review/indexing. Missing bindings disable those pipelines, not the pure planner. |
| R2 / `EVIDENCE`, `DOCS` | Content-addressed refresh evidence, source documents, extracted text and manifests. Required for the corresponding pipelines. |
| Queues / `soilsense-docs` consumer | R2 object-create events start deduplicated ingestion Workflows. `DOC_QUEUE` is also declared as a producer; no extra producer-driven feature is claimed. |
| Vectorize / `RESEARCH_INDEX` | Reviewed research and scoped public-demo memory retrieval. Optional for ranking; research/memory return unavailable without it. |
| Workers AI / `AI` | Embeddings, generated explanations/chat and PDF-to-text conversion. Optional for deterministic plans; PDF extraction/indexing need their AI path. |
| AI Gateway, through `AI` | Shared model routing, bounded fallbacks and metadata-only instrumentation; `AI_GATEWAY_ID` defaults to `default`. This uses the AI binding, not a separate fictitious Gateway binding. [Operations](docs/AI-GATEWAY.md). |
| Cron Triggers | `17 * * * *`: hourly Field Watch → D1. `43 5 * * *`: daily POWER refresh Workflow. These are separate from the agent's weekly/crop-window schedules. |
| Rate Limiting / `SCOUT_LIMITER` | Public Sprout request limit, 20/IP/minute, alongside application limits; not an account-wide spending guarantee. |

**Browser Rendering is not enabled in the committed config.** URL intake has optional rendering code, but the `BROWSER` binding is commented out; HTML fetch/parser fallback is the configured path. It is not counted as a used sponsor product. Managed AI Search, Hyperdrive and a live Tiger Cloud integration are not claimed.

### Architecture

```text
React map/planner + Sprout ─┐
Twilio Voice / SMS ─────────┴─> Worker API ─> deterministic rotation engine
                                  │              ↑ POWER (+ optional Daymet), SSURGO, CDL,
                                  │                optional NASS, farmer inputs
                                  ├─ D1: caches, logs, hourly checks, metadata
                                  ├─ AI Gateway → Workers AI / optional Gemini
                                  │       └─ Vectorize + reviewed passage text/citations
                                  ├─ FIELD_AGENT: SQLite + Agents SDK schedules/results
                                  └─ LIVE_ROOM: live events
Hourly cron ─> Field Watch ─> D1        Daily cron ─> POWER_REFRESH ─> R2 + D1
Document → R2 notification → Queue → DOC_INGEST → human review → AI embeddings → Vectorize
Kansas pipeline (separate Python project) → published R2 JSON → Second opinion / district context
```

## Run locally

Use Node **22+** (also required by the MODIS prefetch helper) and npm.

```bash
npm ci
cp .dev.vars.example .dev.vars
# Local testing only: keep TWILIO_VALIDATE=false. Never commit .dev.vars.
npm run db:migrate:local
npm run dev:offline
```

Open `http://127.0.0.1:8787` and choose a demo farm. **Offline means no Cloudflare AI login, not no internet:** the planner still fetches public source APIs. `/api/ask` falls back to fact matching; research/AI chat can be unavailable. Finney's committed SMAP/GRACE artifacts do not need runtime Earthdata credentials.

For dashboard hot reload, keep that Worker running and start `npm run dev:web`; open `http://localhost:5173`. For real Workers AI, run `npx wrangler login` then `npm run dev` with the configured account/resources. Optional keys include `NASS_API_KEY`, `OPENET_API_KEY`, `GEMINI_API_KEY`; IMERG warming requires `EARTHDATA_TOKEN` plus accepted upstream terms. Local R2 writes do not automatically reproduce account bucket notifications; follow [INGEST.md](docs/INGEST.md), not a claim that upload alone proves ingestion.

### Tests

On source base `4f44678` (the code used for this documentation PR), a fresh `npm ci` and `npm test` on November 15, 2026 returned **562 passed, 11 skipped; 72 test files passed, 3 skipped (75 files total)**. The skipped opt-in checks are not passing live-provider validation. Documentation-only edits do not change the tested code.

```bash
npm test
npm run typecheck
npm run build
```

Browser checks have separate setup and scope: [E2E](docs/E2E.md), [accessibility](docs/ACCESSIBILITY.md). Unit/mock success does not verify real account resources or make the app WCAG-certified.

## Deploy to the team's Cloudflare account

Deployment is an operator action, not part of this documentation change. The committed database ID belongs to an existing setup: create/configure resources in the **intended account**, never assume a teammate's resources are already there.

```bash
npx wrangler login
npx wrangler d1 create fieldshift
# Put the returned database_id in wrangler.jsonc and wrangler.offline.jsonc.
npx wrangler r2 bucket create soilsense-evidence
npx wrangler r2 bucket create soilsense-docs
npx wrangler queues create soilsense-docs
npx wrangler r2 bucket notification create soilsense-docs --event-type object-create --queue soilsense-docs --prefix docs/
bash scripts/setup-research-index.sh
# Creates soilsense-research-v1 and its required crop/corpus metadata indexes.
npm run db:migrate:remote
npx wrangler secret put ADMIN_TOKEN
# If using the phone line:
npx wrangler secret put TWILIO_ACCOUNT_SID
npx wrangler secret put TWILIO_AUTH_TOKEN
npx wrangler secret put TWILIO_FROM_NUMBER
# Optional integrations, only when used:
npx wrangler secret put NASS_API_KEY
# Likewise OPENET_API_KEY, GEMINI_API_KEY, EARTHDATA_TOKEN as needed.
npm run deploy
node scripts/prefetch-demo.mjs https://soilsense.<your-subdomain>.workers.dev
```

The deploy exports both Workflow classes and applies the configured Durable Object migrations. Review every binding in `wrangler.jsonc`; bucket/queue/index creation is not proof the end-to-end pipeline works. Set admin secrets out of band and follow [research ingest/snapshot setup](docs/RESEARCH.md), [document setup](docs/INGEST.md), [MODIS warming](docs/MODIS.md), [IMERG warming](docs/imerg-access.md) and [Gateway checks](docs/AI-GATEWAY.md). Do not present uncaptured saved summaries or unverified delivery as live output.

For Twilio, configure **Voice → A call comes in → POST** `https://<team-host>/voice/incoming`. Set `PUBLIC_BASE_URL` when needed to match the URL used for signature validation; production `TWILIO_VALIDATE` stays true. Conversational voice uses `/voice-agent`; `/voice/ivr` retains the guided language → ZIP → crop → irrigation → priority → plan/menu flow. SMS is part of that guided flow, not a claim of a production consented alert service.

## API reference

Main route definitions: [index.ts](src/worker/index.ts) and [routes/](src/worker/routes/). Paths below are grouped where they share a resource; JSON contracts are in [shared types](src/shared/types.ts). Public planner/chat routes currently do not require sign-in; admin operations do.

| Method | Path | Purpose / input |
|---|---|---|
| GET | `/healthz`, `/api/health` | Runtime/binding status, not upstream correctness. |
| GET | `/api/field` | `lat`, `lon`: county, mapped soil, crop history. |
| POST | `/api/plan` | `lat`, `lon`, `water: rain\|limited\|full`, `priority: balanced\|profit\|soil\|risk`; optional `recentCrops`, `goals`, `soilTest`, `yieldRecords`, `language: en\|es`. Legacy `irrigated` accepted. Returns facts, scores, comparisons and assumptions. |
| POST | `/api/ask` | `question`, `planLabel`, `summary`, `facts[]`: short fact-based Q&A/fallback. |
| GET / POST | `/api/scout/status`, `/api/scout/chat` | Sprout model status / streaming tool-using chat. |
| GET | `/api/second-opinion?fips=…`, `/api/field-memory/:field/:vector` | Kansas county model / retained public-demo memory citation. |
| GET / POST | `/api/research/status`, `/corpus`, `/query`, `/explain`, `/ingest` (all under `/api/research`) | GET status/corpus; POST query/explain; POST ingest requires admin bearer. |
| GET / POST | `/api/fieldwatch/latest`, `/runs`, `/run` | GET latest/history; POST manual check with cooldown. |
| GET / POST / PUT | `/api/fieldwatch/agent/options`, `/agent/:field/check`, `/agent/:field/runs`, `/agent/:field/watch` | GET options/runs/watch; POST live/replay check; PUT weekly/crop watch settings. |
| GET / POST | `/api/refresh/status`, `/snapshots/:id`, `/snapshots/:id/bundle`, `/run` (under `/api/refresh`) | GET refresh evidence; POST admin refresh trigger. |
| GET / POST | `/api/vegetation`, `/api/vegetation/prefetch` | GET `lat`, `lon`, `year`; POST same query to admin-only warm route. |
| GET / POST | `/api/imerg/comparison/:field`, `/api/imerg/warm/:field` | GET cached comparison; POST admin warm for allowlisted field, `end`, `stream: late\|final`. |
| GET | `/api/smap`, `/api/smap/catalog`, `/api/groundwater` | Finney evidence / optional SMAP catalog diagnostic; `lat`, `lon`, and SMAP `year`. Catalog availability is not measurement retrieval. |
| GET | `/api/usdm/category`, `/timeline`, `/replay` (under `/api/usdm`) | County FIPS/date or year-window regional drought context. |
| GET / POST | `/api/historical-scenarios`, `/api/crop-timing`, `/api/wind-screen`, `/api/economics-assumptions` | GET historical exposure, corn timing and economic audit (`state`); POST coordinates and rotation calendars to wind screen. |
| GET / POST | `/api/docs`, `/api/docs/:docId`, `/upload`, `/from-url`, `/:docId/review` (under `/api/docs`) | GET list/details; POST upload/URL/review requires admin bearer. Acceptance is not completed indexing. |
| POST / GET | `/api/auth/signup`, `/login`, `/logout`, `/me` (under `/api/auth`) | POST session operations; GET current user. Not Auth0. |
| GET / PUT / POST | `/api/admin/*` | Protected voice settings, call history, live-demo controls and `/api/admin/ai-usage` (admin bearer). See [admin routes](src/worker/routes/admin.ts). |
| GET | `/api/logs`, `/api/live/status`, `/api/live/events`, `/api/live/ws` | Plan/call logs (set `ADMIN_TOKEN`), live-mode status/events and WebSocket. |
| POST / GET | `/voice/*`, `/voice-agent` | POST signed Twilio webhooks; GET ConversationRelay WebSocket. |

## Validation: useful evidence, not certification

[VALIDATION.md](docs/VALIDATION.md) records a frozen-model county-yield check: **43 county–crop cases in 13 previously untuned counties**, mean Pearson correlation **0.41** between modeled and detrended annual yield variation; 33/43 beat a rainfall-only comparison. These are recorded results, not rerun by this README change. Story and Finney were development counties, so their stronger in-sample scores are not independent evidence. The same document records one Finney OpenET comparison (2016–2024); one site does not establish universal water-model accuracy.

The separate [Kansas Field Watch backtest](docs/validation/KANSAS-BACKTEST.md) recalculates supplied recorded candidates: 5,166 district-weeks, including 2,583 growing-season weeks. It is **exploratory retrospective analysis**, not a live evaluation of the current rule/source pipeline. The original generator commit and some retrieval metadata are unknown; external raw inputs are required for full reproduction. USDM regional labels share related inputs, fixed normals can include future information for early years, and district-year dependence limits uncertainty estimates. No optimal threshold, field drought-onset accuracy or irrigation benefit is established. Neither document reports professional agronomist approval; expert and non-team usability review remain open.

## Assumptions and limits

- **Water supply is a farmer-chosen scenario.** Limited mode assumes 254 mm (about 10 inches) per crop season; full mode assumes modeled demand can be supplied. Neither is linked to Ogallala/High Plains aquifer saturated thickness, aquifer decline, well capacity, legal allocation or water rights. Pumping cost uses a fixed **$8/inch/acre rate**, not dynamic energy prices or well lift. The old flat $110/acre wording is not the current calculation; see [rotation.ts](src/engine/rotation.ts).
- **Regional storage is not local supply.** GRACE includes soil/surface water and snow as well as groundwater. Nearby KGS wells and regional GRACE trends cannot predict this field's pumping capacity or certify irrigation feasibility.
- **Scale matters.** NASA POWER is roughly 50 km gridded weather; Daymet, SMAP, MODIS and GRACE also have native spatial/temporal support, not field sensors. Neither the map pin nor a coarse observation proves field-wide conditions.
- **Replay is not a forecast.** Historical drought/hot-year displays describe past weather or modeled sensitivity. Rankings may remain unchanged; 2022 need not be the most stressed year. Corn GDD dates depend on assumed planting/hybrid and are not observed stages; the corn method is not a wheat/sorghum model.
- **Economics are indicative.** Many costs, potential yields, rotation effects and soil-health proxies remain demonstration defaults. NASS price/yield data are regional, and the sourced K-State illustration excludes rent/capital recovery. No live AMS market feed or audited farm profit is claimed.
- **Research is not field performance.** Plot yields depend on site, irrigation treatment, management and year. They are not the farmer's expected harvest and do not automatically set the engine's yield parameters.
- **Moisture/greenness are not treatments.** SMAP is modeled/assimilated regional moisture, MODIS is historical vegetation context, and wind is an exposure screen—not measured soil loss. **SIF (solar-induced fluorescence) is not used.**
- **Prototype scope.** Demo watches are bounded public examples, not private account-owned monitoring for arbitrary fields. Browser-only farmer drafts are not account-backed records. Production consented messaging, full ownership/deletion, adviser review and broader dataset coverage must not be inferred from the UI.

## AI-use disclosure

The planner, scores, trend tests, replay calculations and Field Watch status are deterministic code—not model-generated recommendations. AI generates conversational answers and optional short explanations; embeddings support cited retrieval, and Workers AI `toMarkdown` converts PDFs before human review. Models do not author trusted source metadata or substitute missing observations.

- Configured generation: **`@cf/google/gemma-4-26b-a4b-it`**, including `AI_MODEL` in Wrangler and the Sprout default. Shared generation fallback: **`@cf/meta/llama-3.3-70b-instruct-fp8-fast`**.
- Embedding: **`@cf/baai/bge-base-en-v1.5`**, CLS pooling, 768 dimensions; no silent embedding-model fallback.
- Optional Google Gemini: **`gemini-3.8-flash`** for Sprout fallback (`GEMINI_MODEL`); phone default **`gemini-3.5-flash-lite`** (`VOICE_MODEL`). `SCOUT_MODEL` can alter Sprout ordering; `AI_MODEL` can override the configured ask model. These are code defaults, not proof every model is available on the judging account.
- AI Gateway routes model transports. Explanation JSON/fact/citation checks reject invalid output; matching saved evidence or deterministic templates/fact matching provide explicit fallbacks. This stricter explanation validator is not a blanket guarantee for all chat prose. See [RESEARCH.md](docs/RESEARCH.md) and [AI-GATEWAY.md](docs/AI-GATEWAY.md).
- **AI coding assistants were used in development**, including code/documentation work. The Kansas pipeline explicitly credits Claude-written scripts and Varun Pisharody's analysis. No AI-generated dataset is presented here as NASA observation. The team must finish the submission's generated-text/code/data/media disclosure and any required watermarking; media provenance has not been fully audited by this README change.

## Built versus open work

The capability list above describes committed implementation, with runtime qualifications—not every checked-in idea. [Issue #54](https://github.com/jzeng151/soilsense/issues/54) tracks the broader PRD/MVP/stretch backlog; recorded or open stretch work is **not counted as used**. In particular, do not infer live WIMAS/water-right coupling, SIF, a full HLS/residue pipeline, OpenET-driven ranking, managed AI Search, Hyperdrive, production messaging/account isolation or completed expert validation from that tracker.

### Project layout and software credits

`src/engine/`: pure calculations · `src/worker/`: API, data, agent, research, ingestion and refresh · `web/`: React UI · `data/`: bounded evidence artifacts · `migrations/`: D1 · `test/`: Vitest/fixtures · `kansas-crop-rotation/`: separate Python pipeline · `docs/`: methods, source audits and operational checks.

Core libraries/services include React, Leaflet, Vite, TypeScript, Hono, Cloudflare Agents, AI SDK and Google/Workers AI adapters, Zod, htmlparser2, marked, Twilio, Vitest, Playwright and axe-core. Exact JS dependencies are in [package.json](package.json)/[package-lock.json](package-lock.json); Python dependencies and additional credits are in the [Kansas README](kansas-crop-rotation/README.md). Third-party data, research and map rights remain with their providers; the project's **MIT** code licence does not relicense them.
