// Scout: a chat agent on Cloudflare Workers AI (via AI Gateway, with Gemini as backup), built on the Vercel AI SDK, with tool access to every
// SoilSense data source (geocoding, USDA soil + crop history, NASA POWER climate trends,
// the rotation engine, the crop catalog and plan-usage analytics).
//
// The response is an AI SDK UI message stream: the client sees the model's reasoning, each tool
// call as it starts and finishes (the "analysis"), the answer text, and the data sources used.

import { createGoogle } from "@ai-sdk/google";
import {
  type LanguageModel,
  type TextStreamPart,
  type ToolSet,
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  stepCountIs,
  streamText,
  tool,
  toUIMessageStream,
  type UIMessage,
  type UIMessageStreamWriter,
} from "ai";
import { Hono } from "hono";
import { createWorkersAI } from "workers-ai-provider";
import { z } from "zod";
import { ALL_CROPS, COVERS, CROPS } from "../../engine/crops";
import { DATA_SOURCES } from "../../engine/plan";
import type { CropId, PlanResponse, Priority } from "../../shared/types";
import { lookupZip } from "../data/geo";
import type { Env } from "../env";
import { getField, isInContiguousUS, makePlan } from "../service";

export const scout = new Hono<{ Bindings: Env }>();

const DEFAULT_MODEL = "gemini-3.8-flash";
/** Scout's default brain: an open model on Cloudflare Workers AI, routed through AI Gateway. Gemini is the fallback. */
const DEFAULT_WORKERS_MODEL = "@cf/google/gemma-4-26b-a4b-it";
const MAX_STEPS = 8;
const MAX_HISTORY = 40;

const INSTRUCTIONS = `You are Sprout, the friendly AI field scout inside Soil Sense, a climate-aware crop rotation advisor for US farms.
You can call tools that reach every Soil Sense data source:
- find_location: turn a 5-digit US ZIP code into coordinates.
- get_field_data: USDA SSURGO soil and USDA Cropland Data Layer crop history for a point.
- build_rotation_plan: 35 years of NASA POWER daily climate, Mann-Kendall trend tests, and the rotation engine that scores every feasible 3-year rotation.
- get_crop_catalog: the crop and cover-crop assumptions (yields, prices, costs, nitrogen).
- get_usage_analytics: aggregate stats over plans Soil Sense has generated (web and phone).

Rules:
- Use tools whenever a question depends on data. Never invent numbers; quote what the tools return and name the source (NASA POWER, USDA SSURGO, USDA CDL, USDA NASS).
- Coverage is the contiguous United States only. If the user gives a place without coordinates or a ZIP, ask for a ZIP code or lat/lon.
- If the user does not say whether a field is irrigated, assume rain-fed and say so. Default priority is "balanced".
- A climate trend is "real" only if the tool marks it significant (Mann-Kendall p < 0.05).
- Be concise and practical: short paragraphs, bullet lists, and markdown tables when comparing options. Use US units.
- If someone asks your name, you are Sprout.
- This is decision support, not a guarantee: remind the user to check the numbers in their plan before acting on them.`;

const PRIORITIES = ["balanced", "profit", "soil", "risk"] as const satisfies readonly Priority[];

// ---------- Sources: which public datasets each tool reads ----------

const src = (name: string) => DATA_SOURCES.find((d) => d.name.startsWith(name));
const SOURCES_BY_TOOL: Record<string, { name: string; url: string }[]> = {
  find_location: [{ name: "Zippopotam.us ZIP code lookup", url: "https://www.zippopotam.us/" }],
  get_field_data: [src("FCC Area API"), src("USDA NRCS SSURGO"), src("USDA NASS Cropland")].filter((x): x is { name: string; url: string; usedFor: string } => !!x),
  build_rotation_plan: DATA_SOURCES.filter((d) => !d.name.startsWith("NASA GIBS")),
  get_crop_catalog: [
    { name: "Iowa State University Extension: Ag Decision Maker", url: "https://www.extension.iastate.edu/agdm/" },
    { name: "USDA NRCS Cover Crop guidance", url: "https://www.nrcs.usda.gov/conservation-basics/natural-resource-concerns/soil/cover-crops" },
  ],
  get_usage_analytics: [],
};

// ---------- Helpers ----------

const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

function coords(lat: number, lon: number): { lat: number; lon: number } {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error("lat and lon must be numbers");
  if (!isInContiguousUS(lat, lon)) throw new Error("Location is outside the contiguous United States, which SoilSense covers.");
  return { lat: round(lat, 5), lon: round(lon, 5) };
}

