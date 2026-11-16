// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { FertilizerGuide } from "./FertilizerGuide";
import { MeasurementPanel } from "./Measurements";
import { LanguageProvider } from "../i18n";
import { cropYearFertilizer, FERTILIZER_DISCLAIMER } from "../../../src/engine/fertilizer";
import type { PlanYear } from "../../../src/shared/types";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let cleanup = async () => {};
afterEach(async () => { await cleanup(); localStorage.clear(); });
const y = { year: 2028, crop: "corn", expectedYield: 160, yieldUnit: "bu/acre", cover: "none" } as PlanYear;
const context = { stateCode: "KS", lon: -100.7, irrigated: false, organicMatterPct: 2, organicMatterSource: "farmer soil test" };
async function render(node: ReturnType<typeof createElement>, language = "en") {
  localStorage.setItem("soilsense.language", language);
  const container = document.createElement("div"); document.body.append(container);
  const root = createRoot(container);
  cleanup = async () => { await act(async () => root.unmount()); container.remove(); };
  await act(async () => root.render(createElement(LanguageProvider, null, node)));
  return container;
}
it.each(["en", "es"])("renders scoped accessible headers, removal fallback and disclaimer in %s", async language => {
  const fertilizer = { planId: "test", years: [cropYearFertilizer(y, context)], assumptions: [], disclaimer: FERTILIZER_DISCLAIMER };
  const c = await render(createElement(FertilizerGuide, { fertilizer }), language);
  expect(c.querySelectorAll('thead th[scope="col"]').length).toBe(6);
  expect(c.querySelector('tbody th[scope="row"]')?.textContent).toBe("2028");
  expect(c.querySelector('[role="region"][tabindex="0"]')).toBeTruthy();
  expect(c.textContent).toContain(language === "es" ? "Guía de fertilización" : "Fertilizer guide");
  expect(c.textContent).toContain(language === "es" ? "Se necesita análisis de suelo" : "Soil test needed");
  expect(c.textContent).toContain(language === "es" ? "no son una prescripción" : "not a prescription");
  expect(c.textContent).toContain(language === "es" ? "Extracción por cosecha" : "Crop removal");
  expect(c.textContent).toContain("52.8");
});
it("withholds the numerical table outside Kansas", async () => {
  const fertilizer = { planId: "test", years: [cropYearFertilizer(y, { ...context, stateCode: "IA" })], assumptions: [], disclaimer: FERTILIZER_DISCLAIMER };
  const c = await render(createElement(FertilizerGuide, { fertilizer }));
  expect(c.querySelector("table")).toBeNull();
  expect(c.textContent).toContain("withheld outside Kansas");
});
it("round-trips lab zero, validates ranges, and persists N/P-K methods in the existing form", async () => {
  const onChange = vi.fn();
  const c = await render(createElement(MeasurementPanel, { fieldKey: "fertilizer-test", soil: { available: true, source: "map" }, onChange }));
  const input = async (name: string, value: string) => {
    const el = c.querySelector<HTMLInputElement>(`input[name="${name}"]`)!;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, value); el.dispatchEvent(new Event("input", { bubbles: true })); });
  };
  await input("mehlich3P", "0");
  expect(onChange).toHaveBeenLastCalledWith({ soilTest: { mehlich3P: 0 } }, true);
  await input("bufferPh", "9");
  expect(onChange).toHaveBeenLastCalledWith({}, false);
  await input("bufferPh", "6.5");
  const method = [...c.querySelectorAll("select")].find(s => s.parentElement?.textContent?.startsWith("N application method"))!;
  await act(async () => { method.value = "injected-or-split"; method.dispatchEvent(new Event("change", { bubbles: true })); });
  expect(onChange).toHaveBeenLastCalledWith({ soilTest: { mehlich3P: 0, bufferPh: 6.5, nApplication: "injected-or-split" } }, true);
  expect(localStorage.getItem("soilsense:measurements:v1:fertilizer-test")).toContain("injected-or-split");
});
