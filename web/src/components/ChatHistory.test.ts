// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import { ScoutSessionProvider, useScoutSession } from "../ScoutSession";
import { loadChats, saveChats } from "../chats";
import { ChatHistory } from "./ChatHistory";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
afterEach(() => localStorage.clear());

it("lists Recent chats in Sprout, reopens one, deletes one and returns focus on Escape", async () => {
  saveChats("guest", [
    { id: "a", title: "Corn after corn in Finney", updatedAt: 2, messages: [{ id: "qa", role: "user", parts: [{ type: "text", text: "Question A" }] }] },
    { id: "b", title: "Ames rainfall trend", updatedAt: 1, messages: [{ id: "qb", role: "user", parts: [{ type: "text", text: "Question B" }] }] },
  ]);
  function Active() { return createElement("output", null, useScoutSession().activeId ?? ""); }
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  const toggle = () => host.querySelector<HTMLButtonElement>(".sc-history-btn")!;
  try {
    await act(async () => root.render(createElement(ScoutSessionProvider, { ownerId: "guest", children: [createElement(ChatHistory, { key: "h" }), createElement(Active, { key: "a" })] })));
    expect(toggle().textContent).toBe("Recent chats 2");
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
    expect(host.querySelector("#sc-history-panel")).toBeNull();

    await act(async () => toggle().click());
    expect(toggle().getAttribute("aria-expanded")).toBe("true");
    expect([...host.querySelectorAll(".sc-chat")].map((b) => b.textContent)).toEqual(["Corn after corn in Finney", "Ames rainfall trend"]);

    await act(async () => host.querySelectorAll<HTMLButtonElement>(".sc-chat")[1]!.click());
    expect(host.querySelector("output")?.textContent).toBe("b");

    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Delete chat Corn after corn in Finney"]')!.click());
    expect([...host.querySelectorAll(".sc-chat")].map((b) => b.textContent)).toEqual(["Ames rainfall trend"]);
    expect(loadChats("guest").map((c) => c.id)).toEqual(["b"]);

    await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    expect(host.querySelector("#sc-history-panel")).toBeNull();
    expect(document.activeElement).toBe(toggle());
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
