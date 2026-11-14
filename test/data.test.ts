import { describe, expect, it } from "vitest";
import { toConusAlbers } from "../src/worker/data/albers";
import { parseCdlValue } from "../src/worker/data/cdl";
import { snapToPowerGrid } from "../src/worker/data/power";
import { parseSoil, soilQuery } from "../src/worker/data/soil";

describe("toConusAlbers (EPSG:5070)", () => {
  // Reference values from pyproj (EPSG:4326 → EPSG:5070).
  const cases: [number, number, number, number][] = [
    [42.03, -93.62, 195689.165, 2116718.736],
    [37.97, -100.87, -423585.839, 1670318.047],
    [40.11, -88.24, 654936.847, 1926056.875],
    [23, -96, 0, 0],
    [47.2, -120.5, -1845674.585, 2929053.623],
  ];
  it.each(cases)("lat %f lon %f", (lat, lon, x, y) => {
    const r = toConusAlbers(lat, lon);
    expect(Math.abs(r.x - x)).toBeLessThan(0.5);
    expect(Math.abs(r.y - y)).toBeLessThan(0.5);
  });
});

describe("parseCdlValue", () => {
  it("parses the CropScape response body", () => {
    const xml = `<ns1:GetCDLValueResponse xmlns:ns1="http://nassgeodata.gmu.edu/"><Result>{x: 195689.17, y: 2116718.74, value: 5, category: "Soybeans", color: "#267000"}</Result></ns1:GetCDLValueResponse>`;
    expect(parseCdlValue(xml)).toEqual({ code: 5, name: "Soybeans" });
  });
  it("returns null on garbage", () => {
    expect(parseCdlValue("error")).toBeNull();
  });
});

describe("snapToPowerGrid", () => {
  it("snaps to the 0.5 x 0.625 degree MERRA-2 grid", () => {
    expect(snapToPowerGrid(42.03, -93.62)).toEqual({ lat: 42, lon: -93.75 });
  });
});

describe("soil", () => {
  it("builds a point query", () => {
    expect(soilQuery(42.03, -93.62)).toContain("point(-93.620000 42.030000)");
    expect(() => soilQuery(Number.NaN, 1)).toThrow();
  });
  it("parses real SDA rows (Clarion loam, Story County IA)", () => {
    const h = ["mukey", "muname", "cokey", "compname", "comppct_r", "drainagecl", "hzdept_r", "hzdepb_r", "ph1to1h2o_r", "om_r", "claytotal_r", "sandtotal_r", "awc_r"];
    const r = (top: string, bot: string, ph: string, om: string, awc: string) => ["2765537", "Clarion loam, Bemis moraine, 2 to 6 percent slopes", "1", "Clarion", "85", "Well drained", top, bot, ph, om, "21", "45", awc];
    const soil = parseSoil({ Table: [h, r("0", "23", "6.2", "3.5", "0.21"), r("23", "35", "6.2", "2.5", "0.18"), r("35", "84", "6.6", "0.75", "0.18")] });
    expect(soil.available).toBe(true);
    expect(soil.componentName).toBe("Clarion");
    expect(soil.ph).toBeCloseTo(6.2, 5);
    expect(soil.organicMatterPct).toBeCloseTo((3.5 * 23 + 2.5 * 7) / 30, 5);
    expect(soil.profileDepthCm).toBe(84);
  });
  it("handles empty results", () => {
    expect(parseSoil({}).available).toBe(false);
  });
});
