import { useId, useState } from "react";
import type { CropYearFertilizer } from "../../../src/shared/fertilizer";
import { FERTILIZER_PRODUCTS, fertilizerProductOptions, fertilizerTiming, limeProductAmount, LIME_SOURCE, MF2586_URL } from "../../../src/engine/fertilizerProducts";
import { useI18n } from "../i18n";

const ES: Record<string, string> = {
  "Products & timing": "Productos y aplicación",
  "How was this calculated?": "¿Cómo se calculó?",
  "Illustrative alternatives, not ranked. No price comparison. Check the purchased product's guaranteed analysis. Amounts are pounds of product, not pounds of nutrient; liquid products are not gallons.": "Alternativas ilustrativas, sin clasificar ni comparar precios. Verifica el análisis garantizado del producto comprado. Son libras de producto, no de nutriente; los líquidos no se expresan en galones.",
  "Option": "Opción", "lb product/acre": "lb de producto/acre", "N credit from phosphate and sulfate": "Crédito de N del fosfato y sulfato", "Excess N": "N excedente",
  "These products supply more N than the guideline; discuss a different P/S source with your agronomist.": "Estos productos aportan más N que la guía; consulta otra fuente de P/S con tu agrónomo.",
  "No product rate for removal-only estimates or missing soil tests.": "No se calculan dosis de producto a partir de estimaciones de extracción o sin análisis de suelo.",
  "Ag lime": "Cal agrícola", "Product ECC (%) from supplier label": "ECC del producto (%) según la etiqueta del proveedor",
  "Enter a valid ECC greater than 0 and at most 100%.": "Ingresa un ECC mayor que 0 y de hasta 100%.",
  "Soil test and product ECC needed before calculating aglime pounds.": "Se necesitan el análisis de suelo y el ECC del producto para calcular las libras de cal agrícola.",
  "Product lb/acre = nutrient lb/acre ÷ (analysis % / 100).": "lb de producto/acre = lb de nutriente/acre ÷ (análisis % / 100).",
  "Size MAP/DAP to P2O5; credit its N and ammonium-sulfate N, then remaining N = max(0, guideline N − credits). Potash = K2O ÷ 0.60. Aglime = lb ECC ÷ (product ECC % / 100).": "Calcula MAP/DAP según P2O5; descuenta su N y el del sulfato de amonio: N restante = máx(0, N de la guía − créditos). Potasa = K2O ÷ 0.60. Cal agrícola = lb de ECC ÷ (ECC del producto % / 100).",
  "Expected yield is the plan's expected yield for this crop-year.": "El rendimiento esperado es el del plan para este cultivo y año.",
  "Inputs": "Datos utilizados", "soil test needed": "se necesita análisis de suelo", "Known product analyses": "Análisis de los productos",
  "Anhydrous ammonia": "Amoníaco anhidro", "Urea": "Urea", "Ammonium sulfate": "Sulfato de amonio", "Potash (potassium chloride)": "Potasa (cloruro de potasio)",
  "Removal only — not an application rate": "Solo extracción — no es una dosis de aplicación",
  "Timing & placement": "Momento y colocación",
};
export function FertilizerProducts({ year }: { year: CropYearFertilizer }) {
  const { language } = useI18n();
  const tx = (s: string) => language === "es" ? ES[s] ?? s : s;
  const options = fertilizerProductOptions(year);
  const [ecc, setEcc] = useState("");
  const id = useId();
  const lime = year.recs.find(r => r.nutrient === "lime" && r.basis !== "removal" && r.basis !== "soil-test-needed");
  const validEcc = ecc.trim() !== "" && Number.isFinite(Number(ecc)) && Number(ecc) > 0 && Number(ecc) <= 100;
  const timing = fertilizerTiming(year);
  return <details style={{ minWidth: 0, overflowWrap: "anywhere" }}>
    <summary style={{ minHeight: 44, cursor: "pointer" }}>{tx("Products & timing")}</summary>
    <p>{tx("Illustrative alternatives, not ranked. No price comparison. Check the purchased product's guaranteed analysis. Amounts are pounds of product, not pounds of nutrient; liquid products are not gallons.")}</p>
    {options.length === 0 && <p>{tx("No product rate for removal-only estimates or missing soil tests.")}</p>}
    {options.map((option, index) => <section key={option.id} aria-label={`${tx("Option")} ${index + 1}`}>
      <h4>{tx("Option")} {index + 1}</h4>
      <ul>{option.lines.map(line => <li key={line.product.id}><a href={line.product.sourceUrl}>{tx(line.product.name)} {line.product.grade}</a>: <strong>{line.lbProductPerAcre.toFixed(1)} {tx("lb product/acre")}</strong></li>)}</ul>
      {option.nCreditLbPerAcre > 0 && <p>{tx("N credit from phosphate and sulfate")}: {option.nCreditLbPerAcre.toFixed(1)} lb N/acre.</p>}
      {option.excessNLbPerAcre !== null && option.excessNLbPerAcre > 0 && <p role="note"><strong>{tx("Excess N")}: {option.excessNLbPerAcre.toFixed(1)} lb N/acre.</strong> {tx("These products supply more N than the guideline; discuss a different P/S source with your agronomist.")}</p>}
    </section>)}
    <h4>{tx("Ag lime")}</h4>
    {lime?.lbPerAcre != null && lime.lbPerAcre > 0 ? <>
      <label htmlFor={id}>{tx("Product ECC (%) from supplier label")}</label>{" "}
      <input id={id} type="number" inputMode="decimal" min="0.01" max="100" step="any" value={ecc} onChange={e => setEcc(e.target.value)} style={{ width: "6rem", maxWidth: "100%", minHeight: 44 }} aria-invalid={ecc !== "" && !validEcc} />
      <p aria-live="polite">{validEcc ? `${limeProductAmount(lime.lbPerAcre, Number(ecc)).toFixed(1)} ${tx("lb product/acre")}` : tx("Enter a valid ECC greater than 0 and at most 100%.")}</p>
    </> : <p>{tx("Soil test and product ECC needed before calculating aglime pounds.")}</p>}
    <p><a href={LIME_SOURCE}>K-State MF1065 — ECC</a></p>
    {timing.length > 0 && <><h4>{tx("Timing & placement")}</h4><ul>{timing.map((n, i) => <li key={i}>{language === "es" ? n.es : n.text} <a href={`${n.url}#page=${Number(n.page) + 2}`}>MF2586 p. {n.page}</a></li>)}</ul></>}
    <details><summary style={{ minHeight: 44, cursor: "pointer" }}>{tx("How was this calculated?")}</summary>
      <p>{tx("Expected yield is the plan's expected yield for this crop-year.")} {year.expectedYield} {year.yieldUnit}.</p>
      <p>{tx("Product lb/acre = nutrient lb/acre ÷ (analysis % / 100).")}</p>
      <p>{tx("Size MAP/DAP to P2O5; credit its N and ammonium-sulfate N, then remaining N = max(0, guideline N − credits). Potash = K2O ÷ 0.60. Aglime = lb ECC ÷ (product ECC % / 100).")}</p>
      {year.recs.map((r, i) => <div key={`${r.nutrient}-${i}`}><strong>{r.nutrient}: {r.lbPerAcre === null ? tx("soil test needed") : `${r.lbPerAcre} lb/acre`}</strong> — {r.basis === "removal" ? tx("Removal only — not an application rate") : r.basis}
        <p>{tx("Inputs")}: {Object.entries(r.inputsUsed).map(([key, value]) => `${key}=${value}`).join("; ") || "—"}</p>
        <ul>{r.notes.map((note, j) => <li key={j}>{note}</li>)}</ul><a href={MF2586_URL}>MF2586 p. {r.source.page}</a>
      </div>)}
      <h4>{tx("Known product analyses")}</h4>
      <ul>{Object.values(FERTILIZER_PRODUCTS).map(p => <li key={p.id}><a href={p.sourceUrl}>{tx(p.name)} {p.grade}</a> — {p.locator}</li>)}</ul>
    </details>
  </details>;
}
