import { it, expect, vi, afterEach } from "vitest";
import { discoverSmap, getSmap, validSmapBundle } from "../src/worker/data/smap";
import { smap } from "../src/worker/routes/smap";
import { clearMemoryCache } from "../src/worker/lib/cache";
import { summarizeSmap, type SmapSample } from "../src/engine/smap";
// Minimal handmade network/numeric mocks; real artifact is separately asserted below.
const samples=(year:number,surface=0.2):SmapSample[]=>Array.from({length:8},(_,i)=>({time:`${year}-07-01T${String(i*3+1).padStart(2,'0')}:30:00Z`,surface,rootzone:.4,quality:'accepted'}));
afterEach(()=>{vi.unstubAllGlobals();clearMemoryCache();});
it('requires all slots, rejects duplicates/QA/missing but preserves genuine zero',()=>{
 const all=samples(2022,0);
 expect(summarizeSmap(all,2022,'07-01','07-01',[]).surface.mean).toBe(0);
 for(const rows of [all.slice(1),[...all,all[0]!],all.map((s,i)=>i===0?{...s,quality:'unreviewed' as const}:s)]) expect(summarizeSmap(rows,2022,'07-01','07-01',[]).surface.mean).toBeNull();
 expect(summarizeSmap(samples(2014),2014,'07-01','07-01',[]).rootzone.mean).toBeNull();
 expect(()=>summarizeSmap([],2022,'02-30','03-01',[])).toThrow();
});
it('computes independent anomaly and midrank against ten complete other years',()=>{
 const rows=Array.from({length:11},(_,i)=>samples(2015+i,i===7?.25:i*.05)).flat();
 const e=summarizeSmap(rows,2022,'07-01','07-01',Array.from({length:11},(_,i)=>2015+i));
 expect(e.surface.baseline).toHaveLength(10);expect(e.surface.anomaly).toBeCloseTo(.01);expect(e.surface.percentile).toBe(55);
});
it('serves real fetched Finney artifact and refuses other points',async()=>{
 const r=await getSmap({},38.1095,-100.706,2022);
 expect(r.status).toBe('available');expect(r.evidence.surface.count).toBe(8);
 expect(r.evidence.surface.baseline).toHaveLength(10);expect(r.evidence.surface.percentile).not.toBeNull();
 expect(validSmapBundle(r.bundle)).toBe(true);expect(validSmapBundle({schema:1})).toBe(false);
 expect((await getSmap({},40,-100,2022)).status).toBe('unavailable');
 expect((await smap.request('/?lat=&lon=-100')).status).toBe(400);
});
it('sends bearer in Earthdata header only, caches catalog, and degrades on failure',async()=>{
 const network=vi.fn().mockResolvedValue(new Response(JSON.stringify({feed:{entry:[{id:'mock-catalog'}]}})));
 vi.stubGlobal('fetch',network);
 expect((await discoverSmap({})).status).toBe('not-configured');
 const env={EARTHDATA_TOKEN:'minimal-hand-made-test-credential'};
 expect((await discoverSmap(env)).status).toBe('catalog-only');await discoverSmap(env);
 expect(network).toHaveBeenCalledTimes(1);
 expect(network.mock.calls[0]![0]).not.toContain(env.EARTHDATA_TOKEN);
 expect(network.mock.calls[0]![1].headers.Authorization).toBe('Bearer '+env.EARTHDATA_TOKEN);
 clearMemoryCache();network.mockResolvedValue(new Response('',{status:401}));
 expect((await discoverSmap(env)).status).toBe('unavailable');
});
