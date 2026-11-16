// @vitest-environment happy-dom
import { act, createElement as h } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import type { FieldResponse, PlanResponse } from "../../src/shared/types";
import { App, type PlannerWorkspaceProps } from "./App";
import { LanguageProvider } from "./i18n";
import { fetchField, fetchPlan } from "./api";
vi.mock("./components/MapPicker", () => ({ MapPicker: () => null, DEMO_FARMS: [] }));
vi.mock("./components/FieldWatchCard", () => ({ FieldWatchCard: () => null }));
vi.mock("./api", () => ({ fetchField: vi.fn(), fetchPlan: vi.fn(), askQuestion: vi.fn(), subscribeLastPlan: () => () => {}, getLastPlan: () => null }));

it("rejects a late plan even if the API ignores abort, then submits the newly edited water settings", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ enabled: false })));
  HTMLElement.prototype.scrollIntoView = vi.fn();
  vi.mocked(fetchField).mockResolvedValue({ county: { countyName: "Finney County", stateCode: "KS" }, soil: { available: false }, cropHistory: { years: [{ year: 2025, crop: "corn", cdlCode: 1, cdlName: "Corn" }] } } as FieldResponse);
  const replies: ((p: PlanResponse) => void)[] = [];
  vi.mocked(fetchPlan).mockImplementation(() => new Promise(resolve => replies.push(resolve)));
  const changed = vi.fn();
  const el = document.createElement("div"); document.body.append(el); const root = createRoot(el);
  const click = async (selector: string, index = 0) => act(async () => (el.querySelectorAll(selector)[index] as HTMLButtonElement).click());
  try {
    await act(async () => { root.render(h(LanguageProvider, null, h<PlannerWorkspaceProps>(App, { embedded: true, initialLocation: { lat: 38.1095, lon: -100.706 }, onPlanChange: changed }))); await new Promise(r => setTimeout(r, 25)); });
    await act(async () => (Array.from(el.querySelectorAll('button')).find(b => b.textContent === 'Show my plan →')!).click());
    const oldSignal = vi.mocked(fetchPlan).mock.calls[0]![1]!;
    await click('.jr-progress button', 1);
    await click('[aria-label="Water supply"] button', 2);
    expect(oldSignal.aborted).toBe(true);
    const oldResult = { request: { water: 'rain', priority: 'balanced' }, plans: [], climate: { indicators: [] } } as unknown as PlanResponse;
    await act(async () => { replies[0]!(oldResult); await new Promise(r => setTimeout(r, 10)); });
    expect(changed.mock.calls.some(([p]) => p === oldResult)).toBe(false);
    expect(el.querySelector('h1')?.textContent).toBe('Three quick questions');
    await act(async () => (Array.from(el.querySelectorAll('button')).find(b => b.textContent === 'Show my plan →')!).click());
    expect(vi.mocked(fetchPlan).mock.lastCall![0]).toMatchObject({ irrigated: true, water: 'full' });
  } finally { await act(async () => root.unmount()); el.remove(); vi.clearAllMocks(); vi.unstubAllGlobals(); }
});
