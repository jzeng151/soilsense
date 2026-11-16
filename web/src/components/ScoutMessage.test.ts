// @vitest-environment happy-dom
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { ScoutMessage } from "./ScoutMessage";
import type { UIMessage } from "ai";

it("marks an output-limit interruption without pretending the answer is complete", () => {
  const message = { id: "cut", role: "assistant", parts: [{ type: "text", text: "A partial answer" }, { type: "data-answer-incomplete", data: true }] } as UIMessage;
  const html = renderToStaticMarkup(createElement(ScoutMessage, { message, streaming: false }));
  expect(html).toContain("Answer stopped early. Ask Sprout to continue.");
});

it("connects fact and research references to their actual source, not a guessed URL", () => {
  const message = { id: "cited", role: "assistant", parts: [
    { type: "text", text: "Warming [trend-gdd]. Trial [R1]. Missing [risk-sorghum]." },
    { type: "data-plan-facts", data: [{ id: "trend-gdd", text: "More accumulated warmth", source: "NASA POWER" }] },
    { type: "source-url", sourceId: "R1", title: "Reviewed trial", url: "https://example.org/trial" },
  ] } as UIMessage;
  const html = renderToStaticMarkup(createElement(ScoutMessage, { message, streaming: false }));
  expect(html).toContain("More accumulated warmth");
  expect(html).toContain("(NASA POWER)");
  expect(html).toContain("(Reviewed trial)");
  expect(html).toContain("Source unavailable (risk-sorghum)");
});

it("never renders reasoning, including completed reasoning, and uses only a generic pending status", () => {
  for (const streaming of [true, false]) {
    const html = renderToStaticMarkup(createElement(ScoutMessage, { message: { id: "private", role: "assistant", parts: [{ type: "reasoning", text: "PRIVATE MODEL THOUGHTS", state: "done" }] }, streaming }));
    expect(html).not.toContain("PRIVATE MODEL THOUGHTS");
    expect(html).not.toContain("<details");
    expect(html.includes("Thinking…")).toBe(streaming);
  }
});

it("the browser smoke reads an English answer even when it inherits the page language", () => {
  const text = "Crop rotation can improve soil health. This English answer inherits the page language and does not need a language attribute.";
  const html = renderToStaticMarkup(createElement(ScoutMessage, { message: { id: "smoke", role: "assistant", parts: [{ type: "text", text }] }, streaming: false }));
  const container = document.createElement("div");
  container.innerHTML = html;
  const source = readFileSync("scripts/e2e.mjs", "utf8");
  const selector = source.match(/reply\.locator\('([^']+)'\)/)?.[1];
  expect(selector).toBeTruthy();
  expect(container.querySelector(".sc-bot")!.querySelector(selector!)?.textContent).toBe(text);
});
