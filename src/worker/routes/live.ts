// Public live screen (#/live): watch a phone call as it happens. Only while demo mode is on in Settings.

import { Hono } from "hono";
import type { Env } from "../env";
import { isLiveDemoOn, liveRoom } from "../live/publish";

export const live = new Hono<{ Bindings: Env }>();

live.use("*", async (c, next) => {
  c.header("Cache-Control", "no-store");
  await next();
});

live.get("/status", async (c) => c.json({ demo: await isLiveDemoOn(c.env.DB), available: Boolean(c.env.LIVE_ROOM), phone: formatUsPhone(c.env.TWILIO_FROM_NUMBER) }));

/** "+15551234567" → "(555) 123-4567" for the "call to try it" line. */
function formatUsPhone(n: string | undefined): string | null {
  const d = (n ?? "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : null;
}

/** WebSocket: a snapshot of recent events, then each new event as it happens. */
live.get("/ws", async (c) => {
  const room = liveRoom(c.env);
  if (!room) return c.json({ error: "Live room is not configured." }, 503);
  if (!(await isLiveDemoOn(c.env.DB))) return c.json({ error: "Demo mode is off." }, 403);
  return room.fetch(c.req.raw);
});

/** Polling fallback: events after ?since=<seq>. */
live.get("/events", async (c) => {
  const room = liveRoom(c.env);
  if (!room || !(await isLiveDemoOn(c.env.DB))) return c.json({ demo: false, events: [] });
  const since = Number(c.req.query("since") ?? 0) || 0;
  return c.json({ demo: true, events: await room.recent(since) });
});
