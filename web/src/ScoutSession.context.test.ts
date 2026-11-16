// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { ScoutSessionProvider, useScoutSession } from "./ScoutSession";
import { LanguageProvider, useI18n } from "./i18n";

it("reads changed language and field context on the next turn without resetting history or enriching visible messages", async () => {
  localStorage.clear();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const payloads: { language: string; messages: { parts: { type: string; text?: string }[] }[] }[] = [];
  const fetcher = vi.fn(async (_url: RequestInfo | URL, options?: RequestInit) => {
    payloads.push(JSON.parse(String(options?.body)));
    return new Response('data: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream', 'x-vercel-ai-ui-message-stream': 'v1' } });
  });
  vi.stubGlobal("fetch", fetcher);
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  function View() {
    const s = useScoutSession(); const { setLanguage } = useI18n();
    return createElement("div", null, JSON.stringify(s.messages),
      createElement("button", { onClick: () => s.setFieldContext({ location: { label: "Ames", lat: 42, lon: -93 }, plan: null }) }, "first field"),
      createElement("button", { onClick: () => { setLanguage("es"); s.setFieldContext({ location: { label: "Other field", lat: 40, lon: -100, selectedFieldIds: ["field-b"] }, plan: null }); } }, "change"),
      createElement("button", { onClick: () => void s.sendMessage({ text: "Question" }) }, "send"));
  }
  const click = async (i: number) => act(async () => { host.querySelectorAll("button")[i]!.click(); await new Promise(r => setTimeout(r, 20)); });
  try {
    await act(async () => root.render(createElement(LanguageProvider, { children: createElement(ScoutSessionProvider, { ownerId: "guest", children: createElement(View) }) })));
    await click(0); await click(2);
    expect(payloads[0]?.language).toBe("en"); expect(JSON.stringify(payloads[0])).toContain("Ames");
    await click(1); await click(2);
    expect(payloads[1]?.language).toBe("es"); expect(JSON.stringify(payloads[1])).toContain("field-b"); expect(JSON.stringify(payloads[1])).not.toContain("Ames");
    expect(payloads[1]?.messages).toHaveLength(1);
    expect(host.textContent).not.toContain("Selected location and client plan context"); expect(fetcher).toHaveBeenCalledTimes(2);
  } finally { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); localStorage.clear(); }
});
