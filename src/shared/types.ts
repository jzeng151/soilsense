// Types shared by the Worker API, the engine and the dashboard.

/** "fallow" = no crop for a season (weed control only) so the soil stores water; offered only on dry rain-fed fields. */
export type CropId = "corn" | "soybean" | "winter_wheat" | "oats" | "alfalfa" | "sorghum" | "fallow";
export type CoverId = "none" | "cereal_rye" | "crimson_clover" | "hairy_vetch";
export type Priority = "profit" | "soil" | "risk" | "balanced";

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
}

export interface ReasonFact {
  id: string;
  text: string;
  source: string;
  significant?: boolean;
  kind: "climate" | "history" | "soil" | "agronomy" | "economics";
}

export interface PlanRequest {
  lat: number;
  lon: number;
  irrigated: boolean;
  priority: Priority;
  /** Water beyond rain. When missing, irrigated=true means "full" and false means "rain". */
  water?: WaterLevel;
  /** Optional override when satellite crop history is unavailable. Most recent last. */
  recentCrops?: CropId[];
  language?: "en" | "es";
}

export interface PlanResponse {
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
