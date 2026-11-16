import { afterEach, expect, it, vi } from "vitest";
import { cached, clearMemoryCache } from "../src/worker/lib/cache";
afterEach(() => { clearMemoryCache(); vi.restoreAllMocks(); });
it("serves a valid KV geography lookup without querying D1", async () => {
  const kv = { get: vi.fn(async () => ({ value: JSON.stringify({ zip: "67846" }), expires: Date.now() + 3600000 })) } as unknown as KVNamespace;
  const db = { prepare: vi.fn() } as unknown as D1Database;
  const load = vi.fn();
  expect(await cached(db, "zip:v1:67846", 86400, load, { kv })).toEqual({ value: { zip: "67846" }, cache: "kv" });
  expect(db.prepare).not.toHaveBeenCalled();
  expect(load).not.toHaveBeenCalled();
});

it("falls back when KV is unbound, unavailable, corrupt or expired and preserves D1 expiration", async () => {
  const expires = Date.now() + 3600000;
  const first = vi.fn(async () => ({ value: '{"countyFips":"20055"}', expires_at: expires }));
  const db = { prepare: () => ({ bind: () => ({ first }) }) } as unknown as D1Database;
  for (const response of [undefined, new Error("KV down"), { value: "invalid", expires }, { value: "{}", expires: 1 }]) {
    clearMemoryCache();
    const put = vi.fn(async (_key: string, _value: string, _options: unknown) => {});
    const kv = response === undefined ? undefined : { get: async () => { if (response instanceof Error) throw response; return response; }, put } as unknown as KVNamespace;
    expect(await cached(db, "county:v1:38.0:-100.0", 31536000, vi.fn(), { kv })).toEqual({ value: { countyFips: "20055" }, cache: "d1" });
    if (kv) {
      expect(put).toHaveBeenCalledOnce();
      expect(JSON.parse(put.mock.calls[0]![1]).expires).toBe(expires);
    }
  }
});

it.each(["miss", "expired", "unavailable"])("checks primary on a replica %s instead of overwriting a newer primary entry", async state => {
  const first = vi.fn(async () => ({ value: '{"zip":"67846"}', expires_at: Date.now() + 3600000 }));
  const replicaFirst = vi.fn(async () => {
    if (state === "unavailable") throw new Error("replica unavailable");
    return state === "expired" ? { value: '{"zip":"old"}', expires_at: 1 } : null;
  });
  const withSession = vi.fn(() => ({ prepare: () => ({ bind: () => ({ first: replicaFirst }) }) }));
  const db = { prepare: () => ({ bind: () => ({ first }) }), withSession } as unknown as D1Database;
  const load = vi.fn();
  expect((await cached(db, "zip:v1:67846", 86400, load, { readReplica: true })).value).toEqual({ zip: "67846" });
  expect(withSession).toHaveBeenCalledWith("first-unconstrained");
  expect(first).toHaveBeenCalledOnce();
  expect(load).not.toHaveBeenCalled();
});

it("never uses KV or replicas for mutable plan or measurement keys, even with options", async () => {
  const first = vi.fn(async () => ({ value: '{"plan":"new"}', expires_at: Date.now() + 3600000 }));
  const withSession = vi.fn();
  const kv = { get: vi.fn(), put: vi.fn() };
  const db = { prepare: () => ({ bind: () => ({ first }) }), withSession } as unknown as D1Database;
  expect((await cached(db, "plan:v1:private", 86400, vi.fn(), { kv: kv as unknown as KVNamespace, readReplica: true })).value).toEqual({ plan: "new" });
  expect(withSession).not.toHaveBeenCalled();
  expect(kv.get).not.toHaveBeenCalled();
  expect(kv.put).not.toHaveBeenCalled();
});

it("warms KV after a geography miss and serves the next cold isolate without D1", async () => {
  let envelope: unknown;
  const kv = { get: async () => envelope ?? null, put: vi.fn(async (_key: string, value: string) => { envelope = JSON.parse(value); }) } as unknown as KVNamespace;
  const first = vi.fn(async () => null);
  const run = vi.fn(async () => ({}));
  const prepare = vi.fn(() => ({ bind: () => ({ first, run }) }));
  const db = { prepare } as unknown as D1Database;
  const load = vi.fn(async () => ({ zip: "67846" }));
  expect((await cached(db, "zip:v1:67846", 86400, load, { kv })).cache).toBe("miss");
  expect(prepare).toHaveBeenCalledTimes(2);
  clearMemoryCache();
  expect((await cached(db, "zip:v1:67846", 86400, load, { kv })).cache).toBe("kv");
  expect(prepare).toHaveBeenCalledTimes(2);
});
