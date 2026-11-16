import type { ConstraintReport, FarmerConstraints } from './constraints';
export type { FarmerConstraints } from './constraints';
// Types shared by the Worker API, the engine and the dashboard.
import type { FertilizerInputs, PlanFertilizer } from "./fertilizer";

/** "fallow" = no crop for a season (weed control only) so the soil stores water; offered only on dry rain-fed fields. */
export type CropId = "corn" | "soybean" | "winter_wheat" | "oats" | "alfalfa" | "sorghum" | "fallow";
export type CoverId = "none" | "cereal_rye" | "crimson_clover" | "hairy_vetch";
export type Priority = "profit" | "soil" | "risk" | "balanced";
/** Optional preferences, independent of the four unchanged priority weightings. */
export const GOALS = ["water_conservation", "nitrogen_fixation", "erosion_control", "organic_matter", "forage_market"] as const;
export type Goal = (typeof GOALS)[number];

export interface GoalScore {
  goal: Goal;
  /** 0–1, relative to feasible candidate plans; equal metrics earn no bonus. */
  normalized: number;
  bonus: number;
  /** Engine outputs or explicitly labeled rotation proxies, not measured field outcomes. */
  metrics: { label: string; value: number; unit: string }[];
  reason: string;
}

/**
 * How much water the field gets beyond rain: none; a limited allowance (about 10 in a year, as in K-State's
 * Tribune limited-irrigation trial, e.g. a declining well or an allocation); or full irrigation.
 */
export type WaterLevel = "rain" | "limited" | "full";

export interface LatLon {
  lat: number;
  lon: number;
}

export interface CountyInfo {
  countyFips: string;
  countyName: string;
  stateCode: string;
  stateName: string;
}

export interface SoilProfile {
  available: boolean;
  source: string;
  mapUnitKey?: string;
  mapUnitName?: string;
  componentName?: string;
  drainageClass?: string;
  /** Weighted over 0–30 cm. */
  ph?: number;
  organicMatterPct?: number;
  clayPct?: number;
  sandPct?: number;
  /** Available water capacity, cm water per cm soil, weighted over the profile. */
  awc?: number;
  /** Depth of described profile, cm. */
  profileDepthCm?: number;
}

export interface CropHistoryYear {
  year: number;
  cdlCode: number;
  cdlName: string;
  /** Mapped to an engine crop where possible. */
  crop: CropId | null;
}

export interface CropHistory {
  available: boolean;
  source: string;
  years: CropHistoryYear[];
  note?: string;
}

export interface TrendResult {
  /** Mann-Kendall S statistic. */
  s: number;
  z: number;
  pValue: number;
  /** Sen's slope, units per year. */
  slopePerYear: number;
  intercept: number;
  n: number;
  lag1Autocorrelation: number;
  autocorrelationCorrected: boolean;
  verdict: "significant_increase" | "significant_decrease" | "no_clear_change" | "insufficient_data";
}

export interface ClimateIndicator {
  id: string;
  label: string;
  /** Display unit, e.g. "in" or "days". Values below are already in display units. */
  unit: string;
  description: string;
  years: number[];
  values: number[];
  trend: TrendResult;
  /** Change per decade in display units. */
  changePerDecade: number;
  mean: number;
  source: string;
}

export interface ClimateSummary {
  location: LatLon;
  /** Grid cell actually requested from NASA POWER. */
  gridCell: LatLon;
  firstYear: number;
  lastYear: number;
  indicators: ClimateIndicator[];
  source: string;
}

export interface ScoreBreakdown {
  /** Additive preference bonus, at most 0.1 total; absent with no goals. */
  goalsBonus?: number;
  /** Unmodified priority subtotal before the optional bonus. */
  priorityTotal?: number;
  goals?: GoalScore[];
  climate: number;
  reliability: number;
  soil: number;
  profit: number;
  total: number;
}

