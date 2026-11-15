// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { MeasurementPanel } from "./Measurements";
import { LanguageProvider } from "../i18n";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let cleanup = async () => {};
afterEach(async () => { await cleanup(); localStorage.clear(); });
it("labels optional inputs, validates them, persists by field and restores on remount", async () => {
  const onChange = vi.fn();
  const container = document.createElement("div"); document.body.append(container);
  let root = createRoot(container);
  const render = () => createElement(LanguageProvider, null, createElement(MeasurementPanel, { fieldKey: "38.1095,-100.706", soil: { available: true, source: "map", ph: 6.4 }, onChange }));
  await act(async () => root.render(render()));
  expect(container.querySelector("details")?.open).toBe(false);
  const ph = container.querySelector<HTMLInputElement>('input[name="ph"]')!;
  expect(ph).toBeTruthy();
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(ph, "5.8"); ph.dispatchEvent(new Event("input", { bubbles: true })); });
  expect(onChange).toHaveBeenLastCalledWith({ soilTest: { ph: 5.8 } }, true);
  await act(async () => root.unmount());
  root = createRoot(container); await act(async () => root.render(render()));
  expect(container.querySelector<HTMLInputElement>('input[name="ph"]')!.value).toBe("5.8");
  expect(container.textContent).toContain("USDA soil map");
  expect(container.textContent).toContain("Your soil test");
  cleanup = async () => { await act(async () => root.unmount()); container.remove(); };
});

it("blocks invalid/incomplete records, preserves zero, isolates fields and clears saved measurements", async () => {
  const onChange = vi.fn();
  const container = document.createElement("div"); document.body.append(container);
  const root = createRoot(container);
  cleanup = async () => { await act(async () => root.unmount()); container.remove(); };
  const render = (fieldKey: string) => createElement(LanguageProvider, null, createElement(MeasurementPanel, { key: fieldKey, fieldKey, soil: { available: true, source: "map" }, onChange }));
  await act(async () => root.render(render("field-a")));
  const input = async (selector: string, value: string) => { const el = container.querySelector<HTMLInputElement>(selector)!; await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, value); el.dispatchEvent(new Event("input", { bubbles: true })); }); };
  const click = async (text: string) => { const el = [...container.querySelectorAll("button")].find((b) => b.textContent === text)!; await act(async () => el.click()); };
  await input('input[name="ph"]', "15");
  expect(onChange).toHaveBeenLastCalledWith({}, false);
  expect(container.querySelector('[role="alert"]')).toBeTruthy();
  await input('input[name="ph"]', "5.8");
  await click("Add a yield year · Corn");
  expect(document.activeElement).toBe(container.querySelector('.measurement-row input'));
  expect(onChange).toHaveBeenLastCalledWith({}, false);
  await input('.measurement-row input', "2025");
  await input('.measurement-row label:nth-child(2) input', "0");
  expect(onChange).toHaveBeenLastCalledWith({ soilTest: { ph: 5.8 }, yieldRecords: [{ crop: "corn", year: 2025, value: 0, unit: "bu/acre" }] }, true);
  await click("Remove yield year");
  expect(document.activeElement?.textContent).toBe("Add a yield year · Corn");
  await act(async () => root.render(render("field-b")));
  expect(onChange).toHaveBeenLastCalledWith({}, true);
  expect(container.querySelector<HTMLInputElement>('input[name="ph"]')!.value).toBe("");
  await act(async () => root.render(render("field-a")));
  expect(container.querySelector<HTMLInputElement>('input[name="ph"]')!.value).toBe("5.8");
  await click("Clear my measurements");
  expect(onChange).toHaveBeenLastCalledWith({}, true);
  expect(container.querySelector<HTMLInputElement>('input[name="ph"]')!.value).toBe("");
});