/** Plans are large (daily series etc.); hand the model a compact, fact-dense version. */
function compactPlan(p: PlanResponse) {
  return {
    location: p.location,
    soil: p.soil,
    cropHistory: p.cropHistory.years.map((y) => `${y.year}: ${y.cdlName}`),
    climate: {
      period: `${p.climate.firstYear}-${p.climate.lastYear}`,
      source: p.climate.source,
      indicators: p.climate.indicators.map((i) => ({
        label: i.label,
        unit: i.unit,
        mean: round(i.mean),
        changePerDecade: round(i.changePerDecade),
        verdict: i.trend.verdict,
        pValue: round(i.trend.pValue, 4),
      })),
    },
    rankedPlans: p.plans.map((r) => ({
      label: r.label,
      scores: r.scores,
      avgNetReturnPerAcre: r.avgNetReturnPerAcre,
      totalNitrogenLbPerAcre: r.totalNitrogenLbPerAcre,
      years: r.years.map((y) => ({
        year: y.year,
        crop: y.cropName,
        cover: y.coverName,
        expectedYield: `${y.expectedYield} ${y.yieldUnit}`,
        reliability: round(y.reliability),
        mainStress: y.mainStress,
        nitrogenLbPerAcre: y.nitrogenLbPerAcre,
        netReturnPerAcre: y.netReturnPerAcre,
      })),
      notes: r.notes,
    })),
    currentPractice: p.currentPractice ? { label: p.currentPractice.label, scores: p.currentPractice.scores, avgNetReturnPerAcre: p.currentPractice.avgNetReturnPerAcre } : null,
    facts: p.facts.map((f) => `[${f.kind}${f.significant ? ", significant" : ""}] ${f.text} (${f.source})`),
    summary: p.explanation.summary,
    assumptions: p.assumptions,
  };
}

async function usageAnalytics(env: Env, days: number) {
  if (!env.DB) return { available: false, note: "No database is configured, so there is no plan history to analyze." };
  const since = Date.now() - Math.max(1, Math.min(365, days)) * 86_400_000;
  const [totals, byPriority, topPlans, recent] = await Promise.all([
    env.DB.prepare("SELECT channel, COUNT(*) AS plans, SUM(irrigated) AS irrigated, SUM(sms_sent) AS sms_sent, AVG(total_score) AS avg_score FROM plan_log WHERE created_at >= ?1 GROUP BY channel")
      .bind(since)
      .all(),
    env.DB.prepare("SELECT priority, COUNT(*) AS plans FROM plan_log WHERE created_at >= ?1 GROUP BY priority ORDER BY plans DESC").bind(since).all(),
    env.DB.prepare("SELECT top_plan, COUNT(*) AS times, AVG(total_score) AS avg_score FROM plan_log WHERE created_at >= ?1 AND top_plan IS NOT NULL GROUP BY top_plan ORDER BY times DESC LIMIT 8")
      .bind(since)
      .all(),
    env.DB.prepare("SELECT created_at, channel, place, lat, lon, priority, top_plan FROM plan_log WHERE created_at >= ?1 ORDER BY created_at DESC LIMIT 10").bind(since).all(),
  ]);
  return {
    available: true,
    windowDays: days,
    totalPlans: totals.results.reduce((s, r) => s + Number(r.plans ?? 0), 0),
    byChannel: totals.results,
    byPriority: byPriority.results,
    mostRecommended: topPlans.results,
    recent: recent.results.map((r) => ({ ...r, created_at: new Date(Number(r.created_at)).toISOString() })),
  };
}

// ---------- Tools (AI SDK) ----------

