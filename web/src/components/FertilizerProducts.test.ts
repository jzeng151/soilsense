// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";
import { FertilizerProducts } from "./FertilizerProducts";
import { LanguageProvider, LANGUAGE_STORAGE_KEY } from "../i18n";
import type { CropYearFertilizer } from "../../../src/shared/fertilizer";
let host: HTMLDivElement, root: Root;
const year: CropYearFertilizer = { year: 2027, crop: "corn", expectedYield: 150, yieldUnit: "bu/acre", recs: [{ nutrient: "N", lbPerAcre: 150, basis: "formula", inputsUsed: { expectedYield: 150, fertilizerEfficiency: .55 }, notes: ["MF2586 formula"], source: { doc: "MF2586", page: "5" } }] };
beforeEach(() => {
  localStorage.clear();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
it("renders native keyboard disclosures, product units, formulas and source page locators", async () => {
  await act(async () => root.render(createElement(LanguageProvider, null, createElement(FertilizerProducts, { year }))));
  expect(host.querySelector("summary")?.textContent).toBe("Products & timing");
  expect(host.querySelectorAll("details > summary")).toHaveLength(2);
  expect(host.textContent).toContain("182.9 lb product/acre");
  expect(host.textContent).toContain("How was this calculated?");
  expect(host.textContent).toContain("fertilizerEfficiency=0.55");
  expect(host.textContent).toContain("MF2586 p. 5");
  expect(host.textContent).toContain("not in-furrow rates");
});
it("renders Spanish product and timing controls", async () => {
  localStorage.setItem(LANGUAGE_STORAGE_KEY, "es");
  await act(async () => root.render(createElement(LanguageProvider, null, createElement(FertilizerProducts, { year }))));
  expect(host.textContent).toContain("Productos y aplicación");
  expect(host.textContent).toContain("¿Cómo se calculó?");
  expect(host.textContent).toContain("Amoníaco anhidro");
  expect(host.textContent).toContain("eficiencia de recuperación");
});
