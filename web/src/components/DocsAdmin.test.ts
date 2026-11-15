// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { DocsAdmin } from "./DocsAdmin";

let root: Root | undefined;
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined;
  document.body.replaceChildren();
  sessionStorage.clear();
  localStorage.clear();
  vi.unstubAllGlobals();
});

it("shows exact plain chunks, warns without preselecting, submits only checked exclusions and resets them for a new version", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  sessionStorage.setItem("soilsense:docs-admin-token", "fixture-token");
  let sha = "version-one";
  let status = "pending_review";
  const doc = () => ({ doc_id: "doc-fixture", r2_key: "docs/fixture.pdf", latest_sha256: sha, title: null, status, updated_at: "2026-11-15T14:00:00Z" });
  const chunks = [
    { chunk_id: "doc-fixture:good", text: "Trial results\n\nCorn · Tribune", start_offset: 0, end_offset: 29, status: "pending" },
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
  await act(async () => button("Refresh documents").click());
  await act(async () => button("docs/fixture.pdf").click());
  const boxes = () => Array.from(container.querySelectorAll<HTMLInputElement>('input[name="excludeChunkIds"]'));
  expect(boxes()).toHaveLength(2);
  expect(boxes().every((box) => !box.checked)).toBe(true);
  expect(container.querySelectorAll(".docs-warning")).toHaveLength(1);
  expect(container.querySelector("pre")?.textContent).toBe(chunks[0]!.text);
  expect(container.textContent).toContain("Offsets [31, 79)");
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
  expect(container.textContent).toContain("Approval submitted");
});

it("prefills URL provenance for a person to confirm and reads Spanish from the shared preference", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.setItem("soilsense.language", "es");
  sessionStorage.setItem("soilsense:docs-admin-token", "fixture-token");
  const doc = { doc_id: "doc-url", r2_key: "docs/url-research.txt", title: null, status: "pending_review", updated_at: "2026-11-15" };
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => String(input).endsWith("/doc-url")
    ? Response.json({ doc, versions: [], chunks: [], provenance: { sourceUrl: "https://www.ksu.edu/research", retrievedAt: "2026-11-15T12:00:00Z", intakeMethod: "html-fetch-fallback" } })
    : Response.json({ docs: [doc] })));
  const container = document.createElement("div"); document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(createElement(DocsAdmin)));
  expect(container.textContent).toContain("Añadir un documento de investigación por URL");
  expect(container.textContent).toContain("Añadir documento desde URL");
  const button = (text: string) => Array.from(container.querySelectorAll("button")).find((b) => b.textContent === text)!;
  await act(async () => button("Refresh documents").click());
  await act(async () => button("docs/url-research.txt").click());
  expect(container.querySelector<HTMLInputElement>('input[name="url"]')?.value).toBe("https://www.ksu.edu/research");
  expect(container.querySelector<HTMLInputElement>('input[name="title"]')?.value).toBe("");
  expect(container.textContent).toContain("Fuente recuperada (confirmar antes de aprobar)");
});
