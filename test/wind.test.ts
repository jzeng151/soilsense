// Wind inputs and wind-erosion exposure screen (issues #17, #40). Fixtures are real responses retrieved 2026-11-14:
// NASA POWER daily WS10M/WS10M_MAX for the Finney County grid cell (38.0, -100.625), 2021-2025, and Soil Data Access
// rows for the Finney and Story demo points. See test/fixtures/wind/README.md.
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildWindScreen, expectedWindyDays, isWindy, monthStats, protectionFor, recentSeason, screenRotation, WIND_RULE } from "../src/engine/windErosion";
import { getDailyWind, parseWind } from "../src/worker/data/powerWind";
import { parseWindSoil } from "../src/worker/data/soilWind";
import { clearMemoryCache } from "../src/worker/lib/cache";
import app from "../src/worker/index";

const load = (f: string) => JSON.parse(readFileSync(new URL(`./fixtures/wind/${f}`, import.meta.url), "utf8"));
const powerJson = load("power-wind-finney-2021-2025.json");
const wind = parseWind(powerJson, "https://example.test/power", "2026-11-14T00:00:00Z");
const finneySoil = parseWindSoil(load("sda-wind-finney.json"), "2026-11-14T00:00:00Z");
const storySoil = parseWindSoil(load("sda-wind-story.json"), "2026-11-14T00:00:00Z");
const ctx = { waitUntil: () => {}, passThroughOnException: () => {}, props: {} } as unknown as ExecutionContext;

afterEach(() => {
  vi.unstubAllGlobals();
  clearMemoryCache();
});

describe("wind threshold", () => {
  it("18 mph = 8.04672 m/s, inclusive comparison", () => {
    expect(WIND_RULE.thresholdMs).toBeCloseTo(8.04672, 6);
    expect(isWindy(8.04)).toBe(false); // just below
    expect(isWindy(8.04672)).toBe(true); // at
    expect(isWindy(8.05)).toBe(true); // above
  });
  it("missing or invalid values are excluded, never zero wind", () => {
    expect(isWindy(null)).toBeNull();
    expect(isWindy(Number.NaN)).toBeNull();
    expect(isWindy(-999)).toBeNull();
  });
});

describe("POWER wind snapshot", () => {
  it("records parameters, height, units, grid, dates and missing days", () => {
    expect(wind.meta.parameters.map((p) => p.id)).toEqual(["WS10M_MAX", "WS10M"]);
    expect(wind.meta.parameters.every((p) => p.units === "m/s" && p.heightM === 10)).toBe(true);
    expect(wind.meta.parameters[0]!.definition).toContain("maximum hourly wind speed at 10 meters");
    expect(wind.meta.grid).toMatchObject({ lat: 38, lon: -100.625 });
    expect(wind.meta.start).toBe("2021-01-01");
    expect(wind.meta.end).toBe("2025-12-31");
    expect(wind.meta.validDays.WS10M_MAX + wind.meta.missingDays.WS10M_MAX).toBe(1826);
    expect(wind.meta.timeStandard).toBe("LST");
  });

  it("reconciles sample values with the source", () => {
    const i = wind.series.dates.indexOf("2021-03-02");
    expect(wind.series.ws10mMax[i]).toBe(powerJson.properties.parameter.WS10M_MAX["20210302"]);
    expect(wind.series.ws10m[i]).toBe(powerJson.properties.parameter.WS10M["20210302"]);
  });

  it("fill values become missing and drop out of denominators", () => {
    const j = structuredClone(powerJson);
    j.properties.parameter.WS10M_MAX["20250203"] = -999;
    const w = parseWind(j, "u", "t");
    expect(w.meta.missingDays.WS10M_MAX).toBe(wind.meta.missingDays.WS10M_MAX + 1);
    const feb = monthStats(w.series)[0]!;
    const feb0 = monthStats(wind.series)[0]!;
    expect(feb.validDays).toBe(feb0.validDays - 1);
  });
});

