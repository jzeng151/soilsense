import { afterEach, describe, expect, it, vi } from "vitest";
import app from "../src/worker/index";
import { publicCachedResponse } from "../src/worker/lib/edgeCache";

const tasks: Promise<unknown>[] = [];
const ctx = { waitUntil: (p: Promise<unknown>) => tasks.push(p), passThroughOnException() {} } as unknown as ExecutionContext;
afterEach(async () => { await Promise.all(tasks.splice(0)); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

export function memoryEdgeCache() {
  const entries = new Map<string, Response>();
  const cache = {
    match: vi.fn(async (key: Request) => entries.get(key.url)?.clone()),
    put: vi.fn(async (key: Request, response: Response) => { entries.set(key.url, response.clone()); }),
  };
  vi.stubGlobal("caches", { default: cache });
  return cache;
}

describe("public HTTP cache boundary", () => {
  it("gives public metadata a bounded cache policy and serves a repeated GET from Cache API", async () => {
    const cache = memoryEdgeCache();
    const env = { FIELDS_ENABLED: "on" };
    const first = await app.request("/api/fields/status", {}, env, ctx);
    expect(first.headers.get("Cache-Control")).toBe("public, max-age=3600, stale-while-revalidate=3600");
    const body = await first.text();
    await Promise.all(tasks.splice(0));
    const second = await app.request("/api/fields/status", {}, env, ctx);
    expect(await second.text()).toBe(body);
    expect(second.headers.get("X-Edge-Cache")).toBe("HIT");
    expect(cache.put).toHaveBeenCalledTimes(1);
    expect(second.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it.each(["/api/admin/check", "/api/auth/me", "/api/fields/f-secret", "/api/fieldwatch/agent/f-secret/watch", "/api/field-memory/f-secret/n", "/api/docs", "/api/logs", "/api/ui/status", "/api/zip/67846"])("never shares private or unknown route %s", async path => {
    const cache = memoryEdgeCache();
    const response = await app.request(path, {}, { FIELDS_ENABLED: "on" }, ctx);
    expect(response.headers.get("Cache-Control")).toMatch(/no-store/);
    expect(cache.match).not.toHaveBeenCalled();
    expect(cache.put).not.toHaveBeenCalled();
  });

  it.each([{ Cookie: "session=private" }, { Authorization: "Bearer secret" }, { Range: "bytes=0-1" }])("bypasses credentialed or ranged requests %j", async headers => {
    const cache = memoryEdgeCache();
    const response = await app.request("/api/research/status", { headers: new Headers(Object.entries(headers).filter((entry): entry is [string, string] => typeof entry[1] === "string")) }, {}, ctx);
    expect(response.headers.get("Cache-Control")).toMatch(/no-store/);
    expect(cache.match).not.toHaveBeenCalled();
    expect(cache.put).not.toHaveBeenCalled();
  });

  it("does not cache mutations, errors, or secret query inputs", async () => {
    const cache = memoryEdgeCache();
    for (const [path, init] of [["/api/plan", { method: "POST", body: "{}" }], ["/api/fields?area=unknown", {}], ["/api/fields/status?capability=secret", {}]] as const) {
      const response = await app.request(path, init, { FIELDS_ENABLED: "on" }, ctx);
      expect(response.headers.get("Cache-Control")).toMatch(/no-store/);
    }
    expect(cache.put).not.toHaveBeenCalled();
  });

  it("separates query, feature flag and deployment namespaces", async () => {
    const cache = memoryEdgeCache();
    for (const [path, env] of [["/api/fields?area=finney", { FIELDS_ENABLED: "on" }], ["/api/fields?area=story", { FIELDS_ENABLED: "on" }], ["/api/fields?area=finney", { FIELDS_ENABLED: "on", EDGE_CACHE_VERSION: "v2" }]] as const) {
      expect((await app.request(path, {}, env, ctx)).headers.get("X-Edge-Cache")).toBe("MISS");
      await Promise.all(tasks.splice(0));
    }
    const disabled = await app.request("/api/fields?area=finney", {}, {}, ctx);
    expect(disabled.status).toBe(404);
    expect(disabled.headers.get("Cache-Control")).toMatch(/no-store/);
    expect(cache.put).toHaveBeenCalledTimes(3);
  });

  it("serves bounded stale responses immediately and revalidates in the background", async () => {
    memoryEdgeCache();
    let now = 1000000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const request = new Request("https://example.com/api/research/status");
    const origin = vi.fn(async () => Response.json({ generation: 1 }));
    await publicCachedResponse(request, {}, ctx, origin);
    await Promise.all(tasks.splice(0));
    now += 61000;
    origin.mockImplementation(async () => Response.json({ generation: 2 }));
    const stale = await publicCachedResponse(request, {}, ctx, origin);
    expect(stale.headers.get("X-Edge-Cache")).toBe("STALE");
    expect(stale.headers.get("Age")).toBe("61");
    expect(await stale.json()).toEqual({ generation: 1 });
    await Promise.all(tasks.splice(0));
    const fresh = await publicCachedResponse(request, {}, ctx, origin);
    expect(await fresh.json()).toEqual({ generation: 2 });
    now += 121000;
    origin.mockImplementation(async () => new Response("unavailable", { status: 503 }));
    const expired = await publicCachedResponse(request, {}, ctx, origin);
    expect(expired.status).toBe(503);
    expect(expired.headers.get("Cache-Control")).toMatch(/no-store/);
  });

  it.each([{ "Set-Cookie": "session=private" }, { Vary: "Cookie" }, { "Cache-Control": "private" }])("refuses unsafe origin headers %j", async headers => {
    const cache = memoryEdgeCache();
    const response = await publicCachedResponse(new Request("https://example.com/api/research/status"), {}, ctx, async () => new Response("private", { headers: new Headers(Object.entries(headers).filter((entry): entry is [string, string] => typeof entry[1] === "string")) }));
    expect(response.headers.get("Cache-Control")).toMatch(/no-store/);
    expect(cache.put).not.toHaveBeenCalled();
  });

  it("survives absent or failing Cache API", async () => {
    vi.stubGlobal("caches", undefined);
    expect((await app.request("/api/research/status")).headers.get("X-Edge-Cache")).toBe("BYPASS");
    const cache = memoryEdgeCache();
    cache.match.mockRejectedValue(new Error("unavailable"));
    cache.put.mockRejectedValue(new Error("unavailable"));
    expect((await app.request("/api/research/status", {}, {}, ctx)).status).toBe(200);
  });

  it("caches public content-addressed evidence but never a missing bundle", async () => {
    const cache = memoryEdgeCache();
    const db = { prepare: () => ({ bind: () => ({ first: async () => ({ r2_key: "evidence/public.json" }) }) }) } as unknown as D1Database;
    const get = vi.fn(async () => ({ body: '{"observations":[]}', httpEtag: '"bundle-v1"' }));
    const env = { DB: db, EVIDENCE: { get } as unknown as R2Bucket };
    const path = "/api/refresh/snapshots/pwr-0123456789abcdef01234567/bundle";
    const first = await app.request(path, {}, env, ctx);
    expect(first.headers.get("Cache-Control")).toBe("public, max-age=86400, stale-while-revalidate=86400");
    expect(first.headers.get("ETag")).toBe('"bundle-v1"');
    await first.text();
    await Promise.all(tasks.splice(0));
    const hit = await app.request(path, {}, env, ctx);
    expect(hit.headers.get("X-Edge-Cache")).toBe("HIT");
    expect(get).toHaveBeenCalledOnce();
    const missing = await app.request(path, {}, { DB: db }, ctx);
    expect(missing.status).toBe(503);
    expect(missing.headers.get("Cache-Control")).toMatch(/no-store/);
    expect(cache.put).toHaveBeenCalledOnce();
  });

  it("measures D1 query invocations for 30 repeated public refresh GETs: 60 -> 2", async () => {
    memoryEdgeCache();
    const all = vi.fn(async () => ({ results: [] }));
    const db = { prepare: () => ({ all }) } as unknown as D1Database;
    for (let i = 0; i < 30; i++) expect((await app.request("/api/refresh/status", {}, { DB: db, EDGE_CACHE_MODE: "off" }, ctx)).status).toBe(200);
    expect(all).toHaveBeenCalledTimes(60);
    all.mockClear();
    for (let i = 0; i < 30; i++) {
      expect((await app.request("/api/refresh/status", {}, { DB: db }, ctx)).status).toBe(200);
      await Promise.all(tasks.splice(0));
    }
    expect(all).toHaveBeenCalledTimes(2);
    console.log("D1 boundary query invocations, 30 GET /api/refresh/status: off=60, on=2 (instrumented binding; not production rows_read)");
  });
});
