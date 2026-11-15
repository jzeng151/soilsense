// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import type { RotationPlan } from "../../../src/shared/types";
import { LanguageProvider, LANGUAGE_STORAGE_KEY } from "../i18n";
import { TopPlan } from "./PlanCard";

it("renders translated top-plan labels, crop and cover names, and the Spanish server summary", async () => {
  const plan: RotationPlan = {
    id: "fixture", label: "Winter wheat", avgNetReturnPerAcre: -40, badYearsIn10: 2,
    coverYears: 1, totalNitrogenLbPerAcre: 40, waterPumpedIn: 0, notes: [],
    scores: { climate: 50, reliability: 50, soil: 50, profit: 50, total: 50 },
    years: [{ year: 2027, crop: "winter_wheat", cropName: "Winter wheat", cover: "cereal_rye", coverName: "Cereal rye", climateScore: 0.5, reliability: 0.8, mainStress: null, expectedYield: 40, yieldUnit: "bu/acre", nitrogenLbPerAcre: 40, netReturnPerAcre: -40 }],
  };
  localStorage.setItem(LANGUAGE_STORAGE_KEY, "es");
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(createElement(LanguageProvider, { children: createElement(TopPlan, { plan, compareTo: null, summary: "Resumen del servidor en español." }) })));
    expect(container.textContent).toContain("Trigo de invierno");
    expect(container.textContent).toContain("+ centeno durante el invierno");
    expect(container.textContent).toContain("Margen neto");
    expect(container.textContent).toContain("pérdida de unos $40");
    expect(container.textContent).toContain("Años difíciles");
    expect(container.textContent).toContain("Resumen del servidor en español.");
    expect(container.textContent).not.toContain("Winter wheat");
  } finally {
    await act(async () => root.unmount());
    container.remove();
    localStorage.clear();
  }
});
