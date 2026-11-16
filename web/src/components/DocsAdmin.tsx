import { useRef, useState, type FormEvent } from "react";
import { ACCEPTED_EXTENSIONS, likelyGarbledChunk, type ReviewDecision } from "../../../src/shared/ingest";
import { RESEARCH_TAGS } from "../../../src/worker/research/config";
import { addDocFromUrl, fetchDoc, fetchDocs, reviewDoc, uploadDoc, type AdminDocDetail, type AdminDocument } from "../api";
import { LanguageProvider, useI18n } from "../i18n";
import { pageCropText, pageErrorText, pageStatusText, pageTranslate } from "../i18n-pages";
import { detectLang } from "../lang";
import "./DocsAdmin.css";

const TOKEN_KEY = "soilsense:docs-admin-token";
function storedToken(): string {
  try { return sessionStorage.getItem(TOKEN_KEY) ?? ""; } catch { return ""; }
}
const sourceFields = ["title", "url", "publisher", "year", "license", "attribution", "applicability"] as const;
const sourceLabels = { title: "Title", url: "Source URL", publisher: "Publisher", year: "Year", license: "License", attribution: "Attribution", applicability: "Applicability" };

/** Hidden operator tool. The server, not this route, enforces ADMIN_TOKEN. */
export function DocsAdmin() {
  return <LanguageProvider><DocsAdminContent /></LanguageProvider>;
}

