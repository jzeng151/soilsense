// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { ScoutSessionProvider, useScoutSession } from "./ScoutSession";
import { loadChats, saveChats } from "./chats";

it("new keeps Recent chats, reopening restores history, delete removes stored history", async () => {
  localStorage.clear();
  saveChats("guest", [{ id: "saved", title: "Saved field", updatedAt: 1, messages: [{ id: "q", role: "user", parts: [{ type: "text", text: "Saved question" }] }] }]);
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  function View() {
    const s = useScoutSession();
    return createElement("div", null, JSON.stringify(s.messages),
      createElement("button", { onClick: s.newChat }, "new"),
      createElement("button", { onClick: () => s.openChat("saved") }, "open"),
      createElement("button", { onClick: () => s.deleteChat("saved") }, "delete"),
      createElement("button", { onClick: s.clearChat }, "clear"),
      createElement("ul", null, s.chats.map(c => createElement("li", { key: c.id }, c.title))));
  }
  const click = async (i: number) => act(async () => host.querySelectorAll("button")[i]!.click());
  try {
    await act(async () => root.render(createElement(ScoutSessionProvider, { ownerId: "guest", children: createElement(View) })));
    await click(1); expect(host.textContent).toContain("Saved question");
    await click(0); expect(host.textContent).not.toContain("Saved question"); expect(host.querySelector("li")?.textContent).toBe("Saved field");
    await click(1); expect(host.textContent).toContain("Saved question");
    await click(2); expect(host.querySelector("li")).toBeNull(); expect(host.textContent).not.toContain("Saved question");
    expect(loadChats("guest")).toEqual([]);
  } finally { await act(async () => root.unmount()); host.remove(); }
});

it("sign-out cancels the old stream, restores partial history without replay, and never writes it to guest", async () => {
  localStorage.clear();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  let signal: AbortSignal | undefined;
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const fetcher = vi.fn(async (_url: RequestInfo | URL, options?: RequestInit) => {
    signal = options?.signal ?? undefined;
    return new Response(new ReadableStream<Uint8Array>({ start(c) { controller = c; } }), { headers: { "content-type": "text/event-stream", "x-vercel-ai-ui-message-stream": "v1" } });
  });
  vi.stubGlobal("fetch", fetcher);
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  function View() { const s = useScoutSession(); return createElement("button", { onClick: () => void s.sendMessage({ text: "Private field" }) }, JSON.stringify(s.messages), s.status); }
  const render = async (ownerId: string) => act(async () => root.render(createElement(ScoutSessionProvider, { ownerId, children: createElement(View) })));
  try {
    await render("alice"); await act(async () => host.querySelector("button")!.click());
    await act(async () => { for (const e of [{ type: "start", messageId: "a" }, { type: "text-start", id: "t" }, { type: "text-delta", id: "t", delta: "Partial private answer" }]) controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(e)}\n\n`)); await new Promise(r => setTimeout(r, 20)); });
    await render("guest"); expect(signal?.aborted).toBe(true); expect(host.textContent).not.toContain("Private field"); expect(loadChats("guest")).toEqual([]);
    await render("alice"); expect(host.textContent).toContain("Partial private answer"); expect(host.textContent).toContain("ready"); expect(fetcher).toHaveBeenCalledTimes(1);
  } finally { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); }
});
