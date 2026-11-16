// Pure orchestration: data in, full plan response out. No network calls here,
// so the whole engine is unit-testable with fixtures.

import type { CountyInfo, CountyLosses, CropHistory, CropId, CropValidation, DroughtReplay, EtMonth, NassData, PlanRequest, PlanResponse, SoilProfile, WaterCheck, WaterLevel, WaterOption } from "../shared/types";
import { effectiveSoil, validateMeasurements } from "../shared/measurements";
import { buildIndicators, type DailyClimate } from "./climate";
import { buildExplanation, buildFacts, CROP_ES } from "./explain";
import { ALL_CROPS, CROPS } from "./crops";
import { availableCrops, FALLOW_MAX_ANNUAL_RAIN_MM, statePotential } from "./regions";
import { buildDroughtReplays } from "./droughtReplay";
import { planAdvice } from "./pestNotes";
import { buildWaterContext, type CropWeatherMemo, evaluateCropClimate, LIMITED_IRRIGATION_MM, makeReplay, meanAnnualRainMm, runEngine } from "./rotation";
import { usdaInputs, type RecentYield, type ValidationSeries } from "./usda";
import { checkWaterUse, validateCrop, type YieldRecord } from "./validate";

export const DATA_SOURCES = [
  { name: "NASA POWER (daily, MERRA-2 based)", url: "https://power.larc.nasa.gov/", usedFor: "Rainfall, temperature, frost dates, heat days, growing degree days, root-zone soil wetness" },
  { name: "NASA GIBS (MODIS Terra true color)", url: "https://gibs.earthdata.nasa.gov/", usedFor: "Satellite imagery on the dashboard map" },
  { name: "USDA NASS Cropland Data Layer", url: "https://nassgeodata.gmu.edu/CropScape/", usedFor: "What was planted on the field in recent years" },
  { name: "USDA NRCS SSURGO (Soil Data Access)", url: "https://sdmdataaccess.sc.egov.usda.gov/", usedFor: "Soil type, drainage, pH, organic matter, water-holding capacity" },
  { name: "NASA Daymet (ORNL DAAC, 1 km daily)", url: "https://daymet.ornl.gov/", usedFor: "Rain and temperature at the field, averaged with NASA POWER" },
  { name: "USDA NASS Quick Stats", url: "https://quickstats.nass.usda.gov/", usedFor: "Real county and district harvests by practice (irrigated / rain-fed), and current state crop prices" },
  { name: "USDA RMA Cause of Loss", url: "https://www.rma.usda.gov/tools-reports/summary-of-business/cause-loss", usedFor: "Crop-insurance payouts by cause (drought, flood, hail, wind…) for the county since 1991" },
  { name: "OpenET (NASA/USGS Landsat)", url: "https://etdata.org/", usedFor: "Measured crop water use on the field since 2016, to check our water model" },
  { name: "FCC Area API", url: "https://geo.fcc.gov/api/census/", usedFor: "County lookup" },
];

export const DISCLAIMER =
  "SoilSense is decision support, not a guarantee. It does not forecast this season's weather. Economics are indicative and based on editable price and cost assumptions. Review any plan with your county extension agent or agronomist.";

