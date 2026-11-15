// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FieldResponse, PlanResponse } from "../../src/shared/types";
import { App } from "./App";
import { LanguageProvider, LANGUAGE_STORAGE_KEY } from "./i18n";
import { fetchField, fetchPlan } from "./api";

vi.mock("./components/MapPicker", () => ({
  MapPicker: () => null,
  DEMO_FARMS: [{ name: "Finney County, Kansas", lat: 38.1095, lon: -100.706, irrigated: true }],
}));
vi.mock("./components/FieldWatchCard", () => ({ FieldWatchCard: () => null }));
vi.mock("./api", () => ({ fetchField: vi.fn(), fetchPlan: vi.fn(), askQuestion: vi.fn(), subscribeLastPlan: () => () => {}, getLastPlan: () => null }));

const field = {
  county: { countyName: "Finney County", stateCode: "KS" },
  soil: { available: false },
  cropHistory: { years: [{ year: 2025, crop: "corn", cdlCode: 1, cdlName: "Corn" }] },
} as FieldResponse;
let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

function button(text: string): HTMLButtonElement {
  const found = [...container.querySelectorAll("button")].find((el) => el.textContent?.trim() === text);
  if (!found) throw new Error(`Button not found: ${text}`);
  return found;
}
async function click(text: string) { await act(async () => button(text).click()); }

beforeEach(async () => {
  vi.clearAllMocks();
  localStorage.clear();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  HTMLElement.prototype.scrollIntoView = vi.fn();
  vi.mocked(fetchField).mockResolvedValue(field);
  vi.mocked(fetchPlan).mockImplementation(() => new Promise<PlanResponse>(() => {}));
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(createElement(LanguageProvider, { children: createElement(App) })));
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

describe("main flow language", () => {
  it("switches visible text, document language and persisted preference both ways", async () => {
    expect(container.querySelector("h1")?.textContent).toBe("Where is your field?");
    expect(document.documentElement.lang).toBe("en");
    await click("ES");
    expect(container.querySelector("h1")?.textContent).toBe("¿Dónde está tu parcela?");
    expect(document.documentElement.lang).toBe("es");
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("es");
    expect(button("ES").getAttribute("aria-pressed")).toBe("true");
    await act(async () => root.unmount());
    root = createRoot(container);
    await act(async () => root.render(createElement(LanguageProvider, { children: createElement(App) })));
    expect(container.querySelector("h1")?.textContent).toBe("¿Dónde está tu parcela?");
    await click("EN");
    expect(document.documentElement.lang).toBe("en");
    expect(container.querySelector("h1")?.textContent).toBe("Where is your field?");
  });

  it("sends Spanish in the plan request after the Kansas field and three questions", async () => {
    await click("ES");
    await click("Kansas");
    expect(fetchField).toHaveBeenCalledWith(38.1095, -100.706, expect.any(AbortSignal));
    expect(button("Sí, esta es mi parcela →")).toBeTruthy();
    await click("Sí, esta es mi parcela →");
    expect(container.querySelector("h1")?.textContent).toBe("Tres preguntas rápidas");
    expect(container.textContent).toContain("¿Cómo se abastece de agua?");
    expect(container.textContent).toContain("¿Qué es lo más importante para ti?");
    await click("Trigo de invierno");
    await click("Mayor rentabilidadGanancia por acre");
    await click("Ver mi plan →");
    expect(fetchPlan).toHaveBeenCalledWith(expect.objectContaining({ language: "es", lat: 38.1095, lon: -100.706, recentCrops: expect.arrayContaining(["winter_wheat"]), priority: "profit", water: "full" }), expect.any(AbortSignal));
    expect(container.querySelector("h1")?.textContent).toBe("Preparando tu plan…");
  });

  it("regenerates an existing server result when the language changes", async () => {
    vi.mocked(fetchPlan).mockImplementation(async (request) => ({ request, plans: [], climate: { indicators: [] } } as unknown as PlanResponse));
    await click("Kansas");
    await click("Yes, this is my field →");
    await click("Show my plan →");
    expect(container.querySelector("h1")?.textContent).toBe("No feasible rotation found");
    await click("ES");
    expect(fetchPlan).toHaveBeenLastCalledWith(expect.objectContaining({ language: "es" }), expect.any(AbortSignal));
    expect(container.querySelector("h1")?.textContent).toBe("No se encontró una rotación viable");
    expect(container.querySelector('[role="note"]')?.textContent).toContain("SoilSense ayuda a explorar opciones");
  });

  it("translates field errors and allows a retry", async () => {
    vi.mocked(fetchField).mockRejectedValueOnce(new Error("Network failure"));
    await click("ES");
    await click("Kansas");
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("No pudimos cargar los datos de tu parcela");
    await click("Kansas");
    expect(button("Sí, esta es mi parcela →")).toBeTruthy();
  });
});
