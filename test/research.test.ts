import { describe, expect, it, vi } from "vitest";
import type { PlanResponse, RotationPlan } from "../src/shared/types";
import { CORPUS, EMBEDDING, GENERATION, RESEARCH_TAGS, RETIRED_MODELS, embeddingInput, prepareEmbeddingText } from "../src/worker/research/config";
import { buildVectors, researchFor, retrieveLive, type AiLike, type VectorIndexLike } from "../src/worker/research/retrieve";
import { classifyAiError, explainRotation, type ExplainDeps } from "../src/worker/research/explain";
import { loadBundle, type SavedBundle, type SavedEntry } from "../src/worker/research/saved";
import app from "../src/worker/index";

// ---------- Mocks ----------

/** Deterministic bag-of-words embedding (768 dims, unit length). */
function fakeVector(text: string): number[] {
  const v = new Array<number>(768).fill(0);
  for (const w of text.toLowerCase().split(/\W+/).filter(Boolean)) {
    let h = 7;
    for (const ch of w) h = (h * 31 + ch.charCodeAt(0)) % 768;
    v[h]! += 1;
  }
  const n = Math.hypot(...v) || 1;
  return v.map((x) => x / n);
}

interface Call {
  model: string;
  input: Record<string, unknown>;
}

function mockAi(generate?: (input: Record<string, unknown>) => unknown | Promise<unknown>) {
  const calls: Call[] = [];
  const ai: AiLike = {
    async run(model, input) {
      const i = input as Record<string, unknown>;
      calls.push({ model, input: i });
      if (model === EMBEDDING.model) return { shape: [(i.text as string[]).length, 768], data: (i.text as string[]).map(fakeVector), pooling: i.pooling };
      if (model === GENERATION.model && generate) return generate(i);
      throw new Error(`unexpected model ${model}`);
    },
  };
  return { ai, calls, genCalls: () => calls.filter((c) => c.model === GENERATION.model).length };
}

