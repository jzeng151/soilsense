import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { noonTemperatureBounds } from "../src/engine/temperatureIntervalBounds";
import { parsePrismCsv } from "../src/worker/data/prism";
const rows = [
 { date: "2023-05-01", rain: 0, tmin: -10, tmax: 40 },
 { date: "2023-05-02", rain: 0, tmin: -5, tmax: 30 },
 { date: "2023-05-03", rain: 0, tmin: 0, tmax: 25 },
];
describe("noon-window temperature extreme bounds", () => {
 it("uses covering/interior daily extremes, not a half-day allocation or daily average", () => {
   const result = noonTemperatureBounds(rows, rows.slice(1), "2023-05-02", "2023-05-03");
   expect(result[0]).toMatchObject({ variable: "tmin", lowerC: -10, upperC: -5, prismC: -5, absoluteDifferenceRangeC: [0,5] });
   expect(result[1]).toMatchObject({ variable: "tmax", lowerC: 30, upperC: 40, prismC: 30, absoluteDifferenceRangeC: [0,10] });
 });
 it("has no bounded single-day estimate and preserves missing values separately from negative temperatures", () => {
   expect(noonTemperatureBounds(rows, rows, "2023-05-02", "2023-05-02")[0]).toMatchObject({ lowerC: null, upperC: null, state: "missing" });
   const missing = rows.map(r => ({ ...r, tmax: null }));
   const result = noonTemperatureBounds(missing, rows, "2023-05-02", "2023-05-03");
   expect(result[0]!.lowerC).toBe(-10); expect(result[1]!.lowerC).toBeNull();
 });
 it("replays real daily UTC and PRISM raw estimates without relative Celsius percentages", () => {
   const raw = JSON.parse(readFileSync("test/fixtures/prism/power-daily-utc-20230509-20230512.json", "utf8"));
   const p = raw.properties.parameter;
   const utc = Object.keys(p.T2M_MIN).map(d => ({ date: `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}`, rain: p.PRECTOTCORR[d], tmin: p.T2M_MIN[d], tmax: p.T2M_MAX[d] }));
   const prism = parsePrismCsv(readFileSync("test/fixtures/prism/prism-20230510-20230512.csv", "utf8"));
   const result = noonTemperatureBounds(utc, prism.rows, "2023-05-10", "2023-05-12");
   expect(result.every(b => b.state === "bounded_only")).toBe(true);
   expect(result[0]!.prismC).toBe(9.1); expect(result[1]!.prismC).toBe(33.8);
   expect(result[0]).not.toHaveProperty("relativeDifferencePct");
   console.info(JSON.stringify(result));
 });
});
