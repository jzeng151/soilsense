// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { DistrictOutlook } from "./DistrictOutlook";
import type { DistrictOutlook as Outlook } from "../../../src/shared/districtOutlook";
import { LanguageProvider } from "../i18n";

let root: Root | undefined;
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined;
  document.body.replaceChildren();
  localStorage.clear();
  vi.unstubAllGlobals();
});
const outlook: Outlook = { fips: "20001", alert: "watch", situation: "onset", dataThrough: "2026-11-09", source: { name: "Team Kansas model", url: "https://example.test/model-fixture" }, basis: "dry-year water", dryYearRanking: true, usdm: { validStart: "2026-11-10", status: "matched", sourceUrl: "https://example.test/usdm-fixture" } };
it("the dry-year link opens a county-specific Second opinion card, never displaying model or rotation percentages", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const fetch = vi.fn(async () => Response.json({ county: "Allen County", dataThrough: "2026-11-09", basis: "dry-year water", sourceUrl: "https://example.test/fixture", source: "Team Kansas model", droughtChanceNow: 0.99, rootzonePctNow: 1, rotations: [{ code: "W-S-F", name: "Wheat–sorghum–fallow", weightPct: 99 }], savedCopy: true }));
  vi.stubGlobal("fetch", fetch);
  const container = document.createElement("div"); document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(createElement(DistrictOutlook, { outlook })));
  const link = Array.from(container.querySelectorAll("a")).find((a) => a.textContent?.startsWith("K-State rotations"))!;
  expect(fetch).not.toHaveBeenCalled();
  const card = document.getElementById(link.getAttribute("aria-controls")!)!;
  expect(card.hidden).toBe(true);
  await act(async () => link.click());
  expect(fetch).toHaveBeenCalledWith("/api/second-opinion?fips=20001", { signal: undefined });
  expect(card.hidden).toBe(false);
  expect(card.textContent).toContain("Second opinion");
  expect(card.textContent).toContain("Allen County");
  expect(card.textContent).toContain("Wheat–sorghum–fallow");
  expect(card.textContent).toContain("Using a saved copy.");
  expect(container.textContent).not.toContain("%");
  expect(container.textContent).not.toContain("99");
});
it("renders the actual Spanish context and low-confidence wording", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.setItem("soilsense.language", "es");
  const container = document.createElement("div"); document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(createElement(LanguageProvider, null, createElement(DistrictOutlook, { outlook }))));
  expect(container.textContent).toContain("Perspectiva del distrito");
  expect(container.textContent).toContain("posible inicio de sequía (baja confianza)");
  expect(container.textContent).not.toContain("%");
});
