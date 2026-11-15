import { describe, expect, it } from 'vitest';
import bundle from '../data/aquifer/context.json';
import { aquiferContext } from '../src/engine/aquifer';

describe('offline aquifer context', () => {
  it('never extends the Finney section to another demo, an adjacent field or missing data', () => {
    for (const p of bundle.boundary.demoPoints.filter(p => !p.inMappedHighPlainsAquifer)) {
      const result = aquiferContext(p.lat, p.lon, bundle);
      expect(result.status).toBe('outside-aquifer');
      expect(result.saturatedThicknessFt).toBeNull();
      expect(result.gmd).toBeNull();
    }
    expect(aquiferContext(38.1095, -100.72, bundle).status).toBe('unavailable');
    expect(aquiferContext(38.1095, -100.706, null).status).toBe('unavailable');
    expect(aquiferContext(NaN, -100.706, bundle).status).toBe('invalid-point');
    expect(aquiferContext(91, -100.706, bundle).status).toBe('invalid-point');
  });
  it('preserves missing values, zero and signed rises; rejects impossible thickness/lifetime', () => {
    const copy = structuredClone(bundle);
    copy.section.attributes.satthick_2022_2024 = -9999;
    copy.section.attributes.chng_predev_20222024_act = 0;
    copy.section.attributes.chng_predev_20222024_pct = Infinity;
    copy.section.attributes.chng_3yr_2013_2023 = 2;
    copy.section.attributes.eul_3yr_2013_2023_200gpm = -1;
    const before = structuredClone(copy);
    const result = aquiferContext(38.1095, -100.706, copy);
    expect(result.saturatedThicknessFt).toBeNull();
    expect(result.predevelopmentChangeFt).toBe(0);
    expect(result.predevelopmentChangePercent).toBeNull();
    expect(result.decadeWaterLevelChangeFt).toBe(2);
    expect(result.publishedUsableLifetimeYears).toBeNull();
    expect(copy).toEqual(before);
    expect(aquiferContext(38.1095, -100.706, { ...copy, section: { ...copy.section,
      attributes: { ...copy.section.attributes, satthick_2022_2024: null } } }).saturatedThicknessFt).toBeNull();
  });
  it('handles the actual polygon, boundary ambiguity and synthetic holes without a bounding-box shortcut', () => {
    const vertex = bundle.section.geometry.rings[0]![0]!;
    expect(aquiferContext(vertex[1]!, vertex[0]!, bundle).status).toBe('unavailable');
    const copy = structuredClone(bundle);
    copy.section.geometry.rings.push([[-100.71,38.10],[-100.70,38.10],[-100.70,38.11],[-100.71,38.11],[-100.71,38.10]]);
    expect(aquiferContext(38.1095, -100.706, copy).status).toBe('unavailable');
    expect(aquiferContext(38.115, -100.71, bundle).status).toBe('available');
    // Nearby to Lancaster is unknown, not falsely outside based on the demo record.
    expect(aquiferContext(40.73001, -96.55, bundle).status).toBe('unavailable');
  });
  it('returns the actual KGS section estimate, without treating thickness as irrigation depth', () => {
    const result = aquiferContext(38.1095, -100.706, bundle);
    expect(result.status).toBe('available');
    expect(result.sectionId).toBe('22S31W27');
    expect(result.saturatedThicknessFt).toBe(66.92423502604152);
    expect(result.predevelopmentChangeFt).toBe(-43.7378133137986);
    expect(result.gmd).toBe(3);
    expect(result.lema).toBe('unverified');
    expect(result).not.toHaveProperty('irrigationAllowanceMm');
  });
});
