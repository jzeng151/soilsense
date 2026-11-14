import { describe, expect, it } from "vitest";
import { mannKendall, normalCdf, sensSlope } from "../src/engine/stats";

describe("normalCdf", () => {
  it("matches known values", () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6);
    expect(normalCdf(1.96)).toBeCloseTo(0.975, 3);
    expect(normalCdf(-1.96)).toBeCloseTo(0.025, 3);
  });
});

describe("sensSlope", () => {
  it("recovers a clean linear slope", () => {
    const x = [2000, 2001, 2002, 2003, 2004];
    const y = x.map((v) => 3 + 0.5 * (v - 2000));
    const r = sensSlope(x, y);
    expect(r.slope).toBeCloseTo(0.5, 9);
    expect(r.intercept + r.slope * 2000).toBeCloseTo(3, 6);
  });
  it("is robust to an outlier", () => {
    const x = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const y = [1, 2, 3, 4, 50, 6, 7, 8, 9, 10];
    expect(sensSlope(x, y).slope).toBeCloseTo(1, 6);
  });
});

describe("mannKendall", () => {
  it("detects a monotonic increase (textbook values)", () => {
    const x = Array.from({ length: 10 }, (_, i) => i + 1);
    const r = mannKendall(x, x);
    expect(r.s).toBe(45);
    expect(r.z).toBeCloseTo(44 / Math.sqrt(125), 6);
    expect(r.verdict).toBe("significant_increase");
    expect(r.pValue).toBeLessThan(0.001);
  });
  it("finds no trend in a flat noisy series", () => {
    const x = Array.from({ length: 30 }, (_, i) => 1990 + i);
    const y = x.map((_, i) => (i % 2 === 0 ? 10 : 11));
    const r = mannKendall(x, y);
    expect(r.verdict).toBe("no_clear_change");
  });
  it("reports insufficient data for short series", () => {
    expect(mannKendall([1, 2, 3], [1, 2, 3]).verdict).toBe("insufficient_data");
  });
  it("matches pymannkendall reference (ties included)", () => {
    // Reference computed with pymannkendall.original_test on the same data.
    const y = [12, 15, 11, 15, 18, 14, 19, 22, 18, 21, 25, 20, 24, 26, 23];
    const x = y.map((_, i) => i);
    const r = mannKendall(x, y);
    expect(r.s).toBe(REF.s);
    expect(r.z).toBeCloseTo(REF.z, 4);
    expect(r.slopePerYear).toBeCloseTo(REF.slope, 6);
  });
});

const REF = { s: 73, z: 3.571834033001941, slope: 1.0 };
