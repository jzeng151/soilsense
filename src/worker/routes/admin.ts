// Admin API for the dashboard's Settings page: edit the phone voice agent and review call activity.
// No separate Settings password (the owner's choice): any signed-in user can use Settings, like the
// rest of the dashboard. Scripts can use `Authorization: Bearer <ADMIN_TOKEN>` if that secret is set.

import { Hono } from "hono";
import { currentUser } from "../lib/auth";
import type { AppEnv } from "./auth";
import {
  defaultVoiceSettings,
  LANGUAGES,
  LIMITS,
  LOCKED_RULES,
  loadVoiceSettings,
  normalizeVoiceSettings,
  resetVoiceSettings,
  saveVoiceSettings,
  VOICE_TOOLS,
} from "../voiceSettings";

export const admin = new Hono<AppEnv>();

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

admin.use("*", async (c, next) => {
  c.header("Cache-Control", "no-store");
  const given = (c.req.header("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (c.env.ADMIN_TOKEN && given && safeEqual(given, c.env.ADMIN_TOKEN)) return next();
  if (await currentUser(c)) return next();
  return c.json({ error: "Please sign in." }, 401);
});

const migrationHint = (err: unknown) =>
  /no such table/i.test(String(err)) ? "The database is missing the settings tables. Run: npm run db:migrate:remote (or db:migrate:local)." : "Database error.";

admin.get("/check", (c) => c.json({ ok: true }));

admin.get("/voice-agent", async (c) => {
  const s = await loadVoiceSettings(c.env.DB);
  const { updatedAt, ...settings } = s;
  return c.json({
    settings,
    updatedAt,
    defaults: defaultVoiceSettings(),
    lockedRules: LOCKED_RULES,
    tools: VOICE_TOOLS,
    languages: LANGUAGES,
    limits: LIMITS,
    status: {
      database: Boolean(c.env.DB),
      gemini: Boolean(c.env.GEMINI_API_KEY),
      twilio: Boolean(c.env.TWILIO_ACCOUNT_SID && c.env.TWILIO_AUTH_TOKEN),
      mode: c.env.VOICE_MODE === "ivr" ? "keypad menu (VOICE_MODE=ivr)" : "voice agent",
      model: c.env.VOICE_MODEL || "gemini-3.5-flash-lite",
    },
  });
});

admin.put("/voice-agent", async (c) => {
  if (!c.env.DB) return c.json({ error: "No database configured." }, 503);
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }
  let settings;
  try {
    settings = normalizeVoiceSettings(body);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400);
  }
  try {
    const updatedAt = await saveVoiceSettings(c.env.DB, settings);
    return c.json({ settings, updatedAt });
  } catch (err) {
    return c.json({ error: migrationHint(err) }, 500);
  }
});

admin.post("/voice-agent/reset", async (c) => {
  if (!c.env.DB) return c.json({ error: "No database configured." }, 503);
  try {
    await resetVoiceSettings(c.env.DB);
  } catch (err) {
    return c.json({ error: migrationHint(err) }, 500);
  }
  return c.json({ settings: defaultVoiceSettings(), updatedAt: null });
});

admin.get("/calls", async (c) => {
  if (!c.env.DB) return c.json({ calls: [] });
  const limit = Math.min(100, Math.max(1, Number(c.req.query("limit") ?? 30)));
  try {
    const { results } = await c.env.DB.prepare(
      `SELECT v.call_sid AS callSid,
              MIN(v.created_at) AS startedAt,
              MAX(v.created_at) AS lastAt,
              SUM(v.kind = 'caller') AS turns,
              SUM(v.kind = 'tool') AS toolCalls,
              SUM(v.kind = 'error' OR (v.kind = 'tool' AND v.ok = 0)) AS problems,
              MAX(CASE WHEN v.kind = 'session_start' THEN v.detail END) AS startDetail,
              MAX(v.kind = 'session_end') AS ended,
              (SELECT p.place FROM plan_log p WHERE p.call_sid = v.call_sid ORDER BY p.created_at DESC LIMIT 1) AS place,
              (SELECT p.top_plan FROM plan_log p WHERE p.call_sid = v.call_sid ORDER BY p.created_at DESC LIMIT 1) AS topPlan
         FROM voice_events v
        GROUP BY v.call_sid
        ORDER BY startedAt DESC
        LIMIT ?1`,
    )
      .bind(limit)
      .all<Record<string, unknown>>();
    return c.json({
      calls: results.map((r) => {
        let caller: string | null = null;
        try {
          caller = (JSON.parse(String(r.startDetail ?? "{}")) as { caller?: string }).caller ?? null;
        } catch {
          // ignore
        }
        const { startDetail: _drop, ...rest } = r;
        return { ...rest, caller, ended: Boolean(r.ended) };
      }),
    });
  } catch (err) {
    return c.json({ error: migrationHint(err) }, 500);
  }
});

admin.get("/calls/:sid", async (c) => {
  if (!c.env.DB) return c.json({ events: [] });
  try {
    const { results } = await c.env.DB.prepare(
      "SELECT id, created_at AS at, kind, name, detail, duration_ms AS durationMs, ok FROM voice_events WHERE call_sid = ?1 ORDER BY id ASC LIMIT 500",
    )
      .bind(c.req.param("sid"))
      .all();
    return c.json({ events: results });
  } catch (err) {
    return c.json({ error: migrationHint(err) }, 500);
  }
});
