export type Nutrient = "N" | "P2O5" | "K2O" | "lime" | "S" | "Zn";
export interface NutrientRec { nutrient: Nutrient; lbPerAcre: number | null; basis: "sufficiency" | "build-maintenance" | "removal" | "formula" | "not-needed" | "legume-not-needed" | "soil-test-needed"; inputsUsed: Record<string, number | string>; notes: string[]; source: { doc: "MF2586"; page: string } }
/** Plain-English status for a missing or zero rate; legumes are distinct from missing soil tests. */
export const nutrientStatusText = (r: Pick<NutrientRec, "lbPerAcre" | "basis">): string => r.basis === "legume-not-needed" ? "not needed (legume)" : r.lbPerAcre === null ? "soil test needed" : `${r.lbPerAcre} lb/acre`;
export const LEGUME_N_NOTE = "Not needed (legume): soybeans and alfalfa are legumes that fix their own nitrogen when nodulated. MF2586 gives no soybean N recommendation (its N equations cover non-legume crops) and 0 N for established alfalfa (p19); no N rate is shown. Confirm nodulation with your agronomist.";
export interface CropYearFertilizer { year: number; crop: string; expectedYield: number; yieldUnit: string; recs: NutrientRec[] }
export interface PlanFertilizer { planId: string; years: CropYearFertilizer[]; assumptions: string[]; disclaimer: string }
export interface FertilizerInputs { profileNitrateLbPerAcre?: number; mehlich3P?: number; extractableK?: number; bufferPh?: number; sulfatePpm?: number; zincDtpaPpm?: number; manureNLbPerAcre?: number; nApplication?: "broadcast-preplant" | "injected-or-split"; pkProgram?: "sufficiency" | "build-maintenance" }
