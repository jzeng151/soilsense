// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { ScoutSessionProvider, useScoutSession } from "./ScoutSession";

it("hands history and a single live stream between unmounted views, persists it and isolates owners", async () => {
  localStorage.clear();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const fetcher = vi.fn(async () => new Response(new ReadableStream<Uint8Array>({ start(c) { controller = c; } }), { headers: { "content-type": "text/event-stream", "x-vercel-ai-ui-message-stream": "v1" } }));
  vi.stubGlobal("fetch", fetcher);
  const host = document.createElement("div"); document.body.append(host);
  let root = createRoot(host);
  function View({ name }: { name: string }) {
    const s = useScoutSession();
    return createElement("div", null, name, s.status, JSON.stringify(s.messages),
      createElement("button", { onClick: () => void s.sendMessage({ text: "My field question" }) }, "send"),
      createElement("button", { onClick: s.newChat }, "new"),
      createElement("button", { onClick: s.clearChat }, "clear"));
  }
  async function render(owner: string, name: string) { await act(async () => root.render(createElement(ScoutSessionProvider, { key: owner, ownerId: owner, children: createElement(View, { key: name, name }) }))); }
  async function event(e: object) { await act(async () => { controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(e)}\n\n`)); await new Promise(r => setTimeout(r, 15)); }); }
  try {
    await render("alice", "explore");
    await act(async () => (host.querySelector("button")!).click());
    await event({ type: "start", messageId: "reply" }); await event({ type: "text-start", id: "t" }); await event({ type: "text-delta", id: "t", delta: "First half" });
    await render("alice", "scout"); expect(host.textContent).toContain("First half"); expect(host.textContent).toContain("streaming");
    await event({ type: "text-delta", id: "t", delta: " and second half" });
    await render("alice", "explore"); expect(host.textContent).toContain("First half and second half"); expect(fetcher).toHaveBeenCalledTimes(1);
    await event({ type: "text-end", id: "t" }); await event({ type: "finish" });
    await act(async () => { controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n")); controller.close(); });
    await act(async () => root.unmount()); root = createRoot(host);
    await render("alice", "scout"); expect(host.textContent).toContain("First half and second half"); expect(fetcher).toHaveBeenCalledTimes(1);
    await render("bob", "scout"); expect(host.textContent).not.toContain("My field question");
    await render("alice", "explore"); expect(host.textContent).toContain("My field question");
    await act(async () => (host.querySelectorAll("button")[2]!).click()); expect(host.textContent).not.toContain("My field question");
    await render("guest", "scout"); expect(host.textContent).not.toContain("First half");
  } finally { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); }
});
