// Pure orchestration: data in, full plan response out. No network calls here,
// so the whole engine is unit-testable with fixtures.

import type { CountyInfo, CountyLosses, CropHistory, CropId, CropValidation, EtMonth, NassData, PlanRequest, PlanResponse, SoilProfile, WaterCheck } from "../shared/types";
import { buildIndicators, type DailyClimate } from "./climate";
import { buildExplanation, buildFacts } from "./explain";
import { ALL_CROPS, CROPS } from "./crops";
import { availableCrops, FALLOW_MAX_ANNUAL_RAIN_MM, statePotential } from "./regions";
import { buildWaterContext, evaluateCropClimate, makeReplay, meanAnnualRainMm, runEngine } from "./rotation";
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

export function buildPlan(inputs: PlanInputs): PlanResponse {
  const { request, climate, soil, cropHistory, county, planStartYear, now } = inputs;
  const history = effectiveHistory(cropHistory, request.recentCrops);
  const targetYear = planStartYear + 1;

  const climateSummary = buildIndicators(climate, { lat: request.lat, lon: request.lon });
  const cropClimate = evaluateCropClimate(climate, soil, request.irrigated, targetYear);

  // Winter wheat for the first plan year must be sown by about Oct 15 of the year before.
  const wheatDeadline = new Date(Date.UTC(planStartYear - 1, 9, 15));
  const firstYearWheatAllowed = now.getTime() < wheatDeadline.getTime();

  const water = buildWaterContext(climate, soil, request.irrigated);
  const annualRain = meanAnnualRainMm(water);
  const region = availableCrops(county?.stateCode, ALL_CROPS);
  // Fallow where it is a real practice (dry, rain-fed), or where the farmer already uses it.
  const fallowAllowed = (!request.irrigated && annualRain < FALLOW_MAX_ANNUAL_RAIN_MM) || history.includes("fallow");
  const crops = fallowAllowed ? [...region.crops, "fallow" as CropId] : region.crops;
  // USDA inputs: recent yield for THIS field's practice, the series to check against, and prices.
  const usda = inputs.nass ? usdaInputs(inputs.nass, request.irrigated, now.getUTCFullYear()) : null;
  const recentYields: Partial<Record<CropId, RecentYield>> = usda
    ? usda.recent
    : Object.fromEntries(Object.entries(inputs.yieldOverrides ?? {}).map(([c, v]) => [c, { value: v as number, basis: "county average (all fields)" }]));
  const validationSeries: Partial<Record<CropId, ValidationSeries>> = usda
    ? usda.validation
    : Object.fromEntries(Object.entries(inputs.yieldHistory ?? {}).map(([c, r]) => [c, { records: r as YieldRecord[], practice: "all", area: "county" }]));
  const prices = usda?.prices ?? {};

  // Replay the real past years (rain-fed, no trend shifting) for each crop after its usual previous crop here.
  const dryRegion = annualRain < FALLOW_MAX_ANNUAL_RAIN_MM;
  const replay = makeReplay(climate, soil, false);
  const replays = new Map<CropId, ReturnType<typeof replay>>();
  for (const crop of region.crops) replays.set(crop, replay(crop, usualPreviousCrop(crop, dryRegion)));
  // Calibration uses the field's own practice: an irrigated field is replayed with water need met.
  const calReplay = request.irrigated ? makeReplay(climate, soil, true) : replay;
  const fracOf = (rs: ReturnType<typeof replay>) => {
    const r = rs.slice(-10);
    return r.length ? r.reduce((a, y) => a + y.yieldFrac, 0) / r.length : 0;
  };
  const recentFrac = (crop: CropId) => fracOf(replays.get(crop) ?? []);
  const calFrac = (crop: CropId) => (request.irrigated ? fracOf(calReplay(crop, usualPreviousCrop(crop, dryRegion))) : recentFrac(crop));

  // Yield potential: start from the state table, then calibrate to what the county really harvests:
  // potential = county average / the share of potential the model says recent weather allowed.
  const table = statePotential(county?.stateCode);
  const yieldOverrides: Partial<Record<CropId, number>> = { ...table };
  for (const [c, rec] of Object.entries(recentYields) as [CropId, RecentYield][]) {
    if (c === "fallow") continue;
    const base = table[c] ?? CROPS[c].baseYield;
    const frac = Math.max(0.25, calFrac(c));
    yieldOverrides[c] = Math.round(Math.min(POTENTIAL_BOUNDS[1] * base, Math.max(POTENTIAL_BOUNDS[0] * base, rec.value / frac)) * 10) / 10;
  }

  // The model's rain-fed replay is checked against USDA's non-irrigated yields where they exist.
  // With only the combined series, skip crops that are clearly not grown rain-fed here (model says under
  // 45% of potential): those county yields come from irrigated fields.
  const validation: CropValidation[] = [];
  for (const [c, series] of Object.entries(validationSeries) as [CropId, ValidationSeries][]) {
    const r = replays.get(c);
    if (!r || (series.practice === "all" && recentFrac(c) < 0.45)) continue;
    const v = validateCrop(c, usualPreviousCrop(c, dryRegion), r, series.records, { practice: series.practice, area: series.area }, inputs.losses);
    if (v) validation.push(v);
  }
  validation.sort((a, b) => b.years.length - a.years.length || b.correlation - a.correlation);

  // Water check: our crop water use vs. OpenET's measured water use, for the crops actually grown here.
  let waterCheck: WaterCheck | null = null;
  if (inputs.openEt?.length && cropHistory.years.length) {
    const fieldReplay = request.irrigated ? makeReplay(climate, soil, true) : replay;
    waterCheck = checkWaterUse(inputs.openEt, cropHistory.years, fieldReplay, (c) => usualPreviousCrop(c, dryRegion));
  }

  const { plans, currentPractice } = runEngine({
    cropClimate,
    history,
    priority: request.priority,
    planStartYear,
    baseYieldOverrides: yieldOverrides,
    firstYearWheatAllowed,
    crops,
    irrigated: request.irrigated,
    water,
    prices: Object.fromEntries(Object.entries(prices).map(([c, p]) => [c, p!.price])) as Partial<Record<CropId, number>>,
  });

  const facts = buildFacts({
    climate: climateSummary,
    cropClimate,
    soil,
    history: cropHistory,
    effectiveHistory: history,
    plans,
    currentPractice,
    irrigated: request.irrigated,
    losses: inputs.losses ?? null,
    countyName: county?.countyName ?? null,
  });

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
    request,
    generatedAt: now.toISOString(),
    location: { county, lat: request.lat, lon: request.lon },
    soil,
    cropHistory,
    climate: climateSummary,
    plans,
    currentPractice,
    facts,
    explanation,
    assumptions: [
      ...ASSUMPTIONS,
      ...region.notes,
      Object.keys(recentYields).length
        ? `Yield potential is calibrated to real USDA NASS harvests for ${request.irrigated ? "irrigated" : "rain-fed"} fields: recent average ÷ the share of potential the model says recent weather allowed (kept within 60–115% of the state value).`
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
    ],
    dataSources: DATA_SOURCES,
    disclaimer: DISCLAIMER,
    ...(validation.length ? { validation } : {}),
    ...(waterCheck ? { waterCheck } : {}),
  };
}
