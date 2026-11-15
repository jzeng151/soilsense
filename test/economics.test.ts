import { expect, it, vi, afterEach } from "vitest";
import { assumptionAudit, KSU_2025, referenceMargin } from "../src/engine/economics";
import { pricesFrom } from "../src/worker/data/nass";
import app from "../src/worker/index";
afterEach(() => vi.unstubAllGlobals());
it("reproduces K-State middle-yield source margins without adding nitrogen twice", () => {
  const result = referenceMargin(["corn", "soybean"]);
  expect(result.phases[0]).toMatchObject({ revenue: 610.45, directCost: 449.2 });
  expect(result.phases[0]!.margin).toBeCloseTo(161.25, 8);
  expect(result.phases[1]).toMatchObject({ revenue: 531.85, directCost: 272.28 });
  expect(result.phases[1]!.margin).toBeCloseTo(259.57, 8);
  expect(result.mean).toBeCloseTo(210.41, 2);
  expect(KSU_2025.corn.yield.sourceUrl).toContain("Corn%20Cost-Return");
});
it("keeps phase duration, missing prices and unsupported treatments explicit", () => {
  expect(referenceMargin(["corn", "soybean", "corn"]).mean).toBeCloseTo(194.0233333, 5);
  expect(referenceMargin(["corn", "fallow"]).mean).toBeNull();
  expect(referenceMargin(["corn"], { prices: { corn: null } }).mean).toBeNull();
  expect(referenceMargin([]).mean).toBeNull();
});
it("price/cost/yield sensitivity is a labelled scenario, not weather-altered research", () => {
  expect(referenceMargin(["corn", "soybean"], { priceFactor: 0.9 }).mean).toBeCloseTo(153.295, 3);
  expect(referenceMargin(["corn", "soybean"], { costFactor: 1.1 }).mean).toBeCloseTo(174.336, 3);
  expect(referenceMargin(["corn", "soybean"], { yieldFactor: 0.9 }).mean).toBeCloseTo(153.295, 3);
  expect(() => referenceMargin(["corn"], { priceFactor: NaN })).toThrow();
});
it("audits every engine crop and state potential without inventing sources for approximate defaults", () => {
  const a = assumptionAudit("KS");
  expect(a.crops).toHaveLength(7);
  expect(a.crops.find(c => c.crop === "corn")).toMatchObject({ price: { value: 4.2, status: "approximate default", sourceUrl: null, year: null }, potential: { value: 220, region: "KS" } });
  expect(assumptionAudit("IA").crops.find(c => c.crop === "corn")!.potential.value).toBe(240);
  expect(assumptionAudit("unknown").regionNote).toContain("Iowa fallback");
  expect(a.adjustments).toContain("Nitrogen, cover costs/credits, alfalfa establishment, irrigation pumping, rotation yield effects and cost scaling remain approximate defaults.");
});
it("existing NASS price parsing excludes suppression and converts sorghum cwt to bushels", () => {
  // Explicit synthetic API rows; not real commodity quotes.
  const desc = "SORGHUM, GRAIN - PRICE RECEIVED, MEASURED IN $ / CWT";
  const rows = ["JAN", "FEB", "MAR"].map(m => ({ short_desc: desc, year: 2025, Value: "10.00", reference_period_desc: m }));
  rows.push({ short_desc: desc, year: 2025, Value: "(D)", reference_period_desc: "APR" });
  expect(pricesFrom(rows, "state").sorghum).toMatchObject({ price: 5.6, unit: "$/bu", months: 3, through: "Mar 2025", level: "state" });
  expect(pricesFrom(rows.slice(0, 2), "state").sorghum).toBeUndefined();
});
it("serves provenance offline without unexpected provider calls", async () => {
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  const res = await app.request("/api/economics-assumptions?state=KS", {}, {});
  expect(res.status).toBe(200);
  expect((await res.json() as { reference: { year: number } }).reference.year).toBe(2025);
  expect(fetcher).not.toHaveBeenCalled();
});
