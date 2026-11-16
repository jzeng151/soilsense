// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { FieldAssistantPanel, type FieldAssistantContext } from "./FieldAssistantPanel";
import { LanguageProvider } from "../../i18n";

const location: FieldAssistantContext = { label: "Ames, IA", lat: 42.03, lon: -93.62, zip: "50010", selectedFieldIds: ["story-ia"] };
// Deliberately small API fixtures: UI behavior is under test, not agronomy calculations.
const planFixture = { generatedAt: "2026-11-15T00:00:00Z", explanation: { summary: "Fixture summary" }, facts: [{ text: "Fixture soil fact", source: "USDA fixture" }], assumptions: ["Fixture rain-fed assumption"], plans: [{ years: [{ year: 2027, crop: "oats", cropName: "Oats" }, { year: 2028, crop: "alfalfa", cropName: "Alfalfa / hay" }] }] };
async function settle() { await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); }); }
function button(label: string) { return Array.from(host.querySelectorAll("button")).find(el => el.textContent?.includes(label))!; }
function streamResponse() {
  const events = [{ type: "start", messageId: "reply-fixture" }, { type: "text-start", id: "text" }, { type: "text-delta", id: "text", delta: "Fixture streamed answer." }, { type: "text-end", id: "text" }, { type: "source-url", sourceId: "fixture-source", url: "https://www.nrcs.usda.gov/", title: "Fixture source" }, { type: "finish" }];
  return new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join("") + "data: [DONE]\n\n", { headers: { "content-type": "text/event-stream", "x-vercel-ai-ui-message-stream": "v1" } });
}

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });

it("prompts for a ZIP without requesting a plan when no location is selected", async () => {
  const fetcher = vi.fn(async (_url: RequestInfo | URL) => Response.json({ configured: false })); vi.stubGlobal("fetch", fetcher);
  await act(async () => root.render(createElement(FieldAssistantPanel, { context: null })));
  expect(host.textContent).toContain("Enter a ZIP code");
  expect(host.querySelector("textarea")?.disabled).toBe(true);
  expect(fetcher.mock.calls.every(call => String(call[0]).includes("/status"))).toBe(true);
});

it("loads actual returned crops with explicit defaults and keeps facts usable without AI", async () => {
  const fetcher = vi.fn(async (url: RequestInfo | URL) => String(url).endsWith("/status") ? Response.json({ configured: false }) : Response.json(planFixture));
  vi.stubGlobal("fetch", fetcher);
  await act(async () => root.render(createElement(FieldAssistantPanel, { context: location })));
  await settle();
  expect(host.textContent).toContain("I've loaded a plan for Ames, IA");
  expect(host.textContent).toContain("AI is unavailable");
  expect(host.querySelector(".fa-rotation")?.textContent).toContain("Oats");
  expect(host.querySelector(".fa-rotation")?.textContent).not.toContain("Corn");
  expect(host.textContent).toContain("Fixture soil fact");
  expect(host.querySelector("textarea")?.disabled).toBe(true);
  expect(fetcher.mock.calls.filter(call => String(call[0]) === "/api/plan")).toHaveLength(1);
});

it("streams through the existing Scout protocol, sends selected context and renders source citations", async () => {
  let payload: { messages: { parts: { text?: string }[] }[] } | undefined;
  vi.stubGlobal("fetch", vi.fn(async (url: RequestInfo | URL, options?: RequestInit) => {
    if (String(url).endsWith("/status")) return Response.json({ configured: true });
    if (String(url) === "/api/plan") { expect(JSON.parse(String(options?.body))).toEqual({ lat: 42.03, lon: -93.62, irrigated: false, priority: "balanced", language: "en" }); return Response.json(planFixture); }
    expect(String(url)).toBe("/api/scout/chat"); payload = JSON.parse(String(options?.body)); return streamResponse();
  }));
  await act(async () => root.render(createElement(FieldAssistantPanel, { context: location })));
  await settle();
  await act(async () => button("Why is this rotation").click()); await settle();
  expect(payload?.messages.at(-1)?.parts.map(p => p.text).join(" ")).toContain('"selectedFieldIds":["story-ia"]');
  expect(payload?.messages.at(-1)?.parts.map(p => p.text).join(" ")).toContain("Fixture soil fact");
  expect(host.textContent).toContain("Fixture streamed answer.");
  expect(host.querySelector('a[href="https://www.nrcs.usda.gov/"]')?.textContent).toContain("Fixture source");
  expect(host.querySelector(".fa-user-bubble")?.textContent).toBe("Why is this rotation recommended?");
  expect(host.querySelectorAll(".fa-turn time")).toHaveLength(2);
  await act(async () => button("Clear chat").click());
  expect(host.querySelector(".fa-thread")?.textContent).toBe("");
  expect(host.querySelector("textarea")).toBe(document.activeElement);
});

