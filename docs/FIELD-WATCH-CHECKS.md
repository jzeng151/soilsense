# Field Watch: selectable, per-field risk checks

**Status: design for review; no feature implementation or deployment.** Base inspected and refreshed: `origin/next` at `3029224` (Field Watch/POWER/crop files unchanged from initial inspection at `ac9db24`). Live evidence was requested from a terminal on November 15, 2026 Eastern / November 16 UTC, for **Finney, Kansas (38.1095, -100.706)**. See the [machine-readable evidence](evidence/field-watch-checks.json) for exact request URLs, retrieval times, response hashes, native units, sampled values and seven computed climatologies. Provider response time is not publication latency. No source was replaced by invented data.

## 1. Decision in brief

Use a **versioned registry of 15 independently selectable checks**, persisted in each field's Durable Object agent. Recommend a starting selection from the **union of field-climatology tags, confirmed crop windows and confirmed management**; explicit farmer on/off overrides win. Selection does not bypass applicability, missing-input or freshness requirements. A selected check may say “needs planting date” rather than claim Normal.

Start with dry spell, excessive wetness, crop-window heat, hot nights and spring/fall freeze using the POWER variables already downloaded. Add snow/cold and actual soil-temperature support next; offer hourly NWS alerts only with explicit consent. Irrigation-supply, ice, chilling and vegetation checks remain gated until their extra inputs or operational pipelines are ready. A scheduled check is an observation-based scouting screen, **not a weather forecast, diagnosis of damage, irrigation prescription, or substitute for official severe-weather warnings**.

**Snow insulates; an ice sheet is not the protective layer we want.** NDSU explains that snow insulates the crown-zone soil, whose temperature—not simply air temperature—controls winter-wheat survival [A4]. Iowa State identifies inadequate snow and sheets of ice as winter-injury risks for alfalfa [A5]. Keep `winterkill` (cold with inadequate snow) separate from `ice-encasement` (a potentially harmful ice sheet). Do not relabel snow-water equivalent as ice cover.

Long-term organic matter, soil structure and soil-health improvement stay in planner/soil-test evidence, not this watch catalog.

## 2. What exists, and what this changes

| Current implementation inspected | Proposed change, not implemented here |
|---|---|
| `src/worker/fieldwatch/rule.ts`: rule v2 uses 14-day `PRECTOTCORR` and 7-day mean `GWETROOT`, each against the same calendar window in at least 20 prior years. Watch: either percentile ≤30; Dry: both ≤20. | Preserve this as `dry-spell@2`; translate `ok/watch/dry/insufficient` to `Normal/Watch/Alert/Insufficient data` only at the new presentation boundary. Do not rewrite historical v2 runs. |
| Temperature feeds Hargreaves ET0 context, not v2 status. Kansas district outlook, IMERG and research notes are context only. | New checks explicitly declare which inputs affect their own result. Existing context cannot silently become a decision signal. |
| `agent.ts`, `agentCore.ts`, `watchCore.ts` persist runs/settings and schedule weekly/crop-window work. Recurrence is off by default; `WatchSettings` has one crop and one master enabled flag. Old callbacks carry settings versions. | Add independently enabled checks and their windows/cadences; keep master monitoring opt-in and stale-callback protection. Do not apply one heat window to every risk. |
| `run.ts` demo cron is `17 * * * *`; POWER refresh is `43 5 * * *` in `refresh/workflow.ts`. `refresh/snapshot.ts` retains 60 days and validates 4 variables: rain, Tmax, Tmin, root wetness. | Run daily-data checks only after a new accepted source snapshot, not hourly. An hourly demo wake-up may remain as a cheap “new snapshot?” dispatch during migration. NWS is the only proposed hourly provider poll. |
| Historical `data/power.ts` also fetches `T2M`; neither `SNODP`, `TS`, `GWETTOP` nor `WS2M` is in the current accepted four-variable refresh schema. | Version the snapshot schema when adding variables. One optional snow failure must not reject usable core weather. |
| `registration.ts` accepts CSB polygons/centroids and a supported `watchedCrop`; custom `calendar` currently rejects. Demo `crops` are labels, not confirmed current crops. | New season/management settings require an explicit registration/settings contract change. Preserve capability privacy and distinguish suggested demo crops from farmer confirmation. Fallow currently is not watchable; soil-exposure checks would require changing that guard. |

## 3. Live data feasibility and limits

### 3.1 POWER: verified parameters, not guessed soil variables

All requests used `community=AG`, `format=JSON`, explicit `time-standard=LST`, and the exact Finney requested point. A core request for **2026-10-01 through 2026-11-15** returned HTTP 200 in **0.632 s**. All six series had **46 labels, 43 valid days, and fill `-999` on November 13–15**; latest valid day was **November 12**. This is the observed three-date tail gap, not proof of a guaranteed refresh hour. Header sources were `GEOSIT, POWER`; daily API v2.10.3. Coarse native meteorology is 0.5° latitude × 0.625° longitude [D1]. The API point geometry reported latitude 38.109, longitude -100.706, elevation 858.35 m; it is not a field sensor location or surveyed elevation.

| Parameter / temporal level | Native unit and meaning verified from response | Observed values / gaps | Use and constraint |
|---|---|---|---|
| `T2M_MAX`, daily | `C`, maximum 2 m air temperature | Nov 12: 18.78; core valid range 13.38–33.73 | Heat; not canopy temperature or future heat. |
| `T2M_MIN`, daily | `C`, minimum 2 m air temperature | Nov 12: 6.61; core valid range 2.61–22.24 | Freeze and hot-night proxy; minimum does not establish exposure duration or overnight-only conditions. |
| `PRECTOTCORR`, daily | `mm/day`, corrected precipitation | Nov 12: genuine 0; core range 0–14.03 | Complete-day totals/windows; no subdaily intensity, no distinction between liquid rain and snow in a freeze sequence. |
| `GWETROOT`, daily | `1`, root-zone relative wetness | Nov 12: 0.38; core range 0.35–0.44 | Percentiles, not measured plant-available water or a pumping allocation. |
| `GWETTOP`, daily | `1`, surface relative wetness | Nov 12: 0.29; core range 0.21–0.53 | Optional surface corroboration; not needed for first too-wet release. |
| `WS2M`, daily | `m/s`, 2 m mean wind speed | Nov 12: 2.27; core range 1.18–6.22 | Exposure proxy, not gusts or wind at a published one-foot erosion threshold. |
| `SNODP`, daily | **`cm`**, snow depth | Jan 1–7: 7/7 valid, all 0; recent Nov 1–15: 12 valid, 3 missing, last Nov 12 =0 | The API really supports this parameter. Do not use native MERRA snow units from a different service; this AG response says cm. |
| `TS`, daily | **`C`, “Earth Skin Temperature”** | Jan 1–7: 7/7 valid, 4.05–9.01; recent Nov 1–15: 12 valid, 3 missing, last Nov 12 =11.9 | **Not soil temperature at planting depth.** Surface skin temperature or a T2M-derived estimate may be displayed only as a labelled proxy, not as a 2-inch measurement. |
| `T2M`, hourly | `C`, 2 m air temperature | Jan 1–3: 72/72 hours, -0.7–16.22; Nov 1–15: 360 labels, 288 valid, 72 missing, last Nov 12 23 LST | Chilling accumulation; daily Tmin/Tmax cannot reconstruct real chill hours. Hourly API v2.10.4 observed on January probe. |

NASA documents **2–3 days meteorology latency**, 5–7 days for solar, daily processing of GEOS-IT, and replacement by MERRA-2 months later [D1]. Run once after accepted refresh; do not promise that 05:43 UTC is NASA's release time. Re-pull a trailing revision window weekly and pin both original and revised runs. Keep solar out of these dependencies: Hargreaves uses temperature and extraterrestrial radiation, so solar lag need not gate it.

### 3.2 SMAP L4: actual current point values retrieved

