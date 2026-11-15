// Replay/audit of actual downloaded public source bytes, not constructed observations.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import bundle from '../data/aquifer/context.json';
import raw from '../data/aquifer/kgs-finney-section.json';
import gmd from '../data/aquifer/kgs-finney-gmd.json';
import item from '../data/aquifer/kgs-item.json';
// Read the demo inventory without importing Leaflet's browser-only module into Node.
const mapPicker = readFileSync(new URL('../web/src/components/MapPicker.tsx', import.meta.url), 'utf8');
const demos = [...mapPicker.matchAll(/\{ name: "[^"]+", lat: ([\d.-]+), lon: ([\d.-]+),/g)]
  .map(match => ({ lat: Number(match[1]), lon: Number(match[2]) }));

describe('recorded aquifer evidence provenance', () => {
  it('pins original source response bytes and exact returned attributes/geometry', () => {
    for (const source of bundle.sources) {
      expect(source.url).toMatch(/^https:\/\//);
      expect(source.sha256).toMatch(/^[a-f0-9]{64}$/);
      if (!source.file) continue; // Full USGS archive is externally pinned, not bundled.
      const bytes = readFileSync(new URL(`../data/aquifer/${source.file}`, import.meta.url));
      expect(bytes.length).toBe(source.bytes);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(source.sha256);
    }
    expect(item.owner).toBe('KS_Geological_Survey');
    expect(raw.features).toHaveLength(1);
    expect(raw.features[0]).toEqual(bundle.section);
    expect(raw.spatialReference.wkid).toBe(4326);
    expect(gmd.features).toHaveLength(1);
    expect(gmd.features[0]!.attributes.GMD_ID).toBe(bundle.section.attributes.gmd);
    const a = bundle.section.attributes;
    expect(a.wte_2022_2024 - a.hpa_bedrock).toBeCloseTo(a.satthick_2022_2024, 8);
    expect(a.satthick_2022_2024 - a.predev_satthick_updated).toBeCloseTo(a.chng_predev_20222024_act, 8);
  });
  it('covers every current demo point exactly once and never calls unavailable legal status false', () => {
    expect(demos.length).toBeGreaterThan(0);
    expect(bundle.boundary.demoPoints).toHaveLength(demos.length);
    for (const demo of demos) {
      expect(bundle.boundary.demoPoints.filter(p => p.lat === demo.lat && p.lon === demo.lon)).toHaveLength(1);
    }
    expect(bundle.boundary.demoPoints.filter(p => p.inMappedHighPlainsAquifer).map(p => p.name)).toEqual(['Finney County, Kansas']);
    expect(bundle.lema.status).toBe('unverified');
    expect(bundle.version).toContain('2022-2024');
  });
});
