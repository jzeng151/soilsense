import type { PlanResponse } from "../../../src/shared/types";
import { cropName, useI18n } from "../i18n";
import { money } from "./PlanCard";

export function PriceRobustnessCard({ plan }: { plan: PlanResponse }) {
  const { t, language } = useI18n();
  const analysis = plan.priceSensitivity;
  if (!analysis) return null;
  const candidates = [...plan.plans, ...(plan.currentPractice ? [plan.currentPractice] : [])];
  return <section className="price-robustness" aria-labelledby="price-sensitivity-title">
    <h2 id="price-sensitivity-title">{t("Price sensitivity — not a forecast")}</h2>
    <p>{t("Ten paired Kansas marketing-year price sets (2016–2025), USDA NASS, replace entered prices for this analysis. Modeled yields, costs, water and covers stay fixed. All-wheat prices proxy winter wheat.")}</p>
    <ul>{analysis.plans.map(row => {
      const candidate = candidates.find(c=>c.id===row.planId);
      if (!candidate) return null;
      return <li key={row.planId}>
        <h3>{row.planId==="current" ? `${t("Current practice")}: ` : ""}{candidate.years.map(y=>cropName(y.crop,language)).join(" → ")}</h3>
        <p>{t("Best net in {best} of {total} scenarios",{best:row.bestCount,total:analysis.scenarioCount})}</p>
        <p>{t("Net range: {min} to {max}/acre/year",{min:money(row.minNetPerAcre),max:money(row.maxNetPerAcre)})}</p>
      </li>;
    })}</ul>
    <p>{t("Only these selected plans and current practice are compared. All ties count as best. Historical prices are not probabilities or a forecast.")}</p>
    {analysis.fixedPriceCrops.length>0 && <p>{t("Crops without historical prices stay at the entered or default price: {crops}.",{crops:analysis.fixedPriceCrops.map(c=>cropName(c,language)).join(", ")})}</p>}
    <a href="https://quickstats.nass.usda.gov/" target="_blank" rel="noreferrer">USDA NASS Quick Stats · 2016–2025</a>
  </section>;
}
