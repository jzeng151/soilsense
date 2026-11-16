import { describe, it, expect } from 'vitest';
import { areaAcres, centroid, pointInPolygon, shareEdge } from '../src/engine/fieldGeometry';
import finney from '../data/fields/finney.json';
import type { LonLat } from '../src/shared/fields';
const square: LonLat[][] = [[[0,0],[1,0],[1,1],[0,1],[0,0]]];
describe('field geometry', () => {
  it('calculates geodesic acreage against every real Finney CSBACRES attribute', () => {
    for (const field of finney.fields) {
      const source = finney.sourceAcres[field.id.slice(4) as keyof typeof finney.sourceAcres];
      expect(Math.abs(areaAcres(field.polygon as LonLat[][]) / source - 1)).toBeLessThan(0.003);
    }
  });
  it('weights holes and is independent of ring winding', () => {
    const hole: LonLat[] = [[0.1,0.1],[0.2,0.1],[0.2,0.2],[0.1,0.2],[0.1,0.1]];
    expect(areaAcres([square[0]!,hole])).toBeLessThan(areaAcres(square));
    expect(areaAcres([[...square[0]!].reverse(),[...hole].reverse()])).toBeCloseTo(areaAcres([square[0]!,hole]), 6);
    expect(centroid(square)).toEqual({lat:0.5,lon:0.5});
    expect(centroid([square[0]!,hole]).lat).toBeGreaterThan(0.5);
  });
  it('handles interior, exterior, edge and holes', () => {
    expect(pointInPolygon([0.5,0.5],square)).toBe(true);
    expect(pointInPolygon([2,0.5],square)).toBe(false);
    expect(pointInPolygon([0,0.5],square)).toBe(true);
    expect(pointInPolygon([0.5,0.5],[square[0]!,[[0.4,0.4],[0.6,0.4],[0.6,0.6],[0.4,0.6],[0.4,0.4]]])).toBe(false);
  });
  it('requires positive shared edge length, allows split edges, rejects corner contact and gaps', () => {
    expect(shareEdge(square, [[[1,0.2],[2,0.2],[2,0.8],[1,0.8],[1,0.2]]])).toBe(true);
    expect(shareEdge(square, [[[1,1],[2,1],[2,2],[1,2],[1,1]]])).toBe(false);
    expect(shareEdge(square, [[[1.001,0],[2,0],[2,1],[1.001,1],[1.001,0]]])).toBe(false);
  });
  it('rejects empty or degenerate geometry', () => {
    expect(() => areaAcres([])).toThrow();
    expect(() => centroid([[[0,0],[0,0],[0,0],[0,0]]])).toThrow();
  });
});
