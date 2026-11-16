import { expect, it } from "vitest";
import { DAY_SECONDS } from "../src/worker/lib/cache";
import { powerPolicy, modisPolicy, soilRelease, usdmTtl, kstateTtl } from "../src/worker/lib/freshness";
it("uses publication windows, not observation sampling frequency", () => {
  expect(powerPolicy(2025, new Date("2026-01-20Z")).softTtlSeconds).toBe(DAY_SECONDS);
  expect(powerPolicy(2025, new Date("2026-05-01Z")).softTtlSeconds).toBe(365 * DAY_SECONDS);
  expect(modisPolicy(2026, new Date("2026-07-01Z")).softTtlSeconds).toBe(16 * DAY_SECONDS);
  expect(soilRelease(new Date("2026-09-30Z"))).toBe(2025);
  expect(soilRelease(new Date("2026-10-01Z"))).toBe(2026);
});
it("expires USDM at Thursday 08:30 Eastern across both DST changes", () => {
  expect(usdmTtl(new Date("2026-07-09T12:29:00Z"))).toBe(60);
  expect(usdmTtl(new Date("2026-01-08T13:29:00Z"))).toBe(60);
  expect(usdmTtl(new Date("2026-03-05T13:30:00Z"))).toBe(601200);
  expect(usdmTtl(new Date("2026-10-29T12:30:00Z"))).toBe(608400);
});
it("matches the team publisher Monday 13:23 UTC job and its publish window", () => {
  expect(kstateTtl(new Date("2026-07-06T12:59:00Z"))).toBe(3660);
  expect(kstateTtl(new Date("2026-07-06T14:00:00Z"))).toBe(3600);
});
