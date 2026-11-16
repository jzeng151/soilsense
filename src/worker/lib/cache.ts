// Two-level cache: per-isolate memory + D1 (shared, persistent).
// Public data services ask clients not to re-request identical data, and the
// phone call must answer inside Twilio's 15-second webhook limit.

const memory = new Map<string, { expires: number; value: string }>();
const MAX_MEMORY_ENTRIES = 200;

export const DAY_SECONDS = 86_400;

/** Trusted precompute import: fail if durable storage fails; do not acknowledge memory-only warming. */
export async function putCached<T>(db: D1Database, key: string, ttlSeconds: number, value: T): Promise<void> {
  const now = Date.now();
  const serialized = JSON.stringify(value);
  const expires = now + ttlSeconds * 1000;
  await db.prepare("INSERT INTO cache (key, value, expires_at, created_at) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(key) DO UPDATE SET value = excluded.value, expires_at = excluded.expires_at, created_at = excluded.created_at")
    .bind(key, serialized, expires, now).run();
  remember(key, serialized, expires);
}

export interface CacheOptions {
  kv?: KVNamespace;
  /** Only for immutable/versioned public lookups; mutable plans/admin imports remain on primary. */
  readReplica?: boolean;
}

export async function cached<T>(
  db: D1Database | undefined,
  key: string,
  ttlSeconds: number,
  load: () => Promise<T>,
  options: CacheOptions = {},
): Promise<{ value: T; cache: "memory" | "kv" | "d1" | "miss" }> {
  const now = Date.now();
  const mem = memory.get(key);
  if (mem && mem.expires > now) return { value: JSON.parse(mem.value) as T, cache: "memory" };

  // Restrict the optional distributed cache to public geography even if a future caller passes options accidentally.
  const geography = /^(zip|county):v1:/.test(key);
  const kv = geography ? options.kv : undefined;
  if (kv) {
    try {
      const entry = await kv.get<{ value: string; expires: number }>(`geo-cache:v1:${key}`, "json");
      if (entry && typeof entry.value === "string" && entry.expires > now) {
        const value = JSON.parse(entry.value) as T;
        remember(key, entry.value, entry.expires);
        return { value, cache: "kv" };
      }
    } catch { /* Optional KV failure falls through to D1/upstream. */ }
  }
  const warmKv = async (value: string, expires: number) => {
    const ttl = Math.floor((expires - Date.now()) / 1000);
    if (!kv || ttl < 60 || value === "null") return;
    try { await kv.put(`geo-cache:v1:${key}`, JSON.stringify({ value, expires }), { expirationTtl: ttl }); }
    catch { /* KV is best-effort and never blocks a lookup result. */ }
  };

  if (db) {
    try {
      const query = "SELECT value, expires_at FROM cache WHERE key = ?1";
      const replica = geography && options.readReplica && typeof db.withSession === "function";
      type Row = { value: string; expires_at: number };
      let row: Row | null = null;
      if (replica) {
        try { row = await db.withSession("first-unconstrained").prepare(query).bind(key).first<Row>(); }
        catch { /* Replica outages must also fall back to the primary before recomputation. */ }
      }
      // A replica miss/expiry/failure must not overwrite a newer primary cache entry.
      if (!replica || !row || row.expires_at <= now) row = await db.prepare(query).bind(key).first<Row>();
      if (row && row.expires_at > now) {
        remember(key, row.value, row.expires_at);
        await warmKv(row.value, row.expires_at);
        return { value: JSON.parse(row.value) as T, cache: "d1" };
      }
    } catch (err) {
      console.warn(JSON.stringify({ msg: "cache read failed", key, err: String(err) }));
    }
  }

  const value = await load();
  const serialized = JSON.stringify(value);
  const expires = now + ttlSeconds * 1000;
  remember(key, serialized, expires);
  if (db) {
    try {
      await db
        .prepare("INSERT INTO cache (key, value, expires_at, created_at) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(key) DO UPDATE SET value = excluded.value, expires_at = excluded.expires_at, created_at = excluded.created_at")
        .bind(key, serialized, expires, now)
        .run();
    } catch (err) {
      console.warn(JSON.stringify({ msg: "cache write failed", key, err: String(err) }));
    }
  }
  await warmKv(serialized, expires);
  return { value, cache: "miss" };
}

function remember(key: string, value: string, expires: number): void {
  if (memory.size >= MAX_MEMORY_ENTRIES) {
    const oldest = memory.keys().next().value;
    if (oldest !== undefined) memory.delete(oldest);
  }
  memory.set(key, { value, expires });
}

export function clearMemoryCache(): void {
  memory.clear();
}