it("shows a localized rate-limit error without discarding the plan", async () => {
  vi.stubGlobal("fetch", vi.fn(async (url: RequestInfo | URL) => String(url).endsWith("/status") ? Response.json({ configured: true }) : String(url) === "/api/plan" ? Response.json(planFixture) : Response.json({ error: "rate limited" }, { status: 429 })));
  await act(async () => root.render(createElement(FieldAssistantPanel, { context: location })));
  await settle(); await act(async () => button("Why is this rotation").click()); await settle();
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("Wait a minute");
  expect(host.querySelector(".fa-rotation")?.textContent).toContain("Oats");
});

it("reports plan failure with retry and removes prior conversation on a new location", async () => {
  let fail = true;
  vi.stubGlobal("fetch", vi.fn(async (url: RequestInfo | URL) => String(url).endsWith("/status") ? Response.json({ configured: true }) : String(url) === "/api/plan" ? fail ? Response.json({ error: "upstream unavailable" }, { status: 503 }) : Response.json(planFixture) : streamResponse()));
  await act(async () => root.render(createElement(FieldAssistantPanel, { context: location })));
  await settle(); expect(host.textContent).toContain("Could not load the plan");
  fail = false; await act(async () => button("Try again").click()); await settle();
  await act(async () => button("Why is this rotation").click()); await settle();
  expect(host.textContent).toContain("Fixture streamed answer");
  await act(async () => root.render(createElement(FieldAssistantPanel, { context: { label: "Other field", lat: 40, lon: -100 } })));
  await settle(); expect(host.textContent).not.toContain("Fixture streamed answer"); expect(host.textContent).toContain("Other field");
});

it("submits Enter, preserves Shift+Enter, and keeps the outgoing user bubble clean", async () => {
  let requests = 0;
  vi.stubGlobal("fetch", vi.fn(async (url: RequestInfo | URL) => {
    if (String(url).endsWith("/status")) return Response.json({ configured: true });
    if (String(url) === "/api/plan") return Response.json(planFixture);
    requests++; return streamResponse();
  }));
  await act(async () => root.render(createElement(FieldAssistantPanel, { context: location })));
  await settle();
  const input = host.querySelector("textarea")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(input, "Question about water");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", shiftKey: true, bubbles: true, cancelable: true })));
  expect(requests).toBe(0);
  await act(async () => input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })));
  await settle(); expect(requests).toBe(1);
  expect(host.querySelector(".fa-user-bubble")?.textContent).toBe("Question about water");
});

it("uses Spanish for controls and crop names and exposes the close action", async () => {
  localStorage.setItem("soilsense.language", "es"); const close = vi.fn();
  vi.stubGlobal("fetch", vi.fn(async (url: RequestInfo | URL) => String(url).endsWith("/status") ? Response.json({ configured: false }) : Response.json(planFixture)));
  await act(async () => root.render(createElement(LanguageProvider, { children: createElement(FieldAssistantPanel, { context: location, onClose: close }) })));
  await settle(); expect(host.textContent).toContain("Tu asesor de campo con IA"); expect(host.querySelector(".fa-rotation")?.textContent).toContain("Avena");
  await act(async () => (host.querySelector('[aria-label="Cerrar asistente"]') as HTMLButtonElement).click()); expect(close).toHaveBeenCalledOnce();
  localStorage.removeItem("soilsense.language");
});
