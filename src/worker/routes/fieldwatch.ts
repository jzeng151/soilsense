// Field Watch API.
//   GET  /api/fieldwatch/latest           → latest result per watched field + when the cron last ran
//   GET  /api/fieldwatch/runs?field=&limit → run history (newest first)
//   POST /api/fieldwatch/run              → "Run check now" (60 s cooldown; same access rules as the planner)
//   GET  /api/fieldwatch/agent/options    → fields and replay windows the scheduled check accepts
//   POST /api/fieldwatch/agent/:field/check { mode: "live" | "replay", replayId? } → schedule one check ~45 s ahead
//   GET  /api/fieldwatch/agent/:field/runs → that field's scheduled checks and results (from its FieldAgent)
//   GET  /api/fieldwatch/agent/:field/watch → recurring watch settings (weekly + crop window), next runs, recent results
//   PUT  /api/fieldwatch/agent/:field/watch { enabled?: boolean, crop?: CropId | null } → change them

import { Hono, type Context } from "hono";
import { REGISTERED_ID } from "../fieldwatch/registration";
import { fieldRequestAllowed } from "../fieldwatch/fieldLimit";
import { getAgentByName } from "agents";
import { CHECK_DELAY_SECONDS, REPLAY_PRESETS, type AgentRun } from "../fieldwatch/agentCore";
import { FRESH_DAYS, WATCHABLE_CROPS, WEEKLY_DESCRIPTION } from "../fieldwatch/watchCore";
import type { FieldAgent } from "../fieldwatch/agent";
import { RULE_TEXT, THRESHOLDS } from "../fieldwatch/rule";
import { latestRuns, runFieldWatch, runHistory, WATCHED_FIELDS } from "../fieldwatch/run";
import type { AppEnv } from "./auth";

export const fieldWatch = new Hono<AppEnv>();

export const CRON_SCHEDULE = "17 * * * *";
const COOLDOWN_MS = 60_000;
let lastManualRun = 0; // per isolate; D1 is checked too

const noDb = { error: "Field Watch needs the database. Run the D1 migrations (0004_field_watch.sql), then try again." };
const migrationHint = (err: unknown) => (/no such table/i.test(String(err)) ? noDb : null);

fieldWatch.use("*", async (c, next) => {
  c.header("Cache-Control", "no-store");
  await next();
});

const about = {
  rule: RULE_TEXT,
  thresholds: THRESHOLDS,
  schedule: { cron: CRON_SCHEDULE, description: "Every hour at :17 (Cloudflare Cron Trigger)" },
  fields: WATCHED_FIELDS.map(({ id, name, lat, lon }) => ({ id, name, lat, lon })),
};

fieldWatch.get("/latest", async (c) => {
  if (!c.env.DB) return c.json(noDb, 503);
  try {
    return c.json({ ...(await latestRuns(c.env.DB)), ...about });
  } catch (err) {
    const hint = migrationHint(err);
    if (hint) return c.json(hint, 503);
    throw err;
  }
});

fieldWatch.get("/runs", async (c) => {
  if (!c.env.DB) return c.json(noDb, 503);
  const field = c.req.query("field");
  if (field && !WATCHED_FIELDS.some((f) => f.id === field)) return c.json({ error: `Unknown field. Use one of: ${WATCHED_FIELDS.map((f) => f.id).join(", ")}` }, 400);
  const limit = Math.min(100, Math.max(1, Number(c.req.query("limit") ?? 20) || 20));
  try {
    return c.json({ runs: await runHistory(c.env.DB, field, limit) });
  } catch (err) {
    const hint = migrationHint(err);
    if (hint) return c.json(hint, 503);
    throw err;
  }
});

fieldWatch.post("/run", async (c) => {
  if (!c.env.DB) return c.json(noDb, 503);
  try {
    const latest = await latestRuns(c.env.DB);
    const recent = Math.max(lastManualRun, latest.lastCheckAt ?? 0);
    if (Date.now() - recent < COOLDOWN_MS) {
      return c.json({ ...latest, ...about, cooldown: true, message: "Checked less than a minute ago. Showing that result." });
    }
    lastManualRun = Date.now();
    await runFieldWatch(c.env, "manual");
    return c.json({ ...(await latestRuns(c.env.DB)), ...about, cooldown: false });
  } catch (err) {
    const hint = migrationHint(err);
    if (hint) return c.json(hint, 503);
    throw err;
  }
});

// ---------- Scheduled checks by the field's own agent (Agents SDK Durable Object) ----------

export type AgentRpc = Pick<FieldAgent, "requestCheck" | "listRuns" | "getWatch" | "updateWatch" | "reserveRegistration" | "hasRegistration" | "forgetRegistration" | "registerField" | "isRegistered" | "deleteField">;
const noAgent = { error: "Scheduled checks need the FIELD_AGENT Durable Object binding. Deploy with the FieldAgent migration, then try again." };

export async function agentFor(env: { FIELD_AGENT?: DurableObjectNamespace }, fieldId: string): Promise<AgentRpc> {
  return (await getAgentByName(env.FIELD_AGENT as never, fieldId)) as unknown as AgentRpc;
}

