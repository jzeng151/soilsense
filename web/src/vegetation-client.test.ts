import { afterEach, expect, it, vi } from "vitest";
import { fetchVegetation } from "./api";

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it("bounds MODIS requests while retaining caller cancellation", async () => {
  const deadline = new AbortController();
  const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(deadline.signal);
  const caller = new AbortController();
  let combined: AbortSignal | undefined;
  vi.stubGlobal("fetch", vi.fn(async (_url, options) => {
    combined = options.signal;
    return new Response(JSON.stringify({ status: "unavailable" }));
  }));
  await fetchVegetation(38, -100, 2025, caller.signal);
  expect(timeout).toHaveBeenCalledWith(90_000);
  expect(combined?.aborted).toBe(false);
  caller.abort();
  expect(combined?.aborted).toBe(true);
});

it("passes the deadline to fetch even without caller cancellation", async () => {
  const deadline = new AbortController();
  vi.spyOn(AbortSignal, "timeout").mockReturnValue(deadline.signal);
  const fetcher = vi.fn(async () => new Response(JSON.stringify({ status: "unavailable" })));
  vi.stubGlobal("fetch", fetcher);
  await fetchVegetation(38, -100, 2025);
  expect(fetcher).toHaveBeenCalledWith(expect.any(String), { signal: deadline.signal });
});
