import { describe, expect, it } from 'vitest';
import { fieldLabel } from '../web/src/components/fieldLabels';
import { cdlToCropId, fieldPlanHistory, numberFields, validateFieldName, fieldPlanRequest } from '../src/shared/fields';
import type { FieldBoundary } from '../src/shared/fields';
const field = { id:'csb:one', centroid:{lat:38.1234567,lon:-100.1234567}, areaAcres:9.1, cropSequence:[{year:2025,cdlCode:4,crop:'Sorghum'},{year:2022,cdlCode:5,crop:'Soybeans'},{year:2023,cdlCode:1,crop:'Corn'},{year:2024,cdlCode:24,crop:'Winter Wheat'}] } as FieldBoundary;
describe('field planning contract',()=>{
  it('maps only modeled single crops, never guesses double crops or noncrop cover',()=>{
    expect([1,4,5,24,28,36,61].map(cdlToCropId)).toEqual(['corn','sorghum','soybean','winter_wheat','oats','alfalfa','fallow']);
    expect([0,12,26,121,225,236,999].map(cdlToCropId)).toEqual(Array(7).fill(undefined));
  });
  it('uses at most three latest source years, oldest first; reports dropped entries',()=>{
    expect(fieldPlanHistory(field).recentCrops).toEqual(['corn','winter_wheat','sorghum']);
    const mixed={...field,cropSequence:[...field.cropSequence!,{year:2026,cdlCode:225,crop:'Double crop'}]};
    expect(fieldPlanHistory(mixed).recentCrops).toEqual(['winter_wheat','sorghum']);
    expect(fieldPlanHistory(mixed).dropped.map(c=>c.year)).toEqual([2026]);
  });
  it('numbers by north-to-south then west-to-east, independent of input order',()=>{
    const north={...field,id:'csb:north',centroid:{lat:39,lon:-100}};
    expect(numberFields([field,north]).map(f=>[f.id,f.name])).toEqual([['csb:one','Field 2'],['csb:north','Field 1']]);
    expect(numberFields([north,field])[0]!.name).toBe('Field 1');
  });
  it('formats the same friendly label for map, list and summary in EN/ES',()=>{
    const labeled={...field,name:'Field 3'};
    expect(fieldLabel(labeled,'en')).toBe('Field 3 · 9.1 ac · Corn → Winter Wheat → Sorghum (2023–2025)');
    expect(fieldLabel(labeled,'es')).toBe('Parcela 3 · 9.1 ac · Maíz → Trigo de invierno → Sorgo (2023–2025)');
    expect(fieldLabel({...labeled,name:'North pivot'},'es')).toContain('North pivot · 9.1 ac');
  });
  it('validates local labels and keeps disabled requests identical',()=>{
    expect(validateFieldName('  Home  ')).toBe('Home');
    expect(validateFieldName('x'.repeat(61))).toBeNull();
    expect(validateFieldName('bad\nname')).toBeNull();
    const request={lat:40,lon:-95,irrigated:false,priority:'balanced' as const,recentCrops:['corn' as const]};
    expect(fieldPlanRequest(request,false,field)).toBe(request);
    expect(fieldPlanRequest(request,true,field)).toEqual({...request,...field.centroid,recentCrops:['corn','winter_wheat','sorghum']});
  });
});
