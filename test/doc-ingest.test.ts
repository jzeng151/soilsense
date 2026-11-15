import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";
import app from "../src/worker/index";
import type { Env } from "../src/worker/env";
import { runDocIngest, type DocStepRunner } from "../src/worker/ingest/workflow";
import { getChunks, getDoc } from "../src/worker/ingest/store";
import { DOCS_LAYOUT, REVIEW_EVENT, REVIEW_TIMEOUT, type ReviewDecision, type DocIngestParams } from "../src/shared/ingest";

vi.mock("../src/worker/ingest/url-https", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/worker/ingest/url-https")>();
  return { ...actual, pinnedHttps: (url: URL) => fetch(url.href) };
});

const ctx = { waitUntil() {}, passThroughOnException() {}, props: {} } as unknown as ExecutionContext;
const approval: ReviewDecision = { decision: "approve", reviewer: "test reviewer", crops: ["corn", "cover"], source: { title: "Reviewer supplied title", url: "https://example.org/paper", publisher: "Test publisher", year: 2026, license: "CC BY 4.0", attribution: "Test author", applicability: "Test fixture, not agronomic evidence" } };
const firstParagraph = "Cover crops protect soil during winter and improve water infiltration. ".repeat(19).trim();
const secondParagraph = "Crop rotations can reduce pest pressure compared with continuous cropping. ".repeat(19).trim();
const thirdParagraph = "Soil texture and local rainfall determine which management practices are applicable. ".repeat(17).trim();

