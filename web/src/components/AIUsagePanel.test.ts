// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { AIUsagePanel } from "./AIUsagePanel";

let root: Root | undefined;
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

it("renders feature counts and latency, then clears stale results on an auth failure", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const fetch = vi.fn().mockResolvedValueOnce(Response.json({ available: true, windowHours: 24, limit: 5000, features: [{ feature: "scout", calls: 12, failures: 2, fallbacks: 1, p50LatencyMs: 345 }] })).mockResolvedValueOnce(Response.json({ error: "unauthorized" }, { status: 401 }));
  vi.stubGlobal("fetch", fetch);
  const container = document.createElement("div"); document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(createElement(AIUsagePanel)));
  expect(container.querySelector("input")?.type).toBe("password");
  expect(container.querySelector("button")?.disabled).toBe(true);
  // Submit directly to exercise rendering independently of browser input behavior.
  const submit = () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  await act(async () => { submit(); });
  expect(fetch).toHaveBeenCalledWith("/api/admin/ai-usage", expect.objectContaining({ cache: "no-store" }));
  const cells = [...container.querySelectorAll("tbody th, tbody td")].map(cell => cell.textContent);
  expect(cells).toEqual(["scout", "12", "2", "1", "345"]);
  expect(container.querySelector("caption")?.textContent).toBe("Model attempts by feature");
  await act(async () => { submit(); });
  expect(container.querySelector("table")).toBeNull();
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("ADMIN_TOKEN is required");
});