function makeTools(env: Env, writer: UIMessageStreamWriter) {
  const cited = new Set<string>();
  /** Emit each dataset a tool actually used as a source part (once per answer). */
  const cite = (toolName: string) => {
    for (const s of SOURCES_BY_TOOL[toolName] ?? []) {
      if (cited.has(s.url)) continue;
      cited.add(s.url);
      writer.write({ type: "source-url", sourceId: s.url, url: s.url, title: s.name });
    }
  };

  return {
    find_location: tool({
      description: "Look up a US 5-digit ZIP code and return its place name, state, latitude and longitude.",
      inputSchema: z.object({ zip: z.string().describe("5-digit US ZIP code") }),
      execute: async ({ zip }) => {
        const place = await lookupZip(env.DB, zip.trim());
        if (!place) throw new Error(`ZIP code ${zip} was not found. Ask the user for a valid 5-digit US ZIP or lat/lon.`);
        cite("find_location");
        return place;
      },
    }),
    get_field_data: tool({
      description:
        "Get county, USDA SSURGO soil profile (pH, organic matter, clay, drainage, water capacity) and USDA Cropland Data Layer crop history for a point.",
      inputSchema: z.object({ lat: z.number(), lon: z.number() }),
      execute: async ({ lat, lon }) => {
        const c = coords(lat, lon);
        const field = await getField(env, c.lat, c.lon);
        cite("get_field_data");
        return field;
      },
    }),
    build_rotation_plan: tool({
      description:
        "Run the full SoilSense analysis for a field: NASA POWER climate trends since 1991 with significance tests, soil, crop history, county yields, and the ranked 3-year crop rotations with scores, yields, nitrogen and net return.",
      inputSchema: z.object({
        lat: z.number(),
        lon: z.number(),
        irrigated: z.boolean().optional().describe("true if the field is irrigated; default false"),
        priority: z.enum(PRIORITIES).optional().describe("What the farmer cares about most; default balanced"),
        recent_crops: z
          .array(z.enum(ALL_CROPS as [CropId, ...CropId[]]))
          .max(3)
          .optional()
          .describe("Optional: crops grown in the last 1-3 seasons, most recent last."),
      }),
      execute: async ({ lat, lon, irrigated, priority, recent_crops }) => {
        const c = coords(lat, lon);
        const plan = await makePlan(env, { ...c, irrigated: irrigated === true, priority: priority ?? "balanced", recentCrops: recent_crops?.length ? recent_crops : undefined });
        cite("build_rotation_plan");
        return compactPlan(plan);
      },
    }),
    get_crop_catalog: tool({
      description: "List the crops and cover crops SoilSense models, with base yields, prices, costs, nitrogen needs and soil preferences.",
      inputSchema: z.object({}),
      execute: async () => {
        cite("get_crop_catalog");
        return {
          crops: Object.values(CROPS).map((c) => ({
            id: c.id,
            name: c.name,
            legume: c.legume,
            perennial: c.perennial,
            baseYield: `${c.baseYield} ${c.yieldUnit}`,
            pricePerUnit: c.pricePerUnit,
            costPerAcre: c.costPerAcre,
            nitrogen: c.nitrogen,
            waterNeedMm: c.waterNeedMm,
            minPh: c.minPh,
            toleratesPoorDrainage: c.toleratesPoorDrainage,
          })),
          covers: Object.values(COVERS),
        };
      },
    }),
    get_usage_analytics: tool({
      description: "Aggregate analytics over rotation plans SoilSense has generated: totals by channel and priority, most recommended plans, recent places.",
      inputSchema: z.object({ days: z.number().optional().describe("Look-back window in days; default 30") }),
      execute: async ({ days }) => {
        const out = await usageAnalytics(env, days ?? 30);
        writer.write({ type: "source-document", sourceId: "soilsense-plan-log", mediaType: "text/plain", title: "SoilSense plan log (D1 database)" });
        return out;
      },
    }),
  };
}

// ---------- Routes ----------

/** Messages allowed per visitor (IP) per minute. */
const SCOUT_PER_MINUTE = 20;

/** Per-visitor limit. The Cloudflare binding counts per location, so a D1 counter backs it up. Fails open. */
async function underScoutLimit(env: Env, ip: string): Promise<boolean> {
  if (env.SCOUT_LIMITER) {
    const { success } = await env.SCOUT_LIMITER.limit({ key: ip }).catch(() => ({ success: true }));
    if (!success) return false;
  }
  if (!env.DB) return true;
  const minute = Math.floor(Date.now() / 60000);
  try {
    const row = await env.DB.prepare(
      "INSERT INTO cache (key, value, expires_at, created_at) VALUES (?1, '1', ?2, ?3) ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + 1 RETURNING value",
    )
      .bind(`ratelimit:scout:${ip}:${minute}`, (minute + 2) * 60000, Date.now())
      .first<{ value: string }>();
    return Number(row?.value ?? 0) <= SCOUT_PER_MINUTE;
  } catch {
    return true;
  }
}

scout.get("/status", (c) => {
  const models = scoutModels(c.env);
  return c.json({ configured: models.length > 0, model: models[0]?.id ?? null, provider: models[0]?.provider ?? null, fallback: models[1]?.id ?? null });
});

