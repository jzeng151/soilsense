import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { CHUNKING, likelyGarbledChunk } from "../src/shared/ingest";
import { prepareEmbeddingText } from "../src/worker/research/config";
import { chunkText } from "../src/worker/ingest/chunk";
import { extractText } from "../src/worker/ingest/extract";
import { sha256Hex } from "../src/worker/ingest/hash";
import { diffChunks, verifyChunk } from "../src/worker/ingest/verify";

const bytes = (text: string): ArrayBuffer => new Uint8Array(new TextEncoder().encode(text)).buffer;
const fixture = readFileSync(new URL("./fixtures/ingest/kstate-rootworm.txt", import.meta.url), "utf8");

function invariants(chunks: Awaited<ReturnType<typeof chunkText>>, text: string) {
  expect(chunks.length).toBeGreaterThan(0);
  for (const chunk of chunks) {
    expect(chunk.text).toBe(text.slice(chunk.start, chunk.end));
    expect(chunk.text).toBe(chunk.text.trim());
    expect(chunk.text.length).toBeLessThanOrEqual(CHUNKING.maxChars);
    expect(prepareEmbeddingText(chunk.text)).toBe(chunk.text.replace(/\s+/g, " "));
    expect(chunk.text.length).toBeGreaterThanOrEqual(CHUNKING.minChars);
    expect(verifyChunk(chunk, text)).toBe(true);
  }
}

describe("review-only text quality warning", () => {
  it("flags repeated long glued mixed-case tokens, without rewriting text", () => {
    const text = "KansasAgricultural NewPrairie research with missing spaces.";
    expect(likelyGarbledChunk(text)).toBe(true);
    expect(text).toBe("KansasAgricultural NewPrairie research with missing spaces.");
    expect(likelyGarbledChunk(fixture)).toBe(false);
    expect(likelyGarbledChunk("Kansas Agricultural Experiment Station and New Prairie Press. NASA USDA PDFFormatVersion")).toBe(false);
    expect(likelyGarbledChunk("Evapotranspiration measurements characterize infiltration and precipitation.")).toBe(false);
  });
});

describe("document hash", () => {
  it("matches the standard SHA-256 vector and hashes only a view's bytes", async () => {
    const expected = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
    expect(await sha256Hex("abc")).toBe(expected);
    expect(await sha256Hex(bytes("abc"))).toBe(expected);
    expect(await sha256Hex(new TextEncoder().encode("!abc!").subarray(1, 4))).toBe(expected);
  });
});