export interface PlanYear {
  year: number;
  crop: CropId;
  cropName: string;
  cover: CoverId;
  coverName: string;
  /** Mean trend-adjusted climate score for this crop at this site, 0–1. */
  climateScore: number;
  /** Share of adjusted historical years in which this crop met its needs. */
  reliability: number;
  /** Main limiting factor across stressed years, if any. */
  mainStress: string | null;
  expectedYield: number;
  yieldUnit: string;
  nitrogenLbPerAcre: number;
  netReturnPerAcre: number;
  /** Average irrigation water pumped for this crop year, inches (0 when rain-fed). */
  waterPumpedIn?: number;
}

export interface RotationPlan {
  /** Opt-in display-only guideline; never used in ranking or economics. */
  fertilizer?: PlanFertilizer;
  /** Factual crop-phase metadata; never a universal pest-protection claim. */
  includes_non_corn_year?: boolean;
  id: string;
  label: string;
  years: PlanYear[];
  scores: ScoreBreakdown;
  avgNetReturnPerAcre: number;
  totalNitrogenLbPerAcre: number;
  coverYears: number;
  notes: string[];
  /** How many years in 10 the plan's crops would be badly stressed (from the 35-year replay), 0-10. */
  badYearsIn10: number;
  /** Average irrigation water pumped per calendar year over the plan, inches. */
  waterPumpedIn: number;
  /** Simulated main-crop water use, inches/calendar year; supplied only with selected goals. */
  waterUseIn?: number;
}

export interface ReasonFact {
  id: string;
  text: string;
  source: string;
  significant?: boolean;
  kind: "climate" | "history" | "soil" | "agronomy" | "economics";
}

/** Farmer-entered measurements; never persisted on the server. Blank properties use the soil map. */
export interface SoilTest extends FertilizerInputs {
  ph?: number;
  organicMatterPct?: number;
  /** cm water / cm soil (equivalently in/in). Takes precedence over texture. */
  awc?: number;
  texture?: "sand" | "sandy_loam" | "loam" | "silt_loam" | "clay_loam" | "clay";
}
export interface FarmerYield {
  crop: Exclude<CropId, "fallow">;
  year: number;
  value: number;
  /** Grain in bu/acre; alfalfa hay in US short tons/acre. */
  unit: "bu/acre" | "tons/acre";
}

export interface PlanRequest {
  constraints?: FarmerConstraints;
  /** Optional farmer-entered $/yield-unit prices; override NASS and prototype defaults. */
  prices?: Partial<Record<CropId, number>>;
  /** Sensitivity over historical price scenarios for selected plans only, not a forecast. */
  priceScenarios?: boolean;
  soilTest?: SoilTest;
  yieldRecords?: FarmerYield[];
  lat: number;
  lon: number;
  irrigated: boolean;
  priority: Priority;
  /** Optional multi-select of at most two distinct goals. Empty preserves existing rankings. */
  goals?: Goal[];
  /** Water beyond rain. When missing, irrigated=true means "full" and false means "rain". */
  water?: WaterLevel;
  /** Optional override when satellite crop history is unavailable. Most recent last. */
  recentCrops?: CropId[];
  language?: "en" | "es";
}

export interface PlanResponse {
  constraints?: ConstraintReport;
  priceSensitivity?: import("./prices").PriceSensitivity;
  request: PlanRequest;
  generatedAt: string;
  location: { county: CountyInfo | null; lat: number; lon: number };
  soil: SoilProfile;
  cropHistory: CropHistory;
  climate: ClimateSummary;
  plans: RotationPlan[];
  currentPractice: RotationPlan | null;
  facts: ReasonFact[];
  explanation: { summary: string; speech: string; sms: string };
  assumptions: string[];
  dataSources: { name: string; url: string; usedFor: string }[];
  disclaimer: string;
  /** How the model's replay of past years compares with real county harvests (needs a USDA NASS key). */
  validation?: CropValidation[];
  /** Our crop water use vs. water use measured from satellites on this field (OpenET), when available. */
  waterCheck?: WaterCheck;
  /** The water level this plan was built for. */
  water?: WaterLevel;
  /** Best plan under each water level (rain only, limited, full irrigation). */
  waterOptions?: WaterOption[];
  /** The field's own worst past years, replayed for the current crops and the plan. */
  droughtReplays?: DroughtReplay[];
  /** Original POWER request provenance, never the plan generation timestamp. */
  powerEvidence?: PowerEvidence;
}