Live CMR discovery selected **SPL4SMGP v008** granule `SMAP_L4_SM_gph_20261113T223000_Vv8013_001.h5` (CMR's service identifier has suffix `_u9loH5HD`). Its native interval is **Nov 13 21:00–Nov 14 00:00 UTC**. CMR `updated` was Nov 15 17:30:55 UTC. An authenticated OPeNDAP `.ascii` request returned actual data, HTTP 200 in **1.830 s**, not just a catalog hit. `.das` attributes were also retrieved.

| Native variable | Unit; support | Finney sample at row 310, column 849 |
|---|---|---:|
| `/Geophysical_Data/sm_surface` | `m3 m-3`; 0–5 cm | 0.218093 |
| `/Geophysical_Data/sm_rootzone` | `m3 m-3`; 0–100 cm | 0.256495 |
| `/Geophysical_Data/soil_temp_layer1` | `K`; layer 1 of the soil heat-diffusion model | 283.875 |
| `/Geophysical_Data/snow_mass` | `kg m-2`; snow water equivalent over land fraction | 0 |

Native cell center **38.0969, -100.69**, 9 km EASE-Grid 2.0; fill **-9999**. Product is **3-hour time averages**, eight slots/day, not “one satellite observation daily” [D2]. Observed latest-discovered interval end was approximately **50.4 hours** before the probe; catalog `updated` is not an independently measured first-publication time. Only one current slot was fetched here: **no claim of eight-slot daily completeness or continuous recent coverage**.

Use a daily acquisition job, one discovery plus up to eight one-cell subsets/day; share slots across snow/soil/moisture checks. Retain all slots and native interval bounds. Snow mass can indicate snow presence but is **not snow depth, ice thickness or a direct insulation rating** without a density model. Layer-1 temperature is not automatically wheat crown temperature or a farmer's 2-inch planting-depth thermometer. The existing `docs/smap-evidence.md` artifact is only Finney July 1 in 2015–2025; it does not provide this live pipeline or a 35-year baseline. Its snow/frozen moisture screen must **not** discard cold/snow samples needed by winterkill checks.

### 3.3 IMERG: live rain data, but context first

CMR discovered **GPM_3IMERGDL.07**, Late V07C, UTC day **2026-11-14**, native filename `3B-DAY-L.MS.MRG.3IMERG.20261114-S000000-E235959.V07C.nc4`. Authenticated legacy GES DISC constrained ASCII returned HTTP 200 in **7.457 s** with **3.485 mm/day**, **`precipitation_cnt=48`**, cell center **38.15, -100.75**, indices lon=792 / lat=1281. The DMR metadata was also retrieved. That is an actual fully sampled point day, not a metadata-only success. One day proves access, not a gap-free 14-day window.

Daily `precipitation` has unit **mm/day**; for 48 valid half-hours its numeric value is that UTC day's depth. `precipitation_cnt` is a sample count, not rain amount. A count other than 48 or fill remains missing. Documented Late minimum latency is about **14 h after daily closure**; at this probe the latest discovered day closed approximately **26.4 h** earlier. Final is months late and not a timely watch input [D3]. Existing `src/worker/imerg` has bounded DAP4 parsing/caching; use that for production, not a new ASCII parser. POWER LST and IMERG UTC days are **not equivalent intervals**. Keep IMERG corroboration separate until an explicitly versioned common-boundary rule is validated. Daily totals cannot identify erosive 30-minute intensity; a half-hour IMERG integration would be a separate design and was not verified here. Do not add hourly IMERG polling in this proposal.

### 3.4 Vegetation: actual MODIS CSV and HLS raster windows

- **MOD13Q1.061**, 250 m nominal, 16-day composite. ORNL `/dates` returned HTTP 200 in **6.873 s**, **614 dates**, latest **A2026289 = Oct 16, 2026**. `/subset` with `Accept: text/csv` returned HTTP 200 in **3.865 s** for one pixel and that latest composite. Native CSV explicitly identifies `.061`, tile `h10v05`, processing `2026307123846`. NDVI raw **2320**, scale **0.0001**, dimensionless **0.2320**; reliability **0**, detailed QA **2124**, pixel acquisition day **301 = Oct 28**. These pass the current adapter's good-land/cloud/snow/shadow masks. The composite starts Oct 16 and ends Oct 31; it is not an Oct 16 instantaneous observation. Latest listed composite start was about a month old at retrieval; pixel acquisition was older than two weeks. This is an observed availability gap, not a 16-day freshness guarantee [D4].
- **HLS L30 v2.0**, 30 m. A live point CMR query selected `HLS.L30.T14SLH.2026308T171916.v2.0`, acquisition **Nov 4 17:19 UTC**, CMR update Nov 7 01:21 UTC. Authenticated LP DAAC requests returned **303** to the verified host `d1nklfio7vscoe.cloudfront.net`; signed URLs and tokens were not saved. Actual 3×3 COG windows were read for **B04 red, B05 NIR and Fmask** with rasterio 1.4.3 / Python 3.12. Center row=2689, col=1681, EPSG:32614: red DN **1543**, NIR DN **2258**, Fmask **64** throughout 9/9 pixels. Reflectance scale 0.0001, zero offset; center NDVI **0.18810839**. Fmask bits 1–5 exclude cloud/adjacency/shadow/snow/water; 255 is fill; bits 6–7 together indicate high aerosol; 64 alone is not high aerosol [D5]. Timed band procedures: **3.001, 2.584, 2.456 s**; each includes several GDAL range requests, not one HTTP transfer. Decoded-window hashes are labelled separately from raw HTTP hashes in the evidence.
- HLS L30 scene age was about **11.38 days**; CMR acquisition-to-update interval about **56.03 h**. That is not a measured first-availability SLA, and this L30-only query does **not** establish the latest combined L30+S30 observation. NASA describes combined HLS sampling averaging 1.4 days, but cloud-free usable observations can be much less frequent [D5]. Neither a small point window nor 9/9 clear pixels proves whole-field coverage.

A greenness warning requires matched crop/phenology, QA and adequate historical/field support. **Low NDVI is not proof of bare soil, drought or missing residue.** Retain MODIS and HLS as separate series: no mixed-resolution percentile baseline, no assumed MODIS-to-HLS continuity. HLS point access is feasible; arbitrary-CSB extraction, field coverage and a production baseline remain unimplemented.

### 3.5 NWS: verified empty result and real alert shape

Terminal request:

```sh
curl --fail-with-body --max-time 30 \
  -H 'User-Agent: SoilSense-design-audit/1.0 (https://github.com/jzeng151/soilsense)' \
  -H 'Accept: application/geo+json' \
  'https://api.weather.gov/alerts/active?point=38.1095,-100.706'
```

HTTP **200**, **0.247 s**, `Content-Type: application/geo+json`, `Cache-Control: public, max-age=5, s-maxage=5`. Body keys: `@context,type,features,title,updated`; `type=FeatureCollection`, **`features=[]`**, `updated=2026-11-16T02:19:31+00:00`. Empty is a successful observation of **no active point alerts**, not insufficient data. It does not establish the absence of every hazard.

Kansas-wide results were also empty. To verify populated schema without pretending Finney had an alert, a **separately labelled `area=CA` request** returned 26 features, including a **Freeze Watch** with `geometry:null`. Its properties include `id,event,status,messageType,severity,certainty,urgency,sent,effective,onset,expires,ends,headline,description,instruction,geocode,affectedZones,references`. Preserve null geometry; zone/county products are valid. Use the provider's point filter rather than dropping alerts with no polygon [D6]. An exploratory `limit=1` query returned **400**; the evidence records that invalid-query failure and the corrected query, not a provider outage.

NWS requires an identifying **User-Agent**; contact URL/email is recommended. The documented rate limit is **not public**, so do not invent requests/minute. Documentation says limit errors can typically clear in about five seconds; obey `Retry-After` when supplied, use exponential backoff/jitter, conditional requests where supported, central concurrency limits, and provider cache headers. The observed 5-second cache header is not permission to hammer every field every five seconds. Proposed polling is **hourly, opted-in fields only**. Empty cached results expire normally; a failed poll never becomes “all clear.” Hourly polling can miss or delay short-fuse warnings: explicitly direct farmers to NOAA Weather Radio / official mobile alerts for life safety. Delivery channels and faster polling, if ever desired, need a separate user decision.

## 4. Common rule contract

Each selected check produces `{checkId, checkVersion, status, observedThrough, window, reasons, metrics, missing, sources, inputHash}`. The only risk statuses are **Normal / Watch / Alert / Insufficient data**. Separate applicability is `active / out-of-season / needs-configuration / unsupported`; disabled and out-of-season checks have no risk verdict, never an invented Normal.

- For every rule below, **Normal means complete, fresh required inputs and neither Watch nor Alert condition**. It means “screen not triggered,” not absence of farm risk. Evaluate Alert before Watch.
- Unless a check states an explicitly safe partial-result exception, a missing/invalid required day, hour, input, unit, stage, or baseline makes it **Insufficient data**. Preserve genuine zero, negative temperature and native fill separately; no interpolation, missing-as-zero, cross-provider backfill, or silent fallback to stale days.
- New daily weather screens use the most recent **complete required window with endpoint no more than five days old** (demonstration freshness setting). Show its dates and a “delayed observations” label. Do not search backward to find a hazardous event and call it current. `dry-spell@2` retains its existing 21-day search and existing recurring-run 10-day freshness gate for compatibility; a later harmonization is a separate version change. Optional context never gates a check.
- Percentile ranks use `(below + half of ties)/N ×100`, the same calendar-window labels in prior **complete** years, at least **20** years, excluding current/replay year. Preserve baseline revision/hash and tie rounding policy. For new checks compare unrounded ranks; legacy v2 preserves its existing rounding. February 29 mapping and cross-year season bounds must be pinned; do not silently double-count shifted dates.
- Crop-specific evaluation uses **farmer-confirmed crop and stage/window**. Planner alternatives do not change a planted field's watch. A reference calendar may be explicitly accepted as an **estimated demonstration window**, never presented as observed phenology. Wheat spring stages, orchard bloom and harvesting/maturity are not reliably established by one fixed national month range.
- Exposure conditions are **not diagnoses**. Air-temperature minima do not prove two-hour crown/canopy exposure; wetness does not prove ponding; rain/thaw does not prove an ice sheet; estimated ET0 is not actual crop ET.
- For later NWS runs, require a successful current poll or a still-valid cache result; mark **Insufficient data after 90 minutes since last success** (demonstration staleness policy). Display last success and pending retry even before that limit. Never let a previously expired warning persist as current Alert.

## 5. Check registry catalog and exact proposed rules

**Every status mapping, window length and persistence counter below is a demonstration setting unless explicitly identified as an extension threshold.** Extension support for a biological mechanism does not validate our coarse-grid proxy or prove damage. These are starting settings for agronomist review, not farm operating instructions. The “cost” references resolve to §6; all weather cadences mean daily **after new accepted POWER data**, not “once per field per provider per check.”

### 01 — `dry-spell@2` — abnormal dryness

- **Applies:** all planted crops in their water-use season; winter wheat also establishment/green-up. Fallow may opt in for soil-water context once fallow registration is supported. Irrigated fields still benefit from weather exposure monitoring, but the model does not observe farmer irrigation.
- **Inputs / rule:** complete 14-day rain percentile `pR`, complete latest 7-day `GWETROOT` percentile `pS`, each with ≥20 historical windows. **Alert** iff both ≤20; **Watch** iff either ≤30; otherwise Normal. Missing soil permits at most rain-only Watch and explicitly “soil unconfirmed”; missing rain percentile gives Insufficient data. Preserve the existing v2 behavior, including its separate root-window date.
- **Source:** USDM example percentile bands, D0 20.01–30 and D1 10.01–20 [A1]. **Our two-variable AND/OR rule and 14/7-day windows are demonstration settings, not a USDM designation or agronomic injury threshold.**
- **Cadence / cost:** daily; P-core, Q35. Water balance, district outlook, IMERG and research remain context.

### 02 — `too-wet@1` — excessive wetness / planting-delay exposure

- **Applies:** all crops with vulnerable roots/seedlings; priority for corn/soybean spring planting, fall wheat establishment and alfalfa on wet ground. Field drainage/tile information improves relevance but cannot be inferred from a county.
- **Inputs / rule:** `pR7` = complete 7-day rain percentile; `pS3` = complete 3-day root-wetness percentile. **Watch** if either ≥80. **Alert** if both ≥90 at each of two consecutive complete daily endpoints. Missing either series/baseline or the persistence endpoint => Insufficient data, not confirmed waterlogging. Optionally show `GWETTOP` and IMERG separately; they are not first-release dependencies. All numeric screen settings are **demonstration settings**.
- **Agronomic source:** Iowa State notes oxygen approaching zero after 48 h of actual submergence and sharply reduced survival after roughly four days, with temperature/stage dependence [A2]. **Two days of high modeled wetness do not establish 48 h submergence.** Label “wetness/planting-delay exposure; check trafficability and ponding,” never “safe to plant” or “crop drowned.”
- **Cadence / cost:** daily; P-core, Q35; zero new provider requests when core is warm.

### 03 — `irrigation-gap@1` — demand versus deliverable supply

- **Applies:** **confirmed irrigated** crops in active water use; particularly Finney corn and Central Valley orchards. Not applicable to a rain-fed field. Selectable but **needs configuration** until management inputs exist.
- **Inputs / rule:** complete daily Tmax/Tmin/rain for a trailing 7-day accounting window; farmer-confirmed crop Kc/root depth, initial root-zone depletion and dated irrigation; soil available water capacity; deliverable **net** irrigation depth over the next 7 days, constrained by verified well/pump capacity, irrigated area, efficiency and any known legal limit. Use a documented soil-water balance to obtain end-window depletion `D` and total available water `TAW`. **Watch** if `D/TAW ≥0.35`; **Alert** if `D/TAW ≥0.50` and declared 7-day deliverable net supply is less than water required to return below the 0.50 level after a **labelled repeat-of-last-7-days demand scenario**. This scenario is not a forecast. No supply/initialization/Kc => Insufficient data, never aquifer-derived supply.
- **Accounting definition:** `ETc[t] = Kc[stage,t] × ET0[t]`; `D[t] = clamp(D[t−1] + ETc[t] − Peff[t] − Inet[t], 0, TAW)`, all depths in mm over the same field area. `Peff` and net irrigation must come from an approved calibration or explicitly accepted demonstration assumptions; without one, remain Insufficient data. For the repeat-last-seven-days scenario, `requiredNet = max(0, D[end] + sum(ETc − Peff over the repeated seven days) − 0.50×TAW)`, with a positive safety margin configured if the farmer wants strictly below 50%. Compare declared deliverable net depth with this requirement, not gross pumping volume. Unrecorded runoff, drainage, capillary rise, rainfall phase and irrigation are model uncertainty, not observed zero.
- **Source:** Nebraska recommends irrigating near 35% depletion to stay above 50% available-water depletion during the main season, allowing more late-season depletion [A3]. Applying those thresholds beyond its corn/soy context, the seven-day supply comparison, effective-rain/runoff assumptions, constant-Kc fallback and any use for orchards are **demonstration settings requiring calibration**. Reject unsupported crop coefficients rather than borrow a corn value.
- **Boundaries:** POWER relative wetness is not `D/TAW`; SMAP volumetric water requires field capacity/wilting-point calibration. KGS aquifer thickness, GRACE anomalies and a district decline trend do not determine this week's pumpable millimeters or legal allocation.
- **Cadence / cost:** daily after weather or dated farmer-input revision; P-core + private inputs, Q60. No live well/API integration promised. Private supply data cannot enter shared public caches.

### 04 — `heat-sensitive@1` — crop-window heat exposure

- **Applies:** corn tasseling/silking, wheat heading/flowering/grain fill; soybean flowering/pod fill, oats flowering/grain fill, sorghum flowering, and other crops only with a reviewed or explicitly accepted demonstration profile. Alfalfa heat exposure concerns regrowth/water stress, not corn pollination.
- **Inputs / rule:** complete latest 4 days `T2M_MAX` and confirmed sensitive-window membership. Corn: **Watch** if any day ≥35°C (95°F); **Alert** if all four days ≥35°C. Nebraska documents depressed pollen production above 95°F and greater concern with prolonged exposure [A6]; our exact daily-minimum exposure proxy and four-day status cut are **demonstration mappings**, not predicted yield loss. Other crop profiles: Watch if any Tmax≥30°C, Alert if ≥35°C on at least three of the four days, **demonstration settings**; do not imply these are extension-certified soybean, wheat, cotton or orchard thresholds. Missing stage/window => Insufficient data.
- **Cadence / cost:** daily; P-core, Q4. Do not silently copy the planner's approximate `heatThresholdC` into agronomic watch advice.

### 05 — `hot-nights@1` — poor overnight cooling

- **Applies:** corn pollination through early grain fill; other crops only explicit opt-in/profile. Not automatically every perennial or dormant crop.
- **Inputs / rule:** complete last 3 daily `T2M_MIN`; **Watch** if one or two days exceed 21.111°C (70°F); **Alert** if all three exceed it. Missing Tmin or stage => Insufficient data. A daily minimum above the cutoff supports warm-night exposure; a minimum below it does not describe how long the night remained hot.
- **Source:** Nebraska explains greater nighttime respiration and the interaction with pollination heat [A6]. The **70°F cutoff and three-night severity rule here are demonstration settings**; the source does not establish this numeric injury threshold. No yield-loss percentage claimed.
- **Cadence / cost:** daily; P-core, Q3.

### 06 — `spring-freeze@1` — cold after emergence / spring green-up

- **Applies:** emerged corn/soybean/sorghum, spring oats/alfalfa regrowth; winter wheat after green-up; orchard bloom. Active only between confirmed emergence/green-up and locally configured end of spring-risk window; use accepted estimated dates if labelled.
- **Inputs / rule:** complete last 2 days Tmin and crop stage. Default row-crop profile: **Watch** if Tmin≤0°C but >-2°C; **Alert** if any Tmin≤-2°C, **demonstration settings**, not proven tissue injury. Wheat profile: stage thresholds from K-State **24°F jointing, 28°F boot, 30°F heading/flowering** (approximately -4.444/-2.222/-1.111°C), **two-hour exposure** [A7]. With daily data, Watch if within 2°C above the applicable threshold, Alert if minimum crosses it, explicitly **“possible freeze exposure; duration unverified”**; this mapping is demonstration. Orchard needs a species/stage profile; missing one => Insufficient data, not a wheat threshold.
- **Missing:** no confirmed/accepted stage => Insufficient data; dormant wheat is not assessed using heading-stage thresholds. Hourly POWER can later characterize exposure but is still delayed/coarse, not an urgent forecast.
- **Cadence / cost:** daily; P-core, Q2. NWS freeze alerts remain a distinct opted-in hourly check.

### 07 — `fall-freeze@1` — freeze before maturity / harvest readiness

- **Applies:** corn, soybean, sorghum, oats and flagged cotton before confirmed physiological maturity; selected orchard crops need a fruit/species stage profile. Winter wheat autumn hardening is **not** equivalent to spring-freeze sensitivity.
- **Inputs / rule:** complete last 2 Tmin days during confirmed pre-maturity autumn window. Row-crop **Watch** for Tmin≤0°C but >-2°C; **Alert** for any Tmin≤-2°C. These are **demonstration settings**; maturity, duration and canopy microclimate govern actual injury. Normal only with complete temperatures and a valid active profile. Missing maturity/window or unsupported orchard threshold => Insufficient data. Post-maturity grain-quality/harvest risks require a different profile and are not implied.
- **Source:** no crop-general extension lethal threshold is asserted. This is an explicitly labelled demonstration air-temperature exposure screen; K-State's wheat spring two-hour thresholds [A7] must **not** be reused for autumn row crops.
- **Cadence / cost:** daily; P-core, Q2. Separate toggle from spring freeze because seasons/actions differ.

### 08 — `winterkill@1` — hard cold with inadequate insulating snow

- **Applies:** established winter wheat and alfalfa in dormancy, especially cold-winter regions; not spring corn or all perennials. Winter cereals behind the crop flag need their own hardiness profile.
- **Inputs / rule:** aligned complete 3 days Tmin + `SNODP`. **Watch** if at least one day has Tmin≤-15°C AND snow depth<5 cm; **Alert** if all three have Tmin≤-20°C AND snow<5 cm. All numeric cutoffs are **demonstration exposure settings**. Missing snow means Insufficient data, not “no snow.” Retain optional actual crown thermometer / SMAP layer-1 temperature as separately labelled evidence; no silent substitution of air for crown temperature.
- **Source:** NDSU describes critical **crown** temperatures differing widely by winter-wheat variety (about -4°F for its hardiest types versus injury below 14°F for some southern types) and protective snow [A4]. Iowa State explains snow insulation for alfalfa [A5]. Those are **not** validation of our air/snow screen. An Alert means “high cold-with-low-snow exposure; scout,” not “winterkilled.” SMAP snow mass may corroborate presence only; it cannot replace the 5 cm depth condition without a new version/density policy.
- **Cadence / cost:** daily; P-snow, Q3; optional shared SMAP S8, never eight new requests per winter-related check.

### 09 — `ice-encasement@1` — possible harmful ice-sheet formation

- **Applies:** overwintering alfalfa/winter wheat; strongest value where wet/thaw-freeze winters occur. **Off by default** because remote inputs cannot confirm an ice sheet.
- **Inputs / rule:** complete 5 days Tmax/Tmin/precipitation plus farmer ice observations if available. **Watch** for a day with Tmax>0°C and precipitation≥5 mm followed within 48 h by a day Tmax<0°C (a **demonstration weather proxy**, precipitation phase unconfirmed). **Alert only** when farmer reports continuous field ice cover for ≥7 days with a current observation no older than one day; the 7-day cutoff is a **demonstration setting**, not an extension survival limit. Without field confirmation, a proxy can never escalate beyond Watch.
- **Missing:** with complete weather but no observed ice, show Normal only as “weather proxy not triggered; ice cover unobserved”; never “no ice.” Incomplete required sequence => Insufficient data unless a valid current field report independently establishes Alert. Snow mass/skin temperature do not measure ice encasement or gas exchange.
- **Source:** Iowa State identifies sheets of ice as a winter-injury concern [A5]. Do not claim ice is insulating protection or that a rain/freeze sequence proves suffocation.
- **Cadence / cost:** daily or fresh farmer-report update; P-core + private observation, Q5. No direct ice product was verified.

### 10 — `chill-shortfall@1` — inadequate dormancy chill

- **Applies:** **chill-requiring orchard crops only**, dormant season; not corn, soybean, wheat or alfalfa. Orchards are a future watch-profile concept, not a currently supported planner crop.
- **Inputs / rule:** hourly POWER `T2M`; species/cultivar, model, season start, target chill hours and local deadline explicitly chosen. Demonstration Modified Weinberger model counts hours **0°C≤T<7.222°C (32–45°F)** from configured start. Compare cumulative hours at the same seasonal date with ≥20 complete prior seasons. **Watch** if cumulative rank≤20 before deadline; **Alert** if total<the configured cultivar requirement at deadline; otherwise Normal. Before enough historical chill has accumulated for a meaningful rank, require a configured evaluation-start date rather than warn on all-zero ties.
- **Missing:** any hour since start (including current source tail before the agreed observed-through endpoint), missing requirement/deadline/model, or insufficient historical seasons => Insufficient data for the affected verdict; never infer hours from daily min/max. Compute to latest complete observed day, not wall-clock “today.” Once the deadline has passed, completeness through the deadline is mandatory.
- **Source:** UGA describes below-45°F and 32–45°F models, cultivar dependence and benefits of the Dynamic model [A8]. Counting method endpoint conventions, percentile trigger and deadline status mapping here are **demonstration settings**. Do not convert chill hours into chill portions or infer a cultivar's requirement from its state.
- **Cadence / cost:** accumulate daily after new hourly days, not hourly API polling; H24 (up to 24 new hours/day plus revision lookback). Cold-season dates may span calendar years.

### 11 — `planting-temperature@1` — planting-depth cold exposure

- **Applies:** planting/pre-emergence corn/soybean; sorghum needs a warmer reviewed threshold; other crops only with a configured threshold. Not a command to plant.
- **Inputs / rule:** preferred farmer seed-depth morning thermometer or calibrated soil sensor; optional SMAP `soil_temp_layer1` as a **modeled regional proxy**. Require complete 7-day soil-temperature history for preplant screen and known planting date for first-48-h screen. Corn/soybean: **Watch** when 7-day mean<10°C; **Alert** only when a genuine seed-depth observation falls below 10°C during the first 48 h after planting. If SMAP alone crosses 10°C, cap at Watch and say depth/timing unconfirmed; no retrospective 3-hour mean proves the dawn minimum. Sorghum illustrative 15.556°C (60°F) profile remains demonstration until reviewed.
- **Source:** Nebraska recommends checking seven-day soil temperatures and the next 48 h weather, with particular concern below **50°F** during initial corn/soybean imbibition [A9]. The mean-based severity mapping is demonstration. **POWER `TS` is earth-skin temperature, not soil at seed depth.** T2M/TS-derived proxy alone => Insufficient data for the actual soil-temperature check, optionally display context. No POWER observation can supply the next 48 h forecast; a farmer should still check an official forecast and field temperature.
- **Missing:** no real/calibrated soil series => Insufficient data, not a “safe” condition. A configured weather-proxy experiment must have a distinct label/version.
- **Cadence / cost:** daily; S8 or private sensor history, Q7; no new request if shared SMAP slots already loaded.

### 12 — `wind-erosion@1` — wind on exposed, dry soil

- **Applies:** confirmed exposed fallow, seedbeds, recently tilled/post-harvest ground; crop identity alone does not establish cover. Do not infer bare soil from NDVI.
- **Inputs / rule:** current farmer-confirmed cover<30% or explicit exposed-soil flag, latest complete daily `WS2M` and `GWETTOP` percentile (≥20 prior same-calendar days). **Watch** if wind≥5 m/s and surface-wetness rank≤30; **Alert** if wind≥8 m/s and wetness rank≤20. All weather cutoffs are **demonstration settings**. Cover report expires after 30 days or any planting/tillage/harvest change, whichever comes first (demonstration policy). Unknown cover => Insufficient data; known protected soil => out-of-applicability, not weather risk Normal.
- **Source:** Nebraska G1537 explains bare, loose, dry soil, wind height dependence and protection from residue; about 30% cover can substantially reduce loss [A10]. Its example **6 mph at one foot** must not be converted directly to a 2 m daily-mean POWER threshold. This check estimates exposure, not tons/acre soil loss or gust hazard.
- **Cadence / cost:** daily; P-extra + private cover, Q35. Severe wind advisories may additionally appear through opted-in NWS.

### 13 — `rain-bare-soil@1` — heavy rain on unprotected soil

- **Applies:** exposed seedbeds/fallow/tilled ground, particularly spring establishment and slopes. Needs farmer cover confirmation; soil texture, slope and infiltration affect interpretation.
- **Inputs / rule:** valid exposure report as above and complete daily rain; **Watch** if the last day's rain≥25 mm; **Alert** if ≥50 mm. Both are **demonstration daily-depth settings**, not an erosivity threshold. Missing cover/rain => Insufficient data. No rain-intensity or runoff diagnosis from daily depth. Optional validated IMERG day may be displayed alongside but cannot silently replace POWER or change day boundaries.
- **Source:** USDA ARS documents rainfall intensity/antecedent-condition effects and benefits of protective cover [A11]; it does **not** validate our 25/50 mm cutoffs. A true erosion check would need intensity, slope/soil and management, e.g. an appropriate erosion model.
- **Cadence / cost:** daily; P-core + private cover, Q1; optional shared IMERG I1 context. No hourly request justified by this daily-depth screen.

### 14 — `vegetation-lag@1` — greenness below a comparable seasonal baseline

- **Applies:** confirmed growing crop after establishment and before senescence; not dormant/fallow, recent harvest, or unmatched rotations. **Off by default** until the field/crop baseline is defensible.
- **Inputs / rule:** strict QA MOD13Q1.061 NDVI or separately calibrated HLS v2 field series; same product/QA/spatial support and crop/phenology-aligned reference samples. Require ≥10 complete comparable historical seasons for MODIS (explicit **demonstration** minimum), current observation no older than 32 days, and baseline median NDVI≥0.3. **Watch** for NDVI rank≤20 and deficit from median≥0.10; **Alert** if those conditions persist for two consecutive accepted composites/acquisitions at least 8 days apart. All thresholds/persistence are **demonstration settings**. HLS needs its own reviewed short-record policy before enabling; do not pretend it has 35 years of history.
- **Missing:** cloud/snow/shadow/water/fill, too few matching crop-years, unknown stage, weak baseline signal, inadequate field coverage or expired observation => Insufficient data. At least 70% valid field area for a proposed polygon implementation is a demonstration coverage target; centroid-only mode must say point proxy and never claim that percentage. The verified 3×3 sample is not a field polygon.
- **Source:** NASA/ORNL product/QA definitions [D4, D5] support measurement handling; **no extension-certified agronomic NDVI injury threshold is asserted**. Lag prompts scouting, not a diagnosis of drought, pest or nutrient deficiency.
- **Cadence / cost:** check for new composites daily with cached date discovery; evaluate only on new accepted scenes, normally 16-day MODIS opportunities or irregular HLS. M1 or L-scene, not hourly.

### 15 — `nws-alerts@1` — official active hazard messages

- **Applies:** any region/crop when the farmer explicitly enables it; weather-event categories additionally selectable (freeze, heat, wind/dust, flood, severe storm). Never enabled by silently migrating the old hourly demo cron.
- **Inputs / rule:** validated point `FeatureCollection`. Only `status=Actual`; process `messageType` Alert/Update/Cancel and provider references, effective/onset/expiry/ends. A versioned explicit allowlist maps relevant **Warnings to Alert**, **Watches/Advisories to Watch**; unknown relevant events are displayed verbatim as unclassified, making classification Insufficient data rather than guessing from severity. Valid empty result => Normal (“no active NWS alerts at last poll”). Filter expired/cancelled messages; dedupe by alert id + sent time; updates can downgrade or cancel. Future-onset active watches remain visible. Preserve provider severity/certainty/urgency, not just our simplified risk level.
- **Initial event allowlist (proposed exact names; not suffix matching):** `Tornado Warning`, `Severe Thunderstorm Warning`, `Flash Flood Warning`, `Flood Warning`, `High Wind Warning`, `Dust Storm Warning`, `Freeze Warning`, `Extreme Cold Warning`, `Winter Storm Warning`, `Extreme Heat Warning`, and legacy `Excessive Heat Warning` → Alert. `Tornado Watch`, `Severe Thunderstorm Watch`, `Flash Flood Watch`, `Flood Watch`, `High Wind Watch`, `Freeze Watch`, `Extreme Cold Watch`, `Winter Storm Watch`, `Extreme Heat Watch`, and legacy `Excessive Heat Watch` → Watch. `Heat Advisory`, `Frost Advisory`, `Wind Advisory`, `Blowing Dust Advisory`, `Dust Advisory`, `Cold Weather Advisory`, and `Winter Weather Advisory` → Watch. These are proposed product mappings, not proof that every name is currently issued by every WFO. Categories can be individually disabled. Any unrecognized returned event is still shown verbatim and marked unclassified; an allowlist update is a registry version change. Do not silently omit a new NWS hazard because the catalog changed.
- **Source:** the NWS message is the authoritative hazard statement [D6], **not an agronomic temperature threshold**. Crop sensitivity may annotate relevance but cannot rewrite official warnings or instructions. Geometry can be null.
- **Missing:** timeout, malformed body or aged success beyond 90 minutes => Insufficient data, with last-known alert clearly marked stale. Do not clear an unexpired known warning solely because a poll failed. For an unexpired last-known warning, headline says “last known warning; current feed unavailable,” not verified current Alert.
- **Cadence / cost:** hourly **opt-in fields only**, N24. Notify on meaningful new/update/cancellation transitions, not every poll. It is not a primary short-fuse warning service.

## 6. Cost model, CPU and shared caching

These are **request counts and implementation budgets, not measured Worker CPU or a dollar quote**. Terminal timings in §3 measure real provider I/O, not Cloudflare billed CPU. Provider APIs above did not require a per-request purchase; hosting, R2/D1 operations, DO alarms, Earthdata transfer and notification charges depend on the chosen plan. Benchmark the actual implementation before scale commitments.

| Cost code | Cold/warm requests per field-equivalent | CPU work and proposed budget | Cache / sharing |
|---|---|---|---|
| P-core | At most **1 recent POWER request per native grid/day**, shared across all enabled core checks; **0 incremental requests per additional check**. Cold historical core baseline up to 1 long request per grid (the seven 35-year probes each succeeded as one request). | Parse recent ≤76 days once; baseline preprocessing O(35×366), then check-specific Q costs. Target <10 ms for all scalar daily checks combined after loading, **unmeasured**. | Existing accepted snapshots + D1 cache. Key by product/API/parser version, grid, variable bundle, time standard, date range and response hash. Data-through pointer changes dispatch only affected checks. |
| P-extra / P-snow | **0 extra** if enabled extra variables share the same accepted POWER bundle; otherwise at most **1 combined supplemental request/grid/day**, not one per variable/check. Cold baseline for surface/wind adds 1 request/grid if unavailable. | Small additional vectors; Q3 for snow, Q35 for percentile screens. Separate core/extra completeness. | `SNODP,TS,GWETTOP,WS2M` bundle cached daily; no new soil-temperature measurement from TS. Group fields by verified source cell but rebind requested-field provenance on read. |
| Q35 | Dry: at most 35×(14+7) historical day contributions; too-wet: 35×(7+3) per endpoint, two endpoints; wind: 35 same-day samples. | O(years×window), precompute baseline distributions. Target <1 ms/check for warm scalar evaluation, **unmeasured**, excludes I/O/parsing. | Cache baseline distributions by check version + exact calendar window + baseline hash, not by farmer identity. |
| Q1–Q7 / Q60 | **0 provider requests** beyond shared inputs. | Heat 4 days, nights 3, freeze 2, winterkill 3, ice 5, planting 7, rain 1; irrigation recomputes ≤60 retained accounting days after revised initialization. O(window), target <1 ms each, **unmeasured**. | Risk result cache/run id includes field settings/input hash; private measurements isolated in field agent. |
| H24 | Incremental **1 hourly POWER request/grid/day** in chill season, shared by orchards in that grid; one-time historical backfill must be chunked to provider limits (not established by the 3-day probe). | O(new hours) running sum, up to 24/day plus revision replay; full cold-season/20-year backfill is offline work, not a visitor request. | Cache native hourly data and model-versioned seasonal accumulations; weekly revision lookback. No hourly poll just because source resolution is hourly. |
| S8 | Typical **1 CMR discovery + up to 8 SMAP point subsets/grid/day**; first use may add axes/attributes discovery. **0 incremental** for snow/soil/moisture checks sharing those slots. | O(8×days) validation; no global HDF parsing in a DO. Target <5 ms point-series aggregation, **unmeasured**. | Exact granule/version/row/col/variable bundle and native timestamp. Eight complete slots required for a daily mean; bounded retries per missing slot. Shared ingestion job, R2 immutable subsets/D1 pointers. |
| I1 | Optional context: **1 discovery + metadata + data request/day/cell** when cold; 14-day cold comparison is **29 upstream requests** in existing adapter, excluding bounded auth redirects. Warm =0. | Native point decode and 48-count validation; bounded metadata/body sizes. <5 ms target, **unmeasured**. | Reuse `src/worker/imerg` validated per-day cache; keep Late/Final/date/revision keys separate. No fan-out from public visits. |
| M1 | **1 cached date discovery/point/day**, then **1 subset request per newly available composite**, up to 10 dates/request for historical batches. A multi-decade baseline is many batches, not one call. | O(composites×years) QA/anomaly, target <5 ms per point evaluation, **unmeasured**. | Product=MOD13Q1, collection=061, point/pixel, native processing id, QA/parser versions. Failed discovery cooldown does not erase healthy data; retry with bounds. |
| L-scene | **1 CMR query/point or tile/day** plus three COG assets (red/NIR/Fmask) per new scene. Each COG involves **multiple HTTP Range requests**; exact count/bytes not instrumented in this probe. | Raster decode/polygon statistics belong in bounded offline/workflow ingestion, **not Worker CPU estimates**. Small derived JSON evaluation target <5 ms, unmeasured. | Cache tile/granule native bands, then polygon hash + QA/versioned statistics. Share scene acquisition across nearby fields; never download entire tiles per check invocation. |
| N24 | **24 point requests/opted-in field/day** before shared-point cache/conditional reductions; **0 for opted-out fields**. Initial zone discovery only if a later area-poll strategy is selected. | O(active alerts) bounded parsing/filtering, <5 ms target, **unmeasured**; no LLM inference. | Exact point query + provider cache validators; application hourly schedule with jitter, successful-poll age retained. Do not share a county result as point-exact without geometry/zone matching. |

An initial field setup may need historical variable backfill; subsequent checks reuse it. Never multiply the shared daily POWER request by the number of enabled risk checks. Operational acceptance must measure requests, retries, parsed bytes and CPU **separately**. For scale planning, grid-level weather acquisition + per-field evaluation is preferable to every DO independently fetching NASA.

## 7. Region scheme: derive profiles from the field's own POWER history

### 7.1 Choice and alternatives

Choose **overlapping, transparent climatology tags**, not a single state label or asserted Köppen class. Use the existing **1991–2025, 35-year POWER archive** for the initial version, independently pinned from the current-observation stream. At least 20 fully complete years are required; missing climatology means “region unknown,” not guessed from county/state. Baseline versions do not change every day. Recompute on explicit baseline upgrade and preview changed defaults; **never overwrite farmer overrides**.

The basis is sourced: POWER documents native resolution, long reanalysis history and revisions [D1]; temperature-based reference demand follows FAO-56 Hargreaves Eq. 52 and the existing `et0HargreavesMm` formulation [D7]. The **tag thresholds are our demonstration settings**, not USDA/NOAA boundaries or a calibrated aridity classification. “Moisture-balanced” below does not mean never dry or always poorly drained.

| Tag | Exact definition from complete-year means | What it recommends |
|---|---|---|
| `water-limited` | mean annual precipitation / mean annual Hargreaves ET0 **<0.65** | Dry spell; irrigation-gap setup when confirmed irrigated. Do not infer irrigation from this tag. |
| `moisture-balanced` | ratio **≥0.65** | Too-wet; rain-bare-soil when exposure is confirmed. Dry spell remains a crop-season baseline everywhere. |
| `cold-winter` | mean number of days/year with Tmin<0°C **≥90** | Winterkill for overwintering wheat/alfalfa; planting-temperature for spring crops. Ice-encasement is suggested, not auto-enabled. |
| `hot-summer` | mean days/year Tmax≥35°C **≥30** | Heat-sensitive where crop profile exists; corn hot nights remains crop-driven regardless of tag. |
| `wind-exposed` | mean days/year daily WS2M≥5 m/s **≥30** | Wind-erosion only with current exposed-ground confirmation. No broad severe-wind forecast. |

ET0 calculation used in the terminal audit: `max(0, 0.0023*(Tmean+17.8)*sqrt(max(0,Tmax-Tmin))*Ra*0.408)` mm/day, with FAO extraterrestrial radiation `Ra` in MJ m-2 day-1 and latitude/day-of-year geometry. Annual ratios use sums/means, not an average of daily rain/ET0 ratios. Frost-day and wind counts require actual valid days, no missing-day rescaling. **Snowfall days are not derived from precipitation plus temperature**: POWER `SNODP` describes snow depth, not snowfall; snow metrics would require additional historical download and method review. The first region scheme therefore avoids a new snow dataset.

Alternative | Why not the primary routing dependency
---|---
USDA Plant Hardiness Zones | Strong future perennial context: official 2023 map uses 1991–2020 **average annual extreme minimum**, not frost dates, snow protection, summer heat or water balance [R1]. Do not manufacture a USDA hardiness zone from the coarse POWER record. Optional official raster lookup later, not required now.
USDA Farm Resource Regions | Nine sourced regions group farm characteristics with physiography/soil/climate and crop-reporting districts [R2]. Useful labels, but broad and partly based on what is already grown; cannot replace field stage/drainage or direct weather history. No extra county crosswalk needed for first release.
NOAA climate divisions | Useful for regional summaries; extra polygon lookup/vintage and coarse division boundaries do not improve the point-driven thresholds enough for initial routing. No live division assignments were verified here.
Köppen–Geiger (e.g. Peel et al.) | Useful climate background, but requires a versioned map/lookup and does not supply crop-sensitive stages or farm management. We did not download/classify that map; no Köppen label is claimed.

Annual averages can hide seasonal deficits (especially California's wet winters/dry summers), irrigation and local topography. The check itself always uses its crop-season window and field inputs. Consider growing-season P/ET0 and observed frost-date quantiles in region v2 after a calibration study; do not silently change v1 defaults. At cutoffs near 0.65/90/30, show the underlying metric and allow correction rather than imply a natural boundary.

### 7.2 Live-computed seven-place routing examples

All seven exact point requests for `PRECTOTCORR,T2M_MAX,T2M_MIN,WS2M` over 1991–2025 succeeded; **35/35 complete years at every point**, no excluded years. Annual aggregates and response hashes are in the evidence. Mean annual rain and ET0 are mm; other columns are mean days/year. These are computed coarse-grid examples, not surveyed farm climates. Irrigation/crop assumptions below are labelled, not inferred from POWER.

| Place / exact point | Rain | ET0 | P/ET0 | Tmin<0 | Tmax≥35 | WS2M≥5 | Derived tags |
|---|---:|---:|---:|---:|---:|---:|---|
| Finney KS, 38.1095,-100.706 | 549.03 | 1286.08 | 0.427 | 113.37 | 41.51 | 51.14 | water-limited, cold-winter, hot-summer, wind-exposed |
| Story IA, 42.0563,-93.495 | 861.42 | 992.29 | 0.868 | 143.71 | 4.71 | 45.57 | moisture-balanced, cold-winter, wind-exposed |
| Champaign IL, 40.048,-88.33 | 1009.48 | 1035.60 | 0.975 | 121.57 | 2.69 | 41.14 | moisture-balanced, cold-winter, wind-exposed |
| Lancaster NE, 40.73,-96.55 | 813.58 | 1097.90 | 0.741 | 131.00 | 16.26 | 45.69 | moisture-balanced, cold-winter, wind-exposed |
| Fargo ND, 46.8772,-96.7898 | 619.30 | 906.05 | 0.684 | 171.51 | 4.23 | 48.94 | moisture-balanced, cold-winter, wind-exposed |
| Tifton GA, 31.4505,-83.5085 | 1255.91 | 1348.34 | 0.931 | 23.34 | 20.14 | 6.09 | moisture-balanced |
| Fresno CA, 36.7378,-119.7871 | 333.47 | 1588.62 | 0.210 | 3.91 | 100.86 | 2.54 | water-limited, hot-summer |

The preliminary JSON probe called ratio≥0.65 `humid`; its evidence policy explicitly defines that as the table's **moisture-balanced** tag, not a formal humid climate. No data values were changed to fit a regional stereotype. In particular, Fargo is near the ratio cutoff and Tifton is below the chosen hot-day count: their crop overlays still enable relevant cold/heat checks.

**Selection abbreviations:** D dry; W wet; I irrigation; H heat; N hot nights; S spring freeze; F fall freeze; K winterkill; X ice; C chill; T planting temperature; E wind erosion; R rain/bare soil; V vegetation; A NWS. “Selected/pending” is visible in settings but awaits necessary inputs or a later phase; it is not a working current check. No listed demo crop is asserted to be confirmed by its existing `crops` tag.

| Example field / assumed confirmed profile | Recommended eventual selected set (season-gated) | Conditional additions / omissions |
|---|---|---|
| **Finney irrigated corn**, user-provided management assumption | **D,W,H,N,S,F,T**; **I selected/pending** supply/Kc/soil-water setup | E selected/pending only if exposure confirmed; R also offered on exposed seedbeds. K/X/C not relevant to corn. A/V off. W still comes from crop planting vulnerability despite water-limited region. |
| **Story rain-fed corn**, demo crop assumption | **D,W,H,N,S,F,T** | E,R selected/pending only on confirmed exposure; I/K/X/C/A/V off. Corn heat/night checks remain despite few climatological ≥35°C days. |
| **Champaign rain-fed soybean**, illustrative confirmation of one demo crop | **D,W,H,S,F,T** | E,R only with exposure; no corn N profile. Switching confirmed crop to corn adds N; do not run both hypothetically. I/K/X/C/A/V off. |
| **Lancaster rain-fed corn**, illustrative confirmation | **D,W,H,N,S,F,T** | E,R only with exposure; I off. The field is not assigned Ogallala pumping supply merely because it is in Nebraska. |
| **Fargo ND winter wheat**, contrast, rain-fed assumption | **D,W,H,S,K** | K selected/pending snow pipeline; E/R only on exposed establishment ground. X offered but off; F off because autumn wheat hardening is not a row-crop fall-freeze profile. T cold seedbed profile for autumn wheat needs agronomic review, not the corn 50°F rule. |
| **Tifton GA cotton**, contrast, rain-fed assumption, future crop flag | **D,W,H,S,F** as **future-profile suggestions**, not enabled in current product | T needs cotton-specific seed-temperature profile; R if exposed. No winterkill/chill. Cotton H/S/F values remain demonstration until reviewed; do not unlock it by silently accepting an unknown current CropId. A/V off. |
| **Fresno CA deciduous orchard**, contrast, irrigated/cultivar assumption | **D,I,H,S,C**, all crop-specific profiles **selected/pending** configuration/availability | Require species/cultivar, bloom profile, chill model/requirement/deadline, water supply; no automatic corn thresholds. K/X/T/N/F off without a reviewed relevant profile. W/R may be farmer-enabled for ponding/exposed interrows; A/V off. This is a design extension beyond today's planner, not a production orchard advisory. |

### 7.3 Crop × region default matrix and precedence

The base column is selected for that crop after farmer consent to monitoring; region columns add to it **only when the condition in the cell holds**. Blank (`—`) means no additional check, not suppression. All windows and availability gates remain mandatory.

| Confirmed crop | Crop-season base | Water-limited overlay | Moisture-balanced overlay | Cold-winter overlay | Hot-summer overlay | Wind-exposed overlay |
|---|---|---|---|---|---|---|
| corn | D,W,H,N,S,F; T pending soil inputs | I if irrigated, pending setup | R if exposed | T (same id, no duplicate) | H (same id) | E if exposed |
| soybean | D,W,H,S,F; T pending soil inputs | I if irrigated | R if exposed | T | H | E if exposed |
| winter wheat | D,W,H,S | I if irrigated | R if exposed | K; suggest X off | H | E if exposed |
| oats (spring) | D,W,H,S,F | I if irrigated | R if exposed | T only configured oat threshold | H | E if exposed |
| alfalfa | D,W; H/S only accepted regrowth profiles | I if irrigated | R if establishment soil exposed | K; suggest X off | H only accepted profile | E only exposed establishment/termination |
| grain sorghum | D,W,H,S,F; T with sorghum profile | I if irrigated | R if exposed | T | H | E if exposed |
| fallow | No crop stress verdict; offer D soil-water context | D if opted in | R if exposed | — | — | E if exposed |
| cotton / other flagged SW Kansas crops | Future reviewed profiles only; cotton example D,W,H,S,F | I if irrigated | R if exposed | No automatic cereal hardiness assumption | H only accepted profile | E if exposed |
| chill-requiring orchard (future) | D; I if irrigated; C/H/S only configured cultivar/stage profiles | I | W if farmer flags ponding susceptibility; R for exposed interrow | No automatic wheat K | H only configured profile | E for exposed interrow |

Formally:

`recommended = cropBase ∪ eligibleRegionAdditions ∪ confirmedManagementAdditions`

`selected = (recommended ∪ explicitOn) − explicitOff`

`runnable = selected ∩ releasedChecks ∩ configuredProfiles ∩ currentlyApplicableChecks`

Farmer overrides **win over defaults**, not over physical validity, supported crop IDs or missing data. Store overrides separately from the computed selection, so an explicit off survives crop changes, baseline upgrades and reload. Configuration gaps remain visible; do not make a toggle look runnable when its data do not exist. A user can enable a cross-region check without changing their region tag. **NWS, ice and vegetation remain explicit opt-ins in every cell**; no automatic hourly traffic. Chill is recommended only after a chill-requiring cultivar is identified; alfalfa being perennial does not imply a chilling-hours target.

## 8. Proposed architecture and contracts

### 8.1 Registry, pure evaluators, shared acquisition

Conceptual schema (design notation, not added feature code):

```text
CheckDefinition {
  id, version, displayName, releasePhase, availability,
  appliesTo: { cropProfiles, seasons, requiredManagement, regionSuggestions },
  dataNeeds: [{ product, version, variables, units, timeStandard, spatialSupport,
                completeness, maxAge, requiredOrContext }],
  cadence: { sourceRefresh | newScene | hourlyOptIn, minimumInterval },
  thresholds: [{ value, unit, comparator, demonstration, sourceUrl, locator }],
  windowPolicy, missingDataPolicy, evaluatorVersion, notificationPolicy
}
FieldWatchSettings {
  schemaVersion, settingsVersion, masterEnabled,
  confirmedCrop, seasonId, plantingDate, stageOrAcceptedEstimatedWindows,
  management, regionProfileRef,
  explicitOn[], explicitOff[], resolvedSelection[],
  perCheckOverrides, nwsOptIn, deliveryConsent, updatedAt
}
CheckRun {
  runId, fieldId, settingsVersion, registryVersion,
  checks: [{ id, version, profileVersion, applicability, status,
             window, metrics, missing, reasons, inputHash, sourceRefs }],
  headlineStatus, triggeringCheckIds[], coverage,
  evaluatedAt, observedThroughBySource, inputManifestHash
}
```

Registry thresholds store **each numeric value's own source or demonstration label**, not a blanket extension homepage. Crop-window profile versions are independent of biological thresholds. Valid configuration is an explicit compatibility contract; selecting an id with unknown version is a validation error, not an ignored no-op. Optional context is separately typed and cannot leak into deterministic evaluator inputs.

Shared source acquisition writes accepted immutable R2 snapshots and D1 latest pointers, following existing POWER refresh architecture. Field agents read references, evaluate pure checks and persist one atomic run. Network/ingestion failures remain per-source/per-check; valid heat results must survive unavailable MODIS or snow. Bound fetch headers **and response-body consumption**, response sizes, retry count and concurrency. Earthdata credentials stay server-side; authorize only exact verified hosts and never retain signed redirect URLs. No LLM is needed to classify a risk; retrieved prose is optional cited context only.

### 8.2 Storage, authorization and migration

- Extend **each field agent's SQLite settings**; do not put one shared enabled list on a user account or global demo list. Keep `schemaVersion` separate from mutable `settingsVersion` and per-check versions. Make writes conditional on expected settings version (409 on stale update), atomic, and capability/auth scoped to that field.
- Keep current monitoring **off by default** for new private registrations until confirmation. Existing enabled fields migrate to **dry-spell only** with equivalent schedules/status compatibility; show a preview to adopt the new recommended set. Do not activate new risks or NWS on behalf of existing farmers. Demo-page suggestions may preview multiple checks but must not become personal opt-in consent.
- Existing `WatchSettings.crop`, recurrence and run tables need an additive schema migration plus backward readers; old `AgentRun`/`FieldRun` consumers still read legacy records. A multi-check run has a new schema/version; do not write arrays into a field previously assumed to be a v2 metrics object.
- Proposed settings request is a versioned extension of existing settings/registration routes: `{expectedSettingsVersion, masterEnabled, confirmedCrop, season, explicitOn, explicitOff, checkOverrides, nwsOptIn}`. GET returns resolved selection plus “why recommended,” availability and required-input gaps. Current `calendar` rejection stays until the new validated season schema ships. Reject unknown ids, incompatible units, unsupported crops, conflicting on/off ids and out-of-range windows; custom thresholds must remain visibly farmer settings.
- Preserve registered capability ids and polygon hashes; never publish them or private supply/measurement inputs to a public demo room or shared source-cache key. Settings changes cancel old alarms; callbacks carrying old `settingsVersion` exit without fetching.

### 8.3 Scheduling and one field headline

Daily acquisition dispatches only when relevant accepted input hashes change; retries of identical inputs reuse a stable run id. Keep weekly **digests** separate from daily evaluation; do not send daily duplicate notifications. Check applicability per item: winterkill can run in January while corn heat is out of season; do not return one global `inactive` because the old heat window is closed.

NWS has a separate opt-in hourly alarm keyed by field + hour + settings version. Opt-out cancels it, and callback rechecks consent before any request. Daily risk checks never cause an NWS poll. A field with only NWS enabled does not need daily POWER acquisition. After a restart, reconcile persisted due work exactly once; use bounded catch-up, not dozens of obsolete hourly polls.

Headline aggregation (only active, enabled checks):

1. Any valid **Alert**: headline Alert, name **all** triggering checks; append “some checks unavailable” when applicable.
2. Else any valid **Watch**: headline Watch, name triggers; append missing-coverage detail.
3. Else any active required result **Insufficient data**: headline Insufficient data; list what could and could not be evaluated. Never show green Normal while an enabled relevant check is unknown.
4. Else at least one active valid result: Normal, name evaluated coverage and timestamps.
5. No active checks: neutral “No checks active for this season” / “Monitoring off” metadata, **not a fifth risk status** and not Normal.

Example: **“Alert — crop heat and dry spell; soil temperature unavailable.”** An NWS event name must be attributed, e.g. “Alert — NWS Flash Flood Warning,” not a homemade “flood detected.” Never collapse all hazards into “Dry.” Deduplicate farmer notifications by semantic transition/check/episode rather than repeated source retrieval time; preserve separate timings for official alerts and delayed weather screens.

### 8.4 Reproducibility and revisions

Run identity includes field id, settings version, registry/check/profile versions, exact observation windows and immutable input-manifest hash. Pin:

- Raw product version, provider URL without credentials, native granule/processing id, source-byte hash (or explicitly labelled derived artifact hash), parser/QA version, requested point, source cell/pixel/polygon support, units and UTC/LST interval convention.
- Recent weather **and the actual historical baseline values/distributions** used for percentile ranks. Existing `agentCore.ts` hashes recent rain/root values only; that is not enough for new reproducibility requirements. Heat/freeze hashes must include temperature, thresholds and crop stage. Context needs a separate hash so prose refresh does not change deterministic status.
- Region baseline/derivation version, farmer-approved crop/stage/window, irrigation/cover reports, source as-of/observed-through timestamps and all missing/fill decisions.

Replaying the same pinned run performs **no live fetch** and yields the same per-check results/headline. Revised POWER/IMERG data create a new revision linked to the original; never mutate an old run. A reconstruction using later revised data must say “retrospective reconstruction,” not “as known then.” NWS `/alerts` only covers recent history, so retain the actual opted-in event snapshots needed for replay; today's alerts cannot be inserted into a historical weather replay.

## 9. Phasing and implementation acceptance gates

| Phase | Can ship / dependencies | Stop signals and proof required |
|---|---|---|
| **1 — core multi-check** | Registry/settings/one headline; preserve `dry-spell@2`; add too-wet, heat-sensitive, hot nights, spring/fall freeze from the **already downloaded rain/Tmax/Tmin/GWETROOT**. New crop/stage windows must be confirmed or accepted as estimates. | No new NASA variable is required. Test missing temperatures, all-zero rain, unequal root/rain endpoints, percentile ties, insufficient years, stage unknown, out-of-season checks and mixed valid/missing headline. No NWS traffic. No extension injury claim from a daily proxy. |
| **2 — snow and soil** | Supplemental POWER `SNODP`; actual/calibrated soil temperature (farmer sensor or operational SMAP point pipeline); versioned optional bundles. Add winterkill and planting-temperature with proxy caps. Wind adds WS2M/GWETTOP/cover; rain/bare soil adds cover only. | Verify multiple complete recent SMAP days (8 slots/day), frozen/snow applicability, zero snow vs missing snow, depth vs SWE distinction and soil model-layer vs seed-depth wording. TS-only check must remain insufficient. Live point access in this design is not a finished production pipeline. |
| **3 — NWS opt-in hourly** | Versioned event allowlist, scheduler consent, dedup/update/cancel handling, delivery choice and status UI; only opted-in fields fetched hourly. | Verify actual point-empty and populated-zone fixtures, null geometry, malformed/429/timeouts, stale cache, opt-out before callback, alert expiry, replay and notification consent. Hourly polling is explicitly not a primary tornado-warning channel. |
| **Later gated work** | Irrigation gap after field water/supply setup; ice proxy/manual reporting; orchard profiles + hourly-temperature chilling backfill; comparable QA/crop-history vegetation baselines. | Do not auto-enable unavailable pipelines or advertise orchard/cotton support on today's crop enum. IMERG stays context until boundary alignment is separately validated. No “ice detected,” field-wide vegetation diagnosis or aquifer-to-seasonal-supply conversion. |

Design acceptance criteria for the eventual implementation:

- **AC1:** Two fields with the same crop can persist different on/off sets; explicit off survives reload, crop change and new region baseline. Stale callbacks produce no fetch/run.
- **AC2:** A Finney corn field and Fargo winter-wheat field resolve the matrix as documented; unconfirmed crop tags cannot activate crop-sensitive verdicts. Region metrics are explainable and source-pinned.
- **AC3:** Adding heat + nights + freeze to a warm dry-spell field adds **zero POWER network requests**; cold setup shares one required-variable bundle. Measure actual CPU/requests before claiming budgets met.
- **AC4:** A missing source never becomes zero or Normal. A valid heat Alert plus missing snow stays Alert with incomplete coverage; all-normal-plus-one-unknown becomes Insufficient data.
- **AC5:** Disabling NWS gives **zero NWS calls**, including old alarms; opting in uses only bounded hourly work. An empty 200 is Normal; a 400/429/timeout is not.
- **AC6:** Replaying saved inputs/baseline/settings exactly reproduces all results without networking; a provider revision creates a linked new run and never overwrites the original.
- **AC7:** Snow depth, SWE and ice cover are distinct; no soil-temperature screen treats POWER TS or T2M as a planting-depth measurement. Ice proxy alone never reports confirmed encasement.
- **AC8:** Existing v2 replay/district/research/IMERG context outputs remain backward readable and do not acquire unapproved status effects. Registration validation, capability privacy, D1 persistence/restart and localized dashboard labels are exercised before enabling private fields.

No runtime tests/build are claimed for this documentation-only change. This design's verification is the live source requests, actual raster/subset reads, recomputed seven-place climatologies, native parameter/unit inspection and documentation/evidence consistency checks.

## 10. Decisions requiring farmer/product/agronomist approval

1. **Defaults and migration:** approve union-based recommendations with master monitoring consent and dry-only migration, or explicitly authorize automatic adoption for existing fields. Proposed default is **no silent activation**.
2. **Demonstration thresholds:** approve clearly labelled exposure screens for initial release or require extension/agronomist validation before each new check goes live. Corn heat and wheat freeze have useful source anchors; most status/persistence mappings remain demonstration.
3. **Field inputs:** choose how much setup to require: confirmed crop/season/stage, irrigation supply and initialization, current exposed cover, and seed-depth temperatures. Proposed behavior is visible pending/insufficient, not guessed values.
4. **Region policy:** approve the five explainable POWER tags/cutoffs and fixed baseline version. Do we add official USDA hardiness-zone context for orchards later, or keep initial routing dataset-free beyond POWER?
5. **Temperature urgency:** accept delayed retrospective weather screens and a separate hourly NWS feed; hourly is too slow for primary short-fuse warning delivery. Choose in-app/email/SMS delivery and consent before promising notifications.
6. **Scope:** approve snow/soil before NWS; keep ice/vegetation off by default and irrigation/chill gated. Cotton/new SW Kansas crops and orchards need supported crop/profile contracts, not an arbitrary generic threshold.
7. **Headline policy:** approve showing valid Alert/Watch with incomplete-coverage qualifier, but Insufficient data rather than green when the only unresolved active check is unknown.
8. **Operating budget:** select hosting/retention/notification limits and benchmark CPU/range-request counts in implementation; this design does not claim measured Worker cost.

## 11. Sources and evidence locators

All links below were read or live-requested during this design; product access is distinguished from agronomic threshold support. Search snippets alone are not taken as threshold verification. An old K-State wheat-heat article URL resolved to a generic landing page, and an old Iowa State spring-erosion URL returned 404; neither is relied on for a numeric rule. The verified K-State PDF was HTTP 200 `application/pdf`, 317,734 bytes; its SHA-256 is in the evidence.

### Agronomy

- **[A1]** [US Drought Monitor: Drought Classification](https://droughtmonitor.unl.edu/About/AbouttheData/DroughtClassification.aspx), table “Example Percentile Range for Most Indicators,” plus convergence-of-evidence explanation. Percentile bands do not certify our two-variable dry-spell algorithm.
- **[A2]** [Iowa State: Ponding Impacts on Corn Growth & Development](https://crops.extension.iastate.edu/encyclopedia/ponding-impacts-corn-growth-development), “Effect on the plant” and Table 1. Actual submergence/oxygen and temperature/stage dependence; not POWER wetness thresholds.
- **[A3]** [Nebraska: Scheduling the Last Irrigation of the Season](https://cropwatch.unl.edu/scheduling-last-irrigation-season), main-season 35%/50% depletion discussion, late-season 60%, and soil-texture examples. Does not provide Finney's well capacity or an orchard irrigation calibration.
- **[A4]** [NDSU: Soil Temperatures Approach Critical Point for Winter Wheat](https://www.ag.ndsu.edu/news/newsreleases/2012/jan-23-2012/soil-temperatures-approach-critical-point-for-winter-wheat), Joel Ransom, Jan 23, 2012: crown vs air temperature, variety dependence, snow/residue insulation.
- **[A5]** [Iowa State: Scouting for Winter Injury in Alfalfa Fields](https://crops.extension.iastate.edu/cropnews/2023/04/scouting-winter-injury-alfalfa-fields), Joshua Michel, Apr 7, 2023: snow insulation, sheets of ice, soil temperature and heaving. Does not establish a universal seven-day ice-kill threshold.
- **[A6]** [Nebraska: How Extended High Heat Disrupts Corn Pollination](https://cropwatch.unl.edu/how-extended-high-heat-disrupts-corn-pollination-0), “Key Takeaways” and “Background”: >95°F pollen effects, prolonged heat, nighttime respiration and moisture dependence. Retrieved page updated Aug 28, 2026. No universal hot-night cutoff is claimed from it.
- **[A7]** [K-State C646: Spring Freeze Injury to Kansas Wheat](https://bookstore.ksre.ksu.edu/pubs/spring-freeze-injury-to-kansas-wheat_C646.pdf), **Table 1**, approximate injurious temperatures **for two hours**, plus introduction and growth-stage discussion. Stage-specific wheat values, not an autumn corn or orchard table.
- **[A8]** [UGA: So how are we doing with chill?](https://site.extension.uga.edu/peaches/2023/02/so-how-are-we-doing-with-chill), Dario Chavez, Feb 22, 2023: Weinberger/Modified Weinberger/Dynamic models, differing cultivar requirements. Supplemental land-grant source; not a fixed national chill target.
- **[A9]** [Nebraska: Chilling Injury in Corn and Soybeans](https://cropwatch.unl.edu/chilling-injury-corn-and-soybeans/), Apr 22, 2015: 50°F, first 24–48 hours, seven-day soil history and field thermometer/forecast advice.
- **[A10]** [Nebraska G1537: Wind Erosion and Its Control](https://extensionpubs.unl.edu/publication/g1537/2010/html/view), bare/dry/loose soil discussion and Table I on nonerodible cover. Wind at one foot and residue management are not a 2 m daily-mean calibrated alarm.
- **[A11]** [USDA ARS publication #416596](https://ars.usda.gov/research/publications/publication?seqNo115=416596), Ford, Williams & Mumbi (2024), “Interpretive Summary” / “Technical Abstract,” [DOI 10.1002/hyp.15327](https://doi.org/10.1002/hyp.15327): rainfall intensity, antecedent conditions and protective cover. Supports mechanism, not our demonstration daily-depth thresholds.

### Data and region basis

- **[D1]** NASA POWER [data FAQ / latency](https://power.larc.nasa.gov/docs/faqs/data), [meteorology sources](https://power.larc.nasa.gov/docs/methodology/data/sources_meteorology/), and exact daily/hourly point URLs in the evidence. Parameter units were read from **the actual AG responses**.
- **[D2]** [NASA NSIDC SPL4SMGP v008](https://nsidc.org/data/spl4smgp/versions/8), [DOI 10.5067/T5RUATAQREF8](https://doi.org/10.5067/T5RUATAQREF8), plus live CMR/OPeNDAP data and native `.das` attributes. 3-hourly L4 model-assimilated fields, not independent field sensors.
- **[D3]** [NASA GES DISC IMERG Late daily V07](https://disc.gsfc.nasa.gov/datasets/GPM_3IMERGDL_07/summary), [DOI 10.5067/GPM/IMERGDL/DAY/07](https://doi.org/10.5067/GPM/IMERGDL/DAY/07); [NASA's latency FAQ](https://gpm.nasa.gov/resources/faq/what-determines-latency-imerg) and [NASA dataset description on the AWS registry](https://registry.opendata.aws/nasa-gpm3imergdl/) explain stream and daily-closure latency. The GES DISC JavaScript summary was not extractable in this run; actual CMR/point/DMR requests succeeded independently. Current access/latency qualifications are also in [imerg-access.md](imerg-access.md). Live Nov 14 subset/DMR and discovery preserved in evidence.
- **[D4]** [ORNL TESViS REST service](https://modis.ornl.gov/data/modis_webservice.html), [service DOI 10.3334/ORNLDAAC/1600](https://doi.org/10.3334/ORNLDAAC/1600); native MOD13Q1.061 CSV subset in evidence; [MODIS.md](MODIS.md) for current adapter QA/caching. ORNL docs limit synchronous subsets to ten composite dates/request.
- **[D5]** [NASA HLS Data Products](https://hls.gsfc.nasa.gov/data-products/), spatial/temporal sampling; **Table 3** (band names/scales/fill) and **Table 4** (Fmask bits), whose source images were inspected directly, plus the [HLS v2 user guide](https://lpdaac.usgs.gov/documents/1698/HLS_User_Guide_V2.pdf). Native CMR metadata and actual band windows are in evidence. Do not claim forthcoming HLS-LL is available.
- **[D6]** [NWS API documentation](https://www.weather.gov/documentation/services-web-api), “Pricing,” “Authentication,” and alerts discussion; [NWS Alerts Geolocation Guide](https://weather.gov/media/documentation/docs/NWS_Geolocation.pdf) for polygon/zone/county distinctions. Finney/KS empty and CA populated API results are separately labelled in evidence.
- **[D7]** [FAO-56 Chapter 3: Meteorological data](https://www.fao.org/4/x0490e/x0490e07.htm), “Missing climatic data” / Hargreaves Eq. 52, with Ra converted to equivalent evaporation; existing project function in `src/engine/climate.ts`. Reference demand is not actual farm irrigation use.
- **[R1]** [USDA ARS 2023 Plant Hardiness Zone Map extreme-low rasters](https://agdatacommons.nal.usda.gov/articles/dataset/2023_USDA_Plant_Hardiness_Zone_Map_Mean_Annual_Extreme_Low_Temperature_Rasters/25343293/1), description: 1991–2020, 800 m, average annual extreme minimum and topographic limitations.
- **[R2]** [USDA ERS Farm Resource Regions, AIB-760](https://ers.usda.gov/sites/default/files/_laserfiche/publications/42298/32489_aib-760_002.pdf?v=24494), regional construction and nine-region map. Evaluated as an alternative; no county-to-region lookup or official region assignment is claimed here.