/** In-memory Vectorize with $eq / $in metadata filtering and cosine scores. */
function mockIndex(score?: number) {
  const store: { id: string; values: number[]; metadata: Record<string, string> }[] = [];
  const index: VectorIndexLike = {
    async upsert(vectors) {
      for (const v of vectors) store.push({ ...v, metadata: v.metadata ?? {} });
      return { mutationId: "m1" };
    },
    async query(vector, opts) {
      const f = (opts?.filter ?? {}) as Record<string, { $eq?: string; $in?: string[] }>;
      const ok = (m: Record<string, string>) =>
        Object.entries(f).every(([k, cond]) => (cond.$eq !== undefined ? m[k] === cond.$eq : cond.$in ? cond.$in.includes(m[k]!) : true));
      const matches = store
        .filter((s) => ok(s.metadata))
        .map((s) => ({ id: s.id, metadata: s.metadata, score: score ?? 0.5 + 0.5 * s.values.reduce((a, x, i) => a + x * vector[i]!, 0) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, opts?.topK ?? 5);
      return { matches };
    },
  };
  return { index, store };
}

async function ingested(score?: number) {
  const m = mockAi();
  const { index, store } = mockIndex(score);
  await index.upsert!(await buildVectors(m.ai));
  return { index, store, ingestCalls: m.calls };
}

const failingIndex: VectorIndexLike = {
  async query() {
    throw new Error("Vectorize unavailable");
  },
};

function rotation(id: string, crops: RotationPlan["years"][number]["crop"][], cover = false, net = 120): RotationPlan {
  return {
    id,
    label: crops.join(" → "),
    years: crops.map((crop, i) => ({
      year: 2027 + i,
      crop,
      cropName: crop,
      cover: cover ? "cereal_rye" : "none",
      coverName: cover ? "Cereal rye" : "No cover",
      climateScore: 0.8,
      reliability: 0.8,
      mainStress: null,
      expectedYield: 150,
      yieldUnit: "bu/acre",
      nitrogenLbPerAcre: 100,
      netReturnPerAcre: net,
    })),
    scores: { climate: 0.8, reliability: 0.8, soil: 0.62, profit: 0.5, total: 0.7 },
    avgNetReturnPerAcre: net,
    totalNitrogenLbPerAcre: 260,
    coverYears: cover ? 3 : 0,
    notes: [],
    badYearsIn10: 2,
    waterPumpedIn: 0,
  };
}

function fakePlan(over: Partial<PlanResponse["request"]> = {}): PlanResponse {
  const request = { lat: 38.1095, lon: -100.706, irrigated: false, water: "rain" as const, priority: "balanced" as const, recentCrops: ["corn" as const], ...over };
  return {
    request,
    generatedAt: "2026-11-14T12:00:00.000Z",
    location: { county: null, lat: request.lat, lon: request.lon },
    soil: { available: false, source: "test" } as PlanResponse["soil"],
    cropHistory: { available: false, source: "test", years: [] },
    climate: { firstYear: 1991, lastYear: 2025, source: "NASA POWER", indicators: [] } as unknown as PlanResponse["climate"],
    plans: [rotation("plan-1", ["corn", "soybean", "winter_wheat"], true, 140), rotation("plan-2", ["sorghum", "fallow", "winter_wheat"], false, 60)],
    currentPractice: { ...rotation("current", ["corn", "corn", "corn"], false, 90), label: "Current pattern: corn → corn → corn", badYearsIn10: 4 },
    facts: [{ id: "history", text: "Recent crops: corn.", source: "Farmer input", kind: "history" }],
    explanation: { summary: "", speech: "", sms: "" },
    assumptions: [],
    dataSources: [],
    disclaimer: "",
    water: request.water,
  };
}

const empty: SavedBundle = { version: 1, entries: [] };
const modelSays = (o: unknown) => () => ({ choices: [{ message: { content: typeof o === "string" ? o : JSON.stringify(o) } }] });
const GOOD = (citations: string[] = []) => ({
  rotationId: "plan-1",
  narrative: "This rotation earns {{plan-1/net_return}} versus {{current/net_return}} for your current pattern, and adding small grain and winter cover breaks up continuous corn. It was badly stressed in {{plan-1/bad_years}} of the {{field/weather_period}} replay.",
  citations,
});

async function deps(over: Partial<ExplainDeps> & { score?: number } = {}): Promise<ExplainDeps> {
  const { index } = await ingested(over.score);
  return { index, saved: empty, scoringVersion: "e3", now: () => new Date("2026-11-15T08:00:00Z"), ...over };
}

/** A saved entry captured from a real (mocked here) successful run, like scripts/snapshot-research.mjs does. */
async function capturedEntry(plan = fakePlan()): Promise<SavedEntry> {
  const d = await deps();
  // Cite the first live passage, as a model would.
  const probe = await explainRotation({ ...d, ai: mockAi(modelSays(GOOD())).ai }, plan, plan.plans[0]!);
  const cite = probe.response.research.passages.map((p) => p.chunkId).slice(0, 1);
  const out = await explainRotation({ ...d, ai: mockAi(modelSays(GOOD(cite))).ai }, plan, plan.plans[0]!);
  expect(out.response.status).toBe("live");
  expect(out.capture).not.toBeNull();
  expect(cite.length).toBe(1);
  expect(out.capture!.research.passages.length).toBeGreaterThan(0);
  expect(out.capture!.explanation!.citations).toEqual(cite);
  return out.capture!;
}

// ---------- Embedding config ----------

describe("embedding configuration", () => {
  it("is pinned to bge-base-en-v1.5, 768 dims, cls pooling, 512 tokens, and no retiring model", () => {
    expect(EMBEDDING.model).toBe("@cf/baai/bge-base-en-v1.5");
    expect(EMBEDDING.dimensions).toBe(768);
    expect(EMBEDDING.pooling).toBe("cls");
    expect(EMBEDDING.maxTokens).toBe(512);
    expect(EMBEDDING.maxChars / 3).toBeLessThanOrEqual(EMBEDDING.maxTokens);
    expect(RETIRED_MODELS).not.toContain(EMBEDDING.model);
    expect(RETIRED_MODELS).not.toContain(GENERATION.model);
    expect(GENERATION.model).toBe("@cf/google/gemma-4-26b-a4b-it");
  });

  it("ingestion and query use the same model, pooling and preprocessing", async () => {
    const { ingestCalls, store } = await ingested();
    const q = mockAi();
    await retrieveLive({ ai: q.ai, index: (await ingested()).index }, ["corn"], "  corn   rootworm\n rotation ");
    const all = [...ingestCalls, ...q.calls];
    expect(all.length).toBe(2);
    for (const c of all) {
      expect(c.model).toBe(EMBEDDING.model);
      expect(c.input.pooling).toBe("cls");
    }
    expect((q.calls[0]!.input.text as string[])[0]).toBe(prepareEmbeddingText("corn rootworm rotation"));
    expect(embeddingInput(["a  b"])).toEqual({ text: ["a b"], pooling: "cls" });
    expect(store.every((v) => v.values.length === 768)).toBe(true);
  });

  it("rejects embeddings of the wrong dimension", async () => {
    const ai: AiLike = { run: async () => ({ data: [[0.1, 0.2]] }) };
    await expect(retrieveLive({ ai, index: mockIndex().index }, ["corn"], "corn")).rejects.toThrow(/768/);
  });
});

// ---------- Corpus ----------

describe("research corpus", () => {
  it("is small, attributed and covers every crop / rotation feature", () => {
    expect(CORPUS.chunks.length).toBeGreaterThanOrEqual(6);
    expect(CORPUS.chunks.length).toBeLessThanOrEqual(15);
    expect(new Set(CORPUS.chunks.map((c) => c.id)).size).toBe(CORPUS.chunks.length);
    for (const s of CORPUS.sources) {
      expect(s.url).toMatch(/^https:\/\//);
      expect(s.year).toBeGreaterThan(2000);
      expect(s.license.length).toBeGreaterThan(0);
      expect(s.attribution.length).toBeGreaterThan(0);
    }
    for (const c of CORPUS.chunks) {
      expect(CORPUS.sources.some((s) => s.id === c.sourceId)).toBe(true);
      expect(c.text.length).toBeLessThanOrEqual(EMBEDDING.maxChars);
      expect(prepareEmbeddingText(c.text)).toBe(c.text);
      for (const t of c.crops) expect(RESEARCH_TAGS).toContain(t);
    }
    for (const t of RESEARCH_TAGS) expect(CORPUS.chunks.some((c) => c.crops.includes(t))).toBe(true);
  });
});

// ---------- Retrieval ----------

describe("research retrieval", () => {
  it.each(RESEARCH_TAGS)("returns up to two applicable, verbatim passages for %s", async (tag) => {
    const { index } = await ingested();
    const r = await retrieveLive({ ai: mockAi().ai, index }, [tag], `${tag} crop rotation research`);
    expect(r.status).toBe("live");
    expect(r.passages.length).toBeGreaterThan(0);
    expect(r.passages.length).toBeLessThanOrEqual(2);
    for (const p of r.passages) {
      expect(p.crops).toContain(tag);
      expect(p.text).toBe(CORPUS.chunks.find((c) => c.id === p.chunkId)!.text);
      expect(p.sourceUrl).toMatch(/^https:\/\//);
    }
  });

  it("returns an explicit empty result for unsupported crops without calling AI", async () => {
    const m = mockAi();
    const r = await researchFor({ ai: m.ai, index: (await ingested()).index }, ["rice", "cotton"], "rice", null);
    expect(r).toMatchObject({ status: "empty", passages: [] });
    expect(m.calls.length).toBe(0);
  });

  it("returns empty (not unrelated text) when nothing scores above the threshold", async () => {
    const { index } = await ingested(0.1);
    const r = await retrieveLive({ ai: mockAi().ai, index }, ["corn"], "corn");
    expect(r).toMatchObject({ status: "empty", passages: [] });
  });

  it("on failure uses a matching saved result (labelled saved), else research-unavailable", async () => {
    const entry = await capturedEntry();
    const saved = await researchFor({ ai: mockAi().ai, index: failingIndex }, ["corn"], "corn", entry);
    expect(saved.status).toBe(entry.research.passages.length ? "saved" : "empty");
    expect(saved.retrievedAt).toBe(entry.research.retrievedAt);
    expect(saved.reason).toMatch(/saved/);
    const none = await researchFor({ ai: mockAi().ai, index: failingIndex }, ["corn"], "corn", null);
    expect(none).toMatchObject({ status: "unavailable", passages: [] });
    const unbound = await researchFor({}, ["corn"], "corn", null);
    expect(unbound.status).toBe("unavailable");
  });
});

// ---------- Explanations ----------

describe("grounded explanations", () => {
  it("validates fallback output identically and records the actual answering model", async () => {
    const plan = fakePlan();
    const underlying = mockAi().ai;
    let malicious = false;
    const ai: AiLike = { run: async (model, input, options) => {
      if (model === EMBEDDING.model) return underlying.run(model, input, options);
      if (model === GENERATION.model) throw new Error("primary unavailable");
      expect(model).toBe("@cf/meta/llama-3.3-70b-instruct-fp8-fast");
      return { response: JSON.stringify(malicious ? { ...GOOD(), narrative: "It earns {{made-up/fact}}." } : GOOD()) };
    } };
    const settings = await deps({ score: 0.1 });
    const good = await explainRotation({ ...settings, ai }, plan, plan.plans[0]!);
    expect(good.response.status).toBe("live");
    expect(good.response.model?.id).toBe("@cf/meta/llama-3.3-70b-instruct-fp8-fast");
    expect(good.capture?.explanation?.modelId).toBe("@cf/meta/llama-3.3-70b-instruct-fp8-fast");
    malicious = true;
    const bad = await explainRotation({ ...settings, ai }, plan, plan.plans[0]!);
    expect(bad.response.status).toBe("template");
    expect(bad.response.reason).toContain("rejected");
    expect(bad.capture).toBeNull();
    expect(plan.plans[0]!.avgNetReturnPerAcre).toBe(140);
  });

  it("renders a valid live explanation with numbers only from approved facts", async () => {
    const plan = fakePlan();
    const d = await deps();
    const probe = await explainRotation({ ...d, ai: mockAi(modelSays(GOOD())).ai }, plan, plan.plans[0]!);
    const cite = probe.response.research.passages.map((p) => p.chunkId).slice(0, 1);
    const { response } = await explainRotation({ ...d, ai: mockAi(modelSays(GOOD(cite))).ai }, plan, plan.plans[0]!);
    expect(response.status).toBe("live");
    expect(response.narrative).toContain("about $140 per acre per year");
    expect(response.narrative).toContain("about $90 per acre per year");
    expect(response.narrative).toContain("1991–2025");
    expect(response.narrative).not.toMatch(/\{\{/);
    expect(response.citations).toEqual(cite);
    expect(response.asOf).toBe(plan.generatedAt);
    expect(response.checks).toMatch(/extension agent/);
    expect(response.comparisonKey).toContain("e3");
  });

  const invalid: [string, unknown][] = [
    ["unknown fact ID", { ...GOOD(), narrative: "It earns {{plan-1/yield_magic}}." }],
    ["wrong rotation association", { ...GOOD(), narrative: "It earns {{plan-2/net_return}}." }],
    ["invented number", { ...GOOD(), narrative: "It earns {{plan-1/net_return}} and cuts erosion by 40 tons." }],
    ["number word", { ...GOOD(), narrative: "It earns {{plan-1/net_return}}, about ten percent more." }],
    ["unknown citation", GOOD(["made-up-source"])],
    ["wrong rotationId", { ...GOOD(), rotationId: "plan-2" }],
    ["invalid JSON", "Sure! Here is a great plan."],
    ["missing fields", { narrative: "x" }],
    ["certainty claim", { ...GOOD(), narrative: "It will definitely earn {{plan-1/net_return}}." }],
  ];
  it.each(invalid)("falls back to the template on %s", async (_, out) => {
    const plan = fakePlan();
    const { response } = await explainRotation({ ...(await deps()), ai: mockAi(modelSays(out)).ai }, plan, plan.plans[0]!);
    expect(response.status).toBe("template");
    expect(response.reason).toMatch(/rejected/);
    expect(response.citations).toEqual([]);
    expect(response.narrative).toContain("about $140 per acre per year");
    // The comparison itself is unchanged.
    expect(plan.plans[0]!.avgNetReturnPerAcre).toBe(140);
  });

  const failures: [string, () => never | Promise<never>][] = [
    ["HTTP 410", () => Promise.reject(Object.assign(new Error("Gone"), { status: 410 }))],
    ["error 5028", () => Promise.reject(new Error("AiError: 5028: model has been retired"))],
    ["timeout", () => new Promise<never>(() => {})],
    ["provider error", () => Promise.reject(new Error("503 upstream"))],
  ];
  it.each(failures)("%s: uses saved output only for a matching key, with no retry", async (_, fail) => {
    const plan = fakePlan();
    const entry = await capturedEntry(plan);
    const bundle = loadBundle({ version: 1, entries: [entry] });
    const m = mockAi(fail);
    const { response } = await explainRotation({ ...(await deps()), ai: m.ai, saved: bundle, timeoutMs: 30 }, plan, plan.plans[0]!);
    expect(m.genCalls()).toBe(1);
    expect(response.status).toBe("saved");
    expect(response.savedAt).toBe(entry.explanation!.generatedAt);
    expect(response.model?.id).toBe(GENERATION.model);
    for (const c of response.citations) expect(response.research.passages.map((p) => p.chunkId)).toContain(c);

    const m2 = mockAi(fail);
    const noSaved = await explainRotation({ ...(await deps()), ai: m2.ai, saved: empty, timeoutMs: 30 }, plan, plan.plans[0]!);
    expect(m2.genCalls()).toBe(1);
    expect(noSaved.response.status).toBe("template");
    expect(noSaved.response.citations).toEqual([]);
  });

  it("classifies 410 / 5028 as retired", () => {
    expect(classifyAiError(Object.assign(new Error("x"), { status: 410 }))).toBe("retired");
    expect(classifyAiError(new Error("5028: retired"))).toBe("retired");
    expect(classifyAiError(Object.assign(new Error("t"), { name: "TimeoutError" }))).toBe("timeout");
    expect(classifyAiError(new Error("boom"))).toBe("provider");
  });

  it.each([
    ["priority", { priority: "profit" as const }],
    ["scenario (water)", { water: "limited" as const, irrigated: true }],
    ["field", { lat: 38.2 }],
  ])("rejects saved output when the %s changes", async (_, change) => {
    const entry = await capturedEntry();
    const bundle = loadBundle({ version: 1, entries: [entry] });
    const changed = fakePlan(change);
    const m = mockAi(() => Promise.reject(new Error("5028")));
    const { response } = await explainRotation({ ...(await deps()), ai: m.ai, saved: bundle }, changed, changed.plans[0]!);
    expect(response.comparisonKey).not.toBe(entry.comparisonKey);
    expect(response.status).toBe("template");
  });

  it("rejects saved output when the scoring version or evidence changes", async () => {
    const entry = await capturedEntry();
    const bundle = loadBundle({ version: 1, entries: [entry] });
    const plan = fakePlan();
    const fail = mockAi(() => Promise.reject(new Error("5028"))).ai;
    const v = await explainRotation({ ...(await deps()), ai: fail, saved: bundle, scoringVersion: "e4" }, plan, plan.plans[0]!);
    expect(v.response.status).toBe("template");
    const moved = fakePlan();
    moved.plans[0] = { ...moved.plans[0]!, avgNetReturnPerAcre: 150 };
    const e = await explainRotation({ ...(await deps()), ai: fail, saved: bundle }, moved, moved.plans[0]!);
    expect(e.response.status).toBe("template");
    expect(e.response.narrative).toContain("$150");
  });

  it("without any AI binding: template (no saved) and research unavailable, comparison intact", async () => {
    const plan = fakePlan();
    const { response } = await explainRotation({ saved: empty, scoringVersion: "e3" }, plan, plan.plans[0]!);
    expect(response.status).toBe("template");
    expect(response.research.status).toBe("unavailable");
    expect(response.citations).toEqual([]);
  });

  it("saved demo works with live embedding and generation both disabled", async () => {
    const plan = fakePlan();
    const entry = await capturedEntry(plan);
    const { response } = await explainRotation({ saved: loadBundle({ entries: [entry] }), scoringVersion: "e3" }, plan, plan.plans[0]!);
    expect(response.status).toBe("saved");
    expect(["saved", "empty"]).toContain(response.research.status);
    expect(response.research.retrievedAt).toBe(entry.research.retrievedAt);
  });
});

// ---------- Routes ----------

describe("research routes", () => {
  const ctx = { waitUntil: () => {}, passThroughOnException: () => {}, props: {} } as unknown as ExecutionContext;
  it("status reports the pinned config", async () => {
    const res = await app.request("/api/research/status", {}, {}, ctx);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { embedding: { dimensions: number; pooling: string }; generation: { model: string } };
    expect(body.embedding).toMatchObject({ dimensions: 768, pooling: "cls" });
    expect(body.generation.model).toBe(GENERATION.model);
  });

  it("query: unsupported crop is an explicit empty result", async () => {
    const res = await app.request("/api/research/query", { method: "POST", body: JSON.stringify({ crops: ["rice"] }), headers: { "Content-Type": "application/json" } }, {}, ctx);
    expect(await res.json()).toMatchObject({ status: "empty", passages: [] });
  });

  it("ingest requires the admin token", async () => {
    const run = vi.fn();
    const res = await app.request("/api/research/ingest", { method: "POST" }, { ADMIN_TOKEN: "t", AI: { run } }, ctx);
    expect(res.status).toBe(401);
    expect(run).not.toHaveBeenCalled();
  });
});