describe("offset-exact chunking", () => {
  it("chunks the real extension excerpt deterministically without embedding truncation", async () => {
    const chunks = await chunkText(fixture, "doc", "version");
    invariants(chunks, fixture);
    expect(chunks).toHaveLength(2);
    const paragraphs = fixture.trim().split("\n\n");
    expect(chunks.map((chunk) => chunk.text)).toEqual([paragraphs.slice(0, 2).join("\n\n"), paragraphs[2]]);
    expect(await chunkText(fixture, "doc", "version")).toEqual(chunks);
    for (const chunk of chunks) expect(chunk.id).toBe(`doc:${(await sha256Hex(chunk.text)).slice(0, 16)}`);
  });

  it("keeps unchanged chunk ids after an edit shifts their offsets", async () => {
    const original = await chunkText(fixture, "doc", "old-version");
    const changed = fixture.replace("Significant", "Very significant");
    const next = await chunkText(changed, "doc", "new-version");
    expect(next[0]?.id).not.toBe(original[0]?.id);
    expect(next[1]?.id).toBe(original[1]?.id);
    expect(next[1]?.start).not.toBe(original[1]?.start);
    expect(next[1]?.docSha256).toBe("new-version");
    invariants(next, changed);
  });

  it("splits long paragraphs at complete sentences before hard-cutting", async () => {
    const sentence = "Healthy rotations preserve the soil and reduce pest pressure throughout the growing season. ";
    const text = Array.from({ length: 48 }, (_, i) => `Season ${i}: ${sentence}`).join("");
    const chunks = await chunkText(text, "doc", "v");
    invariants(chunks, text);
    expect(chunks.map((chunk) => chunk.text).join(" ")).toBe(text.trim());
    for (const chunk of chunks) expect(chunk.text.endsWith(".")).toBe(true);
  });

  it("hard-cuts oversized sentences but never splits a surrogate pair", async () => {
    const text = "a".repeat(1499) + "𐐀" + "b".repeat(1800);
    const chunks = await chunkText(text, "doc", "v");
    invariants(chunks, text);
    expect(chunks.map((chunk) => chunk.text).join("")).toBe(text);
    expect(chunks[0]?.text).toBe("a".repeat(1499));
    expect(chunks[1]?.text.startsWith("𐐀")).toBe(true);
  });

  it("allows a whole short document but skips short partial chunks and numeric tables", async () => {
    expect((await chunkText("  A short document.  ", "doc", "v"))[0]).toMatchObject({ start: 2, end: 19, text: "A short document." });
    expect(await chunkText(" \n\t", "doc", "v")).toEqual([]);
    expect(await chunkText("123 | 456 | 789\n".repeat(30), "doc", "v")).toEqual([]);
    const long = "soil ".repeat(299).trim();
    const chunks = await chunkText(long + "\n\nTiny tail.", "doc", "v");
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.text).toBe(long);
  });

  it("deduplicates identical content-addressed passages", async () => {
    const paragraph = "soil and crops ".repeat(80).trim();
    expect(await chunkText(`${paragraph}\n\n${paragraph}`, "doc", "v")).toHaveLength(1);
  });
});

