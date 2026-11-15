import { CHUNKING, chunkId, type DocChunk } from "../../shared/ingest";
import { sha256Hex } from "./hash";

type Span = { start: number; end: number };

function trimmed(text: string, start: number, end: number): Span {
  while (start < end && /\s/u.test(text.charAt(start))) start++;
  while (end > start && /\s/u.test(text.charAt(end - 1))) end--;
  return { start, end };
}

/** Exact UTF-16 [start,end) slices of the normalized extraction; never rewrite prose. */
export async function chunkText(text: string, docId: string, docSha256: string): Promise<DocChunk[]> {
  const paragraphs: Span[] = [];
  let start = 0;
  for (const separator of text.matchAll(/\n[\t ]*\n(?:[\t ]*\n)*/g)) {
    const span = trimmed(text, start, separator.index);
    if (span.start < span.end) paragraphs.push(span);
    start = separator.index + separator[0].length;
  }
  const tail = trimmed(text, start, text.length);
  if (tail.start < tail.end) paragraphs.push(tail);

  const spans: Span[] = [];
  let packed: Span | undefined;
  for (const paragraph of paragraphs) {
    if (packed && paragraph.end - packed.start <= CHUNKING.maxChars) {
      packed.end = paragraph.end;
      continue;
    }
    if (packed) { spans.push(packed); packed = undefined; }
    let cursor = paragraph.start;
    while (paragraph.end - cursor > CHUNKING.maxChars) {
      let cut = cursor + CHUNKING.maxChars;
      const window = text.slice(cursor, cut + 1);
      // Prefer the last complete sentence; cut a sentence only if no boundary fits.
      const boundaries = [...window.matchAll(/[.!?]["'”’)]*(?=\s)/gu)];
      const boundary = boundaries.at(-1);
      if (boundary) cut = cursor + boundary.index + boundary[0].length;
      // Avoid cutting a UTF-16 surrogate pair on the hard-cut path.
      if (cut < text.length && /[\uD800-\uDBFF]/u.test(text.charAt(cut - 1)) && /[\uDC00-\uDFFF]/u.test(text.charAt(cut))) cut--;
      const span = trimmed(text, cursor, cut);
      if (span.start < span.end) spans.push(span);
      cursor = trimmed(text, cut, paragraph.end).start;
    }
    if (cursor < paragraph.end) packed = { start: cursor, end: paragraph.end };
  }
  if (packed) spans.push(packed);
  const whole = trimmed(text, 0, text.length);
  const chunks: DocChunk[] = [];
  const seen = new Set<string>();
  for (const span of spans) {
    const value = text.slice(span.start, span.end);
    if (value.length < CHUNKING.minChars && !(span.start === whole.start && span.end === whole.end)) continue;
    // Numeric tables are not useful semantic passages: numbers are quoted from D1,
    // not searched in Vectorize. Ignore whitespace when measuring non-text density.
    const visible = value.replace(/\s/gu, "");
    const nonText = visible.match(/[\p{N}\p{P}\p{S}]/gu)?.length ?? 0;
    if (nonText / Array.from(visible).length > 0.6) continue;
    const sha256 = await sha256Hex(value);
    const id = chunkId(docId, sha256);
    // D1 and Vectorize use content-addressed ids; repeated passages need only one row.
    if (seen.has(id)) continue;
    seen.add(id);
    chunks.push({ id, docId, docSha256, sha256, ...span, text: value });
  }
  return chunks;
}
