// Helpers for the live screen: the "demo mode" switch (caller privacy) and publishing to the live room.

import type { Env } from "../env";
import type { LiveEvent, LiveRoom } from "./room";

const KEY = "live_demo";

/** Live calls are only shown while demo mode is on (Settings), so real callers stay private by default. */
export async function isLiveDemoOn(db: D1Database | undefined): Promise<boolean> {
  if (!db) return false;
  try {
    const row = await db.prepare("SELECT value FROM settings WHERE key = ?1").bind(KEY).first<{ value: string }>();
    return Boolean(row && (JSON.parse(row.value) as { on?: boolean }).on);
  } catch {
    return false;
  }
}

export async function setLiveDemo(db: D1Database, on: boolean): Promise<void> {
  await db
    .prepare("INSERT INTO settings (key, value, updated_at) VALUES (?1, ?2, ?3) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
    .bind(KEY, JSON.stringify({ on }), Date.now())
    .run();
}

export function liveRoom(env: Env): DurableObjectStub<LiveRoom> | null {
  const ns = env.LIVE_ROOM as DurableObjectNamespace<LiveRoom> | undefined;
  if (!ns) return null;
  return ns.get(ns.idFromName(env.LIVE_ROOM_NAME ?? "demo"));
}

/** Publish one event; never throws and never blocks the caller. */
export function publishLive(env: Env, event: LiveEvent): Promise<void> {
  const room = liveRoom(env);
  if (!room) return Promise.resolve();
  return room.publish(event).catch((err: unknown) => console.warn(JSON.stringify({ msg: "live publish failed", err: String(err) })));
}
