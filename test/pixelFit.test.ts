import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import fixture from './fixtures/pixel-fit/csb-271724000004554.json';
import { fitProduct, PIXEL_PRODUCTS } from '../src/engine/pixelFit';

// Constructed lat/lon rectangles, NOT observed field boundaries.
const rectangle = (west:number,south:number,east:number,north:number) => ({
  id:'test',source:'usda-csb' as const,polygon:[[[west,south],[east,south],[east,north],[west,north],[west,south]] as [number,number][]],
  areaAcres:0,centroid:{lat:(south+north)/2,lon:(west+east)/2},
  provenance:{product:'constructed test',version:'1',url:'',retrieved:''},
});
describe('pixel fit',()=>{
  it('evaluates a source-hashed real 7.6-acre CSB outline without trusting reported acreage',()=>{
    expect(createHash('sha256').update(fixture.rawResponse).digest('hex')).toBe(fixture.sha256);
    const feature=JSON.parse(fixture.rawResponse).features[0];
    const field={...rectangle(0,0,1,1),id:`csb:${feature.attributes.CSBID}`,areaAcres:feature.attributes.CSBACRES,polygon:feature.geometry.rings as [number,number][][]};
    const result=fitProduct(field,PIXEL_PRODUCTS.find(p=>p.id==='hls')!);
    // Independently recomputed in Python from the preserved source vertices.
    expect(result.areaSquareMetres).toBeCloseTo(30682.196891833,4);
    expect(result.areaRatio).toBeCloseTo(34.091329879814445,6);
    expect(result.wholePixels).toBeGreaterThan(9);
    expect(result.wholePixels).toBeLessThanOrEqual(34);
    expect(fitProduct(field,PIXEL_PRODUCTS.find(p=>p.id==='power')!).wholePixels).toBe(0);
  });
  it('counts native IMERG cells rather than flooring area ratio',()=>{
    const p=PIXEL_PRODUCTS.find(p=>p.id==='imerg')!;
    expect(fitProduct(rectangle(0,0,0.2,0.2),p).wholePixels).toBe(4);
    expect(fitProduct(rectangle(0.01,0.01,0.21,0.21),p).wholePixels).toBe(1);
  });
  it('excludes holes and narrow concave notches, not just pixel corners',()=>{
    const p=PIXEL_PRODUCTS.find(p=>p.id==='imerg')!;
    const field=rectangle(0,0,0.2,0.2);
    field.polygon.push(rectangle(0.04,0.04,0.06,0.06).polygon[0]!);
    expect(fitProduct(field,p).wholePixels).toBe(3);
    expect(fitProduct(field,p).areaRatio).toBeCloseTo(3.96,3);
    field.polygon=[[[0,0],[0.2,0],[0.2,0.2],[0.06,0.2],[0.06,0.04],[0.04,0.04],[0.04,0.2],[0,0.2],[0,0]]];
    expect(fitProduct(field,p).wholePixels).toBe(2);
  });
  it('keeps coarse products regional and non-raster counts unknown',()=>{
    const field=rectangle(-100.71,38.10,-100.70,38.11);
    for(const id of ['power','imerg','smap','daymet','grace']){
      expect(fitProduct(field,PIXEL_PRODUCTS.find(p=>p.id===id)!).category).toBe('regional-only');
    }
    const soil=fitProduct(field,PIXEL_PRODUCTS.find(p=>p.id==='ssurgo')!);
    expect(soil.category).toBe('not-raster');expect(soil.wholePixels).toBeNull();expect(soil.areaRatio).toBeNull();
    expect(fitProduct(field,PIXEL_PRODUCTS.find(p=>p.id==='grace')!).wholePixels).toBeNull();
  });
  it('labels the nine-whole-pixel demonstration threshold',()=>{
    const fine=fitProduct(rectangle(-100.71,38.10,-100.70,38.11),PIXEL_PRODUCTS.find(p=>p.id==='hls')!);
    expect(fine.category).toBe('field-scale');expect(fine.wholePixels).toBeGreaterThanOrEqual(9);
    expect(fine.wholePixels).toBeLessThanOrEqual(Math.floor(fine.areaRatio!));
    expect(fine.method).toBe('local-equal-area-estimate');
  });
  it('rejects unclosed, degenerate, non-finite and dateline geometries',()=>{
    const p=PIXEL_PRODUCTS[0]!;
    const field=rectangle(0,0,0.1,0.1);
    field.polygon[0]!.pop();expect(fitProduct(field,p).category).toBe('unknown');
    expect(fitProduct(rectangle(0,0,0,0),p).category).toBe('unknown');
    expect(fitProduct(rectangle(NaN,0,0.1,0.1),p).category).toBe('unknown');
    expect(fitProduct(rectangle(-179,0,179,0.1),p).category).toBe('unknown');
  });
  it('bounds work and leaves an uncomputed count unknown',()=>{
    const fit=fitProduct(rectangle(0,0,2,2),PIXEL_PRODUCTS.find(p=>p.id==='hls')!);
    expect(fit.wholePixels).toBeNull();expect(fit.category).toBe('unknown');expect(fit.areaRatio).toBeGreaterThan(1);
  });
  it('accounts for latitude in angular pixel acreage',()=>{
    const p=PIXEL_PRODUCTS.find(p=>p.id==='imerg')!;
    const equator=fitProduct(rectangle(0,0,0.1,0.1),p);
    const north=fitProduct(rectangle(0,60,0.1,60.1),p);
    expect(north.pixelAreaSquareMetres!/equator.pixelAreaSquareMetres!).toBeCloseTo(0.5,2);
  });
});
