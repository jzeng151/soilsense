import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchDoc, fetchDocs, reviewDoc, uploadDoc } from "./api";

afterEach(() => vi.unstubAllGlobals());
describe("typed document admin client", () => {
  it("normalizes the pipeline's D1 rows without inventing unavailable chunk counts", async () => {
    const doc = { doc_id: "doc-1", r2_key: "docs/trial.txt", status: "pending_review", title: null, updated_at: "2026-11-15T12:00:00Z" };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json({ docs: [doc] })).mockResolvedValueOnce(Response.json({ doc, versions: [], chunks: [
      { chunk_id: "doc-1:chunk", start_offset: 10, end_offset: 17, text: "excerpt", status: "pending" },
    ] })));
    expect((await fetchDocs("operator-token")).docs).toEqual([{ docId: "doc-1", r2Key: "docs/trial.txt", status: "pending_review", title: null, updatedAt: "2026-11-15T12:00:00Z" }]);
    expect((await fetchDoc("doc-1", "operator-token")).chunks).toEqual([{ chunkId: "doc-1:chunk", start: 10, end: 17, text: "excerpt", status: "pending" }]);
  });
  it("lists and reads documents with explicit bearer auth and escaped IDs", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(Response.json({ docs: [] })).mockResolvedValueOnce(Response.json({ doc: { docId: "doc/a" }, versions: [], chunks: [] }));
    vi.stubGlobal("fetch", fetch);
    expect(await fetchDocs("operator-token")).toEqual({ docs: [] });
    expect((await fetchDoc("doc/a", "operator-token")).chunks).toEqual([]);
    expect(fetch.mock.calls).toEqual([
      ["/api/docs", { headers: { Authorization: "Bearer operator-token" } }],
      ["/api/docs/doc%2Fa", { headers: { Authorization: "Bearer operator-token" } }],
    ]);
  });
  it("posts a review decision without inventing source metadata", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetch);
    const decision = { decision: "reject" as const, reviewer: "Reviewer", note: "Not applicable" };
    await reviewDoc("doc/a", decision, "operator-token");
    expect(fetch).toHaveBeenCalledWith("/api/docs/doc%2Fa/review", {
      method: "POST", headers: { Authorization: "Bearer operator-token", "Content-Type": "application/json" }, body: JSON.stringify(decision),
    });
  });
  it("uploads the file as multipart without overriding the browser boundary", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetch);
    const file = new File(["trial text"], "trial.txt", { type: "text/plain" });
    await uploadDoc(file, "operator-token");
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe("/api/docs/upload");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ Authorization: "Bearer operator-token" });
    expect(init.body.get("file")).toBe(file);
  });
  it("surfaces API errors rather than claiming upload success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: "unsupported extension" }, { status: 400 })));
    await expect(uploadDoc(new File(["x"], "trial.exe"), "operator-token")).rejects.toThrow("unsupported extension");
  });
});
