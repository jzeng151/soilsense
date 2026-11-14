// Crop and cover-crop knowledge base for US Corn Belt / Great Plains row-crop farms.
//
// IMPORTANT: values are approximate planning defaults compiled for a hackathon prototype
// (land-grant extension guidance ranges: Iowa State, Purdue, Kansas State, USDA NRCS).
// They are centralised here so an agronomist can review and replace them in one place.

import type { CoverId, CropId } from "../shared/types";
import type { Window } from "./climate";

export interface CropDef {
  id: CropId;
  name: string;
  /** Crop family used for rotation diversity. */
  family: "grass" | "legume";
  legume: boolean;
  perennial: boolean;
  /** Main water-use window (in the harvest year). */
  season: Window;
  /** Typical seasonal crop water use, mm (reference only; the engine uses kc × local ET0 each year). */
  waterNeedMm: number;
  /**
   * Season-average crop coefficient (FAO-56 Kc, averaged over the season window including the early
   * low-cover weeks). Water need in a given year = kc × reference evapotranspiration for that season.
   */
  kc: number;
  /** Effective rooting depth used to count stored soil water, mm. */
  rootDepthMm: number;
  /**
   * Water-production threshold: share of the full water need below which the crop makes no harvestable
   * yield. Yield then rises linearly to full potential at 100% of need (a standard crop water-production
   * function; e.g. corn needs roughly 10 in of water before grain, wheat about 4-5 in).
   */
  waterYieldThreshold: number;
  /** Heat-sensitive window (flowering / grain fill). */
  heatWindow: Window;
  /** Extreme-heat threshold for degree-day damage, °C. */
  heatThresholdC: number;
  /** Fractional yield loss per degree-day above the threshold (rainfed). Irrigation reduces it. */
  heatDamagePerDegreeDay: number;
  /** Growing degree days (°C, base 10, cap 30) needed in the season window; 0 = not checked. */
  gddNeedC: number;
  /** Frost-free days needed; 0 = not checked. */
  frostFreeNeedDays: number;
  /** Spring planting crop: very wet Apr–May delays planting. 0 = not checked. */
  wetSpringLimitMm: number;
  /** Winter-hardiness check: days ≤ this temperature in Jan–Feb. */
  winterKill?: { thresholdC: number; daysToFail: number };
  /** Soil preferences. */
  minPh: number;
  toleratesPoorDrainage: boolean;
  // ---- Economics (editable assumptions) ----
  baseYield: number;
  yieldUnit: string;
  pricePerUnit: number;
  /** Direct costs excluding nitrogen and land, $/acre. */
  costPerAcre: number;
  /** Nitrogen-fertilizer need, lb N/acre, by previous crop (default used otherwise). */
  nitrogen: { default: number; afterSoybean?: number; afterAlfalfa?: number; afterSmallGrain?: number; afterSame?: number };
  /** NASS Quick Stats commodity name (for county yields). */
  nassCommodity?: string;
  nassUnitFilter?: string;
  /** Cover crops that can realistically be seeded after this crop's harvest. */
  coversAfter: CoverId[];
  /** Must the previous crop be harvested early (fall-seeded crop)? */
  fallSeeded: boolean;
}

export interface CoverDef {
  id: CoverId;
  name: string;
  legume: boolean;
  costPerAcre: number;
  /** Nitrogen credit to a following corn crop, lb N/acre. */
  nitrogenCreditToCorn: number;
  /** Yield factor on the next crop if it is corn (cereal rye can cause a small drag). */
  nextCornYieldFactor: number;
}

