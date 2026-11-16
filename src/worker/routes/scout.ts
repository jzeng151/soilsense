// Scout: a chat agent on Cloudflare Workers AI (via AI Gateway, with Gemini as backup), built on the Vercel AI SDK, with tool access to every
// SoilSense data source (geocoding, USDA soil + crop history, NASA POWER climate trends,
// the rotation engine, the crop catalog and plan-usage analytics).
//
// The response is an AI SDK UI message stream: reasoning is excluded; the client renders
// a generic pending indicator, the answer, completed tool summaries and verified data sources.

import { firstWorking, googleModel, workersModel, GENERATION_FALLBACK } from "../lib/ai";
import {
  type LanguageModel,


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
import { parseLanguage, responseLanguageInstruction, type Language } from "../../shared/language";

import { z } from "zod";
import { ALL_CROPS, COVERS, CROPS } from "../../engine/crops";
import { DATA_SOURCES } from "../../engine/plan";
import { planFertilizer } from "../../engine/fertilizer";
import { FertilizerEvidence, FERTILIZER_CITATION_RULES } from "../fertilizerFacts";
import type { CropId, PlanResponse, Priority } from "../../shared/types";
import { lookupZip } from "../data/geo";
import type { Env } from "../env";
import { getField, isInContiguousUS, makePlan } from "../service";
import { ChatFieldMemory, FIELD_MEMORY_RULES, recallFieldSchema } from "../fieldMemory";
import { checkedCitationStream } from "../research/chatStream";
import { ChatResearch, RESEARCH_CITATION_RULES, SEARCH_RESEARCH_DESCRIPTION, searchResearchSchema } from "../research/chat";

export const scout = new Hono<{ Bindings: Env }>();

const DEFAULT_MODEL = "gemini-3.8-flash";
/** Scout's default brain: an open model on Cloudflare Workers AI, routed through AI Gateway. Gemini is the fallback. */
const DEFAULT_WORKERS_MODEL = "@cf/google/gemma-4-26b-a4b-it";
const MAX_STEPS = 8;
const MAX_HISTORY = 40;

export const INSTRUCTIONS = `You are Sprout, the friendly AI field scout inside Soil Sense, a climate-aware crop rotation advisor for US farms.
You can call tools that reach every Soil Sense data source:
- find_location: turn a 5-digit US ZIP code into coordinates.
- get_field_data: USDA SSURGO soil and USDA Cropland Data Layer crop history for a point.
- build_rotation_plan: 35 years of NASA POWER daily climate, Mann-Kendall trend tests, and the rotation engine that scores every feasible 3-year rotation.
- get_crop_catalog: the crop and cover-crop assumptions (yields, prices, costs, nitrogen).
- get_usage_analytics: aggregate stats over plans Soil Sense has generated (web and phone).

Rules:
- ${RESEARCH_CITATION_RULES}
- ${FIELD_MEMORY_RULES}
- ${FERTILIZER_CITATION_RULES}
- Use tools whenever a question depends on data. Never invent numbers; quote what the tools return and name the source (NASA POWER, USDA SSURGO, USDA CDL, USDA NASS).
- Coverage is the contiguous United States only. If the user gives a place without coordinates or a ZIP, ask for a ZIP code or lat/lon.
- If the user does not say whether a field is irrigated, assume rain-fed and say so. Default priority is "balanced".
- Describe supported climate trends as changes in past weather, not a forecast or proof of cause. A statistical test does not make a trend "real" or certain.
- Use plain language: "more accumulated warmth" before "growing degree days", "a clear trend in this weather history" before statistical jargon. Lead with why the plan fits the selected water supply and priority, then its trade-off.
- Risk and reliability represent modeled stress, not observed crop failures or predictions of future failure dates. "21 years" means 21 weather years in the replay, never "in 21 years". Insurance payouts describe regional historical claims, not the chance of this field failing. State the denominator, period and scope when giving a number.
- Do not claim fewer bad years or reduced failures from rotation alone. Compare modeled stressed years only when the tool supplies both the selected plan and current-practice values, and the selected value is actually lower. Otherwise say the evidence does not establish that improvement.
- Use Unicode arrows (→), not LaTex. Separate headings and lists with newlines. Never output a thought process, internal deliberation or tool-call narration.
- Cite only IDs returned by tools this turn: plan fact IDs, research R IDs, history F IDs and fertilizer G IDs. Name the source in prose when possible. Never invent [soil] or another citation ID. Research about fallow water storage is trial-specific, not a measured percentage for this field.
- Finish the explanation with a complete sentence. Prefer a short complete answer over a long technical answer.
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
export function compactPlan(p: PlanResponse, fertilizer = new FertilizerEvidence()) {
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
      badYearsIn10: r.badYearsIn10,
      riskMeaning: "Modeled severe stress in historical weather replay; not observed harvest failures or a forecast.",
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
      fertilizerFacts: fertilizer.add(planFertilizer(r, p)),
    })),
    currentPractice: p.currentPractice ? { badYearsIn10: p.currentPractice.badYearsIn10, label: p.currentPractice.label, scores: p.currentPractice.scores, avgNetReturnPerAcre: p.currentPractice.avgNetReturnPerAcre } : null,
    facts: p.facts.map(({ id, kind, text, source, significant }) => ({ id, kind, text, source, significant })),
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

export function makeTools(env: Env, writer: UIMessageStreamWriter, research: ChatResearch, memory = new ChatFieldMemory(env), language: Language = "en", fertilizer = new FertilizerEvidence()) {
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
    recall_field_history: tool({
      description: "Recall dated public demo field history (not current conditions). field_id: story-ia, champaign-il, finney-ks, lancaster-ne. Returns deterministic summaries, original record ids, dates and F citation ids; cite [F1].",
      inputSchema: recallFieldSchema,
      execute: input => memory.recall(input),
    }),
    search_research: tool({
      description: SEARCH_RESEARCH_DESCRIPTION,
      inputSchema: searchResearchSchema,
      execute: async (input) => {
        const result = await research.search(input);
        writer.write({ type: "data-research-status", data: { status: result.status, reason: result.reason } });
        return result;
      },
    }),
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
        const plan = await makePlan(env, { ...c, irrigated: irrigated === true, priority: priority ?? "balanced", language, recentCrops: recent_crops?.length ? recent_crops : undefined });
        cite("build_rotation_plan");
        writer.write({ type: "data-plan-facts", data: plan.facts.map(({ id, text, source }) => ({ id, text, source })) });
        return compactPlan(plan, fertilizer);
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
  return c.json({ configured: models.length > 0, model: models[0]?.id ?? null, provider: models[0]?.provider ?? null, fallback: models[1]?.id ?? null, research: c.env.AI && c.env.RESEARCH_INDEX ? "configured" : "unavailable" });
});

scout.post("/chat", async (c) => {
  // Scout is public: cap each visitor so nobody can run up the Gemini bill.
  if (!(await underScoutLimit(c.env, c.req.header("CF-Connecting-IP") ?? "unknown"))) {
    return c.json({ error: "You're sending messages quickly. Please wait a minute and try again." }, 429);
  }
  if (scoutModels(c.env).length === 0) {
    return c.json({ error: "Sprout is not connected yet: add the Workers AI binding or set GEMINI_API_KEY." }, 503);
  }
  let body: { messages?: UIMessage[]; language?: unknown };
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
      // Trust only tool results produced server-side this turn, never client-supplied tool history.
      const research = new ChatResearch({ ai: env.AI, index: env.RESEARCH_INDEX, db: env.DB, gatewayId: env.AI_GATEWAY_ID });
      const memory = new ChatFieldMemory(env);
      const language = parseLanguage(body.language);
      const fertilizer = new FertilizerEvidence();
      const tools = makeTools(env, writer, research, memory, language, fertilizer);
      const { stream, model } = await firstWorking(candidates, (m, signal) =>
        streamText({
          model: m.model,
          abortSignal: signal,
          instructions: `${INSTRUCTIONS}
${responseLanguageInstruction(language)}`,
          messages: modelMessages,
          tools,
          stopWhen: stepCountIs(MAX_STEPS),
          temperature: 0.3,
          maxRetries: 0,
          maxOutputTokens: 2000,
          ...(m.provider === "gemini" ? { providerOptions: { google: { thinkingConfig: { includeThoughts: false } } } } : {}),
        }).stream,
      );
      writer.merge(
        checkedCitationStream(toUIMessageStream({
          stream,
          sendReasoning: false,
          sendSources: true,
          // Which model answered (shown under the reply; Workers AI first, Gemini as backup).
          messageMetadata: ({ part }) => (part.type === "start" ? { model: model.id, provider: model.provider } : undefined),
        }), research, memory, fertilizer),
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
  const wanted = env.SCOUT_MODEL || DEFAULT_WORKERS_MODEL;
  const wa = (id: string, fallback: boolean): ScoutModel[] => (env.AI ? [{ provider: "workers-ai", id, model: workersModel(env, id, "scout", fallback) }] : []);
  const gm = (id: string, fallback: boolean): ScoutModel[] => (env.GEMINI_API_KEY && env.AI ? [{ provider: "gemini", id, model: googleModel(env, id, "scout", fallback) }] : []);
  return wanted.startsWith("@cf/")
    ? [...wa(wanted, false), ...(wanted === GENERATION_FALLBACK ? [] : wa(GENERATION_FALLBACK, true)), ...gm(env.GEMINI_MODEL || DEFAULT_MODEL, true)]
    : [...gm(wanted, false), ...wa(DEFAULT_WORKERS_MODEL, true)];
}

export { firstWorking } from "../lib/ai";