export const ASSUMPTIONS = [
  "Heat stress uses extreme-heat degree days above each crop's threshold (the measure used in Schlenker & Roberts, PNAS 2009); irrigation is assumed to remove about two-thirds of heat damage.",
  "Climate history is shifted to today's conditions only where a trend is statistically significant (Mann-Kendall, p < 0.05).",
  "Years from the last decade count twice when scoring climate fit.",
  "A crop-year counts as stressed when its combined water, heat, season-length and planting-condition score falls below 0.6.",
  "Each 3-year plan is replayed against every run of consecutive NASA weather years, carrying soil water from one season to the next: crops draw stored water down, and between crops the soil stores about 50% of cool-season (Nov–Mar) rain and 15% of warm-season rain. A winter cover crop uses about 40% of that recharge.",
  "Effective in-season rainfall = 75% of season rain; the soil can hold 80% of its available water capacity, to 2 m or the depth of the soil.",
  "Yield = water-unlimited potential × the share of the crop's water need that was met (a water-production function, with no grain below a crop-specific minimum) × heat, season-length and planting stress.",
  "Yield potential: dry Plains states use approximate irrigated-practice yields; other states use state (or USDA NASS county) averages × 1.1, since average farm yields reach about 85–90% of potential.",
  "Nitrogen, seed and other input costs scale with the expected yield (yield-goal method), so low-yield rain-fed crops are budgeted more cheaply.",
  "Fallow (a season with no crop, only weed control at about $45/acre) is offered only on rain-fed fields with under about 25 inches of rain a year.",
  "Irrigated fields: water need is met and about $110/acre pumping cost is added.",
  "Prices, costs, yield potentials and rotation yield effects are approximate defaults in src/engine/crops.ts and src/engine/regions.ts; replace them with local budgets.",
  "Winter wheat cannot be sown for the first plan year once its fall planting window has passed.",
];

export interface PlanInputs {
  request: PlanRequest;
  climate: DailyClimate;
  soil: SoilProfile;
  cropHistory: CropHistory;
  county: CountyInfo | null;
  /** Everything from USDA NASS for this county: yields by practice and current prices. Preferred input. */
  nass?: NassData | null;
  /** Crop-insurance losses by cause for the county (USDA RMA). */
  losses?: CountyLosses | null;
  /** Measured monthly evapotranspiration for the field (OpenET), to check the water model. */
  openEt?: EtMonth[] | null;
  /** Older simple inputs (tests): recent county average yield per crop, all practices. */
  yieldOverrides?: Partial<Record<CropId, number>>;
  /** Older simple inputs (tests): county yield for every reported year, all practices. */
  yieldHistory?: Partial<Record<CropId, YieldRecord[]>>;
  placeName?: string;
  planStartYear: number;
  now: Date;
}

/** Calibrated potential stays within this share of the state table value. */
const POTENTIAL_BOUNDS: [number, number] = [0.6, 1.15];

/** The crop that usually comes before `crop` in this kind of area (used for the replay of past years). */
export function usualPreviousCrop(crop: CropId, dryRegion: boolean): CropId {
  switch (crop) {
    case "corn":
      return "soybean";
    case "soybean":
    case "oats":
      return "corn";
    case "winter_wheat":
      return dryRegion ? "fallow" : "soybean";
    case "sorghum":
      return dryRegion ? "winter_wheat" : "soybean";
    default:
      return crop;
  }
}

/** Most recent crops known for the field, oldest first. Farmer input wins over satellite data. */
export function effectiveHistory(cropHistory: CropHistory, recentCrops?: CropId[]): CropId[] {
  if (recentCrops && recentCrops.length) return recentCrops.slice(-3);
  return cropHistory.years
    .map((y) => y.crop)
    .filter((c): c is CropId => c !== null)
    .slice(-3);
}

/** The water level a request asks for (older clients send only `irrigated`). */
export function waterLevelOf(request: PlanRequest): WaterLevel {
  return request.water ?? (request.irrigated ? "full" : "rain");
}

const WATER_WORDS: Record<WaterLevel, string> = {
  rain: "rain only",
  limited: "limited irrigation (about 10 in a year)",
  full: "full irrigation",
};

