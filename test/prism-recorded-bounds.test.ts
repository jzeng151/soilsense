import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { noonRainBounds } from "../src/engine/rainIntervalBounds";
import { parsePrismCsv } from "../src/worker/data/prism";
import type { Subset } from "../src/worker/imerg/client";
const read = (name: string) => readFileSync(`test/fixtures/prism/${name}`, "utf8");
describe("recorded real three-source interval bounds", () => {
  it("preserves every acquired fixture byte hash", () => {
    const manifest = JSON.parse(read("manifest.json")) as { files: { file: string; sha256: string; bytes: number }[] };
    expect(manifest.files).toHaveLength(7);
    for (const f of manifest.files) {
      const bytes = readFileSync(`test/fixtures/prism/${f.file}`);
      expect(bytes.length).toBe(f.bytes);
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(f.sha256);
    }
  });
  it("quantifies residual differences without allocating unknown endpoint rain or declaring truth", () => {
    const prism = parsePrismCsv(read("prism-20230510-20230512.csv"));
    const reference = prism.rows.reduce((sum, r) => sum + r.rain!, 0);
    const raw = JSON.parse(read("power-daily-utc-20230509-20230512.json"));
    expect(raw.header.time_standard).toBe("UTC");
    const rows = Object.entries(raw.properties.parameter.PRECTOTCORR as Record<string, number>).map(([d, rain]) => ({ date: `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}`, rain, tmin: null, tmax: null }));
    const power = noonRainBounds(rows, "2023-05-10", "2023-05-12", reference);
    expect(power.lowerMm).toBeCloseTo(8.51); expect(power.upperMm).toBeCloseTo(8.53);
    expect(power.absoluteDifferenceRangeMm?.[0]).toBeCloseTo(2.08);
    expect(power.absoluteDifferenceRangeMm?.[1]).toBeCloseTo(2.10);
    const imerg = JSON.parse(read("imerg-final-20230509-20230512.json")) as Subset;
    expect(imerg.observations.every(o => o.count === 48)).toBe(true);
    const bounds = noonRainBounds(imerg.observations.map(o => ({ date: o.date, rain: o.mm, tmin: null, tmax: null })), "2023-05-10", "2023-05-12", reference);
    expect(bounds.lowerMm).toBeCloseTo(2.67); expect(bounds.upperMm).toBeCloseTo(2.755);
    expect(bounds.absoluteDifferenceRangeMm?.[0]).toBeCloseTo(3.675);
    expect(bounds.absoluteDifferenceRangeMm?.[1]).toBeCloseTo(3.76);
    expect(bounds.state).toBe("bounded_only");
    console.info(JSON.stringify({ reference, power, imerg: bounds }));
  });
  it("suppresses relative ranges whenever any possible denominator is near-dry", () => {
    const rows = [0, 1].map((rain, i) => ({ date: `2023-05-0${i + 1}`, rain, tmin: null, tmax: null }));
    expect(noonRainBounds(rows, "2023-05-02", "2023-05-02", 0).symmetricDifferenceRangePct).toBeNull();
    expect(noonRainBounds(rows, "2023-05-02", "2023-05-02", 0.5).absoluteDifferenceRangeMm).toEqual([0, 0.5]);
  });
});
