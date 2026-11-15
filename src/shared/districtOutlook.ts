/** Optional run context; never an input to Field Watch rule v2. No model probabilities. */
export interface DistrictOutlook {
  fips: string;
  alert: "watch" | "warning";
  situation: "continue" | "onset";
  dataThrough: string;
  source: { name: string; url: string };
  basis: string | null;
  dryYearRanking: boolean;
  usdm: { validStart: string; status: "matched" | "latest"; sourceUrl: string };
}
export const OUTLOOK_REPORT_URL = "https://github.com/jzeng151/soilsense/blob/next/kansas-crop-rotation/reports/model_report.md";
export const OUTLOOK_LABEL = "District outlook (next ~4 weeks, team's Kansas model)";
export const OUTLOOK_CONTINUE = "drought likely to continue.";
export const OUTLOOK_ONSET = "possible drought onset (low confidence).";
export const OUTLOOK_SKILL = "The model's tested skill is strong for persistence and weak for onsets: logistic onset hit rate 0.17, false-alarm ratio 0.47 (2023–2026 test). Districts approximate nine points, not official NASS boundaries. County USDM context uses any D1 or worse area, not a field measurement. This outlook does not change Dry/Watch/OK.";
