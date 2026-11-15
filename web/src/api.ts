import type { FieldResponse, PlanRequest, PlanResponse, SecondOpinion } from "../../src/shared/types";
import type { ExplainRequest, ExplanationResponse } from "../../src/shared/research";
import type { ReviewDecision, DocStatus, ChunkStatus } from "../../src/shared/ingest";
import { authFetch as fetch } from "./auth";

export interface AdminDocument {
  docId: string;
  r2Key: string;
  status: DocStatus;
  title: string | null;
  updatedAt: string;
  chunkCounts?: Partial<Record<ChunkStatus, number>>;
}
export interface AdminDocDetail {
  doc: AdminDocument;
  versions: Record<string, unknown>[];
  chunks: { chunkId: string; start: number; end: number; text: string; status: ChunkStatus }[];
}
// The pipeline currently returns D1 snake_case rows; also accept the documented camelCase contract.
interface DocApiRow {
  doc_id: string; r2_key: string; status: DocStatus; title: string | null; updated_at: string;
}
interface ChunkApiRow {
  chunk_id: string; start_offset: number; end_offset: number; text: string; status: ChunkStatus;
}
function adminDocument(doc: AdminDocument | DocApiRow): AdminDocument {
  return "docId" in doc ? doc : { docId: doc.doc_id, r2Key: doc.r2_key, status: doc.status, title: doc.title, updatedAt: doc.updated_at };
}
export async function fetchDocs(token: string): Promise<{ docs: AdminDocument[] }> {
  const body = await handle<{ docs: (AdminDocument | DocApiRow)[] }>(await fetch("/api/docs", { headers: { Authorization: `Bearer ${token}` } }));
  return { docs: body.docs.map(adminDocument) };
}
export async function fetchDoc(docId: string, token: string): Promise<AdminDocDetail> {
  const body = await handle<{ doc: AdminDocument | DocApiRow; versions: Record<string, unknown>[]; chunks: (AdminDocDetail["chunks"][number] | ChunkApiRow)[] }>(
    await fetch(`/api/docs/${encodeURIComponent(docId)}`, { headers: { Authorization: `Bearer ${token}` } }),
  );
  return { doc: adminDocument(body.doc), versions: body.versions, chunks: body.chunks.map((chunk) => "chunkId" in chunk ? chunk : {
    chunkId: chunk.chunk_id, start: chunk.start_offset, end: chunk.end_offset, text: chunk.text, status: chunk.status,
  }) };
}
export async function reviewDoc(docId: string, decision: ReviewDecision, token: string): Promise<{ ok: boolean }> {
  return handle(await fetch(`/api/docs/${encodeURIComponent(docId)}/review`, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(decision),
  }));
}
export async function uploadDoc(file: File, token: string): Promise<{ docId: string; key: string; status: "queued"; size: number; eTag?: string }> {
  const body = new FormData();
  body.append("file", file);
  return handle(await fetch("/api/docs/upload", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body }));
}

async function handle<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `Request failed (${res.status})`);
  return body as T;
}

export async function fetchField(lat: number, lon: number, signal?: AbortSignal): Promise<FieldResponse> {
  return handle(await fetch(`/api/field?lat=${lat}&lon=${lon}`, { signal }));
}

export async function fetchPlan(req: PlanRequest, signal?: AbortSignal): Promise<PlanResponse> {
  const plan = await handle<PlanResponse>(
    await fetch("/api/plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(req), signal }),
  );
  setLastPlan(plan);
  return plan;
}

export async function askQuestion(body: { question: string; planLabel: string; summary: string; facts: string[] }): Promise<{ answer: string; source: string }> {
  return handle(await fetch("/api/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
}

export async function scoutStatus(): Promise<{ configured: boolean; model: string | null; provider: "workers-ai" | "gemini" | null; fallback: string | null; research: "configured" | "unavailable" }> {
  return handle(await fetch("/api/scout/status"));
}

/** Kansas only: K-State's recommended rain-fed rotations for the county (our team's separate model). Throws on 404. */
export async function fetchSecondOpinion(countyFips: string, signal?: AbortSignal): Promise<SecondOpinion> {
  return handle(await fetch(`/api/second-opinion?fips=${encodeURIComponent(countyFips)}`, { signal }));
}





export async function fetchVegetation(lat: number, lon: number, year: number, signal?: AbortSignal): Promise<import("../../src/shared/types").ModisVegetation> {
  return handle(await fetch(`/api/vegetation?lat=${lat}&lon=${lon}&year=${year}`, { signal }));
}
// ---- Grounded explanations (#7/#8): the latest plan response, so plan cards can ask for an explanation ----
// of the exact comparison they show without App.tsx having to pass the request down.
let lastPlan: PlanResponse | null = null;
const planListeners = new Set<() => void>();
function setLastPlan(p: PlanResponse): void {
  lastPlan = p;
  for (const l of planListeners) l();
}
export function subscribeLastPlan(l: () => void): () => void {
  planListeners.add(l);
  return () => planListeners.delete(l);
}
export function getLastPlan(): PlanResponse | null {
  return lastPlan;
}

export async function fetchExplanation(req: ExplainRequest, signal?: AbortSignal): Promise<ExplanationResponse> {
  return handle(await fetch("/api/research/explain", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(req), signal }));
}

/** Weekly U.S. Drought Monitor context (May–Sep) for each replayed year in the field's county (issue #31). */
export async function fetchUsdmReplay(countyFips: string, years: number[], signal?: AbortSignal): Promise<{ timelines: import("../../src/shared/types").UsdmTimeline[] }> {
  return handle(await fetch(`/api/usdm/replay?fips=${encodeURIComponent(countyFips)}&years=${years.join(",")}`, { signal }));
}

/** Wind-erosion exposure screen for the field and rotation calendars (issues #40, #17). */
export async function fetchWindScreen(
  body: { lat: number; lon: number; lastCrop: string | null; rotations: { label: string; years: { year: number; crop: string; cover: string }[] }[] },
  signal?: AbortSignal,
): Promise<import("../../src/shared/types").WindScreen> {
  return handle(await fetch("/api/wind-screen", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal }));




}
