import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { aggregatePowerHours, getCrosscheckHourly, type HourlyPower } from "../src/worker/data/crosscheckHourly";
import { getCrosscheckImerg } from "../src/worker/data/crosscheckImerg";
import { parsePrismCsv } from "../src/worker/data/prism";
import { compareWeather } from "../src/engine/weatherCrosscheck";
const raw = JSON.parse(readFileSync("test/fixtures/prism/power-hourly-20230430-20230503.json", "utf8")) as HourlyPower;
const prism = parsePrismCsv(readFileSync("test/fixtures/prism/prism-20230501-20230503.csv", "utf8"));
const synthetic = () => {
  const r = structuredClone(raw);
  for (const series of Object.values(r.properties.parameter)) for (const k of Object.keys(series)) series[k] = 0;
  return r;
};
describe("PRISM common-window hourly aggregation", () => {
  it("uses previous noon through labelled-day 11, not same-label midnight or LST", () => {
    const r = synthetic(), p = r.properties.parameter.PRECTOTCORR!;
    p["2023043011"] = 90; p["2023043012"] = 2; p["2023050111"] = 3; p["2023050112"] = 40;
    const a = aggregatePowerHours(r, "2023-05-01", "2023-05-01");
    expect(a.rows[0]!.rain).toBe(5);
    expect(a.coverage[0]).toMatchObject({ rainHours: 24, boundarySensitivityMm: 87 });
    expect(aggregatePowerHours(r, "2023-05-01", "2023-05-01", 0).rows[0]!.rain).toBe(43);
  });
  it("requires exactly 24 valid hours independently for rain and temperature; zero is real", () => {
    const r = synthetic();
    delete r.properties.parameter.PRECTOTCORR!["2023050104"];
    expect(aggregatePowerHours(r, "2023-05-01", "2023-05-01").rows[0]).toMatchObject({ rain: null, tmin: 0, tmax: 0 });
    r.properties.parameter.PRECTOTCORR!["2023050104"] = -999;
    r.properties.parameter.T2M!["2023050105"] = -999;
    expect(aggregatePowerHours(r, "2023-05-01", "2023-05-01").rows[0]).toMatchObject({ rain: null, tmin: null, tmax: null });
    expect(aggregatePowerHours(synthetic(), "2023-05-01", "2023-05-01").rows[0]!.rain).toBe(0);
  });
  it("rejects LST or changed hourly units; does not align unsupported history", async () => {
    const r = synthetic(); r.header.time_standard = "LST";
    expect(() => aggregatePowerHours(r, "2023-05-01", "2023-05-01")).toThrow();
    r.header.time_standard = "UTC"; r.parameters.PRECTOTCORR!.units = "mm/day";
    expect(() => aggregatePowerHours(r, "2023-05-01", "2023-05-01")).toThrow();
    await expect(getCrosscheckHourly(undefined, 38, -101.25, "2001-01-01", "2001-01-01")).rejects.toThrow();
  });
  it("replays the conditional hourly window recipe without certifying timestamp anchoring", () => {
    const a = aggregatePowerHours(raw, "2023-05-01", "2023-05-03");
    expect(a.coverage.every(d => d.rainHours === 24 && d.temperatureHours === 24)).toBe(true);
    const rows = compareWeather({ id: "PRISM", dayBoundary: "12:00 UTC ending", rows: prism.rows }, { id: "POWER hourly", dayBoundary: "12:00 UTC ending", nonEquivalentVariables: { tmin: "hourly mean extrema", tmax: "hourly mean extrema" }, rows: a.rows }, a.rows.map(d => d.date));
    expect(rows.filter(d => d.variable === "rain").every(d => !d.notComparable && !d.missing)).toBe(true);
    expect(rows.filter(d => d.variable !== "rain").every(d => d.state === "not_comparable")).toBe(true);
    console.info("Recorded real hourly noon aggregation", JSON.stringify(a));
  });
});
describe("cached IMERG leg", () => {
  it("never starts a public Earthdata call; cold cache is missing, not zero", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    try {
      const first = vi.fn().mockResolvedValue(null), bind = vi.fn(() => ({ first }));
      const db = { prepare: vi.fn(() => ({ bind })) } as unknown as D1Database;
      const r = await getCrosscheckImerg(db, 38, -101.25, ["2023-05-01"]);
      expect(r.rows[0]!.rain).toBeNull(); expect(fetch).not.toHaveBeenCalled();
      expect(bind.mock.calls[0]).toEqual([expect.stringContaining("imerg-day:V07:dap4-qa2:final:1280_787:2023-05-01:"), expect.any(Number)]);
    } finally { vi.unstubAllGlobals(); }
  });
  it("reads next's adapter cache and rejects invalid counts without converting them to rain", async () => {
    const observation = { date: "2023-05-01", mm: 0, count: 48, sourceUrl: "https://gpm1.gesdisc.eosdis.nasa.gov/opendap/GPM_L3/GPM_3IMERGDF.07/2023/05/native.dap", revision: "native" };
    const first = vi.fn(async () => ({ value: JSON.stringify(observation) }));
    const db = { prepare: () => ({ bind: () => ({ first }) }) } as unknown as D1Database;
    expect((await getCrosscheckImerg(db, 38, -101.25, ["2023-05-01"])).rows[0]!.rain).toBe(0);
    observation.count = 47;
    await expect(getCrosscheckImerg(db, 38, -101.25, ["2023-05-01"])).rejects.toThrow();
    await expect(getCrosscheckImerg(undefined, 38, -101.25, ["2023-05-01"])).rejects.toThrow();
  });
});
