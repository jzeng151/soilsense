import { generateAI, type AiRunner } from "../lib/ai";
import { Hono, type Handler, type MiddlewareHandler } from "hono";
import { ALL_CROPS } from "../../engine/crops";
import { hasMeasurements, validateMeasurements } from "../../shared/measurements";
import { GOALS, type CropId, type Goal, type PlanRequest, type Priority } from "../../shared/types";
import { currentUser } from "../lib/auth";
import { UpstreamError } from "../lib/http";
import { getSecondOpinion } from "../data/kstate";
import { getField, isInContiguousUS, logPlan, makePlan } from "../service";
import { auth, type AppEnv } from "./auth";
import { fieldWatch } from "./fieldwatch";
import { scout } from "./scout";
import { research } from "./research";
import { docs } from "./docs";

const PRIORITIES: Priority[] = ["profit", "soil", "risk", "balanced"];

import { smap } from "./smap";

export const api = new Hono<AppEnv>();

import { cropTiming } from "./cropTiming";

// ---- Simple per-isolate rate limit (use Cloudflare rate-limiting rules for hard limits). ----
const hits = new Map<string, { count: number; reset: number }>();
function rateLimited(ip: string, limit = 40, windowMs = 60_000): boolean {
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || h.reset < now) {
    hits.set(ip, { count: 1, reset: now + windowMs });
    if (hits.size > 5000) hits.clear();
    return false;
  }
  h.count += 1;
  return h.count > limit;
}

api.use("*", async (c, next) => {
  c.header("Access-Control-Allow-Origin", "*");
  c.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  c.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (c.req.method === "OPTIONS") return c.body(null, 204);
  const ip = c.req.header("CF-Connecting-IP") ?? "local";
  if (c.req.method === "POST" && rateLimited(ip)) return c.json({ error: "Too many requests. Try again in a minute." }, 429);
  await next();
});

// ---- Accounts: sign up / sign in / sign out, then require a signed-in user for the dashboard's data routes. ----
api.route("/auth", auth);
api.route("/docs", docs);

