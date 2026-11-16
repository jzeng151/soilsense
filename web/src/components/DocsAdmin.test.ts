// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { DocsAdmin } from "./DocsAdmin";
import { LanguageProvider, useI18n } from "../i18n";

let root: Root | undefined;
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined;
  document.body.replaceChildren();
  sessionStorage.clear();
  localStorage.clear();
  vi.unstubAllGlobals();
});

it.each(["en", "es", "ko"] as const)("reviews exact chunks in %s without changing source text or submitted crop/exclusion IDs", async (language) => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.setItem("soilsense.language", language);
  sessionStorage.setItem("soilsense:docs-admin-token", "fixture-token");
  let sha = "version-one";
  let status = "pending_review";
  const doc = () => ({ doc_id: "doc-fixture", r2_key: "docs/fixture.pdf", latest_sha256: sha, title: null, status, updated_at: "2026-11-15T14:00:00Z" });
  const chunks = [
    { chunk_id: "doc-fixture:good", text: "Trial results\n\nThe researchers compared corn harvests and crop rotations in the field over several years.", start_offset: 0, end_offset: 103, status: "pending" },
    { chunk_id: "doc-fixture:warn", text: "KansasAgricultural NewPrairie\nInspect this text.", start_offset: 31, end_offset: 79, status: "pending" },
  ];
  let submitted: Record<string, unknown> | undefined;
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    if (init?.method === "POST") {
      expect(new Headers(init.headers).get("Authorization")).toBe("Bearer fixture-token");
      submitted = JSON.parse(String(init.body)) as Record<string, unknown>;
      status = "indexed";
      return Response.json({ ok: true }, { status: 202 });
    }
    if (path.endsWith("/doc-fixture")) return Response.json({ doc: doc(), versions: [{ sha256: "old-version" }], chunks });
    return Response.json({ docs: [doc()] });
  });
  vi.stubGlobal("fetch", fetch);
  const container = document.createElement("div"); document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(createElement(DocsAdmin)));
  const button = (label: string) => Array.from(container.querySelectorAll("button")).find((b) => b.textContent === label)!;
  await act(async () => button({ en: "Refresh documents", es: "Actualizar documentos", ko: "문서 새로고침" }[language]).click());
  await act(async () => button("docs/fixture.pdf").click());
  const boxes = () => Array.from(container.querySelectorAll<HTMLInputElement>('input[name="excludeChunkIds"]'));
  expect(boxes()).toHaveLength(2);
  expect(boxes().every((box) => !box.checked)).toBe(true);
  expect(container.querySelectorAll(".docs-warning")).toHaveLength(1);
  expect(container.querySelector("pre")?.textContent).toBe(chunks[0]!.text);
  expect(container.querySelector("pre")?.lang).toBe("en");
  expect(container.querySelector("h1")?.textContent).toBe({ en: "Document review", es: "Revisión de documentos", ko: "문서 검토" }[language]);
  expect(container.textContent).toContain({ en: "Offsets [31, 79)", es: "Posiciones [31, 79)", ko: "문자 위치 [31, 79)" }[language]);
  expect(container.textContent).toContain({ en: "Pending review", es: "Pendiente de revisión", ko: "검토 대기" }[language]);
  expect(container.querySelector<HTMLInputElement>('input[name="crops"][value="soybean"]')?.parentElement?.textContent).toBe({ en: "Soybean", es: "Soja", ko: "대두" }[language]);
  expect(container.querySelector<HTMLInputElement>('input[name="crops"][value="winter_wheat"]')?.parentElement?.textContent).toBe({ en: "Winter wheat", es: "Trigo de invierno", ko: "겨울밀" }[language]);
  expect(container.querySelector<HTMLInputElement>('input[name="crops"][value="cover"]')?.parentElement?.textContent).toBe({ en: "Cover crops", es: "Cultivos de cobertura", ko: "피복작물" }[language]);
  for (const name of ["title", "url", "publisher", "year", "license", "attribution", "applicability"]) {
    expect(container.querySelector<HTMLInputElement>(`input[name="${name}"]`)?.required).toBe(true);
  }
  await act(async () => container.querySelector("#docs-review-form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  expect(container.querySelector('[role="alert"]')?.textContent).toContain({ en: "Choose at least one crop tag before approving.", es: "Elige al menos una etiqueta de cultivo antes de aprobar.", ko: "승인하기 전에 작물 태그를 하나 이상 선택하세요." }[language]);
  await act(async () => button({ en: "Reject document", es: "Rechazar documento", ko: "문서 반려" }[language]).click());
  expect(container.querySelector('[role="alert"]')?.textContent).toContain({ en: "Enter a reviewer name before rejecting.", es: "Introduce el nombre del revisor antes de rechazar.", ko: "반려하기 전에 검토자 이름을 입력하세요." }[language]);
  expect(submitted).toBeUndefined();
  await act(async () => boxes()[1]!.click());
  expect(new FormData(container.querySelector<HTMLFormElement>("#docs-review-form")!).getAll("excludeChunkIds")).toEqual(["doc-fixture:warn"]);

  // The same content-addressed ids in a later version must start unchecked again.
  sha = "version-two";
  await act(async () => button("docs/fixture.pdf").click());
  expect(boxes().every((box) => !box.checked)).toBe(true);
  await act(async () => boxes()[1]!.click());
  const fields = { reviewer: "Fixture reviewer", title: "Fixture title", url: "https://example.org/fixture", publisher: "Fixture publisher", year: "2021", license: "Fixture license", attribution: "Fixture author", applicability: "Constructed UI fixture, not evidence" };
  for (const [name, value] of Object.entries(fields)) container.querySelector<HTMLInputElement>(`input[name="${name}"]`)!.value = value;
  await act(async () => container.querySelector<HTMLInputElement>('input[name="crops"][value="corn"]')!.click());
  await act(async () => container.querySelector("#docs-review-form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  expect(submitted).toMatchObject({ decision: "approve", reviewer: "Fixture reviewer", crops: ["corn"], excludeChunkIds: ["doc-fixture:warn"] });
  expect(boxes().every((box) => box.disabled)).toBe(true);
  expect(container.textContent).toContain({ en: "Approval submitted", es: "Aprobación enviada", ko: "승인 결정을 제출했습니다" }[language]);
  expect(container.textContent).toContain({ en: "Indexed", es: "Indexado", ko: "색인 완료" }[language]);
  expect(button({ en: "Approve and index", es: "Aprobar e indexar", ko: "승인 및 색인" }[language]).disabled).toBe(true);
});

it.each(["es", "ko"] as const)("prefills URL provenance for human confirmation in %s", async (language) => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.setItem("soilsense.language", language);
  sessionStorage.setItem("soilsense:docs-admin-token", "fixture-token");
  const doc = { doc_id: "doc-url", r2_key: "docs/url-research.txt", title: null, status: "pending_review", updated_at: "2026-11-15" };
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => String(input).endsWith("/doc-url")
    ? Response.json({ doc, versions: [], chunks: [], provenance: { sourceUrl: "https://www.ksu.edu/research", retrievedAt: "2026-11-15T12:00:00Z", intakeMethod: "html-fetch-fallback" } })
    : Response.json({ docs: [doc] })));
  const container = document.createElement("div"); document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(createElement(DocsAdmin)));
  expect(container.textContent).toContain({ es: "Añadir un documento de investigación por URL", ko: "URL로 연구 문서 추가" }[language]);
  expect(container.textContent).toContain({ es: "Añadir documento desde URL", ko: "URL에서 문서 추가" }[language]);
  const button = (text: string) => Array.from(container.querySelectorAll("button")).find((b) => b.textContent === text)!;
  await act(async () => button({ es: "Actualizar documentos", ko: "문서 새로고침" }[language]).click());
  await act(async () => button("docs/url-research.txt").click());
  expect(container.querySelector<HTMLInputElement>('input[name="url"]')?.value).toBe("https://www.ksu.edu/research");
  expect(container.querySelector<HTMLInputElement>('input[name="title"]')?.value).toBe("");
  expect(container.textContent).toContain({ es: "Fuente recuperada (confirmar antes de aprobar)", ko: "가져온 출처(승인 전 확인 필요)" }[language]);
  expect(container.textContent).toContain({ es: "Extracción HTML básica", ko: "기본 HTML 대체 추출" }[language]);
});

