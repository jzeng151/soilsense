import { useState } from "react";
import type { CropId, RotationPlan } from "../../../src/shared/types";
import {
  checkFarmerConstraints, constrainRotationComparison, planConstraintCandidate,
  ROTATION_RESEARCH_LIBRARY, ROTATION_TRADEOFF, type FarmerConstraints,
} from "../../../src/engine/farmerConstraints";
import { cropKeys, rotationText, useI18n } from "../i18n";

/** Local-only preview: never submits settings or changes the ranked plan. */
export function FarmerConstraintEvidence({ plans, current, rainOnly }: {
  plans: RotationPlan[]; current: RotationPlan | null; rainOnly: boolean;
}) {
  const { t, text, language } = useI18n();
  const [constraints, setConstraints] = useState<FarmerConstraints>({
    excludedCrops: [], maxCornYears: 3, drylandOnly: false, livestockOrForageMarket: false,
  });
  const change = (value: Partial<FarmerConstraints>) => setConstraints(c => ({ ...c, ...value }));
  const comparison = constrainRotationComparison(
    plans.map(p => planConstraintCandidate(p, rainOnly)),
    current ? planConstraintCandidate(current, rainOnly) : null, constraints,
  );
  const crops: CropId[] = ["corn", "soybean", "winter_wheat", "sorghum", "oats", "alfalfa", "fallow"];
  const reasonText = (reason: string) => {
    if (reason.startsWith("Excluded crop: ")) {
      const crop = reason.slice("Excluded crop: ".length) as CropId;
      return t("Excluded crop: {crop}", { crop: t(cropKeys[crop]) });
    }
    if (reason.startsWith("Exceeds maximum ")) {
      return t("Exceeds maximum {count} corn years per displayed cycle", { count: constraints.maxCornYears });
    }
    return text(reason);
  };
  const reasons = (values: string[]) => values.map(reasonText).join("; ");
  const treatmentLabel = (id: string) => {
    switch (id) {
      case "r3-research-gap": return t("R3 Corn → wheat → sorghum → soybean");
      case "r4-chemical-fallow": return t("R4 Wheat → sorghum → chemical fallow");
      case "r4-standing-oat-triticale": return t("R4 Wheat → sorghum → standing oat/triticale");
      case "r4-hayed-oat-triticale": return t("R4 Wheat → sorghum → hayed oat/triticale");
      default: return t("R4 Wheat → sorghum → grazed oat/triticale");
    }
  };
  return <details className="jr-more" style={{ minWidth: 0, overflowWrap: "anywhere" }}>
    <summary>{t("Farmer constraints and dryland research library (preview)")}</summary>
    <p>{t("Read-only screen of the alternatives already returned above, not a new exhaustive engine search or a change to the selected plan. The current rotation stays visible even if excluded. Three-year plan and four-year research sequence are not silently interchanged.")}</p>
    <fieldset style={{ minWidth: 0 }}><legend>{t("Exclude crops")}</legend>
      {crops.map(crop => <label key={crop} style={{ display: "block" }}>
        <input type="checkbox" checked={constraints.excludedCrops.includes(crop)} onChange={e => change({
          excludedCrops: e.target.checked ? [...constraints.excludedCrops, crop] : constraints.excludedCrops.filter(c => c !== crop),
        })} />{t(cropKeys[crop])}
      </label>)}
    </fieldset>
    <label style={{ display: "block" }}>{t("Maximum corn years per displayed cycle")} <input type="number" min="0" max="4" style={{ width: "4em" }} value={constraints.maxCornYears} onChange={e => change({ maxCornYears: Math.max(0, Math.min(4, Math.floor(Number(e.target.value) || 0))) })} /></label>
    <label style={{ display: "block" }}><input type="checkbox" checked={constraints.drylandOnly} onChange={e => change({ drylandOnly: e.target.checked })} />{t("Dryland only")}</label>
    <label style={{ display: "block" }}><input type="checkbox" checked={constraints.livestockOrForageMarket} onChange={e => change({ livestockOrForageMarket: e.target.checked })} />{t("I have livestock access or a forage market")}</label>
    <div aria-live="polite">
      {comparison.current ? <p><b>{t("Current rotation:")} {rotationText(comparison.current.label, language)}</b> — {comparison.current.eligible ? t("passes these constraints") : reasons(comparison.current.reasons)}</p> : <p>{t("Current rotation unavailable; no invented baseline.")}</p>}
      <ul>{[...comparison.eligible, ...comparison.excluded].map(plan => <li key={plan.id}>{rotationText(plan.label, language)}: {plan.eligible ? t("passes screen") : reasons(plan.reasons)}</li>)}</ul>
      {!comparison.eligible.length && <p>{t("No supplied alternatives pass. This is not proof that no feasible rotation exists; rerun/full enumeration integration is pending.")}</p>}
    </div>
    <p>{text(ROTATION_TRADEOFF)}</p>
    <ul>{ROTATION_RESEARCH_LIBRARY.map(research => {
      const result = checkFarmerConstraints(research, constraints);
      return <li key={research.id}><b>{treatmentLabel(research.id)}</b> — {result.eligible ? t("passes applicability screen only") : reasons(result.reasons)}. {t("Not scored: phase calendars, phase lengths, treatment budgets/yields and annualization are not parameterized.")} {research.source ? <a href={research.source}>K-State SARE LNC18-411, 2018–2022</a> : t("Exact sequence source not verified")}. {text(research.residue)}</li>;
    })}</ul>
    <p>{t("Source accessed 2026-11-15. No treatment yields, water allocations, N credits or profit transferred from other studies. Local checks: planting/termination dates, stored water, residue removal, forage quality, livestock logistics and treatment-matched budgets. Independent agronomist review pending.")}</p>
  </details>;
}
