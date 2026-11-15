// Research + explanation API (#7, #8). Mounted at /api/research.
//   GET  /api/research/status   config, corpus version, bindings, saved-entry count
//   GET  /api/research/corpus   the curated corpus (sources + chunks) for inspection
//   POST /api/research/query    {crops: string[], query?: string} -> up to 2 passages (live / empty / unavailable)
//   POST /api/research/explain  PlanRequest + {rotationId?} -> ExplanationResponse (live / saved / template)
//   POST /api/research/ingest   ADMIN_TOKEN only: embed the corpus with Workers AI and upsert into Vectorize
// The explain route recomputes the plan server-side (makePlan, cached in D1), so facts are never taken from the client.

import { Hono } from "hono";
import type { ExplainRequest } from "../../shared/research";
import type { Env } from "../env";
import { CORPUS, CORPUS_VERSION, EMBEDDING, GENERATION, MAX_PASSAGES, MIN_SCORE, VECTORIZE_INDEX_NAME, VECTORIZE_METADATA_INDEXES } from "../research/config";
import { explainRotation, findRotation } from "../research/explain";
import { buildVectors, EMBEDDING_INFO, researchFor, type AiLike, type VectorIndexLike } from "../research/retrieve";
import { SAVED_BUNDLE } from "../research/saved";
import { makePlan, PLAN_ENGINE_VERSION } from "../service";
import { validatePlanRequest } from "./api";

export const research = new Hono<{ Bindings: Env }>();

function adminOk(header: string | undefined, token: string | undefined): boolean {
  if (!token || !header) return false;
  const given = header.replace(/^Bearer\s+/i, "");
  if (given.length !== token.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ token.charCodeAt(i);
  return diff === 0;
}

const deps = (env: Env) => ({
  db: env.DB,
  ai: env.AI as unknown as AiLike | undefined,
  index: env.RESEARCH_INDEX as unknown as VectorIndexLike | undefined,
  gatewayId: env.AI_GATEWAY_ID ?? "default",
});

research.get("/status", (c) =>
  c.json({
    corpusVersion: CORPUS_VERSION,
    chunks: CORPUS.chunks.length,
    sources: CORPUS.sources.map((s) => ({ id: s.id, title: s.title, url: s.url, year: s.year })),
    embedding: EMBEDDING,
    generation: { model: GENERATION.model, promptVersion: GENERATION.promptVersion },
    index: { name: VECTORIZE_INDEX_NAME, metadataIndexes: VECTORIZE_METADATA_INDEXES, bound: Boolean(c.env.RESEARCH_INDEX) },
    ai: Boolean(c.env.AI),
    retrieval: { maxPassages: MAX_PASSAGES, minScore: MIN_SCORE },
    scoringVersion: PLAN_ENGINE_VERSION,
    savedEntries: SAVED_BUNDLE.entries.length,
  }),
);

research.get("/corpus", (c) => c.json(CORPUS));

research.post("/query", async (c) => {
  const body = (await c.req.json().catch(() => null)) as { crops?: unknown; query?: unknown } | null;
  const crops = Array.isArray(body?.crops) ? body.crops.map(String).slice(0, 8) : [];
  if (!crops.length) return c.json({ error: "crops (array) required" }, 400);
  const query = typeof body?.query === "string" && body.query.trim() ? body.query.slice(0, 500) : `Crop rotation research about ${crops.join(" and ")}.`;
  // No saved fallback here: this is the raw retrieval check (saved results are keyed to full comparisons).
  return c.json(await researchFor(deps(c.env), crops, query, null));
});

research.post("/explain", async (c) => {
  let body: ExplainRequest & { capture?: boolean };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }
  const req = validatePlanRequest(body);
  if (typeof req === "string") return c.json({ error: req }, 400);
  const rotationId = typeof body.rotationId === "string" ? body.rotationId.slice(0, 40) : undefined;
  const capture = body.capture === true;
  if (capture && !adminOk(c.req.header("Authorization"), c.env.ADMIN_TOKEN)) return c.json({ error: "capture requires ADMIN_TOKEN" }, 401);
  let plan;
  try {
    plan = await makePlan(c.env, req);
  } catch (err) {
    console.warn(JSON.stringify({ msg: "explain: plan failed", err: String(err) }));
    return c.json({ error: "Could not rebuild the plan for this explanation." }, 502);
  }
  const rotation = findRotation(plan, rotationId);
  if (!rotation) return c.json({ error: "Unknown rotation for this plan" }, 404);
  const out = await explainRotation({ ...deps(c.env), saved: SAVED_BUNDLE, scoringVersion: PLAN_ENGINE_VERSION }, plan, rotation);
  c.header("Cache-Control", "no-store");
  return c.json(capture ? { ...out.response, capture: out.capture } : out.response);
});

research.post("/ingest", async (c) => {
  if (!c.env.ADMIN_TOKEN) return c.json({ error: "Set the ADMIN_TOKEN secret first." }, 403);
  if (!adminOk(c.req.header("Authorization"), c.env.ADMIN_TOKEN)) return c.json({ error: "unauthorized" }, 401);
  const { ai, index, gatewayId } = deps(c.env);
  if (!ai || !index?.upsert) return c.json({ error: "AI and RESEARCH_INDEX bindings are required" }, 503);
  const vectors = await buildVectors(ai, gatewayId);
  const mutation = await index.upsert(vectors);
  return c.json({
    ok: true,
    corpusVersion: CORPUS_VERSION,
    embedding: EMBEDDING_INFO,
    chunks: CORPUS.chunks.length,
    vectors: vectors.length,
    dimensions: vectors[0]?.values.length ?? 0,
    mutation,
    note: "Vectorize applies upserts asynchronously; wait a few seconds before querying.",
  });
});
