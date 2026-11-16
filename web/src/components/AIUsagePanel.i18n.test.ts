// @vitest-environment happy-dom
import { act, createElement as h } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { LANGUAGE_LOCALES } from "../../../src/shared/language";
import { LanguageProvider, LANGUAGE_STORAGE_KEY } from "../i18n";
import { AIUsagePanel } from "./AIUsagePanel";

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it.each([
  {
    language: "en", title: "AI Gateway usage", token: "Admin token", refresh: "Refresh AI usage",
    caption: "Model attempts by feature", headers: ["Feature", "Calls", "Failures", "Fallbacks", "p50 latency (ms)"],
    caveat: "Fallbacks count attempts, not successful recoveries.",
    auth: "An ADMIN_TOKEN is required; a team sign-in is not enough.",
  },
  {
    language: "es", title: "Uso de AI Gateway", token: "Token de administrador", refresh: "Actualizar uso de IA",
    caption: "Intentos de modelo por función", headers: ["Función", "Llamadas", "Fallos", "Respaldos", "Latencia p50 (ms)"],
    caveat: "Los respaldos cuentan intentos, no recuperaciones exitosas.",
    auth: "Se requiere ADMIN_TOKEN; el acceso del equipo no basta.",
  },
  {
    language: "ko", title: "AI Gateway 사용량", token: "관리자 토큰", refresh: "AI 사용량 새로 고침",
    caption: "기능별 모델 시도 횟수", headers: ["기능", "호출", "실패", "대체 모델 시도", "p50 지연 시간(ms)"],
    caveat: "대체 모델 수치는 성공적인 복구가 아닌 시도 횟수입니다.",
    auth: "ADMIN_TOKEN이 필요합니다. 팀 로그인만으로는 이용할 수 없습니다.",
  },
] as const)("renders $language usage labels, localized counts and auth errors", async (copy) => {
  localStorage.setItem(LANGUAGE_STORAGE_KEY, copy.language);
  const fetcher = vi.fn()
    .mockResolvedValueOnce(Response.json({
      available: true, windowHours: 24, limit: 5000,
      features: [{ feature: "scout", calls: 1234, failures: 2, fallbacks: 1, p50LatencyMs: 3456 }],
    }))
    .mockResolvedValueOnce(Response.json({ error: "unauthorized" }, { status: 401 }));
  vi.stubGlobal("fetch", fetcher);
  const formatter = vi.spyOn(Intl, "NumberFormat");
  await act(async () => root.render(h(LanguageProvider, { children: h(AIUsagePanel) })));
  expect(container.querySelector("h2")?.textContent).toBe(copy.title);
  expect(container.querySelector("label")?.textContent?.trim()).toBe(copy.token);
  expect(container.querySelector("button")?.textContent).toBe(copy.refresh);

  // Submit directly to test translated responses without handling a real credential.
  const submit = () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  await act(async () => { submit(); });
  expect(container.querySelector("caption")?.textContent).toBe(copy.caption);
  expect([...container.querySelectorAll("thead th")].map(cell => cell.textContent)).toEqual(copy.headers);
  expect(container.textContent).toContain(copy.caveat);
  expect(formatter).toHaveBeenCalledWith(LANGUAGE_LOCALES[copy.language]);
  const number = new Intl.NumberFormat(LANGUAGE_LOCALES[copy.language]);
  expect([...container.querySelectorAll("tbody th, tbody td")].map(cell => cell.textContent)).toEqual([
    "scout", number.format(1234), "2", "1", number.format(3456),
  ]);
  expect(container.textContent).toContain(number.format(5000));

  await act(async () => { submit(); });
  expect(container.querySelector("table")).toBeNull();
  expect(container.querySelector('[role="alert"]')?.textContent).toBe(copy.auth);
});
