import type { DocChunk } from "../../shared/ingest";

export function verifyChunk(chunk: { text: string; start: number; end: number }, extracted: string): boolean {
  return Number.isInteger(chunk.start) && Number.isInteger(chunk.end)
    && chunk.start >= 0 && chunk.end >= chunk.start && chunk.end <= extracted.length
    && extracted.slice(chunk.start, chunk.end) === chunk.text;
}

export function diffChunks(next: DocChunk[], existing: { chunk_id: string; status: string }[]): { keep: string[]; add: DocChunk[]; retire: string[] } {
  const allExisting = new Set(existing.map((chunk) => chunk.chunk_id));
  const active = new Set(existing.filter((chunk) => chunk.status === "pending" || chunk.status === "indexed").map((chunk) => chunk.chunk_id));
  const uniqueNext = new Map(next.map((chunk) => [chunk.id, chunk]));
  return {
    keep: [...uniqueNext.keys()].filter((id) => active.has(id)),
    add: [...uniqueNext.values()].filter((chunk) => !allExisting.has(chunk.id)),
    retire: [...active].filter((id) => !uniqueNext.has(id)),
  };
}
