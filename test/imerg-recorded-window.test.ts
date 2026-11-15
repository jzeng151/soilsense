import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { days, type Subset } from "../src/worker/imerg/client";
describe("saved real all-four-field Worker replay, UTC 2026-10-31..11-13", () => {
 it("replays complete descriptive totals for Oct 30–Nov 12 without asserting daily alignment", () => {
  const rows = JSON.parse(readFileSync("test/fixtures/imerg-live/comparison-20261112.json", "utf8")) as { field: string; read: { imergMm: number; powerMm: number; differenceMm: number; equivalentIntervals: false } }[];
  const expected: Record<string, [number, number]> = { "story-ia": [63.360000463202596,62.12000000000001], "champaign-il": [11.884999603033066,23.76], "finney-ks": [26.564999585039914,26.29], "lancaster-ne": [39.79499889817089,38.74] };
  expect(rows).toHaveLength(4);
  for (const { field, read } of rows) {
   expect(read.imergMm).toBeCloseTo(expected[field]![0],9); expect(read.powerMm).toBeCloseTo(expected[field]![1],9);
   expect(read.differenceMm).toBeCloseTo(expected[field]![0]-expected[field]![1],9); expect(read.equivalentIntervals).toBe(false);
  }
 });
 it("has four complete 14-day Late windows and preserves unavailable POWER, never zero-fills it", () => {
  const records = JSON.parse(readFileSync("test/fixtures/imerg-live/comparison-20261113.json", "utf8")) as { field: string; read: { imerg: Subset; imergMm: number; powerMm: null; differenceMm: null; equivalentIntervals: false } }[];
  const totals: Record<string, number> = { "story-ia": 61.25000056810677, "champaign-il": 11.184999655932188, "finney-ks": 23.134999279864132, "lancaster-ne": 24.54999805893749 };
  expect(records).toHaveLength(4);
  for (const { field, read } of records) {
   expect(read.imerg.observations.map(d => d.date)).toEqual(days("2026-10-31", "2026-11-13"));
   expect(read.imerg.observations.every(d => d.count === 48 && d.mm !== null)).toBe(true);
   expect(read.imerg.observations.reduce((n,d) => n + d.mm!, 0)).toBeCloseTo(totals[field]!, 9);
   expect(read.powerMm).toBeNull(); expect(read.differenceMm).toBeNull(); expect(read.equivalentIntervals).toBe(false);
  }
 });
});