describe("text extraction", () => {
  it.each(["document.md", "DOCUMENT.TXT"])("preserves UTF-8 text except CR/CRLF in %s", async (name) => {
    const text = "\uFEFF  café &amp; soil\r\n\r\n# Title\rlast line  ";
    expect(await extractText(undefined, bytes(text), name)).toEqual({ text: "\uFEFF  café &amp; soil\n\n# Title\nlast line  ", method: "plain-text" });
  });

  it("strips HTML scripts/styles/comments and decodes named/numeric entities while retaining paragraphs", async () => {
    const html = '<style>hidden</style><script>if (a < b) evil()</script><!-- hidden --><p>Soil &amp; roots&nbsp;&#x1F33D; &eacute;</p><p>Next <b>paragraph</b><br>line</p>';
    const result = await extractText(undefined, bytes(html), "page.htm");
    expect(result.method).toBe("html-text");
    expect(result.text.trim()).toBe("Soil & roots\u00a0🌽 é\n\n\n\nNext paragraph\nline");
    expect(result.text).not.toMatch(/hidden|evil|<\/?[a-z]/);
  });

  it("calls the documented array PDF API with an application/pdf Blob and converts to plain text", async () => {
    const toMarkdown = vi.fn().mockResolvedValue([{ id: "1", name: "report.pdf", mimeType: "application/pdf", format: "markdown", tokens: 10, data: [" # Soil", "", "roots "].join(String.fromCharCode(13)) }]);
    const result = await extractText({ toMarkdown } as unknown as Ai, bytes("pdf bytes"), "report.pdf");
    expect(result).toEqual({ text: "Soil\n\nroots ", method: "workers-ai-tomarkdown+plain", converterPreamble: { removed: false, chars: 0 }, plainTextConversion: { format: "markdown-to-plain-v1", inputChars: 15, outputChars: 12 } });
    const [files] = toMarkdown.mock.calls[0]!;
    expect(files).toHaveLength(1);
    expect(files[0].name).toBe("report.pdf");
    expect(files[0].blob.type).toBe("application/pdf");
    expect(await files[0].blob.text()).toBe("pdf bytes");
  });

  it("removes only the converter preamble and preserves exact post-removal offsets (constructed fixture)", async () => {
    // Constructed from the live # <input name> / ## Metadata shape, not a captured PDF.
    // Cloudflare documents PDF metadata inclusion, but not an exact Markdown serialization:
    // https://developers.cloudflare.com/workers-ai/features/markdown-conversion/how-it-works/#pdfs
    const preamble = "# docs/report.pdf\n\n## Metadata\n\n- PDFFormatVersion: 1.7\n- Language: en\n- IsLinearized: false\n- Custom.Appligent: Example\n\n";
    const body = "## Page 1\n\n" + fixture + "\n## Metadata\nDocument-owned metadata stays.\nKansasAgricultural NewPrairie  ";
    const toMarkdown = vi.fn().mockResolvedValue([{ format: "markdown", data: (preamble + body).replaceAll("\n", "\r\n") }]);
    const result = await extractText({ toMarkdown } as unknown as Ai, bytes("pdf"), "docs/report.pdf");
    const expected = "Page 1\n\n" + fixture + "\nMetadata\nDocument-owned metadata stays.\nKansasAgricultural NewPrairie  ";
    expect(result.text).toBe(expected);
    expect(result.converterPreamble).toEqual({ removed: true, chars: preamble.length });
    invariants(await chunkText(result.text, "doc", "v"), expected);
  });

  it.each([
    ["# Document title\n\n## Metadata\nPDFFormatVersion: 1.7\n\n## Page 1\nOriginal text", "Document title\n\nMetadata\nPDFFormatVersion: 1.7\n\nPage 1\nOriginal text"],
    ["# report.pdf\n\n## Metadata\nAuthor's own notes\n\n## Results\nOriginal text", "report.pdf\n\nMetadata\nAuthor's own notes\n\nResults\nOriginal text"],
    ["# report.pdf\n\n## Metadata\nPDFFormatVersion: 1.7\nNo safe section boundary", "report.pdf\n\nMetadata\nPDFFormatVersion: 1.7\nNo safe section boundary"],
  ])("preserves ambiguous or document-owned metadata words: %s", async (text, expected) => {
    const ai = { toMarkdown: vi.fn().mockResolvedValue([{ format: "markdown", data: text }]) } as unknown as Ai;
    const result = await extractText(ai, bytes("pdf"), "report.pdf");
    expect(result.text).toBe(expected);
    expect(result.converterPreamble).toEqual({ removed: false, chars: 0 });
  });

  it("converts PDF Markdown to plain text before saving offsets (constructed Markdown fixture)", async () => {
    const markdown = "# Limited irrigation\n\nA **bold** and _emphasized_ trial with `soil` and [source](https://example.org/paper).\n\n- First treatment\n- Second treatment\n\n| Crop | Treatment |\n| --- | --- |\n| Corn | **Limited** |\n| Sorghum | [Dryland](https://example.org) |\n\nKansasAgricultural NewPrairie remain unchanged.\n";
    const expected = "Limited irrigation\n\nA bold and emphasized trial with soil and source.\n\nFirst treatment\nSecond treatment\n\nCrop · Treatment\nCorn · Limited\nSorghum · Dryland\n\nKansasAgricultural NewPrairie remain unchanged.\n";
    const ai = { toMarkdown: vi.fn().mockResolvedValue([{ format: "markdown", data: markdown }]) } as unknown as Ai;
    const result = await extractText(ai, bytes("pdf"), "report.pdf");
    expect(result.text).toBe(expected);
    expect(result.method).toBe("workers-ai-tomarkdown+plain");
    expect(result.plainTextConversion).toEqual({ format: "markdown-to-plain-v1", inputChars: markdown.length, outputChars: expected.length });
    const chunks = await chunkText(result.text, "doc", "version");
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({ start: 0, end: expected.length - 1, text: expected.slice(0, -1) });
    invariants(chunks, result.text);
  });

  it.each([
    ["**Strong _emphasis_** and ~~old~~ remain.", "Strong emphasis and old remain."],
    ["# Soil\nRoots.\n\n## Water\nAvailability.", "Soil\nRoots.\n\nWater\nAvailability."],
    ["- Parent\n  - Nested\n- Last\n", "Parent\nNested\nLast\n"],
    ["[**K-State**](https://example.org/a_(b)) and [trial][ref].\n\n[ref]: https://example.org/report", "K-State and trial.\n\n"],
    ["```text\nN_kg = 45; **literal**\n```\n", "N_kg = 45; **literal**\n"],
    ["# Trial\n\npH 6.5, CO2, 30–45 kg/ha and 🌽.", "Trial\n\npH 6.5, CO2, 30–45 kg/ha and 🌽."],
    ["\\*literal stars\\* and unmatched **marker", "*literal stars* and unmatched **marker"],
  ])("keeps words and boundaries in plain conversion: %s", async (markdown, expected) => {
    const ai = { toMarkdown: vi.fn().mockResolvedValue([{ format: "markdown", data: markdown }]) } as unknown as Ai;
    expect((await extractText(ai, bytes("pdf"), "report.pdf")).text).toBe(expected);
  });

  it("rejects missing PDF AI, unsupported files, and empty plain text", async () => {
    await expect(extractText(undefined, bytes("pdf"), "report.pdf")).rejects.toThrow("requires a Workers AI binding");
    await expect(extractText(undefined, bytes("zip"), "report.zip")).rejects.toThrow("Unsupported document type");
    await expect(extractText(undefined, bytes(" \r\n"), "empty.txt")).rejects.toThrow("empty text");
  });

  it.each([
    { response: [], message: "no result" },
    { response: [{ format: "error", error: "unreadable PDF" }], message: "unreadable PDF" },
    { response: [{ format: "markdown", data: " \r\n" }], message: "empty text" },
    { response: [{ format: "markdown" }], message: "no text" },
  ])("rejects PDF conversion failure: $message", async ({ response, message }) => {
    const ai = { toMarkdown: vi.fn().mockResolvedValue(response) } as unknown as Ai;
    await expect(extractText(ai, bytes("pdf"), "report.pdf")).rejects.toThrow(message);
  });
});

