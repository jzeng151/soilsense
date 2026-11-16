// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { Shell } from "../Shell";
import { LANGUAGE_STORAGE_KEY } from "../i18n";

vi.mock("../auth", () => ({ getMe: async () => null, SIGNED_OUT_EVENT: "signed-out", signOut: async () => {} }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
afterEach(() => { localStorage.clear(); window.location.hash = ""; });

it.each(["en", "es"] as const)("opens the public how-it-works route in %s with sourced, image-free content", async language => {
  localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  window.location.hash = "#/how-it-works";
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => { root.render(createElement(Shell)); await import("./HowItWorksPage"); });
    expect(container.querySelector("h1")?.textContent).toBe(language === "en" ? "How it works" : "Cómo funciona");
    const nav = container.querySelector('a[href="#/how-it-works"]');
    expect(nav?.getAttribute("aria-current")).toBe("page");
    expect(nav?.textContent).toContain(language === "en" ? "How it works" : "Cómo funciona");
    expect(container.textContent).toContain("0.41");
    expect(container.textContent).toContain(language === "en" ? "42 of 43" : "42 de 43");
    expect(container.textContent).toContain(language === "en" ? "33 of 43" : "33 de 43");
    expect(container.textContent).toContain("6%");
    expect(container.querySelectorAll("table")).toHaveLength(2);
    expect([...container.querySelectorAll('section[aria-labelledby="hiw-products"] tbody th > span')].map(node => node.textContent)).toEqual([
      "Workers", "Static assets", "D1", "R2 + event notifications", "Queues", "Workflows", "Durable Objects / Agents SDK", "Cron Triggers", "Workers AI", "Vectorize", "AI Gateway", "Rate Limiting",
    ]);
    expect(container.querySelectorAll("svg[role=img]").length).toBeGreaterThan(0);
    expect(container.querySelectorAll("main img, main image, main iframe")).toHaveLength(0);
    for (const image of container.querySelectorAll<HTMLImageElement>("img")) {
      expect(image.getAttribute("src")).not.toMatch(/^https?:\/\//);
    }
    for (const link of container.querySelectorAll<HTMLAnchorElement>('main a[href]')) {
      expect(new URL(link.href).protocol).toBe("https:");
    }
    const switchTo = language === "en" ? "Español" : "English";
    await act(async () => container.querySelector<HTMLButtonElement>(`button[aria-label="${switchTo}"]`)!.click());
    expect(container.querySelector("h1")?.textContent).toBe(language === "en" ? "Cómo funciona" : "How it works");
    await act(async () => { container.querySelector<HTMLAnchorElement>('a[href="#/sources"]')!.click(); await import("./SourcesPage"); });
    expect(container.querySelector("h1")?.textContent).toBe(language === "en" ? "De dónde vienen nuestros datos" : "Where our data comes from");
    await act(async () => container.querySelector<HTMLAnchorElement>('a[href="#/how-it-works"]')!.click());
    expect(container.querySelector("h1")?.textContent).toBe(language === "en" ? "Cómo funciona" : "How it works");
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
