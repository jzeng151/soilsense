import { beforeEach, expect, it, vi } from "vitest";
import { api } from "../src/worker/routes/api";
import { clearMemoryCache } from "../src/worker/lib/cache";
const source = vi.hoisted(() => vi.fn(async () => { throw new Error("unexpected source work on a cache miss"); }));
vi.mock("../src/worker/data/power", () => ({ getDailyClimate: source }));
const ctx = { waitUntil: () => {}, passThroughOnException: () => {}, props: {} } as unknown as ExecutionContext;
const request = { lat: 38.1095, lon: -100.706, irrigated: true, priority: "balanced" };
beforeEach(() => { clearMemoryCache(); source.mockClear(); });
it("returns a structured retryable response before downloading weather or running an over-budget engine", async () => {
  const res = await api.request("/plan", { method: "POST", headers: { "Content-Type": "application/json", "CF-Connecting-IP": "budget-test" }, body: JSON.stringify(request) }, { PLAN_COMPUTE_MODE: "cache-only" }, ctx);
  expect(res.status).toBe(503);
  expect(await res.json()).toMatchObject({ code: "PLAN_NOT_READY" });
  expect(res.headers.get("Retry-After")).toBe("60");
  expect(source).not.toHaveBeenCalled();
});
it("does not leak farmer measurements into the shared fallback cache", async () => {
  const res = await api.request("/plan", { method: "POST", headers: { "Content-Type": "application/json", "CF-Connecting-IP": "budget-test-private" }, body: JSON.stringify({ ...request, soilTest: { ph: 6 } }) }, { PLAN_COMPUTE_MODE: "cache-only" }, ctx);
  expect(res.status).toBe(503);
  expect(res.headers.get("Cache-Control")).toBe("private, no-store");
  expect(source).not.toHaveBeenCalled();
});