describe("chunk verification and diff", () => {
  it("rejects changed text, invalid offsets, and JS slice coercion/clamping", () => {
    expect(verifyChunk({ text: "soil", start: 2, end: 6 }, "  soil!")).toBe(true);
    for (const chunk of [
      { text: "SOIL", start: 2, end: 6 }, { text: "soil", start: -4, end: 6 },
      { text: "soil", start: 0.5, end: 4 }, { text: "soil", start: 0, end: 100 },
      { text: "", start: 3, end: 2 }, { text: "", start: NaN, end: NaN },
    ]) expect(verifyChunk(chunk, "soil")).toBe(false);
  });

  it("keeps active ids, adds only absent ids, and retires only disappeared active ids", async () => {
    const chunks = await chunkText(fixture, "doc", "v");
    const [first, second] = chunks;
    expect(first).toBeDefined(); expect(second).toBeDefined();
    const existing = [
      { chunk_id: first!.id, status: "pending" },
      { chunk_id: "gone-indexed", status: "indexed" },
      { chunk_id: "gone-pending", status: "pending" },
      { chunk_id: "already-retired", status: "retired" },
    ];
    expect(diffChunks(chunks, existing)).toEqual({ keep: [first!.id], add: [second], retire: ["gone-indexed", "gone-pending"] });
    expect(diffChunks(chunks, chunks.map((chunk) => ({ chunk_id: chunk.id, status: "indexed" })))).toEqual({ keep: chunks.map((chunk) => chunk.id), add: [], retire: [] });
    expect(diffChunks(chunks, [{ chunk_id: first!.id, status: "retired" }])).toEqual({ keep: [], add: [second], retire: [] });
    expect(diffChunks([], existing).retire).toEqual([first!.id, "gone-indexed", "gone-pending"]);
  });
});
