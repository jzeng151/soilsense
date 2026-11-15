import { afterEach, expect, it, vi } from 'vitest';
import { compareGroundwater, linearSlope } from '../src/engine/groundwater';
import { getGraceWells } from '../src/worker/data/grace';
import { groundwater } from '../src/worker/routes/groundwater';
import { clearMemoryCache } from '../src/worker/lib/cache';
import artifact from '../data/grace-wells-finney.json';
afterEach(()=>{clearMemoryCache();vi.unstubAllGlobals()});
it('preserves gaps, zero and unknown statuses and refuses too-short comparisons',()=>{
 // Clearly hand-made numeric mocks, not NASA/KGS responses.
 const obs=Array.from({length:6},(_,i)=>({date:`${2015+i}-01-10`,reportedSignedFt:i===0?0:-i,status:i===2?'P':'-'}));
 const w={id:'mock',selectedAnnualDates:obs.map(o=>o.date),observations:obs};
 const months=Array.from({length:6},(_,i)=>({month:`${2015+i}-01`,twsCm:i===1?null:i}));
 const r=compareGroundwater(months,[w]).wells[0]!;
 expect(r.pairs[0]!.wellSignedFt).toBe(0);expect(r.pairs).toHaveLength(4);
 expect(r.agreement).toBe('insufficient');expect(r.graceCmPerYear).toBeNull();
 expect(r.omittedSelectedDates).toEqual(['2016-01-10','2017-01-10']);
 expect(linearSlope([])).toBeNull();expect(linearSlope([{x:1,y:1},{x:1,y:2}])).toBeNull();
 const duplicated=compareGroundwater([...months,{month:'2015-01',twsCm:999}], [w]);
 expect(duplicated.wells[0]!.pairs.some(p=>p.month==='2015-01')).toBe(false);
});
it('reproduces independent numpy slopes on real matched records, without modifying source series',()=>{
 const before=JSON.stringify(artifact),c=compareGroundwater(artifact.grace.months,artifact.kgs.wells);
 expect(c.wells.map(w=>w.pairs.length)).toEqual([10,9,10]);
 expect(c.wells[0]!.graceCmPerYear).toBeCloseTo(-.4262333711072147,10);
 expect(c.wells[0]!.wellFtPerYear).toBeCloseTo(-.348125,10);
 expect(c.wells[1]!.wellFtPerYear).toBeCloseTo(-.48496822033901565,10);
 expect(c.wells[2]!.wellFtPerYear).toBeCloseTo(-.3392803030302735,10);
 expect(c.disagreement).toBe(false);expect(JSON.stringify(artifact)).toBe(before);
 expect(artifact.grace.months).toHaveLength(132);
 expect(artifact.grace.months.filter(m=>m.twsCm===null)).toHaveLength(21);
 expect(artifact.grace.months.find(m=>m.month==='2018-01')!.twsCm).toBeNull();
 expect(artifact.kgs.wells[2]!.wellDepthFt).toBeNull();
});
it('serves only associated demo evidence without upstream network or leaking credentials',async()=>{
 const fetch=vi.fn().mockRejectedValue(new Error('mock network unavailable'));
 vi.stubGlobal('fetch',fetch);
 const r=await getGraceWells(undefined,38.1095,-100.706);
 expect(r.status).toBe('available');expect(r.bundle!.grace.masconId).toBe(861);
 expect(fetch).not.toHaveBeenCalled();
 expect((await getGraceWells(undefined,39,-101)).bundle).toBeNull();
 expect((await groundwater.request('/?lat=NaN&lon=-100',{},{})).status).toBe(400);
 const response=await groundwater.request('/?lat=38.1095&lon=-100.706',{},{});
 expect(response.status).toBe(200);const body=await response.json() as {status:string};expect(body.status).toBe('available');
});