export interface PowerEvidence {
  url: string;
  version: string | null;
  retrievedAt: string | null;
  period: string;
  observedThrough: string | null;
  validValues: number;
  expectedValues: number;
  cached: boolean;
}

/** Model hindcast vs. USDA NASS county yields for one crop. */
export interface CropValidation {
  crop: CropId;
  cropName: string;
  /** The crop assumed to come before it (the usual practice in this area). */
  afterCropName: string;
  unit: string;
  years: number[];
  /** Real county average yield each year. */
  actual: number[];
  /** Model estimate each year: the long-term yield trend times the model's weather effect for that year. */
  modeled: number[];
  /** Pearson correlation between real and modelled year-to-year departures from trend, -1 to 1. */
  correlation: number;
  /** Years where model and reality agree on better or worse than usual. */
  sameDirection: number;
  /** Of the 5 worst real years, how many the model also rated below average. */
  worstYearsFlagged: number;
  /** cause: the main reason crop insurance paid out that year in this county (USDA RMA), if known. */
  worstYears: { year: number; actualPct: number; modeledPct: number; cause?: string }[];
  /** Of the worst real years the model under-called (saw less than half of the drop), how many crop insurance blames mainly on things a weather-and-water model cannot see (hail, wind, flood, disease). */
  missesExplained?: { missed: number; otherCauses: number; causes: string[] };
  source: string;
  /** "rain-fed" when compared with USDA's non-irrigated yields, "all" when only the combined series exists. */
  practice: "rain-fed" | "all";
  /** "county" or the name of the USDA agricultural district the records come from. */
  area: string;
}

/** One month of measured actual evapotranspiration (OpenET), mm. */
export interface EtMonth {
  year: number;
  month: number;
  et: number;
}

/** Model crop water use vs. OpenET measured evapotranspiration over each crop's season, per year. */
export interface WaterCheck {
  years: number[];
  /** Crop on the field that year (USDA satellite crop map), display name. */
  crops: string[];
  /** OpenET actual evapotranspiration over the crop's season, mm. */
  measured: number[];
  /** Our model's water use over the same season, mm. */
  modeled: number[];
  /** Pearson correlation between measured and modelled, -1 to 1. */
  correlation: number;
  /** Measured ÷ modelled, averaged over the years: above 1 means the crop used more water than we estimate. */
  ratio: number;
  source: string;
}

// ---------- USDA RMA crop-insurance losses ----------

export type LossGroup = "drought" | "wet" | "hail" | "wind" | "cold" | "pests" | "other";

/** Crop-insurance indemnities ($) by cause group, per crop and year, for one county. */
export interface CountyLosses {
  groups: LossGroup[];
  crops: Partial<Record<CropId, Record<string, number[]>>>;
  firstYear: number;
  lastYear: number;
  source: string;
}

// ---------- USDA NASS data (real harvests and prices) ----------

export interface YieldRecord {
  year: number;
  value: number;
}

/** Yield series for one crop at one geographic level. */
export interface PracticeSeries {
  /** All production practices combined (the only split NASS still publishes for recent years). */
  all: YieldRecord[];
  irrigated: YieldRecord[];
  nonIrrigated: YieldRecord[];
}