function DocsAdminContent() {
  const { language } = useI18n();
  const t = (key: string, values?: Record<string, string | number>) => pageTranslate(language, key, values);
  const [researchUrl, setResearchUrl] = useState("");
  const [token, setToken] = useState(storedToken);
  const [docs, setDocs] = useState<AdminDocument[]>([]);
  const [detail, setDetail] = useState<AdminDocDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  function changeToken(value: string) {
    setToken(value);
    setDocs([]);
    setDetail(null);
    setError("");
    setMessage("");
    try { if (value) sessionStorage.setItem(TOKEN_KEY, value); else sessionStorage.removeItem(TOKEN_KEY); }
    catch { setError("Session storage is unavailable; the token will only stay in memory."); }
  }
  async function run(action: () => Promise<void>) {
    setBusy(true); setError(""); setMessage("");
    try { await action(); } catch (err) { setError(err instanceof Error ? err.message : "Request failed"); }
    finally { setBusy(false); }
  }
  async function refresh() { setDocs((await fetchDocs(token)).docs); }
  async function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detail) return;
    const data = new FormData(event.currentTarget);
    const decision: ReviewDecision = { decision: "approve", reviewer: String(data.get("reviewer") ?? "").trim(), note: String(data.get("note") ?? "").trim() };
    // Reject is deliberately a separate button, so source fields are not required to reject.
    const source = Object.fromEntries(sourceFields.map((key) => [key, key === "year" ? Number(data.get(key)) : String(data.get(key) ?? "").trim()]));
    decision.source = source as NonNullable<ReviewDecision["source"]>;
    decision.crops = data.getAll("crops").map(String);
    decision.excludeChunkIds = data.getAll("excludeChunkIds").map(String);
    if (!decision.crops.length) { setError("Choose at least one crop tag before approving."); return; }
    const docId = detail.doc.docId;
    await run(async () => {
      await reviewDoc(docId, decision, token);
      setDetail(await fetchDoc(docId, token)); await refresh();
      setMessage("Approval submitted. The document is searchable only after its status becomes indexed. Refresh to check.");
    });
  }
  async function reject(form: HTMLFormElement) {
    if (!detail) return;
    const data = new FormData(form);
    const reviewer = String(data.get("reviewer") ?? "").trim();
    if (!reviewer) { setError("Enter a reviewer name before rejecting."); return; }
    const docId = detail.doc.docId;
    await run(async () => {
      await reviewDoc(docId, { decision: "reject", reviewer, note: String(data.get("note") ?? "").trim() }, token);
      setDetail(await fetchDoc(docId, token)); await refresh(); setMessage("Rejection submitted; current status read back below.");
    });
  }
  return <main className="docs-admin" lang={language}>
    <a href="#/">{t("← Back to planner")}</a>
    <h1>{t("Document review")}</h1>
    <p>{t("Upload research, inspect exact chunks, then supply source metadata yourself. Nothing is searchable until reviewed and indexed.")}</p>
    <label>{t("Admin token")}<input type="password" autoComplete="off" value={token} disabled={busy} onChange={(event) => changeToken(event.target.value)} /></label>
    <p>{t("Stored only in this tab’s session storage. Clear it when finished.")}</p>
    <div className="docs-actions">
      <button type="button" disabled={busy || !token} onClick={() => void run(refresh)}>{t("Refresh documents")}</button>
      <button type="button" disabled={busy} onClick={() => changeToken("")}>{t("Clear token")}</button>
    </div>
    <p role="status" aria-live="polite">{t(busy ? "Working…" : message)}</p>
    {error && <div role="alert" className="error">
      <p>{pageErrorText(language, error)}</p>
      {pageErrorText("en", error) === "Request failed" && error !== "Request failed" && <details>
        <summary>{t("Technical details")}</summary><pre lang={detectLang(error) ?? "en"}>{error}</pre>
      </details>}
    </div>}
    <form onSubmit={(event) => { event.preventDefault(); if (!file) return; void run(async () => {
      await uploadDoc(file, token); await refresh();
      setFile(null); if (fileInput.current) fileInput.current.value = "";
      setMessage("Upload accepted. Ingestion runs asynchronously; refresh to check its status.");
    }); }}>
      <h2>{t("Upload")}</h2>
      <label>{t("Research document")}<input ref={fileInput} type="file" accept={ACCEPTED_EXTENSIONS.join(",")} required disabled={busy} onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label>
      <button disabled={busy || !token || !file}>{t("Upload document")}</button>
    </form>
    <form onSubmit={(event) => { event.preventDefault(); void run(async () => {
      const result = await addDocFromUrl(researchUrl, token);
      await refresh(); setResearchUrl("");
      setMessage(result.method === "html-fetch-fallback" ? "URL accepted using plain HTML fallback (Browser Rendering unavailable). Refresh to check review status." : "URL accepted. Refresh to check review status.");
    }); }}>
      <h2>{t("Add a research document by URL")}</h2>
      <p>{t("Only approved research hosts over HTTPS, up to 10 MiB. Source metadata still requires human confirmation.")}</p>
      <label>{t("Research document URL")}<input type="url" required maxLength={2000} value={researchUrl} disabled={busy} onChange={(event) => setResearchUrl(event.target.value)} /></label>
      <button disabled={busy || !token || !researchUrl}>{t("Add document from URL")}</button>
    </form>
    <section aria-labelledby="docs-list-heading">
      <h2 id="docs-list-heading">{t("Documents")}</h2>
      {!docs.length && <p>{t("No documents loaded. Enter a token and refresh.")}</p>}
      <ul>{docs.map((doc) => <li key={doc.docId}>
        <button type="button" disabled={busy} aria-pressed={detail?.doc.docId === doc.docId} onClick={() => void run(async () => setDetail(await fetchDoc(doc.docId, token)))}><span lang={detectLang(doc.title ?? "") ?? "en"}>{doc.title || doc.r2Key}</span></button>
        <p>{pageStatusText(language, doc.status)} · {t("Updated {date}", { date: doc.updatedAt })}</p>
        <p>{t("Chunks: {counts}", { counts: doc.chunkCounts ? Object.entries(doc.chunkCounts).map(([status, count]) => `${pageStatusText(language, status)}: ${count}`).join(", ") || t("none") : t("open document to inspect") })}</p>
      </li>)}</ul>
    </section>
    {detail && <section aria-labelledby="review-heading" key={detail.doc.docId}>
      <h2 id="review-heading">{t("Review {document}", { document: "" })}<span lang={detectLang(detail.doc.title ?? "") ?? "en"}>{detail.doc.title || detail.doc.r2Key}</span></h2>
      <p>{t("Status: {status}", { status: pageStatusText(language, detail.doc.status) })}</p>
      {detail.provenance && <p>{t("Retrieved source (confirm before approving)")}: {detail.provenance.sourceUrl} · {detail.provenance.retrievedAt} · {pageStatusText(language, detail.provenance.intakeMethod ?? "")}</p>}
      <details open><summary>{t("Extracted chunks ({count})", { count: detail.chunks.length })}</summary>
        <p>{t("Exclude publisher boilerplate, citation blocks or unreadable text from search. All chunks start included; warnings never change selections or source text.")}</p>
        {detail.chunks.map((chunk) => <article key={`${detail.doc.docId}:${detail.doc.latestSha256 ?? detail.versions[0]?.sha256}:${chunk.chunkId}`}>
          <h3>{chunk.chunkId}</h3><p>{t("Offsets [{start}, {end}) · {status}", { start: chunk.start, end: chunk.end, status: pageStatusText(language, chunk.status) })}</p>
          {likelyGarbledChunk(chunk.text) && <p className="docs-warning"><strong>{t("Warning: possibly garbled text")}</strong> — {t("long mixed-case words may have missing spaces. Inspect against the original; this heuristic can be wrong.")}</p>}
          <pre lang={detectLang(chunk.text) ?? "en"}>{chunk.text}</pre>
          <label className="docs-checkbox"><input type="checkbox" name="excludeChunkIds" value={chunk.chunkId} form="docs-review-form" defaultChecked={false} disabled={busy || !token || detail.doc.status !== "pending_review"} />{t("Exclude from search")}</label>
        </article>)}
      </details>
      <form id="docs-review-form" onSubmit={(event) => void review(event)}>
        <fieldset disabled={busy || !token}>
          <legend>{t("Human review decision")}</legend>
          <label>{t("Reviewer")}<input name="reviewer" required maxLength={200} /></label>
          {sourceFields.map((field) => <label key={field}>{t(sourceLabels[field])}
            <input name={field} defaultValue={field === "url" ? detail.provenance?.sourceUrl ?? "" : ""} type={field === "year" ? "number" : field === "url" ? "url" : "text"} required maxLength={field === "year" ? undefined : 4000} min={field === "year" ? 1000 : undefined} max={field === "year" ? 9999 : undefined} step={field === "year" ? 1 : undefined} />
          </label>)}
          <fieldset><legend>{t("Crop tags (at least one to approve)")}</legend>
            {RESEARCH_TAGS.map((tag) => <label className="docs-checkbox" key={tag}><input type="checkbox" name="crops" value={tag} />{pageCropText(language, tag)}</label>)}
          </fieldset>
          <label>{t("Review note (optional)")}<textarea name="note" rows={3} maxLength={4000} /></label>
          <div className="docs-actions">
            <button type="submit" disabled={!detail.chunks.length || detail.doc.status !== "pending_review"}>{t("Approve and index")}</button>
            <button type="button" disabled={detail.doc.status !== "pending_review"} onClick={(event) => { if (event.currentTarget.form) void reject(event.currentTarget.form); }}>{t("Reject document")}</button>
          </div>
          {detail.doc.status !== "pending_review" && <p>{t("Decisions are available when the workflow is pending review.")}</p>}
        </fieldset>
      </form>
    </section>}
  </main>;
}
