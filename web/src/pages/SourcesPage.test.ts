// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import { LanguageProvider, LANGUAGE_STORAGE_KEY, useI18n } from "../i18n";
import { pageCropText, pageErrorText, pageMessages, pageStatusText, pageTranslate, pageWatchText } from "../i18n-pages";
import { SourcesPage } from "./SourcesPage";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined;
  document.body.replaceChildren();
  localStorage.clear();
});

function LanguageControls() {
  const { setLanguage } = useI18n();
  return createElement("div", null, ...(["en", "es", "ko"] as const).map(language =>
    createElement("button", { key: language, onClick: () => setLanguage(language) }, language)));
}

it.each(["en", "es", "ko"] as const)("renders every Sources description, chip, badge and link in %s and updates on language changes", async language => {
  localStorage.setItem(LANGUAGE_STORAGE_KEY, "en");
  const container = document.createElement("div"); document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(createElement(LanguageProvider, { children: createElement("div", null,
    createElement(LanguageControls), createElement(SourcesPage, { onMenu: () => {} })) })));
  const selector = ".src-head p, .src-head h1, .src-group > h2, .src-group > p, .src-card > p, .src-card h4, .src-chip, .src-badge, .src-link";
  const english = [...container.querySelectorAll(selector)].map(node => node.textContent!);
  const urls = [...container.querySelectorAll<HTMLAnchorElement>(".src-link")].map(link => link.href);
  await act(async () => [...container.querySelectorAll("button")].find(button => button.textContent === language)!.click());
  expect(container.querySelector("h1")?.textContent).toBe({ en: "Where our data comes from", es: "De dónde vienen nuestros datos", ko: "데이터는 어디에서 오나요" }[language]);
  expect(container.querySelector(".sources")?.getAttribute("lang")).toBe(language);
  expect(container.querySelector(".sb-toggle")?.getAttribute("aria-label")).toBe({ en: "Open sidebar", es: "Abrir menú lateral", ko: "사이드바 열기" }[language]);
  expect(container.querySelectorAll(".src-card")).toHaveLength(14);
  const localized = [...container.querySelectorAll(selector)].map(node => node.textContent!);
  english.forEach((value, index) => {
    if (value !== "pH") expect(Object.hasOwn(pageMessages.en, value), value).toBe(true);
    expect(localized[index], value).toBe(pageTranslate(language, value));
    if (language !== "en" && value !== "pH") expect(localized[index], value).not.toBe(value);
  });
  expect([...container.querySelectorAll<HTMLAnchorElement>(".src-link")].map(link => link.href)).toEqual(urls);
  expect(container.textContent).toContain("NASA POWER");
  expect(container.textContent).toContain("95 °F");
  expect(container.textContent).toContain("Workers AI (Llama 3.3)");
  expect(container.querySelectorAll('.src-card h3[lang="en"]')).toHaveLength(14);
  // The mounted page must respond to the shared preference without a reload.
  await act(async () => [...container.querySelectorAll("button")].find(button => button.textContent === "en")!.click());
  expect([...container.querySelectorAll(selector)].map(node => node.textContent!)).toEqual(english);
});

it("reports Korean page coverage, preserves interpolation values and falls back to English", () => {
  const placeholders = (value: string) => [...value.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
  for (const language of ["es", "ko"] as const) {
    if (language === "es") expect(Object.keys(pageMessages.es)).toEqual(Object.keys(pageMessages.en));
    else {
      const missing = Object.keys(pageMessages.en).filter(key => !pageMessages.ko[key as keyof typeof pageMessages.en]);
      console.info(`Korean pages: ${Object.keys(pageMessages.en).length - missing.length}/${Object.keys(pageMessages.en).length}; ${missing.length} keys fall back to English`, missing);
    }
    for (const key of Object.keys(pageMessages.en) as (keyof typeof pageMessages.en)[]) {
      const value = pageMessages[language][key];
      if (value === undefined && language === "ko") { expect(pageTranslate(language, key)).toBe(key); continue; }
      expect(value?.trim(), `${language}: ${key}`).not.toBe("");
      expect(placeholders(value!), `${language}: ${key}`).toEqual(placeholders(key));
    }
  }
  expect(pageTranslate("fr", "Watch a call")).toBe("Watch a call");
  expect(pageTranslate("ko", "Unknown provider label")).toBe("Unknown provider label");
  expect(pageTranslate("ko", "ZIP {zip}", { zip: "00123" })).toBe("우편번호 00123");
  expect(pageTranslate("es", "ZIP {zip}")).toBe("Código postal {zip}");
  expect(pageTranslate("ko", "__proto__")).toBe("__proto__");
  expect(pageStatusText("es", "pending_review")).toBe("Pendiente de revisión");
  expect(pageStatusText("ko", "indexed")).toBe("색인 완료");
  expect(pageErrorText("ko", "Research server returned HTTP 503")).toBe("연구 서버가 HTTP 503을 반환했습니다");
  expect(pageErrorText("es", "Request failed (401)")).toBe("La solicitud falló (401)");
  expect(pageErrorText("es", "An unexpected upstream diagnostic")).toBe("La solicitud falló");
  expect(pageCropText("ko", "soybean")).toBe("대두");
  expect(pageCropText("ko", "corn")).toBe("옥수수");
  expect(pageCropText("ko", "Winter wheat")).toBe("겨울밀");
  expect(pageCropText("ko", "cover")).toBe("피복작물");
});

it.each(["es", "ko"] as const)("translates every deterministic live Field Watch headline in %s without rewriting provider prose", language => {
  const headlines = [
    "Not enough recent NASA data to check Finney, KS",
    "Not enough past years to judge Finney, KS",
    "Check failed for Finney, KS: a data service didn't answer",
    "Dry spell starting: 0.2 in of rain in 14 days, drier than 95% of past years, and soil drier than usual (4th percentile)",
    "Watch: rain below normal (0.3 in in 14 days)",
    "Watch: rain below normal (0.3 in in 14 days), soil unconfirmed",
    "Watch: soil drier than usual (22nd percentile)",
    "OK: 2.1 in of rain in 14 days, wetter than usual for this time of year",
    "OK: 1.0 in of rain in 14 days, near normal for this time of year",
  ];
  for (const headline of headlines) {
    expect(pageWatchText(language, headline)).not.toBe(headline);
    expect(pageWatchText("en", headline)).toBe(headline);
    expect(pageWatchText(language, `Historical replay: ${headline}`)).not.toContain("Historical replay:");
  }
  const providerText = "Research finding: a soybean rotation performed differently in this trial.";
  expect(pageWatchText(language, providerText)).toBe(providerText);
});