export interface CropPrice {
  /** In the engine's unit: $/bu, or $/ton for alfalfa hay. */
  price: number;
  unit: string;
  months: number;
  /** Latest month included, e.g. "Sep 2026". */
  through: string;
  level: "state" | "national";
}

export interface NassData {
  county: Partial<Record<CropId, PracticeSeries>>;
  district: Partial<Record<CropId, PracticeSeries>>;
  districtName: string | null;
  prices: Partial<Record<CropId, CropPrice>>;
  errors: string[];
}

/** One crop's outcome in a replayed past year. */
export interface ReplayCropOutcome {
  crop: CropId;
  cropName: string;
  afterCropName: string;
  /** Estimated yield in that year's real weather on this field (typical plan yield × that year's relative outcome). */
  yield: number;
  unit: string;
  /** Percent above/below this crop's typical yield here. */
  pctVsTypical: number;
  /** Net return that year at today's prices and typical costs, $/acre. */
  netPerAcre: number;
  mainStress: string | null;
}

export interface ReplayPlanOutcome {
  label: string;
  crops: ReplayCropOutcome[];
  /** Average net return across the rotation's crops that year, $/acre (null if no crop could be replayed). */
  avgNetPerAcre: number | null;
}

/** "Replay a bad year": history, never a forecast. */
export interface DroughtReplay {
  year: number;
  weather: { seasonRainIn: number | null; typicalSeasonRainIn: number | null; hotDays: number | null; typicalHotDays: number | null };
  /** The farmer's current crops (null when unknown). */
  current: ReplayPlanOutcome | null;
  /** Our recommended plan. */
  plan: ReplayPlanOutcome;
  /** What really happened to the county's harvest that year (USDA NASS), % vs. the long-term trend. */
  /** fields: "rain-fed" = USDA non-irrigated series; "all" = all fields combined (irrigated included). */
  county: { crop: CropId; cropName: string; actualPct: number; fields: "rain-fed" | "all" }[];
  /** Main reason crop insurance paid out that year in the county (USDA RMA). */
  insurance: { crop: CropId; cropName: string; cause: string }[];
}

/** Best plan for each water level, so a farmer can see what changes if the well runs low or dry. */
export interface WaterOption {
  water: WaterLevel;
  bestLabel: string;
  crops: CropId[];
  badYearsIn10: number;
  avgNetReturnPerAcre: number;
  waterPumpedIn: number;
}

export interface FieldResponse {
  lat: number;
  lon: number;
  county: CountyInfo | null;
  soil: SoilProfile;
  cropHistory: CropHistory;
}

export interface ApiError {
  error: string;
  detail?: string;
}

/** One rotation from K-State's recommended rain-fed (dryland) list, as ranked by our teammate's Kansas model. */
export interface KStateRotation {
  rank: number;
  /** K-State code, e.g. "W-S-F". */
  code: string;
  name: string;
  /** Share of the top 3 (they total 100%). */
  weightPct: number;
  /** The rotation's crops in our crop ids (double-crop soy counts as soybean). */
  crops: CropId[];
  note: string | null;
}

/**
 * "Second opinion" for Kansas fields: a separate weather-only model (kansas-crop-rotation/, published weekly to
 * Cloudflare R2) that ranks K-State's recommended dryland rotations for the county.
 */
export interface SecondOpinion {
  source: string;
  sourceUrl: string;
  dataThrough: string;
  disclaimer: string;
  county: string;
  /** K-State region the candidate list comes from (west / central / east). */
  region: string | null;
  alert: string;
  /** Chance of drought in the district within 4 weeks (0–1), from NASA POWER soil wetness and rain. */
  droughtChanceNow: number | null;
  /** Root-zone soil wetness now, as a percentile of past years at this time of year (0–100). */
  rootzonePctNow: number | null;
  /** Ranking basis from the Kansas file; preferred over the legacy alert flag. */
  basis?: string | null;
  /** True when the ranking uses dry-year scores. */
  dryYearRanking: boolean;
  /** True when R2 was unavailable and the bundled offline file was used. */
  savedCopy?: boolean;
  rotations: KStateRotation[];
  /** Rankings limited to rotations that include the crop the farmer grows now. */
  byCurrentCrop: Partial<Record<"corn" | "sorghum" | "soybean" | "wheat", { message: string | null; rotations: KStateRotation[] }>>;
}


