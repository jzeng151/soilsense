import type { Env } from "../env";
const buckets = new Map<string, { tokens: number; at: number }>();
/** Best-effort per-isolate fallback; production uses the existing shared binding and a separate key. */
export function registrationAllowed(ip: string, now = Date.now()): boolean {
  const b = buckets.get(ip) ?? { tokens: 5, at: now };
  b.tokens = Math.min(5, b.tokens + (now - b.at) / 12_000);
  b.at = now;
  if (buckets.size > 5000) buckets.clear();
  buckets.set(ip, b);
  if (b.tokens < 1) return false;
  b.tokens -= 1;
  return true;
}
export async function fieldRequestAllowed(env: Env, ip: string): Promise<boolean> {
  return env.SCOUT_LIMITER ? (await env.SCOUT_LIMITER.limit({ key: `fields:${ip}` })).success : registrationAllowed(ip);
}
