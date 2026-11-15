import type { DistrictOutlook } from "../../shared/districtOutlook";
import type { UsdmCategoryResult } from "../../shared/types";
import type { KansasSignal } from "./rule";
import { KS_ADVICE_URL } from "./sources";

/** Missing/stale USDM cannot establish current drought or its absence; omit rather than infer onset. */
export function districtOutlookFor(state: string, fips: string, signal: KansasSignal | null, usdm: UsdmCategoryResult | null): DistrictOutlook | undefined {
  if (state !== "KS" || !/^20\d{3}$/.test(fips) || !signal || (signal.alert !== "watch" && signal.alert !== "warning")) return;
  if (!usdm?.week || usdm.fips !== fips || (usdm.status !== "matched" && usdm.status !== "latest")) return;
  return {
    fips, alert: signal.alert,
    situation: ["D1", "D2", "D3", "D4"].includes(usdm.week.worst) ? "continue" : "onset",
    dataThrough: signal.dataThrough,
    source: { name: "Kansas Crop Rotation Advice (team model, V. Pisharody)", url: KS_ADVICE_URL },
    basis: signal.basis ?? null,
    dryYearRanking: signal.basis?.startsWith("dry-year") ?? false,
    usdm: { validStart: usdm.week.validStart, status: usdm.status, sourceUrl: usdm.source.requestUrl },
  };
}