// MODIS historical coarse-pixel vegetation evidence (#19).
export interface ModisObservation {
  modisDate: string; compositeStart: string; compositeEnd: string; observationDate: string | null;
  ndvi: number | null; reliability: number | null; quality: number | null; version: string | null;
  processingDate: string | null; tile: string | null; reason: string;
}
export interface ModisVegetation {
  status: "complete" | "partial" | "unavailable"; product: string; version: string;
  lat: number; lon: number; year: number; resolution: string; interval: string; units: string; scale: number;
  expectedCount: number; validCount: number; observations: ModisObservation[];
  requestUrls: string[]; retrievedAt: string | null; docsUrl: string; attribution: string; note: string;
}
// ---- U.S. Drought Monitor context (GitHub issue #31) ----

/** USDM categories: none (no drought), D0 abnormally dry, D1–D4 drought. */
export type UsdmCategory = "none" | "D0" | "D1" | "D2" | "D3" | "D4";

/** One weekly USDM map, summarised for one county (categorical = exclusive % of county area). */
export interface UsdmWeek {
  /** Map valid date (Tuesday data cutoff), YYYY-MM-DD. Snapshot id: usdm-county-<fips>-<validStart>. */
  validStart: string;
  /** Last day this map is the current one (the following Monday), YYYY-MM-DD. */
  validEnd: string;
  /** % of the county's area in each category; exclusive, so they add up to ~100. */
  pct: Record<UsdmCategory, number>;
  /** Category covering the largest share of the county. */
  predominant: UsdmCategory;
  /** Most severe category present anywhere in the county (> 0% area). */
  worst: UsdmCategory;
  /** True when a USDM category boundary crosses the county, so a field could sit in more than one category. */
  mixed: boolean;
  /** Official dated state map image for this week. */
  mapUrl: string;
}

export interface UsdmSourceInfo {
  name: string;
  attribution: string;
  /** Exact request URL that returned these weeks. */
  requestUrl: string;
  docsUrl: string;
  statistics: string;
  spatial: string;
  crs: string;
  publication: string;
  retrievedAt: string;
}

/** A run of weekly USDM maps for one county and date window. */
export interface UsdmTimeline {
  fips: string;
  countyName: string | null;
  stateCode: string | null;
  window: { start: string; end: string };
  /** Map weeks the window should contain (Tuesdays whose valid week overlaps it, up to the newest possible map). */
  expectedWeeks: number;
  observedWeeks: number;
  /** Valid dates (Tuesdays) with no map returned: unavailable, never counted as "no drought". */
  missingWeeks: string[];
  weeks: UsdmWeek[];
  /** Observed weeks by predominant category; each week counted once (no cumulative double counting). */
  counts: Record<UsdmCategory, number>;
  /** Observed weeks where D1 or worse covered most of the county. */
  droughtWeeks: number;
  mixedWeeks: number;
  status: "complete" | "partial" | "unavailable";
  note: string;
  /** For replayed bad years: whether USDM also showed drought. Agreement and disagreement are both valid. */
  agreement?: { kind: "drought" | "no-drought" | "mixed" | "unknown"; text: string };
  source: UsdmSourceInfo;
}

