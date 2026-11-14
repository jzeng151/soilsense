// SoilSense Worker: JSON API for the dashboard, Twilio voice webhooks, and static dashboard assets.

import { Hono } from "hono";
import type { Env } from "./env";
import { api } from "./routes/api";
import { admin } from "./routes/admin";
import { handleAgentSocket } from "./routes/agent";
import { voice } from "./routes/voice";

const app = new Hono<{ Bindings: Env }>();

app.use("*", async (c, next) => {
  await next();
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
});

app.get("/healthz", (c) => c.json({ ok: true }));
// WebSocket for Twilio ConversationRelay (the conversational phone agent).
app.get("/voice-agent", (c) => handleAgentSocket(c.req.raw, c.env));
app.route("/api/admin", admin);
app.route("/api", api);
app.route("/voice", voice);

app.notFound((c) => {
  if (c.req.path.startsWith("/api/") || c.req.path.startsWith("/voice/")) return c.json({ error: "Not found" }, 404);
  return c.env.ASSETS ? c.env.ASSETS.fetch(c.req.raw) : c.text("Not found", 404);
});

app.onError((err, c) => {
  console.error(JSON.stringify({ msg: "unhandled error", path: c.req.path, err: String(err), stack: err.stack }));
  return c.json({ error: "Internal error" }, 500);
});

export default app;
