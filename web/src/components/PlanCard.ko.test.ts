// @vitest-environment happy-dom
import { act, createElement as h, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { RotationPlan } from "../../../src/shared/types";
import { LanguageProvider, LANGUAGE_STORAGE_KEY } from "../i18n";
import { money, PlanRow, TopPlan } from "./PlanCard";

const plan: RotationPlan = {
  id: "korean-plan", label: "Winter wheat", avgNetReturnPerAcre: -1234, badYearsIn10: 2,
  coverYears: 3, totalNitrogenLbPerAcre: 40, waterPumpedIn: 0, notes: [],
  scores: { climate: 50, reliability: 50, soil: 50, profit: 50, total: 50 },
  years: (["cereal_rye", "crimson_clover", "hairy_vetch"] as const).map((cover, i) => ({
    year: 2027 + i, crop: "winter_wheat", cropName: "Winter wheat", cover,
    coverName: ["Cereal rye", "Crimson clover", "Hairy vetch"][i]!,
    climateScore: 0.5, reliability: 0.8, mainStress: null, expectedYield: 40,
    yieldUnit: "bu/acre", nitrogenLbPerAcre: 40, netReturnPerAcre: -1234,
  })),
};
let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  localStorage.setItem(LANGUAGE_STORAGE_KEY, "ko");
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  localStorage.clear();
  vi.restoreAllMocks();
});
async function render(children: ReactNode) {
  await act(async () => root.render(h(LanguageProvider, { children })));
}

it("renders the Korean summary, margin label, cover crops and USD with the Korean locale", async () => {
  const format = vi.spyOn(Intl, "NumberFormat");
  const summary = "겨울밀과 피복작물을 포함한 한국어 요약입니다.";
  await render(h(TopPlan, { plan, compareTo: { ...plan, avgNetReturnPerAcre: -3000 }, summary }));
  expect(container.querySelector(".px-title")?.textContent).toBe("요약");
  expect(container.querySelector(".px-narrative")?.textContent).toBe(summary);
  expect(container.querySelector(".top-stats dt")?.textContent).toBe("순마진");
  expect(container.querySelector(".years-crop")?.textContent).toBe("겨울밀");
  expect([...container.querySelectorAll(".years-cover")].map(el => el.textContent)).toEqual([
    "+ 겨울철 호밀", "+ 겨울철 크림슨클로버", "+ 겨울철 헤어리베치",
  ]);
  expect(container.textContent).toContain("약 $1,234 손실");
  expect(container.textContent).toContain("/acre/year");
  expect(container.querySelector(".delta-up")?.textContent).toBe("+$1,766 현재 대비");
  expect(format).toHaveBeenCalledWith("ko-KR");
  expect(container.querySelector(".top-plan")?.textContent).not.toMatch(/Winter wheat|Cereal rye|Crimson clover|Hairy vetch|Margen neto/);
});

it("localizes Korean option tooltips, yearly units and negative comparison amounts", async () => {
  await render(h("ul", null, h(PlanRow, { plan, title: "다른 선택지", compareTo: { ...plan, avgNetReturnPerAcre: 1000 } })));
  expect([...container.querySelectorAll(".chip")].map(el => el.getAttribute("title"))).toEqual([
    "2027: 겨울밀 + 호밀", "2028: 겨울밀 + 크림슨클로버", "2029: 겨울밀 + 헤어리베치",
  ]);
  expect(container.querySelector(".plan-row-money")?.textContent).toContain("−$1,234/acre/year");
  expect(container.querySelector(".plan-row-bad")?.textContent).toBe("2/10 흉작인 해");
  expect(container.querySelector(".delta-down")?.textContent).toBe("−$2,234 현재 대비");
});

it("keeps Korean break-even, no-cover and unchanged-comparison labels", async () => {
  const noCover = { ...plan, avgNetReturnPerAcre: -5, coverYears: 0, years: plan.years.map(y => ({ ...y, cover: "none" as const })) };
  await render(h(TopPlan, { plan: noCover, compareTo: noCover, summary: "한국어 요약" }));
  expect(container.textContent).toContain("손익분기점 수준");
  expect(container.querySelectorAll(".years-cover")[0]?.textContent).toBe("피복작물 없음");
  expect(container.querySelector(".delta-flat")?.textContent).toBe("현재와 동일");
  expect(container.querySelector(".top-stats > div:first-child dd small")).toBeNull();
});

it.each([
  ["en", ["Cereal rye", "Crimson clover", "Hairy vetch"], "/acre/yr"],
  ["es", ["centeno", "trébol encarnado", "veza vellosa"], "/acre/año"],
] as const)("preserves %s option cover names, money and units", async (language, covers, units) => {
  localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  await render(h("ul", null, h(PlanRow, { plan, title: "Other options" })));
  [...container.querySelectorAll(".chip")].forEach((el, i) => expect(el.getAttribute("title")).toContain(covers[i]));
  expect(container.querySelector(".plan-row-money")?.textContent).toContain(`−$1,234${units}`);
  expect(money(1234.5)).toBe("$1,235");
  expect(money(-1234.5, language)).toBe("−$1,234");
});
