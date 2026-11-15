import type { FieldResearchNote } from "../../shared/fieldResearch";
import type { Env } from "../env";
import { CORPUS_VERSION } from "../research/config";
import { EMBEDDING_INFO, researchFor } from "../research/retrieve";
import type { WatchedField } from "./run";

/** A slow embedding/index cannot hold a field check open indefinitely. No retries or generation. */
export const RESEARCH_TIMEOUT_MS = 1500;

export async function researchNoteFor(
  status: string,
  env: Env,
  field: WatchedField,
  crop?: string | null,
): Promise<FieldResearchNote | undefined> {
  if (status !== "dry" && status !== "watch") return undefined;
  const tags = [...new Set(crop ? [crop] : field.crops ?? [])];
  const base: FieldResearchNote = {
    status: "unavailable", passages: [], tags, retrievedAt: null,
    corpusVersion: CORPUS_VERSION, embedding: EMBEDDING_INFO,
    cropSource: crop ? "watch settings" : tags.length ? "demo field configuration" : null,
    template: `Research on ${tags.join(", ").replaceAll("_", " ")} in dry conditions (shown as context, not advice for this field):`,
    query: null,
  };
  if (!tags.length) return { ...base, status: "skipped", template: "No matching research.", reason: "No crop in watch settings or demo field configuration; retrieval skipped." };
  const query = `Research on ${tags.join(", ")} during dry spells, drought and limited soil water.`;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const research = await Promise.race([
      researchFor({ ai: env.AI, index: env.RESEARCH_INDEX, gatewayId: env.AI_GATEWAY_ID }, tags, query, null),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Research retrieval timed out.")), RESEARCH_TIMEOUT_MS); }),
    ]);
    return { ...base, ...research, query };
  } catch {
    return { ...base, query, reason: "Research retrieval failed or timed out; no matching research is available for this run." };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
