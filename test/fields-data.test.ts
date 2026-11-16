import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe,it,expect } from 'vitest';
import type { FieldBoundary } from '../src/shared/fields';
import { areaAcres,centroid } from '../src/engine/fieldGeometry';
const root=new URL('../data/fields/',import.meta.url);
describe('committed real CSB evidence',()=>{
  it('preserves all 221 source features, eight years, raw-query hashes and acreage agreement',()=>{
    const ids=new Set<string>();
    let count=0;
    for(const [area,expected] of [['finney',63],['story',47],['champaign',73],['lancaster',38]] as const){
      const data=JSON.parse(readFileSync(new URL(area+'.json',root),'utf8')) as {fields:FieldBoundary[];sourceCount:number;omittedMultipart:number;sourceAcres:Record<string,number>};
      const raw=readFileSync(new URL('source/'+area+'.geojson',root));
      const source=JSON.parse(raw.toString()) as {features:{properties:{csbid:string;csbyears:string};geometry:{type:string;coordinates:unknown}}[]};
      expect(data.fields).toHaveLength(expected);expect(data.sourceCount).toBe(expected);expect(source.features).toHaveLength(expected);expect(data.omittedMultipart).toBe(0);
      const sha=createHash('sha256').update(raw).digest('hex');
      for(const field of data.fields){
        expect(ids.has(field.id)).toBe(false);ids.add(field.id);count++;
        const original=source.features.find(f=>'csb:'+f.properties.csbid===field.id)!;
        expect(original.properties.csbyears).toBe('1825');
        expect(field.polygon).toEqual(original.geometry.coordinates);
        expect(field.provenance.sha256).toBe(sha);
        expect(field.cropSequence?.map(c=>c.year)).toEqual([2018,2019,2020,2021,2022,2023,2024,2025]);
        expect(Math.abs(areaAcres(field.polygon)/data.sourceAcres[field.id.slice(4)]!-1)).toBeLessThan(0.003);
        expect(areaAcres(field.polygon)).toBeCloseTo(field.areaAcres,5);
        const center=centroid(field.polygon);expect(center.lat).toBeCloseTo(field.centroid.lat,9);expect(center.lon).toBeCloseTo(field.centroid.lon,9);
      }
    }
    expect(count).toBe(221);expect(ids.size).toBe(221);
  });
});
