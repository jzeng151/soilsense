import { cropYieldUnit, EXTRA_CROP_IDS } from "./extraCrops";
import type { FarmerYield, PlanRequest, SoilProfile, SoilTest } from "./types";
import { validateFertilizerInputs } from "./fertilizer-inputs";

/** Approximate texture-only model assumptions, not laboratory measurements or SSURGO values.
 * Broad classes intentionally avoid inferring drainage or a measured profile depth. */
export const TEXTURE_AWC = { sand: 0.08, sandy_loam: 0.13, loam: 0.18, silt_loam: 0.21, clay_loam: 0.19, clay: 0.15 } as const;

export function hasMeasurements(request: Pick<PlanRequest, "soilTest" | "yieldRecords">): boolean {
  return !!(request.soilTest && Object.keys(request.soilTest).length || request.yieldRecords?.length);
}

const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const finiteRange = (v: unknown, min: number, max: number) => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
/** Shared by the browser, API and pure engine. Reject rather than silently clip malformed records. */
export function validateMeasurements(b: Record<string, unknown>, currentYear = new Date().getUTCFullYear()): Pick<PlanRequest, "soilTest" | "yieldRecords"> | string {
  const result: Pick<PlanRequest, "soilTest" | "yieldRecords"> = {};
  if (b.soilTest !== undefined) {
    if (!object(b.soilTest)) return "soilTest must be an object";
    const s = b.soilTest;
    const fertilizer = validateFertilizerInputs(s);
    if (typeof fertilizer === "string") return fertilizer;
    const test: SoilTest = { ...fertilizer };
    for (const [key, min, max] of [["ph", 0, 14], ["organicMatterPct", 0, 100], ["awc", 0.01, 0.6]] as const) {
      if (s[key] === undefined) continue;
      if (!finiteRange(s[key], min, max)) return `${key} must be a finite number from ${min} to ${max}`;
      test[key] = s[key] as number;
    }
    if (s.texture !== undefined) {
      if (typeof s.texture !== "string" || !Object.hasOwn(TEXTURE_AWC, s.texture)) return "unknown soil texture";
      test.texture = s.texture as SoilTest["texture"];
    }
    if (Object.keys(test).length) result.soilTest = test;
  }
  if (b.yieldRecords !== undefined) {
    if (!Array.isArray(b.yieldRecords) || b.yieldRecords.length > 30) return "yieldRecords must contain up to 5 years per crop";
    const seen = new Set<string>();
    const counts = new Map<string, number>();
    const records: FarmerYield[] = [];
    for (const r of b.yieldRecords) {
      if (!object(r) || typeof r.crop !== "string" || !["corn", "soybean", "winter_wheat", "oats", "alfalfa", "sorghum", ...EXTRA_CROP_IDS].includes(r.crop)) return "unknown yield crop";
      const unit = cropYieldUnit(r.crop as FarmerYield["crop"]);
      const hay = unit === "tons/acre";
      const maxYield = hay ? (r.crop === "alfalfa" ? 30 : 60) : unit === "lb/acre" ? 10000 : 1000;
      if (r.unit !== unit) return "Use bu/acre for grain or US short tons/acre for alfalfa";
      if (!finiteRange(r.year, 1900, currentYear - 1) || !Number.isInteger(r.year)) return "Yield year must be a past calendar year (1900 or later)";
      if (!finiteRange(r.value, 0, maxYield)) return `Yield must be from 0 to ${maxYield}`;
      const key = `${r.crop}:${r.year}`;
      if (seen.has(key)) return "Only one yield per crop and year";
      seen.add(key);
      const count = (counts.get(String(r.crop)) ?? 0) + 1;
      if (count > 5) return "Enter at most 5 years per crop";
      counts.set(String(r.crop), count);
      records.push({ crop: r.crop as FarmerYield["crop"], year: r.year as number, value: r.value as number, unit });
    }
    if (records.length) result.yieldRecords = records;
  }
  return result;
}

export function effectiveSoil(map: SoilProfile, test?: SoilTest): SoilProfile {
  if (!test || !Object.keys(test).length) return map;
  return { ...map,
    ...(test.ph !== undefined ? { ph: test.ph } : {}),
    ...(test.organicMatterPct !== undefined ? { organicMatterPct: test.organicMatterPct } : {}),
    ...(test.awc !== undefined ? { awc: test.awc } : test.texture ? { awc: TEXTURE_AWC[test.texture] } : {}),
  };
}
