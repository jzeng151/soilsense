// Admin API for the dashboard's Settings page: edit the phone voice agent and review call activity.
// No separate Settings password (the owner's choice): any signed-in user can use Settings, like the
// rest of the dashboard. Scripts can use `Authorization: Bearer <ADMIN_TOKEN>` if that secret is set.

import { Hono } from "hono";
import { currentUser } from "../lib/auth";
import { fetchRecordingAudio, listCallRecordings } from "../lib/twilio";
import { isLiveDemoOn, liveRoom, setLiveDemo } from "../live/publish";
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

// Live screen (#/live) demo mode: while on, phone calls are shown publicly in real time.
admin.get("/live-demo", async (c) => c.json({ on: await isLiveDemoOn(c.env.DB), available: Boolean(c.env.LIVE_ROOM) }));

admin.put("/live-demo", async (c) => {
  if (!c.env.DB) return c.json({ error: "No database configured." }, 503);
  const body = (await c.req.json().catch(() => ({}))) as { on?: unknown };
  if (typeof body.on !== "boolean") return c.json({ error: "on must be true or false" }, 400);
  try {
    await setLiveDemo(c.env.DB, body.on);
  } catch (err) {
    return c.json({ error: migrationHint(err) }, 500);
  }
  return c.json({ on: body.on });
});

/** Empty the live screen (e.g. before a demo). */
admin.post("/live-demo/clear", async (c) => {
  const room = liveRoom(c.env);
  if (room) await room.clear();
  return c.json({ ok: true });
});

// ---------- Call recordings ----------
// Twilio stores the audio; we list and stream it through here so the browser never sees Twilio keys.
const twilioAuth = (env: { TWILIO_ACCOUNT_SID?: string; TWILIO_AUTH_TOKEN?: string }) =>
  env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN ? { accountSid: env.TWILIO_ACCOUNT_SID, authToken: env.TWILIO_AUTH_TOKEN } : null;
const CALL_SID = /^CA[0-9a-f]{32}$/;
const RECORDING_SID = /^RE[0-9a-f]{32}$/;

admin.get("/calls/:sid/recordings", async (c) => {
  const auth = twilioAuth(c.env);
  const sid = c.req.param("sid");
  if (!auth || !CALL_SID.test(sid)) return c.json({ recordings: [] });
  try {
    return c.json({ recordings: await listCallRecordings(auth, sid) });
  } catch (err) {
    return c.json({ error: String(err) }, 502);
  }
});

/** The MP3. ?download=1 saves it as a file instead of playing it. Only recordings of that call are served. */
admin.get("/calls/:sid/recordings/:rsid", async (c) => {
  const auth = twilioAuth(c.env);
  const sid = c.req.param("sid");
  const rsid = c.req.param("rsid").replace(/\.mp3$/, "");
  if (!auth || !CALL_SID.test(sid) || !RECORDING_SID.test(rsid)) return c.json({ error: "Not found" }, 404);
  const mine = (await listCallRecordings(auth, sid).catch(() => [])).some((r) => r.sid === rsid);
  if (!mine) return c.json({ error: "Not found" }, 404);
  const res = await fetchRecordingAudio(auth, rsid);
  if (!res.ok || !res.body) return c.json({ error: `Recording not available (${res.status})` }, 502);
  const headers = new Headers({ "Content-Type": "audio/mpeg", "Cache-Control": "private, max-age=3600" });
  const len = res.headers.get("Content-Length");
  if (len) headers.set("Content-Length", len);
  headers.set("Content-Disposition", `${c.req.query("download") ? "attachment" : "inline"}; filename="soilsense-call-${sid.slice(-8)}.mp3"`);
  return new Response(res.body, { headers });
});
