// @vitest-environment happy-dom
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { ScoutMessage } from "./ScoutMessage";

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
