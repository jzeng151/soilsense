import { describe, expect, it, vi } from "vitest";
import { researchFor, type AiLike, type VectorIndexLike } from "../src/worker/research/retrieve";
import { CORPUS_VERSION } from "../src/worker/research/config";
import { DOCS_CORPUS } from "../src/shared/ingest";

const row = {
  chunk_id: "doc-test:chunk", doc_id: "doc-test", text: "A reviewed excerpt.",
  chunk_status: "indexed", doc_status: "indexed", start_offset: 0, end_offset: 19,
  title: "Reviewed trial", url: "https://example.org/trial", publisher: "Trial publisher", year: 2024,
  license: "CC BY 4.0", attribution: "Trial authors", applicability: "Trial site only", crops_json: '["corn"]',
};
const ai: AiLike = { run: async () => ({ data: [new Array(768).fill(0)] }) };
function setup(over = {}) {
  const first = vi.fn(async () => ({ ...row, ...over }));
  const bind = vi.fn(() => ({ first }));
  const prepare = vi.fn(() => ({ bind }));
  const db = { prepare } as unknown as D1Database;
  const query = vi.fn(async (_vector: number[], _options?: VectorizeQueryOptions) => ({ matches: [{ id: "doc-test:chunk#corn", score: 0.9, metadata: { corpus: DOCS_CORPUS, chunk_id: row.chunk_id } }] }));
  return { db, prepare, bind, query, index: { query } as VectorIndexLike };
}
describe("reviewed document retrieval", () => {
  it.each([
    { chunk_status: "pending" }, { chunk_status: "retired" }, { doc_status: "pending_review" },
    { doc_status: "approved" }, { doc_status: "rejected" }, { title: null }, { url: "javascript:alert(1)" },
    { publisher: "" }, { license: null }, { attribution: "" }, { applicability: "" },
    { year: null }, { crops_json: "not json" }, { crops_json: '["soybean"]' }, { end_offset: 999 },
  ])("drops unapproved, non-indexed or incomplete passages: %j", async (over) => {
    expect(await researchFor({ ai, ...setup(over) }, ["corn"], "corn", null)).toMatchObject({ status: "empty", passages: [] });
  });
  it("drops docs matches without a DB binding", async () => {
    const d = setup();
    expect(await researchFor({ ai, index: d.index }, ["corn"], "corn", null)).toMatchObject({ status: "empty", passages: [] });
    expect(d.prepare).not.toHaveBeenCalled();
  });
  it("resolves a cited passage from D1 and searches both corpora with the crop filter", async () => {
    const d = setup();
    const result = await researchFor({ ai, ...d }, ["corn"], "corn", null);
    expect(result.status).toBe("live");
    expect(result.passages).toEqual([{
      chunkId: row.chunk_id, sourceId: row.doc_id, sourceTitle: row.title, sourceUrl: row.url,
      publisher: row.publisher, year: 2024, license: row.license, attribution: row.attribution,
      applicability: row.applicability, crops: ["corn"], text: row.text, score: 0.9, origin: "docs",
    }]);
    expect(d.query.mock.calls[0]?.[1]).toMatchObject({ filter: { corpus: { $in: [CORPUS_VERSION, DOCS_CORPUS] }, crop: { $eq: "corn" } } });
    expect(d.bind).toHaveBeenCalledWith(row.chunk_id);
    expect(d.prepare).toHaveBeenCalledWith(expect.stringMatching(/JOIN ingest_docs/));
  });
});
