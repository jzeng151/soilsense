import type { ResearchPassage } from "../../shared/research";
import { isResearchTag } from "./config";

interface IndexedChunk {
  chunk_id: string; doc_id: string; text: string; chunk_status: string; doc_status: string;
  start_offset: number; end_offset: number;
  title: string; url: string; publisher: string; year: number; license: string;
  attribution: string; applicability: string; crops_json: string;
}

/** Never trust vector metadata for text or attribution. D1's reviewed, indexed rows are authoritative. */
export async function docsPassageFor(db: D1Database | undefined, chunkId: string, tags: string[], score: number): Promise<ResearchPassage | null> {
  if (!db) return null;
  const row = await db.prepare(`SELECT c.chunk_id, c.doc_id, c.text, c.status AS chunk_status,
    c.start_offset, c.end_offset, d.status AS doc_status,
    d.title, d.url, d.publisher, d.year, d.license, d.attribution, d.applicability, d.crops_json
    FROM ingest_chunks c JOIN ingest_docs d ON d.doc_id = c.doc_id
    WHERE c.chunk_id = ? AND c.status = 'indexed' AND d.status = 'indexed'`).bind(chunkId).first<IndexedChunk>();
  if (!row || row.chunk_id !== chunkId || row.chunk_status !== "indexed" || row.doc_status !== "indexed") return null;
  for (const value of [row.doc_id, row.text, row.title, row.url, row.publisher, row.license, row.attribution, row.applicability]) {
    if (typeof value !== "string" || !value.trim()) return null;
  }
  try {
    if (!["http:", "https:"].includes(new URL(row.url).protocol)) return null;
  } catch { return null; }
  if (!Number.isInteger(row.year) || row.year < 1) return null;
  if (!Number.isInteger(row.start_offset) || row.start_offset < 0 || !Number.isInteger(row.end_offset) || row.end_offset - row.start_offset !== row.text.length) return null;
  let rawCrops: unknown;
  try { rawCrops = JSON.parse(row.crops_json); } catch { return null; }
  if (!Array.isArray(rawCrops) || !rawCrops.length || !rawCrops.every(isResearchTag)) return null;
  const crops = rawCrops.filter(isResearchTag);
  if (!crops.some((crop) => tags.includes(crop))) return null;
  return {
    chunkId: row.chunk_id, sourceId: row.doc_id, sourceTitle: row.title, sourceUrl: row.url,
    publisher: row.publisher, year: row.year, license: row.license, attribution: row.attribution,
    applicability: row.applicability, crops, text: row.text, origin: "docs",
    score: Math.round(score * 1000) / 1000,
  };
}