describe("exposure screen", () => {
  it("monthly windy-day counts match an independent count of the fixture", () => {
    // Independent count (Python over the raw JSON): Feb 2021-2025 = 10+10+16+13+11 = 60 windy of 141 valid days.
    const [feb, mar, apr, may] = monthStats(wind.series);
    expect(feb).toMatchObject({ month: 2, windyDays: 60, validDays: 141 });
    expect(mar).toMatchObject({ windyDays: 22 + 18 + 16 + 15 + 20, validDays: 155 });
    expect(apr).toMatchObject({ windyDays: 16 + 23 + 17 + 14 + 16, validDays: 150 });
    expect(may).toMatchObject({ windyDays: 13 + 18 + 8 + 12 + 14, validDays: 155 });
    const season = recentSeason(wind.series)!;
    expect(season.year).toBe(2025);
    expect(season.windyDays).toBe(11 + 20 + 16 + 14);
    expect(season.validDays).toBe(120);
  });

  it("protection is living cover or unknown, never assumed bare", () => {
    expect(protectionFor("winter_wheat", "sorghum", null).state).toBe("living-cover");
    expect(protectionFor("corn", "soybean", "cereal_rye").state).toBe("living-cover");
    expect(protectionFor("corn", "soybean", "none").state).toBe("unknown");
    expect(protectionFor("fallow", "winter_wheat", "none").state).toBe("unknown");
    expect(protectionFor("alfalfa", "alfalfa", null).state).toBe("living-cover");
    expect(protectionFor("alfalfa", "oats", null).state).toBe("unknown");
  });

  it("equivalent scenarios tie; covers change the split, not a score", () => {
    const windy = expectedWindyDays(monthStats(wind.series));
    const a = screenRotation({ label: "A", years: [{ year: 2027, crop: "corn", cover: "none" }, { year: 2028, crop: "soybean", cover: "none" }] }, "soybean", windy);
    const b = screenRotation({ label: "B", years: [{ year: 2027, crop: "corn", cover: "none" }, { year: 2028, crop: "soybean", cover: "none" }] }, "soybean", windy);
    expect(a.windyDaysWithoutLivingCover).toBe(b.windyDaysWithoutLivingCover);
    const withRye = screenRotation({ label: "C", years: [{ year: 2027, crop: "corn", cover: "cereal_rye" }, { year: 2028, crop: "soybean", cover: "none" }] }, "soybean", windy);
    expect(withRye.windyDaysWithoutLivingCover!).toBeLessThan(a.windyDaysWithoutLivingCover!);
    expect(withRye.windyDaysWithLivingCover! + withRye.windyDaysWithoutLivingCover!).toBeCloseTo(windy!, 0);
  });

  it("missing wind stays unknown", () => {
    const s = buildWindScreen({ series: null, meta: null, soil: finneySoil, rotations: [{ label: "x", years: [{ year: 2027, crop: "corn", cover: "none" }] }], lastCrop: null });
    expect(s.status).toBe("unavailable");
    expect(s.months.every((m) => m.share === null)).toBe(true);
    expect(s.rotations[0]!.windyDaysWithoutLivingCover).toBeNull();
  });
});

describe("SSURGO wind erodibility", () => {
  it("keeps every component with its own categorical WEG and reference WEI", () => {
    expect(finneySoil.mapUnitName).toBe("Richfield silt loam, 0 to 1 percent slopes");
    expect(finneySoil.surveyArea).toBe("KS055");
    expect(finneySoil.components.map((c) => [c.name, c.pct, c.weg, c.wei])).toEqual([
      ["Richfield", 93, "5", 56],
      ["Ulysses", 5, "6", 48],
      ["Ness", 2, "6", 48],
    ]);
    // WEG codes like "4L" stay strings: never averaged as numbers.
    expect(storySoil.components.find((c) => c.name === "Storden")!.weg).toBe("4L");
    expect(storySoil.components[0]!.major).toBe(true);
  });
});

describe("wind cache and route (mocked network)", () => {
  it("uses its own versioned cache key and leaves the plan's POWER request alone", async () => {
    const spy = vi.fn(async () => new Response(JSON.stringify(powerJson), { status: 200 }));
    vi.stubGlobal("fetch", spy);
    await getDailyWind(undefined, 38.1095, -100.706, 2021, 2025);
    await getDailyWind(undefined, 38.2, -100.7, 2021, 2025); // same grid cell: cached
    expect(spy).toHaveBeenCalledOnce();
    expect(String((spy.mock.calls[0] as unknown[])[0])).toContain("parameters=WS10M,WS10M_MAX&community=AG&latitude=38&longitude=-100.625");
  });

  it("POST /api/wind-screen returns the screen; bad input is 400", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) =>
        String(input).includes("power.larc") ? new Response(JSON.stringify(powerJson)) : new Response(JSON.stringify(load("sda-wind-finney.json"))),
      ),
    );
    const body = { lat: 38.1095, lon: -100.706, lastCrop: "sorghum", rotations: [{ label: "Wheat-sorghum-fallow", years: [{ year: 2027, crop: "winter_wheat", cover: "none" }, { year: 2028, crop: "sorghum", cover: "none" }, { year: 2029, crop: "fallow", cover: "none" }] }] };
    const res = await app.request("/api/wind-screen", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }, {}, ctx);
    expect(res.status).toBe(200);
    const s = (await res.json()) as { status: string; rotations: { years: { state: string }[] }[]; soil: { components: unknown[] } };
    expect(s.status).toBe("ok");
    expect(s.rotations[0]!.years.map((y) => y.state)).toEqual(["living-cover", "unknown", "unknown"]);
    expect(s.soil.components).toHaveLength(3);
    const bad = await app.request("/api/wind-screen", { method: "POST", body: JSON.stringify({ lat: 38, lon: -100, rotations: [{ years: [{ crop: "tobacco" }] }] }), headers: { "Content-Type": "application/json" } }, {}, ctx);
    expect(bad.status).toBe(400);
  });
});
