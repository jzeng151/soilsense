// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MyFieldsContent, MyFieldsPanel, MY_FIELDS_KEY, readMyFields } from "./MyFieldsPanel";
import { LANGUAGE_STORAGE_KEY, LanguageProvider } from "../i18n";
import type { FieldBoundary } from "../../../src/shared/fields";
const fixture: FieldBoundary = { id: "csb:constructed-ui-test", source: "usda-csb", name: "Test field", areaAcres: 20, centroid: { lat: 38.1, lon: -100.7 }, polygon: [[[-100.71,38.10],[-100.70,38.10],[-100.70,38.11],[-100.71,38.10]]], provenance: { product: "constructed test fixture", version: "test", url: "https://example.invalid/fixture", retrieved: "2026-11-15" } };
const id = (n: number) => `u_${String(n).padStart(32, "a")}`;
let root: Root, host: HTMLDivElement;
async function render(content: ReturnType<typeof createElement>) { await act(async () => { root.render(createElement(LanguageProvider, null, content)); }); }
async function click(text: string) { const b = [...host.querySelectorAll("button")].find(b => b.textContent === text)!; expect(b).toBeTruthy(); await act(async () => { b.click(); }); }
beforeEach(() => {
  localStorage.clear();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
describe("My fields client", () => {
  it("hides all controls when discovery is disabled or unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ enabled: false }))));
    await render(createElement(MyFieldsPanel, { fields: [fixture] }));
    expect(host.textContent).toBe("");
  });
  it("renders and registers a fixture, persists the capability, confirms crop and defaults recurrence off", async () => {
    const calls: { url: string; method?: string; body?: string }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method, body: init?.body as string });
      return new Response(JSON.stringify(url.endsWith("register") ? { agentFieldId: id(1), capability: id(1) } : url.endsWith("watch") ? { settings: { enabled: false } } : { runs: [] }));
    }));
    await render(createElement(MyFieldsContent, { fields: [fixture] }));
    await click("Add selected field");
    expect(readMyFields()).toEqual([{ agentFieldId: id(1), name: "Test field", fieldId: fixture.id, acres: 20 }]);
    const registration = calls.find(c => c.url.endsWith("register"))!;
    expect(JSON.parse(registration.body!)).toEqual({ field: fixture, watchedCrop: "corn" });
    expect(host.textContent).toContain("Enable weekly watch");
    await click("Schedule field check");
    expect(calls.some(c => c.url.endsWith("/check") && c.method === "POST" && c.body === '{"mode":"live"}')).toBe(true);
    await click("Enable weekly watch");
    expect(calls.some(c => c.url.endsWith("/watch") && c.method === "PUT" && c.body === '{"enabled":true}')).toBe(true);
    await click("Remove field"); await click("Delete and forget");
    expect(calls.some(c => c.url === `/api/fields/${id(1)}` && c.method === "DELETE")).toBe(true);
    expect(readMyFields()).toEqual([]);
  });
  it("enforces the advisory browser limit and validates stored records", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => new Response(JSON.stringify(url.endsWith("watch") ? { settings: { enabled: false } } : { runs: [] }))));
    localStorage.setItem(MY_FIELDS_KEY, JSON.stringify(Array.from({ length: 11 }, (_, n) => ({ agentFieldId: id(n), name: `Field ${n}`, fieldId: `csb:${n}`, acres: n + 1 }))));
    expect(readMyFields()).toHaveLength(10);
    await render(createElement(MyFieldsContent, { fields: [fixture] }));
    expect([...host.querySelectorAll("button")].find(b => b.textContent === "Add selected field")!.disabled).toBe(true);
    localStorage.setItem(MY_FIELDS_KEY, '[{"agentFieldId":"bad"}]'); expect(readMyFields()).toEqual([]);
    localStorage.setItem(MY_FIELDS_KEY, '{bad'); expect(readMyFields()).toEqual([]);
  });
  it("renders Spanish controls and warnings", async () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, "es");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ enabled: true }))));
    await render(createElement(MyFieldsPanel, { fields: [fixture] }));
    expect(host.textContent).toContain("Mis parcelas");
    expect(host.textContent).toContain("Añadir parcela seleccionada");
    expect(host.textContent).toContain("no parcelas de propiedad");
  });
  it("does not forget a live watch when server deletion fails", async () => {
    localStorage.setItem(MY_FIELDS_KEY, JSON.stringify([{ agentFieldId: id(1), name: "Test field", fieldId: fixture.id, acres: 20 }]));
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => init?.method === "DELETE" ? new Response('{"error":"fields disabled"}', { status: 404 }) : new Response(JSON.stringify(url.endsWith("watch") ? { settings: { enabled: false } } : { runs: [] }))));
    await render(createElement(MyFieldsContent, { fields: [] }));
    await click("Remove field"); await click("Delete and forget");
    expect(readMyFields()).toHaveLength(1);
    expect(host.textContent).toContain("Field request failed. Try again.");
  });
});
