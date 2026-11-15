// U.S. Drought Monitor context (issue #31). Fixtures are real responses from the USDM data services API
// (county statistics, categorical), retrieved 2026-11-14; see test/fixtures/usdm/README.md.
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  categoryResult,
  expectedValidDates,
  pickWeekFor,
  replayAgreement,
  summarizeTimeline,
  toWeek,
  type UsdmApiRow,
  usdmCountyUrl,
  usdmSource,
} from "../src/engine/usdm";
import { clearUsdmSnapshots, getUsdmTimeline, usdmCategoryFor } from "../src/worker/data/usdm";
import { clearMemoryCache } from "../src/worker/lib/cache";
import app from "../src/worker/index";

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/usdm/${name}`, import.meta.url), "utf8")) as UsdmApiRow[];
const finney2022 = fixture("finney-20055-2022-may-sep.json");
const src = usdmSource("https://example.test/usdm", "2026-11-14T00:00:00Z");
const ctx = { waitUntil: () => {}, passThroughOnException: () => {}, props: {} } as unknown as ExecutionContext;

function mockFetch(handler: (url: string) => unknown) {
  const spy = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const body = handler(url);
    if (body instanceof Error) throw body;
    return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  });
  vi.stubGlobal("fetch", spy);
  return spy;
}

afterEach(() => {
  vi.unstubAllGlobals();
  clearMemoryCache();
  clearUsdmSnapshots();
});

describe("USDM engine", () => {
  it("builds the official request URL (categorical statistics, M/D/YYYY dates)", () => {
    expect(usdmCountyUrl("20055", "2022-05-01", "2022-09-30")).toBe(
      "https://usdmdataservices.unl.edu/api/CountyStatistics/GetDroughtSeverityStatisticsByAreaPercent?aoi=20055&startdate=5/1/2022&enddate=9/30/2022&statisticsType=2",
    );
  });

  it("rejects cumulative (traditional) rows so categories are never double counted", () => {
    // statisticsType=1 row for Finney 2022-03-01 (cumulative: D0 includes D1-D4) adds up to > 100.
    const cumulative = { ...finney2022[0]!, none: 0, d0: 100, d1: 100, d2: 40.62, d3: 9.79, d4: 0 };
    expect(toWeek(cumulative, "KS")).toBeNull();
    expect(toWeek(finney2022[0]!, "KS")).not.toBeNull();
  });

  it("distinguishes no drought, D0, D1-D4 and county splits", () => {
    const base = finney2022[0]!;
    const none = toWeek({ ...base, none: 100, d0: 0, d1: 0, d2: 0, d3: 0, d4: 0 }, "KS")!;
    expect(none.predominant).toBe("none");
    expect(none.mixed).toBe(false);
    const d0 = toWeek({ ...base, none: 44.79, d0: 55.21, d1: 0, d2: 0, d3: 0, d4: 0 }, "KS")!;
    expect(d0.predominant).toBe("D0");
    expect(d0.mixed).toBe(true);
    const champaign = toWeek(fixture("county-17019-2022-07-12.json")[0]!, "IL")!;
    expect(champaign.predominant).toBe("D2");
    expect(champaign.worst).toBe("D2");
    expect(champaign.mixed).toBe(true);
  });

  it("2022 replay check: Finney County May-Sep coverage, target week and category", () => {
    const t = summarizeTimeline({ fips: "20055", start: "2022-05-01", end: "2022-09-30", today: "2026-11-14", rows: finney2022, source: src });
    // Maps valid 2022-04-26 (its week covers May 1) through 2022-09-27: 23 Tuesdays, all observed.
    expect(t.expectedWeeks).toBe(23);
    expect(t.observedWeeks).toBe(23);
    expect(t.missingWeeks).toEqual([]);
    expect(t.status).toBe("complete");
    expect(t.weeks[0]!.validStart).toBe("2022-04-26");
    expect(t.weeks.at(-1)!.validStart).toBe("2022-09-27");
    // Each observed week counted exactly once.
    expect(Object.values(t.counts).reduce((a, b) => a + b, 0)).toBe(t.observedWeeks);
    // Target-date rule: 2022-07-15 (Friday) falls in the map valid 2022-07-12 .. 2022-07-18.
    const pick = pickWeekFor(t.weeks, "2022-07-15", "2026-11-14");
    expect(pick.status).toBe("matched");
    expect(pick.week!.validStart).toBe("2022-07-12");
    // Displayed category for that week: D3 over 88.31% / D4 over 11.69% of the county (USDM statistics).
    // Cross-checked against the official 2022-07-12 USDM GeoJSON: the demo point (38.1095, -100.706) lies in a D3 polygon.
    expect(pick.week!.predominant).toBe("D3");
    expect(pick.week!.worst).toBe("D4");
    // Context, not a requirement: whatever USDM says, the result is reported, never forced.
    const a = replayAgreement(t);
    expect(["drought", "no-drought", "mixed"]).toContain(a.kind);
    expect(a.text).toContain(`of ${t.observedWeeks} observed weeks`);
  });

  it("missing weeks stay missing and are not counted as no drought", () => {
    const rows = finney2022.filter((r) => !r.validStart.startsWith("2022-07-12"));
    const t = summarizeTimeline({ fips: "20055", start: "2022-05-01", end: "2022-09-30", today: "2026-11-14", rows, source: src });
    expect(t.expectedWeeks).toBe(23);
    expect(t.observedWeeks).toBe(22);
    expect(t.missingWeeks).toEqual(["2022-07-12"]);
    expect(t.status).toBe("partial");
    expect(t.counts.none).toBe(0);
    expect(t.note).toContain("22 of 23");
    expect(t.note).toContain("not counted as no drought");
    // A date inside the missing week is never matched to a neighbouring week.
    const pick = pickWeekFor(t.weeks, "2022-07-14", "2026-11-14");
    expect(pick.status).toBe("unavailable");
    expect(pick.week).toBeNull();
  });

  it("before 2000 there is no USDM", () => {
    const t = summarizeTimeline({ fips: "20055", start: "1995-05-01", end: "1995-09-30", today: "2026-11-14", rows: [], source: src });
    expect(t.expectedWeeks).toBe(0);
    expect(t.status).toBe("unavailable");
    expect(t.note).toContain("starts in January 2000");
  });

  it("current checks: only maps released by today are expected; latest vs stale labels", () => {
    // Saturday 2026-11-14: newest possible map is valid Tuesday 2026-11-10 (released Thursday 11-12).
    expect(expectedValidDates("2026-11-01", "2026-11-14", "2026-11-14")).toEqual(["2026-10-27", "2026-11-03", "2026-11-10"]);
    // Wednesday 2026-11-11: the 11-10 map is not out yet.
    expect(expectedValidDates("2026-11-01", "2026-11-11", "2026-11-11")).toEqual(["2026-10-27", "2026-11-03"]);
    const w = toWeek({ ...finney2022[0]!, validStart: "2026-11-03T00:00:00", validEnd: "2026-11-09T23:59:59", mapDate: "2026-11-03T00:00:00" }, "KS")!;
    const latest = categoryResult({ fips: "20055", date: "2026-11-11", today: "2026-11-11", weeks: [w], countyName: "Finney County", stateCode: "KS", source: src });
    expect(latest.status).toBe("latest");
    expect(latest.historical).toBe(false);
    const stale = categoryResult({ fips: "20055", date: "2026-11-20", today: "2026-11-20", weeks: [w], countyName: "Finney County", stateCode: "KS", source: src });
    expect(stale.status).toBe("stale");
    expect(stale.label).toMatch(/^Stale:/);
    const hist = categoryResult({ fips: "20055", date: "2026-11-05", today: "2026-12-30", weeks: [w], countyName: "Finney County", stateCode: "KS", source: src });
    expect(hist.historical).toBe(true);
    expect(hist.label).toMatch(/^Historical:/);
    expect(hist.snapshotId).toBe("usdm-county-20055-2026-11-03");
  });

  it("source metadata carries official attribution and a dated map link", () => {
    const w = toWeek(finney2022[0]!, "KS")!;
    expect(w.mapUrl).toMatch(/^https:\/\/droughtmonitor\.unl\.edu\/data\/png\/\d{8}\/\d{8}_KS_trd\.png$/);
    expect(src.attribution).toContain("National Drought Mitigation Center");
    expect(src.attribution).toContain("courtesy of NDMC");
    expect(src.spatial).toMatch(/not a field-level measurement/);
  });
});

describe("USDM worker client and routes (mocked network)", () => {
  it("usdmCategoryFor returns the dated category", async () => {
    const spy = mockFetch(() => finney2022.filter((r) => r.validStart >= "2022-06-21" && r.validStart <= "2022-07-12T23"));
    const r = await usdmCategoryFor("20055", "2022-07-15", { now: new Date("2026-11-14T12:00:00Z") });
    expect(spy).toHaveBeenCalledOnce();
    expect(String(spy.mock.calls[0]![0])).toContain("aoi=20055&startdate=6/24/2022&enddate=7/15/2022&statisticsType=2");
    expect(r.status).toBe("matched");
    expect(r.historical).toBe(true);
    expect(r.week!.predominant).toBe("D3");
    expect(r.label).toContain("D3 extreme drought over 88% of Finney County, KS");
  });

  it("unavailable service gives an explicit unavailable state, not no drought", async () => {
    mockFetch(() => new Error("network down"));
    const r = await usdmCategoryFor("20055", "2022-07-15", { now: new Date("2026-11-14T12:00:00Z") });
    expect(r.status).toBe("unavailable");
    expect(r.week).toBeNull();
    const t = await getUsdmTimeline(undefined, "20055", "2022-05-01", "2022-09-30", new Date("2026-11-14T12:00:00Z"));
    expect(t.status).toBe("unavailable");
    expect(t.counts.none).toBe(0);
  });

  it("keeps the last valid snapshot when a current refresh fails", async () => {
    const recent = [{ ...finney2022[0]!, validStart: "2026-11-10T00:00:00", validEnd: "2026-11-16T23:59:59", mapDate: "2026-11-10T00:00:00" }];
    mockFetch(() => recent);
    const ok = await usdmCategoryFor("20055", "2026-11-14", { now: new Date("2026-11-14T12:00:00Z") });
    expect(ok.status).toBe("matched");
    clearMemoryCache(); // the cached response is gone, but the snapshot store keeps the last valid map
    mockFetch(() => new Error("network down"));
    const later = await usdmCategoryFor("20055", "2026-11-21", { now: new Date("2026-11-21T12:00:00Z") });
    expect(later.status).toBe("stale");
    expect(later.week!.validStart).toBe("2026-11-10");
  });

  it("GET /api/usdm/replay returns timelines with agreement text; bad input is 400", async () => {
    mockFetch(() => finney2022);
    const res = await app.request("/api/usdm/replay?fips=20055&years=2022", {}, {}, ctx);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { timelines: { observedWeeks: number; agreement: { text: string } }[] };
    expect(body.timelines[0]!.observedWeeks).toBe(23);
    expect(body.timelines[0]!.agreement.text).toContain("observed weeks");
    expect((await app.request("/api/usdm/category?fips=abc", {}, {}, ctx)).status).toBe(400);
    expect((await app.request("/api/usdm/timeline?fips=20055&start=2022-09-01&end=2022-05-01", {}, {}, ctx)).status).toBe(400);
  });
});