export const CROPS: Record<CropId, CropDef> = {
  corn: {
    id: "corn",
    name: "Corn",
    family: "grass",
    legume: false,
    perennial: false,
    season: { from: [5, 1], to: [9, 30] },
    waterNeedMm: 610,
    kc: 0.8,
    rootDepthMm: 1500,
    waterYieldThreshold: 0.2,
    heatWindow: { from: [6, 1], to: [8, 31] },
    heatThresholdC: 29,
    heatDamagePerDegreeDay: 0.006,
    gddNeedC: 1400,
    frostFreeNeedDays: 130,
    wetSpringLimitMm: 300,
    minPh: 5.8,
    toleratesPoorDrainage: true,
    baseYield: 200,
    yieldUnit: "bu/acre",
    pricePerUnit: 4.2,
    costPerAcre: 520,
    nitrogen: { default: 150, afterSoybean: 140, afterAlfalfa: 40, afterSmallGrain: 150, afterSame: 190 },
    nassCommodity: "CORN",
    nassUnitFilter: "CORN, GRAIN - YIELD, MEASURED IN BU / ACRE",
    coversAfter: ["none", "cereal_rye"],
    fallSeeded: false,
  },
  soybean: {
    id: "soybean",
    name: "Soybean",
    family: "legume",
    legume: true,
    perennial: false,
    season: { from: [5, 15], to: [9, 30] },
    waterNeedMm: 500,
    kc: 0.75,
    rootDepthMm: 1300,
    waterYieldThreshold: -0.18,
    heatWindow: { from: [6, 15], to: [9, 10] },
    heatThresholdC: 30,
    heatDamagePerDegreeDay: 0.006,
    gddNeedC: 1150,
    frostFreeNeedDays: 115,
    wetSpringLimitMm: 330,
    minPh: 5.8,
    toleratesPoorDrainage: true,
    baseYield: 60,
    yieldUnit: "bu/acre",
    pricePerUnit: 10.5,
    costPerAcre: 330,
    nitrogen: { default: 0 },
    nassCommodity: "SOYBEANS",
    nassUnitFilter: "SOYBEANS - YIELD, MEASURED IN BU / ACRE",
    coversAfter: ["none", "cereal_rye", "hairy_vetch"],
    fallSeeded: false,
  },
  winter_wheat: {
    id: "winter_wheat",
    name: "Winter wheat",
    family: "grass",
    legume: false,
    perennial: false,
    season: { from: [3, 1], to: [7, 10] },
    waterNeedMm: 360,
    kc: 0.75,
    rootDepthMm: 1500,
    waterYieldThreshold: 0.05,
    heatWindow: { from: [5, 15], to: [6, 30] },
    heatThresholdC: 32,
    heatDamagePerDegreeDay: 0.01,
    gddNeedC: 0,
    frostFreeNeedDays: 0,
    wetSpringLimitMm: 0,
    winterKill: { thresholdC: -23, daysToFail: 12 },
    minPh: 5.5,
    toleratesPoorDrainage: false,
    baseYield: 75,
    yieldUnit: "bu/acre",
    pricePerUnit: 5.6,
    costPerAcre: 260,
    nitrogen: { default: 90 },
    nassCommodity: "WHEAT",
    nassUnitFilter: "WHEAT, WINTER - YIELD, MEASURED IN BU / ACRE",
    coversAfter: ["none", "crimson_clover", "hairy_vetch", "cereal_rye"],
    fallSeeded: true,
  },
  oats: {
    id: "oats",
    name: "Oats",
    family: "grass",
    legume: false,
    perennial: false,
    season: { from: [4, 1], to: [7, 15] },
    waterNeedMm: 300,
    kc: 0.75,
    rootDepthMm: 800,
    waterYieldThreshold: 0.13,
    heatWindow: { from: [6, 1], to: [7, 15] },
    heatThresholdC: 30,
    heatDamagePerDegreeDay: 0.01,
    gddNeedC: 0,
    frostFreeNeedDays: 0,
    wetSpringLimitMm: 280,
    minPh: 5.5,
    toleratesPoorDrainage: true,
    baseYield: 75,
    yieldUnit: "bu/acre",
    pricePerUnit: 3.6,
    costPerAcre: 210,
    nitrogen: { default: 60 },
    nassCommodity: "OATS",
    nassUnitFilter: "OATS - YIELD, MEASURED IN BU / ACRE",
    coversAfter: ["none", "crimson_clover", "hairy_vetch", "cereal_rye"],
    fallSeeded: false,
  },
  alfalfa: {
    id: "alfalfa",
    name: "Alfalfa (hay)",
    family: "legume",
    legume: true,
    perennial: true,
    season: { from: [4, 1], to: [9, 30] },
    waterNeedMm: 650,
    kc: 0.9,
    rootDepthMm: 2000,
    waterYieldThreshold: 0.09,
    heatWindow: { from: [6, 1], to: [8, 31] },
    heatThresholdC: 35,
    heatDamagePerDegreeDay: 0.003,
    gddNeedC: 0,
    frostFreeNeedDays: 0,
    wetSpringLimitMm: 0,
    winterKill: { thresholdC: -26, daysToFail: 15 },
    minPh: 6.3,
    toleratesPoorDrainage: false,
    baseYield: 4.0,
    yieldUnit: "tons/acre",
    pricePerUnit: 190,
    costPerAcre: 320,
    nitrogen: { default: 0 },
    nassCommodity: "HAY",
    nassUnitFilter: "HAY, ALFALFA - YIELD, MEASURED IN TONS / ACRE, DRY BASIS",
    coversAfter: ["none", "cereal_rye"],
    fallSeeded: false,
  },
  sorghum: {
    id: "sorghum",
    name: "Grain sorghum",
    family: "grass",
    legume: false,
    perennial: false,
    season: { from: [5, 20], to: [9, 30] },
    waterNeedMm: 470,
    kc: 0.75,
    rootDepthMm: 1500,
    waterYieldThreshold: -0.11,
    heatWindow: { from: [6, 15], to: [9, 15] },
    heatThresholdC: 33,
    heatDamagePerDegreeDay: 0.004,
    gddNeedC: 1250,
    frostFreeNeedDays: 120,
    wetSpringLimitMm: 340,
    minPh: 5.5,
    toleratesPoorDrainage: true,
    baseYield: 120,
    yieldUnit: "bu/acre",
    pricePerUnit: 4.0,
    costPerAcre: 300,
    nitrogen: { default: 110, afterSoybean: 90, afterSame: 130 },
    nassCommodity: "SORGHUM",
    nassUnitFilter: "SORGHUM, GRAIN - YIELD, MEASURED IN BU / ACRE",
    coversAfter: ["none", "cereal_rye"],
    fallSeeded: false,
  },
  // Not a crop: a season with no crop (chemical/no-till weed control) so the soil stores water for the
  // next crop. Common in dry rain-fed Great Plains systems (wheat-fallow, wheat-sorghum-fallow).
  fallow: {
    id: "fallow",
    name: "Fallow (no crop)",
    family: "grass",
    legume: false,
    perennial: false,
    season: { from: [4, 1], to: [9, 30] },
    waterNeedMm: 0,
    kc: 0,
    rootDepthMm: 2000,
    waterYieldThreshold: 0,
    heatWindow: { from: [6, 1], to: [8, 31] },
    heatThresholdC: 99,
    heatDamagePerDegreeDay: 0,
    gddNeedC: 0,
    frostFreeNeedDays: 0,
    wetSpringLimitMm: 0,
    minPh: 0,
    toleratesPoorDrainage: true,
    baseYield: 0,
    yieldUnit: "",
    pricePerUnit: 0,
    /** Two to three herbicide passes over the fallow season (approximate K-State budget). */
    costPerAcre: 45,
    nitrogen: { default: 0 },
    coversAfter: ["none"],
    fallSeeded: false,
  },
};