/** Dated USDM category for a county on one date (for Field Watch results and messages). */
export interface UsdmCategoryResult {
  fips: string;
  date: string;
  /**
   * matched: a released map's valid week contains the date. latest: the date is after the newest map but within the
   * normal release lag. stale: the newest map we could get is too old for this date. unavailable: no map.
   */
  status: "matched" | "latest" | "stale" | "unavailable";
  /** True when the date is in the past (replay/history); such messages must stay marked historical. */
  historical: boolean;
  week: UsdmWeek | null;
  countyName: string | null;
  stateCode: string | null;
  /** Plain-language one-liner, e.g. "D1 moderate drought over 58% of Finney County, KS (USDM map valid 2026-11-10)". */
  label: string;
  /** Days between the date and the end of the chosen map's valid week (0 when matched). */
  ageDays: number | null;
  snapshotId: string | null;
  source: UsdmSourceInfo;
}

// ---- Wind inputs and wind-erosion exposure screen (GitHub issues #17, #40) ----

/** Provenance of the NASA POWER daily wind snapshot. */
export interface WindMeta {
  source: string;
  parameters: { id: "WS10M" | "WS10M_MAX"; name: string; definition: string; units: "m/s"; heightM: 10; aggregation: string }[];
  grid: { lat: number; lon: number; resolution: string };
  timeStandard: string;
  fillValue: number;
  start: string;
  end: string;
  validDays: { WS10M: number; WS10M_MAX: number };
  missingDays: { WS10M: number; WS10M_MAX: number };
  requestUrl: string;
  retrievedAt: string;
  apiVersion: string | null;
  /** Version of this cached snapshot's content layout. */
  contentVersion: string;
}

/** One SSURGO component's wind-erodibility attributes (categorical WEG kept as-is, never averaged). */
export interface WindSoilComponent {
  componentKey: string;
  name: string;
  pct: number | null;
  major: boolean;
  /** Wind erodibility group, "1" (most susceptible) … "8"; null when SSURGO has none. Categorical. */
  weg: string | null;
  /** Wind erodibility index, tons/acre/yr, a REFERENCE value for a bare, smooth, unsheltered, non-crusted soil in Garden City, KS climate. */
  wei: number | null;
  surfaceTexture: string | null;
}

export interface WindSoil {
  available: boolean;
  mapUnitKey: string | null;
  mapUnitName: string | null;
  surveyArea: string | null;
  /** Survey area version date (SSURGO sacatalog.saverest). */
  surveyVersion: string | null;
  components: WindSoilComponent[];
  source: string;
  sourceUrl: string;
  retrievedAt: string | null;
}

export type ProtectionState = "living-cover" | "unknown";

export interface WindMonthStat {
  month: number;
  validDays: number;
  windyDays: number;
  /** windyDays / validDays (null when no valid day). */
  share: number | null;
}

export interface WindRotationYear {
  year: number;
  crop: CropId;
  state: ProtectionState;
  reason: string;
  /** Expected windy days (climatological) in the screened months under this state. */
  windyDays: number | null;
}

export interface WindRotationScreen {
  label: string;
  years: WindRotationYear[];
  /** Mean per plan year of expected windy days in the screened months without assured living cover. */
  windyDaysWithoutLivingCover: number | null;
  /** Mean per plan year of expected windy days while living cover is assumed. */
  windyDaysWithLivingCover: number | null;
}

export interface WindScreen {
  rule: {
    version: string;
    parameter: "WS10M_MAX";
    thresholdMs: number;
    thresholdMph: number;
    comparison: ">=";
    months: number[];
    monthsSource: string;
    thresholdSource: string;
    adaptation: string;
  };
  wind: WindMeta | null;
  /** Climatology over the baseline for the screened months. */
  months: WindMonthStat[];
  baseline: { startYear: number; endYear: number; seasons: number } | null;
  /** Most recent complete screened season: daily WS10M_MAX (m/s, null = missing). */
  recentSeason: { year: number; dates: string[]; ws10mMax: (number | null)[]; ws10m: (number | null)[]; windyDays: number; validDays: number } | null;
  soil: WindSoil;
  rotations: WindRotationScreen[];
  limitations: string[];
  status: "ok" | "partial" | "unavailable";

}
