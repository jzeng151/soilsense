import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { rotationCrops, toSecondOpinion } from "../src/worker/data/kstate";
import { matchRank, partialOverlap } from "../src/shared/secondOpinion";

const file = JSON.parse(readFileSync("kansas-crop-rotation/data/app_rotation_advice.json", "utf-8"));

describe("K-State second opinion", () => {
  it("maps rotation codes to our crops", () => {
    expect(rotationCrops("W-S-F")).toEqual(["winter_wheat", "sorghum", "fallow"]);
    expect(rotationCrops("C-W-dSb")).toEqual(["corn", "winter_wheat", "soybean"]);
    expect(rotationCrops("X-F")).toEqual([]);
  });

  it("reads a Kansas county and leaves others out", () => {
    const op = toSecondOpinion(file, "20055");
    expect(op?.county).toBe("Finney County");
    expect(op?.rotations.length).toBeGreaterThan(0);
    expect(op?.rotations.reduce((a, r) => a + r.weightPct, 0)).toBeGreaterThanOrEqual(99);
    expect(op?.rotations.every((r) => r.crops.length > 0)).toBe(true);
    expect(toSecondOpinion(file, "19169")).toBeNull();
  });

  it("covers every Kansas county with usable rotations", () => {
    for (const c of file.counties) {
      const op = toSecondOpinion(file, String(c.fips));
      expect(op, c.county).not.toBeNull();
      expect(op!.rotations.every((r) => r.crops.length > 0), c.county).toBe(true);
    }
  });

  it("uses the file's ranking basis before the legacy alert", () => {
    const county = file.counties.find((c: { fips: string }) => c.fips === "20055");
    const normal = toSecondOpinion({ ...file, counties: [{ ...county, alert: "warning", basis: "normal-year water" }] }, "20055")!;
    expect(normal.basis).toBe("normal-year water");
    expect(normal.dryYearRanking).toBe(false);
    const dry = toSecondOpinion({ ...file, counties: [{ ...county, alert: "normal", basis: "dry-year water (district on watch/warning)" }] }, "20055")!;
    expect(dry.dryYearRanking).toBe(true);
    const legacy = toSecondOpinion({ ...file, counties: [{ ...county, alert: "watch", basis: null }] }, "20055")!;
    expect(legacy.dryYearRanking).toBe(true);
  });

  it("only matches when the crops are the same", () => {
    const op = toSecondOpinion(file, "20055")!;
    const top = op.rotations[0]!;
    expect(matchRank([...top.crops].reverse(), op.rotations)).toBe(top.rank);
    expect(matchRank(["corn", "soybean", "corn"], op.rotations)).toBeNull();
    // Wheat-sorghum without fallow is not the same rotation as wheat-sorghum-fallow.
    const wsf = op.rotations.find((r) => r.code === "W-S-F");
    if (wsf) expect(matchRank(["winter_wheat", "sorghum", "sorghum"], [wsf])).toBeNull();
  });

  it("calls a subset of their top rotation a partial match, not agreement", () => {
    const wsf = { rank: 1, code: "W-S-F", name: "wheat-sorghum-fallow", weightPct: 38, crops: rotationCrops("W-S-F"), note: null };
    expect(matchRank(["sorghum", "fallow", "sorghum"], [wsf])).toBeNull();
    expect(partialOverlap(["sorghum", "fallow", "sorghum"], wsf)).toEqual({ shared: ["sorghum", "fallow"], theirsOnly: ["winter_wheat"] });
    expect(partialOverlap(["soybean", "sorghum", "soybean"], wsf)).toBeNull();
    expect(partialOverlap(["fallow", "fallow", "fallow"], wsf)).toBeNull();
  });
});
