import { it, expect } from 'vitest';
import { compareGroundwater, linearSlope } from '../src/engine/groundwater';
// Minimal hand-made mock: negative signed WIZARD level is lower below land surface.
it('aligns only matching available months and makes disagreement visible without rewriting inputs',()=>{
 const months=Array.from({length:6},(_,i)=>({month:`${2015+i}-01`,twsCm:i===2?null:-i}));
 const observations=Array.from({length:6},(_,i)=>({date:`${2015+i}-01-10`,reportedSignedFt:100+i,status:'-'}));
 const wells=[{id:'mock-well',selectedAnnualDates:observations.map(x=>x.date),observations}];
 const before=JSON.stringify({months,wells});
 const r=compareGroundwater(months,wells);
 expect(r.wells[0]!.pairs).toHaveLength(5);expect(r.wells[0]!.graceCmPerYear).toBeCloseTo(-1);expect(r.wells[0]!.wellFtPerYear).toBeCloseTo(1);
 expect(r.wells[0]!.agreement).toBe('disagree');expect(r.note).toContain('Investigate');
 expect(JSON.stringify({months,wells})).toBe(before);
 expect(linearSlope([{x:2015,y:0},{x:2020,y:10}])).toBe(2);
});
