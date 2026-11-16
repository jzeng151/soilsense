// Two-level cache: per-isolate memory + D1 (shared, persistent).
// Public data services ask clients not to re-request identical data, and the
// phone call must answer inside Twilio's 15-second webhook limit.

import { AsyncLocalStorage } from "node:async_hooks";

export interface CachePolicy {
  softTtlSeconds: number;
  staleSeconds: number;
  /** Absolute hard boundary for release-relative policies; network time must not extend it. */
  expiresAt?: number;
  cacheable?: (value: unknown) => boolean;
}
type Context = { waitUntil(promise: Promise<unknown>): void };
const context = new AsyncLocalStorage<Context>();
export function withCacheContext<T>(ctx: Context, run: () => T): T { return context.run(ctx, run); }
const flights = new Map<string, Promise<unknown>>();
const retryAfter = new Map<string, number>();
const memory = new Map<string, { expires: number; created: number; value: string }>();
const MAX_MEMORY_ENTRIES = 200;

export { DAY_SECONDS } from "./time";

/** Trusted precompute import: fail if durable storage fails; do not acknowledge memory-only warming. */
export async function putCached<T>(db: D1Database, key: string, ttlSeconds: number, value: T): Promise<void> {
  const now = Date.now();
  const serialized = JSON.stringify(value);
  const expires = now + ttlSeconds * 1000;
  await db.prepare("INSERT INTO cache (key, value, expires_at, created_at) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(key) DO UPDATE SET value = excluded.value, expires_at = excluded.expires_at, created_at = excluded.created_at")
    .bind(key, serialized, expires, now).run();
  remember(key, serialized, expires);
}

export async function cached<T>(db: D1Database | undefined, key: string, ttl: number | CachePolicy, load: () => Promise<T>): Promise<{ value: T; cache: "memory" | "d1" | "miss" }> {
  const policy: CachePolicy = typeof ttl === "number" ? { softTtlSeconds: ttl, staleSeconds: 0 } : ttl;
  const now = Date.now();
  const refresh = (): Promise<T> => {
    const existing = flights.get(key);
    if (existing) return existing as Promise<T>;
    const flight = (async () => {
      const value = await load();
      if (policy.cacheable && !policy.cacheable(value)) return value;
      const serialized = JSON.stringify(value);
      const created = Date.now();
      const expires = Math.min(created + (policy.softTtlSeconds + policy.staleSeconds) * 1000, policy.expiresAt ?? Infinity);
      remember(key, serialized, expires, created);
      if (db) {
        try {
          await db.prepare("INSERT INTO cache (key, value, expires_at, created_at) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(key) DO UPDATE SET value = excluded.value, expires_at = excluded.expires_at, created_at = excluded.created_at")
            .bind(key, serialized, expires, created).run();
        } catch (err) { console.warn(JSON.stringify({ msg: "cache write failed", key, err: String(err) })); }
      }
      return value;
    })();
    flights.set(key, flight);
    void flight.finally(() => flights.delete(key)).catch(() => {});
    return flight;
  };
  const hit = (entry: { value: string; expires: number; created: number }, cache: "memory" | "d1") => {
    if (entry.expires <= now) return null;
    if (entry.expires - policy.staleSeconds * 1000 <= now) {
      const ctx = context.getStore();
      if (!ctx) return null;
      if ((retryAfter.get(key) ?? 0) <= now) ctx.waitUntil(refresh().catch(err => {
        if (retryAfter.size >= MAX_MEMORY_ENTRIES) retryAfter.delete(retryAfter.keys().next().value!);
        retryAfter.set(key, Date.now() + 60_000);
        console.warn(JSON.stringify({ msg: "cache refresh failed", key, err: String(err) }));
      }));
    }
    return { value: JSON.parse(entry.value) as T, cache };
  };
  const mem = memory.get(key);
  if (mem) { const result = hit(mem, "memory"); if (result) return result; }
  if (db) {
    try {
      const row = await db.prepare("SELECT value, expires_at, created_at FROM cache WHERE key = ?1").bind(key).first<{ value: string; expires_at: number; created_at?: number }>();
      if (row) {
        const created = row.created_at ?? row.expires_at - (policy.softTtlSeconds + policy.staleSeconds) * 1000;
        remember(key, row.value, row.expires_at, created);
        const result = hit({ value: row.value, expires: row.expires_at, created }, "d1"); if (result) return result;
      }
    } catch (err) { console.warn(JSON.stringify({ msg: "cache read failed", key, err: String(err) })); }
  }
  return { value: await refresh(), cache: "miss" };
}

function remember(key: string, value: string, expires: number, created = Date.now()): void {
  if (memory.size >= MAX_MEMORY_ENTRIES) {
    const oldest = memory.keys().next().value;
    if (oldest !== undefined) memory.delete(oldest);
  }
  memory.set(key, { value, expires, created });
}

export function clearMemoryCache(): void {
  memory.clear();
  retryAfter.clear();
}
