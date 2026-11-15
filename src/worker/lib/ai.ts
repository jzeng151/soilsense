import type { LanguageModel, TextStreamPart, ToolSet } from "ai";
import { createGoogle } from "@ai-sdk/google";
import { createWorkersAI } from "workers-ai-provider";
import type { Env } from "../env";
import { EMBEDDING, GENERATION, RETIRED_MODELS } from "../research/config";

export interface GatewayModel { provider: "workers-ai" | "gemini"; id: string; model: LanguageModel }

export interface AiRunner { run(model: string, input: unknown, options?: unknown): Promise<unknown> }
export interface CallPolicy {
  feature: string;
  signal?: AbortSignal;
  gatewayId?: string;
  db?: D1Database;
  timeoutMs?: number;
  /** Only immutable corpus/document embeddings, never query embeddings or chat. */
  corpusEmbedding?: boolean;
  fallback?: boolean;
  correlationId?: string;
}
export const GENERATION_FALLBACK = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const RETENTION_MS = 86_400_000;
interface CallRecord { feature: string; model: string; failed: boolean; fallback: boolean; latencyMs: number; correlationId: string }

export function gatewayOptions(model: string, policy: CallPolicy): GatewayOptions {
  const cache = policy.corpusEmbedding === true && model === EMBEDDING.model;
  return {
    id: policy.gatewayId ?? "default",
    skipCache: !cache,
    ...(cache ? { cacheTtl: 86_400 } : {}),
    // Bound gateway retries as well as the app's explicit fallback chain.
    retries: { maxAttempts: 1 },
    requestTimeoutMs: policy.timeoutMs ?? 25_000,
    collectLog: true,
    metadata: { feature: policy.feature, model, cachePolicy: cache ? "corpus-24h" : "no-cache", correlationId: policy.correlationId ?? crypto.randomUUID(), fallback: policy.fallback ?? false },
  };
}

async function record(db: D1Database | undefined, entry: CallRecord) {
  console.log(JSON.stringify({ msg: "ai-call", ...entry }));
  if (!db) return;
  try {
    const now = Date.now();
    await db.batch([
      db.prepare("INSERT INTO cache (key,value,expires_at,created_at) VALUES (?1,?2,?3,?4)").bind(`ai-usage:${crypto.randomUUID()}`, JSON.stringify(entry), now + RETENTION_MS, now),
      db.prepare("DELETE FROM cache WHERE key GLOB 'ai-usage:*' AND expires_at <= ?1").bind(now),
    ]);
  } catch { console.warn("AI usage persistence unavailable"); }
}

/** One deadline includes stream consumption. No retries once any output/tool call is visible. */
async function observed<T>(model: string, policy: CallPolicy, invoke: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const start = Date.now();
  const correlationId = policy.correlationId ?? crypto.randomUUID();
  const ctrl = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let finished = false;
  const finish = async (failed: boolean) => {
    if (finished) return;
    finished = true;
    if (timer !== undefined) clearTimeout(timer);
    policy.signal?.removeEventListener("abort", abort);
    await record(policy.db, { feature: policy.feature, model, failed, fallback: policy.fallback ?? false, latencyMs: Date.now() - start, correlationId });
  };
  let rejectAbort: (reason: unknown) => void = () => {};
  const abort = () => { ctrl.abort(); if (timer !== undefined) clearTimeout(timer); rejectAbort(new Error("AI call cancelled")); };
  const cancelled = new Promise<never>((_, reject) => { rejectAbort = reject; });
  policy.signal?.addEventListener("abort", abort, { once: true });
  if (policy.signal?.aborted) abort();
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { ctrl.abort(); reject(Object.assign(new Error("AI call timed out"), { name: "TimeoutError" })); }, policy.timeoutMs ?? 25_000);
  });
  try {
    const value = await Promise.race([invoke(ctrl.signal), timeout, cancelled]);
    if (value instanceof ReadableStream) {
      const reader = value.getReader();
      return new ReadableStream({
        async pull(controller) {
          try {
            const part = await Promise.race([reader.read(), timeout, cancelled]);
            if (part.done) { await finish(false); controller.close(); }
            else controller.enqueue(part.value);
          } catch (error) { void reader.cancel().catch(() => {}); await finish(true); controller.error(error); }
        },
        async cancel(reason) { ctrl.abort(); await finish(true); void reader.cancel(reason).catch(() => {}); },
      }) as T;
    }
    await finish(false);
    return value;
  } catch (error) { await finish(true); throw error; }
}

