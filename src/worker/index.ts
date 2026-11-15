// SoilSense Worker: JSON API for the dashboard, Twilio voice webhooks, and static dashboard assets.

import { Hono } from "hono";
import type { Env } from "./env";
import { api } from "./routes/api";
import { admin } from "./routes/admin";
import { handleAgentSocket } from "./routes/agent";
import { voice } from "./routes/voice";
import { runFieldWatch } from "./fieldwatch/run";
import { live } from "./routes/live";
import { refresh } from "./routes/refresh";
import { POWER_REFRESH_CRON, startPowerRefresh } from "./refresh/workflow";

// Durable Object classes must be exported from the main module.
export { LiveRoom } from "./live/room";
// Workflow classes too (wrangler "workflows" binding POWER_REFRESH).
export { PowerRefreshWorkflow } from "./refresh/workflow";

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
// Live room (Durable Object): real-time events for the dashboard. Mounted before /api so it isn't shadowed.
app.route("/api/live", live);
// NASA POWER snapshot refresh (Workflow) status, evidence manifests and the admin-only trigger.
app.route("/api/refresh", refresh);
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

// Cloudflare Cron Trigger (wrangler "triggers.crons"): Field Watch checks every watched field in the
// background, with no browser open, and saves each result in D1.
async function scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
  // Daily NASA POWER snapshot refresh (separate cron): start the Workflow instead of a Field Watch run.
  if (controller.cron === POWER_REFRESH_CRON) {
    ctx.waitUntil(startPowerRefresh(env, "cron").catch((err) => console.error(JSON.stringify({ msg: "power refresh start failed", err: String(err) }))));
    return;
  }
  ctx.waitUntil(
    runFieldWatch(env, "cron").catch((err) => console.error(JSON.stringify({ msg: "field watch cron failed", cron: controller.cron, err: String(err) }))),
  );
}

// The Hono app stays the default export (tests call app.request); Workers also reads its scheduled handler.
export default Object.assign(app, { scheduled });
