import { readFileSync } from 'node:fs';
import { Hono } from 'hono';
import { describe,it,expect,vi,afterEach } from 'vitest';
import app from '../src/worker/index';
import { api } from '../src/worker/routes/api';
import type { Env } from '../src/worker/env';
import * as service from '../src/worker/service';
import { buildPlan } from '../src/engine/plan';
import { parsePower } from '../src/engine/climate';

// Replay a real recorded NASA POWER input through the real engine. Only the
// network service boundary is replaced; the legacy/new Hono routing is real.
const recordedPlan=buildPlan({
  request:{lat:38.1095,lon:-100.706,irrigated:false,priority:'balanced',recentCrops:['corn']},
  climate:parsePower(JSON.parse(readFileSync(new URL('./fixtures/power-finney-county-ks.json',import.meta.url),'utf8'))),
  soil:{available:true,source:'USDA SSURGO',ph:6.4,organicMatterPct:2,awc:0.21,profileDepthCm:200},
  cropHistory:{available:false,source:'recorded replay',years:[]},
  county:{countyFips:'20055',countyName:'Finney County',stateCode:'KS',stateName:'Kansas'},
  now:new Date('2026-11-15T15:00:00Z'),planStartYear:2027,
});
const legacy=new Hono<{Bindings:Env}>().route('/api',api);
afterEach(()=>vi.restoreAllMocks());
describe('disabled boundary feature preserves legacy routing bytes',()=>{
  it('leaves a complete recorded plan response byte-identical',async()=>{
    vi.spyOn(service,'makePlan').mockResolvedValue(recordedPlan);
    for(const env of [{},{FIELDS_ENABLED:'off'},{FIELDS_ENABLED:'ON'}]){
      const init={method:'POST',headers:{'Content-Type':'application/json','CF-Connecting-IP':'fields-regression-plan'},body:JSON.stringify(recordedPlan.request)};
      const ctx={waitUntil:vi.fn(),passThroughOnException:vi.fn(),props:{}};
      const before=await legacy.request('/api/plan',init,env,ctx),after=await app.request('/api/plan',init,env,ctx);
      expect(before.status).toBe(200);expect(after.status).toBe(before.status);
      expect(await after.text()).toBe(await before.text());
    }
  });
  it('leaves the existing demo Field Watch endpoints byte-identical',async()=>{
    for(const path of ['/api/fieldwatch/agent/options','/api/fieldwatch/latest','/api/fieldwatch/runs','/api/fieldwatch/agent/finney-ks/watch']){
      const before=await legacy.request(path,{},{}),after=await app.request(path,{},{});
      expect(after.status).toBe(before.status);
      expect(await after.text()).toBe(await before.text());
    }
  });
});
