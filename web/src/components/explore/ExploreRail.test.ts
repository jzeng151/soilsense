// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import { LanguageProvider } from "../../i18n";
import { ExploreRail, NavRailProvider, RAIL_STORAGE_KEY } from "./ExploreRail";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
afterEach(() => { localStorage.clear(); delete document.documentElement.dataset.rail; });

async function mount() {
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  // Two rails (as when Explore stays mounted behind another page) must share one state.
  await act(async () => root.render(createElement(LanguageProvider, null, createElement(NavRailProvider, null,
    createElement(ExploreRail, { solid: true, current: "#/sources" }), createElement(ExploreRail, { current: "#/explore" })))));
  return { host, unmount: async () => { await act(async () => root.unmount()); host.remove(); } };
}

it("starts open, minimizes and re-expands from its toggle, and shares and remembers the choice", async () => {
  const { host, unmount } = await mount();
  try {
    const rails = () => [...host.querySelectorAll("nav.explore-rail")];
    const toggle = () => host.querySelector<HTMLButtonElement>(".rail-toggle")!;
    expect(rails().every((r) => r.classList.contains("is-open"))).toBe(true);
    expect(document.documentElement.dataset.rail).toBe("open");
    expect(toggle().getAttribute("aria-expanded")).toBe("true");
    expect(toggle().textContent).toBe("Minimize menu");
    expect(host.querySelector('nav a[aria-current="page"]')?.getAttribute("href")).toBe("#/sources");

    await act(async () => toggle().click());
    expect(rails().some((r) => r.classList.contains("is-open"))).toBe(false);
    expect(document.documentElement.dataset.rail).toBe("closed");
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
    expect(toggle().textContent).toBe("Expand menu");
    // Minimized: labels stay as accessible names and icons get tooltips.
    expect(host.querySelector('a[href="#/scout"]')?.textContent).toContain("Sprout");
    expect(host.querySelector('a[href="#/scout"]')?.getAttribute("title")).toBe("Sprout");
    expect(localStorage.getItem(RAIL_STORAGE_KEY)).toBe("closed");
  } finally { await unmount(); }

  // A new visit restores the minimized choice.
  const again = await mount();
  try {
    expect(again.host.querySelector("nav.explore-rail")?.classList.contains("is-open")).toBe(false);
    await act(async () => again.host.querySelector<HTMLButtonElement>(".rail-toggle")!.click());
    expect(localStorage.getItem(RAIL_STORAGE_KEY)).toBe("open");
  } finally { await again.unmount(); }
});