export async function runAI(ai: AiRunner, model: string, input: unknown, policy: CallPolicy): Promise<unknown> {
  if ((RETIRED_MODELS as readonly string[]).includes(model)) throw new Error("Retired AI model is not allowed");
  const tagged = { ...policy, correlationId: policy.correlationId ?? crypto.randomUUID() };
  return observed(model, tagged, (signal) => ai.run(model, input, { gateway: gatewayOptions(model, tagged), extraHeaders: { "cf-aig-collect-log-payload": "false" }, signal }));
}

/** Two attempts only: pinned Gemma, then Llama 3.3; caller retains template/saved fallback. */
export async function generateAI(ai: AiRunner, input: unknown, policy: CallPolicy, primary: string = GENERATION.model) {
  const correlationId = crypto.randomUUID();
  const models = [...new Set([primary, GENERATION_FALLBACK])];
  let error: unknown;
  for (let i = 0; i < models.length; i++) {
    try { return { output: await runAI(ai, models[i]!, input, { ...policy, correlationId, fallback: i > 0 }), model: models[i]! }; }
    catch (err) { error = err; }
  }
  throw error;
}

export function workersModel(env: Env, id: string, feature: string, fallback = false) {
  if (!env.AI) throw new Error("Workers AI binding required");
  const ai = env.AI;
  const binding = { run: (model: string, input: unknown, options?: { signal?: AbortSignal }) => runAI(ai as unknown as AiRunner, model, input, { feature, db: env.DB, gatewayId: env.AI_GATEWAY_ID, timeoutMs: 60_000, fallback, signal: options?.signal }) } as unknown as Ai;
  return createWorkersAI({ binding })(id as Parameters<ReturnType<typeof createWorkersAI>>[0]);
}

/** Provider-native Gemini wire format, sent via the AI binding, never Google's public host. */
export function googleModel(env: Env, id: string, feature: string, fallback = false) {
  return createGoogle({
    apiKey: env.GEMINI_API_KEY,
    fetch: async (url, init) => {
      if (!env.AI) throw new Error("AI binding required to route Gemini through Gateway");
      const policy = { feature, db: env.DB, gatewayId: env.AI_GATEWAY_ID, timeoutMs: 60_000, fallback, correlationId: crypto.randomUUID(), signal: init?.signal ?? undefined };
      let responseHeaders: Headers | undefined;
      const response = await observed(id, policy, async (signal) => {
        const parsed = new URL(String(url));
        const res = await env.AI!.gateway(env.AI_GATEWAY_ID ?? "default").run({
          provider: "google-ai-studio", endpoint: parsed.pathname.slice(1) + parsed.search,
          headers: Object.fromEntries(new Headers(init?.headers).entries()), query: JSON.parse(String(init?.body)),
        }, { gateway: gatewayOptions(id, policy), extraHeaders: { "cf-aig-collect-log-payload": "false" }, signal: init?.signal ? AbortSignal.any([signal, init.signal]) : signal });
        if (!res.ok) { void res.body?.cancel(); throw new Error(`Gemini gateway HTTP ${res.status}`); }
        responseHeaders = res.headers;
        return res.body;
      });
      return new Response(response, { headers: responseHeaders });
    },
  })(id);
}

export function markdownAI(ai: Ai, files: MarkdownDocument[], policy: CallPolicy) {
  return observed("toMarkdown", policy, () => ai.toMarkdown(files, { gateway: gatewayOptions("toMarkdown", policy), extraHeaders: { "cf-aig-collect-log-payload": "false" } }));
}

