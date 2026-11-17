import { describe, expect, it } from "vitest";
import { noonRainBounds } from "../src/engine/rainIntervalBounds";
const rows = [1, 2, 3, 4].map((rain, i) => ({ date: `2023-05-0${i + 1}`, rain, tmin: null, tmax: null }));
describe("daily UTC bounds for the PRISM noon interval", () => {
  it("retains full interior days and bounds both unknown edge allocations", () => {
    expect(noonRainBounds(rows, "2023-05-02", "2023-05-04")).toMatchObject({ startInclusive: "2023-05-01T12:00:00Z", endExclusive: "2023-05-04T12:00:00Z", lowerMm: 5, upperMm: 10, edgeTotalMm: 5, state: "bounded_only" });
  });
  it("does not split daily totals in half; single-day lower bound is zero", () => {
    expect(noonRainBounds(rows, "2023-05-02", "2023-05-02")).toMatchObject({ lowerMm: 0, upperMm: 3 });
  });
  it("preserves dry zero and refuses missing or negative days, including the preceding day", () => {
    expect(noonRainBounds(rows.map(r => ({ ...r, rain: 0 })), "2023-05-02", "2023-05-04")).toMatchObject({ lowerMm: 0, upperMm: 0 });
    expect(noonRainBounds(rows.slice(1), "2023-05-02", "2023-05-04")).toMatchObject({ lowerMm: null, upperMm: null, state: "missing" });
    expect(noonRainBounds(rows.map(r => ({ ...r, rain: -1 })), "2023-05-02", "2023-05-04").upperMm).toBeNull();
  });
});