function fakeD1(): D1Database {
  const db = new DatabaseSync(":memory:");
  for (const f of readdirSync("migrations").sort()) db.exec(readFileSync(`migrations/${f}`, "utf8"));
  const statement = (sql: string, args: unknown[] = []) => ({
    sql, args, bind: (...values: unknown[]) => statement(sql, values),
    first: async () => db.prepare(sql).get(...args as never[]) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args as never[]) }),
    run: async () => ({ success: true, meta: db.prepare(sql).run(...args as never[]) }),
  });
  return { prepare: statement } as unknown as D1Database;
}
let harnessId = 0;
function harness() {
  const testIp = `192.0.2.${++harnessId}`;
  const DB = fakeD1();
  const objects = new Map<string, { text: string; etag: string; type: string; customMetadata?: Record<string, string> }>();
  let revision = 0;
  const DOCS = {
    put: async (key: string, body: string | ArrayBuffer, options?: { httpMetadata?: { contentType?: string }; customMetadata?: Record<string, string> }) => {
      const text = typeof body === "string" ? body : new TextDecoder().decode(body);
      const value = { text, etag: `etag-${++revision}`, type: options?.httpMetadata?.contentType ?? "text/plain", customMetadata: options?.customMetadata };
      objects.set(key, value);
      return { key, etag: value.etag };
    },
    get: async (key: string) => {
      const o = objects.get(key);
      return o ? { customMetadata: o.customMetadata, etag: o.etag, size: new TextEncoder().encode(o.text).byteLength, httpMetadata: { contentType: o.type }, text: async () => o.text, arrayBuffer: async () => new TextEncoder().encode(o.text).buffer } : null;
    },
  };
  type Vector = { id: string; values: number[]; metadata: Record<string, string> };
  const vectors = new Map<string, Vector>();
  const RESEARCH_INDEX = {
    upsert: vi.fn(async (rows: Vector[]) => { for (const v of rows) vectors.set(v.id, v); return { mutationId: "upsert" }; }),
    getByIds: async (ids: string[]) => ids.flatMap((id) => vectors.has(id) ? [vectors.get(id)!] : []),
    deleteByIds: vi.fn(async (ids: string[]) => { for (const id of ids) vectors.delete(id); return { mutationId: "delete" }; }),
  };
  const AI = { run: vi.fn(async () => ({ data: [Array(768).fill(0.25) as number[]] })), toMarkdown: vi.fn() };
  const reviewResolvers = new Map<string, (value: { payload: unknown }) => void>();
  let waiting: (() => void) | undefined;
  let params: DocIngestParams | undefined;
  let instanceId = "";
  const step = (): DocStepRunner => {
    const workflowId = instanceId;
    return {
      do: async (_name, _config, callback) => callback(),
      waitForEvent: async (name, options) => {
        expect(name).toBe("review");
        expect(options).toEqual({ type: REVIEW_EVENT, timeout: REVIEW_TIMEOUT });
        waiting?.();
        return new Promise((resolve) => { reviewResolvers.set(workflowId, resolve); });
      },
    };
  };
  const DOC_INGEST = {
    create: vi.fn(async (input: { id: string; params: DocIngestParams }) => { params = input.params; instanceId = input.id; return { id: input.id }; }),
    get: vi.fn(async (id: string) => {
      expect(reviewResolvers.has(id)).toBe(true);
      return { sendEvent: vi.fn(async (event: { type: string; payload: unknown }) => { expect(event.type).toBe(REVIEW_EVENT); reviewResolvers.get(id)?.({ payload: event.payload }); }) };
    }),
  };
  const env = { DB, DOCS, DOC_INGEST, AI, RESEARCH_INDEX, ADMIN_TOKEN: "test-token", AI_GATEWAY_ID: "test-gateway" } as unknown as Env;
  const request = (path: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    headers.set("CF-Connecting-IP", testIp); // isolate the real app's rate limiter across tests
    return app.request(`/api/docs${path}`, { ...init, headers }, env, ctx);
  };
  const auth = { Authorization: "Bearer test-token" };
  const review = (docId: string, body: unknown) => request(`/${docId}/review`, { method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  async function upload(text: string, name = "paper.txt") {
    const response = await request(`/upload?name=${encodeURIComponent(name)}`, { method: "POST", headers: { ...auth, "Content-Type": name.endsWith(".pdf") ? "application/pdf" : "text/plain" }, body: text });
    expect(response.status).toBe(202);
    const body = await response.json() as { key: string; docId: string; eTag: string };
    const ack = vi.fn(), retry = vi.fn();
    await app.queue({ messages: [{ body: { account: "test", bucket: "soilsense-docs", action: "PutObject", object: { key: body.key, eTag: body.eTag }, eventTime: "2026-11-15T12:00:00Z" }, ack, retry }] } as unknown as MessageBatch, env);
    expect(ack).toHaveBeenCalledOnce(); expect(retry).not.toHaveBeenCalled();
    return body;
  }
  async function start() {
    const pending = new Promise<void>((resolve) => { waiting = resolve; });
    const run = runDocIngest(env, step(), params!, instanceId);
    // Surface early failures rather than hanging while waiting for review.
    await Promise.race([pending, run.then(() => { throw new Error("Expected review wait"); })]);
    return { run };
  }
  return { env, DB, DOCS, AI, RESEARCH_INDEX, DOC_INGEST, objects, vectors, upload, start, review, request, auth, step, params: () => params!, instanceId: () => instanceId };
}

describe("document pipeline public seams", () => {
  it("carries URL intake provenance through the queue and pending manifest without approving metadata", async () => {
    const h = harness();
    vi.stubGlobal("fetch", vi.fn(async (url: string) => url.startsWith("https://cloudflare-dns.com/")
      ? Response.json({ Status: 0, Answer: [{ type: 1, data: "129.130.1.1" }] })
      : new Response(`<main><p>${firstParagraph}</p></main>`, { headers: { "content-type": "text/html" } })));
    try {
      const response = await h.request("/from-url", { method: "POST", headers: { ...h.auth, "Content-Type": "application/json" }, body: JSON.stringify({ url: "https://www.ksu.edu/research" }) });
      expect(response.status).toBe(202);
      const uploaded = await response.json() as { key: string; eTag: string; docId: string };
      const ack = vi.fn();
      await app.queue({ messages: [{ body: { account: "test", bucket: "soilsense-docs", action: "PutObject", object: { key: uploaded.key, eTag: uploaded.eTag }, eventTime: "2026-11-15T12:00:00Z" }, ack, retry: vi.fn() }] } as unknown as MessageBatch, h.env);
      expect(ack).toHaveBeenCalledOnce();
      const { run } = await h.start();
      const detail = await (await h.request(`/${uploaded.docId}`)).json() as { provenance: unknown; doc: { title: string | null; status: string } };
      expect(detail).toMatchObject({ provenance: { sourceUrl: "https://www.ksu.edu/research", intakeMethod: "html-fetch-fallback" }, doc: { title: null, status: "pending_review" } });
      const manifest = [...h.objects.entries()].find(([key]) => key.startsWith("manifests/"))!;
      expect(JSON.parse(manifest[1].text)).toMatchObject({ provenance: detail.provenance, source: null });
      expect(h.AI.run).not.toHaveBeenCalled(); expect(h.vectors.size).toBe(0);
      await h.review(uploaded.docId, { decision: "reject", reviewer: "test reviewer" });
      expect(await run).toMatchObject({ outcome: "rejected" });
      expect(JSON.parse(h.objects.get(manifest[0])!.text).provenance).toEqual(detail.provenance);
    } finally { vi.unstubAllGlobals(); }
  });
  it("uploads through R2 notification/queue, waits for review, then indexes exact sourced chunks", async () => {
    const h = harness();
    const uploaded = await h.upload(firstParagraph + "\n\n" + secondParagraph);
    const { run } = await h.start();
    const pending = await getDoc(h.DB, uploaded.docId);
    expect(pending?.status).toBe("pending_review");
    expect(pending?.title).toBeNull();
    expect(h.vectors.size).toBe(0); expect(h.AI.run).not.toHaveBeenCalled();
    const detail = await (await h.request(`/${uploaded.docId}`)).json() as { chunks: { text: string; start_offset: number; end_offset: number }[]; versions: unknown[] };
    expect(detail.versions).toHaveLength(1); expect(detail.chunks).toHaveLength(2);
    for (const c of detail.chunks) expect((firstParagraph + "\n\n" + secondParagraph).slice(c.start_offset,c.end_offset)).toBe(c.text);
    expect((await h.review(uploaded.docId, approval)).status).toBe(202);
    expect(await run).toMatchObject({ outcome: "indexed" });
    expect(h.vectors.size).toBe(4);
    for (const v of h.vectors.values()) {
      expect(v.id).toBe(`${v.metadata.chunk_id}#${v.metadata.crop}`);
      expect(v.metadata).toMatchObject({ corpus: "docs-v1", source_id: uploaded.docId, doc_sha256: pending!.latest_sha256 });
      expect(v.values).toHaveLength(768);
    }
    expect(h.AI.run).toHaveBeenCalledWith("@cf/baai/bge-base-en-v1.5", { text: [firstParagraph], pooling: "cls" }, expect.objectContaining({ gateway: expect.objectContaining({ id: "test-gateway", skipCache: false, cacheTtl: 86400 }) }));
    expect(await getDoc(h.DB, uploaded.docId)).toMatchObject({ status: "indexed", title: approval.source!.title, reviewer: approval.reviewer, crops_json: '["corn","cover"]' });
    expect(JSON.parse(h.objects.get(DOCS_LAYOUT.manifest(pending!.latest_sha256!, uploaded.docId))!.text)).toMatchObject({ status: "indexed", source: approval.source });
    expect((await (await h.request("")).json() as { docs: unknown[] }).docs).toHaveLength(1);

    await h.upload(firstParagraph + "\n\n" + secondParagraph);
    expect(await runDocIngest(h.env, h.step(), h.params(), h.instanceId())).toMatchObject({ outcome: "unchanged" });
    expect(h.AI.run).toHaveBeenCalledTimes(2);
  });

  it("saves plain PDF text and conversion audit, then embeds only exact plain slices", async () => {
    const h = harness();
    const preamble = "# docs/paper.pdf\n\n## Metadata\nPDFFormatVersion: 1.7\nLanguage: en\nIsLinearized: false\n\n";
    const markdown = "## Content\n\n# Limited irrigation\n\nA **bold** trial with `soil` and [source](https://example.org).\n\n- Corn treatment\n- Sorghum treatment\n\n| Crop | Site |\n| --- | --- |\n| Corn | Tribune |\n";
    const plain = "Content\n\nLimited irrigation\n\nA bold trial with soil and source.\n\nCorn treatment\nSorghum treatment\n\nCrop · Site\nCorn · Tribune\n";
    h.AI.toMarkdown.mockResolvedValue([{ format: "markdown", data: preamble + markdown }]);
    const uploaded = await h.upload("constructed PDF bytes, not a real PDF", "paper.pdf");
    const { run } = await h.start();
    const doc = (await getDoc(h.DB, uploaded.docId))!;
    const manifestKey = DOCS_LAYOUT.manifest(doc.latest_sha256!, uploaded.docId);
    const manifest = JSON.parse(h.objects.get(manifestKey)!.text);
    expect(manifest).toMatchObject({ ingestVersion: "ingest-v2", extraction: "workers-ai-tomarkdown+plain", converterPreamble: { removed: true, chars: preamble.length }, plainTextConversion: { format: "markdown-to-plain-v1", inputChars: markdown.length, outputChars: plain.length } });
    expect(h.objects.get(manifest.extractedKey)?.text).toBe(plain);
    const chunks = await getChunks(h.DB, uploaded.docId);
    expect(chunks).toHaveLength(1);
    for (const c of chunks) expect(plain.slice(c.start_offset, c.end_offset)).toBe(c.text);
    await h.review(uploaded.docId, approval);
    expect(await run).toMatchObject({ outcome: "indexed" });
    expect(h.AI.run).toHaveBeenCalledWith("@cf/baai/bge-base-en-v1.5", { text: [plain.trim().replace(/\s+/g, " ")], pooling: "cls" }, expect.objectContaining({ gateway: expect.objectContaining({ id: "test-gateway", skipCache: false, cacheTtl: 86400 }) }));
  });

  it("isolates identical uploads under different keys while the older review is still pending", async () => {
    const h = harness();
    const old = await h.upload(firstParagraph, "old.txt");
    const oldRun = await h.start();
    const oldDoc = (await getDoc(h.DB, old.docId))!;
    const oldKey = DOCS_LAYOUT.manifest(oldDoc.latest_sha256!, old.docId);
    // Existing ingest-v1 workflows retain their legacy artifacts on deployment.
    h.objects.set(DOCS_LAYOUT.manifest(oldDoc.latest_sha256!), h.objects.get(oldKey)!);
    h.objects.delete(oldKey);
    const next = await h.upload(firstParagraph, "new.txt");
    const nextRun = await h.start();
    const nextDoc = (await getDoc(h.DB, next.docId))!;
    const nextKey = DOCS_LAYOUT.manifest(nextDoc.latest_sha256!, next.docId);
    const nextManifest = h.objects.get(nextKey)!.text;
    expect((await h.request(`/${old.docId}`)).status).toBe(200); // legacy read fallback
    const nextChunks = await getChunks(h.DB, next.docId);
    expect((await h.review(old.docId, { ...approval, excludeChunkIds: [nextChunks[0]!.chunk_id] })).status).toBe(400);
    await h.review(old.docId, { decision: "reject", reviewer: "reviewer" });
    expect(await oldRun.run).toMatchObject({ outcome: "rejected" });
    expect(h.objects.get(nextKey)!.text).toBe(nextManifest);
    await h.review(next.docId, approval);
    expect(await nextRun.run).toMatchObject({ outcome: "indexed" });
    expect(JSON.parse(h.objects.get(nextKey)!.text)).toMatchObject({ docId: next.docId, status: "indexed" });
  });

  it("changed uploads keep content ids/embeddings, refresh offsets/tags, and retire removed vectors only after approval", async () => {
    const h = harness(); const uploaded = await h.upload(firstParagraph + "\n\n" + secondParagraph);
    const first = await h.start(); await h.review(uploaded.docId, approval); await first.run;
    const oldChunks = await getChunks(h.DB, uploaded.docId);
    const kept = oldChunks.find((c) => c.text === firstParagraph)!;
    const removed = oldChunks.find((c) => c.text === secondParagraph)!;
    await h.upload(thirdParagraph + "\n\n" + firstParagraph);
    const next = await h.start();
    expect(h.vectors.size).toBe(4);
    expect((await getChunks(h.DB, uploaded.docId)).find((c) => c.chunk_id === kept.chunk_id)?.start_offset).toBe(0);
    await h.review(uploaded.docId, { ...approval, crops: ["corn"] }); await next.run;
    const chunks = await getChunks(h.DB, uploaded.docId);
    expect(chunks.find((c) => c.chunk_id === kept.chunk_id)).toMatchObject({ status: "indexed", start_offset: thirdParagraph.length + 2 });
    expect(chunks.find((c) => c.chunk_id === removed.chunk_id)?.status).toBe("retired");
    expect(h.vectors.has(`${removed.chunk_id}#corn`)).toBe(false);
    expect(h.vectors.has(`${kept.chunk_id}#cover`)).toBe(false);
    expect(h.vectors.size).toBe(2);
    expect(h.AI.run).toHaveBeenCalledTimes(3); // two original + only the new chunk
  });

  it("excludes reviewer-selected chunks without embedding/upserting them and audits the decision", async () => {
    const h = harness(); const uploaded = await h.upload(firstParagraph + "\n\n" + secondParagraph);
    const { run } = await h.start();
    const chunks = await getChunks(h.DB, uploaded.docId);
    const excluded = chunks.find((c) => c.text === secondParagraph)!;
    expect((await h.review(uploaded.docId, { ...approval, excludeChunkIds: [excluded.chunk_id] })).status).toBe(202);
    expect(await run).toMatchObject({ outcome: "indexed" });
    expect(h.AI.run).toHaveBeenCalledTimes(1);
    expect(h.vectors.size).toBe(2);
    expect(h.RESEARCH_INDEX.upsert.mock.calls.flatMap(([rows]) => rows).every((v) => v.metadata.chunk_id !== excluded.chunk_id)).toBe(true);
    expect((await getChunks(h.DB, uploaded.docId)).find((c) => c.chunk_id === excluded.chunk_id)).toMatchObject({ status: "excluded", vector_ids_json: "[]" });
    const doc = await getDoc(h.DB, uploaded.docId);
    const manifest = JSON.parse(h.objects.get(DOCS_LAYOUT.manifest(doc!.latest_sha256!, uploaded.docId))!.text);
    expect(manifest.review.excludeChunkIds).toEqual([excluded.chunk_id]);
    expect(manifest.chunks.find((c: { id: string }) => c.id === excluded.chunk_id).status).toBe("excluded");
  });

  it("validates exclusion types and membership in the current version, including kept chunks at shifted offsets", async () => {
    const h = harness(); const uploaded = await h.upload(firstParagraph + "\n\n" + secondParagraph);
    const first = await h.start(); await h.review(uploaded.docId, approval); await first.run;
    const oldChunks = await getChunks(h.DB, uploaded.docId);
    const kept = oldChunks.find((c) => c.text === firstParagraph)!;
    const removed = oldChunks.find((c) => c.text === secondParagraph)!;
    await h.upload(thirdParagraph + "\n\n" + firstParagraph);
    const next = await h.start();
    for (const excludeChunkIds of [["doc-foreign:chunk"], [removed.chunk_id], "not-an-array", [123], [kept.chunk_id, kept.chunk_id]]) {
      expect((await h.review(uploaded.docId, { ...approval, excludeChunkIds })).status).toBe(400);
    }
    const detail = await (await h.request(`/${uploaded.docId}`)).json() as { chunks: { chunk_id: string; start_offset: number; text: string }[] };
    expect(detail.chunks).toHaveLength(2);
    expect(detail.chunks.find((c) => c.chunk_id === kept.chunk_id)?.start_offset).toBe(thirdParagraph.length + 2);
    expect(detail.chunks.some((c) => c.chunk_id === removed.chunk_id)).toBe(false);
    h.AI.run.mockClear(); h.RESEARCH_INDEX.upsert.mockClear();
    expect((await h.review(uploaded.docId, { ...approval, excludeChunkIds: [kept.chunk_id] })).status).toBe(202);
    expect(await next.run).toMatchObject({ outcome: "indexed" });
    expect(h.AI.run).toHaveBeenCalledTimes(1);
    expect(h.vectors.has(`${kept.chunk_id}#corn`)).toBe(false);
    expect(h.vectors.has(`${kept.chunk_id}#cover`)).toBe(false);
    expect((await getChunks(h.DB, uploaded.docId)).find((c) => c.chunk_id === kept.chunk_id)).toMatchObject({ status: "excluded", start_offset: thirdParagraph.length + 2 });
    expect(h.RESEARCH_INDEX.upsert.mock.calls.flatMap(([rows]) => rows).every((v) => v.metadata.chunk_id !== kept.chunk_id)).toBe(true);
  });

  it("can approve with every chunk excluded without embedding or upserting", async () => {
    const h = harness(); const uploaded = await h.upload(firstParagraph + "\n\n" + secondParagraph);
    const { run } = await h.start();
    const excludeChunkIds = (await getChunks(h.DB, uploaded.docId)).map((c) => c.chunk_id);
    await h.review(uploaded.docId, { ...approval, excludeChunkIds });
    expect(await run).toMatchObject({ outcome: "indexed" });
    expect(h.AI.run).not.toHaveBeenCalled();
    expect(h.RESEARCH_INDEX.upsert).not.toHaveBeenCalled();
    expect(h.vectors.size).toBe(0);
    expect((await getChunks(h.DB, uploaded.docId)).every((c) => c.status === "excluded")).toBe(true);
  });

  it("rejects foreign exclusions even when an event bypasses the HTTP review route", async () => {
    const h = harness(); const uploaded = await h.upload(firstParagraph);
    const runner = h.step();
    runner.waitForEvent = async () => ({ payload: { ...approval, excludeChunkIds: ["doc-foreign:chunk"] } });
    expect(await runDocIngest(h.env, runner, h.params(), h.instanceId())).toMatchObject({ outcome: "error" });
    expect((await getDoc(h.DB, uploaded.docId))?.status).toBe("error");
    expect(h.AI.run).not.toHaveBeenCalled();
    expect(h.RESEARCH_INDEX.upsert).not.toHaveBeenCalled();
  });

  it("rejects without embedding or vector mutations", async () => {
    const h = harness(); const uploaded = await h.upload(firstParagraph);
    const { run } = await h.start();
    await h.review(uploaded.docId, { decision: "reject", reviewer: "reviewer", note: "not applicable" });
    expect(await run).toMatchObject({ outcome: "rejected" });
    expect((await getDoc(h.DB, uploaded.docId))?.status).toBe("rejected");
    expect(h.AI.run).not.toHaveBeenCalled(); expect(h.RESEARCH_INDEX.upsert).not.toHaveBeenCalled();
  });

  it("times out with error status and no vectors", async () => {
    const h = harness(); const uploaded = await h.upload(firstParagraph);
    const runner = h.step(); runner.waitForEvent = async () => { throw new Error("timeout"); };
    expect(await runDocIngest(h.env, runner, h.params(), h.instanceId())).toMatchObject({ outcome: "error" });
    expect(await getDoc(h.DB, uploaded.docId)).toMatchObject({ status: "error", error: expect.stringMatching(/timeout/) });
    expect(h.vectors.size).toBe(0); expect(h.AI.run).not.toHaveBeenCalled();
  });

  it("validates review authentication, all source fields, tags and waiting state", async () => {
    const h = harness(); const uploaded = await h.upload(firstParagraph); const { run } = await h.start();
    const path = `/${uploaded.docId}/review`;
    expect((await h.request(path, { method: "POST", body: JSON.stringify(approval) })).status).toBe(401);
    expect((await h.review(uploaded.docId, { decision: "approve", reviewer: "r" })).status).toBe(400);
    expect((await h.review(uploaded.docId, { ...approval, source: { ...approval.source, license: "" } })).status).toBe(400);
    expect((await h.review(uploaded.docId, { ...approval, crops: ["invented"] })).status).toBe(400);
    expect((await h.review(uploaded.docId, { ...approval, source: { ...approval.source, url: "javascript:alert(1)" } })).status).toBe(400);
    expect((await h.review(uploaded.docId, approval)).status).toBe(202); await run;
    expect((await h.review(uploaded.docId, approval)).status).toBe(409);
    expect((await h.request("/upload?name=bad.exe", { method: "POST", headers: h.auth, body: "bad" })).status).toBe(400);
    expect((await h.request("/upload?name=paper.txt", { method: "POST", body: "bad" })).status).toBe(401);
  });

  it("ignores stale notifications instead of reading newer bytes under the old event", async () => {
    const h = harness(); await h.upload(firstParagraph);
    const oldParams = h.params(), oldId = h.instanceId();
    await h.upload(secondParagraph);
    expect(await runDocIngest(h.env, h.step(), oldParams, oldId)).toMatchObject({ outcome: "superseded" });
    expect(h.AI.run).not.toHaveBeenCalled();
  });

  it("replays an interrupted approved batch without duplicating rows or vector ids", async () => {
    const h = harness(); const uploaded = await h.upload(firstParagraph + "\n\n" + secondParagraph);
    const cache = new Map<string, unknown>();
    let failed = false;
    const runner: DocStepRunner = {
      do: async (name, _config, callback) => {
        if (cache.has(name)) return cache.get(name) as never;
        if (name.startsWith("embed and upsert") && !failed) {
          failed = true;
          await callback(); // Side effects committed but the step checkpoint/response was lost.
          throw new Error("simulated interrupted checkpoint");
        }
        const value = await callback(); cache.set(name, value); return value;
      },
      waitForEvent: async () => ({ payload: approval }),
    };
    await expect(runDocIngest(h.env, runner, h.params(), h.instanceId())).rejects.toThrow("interrupted checkpoint");
    expect(h.vectors.size).toBe(4);
    expect(await runDocIngest(h.env, runner, h.params(), h.instanceId())).toMatchObject({ outcome: "indexed" });
    expect(h.vectors.size).toBe(4);
    expect(await getChunks(h.DB, uploaded.docId)).toHaveLength(2);
    expect(h.AI.run).toHaveBeenCalledTimes(2); // Recovery reuses the already-written vectors.
  });

  it("accepts multipart uploads and enforces extension and size limits", async () => {
    const h = harness();
    const form = new FormData(); form.set("file", new File([firstParagraph], "safe paper.md", { type: "text/markdown" }));
    const response = await h.request("/upload", { method: "POST", headers: h.auth, body: form });
    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({ key: "docs/safe_paper.md" });
    expect(h.objects.has("docs/safe_paper.md")).toBe(true);
    const tooLarge = await h.request("/upload?name=big.txt", { method: "POST", headers: h.auth, body: "x".repeat(10 * 1024 * 1024 + 1) });
    expect(tooLarge.status).toBe(413);
    expect(h.objects.has("docs/big.txt")).toBe(false);
  });

  it("acknowledges ignored/duplicate events and retries transient workflow failures", async () => {
    const h = harness();
    const deliver = async (key: string) => {
      const ack = vi.fn(), retry = vi.fn();
      await app.queue({ messages: [{ body: { bucket: "soilsense-docs", action: "PutObject", object: { key, eTag: "abc" }, eventTime: "2026-11-15T12:00:00Z" }, ack, retry }] } as unknown as MessageBatch, h.env);
      return { ack, retry };
    };
    expect((await deliver("extracted/a.md")).ack).toHaveBeenCalledOnce();
    expect((await deliver("docs/a.exe")).ack).toHaveBeenCalledOnce();
    h.DOC_INGEST.create.mockRejectedValueOnce(new Error("instance already exists") as never);
    expect((await deliver("docs/a.txt")).ack).toHaveBeenCalledOnce();
    h.DOC_INGEST.create.mockRejectedValueOnce(new Error("service unavailable") as never);
    expect((await deliver("docs/a.txt")).retry).toHaveBeenCalledOnce();
  });
});
