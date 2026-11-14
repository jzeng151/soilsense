// Two-level cache: per-isolate memory + D1 (shared, persistent).
// Public data services ask clients not to re-request identical data, and the
// phone call must answer inside Twilio's 15-second webhook limit.

const memory = new Map<string, { expires: number; value: string }>();
const MAX_MEMORY_ENTRIES = 200;

export const DAY_SECONDS = 86_400;

export async function cached<T>(
  db: D1Database | undefined,
  key: string,
  ttlSeconds: number,
  load: () => Promise<T>,
): Promise<{ value: T; cache: "memory" | "d1" | "miss" }> {
  const now = Date.now();
  const mem = memory.get(key);
  if (mem && mem.expires > now) return { value: JSON.parse(mem.value) as T, cache: "memory" };

  if (db) {
    try {
      const row = await db.prepare("SELECT value, expires_at FROM cache WHERE key = ?1").bind(key).first<{ value: string; expires_at: number }>();
      if (row && row.expires_at > now) {
        remember(key, row.value, row.expires_at);
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