function adminTokenMatches(header: string | undefined, token: string | undefined): boolean {
  if (!token || !header) return false;
  const given = header.replace(/^Bearer\s+/i, "");
  if (given.length !== token.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ token.charCodeAt(i);
  return diff === 0;
}

/**
 * Sign-in gate for data routes. Off: the planner, Scout and the field lookup are public so anyone (judges,
 * farmers) can use them without an account; the per-IP POST rate limit above still applies. Settings
 * (/api/admin/*) stays protected separately. To require accounts again, set REQUIRE_SIGN_IN to true.
 */
const REQUIRE_SIGN_IN = false;
const requireUser: MiddlewareHandler<AppEnv> = async (c, next) => {
  // Scripts (e.g. scripts/prefetch-demo.mjs) may use the ADMIN_TOKEN instead of a session.
  if (adminTokenMatches(c.req.header("Authorization"), c.env.ADMIN_TOKEN)) return next();
  if (!(await currentUser(c))) return c.json({ error: "Sign in to continue." }, 401);
  await next();
};
if (REQUIRE_SIGN_IN) for (const path of ["/field", "/plan", "/ask", "/scout/*", "/fieldwatch/*"]) api.use(path, requireUser);

function parseCoords(lat: unknown, lon: unknown): { lat: number; lon: number } | string {
  const la = Number(lat);
  const lo = Number(lon);
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return "lat and lon must be numbers";
  if (!isInContiguousUS(la, lo)) return "SoilSense covers the contiguous United States (USDA crop and soil maps are US-only).";
  return { lat: Math.round(la * 1e6) / 1e6, lon: Math.round(lo * 1e6) / 1e6 };
}

export function validatePlanRequest(body: unknown): PlanRequest | string {
  if (!body || typeof body !== "object") return "JSON body required";
  const b = body as Record<string, unknown>;
  const coords = parseCoords(b.lat, b.lon);
  if (typeof coords === "string") return coords;
  const priority = (b.priority ?? "balanced") as Priority;
  if (!PRIORITIES.includes(priority)) return `priority must be one of ${PRIORITIES.join(", ")}`;
  let recentCrops: CropId[] | undefined;
  if (b.recentCrops !== undefined) {
    if (!Array.isArray(b.recentCrops) || b.recentCrops.length > 3) return "recentCrops must be an array of up to 3 crops";
    for (const c of b.recentCrops) if (!ALL_CROPS.includes(c as CropId)) return `unknown crop: ${String(c)}`;
    recentCrops = b.recentCrops as CropId[];
  }
  let goals: Goal[] | undefined;
  if (b.goals !== undefined) {
    if (!Array.isArray(b.goals) || b.goals.length > 2) return "goals must be an array of up to 2 distinct goals";
    for (const g of b.goals) if (!GOALS.includes(g as Goal)) return `unknown goal: ${String(g)}`;
    if (new Set(b.goals).size !== b.goals.length) return "goals must be distinct";
    goals = b.goals as Goal[];
  }
  const language = b.language === "es" ? "es" : "en";
  // Water beyond rain: "rain" | "limited" | "full". Older clients send only `irrigated`.
  if (b.water !== undefined && b.water !== "rain" && b.water !== "limited" && b.water !== "full") return 'water must be "rain", "limited" or "full"';
  const water = (b.water as "rain" | "limited" | "full" | undefined) ?? (b.irrigated === true ? "full" : "rain");
  const measurements = validateMeasurements(b);
  if (typeof measurements === "string") return measurements;
  return { ...coords, irrigated: water !== "rain", water, priority, recentCrops, language, ...measurements, ...(goals !== undefined ? { goals } : {}) };
}

function upstreamMessage(err: unknown): { status: 502 | 500; body: { error: string; detail?: string } } {
  if (err instanceof UpstreamError)
    return { status: 502, body: { error: `A data service is not responding (${err.service}). Please try again shortly.`, detail: err.message } };
  console.error(JSON.stringify({ msg: "unhandled", err: String(err), stack: err instanceof Error ? err.stack : undefined }));
  return { status: 500, body: { error: "Something went wrong building the plan." } };
}

api.get("/health", (c) => c.json({ ok: true, service: "soilsense", db: Boolean(c.env.DB), ai: Boolean(c.env.AI), twilio: Boolean(c.env.TWILIO_AUTH_TOKEN) }));

api.get("/field", async (c) => {
  const coords = parseCoords(c.req.query("lat"), c.req.query("lon"));
  if (typeof coords === "string") return c.json({ error: coords }, 400);
  try {
    return c.json(await getField(c.env, coords.lat, coords.lon));
  } catch (err) {
    const e = upstreamMessage(err);
    return c.json(e.body, e.status);
  }
});

// Kansas only: K-State's recommended rain-fed rotations for the county, ranked by our team's separate Kansas model
// (published weekly to Cloudflare R2). 404 when there is nothing to show, so the page simply hides the box.
api.get("/second-opinion", async (c) => {
  const fips = c.req.query("fips") ?? "";
  if (!/^\d{5}$/.test(fips)) return c.json({ error: "fips must be a 5-digit county code" }, 400);
  const opinion = await getSecondOpinion(c.env.DB, fips);
  if (!opinion) return c.json({ error: "No second opinion for this county" }, 404);
  c.header("Cache-Control", "public, max-age=3600");
  return c.json(opinion);
});

api.post("/plan", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }
  const req = validatePlanRequest(body);
  if (typeof req === "string") return c.json({ error: req }, 400);
  try {
    const started = Date.now();
    const plan = await makePlan(c.env, req);
    c.executionCtx.waitUntil(logPlan(c.env, { channel: "web", plan }));
    c.header("Server-Timing", `plan;dur=${Date.now() - started}`);
    if (hasMeasurements(req)) c.header("Cache-Control", "private, no-store");
    return c.json(plan);
  } catch (err) {
    const e = upstreamMessage(err);
    return c.json(e.body, e.status);
  }
});

// ---- "Ask about this plan": answers grounded only in the plan's own facts. ----
interface AskBody {
  question?: string;
  planLabel?: string;
  facts?: string[];
  summary?: string;
}

function fallbackAnswer(question: string, facts: string[]): string {
  const words = question.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
  const scored = facts
    .map((f) => ({ f, s: words.filter((w) => f.toLowerCase().includes(w)).length }))
    .sort((a, b) => b.s - a.s);
  const best = scored.filter((x) => x.s > 0).slice(0, 2).map((x) => x.f);
  return best.length
    ? best.join(" ")
    : "I can only answer from this plan's data. Try asking about rain, heat, frost, soil, nitrogen, cover crops or a specific crop.";
}