/** Parts that mean the model has started answering (after these, an error is shown rather than retried). */
const CONTENT_PARTS = new Set(["text-delta", "reasoning-delta", "tool-input-start", "tool-call", "tool-result"]);
/** Every candidate, including the last, must produce content within this deadline. */
const FIRST_CONTENT_TIMEOUT_MS = 25_000;

/**
 * Start the first model whose stream gets going: if a model fails or stays silent before producing anything
 * (quota, outage, unsupported model, hang), try the next one. The parts read while checking are replayed.
 */
export async function firstWorking<T extends ToolSet>(
  models: GatewayModel[],
  start: (m: GatewayModel, signal: AbortSignal) => ReadableStream<TextStreamPart<T>>,
  timeoutMs = FIRST_CONTENT_TIMEOUT_MS,
): Promise<{ stream: ReadableStream<TextStreamPart<T>>; model: GatewayModel }> {
  for (let i = 0; i < models.length; i++) {
    const m = models[i] as GatewayModel;
    const last = i === models.length - 1;
    const attempt = new AbortController();
    let source: ReadableStream<TextStreamPart<T>>;
    try { source = start(m, attempt.signal); }
    catch (error) { attempt.abort(); if (last) throw error; continue; }
    const reader = source.getReader();
    const buffered: TextStreamPart<T>[] = [];
    let failed: unknown = null;
    let done = false;
    const deadline = Date.now() + timeoutMs;
    try {
      for (;;) {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const timeout = new Promise<"timeout">((resolve) => {
          timer = setTimeout(() => resolve("timeout"), Math.max(0, deadline - Date.now()));
        });
        const next = await Promise.race([reader.read(), timeout]).finally(() => { if (timer !== undefined) clearTimeout(timer); });
        if (next === "timeout") {
          failed = `no answer within ${Math.round(timeoutMs / 1000)} s`;
          break;
        }
        if (next.done) {
          done = true;
          failed = new Error("Model stream ended without content");
          break;
        }
        if (next.value.type === "error") {
          failed = (next.value as { error?: unknown }).error ?? "stream error";
          break;
        }
        buffered.push(next.value);
        if (CONTENT_PARTS.has(next.value.type)) break;
      }
    } catch (err) {
      failed = err;
    }
    if (failed) { attempt.abort(); void reader.cancel().catch(() => {}); }
    if (failed && !last) {
      console.warn(JSON.stringify({ msg: "AI model failed, trying next", provider: m.provider, model: m.id }));
      continue;
    }
    console.log(JSON.stringify({ msg: "scout model", provider: m.provider, model: m.id }));
    if (failed) buffered.push({ type: "error", error: failed } as TextStreamPart<T>);
    const stream = new ReadableStream<TextStreamPart<T>>({
      start(controller) {
        for (const p of buffered) controller.enqueue(p);
        if (done || failed) controller.close();
      },
      async pull(controller) {
        const next = await reader.read();
        if (next.done) controller.close();
        else controller.enqueue(next.value);
      },
      cancel(reason) {
        attempt.abort();
        return reader.cancel(reason);
      },
    });
    return { stream, model: m };
  }
  throw new Error("No Sprout model is configured.");
}

export async function aiUsage(db?: D1Database) {
  if (!db) return { available: false, windowHours: 24, limit: 5000, features: [] };
  const { results } = await db.prepare("SELECT value FROM cache WHERE key GLOB 'ai-usage:*' AND expires_at > ?1 ORDER BY created_at DESC LIMIT 5000").bind(Date.now()).all<{ value: string }>();
  const groups = new Map<string, CallRecord[]>();
  for (const row of results) {
    const call = JSON.parse(row.value) as CallRecord;
    groups.set(call.feature, [...(groups.get(call.feature) ?? []), call]);
  }
  return { available: true, windowHours: 24, limit: 5000, features: [...groups].map(([feature, calls]) => {
    const latencies = calls.map((c) => c.latencyMs).sort((a, b) => a - b);
    return { feature, calls: calls.length, failures: calls.filter((c) => c.failed).length, fallbacks: calls.filter((c) => c.fallback).length, p50LatencyMs: latencies[Math.floor((latencies.length - 1) / 2)]! };
  }).sort((a, b) => a.feature.localeCompare(b.feature)) };
}