scout.post("/chat", async (c) => {
  // Scout is public: cap each visitor so nobody can run up the Gemini bill.
  if (!(await underScoutLimit(c.env, c.req.header("CF-Connecting-IP") ?? "unknown"))) {
    return c.json({ error: "You're sending messages quickly. Please wait a minute and try again." }, 429);
  }
  if (scoutModels(c.env).length === 0) {
    return c.json({ error: "Sprout is not connected yet: add the Workers AI binding or set GEMINI_API_KEY." }, 503);
  }
  let body: { messages?: UIMessage[] };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }
  const messages = Array.isArray(body.messages) ? body.messages.slice(-MAX_HISTORY) : [];
  if (!messages.length || messages[messages.length - 1]?.role !== "user") return c.json({ error: "The last message must be from the user." }, 400);

  const env = c.env;
  const candidates = scoutModels(env);

  const stream = createUIMessageStream({
    originalMessages: messages,
    onError: (err) => {
      console.warn(JSON.stringify({ msg: "scout chat failed", err: String(err) }));
      return err instanceof Error ? err.message : "Sprout ran into a problem.";
    },
    execute: async ({ writer }) => {
      const modelMessages = await convertToModelMessages(messages);
      const tools = makeTools(env, writer);
      const { stream, model } = await firstWorking(candidates, (m) =>
        streamText({
          model: m.model,
          instructions: INSTRUCTIONS,
          messages: modelMessages,
          tools,
          stopWhen: stepCountIs(MAX_STEPS),
          temperature: 0.3,
          ...(m.provider === "gemini" ? { providerOptions: { google: { thinkingConfig: { includeThoughts: true } } } } : {}),
        }).stream,
      );
      writer.merge(
        toUIMessageStream({
          stream,
          sendReasoning: true,
          sendSources: true,
          // Which model answered (shown under the reply; Workers AI first, Gemini as backup).
          messageMetadata: ({ part }) => (part.type === "start" ? { model: model.id, provider: model.provider } : undefined),
        }),
      );
    },
  });

  return createUIMessageStreamResponse({ stream });
});

interface ScoutModel {
  provider: "workers-ai" | "gemini";
  id: string;
  model: LanguageModel;
}

/** Models to try in order: SCOUT_MODEL decides the first (a "@cf/..." Workers AI model, or a Gemini model); the other provider backs it up. */
export function scoutModels(env: Env): ScoutModel[] {
  const workers = env.AI ? createWorkersAI({ binding: env.AI, gateway: { id: env.AI_GATEWAY_ID ?? "default" } }) : null;
  const google = env.GEMINI_API_KEY ? createGoogle({ apiKey: env.GEMINI_API_KEY }) : null;
  const wanted = env.SCOUT_MODEL || DEFAULT_WORKERS_MODEL;
  const wa = (id: string): ScoutModel[] => (workers ? [{ provider: "workers-ai", id, model: workers(id as Parameters<typeof workers>[0]) }] : []);
  const gm = (id: string): ScoutModel[] => (google ? [{ provider: "gemini", id, model: google(id) }] : []);
  return wanted.startsWith("@cf/") ? [...wa(wanted), ...gm(env.GEMINI_MODEL || DEFAULT_MODEL)] : [...gm(wanted), ...wa(DEFAULT_WORKERS_MODEL)];
}

/** Parts that mean the model has started answering (after these, an error is shown rather than retried). */
const CONTENT_PARTS = new Set(["text-delta", "reasoning-delta", "tool-input-start", "tool-call", "tool-result"]);
/** A model that says nothing for this long counts as failed, so the next one gets a turn (not for the last model). */
const FIRST_CONTENT_TIMEOUT_MS = 25_000;

/**
 * Start the first model whose stream gets going: if a model fails or stays silent before producing anything
 * (quota, outage, unsupported model, hang), try the next one. The parts read while checking are replayed.
 */
export async function firstWorking<T extends ToolSet>(
  models: ScoutModel[],
  start: (m: ScoutModel) => ReadableStream<TextStreamPart<T>>,
  timeoutMs = FIRST_CONTENT_TIMEOUT_MS,
): Promise<{ stream: ReadableStream<TextStreamPart<T>>; model: ScoutModel }> {
  for (let i = 0; i < models.length; i++) {
    const m = models[i] as ScoutModel;
    const last = i === models.length - 1;
    const reader = start(m).getReader();
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
        const next = last ? await reader.read() : await Promise.race([reader.read(), timeout]);
        if (timer !== undefined) clearTimeout(timer);
        if (next === "timeout") {
          failed = `no answer within ${Math.round(timeoutMs / 1000)} s`;
          break;
        }
        if (next.done) {
          done = true;
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
    if (failed && !last) {
      console.warn(JSON.stringify({ msg: "scout model failed, trying next", provider: m.provider, model: m.id, err: String(failed) }));
      reader.cancel().catch(() => {});
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
        return reader.cancel(reason);
      },
    });
    return { stream, model: m };
  }
  throw new Error("No Sprout model is configured.");
}
