import type { Env } from "../env";

// Bump when public response schemas/data change; owner can additionally set EDGE_CACHE_VERSION per release.
export const EDGE_CACHE_VERSION = "public-v1";
type Policy = { fresh: number; stale: number };
const hour = { fresh: 3600, stale: 3600 };
const minute = { fresh: 60, stale: 60 };

/** Exact allowlist: never widen /fields to /fields/* (capability-owned fields share that prefix). */
export function publicGetPolicy(path: string): Policy | undefined {
  if (["/api/fields", "/api/fields/", "/api/fields/status", "/api/research/corpus", "/api/historical-scenarios", "/api/historical-scenarios/"].includes(path)) return hour;
  if (["/api/research/status", "/api/refresh/status"].includes(path)) return minute;
  if (/^\/api\/refresh\/snapshots\/pwr-[0-9a-f]{24}(\/bundle)?$/.test(path)) return { fresh: 86400, stale: 86400 };
  return undefined;
}

function copy(response: Response): Response {
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers: response.headers });
}
function noStore(response: Response): Response {
  // WebSocket responses cannot be reconstructed with the standard Response constructor.
  if (response.status === 101) return response;
  const result = copy(response);
  if (!/no-store/i.test(result.headers.get("Cache-Control") ?? "")) result.headers.set("Cache-Control", "private, no-store");
  return result;
}
const timestamp = "X-SoilSense-Cache-Stored";
const pending = new Map<string, Promise<unknown>>();

/** Wrap the HTTP boundary, not internal routes, so stale refreshes use a fresh Hono context. */
export async function publicCachedResponse(
  request: Request, env: Env, ctx: { waitUntil(promise: Promise<unknown>): void } | undefined, origin: () => Promise<Response>,
): Promise<Response> {
  const url = new URL(request.url);
  const policy = request.method === "GET" ? publicGetPolicy(url.pathname) : undefined;
  const bypass = request.headers.has("Authorization") || request.headers.has("Cookie") || request.headers.has("Range")
    || request.headers.has("Upgrade") || [...url.searchParams.keys()].some(k => /token|capability|measurement|user|session|password|secret/i.test(k));
  if (!policy || bypass) {
    const response = await origin();
    return url.pathname.startsWith("/api/") ? noStore(response) : response;
  }
  const control = `public, max-age=${policy.fresh}, stale-while-revalidate=${policy.stale}`;
  // Host + full query remain part of the key. Do NOT sort duplicate query parameters.
  const keyUrl = new URL(request.url);
  keyUrl.pathname = `/__public_cache/${EDGE_CACHE_VERSION}/${encodeURIComponent(env.EDGE_CACHE_VERSION ?? "default")}${url.pathname}`;
  // Configuration-dependent public status must not leak across binding/feature toggles.
  keyUrl.searchParams.append("__env", [env.FIELDS_ENABLED, !!env.DB, !!env.AI, !!env.RESEARCH_INDEX, !!env.POWER_REFRESH, !!env.EVIDENCE].join(":"));
  const key = new Request(keyUrl, { method: "GET" });
  const cache = env.EDGE_CACHE_MODE !== "off" && typeof caches !== "undefined" ? caches.default : undefined;
  const present = (response: Response, state: string, stored?: number) => {
    const result = copy(response);
    result.headers.delete(timestamp);
    result.headers.set("Cache-Control", control);
    result.headers.set("X-Edge-Cache", state);
    if (stored !== undefined) result.headers.set("Age", String(Math.max(0, Math.floor((Date.now() - stored) / 1000))));
    return result;
  };
  const load = async () => {
    const response = await origin();
    if (response.status !== 200 || response.headers.has("Set-Cookie") || response.headers.has("Vary")
      || /private|no-store/i.test(response.headers.get("Cache-Control") ?? "")) return noStore(response);
    const result = present(response, cache ? "MISS" : "BYPASS");
    if (cache) {
      const stored = result.clone();
      stored.headers.set(timestamp, String(Date.now()));
      // Cache API does not implement stale-while-revalidate; retain through stale window and enforce it here.
      stored.headers.set("Cache-Control", `public, max-age=${policy.fresh + policy.stale}`);
      const put = cache.put(key, stored).catch(() => {});
      if (ctx) ctx.waitUntil(put); else await put;
    }
    return result;
  };
  if (cache) {
    try {
      const hit = await cache.match(key);
      if (hit) {
        const stored = Number(hit.headers.get(timestamp));
        const age = (Date.now() - stored) / 1000;
        if (stored > 0 && age >= 0 && age < policy.fresh) return present(hit, "HIT", stored);
        if (stored > 0 && age >= 0 && age < policy.fresh + policy.stale && ctx) {
          if (!pending.has(key.url)) {
            const refresh = load().then(r => { void r.body?.cancel().catch(() => {}); }).catch(() => {}).finally(() => pending.delete(key.url));
            pending.set(key.url, refresh);
          }
          ctx.waitUntil(pending.get(key.url)!);
          return present(hit, "STALE", stored);
        }
      }
    } catch { /* Cache outages are not API outages. */ }
  }
  return load();
}
