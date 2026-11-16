// Fixture replay, not fresh provider verification. Real saved POWER plus explicitly constructed soil/history.
import { afterEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { parsePower } from '../src/engine/climate';
import type { PowerResponse } from '../src/engine/climate';
import { buildPlan } from '../src/engine/plan';
import { validatePlanRequest } from '../src/worker/routes/api';
import app from '../src/worker/index';
import { makePlan } from '../src/worker/service';

vi.mock('../src/worker/data/power',()=>({getDailyClimate:async()=>parsePower(JSON.parse(readFileSync(new URL('./fixtures/power-finney-county-ks.json',import.meta.url),'utf8')) as PowerResponse)}));
vi.mock('../src/worker/data/daymet',()=>({getDaymet:async()=>null}));
vi.mock('../src/worker/data/soil',()=>({getSoil:async()=>({available:false,source:'Constructed missing-soil test case'})}));
vi.mock('../src/worker/data/cdl',()=>({getCropHistory:async()=>({available:false,source:'Constructed missing-history test case',years:[]})}));
vi.mock('../src/worker/data/geo',()=>({getCounty:async()=>null}));
vi.mock('../src/worker/data/nass',()=>({getNassData:async()=>null}));
vi.mock('../src/worker/data/rma',()=>({getCountyLosses:async()=>null}));
vi.mock('../src/worker/data/openet',()=>({getOpenEt:async()=>null}));
afterEach(()=>vi.useRealTimers());
it('keeps /api/plan bytes equal to the existing pure-engine response with fields off',async()=>{
  const now=new Date('2026-11-15T15:00:00Z');vi.useFakeTimers();vi.setSystemTime(now);
  const input={lat:38.1095,lon:-100.706,priority:'balanced',recentCrops:['corn']};
  const request=validatePlanRequest(input);if(typeof request==='string')throw new Error(request);
  const expected=buildPlan({request,climate:parsePower(JSON.parse(readFileSync(new URL('./fixtures/power-finney-county-ks.json',import.meta.url),'utf8')) as PowerResponse),soil:{available:false,source:'Constructed missing-soil test case'},cropHistory:{available:false,source:'Constructed missing-history test case',years:[]},county:null,nass:null,losses:null,openEt:null,now,planStartYear:2027});
  const ctx={waitUntil:()=>{},passThroughOnException:()=>{},props:{}} as unknown as ExecutionContext;
  const response=await app.request('/api/plan',{method:'POST',headers:{'Content-Type':'application/json','CF-Connecting-IP':'pixelfit-regression'},body:JSON.stringify(input)},{},ctx);
  expect(response.status).toBe(200);
  expect(await response.text()).toBe(JSON.stringify(expected));
  expect(JSON.stringify(await makePlan({FIELDS_ENABLED:'off'},request,{now}))).toBe(JSON.stringify(expected));
  expect(JSON.stringify(await makePlan({FIELDS_ENABLED:'on'},request,{now}))).toBe(JSON.stringify(expected));
});
