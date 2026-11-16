import type { FertilizerInputs } from "./fertilizer";
/** Application bounds, not agronomic calibration ranges. All numeric fields optional. */
export const FERTILIZER_FIELDS = [
  { key: "profileNitrateLbPerAcre", label: "Profile nitrate-N (lb/acre, 0–24 in)", min: 0, max: 1000 },
  { key: "mehlich3P", label: "Mehlich-3 P (ppm)", min: 0, max: 1000 },
  { key: "extractableK", label: "Extractable K (ppm)", min: 0, max: 5000 },
  { key: "bufferPh", label: "Sikora buffer pH (5.7–7.1)", min: 5.7, max: 7.1 },
  { key: "sulfatePpm", label: "Profile sulfate-S (ppm S, 0–24 in)", min: 0, max: 500 },
  { key: "zincDtpaPpm", label: "DTPA zinc (ppm)", min: 0, max: 100 },
  { key: "manureNLbPerAcre", label: "Plant-available manure N (lb/acre)", min: 0, max: 1000 },
] as const;
export function validateFertilizerInputs(value: Record<string, unknown>): FertilizerInputs | string {
  const result: FertilizerInputs = {};
  for (const f of FERTILIZER_FIELDS) {
    const v = value[f.key];
    if (v === undefined) continue;
    if (typeof v !== "number" || !Number.isFinite(v) || v < f.min || v > f.max) return `${f.key} must be a finite number from ${f.min} to ${f.max}`;
    result[f.key] = v;
  }
  if (value.nApplication !== undefined) {
    if (value.nApplication !== "broadcast-preplant" && value.nApplication !== "injected-or-split") return "Unknown N application method";
    result.nApplication = value.nApplication;
  }
  if (value.pkProgram !== undefined) {
    if (value.pkProgram !== "sufficiency" && value.pkProgram !== "build-maintenance") return "Unknown P/K program";
    result.pkProgram = value.pkProgram;
  }
  return result;
}
