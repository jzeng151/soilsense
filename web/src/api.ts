import type { FieldResponse, PlanRequest, PlanResponse, SecondOpinion } from "../../src/shared/types";
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
  return handle(
    await fetch("/api/plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(req), signal }),
  );
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

export async function fetchVegetation(lat: number, lon: number, year: number, signal?: AbortSignal): Promise<import("../../src/shared/types").ModisVegetation> {
  return handle(await fetch(`/api/vegetation?lat=${lat}&lon=${lon}&year=${year}`, { signal }));
}