fieldWatch.use("/agent/:field/*", async (c, next) => {
  const id = c.req.param("field") ?? "";
  if (WATCHED_FIELDS.some(f => f.id === id) || id === "options" || (!id.startsWith("u_") && c.env.FIELDS_ENABLED !== "on")) return next();
  if (c.env.FIELDS_ENABLED === "on" && c.req.method !== "GET" && !await fieldRequestAllowed(c.env, c.req.header("CF-Connecting-IP") ?? "local")) return c.json({ error: "Too many field requests. Try again in a minute." }, 429);
  const denied = await registeredAccess(c, id);
  if (denied) return denied;
  await next();
});
export async function registeredAccess(c: Context<AppEnv>, id: string): Promise<Response | null> {
  if (c.env.FIELDS_ENABLED !== "on") return c.json({ error: "fields disabled" }, 404);
  if (!REGISTERED_ID.test(id)) return c.json({ error: "Unknown field." }, 404);
  if (!c.env.FIELD_AGENT) return c.json(noAgent, 503);
  // Registry lookup first: forged ids never instantiate their own DO or create its storage.
  const registry = await agentFor(c.env, "__registry");
  if (!await registry.hasRegistration(id)) return c.json({ error: "Unknown field." }, 404);
  if (!await (await agentFor(c.env, id)).isRegistered(id)) return c.json({ error: "Unknown field." }, 404);
  return null;
}

fieldWatch.get("/agent/options", (c) =>
  c.json({
    delaySeconds: CHECK_DELAY_SECONDS,
    fields: WATCHED_FIELDS.map(({ id, name }) => ({ id, name })),
    replays: REPLAY_PRESETS,
    weekly: { schedule: WEEKLY_DESCRIPTION, freshDays: FRESH_DAYS, crops: WATCHABLE_CROPS },
    rule: RULE_TEXT,
    available: Boolean(c.env.FIELD_AGENT),
  }),
);

fieldWatch.post("/agent/:field/check", async (c) => {
  const fieldId = c.req.param("field");
  if (!WATCHED_FIELDS.some((f) => f.id === fieldId) && !REGISTERED_ID.test(fieldId)) return c.json({ error: `Unknown field. Use one of: ${WATCHED_FIELDS.map((f) => f.id).join(", ")}` }, 400);
  if (!c.env.FIELD_AGENT) return c.json(noAgent, 503);
  const raw = await c.req.text();
  if (raw.length > 500) return c.json({ error: "Request too large." }, 413);
  let body: { mode?: unknown; replayId?: unknown };
  try {
    body = raw ? (JSON.parse(raw) as typeof body) : {};
  } catch {
    return c.json({ error: "Send JSON: { mode: \"live\" | \"replay\", replayId? }" }, 400);
  }
  if (body.mode !== "live" && body.mode !== "replay") return c.json({ error: 'mode must be "live" or "replay"' }, 400);
  if (body.mode === "replay" && !REPLAY_PRESETS.some((p) => p.id === body.replayId)) {
    return c.json({ error: `replayId must be one of: ${REPLAY_PRESETS.map((p) => p.id).join(", ")}` }, 400);
  }
  const agent = await agentFor(c.env, fieldId);
  const { run, created } = await agent.requestCheck({ fieldId, mode: body.mode, replayId: body.replayId });
  return c.json({ run, created, message: created ? `Check scheduled for ${new Date(run.dueAt).toISOString()}. You can close this page.` : "A check for this field is already waiting. Showing that one." }, created ? 202 : 200);
});

fieldWatch.get("/agent/:field/runs", async (c) => {
  const fieldId = c.req.param("field");
  if (!WATCHED_FIELDS.some((f) => f.id === fieldId) && !REGISTERED_ID.test(fieldId)) return c.json({ error: `Unknown field. Use one of: ${WATCHED_FIELDS.map((f) => f.id).join(", ")}` }, 400);
  if (!c.env.FIELD_AGENT) return c.json(noAgent, 503);
  const limit = Math.min(50, Math.max(1, Number(c.req.query("limit") ?? 10) || 10));
  const runs: AgentRun[] = await (await agentFor(c.env, fieldId)).listRuns(limit);
  return c.json({ runs, now: Date.now() });
});

fieldWatch.get("/agent/:field/watch", async (c) => {
  const fieldId = c.req.param("field");
  if (!WATCHED_FIELDS.some((f) => f.id === fieldId) && !REGISTERED_ID.test(fieldId)) return c.json({ error: "Unknown field." }, 400);
  if (!c.env.FIELD_AGENT) return c.json(noAgent, 503);
  return c.json(await (await agentFor(c.env, fieldId)).getWatch(fieldId));
});

fieldWatch.put("/agent/:field/watch", async (c) => {
  const fieldId = c.req.param("field");
  if (!WATCHED_FIELDS.some((f) => f.id === fieldId) && !REGISTERED_ID.test(fieldId)) return c.json({ error: "Unknown field." }, 400);
  if (!c.env.FIELD_AGENT) return c.json(noAgent, 503);
  const raw = await c.req.text();
  if (raw.length > 200) return c.json({ error: "Request too large." }, 413);
  let body: { enabled?: unknown; crop?: unknown };
  try {
    body = JSON.parse(raw || "{}") as typeof body;
  } catch {
    return c.json({ error: "Send JSON: { enabled?: boolean, crop?: string | null }" }, 400);
  }
  if (body.enabled !== undefined && typeof body.enabled !== "boolean") return c.json({ error: "enabled must be true or false" }, 400);
  if (body.crop !== undefined && body.crop !== null && !WATCHABLE_CROPS.includes(body.crop as never)) {
    return c.json({ error: `crop must be null or one of: ${WATCHABLE_CROPS.join(", ")}` }, 400);
  }
  const agent = await agentFor(c.env, fieldId);
  await agent.updateWatch(fieldId, { enabled: body.enabled, crop: body.crop });
  return c.json(await agent.getWatch(fieldId));
});
