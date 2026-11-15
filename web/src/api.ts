import type { FieldResponse, PlanRequest, PlanResponse, SecondOpinion } from "../../src/shared/types";
import type { ExplainRequest, ExplanationResponse } from "../../src/shared/research";
import { authFetch as fetch } from "./auth";

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

export async function scoutStatus(): Promise<{ configured: boolean; model: string | null; provider: "workers-ai" | "gemini" | null; fallback: string | null }> {
  return handle(await fetch("/api/scout/status"));
}

/** Kansas only: K-State's recommended rain-fed rotations for the county (our team's separate model). Throws on 404. */
export async function fetchSecondOpinion(countyFips: string, signal?: AbortSignal): Promise<SecondOpinion> {
  return handle(await fetch(`/api/second-opinion?fips=${encodeURIComponent(countyFips)}`, { signal }));
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
