// @vitest-environment happy-dom
import { act, createElement as h } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import type { PlanResponse } from "../../../../src/shared/types";
import { FieldAssistantPanel } from "./FieldAssistantPanel";
import { LanguageProvider } from "../../i18n";

it("uses the selected planner result and never requests a different automatic plan", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const fetcher = vi.fn(async (_url: RequestInfo | URL) => Response.json({ configured: false }));
  vi.stubGlobal("fetch", fetcher);
  const el = document.createElement("div"); document.body.append(el); const root = createRoot(el);
  const plan = { generatedAt: "2026-11-15", request: { irrigated: true, water: "full", priority: "profit" }, explanation: { summary: "Selected irrigated plan" }, facts: [], assumptions: [], plans: [{ years: [{ year: 2027, crop: "corn", cropName: "Corn" }] }] } as unknown as PlanResponse;
  const render = (sharedPlan: PlanResponse | null) => h(LanguageProvider, null, h(FieldAssistantPanel, { context: { lat: 38.1095, lon: -100.706, label: "Finney" }, sharedPlan }));
  try {
    await act(async () => { root.render(render(null)); await new Promise(r => setTimeout(r, 20)); });
    expect(fetcher.mock.calls.every(args => String(args[0]).endsWith("/status"))).toBe(true);
    expect(el.querySelector('.fa-plan')).toBeNull();
    await act(async () => root.render(render(plan)));
    expect(el.querySelector('.fa-defaults')?.textContent).toBe("full · profit");
    expect(el.querySelector('.fa-rotation')?.textContent).toContain("Corn");
    expect(fetcher.mock.calls.every(args => String(args[0]).endsWith("/status"))).toBe(true);
    await act(async () => root.render(render(null)));
    expect(el.querySelector('.fa-plan')).toBeNull();
  } finally { await act(async () => root.unmount()); el.remove(); vi.unstubAllGlobals(); }
});