function LanguageControl() {
  const { setLanguage } = useI18n();
  return createElement("button", { onClick: () => setLanguage("ko") }, "switch-to-ko");
}

it.each(["en", "es", "ko"] as const)("translates busy/API errors in %s, preserves unexpected diagnostics and reacts to the shared language", async language => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.setItem("soilsense.language", language);
  sessionStorage.setItem("soilsense:docs-admin-token", "fixture-token");
  let finish!: (response: Response) => void;
  const pending = new Promise<Response>(resolve => { finish = resolve; });
  const fetch = vi.fn().mockReturnValueOnce(pending).mockResolvedValue(Response.json({ error: "Unexpected upstream diagnostic: fixture failure" }, { status: 502 }));
  vi.stubGlobal("fetch", fetch);
  const container = document.createElement("div"); document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(createElement(LanguageProvider, { children: createElement("div", null,
    createElement(LanguageControl), createElement(DocsAdmin)) })));
  const button = (label: string) => [...container.querySelectorAll("button")].find(node => node.textContent === label)!;
  const refresh = button({ en: "Refresh documents", es: "Actualizar documentos", ko: "문서 새로고침" }[language]);
  act(() => refresh.click());
  expect(container.querySelector('[role="status"]')?.textContent).toBe({ en: "Working…", es: "Procesando…", ko: "처리 중…" }[language]);
  expect(refresh.disabled).toBe(true);
  await act(async () => finish(Response.json({ error: "unauthorized" }, { status: 401 })));
  expect(container.querySelector('[role="alert"]')?.textContent).toContain({ en: "unauthorized", es: "No autorizado", ko: "인증되지 않음" }[language]);
  expect(container.querySelector('[role="alert"] details')).toBeNull();
  await act(async () => button("switch-to-ko").click());
  expect(container.querySelector("h1")?.textContent).toBe("문서 검토");
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("인증되지 않음");
  expect(container.querySelector<HTMLInputElement>('input[type="password"]')?.value).toBe("fixture-token");
  await act(async () => button("문서 새로고침").click());
  expect(container.querySelector('[role="alert"] > p')?.textContent).toBe("요청 실패");
  expect(container.querySelector('[role="alert"] summary')?.textContent).toBe("기술 세부 정보");
  expect(container.querySelector('[role="alert"] pre')?.textContent).toBe("Unexpected upstream diagnostic: fixture failure");
  expect(container.querySelector('[role="alert"] pre')?.getAttribute("lang")).toBe("en");
  await act(async () => button("토큰 지우기").click());
  expect(sessionStorage.getItem("soilsense:docs-admin-token")).toBeNull();
  expect(container.querySelector('[role="alert"]')).toBeNull();
});
