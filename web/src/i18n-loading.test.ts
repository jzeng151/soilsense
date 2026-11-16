import { expect, it, vi } from "vitest";

it("keeps Korean dictionaries empty for English and hydrates all views on selection", async () => {
  vi.resetModules();
  const ui = await import("./i18n");
  const pages = await import("./i18n-pages");
  await ui.loadLanguage("en");
  expect(Object.keys(ui.dictionaries.ko)).toHaveLength(0);
  expect(Object.keys(pages.pageMessages.ko)).toHaveLength(0);
  expect(ui.translate("ko", "Corn")).toBe("Corn");
  expect(ui.howItWorksCopy.title.ko).toBe("How it works");
  expect(pages.pageTranslate("ko", "Data sources")).toBe("Data sources");

  const first = ui.loadLanguage("ko");
  expect(ui.loadLanguage("ko")).toBe(first);
  await first;
  expect(ui.translate("ko", "Corn")).toMatch(/[가-힣]/);
  expect(ui.howItWorksCopy.title.ko).toMatch(/[가-힣]/);
  expect(pages.pageTranslate("ko", "Data sources")).toMatch(/[가-힣]/);
});
