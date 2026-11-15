import { describe, it, expect, vi, afterEach } from "vitest";
import { discoverSmap, getSmap, validSmapBundle } from "../src/worker/data/smap";
import { smap } from "../src/worker/routes/smap";
import { clearMemoryCache } from "../src/worker/lib/cache";
import { summarizeSmap, type SmapSample } from "../src/engine/smap";
// Minimal hand-made mocks, NOT fetched NASA measurements.
const samples = (year: number, surface = .2): SmapSample[] => Array.from({length: 8}, (_, i) => ({time: `${year}-07-01T${String(i * 3 + 1).padStart(2, '0')}:30:00Z`, surface, rootzone: .4, quality: "accepted"}));
describe('SMAP seasonal evidence', () => {
 it('keeps surface and root-zone separate, excludes replay year, and ranks ties by midrank', () => {
  const r = summarizeSmap([...samples(2020,.1),...samples(2021,.3),...samples(2022,.2)], 2022, '07-01','07-01', [2020,2021,2022]);
  expect(r.surface.mean).toBeCloseTo(.2); expect(r.rootzone.mean).toBeCloseTo(.4);
  expect(r.surface.baseline.map(x=>x.year)).toEqual([2020,2021]);
  expect(r.surface.anomaly).toBeNull(); expect(r.surface.percentile).toBeNull();
  expect(r.surface.note).toContain('10');
 });
});
