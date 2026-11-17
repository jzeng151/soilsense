import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { crosscheckText } from "../src/worker/data/crosscheckHttp";
import { getCrosscheckPower, getCrosscheckDaymet } from "../src/worker/data/crosscheckWeather";
import { prismStability, parsePrismCsv } from "../src/worker/data/prism";
import { clearMemoryCache } from "../src/worker/lib/cache";
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); clearMemoryCache(); });
describe("PRISM evidence robustness", () => {
  it("bounds a body that stalls after successful headers", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(new ReadableStream({ start() {} }))));
    const pending = crosscheckText("https://example.invalid", {}, 10);
    const check = expect(pending).rejects.toThrow("deadline");
    await vi.advanceTimersByTimeAsync(11); await check;
  });
  it("rejects oversized bodies and HTTP failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response("x".repeat(1024 * 1024 + 1))).mockResolvedValueOnce(new Response("provider error", { status: 503 })));
    await expect(crosscheckText("https://example.invalid")).rejects.toThrow("1 MiB");
    await expect(crosscheckText("https://example.invalid")).rejects.toThrow("503");
  });
  it("shares grid data without attaching another field's requested point; UTC/LST cache keys differ", async () => {
    const raw = JSON.parse(readFileSync("test/fixtures/prism/power-daily-utc-20230509-20230512.json", "utf8"));
    raw.header.time_standard = "LST";
    raw.properties.parameter.PRECTOTCORR["20230509"] = -0.5;
    raw.properties.parameter.T2M_MIN["20230509"] = -5;
    const fetcher = vi.fn(async () => new Response(JSON.stringify(raw))); vi.stubGlobal("fetch", fetcher);
    const first = await getCrosscheckPower(undefined, 38.01, -101.25, "2023-05-09", "2023-05-12");
    const second = await getCrosscheckPower(undefined, 38.02, -101.25, "2023-05-09", "2023-05-12");
    expect(first.source.requestedPoint.lat).toBe(38.01); expect(second.source.requestedPoint.lat).toBe(38.02); expect(fetcher).toHaveBeenCalledTimes(1);
    expect(first.rows[0]).toMatchObject({ rain: null, tmin: -5 });
    raw.header.time_standard = "UTC";
    expect((await getCrosscheckPower(undefined, 38.02, -101.25, "2023-05-09", "2023-05-12", "UTC")).dayBoundary).toBe("UTC midnight");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("keeps negative temperatures but not negative PRISM or Daymet rainfall", async () => {
    const csv = readFileSync("test/fixtures/prism/prism-20230501-20230503.csv", "utf8").replace("2023-05-01,0.00,3.1", "2023-05-01,-0.5,-5");
    expect(parsePrismCsv(csv).rows[0]).toMatchObject({ rain: null, tmin: -5 });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Version 4 R1\nyear,yday,prcp (mm/day),tmax (deg c),tmin (deg c)\n2023,121,-0.5,10,-5")));
    expect((await getCrosscheckDaymet(undefined, 38, -101.25, "2023-05-01", "2023-05-01")).rows[0]).toMatchObject({ rain: null, tmin: -5 });
  });
  it("does not call yesterday's previous-year grid stable at the January year boundary", () => {
    expect(prismStability("2023-12-31", new Date("2024-01-01T00:00:00Z"))).toContain("provisional");
    expect(prismStability("2023-05-01", new Date("2024-01-01T00:00:00Z"))).toContain("stable");
  });
});
