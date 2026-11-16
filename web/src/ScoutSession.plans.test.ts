// @vitest-environment happy-dom
import { act, createElement, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { ScoutSessionProvider, useScoutSession } from "./ScoutSession";
import { loadChats } from "./chats";
import type { PlanResponse } from "../../src/shared/types";

it("keeps a same-plan stream, cancels on invalidation, archives old answers and blocks old-plan retries", async () => {
  localStorage.clear(); Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const location = { label: "Ames", lat: 42, lon: -93, selectedFieldIds: ["field-a"] };
  const plan = { generatedAt: "plan-a", request: { water: "limited", priority: "profit" }, explanation: { summary: "Plan A" }, facts: [], assumptions: [], plans: [] } as unknown as PlanResponse;
  let signal: AbortSignal | null | undefined;
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const fetcher = vi.fn(async (_url: RequestInfo | URL, options?: RequestInit) => {
    signal = options?.signal;
    return new Response(new ReadableStream<Uint8Array>({ start(c) { controller = c; } }), { headers: { "content-type": "text/event-stream", "x-vercel-ai-ui-message-stream": "v1" } });
  }); vi.stubGlobal("fetch", fetcher);
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  function View() {
    const s = useScoutSession();
    useEffect(() => s.setFieldContext({ location, plan, requiresPlan: true }), [s.setFieldContext]);
    return createElement("div", null, s.status, s.blockedReason, JSON.stringify(s.messages),
      createElement("button", { onClick: () => void s.sendMessage({ text: "Old plan question" }) }, "send"),
      createElement("button", { onClick: () => s.setFieldContext({ location: { ...location }, plan: { ...plan }, requiresPlan: true }) }, "same"),
      createElement("button", { onClick: () => s.setFieldContext({ location, plan: null, requiresPlan: true }) }, "invalidate"),
      createElement("button", { onClick: () => void s.regenerate() }, "retry"),
      createElement("button", { onClick: () => s.setFieldContext({ location, plan: { ...plan, generatedAt: "plan-b" }, requiresPlan: true }) }, "replace"),
      createElement("button", { onClick: () => s.openChat(s.chats[0]!.id) }, "archive"),
      createElement("button", { onClick: s.newChat }, "new"));
  }
  const click = async (i: number) => act(async () => { host.querySelectorAll("button")[i]!.click(); await new Promise(r => setTimeout(r, 15)); });
  try {
    await act(async () => root.render(createElement(ScoutSessionProvider, { ownerId: "guest", children: createElement(View) })));
    await click(0);
    await act(async () => { for (const e of [{ type: "start", messageId: "a" }, { type: "text-start", id: "t" }, { type: "text-delta", id: "t", delta: "Old plan partial answer" }]) controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(e)}\n\n`)); await new Promise(r => setTimeout(r, 15)); });
    await click(1); expect(signal?.aborted).toBe(false); expect(host.textContent).toContain("Old plan partial answer");
    await click(2); expect(signal?.aborted).toBe(true); expect(host.textContent).toContain("plan-required"); expect(host.textContent).not.toContain("Old plan question");
    expect(loadChats("guest")[0]?.messages).toHaveLength(2);
    await click(0); await click(3); expect(fetcher).toHaveBeenCalledTimes(1);
    await click(4); await click(5); expect(host.textContent).toContain("archived-plan"); expect(host.textContent).toContain("Old plan partial answer");
    await click(0); await click(3); expect(fetcher).toHaveBeenCalledTimes(1);
    await click(6); await click(0); expect(fetcher).toHaveBeenCalledTimes(2);
    await click(1); expect(signal?.aborted).toBe(true); // B → A replacement, without a null transition.
    expect(loadChats("guest")).toHaveLength(2);
  } finally { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); localStorage.clear(); }
});
