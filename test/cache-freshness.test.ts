import { afterEach, expect, it, vi } from "vitest";
import { cached, clearMemoryCache, withCacheContext } from "../src/worker/lib/cache";

afterEach(() => { clearMemoryCache(); vi.useRealTimers(); });

it("shares a cold request and never caches rejected or fallback-shaped loads", async () => {
  let finish!: (value: number) => void;
  const load = vi.fn(() => new Promise<number>(resolve => { finish = resolve; }));
  const a = cached(undefined, "cold", 60, load);
  const b = cached(undefined, "cold", 60, load);
  expect(load).toHaveBeenCalledTimes(1);
  finish(42);
  expect((await a).value).toBe(42); expect((await b).value).toBe(42);
  const fail = vi.fn().mockRejectedValue(new Error("offline"));
  await expect(cached(undefined, "fail", 60, fail)).rejects.toThrow("offline");
  await expect(cached(undefined, "fail", 60, fail)).rejects.toThrow("offline");
  expect(fail).toHaveBeenCalledTimes(2);
  const fallback = vi.fn().mockResolvedValue(null);
  const policy = { softTtlSeconds: 60, staleSeconds: 60, cacheable: (v: unknown) => v !== null };
  await cached(undefined, "fallback", policy, fallback); await cached(undefined, "fallback", policy, fallback);
  expect(fallback).toHaveBeenCalledTimes(2);
});

it("reads stale D1 rows, refreshes in context, and blocks past the original hard limit", async () => {
  vi.useFakeTimers(); vi.setSystemTime(10_000);
  const row = { value: JSON.stringify({ rain: 12 }), expires_at: 30_000, created_at: 0 };
  const db = { prepare: () => ({ bind: () => ({ first: async () => row, run: async () => ({}) }) }) } as unknown as D1Database;
  const pending: Promise<unknown>[] = [];
  const ctx = { waitUntil: (p: Promise<unknown>) => { pending.push(p); } };
  const load = vi.fn().mockRejectedValue(new Error("offline"));
  const policy = { softTtlSeconds: 5, staleSeconds: 25 };
  expect(await withCacheContext(ctx, () => cached(db, "d1-stale", policy, load))).toEqual({ value: { rain: 12 }, cache: "d1" });
  await Promise.all(pending);
  vi.setSystemTime(30_001);
  await expect(withCacheContext(ctx, () => cached(db, "d1-stale", policy, load))).rejects.toThrow("offline");
  expect(load).toHaveBeenCalledTimes(2);
});

it("does not extend a publication boundary by time spent downloading", async () => {
  vi.useFakeTimers(); vi.setSystemTime(1_000);
  const load = vi.fn(async () => { vi.setSystemTime(1_500); return 42; });
  const policy = { softTtlSeconds: 60, staleSeconds: 0, expiresAt: 2_000 };
  await cached(undefined, "release", policy, load);
  vi.setSystemTime(2_001);
  await cached(undefined, "release", policy, load);
  expect(load).toHaveBeenCalledTimes(2);
});

it("serves stale immediately and deduplicates refreshes without caching failures", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-01T00:00:00Z"));
  const pending: Promise<unknown>[] = [];
  const ctx = { waitUntil: (p: Promise<unknown>) => { pending.push(p); } };
  let finish!: (v: { rain: number }) => void;
  const load = vi.fn().mockResolvedValueOnce({ rain: 12 }).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockRejectedValueOnce(new Error("offline"));
  const policy = { softTtlSeconds: 10, staleSeconds: 60 };
  await cached(undefined, "test:swr", policy, load);
  vi.advanceTimersByTime(11_000);
  const results = await withCacheContext(ctx, () => Promise.all([
    cached(undefined, "test:swr", policy, load), cached(undefined, "test:swr", policy, load),
  ]));
  expect(results.map(r => r.value)).toEqual([{ rain: 12 }, { rain: 12 }]);
  expect(load).toHaveBeenCalledTimes(2);
  finish({ rain: 18 });
  await Promise.all(pending);
  expect((await cached(undefined, "test:swr", policy, load)).value).toEqual({ rain: 18 });
  vi.advanceTimersByTime(11_000);
  await withCacheContext(ctx, () => cached(undefined, "test:swr", policy, load));
  await Promise.all(pending);
  expect((await withCacheContext(ctx, () => cached(undefined, "test:swr", policy, load))).value).toEqual({ rain: 18 });
});
