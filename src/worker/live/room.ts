// The "live room": one Durable Object that fans out live events (phone calls, Field Watch runs) to every
// open #/live screen over WebSockets. It uses the hibernation API, so an idle room costs nothing, and it keeps
// the last events in its own storage so a screen opened mid-call can catch up (and so polling works too).

import { DurableObject } from "cloudflare:workers";
import type { Env } from "../env";

/** Anything with a string `type`; the room adds `seq` (order) and `at` (ms). */
export type LiveEvent = { type: string; at?: number; seq?: number } & Record<string, unknown>;

const KEEP = 400;
const MAX_EVENT_BYTES = 16_000;

export class LiveRoom extends DurableObject<Env> {
  /** WebSocket upgrade from the Worker (GET /api/live/ws). Sends recent events first. */
  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return new Response("Expected WebSocket", { status: 426 });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    this.ctx.acceptWebSocket(server);
    server.send(JSON.stringify({ type: "snapshot", events: await this.load() }));
    return new Response(null, { status: 101, webSocket: client });
  }

  /** RPC: add an event and broadcast it to every open screen. */
  async publish(event: LiveEvent): Promise<void> {
    if (!event || typeof event.type !== "string") return;
    const events = await this.load();
    const seq = ((await this.ctx.storage.get<number>("seq")) ?? 0) + 1;
    const e: LiveEvent = { ...event, at: typeof event.at === "number" ? event.at : Date.now(), seq };
    const text = JSON.stringify(e);
    if (text.length > MAX_EVENT_BYTES) return;
    events.push(e);
    await this.ctx.storage.put({ seq, events: events.slice(-KEEP) });
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(text);
      } catch {
        // closed socket; the runtime cleans it up
      }
    }
  }

  /** RPC: events after `since` (polling fallback when WebSockets are blocked). */
  async recent(since = 0): Promise<LiveEvent[]> {
    return (await this.load()).filter((e) => (e.seq ?? 0) > since);
  }

  /** RPC: forget everything (Settings → clear the live screen). */
  async clear(): Promise<void> {
    await this.ctx.storage.put({ events: [] });
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(JSON.stringify({ type: "snapshot", events: [] }));
      } catch {
        // ignore
      }
    }
  }

  override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    if (message === "ping") ws.send("pong");
  }

  override async webSocketClose(ws: WebSocket, code: number) {
    try {
      ws.close(code === 1005 ? 1000 : code, "bye");
    } catch {
      // already closed
    }
  }

  private async load(): Promise<LiveEvent[]> {
    return (await this.ctx.storage.get<LiveEvent[]>("events")) ?? [];
  }
}
