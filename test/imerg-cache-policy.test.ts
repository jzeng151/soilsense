import { afterEach, expect, it, vi } from "vitest";
import { clearMemoryCache } from "../src/worker/lib/cache";
import { warmComparison } from "../src/worker/imerg/comparison";
import { imerg } from "../src/worker/imerg/routes";
import { imergTtlSeconds } from "../src/worker/imerg/cache-policy";
vi.mock("../src/worker/imerg/client", async (importOriginal) => ({
  ...await importOriginal<typeof import("../src/worker/imerg/client")>(),
  // Explicit synthetic fixture: only exercising cache retention, not NASA retrieval.
  retrieveSubset: vi.fn(async (_env, _lat, _lon, start, end, stream) => ({ start, end, stream, observations: Array.from({ length: 14 }, () => ({ mm: 1 })) })),
}));
afterEach(() => { clearMemoryCache(); vi.restoreAllMocks(); vi.useRealTimers(); });
it("retains Final comparisons across the old 30-day expiry in D1 while Late expires after one hour", async () => {
  vi.useFakeTimers();
  const rows = new Map<string, { value: string; expires_at: number }>();
  const db = { prepare: (sql: string) => ({ bind: (...args: unknown[]) => ({
    first: async () => rows.get(args[0] as string) ?? null,
    run: async () => { if (sql.startsWith("INSERT")) rows.set(args[0] as string, { value: args[1] as string, expires_at: args[2] as number }); return { success: true }; },
  }) }) } as unknown as D1Database;
  const values = Object.fromEntries(Array.from({ length: 14 }, (_, i) => [`202207${String(i + 1).padStart(2, "0")}`, 1]));
  const fetcher = vi.spyOn(globalThis, "fetch").mockImplementation(async () => Response.json({ header: { fill_value: -999 }, parameters: { PRECTOTCORR: { units: "mm/day" } }, properties: { parameter: { PRECTOTCORR: values } } }));
  const field = { id: "finney-ks", lat: 38.1095, lon: -100.706 };
  const now = Date.now();
  await warmComparison({ DB: db }, field, "2022-07-14", "final");
  await warmComparison({ DB: db }, field, "2022-07-14", "late");
  expect([...rows.values()].map(r => r.expires_at - now).sort((a,b) => a-b)).toEqual([3600 * 1000, 365 * 86400 * 1000]);
  clearMemoryCache(); fetcher.mockClear();
  await vi.advanceTimersByTimeAsync(31 * 86400 * 1000);
  const read = async (stream: string) => (await imerg.request(`/comparison/finney-ks?end=2022-07-14&stream=${stream}`, {}, { DB: db })).json();
  expect(await read("final")).toMatchObject({ state: "available", imergMm: 14, powerMm: 14 });
  expect(await read("late")).toMatchObject({ state: "unavailable" });
  expect(fetcher).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(335 * 86400 * 1000);
  expect(await read("final")).toMatchObject({ state: "unavailable" });
  expect(imergTtlSeconds("late")).toBe(3600);
});