api.post("/ask", async (c) => {
  let body: AskBody;
  try {
    body = await c.req.json<AskBody>();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }
  const question = String(body.question ?? "").trim().slice(0, 500);
  const facts = (Array.isArray(body.facts) ? body.facts : []).map((f) => String(f).slice(0, 400)).slice(0, 30);
  if (!question) return c.json({ error: "question required" }, 400);

  if (c.env.AI) {
    try {
      const system =
        "You are SoilSense, a farm rotation assistant. Answer the farmer's question in 2-4 plain sentences using ONLY the facts provided. " +
        "If the facts do not answer it, say so and suggest asking their county extension agent. Never invent numbers, prices, or guarantees. Use US units.";
      const user = `Recommended plan: ${String(body.planLabel ?? "").slice(0, 200)}\nSummary: ${String(body.summary ?? "").slice(0, 800)}\nFacts:\n- ${facts.join("\n- ")}\n\nQuestion: ${question}`;
      // Routed through Cloudflare AI Gateway (logs, analytics, caching). "default" is created automatically on first use.
      const out = (await generateAI(c.env.AI as unknown as AiRunner,
        { messages: [{ role: "system", content: system }, { role: "user", content: user }], max_tokens: 300, temperature: 0.2 },
        { feature: "plan-ask", gatewayId: c.env.AI_GATEWAY_ID, db: c.env.DB, timeoutMs: 12_000 },
        c.env.AI_MODEL,
      )).output as { response?: string };
      if (out?.response) return c.json({ answer: out.response.trim(), source: "workers-ai" });
    } catch (err) {
      console.warn(JSON.stringify({ msg: "workers ai failed", err: String(err) }));
    }
  }
  return c.json({ answer: fallbackAnswer(question, facts), source: "facts" });
});

api.get("/logs", async (c) => {
  if (c.env.ADMIN_TOKEN && c.req.header("Authorization") !== `Bearer ${c.env.ADMIN_TOKEN}`) return c.json({ error: "unauthorized" }, 401);
  if (!c.env.DB) return c.json({ logs: [] });
  const limit = Math.min(100, Math.max(1, Number(c.req.query("limit") ?? 25)));
  const { results } = await c.env.DB.prepare(
    "SELECT id, created_at, channel, caller_masked, place, lat, lon, irrigated, priority, recent_crops, top_plan, total_score, sms_sent FROM plan_log ORDER BY created_at DESC LIMIT ?1",
  )
    .bind(limit)
    .all();
  return c.json({ logs: results });
});

// Scout chat agent (Gemini). Mounted here so CORS + rate limiting apply.
api.route("/scout", scout);
// Field Watch: background field checks (Cron Trigger) and their saved results.
api.route("/fieldwatch", fieldWatch);


// Additive stretch evidence endpoint: never blocks plan construction.
const vegetation: Handler<AppEnv> = async (c) => {
  const coords = parseCoords(c.req.query("lat"), c.req.query("lon"));
  const year = Number(c.req.query("year"));
  if (typeof coords === "string") return c.json({ error: coords }, 400);
  if (!Number.isInteger(year) || year < 2001 || year >= new Date().getUTCFullYear()) return c.json({ error: "year must be a completed year from 2001 onward" }, 400);
  const { getModisNdvi } = await import("../data/modis");
  return c.json(await getModisNdvi(c.env.DB, coords.lat, coords.lon, year));
};
api.get("/vegetation", vegetation);
api.post("/vegetation/prefetch", async (c, next) => {
  if (!adminTokenMatches(c.req.header("Authorization"), c.env.ADMIN_TOKEN)) return c.json({ error: "Admin token required" }, 401);
  await next();
}, vegetation);

// Cited research retrieval (Vectorize) and grounded explanations (Workers AI): see docs/RESEARCH.md.
api.route("/research", research);
api.route("/crop-timing", cropTiming);
// U.S. Drought Monitor weekly county context (issue #31): /api/usdm/category, /timeline, /replay.
import { usdm } from "./usdm";
api.route("/usdm", usdm);
// Wind-erosion exposure screen (issues #40, #17): POST /api/wind-screen. Separate from /api/plan so plans never wait on it.
import { windScreen } from "./windScreen";
api.route("/wind-screen", windScreen);

// Versioned static source audit; no live market quotation or effect on rankings.
api.get("/economics-assumptions", async (c) => {
  const { assumptionAudit } = await import("../../engine/economics");
  const state = c.req.query("state");
  if (state !== undefined && !/^[A-Z]{2}$/.test(state)) return c.json({ error: "state must be a two-letter uppercase code" }, 400);
  return c.json(assumptionAudit(state));
});
import { historicalScenarios } from "./historicalScenarios";
api.route("/historical-scenarios", historicalScenarios);
api.route("/smap", smap);
import { groundwater } from "./groundwater";
api.route("/groundwater", groundwater);