export function buildPlan(inputs: PlanInputs): PlanResponse {
  const { request, climate, cropHistory, county, planStartYear, now } = inputs;
  const checked = validateMeasurements({ soilTest: request.soilTest, yieldRecords: request.yieldRecords }, now.getUTCFullYear());
  if (typeof checked === "string") throw new Error(checked);
  const soil = effectiveSoil(inputs.soil, checked.soilTest);
  const history = effectiveHistory(cropHistory, request.recentCrops);
  const targetYear = planStartYear + 1;
  const level = waterLevelOf(request);

  const climateSummary = buildIndicators(climate, { lat: request.lat, lon: request.lon });

  // Winter wheat for the first plan year must be sown by about Oct 15 of the year before.
  const wheatDeadline = new Date(Date.UTC(planStartYear - 1, 9, 15));
  const firstYearWheatAllowed = now.getTime() < wheatDeadline.getTime();

  const waterBase = buildWaterContext(climate, soil, false);
  const waterMemo = new Map<WaterLevel, ReturnType<typeof buildWaterContext>>();
  const waterFor = (w: WaterLevel) => {
    let ctx = waterMemo.get(w);
    if (!ctx) waterMemo.set(w, ctx = { ...waterBase, irrigated: w === "full", allowanceMm: w === "limited" ? LIMITED_IRRIGATION_MM : 0 });
    return ctx;
  };
  const annualRain = meanAnnualRainMm(waterBase);
  const dryRegion = annualRain < FALLOW_MAX_ANNUAL_RAIN_MM;
  const region = availableCrops(county?.stateCode, ALL_CROPS);
  const prices = inputs.nass?.prices ?? {};
  const priceMap = Object.fromEntries(Object.entries(prices).map(([c, p]) => [c, p!.price])) as Partial<Record<CropId, number>>;

  // Weather work is shared: the crop climate depends only on full irrigation (canopy cooling) and on
  // whether trends are applied, so compute each variant once per plan.
  const weatherMemo: CropWeatherMemo = new Map();
  const ccMemo = new Map<string, ReturnType<typeof evaluateCropClimate>>();
  const cropClimateFor = (full: boolean, adjust: boolean) => {
    const key = `${full}:${adjust}`;
    let cc = ccMemo.get(key);
    if (!cc) {
      cc = evaluateCropClimate(climate, soil, full, adjust ? targetYear : climate.lastYear, { adjustTrends: adjust, weatherMemo });
      ccMemo.set(key, cc);
    }
    return cc;
  };

  // Real past years replayed rain-fed, without trend shifting: used to check the model and to calibrate.
  const replay = makeReplay(climate, soil, false, 0, cropClimateFor(false, false), waterFor("rain"));
  const fullReplay = makeReplay(climate, soil, true, 0, cropClimateFor(true, false), waterFor("full"));
  const replays = new Map<CropId, ReturnType<typeof replay>>();
  for (const crop of region.crops) replays.set(crop, replay(crop, usualPreviousCrop(crop, dryRegion)));
  const fracOf = (rs: ReturnType<typeof replay>) => {
    const r = rs.slice(-10);
    return r.length ? r.reduce((a, y) => a + y.yieldFrac, 0) / r.length : 0;
  };
  const recentFrac = (crop: CropId) => fracOf(replays.get(crop) ?? []);
  const table = statePotential(county?.stateCode);
  // Records describe the selected practice. Keep one inferred local potential across water comparisons.
  const localReplay = level === "full" ? fullReplay : level === "limited" ? makeReplay(climate, soil, false, LIMITED_IRRIGATION_MM, cropClimateFor(false, false), waterFor("limited")) : replay;
  const local = new Map<CropId, { count: number; average: number; fraction: number; fallback: number; years: number[] }>();
  for (const crop of region.crops) {
    const records = checked.yieldRecords?.filter((r) => r.crop === crop) ?? [];
    if (!records.length) continue;
    const rs = localReplay(crop, usualPreviousCrop(crop, dryRegion));
    const fallbackFrac = fracOf(rs);
    const fractions = records.map((r) => rs.find((y) => y.year === r.year)?.yieldFrac);
    local.set(crop, { count: records.length, average: records.reduce((a, r) => a + r.value, 0) / records.length,
      fraction: Math.max(0.25, fractions.reduce<number>((a, f) => a + (f ?? fallbackFrac), 0) / fractions.length),
      fallback: fractions.filter((f) => f === undefined).length, years: records.map((r) => r.year) });
  }

  /** Everything that depends on how much water the field gets. */
  const plansFor = (w: WaterLevel, quick = false) => {
    const full = w === "full";
    const allowance = w === "limited" ? LIMITED_IRRIGATION_MM : 0;
    const cropClimate = cropClimateFor(full, true);
    const water = waterFor(w);
    // Fallow where it is a real practice (dry, rain-fed), or where the farmer already uses it.
    const fallowAllowed = (w === "rain" && dryRegion) || history.includes("fallow");
    const crops = fallowAllowed ? [...region.crops, "fallow" as CropId] : region.crops;
    // USDA yields for the field's practice: irrigated fields (full or limited) are calibrated to irrigated
    // harvests with water need met; the limited-water simulation then shows the shortfall.
    const usda = inputs.nass ? usdaInputs(inputs.nass, w !== "rain", now.getUTCFullYear()) : null;
    const recentYields: Partial<Record<CropId, RecentYield>> = usda
      ? usda.recent
      : Object.fromEntries(Object.entries(inputs.yieldOverrides ?? {}).map(([c, v]) => [c, { value: v as number, basis: "county average (all fields)" }]));
    const calFrac = (crop: CropId) => (w === "rain" ? recentFrac(crop) : fracOf(fullReplay(crop, usualPreviousCrop(crop, dryRegion))));
    // Yield potential: the state table, calibrated to what the county really harvests:
    // potential = county average ÷ the share of potential the model says recent weather allowed.
    const yieldOverrides: Partial<Record<CropId, number>> = { ...table };
    for (const [c, rec] of Object.entries(recentYields) as [CropId, RecentYield][]) {
      if (c === "fallow") continue;
      const base = table[c] ?? CROPS[c].baseYield;
      const frac = Math.max(0.25, calFrac(c));
      yieldOverrides[c] = Math.round(Math.min(POTENTIAL_BOUNDS[1] * base, Math.max(POTENTIAL_BOUNDS[0] * base, rec.value / frac)) * 10) / 10;
    }
    const calibrations = [...local].map(([crop, rec]) => {
      const base = table[crop] ?? CROPS[crop].baseYield;
      const before = yieldOverrides[crop] ?? base;
      // Add half of the local-minus-regional potential difference, bounded as for NASS calibration.
      const after = Math.round(Math.min(POTENTIAL_BOUNDS[1] * base, Math.max(POTENTIAL_BOUNDS[0] * base, before + 0.5 * (rec.average / rec.fraction - before))) * 10) / 10;
      yieldOverrides[crop] = after;
      return { crop, ...rec, before, after };
    });
    const result = runEngine({
      cropClimate,
      history,
      priority: request.priority,
      goals: request.goals,
      planStartYear,
      baseYieldOverrides: yieldOverrides,
      firstYearWheatAllowed,
      crops,
      irrigated: full,
      water,
      prices: priceMap,
      ...(quick ? { quickSearch: 30 } : {}),
    });
    return { ...result, cropClimate, crops, fallowAllowed, recentYields, usda, allowance, calibrations };
  };

  const main = plansFor(level);
  const { plans, currentPractice, cropClimate, crops, fallowAllowed, recentYields } = main;

  // What if the water changes? Best plan for each level (the requested one is reused).
  const waterOptions: WaterOption[] = (["rain", "limited", "full"] as WaterLevel[]).flatMap((w) => {
    // Quick search for the comparison, except for soil priority, where cover crops decide the ranking.
    const best = (w === level ? main : plansFor(w, request.priority !== "soil")).plans[0];
    return best
      ? [{ water: w, bestLabel: best.label, crops: best.years.map((y) => y.crop), badYearsIn10: best.badYearsIn10, avgNetReturnPerAcre: best.avgNetReturnPerAcre, waterPumpedIn: best.waterPumpedIn }]
      : [];
  });

  // The model's rain-fed replay is checked against USDA's non-irrigated yields where they exist.
  // With only the combined series, skip crops that are clearly not grown rain-fed here (model says under
  // 45% of potential): those county yields come from irrigated fields.
  const rainUsda = inputs.nass ? usdaInputs(inputs.nass, false, now.getUTCFullYear()) : null;
  const validationSeries: Partial<Record<CropId, ValidationSeries>> = rainUsda
    ? rainUsda.validation
    : Object.fromEntries(Object.entries(inputs.yieldHistory ?? {}).map(([c, r]) => [c, { records: r as YieldRecord[], practice: "all", area: "county" }]));
  const validation: CropValidation[] = [];
  for (const [c, series] of Object.entries(validationSeries) as [CropId, ValidationSeries][]) {
    const r = replays.get(c);
    if (!r || (series.practice === "all" && recentFrac(c) < 0.45)) continue;
    const v = validateCrop(c, usualPreviousCrop(c, dryRegion), r, series.records, { practice: series.practice, area: series.area }, inputs.losses);
    if (v) validation.push(v);
  }
  validation.sort((a, b) => b.years.length - a.years.length || b.correlation - a.correlation);

  // The field's water level, replayed on real past years (no trend shifting).
  const fieldReplay = level === "full" ? fullReplay : level === "limited" ? makeReplay(climate, soil, false, LIMITED_IRRIGATION_MM, cropClimateFor(false, false), waterFor("limited")) : replay;

  // Water check: our crop water use vs. OpenET's measured water use, for the crops actually grown here.
  let waterCheck: WaterCheck | null = null;
  if (inputs.openEt?.length && cropHistory.years.length) {
    waterCheck = checkWaterUse(inputs.openEt, cropHistory.years, fieldReplay, (c) => usualPreviousCrop(c, dryRegion));
  }

  // "Replay a bad year": the field's own worst past years, current crops vs. the plan, next to reality.
  const droughtReplays: DroughtReplay[] = plans[0]
    ? buildDroughtReplays({
        climate: climateSummary,
        replay: fieldReplay,
        plan: plans[0],
        current: currentPractice,
        lastCrop: history[history.length - 1] ?? null,
        usualPrev: (c) => usualPreviousCrop(c, dryRegion),
        prices: priceMap,
        countyYields: Object.fromEntries(
          [...new Set([...Object.keys(validationSeries), ...Object.keys(inputs.nass?.county ?? {})])].map((c) => {
            const crop = c as CropId;
            const list: { records: YieldRecord[]; fields: "rain-fed" | "all" }[] = [];
            const v = validationSeries[crop];
            if (v) list.push({ records: v.records, fields: v.practice === "rain-fed" ? "rain-fed" : "all" });
            // USDA stopped rain-fed splits around 2010: fall back to the all-fields county series for recent years.
            const all = inputs.nass?.county[crop]?.all;
            if (all?.length && v?.practice !== "all") list.push({ records: all, fields: "all" });
            return [crop, list];
          }),
        ),
        losses: inputs.losses ?? null,
      })
    : [];

  for (const plan of [...plans, ...(currentPractice ? [currentPractice] : [])]) {
    plan.includes_non_corn_year = plan.years.some((y) => y.crop !== "corn");
  }

  const facts = buildFacts({
    climate: climateSummary,
    cropClimate,
    soil: checked.soilTest ? { ...soil, source: "Farmer-entered soil test for supplied properties; USDA soil map for other properties" } : soil,
    history: cropHistory,
    effectiveHistory: history,
    plans,
    currentPractice,
    irrigated: level === "full",
    losses: inputs.losses ?? null,
    countyName: county?.countyName ?? null,
  });

  // Keep the original map in the response; all engine consumers above use the effective profile.
  const soilFacts = request.soilTest;
  if (soilFacts) {
    const es = request.language === "es";
    for (const [key, label, unit] of [["ph", "pH", ""], ["organicMatterPct", es ? "materia orgánica" : "organic matter", "%"], ["awc", es ? "agua disponible" : "available water capacity", " cm/cm"]] as const) {
      if (soilFacts[key] === undefined && !(key === "awc" && soilFacts.texture)) continue;
      const value = `${soil[key]}${unit}`;
      const mapped = inputs.soil[key] === undefined ? (es ? "no disponible" : "unavailable") : `${Number(inputs.soil[key]!.toFixed(key === "awc" ? 3 : 1))}${unit}`;
      const inferred = key === "awc" && soilFacts.awc === undefined;
      const text = es
        ? `Usando tu análisis de suelo: ${label} ${value} en lugar del mapa de suelos: ${mapped}.`
        : `Using your soil test ${label} ${value} instead of the soil map's ${mapped}.`;
      facts.push({ id: `farmer-soil-${key}`, kind: "soil", source: es ? "Datos del agricultor (sin verificar)" : "Farmer-entered soil test (unverified)", text: text + (inferred ? (es ? ` Capacidad aproximada a partir de la textura ${soilFacts.texture}; no medida.` : ` Approximate capacity inferred from your ${soilFacts.texture} texture; not measured.`) : "") });
    }
    if (soilFacts.organicMatterPct !== undefined) facts.push({ id: "farmer-om-limit", kind: "soil", source: "SoilSense model limitation", text: es ? "La materia orgánica reemplaza el valor del mapa en la evidencia; el modelo no calcula cambios de rendimiento ni de agua a partir de ella." : "Your organic matter replaces the map value in soil evidence; the model does not infer yield or water capacity changes from organic matter." });
  }

  for (const c of main.calibrations) {
    const es = request.language === "es";
    const unit = c.crop === "alfalfa" ? "US short tons/acre" : "bu/acre";
    facts.push({ id: `farmer-yield-${c.crop}`, kind: "agronomy", source: es ? "Rendimientos del agricultor (sin verificar); calibración SoilSense" : "Farmer-entered harvest records (unverified); SoilSense local calibration",
      text: es
        ? `Calibrado con tus ${c.count} años de rendimientos de ${CROP_ES[c.crop]} (${c.years.join(", ")}), promedio ${c.average.toFixed(1)} ${unit}. Potencial regional ${c.before.toFixed(1)} → ${c.after.toFixed(1)}: ajuste del 50% hacia promedio ÷ fracción climática ${c.fraction.toFixed(3)}, limitado al 60–115% del valor estatal. ${c.fallback} años fuera del historial usan la fracción de los últimos 10 años. Se supone el mismo riego y cultivo anterior típico; no es una validación independiente.`
        : `Calibrated with your ${c.count} years of ${CROPS[c.crop].name.toLowerCase()} yields (${c.years.join(", ")}), average ${c.average.toFixed(1)} ${unit}. Regional potential ${c.before.toFixed(1)} → ${c.after.toFixed(1)}: additive 50% adjustment toward average ÷ modeled weather fraction ${c.fraction.toFixed(3)}, bounded to 60–115% of the state value. ${c.fallback} years outside weather history use the last-10-year fraction. Assumes the selected water supply and usual previous crop; not independent validation.` });
  }
  for (const record of checked.yieldRecords ?? []) {
    if (!local.has(record.crop) && !facts.some((f) => f.id === `farmer-yield-${record.crop}`)) facts.push({ id: `farmer-yield-${record.crop}`, kind: "agronomy", source: "Farmer records", text: request.language === "es" ? `Rendimientos de ${CROPS[record.crop].name} guardados en este navegador, pero este cultivo no se modela en esta región; no se aplicó calibración.` : `Your ${CROPS[record.crop].name.toLowerCase()} yields are stored in this browser, but this crop is not modeled in this region; no calibration was applied.` });
  }

  for (const goal of plans[0]?.scores.goals ?? []) {
    facts.push({ id: `goal-${goal.goal}`, kind: "agronomy", source: "SoilSense engine: simulated water/N and rotation proxies (src/engine/goals.ts)", text: `${goal.reason} Adds +${goal.bonus.toFixed(4)} to the unchanged priority score.` });
  }

  if (plans[0]) {
    const advice = planAdvice(plans[0], level);
    facts.push({ id: `advice-${advice.version}`, kind: "agronomy", source: "Versioned model-assumption checklist",
      text: `Ask your agronomist about: ${advice.checks.join(" ")}` });
    for (const note of advice.pestNotes) facts.push({ id: `pest-${note.pest}`, kind: "agronomy", source: note.sourceUrl,
      text: `${note.sequence}. ${note.potentialEffect} ${note.conditions.join(" ")}` });
    if (advice.undocumentedBenefit) facts.push({ id: "pest-undocumented", kind: "agronomy", source: "Plan crop phases", text: advice.undocumentedBenefit });
  }

  const explanation = buildExplanation({
    plans,
    currentPractice,
    climate: climateSummary,
    facts,
    priority: request.priority,
    placeName: inputs.placeName ?? (county ? `${county.countyName}, ${county.stateCode}` : undefined),
    language: request.language,
  });

  return {
    request: { ...request, water: level, irrigated: level !== "rain" },
    generatedAt: now.toISOString(),
    location: { county, lat: request.lat, lon: request.lon },
    soil: inputs.soil,
    cropHistory,
    climate: climateSummary,
    plans,
    currentPractice,
    facts,
    explanation,
    assumptions: [
      ...ASSUMPTIONS,
      ...(plans[0]?.scores.goals?.length ? ["Optional farmer goals add at most +0.1 total to the unchanged priority score, shared equally between the selected goals. Metrics are min–max normalized across feasible candidate plans before choosing covers; ties earn no bonus. Feasibility and crop-reliability gates still take precedence. Water uses simulated pumping (rain-only: main-crop water use); N uses lower fertilizer after credits (70%) and legume seasons (30%); erosion and organic matter use explicit rotation proxies, not measured outcomes. Forage-market bonus requires that goal; hay economics are unchanged."] : []),
      ...region.notes,
      `Water: ${WATER_WORDS[level]}.${level === "limited" ? " Limited irrigation covers the crop's shortfall first, up to about 10 inches a season, as in K-State's Tribune limited-irrigation trial; stored soil water covers the rest." : ""} Pumping costs about $8 per inch of water per acre.`,
      "Bad years out of 10: how often a crop would have been badly stressed when replayed through the 35 years of NASA weather (shifted to today's climate trends), averaged over the plan's crops.",
      Object.keys(recentYields).length
        ? `Yield potential is calibrated to real USDA NASS harvests for ${level === "rain" ? "rain-fed" : "irrigated"} fields: recent average ÷ the share of potential the model says recent weather allowed (kept within 60–115% of the state value).`
        : `Yield potential uses approximate ${county?.stateCode ?? "Iowa"} state values (add a USDA NASS API key for county averages).`,
      ...(Object.entries(recentYields) as [CropId, RecentYield][])
        .filter(([c]) => (crops as CropId[]).includes(c))
        .map(([c, r]) => `${CROPS[c].name} yield basis: ${r.basis}.`),
      ...(Object.keys(prices).length
        ? [
            `Prices: USDA NASS prices received, average of the latest months — ${(Object.entries(prices) as [CropId, NonNullable<(typeof prices)[CropId]>][])
              .filter(([c]) => (crops as CropId[]).includes(c))
              .map(([c, p]) => `${CROPS[c].name.toLowerCase()} $${p.price.toFixed(2)}${p.unit.replace("$", "")} (${p.level}, ${p.months} months to ${p.through})`)
              .join(", ")}. Other prices are defaults.`,
          ]
        : ["Prices are approximate defaults (add a USDA NASS API key for current state prices)."]),
      `This area averages about ${Math.round(annualRain / 25.4)} inches of rain a year; fallow was ${fallowAllowed ? "" : "not "}considered.`,
      "Replayed past years are history, not a forecast: each uses that year's real NASA weather on this soil, compared with what the county really harvested (USDA NASS) and why crop insurance paid out (USDA RMA).",
    ],
    ...(climate.powerEvidence ? { powerEvidence: climate.powerEvidence } : {}),
    dataSources: DATA_SOURCES,
    disclaimer: DISCLAIMER,
    water: level,
    waterOptions,
    ...(droughtReplays.length ? { droughtReplays } : {}),
    ...(validation.length ? { validation } : {}),
    ...(waterCheck ? { waterCheck } : {}),
  };
}