export const isFallow = (c: CropId | null | undefined): boolean => c === "fallow";

export const COVERS: Record<CoverId, CoverDef> = {
  none: { id: "none", name: "No cover crop", legume: false, costPerAcre: 0, nitrogenCreditToCorn: 0, nextCornYieldFactor: 1 },
  cereal_rye: {
    id: "cereal_rye",
    name: "Cereal rye",
    legume: false,
    costPerAcre: 40,
    nitrogenCreditToCorn: 0,
    nextCornYieldFactor: 0.98,
  },
  crimson_clover: {
    id: "crimson_clover",
    name: "Crimson clover",
    legume: true,
    costPerAcre: 45,
    nitrogenCreditToCorn: 40,
    nextCornYieldFactor: 1,
  },
  hairy_vetch: {
    id: "hairy_vetch",
    name: "Hairy vetch",
    legume: true,
    costPerAcre: 60,
    nitrogenCreditToCorn: 60,
    nextCornYieldFactor: 1,
  },
};

export const ALL_CROPS = Object.keys(CROPS) as CropId[];

/** Nitrogen price, $/lb N (editable assumption). */
export const NITROGEN_PRICE_PER_LB = 0.65;

/**
 * Rotation effect on yield: factor applied to base yield given the previous one or two crops.
 * Base yields above are for the crop grown in a typical rotation (e.g. corn after soybean).
 */
