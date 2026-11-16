export type Nutrient = "N" | "P2O5" | "K2O" | "lime" | "S" | "Zn";
export interface NutrientRec { nutrient: Nutrient; lbPerAcre: number | null; basis: "sufficiency" | "build-maintenance" | "removal" | "formula" | "not-needed" | "soil-test-needed"; inputsUsed: Record<string, number | string>; notes: string[]; source: { doc: "MF2586"; page: string } }
export interface CropYearFertilizer { year: number; crop: string; expectedYield: number; yieldUnit: string; recs: NutrientRec[] }
export interface PlanFertilizer { planId: string; years: CropYearFertilizer[]; assumptions: string[]; disclaimer: string }
export interface FertilizerInputs { profileNitrateLbPerAcre?: number; mehlich3P?: number; extractableK?: number; bufferPh?: number; sulfatePpm?: number; zincDtpaPpm?: number; manureNLbPerAcre?: number; nApplication?: "broadcast-preplant" | "injected-or-split"; pkProgram?: "sufficiency" | "build-maintenance" }
