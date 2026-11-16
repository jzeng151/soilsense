import type { NutrientRec, PlanFertilizer } from "../../../src/shared/fertilizer";
import type { CropId } from "../../../src/shared/types";
import { cropName, useI18n } from "../i18n";
import { fertilizerText } from "../i18n-fertilizer";
import "./fertilizer.css";
import { FertilizerProducts } from "./FertilizerProducts";
const pdf = "https://bookstore.ksre.ksu.edu/pubs/soil-test-interpretations-and-fertilizer-recommendations_MF2586.pdf";
export function FertilizerGuide({ fertilizer }: { fertilizer?: PlanFertilizer }) {
  const { language } = useI18n();
  const t = (key: string) => fertilizerText(key, language);
  if (!fertilizer) return null;
  const outside = fertilizer.years.some(y => y.recs.some(r => r.notes.some(n => n.startsWith("Kansas-specific guide withheld"))));
  const fmt = (n: number) => n.toLocaleString(language === "es" ? "es-US" : "en-US", { maximumFractionDigits: 1 });
  const omRec = fertilizer.years.flatMap(y => y.recs).find(r => typeof r.inputsUsed.organicMatterPct === "number" && r.inputsUsed.organicMatterSource);
  const cell = (r: NutrientRec | undefined) => {
    if (!r) return t("Confirm with agronomist");
    if (r.basis === "legume-not-needed") return <><strong>{t("Not needed (legume)")}</strong><small>{t("Legumes fix their own nitrogen; MF2586 gives no soybean N rate.")}</small></>;
    const removal = r.inputsUsed.cropRemovalLbPerAcre;
    return <>
      <strong>{r.lbPerAcre === null ? t(r.nutrient === "N" ? "Confirm with agronomist" : "Soil test needed") : fmt(r.lbPerAcre)}</strong>
      {r.lbPerAcre !== null && <small>{t(r.basis)}</small>}
      {r.lbPerAcre === null && typeof removal === "number" && <small>{t("Crop removal")}: {fmt(removal)}<br />{t("Removal is not an application rate.")}</small>}
    </>;
  };
  return <details className="fertilizer-guide">
    <summary>{t("Fertilizer guide")}</summary>
    <p className="fertilizer-disclaimer">{t(fertilizer.disclaimer)}</p>
    {outside ? <p>{t("Kansas-specific guide withheld outside Kansas; use your state's extension guide.")}</p> : <>
      <p>{t("Expected yield is the plan's expected yield for that crop-year. Display only: rankings and cost-model nitrogen are unchanged.")}</p>
      {omRec && <p>{fmt(omRec.inputsUsed.organicMatterPct as number)}% · {t(String(omRec.inputsUsed.organicMatterSource).startsWith("farmer") ? "Farmer soil-test organic matter" : "Mapped organic matter (USDA SSURGO)")}</p>}
      <p>{t("Initial lab values are reused each year; retest before application. No future soil tests are simulated.")}</p>
      <p>{t("Lime assumes 6-inch incorporation (2 inches for established alfalfa); no-till needs one-third of the 6-inch rate. Confirm depth before use.")}</p>
      <div className="fertilizer-scroll" role="region" aria-label={t("Fertilizer guide")} tabIndex={0}>
        <table><caption>{t("Rates in lb nutrient/acre; lime in lb effective calcium carbonate (ECC)/acre, not product weight.")}</caption>
          <thead><tr>{["Year", "Crop", "N", "P2O5", "K2O", "Lime"].map(label => <th scope="col" key={label}>{t(label)}</th>)}</tr></thead>
          <tbody>{fertilizer.years.map(y => <tr key={y.year}><th scope="row">{y.year}</th><td>{cropName(y.crop as CropId, language)}<small>{t("Expected yield")}: {fmt(y.expectedYield)} {y.yieldUnit}</small></td>{(["N", "P2O5", "K2O", "lime"] as const).map(n => <td key={n}>{cell(y.recs.find(r => r.nutrient === n))}</td>)}</tr>)}</tbody>
        </table>
      </div>
      {fertilizer.years.filter(y => y.crop !== "fallow").map(y => <section key={`products-${y.year}`}><h4>{y.year} · {cropName(y.crop as CropId, language)}</h4><FertilizerProducts year={y} /></section>)}
      <details><summary>{t("Source details and assumptions (original English)")}</summary>
        <div lang="en"><ul>{fertilizer.assumptions.map(a => <li key={a}>{a}</li>)}</ul>
        {fertilizer.years.map(y => <section key={y.year}><h4>{y.year} · {y.crop}</h4>{y.recs.map(r => <div key={r.nutrient} className="fertilizer-source"><strong>{r.nutrient}: {r.lbPerAcre === null ? "Unavailable" : `${fmt(r.lbPerAcre)} lb/acre`}</strong> · <a href={`${pdf}#page=${Number.parseInt(r.source.page, 10) + 2}`} target="_blank" rel="noreferrer">MF2586 p{r.source.page}</a><ul>{r.notes.map(n => <li key={n}>{n}</li>)}</ul><dl>{Object.entries(r.inputsUsed).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{typeof value === "number" ? fmt(value) : value}</dd></div>)}</dl></div>)}</section>)}</div>
      </details>
    </>}
  </details>;
}