export function rotationYieldFactor(crop: CropId, prev: CropId | null, prev2: CropId | null, yearsOfStand: number): number {
  switch (crop) {
    case "corn":
      if (prev === "corn") return prev2 === "corn" ? 0.85 : 0.88;
      if (prev === "alfalfa") return 1.08;
      if (prev === "winter_wheat" || prev === "oats") return 1.03;
      if (prev === "sorghum") return 0.92;
      return 1;
    case "soybean":
      if (prev === "soybean") return prev2 === "soybean" ? 0.88 : 0.92;
      if (prev === "winter_wheat" || prev === "oats") return 1.03;
      return 1;
    case "winter_wheat":
      if (prev === "winter_wheat") return 0.85;
      if (prev === "sorghum") return 0.92;
      if (prev === "alfalfa") return 1.05;
      return 1;
    case "oats":
      return prev === "oats" ? 0.9 : 1;
    case "alfalfa":
      // Seeding year produces roughly half a normal hay crop; stands decline after year 3.
      if (yearsOfStand <= 1) return 0.55;
      return yearsOfStand > 3 ? 0.85 : 1;
    case "sorghum":
      if (prev === "sorghum") return 0.9;
      if (prev === "soybean") return 1.05;
      return 1;
    case "fallow":
      return 1;
  }
}

export function nitrogenNeed(crop: CropId, prev: CropId | null, coverBefore: CoverId): number {
  const def = CROPS[crop];
  let n = def.nitrogen.default;
  if (prev === crop && def.nitrogen.afterSame !== undefined) n = def.nitrogen.afterSame;
  else if (prev === "soybean" && def.nitrogen.afterSoybean !== undefined) n = def.nitrogen.afterSoybean;
  else if (prev === "alfalfa" && def.nitrogen.afterAlfalfa !== undefined) n = def.nitrogen.afterAlfalfa;
  else if ((prev === "winter_wheat" || prev === "oats") && def.nitrogen.afterSmallGrain !== undefined)
    n = def.nitrogen.afterSmallGrain;
  if (crop === "corn") n -= COVERS[coverBefore].nitrogenCreditToCorn;
  return Math.max(0, n);
}

/** Map USDA Cropland Data Layer codes to engine crops. */
export const CDL_TO_CROP: Record<number, CropId> = {
  1: "corn",
  12: "corn",
  13: "corn",
  5: "soybean",
  24: "winter_wheat",
  26: "winter_wheat",
  225: "winter_wheat",
  28: "oats",
  36: "alfalfa",
  4: "sorghum",
  61: "fallow",
};

export const CDL_NAMES: Record<number, string> = {
  1: "Corn",
  2: "Cotton",
  3: "Rice",
  4: "Sorghum",
  5: "Soybeans",
  6: "Sunflower",
  12: "Sweet Corn",
  13: "Pop or Orn Corn",
  21: "Barley",
  22: "Durum Wheat",
  23: "Spring Wheat",
  24: "Winter Wheat",
  26: "Dbl Crop WinWht/Soybeans",
  27: "Rye",
  28: "Oats",
  36: "Alfalfa",
  37: "Other Hay/Non Alfalfa",
  59: "Sod/Grass Seed",
  61: "Fallow/Idle Cropland",
  111: "Open Water",
  121: "Developed/Open Space",
  122: "Developed/Low Intensity",
  123: "Developed/Med Intensity",
  124: "Developed/High Intensity",
  141: "Deciduous Forest",
  142: "Evergreen Forest",
  143: "Mixed Forest",
  176: "Grassland/Pasture",
  190: "Woody Wetlands",
  195: "Herbaceous Wetlands",
  225: "Dbl Crop WinWht/Corn",
};
