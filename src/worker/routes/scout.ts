// Scout: a Gemini-powered chat agent built on the Vercel AI SDK, with tool access to every
// SoilSense data source (geocoding, USDA soil + crop history, NASA POWER climate trends,
// the rotation engine, the crop catalog and plan-usage analytics).
//
// The response is an AI SDK UI message stream: the client sees the model's reasoning, each tool
// call as it starts and finishes (the "analysis"), the answer text, and the data sources used.

import { createGoogle } from "@ai-sdk/google";
import {
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
import { z } from "zod";
import { ALL_CROPS, COVERS, CROPS } from "../../engine/crops";
import { DATA_SOURCES } from "../../engine/plan";
import type { CropId, PlanResponse, Priority } from "../../shared/types";
import { lookupZip } from "../data/geo";
import type { Env } from "../env";
import { getField, isInContiguousUS, makePlan } from "../service";

export const scout = new Hono<{ Bindings: Env }>();

const DEFAULT_MODEL = "gemini-3.8-flash";
const MAX_STEPS = 8;
const MAX_HISTORY = 40;

const INSTRUCTIONS = `You are Scout, the AI field scout inside SoilSense, a climate-aware crop rotation advisor for US farms.
You can call tools that reach every SoilSense data source:
- find_location: turn a 5-digit US ZIP code into coordinates.
- get_field_data: USDA SSURGO soil and USDA Cropland Data Layer crop history for a point.
- build_rotation_plan: 35 years of NASA POWER daily climate, Mann-Kendall trend tests, and the rotation engine that scores every feasible 3-year rotation.
- get_crop_catalog: the crop and cover-crop assumptions (yields, prices, costs, nitrogen).
- get_usage_analytics: aggregate stats over plans SoilSense has generated (web and phone).

Rules:
- Use tools whenever a question depends on data. Never invent numbers; quote what the tools return and name the source (NASA POWER, USDA SSURGO, USDA CDL, USDA NASS).
- Coverage is the contiguous United States only. If the user gives a place without coordinates or a ZIP, ask for a ZIP code or lat/lon.
- If the user does not say whether a field is irrigated, assume rain-fed and say so. Default priority is "balanced".
- A climate trend is "real" only if the tool marks it significant (Mann-Kendall p < 0.05).
- Be concise and practical: short paragraphs, bullet lists, and markdown tables when comparing options. Use US units.
- This is decision support, not a guarantee: for big decisions, suggest confirming with the county extension agent.`;

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

scout.get("/status", (c) => c.json({ configured: Boolean(c.env.GEMINI_API_KEY), model: c.env.GEMINI_MODEL || DEFAULT_MODEL }));

scout.post("/chat", async (c) => {
  if (!c.env.GEMINI_API_KEY) {
    return c.json({ error: "Scout is not connected yet: set GEMINI_API_KEY (in .dev.vars locally, or `npx wrangler secret put GEMINI_API_KEY`)." }, 503);
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
  const google = createGoogle({ apiKey: env.GEMINI_API_KEY });

  const stream = createUIMessageStream({
    originalMessages: messages,
    onError: (err) => {
      console.warn(JSON.stringify({ msg: "scout chat failed", err: String(err) }));
      return err instanceof Error ? err.message : "Scout ran into a problem.";
    },
    execute: async ({ writer }) => {
      const result = streamText({
        model: google(env.GEMINI_MODEL || DEFAULT_MODEL),
        instructions: INSTRUCTIONS,
        messages: await convertToModelMessages(messages),
        tools: makeTools(env, writer),
        stopWhen: stepCountIs(MAX_STEPS),
        temperature: 0.3,
        providerOptions: { google: { thinkingConfig: { includeThoughts: true } } },
      });
      writer.merge(toUIMessageStream({ stream: result.stream, sendReasoning: true, sendSources: true }));
    },
  });

  return createUIMessageStreamResponse({ stream });
});
