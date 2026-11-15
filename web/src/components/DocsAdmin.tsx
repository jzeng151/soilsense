import { useRef, useState, type FormEvent } from "react";
import { ACCEPTED_EXTENSIONS, likelyGarbledChunk, type ReviewDecision } from "../../../src/shared/ingest";
import { RESEARCH_TAGS } from "../../../src/worker/research/config";
import { fetchDoc, fetchDocs, reviewDoc, uploadDoc, type AdminDocDetail, type AdminDocument } from "../api";
import "./DocsAdmin.css";

const TOKEN_KEY = "soilsense:docs-admin-token";
function storedToken(): string {
  try { return sessionStorage.getItem(TOKEN_KEY) ?? ""; } catch { return ""; }
}
const sourceFields = ["title", "url", "publisher", "year", "license", "attribution", "applicability"] as const;

/** Hidden operator tool. The server, not this route, enforces ADMIN_TOKEN. */
export function DocsAdmin() {
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
  return <main className="docs-admin">
    <a href="#/">← Back to planner</a>
    <h1>Document review</h1>
    <p>Upload research, inspect exact chunks, then supply source metadata yourself. Nothing is searchable until reviewed and indexed.</p>
    <label>Admin token<input type="password" autoComplete="off" value={token} disabled={busy} onChange={(event) => changeToken(event.target.value)} /></label>
    <p>Stored only in this tab’s session storage. Clear it when finished.</p>
    <div className="docs-actions">
      <button type="button" disabled={busy || !token} onClick={() => void run(refresh)}>Refresh documents</button>
      <button type="button" disabled={busy} onClick={() => changeToken("")}>Clear token</button>
    </div>
    <p role="status" aria-live="polite">{busy ? "Working…" : message}</p>
    {error && <p role="alert" className="error">{error}</p>}
    <form onSubmit={(event) => { event.preventDefault(); if (!file) return; void run(async () => {
      await uploadDoc(file, token); await refresh();
      setFile(null); if (fileInput.current) fileInput.current.value = "";
      setMessage("Upload accepted. Ingestion runs asynchronously; refresh to check its status.");
    }); }}>
      <h2>Upload</h2>
      <label>Research document<input ref={fileInput} type="file" accept={ACCEPTED_EXTENSIONS.join(",")} required disabled={busy} onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label>
      <button disabled={busy || !token || !file}>Upload document</button>
    </form>
    <section aria-labelledby="docs-list-heading">
      <h2 id="docs-list-heading">Documents</h2>
      {!docs.length && <p>No documents loaded. Enter a token and refresh.</p>}
      <ul>{docs.map((doc) => <li key={doc.docId}>
        <button type="button" disabled={busy} aria-pressed={detail?.doc.docId === doc.docId} onClick={() => void run(async () => setDetail(await fetchDoc(doc.docId, token)))}>{doc.title || doc.r2Key}</button>
        <p>{doc.status} · Updated {doc.updatedAt}</p>
        <p>Chunks: {doc.chunkCounts ? Object.entries(doc.chunkCounts).map(([status, count]) => `${status}: ${count}`).join(", ") || "none" : "open document to inspect"}</p>
      </li>)}</ul>
    </section>
    {detail && <section aria-labelledby="review-heading" key={detail.doc.docId}>
      <h2 id="review-heading">Review {detail.doc.title || detail.doc.r2Key}</h2>
      <p>Status: {detail.doc.status}</p>
      <details open><summary>Extracted chunks ({detail.chunks.length})</summary>
        <p>Exclude publisher boilerplate, citation blocks or unreadable text from search. All chunks start included; warnings never change selections or source text.</p>
        {detail.chunks.map((chunk) => <article key={`${detail.doc.docId}:${detail.doc.latestSha256 ?? detail.versions[0]?.sha256}:${chunk.chunkId}`}>
          <h3>{chunk.chunkId}</h3><p>Offsets [{chunk.start}, {chunk.end}) · {chunk.status}</p>
          {likelyGarbledChunk(chunk.text) && <p className="docs-warning"><strong>Warning: possibly garbled text</strong> — long mixed-case words may have missing spaces. Inspect against the original; this heuristic can be wrong.</p>}
          <pre>{chunk.text}</pre>
          <label className="docs-checkbox"><input type="checkbox" name="excludeChunkIds" value={chunk.chunkId} form="docs-review-form" defaultChecked={false} disabled={busy || !token || detail.doc.status !== "pending_review"} />Exclude from search</label>
        </article>)}
      </details>
      <form id="docs-review-form" onSubmit={(event) => void review(event)}>
        <fieldset disabled={busy || !token}>
          <legend>Human review decision</legend>
          <label>Reviewer<input name="reviewer" required maxLength={200} /></label>
          {sourceFields.map((field) => <label key={field}>{field === "url" ? "Source URL" : field[0]!.toUpperCase() + field.slice(1)}
            <input name={field} type={field === "year" ? "number" : field === "url" ? "url" : "text"} required maxLength={field === "year" ? undefined : 4000} min={field === "year" ? 1000 : undefined} max={field === "year" ? 9999 : undefined} step={field === "year" ? 1 : undefined} />
          </label>)}
          <fieldset><legend>Crop tags (at least one to approve)</legend>
            {RESEARCH_TAGS.map((tag) => <label className="docs-checkbox" key={tag}><input type="checkbox" name="crops" value={tag} />{tag.replaceAll("_", " ")}</label>)}
          </fieldset>
          <label>Review note (optional)<textarea name="note" rows={3} maxLength={4000} /></label>
          <div className="docs-actions">
            <button type="submit" disabled={!detail.chunks.length || detail.doc.status !== "pending_review"}>Approve and index</button>
            <button type="button" disabled={detail.doc.status !== "pending_review"} onClick={(event) => { if (event.currentTarget.form) void reject(event.currentTarget.form); }}>Reject document</button>
          </div>
          {detail.doc.status !== "pending_review" && <p>Decisions are available when the workflow is pending review.</p>}
        </fieldset>
      </form>
    </section>}
  </main>;
}
